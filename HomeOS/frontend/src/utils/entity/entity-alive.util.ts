/**
 * @module entity-alive.util
 * @description 实体存活判定：用于房间绑定等场景过滤 HA 已删除的幽灵实体。
 *
 * 规则：store 中存在快照且未处于 cold-fetch 404 负缓存 → 视为存活。
 */
import { isColdFetchMissing } from '@/utils/entity/cold-fetch.util'

/** 最小实体表接口，避免强耦合完整 store 类型 */
export type EntityAliveMap = Record<string, unknown> | null | undefined

/** 实体是否在本地状态中存活（非幽灵） */
export function isEntityAlive(entityId: string, entities: EntityAliveMap): boolean {
  const id = String(entityId || '').trim()
  if (!id) return false
  if (isColdFetchMissing(id)) return false
  return Boolean(entities?.[id])
}

/** 从绑定列表中筛出存活实体 ID */
function filterAliveEntityIds(entityIds: string[], entities: EntityAliveMap): string[] {
  return entityIds.filter((id) => isEntityAlive(id, entities))
}

/** 从绑定列表中筛出幽灵（已失效）实体 ID */
export function filterGhostEntityIds(entityIds: string[], entities: EntityAliveMap): string[] {
  return entityIds.filter((id) => {
    const eid = String(id || '').trim()
    return eid.length > 0 && !isEntityAlive(eid, entities)
  })
}

/** 统计绑定列表中的存活数量 */
export function countAliveEntities(
  rows: Array<{ entityId: string }> | string[] | null | undefined,
  entities: EntityAliveMap,
): number {
  if (!rows?.length) return 0
  if (typeof rows[0] === 'string') {
    return filterAliveEntityIds(rows as string[], entities).length
  }
  return (rows as Array<{ entityId: string }>).filter((r) => isEntityAlive(r.entityId, entities))
    .length
}
