const test = require('node:test');
const assert = require('node:assert/strict');
const Options = require('../variant-options.js');

test('variant option names use shopper-friendly Vietnamese semantics', () => {
  assert.equal(Options.name('Màu sắc'), 'Phân loại');
  assert.equal(Options.name('Color'), 'Phân loại');
  assert.equal(Options.name('Suitable for height'), 'Size (cm)');
  assert.equal(Options.name('Chiều cao'), 'Size (cm)');
  assert.equal(Options.name('Height (cm)'), 'Size (cm)');
  assert.equal(Options.name('Size UK'), 'Size UK');
  assert.equal(Options.name('Kích thước'), 'Kích thước');
  assert.equal(Options.kind({ name: 'Phân loại' }), 'classification');
  assert.equal(Options.kind({ name: 'Size (cm)' }), 'size-cm');
});

test('normalization only changes presentation names and preserves SKU identities', () => {
  const source = [{ id: 'colour-1', name: 'Màu sắc', values: ['Áo + Quần'], images: { front: 'x' } }, { id: 'height-1', name: 'Chiều cao', values: ['110cm'] }];
  const normalized = Options.normalize(source);
  assert.deepEqual(normalized, [{ id: 'colour-1', name: 'Phân loại', values: ['Áo + Quần'], images: { front: 'x' } }, { id: 'height-1', name: 'Size (cm)', values: ['110cm'] }]);
  assert.equal(source[0].name, 'Màu sắc');
  assert.equal(Options.valueLabel(normalized[1], '110cm'), '110');
  assert.equal(Options.valueLabel(normalized[0], 'Áo+Quần'), 'Áo + Quần');
});

test('long classifications collapse without losing the selected value', () => {
  const option = { id: 'outfit', name: 'Phân loại', values: ['A', 'B', 'C', 'D', 'E', 'F', 'G'] };
  assert.deepEqual(Options.visibleValues(option, '', false), ['A', 'B', 'C', 'D', 'E', 'F']);
  assert.deepEqual(Options.visibleValues(option, 'G', false), ['A', 'B', 'C', 'D', 'E', 'G']);
  assert.deepEqual(Options.visibleValues(option, 'G', true), option.values);
});

test('candidate selection respects stock and keeps size stable when choosing a classification', () => {
  const product = {
    options: [
      { id: 'type', name: 'Phân loại', values: ['A', 'B'] },
      { id: 'height', name: 'Size (cm)', values: ['110', '120'] },
    ],
    variants: [
      { id: 'a110', values: { type: 'A', height: '110' }, stock: 5, enabled: true },
      { id: 'a120', values: { type: 'A', height: '120' }, stock: 0, enabled: true },
      { id: 'b120', values: { type: 'B', height: '120' }, stock: 3, enabled: true },
      { id: 'disabled', values: { type: 'B', height: '110' }, stock: 5, enabled: false },
    ],
  };
  const selected = { type: 'A', height: '110' };
  assert.equal(Options.candidate(product, selected, product.options[0], 'B').id, 'b120');
  assert.equal(Options.candidate(product, selected, product.options[1], '120'), null, 'size cannot silently switch classification');
  assert.equal(Options.candidate(product, selected, product.options[0], 'A').id, 'a110');
});
