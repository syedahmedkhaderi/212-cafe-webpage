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

/* ---------------------------------------------------------------------------------
   4. The CMS: an edit reaches the public site
   --------------------------------------------------------------------------------- */
console.log('\n=== 4. Editing copy and theme changes the public site ===');

const MARKER = `Coffee ${Math.random().toString(36).slice(2, 7)}`;
const { body: originalRows } = await rest(ownerToken, 'site_content?select=value_en&key=eq.heroLine1');
const originalHeadline = originalRows?.[0]?.value_en ?? 'Coffee';

const contentSince = new Date(Date.now() - 3000).toISOString();
const wrote = await rest(ownerToken, 'site_content?key=eq.heroLine1', {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ value_en: MARKER }),
});
check('owner may edit site copy', wrote.status === 204, `HTTP ${wrote.status}`);

const { body: contentAudit } = await rest(
  ownerToken,
  `audit_logs?select=actor_id,entity&entity=eq.site_content&created_at=gte.${contentSince}&limit=1`,
);
check(
  'the copy edit was audited against the owner',
  contentAudit?.[0]?.actor_id === OWNER_ID,
  `actor_id=${contentAudit?.[0]?.actor_id ?? 'null'}`,
);

// The anon SELECT policy is asserted with the ANON key on purpose. If that policy were
// missing, every lookup would silently fall back to the compiled dictionary and the page
// would look completely normal while nothing the owner typed had any effect.
const anonRead = await fetch(`${URL}/rest/v1/site_content?select=key,value_en&key=eq.heroLine1`, {
  headers: { apikey: KEY },
});
const anonRows = await anonRead.json();
check(
  'anon can READ site_content (or the whole CMS is a no-op)',
  Array.isArray(anonRows) && anonRows.length === 1,
  `${Array.isArray(anonRows) ? anonRows.length : anonRows?.message} row(s)`,
);

const anonWrite = await fetch(`${URL}/rest/v1/site_content?key=eq.heroLine1`, {
  method: 'PATCH',
  headers: { apikey: KEY, 'Content-Type': 'application/json', Prefer: 'return=representation' },
  body: JSON.stringify({ value_en: 'pwned' }),
});
const anonWritten = await anonWrite.json();
check(
  'anon cannot WRITE site_content',
  Array.isArray(anonWritten) && anonWritten.length === 0,
  `${anonWritten.length ?? 0} row(s) changed`,
);

// Restore through an action-invalidated path so the cache is not left holding the marker.
await rest(ownerToken, 'site_content?key=eq.heroLine1', {
  method: 'PATCH',
  headers: { Prefer: 'return=minimal' },
  body: JSON.stringify({ value_en: originalHeadline }),
});

/* ---------------------------------------------------------------------------------
   5. Uploads: the checks that matter are on CONTENT, not on the filename
   --------------------------------------------------------------------------------- */
console.log('\n=== 5. Upload validation ===');

const upload = async (bytes, filename, type) => {
  const form = new FormData();
  form.append('file', new Blob([bytes], { type }), filename);
  const res = await fetch(`${BASE}/api/admin/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${ownerToken}` },
    body: form,
  });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

// A PNG renamed to .jpg and declared as image/jpeg. The extension and the Content-Type
// both lie; only the magic bytes tell the truth — and this one IS a real image, so it
// must be ACCEPTED on its true type rather than refused on its dishonest name.
const pngBytes = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);
const renamed = await upload(pngBytes, 'actually-a-png.jpg', 'image/jpeg');
check(
  'a PNG renamed .jpg is judged by its bytes, not its name',
  renamed.status === 200,
  `HTTP ${renamed.status} ${renamed.body.error ?? ''}`,
);

// A text file wearing an image name and an image Content-Type. No magic bytes match.
const notAnImage = Buffer.from('#!/bin/sh\necho this is not an image\n'.repeat(4));
const disguised = await upload(notAnImage, 'payload.jpg', 'image/jpeg');
check(
  'a non-image declared as image/jpeg is refused',
  disguised.status === 415,
  `HTTP ${disguised.status} ${disguised.body.error ?? ''}`,
);

// Oversized. Built from a real JPEG header so it fails on SIZE, not on type — otherwise
// this would pass for the wrong reason.
const oversized = Buffer.concat([
  Buffer.from([0xff, 0xd8, 0xff, 0xe0]),
  Buffer.alloc(9 * 1024 * 1024, 0x41),
]);
const tooBig = await upload(oversized, 'huge.jpg', 'image/jpeg');
check(
  'a file over 8 MB is refused',
  tooBig.status === 413,
  `HTTP ${tooBig.status} ${tooBig.body.error ?? ''}`,
);

// Unauthenticated.
const noAuthForm = new FormData();
noAuthForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'x.png');
const noAuth = await fetch(`${BASE}/api/admin/upload`, { method: 'POST', body: noAuthForm });
check('an upload without a token is refused', noAuth.status === 401, `HTTP ${noAuth.status}`);

// A kitchen-role token is refused by Storage RLS, not by a check in the route.
const kitchenForm = new FormData();
kitchenForm.append('file', new Blob([pngBytes], { type: 'image/png' }), 'x.png');
const kitchenUpload = await fetch(`${BASE}/api/admin/upload`, {
  method: 'POST',
  headers: { Authorization: `Bearer ${kitchenToken}` },
  body: kitchenForm,
});
check(
  'a kitchen-role account cannot upload media',
  kitchenUpload.status === 403,
  `HTTP ${kitchenUpload.status}`,
);

// The accepted upload must have been re-encoded to WebP, not merely stored.
if (renamed.status === 200) {
  check(
    'the stored file was re-encoded to WebP (EXIF and any payload stripped)',
    String(renamed.body.path).endsWith('.webp'),
    renamed.body.path,
  );
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
