// Clears every order and re-seeds a small, believable board.
//
// The browser suites (live-demo, rtl-availability-fidelity, arabic-site) place orders
// through the real app, so their idempotency keys are indistinguishable from a genuine
// guest's — cleanup_test_orders cannot pattern-match them away. Run this before a demo.
//
//   node scripts/reset-demo-board.mjs
//
// Reads NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and DEMO_STAFF_PASSWORD.

const BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const PW = process.env.DEMO_STAFF_PASSWORD;

if (!BASE || !KEY || !PW) {
  console.error('Need NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY and DEMO_STAFF_PASSWORD.');
  console.error('Try:  set -a; . ./.env.local; set +a; node scripts/reset-demo-board.mjs');
  process.exit(2);
}

const auth = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'owner@212cafe.qa', password: PW }),
}).then((r) => r.json());

if (!auth.access_token) {
  console.error('Sign-in failed:', auth.error_description || auth.msg);
  process.exit(1);
}

const H = { apikey: KEY, Authorization: `Bearer ${auth.access_token}`, 'Content-Type': 'application/json' };
const rest = async (path, init = {}) => {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: H });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return text; }
};

// Cancel rather than delete: orders are business records, and cancelled rows are
// excluded from revenue and from the live board.
const open = await rest('orders?select=id&status=in.(received,preparing,ready)');
for (const o of open) {
  await rest(`orders?id=eq.${o.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'cancelled' }) });
}
await rest('cafe_tables?state=eq.occupied', { method: 'PATCH', body: JSON.stringify({ state: 'available' }) });
console.log(`cleared ${open.length} open order(s)`);

// Re-seed three orders across different tables, one already preparing, so the
// dashboard never opens empty in the meeting.
const tables = await rest('cafe_tables?select=label,table_qr_tokens(token,is_active)');
const tokenFor = (label) =>
  tables.find((t) => t.label === label)?.table_qr_tokens?.find((q) => q.is_active)?.token;

const menu = await rest('menu_items?select=id,name_en');
const idOf = (name) => menu.find((m) => m.name_en === name)?.id;

const options = await rest('menu_item_modifier_options?select=id,name_en,group_id');
const optionId = (name) => options.find((o) => o.name_en === name)?.id;

const WHOLE = optionId('Whole milk');
const OAT = optionId('Oat milk');
const REGULAR = optionId('Regular');
const LARGE = optionId('Large');

const BOARD = [
  { table: '03', name: 'Noor', items: [
      { menu_item_id: idOf('Americano'), quantity: 1, option_ids: [WHOLE, REGULAR] },
      { menu_item_id: idOf('Golden Hive Cake'), quantity: 1, option_ids: [] }] },
  { table: '08', name: 'Khalid', items: [
      { menu_item_id: idOf('212-Signature'), quantity: 2, option_ids: [OAT, LARGE] },
      { menu_item_id: idOf('Brownies Chocolate Bomb'), quantity: 1, option_ids: [] }] },
  { table: '11', name: 'Aisha', items: [
      { menu_item_id: idOf('Eggs Benedict'), quantity: 1, option_ids: [] },
      { menu_item_id: idOf('Fresh Orange Juice'), quantity: 2, option_ids: [] }] },
];

const placed = [];
for (const o of BOARD) {
  const res = await fetch(`${BASE}/rest/v1/rpc/place_order`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_table_token: tokenFor(o.table),
      p_idempotency_key: `demo-seed-${o.table}-${Date.now()}`,
      p_items: o.items,
      p_customer_name: o.name,
    }),
  });
  const body = await res.json();
  if (!res.ok) {
    console.error(`  table ${o.table} failed: ${body.message}`);
    continue;
  }
  placed.push({ table: o.table, ...body });
  console.log(`  table ${o.table}  ${body.order_number}  QAR ${body.total}  (${o.name})`);
}

// Advance the first so the board shows more than one status.
if (placed[0]) {
  const [row] = await rest(`orders?select=id&order_number=eq.${placed[0].order_number}`);
  await rest(`orders?id=eq.${row.id}`, { method: 'PATCH', body: JSON.stringify({ status: 'preparing' }) });
  console.log(`  ${placed[0].order_number} advanced to preparing`);
}

console.log('\nBoard ready.');
