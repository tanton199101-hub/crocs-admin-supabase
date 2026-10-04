(function (root) {
  'use strict';

  const commerce = root.CrocsCommerce;
  const ui = root.CrocsCommerceUI;
  const main = document.querySelector('#checkoutMain');
  let deliveryMethod = 'standard';

  const linePayload = lines => lines.map(line => ({ productId: line.productId, variantId: line.variantId || undefined, size: line.size, quantity: line.quantity }));

  function renderEmpty() {
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `<section class="checkout-empty"><div><h1>Your bag is waiting</h1><p>Add a pair before starting checkout. No payment is taken in this demo.</p><a class="commerce-button-link" href="index.html#new-arrivals">Shop new arrivals</a></div></section>`;
  }

  function renderSuccess(order) {
    main.setAttribute('aria-busy', 'false');
    const number = order?.order_number || order?.number || 'demo';
    const total = Number(order?.total || 0);
    main.innerHTML = `<section class="checkout-success"><div class="checkout-success-mark" aria-hidden="true">✓</div><h1>Order received</h1><p>Your demo order <strong>#${commerce.escape(number)}</strong> is saved. ${total ? `The total is ${commerce.money(total)}.` : ''} No card payment or shipment has been processed.</p><a class="commerce-button-link" href="index.html">Return to the store</a></section>`;
  }

  function summaryMarkup(quote) {
    return `<aside class="checkout-summary" aria-labelledby="summaryTitle"><h2 id="summaryTitle">Your bag</h2><div class="checkout-lines">${quote.items.map(line => { const label = line.variantTitle || `Size ${line.size}`; return `<article class="checkout-line"><div class="checkout-line-image"><img src="${commerce.escape(commerce.image(line.product.image))}" alt="${commerce.escape(line.product.imageAlt || line.product.title)}"></div><div><h3>${commerce.escape(line.product.title)}</h3><p>${commerce.escape(label)} · ${commerce.money(line.unitPrice || line.product.price)}</p><div class="line-actions"><span class="line-quantity"><button type="button" data-line-action="decrease" data-product-id="${commerce.escape(line.productId)}" data-variant-id="${commerce.escape(line.variantId || '')}" data-size="${commerce.escape(line.size)}" aria-label="Decrease ${commerce.escape(line.product.title)}">−</button><span>${line.quantity}</span><button type="button" data-line-action="increase" data-product-id="${commerce.escape(line.productId)}" data-variant-id="${commerce.escape(line.variantId || '')}" data-size="${commerce.escape(line.size)}" aria-label="Increase ${commerce.escape(line.product.title)}">+</button></span><button type="button" data-line-action="remove" data-product-id="${commerce.escape(line.productId)}" data-variant-id="${commerce.escape(line.variantId || '')}" data-size="${commerce.escape(line.size)}">Remove</button></div></div><strong>${commerce.money(line.total)}</strong></article>`; }).join('')}</div><div class="summary-divider"></div><div class="summary-row"><span>Subtotal</span><strong>${commerce.money(quote.subtotal)}</strong></div><div class="summary-row"><span>${deliveryMethod === 'express' ? 'Express delivery' : 'Standard delivery'}</span><strong>${quote.shipping ? commerce.money(quote.shipping) : 'Free'}</strong></div><div class="summary-row summary-total"><span>Total</span><strong>${commerce.money(quote.total)}</strong></div></aside>`;
  }

  function formMarkup() {
    const standardChecked = deliveryMethod === 'standard' ? ' checked' : '';
    const expressChecked = deliveryMethod === 'express' ? ' checked' : '';
    return `<section class="checkout-main"><h1>Checkout</h1><p class="checkout-intro">A simple demo checkout for the Crocs Studio storefront.</p><form class="checkout-form" id="checkoutForm" novalidate><h2>Contact details</h2><div class="form-field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="form-field"><label for="customerName">Full name</label><input id="customerName" name="customerName" autocomplete="name" required placeholder="Your name"></div><div class="form-field"><label for="phone">Phone (optional)</label><input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+44 20 1234 5678"></div><h2>Delivery address</h2><div class="form-field"><label for="address">Address</label><input id="address" name="address" autocomplete="street-address" required placeholder="House number and street"></div><div class="form-grid"><div class="form-field"><label for="city">Town or city</label><input id="city" name="city" autocomplete="address-level2" required></div><div class="form-field"><label for="postcode">Postcode</label><input id="postcode" name="postcode" autocomplete="postal-code" required></div></div><h2>Delivery</h2><div class="delivery-options"><label class="delivery-option"><input type="radio" name="delivery" value="standard"${standardChecked}><span><strong>Standard delivery · 3–5 days</strong><small>Free over £50, otherwise £3.99</small></span></label><label class="delivery-option"><input type="radio" name="delivery" value="express"${expressChecked}><span><strong>Express delivery · 1–2 days</strong><small>£5.99</small></span></label></div><p class="checkout-disclaimer"><strong>Demo checkout:</strong> no card details are requested, and no payment or shipment will be processed.</p><button class="commerce-primary checkout-submit" type="submit">Place demo order</button></form></section>`;
  }

  function render() {
    const lines = commerce.readCart();
    if (!lines.length) return renderEmpty();
    let quote;
    try { quote = commerce.quote(lines, deliveryMethod); } catch (error) { ui?.toast(error.message); return renderEmpty(); }
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `${formMarkup()}${summaryMarkup(quote)}`;
    bind(lines);
  }

  function bind(lines) {
    main.querySelectorAll('input[name="delivery"]').forEach(input => input.addEventListener('change', () => {
      const form = main.querySelector('#checkoutForm');
      const values = form ? Object.fromEntries(new FormData(form).entries()) : {};
      deliveryMethod = input.value;
      render();
      Object.entries(values).forEach(([name, value]) => {
        const field = main.querySelector(`[name="${CSS.escape(name)}"]`);
        if (field && field.type !== 'radio') field.value = value;
      });
    }));
    main.querySelectorAll('[data-line-action]').forEach(button => button.addEventListener('click', () => {
      const current = commerce.readCart().find(line => line.productId === button.dataset.productId && (button.dataset.variantId ? line.variantId === button.dataset.variantId : line.size === button.dataset.size));
      if (!current) return render();
      try {
        if (button.dataset.lineAction === 'remove') commerce.update(current.productId, current.size, 0, current.variantId);
        else commerce.update(current.productId, current.size, current.quantity + (button.dataset.lineAction === 'increase' ? 1 : -1), current.variantId);
        render();
      } catch (error) { ui?.toast(error.message); }
    }));
    main.querySelector('#checkoutForm')?.addEventListener('submit', async event => {
      event.preventDefault();
      const form = event.currentTarget;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const submit = form.querySelector('button[type="submit"]');
      submit.disabled = true; submit.classList.add('is-loading'); submit.textContent = 'Saving demo order…';
      const fields = new FormData(form);
      try {
        const currentLines = commerce.readCart();
        commerce.quote(currentLines, deliveryMethod);
        const result = await commerce.rpc('create_storefront_order', {
          p_email: String(fields.get('email') || '').trim(),
          p_customer_name: String(fields.get('customerName') || '').trim(),
          p_phone: String(fields.get('phone') || '').trim(),
          p_shipping_address: String(fields.get('address') || '').trim(),
          p_city: String(fields.get('city') || '').trim(),
          p_postcode: String(fields.get('postcode') || '').trim(),
          p_delivery_method: deliveryMethod,
          p_lines: linePayload(currentLines)
        });
        const order = Array.isArray(result) ? result[0] : result;
        commerce.saveCart([]);
        renderSuccess(order);
      } catch (error) {
        submit.disabled = false; submit.classList.remove('is-loading'); submit.textContent = 'Place demo order';
        ui?.toast(error.message || 'The demo order could not be saved.');
      }
    });
  }

  (async () => {
    try { await commerce.ready; render(); }
    catch (error) { main.setAttribute('aria-busy', 'false'); main.innerHTML = `<section class="checkout-empty"><div><h1>Checkout is unavailable</h1><p>${commerce.escape(error.message)}</p><a class="commerce-button-link" href="index.html">Return to the store</a></div></section>`; }
  })();
})(window);
