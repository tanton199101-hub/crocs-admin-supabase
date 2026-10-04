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
          <div class="commerce-footer-links"><a href="index.html#footer">${commerce.t('help', 'Help & FAQs')}</a><a href="index.html#footer">${commerce.t('privacy', 'Privacy')}</a><a href="index.html#footer">${commerce.escape(regional?.region?.name || 'United Kingdom')}</a></div>
        </footer>`;
    });
  }

  const api = { toast, updateBagCount, mountHeader, mountFooter };
  root.CrocsCommerceUI = api;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => { mountHeader(); mountFooter(); updateBagCount(); }, { once: true });
  else { mountHeader(); mountFooter(); updateBagCount(); }
  root.addEventListener('crocs:bag', updateBagCount);
  root.addEventListener('crocs:region-change', () => { mountHeader(); mountFooter(); updateBagCount(); });
  root.addEventListener('crocs:language-change', () => { mountHeader(); mountFooter(); updateBagCount(); });
  root.addEventListener('crocs:localization-ready', () => { mountHeader(); mountFooter(); updateBagCount(); });
})(window);
