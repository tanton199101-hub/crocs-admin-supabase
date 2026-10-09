(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Crocs1688 = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const FALLBACK_IMAGE = 'assets/arrival-classic-clog-100.png';
  const IMAGE_HOSTS = Object.freeze(new Set(['cbu01.alicdn.com', 'gw.alicdn.com', 'img.alicdn.com', 'itemcdn.tmall.com']));
  const IMAGE_PROXY_PATH = '/api/1688-image';
  const OFFER_RE = /(?:^|\/)offer\/(\d{6,20})(?:\.html)?(?:\/|$)/i;
  const SHOP_HOST_RE = /(?:^|\.)1688\.com$/i;
  const MTOP_ENDPOINT = 'https://h5api.m.1688.com/h5/mtop.alibaba.alisite.cbu.server.moduleasyncservice/1.0/';
  const MTOP_APP_KEY = '12574478';
  // The mobile offer page loads its verified SKU matrix through this public
  // MTop service.  It is deliberately kept separate from the shop-list
  // endpoint above because the two APIs use different request payloads.
  const OFFER_DETAIL_MTOP_ENDPOINT = 'https://h5api.m.1688.com/h5/mtop.mbox.fc.common.gateway/1.0/';
  const OFFER_DETAIL_MTOP_API = 'mtop.mbox.fc.common.gateway';
  // The supplier catalog contains products with more than the original UI
  // limit of 100 combinations (for example 17 colours x 8 heights).  Keep a
  // bounded ceiling for imported data, while allowing the verified supplier
  // matrix to be preserved intact.
  const MAX_IMPORT_VARIANTS = 500;
  const TRANSLATE_ENDPOINT = 'https://clients5.google.com/translate_a/t';
  const DEFAULT_SHOP_MEMBER_ID = 'b2b-305059698170e97';
  const DEFAULT_SHOP_NAME = '湖州简百服饰有限公司';
  const KNOWN_TITLES = Object.freeze({
    '837842260799': "Girls' Trendy Jazz Dance Performance Costume – Hip-Hop Street Dance Group Outfit for Kids",
  });

  const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
  function remoteImageUrl(value) {
    const raw = clean(value, 2000);
    if (!raw) return '';
    const candidate = raw.startsWith('//') ? `https:${raw}` : raw;
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || !IMAGE_HOSTS.has(url.hostname.toLowerCase())) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function proxyImageUrl(value) {
    const direct = remoteImageUrl(value);
    return direct ? `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(direct)}` : '';
  }

  function imageUrl(value, { proxy = false } = {}) {
    const raw = clean(value, 4000);
    if (!raw) return '';
    // Keep already-proxied URLs idempotent. They are same-origin paths and
    // are safe to persist in the validated store state.
    try {
      const parsed = new URL(raw, 'https://store.invalid');
      if (parsed.origin === 'https://store.invalid' && parsed.pathname === IMAGE_PROXY_PATH) {
        return remoteImageUrl(parsed.searchParams.get('url')) ? `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(remoteImageUrl(parsed.searchParams.get('url')))}` : '';
      }
    } catch { /* fall through to the remote URL parser */ }
    const direct = remoteImageUrl(raw);
    return direct ? (proxy ? proxyImageUrl(direct) : direct) : '';
  }

  function offerImages(offer = {}) {
    const values = Array.isArray(offer?.offerImages) ? offer.offerImages : [];
    return [...new Set(values.map(item => item?.fullPathImageURI || item?.imgUrl || item?.imageURI || item?.size310x310ImageURI || item?.size220x220ImageURI)
      .map(value => {
        const raw = clean(value, 2000);
        if (!raw) return '';
        return imageUrl(raw.startsWith('http') || raw.startsWith('//') ? raw : `https://cbu01.alicdn.com/${raw.replace(/^\/+/, '')}`);
      })
      .filter(Boolean))].slice(0, 20);
  }

  function extractJsonObject(source, marker) {
    const start = String(source || '').indexOf(marker);
    if (start < 0) return '';
    const open = String(source || '').indexOf('{', start);
    if (open < 0) return '';
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{') depth += 1;
      if (char === '}' && --depth === 0) return source.slice(open, index + 1);
    }
    return '';
  }

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  }

  /**
   * Reduce the public m.1688 offer HTML into the fields that can be merged
   * into a product.  The mobile page contains an inline `window.__INIT_DATA`
   * object even when the desktop page is protected by a CAPTCHA.  This
   * parser intentionally reads only that official page payload; it does not
   * execute page scripts or attempt to solve/bypass a challenge.
   */
  function parseMobileOfferDocument(text) {
    const source = String(text || '');
    const objectText = extractJsonObject(source, 'window.__INIT_DATA');
    if (!objectText) throw new Error('Trang offer mobile 1688 không có __INIT_DATA.');
    let init;
    try { init = JSON.parse(objectText); }
    catch (error) { throw new Error(`Không đọc được __INIT_DATA của 1688: ${error.message}`); }

    const asObject = value => {
      if (!value || typeof value !== 'object') return {};
      if (Array.isArray(value)) return {};
      return value;
    };
    const components = Object.values(asObject(init.data)).map(item => asObject(item?.data));
    const main = components.find(item => Array.isArray(item.offerImgList) || Array.isArray(item.offerImages)) || {};
    const description = components.find(item => item.detailUrl) || {};
    const attributeBlock = components.find(item => Array.isArray(item.propsList)) || {};
    const globalData = asObject(init.globalData);
    const tempModel = asObject(globalData.tempModel);
    const shareModel = asObject(globalData.shareModel);
    const detailModel = asObject(globalData.detailModel);
    const offerInfo = asObject(main.offerInfoModel);
    const offerId = clean(main.offerId || offerInfo.offerId || tempModel.offerId || detailModel.offerId || globalData.offerBaseInfo?.offerId, 30);
    const title = clean(offerInfo.title || tempModel.offerTitle || shareModel.subject || globalData.blackPage?.offerTitle, 500);
    const galleryCandidates = [
      ...(Array.isArray(main.offerImgList) ? main.offerImgList : []),
      ...(Array.isArray(main.offerImages) ? main.offerImages.map(item => item?.imgUrl || item?.imageURI || item) : []),
      shareModel.picUrl,
      tempModel.defaultOfferImg,
    ];
    const skuImages = (Array.isArray(main.skuImages) ? main.skuImages : [])
      .map(item => ({
        name: clean(item?.name, 160),
        image: imageUrl(item?.imgUrl || item?.imageURI || item),
      }))
      .filter(item => item.image);
    const gallery = [...new Set([...galleryCandidates, ...skuImages.map(item => item.image)].map(imageUrl).filter(Boolean))].slice(0, 20);
    const inlineSkuModel = [
      main.skuModel,
      globalData.skuModel,
      globalData.skuModelOrigin,
      globalData.offerDetail?.skuModel,
    ].find(item => item && typeof item === 'object' && (item.skuProps || item.skuInfoMapOriginal || item.skuInfoMap));
    const inlineOrderModel = globalData.orderParamModel || globalData.offerDetail?.orderParamModel || {};
    const priceText = offerInfo.price || tempModel.price || globalData.shareModel?.extMap?.itemPriceYuan || '';
    const priceMatch = String(priceText).match(/[0-9]+(?:\.[0-9]+)?/);
    const attributes = normalizeAttributes(attributeBlock.propsList || globalData.blackPage?.property?.propsList);
    const descriptionUrl = normalizeDescriptionUrl(description.detailUrl || detailModel.detailUrl);
    return {
      offerId,
      title,
      gallery,
      skuImages,
      descriptionUrl,
      attributes,
      priceCny: priceMatch ? Number(priceMatch[0]) : 0,
      // Some older mobile pages inline the SKU model.  Keep it available to
      // the caller, while newer pages obtain the same model from MTop.
      ...(inlineSkuModel ? { skuModel: inlineSkuModel, orderParamModel: inlineOrderModel } : {}),
    };
  }

  function parseDescriptionDocument(text) {
    const source = String(text || '');
    const objectText = extractJsonObject(source, 'offer_details');
    let content = '';
    if (objectText) {
      try { content = JSON.parse(objectText).content || ''; } catch { content = ''; }
    }
    const html = String(content || source);
    const imageCandidates = [
      ...[...html.matchAll(/(?:src|data-src|data-lazyload-src|data-original)\s*=\s*["']([^"']+)["']/gi)].map(item => item[1]),
      ...[...html.matchAll(/background(?:-image)?\s*:\s*url\((?:["']?)([^)"']+)/gi)].map(item => item[1]),
    ];
    const images = [...new Set(imageCandidates.map(value => imageUrl(value.startsWith('//') ? `https:${value}` : value, { proxy: true })).filter(Boolean))].slice(0, 40);
    const textContent = decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim());
    return { html: content ? clean(content, 200000) : '', text: clean(textContent, 12000), images };
  }

  const OPTION_NAME_TRANSLATIONS = Object.freeze({
    '颜色': 'Màu sắc', '颜色分类': 'Màu sắc', '色号': 'Màu sắc', 'color': 'Màu sắc', 'colour': 'Màu sắc',
    '尺码': 'Kích thước', '鞋码': 'Kích thước', '大小': 'Kích thước', 'size': 'Kích thước',
    '身高': 'Chiều cao', '适合身高': 'Chiều cao', 'suitable for height': 'Chiều cao', 'height': 'Chiều cao',
    '规格': 'Quy cách', 'specification': 'Quy cách', '款式': 'Kiểu dáng', 'style': 'Kiểu dáng',
    '材质': 'Chất liệu', 'material': 'Chất liệu', '型号': 'Mẫu mã', 'model': 'Mẫu mã',
  });
  const optionId = (name, index) => {
    const ascii = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return (ascii || `option-${index + 1}`).slice(0, 36);
  };
  const optionName = (name, index) => {
    const source = String(name || '').trim();
    return clean(OPTION_NAME_TRANSLATIONS[source] || OPTION_NAME_TRANSLATIONS[source.toLowerCase()] || source || `Option ${index + 1}`, 80);
  };

  function listValues(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return value.value || value.values || value.list || value.items || [];
    return [];
  }

  function parseSpecValues(value) {
    const result = {};
    const source = decodeEntities(String(value || '')).replace(/%3A/gi, ':').replace(/%3B/gi, ';');
    source.split(/[;|#]/).map(item => item.trim()).filter(Boolean).forEach(item => {
      const match = item.match(/^([^:：=]+)[:：=](.+)$/);
      if (match) result[match[1].trim()] = match[2].trim();
    });
    return result;
  }

  function skuSpecValues(sku) {
    const candidates = [sku?.specAttrs, sku?.spec, sku?.skuAttr, sku?.skuAttrs, sku?.properties, sku?.propertyList];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const parsed = parseSpecValues(candidate);
        if (Object.keys(parsed).length) return parsed;
        const ordered = decodeEntities(candidate).split('>').map(item => item.trim()).filter(Boolean);
        if (ordered.length > 1) return { __ordered: ordered };
        if (candidate.trim()) return { __single: decodeEntities(candidate).trim() };
      }
      if (Array.isArray(candidate)) {
        const parsed = {};
        candidate.forEach(item => {
          const name = item?.propName || item?.prop || item?.name || item?.key;
          const value = item?.valueName || item?.value || item?.valueStr || item?.text;
          if (name && value) parsed[String(name).trim()] = String(value).trim();
        });
        if (Object.keys(parsed).length) return parsed;
      }
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const parsed = {};
        Object.entries(candidate).forEach(([key, val]) => { if (val != null && typeof val !== 'object') parsed[key] = String(val); });
        if (Object.keys(parsed).length) return parsed;
      }
    }
    return {};
  }

  function normalizeSkuMap(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).map(([key, item]) => ({ ...(item && typeof item === 'object' ? item : {}), specAttrs: item?.specAttrs || key }));
  }

  function normalizeDescriptionUrl(value) {
    const raw = clean(value, 4000);
    if (!raw) return '';
    try {
      const url = new URL(raw);
      const embedded = url.searchParams.get('url');
      if (embedded && remoteImageUrl(embedded.replace(/^http:/i, 'https:'))) return remoteImageUrl(embedded.replace(/^http:/i, 'https:'));
    } catch { /* keep the original URL when it is not a fully-qualified URL */ }
    return raw;
  }

  function mapVariantValues(rawValues, options) {
    const entries = Object.entries(rawValues || {});
    if (Array.isArray(rawValues?.__ordered)) {
      return Object.fromEntries(options.map((option, index) => [option.id, clean(rawValues.__ordered[index], 80)]).filter(([, value]) => value));
    }
    const single = rawValues?.__single || (entries.length === 1 && !String(entries[0][0]).trim() ? entries[0][1] : '');
    if (options.length === 1 && single) return { [options[0].id]: String(single).trim() };
    return Object.fromEntries(options.map(option => {
      const exact = entries.find(([key, value]) => String(key).trim() !== '__single' && (String(key).trim() === option.sourceName || optionName(key, 0) === option.name || option.values.includes(String(value).trim())))
        || (entries.find(([, value]) => option.values.includes(String(value).trim())) || null);
      return [option.id, exact ? String(exact[1]).trim() : ''];
    }).filter(([, value]) => value));
  }

  function normalizeAttributes(value) {
    const list = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([name, content]) => ({ name, value: content })) : [];
    return list.map(attribute => {
      const name = attribute?.name || attribute?.label || attribute?.key || attribute?.prop || '';
      const content = attribute?.value ?? attribute?.content ?? attribute?.text ?? (Array.isArray(attribute?.values) ? attribute.values.join(', ') : '');
      return { name: clean(name, 160), value: clean(content, 500) };
    }).filter(attribute => attribute.name && attribute.value).slice(0, 80);
  }

  function detailPayload(body = {}) {
    // Browser exports produced by the 1688 detail page are already reduced to
    // this shape.  Accept them directly so a CAPTCHA-free user export can be
    // fed back into the resumable enrichment script without losing SKU data.
    if (body && Array.isArray(body.gallery) && (Array.isArray(body.variants) || Array.isArray(body.options)) && (body.offerId || body.title)) {
      return {
        offerId: clean(body.offerId, 30), title: clean(body.title || body.subject, 500),
        gallery: [...new Set(body.gallery.map(imageUrl).filter(Boolean))].slice(0, 20),
        options: normalizeOptions(body.options || []),
        variants: (Array.isArray(body.variants) ? body.variants : []).map((variant, index) => ({
          ...variant, id: clean(variant.id || variant.sku || `remote-${index + 1}`, 80),
          sku: clean(variant.sku || variant.id || `1688-${index + 1}`, 80),
          sourceSpec: clean(decodeEntities(variant.sourceSpec || variant.specAttrs || ''), 500),
        })),
        descriptionUrl: normalizeDescriptionUrl(body.descriptionUrl),
        attributes: normalizeAttributes(body.attributes),
        priceCny: Number.isFinite(Number(body.priceCny)) ? Number(body.priceCny) : 0,
      };
    }
    const result = body?.result || body?.data?.result || body?.data || body;
    const model = result?.model || result;
    const contextModel = body?.result?.global?.globalData?.model || result?.global?.globalData?.model || {};
    // The current desktop page stores its canonical payload under
    // result.data.Root.fields.dataJson, while older SSR/API responses expose
    // offerModel/dataModel directly.  Resolve both forms in one place.
    const rootData = result?.data?.Root?.fields?.dataJson || result?.data?.Root?.fields?.dataJSON || result?.Root?.fields?.dataJson || {};
    const offer = contextModel?.offerDetail || model?.offerModel?.offerDetail || model?.offerDetail || rootData?.detailModel?.offerModel?.offerDetail || rootData?.offerModel?.offerDetail || model?.tempModel || rootData?.tempModel || model?.offerBaseInfo || rootData?.offerBaseInfo || {};
    const dataModel = model?.dataModel || result?.data || rootData || model;
    const scopes = [dataModel, rootData, result?.data, model].filter(scope => scope && typeof scope === 'object');
    const first = (...values) => values.find(value => value != null && value !== '');
    const gallery = [
      ...(Array.isArray(offer.imageList) ? offer.imageList : []).map(item => item?.fullPathImageURI || item?.imageURI || item?.imgUrl),
      ...(Array.isArray(offer.mainImageList) ? offer.mainImageList : []).map(item => item?.fullPathImageURI || item?.imageURI || item?.imgUrl),
      ...scopes.flatMap(scope => Array.isArray(scope.gallery?.fields?.offerImgList) ? scope.gallery.fields.offerImgList : []),
      ...scopes.flatMap(scope => Array.isArray(scope.gallery?.offerImgList) ? scope.gallery.offerImgList : []),
      ...scopes.flatMap(scope => Array.isArray(scope.images?.fields?.offerImgList) ? scope.images.fields.offerImgList : []),
      ...scopes.flatMap(scope => Array.isArray(scope.offerImages) ? scope.offerImages.map(item => item?.fullPathImageURI || item?.imageURI || item?.imgUrl || item) : []),
      ...scopes.map(scope => scope.tempModel?.defaultOfferImg || scope.shareModel?.picUrl),
      ...scopes.flatMap(scope => Array.isArray(scope.shareModel?.imageUrls) ? scope.shareModel.imageUrls : []),
      ...(Array.isArray(body.gallery) ? body.gallery : []),
    ].map(imageUrl).filter(Boolean);
    const skuProps = Array.isArray(offer.skuProps) ? offer.skuProps
      : first(...scopes.map(scope => Array.isArray(scope.skuModel?.skuProps) ? scope.skuModel.skuProps : null), ...scopes.map(scope => Array.isArray(scope.skuSelection?.fields?.skuProps) ? scope.skuSelection.fields.skuProps : null)) || [];
    const optionDrafts = skuProps.map((prop, index) => {
      const sourceName = clean(prop?.prop || prop?.name || prop?.propName || `Option ${index + 1}`, 80);
      const values = [...new Set(listValues(prop?.value || prop?.values).map(value => clean(value?.name || value?.value || value?.valueName || value, 80)).filter(Boolean))];
      return { id: optionId(sourceName, index), name: optionName(sourceName, index), sourceName, values };
    }).filter(option => option.values.length).slice(0, 3);
    const options = optionDrafts.map(({ sourceName, ...option }) => ({ ...option, sourceName }));
    const tradeModels = scopes.map(scope => scope?.mainPrice?.fields?.finalPriceModel?.tradeWithoutPromotion).filter(Boolean);
    const skuMap = first(
      ...tradeModels.flatMap(trade => [trade.skuMapOriginal, trade.skuMap]),
      ...scopes.flatMap(scope => [scope?.skuModel?.skuInfoMapOriginal, scope?.skuModel?.skuInfoMap]),
      offer?.skuMapOriginal, offer?.skuMap,
    );
    const priceCandidate = first(
      ...scopes.map(scope => scope?.tempModel?.price),
      ...scopes.map(scope => String(scope?.skuModel?.skuPriceScale || '').match(/[0-9]+(?:\.[0-9]+)?/)?.[0]),
      ...scopes.flatMap(scope => scope?.mainPrice?.fields?.priceModel?.currentPrices || []).map(item => item?.price),
      ...scopes.flatMap(scope => scope?.orderParamModel?.orderParam?.skuParam?.skuRangePrices || []).map(item => item?.price),
      body.priceCny,
    );
    const defaultPrice = Number(priceCandidate || 0);
    const variants = normalizeSkuMap(skuMap).map((sku, index) => {
      const values = mapVariantValues(skuSpecValues(sku), optionDrafts);
      const priceCny = Number(sku?.price ?? sku?.salePrice ?? sku?.priceValue ?? defaultPrice);
      const stock = Number(sku?.canBookCount ?? sku?.quantity ?? sku?.stock ?? 0);
      return {
        id: clean(sku?.skuId || sku?.specId || `remote-${index + 1}`, 80),
        sku: clean(sku?.skuId || sku?.specId || `1688-${index + 1}`, 80),
        values,
        priceCny: Number.isFinite(priceCny) && priceCny >= 0 ? priceCny : 0,
        stock: Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0,
        enabled: Number.isFinite(stock) && stock > 0,
        sourceSpec: clean(decodeEntities(sku?.specAttrs || sku?.spec || JSON.stringify(skuSpecValues(sku))), 500),
      };
    }).filter(variant => !options.length || Object.keys(variant.values).length === options.length).slice(0, MAX_IMPORT_VARIANTS);
    const directAttributes = first(
      offer.featureAttributes,
      ...scopes.map(scope => scope?.productAttributes?.fields?.attributes),
      ...scopes.map(scope => scope?.attributes?.fields?.attributes),
      ...scopes.map(scope => scope?.propsList),
      body.attributes,
    );
    return {
      offerId: clean(offer.offerId || dataModel?.offerBaseInfo?.offerId || rootData?.tempModel?.offerId || body.offerId, 30),
      title: clean(offer.subject || offer.title || dataModel?.offerBaseInfo?.title || dataModel?.tempModel?.offerTitle || dataModel?.shareModel?.subject || body.title, 500),
      gallery: [...new Set(gallery)].slice(0, 20),
      options: options.map(({ sourceName, ...option }) => option),
      variants,
      descriptionUrl: normalizeDescriptionUrl(offer.detailUrl || dataModel.description?.fields?.detailUrl || dataModel.description?.detailUrl || dataModel.detailModel?.detailUrl || rootData?.detailModel?.detailUrl || body.descriptionUrl),
      attributes: normalizeAttributes(directAttributes),
      priceCny: Number.isFinite(defaultPrice) ? defaultPrice : 0,
    };
  }
  const safeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
  };
  const slugify = (title, offerId) => {
    const slug = clean(title, 500).toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const suffix = offerId ? `-${clean(offerId, 30)}` : '';
    const room = Math.max(1, 160 - suffix.length);
    const head = (slug || '1688').slice(0, room).replace(/-+$/g, '');
    return `${head || '1688'}${suffix}`.slice(0, 160).replace(/-+$/g, '');
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function parseOfferUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (!SHOP_HOST_RE.test(url.hostname) && !/(?:^|\.)alibaba\.com$/i.test(url.hostname)) return '';
      return url.pathname.match(OFFER_RE)?.[1] || '';
    } catch {
      return '';
    }
  }

  function isShopUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return SHOP_HOST_RE.test(url.hostname) && !parseOfferUrl(url.href);
    } catch {
      return false;
    }
  }

  function shopHost(value) {
    try { return new URL(String(value || '').trim()).hostname.toLowerCase(); } catch { return ''; }
  }

  function sourceUrl(value, offerId) {
    const parsed = clean(value, 2000);
    if (parseOfferUrl(parsed)) return parsed;
    return offerId ? `https://detail.1688.com/offer/${offerId}.html` : parsed;
  }

  function translatedTitle(input = {}) {
    const vietnamese = clean(input.titleVietnamese || input.titleVi, 180);
    if (vietnamese) return vietnamese;
    const english = clean(input.titleEnglish || input.englishTitle, 180);
    if (english) return english;
    const offerId = clean(input.offerId, 30);
    if (KNOWN_TITLES[offerId]) return KNOWN_TITLES[offerId];
    return clean(input.title || input.sourceTitle, 180);
  }

  // Last-resort translation when a provider is temporarily unavailable. It
  // never leaves a Chinese title in a product marked as Vietnamese.
  function fallbackVietnameseTitle(input = {}) {
    const source = clean(input.sourceTitle || input.title || input.subject, 180);
    const replacements = [
      ['儿童', 'trẻ em'], ['女童', 'bé gái'], ['男童', 'bé trai'], ['女孩', 'bé gái'],
      ['男孩', 'bé trai'], ['幼儿园', 'mầm non'], ['小学', 'tiểu học'], ['服装', 'trang phục'],
      ['演出服', 'trang phục biểu diễn'], ['表演', 'biểu diễn'], ['舞蹈', 'múa'], ['爵士舞', 'jazz'],
      ['街舞', 'street dance'], ['啦啦队', 'cổ vũ'], ['合唱', 'hợp xướng'], ['朗诵', 'đọc diễn cảm'],
      ['比赛', 'thi đấu'], ['国庆', 'Quốc khánh'], ['毕业班服', 'đồng phục tốt nghiệp'],
      ['汉服', 'Hán phục'], ['裙', 'váy'], ['上衣', 'áo'], ['裤', 'quần'], ['套装', 'bộ đồ'],
      ['新款', 'mẫu mới'], ['春季', 'mùa xuân'], ['夏季', 'mùa hè'], ['秋季', 'mùa thu'], ['冬季', 'mùa đông'],
    ];
    let result = source;
    replacements.forEach(([from, to]) => { result = result.split(from).join(` ${to} `); });
    result = result.replace(/[\u4e00-\u9fff]+/g, '').replace(/\s+/g, ' ').trim();
    if (result.length < 3 || /[\u4e00-\u9fff]/.test(result)) return `Sản phẩm thời trang trẻ em 1688 ${clean(input.offerId, 20)}`.trim();
    return clean(result, 180);
  }

  function optionValues(input = {}) {
    if (Array.isArray(input.options) && input.options.length) return input.options;
    const heights = Array.isArray(input.heights) ? input.heights : [];
    if (!heights.length) return [];
    return [{ id: 'height', name: 'Height', values: heights.map(value => clean(value, 40)).filter(Boolean) }];
  }

  function normalizeOptions(options) {
    return (Array.isArray(options) ? options : []).slice(0, 3).map((option, index) => ({
      id: clean(option?.id || `option-${index + 1}`, 40).replace(/[^a-zA-Z0-9_-]/g, '-'),
      name: clean(option?.name || `Option ${index + 1}`, 80),
      // Some 1688 offers use a catalogue-style "model" option with more
      // than one hundred labels. Keep every verified label needed by the SKU
      // matrix; the 500-row ceiling is enforced on combinations instead.
      values: [...new Set((Array.isArray(option?.values) ? option.values : []).map(value => clean(value, 80)).filter(Boolean))].slice(0, MAX_IMPORT_VARIANTS),
    })).filter(option => option.id && option.name && option.values.length);
  }

  function normalizeVariants(input, options, sku) {
    const source = Array.isArray(input.variants) ? input.variants : [];
    const regionId = clean(input.regionId || input.defaultRegionId || 'vn', 40).toLowerCase() || 'vn';
    return source.slice(0, MAX_IMPORT_VARIANTS).map((variant, index) => {
      const values = {};
      options.forEach(option => {
        const value = clean(variant?.values?.[option.id] || variant?.[option.id], 80);
        if (value) values[option.id] = value;
      });
      const suffix = Object.values(values).join('-').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
      const cny = Number(variant?.priceCny);
      const baseRate = Number(input.exchangeRateCnyBase || 0);
      const baseDecimals = Number(input.baseCurrencyDecimals ?? 2);
      const convertedBase = Number.isFinite(cny) && cny >= 0 && baseRate > 0
        ? Math.round(cny * baseRate * (10 ** baseDecimals))
        : safeNumber(variant?.priceMinor ?? variant?.price, safeNumber(input.priceMinor ?? input.basePriceMinor, 0));
      const regionalPrices = variant?.regionalPrices && typeof variant.regionalPrices === 'object' && !Array.isArray(variant.regionalPrices)
        ? { ...variant.regionalPrices } : {};
      const vndRate = Number(input.exchangeRateCnyVnd || 0);
      if (Number.isFinite(cny) && cny >= 0 && vndRate > 0) regionalPrices[regionId] = priceCnyToVnd(cny, vndRate, input.priceMultiplier ?? 2);
      return {
        id: clean(variant?.id || `v-${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, '-'),
        values,
        sku: clean(variant?.sku || `${sku}-${suffix || index + 1}`, 80),
        price: convertedBase,
        compareAt: variant?.compareAt == null ? null : safeNumber(variant.compareAt),
        cost: variant?.cost == null ? null : safeNumber(variant.cost),
        stock: safeNumber(variant?.stock, 0),
        enabled: variant?.enabled === true || (variant?.enabled == null && safeNumber(variant?.stock, 0) > 0),
        barcode: clean(variant?.barcode, 80),
        ...(Object.keys(regionalPrices).length ? { regionalPrices } : {}),
      };
    });
  }

  function priceCnyToVnd(priceCny, exchangeRate = 3500, multiplier = 2) {
    const price = Number(priceCny);
    const rate = Number(exchangeRate);
    const factor = Number(multiplier);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(factor) || factor <= 0) return 0;
    return Math.min(2147483647, Math.max(0, Math.round(price * rate * factor)));
  }

  function parseJsonp(text) {
    const value = String(text || '').trim();
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Phản hồi 1688 không hợp lệ.');
    return JSON.parse(value.slice(start, end + 1));
  }

  function cookiePairs(value) {
    if (!value) return [];
    return String(value).split(/,\s*(?=_[^=;\s]+=)/).map(part => part.split(';')[0].trim()).filter(Boolean);
  }

  function mergeCookies(current, setCookie) {
    const map = new Map(String(current || '').split(';').map(item => item.trim().split('=').slice(0, 2)).filter(item => item[0]));
    cookiePairs(setCookie).forEach(pair => {
      const [name, ...rest] = pair.split('=');
      if (name) map.set(name, `${name}=${rest.join('=')}`);
    });
    return [...map.values()].join('; ');
  }

  function mtopData(memberId, pageNum, count) {
    return JSON.stringify({
      componentKey: 'Wp_pc_common_offerlist',
      params: JSON.stringify({
        memberId,
        appdata: { sortType: 'wangpu_score', sellerRecommendFilter: false, mixFilter: false, tradenumFilter: false, quantityBegin: null, pageNum, count },
      }),
    });
  }

  function queryFor(data, timestamp, sign = '', appKey = MTOP_APP_KEY, api = 'mtop.alibaba.alisite.cbu.server.moduleasyncservice') {
    const query = new URLSearchParams({
      jsv: '2.7.2', appKey, t: String(timestamp),
      api, v: '1.0',
      type: 'jsonp', dataType: 'jsonp', callback: 'mtopjsonp1', data,
    });
    if (sign) query.set('sign', sign);
    return query;
  }

  function offerDetailData(offerId) {
    return JSON.stringify({
      params: JSON.stringify({ offerId: clean(offerId, 30) }),
      fcName: 'mini-od-cse',
      fcGroup: 'cbu-offer',
      serviceName: 'wirelessCoreOdService',
    });
  }

  /**
   * Client for the public mobile-offer SKU endpoint.  It follows the normal
   * MTop token/sign flow and only requests the supplied offer id; no browser
   * cookies, login credentials, or CAPTCHA state are collected.
   */
  function createOfferDetailClient(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('Offer detail cần môi trường có fetch.');
    const endpoint = options.endpoint || OFFER_DETAIL_MTOP_ENDPOINT;
    const appKey = options.appKey || MTOP_APP_KEY;
    const api = OFFER_DETAIL_MTOP_API;
    const headers = {
      'user-agent': options.userAgent || 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36',
      referer: options.referer || 'https://m.1688.com/',
      accept: 'application/json,text/plain,*/*',
    };
    let cookie = clean(options.cookie, 4000);
    let token = '';
    let primed = false;
    const request = async (url, requestOptions = {}) => fetchImpl(url, { ...requestOptions, headers: { ...headers, ...(requestOptions.headers || {}) } });
    const responseCookies = response => response?.headers?.getSetCookie?.()?.join(', ') || response?.headers?.get?.('set-cookie') || '';

    async function prime() {
      const data = offerDetailData('0');
      const timestamp = Date.now();
      const response = await request(`${endpoint}?${queryFor(data, timestamp, '', appKey, api).toString()}`);
      cookie = mergeCookies(cookie, responseCookies(response));
      const match = cookie.match(/(?:^|;\s*)_m_h5_tk=([^;]+)/);
      token = match?.[1]?.split('_')[0] || '';
      if (!token) throw new Error('1688 không cấp token cho API SKU mobile.');
      primed = true;
    }

    async function call(offerId) {
      const id = clean(offerId, 30);
      if (!/^\d{6,20}$/.test(id)) throw new Error('Offer ID 1688 không hợp lệ.');
      if (!primed || !token) await prime();
      const data = offerDetailData(id);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const timestamp = Date.now();
        const cryptoImpl = options.cryptoImpl || (typeof require === 'function' ? require('node:crypto') : null);
        if (!cryptoImpl?.createHash) throw new Error('Offer detail cần crypto.createHash trong môi trường Node.');
        const sign = cryptoImpl.createHash('md5').update(`${token}&${timestamp}&${appKey}&${data}`).digest('hex');
        const query = queryFor(data, timestamp, sign, appKey, api);
        const requestHeaders = cookie ? { cookie } : {};
        const response = await request(`${endpoint}?${query.toString()}`, { headers: requestHeaders });
        cookie = mergeCookies(cookie, responseCookies(response));
        const text = await response.text();
        if (response.status === 429 || response.status >= 500) { await sleep(450 * (attempt + 1)); continue; }
        const body = parseJsonp(text);
        const ret = Array.isArray(body.ret) ? body.ret.join(' ') : String(body.ret || '');
        if (/TOKEN|令牌|SESSION/i.test(ret) && attempt < 2) { primed = false; await prime(); continue; }
        if (!response.ok || !/SUCCESS/i.test(ret)) throw new Error(`1688 API SKU lỗi: ${ret.slice(0, 240)}`);
        return body;
      }
      throw new Error(`1688 API SKU không phản hồi ổn định cho offer ${id}.`);
    }
    return Object.freeze({ call, get cookie() { return cookie; } });
  }

  function createMtopClient(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('MTop cần môi trường có fetch.');
    const endpoint = options.endpoint || MTOP_ENDPOINT;
    const appKey = options.appKey || MTOP_APP_KEY;
    const memberId = clean(options.memberId || DEFAULT_SHOP_MEMBER_ID, 120);
    const headers = {
      'user-agent': options.userAgent || 'Mozilla/5.0',
      referer: options.referer || 'https://shop1481820794169.1688.com/page/offerlist.htm',
      accept: 'application/json,text/plain,*/*',
    };
    let cookie = clean(options.cookie, 2000);
    let token = '';
    let primed = false;
    const request = async (url, requestOptions = {}) => fetchImpl(url, { ...requestOptions, headers: { ...headers, ...(requestOptions.headers || {}) } });

    async function prime() {
      const data = mtopData(memberId, 1, 1);
      const response = await request(`${endpoint}?${queryFor(data, Date.now(), '', appKey).toString()}`);
      cookie = mergeCookies(cookie, response.headers?.getSetCookie?.()?.join(', ') || response.headers?.get?.('set-cookie'));
      const match = cookie.match(/(?:^|;\s*)_m_h5_tk=([^;]+)/);
      token = match?.[1]?.split('_')[0] || '';
      if (!token && typeof document !== 'undefined') token = document.cookie.match(/(?:^|;\s*)_m_h5_tk=([^;]+)/)?.[1]?.split('_')[0] || '';
      if (!token) throw new Error('1688 không cấp token MTop. Hãy mở catalog trong trình duyệt rồi thử lại.');
      primed = true;
    }

    async function call(pageNum, count) {
      if (!primed || !token) await prime();
      const data = mtopData(memberId, pageNum, count);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const timestamp = Date.now();
        const cryptoImpl = options.cryptoImpl || (typeof require === 'function' ? require('node:crypto') : null);
        if (!cryptoImpl?.createHash) throw new Error('MTop cần crypto.createHash trong môi trường Node.');
        const sign = cryptoImpl.createHash('md5').update(`${token}&${timestamp}&${appKey}&${data}`).digest('hex');
        const response = await request(`${endpoint}?${queryFor(data, timestamp, sign, appKey).toString()}`, { headers: { cookie } });
        const text = await response.text();
        if (response.status === 429 || response.status >= 500) { await sleep(400 * (attempt + 1)); continue; }
        const body = parseJsonp(text);
        const ret = Array.isArray(body.ret) ? body.ret.join(' ') : String(body.ret || '');
        if (/TOKEN|令牌|SESSION/i.test(ret) && attempt < 2) { primed = false; await prime(); continue; }
        if (!body.data?.content?.offerList && !/SUCCESS/i.test(ret)) throw new Error(`1688 MTop lỗi: ${ret.slice(0, 180)}`);
        return body;
      }
      throw new Error(`1688 MTop không phản hồi ổn định ở trang ${pageNum}.`);
    }
    return Object.freeze({ memberId, call, get cookie() { return cookie; } });
  }

  async function fetchShopCatalog(options = {}) {
    const memberId = clean(options.memberId || DEFAULT_SHOP_MEMBER_ID, 120);
    const count = Math.min(100, Math.max(1, Number(options.pageSize || 30)));
    const client = options.client || createMtopClient({ ...options, memberId });
    const first = await client.call(1, count);
    const firstContent = first.data?.content || {};
    const total = Math.max(0, Number(firstContent.offerCount || 0));
    const pages = Math.max(1, Math.ceil(total / count));
    const offers = [...(firstContent.offerList || [])];
    for (let pageNum = 2; pageNum <= pages; pageNum += 1) {
      const body = await client.call(pageNum, count);
      offers.push(...(body.data?.content?.offerList || []));
      if (typeof options.onPage === 'function') await options.onPage({ pageNum, pages, received: offers.length, total });
    }
    const deduped = [...new Map(offers.filter(item => item?.id).map(item => [String(item.id), item])).values()];
    return { memberId, total, pages, offers: deduped, source: options.shopUrl || '' };
  }

  async function translateTitleVi(text, options = {}) {
    const source = clean(text, 500);
    if (!source) return fallbackVietnameseTitle({ sourceTitle: text, offerId: options.offerId });
    if (!/[\u3400-\u9fff]/.test(source)) return clean(source, 180);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') return fallbackVietnameseTitle({ sourceTitle: source, offerId: options.offerId });
    const query = new URLSearchParams({ client: 'dict-chrome-ex', sl: options.from || 'zh-CN', tl: options.to || 'vi', q: source });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetchImpl(`${options.endpoint || TRANSLATE_ENDPOINT}?${query.toString()}`, { headers: { accept: 'application/json,text/plain,*/*', 'user-agent': 'Mozilla/5.0' } });
        if (response.status === 429 || response.status >= 500) { await sleep(350 * (attempt + 1)); continue; }
        if (!response.ok) break;
        const body = await response.json();
        const value = Array.isArray(body) ? body[0] : '';
        if (typeof value === 'string' && value.trim()) return clean(value, 180);
      } catch { /* use the deterministic fallback below */ }
    }
    return fallbackVietnameseTitle({ sourceTitle: source, offerId: options.offerId });
  }

  async function translateTitles(offers, options = {}) {
    const list = Array.isArray(offers) ? offers : [];
    const cache = new Map(Object.entries(options.cache || {}));
    const result = new Map();
    const concurrency = Math.max(1, Math.min(12, Number(options.concurrency || 4)));
    let cursor = 0;
    async function worker() {
      while (cursor < list.length) {
        const index = cursor; cursor += 1;
        const offer = list[index] || {};
        const key = clean(offer.subject || offer.title, 500);
        let title = cache.get(key);
        if (!title) {
          title = await translateTitleVi(key, { ...options, offerId: offer.id });
          cache.set(key, title);
        }
        result.set(String(offer.id), title);
        if (typeof options.onProgress === 'function') await options.onProgress({ index: index + 1, total: list.length, offerId: String(offer.id), title });
        if (options.delayMs) await sleep(Number(options.delayMs));
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return { titles: Object.fromEntries(result), cache: Object.fromEntries(cache) };
  }

  function toProduct(input = {}) {
    const offerId = clean(input.offerId || parseOfferUrl(input.offerUrl || input.url), 30);
    if (!/^\d{6,20}$/.test(offerId)) throw new Error('Cần link offer 1688 dạng detail.1688.com/offer/...; link QR/shop chỉ là trang cửa hàng.');
    const sku = clean(input.sku || input.code, 80).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,79}$/.test(sku)) throw new Error('Mã sản phẩm nội bộ phải có 2–80 ký tự chữ, số, dấu gạch hoặc dấu chấm.');
    const title = translatedTitle({ ...input, offerId });
    if (title.length < 3) throw new Error('Cần tiêu đề sản phẩm.');
    const options = normalizeOptions(optionValues(input));
    const variants = normalizeVariants(input, options, sku);
    const galleryDirect = [...new Set((Array.isArray(input.gallery) ? input.gallery : []).map(value => imageUrl(value)).filter(Boolean))].slice(0, 20);
    const detailImagesDirect = [...new Set((Array.isArray(input.detailImages) ? input.detailImages : []).map(value => imageUrl(value)).filter(Boolean))].slice(0, 40);
    const gallery = galleryDirect.map(value => imageUrl(value, { proxy: true })).filter(Boolean);
    const detailImages = detailImagesDirect.map(value => imageUrl(value, { proxy: true })).filter(Boolean);
    const price = safeNumber(input.priceMinor ?? input.basePriceMinor, variants.length ? Math.min(...variants.map(variant => variant.price)) : 0);
    const stock = variants.length ? variants.reduce((sum, variant) => sum + variant.stock, 0) : safeNumber(input.stock, 0);
    const titleLanguage = clean(input.titleLanguage || (input.titleVietnamese || input.titleVi ? 'vi' : input.titleEnglish || input.englishTitle ? 'en' : 'vi'), 12).toLowerCase();
    const source = {
      platform: '1688', offerId, shopId: clean(input.shopId, 120), shopName: clean(input.shopName || DEFAULT_SHOP_NAME, 160),
      sourceUrl: sourceUrl(input.sourceUrl || input.offerUrl || input.url, offerId), sourceTitle: clean(input.sourceTitle || input.title, 500),
      sourcePriceCny: Number.isFinite(Number(input.priceCny)) ? Number(input.priceCny) : null, translatedTitle: true, titleLanguage,
      targetCurrency: clean(input.targetCurrency || '', 8).toUpperCase(), regionId: clean(input.regionId || input.defaultRegionId || '', 40).toLowerCase(),
      baseCurrency: clean(input.baseCurrency || '', 8).toUpperCase(), baseCurrencyDecimals: Number.isInteger(Number(input.baseCurrencyDecimals)) ? Number(input.baseCurrencyDecimals) : null,
      exchangeRateCnyBase: Number.isFinite(Number(input.exchangeRateCnyBase)) ? Number(input.exchangeRateCnyBase) : null,
      exchangeRateCnyVnd: Number.isFinite(Number(input.exchangeRateCnyVnd)) ? Number(input.exchangeRateCnyVnd) : null,
      priceMultiplier: Number.isFinite(Number(input.priceMultiplier)) ? Number(input.priceMultiplier) : null, targetPriceVnd: Number.isSafeInteger(Number(input.priceVnd)) ? Number(input.priceVnd) : null,
      imageUrl: imageUrl(input.imageUrl || input.sourceImageUrl), imageUrls: galleryDirect, detailImages: detailImagesDirect, descriptionUrl: clean(input.descriptionUrl, 2000), detailFetchedAt: clean(input.detailFetchedAt, 80), detailStatus: clean(input.detailStatus || (input.descriptionUrl ? 'available' : 'not_requested'), 40), syncedAt: new Date().toISOString(),
    };
    const regionalPrices = input.regionalPrices && typeof input.regionalPrices === 'object' && !Array.isArray(input.regionalPrices) ? input.regionalPrices : undefined;
    return {
      title, titleLanguage, sku,
      description: clean(input.description || `${title}. Sản phẩm nhập từ catalog 1688; cần kiểm tra size, màu và thông tin sản xuất trước khi mở bán.`, 12000),
      price, stock, status: ['Active', 'Draft', 'Archived'].includes(input.status) ? input.status : 'Draft',
      image: (/^assets\/[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(String(input.image || '')) ? input.image : '') || imageUrl(input.image, { proxy: true }) || gallery[0] || imageUrl(input.imageUrl || input.sourceImageUrl, { proxy: true }) || FALLBACK_IMAGE,
      ...(gallery.length ? { gallery } : {}), ...(detailImages.length ? { detailImages } : {}),
      ...(Array.isArray(input.attributes) && input.attributes.length ? { attributes: input.attributes.slice(0, 80) } : {}),
      ...(clean(input.descriptionHtml, 200000) ? { descriptionHtml: clean(input.descriptionHtml, 200000) } : {}),
      imageAlt: clean(input.imageAlt || `${title} — ảnh sản phẩm`, 180), brand: clean(input.brand || 'Nhà cung cấp 1688', 100),
      category: clean(input.category || 'Thời trang trẻ em', 80), tags: Array.isArray(input.tags) ? input.tags.map(tag => clean(tag, 40)).filter(Boolean).slice(0, 30) : ['1688', 'thời trang trẻ em'],
      slug: clean(input.slug || slugify(title, offerId), 160), seo: { title: clean(input.seo?.title || title, 160), description: clean(input.seo?.description || title, 320), noindex: true },
      options, variants, ...(regionalPrices ? { regionalPrices } : {}), source,
      amazon: { asin: '', prices: {} }, customization: { enabled: false, mode: 'personalize', version: 1, surfaces: [], productionDays: 3, proofRequired: false, instructions: '', syncState: 'draft', sellerCentralConfirmedAt: '' },
      updatedAt: new Date().toISOString(),
    };
  }

  function productFromOffer(offer, options = {}) {
    const id = clean(offer?.id, 30);
    const priceCny = Number(offer?.offerPrice ?? offer?.underLinePrice ?? offer?.handPrice ?? 0);
    const priceVnd = priceCnyToVnd(priceCny, options.exchangeRateCnyVnd, options.priceMultiplier ?? 2);
    const baseRate = Number(options.exchangeRateCnyBase || 0);
    const basePriceMinor = baseRate > 0 ? Math.round(priceCny * baseRate * (10 ** Number(options.baseCurrencyDecimals ?? 2))) : safeNumber(options.basePriceMinor, 0);
    const requestedTitle = clean(options.titleVi || options.titleVietnamese, 180);
    const titleVi = requestedTitle.length >= 3 ? requestedTitle : fallbackVietnameseTitle({ sourceTitle: offer?.subject, offerId: id });
    const gallery = offerImages(offer);
    const primaryImageUrl = gallery[0] || '';
    return toProduct({
      offerId: id, sku: options.skuPrefix ? `${options.skuPrefix}-${id}` : `1688-${id}`, titleVietnamese: titleVi, titleLanguage: 'vi', sourceTitle: offer?.subject,
      priceCny, priceVnd, priceMinor: basePriceMinor, stock: 0, status: options.status || 'Draft', shopId: options.shopId || offer?.memberId || DEFAULT_SHOP_MEMBER_ID,
      shopName: options.shopName || DEFAULT_SHOP_NAME, sourceUrl: options.shopUrl || `https://detail.1688.com/offer/${id}.html`,
       imageUrl: primaryImageUrl, gallery, targetCurrency: 'VND', regionId: options.regionId || 'vn', exchangeRateCnyBase: options.exchangeRateCnyBase,
      baseCurrency: options.baseCurrency, baseCurrencyDecimals: options.baseCurrencyDecimals, exchangeRateCnyVnd: options.exchangeRateCnyVnd,
      priceMultiplier: options.priceMultiplier ?? 2, regionalPrices: { [options.regionId || 'vn']: priceVnd }, category: options.category || 'Thời trang trẻ em', tags: ['1688', 'thời trang trẻ em', 'bản nháp'],
    });
  }

  function meaningfulDescription(value, title = '') {
    const text = clean(value, 12000);
    if (!text || text.length < 24) return '';
    if (/^Sản phẩm nhập từ catalog 1688/i.test(text) && text.includes(title)) return '';
    return text;
  }

  // Merge only verified, non-empty supplier fields into an existing product.
  // An empty/CAPTCHA response must never erase a previously verified value.
  function mergeEnrichment(product, enrichment = {}) {
    const current = { ...(product || {}) };
    const media = value => [...new Set((Array.isArray(value) ? value : []).map(item => imageUrl(item, { proxy: true })).filter(Boolean))];
    const gallery = media(enrichment.gallery);
    const detailImages = media(enrichment.detailImages);
    if (gallery.length) { current.gallery = gallery.slice(0, 20); current.image = gallery[0]; }
    else if (!current.image || current.image === FALLBACK_IMAGE) {
      const primary = imageUrl(enrichment.image || enrichment.imageUrl, { proxy: true });
      if (primary) current.image = primary;
    }
    if (detailImages.length) current.detailImages = detailImages.slice(0, 40);
    const description = meaningfulDescription(enrichment.description, current.title);
    if (description) current.description = description;
    if (typeof enrichment.descriptionHtml === 'string' && enrichment.descriptionHtml.trim()) current.descriptionHtml = clean(enrichment.descriptionHtml, 200000);
    if (Array.isArray(enrichment.attributes) && enrichment.attributes.length) current.attributes = enrichment.attributes.slice(0, 80);
    if (Array.isArray(enrichment.options) && enrichment.options.length && Array.isArray(enrichment.variants) && enrichment.variants.length) {
      const options = normalizeOptions(enrichment.options);
      const source = current.source && typeof current.source === 'object' ? current.source : {};
      const enrichmentSource = enrichment.source && typeof enrichment.source === 'object' ? enrichment.source : {};
      const variants = normalizeVariants({
        ...enrichment,
        priceMinor: current.price,
        regionId: enrichment.regionId || enrichmentSource.regionId || source.regionId || 'vn',
        exchangeRateCnyBase: enrichment.exchangeRateCnyBase ?? enrichmentSource.exchangeRateCnyBase ?? source.exchangeRateCnyBase,
        baseCurrencyDecimals: enrichment.baseCurrencyDecimals ?? enrichmentSource.baseCurrencyDecimals ?? source.baseCurrencyDecimals ?? 2,
        exchangeRateCnyVnd: enrichment.exchangeRateCnyVnd ?? enrichmentSource.exchangeRateCnyVnd ?? source.exchangeRateCnyVnd,
        priceMultiplier: enrichment.priceMultiplier ?? enrichmentSource.priceMultiplier ?? source.priceMultiplier,
      }, options, current.sku);
      const complete = variants.filter(variant => Object.keys(variant.values).length === options.length);
      if (options.length && complete.length && complete.length <= MAX_IMPORT_VARIANTS) {
        current.options = options;
        current.variants = complete;
        const enabled = complete.filter(variant => variant.enabled);
        current.price = enabled.length ? Math.min(...enabled.map(variant => variant.price)) : 0;
        current.stock = enabled.reduce((sum, variant) => sum + variant.stock, 0);
      }
    }
    current.source = {
      ...(current.source || {}),
      ...(enrichment.source && typeof enrichment.source === 'object' ? enrichment.source : {}),
      ...(enrichment.descriptionUrl ? { descriptionUrl: clean(enrichment.descriptionUrl, 2000) } : {}),
      ...(enrichment.detailStatus ? { detailStatus: clean(enrichment.detailStatus, 40) } : {}),
      ...(enrichment.detailFetchedAt ? { detailFetchedAt: clean(enrichment.detailFetchedAt, 80) } : {}),
      ...(gallery.length ? { imageUrls: gallery.map(item => imageUrl(item)) } : {}),
      ...(detailImages.length ? { detailImages: detailImages.map(item => imageUrl(item)) } : {}),
      syncedAt: new Date().toISOString(),
    };
    current.updatedAt = new Date().toISOString();
    return current;
  }

  function enrichProduct(input = {}, detail = {}, description = {}) {
    const detailData = detailPayload(detail);
    const descriptionData = typeof description === 'string' ? parseDescriptionDocument(description) : (description || {});
    const merged = {
      ...input,
      gallery: detailData.gallery?.length ? detailData.gallery : input.gallery,
      options: detailData.options?.length ? detailData.options : input.options,
      variants: detailData.variants?.length ? detailData.variants : input.variants,
      attributes: detailData.attributes?.length ? detailData.attributes : input.attributes,
      descriptionUrl: detailData.descriptionUrl || input.descriptionUrl,
      description: descriptionData.text || input.description,
      descriptionHtml: descriptionData.html || input.descriptionHtml,
      detailImages: [...new Set([...(input.detailImages || []), ...(descriptionData.images || [])])],
      detailStatus: descriptionData.text || descriptionData.images?.length ? 'available' : 'blocked_or_empty',
      detailFetchedAt: new Date().toISOString(),
    };
    return input.id ? mergeEnrichment(input, merged) : toProduct(merged);
  }

  function upsert(products, product) {
    const list = Array.isArray(products) ? products : [];
    const index = list.findIndex(item => item?.sku?.toLowerCase() === product.sku.toLowerCase() || item?.source?.platform === '1688' && item.source.offerId === product.source.offerId);
    if (index < 0) return { products: [product, ...list], product, mode: 'created', index: 0 };
    const current = list[index];
    const merged = { ...current, ...product, id: current.id, source: { ...(current.source || {}), ...product.source }, updatedAt: new Date().toISOString() };
    const next = list.slice(); next[index] = merged;
    return { products: next, product: merged, mode: 'updated', index };
  }

  return Object.freeze({
    FALLBACK_IMAGE, MTOP_ENDPOINT, MTOP_APP_KEY, OFFER_DETAIL_MTOP_ENDPOINT, OFFER_DETAIL_MTOP_API, DEFAULT_SHOP_MEMBER_ID, DEFAULT_SHOP_NAME, KNOWN_TITLES,
    clean, parseOfferUrl, isShopUrl, shopHost, sourceUrl, translatedTitle, fallbackVietnameseTitle,
    priceCnyToVnd, parseJsonp, imageUrl, proxyImageUrl, offerImages, parseDescriptionDocument, parseMobileOfferDocument, detailPayload, normalizeDescriptionUrl, createMtopClient, createOfferDetailClient, fetchShopCatalog, translateTitleVi, translateTitles,
    toProduct, productFromOffer, mergeEnrichment, enrichProduct, upsert,
  });
});
