import { readiness } from '../../server/stripe-core.mjs';
import { paymentConfig, environment, send, failure, method } from '../../server/stripe-runtime.mjs';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    const { payment, migration } = await paymentConfig();
    const state = readiness(payment, environment(), migration);
    return send(res, 200, { enabled: payment.enabled, mode: payment.mode, ready: state.ready, demoAllowed: !payment.enabled, reason: state.reason, message: payment.enabled ? state.message : '', provider: 'stripe' });
  } catch (error) { return failure(res, error); }
}
