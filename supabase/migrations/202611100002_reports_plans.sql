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
