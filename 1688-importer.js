(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Crocs1688 = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const FALLBACK_IMAGE = 'assets/arrival-classic-clog-100.png';
  const OFFER_RE = /(?:^|\/)offer\/(\d{6,20})(?:\.html)?(?:\/|$)/i;
  const SHOP_HOST_RE = /(?:^|\.)1688\.com$/i;
  const MTOP_ENDPOINT = 'https://h5api.m.1688.com/h5/mtop.alibaba.alisite.cbu.server.moduleasyncservice/1.0/';
  const MTOP_APP_KEY = '12574478';
  const TRANSLATE_ENDPOINT = 'https://clients5.google.com/translate_a/t';
  const DEFAULT_SHOP_MEMBER_ID = 'b2b-305059698170e97';
  const DEFAULT_SHOP_NAME = '湖州简百服饰有限公司';
  const KNOWN_TITLES = Object.freeze({
    '837842260799': "Girls' Trendy Jazz Dance Performance Costume – Hip-Hop Street Dance Group Outfit for Kids",
  });

  const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
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
      values: [...new Set((Array.isArray(option?.values) ? option.values : []).map(value => clean(value, 80)).filter(Boolean))].slice(0, 100),
    })).filter(option => option.id && option.name && option.values.length);
  }

  function normalizeVariants(input, options, sku) {
    const source = Array.isArray(input.variants) ? input.variants : [];
    return source.slice(0, 100).map((variant, index) => {
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
        price: safeNumber(variant?.price, safeNumber(input.priceMinor ?? input.basePriceMinor, 0)),
        compareAt: variant?.compareAt == null ? null : safeNumber(variant.compareAt),
        cost: variant?.cost == null ? null : safeNumber(variant.cost),
        stock: safeNumber(variant?.stock, 0),
        enabled: variant?.enabled !== false,
        barcode: clean(variant?.barcode, 80),
        ...(variant?.regionalPrices && typeof variant.regionalPrices === 'object' ? { regionalPrices: variant.regionalPrices } : {}),
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

  function queryFor(data, timestamp, sign = '', appKey = MTOP_APP_KEY) {
    const query = new URLSearchParams({
      jsv: '2.7.2', appKey, t: String(timestamp),
      api: 'mtop.alibaba.alisite.cbu.server.moduleasyncservice', v: '1.0',
      type: 'jsonp', dataType: 'jsonp', callback: 'mtopjsonp1', data,
    });
    if (sign) query.set('sign', sign);
    return query;
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
      cookie = mergeCookies(cookie, response.headers?.get?.('set-cookie') || response.headers?.getSetCookie?.()?.join(', '));
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
    const price = safeNumber(input.priceMinor ?? input.basePriceMinor, variants.length ? Math.min(...variants.map(variant => variant.price)) : 0);
    const stock = variants.length ? variants.reduce((sum, variant) => sum + variant.stock, 0) : safeNumber(input.stock, 0);
    const titleLanguage = clean(input.titleLanguage || (input.titleVietnamese || input.titleVi ? 'vi' : input.titleEnglish || input.englishTitle ? 'en' : 'vi'), 12).toLowerCase();
    const source = {
      platform: '1688', offerId, shopId: clean(input.shopId, 120), shopName: clean(input.shopName || DEFAULT_SHOP_NAME, 160),
      sourceUrl: sourceUrl(input.sourceUrl || input.offerUrl || input.url, offerId), sourceTitle: clean(input.sourceTitle || input.title, 500),
      sourcePriceCny: Number.isFinite(Number(input.priceCny)) ? Number(input.priceCny) : null, translatedTitle: true, titleLanguage,
      targetCurrency: clean(input.targetCurrency || '', 8).toUpperCase(), exchangeRateCnyVnd: Number.isFinite(Number(input.exchangeRateCnyVnd)) ? Number(input.exchangeRateCnyVnd) : null,
      priceMultiplier: Number.isFinite(Number(input.priceMultiplier)) ? Number(input.priceMultiplier) : null, targetPriceVnd: Number.isSafeInteger(Number(input.priceVnd)) ? Number(input.priceVnd) : null,
      imageUrl: clean(input.imageUrl || input.sourceImageUrl, 2000), syncedAt: new Date().toISOString(),
    };
    const regionalPrices = input.regionalPrices && typeof input.regionalPrices === 'object' && !Array.isArray(input.regionalPrices) ? input.regionalPrices : undefined;
    return {
      title, titleLanguage, sku,
      description: clean(input.description || `${title}. Sản phẩm nhập từ catalog 1688; cần kiểm tra size, màu và thông tin sản xuất trước khi mở bán.`, 2000),
      price, stock, status: ['Active', 'Draft', 'Archived'].includes(input.status) ? input.status : 'Draft',
      image: /^assets\/[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(String(input.image || '')) ? input.image : FALLBACK_IMAGE,
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
    const imageUrl = offer?.offerImages?.[0]?.imageURI || offer?.offerImages?.[0]?.size310x310ImageURI || '';
    return toProduct({
      offerId: id, sku: options.skuPrefix ? `${options.skuPrefix}-${id}` : `1688-${id}`, titleVietnamese: titleVi, titleLanguage: 'vi', sourceTitle: offer?.subject,
      priceCny, priceVnd, priceMinor: basePriceMinor, stock: 0, status: options.status || 'Draft', shopId: options.shopId || offer?.memberId || DEFAULT_SHOP_MEMBER_ID,
      shopName: options.shopName || DEFAULT_SHOP_NAME, sourceUrl: options.shopUrl || `https://detail.1688.com/offer/${id}.html`,
      imageUrl: imageUrl ? `https://cbu01.alicdn.com/${imageUrl.replace(/^\/+/, '')}` : '', targetCurrency: 'VND', exchangeRateCnyVnd: options.exchangeRateCnyVnd,
      priceMultiplier: options.priceMultiplier ?? 2, regionalPrices: { [options.regionId || 'vn']: priceVnd }, category: options.category || 'Thời trang trẻ em', tags: ['1688', 'thời trang trẻ em', 'bản nháp'],
    });
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
    FALLBACK_IMAGE, MTOP_ENDPOINT, MTOP_APP_KEY, DEFAULT_SHOP_MEMBER_ID, DEFAULT_SHOP_NAME, KNOWN_TITLES,
    clean, parseOfferUrl, isShopUrl, shopHost, sourceUrl, translatedTitle, fallbackVietnameseTitle,
    priceCnyToVnd, parseJsonp, createMtopClient, fetchShopCatalog, translateTitleVi, translateTitles,
    toProduct, productFromOffer, upsert,
  });
});
