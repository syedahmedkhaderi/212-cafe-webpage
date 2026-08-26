// The site-wide Arabic switch: first-visit picker, header switcher, persistence
// across pages and reloads, and correct RTL on the marketing site.
import { chromium } from '/Users/syed/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const OUT = '/private/tmp/claude-501/-Users-syed-Downloads-212-cafe/421ef29b-1181-4285-a659-078d3315d324/scratchpad';
const BASE = 'http://localhost:3000';

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const browser = await chromium.launch();

/* ------------------------------------------ 1. first visit shows the picker ----- */
console.log('\n=== 1. First visit ===');
const fresh = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const p1 = await fresh.newPage();
await p1.goto(BASE, { waitUntil: 'load' });
await p1.waitForTimeout(1200);

const picker = p1.getByRole('dialog');
check('language picker appears on first visit', (await picker.count()) === 1);
check('offers English', (await picker.getByRole('button', { name: 'English' }).count()) > 0);
check('offers العربية', (await picker.getByRole('button', { name: 'العربية' }).count()) > 0);
await p1.screenshot({ path: `${OUT}/ar-site-1-picker.png` });

await picker.getByRole('button', { name: 'العربية' }).click();
await p1.waitForTimeout(2500);

check('picker dismissed after choosing', (await p1.getByRole('dialog').count()) === 0);

/* ------------------------------------------ 2. the site is now Arabic ----------- */
console.log('\n=== 2. Arabic marketing site ===');
const htmlLang = await p1.evaluate(() => document.documentElement.lang);
const htmlDir = await p1.evaluate(() => document.documentElement.dir);
check('<html lang="ar">', htmlLang === 'ar', `lang=${htmlLang}`);
check('<html dir="rtl">', htmlDir === 'rtl', `dir=${htmlDir}`);

const h1 = await p1.locator('h1').first().innerText();
check('hero headline is Arabic', /[؀-ۿ]/.test(h1), h1.replace(/\n/g, ' '));

const body = await p1.locator('body').innerText();
check('section headings translated', /الإطلالة/.test(body) && /زورونا/.test(body));
check('hours label translated', /ساعات العمل/.test(body));
check('prices remain Latin', /QAR\s?\d/.test(body), body.match(/QAR\s?[\d.]+/)?.[0]);
await p1.screenshot({ path: `${OUT}/ar-site-2-home.png`, fullPage: true });

/* ------------------------------------------ 3. persists across pages ------------ */
console.log('\n=== 3. Persistence ===');
await p1.goto(`${BASE}/menu`, { waitUntil: 'load' });
await p1.waitForTimeout(1500);
const menuLang = await p1.evaluate(() => document.documentElement.lang);
const menuBody = await p1.locator('body').innerText();
check('menu page stays Arabic', menuLang === 'ar', `lang=${menuLang}`);
check('menu heading translated', /كل ما نقدمه/.test(menuBody));
check('category names Arabic', /مشروبات ساخنة/.test(menuBody));
await p1.screenshot({ path: `${OUT}/ar-site-3-menu.png` });

await p1.reload({ waitUntil: 'load' });
await p1.waitForTimeout(1200);
check('survives a reload', (await p1.evaluate(() => document.documentElement.lang)) === 'ar');
check('no picker on return visits', (await p1.getByRole('dialog').count()) === 0);

/* ------------------------------------------ 4. switch back to English ----------- */
console.log('\n=== 4. Header switcher ===');
const switcher = p1.getByRole('group', { name: /اللغة|Language/ }).first();
check('switcher visible in the header', (await switcher.count()) > 0);

await p1.getByRole('button', { name: 'EN', exact: true }).first().click();
await p1.waitForTimeout(2500);
check('switched back to English', (await p1.evaluate(() => document.documentElement.lang)) === 'en');
check('direction reset to ltr', (await p1.evaluate(() => document.documentElement.dir)) === 'ltr');
const enBody = await p1.locator('body').innerText();
check('English copy restored', /Everything we serve/.test(enBody));

/* ------------------------------------------ 5. Accept-Language default ---------- */
console.log('\n=== 5. Arabic browser, no cookie ===');
const arCtx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  locale: 'ar-QA',
  extraHTTPHeaders: { 'accept-language': 'ar-QA,ar;q=0.9,en;q=0.8' },
});
const p2 = await arCtx.newPage();
await p2.goto(BASE, { waitUntil: 'load' });
await p2.waitForTimeout(1200);
check(
  'an Arabic browser lands on Arabic before choosing',
  (await p2.evaluate(() => document.documentElement.lang)) === 'ar',
);

/* ------------------------------------------ 6. no layout breakage --------------- */
console.log('\n=== 6. Layout ===');
for (const [name, page] of [['ar', p2]]) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  );
  check(`${name}: no horizontal overflow`, !overflow);
}

/* ------------------------------------------ 7. the ordering app inherits it ----- */
// The discriminating check: set the cookie, navigate STRAIGHT to a table QR URL, and
// assert Arabic with zero clicks. Earlier versions of this suite never visited /order,
// and the RTL suite reached Arabic by clicking the ordering app's own toggle — so both
// passed while an Arabic guest scanning a QR still landed in English.
console.log('\n=== 7. Ordering app inherits the site language ===');

const TABLE_TOKEN = process.env.DEMO_TABLE_TOKEN;
if (!TABLE_TOKEN) {
  console.log('  SKIP  set DEMO_TABLE_TOKEN to check the ordering surface');
} else {
  const guest = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await guest.addCookies([
    { name: '212_locale', value: 'ar', url: BASE },
  ]);
  const g = await guest.newPage();
  await g.goto(`${BASE}/order/${TABLE_TOKEN}`, { waitUntil: 'load' });
  await g.waitForTimeout(1500);

  const dir = await g.evaluate(() => document.querySelector('[data-surface]')?.getAttribute('dir'));
  const heading = await g.locator('h1').first().innerText();
  const gBody = await g.locator('body').innerText();

  check('ordering app is RTL with no clicks', dir === 'rtl', `dir=${dir}`);
  check('greeting is Arabic', /أهلاً بك/.test(heading), heading);
  check('table label is Arabic', /طاولة/.test(gBody));
  check('category rail is Arabic', /مشروبات ساخنة/.test(gBody));
  await g.screenshot({ path: `${OUT}/ar-site-4-order.png` });

  // and an English cookie must give English, no clicks either
  const en = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await en.addCookies([{ name: '212_locale', value: 'en', url: BASE }]);
  const e = await en.newPage();
  await e.goto(`${BASE}/order/${TABLE_TOKEN}`, { waitUntil: 'load' });
  await e.waitForTimeout(1200);
  check(
    'English cookie gives the English ordering app',
    /Good to see you/.test(await e.locator('body').innerText()),
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
await browser.close();
process.exit(fail ? 1 : 0);
