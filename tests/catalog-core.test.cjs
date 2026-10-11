const test = require('node:test');
const assert = require('node:assert/strict');

let Core;
test.before(async () => { Core = await import('../server/catalog-core.mjs'); });

const localization = {
  currency: 'USD', defaultRegion: 'gb',
  regions: [
    { id: 'gb', currency: 'GBP', exchangeRate: 1, priceMultiplier: 1, priceOverrides: {} },
    { id: 'vn', currency: 'VND', exchangeRate: 31500, priceMultiplier: 1, priceOverrides: {} },
  ],
};

function catalog() {
  return {
    localization,
    products: [
      { id: 'a', title: 'Áo pastel', sku: 'A', price: 1000, stock: 2, status: 'Active', category: 'Áo', createdAt: '2026-01-01', regionalPrices: { vn: 250000 } },
      { id: 'b', title: 'Váy hoa', sku: 'B', price: 3000, stock: 4, status: 'Active', category: 'Váy', createdAt: '2026-02-01' },
      { id: 'c', title: 'Bản nháp', sku: 'C', price: 500, stock: 3, status: 'Draft', category: 'Áo' },
    ],
    collections: [{ id: 'dresses', title: 'Váy & đầm trẻ em', status: 'Active', productIds: ['b'] }],
    store: { name: 'Sally Kids' },
  };
}

test('catalog page filters, sorts, localizes prices and returns a cursor', () => {
  const first = Core.catalogPage(catalog(), new URLSearchParams('limit=1&sort=price-asc&region=vn'));
  assert.equal(first.total, 2);
  assert.equal(first.products.length, 1);
  assert.equal(first.products[0].id, 'a');
  assert.equal(first.products[0].price, 250000);
  assert.ok(first.nextCursor);
  const second = Core.catalogPage(catalog(), new URLSearchParams(`limit=1&sort=price-asc&region=vn&cursor=${encodeURIComponent(first.nextCursor)}`));
  assert.deepEqual(second.products.map(item => item.id), ['b']);
  assert.equal(second.nextCursor, null);
});

test('catalog page rejects a cursor from another filter', () => {
  const first = Core.catalogPage(catalog(), new URLSearchParams('limit=1'));
  assert.throws(() => Core.catalogPage(catalog(), new URLSearchParams(`limit=1&query=áo&cursor=${encodeURIComponent(first.nextCursor)}`)), error => error.status === 409);
});

test('public collections expose only active product ids and counts', () => {
  const collections = Core.publicCollections(catalog().collections, catalog().products);
  assert.deepEqual(collections, [{ id: 'dresses', title: 'Váy & đầm trẻ em', status: 'Active', productIds: ['b'], count: 1 }]);
});

test('presentation keeps live inventory while replacing supplier-facing copy', () => {
  const live = { id: 'a', title: 'Mẫu 1234567890', price: 100, stock: 7, status: 'Active', brand: 'Nhà cung cấp 1688' };
  const mirror = { title: 'Áo pastel Sally', slug: 'ao-pastel-sally', imageAlt: 'Áo pastel cho bé', description: 'Mềm mại mỗi ngày.' };
  const result = Core.presentation(live, mirror);
  assert.equal(result.title, mirror.title);
  assert.equal(result.stock, 7);
  assert.equal(result.price, 100);
  assert.equal(result.brand, 'Sally Kids');
});

test('presentation merges partial live media with the verified 1688 mirror', () => {
  const live = {
    id: '1688-media', title: 'Mẫu 1081098810208', price: 100, stock: 7,
    status: 'Active', gallery: ['live-gallery.jpg'], detailImages: ['live-detail.jpg'],
    optionImages: { 'option-1': { Đỏ: 'live-red.jpg' } },
  };
  const mirror = {
    title: 'Trang phục biểu diễn trẻ em', gallery: ['mirror-gallery.jpg'],
    detailImages: ['mirror-detail.jpg'], videos: ['mirror-video.mp4'],
    optionImages: { 'option-1': { Đỏ: 'mirror-red.jpg', Xanh: 'mirror-blue.jpg' } },
    variantImages: { 'sku-blue': 'mirror-blue.jpg' },
    descriptionHtml: '<img src="mirror-detail.jpg">',
  };
  const result = Core.presentation(live, mirror);
  assert.deepEqual(result.gallery, ['live-gallery.jpg', 'mirror-gallery.jpg']);
  assert.deepEqual(result.detailImages, ['live-detail.jpg', 'mirror-detail.jpg']);
  assert.deepEqual(result.videos, ['mirror-video.mp4']);
  assert.equal(result.optionImages['option-1'].Đỏ, 'mirror-red.jpg');
  assert.equal(result.optionImages['option-1'].Xanh, 'mirror-blue.jpg');
  assert.equal(result.variantImages['sku-blue'], 'mirror-blue.jpg');
  assert.equal(result.descriptionHtml, mirror.descriptionHtml);
});

test('presentation filters storefront banners from product media and uses a product placeholder', () => {
  const live = {
    id: 'banner-media', title: 'Set pastel', price: 100, stock: 7, status: 'Active',
    image: 'assets/sally-kids-hero-900.webp',
    gallery: ['assets/sally-kids-hero-1600.webp', 'https://img.example/product-front.jpg'],
    detailImages: ['assets/crocs-cozy.webp', 'https://img.example/detail.jpg'],
    optionImages: { colour: { Đỏ: 'assets/sally-kids-play-720.webp', Xanh: 'https://img.example/blue.jpg' } },
    variantImages: { 'sku-red': 'assets/sally-kids-school-720.webp', 'sku-blue': 'https://img.example/blue.jpg' },
  };
  const result = Core.presentation(live, null);
  assert.equal(result.image, Core.PRODUCT_PLACEHOLDER);
  assert.deepEqual(result.gallery, ['https://img.example/product-front.jpg']);
  assert.deepEqual(result.detailImages, ['https://img.example/detail.jpg']);
  assert.deepEqual(result.optionImages, { colour: { Xanh: 'https://img.example/blue.jpg' } });
  assert.deepEqual(result.variantImages, { 'sku-blue': 'https://img.example/blue.jpg' });
});
