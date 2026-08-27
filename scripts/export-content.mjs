// Export what the owner configured in /admin/content back into the repository.
//
//   node scripts/export-content.mjs
//
// The live site is authoritative and instant: an edit in /admin/content is on the public
// site on the next load. This closes the other half — it makes a FRESH CLONE reproduce
// that state, so the configured site is not stranded in one database.
//
// Why this is a script you run and not a button that commits: Vercel's filesystem is
// read-only at runtime, so the deployed app cannot write into its own repository. The
// Export control in the admin UI tells the operator to run this; pretending otherwise
// would produce a button that silently does nothing in production.
//
// It never commits by itself either. It writes files and prints the git command, so the
// diff is reviewed by a person before it lands.
import fs from 'fs';
import path from 'path';
import url from 'url';

const ROOT = path.resolve(path.dirname(url.fileURLToPath(import.meta.url)), '..');

// Read .env.local the same way start.sh does, so this needs no extra setup.
const envPath = path.join(ROOT, '.env.local');
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
}

const URL_BASE = process.env.NEXT_PUBLIC_SUPABASE_URL;
const KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!URL_BASE || !KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.');
  process.exit(2);
}

/**
 * This must run as a staff member, not as anon.
 *
 * RLS on menu_items is `is_available or private.is_staff()`, so the anon key cannot see
 * items the café has switched off. An anonymous export therefore SILENTLY drops them —
 * it succeeded, printed a cheerful count, and quietly omitted five items whose
 * photography and approved copy would have been lost on the next fresh clone. Nothing
 * about the output would have looked wrong.
 */
const EMAIL = process.env.EXPORT_EMAIL ?? process.env.ADMIN_EMAIL;
const PASSWORD = process.env.EXPORT_PASSWORD ?? process.env.DEMO_STAFF_PASSWORD;

if (!EMAIL || !PASSWORD) {
  console.error(`
  This export must sign in as a manager or owner.

  Row Level Security hides unavailable menu items from the anonymous key, so an
  anonymous export would silently omit every sold-out or switched-off item — and the
  resulting seed would look complete.

      EXPORT_EMAIL=owner@… EXPORT_PASSWORD=… node scripts/export-content.mjs
`);
  process.exit(2);
}

const signIn = async () => {
  const res = await fetch(`${URL_BASE}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: EMAIL, password: PASSWORD }),
  });
  const json = await res.json();
  if (!json.access_token) {
    throw new Error(`sign-in failed for ${EMAIL}: ${json.error_description || json.msg || res.status}`);
  }
  return json.access_token;
};

const TOKEN = await signIn();
console.log(`Signed in as ${EMAIL}.`);

const q = (s) => (s === null || s === undefined ? 'null' : `'${String(s).replace(/'/g, "''")}'`);

const rest = async (pathname) => {
  const res = await fetch(`${URL_BASE}/rest/v1/${pathname}`, {
    headers: { apikey: KEY, Authorization: `Bearer ${TOKEN}` },
  });
  if (!res.ok) throw new Error(`${pathname}: ${res.status} ${await res.text()}`);
  return res.json();
};

console.log('Reading the live configuration…');

const [content, theme, settings, hours, categories, items] = await Promise.all([
  rest('site_content?select=key,value_en,value_ar,kind,group_name,sort_order&order=sort_order'),
  rest('site_theme?select=*&id=eq.1'),
  rest('business_settings?select=*&id=eq.1'),
  rest('business_hours?select=day_of_week,opens_at,closes_at,is_closed&order=day_of_week'),
  rest('menu_categories?select=slug,image_path&order=sort_order'),
  // is_signature and copy_source are presentation decisions the owner makes; prices and
  // names are the café's data and belong to the seed in 0003, not here.
  rest('menu_items?select=sku,is_available,is_signature,copy_source,image_path,description_en,description_ar&order=sku'),
]);

const t = theme[0];
if (!t) throw new Error('No site_theme row — has migration 0007 been applied?');

/* ------------------------------------------------------------------ media files */
//
// Storage objects are downloaded into public/ and the paths rewritten, so a fresh clone
// serves them as static assets and does not depend on the Storage bucket still existing.

const MEDIA_PREFIX = `${URL_BASE}/storage/v1/object/public/media/`;
const OUT_MEDIA = path.join(ROOT, 'public/uploads');
const rewrites = new Map();

const collect = (value) => {
  if (typeof value === 'string' && value.startsWith(MEDIA_PREFIX)) rewrites.set(value, null);
};
collect(t.hero_image_path);
collect(t.hero_portrait_path);
for (const c of categories) collect(c.image_path);
for (const i of items) collect(i.image_path);
for (const r of content) if (r.kind === 'image') collect(r.value_en);

if (rewrites.size) {
  fs.mkdirSync(OUT_MEDIA, { recursive: true });
  console.log(`Downloading ${rewrites.size} uploaded image(s)…`);
  for (const remote of [...rewrites.keys()]) {
    const name = remote.slice(MEDIA_PREFIX.length).replace(/[^A-Za-z0-9._-]/g, '_');
    const res = await fetch(remote);
    if (!res.ok) {
      console.warn(`  ! could not fetch ${remote} (${res.status}) — leaving the URL as-is`);
      rewrites.delete(remote);
      continue;
    }
    fs.writeFileSync(path.join(OUT_MEDIA, name), Buffer.from(await res.arrayBuffer()));
    rewrites.set(remote, `/uploads/${name}`);
    console.log(`  ${name}`);
  }
}

