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
