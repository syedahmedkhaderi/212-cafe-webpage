-- 212 Café — order placement
--
-- The client sends menu_item_id, quantity and option_ids. It NEVER sends a price.
-- Every amount on the order is computed here from the menu table, so a tampered
-- payload ("price": 0.01) has nothing to tamper with.
--
-- Running this as SECURITY DEFINER means the app needs no service-role key to take an
-- order: anon can call this one function, and can still read nothing it shouldn't.

create sequence if not exists order_number_seq start 1000;

create or replace function public.place_order(
  p_table_token     text,
  p_items           jsonb,
  p_idempotency_key text,
  p_customer_name   text default null,
  p_customer_phone  text default null,
  p_notes           text default null
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_table_id      uuid;
  v_table_label   text;
  v_existing      public.orders%rowtype;
  v_order_id      uuid;
  v_order_number  text;
  v_session       text;
  v_subtotal      numeric(10,2) := 0;
  v_tax           numeric(10,2);
  v_total         numeric(10,2);
  v_tax_rate      numeric(5,4);
  v_accepting     boolean;
  v_item          jsonb;
  v_menu          public.menu_items%rowtype;
  v_qty           integer;
  v_mods_total    numeric(10,2);
  v_line          numeric(10,2);
  v_order_item_id uuid;
  v_opt           public.menu_item_modifier_options%rowtype;
  v_option_ids    uuid[];
  v_opt_id        uuid;
  v_group         record;
  v_count         integer;
begin
  if p_idempotency_key is null or length(p_idempotency_key) < 8 then
    raise exception 'invalid_idempotency_key' using errcode = '22023';
  end if;

  -- Replay protection. A double-tap on flaky wifi returns the FIRST order, never a second one.
  select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'order_number', v_existing.order_number,
      'session_token', v_existing.session_token,
      'total', v_existing.total,
      'status', v_existing.status,
      'replayed', true);
  end if;

  select accepting_orders, tax_rate into v_accepting, v_tax_rate
  from public.business_settings where id = 1;
  if not coalesce(v_accepting, false) then
    raise exception 'not_accepting_orders' using errcode = '22023';
  end if;

  -- Opaque token in, table out. An enumerated or revoked token resolves to nothing.
  select t.id, t.label into v_table_id, v_table_label
  from public.table_qr_tokens q
  join public.cafe_tables t on t.id = q.table_id
  where q.token = p_table_token and q.is_active and t.state <> 'disabled';
  if v_table_id is null then
    raise exception 'invalid_table_token' using errcode = '22023';
  end if;

  if p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) = 0
     or jsonb_array_length(p_items) > 40 then
    raise exception 'invalid_items' using errcode = '22023';
  end if;

  v_order_number := 'A' || nextval('public.order_number_seq')::text;

  insert into public.orders (order_number, table_id, table_label, idempotency_key,
                             customer_name, customer_phone, special_instructions)
  values (v_order_number, v_table_id, v_table_label, p_idempotency_key,
          nullif(left(coalesce(p_customer_name, ''), 80), ''),
          nullif(left(coalesce(p_customer_phone, ''), 30), ''),
          nullif(left(coalesce(p_notes, ''), 500), ''))
  returning id, session_token into v_order_id, v_session;

  for v_item in select * from jsonb_array_elements(p_items) loop
    v_qty := coalesce((v_item->>'quantity')::integer, 0);
    if v_qty < 1 or v_qty > 50 then
      raise exception 'invalid_quantity' using errcode = '22023';
    end if;

    -- The real price, read from the menu. Unavailable items cannot be ordered at all.
    select * into v_menu from public.menu_items
    where id = (v_item->>'menu_item_id')::uuid and is_available;
    if not found then
      raise exception 'item_unavailable' using errcode = '22023';
    end if;

    select coalesce(array_agg(x::uuid), '{}') into v_option_ids
    from jsonb_array_elements_text(coalesce(v_item->'option_ids', '[]'::jsonb)) as x;

    -- Each option must belong to a group actually linked to THIS item, so you cannot
    -- attach a cheap modifier from an unrelated product.
    v_mods_total := 0;
    foreach v_opt_id in array v_option_ids loop
      select o.* into v_opt
      from public.menu_item_modifier_options o
      join public.menu_item_modifier_links l on l.group_id = o.group_id
      where o.id = v_opt_id and o.is_available and l.item_id = v_menu.id;
      if not found then
        raise exception 'invalid_modifier' using errcode = '22023';
      end if;
      v_mods_total := v_mods_total + v_opt.price_delta;
    end loop;

    -- Honour each group's min/max selection rules server-side too.
    for v_group in
      select g.id, g.min_select, g.max_select
      from public.menu_item_modifier_groups g
      join public.menu_item_modifier_links l on l.group_id = g.id
      where l.item_id = v_menu.id
    loop
      select count(*) into v_count
      from public.menu_item_modifier_options o
      where o.group_id = v_group.id and o.id = any(v_option_ids);
      if v_count < v_group.min_select or v_count > v_group.max_select then
        raise exception 'modifier_rule_violation' using errcode = '22023';
      end if;
    end loop;

    v_line := (v_menu.price + v_mods_total) * v_qty;
    v_subtotal := v_subtotal + v_line;

    -- unit_price is frozen here; a later menu price change cannot rewrite this order.
    insert into public.order_items (order_id, menu_item_id, name_en, name_ar, quantity,
                                    unit_price, modifiers_total, line_total, notes)
    values (v_order_id, v_menu.id, v_menu.name_en, v_menu.name_ar, v_qty,
            v_menu.price, v_mods_total, v_line,
            nullif(left(coalesce(v_item->>'notes', ''), 200), ''))
    returning id into v_order_item_id;

    insert into public.order_item_modifiers (order_item_id, option_id, group_name_en,
                                             name_en, name_ar, price_delta)
    select v_order_item_id, o.id, g.name_en, o.name_en, o.name_ar, o.price_delta
    from public.menu_item_modifier_options o
    join public.menu_item_modifier_groups g on g.id = o.group_id
    where o.id = any(v_option_ids);
  end loop;

  v_tax := round(v_subtotal * coalesce(v_tax_rate, 0), 2);
  v_total := v_subtotal + v_tax;

  update public.orders
  set subtotal = v_subtotal, tax = v_tax, total = v_total
  where id = v_order_id;

  update public.cafe_tables set state = 'occupied'
  where id = v_table_id and state = 'available';

  return jsonb_build_object(
    'order_number', v_order_number,
    'session_token', v_session,
    'total', v_total,
    'status', 'received',
    'replayed', false);

