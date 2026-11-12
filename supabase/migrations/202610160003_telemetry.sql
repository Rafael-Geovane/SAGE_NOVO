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
