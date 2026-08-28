import { cookies } from 'next/headers';
import { resolveTableToken } from './table';
import { getWalkInTable } from './walk-in';

/**
 * The guest's table, carried from the QR scan.
 *
 * The QR encodes `/t/<token>`, which validates the token and writes it here as an
 * httpOnly cookie. Pages then read it server-side and hand the token to their client
 * component — the same shape as `/order/[tableToken]/page.tsx`, which takes the token
 * from the route and passes it down as a prop.
 *
 * httpOnly is deliberate. The browser needs the token to call `place_order`, but it
 * gets it from the server render rather than from `document.cookie`, so a script
 * injected into the page cannot read a table's credential out of the jar.
 */
export const TABLE_COOKIE = '212_table';

/** A dining session. Long enough for a long brunch, short enough that a phone left on
 *  a table does not stay authorised to order against it tomorrow. */
export const TABLE_COOKIE_MAX_AGE = 60 * 60 * 4;

/**
 * `kind` is what the UI needs to tell two very different guests apart:
 *
 *   'table'   — scanned the code at seat 07. Their order goes to that table.
 *   'walk_in' — never scanned anything. Ordering is still open to them, but nobody
 *               knows where to bring it, so the UI must ask rather than announce
 *               "You're at Table 07".
 */
export type CurrentTable = { token: string; label: string; kind: 'table' | 'walk_in' };

export async function currentTable(): Promise<CurrentTable | null> {
  const token = (await cookies()).get(TABLE_COOKIE)?.value;

  if (token) {
    // Re-resolved on every render rather than trusted from the cookie, so a token the
    // manager rotates or revokes stops working on the guest's next page load instead of
    // when the cookie happens to expire.
    const table = await resolveTableToken(token);
    if (table) return { token, label: table.label, kind: 'table' };
  }

  /*
    No table, but ordering is no longer QR-only: fall back to the 'Online' table from
    migration 0012 so the shopfront and the menu can take an order from someone who
    walked past the window.

    This used to return null here without touching the database. That fast path is
    preserved by getWalkInTable() being cached, so the common case is a cache read
    rather than a query on every anonymous view of a force-dynamic page.
  */
  const walkIn = await getWalkInTable();
  if (!walkIn) return null;

  return { token: walkIn.token, label: walkIn.label, kind: 'walk_in' };
}
