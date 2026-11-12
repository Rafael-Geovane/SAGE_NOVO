-- Incremental integrity and audit upgrade. Apply only after earlier SAGE migrations.
-- Assignment identities prevent A -> B -> A from disclosing earlier assignments.
alter table public.devices add column assignment_id uuid not null default gen_random_uuid();
alter table public.telemetry add column assignment_id uuid;
alter table public.alerts add column assignment_id uuid;
alter table public.caregiver_device_links add column assignment_id uuid;
update public.telemetry t set assignment_id=case
 when t.person_id is not distinct from d.person_id and t.recorded_at>=d.assigned_at then d.assignment_id
 else gen_random_uuid() end from public.devices d where d.id=t.device_id;
update public.alerts a set assignment_id=case
 when a.person_id is not distinct from d.person_id and a.created_at>=d.assigned_at then d.assignment_id
 else gen_random_uuid() end from public.devices d where d.id=a.device_id;
update public.caregiver_device_links l set assignment_id=d.assignment_id,
 revoked_at=case when l.revoked_at is null and l.created_at<d.assigned_at then clock_timestamp() else l.revoked_at end
 from public.devices d where d.id=l.device_id;
alter table public.telemetry alter column assignment_id set not null;
alter table public.alerts alter column assignment_id set not null;
alter table public.caregiver_device_links alter column assignment_id set not null;
create index telemetry_assignment_recorded on public.telemetry(device_id,assignment_id,recorded_at desc,id desc);
create index alerts_assignment_time on public.alerts(device_id,assignment_id,created_at desc,id desc);
create index telemetry_received on public.telemetry(received_at desc);
create index alerts_created on public.alerts(created_at desc);

