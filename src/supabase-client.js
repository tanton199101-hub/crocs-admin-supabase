import { createClient } from '@supabase/supabase-js';
const config = window.CrocsSupabaseConfig;
if (config?.url && config?.publishableKey) {
  window.CrocsSupabase = createClient(config.url, config.publishableKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: 'crocs-admin-auth' },
    global: { fetch: (url, options) => fetch(url, { ...options, signal: options?.signal || AbortSignal.timeout(15000) }) }
  });
}
