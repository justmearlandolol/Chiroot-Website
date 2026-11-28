-- Runs only inside the disposable CI database.
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
insert into public.playlists(owner_id, name, visibility)
values (auth.uid(), repeat('x', 100), 'private');
do $$
declare private_id uuid; public_id uuid;
begin
  begin
    insert into public.playlists(owner_id, name) values (auth.uid(), repeat('x', 101));
    raise exception '101 character name accepted';
  exception when check_violation then null; end;
  select id into private_id from public.playlists where visibility = 'private';
  insert into public.playlists(owner_id, name, visibility) values (auth.uid(), 'Public', 'public') returning id into public_id;
  perform public.playlist_add_song(private_id, '20000000-0000-0000-0000-000000000001');
  perform public.playlist_add_song(public_id, '20000000-0000-0000-0000-000000000001');
  perform public.playlist_add_song(public_id, '20000000-0000-0000-0000-000000000002');
  if (select count(*) from public.playlist_items where playlist_id = public_id) <> 2 then raise exception 'owner cannot see own tracks'; end if;
  if (select array_agg(position order by position) from public.playlist_items where playlist_id = public_id) <> array[1,2]::bigint[] then raise exception 'unstable ordering'; end if;
  update public.playlists set name = 'Renamed' where id = public_id;
  if not exists (select 1 from public.playlists where id = public_id and name = 'Renamed') then raise exception 'owner rename failed'; end if;
  begin
    perform public.playlist_add_song(public_id, '20000000-0000-0000-0000-000000000001');
    raise exception 'duplicate accepted';
  exception when unique_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);
do $$
declare public_id uuid;
begin
  if (select count(*) from public.playlists) <> 1 then raise exception 'private playlist leaked'; end if;
  select id into public_id from public.playlists;
  if (select count(*) from public.playlist_items) <> 1 then raise exception 'private song leaked'; end if;
  begin
    perform public.playlist_add_song(public_id, '20000000-0000-0000-0000-000000000001');
    raise exception 'non-owner added track';
  exception when insufficient_privilege then null; end;
  update public.playlists set name = 'Hacked' where id = public_id;
  if exists (select 1 from public.playlists where id = public_id and name = 'Hacked') then raise exception 'non-owner renamed playlist'; end if;
  delete from public.playlists where id = public_id;
end $$;
reset role;
set role anon;
do $$
begin
  if (select count(*) from public.playlists) <> 1 then raise exception 'public playlist was modified or private leaked'; end if;
  if (select count(*) from public.playlist_items) <> 1 then raise exception 'private item leaked to anon'; end if;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
do $$
declare public_id uuid; private_id uuid;
begin
  select id into public_id from public.playlists where visibility = 'public';
  select id into private_id from public.playlists where visibility = 'private';
  delete from public.playlist_items where playlist_id = public_id and position = 1;
  if (select count(*) from public.playlist_items where playlist_id = public_id) <> 1 then raise exception 'owner could not remove track'; end if;
  delete from public.playlists where id = private_id;
  if exists (select 1 from public.playlists where id = private_id) then raise exception 'owner could not delete playlist'; end if;
end $$;
reset role;
