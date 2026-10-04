(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrocsCommerce = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
  'use strict';
  const CART_KEY = 'crocs-bag-v2';
  const money = cents => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(cents / 100);
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const image = value => /^(assets\/[\w.-]+\.(png|jpe?g|webp|svg)|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(value) ? value : 'assets/arrival-classic-clog-100.png';
  const colourNames = { p1: 'White', p2: 'Lilac', p3: 'Multi', p4: 'Black', p5: 'Black', p6: 'Pink', p7: 'Espresso', p8: 'Multi' };
  function sizesFor(p) {
    return Array.isArray(p.sizes) && p.sizes.length ? p.sizes.map(String) : p.category === 'Accessories' ? ['One size'] : p.category === 'Kids' ? ['1','2','3','4','5','6'] : ['3','4','5','6','7','8','9','10','11','12'];
  }
  function normalize(p) {
    if (!p || typeof p.id !== 'string' || !p.title || !Number.isSafeInteger(p.price) || p.price < 0 || !Number.isSafeInteger(p.stock) || p.stock < 0) throw new Error('Invalid product data.');
    return { ...p, image: image(p.image), colour: p.colour || colourNames[p.id] || 'As pictured', sizes: sizesFor(p) };
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
        if (!l || typeof l.productId !== 'string' || typeof l.size !== 'string' || l.size.length > 20 || !Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 10) return false;
        const key = `${l.productId}:${l.size}`;
        if (unique.has(key)) return false;
        unique.add(key); return true;
      }).map(({ productId,size,quantity }) => ({ productId,size,quantity }));
    } catch { problem = 'Your browser could not read the bag. Please allow local storage.'; return []; }
  }
  function saveCart(lines) {
    try { root.localStorage.setItem(CART_KEY, JSON.stringify(lines)); }
    catch { throw new Error('Your bag could not be saved. Please allow browser storage and try again.'); }
    root.dispatchEvent?.(new Event('crocs:bag'));
    return lines;
  }
  function validateLines(lines, products = catalog) {
    if (!Array.isArray(lines) || !lines.length || lines.length > 20) throw new Error('Add a product to your bag first.');
    const totals = new Map(), seen = new Set();
    const result = lines.map(l => {
      const p = products.find(p => p.id === l.productId && p.status === 'Active');
      if (!p) throw new Error('A product is no longer available. Remove it from your bag.');
      if (!sizesFor(p).includes(String(l.size))) throw new Error(`Choose a valid size for ${p.title}.`);
      if (!Number.isInteger(l.quantity) || l.quantity < 1 || l.quantity > 10) throw new Error('Choose a quantity from 1 to 10.');
      const key = `${p.id}:${l.size}`;
      if (seen.has(key)) throw new Error('Duplicate bag item.');
      seen.add(key);
      totals.set(p.id, (totals.get(p.id) || 0) + l.quantity);
      return { ...l, product: p, total: p.price * l.quantity };
    });
    for (const [id,qty] of totals) if (qty > products.find(p => p.id === id).stock) throw new Error(`Not enough stock for ${products.find(p => p.id === id).title}. Reduce the quantity.`);
    if (result.reduce((n,l) => n + l.quantity, 0) > 20) throw new Error('The demo bag is limited to 20 items.');
    return result;
  }
  function add(productId, size, quantity = 1) {
    const lines = readCart();
    const line = lines.find(l => l.productId === productId && l.size === size);
    if (line) line.quantity += quantity; else lines.push({ productId,size,quantity });
    validateLines(lines); return saveCart(lines);
  }
  function update(productId, size, quantity) {
    const lines = readCart();
    const index = lines.findIndex(l => l.productId === productId && l.size === size);
    if (index < 0) return;
    if (quantity === 0) lines.splice(index, 1);
    else {
      // Validate this product independently so unavailable *other* lines can be removed too.
      const relevant = lines.filter(l => l.productId === productId).map(l => ({ ...l, quantity: l.size === size ? quantity : l.quantity }));
      validateLines(relevant);
      if (lines.reduce((n,l) => n + l.quantity, 0) - lines[index].quantity + quantity > 20) throw new Error('The demo bag is limited to 20 items.');
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
  async function loadCatalog() {
    try {
      const data = await rpc('storefront_catalog_v1', {});
      if (!Array.isArray(data?.products)) throw new Error('The catalogue is unavailable.');
      catalog = data.products.filter(p => p.status === 'Active').map(normalize);
      source = 'supabase'; problem = '';
      root.dispatchEvent?.(new CustomEvent('crocs:catalog', { detail: data }));
    } catch { source = 'sample'; problem = 'Preview catalogue — live availability will be checked at checkout.'; }
    return catalog;
  }
  root.addEventListener?.('storage', event => { if (event.key === CART_KEY) root.dispatchEvent(new Event('crocs:bag')); });
  const api = { CART_KEY, money, escape, image, sizesFor, normalize, seeds, readCart, saveCart, validateLines, add, update, quote, shippingCost, rpc, loadCatalog,
    product: id => catalog.find(p => p.id === id), get products() { return catalog; }, get source() { return source; }, get problem() { return problem; } };
  api.ready = root.document ? loadCatalog() : Promise.resolve(catalog);
  return api;
});
