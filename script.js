(() => {
  const body = document.body;
  const liveRegion = document.querySelector('#liveRegion');
  const toast = document.querySelector('#toast');
  const backdrop = document.querySelector('#drawerBackdrop');
  const menuButton = document.querySelector('#menuButton');
  const menuDrawer = document.querySelector('#menuDrawer');
  const cartButton = document.querySelector('#cartButton');
  const cartDrawer = document.querySelector('#cartDrawer');
  const accountButton = document.querySelector('#accountButton');
  const accountDrawer = document.querySelector('#accountDrawer');
  const searchTrigger = document.querySelector('#searchTrigger');
  const searchPanel = document.querySelector('#searchPanel');
  const searchClose = document.querySelector('#searchClose');
  const searchForm = document.querySelector('#searchForm');
  const searchInput = document.querySelector('#searchInput');
  const cartCount = document.querySelector('#cartCount');
  const cartEmpty = document.querySelector('#cartEmpty');
  const cartItems = document.querySelector('#cartItems');
  const cartSummary = document.querySelector('#cartSummary');
  const cartSubtotal = document.querySelector('#cartSubtotal');
  const checkoutButton = document.querySelector('#checkoutButton');
  const arrivalRail = document.querySelector('.arrival-rail');
  const catalogGrid = document.querySelector('#catalogProductGrid');
  const catalogFilters = document.querySelector('#catalogFilters');
  const catalogCount = document.querySelector('#catalogCount');
  const catalogTitle = document.querySelector('#catalogTitle');
  const catalogLoadMore = document.querySelector('#catalogLoadMore');
  const commerce = window.CrocsCommerce;
  const t = (...args) => commerce?.t?.(...args) || args[1] || args[0];
  let cart = [];
  let toastTimer;
  let lastOpener = null;
  let publicCollections = [];
  let activeCollectionId = '';
  let visibleCatalogProducts = 24;
  const publicCollectionTitle = value => ({ 'New arrivals': 'Mới về', 'Cozy favourites': 'Được yêu thích' }[String(value || '')] || String(value || '').replace(/\s*1688\s*/gi, ' ').trim());

  function collectionIconSymbol(collection = {}) {
    const known = {
      'col1': 'new', 'col2': 'favourite',
      'col-1688-performance': 'performance', 'col-1688-dresses': 'dress',
      'col-1688-tops': 'shirt', 'col-1688-bottoms': 'trousers',
      'col-1688-accessories': 'accessories',
    };
    if (Object.hasOwn(known, collection.id)) return known[collection.id];
    const title = String(collection.title || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
    if (/moi ve|new arrivals/.test(title)) return 'new';
    if (/yeu thich|favourites|favorites/.test(title)) return 'favourite';
    if (/bieu dien|performance|dance/.test(title)) return 'performance';
    if (/do doi|matching|family/.test(title)) return 'matching';
    if (/di hoc|school/.test(title)) return 'backpack';
    if (/phu kien|accessor/.test(title)) return 'accessories';
    if (/vay|dam|dress/.test(title)) return 'dress';
    if (/quan|legging|short|bottom/.test(title)) return 'trousers';
    if (/ao|shirt|tops|uniform/.test(title)) return 'shirt';
    return 'grid';
  }

  function catalogFilterButton(collection) {
    const id = collection?.id || '';
    const selected = id === activeCollectionId;
    const title = collection ? publicCollectionTitle(collection.title) : 'Tất cả';
    const icon = collection ? collectionIconSymbol(collection) : 'grid';
    const count = collection ? `<span class="catalog-filter-count">${(collection.productIds || []).length}</span>` : '';
    return `<button class="catalog-filter${selected ? ' is-active' : ''}" type="button" data-collection="${commerce.escape(id)}" aria-pressed="${selected}"><svg class="sally-illustration catalog-filter-icon" viewBox="0 0 96 96" aria-hidden="true" focusable="false"><use href="#sally-icon-${icon}" /></svg><span>${commerce.escape(title)}</span>${count}</button>`;
  }

  const syncScrolledState = () => body.classList.toggle('has-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', syncScrolledState, { passive: true });
  syncScrolledState();

  // The admin theme editor sends a small, plain-data preview payload. Keep the
  // storefront renderer deliberately conservative: only known fields and hex
  // colours are applied, and all copy goes through textContent.
  const themeImages = {
    cozy: { desktop: 'assets/sally-kids-hero-1983.avif', desktopWebp: 'assets/sally-kids-hero-1983.webp', mobile: 'assets/sally-kids-hero-1600.webp', mobileAvif: 'assets/sally-kids-hero-1600.avif' },
    crocband: { desktop: 'assets/sally-kids-play-1200.avif', desktopWebp: 'assets/sally-kids-play-1200.webp', mobile: 'assets/sally-kids-play-720.webp', mobileAvif: 'assets/sally-kids-play-720.avif' },
    ninjago: { desktop: 'assets/sally-kids-school-1200.avif', desktopWebp: 'assets/sally-kids-school-1200.webp', mobile: 'assets/sally-kids-school-720.webp', mobileAvif: 'assets/sally-kids-school-720.avif' },
  };
  const legacyBrandWords = /crocs|jibbitz|heydude|clog|crocband|unfurgettable|mckenna grace/i;
  const safeThemeText = (value, fallback = '') => typeof value === 'string' && !legacyBrandWords.test(value) ? value.trim().slice(0, 180) : fallback;
  const safeThemeHex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : null;
  const applyTheme = (theme) => {
    if (!theme || typeof theme !== 'object') return;
    const themeText = `${theme.heroTitle || ''} ${theme.heroSubtitle || ''} ${theme.announcement || ''}`;
    if (legacyBrandWords.test(themeText)) return;
    const accent = safeThemeHex(theme.accent);
    const background = safeThemeHex(theme.background);
    if (accent) document.documentElement.style.setProperty('--green', accent);
    if (background) document.documentElement.style.setProperty('--lilac', background);
    const hero = document.querySelector('.hero-card--main');
    const heroTitle = document.querySelector('.hero-content h1');
    const heroSubtitle = document.querySelector('.hero-content .hero-subtitle');
    const heroButton = document.querySelector('.hero-content .button');
    const announcement = document.querySelector('.promo-bar p');
    if (heroTitle) heroTitle.textContent = safeThemeText(theme.heroTitle, heroTitle.textContent);
    if (heroSubtitle) heroSubtitle.textContent = safeThemeText(theme.heroSubtitle, heroSubtitle.textContent);
    if (heroButton) heroButton.textContent = safeThemeText(theme.heroButton, heroButton.textContent);
    if (announcement && typeof theme.announcement === 'string') announcement.textContent = safeThemeText(theme.announcement, announcement.textContent);
    const image = themeImages[theme.campaign] || themeImages.cozy;
    const sources = hero?.querySelectorAll('source') || [];
    const heroImage = hero?.querySelector('img');
    if (sources[0]) sources[0].srcset = image.desktop;
    if (sources[1]) sources[1].srcset = image.desktopWebp || image.desktop;
    if (sources[2]) sources[2].srcset = image.mobileAvif || image.mobile;
    if (sources[3]) sources[3].srcset = image.mobile;
    if (heroImage) { heroImage.src = image.mobile; heroImage.alt = safeThemeText(theme.heroTitle, heroImage.alt); }
    [['.classics', theme.showClassics], ['.arrivals', theme.showArrivals], ['.collabs', theme.showCollabs], ['.club', theme.showClub]].forEach(([selector, visible]) => {
      const section = document.querySelector(selector);
      if (section && typeof visible === 'boolean') section.hidden = !visible;
    });
  };
  const loadPublishedTheme = () => {
    try {
      const raw = window.localStorage?.getItem('crocs-studio-v1');
      const parsed = raw ? JSON.parse(raw) : null;
      applyTheme(parsed?.theme?.published);
    } catch { /* Keep the seeded storefront when local storage is unavailable. */ }
  };
  window.addEventListener('message', event => {
    if (event.data?.type === 'crocs:theme-preview') applyTheme(event.data.theme);
  });
  window.addEventListener('storage', event => {
    if (event.key === 'crocs-studio-v1') loadPublishedTheme();
  });
  window.addEventListener('crocs:remote-theme', event => { applyTheme(event.detail?.theme); window.CrocsRegional?.translateStatic?.(); });
  loadPublishedTheme();

  const announce = (message) => { if (liveRegion) liveRegion.textContent = message; };
  const showToast = (message) => {
    if (!toast) return;
    toast.textContent = message;
    toast.classList.add('is-visible');
    announce(message);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('is-visible'), 2600);
  };

  const openDrawer = (drawer, opener) => {
    if (!drawer) return;
    closeSearch();
    lastOpener = opener || document.activeElement;
    [menuButton, cartButton, accountButton].forEach((button) => button?.setAttribute('aria-expanded', 'false'));
    [menuDrawer, cartDrawer, accountDrawer].forEach((item) => {
      if (item && item !== drawer) { item.classList.remove('is-open'); item.setAttribute('aria-hidden', 'true'); }
    });
    drawer.classList.add('is-open');
    drawer.setAttribute('aria-hidden', 'false');
    backdrop.hidden = false;
    body.classList.add('drawer-open');
    if (opener) opener.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => drawer.querySelector('button, a, input')?.focus());
  };
  const closeDrawers = () => {
    const hadOpenDrawer = [menuDrawer, cartDrawer, accountDrawer].some((drawer) => drawer?.classList.contains('is-open'));
    [menuDrawer, cartDrawer, accountDrawer].forEach((drawer) => {
      if (!drawer) return;
      drawer.classList.remove('is-open');
      drawer.setAttribute('aria-hidden', 'true');
    });
    menuButton?.setAttribute('aria-expanded', 'false');
    menuButton?.setAttribute('aria-label', 'Open menu');
    cartButton?.setAttribute('aria-expanded', 'false');
    accountButton?.setAttribute('aria-expanded', 'false');
    backdrop.hidden = true;
    body.classList.remove('drawer-open');
    const opener = lastOpener;
    lastOpener = null;
    if (hadOpenDrawer && opener instanceof HTMLElement) opener.focus();
  };

  menuButton?.addEventListener('click', () => {
    if (menuDrawer.classList.contains('is-open')) closeDrawers();
    else { openDrawer(menuDrawer, menuButton); menuButton.setAttribute('aria-label', 'Close menu'); }
  });
  cartButton?.addEventListener('click', () => {
    if (cartDrawer.classList.contains('is-open')) closeDrawers();
    else openDrawer(cartDrawer, cartButton);
  });
  accountButton?.addEventListener('click', () => {
    if (accountDrawer.classList.contains('is-open')) closeDrawers();
    else openDrawer(accountDrawer, accountButton);
  });
  document.querySelectorAll('[data-close-drawer], #drawerBackdrop').forEach((el) => el.addEventListener('click', closeDrawers));
  document.querySelectorAll('.drawer-nav a, .drawer-links a').forEach((link) => link.addEventListener('click', closeDrawers));
  menuDrawer?.addEventListener('click', event => { if (event.target.closest('a')) closeDrawers(); });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeDrawers(); closeSearch(); }
  });

  const safeMenuHref = value => /^(#[a-zA-Z][\w-]*|https?:\/\/[^\s]+|(?:index|shop)\.html(?:[?#][^\s]*)?)$/.test(String(value || '')) ? String(value) : 'shop.html';
  function renderNavigation(menus) {
    const list = Array.isArray(menus) ? menus : [];
    const mainMenu = list.find(menu => menu.id === 'main') || list[0];
    if (mainMenu?.items?.length) {
      const canonicalMenu = [
        { label: 'Mới về', url: 'shop.html?sort=newest' },
        { label: 'Bé gái', url: 'shop.html?collection=col-1688-dresses' },
        { label: 'Bé trai', url: 'shop.html?collection=col-1688-tops' },
        { label: 'Đồ đôi', url: 'shop.html' },
        { label: 'Đi học', url: 'shop.html?collection=col-1688-tops' },
        { label: 'Phụ kiện', url: 'shop.html?collection=col-1688-accessories' },
        { label: 'Shop', url: 'shop.html' },
      ];
      const legacyMenu = mainMenu.items.some(item => /crocs|jibbitz|heydude|women|men|classic|sale|1688|new arrivals|cozy favourites|xem toàn bộ catalog/i.test(String(item.label || '')));
      const items = legacyMenu ? canonicalMenu : mainMenu.items;
      const desktop = document.querySelector('.desktop-nav');
      const drawer = document.querySelector('.drawer-nav');
      if (desktop) {
        desktop.dataset.dynamicMenu = 'true';
        desktop.innerHTML = items.map((item, index) => `<a${index === 0 ? ' class="sale-link"' : ''} href="${commerce.escape(safeMenuHref(item.url))}">${commerce.escape(item.label)}</a>`).join('');
      }
      if (drawer) {
        drawer.dataset.dynamicMenu = 'true';
        drawer.innerHTML = items.map(item => `<a href="${commerce.escape(safeMenuHref(item.url))}">${commerce.escape(item.label)} <span>›</span></a>`).join('');
      }
    }
    const footerMenu = list.find(menu => menu.id === 'footer');
    const legal = document.querySelector('.footer-bottom .legal');
    if (footerMenu?.items?.length && legal) legal.innerHTML = `${footerMenu.items.map(item => `<a href="${commerce.escape(safeMenuHref(item.url))}">${commerce.escape(item.label)}</a>`).join('')}<span>© 2026 ${commerce.escape(document.querySelector('.brand')?.textContent?.trim() || 'Store')}</span>`;
  }

  const openSearch = () => {
    closeDrawers();
    searchPanel.hidden = false;
    searchTrigger?.setAttribute('aria-expanded', 'true');
    requestAnimationFrame(() => searchInput?.focus());
  };
  function closeSearch() {
    if (!searchPanel) return;
    searchPanel.hidden = true;
    searchTrigger?.setAttribute('aria-expanded', 'false');
  }
  searchTrigger?.addEventListener('click', () => (searchPanel.hidden ? openSearch() : closeSearch()));
  searchClose?.addEventListener('click', closeSearch);
  searchForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const term = searchInput.value.trim();
    if (term) window.location.href = `shop.html?query=${encodeURIComponent(term)}`;
    else window.location.href = 'shop.html';
  });

  const cardThemes = ['cream', 'blue', 'pink', 'yellow', 'mint', 'sand', 'lavender'];
  const renderLiveCatalog = (products) => {
    if (!arrivalRail || !Array.isArray(products) || !products.length || !commerce) return;
    arrivalRail.innerHTML = products.filter(product => product.status === 'Active').slice(0, 8).map((product, index) => {
      const variants = commerce.variantsFor(product);
      const requiresOptions = product.hasVariants === true || variants.length > 0;
      const label = requiresOptions ? t('chooseOptions', 'Choose options') : t('addToBag', 'Add to bag');
      const price = variants.length ? commerce.money(Math.min(...variants.map(item => item.price))) : commerce.money(product.price);
      const action = requiresOptions ? ` data-requires-options="true"` : '';
      return `<article class="product-card" data-product-id="${commerce.escape(product.id)}"><button class="wishlist" type="button" aria-label="Save ${commerce.escape(product.title)}">♡</button><a href="product.html?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || product.id)}"><div class="product-image product-image--${cardThemes[index % cardThemes.length]}"><img data-smart-fit src="${commerce.escape(commerce.image(product.image))}" alt="${commerce.escape(product.imageAlt || product.title)}" loading="lazy" decoding="async" width="520" height="693" /></div><h3>${commerce.escape(product.title)}</h3><p class="price">${price}</p></a><button class="add-button" type="button" data-product-id="${commerce.escape(product.id)}" data-product="${commerce.escape(product.title)}" data-price="${(product.price / 100).toFixed(2)}"${action}>${label}</button></article>`;
    }).join('');
    commerce.enhanceImages?.(arrivalRail);
  };

  function catalogCard(product, index) {
    const url = `product.html?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || product.id)}`;
    const optionLabel = product.hasVariants ? 'Xem các lựa chọn' : 'Xem sản phẩm';
    return `<article class="product-card" data-product-id="${commerce.escape(product.id)}"><a href="${url}"><div class="product-image product-image--${cardThemes[index % cardThemes.length]}"><img data-smart-fit src="${commerce.escape(commerce.image(product.image))}" alt="${commerce.escape(product.imageAlt || product.title)}" loading="lazy" decoding="async" width="520" height="693"></div><h3>${commerce.escape(product.title)}</h3><p class="price">${commerce.money(product.price)}</p></a><a class="add-button" href="${url}">${optionLabel}</a></article>`;
  }

  function collectionFromHash() {
    const value = decodeURIComponent(window.location.hash || '');
    return value.startsWith('#collection-') ? value.slice('#collection-'.length) : '';
  }

  function renderCatalogBrowser(products = commerce?.products || []) {
    if (!catalogGrid || !catalogFilters || !catalogCount || !catalogTitle || !commerce) return;
    const active = (Array.isArray(products) ? products : []).filter(product => product.status === 'Active');
    const requested = collectionFromHash();
    if (requested && publicCollections.some(collection => collection.id === requested)) activeCollectionId = requested;
    else if (requested) activeCollectionId = '';
    const collection = publicCollections.find(item => item.id === activeCollectionId);
    const ids = collection ? new Set(collection.productIds || []) : null;
    const filtered = ids ? active.filter(product => ids.has(product.id)) : active;
    catalogTitle.textContent = collection?.title || 'Tất cả sản phẩm';
    catalogCount.textContent = `${filtered.length.toLocaleString('vi-VN')} sản phẩm đang bán`;
    const visibleCollections = publicCollections.filter(item => !/tất cả sản phẩm\s*1688/i.test(String(item.title || '')));
    catalogFilters.innerHTML = [catalogFilterButton(null), ...visibleCollections.map(catalogFilterButton)].join('');
    const shown = filtered.slice(0, visibleCatalogProducts);
    catalogGrid.innerHTML = shown.length ? shown.map(catalogCard).join('') : '<p class="catalog-empty">Bộ sưu tập này chưa có sản phẩm đang bán.</p>';
    catalogLoadMore.hidden = shown.length >= filtered.length;
    commerce.enhanceImages?.(catalogGrid);
  }

  catalogFilters?.addEventListener('click', event => {
    const button = event.target.closest('[data-collection]');
    if (!button) return;
    activeCollectionId = button.dataset.collection || '';
    visibleCatalogProducts = 24;
    window.location.hash = activeCollectionId ? `collection-${activeCollectionId}` : 'catalog';
    renderCatalogBrowser();
  });
  catalogLoadMore?.addEventListener('click', () => { visibleCatalogProducts += 24; renderCatalogBrowser(); });
  window.addEventListener('hashchange', () => {
    if ((window.location.hash || '').startsWith('#collection-') || window.location.hash === '#catalog') {
      if (window.location.hash === '#catalog') activeCollectionId = '';
      visibleCatalogProducts = 24;
      renderCatalogBrowser();
      document.querySelector('#catalog')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  });

  const hydrateCommerceCart = () => {
    if (!commerce) return;
    const lines = commerce.readCart();
    cart = lines.map(line => {
      const product = commerce.product(line.productId);
      const card = document.querySelector(`[data-product-id="${CSS.escape(line.productId)}"]`);
      const variant = product?.variants?.find(item => item.id === line.variantId);
      return {
        productId: line.productId,
        variantId: line.variantId || '',
        size: line.size,
        quantity: line.quantity,
        name: product ? `${product.title}${variant ? ` — ${commerce.variantTitle(product, variant)}` : ''}` : card?.querySelector('h3')?.textContent || 'Sally Kids product',
        price: variant?.price || product?.price || Math.round(Number(card?.querySelector('.add-button')?.dataset.price || 0) * 100),
        image: product?.image || card?.querySelector('img')?.getAttribute('src') || 'assets/sally-kids-product-placeholder.svg'
      };
    });
  };

  const updateCart = () => {
    if (commerce) hydrateCommerceCart();
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
    cartCount.textContent = String(count);
    cartCount.classList.toggle('is-visible', count > 0);
    cartButton?.setAttribute('aria-label', `${t('bag', 'Shopping bag')}, ${count} ${t('quantity', 'item')}${count === 1 ? '' : 's'}`);
    cartEmpty.hidden = count > 0;
    cartItems.hidden = count === 0;
    cartSummary.hidden = count === 0;
    cartSubtotal.textContent = commerce?.money ? commerce.money(subtotal) : `£${(subtotal / 100).toFixed(2)}`;
    if (!count) { cartItems.innerHTML = ''; return; }
    cartItems.innerHTML = cart.map((item, index) => `
      <div class="cart-item"><div class="cart-item-image"><img src="${commerce?.escape?.(item.image) || item.image}" alt="${commerce?.escape?.(item.name) || item.name}" /></div>
       <div><h3>${commerce?.escape?.(item.name) || item.name}</h3><p>${t('selectSize', 'Size')} ${commerce?.escape?.(item.size) || item.size} · ${t('quantity', 'Quantity')} ${item.quantity}</p></div>
       <div><strong>${commerce?.money ? commerce.money(item.price * item.quantity) : `£${(item.price * item.quantity / 100).toFixed(2)}`}</strong><button class="remove-item" type="button" data-index="${index}" aria-label="${t('remove', 'Remove')} ${commerce?.escape?.(item.name) || item.name}">×</button></div></div>`).join('');
    cartItems.querySelectorAll('.remove-item').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.index); const removed = cart[index];
      if (commerce && removed?.productId) commerce.update(removed.productId, removed.size, 0, removed.variantId);
      else cart.splice(index, 1);
       updateCart(); showToast(`${removed.name} ${t('removedFromBag', 'removed from your bag')}`);
    }));
  };

  arrivalRail?.addEventListener('click', (event) => {
    const button = event.target.closest('.add-button');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    if (commerce) {
      const productId = button.dataset.productId;
      const product = commerce.product(productId);
       if (!product) { showToast(t('notAvailable', 'This pair is not available in the live catalogue yet.')); return; }
      if (button.dataset.requiresOptions === 'true') { window.location.href = `product.html?id=${encodeURIComponent(product.id)}&slug=${encodeURIComponent(product.slug || product.id)}`; return; }
      try {
        const firstVariant = commerce.variantsFor(product)[0];
        commerce.add(productId, firstVariant ? { variantId: firstVariant.id, size: commerce.variantSize(product, firstVariant) } : commerce.sizesFor(product)[0], 1);
         updateCart(); showToast(`${product.title} ${t('addedToBag', 'added to your bag')}`);
      } catch (error) { showToast(error.message); }
      return;
    }
    const name = button.dataset.product || 'Sally Kids product';
    const price = Math.round(Number(button.dataset.price || 0) * 100);
    const image = button.closest('.product-card')?.querySelector('img')?.src || '';
    const existing = cart.find((item) => item.name === name);
    if (existing) existing.quantity += 1; else cart.push({ name, price, image, quantity: 1 });
     updateCart(); showToast(`${name} ${t('addedToBag', 'added to your bag')}`);
  });
  arrivalRail?.addEventListener('click', (event) => {
    const button = event.target.closest('.wishlist');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    const saved = button.classList.toggle('is-saved'); button.textContent = saved ? '♥' : '♡';
    button.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${button.closest('.product-card')?.querySelector('h3')?.textContent || 'product'}`);
    showToast(saved ? 'Saved to your favourites' : 'Removed from your favourites');
  });

  document.querySelectorAll('.rail-arrow').forEach((arrow) => arrow.addEventListener('click', () => {
    const rail = arrow.closest('.section')?.querySelector('[data-rail]'); if (!rail) return;
    const amount = Math.min(520, rail.clientWidth * .78);
    rail.scrollBy({ left: arrow.dataset.direction === 'next' ? amount : -amount, behavior: 'smooth' });
  }));
  document.querySelectorAll('.tab').forEach((tab) => tab.addEventListener('click', () => {
    const name = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach((item) => { const active = item === tab; item.classList.toggle('is-active', active); item.setAttribute('aria-selected', String(active)); });
    document.querySelectorAll('.tab-panel').forEach((panel) => panel.classList.toggle('is-active', panel.dataset.panel === name));
  }));
  document.querySelector('#clubForm')?.addEventListener('submit', (event) => {
    event.preventDefault(); const input = document.querySelector('#clubEmail');
    if (!input.checkValidity()) { input.reportValidity(); return; }
    showToast('Demo only: email checked locally. No subscription was sent.'); event.currentTarget.reset();
  });
  document.querySelector('#footerAccount')?.addEventListener('click', (event) => openDrawer(accountDrawer, event.currentTarget));
  document.querySelector('#accountForm')?.addEventListener('submit', (event) => {
    event.preventDefault();
    showToast('Demo only: sign-in is not connected.');
  });
  checkoutButton?.addEventListener('click', () => {
    if (commerce) window.location.href = 'checkout.html';
    else showToast('Demo only: checkout is not connected.');
  });
  window.addEventListener('crocs:bag', updateCart);
  window.addEventListener('crocs:catalog', event => { publicCollections = Array.isArray(event.detail?.collections) ? event.detail.collections.filter(item => item.status === 'Active') : []; renderNavigation(event.detail?.menus); renderLiveCatalog(event.detail?.products); renderCatalogBrowser(event.detail?.products); updateCart(); });
  window.addEventListener('crocs:region-change', () => { renderLiveCatalog(commerce?.products); renderCatalogBrowser(commerce?.products); updateCart(); });
   window.addEventListener('crocs:language-change', () => { renderLiveCatalog(commerce?.products); renderCatalogBrowser(commerce?.products); updateCart(); window.CrocsRegional?.translateStatic?.(); });
  commerce?.ready?.then(async () => { await commerce.ensureCartProducts().catch(() => {}); renderLiveCatalog(commerce.products); renderCatalogBrowser(commerce.products); updateCart(); window.CrocsRegional?.translateStatic?.(); }).catch(() => { updateCart(); window.CrocsRegional?.translateStatic?.(); });
  updateCart();
})();
