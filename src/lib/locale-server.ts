import { cookies, headers } from 'next/headers';
import { DEFAULT_LOCALE, LOCALE_COOKIE, normaliseLocale } from '@/lib/i18n';
import type { Locale } from '@/lib/types';

/**
 * The visitor's locale, server-side.
 *
 * Order of preference:
 *   1. The cookie they set by using the switcher — an explicit choice always wins.
 *   2. Accept-Language, so an Arabic-speaking visitor from Qatar lands on Arabic
 *      without having to find a toggle first.
 *   3. English.
 *
 * Reading cookies opts the page out of static rendering, which is why /menu is
 * force-dynamic and the homepage revalidates rather than prerendering.
 */
export async function getLocale(): Promise<Locale> {
  const store = await cookies();
  const chosen = store.get(LOCALE_COOKIE)?.value;
  if (chosen) return normaliseLocale(chosen);

  const accept = (await headers()).get('accept-language') ?? '';
  // Match `ar`, `ar-QA`, … but not a language merely containing those letters.
  if (/(^|,)\s*ar\b/i.test(accept)) return 'ar';

  return DEFAULT_LOCALE;
}

/** True when the visitor has never made an explicit choice — used to offer the picker. */
export async function hasChosenLocale(): Promise<boolean> {
  const store = await cookies();
  return Boolean(store.get(LOCALE_COOKIE)?.value);
}
