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
 */
export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const isDev = process.env.NODE_ENV === 'development';

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
    `upgrade-insecure-requests`,
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
