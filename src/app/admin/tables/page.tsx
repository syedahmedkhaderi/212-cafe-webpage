'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import { AdminShell, SignOutButton } from '@/components/admin/AdminShell';
import { currentAccessToken, getBrowserClient } from '@/lib/supabase/client';
import { rotateTableToken } from '../actions';
import { SITE_URL, isLocalOrigin, orderUrl } from '@/lib/site-url';

type TableRow = {
  id: string;
  label: string;
  seats: number;
  state: 'available' | 'occupied' | 'disabled';
  token: string | null;
  qr: string | null;
};

export default function TablesPage() {
  return (
    <AdminShell title="Tables & QR codes" allow={['owner', 'admin', 'manager']}>
      {() => <Tables />}
    </AdminShell>
  );
}

function Tables() {
  const [rows, setRows] = useState<TableRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const supabase = getBrowserClient();
    const [tables, tokens] = await Promise.all([
      supabase.from('cafe_tables').select('id,label,seats,state').order('sort_order'),
      // manager-only under RLS; a staff/kitchen account gets nothing here
      supabase.from('table_qr_tokens').select('token,table_id').eq('is_active', true),
    ]);

    const tokenByTable = new Map(
      ((tokens.data ?? []) as { token: string; table_id: string }[]).map((t) => [t.table_id, t.token]),
    );

    const shaped: TableRow[] = await Promise.all(
      ((tables.data ?? []) as Omit<TableRow, 'token' | 'qr'>[]).map(async (t) => {
        const token = tokenByTable.get(t.id) ?? null;
        let qr: string | null = null;
        if (token) {
          qr = await QRCode.toDataURL(orderUrl(token), {
            width: 512,
            margin: 1,
            color: { dark: '#14110f', light: '#ffffff' },
            errorCorrectionLevel: 'M',
          });
        }
        return { ...t, token, qr };
      }),
    );

    setRows(shaped);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Rotating a token invalidates any printed code immediately — the reason tokens
   *  are rows rather than a column on the table. */
  const rotate = async (tableId: string) => {
    const token = await currentAccessToken();
    if (!token) {
      setError('Your session has expired. Please sign in again.');
      return;
    }
    // Revoke-then-issue is one Server Action, so a half-completed rotation — token
    // revoked, replacement never issued, printed QR code silently dead — is reported
    // rather than passing for success.
    const result = await rotateTableToken(token, tableId);
    setError(result.ok ? null : result.error);
    load();
  };

  return (
    <div data-surface="dark" className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="border-b border-[var(--line)] print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <span className="display text-2xl">212</span>
            <span className="eyebrow">Tables &amp; QR</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/admin"
              className="rounded-full border border-[var(--line)] px-4 py-2 text-[0.75rem] transition-colors hover:border-brass hover:text-brass"
            >
              Dashboard
            </Link>
            <button
              type="button"
              onClick={() => window.print()}
              className="rounded-full bg-brass px-4 py-2 text-[0.75rem] text-bone"
            >
              Print all
            </button>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-8">
        <p className="max-w-lg text-sm text-[var(--muted)] print:hidden">
          Each table has its own opaque token. Print these, put one on each table, and a guest
          who scans it lands straight in the ordering app — no app to install, no account.
        </p>

        {/* A QR built against localhost is unreachable from a phone. Say so loudly
            rather than letting someone print a sheet of dead codes. */}
        {isLocalOrigin && (
          <p
            role="alert"
            className="mt-5 max-w-lg rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-[0.82rem] text-amber-200 print:hidden"
          >
            These codes point at <span className="tabular">{SITE_URL}</span>, which a phone
            cannot reach. Set <span className="tabular">NEXT_PUBLIC_SITE_URL</span> to the
            deployed origin before printing.
          </p>
        )}

        {error && (
          <p
            role="alert"
            className="mt-5 max-w-lg rounded-lg border border-red-500/40 bg-red-500/10 px-4 py-3 text-[0.82rem] text-red-200 print:hidden"
          >
            {error}
          </p>
        )}

        {loading && <p className="mt-8 text-sm text-[var(--muted)]">Loading…</p>}

        <div className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((t) => (
            <article
              key={t.id}
              className="break-inside-avoid rounded-lg border border-[var(--line)] bg-[var(--card)] p-6 text-center print:border-black print:bg-white print:text-black"
            >
              <p className="eyebrow print:text-black">212 Café</p>
              <p className="display mt-1 text-4xl">Table {t.label}</p>

              {t.qr ? (
                // eslint-disable-next-line @next/next/no-img-element -- data: URI generated client-side
                <img
                  src={t.qr}
                  alt={`QR code for table ${t.label}`}
                  className="mx-auto mt-4 h-44 w-44 rounded bg-white p-2"
                />
              ) : (
                <p className="mt-6 text-[0.78rem] text-[var(--muted)]">
                  No active token (managers only).
                </p>
              )}

              <p className="mt-3 text-[0.78rem] text-[var(--muted)] print:text-black">
                Scan to order
              </p>

              <div className="mt-4 print:hidden">
                <p className="tabular truncate text-[0.62rem] text-[var(--muted)]/70">
                  {t.token ? `${SITE_URL}/order/${t.token.slice(0, 10)}…` : '—'}
                </p>
                <button
                  type="button"
                  onClick={() => rotate(t.id)}
                  className="mt-3 rounded-full border border-[var(--line)] px-4 py-1.5 text-[0.72rem] transition-colors hover:border-brass hover:text-brass"
                >
                  Rotate token
                </button>
              </div>
            </article>
          ))}
        </div>
      </main>
    </div>
  );
}
