'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AdminShell, SignOutButton } from '@/components/admin/AdminShell';
import { currentAccessToken, getBrowserClient } from '@/lib/supabase/client';
import { money } from '@/lib/format';
import {
  approveDraftCopy,
  saveContent,
  saveTheme,
  setImagePath,
  setItemSignature,
} from '../actions';

/**
 * /admin/content — the café's own control over how the site looks and reads.
 *
 * Managers and up. Page STRUCTURE is deliberately not editable: this is a CMS, not a
 * page builder. Sections, their order and their layout stay designed; the words, the
 * pictures and the colours inside them belong to the owner.
 *
 * Every save goes through a Server Action, so the write, the audit row and the cache
 * invalidation happen together. Nothing on this page talks to PostgREST directly except
 * the initial reads.
 */
export default function ContentPage() {
  return (
    <AdminShell title="Site content" allow={['owner', 'admin', 'manager']}>
      {() => <Content />}
    </AdminShell>
  );
}

type Tab = 'appearance' | 'copy' | 'menu';

type ContentRow = {
  key: string;
  value_en: string;
  value_ar: string;
  group_name: string;
  sort_order: number;
};

type Theme = {
  brand_ink: string;
  brand_bone: string;
  brand_brass: string;
  display_font: 'Cormorant Garamond' | 'Inter';
  body_font: 'Inter' | 'Cormorant Garamond';
  hero_image_path: string;
  hero_portrait_path: string;
  hero_focal_x: number;
  hero_focal_y: number;
  hero_zoom: number;
  corner_radius: 'none' | 'sm' | 'md' | 'lg';
};

type Item = {
  id: string;
  name_en: string;
  price: number;
  image_path: string | null;
  is_signature: boolean;
  copy_source: 'cafe' | 'draft';
  description_en: string;
  description_ar: string;
};

type Category = { id: string; name_en: string; image_path: string | null };

