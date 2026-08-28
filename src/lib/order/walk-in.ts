import { unstable_cache } from 'next/cache';
import { resolveTableToken } from './table';

/**
 * Ordering without a table, for guests who never scanned anything.
 *
 * `place_order` requires a valid table token and that requirement is what stops a
 * stranger ordering against someone else's table, so it is not relaxed. Instead
 * migration 0012 adds a real `cafe_tables` row labelled 'Online' with its own active
 * token, and this module hands that token to the ordering UI when there is no table
 * cookie. Every guard downstream — real prices from the menu, modifier rules,
 * idempotency, rate limiting — applies exactly as it does for a scanned table.
 *
 * Server-only, deliberately: no NEXT_PUBLIC_ prefix. The value still reaches the
 * browser, because the browser is what calls `place_order`, but it gets there through
 * the server render as a prop — the same path a scanned table's token already takes,
 * and the same reason TABLE_COOKIE is httpOnly.
 *
 * Unset, this returns null and ordering simply stays QR-only. That is the safe
 * direction: a missing variable removes a feature rather than opening a hole.
 */
const WALK_IN_TOKEN = process.env.WALK_IN_TABLE_TOKEN?.trim() ?? '';

async function fetchWalkInTable(): Promise<{ token: string; label: string } | null> {
  if (!WALK_IN_TOKEN) return null;

  // Resolved rather than trusted, so revoking the token in /admin/tables switches
  // online ordering off without a redeploy. That is the intended off switch.
  const table = await resolveTableToken(WALK_IN_TOKEN);
  if (!table) {
    console.error('[212] WALK_IN_TABLE_TOKEN is set but does not resolve; online ordering is off');
    return null;
  }

  return { token: WALK_IN_TOKEN, label: table.label };
}

/**
 * Cached, and that matters more than it looks.
 *
 * `currentTable()` used to return null for anyone without a cookie WITHOUT touching the
 * database, which is most visitors. Falling back to a walk-in token would otherwise add
 * a query to every anonymous view of two `force-dynamic` pages. Five minutes is short
 * enough that revoking the token takes effect while the owner is still watching.
 */
export const getWalkInTable = unstable_cache(fetchWalkInTable, ['walk-in-table'], {
  revalidate: 300,
});
