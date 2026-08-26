'use client';

import { useEffect, useState } from 'react';
import { AdminShell, SignOutButton } from '@/components/admin/AdminShell';
import { useLiveOrders, type LiveOrder } from '@/lib/order/live';
import type { OrderStatus } from '@/lib/types';

const COLUMNS: { status: OrderStatus; label: string; next: OrderStatus; action: string }[] = [
  { status: 'received', label: 'New', next: 'preparing', action: 'Start' },
  { status: 'preparing', label: 'Preparing', next: 'ready', action: 'Ready' },
  { status: 'ready', label: 'Ready', next: 'served', action: 'Served' },
];

export default function KitchenPage() {
  return (
    <AdminShell title="Kitchen display" allow={['owner', 'admin', 'manager', 'staff', 'kitchen']}>
      {() => <KitchenBoard />}
    </AdminShell>
  );
}

function KitchenBoard() {
  const { orders, loading, connected, setStatus } = useLiveOrders([
    'received',
    'preparing',
    'ready',
  ]);

  return (
    <div data-surface="dark" className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
        <div className="flex items-baseline gap-4">
          <span className="display text-2xl">212</span>
          <span className="eyebrow">Kitchen</span>
        </div>
        <div className="flex items-center gap-5">
          <span className="flex items-center gap-2 text-[0.75rem] text-[var(--muted)]">
            <span
              className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}
              aria-hidden
            />
            {connected ? 'Live' : 'Reconnecting'}
          </span>
          <SignOutButton />
        </div>
      </header>

      <div className="grid gap-px bg-[var(--line)] lg:grid-cols-3">
        {COLUMNS.map((col) => {
          const list = orders.filter((o) => o.status === col.status);
          return (
            <section key={col.status} className="min-h-[calc(100vh-69px)] bg-[var(--bg)] p-5">
              <div className="flex items-baseline justify-between">
                <h2 className="text-[0.8rem] uppercase tracking-[0.18em] text-[var(--muted)]">
                  {col.label}
                </h2>
                <span className="tabular text-sm text-brass-lit">{list.length}</span>
              </div>

              <div className="mt-5 space-y-3">
                {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
                {!loading && list.length === 0 && (
                  <p className="text-sm text-[var(--muted)]/60">Nothing here.</p>
                )}
                {list.map((order) => (
                  <Ticket
                    key={order.id}
                    order={order}
                    actionLabel={col.action}
                    onAdvance={() => setStatus(order.id, col.next)}
                  />
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function Ticket({
  order,
  actionLabel,
  onAdvance,
}: {
  order: LiveOrder;
  actionLabel: string;
  onAdvance: () => void;
}) {
  const age = useAge(order.placed_at);

  return (
    <article className="rounded-lg border border-[var(--line)] bg-[var(--card)] p-4">
      <div className="flex items-baseline justify-between">
        <span className="display text-xl">Table {order.table_label}</span>
        <span className="tabular text-[0.72rem] text-[var(--muted)]">{order.order_number}</span>
      </div>
      <p className={`tabular mt-0.5 text-[0.72rem] ${age.stale ? 'text-amber-400' : 'text-[var(--muted)]'}`}>
        {age.label}
      </p>

      <ul className="mt-3 space-y-2 border-t border-[var(--line)] pt-3">
        {order.items.map((item) => (
          <li key={item.id}>
            <div className="flex gap-2.5 text-[0.88rem]">
              <span className="tabular shrink-0 text-brass-lit">{item.quantity}×</span>
              <span>{item.name_en}</span>
            </div>
            {item.modifiers.length > 0 && (
              <p className="ms-7 text-[0.74rem] text-[var(--muted)]">
                {item.modifiers.map((m) => m.name_en).join(' · ')}
              </p>
            )}
            {item.notes && (
              <p className="ms-7 text-[0.74rem] italic text-amber-300">“{item.notes}”</p>
            )}
          </li>
        ))}
      </ul>

      {order.special_instructions && (
        <p className="mt-3 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[0.76rem] text-amber-200">
          {order.special_instructions}
        </p>
      )}

      <button
        type="button"
        onClick={onAdvance}
        className="mt-4 w-full rounded-full bg-brass px-4 py-2.5 text-[0.8rem] text-bone transition-colors hover:bg-brass-lit"
      >
        {actionLabel}
      </button>
    </article>
  );
}

/** Ticket age, refreshed every 15s. Turns amber past 10 minutes. */
function useAge(placedAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  const minutes = Math.max(0, Math.floor((now - new Date(placedAt).getTime()) / 60000));
  return {
    stale: minutes >= 10,
    label: minutes < 1 ? 'just now' : `${minutes} min`,
  };
}
