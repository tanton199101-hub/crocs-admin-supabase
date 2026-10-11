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

test('1688 presentation localization shortens titles and translates every variant label', () => {
  const localized = Importer.localizeProduct({
    id: 'product-1688-localize',
    sku: '1688-123456789',
    title: 'Bộ trang phục biểu diễn jazz cho bé gái phong cách sân khấu mùa hè rất nổi bật',
    source: { platform: '1688', offerId: '123456789' },
    options: [{ id: 'colour', name: '颜色', values: ['红色', '黑色'] }],
    variants: [{ id: 'v1', sku: 'v1', values: { colour: '红色' }, price: 100, stock: 2, enabled: true }],
  }, { 颜色: 'Màu sắc', 红色: 'Đỏ', 黑色: 'Đen' }, { maxLength: 56 });
  assert.equal(/[\u3400-\u9fff\uf900-\ufaff]/.test(JSON.stringify(localized)), false);
  assert.ok(localized.title.length <= 56);
  assert.deepEqual(localized.options[0], { id: 'colour', name: 'Màu sắc', values: ['Đỏ', 'Đen'] });
  assert.equal(localized.variants[0].values.colour, 'Đỏ');
});

test('1688 detail parser keeps gallery/detail images and maps SKU specs to options', () => {
  const description = 'var offer_details={"content":"<h1>Thông tin</h1><p>Vải mềm &amp; thoáng</p><img src=\"https://cbu01.alicdn.com/img/ibank/main.jpg\"><img data-lazyload-src=\"//cbu01.alicdn.com/img/ibank/detail.jpg\">"};';
  const parsedDescription = Importer.parseDescriptionDocument(description);
  assert.match(parsedDescription.text, /Vải mềm/);
  assert.equal(parsedDescription.images.length, 2);
  assert.match(Importer.proxyDescriptionHtml('<img src="https://cbu01.alicdn.com/img/ibank/detail.jpg">'), /\/api\/1688-image\?/);
  const parsed = Importer.detailPayload({
    offerModel: { offerDetail: { subject: 'Áo biểu diễn', skuProps: [{ prop: '颜色', value: [{ name: 'Đỏ', imageUrl: 'https://cbu01.alicdn.com/img/ibank/red.jpg' }] }, { prop: '尺码', value: [{ name: 'S' }] }] } },
    dataModel: { mainPrice: { fields: { finalPriceModel: { tradeWithoutPromotion: { skuMapOriginal: [{ skuId: 'sku-1', specAttrs: '颜色:Đỏ;尺码:S', price: '12.50', canBookCount: 4 }] } } } } },
  });
  assert.deepEqual(parsed.options.map(item => item.name), ['Màu sắc', 'Kích thước']);
  assert.deepEqual(parsed.variants[0].values, { 'option-1': 'Đỏ', 'option-2': 'S' });
  assert.match(parsed.optionImages['option-1'].Đỏ, /red\.jpg$/);
  assert.match(parsed.variantImages['sku-1'], /red\.jpg$/);
  const product = Importer.toProduct({ offerId: '123456789', sku: 'DETAIL-01', titleVietnamese: 'Áo biểu diễn', exchangeRateCnyBase: .13, exchangeRateCnyVnd: 3800, priceMultiplier: 2, options: parsed.options, variants: parsed.variants, optionImages: parsed.optionImages, variantImages: parsed.variantImages, gallery: ['https://cbu01.alicdn.com/img/ibank/main.jpg'], detailImages: parsedDescription.images, description: parsedDescription.text });
  assert.match(product.image, /^\/api\/1688-image\?/);
  assert.equal(product.gallery.length, 1);
  assert.equal(product.detailImages.length, 2);
  assert.match(product.variants[0].image, /^\/api\/1688-image\?/);
  assert.equal(product.variants[0].regionalPrices.vn, 95000);
  const data = Store.seed(); data.products[0] = { ...product, id: data.products[0].id };
  assert.doesNotThrow(() => Store.validate(data));
});

test('1688 media parser keeps lazy-load/srcset images and the full desktop offer gallery', () => {
  const description = 'var offer_details={"content":"<img data-ks-lazyload=\"https://cbu01.alicdn.com/img/ibank/lazy.jpg\"><img srcset=\"https://cbu01.alicdn.com/img/ibank/one.jpg 1x, https://cbu01.alicdn.com/img/ibank/two.jpg 2x\">"};';
  const parsed = Importer.parseDescriptionDocument(description);
  assert.equal(parsed.images.length, 3);
  assert.equal(Importer.imageUrl('https://itemcdn.tmall.com/1688offer/not-an-image'), '');
  const gallery = Array.from({ length: 22 }, (_, index) => `https://cbu01.alicdn.com/img/ibank/gallery-${index}.jpg`);
  const desktop = Importer.parseDesktopOfferDocument(`<script>window.context={"gallery":{"fields":{"offerImgList":${JSON.stringify(gallery)}}},"description":{"fields":{"detailUrl":"https://itemcdn.tmall.com/1688offer/example"}}};</script>`);
  assert.equal(desktop.gallery.length, 22);
  assert.equal(desktop.descriptionUrl, 'https://itemcdn.tmall.com/1688offer/example');
});

