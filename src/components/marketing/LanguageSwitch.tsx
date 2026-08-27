'use client';

import { useRouter } from 'next/navigation';
import { useCallback, useState, useTransition } from 'react';
import type { Locale } from '@/lib/types';
import { persistLocale as persist } from '@/lib/locale-client';

export function useLocaleSwitch(current: Locale) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const switchTo = useCallback(
    (next: Locale) => {
      if (next === current) return;
      persist(next);
      startTransition(() => router.refresh());
    },
    [current, router],
  );

  return { switchTo, pending };
}

/**
 * The header switcher. Deliberately a labelled pair rather than a single toggle:
 * a visitor should be able to see "العربية" without first working out that the
 * button would change the language.
 */
export function LanguageSwitch({
  locale,
  tone = 'light',
}: {
  locale: Locale;
  tone?: 'light' | 'dark';
}) {
  const { switchTo, pending } = useLocaleSwitch(locale);

  // min-h-11 / min-w-11: this is the control a visitor reaches for first, and on a
  // phone it was a 24px-tall target. The pill looks the same; the hit box does not.
  const base =
    'grid place-items-center min-h-11 min-w-11 px-3 text-[0.78rem] rounded-full transition-colors leading-none';
  const activeClass =
    tone === 'dark' ? 'bg-bone text-ink' : 'bg-ink text-bone';
  const idleClass =
    tone === 'dark'
      ? 'text-bone/70 hover:text-bone'
      : 'text-[var(--muted)] hover:text-[var(--fg)]';

  return (
    <div
      role="group"
      aria-label={locale === 'ar' ? 'اللغة' : 'Language'}
      className={`flex items-center gap-0.5 rounded-full border p-0.5 ${
        tone === 'dark' ? 'border-bone/30' : 'border-[var(--line)]'
      } ${pending ? 'opacity-60' : ''}`}
    >
      <button
        type="button"
        onClick={() => switchTo('en')}
        aria-pressed={locale === 'en'}
        lang="en"
        className={`${base} ${locale === 'en' ? activeClass : idleClass}`}
      >
        EN
      </button>
      <button
        type="button"
        onClick={() => switchTo('ar')}
        aria-pressed={locale === 'ar'}
        lang="ar"
        className={`${base} ${locale === 'ar' ? activeClass : idleClass}`}
      >
        العربية
      </button>
    </div>
  );
}

/**
 * First-visit language chooser.
 *
 * Shown only when no locale cookie exists. A café in Qatar serves both languages;
 * making the choice the first thing a visitor sees is friendlier than hiding it in a
 * header they may never scan. Dismissing it by picking either option sets the cookie,
 * so it never appears twice.
 */
export function LanguagePicker({ detected }: { detected: Locale }) {
  const [open, setOpen] = useState(true);
  const router = useRouter();

  if (!open) return null;

  const choose = (locale: Locale) => {
    persist(locale);
    setOpen(false);
    router.refresh();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Choose your language / اختر لغتك"
      className="fixed inset-0 z-[100] grid place-items-center bg-ink/92 px-6 backdrop-blur-sm"
    >
      <div className="w-full max-w-sm text-center">
        <p className="display text-5xl text-bone">212</p>
        <p className="mt-2 text-[0.8rem] tracking-[0.2em] text-bone/50 uppercase">Café · Lusail</p>

        <div className="mt-10 space-y-3">
          <button
            type="button"
            onClick={() => choose('en')}
            lang="en"
            className="w-full rounded-full bg-bone px-6 py-4 text-[0.95rem] text-ink transition-colors hover:bg-brass-lit"
          >
            English
          </button>
          <button
            type="button"
            onClick={() => choose('ar')}
            lang="ar"
            dir="rtl"
            className="w-full rounded-full border border-bone/40 px-6 py-4 text-[1.05rem] text-bone transition-colors hover:border-bone hover:bg-bone/10"
          >
            العربية
          </button>
        </div>

        <button
          type="button"
          onClick={() => choose(detected)}
          className="mt-6 text-[0.75rem] text-bone/40 underline-offset-4 hover:underline"
        >
          {detected === 'ar' ? 'تخطي' : 'Skip'}
        </button>
      </div>
    </div>
  );
}
