/**
 * 单实体与多实体实时订阅组合式函数
 *
 * 所属模块：composables/entity
 * 职责：精确订阅单个或指定多个实体的实时状态，避免组件依赖整个 entities 映射
 *      引起的无关实体变更时的不必要重渲染；内部通过 usePausableStateListener
 *      按 entityId 精确过滤，配合实体/域级版本号实现细粒度响应式更新。
 * 导出函数：
 *   - useEntity(entityIdRef)：订阅单个实体，返回 shallowRef<HaEntityState | null>
 *   - useEntities(idsRef)：订阅多个实体 ID，返回 shallowRef<EntitiesMap> 快照
 * 依赖：useEntitiesStore（实体读取）、usePausableStateListener（粒度化监听）。
 */
import { shallowRef, watch, unref, type MaybeRefOrGetter } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { usePausableStateListener } from '@/composables/entity/usePausableStateListener'
import type { HaEntityState, EntitiesMap } from '@/types/entity-store'

function resolveId(entityIdRef: MaybeRefOrGetter<string | undefined | null>) {
  return typeof entityIdRef === 'function' ? entityIdRef() : unref(entityIdRef)
}
/**
 * 订阅单个实体的实时状态，避免依赖整个 entities 映射。
 * 通过 usePausableStateListener 精确监听指定实体的变化，
 * 避免无关实体变化导致的不必要重渲染。
 * @param {import('vue').MaybeRefOrGetter<string | undefined | null>} entityIdRef
 */
export function useEntity(entityIdRef: MaybeRefOrGetter<string | undefined | null>) {
  const entitiesStore = useEntitiesStore()
  const entity = shallowRef<HaEntityState | null>(null)
  function sync() {
    const id = resolveId(entityIdRef)
    entity.value = id ? (entitiesStore.getEntity(id) ?? null) : null
  }
  sync()
  watch(() => resolveId(entityIdRef), sync)
  usePausableStateListener(sync, {
    entityIds: () => resolveId(entityIdRef) || undefined,
  })
  return entity
}
/**
 * 订阅多个实体 ID 的快照（仅在这些实体变更时更新）。
 * @param {import('vue').MaybeRefOrGetter<string[]>} idsRef
 */
export function useEntities(idsRef: MaybeRefOrGetter<string[]>) {
  const entitiesStore = useEntitiesStore()
  const snapshot = shallowRef<EntitiesMap>({})
  const idSet = () => new Set(typeof idsRef === 'function' ? idsRef() : unref(idsRef) || [])
  function sync() {
    const ids = idSet()
    const next: EntitiesMap = {}
    for (const id of ids) {
      const e = entitiesStore.getEntity(id)
      if (e) next[id] = e
    }
    snapshot.value = next
  }
  sync()
  watch(() => [...idSet()], sync, { deep: false })
  usePausableStateListener(sync, {
    entityIds: () => [...idSet()],
  })
  return snapshot
}
