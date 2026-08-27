-- 212 Café — editable content, theme and media
--
-- The owner should be able to change the hero image, the headline copy, the brand
-- colours and the opening hours without a developer. Page STRUCTURE stays designed —
-- this is deliberately not a page builder, which mostly makes it easy for a non-designer
-- to make a site worse. Copy, imagery, colour and business details become data.
--
-- business_settings already owns name, taglines, address, phone, email, Instagram,
-- hours, currency, tax and accepting_orders. It is reused rather than duplicated.

begin;

-- ------------------------------------------------------------------ site_content
--
-- One row per editable string, in both languages. Seeded from src/lib/copy.json, which
-- is also what the app falls back to when a key is missing — so a failed lookup renders
-- the designed default rather than an empty page.

create table if not exists site_content (
  key         text primary key,
  value_en    text not null default '',
  value_ar    text not null default '',
  -- How the admin UI should render the editor for this row.
  kind        text not null default 'text'
                check (kind in ('text', 'richtext', 'image', 'color', 'number', 'boolean')),
  -- `group` is reserved in SQL; this is the admin UI's section heading.
  group_name  text not null default 'general',
  sort_order  integer not null default 0,
  updated_at  timestamptz not null default now(),
  updated_by  uuid references staff(id) on delete set null
);

-- -------------------------------------------------------------------- site_theme
--
-- Single row, pinned to id = 1, the same shape as business_settings.

create table if not exists site_theme (
  id                 integer primary key default 1 check (id = 1),

  -- Brand colours, as CSS colour strings. Constrained to a hex triplet so a typo
  -- cannot inject arbitrary CSS into the custom-property block on every page.
  brand_ink          text not null default '#14110f' check (brand_ink ~* '^#[0-9a-f]{6}$'),
  brand_bone         text not null default '#f6f1e7' check (brand_bone ~* '^#[0-9a-f]{6}$'),
  brand_brass        text not null default '#b08d4f' check (brand_brass ~* '^#[0-9a-f]{6}$'),

  -- Font family choice, from a fixed list. Free text here would mean an arbitrary
  -- @import, which is both a CSP problem and a way to make the site unreadable.
  display_font       text not null default 'Cormorant Garamond'
                       check (display_font in ('Cormorant Garamond', 'Inter')),
  body_font          text not null default 'Inter'
                       check (body_font in ('Inter', 'Cormorant Garamond')),

  -- Hero imagery and framing. Two paths because the hero is art-directed: a landscape
  -- crop above `sm` and a purpose-made portrait crop below it. See src/lib/site.ts.
  hero_image_path    text not null default '/hero/katara-sunset-wide.webp',
  hero_portrait_path text not null default '/hero/katara-sunset-portrait.webp',

  -- Focal point as percentages, straight into CSS object-position, so the owner can
  -- reframe the hero without a developer or a re-crop.
  hero_focal_x       integer not null default 50 check (hero_focal_x between 0 and 100),
  hero_focal_y       integer not null default 50 check (hero_focal_y between 0 and 100),
  -- Zoom is bounded: past ~1.4 an already-under-resolution hero visibly falls apart.
  hero_zoom          numeric(3,2) not null default 1.00 check (hero_zoom between 1.00 and 1.40),

  corner_radius      text not null default 'sm' check (corner_radius in ('none', 'sm', 'md', 'lg')),

  updated_at         timestamptz not null default now(),
  updated_by         uuid references staff(id) on delete set null
);

insert into site_theme (id) values (1) on conflict (id) do nothing;

-- ----------------------------------------------------------------------- triggers

create trigger site_content_touch before update on site_content
  for each row execute function touch_updated_at();
create trigger site_theme_touch before update on site_theme
  for each row execute function touch_updated_at();

-- Audit, extending the coverage from 0005 to the new tables.
create trigger site_content_audit
  after insert or update or delete on site_content
  for each row execute function log_audit();
create trigger site_theme_audit
  after update on site_theme
  for each row execute function log_audit();

-- --------------------------------------------------------------------------- RLS
--
-- ⚠ Both halves matter. RLS with no SELECT policy is not "locked down", it is a site
-- with no copy on it: anon reads return zero rows and every string silently falls back
-- to the compiled dictionary. That failure hides completely in local development, where
-- the fallback looks identical to success.

alter table site_content enable row level security;
alter table site_theme   enable row level security;

create policy "public reads content" on site_content
  for select to anon, authenticated using (true);
create policy "managers write content" on site_content
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

create policy "public reads theme" on site_theme
  for select to anon, authenticated using (true);
create policy "managers write theme" on site_theme
  for all to authenticated using (private.can_manage()) with check (private.can_manage());

-- ------------------------------------------------------------------ media bucket
--
-- Public read, because these are the images on a public marketing site. Writes are
-- restricted to managers — the same boundary as the menu itself.
--
-- This is only the second line of defence. The upload route re-encodes every file
-- through sharp before it ever reaches Storage, so what lands here is pixels and
-- nothing else: no EXIF, no trailing payload, no polyglot file that is a valid image
-- and a valid script at once.

insert into storage.buckets (id, name, public)
values ('media', 'media', true)
on conflict (id) do nothing;

drop policy if exists "public reads media" on storage.objects;
create policy "public reads media" on storage.objects
  for select to anon, authenticated using (bucket_id = 'media');

drop policy if exists "managers upload media" on storage.objects;
create policy "managers upload media" on storage.objects
  for insert to authenticated with check (bucket_id = 'media' and private.can_manage());

drop policy if exists "managers update media" on storage.objects;
create policy "managers update media" on storage.objects
  for update to authenticated using (bucket_id = 'media' and private.can_manage());

drop policy if exists "managers delete media" on storage.objects;
create policy "managers delete media" on storage.objects
  for delete to authenticated using (bucket_id = 'media' and private.can_manage());

commit;
