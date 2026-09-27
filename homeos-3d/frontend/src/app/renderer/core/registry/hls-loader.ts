/**
 * hls.js 的按需加载。
 */

type AnyObj = Record<string, any>;
const HLS_SCRIPT_URL = "/static/vendor/hls.js/1.7.3/hls.min.js";

let hlsLoadingPromise: any = null;

function windowHls(): any {
  return (window as any).Hls;
}

/**
 * 取到 hls.js 的命名空间（即页面里的 `window.Hls`）。
 * @returns {Promise<object|null>} 加载失败时返回 null；返回的 Promise 永不拒绝。
 */
export function loadHls() {
  if (typeof window !== "undefined" && windowHls()) {
    return Promise.resolve(windowHls());
  }
  if (hlsLoadingPromise) {
    return hlsLoadingPromise;
  }
  hlsLoadingPromise = new Promise((resolve: any) => {
    // 失败路径统一在这里收口：清掉缓存的 Promise，让下一次播放重新试。
    const settleFailure = () => {
      hlsLoadingPromise = null;
      resolve(null);
    };
    let script: any;
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
      const hlsNs = windowHls();
      if (hlsNs) {
        resolve(hlsNs);
        return;
      }
      settleFailure();
    };
    script.onerror = settleFailure;
    document.head.appendChild(script);
  });
  return hlsLoadingPromise;
}
