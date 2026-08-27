'use client';

import { createContext, useContext, useMemo } from 'react';
import { translator, type CopyKey } from '@/lib/i18n';
import type { Locale } from '@/lib/types';

/**
 * Editable copy, for client components.
 *
 * Server components call `contentReader(rows, locale)` directly. Client components
 * cannot — they have no database access — so the values are resolved once in the root
 * layout and handed down.
 *
 * What crosses that boundary is deliberately minimal: a flat map of only the strings
 * that DIFFER from the compiled dictionary, in the active language only. The first
 * version passed the raw `site_content` rows, which put all 46 keys — both languages,
 * plus `group_name` and `sort_order` — into the RSC payload of every page. That is the
 * admin's data model shipped to every visitor, on the same critical path the hero was
 * just optimised for. On an unedited site this map is now empty and costs nothing;
 * after the owner changes a headline it holds one entry.
 *
 * With no provider above it this falls back to the compiled dictionary rather than
 * throwing, so a component rendered outside the marketing tree still gets its words.
 */
const CopyContext = createContext<Record<string, string> | null>(null);

export function CopyProvider({
  overrides,
  children,
}: {
  overrides: Record<string, string>;
  children: React.ReactNode;
}) {
  return <CopyContext.Provider value={overrides}>{children}</CopyContext.Provider>;
}

export function useCopy(locale: Locale): (key: CopyKey) => string {
  const overrides = useContext(CopyContext);
  return useMemo(() => {
    const compiled = translator(locale);
    if (!overrides) return compiled;
    return (key: CopyKey) => overrides[key as string] ?? compiled(key);
  }, [overrides, locale]);
}
