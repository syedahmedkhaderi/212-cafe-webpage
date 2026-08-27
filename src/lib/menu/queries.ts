import { getServerClient } from '@/lib/supabase/server';
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
 * The whole published menu in one round trip's worth of parallel queries.
 * RLS already filters unavailable items for the anon key, so nothing here needs
 * to re-check availability — but the flag is carried through for the admin views.
 */
export async function getMenu(): Promise<{
  categories: MenuCategory[];
  items: MenuItem[];
}> {
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

export async function getBusiness(): Promise<{
  settings: BusinessSettings | null;
  hours: BusinessHours[];
}> {
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
