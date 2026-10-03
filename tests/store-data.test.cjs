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
