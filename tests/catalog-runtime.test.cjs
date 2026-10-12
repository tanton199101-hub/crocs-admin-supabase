const test = require('node:test');
const assert = require('node:assert/strict');

test('fallback catalogue retains variant filters without changing summary inventory or reviving detail-only products', async () => {
  const { catalogWithMirrorOptions } = await import('../server/catalog-runtime.mjs');
  const { catalogPage, presentation } = await import('../server/catalog-core.mjs');
  const input = {
    products: [
      { id: 'outfit', title: 'Trang phục trẻ em', price: 200, stock: 3, status: 'Active', detailChunk: 0 },
      { id: 'admin', title: 'Áo tùy chọn', price: 300, stock: 1, status: 'Active', detailChunk: 0,
        options: [{ id: 'colour', name: 'Phân loại', values: ['Xanh'] }] },
      { id: 'draft', title: 'Bản nháp', price: 100, stock: 4, status: 'Draft', detailChunk: 1 },
    ],
  };
  const original = structuredClone(input);
  const reads = [];
  const result = await catalogWithMirrorOptions(input, async chunk => {
    reads.push(chunk);
    if (chunk === 1) throw new Error('Unavailable chunk');
    return {
      outfit: { id: 'outfit', price: 999, stock: 100, status: 'Draft',
        options: [{ id: 'outfit', name: 'Màu sắc', values: ['Áo + quần'] }, { id: 'height', name: 'Chiều cao', values: ['110'] }],
        variantsPacked: [['sku', 0, 0, 999, 100]], gallery: ['large.jpg'] },
      admin: { id: 'admin', options: [{ id: 'colour', name: 'Màu sắc', values: ['Đỏ'] }] },
      hidden: { id: 'hidden', price: 999, stock: 100, status: 'Active' },
    };
  });
  assert.deepEqual(reads, [0, 1], 'read a shared chunk only once');
  assert.deepEqual(result.products.map(product => product.id), ['outfit', 'admin', 'draft']);
  assert.equal(result.products[0].price, 200);
  assert.equal(result.products[0].stock, 3);
  assert.equal(result.products[0].status, 'Active');
  assert.equal(result.products[0].variantsPacked, undefined);
  assert.equal(result.products[0].gallery, undefined);
  assert.deepEqual(result.products[1].options, original.products[1].options);
  assert.deepEqual(input, original);
  const page = catalogPage({ ...result, products: result.products.map(product => presentation(product, null)) }, new URLSearchParams('color=ao-quan&size=110'));
  assert.equal(page.total, 1);
  assert.deepEqual(page.products[0].colors, ['Áo + quần']);
  assert.equal(page.activeTotal, 2);
});

test('an RPC outage serves a filterable catalogue from the shipped mirror', async () => {
  const originalFetch = global.fetch;
  let requests = 0;
  global.fetch = async () => { requests += 1; throw new Error('Simulated network timeout'); };
  try {
    const { catalogData } = await import('../server/catalog-runtime.mjs?rpc-outage');
    const { catalogPage } = await import('../server/catalog-core.mjs');
    const catalog = await catalogData();
    assert.equal(requests, 1);
    assert.ok(catalog.products.length > 0);
    const filtered = catalogPage(catalog, new URLSearchParams('color=ao-quan'));
    assert.ok(filtered.total > 0, 'a real mirror option remains filterable when RPC is unavailable');
    assert.ok(filtered.products.every(product => product.colors.includes('Áo + quần')));
    assert.ok(catalog.products.every(product => !product.variantsPacked && !product.variants), 'fallback summaries must not retain SKU matrices');
  } finally { global.fetch = originalFetch; }
});
