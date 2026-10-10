#!/usr/bin/env node
/*
 * Normalize an already generated 1688 mirror. This command is idempotent:
 * it can run after every catalog refresh without changing verified media,
 * packed variant indexes, or supplier pricing.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import Importer from '../1688-importer.js';

const arg = (name, fallback = '') => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
};
const directory = path.resolve(arg('catalog', 'assets/catalog-1688'));
const cachePath = path.resolve(arg('translation-cache', path.join(directory, 'variation-translations.vi.json')));
const maxTitleLength = Math.max(36, Math.min(80, Number(arg('max-title-length', '56')) || 56));
const chinese = /[\u3400-\u9fff\uf900-\ufaff]/;
const is1688 = product => Boolean(product?.source?.platform === '1688' || /^1688-/i.test(String(product?.sku || '')));
const detailFiles = (await fs.readdir(directory)).filter(file => /^details-\d+\.json$/.test(file))
  .sort((left, right) => Number(left.match(/\d+/)?.[0]) - Number(right.match(/\d+/)?.[0]));
const chunks = [];
const products = [];
for (const file of detailFiles) {
  const payload = JSON.parse(await fs.readFile(path.join(directory, file), 'utf8'));
  chunks.push({ file, payload });
  products.push(...Object.values(payload));
}
const imported = products.filter(is1688);
const values = imported.flatMap(product => [
  ...(product.options || []).flatMap(option => [option.name, ...(option.values || [])]),
  ...(product.variants || []).flatMap(variant => Object.values(variant.values || {})),
]).filter(value => chinese.test(String(value || '')));
let cache = {};
try { cache = JSON.parse(await fs.readFile(cachePath, 'utf8')); } catch { /* first run */ }
console.log(`Đang dịch ${new Set(values).size} nhãn variation của ${imported.length} sản phẩm…`);
const translated = await Importer.translateOptionValues(values, {
  cache,
  concurrency: Number(arg('concurrency', '6')),
  batchSize: Number(arg('batch-size', '60')),
  onProgress: ({ translated: count, total }) => {
    if (count === total || count % 300 < 60) process.stdout.write(`\r  ${count}/${total}`);
  },
});
process.stdout.write('\n');
const translationMap = { ...cache, ...translated };
await fs.writeFile(cachePath, JSON.stringify(translationMap, null, 2), 'utf8');

function detailImageCount(product) {
  const direct = Array.isArray(product?.detailImages) ? product.detailImages.length : 0;
  const html = String(product?.descriptionHtml || '');
  const embedded = [...html.matchAll(/(?:src|data-src|data-lazy-src|data-lazyload-src|data-ks-lazyload|data-img|data-image|data-original|srcset|data-srcset)\s*=\s*["'][^"']+["']/gi)].length;
  return Math.max(direct, embedded);
}

function descriptionFor(product) {
  const choices = (product.options || []).map(option => {
    const values = (option.values || []).slice(0, 12).join(', ');
    return `${option.name}: ${values}${option.values?.length > 12 ? ', …' : ''}`;
  }).filter(Boolean).join('; ');
  const detailCount = detailImageCount(product);
  const galleryCount = Array.isArray(product.gallery) ? product.gallery.length : 0;
  const media = detailCount
    ? `Bộ ảnh mô tả chi tiết gồm ${detailCount} ảnh từ nhà cung cấp 1688.`
    : `Hiện có ${galleryCount} ảnh sản phẩm đã đồng bộ từ nhà cung cấp 1688.`;
  return `${product.title}.${choices ? ` Tùy chọn: ${choices}.` : ''} ${media} Vui lòng chọn đúng phân loại và kích thước trước khi đặt hàng.`.slice(0, 12000);
}

let shortened = 0;
let localized = 0;
for (const chunk of chunks) {
  for (const [id, value] of Object.entries(chunk.payload)) {
    if (!is1688(value)) continue;
    const beforeTitle = value.title;
    const beforeOptions = JSON.stringify(value.options || []);
    const next = Importer.localizeProduct(value, translationMap, { maxLength: maxTitleLength });
    if (next.title !== beforeTitle) shortened += 1;
    if (JSON.stringify(next.options || []) !== beforeOptions) localized += 1;
    const description = String(next.description || '');
    if (!description || /^Sản phẩm nhập từ catalog 1688/i.test(description) || /Hiện có \d+ ảnh sản phẩm/.test(description) || /Bộ ảnh mô tả chi tiết gồm/.test(description)) {
      next.description = descriptionFor(next);
    }
    chunk.payload[id] = next;
  }
}

for (const { file, payload } of chunks) await fs.writeFile(path.join(directory, file), JSON.stringify(payload), 'utf8');
const summaryPath = path.join(directory, 'summary.json');
const summary = JSON.parse(await fs.readFile(summaryPath, 'utf8'));
const byId = new Map(chunks.flatMap(chunk => Object.values(chunk.payload)).filter(is1688).map(product => [product.id, product]));
summary.products = (summary.products || []).map(product => {
  const detail = byId.get(product.id);
  return detail ? {
    ...product,
    title: detail.title,
    imageAlt: detail.imageAlt,
    slug: detail.slug,
    seo: detail.seo,
  } : product;
});
summary.generatedAt = new Date().toISOString();
await fs.writeFile(summaryPath, JSON.stringify(summary), 'utf8');

const remaining = chunks.flatMap(chunk => Object.values(chunk.payload)).filter(is1688).flatMap(product => [
  product.title,
  ...(product.options || []).flatMap(option => [option.name, ...(option.values || [])]),
  ...(product.variants || []).flatMap(variant => Object.values(variant.values || {})),
]).filter(value => chinese.test(String(value || '')));
if (remaining.length) throw new Error(`${remaining.length} nhãn variation/tiêu đề vẫn còn chữ Trung.`);
console.log(`Đã rút gọn ${shortened} tiêu đề; Việt hóa ${localized} nhóm variation; còn 0 nhãn tiếng Trung.`);
