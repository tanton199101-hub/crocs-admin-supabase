// Shared catalogue vocabulary for the server-side shop filters.  The source
// import often says only “Thời trang trẻ em”, so these rules use stronger
// signals from the product title and option metadata before falling back to
// “Sản phẩm khác”.
import optionTranslations from '../assets/catalog-1688/variation-translations.vi.json' with { type: 'json' };

export const fold = value => String(value || '')
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/[đĐ]/g, 'd')
  .toLowerCase();

export const CATEGORY_DEFINITIONS = [
  { id: 'performance', title: 'Trang phục biểu diễn', children: [
    { id: 'performance-jazz', title: 'Jazz / sân khấu' },
    { id: 'performance-dance', title: 'Múa / nhảy' },
    { id: 'performance-cheer', title: 'Cổ vũ' },
    { id: 'performance-choir', title: 'Hợp xướng' },
    { id: 'performance-hiphop', title: 'Hip hop' },
    { id: 'performance-traditional', title: 'Trung Hoa / truyền thống' },
  ] },
  { id: 'dresses', title: 'Váy & đầm', children: [{ id: 'dresses', title: 'Váy & đầm' }] },
  { id: 'tops', title: 'Áo', children: [
    { id: 'tops-shirts', title: 'Áo thun / sơ mi' },
    { id: 'tops-outerwear', title: 'Áo khoác / áo len' },
  ] },
  { id: 'bottoms', title: 'Quần & short', children: [
    { id: 'bottoms-pants', title: 'Quần dài / legging' },
    { id: 'bottoms-shorts', title: 'Quần short' },
  ] },
  { id: 'sets', title: 'Bộ mặc hằng ngày', children: [{ id: 'sets', title: 'Bộ mặc hằng ngày' }] },
  { id: 'accessories', title: 'Phụ kiện', children: [
    { id: 'accessories-hats', title: 'Mũ / nón' },
    { id: 'accessories-socks', title: 'Tất' },
    { id: 'accessories-hair', title: 'Phụ kiện tóc' },
    { id: 'accessories-belts', title: 'Thắt lưng' },
    { id: 'accessories-shoes', title: 'Giày dép' },
    { id: 'accessories-bags', title: 'Túi / balo' },
    { id: 'accessories-other', title: 'Phụ kiện khác' },
  ] },
  { id: 'other', title: 'Sản phẩm khác', children: [{ id: 'other', title: 'Sản phẩm khác' }] },
];

export const AUDIENCE_DEFINITIONS = [
  { id: 'girls', title: 'Bé gái' },
  { id: 'boys', title: 'Bé trai' },
  { id: 'children', title: 'Trẻ em / unisex' },
];

export const OCCASION_DEFINITIONS = [
  { id: 'performance', title: 'Biểu diễn / sân khấu' },
  { id: 'school', title: 'Đi học' },
  { id: 'party', title: 'Tiệc / dịp đặc biệt' },
  { id: 'summer', title: 'Mùa hè / đi biển' },
  { id: 'everyday', title: 'Mặc hằng ngày' },
];

const categoryLookup = new Map(CATEGORY_DEFINITIONS.flatMap(group => group.children.map(child => [child.id, { ...child, parentId: group.id }])));
const typeDefinitions = [...categoryLookup.values()];
const typeLookup = new Set(typeDefinitions.map(item => item.id));
const groupLookup = new Set(CATEGORY_DEFINITIONS.map(item => item.id));

export const facetKey = value => fold(value)
  .replace(/[^\p{L}\p{N}]+/gu, '-')
  .replace(/^-+|-+$/g, '')
  .slice(0, 80);

