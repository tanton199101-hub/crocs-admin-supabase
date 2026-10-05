const { test } = require('node:test');
const assert = require('node:assert/strict');
const Amazon = require('../amazon-channel.js');
const Store = require('../store-data.js');

function channel() {
  return Amazon.defaultSettings({
    enabled: true,
    sellerId: 'A123456789',
    defaultMarketplaceId: 'A1F83G8C2ARO7P',
    marketplaces: [{ marketplaceId: 'A1F83G8C2ARO7P', enabled: true, defaultProductType: 'SHOES', handlingTime: 3 }],
  });
}

test('Amazon Custom profile enforces surfaces, customization and option limits', () => {
  const valid = Amazon.validateProfile({
    enabled: true,
    surfaces: [{ id: 'front', name: 'Front', customizations: [{ id: 'text', type: 'text', label: 'Name', maxLength: 12 }] }],
  });
  assert.equal(valid.valid, true);
  const invalid = Amazon.validateProfile({
    enabled: true,
    surfaces: Array.from({ length: 6 }, (_, index) => ({ id: `surface-${index}`, name: `Surface ${index}`, customizations: [] })),
  });
  assert.equal(invalid.valid, false);
  assert.ok(invalid.errors.some(error => error.includes('tối đa 5')));
});

test('Amazon listing mapping requires an explicit marketplace price', () => {
  const product = Store.seed().products[0];
  const target = channel().marketplaces[0];
  let plan = Amazon.listingPlan(product, channel(), target);
  assert.equal(plan.items[0].price, null);
  product.amazon.prices[target.marketplaceId] = 6999;
  plan = Amazon.listingPlan(product, channel(), target);
  assert.equal(plan.items[0].price, 6999);
  assert.equal(plan.items[0].sku, '10001-100-GB');
  assert.equal(plan.items[0].fulfillment, 'MERCHANT');
});

test('customized product moves from manual to ready only after Seller Central confirmation', () => {
  const product = Store.seed().products[0];
  product.amazon.prices['A1F83G8C2ARO7P'] = 6999;
  product.customization = {
    enabled: true,
    mode: 'personalize',
    version: 2,
    surfaces: [{ id: 'front', name: 'Front', customizations: [{ id: 'name', type: 'text', label: 'Name', maxLength: 12 }] }],
    sellerCentralConfirmedAt: '',
  };
  const target = channel().marketplaces[0];
  assert.equal(Amazon.listingPlan(product, channel(), target).items[0].customState, 'manual');
  product.customization.sellerCentralConfirmedAt = new Date().toISOString();
  assert.equal(Amazon.listingPlan(product, channel(), target).items[0].customState, 'ready');
});

test('store seed keeps Amazon channel data valid and backwards-compatible', () => {
  const data = Store.seed();
  Store.validate(data);
  assert.equal(data.settings.amazon.enabled, false);
  assert.deepEqual(data.products[0].amazon.prices, {});
  assert.equal(data.products[0].customization.version, 1);
});
