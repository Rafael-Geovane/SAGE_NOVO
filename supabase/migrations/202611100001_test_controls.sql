-- Manual controls are restricted to authorized simulated devices.
create function public.emit_simulated_reading(p_device_id uuid,p_expected_assignment_id uuid,p_message_id uuid,p_scenario text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.devices; previous public.telemetry; token_hash text; payload jsonb;
begin
 if p_scenario is null or p_scenario not in ('normal','fall','battery') then raise exception 'invalid scenario' using errcode='22023'; end if;
 if not public.can_manage_device_profile(p_device_id) then raise exception 'access denied' using errcode='42501'; end if;
 select * into d from public.devices where id=p_device_id for update;
 if d.id is null or not d.enabled or not public.can_manage_device_profile(d.id) then raise exception 'access denied' using errcode='42501'; end if;
 if d.telemetry_source<>'simulated' or p_message_id is null then raise exception 'simulated source required' using errcode='22023'; end if;
 if d.assignment_id is distinct from p_expected_assignment_id then raise exception 'assignment changed' using errcode='40001'; end if;
 if d.person_id is not null and not exists(select 1 from public.people where id=d.person_id and consent_recorded_at is not null) then raise exception 'consent required' using errcode='42501'; end if;
 select * into previous from public.telemetry where device_id=d.id and message_id=p_message_id;
 if previous.id is not null then
  if previous.assignment_id is distinct from d.assignment_id then raise exception 'assignment changed' using errcode='40001'; end if;
  if (previous.event is not distinct from 'fall_detected') <> (p_scenario='fall') or (previous.metrics->>'battery_percent'='15') <> (p_scenario='battery') then raise exception 'scenario conflict' using errcode='22023'; end if;
  return jsonb_build_object('status',200,'accepted',true,'duplicate',true,'received_at',previous.received_at);
 end if;
 select c.token_hash into token_hash from private.device_credentials c where device_id=d.id and revoked_at is null;
 if token_hash is null then return jsonb_build_object('status',401,'error','unauthorized'); end if;
 payload:=jsonb_build_object('schema_version',1,'device_code',d.code,'message_id',p_message_id,'recorded_at',clock_timestamp(),
  'event',case when p_scenario='fall' then 'fall_detected' else null end,
  'metrics',jsonb_build_object('heart_rate_bpm',70+floor(random()*7),'spo2_percent',97+floor(random()*3),'temperature_c',36.5,
  'battery_percent',case when p_scenario='battery' then 15 else 85 end,'accelerometer',null,'gyroscope',null));
 return public.ingest_telemetry(payload,token_hash,120);
end;
$$;
revoke all on function public.emit_simulated_reading(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.emit_simulated_reading(uuid,uuid,uuid,text) to authenticated;
create or replace function public.emit_simulated_reading(p_device_id uuid,p_expected_assignment_id uuid,p_message_id uuid) returns jsonb
language sql security definer set search_path='' as $$
 select public.emit_simulated_reading(p_device_id,p_expected_assignment_id,p_message_id,'normal');
$$;
notify pgrst,'reload schema';
