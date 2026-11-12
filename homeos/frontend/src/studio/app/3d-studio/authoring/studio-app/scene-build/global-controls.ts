import type { StudioAppRuntime } from '../runtime/studio-app-runtime'

export function syncGlobalControls(runtime: StudioAppRuntime) {
  if (runtime.appCtx.studioProject) {
    runtime.floorListElement.replaceChildren()
    for (const floorRowRecord of runtime.appCtx.studioProject.floors) {
      const element = document.createElement('div')
      ;(element.className =
        'floor-row' +
        (floorRowRecord.id === runtime.appCtx.activeFloorId ? ' active' : '') +
        (floorRowRecord.aligned ? '' : ' unaligned')),
        (element.dataset.floorId = floorRowRecord.id),
        (element.draggable = true),
        element.setAttribute(
          'aria-label',
          floorRowRecord.name +
            '，' +
            (floorRowRecord.id === runtime.appCtx.activeFloorId ? '当前楼层，' : '') +
            '长按拖动排序，右键可复制、重命名或删除',
        )
      let isFloorDropAfter = false,
        longPressTimeoutId: any = null
      const cancelLongPress = () => {
        longPressTimeoutId && clearTimeout(longPressTimeoutId),
          (longPressTimeoutId = null),
          (isFloorDropAfter = false),
          element.classList.remove('drag-ready')
      }
      element.addEventListener('pointerdown', (pointerDownEvent) => {
        pointerDownEvent.button !== 0 ||
          (pointerDownEvent.target instanceof Element && pointerDownEvent.target.closest('button')) ||
          (cancelLongPress(),
          (longPressTimeoutId = setTimeout(() => {
            ;(longPressTimeoutId = null), (isFloorDropAfter = true), element.classList.add('drag-ready')
          }, 280)))
      }),
        element.addEventListener('pointerup', cancelLongPress),
        element.addEventListener('pointercancel', cancelLongPress),
        element.addEventListener('dragstart', (dragStartEvent) => {
          if (!isFloorDropAfter) {
            dragStartEvent.preventDefault(), cancelLongPress()
            return
          }
          ;(runtime.appCtx.movingFloorId = floorRowRecord.id),
            element.classList.remove('drag-ready'),
            element.classList.add('dragging'),
            (dragStartEvent.dataTransfer!.effectAllowed = 'move'),
            dragStartEvent.dataTransfer!.setData('application/x-homeos-floor', floorRowRecord.id)
        }),
        element.addEventListener('dragend', () => {
          ;(runtime.appCtx.movingFloorId = ''),
            element.classList.remove('dragging'),
            cancelLongPress(),
            runtime.clearDropIndicator()
        }),
        element.addEventListener('dragover', (dragOverEvent) => {
          if (!runtime.appCtx.movingFloorId || runtime.appCtx.movingFloorId === floorRowRecord.id) return
          dragOverEvent.preventDefault(), runtime.clearDropIndicator()
          const isDropAfterPointer =
            dragOverEvent.clientY >= element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2
          ;(element.dataset.dropPosition = isDropAfterPointer ? 'after' : 'before'),
            element.classList.add(isDropAfterPointer ? 'drop-after' : 'drop-before'),
            dragOverEvent.dataTransfer && (dragOverEvent.dataTransfer.dropEffect = 'move')
        }),
        element.addEventListener('drop', (dropEvent) => {
          if (!runtime.appCtx.movingFloorId || runtime.appCtx.movingFloorId === floorRowRecord.id) return
          dropEvent.preventDefault()
          const rr2 = runtime.appCtx.movingFloorId,
            isDropPositionAfter = element.dataset.dropPosition === 'after'
          ;(runtime.appCtx.movingFloorId = ''),
            runtime.clearDropIndicator(),
            runtime.moveFloorRow(rr2, floorRowRecord.id, isDropPositionAfter)
        })
      const floorSwitchButton = document.createElement('button')
      ;(floorSwitchButton.type = 'button'),
        (floorSwitchButton.textContent = floorRowRecord.id === runtime.appCtx.activeFloorId ? '●' : '○'),
        (floorSwitchButton.title = '切换到' + floorRowRecord.name),
        floorSwitchButton.addEventListener('click', (switchClickEvent) => {
          switchClickEvent.stopPropagation(),
            runtime.selectFloor(floorRowRecord.id, {
              persist: true,
            })
        })
      const floorNameLabel = document.createElement('span')
      ;(floorNameLabel.textContent = floorRowRecord.name),
        (floorNameLabel.title = '长按后拖动可调整楼层顺序，右键可复制、重命名或删除楼层')
      const floorStatusNote = document.createElement('small'),
        floorRowIndex = runtime.appCtx.studioProject.floors.findIndex(
          (floorIndexEntry: any) => floorIndexEntry.id === floorRowRecord.id,
        )
      ;(floorStatusNote.textContent = floorRowIndex === 0 ? '基准' : floorRowRecord.aligned ? '已对齐' : '待对齐'),
        element.addEventListener('click', () => {
          runtime.selectFloor(floorRowRecord.id, {
            persist: true,
          })
        }),
        element.addEventListener('contextmenu', (rowActionMenuEvent) => {
          rowActionMenuEvent.preventDefault(), runtime.showFloorActionMenu(floorRowRecord, rowActionMenuEvent)
        }),
        element.append(floorSwitchButton, floorNameLabel, floorStatusNote),
        runtime.floorListElement.append(element)
    }
    runtime.renderFloorList()
  }
}
