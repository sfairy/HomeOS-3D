/**
 * @file useFloorplanHotspotInteraction.ts
 * @module frontend/src/composables
 * @brief 户型图热点交互：基于显式手势状态机，互斥单击 / 长按弹窗 / 竖滑调光。
 */
import { ref, type Ref, type ComputedRef } from 'vue'
import { getEntityDomain } from '@homeos/shared'
import { notifyError } from '@/services/notify'
import {
  entityPopupOpensOnClick,
  hasEntityControlPopup,
} from '@/utils/entity/popup-registry'
import { shouldToggleOnQuickClick } from '@/utils/floorplan/widget.util'
import {
  armGesture,
  createIdleGesture,
  FLOORPLAN_LONG_PRESS_MS,
  shouldQuickToggle,
  tryEnterSwipeDim,
  type FloorplanGestureSnapshot,
} from '@/utils/floorplan/gesture-machine.util'
import type { useEntitiesStore } from '@/stores/entities.store'
import type { useLayoutStore } from '@/stores/layout.store'

type EntitiesStore = ReturnType<typeof useEntitiesStore>
type LayoutStore = ReturnType<typeof useLayoutStore>

interface FloorplanHotspotInteractionDeps {
  layoutStore: LayoutStore
  entitiesStore: EntitiesStore
  isEditMode: ComputedRef<boolean>
  draggingWidgetId: Ref<string | null>
  activePopupId: Ref<string | null>
  beginWidgetDrag: (widget: { id: string }, event: MouseEvent | TouchEvent) => void
  endWidgetDrag: (clientX?: number, clientY?: number) => { moved: boolean }
  beginSwipeDim: (widget: { id: string }, event: MouseEvent | TouchEvent) => void
  endSwipeDim: () => boolean
  /** 竖滑进入调光时由上层通知（可选，用于取消长按以外的副作用） */
  onSwipeDimEntered?: () => void
}

function eventPoint(event: MouseEvent | TouchEvent) {
  if ('changedTouches' in event && event.changedTouches?.[0]) return event.changedTouches[0]
  if ('touches' in event && event.touches?.[0]) return event.touches[0]
  return event as MouseEvent
}

