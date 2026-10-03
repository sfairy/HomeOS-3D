/**
 * 实体 WS/REST 回退失败时的统一日志与节流 toast
 */
import type { Ref } from 'vue'
import { logger } from '@/utils/core/logger'
import { notifyError } from '@/services/notify'

let lastFallbackNotifyAt = 0
const FALLBACK_NOTIFY_COOLDOWN_MS = 60_000

/** handleEntityFallbackFailure：函数，按签名入参返回处理结果。 */
export function handleEntityFallbackFailure(
  reason: string,
  error?: unknown,
  refs?: { entitiesStale?: Ref<boolean> },
): void {
  const detail = error instanceof Error ? error.message : String(error ?? reason)
  logger.warn(`实体同步回退失败(${reason})`, detail)
  if (refs?.entitiesStale) refs.entitiesStale.value = true
  const now = Date.now()
  if (now - lastFallbackNotifyAt < FALLBACK_NOTIFY_COOLDOWN_MS) return
  lastFallbackNotifyAt = now
  notifyError(error ?? new Error(detail), '实体同步')
}
