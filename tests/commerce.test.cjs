const test = require('node:test');
const assert = require('node:assert/strict');
const Commerce = require('../commerce.js');

test('variant line quotes the variant price and stock', () => {
  const product = Commerce.normalize({
    id: 'vp', title: 'Variant pair', sku: 'VP', price: 1000, stock: 6,
    status: 'Active', image: 'assets/arrival-classic-clog-100.png',
    options: [{ id: 'colour', name: 'Màu sắc', values: ['Trắng', 'Đen'] }, { id: 'size', name: 'Size UK', values: ['5'] }],
    variants: [
      { id: 'v1', values: { colour: 'Trắng', size: '5' }, sku: 'VP-W-5', price: 1000, stock: 2, enabled: true },
      { id: 'v2', values: { colour: 'Đen', size: '5' }, sku: 'VP-B-5', price: 1200, stock: 4, enabled: true },
    ],
  });
  const quote = Commerce.quote([{ productId: 'vp', variantId: 'v2', size: '5', quantity: 2 }], 'standard', [product]);
  assert.equal(quote.items[0].unitPrice, 1200);
  assert.equal(quote.items[0].variantTitle, 'Đen / 5');
  assert.equal(quote.subtotal, 2400);
});

test('commerce normalizes verified 1688 product videos through the same-origin proxy', () => {
  const product = Commerce.normalize({
    id: 'media', title: 'Video product', sku: 'MEDIA', price: 1000, stock: 1,
    status: 'Active', image: 'assets/arrival-classic-clog-100.png',
    videos: ['/api/1688-video?url=https%3A%2F%2Fcloud.video.taobao.com%2Fplay%2Fu%2F1%2Fp%2F2%2Fe%2F6%2Ft%2F1%2F2.mp4'],
  });
  assert.equal(product.videos.length, 1);
  assert.match(product.videos[0], /^\/api\/1688-video\?/);
});

test('commerce recovers video URLs from rich supplier markup and source media', () => {
  const product = Commerce.normalize({
    id: 'rich-media', title: 'Rich media product', sku: 'RICH', price: 1000, stock: 1,
    status: 'Active', image: 'https://cbu01.alicdn.com/rich.jpg',
    descriptionHtml: '<p>Chi tiết</p><video data-video="https://cloud.video.taobao.com/play/u/2/p/2/e/6/t/1/3.mp4"></video>',
    source: { videos: ['https://video01.1688.com/video/clip.mp4'] },
  });
  assert.equal(product.videos.length, 2);
  assert.ok(product.videos.every(value => value.startsWith('/api/1688-video?')));
});

test('recently viewed history keeps newest products first and stays bounded', () => {
  const storage = new Map();
  const sandbox = {
    module: { exports: {} },
    localStorage: { getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) },
    dispatchEvent() {}, Intl, URL, URLSearchParams, AbortSignal, Set, Map, JSON, Date, Number, String, Object, Array, Error,
    Event: function Event() {}, CustomEvent: function CustomEvent() {}, console,
  };
  require('node:vm').runInNewContext(require('node:fs').readFileSync(require('node:path').join(__dirname, '../commerce.js'), 'utf8'), sandbox);
  const isolated = sandbox.module.exports;
  for (let index = 0; index < 10; index += 1) isolated.rememberRecentlyViewed(`product-${index}`);
  assert.deepEqual(Array.from(isolated.readRecentlyViewed()), ['product-9', 'product-8', 'product-7', 'product-6', 'product-5', 'product-4', 'product-3', 'product-2']);
  isolated.rememberRecentlyViewed('product-4');
  assert.equal(isolated.readRecentlyViewed()[0], 'product-4');
  isolated.clearRecentlyViewed();
  assert.deepEqual(Array.from(isolated.readRecentlyViewed()), []);
});

function packedProduct() {
  return {
    id: 'packed-bootstrap', title: 'Áo trẻ em', sku: '1688-123456789',
    price: 1000, stock: 9, status: 'Active',
    image: 'assets/arrival-classic-clog-100.png',
    options: [
      { id: 'option-1', name: 'Màu sắc', values: ['Trắng', 'Đen'] },
      { id: 'option-2', name: 'Chiều cao', values: ['110cm'] },
    ],
    optionImages: { 'option-1': { Trắng: '/api/1688-image?url=https%3A%2F%2Fcbu01.alicdn.com%2Fwhite.jpg' } },
    variantImages: { 'sku-black': '/api/1688-image?url=https%3A%2F%2Fcbu01.alicdn.com%2Fblack.jpg' },
    variantEncoding: 'crocs-1688-v3', variantRegions: ['vn'],
    variantsPacked: [['sku-white', 0, 0, 1000, 4, 200000, 1], ['sku-black', 1, 0, 1200, 5, 240000, 1]],
  };
}

