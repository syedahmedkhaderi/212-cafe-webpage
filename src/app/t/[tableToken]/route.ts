import { NextResponse, type NextRequest } from 'next/server';
import { resolveTableToken } from '@/lib/order/table';
import { TABLE_COOKIE, TABLE_COOKIE_MAX_AGE } from '@/lib/order/table-cookie';

/**
 * What a table's QR code points at.
 *
 * Validate the token, remember it, and send the guest to the shopfront. They read the
 * hero, walk into the menu, and ordering is already switched on because the table came
 * with them — rather than landing cold in an ordering app with no idea what the place
 * is.
 *
 * A Route Handler rather than a page because there is nothing to render: the guest
 * should be looking at the hero, not at a redirect screen.
 *
 * Note it deliberately does NOT call updateTag/refresh — both throw outside a Server
 * Action (docs/DECISIONS.md §11), and there is nothing cached to invalidate here.
 */
export async function GET(request: NextRequest, ctx: RouteContext<'/t/[tableToken]'>) {
  const { tableToken } = await ctx.params;

  // Resolved server-side, exactly as /order/[tableToken] does. The client never gets to
  // decide whether a token is valid, and the cookie is never written from an
  // unvalidated value.
  const table = await resolveTableToken(tableToken);

  const response = NextResponse.redirect(new URL('/', request.url), 307);

  /*
    A 307 carrying Set-Cookie is precisely the response an intermediary will happily
    cache. If it did, the second phone to scan the code would follow the redirect
    without receiving the cookie, land on the hero, and find a read-only menu with
    nothing on screen explaining why. Silent, and only reproducible behind a CDN.
  */
  response.headers.set('Cache-Control', 'no-store');

  if (table) {
    response.cookies.set(TABLE_COOKIE, tableToken, {
      httpOnly: true,
      sameSite: 'lax', // must survive the top-level navigation from the camera app
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: TABLE_COOKIE_MAX_AGE,
    });
  } else {
    // A revoked or misprinted code. Send them to the shopfront anyway — a stale sticker
    // on a table is not a reason to show a guest a 404 — but clear any table they were
    // previously holding rather than leaving them ordering against the wrong one.
    response.cookies.delete(TABLE_COOKIE);
  }

  return response;
}
