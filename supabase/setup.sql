-- SAGE: instalacao completa para um projeto Supabase novo.
-- Execute TODO este arquivo no SQL Editor. Nao executar junto com as migrations.
-- Nao apaga dados. Se o esquema SAGE ja existe, aplique apenas as migrations pendentes.
-- Auth (email/senha), Site URL e Redirect URLs sao configurados no painel Supabase.
-- Nunca coloque chaves service_role no frontend. Veja README.md.

begin;
grant usage on schema public to authenticated, service_role;

-- Migration: 202610160001_identity_devices.sql
-- New Supabase project schema. Never run against unrelated legacy MySQL tables.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (length(display_name) between 1 and 120),
 role text not null default 'caregiver' check (role in ('admin','caregiver')),
 last_seen_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.people (
 id uuid primary key default gen_random_uuid(), display_name text not null check(length(display_name) between 1 and 120),
 consent_recorded_at timestamptz, consent_recorded_by uuid references public.profiles(id),
 consent_note text check(length(consent_note)<=1000), contact_name text check(length(contact_name)<=120),
 contact_phone text check(contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{8,25}$'), created_at timestamptz not null default now(),
 check ((consent_recorded_at is null and consent_recorded_by is null) or (consent_recorded_at is not null and consent_recorded_by is not null))
);
create table public.devices (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^SGE-[0-9]{3}$'),
 person_id uuid references public.people(id), enabled boolean not null default true,
 firmware_version text check(length(firmware_version)<=80), last_received_at timestamptz,
 latest_recorded_at timestamptz, latest_metrics jsonb, created_at timestamptz not null default now()
);
create table public.caregiver_device_links (
 id uuid primary key default gen_random_uuid(), caregiver_id uuid not null references public.profiles(id),
 device_id uuid not null references public.devices(id), granted_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index unique_active_link on public.caregiver_device_links(caregiver_id,device_id) where revoked_at is null;
create index links_device_user on public.caregiver_device_links(device_id,caregiver_id) where revoked_at is null;
create table private.device_credentials (
 device_id uuid primary key references public.devices(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'), rotated_at timestamptz not null default now(),
 window_start timestamptz not null default now(), window_count integer not null default 0
);
alter table private.device_credentials enable row level security;

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create function public.can_view_device(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_admin() or exists(select 1 from public.caregiver_device_links l join public.devices d on d.id=l.device_id join public.people p on p.id=d.person_id
 where l.device_id=target and l.caregiver_id=auth.uid() and l.revoked_at is null and p.consent_recorded_at is not null);
$$;
create function public.can_view_person(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_admin() or exists(select 1 from public.devices d where d.person_id=target and public.can_view_device(d.id));
$$;
revoke all on function public.is_admin(),public.can_view_device(uuid),public.can_view_person(uuid) from public;
grant execute on function public.is_admin(),public.can_view_device(uuid),public.can_view_person(uuid) to authenticated;

create function private.on_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id,display_name,role) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Cuidador'),120),'caregiver'); return new; end;
$$;
create trigger sage_profile_created after insert on auth.users for each row execute function private.on_user_created();
create function public.touch_activity() returns void language sql security definer set search_path = '' as $$
 update public.profiles set last_seen_at=now() where id=auth.uid();
$$;
revoke all on function public.touch_activity() from public;
grant execute on function public.touch_activity() to authenticated;

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.devices enable row level security;
alter table public.caregiver_device_links enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy people_read on public.people for select to authenticated using(public.can_view_person(id));
create policy people_admin on public.people for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy device_read on public.devices for select to authenticated using(public.can_view_device(id));
create policy device_admin on public.devices for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy link_read on public.caregiver_device_links for select to authenticated using(caregiver_id=auth.uid() or public.is_admin());
create policy link_admin on public.caregiver_device_links for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- Column grants prevent device telemetry manipulation even by the admin SPA.
revoke all on public.profiles,public.people,public.devices,public.caregiver_device_links from anon,authenticated;
grant select on public.profiles,public.people,public.devices,public.caregiver_device_links to authenticated;
grant insert(display_name,consent_recorded_at,consent_recorded_by,consent_note,contact_name,contact_phone),update(display_name,consent_recorded_at,consent_recorded_by,consent_note,contact_name,contact_phone) on public.people to authenticated;
grant insert(code,person_id,enabled,firmware_version),update(code,person_id,enabled,firmware_version) on public.devices to authenticated;
grant insert(caregiver_id,device_id,granted_by),update(revoked_at) on public.caregiver_device_links to authenticated;

create function private.check_caregiver_link() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=new.caregiver_id and role='caregiver') then raise exception 'invalid caregiver'; end if;
 if not exists(select 1 from public.devices d join public.people p on p.id=d.person_id where d.id=new.device_id and p.consent_recorded_at is not null) then raise exception 'consent required'; end if;
 if new.granted_by is distinct from auth.uid() then raise exception 'invalid grantor'; end if;
 return new;
end;
$$;
create trigger validate_link before insert on public.caregiver_device_links for each row execute function private.check_caregiver_link();


-- Migration: 202610160002_alerts_support.sql
create table public.alerts (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices(id),
 kind text not null check(kind in ('fall_detected','device_test','technical')),
 severity text not null default 'info' check(severity in ('info','warning','critical')),
 description text not null, status text not null default 'new' check(status in ('new','acknowledged','resolved')),
 created_at timestamptz not null default now(), triaged_by uuid references public.profiles(id), triaged_at timestamptz
);
create index alerts_device_time on public.alerts(device_id,created_at desc);
create table public.support_conversations (
 id uuid primary key default gen_random_uuid(), requester_id uuid not null default auth.uid() references public.profiles(id),
 subject text not null check(length(trim(subject)) between 3 and 160), status text not null default 'open' check(status in ('open','closed')),
 client_request_id uuid not null, created_at timestamptz not null default now(), unique(requester_id,client_request_id)
);
create table public.support_messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.support_conversations(id),
 sender_id uuid not null default auth.uid() references public.profiles(id), body text not null check(length(trim(body)) between 1 and 5000),
 client_message_id uuid not null, created_at timestamptz not null default now(), unique(sender_id,client_message_id)
);
create index support_message_page on public.support_messages(conversation_id,created_at);
create function public.can_view_conversation(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_admin() or exists(select 1 from public.support_conversations where id=target and requester_id=auth.uid());
$$;
revoke all on function public.can_view_conversation(uuid) from public;
grant execute on function public.can_view_conversation(uuid) to authenticated;
alter table public.alerts enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
create policy alert_read on public.alerts for select to authenticated using(public.can_view_device(device_id));
create policy conversation_read on public.support_conversations for select to authenticated using(requester_id=auth.uid() or public.is_admin());
create policy conversation_insert on public.support_conversations for insert to authenticated with check(requester_id=auth.uid() and status='open');
create policy conversation_admin_update on public.support_conversations for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy message_read on public.support_messages for select to authenticated using(public.can_view_conversation(conversation_id));
create policy message_insert on public.support_messages for insert to authenticated with check(sender_id=auth.uid() and public.can_view_conversation(conversation_id) and exists(select 1 from public.support_conversations c where c.id=conversation_id and c.status='open'));
revoke all on public.alerts,public.support_conversations,public.support_messages from anon,authenticated;
grant select on public.alerts,public.support_conversations,public.support_messages to authenticated;
grant insert(requester_id,subject,client_request_id) on public.support_conversations to authenticated;
grant update(status) on public.support_conversations to authenticated;
grant insert(conversation_id,sender_id,body,client_message_id) on public.support_messages to authenticated;

create function public.triage_alert(target uuid,new_status text) returns void language plpgsql security definer set search_path = '' as $$
declare a public.alerts;
begin
 select * into a from public.alerts where id=target for update;
 if a.id is null or not public.can_view_device(a.device_id) then raise exception 'access denied' using errcode='42501'; end if;
 if new_status not in ('new','acknowledged','resolved') then raise exception 'invalid status'; end if;
 update public.alerts set status=new_status,triaged_by=auth.uid(),triaged_at=now() where id=target;
end;
$$;
revoke all on function public.triage_alert(uuid,text) from public;
grant execute on function public.triage_alert(uuid,text) to authenticated;


-- Migration: 202610160003_telemetry.sql
create table public.telemetry (
 id bigint generated always as identity primary key,
 device_id uuid not null references public.devices(id), message_id uuid not null,
 schema_version integer not null check(schema_version=1), recorded_at timestamptz not null,
 received_at timestamptz not null default now(), metrics jsonb not null check(jsonb_typeof(metrics)='object'),
 event text check(event in ('fall_detected','device_test')), unique(device_id,message_id)
);
create index telemetry_device_recorded on public.telemetry(device_id,recorded_at desc,id desc);
alter table public.telemetry enable row level security;
create policy telemetry_read on public.telemetry for select to authenticated using(public.can_view_device(device_id));
revoke all on public.telemetry from anon,authenticated;
grant select on public.telemetry to authenticated;

-- Only the Edge Function's privileged server client can execute this transaction.
create function public.ingest_telemetry(p_payload jsonb,p_token_hash text,p_limit integer default 120) returns jsonb language plpgsql security definer set search_path = '' as $$
declare d public.devices; c private.device_credentials; t timestamptz:=clock_timestamp(); duplicate boolean; stamp timestamptz;
begin
 select * into d from public.devices where code=p_payload->>'device_code' for update;
 if d.id is null then return jsonb_build_object('status',401,'error','unauthorized'); end if;
 select * into c from private.device_credentials where device_id=d.id for update;
 if c.device_id is null or c.token_hash is distinct from p_token_hash then return jsonb_build_object('status',401,'error','unauthorized'); end if;
 if not d.enabled then return jsonb_build_object('status',403,'error','device_disabled'); end if;
 if jsonb_typeof(p_payload->'metrics')<>'object' or (p_payload->>'schema_version')::integer<>1 then return jsonb_build_object('status',400,'error','invalid_payload'); end if;
 stamp:=(p_payload->>'recorded_at')::timestamptz;
 select exists(select 1 from public.telemetry where device_id=d.id and message_id=(p_payload->>'message_id')::uuid) into duplicate;
 if duplicate then return jsonb_build_object('status',200,'accepted',true,'duplicate',true); end if;
 if c.window_start<t-interval '1 minute' then c.window_start:=t;c.window_count:=0;end if;
 if c.window_count>=greatest(1,p_limit) then return jsonb_build_object('status',429,'error','rate_limited'); end if;
 update private.device_credentials set window_start=c.window_start,window_count=c.window_count+1 where device_id=d.id;
 insert into public.telemetry(device_id,message_id,schema_version,recorded_at,received_at,metrics,event)
 values(d.id,(p_payload->>'message_id')::uuid,1,stamp,t,p_payload->'metrics',p_payload->>'event');
 update public.devices set last_received_at=t,
 latest_metrics=case when latest_recorded_at is null or stamp>latest_recorded_at then p_payload->'metrics' else latest_metrics end,
 latest_recorded_at=greatest(latest_recorded_at,stamp) where id=d.id;
 if p_payload->>'event' is not null then
 insert into public.alerts(device_id,kind,severity,description,created_at) values(d.id,p_payload->>'event','info',case p_payload->>'event' when 'fall_detected' then 'Evento de possível queda reportado pelo dispositivo. Verifique o contexto com a pessoa acompanhada.' else 'Evento de teste enviado pelo dispositivo.' end,stamp);
 end if;
 return jsonb_build_object('status',200,'accepted',true,'duplicate',false,'received_at',t);
end;
$$;
revoke all on function public.ingest_telemetry(jsonb,text,integer) from public,anon,authenticated;
grant execute on function public.ingest_telemetry(jsonb,text,integer) to service_role;

alter table public.devices replica identity full;
alter table public.caregiver_device_links replica identity full;
do $$ begin
 if exists(select 1 from pg_publication where pubname='supabase_realtime') then
 alter publication supabase_realtime add table public.telemetry,public.alerts,public.devices,public.caregiver_device_links;
 end if;
end $$;


-- Migration: 202610160004_person_history_scope.sql
-- Reassigning a physical vest must not disclose the previous person's history.
alter table public.devices add column assigned_at timestamptz not null default now();
alter table public.telemetry add column person_id uuid references public.people(id);
alter table public.alerts add column person_id uuid references public.people(id);
update public.telemetry t set person_id=d.person_id from public.devices d where d.id=t.device_id;
update public.alerts a set person_id=d.person_id from public.devices d where d.id=a.device_id;

create function public.can_view_record(target uuid,subject uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_admin() or (subject is not null and public.can_view_device(target) and exists(select 1 from public.devices where id=target and person_id=subject));
$$;
revoke all on function public.can_view_record(uuid,uuid) from public;
grant execute on function public.can_view_record(uuid,uuid) to authenticated;
drop policy telemetry_read on public.telemetry;
create policy telemetry_read on public.telemetry for select to authenticated using(public.can_view_record(device_id,person_id));
drop policy alert_read on public.alerts;
create policy alert_read on public.alerts for select to authenticated using(public.can_view_record(device_id,person_id));

create function private.clear_previous_person() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if new.person_id is distinct from old.person_id then
 new.assigned_at:=clock_timestamp();new.latest_metrics:=null;new.latest_recorded_at:=null;new.last_received_at:=null;
 end if;
 return new;
end;
$$;
create trigger device_person_change before update of person_id on public.devices for each row execute function private.clear_previous_person();
create function private.stamp_person() returns trigger language plpgsql security definer set search_path = '' as $$
declare d public.devices;
begin
 select * into d from public.devices where id=new.device_id;
 new.person_id:=d.person_id;
 if TG_TABLE_NAME='telemetry' and new.recorded_at<d.assigned_at then raise exception 'reading predates current assignment' using errcode='22023'; end if;
 return new;
end;
$$;
create trigger telemetry_person before insert on public.telemetry for each row execute function private.stamp_person();
-- Alert rows use created_at rather than recorded_at, so use a separate trigger.
create function private.stamp_alert_person() returns trigger language plpgsql security definer set search_path = '' as $$
begin select person_id into new.person_id from public.devices where id=new.device_id;return new;end;
$$;
create trigger alert_person before insert on public.alerts for each row execute function private.stamp_alert_person();

create or replace function public.triage_alert(target uuid,new_status text) returns void language plpgsql security definer set search_path = '' as $$
declare a public.alerts;
begin
 select * into a from public.alerts where id=target for update;
 if a.id is null or not public.can_view_record(a.device_id,a.person_id) then raise exception 'access denied' using errcode='42501'; end if;
 if new_status not in ('new','acknowledged','resolved') then raise exception 'invalid status'; end if;
 update public.alerts set status=new_status,triaged_by=auth.uid(),triaged_at=now() where id=target;
end;
$$;


-- Migration: 202610190001_existing_auth_profiles.sql
-- Accounts created before installation also need a profile to finish login.
-- Preserve all existing profiles and roles; editable metadata never grants admin.
insert into public.profiles (id, display_name, role)
select id,
       left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), 'Cuidador'), 120),
       'caregiver'
from auth.users
on conflict (id) do nothing;


-- Migration: 202610190002_backend_integrity.sql
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


-- Migration: 202610220001_ingest_hardening.sql
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


-- Migration: 202610220002_technical_monitor.sql
-- Opt-in technical monitoring only. No scheduler, device payload, or reading is created.
alter table public.alerts add column technical_rule text;
alter table public.alerts add column rule_version integer;
alter table public.alerts add column recovered_at timestamptz;
alter table public.alerts add constraint technical_alert_metadata check (
 (technical_rule is null and rule_version is null and recovered_at is null)
 or (kind='technical' and technical_rule is not null and technical_rule='communication_timeout' and rule_version is not null and rule_version>0)
);
-- Human resolution is not recovery: suppress duplicates until the gap actually ends.
create unique index communication_gap_open on public.alerts(device_id,assignment_id,technical_rule)
 where technical_rule='communication_timeout' and recovered_at is null;

create table private.communication_rules (
 device_id uuid primary key references public.devices(id) on delete cascade,
 enabled boolean not null default false,
 timeout_seconds integer not null check(timeout_seconds between 15 and 86400),
 version integer not null check(version>0),
 updated_by uuid not null references public.profiles(id),
 updated_at timestamptz not null default clock_timestamp(),
 monitoring_since timestamptz not null default clock_timestamp(),
 last_checked_at timestamptz,
 gap_last_received_at timestamptz
);
create index communication_rules_check_order on private.communication_rules(last_checked_at nulls first,device_id) where enabled;
alter table private.communication_rules enable row level security;
revoke all on private.communication_rules from public,anon,authenticated,service_role;

-- Keep the existing history trigger and human transitions. Automatic gap closure is
-- system work even when an administrator's device/configuration change caused it.
create or replace function private.record_alert_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare automatic_recovery boolean:=false;
begin
 if TG_OP='UPDATE' then
  if new.status is not distinct from old.status then return new; end if;
  automatic_recovery:=new.technical_rule='communication_timeout'
   and old.recovered_at is null and new.recovered_at is not null;
 end if;
 insert into public.alert_status_history(alert_id,device_id,person_id,assignment_id,previous_status,status,actor_id,source)
 values(new.id,new.device_id,new.person_id,new.assignment_id,
  case when TG_OP='UPDATE' then old.status else null end,new.status,
  case when TG_OP='UPDATE' and not automatic_recovery then auth.uid() else null end,
  case when automatic_recovery then 'system'
   when TG_OP='UPDATE' and auth.uid() is not null then 'user'
   when new.source_telemetry_id is not null then 'device' else 'system' end);
 return new;
end;
$$;

-- Callers must hold the device lock first. UPDATE never restamps an old assignment.
create function private.close_communication_gaps(p_device_id uuid) returns integer
language plpgsql security definer set search_path='' as $$
declare closed integer;
begin
 update public.alerts set recovered_at=clock_timestamp(),status='resolved'
 where device_id=p_device_id and technical_rule='communication_timeout' and recovered_at is null;
 get diagnostics closed=row_count;
 update private.communication_rules set gap_last_received_at=null where device_id=p_device_id;
 return closed;
end;
$$;

create function public.configure_communication_rule(p_device_id uuid,p_enabled boolean,p_timeout_seconds integer)
returns jsonb language plpgsql security definer set search_path='' as $$
declare r private.communication_rules; t timestamptz:=clock_timestamp();
begin
 if not public.is_admin() then raise exception 'administrator required' using errcode='42501'; end if;
 if p_enabled is null or p_timeout_seconds is null or p_timeout_seconds not between 15 and 86400 then
  raise exception 'invalid communication rule' using errcode='22023';
 end if;
 perform 1 from public.devices where id=p_device_id for update;
 if not found then raise exception 'device not found' using errcode='22023'; end if;
 t:=clock_timestamp();
 insert into private.communication_rules(device_id,enabled,timeout_seconds,version,updated_by,updated_at,monitoring_since)
 values(p_device_id,p_enabled,p_timeout_seconds,1,auth.uid(),t,t)
 on conflict(device_id) do update set
  enabled=excluded.enabled,timeout_seconds=excluded.timeout_seconds,
  version=private.communication_rules.version+1,updated_by=excluded.updated_by,updated_at=t,
  monitoring_since=case when not private.communication_rules.enabled and excluded.enabled then t else private.communication_rules.monitoring_since end,
  last_checked_at=null
 returning * into r;
 if not p_enabled then perform private.close_communication_gaps(p_device_id); end if;
 insert into public.admin_audit_events(actor_id,action,subject_type,subject_id,details)
 values(auth.uid(),'communication_rule.configured','device',p_device_id,
  jsonb_build_object('technical_rule','communication_timeout','enabled',r.enabled,'timeout_seconds',r.timeout_seconds,'version',r.version));
 return jsonb_build_object('device_id',r.device_id,'enabled',r.enabled,'timeout_seconds',r.timeout_seconds,
  'version',r.version,'updated_by',r.updated_by,'updated_at',r.updated_at,'monitoring_since',r.monitoring_since);
end;
$$;

create function private.communication_device_changed() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.person_id is distinct from old.person_id or new.enabled is distinct from old.enabled then
  perform private.close_communication_gaps(new.id);
  update private.communication_rules set monitoring_since=clock_timestamp(),last_checked_at=null where device_id=new.id;
 end if;
 return new;
end;
$$;
create trigger communication_device_change after update of person_id,enabled on public.devices
 for each row execute function private.communication_device_changed();

create function public.evaluate_communication_rules(p_limit integer default 100) returns jsonb
language plpgsql security definer set search_path='' as $$
declare candidate record; d public.devices; r private.communication_rules; a public.alerts;
 t timestamptz; baseline timestamptz; checked integer:=0; emitted integer:=0; recovered integer:=0;
begin
 if p_limit is null or p_limit not between 1 and 1000 then
  raise exception 'invalid evaluation batch' using errcode='22023';
 end if;
 -- Device-first locks match ingestion/configuration/reassignment. Busy devices
 -- are skipped, and least recently checked rules cannot be starved by UUID order.
 for candidate in
  select d0.id from private.communication_rules r0 join public.devices d0 on d0.id=r0.device_id
  where r0.enabled order by r0.last_checked_at nulls first,r0.device_id
  limit p_limit for update of d0 skip locked
 loop
  select * into d from public.devices where id=candidate.id;
  select * into r from private.communication_rules where device_id=d.id for update skip locked;
  if not found or not r.enabled then continue; end if;
  t:=clock_timestamp(); checked:=checked+1;
  update private.communication_rules set last_checked_at=t where device_id=d.id;
  select * into a from public.alerts where device_id=d.id
   and technical_rule='communication_timeout' and recovered_at is null;
  if a.id is not null and (not d.enabled or a.assignment_id is distinct from d.assignment_id
   or (d.last_received_at is not null and (r.gap_last_received_at is null or d.last_received_at>r.gap_last_received_at))) then
   recovered:=recovered+private.close_communication_gaps(d.id);
   a:=null;
  end if;
  baseline:=greatest(r.monitoring_since,d.assigned_at,d.last_received_at);
  if d.enabled and a.id is null and t>=baseline+make_interval(secs=>r.timeout_seconds) then
   insert into public.alerts(device_id,kind,severity,description,technical_rule,rule_version,created_at)
   values(d.id,'technical','warning','Sem novas leituras aceitas dentro da janela tecnica configurada.',
    'communication_timeout',r.version,t);
   update private.communication_rules set gap_last_received_at=d.last_received_at where device_id=d.id;
   emitted:=emitted+1;
  end if;
 end loop;
 return jsonb_build_object('checked',checked,'emitted',emitted,'recovered',recovered);
end;
$$;

revoke all on function public.configure_communication_rule(uuid,boolean,integer) from public,anon,authenticated,service_role;
grant execute on function public.configure_communication_rule(uuid,boolean,integer) to authenticated;
revoke all on function public.evaluate_communication_rules(integer) from public,anon,authenticated,service_role;
grant execute on function public.evaluate_communication_rules(integer) to service_role;
revoke all on function private.close_communication_gaps(uuid),private.communication_device_changed(),private.record_alert_status() from public,anon,authenticated,service_role;

notify pgrst, 'reload schema';


-- Migration: 202610260001_self_service_pairing.sql
-- Client pairing is separate from the ESP32 ingest credential. Codes are
-- single-use, expire in 24 hours and belong to one consented assignment.
create table private.device_pairing_codes (
 device_id uuid primary key references public.devices(id) on delete cascade,
 assignment_id uuid not null,
 token_hash text not null check(token_hash ~ '^[0-9a-f]{64}$'),
 issued_by uuid not null references public.profiles(id),
 expires_at timestamptz not null,
 consumed_by uuid references public.profiles(id),
 consumed_at timestamptz,
 check ((consumed_by is null) = (consumed_at is null))
);
create table private.device_pairing_attempts (
 user_id uuid primary key references public.profiles(id) on delete cascade,
 window_start timestamptz not null,
 attempts integer not null check(attempts between 1 and 11)
);
alter table private.device_pairing_codes enable row level security;
alter table private.device_pairing_attempts enable row level security;
revoke all on private.device_pairing_codes,private.device_pairing_attempts from public,anon,authenticated,service_role;

create function public.issue_device_pairing_code(p_device_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.devices; secret text; expires timestamptz; consent timestamptz;
begin
 if auth.uid() is null or not public.is_admin() then
  raise exception 'administrator required' using errcode='42501';
 end if;
 select * into d from public.devices where id=p_device_id for update;
 if not found or not d.enabled or d.person_id is null then
  raise exception 'device is not ready for pairing' using errcode='22023';
 end if;
 select consent_recorded_at into consent from public.people where id=d.person_id for share;
 if consent is null then raise exception 'consent required' using errcode='22023'; end if;
 secret:=replace(gen_random_uuid()::text,'-','');
 expires:=clock_timestamp()+interval '24 hours';
 insert into private.device_pairing_codes(device_id,assignment_id,token_hash,issued_by,expires_at)
 values(d.id,d.assignment_id,encode(sha256(convert_to(secret,'UTF8')),'hex'),auth.uid(),expires)
 on conflict(device_id) do update set assignment_id=excluded.assignment_id,
  token_hash=excluded.token_hash,issued_by=excluded.issued_by,expires_at=excluded.expires_at,
  consumed_by=null,consumed_at=null;
 insert into public.admin_audit_events(actor_id,action,subject_type,subject_id,details)
 values(auth.uid(),'device.pairing_code_issued','device',d.id,
  jsonb_build_object('assignment_id',d.assignment_id,'expires_at',expires));
 return jsonb_build_object('code',d.code,'activation_code',secret,'expires_at',expires);
end;
$$;

create function public.connect_device(p_code text,p_activation_code text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
 caller uuid:=auth.uid(); d public.devices; proof private.device_pairing_codes;
 target uuid; normalized text; token text; hashed text; tries integer;
 consent timestamptz; linked boolean; result_page integer;
begin
 if caller is null or not exists(select 1 from public.profiles where id=caller and role='caregiver') then
  raise exception 'customer account required' using errcode='42501';
 end if;
 -- Return failures instead of raising so failed-attempt counters are committed.
 insert into private.device_pairing_attempts(user_id,window_start,attempts)
 values(caller,clock_timestamp(),1)
 on conflict(user_id) do update set
  attempts=case when private.device_pairing_attempts.window_start<=clock_timestamp()-interval '15 minutes'
   then 1 else least(11,private.device_pairing_attempts.attempts+1) end,
  window_start=case when private.device_pairing_attempts.window_start<=clock_timestamp()-interval '15 minutes'
   then clock_timestamp() else private.device_pairing_attempts.window_start end
 returning attempts into tries;
 if tries>10 then return jsonb_build_object('status','rate_limited'); end if;
 normalized:=upper(trim(p_code));
 token:=lower(replace(trim(p_activation_code),'-',''));
 if normalized is null or normalized !~ '^SGE-[0-9]{3}$' or token is null or token !~ '^[0-9a-f]{32}$' then
  return jsonb_build_object('status','invalid');
 end if;
 hashed:=encode(sha256(convert_to(token,'UTF8')),'hex');
 -- Invalid proof does not lock a vest or disclose whether its public code exists.
 select c.device_id into target from private.device_pairing_codes c
 join public.devices v on v.id=c.device_id and v.assignment_id=c.assignment_id
 where v.code=normalized and c.token_hash=hashed;
 if not found then return jsonb_build_object('status','invalid'); end if;
 -- Keep the established device -> dependent-row lock order; revalidate under lock.
 select * into d from public.devices where id=target for update;
 select * into proof from private.device_pairing_codes where device_id=target for update;
 if proof.token_hash is distinct from hashed or proof.assignment_id is distinct from d.assignment_id
  or d.code is distinct from normalized or not d.enabled or d.person_id is null then
  return jsonb_build_object('status','invalid');
 end if;
 select consent_recorded_at into consent from public.people where id=d.person_id for share;
 if consent is null then return jsonb_build_object('status','invalid'); end if;
 select exists(select 1 from public.caregiver_device_links
  where caregiver_id=caller and device_id=d.id and assignment_id=d.assignment_id and revoked_at is null) into linked;
 if proof.consumed_by is not null then
  if proof.consumed_by is distinct from caller or not linked then
   return jsonb_build_object('status','invalid');
  end if;
 elsif proof.expires_at<=clock_timestamp() then
  return jsonb_build_object('status','invalid');
 else
  if not linked then
   insert into public.caregiver_device_links(caregiver_id,device_id,granted_by)
   values(caller,d.id,caller);
  end if;
  update private.device_pairing_codes set consumed_by=caller,consumed_at=clock_timestamp() where device_id=d.id;
 end if;
 -- Match the existing 25-row dashboard pagination and select the connected vest.
 select (count(*)/25)::integer into result_page from public.devices v
 where v.code<d.code and public.can_view_device(v.id);
 return jsonb_build_object('status',case when linked then 'already_connected' else 'connected' end,
  'device_id',d.id,'page',result_page);
end;
$$;
revoke all on function public.issue_device_pairing_code(uuid),public.connect_device(text,text) from public,anon,authenticated,service_role;
grant execute on function public.issue_device_pairing_code(uuid),public.connect_device(text,text) to authenticated;


-- Migration: 202610290001_care_profile_falls.sql
-- Additive care profile and human review. No synthetic readings or scheduled jobs.
alter table public.people
 add column address text check(length(address)<=1000),
 add column allergy_status text not null default 'unknown' check(allergy_status in ('unknown','none','reported')),
 add column allergies text check(length(allergies)<=1000),
 add column health_conditions text check(length(health_conditions)<=3000),
 add constraint allergy_details check(
  (allergy_status='reported' and allergies is not null and length(trim(allergies))>0)
  or (allergy_status in ('unknown','none') and allergies is null)
 );
-- Existing SELECT RLS applies; new fields can only be written through this RPC.
create function public.complete_device_profile(p_device_id uuid,p_expected_assignment_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.devices; p public.people; k text; v jsonb;
 n text; addr text; ast text; allergy text; conditions text; cn text; cp text; note text;
begin
 if not public.is_admin() then raise exception 'administrator required' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>24000 then raise exception 'invalid profile' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(p_data) loop
  if k not in ('display_name','address','allergy_status','allergies','health_conditions','contact_name','contact_phone','consent_confirmed','consent_note')
   or (k<>'consent_confirmed' and jsonb_typeof(v) not in ('string','null')) then
   raise exception 'invalid profile' using errcode='22023';
  end if;
 end loop;
 n:=nullif(trim(p_data->>'display_name'),''); addr:=nullif(trim(p_data->>'address'),'');
 ast:=p_data->>'allergy_status'; allergy:=nullif(trim(p_data->>'allergies'),'');
 conditions:=nullif(trim(p_data->>'health_conditions'),''); cn:=nullif(trim(p_data->>'contact_name'),'');
 cp:=nullif(trim(p_data->>'contact_phone'),''); note:=nullif(trim(p_data->>'consent_note'),'');
 if n is null or length(n)>120 or length(addr)>1000 or ast is null or ast not in ('unknown','none','reported')
  or length(allergy)>1000 or length(conditions)>3000 or length(cn)>120 or length(note)>1000
  or (cp is not null and cp !~ '^\+?[0-9 ()-]{8,25}$')
  or ((ast='reported')<>(allergy is not null))
  or p_data->'consent_confirmed' is distinct from 'true'::jsonb then
  raise exception 'invalid profile or consent' using errcode='22023';
 end if;
 select * into d from public.devices where id=p_device_id for update;
 if d.id is null then raise exception 'access denied' using errcode='42501'; end if;
 if d.assignment_id is distinct from p_expected_assignment_id then raise exception 'assignment changed' using errcode='40001'; end if;
 if d.person_id is not null then select * into p from public.people where id=d.person_id for update; end if;
 if p.consent_recorded_at is null and note is null then raise exception 'consent reference required' using errcode='22023'; end if;
 if p.id is null then
  insert into public.people(display_name,address,allergy_status,allergies,health_conditions,contact_name,contact_phone,consent_recorded_at,consent_recorded_by,consent_note)
  values(n,addr,ast,allergy,conditions,cn,cp,clock_timestamp(),auth.uid(),note) returning * into p;
  update public.devices set person_id=p.id where id=d.id returning * into d;
 else
  update public.people set display_name=n,address=addr,allergy_status=ast,allergies=allergy,health_conditions=conditions,
   contact_name=cn,contact_phone=cp,
   consent_recorded_at=coalesce(consent_recorded_at,clock_timestamp()),
   consent_recorded_by=coalesce(consent_recorded_by,auth.uid()),
   consent_note=case when consent_recorded_at is null then note else consent_note end
  where id=p.id;
 end if;
 return jsonb_build_object('device_id',d.id,'person_id',p.id,'assignment_id',d.assignment_id);
end;
$$;
revoke all on function public.complete_device_profile(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.complete_device_profile(uuid,uuid,jsonb) to authenticated;

alter table public.alerts
 add column fall_outcome text check(fall_outcome in ('confirmed','dismissed')),
 add column fall_reviewed_at timestamptz,
 add column fall_reviewed_by uuid references public.profiles(id),
 add constraint fall_review_metadata check(
  (fall_outcome is null and fall_reviewed_at is null and fall_reviewed_by is null)
  or (kind='fall_detected' and fall_outcome is not null and fall_reviewed_at is not null and fall_reviewed_by is not null)
 );
alter table public.alert_status_history
 add column previous_fall_outcome text check(previous_fall_outcome in ('confirmed','dismissed')),
 add column fall_outcome text check(fall_outcome in ('confirmed','dismissed'));
create or replace function private.record_alert_status() returns trigger
language plpgsql security definer set search_path='' as $$
declare automatic_recovery boolean:=false;
begin
 if TG_OP='UPDATE' then
  if new.status is not distinct from old.status and new.fall_outcome is not distinct from old.fall_outcome then return new; end if;
  automatic_recovery:=new.technical_rule='communication_timeout' and old.recovered_at is null and new.recovered_at is not null;
 end if;
 insert into public.alert_status_history(alert_id,device_id,person_id,assignment_id,previous_status,status,actor_id,source,previous_fall_outcome,fall_outcome)
 values(new.id,new.device_id,new.person_id,new.assignment_id,
  case when TG_OP='UPDATE' then old.status else null end,new.status,
  case when TG_OP='UPDATE' and not automatic_recovery then auth.uid() else null end,
  case when automatic_recovery then 'system' when TG_OP='UPDATE' and auth.uid() is not null then 'user' when new.source_telemetry_id is not null then 'device' else 'system' end,
  case when TG_OP='UPDATE' then old.fall_outcome else null end,new.fall_outcome);
 return new;
end;
$$;
drop trigger alert_status_event on public.alerts;
create trigger alert_status_event after insert or update of status,fall_outcome on public.alerts for each row execute function private.record_alert_status();
create function public.review_fall_alert(target uuid,p_outcome text) returns void
language plpgsql security definer set search_path='' as $$
declare a public.alerts;
begin
 select * into a from public.alerts where id=target;
 if a.id is null or not public.can_view_assignment(a.device_id,a.person_id,a.assignment_id) then raise exception 'access denied' using errcode='42501'; end if;
 perform 1 from public.devices where id=a.device_id for update;
 select * into a from public.alerts where id=target for update;
 if a.id is null or not public.can_view_assignment(a.device_id,a.person_id,a.assignment_id) then raise exception 'access denied' using errcode='42501'; end if;
 if a.kind<>'fall_detected' or p_outcome is null or p_outcome not in ('confirmed','dismissed') then raise exception 'invalid fall review' using errcode='22023'; end if;
 if a.fall_outcome is not distinct from p_outcome and a.status='resolved' then return; end if;
 update public.alerts set status='resolved',fall_outcome=p_outcome,fall_reviewed_at=clock_timestamp(),
  fall_reviewed_by=auth.uid(),triaged_by=auth.uid(),triaged_at=clock_timestamp() where id=target;
end;
$$;
revoke all on function public.review_fall_alert(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.review_fall_alert(uuid,text) to authenticated;
create index alerts_pending_notification on public.alerts(created_at desc,id desc) where status<>'resolved';
notify pgrst, 'reload schema';


-- Migration: 202610300001_managed_simulated_vest.sql
-- Delegated profile setup and explicit simulated telemetry; no seeded patient.
alter table public.devices add column telemetry_source text not null default 'device' check(telemetry_source in ('device','simulated'));
alter table public.telemetry add column source text not null default 'device' check(source in ('device','simulated'));
alter table public.alerts add column source text not null default 'device' check(source in ('device','simulated'));
create table private.device_profile_managers (
 device_id uuid primary key references public.devices(id),
 profile_id uuid not null references public.profiles(id),
 assignment_id uuid not null,
 granted_at timestamptz not null default clock_timestamp()
);
alter table private.device_profile_managers enable row level security;
revoke all on private.device_profile_managers from public,anon,authenticated,service_role;
create function public.can_manage_device_profile(p_device_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(
  select 1 from private.device_profile_managers m join public.devices d on d.id=m.device_id and d.assignment_id=m.assignment_id
  where m.device_id=p_device_id and m.profile_id=auth.uid()
 );
$$;
revoke all on function public.can_manage_device_profile(uuid) from public,anon,authenticated,service_role;
grant execute on function public.can_manage_device_profile(uuid) to authenticated;
create function public.device_profile_editable(d public.devices) returns boolean
language sql stable set search_path='' as $$ select public.can_manage_device_profile(d.id); $$;
revoke all on function public.device_profile_editable(public.devices) from public,anon,authenticated,service_role;
grant execute on function public.device_profile_editable(public.devices) to authenticated;
create or replace function public.can_view_device(target uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(
  select 1 from public.caregiver_device_links l
  join public.devices d on d.id=l.device_id and d.assignment_id=l.assignment_id
  join public.people p on p.id=d.person_id
  where l.device_id=target and l.caregiver_id=auth.uid() and l.revoked_at is null and p.consent_recorded_at is not null
 ) or exists(
  select 1 from private.device_profile_managers m
  join public.devices d on d.id=m.device_id and d.assignment_id=m.assignment_id
  left join public.people p on p.id=d.person_id
  where d.id=target and m.profile_id=auth.uid() and (d.person_id is null or p.consent_recorded_at is not null)
 );
$$;
create or replace function public.can_view_assignment(target uuid,subject uuid,assignment uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select public.is_admin() or exists(
  select 1 from public.devices d left join public.people p on p.id=d.person_id
  where d.id=target and d.person_id is not distinct from subject and d.assignment_id=assignment
   and public.can_view_device(d.id)
   and ((subject is not null and p.consent_recorded_at is not null)
    or (subject is null and public.can_manage_device_profile(d.id)))
 );
$$;
create function public.lookup_connected_device(p_code text) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare d public.devices; result_page integer;
begin
 if auth.uid() is null then raise exception 'access denied' using errcode='42501'; end if;
 if p_code is null or length(p_code)>30 then return null; end if;
 select * into d from public.devices where code=upper(trim(p_code)) and enabled and public.can_view_device(id);
 if d.id is null then return null; end if;
 select (count(*)/25)::integer into result_page from public.devices where code<d.code and public.can_view_device(id);
 return jsonb_build_object('device_id',d.id,'page',result_page,'configure_profile',public.can_manage_device_profile(d.id));
end;
$$;
revoke all on function public.lookup_connected_device(text) from public,anon,authenticated,service_role;
grant execute on function public.lookup_connected_device(text) to authenticated;
create function private.stamp_data_origin() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 select telemetry_source into new.source from public.devices where id=new.device_id;
 return new;
end;
$$;
revoke all on function private.stamp_data_origin() from public,anon,authenticated,service_role;
create trigger telemetry_data_origin before insert on public.telemetry for each row execute function private.stamp_data_origin();
create trigger alert_data_origin before insert on public.alerts for each row execute function private.stamp_data_origin();
create function public.emit_simulated_reading(p_device_id uuid,p_expected_assignment_id uuid,p_message_id uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.devices; previous public.telemetry; token_hash text; payload jsonb;
begin
 if not public.can_manage_device_profile(p_device_id) then raise exception 'access denied' using errcode='42501'; end if;
 select * into d from public.devices where id=p_device_id for update;
 if d.id is null or not d.enabled or not public.can_manage_device_profile(d.id) then raise exception 'access denied' using errcode='42501'; end if;
 if d.telemetry_source<>'simulated' or p_message_id is null then raise exception 'simulated source required' using errcode='22023'; end if;
 if d.assignment_id is distinct from p_expected_assignment_id then raise exception 'assignment changed' using errcode='40001'; end if;
 if d.person_id is not null and not exists(select 1 from public.people where id=d.person_id and consent_recorded_at is not null) then
  raise exception 'consent required' using errcode='42501';
 end if;
 select * into previous from public.telemetry where device_id=d.id and message_id=p_message_id;
 if previous.id is not null then
  if previous.assignment_id is distinct from d.assignment_id then raise exception 'assignment changed' using errcode='40001'; end if;
  return jsonb_build_object('status',200,'accepted',true,'duplicate',true,'received_at',previous.received_at);
 end if;
 select c.token_hash into token_hash from private.device_credentials c where device_id=d.id and revoked_at is null;
 if token_hash is null then return jsonb_build_object('status',401,'error','unauthorized'); end if;
 -- Synthetic UI samples, not clinical limits. Never synthesize a fall event.
 payload:=jsonb_build_object('schema_version',1,'device_code',d.code,'message_id',p_message_id,
  'recorded_at',clock_timestamp(),'event',null,
  'metrics',jsonb_build_object('heart_rate_bpm',60+floor(random()*56),
   'spo2_percent',90+floor(random()*11),'temperature_c',35+floor(random()*31)/10,
   'battery_percent',30+floor(random()*71),'accelerometer',null,'gyroscope',null));
 return public.ingest_telemetry(payload,token_hash,120);
end;
$$;
revoke all on function public.emit_simulated_reading(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.emit_simulated_reading(uuid,uuid,uuid) to authenticated;

create or replace function public.complete_device_profile(p_device_id uuid,p_expected_assignment_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare d public.devices; p public.people; k text; v jsonb;
 n text; addr text; ast text; allergy text; conditions text; cn text; cp text; note text;
begin
 if not public.can_manage_device_profile(p_device_id) then raise exception 'profile manager required' using errcode='42501'; end if;
 if jsonb_typeof(p_data) is distinct from 'object' or octet_length(p_data::text)>24000 then raise exception 'invalid profile' using errcode='22023'; end if;
 for k,v in select * from jsonb_each(p_data) loop
  if k not in ('display_name','address','allergy_status','allergies','health_conditions','contact_name','contact_phone','consent_confirmed','consent_note')
   or (k<>'consent_confirmed' and jsonb_typeof(v) not in ('string','null')) then
   raise exception 'invalid profile' using errcode='22023';
  end if;
 end loop;
 n:=nullif(trim(p_data->>'display_name'),''); addr:=nullif(trim(p_data->>'address'),'');
 ast:=p_data->>'allergy_status'; allergy:=nullif(trim(p_data->>'allergies'),'');
 conditions:=nullif(trim(p_data->>'health_conditions'),''); cn:=nullif(trim(p_data->>'contact_name'),'');
 cp:=nullif(trim(p_data->>'contact_phone'),''); note:=nullif(trim(p_data->>'consent_note'),'');
 if n is null or length(n)>120 or length(addr)>1000 or ast is null or ast not in ('unknown','none','reported')
  or length(allergy)>1000 or length(conditions)>3000 or length(cn)>120 or length(note)>1000
  or (cp is not null and cp !~ '^\+?[0-9 ()-]{8,25}$')
  or ((ast='reported')<>(allergy is not null))
  or p_data->'consent_confirmed' is distinct from 'true'::jsonb then
  raise exception 'invalid profile or consent' using errcode='22023';
 end if;
 select * into d from public.devices where id=p_device_id for update;
 if d.id is null or not public.can_manage_device_profile(d.id) then raise exception 'access denied' using errcode='42501'; end if;
 if d.assignment_id is distinct from p_expected_assignment_id then raise exception 'assignment changed' using errcode='40001'; end if;
 if d.person_id is not null then select * into p from public.people where id=d.person_id for update; end if;
 if p.consent_recorded_at is null and note is null then raise exception 'consent reference required' using errcode='22023'; end if;
 if p.id is null then
  insert into public.people(display_name,address,allergy_status,allergies,health_conditions,contact_name,contact_phone,consent_recorded_at,consent_recorded_by,consent_note)
  values(n,addr,ast,allergy,conditions,cn,cp,clock_timestamp(),auth.uid(),note) returning * into p;
  update public.devices set person_id=p.id where id=d.id returning * into d;
 else
  update public.people set display_name=n,address=addr,allergy_status=ast,allergies=allergy,health_conditions=conditions,
   contact_name=cn,contact_phone=cp,
   consent_recorded_at=coalesce(consent_recorded_at,clock_timestamp()),
   consent_recorded_by=coalesce(consent_recorded_by,auth.uid()),
   consent_note=case when consent_recorded_at is null then note else consent_note end
  where id=p.id;
 end if;
 update private.device_profile_managers set assignment_id=d.assignment_id where device_id=d.id and profile_id=auth.uid() and assignment_id=p_expected_assignment_id;
 return jsonb_build_object('device_id',d.id,'person_id',p.id,'assignment_id',d.assignment_id);
end;
$$;
revoke all on function public.complete_device_profile(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.complete_device_profile(uuid,uuid,jsonb) to authenticated;

notify pgrst, 'reload schema';


-- Migration: 202611100001_test_controls.sql
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


-- Migration: 202611100002_reports_plans.sql
create table public.demo_subscriptions (
 profile_id uuid primary key references public.profiles(id),
 plan text not null check(plan in ('essential','plus','premium')),
 updated_at timestamptz not null default now()
);
alter table public.demo_subscriptions enable row level security;
revoke all on public.demo_subscriptions from public,anon,authenticated;
grant select on public.demo_subscriptions to authenticated;
create policy own_demo_plan on public.demo_subscriptions for select to authenticated using(profile_id=auth.uid());
create function public.select_demo_plan(p_plan text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or p_plan is null or p_plan not in ('essential','plus','premium') then raise exception 'invalid plan' using errcode='22023'; end if;
 insert into public.demo_subscriptions(profile_id,plan) values(auth.uid(),p_plan)
 on conflict(profile_id) do update set plan=excluded.plan,updated_at=clock_timestamp();
 return jsonb_build_object('plan',p_plan,'mode','demo');
end;
$$;
revoke all on function public.select_demo_plan(text) from public,anon,authenticated;
grant execute on function public.select_demo_plan(text) to authenticated;

create function public.weekly_device_report(p_device_id uuid,p_expected_assignment_id uuid,p_start date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.devices; start_at timestamptz; end_at timestamptz; sources jsonb; days jsonb; measures jsonb; events jsonb;
begin
 if auth.uid() is null or not public.can_view_device(p_device_id) then raise exception 'access denied' using errcode='42501'; end if;
 select * into d from public.devices where id=p_device_id;
 if d.id is null or d.assignment_id is distinct from p_expected_assignment_id then raise exception 'assignment changed' using errcode='40001'; end if;
 if p_start is null or p_start>(now() at time zone 'UTC')::date or p_start<(now() at time zone 'UTC')::date-366 then raise exception 'invalid period' using errcode='22023'; end if;
 start_at:=p_start::timestamp at time zone 'UTC'; end_at:=start_at+interval '7 days';
 select coalesce(jsonb_agg(x),'[]'::jsonb) into sources from (
  select source,count(*) samples,min(recorded_at) first_reading,max(recorded_at) last_reading from public.telemetry
  where device_id=d.id and assignment_id=d.assignment_id and person_id is not distinct from d.person_id and recorded_at>=start_at and recorded_at<end_at group by source
 ) x;
 select coalesce(jsonb_agg(x order by "day",source),'[]'::jsonb) into days from (
  select (recorded_at at time zone 'UTC')::date as "day",source,count(*) samples from public.telemetry
  where device_id=d.id and assignment_id=d.assignment_id and person_id is not distinct from d.person_id and recorded_at>=start_at and recorded_at<end_at group by 1,2
 ) x;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into measures from (
  select t.source,m.key metric,count(*) samples,round(avg((m.value::text)::numeric),2) mean,min((m.value::text)::numeric) minimum,max((m.value::text)::numeric) maximum
  from public.telemetry t cross join lateral jsonb_each(t.metrics) m
  where t.device_id=d.id and t.assignment_id=d.assignment_id and t.person_id is not distinct from d.person_id and t.recorded_at>=start_at and t.recorded_at<end_at
   and m.key in ('heart_rate_bpm','spo2_percent','temperature_c','battery_percent') and jsonb_typeof(m.value)='number'
  group by t.source,m.key
 ) x;
 select coalesce(jsonb_agg(x),'[]'::jsonb) into events from (
  select source,event,count(*) count from public.telemetry where device_id=d.id and assignment_id=d.assignment_id
  and person_id is not distinct from d.person_id and recorded_at>=start_at and recorded_at<end_at and event is not null group by source,event
 ) x;
 return jsonb_build_object('device_code',d.code,'assignment_id',d.assignment_id,'start',start_at,'end',end_at,'generated_at',clock_timestamp(),'sources',sources,'days',days,'metrics',measures,'events',events,'timezone','UTC');
end;
$$;
revoke all on function public.weekly_device_report(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.weekly_device_report(uuid,uuid,date) to authenticated;

create function public.demo_weekly_analysis(p_device_id uuid,p_expected_assignment_id uuid,p_start date) returns jsonb
language plpgsql security definer set search_path='' as $$
declare report jsonb; total bigint; falls bigint; simulated bigint; active_days bigint;
begin
 if auth.uid() is null or not exists(select 1 from public.demo_subscriptions where profile_id=auth.uid() and plan='premium') then raise exception 'premium required' using errcode='42501'; end if;
 report:=public.weekly_device_report(p_device_id,p_expected_assignment_id,p_start);
 select coalesce(sum((x->>'samples')::bigint),0),coalesce(sum((x->>'samples')::bigint) filter(where x->>'source'='simulated'),0) into total,simulated from jsonb_array_elements(report->'sources') x;
 select count(distinct x->>'day') into active_days from jsonb_array_elements(report->'days') x;
 select coalesce(sum((x->>'count')::bigint) filter(where x->>'event'='fall_detected'),0) into falls from jsonb_array_elements(report->'events') x;
 return jsonb_build_object('mode','demo_rules','generated_at',clock_timestamp(),'report',report,'paragraphs',jsonb_build_array(
  format('O período contém %s amostras em %s dos 7 dias. A contagem de amostras não comprova monitoramento contínuo.',total,active_days),
  format('%s amostras têm origem simulada. Leituras de demonstração devem ser analisadas separadamente das medições físicas.',simulated),
  format('Foram registrados %s eventos de possível queda. Consulte a avaliação humana no sino; o evento não confirma uma queda.',falls),
  case when total=0 then 'Sem dados suficientes para descrever a semana. Verifique o período, o vínculo e a comunicação do colete.' else 'Use a tabela para comparar valores e quantidade de medições por métrica. Valores ausentes permanecem sem preenchimento e não indicam normalidade.' end
 ));
end;
$$;
revoke all on function public.demo_weekly_analysis(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.demo_weekly_analysis(uuid,uuid,date) to authenticated;
notify pgrst,'reload schema';
create function public.export_weekly_report(p_device_id uuid,p_expected_assignment_id uuid,p_start date) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null or not exists(select 1 from public.demo_subscriptions where profile_id=auth.uid() and plan in ('plus','premium')) then raise exception 'plus required' using errcode='42501'; end if;
 return public.weekly_device_report(p_device_id,p_expected_assignment_id,p_start);
end;
$$;
revoke all on function public.export_weekly_report(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.export_weekly_report(uuid,uuid,date) to authenticated;


-- Migration: 202611100003_more_scenarios.sql
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


-- Migration: 202611100004_ai_quota.sql
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


-- Migration: 202611160001_esp_presence.sql
alter table public.devices add column requires_esp boolean not null default false;
alter table public.devices add column esp_last_seen_at timestamptz;
alter table public.devices add column esp_attached boolean not null default false;
create table private.esp_presence_sessions (
 device_id uuid primary key references public.devices(id), boot_id uuid not null, sequence bigint not null
);
revoke all on private.esp_presence_sessions from public,anon,authenticated;

create function public.record_esp_presence(p_code text,p_token_hash text,p_boot_id uuid,p_sequence bigint,p_attached boolean) returns jsonb
language plpgsql security definer set search_path='' as $$
declare d public.devices; previous private.esp_presence_sessions;
begin
 if p_boot_id is null or p_sequence is null or p_sequence<1 or p_attached is null then return jsonb_build_object('status',400,'error','invalid_payload'); end if;
 if not exists(select 1 from public.devices candidate join private.device_credentials c on c.device_id=candidate.id where candidate.code=p_code and c.token_hash=p_token_hash and c.revoked_at is null) then return jsonb_build_object('status',401,'error','unauthorized'); end if;
 select * into d from public.devices where code=p_code for update;
 if not exists(select 1 from private.device_credentials where device_id=d.id and token_hash=p_token_hash and revoked_at is null) then return jsonb_build_object('status',401,'error','unauthorized'); end if;
 if not d.enabled then return jsonb_build_object('status',403,'error','device_disabled'); end if;
 if not d.requires_esp or d.telemetry_source<>'simulated' then return jsonb_build_object('status',400,'error','demo_device_required'); end if;
 select * into previous from private.esp_presence_sessions where device_id=d.id;
 if previous.boot_id=p_boot_id and previous.sequence>=p_sequence then return jsonb_build_object('status',409,'error','stale_presence'); end if;
 if previous.boot_id=p_boot_id and d.esp_last_seen_at>clock_timestamp()-interval '1 second' and p_attached=d.esp_attached then return jsonb_build_object('status',429,'error','rate_limited'); end if;
 insert into private.esp_presence_sessions values(d.id,p_boot_id,p_sequence) on conflict(device_id) do update set boot_id=excluded.boot_id,sequence=excluded.sequence;
 update public.devices set esp_last_seen_at=clock_timestamp(),esp_attached=p_attached where id=d.id returning * into d;
 return jsonb_build_object('status',200,'accepted',true,'attached',d.esp_attached,'received_at',d.esp_last_seen_at);
end;
$$;
revoke all on function public.record_esp_presence(text,text,uuid,bigint,boolean) from public,anon,authenticated;
grant execute on function public.record_esp_presence(text,text,uuid,bigint,boolean) to service_role;

create function private.require_live_esp() returns trigger
language plpgsql security definer set search_path='' as $$
declare d public.devices;
begin
 select * into d from public.devices where id=new.device_id for update;
 if d.requires_esp and (not d.enabled or not d.esp_attached or d.esp_last_seen_at is null or d.esp_last_seen_at<clock_timestamp()-interval '12 seconds') then
  raise exception 'esp not attached or online' using errcode='55000';
 end if;
 return new;
end;
$$;
revoke all on function private.require_live_esp() from public,anon,authenticated;
create trigger telemetry_requires_live_esp before insert on public.telemetry for each row execute function private.require_live_esp();
notify pgrst,'reload schema';


-- Migration: 202611190001_individual_care.sql
alter table public.people add column care_settings jsonb;
revoke update(care_settings), insert(care_settings) on public.people from anon,authenticated;
create function public.configure_elder_care(p_device_id uuid,p_expected_assignment_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; k text; lo numeric; hi numeric; result jsonb;
begin
 if not public.can_manage_device_profile(p_device_id) then raise exception 'access denied' using errcode='42501'; end if;
 c:=p_data->'care_settings';
 if jsonb_typeof(c) is distinct from 'object' or octet_length(c::text)>6000 then raise exception 'care configuration required' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(c))<>8 or not c ?& array['birth_date','weight_kg','height_cm','medications','professional_reference','heart_rate_bpm','spo2_percent','temperature_c'] then raise exception 'invalid care keys' using errcode='22023'; end if;
 if jsonb_typeof(c->'birth_date') is distinct from 'string' or (c->>'birth_date') !~ '^\d{4}-\d{2}-\d{2}$' or (c->>'birth_date')::date>current_date or (c->>'birth_date')::date<date '1900-01-01'
 or jsonb_typeof(c->'weight_kg') is distinct from 'number' or (c->>'weight_kg')::numeric not between 20 and 400
 or jsonb_typeof(c->'height_cm') is distinct from 'number' or (c->>'height_cm')::numeric not between 80 and 250
 or jsonb_typeof(c->'medications') is distinct from 'string' or length(trim(c->>'medications')) not between 1 and 2000
 or jsonb_typeof(c->'professional_reference') is distinct from 'string' or length(c->>'professional_reference')>500
 then raise exception 'invalid care configuration' using errcode='22023'; end if;
 for k in select unnest(array['heart_rate_bpm','spo2_percent','temperature_c']) loop
  if c->k='null'::jsonb then continue; end if;
  if jsonb_typeof(c->k) is distinct from 'object' then raise exception 'invalid range' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(c->k))<>2 or jsonb_typeof(c->k->'min') is distinct from 'number' or jsonb_typeof(c->k->'max') is distinct from 'number' or length(trim(c->>'professional_reference'))=0 then raise exception 'range reference required' using errcode='22023'; end if;
  lo:=(c->k->>'min')::numeric; hi:=(c->k->>'max')::numeric;
  if lo>=hi or lo<(case k when 'heart_rate_bpm' then 20 when 'spo2_percent' then 50 else 30 end) or hi>(case k when 'heart_rate_bpm' then 250 when 'spo2_percent' then 100 else 43 end) then raise exception 'invalid range limits' using errcode='22023'; end if;
 end loop;
 if nullif(trim(p_data->>'health_conditions'),'') is null then raise exception 'conditions required; record none or unknown explicitly' using errcode='22023'; end if;
 result:=public.complete_device_profile(p_device_id,p_expected_assignment_id,p_data-'care_settings');
 update public.people set care_settings=c where id=(result->>'person_id')::uuid;
 return result;
end $$;
revoke all on function public.configure_elder_care(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.configure_elder_care(uuid,uuid,jsonb) to authenticated;

commit;
