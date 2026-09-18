/**
 * 配对链接入口：把地址栏上的配对哈希转交给宿主页面。
 *
 * 位置：配对链接落地的最前置脚本，早于主应用脚本执行。
 * 职责：识别 location.hash 中的配对信息，暂存到 window.__HA_BRIDGE_PAIRING_HASH__，
 *   随后立刻清掉地址栏哈希并派发 homeos-pairing-link 事件通知应用。
 * 约定：哈希必须先从地址栏移除再派发事件，避免用户刷新时重复触发配对；
 *   宿主通过监听 homeos-pairing-link 事件读取 __HA_BRIDGE_PAIRING_HASH__。
 */
(() => {
  "use strict";
  /**
   * 把地址栏上的配对哈希转发给宿主应用。
   *
   * 为什么要多这一层转发：本脚本是页面里的第一个脚本，必须在任何模块脚本改写
   * 地址栏之前把哈希抓下来；而哈希一旦被清掉就无法再次配对，所以先存进
   * window.__HA_BRIDGE_PAIRING_HASH__，再广播事件让宿主去读。
   * 顺序固定为「缓存 → 清址 → 广播」：先清址可避免用户刷新时重复触发配对，
   * 后广播则保证监听方读到的缓存已经就绪。
   *
   * @returns {void}
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
