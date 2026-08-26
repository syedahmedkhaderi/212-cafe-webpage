import type { Metadata } from 'next';
import Link from 'next/link';
import { getBusiness, getMenu } from '@/lib/menu/queries';
import { MenuBrowser } from '@/components/marketing/MenuBrowser';
import { SiteFooter } from '@/components/marketing/SiteChrome';
import { LanguageSwitch } from '@/components/marketing/LanguageSwitch';
import { getLocale } from '@/lib/locale-server';
import { isRTL, translator } from '@/lib/i18n';

// No ISR: marking an item sold out in admin must show here on the guest's next load,
// not up to five minutes later. Locale also comes from a cookie.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Menu',
  description:
    'The full 212 Café menu — specialty coffee, cold drinks, desserts, brunch, salads and sandwiches, on the 30th floor in Lusail.',
  alternates: { canonical: '/menu' },
};

export default async function MenuPage() {
  const [{ categories, items }, { settings }, locale] = await Promise.all([
    getMenu(),
    getBusiness(),
    getLocale(),
  ]);

  const tr = translator(locale);
  const rtl = isRTL(locale);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} lang={locale}>
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg)]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link href="/" className="display text-2xl leading-none">
            212
          </Link>
          <div className="flex items-center gap-4">
            <LanguageSwitch locale={locale} />
            <Link href="/" className="text-[0.8rem] text-[var(--muted)] transition-colors hover:text-brass">
              {rtl ? '→' : '←'} {tr('back')}
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <MenuBrowser categories={categories} items={items} locale={locale} />
      </main>

      {settings && (
        <SiteFooter
          locale={locale}
          phone={settings.phone}
          email={settings.email}
          instagram={settings.instagram}
        />
      )}
    </div>
  );
}
