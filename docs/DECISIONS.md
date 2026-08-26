# Architecture decisions

## 1. No service-role key in the application

**Decision.** The app ships only the publishable (anon) key. Order creation runs through
`public.place_order()`, a `SECURITY DEFINER` function.

**Why.** A service-role key bypasses RLS entirely; every place it exists is a place it can
leak. Putting the privileged work in one auditable database function means the app has no
secret to lose, and the price calculation lives where it cannot be bypassed — the client
sends `menu_item_id`, `quantity` and `option_ids`, never an amount.

Verified by `tests/security.test.mjs` (15/15) using the anon key alone.

## 2. Customer order status polls; it does not use `postgres_changes`

**Decision.** The customer's order-status page polls `get_order_status(order_number,
session_token)` every 3 seconds. Staff dashboards use Realtime `postgres_changes`.

**Why.** Supabase Realtime enforces RLS. `anon` deliberately has **no** SELECT policy on
`orders`, so a customer subscription silently delivers nothing.

This was measured, not assumed:

```
subscription status: SUBSCRIBED
placed order: A1014
[status flipped to 'preparing' via SQL]
RESULT: anon received 0 realtime event(s)
```

The channel connects and stays connected — it just never fires. Building the demo's
climax ("mark Preparing, the customer's phone updates") on `postgres_changes` would have
failed silently in front of the owner.

**Rejected alternative.** Adding an anon SELECT policy on `orders` to make
`postgres_changes` work. RLS cannot see the guest's session token, so any policy
permissive enough to deliver their row would also expose every other guest's orders —
undoing the guarantee in decision 1.

**Upgrade path.** Realtime *Broadcast* from a trigger on `order_status_history`, on a
topic named by the order's `session_token` (128 bits, unguessable — the same access model
as `get_order_status`). True push with no RLS relaxation. Polling was chosen first because
at café latency it is indistinguishable, and it reuses a function already under test.

Staff dashboards are unaffected: authenticated staff satisfy `private.is_staff()`, and
`orders`, `order_status_history`, `menu_items` and `cafe_tables` are in the
`supabase_realtime` publication.

## 3. Menu images are static assets, not Supabase Storage

**Decision.** The 56 crawled photos live in `public/menu/` as WebP and are served through
`next/image`.

**Why.** The menu is fixed for the demo. Static assets get CDN caching, automatic AVIF
negotiation and responsive variants for free, and need no upload credentials — which also
keeps decision 1 intact. Admin-uploaded images would use Storage later.

Conversion: **25.9 MB → 4.72 MB (82% smaller)**, median 169 KB → 77 KB, largest 2.1 MB →
207 KB. `next/image` reduces the delivered bytes further per device.

## 4. RLS helper functions live in a `private` schema

**Decision.** `is_staff()`, `can_manage()`, `is_owner_or_admin()` and
`current_staff_role()` are in `private`, not `public`.

**Why.** PostgREST exposes every function in `public` as an RPC endpoint, so
`/rest/v1/rpc/is_staff` was publicly callable. Each only reports the *caller's* own role,
so it was not exploitable — but the endpoint had no reason to exist. Supabase's security
advisor went from 8 warnings to 0. Policy expressions still work because `anon` and
`authenticated` hold `EXECUTE` on the schema's functions.

## 5. Three anon-callable `SECURITY DEFINER` functions are intentional

Supabase's security advisor flags `place_order`, `get_order_status` and
`resolve_table_token` as "Public Can Execute SECURITY DEFINER Function". **These
warnings are expected and must not be "fixed".** They are the app's entire public API,
and each carries its own guard:

| Function | Guard |
| --- | --- |
| `place_order` | Validates the table token, reads real prices from the menu, enforces modifier rules, requires an idempotency key |
| `get_order_status` | Requires the order number **and** its 128-bit session token |
| `resolve_table_token` | Returns only a table label, and only for a token the caller already holds |

The contrast with the helpers moved in decision 4 is the point: those were flagged for
the same lint but had no reason to be reachable at all. These three do.

All are covered by `tests/security.test.mjs` (15/15), which attacks them with the anon
key: price tampering, cross-item modifiers, guessed and sequential tokens, unavailable
items, negative quantities, replayed submissions, and reading another guest's order.

A fourth function, `cleanup_test_orders`, exists purely as test teardown. It is granted
to **`authenticated` only** — never anon — so the anon surface stays at exactly the three
above. It also only touches `test-%` / `rt-probe-%` idempotency keys, which the app never
generates, so it cannot reach a genuine order.

**One advisor warning is genuinely outstanding:** *Leaked Password Protection Disabled*.
Enable it in Dashboard → Authentication → Policies to check staff passwords against
HaveIBeenPwned. It needs a dashboard toggle rather than a migration.

**Not yet built (Phase 6):** rate limiting, and audit-log *writes*. The `audit_logs`
table exists and is RLS-guarded, but nothing writes to it yet — do not claim "every admin
action is logged" in the pitch until it does.

## 6. "Extra Milk" and "Extras" are modifiers, not products

**Decision.** Three of the 56 crawled products are excluded from `menu_items` and
re-created as modifier options.

**Why.** They only exist as standalone products because the incumbent POS has no modifier
concept — ordering an oat latte there means adding a separate "Extra Milk – 3.00" line.
Their real prices (QAR 3 and QAR 10) carry over, so nothing is invented.

⚠️ Modifier prices with **no** counterpart in the source data — Size Large (+6), extra
espresso shot (+6), syrups (+3) — are proposals. **Confirm with the owner before quoting.**
