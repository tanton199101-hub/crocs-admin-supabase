(function (root) {
  'use strict';

  const config = root.CrocsSupabaseConfig;
  const store = root.CrocsStore;
  const stateId = config?.stateId || 'default';
  const apiBase = config?.url ? `${config.url.replace(/\/$/, '')}/rest/v1` : '';
  async function headers() {
    let token = config?.publishableKey || '';
    try {
      const session = await root.CrocsSupabase?.auth?.getSession();
      token = session?.data?.session?.access_token || token;
    } catch { /* The publishable key remains a useful error-safe fallback. */ }
    return {
      apikey: config?.publishableKey || '',
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json'
    };
  }
  const clone = value => JSON.parse(JSON.stringify(value));
  // A verified 1688 catalog can contain more than one hundred thousand SKU
  // rows.  Sending the expanded object through PostgREST exceeds the hosted
  // request limit (and localStorage is even smaller).  Keep the in-memory
  // model unchanged, but use a compact, lossless wire representation for
  // products with the standard 1688 variant shape.  The server stores this
  // representation in JSONB; decode it immediately after every admin read so
  // the rest of the app continues to work with normal variants.
  const VARIANT_ENCODING = 'crocs-1688-v3';
  function canPackVariants(product) {
    return Array.isArray(product?.variants) && product.variants.length > 0
      && Array.isArray(product.options) && product.options.length > 0
      && product.variants.every(variant => {
        if (!variant || variant.id !== variant.sku || typeof variant.sku !== 'string') return false;
        if (variant.compareAt != null || variant.cost != null || variant.barcode) return false;
        return product.options.every(option => option.values?.includes(variant.values?.[option.id]));
      });
  }
  function packVariants(product) {
    if (!canPackVariants(product)) return product;
    const options = product.options;
    const regions = [...new Set(product.variants.flatMap(variant => Object.keys(variant.regionalPrices || {})))];
    const rows = product.variants.map(variant => [
      variant.sku,
      ...options.map(option => option.values.indexOf(variant.values[option.id])),
      variant.price,
      variant.stock,
      ...regions.map(region => variant.regionalPrices?.[region] ?? null),
      variant.enabled === false ? 0 : 1,
    ]);
    const packed = { ...product, variantEncoding: VARIANT_ENCODING, variantRegions: regions, variantsPacked: rows };
    delete packed.variants;
    return packed;
  }
  function unpackVariants(product) {
    if (product?.variantEncoding !== VARIANT_ENCODING || !Array.isArray(product.variantsPacked)) return product;
    const options = Array.isArray(product.options) ? product.options : [];
    const regions = Array.isArray(product.variantRegions) ? product.variantRegions : [];
    const optionCount = options.length;
    const priceIndex = 1 + optionCount;
    const stockIndex = priceIndex + 1;
    const regionIndex = stockIndex + 1;
    const flagIndex = regionIndex + regions.length;
    const variants = product.variantsPacked.map(row => {
      if (!Array.isArray(row) || typeof row[0] !== 'string') return null;
      const sku = row[0];
      const values = Object.fromEntries(options.map((option, index) => {
        const value = option.values?.[Number(row[1 + index])];
        return value == null ? null : [option.id, value];
      }).filter(Boolean));
      const regionalPrices = Object.fromEntries(regions.map((region, index) => {
        const value = row[regionIndex + index];
        return value == null ? null : [region, Number(value)];
      }).filter(Boolean));
      return {
        id: sku,
        values,
        sku,
        price: Number(row[priceIndex] || 0),
        compareAt: null,
        cost: null,
        stock: Number(row[stockIndex] || 0),
        enabled: row[flagIndex] !== 0,
        barcode: '',
        ...(Object.keys(regionalPrices).length ? { regionalPrices } : {}),
      };
    }).filter(Boolean);
    const expanded = { ...product, variants };
    delete expanded.variantEncoding;
    delete expanded.variantRegions;
    delete expanded.variantsPacked;
    return expanded;
  }
  const encodePayload = payload => {
    const encoded = clone(payload);
    if (Array.isArray(encoded?.products)) encoded.products = encoded.products.map(packVariants);
    return encoded;
  };
  const decodePayload = payload => {
    const decoded = clone(payload);
    if (Array.isArray(decoded?.products)) decoded.products = decoded.products.map(unpackVariants);
    return decoded;
  };
  let syncTimer;
  let retryTimer;
  let syncInFlight = Promise.resolve();
  let pendingJob = null;
  let retryDelay = 1000;

  function emitStatus() {
    root.dispatchEvent(new CustomEvent('crocs:backend-status', { detail: { ...backend } }));
  }

  function isConflict(error) {
    return /409|conflict|version|đã thay đổi/i.test(error?.message || '');
  }

  function isAuthFailure(error) {
    return /401|403|jwt|permission|quyền|đăng nhập|unauthor/i.test(error?.message || '');
  }

  function scheduleRetry() {
    if (!pendingJob || retryTimer || backend.status === 'disabled' || backend.conflict) return;
    const delay = retryDelay;
    retryDelay = Math.min(retryDelay * 2, 30000);
    retryTimer = root.setTimeout(() => {
      retryTimer = null;
      flushPending();
    }, delay);
  }

  function flushPending() {
    if (!pendingJob || backend.status === 'conflict' || backend.status === 'unauthorized') return;
    const job = pendingJob;
    pendingJob = null;
    syncInFlight = syncInFlight.then(() => backend.putState(job.payload, job.detail)).catch(error => {
      // Keep the latest local state in memory so a temporary outage does not
      // silently discard edits. A conflict/auth failure needs user action;
      // transport failures retry with backoff or immediately when online.
      pendingJob = pendingJob || job;
      backend.conflict = isConflict(error);
      backend.status = backend.conflict ? 'conflict' : isAuthFailure(error) ? 'unauthorized' : 'offline';
      backend.lastError = backend.conflict
        ? 'Dữ liệu trên máy chủ đã thay đổi. Tải lại trước khi lưu tiếp.'
        : error.message;
      console.warn('[CrocsBackend] Sync failed:', error);
      emitStatus();
      if (!backend.conflict && backend.status !== 'unauthorized') scheduleRetry();
    });
  }

  const backend = {
    status: config?.url && config?.publishableKey ? 'connecting' : 'disabled',
    lastError: '',
    lastSyncedAt: '',
    serverVersion: 0,
    conflict: false,
    ready: null,
    async request(path, options = {}) {
      if (!apiBase) throw new Error('Chưa cấu hình Supabase URL.');
      const response = await fetch(`${apiBase}${path}`, {
        ...options,
        headers: { ...(await headers()), ...(options.headers || {}) }
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
    async rpc(name, payload = {}) {
      return this.request(`/rpc/${name}`, { method: 'POST', body: JSON.stringify(payload) });
    },
    async fetchState() {
      const response = await this.rpc('admin_state_v1', { p_state_id: stateId });
      const row = Array.isArray(response) ? response[0] : response;
      if (!row?.payload) return null;
      this.serverVersion = Number(row.version || 0);
      row.payload = decodePayload(row.payload);
      return row;
    },
    async putState(payload, detail = 'state.sync') {
      if (!this.serverVersion) {
        const current = await this.fetchState();
        if (!current) throw new Error('Không tìm thấy phiên bản dữ liệu trên máy chủ.');
      }
      const response = await this.rpc('admin_state_update_v1', {
        p_state_id: stateId,
        p_payload: encodePayload(payload),
        p_expected_version: this.serverVersion,
        p_event_type: detail.slice(0, 120)
      });
      const row = Array.isArray(response) ? response[0] : response;
      if (!row?.version) throw new Error('Máy chủ không trả về phiên bản mới.');
      this.serverVersion = Number(row.version);
      this.status = 'connected';
      this.lastError = '';
      this.conflict = false;
      retryDelay = 1000;
      this.lastSyncedAt = new Date().toISOString();
      emitStatus();
    },
    async sync(payload, detail = 'state.sync') {
      if (this.status === 'disabled' || this.status === 'conflict' || this.status === 'unauthorized') return;
      pendingJob = { payload: clone(payload), detail };
      clearTimeout(syncTimer);
      // Coalesce quick successive edits (typing, menu changes, bulk actions).
      syncTimer = root.setTimeout(flushPending, 120);
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
          this.conflict = false;
          retryDelay = 1000;
          this.lastSyncedAt = row.updated_at || new Date().toISOString();
          root.dispatchEvent(new CustomEvent('crocs:backend-ready', { detail: row }));
        } else {
          // First deploy: seed the durable row from the existing validated demo state.
          throw new Error('Máy chủ chưa khởi tạo dữ liệu cửa hàng. Hãy chạy seed migration trước.');
        }
      } catch (error) {
        this.status = isAuthFailure(error) ? 'unauthorized' : 'offline';
        this.lastError = error.message;
        console.warn('[CrocsBackend] Using local fallback:', error);
        emitStatus();
      }
    }
  };

  root.CrocsBackend = backend;
  root.addEventListener('online', () => {
    if (backend.status === 'offline' && pendingJob) {
      retryDelay = 1000;
      clearTimeout(retryTimer);
      retryTimer = null;
      flushPending();
    }
  });
  backend.ready = backend.init();
})(window);
