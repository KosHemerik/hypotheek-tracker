-- Hypotheek Tracker – documenten bij een hypotheek
-- Metadata in public.mortgage_documents, bestanden in de private Storage-bucket
-- `mortgage-documents` onder het pad <user_id>/<mortgage_id>/<document_id>/<bestandsnaam>.

-- ---------------------------------------------------------------------------
-- Metadata
-- ---------------------------------------------------------------------------

create table public.mortgage_documents (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mortgage_id   uuid not null references public.mortgages (id) on delete cascade,
  file_name     text not null check (length(trim(file_name)) > 0),
  mime_type     text not null,
  size_bytes    bigint not null check (size_bytes > 0 and size_bytes <= 20971520), -- max 20 MB
  category      text not null default 'other'
                check (category in ('offer', 'deed', 'valuation', 'annual_statement', 'rate_change', 'other')),
  description   text,
  storage_path  text not null unique,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index mortgage_documents_mortgage_id_idx on public.mortgage_documents (mortgage_id, created_at);
create index mortgage_documents_user_id_idx on public.mortgage_documents (user_id);

create trigger mortgage_documents_updated_at before update on public.mortgage_documents
  for each row execute function public.set_updated_at();

alter table public.mortgage_documents enable row level security;

create policy "Eigen documenten lezen" on public.mortgage_documents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy "Eigen documenten toevoegen" on public.mortgage_documents
  for insert to authenticated with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.mortgages m where m.id = mortgage_id and m.user_id = (select auth.uid()))
    -- Het bestand moet in de eigen map staan.
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );
create policy "Eigen documenten wijzigen" on public.mortgage_documents
  for update to authenticated
  using ((select auth.uid()) = user_id)
  with check (
    (select auth.uid()) = user_id
    and exists (select 1 from public.mortgages m where m.id = mortgage_id and m.user_id = (select auth.uid()))
    and split_part(storage_path, '/', 1) = (select auth.uid())::text
  );
create policy "Eigen documenten verwijderen" on public.mortgage_documents
  for delete to authenticated using ((select auth.uid()) = user_id);

-- ---------------------------------------------------------------------------
-- Storage-bucket (privé: alleen via ingelogde gebruiker / signed URLs)
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit)
values ('mortgage-documents', 'mortgage-documents', false, 20971520)
on conflict (id) do nothing;

-- De eerste map in het pad is de user id: iedere gebruiker kan alleen in zijn eigen map.
create policy "Eigen documentbestanden lezen" on storage.objects
  for select to authenticated
  using (bucket_id = 'mortgage-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Eigen documentbestanden uploaden" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'mortgage-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "Eigen documentbestanden verwijderen" on storage.objects
  for delete to authenticated
  using (bucket_id = 'mortgage-documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
