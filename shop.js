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
  const categoriesMount = document.querySelector('#shopCategories');
  const facetMount = document.querySelector('#shopFacetMount');
  const sidebar = document.querySelector('#shopSidebar');
  const filterToggle = document.querySelector('#shopFilterToggle');
  const filterClose = document.querySelector('#shopSidebarClose');
  const filterBackdrop = document.querySelector('#shopFilterBackdrop');
  const filterApply = document.querySelector('#shopFilterApply');
  const params = new URLSearchParams(root.location.search);
  const state = {
    query: params.get('query') || '', collection: params.get('collection') || '',
    sort: ['featured', 'newest', 'price-asc', 'price-desc', 'name'].includes(params.get('sort')) ? params.get('sort') : 'featured',
    price: ['all', 'under-200', '200-500', 'over-500'].includes(params.get('price')) ? params.get('price') : 'all',
    category: [], type: [], audience: [], occasion: [], size: [], color: [],
    cursor: '', total: 0, activeTotal: 0, collections: [], facets: {}, server: true, loading: false,
  };
  let products = [];
  let searchTimer = 0;
  let requestId = 0;
  let pendingFetch = null;
  let filterFocus;
  const cardThemes = ['cream', 'sky', 'pink', 'yellow', 'mint', 'sand', 'lavender'];
  const labelForCollection = value => ({ 'New arrivals': 'Mới về', 'Cozy favourites': 'Được yêu thích', 'Tất cả sản phẩm 1688': 'Tất cả sản phẩm' }[value] || value || 'Bộ sưu tập');
  const normalize = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  const facetKey = value => normalize(value).replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '').slice(0, 80);
  const taxonomyGroups = [
    { id: 'performance', title: 'Trang phục biểu diễn', children: [['performance-jazz', 'Jazz / sân khấu'], ['performance-dance', 'Múa / nhảy'], ['performance-cheer', 'Cổ vũ'], ['performance-choir', 'Hợp xướng'], ['performance-hiphop', 'Hip hop'], ['performance-traditional', 'Trung Hoa / truyền thống']] },
    { id: 'dresses', title: 'Váy & đầm', children: [['dresses', 'Váy & đầm']] },
    { id: 'tops', title: 'Áo', children: [['tops-shirts', 'Áo thun / sơ mi'], ['tops-outerwear', 'Áo khoác / áo len']] },
    { id: 'bottoms', title: 'Quần & short', children: [['bottoms-pants', 'Quần dài / legging'], ['bottoms-shorts', 'Quần short']] },
    { id: 'sets', title: 'Bộ mặc hằng ngày', children: [['sets', 'Bộ mặc hằng ngày']] },
    { id: 'accessories', title: 'Phụ kiện', children: [['accessories-hats', 'Mũ / nón'], ['accessories-socks', 'Tất'], ['accessories-hair', 'Phụ kiện tóc'], ['accessories-belts', 'Thắt lưng'], ['accessories-shoes', 'Giày dép'], ['accessories-bags', 'Túi / balo'], ['accessories-other', 'Phụ kiện khác']] },
    { id: 'other', title: 'Sản phẩm khác', children: [['other', 'Sản phẩm khác']] },
  ];
  const taxonomyById = new Map(taxonomyGroups.flatMap(group => group.children.map(([id, title]) => [id, { id, title, parentId: group.id }])));
  const categoryById = new Map(taxonomyGroups.flatMap(group => [[group.id, { id: group.id, title: group.title }], ...group.children.map(([id, title]) => [id, { id, title }])]));
  const staticFacetLabels = {
    audience: { girls: 'Bé gái', boys: 'Bé trai', children: 'Trẻ em / unisex' },
    occasion: { performance: 'Biểu diễn / sân khấu', school: 'Đi học', party: 'Tiệc / dịp đặc biệt', summer: 'Mùa hè / đi biển', everyday: 'Mặc hằng ngày' },
  };
  const optionValues = (product, matcher) => {
    const options = Array.isArray(product?.options) ? product.options : [];
    const values = options.filter(option => matcher.test(normalize(option?.name || option?.id || ''))).flatMap(option => Array.isArray(option?.values) ? option.values : []);
    return [...new Set(values.map(value => String(value || '').trim()).filter(Boolean))];
  };
  const taxonomyFor = product => {
    const text = normalize([product?.title, product?.category, product?.type, product?.sku, ...(Array.isArray(product?.tags) ? product.tags : [])].join(' '));
    let categoryId = '', typeId = '';
    const setType = (category, type = category) => { categoryId = category; typeId = type; };
    if (/(^|\s)(mu|non|hat|cap)(\s|$)/.test(text)) setType('accessories', 'accessories-hats');
    else if (/(^|\s)(tat|sock)(\s|$)/.test(text)) setType('accessories', 'accessories-socks');
    else if (/bang do|phu kien toc|kep toc|hair/.test(text)) setType('accessories', 'accessories-hair');
    else if (/that lung|belt/.test(text)) setType('accessories', 'accessories-belts');
    else if (/giay|dep|sandal|shoe|boots?/.test(text)) setType('accessories', 'accessories-shoes');
    else if (/tui|balo|backpack|bag/.test(text)) setType('accessories', 'accessories-bags');
    else if (/phu kien|accessor/.test(text)) setType('accessories', 'accessories-other');
    else if (/bieu dien|san khau|mua|nhay|jazz|cheer|co vu|hop xuong|hip hop|khieu vu/.test(text)) setType('performance', /jazz|san khau/.test(text) ? 'performance-jazz' : /co vu|cheer/.test(text) ? 'performance-cheer' : /hop xuong/.test(text) ? 'performance-choir' : /trung hoa|trung quoc|truyen thong/.test(text) ? 'performance-traditional' : /hip hop/.test(text) ? 'performance-hiphop' : 'performance-dance');
    else if (/vay|dam|chan vay|dress|skirt/.test(text)) setType('dresses');
    else if (/quan|legging|short|pants|trousers/.test(text)) setType('bottoms', /short/.test(text) ? 'bottoms-shorts' : 'bottoms-pants');
    else if (/bo|set|ensemble|tracksuit/.test(text)) setType('sets');
    else if (/ao|so mi|t[- ]?shirt|shirt|jacket|coat|hoodie|uniform/.test(text)) setType('tops', /jacket|coat|hoodie|khoac|len/.test(text) ? 'tops-outerwear' : 'tops-shirts');
    if (!categoryId) setType('other');
    const audience = /be gai|con gai|girl|female|nu/.test(text) ? 'girls' : /be trai|con trai|boy|male|nam/.test(text) ? 'boys' : 'children';
    const occasions = categoryId === 'performance' ? ['performance'] : /mua he|summer|di bien|beach/.test(text) ? ['summer'] : /di hoc|dong phuc|school|uniform/.test(text) ? ['school'] : ['everyday'];
    const sizes = [...new Set([...(Array.isArray(product?.sizes) ? product.sizes : []), ...optionValues(product, /size|kich thuoc|co|tuoi|chieu cao/)].map(value => String(value || '').trim()).filter(Boolean))];
    const colors = [...new Set([...(Array.isArray(product?.colors) ? product.colors : []), ...(Array.isArray(product?.colours) ? product.colours : []), product?.colour, product?.color, ...optionValues(product, /phan loai|mau|color|colour/)].map(value => String(value || '').trim()).filter(Boolean))];
    return { categoryId, typeId, categoryIds: [categoryId, typeId], audience, occasions, sizes, colors };
  };
  const selectedCount = () => state.category.length + state.type.length + state.audience.length + state.occasion.length + state.size.length + state.color.length + (state.price !== 'all' ? 1 : 0) + (state.query ? 1 : 0) + (state.collection ? 1 : 0);
  const escape = value => commerce?.escape ? commerce.escape(value) : String(value ?? '').replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  const cleanPath = (name, fallback) => root.location.protocol === 'file:' || /\.html$/i.test(root.location.pathname) ? fallback : name;
  const productUrl = product => `${cleanPath('product', 'product.html')}?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || product.id)}`;
  const isMobileFilters = () => root.matchMedia?.('(max-width: 980px)')?.matches;

  function readUrlState() {
    const next = new URLSearchParams(root.location.search);
    state.query = (next.get('query') || '').slice(0, 120); state.collection = next.get('collection') || '';
    state.sort = ['featured', 'newest', 'price-asc', 'price-desc', 'name'].includes(next.get('sort')) ? next.get('sort') : 'featured';
    state.price = ['all', 'under-200', '200-500', 'over-500'].includes(next.get('price')) ? next.get('price') : 'all';
    for (const key of ['category', 'type', 'audience', 'occasion', 'size', 'color']) state[key] = [...new Set(String(next.get(key) || '').split(',').map(value => value.trim()).filter(Boolean))].slice(0, 24);
  }

  function pushUrl() {
    const query = new URLSearchParams();
    if (state.query) query.set('query', state.query); if (state.collection) query.set('collection', state.collection);
    if (state.sort !== 'featured') query.set('sort', state.sort); if (state.price !== 'all') query.set('price', state.price);
    for (const key of ['category', 'type', 'audience', 'occasion', 'size', 'color']) if (state[key].length) query.set(key, state[key].join(','));
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

  function checkboxOption(key, item, nested = false) {
    const checked = state[key].includes(item.id);
    return `<label class="shop-facet-option${nested ? ' is-nested' : ''}"><input type="checkbox" value="${escape(item.id)}" data-facet-key="${key}" ${checked ? 'checked' : ''}><span>${escape(item.title)}</span><b>${Number(item.count || 0).toLocaleString('vi-VN')}</b></label>`;
  }

  function facetTitle(key, value) {
    const source = state.facets?.[key === 'category' ? 'categories' : key === 'type' ? 'types' : key === 'audience' ? 'audiences' : key === 'occasion' ? 'occasions' : key === 'size' ? 'sizes' : 'colors'] || [];
    const item = source.flatMap(row => row.children ? [row, ...row.children] : [row]).find(row => row.id === value);
    return item?.title || (key === 'category' || key === 'type' ? categoryById.get(value)?.title : '') || staticFacetLabels[key]?.[value] || value;
  }

  function renderTaxonomy() {
    if (!categoriesMount) return;
    const groups = Array.isArray(state.facets?.categories) && state.facets.categories.length ? state.facets.categories : taxonomyGroups.map(group => ({ id: group.id, title: group.title, count: products.filter(product => taxonomyFor(product).categoryId === group.id).length, children: group.children.map(([id, title]) => ({ id, title, count: products.filter(product => taxonomyFor(product).typeId === id).length })).filter(item => item.count) })).filter(group => group.count);
    categoriesMount.innerHTML = groups.length ? groups.map(group => `<details class="shop-category-group" ${state.category.some(value => group.children.some(child => child.id === value)) || state.category.includes(group.id) ? 'open' : ''}><summary><span>${escape(group.title)}</span><b>${Number(group.count || 0).toLocaleString('vi-VN')}</b></summary><div class="shop-facet-options">${checkboxOption('category', { id: group.id, title: 'Tất cả ' + group.title, count: group.count })}${(group.children || []).map(child => checkboxOption('category', child, true)).join('')}</div></details>`).join('') : '<p class="shop-facet-empty">Danh mục sẽ hiện sau khi catalog tải xong.</p>';
    categoriesMount.querySelectorAll('[data-facet-key]').forEach(input => input.addEventListener('change', onFacetChange));
  }

  const facetGroups = [
    ['types', 'type', 'Kiểu sản phẩm'],
    ['audiences', 'audience', 'Đối tượng'],
    ['occasions', 'occasion', 'Dịp sử dụng'],
    ['sizes', 'size', 'Kích thước'],
    ['colors', 'color', 'Phân loại'],
  ];

  function renderFacetGroups() {
    if (!facetMount) return;
    const facets = state.server ? state.facets : fallbackFacets();
    facetMount.innerHTML = facetGroups.map(([source, key, title]) => {
      const items = Array.isArray(facets?.[source]) ? facets[source] : [];
      if (!items.length) return '';
      const open = state[key].length || (key === 'type' && state.category.length) ? ' open' : '';
      return `<details class="shop-filter-block shop-facet-group"${open}><summary class="shop-filter-title"><span>${title}</span><b>${items.length}</b></summary><div class="shop-facet-options">${items.map(item => checkboxOption(key, item)).join('')}</div></details>`;
    }).join('');
    facetMount.querySelectorAll('[data-facet-key]').forEach(input => input.addEventListener('change', onFacetChange));
  }

  function onFacetChange(event) {
    const key = event.target.dataset.facetKey; const value = event.target.value;
    if (!state[key]) return;
    state[key] = event.target.checked ? [...new Set([...state[key], value])] : state[key].filter(item => item !== value);
    pushUrl(); syncControls(); fetchPage();
  }

  function fallbackFacets() {
    const active = products.filter(product => product?.status === 'Active');
    const countValues = (key, source) => {
      const counts = new Map();
      active.forEach(product => {
        const taxonomy = taxonomyFor(product); const values = key === 'size' ? taxonomy.sizes : key === 'color' ? taxonomy.colors : key === 'type' ? [taxonomy.typeId] : key === 'audience' ? [taxonomy.audience] : taxonomy.occasions;
        [...new Set(values.map(value => key === 'size' || key === 'color' ? facetKey(value) : value))].forEach(id => { const row = counts.get(id) || { id, title: key === 'type' ? taxonomyById.get(id)?.title || id : staticFacetLabels[key]?.[id] || id, count: 0 }; if (key === 'size' || key === 'color') row.title = values.find(value => facetKey(value) === id) || id; row.count += 1; counts.set(id, row); });
      });
      return [...counts.values()].sort((left, right) => right.count - left.count || left.title.localeCompare(right.title, 'vi')).slice(0, 32);
    };
    return {
      types: countValues('type'), audiences: countValues('audience'), occasions: countValues('occasion'), sizes: countValues('size'), colors: countValues('color'),
    };
  }

  function filteredFallback() {
    const collection = selectedCollection(); const ids = collection && !collection.id.startsWith('category:') ? new Set(collection.productIds || []) : null;
    const query = normalize(state.query); const thresholds = String(commerce?.currency || 'USD').toUpperCase() === 'VND' ? [200000, 500000] : [20000, 50000];
    const result = products.filter(product => {
      if (collection?.id?.startsWith('category:') && product.category !== collection.category) return false;
      if (ids && !ids.has(product.id)) return false;
      const optionText = (Array.isArray(product?.options) ? product.options : []).flatMap(option => [option?.name, ...(Array.isArray(option?.values) ? option.values : [])]).join(' ');
      const searchable = normalize(`${product.title || ''} ${product.category || ''} ${product.brand || ''} ${product.sku || ''} ${product.description || ''} ${product.categoryTitle || ''} ${product.typeTitle || ''} ${product.tags?.join(' ') || ''} ${optionText}`);
      if (query && !query.split(/\s+/).filter(Boolean).every(token => searchable.includes(token))) return false;
      const taxonomy = taxonomyFor(product);
      if (state.category.length && !taxonomy.categoryIds.some(value => state.category.includes(value))) return false;
      if (state.type.length && !state.type.includes(taxonomy.typeId)) return false;
      if (state.audience.length && !state.audience.includes(taxonomy.audience)) return false;
      if (state.occasion.length && !taxonomy.occasions.some(value => state.occasion.includes(value))) return false;
      if (state.size.length && !taxonomy.sizes.some(value => state.size.includes(facetKey(value)))) return false;
      if (state.color.length && !taxonomy.colors.some(value => state.color.includes(facetKey(value)))) return false;
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
    return `<article class="shop-product-card" data-product-id="${escape(product.id)}"><a class="shop-product-link" href="${productUrl(product)}"><div class="shop-product-media shop-product-media--${cardThemes[index % cardThemes.length]}">${badge}<img data-smart-fit src="${escape(image)}" alt="${escape(product.imageAlt || product.title)}" width="520" height="693" loading="lazy" decoding="async"></div><div class="shop-product-copy"><p class="shop-product-category">${escape(product.typeTitle || product.categoryTitle || taxonomyById.get(taxonomyFor(product).typeId)?.title || product.category || 'Sally Kids')}</p><h3>${escape(product.title)}</h3><p class="shop-product-price">${commerce?.money?.(price) || ''}</p></div></a><button class="shop-product-action" type="button" data-shop-action="add" data-product-id="${escape(product.id)}" data-has-options="${hasOptions ? 'true' : 'false'}">${hasOptions ? 'Xem lựa chọn' : 'Thêm vào túi'}<span aria-hidden="true">+</span></button></article>`;
  }

  function renderActiveFilters() {
    if (!activeFilters) return;
    const chips = []; const collection = selectedCollection();
    if (state.query) chips.push(`<button type="button" data-clear-filter="query">Tìm: “${escape(state.query)}” <span>×</span></button>`);
    if (collection) chips.push(`<button type="button" data-clear-filter="collection">${escape(labelForCollection(collection.title))} <span>×</span></button>`);
    if (state.price !== 'all') chips.push(`<button type="button" data-clear-filter="price">${state.price === 'under-200' ? 'Dưới 200K' : state.price === '200-500' ? '200K – 500K' : 'Trên 500K'} <span>×</span></button>`);
    const labels = { category: 'Danh mục', type: 'Kiểu', audience: 'Đối tượng', occasion: 'Dịp', size: 'Size', color: 'Phân loại' };
    for (const key of ['category', 'type', 'audience', 'occasion', 'size', 'color']) state[key].forEach(value => {
      chips.push(`<button type="button" data-clear-filter="${key}" data-clear-value="${escape(value)}">${labels[key]}: ${escape(facetTitle(key, value))} <span>×</span></button>`);
    });
    activeFilters.innerHTML = chips.join('');
    activeFilters.querySelectorAll('[data-clear-filter]').forEach(button => button.addEventListener('click', () => { const key = button.dataset.clearFilter; if (['category', 'type', 'audience', 'occasion', 'size', 'color'].includes(key)) state[key] = state[key].filter(value => value !== button.dataset.clearValue); else state[key] = key === 'price' ? 'all' : ''; pushUrl(); syncControls(); fetchPage(); }));
  }

  function syncControls() {
    if (searchInput && searchInput.value !== state.query) searchInput.value = state.query;
    if (sortInput) sortInput.value = state.sort;
    document.querySelectorAll('input[name="price"]').forEach(input => { input.checked = input.value === state.price; });
    document.querySelectorAll('[data-facet-key]').forEach(input => { input.checked = Boolean(state[input.dataset.facetKey]?.includes(input.value)); });
    if (filterToggle) { filterToggle.setAttribute('aria-label', selectedCount() ? `Bộ lọc, ${selectedCount()} đang chọn` : 'Bộ lọc'); filterToggle.innerHTML = `<svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 6h16M7 12h10M10 18h4"></path></svg> Bộ lọc${selectedCount() ? ` <span class="shop-filter-count">${selectedCount()}</span>` : ''}`; }
  }

  function renderLoading() { if (grid && state.loading && !products.length) grid.innerHTML = '<div class="shop-loading"><span class="shop-loading-orbit" aria-hidden="true"></span><p>Đang chuẩn bị những món đồ thật vui…</p></div>'; }

  function render() {
    const all = state.server ? products : filteredFallback(); const collection = selectedCollection();
    if (title) title.textContent = collection ? labelForCollection(collection.title) : state.query ? `Kết quả cho “${state.query}”` : 'Tất cả sản phẩm';
    const count = state.server ? state.total : all.length; if (resultCount) resultCount.textContent = `${Number(count || 0).toLocaleString('vi-VN')} sản phẩm${count ? '' : ' phù hợp'}`;
    renderCollections(); renderTaxonomy(); renderFacetGroups(); renderActiveFilters();
    if (grid && !state.loading) grid.innerHTML = all.length ? all.map(productCard).join('') : `<div class="shop-empty"><span aria-hidden="true">☼</span><h3>Chưa có món đồ phù hợp</h3><p>Thử xoá bớt bộ lọc hoặc tìm bằng một từ khoá khác nhé.</p><button type="button" class="shop-secondary-button" data-clear-all>Xoá bộ lọc</button></div>`;
    if (loadMore) { loadMore.hidden = state.server ? !state.cursor : all.length >= products.length || !all.length; loadMore.disabled = state.loading; loadMore.textContent = state.loading ? 'Đang tải…' : 'Xem thêm sản phẩm'; }
    commerce?.enhanceImages?.(grid);
  }

  async function fetchPage({ append = false } = {}) {
    if (state.loading) { pendingFetch = { append: false }; return; }
    const currentRequest = ++requestId; state.loading = true;
    if (!append) { state.cursor = ''; products = []; renderLoading(); }
    try {
      if (!commerce?.loadCatalogPage) throw new Error('API catalogue chưa sẵn sàng.');
      const data = await commerce.loadCatalogPage({ query: state.query, collection: state.collection, sort: state.sort, price: state.price, category: state.category, type: state.type, audience: state.audience, occasion: state.occasion, size: state.size, color: state.color, limit: 24, cursor: append ? state.cursor : '' });
      if (currentRequest !== requestId) return;
      const incoming = Array.isArray(data.products) ? data.products : []; const merged = append ? [...products, ...incoming] : incoming; const seen = new Set();
      products = merged.filter(item => item?.id && !seen.has(item.id) && seen.add(item.id)); state.server = true;
      state.total = Number(data.total || products.length); state.activeTotal = Number(data.activeTotal || state.total); state.cursor = data.nextCursor || '';
      state.collections = Array.isArray(data.collections) ? data.collections.filter(item => item.status !== 'Draft') : state.collections;
      state.facets = data.facets && typeof data.facets === 'object' ? data.facets : {};
      if (state.collection && !state.collections.some(item => item.id === state.collection)) state.collection = '';
      syncControls(); render();
    } catch (error) {
      if (currentRequest !== requestId) return;
      try { await commerce?.ready; products = commerce?.products || []; state.server = false; state.cursor = ''; state.total = products.length; state.activeTotal = products.length; state.collections = []; state.facets = {}; syncControls(); render(); }
      catch { if (!products.length && grid) grid.innerHTML = `<div class="shop-empty"><h3>Catalog đang tạm thời chưa sẵn sàng</h3><p>${escape(error.message || 'Vui lòng thử lại sau.')}</p><button type="button" class="shop-secondary-button" data-clear-all>Thử lại</button></div>`; }
    } finally {
      if (currentRequest === requestId) {
        state.loading = false; render();
        const queued = pendingFetch; pendingFetch = null;
        if (queued) fetchPage(queued);
      }
    }
  }

  function openFilters() { filterFocus = document.activeElement; sidebar?.classList.add('is-open'); sidebar?.setAttribute('aria-hidden', 'false'); sidebar?.removeAttribute('inert'); filterBackdrop?.removeAttribute('hidden'); filterToggle?.setAttribute('aria-expanded', 'true'); document.body.classList.add('shop-filters-open'); if (isMobileFilters()) requestAnimationFrame(() => searchInput?.focus()); }
  function closeFilters() { sidebar?.classList.remove('is-open'); const mobile = isMobileFilters(); sidebar?.setAttribute('aria-hidden', String(mobile)); if (mobile) sidebar?.setAttribute('inert', ''); else sidebar?.removeAttribute('inert'); if (filterBackdrop) filterBackdrop.hidden = true; filterToggle?.setAttribute('aria-expanded', 'false'); document.body.classList.remove('shop-filters-open'); if (mobile && filterFocus instanceof HTMLElement) filterFocus.focus(); filterFocus = null; }
  function reset() { state.query = ''; state.collection = ''; state.price = 'all'; state.sort = 'featured'; for (const key of ['category', 'type', 'audience', 'occasion', 'size', 'color']) state[key] = []; pushUrl(); syncControls(); fetchPage(); }

  searchInput?.addEventListener('input', event => { window.clearTimeout(searchTimer); searchTimer = window.setTimeout(() => { state.query = event.target.value.trim().slice(0, 120); pushUrl(); fetchPage(); }, 220); });
  sortInput?.addEventListener('change', event => { state.sort = event.target.value; pushUrl(); fetchPage(); });
  document.querySelectorAll('input[name="price"]').forEach(input => input.addEventListener('change', event => { state.price = event.target.value; pushUrl(); fetchPage(); }));
  loadMore?.addEventListener('click', () => state.server ? fetchPage({ append: true }) : render()); clearButton?.addEventListener('click', reset);
  filterApply?.addEventListener('click', closeFilters);
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
  readUrlState(); syncControls(); renderLoading(); fetchPage();
})(window);
