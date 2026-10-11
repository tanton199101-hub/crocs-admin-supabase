const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Commerce = require('../commerce.js');

test('product detail renderer excludes banners and fallback placeholders from description images', async () => {
  const product = Commerce.normalize({
    id: 'media-render', title: 'Set Sally Kids', sku: 'MEDIA-RENDER', price: 1000, stock: 1, status: 'Active',
    image: 'assets/sally-kids-hero.png',
    gallery: ['assets/sally-kids-play-720.webp', 'https://cbu01.alicdn.com/front.jpg'],
    detailImages: ['assets/sally-kids-school-720.webp'],
    descriptionHtml: '<img src="assets/sally-kids-hero.png"><img data-src="assets\\/sally-kids-play-720.webp"><img src="https://cbu01.alicdn.com/detail.jpg"><img src="invalid-image">',
  });
  const main = { innerHTML: '', setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] };
  const headNodes = [];
  const document = {
    head: { querySelector: () => null, appendChild: node => headNodes.push(node) },
    createElement: () => ({ setAttribute() {} }),
    querySelector: selector => selector === '#productMain' ? main : null,
  };
  const root = {
    location: { href: 'https://store.invalid/product.html?id=media-render', search: '?id=media-render', protocol: 'https:' },
    addEventListener() {},
    CrocsCommerce: { ...Commerce, products: [product], ready: Promise.resolve(), loadProduct: async () => product, enhanceImages() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../product.js'), 'utf8'), { window: root, document, URL, URLSearchParams });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(main.innerHTML, /id="productTitle"/);
  assert.match(main.innerHTML, /https:\/\/cbu01\.alicdn\.com\/front\.jpg/);
  assert.match(main.innerHTML, /https:\/\/cbu01\.alicdn\.com\/detail\.jpg/);
  assert.doesNotMatch(main.innerHTML, /sally-kids-(?:hero|play|school)|product-placeholder/);
  assert.ok(headNodes.some(node => node.id === 'productStructuredData'));
});
