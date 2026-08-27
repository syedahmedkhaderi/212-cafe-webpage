'use client';

import { useEffect, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import type { OrderStatus } from '@/lib/types';

/**
 * Follow one placed order.
 *
 * Polls rather than subscribing, and that is measured rather than assumed: Supabase
 * Realtime enforces RLS, and `anon` deliberately has NO select policy on `orders`, so a
 * guest's postgres_changes subscription reports SUBSCRIBED and then delivers exactly
 * nothing, forever. Building the "mark preparing, the guest's phone updates" moment on
 * it would have failed silently. See docs/DECISIONS.md §2.
 *
 * The order number alone is not enough to read an order — get_order_status also demands
 * the 128-bit session token handed back when it was placed.
 *
 * Lifted out of OrderApp so the ordering app and the menu page share ONE poll: /menu
 * shows a status pill and can open the full tracker, and both read this hook's value
 * rather than each opening their own 3-second interval against the same order.
 */
export function useOrderStatus(orderNumber: string | null, sessionToken: string | null) {
  const [status, setStatus] = useState<OrderStatus>('received');
  const [total, setTotal] = useState<number | null>(null);

  useEffect(() => {
    if (!orderNumber || !sessionToken) return;

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
      // Nothing follows served or cancelled, so stop asking.
      if (data.status === 'served' || data.status === 'cancelled') clearInterval(timer);
    };

    poll();
    const timer = setInterval(poll, 3000);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, [orderNumber, sessionToken]);

  return { status, total };
}
