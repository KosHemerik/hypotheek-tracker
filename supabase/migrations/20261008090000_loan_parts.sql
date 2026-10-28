-- Hypotheek Tracker – leningdelen
-- Een hypotheek bestaat uit één of meer leningdelen, elk met een eigen bedrag, eigen
-- rentehistorie en een afgesproken aflossing per maand (0 = aflossingsvrij / niets
-- afgesproken). Een betaling heeft regels per leningdeel (rente + aflossing).
--
-- Bestaande gegevens: elke hypotheek krijgt één leningdeel "Leningdeel 1" met de oude
-- hoofdsom; rentepercentages en betalingen worden aan dat deel gekoppeld.

-- ---------------------------------------------------------------------------
-- Leningdelen
-- ---------------------------------------------------------------------------

create table public.loan_parts (
  id                      uuid primary key default gen_random_uuid(),
  user_id                 uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mortgage_id             uuid not null references public.mortgages (id) on delete cascade,
  name                    text not null check (length(trim(name)) > 0),
  principal_cents         bigint not null check (principal_cents > 0),
  agreed_repayment_cents  bigint not null default 0 check (agreed_repayment_cents >= 0),
  created_at              timestamptz not null default clock_timestamp(),
  updated_at              timestamptz not null default now(),
  -- Voor samengestelde foreign keys: een rente of betalingsregel hoort bij een deel van
  -- dezelfde hypotheek.
  unique (id, mortgage_id),
  unique (mortgage_id, name)
);

create index loan_parts_mortgage_id_idx on public.loan_parts (mortgage_id);
create index loan_parts_user_id_idx on public.loan_parts (user_id);

create trigger loan_parts_updated_at before update on public.loan_parts
  for each row execute function public.set_updated_at();

alter table public.loan_parts enable row level security;

create policy "Eigen leningdelen lezen" on public.loan_parts
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigen leningdelen toevoegen" on public.loan_parts
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.mortgages m where m.id = mortgage_id and m.user_id = (select auth.uid()))
  );
create policy "Eigen leningdelen wijzigen" on public.loan_parts
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.mortgages m where m.id = mortgage_id and m.user_id = (select auth.uid()))
  );
create policy "Eigen leningdelen verwijderen" on public.loan_parts
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Bestaande hypotheken: één leningdeel met de oude hoofdsom.
insert into public.loan_parts (user_id, mortgage_id, name, principal_cents, created_at, updated_at)
select user_id, id, 'Leningdeel 1', principal_cents, created_at, created_at
from public.mortgages;

-- ---------------------------------------------------------------------------
-- Rente per leningdeel
-- ---------------------------------------------------------------------------

alter table public.interest_rate_periods add column loan_part_id uuid;

update public.interest_rate_periods r
set loan_part_id = lp.id
from public.loan_parts lp
where lp.mortgage_id = r.mortgage_id;

alter table public.interest_rate_periods
  alter column loan_part_id set not null,
  add constraint interest_rate_periods_loan_part_fk
    foreign key (loan_part_id, mortgage_id) references public.loan_parts (id, mortgage_id) on delete cascade,
  drop constraint interest_rate_periods_mortgage_id_effective_date_key,
  add constraint interest_rate_periods_loan_part_id_effective_date_key unique (loan_part_id, effective_date);

create index interest_rate_periods_loan_part_id_idx on public.interest_rate_periods (loan_part_id, effective_date);

-- ---------------------------------------------------------------------------
-- Betalingsregels per leningdeel
-- ---------------------------------------------------------------------------

alter table public.payments add constraint payments_id_mortgage_id_key unique (id, mortgage_id);

create table public.payment_lines (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  payment_id       uuid not null,
  mortgage_id      uuid not null,
  loan_part_id     uuid not null,
  interest_cents   bigint not null default 0 check (interest_cents >= 0),
  principal_cents  bigint not null default 0 check (principal_cents >= 0),
  created_at       timestamptz not null default now(),
  foreign key (payment_id, mortgage_id) references public.payments (id, mortgage_id) on delete cascade,
  -- "no action" (geen restrict): een leningdeel met betalingen kan niet los verwijderd
  -- worden, maar verwijderen van de hele hypotheek cascadeert gewoon.
  foreign key (loan_part_id, mortgage_id) references public.loan_parts (id, mortgage_id),
  unique (payment_id, loan_part_id),
  check (interest_cents > 0 or principal_cents > 0)
);

create index payment_lines_payment_id_idx on public.payment_lines (payment_id);
create index payment_lines_loan_part_id_idx on public.payment_lines (loan_part_id);
create index payment_lines_user_id_idx on public.payment_lines (user_id);

alter table public.payment_lines enable row level security;

create policy "Eigen betalingsregels lezen" on public.payment_lines
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigen betalingsregels toevoegen" on public.payment_lines
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.payments p where p.id = payment_id and p.user_id = (select auth.uid()))
  );
create policy "Eigen betalingsregels wijzigen" on public.payment_lines
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.payments p where p.id = payment_id and p.user_id = (select auth.uid()))
  );
