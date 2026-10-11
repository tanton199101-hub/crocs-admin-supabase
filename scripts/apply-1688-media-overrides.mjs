#!/usr/bin/env node
/* Apply verified offer-page media to an already generated static catalog. */
import fs from 'node:fs/promises';
import path from 'node:path';
import Importer from '../1688-importer.js';

const arg = (name, fallback = '') => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
};
const directory = path.resolve(arg('catalog', 'assets/catalog-1688'));
const overridesPath = path.resolve(arg('overrides', path.join(directory, 'media-overrides.json')));
const overrides = JSON.parse(await fs.readFile(overridesPath, 'utf8'));
const files = (await fs.readdir(directory)).filter(file => /^details-\d+\.json$/.test(file));
const changed = new Set();

for (const file of files) {
  const fullPath = path.join(directory, file);
  const payload = JSON.parse(await fs.readFile(fullPath, 'utf8'));
  for (const product of Object.values(payload)) {
    const offerId = String(product?.source?.offerId || product?.sku || '').replace(/^1688-/i, '');
    const override = overrides[offerId] || overrides[String(product?.sku || '')];
    if (!override) continue;
    const gallery = [...new Set((Array.isArray(override.gallery) ? override.gallery : []).map(value => Importer.imageUrl(value, { proxy: true })).filter(Boolean))].slice(0, Importer.MAX_GALLERY_IMAGES);
    const detailImages = [...new Set((Array.isArray(override.detailImages) ? override.detailImages : product.detailImages || []).map(value => Importer.imageUrl(value, { proxy: true })).filter(Boolean))].slice(0, Importer.MAX_DETAIL_IMAGES);
    const videos = [...new Set((Array.isArray(override.videos) ? override.videos : product.videos || []).map(value => Importer.videoUrl(value, { proxy: true })).filter(Boolean))].slice(0, Importer.MAX_VIDEOS);
    const optionImages = Object.fromEntries(Object.entries(override.optionImages || {}).map(([optionId, values]) => [optionId, Object.fromEntries(Object.entries(values || {}).map(([optionValue, value]) => {
      const image = Importer.imageUrl(value, { proxy: true });
      return image ? [optionValue, image] : null;
    }).filter(Boolean))]).filter(([, values]) => Object.keys(values).length));
    const variantImages = Object.fromEntries(Object.entries(override.variantImages || {}).map(([variantId, value]) => {
      const image = Importer.imageUrl(value, { proxy: true });
      return image ? [variantId, image] : null;
    }).filter(Boolean));
    if (gallery.length) { product.gallery = gallery; product.image = gallery[0]; }
    if (detailImages.length) product.detailImages = detailImages;
    if (videos.length) product.videos = videos;
    if (Object.keys(optionImages).length) product.optionImages = optionImages;
    if (Object.keys(variantImages).length) product.variantImages = variantImages;
    if (override.descriptionHtml) product.descriptionHtml = Importer.proxyDescriptionHtml(override.descriptionHtml);
    if (override.description) product.description = String(override.description).slice(0, 12000);
    if (gallery.length || detailImages.length || videos.length) {
      const count = detailImages.length;
      if (count && /Bộ ảnh mô tả chi tiết gồm \d+ ảnh/.test(String(product.description || ''))) product.description = product.description.replace(/Bộ ảnh mô tả chi tiết gồm \d+ ảnh/, `Bộ ảnh mô tả chi tiết gồm ${count} ảnh`);
      changed.add(product.id);
    }
  }
  await fs.writeFile(fullPath, JSON.stringify(payload), 'utf8');
}

const summaryPath = path.join(directory, 'summary.json');
const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
const detailMap = new Map();
for (const file of files) {
  const payload = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
  for (const product of Object.values(payload)) detailMap.set(product.id, product);
}
summary.products = (summary.products || []).map(product => {
  const detail = detailMap.get(product.id);
  return detail ? { ...product, image: detail.image, imageAlt: detail.imageAlt, slug: detail.slug, seo: detail.seo } : product;
});
summary.generatedAt = new Date().toISOString();
await fs.writeFile(summaryPath, JSON.stringify(summary), 'utf8');
console.log(`Đã áp dụng media override cho ${changed.size} sản phẩm.`);
