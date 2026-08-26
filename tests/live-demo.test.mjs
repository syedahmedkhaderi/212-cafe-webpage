// The demo's climax, automated: a guest orders on a phone; the dashboard updates
// with no refresh; staff advance the status; the guest's phone follows.
import { chromium } from '/Users/syed/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const OUT = '/private/tmp/claude-501/-Users-syed-Downloads-212-cafe/421ef29b-1181-4285-a659-078d3315d324/scratchpad';
const BASE = 'http://localhost:3000';
const TOKEN = '6f51bd1f81b868a993610d4921368cdf'; // table 07

const browser = await chromium.launch();

// --- staff dashboard on a laptop -------------------------------------------------
const deskCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
const desk = await deskCtx.newPage();
const deskErrors = [];
desk.on('pageerror', (e) => deskErrors.push(String(e).slice(0, 160)));

await desk.goto(`${BASE}/admin`, { waitUntil: 'load' });
await desk.waitForTimeout(1200);
await desk.fill('input[type=email]', 'owner@212cafe.qa');
await desk.fill('input[type=password]', process.env.DEMO_STAFF_PASSWORD);
await desk.click('button[type=submit]');
await desk.waitForTimeout(4000);

const signedIn = await desk.locator('text=Live orders').count();
console.log('dashboard signed in:', signedIn > 0);
const before = await desk.locator('article').count();
console.log('open order cards before:', before);
await desk.screenshot({ path: `${OUT}/demo-1-dashboard-before.png` });

// --- guest orders on a phone -----------------------------------------------------
const phoneCtx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
const phone = await phoneCtx.newPage();
await phone.goto(`${BASE}/order/${TOKEN}`, { waitUntil: 'load' });
await phone.waitForTimeout(1200);

await phone.getByRole('button', { name: /Eggs Benedict/i }).first().click();
await phone.waitForTimeout(700);
await phone.getByRole('button', { name: /Add to order/ }).click();
await phone.waitForTimeout(600);
await phone.getByRole('button', { name: /View order/ }).click();
await phone.waitForTimeout(600);
await phone.getByRole('button', { name: /Place order/ }).click();
await phone.waitForTimeout(3500);

const orderLine = await phone.locator('.tabular').first().innerText();
console.log('guest placed:', orderLine.replace(/\s+/g, ' ').trim());
await phone.screenshot({ path: `${OUT}/demo-2-phone-placed.png` });

// --- did the dashboard update WITHOUT a reload? ----------------------------------
await desk.waitForTimeout(3500);
const after = await desk.locator('article').count();
console.log(`open order cards after:  ${after}   (no page reload performed)`);
console.log(after > before ? 'REALTIME OK — dashboard updated by itself' : 'REALTIME FAILED');
await desk.screenshot({ path: `${OUT}/demo-3-dashboard-after.png` });

// --- staff advance the order; guest phone should follow --------------------------
const startBtn = desk.getByRole('button', { name: 'Start' }).last();
if (await startBtn.count()) {
  await startBtn.click();
  console.log('staff pressed Start');
}
await desk.waitForTimeout(1500);

// guest polls every 3s
await phone.waitForTimeout(5000);
const guestStatus = await phone.locator('ol').innerText();
const preparing = /Being prepared/.test(guestStatus);
console.log('guest phone shows "Being prepared":', preparing);
await phone.screenshot({ path: `${OUT}/demo-4-phone-preparing.png` });

// --- kitchen display -------------------------------------------------------------
const kitchen = await deskCtx.newPage();
await kitchen.goto(`${BASE}/kitchen`, { waitUntil: 'load' });
await kitchen.waitForTimeout(3000);
console.log('kitchen columns rendered:', await kitchen.locator('section').count());
await kitchen.screenshot({ path: `${OUT}/demo-5-kitchen.png` });

console.log('\ndesk page errors:', deskErrors.length);
deskErrors.slice(0, 4).forEach((e) => console.log('  ', e));

await browser.close();
