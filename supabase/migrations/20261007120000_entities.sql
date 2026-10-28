-- Hypotheek Tracker – entiteiten (bijv. privé en BV's)
-- Elke hypotheek hoort bij precies één entiteit. In de app kies je een entiteit en zie je
-- alleen de hypotheken (en betalingen, rente, documenten) van die entiteit.

-- ---------------------------------------------------------------------------
-- Tabel
-- ---------------------------------------------------------------------------

create table public.entities (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name        text not null check (length(trim(name)) > 0),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, name)
);

create index entities_user_id_idx on public.entities (user_id);

create trigger entities_updated_at before update on public.entities
  for each row execute function public.set_updated_at();

alter table public.entities enable row level security;

create policy "Eigen entiteiten lezen" on public.entities
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigen entiteiten toevoegen" on public.entities
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "Eigen entiteiten wijzigen" on public.entities
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "Eigen entiteiten verwijderen" on public.entities
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Hypotheken koppelen aan een entiteit
-- ---------------------------------------------------------------------------

-- `restrict`: een entiteit met hypotheken kan niet per ongeluk verwijderd worden.
alter table public.mortgages
  add column entity_id uuid references public.entities (id) on delete restrict;

create index mortgages_entity_id_idx on public.mortgages (entity_id);

-- Startsituatie: drie entiteiten per bestaande gebruiker; alle bestaande hypotheken
-- horen bij K.B. Hemerik. (created_at bepaalt de volgorde in het keuzemenu.)
insert into public.entities (user_id, name, created_at, updated_at)
select u.id, v.name, now() + v.pos * interval '1 millisecond', now() + v.pos * interval '1 millisecond'
from auth.users u
cross join (values (0, 'K.B. Hemerik'), (1, 'Stevig Vastgoed B.V.'), (2, 'Basko B.V.')) as v (pos, name)
on conflict (user_id, name) do nothing;

update public.mortgages m
set entity_id = e.id
from public.entities e
where e.user_id = m.user_id
  and e.name = 'K.B. Hemerik'
  and m.entity_id is null;

alter table public.mortgages alter column entity_id set not null;

-- Een hypotheek mag alleen aan een eigen entiteit hangen.
drop policy "Eigen hypotheken toevoegen" on public.mortgages;
drop policy "Eigen hypotheken wijzigen" on public.mortgages;

create policy "Eigen hypotheken toevoegen" on public.mortgages
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.entities e where e.id = entity_id and e.user_id = (select auth.uid()))
  );
create policy "Eigen hypotheken wijzigen" on public.mortgages
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.entities e where e.id = entity_id and e.user_id = (select auth.uid()))
  );
