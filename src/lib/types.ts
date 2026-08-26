export type Locale = 'en' | 'ar';

export type OrderStatus = 'received' | 'preparing' | 'ready' | 'served' | 'cancelled';

export const ORDER_FLOW: readonly OrderStatus[] = ['received', 'preparing', 'ready', 'served'];

export type MenuCategory = {
  id: string;
  name_en: string;
  name_ar: string;
  slug: string;
  sort_order: number;
};

export type ModifierOption = {
  id: string;
  name_en: string;
  name_ar: string;
  price_delta: number;
  is_default: boolean;
  sort_order: number;
};

export type ModifierGroup = {
  id: string;
  name_en: string;
  name_ar: string;
  min_select: number;
  max_select: number;
  sort_order: number;
  options: ModifierOption[];
};

export type MenuItem = {
  id: string;
  category_id: string;
  sku: string | null;
  name_en: string;
  name_ar: string;
  description_en: string;
  description_ar: string;
  price: number;
  image_path: string | null;
  is_available: boolean;
  is_signature: boolean;
  sort_order: number;
  modifier_groups: ModifierGroup[];
};

export type BusinessSettings = {
  name_en: string;
  name_ar: string;
  tagline_en: string;
  tagline_ar: string;
  address_en: string;
  address_ar: string;
  phone: string;
  email: string;
  instagram: string;
  latitude: number | null;
  longitude: number | null;
  currency: string;
  accepting_orders: boolean;
};

export type BusinessHours = {
  day_of_week: number;
  opens_at: string | null;
  closes_at: string | null;
  is_closed: boolean;
};

/** A line in the guest's cart. Prices here are for DISPLAY ONLY — the server
 *  recomputes every amount from the menu table when the order is placed. */
export type CartLine = {
  /** stable key for this configuration of item + options */
  key: string;
  menu_item_id: string;
  name_en: string;
  name_ar: string;
  image_path: string | null;
  unit_price: number;
  quantity: number;
  option_ids: string[];
  option_labels_en: string[];
  option_labels_ar: string[];
  options_total: number;
  notes?: string;
};

export type PlacedOrder = {
  order_number: string;
  session_token: string;
  total: number;
  status: OrderStatus;
  replayed: boolean;
};

export type OrderStatusView = {
  order_number: string;
  status: OrderStatus;
  table_label: string;
  total: number;
  placed_at: string;
  items: {
    name_en: string;
    name_ar: string;
    quantity: number;
    line_total: number;
    modifiers: { name_en: string; name_ar: string }[];
  }[];
  history: { status: OrderStatus; at: string }[];
};

/** Pick the field matching the active locale, falling back to English when a
 *  translation is missing — 22 of the café's items have no Arabic description. */
export function localised<T extends Record<string, unknown>>(
  row: T,
  base: string,
  locale: Locale,
): string {
  const value = locale === 'ar' ? row[`${base}_ar`] : row[`${base}_en`];
  if (typeof value === 'string' && value.trim()) return value;
  const fallback = row[`${base}_en`];
  return typeof fallback === 'string' ? fallback : '';
}
