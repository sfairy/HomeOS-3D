/**
 * 全局日志上报的启动引导（编辑器 / 面板侧）。
 *
 * 位置：早于业务脚本执行，负责把 global-log.js 接到真实接口上。
 * 职责：把一个极简的 JSON 请求封装注入 setupGlobalLog，让日志模块可以
 *   上报到 /api/v1 下的日志接口。
 * 约定：请求一律 cache: "no-store"，避免日志接口被缓存；401 视为会话失效
 *   直接跳登录页；只有带 body 时才声明 Content-Type: application/json。
 */
import { setupGlobalLog } from "./global-log.js?v=20260916235816";

/**
 * 发送 JSON 请求并做统一的错误处理。
 *
 * @param {string} path 接口路径，不含 /api/v1 前缀。
 * @param {RequestInit} [init] fetch 配置。
 * @returns {Promise<*>} 解析后的响应体；204 或空响应返回 null。
 * @throws {Error} 会话失效、HTTP 失败或响应不是合法 JSON。
 */
async function requestJson(path, init = {}) {
  const response = await fetch("/api/v1" + path, {
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
  if (response.status === 401) {
    window.location.assign("/login");
    throw new Error("登录状态已失效。");
  }
  if (!response.ok) {
    // detail 可能是字符串，也可能是结构化对象，两种都要还原成可读文案。
    const detail = payload?.detail;
    throw new Error(
      typeof detail == "string"
        ? detail
        : detail?.message || "请求失败（HTTP " + response.status + "）"
    );
  }
  return payload;
}

setupGlobalLog({
  api: requestJson
});
