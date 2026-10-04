import { HttpError, normalizeRequest, fingerprint, checkoutParameters, readiness, safeCheckoutUrl } from '../../server/stripe-core.mjs';
import { method, originGuard, requestBody, paymentConfig, environment, stripeClient, privateDb, dbRpc, rateKey, send, failure } from '../../server/stripe-runtime.mjs';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  let reservation, stripeRequestStarted = false;
  try {
    originGuard(req);
    const request = normalizeRequest(requestBody(req));
    const { payment, migration } = await paymentConfig();
    const env = environment();
    const active = readiness(payment, env, migration);
    if (!active.ready) throw new HttpError(503, active.message, active.reason);
    const client = privateDb();
    reservation = await dbRpc(client, 'stripe_checkout_reserve_v1', { p_request_id: request.requestId, p_fingerprint: fingerprint(request, payment.mode), p_rate_key: rateKey(req), p_customer: request.customer, p_lines: request.lines, p_delivery_method: request.deliveryMethod, p_mode: payment.mode });
    if (['expired', 'failed', 'review'].includes(reservation.status)) throw new HttpError(409, 'This checkout has ended. Start a new checkout.', 'session_ended');
    const stripe = stripeClient();
    let session;
    if (reservation.stripe_session_id) session = await stripe.checkout.sessions.retrieve(reservation.stripe_session_id);
    else {
      const params = checkoutParameters(reservation, env.origin, reservation.methods);
      // The exact parameters and key survive browser retries and server restarts.
      // An ambiguous network failure must never immediately release stock.
      stripeRequestStarted = true;
      session = await stripe.checkout.sessions.create(params, { idempotencyKey: `checkout:${reservation.id}` });
      await dbRpc(client, 'stripe_checkout_bind_v1', { p_attempt_id: reservation.id, p_session_id: session.id });
    }
    if (session.status === 'complete') return send(res, 200, { sessionId: session.id, completed: true });
    if (session.status !== 'open' || !safeCheckoutUrl(session.url)) throw new HttpError(409, 'This checkout has expired. Start a new checkout.', 'session_ended');
    return send(res, 200, { sessionId: session.id, url: session.url, expiresAt: session.expires_at });
  } catch (error) {
    if (reservation && !reservation.stripe_session_id && (!stripeRequestStarted || error.type === 'StripeInvalidRequestError' || error.type === 'StripeAuthenticationError')) {
      try { await dbRpc(privateDb(), 'stripe_checkout_release_v1', { p_attempt_id: reservation.id }); } catch { /* Keep uncertain reservations for reconciliation. */ }
    }
    return failure(res, error);
  }
}
