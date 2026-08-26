// Adversarial test of place_order using ONLY the anon key — the same key that ships
// to every phone that scans a QR code.
const URL = 'https://zdurieneqpgszngplgmb.supabase.co/rest/v1/rpc';
const KEY = 'sb_publishable_UnXoDqpHVPaRMZ9xUo5JKQ_7MM8E8gZ';

const TOKEN = '6f51bd1f81b868a993610d4921368cdf';   // table 07
const LATTE = 'b6d178fd-131d-424e-b1fc-174e66720724';       // 28.00
const CHEESECAKE = '786f79c0-8641-4014-8ba7-f228026fd37d';  // 38.00
const INACTIVE = 'a7242199-ea30-4270-abfb-fcd1cc092651';    // Plain Croissant (unavailable)
const OAT = '59ab4924-ee9d-42e2-aedc-05149d5eff63';         // +3.00
const WHOLE = '2895e119-87d3-4123-9b4b-a07697cd5f29';       // +0
const SIZE_REG = '16af2778-5ea5-4bee-8734-9ac9a43298b7';    // +0
const FOOD_EXTRA = 'f588f670-5238-4c42-a55b-bc354cd6fd35';  // belongs to food, not drinks

const rpc = async (fn, body) => {
  const res = await fetch(`${URL}/${fn}`, {
    method: 'POST',
    headers: { apikey: KEY, Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
};

const key = () => 'test-' + Math.random().toString(36).slice(2) + Date.now();
let pass = 0, fail = 0;

const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`);
  ok ? pass++ : fail++;
};

console.log('\n=== 1. Legitimate order ===');
// 2 x Latte (28) with oat milk (+3) and regular size = 2 * 31 = 62
// 1 x Cheesecake (38)  → total 100.00
const good = await rpc('place_order', {
  p_table_token: TOKEN,
  p_idempotency_key: key(),
  p_items: [
    { menu_item_id: LATTE, quantity: 2, option_ids: [OAT, SIZE_REG] },
    { menu_item_id: CHEESECAKE, quantity: 1, option_ids: [] },
  ],
  p_customer_name: 'Demo Guest',
});
check('order accepted', good.status === 200 && good.body?.order_number, good.body?.order_number);
check('server computed total = 100.00 (2×(28+3) + 38)', Number(good.body?.total) === 100,
      `got ${good.body?.total}`);
check('session token issued', typeof good.body?.session_token === 'string' && good.body.session_token.length === 32);

console.log('\n=== 2. Price tampering ===');
const tamper = await rpc('place_order', {
  p_table_token: TOKEN,
  p_idempotency_key: key(),
  // client insists the latte costs 0.01 and sends its own totals
  p_items: [{ menu_item_id: LATTE, quantity: 1, option_ids: [WHOLE, SIZE_REG], price: 0.01, unit_price: 0.01, line_total: 0.01, modifiers_total: -99 }],
});
check('bogus price fields ignored, real price used', Number(tamper.body?.total) === 28,
      `total = ${tamper.body?.total} (menu price 28.00)`);

console.log('\n=== 3. Idempotency (double-tap) ===');
const dupKey = key();
const first = await rpc('place_order', {
  p_table_token: TOKEN, p_idempotency_key: dupKey,
  p_items: [{ menu_item_id: CHEESECAKE, quantity: 1, option_ids: [] }],
});
const second = await rpc('place_order', {
  p_table_token: TOKEN, p_idempotency_key: dupKey,
  p_items: [{ menu_item_id: CHEESECAKE, quantity: 1, option_ids: [] }],
});
check('same order number returned', first.body?.order_number === second.body?.order_number,
      `${first.body?.order_number} === ${second.body?.order_number}`);
check('second call flagged as replay', second.body?.replayed === true);

console.log('\n=== 4. Rejections ===');
const badToken = await rpc('place_order', {
  p_table_token: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa', p_idempotency_key: key(),
  p_items: [{ menu_item_id: LATTE, quantity: 1, option_ids: [] }],
});
check('guessed table token rejected', badToken.status >= 400,
      badToken.body?.message?.slice(0, 40));

const seqToken = await rpc('place_order', {
  p_table_token: '12', p_idempotency_key: key(),
  p_items: [{ menu_item_id: LATTE, quantity: 1, option_ids: [] }],
});
check('incumbent-style "12" token rejected', seqToken.status >= 400);

const unavailable = await rpc('place_order', {
  p_table_token: TOKEN, p_idempotency_key: key(),
  p_items: [{ menu_item_id: INACTIVE, quantity: 1, option_ids: [] }],
});
check('unavailable item rejected', unavailable.status >= 400,
      unavailable.body?.message?.slice(0, 40));

const crossMod = await rpc('place_order', {
  p_table_token: TOKEN, p_idempotency_key: key(),
  // food-only modifier attached to a drink
  p_items: [{ menu_item_id: LATTE, quantity: 1, option_ids: [WHOLE, SIZE_REG, FOOD_EXTRA] }],
});
check('modifier from another item rejected', crossMod.status >= 400,
      crossMod.body?.message?.slice(0, 40));

const missingRequired = await rpc('place_order', {
  p_table_token: TOKEN, p_idempotency_key: key(),
  // Milk + Size are min_select 1; sending none must fail
  p_items: [{ menu_item_id: LATTE, quantity: 1, option_ids: [] }],
});
check('required modifier group enforced', missingRequired.status >= 400,
      missingRequired.body?.message?.slice(0, 40));

const badQty = await rpc('place_order', {
  p_table_token: TOKEN, p_idempotency_key: key(),
  p_items: [{ menu_item_id: LATTE, quantity: -5, option_ids: [WHOLE, SIZE_REG] }],
});
check('negative quantity rejected', badQty.status >= 400, badQty.body?.message?.slice(0, 40));

const shortKey = await rpc('place_order', {
  p_table_token: TOKEN, p_idempotency_key: 'x',
  p_items: [{ menu_item_id: LATTE, quantity: 1, option_ids: [WHOLE, SIZE_REG] }],
});
check('weak idempotency key rejected', shortKey.status >= 400);

console.log('\n=== 5. Order status access control ===');
const mine = await rpc('get_order_status', {
  p_order_number: good.body.order_number, p_session_token: good.body.session_token,
});
check('own order readable with token', mine.body?.status === 'received');

const stolen = await rpc('get_order_status', {
  p_order_number: good.body.order_number, p_session_token: '0'.repeat(32),
});
check('order NOT readable with wrong token', stolen.body === null,
      JSON.stringify(stolen.body)?.slice(0, 40));

console.log(`\n${pass} passed, ${fail} failed\n`);
process.exit(fail ? 1 : 0);