test('1688 media parser captures verified offer videos and keeps them same-origin proxied', () => {
  const video = 'https://cloud.video.taobao.com/play/u/3050596981/p/2/e/6/t/1/1763845575970661.mp4';
  const mobile = `<script>window.__INIT_DATA=${JSON.stringify({
    data: { main: { data: { offerId: '1081098810208', offerImgList: ['https://cbu01.alicdn.com/img/ibank/main.jpg'], videoUrl: video } } },
    globalData: {},
  })}</script>`;
  const parsed = Importer.parseMobileOfferDocument(mobile);
  assert.deepEqual(parsed.videos, [video]);
  const product = Importer.toProduct({ offerId: '1081098810208', sku: 'VIDEO-01', titleVietnamese: 'Trang phục biểu diễn', videos: parsed.videos });
  assert.equal(product.videos.length, 1);
  assert.match(product.videos[0], /^\/api\/1688-video\?/);
  assert.equal(new URL(`https://store.invalid${product.videos[0]}`).searchParams.get('url'), video);
});

test('1688 detail parser accepts the current desktop window.context shape', () => {
  const offer = {
    offerId: '1081098810208',
    subject: '儿童演出服',
    detailUrl: 'https://itemcdn.tmall.com/1688offer/example-detail',
    imageList: [{ fullPathImageURI: 'https://cbu01.alicdn.com/img/ibank/main.jpg' }],
    skuProps: [
      { prop: 'Color', value: [{ name: 'Top + Pants' }, { name: 'Gray skirt' }] },
      { prop: 'Suitable for height', value: [{ name: '110' }, { name: '120' }] },
    ],
    featureAttributes: [{ name: 'Brand', value: 'Other' }],
  };
  const skuMapOriginal = [
    { skuId: 101, specAttrs: 'Top + Pants&gt;110', price: '67.00', canBookCount: 500 },
    { skuId: 102, specAttrs: 'Gray skirt&gt;120', price: '33.00', canBookCount: 488 },
  ];
  const parsed = Importer.detailPayload({ result: {
    global: { globalData: { model: { offerDetail: offer } } },
    data: {
      Root: { fields: { dataJson: { skuModel: { skuInfoMapOriginal: skuMapOriginal } } } },
      mainPrice: { fields: { finalPriceModel: { tradeWithoutPromotion: { skuMapOriginal } } } },
    },
  } });
  assert.equal(parsed.offerId, '1081098810208');
  assert.equal(parsed.gallery.length, 1);
  assert.deepEqual(parsed.options.map(item => item.name), ['Màu sắc', 'Chiều cao']);
  assert.deepEqual(parsed.variants[0].values, { color: 'Top + Pants', 'suitable-for-height': '110' });
  assert.equal(parsed.variants[1].stock, 488);
  assert.equal(parsed.attributes[0].name, 'Brand');
  assert.equal(parsed.descriptionUrl, 'https://itemcdn.tmall.com/1688offer/example-detail');
});

test('enrichment never replaces a verified product with empty/CAPTCHA data', () => {
  const product = Importer.toProduct({ offerId: '123456789', sku: 'SAFE-01', titleVietnamese: 'Sản phẩm thật', gallery: ['https://cbu01.alicdn.com/img/ibank/real.jpg'], description: 'Mô tả đã được kiểm tra và giữ nguyên.' });
  const merged = Importer.mergeEnrichment(product, { detailStatus: 'blocked_or_empty', gallery: [], description: '' });
  assert.equal(merged.image, product.image);
  assert.equal(merged.description, product.description);
  assert.equal(merged.source.detailStatus, 'blocked_or_empty');
});

test('enrichment converts verified CNY SKU prices using the product source rates', () => {
  const product = Importer.productFromOffer({
    id: '123456790',
    subject: 'Áo có biến thể',
    offerPrice: '10',
    offerImages: [{ imageURI: 'img/ibank/example.jpg' }],
  }, {
    titleVi: 'Áo có biến thể',
    exchangeRateCnyVnd: 3800,
    exchangeRateCnyBase: 0.13,
    baseCurrency: 'USD',
    baseCurrencyDecimals: 2,
    priceMultiplier: 2,
    regionId: 'vn',
  });
  const merged = Importer.mergeEnrichment(product, {
    options: [{ id: 'size', name: 'Kích thước', values: ['S'] }],
    variants: [{ id: 'sku-s', sku: 'REMOTE-S', values: { size: 'S' }, priceCny: 12.5, stock: 3, enabled: true }],
  });
  assert.equal(merged.variants[0].price, 163);
  assert.equal(merged.variants[0].regionalPrices.vn, 95000);
  assert.equal(merged.price, 163);
  assert.equal(merged.stock, 3);
});
