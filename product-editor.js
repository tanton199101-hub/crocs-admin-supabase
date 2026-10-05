(function (root) {
  'use strict';
  const M = root.CrocsProducts;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const money = value => new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(value / 100);
  const assets = ['arrival-classic-clog-100.png', 'arrival-crocband-runner-5AD.png', 'arrival-kids-classic-0DA.png', 'arrival-platform-bloom-001.png', 'arrival-getaway-001.png', 'arrival-ballet-6UR.png', 'icon-lined-206.png', 'jibbitz-sporty-90H.png'];
  const input = (name, label, value = '', attrs = '') => `<label class="field"><span>${label}</span><input name="${name}" value="${esc(value)}" ${attrs}></label>`;
  const decimal = value => value == null ? '' : (value / 100).toFixed(2);
  const priceAttrs = 'type="number" min="0" max="1000000" step="0.01" inputmode="decimal"';
  const stockAttrs = 'type="number" min="0" max="1000000" step="1" inputmode="numeric"';

  function open({ mount, product, products, collections, onSave, onClose, focusSection = '' }) {
    const original = M.clone(product);
    let draft = { brand: 'Crocs', imageAlt: '', compareAt: null, cost: null, options: [], variants: [], ...M.clone(product), seo: { title: '', description: '', noindex: false, ...product.seo } };
    let selected = new Set(), filter = '', undo = null, saving = false, slugManual = !!draft.slug;
    let optionsPending = false;
    draft.slug ||= M.slugify(draft.title);
    const $ = selector => mount.querySelector(selector);
    const $$ = selector => [...mount.querySelectorAll(selector)];
    const notice = message => { $('#productEditorNotice').textContent = message; };
    const error = message => { const box = $('#productEditorError'); box.textContent = message; box.hidden = !message; if (message) box.scrollIntoView({ block: 'nearest' }); };
    const markDirty = () => { $('#productEditorForm').dataset.dirty = 'true'; $('#productSaveState').textContent = 'Có thay đổi chưa lưu'; };
    function readOptions() { return $$('.pe-option').map(row => ({ id: row.dataset.option, name: row.querySelector('[data-option-name]').value, values: row.querySelector('[data-option-values]').value.split(',') })); }
    function readFields() {
      const fd = new FormData($('#productEditorForm'));
      for (const name of ['title', 'description', 'sku', 'category', 'brand', 'imageAlt', 'slug', 'status']) draft[name] = String(fd.get(name) || '').trim();
      draft.tags = String(fd.get('tags') || '').split(',').map(x => x.trim()).filter(Boolean);
      draft.seo = { title: String(fd.get('seoTitle') || '').trim(), description: String(fd.get('seoDescription') || '').trim(), noindex: fd.has('noindex') };
    }
    function readPricing() {
      draft.price = M.amount($('[name=price]').value);
      draft.compareAt = $('[name=compareAt]').value === '' ? null : M.amount($('[name=compareAt]').value, 'Giá niêm yết');
      draft.cost = $('[name=cost]').value === '' ? null : M.amount($('[name=cost]').value, 'Giá vốn');
      draft.stock = M.count($('[name=stock]').value);
      $$('.pe-variant-row').forEach(row => {
        const v = draft.variants.find(v => v.id === row.dataset.variant);
        ['sku', 'barcode'].forEach(name => { v[name] = row.querySelector(`[data-v-field="${name}"]`).value.trim(); });
        v.price = M.amount(row.querySelector('[data-v-field=price]').value, v.sku || 'Giá biến thể');
        for (const name of ['compareAt', 'cost']) { const text = row.querySelector(`[data-v-field="${name}"]`).value; v[name] = text === '' ? null : M.amount(text); }
        v.stock = M.count(row.querySelector('[data-v-field=stock]').value);
        v.enabled = row.querySelector('[data-v-field=enabled]').checked;
      });
    }
    function optionMarkup(o) {
      return `<div class="pe-option" data-option="${esc(o.id)}"><label class="field"><span>Thuộc tính</span><input data-option-name value="${esc(o.name)}" maxlength="40" placeholder="Màu sắc"></label><label class="field"><span>Giá trị, ngăn cách bằng dấu phẩy</span><input data-option-values value="${esc(o.values.join(', '))}" placeholder="Trắng, Đen, Hồng"></label><button type="button" class="pe-icon" data-pe="remove-option" aria-label="Bỏ thuộc tính ${esc(o.name)}">×</button></div>`;
    }
    function variantMarkup(v) {
      const title = M.variantTitle(draft, v);
      const cell = (name, value, attrs = '') => `<input data-v-field="${name}" value="${esc(value)}" aria-label="${esc(({ price: 'Giá bán', compareAt: 'Giá niêm yết', stock: 'Tồn kho', sku: 'SKU', cost: 'Giá vốn', barcode: 'Barcode' })[name])} ${esc(title)}" ${attrs}>`;
      return `<tr class="pe-variant-row" data-variant="${esc(v.id)}"><td><input type="checkbox" data-v-select="${esc(v.id)}" aria-label="Chọn ${esc(title)}" ${selected.has(v.id) ? 'checked' : ''}></td><td class="pe-variant-name"><strong>${esc(title)}</strong><small>${v.enabled ? 'Đang bật' : 'Tạm tắt'}</small><details><summary>Giá vốn & barcode</summary><label>Giá vốn (£)${cell('cost', decimal(v.cost), priceAttrs)}</label><label>Barcode${cell('barcode', v.barcode || '', 'maxlength="50"')}</label></details></td><td>${cell('sku', v.sku, 'maxlength="90" required')}</td><td>${cell('price', decimal(v.price), `${priceAttrs} required`)}</td><td>${cell('compareAt', decimal(v.compareAt), priceAttrs)}</td><td>${cell('stock', v.stock, `${stockAttrs} required`)}</td><td><input type="checkbox" data-v-field="enabled" aria-label="Bật ${esc(title)}" ${v.enabled ? 'checked' : ''}></td><td><button type="button" class="pe-icon" data-pe="remove-variant" data-id="${esc(v.id)}" aria-label="Bỏ biến thể ${esc(title)}">×</button></td></tr>`;
    }
    function visibleVariants() { return draft.variants.filter(v => `${M.variantTitle(draft, v)} ${v.sku}`.toLowerCase().includes(filter.toLowerCase())); }
    function selectionUI() {
      $('#variantSelectionCount').textContent = `${selected.size} biến thể đã chọn`;
      const visible = visibleVariants();
      $('#selectVisibleVariants').checked = visible.length > 0 && visible.every(v => selected.has(v.id));
      $('#selectVisibleVariants').indeterminate = visible.some(v => selected.has(v.id)) && !$('#selectVisibleVariants').checked;
      $('[data-pe=apply-bulk]').disabled = !selected.size;
    }
    function renderVariants() {
      const visible = visibleVariants();
      $('#variantRows').innerHTML = visible.map(variantMarkup).join('');
      $('#variantEmpty').hidden = visible.length > 0;
      $('#variantEmpty').textContent = draft.variants.length ? 'Không có biến thể khớp bộ lọc.' : 'Chưa có biến thể. Thêm thuộc tính rồi tạo tổ hợp bên trên.';
      $('#variantCount').textContent = `${visible.length}/${draft.variants.length} biến thể`;
      $('#variantWork').hidden = !draft.variants.length;
      $('#baseStock').hidden = !!draft.variants.length;
      $('#basePriceHint').textContent = draft.variants.length ? 'Giá mặc định chỉ dùng cho biến thể mới. Giá hiển thị = giá thấp nhất của biến thể đang bật.' : 'Giá bán và tồn kho cho sản phẩm chưa có biến thể.';
      $('[data-pe=undo-bulk]').disabled = !undo;
      selectionUI(); refreshPreview();
    }
    function refreshPreview() {
      readFields();
      const report = M.seoReport(draft), passed = report.filter(x => x.ok).length;
      $('#seoTitleCount').textContent = `${draft.seo.title.length}/60 ký tự gợi ý`;
      $('#seoDescriptionCount').textContent = `${draft.seo.description.length}/160 ký tự gợi ý`;
      $('#searchTitle').textContent = draft.seo.title || draft.title || 'Tên sản phẩm của bạn';
      $('#searchDescription').textContent = draft.seo.description || draft.description || 'Mô tả ngắn giúp người tìm kiếm hiểu rõ điểm khác biệt của sản phẩm.';
      $('#searchUrl').textContent = `${location.protocol === 'file:' ? 'your-store.example' : location.host}/product.html?id=${draft.id || 'new'}&slug=${draft.slug || 'ten-san-pham'}`;
      $('#seoChecklist').innerHTML = report.map(item => `<li class="${item.ok ? 'is-done' : ''}"><span aria-hidden="true">${item.ok ? '✓' : '○'}</span>${esc(item.label)}</li>`).join('');
      $('#seoProgress').textContent = `${passed}/${report.length} gợi ý đã đạt`;
      $('#seoProgressBar').value = passed;
      $('#productPreviewTitle').textContent = draft.title || 'Sản phẩm mới';
      $('#productPreviewImage').alt = draft.imageAlt || draft.title || 'Ảnh sản phẩm';
      const active = draft.variants.filter(v => v.enabled);
      const min = active.length ? Math.min(...active.map(v => v.price)) : Number($('[name=price]').value || 0) * 100;
      const max = active.length ? Math.max(...active.map(v => v.price)) : min;
      $('#productPreviewPrice').textContent = Number.isFinite(min) ? `${money(min)}${max > min ? ` – ${money(max)}` : ''}` : '—';
      $('#productStockSummary').textContent = draft.variants.length ? `${active.reduce((n, v) => n + v.stock, 0)} khả dụng / ${active.length} biến thể đang bật` : `${$('[name=stock]').value || 0} khả dụng`;
      const sale = Number($('[name=price]').value), cost = $('[name=cost]').value;
      $('#productMargin').textContent = cost !== '' && sale > 0 ? `Lợi nhuận gộp ước tính: ${money(Math.round((sale - Number(cost)) * 100))} / ${((sale - Number(cost)) / sale * 100).toFixed(1)}% (chưa tính phí, thuế).` : 'Nhập giá vốn để xem biên lợi nhuận ước tính.';
    }
    mount.innerHTML = `<form id="productEditorForm" class="pe-workspace" data-dirty="false">
      <header class="pe-heading"><div class="pe-heading-title"><button type="button" class="pe-back" data-pe="close" aria-label="Về danh sách sản phẩm">←</button><div><h1 tabindex="-1">${product.id ? 'Chỉnh sửa sản phẩm' : 'Tạo sản phẩm mới'}</h1><p>Nội dung tốt. Đúng biến thể. Đúng giá.</p></div></div><div class="pe-save-actions"><span id="productSaveState">${product.id ? 'Bản đã lưu' : 'Bản nháp mới'}</span><button type="button" class="button button--quiet" data-pe="close">Hủy</button><button class="button button--green" type="submit">Lưu sản phẩm</button></div></header>
      <nav class="pe-sections" aria-label="Phần biên tập sản phẩm">${[['content', 'Nội dung'], ['pricing', 'Giá bán'], ['variants', 'Biến thể'], ['seo', 'SEO']].map(([id, title]) => `<button type="button" data-pe="jump" data-section="${id}">${title}</button>`).join('')}</nav>
      <p id="productEditorError" class="form-error" role="alert" hidden></p><p id="productEditorNotice" class="pe-notice" role="status" aria-live="polite">Thay đổi chỉ áp dụng khi bấm Lưu sản phẩm. Ctrl/Cmd + S để lưu nhanh.</p>
      <div class="pe-layout"><div class="pe-main-column">
        <section class="pe-card" id="pe-content"><header><h2>Thông tin sản phẩm</h2><p>Viết cho người mua: kiểu dáng, chất liệu, độ vừa vặn và cách sử dụng.</p></header>
          ${input('title', 'Tên sản phẩm', draft.title, 'required maxlength="120" placeholder="Ví dụ: Classic Clog – nhẹ, thoáng, dễ phối đồ"')}
          <label class="field"><span>Mô tả sản phẩm</span><textarea name="description" rows="6" maxlength="10000" placeholder="Sản phẩm này phù hợp với ai? Điều gì làm nó khác biệt?">${esc(draft.description)}</textarea></label>
          <div class="pe-media"><img id="productMediaImage" src="${esc(draft.image)}" alt="Ảnh đang chọn"><div><strong>Ảnh đại diện</strong><p>PNG, JPG hoặc WebP · tối đa 400 KB</p><label class="field"><span>Chọn ảnh thư viện</span><select name="mediaAsset"><option value="">Giữ ảnh hiện tại</option>${assets.map(a => `<option value="assets/${a}" ${draft.image === `assets/${a}` ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></label><label class="field"><span>Hoặc tải ảnh mới</span><input type="file" name="upload" accept="image/png,image/jpeg,image/webp"></label></div></div>
          ${input('imageAlt', 'Văn bản thay thế ảnh (alt text)', draft.imageAlt, 'maxlength="180" placeholder="Ví dụ: Dép Classic Clog trắng, nhìn nghiêng"')}
        </section>
        <section class="pe-card" id="pe-pricing"><header><h2>Giá bán & giá vốn</h2><p id="basePriceHint"></p></header><div class="pe-three-columns">${input('price', 'Giá bán (£)', decimal(draft.price), `${priceAttrs} required`)}${input('compareAt', 'Giá niêm yết (£)', decimal(draft.compareAt), `${priceAttrs} placeholder="Không giảm giá"`)}${input('cost', 'Giá vốn (£)', decimal(draft.cost), `${priceAttrs} placeholder="Tùy chọn"`)}</div><p class="pe-help" id="productMargin"></p><div class="form-grid">${input('sku', 'SKU gốc', draft.sku, 'required maxlength="60" placeholder="CLC-2026"')}<div id="baseStock">${input('stock', 'Tồn kho khả dụng', draft.stock, `${stockAttrs} required`)}</div></div></section>
        <section class="pe-card pe-variants" id="pe-variants"><header class="pe-card-title"><div><h2>Biến thể sản phẩm</h2><p>Màu × size × chất liệu. Mỗi tổ hợp có SKU, giá và tồn kho riêng.</p></div><span class="pe-pill" id="variantCount"></span></header>
           <div class="pe-preset-row"><span>Tạo nhanh thuộc tính</span><button type="button" data-pe="preset-colour">+ Màu sắc</button><button type="button" data-pe="preset-size">+ Size UK</button><button type="button" data-pe="add-option">+ Tùy chỉnh</button></div><div id="productOptions">${draft.options.map(optionMarkup).join('')}</div>
           <div class="pe-generate"><button type="button" class="button button--dark" data-pe="generate">Tạo / cập nhật tổ hợp</button><p>Tối đa 3 thuộc tính, 100 tổ hợp trong bản này. Biến thể mới bắt đầu với giá £0 và tồn 0; hãy nhập giá bán &gt; £0 và tồn khả dụng &gt; 0 cho ít nhất một dòng trước khi chuyển sang Đang bán. Giá/SKU của tổ hợp cũ được giữ nguyên.</p></div><p id="variantEmpty" class="pe-empty"></p>
          <div id="variantWork"><div class="pe-variant-toolbar"><label class="field"><span>Lọc biến thể</span><input type="search" id="variantFilter" placeholder="Màu, size hoặc SKU"></label><strong id="variantSelectionCount">0 biến thể đã chọn</strong><button type="button" class="button button--quiet" data-pe="select-all">Chọn tất cả</button><button type="button" class="button button--quiet" data-pe="clear-selection">Bỏ chọn</button></div>
          <div class="pe-bulk"><label class="field"><span>Chỉnh các dòng đã chọn</span><select id="variantBulkOperation"><option value="price">Đặt giá bán (£)</option><option value="price-percent">Tăng / giảm giá (%)</option><option value="price-delta">Cộng / trừ giá (£)</option><option value="compareAt">Đặt / xóa giá niêm yết (£)</option><option value="stock">Đặt tồn kho</option><option value="stock-delta">Cộng / trừ tồn kho</option><option value="enabled">Bật / tắt biến thể</option></select></label><label class="field"><span>Giá trị</span><input id="variantBulkValue" inputmode="decimal" placeholder="Ví dụ: 39.99 hoặc -10"><select id="variantBulkEnabled" hidden><option value="true">Bật bán</option><option value="false">Tắt bán</option></select></label><button type="button" class="button button--green" data-pe="apply-bulk" disabled>Áp dụng</button><button type="button" class="button button--quiet" data-pe="undo-bulk" disabled>Hoàn tác</button></div>
          <p class="pe-help">Chọn dòng trước khi áp dụng. Lọc không bỏ các lựa chọn ngoài màn hình. Giá tiền lưu bằng pence để tránh sai số.</p><div class="pe-table-scroll" role="region" aria-label="Bảng biến thể, cuộn ngang trên mobile" tabindex="0"><table class="pe-table"><thead><tr><th><input type="checkbox" id="selectVisibleVariants" aria-label="Chọn các biến thể đang hiển thị"></th><th>Biến thể</th><th>SKU</th><th>Giá (£)</th><th>Niêm yết (£)</th><th>Tồn</th><th>Bán</th><th></th></tr></thead><tbody id="variantRows"></tbody></table></div></div>
        </section>
        <section class="pe-card" id="pe-seo"><header><h2>Tối ưu tìm kiếm</h2><p>Xem trước cách nội dung có thể xuất hiện trên Google.</p></header><div class="pe-search-preview"><small>Cửa hàng của bạn</small><div id="searchUrl"></div><h3 id="searchTitle"></h3><p id="searchDescription"></p></div>
          ${input('seoTitle', 'Tiêu đề SEO', draft.seo.title, 'maxlength="200" placeholder="Để trống để dùng tên sản phẩm"')}<small id="seoTitleCount" class="pe-counter"></small><label class="field"><span>Mô tả tìm kiếm</span><textarea name="seoDescription" rows="3" maxlength="500" placeholder="Lợi ích chính, thuộc tính nổi bật và lời mời tìm hiểu.">${esc(draft.seo.description)}</textarea></label><small id="seoDescriptionCount" class="pe-counter"></small>
          <div class="pe-slug">${input('slug', 'Đường dẫn (slug)', draft.slug, 'required maxlength="100" pattern="[a-z0-9]+(-[a-z0-9]+)*"')}<button type="button" class="button button--quiet" data-pe="slug">Tạo từ tên</button></div><label class="pe-checkbox"><input type="checkbox" name="noindex" ${draft.seo.noindex ? 'checked' : ''}> Không cho công cụ tìm kiếm lập chỉ mục (noindex)</label><p class="pe-help">Độ dài là gợi ý biên tập, không phải tiêu chí xếp hạng. Google có thể tự viết lại tiêu đề hoặc mô tả. Slug là nhãn URL; ID sản phẩm vẫn giữ ổn định.</p>
        </section>
       </div><aside class="pe-side-column"><section class="pe-card"><header><h2>Xuất bản & phân loại</h2></header><label class="field"><span>Trạng thái</span><select name="status"><option value="Draft" ${draft.status === 'Draft' ? 'selected' : ''}>Bản nháp</option><option value="Active" ${draft.status === 'Active' ? 'selected' : ''}>Đang bán</option><option value="Archived" ${draft.status === 'Archived' ? 'selected' : ''}>Lưu trữ</option></select><small class="pe-help">Đang bán chỉ lưu được khi giá bán &gt; £0 và còn tồn khả dụng. Với sản phẩm có biến thể, ít nhất một dòng phải được bật.</small></label>${input('category', 'Danh mục', draft.category, 'required maxlength="80"')}${input('brand', 'Thương hiệu', draft.brand, 'maxlength="80"')}${input('tags', 'Tags', draft.tags?.join(', '), 'placeholder="clog, unisex, summer" maxlength="300"')}<fieldset class="pe-collections"><legend>Bộ sưu tập</legend>${collections.map(c => `<label><input type="checkbox" name="collectionIds" value="${esc(c.id)}" ${c.productIds.includes(product.id) ? 'checked' : ''}> ${esc(c.title)}</label>`).join('') || '<p>Chưa có bộ sưu tập.</p>'}</fieldset></section>
        <section class="pe-card pe-preview"><img id="productPreviewImage" src="${esc(draft.image)}" alt=""><h2 id="productPreviewTitle"></h2><strong id="productPreviewPrice"></strong><p id="productStockSummary"></p><small>Xem trước từ nội dung đang chỉnh</small></section>
        <section class="pe-card"><header><h2>Kiểm tra nội dung</h2><p id="seoProgress"></p></header><progress id="seoProgressBar" max="7" value="0" aria-label="Mức hoàn thiện nội dung SEO"></progress><ul class="pe-checklist" id="seoChecklist"></ul><p class="pe-help">Đây là checklist nội dung, không phải điểm SEO của Google.</p></section>
         <section class="pe-note"><strong>Kiểm tra trước khi bán</strong><p>Xác nhận tài khoản có quyền quản trị, chạy một checkout ở Test mode và kiểm tra webhook trước khi bật bán thật. Khi Stripe chưa sẵn sàng, storefront chỉ giữ chế độ demo — không thu tiền hoặc gửi hàng.</p></section>
      </aside></div></form>`;
    function doClose() { if (!saving && ($('#productEditorForm').dataset.dirty !== 'true' || confirm('Bỏ các thay đổi chưa lưu của sản phẩm?'))) onClose(); }
    function setImage(src) { draft.image = src; $('#productMediaImage').src = src; $('#productPreviewImage').src = src; markDirty(); refreshPreview(); }
    $('#productEditorForm').addEventListener('input', event => {
      if (event.target.matches('#variantFilter, #variantBulkValue')) return;
      markDirty();
      if (event.target.closest('.pe-option')) optionsPending = true;
      if (event.target.name === 'slug') slugManual = true;
      if (event.target.name === 'title' && !slugManual) $('[name=slug]').value = M.slugify(event.target.value);
      if (event.target.matches('[data-v-field]')) { undo = null; $('[data-pe=undo-bulk]').disabled = true; try { readPricing(); } catch { /* Keep the partial input visible until apply/save. */ } }
      refreshPreview();
    });
    $('#productEditorForm').addEventListener('change', async event => {
      const el = event.target;
      if (el.matches('[data-v-select]')) { if (el.checked) selected.add(el.dataset.vSelect); else selected.delete(el.dataset.vSelect); selectionUI(); return; }
      if (el.id === 'selectVisibleVariants') { visibleVariants().forEach(v => el.checked ? selected.add(v.id) : selected.delete(v.id)); $$('[data-v-select]').forEach(cb => { cb.checked = selected.has(cb.dataset.vSelect); }); selectionUI(); return; }
      if (el.id === 'variantBulkOperation') { $('#variantBulkEnabled').hidden = el.value !== 'enabled'; $('#variantBulkValue').hidden = el.value === 'enabled'; return; }
      if (el.name === 'mediaAsset' && el.value) setImage(el.value);
      if (el.name === 'upload' && el.files[0]) {
        const file = el.files[0];
        if (file.size > 400 * 1024 || !['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) { el.value = ''; return error('Chọn ảnh PNG/JPG/WebP tối đa 400 KB.'); }
        saving = true; $('[type=submit]').disabled = true;
        try { const src = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = reject; reader.readAsDataURL(file); }); setImage(src); error(''); }
        catch { error('Không đọc được ảnh. Hãy chọn lại.'); }
        finally { saving = false; $('[type=submit]').disabled = false; }
      }
      if (el.name === 'status' || el.name === 'noindex' || el.matches('[data-v-field]')) { markDirty(); try { readPricing(); } catch {} refreshPreview(); }
    });
    $('#variantFilter').addEventListener('input', event => { try { readPricing(); filter = event.target.value; renderVariants(); } catch (e) { error(e.message); } });
    $('#productEditorForm').addEventListener('click', event => {
      const button = event.target.closest('[data-pe]'); if (!button || saving) return;
      const action = button.dataset.pe;
      try {
        error('');
        if (action === 'close') return doClose();
        if (action === 'jump') return $(`#pe-${button.dataset.section}`).scrollIntoView({ behavior: 'auto', block: 'start' });
        if (action === 'slug') { $('[name=slug]').value = M.slugify($('[name=title]').value); slugManual = false; markDirty(); return refreshPreview(); }
        if (['preset-colour', 'preset-size', 'add-option'].includes(action)) {
          const current = readOptions(); if (current.length >= 3) throw new Error('Tối đa 3 thuộc tính.');
          const o = action === 'preset-colour' ? { name: 'Màu sắc', values: ['Trắng', 'Đen', 'Hồng'] } : action === 'preset-size' ? { name: 'Size UK', values: ['4', '5', '6', '7', '8'] } : { name: '', values: [] };
          if (o.name && current.some(x => x.name.toLowerCase() === o.name.toLowerCase())) throw new Error('Thuộc tính này đã có. Chỉnh các giá trị trực tiếp.');
          o.id = `opt-${Date.now().toString(36)}-${current.length}`;
          $('#productOptions').insertAdjacentHTML('beforeend', optionMarkup(o)); optionsPending = true; markDirty(); return;
        }
        if (action === 'remove-option') { button.closest('.pe-option').remove(); optionsPending = true; markDirty(); return; }
        if (action === 'generate') {
          readFields(); readPricing(); const options = M.cleanOptions(readOptions());
          const next = M.generate(options, draft.variants, draft);
          const removed = draft.variants.filter(v => !next.some(n => n.id === v.id));
          if (removed.length && !confirm(`Thay đổi thuộc tính sẽ bỏ ${removed.length} biến thể khỏi bản nháp. Giá và tồn của các dòng bị bỏ sẽ mất khi lưu. Tiếp tục?`)) return;
          undo = null; draft.options = options; draft.variants = next; selected.clear(); optionsPending = false; renderVariants(); markDirty(); notice(`Đã tạo ${next.length} tổ hợp. Biến thể mới có giá £0 và tồn 0; hãy nhập giá bán lớn hơn 0 và tồn thực tế trước khi bật bán.`); return;
        }
        if (action === 'select-all') { selected = new Set(draft.variants.map(v => v.id)); $$('[data-v-select]').forEach(cb => { cb.checked = true; }); return selectionUI(); }
        if (action === 'clear-selection') { selected.clear(); $$('[data-v-select]').forEach(cb => { cb.checked = false; }); return selectionUI(); }
        readPricing();
        if (action === 'apply-bulk') {
          const operation = $('#variantBulkOperation').value, value = operation === 'enabled' ? $('#variantBulkEnabled').value : $('#variantBulkValue').value;
          const next = M.bulk(draft.variants, [...selected], operation, value);
          undo = M.clone(draft.variants); draft.variants = next; renderVariants(); markDirty(); notice(`Đã điều chỉnh ${selected.size} biến thể trong bản nháp. Có thể hoàn tác trước khi lưu.`);
        } else if (action === 'undo-bulk' && undo) { draft.variants = undo; undo = null; renderVariants(); markDirty(); notice('Đã hoàn tác điều chỉnh hàng loạt vừa rồi.'); }
        else if (action === 'remove-variant') {
          if (!confirm('Bỏ biến thể này khỏi bản nháp? Dữ liệu chỉ thay đổi sau khi lưu.')) return;
          draft.variants = draft.variants.filter(v => v.id !== button.dataset.id); selected.delete(button.dataset.id); undo = null;
          if (!draft.variants.length) { draft.options = []; $('#productOptions').innerHTML = ''; optionsPending = false; }
          renderVariants(); markDirty();
        }
      } catch (e) { error(e.message); }
    });
    $('#productEditorForm').addEventListener('submit', async event => {
      event.preventDefault(); if (saving) return;
      const button = $('[type=submit]');
      try {
        error(''); readFields(); readPricing();
        if (optionsPending) throw new Error('Thuộc tính đã thay đổi. Bấm Tạo / cập nhật tổ hợp trước khi lưu.');
        draft = M.aggregate(draft); M.validate(draft, products);
        saving = true; button.disabled = true; button.textContent = 'Đang lưu…';
        await onSave(M.clone(draft), new FormData(event.currentTarget).getAll('collectionIds'), original);
      } catch (e) { error(e.message); }
      finally { saving = false; button.disabled = false; button.textContent = 'Lưu sản phẩm'; }
    });
    $('#productEditorForm').addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); event.currentTarget.requestSubmit(); } });
    renderVariants(); $('h1').focus();
    if (focusSection) $(`#pe-${focusSection}`)?.scrollIntoView({ block: 'start' });
    return { close: doClose };
  }
  root.CrocsProductEditor = { open };
})(window);
