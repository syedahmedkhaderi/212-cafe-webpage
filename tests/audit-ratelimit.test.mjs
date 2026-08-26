// Phase 6 verification: audit logging and rate limiting are enforced in the database,
// not the app — so a client that skips them still gets logged and still gets throttled.
const BASE = 'https://zdurieneqpgszngplgmb.supabase.co';
const KEY = 'sb_publishable_UnXoDqpHVPaRMZ9xUo5JKQ_7MM8E8gZ';
const PW = process.env.DEMO_STAFF_PASSWORD;

if (!PW) {
  console.error('Set DEMO_STAFF_PASSWORD to run this test. It is deliberately not committed.');
  process.exit(2);
}

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const login = async (email) => {
  const res = await fetch(`${BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`login failed: ${j.error_description || j.msg}`);
  return j.access_token;
};

const owner = await login('owner@212cafe.qa');
const auth = (token) => ({ apikey: KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' });

const rest = async (path, init = {}, token = owner) => {
  const res = await fetch(`${BASE}/rest/v1/${path}`, { ...init, headers: auth(token) });
  const text = await res.text();
  try { return { status: res.status, body: JSON.parse(text) }; }
  catch { return { status: res.status, body: text }; }
};

/* ------------------------------------------------------- 1. audit logging ------- */
console.log('\n=== 1. Audit logging ===');

const [latte] = (await rest('menu_items?select=id,price,is_available&name_en=eq.Latte')).body;
const originalPrice = Number(latte.price);
const before = (await rest('audit_logs?select=id&order=id.desc&limit=1')).body[0]?.id ?? 0;

// price change
await rest(`menu_items?id=eq.${latte.id}`, { method: 'PATCH', body: JSON.stringify({ price: 31 }) });
// availability flip
await rest(`menu_items?id=eq.${latte.id}`, { method: 'PATCH', body: JSON.stringify({ is_available: false }) });
await rest(`menu_items?id=eq.${latte.id}`, { method: 'PATCH', body: JSON.stringify({ is_available: true }) });
// restore
await rest(`menu_items?id=eq.${latte.id}`, { method: 'PATCH', body: JSON.stringify({ price: originalPrice }) });

await new Promise((r) => setTimeout(r, 600));
const entries = (await rest(`audit_logs?select=action,actor_email,before,after&id=gt.${before}&order=id.asc`)).body;
const actions = entries.map((e) => e.action);

check('price change logged', actions.includes('menu_items.price_changed'), actions.join(', '));
check('sold-out flip logged', actions.includes('menu_items.marked_sold_out'));
check('back-in-stock flip logged', actions.includes('menu_items.marked_available'));
check('actor recorded', entries.every((e) => e.actor_email === 'owner@212cafe.qa'),
  entries[0]?.actor_email);

const priceEntry = entries.find((e) => e.action === 'menu_items.price_changed');
check(
  'before/after captured',
  priceEntry && Number(priceEntry.before.price) === originalPrice && Number(priceEntry.after.price) === 31,
  priceEntry ? `${priceEntry.before.price} → ${priceEntry.after.price}` : 'missing',
);

const restored = (await rest('menu_items?select=price,is_available&name_en=eq.Latte')).body[0];
check('menu restored after test', Number(restored.price) === originalPrice && restored.is_available,
  `QAR ${restored.price}`);

// audit log must stay owner/admin-only
const kitchen = await login('kitchen@212cafe.qa');
const kitchenView = (await rest('audit_logs?select=id&limit=5', {}, kitchen)).body;
check('kitchen role cannot read audit log', Array.isArray(kitchenView) && kitchenView.length === 0);

const anonView = await fetch(`${BASE}/rest/v1/audit_logs?select=id`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
check('anon cannot read audit log', (await anonView.json()).length === 0);

/* ------------------------------------------------------- 2. rate limiting ------- */
console.log('\n=== 2. Rate limiting on place_order ===');

// Embedded filters in PostgREST do not filter the PARENT rows, so query from
// cafe_tables downward instead — an earlier version of this test silently picked an
// arbitrary token and then blamed the product for throttling it.
const tableToken = async (label) => {
  const rows = (await rest(`cafe_tables?select=label,table_qr_tokens(token,is_active)&label=eq.${label}`)).body;
  return rows[0]?.table_qr_tokens?.find((t) => t.is_active)?.token;
};
const token = await tableToken('02');
const [water] = (await rest('menu_items?select=id&name_en=eq.Normal%20water')).body;

const place = () =>
  fetch(`${BASE}/rest/v1/rpc/place_order`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      p_table_token: token,
      p_idempotency_key: 'test-rl-' + Math.random().toString(36).slice(2) + Date.now(),
      p_items: [{ menu_item_id: water.id, quantity: 1, option_ids: [] }],
    }),
  });

let accepted = 0, throttled = 0, firstThrottleAt = null, throttleStatus = null;
for (let i = 1; i <= 12; i++) {
  const res = await place();
  if (res.ok) accepted++;
  else {
    const body = await res.json();
    if (/rate_limited/.test(body.message ?? '')) {
      throttled++;
      firstThrottleAt ??= i;
      throttleStatus ??= res.status;
    }
  }
}

check('burst is throttled', throttled > 0, `${accepted} accepted, ${throttled} rejected`);
check('limit is 8 per minute per table', firstThrottleAt === 9, `first rejection on request ${firstThrottleAt}`);

// a different table must be unaffected — the limit is per token, not global
const otherToken = await tableToken('05');
const otherRes = await fetch(`${BASE}/rest/v1/rpc/place_order`, {
  method: 'POST',
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    p_table_token: otherToken,
    p_idempotency_key: 'test-rl-other-' + Date.now(),
    p_items: [{ menu_item_id: water.id, quantity: 1, option_ids: [] }],
  }),
});
check('a different table is unaffected', otherRes.ok, `HTTP ${otherRes.status}`);
check('throttling returns 429, not 500', throttleStatus === 429, `HTTP ${throttleStatus}`);

// the rate-limit table itself must be invisible
const rlPeek = await fetch(`${BASE}/rest/v1/order_rate_limit?select=*`, {
  headers: { apikey: KEY, Authorization: `Bearer ${KEY}` },
});
check('rate-limit table not readable by anon', (await rlPeek.json()).length === 0);

/* ------------------------------------------------------------- teardown --------- */
const cleanup = await fetch(`${BASE}/rest/v1/rpc/cleanup_test_orders`, {
  method: 'POST', headers: auth(owner), body: '{}',
});
console.log(`\ncleanup: ${cleanup.ok ? await cleanup.json() : '?'} test order(s) cancelled`);

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
