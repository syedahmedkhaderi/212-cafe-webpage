'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { getBrowserClient } from '@/lib/supabase/client';

export type StaffRole = 'owner' | 'admin' | 'manager' | 'staff' | 'kitchen';

export type StaffSession = {
  loading: boolean;
  session: Session | null;
  role: StaffRole | null;
  fullName: string;
};

/**
 * Resolves the signed-in user's staff row. The role returned here drives what the UI
 * offers — but it is never the security boundary: every table is guarded by RLS, so a
 * tampered client simply gets zero rows back. See tests/staff-rls.test.mjs.
 */
export function useStaffSession(): StaffSession {
  const [state, setState] = useState<StaffSession>({
    loading: true,
    session: null,
    role: null,
    fullName: '',
  });

  /**
   * Idle timeout.
   *
   * An admin tablet left on the pass in a busy café is signed in to the whole dashboard.
   * After 30 minutes without any interaction the session is ended, so walking away is
   * not the same as handing over the till.
   *
   * This is defence in depth and not a security boundary — it runs in the browser, and a
   * determined holder of the device could stop it. RLS is what actually decides what a
   * session may do. It closes the ordinary case: an unattended screen.
   */
  useEffect(() => {
    if (!state.session) return;

    const IDLE_MS = 30 * 60 * 1000;
    let timer: ReturnType<typeof setTimeout>;

    const reset = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        console.info('[212] signed out after 30 minutes idle');
        getBrowserClient().auth.signOut();
      }, IDLE_MS);
    };

    const events = ['pointerdown', 'keydown', 'visibilitychange'] as const;
    for (const e of events) window.addEventListener(e, reset, { passive: true });
    reset();

    return () => {
      clearTimeout(timer);
      for (const e of events) window.removeEventListener(e, reset);
    };
  }, [state.session]);

  useEffect(() => {
    const supabase = getBrowserClient();
    let alive = true;

    const resolve = async (session: Session | null) => {
      if (!session) {
        if (alive) setState({ loading: false, session: null, role: null, fullName: '' });
        return;
      }
      const { data } = await supabase
        .from('staff')
        .select('role, full_name')
        .eq('id', session.user.id)
        .maybeSingle();

      if (!alive) return;
      setState({
        loading: false,
        session,
        role: (data?.role as StaffRole) ?? null,
        fullName: data?.full_name ?? session.user.email ?? '',
      });
    };

    supabase.auth.getSession().then(({ data }) => resolve(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => resolve(session));

    return () => {
      alive = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  return state;
}
