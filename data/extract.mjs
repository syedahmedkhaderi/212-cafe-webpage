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

// Descriptions are authored as "EN: ... AR: ...". Some omit the AR: marker, so fall
// back to splitting at the first Arabic character.
function splitDesc(raw) {
  const t = decode(raw);
  const marker = t.indexOf('AR:');
  if (marker !== -1) {
    return {
      en: t.slice(0, marker).replace(/^EN:\s*/, '').trim(),
      ar: t.slice(marker + 3).trim(),
    };
  }
  const stripped = t.replace(/^EN:\s*/, '').trim();
  const first = stripped.search(ARABIC);
  if (first === -1) return { en: stripped, ar: '' };
  // Rewind to the start of the word/sentence the Arabic run begins in.
  const cut = stripped.lastIndexOf('. ', first);
  const at = cut === -1 ? first : cut + 2;
  return { en: stripped.slice(0, at).trim(), ar: stripped.slice(at).trim() };
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
