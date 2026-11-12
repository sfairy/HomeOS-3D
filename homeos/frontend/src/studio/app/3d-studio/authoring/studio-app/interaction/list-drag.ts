import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import type { ListDragRowSession } from '../../types/studio-app-types'
import { resolveListDragDrop } from '../../ui/studio-list-drag-drop'

export function clearLightGroupDropIndicator(runtime: StudioAppRuntime) {
  for (const lightGroupDropIndicatorElement of runtime.lightGroupListElement.querySelectorAll('.light-group-row'))
    lightGroupDropIndicatorElement.classList.remove('drop-before', 'drop-after'),
      delete lightGroupDropIndicatorElement.dataset.dropPosition
  for (const areaDropIndicatorElement of runtime.lightGroupListElement.querySelectorAll('.light-area-row'))
    areaDropIndicatorElement.classList.remove('drop-into', 'drop-before', 'drop-after'),
      delete areaDropIndicatorElement.dataset.dropPosition
}

/** 起拖瞬间把所有落点的矩形抓一份快照，之后拖动过程中不再读 DOM：这样即使源行被重绘（同一帧内不会），本次拖动的判定也不会错位。 */
export function collectListDragDropTargets(runtime: StudioAppRuntime) {
  const listDragDropTargets: any[] = []
  for (const areaRowElement of runtime.lightGroupListElement.querySelectorAll('.light-area-row')) {
    const listedAreaId = areaRowElement.dataset.areaId
    if (!listedAreaId) continue
    const areaSectionElement = areaRowElement.closest('.light-area-section')
    listDragDropTargets.push({
      kind: 'area',
      id: listedAreaId,
      rowElement: areaRowElement,
      rowRect: areaRowElement.getBoundingClientRect(),
      sectionRect: areaSectionElement ? areaSectionElement.getBoundingClientRect() : null,
    })
  }
  for (const groupRowElement of runtime.lightGroupListElement.querySelectorAll('.light-group-row')) {
    const listedGroupId = groupRowElement.dataset.lightGroupId
    if (!listedGroupId) continue
    listDragDropTargets.push({
      kind: 'group',
      id: listedGroupId,
      areaId: groupRowElement.dataset.lightGroupAreaId || null,
      rowElement: groupRowElement,
      rowRect: groupRowElement.getBoundingClientRect(),
      sectionRect: null as any,
    })
  }
  return listDragDropTargets
}

/** 指针落点 → 落点语义。 */
export function applyListDragDropIndicator(runtime: StudioAppRuntime, listDragSession: any, pendingListDrop: any) {
  runtime.clearLightGroupDropIndicator()
  if (!pendingListDrop) return
  const findDropIndicatorRow = (dropIndicatorTargetId: any) =>
    listDragSession.dropTargets.find((dropTargetCandidate: any) => dropTargetCandidate.id === dropIndicatorTargetId)
      ?.rowElement
  if (pendingListDrop.kind === 'area') {
    findDropIndicatorRow(pendingListDrop.targetId)?.classList.add(
      pendingListDrop.insertAfter ? 'drop-after' : 'drop-before',
    )
    return
  }
  if (pendingListDrop.anchorGroupId) {
    findDropIndicatorRow(pendingListDrop.anchorGroupId)?.classList.add(
      pendingListDrop.insertAfter ? 'drop-after' : 'drop-before',
    )
    return
  }
  pendingListDrop.areaId && findDropIndicatorRow(pendingListDrop.areaId)?.classList.add('drop-into')
}

export function activateListDrag(runtime: StudioAppRuntime, listDragSession: any) {
  ;(listDragSession.active = true),
    (listDragSession.dropTargets = runtime.collectListDragDropTargets()),
    listDragSession.rowElement.classList.remove('drag-ready'),
    listDragSession.rowElement.classList.add('dragging'),
    document.documentElement.classList.add('list-drag-active')
  const dragGhostElement = document.createElement('div')
  ;(dragGhostElement.className = 'light-row-drag-ghost'),
    (dragGhostElement.textContent = listDragSession.name || ''),
    document.body.append(dragGhostElement),
    (listDragSession.ghostElement = dragGhostElement)
  try {
    listDragSession.rowElement.setPointerCapture(listDragSession.pointerId)
  } catch {
    /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */
  }
}

