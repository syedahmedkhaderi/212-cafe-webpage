-- 212 Café — Phase 6: audit logging and rate limiting
--
-- Both are enforced in the database rather than the app. An audit trail the client
-- can decline to write is not an audit trail, and a rate limit in the browser is a
-- suggestion.

-- ------------------------------------------------------------- audit logging

-- Triggers run as the caller, so auth.uid() still identifies the staff member.
create or replace function log_audit() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
  v_before jsonb;
  v_after  jsonb;
  v_action text;
begin
  select s.email into v_email from public.staff s where s.id = v_actor;

  if tg_op = 'INSERT' then
    v_after := to_jsonb(new);
    v_action := tg_table_name || '.created';
  elsif tg_op = 'DELETE' then
    v_before := to_jsonb(old);
    v_action := tg_table_name || '.deleted';
  else
    v_before := to_jsonb(old);
    v_after := to_jsonb(new);
    -- Name the interesting menu changes specifically; the owner cares about price
    -- moves and sold-out flips, not about updated_at ticking over.
    if tg_table_name = 'menu_items' then
      if old.price is distinct from new.price then
        v_action := 'menu_items.price_changed';
      elsif old.is_available is distinct from new.is_available then
        v_action := case when new.is_available
                    then 'menu_items.marked_available'
                    else 'menu_items.marked_sold_out' end;
      else
        v_action := 'menu_items.updated';
      end if;
    else
      v_action := tg_table_name || '.updated';
    end if;

    -- Skip no-op updates so the log stays readable.
    if v_before - 'updated_at' = v_after - 'updated_at' then
      return coalesce(new, old);
    end if;
  end if;

  insert into public.audit_logs (actor_id, actor_email, action, entity, entity_id, before, after)
  values (v_actor, coalesce(v_email, ''), v_action, tg_table_name,
          coalesce((v_after->>'id'), (v_before->>'id')), v_before, v_after);

  return coalesce(new, old);
end;
$$;

create trigger menu_items_audit
  after insert or update or delete on menu_items
  for each row execute function log_audit();

create trigger business_settings_audit
  after update on business_settings
  for each row execute function log_audit();

create trigger business_hours_audit
  after insert or update or delete on business_hours
  for each row execute function log_audit();

create trigger staff_audit
  after insert or update or delete on staff
  for each row execute function log_audit();

create trigger promotions_audit
  after insert or update or delete on promotions
  for each row execute function log_audit();

create trigger qr_tokens_audit
  after insert or update on table_qr_tokens
  for each row execute function log_audit();

-- Order cancellations are worth recording; ordinary progression through
-- received → preparing → ready → served is already in order_status_history.
create or replace function log_order_cancellation() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_actor uuid := (select auth.uid());
  v_email text;
begin
  if new.status = 'cancelled' and old.status is distinct from 'cancelled' then
    select s.email into v_email from public.staff s where s.id = v_actor;
    insert into public.audit_logs (actor_id, actor_email, action, entity, entity_id, before, after)
    values (v_actor, coalesce(v_email, ''), 'orders.cancelled', 'orders', new.id::text,
            jsonb_build_object('status', old.status, 'total', old.total),
            jsonb_build_object('status', new.status, 'order_number', new.order_number));
  end if;
  return new;
end;
$$;

create trigger orders_cancellation_audit
  after update of status on orders
  for each row execute function log_order_cancellation();

-- -------------------------------------------------------------- rate limiting

-- One row per table token per window. Kept deliberately small and self-pruning.
create table order_rate_limit (
  table_token   text primary key,
  window_start  timestamptz not null default now(),
  request_count integer not null default 0
);

alter table order_rate_limit enable row level security;
-- No policy at all: only SECURITY DEFINER functions touch this. Anon and authenticated
-- clients can neither read nor write it.

create or replace function check_order_rate_limit(p_table_token text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_window  constant interval := interval '1 minute';
  v_max     constant integer  := 8;   -- a real table ordering 8 times a minute is abuse
  v_count   integer;
begin
  delete from public.order_rate_limit where window_start < now() - interval '10 minutes';

  insert into public.order_rate_limit (table_token, window_start, request_count)
  values (p_table_token, now(), 1)
  on conflict (table_token) do update
    set request_count = case
          when public.order_rate_limit.window_start < now() - v_window then 1
          else public.order_rate_limit.request_count + 1
        end,
        window_start = case
          when public.order_rate_limit.window_start < now() - v_window then now()
          else public.order_rate_limit.window_start
        end
  returning request_count into v_count;

  if v_count > v_max then
    -- PostgREST maps SQLSTATE PTxxx to that HTTP status, so this surfaces as a
    -- real 429 rather than a 500: a throttled request is not a server error.
    raise exception 'rate_limited' using errcode = 'PT429';
  end if;
end;
$$;

revoke all on function check_order_rate_limit(text) from public, anon, authenticated;
