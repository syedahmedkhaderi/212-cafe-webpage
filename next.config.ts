import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  images: {
    /**
     * Next 16 changed the default from "any quality" to exactly `[75]`, and silently
     * coerces any other `quality` prop to the nearest allowed value. The hero is the
     * first thing anyone sees and is the one place worth spending bytes on, so 85 has
     * to be declared here or the `quality={85}` on it would quietly become 75.
     */
    qualities: [75, 85],
    /**
     * Next 16 already defaults this to 4 hours (up from 60s). Pinned to 30 days because
     * these are content-addressed build assets that never change in place — a menu
     * photograph is replaced by uploading a new file at a new path, never by editing
     * the bytes behind an existing one.
     */
    minimumCacheTTL: 60 * 60 * 24 * 30,
  },

  async headers() {
    return [
      {
        /**
         * Applied to everything. The CSP itself is NOT here — it carries a per-request
         * nonce and so has to be generated in src/proxy.ts.
         */
        source: '/:path*',
        headers: [
          // Two years, preloadable. Only ever sent over HTTPS, so localhost is unaffected.
          {
            key: 'Strict-Transport-Security',
            value: 'max-age=63072000; includeSubDomains; preload',
          },
          // Stop the browser second-guessing Content-Type — the defence against an
          // uploaded file being re-interpreted as script.
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          // Send the origin cross-site, the full path same-origin. A table token must
          // never leak in a Referer to an external site.
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          // Belt and braces with frame-ancestors 'none', for older browsers.
          { key: 'X-Frame-Options', value: 'DENY' },
          // A café menu needs none of these.
          {
            key: 'Permissions-Policy',
            value: 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), interest-cohort=()',
          },
        ],
      },
      {
        /**
         * Menu and hero photography. These are immutable in the strict sense: the file
         * at a given path is never edited, only superseded. `immutable` means a
         * returning visitor does not even send a revalidation request.
         *
         * ⚠ `:file+`, NOT `:file*`. With `*` the tail matches zero segments, so `/menu`
         * — the HTML page, which shares this prefix — matched too and was served
         * `immutable, max-age=31536000`. A year-long uncacheable-by-anyone-else page
         * that never picks up a price change, and nothing about it is visible until
         * someone complains the site is stale. `+` requires at least one segment, so
         * only real files under the directory match.
         */
        source: '/:dir(menu|hero)/:file+',
        headers: [
          { key: 'Cache-Control', value: 'public, max-age=31536000, immutable' },
        ],
      },
    ];
  },
};

export default nextConfig;
