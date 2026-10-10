(function (root) {
  'use strict';

  const commerce = root.CrocsCommerce;
  const regional = root.CrocsRegional;
  const toastTimers = new WeakMap();

  function toast(message) {
    const element = document.querySelector('#commerceToast');
    if (!element) return;
    element.textContent = message;
    element.classList.add('is-visible');
    window.clearTimeout(toastTimers.get(element));
    const timer = window.setTimeout(() => element.classList.remove('is-visible'), 2800);
    toastTimers.set(element, timer);
  }

  function bagCount() {
    return (commerce?.readCart?.() || []).reduce((sum, line) => sum + Number(line.quantity || 0), 0);
  }

  function updateBagCount() {
    const count = bagCount();
    document.querySelectorAll('[data-bag-count]').forEach((element) => {
      element.textContent = String(count);
      element.hidden = count < 1;
    });
    document.querySelectorAll('[data-bag-label]').forEach((element) => {
      element.textContent = count ? `${regional?.t?.('bag', 'Bag') || 'Bag'} (${count})` : (regional?.t?.('bag', 'Bag') || 'Bag');
    });
  }

  function bottomNavMarkup(t) {
    return `
      <nav class="mobile-bottom-nav" data-mobile-bottom-nav aria-label="Mobile store navigation">
        <a class="mobile-bottom-nav__item" data-nav-key="home" href="index.html" aria-label="${t('home', 'Home')}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1Z"/></svg><span>${t('home', 'Home')}</span>
        </a>
        <a class="mobile-bottom-nav__item" data-nav-key="shop" href="index.html#catalog" aria-label="${t('shop', 'Shop')}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 9h16l-1 11H5L4 9Z"/><path d="M8 9a4 4 0 0 1 8 0M9 13h.01M15 13h.01"/></svg><span>${t('shop', 'Shop')}</span>
        </a>
        <button class="mobile-bottom-nav__item" type="button" data-mobile-nav-action="search" aria-label="${t('search', 'Search')}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><circle cx="10.8" cy="10.8" r="6.8"/><path d="m16 16 5 5"/></svg><span>${t('search', 'Search')}</span>
        </button>
        <a class="mobile-bottom-nav__item" data-nav-key="bag" href="checkout.html" aria-label="${t('bag', 'Bag')}">
          <span class="mobile-bottom-nav__icon"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="M5 8h14l-1 13H6L5 8Z"/><path d="M9 8V6a3 3 0 0 1 6 0v2"/></svg><b class="mobile-bottom-nav__badge" data-bag-count hidden>0</b></span><span data-bag-label>${t('bag', 'Bag')}</span>
        </a>
        <button class="mobile-bottom-nav__item" type="button" data-mobile-nav-action="menu" aria-label="${t('menu', 'Menu')}">
          <svg aria-hidden="true" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16"/></svg><span>${t('menu', 'Menu')}</span>
        </button>
      </nav>`;
  }

  function activeBottomNavKey() {
    const path = String(root.location.pathname || '').toLowerCase();
    const hash = String(root.location.hash || '').toLowerCase();
    if (path.endsWith('/checkout.html') || path.endsWith('checkout.html')) return '';
    if (path.endsWith('/product.html') || path.endsWith('product.html') || hash === '#catalog' || hash === '#new-arrivals' || hash === '#shop') return 'shop';
    return 'home';
  }

  function syncBottomNav() {
    const nav = document.querySelector('[data-mobile-bottom-nav]');
    if (!nav) return;
    const active = activeBottomNavKey();
    nav.querySelectorAll('[data-nav-key]').forEach(item => {
      const isActive = item.dataset.navKey === active;
      item.classList.toggle('is-active', isActive);
      if (isActive) item.setAttribute('aria-current', 'page'); else item.removeAttribute('aria-current');
    });
  }

  function syncBottomNavLabels(nav, t) {
    if (!nav) return;
    const labels = {
      home: t('home', 'Home'),
      shop: t('shop', 'Shop'),
      search: t('search', 'Search'),
      bag: t('bag', 'Bag'),
      menu: t('menu', 'Menu'),
    };
    nav.querySelector('[data-nav-key="home"] > span')?.replaceChildren(document.createTextNode(labels.home));
    nav.querySelector('[data-nav-key="shop"] > span')?.replaceChildren(document.createTextNode(labels.shop));
    nav.querySelector('[data-mobile-nav-action="search"] > span')?.replaceChildren(document.createTextNode(labels.search));
    nav.querySelector('[data-bag-label]')?.replaceChildren(document.createTextNode(labels.bag));
    nav.querySelector('[data-mobile-nav-action="menu"] > span')?.replaceChildren(document.createTextNode(labels.menu));
    nav.querySelector('[data-nav-key="home"]')?.setAttribute('aria-label', labels.home);
    nav.querySelector('[data-nav-key="shop"]')?.setAttribute('aria-label', labels.shop);
    nav.querySelector('[data-mobile-nav-action="search"]')?.setAttribute('aria-label', labels.search);
    nav.querySelector('[data-nav-key="bag"]')?.setAttribute('aria-label', labels.bag);
    nav.querySelector('[data-mobile-nav-action="menu"]')?.setAttribute('aria-label', labels.menu);
  }

  function mountBottomNav() {
    if (!document.body || document.body.classList.contains('checkout-page')) return;
    let nav = document.querySelector('[data-mobile-bottom-nav]');
    if (!nav) {
      document.body.insertAdjacentHTML('beforeend', bottomNavMarkup((key, fallback) => commerce?.t?.(key, fallback) || fallback));
      nav = document.querySelector('[data-mobile-bottom-nav]');
    }
    if (!nav) return;
    document.body.classList.add('has-mobile-bottom-nav');
    syncBottomNavLabels(nav, (key, fallback) => commerce?.t?.(key, fallback) || fallback);
    nav.querySelectorAll('[data-mobile-nav-action]').forEach(button => {
      button.onclick = () => {
        const action = button.dataset.mobileNavAction;
        if (action === 'search') {
          const trigger = document.querySelector('#searchTrigger');
          if (trigger) trigger.click(); else root.location.href = 'index.html#catalog';
        }
        if (action === 'menu') {
          const trigger = document.querySelector('#menuButton');
          if (trigger) trigger.click(); else root.location.href = 'index.html#catalog';
        }
      };
    });
    syncBottomNav();
  }

  function mountHeader() {
    document.querySelectorAll('[data-store-header]').forEach((mount) => {
      const t = (key, fallback) => commerce?.t?.(key, fallback) || fallback;
      mount.innerHTML = `
        <header class="commerce-header">
          <a class="commerce-logo" href="index.html" aria-label="Crocs Studio home">
            <img src="assets/crocs-logo.svg" alt="Crocs" width="137" height="30">
          </a>
          <nav class="commerce-nav" aria-label="Store navigation">
            <a href="index.html#new-arrivals">${t('newArrivals', 'New arrivals')}</a>
            <a href="index.html#shop">${t('shopClassics', 'Classics')}</a>
            <a href="index.html#club">Crocs Club</a>
          </nav>
          <div class="commerce-header-actions">
            <a class="commerce-back" href="index.html" aria-label="Back to shop">${t('continueShopping', 'Back to shop')}</a>
            <a class="commerce-bag" href="checkout.html" aria-label="Open shopping bag">
              <span data-bag-label>${t('bag', 'Bag')}</span><span class="commerce-bag-count" data-bag-count hidden>0</span>
            </a>
          </div>
        </header>`;
      regional?.mountPickers?.();
    });
  }

  function mountFooter() {
    document.querySelectorAll('[data-store-footer]').forEach((mount) => {
      mount.innerHTML = `
        <footer class="commerce-footer">
          <div><img src="assets/crocs-logo.svg" alt="Crocs" width="110" height="24"><p>Come as you are. Comfort for every version of you.</p></div>
          <div class="commerce-footer-links"><a href="index.html#footer">${commerce.t('help', 'Help & FAQs')}</a><a href="index.html#footer">${commerce.t('privacy', 'Privacy')}</a><a href="index.html#footer">${commerce.escape(regional?.region?.name || 'United States')}</a></div>
        </footer>`;
    });
  }

  const api = { toast, updateBagCount, mountHeader, mountFooter, mountBottomNav, syncBottomNav };
  root.CrocsCommerceUI = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mountHeader(); mountFooter(); mountBottomNav(); updateBagCount(); }, { once: true });
  else { mountHeader(); mountFooter(); mountBottomNav(); updateBagCount(); }
  root.addEventListener('crocs:bag', updateBagCount);
  root.addEventListener('hashchange', syncBottomNav);
  root.addEventListener('crocs:region-change', () => { mountHeader(); mountFooter(); mountBottomNav(); updateBagCount(); });
  root.addEventListener('crocs:language-change', () => { mountHeader(); mountFooter(); mountBottomNav(); updateBagCount(); });
  root.addEventListener('crocs:localization-ready', () => { mountHeader(); mountFooter(); mountBottomNav(); updateBagCount(); });
})(window);
