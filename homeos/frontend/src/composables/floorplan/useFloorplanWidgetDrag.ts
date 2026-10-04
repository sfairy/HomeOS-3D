/**
 * @file useFloorplanWidgetDrag.ts
 * @module frontend/src/composables
 * @brief 户型图热点拖拽：拖拽中仅写浅层预览，松手再提交 layoutConfig，避免深 watch 每帧扇出。
 */
import { ref, shallowRef, type Ref } from 'vue'
import {
  computeHotspotDragGrab,
  floorLayoutPctFromPointer,
  getFloorplanLayoutMetrics,
  type FloorplanLayoutMetrics,
} from '@/utils/floorplan/hotspot-layout.util'
import type { FloorConfig, FloorWidget, UILayoutConfig } from '@/types/layout'

const DRAG_THRESHOLD_PX = 4

type FloorplanDragPreview = {
  widgetId: string
  xPct: number
  yPct: number
}

type DragUiStore = {
  layoutConfig: UILayoutConfig
  selectedWidgetId: string | null
  pushEditHistory: (a?: boolean, b?: boolean) => void
}

type DragEventLike = MouseEvent | TouchEvent

/**
 * 户型图组件拖拽状态和处理器（从 FloorplanCanvas 中提取）。
 */
export function useFloorplanWidgetDrag({
  layoutStore,
  wrapperRef,
}: {
  layoutStore: DragUiStore
  wrapperRef: Ref<HTMLElement | null | undefined>
}) {
  const draggingWidgetId = ref<string | null>(null)
  /** 拖拽中的浅层坐标预览；松手前不写入 layoutConfig */
  const dragPreview = shallowRef<FloorplanDragPreview | null>(null)
  let grabOffsetXpct = 0
  let grabOffsetYpct = 0
  let dragCachedMetrics: FloorplanLayoutMetrics | null = null
  let dragCachedFloorWidgets: FloorWidget[] | null = null
  let dragRafId: number | null = null
  let dragPendingPoint: { clientX: number; clientY: number } | null = null
  let dragStartClientX = 0
  let dragStartClientY = 0
  let dragCommitted = false

  function findDragWidget(widgetId: string | null) {
    const widgets = dragCachedFloorWidgets
    if (!widgets || widgetId == null) return null
    for (let i = 0; i < widgets.length; i++) {
      if (widgets[i].id === widgetId) return widgets[i]
    }
    return null
  }

  function pointerDistance(clientX: number, clientY: number) {
    const dx = clientX - dragStartClientX
    const dy = clientY - dragStartClientY
    return Math.hypot(dx, dy)
  }

  function computePreviewPct(clientX: number, clientY: number) {
    if (!dragCachedMetrics || !draggingWidgetId.value) return null
    const next = floorLayoutPctFromPointer(
      clientX,
      clientY,
      dragCachedMetrics,
      grabOffsetXpct,
      grabOffsetYpct,
    )
    return {
      widgetId: draggingWidgetId.value,
      xPct: next.xPct,
      yPct: next.yPct,
    } satisfies FloorplanDragPreview
  }

  function writePreview(clientX: number, clientY: number) {
    const preview = computePreviewPct(clientX, clientY)
    if (!preview) return
    dragPreview.value = preview
  }

  function commitPreviewToLayout() {
    const preview = dragPreview.value
    if (!preview) return
    const entry = findDragWidget(preview.widgetId)
    if (!entry) return
    entry.xPct = preview.xPct
    entry.yPct = preview.yPct
    entry.hotspotAnchor = 'icon'
    layoutStore.layoutConfig.hotspotAnchorConvention = 'icon'
  }

  function ensureDragCommitted(clientX: number, clientY: number) {
    if (dragCommitted) return true
    if (pointerDistance(clientX, clientY) < DRAG_THRESHOLD_PX) return false
    const entry = findDragWidget(draggingWidgetId.value)
    if (!entry || !dragCachedMetrics) return false
    // 快照拖拽前布局；坐标仍写在浅层 preview，避免深 reactive 扇出
    layoutStore.pushEditHistory(true, true)
    writePreview(clientX, clientY)
    dragCommitted = true
    return true
  }

  function beginWidgetDrag(widget: { id: string }, event: DragEventLike) {
    const el = wrapperRef.value
    const metrics = getFloorplanLayoutMetrics(el)
    if (!metrics) return
    draggingWidgetId.value = widget.id
    layoutStore.selectedWidgetId = widget.id
    const activeFloor = layoutStore.layoutConfig.floors.find(
      (f: FloorConfig) => f.id === layoutStore.layoutConfig.activeFloorId,
    )
    dragCachedFloorWidgets = activeFloor?.widgets || null
    dragCachedMetrics = metrics
    dragCommitted = false
    dragPreview.value = null
    const entry = findDragWidget(widget.id)
    if (!entry) return
    const point = 'touches' in event ? event.touches[0] : event
    if (!point) return
    dragStartClientX = point.clientX
    dragStartClientY = point.clientY
    const prepared = computeHotspotDragGrab(entry, metrics, point.clientX, point.clientY)
    grabOffsetXpct = prepared.grabOffsetXpct
    grabOffsetYpct = prepared.grabOffsetYpct
  }

  function applyDragPoint(clientX: number, clientY: number) {
    if (!draggingWidgetId.value || !dragCachedMetrics) return
    if (!ensureDragCommitted(clientX, clientY)) return
    writePreview(clientX, clientY)
  }

  function flushPendingDragPoint() {
    if (dragRafId) {
      cancelAnimationFrame(dragRafId)
      dragRafId = null
    }
    if (dragPendingPoint) {
      applyDragPoint(dragPendingPoint.clientX, dragPendingPoint.clientY)
      dragPendingPoint = null
    }
  }

  function onWidgetDragMove(event: DragEventLike) {
    if (!draggingWidgetId.value || !dragCachedMetrics) return
    const point = 'touches' in event ? event.touches[0] : event
    if (!point) return
    dragPendingPoint = { clientX: point.clientX, clientY: point.clientY }
    if (dragRafId) return
    dragRafId = requestAnimationFrame(() => {
      dragRafId = null
      if (!dragPendingPoint) return
      applyDragPoint(dragPendingPoint.clientX, dragPendingPoint.clientY)
      dragPendingPoint = null
    })
  }

  function endWidgetDrag(clientX?: number, clientY?: number) {
    const moved = dragCommitted
    if (!draggingWidgetId.value) return { moved: false }
    flushPendingDragPoint()
    if (
      moved &&
      clientX != null &&
      clientY != null &&
      Number.isFinite(clientX) &&
      Number.isFinite(clientY)
    ) {
      writePreview(clientX, clientY)
    }
    if (moved) commitPreviewToLayout()
    draggingWidgetId.value = null
    dragPreview.value = null
    dragCachedMetrics = null
    dragCachedFloorWidgets = null
    dragPendingPoint = null
    dragCommitted = false
    return { moved }
  }

  function cancelWidgetDrag() {
    if (!draggingWidgetId.value) return
    if (dragRafId) {
      cancelAnimationFrame(dragRafId)
      dragRafId = null
    }
    draggingWidgetId.value = null
    dragPreview.value = null
    dragCachedMetrics = null
    dragCachedFloorWidgets = null
    dragPendingPoint = null
    dragCommitted = false
  }

  return {
    draggingWidgetId,
    dragPreview,
    beginWidgetDrag,
    onWidgetDragMove,
    endWidgetDrag,
    cancelWidgetDrag,
  }
}
