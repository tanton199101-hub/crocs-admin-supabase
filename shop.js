(function (root) {
  'use strict';

  const commerce = root.CrocsCommerce;
  const ui = root.CrocsCommerceUI;
  const grid = document.querySelector('#shopGrid');
  const searchInput = document.querySelector('#shopSearch');
  const sortInput = document.querySelector('#shopSort');
  const resultCount = document.querySelector('#shopResultCount');
  const title = document.querySelector('#catalogTitle');
  const collectionsMount = document.querySelector('#shopCollections');
  const activeFilters = document.querySelector('#shopActiveFilters');
  const loadMore = document.querySelector('#shopLoadMore');
  const clearButton = document.querySelector('#shopClear');
  const sidebar = document.querySelector('#shopSidebar');
  const filterToggle = document.querySelector('#shopFilterToggle');
  const filterClose = document.querySelector('#shopSidebarClose');
  const filterBackdrop = document.querySelector('#shopFilterBackdrop');
  const params = new URLSearchParams(root.location.search);
  const state = { query: params.get('query') || '', collection: params.get('collection') || '', sort: params.get('sort') || 'featured', price: params.get('price') || 'all', limit: 24, collections: [] };
  let products = [];
  let searchTimer = 0;
  const cardThemes = ['cream', 'sky', 'pink', 'yellow', 'mint', 'sand', 'lavender'];
  const labelForCollection = value => ({ 'New arrivals': 'Mới về', 'Cozy favourites': 'Được yêu thích', 'Tất cả sản phẩm 1688': 'Tất cả sản phẩm' }[value] || value || 'Bộ sưu tập');
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escape = value => commerce?.escape ? commerce.escape(value) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const productUrl = product => `product.html?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || product.id)}`;
  const priceBandThresholds = () => String(commerce?.currency || 'USD').toUpperCase() === 'VND' ? [200000, 500000] : [20000, 50000];

  function pushUrl() {
    const query = new URLSearchParams();
    if (state.query) query.set('query', state.query);
    if (state.collection) query.set('collection', state.collection);
    if (state.sort !== 'featured') query.set('sort', state.sort);
    if (state.price !== 'all') query.set('price', state.price);
    const next = `${root.location.pathname}${query.toString() ? `?${query}` : ''}`;
    root.history.replaceState({}, '', next);
  }

  function selectedCollection() { return state.collections.find(item => item.id === state.collection) || null; }

  function categoryOptions() {
    const collectionItems = state.collections.filter(item => item.status !== 'Draft' && Array.isArray(item.productIds) && item.productIds.length);
    if (collectionItems.length) {
      const seenLabels = new Set();
      return collectionItems.filter(item => {
        if (/tất cả sản phẩm 1688/i.test(String(item.title || ''))) return false;
        const label = labelForCollection(item.title);
        if (seenLabels.has(label)) return false;
        seenLabels.add(label);
        return true;
      }).slice(0, 10);
    }
    const categories = [...new Set(products.map(product => String(product.category || '').trim()).filter(Boolean))];
    return categories.map((category, index) => ({ id: `category:${category}`, title: category, productIds: products.filter(product => product.category === category).map(product => product.id), category }));
  }

  function renderCollections() {
    if (!collectionsMount) return;
    const options = categoryOptions();
    const allCount = products.length;
    collectionsMount.innerHTML = `<button type="button" class="shop-collection-button${state.collection ? '' : ' is-active'}" data-collection=""><span>Tất cả sản phẩm</span><b>${allCount}</b></button>${options.map(item => `<button type="button" class="shop-collection-button${state.collection === item.id ? ' is-active' : ''}" data-collection="${escape(item.id)}"><span>${escape(labelForCollection(item.title))}</span><b>${Array.isArray(item.productIds) ? item.productIds.length : 0}</b></button>`).join('')}`;
    collectionsMount.querySelectorAll('[data-collection]').forEach(button => button.addEventListener('click', () => {
      state.collection = button.dataset.collection || '';
      state.limit = 24;
      pushUrl();
      render();
      closeFilters();
    }));
  }

  function filteredProducts() {
    const collection = selectedCollection();
    const collectionIds = collection ? new Set(collection.productIds || []) : null;
    const query = normalize(state.query);
    let result = products.filter(product => {
      if (collection?.id?.startsWith('category:') && product.category !== collection.category) return false;
      if (collectionIds && !collection.id.startsWith('category:') && !collectionIds.has(product.id)) return false;
      const value = normalize(`${product.title} ${product.category || ''} ${product.brand || ''} ${product.description || ''}`);
      if (query && !value.includes(query)) return false;
      const price = Number(product.price || 0);
      const [under, over] = priceBandThresholds();
      if (state.price === 'under-200' && price >= under) return false;
      if (state.price === '200-500' && (price < under || price > over)) return false;
      if (state.price === 'over-500' && price <= over) return false;
      return product.status === 'Active';
    });
    result.sort((left, right) => {
      if (state.sort === 'price-asc') return Number(left.price || 0) - Number(right.price || 0);
      if (state.sort === 'price-desc') return Number(right.price || 0) - Number(left.price || 0);
      if (state.sort === 'name') return String(left.title).localeCompare(String(right.title), 'vi');
      if (state.sort === 'newest') return String(right.createdAt || right.updatedAt || right.id).localeCompare(String(left.createdAt || left.updatedAt || left.id));
      return Number(right.stock || 0) - Number(left.stock || 0);
    });
    return result;
  }

  function productCard(product, index) {
    const variants = commerce?.variantsFor?.(product) || [];
    const actionLabel = variants.length || product.hasVariants ? 'Xem lựa chọn' : 'Thêm vào túi';
    const image = commerce?.image?.(product.image) || 'assets/sally-kids-hero.png';
    const price = variants.length ? Math.min(...variants.map(item => item.price)) : product.price;
    const badge = state.sort === 'newest' || index < 2 ? '<span class="shop-product-badge">Mới</span>' : '';
    return `<article class="shop-product-card" data-product-id="${escape(product.id)}"><a class="shop-product-link" href="${productUrl(product)}"><div class="shop-product-media shop-product-media--${cardThemes[index % cardThemes.length]}">${badge}<img data-smart-fit src="${escape(image)}" alt="${escape(product.imageAlt || product.title)}" width="520" height="693" loading="lazy" decoding="async"></div><div class="shop-product-copy"><p class="shop-product-category">${escape(product.category || 'Sally Kids')}</p><h3>${escape(product.title)}</h3><p class="shop-product-price">${commerce?.money?.(price) || ''}</p></div></a><button class="shop-product-action" type="button" data-shop-action="add" data-product-id="${escape(product.id)}" data-has-options="${variants.length || product.hasVariants ? 'true' : 'false'}">${actionLabel}<span aria-hidden="true">+</span></button></article>`;
  }

  function renderActiveFilters() {
    if (!activeFilters) return;
    const chips = [];
    const collection = selectedCollection();
    if (state.query) chips.push(`<button type="button" data-clear-filter="query">Tìm: “${escape(state.query)}” <span>×</span></button>`);
    if (collection) chips.push(`<button type="button" data-clear-filter="collection">${escape(labelForCollection(collection.title))} <span>×</span></button>`);
    if (state.price !== 'all') chips.push(`<button type="button" data-clear-filter="price">${state.price === 'under-200' ? 'Dưới 200K' : state.price === '200-500' ? '200K – 500K' : 'Trên 500K'} <span>×</span></button>`);
    activeFilters.innerHTML = chips.join('');
    activeFilters.querySelectorAll('[data-clear-filter]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.clearFilter; state[key] = key === 'price' ? 'all' : ''; state.limit = 24; pushUrl(); syncControls(); render(); }));
  }

  function syncControls() {
    if (searchInput && searchInput.value !== state.query) searchInput.value = state.query;
    if (sortInput) sortInput.value = state.sort;
    document.querySelectorAll('input[name="price"]').forEach(input => { input.checked = input.value === state.price; });
  }

  function render() {
    const all = filteredProducts();
    const visible = all.slice(0, state.limit);
    const collection = selectedCollection();
    if (title) title.textContent = collection ? labelForCollection(collection.title) : state.query ? `Kết quả cho “${state.query}”` : 'Tất cả sản phẩm';
    if (resultCount) resultCount.textContent = `${all.length.toLocaleString('vi-VN')} sản phẩm${all.length ? '' : ' phù hợp'}`;
    renderCollections();
    renderActiveFilters();
    if (grid) grid.innerHTML = visible.length ? visible.map(productCard).join('') : `<div class="shop-empty"><span aria-hidden="true">☼</span><h3>Chưa có món đồ phù hợp</h3><p>Thử xoá bớt bộ lọc hoặc tìm bằng một từ khoá khác nhé.</p><button type="button" class="shop-secondary-button" data-clear-all>Xoá bộ lọc</button></div>`;
    if (loadMore) loadMore.hidden = visible.length >= all.length || !all.length;
    commerce?.enhanceImages?.(grid);
  }

  function openFilters() { sidebar?.classList.add('is-open'); sidebar?.setAttribute('aria-hidden', 'false'); filterBackdrop?.removeAttribute('hidden'); filterToggle?.setAttribute('aria-expanded', 'true'); document.body.classList.add('shop-filters-open'); }
  function closeFilters() { sidebar?.classList.remove('is-open'); sidebar?.setAttribute('aria-hidden', 'false'); if (filterBackdrop) filterBackdrop.hidden = true; filterToggle?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('shop-filters-open'); }
  function reset() { state.query = ''; state.collection = ''; state.price = 'all'; state.sort = 'featured'; state.limit = 24; pushUrl(); syncControls(); render(); }

  searchInput?.addEventListener('input', event => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { state.query = event.target.value.trim(); state.limit = 24; pushUrl(); render(); }, 160); });
  sortInput?.addEventListener('change', event => { state.sort = event.target.value; state.limit = 24; pushUrl(); render(); });
  document.querySelectorAll('input[name="price"]').forEach(input => input.addEventListener('change', event => { state.price = event.target.value; state.limit = 24; pushUrl(); render(); }));
  loadMore?.addEventListener('click', () => { state.limit += 24; render(); });
  clearButton?.addEventListener('click', reset);
  grid?.addEventListener('click', event => {
    const clear = event.target.closest('[data-clear-all]');
    if (clear) { reset(); return; }
    const button = event.target.closest('[data-shop-action="add"]');
    if (!button || !commerce) return;
    const product = commerce.product(button.dataset.productId);
    if (!product) return;
    if (button.dataset.hasOptions === 'true') { root.location.href = productUrl(product); return; }
    try { const size = commerce.sizesFor(product)[0]; commerce.add(product.id, size, 1); ui?.toast?.(`${product.title} đã được thêm vào túi`); } catch (error) { ui?.toast?.(error.message); }
  });
  filterToggle?.addEventListener('click', openFilters);
  filterClose?.addEventListener('click', closeFilters);
  filterBackdrop?.addEventListener('click', closeFilters);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeFilters(); if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { event.preventDefault(); searchInput?.focus(); } });

  function receiveCatalog(event) {
    products = Array.isArray(event?.detail?.products) ? event.detail.products : commerce?.products || [];
    state.collections = Array.isArray(event?.detail?.collections) ? event.detail.collections.filter(item => item.status !== 'Draft') : state.collections;
    if (state.collection && !state.collections.some(item => item.id === state.collection)) state.collection = '';
    syncControls();
    render();
  }
  root.addEventListener('crocs:catalog', receiveCatalog);
  root.addEventListener('crocs:region-change', () => { products = commerce?.products || products; render(); });
  root.addEventListener('crocs:language-change', () => { products = commerce?.products || products; render(); });
  commerce?.ready?.then(() => { products = commerce.products || []; syncControls(); render(); }).catch(() => { products = commerce?.products || []; syncControls(); render(); });
})(window);
