-- Hypotheek Tracker – initieel schema
-- Bedragen in centen (bigint), rente als numeric(6,3) in procenten (3.850 = 3,85%).

-- ---------------------------------------------------------------------------
-- Tabellen
-- ---------------------------------------------------------------------------

create table public.mortgages (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name             text not null check (length(trim(name)) > 0),
  mortgage_number  text not null,
  principal_cents  bigint not null check (principal_cents > 0),
  start_date       date not null,
  end_date         date check (end_date is null or end_date > start_date),
  notes            text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create table public.interest_rate_periods (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mortgage_id      uuid not null references public.mortgages (id) on delete cascade,
  rate_percentage  numeric(6, 3) not null check (rate_percentage >= 0 and rate_percentage <= 100),
  effective_date   date not null,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (mortgage_id, effective_date)
);

create table public.payments (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mortgage_id      uuid not null references public.mortgages (id) on delete cascade,
  payment_date     date not null,
  interest_cents   bigint not null default 0 check (interest_cents >= 0),
  principal_cents  bigint not null default 0 check (principal_cents >= 0),
  description      text,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  check (interest_cents > 0 or principal_cents > 0)
);

create index mortgages_user_id_idx on public.mortgages (user_id);
create index interest_rate_periods_mortgage_id_idx on public.interest_rate_periods (mortgage_id, effective_date);
create index payments_mortgage_id_idx on public.payments (mortgage_id, payment_date);
create index interest_rate_periods_user_id_idx on public.interest_rate_periods (user_id);
create index payments_user_id_idx on public.payments (user_id);

-- ---------------------------------------------------------------------------
-- updated_at automatisch bijwerken
-- ---------------------------------------------------------------------------

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger mortgages_updated_at before update on public.mortgages
  for each row execute function public.set_updated_at();
create trigger interest_rate_periods_updated_at before update on public.interest_rate_periods
  for each row execute function public.set_updated_at();
create trigger payments_updated_at before update on public.payments
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security: iedere gebruiker ziet en wijzigt alleen zijn eigen data
-- ---------------------------------------------------------------------------

alter table public.mortgages enable row level security;
alter table public.interest_rate_periods enable row level security;
alter table public.payments enable row level security;

create policy "Eigen hypotheken lezen" on public.mortgages
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigen hypotheken toevoegen" on public.mortgages
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Eigen hypotheken wijzigen" on public.mortgages
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Eigen hypotheken verwijderen" on public.mortgages
  for delete to authenticated using ((select auth.uid()) = user_id);

-- Bij kindtabellen controleren we ook dat de hypotheek van dezelfde gebruiker is,
-- zodat niemand rijen aan andermans hypotheek kan hangen.
create policy "Eigen rentewijzigingen lezen" on public.interest_rate_periods
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigen rentewijzigingen toevoegen" on public.interest_rate_periods
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.mortgages m where m.id = mortgage_id and m.user_id = (select auth.uid()))
  );
create policy "Eigen rentewijzigingen wijzigen" on public.interest_rate_periods
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.mortgages m where m.id = mortgage_id and m.user_id = (select auth.uid()))
  );
create policy "Eigen rentewijzigingen verwijderen" on public.interest_rate_periods
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy "Eigen betalingen lezen" on public.payments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigen betalingen toevoegen" on public.payments
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.mortgages m where m.id = mortgage_id and m.user_id = (select auth.uid()))
  );
create policy "Eigen betalingen wijzigen" on public.payments
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.mortgages m where m.id = mortgage_id and m.user_id = (select auth.uid()))
  );
create policy "Eigen betalingen verwijderen" on public.payments
  for delete to authenticated using ((select auth.uid()) = user_id);
