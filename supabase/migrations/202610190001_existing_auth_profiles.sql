-- Accounts created before installation also need a profile to finish login.
-- Preserve all existing profiles and roles; editable metadata never grants admin.
insert into public.profiles (id, display_name, role)
select id,
       left(coalesce(nullif(trim(raw_user_meta_data->>'display_name'), ''), 'Cuidador'), 120),
       'caregiver'
from auth.users
on conflict (id) do nothing;
