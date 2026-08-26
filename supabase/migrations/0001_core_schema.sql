-- 212 Café — core schema
-- Money is numeric(10,2) in QAR (exact decimal; never float).
-- Every customer-facing write goes through the server, never the anon client.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- enums

create type staff_role as enum ('owner', 'admin', 'manager', 'staff', 'kitchen');
create type order_status as enum ('received', 'preparing', 'ready', 'served', 'cancelled');
create type table_state as enum ('available', 'occupied', 'disabled');
create type service_type as enum ('dine_in', 'takeaway');

-- ---------------------------------------------------- business settings

-- Single-row table (id is pinned to 1). Hours live here, never in the frontend.
create table business_settings (
  id                integer primary key default 1 check (id = 1),
  name_en           text not null default '212 Café',
  name_ar           text not null default '٢١٢ كافيه',
  tagline_en        text not null default 'Lusail''s Best View',
  tagline_ar        text not null default 'أجمل إطلالة في لوسيل',
  address_en        text not null default 'Marina Twin Tower A, 30th Floor, Lusail, Qatar',
  address_ar        text not null default 'برج مارينا التوأم أ، الطابق الثلاثون، لوسيل، قطر',
  phone             text not null default '+974 7011 2377',
  email             text not null default '212.Qatar.24@gmail.com',
  instagram         text not null default '212cafe.qatar',
  latitude          numeric(9,6),
  longitude         numeric(9,6),
  currency          text not null default 'QAR',
  tax_rate          numeric(5,4) not null default 0 check (tax_rate >= 0 and tax_rate < 1),
  accepting_orders  boolean not null default true,
  logo_path         text,
  updated_at        timestamptz not null default now()
);

-- Opening hours, one row per weekday (0 = Sunday, matching JS getDay()).
create table business_hours (
  day_of_week integer primary key check (day_of_week between 0 and 6),
  opens_at    time,
  closes_at   time,
  is_closed   boolean not null default false,
  -- A close time earlier than open means the café trades past midnight.
  constraint hours_present check (is_closed or (opens_at is not null and closes_at is not null))
);

-- ------------------------------------------------------------- staff

-- Mirrors auth.users; the role here is the single source of authorisation truth.
create table staff (
  id         uuid primary key references auth.users(id) on delete cascade,
  email      text not null unique,
  full_name  text not null default '',
  role       staff_role not null default 'staff',
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);

-- ------------------------------------------------------------- tables

create table cafe_tables (
  id          uuid primary key default gen_random_uuid(),
  label       text not null unique,          -- "07", "Terrace 2"
  seats       integer not null default 2 check (seats > 0),
  state       table_state not null default 'available',
  sort_order  integer not null default 0,
  created_at  timestamptz not null default now()
);

-- The QR payload. Opaque + revocable — deliberately unlike the incumbent's ?table_id=12.
-- Multiple rows per table are allowed so a token can be rotated without downtime.
create table table_qr_tokens (
  token       text primary key default encode(gen_random_bytes(16), 'hex'),
  table_id    uuid not null references cafe_tables(id) on delete cascade,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  revoked_at  timestamptz
);

create index table_qr_tokens_table_idx on table_qr_tokens(table_id) where is_active;

-- --------------------------------------------------------------- menu

create table menu_categories (
  id          uuid primary key default gen_random_uuid(),
  source_id   integer unique,                -- category.id from the crawl, for idempotent re-seeding
  name_en     text not null,
  name_ar     text not null default '',
  slug        text not null unique,
  sort_order  integer not null default 0,
  is_active   boolean not null default true
);

