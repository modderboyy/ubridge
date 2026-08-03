-- Production helpers for UBridge Messenger: cleanup, signaling RPC, queue delivery.
create or replace function public.ubridge_cleanup()
returns void
language sql
security definer
set search_path = ubridge, public
as $$
  delete from ubridge.signals where created_at < now() - interval '10 minutes' or consumed_at < now() - interval '2 minutes';
  delete from ubridge.queue_messages where delivered_at < now() - interval '7 days';
  update ubridge.realtime set online=false, status='offline'
    where online=true and last_seen < now() - interval '90 seconds';
$$;

create or replace function public.ubridge_signal(p_to uuid, p_kind text, p_payload jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ubridge, public
as $$
declare v_id uuid; v_uid uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'auth_required'; end if;
  insert into ubridge.signals(from_user,to_user,kind,payload)
  values(v_uid,p_to,p_kind::ubridge.signal_kind,p_payload)
  returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.ubridge_poll_signals()
returns jsonb
language plpgsql
security definer
set search_path = ubridge, public
as $$
declare v_uid uuid; v_rows jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'auth_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'from_user',from_user,'to_user',to_user,'kind',kind,'payload',payload,'created_at',created_at) order by created_at), '[]'::jsonb)
    into v_rows
  from ubridge.signals
  where to_user=v_uid and consumed_at is null;
  update ubridge.signals set consumed_at=now() where to_user=v_uid and consumed_at is null;
  return v_rows;
end;
$$;

create or replace function public.ubridge_queue_send(p_to uuid, p_body jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ubridge, public
as $$
declare v_uid uuid; v_id uuid;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'auth_required'; end if;
  insert into ubridge.queue_messages(from_user,to_user,body) values(v_uid,p_to,p_body) returning id into v_id;
  return jsonb_build_object('ok',true,'id',v_id);
end;
$$;

create or replace function public.ubridge_queue_drain()
returns jsonb
language plpgsql
security definer
set search_path = ubridge, public
as $$
declare v_uid uuid; v_rows jsonb;
begin
  v_uid := auth.uid();
  if v_uid is null then raise exception 'auth_required'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('id',id,'from_user',from_user,'to_user',to_user,'body',body,'created_at',created_at) order by created_at), '[]'::jsonb)
    into v_rows
  from ubridge.queue_messages
  where to_user=v_uid and delivered_at is null;
  update ubridge.queue_messages set delivered_at=now() where to_user=v_uid and delivered_at is null;
  return v_rows;
end;
$$;

revoke all on function public.ubridge_cleanup() from public, anon, authenticated;
grant execute on function public.ubridge_cleanup() to service_role, authenticated;
revoke all on function public.ubridge_signal(uuid,text,jsonb) from public, anon, authenticated;
grant execute on function public.ubridge_signal(uuid,text,jsonb) to authenticated;
revoke all on function public.ubridge_poll_signals() from public, anon, authenticated;
grant execute on function public.ubridge_poll_signals() to authenticated;
revoke all on function public.ubridge_queue_send(uuid,jsonb) from public, anon, authenticated;
grant execute on function public.ubridge_queue_send(uuid,jsonb) to authenticated;
revoke all on function public.ubridge_queue_drain() from public, anon, authenticated;
grant execute on function public.ubridge_queue_drain() to authenticated;
notify pgrst, 'reload schema';
