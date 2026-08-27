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

**Phase 6 is now built** — see decision 9. Two further functions exist, both invisible
to clients: `check_order_rate_limit` (granted to nobody; called only from inside
`place_order`) and `log_audit` (a trigger function).

## 6. "Extra Milk" and "Extras" are modifiers, not products

**Decision.** Three of the 56 crawled products are excluded from `menu_items` and
re-created as modifier options.

**Why.** They only exist as standalone products because the incumbent POS has no modifier
concept — ordering an oat latte there means adding a separate "Extra Milk – 3.00" line.
Their real prices (QAR 3 and QAR 10) carry over, so nothing is invented.

⚠️ Modifier prices with **no** counterpart in the source data — Size Large (+6), extra
espresso shot (+6), syrups (+3) — are proposals. **Confirm with the owner before quoting.**

## 7. Language is a cookie, chosen up front, switchable everywhere

**Decision.** Locale lives in a `212_locale` cookie read server-side. A first-visit
picker offers English / العربية full-screen; after that a labelled `EN | العربية`
switcher sits in the header on every page, and again in the footer.

**Why a picker rather than only a toggle.** The café is in Qatar and serves both
languages. A visitor should not have to recognise a globe icon, or notice a two-letter
toggle, to read the site in their own language. It appears once — choosing either option
sets the cookie, so it never interrupts a returning visitor.

**Why a cookie rather than `/ar` routes.** The menu content is already bilingual in the
database (all 53 items carry an Arabic name), so there is no second set of pages to
generate. The cost is that pages read cookies and therefore cannot be fully static —
`/menu` was already `force-dynamic` for availability, and the homepage revalidates.

Before any choice is made, `Accept-Language` decides: a browser asking for `ar` gets
Arabic immediately.

`<html lang>` and `dir` are set server-side, so direction is correct before any
JavaScript runs. Prices, phone numbers and order numbers are wrapped `dir="ltr"` so
Latin runs do not get reordered inside Arabic text.

## 8. Two CSS traps worth remembering

**Cormorant renders `212` as `2I2`.** It defaults to old-style figures, which is fatal
for a brand that is a number. `.display` forces `lining-nums`.

**Unlayered CSS beats Tailwind utilities.** Tailwind 4 emits utilities into a cascade
layer; unlayered rules win over layered ones *regardless of specificity*. A bare
`color: var(--muted)` inside `.eyebrow` therefore silently overrode `text-bone/90` and
left the hero eyebrow unreadable against the sky. The default now sits inside
`@layer components`. Text sitting directly on photography also carries `.on-photo`
(a text shadow), because a scrim gradient cannot be tuned for every viewport height.

## 9. Audit logging and rate limiting live in the database

**Decision.** Audit entries are written by triggers; the order rate limit is checked
inside `place_order`.

**Why.** An audit trail the client can decline to write is not an audit trail, and a
rate limit in the browser is a suggestion. Both survive a caller that talks straight to
PostgREST with the publishable key.

Logged: menu price changes (with before/after), sold-out flips, item create/delete,
hours and settings edits, staff changes, QR token issue/revoke, and order cancellations.
Ordinary `received → preparing → ready → served` progression is not logged — it already
lives in `order_status_history`. No-op updates are skipped so the log stays readable.
Visible to owners and admins at `/admin/activity`.

Rate limit: **8 orders per table token per minute**, keyed on the token so one abusive
table cannot block the room. The check runs *after* the token is validated, so an invalid
token cannot be used to fill the counter table. `order_rate_limit` has RLS enabled and
**no policy at all** — only `SECURITY DEFINER` functions touch it.

A throttled request returns **HTTP 429**, not 500: the exception uses SQLSTATE `PT429`,
which PostgREST maps to that status. The ordering app shows "please wait a moment"
rather than a generic failure. Verified in `tests/audit-ratelimit.test.mjs` (13/13).

## 10. Admin writes go through Server Actions, forwarding the staff member's JWT

**Decision.** Admin mutations that touch cached data live in `src/app/admin/actions.ts`.
Each takes the signed-in manager's access token and builds a **per-call** Supabase client
carrying it as a bearer token.

