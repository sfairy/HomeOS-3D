/**
 * 列表行展示：优先 EntityProjection
 */
import { getProjection } from '@/stores/entities/entity-projection'
import type { HaEntityView } from '@/types/entity-store'

/** resolveListRowEntity：函数，按签名入参返回处理结果。 */
export function resolveListRowEntity(
  entityId: string,
  fallbackEntity?: HaEntityView,
): HaEntityView | null {
  const proj = getProjection(entityId)
  if (proj) {
    return {
      entity_id: entityId,
      state: proj.state,
      attributes: proj.attributes,
    }
  }
  return fallbackEntity ?? null
}
