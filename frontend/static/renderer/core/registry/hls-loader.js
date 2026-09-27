/**
 * hls.js 的按需加载。
 *
 * 为什么不在页面里静态引入：`hls.min.js` 是 605 KB（gzip 后 183 KB）的第三方库，而它只服务于
 * 摄像头面板的 HLS 播放这一条路径。两张入口页原本把它写成**同步** `<script>`（在 index.html
 * 里还排在 951 KB 的 home.js 之前 —— 它会把 HTML 解析一起挡住），于是每次打开都要先把它整份
 * 下载并执行；墙面板这种长年只显示仪表盘的部署，绝大部分会话根本用不到它。
 *
 * 三条约定：
 *
 *   1. **只注入一次**：并发调用共用同一个 Promise，重复调用不会插出第二个 `<script>`；
 *   2. **失败可重试**：注入失败（离线 / 404 / 被拦）**不把失败状态永久记下来**，下一次调用会
 *      重新试一遍 —— 摄像头是「点开才播」的路径，一次网络抖动不该让整台设备到下次重启前
 *      都用不了 HLS；
 *   3. **失败返回 null**：调用方据此走它原来的降级分支（原生 `<video src>`，Safari 直接吃
 *      HLS），与「浏览器本来就不支持 hls.js」是同一条路，不必再多分一叉。
 *
 * URL 是绝对路径 `/static/vendor/hls.js/<版本>/hls.min.js`，**不带 `?v=` 戳**：这是 vendor
 * 目录里第三方库的既有写法（版本号本身就写在路径里），与全站静态资源的戳互不干扰。
 */
const HLS_SCRIPT_URL = "/static/vendor/hls.js/1.7.3/hls.min.js";

let hlsLoadingPromise = null;

/**
 * 取到 hls.js 的命名空间（即页面里的 `window.Hls`）。
 * @returns {Promise<object|null>} 加载失败时返回 null；返回的 Promise 永不拒绝。
 */
export function loadHls() {
  if (typeof window !== "undefined" && window.Hls) {
    return Promise.resolve(window.Hls);
  }
  if (hlsLoadingPromise) {
    return hlsLoadingPromise;
  }
  hlsLoadingPromise = new Promise(resolve => {
    // 失败路径统一在这里收口：清掉缓存的 Promise，让下一次播放重新试。
    const settleFailure = () => {
      hlsLoadingPromise = null;
      resolve(null);
    };
    let script;
    try {
      script = document.createElement("script");
    } catch {
      settleFailure();
      return;
    }
    script.src = HLS_SCRIPT_URL;
    // 动态注入的脚本默认 async，这里显式写一遍：读代码的人不必去回想默认值。
    script.async = true;
    script.onload = () => {
      // 脚本执行完却没挂上 window.Hls（被拦成空文件 / 版本不对）同样按失败处理，
      // 否则这个「已经加载过」的结论会把后面每一次播放都钉死在降级分支上。
      if (window.Hls) {
        resolve(window.Hls);
        return;
      }
      settleFailure();
    };
    script.onerror = settleFailure;
    document.head.appendChild(script);
  });
  return hlsLoadingPromise;
}
