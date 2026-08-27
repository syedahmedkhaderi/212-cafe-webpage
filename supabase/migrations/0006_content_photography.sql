-- 212 Café — drafted copy, honest photography, and category imagery
--
-- Three related problems, all visible on the homepage:
--
--   1. Nineteen of the 53 sellable items have NO description. The café never wrote one.
--      The menu therefore renders half-finished, and "the 3 Layers" — a signature — is
--      a bare name and a price.
--
--   2. Two of the five signature items are illustrated with AI-generated stock rather
--      than photographs of the café's food (see below, and data/FINDINGS.md).
--
--   3. Category cards on the homepage carry no imagery at all, so a menu built on
--      genuinely good photography advertises itself with empty boxes.
--
-- Why this is a migration and not a regeneration of 0003_seed.sql: 0003 is the record
-- of what was crawled from the incumbent on 2026-08-26. Rewriting it would blur the
-- café's real data with ours, and 0003 has already been applied. A fresh clone runs
-- 0003 then 0006 in order, so it still reproduces this state exactly.

begin;

-- ------------------------------------------------------------- copy provenance
--
-- The honesty rule this project runs on: the café's own words and ours must never be
-- indistinguishable. Nineteen descriptions below were drafted here — from the item's
-- photograph where there is a real one, and from the name where there is not — and every
-- one is flagged `draft` so the distinction is queryable rather than a comment someone
-- deletes. /admin/content surfaces drafts with a badge and a one-click approve, which is
-- the same treatment the UNCONFIRMED modifier prices get.

alter table menu_items
  add column if not exists copy_source text not null default 'cafe'
    check (copy_source in ('cafe', 'draft'));

comment on column menu_items.copy_source is
  'cafe = the café''s own description, crawled from their menu. '
  'draft = written for them and awaiting the owner''s approval.';

-- Category imagery, admin-editable. Defaults chosen below from real photography.
alter table menu_categories
  add column if not exists image_path text;

-- ------------------------------------------------------------- drafted copy
--
-- Keyed on sku, which is the café's own product code and stable across re-seeds.

