/**
 * 首屏之前的登录态：在样式生效前给 `<html>` 打类，避免导航栏闪一下再纠正。
 *
 * 判断顺序很关键 —— **服务端结论优先于 cookie**：
 *
 * 1. 服务端渲染这一页时刚解过会话，把结论写在 `<html data-auth="guest|user|admin">`
 *    上（见后端 `api/page_shell.py`）。它是唯一权威来源。
 * 2. `homeos_store_hint` cookie 由前端自己维护，会话在服务端失效（过期 / 被别处退出 /
 *    库被重置）之后它仍会残留。只要还信它，游客就会被当成已登录：导航栏挂着账号入口，
 *    点进去再吃一个 401。
 * 3. 属性缺失（旧模板、单独部署的前端）才退回按 cookie 猜，保持向后兼容。
 */
(() => {
  const hint =
    document.cookie
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith('homeos_store_hint='))
      ?.split('=')[1] || '';
  const cookieAuthenticated = ['1', 'licensed', 'unlicensed', 'temporary', 'permanent'].includes(
    hint,
  );

  const server = document.documentElement.dataset.auth;
  const authenticated =
    server === 'guest' ? false : server === 'user' || server === 'admin' ? true : cookieAuthenticated;

  if (server === 'guest' && hint) {
    // 会话已经不在服务端了，把这个过期的提示清掉：否则它会影响这次以及后续页面的判断。
    document.cookie = 'homeos_store_hint=; Max-Age=0; Path=/; SameSite=Lax';
  }

  // 授权档位只看 cookie（服务端属性不带这个信息）；服务端说没登录时一律不亮。
  const tier = authenticated ? hint : '';
  document.documentElement.classList.toggle('hb-auth-hint', authenticated);
  document.documentElement.classList.toggle(
    'hb-license-hint',
    ['licensed', 'permanent'].includes(tier),
  );
  document.documentElement.classList.toggle(
    'hb-unlicensed-hint',
    ['unlicensed', 'temporary'].includes(tier),
  );

  // 商店前台 body class 前移：登录舞台 CSS 依赖 body.hb-store-body，
  // 若等到 Vue 路由 watch 再挂，会出现 auth-stage 先 display:none 再弹出。
  // 写成独立 if + 提前 return，避免 minify 把 `!a && !b && sideEffect()` 压成
  // `!(a && b && sideEffect())` 导致副作用永远不执行。
  const path = location.pathname || '';
  if (path === '/admin' || path.startsWith('/admin/') || path === '/setup') {
    return;
  }
  document.body?.classList.add('hb-store-body');
})();
