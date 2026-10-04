const test = require('node:test');
const assert = require('node:assert/strict');

const regional = require('../regional-commerce.js');

test('regional pricing converts the catalog currency and applies product overrides', async () => {
  await regional.configure({
    currency: 'GBP',
    defaultRegion: 'vn',
    defaultLanguage: 'vi',
    regions: [
      { id: 'gb', name: 'United Kingdom', countries: ['GB'], language: 'en', locale: 'en-GB', currency: 'GBP', exchangeRate: 1, priceMultiplier: 1, priceOverrides: {} },
      { id: 'vn', name: 'Vietnam', countries: ['VN'], language: 'vi', locale: 'vi-VN', currency: 'VND', exchangeRate: 31500, priceMultiplier: 1, priceOverrides: { p1: 1250000 } },
    ],
  });

  assert.equal(regional.region.id, 'vn');
  assert.equal(regional.priceFor(3499, { id: 'other-product' }), 1102185);
  assert.equal(regional.priceFor(3499, { id: 'p1' }), 1250000);
  assert.match(regional.formatMoney(1250000), /₫/);
});

test('regional configuration keeps the selected language and currency metadata together', async () => {
  await regional.configure({
    currency: 'GBP',
    defaultRegion: 'us',
    defaultLanguage: 'en',
    regions: [
      { id: 'us', name: 'United States', countries: ['US'], language: 'en', locale: 'en-US', currency: 'USD', exchangeRate: 1.27, priceMultiplier: 1.1, priceOverrides: {} },
    ],
  });

  assert.equal(regional.region.currency, 'USD');
  assert.equal(regional.language, 'en');
  assert.equal(regional.priceFor(3499), 4888);
});
