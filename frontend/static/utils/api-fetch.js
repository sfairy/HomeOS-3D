/**
 * 接口请求的超时预算与统一入口：编辑器、舞台页与日志引导的唯一接口出入口。
 *
 * 超时预算必须只有一个主人，散在多处会退化成「有的请求永久悬挂」——悬挂的后果不是慢，
 * 而是上层「正在保存」的闩永远不放（保存按钮、自动保存全锁死）。
 * 超时文案统一在此生成并带上接口路径（便于从用户截图看出哪个请求慢）；需要按类型分支的
 * 调用方判 `error.name === "TimeoutError"`，不要匹配文案。
 */

import { withRequestTimeout } from "./request-timeout.js?v=2609251754";

/**
 * 普通 JSON 接口的超时预算（毫秒）。
 *
 * 20 秒是全站 JSON 请求的默认体感，直接调 ``withRequestTimeout`` 的地方只剩两处，都用
 * ``SCENE_REQUEST_TIMEOUT_MS``（见下）而不是裸字面量：编辑器桥与户型工作室的 3D 场景同步。
 * 另有 ``auth/license-recovery.js`` 自带 15 秒预算，那是有意独立（该页不 import 本模块，
 * 授权恢复要在授权服务器不可达时先于其它请求失败），不要顺手合并。
 */
const API_TIMEOUT_MS = 20000;

/**
 * 3D 场景接口（``/modules/interaction3d/scenes``）的超时预算（毫秒）。
 *
 * 单独一个常量是因为它有两个调用方、而且分处两棵模块树：编辑器桥（bridge/editor.js 的
 * ``requestInteraction3dScene``，POST 新建场景）与户型工作室（3d-studio/studio/studio-app.js
 * 的 ``readSceneUpdate``，GET 拉取最新场景）。两侧原先各写一个字面量（20000 与 15000），
 * 于是后端稍慢时工作室会先放弃、编辑器却还在等 —— 同一件事给出两种体感，而且改一处不会
 * 提醒另一处。
 *
 * 取值按较宽的那个（20 秒）：POST 那条要在后端解析整份户型，是真实的重活。
 * 工作室拉取虽然便宜，也一并放宽，宁可等满也不要让它在后端还正常时先判「同步不可用」。
 */
export const SCENE_REQUEST_TIMEOUT_MS = 20000;

/**
 * 带二进制体的上传类请求的超时预算（毫秒）：素材图片与 3D 导出包（ZIP）体积上限远大于 JSON 草稿，
 * 中控设备 / 平板挂在弱网或 VPN 上时，20 秒会把「正在慢慢上传」误判成「网络断了」并丢掉文件；
 * 3 分钟足够传完上限体积，又仍然有界。
 */
const API_UPLOAD_TIMEOUT_MS = 180000;

/**
 * 按请求体类型挑选超时预算。
 * 用「体是不是二进制」而非「调用点是否记得传参数」判定：上传点会随功能增加，靠人记一定会漏。
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
 * 请求头、凭据、状态码）原样透传。
 * @throws {Error} 超时（name 为 TimeoutError，文案可直接展示）、调用方取消（AbortError）或 fetch 原始错误。
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
      // 「取消按钮 / 切页取消」就会静默失效（请求照发、直到超时才结束）。
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
