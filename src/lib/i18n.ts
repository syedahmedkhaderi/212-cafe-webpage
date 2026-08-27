import COPY_JSON from './copy.json';
import type { Locale } from '@/lib/types';

export const LOCALES: Locale[] = ['en', 'ar'];
export const LOCALE_COOKIE = '212_locale';
export const DEFAULT_LOCALE: Locale = 'en';

export const isRTL = (locale: Locale) => locale === 'ar';

export function normaliseLocale(value: string | undefined | null): Locale {
  return value === 'ar' ? 'ar' : 'en';
}

/**
 * Marketing copy — the chrome around the menu.
 *
 * The dictionary itself lives in copy.json rather than inline here, because two things
 * need to read it: this module, and data/generate-content-seed.mjs, which seeds the
 * editable `site_content` table from it. One source, so the compiled fallback and the
 * database can never disagree about what the default copy is.
 *
 * Item names, descriptions and category names are NOT here — those come from the
 * database, where all 53 items already carry an Arabic name.
 */
const COPY: Record<string, { en: string; ar: string }> = COPY_JSON;

export type CopyKey = keyof typeof COPY_JSON;

export function t(key: CopyKey, locale: Locale): string {
  return COPY[key as string][locale];
}

/** Bound translator, so components read `tr('heroSub')` rather than repeating the locale. */
export function translator(locale: Locale) {
  return (key: CopyKey) => t(key, locale);
}
