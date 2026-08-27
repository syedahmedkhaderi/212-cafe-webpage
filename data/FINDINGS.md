# 212 Café — Crawl Findings

Crawled **2026-08-26** from `https://212.smaresto.com/selforder?table_id=12`
(white-label SaaS: "Softurn Self Order", Vite/React SPA over a Laravel/UltimatePOS backend).

Data source: `https://212.smaresto.com/selforder/api/products?per_page=50&page={1,2}`
— **public and unauthenticated**, no key required.

## Files here

| File | Contents |
| --- | --- |
| `menu.json` | Normalised 56 items: id, sku, EN/AR name, category, EN/AR description, price, image URL, active flag |
| `MENU.md` | Human-readable menu tables by category |
| `products-raw.json` | Raw API records, full original shape |
| `api.json` | Raw captured responses incl. runtime config |
| `images/` | All 56 product images (44 unique), named `{sku}-{slug}.{ext}` |
| `images-manifest.json` | Image → item mapping with byte sizes |
| `crawl.mjs`, `extract.mjs`, `download-images.mjs` | Reproducible pipeline |

### Re-running the crawl

`212.smaresto.com` had a **stale DNS record** (`198.135.184.22`) that reset every
connection. The live host is `192.249.118.148`. If a re-crawl fails with `ECONNRESET`,
re-resolve DNS before assuming a block. `curl` also trips ModSecurity (HTTP 406) unless a
browser `User-Agent` header is sent correctly — `crawl.mjs` uses real Chromium and is the
reliable path.

---

## The menu — 56 items, 6 categories, QAR

| Category | Items | Price range |
| --- | ---: | --- |
| Hot Beverage | 16 | 18–36 (+3 extra milk) |
| Cold Beverage | 13 | 10–36 (+3 extra milk) |
| Sweets-Pastry | 7 | 37–50 |
| Savoury | 10 | 19–42 |
| Brunch | 7 | 27–52 |
| Salads | 3 | 34–38 (+10 extras) |

- **All 56 have Arabic names** (stored in `product_custom_field1`).
- **34 have bilingual `EN:`/`AR:` descriptions**; 22 have none — **19 of them sellable
  items**, including the signature "the 3 Layers". Drafted copy now fills those 19,
  flagged `copy_source = 'draft'` and awaiting the owner's approval.
- **4 are inactive**: Cheese Croissant, Chocolate Croissant, Plain Croissant, Green Shakshooka.
- **No modifiers or variations exist.** Every product is a flat `DUMMY` variation.
  Size/milk/extras are faked as separate line items: "Extra Milk – 3.00", "Extras – 10.00".
- **Display order unknown** — no categories endpoint; `menu.json` order is API insertion
  order. Derive `sort_order` from `category.id` and check against the live page.

Signature items as the café flags them: **212-Signature (36)**, **the 3 Layers (36)**,
**Eggs Benedict (52)**, **The French Toast (50)**, **Brownies Chocolate Bomb (45)**.

⚠️ Eggs Benedict and The French Toast are **not featured on our site**: both are
illustrated with AI-generated stock rather than photographs of their food (see the image
audit below). They are replaced in the signature lineup by **Hiby Splash (29)** and
**Mango Red Horizon**, which the café genuinely shot on its own terrace.

---

## Image audit — the strongest pitch material

**25.9 MB total for a 56-item menu.** Downloaded 56/56, zero failures.

| Metric | Value |
| --- | --- |
| Total payload | **25.9 MB** |
| Unique images | **44 of 56** |
| Over 1 MB | **10 images** |
| Largest | **2.1 MB** (Extras) |
| Median | 169 KB |

### 12 items reuse another item's photo

| Shared photo | Items sharing it | Size |
| --- | --- | ---: |
| One latte shot | Tiramisu Latte, Cappucino, Spanish Latte, Latte, Flat White | 242 KB |
| One tea shot | Chamomile Tea, Green Tea, English Breakfast Tea | 66 KB |
| One sandwich shot | Turkey Sandwich, Cheesy Roasted Beef Sandwich | 965 KB |
| One matcha shot | Ceremonial Matcha Latte, Non-coffee Matcha | 137 KB |
| One espresso shot | Double Espresso, Single Espresso | 222 KB |
| Vendor placeholder | Cheese / Chocolate / Plain Croissant | 6 KB |
| One milk shot | Extra Milk -, Extra Milk | 1.99 MB |

