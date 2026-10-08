-- Wijnkast Amsteldijk — Supabase-schema
-- Plak dit in Supabase > SQL Editor en klik Run.
-- Onderaan staan de e-mailadressen die mogen inloggen; voeg daar iemand toe als dat nodig is.

-- 1. Alle data: één tabel met JSON-documenten per collectie
create table if not exists public.docs (
  collection text not null,
  id         text not null,
  data       jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, id)
);

-- 2. Wie mag erbij
create table if not exists public.allowed_users (
  email text primary key
);

create or replace function public.is_allowed() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.allowed_users where lower(email) = lower(auth.jwt() ->> 'email'));
$$;

alter table public.docs enable row level security;
alter table public.allowed_users enable row level security;

drop policy if exists "docs_select" on public.docs;
drop policy if exists "docs_insert" on public.docs;
drop policy if exists "docs_update" on public.docs;
drop policy if exists "docs_delete" on public.docs;
create policy "docs_select" on public.docs for select to authenticated using (public.is_allowed());
create policy "docs_insert" on public.docs for insert to authenticated with check (public.is_allowed());
create policy "docs_update" on public.docs for update to authenticated using (public.is_allowed()) with check (public.is_allowed());
create policy "docs_delete" on public.docs for delete to authenticated using (public.is_allowed());

-- 3. Live bijwerken tussen apparaten
do $$ begin
  alter publication supabase_realtime add table public.docs;
exception when duplicate_object then null; end $$;

-- 4. Opslag voor etiketfoto's (publiek leesbaar via onvoorspelbare bestandsnaam, alleen toegestane gebruikers uploaden)
insert into storage.buckets (id, name, public) values ('etiketten', 'etiketten', true)
on conflict (id) do nothing;

drop policy if exists "etiketten_upload" on storage.objects;
drop policy if exists "etiketten_delete" on storage.objects;
create policy "etiketten_upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'etiketten' and public.is_allowed());
create policy "etiketten_delete" on storage.objects for delete to authenticated
  using (bucket_id = 'etiketten' and public.is_allowed());

-- 5. Toegestane gebruikers — PAS AAN
insert into public.allowed_users (email) values
  ('bastiaan.stultjens@gmail.com'),
  ('viviandegroot2000@gmail.com')
on conflict do nothing;
