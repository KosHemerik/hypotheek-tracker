-- Hypotheek Tracker – bankkoppeling (Enable Banking, alleen lezen)
-- Per entiteit maximaal één gekoppelde bankrekening. Transacties worden opgehaald door de
-- Edge Function `bank` (die als enige de Enable Banking-sleutel kent) en hier opgeslagen.
-- Een transactie kan aan een betaling gekoppeld worden of genegeerd.

-- ---------------------------------------------------------------------------
-- Koppelingen
-- ---------------------------------------------------------------------------

create table public.bank_connections (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null default auth.uid() references auth.users (id) on delete cascade,
  entity_id           uuid not null references public.entities (id) on delete cascade,
  status              text not null default 'pending'
                      check (status in ('pending', 'choose_account', 'active', 'expired', 'revoked', 'error')),
  psu_type            text not null default 'personal' check (psu_type in ('personal', 'business')),
  aspsp_name          text not null default 'Rabobank',
  aspsp_country       text not null default 'NL',
  -- Eenmalige waarde om de terugkeer van de bank aan deze koppeling te koppelen.
  auth_state          text unique,
  session_id          text,
  account_uid         text,
  -- Bij meerdere rekeningen in één toestemming: de keuzelijst (uid, iban, naam).
  available_accounts  jsonb,
  iban                text,
  account_name        text,
  valid_until         timestamptz,
  last_synced_at      timestamptz,
  balance_cents       bigint,
  balance_date        date,
  last_error          text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (entity_id)
);

create index bank_connections_user_id_idx on public.bank_connections (user_id);

create trigger bank_connections_updated_at before update on public.bank_connections
  for each row execute function public.set_updated_at();

alter table public.bank_connections enable row level security;

create policy "Eigen bankkoppelingen lezen" on public.bank_connections
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigen bankkoppelingen toevoegen" on public.bank_connections
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.entities e where e.id = entity_id and e.user_id = (select auth.uid()))
  );
create policy "Eigen bankkoppelingen wijzigen" on public.bank_connections
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.entities e where e.id = entity_id and e.user_id = (select auth.uid()))
  );
create policy "Eigen bankkoppelingen verwijderen" on public.bank_connections
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Transacties
-- ---------------------------------------------------------------------------

create table public.bank_transactions (
  id                 uuid primary key default gen_random_uuid(),
  user_id            uuid not null default auth.uid() references auth.users (id) on delete cascade,
  connection_id      uuid not null references public.bank_connections (id) on delete cascade,
  entity_id          uuid not null references public.entities (id) on delete cascade,
  -- Kenmerk van de bank (of een afgeleide hash) om dubbele import te voorkomen.
  external_id        text not null,
  booking_date       date not null,
  -- Negatief = afschrijving, positief = bijschrijving.
  amount_cents       bigint not null,
  currency           text not null default 'EUR',
  counterparty_name  text,
  counterparty_iban  text,
  description        text,
  payment_id         uuid references public.payments (id) on delete set null,
  ignored            boolean not null default false,
  created_at         timestamptz not null default now(),
  unique (connection_id, external_id)
);

create index bank_transactions_entity_id_idx on public.bank_transactions (entity_id, booking_date desc);
create index bank_transactions_payment_id_idx on public.bank_transactions (payment_id);
create index bank_transactions_user_id_idx on public.bank_transactions (user_id);

alter table public.bank_transactions enable row level security;

create policy "Eigen banktransacties lezen" on public.bank_transactions
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigen banktransacties toevoegen" on public.bank_transactions
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.bank_connections c where c.id = connection_id and c.user_id = (select auth.uid()))
  );
-- Bijwerken (koppelen aan een betaling / negeren): alleen aan een eigen betaling.
create policy "Eigen banktransacties wijzigen" on public.bank_transactions
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and (
      payment_id is null
      or exists (select 1 from public.payments p where p.id = payment_id and p.user_id = (select auth.uid()))
    )
  );
create policy "Eigen banktransacties verwijderen" on public.bank_transactions
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Rekeningnummer van de geldverstrekker per hypotheek
-- ---------------------------------------------------------------------------
-- Alleen afschrijvingen naar dit rekeningnummer worden bij de hypotheek getoond om goed
-- te keuren (als rente en/of aflossing) of te archiveren.

alter table public.mortgages
  add column counterparty_iban text
  check (counterparty_iban is null or counterparty_iban ~ '^[A-Z]{2}[0-9]{2}[A-Z0-9]{8,30}$');

create index bank_transactions_counterparty_idx on public.bank_transactions (entity_id, counterparty_iban);

-- create_mortgage neemt het rekeningnummer voortaan ook mee.
create or replace function public.create_mortgage(p_mortgage jsonb, p_parts jsonb)
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

  insert into public.mortgages (entity_id, name, mortgage_number, start_date, end_date, notes, counterparty_iban)
  values (
    (p_mortgage ->> 'entity_id')::uuid,
    p_mortgage ->> 'name',
    p_mortgage ->> 'mortgage_number',
    (p_mortgage ->> 'start_date')::date,
    nullif(p_mortgage ->> 'end_date', '')::date,
    p_mortgage ->> 'notes',
    nullif(p_mortgage ->> 'counterparty_iban', '')
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

revoke execute on function public.create_mortgage(jsonb, jsonb) from public, anon;
grant execute on function public.create_mortgage(jsonb, jsonb) to authenticated;