### Six images are AI-generated, not photographs of their food

Six of the 56 crawled images were not taken in the café. They are generated stock:

| Item | File |
| --- | --- |
| The French Toast | `0052-the-french-toast` |
| Eggs Benedict | `0066-eggs-benedict` |
| Penne Pasta | `0076-penne-pasta` |
| Extra Milk ×2 | `0217-extra-milk`, `0218-extra-milk` |
| Extras | `0219-extras` |

**What was verified, precisely** — this matters, because the strong version of the claim
is not the one the evidence supports:

- All six share an identical **1408×768** source frame. That is a generation aspect
  ratio, not one any camera produces, and no other image in the set is that size.
- **`0052-the-french-toast` carries a visible Google Gemini sparkle watermark** in the
  bottom-right corner. Confirmed by cropping and inspecting that region.
- **The other five show no visible watermark.** They are identified by frame size and by
  shared visual grammar — rustic wood table, shallow depth of field, and a European café
  interior that looks nothing like a 30th-floor room with floor-to-ceiling marina glass.
- `0066-eggs-benedict` contains a mug with a garbled **"212 café"** rendered onto it —
  the generator's attempt at their branding.

⚠️ **Say it that way.** "One is watermarked, and five more share its exact generated
frame" is verifiable and damning enough. "All six are watermarked" is not true and would
be caught.

Two of these — Eggs Benedict and The French Toast — were **signature items**, so the
café's shopfront was leading with pictures of food that isn't theirs. Both have been
dropped from the signature lineup (`supabase/migrations/0006`), replaced by items they
genuinely photographed on their own terrace.

### Two specific absurdities

- **The three croissants show the SaaS vendor's generic `default.png`** — SHA-256 verified
  identical to `212.smaresto.com/img/default.png`. Not a photo of their food at all.
- **"Extra Milk" — a QAR 3 add-on — ships a 1.99 MB image.** Twice.

### Source files are unprocessed phone photos

Filenames like `WhatsApp Image 2026-06-10 at 7.20.05 PM.jpeg`, served raw at full
resolution with no resizing, no WebP/AVIF, no responsive variants.

---

## Incumbent weaknesses → pitch points

1. **Sequential table IDs.** `?table_id=12` — a plain integer, unauthenticated and
   trivially enumerable. Justifies opaque, server-resolved, revocable table tokens.
2. **Self-ordering is switched off.** Runtime config returns `"selfOrderEnabled": false`
   with `noteMode*` branding — a browsable digital menu, not a live ordering channel.
   ⚠️ **Never verify this by submitting a real order.** It is a live POS at a real café
   with `typesOfServiceDineIn: "3"` — a successful submit could push a genuine ticket to
   their kitchen. Read the SPA bundle (`/selforder/assets/index-CdjF1dzk.js`) or ask the
   owner. Claim only what was verified: *their config has self-ordering disabled*.
3. **Their logo 404s.** `brandLogoUrl` points at
   `uploads/business_logos/1758557713_DG logo.jpeg` → **HTTP 404**. "DG" isn't even 212's
   branding. The incumbent shows no logo at all.
4. **25.9 MB of unoptimised images**, 12 of them duplicates, 3 of them a stock placeholder.
5. **Generic identity.** The page `<title>` is "Softurn Self Order", not 212 Café.
6. **Internal POS schema is public.** The unauthenticated endpoint returns POS-internal
   fields — `default_purchase_price`, `profit_percent`, kitchen routing, SKUs.
   **Verified: all cost and margin values are zero**, so no real financial data is
   currently exposed. State it exactly that way — the *surface* is wrong by design, but
   this is not a live data leak. Do not overclaim it in the meeting.

---

## Verified business data

| Field | Value |
| --- | --- |
| Name | 212 Café |
| Positioning | Lusail's Best View |
| Address | Marina Twin Tower A, 30th Floor, Lusail, Qatar |
| Phone | +974 7011 2377 |
| Email | 212.Qatar.24@gmail.com |
| Instagram | @212cafe.qatar |
| Hours | 12:00–00:00 (Instagram); Google ~12:30–23:00 — admin-editable, never hard-coded |
| Currency | QAR |
| Google | 4.7 / 116 reviews |

Still needed from the owner: a real logo asset, and confirmed trading hours.
