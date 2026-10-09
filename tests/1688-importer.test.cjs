const test = require('node:test');
const assert = require('node:assert/strict');
const Importer = require('../1688-importer.js');
const Store = require('../store-data.js');

test('1688 importer extracts offer ids and rejects shop-only links', () => {
  assert.equal(Importer.parseOfferUrl('https://detail.1688.com/offer/837842260799.html'), '837842260799');
  assert.equal(Importer.parseOfferUrl('https://qr.1688.com/s/ltj6aOu7'), '');
  assert.equal(Importer.isShopUrl('https://shop1481820794169.1688.com/'), true);
});

test('1688 importer translates the known offer title and keeps the import as a draft', () => {
  const product = Importer.toProduct({
    offerUrl: 'https://detail.1688.com/offer/837842260799.html',
    sku: 'CZ0137',
    sourceTitle: 'Trang phục nhảy jazz cho bé gái',
    priceCny: 17,
    options: [{ id: 'height', name: 'Height', values: ['110cm', '120cm'] }],
    variants: [
      { values: { height: '110cm' }, stock: 981 },
      { values: { height: '120cm' }, stock: 944 },
    ],
  });
  assert.equal(product.title, "Girls' Trendy Jazz Dance Performance Costume – Hip-Hop Street Dance Group Outfit for Kids");
  assert.equal(product.sku, 'CZ0137');
  assert.equal(product.status, 'Draft');
  assert.equal(product.source.offerId, '837842260799');
  assert.equal(product.source.sourcePriceCny, 17);
  assert.equal(product.stock, 1925);
  const data = Store.seed();
  data.products[0] = { ...product, id: data.products[0].id };
  assert.doesNotThrow(() => Store.validate(data));
});

test('1688 upsert is idempotent by SKU or source offer id', () => {
  const first = Importer.toProduct({ offerId: '837842260799', sku: 'CZ0137', titleEnglish: 'Imported title' });
  const created = Importer.upsert([], first);
  const second = Importer.toProduct({ offerId: '837842260799', sku: 'CZ0137', titleEnglish: 'Updated title' });
  const updated = Importer.upsert(created.products, second);
  assert.equal(created.mode, 'created');
  assert.equal(updated.mode, 'updated');
  assert.equal(updated.products.length, 1);
  assert.equal(updated.product.id, undefined);
  assert.equal(updated.product.title, 'Updated title');
});

test('1688 shop pricing stores a VND regional override without changing the base currency', () => {
  assert.equal(Importer.priceCnyToVnd(33, 3875.968992, 2), 255814);
  const product = Importer.productFromOffer({
    id: '1081098810208',
    memberId: Importer.DEFAULT_SHOP_MEMBER_ID,
    subject: '儿童演出服幼儿园毕业班服',
    offerPrice: '33.00',
    offerImages: [{ imageURI: 'img/ibank/example.jpg' }],
  }, {
    titleVi: 'Trang phục biểu diễn trẻ em',
    exchangeRateCnyVnd: 3875.968992,
    exchangeRateCnyBase: 0.132932,
    baseCurrencyDecimals: 2,
  });
  assert.equal(product.status, 'Draft');
  assert.equal(product.titleLanguage, 'vi');
  assert.equal(product.price, 439);
  assert.equal(product.regionalPrices.vn, 255814);
  assert.equal(product.source.targetPriceVnd, 255814);
  assert.equal(product.source.imageUrl, 'https://cbu01.alicdn.com/img/ibank/example.jpg');
});

test('1688 fallback translation never leaves Chinese characters in a Vietnamese title', () => {
  const title = Importer.fallbackVietnameseTitle({ sourceTitle: '儿童舞蹈服装未知词', offerId: '123456789' });
  assert.equal(/[\u3400-\u9fff]/.test(title), false);
  assert.match(title, /trẻ em|múa|trang phục|Sản phẩm/);
});