exception
  -- Two concurrent submits of the same key: one wins the unique index, the other
  -- lands here and returns the winner rather than erroring at the customer.
  when unique_violation then
    select * into v_existing from public.orders where idempotency_key = p_idempotency_key;
    if found then
      return jsonb_build_object(
        'order_number', v_existing.order_number,
        'session_token', v_existing.session_token,
        'total', v_existing.total,
        'status', v_existing.status,
        'replayed', true);
    end if;
    raise;
end;
$$;

-- Lets a guest follow their own order with no account. Requires BOTH the order number
-- and the 128-bit session token issued at placement, so order numbers stay unguessable
-- as an access control mechanism.
create or replace function public.get_order_status(
  p_order_number  text,
  p_session_token text
) returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'order_number', o.order_number,
    'status', o.status,
    'table_label', o.table_label,
    'total', o.total,
    'placed_at', o.placed_at,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'name_en', i.name_en, 'name_ar', i.name_ar,
        'quantity', i.quantity, 'line_total', i.line_total,
        'modifiers', coalesce((
          select jsonb_agg(jsonb_build_object('name_en', m.name_en, 'name_ar', m.name_ar))
          from public.order_item_modifiers m where m.order_item_id = i.id), '[]'::jsonb)
      ) order by i.id)
      from public.order_items i where i.order_id = o.id), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('status', h.status, 'at', h.changed_at)
             order by h.changed_at)
      from public.order_status_history h where h.order_id = o.id), '[]'::jsonb))
  from public.orders o
  where o.order_number = p_order_number
    and o.session_token = p_session_token;
$$;

revoke all on function public.place_order(text, jsonb, text, text, text, text) from public;
revoke all on function public.get_order_status(text, text) from public;
grant execute on function public.place_order(text, jsonb, text, text, text, text) to anon, authenticated;
grant execute on function public.get_order_status(text, text) to anon, authenticated;
