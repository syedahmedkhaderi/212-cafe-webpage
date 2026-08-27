'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { MenuCategory, MenuItem, Locale } from '@/lib/types';
import { localised } from '@/lib/types';
import { money } from '@/lib/format';
import { isRTL } from '@/lib/i18n';
import { useCopy } from '@/lib/content/provider';
import { hasUsablePhoto } from '@/lib/site';

type Props = {
  categories: MenuCategory[];
  items: MenuItem[];
  /** Locale is owned by the site-wide switcher in the header, not by this component. */
  locale: Locale;
};

export function MenuBrowser({ categories, items, locale }: Props) {
  const tr = useCopy(locale);
  const rtl = isRTL(locale);
  const [active, setActive] = useState(categories[0]?.id ?? '');
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  const byCategory = useMemo(() => {
    const map = new Map<string, MenuItem[]>();
    for (const c of categories) {
      map.set(c.id, items.filter((i) => i.category_id === c.id && i.is_available));
    }
    return map;
  }, [categories, items]);

  // Highlight the category whose section is nearest the top of the viewport.
  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (visible?.target.id) {
          const match = categories.find((c) => c.slug === visible.target.id);
          if (match) setActive(match.id);
        }
      },
      { rootMargin: '-96px 0px -70% 0px', threshold: 0 },
    );
    for (const el of Object.values(sectionRefs.current)) if (el) observer.observe(el);
    return () => observer.disconnect();
  }, [categories]);

  const available = items.filter((i) => i.is_available).length;

  return (
    <div>
      <div className="py-12 sm:py-16">
        <p className="eyebrow">{tr('menuEyebrow')}</p>
        <h1 className="display mt-4 text-[clamp(2.75rem,8vw,5.5rem)]">{tr('menuPageTitle')}</h1>
        <p className="mt-5 max-w-lg leading-relaxed text-[var(--muted)]">
          {available} {tr('itemsCount')} {tr('across')} {categories.length} {tr('menuPageSub')}
        </p>
      </div>

      {/* sticky category rail */}
      <div className="sticky top-[57px] z-40 -mx-5 border-b border-[var(--line)] bg-[var(--bg)]/92 px-5 backdrop-blur-md sm:-mx-8 sm:px-8">
        <div className="rail mx-auto flex max-w-6xl gap-1 overflow-x-auto py-3">
          {categories.map((c) => {
            const count = byCategory.get(c.id)?.length ?? 0;
            if (count === 0) return null;
            return (
              <a
                key={c.id}
                href={`#${c.slug}`}
                className={`whitespace-nowrap rounded-full px-4 py-2 text-[0.8rem] transition-colors ${
                  active === c.id
                    ? 'bg-ink text-bone'
                    : 'text-[var(--muted)] hover:bg-bone-dim hover:text-[var(--fg)]'
                }`}
              >
                {localised(c, 'name', locale)}
              </a>
            );
          })}
        </div>
      </div>

      {categories.map((c) => {
        const list = byCategory.get(c.id) ?? [];
        if (list.length === 0) return null;

        return (
          <section
            key={c.id}
            id={c.slug}
            ref={(el) => {
              sectionRefs.current[c.id] = el;
            }}
            className="scroll-mt-32 py-14"
          >
            <div className="flex items-baseline justify-between gap-5">
              <h2 className="display text-[clamp(2rem,5vw,3.25rem)]">{localised(c, 'name', locale)}</h2>
              <span className="tabular text-xs text-[var(--muted)]">{list.length}</span>
            </div>
            <div className="rule mt-5" />

            <ul className="mt-8 grid gap-x-8 gap-y-9 sm:grid-cols-2">
              {list.map((item) => {
                const name = localised(item, 'name', locale);
                const description = localised(item, 'description', locale);
                /* Text-forward where the photograph is a duplicate (one latte shot
                   covers five products) or AI-generated stock rather than their food.
                   See hasUsablePhoto — both rules, on every photo-led surface. */
                const showPhoto = hasUsablePhoto(item);

                return (
                  <li key={item.id} className="flex gap-4">
                    {showPhoto ? (
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-sm bg-sand">
                        <Image src={item.image_path!} alt={name} fill sizes="96px" className="object-cover" />
                      </div>
                    ) : (
                      /* self-stretch, not a fixed height: 22 of the café's items have
                         no description, and a fixed bar left a tall empty gap. */
                      <div
                        aria-hidden
                        className="w-1 shrink-0 self-stretch rounded-full bg-gradient-to-b from-brass/45 to-transparent"
                      />
                    )}

                    <div className="min-w-0 flex-1">
                      <div className="flex items-baseline justify-between gap-3">
                        <h3 className="text-[0.98rem] font-medium leading-snug">{name}</h3>
                        <span className="tabular shrink-0 text-sm text-brass-ink" dir="ltr">
                          {money(item.price)}
                        </span>
                      </div>
                      {description && (
                        <p className="mt-1.5 text-[0.83rem] leading-relaxed text-[var(--muted)]">
                          {description}
                        </p>
                      )}
                      {item.is_signature && (
                        <span className="eyebrow mt-2 inline-block text-brass-ink">{tr('signatureTag')}</span>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      <p className="pb-4 text-center text-xs text-[var(--muted)]/60">
        {rtl ? 'الأسعار بالريال القطري' : 'Prices in Qatari riyal'}
      </p>
    </div>
  );
}
