'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Locale } from '@/lib/types';
import { isRTL } from '@/lib/i18n';
import { MAPS_URL } from '@/lib/site';

/**
 * The three things a phone visitor actually wants, within thumb reach.
 *
 * Every primary action on the shopfront lives at the top of the screen — the nav, the
 * language switch, the hero's two buttons once they have scrolled past it. On a phone
 * that is the hardest part of the display to reach one-handed, and this is a site whose
 * visitors are, by design, holding a phone they just scanned a code with.
 *
 * Homepage only. /menu deliberately does not get one: its bottom edge belongs to the
 * cart bar, and two competing fixed bars is worse than either alone.
 *
 * It appears only after the hero has been scrolled past, for two reasons. While the
 * hero is on screen its own buttons are right there, so the bar would be duplicating
 * them; and on a 320×568 phone the hero's content already exceeds the viewport, so a
 * bar pinned over it clipped the opening-hours line rather than helping anyone.
 */
export function MobileActionBar({ locale, phone }: { locale: Locale; phone?: string }) {
  const rtl = isRTL(locale);
  const t = (en: string, ar: string) => (rtl ? ar : en);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const onScroll = () => setShown(window.scrollY > window.innerHeight * 0.75);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  if (!shown) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-40 border-t border-[var(--line)] bg-[var(--bg)]/95 px-3 pt-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] backdrop-blur-md sm:hidden"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <div className="flex items-stretch gap-2">
        <Link
          href="/menu"
          className="flex min-h-12 flex-1 items-center justify-center rounded-full bg-ink px-4 text-[0.78rem] tracking-[0.1em] text-bone uppercase"
        >
          {t('Menu', 'القائمة')}
        </Link>
        {phone && (
          <a
            href={`tel:${phone.replace(/\s/g, '')}`}
            className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-[var(--line)] px-4 text-[0.78rem] tracking-[0.1em] text-[var(--fg)] uppercase"
          >
            {t('Call', 'اتصل')}
          </a>
        )}
        <a
          href={MAPS_URL}
          target="_blank"
          rel="noreferrer noopener"
          className="flex min-h-12 flex-1 items-center justify-center rounded-full border border-[var(--line)] px-4 text-[0.78rem] tracking-[0.1em] text-[var(--fg)] uppercase"
        >
          {t('Find us', 'الموقع')}
        </a>
      </div>
    </div>
  );
}
