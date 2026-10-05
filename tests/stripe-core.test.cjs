const test = require('node:test');
const assert = require('node:assert/strict');

let Core;
test('Stripe server helpers keep keys and origins constrained', async () => {
  Core ||= await import('../server/stripe-core.mjs');
  assert.equal(Core.keyMode('sk_test_123'), 'test');
  assert.equal(Core.keyMode('sk_live_123'), 'live');
  assert.equal(Core.keyMode('sk_test_bad-key'), null);
  assert.equal(Core.validOrigin('https://crocs-admin-supabase.vercel.app'), 'https://crocs-admin-supabase.vercel.app');
  assert.equal(Core.validOrigin('javascript:alert(1)'), null);
  assert.equal(Core.validOrigin('https://crocs-admin-supabase.vercel.app/path'), null);
});

test('Stripe checkout request normalizes and rejects duplicate lines', async () => {
  Core ||= await import('../server/stripe-core.mjs');
  const request = Core.normalizeRequest({
    requestId: '5dc9b6f8-56c6-4c7f-8f89-1d4f16bf0f03',
    customer: { email: 'buyer@example.com', name: 'Buyer Name', phone: '', address: '1 Croc Street', city: 'London', postcode: 'SW1A 1AA' },
    deliveryMethod: 'standard',
    lines: [{ productId: 'p1', variantId: '', size: '7', quantity: 1 }],
  });
  assert.equal(request.lines.length, 1);
  assert.throws(() => Core.normalizeRequest({ ...request, lines: [...request.lines, { ...request.lines[0] }] }), /duplicated/i);
});

test('Stripe readiness never enables live payments without an explicit server flag', async () => {
  Core ||= await import('../server/stripe-core.mjs');
  const environment = { backendKey: true, secretKey: true, webhookSecret: true, origin: 'https://crocs-admin-supabase.vercel.app', mode: 'live', liveAllowed: false };
  const result = Core.readiness({ enabled: true, mode: 'live' }, environment, true);
  assert.equal(result.ready, false);
  assert.equal(result.reason, 'live_locked');
});

test('Stripe checkout carries the server-resolved regional currency', async () => {
  Core ||= await import('../server/stripe-core.mjs');
  const request = Core.normalizeRequest({
    requestId: '5dc9b6f8-56c6-4c7f-8f89-1d4f16bf0f03', regionId: 'vn',
    customer: { email: 'buyer@example.com', name: 'Buyer Name', phone: '', address: '1 Croc Street', city: 'Hanoi', postcode: '10000' },
    deliveryMethod: 'standard', lines: [{ productId: 'p1', size: '7', quantity: 1 }],
  });
  assert.equal(request.regionId, 'vn');
  const params = Core.checkoutParameters({ id: 'attempt', order_id: 'order', email: 'buyer@example.com', currency: 'vnd', subtotal: 1100000, shipping: 2185, total: 1102185, delivery_method: 'standard', expires_at: new Date(Date.now() + 600000).toISOString(), lines: [{ title: 'Classic Clog', quantity: 1, price: 1100000 }] }, 'https://crocs-admin-supabase.vercel.app');
  assert.equal(params.line_items[0].price_data.currency, 'vnd');
  assert.equal(params.shipping_options[0].shipping_rate_data.fixed_amount.currency, 'vnd');
});
