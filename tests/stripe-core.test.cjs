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
