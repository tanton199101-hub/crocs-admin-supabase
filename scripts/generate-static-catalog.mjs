import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import Importer from '../1688-importer.js';

const sourcePath = process.argv[2];
const outputPath = resolve(process.argv[3] || 'assets/catalog-1688');
if (!sourcePath) throw new Error('Usage: node scripts/generate-static-catalog.mjs <backup-json> [output-dir]');

const arg = (name, fallback = '') => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
};
const maxTitleLength = Math.max(36, Math.min(80, Number(arg('max-title-length', '56')) || 56));
const translationCachePath = resolve(arg('translation-cache', join(outputPath, 'variation-translations.vi.json')));
const mediaOverridesPath = resolve(arg('media-overrides', join(outputPath, 'media-overrides.json')));
const chinese = /[\u3400-\u9fff\uf900-\ufaff]/;

const backup = JSON.parse(await readFile(resolve(sourcePath), 'utf8'));
const sourceProducts = Array.isArray(backup.products) ? backup.products : [];
let mediaOverrides = {};
try { mediaOverrides = JSON.parse(await readFile(mediaOverridesPath, 'utf8')); } catch { /* optional */ }
let translationMap = {};
try { translationMap = JSON.parse(await readFile(translationCachePath, 'utf8')); } catch { /* first generation */ }
const is1688 = product => Boolean(product?.source?.platform === '1688' || /^1688-/i.test(String(product?.sku || '')));
const labels = sourceProducts.filter(is1688).flatMap(product => [
  ...(product.options || []).flatMap(option => [option.name, ...(option.values || [])]),
  ...(product.variants || []).flatMap(variant => Object.values(variant.values || {})),
]).filter(value => chinese.test(String(value || '')));
const translated = await Importer.translateOptionValues(labels, {
  cache: translationMap,
  concurrency: Number(arg('translation-concurrency', '6')),
  batchSize: Number(arg('translation-batch-size', '60')),
});
translationMap = { ...translationMap, ...translated };
const products = sourceProducts.map(product => is1688(product)
  ? Importer.localizeProduct(product, translationMap, { maxLength: maxTitleLength })
  : product).map(product => {
    const key = String(product?.source?.offerId || product?.sku || '').trim();
    const override = mediaOverrides[key] || mediaOverrides[String(product?.sku || '').replace(/^1688-/i, '')];
    if (!override) return product;
    return Importer.mergeEnrichment(product, {
      gallery: override.gallery,
      detailImages: override.detailImages,
      videos: override.videos,
      descriptionHtml: override.descriptionHtml,
      description: override.description,
      descriptionUrl: override.descriptionUrl,
      optionImages: override.optionImages,
      variantImages: override.variantImages,
      detailFetchedAt: override.detailFetchedAt,
      detailStatus: override.detailStatus || 'available',
      source: { ...(override.source || {}), mediaOverride: true },
    });
  });
const active = products.filter(product => product?.status === 'Active');
const chunkSize = 50;
const variantEncoding = 'crocs-1688-v3';

function canPack(product) {
  return Array.isArray(product?.variants) && product.variants.length > 0
    && Array.isArray(product.options) && product.options.length > 0
    && product.variants.every(variant => {
      if (!variant || variant.id !== variant.sku || typeof variant.sku !== 'string') return false;
      if (variant.compareAt != null || variant.cost != null || variant.barcode) return false;
      return product.options.every(option => option.values?.includes(variant.values?.[option.id]));
    });
}

function packVariants(product) {
  if (!canPack(product)) return product;
  const options = product.options;
  const regions = [...new Set(product.variants.flatMap(variant => Object.keys(variant.regionalPrices || {})))];
  const rows = product.variants.map(variant => [
    variant.sku,
    ...options.map(option => option.values.indexOf(variant.values[option.id])),
    variant.price,
    variant.stock,
    ...regions.map(region => variant.regionalPrices?.[region] ?? null),
    variant.enabled === false ? 0 : 1,
  ]);
  const variantImages = {
    ...(product.variantImages && typeof product.variantImages === 'object' ? product.variantImages : {}),
    ...Object.fromEntries(product.variants.map(variant => [variant.id || variant.sku, variant.image || variant.imageUrl]).filter(([, image]) => image)),
  };
  const packed = { ...product, variantEncoding, variantRegions: regions, variantsPacked: rows,
    ...(Object.keys(variantImages).length ? { variantImages } : {}) };
  delete packed.variants;
  return packed;
}

