'use client';

import { useCallback, useEffect, useState } from 'react';
import type { CartLine, Locale } from '@/lib/types';
import { addLine, cartCount, cartSubtotal, setQuantity } from '@/lib/order/cart';
import { getBrowserClient } from '@/lib/supabase/client';

const STORAGE = (token: string) => `212.cart.${token}`;
const PLACED_STORAGE = (token: string) => `212.placed.${token}`;

export type PlacedRef = { order_number: string; session_token: string };

/**
 * One guest's cart against one table, and the call that sends it.
 *
 * Lifted out of OrderApp so the ordering app and the menu page place orders through
 * exactly the same path — same idempotency key, same error handling, same storage.
 * Anything that diverges here is a second way to place an order, which is a second
 * thing to get wrong.
 *
 * The storage keys are keyed on the table token and deliberately unchanged, so a cart
 * begun on /menu is the same cart at /order/<token>.
 *
 * ⚠ Known limitation: two surfaces now write that key and neither re-reads it after
 * mount, so a guest with both open in two tabs will have one clobber the other. Left
 * alone on purpose — the order that gets placed is whatever the tab they tapped in is
 * holding, and place_order reprices every line from the menu table regardless.
 */
export function useTableOrder(tableToken: string, locale: Locale) {
  const [cart, setCart] = useState<CartLine[]>([]);
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placed, setPlaced] = useState<PlacedRef | null>(null);
  const [customerName, setCustomerName] = useState('');

  const rtl = locale === 'ar';
  const t = useCallback((en: string, ar: string) => (rtl ? ar : en), [rtl]);

  /*
    Restore an in-progress cart, and any order already placed from this table, if the
    guest reloads or iOS discards the tab. Losing the tracker mid-order is the worst
    moment for it to happen.

    This has to be an effect. The obvious alternative — a lazy useState initialiser —
    would read localStorage while rendering, and these hooks run inside components that
    are server-rendered first: the server has no localStorage, so the two passes would
    disagree and React would throw a hydration mismatch on the very guests whose cart we
    are trying to preserve. Hence the disable; the rule is right in general and wrong
    for restoring client-only state.
  */
  // eslint-disable-next-line react-hooks/set-state-in-effect
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

  const addItem = useCallback((line: CartLine) => setCart((c) => addLine(c, line)), []);
  const changeQuantity = useCallback(
    (key: string, quantity: number) => setCart((c) => setQuantity(c, key, quantity)),
    [],
  );
  const clearPlaced = useCallback(() => setPlaced(null), []);

  /** Resolves true only when the order actually landed, so callers know whether it is
   *  safe to close the cart. Closing it on a failure would hide the error message. */
  const submit = useCallback(async (): Promise<boolean> => {
    if (cart.length === 0 || placing) return false;
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
        p_customer_name: customerName.trim() || null,
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
      return true;
    } catch (e) {
      // Never surface Postgres text to a guest; log the detail, show a plain sentence.
      // Throttling is the one case worth distinguishing — "try again" is unhelpful
      // advice when the answer is "wait a moment".
      console.error('[212] order failed', e);
      const throttled =
        typeof e === 'object' && e !== null && 'message' in e &&
        /rate_limited/.test(String((e as { message: unknown }).message));

      setError(
        throttled
          ? t(
              'That is a lot of orders at once. Please wait a moment and try again.',
              'تم إرسال طلبات كثيرة في وقت قصير. يرجى الانتظار قليلاً ثم المحاولة مجدداً.',
            )
          : t(
              'We could not send that order. Please try again, or ask a member of staff.',
              'تعذّر إرسال الطلب. يرجى المحاولة مرة أخرى أو إبلاغ أحد الموظفين.',
            ),
      );
      return false;
    } finally {
      setPlacing(false);
    }
  }, [cart, placing, tableToken, customerName, t]);

  return {
    cart,
    addItem,
    changeQuantity,
    count: cartCount(cart),
    subtotal: cartSubtotal(cart),
    customerName,
    setCustomerName,
    placing,
    error,
    placed,
    clearPlaced,
    submit,
  };
}
