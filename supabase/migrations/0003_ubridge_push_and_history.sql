-- Web push subscriptions and encrypted history sync for UBridge Messenger.
create table if not exists ubridge.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  failed_at timestamptz
);
create index if not exists idx_ubridge_push_user on ubridge.push_subscriptions(user_id) where failed_at is null;

create table if not exists ubridge.history_packets (
  id uuid primary key default gen_random_uuid(),
  conversation_key text not null,
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  body jsonb not null,
  client_message_id text,
  created_at timestamptz not null default now()
);
create index if not exists idx_ubridge_history_conv on ubridge.history_packets(conversation_key, created_at);
create unique index if not exists idx_ubridge_history_client_id on ubridge.history_packets(conversation_key, client_message_id) where client_message_id is not null;

alter table ubridge.push_subscriptions enable row level security;
alter table ubridge.history_packets enable row level security;

create or replace function public.ubridge_push_save(p_endpoint text, p_p256dh text, p_auth text, p_user_agent text default null)
returns jsonb
language plpgsql
security definer
set search_path = ubridge, public
as $$
declare v_uid uuid;
begin
  v_uid := auth.uid(); if v_uid is null then raise exception 'auth_required'; end if;
  insert into ubridge.push_subscriptions(user_id, endpoint, p256dh, auth, user_agent, updated_at, failed_at)
  values(v_uid, p_endpoint, p_p256dh, p_auth, p_user_agent, now(), null)
  on conflict(endpoint) do update set user_id=v_uid, p256dh=p_p256dh, auth=p_auth, user_agent=p_user_agent, updated_at=now(), failed_at=null;
  return jsonb_build_object('ok', true);
end;
$$;

create or replace function public.ubridge_history_add(p_to uuid, p_body jsonb, p_client_message_id text default null)
returns jsonb
language plpgsql
security definer
set search_path = ubridge, public
as $$
declare v_uid uuid; v_key text; v_id uuid;
begin
  v_uid := auth.uid(); if v_uid is null then raise exception 'auth_required'; end if;
  v_key := case when v_uid::text < p_to::text then v_uid::text || ':' || p_to::text else p_to::text || ':' || v_uid::text end;
  insert into ubridge.history_packets(conversation_key, from_user, to_user, body, client_message_id)
  values(v_key, v_uid, p_to, p_body, p_client_message_id)
  on conflict(conversation_key, client_message_id) where client_message_id is not null do update set body=excluded.body
  returning id into v_id;
  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

create or replace function public.ubridge_history_sync(p_peer uuid, p_after timestamptz default 'epoch')
returns jsonb
language sql
security definer
set search_path = ubridge, public
as $$
  with me as (select auth.uid() uid), k as (
    select case when uid::text < p_peer::text then uid::text || ':' || p_peer::text else p_peer::text || ':' || uid::text end key from me
  )
  select coalesce(jsonb_agg(jsonb_build_object('id',h.id,'from_user',h.from_user,'to_user',h.to_user,'body',h.body,'client_message_id',h.client_message_id,'created_at',h.created_at) order by h.created_at), '[]'::jsonb)
  from ubridge.history_packets h, k
  where h.conversation_key = k.key and h.created_at > p_after;
$$;

grant select, insert, update, delete on ubridge.push_subscriptions to service_role;
grant select, insert, update, delete on ubridge.history_packets to service_role;
revoke all on function public.ubridge_push_save(text,text,text,text) from public, anon, authenticated;
grant execute on function public.ubridge_push_save(text,text,text,text) to authenticated;
revoke all on function public.ubridge_history_add(uuid,jsonb,text) from public, anon, authenticated;
grant execute on function public.ubridge_history_add(uuid,jsonb,text) to authenticated;
revoke all on function public.ubridge_history_sync(uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.ubridge_history_sync(uuid,timestamptz) to authenticated;
notify pgrst, 'reload schema';
