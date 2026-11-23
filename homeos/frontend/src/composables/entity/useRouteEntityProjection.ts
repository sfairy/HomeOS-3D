/**
 * 按路由可见实体 ID 维护 EntityProjection 作用域
 */
import { watch, onActivated, onDeactivated, onUnmounted, unref, type MaybeRefOrGetter } from 'vue'
import { setProjectionScope, clearProjectionScope, upsertProjection } from '@/stores/entities/entity-projection'
import { useEntitiesStore } from '@/stores/entities.store'
/**
 * @param {import('vue').MaybeRefOrGetter<string[]>} entityIdsRef
 */
export function useRouteEntityProjection(entityIdsRef: MaybeRefOrGetter<string[]>) {
  const entitiesStore = useEntitiesStore()
  /**
   * 本视图自己的作用域令牌。
   *
   * 投影表是模块级单例，但同一个时刻可能有多个视图同时关心各自的实体集合
   * （`keep-alive :max="8"` 下 `/devices` 与「设备详情」都还挂着）。用同一份全局
   * 作用域的话，两边每一批 WS 更新都会互相清空再重建 —— 既多算一遍，也会让
   * 另一个视图的投影短暂消失。
   */
  const owner = {}
  let lastIds: string[] = []
  /** 视图被 keep-alive 收起时暂停同步：不可见的列表没必要跟着 WS 抖动。 */
  let paused = false

  const resolveIds = (): string[] => {
    const ids = typeof entityIdsRef === 'function' ? entityIdsRef() : unref(entityIdsRef)
    return Array.isArray(ids) ? ids.filter(Boolean) : []
  }

  function syncScope() {
    if (paused) return
    const list = resolveIds()
    // 作用域只在「有哪些 id」变化时重建；内容更新由 upsertProjection 的对象引用快路径兜住。
    if (list.length !== lastIds.length || list.some((id, index) => id !== lastIds[index])) {
      lastIds = list
      setProjectionScope(list, owner)
    }
    const map = entitiesStore.entities
    for (let i = 0; i < list.length; i++) upsertProjection(list[i], map[list[i]])
  }

  // 一个 watcher 同时跟踪「可见 id 列表」与「派生索引年代」：原实现是两个 watcher，
  // 每批更新会把同一份作用域同步跑两遍。
  watch(
    () => {
      const ids = resolveIds()
      return [ids, entitiesStore.derivedEpoch] as const
    },
    syncScope,
    { immediate: true, flush: 'post' },
  )
  onDeactivated(() => {
    paused = true
  })
  onActivated(() => {
    paused = false
    syncScope()
  })
  onUnmounted(() => {
    paused = true
    // 只释放本视图的作用域：其它视图（可能是 keep-alive 里的）还在用它们自己的那份。
    clearProjectionScope(owner)
  })
  return { syncScope }
}
