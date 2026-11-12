-- Keep the previous generator for its existing stable scenarios.
alter function public.emit_simulated_reading(uuid,uuid,uuid,text) rename to emit_stable_simulated_reading;
revoke all on function public.emit_stable_simulated_reading(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
create table private.simulation_scenarios (
 device_id uuid not null references public.devices(id),message_id uuid not null,scenario text not null,
 primary key(device_id,message_id)
);
revoke all on private.simulation_scenarios from public,anon,authenticated;
create function public.emit_simulated_reading(p_device_id uuid,p_expected_assignment_id uuid,p_message_id uuid,p_scenario text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.devices; previous public.telemetry; stored_scenario text; token_hash text; payload jsonb; metrics jsonb; result jsonb;
begin
 if p_scenario is null or p_scenario not in ('normal','fall','battery','rest','movement','high-pulse','low-oxygen','partial','device-test','recovery') then raise exception 'invalid scenario' using errcode='22023'; end if;
 if auth.uid() is null or not public.can_manage_device_profile(p_device_id) then raise exception 'access denied' using errcode='42501'; end if;
 select * into d from public.devices where id=p_device_id for update;
 if d.id is null or not d.enabled or not public.can_manage_device_profile(d.id) then raise exception 'access denied' using errcode='42501'; end if;
 if d.telemetry_source<>'simulated' or p_message_id is null then raise exception 'simulated source required' using errcode='22023'; end if;
 if d.assignment_id is distinct from p_expected_assignment_id then raise exception 'assignment changed' using errcode='40001'; end if;
 if d.person_id is not null and not exists(select 1 from public.people where id=d.person_id and consent_recorded_at is not null) then raise exception 'consent required' using errcode='42501'; end if;
 select scenario into stored_scenario from private.simulation_scenarios where device_id=d.id and message_id=p_message_id;
 if stored_scenario is not null and stored_scenario<>p_scenario then raise exception 'scenario conflict' using errcode='22023'; end if;
 if p_scenario in ('normal','fall','battery') then
  result:=public.emit_stable_simulated_reading(p_device_id,p_expected_assignment_id,p_message_id,p_scenario);
 else
  select * into previous from public.telemetry where device_id=d.id and message_id=p_message_id;
  if previous.id is not null then
   if previous.assignment_id is distinct from d.assignment_id or stored_scenario is null then raise exception 'scenario conflict' using errcode='22023'; end if;
   return jsonb_build_object('status',200,'accepted',true,'duplicate',true,'received_at',previous.received_at);
  end if;
  select c.token_hash into token_hash from private.device_credentials c where device_id=d.id and revoked_at is null;
  if token_hash is null then return jsonb_build_object('status',401,'error','unauthorized'); end if;
  metrics:=jsonb_build_object('heart_rate_bpm',case p_scenario when 'rest' then 64 when 'movement' then 92 when 'high-pulse' then 120 else 72 end,
   'spo2_percent',case when p_scenario='low-oxygen' then 92 else 98 end,'temperature_c',36.5,'battery_percent',85,'accelerometer',null,'gyroscope',null);
  if p_scenario='partial' then metrics:=metrics||'{"heart_rate_bpm":null,"spo2_percent":null}'::jsonb; end if;
  if p_scenario='movement' then metrics:=metrics||'{"accelerometer":{"x":1.2,"y":0.8,"z":9.8,"unit":"m/s2"}}'::jsonb; end if;
  payload:=jsonb_build_object('schema_version',1,'device_code',d.code,'message_id',p_message_id,'recorded_at',clock_timestamp(),'metrics',metrics,
   'event',case when p_scenario='device-test' then 'device_test' else null end);
  result:=public.ingest_telemetry(payload,token_hash,120);
 end if;
 if result->>'status'='200' then insert into private.simulation_scenarios values(d.id,p_message_id,p_scenario) on conflict do nothing; end if;
 return result;
end;
$$;
revoke all on function public.emit_simulated_reading(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.emit_simulated_reading(uuid,uuid,uuid,text) to authenticated;
-- Rebind the old signature to the new guarded generator.
create or replace function public.emit_simulated_reading(p_device_id uuid,p_expected_assignment_id uuid,p_message_id uuid) returns jsonb
language sql security definer set search_path='' as $$ select public.emit_simulated_reading(p_device_id,p_expected_assignment_id,p_message_id,'normal'); $$;
notify pgrst,'reload schema';