function projection(product, chunk) {
  const value = packVariants(product);
  return {
    id: value.id,
    title: value.title,
    sku: value.sku,
    price: Number.isSafeInteger(value.price) ? value.price : 0,
    stock: Number.isSafeInteger(value.stock) ? Math.max(0, value.stock) : 0,
    status: 'Active',
    image: value.image || '',
    gallery: Array.isArray(value.gallery) ? value.gallery : [],
      detailImages: Array.isArray(value.detailImages) ? value.detailImages : [],
    videos: Array.isArray(value.videos) ? value.videos : [],
    imageAlt: value.imageAlt || value.title,
    brand: value.brand || 'Nhà cung cấp 1688',
    slug: value.slug || value.id,
    category: value.category || 'Thời trang trẻ em',
    description: value.description || '',
    descriptionHtml: value.descriptionHtml ?? null,
    attributes: Array.isArray(value.attributes) ? value.attributes : [],
    regionalPrices: value.regionalPrices || {},
    priceByRegion: value.priceByRegion || {},
    pricesByRegion: value.pricesByRegion || {},
    seo: value.seo || {},
    options: Array.isArray(value.options) ? value.options : [],
    optionImages: value.optionImages && typeof value.optionImages === 'object' ? value.optionImages : {},
    variantImages: value.variantImages && typeof value.variantImages === 'object' ? value.variantImages : {},
    ...(value.variantEncoding === variantEncoding
      ? { variantEncoding, variantRegions: value.variantRegions || [], variantsPacked: value.variantsPacked || [] }
      : { variants: Array.isArray(value.variants) ? value.variants : [] }),
    colour: value.colour || null,
    sizes: value.sizes || null,
    detailChunk: chunk,
  };
}

await rm(outputPath, { recursive: true, force: true });
await mkdir(outputPath, { recursive: true });
await writeFile(translationCachePath, JSON.stringify(translationMap, null, 2));
if (Object.keys(mediaOverrides).length) await writeFile(join(outputPath, 'media-overrides.json'), JSON.stringify(mediaOverrides, null, 2));
const details = new Map();
const summaries = active.map((product, index) => {
  const chunk = Math.floor(index / chunkSize);
  const value = projection(product, chunk);
  details.set(value.id, value);
  return {
    id: value.id,
    title: value.title,
    sku: value.sku,
    price: value.price,
    stock: value.stock,
    status: 'Active',
    image: value.image,
    imageAlt: value.imageAlt,
    brand: value.brand,
    slug: value.slug,
    category: value.category,
    hasVariants: value.variantEncoding === variantEncoding ? value.variantsPacked.length > 0 : value.variants.length > 0,
    regionalPrices: value.regionalPrices,
    priceByRegion: value.priceByRegion,
    pricesByRegion: value.pricesByRegion,
    seo: value.seo,
    detailChunk: chunk,
  };
});

const state = backup.settings || {};
const localization = {
  currency: state.currency || 'USD',
  defaultRegion: state.defaultRegion || 'us',
  defaultLanguage: state.defaultLanguage || 'en',
  locale: state.locale || 'en-US',
  autoDetectRegion: state.autoDetectRegion !== false,
  regions: Array.isArray(state.regions) ? state.regions : [],
  languages: state.languages || {},
};
const collections = (Array.isArray(backup.collections) ? backup.collections : [])
  .filter(collection => collection?.status === 'Active')
  .map(collection => ({ id: collection.id, title: collection.title, description: collection.description || '', productIds: collection.productIds || [], status: 'Active' }));
const menus = Array.isArray(backup.menus) ? backup.menus : [];
await writeFile(join(outputPath, 'summary.json'), JSON.stringify({
  store: { name: state.name || 'Jersevo', currency: state.currency || 'USD' },
  localization,
  products: summaries,
  collections,
  theme: backup.theme?.published || {},
  menus,
  generatedAt: new Date().toISOString(),
}));

const chunkCount = Math.ceil(active.length / chunkSize);
for (let chunk = 0; chunk < chunkCount; chunk += 1) {
  const ids = summaries.filter(product => product.detailChunk === chunk).map(product => product.id);
  const payload = Object.fromEntries(ids.map(id => [id, details.get(id)]));
  await writeFile(join(outputPath, `details-${chunk}.json`), JSON.stringify(payload));
}
console.log(`Generated ${summaries.length} summaries and ${chunkCount} detail chunks in ${outputPath}`);