create table menu_items (
  id             uuid primary key default gen_random_uuid(),
  source_id      integer unique,             -- product.id from the crawl
  category_id    uuid not null references menu_categories(id) on delete restrict,
  sku            text,
  name_en        text not null,
  name_ar        text not null default '',
  description_en text not null default '',
  description_ar text not null default '',
  price          numeric(10,2) not null check (price >= 0),
  image_path     text,                       -- Supabase Storage object path
  is_available   boolean not null default true,
  is_signature   boolean not null default false,
  sort_order     integer not null default 0,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index menu_items_category_idx on menu_items(category_id, sort_order);
create index menu_items_available_idx on menu_items(is_available) where is_available;

-- Modifiers the incumbent has no concept of. Today "Extra Milk" is a separate
-- QAR 3 product; here it becomes an option on the drink it belongs to.
create table menu_item_modifier_groups (
  id           uuid primary key default gen_random_uuid(),
  name_en      text not null,
  name_ar      text not null default '',
  -- min/max selectable options: (1,1) = required radio, (0,n) = optional checkboxes
  min_select   integer not null default 0 check (min_select >= 0),
  max_select   integer not null default 1,
  sort_order   integer not null default 0,
  constraint modifier_group_range check (max_select >= min_select and max_select >= 1)
);

create table menu_item_modifier_options (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references menu_item_modifier_groups(id) on delete cascade,
  name_en     text not null,
  name_ar     text not null default '',
  price_delta numeric(10,2) not null default 0 check (price_delta >= 0),
  is_default  boolean not null default false,
  is_available boolean not null default true,
  sort_order  integer not null default 0
);

create index modifier_options_group_idx on menu_item_modifier_options(group_id, sort_order);

-- Which groups apply to which items (many-to-many).
create table menu_item_modifier_links (
  item_id     uuid not null references menu_items(id) on delete cascade,
  group_id    uuid not null references menu_item_modifier_groups(id) on delete cascade,
  sort_order  integer not null default 0,
  primary key (item_id, group_id)
);

-- -------------------------------------------------------------- orders

create table orders (
  id                   uuid primary key default gen_random_uuid(),
  order_number         text not null unique,
  table_id             uuid references cafe_tables(id) on delete set null,
  -- Denormalised so a renamed or deleted table never rewrites order history.
  table_label          text not null default '',
  service              service_type not null default 'dine_in',
  status               order_status not null default 'received',
  subtotal             numeric(10,2) not null default 0 check (subtotal >= 0),
  discount             numeric(10,2) not null default 0 check (discount >= 0),
  tax                  numeric(10,2) not null default 0 check (tax >= 0),
  total                numeric(10,2) not null default 0 check (total >= 0),
  customer_name        text,
  customer_phone       text,
  special_instructions text,
  -- Deduplicates a double-tap on flaky wifi. Unique, so a retry cannot create a second order.
  idempotency_key      text not null unique,
  -- Lets a guest poll their own order without an account, without exposing anyone else's.
  session_token        text not null default encode(gen_random_bytes(16), 'hex'),
  placed_at            timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

create index orders_status_idx on orders(status, placed_at desc);
create index orders_table_idx on orders(table_id, placed_at desc);
create index orders_placed_idx on orders(placed_at desc);

-- unit_price is captured at order time. A later menu price change must never
-- retroactively re-price a historical order.
create table order_items (
  id             uuid primary key default gen_random_uuid(),
  order_id       uuid not null references orders(id) on delete cascade,
  menu_item_id   uuid references menu_items(id) on delete set null,
  name_en        text not null,
  name_ar        text not null default '',
  quantity       integer not null check (quantity > 0 and quantity <= 50),
  unit_price     numeric(10,2) not null check (unit_price >= 0),
  modifiers_total numeric(10,2) not null default 0 check (modifiers_total >= 0),
  line_total     numeric(10,2) not null check (line_total >= 0),
  notes          text
);

create index order_items_order_idx on order_items(order_id);

create table order_item_modifiers (
  id             uuid primary key default gen_random_uuid(),
  order_item_id  uuid not null references order_items(id) on delete cascade,
  option_id      uuid references menu_item_modifier_options(id) on delete set null,
  group_name_en  text not null default '',
  name_en        text not null,
  name_ar        text not null default '',
  price_delta    numeric(10,2) not null default 0
);

create index order_item_modifiers_item_idx on order_item_modifiers(order_item_id);

create table order_status_history (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  status      order_status not null,
  changed_by  uuid references staff(id) on delete set null,
  changed_at  timestamptz not null default now()
);

create index order_status_history_order_idx on order_status_history(order_id, changed_at);

-- ---------------------------------------------------------- promotions

create table promotions (
  id             uuid primary key default gen_random_uuid(),
  name_en        text not null,
  name_ar        text not null default '',
  discount_percent integer check (discount_percent between 1 and 100),
  category_id    uuid references menu_categories(id) on delete cascade,
  starts_at      timestamptz not null,
  ends_at        timestamptz not null,
  is_active      boolean not null default true,
  constraint promo_window check (ends_at > starts_at)
);

-- ---------------------------------------------------------- audit logs

create table audit_logs (
  id          bigserial primary key,
  actor_id    uuid references staff(id) on delete set null,
  actor_email text not null default '',
  action      text not null,               -- 'menu_item.price_changed'
  entity      text not null,               -- 'menu_items'
  entity_id   text,
  before      jsonb,
  after       jsonb,
  created_at  timestamptz not null default now()
);

create index audit_logs_created_idx on audit_logs(created_at desc);

-- --------------------------------------------------- updated_at triggers

create or replace function touch_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger menu_items_touch before update on menu_items
  for each row execute function touch_updated_at();
create trigger orders_touch before update on orders
  for each row execute function touch_updated_at();
create trigger business_settings_touch before update on business_settings
  for each row execute function touch_updated_at();

-- Record every status transition automatically, so history can't drift from state.
create or replace function log_order_status() returns trigger
language plpgsql as $$
begin
  if tg_op = 'INSERT' or new.status is distinct from old.status then
    insert into order_status_history(order_id, status) values (new.id, new.status);
  end if;
  return new;
end;
$$;

create trigger orders_status_log after insert or update of status on orders
  for each row execute function log_order_status();
