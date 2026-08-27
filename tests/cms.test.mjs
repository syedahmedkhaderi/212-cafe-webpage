// The admin write path: Server Actions, forwarded JWTs, and the audit trail.
//
//   node tests/cms.test.mjs          (needs the app running on :3000)
//
// The assertion that matters most here is the audit actor. Admin writes now go through
// a Server Action that forwards the signed-in manager's access token to Supabase, and
// there is exactly one way to tell whether that token really reached the Postgres
// session: `log_audit()` records `auth.uid()`, so a write that lands with a NULL actor
// means the JWT never arrived and the row was written as somebody else. A successful
// write with no actor is a worse outcome than a failed one, and would otherwise be
// completely invisible.
//
// ⚠ Absolute path into an npx cache, matching the other suites here. See visual-check.mjs.
import { chromium } from '/Users/syed/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const URL = 'https://zdurieneqpgszngplgmb.supabase.co';
const KEY = 'sb_publishable_UnXoDqpHVPaRMZ9xUo5JKQ_7MM8E8gZ';
const PW = process.env.DEMO_STAFF_PASSWORD;

const OWNER_ID = '405a4778-6b74-4564-851d-6582e215d4a9';
const OWNER_EMAIL = 'owner@212cafe.qa';
const KITCHEN_EMAIL = 'kitchen@212cafe.qa';

if (!PW) {
  console.error('Set DEMO_STAFF_PASSWORD to run this test. It is deliberately not committed.');
  process.exit(2);
}

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`);
  ok ? pass++ : fail++;
};

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

const rest = async (token, path, init = {}) => {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: KEY,
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const text = await res.text();
  let body;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body };
};

const ownerToken = await login(OWNER_EMAIL);

/* ---------------------------------------------------------------------------------
   1. The mechanism: a forwarded bearer token must produce a real auth.uid()
   --------------------------------------------------------------------------------- */
console.log('\n=== 1. Forwarded JWT reaches the Postgres session ===');

// Pick a genuinely available item so the toggle is a real state change — log_audit()
// skips no-op updates, and a no-op would make this test pass for the wrong reason.
const { body: candidates } = await rest(
  ownerToken,
  'menu_items?select=id,name_en,is_available&is_available=eq.true&limit=1',
);
const target = candidates?.[0];
check('found an available item to toggle', Boolean(target), target?.name_en);

const since = new Date(Date.now() - 5000).toISOString();

const patch = await rest(ownerToken, `menu_items?id=eq.${target.id}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ is_available: false }),
});
check('owner may mark an item sold out', patch.status === 204, `HTTP ${patch.status}`);

const { body: logs } = await rest(
  ownerToken,
  `audit_logs?select=actor_id,actor_email,action,entity_id&entity_id=eq.${target.id}` +
    `&created_at=gte.${since}&order=created_at.desc&limit=1`,
);
const entry = logs?.[0];
check('the write was audited', Boolean(entry), entry?.action);
check(
  'audit actor is the signed-in owner, NOT null',
  entry?.actor_id === OWNER_ID,
  `actor_id=${entry?.actor_id ?? 'null'} email=${entry?.actor_email ?? '—'}`,
);
check('audit action names the sold-out flip', entry?.action === 'menu_items.marked_sold_out', entry?.action);

// put it back
await rest(ownerToken, `menu_items?id=eq.${target.id}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ is_available: true }),
});

/* ---------------------------------------------------------------------------------
   2. RLS is the boundary, not the UI
   --------------------------------------------------------------------------------- */
console.log('\n=== 2. A kitchen-role account cannot write the menu ===');

const kitchenToken = await login(KITCHEN_EMAIL);
const refused = await rest(kitchenToken, `menu_items?id=eq.${target.id}`, {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ is_available: false }),
});
// RLS yields either an explicit 403 or a silent zero-row update; both are refusals.
const { body: afterKitchen } = await rest(
  ownerToken,
  `menu_items?select=is_available&id=eq.${target.id}`,
);
check(
  'kitchen role cannot change availability',
  afterKitchen?.[0]?.is_available === true,
  `HTTP ${refused.status}, is_available=${afterKitchen?.[0]?.is_available}`,
);

/* ---------------------------------------------------------------------------------
   3. End to end through the real UI and the Server Action
   --------------------------------------------------------------------------------- */
console.log('\n=== 3. The admin UI toggle goes through the Server Action ===');

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/admin`, { waitUntil: 'load' });
await page.getByLabel('Email').fill(OWNER_EMAIL);
await page.getByLabel('Password').fill(PW);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForTimeout(3000);

const signedIn = (await page.getByText('Live orders').count()) > 0;
check('owner reaches the dashboard', signedIn);

const uiSince = new Date(Date.now() - 2000).toISOString();

// Search brings the item into the Availability list, then flip it.
await page.getByPlaceholder('Search to mark sold out…').fill(target.name_en);
await page.waitForTimeout(700);
const toggle = page.getByRole('button', { name: new RegExp(`Mark sold out: ${escapeRe(target.name_en)}`) });
const foundToggle = (await toggle.count()) > 0;
check('the item appears in the availability list', foundToggle, target.name_en);

if (foundToggle) {
  await toggle.first().click();
  await page.waitForTimeout(2500);

  const { body: uiLogs } = await rest(
    ownerToken,
    `audit_logs?select=actor_id,action&entity_id=eq.${target.id}` +
      `&created_at=gte.${uiSince}&order=created_at.desc&limit=1`,
  );
  check(
    'the UI toggle wrote through, with the owner as actor',
    uiLogs?.[0]?.actor_id === OWNER_ID,
    `actor_id=${uiLogs?.[0]?.actor_id ?? 'null'}`,
  );

  // restore
  await rest(ownerToken, `menu_items?id=eq.${target.id}`, {
    method: 'PATCH',
    headers: { Prefer: 'return=minimal' },
    body: JSON.stringify({ is_available: true }),
  });
}

await browser.close();

function escapeRe(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
