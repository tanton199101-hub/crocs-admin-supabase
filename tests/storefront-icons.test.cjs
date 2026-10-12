const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const html = fs.readFileSync(path.join(__dirname, '../index.html'), 'utf8');
const source = fs.readFileSync(path.join(__dirname, '../script.js'), 'utf8');

test('Sally Kids categories use distinct clothing icons and retain their shop links', () => {
  const cards = [...html.matchAll(/<article class="icon-card category-card">([\s\S]*?)<\/article>/g)].map(match => match[1]);
  const expected = [
    ['Bé gái', 'dress', 'shop.html?collection=col-1688-dresses'],
    ['Bé trai', 'shirt', 'shop.html?collection=col-1688-tops'],
    ['Đồ đôi', 'matching', 'shop.html'],
    ['Đi học', 'backpack', 'shop.html?collection=col-1688-tops'],
    ['Phụ kiện', 'accessories', 'shop.html?collection=col-1688-accessories'],
  ];
  assert.equal(cards.length, expected.length);
  expected.forEach(([title, icon, href], index) => {
    assert.ok(cards[index].includes(`<h3>${title}</h3>`));
    assert.ok(cards[index].includes(`href="#sally-icon-${icon}"`));
    assert.ok(cards[index].includes(`<a href="${href}">`));
    assert.doesNotMatch(cards[index], /\p{Extended_Pictographic}|<img\b/u);
  });
});

test('all inline icon references resolve and decorative SVGs stay out of the accessibility tree', () => {
  const symbols = [...html.matchAll(/<symbol id="([^"]+)" viewBox="0 0 96 96">/g)].map(match => match[1]);
  assert.equal(symbols.length, new Set(symbols).size, 'Sprite IDs must be unique');
  const references = [...html.matchAll(/<use href="#([^"]+)"/g)].map(match => match[1]);
  references.forEach(id => assert.ok(symbols.includes(id), `Missing symbol ${id}`));
  const decorativeSvgs = [...html.matchAll(/<svg class="sally-illustration[^>]*>/g)].map(match => match[0]);
  assert.equal(decorativeSvgs.length, 18);
  decorativeSvgs.forEach(svg => {
    assert.match(svg, /aria-hidden="true"/);
    assert.match(svg, /focusable="false"/);
    assert.match(svg, /viewBox="0 0 96 96"/);
  });
});

test('accessory illustrations show the named item instead of platform emoji', () => {
  const cards = [...html.matchAll(/<article class="product-card charm-card">([\s\S]*?)<\/article>/g)].map(match => match[1]);
  const icons = ['hat', 'bag', 'hairclip', 'bear', 'socks', 'shoe', 'umbrella', 'family', 'matching', 'friends'];
  assert.equal(cards.length, icons.length);
  cards.forEach((card, index) => {
    assert.ok(card.includes(`href="#sally-icon-${icons[index]}"`));
    assert.doesNotMatch(card, /\p{Extended_Pictographic}|sally-kids-hero/u);
  });
  assert.equal((html.match(/<span data-i18n-label>/g) || []).length, 3);
});

function storefrontHarness() {
  const events = new Map();
  const classList = { toggle() {}, add() {}, remove() {}, contains: () => false };
  const nodes = new Map();
  for (const selector of ['#catalogProductGrid', '#catalogFilters', '#catalogCount', '#catalogTitle', '#catalogLoadMore', '#cartCount', '#cartEmpty', '#cartItems', '#cartSummary', '#cartSubtotal']) {
    nodes.set(selector, { innerHTML: '', textContent: '', classList, listeners: new Map(), addEventListener(type, callback) { this.listeners.set(type, callback); }, querySelectorAll: () => [] });
  }
  const document = { body: { classList }, querySelector: selector => nodes.get(selector) || null, querySelectorAll: () => [], addEventListener() {} };
  const commerce = {
    products: [], readCart: () => [], money: String, image: String,
    escape: value => String(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char])),
  };
  const window = { CrocsCommerce: commerce, location: { hash: '' }, scrollY: 0, addEventListener: (type, callback) => events.set(type, callback) };
  vm.runInNewContext(source, { document, window });
  return { nodes, events, window };
}

