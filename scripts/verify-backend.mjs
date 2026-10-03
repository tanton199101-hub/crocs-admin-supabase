const url = process.env.SUPABASE_URL || 'https://uvtgzcuifbiufwcrylxx.supabase.co';
const key = process.env.SUPABASE_PUBLISHABLE_KEY || 'sb_publishable_z8ozM2OM1MV3fo0nJDksxA_bBi97bIP';
const endpoint = `${url.replace(/\/$/, '')}/rest/v1/store_state?id=eq.default&select=id,version,updated_at`;
const response = await fetch(endpoint, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
if (!response.ok) throw new Error(`Supabase health check failed (${response.status}): ${await response.text()}`);
const rows = await response.json();
if (!Array.isArray(rows) || rows.length > 1) throw new Error('Expected zero or one default store_state row.');
console.log(rows.length ? `Supabase OK · state ${rows[0].id} · updated ${rows[0].updated_at}` : 'Supabase reachable · state row has not been seeded yet');
