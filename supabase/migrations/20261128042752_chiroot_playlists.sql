-- Additive owner-managed playlists. Public items are visible only while the
-- underlying song is public; private items never escape through a playlist.
create table public.playlists (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100 and char_length(name) <= 100),
  visibility text not null default 'private' check (visibility in ('public', 'private')),
  creator_name text not null default 'Pengguna Chiroot',
  creator_image text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index playlists_public_created_idx on public.playlists (created_at desc, id) where visibility = 'public';
create index playlists_owner_created_idx on public.playlists (owner_id, created_at desc);

create table public.playlist_items (
  id uuid primary key default gen_random_uuid(),
  playlist_id uuid not null references public.playlists(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  added_by uuid not null references auth.users(id) on delete cascade,
  added_at timestamptz not null default now(),
  position bigint not null check (position > 0),
  unique (playlist_id, song_id),
  unique (playlist_id, position)
);
create index playlist_items_song_idx on public.playlist_items (song_id);

-- Read only public profile fields; never expose profiles.email via playlists.
create function public.playlist_set_creator() returns trigger
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
begin
  select coalesce(nullif(btrim(p.display_name), ''), 'Pengguna Chiroot'), p.pfp
    into new.creator_name, new.creator_image from public.profiles p where p.id = new.owner_id;
  if not found then new.creator_name := 'Pengguna Chiroot'; new.creator_image := null; end if;
  return new;
end $$;
revoke all on function public.playlist_set_creator() from public;
create trigger playlist_creator before insert on public.playlists
  for each row execute function public.playlist_set_creator();

alter table public.playlists enable row level security;
alter table public.playlist_items enable row level security;
revoke all on public.playlists, public.playlist_items from anon, authenticated;
grant select on public.playlists, public.playlist_items to anon, authenticated;
grant insert (owner_id, name, visibility), update (name, visibility), delete on public.playlists to authenticated;
grant delete on public.playlist_items to authenticated;
create policy playlists_read on public.playlists for select to anon, authenticated
  using (visibility = 'public' or owner_id = auth.uid());
create policy playlists_insert_own on public.playlists for insert to authenticated
  with check (owner_id = auth.uid());
create policy playlists_update_own on public.playlists for update to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy playlists_delete_own on public.playlists for delete to authenticated
  using (owner_id = auth.uid());
create policy playlist_items_read on public.playlist_items for select to anon, authenticated
  using (exists (select 1 from public.playlists p join public.songs s on s.id = playlist_items.song_id
    where p.id = playlist_items.playlist_id and
      ((p.owner_id = auth.uid() and (s.visibility = 'public' or s.owner_id = auth.uid()))
       or (p.visibility = 'public' and s.visibility = 'public'))));
create policy playlist_items_delete_own on public.playlist_items for delete to authenticated
  using (exists (select 1 from public.playlists p where p.id = playlist_items.playlist_id and p.owner_id = auth.uid()));

-- Serialise additions using a parent row lock so concurrent additions have a
-- unique stable position. No client can insert directly or impersonate added_by.
create function public.playlist_add_song(p_playlist_id uuid, p_song_id uuid) returns public.playlist_items
language plpgsql security definer set search_path = pg_catalog, public, auth as $$
declare result public.playlist_items; next_position bigint; caller uuid := auth.uid();
begin
  if caller is null then raise exception 'Login diperlukan' using errcode = '42501'; end if;
  perform 1 from public.playlists where id = p_playlist_id and owner_id = caller for update;
  if not found then raise exception 'Playlist tidak ditemukan atau bukan milikmu' using errcode = '42501'; end if;
  if not exists (select 1 from public.songs where id = p_song_id and (visibility = 'public' or owner_id = caller)) then
    raise exception 'Lagu tidak tersedia' using errcode = '42501';
  end if;
  select coalesce(max(position), 0) + 1 into next_position from public.playlist_items where playlist_id = p_playlist_id;
  insert into public.playlist_items (playlist_id, song_id, added_by, position)
    values (p_playlist_id, p_song_id, caller, next_position) returning * into result;
  return result;
end $$;
revoke all on function public.playlist_add_song(uuid, uuid) from public, anon;
grant execute on function public.playlist_add_song(uuid, uuid) to authenticated;
