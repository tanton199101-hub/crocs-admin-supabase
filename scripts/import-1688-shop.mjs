#!/usr/bin/env node
/*
 * Build an idempotent JSON import for an 1688 shop catalog.
 *
 * The generated file is intentionally a draft import. Product prices keep a
 * base-currency amount for the existing catalog and store the requested VND
 * amount as a `regionalPrices.vn` override. This keeps the default storefront
 * currency in USD while Vietnam sees CNY × rate × multiplier.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import Importer from '../1688-importer.js';

const SHOP_URL = 'https://shop1481820794169.1688.com/?spm=a261y.7663282.shopNavigation.2.39ab6da60stVMB&offerId=997501798199&td_page_id=PC-DEFAULT-2026';
const MEMBER_ID = Importer.DEFAULT_SHOP_MEMBER_ID;
const SHOP_NAME = Importer.DEFAULT_SHOP_NAME;
const DEFAULT_OUTPUT = path.resolve(process.cwd(), '1688-shop-import.json');

function arg(name, fallback = '') {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
}

function numberArg(name, fallback) {
  const raw = arg(name, '');
  if (raw === '') return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : fallback;
}

async function readJson(file, fallback = {}) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}

async function exchangeRates() {
  const response = await fetch('https://open.er-api.com/v6/latest/CNY', { headers: { accept: 'application/json' } });
  if (!response.ok) throw new Error(`Không đọc được tỷ giá CNY: ${response.status}`);
  const body = await response.json();
  if (!body?.rates?.VND) throw new Error('Nguồn tỷ giá không có CNY→VND.');
  return body;
}

const output = path.resolve(arg('output', DEFAULT_OUTPUT));
const cacheFile = path.resolve(arg('translation-cache', `${output}.translations.json`));
const multiplier = numberArg('multiplier', 2);
const explicitVndRate = numberArg('exchange-rate', 0);
const baseCurrency = String(arg('base-currency', 'USD')).toUpperCase();
const baseDecimals = ['VND', 'JPY'].includes(baseCurrency) ? 0 : 2;
const shopUrl = arg('shop-url', SHOP_URL);
const memberId = arg('member-id', MEMBER_ID);
const pageSize = Math.min(100, Math.max(1, numberArg('page-size', 30)));
const maxOffers = Math.max(0, Math.floor(numberArg('limit', 0)));

if (!multiplier || multiplier <= 0) throw new Error('--multiplier phải lớn hơn 0.');

console.log(`Đang đọc catalog 1688 (${shopUrl.split('?')[0]})…`);
const catalog = await Importer.fetchShopCatalog({
  shopUrl,
  memberId,
  pageSize,
  onPage: ({ pageNum, pages, received, total }) => process.stdout.write(`\r  Trang ${pageNum}/${pages} · ${received}/${total}`),
});
process.stdout.write('\n');
if (!maxOffers && catalog.total !== catalog.offers.length) throw new Error(`Catalog trả về ${catalog.offers.length}/${catalog.total}; dừng để tránh nhập thiếu.`);
if (maxOffers) catalog.offers = catalog.offers.slice(0, maxOffers);

const rateBody = explicitVndRate > 0 ? { rates: { VND: explicitVndRate }, time_last_update_utc: 'manual override' } : await exchangeRates();
const exchangeRateCnyVnd = Number(rateBody.rates.VND);
const exchangeRateCnyBase = Number(rateBody.rates[baseCurrency]);
if (!exchangeRateCnyVnd || !exchangeRateCnyBase) throw new Error(`Không có tỷ giá CNY→${baseCurrency}/VND.`);
console.log(`Tỷ giá snapshot: 1 CNY = ${exchangeRateCnyVnd} VND · 1 CNY = ${exchangeRateCnyBase} ${baseCurrency} · nhân ${multiplier}`);

const oldCache = await readJson(cacheFile, {});
const translated = await Importer.translateTitles(catalog.offers, {
  cache: oldCache,
  concurrency: Number(arg('translation-concurrency', 2)),
  delayMs: numberArg('translation-delay', 120),
  onProgress: async ({ index, total }) => {
    if (index % 10 === 0 || index === total) {
      process.stdout.write(`\r  Dịch tiêu đề ${index}/${total}`);
    }
  },
});
process.stdout.write('\n');
await fs.writeFile(cacheFile, JSON.stringify(translated.cache, null, 2), 'utf8');

const products = catalog.offers.map(offer => Importer.productFromOffer(offer, {
  shopUrl,
  shopId: memberId,
  shopName: SHOP_NAME,
  exchangeRateCnyVnd,
  exchangeRateCnyBase,
  baseCurrencyDecimals: baseDecimals,
  priceMultiplier: multiplier,
  regionId: 'vn',
  titleVi: translated.titles[String(offer.id)],
  status: 'Draft',
}));

const chineseTitleCount = products.filter(product => /[\u3400-\u9fff]/.test(product.title)).length;
if (chineseTitleCount) throw new Error(`${chineseTitleCount} tiêu đề vẫn còn chữ Trung; không ghi file.`);
const offerIds = new Set(products.map(product => product.source.offerId));
if (offerIds.size !== products.length) throw new Error('Offer ID bị trùng; không ghi file.');

const metadata = {
  source: '1688', shopUrl, shopMemberId: memberId, shopName: SHOP_NAME, offerCount: catalog.total,
  importedAt: new Date().toISOString(), sourceCurrency: 'CNY', targetCurrency: 'VND', baseCurrency,
  exchangeRateCnyVnd, exchangeRateCnyBase, priceMultiplier: multiplier, status: 'Draft',
  imagePolicy: '1688 CDN images are stored through the same-origin allowlisted proxy',
  translationProvider: 'Google Translate public endpoint with deterministic fallback',
};
await fs.writeFile(output, JSON.stringify(products, null, 2), 'utf8');
await fs.writeFile(`${output}.meta.json`, JSON.stringify(metadata, null, 2), 'utf8');
console.log(`Đã tạo ${products.length} sản phẩm Draft tại ${output}`);
console.log(`Giá VN được lưu trong regionalPrices.vn; tỷ giá ${exchangeRateCnyVnd}, hệ số ${multiplier}.`);
