import { readiness } from '../../server/stripe-core.mjs';
import { requireMember, paymentConfig, environment, stripeClient, privateDb, send, failure, method } from '../../server/stripe-runtime.mjs';

export default async function handler(req, res) {
  if (!method(req, res, 'GET')) return;
  try {
    await requireMember(req);
    const env = environment();
    const { payment, migration } = await paymentConfig();
    let account = null, connected = false, connectionError = '', lastWebhook = null, unresolved = 0;
    if (env.secretKey) {
      try {
        const stripe = stripeClient();
        const balance = await stripe.balance.retrieve();
        connected = balance.livemode === (env.mode === 'live');
        const details = await stripe.accounts.retrieve();
        account = { id: details.id, name: details.business_profile?.name || details.settings?.dashboard?.display_name || 'Stripe account', country: details.country, chargesEnabled: details.charges_enabled };
      } catch { connectionError = 'Không xác thực được Stripe. Kiểm tra secret key trong Vercel.'; }
    }
    if (env.backendKey && migration) {
      const client = privateDb();
      const { data } = await client.from('stripe_webhook_events').select('created_at,status').order('created_at', { ascending: false }).limit(1);
      lastWebhook = data?.[0] || null;
      const { count } = await client.from('stripe_checkout_attempts').select('id', { count: 'exact', head: true }).eq('status', 'reserved').lt('expires_at', new Date().toISOString());
      unresolved = count || 0;
    }
    const active = readiness(payment, env, migration);
    return send(res, 200, { environment: { secretKey: env.secretKey, webhookSecret: env.webhookSecret, backendKey: env.backendKey, publishableKey: env.publishableKey, mode: env.mode, liveAllowed: env.liveAllowed, origin: env.origin }, payment, migration, connected, connectionError, account, lastWebhook, unresolved, ready: active.ready && connected, webhookUrl: env.origin ? `${env.origin}/api/stripe/webhook` : '' });
  } catch (error) { return failure(res, error); }
}
