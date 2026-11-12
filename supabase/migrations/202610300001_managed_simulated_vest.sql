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
