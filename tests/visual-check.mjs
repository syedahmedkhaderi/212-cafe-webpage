// Visual check for the homepage rebuild: hero, The View, and the category grid, at
// phone and desktop widths in both languages. Writes PNGs to /tmp/212-visual/.
//
//   node tests/visual-check.mjs
//
// Not an assertion suite — it exists so the three sections that prompted the redesign
// can be looked at directly, which is the only way to tell whether a layout is fixed.
import fs from 'fs';
import { chromium } from '/Users/syed/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs';

const BASE = process.env.BASE ?? 'http://localhost:3000';
const OUT = '/tmp/212-visual';
fs.mkdirSync(OUT, { recursive: true });

const browser = await chromium.launch();

const VIEWPORTS = [
  { name: 'phone', width: 390, height: 844, scale: 2 },
  { name: 'desktop', width: 1440, height: 900, scale: 2 },
];

for (const locale of ['en', 'ar']) {
  for (const vp of VIEWPORTS) {
    const ctx = await browser.newContext({
      viewport: { width: vp.width, height: vp.height },
      deviceScaleFactor: vp.scale,
    });
    // Set the locale cookie up front so the first-visit picker never covers the hero.
    await ctx.addCookies([
      { name: '212_locale', value: locale, url: BASE },
    ]);
    const page = await ctx.newPage();
    await page.goto(BASE, { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    const tag = `${locale}-${vp.name}`;
    await page.screenshot({ path: `${OUT}/${tag}-hero.png` });

    for (const id of ['view', 'signatures', 'menu']) {
      const section = page.locator(`#${id}`);
      if ((await section.count()) === 0) continue;
      await section.scrollIntoViewIfNeeded();
      await page.waitForTimeout(900);
      await page.screenshot({ path: `${OUT}/${tag}-${id}.png` });
    }

    // Full page, for overall rhythm.
    await page.screenshot({ path: `${OUT}/${tag}-full.png`, fullPage: true });
    console.log(`  captured ${tag}`);
    await ctx.close();
  }
}

await browser.close();
console.log(`\n  → ${OUT}`);
