/**
 * Curated picks from the crawled photography, plus the hero imagery.
 *
 * PROVENANCE — read before changing anything here.
 *
 * The café's strongest asset is the 30th-floor view of the Katara Towers and Lusail
 * Marina, and a handful of their own product shots were taken on the terrace with that
 * view behind the glass. Those terrace shots are the café's own.
 *
 * Two things are NOT the café's own, and must not be described as such:
 *
 *   1. `/hero/katara-sunset-*` is an aerial PRESS PHOTOGRAPH of the towers from outside
 *      the building, supplied by the client. Its licence is UNCONFIRMED — confirm before
 *      this goes in front of the owner or onto a public domain. The terrace shot
 *      (`/hero/terrace-signature-*`) is kept as the switchable alternative precisely
 *      because it is the café's own and is the actual "Lusail's Best View" claim.
 *
 *   2. Six of the crawled product images are AI-generated stock, not photographs of the
 *      café's food — see AI_GENERATED_IMAGES below.
 *
 * Everything else here was identified by inspecting all 56 crawled photos.
 */

/**
 * Hero art direction.
 *
 * A 4:3 landscape inside a full-height section on a 9:19.5 phone keeps only the middle
 * ~42% of the frame, which discards the sunset sky and the marina — the two things that
 * make the picture work. `object-position` cannot recover pixels that were cropped, so
 * the page serves a purpose-made portrait crop below `sm` and the landscape above,
 * via <picture> + media queries. Both are produced by data/optimize-hero.mjs.
 *
 * ⚠ The supplied source is only 1200×900, so neither variant reaches the resolution a
 * full-bleed hero wants (2.4× short at 1440px 2×). A higher-resolution original is
 * needed before launch; nothing here is upscaled, because upscaling adds bytes and no
 * detail. Run `node data/optimize-hero.mjs` to see the shortfall report.
 */
export const HERO = {
  wide: '/hero/katara-sunset-wide.webp',
  portrait: '/hero/katara-sunset-portrait.webp',
  /** Intrinsic size of the `wide` variant, for next/image and CLS. */
  width: 1200,
  height: 900,
  /** Below this, the portrait crop is served instead. Matches Tailwind's `sm`. */
  portraitMaxWidth: 640,
} as const;

/** The café's own terrace shot — the alternative the owner can switch back to. */
export const HERO_ALTERNATIVE = {
  wide: '/hero/terrace-signature-wide.webp',
  portrait: '/hero/terrace-signature-portrait.webp',
  width: 896,
  height: 1195,
} as const;

/** Kept for the JSON-LD `image` field and anywhere a single hero URL is wanted. */
export const HERO_IMAGE = HERO.wide;

/**
 * The View section.
 *
 * It previously showed four drink photographs in a 2×2 grid whose aspect ratios
 * alternated, so nothing lined up. Worse, the four were near-identical: the same
 * railing, the same marble table, the same towers, the same daylight — only the drink
 * changed. A section titled "Lusail's best view" was showing four pictures of cocktails.
 *
 * So it now leads with the view itself: a landscape band cropped out of the top half of
 * the café's own terrace photograph, where the towers, the Gulf and the marina are.
 * Beneath it sits a uniform strip of squares — ONE aspect ratio per group is the entire
 * alignment fix — chosen to be visually distinct from each other rather than four
 * variations on one frame.
 */
export const VIEW_HERO = {
  src: '/hero/terrace-view-wide.webp',
  width: 1086,
  height: 611,
  labelEn: 'The Katara Towers and Lusail Marina, seen from the 212 Café terrace',
  labelAr: 'أبراج كتارا ومارينا لوسيل من تراس ٢١٢ كافيه',
} as const;

export const VIEW_IMAGES = [
  { src: '/menu/0210-passion-wave.webp', label: 'Passion Wave', labelAr: 'باشون ويف' },
  { src: '/menu/0135-limited-colada.webp', label: 'Limited Colada', labelAr: 'ليمتد كولادا' },
  { src: '/menu/0034-the-3-layers.webp', label: 'the 3 Layers', labelAr: 'الطبقات الثلاث' },
] as const;

/**
 * Six crawled images are AI-generated stock, not photographs of the café's food.
 *
 * Evidence: all six share an identical 1408×768 source frame — a generation aspect
 * ratio, not a camera one — and the same visual grammar (rustic wood table, shallow
 * depth of field, a European café interior that is nothing like a 30th-floor room with
 * floor-to-ceiling marina glass). `0052-the-french-toast` carries a visible Google
 * Gemini sparkle watermark in the bottom-right corner; `0066-eggs-benedict` contains a
 * mug with a garbled "212 café" rendered onto it.
 *
 * Only the French Toast frame carries a *visible* watermark — the other five are
 * identified by frame size and origin. Stated that way in data/FINDINGS.md too; the
 * distinction matters when this is repeated to the owner.
 *
 * Consequence: they are not eligible to be signature cards or category images. The
 * items still sell — only the photography is disqualified.
 */
export const AI_GENERATED_IMAGES = new Set<string>([
  '/menu/0052-the-french-toast.webp',
  '/menu/0066-eggs-benedict.webp',
  '/menu/0076-penne-pasta.webp',
  '/menu/0217-extra-milk.webp',
  '/menu/0218-extra-milk.webp',
  '/menu/0219-extras.webp',
]);

/**
 * Twelve of the 56 crawled photos are duplicates — one latte shot stands in for five
 * different drinks. Cards for these items are rendered text-forward instead of
 * photo-led, so the menu never shows the same picture five times in a column.
 * (Recorded in data/FINDINGS.md.)
 */
export const SHARED_PHOTO_ITEMS = new Set<string>([
  'Tiramisu Latte',
  'Cappucino',
  'Spanish Latte',
  'Flat White',
  'Chamomile Tea',
  'Green Tea',
  'Single Espresso',
  'Non-coffee Matcha',
  'Cheesy Roasted Beef Sandwich',
]);

/**
 * Whether an item's photograph is fit to show.
 *
 * Two independent disqualifications, and every photo-led surface must apply BOTH — the
 * menu page and the guest ordering app included, not just the homepage. That is where
 * the owner actually scrolls, so a watermarked frame surviving there defeats the point
 * of removing it from the shopfront.
 *
 *   - a duplicate, so one latte shot does not stand in for five different drinks
 *   - AI-generated stock, which is not a picture of their food at all
 *
 * Falling back to a text-forward card is deliberate: no photograph reads as considered,
 * while the wrong photograph reads as careless.
 */
export function hasUsablePhoto(item: { name_en: string; image_path: string | null }): boolean {
  if (!item.image_path) return false;
  if (SHARED_PHOTO_ITEMS.has(item.name_en)) return false;
  if (AI_GENERATED_IMAGES.has(item.image_path)) return false;
  return true;
}

export const MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=212+Cafe+Marina+Twin+Tower+A+Lusail+Qatar';

export const INSTAGRAM_URL = 'https://www.instagram.com/212cafe.qatar/';
