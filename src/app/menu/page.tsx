import type { Metadata } from 'next';
import { getBusiness, getMenu } from '@/lib/menu/queries';
import { MenuBrowser } from '@/components/marketing/MenuBrowser';
import { MenuHeader } from '@/components/marketing/MenuHeader';
import { SiteFooter } from '@/components/marketing/SiteChrome';
import { getLocale } from '@/lib/locale-server';
import { currentTable } from '@/lib/order/table-cookie';
import { isRTL } from '@/lib/i18n';

// No ISR: marking an item sold out in admin must show here on the guest's next load,
// not up to five minutes later. Locale also comes from a cookie, and so does the table.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'Menu',
  description:
    'The full 212 Café menu — specialty coffee, cold drinks, desserts, brunch, salads and sandwiches, on the 30th floor in Lusail.',
  alternates: { canonical: '/menu' },
};

export default async function MenuPage() {
  /*
    `currentTable()` is what turns this page from a menu into an ordering surface. It
    returns null the moment there is no table cookie — without touching the database —
    so the overwhelmingly common case, somebody arriving from a search result, costs
    nothing and sees exactly the read-only menu this page has always been.

    It is called here rather than inside getMenu() because it reads cookies, and
    cookies() is not usable inside an unstable_cache scope. getMenu() stays cached and
    tagged; only this is per-request.
  */
  const [{ categories, items }, { settings }, locale, table] = await Promise.all([
    getMenu(),
    getBusiness(),
    getLocale(),
    currentTable(),
  ]);

  const rtl = isRTL(locale);

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} lang={locale}>
      <MenuHeader locale={locale} />

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <MenuBrowser
          categories={categories}
          items={items}
          locale={locale}
          table={table}
          acceptingOrders={settings?.accepting_orders ?? false}
        />
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
