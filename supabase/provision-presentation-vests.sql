-- Run in the administrative SQL Editor of the existing Sage project.
-- Provision only: no people, readings, alerts or public access are seeded.
begin;
do $$
declare vest_code text; vest public.devices; presenter uuid; actor uuid;
begin
 select p.id into actor from public.profiles p join auth.users u on u.id=p.id
 where p.role='admin' and lower(u.email)='rafawloficial@gmail.com';
 select m.profile_id into presenter from private.device_profile_managers m
 join public.devices d on d.id=m.device_id where d.code='SGE-067';
 if actor is null or presenter is null then raise exception 'Existing presentation administrator and manager required'; end if;
 foreach vest_code in array array['SGE-005','SGE-006'] loop
  insert into public.devices(code,enabled,telemetry_source,requires_esp,firmware_version)
  values(vest_code,true,'simulated',false,'presentation-browser-v1')
  on conflict(code) do nothing;
  select * into vest from public.devices d where d.code=vest_code for update;
  if not vest.enabled or vest.telemetry_source<>'simulated' or vest.requires_esp then
   raise exception 'Existing vest % has incompatible configuration; review manually',vest_code;
  end if;
  if not exists(select 1 from private.device_credentials c where c.device_id=vest.id and c.revoked_at is null) then
   perform public.rotate_device_credential(vest.id,encode(sha256(convert_to(gen_random_uuid()::text||gen_random_uuid()::text,'UTF8')),'hex'),actor,'Presentation browser controls provisioning');
  end if;
  if exists(select 1 from private.device_profile_managers m where m.device_id=vest.id and m.profile_id<>presenter) then
   raise exception 'Existing manager for % differs; review manually',vest_code;
  end if;
  insert into private.device_profile_managers(device_id,profile_id,assignment_id)
  values(vest.id,presenter,vest.assignment_id)
  on conflict(device_id) do update set assignment_id=excluded.assignment_id;
 end loop;
end $$;
commit;