/** 户型图热点长按/短按/弹窗交互（FloorplanCanvas 拆分模块） */
export function useFloorplanHotspotInteraction(deps: FloorplanHotspotInteractionDeps) {
  const {
    layoutStore,
    entitiesStore,
    draggingWidgetId,
    activePopupId,
    beginWidgetDrag,
    endWidgetDrag,
    beginSwipeDim,
    endSwipeDim,
    onSwipeDimEntered,
  } = deps

  const longPressProgress = ref(0)
  const longPressWidgetId = ref<string | null>(null)

  let gesture: FloorplanGestureSnapshot = createIdleGesture()
  let longPressRaf: number | null = null
  let longPressStartTs = 0
  let toggleHandledWidgetId: string | null = null
  let suppressNextWidgetClick = false

  function clearLongPress() {
    if (longPressRaf) {
      cancelAnimationFrame(longPressRaf)
      longPressRaf = null
    }
    longPressProgress.value = 0
    longPressWidgetId.value = null
    longPressStartTs = 0
  }

  function resetGesture() {
    clearLongPress()
    gesture = createIdleGesture()
  }

  function startLongPressProgress(widgetId: string) {
    clearLongPress()
    longPressWidgetId.value = widgetId
    longPressStartTs = performance.now()
    const tick = (now: number) => {
      if (!longPressStartTs || gesture.phase !== 'armed') return
      const p = Math.min(100, ((now - longPressStartTs) / FLOORPLAN_LONG_PRESS_MS) * 100)
      longPressProgress.value = p
      if (p >= 100) {
        gesture = { ...gesture, phase: 'long_press' }
        activePopupId.value = widgetId
        clearLongPress()
        return
      }
      longPressRaf = requestAnimationFrame(tick)
    }
    longPressRaf = requestAnimationFrame(tick)
  }

  function toggleWidget(widget: { id: string }) {
    const eid = widget.id
    if (!eid || !eid.includes('.')) return
    const entity = entitiesStore.getEntity(eid)
    if (!entity) return
    // 上一次调用仍在途时跳过，避免墙面双击/抖动导致开关来回翻转
    if (entitiesStore.isEntityCallPending?.(eid)) return
    const domain = getEntityDomain(eid)
    if (shouldToggleOnQuickClick(eid)) {
      void entitiesStore
        .callService(domain, 'toggle', eid, undefined, false)
        .catch((e: unknown) => notifyError(e, '设备控制'))
      toggleHandledWidgetId = eid
    }
  }

  function onWidgetMouseDown(widget: { id: string }, event: MouseEvent | TouchEvent) {
    if (layoutStore.isEditMode) {
      gesture = { ...armGesture(widget.id, 0, 0), phase: 'drag_edit' }
      beginWidgetDrag(widget, event)
      return
    }
    const pt = eventPoint(event)
    gesture = armGesture(widget.id, pt.clientX, pt.clientY)
    beginSwipeDim(widget, event)
    if (
      getEntityDomain(widget.id) === 'light' ||
      hasEntityControlPopup(widget.id, entitiesStore.entities)
    ) {
      startLongPressProgress(widget.id)
    }
  }

  /** 指针移动：armed → swipe_dim（取消长按） */
  function onWidgetPointerMove(widget: { id: string }, event: MouseEvent | TouchEvent) {
    if (gesture.phase !== 'armed' || gesture.widgetId !== widget.id) return
    const pt = eventPoint(event)
    const next = tryEnterSwipeDim(gesture, pt.clientX, pt.clientY)
    if (next.phase === 'swipe_dim') {
      gesture = next
      clearLongPress()
      onSwipeDimEntered?.()
    }
  }

  function onWidgetMouseUp(event: MouseEvent | TouchEvent) {
    if (draggingWidgetId.value) {
      const pt = eventPoint(event)
      const { moved } = endWidgetDrag(pt?.clientX, pt?.clientY)
      if (moved) {
        layoutStore.layoutDirty = true
        suppressNextWidgetClick = true
      }
      resetGesture()
      endSwipeDim()
      return
    }

    const wasLongPress = gesture.phase === 'long_press'
    const wasSwipe = gesture.phase === 'swipe_dim' || endSwipeDim()
    const armedWidgetId = gesture.widgetId
    const canQuick = shouldQuickToggle(gesture)

    clearLongPress()

    if (!layoutStore.isEditMode && !wasLongPress && !wasSwipe && canQuick && armedWidgetId) {
      toggleWidget({ id: armedWidgetId })
    }

    gesture = wasLongPress
      ? { ...gesture, phase: 'consumed' }
      : createIdleGesture()
  }

  async function onWidgetClick(widget: { id: string }) {
    if (suppressNextWidgetClick) {
      suppressNextWidgetClick = false
      return
    }
    if (draggingWidgetId.value) return
    if (layoutStore.isEditMode) {
      layoutStore.selectedWidgetId = layoutStore.selectedWidgetId === widget.id ? null : widget.id
      return
    }
    if (gesture.phase === 'long_press' || gesture.phase === 'consumed') {
      gesture = createIdleGesture()
      return
    }

    const domain = getEntityDomain(widget.id) ?? ''

    if (domain === 'light') {
      if (toggleHandledWidgetId === widget.id) toggleHandledWidgetId = null
      return
    }
    if (toggleHandledWidgetId === widget.id) {
      toggleHandledWidgetId = null
      return
    }

    if (
      entityPopupOpensOnClick(widget.id) &&
      hasEntityControlPopup(widget.id, entitiesStore.entities)
    ) {
      activePopupId.value = activePopupId.value === widget.id ? null : widget.id
      return
    }

    activePopupId.value = null
    if (domain !== 'switch' && domain !== 'input_boolean') return
    // 在途调用未结束时跳过，避免重复点击造成开关翻转竞态
    if (entitiesStore.isEntityCallPending?.(widget.id)) return

    const service = entitiesStore.getEntity(widget.id)?.state === 'on' ? 'turn_off' : 'turn_on'
    try {
      await entitiesStore.callService(domain, service, widget.id, undefined, false)
    } catch (e) {
      notifyError(e, '设备控制')
    }
  }

  function dispose() {
    resetGesture()
  }

  return {
    longPressProgress,
    longPressWidgetId,
    clearLongPress,
    onWidgetMouseDown,
    onWidgetMouseUp,
    onWidgetClick,
    onWidgetPointerMove,
    dispose,
  }
}