function Content() {
  const [tab, setTab] = useState<Tab>('appearance');
  const [rows, setRows] = useState<ContentRow[]>([]);
  const [theme, setTheme] = useState<Theme | null>(null);
  const [items, setItems] = useState<Item[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(async () => {
    const supabase = getBrowserClient();
    const [c, t, i, cat] = await Promise.all([
      supabase.from('site_content').select('key,value_en,value_ar,group_name,sort_order').order('sort_order'),
      supabase.from('site_theme').select('*').eq('id', 1).maybeSingle(),
      supabase
        .from('menu_items')
        .select('id,name_en,price,image_path,is_signature,copy_source,description_en,description_ar')
        .order('name_en'),
      supabase.from('menu_categories').select('id,name_en,image_path').order('sort_order'),
    ]);
    setRows((c.data ?? []) as ContentRow[]);
    if (t.data) setTheme({ ...(t.data as Theme), hero_zoom: Number(t.data.hero_zoom) });
    setItems(
      ((i.data ?? []) as (Omit<Item, 'price'> & { price: string })[]).map((x) => ({
        ...x,
        price: Number(x.price),
      })),
    );
    setCategories((cat.data ?? []) as Category[]);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  /** Wraps every save: fetches a fresh token, reports the outcome, reloads. */
  const run = useCallback(
    async (label: string, fn: (token: string) => Promise<{ ok: boolean; error?: string }>) => {
      const token = await currentAccessToken();
      if (!token) {
        setNotice({ tone: 'bad', text: 'Your session has expired. Please sign in again.' });
        return false;
      }
      const result = await fn(token);
      setNotice(
        result.ok
          ? { tone: 'ok', text: `${label} saved. The public site is already showing it.` }
          : { tone: 'bad', text: result.error ?? 'That could not be saved.' },
      );
      if (result.ok) await load();
      return result.ok;
    },
    [load],
  );

  const drafts = useMemo(() => items.filter((i) => i.copy_source === 'draft'), [items]);

  return (
    <div data-surface="dark" className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <header className="sticky top-0 z-30 border-b border-[var(--line)] bg-[var(--bg)]/94 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-4">
            <span className="display text-2xl">212</span>
            <span className="eyebrow">Site content</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              target="_blank"
              className="rounded-full border border-[var(--line)] px-4 py-2 text-[0.75rem] transition-colors hover:border-brass hover:text-brass"
            >
              View site
            </Link>
            <Link
              href="/admin"
              className="rounded-full border border-[var(--line)] px-4 py-2 text-[0.75rem] transition-colors hover:border-brass hover:text-brass"
            >
              Dashboard
            </Link>
            <SignOutButton />
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-8">
        <nav className="flex flex-wrap gap-1">
          {(
            [
              ['appearance', 'Appearance'],
              ['copy', `Copy (${rows.length})`],
              ['menu', `Menu${drafts.length ? ` · ${drafts.length} draft` : ''}`],
            ] as [Tab, string][]
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setTab(id)}
              className={`rounded-full px-4 py-2 text-[0.8rem] transition-colors ${
                tab === id ? 'bg-brass text-bone' : 'text-[var(--muted)] hover:text-[var(--fg)]'
              }`}
            >
              {label}
            </button>
          ))}
        </nav>

        {notice && (
          <p
            role="status"
            className={`mt-5 rounded-lg border px-4 py-3 text-[0.82rem] ${
              notice.tone === 'ok'
                ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-200'
                : 'border-red-500/40 bg-red-500/10 text-red-200'
            }`}
          >
            {notice.text}
          </p>
        )}

        {loading && <p className="mt-8 text-sm text-[var(--muted)]">Loading…</p>}

        {!loading && tab === 'appearance' && theme && (
          <Appearance theme={theme} onSave={(next) => run('Appearance', (t) => saveTheme(t, next))} />
        )}
        {!loading && tab === 'copy' && (
          <Copy
            rows={rows}
            onSave={(key, en, ar) => run('Copy', (t) => saveContent(t, key, en, ar))}
          />
        )}
        {!loading && tab === 'menu' && (
          <Menu
            items={items}
            categories={categories}
            onSignature={(id, v) => run('Signature', (t) => setItemSignature(t, id, v))}
            onApprove={(id) => run('Description', (t) => approveDraftCopy(t, id))}
            onImage={(table, id, path) => run('Image', (t) => setImagePath(t, table, id, path))}
          />
        )}

        {!loading && <Export />}
      </main>
    </div>
  );
}

/* ------------------------------------------------------------------- appearance */

function Appearance({
  theme,
  onSave,
}: {
  theme: Theme;
  onSave: (next: Theme) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState<Theme>(theme);
  const [busy, setBusy] = useState(false);
  const set = <K extends keyof Theme>(k: K, v: Theme[K]) => setDraft((d) => ({ ...d, [k]: v }));

  const dirty = JSON.stringify(draft) !== JSON.stringify(theme);

  return (
    <section className="mt-8 space-y-8">
      <Panel
        title="Hero image"
        hint="The first thing anyone sees. Two crops: a wide one for desktop, a tall one for phones — a wide photo squeezed into a phone screen loses the sky and the marina, which is the whole picture."
      >
        <div className="grid gap-6 sm:grid-cols-2">
          <ImageField
            label="Wide (desktop)"
            value={draft.hero_image_path}
            aspect="16 / 9"
            onChange={(p) => set('hero_image_path', p)}
          />
          <ImageField
            label="Tall (phone)"
            value={draft.hero_portrait_path}
            aspect="3 / 4"
            onChange={(p) => set('hero_portrait_path', p)}
          />
        </div>

        <div className="mt-6 grid gap-5 sm:grid-cols-3">
          <Range
            label={`Focal point — across (${draft.hero_focal_x}%)`}
            value={draft.hero_focal_x}
            min={0}
            max={100}
            step={1}
            onChange={(v) => set('hero_focal_x', v)}
          />
          <Range
            label={`Focal point — down (${draft.hero_focal_y}%)`}
            value={draft.hero_focal_y}
            min={0}
            max={100}
            step={1}
            onChange={(v) => set('hero_focal_y', v)}
          />
          <Range
            label={`Zoom (${draft.hero_zoom.toFixed(2)}×)`}
            value={draft.hero_zoom}
            min={1}
            max={1.4}
            step={0.05}
            onChange={(v) => set('hero_zoom', v)}
          />
        </div>
        <p className="mt-3 text-[0.75rem] text-[var(--muted)]">
          Zoom stops at 1.4×. The current hero source is only 1200×900, and past that it
          visibly falls apart.
        </p>
      </Panel>

      <Panel title="Brand colours" hint="Used across every page. Six-digit hex only.">
        <div className="grid gap-5 sm:grid-cols-3">
          <ColorField label="Ink (dark)" value={draft.brand_ink} onChange={(v) => set('brand_ink', v)} />
          <ColorField label="Bone (light)" value={draft.brand_bone} onChange={(v) => set('brand_bone', v)} />
          <ColorField label="Brass (accent)" value={draft.brand_brass} onChange={(v) => set('brand_brass', v)} />
        </div>
      </Panel>

      <Panel
        title="Typography"
        hint="A fixed pair of families, both already self-hosted. Free choice here would mean loading a font from somewhere else, which the site's security policy blocks."
      >
        <div className="grid gap-5 sm:grid-cols-3">
          <Select
            label="Headings"
            value={draft.display_font}
            options={['Cormorant Garamond', 'Inter']}
            onChange={(v) => set('display_font', v as Theme['display_font'])}
          />
          <Select
            label="Body"
            value={draft.body_font}
            options={['Inter', 'Cormorant Garamond']}
            onChange={(v) => set('body_font', v as Theme['body_font'])}
          />
          <Select
            label="Corners"
            value={draft.corner_radius}
            options={['none', 'sm', 'md', 'lg']}
            onChange={(v) => set('corner_radius', v as Theme['corner_radius'])}
          />
        </div>
      </Panel>

      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={!dirty || busy}
          onClick={async () => {
            setBusy(true);
            await onSave(draft);
            setBusy(false);
          }}
          className="rounded-full bg-brass px-6 py-3 text-[0.85rem] text-bone disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save appearance'}
        </button>
        {dirty && (
          <button
            type="button"
            onClick={() => setDraft(theme)}
            className="text-[0.8rem] text-[var(--muted)] hover:text-[var(--fg)]"
          >
            Discard changes
          </button>
        )}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------- copy */

function Copy({
  rows,
  onSave,
}: {
  rows: ContentRow[];
  onSave: (key: string, en: string, ar: string) => Promise<boolean>;
}) {
  const [drafts, setDrafts] = useState<Record<string, { en: string; ar: string }>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const groups = useMemo(() => {
    const filtered = query
      ? rows.filter(
          (r) =>
            r.key.toLowerCase().includes(query.toLowerCase()) ||
            r.value_en.toLowerCase().includes(query.toLowerCase()),
        )
      : rows;
    const map = new Map<string, ContentRow[]>();
    for (const r of filtered) map.set(r.group_name, [...(map.get(r.group_name) ?? []), r]);
    return [...map.entries()];
  }, [rows, query]);

  return (
    <section className="mt-8">
      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search the site's words…"
        className="w-full rounded-lg border border-[var(--line)] bg-transparent px-4 py-3 text-[0.85rem] placeholder:text-[var(--muted)]/60 focus:border-brass focus:outline-none"
      />

      {groups.map(([group, list]) => (
        <div key={group} className="mt-8">
          <p className="eyebrow">{group}</p>
          <div className="mt-4 space-y-5">
            {list.map((r) => {
              const draft = drafts[r.key] ?? { en: r.value_en, ar: r.value_ar };
              const dirty = draft.en !== r.value_en || draft.ar !== r.value_ar;
              return (
                <div key={r.key} className="rounded-lg border border-[var(--line)] p-4">
                  <p className="tabular text-[0.7rem] text-[var(--muted)]">{r.key}</p>
                  <div className="mt-2 grid gap-3 sm:grid-cols-2">
                    <label className="block">
                      <span className="text-[0.7rem] text-[var(--muted)]">English</span>
                      <textarea
                        rows={2}
                        value={draft.en}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [r.key]: { ...draft, en: e.target.value } }))
                        }
                        className="mt-1 w-full rounded border border-[var(--line)] bg-transparent px-3 py-2 text-[0.85rem] focus:border-brass focus:outline-none"
                      />
                    </label>
                    <label className="block">
                      <span className="text-[0.7rem] text-[var(--muted)]">العربية</span>
                      <textarea
                        rows={2}
                        dir="rtl"
                        lang="ar"
                        value={draft.ar}
                        onChange={(e) =>
                          setDrafts((d) => ({ ...d, [r.key]: { ...draft, ar: e.target.value } }))
                        }
                        className="mt-1 w-full rounded border border-[var(--line)] bg-transparent px-3 py-2 text-[0.85rem] focus:border-brass focus:outline-none"
                      />
                    </label>
                  </div>
                  {dirty && (
                    <div className="mt-3 flex items-center gap-3">
                      <button
                        type="button"
                        disabled={busy === r.key}
                        onClick={async () => {
                          setBusy(r.key);
                          const ok = await onSave(r.key, draft.en, draft.ar);
                          if (ok) setDrafts((d) => ({ ...d, [r.key]: undefined as never }));
                          setBusy(null);
                        }}
                        className="rounded-full bg-brass px-4 py-1.5 text-[0.75rem] text-bone disabled:opacity-40"
                      >
                        {busy === r.key ? 'Saving…' : 'Save'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setDrafts((d) => ({ ...d, [r.key]: undefined as never }))}
                        className="text-[0.75rem] text-[var(--muted)] hover:text-[var(--fg)]"
                      >
                        Revert
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ))}
    </section>
  );
}

/* ------------------------------------------------------------------------- menu */

function Menu({
  items,
  categories,
  onSignature,
  onApprove,
  onImage,
}: {
  items: Item[];
  categories: Category[];
  onSignature: (id: string, v: boolean) => Promise<boolean>;
  onApprove: (id: string) => Promise<boolean>;
  onImage: (table: 'menu_items' | 'menu_categories', id: string, path: string) => Promise<boolean>;
}) {
  const drafts = items.filter((i) => i.copy_source === 'draft');

  return (
    <section className="mt-8 space-y-8">
      {drafts.length > 0 && (
        <Panel
          title={`${drafts.length} descriptions await your approval`}
          hint="These items had no description at all — the café never wrote one. These were drafted from the photographs and the item names. They are marked as ours, not yours, until you approve them. Edit the wording in the database or approve as-is."
        >
          <ul className="space-y-3">
            {drafts.map((i) => (
              <li key={i.id} className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-4">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="text-[0.9rem] font-medium">{i.name_en}</p>
                  <span className="eyebrow shrink-0 text-amber-300">draft</span>
                </div>
                <p className="mt-1.5 text-[0.82rem] leading-relaxed text-[var(--muted)]">
                  {i.description_en}
                </p>
                <p dir="rtl" lang="ar" className="mt-1 text-[0.82rem] leading-relaxed text-[var(--muted)]">
                  {i.description_ar}
                </p>
                <button
                  type="button"
                  onClick={() => onApprove(i.id)}
                  className="mt-3 rounded-full border border-[var(--line)] px-4 py-1.5 text-[0.75rem] transition-colors hover:border-brass hover:text-brass"
                >
                  Approve as ours
                </button>
              </li>
            ))}
          </ul>
        </Panel>
      )}

      <Panel title="Category photographs" hint="One image per section on the homepage.">
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((c) => (
            <ImageField
              key={c.id}
              label={c.name_en}
              value={c.image_path ?? ''}
              aspect="4 / 5"
              onChange={(p) => onImage('menu_categories', c.id, p)}
              saveOnChange
            />
          ))}
        </div>
      </Panel>

      <Panel
        title="Signature items"
        hint="What the homepage leads with. Choose items you have a real photograph of — two of the previous five were AI-generated stock rather than pictures of your food."
      >
        <ul className="max-h-[28rem] space-y-1 overflow-y-auto">
          {items.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-1.5">
              <span className="flex min-w-0 items-center gap-3">
                {i.image_path && (
                  <span className="relative h-9 w-9 shrink-0 overflow-hidden rounded bg-white/5">
                    <Image src={i.image_path} alt="" fill sizes="36px" className="object-cover" />
                  </span>
                )}
                <span className="truncate text-[0.85rem]">{i.name_en}</span>
                <span className="tabular shrink-0 text-[0.75rem] text-[var(--muted)]">
                  {money(i.price)}
                </span>
              </span>
              <button
                type="button"
                onClick={() => onSignature(i.id, !i.is_signature)}
                aria-label={`${i.is_signature ? 'Remove from' : 'Add to'} signatures: ${i.name_en}`}
                className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${
                  i.is_signature ? 'bg-brass' : 'bg-white/15'
                }`}
              >
                <span
                  className={`absolute top-0.5 h-4 w-4 rounded-full bg-bone transition-all ${
                    i.is_signature ? 'start-[18px]' : 'start-0.5'
                  }`}
                />
              </button>
            </li>
          ))}
        </ul>
      </Panel>
    </section>
  );
}

/* ----------------------------------------------------------------------- export */

/**
 * Everything above is already live — this is about the repository, not the site.
 *
 * There is deliberately no button that performs the export. The deployed app runs on a
 * read-only filesystem and cannot write into its own git repository, so a button here
 * could only ever appear to work. It prints the command instead, and a person runs it
 * and reviews the diff.
 */
function Export() {
  const [copied, setCopied] = useState(false);
  const command = 'EXPORT_EMAIL=you@212cafe.qa EXPORT_PASSWORD=… node scripts/export-content.mjs';

  return (
    <div className="mt-8 rounded-lg border border-dashed border-[var(--line)] p-6">
      <h2 className="display text-2xl">Keep a copy in the code</h2>
      <p className="mt-2 max-w-2xl text-[0.8rem] leading-relaxed text-[var(--muted)]">
        Your changes are already live — this does not publish anything. It writes what you
        have configured back into the project, so a fresh install of the site starts out
        looking exactly like this one instead of reverting to the defaults. Worth running
        after a session of edits.
      </p>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <code className="tabular rounded border border-[var(--line)] bg-black/30 px-3 py-2 text-[0.72rem]">
          {command}
        </code>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard?.writeText(command);
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
          }}
          className="rounded-full border border-[var(--line)] px-4 py-1.5 text-[0.75rem] transition-colors hover:border-brass hover:text-brass"
        >
          {copied ? 'Copied' : 'Copy command'}
        </button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------- primitives */

function Panel({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[var(--line)] p-6">
      <h2 className="display text-2xl">{title}</h2>
      {hint && <p className="mt-2 max-w-2xl text-[0.8rem] leading-relaxed text-[var(--muted)]">{hint}</p>}
      <div className="mt-5">{children}</div>
    </div>
  );
}

/**
 * An image slot: shows what is there, and accepts a replacement.
 *
 * The upload goes to /api/admin/upload, which re-encodes whatever is sent through sharp
 * before it reaches storage — so the file that lands is pixels and nothing else.
 */
function ImageField({
  label,
  value,
  aspect,
  onChange,
  saveOnChange,
}: {
  label: string;
  value: string;
  aspect: string;
  onChange: (path: string) => void;
  saveOnChange?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    const token = await currentAccessToken();
    if (!token) {
      setError('Session expired.');
      setBusy(false);
      return;
    }
    const body = new FormData();
    body.append('file', file);
    const res = await fetch('/api/admin/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body,
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) setError(json.error ?? 'Upload failed.');
    else onChange(json.path);
    setBusy(false);
  };

  return (
    <div>
      <p className="text-[0.75rem] text-[var(--muted)]">{label}</p>
      <div
        className="relative mt-2 overflow-hidden rounded border border-[var(--line)] bg-white/5"
        style={{ aspectRatio: aspect }}
      >
        {value && (
          <Image src={value} alt="" fill sizes="320px" className="object-cover" unoptimized={false} />
        )}
      </div>
      <label className="mt-2 inline-block cursor-pointer text-[0.75rem] text-brass hover:underline">
        {busy ? 'Uploading…' : saveOnChange ? 'Replace and save' : 'Replace'}
        <input
          type="file"
          accept="image/*"
          className="hidden"
          disabled={busy}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) upload(f);
            e.target.value = '';
          }}
        />
      </label>
      {error && <p className="mt-1 text-[0.72rem] text-red-400">{error}</p>}
    </div>
  );
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.75rem] text-[var(--muted)]">{label}</span>
      <div className="mt-1.5 flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 cursor-pointer rounded border border-[var(--line)] bg-transparent"
        />
        <input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="tabular w-28 rounded border border-[var(--line)] bg-transparent px-2.5 py-2 text-[0.8rem] focus:border-brass focus:outline-none"
        />
      </div>
    </label>
  );
}

function Select({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: string[];
  onChange: (v: string) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.75rem] text-[var(--muted)]">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="mt-1.5 w-full rounded border border-[var(--line)] bg-[var(--bg)] px-3 py-2 text-[0.85rem] focus:border-brass focus:outline-none"
      >
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}

function Range({
  label,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="block">
      <span className="text-[0.75rem] text-[var(--muted)]">{label}</span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="mt-2 w-full accent-brass"
      />
    </label>
  );
}
