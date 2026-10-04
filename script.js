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
  const commerce = window.CrocsCommerce;
  let cart = [];
  let toastTimer;
  let lastOpener = null;

  const syncScrolledState = () => body.classList.toggle('has-scrolled', window.scrollY > 8);
  window.addEventListener('scroll', syncScrolledState, { passive: true });
  syncScrolledState();

  // The admin theme editor sends a small, plain-data preview payload. Keep the
  // storefront renderer deliberately conservative: only known fields and hex
  // colours are applied, and all copy goes through textContent.
  const themeImages = {
    cozy: { desktop: 'assets/crocs-hero-desktop.jpg', mobile: 'assets/eba3407d4d927c9b.png' },
    crocband: { desktop: 'assets/abed2e8b5d4c3b0d.png', mobile: 'assets/abed2e8b5d4c3b0d.png' },
    ninjago: { desktop: 'assets/12875aebbb61f08d.png', mobile: 'assets/12875aebbb61f08d.png' },
  };
  const safeThemeText = (value, fallback = '') => typeof value === 'string' ? value.trim().slice(0, 180) : fallback;
  const safeThemeHex = value => typeof value === 'string' && /^#[\da-f]{6}$/i.test(value) ? value : null;
  const applyTheme = (theme) => {
    if (!theme || typeof theme !== 'object') return;
    const accent = safeThemeHex(theme.accent);
    const background = safeThemeHex(theme.background);
    if (accent) document.documentElement.style.setProperty('--green', accent);
    if (background) document.documentElement.style.setProperty('--lilac', background);
    const hero = document.querySelector('.hero-card--main');
    const heroTitle = document.querySelector('.hero-content h1');
    const heroSubtitle = document.querySelector('.hero-content p');
    const heroButton = document.querySelector('.hero-content .button');
    const announcement = document.querySelector('.promo-bar p');
    if (heroTitle) heroTitle.textContent = safeThemeText(theme.heroTitle, heroTitle.textContent);
    if (heroSubtitle) heroSubtitle.textContent = safeThemeText(theme.heroSubtitle, heroSubtitle.textContent);
    if (heroButton) heroButton.textContent = safeThemeText(theme.heroButton, heroButton.textContent);
    if (announcement && typeof theme.announcement === 'string') announcement.textContent = safeThemeText(theme.announcement, announcement.textContent);
    const image = themeImages[theme.campaign] || themeImages.cozy;
    const source = hero?.querySelector('source');
    const heroImage = hero?.querySelector('img');
    if (source) source.srcset = image.desktop;
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
  window.addEventListener('crocs:remote-theme', event => applyTheme(event.detail?.theme));
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
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') { closeDrawers(); closeSearch(); }
  });

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
    showToast(term ? `Showing results for “${term}”` : 'Try searching for a clog, charm or slipper');
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
        name: product ? `${product.title}${variant ? ` — ${commerce.variantTitle(product, variant)}` : ''}` : card?.querySelector('h3')?.textContent || 'Crocs product',
        price: variant?.price || product?.price || Math.round(Number(card?.querySelector('.add-button')?.dataset.price || 0) * 100),
        image: product?.image || card?.querySelector('img')?.getAttribute('src') || 'assets/arrival-classic-clog-100.png'
      };
    });
  };

  const updateCart = () => {
    if (commerce) hydrateCommerceCart();
    const count = cart.reduce((total, item) => total + item.quantity, 0);
    const subtotal = cart.reduce((total, item) => total + item.price * item.quantity, 0);
    cartCount.textContent = String(count);
    cartCount.classList.toggle('is-visible', count > 0);
    cartButton?.setAttribute('aria-label', `Shopping bag, ${count} item${count === 1 ? '' : 's'}`);
    cartEmpty.hidden = count > 0;
    cartItems.hidden = count === 0;
    cartSummary.hidden = count === 0;
    cartSubtotal.textContent = commerce?.money ? commerce.money(subtotal) : `£${(subtotal / 100).toFixed(2)}`;
    if (!count) { cartItems.innerHTML = ''; return; }
    cartItems.innerHTML = cart.map((item, index) => `
      <div class="cart-item"><div class="cart-item-image"><img src="${commerce?.escape?.(item.image) || item.image}" alt="${commerce?.escape?.(item.name) || item.name}" /></div>
      <div><h3>${commerce?.escape?.(item.name) || item.name}</h3><p>Size ${commerce?.escape?.(item.size) || item.size} · Quantity ${item.quantity}</p></div>
      <div><strong>£${(item.price * item.quantity / 100).toFixed(2)}</strong><button class="remove-item" type="button" data-index="${index}" aria-label="Remove ${commerce?.escape?.(item.name) || item.name}">×</button></div></div>`).join('');
    cartItems.querySelectorAll('.remove-item').forEach((button) => button.addEventListener('click', () => {
      const index = Number(button.dataset.index); const removed = cart[index];
      if (commerce && removed?.productId) commerce.update(removed.productId, removed.size, 0, removed.variantId);
      else cart.splice(index, 1);
      updateCart(); showToast(`${removed.name} removed from your bag`);
    }));
  };

  document.querySelectorAll('.add-button').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation();
    if (commerce) {
      const productId = button.dataset.productId;
      const product = commerce.product(productId);
      if (!product) { showToast('This pair is not available in the live catalogue yet.'); return; }
      try {
        const firstVariant = commerce.variantsFor(product)[0];
        commerce.add(productId, firstVariant ? { variantId: firstVariant.id, size: commerce.variantSize(product, firstVariant) } : commerce.sizesFor(product)[0], 1);
        updateCart(); showToast(`${product.title} added to your bag`);
      } catch (error) { showToast(error.message); }
      return;
    }
    const name = button.dataset.product || 'Classic Clog';
    const price = Math.round(Number(button.dataset.price || 0) * 100);
    const image = button.closest('.product-card')?.querySelector('img')?.src || '';
    const existing = cart.find((item) => item.name === name);
    if (existing) existing.quantity += 1; else cart.push({ name, price, image, quantity: 1 });
    updateCart(); showToast(`${name} added to your bag`);
  }));
  document.querySelectorAll('.wishlist').forEach((button) => button.addEventListener('click', (event) => {
    event.preventDefault(); event.stopPropagation();
    const saved = button.classList.toggle('is-saved'); button.textContent = saved ? '♥' : '♡';
    button.setAttribute('aria-label', `${saved ? 'Remove' : 'Save'} ${button.closest('.product-card')?.querySelector('h3')?.textContent || 'product'}`);
    showToast(saved ? 'Saved to your favourites' : 'Removed from your favourites');
  }));

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
  window.addEventListener('crocs:catalog', updateCart);
  commerce?.ready?.then(updateCart).catch(() => updateCart());
  updateCart();
})();
