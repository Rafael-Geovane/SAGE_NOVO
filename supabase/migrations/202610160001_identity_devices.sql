-- New Supabase project schema. Never run against unrelated legacy MySQL tables.
create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 display_name text not null check (length(display_name) between 1 and 120),
 role text not null default 'caregiver' check (role in ('admin','caregiver')),
 last_seen_at timestamptz,
 created_at timestamptz not null default now()
);
create table public.people (
 id uuid primary key default gen_random_uuid(), display_name text not null check(length(display_name) between 1 and 120),
 consent_recorded_at timestamptz, consent_recorded_by uuid references public.profiles(id),
 consent_note text check(length(consent_note)<=1000), contact_name text check(length(contact_name)<=120),
 contact_phone text check(contact_phone is null or contact_phone ~ '^\+?[0-9 ()-]{8,25}$'), created_at timestamptz not null default now(),
 check ((consent_recorded_at is null and consent_recorded_by is null) or (consent_recorded_at is not null and consent_recorded_by is not null))
);
create table public.devices (
 id uuid primary key default gen_random_uuid(), code text not null unique check(code ~ '^SGE-[0-9]{3}$'),
 person_id uuid references public.people(id), enabled boolean not null default true,
 firmware_version text check(length(firmware_version)<=80), last_received_at timestamptz,
 latest_recorded_at timestamptz, latest_metrics jsonb, created_at timestamptz not null default now()
);
create table public.caregiver_device_links (
 id uuid primary key default gen_random_uuid(), caregiver_id uuid not null references public.profiles(id),
 device_id uuid not null references public.devices(id), granted_by uuid not null default auth.uid() references public.profiles(id),
 created_at timestamptz not null default now(), revoked_at timestamptz
);
create unique index unique_active_link on public.caregiver_device_links(caregiver_id,device_id) where revoked_at is null;
create index links_device_user on public.caregiver_device_links(device_id,caregiver_id) where revoked_at is null;
create table private.device_credentials (
 device_id uuid primary key references public.devices(id) on delete cascade,
 token_hash text not null unique check(token_hash ~ '^[0-9a-f]{64}$'), rotated_at timestamptz not null default now(),
 window_start timestamptz not null default now(), window_count integer not null default 0
);
alter table private.device_credentials enable row level security;

create function public.is_admin() returns boolean language sql stable security definer set search_path = '' as $$
 select exists(select 1 from public.profiles where id=auth.uid() and role='admin');
$$;
create function public.can_view_device(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_admin() or exists(select 1 from public.caregiver_device_links l join public.devices d on d.id=l.device_id join public.people p on p.id=d.person_id
 where l.device_id=target and l.caregiver_id=auth.uid() and l.revoked_at is null and p.consent_recorded_at is not null);
$$;
create function public.can_view_person(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_admin() or exists(select 1 from public.devices d where d.person_id=target and public.can_view_device(d.id));
$$;
revoke all on function public.is_admin(),public.can_view_device(uuid),public.can_view_person(uuid) from public;
grant execute on function public.is_admin(),public.can_view_device(uuid),public.can_view_person(uuid) to authenticated;

create function private.on_user_created() returns trigger language plpgsql security definer set search_path = '' as $$
begin insert into public.profiles(id,display_name,role) values(new.id,left(coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'),''),'Cuidador'),120),'caregiver'); return new; end;
$$;
create trigger sage_profile_created after insert on auth.users for each row execute function private.on_user_created();
create function public.touch_activity() returns void language sql security definer set search_path = '' as $$
 update public.profiles set last_seen_at=now() where id=auth.uid();
$$;
revoke all on function public.touch_activity() from public;
grant execute on function public.touch_activity() to authenticated;

alter table public.profiles enable row level security;
alter table public.people enable row level security;
alter table public.devices enable row level security;
alter table public.caregiver_device_links enable row level security;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or public.is_admin());
create policy people_read on public.people for select to authenticated using(public.can_view_person(id));
create policy people_admin on public.people for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy device_read on public.devices for select to authenticated using(public.can_view_device(id));
create policy device_admin on public.devices for all to authenticated using(public.is_admin()) with check(public.is_admin());
create policy link_read on public.caregiver_device_links for select to authenticated using(caregiver_id=auth.uid() or public.is_admin());
create policy link_admin on public.caregiver_device_links for all to authenticated using(public.is_admin()) with check(public.is_admin());

-- Column grants prevent device telemetry manipulation even by the admin SPA.
revoke all on public.profiles,public.people,public.devices,public.caregiver_device_links from anon,authenticated;
grant select on public.profiles,public.people,public.devices,public.caregiver_device_links to authenticated;
grant insert(display_name,consent_recorded_at,consent_recorded_by,consent_note,contact_name,contact_phone),update(display_name,consent_recorded_at,consent_recorded_by,consent_note,contact_name,contact_phone) on public.people to authenticated;
grant insert(code,person_id,enabled,firmware_version),update(code,person_id,enabled,firmware_version) on public.devices to authenticated;
grant insert(caregiver_id,device_id,granted_by),update(revoked_at) on public.caregiver_device_links to authenticated;

create function private.check_caregiver_link() returns trigger language plpgsql security definer set search_path = '' as $$
begin
 if not exists(select 1 from public.profiles where id=new.caregiver_id and role='caregiver') then raise exception 'invalid caregiver'; end if;
 if not exists(select 1 from public.devices d join public.people p on p.id=d.person_id where d.id=new.device_id and p.consent_recorded_at is not null) then raise exception 'consent required'; end if;
 if new.granted_by is distinct from auth.uid() then raise exception 'invalid grantor'; end if;
 return new;
end;
$$;
create trigger validate_link before insert on public.caregiver_device_links for each row execute function private.check_caregiver_link();
