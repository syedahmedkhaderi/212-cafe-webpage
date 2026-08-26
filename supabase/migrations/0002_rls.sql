-- 212 Café — Row Level Security
--
-- Threat model: the anon key ships to every phone that scans a QR code. Assume it is
-- public. Therefore anon may read ONLY the published menu and public business info.
-- Orders, tables, QR tokens, staff and audit logs are never readable with the anon key
-- under any circumstance — all order flow runs server-side with the service role, which
-- bypasses RLS by design.

-- ------------------------------------------------------------- helpers
--
-- These live in `private`, not `public`, on purpose. PostgREST only exposes schemas on
-- its search path, so a helper in `public` would also be callable as
-- /rest/v1/rpc/is_staff. Each only ever reports the CALLER's own role, so exposure was
-- not exploitable — but an endpoint that need not exist should not exist.

create schema if not exists private;
revoke all on schema private from anon, authenticated;
grant usage on schema private to anon, authenticated;

-- security definer so policies on `staff` don't recurse when checking `staff`.
-- search_path is pinned to defeat search_path hijacking.
create or replace function private.current_staff_role()
returns public.staff_role
language sql
stable
security definer
set search_path = ''
as $$
  select s.role
  from public.staff s
  where s.id = (select auth.uid()) and s.is_active
$$;

create or replace function private.is_staff()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.staff s
    where s.id = (select auth.uid()) and s.is_active
  )
$$;

-- Menu/settings edits: managers and up. Plain staff and kitchen are read-only there.
create or replace function private.can_manage()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_staff_role() in ('owner', 'admin', 'manager')
$$;

create or replace function private.is_owner_or_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.current_staff_role() in ('owner', 'admin')
$$;

-- Policy expressions are evaluated as the querying role, so anon/authenticated need
-- EXECUTE on the helpers even though the schema itself is not exposed via the API.
grant execute on function private.current_staff_role(), private.is_staff(),
                         private.can_manage(), private.is_owner_or_admin()
  to anon, authenticated;

-- --------------------------------------------------- enable RLS everywhere

alter table business_settings          enable row level security;
alter table business_hours             enable row level security;
alter table staff                      enable row level security;
alter table cafe_tables                enable row level security;
alter table table_qr_tokens            enable row level security;
alter table menu_categories            enable row level security;
alter table menu_items                 enable row level security;
alter table menu_item_modifier_groups  enable row level security;
alter table menu_item_modifier_options enable row level security;
alter table menu_item_modifier_links   enable row level security;
alter table orders                     enable row level security;
alter table order_items                enable row level security;
alter table order_item_modifiers       enable row level security;
alter table order_status_history       enable row level security;
alter table promotions                 enable row level security;
alter table audit_logs                 enable row level security;

-- ------------------------------------------- public read: menu + business

create policy "public reads settings" on business_settings
  for select to anon, authenticated using (true);
create policy "managers update settings" on business_settings
  for update to authenticated using (private.can_manage()) with check (private.can_manage());

create policy "public reads hours" on business_hours
  for select to anon, authenticated using (true);
create policy "managers write hours" on business_hours
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

create policy "public reads active categories" on menu_categories
  for select to anon, authenticated using (is_active or private.is_staff());
create policy "managers write categories" on menu_categories
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

-- Anon sees only what is actually on sale. Staff see everything, including
-- items toggled unavailable, so the admin list stays complete.
create policy "public reads available items" on menu_items
  for select to anon, authenticated using (is_available or private.is_staff());
create policy "managers write items" on menu_items
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

create policy "public reads modifier groups" on menu_item_modifier_groups
  for select to anon, authenticated using (true);
create policy "managers write modifier groups" on menu_item_modifier_groups
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

create policy "public reads modifier options" on menu_item_modifier_options
  for select to anon, authenticated using (is_available or private.is_staff());
create policy "managers write modifier options" on menu_item_modifier_options
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

create policy "public reads modifier links" on menu_item_modifier_links
  for select to anon, authenticated using (true);
create policy "managers write modifier links" on menu_item_modifier_links
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

create policy "public reads active promotions" on promotions
  for select to anon, authenticated
  using ((is_active and now() between starts_at and ends_at) or private.is_staff());
create policy "managers write promotions" on promotions
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

-- ------------------------------------------------------- staff-only reads
--
-- No `to anon` policy on any table below. With RLS enabled and no permissive
-- policy for anon, every anon read returns zero rows.

create policy "staff read staff" on staff
  for select to authenticated using (private.is_staff());
create policy "owners write staff" on staff
  for all to authenticated using (private.is_owner_or_admin()) with check (private.is_owner_or_admin());

create policy "staff read tables" on cafe_tables
  for select to authenticated using (private.is_staff());
create policy "staff update table state" on cafe_tables
  for update to authenticated using (private.is_staff()) with check (private.is_staff());
create policy "managers write tables" on cafe_tables
  for insert to authenticated with check (private.can_manage());
create policy "managers delete tables" on cafe_tables
  for delete to authenticated using (private.can_manage());

-- QR tokens are credentials. Even authenticated staff below manager cannot list them,
-- and anon can never resolve one — resolution happens server-side only.
create policy "managers read qr tokens" on table_qr_tokens
  for select to authenticated using (private.can_manage());
create policy "managers write qr tokens" on table_qr_tokens
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

create policy "staff read orders" on orders
  for select to authenticated using (private.is_staff());
create policy "staff update orders" on orders
  for update to authenticated using (private.is_staff()) with check (private.is_staff());

create policy "staff read order items" on order_items
  for select to authenticated using (private.is_staff());
create policy "staff read order modifiers" on order_item_modifiers
  for select to authenticated using (private.is_staff());
create policy "staff read status history" on order_status_history
  for select to authenticated using (private.is_staff());

-- Audit logs are append-only from the app's perspective: readable by owners/admins,
-- writable by nobody through the client. Inserts happen server-side only.
create policy "owners read audit logs" on audit_logs
  for select to authenticated using (private.is_owner_or_admin());
