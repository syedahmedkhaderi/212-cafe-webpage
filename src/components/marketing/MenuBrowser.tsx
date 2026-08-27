'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MenuCategory, MenuItem, Locale } from '@/lib/types';
import { localised } from '@/lib/types';
import { money } from '@/lib/format';
import { isRTL } from '@/lib/i18n';
import { useCopy } from '@/lib/content/provider';
import { hasUsablePhoto } from '@/lib/site';
import { ItemPlaceholder } from '@/components/menu/ItemPlaceholder';
import { useTableOrder } from '@/lib/order/useTableOrder';
import { useOrderStatus } from '@/lib/order/useOrderStatus';
import { ItemSheet } from '@/components/ordering/ItemSheet';
import { CartSheet } from '@/components/ordering/CartSheet';
import { OrderTracker, statusLabel } from '@/components/ordering/OrderTracker';

export type MenuTable = { token: string; label: string };

type Props = {
  categories: MenuCategory[];
  items: MenuItem[];
  /** Locale is owned by the site-wide switcher in the header, not by this component. */
  locale: Locale;
  /**
   * The guest's table, if they arrived by scanning its QR code — resolved server-side
   * from the httpOnly cookie that /t/[tableToken] writes.
   *
   * Null for everybody else, and when it is null this page is exactly the read-only
   * menu it has always been. That is the guarantee: ordering never appears to somebody
   * who arrived from a search result, so /menu stays a public, indexable menu.
   */
  table?: MenuTable | null;
  /**
   * business_settings.accepting_orders. place_order refuses outright when this is off,
   * and the guest-facing error for that is the generic "we could not send that order" —
   * so the cart is not offered at all rather than letting somebody fill one and hit a
   * wall they cannot interpret.
   */
  acceptingOrders?: boolean;
};

export function MenuBrowser({
  categories,
  items,
  locale,
  table = null,
  acceptingOrders = false,
}: Props) {
  // Two components rather than one with a conditional hook. The public path never
  // mounts useTableOrder at all, so a visitor who never scanned anything does not get
  // cart state, a localStorage write, or the ordering bundle's work done on their
  // behalf.
  if (table && acceptingOrders) {
    return <OrderableMenu categories={categories} items={items} locale={locale} table={table} />;
  }
  return (
    <MenuShell
      categories={categories}
      items={items}
      locale={locale}
      table={table}
      ordering={false}
      onOrder={null}
    />
  );
}

/* ------------------------------------------------------------------ ordering layer */

function OrderableMenu({
  categories,
  items,
  locale,
  table,
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  locale: Locale;
  table: MenuTable;
}) {
  const order = useTableOrder(table.token, locale);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [trackerOpen, setTrackerOpen] = useState(false);

  const rtl = isRTL(locale);
  const t = (en: string, ar: string) => (rtl ? ar : en);

  const { status, total } = useOrderStatus(
    order.placed?.order_number ?? null,
    order.placed?.session_token ?? null,
  );

  const slugFor = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of categories) map.set(c.id, c.slug);
    return map;
  }, [categories]);

  /*
    Exactly one fixed bar at the bottom, ever. A cart in progress outranks a tracker for
    an order already sent — the guest is mid-task, and two stacked bars on a phone is
    worse than either alone.
  */
  const bottomBar: 'cart' | 'tracker' | null =
    order.count > 0 && !cartOpen ? 'cart' : order.placed && !trackerOpen ? 'tracker' : null;

  return (
    <>
      <MenuShell
        categories={categories}
        items={items}
        locale={locale}
        table={table}
        ordering
        onOrder={setSheetItem}
      />

      {/* Room for whichever bar is pinned, so the last menu row is never under it. */}
      {bottomBar && <div aria-hidden className="h-24" />}

      {bottomBar === 'cart' && (
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

      {/*
        A pill, not a takeover.

        The ordering app replaces the whole screen with the tracker once an order is
        placed, which is right there — finishing an order IS that screen. Here it would
        mean a guest who ordered twenty minutes ago cannot look at the menu again
        without dismissing something first. So the menu stays the menu, and the tracker
        is one tap away.
      */}
      {bottomBar === 'tracker' && order.placed && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--card)]/96 p-4 pb-[max(1rem,env(safe-area-inset-bottom))] backdrop-blur-md">
          <div className="mx-auto flex w-full max-w-3xl items-center gap-2">
            <button
              type="button"
              onClick={() => setTrackerOpen(true)}
              className="flex min-h-12 flex-1 items-center justify-between rounded-full border border-brass/40 bg-brass/10 px-5 py-3 text-start"
            >
              <span className="text-[0.82rem] text-[var(--fg)]">
                {t('Order', 'طلب')}{' '}
                <span className="tabular text-brass-ink" dir="ltr">
                  {order.placed.order_number}
                </span>
              </span>
              <span className="text-[0.8rem] text-[var(--muted)]">{statusLabel(status, locale)}</span>
            </button>
            <button
              type="button"
              onClick={order.clearPlaced}
              aria-label={t('Dismiss', 'إخفاء')}
              className="grid h-12 w-12 shrink-0 place-items-center rounded-full border border-[var(--line)] text-[var(--muted)] transition-colors hover:text-[var(--fg)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
              </svg>
            </button>
          </div>
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
          tableLabel={table.label}
          placing={order.placing}
          error={order.error}
          customerName={order.customerName}
          onCustomerName={order.setCustomerName}
          onClose={() => setCartOpen(false)}
          onQuantity={order.changeQuantity}
          // Only on success — closing the sheet after a failure would take the error
          // message away with it.
          onSubmit={async () => {
            if (await order.submit()) {
              setCartOpen(false);
              setTrackerOpen(true);
            }
          }}
        />
      )}

      {trackerOpen && order.placed && (
        <OrderTracker
          orderNumber={order.placed.order_number}
          status={status}
          total={total}
          tableLabel={table.label}
          locale={locale}
          variant="sheet"
          onClose={() => setTrackerOpen(false)}
        />
      )}
    </>
  );
}

