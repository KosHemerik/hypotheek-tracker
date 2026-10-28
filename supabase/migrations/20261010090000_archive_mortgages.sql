-- Hypotheek Tracker – leningen archiveren
-- Een gearchiveerde lening blijft volledig bewaard (betalingen, rente, documenten), maar
-- staat standaard niet meer op het dashboard. `null` = actief.

alter table public.mortgages add column archived_at timestamptz;
