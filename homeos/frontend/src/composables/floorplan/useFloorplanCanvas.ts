/**
 * @file useFloorplanCanvas.ts
 * @module frontend/src/composables
 */
import { ref, computed, watch, onMounted, onUnmounted } from 'vue'
import type { FloorConfig, FloorWidget } from '@/types/layout'
import { useEntitiesStore } from '@/stores/entities.store'
import { useLayoutStore } from '@/stores/layout.store'
import { viewportPointToPopupAnchor } from '@/composables/ui/usePopupPosition'
import { buildWidgetPayload, clientToFloorPct } from '@/composables/widget/useWidgetPlacement'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { useFloorplanWidgetDrag } from '@/composables/floorplan/useFloorplanWidgetDrag'
import { useFloorplanViewportCull } from '@/composables/floorplan/useFloorplanViewportCull'
import { useFloorplanEntityBatch } from '@/composables/floorplan/useFloorplanEntityBatch'
import { useFloorplanRenderer } from '@/composables/floorplan/useFloorplanRenderer'
import { useFloorplanLightDim } from '@/composables/floorplan/useFloorplanLightDim'
import { useFloorplanHotspotInteraction } from '@/composables/floorplan/useFloorplanHotspotInteraction'
import { useFloorplanMapViewport } from '@/composables/floorplan/useFloorplanMapViewport'
import { useEnsureVisibleEntities } from '@/composables/entity/useEnsureVisibleEntities'
import { setProjectionScope } from '@/stores/entities/entity-projection'
import {
  formatAspectRatioFromPixels,
  resolveFloorAspectRatio,
} from '@/utils/floorplan/aspect.util'
import { resolveHotspotAnchorPct } from '@/utils/floorplan/hotspot-layout.util'

type FloorplanFloor = FloorConfig & { floorplanAspectRatioManual?: boolean }

function floorManualLocked(f: FloorplanFloor | undefined): boolean | undefined {
  return f?.floorplanAspectRatioManual
}

/**
 * 户型图画布状态和处理器（从 FloorplanCanvas.vue 中提取）。
 */
