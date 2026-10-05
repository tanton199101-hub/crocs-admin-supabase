(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Crocs1688 = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const FALLBACK_IMAGE = 'assets/arrival-classic-clog-100.png';
  const OFFER_RE = /(?:^|\/)offer\/(\d{6,20})(?:\.html)?(?:\/|$)/i;
  const KNOWN_TITLES = Object.freeze({
    '837842260799': "Girls' Trendy Jazz Dance Performance Costume – Hip-Hop Street Dance Group Outfit for Kids",
  });

  const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
  const safeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
  };
  const slugify = (title, offerId) => {
    const slug = clean(title, 160).toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return (slug || `1688-${offerId}`).slice(0, 160);
  };

  function parseOfferUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (!/(?:^|\.)1688\.com$/i.test(url.hostname) && !/(?:^|\.)alibaba\.com$/i.test(url.hostname)) return '';
      return url.pathname.match(OFFER_RE)?.[1] || '';
    } catch {
      return '';
    }
  }

  function isShopUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return /(?:^|\.)1688\.com$/i.test(url.hostname) && !parseOfferUrl(url.href);
    } catch {
      return false;
    }
  }

  function sourceUrl(value, offerId) {
    const parsed = clean(value, 2000);
    if (parseOfferUrl(parsed)) return parsed;
    return offerId ? `https://detail.1688.com/offer/${offerId}.html` : parsed;
  }

  function translatedTitle(input = {}) {
    const english = clean(input.titleEnglish || input.englishTitle, 180);
    if (english) return english;
    const offerId = clean(input.offerId, 30);
    if (KNOWN_TITLES[offerId]) return KNOWN_TITLES[offerId];
    return clean(input.title || input.sourceTitle, 180);
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
      values: [...new Set((Array.isArray(option?.values) ? option.values : []).map(value => clean(value, 80)).filter(Boolean))].slice(0, 100),
    })).filter(option => option.id && option.name && option.values.length);
  }

  function normalizeVariants(input, options, sku) {
    const source = Array.isArray(input.variants) ? input.variants : [];
    const variants = source.slice(0, 100).map((variant, index) => {
      const values = {};
      options.forEach(option => {
        const value = clean(variant?.values?.[option.id] || variant?.[option.id], 80);
        if (value) values[option.id] = value;
      });
      const suffix = Object.values(values).join('-').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
      return {
        id: clean(variant?.id || `v-${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, '-'),
        values,
        sku: clean(variant?.sku || `${sku}-${suffix || index + 1}`, 80),
        price: safeNumber(variant?.price, safeNumber(input.priceMinor, 0)),
        compareAt: variant?.compareAt == null ? null : safeNumber(variant.compareAt),
        cost: variant?.cost == null ? null : safeNumber(variant.cost),
        stock: safeNumber(variant?.stock, 0),
        enabled: variant?.enabled !== false,
        barcode: clean(variant?.barcode, 80),
      };
    });
    if (variants.length) return variants;
    return [];
  }

  function toProduct(input = {}) {
    const offerId = clean(input.offerId || parseOfferUrl(input.offerUrl || input.url), 30);
    if (!/^\d{6,20}$/.test(offerId)) throw new Error('Cần link offer 1688 dạng detail.1688.com/offer/...; link QR/shop chỉ là trang cửa hàng.');
    const sku = clean(input.sku || input.code, 80).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,79}$/.test(sku)) throw new Error('Mã sản phẩm nội bộ phải có 2–80 ký tự chữ, số, dấu gạch hoặc dấu chấm.');
    const title = translatedTitle({ ...input, offerId });
    if (title.length < 3) throw new Error('Cần tiêu đề tiếng Anh của sản phẩm.');
    const options = normalizeOptions(optionValues(input));
    const variants = normalizeVariants(input, options, sku);
    const price = safeNumber(input.priceMinor, variants.length ? Math.min(...variants.map(variant => variant.price)) : 0);
    const stock = variants.length ? variants.reduce((sum, variant) => sum + variant.stock, 0) : safeNumber(input.stock, 0);
    const source = {
      platform: '1688',
      offerId,
      shopId: clean(input.shopId, 120),
      shopName: clean(input.shopName || '湖州简百服饰有限公司', 160),
      sourceUrl: sourceUrl(input.sourceUrl || input.offerUrl || input.url, offerId),
      sourceTitle: clean(input.sourceTitle || input.title, 500),
      sourcePriceCny: Number.isFinite(Number(input.priceCny)) ? Number(input.priceCny) : null,
      translatedTitle: true,
      titleLanguage: 'en',
      syncedAt: new Date().toISOString(),
    };
    return {
      title,
      sku,
      description: clean(input.description || `${title}. Imported from 1688 supplier catalog; verify size, colour and production details before publishing.`, 2000),
      price,
      stock,
      status: ['Active', 'Draft', 'Archived'].includes(input.status) ? input.status : 'Draft',
      image: /^assets\/[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(String(input.image || '')) ? input.image : FALLBACK_IMAGE,
      imageAlt: clean(input.imageAlt || `${title} product image`, 180),
      brand: clean(input.brand || '1688 supplier', 100),
      category: clean(input.category || 'Kids', 80),
      tags: Array.isArray(input.tags) ? input.tags.map(tag => clean(tag, 40)).filter(Boolean).slice(0, 30) : ['1688', 'kids dancewear'],
      slug: clean(input.slug || `${slugify(title, offerId)}-${offerId}`, 160),
      seo: { title: clean(input.seo?.title || title, 160), description: clean(input.seo?.description || title, 320), noindex: true },
      options,
      variants,
      source,
      amazon: { asin: '', prices: {} },
      customization: { enabled: false, mode: 'personalize', version: 1, surfaces: [], productionDays: 3, proofRequired: false, instructions: '', syncState: 'draft', sellerCentralConfirmedAt: '' },
      updatedAt: new Date().toISOString(),
    };
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

  return Object.freeze({ FALLBACK_IMAGE, KNOWN_TITLES, parseOfferUrl, isShopUrl, translatedTitle, toProduct, upsert });
});
