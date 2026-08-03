-- UBridge Messenger schema. Uses the existing Supabase auth.users table.
-- Minimal public profile table + realtime presence table requested by design.

create schema if not exists ubridge;
revoke all on schema ubridge from public, anon, authenticated;
grant usage on schema ubridge to service_role;

do $$ begin
  create type ubridge.signal_kind as enum ('offer','answer','candidate','hangup');
exception when duplicate_object then null; end $$;

create table if not exists ubridge.users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists ubridge.realtime (
  user_id uuid primary key references auth.users(id) on delete cascade,
  online boolean not null default false,
  relay text,
  status text not null default 'offline',
  last_seen timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- WebRTC signaling only. Payload is SDP/ICE JSON; chat data goes P2P datachannel.
create table if not exists ubridge.signals (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  kind ubridge.signal_kind not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  consumed_at timestamptz
);
create index if not exists idx_ubridge_signals_to on ubridge.signals(to_user, created_at desc) where consumed_at is null;

-- Optional encrypted/fallback queue for offline messages. Body is opaque to DB.
create table if not exists ubridge.queue_messages (
  id uuid primary key default gen_random_uuid(),
  from_user uuid not null references auth.users(id) on delete cascade,
  to_user uuid not null references auth.users(id) on delete cascade,
  body jsonb not null,
  created_at timestamptz not null default now(),
  delivered_at timestamptz
);
create index if not exists idx_ubridge_queue_to on ubridge.queue_messages(to_user, created_at desc) where delivered_at is null;

alter table ubridge.users enable row level security;
alter table ubridge.realtime enable row level security;
alter table ubridge.signals enable row level security;
alter table ubridge.queue_messages enable row level security;

-- Expose safe views in public so PostgREST can serve them without exposing schema.
create or replace view public.ubridge_users_v as
select u.user_id, u.name, coalesce(r.online,false) as online, r.status, r.relay, r.last_seen
from ubridge.users u
left join ubridge.realtime r on r.user_id = u.user_id;

create or replace view public.ubridge_signals_w as select * from ubridge.signals;
create or replace view public.ubridge_queue_w as select * from ubridge.queue_messages;

create or replace function public.ubridge_upsert_me(p_name text, p_relay text default null, p_status text default 'online')
returns jsonb
language plpgsql
security definer
set search_path = ubridge, public
as $$
declare v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'auth_required'; end if;

  insert into ubridge.users(user_id, name, updated_at)
  values (v_uid, coalesce(nullif(trim(p_name),''),'UBridge User'), now())
  on conflict(user_id) do update set name = excluded.name, updated_at = now();

  insert into ubridge.realtime(user_id, online, relay, status, last_seen, updated_at)
  values (v_uid, true, p_relay, coalesce(p_status,'online'), now(), now())
  on conflict(user_id) do update set online = true, relay = p_relay, status = coalesce(p_status,'online'), last_seen = now(), updated_at = now();

  return jsonb_build_object('ok', true, 'user_id', v_uid);
end;
$$;

create or replace function public.ubridge_offline()
returns void
language plpgsql
security definer
set search_path = ubridge, public
as $$
begin
  update ubridge.realtime set online = false, status = 'offline', updated_at = now() where user_id = auth.uid();
end;
$$;

revoke all on public.ubridge_users_v from public, anon, authenticated;
grant select on public.ubridge_users_v to authenticated;
revoke all on public.ubridge_signals_w from public, anon, authenticated;
grant select, insert, update on public.ubridge_signals_w to authenticated;
revoke all on public.ubridge_queue_w from public, anon, authenticated;
grant select, insert, update on public.ubridge_queue_w to authenticated;
revoke all on function public.ubridge_upsert_me(text,text,text) from public, anon, authenticated;
grant execute on function public.ubridge_upsert_me(text,text,text) to authenticated;
revoke all on function public.ubridge_offline() from public, anon, authenticated;
grant execute on function public.ubridge_offline() to authenticated;

-- RLS for views forwards to base table rules; keep service_role for server/admin.
grant select, insert, update, delete on all tables in schema ubridge to service_role;
notify pgrst, 'reload schema';
