/**
 * Deriving readable variants of an owner-chosen brand colour.
 *
 * The palette has two brass variants beyond the base: a darker one for small text on the
 * light surface, and a lighter one for text on the dark surface. In the fixed palette
 * both were hand-tuned and measured — `#8a6836` is 5.03:1 on bone, where the base brass
 * is only 3.44:1 and fails WCAG AA for body-size text.
 *
 * Once the owner can change brass, those hand-tuned values cannot simply be kept, and
 * deriving them with a fixed `color-mix` ratio does not work either: the first attempt
 * produced 3.78:1 and dropped the menu page's accessibility score from 100 to 96.
 *
 * So the ratio is not guessed. Each variant is stepped towards black or white until it
 * actually MEETS the target against the surface it sits on. Whatever colour the owner
 * picks, small text stays legible — which is not something they should have to know to
 * check.
 */

const TARGET = 4.5; // WCAG AA for body-size text

type Rgb = { r: number; g: number; b: number };

function parseHex(hex: string): Rgb {
  const h = hex.replace('#', '');
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  };
}

const toHex = ({ r, g, b }: Rgb) =>
  `#${[r, g, b].map((v) => Math.round(Math.max(0, Math.min(255, v))).toString(16).padStart(2, '0')).join('')}`;

/** WCAG relative luminance. */
function luminance({ r, g, b }: Rgb): number {
  const channel = (v: number) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrastRatio(a: string, b: string): number {
  const [x, y] = [luminance(parseHex(a)), luminance(parseHex(b))];
  const [hi, lo] = x > y ? [x, y] : [y, x];
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Step `colour` towards black (or white) until it reaches `target` contrast on
 * `surface`. Returns the first shade that passes, or the extreme if none does.
 *
 * `minShift` exists because "just passes AA" is not always the design intent. The light
 * brass is meant to read as a brighter accent on the dark sections, and the base colour
 * already clears 4.5:1 there — so stopping at the first passing shade would return the
 * base colour unchanged and quietly flatten the accent. Starting the search partway
 * along keeps the designed lift and still guarantees the floor.
 */
function shift(
  colour: string,
  surface: string,
  towards: 'black' | 'white',
  target: number,
  minShift = 0,
): string {
  const base = parseHex(colour);
  const end = towards === 'black' ? { r: 0, g: 0, b: 0 } : { r: 255, g: 255, b: 255 };

  for (let step = minShift; step <= 100; step += 2) {
    const t = step / 100;
    const candidate = toHex({
      r: base.r + (end.r - base.r) * t,
      g: base.g + (end.g - base.g) * t,
      b: base.b + (end.b - base.b) * t,
    });
    if (contrastRatio(candidate, surface) >= target) return candidate;
  }
  return toHex(end);
}

/**
 * The two derived brass variants.
 *
 * `ink` is for small brass text on the light surface; `lit` for brass text on the dark
 * one. Both are guaranteed to meet AA against the surface they are used on.
 */
export function brassVariants(brass: string, bone: string, ink: string) {
  return {
    brassInk: shift(brass, bone, 'black', TARGET),
    // 26% towards white reproduces the designed lift of the fixed palette
    // (#a8834b → #c9a267) before the contrast floor is applied on top.
    brassLit: shift(brass, ink, 'white', TARGET, 26),
  };
}
