# 212 Café — digital café platform

A marketing site, QR table-ordering app, kitchen display and admin dashboard for
**212 Café**, Marina Twin Tower A, 30th Floor, Lusail, Qatar.

Built as a pitch demo against their current system, a white-label SaaS
("Softurn Self Order") at `212.smaresto.com`. **All menu content is the café's real
data**, crawled from that system on 2026-08-26 — real item names, real Arabic names,
real descriptions, real QAR prices, real photography. Nothing is invented.
See [`data/FINDINGS.md`](data/FINDINGS.md).

## Surfaces

| Route | Who | What |
| --- | --- | --- |
| `/` | Public | Marketing site, hero built on the café's own terrace photography |
| `/menu` | Public | Full bilingual menu, EN/AR with correct RTL |
| `/order/[tableToken]` | Guest | Scan-to-order: browse, configure, cart, submit, track |
| `/admin` | Staff | Live orders, today's revenue, top items, sold-out toggles |
| `/admin/tables` | Manager+ | Printable QR codes, token rotation |
| `/kitchen` | Kitchen | Three-column display: New → Preparing → Ready |

## Running it

```bash
cp .env.example .env.local     # fill in your Supabase URL + publishable key
npm install
npm run dev
```

Database migrations are in `supabase/migrations/`, applied in filename order.
`0003_seed.sql` is generated — regenerate with `node data/generate-seed.mjs`.

### Demo logins

`owner@212cafe.qa` (role: owner) and `kitchen@212cafe.qa` (role: kitchen).
**These are demo credentials seeded for the pitch — change or remove them before
this goes anywhere real.**

## Security posture

The publishable key ships to every phone that scans a QR code, so it is treated as
public. Everything it can do is bounded by RLS and three guarded database functions.
**There is no service-role key anywhere in this app.**

- Prices are computed in the database. The client sends item ids and quantities, never
  an amount — a tampered payload has nothing to tamper with.
- `order_items` freeze `unit_price`, so repricing the menu never rewrites past orders.
- Table QR codes carry an opaque, revocable 128-bit token resolved server-side —
  replacing the incumbent's guessable `?table_id=12`.
- Idempotency keys make a double-tap on flaky wifi return the first order, not a second.
- Role separation: owner / admin / manager / staff / kitchen.

```bash
node tests/security.test.mjs     # 15 adversarial checks with the anon key
node tests/staff-rls.test.mjs    # role separation
node tests/realtime-rls.test.mjs # proves anon receives no order events
```

Design and architecture rationale, including what was measured rather than assumed,
is in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## What still needs the owner

- A real logo asset — the incumbent's `brandLogoUrl` 404s and is not their branding
- Confirmed trading hours (Instagram says 12:00–00:00; Google shows ~12:30–23:00)
- Sign-off on modifier prices with no counterpart in their data: Size Large (+6),
  extra espresso shot (+6), syrups (+3). Milk (+3) and food extras (+10) come from
  their own menu.
