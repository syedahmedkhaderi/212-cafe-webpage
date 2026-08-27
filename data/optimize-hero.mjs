// Hero imagery — a deliberately separate pipeline from data/optimize-images.mjs.
//
// optimize-images.mjs is tuned for menu thumbnails: MAX_WIDTH 1200, quality 76. Those
// numbers are right for a 96px card and wrong for a full-bleed hero, where the same file
// is stretched across the whole viewport. Running the hero through that pipeline produces
// a visibly soft image on any retina display, and no `sizes` attribute rescues it —
// the pixels are simply not there.
//
// So: higher quality, no downscale below the source, and **art direction**. A 4:3
// landscape inside a full-height section on a 9:19.5 phone keeps only the middle ~42% of
// the frame horizontally, which throws away the sunset sky and the marina — the two
// things that make the picture worth using. Rather than fight that with object-position,
// this emits a purpose-made portrait crop that the page selects with <picture> + media.
//
//   node data/optimize-hero.mjs
//
// Never upscales. Where a source cannot meet the target it says so, loudly, rather than
// silently emitting a soft file — see the SHORTFALL report at the end.
import fs from 'fs';
import path from 'path';
import url from 'url';
import sharp from 'sharp';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'public/hero');
fs.mkdirSync(OUT, { recursive: true });

/** What a full-bleed hero actually wants: a 1440px viewport on a 2x display. */
const TARGET_WIDE_WIDTH = 2880;
/** A 390px phone at 3x. Portrait crops are narrower, so the bar is lower. */
const TARGET_PORTRAIT_WIDTH = 1170;

const QUALITY = 84; // vs 76 for thumbnails — this file is the first thing anyone sees

/**
 * `focalX` is the horizontal centre of the subject, 0–1, used to place the portrait
 * crop. Measured by eye from the source, not guessed: for the Katara Towers frame the
 * crescent spans ~0.24–0.72, so 0.48 centres it with margin on both sides.
 */
const SOURCES = [
  {
    key: 'katara-sunset',
    src: '/Users/syed/Downloads/Katara-Towers-Raffles-Doha.jpg',
    focalX: 0.48,
    note: 'Aerial press photograph of the Katara Towers at sunset. Licence UNCONFIRMED.',
  },
  {
    key: 'terrace-signature',
    src: path.join(ROOT, 'data/images/0016-212-signature.jfif'),
    focalX: 0.5,
    note: "The café's own terrace shot — the skyline seen from 212. Admin-switchable alternative.",
  },
];

/**
 * The View section wants a landscape image OF THE VIEW — not another drink.
 *
 * The café's terrace photographs are portrait frames whose top half is the actual
 * skyline: Katara Towers, the Gulf, the marina, the palms below. Cropping that band out
 * gives a genuine wide establishing shot of the thing the section is about, taken from
 * 212's own terrace rather than from a stock aerial.
 *
 * `top` is a fraction of source height — where the band starts.
 */
const BANDS = [
  {
    key: 'terrace-view',
    src: path.join(ROOT, 'data/images/0208-hiby-splash.jpeg'),
    top: 0,
    ratio: 16 / 9,
    note: "The view from the terrace, cropped from the café's own photography.",
  },
];

const PORTRAIT_RATIO = 3 / 4; // width / height

const shortfalls = [];
const manifest = [];

