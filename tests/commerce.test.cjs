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
