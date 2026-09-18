/**
 * 接口请求的超时预算与统一入口。
 *
 * 位置：通用工具层，被编辑器（home.js）、舞台页（3d-studio）与全局日志引导
 *   （global-log-boot.js）的「唯一接口出入口」复用。
 * 为什么单列一个模块：超时预算必须只有一个主人。同一份「多久算超时」的判断
 *   散在三个文件里，改一处漏两处就会退化成「有的请求会永久悬挂」—— 而悬挂的
 *   后果不是慢，是上层那把「正在保存」的闩永远不放（保存按钮、自动保存全锁死）。
 * 取舍：这里给「超时」这件事配了中文文案并带上接口路径。原因是超时最终一定要
 *   展示给用户（对话框 / 顶部提示 / 展示页横幅），每个调用点各写一句必然会漂移；
 *   文案里保留接口路径是为了让「哪个请求慢」在用户截图里就能看出来。
 *   需要按类型分支的调用方请判 `error.name === "TimeoutError"`，不要匹配文案。
 */

import { withRequestTimeout } from "./request-timeout.js?v=20260918233037";

/**
 * 普通 JSON 接口的超时预算（毫秒）。
 *
 * 20 秒与仓库里既有的手写预算对齐（display.js 的 apiRequest、编辑器与舞台页里
 * 直接调 withRequestTimeout 的两处都是 2e4 / 1.5e4），保持「同一套体感」。
 *
 * @type {number}
 */
export const API_TIMEOUT_MS = 20000;

/**
 * 带二进制体的上传类请求的超时预算（毫秒）。
 *
 * 素材图片与 3D 导出包（ZIP）都走同一条接口通道，体积上限远大于 JSON 草稿，
 * 而中控设备 / 平板可能挂在弱网或 VPN 上；20 秒会把「正在慢慢上传」误判成
 * 「网络断了」并把用户刚到手的文件丢掉。3 分钟足够传完上限体积，又仍然有界。
 *
 * @type {number}
 */
export const API_UPLOAD_TIMEOUT_MS = 180000;

/**
 * 按请求体类型挑选超时预算。
 *
 * 用「体是不是二进制」而不是「调用点有没有记得传参数」来判定：上传点会随功能
 * 增加（素材、导出包、以后的固件包），靠人记的参数一定会漏。
 *
 * @param {BodyInit|null|undefined} requestBody fetch 的 body。
 * @returns {number} 该请求应使用的超时毫秒数。
 */
function timeoutMsFor(requestBody) {
  const isBinaryBody =
    (typeof Blob !== "undefined" && requestBody instanceof Blob) ||
    (typeof FormData !== "undefined" && requestBody instanceof FormData);
  return isBinaryBody ? API_UPLOAD_TIMEOUT_MS : API_TIMEOUT_MS;
}

/**
 * 发一次带超时约束的接口请求。
 *
 * 与裸 fetch 的差别只有两点：注入中止信号、到点必定抛错。其余行为（缓存策略、
 * 请求头、凭据、状态码）原样透传给 fetch，调用方不需要改自己的处理逻辑。
 *
 * @param {string} url 完整请求地址（含查询串）。
 * @param {RequestInit} [init={}] fetch 配置；body 为 Blob / File / FormData 时自动放宽预算。
 * @returns {Promise<Response>} fetch 的原始响应，状态码判断仍由调用方负责。
 * @throws {Error} 超时（name 为 TimeoutError，文案可直接展示）、调用方自身的取消
 *   （name 为 AbortError），或 fetch 原本抛出的错误。
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
