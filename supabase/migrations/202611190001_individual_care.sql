alter table public.people add column care_settings jsonb;
revoke update(care_settings), insert(care_settings) on public.people from anon,authenticated;
create function public.configure_elder_care(p_device_id uuid,p_expected_assignment_id uuid,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c jsonb; k text; lo numeric; hi numeric; result jsonb;
begin
 if not public.can_manage_device_profile(p_device_id) then raise exception 'access denied' using errcode='42501'; end if;
 c:=p_data->'care_settings';
 if jsonb_typeof(c) is distinct from 'object' or octet_length(c::text)>6000 then raise exception 'care configuration required' using errcode='22023'; end if;
 if (select count(*) from jsonb_object_keys(c))<>8 or not c ?& array['birth_date','weight_kg','height_cm','medications','professional_reference','heart_rate_bpm','spo2_percent','temperature_c'] then raise exception 'invalid care keys' using errcode='22023'; end if;
 if jsonb_typeof(c->'birth_date') is distinct from 'string' or (c->>'birth_date') !~ '^\d{4}-\d{2}-\d{2}$' or (c->>'birth_date')::date>current_date or (c->>'birth_date')::date<date '1900-01-01'
 or jsonb_typeof(c->'weight_kg') is distinct from 'number' or (c->>'weight_kg')::numeric not between 20 and 400
 or jsonb_typeof(c->'height_cm') is distinct from 'number' or (c->>'height_cm')::numeric not between 80 and 250
 or jsonb_typeof(c->'medications') is distinct from 'string' or length(trim(c->>'medications')) not between 1 and 2000
 or jsonb_typeof(c->'professional_reference') is distinct from 'string' or length(c->>'professional_reference')>500
 then raise exception 'invalid care configuration' using errcode='22023'; end if;
 for k in select unnest(array['heart_rate_bpm','spo2_percent','temperature_c']) loop
  if c->k='null'::jsonb then continue; end if;
  if jsonb_typeof(c->k) is distinct from 'object' then raise exception 'invalid range' using errcode='22023'; end if;
  if (select count(*) from jsonb_object_keys(c->k))<>2 or jsonb_typeof(c->k->'min') is distinct from 'number' or jsonb_typeof(c->k->'max') is distinct from 'number' or length(trim(c->>'professional_reference'))=0 then raise exception 'range reference required' using errcode='22023'; end if;
  lo:=(c->k->>'min')::numeric; hi:=(c->k->>'max')::numeric;
  if lo>=hi or lo<(case k when 'heart_rate_bpm' then 20 when 'spo2_percent' then 50 else 30 end) or hi>(case k when 'heart_rate_bpm' then 250 when 'spo2_percent' then 100 else 43 end) then raise exception 'invalid range limits' using errcode='22023'; end if;
 end loop;
 if nullif(trim(p_data->>'health_conditions'),'') is null then raise exception 'conditions required; record none or unknown explicitly' using errcode='22023'; end if;
 result:=public.complete_device_profile(p_device_id,p_expected_assignment_id,p_data-'care_settings');
 update public.people set care_settings=c where id=(result->>'person_id')::uuid;
 return result;
end $$;
revoke all on function public.configure_elder_care(uuid,uuid,jsonb) from public,anon,authenticated,service_role;
grant execute on function public.configure_elder_care(uuid,uuid,jsonb) to authenticated;
