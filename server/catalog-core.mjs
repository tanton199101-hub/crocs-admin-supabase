import { createHash } from 'node:crypto';

export const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').toLowerCase();
export const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const safeJson = value => JSON.stringify(value).replace(/</g, '\\u003c');
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
  const collection = (catalog.collections || []).find(c => c.id === params.get('collection') && c.status === 'Active');
  const allowed = collection ? new Set(collection.productIds) : null;
  const localization = catalog.localization || {};
  const region = localization.regions?.find(r => r.id === params.get('region')) || localization.regions?.find(r => r.id === localization.defaultRegion);
  const thresholds = region?.currency === 'VND' ? [200000, 500000] : [200 * 10 ** decimals(region?.currency), 500 * 10 ** decimals(region?.currency)];
  const band = params.get('price') || 'all';
  const sort = params.get('sort') || 'featured';
  const active = catalog.products.filter(p => p.status === 'Active');
  const products = active.filter(p => {
    if (params.get('collection') && !collection) return false;
    if (allowed && !allowed.has(p.id)) return false;
    if (query && !fold(`${p.title} ${p.category} ${p.brand} ${p.sku}`).includes(query)) return false;
    const price = regionalPrice(p, localization, region?.id);
    return band === 'under-200' ? price < thresholds[0] : band === '200-500' ? price >= thresholds[0] && price <= thresholds[1] : band === 'over-500' ? price > thresholds[1] : true;
  });
  products.sort((a,b) => {
    const diff = sort === 'price-asc' ? regionalPrice(a, localization, region?.id) - regionalPrice(b, localization, region?.id)
      : sort === 'price-desc' ? regionalPrice(b, localization, region?.id) - regionalPrice(a, localization, region?.id)
      : sort === 'name' ? a.title.localeCompare(b.title, 'vi')
      : sort === 'newest' ? String(b.createdAt || b.updatedAt || b.id).localeCompare(String(a.createdAt || a.updatedAt || a.id))
      : Number(b.stock) - Number(a.stock);
    return diff || a.id.localeCompare(b.id);
  });
  const fingerprint = createHash('sha256').update(JSON.stringify([query, collection?.id, band, sort, region?.id, products.map(p => [p.id,p.price,p.stock])])).digest('hex').slice(0, 12);
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
    collections: publicCollections(catalog.collections, active), localization, store: catalog.store,
    nextCursor: next < products.length ? Buffer.from(JSON.stringify({ key: fingerprint, offset: next })).toString('base64url') : null,
    source: 'live', generatedAt: new Date().toISOString() };
}

export function summary(p, localization = {}, regionId) {
  const localizedPrice = regionId ? regionalPrice(p, localization, regionId) : p.price;
  return Object.fromEntries([
    ['id', p.id], ['title', p.title], ['sku', p.sku], ['price', localizedPrice],
    ['basePrice', p.price], ['stock', p.stock], ['status', p.status], ['image', p.image],
    ['imageAlt', p.imageAlt], ['brand', p.brand], ['slug', p.slug], ['category', p.category],
    ['hasVariants', p.hasVariants], ['regionalPrices', p.regionalPrices], ['priceByRegion', p.priceByRegion],
    ['pricesByRegion', p.pricesByRegion], ['createdAt', p.createdAt], ['updatedAt', p.updatedAt],
    ['seo', p.seo],
  ]);
}

export function presentation(live, mirror) {
  if (!mirror) return { ...live, brand: /crocs|1688|supplier/i.test(live.brand || '') ? 'Sally Kids' : live.brand || 'Sally Kids' };
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
  return result;
}