for (const source of SOURCES) {
  if (!fs.existsSync(source.src)) {
    console.warn(`  ! missing source, skipped: ${source.src}`);
    continue;
  }

  const meta = await sharp(source.src).metadata();
  const { width: sw, height: sh } = meta;

  // ---------------------------------------------------------------- landscape
  // Native width, never enlarged. The source is the ceiling.
  const wideDest = path.join(OUT, `${source.key}-wide.webp`);
  const wide = await sharp(source.src)
    .rotate()
    .resize({ width: Math.min(TARGET_WIDE_WIDTH, sw), withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(wideDest);

  // ----------------------------------------------------------------- portrait
  // Crop to 3:4 keeping FULL height — that is the whole point. Height is what
  // carries the sunset sky at the top and the marina at the bottom; only
  // peripheral city is lost off the sides.
  const cropW = Math.min(sw, Math.round(sh * PORTRAIT_RATIO));
  const cropH = Math.min(sh, Math.round(cropW / PORTRAIT_RATIO));
  // Centre on the focal point, then clamp so the window stays inside the frame.
  const left = Math.max(0, Math.min(sw - cropW, Math.round(source.focalX * sw - cropW / 2)));
  const top = Math.max(0, Math.min(sh - cropH, Math.round((sh - cropH) / 2)));

  const portraitDest = path.join(OUT, `${source.key}-portrait.webp`);
  const portrait = await sharp(source.src)
    .rotate()
    .extract({ left, top, width: cropW, height: cropH })
    .resize({ width: Math.min(TARGET_PORTRAIT_WIDTH, cropW), withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(portraitDest);

  for (const [label, info, target] of [
    ['wide', wide, TARGET_WIDE_WIDTH],
    ['portrait', portrait, TARGET_PORTRAIT_WIDTH],
  ]) {
    if (info.width < target) {
      shortfalls.push({
        file: `${source.key}-${label}.webp`,
        got: info.width,
        want: target,
        ratio: (target / info.width).toFixed(2),
      });
    }
  }

  manifest.push({
    key: source.key,
    note: source.note,
    source: { path: source.src, width: sw, height: sh },
    wide: { path: `/hero/${source.key}-wide.webp`, width: wide.width, height: wide.height, bytes: wide.size },
    portrait: {
      path: `/hero/${source.key}-portrait.webp`,
      width: portrait.width,
      height: portrait.height,
      bytes: portrait.size,
      crop: { left, top, width: cropW, height: cropH },
    },
  });

  const kb = (b) => `${(b / 1024).toFixed(0)} KB`;
  console.log(`\n  ${source.key}`);
  console.log(`    source    ${sw}×${sh}`);
  console.log(`    wide      ${wide.width}×${wide.height}  ${kb(wide.size)}`);
  console.log(`    portrait  ${portrait.width}×${portrait.height}  ${kb(portrait.size)}  (crop x${left} w${cropW})`);
}

// -------------------------------------------------------------------- bands
for (const band of BANDS) {
  if (!fs.existsSync(band.src)) {
    console.warn(`  ! missing band source, skipped: ${band.src}`);
    continue;
  }

  const meta = await sharp(band.src).metadata();
  const cropW = meta.width;
  const cropH = Math.min(meta.height, Math.round(cropW / band.ratio));
  const top = Math.max(0, Math.min(meta.height - cropH, Math.round(band.top * meta.height)));

  const dest = path.join(OUT, `${band.key}-wide.webp`);
  const info = await sharp(band.src)
    .rotate()
    .extract({ left: 0, top, width: cropW, height: cropH })
    .resize({ width: Math.min(TARGET_WIDE_WIDTH, cropW), withoutEnlargement: true })
    .webp({ quality: QUALITY, effort: 6 })
    .toFile(dest);

  if (info.width < TARGET_PORTRAIT_WIDTH) {
    shortfalls.push({
      file: `${band.key}-wide.webp`,
      got: info.width,
      want: TARGET_PORTRAIT_WIDTH,
      ratio: (TARGET_PORTRAIT_WIDTH / info.width).toFixed(2),
    });
  }

  manifest.push({
    key: band.key,
    note: band.note,
    source: { path: band.src, width: meta.width, height: meta.height },
    wide: { path: `/hero/${band.key}-wide.webp`, width: info.width, height: info.height, bytes: info.size },
  });

  console.log(`\n  ${band.key}`);
  console.log(`    source    ${meta.width}×${meta.height}`);
  console.log(`    band      ${info.width}×${info.height}  ${(info.size / 1024).toFixed(0)} KB`);
}

fs.writeFileSync(path.join(ROOT, 'data/hero-manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`);

if (shortfalls.length) {
  console.log('\n  ⚠ SHORTFALL — these outputs are below the resolution a hero wants.');
  console.log('    Nothing was upscaled; upscaling would only add bytes, not detail.');
  console.log('    A higher-resolution original is needed before launch.\n');
  for (const s of shortfalls) {
    console.log(`      ${s.file.padEnd(32)} ${s.got}px, want ${s.want}px  (${s.ratio}× short)`);
  }
  console.log('');
} else {
  console.log('\n  ✓ every hero output meets its target width\n');
}