export function useFloorplanCanvas() {
  const entitiesStore = useEntitiesStore()
  const layoutStore = useLayoutStore()
  const wrapperRef = ref<HTMLElement | null>(null)
  const wrapperClientHeight = ref(0)
  let wrapperResizeObserver: ResizeObserver | null = null

  function syncWrapperClientHeight() {
    wrapperClientHeight.value = wrapperRef.value?.clientHeight || 0
  }

  onMounted(() => {
    syncWrapperClientHeight()
    if (wrapperRef.value && typeof ResizeObserver !== 'undefined') {
      wrapperResizeObserver = new ResizeObserver(syncWrapperClientHeight)
      wrapperResizeObserver.observe(wrapperRef.value)
    }
  })

  onUnmounted(() => {
    wrapperResizeObserver?.disconnect()
    wrapperResizeObserver = null
  })

  const { draggingWidgetId, dragPreview, onWidgetDragMove, beginWidgetDrag, endWidgetDrag } =
    useFloorplanWidgetDrag({ layoutStore, wrapperRef })

  function hotspotAnchorStyle(widget: FloorWidget) {
    const preview = dragPreview.value
    if (preview && preview.widgetId === widget.id) {
      return { left: `${preview.xPct}%`, top: `${preview.yPct}%` }
    }
    const anchor = resolveHotspotAnchorPct(widget)
    return { left: `${anchor.xPct}%`, top: `${anchor.yPct}%` }
  }

  const activePopupId = ref<string | null>(null)
  const isMounted = ref(false)

  const isEditMode = computed(() => layoutStore.isEditMode)
  /** 预览态启用户型图局部 pan/pinch，编辑态关闭以免与拖热点冲突 */
  const mapViewportEnabled = computed(() => !isEditMode.value)
  const {
    worldStyle: mapWorldStyle,
    isMapZoomed,
    onTouchStart: onMapTouchStart,
    onTouchMove: onMapTouchMove,
    onTouchEnd: onMapTouchEnd,
    resetViewport: resetMapViewport,
    zoom,
    panX,
    panY,
  } = useFloorplanMapViewport(mapViewportEnabled)

  watch(isEditMode, (editing) => {
    if (editing) resetMapViewport()
  })

  let clearLongPressBridge = () => {}
  const lightDim = useFloorplanLightDim({
    entitiesStore,
    isEditMode,
    draggingWidgetId,
    clearLongPress: () => clearLongPressBridge(),
  })
  const hotspotInteraction = useFloorplanHotspotInteraction({
    layoutStore,
    entitiesStore,
    isEditMode,
    draggingWidgetId,
    activePopupId,
    beginWidgetDrag,
    endWidgetDrag,
    beginSwipeDim: lightDim.beginSwipeDim,
    endSwipeDim: lightDim.endSwipeDim,
  })
  clearLongPressBridge = hotspotInteraction.clearLongPress

  const {
    longPressProgress,
    longPressWidgetId,
    clearLongPress,
    onWidgetMouseDown,
    onWidgetMouseUp,
    onWidgetClick,
    onWidgetPointerMove,
    dispose: disposeHotspotInteraction,
  } = hotspotInteraction

  const { dimHud, onWidgetWheel, onWidgetTouchMove: onLightTouchMove, dispose: disposeLightDim } =
    lightDim

  function onWidgetTouchMove(widget: { id: string }, event: TouchEvent) {
    onWidgetPointerMove(widget, event)
    onLightTouchMove(widget, event)
  }

  const isPlacementMode = computed(() => isEditMode.value && !!layoutStore.placementEntity)
  const placementLabel = computed(() => {
    const eid = layoutStore.placementEntity?.id
    if (!eid) return ''
    const entity = entitiesStore.getEntity(eid)
    return getEntityDisplayName(eid, entity)
  })
  const selectedWidgetId = computed(() => layoutStore.selectedWidgetId)

  const floor = computed((): FloorplanFloor | undefined => {
    return (layoutStore.layoutConfig.floors.find((f) => f.id === layoutStore.layoutConfig.activeFloorId) ||
      layoutStore.layoutConfig.floors[0]) as FloorplanFloor | undefined
  })

  const wrapperAspectRatio = computed(() =>
    resolveFloorAspectRatio(floor.value?.floorplanAspectRatio, floorManualLocked(floor.value)),
  )

  function onBaseImageLoad(e: Event) {
    const f = floor.value
    if (!f?.backgroundUrl) return
    const img = e.target as HTMLImageElement | null
    const w = img?.naturalWidth
    const h = img?.naturalHeight
    if (!w || !h) return
    const ratio = formatAspectRatioFromPixels(w, h)
    // 始终验证并修正宽高比，确保底图内容与 wrapper 尺寸一致
    // 避免 object-fit: fill 导致的非等比拉伸，使热点与底图内容对齐
    if (f.floorplanAspectRatio !== ratio) {
      f.floorplanAspectRatio = ratio
    }
  }

  const showFloorSwitcher = computed(() => {
    return layoutStore.layoutConfig.floors.length > 1
  })

  const floorWidgets = computed(() => floor.value?.widgets || [])

  const rendererPlan = useFloorplanRenderer(
    () => floorWidgets.value.length,
    () => layoutStore.layoutConfig.floorplanRenderer,
  )
  const cullEnabled = computed(() => rendererPlan.value.useViewportCull && !isEditMode.value)
  const useBatchDisplay = computed(() => rendererPlan.value.useBatchSubscription)
  const useCanvasPreview = computed(() => rendererPlan.value.useCanvasDraw && !isEditMode.value)

  const { visibleIds, isWidgetVisible, scheduleRecompute } = useFloorplanViewportCull(
    wrapperRef,
    floorWidgets,
    cullEnabled,
    { zoom, panX, panY },
  )
  // 位置/数量变化指纹（避免 deep watch widgets 大数组）
  watch(
    () => {
      const widgets = floorWidgets.value
      let sig = String(widgets.length)
      for (let i = 0; i < widgets.length; i++) {
        const w = widgets[i]
        sig += `\0${w.id}:${w.xPct}:${w.yPct}`
      }
      return sig
    },
    () => scheduleRecompute(),
  )
  watch(cullEnabled, () => scheduleRecompute())
  // 补全 map-viewport 手势缩放/平移时的视口重算链路
  watch([zoom, panX, panY], () => {
    if (isEditMode.value) return
    scheduleRecompute()
  })

  const batchEnabled = computed(() => useBatchDisplay.value)
  useFloorplanEntityBatch(batchEnabled, visibleIds, floorWidgets, activePopupId)

  const floorplanEntityIds = computed(() => {
    const ids = floorWidgets.value.map((w) => w.id)
    const pinned = activePopupId.value
    if (pinned && !ids.includes(pinned)) ids.push(pinned)
    return ids
  })
  useEnsureVisibleEntities(floorplanEntityIds)

  watch(
    activePopupId,
    (id) => {
      layoutStore.activeFloorplanPopupId = id
    },
    { immediate: true },
  )

  const showHotspotSkeleton = computed(
    () =>
      !isEditMode.value &&
      entitiesStore.entityLoadPhase === 'hydrating' &&
      entitiesStore.loading &&
      floorWidgets.value.length > 0 &&
      !floorWidgets.value.some((w) => entitiesStore.getEntity(w.id)),
  )

  // visibleIds 每次重算替换 Set 引用；无需 deep / floorWidgets
  watch(
    [visibleIds, activePopupId],
    () => {
      const scope = [...visibleIds.value]
      if (activePopupId.value) scope.push(activePopupId.value)
      setProjectionScope(scope)
    },
    { immediate: true },
  )

  const overlayWidgetList = computed(() =>
    (floor.value?.widgets || []).filter((w) => w.overlayImage),
  )

  const activePopupAnchor = computed(() => {
    if (!activePopupId.value || !wrapperRef.value) return null
    const rect = wrapperRef.value.getBoundingClientRect()
    const widgets = floor.value?.widgets || []
    let widget = null
    for (const w of widgets) {
      if (w.id === activePopupId.value) {
        widget = w
        break
      }
    }
    if (!widget) return null

    const anchor = resolveHotspotAnchorPct(widget)
    const rawX = rect.left + (anchor.xPct / 100) * rect.width
    const rawY = rect.top + (anchor.yPct / 100) * rect.height
    return viewportPointToPopupAnchor(rawX, rawY)
  })

  watch(isEditMode, (editing) => {
    if (!editing) {
      activePopupId.value = null
      clearLongPress()
    }
  })

  function onCanvasClick(e: MouseEvent) {
    if ((e.target as Element | null)?.closest?.('.afh-root, .afh-widget')) return
    activePopupId.value = null
  }

  onMounted(() => {
    isMounted.value = true
    window.addEventListener('mousemove', onWidgetDragMove)
    window.addEventListener('mouseup', onWidgetMouseUp)
    window.addEventListener('touchmove', onWidgetDragMove, { passive: false })
    window.addEventListener('touchend', onWidgetMouseUp)
    const el = wrapperRef.value
    if (el) {
      el.addEventListener('touchstart', onMapTouchStart, { passive: true })
      el.addEventListener('touchmove', onMapTouchMove, { passive: false })
      el.addEventListener('touchend', onMapTouchEnd, { passive: true })
      el.addEventListener('touchcancel', onMapTouchEnd, { passive: true })
    }
  })

  onUnmounted(() => {
    isMounted.value = false
    layoutStore.activeFloorplanPopupId = null
    window.removeEventListener('mousemove', onWidgetDragMove)
    window.removeEventListener('mouseup', onWidgetMouseUp)
    window.removeEventListener('touchmove', onWidgetDragMove)
    window.removeEventListener('touchend', onWidgetMouseUp)
    const el = wrapperRef.value
    if (el) {
      el.removeEventListener('touchstart', onMapTouchStart)
      el.removeEventListener('touchmove', onMapTouchMove)
      el.removeEventListener('touchend', onMapTouchEnd)
      el.removeEventListener('touchcancel', onMapTouchEnd)
    }
    disposeHotspotInteraction()
    disposeLightDim()
    resetMapViewport()
  })

  function onRemoveWidget(id: string) {
    layoutStore.removeWidget(id)
    if (layoutStore.selectedWidgetId === id) {
      layoutStore.selectedWidgetId = null
    }
  }

  function placeWidgetAtClient(event: MouseEvent, payload: { id?: string; type?: string }) {
    const el = wrapperRef.value
    const id = payload?.id
    if (!el || !id) return
    const { xPct, yPct } = clientToFloorPct(event, el)
    const widget = buildWidgetPayload(
      { id, type: payload.type },
      entitiesStore.entities,
      xPct,
      yPct,
    )
    layoutStore.addWidget(widget)
    layoutStore.selectedWidgetId = widget.id
    layoutStore.clearPlacementEntity()
  }

  function onWrapperClick(event: MouseEvent) {
    if (!isPlacementMode.value) return
    if ((event.target as Element | null)?.closest?.('.hotspot')) return
    placeWidgetAtClient(event, layoutStore.placementEntity ?? {})
  }

  function onWidgetDrop(event: DragEvent) {
    if (!layoutStore.isEditMode) return
    const json = event.dataTransfer?.getData('application/json')
    if (!json) return
    const data = JSON.parse(json)
    placeWidgetAtClient(event, data)
  }

  return {
    layoutStore,
    wrapperRef,
    wrapperClientHeight,
    hotspotAnchorStyle,
    hotspotAnchorConvention: computed(() => layoutStore.layoutConfig.hotspotAnchorConvention),
    draggingWidgetId,
    dragPreview,
    activePopupId,
    isEditMode,
    longPressProgress,
    longPressWidgetId,
    onWidgetMouseDown,
    onWidgetMouseUp,
    onWidgetClick,
    dimHud,
    onWidgetWheel,
    onWidgetTouchMove,
    isPlacementMode,
    placementLabel,
    selectedWidgetId,
    floor,
    wrapperAspectRatio,
    mapWorldStyle,
    isMapZoomed,
    onBaseImageLoad,
    showFloorSwitcher,
    floorWidgets,
    useBatchDisplay,
    useCanvasPreview,
    visibleIds,
    isWidgetVisible,
    showHotspotSkeleton,
    overlayWidgetList,
    activePopupAnchor,
    onCanvasClick,
    onRemoveWidget,
    onWrapperClick,
    onWidgetDrop,
  }
}
