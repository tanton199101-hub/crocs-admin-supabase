(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrocsAmazon = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const MARKETPLACES = Object.freeze({
    ATVPDKIKX0DER: { id: 'ATVPDKIKX0DER', code: 'US', name: 'United States', currency: 'USD', locale: 'en-US', endpoint: 'sellingpartnerapi-na.amazon.com' },
    A1F83G8C2ARO7P: { id: 'A1F83G8C2ARO7P', code: 'GB', name: 'United Kingdom', currency: 'GBP', locale: 'en-GB', endpoint: 'sellingpartnerapi-eu.amazon.com' },
    A1PA6795UKMFR9: { id: 'A1PA6795UKMFR9', code: 'DE', name: 'Germany', currency: 'EUR', locale: 'de-DE', endpoint: 'sellingpartnerapi-eu.amazon.com' },
    A1RKKUPIHCS9HS: { id: 'A1RKKUPIHCS9HS', code: 'ES', name: 'Spain', currency: 'EUR', locale: 'es-ES', endpoint: 'sellingpartnerapi-eu.amazon.com' },
    A13V1IB3VIYZZH: { id: 'A13V1IB3VIYZZH', code: 'FR', name: 'France', currency: 'EUR', locale: 'fr-FR', endpoint: 'sellingpartnerapi-eu.amazon.com' },
    A1VC38T7YXB528: { id: 'A1VC38T7YXB528', code: 'JP', name: 'Japan', currency: 'JPY', locale: 'ja-JP', endpoint: 'sellingpartnerapi-fe.amazon.com' },
    A39IBJ37TRP1C6: { id: 'A39IBJ37TRP1C6', code: 'AU', name: 'Australia', currency: 'AUD', locale: 'en-AU', endpoint: 'sellingpartnerapi-fe.amazon.com' },
    A2EUQ1WTGCTBG2: { id: 'A2EUQ1WTGCTBG2', code: 'CA', name: 'Canada', currency: 'CAD', locale: 'en-CA', endpoint: 'sellingpartnerapi-na.amazon.com' },
    A19VAU5U5O7RUS: { id: 'A19VAU5U5O7RUS', code: 'SG', name: 'Singapore', currency: 'SGD', locale: 'en-SG', endpoint: 'sellingpartnerapi-fe.amazon.com' },
  });
  const CUSTOM_TYPES = Object.freeze({
    personalize: 'Personalize',
    configure: 'Configure',
    assemble: 'Assemble',
  });
  const SYNC_STATES = Object.freeze({
    draft: 'Draft',
    ready: 'Ready',
    syncing: 'Syncing',
    live: 'Live',
    attention: 'Needs attention',
    manual: 'Needs Seller Central',
    failed: 'Failed',
  });
  const clone = value => JSON.parse(JSON.stringify(value));

  function defaultSettings(value = {}) {
    const input = value && typeof value === 'object' ? value : {};
    return {
      enabled: input.enabled === true,
      sellerId: String(input.sellerId || '').trim(),
      defaultMarketplaceId: String(input.defaultMarketplaceId || '').trim(),
      syncMode: input.syncMode === 'automatic' ? 'automatic' : 'manual',
      productionDays: Number.isInteger(input.productionDays) && input.productionDays > 0 ? input.productionDays : 3,
      marketplaces: Array.isArray(input.marketplaces) ? input.marketplaces.map(defaultMarketplace).filter(item => item.marketplaceId) : [],
      lastSyncAt: input.lastSyncAt || '',
      lastOrderSyncAt: input.lastOrderSyncAt || '',
      connectionStatus: input.connectionStatus || 'not_configured',
      connectionMessage: input.connectionMessage || '',
    };
  }

  function defaultMarketplace(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const definition = MARKETPLACES[source.marketplaceId] || {};
    return {
      marketplaceId: String(source.marketplaceId || '').trim(),
      label: String(source.label || definition.name || source.marketplaceId || '').trim(),
      currency: String(source.currency || definition.currency || 'USD').toUpperCase(),
      locale: String(source.locale || definition.locale || 'en-US'),
      enabled: source.enabled !== false,
      defaultProductType: String(source.defaultProductType || 'SHOES'),
      handlingTime: Number.isInteger(source.handlingTime) && source.handlingTime > 0 ? source.handlingTime : 3,
    };
  }

  function defaultProfile(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
      enabled: source.enabled === true,
      mode: CUSTOM_TYPES[source.mode] ? source.mode : 'personalize',
      version: Number.isInteger(source.version) && source.version > 0 ? source.version : 1,
      surfaces: Array.isArray(source.surfaces) ? source.surfaces.map(surface => ({
        id: String(surface?.id || '').trim(),
        name: String(surface?.name || '').trim(),
        customizations: Array.isArray(surface?.customizations) ? surface.customizations.map(customization => ({
          id: String(customization?.id || '').trim(),
          type: String(customization?.type || 'text').trim().toLowerCase(),
          label: String(customization?.label || '').trim(),
          required: customization?.required === true,
          maxLength: Number.isInteger(customization?.maxLength) && customization.maxLength > 0 ? customization.maxLength : 20,
          priceDelta: Number.isSafeInteger(customization?.priceDelta) && customization.priceDelta >= 0 ? customization.priceDelta : 0,
          options: Array.isArray(customization?.options) ? customization.options.map(option => ({
            id: String(option?.id || '').trim(),
            label: String(option?.label || '').trim(),
            priceDelta: Number.isSafeInteger(option?.priceDelta) && option.priceDelta >= 0 ? option.priceDelta : 0,
          })) : [],
        })) : [],
      })) : [],
      productionDays: Number.isInteger(source.productionDays) && source.productionDays > 0 ? source.productionDays : 3,
      proofRequired: source.proofRequired === true,
      instructions: String(source.instructions || '').trim(),
      syncState: source.syncState || 'draft',
      sellerCentralConfirmedAt: source.sellerCentralConfirmedAt || '',
    };
  }

  function validateProfile(profile) {
    const normalized = defaultProfile(profile);
    const errors = [];
    if (!normalized.enabled) return { valid: true, errors, profile: normalized };
    if (!CUSTOM_TYPES[profile?.mode || normalized.mode]) errors.push('Chọn một kiểu Custom hợp lệ.');
    if (!Number.isInteger(profile?.productionDays ?? 3) || (profile?.productionDays ?? 3) < 1 || (profile?.productionDays ?? 3) > 30) errors.push('Thời gian sản xuất phải từ 1 đến 30 ngày.');
    if (!normalized.surfaces.length) errors.push('Cần ít nhất một bề mặt customization.');
    if (normalized.surfaces.length > 5) errors.push('Amazon Custom cho phép tối đa 5 bề mặt.');
    const surfaceIds = new Set();
    let optionCount = 0;
    normalized.surfaces.forEach((surface, surfaceIndex) => {
      if (!surface.id || !/^[a-z0-9_-]{2,40}$/i.test(surface.id)) errors.push(`Bề mặt ${surfaceIndex + 1} cần mã hợp lệ.`);
      if (surfaceIds.has(surface.id)) errors.push(`Mã bề mặt bị trùng: ${surface.id}.`);
      surfaceIds.add(surface.id);
      if (!surface.name) errors.push(`Bề mặt ${surfaceIndex + 1} cần tên hiển thị.`);
      if (!surface.customizations.length) errors.push(`Bề mặt ${surface.name || surfaceIndex + 1} cần ít nhất một customization.`);
      if (surface.customizations.length > 15) errors.push(`Bề mặt ${surface.name || surfaceIndex + 1} vượt quá 15 customization.`);
      const customizationIds = new Set();
      surface.customizations.forEach((customization, customizationIndex) => {
        const raw = profile?.surfaces?.[surfaceIndex]?.customizations?.[customizationIndex] || {};
        if (raw.priceDelta != null && (!Number.isSafeInteger(raw.priceDelta) || raw.priceDelta < 0)) errors.push('Phụ phí phải là số nguyên không âm theo đơn vị nhỏ của tiền tệ.');
        if (raw.maxLength != null && (!Number.isInteger(raw.maxLength) || raw.maxLength < 1 || raw.maxLength > 200)) errors.push(`Giới hạn ký tự không hợp lệ cho ${customization.label}.`);
        if (!customization.id || !/^[a-z0-9_-]{2,40}$/i.test(customization.id)) errors.push(`Customization ${surfaceIndex + 1}.${customizationIndex + 1} cần mã hợp lệ.`);
        if (customizationIds.has(customization.id)) errors.push(`Customization bị trùng: ${customization.id}.`);
        customizationIds.add(customization.id);
        if (!customization.label) errors.push(`Customization ${surfaceIndex + 1}.${customizationIndex + 1} cần nhãn.`);
        if (!['text', 'image', 'logo', 'select'].includes(customization.type)) errors.push(`Loại customization không được hỗ trợ: ${customization.type}.`);
        if (customization.type === 'text' && (customization.maxLength < 1 || customization.maxLength > 200)) errors.push(`Giới hạn ký tự không hợp lệ cho ${customization.label}.`);
        if (customization.type === 'select') {
          if (!customization.options.length) errors.push(`Lựa chọn ${customization.label} cần ít nhất một option.`);
          optionCount += customization.options.length;
          const optionIds = new Set();
          customization.options.forEach((option, optionIndex) => {
            const rawOption = raw.options?.[optionIndex];
            if (rawOption?.priceDelta != null && (!Number.isSafeInteger(rawOption.priceDelta) || rawOption.priceDelta < 0)) errors.push('Phụ phí option không hợp lệ.');
            if (!option.id || !option.label) errors.push(`Option của ${customization.label} cần mã và nhãn.`);
            if (optionIds.has(option.id)) errors.push(`Option bị trùng trong ${customization.label}: ${option.id}.`);
            optionIds.add(option.id);
          });
        }
      });
    });
    if (optionCount > 100) errors.push('Tổng số option vượt quá 100 theo giới hạn Amazon Custom.');
    return { valid: errors.length === 0, errors, profile: normalized };
  }

  function marketplaceSettings(settings) {
    return defaultSettings(settings).marketplaces.filter(item => item.enabled && MARKETPLACES[item.marketplaceId]);
  }

  function marketplaceForRegion(settings, region) {
    const country = String(region?.countries?.[0] || region?.country || '').toUpperCase();
    const marketplaces = marketplaceSettings(settings);
    return marketplaces.find(item => MARKETPLACES[item.marketplaceId]?.code === country) || marketplaces[0] || null;
  }

  function skuFor(product, marketplace, variant = null) {
    const base = String(variant?.sku || product?.sku || product?.id || 'ITEM').replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
    const country = MARKETPLACES[marketplace?.marketplaceId]?.code || String(marketplace?.marketplaceId || 'AMZ').slice(-3).toUpperCase();
    return `${base}-${country}`.slice(0, 80);
  }

  function listingPlan(product, settings = {}, marketplace) {
    const channel = defaultSettings(settings);
    const target = defaultMarketplace(marketplace);
    const profile = defaultProfile(product?.customization || product?.amazonCustom || {});
    const profileCheck = validateProfile(profile);
    const variants = Array.isArray(product?.variants) && product.variants.length ? product.variants.filter(item => item.enabled !== false) : [null];
    const items = variants.map(variant => ({
      productId: product?.id || '',
      variantId: variant?.id || '',
      sku: skuFor(product, target, variant),
      asin: variant?.amazon?.asin || product?.amazon?.asin || '',
      title: product?.title || '',
      productType: target.defaultProductType || 'SHOES',
      marketplaceId: target.marketplaceId,
      currency: target.currency,
      // Marketplace prices must be explicitly assigned. Never relabel a GBP
      // amount as USD simply because both currencies have two decimals.
      price: variant?.amazon?.prices?.[target.marketplaceId] ?? product?.amazon?.prices?.[target.marketplaceId] ?? null,
      quantity: Math.max(0, Number(variant?.stock ?? product?.stock ?? 0)),
      fulfillment: 'MERCHANT',
      customState: profile.enabled ? (profileCheck.valid ? (profile.sellerCentralConfirmedAt ? 'ready' : 'manual') : 'attention') : 'not_custom',
      profileVersion: profile.version,
    }));
    return { marketplace: target, items, profile, profileCheck, settings: channel };
  }

  function buildSyncPlan(products, settings = {}) {
    const targets = marketplaceSettings(settings);
    return (Array.isArray(products) ? products : []).filter(product => product?.status === 'Active').flatMap(product => targets.flatMap(marketplace => listingPlan(product, settings, marketplace).items));
  }

  function summary(plan) {
    return (Array.isArray(plan) ? plan : []).reduce((result, item) => {
      result.total += 1;
      if (item.customState === 'manual') result.manual += 1;
      else if (item.customState === 'attention') result.attention += 1;
      else result.ready += 1;
      return result;
    }, { total: 0, ready: 0, manual: 0, attention: 0 });
  }

  return Object.freeze({ MARKETPLACES, CUSTOM_TYPES, SYNC_STATES, defaultSettings, defaultMarketplace, defaultProfile, validateProfile, marketplaceSettings, marketplaceForRegion, skuFor, listingPlan, buildSyncPlan, summary, clone });
});
