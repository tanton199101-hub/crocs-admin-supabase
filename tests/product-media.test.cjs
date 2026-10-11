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
    descriptionHtml: '<p><strong>Chi tiết chất liệu</strong></p><img src="assets/sally-kids-hero.png"><img data-src="assets\\/sally-kids-play-720.webp"><img src="https://cbu01.alicdn.com/detail.jpg"><img src="invalid-image"><video data-video="https://cloud.video.taobao.com/play/u/1/p/2/e/6/t/1/2.mp4"></video>',
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
  assert.match(main.innerHTML, /product-rich-description/);
  assert.match(main.innerHTML, /Chi tiết chất liệu/);
  assert.match(main.innerHTML, /product-video-media/);
  assert.match(main.innerHTML, /\/api\/1688-video\?/);
  assert.doesNotMatch(main.innerHTML, /sally-kids-(?:hero|play|school)|product-placeholder/);
  assert.ok(headNodes.some(node => node.id === 'productStructuredData'));
});

test('product detail renderer keeps text content and adds cross-sell, upsell and clean product links', async () => {
  const product = Commerce.normalize({
    id: 'recommendation-current', title: 'Trang phục biểu diễn jazz bé gái', sku: 'REC-CURRENT', price: 1000, stock: 4, status: 'Active',
    image: 'https://cbu01.alicdn.com/current.jpg', category: 'Thời trang trẻ em',
    description: 'Vải mềm, co giãn và phù hợp cho buổi biểu diễn của bé.',
  });
  const crossSell = Commerce.normalize({
    id: 'recommendation-cross', title: 'Trang phục biểu diễn cổ vũ bé gái', sku: 'REC-CROSS', price: 900, stock: 4, status: 'Active',
    image: 'https://cbu01.alicdn.com/cross.jpg', category: 'Thời trang trẻ em',
  });
  const upgrade = Commerce.normalize({
    id: 'recommendation-upgrade', title: 'Trang phục biểu diễn jazz trẻ em cao cấp', sku: 'REC-UPGRADE', price: 1600, stock: 4, status: 'Active',
    image: 'https://cbu01.alicdn.com/upgrade.jpg', category: 'Thời trang trẻ em',
  });
  const main = { innerHTML: '', setAttribute() {}, querySelector: () => null, querySelectorAll: () => [] };
  const headNodes = [];
  const document = {
    head: { querySelector: () => null, appendChild: node => headNodes.push(node) },
    createElement: () => ({ setAttribute() {} }),
    querySelector: selector => selector === '#productMain' ? main : null,
  };
  const root = {
    location: { href: 'https://store.invalid/product?id=recommendation-current', search: '?id=recommendation-current', protocol: 'https:' },
    addEventListener() {},
    CrocsCommerce: { ...Commerce, products: [product, crossSell, upgrade], ready: Promise.resolve(), loadProduct: async () => product, enhanceImages() {} },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../product.js'), 'utf8'), { window: root, document, URL, URLSearchParams });
  await new Promise(resolve => setImmediate(resolve));
  assert.match(main.innerHTML, /Vải mềm, co giãn/);
  assert.match(main.innerHTML, /Phối cùng outfit/);
  assert.match(main.innerHTML, /Nâng cấp outfit/);
  assert.match(main.innerHTML, /href="product\?id=recommendation-cross/);
  assert.ok(headNodes.some(node => node.id === 'productStructuredData'));
});
