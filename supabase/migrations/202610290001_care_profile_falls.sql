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
