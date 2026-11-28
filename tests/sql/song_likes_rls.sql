-- Test against the disposable fixture only; no real users or data are touched.
set role anon;
do $$
begin
  begin
    perform count(*) from public.song_likes;
    raise exception 'anonymous access unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
end $$;
reset role;
set role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
do $$
begin
  if (select count(*) from public.song_likes) <> 0 then raise exception 'new user is not empty'; end if;
  insert into public.song_likes (user_id, song_id) values
    (auth.uid(), '20000000-0000-0000-0000-000000000001'),
    (auth.uid(), '20000000-0000-0000-0000-000000000002');
  if (select count(*) from public.song_likes) <> 2 then raise exception 'owner cannot see likes'; end if;
  begin
    insert into public.song_likes (user_id, song_id) values
      (auth.uid(), '20000000-0000-0000-0000-000000000001');
    raise exception 'duplicate like unexpectedly allowed';
  exception when unique_violation then null;
  end;
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', false);
do $$
begin
  if (select count(*) from public.song_likes) <> 0 then raise exception 'another user can read likes'; end if;
  begin
    insert into public.song_likes (user_id, song_id) values
      ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001');
    raise exception 'cross-user insert unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.song_likes (user_id, song_id) values
      (auth.uid(), '20000000-0000-0000-0000-000000000002');
    raise exception 'like of another user private song unexpectedly allowed';
  exception when insufficient_privilege then null;
  end;
  delete from public.song_likes where user_id = '10000000-0000-0000-0000-000000000001';
end $$;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', false);
do $$
begin
  if (select count(*) from public.song_likes) <> 2 then raise exception 'another user deleted likes'; end if;
  delete from public.song_likes where user_id = auth.uid();
  if (select count(*) from public.song_likes) <> 0 then raise exception 'unlike did not empty collection'; end if;
end $$;
reset role;
