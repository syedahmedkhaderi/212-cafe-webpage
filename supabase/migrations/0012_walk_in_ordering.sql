-- 212 Café — ordering without a QR scan
--
-- MVP requirement: a guest must be able to order from the shopfront and the menu
-- without scanning a table code at all.
--
-- `place_order` requires a table token and raises `invalid_table_token` without one.
-- That check is the reason a stranger cannot order against someone else's table, so it
-- is NOT relaxed here. Instead this adds one more real table for orders that genuinely
-- have no table: a row labelled 'Online', with its own active token.
--
-- Everything downstream then works unchanged and unweakened:
--
--   • place_order resolves the token exactly as it does for Table 07, so prices are
--     still read from the menu and modifier rules are still enforced.
--   • orders.table_label is copied from cafe_tables.label, so these land on the kitchen
--     board reading "Online" rather than impersonating a numbered table.
--   • The token is revocable from /admin/tables like any other, which is the off switch
--     for online ordering.
--
-- Deliberately NO new function. docs/DECISIONS.md §5 fixes the anonymous API at exactly
-- three SECURITY DEFINER functions, and the app reads this token from a server-side
-- environment variable instead, so that invariant still holds.
--
-- ⚠ Rate limiting is keyed on the token (0005, 8 requests/minute), so every walk-in
-- order shares ONE bucket. Fine for a demo and a quiet café; if online ordering gets
-- busy, give it a higher ceiling or a token per session rather than raising the limit
-- for real tables too.

insert into cafe_tables (label, seats, state, sort_order)
values ('Online', 1, 'available', 999)
on conflict (label) do nothing;

-- Idempotent: re-running must not mint a second token for the same row.
insert into table_qr_tokens (table_id, is_active)
select t.id, true
from cafe_tables t
where t.label = 'Online'
  and not exists (
    select 1 from table_qr_tokens q where q.table_id = t.id and q.is_active
  );
