(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrocsVariantOptions = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const COLLAPSED_LIMIT = 6;
  const fold = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').trim().toLowerCase().replace(/\s+/g, ' ');
  function name(value) {
    const text = String(value || '').trim();
    const key = fold(text);
    if (/^(?:mau sac|color|colour|colors|colours|颜色|颜色分类|色号|phan loai)$/.test(key)) return 'Phân loại';
    if (/^(?:chieu cao|height(?:\s*\(cm\))?|suitable for height|kich thuoc\s*\(cm\)|身高|适合身高|size\s*\(cm\)|size cm)$/.test(key)) return 'Size (cm)';
    return text;
  }
  function kind(option) {
    const label = name(option?.name);
    if (label === 'Size (cm)') return 'size-cm';
    return /size|height|kich thuoc|chieu cao|^co(?:\s|$)|尺码|身高/.test(fold(label)) ? 'size' : 'classification';
  }
  // Names are presentation metadata. Never rewrite IDs, value strings or
  // their order: packed SKUs and image/price maps depend on those identities.
  const normalize = options => (Array.isArray(options) ? options : []).map(option => ({ ...option, name: name(option.name) }));
  const description = value => typeof value === 'string' ? value.replace(/Màu sắc\s*[:：]/gi, 'Phân loại:').replace(/Chiều cao\s*[:：]/gi, 'Size (cm):') : value;
  function valueLabel(option, value) {
    const text = String(value || '').replace(/\s+/g, ' ').replace(/\s*\+\s*/g, ' + ').trim();
    return kind(option) === 'size-cm' ? text.replace(/\s*cm$/i, '').trim() : text;
  }
  function visibleValues(option, selected, expanded = false) {
    const values = option?.values || [];
    if (expanded || kind(option) !== 'classification' || values.length <= COLLAPSED_LIMIT) return values;
    const visible = values.slice(0, COLLAPSED_LIMIT);
    if (values.includes(selected) && !visible.includes(selected)) visible[visible.length - 1] = selected;
    return visible;
  }
  function candidate(product, selection, option, value) {
    const options = product?.options || [];
    const matching = (product?.variants || []).filter(variant => variant?.enabled !== false && variant.stock > 0 && variant.values?.[option.id] === value);
    const exact = matching.find(variant => options.every(other => other.id === option.id || !selection[other.id] || variant.values?.[other.id] === selection[other.id]));
    // Changing a classification can select a different available size. Size
    // buttons must never silently switch the chosen outfit/classification.
    if (exact || kind(option) !== 'classification') return exact || null;
    return matching.map(variant => ({ variant, score: options.filter(other => other.id !== option.id && selection[other.id] === variant.values?.[other.id]).length }))
      .sort((a, b) => b.score - a.score)[0]?.variant || null;
  }
  return { COLLAPSED_LIMIT, name, kind, normalize, description, valueLabel, visibleValues, candidate };
});
