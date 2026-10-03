/**
 * 联动器/场景 Builder 共享反馈与工具集合
 *
 * 所属模块：composables/orchestrator
 * 职责：消除各 Builder 视图中的重复样板代码，统一操作反馈通道（内联 resultMsg + 全局 chrome.notify 双写）、
 *      YAML 复制到剪贴板、同步操作（doSync/doRepair/doSyncAll）的反馈 Toast 等能力。
 * 导出：
 *   - flashBuilderResult：短暂写入内联反馈并同步到全局通知
 *   - copyBuilderYaml：复制 Builder YAML 文本 + 反馈 Toast
 *   - useBuilderFeedback：Composable，返回 resultMsg/resultOk/withSyncFeedback/dismissAfter
 * 依赖：clipboard.util（剪贴板写入）、chrome.store（全局通知）。
 */
import { ref, onScopeDispose } from 'vue'
import { copyTextToClipboard } from '@/utils/core/clipboard.util'
import { useChromeStore } from '@/stores/chrome.store'
import type {
  BuilderFeedbackResult,
  CopyBuilderYamlOptions,
  WithSyncFeedbackOptions,
  WritableRefLike,
} from '@/types/orchestrator-builder'
/**
 * Builder 共享工具函数
 * 消除联动器 Builder 中的重复代码（通知反馈、复制 YAML 等）
 */

/** 将 Builder 内联反馈同步到全局 chrome.notify，统一反馈通道 */
function notifyBuilderFeedback(msg: string, ok: boolean) {
  const text = String(msg || '').trim()
  if (!text) return
  try {
    useChromeStore().notify(text, ok ? 'success' : 'error')
  } catch {
    // store 未就绪时仅保留内联 resultMsg，不阻断调用方
  }
}

/** 复制到剪贴板（样板：onResult 为 (msg, ok) => void） */
async function copyToClipboard(
  text: unknown,
  onResult: (msg: string, ok: boolean) => void,
) {
  const ok = await copyTextToClipboard(String(text ?? ''))
  onResult(ok ? 'YAML 已复制' : '复制失败', ok)
}
/** 短暂 toast 反馈：内联 resultMsg + 全局 chrome.notify 双写，逐步收敛到统一通道 */
export function flashBuilderResult(
  resultMsg: WritableRefLike<string>,
  resultOk: WritableRefLike<boolean>,
  msg: string,
  ok: boolean,
  dismissAfter?: ((ms?: number) => void) | null,
  ms: number = 2500,
) {
  resultMsg.value = msg
  resultOk.value = ok
  notifyBuilderFeedback(msg, ok)
  if (dismissAfter) dismissAfter(ms)
}
/** Builder YAML 复制 + 短暂 toast 反馈 */
export function copyBuilderYaml(
  text: unknown,
  resultMsg: WritableRefLike<string>,
  resultOk: WritableRefLike<boolean>,
  { ttlMs = 2000, dismissAfter }: CopyBuilderYamlOptions = {},
) {
  copyToClipboard(text, (msg: string, ok: boolean) => {
    flashBuilderResult(resultMsg, resultOk, msg, ok, dismissAfter, ttlMs)
  })
}
/** Builder 同步操作 toast 反馈（doSync / doRepair / doSyncAll 等） */
export function useBuilderFeedback() {
  const resultMsg = ref<string>('')
  const resultOk = ref(false)
  const dismissTimers = new Set<ReturnType<typeof setTimeout>>()
  function dismissAfter(ms: number = 2500) {
    const id = setTimeout(() => {
      resultMsg.value = ''
    }, ms)
    dismissTimers.add(id)
    return id
  }
  onScopeDispose(() => {
    for (const id of dismissTimers) clearTimeout(id)
    dismissTimers.clear()
  })
  async function withSyncFeedback(
    fn: () => Promise<BuilderFeedbackResult>,
    { reload, ttlMs = 2500, after }: WithSyncFeedbackOptions = {},
  ) {
    const r = await fn()
    resultMsg.value = r.message ?? ''
    resultOk.value = r.ok
    notifyBuilderFeedback(resultMsg.value, resultOk.value)
    if (reload) await reload()
    if (after) await after(r)
    dismissAfter(ttlMs)
    return r
  }
  return { resultMsg, resultOk, withSyncFeedback, dismissAfter }
}
