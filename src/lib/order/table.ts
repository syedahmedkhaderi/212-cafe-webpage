import { getServerClient } from '@/lib/supabase/server';

export type ResolvedTable = { label: string; seats: number };

/**
 * Turns the opaque QR token into a table, server-side.
 *
 * The incumbent's QR carried `?table_id=12` — a sequential integer anyone could edit to
 * order against a stranger's table. Here the token is 128 random bits, the mapping is
 * resolved in the database, and a revoked token stops working immediately.
 */
export async function resolveTableToken(token: string): Promise<ResolvedTable | null> {
  // Cheap shape check before touching the network: tokens are 32 hex characters.
  if (!/^[0-9a-f]{32}$/i.test(token)) return null;

  const supabase = getServerClient();
  const { data, error } = await supabase.rpc('resolve_table_token', { p_token: token });

  if (error) {
    console.error('[212] table token resolution failed', error.message);
    return null;
  }
  if (!data || typeof data !== 'object' || !('label' in data)) return null;

  return { label: String(data.label), seats: Number(data.seats ?? 2) };
}
