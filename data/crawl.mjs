import { chromium } from '/Users/syed/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';
import fs from 'fs';

const OUT = '/private/tmp/claude-501/-Users-syed-Downloads-212-cafe/421ef29b-1181-4285-a659-078d3315d324/scratchpad';
const URL = 'https://212.smaresto.com/selforder?table_id=12';

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext({
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  viewport: { width: 430, height: 932 },
  locale: 'en-US',
});
const page = await ctx.newPage();

const api = [];
page.on('response', async (res) => {
  const u = res.url();
  const ct = (res.headers()['content-type'] || '');
  if (ct.includes('json') || /\/api\/|graphql|menu|product|categor/i.test(u)) {
    let body = null;
    try { body = await res.text(); } catch {}
    api.push({ url: u, status: res.status(), ct, body: body ? body.slice(0, 400000) : null });
  }
});
page.on('console', m => console.log('[console]', m.type(), m.text().slice(0, 200)));

let navErr = null;
try {
  await page.goto(URL, { waitUntil: 'networkidle', timeout: 90000 });
} catch (e) { navErr = String(e).slice(0, 500); }

console.log('NAV_ERR:', navErr);
console.log('FINAL_URL:', page.url());
console.log('TITLE:', await page.title().catch(() => 'n/a'));

await page.waitForTimeout(6000);
// scroll to trigger lazy loads
try {
  for (let i = 0; i < 12; i++) {
    await page.mouse.wheel(0, 1600);
    await page.waitForTimeout(500);
  }
} catch {}
await page.waitForTimeout(3000);

const html = await page.content();
fs.writeFileSync(`${OUT}/page.html`, html);
const text = await page.evaluate(() => document.body ? document.body.innerText : '');
fs.writeFileSync(`${OUT}/page.txt`, text);
fs.writeFileSync(`${OUT}/api.json`, JSON.stringify(api, null, 2));
await page.screenshot({ path: `${OUT}/page.png`, fullPage: true }).catch(() => {});

console.log('HTML_LEN:', html.length, 'TEXT_LEN:', text.length, 'API_RESPONSES:', api.length);
console.log('--- API URLS ---');
for (const a of api) console.log(a.status, a.ct.split(';')[0], a.url.slice(0, 160), 'len=' + (a.body ? a.body.length : 0));
console.log('--- TEXT PREVIEW ---');
console.log(text.slice(0, 3000));

await browser.close();
