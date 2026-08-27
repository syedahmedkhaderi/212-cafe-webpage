import { NextResponse, type NextRequest } from 'next/server';

/**
 * Content Security Policy, with a per-request nonce.
 *
 * `proxy.ts` is the Next 16 name for what used to be `middleware.ts`.
 *
 * A naive CSP breaks three specific things in this app, each of which fails in a way
 * that is easy to miss, so each directive below is here for a reason:
 *
 *   • `connect-src` must include **wss://*.supabase.co**. Realtime is a WebSocket, and
 *     a blocked socket does not throw — the staff dashboard simply stops updating
 *     itself, silently. That is the moment the whole pitch is built around, and it
 *     would look like the feature was never built.
 *
 *   • `img-src` must include **data:**. The printable table QR codes are generated in
 *     the browser as data: URIs; without this every code on /admin/tables renders blank
 *     and a sheet of dead codes gets printed.
 *
 *   • `style-src` needs **'unsafe-inline'**. Not laziness: a nonce cannot authorise an
 *     inline style ATTRIBUTE, and this page uses `style={{ animationDelay }}` for the
 *     hero reveal. CSP3 would let us scope that to `style-src-attr`, but next/font also
 *     injects its own inline <style> block for the @font-face declarations. Style
 *     injection is a far smaller risk than script injection, and scripts stay locked to
 *     the nonce.
 *
 * next/font self-hosts (the fonts are served from /_next/static/media/), so no Google
 * Fonts origin is needed — dropping it tightens the policy rather than loosening it.
 *
 * The fourth thing a naive CSP breaks is `upgrade-insecure-requests`, which is a
 * property of the ORIGIN rather than of the app — see isInsecureLocalOrigin below.
 */

/**
 * Is this request being served over plain HTTP from a machine on the local network?
 *
 * This is the one condition under which `upgrade-insecure-requests` is wrong, and it is
 * NOT the same question as "is this a development build". `./start.sh` with no argument
 * does a production build and serves it on http://localhost:3000, so a NODE_ENV check
 * says "production", sends the directive, and Safari then rewrites every /_next/ asset
 * to https://localhost:3000 — where nothing is listening — and renders the page as bare
 * unstyled HTML with broken images. Chrome exempts loopback from the upgrade, so the
 * same build looks perfect there. That divergence is what makes this bug survive review.
 *
 * The LAN ranges matter as much as loopback: this is a phone-first site, and the way you
 * check it on a phone is http://192.168.x.x:3000 or http://my-mac.local:3000 from iOS
 * Safari — the exact same failure, on the exact device the site is designed for.
 *
 * Deliberately fail-safe in the other direction: anything we cannot positively identify
 * as an insecure local origin keeps the directive. A hostname we do not recognise is
 * assumed to be a real deployment, so the worst case is a redundant upgrade on a site
 * already served over TLS, never a silently dropped directive in production.
 */
function isInsecureLocalOrigin(request: NextRequest): boolean {
  // A load balancer that terminates TLS reports the original scheme here. It is a
  // comma-separated list when the request crossed more than one hop; the client's own
  // scheme is the first entry.
  const forwardedProto = request.headers.get('x-forwarded-proto')?.split(',')[0]?.trim().toLowerCase();

  if (forwardedProto) {
    if (forwardedProto === 'https') return false;
  } else if (request.nextUrl.protocol === 'https:') {
    // No proxy in front, so the connection Next itself accepted is the whole story —
    // `next dev --experimental-https` lands here and correctly keeps the upgrade.
    return false;
  }

  // Strip the port, and the brackets an IPv6 literal carries in a Host header.
  const host = (request.headers.get('host') ?? '')
    .toLowerCase()
    .replace(/:\d+$/, '')
    .replace(/^\[|\]$/g, '');

  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '::1' ||
    // mDNS. How a phone on the same Wi-Fi reaches this laptop.
    host.endsWith('.local') ||
    /^127\./.test(host) ||
    // RFC 1918: the address a router hands this machine on a home or café network.
    /^10\./.test(host) ||
    /^192\.168\./.test(host) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(host)
  );
}

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';
  const insecureLocal = isInsecureLocalOrigin(request);

  // The Supabase project origin, so the policy does not have to trust every *.supabase.co.
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const supabaseHost = supabaseUrl.replace(/^https?:\/\//, '');
  const supabaseHttp = supabaseHost ? `https://${supabaseHost}` : '';
  const supabaseWs = supabaseHost ? `wss://${supabaseHost}` : '';

  const csp = [
    `default-src 'self'`,
    // 'strict-dynamic' lets Next's nonce'd bootstrap load the rest of the bundle.
    // 'unsafe-eval' is required in dev only — React uses eval to rebuild server error
    // stacks in the browser. Neither React nor Next uses it in production.
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ''}`,
    `style-src 'self' 'unsafe-inline'`,
    // data: for the QR codes; the Supabase origin for admin-uploaded media later.
    `img-src 'self' data: blob: ${supabaseHttp}`.trim(),
    `font-src 'self'`,
    `connect-src 'self' ${supabaseHttp} ${supabaseWs}`.trim(),
    `object-src 'none'`,
    `base-uri 'self'`,
    // Server Actions post back to this origin; without this they are blocked.
    `form-action 'self'`,
    `frame-ancestors 'none'`,
    // Reissue every subresource request over HTTPS. Right on the deployed site; wrong
    // on any origin that has no TLS listener to be upgraded to. Gated on the request,
    // not on NODE_ENV — see isInsecureLocalOrigin above for why that distinction is the
    // whole bug.
    ...(insecureLocal ? [] : [`upgrade-insecure-requests`]),
  ].join('; ');

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export const config = {
  /**
   * Skip static assets and the image optimiser: they are not documents, cannot execute
   * anything, and generating a nonce per image request is wasted work on the hot path.
   */
  matcher: [
    {
      source: '/((?!_next/static|_next/image|favicon.ico).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
