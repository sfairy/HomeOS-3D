/**
 * 配对链接入口：把地址栏上的配对哈希转交给宿主页面。
 */
(() => {
  "use strict";
  /**
   * 把地址栏上的配对哈希转发给宿主应用。
   */
  const forwardPairingHash = () => {
    // 无哈希时不做事；有哈希则先缓存、再清址、最后广播，顺序不可调换。
    location.hash &&
      ((window.__HA_BRIDGE_PAIRING_HASH__ = location.hash),
      history.replaceState(null, "", location.pathname + location.search),
      window.dispatchEvent(new Event("homeos-pairing-link")));
  };
  // 首次执行处理直接带哈希进来的情况，之后靠 hashchange 覆盖应用内跳转。
  (forwardPairingHash(), window.addEventListener("hashchange", forwardPairingHash));
})();