// The live catalogue RPC can retain supplier option values even when product
// details use the Vietnamese mirror. Translate only derived filter metadata:
// raw option values, packed SKU indices and image/price maps must stay intact.
const supplierLabel = /[\u3400-\u9fff\uf900-\ufaff]/;
const facetLabel = value => {
  const text = String(value || '').trim();
  const translated = supplierLabel.test(text) ? optionTranslations[text.slice(0, 80)] : '';
  return typeof translated === 'string' && translated.trim() ? translated.trim() : text;
};
const legacyFacetKeys = new Map(Object.keys(optionTranslations).filter(value => supplierLabel.test(value))
  .map(value => [facetKey(value), facetKey(facetLabel(value))]));

const valueList = value => Array.isArray(value)
  ? value.flatMap(valueList)
  : value === null || value === undefined
    ? []
    : typeof value === 'object'
      ? Object.values(value).flatMap(valueList)
      : [String(value)];
const cleanValues = values => [...new Set(values.map(value => String(value || '').trim()).filter(value => value && value.length < 100))];
const has = (text, pattern) => pattern.test(text);

function optionValues(product, matcher) {
  const options = Array.isArray(product?.options) ? product.options : [];
  const optionNames = new Map(options.map(option => [String(option?.id || option?.name || ''), String(option?.name || option?.id || '')]));
  const values = [];
  for (const option of options) {
    const name = String(option?.name || option?.id || '');
    if (matcher.test(fold(name))) values.push(...valueList(option?.values));
  }
  for (const variant of Array.isArray(product?.variants) ? product.variants : []) {
    for (const [id, value] of Object.entries(variant?.values || {})) {
      if (matcher.test(fold(optionNames.get(id) || id))) values.push(...valueList(value));
    }
  }
  // Packed variants retain option values in the top-level options array, so no
  // additional decoding is needed here.
  return cleanValues(values);
}

function attributeValues(product, matcher) {
  const values = [];
  for (const attribute of Array.isArray(product?.attributes) ? product.attributes : []) {
    if (typeof attribute === 'string') {
      if (matcher.test(fold(attribute))) values.push(attribute);
      continue;
    }
    const name = String(attribute?.name || attribute?.key || attribute?.label || '');
    if (matcher.test(fold(name))) values.push(...valueList(attribute?.value ?? attribute?.values));
  }
  return cleanValues(values);
}

