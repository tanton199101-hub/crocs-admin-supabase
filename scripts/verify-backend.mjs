const url = process.env.SUPABASE_URL || 'https://uvtgzcuifbiufwcrylxx.supabase.co';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_z8ozM2OM1MV3fo0nJDksxA_bBi97bIP';
const endpoint = `${url.replace(/\/$/, '')}/rest/v1/rpc/storefront_catalog_v1`;
const response = await fetch(endpoint, {
  method: 'POST',
  headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
  body: '{}'
});
if (!response.ok) throw new Error(`Supabase catalogue health check failed (${response.status}): ${await response.text()}`);
const catalog = await response.json();
if (!catalog || !Array.isArray(catalog.products) || !Array.isArray(catalog.collections)) throw new Error('Public catalogue projection is invalid.');
for (const privateKey of ['customers', 'orders', 'activity', 'settings']) {
  if (Object.prototype.hasOwnProperty.call(catalog, privateKey)) throw new Error(`Public catalogue leaks private key: ${privateKey}`);
}
const stateProbe = await fetch(`${url.replace(/\/$/, '')}/rest/v1/store_state?id=eq.default&select=id`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (stateProbe.ok) throw new Error('store_state is still publicly readable; apply the hardening migration.');
console.log(`Supabase OK · public catalogue ${catalog.products.length} products · private state blocked (${stateProbe.status})`);
