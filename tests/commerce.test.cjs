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
