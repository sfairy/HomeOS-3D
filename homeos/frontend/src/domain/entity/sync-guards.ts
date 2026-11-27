import type { Ref } from 'vue'
import { logger } from '@/kernel/core/index'
import { notifyError } from '@/kernel/ui/notify'
import { getEntityDomain, DEFAULT_CRITICAL_DOMAINS, sortEntitiesBySyncPriority } from '@homeos/shared'
import { collectPinnedEntityIds, resolveSubscribeDomains } from '@/domain/entity/ws-subscription'
import type { HaEntityState } from '@/kernel/entity'

/**
 * 实体 WS/REST 回退失败时的统一日志与节流 toast
 */

let lastFallbackNotifyAt = 0
const FALLBACK_NOTIFY_COOLDOWN_MS = 60_000

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

/** 实体同步优先级切分工具 */

type LayoutSubscriptionConfig = Parameters<typeof collectPinnedEntityIds>[0]

/** IndexedDB 冷启动：布局/订阅域 + pinned 热点优先，其余 idle 补全 */
export function partitionEntitiesForCacheHydrate(
  entities: HaEntityState[],
  layoutConfig: LayoutSubscriptionConfig,
): { priority: HaEntityState[]; deferred: HaEntityState[] } {
  if (!Array.isArray(entities) || entities.length <= 1) {
    return { priority: entities || [], deferred: [] }
  }
  const pinned = new Set(collectPinnedEntityIds(layoutConfig))
  const domains = new Set(resolveSubscribeDomains('/', layoutConfig) || [])
  for (const d of DEFAULT_CRITICAL_DOMAINS) domains.add(d)

  const priority: HaEntityState[] = []
  const deferred: HaEntityState[] = []
  for (let i = 0; i < entities.length; i++) {
    const entity = entities[i]
    const id = entity?.entity_id
    if (!id) continue
    const domain = getEntityDomain(id)
    if (pinned.has(id) || domains.has(domain)) priority.push(entity)
    else deferred.push(entity)
  }
  if (!deferred.length) return { priority, deferred: [] }
  return {
    priority: sortEntitiesBySyncPriority(priority),
    deferred: sortEntitiesBySyncPriority(deferred),
  }
}
