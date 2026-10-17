/**
 * 首屏之前的登录态：在样式生效前给 `<html>` 打类，避免导航栏闪一下再纠正。
 *
 * 登录态唯一权威来源是服务端写在 `<html data-auth="guest|user|admin">` 上的结论
 * （见后端 `api/page_shell.py`）。`homeos_store_hint` cookie 只承载授权档位。
 */
(() => {
  const hint =
    document.cookie
      .split(";")
      .map((part) => part.trim())
      .find((part) => part.startsWith("homeos_store_hint="))
      ?.split("=")[1] || "";

  const server = document.documentElement.dataset.auth;
  const authenticated = server === "user" || server === "admin";

  if (server === "guest" && hint) {
    // 会话已经不在服务端了，把这个过期的提示清掉：否则它会影响这次以及后续页面的判断。
    document.cookie = "homeos_store_hint=; Max-Age=0; Path=/; SameSite=Lax";
  }

  // 授权档位只看 cookie（服务端属性不带这个信息）；服务端说没登录时一律不亮。
  const tier = authenticated ? hint : "";
  document.documentElement.classList.toggle("hb-auth-hint", authenticated);
  document.documentElement.classList.toggle(
    "hb-license-hint",
    ["licensed", "permanent"].includes(tier),
  );
  document.documentElement.classList.toggle(
    "hb-unlicensed-hint",
    ["unlicensed", "temporary"].includes(tier),
  );

  // 商店前台 body class 前移：登录舞台 CSS 依赖 body.hb-store-body，
  // 若等到 Vue 路由 watch 再挂，会出现 auth-stage 先 display:none 再弹出。
  // 写成独立 if + 提前 return，避免 minify 把 `!a && !b && sideEffect()` 压成
  // `!(a && b && sideEffect())` 导致副作用永远不执行。
  const path = location.pathname || "";
  if (path === "/admin" || path.startsWith("/admin/") || path === "/setup") {
    return;
  }
  document.body?.classList.add("hb-store-body");
})();
