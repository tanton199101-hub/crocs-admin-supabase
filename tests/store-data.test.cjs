const test = require('node:test');
const assert = require('node:assert/strict');
const Store = require('../store-data.js');

test('seed is a valid Crocs Studio document', () => {
  const data = Store.seed();
  assert.equal(data.version, 1);
  assert.equal(data.products.length, 8);
  assert.doesNotThrow(() => Store.validate(data));
});

test('order transitions keep payment and fulfilment states valid', () => {
  const data = Store.seed();
  const pending = data.orders.find(order => order.payment === 'pending');
  Store.transitionOrder(data, pending.id, 'pay');
  assert.equal(pending.payment, 'paid');
  Store.transitionOrder(data, pending.id, 'fulfill');
  assert.equal(pending.fulfillment, 'fulfilled');
  assert.doesNotThrow(() => Store.validate(data));
});

test('store total is calculated in pence', () => {
  const data = Store.seed();
  assert.equal(Store.total(data.orders[0]), data.orders[0].items[0].price * data.orders[0].items[0].quantity);
});

test('admin orders reserve and restore a specific variant', () => {
  const data = Store.seed();
  const product = data.products[0];
  product.options = [{ id: 'size', name: 'Size UK', values: ['5'] }];
  product.variants = [{ id: 'v-white-5', values: { size: '5' }, sku: '10001-100-5', price: product.price, stock: 3, enabled: true }];
  product.stock = 3;
  const order = Store.createOrder(data, data.customers[0].id, [{ productId: product.id, variantId: 'v-white-5', quantity: 2 }]);
  assert.equal(order.items[0].variantId, 'v-white-5');
  assert.equal(product.variants[0].stock, 1);
  assert.equal(product.stock, 1);
  Store.transitionOrder(data, order.id, 'cancel');
  assert.equal(product.variants[0].stock, 3);
  assert.equal(product.stock, 3);
});
