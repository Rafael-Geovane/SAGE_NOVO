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
