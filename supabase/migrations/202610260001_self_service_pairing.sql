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
