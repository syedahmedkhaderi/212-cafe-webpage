'use client';

import Link from 'next/link';
import { useEffect, useRef } from 'react';
import type { Locale } from '@/lib/types';
import { isRTL, translator } from '@/lib/i18n';
import { LanguageSwitch } from './LanguageSwitch';

/**
 * The menu page's own header.
 *
 * It measures itself and publishes its height as `--menu-header-h`, which is what the
 * sticky category rail below it pins to. That used to be a hardcoded `top-[57px]` — a
 * number that is only correct at the default font size. A visitor who has raised their
 * browser's text size got a rail that either overlapped the header or floated a few
 * pixels below it, on the one page that is nothing but a long scroll past a pinned rail.
 */
export function MenuHeader({ locale }: { locale: Locale }) {
  const ref = useRef<HTMLElement | null>(null);
  const tr = translator(locale);
  const rtl = isRTL(locale);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        '--menu-header-h',
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => {
      observer.disconnect();
      document.documentElement.style.removeProperty('--menu-header-h');
    };
  }, []);

  return (
    <header
      ref={ref}
      className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg)]/92 backdrop-blur-md"
    >
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-3 sm:px-8 sm:py-4">
        <Link href="/" className="display grid min-h-11 place-items-center text-2xl leading-none">
          212
        </Link>
        <div className="flex items-center gap-3 sm:gap-4">
          <LanguageSwitch locale={locale} />
          <Link
            href="/"
            className="grid min-h-11 place-items-center text-[0.8rem] text-[var(--muted)] transition-colors hover:text-brass"
          >
            {rtl ? '→' : '←'} {tr('back')}
          </Link>
        </div>
      </div>
    </header>
  );
}
