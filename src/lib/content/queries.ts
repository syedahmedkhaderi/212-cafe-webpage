import { unstable_cache } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { TAGS } from '@/lib/cache-tags';
import COPY from '@/lib/copy.json';
import type { CopyKey } from '@/lib/i18n';
import type { Locale } from '@/lib/types';

export type SiteContentRow = {
  key: string;
  value_en: string;
  value_ar: string;
  kind: 'text' | 'richtext' | 'image' | 'color' | 'number' | 'boolean';
  group_name: string;
  sort_order: number;
};

export type SiteTheme = {
  brand_ink: string;
  brand_bone: string;
  brand_brass: string;
  display_font: string;
  body_font: string;
  hero_image_path: string;
  hero_portrait_path: string;
  hero_focal_x: number;
  hero_focal_y: number;
  hero_zoom: number;
  corner_radius: 'none' | 'sm' | 'md' | 'lg';
};

/**
 * Defaults that exactly match the migration's column defaults. Used when the theme row
 * cannot be read at all, so a database hiccup degrades to the designed look rather than
 * to an unstyled page.
 */
export const DEFAULT_THEME: SiteTheme = {
  brand_ink: '#14110f',
  brand_bone: '#f6f1e7',
  brand_brass: '#b08d4f',
  display_font: 'Cormorant Garamond',
  body_font: 'Inter',
  hero_image_path: '/hero/katara-sunset-wide.webp',
  hero_portrait_path: '/hero/katara-sunset-portrait.webp',
  hero_focal_x: 50,
  hero_focal_y: 50,
  hero_zoom: 1,
  corner_radius: 'sm',
};

async function fetchContent(): Promise<SiteContentRow[]> {
  console.log('[212] cache MISS: site content fetched from Supabase');
  const supabase = getServerClient();
  const { data } = await supabase
    .from('site_content')
    .select('key,value_en,value_ar,kind,group_name,sort_order')
    .order('sort_order');
  return (data ?? []) as SiteContentRow[];
}

export const getContentRows = unstable_cache(fetchContent, ['content'], {
  tags: [TAGS.content],
  revalidate: 300,
});

async function fetchTheme(): Promise<SiteTheme> {
  console.log('[212] cache MISS: theme fetched from Supabase');
  const supabase = getServerClient();
  const { data } = await supabase
    .from('site_theme')
    .select(
      'brand_ink,brand_bone,brand_brass,display_font,body_font,hero_image_path,hero_portrait_path,hero_focal_x,hero_focal_y,hero_zoom,corner_radius',
    )
    .eq('id', 1)
    .maybeSingle();

  if (!data) return DEFAULT_THEME;
  return { ...DEFAULT_THEME, ...data, hero_zoom: Number(data.hero_zoom ?? 1) };
}

export const getTheme = unstable_cache(fetchTheme, ['theme'], {
  tags: [TAGS.theme],
  revalidate: 300,
});

/**
 * A copy lookup bound to the visitor's language.
 *
 * Falls back to the compiled dictionary whenever the database has no row for a key, or
 * has one with an empty value for this language. That is what makes the CMS safe to
 * deploy: a missing row, a failed query or a half-translated key renders the designed
 * default instead of a blank space where a headline should be.
 *
 * ⚠ The fallback is also a trap, and the reason tests/cms.test.mjs asserts the anon
 * SELECT policy directly with the anon key rather than by looking at a rendered page. If
 * that policy were missing, every lookup would fall through to the dictionary and the
 * site would look completely normal — while nothing the owner typed had any effect.
 *
 * Rows are passed in rather than fetched here so this stays synchronous and so a page
 * makes exactly one content query per render, not one per string.
 */
export function contentReader(rows: SiteContentRow[], locale: Locale) {
  const byKey = new Map(rows.map((r) => [r.key, r]));

  return (key: CopyKey): string => {
    const row = byKey.get(key as string);
    const value = locale === 'ar' ? row?.value_ar : row?.value_en;
    if (value && value.trim()) return value;

    const compiled = (COPY as Record<string, { en: string; ar: string }>)[key as string];
    return compiled ? compiled[locale] : '';
  };
}