create policy "Eigen betalingsregels verwijderen" on public.payment_lines
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Bestaande betalingen: één regel voor het (enige) leningdeel van de hypotheek.
insert into public.payment_lines
  (user_id, payment_id, mortgage_id, loan_part_id, interest_cents, principal_cents, created_at)
select p.user_id, p.id, p.mortgage_id, lp.id, p.interest_cents, p.principal_cents, p.created_at
from public.payments p
join public.loan_parts lp on lp.mortgage_id = p.mortgage_id;

-- Bedragen staan nu in de regels en de hoofdsom in de leningdelen.
alter table public.payments drop column interest_cents, drop column principal_cents;
alter table public.mortgages drop column principal_cents;

-- ---------------------------------------------------------------------------
-- Functies: in één transactie opslaan (security invoker: RLS blijft gelden)
-- ---------------------------------------------------------------------------

-- Hypotheek + leningdelen + per deel een rentepercentage vanaf de startdatum.
create function public.create_mortgage(p_mortgage jsonb, p_parts jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
  v_start date;
  v_part jsonb;
  v_part_id uuid;
begin
  if jsonb_array_length(coalesce(p_parts, '[]'::jsonb)) = 0 then
    raise exception 'Een hypotheek heeft minimaal één leningdeel.';
  end if;

  insert into public.mortgages (entity_id, name, mortgage_number, start_date, end_date, notes)
  values (
    (p_mortgage ->> 'entity_id')::uuid,
    p_mortgage ->> 'name',
    p_mortgage ->> 'mortgage_number',
    (p_mortgage ->> 'start_date')::date,
    nullif(p_mortgage ->> 'end_date', '')::date,
    p_mortgage ->> 'notes'
  )
  returning id, start_date into v_id, v_start;

  for v_part in select value from jsonb_array_elements(p_parts) loop
    insert into public.loan_parts (mortgage_id, name, principal_cents, agreed_repayment_cents, created_at)
    values (
      v_id,
      v_part ->> 'name',
      (v_part ->> 'principal_cents')::bigint,
      coalesce((v_part ->> 'agreed_repayment_cents')::bigint, 0),
      clock_timestamp()
    )
    returning id into v_part_id;

    insert into public.interest_rate_periods (mortgage_id, loan_part_id, rate_percentage, effective_date)
    values (v_id, v_part_id, (v_part ->> 'rate_percentage')::numeric, v_start);
  end loop;

  return v_id;
end;
$$;

-- Nieuw leningdeel bij een bestaande hypotheek, met rente vanaf de startdatum.
create function public.create_loan_part(p_mortgage_id uuid, p_part jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_start date;
  v_part_id uuid;
begin
  select start_date into v_start from public.mortgages where id = p_mortgage_id;
  if v_start is null then
    raise exception 'Hypotheek niet gevonden.';
  end if;

  insert into public.loan_parts (mortgage_id, name, principal_cents, agreed_repayment_cents)
  values (
    p_mortgage_id,
    p_part ->> 'name',
    (p_part ->> 'principal_cents')::bigint,
    coalesce((p_part ->> 'agreed_repayment_cents')::bigint, 0)
  )
  returning id into v_part_id;

  insert into public.interest_rate_periods (mortgage_id, loan_part_id, rate_percentage, effective_date)
  values (p_mortgage_id, v_part_id, (p_part ->> 'rate_percentage')::numeric, v_start);

  return v_part_id;
end;
$$;

-- Betaling aanmaken (p_id null) of bijwerken, met al zijn regels.
create function public.save_payment(
  p_id uuid,
  p_mortgage_id uuid,
  p_date date,
  p_description text,
  p_lines jsonb
)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if jsonb_array_length(coalesce(p_lines, '[]'::jsonb)) = 0 then
    raise exception 'Een betaling heeft minimaal één bedrag nodig.';
  end if;

  if p_id is null then
    insert into public.payments (mortgage_id, payment_date, description)
    values (p_mortgage_id, p_date, p_description)
    returning id into v_id;
  else
    update public.payments
    set payment_date = p_date, description = p_description
    where id = p_id and mortgage_id = p_mortgage_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Betaling niet gevonden.';
    end if;
    delete from public.payment_lines where payment_id = v_id;
  end if;

  insert into public.payment_lines (payment_id, mortgage_id, loan_part_id, interest_cents, principal_cents)
  select
    v_id,
    p_mortgage_id,
    (line ->> 'loan_part_id')::uuid,
    coalesce((line ->> 'interest_cents')::bigint, 0),
    coalesce((line ->> 'principal_cents')::bigint, 0)
  from jsonb_array_elements(p_lines) as line;

  return v_id;
end;
$$;

revoke execute on function public.create_mortgage(jsonb, jsonb) from public, anon;
revoke execute on function public.create_loan_part(uuid, jsonb) from public, anon;
revoke execute on function public.save_payment(uuid, uuid, date, text, jsonb) from public, anon;
grant execute on function public.create_mortgage(jsonb, jsonb) to authenticated;
grant execute on function public.create_loan_part(uuid, jsonb) to authenticated;
grant execute on function public.save_payment(uuid, uuid, date, text, jsonb) to authenticated;