/* -------------------------------------------------------------------- the menu itself */

function MenuShell({
  categories,
  items,
  locale,
  table,
  ordering,
  onOrder,
}: {
  categories: MenuCategory[];
  items: MenuItem[];
  locale: Locale;
  table: MenuTable | null;
  ordering: boolean;
  /** Null on the public menu — every row stays a static list item. */
  onOrder: ((item: MenuItem) => void) | null;
}) {
  const tr = useCopy(locale);
  const rtl = isRTL(locale);
  const [active, setActive] = useState(categories[0]?.id ?? '');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const byCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const c of categories) {
      map.set(c.id, items.filter((i) => i.category_id === c.id && i.is_available));
    }
    return map;
  }, [categories, items]);

  // Highlight the category whose section is nearest the top of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) {
          const match = categories.find((c) => c.slug === visible.target.id);
          if (match) setActive(match.id);
        }
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    for (const el of Object.values(sectionRefs.current)) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [categories]);

  const available = items.filter((i) => i.is_available).length;

  return (
    <div>
      <div className="py-12 sm:py-16">
        <p className="eyebrow">{tr('menuEyebrow')}</p>
        <h1 className="display mt-4 text-[clamp(2.75rem,8vw,5.5rem)]">{tr('menuPageTitle')}</h1>
        <p className="mt-5 max-w-lg leading-relaxed text-[var(--muted)]">
          {available} {tr('itemsCount')} {tr('across')} {categories.length} {tr('menuPageSub')}
        </p>

        {/* Which table, said before they add anything — not at the moment they commit. */}
        {table && (
          /* The label is --fg, not brass. brassVariants() guarantees brass-ink passes AA
             against the page background, but this pill tints its own background, and on
             that tint the same colour measures 4.35:1 — under the 4.5 floor. The brass
             dot carries the accent instead, where contrast does not apply. */
          <p className="mt-6 inline-flex items-center gap-2.5 rounded-full border border-brass/35 bg-brass/8 px-4 py-2 text-[0.82rem] text-[var(--fg)]">
            <span aria-hidden className="inline-block h-1.5 w-1.5 rounded-full bg-brass" />
            {ordering
              ? rtl
                ? `تطلب لطاولة ${table.label}`
                : `Ordering for Table ${table.label}`
              : rtl
                ? 'الطلب متوقف مؤقتاً'
                : 'Ordering is paused right now'}
          </p>
        )}
      </div>

      {/*
        Sticky category rail.

        `top` reads a variable rather than a hardcoded 57px. The page header measures
        itself and publishes its height (see MenuPageChrome), so the rail stays pinned
        to the bottom of the header instead of drifting under it — or leaving a gap
        below it — when a visitor has raised their browser's font size.
      */}
      <div className="sticky top-[var(--menu-header-h,57px)] z-40 -mx-5 border-b border-[var(--line)] bg-[var(--bg)]/92 px-5 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="rail mx-auto flex max-w-6xl snap-x gap-1 overflow-x-auto py-3">
          {categories.map((c) => {
            const count = byCategory.get(c.id)?.length ?? 0;
            if (count === 0) return null;
            return (
              <a
                key={c.id}
                href={`#${c.slug}`}
                className={`snap-start whitespace-nowrap rounded-full px-4 py-2 text-[0.8rem] transition-colors ${
                  active === c.id
                    ? 'bg-ink text-bone'
                    : 'text-[var(--muted)] hover:bg-bone-dim hover:text-[var(--fg)]'
                }`}
              >
                {localised(c, 'name', locale)}
              </a>
            );
          })}
        </div>
      </div>

      {categories.map((c) => {
        const list = byCategory.get(c.id) ?? [];
        if (list.length === 0) return null;

        return (
          <section
            key={c.id}
            id={c.slug}
            ref={(el) => {
              sectionRefs.current[c.id] = el;
            }}
            className="scroll-mt-32 py-14"
          >
            <div className="flex items-baseline justify-between gap-5">
              <h2 className="display text-[clamp(2rem,5vw,3.25rem)]">{localised(c, 'name', locale)}</h2>
              <span className="tabular text-xs text-[var(--muted)]">{list.length}</span>
            </div>
            <div className="rule mt-5" />

            <ul className="mt-8 grid gap-x-8 gap-y-9 sm:grid-cols-2">
              {list.map((item) => (
                <MenuRow
                  key={item.id}
                  item={item}
                  categorySlug={c.slug}
                  locale={locale}
                  signatureLabel={tr('signatureTag')}
                  addLabel={rtl ? 'أضف' : 'Add'}
                  onOrder={onOrder}
                />
              ))}
            </ul>
          </section>
        );
      })}

      <p className="pb-4 text-center text-xs text-[var(--muted)]">
        {rtl ? 'الأسعار بالريال القطري' : 'Prices in Qatari riyal'}
      </p>
    </div>
  );
}

