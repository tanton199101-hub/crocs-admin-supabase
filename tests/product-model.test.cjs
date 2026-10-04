const test = require('node:test');
const assert = require('node:assert/strict');
const Products = require('../product-model.js');

function variantProduct() {
  const options = Products.cleanOptions([
    { id: 'colour', name: 'Màu sắc', values: ['Trắng', 'Đen'] },
    { id: 'size', name: 'Size UK', values: ['5', '6', '7'] },
  ]);
  const variants = Products.generate(options, [], { sku: 'TEST', price: 3499 });
  variants.forEach(variant => { variant.stock = 4; });
  return Products.aggregate({
    id: 'test', title: 'Classic Clog test', sku: 'TEST', price: 3499, stock: 24,
    status: 'Draft', image: 'assets/arrival-classic-clog-100.png', imageAlt: 'Classic Clog test',
    brand: 'Crocs', category: 'Clogs', description: 'A product description long enough for the editor.', slug: 'classic-clog-test',
    seo: { title: '', description: '', noindex: false }, options, variants,
  });
}

test('generates a stable colour x size matrix and aggregates price/stock', () => {
  const product = variantProduct();
  assert.equal(product.variants.length, 6);
  assert.equal(product.price, 3499);
  assert.equal(product.stock, 24);
  assert.doesNotThrow(() => Products.validate(product, [product]));
});

test('bulk pricing rejects a compare-at price below the new sale price', () => {
  const product = variantProduct();
  product.variants.slice(0, 2).forEach(variant => { variant.compareAt = 3900; });
  const ids = product.variants.slice(0, 2).map(variant => variant.id);
  assert.throws(() => Products.bulk(product.variants, ids, 'price', '39.99'));
  assert.equal(Products.bulk(product.variants, ids, 'price-percent', '10')[0].price, 3849);
});
