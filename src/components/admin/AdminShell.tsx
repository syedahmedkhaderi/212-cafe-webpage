'use client';

import { useState } from 'react';
import { getBrowserClient } from '@/lib/supabase/client';
import { useStaffSession, type StaffRole } from './useStaffSession';

/** Wraps every admin surface: handles sign-in, and refuses anyone without a staff row. */
export function AdminShell({
  title,
  allow,
  children,
}: {
  title: string;
  allow?: StaffRole[];
  children: (ctx: { role: StaffRole; fullName: string }) => React.ReactNode;
}) {
  const { loading, session, role, fullName } = useStaffSession();

  if (loading) {
    return (
      <Frame>
        <p className="text-sm text-[var(--muted)]">Loading…</p>
      </Frame>
    );
  }

  if (!session) return <SignIn title={title} />;

  if (!role) {
    return (
      <Frame>
        <h1 className="display text-3xl">No access</h1>
        <p className="mt-3 max-w-sm text-sm text-[var(--muted)]">
          This account is signed in but is not a member of staff. Ask an owner to add it.
        </p>
        <SignOutButton />
      </Frame>
    );
  }

  if (allow && !allow.includes(role)) {
    return (
      <Frame>
        <h1 className="display text-3xl">Not permitted</h1>
        <p className="mt-3 max-w-sm text-sm text-[var(--muted)]">
          Your role ({role}) does not have access to {title}.
        </p>
        <SignOutButton />
      </Frame>
    );
  }

  return <>{children({ role, fullName })}</>;
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div
      data-surface="dark"
      className="grid min-h-screen place-items-center bg-[var(--bg)] px-6 text-[var(--fg)]"
    >
      <div className="w-full max-w-sm text-center">{children}</div>
    </div>
  );
}

export function SignOutButton() {
  return (
    <button
      type="button"
      onClick={() => getBrowserClient().auth.signOut()}
      className="mt-8 rounded-full border border-[var(--line)] px-5 py-2.5 text-[0.78rem] transition-colors hover:border-brass hover:text-brass"
    >
      Sign out
    </button>
  );
}

function SignIn({ title }: { title: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { error: signInError } = await getBrowserClient().auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    // Deliberately vague: never reveal whether an address exists.
    if (signInError) setError('Those details did not work. Please try again.');
    setBusy(false);
  };

  return (
    <Frame>
      <p className="display text-3xl">212</p>
      <p className="eyebrow mt-2">{title}</p>

      <form onSubmit={submit} className="mt-8 space-y-3 text-start">
        <label className="block">
          <span className="text-[0.78rem] text-[var(--muted)]">Email</span>
          <input
            type="email"
            required
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-[var(--line)] bg-transparent px-4 py-3 text-[0.9rem] focus:border-brass focus:outline-none"
          />
        </label>
        <label className="block">
          <span className="text-[0.78rem] text-[var(--muted)]">Password</span>
          <input
            type="password"
            required
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1.5 w-full rounded-lg border border-[var(--line)] bg-transparent px-4 py-3 text-[0.9rem] focus:border-brass focus:outline-none"
          />
        </label>

        {error && (
          <p role="alert" className="text-[0.8rem] text-red-400">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-full bg-brass px-6 py-3.5 text-[0.85rem] text-bone disabled:opacity-50"
        >
          {busy ? 'Signing in…' : 'Sign in'}
        </button>
      </form>
    </Frame>
  );
}
