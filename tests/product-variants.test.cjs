const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const Commerce = require('../commerce.js');

const decode = value => String(value).replace(/&(amp|quot|#39|lt|gt);/g, (_, entity) => ({ amp: '&', quot: '"', '#39': "'", lt: '<', gt: '>' })[entity]);
async function harness(input, requestedVariant = '') {
  const product = Commerce.normalize(input);
  let html = '', controls = [];
  const events = new Map(), added = [], toasts = [];
  const quantity = { textContent: '1' };
  const form = { handlers: {}, addEventListener(type, callback) { this.handlers[type] = callback; } };
  const main = {
    get innerHTML() { return html; },
    set innerHTML(value) {
      html = value;
      controls = Array.from(value.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/g), ([, attrs, content]) => {
        const attributes = Object.fromEntries(Array.from(attrs.matchAll(/([\w-]+)="([^"]*)"/g), ([, key, val]) => [key, decode(val)]));
        const dataset = Object.fromEntries(Object.entries(attributes).filter(([key]) => key.startsWith('data-')).map(([key, val]) => [key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()), val]));
        return { dataset, attributes, content, disabled: /\sdisabled(?:\s|$)/.test(attrs), handlers: {},
          addEventListener(type, callback) { this.handlers[type] = callback; },
          focus() { document.activeElement = this; }, scrollIntoView() {},
          setAttribute(key, val) { this.attributes[key] = val; }, classList: { toggle() {} },
        };
      });
      document.activeElement = null;
    },
    setAttribute() {},
    querySelector(selector) { return selector === '#productForm' ? form : selector === '#quantityValue' ? quantity : null; },
    querySelectorAll(selector) {
      const attr = selector.match(/^\[([\w-]+)\]$/)?.[1];
      return attr ? controls.filter(item => Object.hasOwn(item.attributes, attr)) : [];
    },
  };
  const document = {
    activeElement: null, head: { querySelector: () => null, appendChild() {} },
    querySelector: selector => selector === '#productMain' ? main : null, createElement: () => ({ setAttribute() {} }),
  };
  const query = `?id=${product.id}${requestedVariant ? `&variant=${requestedVariant}` : ''}`;
  const root = {
    location: { href: `https://store.invalid/product${query}`, search: query, protocol: 'https:' }, scrollY: 420,
    history: { replaceState(_state, _title, url) { root.location.href = url; } },
    addEventListener: (type, callback) => events.set(type, callback), scrollTo: ({ top }) => { root.scrollY = top; },
    CrocsCommerceUI: { toast: text => toasts.push(text) },
    CrocsCommerce: {
      ...Commerce, products: [product], ready: Promise.resolve(), loadProduct: async () => product,
      rememberRecentlyViewed() {}, readRecentlyViewed: () => [], loadCatalogPage: null, enhanceImages() {},
      add: (id, selection, count) => added.push({ id, selection, count }),
    },
  };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../product.js'), 'utf8'), { window: root, document, URL, URLSearchParams });
  await new Promise(resolve => setImmediate(resolve));
  const button = (option, value) => controls.find(item => item.dataset.optionId === option && item.dataset.optionValue === value);
  return { main, root, events, added, toasts, document, button,
    classifications: () => controls.filter(item => item.dataset.optionId === 'outfit'),
    toggle: () => controls.find(item => item.dataset.optionToggle === 'outfit'),
    click: item => { assert.ok(item && !item.disabled); item.focus(); item.handlers.click(); },
    submit: () => form.handlers.submit({ preventDefault() {} }),
  };
}

function fixture() {
  const values = ['Hết hàng', 'Áo + quần', 'Áo + váy', 'Đỏ', 'Trắng', 'Đen', 'Xanh', 'Bộ "đặc biệt" + tất'];
  return {
    id: 'variant-ui', title: 'Trang phục trẻ em', price: 1000, stock: 20, status: 'Active', image: 'https://cbu01.alicdn.com/front.jpg',
    options: [{ id: 'outfit', name: 'Màu sắc', values }, { id: 'height', name: 'Chiều cao', values: ['110cm', '120cm'] }],
    variants: values.flatMap((value, index) => ['110cm', '120cm'].map((size, sizeIndex) => ({
      id: `sku-${index}-${sizeIndex}`, sku: `sku-${index}-${sizeIndex}`, values: { outfit: value, height: size },
      price: 1000 + index * 100 + sizeIndex * 10, stock: index === 0 || (index === 7 && sizeIndex === 0) ? 0 : 5,
      enabled: true, image: `https://cbu01.alicdn.com/outfit-${index}.jpg`,
    }))),
  };
}

test('variant UI expands, keeps raw values and focus, collapses with selected item and adds the exact SKU', async () => {
  const ui = await harness(fixture());
  assert.match(ui.main.innerHTML, /<legend[^>]*>Phân loại<\/legend>/);
  assert.match(ui.main.innerHTML, /<legend[^>]*>Size \(cm\)<\/legend>/);
  assert.equal(ui.classifications().length, 6);
  assert.equal(ui.button('outfit', 'Hết hàng').disabled, true);
  assert.equal(ui.button('outfit', 'Áo + quần').attributes['aria-pressed'], 'true', 'default to an in-stock variant');
  ui.click(ui.toggle());
  assert.equal(ui.classifications().length, 8);
  assert.equal(ui.toggle().attributes['aria-expanded'], 'true');
  const lastValue = 'Bộ "đặc biệt" + tất';
  ui.click(ui.button('outfit', lastValue));
  assert.equal(ui.button('height', '120cm').attributes['aria-pressed'], 'true');
  assert.equal(ui.button('height', '110cm').disabled, true);
  assert.match(ui.toasts[0], /Size \(cm\) 120/);
  assert.equal(ui.document.activeElement, ui.button('outfit', lastValue));
  assert.equal(ui.root.scrollY, 420);
  assert.match(ui.main.innerHTML, /outfit-7\.jpg/);
  ui.events.get('crocs:language-change')();
  assert.equal(ui.classifications().length, 8, 'refresh keeps expanded state');
  ui.click(ui.toggle());
  assert.equal(ui.classifications().length, 6);
  assert.equal(ui.button('outfit', lastValue).attributes['aria-pressed'], 'true');
  assert.equal(ui.document.activeElement, ui.toggle());
  ui.submit();
  assert.equal(ui.added[0].selection.variantId, 'sku-7-1');
  assert.equal(ui.added[0].selection.size, '120cm');
  assert.equal(new URL(ui.root.location.href).searchParams.get('variant'), 'sku-7-1');
});

test('size choice keeps classification and explicit out-of-stock links are not silently replaced', async () => {
  const ui = await harness(fixture(), 'sku-7-1');
  assert.equal(ui.button('outfit', 'Bộ "đặc biệt" + tất').attributes['aria-pressed'], 'true');
  ui.click(ui.button('outfit', 'Áo + quần'));
  assert.equal(ui.button('height', '120cm').attributes['aria-pressed'], 'true', 'retain the selected size');
  ui.click(ui.button('height', '110cm'));
  assert.equal(ui.button('outfit', 'Áo + quần').attributes['aria-pressed'], 'true');
  ui.submit();
  assert.equal(ui.added[0].selection.variantId, 'sku-1-0');
  const outOfStock = await harness(fixture(), 'sku-0-0');
  assert.equal(outOfStock.button('outfit', 'Hết hàng').attributes['aria-pressed'], 'true');
  assert.match(outOfStock.main.innerHTML, /class="commerce-primary" type="submit" disabled/);
});