const localise = (value) => (rewrites.get(value) ?? value);

/* --------------------------------------------------------------------- the seed */

const lines = [];
lines.push(`-- 212 Café — the configured site, exported from the live database
--
-- GENERATED by scripts/export-content.mjs on ${new Date().toISOString().slice(0, 10)}.
-- Do not hand-edit: change it in /admin/content and export again.
--
-- This is what makes a fresh clone reproduce what the owner set up. The live site is
-- still authoritative; this is its checked-in mirror. Uploaded images were downloaded
-- into public/uploads/ and the paths below rewritten to match, so a clone does not
-- depend on the Storage bucket.
--
-- Upserts, not inserts: re-running this brings a database up to the exported state
-- rather than failing on rows that already exist.

begin;
`);

lines.push('-- ------------------------------------------------------------------ theme');
lines.push(`update site_theme set
  brand_ink          = ${q(t.brand_ink)},
  brand_bone         = ${q(t.brand_bone)},
  brand_brass        = ${q(t.brand_brass)},
  display_font       = ${q(t.display_font)},
  body_font          = ${q(t.body_font)},
  hero_image_path    = ${q(localise(t.hero_image_path))},
  hero_portrait_path = ${q(localise(t.hero_portrait_path))},
  hero_focal_x       = ${t.hero_focal_x},
  hero_focal_y       = ${t.hero_focal_y},
  hero_zoom          = ${t.hero_zoom},
  corner_radius      = ${q(t.corner_radius)}
where id = 1;\n`);

lines.push('-- ------------------------------------------------------------------- copy');
lines.push('insert into site_content (key, value_en, value_ar, kind, group_name, sort_order) values');
lines.push(
  content
    .map(
      (r) =>
        `  (${q(r.key)}, ${q(localise(r.value_en))}, ${q(r.value_ar)}, ${q(r.kind)}, ${q(r.group_name)}, ${r.sort_order})`,
    )
    .join(',\n'),
);
lines.push(`on conflict (key) do update set
  value_en   = excluded.value_en,
  value_ar   = excluded.value_ar,
  kind       = excluded.kind,
  group_name = excluded.group_name,
  sort_order = excluded.sort_order;\n`);

const s = settings[0];
if (s) {
  lines.push('-- --------------------------------------------------------------- business');
  lines.push(`update business_settings set
  name_en          = ${q(s.name_en)},
  name_ar          = ${q(s.name_ar)},
  tagline_en       = ${q(s.tagline_en)},
  tagline_ar       = ${q(s.tagline_ar)},
  address_en       = ${q(s.address_en)},
  address_ar       = ${q(s.address_ar)},
  phone            = ${q(s.phone)},
  email            = ${q(s.email)},
  instagram        = ${q(s.instagram)},
  currency         = ${q(s.currency)},
  accepting_orders = ${s.accepting_orders}
where id = 1;\n`);

  lines.push('insert into business_hours (day_of_week, opens_at, closes_at, is_closed) values');
  lines.push(
    hours
      .map((h) => `  (${h.day_of_week}, ${q(h.opens_at)}, ${q(h.closes_at)}, ${h.is_closed})`)
      .join(',\n'),
  );
  lines.push(`on conflict (day_of_week) do update set
  opens_at  = excluded.opens_at,
  closes_at = excluded.closes_at,
  is_closed = excluded.is_closed;\n`);
}

lines.push('-- ------------------------------------------------- menu presentation');
lines.push('-- Category imagery.');
for (const c of categories) {
  if (!c.image_path) continue;
  lines.push(
    `update menu_categories set image_path = ${q(localise(c.image_path))} where slug = ${q(c.slug)};`,
  );
}

lines.push('\n-- Signature selection, photography and approved copy, keyed on the café\'s own SKU.');
for (const i of items) {
  if (!i.sku) continue;
  lines.push(
    `update menu_items set is_signature = ${i.is_signature}, copy_source = ${q(i.copy_source)}, ` +
      `image_path = ${q(localise(i.image_path))}, description_en = ${q(i.description_en)}, ` +
      `description_ar = ${q(i.description_ar)} where sku = ${q(i.sku)};`,
  );
}

lines.push('\ncommit;');

const out = path.join(ROOT, 'supabase/migrations/0009_configured_site.sql');
fs.writeFileSync(out, `${lines.join('\n')}\n`);

console.log(`\n  ✓ wrote ${path.relative(ROOT, out)}`);
console.log(`    ${content.length} copy rows, ${categories.length} categories, ${items.length} items`);

// A staff session sees every item; anon sees only the available ones. Reporting the
// split makes a silently-degraded sign-in visible: if this ever reads "0 switched off"
// on a menu that has some, the export is running with less access than it needs.
const off = items.filter((i) => i.is_available === false).length;
console.log(`    ${off} of those are switched off (only a staff session can see them)`);
if (rewrites.size) console.log(`    ${rewrites.size} image(s) into public/uploads/`);
console.log('\n  Review the diff, then commit it:\n');
console.log('      git add -A && git commit -m "Export the configured site"\n');
