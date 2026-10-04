(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrocsCommerce = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
  'use strict';
  const CART_KEY = 'crocs-bag-v2';
  const CATALOG_CACHE_KEY = 'crocs-catalog-v1';
  const CATALOG_CACHE_TTL = 60 * 1000;
  const money = cents => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(cents / 100);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const image = value => /^(assets\/[\w.-]+\.(png|jpe?g|webp|svg)|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(value) ? value : 'assets/arrival-classic-clog-100.png';
  const colourNames = { p1: 'White', p2: 'Lilac', p3: 'Multi', p4: 'Black', p5: 'Black', p6: 'Pink', p7: 'Espresso', p8: 'Multi' };
  const optionsFor = p => Array.isArray(p?.options) ? p.options : [];
  const variantsFor = p => Array.isArray(p?.variants) ? p.variants.filter(v => v && v.enabled !== false) : [];
  const sizeOption = p => optionsFor(p).find(o => /size|maat|number/i.test(`${o.id} ${o.name}`));
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
    if (!p || typeof p.id !== 'string' || !p.title || !Number.isSafeInteger(p.price) || p.price < 0 || !Number.isSafeInteger(p.stock) || p.stock < 0) throw new Error('Invalid product data.');
    const variants = Array.isArray(p.variants) ? p.variants.map(v => ({ ...v, price: Number.isSafeInteger(v.price) ? v.price : p.price, stock: Number.isSafeInteger(v.stock) ? v.stock : 0, enabled: v.enabled !== false })).filter(v => v.id) : [];
    const active = variants.filter(v => v.enabled);
    const normalized = { ...p, image: image(p.image), imageAlt: p.imageAlt || p.title, brand: p.brand || 'Crocs', slug: p.slug || '', seo: { title: '', description: '', noindex: false, ...(p.seo || {}) }, options: optionsFor(p), variants };
    return { ...normalized, price: active.length ? Math.min(...active.map(v => v.price)) : variants.length ? 0 : p.price, stock: variants.length ? active.reduce((n, v) => n + v.stock, 0) : p.stock, colour: p.colour || colourNames[p.id] || 'As pictured', sizes: sizesFor(normalized) };
  }
  const seeds = [
    ['p1','Classic Clog','10001-100',3499,8,'arrival-classic-clog-100.png','Clogs'],
    ['p2','Crocband™ Runner','20598-5AD',5999,64,'arrival-crocband-runner-5AD.png','Clogs'],
    ['p4','Classic Platform Bloom','206750-001',6499,5,'arrival-platform-bloom-001.png','Platforms'],
    ['p5','Getaway Strappy','209587-001',2799,42,'arrival-getaway-001.png','Sandals'],
    ['p6','Classic Ballet','210260-6UR',3499,27,'arrival-ballet-6UR.png','Flats'],
    ['p7','Classic Lined Clog','203591-206',4999,12,'icon-lined-206.png','Clogs']
  ].map(([id,title,sku,price,stock,img,category]) => normalize({ id,title,sku,price,stock,image:`assets/${img}`,category,status:'Active',description:'Lightweight comfort. Made for everyday adventures.' }));
  let catalog = seeds, source = 'sample', problem = '';
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
    return method === 'express' ? 599 : subtotal >= 5000 ? 0 : 399;
  };
  function quote(lines, method = 'standard', products = catalog) {
    const items = validateLines(lines, products);
    const subtotal = items.reduce((sum,l) => sum + l.total, 0);
    const shipping = shippingCost(subtotal, method);
    return { items, subtotal, shipping, total: subtotal + shipping };
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
  function setCatalog(data, nextSource = 'supabase') {
    if (!Array.isArray(data?.products)) throw new Error('The catalogue is unavailable.');
    catalog = data.products.filter(p => p.status === 'Active').map(normalize);
    source = nextSource;
    problem = nextSource === 'cache' ? 'Showing a recent catalogue while we check live availability.' : '';
    root.dispatchEvent?.(new CustomEvent('crocs:catalog', { detail: data }));
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
      try { setCatalog(cached, 'cache'); } catch { /* Ignore an invalid stale cache. */ }
    }
    try {
      const data = await rpc('storefront_catalog_v1', {});
      setCatalog(data, 'supabase');
      saveCatalogCache(data);
    } catch {
      if (!cached) { source = 'sample'; problem = 'Preview catalogue — live availability will be checked at checkout.'; }
    }
    return catalog;
  }
  root.addEventListener?.('storage', event => { if (event.key === CART_KEY) root.dispatchEvent(new Event('crocs:bag')); });
  const api = { CART_KEY, CATALOG_CACHE_KEY, money, escape, image, sizesFor, optionsFor, variantsFor, variantFor, variantTitle, variantSize, normalize, seeds, readCart, saveCart, validateLines, add, update, quote, shippingCost, rpc, loadCatalog,
    product: id => catalog.find(p => p.id === id), get products() { return catalog; }, get source() { return source; }, get problem() { return problem; } };
  api.ready = root.document ? loadCatalog() : Promise.resolve(catalog);
  return api;
});
