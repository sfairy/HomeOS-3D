/**
 * 实体投影只读展示组合式函数模块。
 *
 * 职责：
 * - 在指定实体 ID 作用域内，优先使用 EntityProjection（如本地乐观更新/路由作用域）；
 * - 当实体未在投影作用域内时，回退到 store 全量实体；
 * - 通过可暂停的状态监听按实体刷新，避免传感器风暴下的全局扇出。
 *
 * 依赖：vue shallowRef/watch/unref、entity-projection store、entities store、
 * usePausableStateListener、HaEntityState 类型。
 */
import { shallowRef, watch, unref, type MaybeRefOrGetter } from 'vue'
import { getProjection } from '@/stores/entities/entity-projection'
import { useEntitiesStore } from '@/stores/entities.store'
import { usePausableStateListener } from '@/composables/entity/usePausableStateListener'
import type { HaEntityState } from '@/types/entity-store'

/**
 * 解析 MaybeRefOrGetter 形式的 entityId 引用为具体值。
 * @param entityIdRef ref/getter/ref 值
 * @returns 解析后的字符串或 null/undefined
 */
function resolveId(entityIdRef: MaybeRefOrGetter<string | undefined | null>) {
  return typeof entityIdRef === 'function' ? entityIdRef() : unref(entityIdRef)
}
/**
 * 只读展示：优先投影，未在 scope 内时回退 store 全量实体。
 *
 * 调用场景：户型图热区、卡片等需要"乐观投影优先"的只读展示组件。
 * 当投影存在且与 store 状态不一致时，以 store state + 投影 attributes 合成（保证状态权威）；
 * 投影存在但 store 缺失时直接使用投影；无投影时使用 store 原值。
 *
 * @param {import('vue').MaybeRefOrGetter<string | undefined | null>} entityIdRef
 * @returns 实体快照 shallowRef
 */
export function useEntityProjection(entityIdRef: MaybeRefOrGetter<string | undefined | null>) {
  const entitiesStore = useEntitiesStore()
  // 使用 shallowRef 避免对大对象进行深度响应式追踪
  const entity = shallowRef<HaEntityState | null>(null)
  /** 重新同步实体快照（投影优先 + store 回退） */
  function sync() {
    const id = resolveId(entityIdRef)
    if (!id) {
      entity.value = null
      return
    }
    const storeEntity = entitiesStore.getEntity(id) ?? null
    const proj = getProjection(id)
    // 投影与 store 都存在但 state 不一致：以 store state 为权威，attributes 取投影
    if (proj && storeEntity && proj.state !== storeEntity.state) {
      entity.value = {
        entity_id: storeEntity.entity_id,
        state: storeEntity.state,
        attributes: storeEntity.attributes,
      }
      return
    }
    // 仅投影存在：直接采用投影
    if (proj) {
      entity.value = {
        entity_id: proj.entity_id,
        state: proj.state,
        attributes: proj.attributes,
      }
      return
    }
    // 无投影：回退 store 全量实体
    entity.value = storeEntity
  }
  sync()
  // entity_id 变化时重新同步
  watch(() => resolveId(entityIdRef), sync)
  // 按实体监听即可；不再挂全局 entityStateRevision，避免传感器风暴扇出
  usePausableStateListener(sync, {
    entityIds: () => resolveId(entityIdRef) || undefined,
  })
  return entity
}