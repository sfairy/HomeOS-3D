/**
 * 实时实体快照组合式函数模块。
 *
 * 职责：
 * - 弹窗/卡片内实时实体快照：优先 WS store 实时值，fallback 仅作 entity_id 来源与初始回退；
 * - 依赖 useEntity 的按实体监听，避免全局 entityStateRevision 扇出。
 *
 * 依赖：vue computed/unref、useEntity、entities store、HaEntityState 类型。
 */
import { computed, unref, type MaybeRefOrGetter } from 'vue'
import { useEntity } from '@/composables/entity/useEntity'
import { useEntitiesStore } from '@/stores/entities.store'
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
 * 解析 MaybeRefOrGetter 形式的 fallback 实体引用为具体值。
 * @param fallbackRef ref/getter/ref 值
 * @returns 解析后的实体对象或 null/undefined
 */
function resolveFallback(
  fallbackRef: MaybeRefOrGetter<HaEntityState | Record<string, unknown> | null | undefined>,
) {
  return typeof fallbackRef === 'function' ? fallbackRef() : unref(fallbackRef)
}
/**
 * 弹窗/卡片内实时实体快照：优先 WS store，fallback 仅作 entity_id 来源与初始回退。
 * 依赖 useEntity 的按实体监听，避免全局 entityStateRevision 扇出。
 *
 * 调用场景：实体控制弹窗、卡片预览等需要"实时优先 + 静态回退"的组件。
 *
 * @param {import('vue').MaybeRefOrGetter<string | undefined | null>} entityIdGetter
 * @param {import('vue').MaybeRefOrGetter<object | null | undefined>} [fallbackEntityRef]
 * @returns 实体快照 computed（HaEntityState | null）
 */
export function useLiveEntity(
  entityIdGetter: MaybeRefOrGetter<string | undefined | null>,
  fallbackEntityRef?: MaybeRefOrGetter<HaEntityState | Record<string, unknown> | null | undefined>,
) {
  const entitiesStore = useEntitiesStore()
  // useEntity 内部按实体监听，建立响应式依赖
  const snapshot = useEntity(entityIdGetter)
  return computed((): HaEntityState | null => {
    const id = resolveId(entityIdGetter)
    // 触发 snapshot 响应式依赖，保证 WS 推送时重新计算
    void snapshot.value
    if (id) {
      // 优先使用 store 实时值（WS 已推送）
      const fromStore = entitiesStore.getEntity(id)
      if (fromStore) return fromStore
    }
    // 回退到外部传入的 fallback（如 props.entity）
    const fallback = resolveFallback(fallbackEntityRef ?? null)
    if (fallback && typeof fallback === 'object') return fallback as HaEntityState
    return snapshot.value
  })
}