test('SSR product normalization decodes packed SKUs and keeps Vietnamese sizes and images', () => {
  const input = packedProduct();
  const product = Commerce.normalize(input);
  assert.equal(product.variants.length, 2);
  assert.equal(product.hasVariants, true);
  assert.equal(product.variantEncoding, undefined);
  assert.deepEqual(Commerce.sizesFor(product), ['110cm']);
  assert.equal(Commerce.variantSize(product, product.variants[1]), '110cm');
  assert.equal(product.variants[0].image, input.optionImages['option-1'].Trắng);
  assert.equal(product.variants[1].image, input.variantImages['sku-black']);
  assert.equal(product.variants[1].regionalPrices.vn, 240000);
  assert.deepEqual(Commerce.normalize(product), product);
  assert.equal(input.variants, undefined, 'Do not mutate the bootstrap payload');
});

test('hydrated bootstrap is registered for cart validation and later product loads', async () => {
  const product = Commerce.hydrateProduct(packedProduct());
  assert.equal(Commerce.product(product.id), product);
  assert.equal(await Commerce.loadProduct(product.id), product);
  const quote = Commerce.quote([{ productId: product.id, variantId: 'sku-black', size: '110cm', quantity: 2 }]);
  assert.equal(quote.items[0].unitPrice, 1200);
  assert.equal(quote.subtotal, 2400);
  assert.throws(() => Commerce.hydrateProduct({ ...packedProduct(), status: 'Draft' }), /not available/);
});

test('product media drops campaign banners and keeps verified gallery and variant photos', () => {
  const front = 'https://cbu01.alicdn.com/product-front.jpg';
  const detail = 'https://cbu01.alicdn.com/product-detail.jpg';
  const blue = 'https://cbu01.alicdn.com/product-blue.jpg';
  const input = {
    id: 'no-banner-media', title: 'Set pastel', price: 1000, stock: 3, status: 'Active',
    image: 'assets/sally-kids-hero-1983.webp',
    gallery: ['assets/sally-kids-hero.png', 'assets/sally-kids-play-720.webp', 'invalid-image', front],
    detailImages: ['assets/sally-kids-school-720.webp', detail],
    descriptionHtml: '<img src="assets/sally-kids-hero-1600.avif"><img data-src="https://cbu01.alicdn.com/product-detail.jpg"><img src="javascript:alert(1)">',
    options: [{ id: 'colour', name: 'Màu sắc', values: ['Đỏ', 'Xanh'] }],
    optionImages: { colour: { Đỏ: 'assets/sally-kids-play.png', Xanh: blue } },
    variantImages: { red: 'assets/sally-kids-school.png' },
    variants: [
      { id: 'red', sku: 'SET-RED', values: { colour: 'Đỏ' }, price: 1000, stock: 1, image: 'assets/sally-kids-hero-900.webp', imageUrl: 'assets/sally-kids-play-720.webp' },
      { id: 'blue', sku: 'SET-BLUE', values: { colour: 'Xanh' }, price: 1000, stock: 2 },
    ],
  };
  const product = Commerce.normalize(input);
  assert.equal(product.image, front, 'Use a real gallery photo when the main image is a banner');
  assert.deepEqual(product.gallery, [front]);
  assert.deepEqual(product.detailImages, [detail]);
  assert.deepEqual(product.optionImages, { colour: { Xanh: blue } });
  assert.deepEqual(product.variantImages, { blue });
  assert.equal(product.variants[0].image, undefined);
  assert.equal(product.variants[0].imageUrl, undefined);
  assert.equal(product.variants[1].image, blue);
  assert.equal(input.variants[0].image, 'assets/sally-kids-hero-900.webp', 'Do not mutate source records');
  assert.deepEqual(Commerce.normalize(product), product);
});

test('missing product photos use a dedicated placeholder, never the homepage hero', () => {
  const placeholder = 'assets/sally-kids-product-placeholder.svg';
  assert.equal(Commerce.image('javascript:alert(1)'), placeholder);
  assert.equal(Commerce.image(''), placeholder);
  const product = Commerce.normalize({ id: 'no-photo', title: 'Ảnh đang cập nhật', price: 1000, stock: 1, image: 'assets/sally-kids-hero.png', gallery: ['assets/sally-kids-school.png'] });
  assert.equal(product.image, placeholder);
  assert.deepEqual(product.gallery, []);
  assert.ok(Commerce.seeds.every(item => !/sally-kids-(?:hero|play|school)/i.test(item.image)));
});
