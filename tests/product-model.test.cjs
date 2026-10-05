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

test('active variant products need a sellable enabled variant', () => {
  const product = variantProduct();
  product.status = 'Active';
  assert.doesNotThrow(() => Products.validate(product, [product]));

  product.variants[0].price = 0;
  product.price = 0;
  assert.throws(() => Products.validate(product, [product]), /giá bán lớn hơn 0/);

  product.variants[0].price = 3499;
  product.price = 3499;
  product.variants.forEach(variant => { variant.stock = 0; });
  product.stock = 0;
  assert.throws(() => Products.validate(product, [product]), /tồn kho khả dụng/);
});

test('active products without variants need positive price and stock', () => {
  const product = {
    id: 'simple-active', title: 'Simple active product', sku: 'SIMPLE-ACTIVE', price: 0, stock: 4,
    status: 'Active', image: 'assets/arrival-classic-clog-100.png', imageAlt: 'Simple active product',
    brand: 'Crocs', category: 'Clogs', description: 'A simple active product.', slug: 'simple-active',
    options: [], variants: [], seo: { title: '', description: '', noindex: false },
  };
  assert.throws(() => Products.validate(product, [product]), /giá bán lớn hơn 0/);
  product.price = 3499;
  product.stock = 0;
  assert.throws(() => Products.validate(product, [product]), /tồn kho khả dụng lớn hơn 0/);
  product.stock = 4;
  assert.doesNotThrow(() => Products.validate(product, [product]));
});
