const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Commerce = require('../commerce.js');

test('product detail renderer excludes banners and fallback placeholders from description images', async () => {
  const product = Commerce.normalize({
    id: 'media-render', title: 'Set Sally Kids', sku: 'MEDIA-RENDER', price: 1000, stock: 1, status: 'Active',
    image: 'assets/sally-kids-hero.png',
    gallery: ['assets/sally-kids-play-720.webp', 'https://cbu01.alicdn.com/front.jpg'],
    detailImages: ['assets/sally-kids-school-720.webp'],
    descriptionHtml: '<p><strong>Chi tiết chất liệu</strong></p><img src="assets/sally-kids-hero.png"><img data-src="assets\\/sally-kids-play-720.webp"><img src="https://cbu01.alicdn.com/detail.jpg"><img src="invalid-image"><video data-video="https://cloud.video.taobao.com/play/u/1/p/2/e/6/t/1/2.mp4"></video>',
  });
  const main = { innerHTML: '', setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] };
  const headNodes = [];
  const document = {
    head: { querySelector: () => null, appendChild: node => headNodes.push(node) },
    createElement: () => ({ setAttribute() {} }),
    querySelector: selector => selector === '#productMain' ? main : null,
  };
  const root = {
    location: { href: 'https://store.invalid/product.html?id=media-render', search: '?id=media-render', protocol: 'https:' },
    addEventListener() {},
    CrocsCommerce: { ...Commerce, products: [product], ready: Promise.resolve(), loadProduct: async () => product, enhanceImages() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../product.js'), 'utf8'), { window: root, document, URL, URLSearchParams });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(main.innerHTML, /id="productTitle"/);
  assert.match(main.innerHTML, /https:\/\/cbu01\.alicdn\.com\/front\.jpg/);
  assert.match(main.innerHTML, /https:\/\/cbu01\.alicdn\.com\/detail\.jpg/);
  assert.match(main.innerHTML, /product-rich-description/);
  assert.match(main.innerHTML, /Chi tiết chất liệu/);
  assert.match(main.innerHTML, /product-video-media/);
  assert.match(main.innerHTML, /\/api\/1688-video\?/);
  assert.match(main.innerHTML, /preload="none"/);
  assert.doesNotMatch(main.innerHTML, /video đã xác minh|ảnh từ nhà cung cấp|<figcaption>|product-kicker/);
  assert.doesNotMatch(main.innerHTML, /sally-kids-(?:hero|play|school)|product-placeholder/);
  assert.ok(headNodes.some(node => node.id === 'productStructuredData'));
});

test('product detail renderer keeps text content and adds cross-sell, upsell and clean product links', async () => {
  const product = Commerce.normalize({
    id: 'recommendation-current', title: 'Trang phục biểu diễn jazz bé gái', sku: 'REC-CURRENT', price: 1000, stock: 4, status: 'Active',
    image: 'https://cbu01.alicdn.com/current.jpg', category: 'Thời trang trẻ em',
    description: 'Vải mềm, co giãn và phù hợp cho buổi biểu diễn của bé.',
  });
  const crossSell = Commerce.normalize({
    id: 'recommendation-cross', title: 'Trang phục biểu diễn cổ vũ bé gái', sku: 'REC-CROSS', price: 900, stock: 4, status: 'Active',
    image: 'https://cbu01.alicdn.com/cross.jpg', category: 'Thời trang trẻ em',
  });
  const upgrade = Commerce.normalize({
    id: 'recommendation-upgrade', title: 'Trang phục biểu diễn jazz trẻ em cao cấp', sku: 'REC-UPGRADE', price: 1600, stock: 4, status: 'Active',
    image: 'https://cbu01.alicdn.com/upgrade.jpg', category: 'Thời trang trẻ em',
  });
  const main = { innerHTML: '', setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] };
  const headNodes = [];
  const document = {
    head: { querySelector: () => null, appendChild: node => headNodes.push(node) },
    createElement: () => ({ setAttribute() {} }),
    querySelector: selector => selector === '#productMain' ? main : null,
  };
  const root = {
    location: { href: 'https://store.invalid/product?id=recommendation-current', search: '?id=recommendation-current', protocol: 'https:' },
    addEventListener() {},
    CrocsCommerce: { ...Commerce, products: [product, crossSell, upgrade], ready: Promise.resolve(), loadProduct: async () => product, enhanceImages() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../product.js'), 'utf8'), { window: root, document, URL, URLSearchParams });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(main.innerHTML, /Vải mềm, co giãn/);
  assert.match(main.innerHTML, /Phối cùng outfit/);
  assert.match(main.innerHTML, /Nâng cấp outfit/);
  assert.match(main.innerHTML, /href="product\?id=recommendation-cross/);
  assert.equal(main.innerHTML.match(/Vải mềm, co giãn/g).length, 1, 'Do not repeat the full description above the buy form');
  assert.doesNotMatch(main.innerHTML, /Bán chéo thông minh|Gợi ý cao hơn|Lịch sử của bé|recommendation-count|recommendation-tag|Product code/);
  assert.ok(headNodes.some(node => node.id === 'productStructuredData'));
});

function productHarness({ products = [], ids = [], description = 'Vải mềm cho bé.', currentProduct = {}, loadRecentlyViewedProducts, loadCatalogPage } = {}) {
  const current = Commerce.normalize({ id: 'current-product', title: 'Áo Sally Kids', sku: '1688-123456789', price: 1000, stock: 4, status: 'Active', image: 'https://cbu01.alicdn.com/current.jpg', description, ...currentProduct });
  let history = [current.id, ...ids];
  let region = { id: 'vn' };
  let pageHtml = '';
  let railHtml = '';
  let clearButton;
  let writes = 0;
  const handlers = new Map();
  const button = dataset => ({ dataset, handlers: new Map(), addEventListener(type, handler) { this.handlers.set(type, handler); } });
  const increase = button({ quantity: 'increase' });
  const quantity = { textContent: '1' };
  const panel = {
    get innerHTML() { return railHtml; },
    set innerHTML(value) { railHtml = value; clearButton = value.includes('data-clear-recently-viewed') ? button({}) : null; },
    focus() {},
  };
  const main = {
    get innerHTML() { return pageHtml; },
    set innerHTML(value) {
      pageHtml = value; writes += 1;
      const marker = '<div id="productRecommendations" tabindex="-1">';
      const index = value.indexOf(marker);
      if (index >= 0) panel.innerHTML = value.slice(index + marker.length).replace(/<\/div>\s*$/, '');
    },
    setAttribute() {},
    querySelector(selector) {
      if (selector === '#productRecommendations') return pageHtml.includes('id="productRecommendations"') ? panel : null;
      if (selector === '[data-clear-recently-viewed]') return clearButton;
      if (selector === '#quantityValue') return quantity;
      return null;
    },
    querySelectorAll: selector => selector === '[data-quantity]' ? [increase] : [],
  };
  const document = {
    head: { querySelector: () => null, appendChild() {} }, createElement: () => ({ setAttribute() {} }),
    querySelector: selector => selector === '#productMain' ? main : null,
  };
  const root = {
    location: { href: 'https://store.invalid/product?id=current-product', search: '?id=current-product', protocol: 'https:' },
    addEventListener: (type, handler) => handlers.set(type, handler),
    CrocsCommerce: {
      ...Commerce, products: [current, ...products], ready: Promise.resolve(), loadProduct: async () => current,
      readRecentlyViewed: () => history, rememberRecentlyViewed() {}, clearRecentlyViewed: () => { history = []; },
      get region() { return region; },
      loadRecentlyViewedProducts, loadCatalogPage, enhanceImages() {},
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../product.js'), 'utf8'), { window: root, document, URL, URLSearchParams });
  return { main, panel, quantity, handlers, increase: () => increase.handlers.get('click')(), clear: () => clearButton.handlers.get('click')(), get writes() { return writes; }, setHistory: ids => { history = ids; }, setRegion: value => { region = value; } };
}

const historyProduct = (id, status = 'Active') => Commerce.normalize({ id, status, title: `Sản phẩm ${id}`, sku: id, price: 1500, stock: 1, image: `https://cbu01.alicdn.com/${id}.jpg` });

test('generated supplier reports and duplicate option lists do not create a fake product description', async () => {
  for (const report of ['Hiện có 3 ảnh sản phẩm đã đồng bộ từ nhà cung cấp 1688.', 'Bộ ảnh mô tả chi tiết gồm 16 ảnh từ nhà cung cấp 1688.']) {
    const ui = productHarness({ description: `Áo Sally Kids. Tùy chọn: Phân loại: Đỏ, Đen; Size (cm): 110cm, 120cm. ${report} Vui lòng chọn đúng phân loại và kích thước trước khi đặt hàng.` });
    await new Promise(resolve => setImmediate(resolve));
    assert.doesNotMatch(ui.main.innerHTML, /productInformationTitle|Tùy chọn:|nhà cung cấp 1688|Vui lòng chọn đúng/);
    assert.match(ui.main.innerHTML, /id="productTitle"/);
    assert.match(ui.main.innerHTML, /id="productForm"/);
  }
  const genuine = productHarness({ description: 'Vải cotton mềm, giặt ở 30°C. Bộ ảnh mô tả chi tiết gồm 16 ảnh từ nhà cung cấp 1688.' });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(genuine.main.innerHTML, /Vải cotton mềm, giặt ở 30°C\./);
  assert.doesNotMatch(genuine.main.innerHTML, /nhà cung cấp 1688/);
});

test('upsells are more expensive than the selected variant, not only the cheapest variant', async () => {
  const ui = productHarness({
    currentProduct: {
      options: [{ id: 'outfit', name: 'Phân loại', values: ['Bộ đầy đủ', 'Áo riêng'] }],
      variants: [
        { id: 'full', values: { outfit: 'Bộ đầy đủ' }, price: 2500, stock: 2, enabled: true },
        { id: 'shirt', values: { outfit: 'Áo riêng' }, price: 1000, stock: 2, enabled: true },
      ],
    },
    products: [historyProduct('cheaper-outfit'), { ...historyProduct('upgrade-outfit'), price: 3500, basePrice: 3500 }],
  });
  await new Promise(resolve => setImmediate(resolve));
  const upgrades = ui.panel.innerHTML.match(/<section class="related-products recommendation-section recommendation-section--upsell"[\s\S]*?<\/section>/)?.[0];
  assert.match(upgrades, /product\?id=upgrade-outfit/);
  assert.doesNotMatch(upgrades, /product\?id=cheaper-outfit/);
});

test('recently viewed rail uses newest-first order, excludes current and draft products, and clears without re-rendering the page', async () => {
  const older = historyProduct('older');
  const newer = historyProduct('newer');
  const draft = historyProduct('draft', 'Draft');
  const ui = productHarness({ products: [older, draft, newer], ids: [newer.id, draft.id, older.id] });
  await new Promise(resolve => setImmediate(resolve));
  const recent = ui.panel.innerHTML.match(/<section class="related-products recommendation-section recommendation-section--recent"[\s\S]*?<\/section>/)?.[0];
  assert.match(recent, /Đã xem gần đây/);
  assert.match(recent, /Xoá lịch sử/);
  assert.ok(recent.indexOf('product?id=newer') < recent.indexOf('product?id=older'));
  assert.doesNotMatch(recent, /product\?id=(?:current-product|draft)/);
  assert.doesNotMatch(ui.main.innerHTML, /Video sản phẩm chưa có dữ liệu|product-description|product-kicker/);
  ui.increase();
  ui.clear();
  assert.doesNotMatch(ui.panel.innerHTML, /recentRecommendationTitle/);
  assert.equal(ui.quantity.textContent, '2');
  assert.equal(ui.writes, 1, 'Clearing history must not reset the product gallery or form');
});

test('recent history and recommendation hydration update only their rail and respond to cross-tab clearing', async () => {
  let resolveHistory;
  let resolveRecommendations;
  const historyFlight = new Promise(resolve => { resolveHistory = resolve; });
  const recommendationFlight = new Promise(resolve => { resolveRecommendations = resolve; });
  const ui = productHarness({ ids: ['remote'], loadRecentlyViewedProducts: () => historyFlight, loadCatalogPage: () => recommendationFlight });
  await new Promise(resolve => setImmediate(resolve));
  ui.increase();
  resolveHistory([historyProduct('remote')]);
  resolveRecommendations({ products: [historyProduct('suggested')] });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(ui.panel.innerHTML, /recentRecommendationTitle/);
  assert.match(ui.panel.innerHTML, /product\?id=remote/);
  assert.equal(ui.writes, 1);
  assert.equal(ui.quantity.textContent, '2');
  ui.setHistory([]);
  ui.handlers.get('crocs:recently-viewed')();
  assert.doesNotMatch(ui.panel.innerHTML, /recentRecommendationTitle/);
  assert.equal(ui.writes, 1);
});

test('clearing history during hydration never restores cards or resets the buy form', async () => {
  let resolveHistory;
  let requests = 0;
  const historyFlight = new Promise(resolve => { resolveHistory = resolve; });
  const remote = historyProduct('remote');
  const ui = productHarness({ products: [remote], ids: [remote.id], loadRecentlyViewedProducts: () => { requests += 1; return historyFlight; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(ui.panel.innerHTML, /recentRecommendationTitle/);
  ui.increase();
  ui.clear();
  ui.handlers.get('crocs:recently-viewed')();
  assert.doesNotMatch(ui.panel.innerHTML, /recentRecommendationTitle/);
  resolveHistory([remote]);
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotMatch(ui.panel.innerHTML, /recentRecommendationTitle/);
  assert.equal(requests, 1);
  assert.equal(ui.quantity.textContent, '2');
  assert.equal(ui.writes, 1);
});

test('an in-flight history request is discarded and refreshed when region or history changes', async () => {
  const requests = [];
  const ui = productHarness({ ids: ['first'], loadRecentlyViewedProducts: ids => new Promise(resolve => { requests.push({ ids: [...ids], resolve }); }) });
  await new Promise(resolve => setImmediate(resolve));
  assert.deepEqual(requests[0].ids, ['first']);
  ui.setHistory(['second']);
  ui.setRegion({ id: 'uk' });
  ui.handlers.get('crocs:recently-viewed')();
  requests[0].resolve([historyProduct('first'), historyProduct('second')]);
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(requests.length, 2);
  assert.deepEqual(requests[1].ids, ['second']);
  assert.doesNotMatch(ui.panel.innerHTML, /recentRecommendationTitle/, 'Do not show cards from the stale regional response');
  requests[1].resolve([historyProduct('second')]);
  await new Promise(resolve => setImmediate(resolve));
  assert.match(ui.panel.innerHTML, /product\?id=second/);
  assert.doesNotMatch(ui.panel.innerHTML, /product\?id=first/);
  assert.equal(ui.writes, 1);
});

test('empty browsing history does not create an empty heading or a history network request', async () => {
  let requests = 0;
  const ui = productHarness({ loadRecentlyViewedProducts: async () => { requests += 1; return []; } });
  await new Promise(resolve => setImmediate(resolve));
  assert.doesNotMatch(ui.panel.innerHTML, /recentRecommendationTitle|data-clear-recently-viewed/);
  assert.equal(requests, 0);
});
