import { publicDb, authToken, requireAmazonMember, amazonEnvironment, publicEnvironment, readAdminState, send, failure } from '../../server/amazon-runtime.mjs';

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.setHeader('Allow', 'GET'); return send(res, 405, { error: 'Method not allowed.' }); }
  try {
    await requireAmazonMember(req);
    const token = authToken(req);
    const { data, error } = await publicDb(token).from('amazon_channel_config').select('seller_id,enabled,marketplaces,updated_at').eq('id', 'default').maybeSingle();
    let stateChannel = null;
    try { stateChannel = (await readAdminState(req)).payload?.settings?.amazon || null; } catch { /* The table/RPC may not exist before migration. */ }
    const config = amazonEnvironment();
    const channel = stateChannel ? { sellerId: stateChannel.sellerId || data?.seller_id || '', enabled: stateChannel.enabled === true, marketplaces: stateChannel.marketplaces || data?.marketplaces || [], updatedAt: data?.updated_at || null } : data ? { sellerId: data.seller_id, enabled: data.enabled, marketplaces: data.marketplaces || [], updatedAt: data.updated_at } : null;
    return send(res, 200, {
      environment: publicEnvironment(),
      configured: Boolean((!error && data) || stateChannel),
      channel,
      message: config.ready ? 'Amazon SP-API server credentials are ready.' : 'Configure Amazon credentials in Vercel before publishing listings.',
    });
  } catch (error) { return failure(res, error); }
}
