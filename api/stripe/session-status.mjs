import { attemptBySession, privateDb, send, failure, method } from '../../server/stripe-runtime.mjs';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    const params = new URL(req.url, 'https://store.invalid').searchParams;
    const attempt = await attemptBySession(params.get('session_id'));
    // The return URL is not proof of payment. Only the verified webhook writes
    // these fields. No email, address, lines or other customer data are exposed.
    if (attempt.status !== 'paid') return send(res, 200, { order_number: null, total: null, currency: attempt.currency, region_id: attempt.region_id, status: attempt.status === 'review' ? 'review' : 'processing', mode: attempt.mode });
    const { data: order, error } = await privateDb().from('storefront_orders').select('order_number,total,currency,region_id,payment_status,stripe_livemode').eq('id', attempt.order_id).single();
    if (error) throw error;
    return send(res, 200, { order_number: order.order_number, total: order.total, currency: order.currency, region_id: order.region_id, status: order.payment_status, mode: order.stripe_livemode ? 'live' : 'test' });
  } catch (error) { return failure(res, error); }
}
