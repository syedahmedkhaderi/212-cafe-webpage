// Verifies that an authenticated staff member sees exactly what they should,
// and that a kitchen-role account cannot do manager-only things.
const URL = 'https://zdurieneqpgszngplgmb.supabase.co';
const KEY = 'sb_publishable_UnXoDqpHVPaRMZ9xUo5JKQ_7MM8E8gZ';
const PW = 'REDACTED_ROTATED';

const login = async (email) => {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: PW }),
  });
  const j = await res.json();
  if (!j.access_token) throw new Error(`login failed for ${email}: ${j.error_description || j.msg}`);
  return j.access_token;
};

const get = async (token, path) => {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${token}` },
  });
  const j = await res.json();
  return Array.isArray(j) ? j.length : `ERR ${(j.message || '').slice(0, 50)}`;
};

const owner = await login('owner@212cafe.qa');
console.log('owner login OK');

console.log('\n=== owner (role: owner) ===');
for (const t of ['orders', 'order_items', 'cafe_tables', 'table_qr_tokens', 'staff', 'audit_logs', 'menu_items']) {
  console.log(`  ${t.padEnd(18)} ${await get(owner, `${t}?select=*&limit=200`)} rows`);
}
console.log(`  unavailable items visible: ${await get(owner, 'menu_items?select=name_en&is_available=eq.false')}`);

const kitchen = await login('kitchen@212cafe.qa');
console.log('\n=== kitchen (role: kitchen — should NOT reach manager-only data) ===');
console.log(`  orders            ${await get(kitchen, 'orders?select=*&limit=50')} rows   (expected: some)`);
console.log(`  table_qr_tokens   ${await get(kitchen, 'table_qr_tokens?select=*')} rows   (expected: 0 — tokens are manager-only)`);
console.log(`  audit_logs        ${await get(kitchen, 'audit_logs?select=*')} rows   (expected: 0 — owner/admin only)`);

// kitchen must not be able to reprice the menu
const patch = await fetch(`${URL}/rest/v1/menu_items?name_en=eq.Latte`, {
  method: 'PATCH',
  headers: { apikey: KEY, Authorization: `Bearer ${kitchen}`, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ price: 1 }),
});
const patched = await patch.json();
console.log(`  kitchen repricing Latte → ${patch.status}, rows changed: ${Array.isArray(patched) ? patched.length : '?'} (expected 0)`);

const check = await fetch(`${URL}/rest/v1/menu_items?select=price&name_en=eq.Latte`, {
  headers: { apikey: KEY, Authorization: `Bearer ${owner}` },
});
console.log(`  Latte price after attempt: ${JSON.stringify(await check.json())}`);
