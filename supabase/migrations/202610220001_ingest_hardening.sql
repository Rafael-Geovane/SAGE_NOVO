-- Preserve the transactional implementation while rejecting bad credentials
-- before they can contend for the device's row lock. It revalidates under lock.
alter function public.ingest_telemetry(jsonb,text,integer) set schema private;
revoke all on function private.ingest_telemetry(jsonb,text,integer) from public,anon,authenticated,service_role;

create function public.ingest_telemetry(p_payload jsonb,p_token_hash text,p_limit integer default 120)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if jsonb_typeof(p_payload) is distinct from 'object' then
  return jsonb_build_object('status',400,'error','invalid_payload');
 end if;
 if not exists(
  select 1 from public.devices d join private.device_credentials c on c.device_id=d.id
  where d.code=p_payload->>'device_code' and c.token_hash=p_token_hash and c.revoked_at is null
 ) then return jsonb_build_object('status',401,'error','unauthorized'); end if;
 return private.ingest_telemetry(p_payload,p_token_hash,p_limit);
end;
$$;
revoke all on function public.ingest_telemetry(jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.ingest_telemetry(jsonb,text,integer) to service_role;

-- Reassignment already locks device -> links. Match that order when revoking;
-- a row-level link trigger cannot obtain the parent lock before its own row.
create function public.revoke_caregiver_link(target uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare parent uuid;
begin
 if not public.is_admin() then raise exception 'access denied' using errcode='42501'; end if;
 select device_id into parent from public.caregiver_device_links where id=target;
 if parent is null then raise exception 'access denied' using errcode='42501'; end if;
 perform 1 from public.devices where id=parent for update;
 update public.caregiver_device_links set revoked_at=clock_timestamp()
 where id=target and revoked_at is null;
 return jsonb_build_object('success',true);
end;
$$;
revoke all on function public.revoke_caregiver_link(uuid) from public,anon,service_role;
grant execute on function public.revoke_caregiver_link(uuid) to authenticated;
revoke update on public.caregiver_device_links from authenticated;
revoke update(revoked_at) on public.caregiver_device_links from authenticated;

-- Technical recovery takes device -> alert locks. Human triage must match it:
-- history inserts also acquire a device foreign-key lock.
create or replace function public.triage_alert(target uuid,new_status text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.alerts;
begin
 select * into a from public.alerts where id=target;
 if a.id is null or not public.can_view_assignment(a.device_id,a.person_id,a.assignment_id) then
  raise exception 'access denied' using errcode='42501';
 end if;
 perform 1 from public.devices where id=a.device_id for update;
 select * into a from public.alerts where id=target for update;
 if a.id is null or not public.can_view_assignment(a.device_id,a.person_id,a.assignment_id) then
  raise exception 'access denied' using errcode='42501';
 end if;
 if new_status is null or new_status not in ('new','acknowledged','resolved') then
  raise exception 'invalid status' using errcode='22023';
 end if;
 if new_status=a.status then return; end if;
 update public.alerts set status=new_status,triaged_by=auth.uid(),triaged_at=clock_timestamp() where id=target;
end;
$$;
revoke all on function public.triage_alert(uuid,text) from public,anon,service_role;
grant execute on function public.triage_alert(uuid,text) to authenticated;

notify pgrst, 'reload schema';
