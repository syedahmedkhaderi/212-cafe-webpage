import type { Locale } from '@/lib/types';

export type TableKind = 'table' | 'walk_in';

/**
 * The "where is this order going" line, in one place.
 *
 * Three surfaces show it — the cart sheet, the tracker and the ordering header — and
 * before walk-in ordering existed all three hard-coded `Table {label}`. That reads
 * "Table Online" for a guest who never scanned anything, which is both wrong and the
 * kind of detail an owner notices immediately during a pitch.
 *
 * Defaults to the table wording when `kind` is absent, so /order/[tableToken] — which
 * only ever serves scanned tables — needs no change.
 */
export function seatLabel(kind: TableKind | undefined, label: string, locale: Locale): string {
  if (kind === 'walk_in') return locale === 'ar' ? 'طلب أونلاين' : 'Online order';
  return locale === 'ar' ? `طاولة ${label}` : `Table ${label}`;
}
