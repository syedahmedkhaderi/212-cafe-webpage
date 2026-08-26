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
