import { createHash } from 'node:crypto';

export class HttpError extends Error {
  constructor(status, message, code = 'request_failed') { super(message); this.status = status; this.code = code; }
}

export const EVENTS = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired']);

export function keyMode(key = '') {
  if (/^sk_test_[A-Za-z0-9]+$/.test(key)) return 'test';
  if (/^sk_live_[A-Za-z0-9]+$/.test(key)) return 'live';
  return null;
}

export function environmentStatus(env = process.env) {
  const mode = keyMode(env.STRIPE_SECRET_KEY);
  const secretKey = Boolean(mode);
  const webhookSecret = /^whsec_[A-Za-z0-9]+$/.test(env.STRIPE_WEBHOOK_SECRET || '');
  const backendKey = Boolean(env.SUPABASE_SECRET_KEY || env.SUPABASE_SERVICE_ROLE_KEY);
  const origin = validOrigin(env.STOREFRONT_URL || 'https://crocs-admin-supabase.vercel.app');
  return { secretKey, webhookSecret, backendKey, mode, origin, liveAllowed: env.STRIPE_ALLOW_LIVE === 'true', publishableKey: /^pk_(test|live)_[A-Za-z0-9]+$/.test(env.STRIPE_PUBLISHABLE_KEY || '') };
}

export function validOrigin(value) {
  try {
    const url = new URL(value);
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null;
    if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) return null;
    return url.origin;
  } catch { return null; }
}

export function assertOrigin(origin, expected) {
  if (!expected || origin !== expected) throw new HttpError(403, 'Open checkout from the store website.', 'invalid_origin');
}

export function readiness(payment, environment, migration = true) {
  if (!payment?.enabled) return { ready: false, reason: 'disabled', message: 'Stripe checkout is not enabled.' };
  if (!migration) return { ready: false, reason: 'migration_required', message: 'The payment database is not ready.' };
  if (!environment.backendKey || !environment.secretKey || !environment.webhookSecret || !environment.origin) return { ready: false, reason: 'configuration_required', message: 'Secure payment is being configured. Please try again later.' };
  if (payment.mode !== environment.mode) return { ready: false, reason: 'mode_mismatch', message: 'The payment mode does not match the server key.' };
  if (payment.mode === 'live' && !environment.liveAllowed) return { ready: false, reason: 'live_locked', message: 'Live payments have not been approved on the server.' };
  return { ready: true, reason: 'ready', message: '' };
}

export function normalizeRequest(body) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid checkout request.');
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(body.requestId || '')) throw new HttpError(400, 'Start a new checkout session.');
  const customer = {};
  for (const [key, min, max] of [['email', 3, 320], ['name', 2, 120], ['phone', 0, 40], ['address', 3, 240], ['city', 2, 80], ['postcode', 2, 16]]) {
    const value = body.customer?.[key];
    if (typeof value !== 'string' || value.trim().length < min || value.trim().length > max) throw new HttpError(400, `Enter valid ${key} details.`);
    customer[key] = value.trim();
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) throw new HttpError(400, 'Enter a valid email address.');
  if (!['standard', 'express'].includes(body.deliveryMethod)) throw new HttpError(400, 'Choose a delivery option.');
  if (!Array.isArray(body.lines) || !body.lines.length || body.lines.length > 20) throw new HttpError(400, 'Add a product to your bag first.');
  const seen = new Set();
  let totalQuantity = 0;
  const lines = body.lines.map(line => {
    if (!line || typeof line.productId !== 'string' || !line.productId || line.productId.length > 120 || typeof line.size !== 'string' || !line.size.trim() || line.size.length > 120 || (line.variantId != null && (typeof line.variantId !== 'string' || line.variantId.length > 120)) || !Number.isInteger(line.quantity) || line.quantity < 1 || line.quantity > 10) throw new HttpError(400, 'A bag item is invalid.');
    const clean = { productId: line.productId, variantId: line.variantId || '', size: line.size.trim(), quantity: line.quantity };
    const key = JSON.stringify([clean.productId, clean.variantId || clean.size]);
    if (seen.has(key)) throw new HttpError(400, 'A bag item is duplicated.');
    seen.add(key); totalQuantity += line.quantity;
    return clean;
  }).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (totalQuantity > 20) throw new HttpError(400, 'Your bag is limited to 20 items.');
  return { requestId: body.requestId.toLowerCase(), customer, deliveryMethod: body.deliveryMethod, lines };
}

