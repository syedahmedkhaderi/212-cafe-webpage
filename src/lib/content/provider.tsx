'use client';

import { createContext, useContext, useMemo } from 'react';
import { contentReader, type SiteContentRow } from './queries';
import { translator } from '@/lib/i18n';
import type { CopyKey } from '@/lib/i18n';
import type { Locale } from '@/lib/types';

/**
 * Editable copy, for client components.
 *
 * Server components call `contentReader(rows, locale)` directly. Client components
 * cannot — they have no access to the database — so the rows are fetched once in the
 * root layout and handed down through this provider.
 *
 * The reader it returns has the same shape as `translator(locale)`, so a component
 * switches from compiled copy to editable copy by changing one line and nothing else.
 *
 * With no provider above it, this falls back to the compiled dictionary rather than
 * throwing: a component rendered outside the marketing tree still gets its words.
 */
const CopyContext = createContext<{ rows: SiteContentRow[]; locale: Locale } | null>(null);

export function CopyProvider({
  rows,
  locale,
  children,
}: {
  rows: SiteContentRow[];
  locale: Locale;
  children: React.ReactNode;
}) {
  const value = useMemo(() => ({ rows, locale }), [rows, locale]);
  return <CopyContext.Provider value={value}>{children}</CopyContext.Provider>;
}

export function useCopy(locale: Locale): (key: CopyKey) => string {
  const ctx = useContext(CopyContext);
  return useMemo(() => {
    if (!ctx) return translator(locale);
    return contentReader(ctx.rows, locale);
  }, [ctx, locale]);
}
