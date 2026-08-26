import type { CartLine, MenuItem, ModifierOption } from '@/lib/types';

/**
 * Cart maths is DISPLAY ONLY. `place_order` recomputes every amount from the menu
 * table, so a bug here (or a tampered client) can never change what the guest is
 * actually charged. See docs/DECISIONS.md.
 */

/** Two identical drinks with the same options collapse into one line. */
export function lineKey(menuItemId: string, optionIds: string[], notes?: string): string {
  return [menuItemId, [...optionIds].sort().join(','), notes?.trim() ?? ''].join('|');
}

export function buildLine(
  item: MenuItem,
  selected: ModifierOption[],
  quantity: number,
  notes?: string,
): CartLine {
  const optionIds = selected.map((o) => o.id);
  return {
    key: lineKey(item.id, optionIds, notes),
    menu_item_id: item.id,
    name_en: item.name_en,
    name_ar: item.name_ar,
    image_path: item.image_path,
    unit_price: item.price,
    quantity,
    option_ids: optionIds,
    option_labels_en: selected.map((o) => o.name_en),
    option_labels_ar: selected.map((o) => o.name_ar || o.name_en),
    options_total: selected.reduce((sum, o) => sum + o.price_delta, 0),
    notes: notes?.trim() || undefined,
  };
}

export function addLine(cart: CartLine[], line: CartLine): CartLine[] {
  const existing = cart.findIndex((l) => l.key === line.key);
  if (existing === -1) return [...cart, line];
  return cart.map((l, i) =>
    i === existing ? { ...l, quantity: Math.min(50, l.quantity + line.quantity) } : l,
  );
}

export function setQuantity(cart: CartLine[], key: string, quantity: number): CartLine[] {
  if (quantity <= 0) return cart.filter((l) => l.key !== key);
  return cart.map((l) => (l.key === key ? { ...l, quantity: Math.min(50, quantity) } : l));
}

export const lineTotal = (l: CartLine) => (l.unit_price + l.options_total) * l.quantity;

export const cartSubtotal = (cart: CartLine[]) => cart.reduce((s, l) => s + lineTotal(l), 0);

export const cartCount = (cart: CartLine[]) => cart.reduce((s, l) => s + l.quantity, 0);

/** Defaults that satisfy each group's min_select, so a drink is orderable in one tap. */
export function defaultSelection(item: MenuItem): ModifierOption[] {
  const picked: ModifierOption[] = [];
  for (const group of item.modifier_groups) {
    if (group.min_select < 1) continue;
    const preferred = group.options.find((o) => o.is_default) ?? group.options[0];
    if (preferred) picked.push(preferred);
  }
  return picked;
}

/** Mirrors the server's rule check so the UI can disable "Add" with a reason. */
export function validateSelection(
  item: MenuItem,
  selectedIds: Set<string>,
): { ok: true } | { ok: false; message: string } {
  for (const group of item.modifier_groups) {
    const chosen = group.options.filter((o) => selectedIds.has(o.id)).length;
    if (chosen < group.min_select) {
      return { ok: false, message: `Choose ${group.name_en.toLowerCase()}` };
    }
    if (chosen > group.max_select) {
      return {
        ok: false,
        message: `Pick at most ${group.max_select} from ${group.name_en.toLowerCase()}`,
      };
    }
  }
  return { ok: true };
}
