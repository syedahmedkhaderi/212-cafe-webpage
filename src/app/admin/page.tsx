'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell, SignOutButton } from '@/components/admin/AdminShell';
import { useLiveOrders, type LiveOrder } from '@/lib/order/live';
import { currentAccessToken, getBrowserClient } from '@/lib/supabase/client';
import { setItemAvailability } from './actions';
import { money } from '@/lib/format';
import type { OrderStatus } from '@/lib/types';

export default function AdminPage() {
  return (
    <AdminShell title="Dashboard" allow={['owner', 'admin', 'manager', 'staff']}>
      {({ role, fullName }) => <Dashboard role={role} fullName={fullName} />}
    </AdminShell>
  );
}

const NEXT: Partial<Record<OrderStatus, { status: OrderStatus; label: string }>> = {
  received: { status: 'preparing', label: 'Start' },
  preparing: { status: 'ready', label: 'Ready' },
  ready: { status: 'served', label: 'Mark served' },
};

function Dashboard({ role, fullName }: { role: string; fullName: string }) {
  const { orders, loading, connected, setStatus, justArrived } = useLiveOrders([
    'received',
    'preparing',
    'ready',
  ]);
  const [today, setToday] = useState<{ count: number; revenue: number; top: [string, number][] }>({
    count: 0,
    revenue: 0,
    top: [],
  });

  // Today's totals, refreshed whenever the live board changes.
  useEffect(() => {
    const load = async () => {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const { data } = await getBrowserClient()
        .from('orders')
        .select('total, status, order_items(name_en, quantity)')
        .gte('placed_at', midnight.toISOString());

      const rows = (data ?? []) as { total: string; status: OrderStatus; order_items: { name_en: string; quantity: number }[] }[];
      const billable = rows.filter((r) => r.status !== 'cancelled');
      const tally = new Map<string, number>();
      for (const r of billable) {
        for (const i of r.order_items ?? []) {
          tally.set(i.name_en, (tally.get(i.name_en) ?? 0) + i.quantity);
        }
      }
      setToday({
        count: billable.length,
        revenue: billable.reduce((s, r) => s + Number(r.total), 0),
        top: [...tally.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5),
      });
    };
    load();
  }, [orders]);

  const activeTables = useMemo(
    () => new Set(orders.map((o) => o.table_label)).size,
    [orders],
  );

  return (
    <div data-surface="dark" className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/94 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <span className="display text-2xl">212</span>
            <span className="eyebrow">Dashboard</span>
          </div>
          <div className="flex items-center gap-5">
            <span className="hidden text-[0.75rem] text-[var(--muted)] sm:inline">
              {fullName} · {role}
            </span>
            {(role === "owner" || role === "admin" || role === "manager") && (
              <Link
                href="/admin/tables"
                className="hidden rounded-full border border-[var(--line)] px-4 py-2 text-[0.75rem] transition-colors hover:border-brass hover:text-brass sm:inline-block"
              >
                QR codes
              </Link>
            )}
            {(role === "owner" || role === "admin") && (
              <Link
                href="/admin/activity"
                className="hidden rounded-full border border-[var(--line)] px-4 py-2 text-[0.75rem] transition-colors hover:border-brass hover:text-brass sm:inline-block"
              >
                Activity
              </Link>
            )}
            <Link
              href="/kitchen"
              className="rounded-full border border-[var(--line)] px-4 py-2 text-[0.75rem] transition-colors hover:border-brass hover:text-brass"
            >
              Kitchen
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <div className="grid gap-px overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4">
          <Stat label="Open orders" value={String(orders.length)} />
          <Stat label="Active tables" value={String(activeTables)} />
          <Stat label="Orders today" value={String(today.count)} />
          <Stat label="Revenue today" value={money(today.revenue)} accent />
        </div>

        <div className="mt-10 grid gap-10 lg:grid-cols-[1.6fr_1fr]">
          <section>
            <div className="flex items-baseline justify-between">
              <h2 className="display text-3xl">Live orders</h2>
              <span className="flex items-center gap-2 text-[0.72rem] text-[var(--muted)]">
                <span
                  className={`h-1.5 w-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-amber-400'}`}
                  aria-hidden
                />
                {connected ? 'Live' : 'Reconnecting'}
              </span>
            </div>

            <div className="mt-5 space-y-3">
              {loading && <p className="text-sm text-[var(--muted)]">Loading…</p>}
              {!loading && orders.length === 0 && (
                <p className="rounded-lg border border-dashed border-[var(--line)] px-5 py-10 text-center text-sm text-[var(--muted)]">
                  No open orders. Scan a table QR to place one.
                </p>
              )}
              {orders.map((o) => (
                <OrderCard
                  key={o.id}
                  order={o}
                  fresh={o.id === justArrived}
                  onAdvance={() => {
                    const next = NEXT[o.status];
                    if (next) setStatus(o.id, next.status);
                  }}
                />
              ))}
            </div>
          </section>

          <aside>
            <h2 className="display text-3xl">Today</h2>
            <div className="mt-5 rounded-lg border border-[var(--line)] p-5">
              <p className="eyebrow">Top items</p>
              {today.top.length === 0 ? (
                <p className="mt-3 text-sm text-[var(--muted)]">Nothing sold yet today.</p>
              ) : (
                <ol className="mt-3 space-y-2.5">
                  {today.top.map(([name, qty], i) => (
                    <li key={name} className="flex items-baseline justify-between gap-3 text-sm">
                      <span className="truncate">
                        <span className="tabular me-2 text-[var(--muted)]">{i + 1}</span>
                        {name}
                      </span>
                      <span className="tabular shrink-0 text-brass-lit">{qty}</span>
                    </li>
                  ))}
                </ol>
              )}
            </div>

            <Availability />
          </aside>
        </div>
      </main>
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-[var(--bg)] p-5">
      <p className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--muted)]">{label}</p>
      <p className={`tabular mt-2 text-2xl ${accent ? 'text-brass-lit' : ''}`}>{value}</p>
    </div>
  );
}

