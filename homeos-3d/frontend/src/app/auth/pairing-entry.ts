/**
 * 配对链接捕获：把 `#code=` 摘进 `window.__HOMEOS_PAIRING_HASH__` 并立刻从地址栏抹掉。
 *
 * 这里保留模块顶层自跑，兼容仍在构建的经典 IIFE 产物（`/static/auth/pairing-entry.js`）。
 */
export function capturePairingHash(): void {
  // 只在配对面上工作：本模块随入口 chunk 在所有路由求值，若不设限，编辑器/工作室
  // 等页面的地址栏 hash 会被无辜抹掉。嵌入模式下 pathname 形如 /embed/<token>/pair。
  const onPairSurface = /(^|\/)pair\/?$/.test(location.pathname);
  if (!onPairSurface) return;
  const capture = () => {
    location.hash &&
      ((window.__HOMEOS_PAIRING_HASH__ = location.hash),
      history.replaceState(null, "", location.pathname + location.search),
      window.dispatchEvent(new Event("homeos-pairing-link")));
  };
  capture();
  window.addEventListener("hashchange", capture);
}

capturePairingHash();
