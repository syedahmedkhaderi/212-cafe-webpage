/**
 * The canonical absolute origin for this deployment.
 *
 * QR codes, canonical URLs and JSON-LD must all use this rather than
 * `window.location.origin`. A QR generated from a localhost admin session encodes
 * `http://localhost:3000/order/…`, which no phone can reach — printing those would
 * break the demo at the moment the owner scans one.
 */
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : 'http://localhost:3000')
).replace(/\/$/, '');

export const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(SITE_URL);

export const orderUrl = (token: string) => `${SITE_URL}/order/${token}`;
