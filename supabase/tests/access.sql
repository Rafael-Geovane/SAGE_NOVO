-- Manual transactional smoke test, run as the local development database owner.
-- Uses disposable UUIDs and always rolls back. No real accounts or hardware.
begin;
insert into auth.users(id,raw_user_meta_data) values
('10000000-0000-4000-8000-000000000001','{"display_name":"TEST ADMIN"}'),
('10000000-0000-4000-8000-000000000002','{"display_name":"TEST CAREGIVER"}'),
('10000000-0000-4000-8000-000000000003','{"display_name":"TEST UNLINKED"}');
update public.profiles set role='admin' where id='10000000-0000-4000-8000-000000000001';
insert into public.people(id,display_name,consent_recorded_at,consent_recorded_by)
values('10000000-0000-4000-8000-000000000004','TEST PERSON',now(),'10000000-0000-4000-8000-000000000001');
insert into public.devices(id,code,person_id) values('10000000-0000-4000-8000-000000000005','SGE-998','10000000-0000-4000-8000-000000000004');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
set local role authenticated;
insert into public.caregiver_device_links(caregiver_id,device_id) values('10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000005');
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$begin if not exists(select 1 from public.devices where code='SGE-998') then raise exception 'linked access failed';end if;end$$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
do $$begin if exists(select 1 from public.devices where code='SGE-998') then raise exception 'unlinked access leaked';end if;end$$;
reset role;
rollback;
