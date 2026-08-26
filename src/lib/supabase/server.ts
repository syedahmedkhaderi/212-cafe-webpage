import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * Server-side reader. Still the anon key: server rendering the marketing site and the
 * menu needs nothing more than the public menu, and using a privileged key here would
 * mean a template bug could leak orders. See docs/DECISIONS.md.
 */
export function getServerClient(): SupabaseClient {
  return createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
