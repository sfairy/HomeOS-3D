/**
 * 展示层实体读取：优先 EntityProjection，但与 store 状态不一致时以 store 为准（关键域单条 WS 更新路径）
 */
import { getProjection } from '@/stores/entities/entity-projection'
import { useEntitiesStore } from '@/stores/entities.store'
import type { HaEntityState } from '@/types/entity-store'

export function resolveEntityForDisplay(entityId: string | undefined | null): HaEntityState | null {
  if (!entityId) return null
  const storeEntity = useEntitiesStore().getEntity(entityId) ?? null
  const proj = getProjection(entityId)
  if (proj && storeEntity && proj.state !== storeEntity.state) {
    return storeEntity
  }
  if (proj) {
    return {
      entity_id: proj.entity_id,
      state: proj.state,
      attributes: proj.attributes,
    }
  }
  return storeEntity
}
