(function (root) {
  'use strict';
  const config = root.CrocsSupabaseConfig;
  if (!config?.url || !config?.publishableKey) return;
  const endpoint = `${config.url.replace(/\/$/, '')}/rest/v1/rpc/storefront_theme_v1`;
  fetch(endpoint, {
    method: 'POST',
    headers: { apikey: config.publishableKey, Authorization: `Bearer ${config.publishableKey}`, 'Content-Type': 'application/json' },
    body: '{}'
  }).then(response => response.ok ? response.json() : null).then(result => {
    const payload = Array.isArray(result) ? result[0] : result;
    const theme = payload?.theme;
    if (theme) root.dispatchEvent(new CustomEvent('crocs:remote-theme', { detail: { theme } }));
  }).catch(error => console.warn('[CrocsBackend] Storefront fallback:', error));
})(window);
