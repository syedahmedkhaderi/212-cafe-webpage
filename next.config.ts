import type { NextConfig } from 'next';

/** Supabase Storage host, for admin-uploaded media. Derived, never hard-coded. */
const supabaseHost = process.env.NEXT_PUBLIC_SUPABASE_URL
  ? new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname
  : undefined;

const nextConfig: NextConfig = {
  images: {
    /**
     * Without this, every admin-uploaded image 400s through next/image — the CMS would
     * appear to save correctly and then show broken pictures. Scoped to this project's
     * Storage host and to the public media path, not a wildcard.
     */
    remotePatterns: supabaseHost
      ? [{ protocol: 'https', hostname: supabaseHost, pathname: '/storage/v1/object/public/media/**' }]
      : [],
    /**
     * AVIF first. This is NOT the default — Next 16 negotiates WebP only unless AVIF is
     * listed here, so the hero was being served WebP even to browsers advertising AVIF.
     * On a detailed photograph like the sunset frame that is a large, free saving.
     */
    formats: ['image/avif', 'image/webp'],

    /**
     * 75 only, which is Next's default set.
     *
     * The hero was briefly served at 85 on the reasoning that it is the first thing
     * anyone sees. Measured, that was wrong: the stored master is ALREADY a q84 WebP
     * produced by data/optimize-hero.mjs, so re-encoding it at 85 does not recover
     * detail that is no longer in the file — it just preserves the existing artifacts
     * at a higher bitrate. It cost 44 KB on the largest-contentful-paint image of the
     * whole site (156 KB vs 112 KB at 640px) for no visible difference.
     */
    qualities: [75],
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
          // Two years, preloadable.
          //
          // This IS sent on plain-HTTP responses too — `headers()` is static and cannot
          // see the request scheme. That is harmless because RFC 6797 §8.1 requires a
          // browser to ignore an STS header received over insecure transport, so local
          // HTTP development is unaffected. Do not read that as "the header is only ever
          // sent over HTTPS": believing that about `upgrade-insecure-requests`, which has
          // no such rule, is exactly how the Safari blank-page bug got shipped.
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
