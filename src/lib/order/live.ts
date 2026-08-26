'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import type { OrderStatus } from '@/lib/types';

export type LiveOrderItem = {
  id: string;
  name_en: string;
  quantity: number;
  line_total: number;
  notes: string | null;
  modifiers: { name_en: string; group_name_en: string }[];
};

export type LiveOrder = {
  id: string;
  order_number: string;
  table_label: string;
  status: OrderStatus;
  total: number;
  customer_name: string | null;
  special_instructions: string | null;
  placed_at: string;
  items: LiveOrderItem[];
};

const SELECT = `
  id, order_number, table_label, status, total, customer_name, special_instructions, placed_at,
  order_items (
    id, name_en, quantity, line_total, notes,
    order_item_modifiers ( name_en, group_name_en )
  )
`;

type Row = {
  id: string;
  order_number: string;
  table_label: string;
  status: OrderStatus;
  total: string | number;
  customer_name: string | null;
  special_instructions: string | null;
  placed_at: string;
  order_items: {
    id: string;
    name_en: string;
    quantity: number;
    line_total: string | number;
    notes: string | null;
    order_item_modifiers: { name_en: string; group_name_en: string }[];
  }[];
};

const shape = (r: Row): LiveOrder => ({
  id: r.id,
  order_number: r.order_number,
  table_label: r.table_label,
  status: r.status,
  total: Number(r.total),
  customer_name: r.customer_name,
  special_instructions: r.special_instructions,
  placed_at: r.placed_at,
  items: (r.order_items ?? []).map((i) => ({
    id: i.id,
    name_en: i.name_en,
    quantity: i.quantity,
    line_total: Number(i.line_total),
    notes: i.notes,
    modifiers: i.order_item_modifiers ?? [],
  })),
});

/**
 * Live orders for staff surfaces.
 *
 * Staff are `authenticated` and satisfy private.is_staff(), so Realtime
 * postgres_changes genuinely delivers here — unlike the guest side, where RLS
 * (correctly) blocks it. See docs/DECISIONS.md.
 *
 * The payload from postgres_changes carries only the `orders` row, not its children,
 * so any change triggers a targeted refetch to pick up items and modifiers.
 */
export function useLiveOrders(statuses: OrderStatus[]) {
  const [orders, setOrders] = useState<LiveOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [connected, setConnected] = useState(false);
  const statusKey = statuses.join(',');
  const seen = useRef<Set<string>>(new Set());
  const [justArrived, setJustArrived] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    const supabase = getBrowserClient();
    const { data, error } = await supabase
      .from('orders')
      .select(SELECT)
      .in('status', statusKey.split(','))
      .order('placed_at', { ascending: true });

    if (error) {
      console.error('[212] live orders fetch failed', error.message);
      return;
    }
    const shaped = ((data ?? []) as unknown as Row[]).map(shape);

    // Flag genuinely new orders so the board can announce them.
    for (const o of shaped) {
      if (!seen.current.has(o.id)) {
        if (seen.current.size > 0) setJustArrived(o.id);
        seen.current.add(o.id);
      }
    }
    setOrders(shaped);
    setLoading(false);
  }, [statusKey]);

  useEffect(() => {
    refetch();
    const supabase = getBrowserClient();
    const channel = supabase
      .channel(`live-orders-${statusKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'orders' }, () => refetch())
      .subscribe((s) => setConnected(s === 'SUBSCRIBED'));

    // Safety net: if the socket drops silently, the board still refreshes.
    const timer = setInterval(refetch, 20000);

    return () => {
      supabase.removeChannel(channel);
      clearInterval(timer);
    };
  }, [refetch, statusKey]);

  const setStatus = useCallback(
    async (orderId: string, status: OrderStatus) => {
      // Optimistic: the board must feel instant in a busy kitchen.
      setOrders((current) =>
        current.map((o) => (o.id === orderId ? { ...o, status } : o)),
      );
      const { error } = await getBrowserClient().from('orders').update({ status }).eq('id', orderId);
      if (error) {
        console.error('[212] status update failed', error.message);
        refetch();
      }
    },
    [refetch],
  );

  return { orders, loading, connected, setStatus, refetch, justArrived };
}
