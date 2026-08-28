/**
 * The canonical absolute origin for this deployment.
 *
 * QR codes, canonical URLs and JSON-LD must all use this rather than
 * `window.location.origin`. A QR generated from a localhost admin session encodes
 * `http://localhost:3000/order/…`, which no phone can reach, so printing those would
 * break the demo at the moment the owner scans one.
 *
 * Both variables are read as full literal `process.env.X` expressions. Next inlines
 * NEXT_PUBLIC_* by textual substitution at build time, so destructuring them or
 * indexing `process.env` dynamically yields undefined in the browser bundle.
 */
const explicitOrigin = process.env.NEXT_PUBLIC_SITE_URL?.trim();

/**
 * ⚠ SERVER ONLY. `VERCEL_PROJECT_PRODUCTION_URL` has no NEXT_PUBLIC_ prefix, so Next
 * does NOT inline it into the client bundle and it is `undefined` in the browser.
 *
 * `/admin/tables` is a client component and imports SITE_URL to build the printable QR
 * codes. Relying on this fallback alone therefore produces a green build and a deployed
 * site whose QR codes encode `http://localhost:3000/t/<token>` — unscannable from any
 * phone, discovered only once a sheet of them has been printed. Verified by building
 * with NEXT_PUBLIC_SITE_URL empty: the emitted chunk contained `localhost:3000` and not
 * the deployment host.
 *
 * So NEXT_PUBLIC_SITE_URL is REQUIRED in any real deployment. This fallback only keeps
 * server-rendered metadata sane if someone forgets; `isLocalOrigin` is what actually
 * catches the mistake, by showing the warning banner on /admin/tables.
 */
const vercelHost = process.env.VERCEL_PROJECT_PRODUCTION_URL?.trim();

/**
 * `||`, NOT `??`.
 *
 * A variable that exists in a hosting dashboard with an empty value arrives as an empty
 * STRING, not as undefined. `??` treats that as a real answer, so every fallback below
 * is skipped and SITE_URL becomes ''. `new URL('')` then throws `Invalid URL` while
 * Next collects page configuration, which fails the entire build in layout.tsx with a
 * stack that points nowhere near the dashboard field that actually caused it. `||`
 * treats empty as absent, which is what "unset" means to the person typing it.
 */
const configuredOrigin =
  explicitOrigin || (vercelHost ? `https://${vercelHost}` : '') || 'http://localhost:3000';

/**
 * A bare hostname is the other way this throws: `212-cafe.vercel.app` copied out of a
 * dashboard has no scheme, and `new URL()` rejects it. Anything deployed is HTTPS, so
 * assume that rather than failing the build over a missing prefix.
 */
const normalisedOrigin = /^https?:\/\//i.test(configuredOrigin)
  ? configuredOrigin
  : `https://${configuredOrigin}`;

export const SITE_URL = normalisedOrigin.replace(/\/$/, '');

/**
 * Fail here, not 40 frames deep in `metadataBase`. Anything still unparseable at this
 * point is a malformed value rather than a missing one, and the one thing the build log
 * must contain is the value itself.
 */
try {
  new URL(SITE_URL);
} catch {
  throw new Error(
    `NEXT_PUBLIC_SITE_URL is not a valid absolute origin (received: ${JSON.stringify(
      explicitOrigin ?? vercelHost ?? '',
    )}). Set it to the full deployed origin, scheme included, e.g. https://212-cafe.vercel.app.`,
  );
}

export const isLocalOrigin = /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])/.test(SITE_URL);

export const orderUrl = (token: string) => `${SITE_URL}/order/${token}`;

/**
 * What a table's QR code actually encodes.
 *
 * `/t/<token>` validates the token, drops it in a cookie and redirects to the
 * shopfront, so a guest who scans arrives at the hero and can order from anywhere on
 * the site rather than being dropped straight into the ordering app. `/order/<token>`
 * is kept and still works — it is the direct link, and what staff use to preview a
 * table.
 */
export const tableEntryUrl = (token: string) => `${SITE_URL}/t/${token}`;
