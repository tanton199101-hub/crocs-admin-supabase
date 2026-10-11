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
  const state = {
    query: params.get('query') || '', collection: params.get('collection') || '',
    sort: ['featured', 'newest', 'price-asc', 'price-desc', 'name'].includes(params.get('sort')) ? params.get('sort') : 'featured',
    price: ['all', 'under-200', '200-500', 'over-500'].includes(params.get('price')) ? params.get('price') : 'all',
    cursor: '', total: 0, activeTotal: 0, collections: [], server: true, loading: false,
  };
  let products = [];
  let searchTimer = 0;
  let requestId = 0;
  let filterFocus;
  const cardThemes = ['cream', 'sky', 'pink', 'yellow', 'mint', 'sand', 'lavender'];
  const labelForCollection = value => ({ 'New arrivals': 'Mới về', 'Cozy favourites': 'Được yêu thích', 'Tất cả sản phẩm 1688': 'Tất cả sản phẩm' }[value] || value || 'Bộ sưu tập');
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  const escape = value => commerce?.escape ? commerce.escape(value) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const cleanPath = (name, fallback) => root.location.protocol === 'file:' || /\.html$/i.test(root.location.pathname) ? fallback : name;
  const productUrl = product => `${cleanPath('product', 'product.html')}?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || product.id)}`;
  const isMobileFilters = () => root.matchMedia?.('(max-width: 980px)')?.matches;

  function readUrlState() {
    const next = new URLSearchParams(root.location.search);
    state.query = next.get('query') || ''; state.collection = next.get('collection') || '';
    state.sort = ['featured', 'newest', 'price-asc', 'price-desc', 'name'].includes(next.get('sort')) ? next.get('sort') : 'featured';
    state.price = ['all', 'under-200', '200-500', 'over-500'].includes(next.get('price')) ? next.get('price') : 'all';
  }

  function pushUrl() {
    const query = new URLSearchParams();
    if (state.query) query.set('query', state.query); if (state.collection) query.set('collection', state.collection);
    if (state.sort !== 'featured') query.set('sort', state.sort); if (state.price !== 'all') query.set('price', state.price);
    const path = cleanPath('shop', 'shop.html'); root.history.replaceState({}, '', `${path}${query.toString() ? `?${query}` : ''}`);
  }

  function selectedCollection() {
    return state.collections.find(item => item.id === state.collection) || (state.collection.startsWith('category:') ? { id: state.collection, title: state.collection.slice(9), category: state.collection.slice(9), productIds: [] } : null);
  }

  function categoryOptions() {
    const collectionItems = state.collections.filter(item => item.status !== 'Draft' && (item.count || item.productIds?.length));
    if (collectionItems.length) {
      const seenLabels = new Set();
      return collectionItems.filter(item => {
        if (/tất cả sản phẩm 1688/i.test(String(item.title || ''))) return false;
        const label = labelForCollection(item.title); if (seenLabels.has(label)) return false; seenLabels.add(label); return true;
      }).slice(0, 10);
    }
    const categories = [...new Set(products.map(product => String(product.category || '').trim()).filter(Boolean))];
    return categories.map(category => ({ id: `category:${category}`, title: category, category, productIds: products.filter(product => product.category === category).map(product => product.id), count: products.filter(product => product.category === category).length }));
  }

  function renderCollections() {
    if (!collectionsMount) return;
    const options = categoryOptions(); const allCount = state.server ? state.activeTotal || state.total : products.length;
    collectionsMount.innerHTML = `<button type="button" class="shop-collection-button${state.collection ? '' : ' is-active'}" data-collection=""><span>Tất cả sản phẩm</span><b>${allCount.toLocaleString('vi-VN')}</b></button>${options.map(item => `<button type="button" class="shop-collection-button${state.collection === item.id ? ' is-active' : ''}" data-collection="${escape(item.id)}"><span>${escape(labelForCollection(item.title))}</span><b>${Number(item.count ?? item.productIds?.length ?? 0).toLocaleString('vi-VN')}</b></button>`).join('')}`;
    collectionsMount.querySelectorAll('[data-collection]').forEach(button => button.addEventListener('click', () => { state.collection = button.dataset.collection || ''; pushUrl(); closeFilters(); fetchPage(); }));
  }

  function filteredFallback() {
    const collection = selectedCollection(); const ids = collection && !collection.id.startsWith('category:') ? new Set(collection.productIds || []) : null;
    const query = normalize(state.query); const thresholds = String(commerce?.currency || 'USD').toUpperCase() === 'VND' ? [200000, 500000] : [20000, 50000];
    const result = products.filter(product => {
      if (collection?.id?.startsWith('category:') && product.category !== collection.category) return false;
      if (ids && !ids.has(product.id)) return false;
      if (query && !normalize(`${product.title} ${product.category || ''} ${product.brand || ''} ${product.description || ''}`).includes(query)) return false;
      const price = Number(product.price || 0);
      if (state.price === 'under-200' && price >= thresholds[0]) return false;
      if (state.price === '200-500' && (price < thresholds[0] || price > thresholds[1])) return false;
      if (state.price === 'over-500' && price <= thresholds[1]) return false;
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
    const variants = commerce?.variantsFor?.(product) || []; const hasOptions = variants.length || product.hasVariants;
    const image = commerce?.image?.(product.image) || 'assets/sally-kids-product-placeholder.svg'; const price = variants.length ? Math.min(...variants.map(item => item.price)) : product.price;
    const badge = state.sort === 'newest' || index < 2 ? '<span class="shop-product-badge">Mới</span>' : '';
    return `<article class="shop-product-card" data-product-id="${escape(product.id)}"><a class="shop-product-link" href="${productUrl(product)}"><div class="shop-product-media shop-product-media--${cardThemes[index % cardThemes.length]}">${badge}<img data-smart-fit src="${escape(image)}" alt="${escape(product.imageAlt || product.title)}" width="520" height="693" loading="lazy" decoding="async"></div><div class="shop-product-copy"><p class="shop-product-category">${escape(product.category || 'Sally Kids')}</p><h3>${escape(product.title)}</h3><p class="shop-product-price">${commerce?.money?.(price) || ''}</p></div></a><button class="shop-product-action" type="button" data-shop-action="add" data-product-id="${escape(product.id)}" data-has-options="${hasOptions ? 'true' : 'false'}">${hasOptions ? 'Xem lựa chọn' : 'Thêm vào túi'}<span aria-hidden="true">+</span></button></article>`;
  }

  function renderActiveFilters() {
    if (!activeFilters) return;
    const chips = []; const collection = selectedCollection();
    if (state.query) chips.push(`<button type="button" data-clear-filter="query">Tìm: “${escape(state.query)}” <span>×</span></button>`);
    if (collection) chips.push(`<button type="button" data-clear-filter="collection">${escape(labelForCollection(collection.title))} <span>×</span></button>`);
    if (state.price !== 'all') chips.push(`<button type="button" data-clear-filter="price">${state.price === 'under-200' ? 'Dưới 200K' : state.price === '200-500' ? '200K – 500K' : 'Trên 500K'} <span>×</span></button>`);
    activeFilters.innerHTML = chips.join('');
    activeFilters.querySelectorAll('[data-clear-filter]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.clearFilter; state[key] = key === 'price' ? 'all' : ''; pushUrl(); syncControls(); fetchPage(); }));
  }

  function syncControls() {
    if (searchInput && searchInput.value !== state.query) searchInput.value = state.query;
    if (sortInput) sortInput.value = state.sort;
    document.querySelectorAll('input[name="price"]').forEach(input => { input.checked = input.value === state.price; });
  }

  function renderLoading() { if (grid && state.loading && !products.length) grid.innerHTML = '<div class="shop-loading"><span class="shop-loading-orbit" aria-hidden="true"></span><p>Đang chuẩn bị những món đồ thật vui…</p></div>'; }

  function render() {
    const all = state.server ? products : filteredFallback(); const collection = selectedCollection();
    if (title) title.textContent = collection ? labelForCollection(collection.title) : state.query ? `Kết quả cho “${state.query}”` : 'Tất cả sản phẩm';
    const count = state.server ? state.total : all.length; if (resultCount) resultCount.textContent = `${Number(count || 0).toLocaleString('vi-VN')} sản phẩm${count ? '' : ' phù hợp'}`;
    renderCollections(); renderActiveFilters();
    if (grid && !state.loading) grid.innerHTML = all.length ? all.map(productCard).join('') : `<div class="shop-empty"><span aria-hidden="true">☼</span><h3>Chưa có món đồ phù hợp</h3><p>Thử xoá bớt bộ lọc hoặc tìm bằng một từ khoá khác nhé.</p><button type="button" class="shop-secondary-button" data-clear-all>Xoá bộ lọc</button></div>`;
    if (loadMore) { loadMore.hidden = state.server ? !state.cursor : all.length >= products.length || !all.length; loadMore.disabled = state.loading; loadMore.textContent = state.loading ? 'Đang tải…' : 'Xem thêm sản phẩm'; }
    commerce?.enhanceImages?.(grid);
  }

  async function fetchPage({ append = false } = {}) {
    const currentRequest = ++requestId; if (state.loading) return; state.loading = true;
    if (!append) { state.cursor = ''; products = []; renderLoading(); }
    try {
      if (!commerce?.loadCatalogPage) throw new Error('API catalogue chưa sẵn sàng.');
      const data = await commerce.loadCatalogPage({ query: state.query, collection: state.collection, sort: state.sort, price: state.price, limit: 24, cursor: append ? state.cursor : '' });
      if (currentRequest !== requestId) return;
      const incoming = Array.isArray(data.products) ? data.products : []; const merged = append ? [...products, ...incoming] : incoming; const seen = new Set();
      products = merged.filter(item => item?.id && !seen.has(item.id) && seen.add(item.id)); state.server = true;
      state.total = Number(data.total || products.length); state.activeTotal = Number(data.activeTotal || state.total); state.cursor = data.nextCursor || '';
      state.collections = Array.isArray(data.collections) ? data.collections.filter(item => item.status !== 'Draft') : state.collections;
      if (state.collection && !state.collections.some(item => item.id === state.collection)) state.collection = '';
      syncControls(); render();
    } catch (error) {
      if (currentRequest !== requestId) return;
      try { await commerce?.ready; products = commerce?.products || []; state.server = false; state.cursor = ''; state.total = products.length; state.activeTotal = products.length; state.collections = []; syncControls(); render(); }
      catch { if (!products.length && grid) grid.innerHTML = `<div class="shop-empty"><h3>Catalog đang tạm thời chưa sẵn sàng</h3><p>${escape(error.message || 'Vui lòng thử lại sau.')}</p><button type="button" class="shop-secondary-button" data-clear-all>Thử lại</button></div>`; }
    } finally { if (currentRequest === requestId) { state.loading = false; render(); } }
  }

  function openFilters() { filterFocus = document.activeElement; sidebar?.classList.add('is-open'); sidebar?.setAttribute('aria-hidden', 'false'); sidebar?.removeAttribute('inert'); filterBackdrop?.removeAttribute('hidden'); filterToggle?.setAttribute('aria-expanded', 'true'); document.body.classList.add('shop-filters-open'); if (isMobileFilters()) requestAnimationFrame(() => searchInput?.focus()); }
  function closeFilters() { sidebar?.classList.remove('is-open'); const mobile = isMobileFilters(); sidebar?.setAttribute('aria-hidden', String(mobile)); if (mobile) sidebar?.setAttribute('inert', ''); else sidebar?.removeAttribute('inert'); if (filterBackdrop) filterBackdrop.hidden = true; filterToggle?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('shop-filters-open'); if (mobile && filterFocus instanceof HTMLElement) filterFocus.focus(); filterFocus = null; }
  function reset() { state.query = ''; state.collection = ''; state.price = 'all'; state.sort = 'featured'; pushUrl(); syncControls(); fetchPage(); }

  searchInput?.addEventListener('input', event => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { state.query = event.target.value.trim(); pushUrl(); fetchPage(); }, 220); });
  sortInput?.addEventListener('change', event => { state.sort = event.target.value; pushUrl(); fetchPage(); });
  document.querySelectorAll('input[name="price"]').forEach(input => input.addEventListener('change', event => { state.price = event.target.value; pushUrl(); fetchPage(); }));
  loadMore?.addEventListener('click', () => state.server ? fetchPage({ append: true }) : render()); clearButton?.addEventListener('click', reset);
  grid?.addEventListener('click', async event => {
    const clear = event.target.closest('[data-clear-all]'); if (clear) { reset(); return; }
    const button = event.target.closest('[data-shop-action="add"]'); if (!button || !commerce || button.disabled) return;
    const listed = products.find(item => item.id === button.dataset.productId); if (!listed) return;
    if (button.dataset.hasOptions === 'true') { root.location.href = productUrl(listed); return; }
    button.disabled = true;
    try { const product = await commerce.loadProduct(listed.id); commerce.add(product.id, commerce.sizesFor(product)[0], 1); ui?.toast?.(`${product.title} đã được thêm vào túi`); }
    catch (error) { ui?.toast?.(error.message); } finally { button.disabled = false; }
  });
  filterToggle?.addEventListener('click', openFilters); filterClose?.addEventListener('click', closeFilters); filterBackdrop?.addEventListener('click', closeFilters);
  document.addEventListener('keydown', event => { if (event.key === 'Escape') closeFilters(); if (event.key === '/' && !/input|textarea|select/i.test(document.activeElement?.tagName || '')) { event.preventDefault(); searchInput?.focus(); } });
  root.addEventListener('popstate', () => { readUrlState(); syncControls(); fetchPage(); }); root.addEventListener('resize', () => { if (!isMobileFilters()) closeFilters(); }, { passive: true });
  root.addEventListener('crocs:region-change', () => { if (state.server) fetchPage(); else { products = commerce?.products || products; render(); } }); root.addEventListener('crocs:language-change', () => { products = commerce?.products || products; render(); });
  syncControls(); renderLoading(); fetchPage();
})(window);
