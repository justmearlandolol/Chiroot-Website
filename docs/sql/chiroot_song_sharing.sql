-- ============================================================================
-- Chiroot — Public Song Sharing (migrasi `chiroot_public_song_sharing`)
-- ----------------------------------------------------------------------------
-- Script ini SUDAH diterapkan ke project Supabase "Chiroot"
-- (astuagdezahmuuwjoghf) otomatis via connector pada 26 Nov 2026.
--
-- Fungsi file ini:
--   1. Referensi/bukti migrasi (cek docs/AUDIT.md).
--   2. Bisa di-paste ulang di Supabase SQL Editor dengan AMAN — semua statement
--      idempotent (IF NOT EXISTS / drop policy if exists / on conflict do
--      nothing), jadi menjalankannya dua kali tidak akan menduplikasi apa pun.
--
-- Verifikasi cepat (paste di SQL Editor):
--   select count(*) from public.songs;              -- jumlah lagu terdaftar
--   select title, visibility from public.songs;     -- lihat lagu & statusnya
-- ============================================================================

create extension if not exists pg_trgm;

-- 1) Katalog lagu -------------------------------------------------------------
create table if not exists public.songs (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  owner_name text,
  title text not null,
  artist text,
  duration_seconds numeric,
  audio_path text not null,
  cover_path text,
  source_crate_track_id text references public.crate_tracks(id) on delete set null,
  source_bucket text not null default 'chiroot-shared',
  visibility text not null default 'private' check (visibility in ('private','public')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint songs_owner_crate_unique unique (owner_id, source_crate_track_id)
);

create index if not exists songs_public_published_idx on public.songs (published_at desc) where visibility = 'public';
create index if not exists songs_owner_created_idx on public.songs (owner_id, created_at desc);
create index if not exists songs_title_trgm_idx on public.songs using gin (title gin_trgm_ops);

-- 2) Pengaturan user (tema & mode tampilan) -----------------------------------
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  theme text not null default 'dark' check (theme in ('dark','light','system')),
  display_mode text not null default 'gramophone' check (display_mode in ('gramophone','cover')),
  prefs jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

-- 3) Trigger updated_at -------------------------------------------------------
create or replace function public.touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists songs_touch_updated_at on public.songs;
create trigger songs_touch_updated_at before update on public.songs
for each row execute function public.touch_updated_at();

drop trigger if exists user_settings_touch_updated_at on public.user_settings;
create trigger user_settings_touch_updated_at before update on public.user_settings
for each row execute function public.touch_updated_at();

-- 4) Row Level Security -------------------------------------------------------
alter table public.songs enable row level security;
alter table public.user_settings enable row level security;

drop policy if exists "songs read public or own" on public.songs;
create policy "songs read public or own" on public.songs
  for select to public
  using (visibility = 'public' or owner_id = auth.uid());

drop policy if exists "songs insert own" on public.songs;
create policy "songs insert own" on public.songs
  for insert to public
  with check (owner_id = auth.uid());

drop policy if exists "songs update own" on public.songs;
create policy "songs update own" on public.songs
  for update to public
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "songs delete own or admin" on public.songs;
create policy "songs delete own or admin" on public.songs
  for delete to public
  using (owner_id = auth.uid() or is_chiroot_admin());

drop policy if exists "user_settings all own" on public.user_settings;
create policy "user_settings all own" on public.user_settings
  for all to public
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- 5) Storage buckets (additive; bucket lama chiroot-crate tidak diubah) -------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('chiroot-shared', 'chiroot-shared', true, 26214400, array['audio/mpeg','image/jpeg','image/png']::text[]),
  ('chiroot-library', 'chiroot-library', false, 26214400, array['audio/mpeg','image/jpeg','image/png']::text[])
on conflict (id) do nothing;

-- 6) Storage policies ---------------------------------------------------------
-- chiroot-library: private, hanya folder milik sendiri
create policy "chiroot-library insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chiroot-library' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "chiroot-library select own" on storage.objects
  for select to authenticated
  using (bucket_id = 'chiroot-library' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "chiroot-library update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'chiroot-library' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'chiroot-library' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "chiroot-library delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chiroot-library' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "chiroot-library admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'chiroot-library' and is_chiroot_admin())
  with check (bucket_id = 'chiroot-library' and is_chiroot_admin());

-- chiroot-shared: publik boleh baca, tulis hanya folder milik sendiri
create policy "chiroot-shared public read" on storage.objects
  for select to public
  using (bucket_id = 'chiroot-shared');

create policy "chiroot-shared insert own" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'chiroot-shared' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "chiroot-shared update own" on storage.objects
  for update to authenticated
  using (bucket_id = 'chiroot-shared' and (storage.foldername(name))[1] = (auth.uid())::text)
  with check (bucket_id = 'chiroot-shared' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "chiroot-shared delete own" on storage.objects
  for delete to authenticated
  using (bucket_id = 'chiroot-shared' and (storage.foldername(name))[1] = (auth.uid())::text);

create policy "chiroot-shared admin all" on storage.objects
  for all to authenticated
  using (bucket_id = 'chiroot-shared' and is_chiroot_admin())
  with check (bucket_id = 'chiroot-shared' and is_chiroot_admin());

-- 7) Grants -------------------------------------------------------------------
grant select on public.songs to anon;
grant select, insert, update, delete on public.songs to authenticated;
grant select, insert, update, delete on public.user_settings to anon, authenticated;
