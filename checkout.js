(function (root) {
  'use strict';

  const commerce = root.CrocsCommerce;
  const ui = root.CrocsCommerceUI;
  const main = document.querySelector('#checkoutMain');
  let deliveryMethod = 'standard';
  let stripeConfig = { enabled: false, ready: false, mode: 'test', reason: 'disabled' };
  let stripeReturnHandled = false;

  const linePayload = lines => lines.map(line => ({ productId: line.productId, variantId: line.variantId || undefined, size: line.size, quantity: line.quantity }));

  function renderEmpty() {
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `<section class="checkout-empty"><div><h1>Your bag is waiting</h1><p>Add a pair before starting checkout. ${stripeConfig.ready ? 'Secure payment is handled by Stripe.' : 'No payment is taken until Stripe is configured.'}</p><a class="commerce-button-link" href="index.html#new-arrivals">Shop new arrivals</a></div></section>`;
  }

  function renderSuccess(order) {
    main.setAttribute('aria-busy', 'false');
    const number = order?.order_number || order?.number || 'demo';
    const total = Number(order?.total || 0);
    main.innerHTML = `<section class="checkout-success"><div class="checkout-success-mark" aria-hidden="true">✓</div><h1>Order received</h1><p>Your demo order <strong>#${commerce.escape(number)}</strong> is saved. ${total ? `The total is ${commerce.money(total)}.` : ''} No card payment or shipment has been processed.</p><a class="commerce-button-link" href="index.html">Return to the store</a></section>`;
  }

  function renderStripeMessage(title, copy, action = 'index.html') {
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `<section class="checkout-success"><div class="checkout-success-mark" aria-hidden="true">${title === 'Payment cancelled' ? '↩' : '✓'}</div><h1>${commerce.escape(title)}</h1><p>${copy}</p><a class="commerce-button-link" href="${action}">${title === 'Payment cancelled' ? 'Return to your bag' : 'Return to the store'}</a></section>`;
  }

  async function renderStripeReturn() {
    const params = new URLSearchParams(root.location.search);
    const state = params.get('payment');
    const sessionId = params.get('session_id');
    if (!state || stripeReturnHandled) return false;
    stripeReturnHandled = true;
    if (state === 'cancelled') {
      if (sessionId && root.location.protocol !== 'file:') {
        try { await fetch('/api/stripe/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId }) }); } catch { /* Webhook expiry remains authoritative. */ }
      }
      renderStripeMessage('Payment cancelled', 'Your bag is still saved. No card was charged. You can review the details and try again when you are ready.', 'checkout.html');
      return true;
    }
    if (state !== 'success' || !sessionId || root.location.protocol === 'file:') return false;
    main.setAttribute('aria-busy', 'true');
    main.innerHTML = `<section class="checkout-success"><div class="checkout-success-mark is-loading" aria-hidden="true">…</div><h1>Confirming your payment</h1><p>Stripe has returned you to the store. We are waiting for the signed payment confirmation before showing your order number.</p></section>`;
    try {
      const response = await fetch(`/api/stripe/session-status?session_id=${encodeURIComponent(sessionId)}`, { headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Payment confirmation is still processing.');
      commerce.saveCart([]);
      if (result.status === 'paid') {
        const total = Number(result.total || 0);
        renderStripeMessage('Payment received', `Your order <strong>#${commerce.escape(result.order_number || '')}</strong> is confirmed${total ? ` for ${commerce.money(total)}` : ''}. Stripe has securely processed your payment.`, 'index.html');
      } else if (result.status === 'processing') {
        renderStripeMessage('Payment received', 'Your payment is being confirmed by Stripe. We have saved your checkout and will update the order automatically.', 'index.html');
      } else {
        renderStripeMessage('Payment needs attention', 'Stripe could not confirm this payment yet. Please contact the store before trying again.', 'checkout.html');
      }
    } catch (error) {
      main.setAttribute('aria-busy', 'false');
      main.innerHTML = `<section class="checkout-success"><div class="checkout-success-mark" aria-hidden="true">!</div><h1>Payment confirmation pending</h1><p>${commerce.escape(error.message || 'Stripe is still confirming your payment. Please check your email before paying again.')}</p><a class="commerce-button-link" href="index.html">Return to the store</a></section>`;
    }
    return true;
  }

  async function loadStripeConfig() {
    if (root.location.protocol === 'file:') return stripeConfig;
    try {
      const response = await fetch('/api/stripe/config', { headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (response.ok) stripeConfig = result;
    } catch { /* Demo checkout remains usable while the payment API is offline. */ }
    return stripeConfig;
  }

  function summaryMarkup(quote) {
    return `<aside class="checkout-summary" aria-labelledby="summaryTitle"><h2 id="summaryTitle">Your bag</h2><div class="checkout-lines">${quote.items.map(line => { const label = line.variantTitle || `Size ${line.size}`; return `<article class="checkout-line"><div class="checkout-line-image"><img src="${commerce.escape(commerce.image(line.product.image))}" alt="${commerce.escape(line.product.imageAlt || line.product.title)}"></div><div><h3>${commerce.escape(line.product.title)}</h3><p>${commerce.escape(label)} · ${commerce.money(line.unitPrice || line.product.price)}</p><div class="line-actions"><span class="line-quantity"><button type="button" data-line-action="decrease" data-product-id="${commerce.escape(line.productId)}" data-variant-id="${commerce.escape(line.variantId || '')}" data-size="${commerce.escape(line.size)}" aria-label="Decrease ${commerce.escape(line.product.title)}">−</button><span>${line.quantity}</span><button type="button" data-line-action="increase" data-product-id="${commerce.escape(line.productId)}" data-variant-id="${commerce.escape(line.variantId || '')}" data-size="${commerce.escape(line.size)}" aria-label="Increase ${commerce.escape(line.product.title)}">+</button></span><button type="button" data-line-action="remove" data-product-id="${commerce.escape(line.productId)}" data-variant-id="${commerce.escape(line.variantId || '')}" data-size="${commerce.escape(line.size)}">Remove</button></div></div><strong>${commerce.money(line.total)}</strong></article>`; }).join('')}</div><div class="summary-divider"></div><div class="summary-row"><span>Subtotal</span><strong>${commerce.money(quote.subtotal)}</strong></div><div class="summary-row"><span>${deliveryMethod === 'express' ? 'Express delivery' : 'Standard delivery'}</span><strong>${quote.shipping ? commerce.money(quote.shipping) : 'Free'}</strong></div><div class="summary-row summary-total"><span>Total</span><strong>${commerce.money(quote.total)}</strong></div></aside>`;
  }

  function formMarkup() {
    const standardChecked = deliveryMethod === 'standard' ? ' checked' : '';
    const expressChecked = deliveryMethod === 'express' ? ' checked' : '';
    const paymentEnabled = stripeConfig.enabled && stripeConfig.ready;
    const paymentBlocked = stripeConfig.enabled && !stripeConfig.ready;
    const intro = paymentEnabled ? 'Pay securely with Stripe Checkout. Your card details never touch this website.' : 'Review your details before placing this demo order.';
    const disclaimer = paymentEnabled
      ? `<p class="checkout-disclaimer checkout-disclaimer--stripe"><strong>Secure Stripe checkout:</strong> you will be redirected to Stripe to complete payment. ${stripeConfig.mode === 'test' ? 'Test mode is active — no real charge will be made.' : 'Live mode is active.'}</p>`
      : paymentBlocked
        ? `<p class="checkout-disclaimer checkout-disclaimer--blocked"><strong>Online payment is temporarily unavailable:</strong> the store is finishing its Stripe connection. No order or card payment will be created.</p>`
        : `<p class="checkout-disclaimer"><strong>Demo checkout:</strong> no card details are requested, and no payment or shipment will be processed.</p>`;
    const submitLabel = paymentEnabled ? 'Continue to secure payment' : paymentBlocked ? 'Payment unavailable' : 'Place demo order';
    return `<section class="checkout-main"><h1>Checkout</h1><p class="checkout-intro">${intro}</p><form class="checkout-form" id="checkoutForm" novalidate><h2>Contact details</h2><div class="form-field"><label for="email">Email address</label><input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="form-field"><label for="customerName">Full name</label><input id="customerName" name="customerName" autocomplete="name" required placeholder="Your name"></div><div class="form-field"><label for="phone">Phone (optional)</label><input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+44 20 1234 5678"></div><h2>Delivery address</h2><div class="form-field"><label for="address">Address</label><input id="address" name="address" autocomplete="street-address" required placeholder="House number and street"></div><div class="form-grid"><div class="form-field"><label for="city">Town or city</label><input id="city" name="city" autocomplete="address-level2" required></div><div class="form-field"><label for="postcode">Postcode</label><input id="postcode" name="postcode" autocomplete="postal-code" required></div></div><h2>Delivery</h2><div class="delivery-options"><label class="delivery-option"><input type="radio" name="delivery" value="standard"${standardChecked}><span><strong>Standard delivery · 3–5 days</strong><small>Free over £50, otherwise £3.99</small></span></label><label class="delivery-option"><input type="radio" name="delivery" value="express"${expressChecked}><span><strong>Express delivery · 1–2 days</strong><small>£5.99</small></span></label></div>${disclaimer}<button class="commerce-primary checkout-submit" type="submit" ${paymentBlocked ? 'disabled' : ''}>${submitLabel}</button></form></section>`;
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
      submit.disabled = true; submit.classList.add('is-loading'); submit.textContent = stripeConfig.enabled ? 'Opening Stripe…' : 'Saving demo order…';
      const fields = new FormData(form);
      try {
        const currentLines = commerce.readCart();
        commerce.quote(currentLines, deliveryMethod);
        const customer = { email: String(fields.get('email') || '').trim(), name: String(fields.get('customerName') || '').trim(), phone: String(fields.get('phone') || '').trim(), address: String(fields.get('address') || '').trim(), city: String(fields.get('city') || '').trim(), postcode: String(fields.get('postcode') || '').trim() };
        if (stripeConfig.enabled) {
          if (!stripeConfig.ready) throw new Error('Stripe is temporarily unavailable. Please try again later.');
          const requestId = root.crypto?.randomUUID?.() || `${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
          const response = await fetch('/api/stripe/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ requestId, customer, deliveryMethod, lines: linePayload(currentLines) }) });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.url) throw new Error(result.error || 'Stripe checkout could not be opened.');
          root.location.assign(result.url);
          return;
        }
        const result = await commerce.rpc('create_storefront_order', { p_email: customer.email, p_customer_name: customer.name, p_phone: customer.phone, p_shipping_address: customer.address, p_city: customer.city, p_postcode: customer.postcode, p_delivery_method: deliveryMethod, p_lines: linePayload(currentLines) });
        const order = Array.isArray(result) ? result[0] : result;
        commerce.saveCart([]);
        renderSuccess(order);
      } catch (error) {
        submit.disabled = false; submit.classList.remove('is-loading'); submit.textContent = stripeConfig.enabled ? 'Continue to secure payment' : 'Place demo order';
        ui?.toast(error.message || 'The demo order could not be saved.');
      }
    });
  }

  (async () => {
    try { await commerce.ready; await loadStripeConfig(); if (await renderStripeReturn()) return; render(); }
    catch (error) { main.setAttribute('aria-busy', 'false'); main.innerHTML = `<section class="checkout-empty"><div><h1>Checkout is unavailable</h1><p>${commerce.escape(error.message)}</p><a class="commerce-button-link" href="index.html">Return to the store</a></div></section>`; }
  })();
})(window);
