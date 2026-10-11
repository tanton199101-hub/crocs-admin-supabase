(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Crocs1688 = api;
})(typeof window === 'undefined' ? globalThis : window, function () {
  'use strict';

  const FALLBACK_IMAGE = 'assets/arrival-classic-clog-100.png';
  // 1688 offers can expose more than the three thumbnails returned by the
  // shop-list endpoint (the offer currently used in the admin has 22). Keep
  // generous, explicit ceilings so verified supplier media is not silently
  // truncated while still bounding a malformed payload.
  const MAX_GALLERY_IMAGES = 50;
  const MAX_DETAIL_IMAGES = 120;
  const MAX_VIDEOS = 8;
  const IMAGE_HOSTS = Object.freeze(new Set([
    'cbu01.alicdn.com', 'gw.alicdn.com', 'img.alicdn.com', 'itemcdn.tmall.com',
    'img01.1688.com', 'img02.1688.com',
  ]));
  const ALICDN_HOST_RE = /(?:^|\.)alicdn\.com$/i;
  const VIDEO_HOSTS = Object.freeze(new Set([
    'cloud.video.taobao.com', 'video01.1688.com', 'video.1688.com', 'caiyuanbao.alicdn.com',
  ]));
  const VIDEO_HOST_RE = /(?:^|\.)video\.(?:taobao|1688|alibaba)\.com$/i;
  const IMAGE_PROXY_PATH = '/api/1688-image';
  const VIDEO_PROXY_PATH = '/api/1688-video';
  const OFFER_RE = /(?:^|\/)offer\/(\d{6,20})(?:\.html)?(?:\/|$)/i;
  const SHOP_HOST_RE = /(?:^|\.)1688\.com$/i;
  const MTOP_ENDPOINT = 'https://h5api.m.1688.com/h5/mtop.alibaba.alisite.cbu.server.moduleasyncservice/1.0/';
  const MTOP_APP_KEY = '12574478';
  // The mobile offer page loads its verified SKU matrix through this public
  // MTop service.  It is deliberately kept separate from the shop-list
  // endpoint above because the two APIs use different request payloads.
  const OFFER_DETAIL_MTOP_ENDPOINT = 'https://h5api.m.1688.com/h5/mtop.mbox.fc.common.gateway/1.0/';
  const OFFER_DETAIL_MTOP_API = 'mtop.mbox.fc.common.gateway';
  // The supplier catalog contains products with more than the original UI
  // limit of 100 combinations (for example 17 colours x 8 heights).  Keep a
  // bounded ceiling for imported data, while allowing the verified supplier
  // matrix to be preserved intact.
  const MAX_IMPORT_VARIANTS = 500;
  const TRANSLATE_ENDPOINT = 'https://clients5.google.com/translate_a/t';
  const TRANSLATE_VALUES_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
  const DEFAULT_SHOP_MEMBER_ID = 'b2b-305059698170e97';
  const DEFAULT_SHOP_NAME = '湖州简百服饰有限公司';
  const KNOWN_TITLES = Object.freeze({
    '837842260799': "Girls' Trendy Jazz Dance Performance Costume – Hip-Hop Street Dance Group Outfit for Kids",
  });

  const clean = (value, max = 500) => String(value ?? '').trim().slice(0, max);
  function normalizeImageReference(value) {
    return decodeEntities(String(value ?? ''))
      .replace(/\\u002f/gi, '/')
      .replace(/\\\//g, '/')
      .replace(/\\"/g, '"')
      .replace(/^\s*url\(\s*["']?/i, '')
      .replace(/["']?\s*\)\s*$/i, '')
      .trim()
      .replace(/[<>;,]+$/g, '');
  }
  function allowedImageHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return IMAGE_HOSTS.has(host) || ALICDN_HOST_RE.test(host);
  }

  function allowedVideoHost(hostname) {
    const host = String(hostname || '').toLowerCase();
    return VIDEO_HOSTS.has(host) || VIDEO_HOST_RE.test(host);
  }

  function remoteVideoUrl(value) {
    const raw = clean(normalizeImageReference(value), 4000);
    if (!raw) return '';
    const candidate = raw.startsWith('//') ? `https:${raw}` : raw;
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || !allowedVideoHost(url.hostname)) return '';
      if (!/^\/(?:play|video|download)\//i.test(url.pathname) && url.hostname.toLowerCase() !== 'caiyuanbao.alicdn.com') return '';
      if (!/\.mp4(?:$|[?#])/i.test(url.pathname + url.search)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function proxyVideoUrl(value) {
    const direct = remoteVideoUrl(value);
    return direct ? `${VIDEO_PROXY_PATH}?url=${encodeURIComponent(direct)}` : '';
  }

  function videoUrl(value, { proxy = false } = {}) {
    const raw = clean(normalizeImageReference(value), 4000);
    if (!raw) return '';
    try {
      const parsed = new URL(raw, 'https://store.invalid');
      if (parsed.origin === 'https://store.invalid' && parsed.pathname === VIDEO_PROXY_PATH) {
        const source = remoteVideoUrl(parsed.searchParams.get('url'));
        return source ? `${VIDEO_PROXY_PATH}?url=${encodeURIComponent(source)}` : '';
      }
    } catch { /* fall through to the remote URL parser */ }
    const direct = remoteVideoUrl(raw);
    return direct ? (proxy ? proxyVideoUrl(direct) : direct) : '';
  }

  function collectVideoUrls(value, output = [], seen = new Set(), depth = 0) {
    if (depth > 8 || value == null || output.length >= MAX_VIDEOS) return output;
    if (typeof value === 'string') {
      const text = decodeEntities(value).replace(/\\\//g, '/');
      const candidates = text.match(/https?:\/\/[^\s"'<>\\]+/gi) || [text];
      candidates.forEach(candidate => {
        const normalized = candidate.replace(/[\\"']+$/g, '');
        const parsed = videoUrl(normalized);
        if (parsed && !seen.has(parsed)) { seen.add(parsed); output.push(parsed); }
      });
      return output;
    }
    if (Array.isArray(value)) {
      value.forEach(item => collectVideoUrls(item, output, seen, depth + 1));
      return output;
    }
    if (typeof value !== 'object') return output;
    Object.entries(value).forEach(([key, item]) => {
      if (output.length >= MAX_VIDEOS) return;
      // Video fields are preferred, but validating every string URL also
      // catches older payloads that used an unnamed `media` field.
      if (/video|media|movie|play/i.test(key) || typeof item === 'string') collectVideoUrls(item, output, seen, depth + 1);
      else if (item && typeof item === 'object') collectVideoUrls(item, output, seen, depth + 1);
    });
    return output;
  }
  function remoteImageUrl(value) {
    const raw = clean(normalizeImageReference(value), 4000);
    if (!raw) return '';
    const candidate = raw.startsWith('//') ? `https:${raw}` : raw;
    try {
      const url = new URL(candidate);
      if (url.protocol !== 'https:' || !allowedImageHost(url.hostname)) return '';
      return url.href;
    } catch {
      return '';
    }
  }

  function proxyImageUrl(value) {
    const direct = remoteImageUrl(value);
    if (!direct || /^\/1688offer\//i.test(new URL(direct).pathname)) return '';
    return direct ? `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(direct)}` : '';
  }

  function imageUrl(value, { proxy = false } = {}) {
    const raw = clean(normalizeImageReference(value), 4000);
    if (!raw) return '';
    // Keep already-proxied URLs idempotent. They are same-origin paths and
    // are safe to persist in the validated store state.
    try {
      const parsed = new URL(raw, 'https://store.invalid');
      if (parsed.origin === 'https://store.invalid' && parsed.pathname === IMAGE_PROXY_PATH) {
        return remoteImageUrl(parsed.searchParams.get('url')) ? `${IMAGE_PROXY_PATH}?url=${encodeURIComponent(remoteImageUrl(parsed.searchParams.get('url')))}` : '';
      }
    } catch { /* fall through to the remote URL parser */ }
    const direct = remoteImageUrl(raw);
    if (!direct || /^\/1688offer\//i.test(new URL(direct).pathname)) return '';
    return direct ? (proxy ? proxyImageUrl(direct) : direct) : '';
  }

  function offerImages(offer = {}) {
    const values = Array.isArray(offer?.offerImages) ? offer.offerImages : [];
    return [...new Set(values.map(item => item?.fullPathImageURI || item?.imgUrl || item?.imageURI || item?.size310x310ImageURI || item?.size220x220ImageURI)
      .map(value => {
        const raw = clean(value, 2000);
        if (!raw) return '';
        return imageUrl(raw.startsWith('http') || raw.startsWith('//') ? raw : `https://cbu01.alicdn.com/${raw.replace(/^\/+/, '')}`);
      })
      .filter(Boolean))].slice(0, MAX_GALLERY_IMAGES);
  }

  function extractJsonObject(source, marker) {
    const start = String(source || '').indexOf(marker);
    if (start < 0) return '';
    const open = String(source || '').indexOf('{', start);
    if (open < 0) return '';
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = open; index < source.length; index += 1) {
      const char = source[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '{') depth += 1;
      if (char === '}' && --depth === 0) return source.slice(open, index + 1);
    }
    return '';
  }

  function extractJsonArray(source, marker) {
    const input = String(source || '');
    const start = input.indexOf(marker);
    if (start < 0) return '';
    const open = input.indexOf('[', start);
    if (open < 0) return '';
    let depth = 0;
    let quoted = false;
    let escaped = false;
    for (let index = open; index < input.length; index += 1) {
      const char = input[index];
      if (quoted) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') quoted = false;
        continue;
      }
      if (char === '"') { quoted = true; continue; }
      if (char === '[') depth += 1;
      if (char === ']' && --depth === 0) return input.slice(open, index + 1);
    }
    return '';
  }

  function decodeEntities(value) {
    return String(value || '')
      .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
      .replace(/&#x([\da-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)))
      .replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<')
      .replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'");
  }

  function srcsetValues(value) {
    return String(value || '').split(',').map(item => item.trim().split(/\s+/)[0]).filter(Boolean);
  }

  // 1688 has used several lazy-loading attributes over time. Extract them
  // consistently for both the detail-image list and persisted HTML.
  function htmlImageCandidates(value) {
    const html = String(value || '').replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    const candidates = [];
    const attributeRe = /([\w-]+)\s*=\s*(["'])([\s\S]*?)\2/gi;
    for (const match of html.matchAll(attributeRe)) {
      const name = String(match[1] || '').toLowerCase();
      if (!['src', 'data-src', 'data-lazy-src', 'data-lazyload-src', 'data-ks-lazyload', 'data-img', 'data-image', 'data-original', 'srcset', 'data-srcset'].includes(name)) continue;
      candidates.push(...(name === 'srcset' || name === 'data-srcset' ? srcsetValues(match[3]) : [match[3]]));
    }
    for (const match of html.matchAll(/background(?:-image)?\s*:\s*url\(\s*["']?([^\)"']+)/gi)) candidates.push(match[1]);
    // Some payloads contain escaped CDN URLs in JSON rather than rendered
    // attributes. Limit this fallback to image-looking paths.
    for (const match of html.matchAll(/https?:\\?\/\\?\/(?:[^"'\\s<>]|\\.)+/gi)) {
      const candidate = normalizeImageReference(match[0]).replace(/[\\"']+$/g, '');
      if (/\.(?:avif|gif|jpe?g|png|webp|svg)(?:[?#_]|$)/i.test(candidate) || /\/img(?:extra|bank)\//i.test(candidate)) candidates.push(candidate);
    }
    return candidates;
  }

  /**
   * Reduce the public m.1688 offer HTML into the fields that can be merged
   * into a product.  The mobile page contains an inline `window.__INIT_DATA`
   * object even when the desktop page is protected by a CAPTCHA.  This
   * parser intentionally reads only that official page payload; it does not
   * execute page scripts or attempt to solve/bypass a challenge.
   */
  function parseMobileOfferDocument(text) {
    const source = String(text || '');
    const objectText = extractJsonObject(source, 'window.__INIT_DATA');
    if (!objectText) throw new Error('Trang offer mobile 1688 không có __INIT_DATA.');
    let init;
    try { init = JSON.parse(objectText); }
    catch (error) { throw new Error(`Không đọc được __INIT_DATA của 1688: ${error.message}`); }

    const asObject = value => {
      if (!value || typeof value !== 'object') return {};
      if (Array.isArray(value)) return {};
      return value;
    };
    const components = Object.values(asObject(init.data)).map(item => asObject(item?.data));
    const main = components.find(item => Array.isArray(item.offerImgList) || Array.isArray(item.offerImages)) || {};
    const description = components.find(item => item.detailUrl) || {};
    const attributeBlock = components.find(item => Array.isArray(item.propsList)) || {};
    const globalData = asObject(init.globalData);
    const tempModel = asObject(globalData.tempModel);
    const shareModel = asObject(globalData.shareModel);
    const detailModel = asObject(globalData.detailModel);
    const offerInfo = asObject(main.offerInfoModel);
    const offerId = clean(main.offerId || offerInfo.offerId || tempModel.offerId || detailModel.offerId || globalData.offerBaseInfo?.offerId, 30);
    const title = clean(offerInfo.title || tempModel.offerTitle || shareModel.subject || globalData.blackPage?.offerTitle, 500);
    const galleryCandidates = [
      ...(Array.isArray(main.offerImgList) ? main.offerImgList : []),
      ...(Array.isArray(main.offerImages) ? main.offerImages.map(item => item?.imgUrl || item?.imageURI || item) : []),
      shareModel.picUrl,
      tempModel.defaultOfferImg,
    ];
    const skuImages = (Array.isArray(main.skuImages) ? main.skuImages : [])
      .map(item => ({
        name: clean(item?.name, 160),
        image: imageUrl(item?.imgUrl || item?.imageURI || item),
      }))
      .filter(item => item.image);
    const mobileSkuProps = Array.isArray(main.skuProps)
      ? main.skuProps
      : Array.isArray(main.skuModel?.skuProps) ? main.skuModel.skuProps : [];
    const optionImages = Object.fromEntries(mobileSkuProps.map(prop => {
      const name = clean(prop?.prop || prop?.name || prop?.propName, 80);
      const values = Object.fromEntries(listValues(prop?.value || prop?.values).map(value => {
        const valueName = clean(value?.name || value?.value || value?.valueName || value, 80);
        const image = imageUrl(imageValue(value));
        return valueName && image ? [valueName, image] : null;
      }).filter(Boolean));
      return name && Object.keys(values).length ? [name, values] : null;
    }).filter(Boolean));
    const gallery = [...new Set([...galleryCandidates, ...skuImages.map(item => item.image)].map(imageUrl).filter(Boolean))].slice(0, MAX_GALLERY_IMAGES);
    const inlineSkuModel = [
      main.skuModel,
      globalData.skuModel,
      globalData.skuModelOrigin,
      globalData.offerDetail?.skuModel,
    ].find(item => item && typeof item === 'object' && (item.skuProps || item.skuInfoMapOriginal || item.skuInfoMap));
    const inlineOrderModel = globalData.orderParamModel || globalData.offerDetail?.orderParamModel || {};
    const priceText = offerInfo.price || tempModel.price || globalData.shareModel?.extMap?.itemPriceYuan || '';
    const priceMatch = String(priceText).match(/[0-9]+(?:\.[0-9]+)?/);
    const attributes = normalizeAttributes(attributeBlock.propsList || globalData.blackPage?.property?.propsList);
    const descriptionUrl = normalizeDescriptionUrl(description.detailUrl || detailModel.detailUrl);
    const videos = collectVideoUrls([
      main.videoUrl, main.video, main.offerVideo, main.videoInfo, main.offerInfoModel?.videoUrl,
      offerInfo.videoUrl, tempModel.videoUrl, detailModel.videoUrl, globalData.videoUrl,
      globalData.offerDetail?.videoUrl, globalData.offerDetail?.video, init,
    ]).slice(0, MAX_VIDEOS);
    return {
      offerId,
      title,
      gallery,
      skuImages,
      optionImages,
      videos,
      descriptionUrl,
      attributes,
      priceCny: priceMatch ? Number(priceMatch[0]) : 0,
      // Some older mobile pages inline the SKU model.  Keep it available to
      // the caller, while newer pages obtain the same model from MTop.
      ...(inlineSkuModel ? { skuModel: inlineSkuModel, orderParamModel: inlineOrderModel } : {}),
    };
  }

  /**
   * Read the reduced, public desktop offer payload. The desktop page embeds
   * `gallery.fields.offerImgList` and `description.fields.detailUrl` even
   * when the detail HTML itself requires a signed/session request. This lets
   * an authenticated browser export restore the complete gallery without
   * scraping arbitrary page markup.
   */
  function parseDesktopOfferDocument(text) {
    const source = decodeEntities(String(text || '')).replace(/\\u002f/gi, '/').replace(/\\\//g, '/');
    const arrayMarkers = ['"offerImgList"', 'offerImgList', '"mainImage"', 'mainImage', '"imageList"', 'imageList'];
    let galleryValues = [];
    for (const marker of arrayMarkers) {
      const arrayText = extractJsonArray(source, marker);
      if (!arrayText) continue;
      try {
        const parsed = JSON.parse(arrayText);
        if (Array.isArray(parsed) && parsed.length) { galleryValues = parsed; break; }
      } catch {
        // The surrounding desktop document may use HTML entities; fall back
        // to the URL extractor below rather than failing the whole import.
      }
    }
    if (!galleryValues.length) galleryValues = htmlImageCandidates(source);
    const gallery = [...new Set(galleryValues.map(item => item?.fullPathImageURI || item?.imageURI || item?.imgUrl || item).map(imageUrl).filter(Boolean))].slice(0, MAX_GALLERY_IMAGES);
    const detailMatch = source.match(/(?:["']detailUrl["']|detailUrl)\s*:\s*["'](https?:\\?\/\\?\/itemcdn\.tmall\.com\/1688offer\/[^"']+)["']/i);
    const titleMatch = source.match(/(?:["'](?:subject|title)["']|(?:subject|title))\s*:\s*["']([^"']{3,500})["']/i);
    const offerMatch = source.match(/(?:["']offerId["']|offerId)\s*:\s*["']?(\d{6,20})/i);
    const videos = collectVideoUrls(source.match(/(?:https?:)?\/\/[^"'<>\\\s]+(?:\.mp4(?:\?[^"'<>\\\s]*)?|video[^"'<>\\\s]*)/gi) || []).slice(0, MAX_VIDEOS);
    return {
      offerId: clean(offerMatch?.[1], 30),
      title: clean(titleMatch?.[1], 500),
      gallery,
      videos,
      descriptionUrl: normalizeDescriptionUrl(detailMatch?.[1]?.replace(/\\\//g, '/')),
    };
  }

  function parseDescriptionDocument(text) {
    const source = String(text || '');
    const objectText = extractJsonObject(source, 'offer_details');
    let content = '';
    if (objectText) {
      try { content = JSON.parse(objectText).content || ''; } catch { content = ''; }
    }
    const html = String(content || source);
    const images = [...new Set(htmlImageCandidates(html).map(value => imageUrl(value.startsWith('//') ? `https:${value}` : value, { proxy: true })).filter(Boolean))].slice(0, MAX_DETAIL_IMAGES);
    const videos = collectVideoUrls([
      html.match(/(?:src|data-src|data-video|video-url)\s*=\s*["']([^"']+)["']/gi) || [],
      html.match(/(?:https?:)?\/\/[^"'<>\\\s]+\.mp4(?:\?[^"'<>\\\s]*)?/gi) || [],
    ]).map(value => videoUrl(value, { proxy: true })).filter(Boolean).slice(0, MAX_VIDEOS);
    const textContent = decodeEntities(html.replace(/<script[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style[\s\S]*?<\/style>/gi, ' ')
      .replace(/<br\s*\/?\s*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim());
    return { html: content ? proxyDescriptionHtml(clean(content, 200000)) : '', text: clean(textContent, 12000), images, videos };
  }

  function proxySrcset(value) {
    return srcsetValues(value).map((candidate, index) => {
      const descriptor = String(value || '').split(',')[index]?.trim().split(/\s+/).slice(1).join(' ') || '';
      const proxied = imageUrl(candidate.startsWith('//') ? `https:${candidate}` : candidate, { proxy: true });
      return `${proxied || candidate}${descriptor ? ` ${descriptor}` : ''}`;
    }).join(', ');
  }

  function proxyDescriptionHtml(value) {
    return clean(value, 200000).replace(/((?:src|data-src|data-lazy-src|data-lazyload-src|data-ks-lazyload|data-img|data-image|data-original|srcset|data-srcset)\s*=\s*)(["'])([^"']+)\2/gi, (match, prefix, quote, source) => {
      const attr = String(prefix).split('=')[0].trim().toLowerCase();
      if (attr === 'srcset' || attr === 'data-srcset') return `${prefix}${quote}${proxySrcset(source)}${quote}`;
      const normalized = source.startsWith('//') ? `https:${source}` : source;
      const proxied = imageUrl(normalized, { proxy: true });
      return proxied ? `${prefix}${quote}${proxied}${quote}` : match;
    }).replace(/(background(?:-image)?\s*:\s*url\((?:["']?))([^\)"']+)(["']?\))/gi, (match, prefix, source, suffix) => {
      const normalized = source.startsWith('//') ? `https:${source}` : source;
      const proxied = imageUrl(normalized, { proxy: true });
      return proxied ? `${prefix}${proxied}${suffix}` : match;
    });
  }

  const OPTION_NAME_TRANSLATIONS = Object.freeze({
    '颜色': 'Màu sắc', '颜色分类': 'Màu sắc', '色号': 'Màu sắc', 'color': 'Màu sắc', 'colour': 'Màu sắc',
    '尺码': 'Kích thước', '鞋码': 'Kích thước', '大小': 'Kích thước', 'size': 'Kích thước',
    '身高': 'Chiều cao', '适合身高': 'Chiều cao', 'suitable for height': 'Chiều cao', 'height': 'Chiều cao',
    '规格': 'Quy cách', 'specification': 'Quy cách', '款式': 'Kiểu dáng', 'style': 'Kiểu dáng',
    '材质': 'Chất liệu', 'material': 'Chất liệu', '型号': 'Mẫu mã', 'model': 'Mẫu mã',
    '童袜尺码': 'Cỡ tất trẻ em', '镜架颜色': 'Màu gọng kính', '鞋面颜色': 'Màu thân giày',
  });
  const OPTION_VALUE_REPLACEMENTS = Object.freeze([
    ['上衣+裤子+领带+眼镜+袜子', 'Áo + quần + cà vạt + kính + tất'],
    ['上衣+裙子+领结+眼镜+袜子', 'Áo + váy + nơ + kính + tất'],
    ['上衣+裤子+项链+手套', 'Áo + quần + vòng cổ + găng tay'],
    ['上衣+裙子+袜子', 'Áo + váy + tất'], ['上衣+短裤+袜子', 'Áo + quần short + tất'],
    ['上衣+短裙+袜子', 'Áo + chân váy ngắn + tất'], ['上衣+长裤', 'Áo + quần dài'],
    ['上衣+短裤', 'Áo + quần short'], ['上衣+短裙', 'Áo + chân váy ngắn'],
    ['上衣+裙子', 'Áo + váy'], ['上衣+裤子', 'Áo + quần'], ['外套+裤子', 'Áo khoác + quần'],
    ['衬衫+裤子', 'Sơ mi + quần'], ['背心+裤子', 'Áo ba lỗ + quần'], ['旗袍+袜子', 'Sườn xám + tất'],
    ['裤子', 'Quần'], ['长裤', 'Quần dài'], ['短裤', 'Quần short'], ['裙子', 'Váy'], ['短裙', 'Chân váy ngắn'],
    ['长裙', 'Váy dài'], ['上衣', 'Áo'], ['外套', 'Áo khoác'], ['衬衫', 'Sơ mi'], ['背心', 'Áo ba lỗ'],
    ['袜套', 'Ống tất'], ['袜子', 'Tất'], ['帽子', 'Mũ'], ['手套', 'Găng tay'], ['眼镜', 'Kính'],
    ['项链', 'Vòng cổ'], ['挂链', 'Dây đeo'], ['脖链', 'Dây chuyền'], ['领带', 'Cà vạt'], ['领结', 'Nơ'],
    ['腰带', 'Thắt lưng'], ['腰裙', 'Váy eo'], ['腰绳', 'Dây eo'], ['发带', 'Băng đô'], ['发箍', 'Cài tóc'],
    ['头巾', 'Khăn trùm đầu'], ['方巾', 'Khăn vuông'], ['手环', 'Vòng tay'], ['手链', 'Vòng tay'],
    ['扇子', 'Quạt'], ['挂饰', 'Phụ kiện treo'], ['饰品', 'Phụ kiện'], ['内搭', 'Áo lót'], ['袖套', 'Ống tay'],
    ['颜色', 'Màu sắc'], ['红色', 'Đỏ'], ['黄色', 'Vàng'], ['黑色', 'Đen'], ['白色', 'Trắng'], ['绿色', 'Xanh lá'],
    ['蓝色', 'Xanh dương'], ['粉色', 'Hồng'], ['橙色', 'Cam'], ['紫色', 'Tím'], ['灰色', 'Xám'], ['棕色', 'Nâu'],
    ['玫红色', 'Hồng cánh sen'], ['藏青色', 'Xanh navy'], ['浅蓝色', 'Xanh nhạt'], ['纯白', 'Trắng tinh'],
    ['均码', 'Freesize'], ['儿童均码', 'Freesize trẻ em'], ['可调节', 'Có thể điều chỉnh'], ['男款', 'Nam'], ['女款', 'Nữ'],
    ['男童', 'Bé trai'], ['女童', 'Bé gái'], ['儿童', 'Trẻ em'], ['幼儿', 'Mầm non'], ['无袖', 'Không tay'],
    ['短袖', 'Tay ngắn'], ['长袖', 'Tay dài'], ['牛仔', 'Denim'], ['迷彩', 'Camouflage'], ['蕾丝', 'Ren'],
    ['字母', 'Chữ cái'], ['条纹', 'Sọc'], ['花朵', 'Hoa'], ['印花', 'In họa tiết'], ['亮钻', 'Đính đá'],
    ['铁环', 'Khoen kim loại'], ['发饰', 'Phụ kiện tóc'], ['马面裙', 'Váy mã diện'], ['旗袍', 'Sườn xám'],
  ]);
  const CHINESE_OPTION_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
  function valueHash(value) {
    let hash = 0;
    for (const char of String(value || '')) hash = ((hash << 5) - hash + char.codePointAt(0)) | 0;
    return String(Math.abs(hash) % 10000).padStart(4, '0');
  }
  function fallbackOptionValue(value) {
    let result = decodeEntities(String(value || '')).trim();
    OPTION_VALUE_REPLACEMENTS.forEach(([from, to]) => { result = result.split(from).join(to); });
    result = result.replace(/\s*\+\s*/g, ' + ').replace(/\s+/g, ' ').trim();
    return CHINESE_OPTION_RE.test(result) ? `Mẫu lựa chọn ${valueHash(value)}` : clean(result, 80);
  }
  function localizedOptionValue(value, translations = {}) {
    const source = clean(value, 80);
    if (!source || !CHINESE_OPTION_RE.test(source)) return source;
    const translated = translations[source] || translations[decodeEntities(source)] || '';
    return fallbackOptionValue(translated || source);
  }
  function localizedOptionName(value, index = 0, translations = {}) {
    const source = clean(value, 80);
    const translated = translations[source] || translations[decodeEntities(source)] || OPTION_NAME_TRANSLATIONS[source] || OPTION_NAME_TRANSLATIONS[source.toLowerCase()];
    const result = translated || fallbackOptionValue(source);
    return clean(CHINESE_OPTION_RE.test(result) ? `Lựa chọn ${index + 1}` : (result || `Lựa chọn ${index + 1}`), 80);
  }
  const optionId = (name, index) => {
    const ascii = String(name || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/đ/gi, 'd').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toLowerCase();
    return (ascii || `option-${index + 1}`).slice(0, 36);
  };
  const optionName = (name, index) => {
    const source = String(name || '').trim();
    return clean(OPTION_NAME_TRANSLATIONS[source] || OPTION_NAME_TRANSLATIONS[source.toLowerCase()] || source || `Option ${index + 1}`, 80);
  };

  function listValues(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === 'object') return value.value || value.values || value.list || value.items || [];
    return [];
  }

  function parseSpecValues(value) {
    const result = {};
    const source = decodeEntities(String(value || '')).replace(/%3A/gi, ':').replace(/%3B/gi, ';');
    source.split(/[;|#]/).map(item => item.trim()).filter(Boolean).forEach(item => {
      const match = item.match(/^([^:：=]+)[:：=](.+)$/);
      if (match) result[match[1].trim()] = match[2].trim();
    });
    return result;
  }

  function skuSpecValues(sku) {
    const candidates = [sku?.specAttrs, sku?.spec, sku?.skuAttr, sku?.skuAttrs, sku?.properties, sku?.propertyList];
    for (const candidate of candidates) {
      if (typeof candidate === 'string') {
        const parsed = parseSpecValues(candidate);
        if (Object.keys(parsed).length) return parsed;
        const ordered = decodeEntities(candidate).split('>').map(item => item.trim()).filter(Boolean);
        if (ordered.length > 1) return { __ordered: ordered };
        if (candidate.trim()) return { __single: decodeEntities(candidate).trim() };
      }
      if (Array.isArray(candidate)) {
        const parsed = {};
        candidate.forEach(item => {
          const name = item?.propName || item?.prop || item?.name || item?.key;
          const value = item?.valueName || item?.value || item?.valueStr || item?.text;
          if (name && value) parsed[String(name).trim()] = String(value).trim();
        });
        if (Object.keys(parsed).length) return parsed;
      }
      if (candidate && typeof candidate === 'object' && !Array.isArray(candidate)) {
        const parsed = {};
        Object.entries(candidate).forEach(([key, val]) => { if (val != null && typeof val !== 'object') parsed[key] = String(val); });
        if (Object.keys(parsed).length) return parsed;
      }
    }
    return {};
  }

  function normalizeSkuMap(value) {
    if (Array.isArray(value)) return value;
    if (!value || typeof value !== 'object') return [];
    return Object.entries(value).map(([key, item]) => ({ ...(item && typeof item === 'object' ? item : {}), specAttrs: item?.specAttrs || key }));
  }

  function normalizeDescriptionUrl(value) {
    const raw = clean(value, 4000);
    if (!raw) return '';
    try {
      const url = new URL(raw);
      const embedded = url.searchParams.get('url');
      if (embedded && remoteImageUrl(embedded.replace(/^http:/i, 'https:'))) return remoteImageUrl(embedded.replace(/^http:/i, 'https:'));
    } catch { /* keep the original URL when it is not a fully-qualified URL */ }
    return raw;
  }

  function mapVariantValues(rawValues, options, translations = {}) {
    const entries = Object.entries(rawValues || {});
    if (Array.isArray(rawValues?.__ordered)) {
      return Object.fromEntries(options.map((option, index) => [option.id, localizedOptionValue(rawValues.__ordered[index], translations)]).filter(([, value]) => value));
    }
    const single = rawValues?.__single || (entries.length === 1 && !String(entries[0][0]).trim() ? entries[0][1] : '');
    if (options.length === 1 && single) return { [options[0].id]: localizedOptionValue(single, translations) };
    return Object.fromEntries(options.map(option => {
      const exact = entries.find(([key, value]) => String(key).trim() !== '__single' && (String(key).trim() === option.sourceName || optionName(key, 0) === option.name || option.values.includes(localizedOptionValue(value, translations))))
        || (entries.find(([, value]) => option.values.includes(localizedOptionValue(value, translations))) || null);
      return [option.id, exact ? localizedOptionValue(exact[1], translations) : ''];
    }).filter(([, value]) => value));
  }

  function normalizeAttributes(value) {
    const list = Array.isArray(value) ? value : value && typeof value === 'object' ? Object.entries(value).map(([name, content]) => ({ name, value: content })) : [];
    return list.map(attribute => {
      const name = attribute?.name || attribute?.label || attribute?.key || attribute?.prop || '';
      const content = attribute?.value ?? attribute?.content ?? attribute?.text ?? (Array.isArray(attribute?.values) ? attribute.values.join(', ') : '');
      return { name: clean(name, 160), value: clean(content, 500) };
    }).filter(attribute => attribute.name && attribute.value).slice(0, 80);
  }

  // 1688 attaches a representative image to values of the colour/model
  // option (skuProps[].value[].imageUrl).  Keep that relationship separate
  // from the compact SKU rows so it survives both static generation and the
  // Supabase wire format without duplicating the same URL hundreds of times.
  function imageValue(value) {
    if (typeof value === 'string') return value;
    if (!value || typeof value !== 'object') return '';
    return value.imageUrl || value.imgUrl || value.imageURI || value.fullPathImageURI || value.url || '';
  }

  function normalizeOptionImages(value, options = [], translations = {}, { proxy = false } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    const optionList = Array.isArray(options) ? options : [];
    Object.entries(value).forEach(([rawOptionKey, rawValues]) => {
      const key = String(rawOptionKey || '').trim();
      if (!key || !rawValues || typeof rawValues !== 'object' || Array.isArray(rawValues)) return;
      const optionIndex = optionList.findIndex((option, index) => {
        const id = String(option?.id || '').trim();
        const name = String(option?.name || '').trim();
        const sourceName = String(option?.sourceName || '').trim();
        return id === key || name === key || sourceName === key || optionId(key, index) === id || optionName(key, index) === name;
      });
      const option = optionList[optionIndex];
      const optionIdValue = option?.id || key.replace(/[^a-zA-Z0-9_-]/g, '-').slice(0, 40);
      if (!optionIdValue) return;
      const mapped = {};
      Object.entries(rawValues).forEach(([rawValue, rawImage]) => {
        const localizedValue = localizedOptionValue(rawValue, translations);
        const candidate = imageUrl(imageValue(rawImage), { proxy });
        if (localizedValue && candidate) mapped[localizedValue] = candidate;
      });
      if (Object.keys(mapped).length) result[optionIdValue] = { ...(result[optionIdValue] || {}), ...mapped };
    });
    return result;
  }

  function normalizeVariantImages(value, { proxy = false } = {}) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    const result = {};
    Object.entries(value).forEach(([key, rawImage]) => {
      const candidate = imageUrl(Array.isArray(rawImage) ? rawImage[0] : imageValue(rawImage), { proxy });
      if (String(key || '').trim() && candidate) result[String(key).trim()] = candidate;
    });
    return result;
  }

  function deriveVariantImages(variants = [], options = [], optionImages = {}, existing = {}) {
    const result = { ...normalizeVariantImages(existing, { proxy: false }) };
    (Array.isArray(variants) ? variants : []).forEach(variant => {
      const id = String(variant?.id || variant?.sku || '').trim();
      if (!id || result[id]) return;
      const image = options.map(option => optionImages?.[option.id]?.[variant?.values?.[option.id]]).find(Boolean);
      if (image) result[id] = image;
    });
    return result;
  }

  function attachVariantImages(variants = [], options = [], optionImages = {}, variantImages = {}) {
    const normalized = normalizeVariantImages(variantImages, { proxy: true });
    return (Array.isArray(variants) ? variants : []).map(variant => {
      const key = String(variant?.id || variant?.sku || '').trim();
      const image = normalized[key] || options.map(option => optionImages?.[option.id]?.[variant?.values?.[option.id]]).find(Boolean);
      return image ? { ...variant, image } : variant;
    });
  }

  function detailPayload(body = {}) {
    // Browser exports produced by the 1688 detail page are already reduced to
    // this shape.  Accept them directly so a CAPTCHA-free user export can be
    // fed back into the resumable enrichment script without losing SKU data.
    if (body && Array.isArray(body.gallery) && (Array.isArray(body.variants) || Array.isArray(body.options)) && (body.offerId || body.title)) {
      return {
        offerId: clean(body.offerId, 30), title: clean(body.title || body.subject, 500),
        gallery: [...new Set(body.gallery.map(imageUrl).filter(Boolean))].slice(0, MAX_GALLERY_IMAGES),
        videos: collectVideoUrls(body.videos || body.video || body.videoUrl).slice(0, MAX_VIDEOS),
        options: normalizeOptions(body.options || []),
        variants: (Array.isArray(body.variants) ? body.variants : []).map((variant, index) => ({
          ...variant, id: clean(variant.id || variant.sku || `remote-${index + 1}`, 80),
          sku: clean(variant.sku || variant.id || `1688-${index + 1}`, 80),
          sourceSpec: clean(decodeEntities(variant.sourceSpec || variant.specAttrs || ''), 500),
        })),
        descriptionUrl: normalizeDescriptionUrl(body.descriptionUrl),
        attributes: normalizeAttributes(body.attributes),
        optionImages: body.optionImages || {},
        variantImages: body.variantImages || {},
        priceCny: Number.isFinite(Number(body.priceCny)) ? Number(body.priceCny) : 0,
      };
    }
    const result = body?.result || body?.data?.result || body?.data || body;
    const model = result?.model || result;
    const contextModel = body?.result?.global?.globalData?.model || result?.global?.globalData?.model || {};
    // The current desktop page stores its canonical payload under
    // result.data.Root.fields.dataJson, while older SSR/API responses expose
    // offerModel/dataModel directly.  Resolve both forms in one place.
    const rootData = result?.data?.Root?.fields?.dataJson || result?.data?.Root?.fields?.dataJSON || result?.Root?.fields?.dataJson || {};
    const offer = contextModel?.offerDetail || model?.offerModel?.offerDetail || model?.offerDetail || rootData?.detailModel?.offerModel?.offerDetail || rootData?.offerModel?.offerDetail || model?.tempModel || rootData?.tempModel || model?.offerBaseInfo || rootData?.offerBaseInfo || {};
    const dataModel = model?.dataModel || result?.data || rootData || model;
    const scopes = [dataModel, rootData, result?.data, model].filter(scope => scope && typeof scope === 'object');
    const first = (...values) => values.find(value => value != null && value !== '');
    const gallery = [
      ...(Array.isArray(offer.imageList) ? offer.imageList : []).map(item => item?.fullPathImageURI || item?.imageURI || item?.imgUrl),
      ...(Array.isArray(offer.mainImageList) ? offer.mainImageList : []).map(item => item?.fullPathImageURI || item?.imageURI || item?.imgUrl),
      ...scopes.flatMap(scope => Array.isArray(scope.gallery?.fields?.offerImgList) ? scope.gallery.fields.offerImgList : []),
      ...scopes.flatMap(scope => Array.isArray(scope.gallery?.offerImgList) ? scope.gallery.offerImgList : []),
      ...scopes.flatMap(scope => Array.isArray(scope.images?.fields?.offerImgList) ? scope.images.fields.offerImgList : []),
      ...scopes.flatMap(scope => Array.isArray(scope.offerImages) ? scope.offerImages.map(item => item?.fullPathImageURI || item?.imageURI || item?.imgUrl || item) : []),
      ...scopes.map(scope => scope.tempModel?.defaultOfferImg || scope.shareModel?.picUrl),
      ...scopes.flatMap(scope => Array.isArray(scope.shareModel?.imageUrls) ? scope.shareModel.imageUrls : []),
      ...(Array.isArray(body.gallery) ? body.gallery : []),
    ].map(imageUrl).filter(Boolean);
    const videos = collectVideoUrls([
      offer.videoUrl, offer.video, offer.offerVideo, dataModel.videoUrl, dataModel.video,
      ...scopes.map(scope => scope.videoUrl), ...scopes.map(scope => scope.video), body.videos, body.video, body.videoUrl,
      result,
    ]).slice(0, MAX_VIDEOS);
    const skuProps = Array.isArray(offer.skuProps) ? offer.skuProps
      : first(...scopes.map(scope => Array.isArray(scope.skuModel?.skuProps) ? scope.skuModel.skuProps : null), ...scopes.map(scope => Array.isArray(scope.skuSelection?.fields?.skuProps) ? scope.skuSelection.fields.skuProps : null)) || [];
    const optionDrafts = skuProps.map((prop, index) => {
      const sourceName = clean(prop?.prop || prop?.name || prop?.propName || `Option ${index + 1}`, 80);
      const values = [...new Set(listValues(prop?.value || prop?.values).map(value => clean(value?.name || value?.value || value?.valueName || value, 80)).filter(Boolean))];
      return { id: optionId(sourceName, index), name: optionName(sourceName, index), sourceName, values };
    }).filter(option => option.values.length).slice(0, 3);
    const optionImages = Object.fromEntries(optionDrafts.map(option => {
      const source = skuProps.find(prop => clean(prop?.prop || prop?.name || prop?.propName, 80) === option.sourceName);
      const values = Object.fromEntries(listValues(source?.value || source?.values).map(value => {
        const name = clean(value?.name || value?.value || value?.valueName || value, 80);
        const image = imageUrl(imageValue(value));
        return name && image ? [name, image] : null;
      }).filter(Boolean));
      return [option.id, values];
    }).filter(([, values]) => Object.keys(values).length));
    const options = optionDrafts.map(({ sourceName, ...option }) => ({ ...option, sourceName }));
    const tradeModels = scopes.map(scope => scope?.mainPrice?.fields?.finalPriceModel?.tradeWithoutPromotion).filter(Boolean);
    const skuMap = first(
      ...tradeModels.flatMap(trade => [trade.skuMapOriginal, trade.skuMap]),
      ...scopes.flatMap(scope => [scope?.skuModel?.skuInfoMapOriginal, scope?.skuModel?.skuInfoMap]),
      offer?.skuMapOriginal, offer?.skuMap,
    );
    const priceCandidate = first(
      ...scopes.map(scope => scope?.tempModel?.price),
      ...scopes.map(scope => String(scope?.skuModel?.skuPriceScale || '').match(/[0-9]+(?:\.[0-9]+)?/)?.[0]),
      ...scopes.flatMap(scope => scope?.mainPrice?.fields?.priceModel?.currentPrices || []).map(item => item?.price),
      ...scopes.flatMap(scope => scope?.orderParamModel?.orderParam?.skuParam?.skuRangePrices || []).map(item => item?.price),
      body.priceCny,
    );
    const defaultPrice = Number(priceCandidate || 0);
    const variants = normalizeSkuMap(skuMap).map((sku, index) => {
      const values = mapVariantValues(skuSpecValues(sku), optionDrafts);
      const priceCny = Number(sku?.price ?? sku?.salePrice ?? sku?.priceValue ?? defaultPrice);
      const stock = Number(sku?.canBookCount ?? sku?.quantity ?? sku?.stock ?? 0);
      return {
        id: clean(sku?.skuId || sku?.specId || `remote-${index + 1}`, 80),
        sku: clean(sku?.skuId || sku?.specId || `1688-${index + 1}`, 80),
        values,
        priceCny: Number.isFinite(priceCny) && priceCny >= 0 ? priceCny : 0,
        stock: Number.isFinite(stock) && stock >= 0 ? Math.floor(stock) : 0,
        enabled: Number.isFinite(stock) && stock > 0,
        sourceSpec: clean(decodeEntities(sku?.specAttrs || sku?.spec || JSON.stringify(skuSpecValues(sku))), 500),
      };
    }).filter(variant => !options.length || Object.keys(variant.values).length === options.length).slice(0, MAX_IMPORT_VARIANTS);
    const variantImages = deriveVariantImages(variants, options, optionImages);
    const directAttributes = first(
      offer.featureAttributes,
      ...scopes.map(scope => scope?.productAttributes?.fields?.attributes),
      ...scopes.map(scope => scope?.attributes?.fields?.attributes),
      ...scopes.map(scope => scope?.propsList),
      body.attributes,
    );
    return {
      offerId: clean(offer.offerId || dataModel?.offerBaseInfo?.offerId || rootData?.tempModel?.offerId || body.offerId, 30),
      title: clean(offer.subject || offer.title || dataModel?.offerBaseInfo?.title || dataModel?.tempModel?.offerTitle || dataModel?.shareModel?.subject || body.title, 500),
      gallery: [...new Set(gallery)].slice(0, MAX_GALLERY_IMAGES),
      videos,
      options: options.map(({ sourceName, ...option }) => option),
      variants,
      optionImages,
      variantImages,
      descriptionUrl: normalizeDescriptionUrl(offer.detailUrl || dataModel.description?.fields?.detailUrl || dataModel.description?.detailUrl || dataModel.detailModel?.detailUrl || rootData?.detailModel?.detailUrl || body.descriptionUrl),
      attributes: normalizeAttributes(directAttributes),
      priceCny: Number.isFinite(defaultPrice) ? defaultPrice : 0,
    };
  }
  const safeNumber = (value, fallback = 0) => {
    const number = Number(value);
    return Number.isSafeInteger(number) && number >= 0 ? number : fallback;
  };
  const slugify = (title, offerId) => {
    const slug = clean(title, 500).toLowerCase()
      .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    const suffix = offerId ? `-${clean(offerId, 30)}` : '';
    const room = Math.max(1, 160 - suffix.length);
    const head = (slug || '1688').slice(0, room).replace(/-+$/g, '');
    return `${head || '1688'}${suffix}`.slice(0, 160).replace(/-+$/g, '');
  };
  const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

  function parseOfferUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      if (!SHOP_HOST_RE.test(url.hostname) && !/(?:^|\.)alibaba\.com$/i.test(url.hostname)) return '';
      return url.pathname.match(OFFER_RE)?.[1] || '';
    } catch {
      return '';
    }
  }

  function isShopUrl(value) {
    try {
      const url = new URL(String(value || '').trim());
      return SHOP_HOST_RE.test(url.hostname) && !parseOfferUrl(url.href);
    } catch {
      return false;
    }
  }

  function shopHost(value) {
    try { return new URL(String(value || '').trim()).hostname.toLowerCase(); } catch { return ''; }
  }

  function sourceUrl(value, offerId) {
    const parsed = clean(value, 2000);
    if (parseOfferUrl(parsed)) return parsed;
    return offerId ? `https://detail.1688.com/offer/${offerId}.html` : parsed;
  }

  function translatedTitle(input = {}) {
    const vietnamese = clean(input.titleVietnamese || input.titleVi, 180);
    if (vietnamese) return vietnamese;
    const english = clean(input.titleEnglish || input.englishTitle, 180);
    if (english) return english;
    const offerId = clean(input.offerId, 30);
    if (KNOWN_TITLES[offerId]) return KNOWN_TITLES[offerId];
    return clean(input.title || input.sourceTitle, 180);
  }

  // Last-resort translation when a provider is temporarily unavailable. It
  // never leaves a Chinese title in a product marked as Vietnamese.
  function fallbackVietnameseTitle(input = {}) {
    const source = clean(input.sourceTitle || input.title || input.subject, 180);
    const replacements = [
      ['儿童', 'trẻ em'], ['女童', 'bé gái'], ['男童', 'bé trai'], ['女孩', 'bé gái'],
      ['男孩', 'bé trai'], ['幼儿园', 'mầm non'], ['小学', 'tiểu học'], ['服装', 'trang phục'],
      ['演出服', 'trang phục biểu diễn'], ['表演', 'biểu diễn'], ['舞蹈', 'múa'], ['爵士舞', 'jazz'],
      ['街舞', 'street dance'], ['啦啦队', 'cổ vũ'], ['合唱', 'hợp xướng'], ['朗诵', 'đọc diễn cảm'],
      ['比赛', 'thi đấu'], ['国庆', 'Quốc khánh'], ['毕业班服', 'đồng phục tốt nghiệp'],
      ['汉服', 'Hán phục'], ['裙', 'váy'], ['上衣', 'áo'], ['裤', 'quần'], ['套装', 'bộ đồ'],
      ['新款', 'mẫu mới'], ['春季', 'mùa xuân'], ['夏季', 'mùa hè'], ['秋季', 'mùa thu'], ['冬季', 'mùa đông'],
    ];
    let result = source;
    replacements.forEach(([from, to]) => { result = result.split(from).join(` ${to} `); });
    result = result.replace(/[\u4e00-\u9fff]+/g, '').replace(/\s+/g, ' ').trim();
    if (result.length < 3 || /[\u4e00-\u9fff]/.test(result)) return `Sản phẩm thời trang trẻ em 1688 ${clean(input.offerId, 20)}`.trim();
    return clean(result, 180);
  }

  function optionValues(input = {}) {
    if (Array.isArray(input.options) && input.options.length) return input.options;
    const heights = Array.isArray(input.heights) ? input.heights : [];
    if (!heights.length) return [];
    return [{ id: 'height', name: 'Height', values: heights.map(value => clean(value, 40)).filter(Boolean) }];
  }

  function normalizeOptions(options, translations = {}) {
    return (Array.isArray(options) ? options : []).slice(0, 3).map((option, index) => ({
      id: clean(option?.id || `option-${index + 1}`, 40).replace(/[^a-zA-Z0-9_-]/g, '-'),
      name: localizedOptionName(option?.name || `Lựa chọn ${index + 1}`, index, translations),
      // Some 1688 offers use a catalogue-style "model" option with more
      // than one hundred labels. Keep every verified label needed by the SKU
      // matrix; the 500-row ceiling is enforced on combinations instead.
      values: [...new Set((Array.isArray(option?.values) ? option.values : []).map(value => localizedOptionValue(value, translations)).filter(Boolean))].slice(0, MAX_IMPORT_VARIANTS),
    })).filter(option => option.id && option.name && option.values.length);
  }

  function normalizeVariants(input, options, sku, translations = {}) {
    const source = Array.isArray(input.variants) ? input.variants : [];
    const regionId = clean(input.regionId || input.defaultRegionId || 'vn', 40).toLowerCase() || 'vn';
    return source.slice(0, MAX_IMPORT_VARIANTS).map((variant, index) => {
      const values = {};
      options.forEach(option => {
        const value = localizedOptionValue(variant?.values?.[option.id] || variant?.[option.id], translations);
        if (value) values[option.id] = value;
      });
      const suffix = Object.values(values).join('-').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '').toUpperCase();
      const cny = Number(variant?.priceCny);
      const baseRate = Number(input.exchangeRateCnyBase || 0);
      const baseDecimals = Number(input.baseCurrencyDecimals ?? 2);
      const convertedBase = Number.isFinite(cny) && cny >= 0 && baseRate > 0
        ? Math.round(cny * baseRate * (10 ** baseDecimals))
        : safeNumber(variant?.priceMinor ?? variant?.price, safeNumber(input.priceMinor ?? input.basePriceMinor, 0));
      const regionalPrices = variant?.regionalPrices && typeof variant.regionalPrices === 'object' && !Array.isArray(variant.regionalPrices)
        ? { ...variant.regionalPrices } : {};
      const vndRate = Number(input.exchangeRateCnyVnd || 0);
      if (Number.isFinite(cny) && cny >= 0 && vndRate > 0) regionalPrices[regionId] = priceCnyToVnd(cny, vndRate, input.priceMultiplier ?? 2);
      return {
        id: clean(variant?.id || `v-${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, '-'),
        values,
        sku: clean(variant?.sku || `${sku}-${suffix || index + 1}`, 80),
        price: convertedBase,
        compareAt: variant?.compareAt == null ? null : safeNumber(variant.compareAt),
        cost: variant?.cost == null ? null : safeNumber(variant.cost),
        stock: safeNumber(variant?.stock, 0),
        enabled: variant?.enabled === true || (variant?.enabled == null && safeNumber(variant?.stock, 0) > 0),
        barcode: clean(variant?.barcode, 80),
        ...(Object.keys(regionalPrices).length ? { regionalPrices } : {}),
      };
    });
  }

  function priceCnyToVnd(priceCny, exchangeRate = 3500, multiplier = 2) {
    const price = Number(priceCny);
    const rate = Number(exchangeRate);
    const factor = Number(multiplier);
    if (!Number.isFinite(price) || price < 0 || !Number.isFinite(rate) || rate <= 0 || !Number.isFinite(factor) || factor <= 0) return 0;
    return Math.min(2147483647, Math.max(0, Math.round(price * rate * factor)));
  }

  function parseJsonp(text) {
    const value = String(text || '').trim();
    const start = value.indexOf('{');
    const end = value.lastIndexOf('}');
    if (start < 0 || end < start) throw new Error('Phản hồi 1688 không hợp lệ.');
    return JSON.parse(value.slice(start, end + 1));
  }

  function cookiePairs(value) {
    if (!value) return [];
    return String(value).split(/,\s*(?=_[^=;\s]+=)/).map(part => part.split(';')[0].trim()).filter(Boolean);
  }

  function mergeCookies(current, setCookie) {
    const map = new Map(String(current || '').split(';').map(item => item.trim().split('=').slice(0, 2)).filter(item => item[0]));
    cookiePairs(setCookie).forEach(pair => {
      const [name, ...rest] = pair.split('=');
      if (name) map.set(name, `${name}=${rest.join('=')}`);
    });
    return [...map.values()].join('; ');
  }

  function mtopData(memberId, pageNum, count) {
    return JSON.stringify({
      componentKey: 'Wp_pc_common_offerlist',
      params: JSON.stringify({
        memberId,
        appdata: { sortType: 'wangpu_score', sellerRecommendFilter: false, mixFilter: false, tradenumFilter: false, quantityBegin: null, pageNum, count },
      }),
    });
  }

  function queryFor(data, timestamp, sign = '', appKey = MTOP_APP_KEY, api = 'mtop.alibaba.alisite.cbu.server.moduleasyncservice') {
    const query = new URLSearchParams({
      jsv: '2.7.2', appKey, t: String(timestamp),
      api, v: '1.0',
      type: 'jsonp', dataType: 'jsonp', callback: 'mtopjsonp1', data,
    });
    if (sign) query.set('sign', sign);
    return query;
  }

  function offerDetailData(offerId) {
    return JSON.stringify({
      params: JSON.stringify({ offerId: clean(offerId, 30) }),
      fcName: 'mini-od-cse',
      fcGroup: 'cbu-offer',
      serviceName: 'wirelessCoreOdService',
    });
  }

  /**
   * Client for the public mobile-offer SKU endpoint.  It follows the normal
   * MTop token/sign flow and only requests the supplied offer id; no browser
   * cookies, login credentials, or CAPTCHA state are collected.
   */
  function createOfferDetailClient(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('Offer detail cần môi trường có fetch.');
    const endpoint = options.endpoint || OFFER_DETAIL_MTOP_ENDPOINT;
    const appKey = options.appKey || MTOP_APP_KEY;
    const api = OFFER_DETAIL_MTOP_API;
    const headers = {
      'user-agent': options.userAgent || 'Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 Chrome/125 Mobile Safari/537.36',
      referer: options.referer || 'https://m.1688.com/',
      accept: 'application/json,text/plain,*/*',
    };
    let cookie = clean(options.cookie, 4000);
    let token = '';
    let primed = false;
    const request = async (url, requestOptions = {}) => fetchImpl(url, { ...requestOptions, headers: { ...headers, ...(requestOptions.headers || {}) } });
    const responseCookies = response => response?.headers?.getSetCookie?.()?.join(', ') || response?.headers?.get?.('set-cookie') || '';

    async function prime() {
      const data = offerDetailData('0');
      const timestamp = Date.now();
      const response = await request(`${endpoint}?${queryFor(data, timestamp, '', appKey, api).toString()}`);
      cookie = mergeCookies(cookie, responseCookies(response));
      const match = cookie.match(/(?:^|;\s*)_m_h5_tk=([^;]+)/);
      token = match?.[1]?.split('_')[0] || '';
      if (!token) throw new Error('1688 không cấp token cho API SKU mobile.');
      primed = true;
    }

    async function call(offerId) {
      const id = clean(offerId, 30);
      if (!/^\d{6,20}$/.test(id)) throw new Error('Offer ID 1688 không hợp lệ.');
      if (!primed || !token) await prime();
      const data = offerDetailData(id);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const timestamp = Date.now();
        const cryptoImpl = options.cryptoImpl || (typeof require === 'function' ? require('node:crypto') : null);
        if (!cryptoImpl?.createHash) throw new Error('Offer detail cần crypto.createHash trong môi trường Node.');
        const sign = cryptoImpl.createHash('md5').update(`${token}&${timestamp}&${appKey}&${data}`).digest('hex');
        const query = queryFor(data, timestamp, sign, appKey, api);
        const requestHeaders = cookie ? { cookie } : {};
        const response = await request(`${endpoint}?${query.toString()}`, { headers: requestHeaders });
        cookie = mergeCookies(cookie, responseCookies(response));
        const text = await response.text();
        if (response.status === 429 || response.status >= 500) { await sleep(450 * (attempt + 1)); continue; }
        const body = parseJsonp(text);
        const ret = Array.isArray(body.ret) ? body.ret.join(' ') : String(body.ret || '');
        if (/TOKEN|令牌|SESSION/i.test(ret) && attempt < 2) { primed = false; await prime(); continue; }
        if (!response.ok || !/SUCCESS/i.test(ret)) throw new Error(`1688 API SKU lỗi: ${ret.slice(0, 240)}`);
        return body;
      }
      throw new Error(`1688 API SKU không phản hồi ổn định cho offer ${id}.`);
    }
    return Object.freeze({ call, get cookie() { return cookie; } });
  }

  function createMtopClient(options = {}) {
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') throw new Error('MTop cần môi trường có fetch.');
    const endpoint = options.endpoint || MTOP_ENDPOINT;
    const appKey = options.appKey || MTOP_APP_KEY;
    const memberId = clean(options.memberId || DEFAULT_SHOP_MEMBER_ID, 120);
    const headers = {
      'user-agent': options.userAgent || 'Mozilla/5.0',
      referer: options.referer || 'https://shop1481820794169.1688.com/page/offerlist.htm',
      accept: 'application/json,text/plain,*/*',
    };
    let cookie = clean(options.cookie, 2000);
    let token = '';
    let primed = false;
    const request = async (url, requestOptions = {}) => fetchImpl(url, { ...requestOptions, headers: { ...headers, ...(requestOptions.headers || {}) } });

    async function prime() {
      const data = mtopData(memberId, 1, 1);
      const response = await request(`${endpoint}?${queryFor(data, Date.now(), '', appKey).toString()}`);
      cookie = mergeCookies(cookie, response.headers?.getSetCookie?.()?.join(', ') || response.headers?.get?.('set-cookie'));
      const match = cookie.match(/(?:^|;\s*)_m_h5_tk=([^;]+)/);
      token = match?.[1]?.split('_')[0] || '';
      if (!token && typeof document !== 'undefined') token = document.cookie.match(/(?:^|;\s*)_m_h5_tk=([^;]+)/)?.[1]?.split('_')[0] || '';
      if (!token) throw new Error('1688 không cấp token MTop. Hãy mở catalog trong trình duyệt rồi thử lại.');
      primed = true;
    }

    async function call(pageNum, count) {
      if (!primed || !token) await prime();
      const data = mtopData(memberId, pageNum, count);
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const timestamp = Date.now();
        const cryptoImpl = options.cryptoImpl || (typeof require === 'function' ? require('node:crypto') : null);
        if (!cryptoImpl?.createHash) throw new Error('MTop cần crypto.createHash trong môi trường Node.');
        const sign = cryptoImpl.createHash('md5').update(`${token}&${timestamp}&${appKey}&${data}`).digest('hex');
        const response = await request(`${endpoint}?${queryFor(data, timestamp, sign, appKey).toString()}`, { headers: { cookie } });
        const text = await response.text();
        if (response.status === 429 || response.status >= 500) { await sleep(400 * (attempt + 1)); continue; }
        const body = parseJsonp(text);
        const ret = Array.isArray(body.ret) ? body.ret.join(' ') : String(body.ret || '');
        if (/TOKEN|令牌|SESSION/i.test(ret) && attempt < 2) { primed = false; await prime(); continue; }
        if (!body.data?.content?.offerList && !/SUCCESS/i.test(ret)) throw new Error(`1688 MTop lỗi: ${ret.slice(0, 180)}`);
        return body;
      }
      throw new Error(`1688 MTop không phản hồi ổn định ở trang ${pageNum}.`);
    }
    return Object.freeze({ memberId, call, get cookie() { return cookie; } });
  }

  async function fetchShopCatalog(options = {}) {
    const memberId = clean(options.memberId || DEFAULT_SHOP_MEMBER_ID, 120);
    const count = Math.min(100, Math.max(1, Number(options.pageSize || 30)));
    const client = options.client || createMtopClient({ ...options, memberId });
    const first = await client.call(1, count);
    const firstContent = first.data?.content || {};
    const total = Math.max(0, Number(firstContent.offerCount || 0));
    const pages = Math.max(1, Math.ceil(total / count));
    const offers = [...(firstContent.offerList || [])];
    for (let pageNum = 2; pageNum <= pages; pageNum += 1) {
      const body = await client.call(pageNum, count);
      offers.push(...(body.data?.content?.offerList || []));
      if (typeof options.onPage === 'function') await options.onPage({ pageNum, pages, received: offers.length, total });
    }
    const deduped = [...new Map(offers.filter(item => item?.id).map(item => [String(item.id), item])).values()];
    return { memberId, total, pages, offers: deduped, source: options.shopUrl || '' };
  }

  async function translateTitleVi(text, options = {}) {
    const source = clean(text, 500);
    if (!source) return fallbackVietnameseTitle({ sourceTitle: text, offerId: options.offerId });
    if (!/[\u3400-\u9fff]/.test(source)) return clean(source, 180);
    const fetchImpl = options.fetchImpl || globalThis.fetch;
    if (typeof fetchImpl !== 'function') return fallbackVietnameseTitle({ sourceTitle: source, offerId: options.offerId });
    const query = new URLSearchParams({ client: 'dict-chrome-ex', sl: options.from || 'zh-CN', tl: options.to || 'vi', q: source });
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        const response = await fetchImpl(`${options.endpoint || TRANSLATE_ENDPOINT}?${query.toString()}`, { headers: { accept: 'application/json,text/plain,*/*', 'user-agent': 'Mozilla/5.0' } });
        if (response.status === 429 || response.status >= 500) { await sleep(350 * (attempt + 1)); continue; }
        if (!response.ok) break;
        const body = await response.json();
        const value = Array.isArray(body) ? body[0] : '';
        if (typeof value === 'string' && value.trim()) return clean(value, 180);
      } catch { /* use the deterministic fallback below */ }
    }
    return fallbackVietnameseTitle({ sourceTitle: source, offerId: options.offerId });
  }

  async function translateTitles(offers, options = {}) {
    const list = Array.isArray(offers) ? offers : [];
    const cache = new Map(Object.entries(options.cache || {}));
    const result = new Map();
    const concurrency = Math.max(1, Math.min(12, Number(options.concurrency || 4)));
    let cursor = 0;
    async function worker() {
      while (cursor < list.length) {
        const index = cursor; cursor += 1;
        const offer = list[index] || {};
        const key = clean(offer.subject || offer.title, 500);
        let title = cache.get(key);
        if (!title) {
          title = await translateTitleVi(key, { ...options, offerId: offer.id });
          cache.set(key, title);
        }
        result.set(String(offer.id), title);
        if (typeof options.onProgress === 'function') await options.onProgress({ index: index + 1, total: list.length, offerId: String(offer.id), title });
        if (options.delayMs) await sleep(Number(options.delayMs));
      }
    }
    await Promise.all(Array.from({ length: concurrency }, worker));
    return { titles: Object.fromEntries(result), cache: Object.fromEntries(cache) };
  }

  async function translateOptionValues(values, options = {}) {
    const sourceValues = [...new Set((Array.isArray(values) ? values : []).map(value => clean(value, 80)).filter(value => CHINESE_OPTION_RE.test(value)))];
    const cache = new Map(Object.entries(options.cache || {}));
    const pending = sourceValues.filter(value => !cache.has(value));
    const batchSize = Math.max(1, Math.min(80, Number(options.batchSize || 60)));
    const concurrency = Math.max(1, Math.min(8, Number(options.concurrency || 4)));
    let cursor = 0;
    async function translateBatch(batch) {
      const query = new URLSearchParams({ client: 'gtx', sl: options.from || 'zh-CN', tl: options.to || 'vi', dt: 't', q: batch.join('\n') });
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          const response = await (options.fetchImpl || globalThis.fetch)(`${options.endpoint || TRANSLATE_VALUES_ENDPOINT}?${query.toString()}`, { headers: { accept: 'application/json,text/plain,*/*', 'user-agent': 'Mozilla/5.0' } });
          if (response.status === 429 || response.status >= 500) { await sleep(350 * (attempt + 1)); continue; }
          if (!response.ok) break;
          const body = await response.json();
          const joined = Array.isArray(body?.[0]) ? body[0].map(item => Array.isArray(item) ? item[0] : '').join('') : '';
          const translated = joined.split('\n');
          if (translated.length === batch.length) return translated;
        } catch { /* retry, then use deterministic Vietnamese labels */ }
      }
      return batch.map(fallbackOptionValue);
    }
    async function worker() {
      while (cursor < pending.length) {
        const start = cursor; cursor += batchSize;
        const batch = pending.slice(start, start + batchSize);
        const translated = await translateBatch(batch);
        batch.forEach((value, index) => cache.set(value, fallbackOptionValue(translated[index] || value)));
        if (typeof options.onProgress === 'function') await options.onProgress({ translated: Math.min(start + batch.length, pending.length), total: pending.length });
        if (options.delayMs) await sleep(Number(options.delayMs));
      }
    }
    await Promise.all(Array.from({ length: Math.min(concurrency, Math.max(1, Math.ceil(pending.length / batchSize))) }, worker));
    return Object.fromEntries(sourceValues.map(value => [value, cache.get(value) || fallbackOptionValue(value)]));
  }

  function shortenVietnameseTitle(value, options = {}) {
    const original = clean(value, 180).replace(/["“”]/g, '').replace(/\s+/g, ' ').trim();
    const maxLength = Math.max(36, Math.min(80, Number(options.maxLength || 64)));
    if (original.length <= maxLength && !/^Sản phẩm thời trang trẻ em 1688/i.test(original)) return original;
    const title = original.toLowerCase();
    const performance = /(biểu diễn|khiêu vũ|múa|jazz|hip\s*-?\s*hop|hiphop|cổ vũ|hợp xướng|sân khấu|catwalk|trống)/i.test(title);
    let kind = 'Thời trang trẻ em';
    if (/(tất|vớ)/i.test(title) && !performance) kind = 'Tất trẻ em';
    else if (/(mũ|nón)/i.test(title) && !performance) kind = 'Mũ trẻ em';
    else if (/thắt lưng/i.test(title) && !performance) kind = 'Thắt lưng trẻ em';
    else if (/(băng đô|phụ kiện tóc|kẹp tóc)/i.test(title) && !performance) kind = 'Phụ kiện tóc';
    else if (/kính/i.test(title) && !performance) kind = 'Kính thời trang';
    else if (/(váy|đầm|chân váy)/i.test(title) && !performance) kind = 'Váy trẻ em';
    else if (/(quần|legging|short)/i.test(title) && !performance) kind = 'Quần trẻ em';
    else if (/(áo|sơ mi|t-shirt|vest)/i.test(title) && !performance) kind = 'Áo trẻ em';
    else if (performance) kind = 'Trang phục biểu diễn';
    const details = [];
    if (/jazz/i.test(title)) details.push('jazz');
    else if (/hip\s*-?\s*hop|hiphop/i.test(title)) details.push('hip hop');
    else if (/cổ vũ/i.test(title)) details.push('cổ vũ');
    else if (/hợp xướng/i.test(title)) details.push('hợp xướng');
    else if (/múa|khiêu vũ/i.test(title)) details.push('múa');
    if (/hanfu|hán phục|trung hoa|trung quốc/i.test(title)) details.push('phong cách Trung Hoa');
    let audience = '';
    if (/bé gái|nữ sinh|con gái/i.test(title)) audience = 'bé gái';
    else if (/bé trai|nam sinh|con trai/i.test(title)) audience = 'bé trai';
    else if (/trẻ em|thiếu nhi|học sinh/i.test(title)) audience = 'trẻ em';
    if (audience && ![kind, ...details].join(' ').toLowerCase().includes(audience)) details.push(audience);
    if (/mùa hè/i.test(title)) details.push('mùa hè');
    else if (/thu đông|mùa thu|mùa đông/i.test(title)) details.push('thu đông');
    const offerId = clean(options.offerId, 30);
    const suffix = offerId ? ` · Mẫu ${offerId.slice(-4)}` : '';
    const room = Math.max(20, maxLength - suffix.length);
    let result = [kind, ...details].join(' ').replace(/\s+/g, ' ').trim();
    if (result.length > room) result = result.slice(0, room + 1).replace(/\s+\S*$/, '').trim();
    return clean(`${result}${suffix}`, maxLength);
  }

  // Apply the presentation rules to a product at the boundary of every
  // import/enrichment pipeline.  Keeping this in the importer prevents a
  // later SKU refresh from re-introducing Chinese option labels or the long
  // supplier title that the first catalog pass had already cleaned up.
  function localizeProduct(product = {}, translations = {}, options = {}) {
    const current = { ...(product || {}) };
    const source = current.source && typeof current.source === 'object' ? current.source : {};
    const offerId = clean(source.offerId || current.offerId || String(current.sku || '').replace(/^1688-/, ''), 30);
    const is1688 = options.force === true || source.platform === '1688' || /^1688-/i.test(String(current.sku || ''));
    const hasChinese = value => CHINESE_OPTION_RE.test(String(value || ''));
    const rawTitle = clean(current.title || current.titleVietnamese || current.titleVi || source.sourceTitle, 180);
    if (is1688 && rawTitle) {
      const safeTitle = hasChinese(rawTitle)
        ? fallbackVietnameseTitle({ sourceTitle: rawTitle, offerId })
        : rawTitle;
      current.title = options.shorten === false
        ? clean(safeTitle, 180)
        : shortenVietnameseTitle(safeTitle, { offerId, maxLength: options.maxLength || 56 });
      current.titleLanguage = 'vi';
    }

    const rawOptions = Array.isArray(current.options) ? current.options : [];
    const normalizedOptions = normalizeOptions(rawOptions, translations);
    const rawById = new Map(rawOptions.map((option, index) => [String(option?.id || `option-${index + 1}`), option]));
    current.options = normalizedOptions;
    if (Array.isArray(current.variants)) {
      current.variants = current.variants.map(variant => {
        const values = {};
        normalizedOptions.forEach((option, optionIndex) => {
          const rawOption = rawById.get(option.id) || rawOptions[optionIndex] || {};
          const rawValues = Array.isArray(rawOption.values) ? rawOption.values : [];
          const rawValue = variant?.values?.[option.id] ?? variant?.values?.[rawOption.id] ?? variant?.[option.id];
          let value = localizedOptionValue(rawValue, translations);
          if (!option.values.includes(value) && rawValue != null) {
            const rawIndex = rawValues.findIndex(item => String(item) === String(rawValue));
            if (rawIndex >= 0) value = option.values[rawIndex] || value;
          }
          if (value && option.values.includes(value)) values[option.id] = value;
        });
        return { ...variant, values };
      });
    }

    const localizedOptionImages = normalizeOptionImages(current.optionImages, normalizedOptions, translations, { proxy: true });
    const localizedVariantImages = normalizeVariantImages(current.variantImages, { proxy: true });
    current.optionImages = localizedOptionImages;
    current.variantImages = Object.fromEntries(
      Object.entries({
        ...localizedVariantImages,
        ...Object.fromEntries((Array.isArray(current.variants) ? current.variants : []).map(variant => [
          String(variant?.id || variant?.sku || ''),
          variant?.image || variant?.imageUrl || '',
        ]).filter(([key, value]) => key && value)),
      }).filter(([, value]) => value),
    );
    if (Array.isArray(current.variants) && current.variants.length) {
      current.variants = attachVariantImages(current.variants, normalizedOptions, localizedOptionImages, current.variantImages);
    }

    if (is1688 && current.title) {
      current.imageAlt = `${current.title} — ảnh sản phẩm`;
      const slug = current.title.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
        .replace(/đ/gi, 'd').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 140);
      if (slug) current.slug = `${slug}-${offerId}`.slice(0, 160);
      current.seo = { ...(current.seo || {}), title: current.title, description: current.title };
    }
    if (current.descriptionHtml) current.descriptionHtml = proxyDescriptionHtml(current.descriptionHtml);
    return current;
  }

  function toProduct(input = {}) {
    const offerId = clean(input.offerId || parseOfferUrl(input.offerUrl || input.url), 30);
    if (!/^\d{6,20}$/.test(offerId)) throw new Error('Cần link offer 1688 dạng detail.1688.com/offer/...; link QR/shop chỉ là trang cửa hàng.');
    const sku = clean(input.sku || input.code, 80).toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9._-]{1,79}$/.test(sku)) throw new Error('Mã sản phẩm nội bộ phải có 2–80 ký tự chữ, số, dấu gạch hoặc dấu chấm.');
    const requestedVietnamese = clean(input.titleVietnamese || input.titleVi, 180);
    let title = translatedTitle({ ...input, offerId });
    if (requestedVietnamese) title = shortenVietnameseTitle(requestedVietnamese, { offerId, maxLength: input.titleMaxLength || 56 });
    if (input.titleLanguage === 'vi' && /[\u3400-\u9fff\uf900-\ufaff]/.test(title)) {
      title = shortenVietnameseTitle(fallbackVietnameseTitle({ sourceTitle: title, offerId }), { offerId, maxLength: input.titleMaxLength || 56 });
    }
    if (title.length < 3) throw new Error('Cần tiêu đề sản phẩm.');
    const translations = input.translationMap && typeof input.translationMap === 'object' ? input.translationMap : {};
    const options = normalizeOptions(optionValues(input), translations);
    const optionImages = normalizeOptionImages(input.optionImages, options, translations, { proxy: true });
    const variantImageMap = normalizeVariantImages(input.variantImages, { proxy: true });
    const variants = attachVariantImages(normalizeVariants(input, options, sku, translations), options, optionImages, {
      ...variantImageMap,
      ...deriveVariantImages(input.variants, options, optionImages, variantImageMap),
    });
    const galleryDirect = [...new Set((Array.isArray(input.gallery) ? input.gallery : []).map(value => imageUrl(value)).filter(Boolean))].slice(0, MAX_GALLERY_IMAGES);
    const detailImagesDirect = [...new Set((Array.isArray(input.detailImages) ? input.detailImages : []).map(value => imageUrl(value)).filter(Boolean))].slice(0, MAX_DETAIL_IMAGES);
    const videosDirect = [...new Set((Array.isArray(input.videos) ? input.videos : collectVideoUrls(input.videoUrl || input.video)).map(value => videoUrl(value)).filter(Boolean))].slice(0, MAX_VIDEOS);
    const gallery = galleryDirect.map(value => imageUrl(value, { proxy: true })).filter(Boolean);
    const detailImages = detailImagesDirect.map(value => imageUrl(value, { proxy: true })).filter(Boolean);
    const videos = videosDirect.map(value => videoUrl(value, { proxy: true })).filter(Boolean);
    const price = safeNumber(input.priceMinor ?? input.basePriceMinor, variants.length ? Math.min(...variants.map(variant => variant.price)) : 0);
    const stock = variants.length ? variants.reduce((sum, variant) => sum + variant.stock, 0) : safeNumber(input.stock, 0);
    const outputVariantImages = {
      ...variantImageMap,
      ...Object.fromEntries(variants.map(variant => [variant.id, variant.image]).filter(([, value]) => value)),
    };
    const titleLanguage = clean(input.titleLanguage || (input.titleVietnamese || input.titleVi ? 'vi' : input.titleEnglish || input.englishTitle ? 'en' : 'vi'), 12).toLowerCase();
    const source = {
      platform: '1688', offerId, shopId: clean(input.shopId, 120), shopName: clean(input.shopName || DEFAULT_SHOP_NAME, 160),
      sourceUrl: sourceUrl(input.sourceUrl || input.offerUrl || input.url, offerId), sourceTitle: clean(input.sourceTitle || input.title, 500),
      sourcePriceCny: Number.isFinite(Number(input.priceCny)) ? Number(input.priceCny) : null, translatedTitle: true, titleLanguage,
      targetCurrency: clean(input.targetCurrency || '', 8).toUpperCase(), regionId: clean(input.regionId || input.defaultRegionId || '', 40).toLowerCase(),
      baseCurrency: clean(input.baseCurrency || '', 8).toUpperCase(), baseCurrencyDecimals: Number.isInteger(Number(input.baseCurrencyDecimals)) ? Number(input.baseCurrencyDecimals) : null,
      exchangeRateCnyBase: Number.isFinite(Number(input.exchangeRateCnyBase)) ? Number(input.exchangeRateCnyBase) : null,
      exchangeRateCnyVnd: Number.isFinite(Number(input.exchangeRateCnyVnd)) ? Number(input.exchangeRateCnyVnd) : null,
      priceMultiplier: Number.isFinite(Number(input.priceMultiplier)) ? Number(input.priceMultiplier) : null, targetPriceVnd: Number.isSafeInteger(Number(input.priceVnd)) ? Number(input.priceVnd) : null,
      imageUrl: imageUrl(input.imageUrl || input.sourceImageUrl), imageUrls: galleryDirect, detailImages: detailImagesDirect, videos: videosDirect, descriptionUrl: clean(input.descriptionUrl, 2000), detailFetchedAt: clean(input.detailFetchedAt, 80), detailStatus: clean(input.detailStatus || (input.descriptionUrl ? 'available' : 'not_requested'), 40), syncedAt: new Date().toISOString(),
    };
    const regionalPrices = input.regionalPrices && typeof input.regionalPrices === 'object' && !Array.isArray(input.regionalPrices) ? input.regionalPrices : undefined;
    return {
      title, titleLanguage, sku,
      description: clean(input.description || `${title}. Sản phẩm nhập từ catalog 1688; cần kiểm tra size, màu và thông tin sản xuất trước khi mở bán.`, 12000),
      price, stock, status: ['Active', 'Draft', 'Archived'].includes(input.status) ? input.status : 'Draft',
      image: (/^assets\/[\w.-]+\.(png|jpe?g|webp|svg)$/i.test(String(input.image || '')) ? input.image : '') || imageUrl(input.image, { proxy: true }) || gallery[0] || imageUrl(input.imageUrl || input.sourceImageUrl, { proxy: true }) || FALLBACK_IMAGE,
      ...(gallery.length ? { gallery } : {}), ...(detailImages.length ? { detailImages } : {}), ...(videos.length ? { videos } : {}),
      ...(Object.keys(optionImages).length ? { optionImages } : {}),
      ...(Object.keys(outputVariantImages).length ? { variantImages: outputVariantImages } : {}),
      ...(Array.isArray(input.attributes) && input.attributes.length ? { attributes: input.attributes.slice(0, 80) } : {}),
      ...(clean(input.descriptionHtml, 200000) ? { descriptionHtml: proxyDescriptionHtml(input.descriptionHtml) } : {}),
      imageAlt: clean(input.imageAlt || `${title} — ảnh sản phẩm`, 180), brand: clean(input.brand || 'Nhà cung cấp 1688', 100),
      category: clean(input.category || 'Thời trang trẻ em', 80), tags: Array.isArray(input.tags) ? input.tags.map(tag => clean(tag, 40)).filter(Boolean).slice(0, 30) : ['1688', 'thời trang trẻ em'],
      slug: clean(input.slug || slugify(title, offerId), 160), seo: { title: clean(input.seo?.title || title, 160), description: clean(input.seo?.description || title, 320), noindex: true },
      options, variants, ...(regionalPrices ? { regionalPrices } : {}), source,
      amazon: { asin: '', prices: {} }, customization: { enabled: false, mode: 'personalize', version: 1, surfaces: [], productionDays: 3, proofRequired: false, instructions: '', syncState: 'draft', sellerCentralConfirmedAt: '' },
      updatedAt: new Date().toISOString(),
    };
  }

  function productFromOffer(offer, options = {}) {
    const id = clean(offer?.id, 30);
    const priceCny = Number(offer?.offerPrice ?? offer?.underLinePrice ?? offer?.handPrice ?? 0);
    const priceVnd = priceCnyToVnd(priceCny, options.exchangeRateCnyVnd, options.priceMultiplier ?? 2);
    const baseRate = Number(options.exchangeRateCnyBase || 0);
    const basePriceMinor = baseRate > 0 ? Math.round(priceCny * baseRate * (10 ** Number(options.baseCurrencyDecimals ?? 2))) : safeNumber(options.basePriceMinor, 0);
    const requestedTitle = clean(options.titleVi || options.titleVietnamese, 180);
    const titleVi = requestedTitle.length >= 3 ? requestedTitle : fallbackVietnameseTitle({ sourceTitle: offer?.subject, offerId: id });
    const shortTitleVi = shortenVietnameseTitle(titleVi, { offerId: id, maxLength: options.titleMaxLength || 56 });
    const gallery = offerImages(offer);
    const primaryImageUrl = gallery[0] || '';
    return toProduct({
      offerId: id, sku: options.skuPrefix ? `${options.skuPrefix}-${id}` : `1688-${id}`, titleVietnamese: shortTitleVi, titleLanguage: 'vi', sourceTitle: offer?.subject,
      priceCny, priceVnd, priceMinor: basePriceMinor, stock: 0, status: options.status || 'Draft', shopId: options.shopId || offer?.memberId || DEFAULT_SHOP_MEMBER_ID,
      shopName: options.shopName || DEFAULT_SHOP_NAME, sourceUrl: options.shopUrl || `https://detail.1688.com/offer/${id}.html`,
       imageUrl: primaryImageUrl, gallery, targetCurrency: 'VND', regionId: options.regionId || 'vn', exchangeRateCnyBase: options.exchangeRateCnyBase,
      baseCurrency: options.baseCurrency, baseCurrencyDecimals: options.baseCurrencyDecimals, exchangeRateCnyVnd: options.exchangeRateCnyVnd,
      priceMultiplier: options.priceMultiplier ?? 2, regionalPrices: { [options.regionId || 'vn']: priceVnd }, category: options.category || 'Thời trang trẻ em', tags: ['1688', 'thời trang trẻ em', 'bản nháp'],
    });
  }

  function meaningfulDescription(value, title = '') {
    const text = clean(value, 12000);
    if (!text || text.length < 24) return '';
    if (/^Sản phẩm nhập từ catalog 1688/i.test(text) && text.includes(title)) return '';
    return text;
  }

  // Merge only verified, non-empty supplier fields into an existing product.
  // An empty/CAPTCHA response must never erase a previously verified value.
  function mergeEnrichment(product, enrichment = {}) {
    const current = { ...(product || {}) };
    const media = value => [...new Set((Array.isArray(value) ? value : []).map(item => imageUrl(item, { proxy: true })).filter(Boolean))];
    const gallery = media([...(Array.isArray(current.gallery) ? current.gallery : []), ...(Array.isArray(enrichment.gallery) ? enrichment.gallery : [])]);
    const detailImages = media([...(Array.isArray(current.detailImages) ? current.detailImages : []), ...(Array.isArray(enrichment.detailImages) ? enrichment.detailImages : [])]);
    const videos = [...new Set((Array.isArray(enrichment.videos) ? enrichment.videos : collectVideoUrls(enrichment.videoUrl || enrichment.video)).map(item => videoUrl(item, { proxy: true })).filter(Boolean))].slice(0, MAX_VIDEOS);
    if (gallery.length) { current.gallery = gallery.slice(0, MAX_GALLERY_IMAGES); current.image = current.image && current.image !== FALLBACK_IMAGE ? current.image : gallery[0]; }
    else if (!current.image || current.image === FALLBACK_IMAGE) {
      const primary = imageUrl(enrichment.image || enrichment.imageUrl, { proxy: true });
      if (primary) current.image = primary;
    }
    if (detailImages.length) current.detailImages = detailImages.slice(0, MAX_DETAIL_IMAGES);
    if (videos.length) current.videos = videos;
    const description = meaningfulDescription(enrichment.description, current.title);
    if (description) current.description = description;
    if (typeof enrichment.descriptionHtml === 'string' && enrichment.descriptionHtml.trim()) current.descriptionHtml = clean(enrichment.descriptionHtml, 200000);
    if (Array.isArray(enrichment.attributes) && enrichment.attributes.length) current.attributes = enrichment.attributes.slice(0, 80);
    const translations = enrichment.translationMap && typeof enrichment.translationMap === 'object' ? enrichment.translationMap : {};
    if (Array.isArray(enrichment.options) && enrichment.options.length && Array.isArray(enrichment.variants) && enrichment.variants.length) {
      const options = normalizeOptions(enrichment.options, translations);
      const source = current.source && typeof current.source === 'object' ? current.source : {};
      const enrichmentSource = enrichment.source && typeof enrichment.source === 'object' ? enrichment.source : {};
      const variants = normalizeVariants({
        ...enrichment,
        priceMinor: current.price,
        regionId: enrichment.regionId || enrichmentSource.regionId || source.regionId || 'vn',
        exchangeRateCnyBase: enrichment.exchangeRateCnyBase ?? enrichmentSource.exchangeRateCnyBase ?? source.exchangeRateCnyBase,
        baseCurrencyDecimals: enrichment.baseCurrencyDecimals ?? enrichmentSource.baseCurrencyDecimals ?? source.baseCurrencyDecimals ?? 2,
        exchangeRateCnyVnd: enrichment.exchangeRateCnyVnd ?? enrichmentSource.exchangeRateCnyVnd ?? source.exchangeRateCnyVnd,
        priceMultiplier: enrichment.priceMultiplier ?? enrichmentSource.priceMultiplier ?? source.priceMultiplier,
      }, options, current.sku, translations);
      const complete = variants.filter(variant => Object.keys(variant.values).length === options.length);
      if (options.length && complete.length && complete.length <= MAX_IMPORT_VARIANTS) {
        current.options = options;
        current.variants = complete;
        const enabled = complete.filter(variant => variant.enabled);
        current.price = enabled.length ? Math.min(...enabled.map(variant => variant.price)) : 0;
        current.stock = enabled.reduce((sum, variant) => sum + variant.stock, 0);
      }
    }
    const mediaOptions = Array.isArray(current.options) && current.options.length ? current.options : (Array.isArray(enrichment.options) ? enrichment.options : []);
    const optionImages = normalizeOptionImages({ ...(current.optionImages || {}), ...(enrichment.optionImages || {}) }, mediaOptions, translations, { proxy: true });
    const suppliedVariantImages = normalizeVariantImages({ ...(current.variantImages || {}), ...(enrichment.variantImages || {}) }, { proxy: true });
    const derivedVariantImages = deriveVariantImages(current.variants, mediaOptions, optionImages, suppliedVariantImages);
    current.optionImages = optionImages;
    current.variantImages = Object.fromEntries(Object.entries({ ...suppliedVariantImages, ...derivedVariantImages }).filter(([, value]) => value));
    if (Array.isArray(current.variants) && current.variants.length) {
      current.variants = attachVariantImages(current.variants, mediaOptions, optionImages, current.variantImages);
    }
    current.source = {
      ...(current.source || {}),
      ...(enrichment.source && typeof enrichment.source === 'object' ? enrichment.source : {}),
      ...(enrichment.descriptionUrl ? { descriptionUrl: clean(enrichment.descriptionUrl, 2000) } : {}),
      ...(enrichment.detailStatus ? { detailStatus: clean(enrichment.detailStatus, 40) } : {}),
      ...(enrichment.detailFetchedAt ? { detailFetchedAt: clean(enrichment.detailFetchedAt, 80) } : {}),
      ...(gallery.length ? { imageUrls: gallery.map(item => imageUrl(item)) } : {}),
      ...(detailImages.length ? { detailImages: detailImages.map(item => imageUrl(item)) } : {}),
      ...(videos.length ? { videos: videos.map(item => videoUrl(item)) } : {}),
      syncedAt: new Date().toISOString(),
    };
    current.updatedAt = new Date().toISOString();
    if (current.source?.platform === '1688' || enrichment.translationMap) {
      const localized = localizeProduct(current, enrichment.translationMap || {}, { maxLength: enrichment.titleMaxLength || 56 });
      localized.updatedAt = current.updatedAt;
      return localized;
    }
    return current;
  }

  function enrichProduct(input = {}, detail = {}, description = {}) {
    const detailData = detailPayload(detail);
    const descriptionData = typeof description === 'string' ? parseDescriptionDocument(description) : (description || {});
    const merged = {
      ...input,
      gallery: detailData.gallery?.length ? detailData.gallery : input.gallery,
      videos: [...new Set([...(input.videos || []), ...(detailData.videos || []), ...(descriptionData.videos || [])])].slice(0, MAX_VIDEOS),
      options: detailData.options?.length ? detailData.options : input.options,
      variants: detailData.variants?.length ? detailData.variants : input.variants,
      optionImages: detailData.optionImages || input.optionImages,
      variantImages: detailData.variantImages || input.variantImages,
      attributes: detailData.attributes?.length ? detailData.attributes : input.attributes,
      descriptionUrl: detailData.descriptionUrl || input.descriptionUrl,
      description: descriptionData.text || input.description,
      descriptionHtml: descriptionData.html || input.descriptionHtml,
      detailImages: [...new Set([...(input.detailImages || []), ...(descriptionData.images || [])])],
      detailStatus: descriptionData.text || descriptionData.images?.length ? 'available' : 'blocked_or_empty',
      detailFetchedAt: new Date().toISOString(),
    };
    return input.id ? mergeEnrichment(input, merged) : toProduct(merged);
  }

  function upsert(products, product) {
    const list = Array.isArray(products) ? products : [];
    const index = list.findIndex(item => item?.sku?.toLowerCase() === product.sku.toLowerCase() || item?.source?.platform === '1688' && item.source.offerId === product.source.offerId);
    if (index < 0) return { products: [product, ...list], product, mode: 'created', index: 0 };
    const current = list[index];
    const merged = { ...current, ...product, id: current.id, source: { ...(current.source || {}), ...product.source }, updatedAt: new Date().toISOString() };
    const next = list.slice(); next[index] = merged;
    return { products: next, product: merged, mode: 'updated', index };
  }

  return Object.freeze({
    FALLBACK_IMAGE, MAX_GALLERY_IMAGES, MAX_DETAIL_IMAGES, MAX_VIDEOS, MTOP_ENDPOINT, MTOP_APP_KEY, OFFER_DETAIL_MTOP_ENDPOINT, OFFER_DETAIL_MTOP_API, DEFAULT_SHOP_MEMBER_ID, DEFAULT_SHOP_NAME, KNOWN_TITLES,
    clean, parseOfferUrl, isShopUrl, shopHost, sourceUrl, translatedTitle, fallbackVietnameseTitle, shortenVietnameseTitle, localizeProduct,
    priceCnyToVnd, parseJsonp, imageUrl, proxyImageUrl, videoUrl, proxyVideoUrl, collectVideoUrls, offerImages, parseDescriptionDocument, proxyDescriptionHtml, parseMobileOfferDocument, parseDesktopOfferDocument, detailPayload, normalizeDescriptionUrl, createMtopClient, createOfferDetailClient, fetchShopCatalog, translateTitleVi, translateTitles,
    translateOptionValues, localizedOptionValue, localizedOptionName,
    toProduct, productFromOffer, mergeEnrichment, enrichProduct, upsert,
  });
});
