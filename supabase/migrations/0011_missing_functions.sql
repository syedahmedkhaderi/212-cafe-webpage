-- 212 Café — the three objects the running app depends on that no migration created
--
-- These existed only in the live database. A fresh clone that applied 0001..0010 got:
--
--   * every /order/[tableToken] 404ing — resolveTableToken() got "function does not
--     exist" from PostgREST, returned null, and the page called notFound()
--   * a staff dashboard that connects to Realtime, stays connected, and silently never
--     receives an event, because `orders` was not in the publication (docs/DECISIONS.md §2)
--   * broken test teardown
--
-- The two function bodies below were dumped from the live project with
-- pg_get_functiondef() rather than reconstructed from their documented behaviour.
-- That distinction matters: `create or replace function` cannot change a function's
-- return type, so a guessed signature would fail on apply against a database that
-- already has the real one.

-- ---------------------------------------------------------------------------------
-- 1. resolve_table_token — one of the three intentional anon-callable SECURITY DEFINER
--    functions (docs/DECISIONS.md §5).
--
--    Opaque token in, table label out. It returns only a label and a seat count, and
--    only for a token the caller already holds, so an enumerated or revoked token
--    resolves to nothing. This is what replaces the incumbent's guessable `?table_id=12`.

create or replace function public.resolve_table_token(p_token text)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object('label', t.label, 'seats', t.seats)
  from public.table_qr_tokens q
  join public.cafe_tables t on t.id = q.table_id
  where q.token = p_token and q.is_active and t.state <> 'disabled';
$$;

revoke all on function public.resolve_table_token(text) from public;
grant execute on function public.resolve_table_token(text) to anon, authenticated;

-- ---------------------------------------------------------------------------------
-- 2. cleanup_test_orders — test teardown, and NOT part of the public API.
--
--    Granted to `authenticated` only, never anon. That grant is the whole point: it is
--    what keeps the anonymous surface at exactly the three functions documented in
--    docs/DECISIONS.md §5. It also only touches `test-%` / `rt-probe-%` idempotency
--    keys, which the app never generates, so it cannot reach a genuine order.

create or replace function public.cleanup_test_orders()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_count integer;
begin
  with cancelled as (
    update public.orders
    set status = 'cancelled'
    where (idempotency_key like 'test-%' or idempotency_key like 'rt-probe-%')
      and status <> 'cancelled'
    returning table_id
  )
  select count(*) into v_count from cancelled;

  -- free any table left occupied by a cancelled test order
  update public.cafe_tables t
  set state = 'available'
  where t.state = 'occupied'
    and not exists (
      select 1 from public.orders o
      where o.table_id = t.id and o.status in ('received', 'preparing', 'ready')
    );

  return v_count;
end;
$$;

revoke all on function public.cleanup_test_orders() from public, anon;
grant execute on function public.cleanup_test_orders() to authenticated;

-- ---------------------------------------------------------------------------------
-- 3. The Realtime publication.
--
--    Without this the kitchen board and the live order dashboard fail in the worst
--    possible way: the channel reports SUBSCRIBED and then nothing ever arrives. A
--    blocked or empty subscription does not throw, so the failure is invisible until
--    an order does not appear in front of the owner.
--
--    These four are exactly what the live project publishes, verified against
--    pg_publication_tables. Staff satisfy private.is_staff(); anon has no SELECT policy
--    on `orders`, so being in the publication delivers a guest nothing — which is why
--    the guest's status page polls instead (docs/DECISIONS.md §2).
--
--    Guarded per table so re-applying this file over a database that already has them
--    is a no-op rather than a duplicate_object error.

do $$
declare
  v_table text;
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  foreach v_table in array array['orders', 'order_status_history', 'menu_items', 'cafe_tables']
  loop
    if not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime'
        and schemaname = 'public'
        and tablename = v_table
    ) then
      execute format('alter publication supabase_realtime add table public.%I', v_table);
    end if;
  end loop;
end
$$;
