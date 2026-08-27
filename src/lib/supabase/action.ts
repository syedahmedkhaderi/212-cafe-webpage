import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

/**
 * A Supabase client that acts AS the signed-in staff member, for use inside Server
 * Actions.
 *
 * Why the token is forwarded rather than read from a cookie: this app stores its auth
 * session in localStorage via the plain `createClient` (see supabase/client.ts), not in
 * cookies, so nothing server-side can read it. The alternative — migrating to
 * `@supabase/ssr` for cookie-backed sessions — would touch useStaffSession, AdminShell,
 * the Realtime auth in live.ts and all three green browser suites, and would buy nothing
 * that passing the token does not already give us.
 *
 * ⚠ NEVER memoize this client at module scope. `getServerClient()` deliberately
 * constructs a new client per call, and this must too: a cached client carrying an
 * Authorization header would leak one staff member's token into another's request.
 *
 * The token is not trusted here, and does not need to be. Postgres validates the JWT
 * signature and RLS enforces `private.can_manage()`, so a forged or expired token fails
 * at the database rather than in application code. Zod validates SHAPE, never authority.
 */
export function getActionClient(accessToken: string): SupabaseClient {
  return createClient(url, anonKey, {
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
