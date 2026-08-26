// Downloads every 212 Café product image referenced by menu.json.
// Names files by SKU + slug so the seed can map them deterministically.
import fs from 'fs';
import path from 'path';

const DATA = '/Users/syed/Downloads/212-cafe/data';
const OUT = path.join(DATA, 'images');
fs.mkdirSync(OUT, { recursive: true });

const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';
const items = JSON.parse(fs.readFileSync(path.join(DATA, 'menu.json'), 'utf8'));

const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const manifest = [];
let ok = 0, fail = 0, skipped = 0;

for (const it of items) {
  if (!it.image_url) { skipped++; continue; }
  const ext = (it.image_url.split('.').pop().split('?')[0] || 'jpeg').toLowerCase();
  const file = `${it.sku}-${slug(it.name_en)}.${ext}`;
  const dest = path.join(OUT, file);

  if (fs.existsSync(dest) && fs.statSync(dest).size > 0) {
    manifest.push({ id: it.id, sku: it.sku, name_en: it.name_en, file, bytes: fs.statSync(dest).size });
    ok++; continue;
  }

  try {
    const res = await fetch(it.image_url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length === 0) throw new Error('empty body');
    fs.writeFileSync(dest, buf);
    manifest.push({ id: it.id, sku: it.sku, name_en: it.name_en, file, bytes: buf.length });
    ok++;
    console.log(`ok   ${file} (${(buf.length / 1024).toFixed(0)} KB)`);
  } catch (e) {
    fail++;
    console.log(`FAIL ${it.name_en}: ${e.message}`);
    manifest.push({ id: it.id, sku: it.sku, name_en: it.name_en, file: null, error: String(e.message) });
  }
}

fs.writeFileSync(path.join(DATA, 'images-manifest.json'), JSON.stringify(manifest, null, 2));
const total = manifest.reduce((s, m) => s + (m.bytes || 0), 0);
console.log(`\ndownloaded=${ok} failed=${fail} no_image=${skipped}  total=${(total / 1024 / 1024).toFixed(1)} MB`);
