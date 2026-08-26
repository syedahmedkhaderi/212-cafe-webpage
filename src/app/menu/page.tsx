import type { Metadata } from 'next';
import Link from 'next/link';
import { getBusiness, getMenu } from '@/lib/menu/queries';
import { MenuBrowser } from '@/components/marketing/MenuBrowser';
import { SiteFooter } from '@/components/marketing/SiteChrome';

export const revalidate = 300;

export const metadata: Metadata = {
  title: 'Menu',
  description:
    'The full 212 Café menu — specialty coffee, cold drinks, desserts, brunch, salads and sandwiches, on the 30th floor in Lusail.',
  alternates: { canonical: '/menu' },
};

export default async function MenuPage() {
  const [{ categories, items }, { settings }] = await Promise.all([getMenu(), getBusiness()]);

  return (
    <>
      <header className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg)]/92 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-4 sm:px-8">
          <Link href="/" className="display text-2xl leading-none">
            212
          </Link>
          <Link
            href="/"
            className="text-[0.8rem] text-[var(--muted)] transition-colors hover:text-brass"
          >
            ← Back
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-8">
        <MenuBrowser categories={categories} items={items} />
      </main>

      {settings && (
        <SiteFooter phone={settings.phone} email={settings.email} instagram={settings.instagram} />
      )}
    </>
  );
}
