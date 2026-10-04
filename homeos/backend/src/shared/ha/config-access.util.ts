/**
 * @module shared/ha
 * @file ha-config-access.util.ts
 * @brief HA 配置访问相关的通用异步工具。
 *
 * 职责：
 *  - 提供带超时的异步操作封装（withAsyncTimeout），供 HA 配置读取 / 探测流程复用。
 *
 * 注意：SMB / UNC 访问相关工具已随功能移除；Linux/Docker 必须使用本地挂载点。
 */

/**
 * 带超时的异步操作（超时返回 undefined）。
 *
 * @param promise 待执行的异步任务。
 * @param ms 超时毫秒数。
 * @returns promise 的结果；超时则返回 undefined（不抛错，便于调用方降级处理）。
 */
export async function withAsyncTimeout<T>(promise: Promise<T>, ms: number): Promise<T | undefined> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<undefined>((resolve) => {
        timer = setTimeout(() => resolve(undefined), ms);
      }),
    ]);
  } finally {
    // 无论成功或超时，都清理定时器避免泄漏
    if (timer) clearTimeout(timer);
  }
}
