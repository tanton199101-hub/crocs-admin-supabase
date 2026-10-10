#!/usr/bin/env node
/*
 * Resumable 1688 enrichment.
 *
 * The shop list endpoint supplies verified gallery images. Detail/SKU data is
 * accepted only from an official response or a user-provided browser export;
 * CAPTCHA responses are checkpointed as blocked and never converted into
 * guessed variants or stock.
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import Importer from '../1688-importer.js';

const arg = (name, fallback = '') => {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? String(process.argv[index + 1] || fallback) : fallback;
};
const numberArg = (name, fallback) => {
  const value = Number(arg(name, ''));
  return Number.isFinite(value) ? value : fallback;
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const inputPath = path.resolve(arg('input', path.resolve(process.cwd(), '1688-shop-import.json')));
const outputPath = path.resolve(arg('output', `${inputPath}.enriched.json`));
const checkpointPath = path.resolve(arg('checkpoint', `${outputPath}.checkpoint.json`));
const manifestPath = arg('detail-manifest', '');
const catalogPath = arg('catalog', '');
const limit = Math.max(0, Math.floor(numberArg('limit', 0)));
const delayMs = Math.max(0, Math.floor(numberArg('delay', 500)));
const fetchCatalog = arg('refresh-catalog', 'true') !== 'false';
const fetchMobile = arg('fetch-mobile', 'true') !== 'false';
const fetchSku = arg('fetch-sku', 'true') !== 'false';
const force = arg('force', 'false') === 'true';
const maxTitleLength = Math.max(36, Math.min(80, Math.floor(numberArg('max-title-length', 56))));
const translationConcurrency = Math.max(1, Math.min(8, Math.floor(numberArg('translation-concurrency', 4))));
const translationBatchSize = Math.max(1, Math.min(80, Math.floor(numberArg('translation-batch-size', 60))));

const DETAIL_HOSTS = new Set(['itemcdn.tmall.com']);
const MOBILE_HOSTS = new Set(['m.1688.com']);
function safeDetailUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !DETAIL_HOSTS.has(url.hostname.toLowerCase()) || !/^\/1688offer\//i.test(url.pathname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

function safeMobileUrl(value) {
  try {
    const url = new URL(String(value || ''));
    if (url.protocol !== 'https:' || !MOBILE_HOSTS.has(url.hostname.toLowerCase()) || !/^\/offer\/\d{6,20}\.html$/i.test(url.pathname)) return '';
    return url.href;
  } catch {
    return '';
  }
}

async function readJson(file, fallback) {
  try { return JSON.parse(await fs.readFile(file, 'utf8')); } catch { return fallback; }
}
async function writeJson(file, value) {
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temp, file);
}
function blockedResponse(text) { return /_____tmd_____|punish|captcha|FAIL_SYS_USER_VALIDATE|RGV587_ERROR|unusual traffic/i.test(String(text || '')); }
async function fetchSafe(url) {
  const target = safeDetailUrl(url);
  if (!target) throw new Error('URL mô tả 1688 không nằm trong allowlist itemcdn.tmall.com');
  const response = await fetch(target, { headers: { accept: 'text/html,application/xhtml+xml,*/*', 'user-agent': 'Mozilla/5.0' }, redirect: 'error', signal: AbortSignal.timeout(20000) });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (blockedResponse(text)) { const error = new Error('1688 yêu cầu CAPTCHA/xác thực phiên'); error.code = 'CAPTCHA'; throw error; }
  return text;
}
async function fetchMobileSafe(url) {
  const target = safeMobileUrl(url);
  if (!target) throw new Error('URL offer mobile 1688 không nằm trong allowlist.');
  const response = await fetch(target, {
    headers: {
      accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'user-agent': 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36',
    },
    redirect: 'error',
    signal: AbortSignal.timeout(25000),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`HTTP ${response.status}`);
  if (blockedResponse(text)) { const error = new Error('1688 mobile yêu cầu CAPTCHA/xác thực phiên'); error.code = 'CAPTCHA'; throw error; }
  if (!text.includes('window.__INIT_DATA')) throw new Error('Trang mobile 1688 không trả payload sản phẩm.');
  return text;
}
function detailUrlFromText(text, offerId) {
  const match = String(text || '').match(/https?:\\?\/\\?\/itemcdn\.tmall\.com\/1688offer\/[A-Za-z0-9_-]+/i);
  return match?.[0]?.replaceAll('\\/', '/') || (offerId ? '' : '');
}

const products = await readJson(inputPath, []);
if (!Array.isArray(products) || !products.length) throw new Error(`Không đọc được mảng sản phẩm từ ${inputPath}`);
const manifest = manifestPath ? await readJson(path.resolve(manifestPath), {}) : {};
const checkpoint = await readJson(checkpointPath, { version: 1, processed: {}, blocked: {}, updatedAt: '' });
const detailClient = fetchSku ? Importer.createOfferDetailClient() : null;
let offersById = new Map();
if (catalogPath) {
  const suppliedCatalog = await readJson(path.resolve(catalogPath), {});
  const catalogOffers = Array.isArray(suppliedCatalog) ? suppliedCatalog : suppliedCatalog?.offers;
  if (Array.isArray(catalogOffers)) offersById = new Map(catalogOffers.filter(item => item?.id).map(item => [String(item.id), item]));
}
if (fetchCatalog) {
  console.log('Đang đọc gallery từ catalog 1688…');
  try {
    const catalog = await Importer.fetchShopCatalog({
      shopUrl: arg('shop-url', 'https://shop1481820794169.1688.com/'),
      memberId: arg('member-id', Importer.DEFAULT_SHOP_MEMBER_ID),
      pageSize: Math.min(100, Math.max(1, numberArg('page-size', 100))),
      onPage: info => process.stdout.write(`\r  Trang ${info.pageNum}/${info.pages} · ${info.received}/${info.total}`),
    });
    process.stdout.write('\n');
    offersById = new Map(catalog.offers.map(offer => [String(offer.id), offer]));
  } catch (error) {
    process.stdout.write('\n');
    console.warn(`Không đọc được catalog gallery: ${error.message}. Tiếp tục bằng dữ liệu đã lưu/checkpoint.`);
    checkpoint.catalogError = { message: error.message, at: new Date().toISOString() };
  }
}

const output = products.map(item => ({ ...item }));
const translationCachePath = path.resolve(arg('translation-cache', path.join(process.cwd(), 'assets/catalog-1688/variation-translations.vi.json')));
let translationMap = await readJson(translationCachePath, {});
const chinese = /[\u3400-\u9fff\uf900-\ufaff]/;
const optionLabels = value => [
  ...(Array.isArray(value?.options) ? value.options.flatMap(option => [option.name, ...(option.values || [])]) : []),
  ...(Array.isArray(value?.variants) ? value.variants.flatMap(variant => Object.values(variant.values || {})) : []),
].map(item => String(item || '').trim()).filter(item => item && chinese.test(item));
async function translateMissing(value) {
  const labels = [...new Set(optionLabels(value))].filter(label => !translationMap[label]);
  if (!labels.length) return;
  const added = await Importer.translateOptionValues(labels, {
    cache: translationMap,
    concurrency: translationConcurrency,
    batchSize: translationBatchSize,
    onProgress: ({ translated, total }) => {
      if (translated === total) process.stdout.write(`\n  Đã dịch thêm ${total} nhãn variation.\n`);
    },
  });
  translationMap = { ...translationMap, ...added };
  await writeJson(translationCachePath, translationMap);
}
const initialLabels = [...new Set(output.flatMap(optionLabels))];
if (initialLabels.length) {
  const initial = await Importer.translateOptionValues(initialLabels, {
    cache: translationMap,
    concurrency: translationConcurrency,
    batchSize: translationBatchSize,
  });
  translationMap = { ...translationMap, ...initial };
  await writeJson(translationCachePath, translationMap);
}
for (let index = 0; index < output.length; index += 1) {
  output[index] = Importer.localizeProduct(output[index], translationMap, { maxLength: maxTitleLength });
}
const selected = limit ? output.slice(0, limit) : output;
let done = 0;
for (const product of selected) {
  const offerId = String(product?.source?.offerId || '').trim();
  if (!offerId) continue;
  const previous = checkpoint.processed[offerId];
  const hasGallery = Array.isArray(product.gallery) && product.gallery.length > 0;
  const hasDetail = Array.isArray(product.detailImages) && product.detailImages.length > 0 && product.source?.detailStatus === 'available';
  const hasVariants = Array.isArray(product.variants) && product.variants.length > 0;
  if (!force && previous?.gallery && previous?.detail && previous?.variants > 0 && hasGallery && hasDetail && hasVariants) continue;
  let enrichment = { source: { detailStatus: 'not_requested' } };
  const offer = offersById.get(offerId);
  if (offer) {
    const directGallery = Importer.offerImages(offer);
    enrichment = {
      ...enrichment,
      // Keep any previously verified gallery entries when the catalog
      // endpoint only returns a shortened image list.  The mobile/detail
      // response may still replace this with a richer list below.
      gallery: [...new Set([...(Array.isArray(product.gallery) ? product.gallery : []), ...directGallery])],
      image: directGallery[0] || product?.source?.imageUrl,
      source: { offerId, imageUrl: directGallery[0] || product?.source?.imageUrl || '', imageUrls: [...new Set([...(Array.isArray(product.source?.imageUrls) ? product.source.imageUrls : []), ...directGallery])], detailStatus: 'gallery_available' },
    };
  } else if (product?.source?.imageUrl) {
    enrichment.gallery = [...new Set([...(Array.isArray(product.gallery) ? product.gallery : []), product.source.imageUrl])];
    enrichment.image = product.source.imageUrl;
    enrichment.source = { offerId, imageUrl: product.source.imageUrl, imageUrls: [...new Set([...(Array.isArray(product.source?.imageUrls) ? product.source.imageUrls : []), ...(Array.isArray(product.gallery) ? product.gallery : []), product.source.imageUrl])], detailStatus: 'gallery_fallback' };
  }

  // The shop list does not include the offer's full media/SKU model.  The
  // public mobile offer page does, so read it first and keep the reduced
  // payload rather than persisting the large raw HTML document.
  let mobile = null;
  if (fetchMobile) {
    try {
      const mobileText = await fetchMobileSafe(`https://m.1688.com/offer/${offerId}.html`);
      mobile = Importer.parseMobileOfferDocument(mobileText);
      const mobileGallery = Array.isArray(mobile.gallery) ? mobile.gallery : [];
      enrichment = {
        ...enrichment,
        gallery: mobileGallery.length ? mobileGallery : enrichment.gallery,
        image: mobileGallery[0] || enrichment.image || product?.source?.imageUrl,
        attributes: mobile.attributes?.length ? mobile.attributes : enrichment.attributes,
        descriptionUrl: mobile.descriptionUrl || enrichment.descriptionUrl,
        priceCny: mobile.priceCny || enrichment.priceCny || 0,
        source: {
          ...(enrichment.source || {}),
          offerId,
          imageUrl: mobileGallery[0] || enrichment.source?.imageUrl || product?.source?.imageUrl || '',
          imageUrls: mobileGallery.length ? mobileGallery : enrichment.source?.imageUrls || [],
          detailStatus: 'mobile_available',
          mobileUrl: `https://m.1688.com/offer/${offerId}.html`,
        },
      };
    } catch (error) {
      checkpoint.blocked[offerId] = { reason: error.code === 'CAPTCHA' ? 'captcha_mobile' : `mobile: ${error.message}`, at: new Date().toISOString() };
    }
  }

  // Fetch the verified SKU/stock matrix from the official MTop service.  A
  // failed call is recorded, but never replaced with generated combinations.
  if (fetchSku && detailClient) {
    try {
      const skuBody = await detailClient.call(offerId);
      const parsedSku = Importer.detailPayload(skuBody);
      enrichment = {
        ...enrichment,
        ...parsedSku,
        gallery: enrichment.gallery?.length ? enrichment.gallery : parsedSku.gallery,
        attributes: enrichment.attributes?.length ? enrichment.attributes : parsedSku.attributes,
        descriptionUrl: enrichment.descriptionUrl || parsedSku.descriptionUrl,
        // SKU/stock data is a verified detail layer, but it is not the same
        // thing as the supplier's rich description.  Keep the distinction so
        // the admin can show exactly which part is still waiting on 1688.
        detailStatus: parsedSku.options?.length && parsedSku.variants?.length ? 'sku_available' : enrichment.detailStatus,
        detailFetchedAt: new Date().toISOString(),
        source: { ...(enrichment.source || {}), offerId, detailStatus: parsedSku.options?.length && parsedSku.variants?.length ? 'sku_available' : enrichment.source?.detailStatus || 'mobile_available' },
      };
    } catch (error) {
      checkpoint.blocked[offerId] = { reason: error.code === 'CAPTCHA' ? 'captcha_sku' : `sku: ${error.message}`, at: new Date().toISOString() };
    }
  }

  const supplied = manifest[offerId] || manifest[product.sku] || null;
  let detailText = supplied?.description || supplied?.html || '';
  let parsedDescriptionText = '';
  let detailPayload = supplied?.payload || supplied?.body || null;
  let descriptionUrl = supplied?.descriptionUrl || enrichment.descriptionUrl || product?.source?.descriptionUrl || '';
  if (!detailText && !detailPayload && !supplied && descriptionUrl) {
    try { detailText = await fetchSafe(descriptionUrl); }
    catch (error) { checkpoint.blocked[offerId] = { reason: error.code === 'CAPTCHA' ? 'captcha' : error.message, at: new Date().toISOString() }; }
  }
  if (supplied?.url && !detailText && !detailPayload) {
    try { detailText = await fetchSafe(supplied.url); } catch (error) {
      checkpoint.blocked[offerId] = { reason: error.code === 'CAPTCHA' ? 'captcha' : error.message, at: new Date().toISOString() };
    }
  }
  if (detailText && !descriptionUrl) descriptionUrl = detailUrlFromText(detailText, offerId);
  if (detailText) {
    const parsed = Importer.parseDescriptionDocument(detailText);
    parsedDescriptionText = parsed.text;
    enrichment = { ...enrichment, ...(parsed.text ? { description: parsed.text } : {}), descriptionHtml: parsed.html, detailImages: parsed.images, descriptionUrl, detailFetchedAt: new Date().toISOString(), detailStatus: parsed.text || parsed.images.length ? 'available' : 'empty', source: { ...(enrichment.source || {}), detailStatus: parsed.text || parsed.images.length ? 'available' : 'empty' } };
  }
  if (detailPayload) {
    try {
      const parsed = Importer.detailPayload(typeof detailPayload === 'string' ? JSON.parse(detailPayload) : detailPayload);
      enrichment = { ...enrichment, ...parsed, descriptionUrl: parsed.descriptionUrl || descriptionUrl, detailStatus: parsed.options?.length && parsed.variants?.length ? 'available' : enrichment.detailStatus, detailFetchedAt: new Date().toISOString() };
    } catch (error) {
      checkpoint.blocked[offerId] = { reason: `payload_invalid: ${error.message}`, at: new Date().toISOString() };
    }
  }
  if (supplied?.detail && typeof supplied.detail === 'object') {
    try {
      const parsed = Importer.detailPayload(supplied.detail);
      enrichment = { ...enrichment, ...parsed, descriptionUrl: parsed.descriptionUrl || descriptionUrl, detailStatus: parsed.options?.length && parsed.variants?.length ? 'available' : enrichment.detailStatus, detailFetchedAt: new Date().toISOString() };
    } catch (error) {
      checkpoint.blocked[offerId] = { reason: `detail_invalid: ${error.message}`, at: new Date().toISOString() };
    }
  }

  // Image-only descriptions are common on 1688.  Keep the verified detail
  // HTML/images and add a concise Vietnamese summary so the storefront does
  // not fall back to an empty generic description.  This also applies when
  // the SKU API succeeds but the mobile page is temporarily rate-limited: we
  // never invent specs, we only restate the verified option/attribute data.
  if ((!detailText || !parsedDescriptionText) && (mobile?.attributes?.length || enrichment.attributes?.length || enrichment.variants?.length)) {
    const optionSummary = Array.isArray(enrichment.options) && enrichment.options.length
      ? ` Lựa chọn: ${enrichment.options.map(option => `${option.name} (${option.values.slice(0, 12).join(', ')})`).join('; ')}.`
      : '';
    const verifiedAttributes = Array.isArray(mobile?.attributes) && mobile.attributes.length ? mobile.attributes : enrichment.attributes;
    const attributeSummary = Array.isArray(verifiedAttributes) && verifiedAttributes.length
      ? ` Thông tin nhà cung cấp gồm ${verifiedAttributes.slice(0, 6).map(attribute => `${attribute.name}: ${attribute.value}`).join('; ')}.`
      : '';
    const mediaNote = enrichment.detailStatus === 'sku_available'
      ? ' Dữ liệu SKU và tồn kho đã được xác minh qua API 1688; phần mô tả hình ảnh chi tiết sẽ bổ sung khi nguồn cho phép truy cập.'
      : ' Hình ảnh và thông tin được đồng bộ từ offer 1688; vui lòng kiểm tra lựa chọn trước khi đặt hàng.';
    enrichment.description = `${product.title}.${optionSummary}${attributeSummary}${mediaNote}`.slice(0, 12000);
    enrichment.detailStatus = enrichment.detailStatus === 'not_requested' ? 'sku_available' : enrichment.detailStatus;
    enrichment.detailFetchedAt = enrichment.detailFetchedAt || new Date().toISOString();
    enrichment.source = { ...(enrichment.source || {}), detailStatus: enrichment.detailStatus };
  }
  await translateMissing(enrichment);
  enrichment.translationMap = translationMap;
  enrichment.titleMaxLength = maxTitleLength;
  // Generated import files do not have the durable admin id yet.  Resolve
  // the row by its supplier offer/SKU so every product is enriched exactly
  // once instead of repeatedly overwriting the first row.
  const index = output.findIndex(item => String(item?.source?.offerId || '') === offerId || String(item?.sku || '').toLowerCase() === String(product?.sku || '').toLowerCase());
  if (index < 0) continue;
  output[index] = Importer.mergeEnrichment(product, enrichment);
  checkpoint.processed[offerId] = {
    at: new Date().toISOString(),
    gallery: Boolean(output[index].gallery?.length),
    detail: Boolean(output[index].detailImages?.length) || enrichment.detailStatus === 'available' || enrichment.detailStatus === 'sku_available',
    mobile: Boolean(mobile),
    variants: output[index].variants?.length || 0,
  };
  checkpoint.updatedAt = new Date().toISOString();
  done += 1;
  await writeJson(checkpointPath, checkpoint);
  await writeJson(outputPath, output);
  if (done % 10 === 0 || done === selected.length) console.log(`Đã xử lý ${done}/${selected.length}`);
  if (delayMs) await sleep(delayMs);
}
await writeJson(checkpointPath, checkpoint);
for (let index = 0; index < output.length; index += 1) {
  output[index] = Importer.localizeProduct(output[index], translationMap, { maxLength: maxTitleLength });
}
await writeJson(translationCachePath, translationMap);
await writeJson(outputPath, output);
console.log(`Đã ghi ${output.length} sản phẩm vào ${outputPath}`);
console.log(`Gallery: ${output.filter(item => Array.isArray(item.gallery) && item.gallery.length).length}; detail: ${output.filter(item => item.source?.detailStatus === 'available').length}; variants: ${output.filter(item => item.variants?.length).length}; CAPTCHA/block: ${Object.keys(checkpoint.blocked).length}`);
