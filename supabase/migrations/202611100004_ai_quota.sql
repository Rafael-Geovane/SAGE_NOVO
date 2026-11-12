create table private.ai_request_windows (
 profile_id uuid primary key references public.profiles(id),
 window_started timestamptz not null,
 attempts integer not null
);
revoke all on private.ai_request_windows from public,anon,authenticated;
create function public.reserve_weekly_ai_request(p_device_id uuid,p_expected_assignment_id uuid) returns boolean
language plpgsql security definer set search_path='' as $$
declare w private.ai_request_windows;
begin
 if auth.uid() is null or not exists(select 1 from public.demo_subscriptions where profile_id=auth.uid() and plan='premium') or not public.can_view_device(p_device_id) then raise exception 'access denied' using errcode='42501'; end if;
 if not exists(select 1 from public.devices where id=p_device_id and assignment_id=p_expected_assignment_id) then raise exception 'assignment changed' using errcode='40001'; end if;
 insert into private.ai_request_windows values(auth.uid(),clock_timestamp(),0) on conflict do nothing;
 select * into w from private.ai_request_windows where profile_id=auth.uid() for update;
 if w.window_started < clock_timestamp()-interval '1 minute' then
  update private.ai_request_windows set window_started=clock_timestamp(),attempts=1 where profile_id=auth.uid(); return true;
 end if;
 if w.attempts>=3 then return false; end if;
 update private.ai_request_windows set attempts=attempts+1 where profile_id=auth.uid(); return true;
end;
$$;
revoke all on function public.reserve_weekly_ai_request(uuid,uuid) from public,anon,authenticated;
grant execute on function public.reserve_weekly_ai_request(uuid,uuid) to authenticated;
notify pgrst,'reload schema';
