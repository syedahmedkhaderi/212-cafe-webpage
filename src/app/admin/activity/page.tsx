'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { AdminShell, SignOutButton } from '@/components/admin/AdminShell';
import { getBrowserClient } from '@/lib/supabase/client';

type Entry = {
  id: number;
  actor_email: string;
  action: string;
  entity: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  created_at: string;
};

export default function ActivityPage() {
  // Owners and admins only — matches the RLS policy on audit_logs, which is what
  // actually enforces it.
  return (
    <AdminShell title="Activity log" allow={['owner', 'admin']}>
      {() => <Activity />}
    </AdminShell>
  );
}

/** Turns a row into a sentence a café owner would actually read. */
function describe(e: Entry): string {
  const name = (e.after?.name_en ?? e.before?.name_en ?? e.after?.label ?? e.before?.label) as string | undefined;

  switch (e.action) {
    case 'menu_items.price_changed':
      return `changed ${name} from QAR ${e.before?.price} to QAR ${e.after?.price}`;
    case 'menu_items.marked_sold_out':
      return `marked ${name} sold out`;
    case 'menu_items.marked_available':
      return `put ${name} back on the menu`;
    case 'menu_items.created':
      return `added ${name} to the menu`;
    case 'menu_items.deleted':
      return `removed ${name} from the menu`;
    case 'menu_items.updated':
      return `edited ${name}`;
    case 'business_hours.updated':
      return 'changed opening hours';
    case 'business_settings.updated':
      return 'changed business settings';
    case 'orders.cancelled':
      return `cancelled order ${e.after?.order_number}`;
    case 'table_qr_tokens.created':
      return 'issued a new table QR token';
    case 'table_qr_tokens.updated':
      return 'revoked a table QR token';
    case 'staff.created':
      return `added staff member ${e.after?.email}`;
    case 'staff.updated':
      return `updated staff member ${e.after?.email}`;
    default:
      return e.action.replace(/[._]/g, ' ');
  }
}

function Activity() {
  const [entries, setEntries] = useState<Entry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getBrowserClient()
      .from('audit_logs')
      .select('id,actor_email,action,entity,before,after,created_at')
      .order('id', { ascending: false })
      .limit(100)
      .then(({ data }) => {
        setEntries((data ?? []) as Entry[]);
        setLoading(false);
      });
  }, []);

  return (
    <div data-surface="dark" className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="border-b border-[var(--line)]">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <span className="display text-2xl">212</span>
            <span className="eyebrow">Activity</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-full border border-[var(--line)] px-4 py-2 text-[0.75rem] transition-colors hover:border-brass hover:text-brass"
            >
              Dashboard
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-8">
        <p className="max-w-lg text-sm text-[var(--muted)]">
          Every change to the menu, hours, staff and QR tokens, recorded by the database
          itself — not by the app, so it cannot be skipped.
        </p>

        {loading && <p className="mt-8 text-sm text-[var(--muted)]">Loading…</p>}
        {!loading && entries.length === 0 && (
          <p className="mt-8 rounded-lg border border-dashed border-[var(--line)] px-5 py-10 text-center text-sm text-[var(--muted)]">
            Nothing recorded yet. Change a price or mark something sold out.
          </p>
        )}

        <ul className="mt-8 divide-y divide-[var(--line)]">
          {entries.map((e) => (
            <li key={e.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3.5">
              <p className="text-[0.88rem]">
                <span className="text-brass-lit">{e.actor_email || 'system'}</span>{' '}
                <span className="text-[var(--muted)]">{describe(e)}</span>
              </p>
              <time
                dateTime={e.created_at}
                className="tabular shrink-0 text-[0.72rem] text-[var(--muted)]"
              >
                {new Date(e.created_at).toLocaleString('en-GB', {
                  day: '2-digit',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </time>
            </li>
          ))}
        </ul>
      </main>
    </div>
  );
}