create or replace function public.can_view_device(target uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(
  select 1 from public.caregiver_device_links l
  join public.devices d on d.id=l.device_id and d.assignment_id=l.assignment_id
  join public.people p on p.id=d.person_id
  where l.device_id=target and l.caregiver_id=auth.uid() and l.revoked_at is null and p.consent_recorded_at is not null
 );
$$;
create function public.can_view_assignment(target uuid,subject uuid,assignment uuid) returns boolean language sql stable security definer set search_path='' as $$
 select public.is_admin() or (subject is not null and public.can_view_device(target) and exists(
  select 1 from public.devices where id=target and person_id=subject and assignment_id=assignment
 ));
$$;
revoke all on function public.can_view_assignment(uuid,uuid,uuid) from public,anon;
grant execute on function public.can_view_assignment(uuid,uuid,uuid) to authenticated;
drop policy telemetry_read on public.telemetry;
create policy telemetry_read on public.telemetry for select to authenticated using(public.can_view_assignment(device_id,person_id,assignment_id));
drop policy alert_read on public.alerts;
create policy alert_read on public.alerts for select to authenticated using(public.can_view_assignment(device_id,person_id,assignment_id));

create table public.admin_audit_events (
 id bigint generated always as identity primary key,
 actor_id uuid references public.profiles(id), action text not null,
 subject_type text not null check(subject_type in ('device','person','caregiver_link')),
 subject_id uuid not null, occurred_at timestamptz not null default clock_timestamp(),
 details jsonb not null default '{}' check(jsonb_typeof(details)='object')
);
create index admin_audit_subject_time on public.admin_audit_events(subject_type,subject_id,occurred_at desc,id desc);
alter table public.admin_audit_events enable row level security;
revoke all on public.admin_audit_events from public,anon,authenticated,service_role;
grant select on public.admin_audit_events to authenticated;
create policy admin_audit_read on public.admin_audit_events for select to authenticated using(public.is_admin());

create function private.reject_event_mutation() returns trigger language plpgsql set search_path='' as $$
begin raise exception 'audit events are append-only' using errcode='42501'; end;
$$;
create trigger admin_audit_immutable before update or delete on public.admin_audit_events for each row execute function private.reject_event_mutation();

create or replace function private.clear_previous_person() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.person_id is distinct from old.person_id then
  new.assigned_at:=clock_timestamp(); new.assignment_id:=gen_random_uuid();
  new.latest_metrics:=null; new.latest_recorded_at:=null; new.last_received_at:=null;
  update public.caregiver_device_links set revoked_at=clock_timestamp() where device_id=old.id and revoked_at is null;
 end if;
 return new;
end;
$$;
create or replace function private.stamp_person() returns trigger language plpgsql security definer set search_path='' as $$
declare d public.devices;
begin
 select * into d from public.devices where id=new.device_id for share;
 new.person_id:=d.person_id; new.assignment_id:=d.assignment_id;
 if new.recorded_at<d.assigned_at then raise exception 'reading predates current assignment' using errcode='22023'; end if;
 return new;
end;
$$;
create or replace function private.stamp_alert_person() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select person_id,assignment_id into new.person_id,new.assignment_id from public.devices where id=new.device_id for share;
 return new;
end;
$$;
create function private.enforce_link_assignment() returns trigger language plpgsql security definer set search_path='' as $$
declare current_assignment uuid;
begin
 select assignment_id into current_assignment from public.devices where id=new.device_id for share;
 if TG_OP='INSERT' then new.assignment_id:=current_assignment;
 elsif new.revoked_at is null and new.assignment_id is distinct from current_assignment then
  raise exception 'a new assignment requires a new access grant' using errcode='42501';
 end if;
 return new;
end;
$$;
create trigger link_assignment before insert or update on public.caregiver_device_links for each row execute function private.enforce_link_assignment();

create function private.audit_admin_change() returns trigger language plpgsql security definer set search_path='' as $$
declare action_name text; entity text; data jsonb;
begin
 if TG_TABLE_NAME='devices' then
  entity:='device';
  if TG_OP='INSERT' then action_name:='device.created';
  elsif new.person_id is distinct from old.person_id then action_name:='device.reassigned';
  elsif new.enabled is distinct from old.enabled then action_name:=case when new.enabled then 'device.enabled' else 'device.disabled' end;
  elsif new.code is distinct from old.code or new.firmware_version is distinct from old.firmware_version then action_name:='device.updated';
  else return new; end if;
  data:=jsonb_build_object('code',new.code,'enabled',new.enabled,'person_id',new.person_id,'assignment_id',new.assignment_id);
  if TG_OP='UPDATE' then data:=data||jsonb_build_object('previous_person_id',old.person_id,'previous_assignment_id',old.assignment_id); end if;
 elsif TG_TABLE_NAME='people' then
  entity:='person'; action_name:=case when TG_OP='INSERT' then 'person.created' else 'person.updated' end;
  data:=jsonb_build_object('consent_recorded',new.consent_recorded_at is not null);
 else
  entity:='caregiver_link';
  if TG_OP='INSERT' then action_name:='caregiver_link.granted';
  elsif new.revoked_at is not distinct from old.revoked_at then return new;
  else action_name:=case when new.revoked_at is null then 'caregiver_link.restored' else 'caregiver_link.revoked' end; end if;
  data:=jsonb_build_object('device_id',new.device_id,'caregiver_id',new.caregiver_id,'assignment_id',new.assignment_id);
 end if;
 -- Only identifiers and administrative state; never credentials, readings, names, or contacts.
 insert into public.admin_audit_events(actor_id,action,subject_type,subject_id,details) values(auth.uid(),action_name,entity,new.id,data);
 return new;
end;
$$;
create trigger audit_device_changes after insert or update on public.devices for each row execute function private.audit_admin_change();
create trigger audit_person_changes after insert or update on public.people for each row execute function private.audit_admin_change();
create trigger audit_link_changes after insert or update on public.caregiver_device_links for each row execute function private.audit_admin_change();

alter table private.device_credentials add column revoked_at timestamptz;
alter table private.device_credentials add column version integer not null default 1 check(version>0);
create function public.rotate_device_credential(p_device_id uuid,p_token_hash text,p_actor_id uuid,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.device_credentials;
begin
 if not exists(select 1 from public.profiles where id=p_actor_id and role='admin') then raise exception 'administrator required' using errcode='42501'; end if;
 if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or length(coalesce(p_reason,''))>500 then raise exception 'invalid credential request' using errcode='22023'; end if;
 perform 1 from public.devices where id=p_device_id for update;
 if not found then raise exception 'device not found' using errcode='22023'; end if;
 select * into c from private.device_credentials where device_id=p_device_id for update;
 if c.token_hash is not distinct from p_token_hash then raise exception 'replacement credential must be new' using errcode='22023'; end if;
 insert into private.device_credentials(device_id,token_hash,rotated_at,revoked_at,version,window_start,window_count)
 values(p_device_id,p_token_hash,clock_timestamp(),null,1,clock_timestamp(),0)
 on conflict(device_id) do update set token_hash=excluded.token_hash,rotated_at=excluded.rotated_at,revoked_at=null,
 version=private.device_credentials.version+1,window_start=excluded.window_start,window_count=0 returning * into c;
 insert into public.admin_audit_events(actor_id,action,subject_type,subject_id,details)
 values(p_actor_id,'credential.rotated','device',p_device_id,jsonb_build_object('version',c.version,'reason',p_reason));
 return jsonb_build_object('device_id',c.device_id,'version',c.version,'rotated_at',c.rotated_at,'revoked_at',c.revoked_at);
end;
$$;
create function public.revoke_device_credential(p_device_id uuid,p_actor_id uuid,p_reason text default null) returns jsonb language plpgsql security definer set search_path='' as $$
declare c private.device_credentials;
begin
 if not exists(select 1 from public.profiles where id=p_actor_id and role='admin') then raise exception 'administrator required' using errcode='42501'; end if;
 if length(coalesce(p_reason,''))>500 then raise exception 'invalid credential request' using errcode='22023'; end if;
 perform 1 from public.devices where id=p_device_id for update;
 select * into c from private.device_credentials where device_id=p_device_id for update;
 if c.device_id is null then raise exception 'credential not found' using errcode='22023'; end if;
 if c.revoked_at is null then
  update private.device_credentials set revoked_at=clock_timestamp() where device_id=p_device_id returning * into c;
  insert into public.admin_audit_events(actor_id,action,subject_type,subject_id,details)
  values(p_actor_id,'credential.revoked','device',p_device_id,jsonb_build_object('version',c.version,'reason',p_reason));
 end if;
 return jsonb_build_object('device_id',c.device_id,'version',c.version,'rotated_at',c.rotated_at,'revoked_at',c.revoked_at);
end;
$$;
revoke all on function public.rotate_device_credential(uuid,text,uuid,text),public.revoke_device_credential(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.rotate_device_credential(uuid,text,uuid,text),public.revoke_device_credential(uuid,uuid,text) to service_role;

alter table public.alerts add column source_telemetry_id bigint references public.telemetry(id);
create unique index alert_telemetry_source on public.alerts(source_telemetry_id) where source_telemetry_id is not null;
create table public.alert_status_history (
 id bigint generated always as identity primary key,
 alert_id uuid not null references public.alerts(id), device_id uuid not null references public.devices(id),
 person_id uuid references public.people(id), assignment_id uuid not null,
 previous_status text check(previous_status in ('new','acknowledged','resolved')),
 status text not null check(status in ('new','acknowledged','resolved')),
 actor_id uuid references public.profiles(id), source text not null check(source in ('device','user','system','legacy')),
 occurred_at timestamptz not null default clock_timestamp()
);
create index alert_history_page on public.alert_status_history(alert_id,occurred_at,id);
alter table public.alert_status_history enable row level security;
revoke all on public.alert_status_history from public,anon,authenticated,service_role;
grant select on public.alert_status_history to authenticated;
create policy alert_history_read on public.alert_status_history for select to authenticated using(public.can_view_assignment(device_id,person_id,assignment_id));
-- Imported snapshots do not invent an actor or an unrecorded sequence of transitions.
insert into public.alert_status_history(alert_id,device_id,person_id,assignment_id,status,source,occurred_at)
 select id,device_id,person_id,assignment_id,status,'legacy',coalesce(triaged_at,created_at) from public.alerts;
create trigger alert_history_immutable before update or delete on public.alert_status_history for each row execute function private.reject_event_mutation();
create function private.record_alert_status() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.status is not distinct from old.status then return new; end if;
 insert into public.alert_status_history(alert_id,device_id,person_id,assignment_id,previous_status,status,actor_id,source)
 values(new.id,new.device_id,new.person_id,new.assignment_id,
  case when TG_OP='UPDATE' then old.status else null end,new.status,
  case when TG_OP='UPDATE' then auth.uid() else null end,
  case when TG_OP='UPDATE' and auth.uid() is not null then 'user' when new.source_telemetry_id is not null then 'device' else 'system' end);
 return new;
end;
$$;
create trigger alert_status_event after insert or update of status on public.alerts for each row execute function private.record_alert_status();
create or replace function public.triage_alert(target uuid,new_status text) returns void language plpgsql security definer set search_path='' as $$
declare a public.alerts;
begin
 select * into a from public.alerts where id=target for update;
 if a.id is null or not public.can_view_assignment(a.device_id,a.person_id,a.assignment_id) then raise exception 'access denied' using errcode='42501'; end if;
 if new_status is null or new_status not in ('new','acknowledged','resolved') then raise exception 'invalid status' using errcode='22023'; end if;
 if new_status=a.status then return; end if;
 update public.alerts set status=new_status,triaged_by=auth.uid(),triaged_at=clock_timestamp() where id=target;
end;
$$;

create function private.valid_telemetry_metrics(metrics jsonb) returns boolean language plpgsql immutable set search_path='' as $$
declare k text; v jsonb; axis text; unit_name text;
begin
 if jsonb_typeof(metrics) is distinct from 'object' then return false; end if;
 for k,v in select * from jsonb_each(metrics) loop
  if k not in ('heart_rate_bpm','spo2_percent','temperature_c','battery_percent','accelerometer','gyroscope') then return false; end if;
  if v='null'::jsonb then continue; end if;
  if k in ('accelerometer','gyroscope') then
   if jsonb_typeof(v) is distinct from 'object' then return false; end if;
   if (select count(*) from jsonb_object_keys(v))<>4 then return false; end if;
   unit_name:=case when k='accelerometer' then 'm/s2' else 'rad/s' end;
   if v->'unit' is distinct from to_jsonb(unit_name) then return false; end if;
   foreach axis in array array['x','y','z'] loop
    if jsonb_typeof(v->axis) is distinct from 'number' then return false; end if;
   end loop;
  else
   if jsonb_typeof(v) is distinct from 'number' then return false; end if;
   if k='heart_rate_bpm' and v::numeric<0 then return false; end if;
   if k in ('spo2_percent','battery_percent') and (v::numeric<0 or v::numeric>100) then return false; end if;
  end if;
 end loop;
 return true;
end;
$$;

create or replace function public.ingest_telemetry(p_payload jsonb,p_token_hash text,p_limit integer default 120) returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.devices; c private.device_credentials; existing public.telemetry; t timestamptz; stamp timestamptz; message uuid; inserted_id bigint;
begin
 if jsonb_typeof(p_payload) is distinct from 'object' then return jsonb_build_object('status',400,'error','invalid_payload'); end if;
 select * into d from public.devices where code=p_payload->>'device_code' for update;
 if d.id is null then return jsonb_build_object('status',401,'error','unauthorized'); end if;
 select * into c from private.device_credentials where device_id=d.id for update;
 if c.device_id is null or c.revoked_at is not null or c.token_hash is distinct from p_token_hash then return jsonb_build_object('status',401,'error','unauthorized'); end if;
 if not d.enabled then return jsonb_build_object('status',403,'error','device_disabled'); end if;
 if p_limit is null or p_limit<1 or p_limit>600 then return jsonb_build_object('status',400,'error','invalid_configuration'); end if;
 if p_payload->'schema_version' is distinct from '1'::jsonb
  or jsonb_typeof(p_payload->'device_code') is distinct from 'string'
  or jsonb_typeof(p_payload->'message_id') is distinct from 'string'
  or (p_payload->>'message_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  or jsonb_typeof(p_payload->'recorded_at') is distinct from 'string'
  or (p_payload->>'recorded_at') !~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$'
  or not private.valid_telemetry_metrics(p_payload->'metrics')
  or (p_payload ? 'event' and p_payload->'event'<>'null'::jsonb and (jsonb_typeof(p_payload->'event')<>'string' or p_payload->>'event' not in ('fall_detected','device_test')))
  or exists(select 1 from jsonb_object_keys(p_payload) key where key not in ('device_code','schema_version','message_id','recorded_at','metrics','event'))
 then return jsonb_build_object('status',400,'error','invalid_payload'); end if;
 begin
  stamp:=(p_payload->>'recorded_at')::timestamptz; message:=(p_payload->>'message_id')::uuid;
 exception when invalid_text_representation or datetime_field_overflow or invalid_datetime_format then
  return jsonb_build_object('status',400,'error','invalid_payload');
 end;
 select * into existing from public.telemetry where device_id=d.id and message_id=message;
 if existing.id is not null then
  if existing.recorded_at is distinct from stamp or existing.metrics is distinct from p_payload->'metrics' or existing.event is distinct from p_payload->>'event' then
   return jsonb_build_object('status',409,'error','idempotency_conflict');
  end if;
  return jsonb_build_object('status',200,'accepted',true,'duplicate',true,'received_at',existing.received_at);
 end if;
 if stamp<d.assigned_at then return jsonb_build_object('status',400,'error','reading_predates_assignment'); end if;
 -- Edge validation owns the configurable age/future window; this transaction owns assignment validity.
 t:=clock_timestamp();
 if c.window_start<t-interval '1 minute' then c.window_start:=t; c.window_count:=0; end if;
 if c.window_count>=p_limit then return jsonb_build_object('status',429,'error','rate_limited'); end if;
 update private.device_credentials set window_start=c.window_start,window_count=c.window_count+1 where device_id=d.id;
 insert into public.telemetry(device_id,message_id,schema_version,recorded_at,received_at,metrics,event)
 values(d.id,message,1,stamp,t,p_payload->'metrics',p_payload->>'event') returning id into inserted_id;
 -- Equal recorded times use the later accepted row, matching (recorded_at DESC,id DESC) history.
 update public.devices set last_received_at=t,
  latest_metrics=case when latest_recorded_at is null or stamp>=latest_recorded_at then p_payload->'metrics' else latest_metrics end,
  latest_recorded_at=greatest(latest_recorded_at,stamp) where id=d.id;
 if p_payload->>'event' is not null then
  insert into public.alerts(device_id,kind,severity,description,created_at,source_telemetry_id)
  values(d.id,p_payload->>'event','info',case p_payload->>'event'
   when 'fall_detected' then 'Evento de possível queda reportado pelo dispositivo. Verifique o contexto com a pessoa acompanhada.'
   else 'Evento de teste enviado pelo dispositivo.' end,stamp,inserted_id);
 end if;
 return jsonb_build_object('status',200,'accepted',true,'duplicate',false,'received_at',t);
end;
$$;

create function public.admin_dashboard(p_active_hours integer default 24,p_stale_seconds integer default 15) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare t timestamptz:=now(); since timestamptz; recent timestamptz; result jsonb;
begin
 if not public.is_admin() then raise exception 'administrator required' using errcode='42501'; end if;
 if p_active_hours is null or p_active_hours<1 or p_active_hours>8760 or p_stale_seconds is null or p_stale_seconds<1 or p_stale_seconds>86400 then
  raise exception 'invalid dashboard window' using errcode='22023';
 end if;
 since:=t-make_interval(hours=>p_active_hours); recent:=t-make_interval(secs=>p_stale_seconds);
 select jsonb_build_object(
  'active_users',(select count(*) from public.profiles where last_seen_at>=since),
  'caregivers',(select count(*) from public.profiles where role='caregiver'),
  'devices',(select count(*) from public.devices),
  'recent_devices',(select count(*) from public.devices where enabled and last_received_at>=recent),
  'recent_alerts',(select count(*) from public.alerts where created_at>=since),
  'enabled_devices',(select count(*) from public.devices where enabled),
  'disabled_devices',(select count(*) from public.devices where not enabled),
  'recent_readings',(select count(*) from public.telemetry where received_at>=since),
  'open_alerts',(select count(*) from public.alerts where status<>'resolved'),
  'generated_at',t) into result;
 return result;
end;
$$;
revoke all on function public.admin_dashboard(integer,integer) from public,anon,service_role;
grant execute on function public.admin_dashboard(integer,integer) to authenticated;

-- Explicit privileges also protect projects with permissive Supabase default grants.
revoke create on schema public from public,anon,authenticated;
revoke all on public.profiles,public.people,public.devices,public.caregiver_device_links,public.telemetry,public.alerts,public.support_conversations,public.support_messages from public,anon;
revoke all on function public.is_admin(),public.can_view_device(uuid),public.can_view_person(uuid),public.can_view_record(uuid,uuid),public.can_view_assignment(uuid,uuid,uuid),public.can_view_conversation(uuid),public.touch_activity(),public.triage_alert(uuid,text) from public,anon,service_role;
grant execute on function public.is_admin(),public.can_view_device(uuid),public.can_view_person(uuid),public.can_view_record(uuid,uuid),public.can_view_assignment(uuid,uuid,uuid),public.can_view_conversation(uuid),public.touch_activity(),public.triage_alert(uuid,text) to authenticated;
revoke all on function public.ingest_telemetry(jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.ingest_telemetry(jsonb,text,integer) to service_role;
revoke all on function private.reject_event_mutation(),private.enforce_link_assignment(),private.audit_admin_change(),private.record_alert_status(),private.valid_telemetry_metrics(jsonb) from public,anon,authenticated,service_role;

-- Published source rows remain SELECT-protected by the same current-assignment RLS.
-- Publication membership alone never authorizes a realtime subscriber.
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') and not exists(
  select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='alert_status_history'
 ) then alter publication supabase_realtime add table public.alert_status_history; end if;
end $$;
