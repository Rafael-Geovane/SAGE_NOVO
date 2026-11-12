create table public.alerts (
 id uuid primary key default gen_random_uuid(), device_id uuid not null references public.devices(id),
 kind text not null check(kind in ('fall_detected','device_test','technical')),
 severity text not null default 'info' check(severity in ('info','warning','critical')),
 description text not null, status text not null default 'new' check(status in ('new','acknowledged','resolved')),
 created_at timestamptz not null default now(), triaged_by uuid references public.profiles(id), triaged_at timestamptz
);
create index alerts_device_time on public.alerts(device_id,created_at desc);
create table public.support_conversations (
 id uuid primary key default gen_random_uuid(), requester_id uuid not null default auth.uid() references public.profiles(id),
 subject text not null check(length(trim(subject)) between 3 and 160), status text not null default 'open' check(status in ('open','closed')),
 client_request_id uuid not null, created_at timestamptz not null default now(), unique(requester_id,client_request_id)
);
create table public.support_messages (
 id uuid primary key default gen_random_uuid(), conversation_id uuid not null references public.support_conversations(id),
 sender_id uuid not null default auth.uid() references public.profiles(id), body text not null check(length(trim(body)) between 1 and 5000),
 client_message_id uuid not null, created_at timestamptz not null default now(), unique(sender_id,client_message_id)
);
create index support_message_page on public.support_messages(conversation_id,created_at);
create function public.can_view_conversation(target uuid) returns boolean language sql stable security definer set search_path = '' as $$
 select public.is_admin() or exists(select 1 from public.support_conversations where id=target and requester_id=auth.uid());
$$;
revoke all on function public.can_view_conversation(uuid) from public;
grant execute on function public.can_view_conversation(uuid) to authenticated;
alter table public.alerts enable row level security;
alter table public.support_conversations enable row level security;
alter table public.support_messages enable row level security;
create policy alert_read on public.alerts for select to authenticated using(public.can_view_device(device_id));
create policy conversation_read on public.support_conversations for select to authenticated using(requester_id=auth.uid() or public.is_admin());
create policy conversation_insert on public.support_conversations for insert to authenticated with check(requester_id=auth.uid() and status='open');
create policy conversation_admin_update on public.support_conversations for update to authenticated using(public.is_admin()) with check(public.is_admin());
create policy message_read on public.support_messages for select to authenticated using(public.can_view_conversation(conversation_id));
create policy message_insert on public.support_messages for insert to authenticated with check(sender_id=auth.uid() and public.can_view_conversation(conversation_id) and exists(select 1 from public.support_conversations c where c.id=conversation_id and c.status='open'));
revoke all on public.alerts,public.support_conversations,public.support_messages from anon,authenticated;
grant select on public.alerts,public.support_conversations,public.support_messages to authenticated;
grant insert(requester_id,subject,client_request_id) on public.support_conversations to authenticated;
grant update(status) on public.support_conversations to authenticated;
grant insert(conversation_id,sender_id,body,client_message_id) on public.support_messages to authenticated;

create function public.triage_alert(target uuid,new_status text) returns void language plpgsql security definer set search_path = '' as $$
declare a public.alerts;
begin
 select * into a from public.alerts where id=target for update;
 if a.id is null or not public.can_view_device(a.device_id) then raise exception 'access denied' using errcode='42501'; end if;
 if new_status not in ('new','acknowledged','resolved') then raise exception 'invalid status'; end if;
 update public.alerts set status=new_status,triaged_by=auth.uid(),triaged_at=now() where id=target;
end;
$$;
revoke all on function public.triage_alert(uuid,text) from public;
grant execute on function public.triage_alert(uuid,text) to authenticated;