update menu_items set copy_source = 'draft', description_en = d.en, description_ar = d.ar
from (values
  -- Hot Beverage ------------------------------------------------------------
  ('0003',
   'Espresso and steamed milk over a tiramisu syrup, finished with a dusting of cocoa.',
   'إسبريسو وحليب مبخّر مع شراب التيراميسو، ويُزيَّن برشّة من الكاكاو.'),
  ('0011',
   'Loose-leaf green tea, steeped gently so it stays clean and grassy rather than bitter.',
   'شاي أخضر بأوراق كاملة، يُنقع برفق ليبقى نقياً ومنعشاً بلا مرارة.'),
  ('0017',
   'Espresso with condensed and steamed milk — sweeter and rounder than a standard latte.',
   'إسبريسو مع الحليب المكثّف والمبخّر — أحلى وأكثر نعومة من اللاتيه المعتاد.'),
  ('0019',
   'Coffee brewed by hand through a V60 cone, poured slowly for a clean, aromatic cup. Served black.',
   'قهوة تُحضَّر يدوياً عبر مصفاة V60، تُسكب ببطء لكوب نقي وعطر. تُقدَّم سادة.'),
  ('0109',
   'A single shot, pulled short for a dense, syrupy cup.',
   'شوت واحد، يُستخلص قصيراً لكوب كثيف وغني.'),

  -- Cold Beverage -----------------------------------------------------------
  -- Written from the photograph: three distinct bands in the glass, chocolate on top.
  ('0034',
   'Three layers in one glass — an espresso base, cold milk, and whipped coffee foam — finished with chocolate shavings.',
   'ثلاث طبقات في كوب واحد — قاعدة إسبريسو، وحليب بارد، ورغوة قهوة مخفوقة — مع رقائق الشوكولاتة.'),
  ('0039',
   'Still bottled water, chilled.',
   'مياه معدنية غير غازية، مبرّدة.'),
  ('0040',
   'Chilled sparkling water, served with ice and lemon on request.',
   'مياه غازية مبرّدة، تُقدَّم مع الثلج والليمون عند الطلب.'),
  ('0120',
   'Crushed strawberries under cold milk and a bright layer of matcha, finished with mint.',
   'فراولة مهروسة تحت حليب بارد وطبقة زاهية من الماتشا، وتُزيَّن بالنعناع.'),
  ('0209',
   'Mango and red berry poured in layers over ice so the colours stay apart — made to be looked at against the marina.',
   'مانجو وتوت أحمر يُسكبان بطبقات فوق الثلج لتبقى الألوان منفصلة — صُنع ليُنظر إليه أمام المارينا.'),
  ('0210',
   'Passion fruit over berry with a wheel of lemon and mint — tart, cold and bright.',
   'باشون فروت فوق التوت مع شريحة ليمون ونعناع — منعش وبارد وزاهٍ.'),
  ('0211',
   'Citrus and grenadine poured to fade from orange to red, like the hour it is named after.',
   'حمضيات وشراب الرمان يتدرّجان من البرتقالي إلى الأحمر، كالساعة التي حمل اسمها.'),

  -- Sweets-Pastry -----------------------------------------------------------
  ('0203',
   'Set cheesecake, plated with a cocoa crumb and fresh berries.',
   'تشيز كيك يُقدَّم مع فتات الكاكاو والتوت الطازج.'),

  -- Savoury -----------------------------------------------------------------
  ('0056',
   'Sliced turkey with rocket and tomato in a soft-baked roll, pressed until warm.',
   'شرائح ديك رومي مع الجرجير والطماطم في خبز طري، تُضغط حتى تدفأ.'),
  ('0058',
   'An all-butter croissant baked with cheese through the layers.',
   'كرواسون بالزبدة يُخبز مع الجبن بين طبقاته.'),
  ('0059',
   'An all-butter croissant with dark chocolate folded into the layers.',
   'كرواسون بالزبدة مع الشوكولاتة الداكنة بين طبقاته.'),
  ('0160',
   'An all-butter croissant, baked for a crisp shell and an open, layered crumb.',
   'كرواسون بالزبدة، يُخبز ليكون مقرمشاً من الخارج وهشاً بطبقاته.'),
  ('0207',
   'Tuna and crushed avocado with tomato on toasted seeded bread.',
   'تونة مع الأفوكادو المهروس والطماطم على خبز محمّص بالبذور.'),

  -- Brunch ------------------------------------------------------------------
  ('0075',
   'Eggs baked into a green sauce of spinach and herbs, served in the dish they came out of the oven in.',
   'بيض مخبوز في صلصة خضراء من السبانخ والأعشاب، يُقدَّم في الإناء نفسه الخارج من الفرن.')
) as d(sku, en, ar)
where menu_items.sku = d.sku;

-- ------------------------------------------------------------- signatures
--
-- Eggs Benedict and The French Toast were signature items illustrated with
-- AI-generated stock. Both share a 1408×768 source frame — a generation aspect ratio,
-- not a camera one — with four other crawled images, and The French Toast carries a
-- visible Google Gemini sparkle watermark in its bottom-right corner. The Eggs Benedict
-- frame contains a mug with a garbled "212 café" rendered onto it.
--
-- The items keep selling; only their photography is disqualified from the shopfront.
-- They are replaced by items the café genuinely photographed on its own terrace, with
-- the Katara Towers behind the glass — which is also the claim the whole site makes.

update menu_items set is_signature = false where sku in ('0066', '0052');
update menu_items set is_signature = true  where sku in ('0208', '0209');

-- ------------------------------------------------------- category imagery
--
-- All six are genuine photographs of the café's own food and room — verified by eye,
-- none is from the AI-generated set, and none is one of the twelve duplicated frames.

update menu_categories set image_path = c.path
from (values
  ('hot-beverage',  '/menu/0216-cortado.webp'),
  ('cold-beverage', '/menu/0208-hiby-splash.webp'),
  ('sweets-pastry', '/menu/0049-brownies-chocolate-bomb.webp'),
  ('savoury',       '/menu/0155-halloumi-sandwich.webp'),
  ('salads',        '/menu/0163-chicken-ceaser-salad.webp'),
  ('brunch',        '/menu/0175-shakshooka.webp')
) as c(slug, path)
where menu_categories.slug = c.slug;

commit;
