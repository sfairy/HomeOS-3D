/**
 * 统一错误反馈：将异常转换为用户可见 toast，并记录日志。
 *
 * 职责：
 * - 提取异常消息与 traceId 拼装用户可见文案；
 * - 提供带反馈的剪贴板复制。
 *
 * 依赖：
 * - @/utils/core/logger：日志记录
 * - @/utils/core/error-message：异常消息提取
 * - @/utils/telemetry/trace.util：traceId 提取
 * - @/utils/bridge/store-bridge：toast 通知
 * - @/stores/chrome.store：Chrome store 通知
 * - @/utils/core/clipboard.util：剪贴板复制
 */
import { logger } from '@/utils/core/logger'
import { extractErrorMessage } from '@/utils/core/error-message'
import { extractTraceIdFromError } from '@/utils/telemetry/trace.util'
import { appNotify } from '@/utils/bridge/store-bridge'
import { useChromeStore } from '@/stores/chrome.store'
import { copyTextToClipboard } from '@/utils/core/clipboard.util'
import type { NotifyOptions, NotifyType } from '@/types/notify'

/**
 * 统一错误反馈：将异常转换为用户可见 toast，并记录日志。
 * @param error 异常对象
 * @param context 上下文描述（拼装为 `<context>失败：` 前缀），空串则仅展示消息
 * @param options.silent 是否仅记录不弹 toast，默认 false
 * @param options.log 是否记录日志，默认 true
 * @param options.type toast 类型，默认 error
 * @param options.duration toast 时长（毫秒），error 默认 5000
 * @returns 拼装后的展示文案
 */
export function notifyError(error: unknown, context?: string, options: NotifyOptions = {}): string {
  const { silent = false, log = true, type = 'error', duration } = options
  const message = extractErrorMessage(error)
  const traceId = extractTraceIdFromError(error as Parameters<typeof extractTraceIdFromError>[0])
  const traceSuffix = traceId ? `（Trace: ${traceId.slice(0, 8)}）` : ''
  const display =
    context === ''
      ? `${message}${traceSuffix}`
      : `${context || '操作'}失败：${message}${traceSuffix}`

  if (log) {
    logger.error(context || '操作', error)
  }
  if (!silent) {
    const ms = duration ?? (type === 'error' ? 5000 : undefined)
    appNotify(display, type as NotifyType, ms)
  }
  return display
}

/**
 * 复制文本并在顶部居中 toast 反馈（与 saveConfig 的 notify 一致）。
 * @param text 待复制文本
 * @param options.successMessage 成功提示，默认「已复制到剪贴板」
 * @param options.errorMessage 失败提示，默认「复制失败，请检查浏览器剪贴板权限」
 * @param options.emptyMessage 文本为空时的提示（为 null 则不提示）
 * @returns 是否复制成功
 */
export async function copyTextWithNotify(
  text: string,
  options: {
    successMessage?: string
    errorMessage?: string
    emptyMessage?: string | null
  } = {},
) {
  const {
    successMessage = '已复制到剪贴板',
    errorMessage = '复制失败，请检查浏览器剪贴板权限',
    emptyMessage = null,
  } = options

  if (!text) {
    if (emptyMessage) useChromeStore().notify(emptyMessage, 'warning')
    return false
  }

  const ok = await copyTextToClipboard(String(text))
  if (ok) {
    useChromeStore().notify(successMessage, 'success')
    return true
  }
  useChromeStore().notify(errorMessage, 'error')
  return false
}