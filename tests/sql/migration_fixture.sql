-- Minimal test-only substitute for the pre-existing Supabase schema.
-- This is not a complete Supabase bootstrap and must never run on production.
create role authenticated nologin;
create role anon nologin;
create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth, public to authenticated, anon;
grant execute on function auth.uid() to authenticated, anon;
create table public.profiles (id uuid primary key references auth.users(id), display_name text, pfp text);
create table public.songs (
  id uuid primary key,
  owner_id uuid not null references auth.users(id),
  visibility text not null check (visibility in ('public', 'private'))
);
alter table public.songs enable row level security;
grant select on public.songs to authenticated, anon;
create policy test_song_read on public.songs for select to authenticated, anon
  using (visibility = 'public' or owner_id = auth.uid());
insert into auth.users values
  ('10000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002');
insert into public.profiles values ('10000000-0000-0000-0000-000000000001', 'User One', null), ('10000000-0000-0000-0000-000000000002', 'User Two', null);
insert into public.songs values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'public'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000001', 'private');