export function handleListDragPointerMove(runtime: StudioAppRuntime, listDragPointerMoveEvent: any) {
  const listDragSession = runtime.appCtx.activeListDragSession
  if (!listDragSession || listDragPointerMoveEvent.pointerId !== listDragSession.pointerId) return
  const movedDistance = Math.hypot(
    listDragPointerMoveEvent.clientX - listDragSession.startX,
    listDragPointerMoveEvent.clientY - listDragSession.startY,
  )
  if (!listDragSession.active) {
    if (!listDragSession.armed) {
      movedDistance > runtime.LIST_DRAG_TOUCH_GIVE_UP_DISTANCE && runtime.finishListDrag(false)
      return
    }
    if (movedDistance < runtime.LIST_DRAG_START_DISTANCE) return
    runtime.activateListDrag(listDragSession)
  }
  listDragPointerMoveEvent.cancelable && listDragPointerMoveEvent.preventDefault(),
    listDragSession.ghostElement &&
      ((listDragSession.ghostElement.style.left = listDragPointerMoveEvent.clientX + 'px'),
      (listDragSession.ghostElement.style.top = listDragPointerMoveEvent.clientY + 'px')),
    (listDragSession.pendingDrop = resolveListDragDrop(
      listDragSession,
      listDragPointerMoveEvent.clientX,
      listDragPointerMoveEvent.clientY,
    )),
    runtime.applyListDragDropIndicator(listDragSession, listDragSession.pendingDrop)
}

export function handleListDragPointerUp(runtime: StudioAppRuntime, listDragPointerUpEvent: any) {
  const listDragSession = runtime.appCtx.activeListDragSession
  if (!listDragSession || listDragPointerUpEvent.pointerId !== listDragSession.pointerId) return
  runtime.finishListDrag(true)
}

export function handleListDragPointerCancel(runtime: StudioAppRuntime) {
  runtime.finishListDrag(false)
}

/** 触摸拖动期间必须吃掉 touchmove，否则面板会跟着手指一起滚动。 */
export function handleListDragTouchMove(runtime: StudioAppRuntime, listDragTouchMoveEvent: any) {
  runtime.appCtx.activeListDragSession?.active &&
    listDragTouchMoveEvent.cancelable &&
    listDragTouchMoveEvent.preventDefault()
}

export function finishListDrag(runtime: StudioAppRuntime, commitListDropFlag: any) {
  const listDragSession = runtime.appCtx.activeListDragSession
  if (!listDragSession) return
  ;(runtime.appCtx.activeListDragSession = null),
    listDragSession.holdTimeoutId && clearTimeout(listDragSession.holdTimeoutId),
    window.removeEventListener('pointermove', runtime.handleListDragPointerMove),
    window.removeEventListener('pointerup', runtime.handleListDragPointerUp),
    window.removeEventListener('pointercancel', runtime.handleListDragPointerCancel),
    window.removeEventListener('touchmove', runtime.handleListDragTouchMove),
    listDragSession.ghostElement?.remove(),
    listDragSession.rowElement.classList.remove('dragging', 'drag-ready'),
    document.documentElement.classList.remove('list-drag-active'),
    runtime.clearLightGroupDropIndicator()

  if (!listDragSession.active) return
  runtime.appCtx.listDragEndedAt = Date.now()
  const pendingListDrop = listDragSession.pendingDrop
  pendingListDrop &&
    commitListDropFlag &&
    (pendingListDrop.kind === 'area'
      ? runtime.moveAreaRow(listDragSession.id, pendingListDrop.targetId, pendingListDrop.insertAfter)
      : runtime.moveLightGroupToArea(
          listDragSession.id,
          pendingListDrop.areaId,
          pendingListDrop.anchorGroupId,
          pendingListDrop.insertAfter,
        ))
}

/** 行上的 pointerdown 入口。 */
export function beginListRowDrag(
  runtime: StudioAppRuntime,
  listDragRowSession: ListDragRowSession | null,
  listDragPointerDownEvent: any,
) {
  runtime.appCtx.activeListDragSession && runtime.finishListDrag(false)
  ;(listDragRowSession!.pointerId = listDragPointerDownEvent.pointerId),
    (listDragRowSession!.pointerType = listDragPointerDownEvent.pointerType || 'mouse'),
    (listDragRowSession!.startX = listDragPointerDownEvent.clientX),
    (listDragRowSession!.startY = listDragPointerDownEvent.clientY),
    (listDragRowSession!.armed = listDragRowSession!.pointerType !== 'touch'),
    (listDragRowSession!.active = false),
    (listDragRowSession!.pendingDrop = null),
    (listDragRowSession!.ghostElement = null),
    (listDragRowSession!.dropTargets = []),
    (listDragRowSession!.holdTimeoutId = null),
    (runtime.appCtx.activeListDragSession = listDragRowSession)
  listDragRowSession!.armed ||
    (listDragRowSession!.holdTimeoutId = setTimeout(() => {
      ;(listDragRowSession!.holdTimeoutId = null),
        runtime.appCtx.activeListDragSession === listDragRowSession &&
          ((listDragRowSession!.armed = true), listDragRowSession!.rowElement.classList.add('drag-ready'))
    }, runtime.LIST_DRAG_TOUCH_HOLD_MS))
  window.addEventListener('pointermove', runtime.handleListDragPointerMove, { passive: false }),
    window.addEventListener('pointerup', runtime.handleListDragPointerUp),
    window.addEventListener('pointercancel', runtime.handleListDragPointerCancel),
    window.addEventListener('touchmove', runtime.handleListDragTouchMove, { passive: false })
}
