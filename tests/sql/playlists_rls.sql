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
