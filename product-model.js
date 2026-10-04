(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CrocsProducts = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';
  const MAX_VARIANTS = 100;
  const MAX_AMOUNT = 100000000;
  const clone = value => JSON.parse(JSON.stringify(value));
  const slugify = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 100).replace(/-$/, '');
  const norm = value => String(value).trim().toLowerCase();
  const variantsOf = p => Array.isArray(p.variants) ? p.variants : [];
  const variantTitle = (p, v) => (p.options || []).map(o => v.values[o.id]).join(' / ');
  const key = values => JSON.stringify(Object.entries(values).map(([id, v]) => [id, norm(v)]).sort(([a], [b]) => a.localeCompare(b)));
  const amount = (value, label = 'Giá') => {
    const text = String(value).trim();
    if (!/^\d+(\.\d{1,2})?$/.test(text)) throw new Error(`${label}: nhập số không âm, tối đa 2 chữ số thập phân.`);
    const result = Math.round(Number(text) * 100);
    if (!Number.isSafeInteger(result) || result > MAX_AMOUNT) throw new Error(`${label} vượt giới hạn £1.000.000.`);
    return result;
  };
  const count = (value, label = 'Tồn kho') => {
    if (!/^\d+$/.test(String(value)) || !Number.isSafeInteger(Number(value)) || Number(value) > 1000000) throw new Error(`${label}: nhập số nguyên từ 0 đến 1.000.000.`);
    return Number(value);
  };
  function cleanOptions(options) {
    if (!Array.isArray(options) || options.length > 3) throw new Error('Tối đa 3 thuộc tính cho mỗi sản phẩm.');
    const result = options.map(o => ({ id: String(o.id || ''), name: String(o.name || '').trim(), values: (Array.isArray(o.values) ? o.values : String(o.values || '').split(',')).map(v => String(v).trim()).filter(Boolean) }));
    if (new Set(result.map(o => norm(o.name))).size !== result.length || new Set(result.map(o => o.id)).size !== result.length) throw new Error('Tên thuộc tính không được trùng.');
    result.forEach(o => {
      if (!/^[a-zA-Z0-9_-]+$/.test(o.id) || !o.name || o.name.length > 40 || !o.values.length || o.values.length > 30 || o.values.some(v => v.length > 40)) throw new Error('Mỗi thuộc tính cần tên và 1–30 giá trị, tối đa 40 ký tự mỗi giá trị.');
      if (new Set(o.values.map(norm)).size !== o.values.length) throw new Error(`Giá trị của ${o.name} bị trùng.`);
    });
    if (result.reduce((n, o) => n * o.values.length, 1) > MAX_VARIANTS) throw new Error(`Bản admin này hỗ trợ tối đa ${MAX_VARIANTS} tổ hợp/sản phẩm. Hãy giảm số giá trị.`);
    return result;
  }
  function generate(options, existing = [], defaults = {}) {
    options = cleanOptions(options);
    if (!options.length) return [];
    let combinations = [{}];
    options.forEach(o => { combinations = combinations.flatMap(values => o.values.map(value => ({ ...values, [o.id]: value }))); });
    const old = new Map(existing.map(v => [key(v.values), v]));
    const used = new Set(existing.map(v => norm(v.sku)));
    const ids = new Set(existing.map(v => v.id));
    return combinations.map(values => {
      const previous = old.get(key(values));
      if (previous) return { ...clone(previous), values };
      const base = `${slugify(defaults.sku || 'VAR').toUpperCase()}-${options.map(o => slugify(values[o.id]).toUpperCase() || 'V').join('-')}`.slice(0, 70);
      let sku = base, n = 1;
      while (used.has(norm(sku))) sku = `${base}-${++n}`;
      used.add(norm(sku));
      let id = `v-${slugify(sku)}`, suffix = 1;
      while (ids.has(id)) id = `v-${slugify(sku)}-${++suffix}`;
      ids.add(id);
      return { id, values, sku, price: defaults.price || 0, compareAt: defaults.compareAt ?? null, cost: defaults.cost ?? null, stock: 0, enabled: true, barcode: '' };
    });
  }
  function aggregate(product) {
    const variants = variantsOf(product);
    if (!variants.length) return product;
    const active = variants.filter(v => v.enabled);
    return { ...product, price: active.length ? Math.min(...active.map(v => v.price)) : 0, stock: active.reduce((n, v) => n + v.stock, 0) };
  }
  function validate(product, all = []) {
    const integer = (n, limit = MAX_AMOUNT) => Number.isSafeInteger(n) && n >= 0 && n <= limit;
    const pricing = (item, label) => {
      if (!integer(item.price) || !integer(item.stock, 1000000)) throw new Error(`${label}: giá hoặc tồn kho không hợp lệ.`);
      if (item.compareAt != null && (!integer(item.compareAt) || item.compareAt <= item.price)) throw new Error(`${label}: giá niêm yết phải lớn hơn giá bán, hoặc để trống.`);
      if (item.cost != null && !integer(item.cost)) throw new Error(`${label}: giá vốn không hợp lệ.`);
    };
    if (!product.title?.trim() || !product.sku?.trim()) throw new Error('Nhập tên sản phẩm và SKU gốc.');
    const variants = variantsOf(product), options = cleanOptions(product.options || []);
    if (!!options.length !== !!variants.length || variants.length > MAX_VARIANTS) throw new Error('Hãy tạo bảng biến thể từ các thuộc tính trước khi lưu.');
    const skus = [norm(product.sku)], identities = new Set(), ids = new Set();
    if (variants.length) {
      variants.forEach(v => {
        if (!v.id || ids.has(v.id) || typeof v.enabled !== 'boolean' || !v.sku?.trim()) throw new Error('Biến thể cần ID, SKU duy nhất và trạng thái hợp lệ.');
        ids.add(v.id); skus.push(norm(v.sku));
        if (!v.values || Object.keys(v.values).length !== options.length || options.some(o => !o.values.includes(v.values[o.id]))) throw new Error('Thuộc tính đã thay đổi. Hãy cập nhật bảng biến thể.');
        if (identities.has(key(v.values))) throw new Error('Không được trùng tổ hợp biến thể.');
        identities.add(key(v.values));
        pricing(v, variantTitle(product, v));
      });
      const totals = aggregate(product);
      if (totals.price !== product.price || totals.stock !== product.stock) throw new Error('Giá/tồn tổng phải được tính từ các biến thể đang bật.');
    } else pricing(product, product.title);
    if (new Set(skus).size !== skus.length) throw new Error('SKU gốc và các SKU biến thể không được trùng nhau.');
    const others = all.filter(p => p.id !== product.id);
    const taken = new Set(others.flatMap(p => [p.sku, ...variantsOf(p).map(v => v.sku)]).map(norm));
    if (skus.some(sku => taken.has(sku))) throw new Error('SKU đã được sử dụng ở sản phẩm khác.');
    if (product.slug && (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(product.slug) || others.some(p => p.slug === product.slug))) throw new Error('Đường dẫn cần duy nhất; chỉ dùng chữ thường không dấu, số và dấu gạch ngang.');
    if (product.seo && (typeof product.seo.title !== 'string' || product.seo.title.length > 200 || typeof product.seo.description !== 'string' || product.seo.description.length > 500 || typeof product.seo.noindex !== 'boolean')) throw new Error('Dữ liệu SEO không hợp lệ.');
    return product;
  }
  function bulk(variants, selectedIds, operation, value) {
    if (!selectedIds.length) throw new Error('Chọn ít nhất một biến thể.');
    const ids = new Set(selectedIds);
    const allowed = ['price', 'price-percent', 'price-delta', 'compareAt', 'stock', 'stock-delta', 'enabled'];
    if (!allowed.includes(operation)) throw new Error('Thao tác hàng loạt không hợp lệ.');
    return variants.map(v => {
      if (!ids.has(v.id)) return clone(v);
      const next = clone(v);
      if (operation === 'enabled') next.enabled = value === 'true';
      else if (operation === 'price' || operation === 'compareAt') next[operation] = operation === 'compareAt' && value === '' ? null : amount(value);
      else if (operation === 'stock') next.stock = count(value);
      else {
        if (!/^[+-]?\d+(\.\d{1,2})?$/.test(String(value).trim())) throw new Error('Nhập mức điều chỉnh hợp lệ, ví dụ 10 hoặc -10.');
        const change = Number(value);
        if (operation === 'stock-delta') {
          if (!Number.isInteger(change)) throw new Error('Mức điều chỉnh tồn phải là số nguyên.');
          next.stock += change;
        } else next.price = operation === 'price-percent' ? Math.round(v.price * (1 + change / 100)) : v.price + Math.round(change * 100);
      }
      if (!Number.isSafeInteger(next.price) || next.price < 0 || next.price > MAX_AMOUNT || !Number.isSafeInteger(next.stock) || next.stock < 0 || next.stock > 1000000) throw new Error('Điều chỉnh làm giá/tồn âm hoặc vượt giới hạn. Chưa áp dụng thay đổi.');
      if (next.compareAt != null && next.compareAt <= next.price) throw new Error('Giá bán mới không được bằng/vượt giá niêm yết. Hãy xóa hoặc tăng giá niêm yết trước.');
      return next;
    });
  }
  function seoReport(p) {
    const title = p.seo?.title || p.title || '', description = p.seo?.description || p.description || '';
    return [
      { label: 'Tên sản phẩm rõ ràng', ok: (p.title || '').trim().length >= 10 },
      { label: 'Mô tả riêng cho sản phẩm (gợi ý ≥ 120 ký tự)', ok: (p.description || '').trim().length >= 120 },
      { label: 'Tiêu đề SEO dễ đọc (gợi ý 30–60 ký tự)', ok: title.length >= 30 && title.length <= 60 },
      { label: 'Mô tả tìm kiếm (gợi ý 80–160 ký tự)', ok: description.length >= 80 && description.length <= 160 },
      { label: 'Đường dẫn ngắn, không dấu', ok: !!p.slug && p.slug.length <= 75 },
      { label: 'Ảnh có văn bản thay thế', ok: !!p.image && !!p.imageAlt?.trim() },
      { label: 'Cho phép lập chỉ mục', ok: p.status === 'Active' && !p.seo?.noindex }
    ];
  }
  function health(products, threshold = 10) {
    const live = products.filter(p => p.status !== 'Archived');
    return { variants: live.reduce((n, p) => n + variantsOf(p).length, 0), low: live.flatMap(p => variantsOf(p).length ? p.variants.filter(v => v.enabled && v.stock <= threshold).map(v => ({ productId: p.id, title: `${p.title} / ${variantTitle(p, v)}`, stock: v.stock })) : p.stock <= threshold ? [{ productId: p.id, title: p.title, stock: p.stock }] : []), seo: live.filter(p => seoReport(p).filter(c => c.ok).length < 6) };
  }
  return { MAX_VARIANTS, clone, slugify, amount, count, variantsOf, variantTitle, key, cleanOptions, generate, aggregate, validate, bulk, seoReport, health };
});
