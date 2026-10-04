(function (root) {
  'use strict';

  const commerce = root.CrocsCommerce;
  const ui = root.CrocsCommerceUI;
  const t = (...args) => commerce?.t?.(...args) || args[1] || args[0];
  const main = document.querySelector('#checkoutMain');
  let deliveryMethod = 'standard';
  let stripeConfig = { enabled: false, ready: false, mode: 'test', reason: 'disabled' };
  let stripeReturnHandled = false;
  let viewReady = false;
  let submitting = false;
  let completedOrder = null;

  const linePayload = lines => lines.map(line => ({ productId: line.productId, variantId: line.variantId || undefined, size: line.size, quantity: line.quantity }));
  const orderMoney = (amount, order = {}) => {
    const value = Number(amount || 0);
    if (order.currency && root.CrocsRegional?.formatMoney) return root.CrocsRegional.formatMoney(value, { regionId: order.region_id || order.regionId, currency: String(order.currency).toUpperCase() });
    return commerce.money(root.CrocsRegional?.convert?.(value) || value);
  };

  function renderEmpty() {
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `<section class="checkout-empty"><div><h1>${t('emptyBag', 'Your bag is empty')}</h1><p>${t('findPair', 'Find a pair that feels like you.')} ${stripeConfig.ready ? t('secureIntro', 'Secure payment is handled by Stripe.') : t('reviewIntro', 'No payment is taken until Stripe is configured.')}</p><a class="commerce-button-link" href="index.html#new-arrivals">${t('newArrivals', 'Shop new arrivals')}</a></div></section>`;
  }

  function renderSuccess(order) {
    completedOrder = order;
    main.setAttribute('aria-busy', 'false');
    const number = order?.order_number || order?.number || 'demo';
    const total = Number(order?.total || 0);
    main.innerHTML = `<section class="checkout-success"><div class="checkout-success-mark" aria-hidden="true">✓</div><h1>${t('orderReceived', 'Order received')}</h1><p>${t('demoOrderSaved', 'Your demo order')} <strong>#${commerce.escape(number)}</strong> ${t('orderSaved', 'is saved.')}${total ? ` ${t('orderTotal', 'The total is {amount}.', { amount: orderMoney(total, order) })}` : ''} ${t('noPayment', 'No card payment or shipment has been processed.')}</p><a class="commerce-button-link" href="index.html">${t('returnStore', 'Return to the store')}</a></section>`;
  }

  function renderStripeMessage(title, copy, action = 'index.html') {
    main.setAttribute('aria-busy', 'false');
    const cancelled = title === t('paymentCancelled', 'Payment cancelled');
    main.innerHTML = `<section class="checkout-success"><div class="checkout-success-mark" aria-hidden="true">${cancelled ? '↩' : '✓'}</div><h1>${commerce.escape(title)}</h1><p>${copy}</p><a class="commerce-button-link" href="${action}">${cancelled ? t('returnBag', 'Return to your bag') : t('returnStore', 'Return to the store')}</a></section>`;
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
      renderStripeMessage(t('paymentCancelled', 'Payment cancelled'), t('cancelledCopy', 'Your bag is still saved. No card was charged. You can review the details and try again when you are ready.'), 'checkout.html');
      return true;
    }
    if (state !== 'success' || !sessionId || root.location.protocol === 'file:') return false;
    main.setAttribute('aria-busy', 'true');
    main.innerHTML = `<section class="checkout-success"><div class="checkout-success-mark is-loading" aria-hidden="true">…</div><h1>${t('confirmingPayment', 'Confirming your payment')}</h1><p>${t('confirmingCopy', 'Stripe has returned you to the store. We are waiting for the signed payment confirmation before showing your order number.')}</p></section>`;
    try {
      const response = await fetch(`/api/stripe/session-status?session_id=${encodeURIComponent(sessionId)}`, { headers: { Accept: 'application/json' } });
      const result = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(result.error || 'Payment confirmation is still processing.');
      commerce.saveCart([]);
      if (result.status === 'paid') {
        const total = Number(result.total || 0);
        renderStripeMessage(t('paymentReceived', 'Payment received'), `${t('orderConfirmed', 'Your order')} <strong>#${commerce.escape(result.order_number || '')}</strong> ${t('confirmed', 'is confirmed')}${total ? ` ${t('orderFor', 'for {amount}', { amount: orderMoney(total, result) })}` : ''}. ${t('stripeProcessed', 'Stripe has securely processed your payment.')}`, 'index.html');
      } else if (result.status === 'processing') {
        renderStripeMessage(t('paymentReceived', 'Payment received'), t('paymentProcessing', 'Your payment is being confirmed by Stripe. We have saved your checkout and will update the order automatically.'), 'index.html');
      } else {
        renderStripeMessage(t('paymentNeedsAttention', 'Payment needs attention'), t('paymentNeedsAttentionCopy', 'Stripe could not confirm this payment yet. Please contact the store before trying again.'), 'checkout.html');
      }
    } catch (error) {
      main.setAttribute('aria-busy', 'false');
      main.innerHTML = `<section class="checkout-success"><div class="checkout-success-mark" aria-hidden="true">!</div><h1>${t('paymentPending', 'Payment confirmation pending')}</h1><p>${commerce.escape(error.message || t('paymentPendingCopy', 'Stripe is still confirming your payment. Please check your email before paying again.'))}</p><a class="commerce-button-link" href="index.html">${t('returnStore', 'Return to the store')}</a></section>`;
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
    return `<aside class="checkout-summary" aria-labelledby="summaryTitle"><h2 id="summaryTitle">${t('bag', 'Your bag')}</h2><div class="checkout-lines">${quote.items.map(line => { const label = line.variantTitle || `${t('selectSize', 'Size')} ${line.size}`; return `<article class="checkout-line"><div class="checkout-line-image"><img src="${commerce.escape(commerce.image(line.product.image))}" alt="${commerce.escape(line.product.imageAlt || line.product.title)}"></div><div><h3>${commerce.escape(line.product.title)}</h3><p>${commerce.escape(label)} · ${commerce.money(line.unitPrice || line.product.price)}</p><div class="line-actions"><span class="line-quantity"><button type="button" data-line-action="decrease" data-product-id="${commerce.escape(line.productId)}" data-variant-id="${commerce.escape(line.variantId || '')}" data-size="${commerce.escape(line.size)}" aria-label="Decrease ${commerce.escape(line.product.title)}">−</button><span>${line.quantity}</span><button type="button" data-line-action="increase" data-product-id="${commerce.escape(line.productId)}" data-variant-id="${commerce.escape(line.variantId || '')}" data-size="${commerce.escape(line.size)}" aria-label="Increase ${commerce.escape(line.product.title)}">+</button></span><button type="button" data-line-action="remove" data-product-id="${commerce.escape(line.productId)}" data-variant-id="${commerce.escape(line.variantId || '')}" data-size="${commerce.escape(line.size)}">${t('remove', 'Remove')}</button></div></div><strong>${commerce.money(line.total)}</strong></article>`; }).join('')}</div><div class="summary-divider"></div><div class="summary-row"><span>${t('subtotal', 'Subtotal')}</span><strong>${commerce.money(quote.subtotal)}</strong></div><div class="summary-row"><span>${deliveryMethod === 'express' ? t('expressDelivery', 'Express delivery') : t('standardDelivery', 'Standard delivery')}</span><strong>${quote.shipping ? commerce.money(quote.shipping) : 'Free'}</strong></div><div class="summary-row summary-total"><span>${t('total', 'Total')}</span><strong>${commerce.money(quote.total)}</strong></div></aside>`;
  }

  function formMarkup() {
    const standardChecked = deliveryMethod === 'standard' ? ' checked' : '';
    const expressChecked = deliveryMethod === 'express' ? ' checked' : '';
    const paymentEnabled = stripeConfig.enabled && stripeConfig.ready;
    const paymentBlocked = stripeConfig.enabled && !stripeConfig.ready;
    const standardFee = commerce.money(commerce.shippingCost(0, 'standard'));
    const expressFee = commerce.money(commerce.shippingCost(0, 'express'));
    const freeThreshold = commerce.money(root.CrocsRegional?.convert?.(5000) || 5000);
    const intro = paymentEnabled ? t('secureIntro', 'Pay securely with Stripe Checkout. Your card details never touch this website.') : t('reviewIntro', 'Review your details before placing this demo order.');
    const disclaimer = paymentEnabled
      ? `<p class="checkout-disclaimer checkout-disclaimer--stripe"><strong>${t('secureCheckout', 'Secure Stripe checkout')}:</strong> ${t('redirectStripe', 'you will be redirected to Stripe to complete payment.')} ${stripeConfig.mode === 'test' ? t('testMode', 'Test mode is active — no real charge will be made.') : t('liveMode', 'Live mode is active.')}</p>`
      : paymentBlocked
        ? `<p class="checkout-disclaimer checkout-disclaimer--blocked"><strong>${t('paymentUnavailable', 'Online payment is temporarily unavailable')}:</strong> ${t('paymentUnavailableCopy', 'The store is finishing its Stripe connection. No order or card payment will be created.')}</p>`
        : `<p class="checkout-disclaimer"><strong>${t('demoCheckout', 'Demo checkout')}:</strong> ${t('demoCheckoutCopy', 'No card details are requested, and no payment or shipment will be processed.')}</p>`;
    const submitLabel = paymentEnabled ? t('continuePayment', 'Continue to secure payment') : paymentBlocked ? t('paymentUnavailable', 'Payment unavailable') : t('demoOrder', 'Place demo order');
    return `<section class="checkout-main"><h1>${t('checkout', 'Checkout')}</h1><p class="checkout-intro">${intro}</p><form class="checkout-form" id="checkoutForm" novalidate><h2>${t('contactDetails', 'Contact details')}</h2><div class="form-field"><label for="email">${t('emailAddress', 'Email address')}</label><input id="email" name="email" type="email" autocomplete="email" required placeholder="you@example.com"></div><div class="form-field"><label for="customerName">${t('fullName', 'Full name')}</label><input id="customerName" name="customerName" autocomplete="name" required placeholder="Your name"></div><div class="form-field"><label for="phone">${t('phoneOptional', 'Phone (optional)')}</label><input id="phone" name="phone" type="tel" autocomplete="tel" placeholder="+44 20 1234 5678"></div><h2>${t('delivery', 'Delivery address')}</h2><div class="form-field"><label for="address">${t('address', 'Address')}</label><input id="address" name="address" autocomplete="street-address" required placeholder="House number and street"></div><div class="form-grid"><div class="form-field"><label for="city">${t('city', 'Town or city')}</label><input id="city" name="city" autocomplete="address-level2" required></div><div class="form-field"><label for="postcode">${t('postcode', 'Postcode')}</label><input id="postcode" name="postcode" autocomplete="postal-code" required></div></div><h2>${t('delivery', 'Delivery')}</h2><div class="delivery-options"><label class="delivery-option"><input type="radio" name="delivery" value="standard"${standardChecked}><span><strong>${t('standardDelivery', 'Standard delivery')} · 3–5 days</strong><small>${t('freeOver', 'Free over {amount}, otherwise {fee}.', { amount: freeThreshold, fee: standardFee })}</small></span></label><label class="delivery-option"><input type="radio" name="delivery" value="express"${expressChecked}><span><strong>${t('expressDelivery', 'Express delivery')} · 1–2 days</strong><small>${expressFee}</small></span></label></div>${disclaimer}<button class="commerce-primary checkout-submit" type="submit" ${paymentBlocked ? 'disabled' : ''}>${submitLabel}</button></form></section>`;
  }

  function render() {
    if (!viewReady || submitting || stripeReturnHandled) return;
    if (completedOrder) return renderSuccess(completedOrder);
    const previousForm = main.querySelector('#checkoutForm');
    const previousValues = previousForm ? Object.fromEntries(new FormData(previousForm)) : {};
    const lines = commerce.readCart();
    if (!lines.length) return renderEmpty();
    let quote;
    try { quote = commerce.quote(lines, deliveryMethod); } catch (error) { ui?.toast(error.message); return renderEmpty(); }
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `${formMarkup()}${summaryMarkup(quote)}`;
    Object.entries(previousValues).forEach(([name, value]) => {
      const field = main.querySelector(`[name="${CSS.escape(name)}"]`);
      if (field && field.type !== 'radio') field.value = value;
    });
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
      if (submitting) return;
      if (!form.checkValidity()) { form.reportValidity(); return; }
      const submit = form.querySelector('button[type="submit"]');
      submitting = true;
      document.querySelectorAll('[data-regional-region], [data-regional-language]').forEach(field => { field.disabled = true; });
      submit.disabled = true; submit.classList.add('is-loading'); submit.textContent = stripeConfig.enabled ? t('openingStripe', 'Opening Stripe…') : t('savingOrder', 'Saving demo order…');
      const fields = new FormData(form);
      try {
        const currentLines = commerce.readCart();
        commerce.quote(currentLines, deliveryMethod);
        const customer = { email: String(fields.get('email') || '').trim(), name: String(fields.get('customerName') || '').trim(), phone: String(fields.get('phone') || '').trim(), address: String(fields.get('address') || '').trim(), city: String(fields.get('city') || '').trim(), postcode: String(fields.get('postcode') || '').trim() };
        if (stripeConfig.enabled) {
          if (!stripeConfig.ready) throw new Error('Stripe is temporarily unavailable. Please try again later.');
          const requestId = root.crypto?.randomUUID?.() || 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, char => { const random = Math.random() * 16 | 0; const value = char === 'x' ? random : random & 3 | 8; return value.toString(16); });
          const response = await fetch('/api/stripe/create-checkout-session', { method: 'POST', headers: { 'Content-Type': 'application/json', Accept: 'application/json' }, body: JSON.stringify({ requestId, customer, deliveryMethod, regionId: commerce.region?.id || '', language: commerce.language, lines: linePayload(currentLines) }) });
          const result = await response.json().catch(() => ({}));
          if (!response.ok || !result.url) throw new Error(result.error || 'Stripe checkout could not be opened.');
          root.location.assign(result.url);
          return;
        }
        const result = await commerce.rpc('create_storefront_order_regional_v1', { p_email: customer.email, p_customer_name: customer.name, p_phone: customer.phone, p_shipping_address: customer.address, p_city: customer.city, p_postcode: customer.postcode, p_delivery_method: deliveryMethod, p_lines: linePayload(currentLines), p_region_id: commerce.region?.id || '' });
        const order = Array.isArray(result) ? result[0] : result;
        commerce.saveCart([]);
        renderSuccess(order);
      } catch (error) {
        submit.disabled = false; submit.classList.remove('is-loading'); submit.textContent = stripeConfig.enabled ? t('continuePayment', 'Continue to secure payment') : t('demoOrder', 'Place demo order');
        ui?.toast(error.message || 'The demo order could not be saved.');
      } finally {
        submitting = false;
        document.querySelectorAll('[data-regional-region], [data-regional-language]').forEach(field => { field.disabled = false; });
      }
    });
  }

  (async () => {
    try { await commerce.ready; await loadStripeConfig(); if (await renderStripeReturn()) return; viewReady = true; render(); }
    catch (error) { main.setAttribute('aria-busy', 'false'); main.innerHTML = `<section class="checkout-empty"><div><h1>Checkout is unavailable</h1><p>${commerce.escape(error.message)}</p><a class="commerce-button-link" href="index.html">Return to the store</a></div></section>`; }
  })();
  root.addEventListener('crocs:catalog', render);
  root.addEventListener('crocs:language-change', render);
  root.addEventListener('crocs:bag', render);
})(window);
