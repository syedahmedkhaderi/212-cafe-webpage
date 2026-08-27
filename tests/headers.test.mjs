// The response headers themselves, asserted directly over HTTP.
//
//   node tests/headers.test.mjs        (needs the app running: ./start.sh)
//
// WHY THIS SUITE EXISTS, SEPARATELY FROM csp.test.mjs
//
// The site once shipped `upgrade-insecure-requests` on http://localhost. Safari honours
// that directive on loopback: it reissued every /_next/ asset as https://localhost:3000,
// found no TLS listener, and rendered the page as bare unstyled HTML with broken images.
// Chrome exempts loopback from the upgrade, so the very same server looked perfect there
// — which is why csp.test.mjs, a Playwright/Chromium suite, was green the whole time.
//
// A browser can therefore never be trusted to catch this class of bug: the browser that
// would fail is the one we cannot automate. So this suite drives no browser at all. It
// reads the headers off the wire and asserts the contract, which is true regardless of
// who is rendering. It needs no credentials and no Playwright, so it can run in the
// default `./start.sh test` batch.
//
// Exit codes:  0 all passed   1 a failure   2 skipped, no server on the port

import { request as httpRequest } from 'node:http';

const BASE = process.env.BASE ?? 'http://localhost:3000';

/** Connection target for a raw node:http request, kept separate from the Host header. */
const parseBase = (base) => {
  const u = new URL(base);
  return { hostname: u.hostname, port: u.port || 80 };
};

let pass = 0;
let fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const get = async (path, headers = {}) => {
  const res = await fetch(`${BASE}${path}`, { headers, redirect: 'manual' });
  return res.headers;
};

let plain;
try {
  plain = await get('/');
} catch {
  console.log(`\n  SKIPPED — nothing is serving ${BASE}. Start the app (./start.sh) and re-run.\n`);
  process.exit(2);
}

const csp = plain.get('content-security-policy') ?? '';
const directive = (name) =>
  csp
    .split(';')
    .map((d) => d.trim())
    .find((d) => d === name || d.startsWith(`${name} `));

/* ------------------------------------------------- the regression, stated directly */
console.log('\n=== 1. Plain HTTP on a local origin must NOT ask for an upgrade ===');

check('a CSP is present at all', csp.length > 0, csp ? `${csp.length} chars` : 'MISSING');
check(
  'no upgrade-insecure-requests over http://localhost',
  !csp.includes('upgrade-insecure-requests'),
  csp.includes('upgrade-insecure-requests')
    ? 'PRESENT — Safari will upgrade every asset to https://localhost and render an unstyled page'
    : undefined,
);

// Present in the CSP is not the only way to break this: a <meta http-equiv> in the
// document would do it too, and would not show up in a header check.
const html = await fetch(BASE).then((r) => r.text());
check(
  'no upgrade-insecure-requests in a <meta> tag either',
  !/http-equiv=["']?Content-Security-Policy[\s\S]{0,400}?upgrade-insecure-requests/i.test(html),
);

/* ---------------------------------------- and the other half: it is NOT just deleted */
console.log('\n=== 2. A real HTTPS deployment must still get the upgrade ===');

// How a request arrives on the deployed site: TLS terminated at the edge, original
// scheme reported in x-forwarded-proto. Asserting this stops the fix from being
// "delete the directive", which would quietly downgrade production security.
const forwarded = await get('/', { 'x-forwarded-proto': 'https' });
const fwdCsp = forwarded.get('content-security-policy') ?? '';
check(
  'upgrade-insecure-requests IS sent when x-forwarded-proto is https',
  fwdCsp.includes('upgrade-insecure-requests'),
  fwdCsp.includes('upgrade-insecure-requests') ? undefined : 'MISSING — production lost the directive',
);

// A host we do not recognise is treated as a deployment, not as a dev machine.
//
// This one cannot use fetch(): `host` is a forbidden header name, and undici drops an
// override of it silently rather than erroring — the request goes out as localhost and
// the assertion tests nothing while appearing to fail. node:http sends what it is given.
const unknownHostCsp = await new Promise((resolve, reject) => {
  const req = httpRequest(
    { ...parseBase(BASE), path: '/', method: 'GET', headers: { host: '212cafe.qa', 'x-forwarded-proto': 'http' } },
    (res) => {
      res.resume();
      resolve(res.headers['content-security-policy'] ?? '');
    },
  );
  req.on('error', reject);
  req.end();
});
check(
  'an unrecognised host keeps the directive (fail-safe direction)',
  unknownHostCsp.includes('upgrade-insecure-requests'),
  unknownHostCsp.includes('upgrade-insecure-requests') ? undefined : 'a real deployment would lose it',
);

/* --------------------------------------------------- the rest of the policy, intact */
console.log('\n=== 3. The directives the app actually depends on ===');

// Each of these fails silently when wrong — see the notes in src/proxy.ts.
check('script-src carries a per-request nonce', /nonce-[A-Za-z0-9+/=]+/.test(directive('script-src') ?? ''));
check("style-src allows 'unsafe-inline' (inline style attributes)", (directive('style-src') ?? '').includes("'unsafe-inline'"));
check('img-src allows data: (printable table QR codes)', (directive('img-src') ?? '').includes('data:'));
check('connect-src allows wss: (Realtime order board)', (directive('connect-src') ?? '').includes('wss://'));
check("form-action 'self' (Server Actions)", directive('form-action') === "form-action 'self'");
check("frame-ancestors 'none'", directive('frame-ancestors') === "frame-ancestors 'none'");
check("object-src 'none'", directive('object-src') === "object-src 'none'");

// The nonce is per-request, not per-build. A cached CSP would hand every visitor the
// same nonce, which is the same as having no nonce.
const second = await get('/');
const nonceOf = (h) => (h.get('content-security-policy') ?? '').match(/nonce-([A-Za-z0-9+/=]+)/)?.[1];
check('the nonce differs between two requests', Boolean(nonceOf(plain)) && nonceOf(plain) !== nonceOf(second));

console.log('\n=== 4. The static security headers ===');

check('Strict-Transport-Security is set', (plain.get('strict-transport-security') ?? '').includes('max-age='));
check('X-Content-Type-Options: nosniff', plain.get('x-content-type-options') === 'nosniff');
check('X-Frame-Options: DENY', plain.get('x-frame-options') === 'DENY');
check('Referrer-Policy is set', Boolean(plain.get('referrer-policy')));

/* ---------------------------------------------------------------- caching contract */
console.log('\n=== 5. /menu is a page, not a year-long immutable asset ===');

// `/:dir(menu|hero)/:file+` in next.config.ts uses `+` precisely so the /menu HTML page
// does not match. With `*` it did, and the page froze for a year with no visible symptom.
const menu = await get('/menu');
check(
  '/menu is not served immutable',
  !(menu.get('cache-control') ?? '').includes('immutable'),
  menu.get('cache-control') ?? 'no cache-control',
);

console.log(`\n  ${pass} passed, ${fail} failed\n`);
process.exit(fail === 0 ? 0 : 1);
