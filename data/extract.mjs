import fs from 'fs';
const all = JSON.parse(fs.readFileSync('products-raw.json', 'utf8'));

const ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  eacute: 'é', egrave: 'è', agrave: 'à', ccedil: 'ç', uuml: 'ü', ouml: 'ö',
  rsquo: '’', lsquo: '‘', ldquo: '"', rdquo: '"',
  mdash: '—', ndash: '–', hellip: '…', deg: '°',
  laquo: '«', raquo: '»', trade: '™', reg: '®', copy: '©',
};

const decode = (s) => (s || '')
  .replace(/<[^>]+>/g, ' ')
  .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
  .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
  .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m)
  .replace(/\s+/g, ' ').trim();

const ARABIC = /[؀-ۿ]/;

/**
 * Descriptions are authored as HTML paragraphs:
 *   <p><strong>EN:</strong> <strong>Classic Americano</strong></p>
 *   <p>Double shot of rich espresso…</p>
 *   <p><strong>AR:</strong> <strong>أمريكانو كلاسيك</strong></p>
 *   <p>شوت مزدوج…</p>
 *
 * The bolded line is a TITLE, not prose. Flattening the whole blob produced
 * "Fresh Homemade Brownie Fresh homemade brownie topped with…" — the title read
 * twice. So parse paragraph by paragraph and keep the title separate from the body.
 */
function splitDesc(raw) {
  const html = raw || '';
  const blocks = html
    .split(/<\/p>/i)
    .map((b) => ({ text: decode(b), bolded: /<strong[^>]*>/i.test(b) }))
    .filter((b) => b.text);

  if (blocks.length === 0) return { en: '', ar: '', title_en: '', title_ar: '' };

  const out = { en: [], ar: [], title_en: '', title_ar: '' };
  let lang = 'en';

  for (const b of blocks) {
    let text = b.text;
    const isEnMarker = /^EN:/i.test(text);
    const isArMarker = /^AR:/i.test(text);

    if (isEnMarker) {
      lang = 'en';
      text = text.replace(/^EN:\s*/i, '').trim();
      if (text) out.title_en ||= text;
      continue;
    }
    if (isArMarker) {
      lang = 'ar';
      text = text.replace(/^AR:\s*/i, '').trim();
      if (text) out.title_ar ||= text;
      continue;
    }

    // No explicit marker: infer from script so unmarked entries still split.
    const looksArabic = ARABIC.test(text);
    if (looksArabic && out.en.length && !out.ar.length) lang = 'ar';
    else if (!looksArabic && !out.en.length) lang = 'en';

    // A bolded paragraph with no body yet is the title for that language.
    if (b.bolded && !out[lang].length && !out[`title_${lang}`]) {
      out[`title_${lang}`] = text;
      continue;
    }
    out[lang].push(text);
  }

  const join = (parts) => parts.join(' ').replace(/\s+/g, ' ').trim();
  let en = join(out.en);
  let ar = join(out.ar);

  // Fallback: nothing separated cleanly, so use the flattened text.
  if (!en && !ar) {
    const flat = decode(html).replace(/^EN:\s*/i, '').trim();
    const at = flat.search(ARABIC);
    if (at === -1) en = flat;
    else {
      const cut = flat.lastIndexOf('. ', at);
      const idx = cut === -1 ? at : cut + 2;
      en = flat.slice(0, idx).trim();
      ar = flat.slice(idx).trim();
    }
  }

  // No de-duplication against the title here: the body is complete prose that often
  // legitimately opens by naming the dish ("Fresh homemade brownie topped with…").
  // Stripping that leaves a fragment starting mid-sentence.
  return { en, ar, title_en: out.title_en, title_ar: out.title_ar };
}

const items = all.map((p) => {
  const vars = (p.product_variations || []).flatMap((pv) =>
    (pv.variations || []).map((v) => ({
      variation: pv.is_dummy ? null : `${pv.name}: ${v.name}`,
      price: Number(v.sell_price_inc_tax),
    })));
  const { en, ar } = splitDesc(p.product_description);
  return {
    id: p.id,
    sku: p.sku,
    name_en: p.name,
    name_ar: p.product_custom_field1 || '',
    category: p.category ? p.category.name : 'Uncategorised',
    category_id: p.category ? p.category.id : null,
    desc_en: en,
    desc_ar: ar,
    price: vars.length ? vars[0].price : null,
    variations: vars.filter((v) => v.variation),
    image_url: p.image_url || null,
    active: !p.is_inactive && !p.not_for_selling,
    kitchen_id: p.kitchen_id,
  };
});

fs.writeFileSync('menu.json', JSON.stringify(items, null, 2));

const byCat = {};
for (const i of items) (byCat[i.category] ||= []).push(i);

let md = `# 212 Café — Full Menu\n\nSource: \`212.smaresto.com/selforder/api/products\` (crawled ${new Date().toISOString().slice(0, 10)})\nCurrency: QAR · ${items.length} items · ${Object.keys(byCat).length} categories\n\n`;
for (const [cat, list] of Object.entries(byCat)) {
  md += `\n## ${cat} (${list.length})\n\n| # | Item | Arabic | Price | Image |\n|---|---|---|---:|---|\n`;
  list.forEach((i, n) => {
    md += `| ${n + 1} | ${i.name_en}${i.active ? '' : ' _(inactive)_'} | ${i.name_ar || '—'} | ${i.price != null ? i.price.toFixed(2) : '—'} | ${i.image_url ? 'yes' : 'no'} |\n`;
  });
}
fs.writeFileSync('MENU.md', md);

console.log(`items=${items.length} categories=${Object.keys(byCat).length}`);
console.log('with_image=', items.filter(i => i.image_url).length,
            'with_arabic_name=', items.filter(i => i.name_ar).length,
            'with_desc=', items.filter(i => i.desc_en).length,
            'inactive=', items.filter(i => !i.active).length,
            'with_variations=', items.filter(i => i.variations.length).length);
console.log('\nCATEGORIES:');
for (const [c, l] of Object.entries(byCat)) {
  const ps = l.map(i => i.price).filter(p => p != null);
  console.log(`  ${c.padEnd(22)} ${String(l.length).padStart(2)} items  QAR ${Math.min(...ps)}–${Math.max(...ps)}`);
}