/**
 * One item.
 *
 * The same markup whether or not ordering is on — only the wrapper changes, from a
 * plain <li> to a button. Keeping one row means the public menu and the ordering menu
 * cannot drift apart visually.
 */
function MenuRow({
  item,
  categorySlug,
  locale,
  signatureLabel,
  addLabel,
  onOrder,
}: {
  item: MenuItem;
  categorySlug: string;
  locale: Locale;
  signatureLabel: string;
  addLabel: string;
  onOrder: ((item: MenuItem) => void) | null;
}) {
  const name = localised(item, 'name', locale);
  const description = localised(item, 'description', locale);
  /* Text-forward where the photograph is a duplicate (one latte shot covers five
     products) or AI-generated stock rather than their food. See hasUsablePhoto — both
     rules, on every photo-led surface. The 12 that fail get a drawn placeholder rather
     than a hairline rule, because a single-column phone menu of thin brass bars reads
     as a page that failed to load. */
  const showPhoto = hasUsablePhoto(item);

  const inner = (
    <>
      {showPhoto ? (
        <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-sm bg-sand">
          <Image src={item.image_path!} alt={name} fill sizes="96px" className="object-cover" />
        </div>
      ) : (
        <ItemPlaceholder categorySlug={categorySlug} className="h-24 w-24 shrink-0 text-[1.1rem]" />
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-3">
          <h3 className="text-[0.98rem] font-medium leading-snug">{name}</h3>
          <span className="tabular shrink-0 text-sm text-brass-ink" dir="ltr">
            {money(item.price)}
          </span>
        </div>
        {description && (
          <p className="mt-1.5 text-[0.83rem] leading-relaxed text-[var(--muted)]">{description}</p>
        )}
        <div className="mt-2 flex items-center gap-3">
          {item.is_signature && (
            <span className="eyebrow inline-block text-brass-ink">{signatureLabel}</span>
          )}
          {onOrder && (
            <span className="ms-auto rounded-full border border-brass/45 px-3.5 py-1.5 text-[0.72rem] tracking-[0.08em] text-brass-ink uppercase">
              {addLabel}
            </span>
          )}
        </div>
      </div>
    </>
  );

  if (!onOrder) return <li className="flex gap-4">{inner}</li>;

  return (
    <li>
      <button
        type="button"
        onClick={() => onOrder(item)}
        aria-label={`${addLabel}, ${name}`}
        className="-m-2 flex w-full gap-4 rounded-md p-2 text-start transition-colors hover:bg-bone-dim"
      >
        {inner}
      </button>
    </li>
  );
}
