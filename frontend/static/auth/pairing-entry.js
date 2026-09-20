/**
 * 配对链接入口：把地址栏上的配对哈希转交给宿主页面。
 *
 * 位置：配对链接落地的最前置脚本，早于主应用脚本执行。识别 location.hash 中的配对信息，暂存到
 * window.__HA_BRIDGE_PAIRING_HASH__，再立刻清掉地址栏哈希并派发 homeos-pairing-link 事件通知应用。
 * 约定：哈希必须先从地址栏移除再派发事件，避免刷新时重复触发配对；宿主监听事件读取 __HA_BRIDGE_PAIRING_HASH__。
 */
(() => {
  "use strict";
  /**
   * 把地址栏上的配对哈希转发给宿主应用。
   * 本脚本必须第一个执行、在任何模块脚本改写地址栏前把哈希抓下来（哈希清掉就无法配对），故先存进
   * window.__HA_BRIDGE_PAIRING_HASH__ 再广播；顺序固定「缓存 → 清址 → 广播」，不可调换。
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
