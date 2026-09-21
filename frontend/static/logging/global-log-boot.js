/**
 * 全局日志上报的启动引导（编辑器 / 面板侧）：早于业务脚本执行，把 global-log.js 接到真实接口上。
 *
 * 把一个极简的 JSON 请求封装注入 setupGlobalLog，让日志模块能上报到 /api/v1 下的日志接口。
 * 约定：请求一律 cache: "no-store"；401 视为会话失效直接跳登录页；只有带 body 时才声明
 * Content-Type: application/json；超时预算统一由 utils/api-fetch.js 决定。
 */
import { setupGlobalLog } from "./global-log.js?v=20260921151446";
import { apiAuthChallenge, apiRequestError } from "../utils/api-request.js?v=20260921151446";
import { apiFetch } from "../utils/api-fetch.js?v=20260921151446";

/**
 * 发送 JSON 请求并做统一的错误处理。
 * 超时交给 apiFetch（普通 20 秒、上传 3 分钟）：日志上报悬挂时也必须抛错，否则调用方会一直停在「正在上报」。
 *
 * 只有会话失效分支、没有授权受限分支：日志接口（backend/api/global_logs.py）过的是 CurrentUser /
 * CurrentViewer，不过授权门禁 —— 授权坏掉时恰恰最需要收得到日志。
 * 判定与错误形态仍取自 utils/api-request.js（同一套码），只是构造时不挂日志桥：本模块就是日志桥的
 * 传输层，自己上报失败时再回头关联「已上报」标记没有意义。
 *
 * @throws {Error} 会话失效、超时、HTTP 失败或响应不是合法 JSON。
 */
async function requestJson(path, init = {}) {
  const response = await apiFetch("/api/v1" + path, {
    cache: "no-store",
    ...init,
    // 只有确实要发 body 时才加 Content-Type，否则会触发预检且语义不符。
    headers: init.body
      ? {
          "Content-Type": "application/json",
          ...(init.headers || {})
        }
      : init.headers
  });
  // 204 无内容；其余情况按文本读入再尝试解析，兼容非 JSON 的错误页。
  const bodyText = response.status === 204 ? "" : await response.text();
  let payload = null;
  if (bodyText) {
    try {
      payload = JSON.parse(bodyText);
    } catch {
      // 响应本身是成功的却没解析出 JSON，说明接口契约被破坏，必须报错。
      if (response.ok) {
        throw new Error("接口返回格式异常：" + path.split("?")[0]);
      }
    }
  }
  const authChallenge = apiAuthChallenge(response.status, payload);
  if (authChallenge === "session-expired") {
    window.location.assign("/login");
    throw apiRequestError(payload, {
      status: response.status,
      message: "登录状态已失效。",
      link: false
    });
  }
  if (!response.ok) {
    // 文案归一交给 utils/api-error.js，它认得字符串、`detail.message` 与 FastAPI 422 数组。
    throw apiRequestError(payload, {
      status: response.status,
      fallback: "请求失败（HTTP " + response.status + "）",
      link: false
    });
  }
  return payload;
}

setupGlobalLog({
  api: requestJson
});
