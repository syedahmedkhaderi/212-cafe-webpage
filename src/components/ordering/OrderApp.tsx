'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { Locale, MenuCategory, MenuItem } from '@/lib/types';
import { localised } from '@/lib/types';
import { money } from '@/lib/format';
import { useTableOrder } from '@/lib/order/useTableOrder';
import { useOrderStatus } from '@/lib/order/useOrderStatus';
import { persistLocale } from '@/lib/locale-client';
import { hasUsablePhoto } from '@/lib/site';
import { ItemPlaceholder } from '@/components/menu/ItemPlaceholder';
import { ItemSheet } from './ItemSheet';
import { CartSheet } from './CartSheet';
import { OrderTracker } from './OrderTracker';
import { seatLabel, type TableKind } from '@/lib/order/seat-label';

type Props = {
  tableToken: string;
  tableLabel: string;
  tableKind?: TableKind;
  categories: MenuCategory[];
  items: MenuItem[];
  /** Resolved server-side from the shared locale cookie. */
  initialLocale: Locale;
};

/**
 * The scan-to-order app at /order/[tableToken].
 *
 * The cart, the sheets and the tracker all live outside this file now, because /menu
 * uses the same ones — see useTableOrder and the components beside this. What is left
 * here is this surface's own chrome: the table header, the category rail and the item
 * list.
 */
export function OrderApp({ tableToken, tableLabel, tableKind, categories, items, initialLocale }: Props) {
  const [locale, setLocale] = useState<Locale>(initialLocale);

  // Toggling here writes the same cookie the marketing site reads, so the choice
  // follows the guest back out to the menu rather than living only in this tab.
  const changeLocale = (next: Locale) => {
    setLocale(next);
    persistLocale(next);
  };

  const order = useTableOrder(tableToken, locale);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);

  const rtl = locale === 'ar';
  const t = (en: string, ar: string) => (rtl ? ar : en);

  const { status, total } = useOrderStatus(
    order.placed?.order_number ?? null,
    order.placed?.session_token ?? null,
  );

  const byCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const c of categories) {
      const list = items.filter((i) => i.category_id === c.id && i.is_available);
      if (list.length) map.set(c.id, list);
    }
    return map;
  }, [categories, items]);

  const slugFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.slug);
    return map;
  }, [categories]);

  // On this surface, finishing an order IS the screen. (/menu deliberately differs —
  // see OrderTracker.)
  if (order.placed) {
    return (
      <OrderTracker
        orderNumber={order.placed.order_number}
        status={status}
        total={total}
        tableLabel={tableLabel}
        tableKind={tableKind}
        locale={locale}
        variant="page"
        onNewOrder={order.clearPlaced}
      />
    );
  }

  return (
    <div
      data-surface="dark"
      dir={rtl ? 'rtl' : 'ltr'}
      lang={locale}
      className="min-h-[100dvh] bg-[var(--bg)] pb-28 text-[var(--fg)]"
    >
      {/* ------------------------------------------------------------- header */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/94 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5">
          <div>
            <span className="display text-xl leading-none">212</span>
            <span className="ms-3 text-[0.78rem] text-[var(--muted)]">
              {seatLabel(tableKind, tableLabel, locale)}
            </span>
          </div>
          <button
            type="button"
            onClick={() => changeLocale(rtl ? 'en' : 'ar')}
            className="grid min-h-11 min-w-11 place-items-center rounded-full border border-[var(--line)] px-3 text-[0.72rem] transition-colors hover:border-brass hover:text-brass"
          >
            {rtl ? 'EN' : 'ع'}
          </button>
        </div>

        <div className="rail mx-auto flex max-w-3xl snap-x gap-1 overflow-x-auto px-5 pb-3">
          {categories.map((c) =>
            byCategory.has(c.id) ? (
              <a
                key={c.id}
                href={`#cat-${c.slug}`}
                className="snap-start whitespace-nowrap rounded-full bg-white/6 px-3.5 py-2 text-[0.78rem] text-[var(--muted)] transition-colors hover:bg-white/12 hover:text-[var(--fg)]"
              >
                {localised(c, 'name', locale)}
              </a>
            ) : null,
          )}
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5">
        <div className="py-8">
          <h1 className="display text-4xl">{t('Good to see you', 'أهلاً بك')}</h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            {t('Order straight from your table.', 'اطلب مباشرة من طاولتك.')}
          </p>
        </div>

        {categories.map((c) => {
          const list = byCategory.get(c.id);
          if (!list) return null;
          return (
            <section key={c.id} id={`cat-${c.slug}`} className="scroll-mt-32 pb-10">
              <h2 className="display text-2xl">{localised(c, 'name', locale)}</h2>
              <div className="rule mt-3" />
              <ul className="mt-4 divide-y divide-[var(--line)]">
                {list.map((item) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setSheetItem(item)}
                      className="flex w-full items-center gap-4 py-4 text-start transition-colors hover:bg-white/4"
                    >
                      {hasUsablePhoto(item) ? (
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-sm bg-white/5">
                          <Image
                            src={item.image_path!}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </div>
                      ) : (
                        <ItemPlaceholder
                          categorySlug={c.slug}
                          className="h-16 w-16 shrink-0 text-[1rem]"
                        />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-[0.95rem] font-medium">{localised(item, 'name', locale)}</p>
                        {localised(item, 'description', locale) && (
                          <p className="mt-0.5 line-clamp-2 text-[0.78rem] leading-relaxed text-[var(--muted)]">
                            {localised(item, 'description', locale)}
                          </p>
                        )}
                      </div>
                      <span className="tabular shrink-0 text-sm text-brass-lit" dir="ltr">
                        {money(item.price)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </main>

      {/* --------------------------------------------------------- cart bar */}
      {order.count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--card)]/96 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex min-h-12 w-full max-w-3xl items-center justify-between rounded-full bg-brass px-6 py-4 text-bone"
          >
            <span className="text-[0.82rem]">
              {order.count} {t(order.count === 1 ? 'item' : 'items', 'صنف')}
            </span>
            <span className="text-[0.82rem] font-medium">{t('View order', 'عرض الطلب')}</span>
            <span className="tabular text-[0.82rem]" dir="ltr">
              {money(order.subtotal)}
            </span>
          </button>
        </div>
      )}

      {sheetItem && (
        <ItemSheet
          item={sheetItem}
          categorySlug={slugFor.get(sheetItem.category_id)}
          locale={locale}
          onClose={() => setSheetItem(null)}
          onAdd={(line) => {
            order.addItem(line);
            setSheetItem(null);
          }}
        />
      )}

      {cartOpen && (
        <CartSheet
          cart={order.cart}
          locale={locale}
          tableLabel={tableLabel}
          placing={order.placing}
          error={order.error}
          customerName={order.customerName}
          onCustomerName={order.setCustomerName}
          onClose={() => setCartOpen(false)}
          onQuantity={order.changeQuantity}
          // Only on success — closing the sheet after a failure would take the error
          // message away with it.
          onSubmit={async () => {
            if (await order.submit()) setCartOpen(false);
          }}
        />
      )}
    </div>
  );
}
