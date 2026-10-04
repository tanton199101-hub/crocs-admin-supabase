import { HttpError } from '../../server/stripe-core.mjs';
import { method, originGuard, requestBody, attemptBySession, stripeClient, send, failure } from '../../server/stripe-runtime.mjs';

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  try {
    originGuard(req);
    const { sessionId } = requestBody(req) || {};
    await attemptBySession(sessionId);
    const stripe = stripeClient();
    let session = await stripe.checkout.sessions.retrieve(sessionId);
    if (session.status === 'open') session = await stripe.checkout.sessions.expire(sessionId);
    // Stock is released by the signed expired event, never by a browser claim.
    if (session.status === 'complete') throw new HttpError(409, 'Payment is already processing. Do not pay again.', 'payment_processing');
    return send(res, 200, { status: 'expired', message: 'Checkout cancelled. Stock release is being confirmed.' });
  } catch (error) { return failure(res, error); }
}
