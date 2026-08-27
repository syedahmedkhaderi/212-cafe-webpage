'use client';

import Image from 'next/image';
import { useMemo, useState } from 'react';
import type { CartLine, Locale, MenuItem, ModifierOption } from '@/lib/types';
import { localised } from '@/lib/types';
import { money } from '@/lib/format';
import { buildLine, defaultSelection, validateSelection } from '@/lib/order/cart';
import { hasUsablePhoto } from '@/lib/site';
import { ItemPlaceholder } from '@/components/menu/ItemPlaceholder';
import { useBodyScrollLock } from './useBodyScrollLock';

/**
 * Configure one item and add it to the cart.
 *
 * Extracted from OrderApp so /menu can open the same sheet rather than growing a second
 * copy of it. It carries data-surface="dark" itself, which is what lets it open over the
 * light marketing menu and still look like the ordering app: that attribute is a
 * CSS-variable scope (globals.css), so --bg/--fg/--card flip inside this subtree only.
 */
export function ItemSheet({
  item,
  categorySlug,
  locale,
  onClose,
  onAdd,
}: {
  item: MenuItem;
  /** Picks the placeholder glyph when the item has no usable photograph. */
  categorySlug?: string | null;
  locale: Locale;
  onClose: () => void;
  onAdd: (line: CartLine) => void;
}) {
  const rtl = locale === 'ar';
  const t = (en: string, ar: string) => (rtl ? ar : en);
  const [selected, setSelected] = useState<ModifierOption[]>(() => defaultSelection(item));
  const [quantity, setQty] = useState(1);
  const [notes, setNotes] = useState('');

  useBodyScrollLock(true);

  const selectedIds = useMemo(() => new Set(selected.map((o) => o.id)), [selected]);
  const validity = validateSelection(item, selectedIds);
  const unit = item.price + selected.reduce((s, o) => s + o.price_delta, 0);

  const toggle = (group: MenuItem['modifier_groups'][number], option: ModifierOption) => {
    setSelected((current) => {
      const inGroup = current.filter((o) => group.options.some((g) => g.id === o.id));
      const others = current.filter((o) => !group.options.some((g) => g.id === o.id));
      const already = inGroup.some((o) => o.id === option.id);

      if (group.max_select === 1) return already && group.min_select === 0 ? others : [...others, option];
      if (already) return [...others, ...inGroup.filter((o) => o.id !== option.id)];
      if (inGroup.length >= group.max_select) return current;
      return [...others, ...inGroup, option];
    });
  };

  return (
    <div
      data-surface="dark"
      className="fixed inset-0 z-50 flex items-end justify-center text-[var(--fg)]"
      dir={rtl ? 'rtl' : 'ltr'}
    >
      <button
        type="button"
        aria-label={t('Close', 'إغلاق')}
        onClick={onClose}
        className="absolute inset-0 bg-black/65"
      />
      {/*
        dvh, not vh. On iOS Safari with the URL bar showing, 88vh is measured against the
        LARGE viewport, so the sheet was taller than the visible area and the one control
        that matters — "Add to order", the last element — sat below the fold on the
        phone this app is built for. overscroll-contain stops a flick at the end of the
        sheet from scrolling the page behind it.
      */}
      <div className="relative max-h-[88dvh] w-full max-w-lg overflow-y-auto overscroll-contain rounded-t-2xl bg-[var(--card)] pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {/*
          The close button lives OUTSIDE the image block on purpose. It used to be
          nested inside it, which was fine only while every item had a photograph — the
          moment one does not (a duplicate, or AI stock), the sheet lost its only visible
          way out and left the backdrop tap as the sole escape.
        */}
        <button
          type="button"
          onClick={onClose}
          aria-label={t('Close', 'إغلاق')}
          className="absolute end-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full bg-black/55 text-bone backdrop-blur"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>

        {hasUsablePhoto(item) ? (
          <div className="relative aspect-[16/10] w-full overflow-hidden">
            <Image src={item.image_path!} alt="" fill sizes="512px" className="object-cover" priority />
          </div>
        ) : (
          <ItemPlaceholder
            categorySlug={categorySlug}
            rounded="rounded-none"
            className="aspect-[16/10] w-full text-[2.5rem]"
          />
        )}

        <div className="px-5 pt-5">
          <div className="flex items-baseline justify-between gap-4">
            <h2 className="display text-2xl">{localised(item, 'name', locale)}</h2>
            <span className="tabular text-brass-lit" dir="ltr">{money(item.price)}</span>
          </div>
          {localised(item, 'description', locale) && (
            <p className="mt-2 text-[0.85rem] leading-relaxed text-[var(--muted)]">
              {localised(item, 'description', locale)}
            </p>
          )}

          {item.modifier_groups.map((group) => (
            <fieldset key={group.id} className="mt-6">
              <legend className="flex w-full items-baseline justify-between">
                <span className="text-[0.9rem] font-medium">{localised(group, 'name', locale)}</span>
                <span className="text-[0.7rem] text-[var(--muted)]">
                  {group.min_select > 0
                    ? t('Required', 'مطلوب')
                    : t(`Up to ${group.max_select}`, `حتى ${group.max_select}`)}
                </span>
              </legend>
              <div className="mt-2.5 space-y-1">
                {group.options.map((option) => {
                  const on = selectedIds.has(option.id);
                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggle(group, option)}
                      className={`flex min-h-11 w-full items-center justify-between rounded-lg border px-4 py-3 text-start text-[0.86rem] transition-colors ${
                        on
                          ? 'border-brass bg-brass/12 text-[var(--fg)]'
                          : 'border-[var(--line)] text-[var(--muted)] hover:border-[var(--fg)]/30'
                      }`}
                    >
                      <span>{localised(option, 'name', locale)}</span>
                      {option.price_delta > 0 && (
                        <span className="tabular text-[0.8rem] text-brass-lit" dir="ltr">
                          +{money(option.price_delta)}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </fieldset>
          ))}

          <label className="mt-6 block">
            <span className="text-[0.9rem] font-medium">{t('Notes', 'ملاحظات')}</span>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value.slice(0, 200))}
              rows={2}
              placeholder={t('Less ice, no sugar…', 'ثلج أقل، بدون سكر…')}
              className="mt-2 w-full resize-none rounded-lg border border-[var(--line)] bg-transparent px-4 py-3 text-[0.86rem] placeholder:text-[var(--muted)]/60 focus:border-brass focus:outline-none"
            />
          </label>

          <div className="mt-6 flex items-center gap-4">
            {/* 44px steppers. These were 36 — below the tap-target floor, on the control
                a guest uses most, one-handed, at a table. */}
            <div className="flex items-center gap-1 rounded-full border border-[var(--line)] p-1">
              <button
                type="button"
                onClick={() => setQty((q) => Math.max(1, q - 1))}
                aria-label={t('Decrease', 'إنقاص')}
                className="grid h-11 w-11 place-items-center rounded-full text-lg hover:bg-white/8"
              >
                −
              </button>
              <span className="tabular w-8 text-center text-[0.95rem]">{quantity}</span>
              <button
                type="button"
                onClick={() => setQty((q) => Math.min(50, q + 1))}
                aria-label={t('Increase', 'زيادة')}
                className="grid h-11 w-11 place-items-center rounded-full text-lg hover:bg-white/8"
              >
                +
              </button>
            </div>

            <button
              type="button"
              disabled={!validity.ok}
              onClick={() => onAdd(buildLine(item, selected, quantity, notes))}
              className="flex min-h-12 flex-1 items-center justify-between rounded-full bg-brass px-6 py-3.5 text-bone transition-opacity disabled:cursor-not-allowed disabled:opacity-45"
            >
              <span className="text-[0.85rem]">
                {validity.ok ? t('Add to order', 'أضف إلى الطلب') : validity.message}
              </span>
              {validity.ok && (
                <span className="tabular text-[0.85rem]" dir="ltr">
                  {money(unit * quantity)}
                </span>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
