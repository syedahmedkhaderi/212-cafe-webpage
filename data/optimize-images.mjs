// Converts the crawled JPEGs into web-ready WebP in public/menu/.
// The incumbent serves ~25.9 MB of raw WhatsApp photos for this same menu; the point of
// this step is to make that number collapse. next/image handles responsive variants and
// AVIF negotiation at request time, so one well-sized source per item is enough.
import fs from 'fs';
import path from 'path';
import sharp from 'sharp';

const ROOT = '/Users/syed/Downloads/212-cafe';
const SRC = path.join(ROOT, 'data/images');
const OUT = path.join(ROOT, 'public/menu');
fs.mkdirSync(OUT, { recursive: true });

const MAX_WIDTH = 1200;   // plenty for a full-bleed phone hero at 3x
const QUALITY = 76;

const manifest = JSON.parse(fs.readFileSync(path.join(ROOT, 'data/images-manifest.json'), 'utf8'));

let srcBytes = 0, outBytes = 0, n = 0;
const out = [];

for (const entry of manifest) {
  if (!entry.file) continue;
  const src = path.join(SRC, entry.file);
  if (!fs.existsSync(src)) continue;

  const base = entry.file.replace(/\.[^.]+$/, '');
  const dest = path.join(OUT, `${base}.webp`);

  const img = sharp(src);
  const meta = await img.metadata();
  const info = await img
    .rotate()                                   // honour EXIF orientation from phone photos
    .resize({ width: Math.min(MAX_WIDTH, meta.width || MAX_WIDTH), withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 5 })
    .toFile(dest);

  srcBytes += entry.bytes;
  outBytes += info.size;
  n++;
  out.push({
    source_id: entry.id,
    sku: entry.sku,
    name_en: entry.name_en,
    path: `/menu/${base}.webp`,
    width: info.width,
    height: info.height,
    bytes: info.size,
  });
}

fs.writeFileSync(path.join(ROOT, 'data/optimized-manifest.json'), JSON.stringify(out, null, 2));

const mb = (b) => (b / 1024 / 1024).toFixed(2);
console.log(`converted ${n} images`);
console.log(`  before: ${mb(srcBytes)} MB`);
console.log(`  after:  ${mb(outBytes)} MB   (${(100 - (outBytes / srcBytes) * 100).toFixed(1)}% smaller)`);
console.log(`  largest now: ${(Math.max(...out.map((o) => o.bytes)) / 1024).toFixed(0)} KB`);
console.log(`  median now:  ${(out.map((o) => o.bytes).sort((a, b) => a - b)[Math.floor(out.length / 2)] / 1024).toFixed(0)} KB`);
