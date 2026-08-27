// Ordering from /menu: the table arrives in a cookie from the QR scan, the public menu
// stays a public menu, and the order lands on the staff board without a refresh.
//
// Also the mobile assertions, at three real viewports, because a phone is the only
// device this is ever used on.
import { chromium, devices } from '/Users/syed/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const OUT = process.env.OUT_DIR ?? '/tmp';
const BASE = process.env.BASE_URL ?? 'http://localhost:3000';
const TOKEN = process.env.TABLE_TOKEN ?? '6f51bd1f81b868a993610d4921368cdf'; // table 07
const DEAD = '00000000000000000000000000000000';

let pass = 0;
let fail = 0;
const ok = (name, condition, detail = '') => {
  if (condition) {
    pass += 1;
    console.log(`  ✓ ${name}`);
  } else {
    fail += 1;
    console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`);
  }
};

const browser = await chromium.launch();
const phone = devices['iPhone 14 Pro'];

/* ------------------------------------------------------- 1. the public menu is public */
console.log('\npublic menu (no table cookie)');
{
  const ctx = await browser.newContext({ ...phone });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/menu`, { waitUntil: 'load' });
  await p.waitForTimeout(700);

  ok('no add-to-order buttons', (await p.locator('button[aria-label^="Add"]').count()) === 0);
  ok('no "Ordering for Table" banner', (await p.getByText(/Ordering for Table/).count()) === 0);
  ok('no fixed cart bar', (await p.locator('button:has-text("View order")').count()) === 0);
  ok('menu still renders items', (await p.locator('h3').count()) > 20);
  await ctx.close();
}

