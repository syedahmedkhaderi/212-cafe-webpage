# 212 Café — digital café platform

A marketing site, QR table-ordering app, kitchen display and admin dashboard for
**212 Café**, Marina Twin Tower A, 30th Floor, Lusail, Qatar.

Built as a pitch demo against their current system, a white-label SaaS
("Softurn Self Order") at `212.smaresto.com`. **All menu content is the café's real
data**, crawled from that system on 2026-08-26 — real item names, real Arabic names,
real QAR prices. See [`data/FINDINGS.md`](data/FINDINGS.md).

Three exceptions, each flagged rather than blended in:

- **19 items had no description.** The café never wrote one. Ours are drafted and
  marked `copy_source = 'draft'` in the database, so the café's words and ours are
  never confused. They need the owner's approval.
- **Six of their product photographs are AI-generated stock**, not pictures of their
  food — one carries a visible Gemini watermark. None is used on the shopfront now.
- **The hero is a supplied press photograph**, not the café's own. Its licence is
  unconfirmed — see below.

## Surfaces

| Route | Who | What |
| --- | --- | --- |
| `/` | Public | Marketing site; hero is a supplied press photo, The View is the café's own |
| `/menu` | Public | Full bilingual menu, EN/AR with correct RTL |
| `/order/[tableToken]` | Guest | Scan-to-order: browse, configure, cart, submit, track |
| `/admin` | Staff | Live orders, today's revenue, top items, sold-out toggles |
| `/admin/activity` | Owner/admin | Audit trail of every menu, hours, staff and token change |
| `/admin/tables` | Manager+ | Printable QR codes, token rotation |
| `/kitchen` | Kitchen | Three-column display: New → Preparing → Ready |

## Running it

```bash
./setup.sh          # deps, .env.local, then verifies the database is reachable and seeded
./start.sh          # build and serve
```

`./start.sh dev` for hot reload, `./start.sh test` for the verification suites,
`./start.sh reset` to clear the order board and re-seed a believable demo set.

Database migrations are in `supabase/migrations/`, applied in filename order.
`0003_seed.sql` is generated — regenerate with `node data/generate-seed.mjs`.

**Set `NEXT_PUBLIC_SITE_URL` to the deployed origin before printing QR codes.**
Codes generated against localhost cannot be scanned from a phone; `/admin/tables`
shows a warning banner when that is the case.

### Demo logins

`owner@212cafe.qa` (role: owner) and `kitchen@212cafe.qa` (role: kitchen).
**These are demo credentials seeded for the pitch — change or remove them before
this goes anywhere real.**

## Languages

English and Arabic, switchable everywhere. A full-screen picker appears once on a
visitor's first arrival; after that a labelled `EN | العربية` control sits in the header
of every page and in the footer. The choice is a cookie, so it carries across the
marketing site, the menu **and the table-ordering app** — a guest who picks العربية and
then scans a QR stays in Arabic.

Before any choice is made, `Accept-Language` decides. `<html lang>` and `dir` are set
server-side, so direction is right before any JavaScript runs, and prices, phone numbers
and order numbers stay left-to-right inside Arabic text.

Item names and descriptions are the café's own Arabic — all 53 items carry an Arabic
name, 34 an Arabic description.

## Measured

Lighthouse, mobile, against a production build:

| | Homepage | Ordering app |
| --- | --- | --- |
| Performance | 94 | 87 |
| Accessibility | 100 | 100 |
| Best practices | 100 | 100 |
| SEO | 100 | — |

LCP 3.1 s, CLS 0, 483 KB total on the homepage. The Arabic webfont is not preloaded —
it was 163 KB shipped to every English visitor — so it is fetched only when Arabic is
actually rendered.

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

- Audit logging and the order rate limit are enforced by the database, not the app.

```bash
./start.sh test                            # security, roles, audit + rate limit

# browser suites — need the app running
node tests/arabic-site.test.mjs             # language switching across every surface
node tests/live-demo.test.mjs               # the pitch choreography, end to end
node tests/rtl-availability-fidelity.test.mjs
./start.sh reset                            # tidy the board afterwards
```

87 assertions in total, all passing.

Design and architecture rationale, including what was measured rather than assumed,
is in [`docs/DECISIONS.md`](docs/DECISIONS.md).

## What still needs the owner

- **Licence confirmation for the hero photograph.** `Katara-Towers-Raffles-Doha.jpg` is
  an aerial press shot of the towers from outside the building, supplied by the client
  and of unknown provenance. Confirm it before this is shown to the owner or deployed to
  a public domain. The café's own terrace shot is kept as a switchable alternative at
  `/hero/terrace-signature-*`, and is what actually evidences the "Lusail's Best View"
  claim — it is the view *from* 212, not a picture of the building next door.
- **A higher-resolution hero original.** The supplied file is 1200×900, which is 2.4×
  short of what a full-bleed hero needs at 1440px on a 2× display. Nothing is upscaled
  (that adds bytes, not detail); `node data/optimize-hero.mjs` prints the exact
  shortfall.
- **Approval of the 19 drafted descriptions** (`copy_source = 'draft'`).
- A real logo asset — the incumbent's `brandLogoUrl` 404s and is not their branding
- Confirmed trading hours (Instagram says 12:00–00:00; Google shows ~12:30–23:00)
- Sign-off on modifier prices with no counterpart in their data: Size Large (+6),
  extra espresso shot (+6), syrups (+3). Milk (+3) and food extras (+10) come from
  their own menu.
