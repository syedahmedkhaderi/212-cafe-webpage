'use client';

import type { Locale, OrderStatus } from '@/lib/types';
import { money } from '@/lib/format';
import { useBodyScrollLock } from './useBodyScrollLock';
import { seatLabel, type TableKind } from '@/lib/order/seat-label';

export const STEPS = ['received', 'preparing', 'ready', 'served'] as const;

export const STEP_COPY: Record<(typeof STEPS)[number], { en: string; ar: string }> = {
  received: { en: 'Order received', ar: 'تم استلام الطلب' },
  preparing: { en: 'Being prepared', ar: 'قيد التحضير' },
  ready: { en: 'Ready', ar: 'جاهز' },
  served: { en: 'Served', ar: 'تم التقديم' },
};

export function statusLabel(status: OrderStatus, locale: Locale): string {
  const copy = STEP_COPY[status as (typeof STEPS)[number]];
  if (!copy) return locale === 'ar' ? 'أُلغي الطلب' : 'Cancelled';
  return locale === 'ar' ? copy.ar : copy.en;
}

/**
 * Where the guest's order has got to.
 *
 * Two presentations of the same thing:
 *
 *   `page`  — the ordering app, where finishing an order IS the screen.
 *   `sheet` — the menu page, where it must not be. A guest who ordered twenty minutes
 *             ago and comes back to the menu wants the menu; blocking it behind a
 *             tracker they have to dismiss would be worse than not showing one at all.
 *             So /menu shows a small pill and opens this over it on demand.
 *
 * `status` is passed in rather than polled here, so the pill and the tracker on /menu
 * share a single poll. See useOrderStatus.
 */
export function OrderTracker({
  orderNumber,
  status,
  total,
  tableLabel,
  tableKind,
  locale,
  variant = 'page',
  onNewOrder,
  onClose,
}: {
  orderNumber: string;
  status: OrderStatus;
  total: number | null;
  tableLabel: string;
  tableKind?: TableKind;
  locale: Locale;
  variant?: 'page' | 'sheet';
  onNewOrder?: () => void;
  onClose?: () => void;
}) {
  const rtl = locale === 'ar';
  const t = (en: string, ar: string) => (rtl ? ar : en);
  const currentIndex = STEPS.indexOf(status as (typeof STEPS)[number]);

  const body = (
    <div className="w-full max-w-sm">
      <p className="eyebrow">
        {seatLabel(tableKind, tableLabel, locale)}
      </p>
      <h1 className="display mt-3 text-5xl">{t('Thank you', 'شكراً لك')}</h1>
      {/* Order number and price are Latin runs; isolating them with dir="ltr" keeps
          the bidi separator from colliding with the number in Arabic. */}
      <p className="mt-3 text-[var(--muted)]">
        {t('Order', 'طلب')}{' '}
        <span className="tabular inline-flex gap-2" dir="ltr">
          <span className="text-brass-lit">{orderNumber}</span>
          {total !== null && <span>· {money(total)}</span>}
        </span>
      </p>

      <ol className="mt-10 space-y-0">
        {STEPS.map((step, i) => {
          const done = i <= currentIndex;
          const active = i === currentIndex;
          return (
            <li key={step} className="flex gap-4">
              <div className="flex flex-col items-center">
                <span
                  className={`grid h-6 w-6 place-items-center rounded-full border text-[0.7rem] transition-colors ${
                    done ? 'border-brass bg-brass text-bone' : 'border-[var(--line)] text-[var(--muted)]'
                  }`}
                >
                  {done ? '✓' : i + 1}
                </span>
                {i < STEPS.length - 1 && (
                  <span className={`h-10 w-px ${i < currentIndex ? 'bg-brass' : 'bg-[var(--line)]'}`} />
                )}
              </div>
              <span
                className={`pt-0.5 text-[0.92rem] ${
                  active ? 'text-[var(--fg)]' : done ? 'text-[var(--muted)]' : 'text-[var(--muted)]/55'
                }`}
              >
                {t(STEP_COPY[step].en, STEP_COPY[step].ar)}
                {active && <span className="ms-2 inline-block animate-pulse text-brass">●</span>}
              </span>
            </li>
          );
        })}
      </ol>

      {onNewOrder && (
        <button
          type="button"
          onClick={onNewOrder}
          className="mt-12 min-h-12 w-full rounded-full border border-[var(--line)] px-6 py-3.5 text-[0.85rem] transition-colors hover:border-brass hover:text-brass"
        >
          {t('Order something else', 'اطلب شيئاً آخر')}
        </button>
      )}
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          className="mt-2 min-h-11 w-full py-3 text-[0.82rem] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          {t('Back to the menu', 'العودة إلى القائمة')}
        </button>
      )}
    </div>
  );

  if (variant === 'sheet') {
    return <TrackerSheet rtl={rtl} onClose={onClose}>{body}</TrackerSheet>;
  }

  return (
    <div
      data-surface="dark"
      dir={rtl ? 'rtl' : 'ltr'}
      lang={locale}
      className="flex min-h-[100dvh] flex-col items-center justify-center bg-[var(--bg)] px-6 py-16 pb-[max(4rem,env(safe-area-inset-bottom))] text-[var(--fg)]"
    >
      {body}
    </div>
  );
}

function TrackerSheet({
  rtl,
  onClose,
  children,
}: {
  rtl: boolean;
  onClose?: () => void;
  children: React.ReactNode;
}) {
  useBodyScrollLock(true);
  return (
    <div
      data-surface="dark"
      className="fixed inset-0 z-50 flex items-end justify-center text-[var(--fg)]"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <button
        type="button"
        aria-label={rtl ? 'إغلاق' : 'Close'}
        onClick={onClose}
        className="absolute inset-0 bg-black/65"
      />
      <div className="relative flex max-h-[88dvh] w-full max-w-lg justify-center overflow-y-auto overscroll-contain rounded-t-2xl bg-[var(--card)] px-6 py-10 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        {children}
      </div>
    </div>
  );
}
