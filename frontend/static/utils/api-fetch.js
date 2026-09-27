/**
 * 接口请求的超时预算与统一入口：编辑器、舞台页与日志引导的唯一接口出入口。
 */

import { withRequestTimeout } from "./request-timeout.js?v=2609271226";

/**
 * 普通 JSON 接口的超时预算（毫秒）。
 */
const API_TIMEOUT_MS = 20000;

/**
 * 3D 场景接口（``/modules/interaction3d/scenes``）的超时预算（毫秒）。
 */
export const SCENE_REQUEST_TIMEOUT_MS = 20000;

/**
 * 带二进制体的上传类请求的超时预算（毫秒）：素材图片与 3D 导出包（ZIP）体积上限远大于 JSON 草稿，
 */
const API_UPLOAD_TIMEOUT_MS = 180000;

/**
 * 按请求体类型挑选超时预算。
 * @returns {number} 该请求应使用的超时毫秒数。
 */
function timeoutMsFor(requestBody) {
  const isBinaryBody =
    (typeof Blob !== "undefined" && requestBody instanceof Blob) ||
    (typeof FormData !== "undefined" && requestBody instanceof FormData);
  return isBinaryBody ? API_UPLOAD_TIMEOUT_MS : API_TIMEOUT_MS;
}

/**
 * 发一次带超时约束的接口请求：与裸 fetch 只差注入中止信号、到点必定抛错，其余（缓存策略、
 */
export async function apiFetch(url, init = {}) {
  const timeoutMs = timeoutMsFor(init.body);
  try {
    return await withRequestTimeout(
      timeoutMs,
      abortSignal =>
        fetch(url, {
          ...init,
          signal: abortSignal
        }),
      // 调用方自己的取消信号必须转交：`signal` 上面被内部信号顶掉了，若不再单独传进来，
      init.signal
    );
  } catch (requestError) {
    if (requestError?.name !== "TimeoutError") {
      throw requestError;
    }
    const timeoutError = new Error(
      "请求超时：" +
        url.split("?")[0].replace(/^\/api\/v1/, "") +
        "（超过 " +
        Math.round(timeoutMs / 1000) +
        " 秒未响应），请检查网络后重试。"
    );
    // 名字要保住：调用方可能靠它区分「超时」与「业务报错」（文案会随版本变）。
    timeoutError.name = "TimeoutError";
    throw timeoutError;
  }
}
