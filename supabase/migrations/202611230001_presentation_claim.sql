-- Only the two dedicated presentation vests can be claimed without activation.
create table private.presentation_claims (
 device_id uuid primary key references public.devices(id),
 profile_id uuid not null references public.profiles(id),
 claimed_at timestamptz not null default clock_timestamp()
);
alter table private.presentation_claims enable row level security;
revoke all on private.presentation_claims from public,anon,authenticated,service_role;
create function public.claim_presentation_device(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.devices; owner_id uuid; caller uuid:=auth.uid();
begin
 if caller is null or not exists(select 1 from public.profiles where id=caller) then raise exception 'authentication required' using errcode='42501'; end if;
 if p_code is null or p_code not in ('SGE-005','SGE-006') then raise exception 'presentation code required' using errcode='22023'; end if;
 select * into d from public.devices where code=p_code for update;
 if d.id is null or not d.enabled or d.telemetry_source<>'simulated' or d.requires_esp then raise exception 'unavailable' using errcode='42501'; end if;
 if public.can_manage_device_profile(d.id) and d.person_id is not null then return public.lookup_connected_device(p_code); end if;
 select profile_id into owner_id from private.presentation_claims where device_id=d.id;
 if (owner_id is not null and owner_id<>caller) or (d.person_id is not null and not public.can_manage_device_profile(d.id)) then raise exception 'already assigned' using errcode='42501'; end if;
 insert into private.presentation_claims(device_id,profile_id) values(d.id,caller) on conflict(device_id) do nothing;
 insert into private.device_profile_managers(device_id,profile_id,assignment_id) values(d.id,caller,d.assignment_id)
 on conflict(device_id) do update set profile_id=excluded.profile_id,assignment_id=excluded.assignment_id;
 return public.lookup_connected_device(p_code);
end $$;
revoke all on function public.claim_presentation_device(text) from public,anon,authenticated,service_role;
grant execute on function public.claim_presentation_device(text) to authenticated;
