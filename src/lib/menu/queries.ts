import { unstable_cache } from 'next/cache';
import { getServerClient } from '@/lib/supabase/server';
import { TAGS } from '@/lib/cache-tags';
import type {
  BusinessHours,
  BusinessSettings,
  MenuCategory,
  MenuItem,
  ModifierGroup,
} from '@/lib/types';

type RawOption = {
  id: string;
  group_id: string;
  name_en: string;
  name_ar: string;
  price_delta: string | number;
  is_default: boolean;
  sort_order: number;
};

type RawGroup = {
  id: string;
  name_en: string;
  name_ar: string;
  min_select: number;
  max_select: number;
  sort_order: number;
};

const num = (v: string | number | null | undefined) => Number(v ?? 0);

/**
 * How this layer is cached.
 *
 * Every page reads the locale cookie, so every page is dynamically RENDERED — but the
 * menu itself is identical for every visitor, and re-querying Supabase five times to
 * render five requests of the same unchanged menu is pure waste. Rendering and data
 * fetching are separate concerns: the pages stay dynamic, the data does not.
 *
 * Two rules this must not break:
 *
 *   1. **Nothing request-scoped inside a cached function.** `cookies()` and `headers()`
 *      are unsupported inside a cache scope, and would poison one visitor's cache entry
 *      with another's locale. Neither function below touches them — the locale is
 *      applied by the caller, at render time, to data that is already language-neutral
 *      (both `_en` and `_ar` columns are fetched, and the caller picks).
 *
 *   2. **Every write invalidates.** Admin mutations call `updateTag` in
 *      src/app/admin/actions.ts. Without that, a sold-out item would keep selling on
 *      the public menu until the revalidate window elapsed.
 *
 * `revalidate` is a backstop, not the mechanism: it bounds staleness if a change ever
 * reaches the database WITHOUT going through an action — a direct SQL edit, a future POS
 * integration writing straight to Postgres — so the site is wrong for a bounded time
 * rather than indefinitely.
 *
 * The menu's backstop is deliberately short. Availability is the most time-sensitive
 * field on the site (a sold-out item that keeps selling is a guest handed a refund), and
 * a minute of exposure to an out-of-band write is very different from an hour. It costs
 * at most 60 queries an hour instead of one per request. Business settings — hours,
 * phone, address — change rarely enough to keep the long window.
 *
 * Deliberately `unstable_cache` and not `use cache`: the latter requires the
 * `cacheComponents` flag, which turns every un-suspended dynamic read into a build
 * error — and this app reads cookies on every page. Revisit when the pages have
 * Suspense boundaries.
 */
const MENU_CACHE_SECONDS = 60;
const BUSINESS_CACHE_SECONDS = 3600;

/**
 * The whole published menu in one round trip's worth of parallel queries.
 * RLS already filters unavailable items for the anon key, so nothing here needs
 * to re-check availability — but the flag is carried through for the admin views.
 */
async function fetchMenu(): Promise<{
  categories: MenuCategory[];
  items: MenuItem[];
}> {
  // Printed only on a genuine cache miss, so "is this actually cached?" is answerable
  // from the server log instead of inferred from response times. tests/cache.test.mjs
  // counts these lines. Once an hour, or once per admin save — not noisy.
  console.log('[212] cache MISS: menu fetched from Supabase');
  const supabase = getServerClient();

  const [categories, items, groups, options, links] = await Promise.all([
    supabase
      .from('menu_categories')
      .select('id,name_en,name_ar,slug,sort_order,image_path')
      .order('sort_order'),
    supabase
      .from('menu_items')
      .select(
        'id,category_id,sku,name_en,name_ar,description_en,description_ar,price,image_path,is_available,is_signature,sort_order,copy_source',
      )
      .order('sort_order'),
    supabase
      .from('menu_item_modifier_groups')
      .select('id,name_en,name_ar,min_select,max_select,sort_order')
      .order('sort_order'),
    supabase
      .from('menu_item_modifier_options')
      .select('id,group_id,name_en,name_ar,price_delta,is_default,sort_order')
      .order('sort_order'),
    supabase.from('menu_item_modifier_links').select('item_id,group_id,sort_order'),
  ]);

  const optionsByGroup = new Map<string, RawOption[]>();
  for (const o of (options.data ?? []) as RawOption[]) {
    const list = optionsByGroup.get(o.group_id) ?? [];
    list.push(o);
    optionsByGroup.set(o.group_id, list);
  }

  const groupById = new Map<string, ModifierGroup>();
  for (const g of (groups.data ?? []) as RawGroup[]) {
    groupById.set(g.id, {
      ...g,
      options: (optionsByGroup.get(g.id) ?? []).map((o) => ({
        id: o.id,
        name_en: o.name_en,
        name_ar: o.name_ar,
        price_delta: num(o.price_delta),
        is_default: o.is_default,
        sort_order: o.sort_order,
      })),
    });
  }

  const groupsByItem = new Map<string, ModifierGroup[]>();
  for (const l of (links.data ?? []) as { item_id: string; group_id: string; sort_order: number }[]) {
    const group = groupById.get(l.group_id);
    if (!group) continue;
    const list = groupsByItem.get(l.item_id) ?? [];
    list.push(group);
    groupsByItem.set(l.item_id, list);
  }
  for (const list of groupsByItem.values()) list.sort((a, b) => a.sort_order - b.sort_order);

  // Postgres numeric arrives as a string over PostgREST; coerce once, here.
  type RawItem = Omit<MenuItem, 'modifier_groups' | 'price'> & { price: string | number };

  return {
    categories: (categories.data ?? []) as MenuCategory[],
    items: ((items.data ?? []) as RawItem[]).map((i) => ({
      ...i,
      price: num(i.price),
      modifier_groups: groupsByItem.get(i.id) ?? [],
    })),
  };
}

export const getMenu = unstable_cache(fetchMenu, ['menu'], {
  tags: [TAGS.menu],
  revalidate: MENU_CACHE_SECONDS,
});

async function fetchBusiness(): Promise<{
  settings: BusinessSettings | null;
  hours: BusinessHours[];
}> {
  console.log('[212] cache MISS: business settings fetched from Supabase');
  const supabase = getServerClient();
  const [settings, hours] = await Promise.all([
    supabase
      .from('business_settings')
      .select(
        'name_en,name_ar,tagline_en,tagline_ar,address_en,address_ar,phone,email,instagram,latitude,longitude,currency,accepting_orders',
      )
      .single(),
    supabase.from('business_hours').select('day_of_week,opens_at,closes_at,is_closed').order('day_of_week'),
  ]);

  return {
    settings: (settings.data as BusinessSettings) ?? null,
    hours: (hours.data ?? []) as BusinessHours[],
  };
}

export const getBusiness = unstable_cache(fetchBusiness, ['business'], {
  tags: [TAGS.business],
  revalidate: BUSINESS_CACHE_SECONDS,
});
