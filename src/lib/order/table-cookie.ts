import { cookies } from 'next/headers';
import { resolveTableToken } from './table';

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

export type CurrentTable = { token: string; label: string };

export async function currentTable(): Promise<CurrentTable | null> {
  const token = (await cookies()).get(TABLE_COOKIE)?.value;

  // The common case by far. /menu is a public page that mostly serves people who never
  // scanned anything, and they must not pay for a database round trip to find that out.
  if (!token) return null;

  // Re-resolved on every render rather than trusted from the cookie, so a token the
  // manager rotates or revokes stops working on the guest's next page load instead of
  // when the cookie happens to expire.
  const table = await resolveTableToken(token);
  if (!table) return null;

  return { token, label: table.label };
}
