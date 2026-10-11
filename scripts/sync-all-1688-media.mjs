#!/usr/bin/env node
/*
 * Refresh every imported 1688 product from the public signed SKU service.
 *
 * The 1688 mobile/desktop HTML pages are frequently protected by a visual
 * challenge. The signed mini-offer endpoint remains the official source for
 * SKU combinations, stock, prices and variation images, so this job can
 * safely complete the structured media layer without inventing data. Any
 * previously verified description HTML, detail images or videos are kept.
 * A browser export can be merged later by enrich-1688-products.mjs.
 */
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import Importer from '../1688-importer.js';

const root = path.resolve(import.meta.dirname, '..');
const arg = (name, fallback = '') => {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? String(process.argv[i + 1] || fallback) : fallback;
};
const numberArg = (name, fallback) => {
  const value = Number(arg(name, ''));
  return Number.isFinite(value) ? value : fallback;
};
const readJson = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const writeJson = async (file, value) => {
  const temporary = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temporary, file);
};
const is1688 = product => /^1688-/i.test(String(product?.sku || '')) || product?.source?.platform === '1688';
const detailFiles = directory => fs.readdir(directory).then(files => files.filter(file => /^details-\d+\.json$/.test(file)));

const catalogDirectory = path.resolve(arg('catalog', path.join(root, 'assets', 'catalog-1688')));
const summaryPath = path.join(catalogDirectory, 'summary.json');
const inputPath = path.resolve(arg('input', path.join(os.tmpdir(), '1688-enriched-ready.json')));
const checkpointPath = path.resolve(arg('checkpoint', path.join(os.tmpdir(), '1688-media-sync.checkpoint.json')));
const concurrency = Math.max(1, Math.min(6, Math.floor(numberArg('concurrency', 4))));
const force = arg('force', 'false') === 'true';

const summary = await readJson(summaryPath);
const files = await detailFiles(catalogDirectory);
const currentDetails = {};
for (const file of files) Object.assign(currentDetails, await readJson(path.join(catalogDirectory, file)));
const importedInput = await readJson(inputPath);
if (!Array.isArray(importedInput) || !importedInput.length) throw new Error(`Input 1688 không hợp lệ: ${inputPath}`);

const currentBySku = new Map(Object.values(currentDetails).filter(is1688).map(product => [String(product.sku), product]));
const imported = importedInput.map(raw => {
  const current = currentBySku.get(String(raw.sku));
  if (!current) throw new Error(`Không tìm thấy sản phẩm hiện tại cho SKU ${raw.sku}`);
  const merged = {
    ...current,
    ...raw,
    id: current.id,
    status: 'Active',
    title: current.title || raw.title,
    description: current.description || raw.description || '',
    descriptionHtml: raw.descriptionHtml || current.descriptionHtml || null,
    gallery: [...new Set([...(current.gallery || []), ...(raw.gallery || [])])],
    detailImages: [...new Set([...(current.detailImages || []), ...(raw.detailImages || [])])],
    videos: [...new Set([...(current.videos || []), ...(raw.videos || [])])],
    source: { ...(current.source || {}), ...(raw.source || {}) },
  };
  // Use the unpacked source matrix as the merge input. The static mirror is
  // packed again after enrichment, so there is no stale packed-row collision.
  delete merged.variantEncoding;
  delete merged.variantRegions;
  delete merged.variantsPacked;
  return merged;
});

let checkpoint = {};
try { checkpoint = await readJson(checkpointPath); } catch { /* first run */ }
const results = new Array(imported.length);
const clients = Array.from({ length: concurrency }, () => Importer.createOfferDetailClient());
let cursor = 0;
let completed = 0;
let failed = 0;
const startedAt = Date.now();

async function fetchOne(client, index) {
  const product = imported[index];
  const offerId = String(product.source?.offerId || product.sku).replace(/^1688-/i, '');
  const cached = checkpoint[offerId];
  if (!force && cached?.ok && cached.payload) {
    results[index] = cached.payload;
    completed += 1;
    return;
  }
  try {
    const body = await client.call(offerId);
    const payload = Importer.detailPayload(body);
    results[index] = payload;
    checkpoint[offerId] = { ok: true, updatedAt: new Date().toISOString(), payload };
  } catch (error) {
    failed += 1;
    results[index] = { offerId, error: error.message };
    checkpoint[offerId] = { ok: false, updatedAt: new Date().toISOString(), error: error.message };
  }
  completed += 1;
  if (completed % 25 === 0 || completed === imported.length) {
    await writeJson(checkpointPath, checkpoint);
    console.log(`Đã đọc SKU/media 1688: ${completed}/${imported.length} · lỗi ${failed}`);
  }
}

