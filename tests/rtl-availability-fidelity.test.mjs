// The three verification items from the plan that had not been run:
//   1. Arabic RTL all the way through cart -> order status (not just /menu)
//   2. Availability toggle reaching the customer menu
//   3. Seeded data fidelity spot-check against the crawl
import { chromium } from '/Users/syed/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import fs from 'fs';

const OUT = '/private/tmp/claude-501/-Users-syed-Downloads-212-cafe/421ef29b-1181-4285-a659-078d3315d324/scratchpad';
const BASE = 'http://localhost:3000';
const TOKEN = '6f51bd1f81b868a993610d4921368cdf';
const SUPA = 'https://zdurieneqpgszngplgmb.supabase.co';
const KEY = 'sb_publishable_UnXoDqpHVPaRMZ9xUo5JKQ_7MM8E8gZ';
const PW = process.env.DEMO_STAFF_PASSWORD;

let pass = 0, fail = 0;
const check = (label, ok, detail) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? '  → ' + detail : ''}`);
  ok ? pass++ : fail++;
};

const browser = await chromium.launch();

/* ---------------------------------------- 1. Arabic through cart -> status ------- */
console.log('\n=== 1. Arabic RTL: cart and order status ===');
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const phone = await ctx.newPage();
await phone.goto(`${BASE}/order/${TOKEN}`, { waitUntil: 'load' });
await phone.waitForTimeout(1200);

await phone.getByRole('button', { name: 'ع' }).click();
await phone.waitForTimeout(700);

const rootDir = await phone.evaluate(() => document.querySelector('[data-surface]')?.getAttribute('dir'));
check('ordering app switches to RTL', rootDir === 'rtl', `dir=${rootDir}`);

const heading = await phone.locator('h1').first().innerText();
check('heading is Arabic', /[؀-ۿ]/.test(heading), heading);

// open an item and add it
await phone.locator('main button').filter({ hasText: /[؀-ۿ]/ }).first().click();
await phone.waitForTimeout(800);
await phone.screenshot({ path: `${OUT}/ar-1-item.png` });

const addBtn = phone.getByRole('button', { name: /أضف إلى الطلب/ });
check('item sheet add button is Arabic', (await addBtn.count()) > 0);
await addBtn.click();
await phone.waitForTimeout(700);

const viewBtn = phone.getByRole('button', { name: /عرض الطلب/ });
check('cart bar is Arabic', (await viewBtn.count()) > 0);
await viewBtn.click();
await phone.waitForTimeout(700);

const cartDir = await phone.evaluate(() => {
  const el = [...document.querySelectorAll('div')].find((d) => d.className.includes('rounded-t-2xl'));
  return el ? getComputedStyle(el).direction : null;
});
const cartText = await phone.locator('.rounded-t-2xl').innerText();
check('cart sheet renders RTL', cartDir === 'rtl', `direction=${cartDir}`);
check('cart total label is Arabic', /الإجمالي/.test(cartText));
check('prices stay Latin in cart', /QAR\s*\d/.test(cartText), cartText.match(/QAR\s*[\d.]+/)?.[0]);
await phone.screenshot({ path: `${OUT}/ar-2-cart.png` });

await phone.getByRole('button', { name: /إرسال الطلب/ }).click();
await phone.waitForTimeout(4000);

const statusText = await phone.locator('ol').innerText();
check('status tracker is Arabic', /تم استلام الطلب/.test(statusText), statusText.split('\n')[0]);
const thanks = await phone.locator('h1').first().innerText();
check('confirmation heading is Arabic', /شكراً/.test(thanks), thanks);
await phone.screenshot({ path: `${OUT}/ar-3-status.png` });

/* ---------------------------------------- 2. availability toggle ----------------- */
console.log('\n=== 2. Sold-out toggle reaches the customer menu ===');

const login = await fetch(`${SUPA}/auth/v1/token?grant_type=password`, {
  method: 'POST',
  headers: { apikey: KEY, 'Content-Type': 'application/json' },
  body: JSON.stringify({ email: 'owner@212cafe.qa', password: PW }),
});
const { access_token } = await login.json();

const setAvailable = async (name, value) => {
  await fetch(`${SUPA}/rest/v1/menu_items?name_en=eq.${encodeURIComponent(name)}`, {
    method: 'PATCH',
    headers: { apikey: KEY, Authorization: `Bearer ${access_token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ is_available: value }),
  });
};

// A fresh context, pinned to English. Part 1 toggles the ordering app into Arabic,
// and that toggle now writes the SHARED locale cookie — so reusing that context would
// render /menu in Arabic and look for an English item name that is not there.
const enCtx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await enCtx.addCookies([{ name: '212_locale', value: 'en', url: BASE }]);
const menuPage = await enCtx.newPage();
await menuPage.goto(`${BASE}/menu`, { waitUntil: 'load' });
await menuPage.waitForTimeout(1000);
const before = await menuPage.getByText('Eggs Benedict', { exact: true }).count();
check('Eggs Benedict visible before toggle', before > 0);

await setAvailable('Eggs Benedict', false);
await menuPage.reload({ waitUntil: 'load' });
await menuPage.waitForTimeout(1200);
const after = await menuPage.getByText('Eggs Benedict', { exact: true }).count();
check('hidden from /menu on next load (no 5-min wait)', after === 0, `count=${after}`);

// and the guest can no longer order it
const orderPage = await enCtx.newPage();
await orderPage.goto(`${BASE}/order/${TOKEN}`, { waitUntil: 'load' });
await orderPage.waitForTimeout(1200);
const inOrder = await orderPage.getByText('Eggs Benedict', { exact: true }).count();
check('hidden from the ordering app too', inOrder === 0, `count=${inOrder}`);

await setAvailable('Eggs Benedict', true);
console.log('  (restored to available)');

/* ---------------------------------------- 3. seed fidelity ----------------------- */
console.log('\n=== 3. Seeded data matches the crawl ===');
const crawl = JSON.parse(fs.readFileSync('/Users/syed/Downloads/212-cafe/data/menu.json', 'utf8'));
const sample = ['Americano', 'Eggs Benedict', 'The French Toast', '212-Signature', 'Halloumi Sandwich'];

for (const name of sample) {
  const src = crawl.find((i) => i.name_en === name);
  const res = await fetch(
    `${SUPA}/rest/v1/menu_items?select=name_en,name_ar,price&name_en=eq.${encodeURIComponent(name)}`,
    { headers: { apikey: KEY, Authorization: `Bearer ${access_token}` } },
  );
  const [row] = await res.json();
  const priceOk = row && Number(row.price) === src.price;
  const arabicOk = row && row.name_ar === src.name_ar;
  check(
    `${name.padEnd(20)} price ${src.price} · Arabic "${src.name_ar}"`,
    priceOk && arabicOk,
    priceOk && arabicOk ? 'exact match' : `db=${row?.price}/${row?.name_ar}`,
  );
}

console.log(`\n${pass} passed, ${fail} failed\n`);
await browser.close();
process.exit(fail ? 1 : 0);
