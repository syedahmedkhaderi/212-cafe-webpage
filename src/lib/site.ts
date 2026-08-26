/**
 * Curated picks from the crawled photography.
 *
 * The café's strongest asset is the 30th-floor view of the Katara Towers and Lusail
 * Marina, and a handful of their own product shots were taken on the terrace with that
 * view behind the glass. Those are the hero images — nothing here is stock, and nothing
 * is invented. Identified by inspecting all 56 crawled photos.
 */

export const HERO_IMAGE = '/menu/0016-212-signature.webp';

/** Terrace shots where the skyline is clearly visible behind the drink. */
export const VIEW_IMAGES = [
  { src: '/menu/0208-hiby-splash.webp', label: 'Hiby Splash' },
  { src: '/menu/0210-passion-wave.webp', label: 'Passion Wave' },
  { src: '/menu/0211-sunrise.webp', label: 'Sunrise' },
  { src: '/menu/0209-mango-red-horizon.webp', label: 'Mango Red Horizon' },
] as const;

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

export const MAPS_URL =
  'https://www.google.com/maps/search/?api=1&query=212+Cafe+Marina+Twin+Tower+A+Lusail+Qatar';

export const INSTAGRAM_URL = 'https://www.instagram.com/212cafe.qatar/';
