(function (root) {
  'use strict';

  const client = root.CrocsSupabase;
  const state = { user: null, ready: false, allowed: false };
  const html = document.documentElement;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  function screen(message = '') {
    let mount = document.querySelector('#adminAuthScreen');
    if (!mount) {
      mount = document.createElement('main');
      mount.id = 'adminAuthScreen';
      mount.className = 'admin-auth-screen';
      document.body.prepend(mount);
    }
    mount.innerHTML = `<section class="admin-auth-card" aria-labelledby="adminAuthTitle">
      <div class="admin-auth-brand"><img src="assets/crocs-logo.svg" alt="Crocs"><span>Admin studio</span></div>
      <h1 id="adminAuthTitle">Đăng nhập quản trị</h1>
      <p>Quản lý catalog, đơn hàng và giao diện trong không gian được bảo vệ.</p>
      <form class="admin-auth-form" id="adminAuthForm">
        <label>Email công việc<input name="email" type="email" autocomplete="email" required placeholder="you@yourstore.com"></label>
        <label>Mật khẩu<input name="password" type="password" autocomplete="current-password" minlength="8" required placeholder="Tối thiểu 8 ký tự"></label>
        <button class="admin-auth-submit" type="submit">Đăng nhập</button>
      </form>
      <div class="admin-auth-switch"><span>Chưa có tài khoản?</span><button type="button" id="adminAuthMode">Tạo tài khoản đầu tiên</button></div>
      <p class="admin-auth-message" id="adminAuthMessage" role="alert">${esc(message)}</p>
      <p class="admin-auth-note">Storefront công khai chỉ nhận catalog và theme đã xuất bản. Dữ liệu khách hàng và đơn hàng không được mở cho khách vãng lai.</p>
    </section>`;
    bindScreen();
  }

  function bindScreen() {
    const form = document.querySelector('#adminAuthForm');
    const mode = document.querySelector('#adminAuthMode');
    let signUp = false;
    mode.onclick = () => {
      signUp = !signUp;
      document.querySelector('#adminAuthTitle').textContent = signUp ? 'Tạo tài khoản quản trị' : 'Đăng nhập quản trị';
      form.querySelector('button[type=submit]').textContent = signUp ? 'Tạo tài khoản' : 'Đăng nhập';
      mode.textContent = signUp ? 'Đã có tài khoản? Đăng nhập' : 'Tạo tài khoản đầu tiên';
      form.querySelector('[name=password]').autocomplete = signUp ? 'new-password' : 'current-password';
    };
    form.onsubmit = async event => {
      event.preventDefault();
      const submit = form.querySelector('button[type=submit]');
      const message = document.querySelector('#adminAuthMessage');
      submit.disabled = true; message.textContent = 'Đang kiểm tra phiên…'; message.className = 'admin-auth-message';
      const values = Object.fromEntries(new FormData(form).entries());
      try {
        const result = signUp
          ? await client.auth.signUp({ email: values.email.trim(), password: values.password })
          : await client.auth.signInWithPassword({ email: values.email.trim(), password: values.password });
        if (result.error) throw result.error;
        if (signUp && !result.data.session) {
          message.textContent = 'Đã tạo tài khoản. Hãy xác nhận email rồi đăng nhập.';
          message.className = 'admin-auth-message is-success';
          return;
        }
        await finish(result.data.session || (await client.auth.getSession()).data.session);
      } catch (error) {
        message.textContent = error.message || 'Không thể đăng nhập. Kiểm tra email và mật khẩu.';
      } finally { submit.disabled = false; }
    };
  }

  async function finish(session) {
    if (!session?.user) return screen('Phiên đăng nhập chưa sẵn sàng.');
    state.user = session.user;
    const { data, error } = await client.rpc('claim_default_store');
    if (error) throw error;
    if (!data?.member) {
      state.allowed = false;
      return screen('Tài khoản này chưa được cấp quyền cho cửa hàng. Hãy thêm thành viên trong Supabase rồi thử lại.');
    }
    state.allowed = true;
    state.ready = true;
    html.classList.remove('admin-auth-required');
    document.querySelector('#adminAuthScreen')?.remove();
    root.dispatchEvent(new CustomEvent('crocs:admin-ready', { detail: state }));
  }

  async function signOut() {
    await client?.auth?.signOut();
    location.reload();
  }

  root.CrocsAdminAuth = {
    state,
    get user() { return state.user; },
    ready: (async () => {
      html.classList.add('admin-auth-required');
      if (!client) { state.ready = true; screen('Bản build chưa có gói xác thực Supabase. Chạy npm run build rồi mở thư mục dist.'); return state; }
      const { data } = await client.auth.getSession();
      if (data.session) {
        try { await finish(data.session); }
        catch (error) { screen(error.message || 'Không thể kiểm tra quyền truy cập.'); }
      } else screen();
      return state;
    })(),
    signOut
  };
})(window);
