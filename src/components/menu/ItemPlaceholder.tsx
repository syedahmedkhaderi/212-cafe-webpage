import type { CSSProperties } from 'react';

/**
 * What stands in for a photograph that is not fit to show.
 *
 * Twelve of the café's 53 items have no usable picture, and not because the file is
 * missing — every item has an `image_path`. They are disqualified by hasUsablePhoto()
 * for two documented reasons: nine are duplicates (one latte shot standing in for five
 * different drinks) and three are AI-generated stock rather than photographs of their
 * food. See src/lib/site.ts and data/FINDINGS.md.
 *
 * ⚠ Do NOT "fix" these by sourcing replacement imagery. There is no legitimate source
 * of photographs of THIS café's food beyond the 56 already crawled, and filling the
 * gaps with stock or generated pictures recreates exactly the defect this project
 * exists to point out — one of the supplied images shipped with a visible Gemini
 * watermark on it. Twelve photographs are on the owner's list in the README.
 *
 * So: something drawn, on-brand, and honest about being a placeholder. It is inline
 * SVG, which means it costs no request and no bytes over the markup, and it is built
 * from the brass token and --card, so the one component works on the light menu page
 * and inside the dark ordering sheets without a second variant.
 */

type Glyph = 'cup' | 'glass' | 'cake' | 'sandwich' | 'leaf' | 'egg' | 'monogram';

/**
 * Chosen by category, not per item. Eight of the twelve gaps fall in Hot Beverage, and
 * eight identical stamps down one column reads as a broken image; eight cups that
 * belong to the section they sit in reads as a decision.
 */
const GLYPH_BY_CATEGORY: Record<string, Glyph> = {
  'hot-beverage': 'cup',
  'cold-beverage': 'glass',
  'sweets-pastry': 'cake',
  savoury: 'sandwich',
  salads: 'leaf',
  brunch: 'egg',
};

const PATHS: Record<Exclude<Glyph, 'monogram'>, string[]> = {
  cup: [
    'M5 9.5h11v4.5a5.5 5.5 0 0 1-11 0z',
    'M16 11h1.4a2.4 2.4 0 0 1 0 4.8H16',
    'M3.5 21h14',
    'M8.6 6.6c0-1.2 1-1.6 1-2.8',
    'M12.2 6.6c0-1.2 1-1.6 1-2.8',
  ],
  glass: [
    'M7 4.5h10l-1.2 14.4a1 1 0 0 1-1 .9H9.2a1 1 0 0 1-1-.9z',
    'M7.7 10.5h8.6',
    'M14.6 3.2 12.2 11',
  ],
  cake: [
    'M6 11.5h12l-1.4 8.2H7.4z',
    'M6 11.5a6 6 0 0 1 12 0',
    'M12 5.6V4.4',
    'M12 3.2a1.1 1.1 0 1 1 0 .1z',
  ],
  sandwich: [
    'M4 10.4c0-2.2 3.6-4 8-4s8 1.8 8 4z',
    'M4.8 12.9h14.4',
    'M4.8 15.4h14.4',
    'M4 17.6h16v.6a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z',
  ],
  leaf: [
    'M3.4 12.4h17.2a8.6 8.6 0 0 1-17.2 0z',
    'M12 12.4c0-3.2 2.1-5.3 5.3-5.8.5 3.7-1.7 5.8-5.3 5.8z',
    'M12 12.4c-2.6 0-4.7-1.6-4.7-4.2 2.6.2 4.7 1.9 4.7 4.2z',
  ],
  egg: [
    'M3.4 12.6H16a6.3 6.3 0 0 1-12.6 0z',
    'M16 12.6h4.6',
    'M9.7 13.4a1.9 1.9 0 1 1 0 .1z',
    'M8 8c0-1.2 1-1.6 1-2.8',
    'M11.6 8c0-1.2 1-1.6 1-2.8',
  ],
};

export function ItemPlaceholder({
  categorySlug,
  className = '',
  rounded = 'rounded-sm',
}: {
  /** Picks the glyph. An unknown slug falls back to the 212 monogram. */
  categorySlug?: string | null;
  /** Sizing comes from the caller so the placeholder occupies exactly the footprint
   *  the photograph would have — nothing reflows when one is swapped for the other. */
  className?: string;
  rounded?: string;
}) {
  const glyph: Glyph = (categorySlug && GLYPH_BY_CATEGORY[categorySlug]) || 'monogram';

  // Brass at low saturation over the surface colour, so this sits a shade off the card
  // it lives on rather than punching a hole in it — in either theme. Both stops resolve
  // against --card, which flips with data-surface="dark".
  const style: CSSProperties = {
    background: `linear-gradient(150deg,
      color-mix(in oklab, var(--color-brass) 22%, var(--card)),
      color-mix(in oklab, var(--color-brass) 8%, var(--card)))`,
    color: 'color-mix(in oklab, var(--color-brass) 78%, transparent)',
    boxShadow: 'inset 0 0 0 1px color-mix(in oklab, var(--color-brass) 18%, transparent)',
  };

  return (
    <div
      aria-hidden
      style={style}
      className={`grid place-items-center overflow-hidden ${rounded} ${className}`}
    >
      {glyph === 'monogram' ? (
        <span className="display select-none text-[1.6em] leading-none opacity-80">212</span>
      ) : (
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={1.2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="h-[46%] w-[46%]"
        >
          {PATHS[glyph].map((d) => (
            <path key={d} d={d} />
          ))}
        </svg>
      )}
    </div>
  );
}
