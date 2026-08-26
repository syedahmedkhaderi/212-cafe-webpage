import type { Metadata, Viewport } from 'next';
import { Cormorant_Garamond, Inter, Noto_Sans_Arabic } from 'next/font/google';
import './globals.css';
import { SITE_URL } from '@/lib/site-url';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const cormorant = Cormorant_Garamond({
  subsets: ['latin'],
  weight: ['300', '400', '500'],
  variable: '--font-cormorant',
  display: 'swap',
});

const notoArabic = Noto_Sans_Arabic({
  subsets: ['arabic'],
  weight: ['400', '500', '600'],
  variable: '--font-noto-arabic',
  display: 'swap',
});

const SITE = SITE_URL;

export const metadata: Metadata = {
  metadataBase: new URL(SITE),
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
  ],
  openGraph: {
    type: 'website',
    locale: 'en_QA',
    alternateLocale: 'ar_QA',
    siteName: '212 Café',
    title: '212 Café — Coffee above Lusail',
    description:
      'Specialty coffee and desserts, 30 floors above Lusail Marina.',
    url: SITE,
  },
  twitter: { card: 'summary_large_image' },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#14110f',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" dir="ltr" className={`${inter.variable} ${cormorant.variable} ${notoArabic.variable}`}>
      <body>{children}</body>
    </html>
  );
}
