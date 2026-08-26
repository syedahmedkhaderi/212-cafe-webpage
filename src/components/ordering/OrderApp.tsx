'use client';

import Image from 'next/image';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CartLine, Locale, MenuCategory, MenuItem, ModifierOption } from '@/lib/types';
import { localised } from '@/lib/types';
import { money } from '@/lib/format';
import {
  addLine,
  buildLine,
  cartCount,
  cartSubtotal,
  defaultSelection,
  lineTotal,
  setQuantity,
  validateSelection,
} from '@/lib/order/cart';
import { getBrowserClient } from '@/lib/supabase/client';

type Props = {
  tableToken: string;
  tableLabel: string;
  categories: MenuCategory[];
  items: MenuItem[];
};

const STORAGE = (token: string) => `212.cart.${token}`;
const PLACED_STORAGE = (token: string) => `212.placed.${token}`;

export function OrderApp({ tableToken, tableLabel, categories, items }: Props) {
  const [locale, setLocale] = useState<Locale>('en');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [sheetItem, setSheetItem] = useState<MenuItem | null>(null);
  const [cartOpen, setCartOpen] = useState(false);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<{ order_number: string; session_token: string } | null>(null);

  const rtl = locale === 'ar';
  const t = (en: string, ar: string) => (rtl ? ar : en);

  // Restore an in-progress cart, and any order already placed from this table, if the
  // guest reloads or iOS discards the tab. Losing the tracker mid-order is the worst
  // moment for it to happen.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(STORAGE(tableToken));
      if (saved) setCart(JSON.parse(saved));
      const savedPlaced = localStorage.getItem(PLACED_STORAGE(tableToken));
      if (savedPlaced) setPlaced(JSON.parse(savedPlaced));
    } catch {
      /* private mode or blocked storage — start empty, no user-visible failure */
    }
  }, [tableToken]);

  useEffect(() => {
    try {
      if (placed) localStorage.setItem(PLACED_STORAGE(tableToken), JSON.stringify(placed));
      else localStorage.removeItem(PLACED_STORAGE(tableToken));
    } catch {
      /* ignore */
    }
  }, [placed, tableToken]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE(tableToken), JSON.stringify(cart));
    } catch {
      /* ignore */
    }
  }, [cart, tableToken]);

  const byCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const c of categories) {
      const list = items.filter((i) => i.category_id === c.id && i.is_available);
      if (list.length) map.set(c.id, list);
    }
    return map;
  }, [categories, items]);

  const submit = useCallback(async () => {
    if (cart.length === 0 || placing) return;
    setPlacing(true);
    setError(null);

    // One key per cart contents + attempt window. A double-tap reuses it, so the
    // server returns the first order instead of creating a second.
    const idempotencyKey = `${tableToken}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

    try {
      const supabase = getBrowserClient();
      const { data, error: rpcError } = await supabase.rpc('place_order', {
        p_table_token: tableToken,
        p_idempotency_key: idempotencyKey,
        p_items: cart.map((l) => ({
          menu_item_id: l.menu_item_id,
          quantity: l.quantity,
          option_ids: l.option_ids,
          notes: l.notes,
        })),
      });

      if (rpcError) throw rpcError;
      setPlaced({ order_number: data.order_number, session_token: data.session_token });
      setCart([]);
      setCartOpen(false);
    } catch (e) {
      // Never surface Postgres text to a guest; log the detail, show a plain sentence.
      console.error('[212] order failed', e);
      setError(
        t(
          'We could not send that order. Please try again, or ask a member of staff.',
          'تعذّر إرسال الطلب. يرجى المحاولة مرة أخرى أو إبلاغ أحد الموظفين.',
        ),
      );
    } finally {
      setPlacing(false);
    }
  }, [cart, placing, tableToken, rtl]);

  if (placed) {
    return (
      <OrderPlaced
        orderNumber={placed.order_number}
        sessionToken={placed.session_token}
        tableLabel={tableLabel}
        locale={locale}
        onNewOrder={() => setPlaced(null)}
      />
    );
  }

  const count = cartCount(cart);

  return (
    <div data-surface="dark" dir={rtl ? 'rtl' : 'ltr'} lang={locale} className="min-h-screen bg-[var(--bg)] pb-28 text-[var(--fg)]">
      {/* ------------------------------------------------------------- header */}
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/94 backdrop-blur-md">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-3.5">
          <div>
            <span className="display text-xl leading-none">212</span>
            <span className="ms-3 text-[0.78rem] text-[var(--muted)]">
              {t('Table', 'طاولة')} {tableLabel}
            </span>
          </div>
          <button
            type="button"
            onClick={() => setLocale(rtl ? 'en' : 'ar')}
            className="rounded-full border border-[var(--line)] px-3 py-1.5 text-[0.72rem] transition-colors hover:border-brass hover:text-brass"
          >
            {rtl ? 'EN' : 'ع'}
          </button>
        </div>

        <div className="rail mx-auto flex max-w-3xl gap-1 overflow-x-auto px-5 pb-3">
          {categories.map((c) =>
            byCategory.has(c.id) ? (
              <a
                key={c.id}
                href={`#cat-${c.slug}`}
                className="whitespace-nowrap rounded-full bg-white/6 px-3.5 py-1.5 text-[0.78rem] text-[var(--muted)] transition-colors hover:bg-white/12 hover:text-[var(--fg)]"
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
                      {item.image_path && (
                        <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-sm bg-white/5">
                          <Image
                            src={item.image_path}
                            alt=""
                            fill
                            sizes="64px"
                            className="object-cover"
                          />
                        </div>
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
      {count > 0 && !cartOpen && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--card)]/96 p-4 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setCartOpen(true)}
            className="mx-auto flex w-full max-w-3xl items-center justify-between rounded-full bg-brass px-6 py-4 text-bone"
          >
            <span className="text-[0.82rem]">
              {count} {t(count === 1 ? 'item' : 'items', 'صنف')}
            </span>
            <span className="text-[0.82rem] font-medium">{t('View order', 'عرض الطلب')}</span>
            <span className="tabular text-[0.82rem]" dir="ltr">
              {money(cartSubtotal(cart))}
            </span>
          </button>
        </div>
      )}

      {sheetItem && (
        <ItemSheet
          item={sheetItem}
          locale={locale}
          onClose={() => setSheetItem(null)}
          onAdd={(line) => {
            setCart((c) => addLine(c, line));
            setSheetItem(null);
          }}
        />
      )}

      {cartOpen && (
        <CartSheet
          cart={cart}
          locale={locale}
          tableLabel={tableLabel}
          placing={placing}
          error={error}
          onClose={() => setCartOpen(false)}
          onQuantity={(key, q) => setCart((c) => setQuantity(c, key, q))}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ item sheet */

function ItemSheet({
  item,
  locale,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  locale: Locale;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const rtl = locale === 'ar';
  const t = (en: string, ar: string) => (rtl ? ar : en);
  const [selected, setSelected] = useState<ModifierOption[]>(() => defaultSelection(item));
  const [quantity, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  const selectedIds = useMemo(() => new Set(selected.map((o) => o.id)), [selected]);
  const validity = validateSelection(item, selectedIds);
  const unit = item.price + selected.reduce((s, o) => s + o.price_delta, 0);

  const toggle = (group: MenuItem['modifier_groups'][number], option: ModifierOption) => {
    setSelected((current) => {
      const inGroup = current.filter((o) => group.options.some((g) => g.id === o.id));
      const others = current.filter((o) => !group.options.some((g) => g.id === o.id));
      const already = inGroup.some((o) => o.id === option.id);

      if (group.max_select === 1) return already && group.min_select === 0 ? others : [...others, option];
      if (already) return [...others, ...inGroup.filter((o) => o.id !== option.id)];
      if (inGroup.length >= group.max_select) return current;
      return [...others, ...inGroup, option];
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" dir={rtl ? 'rtl' : 'ltr'}>
      <button
        type="button"
        aria-label={t('Close', 'إغلاق')}
        onClick={onClose}
        className="absolute inset-0 bg-black/65"
      />
      <div className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--card)] pb-5">
        {item.image_path && (
          <div className="relative aspect-[16/10] w-full overflow-hidden">
            <Image src={item.image_path} alt="" fill sizes="512px" className="object-cover" priority />
            <button
              type="button"
              onClick={onClose}
              aria-label={t('Close', 'إغلاق')}
              className="absolute end-3 top-3 grid h-9 w-9 place-items-center rounded-full bg-black/55 text-bone backdrop-blur"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        )}

        <div className="px-5 pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="display text-2xl">{localised(item, 'name', locale)}</h2>
            <span className="tabular text-brass-lit" dir="ltr">{money(item.price)}</span>
          </div>
          {localised(item, 'description', locale) && (
            <p className="mt-2 text-[0.85rem] leading-relaxed text-[var(--muted)]">
              {localised(item, 'description', locale)}
            </p>
          )}

          {item.modifier_groups.map((group) => (
            <fieldset key={group.id} className="mt-6">
              <legend className="flex w-full items-baseline justify-between">
                <span className="text-[0.9rem] font-medium">{localised(group, 'name', locale)}</span>
                <span className="text-[0.7rem] text-[var(--muted)]">
                  {group.min_select > 0
                    ? t('Required', 'مطلوب')
                    : t(`Up to ${group.max_select}`, `حتى ${group.max_select}`)}
                </span>
              </legend>
              <div className="mt-2.5 space-y-1">
                {group.options.map((option) => {
                  const on = selectedIds.has(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggle(group, option)}
                      className={`flex w-full items-center justify-between rounded-lg border px-4 py-3 text-start text-[0.86rem] transition-colors ${
                        on
                          ? 'border-brass bg-brass/12 text-[var(--fg)]'
                          : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--fg)]/30'
                      }`}
                    >
                      <span>{localised(option, 'name', locale)}</span>
                      {option.price_delta > 0 && (
                        <span className="tabular text-[0.8rem] text-brass-lit" dir="ltr">
                          +{money(option.price_delta)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <label className="mt-6 block">
            <span className="text-[0.9rem] font-medium">{t('Notes', 'ملاحظات')}</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 200))}
              rows={2}
              placeholder={t('Less ice, no sugar…', 'ثلج أقل، بدون سكر…')}
              className="mt-2 w-full resize-none rounded-lg border border-[var(--line)] bg-transparent px-4 py-3 text-[0.86rem] placeholder:text-[var(--muted)]/60 focus:border-brass focus:outline-none"
            />
          </label>

          <div className="mt-6 flex items-center gap-4">
            <div className="flex items-center gap-1 rounded-full border border-[var(--line)] p-1">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label={t('Decrease', 'إنقاص')}
                className="grid h-9 w-9 place-items-center rounded-full text-lg hover:bg-white/8"
              >
                −
              </button>
              <span className="tabular w-8 text-center text-[0.95rem]">{quantity}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(50, q + 1))}
                aria-label={t('Increase', 'زيادة')}
                className="grid h-9 w-9 place-items-center rounded-full text-lg hover:bg-white/8"
              >
                +
              </button>
            </div>

            <button
              type="button"
              disabled={!validity.ok}
              onClick={() => onAdd(buildLine(item, selected, quantity, notes))}
              className="flex flex-1 items-center justify-between rounded-full bg-brass px-6 py-3.5 text-bone transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="text-[0.85rem]">
                {validity.ok ? t('Add to order', 'أضف إلى الطلب') : validity.message}
              </span>
              {validity.ok && (
                <span className="tabular text-[0.85rem]" dir="ltr">
                  {money(unit * quantity)}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ cart sheet */

function CartSheet({
  cart,
  locale,
  tableLabel,
  placing,
  error,
  onClose,
  onQuantity,
  onSubmit,
}: {
  cart: CartLine[];
  locale: Locale;
  tableLabel: string;
  placing: boolean;
  error: string | null;
  onClose: () => void;
  onQuantity: (key: string, q: number) => void;
  onSubmit: () => void;
}) {
  const rtl = locale === 'ar';
  const t = (en: string, ar: string) => (rtl ? ar : en);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center" dir={rtl ? 'rtl' : 'ltr'}>
      <button type="button" aria-label={t('Close', 'إغلاق')} onClick={onClose} className="absolute inset-0 bg-black/65" />
      <div className="relative max-h-[88vh] w-full max-w-lg overflow-y-auto rounded-t-2xl bg-[var(--card)] p-5">
        <div className="flex items-center justify-between">
          <h2 className="display text-2xl">{t('Your order', 'طلبك')}</h2>
          <span className="text-[0.78rem] text-[var(--muted)]">
            {t('Table', 'طاولة')} {tableLabel}
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
              <div className="mt-2.5 flex items-center gap-1 rounded-full border border-[var(--line)] p-0.5 w-fit">
                <button
                  type="button"
                  onClick={() => onQuantity(l.key, l.quantity - 1)}
                  aria-label={t('Decrease', 'إنقاص')}
                  className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/8"
                >
                  −
                </button>
                <span className="tabular w-7 text-center text-[0.85rem]">{l.quantity}</span>
                <button
                  type="button"
                  onClick={() => onQuantity(l.key, l.quantity + 1)}
                  aria-label={t('Increase', 'زيادة')}
                  className="grid h-7 w-7 place-items-center rounded-full hover:bg-white/8"
                >
                  +
                </button>
              </div>
            </li>
          ))}
        </ul>

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
          className="mt-5 w-full rounded-full bg-brass px-6 py-4 text-[0.88rem] text-bone transition-opacity disabled:opacity-50"
        >
          {placing ? t('Sending…', 'جارٍ الإرسال…') : t('Place order', 'إرسال الطلب')}
        </button>
        <button
          type="button"
          onClick={onClose}
          className="mt-2 w-full py-3 text-[0.82rem] text-[var(--muted)] hover:text-[var(--fg)]"
        >
          {t('Add more', 'إضافة المزيد')}
        </button>
      </div>
    </div>
  );
}

/* --------------------------------------------------------------- placed / status */

const STEPS = ['received', 'preparing', 'ready', 'served'] as const;

const STEP_COPY: Record<(typeof STEPS)[number], { en: string; ar: string }> = {
  received: { en: 'Order received', ar: 'تم استلام الطلب' },
  preparing: { en: 'Being prepared', ar: 'قيد التحضير' },
  ready: { en: 'Ready', ar: 'جاهز' },
  served: { en: 'Served', ar: 'تم التقديم' },
};

function OrderPlaced({
  orderNumber,
  sessionToken,
  tableLabel,
  locale,
  onNewOrder,
}: {
  orderNumber: string;
  sessionToken: string;
  tableLabel: string;
  locale: Locale;
  onNewOrder: () => void;
}) {
  const rtl = locale === 'ar';
  const t = (en: string, ar: string) => (rtl ? ar : en);
  const [status, setStatus] = useState<string>('received');
  const [total, setTotal] = useState<number | null>(null);

  /* Polls rather than subscribing: Supabase Realtime enforces RLS, and anon has no
     SELECT policy on orders, so postgres_changes delivers nothing to a guest.
     Measured, not assumed — see docs/DECISIONS.md. */
  useEffect(() => {
    let alive = true;
    const supabase = getBrowserClient();

    const poll = async () => {
      const { data } = await supabase.rpc('get_order_status', {
        p_order_number: orderNumber,
        p_session_token: sessionToken,
      });
      if (!alive || !data) return;
      setStatus(data.status);
      setTotal(Number(data.total));
      if (data.status === 'served' || data.status === 'cancelled') clearInterval(timer);
    };

    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [orderNumber, sessionToken]);

  const currentIndex = STEPS.indexOf(status as (typeof STEPS)[number]);

  return (
    <div
      data-surface="dark"
      dir={rtl ? 'rtl' : 'ltr'}
      lang={locale}
      className="flex min-h-screen flex-col items-center justify-center bg-[var(--bg)] px-6 py-16 text-[var(--fg)]"
    >
      <div className="w-full max-w-sm">
        <p className="eyebrow">
          {t('Table', 'طاولة')} {tableLabel}
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

        <button
          type="button"
          onClick={onNewOrder}
          className="mt-12 w-full rounded-full border border-[var(--line)] px-6 py-3.5 text-[0.85rem] transition-colors hover:border-brass hover:text-brass"
        >
          {t('Order something else', 'اطلب شيئاً آخر')}
        </button>
      </div>
    </div>
  );
}
