/**
 * 户型图热点批量实体订阅：单点 listener + provide/inject 下发 display snapshot
 */
import { shallowRef, computed, provide, inject, watch, toValue, type MaybeRefOrGetter, type Ref } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { usePausableStateListener } from '@/composables/entity/usePausableStateListener'
import {
  buildWidgetDisplayState,
  type WidgetDisplayState,
} from '@/utils/floorplan/widget.util'
import { resolveEntityForDisplay } from '@/utils/entity/projection-display.util'
import type { FloorWidget } from '@/types/layout'
import type { EntityStateListenerPayload } from '@/types/entity-store'

/** FLOORPLAN_DISPLAY_KEY：常量，取值语义见定义处。 */
export const FLOORPLAN_DISPLAY_KEY = Symbol('floorplanDisplay')

type BatchWidget = Pick<FloorWidget, 'id'> & Partial<FloorWidget>

/**
 * @param {import('vue').Ref<boolean>} enabledRef
 * @param {import('vue').Ref<Set<string>>} visibleIdsRef
 * @param {import('vue').Ref<Array<{ id: string }>>} widgetsRef
 * @param {import('vue').Ref<string|null|undefined>} [activePopupIdRef]
 */
export function useFloorplanEntityBatch(
  enabledRef: Ref<boolean>,
  visibleIdsRef: Ref<Set<string>>,
  widgetsRef: Ref<BatchWidget[] | null | undefined>,
  activePopupIdRef?: Ref<string | null | undefined>,
) {
  const displays = shallowRef(new Map<string, WidgetDisplayState>())
  provide(FLOORPLAN_DISPLAY_KEY, displays)
  function resolveSubscribedIds() {
    const ids = visibleIdsRef.value
    const widgets = widgetsRef.value || []
    const list = ids.size === 0 ? widgets.map((w) => w.id) : [...ids]
    const pinned = activePopupIdRef?.value
    if (pinned && !list.includes(pinned)) list.push(pinned)
    return list
  }
  function shouldSyncWidget(widgetId: string) {
    const ids = visibleIdsRef.value
    if (ids.size === 0) return true
    if (ids.has(widgetId)) return true
    return activePopupIdRef?.value === widgetId
  }
  function syncAll() {
    if (!enabledRef.value) {
      displays.value = new Map<string, WidgetDisplayState>()
      return
    }
    const widgets = widgetsRef.value || []
    const next = new Map<string, WidgetDisplayState>()
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i]
      if (!shouldSyncWidget(w.id)) continue
      next.set(w.id, buildWidgetDisplayState(w as FloorWidget, resolveEntityForDisplay(w.id)))
    }
    displays.value = next
  }
  function syncOne(entityId: string) {
    if (!enabledRef.value || !entityId) return
    if (!shouldSyncWidget(entityId)) return
    const widgets = widgetsRef.value || []
    let widget: BatchWidget | null = null
    for (let i = 0; i < widgets.length; i++) {
      if (widgets[i].id === entityId) {
        widget = widgets[i]
        break
      }
    }
    if (!widget) return
    const next = new Map(displays.value)
    next.set(entityId, buildWidgetDisplayState(widget as FloorWidget, resolveEntityForDisplay(entityId)))
    displays.value = next
  }
  /**
   * 部件订阅指纹：仅读取构建 display 实际用到的字段（id/type/stateLabels）。
   * layoutConfig 为深响应式，拖拽时 xPct/yPct 每帧变更；
   * 若 deep watch 整个 widgets 数组会每帧触发 syncAll 全量重建。
   */
  function widgetsFingerprint(widgets: BatchWidget[] | null | undefined): string {
    if (!widgets?.length) return '0'
    let fp = String(widgets.length)
    for (let i = 0; i < widgets.length; i++) {
      const w = widgets[i]
      fp += '|' + (w.id || '')
      fp += ':' + (w.type || '')
      if (w.stateLabels) fp += ':' + JSON.stringify(w.stateLabels)
    }
    return fp
  }
  const raf =
    typeof requestAnimationFrame === 'function'
      ? requestAnimationFrame
      : (fn: () => void) => setTimeout(fn, 16)
  let flushRaf = 0
  /** @type {Set<string>} */
  const pendingEntityIds = new Set<string>()
  function flushPendingSync() {
    flushRaf = 0
    if (!enabledRef.value) return
    if (pendingEntityIds.size === 0) {
      syncAll()
      return
    }
    if (pendingEntityIds.size === 1) {
      syncOne(pendingEntityIds.values().next().value as string)
    } else {
      syncAll()
    }
    pendingEntityIds.clear()
  }
  function scheduleSync(payload: EntityStateListenerPayload) {
    const entityId = payload?.entity_id
    if (entityId) pendingEntityIds.add(entityId)
    if (flushRaf) return
    flushRaf = raf(flushPendingSync)
  }
  /** 可见 ID 集合指纹：整体替换时内容变化可被捕获（仅 size 会漏掉同尺寸内容置换） */
  function visibleIdsFingerprint(set: Set<string> | null | undefined): string {
    if (!set || set.size === 0) return '0'
    let fp = String(set.size)
    for (const id of set) fp += ':' + id
    return fp
  }

  // 指纹订阅：visibleIds 每次重算整体替换 Set 引用（内容指纹比较即可）；
  // widgets 只取构建 display 的字段，避免拖拽 xPct/yPct 每帧触发全量 syncAll
  watch(
    () => [
      enabledRef.value,
      visibleIdsFingerprint(visibleIdsRef.value),
      widgetsFingerprint(widgetsRef.value),
      activePopupIdRef?.value,
    ],
    syncAll,
    { immediate: true },
  )
  // 不再 watch derivedEpoch：它每批状态推送都会递增，直接 syncAll 会全量重建 displays Map，
  // 抵消 syncOne 的 rAF 增量优化；实体状态增量统一走下方 usePausableStateListener →
  // scheduleSync → syncOne/syncAll 的 rAF 路径。
  usePausableStateListener(scheduleSync, {
    entityIds: () => {
      if (!enabledRef.value) return []
      return resolveSubscribedIds()
    },
  })
  return { displays }
}
/**
 * @param {import('vue').MaybeRefOrGetter<string>} widgetIdRef
 */
export function useFloorplanDisplay(widgetIdRef: MaybeRefOrGetter<string>) {
  const displays = inject(FLOORPLAN_DISPLAY_KEY, null) as {
    value: Map<string, WidgetDisplayState>
  } | null
  const entitiesStore = useEntitiesStore()
  return computed(() => {
    void entitiesStore.derivedEpoch
    if (!displays?.value) return null
    const id = toValue(widgetIdRef)
    return displays.value.get(id) ?? null
  })
}
