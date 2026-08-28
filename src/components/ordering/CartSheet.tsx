'use client';

import type { CartLine, Locale } from '@/lib/types';
import { money } from '@/lib/format';
import { cartSubtotal, lineTotal } from '@/lib/order/cart';
import { useBodyScrollLock } from './useBodyScrollLock';
import { seatLabel, type TableKind } from '@/lib/order/seat-label';

/**
 * Review the cart and send it.
 *
 * Extracted from OrderApp so /menu submits through the same sheet. Amounts here are
 * DISPLAY ONLY — place_order recomputes every one of them from the menu table.
 */
export function CartSheet({
  cart,
  locale,
  tableLabel,
  tableKind,
  placing,
  error,
  customerName,
  onCustomerName,
  onClose,
  onQuantity,
  onSubmit,
}: {
  cart: CartLine[];
  locale: Locale;
  tableLabel: string;
  tableKind?: TableKind;
  placing: boolean;
  error: string | null;
  customerName: string;
  onCustomerName: (value: string) => void;
  onClose: () => void;
  onQuantity: (key: string, q: number) => void;
  onSubmit: () => void;
}) {
  const rtl = locale === 'ar';
  const t = (en: string, ar: string) => (rtl ? ar : en);

  useBodyScrollLock(true);

  return (
    <div
      data-surface="dark"
      className="fixed inset-0 z-50 flex items-end justify-center text-[var(--fg)]"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <button type="button" aria-label={t('Close', 'إغلاق')} onClick={onClose} className="absolute inset-0 bg-black/65" />
      <div className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-[var(--card)] p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        <div className="flex items-center justify-between">
          <h2 className="display text-2xl">{t('Your order', 'طلبك')}</h2>
          <span className="text-[0.78rem] text-[var(--muted)]">
            {seatLabel(tableKind, tableLabel, locale)}
          </span>
        </div>

        <ul className="mt-5 divide-y divide-[var(--line)]">
          {cart.map((l) => (
            <li key={l.key} className="py-4">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[0.92rem] font-medium">{rtl ? l.name_ar || l.name_en : l.name_en}</p>
                <span className="tabular text-[0.86rem] text-brass-lit" dir="ltr">
                  {money(lineTotal(l))}
                </span>
              </div>
              {(rtl ? l.option_labels_ar : l.option_labels_en).length > 0 && (
                <p className="mt-1 text-[0.76rem] text-[var(--muted)]">
                  {(rtl ? l.option_labels_ar : l.option_labels_en).join(' · ')}
                </p>
              )}
              {l.notes && <p className="mt-1 text-[0.76rem] italic text-[var(--muted)]">“{l.notes}”</p>}
              {/* 44px steppers — these were 28, the smallest tap target in the app. */}
              <div className="mt-2.5 flex w-fit items-center gap-1 rounded-full border border-[var(--line)] p-0.5">
                <button
                  type="button"
                  onClick={() => onQuantity(l.key, l.quantity - 1)}
                  aria-label={t('Decrease', 'إنقاص')}
                  className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/8"
                >
                  −
                </button>
                <span className="tabular w-7 text-center text-[0.85rem]">{l.quantity}</span>
                <button
                  type="button"
                  onClick={() => onQuantity(l.key, l.quantity + 1)}
                  aria-label={t('Increase', 'زيادة')}
                  className="grid h-11 w-11 place-items-center rounded-full hover:bg-white/8"
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>

        {/* Optional, and labelled as such. The table is the identity — this is only so
            the counter can call the order out by name. place_order takes it as
            p_customer_name; the board shows it next to the table. */}
        <label className="mt-5 block">
          <span className="text-[0.82rem] text-[var(--muted)]">
            {t('Name (optional)', 'الاسم (اختياري)')}
          </span>
          <input
            type="text"
            value={customerName}
            onChange={(e) => onCustomerName(e.target.value.slice(0, 60))}
            autoComplete="given-name"
            placeholder={t('So we can call it out', 'حتى ننادي باسمك')}
            className="mt-2 min-h-11 w-full rounded-lg border border-[var(--line)] bg-transparent px-4 py-3 text-[0.86rem] placeholder:text-[var(--muted)]/60 focus:border-brass focus:outline-none"
          />
        </label>

        <div className="rule my-4" />
        <div className="flex items-baseline justify-between">
          <span className="text-[0.9rem]">{t('Total', 'الإجمالي')}</span>
          <span className="tabular text-lg text-brass-lit" dir="ltr">{money(cartSubtotal(cart))}</span>
        </div>
        <p className="mt-1.5 text-[0.72rem] text-[var(--muted)]">
          {t('Pay at the counter when you leave.', 'الدفع عند الكاشير عند المغادرة.')}
        </p>

        {error && (
          <p role="alert" className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-[0.82rem] text-red-300">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={onSubmit}
          disabled={placing || cart.length === 0}
          className="mt-5 min-h-12 w-full rounded-full bg-brass px-6 py-4 text-[0.88rem] text-bone transition-opacity disabled:opacity-50"
        >
          {placing ? t('Sending…', 'جارٍ الإرسال…') : t('Place order', 'إرسال الطلب')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 min-h-11 w-full py-3 text-[0.82rem] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          {t('Add more', 'إضافة المزيد')}
        </button>
      </div>
    </div>
  );
}
