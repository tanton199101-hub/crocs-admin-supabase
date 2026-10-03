(function (root) {
  'use strict';
  const config = root.CrocsSupabaseConfig;
  if (!config?.url || !config?.publishableKey) return;
  const endpoint = `${config.url.replace(/\/$/, '')}/rest/v1/store_state?id=eq.${encodeURIComponent(config.stateId || 'default')}&select=payload,updated_at`;
  fetch(endpoint, {
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}` }
  }).then(response => response.ok ? response.json() : []).then(rows => {
    const theme = rows?.[0]?.payload?.theme?.published;
    if (theme) root.dispatchEvent(new CustomEvent('crocs:remote-theme', { detail: { theme, updatedAt: rows[0].updated_at } }));
  }).catch(error => console.warn('[CrocsBackend] Storefront fallback:', error));
})(window);
