'use client';

import { LOCALE_COOKIE } from '@/lib/i18n';
import type { Locale } from '@/lib/types';

const ONE_YEAR = 60 * 60 * 24 * 365;

/**
 * Writes the visitor's language choice where the server can read it.
 *
 * The cookie is the single source of truth for every surface — marketing site, menu,
 * and the table-ordering app — so a guest who picks العربية on the homepage stays in
 * Arabic after scanning a table QR, and vice versa.
 */
export function persistLocale(locale: Locale) {
  document.cookie = `${LOCALE_COOKIE}=${locale}; path=/; max-age=${ONE_YEAR}; samesite=lax`;
}

export function readLocaleCookie(): Locale | null {
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${LOCALE_COOKIE}=(ar|en)`));
  return (match?.[1] as Locale) ?? null;
}