export function productTaxonomy(product = {}) {
  const explicit = product?.taxonomy && typeof product.taxonomy === 'object' ? product.taxonomy : {};
  const text = fold([
    product.title, product.category, product.type, product.productType,
    product.sku, ...valueList(product.tags), ...valueList(product.keywords), ...valueList(product.searchTerms),
  ].join(' '));
  let categoryId = facetKey(explicit.categoryId || product.categoryId || '');
  let typeId = facetKey(explicit.typeId || product.typeId || '');
  if (!groupLookup.has(categoryId)) categoryId = '';
  if (!typeLookup.has(typeId)) typeId = '';
  const setType = (category, type = category) => { categoryId = category; typeId = type; };

  // Check concrete accessories first so “mũ hip hop” is not classified as a
  // performance item merely because its style name contains “hip hop”.
  if (!categoryId && has(text, /\b(mu|non|hat|cap)\b/)) setType('accessories', 'accessories-hats');
  else if (!categoryId && has(text, /\b(tat|sock)\b/)) setType('accessories', 'accessories-socks');
  else if (!categoryId && has(text, /bang do|phu kien toc|kep toc|hair/)) setType('accessories', 'accessories-hair');
  else if (!categoryId && has(text, /that lung|belt/)) setType('accessories', 'accessories-belts');
  else if (!categoryId && has(text, /giay|dep|sandal|shoe|boots?/)) setType('accessories', 'accessories-shoes');
  else if (!categoryId && has(text, /tui|balo|backpack|bag/)) setType('accessories', 'accessories-bags');
  else if (!categoryId && has(text, /phu kien|accessor/)) setType('accessories', 'accessories-other');
  else if (!categoryId && has(text, /bieu dien|san khau|mua|nhay|jazz|cheer|co vu|hop xuong|hip hop|khieu vu/)) {
    setType('performance', has(text, /jazz|san khau/) ? 'performance-jazz'
      : has(text, /co vu|cheer/) ? 'performance-cheer'
      : has(text, /hop xuong/) ? 'performance-choir'
      : has(text, /trung hoa|trung quoc|truyen thong/) ? 'performance-traditional'
      : has(text, /hip hop/) ? 'performance-hiphop' : 'performance-dance');
  } else if (!categoryId && has(text, /vay|dam|chan vay|dress|skirt/)) setType('dresses');
  else if (!categoryId && has(text, /quan|legging|short|pants|trousers/)) setType('bottoms', has(text, /short/) ? 'bottoms-shorts' : 'bottoms-pants');
  else if (!categoryId && has(text, /bo|set|ensemble|tracksuit/)) setType('sets');
  else if (!categoryId && has(text, /ao|so mi|t[- ]?shirt|shirt|jacket|coat|hoodie|uniform/)) setType('tops', has(text, /jacket|coat|hoodie|khoac|len/) ? 'tops-outerwear' : 'tops-shirts');
  if (!categoryId) setType('other');
  if (!typeId || !typeLookup.has(typeId)) typeId = categoryId;

  const audience = explicit.audience || (has(text, /be gai|con gai|girl|female|nu/) ? 'girls' : has(text, /be trai|con trai|boy|male|nam/) ? 'boys' : 'children');
  const occasions = [];
  if (categoryId === 'performance') occasions.push('performance');
  if (has(text, /di hoc|dong phuc|school|uniform/)) occasions.push('school');
  if (has(text, /tiec|sinh nhat|party|le hoi/)) occasions.push('party');
  if (has(text, /mua he|summer|di bien|beach/)) occasions.push('summer');
  if (!occasions.length) occasions.push('everyday');

  const sizes = cleanValues([
    ...valueList(product.sizes), ...valueList(product.size),
    ...optionValues(product, /size|kich thuoc|co|tuoi|chieu cao|ma so/),
    ...attributeValues(product, /size|kich thuoc|co|tuoi|chieu cao/),
  ].map(facetLabel));
  const colors = cleanValues([
    ...valueList(product.colors), ...valueList(product.colours), ...valueList(product.color), ...valueList(product.colour),
    ...optionValues(product, /phan loai|mau|color|colour/), ...attributeValues(product, /mau|color|colour/),
  ].map(facetLabel));
  const category = categoryLookup.get(typeId) || categoryLookup.get(categoryId) || { id: categoryId, title: 'Sản phẩm khác', parentId: categoryId };
  const group = CATEGORY_DEFINITIONS.find(item => item.id === categoryId) || CATEGORY_DEFINITIONS.at(-1);
  return {
    categoryId,
    categoryTitle: group.title,
    typeId,
    typeTitle: category.title,
    categoryIds: [...new Set([categoryId, typeId])],
    audience: AUDIENCE_DEFINITIONS.some(item => item.id === audience) ? audience : 'children',
    occasions: [...new Set(occasions)],
    sizes,
    colors,
  };
}

export function productSearchText(product, taxonomy = productTaxonomy(product)) {
  const optionText = (Array.isArray(product?.options) ? product.options : []).flatMap(option => [option?.name, ...valueList(option?.values)]);
  const attributeText = (Array.isArray(product?.attributes) ? product.attributes : []).flatMap(attribute => typeof attribute === 'string' ? [attribute] : [attribute?.name, ...valueList(attribute?.value ?? attribute?.values)]);
  const variantText = (Array.isArray(product?.variants) ? product.variants : []).flatMap(variant => valueList(variant?.values));
  return fold([
    product?.title, product?.sku, product?.brand, product?.category, product?.type, product?.description,
    product?.descriptionHtml, taxonomy.categoryTitle, taxonomy.typeTitle, taxonomy.audience, taxonomy.occasions.join(' '),
    ...valueList(product?.tags), ...valueList(product?.keywords), ...valueList(product?.searchTerms),
    ...optionText, ...variantText, ...attributeText, ...taxonomy.sizes, ...taxonomy.colors,
  ].join(' '));
}

