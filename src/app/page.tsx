import Image, { getImageProps } from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getBusiness, getMenu } from '@/lib/menu/queries';
import { clock, dayName, isOpenNow, money } from '@/lib/format';
import { HERO, HERO_IMAGE, INSTAGRAM_URL, MAPS_URL, VIEW_HERO, VIEW_IMAGES } from '@/lib/site';
import { SiteFooter, SiteHeader } from '@/components/marketing/SiteChrome';
import { LanguagePicker } from '@/components/marketing/LanguageSwitch';
import { SITE_URL } from '@/lib/site-url';
import { getLocale, hasChosenLocale } from '@/lib/locale-server';
import { isRTL, translator } from '@/lib/i18n';
import { localised } from '@/lib/types';

// Reading the locale cookie already forces dynamic rendering, so this is explicit
// rather than relying on a revalidate window that would never apply. Availability and
// language are both per-request.
export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const [{ categories, items }, { settings, hours }, locale, chosen] = await Promise.all([
    getMenu(),
    getBusiness(),
    getLocale(),
    hasChosenLocale(),
  ]);

  const tr = translator(locale);
  const rtl = isRTL(locale);
  const signatures = items.filter((i) => i.is_signature && i.is_available);
  const available = items.filter((i) => i.is_available);
  const open = isOpenNow(hours);
  const today = hours.find((h) => h.day_of_week === new Date().getDay());

  // ------------------------------------------------------------- hero art direction
  //
  // Two purpose-made crops, not one image squeezed by object-position. A 4:3 landscape
  // inside a near-full-height section on a 9:19.5 phone keeps only the middle ~42% of
  // the frame — which is exactly the sunset sky and the marina thrown away. The portrait
  // crop keeps FULL height and trims only peripheral city, so the picture still reads.
  //
  // getImageProps is the documented way to art-direct while keeping next/image's AVIF
  // negotiation and responsive srcSet. <picture> then fetches exactly one of the two.
  const heroAlt = rtl
    ? 'أبراج كتارا ومارينا لوسيل عند الغروب'
    : 'The Katara Towers and Lusail Marina at sunset';
  const heroCommon = { alt: heroAlt, sizes: '100vw', priority: true, quality: 85 };
  const {
    props: { srcSet: heroWideSrcSet },
  } = getImageProps({ ...heroCommon, src: HERO.wide, width: HERO.width, height: HERO.height });
  const {
    props: { srcSet: heroPortraitSrcSet, ...heroImgProps },
  } = getImageProps({ ...heroCommon, src: HERO.portrait, width: 675, height: 900 });

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CafeOrCoffeeShop',
    name: '212 Café',
    alternateName: '٢١٢ كافيه',
    image: `${SITE_URL}${HERO_IMAGE}`,
    telephone: settings?.phone,
    email: settings?.email,
    priceRange: 'QAR 50–100',
    servesCuisine: ['Coffee', 'Desserts', 'Brunch'],
    address: {
      '@type': 'PostalAddress',
      streetAddress: 'Marina Twin Tower A, 30th Floor',
      addressLocality: 'Lusail',
      addressCountry: 'QA',
    },
    geo: settings?.latitude
      ? { '@type': 'GeoCoordinates', latitude: settings.latitude, longitude: settings.longitude }
      : undefined,
    openingHoursSpecification: hours
      .filter((h) => !h.is_closed)
      .map((h) => ({
        '@type': 'OpeningHoursSpecification',
        dayOfWeek: dayName(h.day_of_week, 'en'),
        opens: h.opens_at,
        closes: h.closes_at,
      })),
    sameAs: [INSTAGRAM_URL],
    hasMenu: `${SITE_URL}/menu`,
  };

  return (
    <div dir={rtl ? 'rtl' : 'ltr'} lang={locale}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* Offered once, on a visitor's first arrival, then never again. */}
      {!chosen && <LanguagePicker detected={locale} />}

      <SiteHeader locale={locale} />

      <main>
        {/* ---------------------------------------------------------------- hero */}
        {/* 88svh rather than 100svh: less height to fill means less side crop, and a
            hero that stops just short of the fold tells the reader the page continues. */}
        <section className="relative min-h-[88svh] w-full overflow-hidden bg-ink">
          <picture>
            <source media={`(min-width: ${HERO.portraitMaxWidth}px)`} srcSet={heroWideSrcSet} />
            <source srcSet={heroPortraitSrcSet} />
            {/* alt is repeated after the spread so it is statically visible — both to a
                reader and to jsx-a11y, which cannot see through the spread. */}
            <img
              {...heroImgProps}
              alt={heroAlt}
              className="absolute inset-0 h-full w-full object-cover object-center opacity-85"
            />
          </picture>

          {/* Two scrims, kept deliberately. The sunset frame is far brighter at the top
              than the shot it replaces, so the header needs this more, not less. */}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-b from-ink/60 via-transparent to-transparent" />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[85%] bg-gradient-to-t from-ink via-ink/88 to-transparent"
          />

          <div className="relative z-10 mx-auto flex min-h-[88svh] max-w-6xl flex-col justify-end px-5 pb-16 sm:px-8 sm:pb-24">
            <p className="eyebrow reveal on-photo text-bone/90">{tr('heroLocation')}</p>

            <h1 className="display reveal mt-5 text-bone" style={{ animationDelay: '80ms' }}>
              <span className="block text-[clamp(3.5rem,13vw,9rem)]">{tr('heroLine1')}</span>
              <span className="block text-[clamp(3.5rem,13vw,9rem)] text-brass-lit">{tr('heroLine2')}</span>
            </h1>

            <p
              className="reveal on-photo mt-7 max-w-md text-[0.95rem] leading-relaxed text-bone/85"
              style={{ animationDelay: '160ms' }}
            >
              {tr('heroSub')}
            </p>

            <div className="reveal mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: '240ms' }}>
              <Link
                href="/menu"
                className="rounded-full bg-bone px-7 py-3.5 text-[0.78rem] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-brass-lit"
              >
                {tr('exploreMenu')}
              </Link>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-full border border-bone/40 px-7 py-3.5 text-[0.78rem] uppercase tracking-[0.14em] text-bone transition-colors hover:border-bone hover:bg-bone/10"
              >
                {tr('findUs')}
              </a>
            </div>

            <div
              className="reveal on-photo mt-10 flex items-center gap-2.5 text-[0.8rem] text-bone/85"
              style={{ animationDelay: '320ms' }}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${open ? 'bg-emerald-400' : 'bg-bone/40'}`}
                aria-hidden
              />
              {open ? tr('openNow') : tr('closedNow')}
              {today && !today.is_closed && (
                <span className="tabular text-bone/50" dir="ltr">
                  · {clock(today.opens_at)} – {clock(today.closes_at)}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- view */}
        {/*
          Rebuilt. This previously showed four drink photographs in a 2×2 grid whose
          aspect ratios alternated (`n % 3 === 0 ? 'aspect-[3/4]' : 'aspect-square'`), so
          no two tiles lined up — and the four were near-identical frames: same railing,
          same marble, same towers, same daylight, different drink. A section headed
          "Lusail's best view" was illustrated with four pictures of cocktails.

          Now it leads with the view itself, and every group below has exactly ONE aspect
          ratio — which is the entire alignment fix.
        */}
        <section id="view" className="scroll-mt-20 bg-[var(--bg)] py-24 sm:py-32">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="grid items-center gap-12 lg:grid-cols-[1.45fr_1fr] lg:gap-16">
              <figure className="relative aspect-[16/9] overflow-hidden rounded-sm bg-sand">
                <Image
                  src={VIEW_HERO.src}
                  alt={rtl ? VIEW_HERO.labelAr : VIEW_HERO.labelEn}
                  fill
                  sizes="(max-width: 1024px) 92vw, 660px"
                  className="object-cover"
                />
              </figure>

              <div>
                <p className="eyebrow">{tr('viewEyebrow')}</p>
                <h2 className="display mt-5 text-[clamp(2.25rem,5vw,3.75rem)]">{tr('viewTitle')}</h2>
                <p className="mt-6 leading-relaxed text-[var(--muted)]">{tr('viewBody1')}</p>
                <p className="mt-4 leading-relaxed text-[var(--muted)]">{tr('viewBody2')}</p>
              </div>
            </div>

            {/* Uniform squares. Three visually distinct frames, not four variations on one. */}
            <div className="mt-10 grid grid-cols-3 gap-3 sm:gap-4">
              {VIEW_IMAGES.map((v) => (
                <figure key={v.src} className="group relative aspect-square overflow-hidden rounded-sm bg-sand">
                  <Image
                    src={v.src}
                    alt={
                      rtl
                        ? `${v.labelAr} على تراس ٢١٢ كافيه بإطلالة على مارينا لوسيل`
                        : `${v.label}, served on the 212 Café terrace overlooking Lusail Marina`
                    }
                    fill
                    sizes="(max-width: 640px) 31vw, (max-width: 1024px) 30vw, 340px"
                    className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                  />
                </figure>
              ))}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- signatures */}
        {signatures.length > 0 && (
          <section id="signatures" className="scroll-mt-20 bg-ink py-24 text-bone sm:py-32">
            <div className="mx-auto max-w-6xl px-5 sm:px-8">
              <p className="eyebrow text-bone/50">{tr('signaturesEyebrow')}</p>
              <h2 className="display mt-5 max-w-2xl text-[clamp(2.5rem,6vw,4.5rem)]">
                {tr('signaturesTitle')}
              </h2>

              <div className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                {signatures.map((item) => {
                  const name = localised(item, 'name', locale);
                  const description = localised(item, 'description', locale);
                  return (
                    <article key={item.id} className="group">
                      {/*
                        3:4, uniform — and deliberately NOT each image's natural ratio.

                        aspect-[4/5] mangled the two landscape AI frames that used to sit
                        here: only the middle ~35% of an already-wide image survived. But
                        those images are gone, and of the five signatures now left, four
                        are EXACTLY 3:4 — so this crops nothing on them. The fifth (the
                        3 Layers, 778×1374) keeps 75% of its height, which still shows all
                        three layers and the chocolate on top; checked, not assumed.

                        Natural ratios were the other option, and were tried: one image
                        200px taller than its neighbours pulls every name and price off
                        the baseline, which is the same "nothing lines up" problem this
                        redesign exists to fix. Alignment wins here because the crop is
                        now free.
                      */}
                      <div className="relative aspect-[3/4] overflow-hidden rounded-sm bg-ink-soft">
                        {item.image_path && (
                          <Image
                            src={item.image_path}
                            alt={name}
                            fill
                            sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 360px"
                            className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                          />
                        )}
                      </div>
                      <div className="mt-5 flex items-baseline justify-between gap-4">
                        <h3 className="display text-2xl">{name}</h3>
                        <span className="tabular shrink-0 text-sm text-brass-lit" dir="ltr">
                          {money(item.price)}
                        </span>
                      </div>
                      {description && (
                        <p className="mt-2.5 text-sm leading-relaxed text-bone/55">
                          {description.length > 130 ? `${description.slice(0, 130).trimEnd()}…` : description}
                        </p>
                      )}
                    </article>
                  );
                })}
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- menu */}
        <section id="menu" className="scroll-mt-20 bg-[var(--bg)] py-24 sm:py-32">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow">{tr('menuEyebrow')}</p>
                <h2 className="display mt-5 text-[clamp(2.5rem,6vw,4.5rem)]">
                  {available.length} {tr('menuTitle')}
                </h2>
              </div>
              <Link
                href="/menu"
                className="rounded-full border border-ink/20 px-6 py-3 text-[0.75rem] uppercase tracking-[0.14em] transition-colors hover:border-brass hover:text-brass-ink"
              >
                {tr('viewFullMenu')}
              </Link>
            </div>

            {/*
              Photo-led. These were sparse text cards on a large field of empty cream —
              six boxes advertising a menu whose whole strength is its photography. Each
              card now carries a representative image with a gradient foot; the category
              image is a column on menu_categories, so the owner can change it.
            */}
            <div className="mt-14 grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
              {categories.map((c) => {
                const inCategory = available.filter((i) => i.category_id === c.id);
                if (inCategory.length === 0) return null;
                const from = Math.min(...inCategory.map((i) => i.price));
                return (
                  <Link
                    key={c.id}
                    href={`/menu#${c.slug}`}
                    className="group relative flex aspect-[4/5] flex-col justify-end overflow-hidden rounded-sm bg-ink"
                  >
                    {c.image_path && (
                      <Image
                        src={c.image_path}
                        alt=""
                        aria-hidden
                        fill
                        sizes="(max-width: 640px) 92vw, (max-width: 1024px) 46vw, 360px"
                        className="object-cover transition-transform duration-700 group-hover:scale-[1.05]"
                      />
                    )}
                    <div
                      aria-hidden
                      className="absolute inset-0 bg-gradient-to-t from-ink via-ink/45 to-ink/5"
                    />

                    <div className="relative z-10 p-6 text-bone sm:p-7">
                      <h3 className="display on-photo text-3xl">{localised(c, 'name', locale)}</h3>
                      {/*
                        The other language, quietly, as a second line. `dir` sits on the
                        span rather than the paragraph on purpose: on the paragraph it
                        also sets the text alignment, which threw this line to the far
                        edge of the card, away from the title it belongs to. On the span
                        the bidi run is still shaped correctly while the paragraph stays
                        aligned to the page direction.
                      */}
                      <p className="on-photo mt-1.5 text-sm text-bone/70">
                        <span dir={rtl ? 'ltr' : 'rtl'} lang={rtl ? 'en' : 'ar'}>
                          {rtl ? c.name_en : c.name_ar}
                        </span>
                      </p>
                      <div className="mt-5 flex items-center justify-between border-t border-bone/20 pt-4 text-sm">
                        <span className="on-photo text-bone/75">
                          {inCategory.length} {tr('itemsCount')}
                        </span>
                        <span className="tabular on-photo text-brass-lit">
                          {tr('from')} <span dir="ltr">{money(from)}</span>
                        </span>
                      </div>
                    </div>
                  </Link>
                );
              })}
            </div>
          </div>
        </section>

        {/* --------------------------------------------------------------- visit */}
        <section id="visit" className="scroll-mt-20 bg-sky-dusk py-24 text-bone sm:py-32">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="grid gap-14 lg:grid-cols-2 lg:gap-20">
              <div>
                <p className="eyebrow text-bone/75">{tr('visitEyebrow')}</p>
                <h2 className="display mt-5 text-[clamp(2.5rem,6vw,4.5rem)]">{tr('visitTitle')}</h2>
                <address className="mt-8 not-italic leading-relaxed text-bone/80">
                  {settings ? (rtl ? settings.address_ar : settings.address_en) : ''}
                </address>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href={MAPS_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-full bg-bone px-7 py-3.5 text-[0.78rem] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-brass-lit"
                  >
                    {tr('getDirections')}
                  </a>
                  {settings && (
                    <a
                      href={`tel:${settings.phone.replace(/\s/g, '')}`}
                      dir="ltr"
                      className="tabular rounded-full border border-bone/40 px-7 py-3.5 text-[0.78rem] tracking-[0.06em] transition-colors hover:border-bone hover:bg-bone/10"
                    >
                      {settings.phone}
                    </a>
                  )}
                </div>
              </div>

              <div>
                <p className="eyebrow text-bone/75">{tr('hours')}</p>
                <ul className="mt-6">
                  {hours.map((h) => {
                    const isToday = h.day_of_week === new Date().getDay();
                    return (
                      <li
                        key={h.day_of_week}
                        className={`flex items-center justify-between border-b border-bone/12 py-3.5 text-sm ${
                          isToday ? 'text-bone' : 'text-bone/75'
                        }`}
                      >
                        <span>{dayName(h.day_of_week, locale)}</span>
                        <span className="tabular" dir="ltr">
                          {h.is_closed ? tr('closed') : `${clock(h.opens_at)} – ${clock(h.closes_at)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-5 text-xs text-bone/70">{tr('hoursNote')}</p>
              </div>
            </div>
          </div>
        </section>
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
