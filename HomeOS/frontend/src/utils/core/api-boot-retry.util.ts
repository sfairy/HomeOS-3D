/**
 * @module core/api-boot-retry
 * @description 后端冷启动 / Nest 热重载窗口内的请求重试工具。
 *
 * 场景：页面首次加载时，后端可能尚未就绪（网关返回 502/503/504 或网络错误）。
 * 该工具在确认错误属于「后端不可达」时按固定间隔重试，直至成功或达到上限。
 *
 * 依赖：@/utils/core/error-message（识别后端不可达错误）。
 */
import { isBackendUnreachableError } from '@/utils/core/error-message'

/** 后端冷启动 / Nest 热重载窗口内，网关 502 时的重试上限与间隔（约 2 分钟） */
const API_BOOT_RETRY_MAX = 40
const API_BOOT_RETRY_DELAY_MS = 3000

/** 重试可选项：覆盖默认最大次数与间隔 */
interface BackendBootRetryOptions {
  /** 最大尝试次数（含首次），默认 API_BOOT_RETRY_MAX */
  maxAttempts?: number
  /** 两次尝试之间的间隔（毫秒），默认 API_BOOT_RETRY_DELAY_MS */
  delayMs?: number
}

/**
 * 在后端不可达（502/503/504/网络错误）时重试，用于页面首次加载。
 * @param fn 实际要执行的异步操作
 * @param options 重试参数覆盖
 * @returns fn 的成功返回值
 * @throws 当错误不属于后端不可达，或达到最大次数仍失败时抛出最近一次错误
 */
export async function withBackendBootRetry<T>(
  fn: () => Promise<T>,
  options: BackendBootRetryOptions = {},
): Promise<T> {
  const maxAttempts = options.maxAttempts ?? API_BOOT_RETRY_MAX
  const delayMs = options.delayMs ?? API_BOOT_RETRY_DELAY_MS
  let lastError: unknown
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn()
    } catch (err) {
      lastError = err
      // 非后端不可达错误，或已是最后一次尝试，直接抛出，不重试
      if (!isBackendUnreachableError(err) || attempt >= maxAttempts - 1) throw err
      await new Promise((r) => setTimeout(r, delayMs))
    }
  }
  throw lastError
}