export const parseSelections = (params, name) => [...new Set(String(params.get(name) || '').split(',')
  .map(value => value.trim()).filter(Boolean)
  .map(value => name === 'color' || name === 'size' ? legacyFacetKeys.get(value) || value : value))].slice(0, 24);

export function matchesFacet(product, dimension, values, taxonomy = productTaxonomy(product)) {
  if (!values.length) return true;
  if (dimension === 'category') return taxonomy.categoryIds.some(id => values.includes(id));
  if (dimension === 'type') return values.includes(taxonomy.typeId);
  if (dimension === 'audience') return values.includes(taxonomy.audience);
  if (dimension === 'occasion') return taxonomy.occasions.some(id => values.includes(id));
  const list = dimension === 'size' ? taxonomy.sizes : taxonomy.colors;
  return list.some(value => values.includes(facetKey(value)));
}

const definitionFacets = (definitions, counts) => definitions.map(item => ({ id: item.id, title: item.title, count: counts.get(item.id) || 0 })).filter(item => item.count > 0);
const categoryFacets = (products, taxonomyFor = productTaxonomy) => {
  const counts = new Map();
  products.forEach(product => taxonomyFor(product).categoryIds.forEach(id => counts.set(id, (counts.get(id) || 0) + 1)));
  return CATEGORY_DEFINITIONS.map(group => ({
    id: group.id, title: group.title, count: counts.get(group.id) || 0,
    children: group.children.map(child => ({ id: child.id, title: child.title, count: counts.get(child.id) || 0 })).filter(child => child.count > 0),
  })).filter(group => group.count > 0);
};
const valueFacets = (products, key, taxonomyFor = productTaxonomy) => {
  const values = new Map();
  products.forEach(product => {
    const list = taxonomyFor(product)[key];
    [...new Map(list.map(value => [facetKey(value), value])).values()].forEach(value => {
      const id = facetKey(value); if (!id) return;
      const row = values.get(id) || { id, title: value, count: 0 }; row.count += 1; values.set(id, row);
    });
  });
  return [...values.values()].sort((left, right) => right.count - left.count || left.title.localeCompare(right.title, 'vi')).slice(0, 32);
};

export function buildFacets(baseProducts, selections = {}) {
  const cache = new Map();
  const taxonomyFor = product => { if (!cache.has(product)) cache.set(product, productTaxonomy(product)); return cache.get(product); };
  const without = dimension => baseProducts.filter(product => Object.entries(selections).every(([key, values]) => key === dimension || matchesFacet(product, key, values, taxonomyFor(product))));
  const categoryBase = without('category');
  const typeBase = without('type');
  const audienceBase = without('audience');
  const occasionBase = without('occasion');
  const sizeBase = without('size');
  const colorBase = without('color');
  const typeCounts = new Map();
  typeBase.forEach(product => { const id = taxonomyFor(product).typeId; typeCounts.set(id, (typeCounts.get(id) || 0) + 1); });
  return {
    categories: categoryFacets(categoryBase, taxonomyFor),
    types: definitionFacets(typeDefinitions, typeCounts),
    audiences: definitionFacets(AUDIENCE_DEFINITIONS, new Map(AUDIENCE_DEFINITIONS.map(item => [item.id, audienceBase.filter(product => taxonomyFor(product).audience === item.id).length]))),
    occasions: definitionFacets(OCCASION_DEFINITIONS, new Map(OCCASION_DEFINITIONS.map(item => [item.id, occasionBase.filter(product => taxonomyFor(product).occasions.includes(item.id)).length]))),
    sizes: valueFacets(sizeBase, 'sizes', taxonomyFor),
    colors: valueFacets(colorBase, 'colors', taxonomyFor),
  };
}
