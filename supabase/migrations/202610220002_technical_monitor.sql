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
