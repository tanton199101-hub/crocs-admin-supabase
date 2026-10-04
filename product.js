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
  let selectedValues = {};

  const renderMissing = (message = 'This product is not available right now.') => {
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `<section class="checkout-empty"><div><h1>We couldn’t find that pair</h1><p>${commerce.escape(message)}</p><a class="commerce-button-link" href="index.html#new-arrivals">Browse new arrivals</a></div></section>`;
  };

  function ensureMeta(name, content) {
    let node = document.head.querySelector(`meta[name="${name}"]`);
    if (!node) { node = document.createElement('meta'); node.name = name; document.head.appendChild(node); }
    node.content = content;
  }

  function absolute(url) {
    try { return new URL(url, root.location.href).href; } catch { return url; }
  }

  function updateStructuredData(variantList, current) {
    const base = new URL(root.location.href);
    base.hash = '';
    base.search = `?id=${encodeURIComponent(product.id)}`;
    const canonical = new URL(base.href);
    canonical.searchParams.set('slug', product.slug || product.id);
    if (current?.id) canonical.searchParams.set('variant', current.id);
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = canonical.href;
    const description = product.seo?.description || product.description || `${product.title} from ${product.brand || 'Crocs'}.`;
    document.title = product.seo?.title || `${product.title} | Crocs Studio`;
    ensureMeta('description', description.slice(0, 320));
    ensureMeta('robots', product.seo?.noindex ? 'noindex,follow' : 'index,follow');
    const urlFor = variant => {
      const linkUrl = new URL(base.href);
      linkUrl.searchParams.set('slug', product.slug || product.id);
      if (variant?.id) linkUrl.searchParams.set('variant', variant.id);
      return linkUrl.href;
    };
    const offer = variant => ({
      '@type': 'Offer', url: urlFor(variant), priceCurrency: 'GBP', price: (variant.price / 100).toFixed(2),
      availability: variant.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition'
    });
    const imageUrl = absolute(commerce.image(product.image));
    const variants = variantList.length ? variantList.map(v => ({
      '@type': 'Product', name: `${product.title} — ${commerce.variantTitle(product, v)}`, sku: v.sku || `${product.sku}-${v.id}`,
      image: [imageUrl], offers: offer(v), url: urlFor(v)
    })) : [];
    const schema = variantList.length ? {
      '@context': 'https://schema.org', '@type': 'ProductGroup', '@id': `${base.href}#product-group`, name: product.title,
      description, image: [imageUrl], brand: { '@type': 'Brand', name: product.brand || 'Crocs' }, productGroupID: product.sku || product.id,
      variesBy: commerce.optionsFor(product).map(option => `https://schema.org/${/size/i.test(option.name) ? 'size' : /colou?r/i.test(option.name) ? 'color' : 'additionalProperty'}`), hasVariant: variants
    } : {
      '@context': 'https://schema.org', '@type': 'Product', name: product.title, description, image: [imageUrl], sku: product.sku || product.id,
      brand: { '@type': 'Brand', name: product.brand || 'Crocs' }, offers: offer({ id: '', price: product.price, stock: product.stock })
    };
    let script = document.head.querySelector('#productStructuredData');
    if (!script) { script = document.createElement('script'); script.id = 'productStructuredData'; script.type = 'application/ld+json'; document.head.appendChild(script); }
    script.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
  }

  function activeVariants() { return commerce.variantsFor(product); }
  function currentVariant() { return activeVariants().length ? commerce.variantFor(product, { values: selectedValues }) : null; }
  function displayPrice(current) {
    if (current) return commerce.money(current.price);
    const variants = activeVariants();
    if (!variants.length) return commerce.money(product.price);
    const min = Math.min(...variants.map(v => v.price));
    const max = Math.max(...variants.map(v => v.price));
    return `${commerce.money(min)}${max > min ? ` – ${commerce.money(max)}` : ''}`;
  }
  function optionMarkup() {
    return commerce.optionsFor(product).map(option => `<fieldset class="variant-option-group"><legend>${commerce.escape(option.name)}</legend><div class="size-grid" role="group" aria-label="Choose ${commerce.escape(option.name)}">${option.values.map(value => {
      const values = { ...selectedValues, [option.id]: value };
      const variant = commerce.variantFor(product, { values });
      const disabled = !variant || variant.stock < 1;
      return `<button class="size-option${selectedValues[option.id] === value ? ' is-selected' : ''}" type="button" data-option-id="${commerce.escape(option.id)}" data-option-value="${commerce.escape(value)}" aria-pressed="${selectedValues[option.id] === value}" ${disabled ? 'disabled' : ''}>${commerce.escape(value)}</button>`;
    }).join('')}</div></fieldset>`).join('');
  }

  function render() {
    if (!product) return renderMissing();
    const variants = activeVariants();
    if (variants.length) {
      const requestedVariant = commerce.variantFor(product, query.get('variant') || '');
      const fallback = requestedVariant || variants[0];
      selectedValues = { ...(fallback?.values || {}) };
    } else {
      const sizes = commerce.sizesFor(product);
      selectedSize = selectedSize && sizes.includes(selectedSize) ? selectedSize : sizes[0];
    }
    const current = currentVariant();
    const sizeValues = commerce.sizesFor(product);
    const related = commerce.products.filter(item => item.id !== product.id && item.status === 'Active' && item.category === product.category).slice(0, 4);
    updateStructuredData(variants, current);
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `
      <div class="product-breadcrumbs"><a href="index.html">Home</a><span aria-hidden="true"> / </span><a href="index.html#new-arrivals">New arrivals</a><span aria-hidden="true"> / </span><span>${commerce.escape(product.title)}</span></div>
      <section class="product-detail" aria-labelledby="productTitle">
        <div class="product-gallery">
          <div class="product-hero-image"><img src="${commerce.escape(commerce.image(product.image))}" alt="${commerce.escape(product.imageAlt || product.title)}" width="900" height="720"></div>
          <p class="product-gallery-note">Product code ${commerce.escape(current?.sku || product.sku || product.id)} · Images shown for illustration.</p>
        </div>
        <div class="product-copy">
          <p class="product-kicker">${commerce.escape(product.brand || product.category || 'Crocs comfort')}</p>
          <h1 id="productTitle">${commerce.escape(product.title)}</h1>
          <p class="product-price" aria-live="polite">${displayPrice(current)}</p>
          <p class="product-description">${commerce.escape(product.description || 'Lightweight comfort. Made for everyday adventures.')}</p>
          <div class="product-meta" aria-label="Product details">
            <div class="product-meta-row"><span>Selected</span><strong>${commerce.escape(current ? commerce.variantTitle(product, current) : product.colour || 'As pictured')}</strong></div>
            <div class="product-meta-row"><span>Availability</span><strong>${current ? (current.stock > 0 ? `${current.stock} ready to ship` : 'Out of stock') : (product.stock > 0 ? `${product.stock} ready to ship` : 'Out of stock')}</strong></div>
          </div>
          <form id="productForm">
            ${variants.length ? optionMarkup() : `<fieldset class="variant-option-group"><legend>UK size</legend><div class="size-grid" id="sizeOptions" role="group" aria-label="Choose a UK size">${sizeValues.map(size => `<button class="size-option${size === selectedSize ? ' is-selected' : ''}" type="button" data-size="${commerce.escape(size)}" aria-pressed="${size === selectedSize}">${commerce.escape(size)}</button>`).join('')}</div></fieldset>`}
            <label class="commerce-form-label" for="quantityValue">Quantity</label>
            <div class="quantity-control" aria-label="Quantity selector">
              <button type="button" data-quantity="decrease" aria-label="Decrease quantity">−</button><span class="quantity-value" id="quantityValue">${quantity}</span><button type="button" data-quantity="increase" aria-label="Increase quantity">+</button>
            </div>
            <button class="commerce-primary" type="submit" ${((current ? current.stock : product.stock) < 1 || (variants.length && !current)) ? 'disabled' : ''}>${(current ? current.stock : product.stock) < 1 ? 'Out of stock' : 'Add to bag'}</button>
          </form>
          <p class="shipping-note">Free standard delivery on orders over £50. This storefront is a demo; no payment is taken.</p>
        </div>
      </section>
      ${related.length ? `<section class="related-products" aria-labelledby="relatedTitle"><h2 id="relatedTitle">More comfort, same energy</h2><div class="related-grid">${related.map(item => `<a class="related-card" href="product.html?id=${encodeURIComponent(item.id)}&slug=${encodeURIComponent(item.slug || item.id)}"><div class="related-card-image"><img src="${commerce.escape(commerce.image(item.image))}" alt="${commerce.escape(item.imageAlt || item.title)}" loading="lazy"></div><h3>${commerce.escape(item.title)}</h3><p>${commerce.money(item.price)}</p></a>`).join('')}</div></section>` : ''}`;
    bind();
  }

  function refreshQuantity() { const value = main.querySelector('#quantityValue'); if (value) value.textContent = String(quantity); }
  function syncVariantUrl(variant) {
    const next = new URL(root.location.href);
    if (variant?.id) next.searchParams.set('variant', variant.id); else next.searchParams.delete('variant');
    root.history.replaceState(null, '', next.href);
    updateStructuredData(activeVariants(), variant);
  }
  function bind() {
    main.querySelectorAll('[data-option-id]').forEach(button => button.addEventListener('click', () => {
      selectedValues[button.dataset.optionId] = button.dataset.optionValue;
      const variant = currentVariant();
      syncVariantUrl(variant);
      render();
    }));
    main.querySelectorAll('[data-size]').forEach(button => button.addEventListener('click', () => {
      selectedSize = button.dataset.size;
      main.querySelectorAll('[data-size]').forEach(item => { item.classList.toggle('is-selected', item === button); item.setAttribute('aria-pressed', String(item === button)); });
    }));
    main.querySelectorAll('[data-quantity]').forEach(button => button.addEventListener('click', () => {
      quantity = Math.max(1, Math.min(10, quantity + (button.dataset.quantity === 'increase' ? 1 : -1)));
      refreshQuantity();
    }));
    main.querySelector('#productForm')?.addEventListener('submit', event => {
      event.preventDefault();
      try {
        const variant = currentVariant();
        if (activeVariants().length && !variant) throw new Error('Choose every product option first.');
        commerce.add(product.id, variant ? { variantId: variant.id, size: commerce.variantSize(product, variant) } : selectedSize, quantity);
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
