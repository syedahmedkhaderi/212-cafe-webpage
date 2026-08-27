'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { INSTAGRAM_URL, MAPS_URL } from '@/lib/site';
import { stripDash } from '@/lib/format';
import { useCopy } from '@/lib/content/provider';
import type { Locale } from '@/lib/types';
import { LanguageSwitch } from './LanguageSwitch';

export function SiteHeader({ locale }: { locale: Locale }) {
  const tr = useCopy(locale);
  const [open, setOpen] = useState(false);
  const headerRef = useRef<HTMLElement | null>(null);

  const NAV = [
    { href: '#view', label: tr('navView') },
    { href: '#signatures', label: tr('navSignatures') },
    { href: '#menu', label: tr('navMenu') },
    { href: '#visit', label: tr('navVisit') },
  ];

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  /*
    Publish the header's real height as --site-header-h.

    The hero subtracts it to fill the first screen exactly. That subtraction used to be
    a hardcoded 69px, which is the DESKTOP height — on a phone the header is about six
    pixels shorter, so the hero ran six pixels long and left a sliver of the next
    section peeking above the fold on the device most people see this on. Measured, it
    is right on both, and stays right if a visitor has raised their font size.
  */
  useEffect(() => {
    const el = headerRef.current;
    if (!el) return;

    const publish = () => {
      document.documentElement.style.setProperty(
        '--site-header-h',
        `${Math.round(el.getBoundingClientRect().height)}px`,
      );
    };

    publish();
    const observer = new ResizeObserver(publish);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <>
      <header
        ref={headerRef}
        className="sticky top-0 z-50 border-b border-[var(--line)] bg-[var(--bg)]/96 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/"
            aria-label="212 Café"
            className="display text-2xl leading-none tracking-tight text-[var(--fg)]"
          >
            212
          </Link>

          <nav className="hidden items-center gap-9 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className="text-[0.8rem] tracking-wide text-[var(--muted)] transition-colors hover:text-brass"
              >
                {n.label}
              </a>
            ))}
            <Link
              href="/menu"
              className="rounded-full border border-ink/25 px-5 py-2 text-[0.75rem] tracking-[0.12em] text-[var(--fg)] uppercase transition-colors hover:border-brass hover:text-brass"
            >
              {tr('fullMenu')}
            </Link>
          </nav>

          {/* The switcher sits beside the logo on every screen size — a visitor should
              never have to open a menu to find their own language. */}
          <div className="flex items-center gap-3">
            <LanguageSwitch locale={locale} tone="light" />

            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={tr('openMenu')}
              className="-me-2 grid min-h-11 min-w-11 place-items-center text-[var(--fg)] md:hidden"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] overflow-y-auto overscroll-contain bg-ink pb-[max(1.5rem,env(safe-area-inset-bottom))] text-bone md:hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="display text-2xl">212</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label={tr('closeMenu')}
              className="-me-2 grid min-h-11 min-w-11 place-items-center"
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
          <nav className="flex flex-col gap-1 px-5 pt-8">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                onClick={() => setOpen(false)}
                className="display border-b border-bone/10 py-5 text-4xl text-bone"
              >
                {n.label}
              </a>
            ))}
            <Link
              href="/menu"
              onClick={() => setOpen(false)}
              className="display border-b border-bone/10 py-5 text-4xl text-brass-lit"
            >
              {tr('fullMenu')}
            </Link>
          </nav>
          <div className="px-5 pt-8">
            <LanguageSwitch locale={locale} tone="dark" />
          </div>
        </div>
      )}
    </>
  );
}

export function SiteFooter({
  locale,
  phone,
  email,
  instagram,
}: {
  locale: Locale;
  phone: string;
  email: string;
  instagram: string;
}) {
  const tr = useCopy(locale);

  return (
    <footer className="border-t border-[var(--line)] bg-[var(--bg)]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="display text-5xl leading-none">212</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
              {stripDash(tr('footerBlurb'))}
            </p>
            <div className="mt-5">
              <LanguageSwitch locale={locale} />
            </div>
          </div>

          <div className="grid gap-2 text-sm sm:text-end">
            <a href={`tel:${phone.replace(/\s/g, '')}`} className="tabular hover:text-brass" dir="ltr">
              {phone}
            </a>
            <a href={`mailto:${email}`} className="hover:text-brass" dir="ltr">
              {email}
            </a>
            <a href={INSTAGRAM_URL} target="_blank" rel="noreferrer noopener" className="hover:text-brass" dir="ltr">
              @{instagram}
            </a>
            <a href={MAPS_URL} target="_blank" rel="noreferrer noopener" className="hover:text-brass">
              {tr('getDirections')}
            </a>
          </div>
        </div>

        <div className="rule mt-10" />
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <p className="text-xs text-[var(--muted)]">
            © {new Date().getFullYear()} 212 Café · {tr('footerAddress')}
          </p>
          {/*
            Discreet, but present. There was previously no route to the admin from
            anywhere on the site, which meant the only way in was to already know the
            URL — and an unlinked URL is not a security control. RLS is what actually
            guards /admin: an account without a staff row gets zero rows back.
          */}
          <Link href="/admin" className="text-xs text-[var(--muted)] transition-colors hover:text-brass">
            {tr('staffSignIn')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
