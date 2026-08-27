import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!url || !anonKey) {
  throw new Error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY. Copy .env.example to .env.local.',
  );
}

export const SUPABASE_URL = url;
export const SUPABASE_ANON_KEY = anonKey;

/**
 * The anon key is public by design — it ships to every phone that scans a QR code.
 * Everything it may do is bounded by RLS and by the two SECURITY DEFINER functions
 * (`place_order`, `get_order_status`). There is deliberately no service-role client
 * anywhere in this app; see docs/DECISIONS.md.
 */
let browserClient: SupabaseClient | undefined;

export function getBrowserClient(): SupabaseClient {
  browserClient ??= createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return browserClient;
}

/**
 * The current access token, for forwarding to a Server Action.
 *
 * Read fresh at call time rather than captured from a render: `getSession()` refreshes
 * an expired token first, so a manager who left the dashboard open over lunch does not
 * get a silent RLS refusal on their next click.
 */
export async function currentAccessToken(): Promise<string | null> {
  const { data } = await getBrowserClient().auth.getSession();
  return data.session?.access_token ?? null;
}