async function worker(client) {
  while (true) {
    const index = cursor;
    cursor += 1;
    if (index >= imported.length) return;
    await fetchOne(client, index);
  }
}
await Promise.all(clients.map(worker));
await writeJson(checkpointPath, checkpoint);

const labels = results.flatMap(payload => {
  if (!payload || payload.error) return [];
  return [
    ...(payload.options || []).flatMap(option => [option.name, ...(option.values || [])]),
    ...(payload.variants || []).flatMap(variant => Object.values(variant.values || {})),
  ];
});
const translationPath = path.join(catalogDirectory, 'variation-translations.vi.json');
let translations = {};
try { translations = await readJson(translationPath); } catch { /* first run */ }
const translated = await Importer.translateOptionValues(labels, {
  cache: translations,
  concurrency: Math.min(8, concurrency + 2),
  batchSize: 60,
  onProgress: ({ translated: count, total }) => {
    if (count === total || count % 300 < 60) process.stdout.write(`\rDịch variation: ${count}/${total}`);
  },
});
translations = { ...translations, ...translated };
process.stdout.write('\n');

const enriched = imported.map((product, index) => {
  const payload = results[index];
  if (!payload || payload.error) return Importer.localizeProduct(product, translations, { maxLength: 56 });
  const existingStatus = product.source?.detailStatus === 'available' ? 'available' : 'sku_available';
  return Importer.mergeEnrichment(product, {
    ...payload,
    translationMap: translations,
    titleMaxLength: 56,
    detailStatus: existingStatus,
    source: { ...(payload.source || {}), offerId: product.source?.offerId, detailStatus: existingStatus },
    regionId: 'vn',
    exchangeRateCnyBase: product.source?.exchangeRateCnyBase,
    exchangeRateCnyVnd: product.source?.exchangeRateCnyVnd,
    priceMultiplier: product.source?.priceMultiplier || 2,
    baseCurrencyDecimals: product.source?.baseCurrencyDecimals || 2,
  });
});

const bySku = new Map(enriched.map(product => [String(product.sku), product]));
const allProducts = (summary.products || []).map(item => bySku.get(String(item.sku)) || currentDetails[item.id]).filter(Boolean);
const backup = {
  settings: {
    ...(summary.localization || {}),
    name: summary.store?.name || 'Sally Kids',
  },
  products: allProducts,
  collections: summary.collections || [],
  menus: summary.menus || [],
  theme: { published: summary.theme || {} },
};
const backupPath = path.join(os.tmpdir(), `1688-static-backup-${process.pid}.json`);
const staging = path.join(os.tmpdir(), `1688-catalog-stage-${process.pid}`);
await writeJson(backupPath, backup);
await new Promise((resolve, reject) => {
  const child = spawn(process.execPath, [path.join(root, 'scripts', 'generate-static-catalog.mjs'), backupPath, staging], { cwd: root, stdio: 'inherit' });
  child.once('error', reject);
  child.once('exit', code => code === 0 ? resolve() : reject(new Error(`generate-static-catalog exited ${code}`)));
});

const stageFiles = await fs.readdir(staging);
await fs.mkdir(catalogDirectory, { recursive: true });
for (const file of stageFiles) await fs.copyFile(path.join(staging, file), path.join(catalogDirectory, file));
for (const file of files) if (!stageFiles.includes(file)) await fs.rm(path.join(catalogDirectory, file), { force: true });
await writeJson(translationPath, translations);
await fs.rm(backupPath, { force: true });
await fs.rm(staging, { recursive: true, force: true });

const finalDetails = {};
for (const file of await detailFiles(catalogDirectory)) Object.assign(finalDetails, await readJson(path.join(catalogDirectory, file)));
const finalImported = Object.values(finalDetails).filter(is1688);
console.log(JSON.stringify({
  elapsedSeconds: Math.round((Date.now() - startedAt) / 1000),
  products: finalImported.length,
  gallery: finalImported.filter(product => product.gallery?.length).length,
  detailImages: finalImported.filter(product => product.detailImages?.length).length,
  videos: finalImported.filter(product => product.videos?.length).length,
  variants: finalImported.filter(product => product.variantsPacked?.length || product.variants?.length).length,
  optionImages: finalImported.filter(product => Object.keys(product.optionImages || {}).length).length,
  variantImages: finalImported.filter(product => Object.keys(product.variantImages || {}).length).length,
  skuFailures: failed,
}, null, 2));
