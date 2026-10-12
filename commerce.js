(function (root, factory) {
  const api = factory(root, typeof require === 'function' ? require('./variant-options.js') : root.CrocsVariantOptions);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrocsCommerce = api;
})(typeof window === 'undefined' ? globalThis : window, function (root, variantOptions) {
  'use strict';
  const CART_KEY = 'crocs-bag-v2';
  const RECENTLY_VIEWED_KEY = 'sally-kids-recently-viewed-v1';
  const RECENTLY_VIEWED_LIMIT = 8;
  const CATALOG_CACHE_KEY = 'crocs-catalog-v1';
  const CATALOG_CACHE_TTL = 60 * 1000;
  const STATIC_CATALOG_PATH = 'assets/catalog-1688';
  const STOREFRONT_API_PATH = '/api/storefront';
  const MAX_GALLERY_IMAGES = 50;
  const MAX_DETAIL_IMAGES = 120;
  const MAX_VIDEOS = 8;
  const PRODUCT_PLACEHOLDER = 'assets/sally-kids-product-placeholder.svg';
  const regional = root.CrocsRegional;
  const baseMoney = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
  const money = cents => regional?.formatMoney ? regional.formatMoney(cents) : baseMoney(cents);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const remoteImageHosts = new Set(['cbu01.alicdn.com', 'gw.alicdn.com', 'img.alicdn.com', 'itemcdn.tmall.com', 'img01.1688.com', 'img02.1688.com']);
  const remoteVideoHosts = new Set(['cloud.video.taobao.com', 'video01.1688.com', 'video.1688.com', 'caiyuanbao.alicdn.com']);
  const allowedRemoteHost = host => remoteImageHosts.has(String(host || '').toLowerCase()) || /(?:^|\.)alicdn\.com$/i.test(String(host || ''));
  const normalizeImageReference = value => String(value || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/').replace(/&quot;/gi, '"').trim();
  const image = value => {
    const raw = normalizeImageReference(value);
    if (/^(?:\/?assets)\/[\w.-]+\.(png|jpe?g|webp|avif|svg)$/i.test(raw) || /^data:image\/(png|jpeg|webp|avif);base64,[A-Za-z0-9+/=]+$/.test(raw)) return raw.replace(/^\//, '');
    try {
      const parsed = new URL(raw, root.location?.origin || 'https://store.invalid');
      if (parsed.origin === (root.location?.origin || 'https://store.invalid') && parsed.pathname === '/api/1688-image') {
        const source = new URL(parsed.searchParams.get('url') || '');
        return source.protocol === 'https:' && allowedRemoteHost(source.hostname) && !/^\/1688offer\//i.test(source.pathname) ? `${parsed.pathname}?url=${encodeURIComponent(source.href)}` : PRODUCT_PLACEHOLDER;
      }
      return parsed.protocol === 'https:' && allowedRemoteHost(parsed.hostname) && !/^\/1688offer\//i.test(parsed.pathname) ? parsed.href : PRODUCT_PLACEHOLDER;
    } catch { return PRODUCT_PLACEHOLDER; }
  };
  const video = value => {
    const raw = normalizeImageReference(value);
    try {
      const parsed = new URL(raw, root.location?.origin || 'https://store.invalid');
      if (parsed.origin === (root.location?.origin || 'https://store.invalid') && parsed.pathname === '/api/1688-video') {
        const source = new URL(parsed.searchParams.get('url') || '');
        const host = source.hostname.toLowerCase();
        const pathOkay = /^\/(?:play|video|download)\//i.test(source.pathname) || host === 'caiyuanbao.alicdn.com';
        return source.protocol === 'https:' && remoteVideoHosts.has(host) && pathOkay && /\.mp4(?:$|[?#])/i.test(source.pathname + source.search) ? `${parsed.pathname}?url=${encodeURIComponent(source.href)}` : '';
      }
      const host = parsed.hostname.toLowerCase();
      const pathOkay = /^\/(?:play|video|download)\//i.test(parsed.pathname) || host === 'caiyuanbao.alicdn.com';
      return parsed.protocol === 'https:' && remoteVideoHosts.has(host) && pathOkay && /\.mp4(?:$|[?#])/i.test(parsed.pathname + parsed.search) ? `/api/1688-video?url=${encodeURIComponent(parsed.href)}` : '';
    } catch { return ''; }
  };
  const descriptionImages = value => {
    const html = String(value || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    const result = [];
    for (const match of html.matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)) {
      const name = String(match[1] || '').toLowerCase();
      if (!['src', 'data-src', 'data-lazy-src', 'data-lazyload-src', 'data-ks-lazyload', 'data-img', 'data-image', 'data-original', 'srcset', 'data-srcset'].includes(name)) continue;
      result.push(...(name === 'srcset' || name === 'data-srcset' ? match[3].split(',').map(item => item.trim().split(/\s+/)[0]) : [match[3]]));
    }
    for (const match of html.matchAll(/background(?:-image)?\s*:\s*url\(\s*["']?([^\)"']+)/gi)) result.push(match[1]);
    return result.filter(Boolean);
  };
  const descriptionVideos = value => {
    const html = String(value || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    const result = [];
    for (const match of html.matchAll(/(?:src|data-src|data-video|video-url|data-video-url)\s*=\s*(["'])([\s\S]*?)\1/gi)) result.push(match[2]);
    result.push(...(html.match(/(?:https?:)?\/\/[^"'<>\s\\]+\.mp4(?:[?#][^"'<>\s\\]*)?/gi) || []));
    return result.filter(Boolean);
  };
  const videoCandidates = value => {
    const output = [];
    const visit = (item, depth = 0) => {
      // Supplier payloads sometimes contain several stale/invalid media URLs
      // before the verified clip in the description. Keep a bounded traversal
      // for safety, but do not let those stale entries hide a valid video.
      if (depth > 8 || item == null || output.length >= MAX_VIDEOS * 16) return;
      if (typeof item === 'string') {
        const text = normalizeImageReference(item);
        const urls = text.match(/https?:\/\/[^\s"'<>\\]+/gi) || [text];
        urls.forEach(url => output.push(url.replace(/[\\"']+$/g, '')));
        return;
      }
      if (Array.isArray(item)) { item.forEach(value => visit(value, depth + 1)); return; }
      if (typeof item === 'object') Object.values(item).forEach(value => visit(value, depth + 1));
    };
    visit(value);
    return output;
  };
  const mediaImageValue = value => {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return value.imageUrl || value.imgUrl || value.imageURI || value.fullPathImageURI || value.url || '';
  };
  const isBannerAsset = value => /(?:^|[\/])(?:sally-kids-(?:hero|play|school)(?:-[\w]+)?|crocs-(?:hero|cozy|crocband|pokemon|ninjago)(?:-[\w]+)?)\.(?:png|jpe?g|webp|avif)(?:[?#].*)?$/i.test(normalizeImageReference(value));
  const safeProductImage = value => {
    const raw = normalizeImageReference(mediaImageValue(value));
    if (!raw || isBannerAsset(raw)) return '';
    const candidate = image(raw);
    // Invalid gallery/variant URLs must be dropped, not expanded into repeated
    // fallback images. The placeholder is only used for the main product photo.
    return candidate === PRODUCT_PLACEHOLDER && raw.replace(/^\//, '') !== PRODUCT_PLACEHOLDER ? '' : candidate;
  };
  const normalizeOptionImageMap = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([optionId, rawValues]) => {
      if (!rawValues || typeof rawValues !== 'object' || Array.isArray(rawValues)) return null;
      const mapped = Object.fromEntries(Object.entries(rawValues).map(([optionValue, rawImage]) => {
        const candidate = safeProductImage(rawImage);
        return candidate ? [String(optionValue), candidate] : null;
      }).filter(Boolean));
      return Object.keys(mapped).length ? [String(optionId), mapped] : null;
    }).filter(Boolean));
  };
  const normalizeVariantImageMap = value => {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).map(([variantId, rawImage]) => {
      const candidate = safeProductImage(Array.isArray(rawImage) ? rawImage[0] : rawImage);
      return candidate ? [String(variantId), candidate] : null;
    }).filter(Boolean));
  };
  const colourNames = { p1: 'White', p2: 'Lilac', p3: 'Multi', p4: 'Black', p5: 'Black', p6: 'Pink', p7: 'Espresso', p8: 'Multi' };
  const optionsFor = p => Array.isArray(p?.options) ? p.options : [];
  const variantsFor = p => Array.isArray(p?.variants) ? p.variants.filter(v => v && v.enabled !== false) : [];
  const sizeOption = p => optionsFor(p).find(o => /size|maat|number|height|kích thước|chiều cao|cỡ/i.test(`${o.id} ${o.name}`));
  const variantTitle = (p, v) => optionsFor(p).map(o => v?.values?.[o.id]).filter(Boolean).join(' / ') || v?.title || v?.sku || 'Variant';
  const variantSize = (p, v) => String(v?.values?.[sizeOption(p)?.id] || variantTitle(p, v));
  function sizesFor(p) {
    const option = sizeOption(p);
    if (option?.values?.length) return option.values.map(String);
    return Array.isArray(p?.sizes) && p.sizes.length ? p.sizes.map(String) : p?.category === 'Accessories' ? ['One size'] : p?.category === 'Kids' ? ['1','2','3','4','5','6'] : ['3','4','5','6','7','8','9','10','11','12'];
  }
  function variantFor(p, selection = {}) {
    const variants = variantsFor(p);
    if (!variants.length) return null;
    if (typeof selection === 'string') return variants.find(v => v.id === selection) || variants.find(v => variantSize(p, v) === selection) || null;
    if (selection.variantId) return variants.find(v => v.id === selection.variantId) || null;
    const values = selection.values || selection;
    return variants.find(v => optionsFor(p).every(o => !values[o.id] || v.values?.[o.id] === values[o.id])) || null;
  }
  function normalize(p) {
    // SSR bootstrap and API responses share the compact SKU wire format.
    // Decode here so every entry point retains options, images and stock.
    p = unpackPackedProduct(p);
    if (!p || typeof p.id !== 'string' || !p.title || !Number.isSafeInteger(p.price) || p.price < 0 || !Number.isSafeInteger(p.stock) || p.stock < 0) throw new Error('Invalid product data.');
    const basePrice = Number.isSafeInteger(p.basePrice) ? p.basePrice : p.price;
    const options = variantOptions.normalize(optionsFor(p));
    p = { ...p, description: variantOptions.description(p.description) };
    const optionImages = normalizeOptionImageMap(p.optionImages);
    const variantImages = normalizeVariantImageMap(p.variantImages);
    const variants = Array.isArray(p.variants) ? p.variants.map(v => {
      const explicitImage = variantImages[String(v?.id || v?.sku || '')] || safeProductImage(v?.image) || safeProductImage(v?.imageUrl);
      const optionImage = options.map(option => optionImages?.[option.id]?.[v?.values?.[option.id]]).find(Boolean);
      const { image: originalImage, imageUrl: originalImageUrl, ...variant } = v;
      return { ...variant, ...(explicitImage || optionImage ? { image: explicitImage || optionImage } : {}), basePrice: Number.isSafeInteger(v.basePrice) ? v.basePrice : (Number.isSafeInteger(v.price) ? v.price : basePrice), price: Number.isSafeInteger(v.price) ? v.price : basePrice, stock: Number.isSafeInteger(v.stock) ? v.stock : 0, enabled: v.enabled !== false };
    }).filter(v => v.id) : [];
    const active = variants.filter(v => v.enabled);
    const gallery = Array.isArray(p.gallery) ? p.gallery.map(safeProductImage).filter(Boolean).slice(0, MAX_GALLERY_IMAGES) : [];
    const directDetailImages = Array.isArray(p.detailImages) ? p.detailImages : [];
    const detailImages = [...new Set([...directDetailImages, ...descriptionImages(p.descriptionHtml)].map(safeProductImage).filter(Boolean))].slice(0, MAX_DETAIL_IMAGES);
    const rawVideos = [
      ...(Array.isArray(p.videos) ? p.videos : []),
      p.videoUrl, p.video,
      p.source?.videos, p.source?.videoUrl, p.source?.video,
      descriptionVideos(p.descriptionHtml), descriptionVideos(p.description),
      videoCandidates(p.media), videoCandidates(p.mediaUrls), videoCandidates(p.videoInfo),
    ];
    const videos = [...new Set(videoCandidates(rawVideos).map(video).filter(Boolean))].slice(0, MAX_VIDEOS);
    const requestedBrand = String(p.brand || '').trim();
    const brand = !requestedBrand || /crocs|1688|supplier|nhà cung cấp/i.test(requestedBrand) ? 'Sally Kids' : requestedBrand;
    const normalized = { ...p, basePrice, hasVariants: p.hasVariants === true || variants.length > 0, image: safeProductImage(p.image) || gallery[0] || PRODUCT_PLACEHOLDER, gallery, detailImages, videos, attributes: Array.isArray(p.attributes) ? p.attributes.slice(0, 80) : [], imageAlt: p.imageAlt || p.title, brand, slug: p.slug || '', seo: { title: '', description: '', noindex: false, ...(p.seo || {}) }, options, optionImages, variantImages: Object.fromEntries(Object.entries({ ...variantImages, ...Object.fromEntries(variants.map(v => [String(v.id || v.sku), v.image]).filter(([, value]) => value)) }).filter(([, value]) => value)), variants };
    return { ...normalized, price: active.length ? Math.min(...active.map(v => v.price)) : variants.length ? 0 : basePrice, stock: variants.length ? active.reduce((n, v) => n + v.stock, 0) : p.stock, colour: p.colour || colourNames[p.id] || 'As pictured', sizes: sizesFor(normalized) };
  }

  // The public RPC is the source of truth. A static, generated 1688 mirror is
  // kept as a safe read-only fallback while a project is unavailable or its
  // SQL migration is still waiting to be applied. It uses the same compact
  // variant wire format as supabase-sync.js so product pages can still load
  // verified options without sending 100k SKU rows in the home response.
  function unpackPackedProduct(product) {
    if (product?.variantEncoding !== 'crocs-1688-v3' || !Array.isArray(product.variantsPacked)) return product;
    const options = Array.isArray(product.options) ? product.options : [];
    const regions = Array.isArray(product.variantRegions) ? product.variantRegions : [];
    const priceIndex = 1 + options.length;
    const stockIndex = priceIndex + 1;
    const regionIndex = stockIndex + 1;
    const flagIndex = regionIndex + regions.length;
    const variants = product.variantsPacked.map(row => {
      if (!Array.isArray(row) || typeof row[0] !== 'string') return null;
      const sku = row[0];
      const values = Object.fromEntries(options.map((option, index) => {
        const value = option.values?.[Number(row[1 + index])];
        return value == null ? null : [option.id, value];
      }).filter(Boolean));
      const regionalPrices = Object.fromEntries(regions.map((region, index) => {
        const value = row[regionIndex + index];
        return value == null ? null : [region, Number(value)];
      }).filter(Boolean));
      return {
        id: sku,
        values,
        sku,
        price: Number(row[priceIndex] || 0),
        compareAt: null,
        cost: null,
        stock: Number(row[stockIndex] || 0),
        enabled: row[flagIndex] !== 0,
        barcode: '',
        ...(product.variantImages?.[sku] ? { image: product.variantImages[sku] } : {}),
        ...(Object.keys(regionalPrices).length ? { regionalPrices } : {}),
      };
    }).filter(Boolean);
    const expanded = { ...product, variants };
    delete expanded.variantEncoding;
    delete expanded.variantRegions;
    delete expanded.variantsPacked;
    return expanded;
  }
  async function fetchStaticJson(file) {
    // These JSON filenames are reused by every sync/deploy, unlike hashed
    // assets. Revalidate even if a previous deployment cached them as immutable.
    const response = await fetch(`${STATIC_CATALOG_PATH}/${file}`, { cache: 'no-cache', signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`Static catalogue ${response.status}`);
    return response.json();
  }
  async function loadStaticSummary() {
    if (!staticSummary) staticSummary = await fetchStaticJson('summary.json');
    return staticSummary;
  }
  const staticDetailChunks = new Map();
  async function loadStaticProduct(id) {
    const summary = (await loadStaticSummary()).products?.find(product => product.id === id);
    if (!summary) throw new Error('Static product unavailable.');
    const chunk = Number.isInteger(summary.detailChunk) ? summary.detailChunk : 0;
    let products = staticDetailChunks.get(chunk);
    if (!products) {
      products = await fetchStaticJson(`details-${chunk}.json`);
      staticDetailChunks.set(chunk, products);
    }
    const product = products?.[id];
    if (!product) throw new Error('Static product unavailable.');
    return unpackPackedProduct(product);
  }
  function localizeProduct(product) {
    if (!regional?.priceFor) return product;
    const basePrice = Number.isSafeInteger(product.basePrice) ? product.basePrice : product.price;
    const baseVariants = Array.isArray(product.variants) ? product.variants : [];
    const variants = baseVariants.map(variant => ({ ...variant, basePrice: Number.isSafeInteger(variant.basePrice) ? variant.basePrice : variant.price, price: regional.priceFor(Number.isSafeInteger(variant.basePrice) ? variant.basePrice : variant.price, product, variant) }));
    const active = variants.filter(v => v.enabled !== false);
    return { ...product, basePrice, price: active.length ? Math.min(...active.map(v => v.price)) : variants.length ? 0 : regional.priceFor(basePrice, product), variants };
  }
  function localizeCatalog(products) { return products.map(localizeProduct); }
  // Product media uses a consistent 3:4 frame, but source artwork is not
  // always 3:4. Once the browser knows the intrinsic dimensions, use cover
  // for 3:4-to-square art (cropping only a controlled amount at the sides).
  // Very wide supplier banners stay contained so the product itself is not
  // clipped, while tall art never loses its top or bottom.
  const SMART_FRAME_RATIO = 3 / 4;
  const SMART_COVER_MAX_RATIO = 1.35;
  function enhanceImage(imageElement) {
    if (!imageElement || String(imageElement.tagName || '').toLowerCase() !== 'img') return imageElement;
    const applyFit = () => {
      const width = Number(imageElement.naturalWidth);
      const height = Number(imageElement.naturalHeight);
      if (!(width > 0 && height > 0)) return;
      const ratio = width / height;
      const fit = ratio >= SMART_FRAME_RATIO && ratio <= SMART_COVER_MAX_RATIO ? 'is-smart-cover' : 'is-smart-contain';
      imageElement.classList.toggle('is-smart-cover', fit === 'is-smart-cover');
      imageElement.classList.toggle('is-smart-contain', fit === 'is-smart-contain');
      imageElement.dataset.imageRatio = `${width}:${height}`;
    };
    if (imageElement.complete) applyFit();
    else imageElement.addEventListener('load', applyFit, { once: true });
    imageElement.addEventListener('error', () => imageElement.classList.add('is-smart-contain'), { once: true });
    return imageElement;
  }
  function enhanceImages(scope = root.document) {
    if (!scope) return scope;
    if (String(scope.tagName || '').toLowerCase() === 'img' && scope.matches?.('[data-smart-fit]')) enhanceImage(scope);
    scope.querySelectorAll?.('img[data-smart-fit]').forEach(enhanceImage);
    return scope;
  }
  const seeds = [
    ['p1','Set váy hoa nắng','SK-001',18900,8,'sally-kids-product-placeholder.svg','Bé gái'],
    ['p2','Áo thun cầu vồng','SK-002',9900,64,'sally-kids-product-placeholder.svg','Bé trai'],
    ['p4','Set đôi cuối tuần','SK-004',24900,5,'sally-kids-product-placeholder.svg','Đồ đôi'],
    ['p5','Áo khoác gió pastel','SK-005',21900,42,'sally-kids-product-placeholder.svg','Đi học'],
    ['p6','Mũ bucket hoa nhỏ','SK-006',7900,27,'sally-kids-product-placeholder.svg','Phụ kiện'],
    ['p7','Túi mini đi chơi','SK-007',12900,12,'sally-kids-product-placeholder.svg','Phụ kiện']
  ].map(([id,title,sku,price,stock,img,category]) => normalize({ id,title,sku,price,stock,image:`assets/${img}`,category,status:'Active',brand:'Sally Kids',description:'Thiết kế mềm mại, dễ mặc và sẵn sàng cho mọi cuộc khám phá.' }));
  let catalog = seeds, source = 'sample', problem = '';
  let staticSummary = null;
  function readCart() {
    try {
      const parsed = JSON.parse(root.localStorage?.getItem(CART_KEY) || '[]');
      if (!Array.isArray(parsed) || parsed.length > 20) return [];
      const unique = new Set();
      return parsed.filter(l => {
        if (!l || typeof l.productId !== 'string' || typeof l.size !== 'string' || l.size.length > 80 || (l.variantId != null && (typeof l.variantId !== 'string' || l.variantId.length > 120)) || !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 10) return false;
        const key = `${l.productId}:${l.variantId || l.size}`;
        if (unique.has(key)) return false;
        unique.add(key); return true;
      }).map(({ productId, variantId = '', size, quantity }) => ({ productId, variantId, size, quantity }));
    } catch { problem = 'Your browser could not read the bag. Please allow local storage.'; return []; }
  }
  function saveCart(lines) {
    try { root.localStorage.setItem(CART_KEY, JSON.stringify(lines)); }
    catch { throw new Error('Your bag could not be saved. Please allow browser storage and try again.'); }
    root.dispatchEvent?.(new Event('crocs:bag'));
    return lines;
  }
  function readRecentlyViewed() {
    try {
      const parsed = JSON.parse(root.localStorage?.getItem(RECENTLY_VIEWED_KEY) || '[]');
      if (!Array.isArray(parsed)) return [];
      return [...new Set(parsed.filter(id => typeof id === 'string' && /^[\w-]{1,120}$/.test(id)))].slice(0, RECENTLY_VIEWED_LIMIT);
    } catch { return []; }
  }
  function rememberRecentlyViewed(productId) {
    const id = String(productId || '').trim();
    if (!id || !/^[\w-]{1,120}$/.test(id)) return readRecentlyViewed();
    const ids = [id, ...readRecentlyViewed().filter(value => value !== id)].slice(0, RECENTLY_VIEWED_LIMIT);
    try { root.localStorage?.setItem(RECENTLY_VIEWED_KEY, JSON.stringify(ids)); } catch { /* Recent history is optional. */ }
    root.dispatchEvent?.(new CustomEvent('crocs:recently-viewed', { detail: { ids } }));
    return ids;
  }
  function clearRecentlyViewed() {
    try { root.localStorage?.removeItem(RECENTLY_VIEWED_KEY); } catch { /* Recent history is optional. */ }
    root.dispatchEvent?.(new CustomEvent('crocs:recently-viewed', { detail: { ids: [] } }));
  }
  function resolveLine(product, line) {
    const variants = variantsFor(product);
    if (Array.isArray(product.variants) && product.variants.length) {
      let variant = line.variantId ? variants.find(v => v.id === line.variantId) : null;
      if (!variant && line.size) {
        const matching = variants.filter(v => variantSize(product, v) === String(line.size) || Object.values(v.values || {}).map(String).includes(String(line.size)));
        if (matching.length === 1) variant = matching[0];
      }
      if (!variant) throw new Error(`Choose a valid option for ${product.title}.`);
      return { variant, variantId: variant.id, size: variantSize(product, variant), price: variant.price, stock: variant.stock, title: variantTitle(product, variant) };
    }
    const size = String(line.size || '');
    if (!sizesFor(product).includes(size)) throw new Error(`Choose a valid size for ${product.title}.`);
    return { variant: null, variantId: '', size, price: product.price, stock: product.stock, title: '' };
  }
  function validateLines(lines, products = catalog) {
    if (!Array.isArray(lines) || !lines.length || lines.length > 20) throw new Error('Add a product to your bag first.');
    const quantities = new Map(), seen = new Set();
    const result = lines.map(l => {
      const product = products.find(p => p.id === l.productId && p.status === 'Active');
      if (!product) throw new Error('A product is no longer available. Remove it from your bag.');
      if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 10) throw new Error('Choose a quantity from 1 to 10.');
      const resolved = resolveLine(product, l);
      const key = `${product.id}:${resolved.variantId || resolved.size}`;
      if (seen.has(key)) throw new Error('Duplicate bag item.');
      seen.add(key);
      quantities.set(key, (quantities.get(key) || 0) + l.quantity);
      return { ...l, variantId: resolved.variantId, size: resolved.size, variant: resolved.variant, variantTitle: resolved.title, product, total: resolved.price * l.quantity, unitPrice: resolved.price, stock: resolved.stock };
    });
    for (const [key, quantity] of quantities) {
      const [productId, variantIdOrSize] = key.split(':');
      const line = result.find(item => item.product.id === productId && (item.variantId || item.size) === variantIdOrSize);
      if (line && quantity > line.stock) throw new Error(`Not enough stock for ${line.product.title}${line.variantTitle ? ` (${line.variantTitle})` : ''}. Reduce the quantity.`);
    }
    if (result.reduce((n, l) => n + l.quantity, 0) > 20) throw new Error('The demo bag is limited to 20 items.');
    return result;
  }
  function add(productId, selection, quantity = 1) {
    const product = catalog.find(p => p.id === productId);
    if (!product) throw new Error('This product is no longer available.');
    const requested = typeof selection === 'object' ? selection : { variantId: Array.isArray(product.variants) && product.variants.some(v => v.id === selection) ? selection : '', size: String(selection ?? '') };
    const resolved = resolveLine(product, requested);
    const lines = readCart();
    const line = lines.find(l => l.productId === productId && (resolved.variantId ? l.variantId === resolved.variantId : l.size === resolved.size));
    if (line) line.quantity += quantity;
    else lines.push({ productId, variantId: resolved.variantId, size: resolved.size, quantity });
    validateLines(lines); return saveCart(lines);
  }
  function update(productId, size, quantity, variantId = '') {
    const lines = readCart();
    const index = lines.findIndex(line => line.productId === productId && (variantId ? line.variantId === variantId : (line.variantId ? line.variantId === size : line.size === size)));
    if (index < 0) return;
    if (quantity === 0) lines.splice(index, 1);
    else {
      const updated = lines.map((line, lineIndex) => lineIndex === index ? { ...line, quantity } : line);
      validateLines(updated);
      if (updated.reduce((n, l) => n + l.quantity, 0) > 20) throw new Error('The demo bag is limited to 20 items.');
      lines[index].quantity = quantity;
    }
    return saveCart(lines);
  }
  const shippingCost = (subtotal, method) => {
    if (!['standard','express'].includes(method)) throw new Error('Choose a delivery option.');
    const express = regional?.convert ? regional.convert(599) : 599;
    const freeThreshold = regional?.convert ? regional.convert(5000) : 5000;
    const standard = regional?.convert ? regional.convert(399) : 399;
    return method === 'express' ? express : subtotal >= freeThreshold ? 0 : standard;
  };
  function quote(lines, method = 'standard', products = catalog) {
    const items = validateLines(lines, products);
    const subtotal = items.reduce((sum,l) => sum + l.total, 0);
    const shipping = shippingCost(subtotal, method);
    return { items, subtotal, shipping, total: subtotal + shipping };
  }
  async function storefrontApi(params = {}) {
    if (root.location?.protocol === 'file:') throw new Error('Storefront API is unavailable in a local file preview.');
    const query = new URLSearchParams(Object.entries(params).filter(([, value]) => value !== undefined && value !== null && value !== ''));
    const response = await fetch(`${STOREFRONT_API_PATH}?${query}`, {
      headers: { Accept: 'application/json' }, cache: 'default', signal: AbortSignal.timeout(12000),
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok) throw Object.assign(new Error(value.error || 'The storefront catalogue is unavailable.'), { status: response.status });
    return value;
  }
  async function loadCatalogPage(options = {}) {
    const data = await storefrontApi({
      view: 'list', limit: Math.min(24, Math.max(1, Number(options.limit) || 24)),
      query: options.query || '', collection: options.collection || '', sort: options.sort || 'featured',
      price: options.price || 'all', cursor: options.cursor || '', region: regional?.region?.id || '',
      category: Array.isArray(options.category) ? options.category.join(',') : options.category || '',
      type: Array.isArray(options.type) ? options.type.join(',') : options.type || '',
      audience: Array.isArray(options.audience) ? options.audience.join(',') : options.audience || '',
      occasion: Array.isArray(options.occasion) ? options.occasion.join(',') : options.occasion || '',
      size: Array.isArray(options.size) ? options.size.join(',') : options.size || '',
      color: Array.isArray(options.color) ? options.color.join(',') : options.color || '',
    });
    const localization = { ...(data.store?.localization || {}), ...(data.localization || {}) };
    const normalizedProducts = (Array.isArray(data.products) ? data.products : []).filter(item => item?.status === 'Active').map(item => localizeProduct(normalize(item)));
    return { ...data, products: normalizedProducts, localization };
  }
  async function rpc(name, payload) {
    const config = root.CrocsSupabaseConfig;
    if (!config?.url || !config?.publishableKey) throw new Error('The store is not connected. Please try again later.');
    const response = await fetch(`${config.url}/rest/v1/rpc/${name}`, {
      method: 'POST', headers: { apikey: config.publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload), signal: AbortSignal.timeout(15000)
    });
    const json = await response.json();
    if (!response.ok) throw new Error(json.message || 'The store could not process this request.');
    return json;
  }
  async function setCatalog(data, nextSource = 'supabase') {
    if (!Array.isArray(data?.products)) throw new Error('The catalogue is unavailable.');
    // The public RPC intentionally keeps the home response light.  Merge the
    // generated 1688 presentation mirror for titles and copy so a pending
    // storefront detail migration cannot expose the raw supplier wording.
    if (nextSource !== 'static') {
      try {
        const staticData = await loadStaticSummary();
        const mirror = new Map((staticData.products || []).map(product => [product.id, product]));
        data = { ...data, products: data.products.map(product => {
          const local = mirror.get(product.id);
          if (!local) return product;
          return {
            ...product,
            title: local.title || product.title,
            imageAlt: local.imageAlt || product.imageAlt,
            slug: local.slug || product.slug,
            description: local.description || product.description,
            videos: local.videos?.length ? local.videos : product.videos,
            seo: local.seo || product.seo,
          };
        }) };
      } catch { /* The live catalog remains usable when the mirror is unavailable. */ }
    }
    const localization = { ...(data.store?.localization || {}), ...(data.localization || {}), currency: data.localization?.currency || data.store?.currency || data.settings?.currency };
    // Do not hold the first paint behind the optional geo lookup. The regional
    // module swaps prices/copy when its promise settles, while the catalog can
    // render immediately with the configured default region.
    if (regional?.configure) regional.configure(localization).catch(() => {});
    catalog = localizeCatalog(data.products.filter(p => p.status === 'Active').map(normalize));
    source = nextSource;
    problem = nextSource === 'cache' ? 'Showing a recent catalogue while we check live availability.' : '';
    root.dispatchEvent?.(new CustomEvent('crocs:catalog', { detail: { ...data, products: catalog, localization } }));
  }
  function readCatalogCache() {
    try {
      const cached = JSON.parse(root.sessionStorage?.getItem(CATALOG_CACHE_KEY) || 'null');
      if (!cached?.data || Date.now() - Number(cached.savedAt) > CATALOG_CACHE_TTL) return null;
      return cached.data;
    } catch { return null; }
  }
  function saveCatalogCache(data) {
    try { root.sessionStorage?.setItem(CATALOG_CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data })); } catch { /* Cache is optional. */ }
  }
  async function loadCatalog() {
    const cached = readCatalogCache();
    if (cached) {
      try { await setCatalog(cached, 'cache'); } catch { /* Ignore an invalid stale cache. */ }
    }
    try {
      // The edge endpoint returns only the first page needed for the home
      // shell. It keeps the browser from downloading a 600KB+ catalog before
      // the shopper has even opened Shop. RPC/static mirrors remain resilient
      // fallbacks for local previews and degraded networks.
      const data = await loadCatalogPage({ limit: 48 });
      await setCatalog(data, 'storefront-api');
      saveCatalogCache(data);
    } catch {
      try {
        const data = await rpc('storefront_catalog_v1', {});
        await setCatalog(data, 'supabase');
        saveCatalogCache(data);
      } catch {
        try {
          const staticData = await loadStaticSummary();
          await setCatalog(staticData, 'static');
          saveCatalogCache(staticData);
        } catch {
          if (!cached) {
            source = 'sample'; problem = 'Preview catalogue — live availability will be checked at checkout.';
            catalog = localizeCatalog(catalog);
            root.dispatchEvent?.(new CustomEvent('crocs:catalog', { detail: { products: catalog, localization: regional?.config || {} } }));
          }
        }
      }
    }
    return catalog;
  }
  const detailRequests = new Map();
  function hydrateProduct(payload) {
    const value = Array.isArray(payload) ? payload[0] : (payload || {});
    if (!value?.id || value.status !== 'Active') throw new Error('This product is not available right now.');
    const detail = localizeProduct(normalize({ ...value, _detailLoaded: true }));
    const index = catalog.findIndex(item => item.id === detail.id);
    if (index >= 0) catalog[index] = detail; else catalog.push(detail);
    return detail;
  }
  async function loadProduct(id) {
    const productId = String(id || '').trim();
    if (!productId) throw new Error('The product reference is invalid.');
    const current = catalog.find(item => item.id === productId);
    if (current?._detailLoaded) return current;
    if (detailRequests.has(productId)) return detailRequests.get(productId);
    const applyDetail = hydrateProduct;
    const hydrateFromLive = payload => rpc('storefront_product_v1', { p_product_id: productId }).then(async livePayload => {
      payload = livePayload;
      const value = Array.isArray(payload) ? payload[0] : (payload || {});
      try {
        const mirror = await loadStaticProduct(productId);
        // Keep live price/stock/variant rows authoritative while taking the
        // verified localized presentation and detail media from the mirror.
        const mergeMedia = (left, right) => [...new Set([...(Array.isArray(left) ? left : []), ...(Array.isArray(right) ? right : [])])];
        const mergeMap = (left, right) => Object.fromEntries(Object.entries({ ...(left && typeof left === 'object' ? left : {}), ...(right && typeof right === 'object' ? right : {}) }).map(([key, values]) => [key, values && typeof values === 'object' && !Array.isArray(values) ? { ...(left?.[key] || {}), ...values } : values]));
        return applyDetail({
          ...mirror,
          ...value,
          title: mirror.title || value.title,
          imageAlt: mirror.imageAlt || value.imageAlt,
          slug: mirror.slug || value.slug,
          description: mirror.description || value.description,
          descriptionHtml: mirror.descriptionHtml || value.descriptionHtml,
          detailImages: mergeMedia(value.detailImages, mirror.detailImages),
          videos: mergeMedia(value.videos, mirror.videos),
          gallery: mergeMedia(value.gallery, mirror.gallery),
          optionImages: mergeMap(value.optionImages, mirror.optionImages),
          variantImages: mergeMap(value.variantImages, mirror.variantImages),
          attributes: mergeMedia(value.attributes, mirror.attributes),
          options: mirror.options?.length ? mirror.options : value.options,
          seo: mirror.seo || value.seo,
        });
      } catch { return applyDetail(payload); }
    });
    const request = storefrontApi({ view: 'product', id: productId }).then(applyDetail).catch(async apiError => {
      try { return await hydrateFromLive(); } catch { /* Continue to the static mirror below. */ }
      throw apiError;
    }).catch(async error => {
      if (error?.status === 404) throw error;
      try { return applyDetail(await loadStaticProduct(productId)); } catch { throw error; }
    }).finally(() => detailRequests.delete(productId));
    detailRequests.set(productId, request);
    return request;
  }
  async function loadProducts(ids) {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).map(id => String(id || '').trim()).filter(Boolean))];
    return Promise.all(unique.map(loadProduct));
  }
  async function loadRecentlyViewedProducts(ids = readRecentlyViewed()) {
    const unique = [...new Set((Array.isArray(ids) ? ids : []).filter(id => typeof id === 'string' && /^[\w-]{1,120}$/.test(id)))].slice(0, RECENTLY_VIEWED_LIMIT);
    if (!unique.length) return [];
    try {
      const data = await storefrontApi({ view: 'recent', ids: unique.join(','), region: regional?.region?.id || '' });
      if (!Array.isArray(data.products)) throw new Error('Recent products are unavailable.');
      const rows = data.products.filter(item => unique.includes(item?.id) && item.status === 'Active').map(item => localizeProduct(normalize(item)));
      const byId = new Map(rows.map(item => [item.id, item]));
      return unique.map(id => byId.get(id)).filter(Boolean);
    } catch {
      // Static previews and temporary outages retain independent fallbacks:
      // one deleted product must not discard all the other history cards.
      const results = await Promise.allSettled(unique.map(loadProduct));
      return results.filter(result => result.status === 'fulfilled' && result.value?.status === 'Active').map(result => result.value);
    }
  }
  async function ensureCartProducts(lines = readCart()) {
    const missing = (Array.isArray(lines) ? lines : [])
      .filter(line => !catalog.find(item => item.id === line.productId)?._detailLoaded)
      .map(line => line.productId);
    if (missing.length) await loadProducts(missing);
    return catalog;
  }
  root.addEventListener?.('crocs:region-change', () => {
    catalog = localizeCatalog(catalog);
    root.dispatchEvent?.(new CustomEvent('crocs:catalog', { detail: { products: catalog, localization: regional?.config || {} } }));
  });
  root.addEventListener?.('storage', event => {
    if (event.key === CART_KEY || event.key === null) root.dispatchEvent?.(new Event('crocs:bag'));
    if (event.key === RECENTLY_VIEWED_KEY || event.key === null) root.dispatchEvent?.(new CustomEvent('crocs:recently-viewed', { detail: { ids: readRecentlyViewed() } }));
  });
  const api = { CART_KEY, RECENTLY_VIEWED_KEY, CATALOG_CACHE_KEY, money, escape, image, video, enhanceImage, enhanceImages, sizesFor, optionsFor, variantsFor, variantFor, variantTitle, variantSize, normalize, hydrateProduct, localizeProduct, localizeCatalog, seeds, readCart, saveCart, readRecentlyViewed, rememberRecentlyViewed, clearRecentlyViewed, loadRecentlyViewedProducts, validateLines, add, update, quote, shippingCost, rpc, storefrontApi, loadCatalogPage, loadCatalog, loadProduct, loadProducts, ensureCartProducts, t: (...args) => regional?.t?.(...args) || args[1] || args[0], get region() { return regional?.region || null; }, get language() { return regional?.language || 'en'; }, get currency() { return regional?.region?.currency || 'USD'; },
    product: id => catalog.find(p => p.id === id), get products() { return catalog; }, get source() { return source; }, get problem() { return problem; } };
  api.variantOptions = variantOptions;
  api.ready = root.document ? loadCatalog() : Promise.resolve(catalog);
  return api;
});
