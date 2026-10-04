import { HttpError, eventPayload } from '../../server/stripe-core.mjs';
import { method, environment, stripeClient, privateDb, dbRpc, send, failure } from '../../server/stripe-runtime.mjs';

export const config = { api: { bodyParser: false } };

export async function rawBody(req) {
  const chunks = [];
  let length = 0;
  for await (const chunk of req) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += bytes.length;
    if (length > 1024 * 1024) throw new HttpError(413, 'Webhook payload too large.');
    chunks.push(bytes);
  }
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (!method(req, res, 'POST')) return;
  try {
    const env = environment();
    if (!env.secretKey || !env.webhookSecret || !env.backendKey) throw new HttpError(503, 'The webhook is not configured.');
    let event;
    try { event = stripeClient().webhooks.constructEvent(await rawBody(req), req.headers['stripe-signature'], process.env.STRIPE_WEBHOOK_SECRET); }
    catch (error) { if (error instanceof HttpError) throw error; throw new HttpError(400, 'Invalid webhook signature.', 'invalid_signature'); }
    const payload = eventPayload(event);
    if (!payload) return send(res, 200, { received: true, ignored: true });
    if (event.livemode !== (env.mode === 'live') || payload.p_livemode !== event.livemode) throw new HttpError(400, 'Webhook mode mismatch.');
    const result = await dbRpc(privateDb(), 'stripe_checkout_event_v1', payload);
    return send(res, 200, { received: true, status: result.status });
  } catch (error) { return failure(res, error); }
}
