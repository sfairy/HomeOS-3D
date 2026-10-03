/**
 * @module entity-cold-refresh.util
 * @description 冷实体模式：断线 / entities_stale 后补全 pinned 热点实体。
 *
 * 职责：当 WS 断线或收到 entities_stale 事件后，收集当前布局中 pinned 的热点实体 ID
 * 与活跃投影 ID，批量调用 ensureEntity 补全缓存，保证用户可见区域的数据可用。
 *
 * 依赖：
 * - `entity-ws-subscription`：收集 pinned 实体 ID。
 * - `entity-projection` store：获取活跃投影 ID。
 * - `frontend-config`：读取冷实体按需拉取开关。
 * - `logger`：日志输出。
 */
import { collectPinnedEntityIds } from '@/utils/entity/ws-subscription'
import { getActiveProjectionIds } from '@/stores/entities/entity-projection'
import { getWsPushPublicConfig } from '@/utils/config/frontend-config'
import { logger } from '@/utils/core/logger'

const MAX_ENSURE = 120

/** 实体存储接口约束：需提供 ensureEntity 方法。 */
interface EntitiesEnsureStore {
  ensureEntity: (id: string) => Promise<unknown>
}

type LayoutSubscriptionConfig = Parameters<typeof collectPinnedEntityIds>[0]

/**
 * 在 WS 断线 / entities_stale 后批量补全 pinned 热点实体。
 *
 * 流程：
 * 1. 读取冷实体按需拉取开关，未开启则直接返回。
 * 2. 合并 pinned 实体 ID 与活跃投影 ID，去重。
 * 3. 截取前 MAX_ENSURE 条，并发调用 ensureEntity 补全。
 * 4. 单条失败仅记录警告，不阻断其他实体补全。
 *
 * @param entitiesStore 实体存储对象，需提供 ensureEntity 方法。
 * @param layoutConfig 布局订阅配置。
 */
export async function refreshPinnedEntitiesAfterStale(
  entitiesStore: EntitiesEnsureStore,
  layoutConfig: LayoutSubscriptionConfig,
): Promise<void> {
  const wsPush = getWsPushPublicConfig()
  if (!wsPush?.coldEntityOnDemand) return

  const ids = new Set([...collectPinnedEntityIds(layoutConfig), ...getActiveProjectionIds()])
  if (!ids.size) return

  const batch = [...ids].slice(0, MAX_ENSURE)
  await Promise.all(
    batch.map((id) =>
      entitiesStore.ensureEntity(id).catch((err) => {
        logger.warn('[实体冷刷新] ensureEntity 失败', id, err)
        return null
      }),
    ),
  )
}