**Why not `@supabase/ssr`.** The session is stored in localStorage by the plain
`createClient` in `supabase/client.ts`, so nothing server-side can read it from a cookie.
Migrating to cookie-backed sessions would touch `useStaffSession`, `AdminShell`, the
Realtime auth in `live.ts`, and all three green browser suites — to buy exactly what
forwarding the token already gives.

**Why it is safe.** The token is not trusted. Postgres validates the JWT signature and
RLS enforces `private.can_manage()`, so a forged or expired token fails at the database.
Zod validates *shape*, never authority.

⚠️ **Never memoize that client.** `getServerClient()` constructs a new client per call and
`getActionClient()` must too — a module-scoped client holding an `Authorization` header
would leak one staff member's token into another's request.

**How we know the token actually arrives.** `log_audit()` records `auth.uid()`. A write
that lands with a **null** actor means the JWT never reached the Postgres session and the
row was written as somebody else — a silent failure worse than a refusal. `tests/cms.test.mjs`
asserts `audit_logs.actor_id` is the owner's uuid after a toggle through the real UI.

## 11. `updateTag`, not `revalidateTag`

**Decision.** The data layer is wrapped in `unstable_cache` with tags; admin actions call
`updateTag`.

**Why.** In Next 16 `revalidateTag(tag, 'max')` is **stale-while-revalidate** — the next
reader still gets the old menu. That is the sold-out-toggle bug in a new place. The bare
`revalidateTag(tag)` has the right semantics but is deprecated and warns. `updateTag`
expires the tag immediately, is the supported read-your-own-writes API, and emits no
warning. Both reach the same tag manifest that `unstable_cache` writes into, so tags
registered there are invalidated by either.

`updateTag` **throws in Route Handlers** (`workStore.page.endsWith('/route')`). That is
why `/api/admin/upload` returns a path and the Server Action that persists it is what
invalidates.

**Not `use cache`.** It requires the `cacheComponents` flag, which turns every
un-suspended dynamic read into a build error — and this app reads cookies on every page.

**Consequence to know about.** A write that reaches Postgres *without* going through an
action — direct SQL, a future POS integration — does not invalidate anything. The
`revalidate` backstop bounds that: 60s for the menu (availability is the time-sensitive
field), an hour for business settings. `tests/rtl-availability-fidelity.test.mjs` used to
PATCH PostgREST directly and had to be changed to drive the real admin control, which is
the same lesson in test form.

## 12. Uploads are re-encoded, not merely validated

**Decision.** `/api/admin/upload` checks size, then real type by **magic bytes** (never the
filename or the declared Content-Type), then dimensions, then re-encodes through `sharp`
to WebP.

**Why the re-encode is the part that matters.** The output is generated from decoded
pixels, so EXIF, colour-profile payloads, appended archives and polyglot files that are
simultaneously a valid image and a valid script do not survive. Whatever goes in, what
comes out is pixels. The checks before it are there to fail fast and cheaply.

Storage RLS (`managers upload media`) is the authorisation boundary, not a check in the
route — a kitchen-role token is refused by Postgres. Verified in `tests/cms.test.mjs`:
a PNG renamed `.jpg` is accepted **on its true type**, a text file declared `image/jpeg`
is refused 415, a 9 MB file is refused 413, and a kitchen account is refused 403.

## 13. The CMS falls back to the compiled dictionary — which is also a trap

**Decision.** `contentReader()` returns the database value, falling back to
`src/lib/copy.json` for any missing or empty key.

**Why.** A missing row, a failed query or a half-finished translation renders the designed
default instead of a blank space where a headline should be.

⚠️ **Why that needs a specific test.** If the anon SELECT policy on `site_content` were
missing, every lookup would fall through to the dictionary and the site would look
**completely normal** — while nothing the owner typed had any effect. The fallback hides
the failure perfectly. `tests/cms.test.mjs` therefore asserts the policy directly with the
**anon key**, not by looking at a rendered page.

The same reasoning applies to `scripts/export-content.mjs`, which must sign in as staff:
RLS hides unavailable items from anon, so an anonymous export silently omitted five
switched-off items and still printed a cheerful success.

## 14. The table travels in a validated httpOnly cookie, not a typed table number

