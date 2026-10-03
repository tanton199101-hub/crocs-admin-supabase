(function (root) {
  'use strict';

  const config = root.CrocsSupabaseConfig;
  const store = root.CrocsStore;
  const stateId = config?.stateId || 'default';
  const apiBase = config?.url ? `${config.url.replace(/\/$/, '')}/rest/v1` : '';
  const headers = () => ({
    apikey: config.publishableKey,
    Authorization: `Bearer ${config.publishableKey}`,
    'Content-Type': 'application/json'
  });
  const clone = value => JSON.parse(JSON.stringify(value));
  let syncTimer;
  let syncInFlight = Promise.resolve();

  const backend = {
    status: config?.url && config?.publishableKey ? 'connecting' : 'disabled',
    lastError: '',
    lastSyncedAt: '',
    ready: null,
    async request(path, options = {}) {
      if (!apiBase) throw new Error('Chưa cấu hình Supabase URL.');
      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: { ...headers(), ...(options.headers || {}) }
      });
      const text = await response.text();
      let body = null;
      try { body = text ? JSON.parse(text) : null; } catch { body = text; }
      if (!response.ok) {
        const detail = typeof body === 'string' ? body : body?.message || body?.hint || body?.details || response.statusText;
        throw new Error(`Supabase ${response.status}: ${detail}`);
      }
      return body;
    },
    async fetchState() {
      const rows = await this.request(`/store_state?id=eq.${encodeURIComponent(stateId)}&select=id,payload,version,updated_at,updated_by`);
      return Array.isArray(rows) && rows[0] ? rows[0] : null;
    },
    async putState(payload, detail = 'state.sync') {
      const row = {
        id: stateId,
        payload: clone(payload),
        version: 1,
        updated_by: root.location?.hostname || 'static-client'
      };
      await this.request(`/store_state?on_conflict=id`, {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=representation' },
        body: JSON.stringify(row)
      });
      try {
        await this.request('/store_events', {
          method: 'POST',
          body: JSON.stringify({ state_id: stateId, event_type: detail, detail: detail.slice(0, 240) })
        });
      } catch (error) {
        // An audit event must not make the primary state write look failed.
        console.warn('[CrocsBackend] Event log failed:', error);
      }
      this.status = 'connected';
      this.lastError = '';
      this.lastSyncedAt = new Date().toISOString();
      root.dispatchEvent(new CustomEvent('crocs:backend-status', { detail: { ...this } }));
    },
    async sync(payload, detail = 'state.sync') {
      if (this.status === 'disabled') return;
      clearTimeout(syncTimer);
      // Coalesce quick successive edits (typing, menu changes, bulk actions).
      syncTimer = setTimeout(() => {
        syncInFlight = syncInFlight.then(() => this.putState(payload, detail)).catch(error => {
          this.status = 'offline';
          this.lastError = error.message;
          console.warn('[CrocsBackend] Sync failed:', error);
          root.dispatchEvent(new CustomEvent('crocs:backend-status', { detail: { ...this } }));
        });
      }, 120);
      return syncInFlight;
    },
    async init() {
      if (this.status === 'disabled' || !store) return;
      try {
        const row = await this.fetchState();
        if (row?.payload) {
          store.validate(row.payload);
          store.save(row.payload);
          this.status = 'connected';
          this.lastSyncedAt = row.updated_at || new Date().toISOString();
          root.dispatchEvent(new CustomEvent('crocs:backend-ready', { detail: row }));
        } else {
          // First deploy: seed the durable row from the existing validated demo state.
          await this.putState(store.read(), 'state.seed');
          root.dispatchEvent(new CustomEvent('crocs:backend-ready', { detail: { seeded: true } }));
        }
      } catch (error) {
        this.status = 'offline';
        this.lastError = error.message;
        console.warn('[CrocsBackend] Using local fallback:', error);
        root.dispatchEvent(new CustomEvent('crocs:backend-status', { detail: { ...this } }));
      }
    }
  };

  root.CrocsBackend = backend;
  backend.ready = backend.init();
})(window);
