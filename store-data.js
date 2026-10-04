(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrocsStore = api;
})(typeof window === 'undefined' ? globalThis : window, function (root) {
  'use strict';
  const KEY = 'crocs-studio-v1';
  const clone = value => JSON.parse(JSON.stringify(value));
  const id = prefix => `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  const money = cents => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(cents / 100);
  const safeLink = value => /^(#[a-zA-Z][\w-]*|https?:\/\/[^\s]+|index\.html(?:#[\w-]+)?)$/.test(value);
  const safeImage = value => /^(assets\/[\w.-]+\.(png|jpe?g|webp|svg)|data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+)$/.test(value);
  function seed() {
    const date = days => new Date(Date.now() - days * 86400000).toISOString();
    const rows = [
      ['p1', 'Classic Clog', '10001-100', 3499, 8, 'Active', 'arrival-classic-clog-100.png', 'Clogs'],
      ['p2', 'Crocband™ Runner', '20598-5AD', 5999, 64, 'Active', 'arrival-crocband-runner-5AD.png', 'Clogs'],
      ['p3', 'Kids’ Classic Clog', '206991-0DA', 3999, 32, 'Draft', 'arrival-kids-classic-0DA.png', 'Kids'],
      ['p4', 'Classic Platform Bloom', '206750-001', 6499, 5, 'Active', 'arrival-platform-bloom-001.png', 'Platforms'],
      ['p5', 'Getaway Strappy', '209587-001', 2799, 42, 'Active', 'arrival-getaway-001.png', 'Sandals'],
      ['p6', 'Classic Ballet', '210260-6UR', 3499, 27, 'Active', 'arrival-ballet-6UR.png', 'Flats'],
      ['p7', 'Classic Lined Clog', '203591-206', 4999, 12, 'Active', 'icon-lined-206.png', 'Clogs'],
      ['p8', 'Sporty Shoe Tattoos', '100152-90H', 999, 0, 'Draft', 'jibbitz-sporty-90H.png', 'Accessories'],
    ];
    const products = rows.map(([id, title, sku, price, stock, status, image, category]) => ({ id, title, sku, price, stock, status, image: `assets/${image}`, imageAlt: `${title} product image`, brand: 'Crocs', category, description: 'Lightweight comfort. Made for everyday adventures.', tags: ['Crocs'], slug: title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''), seo: { title: '', description: '', noindex: false }, options: [], variants: [], updatedAt: date(0) }));
    const customers = [['c1', 'Olivia Grant', 'olivia@example.com', 'London'], ['c2', 'Noah Williams', 'noah@example.com', 'Manchester'], ['c3', 'Amelia Brown', 'amelia@example.com', 'Bristol'], ['c4', 'Charlie Evans', 'charlie@example.com', 'Leeds']].map(([id, name, email, city]) => ({ id, name, email, city, phone: '', note: 'Khách hàng mẫu để trải nghiệm quản trị.', marketing: false, createdAt: date(10) }));
    const orders = Array.from({ length: 18 }, (_, i) => {
      const product = products[i % 7];
      return { id: `o${i + 1}`, number: 1048 - i, customerId: customers[i % 4].id, customerName: customers[i % 4].name, customerEmail: customers[i % 4].email, createdAt: date(Math.floor(i / 2)), payment: i % 6 === 2 ? 'pending' : i % 9 === 8 ? 'refunded' : 'paid', fulfillment: i < 5 ? 'unfulfilled' : 'fulfilled', items: [{ productId: product.id, title: product.title, price: product.price, quantity: i % 3 + 1, image: product.image }], shipping: 0, note: 'Đơn hàng minh họa, không phải giao dịch thật.', stockReserved: true, channel: 'Online store' };
    });
    const theme = { name: 'Cozy Favourites', accent: '#84bd00', background: '#f7f5f8', heroTitle: 'Cozy Favourites', heroSubtitle: 'McKenna Grace in the Unfurgettable Clog', heroButton: 'Shop the Collection', campaign: 'cozy', announcement: 'Jibbitz™ Only • Spend £25, Get £5 Off. Spend £50, Get £15 Off', showClassics: true, showArrivals: true, showCollabs: true, showClub: true, collectionId: 'col1' };
    return { version: 1, products, customers, orders,
      collections: [{ id: 'col1', title: 'New arrivals', description: 'The latest comfort icons.', productIds: ['p1', 'p2', 'p4', 'p5', 'p6', 'p7'], status: 'Active' }, { id: 'col2', title: 'Cozy favourites', description: 'Made for colder days.', productIds: ['p1', 'p7'], status: 'Active' }, { id: 'col3', title: 'Little adventures', description: 'Big comfort for little feet.', productIds: ['p3'], status: 'Draft' }],
      menus: [{ id: 'main', title: 'Main menu', items: [{ id: 'm1', label: 'Sale', url: '#new-arrivals' }, { id: 'm2', label: 'Women', url: '#shop' }, { id: 'm3', label: 'Men', url: '#shop' }, { id: 'm4', label: 'Kids', url: '#shop' }, { id: 'm5', label: 'Jibbitz™ Charms', url: '#jibbitz' }, { id: 'm6', label: 'Crocs at Work™', url: '#shop' }, { id: 'm7', label: 'Bags & Accessories', url: '#shop' }, { id: 'm8', label: 'HeyDude', url: '#collabs' }] }, { id: 'footer', title: 'Footer menu', items: [{ id: 'f1', label: 'Privacy policy', url: '#footer' }, { id: 'f2', label: 'Terms of use', url: '#footer' }, { id: 'f3', label: 'United Kingdom', url: '#footer' }] }],
      theme: { draft: clone(theme), published: clone(theme), publishedAt: date(0) },
      settings: { name: 'Crocs UK', email: 'hello@example.com', currency: 'GBP', timezone: 'Europe/London', mainMenuId: 'main', footerMenuId: 'footer', stockThreshold: 10, payment: { provider: 'stripe', enabled: false, mode: 'test', methods: 'automatic' } },
      campaigns: [{ id: 'camp1', title: 'Cozy Favourites', channel: 'Email', status: 'Draft', subject: 'A softer side of comfort', content: 'Discover the new Cozy Favourites collection.', date: '' }],
      activity: [{ id: 'a1', title: 'Đã khởi tạo cửa hàng mẫu', detail: 'Mọi số liệu là dữ liệu minh họa cục bộ.', createdAt: date(0) }],
    };
  }
  function validate(data) {
    if (!data || data.version !== 1 || !['products', 'customers', 'orders', 'collections', 'menus', 'campaigns', 'activity'].every(key => Array.isArray(data[key]))) throw new Error('Tệp không đúng định dạng Crocs Studio v1.');
    for (const key of ['products', 'customers', 'orders', 'collections', 'menus', 'campaigns']) {
      const ids = data[key].map(item => item.id);
      if (ids.some(value => typeof value !== 'string' || !value) || new Set(ids).size !== ids.length) throw new Error(`Mã ${key} không hợp lệ hoặc bị trùng.`);
    }
    data.products.forEach(p => {
      // Backwards-compatible defaults for v1 records created before the
      // variant/SEO editor was introduced.
      p.options ||= [];
      p.variants ||= [];
      p.seo = { title: '', description: '', noindex: false, ...(p.seo || {}) };
      p.brand ||= 'Crocs';
      p.imageAlt ||= `${p.title} product image`;
      if (!p.slug) p.slug = p.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
      if (!p.title?.trim() || !p.sku?.trim() || !Number.isSafeInteger(p.price) || p.price < 0 || !Number.isSafeInteger(p.stock) || p.stock < 0 || !['Active', 'Draft', 'Archived'].includes(p.status) || !safeImage(p.image)) throw new Error('Sản phẩm cần tên, SKU, ảnh, giá và tồn kho hợp lệ.');
      if (typeof p.brand !== 'string' || typeof p.imageAlt !== 'string' || typeof p.slug !== 'string' || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(p.slug) || typeof p.seo.title !== 'string' || typeof p.seo.description !== 'string' || typeof p.seo.noindex !== 'boolean') throw new Error('Thông tin thương hiệu hoặc SEO sản phẩm không hợp lệ.');
      if (!Array.isArray(p.options) || p.options.length > 3 || !Array.isArray(p.variants) || p.variants.length > 100 || (p.variants.length > 0 && p.options.length === 0)) throw new Error('Thuộc tính hoặc biến thể sản phẩm không hợp lệ.');
      const optionIds = new Set(p.options.map(o => o.id));
      const optionNames = new Set(p.options.map(o => String(o.name || '').trim().toLowerCase()));
      if (optionIds.size !== p.options.length || optionNames.size !== p.options.length || p.options.some(o => !/^[a-zA-Z0-9_-]+$/.test(o.id) || !o.name || !Array.isArray(o.values) || !o.values.length || new Set(o.values.map(v => String(v).toLowerCase())).size !== o.values.length)) throw new Error('Thuộc tính sản phẩm không hợp lệ.');
      const variantIds = new Set(), variantSkus = new Set([p.sku.toLowerCase()]), combinations = new Set();
      p.variants.forEach(v => {
        if (!v.id || variantIds.has(v.id) || !v.sku?.trim() || variantSkus.has(v.sku.toLowerCase()) || !v.values || Object.keys(v.values).length !== p.options.length || p.options.some(o => !o.values.includes(v.values[o.id])) || !Number.isSafeInteger(v.price) || v.price < 0 || (v.compareAt != null && (!Number.isSafeInteger(v.compareAt) || v.compareAt <= v.price)) || (v.cost != null && (!Number.isSafeInteger(v.cost) || v.cost < 0)) || !Number.isSafeInteger(v.stock) || v.stock < 0 || typeof v.enabled !== 'boolean') throw new Error('Biến thể sản phẩm không hợp lệ.');
        const combination = p.options.map(o => `${o.id}:${String(v.values[o.id]).toLowerCase()}`).join('|');
        if (combinations.has(combination)) throw new Error('Tổ hợp biến thể bị trùng.');
        variantIds.add(v.id); variantSkus.add(v.sku.toLowerCase()); combinations.add(combination);
      });
      if (p.variants.length) {
        const enabled = p.variants.filter(v => v.enabled);
        const expectedPrice = enabled.length ? Math.min(...enabled.map(v => v.price)) : 0;
        const expectedStock = enabled.reduce((sum, v) => sum + v.stock, 0);
        if (p.price !== expectedPrice || p.stock !== expectedStock) throw new Error('Giá và tồn tổng phải khớp với biến thể đang bật.');
      }
    });
    const allSkus = data.products.flatMap(p => [p.sku, ...(p.variants || []).map(v => v.sku)]).map(sku => String(sku).toLowerCase());
    if (new Set(allSkus).size !== allSkus.length) throw new Error('SKU đã tồn tại. Hãy dùng mã khác.');
    const slugs = data.products.map(p => p.slug).filter(Boolean);
    if (new Set(slugs).size !== slugs.length) throw new Error('Đường dẫn sản phẩm bị trùng.');
    data.customers.forEach(c => { if (!c.name?.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)) throw new Error('Tên hoặc email khách hàng không hợp lệ.'); });
    data.collections.forEach(c => { if (!c.title?.trim() || !['Active', 'Draft'].includes(c.status) || !Array.isArray(c.productIds) || c.productIds.some(pid => !data.products.some(p => p.id === pid))) throw new Error('Bộ sưu tập không hợp lệ.'); });
    data.menus.forEach(m => { if (!m.title?.trim() || !Array.isArray(m.items) || m.items.some(item => !item.label?.trim() || !safeLink(item.url))) throw new Error('Menu cần tên và liên kết hợp lệ (#section hoặc https://…).'); });
    data.orders.forEach(o => {
      if (!['paid', 'pending', 'refunded'].includes(o.payment) || !['unfulfilled', 'fulfilled', 'cancelled'].includes(o.fulfillment) || !Array.isArray(o.items) || !o.items.length || !Number.isFinite(Date.parse(o.createdAt)) || !Number.isSafeInteger(o.shipping) || o.shipping < 0 || o.items.some(item => !Number.isSafeInteger(item.quantity) || item.quantity < 1 || !Number.isSafeInteger(item.price) || item.price < 0)) throw new Error('Đơn hàng không hợp lệ.');
    });
    for (const theme of [data.theme?.draft, data.theme?.published]) {
      if (!theme || !/^#[\da-f]{6}$/i.test(theme.accent) || !/^#[\da-f]{6}$/i.test(theme.background) || !theme.heroTitle?.trim() || !theme.heroButton?.trim() || !['cozy', 'crocband', 'ninjago'].includes(theme.campaign)) throw new Error('Cấu hình theme không hợp lệ.');
    }
    data.settings ||= {};
    data.settings.payment = { provider: 'stripe', enabled: false, mode: 'test', methods: 'automatic', ...(data.settings.payment || {}) };
    if (!data.settings?.name?.trim() || data.settings.currency !== 'GBP' || !Number.isSafeInteger(data.settings.stockThreshold) || data.settings.stockThreshold < 0 || !data.menus.some(m => m.id === data.settings.mainMenuId) || !data.menus.some(m => m.id === data.settings.footerMenuId)) throw new Error('Cài đặt cửa hàng hoặc menu đang sử dụng không hợp lệ.');
    if (data.settings.payment.provider !== 'stripe' || typeof data.settings.payment.enabled !== 'boolean' || !['test', 'live'].includes(data.settings.payment.mode) || !['automatic', 'card'].includes(data.settings.payment.methods)) throw new Error('Cấu hình Stripe không hợp lệ.');
    return data;
  }
  let state;
  let storageIssue = '';
  function read() {
    if (state) return clone(state);
    try { const raw = root.localStorage?.getItem(KEY); state = raw ? validate(JSON.parse(raw)) : seed(); }
    catch (error) { storageIssue = `Không thể đọc dữ liệu đã lưu: ${error.message}. Dữ liệu gốc chưa bị ghi đè.`; state = seed(); }
    return clone(state);
  }
  function save(next) {
    validate(next);
    if (storageIssue) throw new Error(storageIssue);
    if (!root.localStorage) throw new Error('Trình duyệt không hỗ trợ lưu cục bộ. Hãy mở bằng localhost.');
    try { root.localStorage.setItem(KEY, JSON.stringify(next)); }
    catch { throw new Error('Chưa lưu được. Bộ nhớ trình duyệt bị chặn hoặc đã đầy; thử giảm dung lượng ảnh.'); }
    state = clone(next);
    root.dispatchEvent?.(new Event('crocs:change'));
    return clone(state);
  }
  function commit(update, title, detail = '') {
    const next = read();
    update(next);
    if (title) next.activity.unshift({ id: id('act'), title, detail, createdAt: new Date().toISOString() });
    next.activity = next.activity.slice(0, 100);
    return save(next);
  }
  const total = order => order.items.reduce((sum, item) => sum + item.price * item.quantity, 0) + order.shipping;
  function createOrder(data, customerId, lines, note = '', shipping = 0) {
    const customer = data.customers.find(c => c.id === customerId);
    if (!customer || !Array.isArray(lines) || !lines.length) throw new Error('Chọn khách hàng và ít nhất một sản phẩm.');
    const grouped = new Map();
    lines.forEach(line => {
      const productId = String(line.productId || '');
      const variantId = String(line.variantId || '');
      const key = `${productId}:${variantId}`;
      const quantity = Number(line.quantity);
      if (!Number.isSafeInteger(quantity) || quantity < 1) throw new Error('Số lượng sản phẩm không hợp lệ.');
      grouped.set(key, { ...line, productId, variantId, quantity: (grouped.get(key)?.quantity || 0) + quantity });
    });
    const items = [...grouped.values()].map(line => {
      const product = data.products.find(p => p.id === line.productId && p.status === 'Active');
      if (!product) throw new Error(`Không tìm thấy sản phẩm đang bán: ${line.productId}.`);
      const variants = Array.isArray(product.variants) ? product.variants : [];
      if (variants.length) {
        const variant = variants.find(item => item.id === line.variantId && item.enabled !== false);
        if (!variant || line.quantity > variant.stock) throw new Error(`Không đủ tồn kho biến thể: ${product.title}.`);
        const title = (product.options || []).map(option => variant.values?.[option.id]).filter(Boolean).join(' / ') || variant.sku;
        return { productId: product.id, variantId: variant.id, variantTitle: title, title: product.title, image: product.image, price: variant.price, quantity: line.quantity };
      }
      if (line.quantity > product.stock) throw new Error(`Không đủ tồn kho hoặc số lượng không hợp lệ: ${product.title}.`);
      return { productId: product.id, title: product.title, image: product.image, price: product.price, quantity: line.quantity };
    });
    const order = { id: id('order'), number: Math.max(1000, ...data.orders.map(o => o.number)) + 1, customerId, customerName: customer.name, customerEmail: customer.email, items, shipping, note, createdAt: new Date().toISOString(), payment: 'pending', fulfillment: 'unfulfilled', stockReserved: true, channel: 'Admin · local' };
    items.forEach(item => {
      const product = data.products.find(p => p.id === item.productId);
      if (item.variantId) {
        const variant = product.variants.find(candidate => candidate.id === item.variantId);
        variant.stock -= item.quantity;
        product.stock = product.variants.filter(candidate => candidate.enabled !== false).reduce((sum, candidate) => sum + candidate.stock, 0);
        const active = product.variants.filter(candidate => candidate.enabled !== false);
        product.price = active.length ? Math.min(...active.map(candidate => candidate.price)) : 0;
      } else product.stock -= item.quantity;
    });
    data.orders.unshift(order);
    return order;
  }
  function transitionOrder(data, orderId, action) {
    const order = data.orders.find(o => o.id === orderId);
    if (!order) throw new Error('Không tìm thấy đơn hàng.');
    if (action === 'pay' && order.payment === 'pending' && order.fulfillment !== 'cancelled') order.payment = 'paid';
    else if (action === 'fulfill' && order.payment === 'paid' && order.fulfillment === 'unfulfilled') order.fulfillment = 'fulfilled';
    else if (action === 'cancel' && order.fulfillment === 'unfulfilled') {
      if (order.stockReserved) order.items.forEach(item => {
        const p = data.products.find(p => p.id === item.productId);
        if (!p) return;
        if (item.variantId && Array.isArray(p.variants)) {
          const variant = p.variants.find(candidate => candidate.id === item.variantId);
          if (variant) variant.stock += item.quantity;
          p.stock = p.variants.filter(candidate => candidate.enabled !== false).reduce((sum, candidate) => sum + candidate.stock, 0);
        } else p.stock += item.quantity;
      });
      order.stockReserved = false;
      order.fulfillment = 'cancelled';
    } else if (action === 'refund' && order.payment === 'paid') order.payment = 'refunded';
    else throw new Error('Không thể thực hiện thao tác ở trạng thái hiện tại của đơn.');
  }
  root.addEventListener?.('storage', event => { if (event.key === KEY) { state = undefined; storageIssue = ''; read(); root.dispatchEvent?.(new Event('crocs:change')); } });
  return { KEY, seed, validate, read, save, commit, id, money, total, safeLink, safeImage, createOrder, transitionOrder, get storageIssue() { read(); return storageIssue; } };
});
