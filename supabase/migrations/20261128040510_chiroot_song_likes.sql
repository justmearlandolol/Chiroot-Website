-- A like is private to its author. A song must be visible at the time of
-- insertion; the songs table's own RLS continues to govern joined reads.
create table public.song_likes (
  user_id uuid not null references auth.users(id) on delete cascade,
  song_id uuid not null references public.songs(id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (user_id, song_id)
);
create index song_likes_user_added_idx on public.song_likes (user_id, added_at desc);
alter table public.song_likes enable row level security;
grant select, insert, delete on public.song_likes to authenticated;
create policy song_likes_select_own on public.song_likes for select to authenticated
  using (user_id = auth.uid());
create policy song_likes_insert_own on public.song_likes for insert to authenticated
  with check (user_id = auth.uid() and exists (
    select 1 from public.songs s where s.id = song_id
      and (s.visibility = 'public' or s.owner_id = auth.uid())
  ));
create policy song_likes_delete_own on public.song_likes for delete to authenticated
  using (user_id = auth.uid());