function OrderCard({
  order,
  fresh,
  onAdvance,
}: {
  order: LiveOrder;
  fresh: boolean;
  onAdvance: () => void;
}) {
  const next = NEXT[order.status];
  const tone: Record<string, string> = {
    received: 'border-brass/60',
    preparing: 'border-amber-500/50',
    ready: 'border-emerald-500/50',
  };

  return (
    <article
      className={`rounded-lg border bg-[var(--card)] p-5 transition-shadow ${tone[order.status] ?? 'border-[var(--line)]'} ${
        fresh ? 'shadow-[0_0_0_2px_var(--color-brass)]' : ''
      }`}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div className="flex items-baseline gap-3">
          <span className="display text-2xl">Table {order.table_label}</span>
          {/* Optional, and only when the guest typed one. The table is the identity —
              this is so the counter can call the order out by name. */}
          {order.customer_name && (
            <span className="text-[0.82rem] text-[var(--fg)]">{order.customer_name}</span>
          )}
          <span className="tabular text-[0.72rem] text-[var(--muted)]">{order.order_number}</span>
        </div>
        <span className="tabular text-brass-lit">{money(order.total)}</span>
      </div>

      <ul className="mt-3 space-y-1.5 border-t border-[var(--line)] pt-3">
        {order.items.map((i) => (
          <li key={i.id} className="text-[0.86rem]">
            <span className="tabular me-2 text-brass-lit">{i.quantity}×</span>
            {i.name_en}
            {i.modifiers.length > 0 && (
              <span className="ms-2 text-[0.75rem] text-[var(--muted)]">
                {i.modifiers.map((m) => m.name_en).join(' · ')}
              </span>
            )}
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-4">
        <span className="text-[0.72rem] uppercase tracking-[0.14em] text-[var(--muted)]">
          {order.status}
        </span>
        {next && (
          <button
            type="button"
            onClick={onAdvance}
            className="rounded-full bg-brass px-5 py-2 text-[0.78rem] text-bone transition-colors hover:bg-brass-lit"
          >
            {next.label}
          </button>
        )}
      </div>
    </article>
  );
}

/** Sold-out toggle. The customer menu reflects it on next load, with no developer involved. */
function Availability() {
  const [items, setItems] = useState<{ id: string; name_en: string; is_available: boolean }[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    const { data } = await getBrowserClient()
      .from('menu_items')
      .select('id, name_en, is_available')
      .order('name_en');
    setItems((data ?? []) as { id: string; name_en: string; is_available: boolean }[]);
  };

  useEffect(() => {
    load();
  }, []);

  /**
   * Goes through a Server Action rather than straight to PostgREST, so the write and
   * the cache invalidation happen in one place. A direct write here would leave the
   * public menu serving a sold-out item until its cache expired.
   */
  const toggle = async (id: string, next: boolean) => {
    setBusy(id);
    setItems((c) => c.map((i) => (i.id === id ? { ...i, is_available: next } : i)));

    const token = await currentAccessToken();
    const result = token
      ? await setItemAvailability(token, id, next)
      : ({ ok: false, error: 'Your session has expired. Please sign in again.' } as const);

    if (!result.ok) {
      setError(result.error);
      load(); // resync from the server; the optimistic flip was wrong
    } else {
      setError(null);
    }
    setBusy(null);
  };

  const shown = query
    ? items.filter((i) => i.name_en.toLowerCase().includes(query.toLowerCase()))
    : items.filter((i) => !i.is_available);

  return (
    <div className="mt-6 rounded-lg border border-[var(--line)] p-5">
      <p className="eyebrow">Availability</p>
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search to mark sold out…"
        className="mt-3 w-full rounded-lg border border-[var(--line)] bg-transparent px-3.5 py-2.5 text-[0.82rem] placeholder:text-[var(--muted)]/60 focus:border-brass focus:outline-none"
      />
      {/* A refused write used to fail into console.error only, so the toggle silently
          snapped back with no explanation. RLS refusals are the expected case for a
          staff-role account and deserve a sentence. */}
      {error && (
        <p role="alert" className="mt-3 text-[0.8rem] text-red-400">
          {error}
        </p>
      )}
      <ul className="mt-3 max-h-72 space-y-1 overflow-y-auto">
        {shown.length === 0 && (
          <li className="py-3 text-[0.8rem] text-[var(--muted)]">
            {query ? 'No matches.' : 'Everything is available.'}
          </li>
        )}
        {shown.map((i) => (
          <li key={i.id} className="flex items-center justify-between gap-3 py-1.5">
            <span className={`truncate text-[0.82rem] ${i.is_available ? '' : 'text-[var(--muted)]'}`}>
              {i.name_en}
            </span>
            <button
              type="button"
              disabled={busy === i.id}
              onClick={() => toggle(i.id, !i.is_available)}
              aria-label={`${i.is_available ? 'Mark sold out' : 'Mark available'}: ${i.name_en}`}
              className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                i.is_available ? 'bg-emerald-500/80' : 'bg-white/15'
              }`}
            >
              <span
                className={`absolute top-0.5 h-4 w-4 rounded-full bg-bone transition-all ${
                  i.is_available ? 'start-[18px]' : 'start-0.5'
                }`}
              />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