**Decision.** The QR encodes `/t/<token>`. That route resolves the token server-side,
writes it to an httpOnly `212_table` cookie, and redirects to the shopfront. `/` and
`/menu` read the cookie, re-resolve it, and pass the token to their client component —
the same shape as `/order/[tableToken]`, which takes it from the route.

**Why not ask the guest which table they are at.** It is the obvious cheap answer and it
undoes the system. `place_order` validates a table token and the order rate limit is
keyed on it; a typed table number would need a fourth anon-callable function to map
"7" → a table, which breaks the three-function anon surface in decision 5 — and it
reintroduces exactly the guessable `?table_id=12` the opaque token replaced. Anyone
could then order against a stranger's table from anywhere, which is worse than the
incumbent, not better.

**Why a cookie rather than `?t=` on every link.** The guest walks hero → menu → back;
a query parameter has to survive every navigation and ends up in shared links, browser
history and analytics. A cookie carries itself, and httpOnly means the token is not
readable by script even though the browser still needs it — it arrives as a prop from
the server render instead, which is where `/order/[tableToken]` already gets it.

**Consequences worth knowing.**

- The cookie is written *only* after `resolve_table_token` succeeds, and re-resolved on
  every render, so a rotated or revoked token stops working on the next page load rather
  than when the cookie expires.
- A stale cookie cannot be cleared from a page: `currentTable()` runs in a Server
  Component, which cannot mutate cookies. It costs one lookup per render until the 4-hour
  `maxAge` runs out, or until the guest rescans and `/t` deletes it. Accepted.
- The `/t` response carries `Cache-Control: no-store`. A 307 with `Set-Cookie` is exactly
  what an intermediary will cache, and the second phone to scan that code would then get
  the redirect with no cookie and a read-only menu, with nothing on screen saying why.
- `/menu` with no cookie is byte-for-byte the page it was. That is what keeps it public
  and indexable, and `tests/menu-ordering.test.mjs` asserts it directly.

⚠️ **`accepting_orders` is now load-bearing, and nothing invalidates it.** Ordering hides
itself when `business_settings.accepting_orders` is false, so a guest cannot fill a cart
that `place_order` will refuse. But that flag has **no admin control** — it is a database
column only — and no Server Action touches it, so decision 11's caveat applies in full:
a direct write does not invalidate the `business` tag, and `getBusiness()` caches for an
hour. Flipping it in SQL therefore takes up to **60 minutes** to reach the public site.

Verified rather than assumed: with the flag off and the cache cleared, `/menu` shows the
paused pill and no Add buttons and `/` drops the table banner; with it merely flipped in
SQL against a warm cache, the site kept taking orders. The fix, if the café ever needs to
pause service from the dashboard, is a `setAcceptingOrders` action in
`src/app/admin/actions.ts` that calls `updateTag(TAGS.business)` — the same shape as
`setItemAvailability`. Not built, because nothing in the app can switch the flag today.

## 15. Twelve items get a drawn placeholder, not a sourced photograph

**Decision.** The 12 items `hasUsablePhoto()` rejects render `ItemPlaceholder` — inline
SVG, a brass line-art glyph chosen by category — instead of the hairline rule they used
to get.

**Why not just find pictures.** Because there are none to find. Every item already has an
`image_path`; these 12 are disqualified on provenance, not availability — nine are
duplicates (one latte shot covering five drinks), three are AI-generated stock. The only
legitimate source of photographs of *this* café's food is the café. Filling the gaps from
a stock library would recreate the exact defect this project was built to point out: one
of the supplied images shipped with a visible Gemini watermark on it. A grid with no
holes in it is not worth being wrong about whose food is on the page.

**Why a placeholder rather than the old hairline.** The rule was fine in a two-column
desktop grid. On a phone the menu is one column, and eight of the twelve fall in Hot
Beverage — a run of thin brass bars down a single column reads as a page whose images
failed to load, which is worse than either a photograph or an obvious placeholder.

It is `aria-hidden` and carries no alt text: it says nothing the item name beside it does
not already say, and announcing "placeholder" twelve times would cost the menu page its
Accessibility 100 for no gain.
