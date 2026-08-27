'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { INSTAGRAM_URL, MAPS_URL } from '@/lib/site';
import { translator } from '@/lib/i18n';
import type { Locale } from '@/lib/types';
import { LanguageSwitch } from './LanguageSwitch';

export function SiteHeader({ locale }: { locale: Locale }) {
  const tr = translator(locale);
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);

  const NAV = [
    { href: '#view', label: tr('navView') },
    { href: '#signatures', label: tr('navSignatures') },
    { href: '#menu', label: tr('navMenu') },
    { href: '#visit', label: tr('navVisit') },
  ];

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    document.body.style.overflow = open ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [open]);

  return (
    <>
      <header
        className={`fixed inset-x-0 top-0 z-50 transition-all duration-500 ${
          scrolled
            ? 'bg-[var(--bg)]/88 backdrop-blur-md border-b border-[var(--line)]'
            : 'border-b border-transparent'
        }`}
      >
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
          <Link
            href="/"
            aria-label="212 Café"
            className={`display text-2xl leading-none tracking-tight transition-colors ${
              scrolled ? 'text-[var(--fg)]' : 'text-bone'
            }`}
          >
            212
          </Link>

          <nav className="hidden items-center gap-9 md:flex">
            {NAV.map((n) => (
              <a
                key={n.href}
                href={n.href}
                className={`text-[0.8rem] tracking-wide transition-colors hover:text-brass ${
                  scrolled ? 'text-[var(--muted)]' : 'text-bone/80'
                }`}
              >
                {n.label}
              </a>
            ))}
            <Link
              href="/menu"
              className={`rounded-full border px-5 py-2 text-[0.75rem] tracking-[0.12em] uppercase transition-colors ${
                scrolled
                  ? 'border-ink/25 text-[var(--fg)] hover:border-brass hover:text-brass'
                  : 'border-bone/40 text-bone hover:border-bone hover:bg-bone hover:text-ink'
              }`}
            >
              {tr('fullMenu')}
            </Link>
          </nav>

          {/* The switcher sits beside the logo on every screen size — a visitor should
              never have to open a menu to find their own language. */}
          <div className="flex items-center gap-3">
            <LanguageSwitch locale={locale} tone={scrolled ? 'light' : 'dark'} />

            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={tr('openMenu')}
              className={`md:hidden ${scrolled ? 'text-[var(--fg)]' : 'text-bone'}`}
            >
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M3 7h18M3 12h18M3 17h18" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        </div>
      </header>

      {open && (
        <div className="fixed inset-0 z-[60] bg-ink text-bone md:hidden">
          <div className="flex items-center justify-between px-5 py-4">
            <span className="display text-2xl">212</span>
            <button type="button" onClick={() => setOpen(false)} aria-label={tr('closeMenu')}>
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
  const tr = translator(locale);

  return (
    <footer className="border-t border-[var(--line)] bg-[var(--bg)]">
      <div className="mx-auto max-w-6xl px-5 py-14 sm:px-8">
        <div className="flex flex-col gap-10 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="display text-5xl leading-none">212</p>
            <p className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--muted)]">
              {tr('footerBlurb')}
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
          <Link href="/admin" className="text-xs text-[var(--muted)]/70 transition-colors hover:text-brass">
            {tr('staffSignIn')}
          </Link>
        </div>
      </div>
    </footer>
  );
}
