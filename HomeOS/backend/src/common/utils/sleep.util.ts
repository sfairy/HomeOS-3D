/**
 * 所属模块：backend/common/utils
 * 职责：
 *  - 异步等待工具（重试退避、分片发送间隔等场景统一入口）；
 * 关键依赖：
 *  - 无外部依赖（Node 内置 setTimeout）；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

/**
 * 异步等待指定毫秒数。
 *
 * @param ms 等待毫秒数；负数/非法值按 0 处理（立即 resolve）
 * @returns 在指定时间后 resolve 的 Promise
 */
export function sleep(ms: number): Promise<void> {
  const delay = Number.isFinite(ms) && ms > 0 ? ms : 0;
  return new Promise((resolve) => setTimeout(resolve, delay));
}
