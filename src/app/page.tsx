import Image from 'next/image';
import Link from 'next/link';
import type { Metadata } from 'next';
import { getBusiness, getMenu } from '@/lib/menu/queries';
import { clock, dayName, isOpenNow, money } from '@/lib/format';
import { HERO_IMAGE, INSTAGRAM_URL, MAPS_URL, VIEW_IMAGES } from '@/lib/site';
import { SiteFooter, SiteHeader } from '@/components/marketing/SiteChrome';
import { SITE_URL } from '@/lib/site-url';

// Short window: the homepage surfaces signature items, so a sold-out signature
// should drop off quickly. /menu and /order are fully dynamic.
export const revalidate = 30;

export const metadata: Metadata = {
  alternates: { canonical: '/' },
};

export default async function HomePage() {
  const [{ categories, items }, { settings, hours }] = await Promise.all([getMenu(), getBusiness()]);

  const signatures = items.filter((i) => i.is_signature && i.is_available);
  const open = isOpenNow(hours);
  const today = hours.find((h) => h.day_of_week === new Date().getDay());

  const jsonLd = {
    '@context': 'https://schema.org',
    '@type': 'CafeOrCoffeeShop',
    name: '212 Café',
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
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <SiteHeader />

      <main>
        {/* ---------------------------------------------------------------- hero */}
        <section className="relative min-h-[100svh] w-full overflow-hidden bg-ink">
          <Image
            src={HERO_IMAGE}
            alt="A 212 signature coffee on the terrace, with the Katara Towers and Lusail Marina behind"
            fill
            priority
            sizes="100vw"
            className="object-cover object-center opacity-85"
          />
          {/* Legibility scrim. Two layers: a light top wash so the header reads, and a
              deep bottom ramp that starts above the copy block — the bright sky and pale
              marble in this photo swallow small text otherwise. */}
          <div
            aria-hidden
            className="absolute inset-0 bg-gradient-to-b from-ink/60 via-transparent to-transparent"
          />
          <div
            aria-hidden
            className="absolute inset-x-0 bottom-0 h-[85%] bg-gradient-to-t from-ink via-ink/88 to-transparent"
          />

          <div className="relative z-10 mx-auto flex min-h-[100svh] max-w-6xl flex-col justify-end px-5 pb-16 sm:px-8 sm:pb-24">
            <p className="eyebrow reveal text-bone/80">Marina Twin Tower A · 30th Floor · Lusail</p>

            <h1 className="display reveal mt-5 text-bone" style={{ animationDelay: '80ms' }}>
              <span className="block text-[clamp(3.5rem,13vw,9rem)]">Coffee</span>
              <span className="block text-[clamp(3.5rem,13vw,9rem)] text-brass-lit">above the city</span>
            </h1>

            <p
              className="reveal mt-7 max-w-md text-[0.95rem] leading-relaxed text-bone/75"
              style={{ animationDelay: '160ms' }}
            >
              Specialty coffee, desserts and brunch, thirty floors over Lusail Marina.
            </p>

            <div className="reveal mt-9 flex flex-wrap items-center gap-3" style={{ animationDelay: '240ms' }}>
              <Link
                href="/menu"
                className="rounded-full bg-bone px-7 py-3.5 text-[0.78rem] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-brass-lit"
              >
                Explore the menu
              </Link>
              <a
                href={MAPS_URL}
                target="_blank"
                rel="noreferrer noopener"
                className="rounded-full border border-bone/40 px-7 py-3.5 text-[0.78rem] uppercase tracking-[0.14em] text-bone transition-colors hover:border-bone hover:bg-bone/10"
              >
                Find us
              </a>
            </div>

            <div
              className="reveal mt-10 flex items-center gap-2.5 text-[0.8rem] text-bone/70"
              style={{ animationDelay: '320ms' }}
            >
              <span
                className={`inline-block h-1.5 w-1.5 rounded-full ${open ? 'bg-emerald-400' : 'bg-bone/40'}`}
                aria-hidden
              />
              {open ? 'Open now' : 'Closed'}
              {today && !today.is_closed && (
                <span className="tabular text-bone/50">
                  · {clock(today.opens_at)} – {clock(today.closes_at)}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------------- view */}
        <section id="view" className="scroll-mt-20 bg-[var(--bg)] py-24 sm:py-32">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="grid items-center gap-14 lg:grid-cols-2 lg:gap-20">
              <div>
                <p className="eyebrow">The View</p>
                <h2 className="display mt-5 text-[clamp(2.5rem,6vw,4.5rem)]">
                  Lusail&rsquo;s best view — and we mean it.
                </h2>
                <p className="mt-7 max-w-md leading-relaxed text-[var(--muted)]">
                  From the 30th floor of Marina Twin Tower A, the Katara Towers curve out of the
                  marina and the Gulf runs to the horizon. Every table is a window seat.
                </p>
                <p className="mt-4 max-w-md leading-relaxed text-[var(--muted)]">
                  It is the reason people come once, and the reason they come back.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-3 sm:gap-4">
                {VIEW_IMAGES.map((v, n) => (
                  <div
                    key={v.src}
                    className={`relative overflow-hidden rounded-sm bg-sand ${
                      n % 3 === 0 ? 'aspect-[3/4]' : 'aspect-square'
                    }`}
                  >
                    <Image
                      src={v.src}
                      alt={`${v.label}, served on the 212 Café terrace overlooking Lusail Marina`}
                      fill
                      sizes="(max-width: 1024px) 45vw, 300px"
                      className="object-cover transition-transform duration-700 hover:scale-[1.04]"
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* ---------------------------------------------------------- signatures */}
        {signatures.length > 0 && (
          <section id="signatures" className="scroll-mt-20 bg-ink py-24 text-bone sm:py-32">
            <div className="mx-auto max-w-6xl px-5 sm:px-8">
              <p className="eyebrow text-bone/50">Signatures</p>
              <h2 className="display mt-5 max-w-2xl text-[clamp(2.5rem,6vw,4.5rem)]">
                What we are known for
              </h2>

              <div className="mt-14 grid gap-x-6 gap-y-12 sm:grid-cols-2 lg:grid-cols-3">
                {signatures.map((item) => (
                  <article key={item.id} className="group">
                    <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-ink-soft">
                      {item.image_path && (
                        <Image
                          src={item.image_path}
                          alt={item.name_en}
                          fill
                          sizes="(max-width: 640px) 90vw, (max-width: 1024px) 45vw, 360px"
                          className="object-cover transition-transform duration-700 group-hover:scale-[1.04]"
                        />
                      )}
                    </div>
                    <div className="mt-5 flex items-baseline justify-between gap-4">
                      <h3 className="display text-2xl">{item.name_en}</h3>
                      <span className="tabular shrink-0 text-sm text-brass-lit">
                        {money(item.price)}
                      </span>
                    </div>
                    {item.description_en && (
                      <p className="mt-2.5 text-sm leading-relaxed text-bone/55">
                        {item.description_en.length > 130
                          ? `${item.description_en.slice(0, 130).trimEnd()}…`
                          : item.description_en}
                      </p>
                    )}
                  </article>
                ))}
              </div>
            </div>
          </section>
        )}

        {/* ---------------------------------------------------------------- menu */}
        <section id="menu" className="scroll-mt-20 bg-[var(--bg)] py-24 sm:py-32">
          <div className="mx-auto max-w-6xl px-5 sm:px-8">
            <div className="flex flex-wrap items-end justify-between gap-6">
              <div>
                <p className="eyebrow">The Menu</p>
                <h2 className="display mt-5 text-[clamp(2.5rem,6vw,4.5rem)]">
                  {items.length} things worth the lift
                </h2>
              </div>
              <Link
                href="/menu"
                className="rounded-full border border-ink/20 px-6 py-3 text-[0.75rem] uppercase tracking-[0.14em] transition-colors hover:border-brass hover:text-brass"
              >
                View full menu
              </Link>
            </div>

            <div className="mt-14 grid gap-px overflow-hidden rounded-sm border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3">
              {categories.map((c) => {
                const inCategory = items.filter((i) => i.category_id === c.id && i.is_available);
                if (inCategory.length === 0) return null;
                const from = Math.min(...inCategory.map((i) => i.price));
                return (
                  <Link
                    key={c.id}
                    href={`/menu#${c.slug}`}
                    className="group flex flex-col justify-between bg-[var(--card)] p-8 transition-colors hover:bg-bone-dim"
                  >
                    <div>
                      <h3 className="display text-3xl">{c.name_en}</h3>
                      <p className="mt-2 text-sm text-[var(--muted)]" dir="rtl" lang="ar">
                        {c.name_ar}
                      </p>
                    </div>
                    <div className="mt-10 flex items-center justify-between text-sm">
                      <span className="text-[var(--muted)]">{inCategory.length} items</span>
                      <span className="tabular text-brass">from {money(from)}</span>
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
                <p className="eyebrow text-bone/50">Visit</p>
                <h2 className="display mt-5 text-[clamp(2.5rem,6vw,4.5rem)]">Thirty floors up</h2>
                <address className="mt-8 not-italic leading-relaxed text-bone/80">
                  Marina Twin Tower A<br />
                  30th Floor<br />
                  Lusail, Qatar
                </address>
                <div className="mt-8 flex flex-wrap gap-3">
                  <a
                    href={MAPS_URL}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-full bg-bone px-7 py-3.5 text-[0.78rem] uppercase tracking-[0.14em] text-ink transition-colors hover:bg-brass-lit"
                  >
                    Get directions
                  </a>
                  {settings && (
                    <a
                      href={`tel:${settings.phone.replace(/\s/g, '')}`}
                      className="tabular rounded-full border border-bone/40 px-7 py-3.5 text-[0.78rem] tracking-[0.06em] transition-colors hover:border-bone hover:bg-bone/10"
                    >
                      {settings.phone}
                    </a>
                  )}
                </div>
              </div>

              <div>
                <p className="eyebrow text-bone/50">Hours</p>
                <ul className="mt-6">
                  {hours.map((h) => {
                    const isToday = h.day_of_week === new Date().getDay();
                    return (
                      <li
                        key={h.day_of_week}
                        className={`flex items-center justify-between border-b border-bone/12 py-3.5 text-sm ${
                          isToday ? 'text-bone' : 'text-bone/55'
                        }`}
                      >
                        <span>{dayName(h.day_of_week, 'en')}</span>
                        <span className="tabular">
                          {h.is_closed ? 'Closed' : `${clock(h.opens_at)} – ${clock(h.closes_at)}`}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="mt-5 text-xs text-bone/40">
                  Hours are managed by the café and update here automatically.
                </p>
              </div>
            </div>
          </div>
        </section>
      </main>

      {settings && (
        <SiteFooter phone={settings.phone} email={settings.email} instagram={settings.instagram} />
      )}
    </>
  );
}
