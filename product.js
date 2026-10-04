(function (root) {
  'use strict';

  const commerce = root.CrocsCommerce;
  const ui = root.CrocsCommerceUI;
  const main = document.querySelector('#productMain');
  const query = new URLSearchParams(root.location.search);
  const requestedId = query.get('id') || 'p1';
  let product;
  let quantity = 1;
  let selectedSize = '';

  const renderMissing = (message = 'This product is not available right now.') => {
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `<section class="checkout-empty"><div><h1>We couldn’t find that pair</h1><p>${commerce.escape(message)}</p><a class="commerce-button-link" href="index.html#new-arrivals">Browse new arrivals</a></div></section>`;
  };

  function render() {
    if (!product) return renderMissing();
    const sizes = commerce.sizesFor(product);
    selectedSize = selectedSize && sizes.includes(selectedSize) ? selectedSize : sizes[0];
    const related = commerce.products.filter(item => item.id !== product.id && item.status === 'Active' && item.category === product.category).slice(0, 4);
    document.title = `${product.title} | Crocs Studio`;
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `
      <div class="product-breadcrumbs"><a href="index.html">Home</a><span aria-hidden="true"> / </span><a href="index.html#new-arrivals">New arrivals</a><span aria-hidden="true"> / </span><span>${commerce.escape(product.title)}</span></div>
      <section class="product-detail" aria-labelledby="productTitle">
        <div class="product-gallery">
          <div class="product-hero-image"><img src="${commerce.escape(commerce.image(product.image))}" alt="${commerce.escape(product.title)}" width="900" height="720"></div>
          <p class="product-gallery-note">Product code ${commerce.escape(product.sku || product.id)} · Images shown for illustration.</p>
        </div>
        <div class="product-copy">
          <p class="product-kicker">${commerce.escape(product.category || 'Crocs comfort')}</p>
          <h1 id="productTitle">${commerce.escape(product.title)}</h1>
          <p class="product-price">${commerce.money(product.price)}</p>
          <p class="product-description">${commerce.escape(product.description || 'Lightweight comfort. Made for everyday adventures.')}</p>
          <div class="product-meta" aria-label="Product details">
            <div class="product-meta-row"><span>Colour</span><strong>${commerce.escape(product.colour || 'As pictured')}</strong></div>
            <div class="product-meta-row"><span>Availability</span><strong>${product.stock > 0 ? `${product.stock} ready to ship` : 'Out of stock'}</strong></div>
          </div>
          <form id="productForm">
            <label class="commerce-form-label" for="sizeOptions">UK size</label>
            <div class="size-grid" id="sizeOptions" role="group" aria-label="Choose a UK size">
              ${sizes.map(size => `<button class="size-option" type="button" data-size="${commerce.escape(size)}" aria-pressed="${size === selectedSize}">${commerce.escape(size)}</button>`).join('')}
            </div>
            <label class="commerce-form-label" for="quantityValue">Quantity</label>
            <div class="quantity-control" aria-label="Quantity selector">
              <button type="button" data-quantity="decrease" aria-label="Decrease quantity">−</button><span class="quantity-value" id="quantityValue">1</span><button type="button" data-quantity="increase" aria-label="Increase quantity">+</button>
            </div>
            <button class="commerce-primary" type="submit" ${product.stock < 1 ? 'disabled' : ''}>${product.stock < 1 ? 'Out of stock' : 'Add to bag'}</button>
          </form>
          <p class="shipping-note">Free standard delivery on orders over £50. This storefront is a demo; no payment is taken.</p>
        </div>
      </section>
      ${related.length ? `<section class="related-products" aria-labelledby="relatedTitle"><h2 id="relatedTitle">More comfort, same energy</h2><div class="related-grid">${related.map(item => `<a class="related-card" href="product.html?id=${encodeURIComponent(item.id)}"><div class="related-card-image"><img src="${commerce.escape(commerce.image(item.image))}" alt="${commerce.escape(item.title)}" loading="lazy"></div><h3>${commerce.escape(item.title)}</h3><p>${commerce.money(item.price)}</p></a>`).join('')}</div></section>` : ''}`;
    bind();
  }

  function refreshQuantity() {
    const value = main.querySelector('#quantityValue');
    if (value) value.textContent = String(quantity);
  }

  function bind() {
    main.querySelectorAll('[data-size]').forEach(button => button.addEventListener('click', () => {
      selectedSize = button.dataset.size;
      main.querySelectorAll('[data-size]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
    }));
    main.querySelectorAll('[data-quantity]').forEach(button => button.addEventListener('click', () => {
      quantity = Math.max(1, Math.min(10, quantity + (button.dataset.quantity === 'increase' ? 1 : -1)));
      refreshQuantity();
    }));
    main.querySelector('#productForm')?.addEventListener('submit', event => {
      event.preventDefault();
      try {
        commerce.add(product.id, selectedSize, quantity);
        ui?.toast(`${product.title} added to your bag`);
        quantity = 1;
        refreshQuantity();
      } catch (error) { ui?.toast(error.message); }
    });
  }

  (async () => {
    try {
      await commerce.ready;
      product = commerce.product(requestedId);
      render();
    } catch (error) { renderMissing(error.message); }
  })();
})(window);
