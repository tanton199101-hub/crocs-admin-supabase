import { createHash } from 'node:crypto';
import variantOptions from '../variant-options.js';
import { buildFacets, matchesFacet, parseSelections, productSearchText, productTaxonomy } from './product-taxonomy.mjs';

export const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
export const PRODUCT_PLACEHOLDER = 'assets/sally-kids-product-placeholder.svg';

const isBannerAsset = value => /(?:^|[\\/])(?:sally-kids-(?:hero|play|school)(?:-[\w]+)?|crocs-(?:hero|cozy|crocband|pokemon|ninjago)(?:-[\w]+)?)\.(?:png|jpe?g|webp|avif)(?:[?#].*)?$/i.test(String(value || '').trim());
const mediaValue = value => typeof value === 'string' ? value : value && typeof value === 'object' ? value.imageUrl || value.imgUrl || value.imageURI || value.fullPathImageURI || value.url || '' : '';
const safeProductImage = value => {
  const raw = String(mediaValue(value) || '').trim();
  return raw && !isBannerAsset(raw) ? raw : '';
};
const safeProductImageList = value => [...new Set((Array.isArray(value) ? value : []).map(safeProductImage).filter(Boolean))];
const remoteVideoHosts = new Set(['cloud.video.taobao.com', 'video01.1688.com', 'video.1688.com', 'caiyuanbao.alicdn.com']);
const safeProductVideo = value => {
  const raw = typeof value === 'string' ? value.trim().replace(/\\u002f/gi, '/').replace(/\\\//g, '/') : mediaValue(value).trim();
  if (!raw) return '';
  // Keep legacy relative fixture/media references intact; the browser-side
  // normalizer will still drop anything that cannot be played safely.
  if (/^[\w./-]+\.mp4$/i.test(raw)) return raw;
  try {
    const parsed = new URL(raw, 'https://store.invalid');
    let source = parsed;
    if (parsed.origin === 'https://store.invalid' && parsed.pathname === '/api/1688-video') source = new URL(parsed.searchParams.get('url') || '');
    const host = source.hostname.toLowerCase();
    const pathOkay = /^\/(?:play|video|download)\//i.test(source.pathname) || host === 'caiyuanbao.alicdn.com';
    if (source.protocol !== 'https:' || !remoteVideoHosts.has(host) || !pathOkay || !/\.mp4(?:$|[?#])/i.test(source.pathname + source.search)) return '';
    return `/api/1688-video?url=${encodeURIComponent(source.href)}`;
  } catch { return ''; }
};
const videoValues = value => {
  if (Array.isArray(value)) return value.flatMap(videoValues);
  if (value && typeof value === 'object') return Object.values(value).flatMap(videoValues);
  if (typeof value !== 'string') return [];
  const text = value.replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
  return [text, ...(text.match(/(?:https?:)?\/\/[^"'<>\s\\]+\.mp4(?:[?#][^"'<>\s\\]*)?/gi) || [])];
};
const safeProductVideoList = value => [...new Set(videoValues(value).map(safeProductVideo).filter(Boolean))].slice(0, 8);
const safeProductImageMap = (value, nested = false) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, raw]) => {
    if (!nested) {
      const image = safeProductImage(Array.isArray(raw) ? raw[0] : raw);
      return image ? [String(key), image] : null;
    }
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const mapped = Object.fromEntries(Object.entries(raw).map(([option, image]) => {
      const safe = safeProductImage(image);
      return safe ? [String(option), safe] : null;
    }).filter(Boolean));
    return Object.keys(mapped).length ? [String(key), mapped] : null;
  }).filter(Boolean));
};
const sanitizeProductMedia = product => {
  product = { ...product, ...(Array.isArray(product.options) ? { options: variantOptions.normalize(product.options) } : {}), ...(typeof product.description === 'string' ? { description: variantOptions.description(product.description) } : {}) };
  const gallery = Array.isArray(product?.gallery) ? safeProductImageList(product.gallery) : [];
  const result = { ...product, image: safeProductImage(product?.image) || gallery[0] || PRODUCT_PLACEHOLDER };
  if (Array.isArray(product?.gallery)) result.gallery = gallery;
  if (Array.isArray(product?.detailImages)) result.detailImages = safeProductImageList(product.detailImages);
  const videos = safeProductVideoList([
    product?.videos, product?.videoUrl, product?.video,
    product?.source?.videos, product?.source?.videoUrl, product?.source?.video,
    product?.descriptionHtml,
  ]);
  if (videos.length) result.videos = videos;
  else if (Array.isArray(product?.videos)) result.videos = [];
  if (product?.optionImages && typeof product.optionImages === 'object') result.optionImages = safeProductImageMap(product.optionImages, true);
  if (product?.variantImages && typeof product.variantImages === 'object') result.variantImages = safeProductImageMap(product.variantImages);
  if (Array.isArray(product?.variants)) result.variants = product.variants.map(variant => {
    const clean = { ...variant };
    for (const key of ['image', 'imageUrl']) {
      const image = safeProductImage(variant?.[key]);
      if (image) clean[key] = image; else delete clean[key];
    }
    return clean;
  });
  return result;
};
const decimals = code => code === 'VND' || code === 'JPY' || code === 'KRW' ? 0 : 2;

export function regionalPrice(product, localization, regionId) {
  const region = localization.regions?.find(r => r.id === regionId) || localization.regions?.find(r => r.id === localization.defaultRegion);
  if (!region) return product.price;
  const override = product.regionalPrices?.[region.id] ?? product.priceByRegion?.[region.id] ?? product.pricesByRegion?.[region.id] ?? region.priceOverrides?.[product.id];
  const amount = override && typeof override === 'object' ? override[product.id] ?? override.amount ?? override.price : override;
  if (/^\d+$/.test(String(amount ?? ''))) return Number(amount);
  return Math.max(0, Math.round(product.price / 10 ** decimals(localization.currency || 'USD') * region.exchangeRate * region.priceMultiplier * 10 ** decimals(region.currency) + Number.EPSILON));
}

export function publicCollections(collections, products) {
  const ids = new Set(products.filter(p => p.status === 'Active').map(p => p.id));
  return (collections || []).filter(c => c.status === 'Active').map(c => {
    // Keep IDs in the small catalog envelope. They let the home page render a
    // collection tab immediately, while the shop endpoint still performs the
    // expensive filtering and pagination on the server.
    const productIds = [...new Set(c.productIds || [])].filter(id => ids.has(id));
    return {
      id: c.id,
      title: ({ 'New arrivals': 'Mới về', 'Cozy favourites': 'Được yêu thích', 'Tất cả sản phẩm 1688': 'Tất cả sản phẩm' })[c.title] || c.title,
      status: c.status,
      productIds,
      count: productIds.length,
    };
  }).filter(c => c.count > 0 && c.id !== 'col-1688-1688-all');
}

export function catalogPage(catalog, params = new URLSearchParams()) {
  const query = fold(params.get('query')).slice(0, 120);
  const queryTokens = query.split(/\s+/).filter(Boolean).slice(0, 12);
  const collection = (catalog.collections || []).find(c => c.id === params.get('collection') && c.status === 'Active');
  const allowed = collection ? new Set(collection.productIds) : null;
  const localization = catalog.localization || {};
  const region = localization.regions?.find(r => r.id === params.get('region')) || localization.regions?.find(r => r.id === localization.defaultRegion);
  const thresholds = region?.currency === 'VND' ? [200000, 500000] : [200 * 10 ** decimals(region?.currency), 500 * 10 ** decimals(region?.currency)];
  const band = params.get('price') || 'all';
  const sort = params.get('sort') || 'featured';
  const selections = {
    category: parseSelections(params, 'category'),
    type: parseSelections(params, 'type'),
    audience: parseSelections(params, 'audience'),
    occasion: parseSelections(params, 'occasion'),
    size: parseSelections(params, 'size'),
    color: parseSelections(params, 'color'),
  };
  const active = catalog.products.filter(p => p.status === 'Active');
  const baseProducts = active.filter(p => {
    if (params.get('collection') && !collection) return false;
    if (allowed && !allowed.has(p.id)) return false;
    if (queryTokens.length && !queryTokens.every(token => productSearchText(p).includes(token))) return false;
    const price = regionalPrice(p, localization, region?.id);
    return band === 'under-200' ? price < thresholds[0] : band === '200-500' ? price >= thresholds[0] && price <= thresholds[1] : band === 'over-500' ? price > thresholds[1] : true;
  });
  const products = baseProducts.filter(p => Object.entries(selections).every(([dimension, values]) => matchesFacet(p, dimension, values)));
  products.sort((a,b) => {
    const diff = sort === 'price-asc' ? regionalPrice(a, localization, region?.id) - regionalPrice(b, localization, region?.id)
      : sort === 'price-desc' ? regionalPrice(b, localization, region?.id) - regionalPrice(a, localization, region?.id)
      : sort === 'name' ? a.title.localeCompare(b.title, 'vi')
      : sort === 'newest' ? String(b.createdAt || b.updatedAt || b.id).localeCompare(String(a.createdAt || a.updatedAt || a.id))
      : Number(b.stock) - Number(a.stock);
    return diff || a.id.localeCompare(b.id);
  });
  const fingerprint = createHash('sha256').update(JSON.stringify([query, collection?.id, band, sort, region?.id, selections, products.map(p => [p.id,p.price,p.stock])])).digest('hex').slice(0, 12);
  let offset = 0;
  if (params.get('cursor')) {
    try {
      const cursor = JSON.parse(Buffer.from(params.get('cursor'), 'base64url').toString());
      if (cursor.key !== fingerprint || !Number.isSafeInteger(cursor.offset) || cursor.offset < 0) throw Error();
      offset = cursor.offset;
    } catch { throw Object.assign(new Error('Danh mục đã thay đổi. Hãy tải lại trang đầu.'), { status: 409 }); }
  }
  const requestedLimit = Number(params.get('limit') || 24);
  const limit = Number.isFinite(requestedLimit) ? Math.min(24, Math.max(1, Math.floor(requestedLimit))) : 24;
  const next = offset + limit;
  return { products: products.slice(offset, next).map(product => summary(product, localization, region?.id)), total: products.length, activeTotal: active.length,
    facets: buildFacets(baseProducts, selections),
    collections: publicCollections(catalog.collections, active), localization, store: catalog.store,
    nextCursor: next < products.length ? Buffer.from(JSON.stringify({ key: fingerprint, offset: next })).toString('base64url') : null,
    source: 'live', generatedAt: new Date().toISOString() };
}

export function summary(p, localization = {}, regionId) {
  const localizedPrice = regionId ? regionalPrice(p, localization, regionId) : p.price;
  const taxonomy = productTaxonomy(p);
  return Object.fromEntries([
    ['id', p.id], ['title', p.title], ['sku', p.sku], ['price', localizedPrice],
    ['basePrice', p.price], ['stock', p.stock], ['status', p.status], ['image', safeProductImage(p.image) || safeProductImageList(p.gallery)[0] || PRODUCT_PLACEHOLDER],
    ['imageAlt', p.imageAlt], ['brand', p.brand], ['slug', p.slug], ['category', p.category],
    ['hasVariants', p.hasVariants], ['regionalPrices', p.regionalPrices], ['priceByRegion', p.priceByRegion],
    ['pricesByRegion', p.pricesByRegion], ['createdAt', p.createdAt], ['updatedAt', p.updatedAt],
    ['seo', p.seo], ['categoryId', taxonomy.categoryId], ['categoryTitle', taxonomy.categoryTitle],
    ['typeId', taxonomy.typeId], ['typeTitle', taxonomy.typeTitle], ['audience', taxonomy.audience],
    ['occasions', taxonomy.occasions], ['sizes', taxonomy.sizes], ['colors', taxonomy.colors],
  ]);
}

export function recentlyViewedProducts(catalog, params = new URLSearchParams()) {
  const ids = [...new Set(String(params.get('ids') || '').split(',').filter(id => /^[\w-]{1,120}$/.test(id)))].slice(0, 8);
  const active = new Map((catalog.products || []).filter(product => product.status === 'Active').map(product => [product.id, product]));
  // Only public summary fields are needed for a history card. Never include
  // supplier credentials, descriptions or hundreds of variant rows here.
  return ids.map(id => active.get(id)).filter(Boolean).map(product => summary(product, catalog.localization || {}, params.get('region') || undefined));
}

export function presentation(live, mirror) {
  if (!mirror) return sanitizeProductMedia({ ...live, brand: /crocs|1688|supplier/i.test(live.brand || '') ? 'Sally Kids' : live.brand || 'Sally Kids' });
  // The live record owns availability, price, inventory and admin edits.
  const localized = /[\u3400-\u9fff]|1688|mẫu \d{10,}/i.test(live.title || '') || live.title?.length > 85;
  const result = { ...live, brand: /crocs|1688|supplier/i.test(live.brand || '') ? 'Sally Kids' : live.brand || 'Sally Kids' };
  for (const key of ['title', 'slug', 'imageAlt', 'description']) if ((!live[key] || localized) && mirror[key]) result[key] = mirror[key];
  // A live row can contain an older/partial media snapshot.  The verified
  // static mirror is additive: never discard a URL simply because one side
  // already has a non-empty list.
  for (const key of ['gallery', 'detailImages', 'videos', 'attributes']) {
    const liveValues = Array.isArray(live[key]) ? live[key] : [];
    const mirrorValues = Array.isArray(mirror[key]) ? mirror[key] : [];
    if (liveValues.length || mirrorValues.length) result[key] = [...new Set([...liveValues, ...mirrorValues])];
  }
  const mergeMap = (left, right) => {
    const output = {};
    for (const [key, values] of Object.entries(left || {})) {
      if (values && typeof values === 'object' && !Array.isArray(values)) output[key] = { ...values };
      else if (values) output[key] = values;
    }
    for (const [key, values] of Object.entries(right || {})) {
      if (values && typeof values === 'object' && !Array.isArray(values)) output[key] = { ...(output[key] || {}), ...values };
      else if (values && !output[key]) output[key] = values;
    }
    return output;
  };
  const optionImages = mergeMap(live.optionImages, mirror.optionImages);
  const variantImages = mergeMap(live.variantImages, mirror.variantImages);
  if (Object.keys(optionImages).length) result.optionImages = optionImages;
  if (Object.keys(variantImages).length) result.variantImages = variantImages;
  if ((!live.descriptionHtml || !String(live.descriptionHtml).trim()) && mirror.descriptionHtml) result.descriptionHtml = mirror.descriptionHtml;
  if (!live.seo?.title && !live.seo?.description) result.seo = { ...mirror.seo, ...live.seo, noindex: live.seo?.noindex === true };
  return sanitizeProductMedia(result);
}
