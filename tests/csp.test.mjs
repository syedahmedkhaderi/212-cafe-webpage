// Does the Content Security Policy break anything?
//
//   node tests/csp.test.mjs        (needs a PRODUCTION server: ./start.sh)
//
// CSP failures are the quiet kind. A blocked WebSocket does not throw — the staff
// dashboard just stops updating itself, which looks exactly like a feature that was
// never built. A blocked data: URI renders an empty box where a QR code should be, and
// someone prints a sheet of dead codes. Neither shows up in a smoke test that only
// checks for HTTP 200, so each is asserted here directly.
//
// ⚠ Absolute path into an npx cache, matching the other suites here. See visual-check.mjs.
import { chromium } from '/Users/syed/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const PW = process.env.DEMO_STAFF_PASSWORD;
const OWNER_EMAIL = 'owner@212cafe.qa';

if (!PW) {
  console.error('Set DEMO_STAFF_PASSWORD to run this test.');
  process.exit(2);
}

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`);
  ok ? pass++ : fail++;
};

/* ------------------------------------------- before any browser is involved at all */
// Chromium exempts loopback from `upgrade-insecure-requests`; WebKit does not. So this
// suite, and every assertion below it, stayed green through a bug that rendered the
// whole site unstyled in Safari. Nothing a Chromium page reports can catch that, so the
// header is checked here off the wire, before launch. The full contract lives in
// tests/headers.test.mjs; this is the one line that must not be reachable past.
// Only meaningful against a plain-HTTP origin: over HTTPS the directive is correct and
// expected, so pointing BASE at the deployed site must not fail here.
if (BASE.startsWith('http://')) {
  const headCsp = (await fetch(BASE, { redirect: 'manual' })).headers.get('content-security-policy') ?? '';
  check(
    'no upgrade-insecure-requests on this plain-HTTP origin',
    !headCsp.includes('upgrade-insecure-requests'),
    headCsp.includes('upgrade-insecure-requests') ? 'Safari would render this build unstyled' : undefined,
  );
}

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });

/** Every CSP violation the browser reports, from any page in this context. */
const violations = [];
ctx.on('weberror', (e) => violations.push(String(e.error())));

const watch = (page) => {
  page.on('console', (m) => {
    const t = m.text();
    if (/Content Security Policy|Refused to (load|execute|connect|apply)/i.test(t)) {
      violations.push(t);
    }
  });
  return page;
};

/* ---------------------------------------------------------------- public pages */
console.log('\n=== 1. Public pages render with no CSP violations ===');

for (const path of ['/', '/menu']) {
  const page = watch(await ctx.newPage());
  const before = violations.length;
  await page.goto(`${BASE}${path}`, { waitUntil: 'load' });
  await page.waitForTimeout(2000);
  check(`${path} loads clean`, violations.length === before, violations.slice(before)[0]);
  if (path === '/') {
    // The JSON-LD block is inline and needs the nonce; without it the café loses its
    // rich result and nothing on the page looks any different.
    const ld = await page.locator('script[type="application/ld+json"]').count();
    check('JSON-LD is present', ld > 0);

    // Read the .nonce IDL PROPERTY, not the attribute. Browsers deliberately clear the
    // nonce content attribute from the DOM once parsed, so getAttribute('nonce')
    // returns empty even when the nonce was applied correctly — an anti-exfiltration
    // measure in the CSP spec, not a bug. Only the property retains the value.
    const nonce = await page.evaluate(
      () => document.querySelector('script[type="application/ld+json"]')?.nonce ?? '',
    );
    check('JSON-LD carries a nonce', Boolean(nonce), nonce ? `${nonce.slice(0, 12)}…` : 'MISSING');
  }
  await page.close();
}

/* ------------------------------------------------------- admin: realtime + QR */
console.log('\n=== 2. Realtime survives connect-src ===');

const page = watch(await ctx.newPage());
await page.goto(`${BASE}/admin`, { waitUntil: 'load' });
await page.getByLabel('Email').fill(OWNER_EMAIL);
await page.getByLabel('Password').fill(PW);
await page.getByRole('button', { name: 'Sign in' }).click();

// Wait on the condition, not on a fixed sleep: sign-in is a network round trip whose
// latency varies, and a fixed timeout makes this suite fail intermittently for reasons
// that have nothing to do with the CSP it is meant to be testing.
const dashboard = page.getByText('Live orders');
await dashboard.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
check('owner reaches the dashboard', (await dashboard.count()) > 0);

// The dashboard prints "Live" only once the postgres_changes channel reports SUBSCRIBED.
// If wss:// were missing from connect-src this would sit on "Reconnecting" forever,
// with no error anywhere.
const liveBadge = page.getByText('Live', { exact: true });
await liveBadge.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});
const live = await liveBadge.count();
const reconnecting = await page.getByText('Reconnecting', { exact: true }).count();
check(
  'Realtime channel is SUBSCRIBED (wss: allowed)',
  live > 0 && reconnecting === 0,
  live > 0 ? 'Live' : 'Reconnecting — check connect-src wss://',
);

console.log('\n=== 3. QR codes survive img-src ===');

await page.goto(`${BASE}/admin/tables`, { waitUntil: 'load' });
const anyQr = page.locator('img[alt^="QR code for table"]').first();
await anyQr.waitFor({ state: 'visible', timeout: 20000 }).catch(() => {});

const qrCount = await page.locator('img[alt^="QR code for table"]').count();
check('QR images are in the DOM', qrCount > 0, `${qrCount} codes`);

// Present in the DOM is not the same as rendered: a blocked data: URI still leaves the
// element there with naturalWidth 0.
const rendered = await page.evaluate(() =>
  Array.from(document.querySelectorAll('img[alt^="QR code for table"]')).filter(
    (i) => i.complete && i.naturalWidth > 0,
  ).length,
);
check('QR images actually decoded (data: allowed)', rendered > 0 && rendered === qrCount, `${rendered}/${qrCount}`);

await page.waitForTimeout(500);
check('no CSP violations across admin', violations.length === 0, violations[0]);

await browser.close();

if (violations.length) {
  console.log('\n  Violations:');
  for (const v of [...new Set(violations)].slice(0, 10)) console.log(`    ${v}`);
}

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
