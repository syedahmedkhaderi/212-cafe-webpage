// Does the data cache actually cache, and does an admin save actually invalidate it?
//
//   node tests/cache.test.mjs        (needs a PRODUCTION server: ./start.sh)
//
// Both halves matter and they pull in opposite directions. A cache that never
// invalidates serves a sold-out item to guests; a "cache" that never hits is just a
// slower way to query Supabase. Neither failure is visible by looking at the page.
//
// This reads the server's own cache-MISS lines rather than timing requests, because a
// fast response proves nothing — it could be a warm connection.
//
// ⚠ Absolute path into an npx cache, matching the other suites here. See visual-check.mjs.
import fs from 'fs';
import { chromium } from '/Users/syed/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const LOG = process.env.SERVER_LOG ?? '/tmp/212-prod.log';
const URL = 'https://zdurieneqpgszngplgmb.supabase.co';
const KEY = 'sb_publishable_UnXoDqpHVPaRMZ9xUo5JKQ_7MM8E8gZ';
const PW = process.env.DEMO_STAFF_PASSWORD;
const OWNER_EMAIL = 'owner@212cafe.qa';

if (!PW) {
  console.error('Set DEMO_STAFF_PASSWORD to run this test.');
  process.exit(2);
}
if (!fs.existsSync(LOG)) {
  console.error(`No server log at ${LOG}. Start the app with its output redirected there.`);
  process.exit(2);
}

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const misses = () =>
  (fs.readFileSync(LOG, 'utf8').match(/\[212\] cache MISS: menu/g) ?? []).length;

const get = async (path) => {
  const res = await fetch(`${BASE}${path}`, { headers: { 'Cache-Control': 'no-cache' } });
  return res.text();
};

/* ---------------------------------------------------------------------------------
   1. Repeated reads hit the cache
   --------------------------------------------------------------------------------- */
console.log('\n=== 1. A second request does not re-query Supabase ===');

await get('/menu'); // warm, whatever the starting state
const warmed = misses();

await get('/menu');
await get('/menu');
await get('/'); // the homepage reads the same cached menu
const afterReads = misses();

check(
  'three further page renders caused no new menu query',
  afterReads === warmed,
  `misses ${warmed} → ${afterReads}`,
);

/* ---------------------------------------------------------------------------------
   2. An admin save invalidates immediately (read-your-own-writes)
   --------------------------------------------------------------------------------- */
console.log('\n=== 2. An admin save is visible on the next public load ===');

const login = async () => {
  const res = await fetch(`${URL}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: OWNER_EMAIL, password: PW }),
  });
  return (await res.json()).access_token;
};
const token = await login();

const restGet = async (path) => {
  const res = await fetch(`${URL}/rest/v1/${path}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${token}` },
  });
  return res.json();
};

// A distinctive, definitely-available item that is currently rendered on /menu.
const items = await restGet(
  'menu_items?select=id,name_en,is_available&is_available=eq.true&order=name_en&limit=40',
);
const target = items.find((i) => /halloumi/i.test(i.name_en)) ?? items[0];
check('picked a target item', Boolean(target), target?.name_en);

const before = await get('/menu');
check('item is on the public menu to begin with', before.includes(target.name_en));

// Drive the REAL admin UI, so the Server Action (and its updateTag) is what runs.
const browser = await chromium.launch();
const page = await browser.newPage();
await page.goto(`${BASE}/admin`, { waitUntil: 'load' });
await page.getByLabel('Email').fill(OWNER_EMAIL);
await page.getByLabel('Password').fill(PW);
await page.getByRole('button', { name: 'Sign in' }).click();
await page.waitForTimeout(3000);

await page.getByPlaceholder('Search to mark sold out…').fill(target.name_en);
await page.waitForTimeout(700);
const escaped = target.name_en.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const toggle = page.getByRole('button', { name: new RegExp(`Mark sold out: ${escaped}`) });
check('found the availability toggle', (await toggle.count()) > 0);
await toggle.first().click();
await page.waitForTimeout(2500);

const missesBeforeReload = misses();
const after = await get('/menu');

check(
  'the sold-out item is gone from the public menu on the very next load',
  !after.includes(target.name_en),
  'no stale-while-revalidate window',
);
check(
  'the save forced a fresh query (the tag really was invalidated)',
  misses() > missesBeforeReload,
  `misses ${missesBeforeReload} → ${misses()}`,
);

/* ---------------------------------------------------------------------------------
   Restore — deliberately through the UI, not through REST.
   --------------------------------------------------------------------------------- */
// Restoring with a direct PATCH would put the database right and leave the CACHE wrong,
// because nothing would call updateTag. The public menu would then keep hiding this item
// for the rest of the revalidate window, and the next run of this suite would fail its
// opening assertion for a reason that has nothing to do with the code under test.
// (That is not a hypothetical: it is exactly what happened when this restored via REST.)
// It is also the hazard the comment in queries.ts warns about — a change that reaches
// the database without going through an action.
const restore = page.getByRole('button', { name: new RegExp(`Mark available: ${escaped}`) });
if ((await restore.count()) > 0) {
  await restore.first().click();
  await page.waitForTimeout(2500);
}
const restored = await get('/menu');
check('restored: the item is back on the public menu', restored.includes(target.name_en));

await browser.close();

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
