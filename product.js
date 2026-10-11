(function (root) {
  'use strict';

  const commerce = root.CrocsCommerce;
  const ui = root.CrocsCommerceUI;
  const regional = root.CrocsRegional;
  const t = (...args) => commerce?.t?.(...args) || args[1] || args[0];
  const main = document.querySelector('#productMain');
  const query = new URLSearchParams(root.location.search);
  const requestedId = query.get('id') || 'p1';
  const bootstrappedProduct = (() => {
    try {
      const node = document.querySelector('#productBootstrap');
      return node?.textContent ? JSON.parse(node.textContent) : null;
    } catch { return null; }
  })();
  let product;
  let quantity = 1;
  let selectedSize = '';
  let selectedValues = {};
  let selectedMediaIndex = 0;
  let recentHydrationFlight = null;
  let recommendationHydrationFlight = null;
  let recommendationCandidates = null;

  const renderMissing = (message = 'This product is not available right now.') => {
    document.title = 'Sản phẩm không khả dụng | Sally Kids';
    ensureMeta('description', message);
    ensureMeta('robots', 'noindex, nofollow');
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `<section class="checkout-empty"><div><h1>Không tìm thấy sản phẩm</h1><p>${commerce.escape(message)}</p><a class="commerce-button-link" href="shop.html?sort=newest">Xem sản phẩm mới</a></div></section>`;
  };

  function ensureMeta(name, content) {
    let node = document.head.querySelector(`meta[name="${name}"]`);
    if (!node) { node = document.createElement('meta'); node.name = name; document.head.appendChild(node); }
    node.content = content;
  }

  function ensureProperty(property, content) {
    let node = document.head.querySelector(`meta[property="${property}"]`);
    if (!node) { node = document.createElement('meta'); node.setAttribute('property', property); document.head.appendChild(node); }
    node.content = content;
  }

  function setCanonical(url) {
    let link = document.head.querySelector('link[rel="canonical"]');
    if (!link) { link = document.createElement('link'); link.rel = 'canonical'; document.head.appendChild(link); }
    link.href = url;
  }

  function absolute(url) {
    try { return new URL(url, root.location.href).href; } catch { return url; }
  }

  function updateStructuredData(variantList, current) {
    const base = new URL(root.location.href);
    base.hash = '';
    if (root.location.protocol !== 'file:' && /\/product\.html$/i.test(base.pathname)) base.pathname = base.pathname.replace(/\/product\.html$/i, '/product');
    base.search = `?id=${encodeURIComponent(product.id)}`;
    const canonical = new URL(base.href);
    canonical.searchParams.set('slug', product.slug || product.id);
    const description = product.seo?.description || product.description || `${product.title} từ Sally Kids.`;
    document.title = product.seo?.title || `${product.title} | Sally Kids`;
    setCanonical(canonical.href);
    ensureMeta('description', description.slice(0, 320));
    const isPreview = query.get('preview') === 'theme' || query.get('preview') === 'product';
    const indexable = product.status === 'Active' && !product.seo?.noindex && !isPreview && product.id !== 'new';
    ensureMeta('robots', indexable ? 'index,follow' : 'noindex,follow');
    const urlFor = variant => {
      const linkUrl = new URL(base.href);
      linkUrl.searchParams.set('slug', product.slug || product.id);
      if (variant?.id) linkUrl.searchParams.set('variant', variant.id);
      return linkUrl.href;
    };
    const offer = variant => ({
      '@type': 'Offer', url: urlFor(variant), priceCurrency: commerce.currency || 'USD', price: (variant.price / (10 ** (regional?.CURRENCIES?.[commerce.currency || 'USD']?.decimals ?? 2))).toFixed(regional?.CURRENCIES?.[commerce.currency || 'USD']?.decimals ?? 2),
      availability: variant.stock > 0 ? 'https://schema.org/InStock' : 'https://schema.org/OutOfStock', itemCondition: 'https://schema.org/NewCondition'
    });
    const media = mediaFor(product, current);
    const imageUrl = absolute(media[0] || commerce.image(product.image));
    ensureProperty('og:type', 'product');
    ensureProperty('og:site_name', 'Sally Kids');
    ensureProperty('og:title', document.title);
    ensureProperty('og:description', description.slice(0, 320));
    ensureProperty('og:url', canonical.href);
    ensureProperty('og:image', imageUrl);
    ensureProperty('og:image:alt', product.imageAlt || product.title);
    ensureProperty('product:price:amount', ((current?.price ?? product.price) / (10 ** (regional?.CURRENCIES?.[commerce.currency || 'USD']?.decimals ?? 2))).toFixed(regional?.CURRENCIES?.[commerce.currency || 'USD']?.decimals ?? 2));
    ensureProperty('product:price:currency', commerce.currency || 'USD');
    ensureMeta('twitter:card', 'summary_large_image');
    ensureMeta('twitter:title', document.title);
    ensureMeta('twitter:description', description.slice(0, 320));
    ensureMeta('twitter:image', imageUrl);
    const variants = variantList.length ? variantList.map(v => ({
      '@type': 'Product', name: `${product.title} — ${commerce.variantTitle(product, v)}`, sku: v.sku || `${product.sku}-${v.id}`,
       image: media.map(absolute), offers: offer(v), url: urlFor(v)
    })) : [];
    const schema = variantList.length ? {
      '@context': 'https://schema.org', '@type': 'ProductGroup', '@id': `${base.href}#product-group`, name: product.title,
       description, image: media.map(absolute), brand: { '@type': 'Brand', name: product.brand || 'Sally Kids' }, productGroupID: product.sku || product.id,
      variesBy: commerce.optionsFor(product).map(option => `https://schema.org/${/size/i.test(option.name) ? 'size' : /colou?r/i.test(option.name) ? 'color' : 'additionalProperty'}`), hasVariant: variants
    } : {
      '@context': 'https://schema.org', '@type': 'Product', name: product.title, description, image: media.map(absolute), sku: product.sku || product.id,
       brand: { '@type': 'Brand', name: product.brand || 'Sally Kids' }, offers: offer({ id: '', price: product.price, stock: product.stock })
    };
    let script = document.head.querySelector('#productStructuredData');
    if (!script) { script = document.createElement('script'); script.id = 'productStructuredData'; script.type = 'application/ld+json'; document.head.appendChild(script); }
    script.textContent = JSON.stringify(schema).replace(/</g, '\\u003c');
  }

  function activeVariants() { return commerce.variantsFor(product); }
  function currentVariant() { return activeVariants().length ? commerce.variantFor(product, { values: selectedValues }) : null; }
  function optionImageFor(item, option, value) {
    return item?.optionImages?.[option?.id]?.[value] || '';
  }
  function variantImageFor(item, variant) {
    if (!variant) return '';
    return variant.image || variant.imageUrl || item?.variantImages?.[variant.id] || item?.variantImages?.[variant.sku] || commerce.optionsFor(item).map(option => optionImageFor(item, option, variant.values?.[option.id])).find(Boolean) || '';
  }
  const isBannerMedia = value => /(?:^|[\\/])(?:sally-kids-(?:hero|play|school)(?:-[\w]+)?|crocs-(?:hero|cozy|crocband|pokemon|ninjago)(?:-[\w]+)?)\.(?:png|jpe?g|webp|avif)(?:[?#].*)?$/i.test(String(value || ''));
  const productMediaValue = value => value && !isBannerMedia(value) ? value : '';
  function mediaFor(item, variant = null) {
    const values = [variantImageFor(item, variant), item?.image, ...(Array.isArray(item?.gallery) ? item.gallery : [])]
      .filter(productMediaValue).map(value => commerce.image(value)).filter(productMediaValue);
    return [...new Set(values)];
  }
  function attributeMarkup(item) {
    const attributes = Array.isArray(item?.attributes) ? item.attributes : [];
    if (!attributes.length) return '';
    return `<dl class="product-attributes">${attributes.map(attribute => {
      const name = attribute?.name || attribute?.label || attribute?.key || '';
      const value = attribute?.value || attribute?.content || attribute?.text || '';
      return name && value ? `<div><dt>${commerce.escape(name)}</dt><dd>${commerce.escape(value)}</dd></div>` : '';
    }).join('')}</dl>`;
  }
  function descriptionMarkup(item) {
    // Some supplier records put the rich fragment in `description` while
    // others use `descriptionHtml`; accept either shape before falling back
    // to escaped plain text.
    const html = String(item?.descriptionHtml || item?.description || '').replace(/\\u003c/gi, '<').replace(/\\u003e/gi, '>').replace(/\\u0026/gi, '&').replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    if (html && /<[a-z][\s\S]*>/i.test(html)) {
      const mediaOnly = html
        .replace(/<(?:script|style|noscript|template|iframe|object|embed|video|audio|source|picture|figure)\b[\s\S]*?<\/(?:script|style|noscript|template|iframe|object|embed|video|audio|source|picture|figure)>/gi, '')
        .replace(/<(?:img|source|track|input|button)\b[^>]*\/?>/gi, '')
        .replace(/\s+on[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/<\/?([a-z][\w:-]*)(?:\s[^>]*)?>/gi, (tag, name) => {
          const allowed = new Set(['p', 'br', 'strong', 'b', 'em', 'i', 'u', 'small', 'ul', 'ol', 'li', 'h3', 'h4', 'blockquote', 'div', 'span', 'table', 'thead', 'tbody', 'tr', 'th', 'td']);
          return allowed.has(String(name).toLowerCase()) ? (tag.startsWith('</') ? `</${String(name).toLowerCase()}>` : `<${String(name).toLowerCase()}>`) : '';
        })
        .replace(/\n{3,}/g, '\n\n').trim();
      const visible = mediaOnly.replace(/<[^>]+>/g, '').replace(/&(?:nbsp|amp|lt|gt|quot);/gi, ' ').replace(/\s+/g, '').trim();
      if (visible) return `<div class="product-rich-description">${mediaOnly}</div>`;
    }
    const text = String(item?.description || '').trim();
    if (!text) return '';
    return text.split(/\n{2,}|\r?\n/).filter(Boolean).map(part => `<p>${commerce.escape(part.trim())}</p>`).join('');
  }
  function detailMediaFor(item) {
    const MAX_DETAIL_IMAGES = 120;
    const direct = Array.isArray(item?.detailImages) ? item.detailImages : [];
    const html = String(item?.descriptionHtml || item?.description || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    const embedded = [];
    for (const match of html.matchAll(/([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/gi)) {
      const name = String(match[1] || '').toLowerCase();
      if (!['src', 'data-src', 'data-lazy-src', 'data-lazyload-src', 'data-ks-lazyload', 'data-img', 'data-image', 'data-original', 'srcset', 'data-srcset'].includes(name)) continue;
      embedded.push(...(name === 'srcset' || name === 'data-srcset' ? match[3].split(',').map(value => value.trim().split(/\s+/)[0]) : [match[3]]));
    }
    for (const match of html.matchAll(/background(?:-image)?\s*:\s*url\((?:["']?)([^)"']+)/gi)) embedded.push(match[1]);
    return [...new Set([...direct, ...embedded].filter(productMediaValue).map(value => commerce.image(value)).filter(value => productMediaValue(value) && value !== 'assets/sally-kids-product-placeholder.svg'))].slice(0, MAX_DETAIL_IMAGES);
  }
  function videoMediaFor(item) {
    return [...new Set((Array.isArray(item?.videos) ? item.videos : []).map(value => commerce.video?.(value)).filter(Boolean))].slice(0, 8);
  }
  function productUrl(item) {
    const path = root.location?.protocol === 'file:' ? 'product.html' : 'product';
    return `${path}?id=${encodeURIComponent(item.id)}&slug=${encodeURIComponent(item.slug || item.id)}`;
  }
  const foldTaxonomyText = value => String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
  function taxonomyFor(item) {
    const text = foldTaxonomyText([item?.title, item?.category, item?.type, item?.productType].join(' '));
    let category = String(item?.categoryId || '').trim();
    let type = String(item?.typeId || '').trim();
    if (!category || category === 'Thời trang trẻ em') {
      if (/bieu dien|san khau|mua|nhay|jazz|cheer|co vu|hop xuong|hip hop|khieu vu/.test(text)) category = 'performance';
      else if (/\bmu\b|\bnon\b|\bhat\b|\bcap\b|\btat\b|\bsock\b|phu kien|accessor|tui|balo|bag|giay|dep|sandal|shoe/.test(text)) category = 'accessories';
      else if (/vay|dam|chan vay|dress|skirt/.test(text)) category = 'dresses';
      else if (/quan|legging|short|pants|trousers/.test(text)) category = 'bottoms';
      else if (/\bao\b|so mi|t-shirt|shirt|jacket|coat|hoodie/.test(text)) category = 'tops';
      else if (/bo|set|ensemble|tracksuit/.test(text)) category = 'sets';
      else category = 'other';
    }
    if (!type || type === 'Thời trang trẻ em') {
      type = category;
      if (category === 'performance') type = /jazz/.test(text) ? 'performance-jazz' : /cheer|co vu/.test(text) ? 'performance-cheer' : /hip hop/.test(text) ? 'performance-hiphop' : /hop xuong/.test(text) ? 'performance-choir' : 'performance-dance';
      if (category === 'accessories') type = /\bmu\b|\bnon\b|\bhat\b|\bcap\b/.test(text) ? 'accessories-hats' : /\btat\b|\bsock\b/.test(text) ? 'accessories-socks' : /tui|balo|bag/.test(text) ? 'accessories-bags' : /giay|dep|sandal|shoe/.test(text) ? 'accessories-shoes' : 'accessories-other';
    }
    return {
      category,
      type,
      audience: item?.audience || (/be gai|girl|female/.test(text) ? 'girls' : /be trai|boy|male/.test(text) ? 'boys' : 'children'),
      occasions: Array.isArray(item?.occasions) && item.occasions.length ? item.occasions : [category === 'performance' ? 'performance' : 'everyday'],
      price: Number(item?.price || 0),
    };
  }
  function recommendationCards(items, tag = '') {
    return items.map(item => `<a class="related-card recommendation-card" href="${productUrl(item)}"><div class="related-card-image"><img data-smart-fit src="${commerce.escape(commerce.image(item.image))}" alt="${commerce.escape(item.imageAlt || item.title)}" width="520" height="693" loading="lazy" decoding="async">${tag ? `<span class="recommendation-tag">${commerce.escape(tag)}</span>` : ''}</div><h3>${commerce.escape(item.title)}</h3><p>${commerce.money(item.price)}</p></a>`).join('');
  }
  function recommendationSection(id, title, note, items, tag = '') {
    if (!items.length) return '';
    return `<section class="related-products recommendation-section recommendation-section--${id}" aria-labelledby="${id}RecommendationTitle"><div class="recommendation-heading"><div><p class="product-kicker">${commerce.escape(note)}</p><h2 id="${id}RecommendationTitle">${commerce.escape(title)}</h2></div><span class="recommendation-count">${items.length} gợi ý</span></div><div class="related-grid">${recommendationCards(items, tag)}</div></section>`;
  }
  function recommendationsFor(item) {
    const current = taxonomyFor(item);
    const candidates = (recommendationCandidates || commerce.products).filter(candidate => candidate?.id && candidate.id !== item.id && candidate.status === 'Active' && candidate.image && candidate.image !== 'assets/sally-kids-product-placeholder.svg');
    const score = (candidate, mode) => {
      const value = taxonomyFor(candidate);
      const occasionMatch = value.occasions.filter(id => current.occasions.includes(id)).length;
      const sameType = value.type === current.type;
      const sameCategory = value.category === current.category;
      const sameAudience = value.audience === current.audience || value.audience === 'children' || current.audience === 'children';
      if (mode === 'cross') {
        if (sameType && sameCategory) return -1;
        return (sameAudience ? 5 : 0) + occasionMatch * 3 + (value.category.startsWith('accessories') ? 4 : 0) + (value.type !== current.type ? 2 : 0) - Math.abs(value.price - current.price) / Math.max(current.price, 1) * 0.8;
      }
      if (mode === 'upsell') {
        if (value.price <= current.price || (!sameType && !sameCategory)) return -1;
        return (sameType ? 8 : 0) + (sameCategory ? 4 : 0) + (sameAudience ? 2 : 0) + occasionMatch - Math.abs(value.price - current.price) / Math.max(current.price, 1);
      }
      return (sameType ? 8 : 0) + (sameCategory ? 4 : 0) + (sameAudience ? 2 : 0) + occasionMatch;
    };
    const ranked = (mode, list = candidates) => list.map(candidate => ({ candidate, rank: score(candidate, mode) })).filter(row => row.rank >= 0).sort((left, right) => right.rank - left.rank || left.candidate.id.localeCompare(right.candidate.id));
    const select = (mode, limit = 4, list = candidates) => ranked(mode, list).slice(0, limit).map(row => row.candidate);
    let upsell = select('upsell');
    // Widen an empty upgrade rail to the same audience. A cheaper item is
    // never presented as an upgrade; only higher-priced products qualify.
    if (!upsell.length) {
      const higherAudience = candidates.filter(candidate => {
        const value = taxonomyFor(candidate);
        return value.price > current.price && (value.audience === current.audience || value.audience === 'children' || current.audience === 'children');
      });
      upsell = higherAudience.sort((left, right) => Number(left.price) - Number(right.price) || left.id.localeCompare(right.id)).slice(0, 4);
    }
    const recentIds = commerce.readRecentlyViewed?.() || [];
    const recentPool = [...new Map([...(recommendationCandidates || []), ...commerce.products].filter(value => value?.id).map(value => [value.id, value]).values())];
    const recent = recentIds.filter(id => id !== item.id).map(id => recentPool.find(candidate => candidate.id === id)).filter(Boolean).slice(0, 4);
    return { cross: select('cross'), upsell, similar: select('similar'), recent };
  }
  function renderPreservingScroll() {
    const scrollY = Number(root.scrollY || root.pageYOffset || 0);
    render();
    if (scrollY > 0 && typeof root.scrollTo === 'function') {
      try { root.scrollTo({ top: scrollY, left: 0, behavior: 'auto' }); } catch { root.scrollTo(0, scrollY); }
    }
  }
  async function hydrateRecommendationCandidates() {
    if (recommendationCandidates || recommendationHydrationFlight || !commerce.loadCatalogPage || !product) return recommendationHydrationFlight;
    const current = product;
    const taxonomy = taxonomyFor(current);
    const requests = [{ category: [taxonomy.category] }];
    // Accessories are the most useful cross-sell companion for a clothing
    // item. Load their small facet separately so the main catalog request
    // stays light while the rail can still suggest hats, belts or bags.
    if (taxonomy.category !== 'accessories') requests.push({ category: ['accessories'] });
    if (taxonomy.audience && taxonomy.audience !== 'children') requests.push({ audience: [taxonomy.audience] });
    recommendationHydrationFlight = Promise.allSettled(requests.map(options => commerce.loadCatalogPage({ ...options, limit: 24, sort: 'featured' })))
      .then(results => {
        const remote = results.flatMap(result => result.status === 'fulfilled' ? result.value.products || [] : []);
        const merged = new Map([...commerce.products, ...remote].filter(item => item?.id).map(item => [item.id, item]));
        recommendationCandidates = [...merged.values()];
        if (product === current) renderPreservingScroll();
      })
      .catch(() => { recommendationCandidates = [...commerce.products]; })
      .finally(() => { recommendationHydrationFlight = null; });
    return recommendationHydrationFlight;
  }
  async function hydrateRecentProducts() {
    if (recentHydrationFlight || !commerce.loadProducts) return recentHydrationFlight;
    const ids = (commerce.readRecentlyViewed?.() || []).filter(id => id !== product?.id).slice(0, 6);
    const missing = ids.filter(id => !commerce.product?.(id));
    if (!missing.length) return null;
    recentHydrationFlight = commerce.loadProducts(missing).catch(() => []).finally(() => { recentHydrationFlight = null; });
    await recentHydrationFlight;
    if (product) renderPreservingScroll();
    return null;
  }
  function displayPrice(current) {
    if (current) return commerce.money(current.price);
    const variants = activeVariants();
    if (!variants.length) return commerce.money(product.price);
    const min = Math.min(...variants.map(v => v.price));
    const max = Math.max(...variants.map(v => v.price));
    return `${commerce.money(min)}${max > min ? ` – ${commerce.money(max)}` : ''}`;
  }
  function optionMarkup() {
    return commerce.optionsFor(product).map(option => `<fieldset class="variant-option-group"><legend>${commerce.escape(option.name)}</legend><div class="size-grid" role="group" aria-label="${t('selectSize', `Choose ${commerce.escape(option.name)}`)}">${option.values.map(value => {
      const values = { ...selectedValues, [option.id]: value };
      const variant = commerce.variantFor(product, { values });
      const disabled = !variant || variant.stock < 1;
      const image = optionImageFor(product, option, value);
      return `<button class="size-option${image ? ' size-option--image' : ''}${selectedValues[option.id] === value ? ' is-selected' : ''}" type="button" data-option-id="${commerce.escape(option.id)}" data-option-value="${commerce.escape(value)}" aria-pressed="${selectedValues[option.id] === value}" ${disabled ? 'disabled' : ''}>${image ? `<img data-smart-fit src="${commerce.escape(commerce.image(image))}" alt="" width="42" height="42" loading="lazy" decoding="async">` : ''}<span>${commerce.escape(value)}</span></button>`;
    }).join('')}</div></fieldset>`).join('');
  }

  function render() {
    if (!product) return renderMissing();
    const variants = activeVariants();
    if (variants.length) {
      const requestedVariant = commerce.variantFor(product, query.get('variant') || '');
      const selectedVariant = Object.keys(selectedValues).length ? commerce.variantFor(product, { values: selectedValues }) : null;
      const fallback = selectedVariant || requestedVariant || variants[0];
      selectedValues = { ...(fallback?.values || {}) };
    } else {
      const sizes = commerce.sizesFor(product);
      selectedSize = selectedSize && sizes.includes(selectedSize) ? selectedSize : sizes[0];
    }
    const current = currentVariant();
    const sizeValues = commerce.sizesFor(product);
    const media = mediaFor(product, current);
    selectedMediaIndex = Math.min(Math.max(0, selectedMediaIndex), Math.max(0, media.length - 1));
    const detailImages = detailMediaFor(product);
    const videos = videoMediaFor(product);
    const description = `${descriptionMarkup(product)}${!videos.length && /^1688-/i.test(String(product.sku || '')) ? '<p class="product-media-note">Video sản phẩm chưa có dữ liệu xác minh từ nhà cung cấp.</p>' : ''}`;
    const recommendations = recommendationsFor(product);
    updateStructuredData(variants, current);
    main.setAttribute('aria-busy', 'false');
    main.innerHTML = `
      <div class="product-breadcrumbs"><a href="index.html">${t('home', 'Home')}</a><span aria-hidden="true"> / </span><a href="index.html#new-arrivals">${t('newArrivals', 'New arrivals')}</a><span aria-hidden="true"> / </span><span>${commerce.escape(product.title)}</span></div>
      <section class="product-detail" aria-labelledby="productTitle">
        <div class="product-gallery">
          <div class="product-gallery-viewport product-hero-image" id="productGallery" tabindex="0" role="region" aria-roledescription="carousel" aria-label="Product images">
            <div class="product-gallery-track">
              ${media.map((src, index) => `<figure class="product-gallery-slide" data-gallery-slide="${index}" aria-label="Image ${index + 1} of ${media.length}"><img${index === 0 ? ' id="productHeroImage" fetchpriority="high"' : ''} data-smart-fit src="${commerce.escape(src)}" alt="${commerce.escape(product.imageAlt || product.title)} — image ${index + 1}" width="900" height="1200" loading="${index === 0 ? 'eager' : 'lazy'}" decoding="async" draggable="false"></figure>`).join('')}
            </div>
            ${media.length > 1 ? `<button class="product-gallery-control product-gallery-control--prev" type="button" data-gallery-prev aria-label="Previous product image">‹</button><button class="product-gallery-control product-gallery-control--next" type="button" data-gallery-next aria-label="Next product image">›</button>` : ''}
          </div>
          ${media.length > 1 ? `<div class="product-gallery-status" aria-live="polite"><span data-gallery-current>${selectedMediaIndex + 1}</span><span aria-hidden="true"> / </span><span>${media.length}</span></div><div class="product-thumbnails" role="list" aria-label="Product images">${media.map((src, index) => `<button type="button" class="product-thumbnail${index === selectedMediaIndex ? ' is-selected' : ''}" data-gallery-index="${index}" aria-label="View product image ${index + 1}"${index === selectedMediaIndex ? ' aria-current="true"' : ''}><img data-smart-fit src="${commerce.escape(src)}" alt="" width="90" height="120" loading="lazy" decoding="async" draggable="false"></button>`).join('')}</div>` : ''}
          <p class="product-gallery-note">Product code ${commerce.escape(current?.sku || product.sku || product.id)}${media.length > 1 ? ` · ${media.length} ảnh sản phẩm` : ''}</p>
        </div>
        <div class="product-copy">
           <p class="product-kicker">${commerce.escape(product.brand || product.category || 'Sally Kids')}</p>
          <h1 id="productTitle">${commerce.escape(product.title)}</h1>
          <p class="product-price" aria-live="polite">${displayPrice(current)}</p>
          <p class="product-description">${commerce.escape(product.description || 'Lightweight comfort. Made for everyday adventures.')}</p>
          <div class="product-meta" aria-label="${t('productDetails', 'Product details')}">
            <div class="product-meta-row"><span>${t('selected', 'Selected')}</span><strong>${commerce.escape(current ? commerce.variantTitle(product, current) : product.colour || 'As pictured')}</strong></div>
            <div class="product-meta-row"><span>${t('availability', 'Availability')}</span><strong>${current ? (current.stock > 0 ? `${current.stock} ready to ship` : t('outOfStock', 'Out of stock')) : (product.stock > 0 ? `${product.stock} ready to ship` : t('outOfStock', 'Out of stock'))}</strong></div>
          </div>
          <form id="productForm">
            ${variants.length ? optionMarkup() : `<fieldset class="variant-option-group"><legend>${t('selectSize', 'UK size')}</legend><div class="size-grid" id="sizeOptions" role="group" aria-label="${t('selectSize', 'Choose a UK size')}">${sizeValues.map(size => `<button class="size-option${size === selectedSize ? ' is-selected' : ''}" type="button" data-size="${commerce.escape(size)}" aria-pressed="${size === selectedSize}">${commerce.escape(size)}</button>`).join('')}</div></fieldset>`}
            <label class="commerce-form-label" for="quantityValue">${t('quantity', 'Quantity')}</label>
            <div class="quantity-control" aria-label="Quantity selector">
              <button type="button" data-quantity="decrease" aria-label="Decrease quantity">−</button><span class="quantity-value" id="quantityValue">${quantity}</span><button type="button" data-quantity="increase" aria-label="Increase quantity">+</button>
            </div>
            <button class="commerce-primary" type="submit" ${((current ? current.stock : product.stock) < 1 || (variants.length && !current)) ? 'disabled' : ''}>${(current ? current.stock : product.stock) < 1 ? t('outOfStock', 'Out of stock') : t('addToBag', 'Add to bag')}</button>
          </form>
          <p class="shipping-note">${t('freeDelivery', 'Free standard delivery on orders over {amount}. This storefront is a demo; no payment is taken.', { amount: commerce.money(regional?.convert?.(5000) || 5000) })}</p>
        </div>
      </section>
      ${description || detailImages.length || videos.length || attributeMarkup(product) ? `<section class="product-information" aria-labelledby="productInformationTitle"><div class="product-information-copy"><p class="product-kicker">${t('productDetails', 'Product details')}</p><h2 id="productInformationTitle">${t('productDetails', 'Product details')}</h2>${description}${attributeMarkup(product)}</div>${videos.length ? `<div class="product-video-media"><div class="product-detail-media-heading"><strong>Video sản phẩm</strong><span>${videos.length} video đã xác minh</span></div><div class="product-video-list" aria-label="Video sản phẩm">${videos.map((src, index) => `<figure><video controls preload="none" playsinline poster="${commerce.escape(media[0] || '')}" aria-label="${commerce.escape(product.title)} — video ${index + 1}"><source src="${commerce.escape(src)}" type="video/mp4">Trình duyệt của bạn không hỗ trợ video.</video><figcaption>Video sản phẩm ${index + 1}</figcaption></figure>`).join('')}</div></div>` : ''}${detailImages.length ? `<div class="product-detail-media"><div class="product-detail-media-heading"><strong>Hình ảnh mô tả chi tiết</strong><span>${detailImages.length} ảnh từ nhà cung cấp</span></div><div class="product-detail-images" aria-label="Detailed product images">${detailImages.map((src, index) => `<img class="product-detail-image" src="${commerce.escape(src)}" alt="${commerce.escape(product.title)} — ảnh chi tiết ${index + 1}" width="900" loading="lazy" decoding="async">`).join('')}</div></div>` : ''}</section>` : ''}
       ${recommendationSection('cross', 'Phối cùng outfit', 'Bán chéo thông minh', recommendations.cross, 'Phối cùng')}
       ${recommendationSection('upsell', 'Nâng cấp outfit', 'Gợi ý cao hơn', recommendations.upsell, 'Nâng cấp')}
       ${recommendationSection('recent', 'Bạn vừa xem', 'Lịch sử của bé', recommendations.recent)}
       ${!recommendations.cross.length && !recommendations.upsell.length && !recommendations.recent.length ? recommendationSection('similar', 'Có thể bé sẽ thích', 'Gợi ý tương tự', recommendations.similar) : ''}`;
    bind();
    commerce.enhanceImages?.(main);
  }

  function refreshQuantity() { const value = main.querySelector('#quantityValue'); if (value) value.textContent = String(quantity); }
  function syncVariantUrl(variant) {
    const next = new URL(root.location.href);
    if (variant?.id) next.searchParams.set('variant', variant.id); else next.searchParams.delete('variant');
    root.history.replaceState(null, '', next.href);
    updateStructuredData(activeVariants(), variant);
  }
  function bind() {
    const gallery = main.querySelector('#productGallery');
    const slides = [...main.querySelectorAll('[data-gallery-slide]')];
    const thumbnails = [...main.querySelectorAll('[data-gallery-index]')];
    const syncGalleryState = () => {
      slides.forEach((slide, index) => slide.setAttribute('aria-hidden', String(index !== selectedMediaIndex)));
      thumbnails.forEach(item => {
        const active = Number(item.dataset.galleryIndex) === selectedMediaIndex;
        item.classList.toggle('is-selected', active);
        if (active) item.setAttribute('aria-current', 'true'); else item.removeAttribute('aria-current');
      });
      const current = main.querySelector('[data-gallery-current]');
      if (current) current.textContent = String(selectedMediaIndex + 1);
    };
    const goToGalleryIndex = (index, smooth = true) => {
      if (!slides.length) return;
      selectedMediaIndex = (index + slides.length) % slides.length;
      const target = slides[selectedMediaIndex];
      const reduceMotion = root.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
      if (gallery && target) gallery.scrollTo({ left: target.offsetLeft, behavior: smooth && !reduceMotion ? 'smooth' : 'auto' });
      syncGalleryState();
    };
    thumbnails.forEach(button => button.addEventListener('click', () => goToGalleryIndex(Number(button.dataset.galleryIndex) || 0)));
    main.querySelector('[data-gallery-prev]')?.addEventListener('click', () => goToGalleryIndex(selectedMediaIndex - 1));
    main.querySelector('[data-gallery-next]')?.addEventListener('click', () => goToGalleryIndex(selectedMediaIndex + 1));
    let galleryFrame = 0;
    gallery?.addEventListener('scroll', () => {
      if (!slides.length || !gallery.clientWidth) return;
      if (galleryFrame) return;
      galleryFrame = window.requestAnimationFrame(() => {
        galleryFrame = 0;
        const index = Math.max(0, Math.min(slides.length - 1, Math.round(gallery.scrollLeft / gallery.clientWidth)));
        if (index !== selectedMediaIndex) { selectedMediaIndex = index; syncGalleryState(); }
      });
    }, { passive: true });
    gallery?.addEventListener('keydown', event => {
      if (event.key === 'ArrowLeft') { event.preventDefault(); goToGalleryIndex(selectedMediaIndex - 1); }
      if (event.key === 'ArrowRight') { event.preventDefault(); goToGalleryIndex(selectedMediaIndex + 1); }
      if (event.key === 'Home') { event.preventDefault(); goToGalleryIndex(0); }
      if (event.key === 'End') { event.preventDefault(); goToGalleryIndex(slides.length - 1); }
    });
    goToGalleryIndex(selectedMediaIndex, false);
    main.querySelectorAll('[data-option-id]').forEach(button => button.addEventListener('click', () => {
      selectedValues[button.dataset.optionId] = button.dataset.optionValue;
      selectedMediaIndex = 0;
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
      // The clean product route can be server-rendered with a compact product
      // payload. Hydrating it avoids a duplicate network round trip while the
      // API/RPC path remains the fallback for direct static HTML visits.
      if (bootstrappedProduct?.id === requestedId) {
        product = commerce.hydrateProduct(bootstrappedProduct);
      } else product = await commerce.loadProduct(requestedId);
      commerce.rememberRecentlyViewed?.(product.id);
      render();
      hydrateRecentProducts();
      hydrateRecommendationCandidates();
    } catch (error) { renderMissing(error.message); }
  })();
  root.addEventListener('crocs:catalog', event => {
    if (product && event.detail?.products) {
      const next = event.detail.products.find(item => item.id === product.id);
      // A list refresh must not replace loaded SKU/media with a summary row.
      product = next?._detailLoaded ? next : commerce.localizeProduct(product);
      render();
    }
  });
  root.addEventListener('crocs:language-change', () => { if (product) render(); });
})(window);
