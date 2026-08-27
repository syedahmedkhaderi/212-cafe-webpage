import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '@/lib/site-url';
import { getLocale } from '@/lib/locale-server';
import { isRTL } from '@/lib/i18n';
import { getContentRows, getTheme } from '@/lib/content/queries';
import { CopyProvider } from '@/lib/content/provider';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter', display: 'swap' });

// .display only ever uses 300; carrying 400 and 500 cost bytes nothing rendered.
const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300'],
  variable: '--font-cormorant',
  display: 'swap',
});

// preload: false matters. Preloaded, this shipped ~163 KB to every visitor including
// English ones, and was the single largest asset on the page. Unpreloaded it is fetched
// only when the CSS actually references it — i.e. only in Arabic.
const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '600'],
  variable: '--font-noto-arabic',
  display: 'swap',
  preload: false,
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: '212 Café — Coffee above Lusail',
    template: '%s · 212 Café',
  },
  description:
    'Specialty coffee, desserts and brunch on the 30th floor of Marina Twin Tower A, Lusail. Lusail’s best view.',
  keywords: [
    '212 Café Lusail',
    'cafe in Lusail',
    'specialty coffee Lusail',
    'Lusail Marina cafe',
    'coffee with a view Qatar',
    'brunch Lusail',
    'مقهى لوسيل',
    'قهوة مختصة قطر',
  ],
  openGraph: {
    type: 'website',
    locale: 'en_QA',
    alternateLocale: 'ar_QA',
    siteName: '212 Café',
    title: '212 Café — Coffee above Lusail',
    description: 'Specialty coffee and desserts, 30 floors above Lusail Marina.',
    url: SITE_URL,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
  manifest: '/manifest.webmanifest',
  appleWebApp: { capable: true, title: '212 Café', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f7f4ef' },
    { media: '(prefers-color-scheme: dark)', color: '#14110f' },
  ],
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // lang/dir are set on <html> from the visitor's locale so screen readers, hyphenation
  // and the default text direction are correct before any JavaScript runs.
  const [locale, theme, contentRows] = await Promise.all([
    getLocale(),
    getTheme(),
    getContentRows(),
  ]);

  /**
   * The owner's brand colours, as an override of the design tokens.
   *
   * Only the three base colours are set. `--bg`, `--fg` and the rest are already
   * defined in terms of these in globals.css, so they follow automatically. The two
   * brass variants are derived rather than left behind, so a changed accent stays
   * coherent instead of half-applied.
   *
   * Every value has been through a `^#[0-9a-f]{6}$` check in both the Server Action and
   * a database CHECK constraint before it can reach this string — which matters, because
   * this is interpolated into a stylesheet.
   *
   * ⚠ The default palette is the one whose contrast was measured (brass-ink is 5.03:1 on
   * the light card; the lighter brass is 3.44:1 and fails AA for body text). A markedly
   * different brass will not automatically satisfy that, and re-checking contrast is not
   * something this can do for the owner.
   */
  const themeCss = `:root{--color-ink:${theme.brand_ink};--color-bone:${theme.brand_bone};--color-brass:${theme.brand_brass};--color-brass-lit:color-mix(in oklab,${theme.brand_brass} 74%,white);--color-brass-ink:color-mix(in oklab,${theme.brand_brass} 88%,black);}`;

  return (
    <html
      lang={locale}
      dir={isRTL(locale) ? 'rtl' : 'ltr'}
      className={`${inter.variable} ${cormorant.variable} ${notoArabic.variable}`}
    >
      <head>
        <style dangerouslySetInnerHTML={{ __html: themeCss }} />
      </head>
      <body>
        <CopyProvider rows={contentRows} locale={locale}>
          {children}
        </CopyProvider>
      </body>
    </html>
  );
}