test('catalog filters choose semantic icons, escape catalog text and preserve collection selection', () => {
  const { nodes, events, window } = storefrontHarness();
  const collections = [
    ['col1', 'New arrivals', 'new'], ['col2', 'Cozy favourites', 'favourite'],
    ['col-1688-performance', 'Trang phục biểu diễn', 'performance'],
    ['col-1688-dresses', 'Váy & đầm trẻ em', 'dress'], ['col-1688-tops', 'Áo & đồng phục', 'shirt'],
    ['col-1688-bottoms', 'Quần & bộ mặc', 'trousers'], ['col-1688-accessories', 'Phụ kiện thời trang', 'accessories'],
    ['custom-matching', 'Đồ đôi gia đình', 'matching'], ['custom-school', 'Đi học', 'backpack'],
    ['custom-dress', 'Váy mùa hè', 'dress'], ['custom-bottoms', 'Quần short', 'trousers'],
    ['custom-tops', 'Áo thun', 'shirt'], ['custom-accessories', 'Phụ kiện', 'accessories'],
    ['custom-unknown', '<script>alert(1)</script>', 'grid'],
  ];
  const products = [{ id: 'dress-1', title: 'Váy hoa', status: 'Active', image: 'dress.jpg', price: 1000 }];
  window.CrocsCommerce.products = products;
  events.get('crocs:catalog')({ detail: { products, collections: collections.map(([id, title]) => ({ id, title, status: 'Active', productIds: ['dress-1'] })) } });
  let filters = nodes.get('#catalogFilters').innerHTML;
  collections.forEach(([id, , icon]) => {
    const button = filters.match(new RegExp(`<button[^>]+data-collection="${id}"[\\s\\S]*?<\\/button>`))?.[0];
    assert.ok(button, `Missing collection filter ${id}`);
    assert.ok(button.includes(`href="#sally-icon-${icon}"`), `Wrong icon for ${id}`);
    assert.match(button, /aria-pressed="false"/);
    assert.match(button, /aria-hidden="true" focusable="false"/);
  });
  assert.doesNotMatch(filters, /<script>/);
  assert.match(filters, /&lt;script&gt;/);
  nodes.get('#catalogFilters').listeners.get('click')({ target: { closest: () => ({ dataset: { collection: 'col-1688-dresses' } }) } });
  assert.equal(window.location.hash, 'collection-col-1688-dresses');
  assert.equal(nodes.get('#catalogTitle').textContent, 'Váy & đầm trẻ em');
  filters = nodes.get('#catalogFilters').innerHTML;
  assert.match(filters, /data-collection="col-1688-dresses" aria-pressed="true"/);
  assert.match(filters, /data-collection="" aria-pressed="false"/);
  assert.equal((filters.match(/aria-pressed="true"/g) || []).length, 1);
  assert.match(nodes.get('#catalogProductGrid').innerHTML, /data-product-id="dress-1"/);
});

test('language changes translate only tab labels and retain the icon subtree', async () => {
  const labels = { '#tab-tattoos': { textContent: 'Mũ & túi' }, '#tab-accessories': { textContent: 'Tất & giày' }, '#tab-matching': { textContent: 'Đồ đôi' } };
  let overwrittenButtons = 0;
  const buttons = Object.fromEntries(Object.entries(labels).map(([id, label]) => [id, {
    closest: () => null,
    querySelector: selector => selector === '[data-i18n-label]' ? label : null,
    get textContent() { return label.textContent; },
    set textContent(value) { overwrittenButtons += 1; label.textContent = value; },
  }]));
  const document = { documentElement: {}, querySelector: () => null, querySelectorAll: selector => buttons[selector] ? [buttons[selector]] : [] };
  const window = { document, location: { search: '?region=vn&language=vi' }, addEventListener() {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../regional-commerce.js'), 'utf8'), { window, URLSearchParams });
  await window.CrocsRegional.ready;
  assert.equal(labels['#tab-tattoos'].textContent, 'Mũ & túi');
  window.CrocsRegional.setLanguage('en');
  assert.equal(labels['#tab-tattoos'].textContent, 'Hats & bags');
  assert.equal(labels['#tab-accessories'].textContent, 'Socks & shoes');
  assert.equal(labels['#tab-matching'].textContent, 'Matching sets');
  window.CrocsRegional.setLanguage('vi');
  assert.equal(labels['#tab-accessories'].textContent, 'Tất & giày');
  assert.equal(overwrittenButtons, 0, 'Translating a button must not remove its SVG');
});