/* --------------------------------------------------------- 2. the token capture route */
console.log('\n/t/<token> capture');
{
  const ctx = await browser.newContext({ ...phone });
  const p = await ctx.newPage();

  await p.goto(`${BASE}/t/${TOKEN}`, { waitUntil: 'load' });
  ok('valid token redirects to the shopfront', new URL(p.url()).pathname === '/', p.url());

  const cookies = await ctx.cookies();
  const jar = cookies.find((c) => c.name === '212_table');
  ok('212_table cookie is set', Boolean(jar));
  ok('cookie is httpOnly', jar?.httpOnly === true);
  ok('cookie is not readable from JS', (await p.evaluate(() => document.cookie)).includes('212_table') === false);

  // The scan must be legible on the hero, or the guest has no idea ordering exists.
  ok('hero says which table', (await p.getByText(/You're at Table/).count()) > 0);
  await ctx.close();
}

console.log('\n/t/<bad token> is refused without a 404');
{
  const ctx = await browser.newContext({ ...phone });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/t/${DEAD}`, { waitUntil: 'load' });
  ok('still lands on the shopfront', new URL(p.url()).pathname === '/');
  ok('no table cookie written', !(await ctx.cookies()).some((c) => c.name === '212_table' && c.value));
  await ctx.close();
}

/* ------------------------------------------------------------ 3. ordering from /menu */
console.log('\nordering from /menu');
let placedNumber = null;
{
  const ctx = await browser.newContext({ ...phone });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push(String(e).slice(0, 200)));

  await p.goto(`${BASE}/t/${TOKEN}`, { waitUntil: 'load' });
  await p.waitForTimeout(600);
  await p.goto(`${BASE}/menu`, { waitUntil: 'load' });
  await p.waitForTimeout(900);

  ok('banner names the table', (await p.getByText(/Ordering for Table 07/).count()) > 0);

  const addButtons = p.locator('button[aria-label^="Add"]');
  ok('items are tappable', (await addButtons.count()) > 20);

  await addButtons.first().click();
  await p.waitForTimeout(700);
  const sheetAdd = p.locator('button:has-text("Add to order")');
  ok('item sheet opens', (await sheetAdd.count()) > 0);

  /*
    The mobile bug the dvh change exists for.

    With max-h-[88vh] on iOS the sheet is sized against the LARGE viewport, so its own
    box runs past the bottom of the screen and the last control in it — the button that
    commits the choice — cannot be reached at all. Two assertions, because either alone
    would pass on the broken version: the sheet must be capped inside the visible
    viewport, AND scrolling it to the end must actually bring the button into view.
  */
  const geom = await p.evaluate(() => {
    const sheet = document.querySelector('[data-surface="dark"] > div.relative');
    const r = sheet.getBoundingClientRect();
    return { height: r.height, top: r.top, scrollHeight: sheet.scrollHeight, vh: window.innerHeight };
  });
  ok('sheet is capped inside the viewport', geom.top + geom.height <= geom.vh + 1,
    `sheet bottom ${Math.round(geom.top + geom.height)} vs viewport ${geom.vh}`);
  ok('sheet content actually overflows (so this is a real test)', geom.scrollHeight > geom.height);

  const reachable = await p.evaluate(() => {
    const sheet = document.querySelector('[data-surface="dark"] > div.relative');
    sheet.scrollTop = sheet.scrollHeight;
    const btn = [...sheet.querySelectorAll('button')].find((b) => b.textContent.includes('Add to order'));
    return btn.getBoundingClientRect().bottom <= window.innerHeight;
  });
  ok('"Add to order" is reachable by scrolling the sheet', reachable);
  await p.evaluate(() => {
    document.querySelector('[data-surface="dark"] > div.relative').scrollTop = 0;
  });

  // Background must not scroll while a sheet is open.
  const before = await p.evaluate(() => window.scrollY);
  await p.mouse.wheel(0, 600);
  await p.waitForTimeout(300);
  ok('page behind the sheet is locked', (await p.evaluate(() => window.scrollY)) === before);

  await sheetAdd.first().click();
  await p.waitForTimeout(600);

  const cartBar = p.locator('button:has-text("View order")');
  ok('cart bar appears', (await cartBar.count()) === 1);

  await cartBar.first().click();
  await p.waitForTimeout(600);
  ok('cart sheet says the table', (await p.getByText(/Table 07/).count()) > 0);
  ok('no payment step is offered', (await p.getByText(/Pay at the counter/).count()) > 0);

  await p.getByPlaceholder(/call it out/i).fill('Playwright');
  await p.locator('button:has-text("Place order")').click();
  await p.waitForTimeout(3500);

  const tracker = await p.getByText(/Thank you/).count();
  ok('order is placed', tracker > 0);

  placedNumber = await p.evaluate(() => {
    const m = document.body.innerText.match(/\b[A-Z]\d{4,}\b/);
    return m ? m[0] : null;
  });
  ok('an order number came back', Boolean(placedNumber), String(placedNumber));

  ok('no page errors', errors.length === 0, errors.join(' | '));

  // Back to the menu: the tracker must become a pill, not a wall.
  await p.locator('button:has-text("Back to the menu")').click();
  await p.waitForTimeout(500);
  await p.goto(`${BASE}/menu`, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  ok('menu is not blocked after ordering', (await p.locator('button[aria-label^="Add"]').count()) > 20);
  ok('a status pill is shown instead', (await p.locator(`button:has-text("${placedNumber ?? 'A'}")`).count()) > 0);

  await p.screenshot({ path: `${OUT}/menu-order-after.png`, fullPage: false });
  await ctx.close();
}

/* ------------------------------------------------- 4. it reaches the staff dashboard */
console.log('\nthe order reaches /admin');
if (process.env.DEMO_STAFF_PASSWORD) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/admin`, { waitUntil: 'load' });
  await p.waitForTimeout(1200);
  await p.fill('input[type=email]', 'owner@212cafe.qa');
  await p.fill('input[type=password]', process.env.DEMO_STAFF_PASSWORD);
  await p.click('button[type=submit]');
  await p.waitForTimeout(4500);

  ok('signed in', (await p.getByText(/Live orders/).count()) > 0);
  ok('the order is on the board', placedNumber ? (await p.getByText(placedNumber).count()) > 0 : false, String(placedNumber));
  ok('it is labelled with the table', (await p.getByText(/Table 07/).count()) > 0);
  ok('the guest name is shown', (await p.getByText('Playwright').count()) > 0);
  await ctx.close();
} else {
  console.log('  – skipped (set DEMO_STAFF_PASSWORD to run)');
}

/* -------------------------------------------------------------- 5. mobile viewports */
console.log('\nmobile layout');
for (const [label, opts] of [
  ['iPhone SE 320×568', { viewport: { width: 320, height: 568 }, isMobile: true, hasTouch: true }],
  ['iPhone 14 Pro', { ...devices['iPhone 14 Pro'] }],
  ['Pixel 7', { ...devices['Pixel 7'] }],
]) {
  const ctx = await browser.newContext(opts);
  // A chosen language, so the first-visit picker is not covering the page being
  // measured. Everything here is about the layout underneath it.
  await ctx.addCookies([{ name: '212_locale', value: 'en', url: BASE }]);
  const p = await ctx.newPage();

  for (const path of ['/', '/menu', `/order/${TOKEN}`]) {
    await p.goto(`${BASE}${path}`, { waitUntil: 'load' });
    await p.waitForTimeout(900);
    const overflow = await p.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    ok(`${label} ${path} — no horizontal scroll`, overflow <= 1, `${overflow}px over`);
  }

  /*
    Exactly one thing pinned to the bottom edge, ever — two competing fixed bars on a
    phone is worse than either alone.

    Bounded by height as well as position: a full-screen overlay (the first-visit
    language picker is `fixed inset-0`) also touches the bottom edge, and is not a bar.
  */
  await p.goto(`${BASE}/`, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  const bars = await p.evaluate(() =>
    [...document.querySelectorAll('div')].filter((el) => {
      const s = getComputedStyle(el);
      if (s.position !== 'fixed' || s.display === 'none') return false;
      const r = el.getBoundingClientRect();
      return (
        r.bottom >= window.innerHeight - 2 &&
        r.height > 40 &&
        r.height < window.innerHeight * 0.25 &&
        r.width > window.innerWidth * 0.8
      );
    }).length,
  );
  ok(`${label} / — at most one fixed bottom bar`, bars <= 1, `${bars} found`);

  // A pinned bar that covers content is worse than no bar. The opening-hours row is
  // the last thing in the hero's first screen and was cut in half by it — which is why
  // the bar only appears once the hero has been scrolled past.
  const clipped = await p.evaluate(() => {
    const bar = [...document.querySelectorAll('div')].find((el) => {
      const s = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return s.position === 'fixed' && r.bottom >= window.innerHeight - 2 && r.height > 40 && r.height < window.innerHeight * 0.25;
    });
    if (!bar) return false;
    const hours = [...document.querySelectorAll('div')].find((el) => /Open now|Closed/.test(el.textContent ?? '') && el.children.length < 4);
    if (!hours) return false;
    const h = hours.getBoundingClientRect();
    return h.bottom > bar.getBoundingClientRect().top && h.top < window.innerHeight;
  });
  ok(`${label} / — the bar does not cover the hero's last line`, !clipped);

  // …but it must actually turn up once the guest is past the hero, or it is not a
  // thumb-reach affordance, it is dead code.
  await p.evaluate(() => window.scrollTo(0, window.innerHeight * 1.5));
  await p.waitForTimeout(500);
  const appeared = await p.locator('a:has-text("Find us")').last().isVisible().catch(() => false);
  ok(`${label} / — the action bar appears after the hero`, appeared);

  await p.screenshot({ path: `${OUT}/mobile-${label.replace(/\W+/g, '-')}-home.png` });
  await ctx.close();
}

/* ------------------------------------------------------------------- 6. tap targets */
console.log('\ntap targets');
{
  const ctx = await browser.newContext({ ...devices['iPhone 14 Pro'] });
  const p = await ctx.newPage();
  await p.goto(`${BASE}/t/${TOKEN}`, { waitUntil: 'load' });
  await p.goto(`${BASE}/order/${TOKEN}`, { waitUntil: 'load' });
  await p.waitForTimeout(1000);

  await p.locator('main button').first().click();
  await p.waitForTimeout(800);

  const small = await p.evaluate(() =>
    [...document.querySelectorAll('.fixed button, .fixed a')]
      .filter((el) => el.offsetParent !== null)
      .map((el) => {
        const r = el.getBoundingClientRect();
        return { label: (el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 24), w: Math.round(r.width), h: Math.round(r.height) };
      })
      // The full-bleed backdrop button is the scrim, not a control.
      .filter((b) => b.w > 0 && b.h > 0 && !(b.w > 300 && b.h > 500))
      .filter((b) => b.w < 44 || b.h < 44),
  );
  ok('every sheet control is at least 44×44', small.length === 0, JSON.stringify(small));
  await ctx.close();
}

await browser.close();

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
