/**
 * 按路由可见实体 ID 维护 EntityProjection 作用域
 */
import { watch, onUnmounted, unref, type MaybeRefOrGetter } from 'vue'
import {
  setProjectionScope,
  clearProjections,
  upsertProjection,
} from '@/stores/entities/entity-projection'
import { useEntitiesStore } from '@/stores/entities.store'
/**
 * @param {import('vue').MaybeRefOrGetter<string[]>} entityIdsRef
 */
export function useRouteEntityProjection(entityIdsRef: MaybeRefOrGetter<string[]>) {
  const entitiesStore = useEntitiesStore()
  function syncScope() {
    const ids =
      typeof entityIdsRef === 'function' ? entityIdsRef() : unref(entityIdsRef)
    const list = Array.isArray(ids) ? ids.filter(Boolean) : []
    setProjectionScope(list)
    const map = entitiesStore.entities
    for (let i = 0; i < list.length; i++) {
      upsertProjection(list[i], map[list[i]])
    }
  }
  watch(entityIdsRef, syncScope, { immediate: true, deep: true })
  const stop = watch(
    () => entitiesStore.derivedEpoch,
    () => syncScope(),
  )
  onUnmounted(() => {
    stop()
    clearProjections()
  })
  return { syncScope }
}