export function fingerprint(request, mode) {
  return createHash('sha256').update(JSON.stringify({ customer: request.customer, lines: request.lines, deliveryMethod: request.deliveryMethod, mode })).digest('hex');
}

export function checkoutParameters(reservation, origin, methods = 'automatic') {
  if (!origin || !Array.isArray(reservation?.lines) || !reservation.lines.length || !Number.isSafeInteger(reservation.total) || reservation.total < 30 || reservation.currency !== 'gbp') throw new HttpError(409, 'The checkout amount is invalid. Please contact the store.', 'invalid_quote');
  const subtotal = reservation.lines.reduce((sum, line) => {
    if (!Number.isSafeInteger(line.price) || line.price < 0 || !Number.isSafeInteger(line.quantity) || line.quantity < 1) throw new HttpError(409, 'The checkout amount is invalid.');
    return sum + line.price * line.quantity;
  }, 0);
  if (subtotal !== reservation.subtotal || subtotal + reservation.shipping !== reservation.total) throw new HttpError(409, 'The checkout amount is invalid.');
  const metadata = { store_id: 'default', attempt_id: reservation.id, order_id: reservation.order_id };
  const params = {
    mode: 'payment', client_reference_id: reservation.id, customer_email: reservation.email,
    success_url: `${origin}/checkout.html?payment=success&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/checkout.html?payment=cancelled&session_id={CHECKOUT_SESSION_ID}`,
    expires_at: Math.floor(Date.parse(reservation.expires_at) / 1000),
    line_items: reservation.lines.map(line => ({ quantity: line.quantity, price_data: { currency: 'gbp', unit_amount: line.price, product_data: { name: `${line.title}${line.variantTitle ? ` (${line.variantTitle})` : ''}`.slice(0, 250) } } })),
    shipping_options: [{ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: reservation.shipping, currency: 'gbp' }, display_name: reservation.delivery_method === 'express' ? 'Express delivery' : 'Standard delivery' } }],
    metadata, payment_intent_data: { metadata }, locale: 'en-GB',
    // Local checkout already collected the delivery address. No tax, discounts,
    // currency conversion or recovery links may change the reserved total.
  };
  if (methods === 'card') params.payment_method_types = ['card'];
  if (reservation.shipping > 0) params.shipping_options = [{ shipping_rate_data: { type: 'fixed_amount', fixed_amount: { amount: reservation.shipping, currency: 'gbp' }, display_name: reservation.delivery_method === 'express' ? 'Express delivery' : 'Standard delivery' } }];
  else delete params.shipping_options;
  return params;
}

export function eventPayload(event) {
  if (!EVENTS.has(event?.type)) return null;
  const session = event.data?.object;
  if (session?.object !== 'checkout.session' || session.mode !== 'payment' || session.metadata?.store_id !== 'default') return null;
  const attemptId = session.metadata?.attempt_id;
  const orderId = session.metadata?.order_id;
  if (!/^[0-9a-f-]{36}$/i.test(attemptId || '') || !/^[0-9a-f-]{36}$/i.test(orderId || '') || session.client_reference_id !== attemptId) throw new HttpError(400, 'Invalid payment reference.');
  let status = 'pending';
  if ((event.type === 'checkout.session.completed' || event.type === 'checkout.session.async_payment_succeeded') && ['paid', 'no_payment_required'].includes(session.payment_status)) status = 'paid';
  if (event.type === 'checkout.session.expired') status = 'expired';
  if (event.type === 'checkout.session.async_payment_failed') status = 'failed';
  if (status === 'pending') return null;
  return { p_event_id: event.id, p_attempt_id: attemptId, p_order_id: orderId, p_session_id: session.id, p_status: status, p_amount_total: session.amount_total, p_currency: session.currency, p_livemode: session.livemode, p_payment_intent_id: typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id || null };
}

export function safeCheckoutUrl(url) {
  try { const parsed = new URL(url); return parsed.protocol === 'https:' && parsed.hostname === 'checkout.stripe.com' && !parsed.username && !parsed.password; } catch { return false; }
}
