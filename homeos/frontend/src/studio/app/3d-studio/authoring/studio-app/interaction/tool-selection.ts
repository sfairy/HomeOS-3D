import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { snapItemToSurface as snapItemToSurface2 } from '../../items/studio-surface-snap'
import { snapExhaustFan } from '../../items/studio-exhaust-fan'
import {
  isCourtyardPlanItem as isCourtyardPlanItem2,
  courtyardToolAllowed as courtyardToolAllowed2,
} from '../../../plan/courtyard-plan'
import { remapCourtyardAttachments as remapCourtyardAttachments2 } from '../../../plan/courtyard-drawing'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { isCourtyardDrawing as isCourtyardDrawing2, finite as finite2 } from '../../../loaders/studio-normalization'
import { lampItemTypeSet } from '../../items/item-catalog'
import { patchStudioFacadeState } from '../../../../../engine'
import type { StudioControlElement } from '../../types/studio-app-types'
import { generateId } from '../../ui/studio-app-helpers'

export function setDrawingToolGroupOpen(
  _runtime: StudioAppRuntime,
  drawingToolSection: any,
  isDrawingToolGroupOpen: any,
) {
  const drawingToolToggle = drawingToolSection.querySelector('.drawing-tool-toggle')
  const drawingToolPanel = drawingToolSection.querySelector('.drawing-tool-buttons')
  if (!drawingToolToggle || !drawingToolPanel) return
  drawingToolSection.classList.toggle('open', isDrawingToolGroupOpen),
    (drawingToolPanel.hidden = !isDrawingToolGroupOpen),
    drawingToolToggle.setAttribute('aria-expanded', String(isDrawingToolGroupOpen))
}

export function closeDrawingToolGroups(runtime: StudioAppRuntime, drawingToolGroupToKeep: any = null) {
  for (const drawingToolSection of runtime.drawingToolSections)
    if (drawingToolSection !== drawingToolGroupToKeep) runtime.setDrawingToolGroupOpen(drawingToolSection, false)
}

export function syncDrawingToolGroupStates(runtime: StudioAppRuntime) {
  for (const drawingToolSection of runtime.drawingToolSections as HTMLElement[]) {
    const activeDrawingToolBadge = drawingToolSection.querySelector<StudioControlElement>('.drawing-tool-active')
    if (!activeDrawingToolBadge) continue
    const activeDrawingToolButton = drawingToolSection.querySelector<StudioControlElement>('.tool-button.active')
    activeDrawingToolBadge.textContent = ''
    if (activeDrawingToolButton) {
      const activeDrawingToolIcon = activeDrawingToolButton.querySelector('i')
      const activeDrawingToolLabel = activeDrawingToolButton.querySelector('span')
      if (activeDrawingToolIcon) {
        const badgeIcon = activeDrawingToolIcon.cloneNode(true) as HTMLElement
        const iconSource = getComputedStyle(activeDrawingToolIcon).getPropertyValue('--hb-ui-icon-source')
        if (iconSource) badgeIcon.style.setProperty('--hb-ui-icon-source', iconSource)
        activeDrawingToolBadge.append(badgeIcon)
      }
      if (activeDrawingToolLabel?.textContent) activeDrawingToolBadge.append(activeDrawingToolLabel.textContent)
    }
    ;(activeDrawingToolBadge.hidden = !activeDrawingToolButton),
      drawingToolSection.classList.toggle('has-active', Boolean(activeDrawingToolButton))
  }
}

export function selectStudioTool(runtime: StudioAppRuntime, toolId: any) {
  if (!(runtime.toolHelpMessages as any)[toolId]) return
  if (
    (toolId.startsWith('courtyard-') &&
      runtime.appCtx.activeLibraryCategory !== 'courtyard' &&
      runtime.setAssetCategory('courtyard'),
    runtime.appCtx.activeLibraryCategory === 'courtyard' && !courtyardToolAllowed2(toolId))
  ) {
    runtime.showToast('庭院编辑中户型已锁定，请先切回家居或电器。')
    return
  }

  if (runtime.appCtx.activeLibraryCategory === 'light' && toolId !== 'select' && toolId !== 'pan') {
    runtime.showToast('灯光编辑中户型已锁定，请先切回家居、电器或庭院。')
    return
  }
  const shouldWarnOpenWall =
    runtime.appCtx.activeToolName === 'wall' && toolId !== 'wall' && runtime.appCtx.wallSegmentCount > 0
  ;(runtime.appCtx.activeToolName = toolId),
    runtime.planPainter?.setTool(toolId),
    (runtime.planCanvasElement.dataset.tool = toolId),
    (runtime.planCanvasElement.style.cursor = '')
  for (const toolButton of runtime.toolButtons)
    toolButton.classList.toggle('active', toolButton.dataset.tool === toolId),
      toolButton.setAttribute('aria-pressed', String(toolButton.dataset.tool === toolId))
  patchStudioFacadeState({ activeTool: toolId })
  patchStudioFacadeState({ activeTool: toolId })
  runtime.closeDrawingToolGroups(),
    runtime.syncDrawingToolGroupStates(),
    ([runtime.activeToolLabel.textContent, runtime.toolHelpElement.textContent] =
      runtime.appCtx.activeLibraryCategory === 'light' && toolId === 'select'
        ? ['灯光编辑', '户型已锁定；框选多盏灯后可整体拖动，Shift 锁轴，Option/Alt 复制']
        : runtime.appCtx.activeLibraryCategory === 'courtyard' && toolId === 'select'
          ? ['庭院编辑', '其他对象已锁定；可选择、移动、框选庭院对象，切换分类恢复编辑']
          : (runtime.toolHelpMessages as any)[toolId]),
    (runtime.finishWallButton.hidden = toolId !== 'wall' || !runtime.appCtx.segmentStartPoint),
    toolId !== 'wall' && runtime.refreshPreviewScene(),
    toolId !== 'scale' && (runtime.appCtx.previewEndPoint = null),
    (runtime.appCtx.snapHit = null),
    (runtime.appCtx.windowPlacement = null),
    (runtime.appCtx.doorPlacement = null),
    (runtime.appCtx.railingPlacement = null),
    runtime.refreshStudioView(),
    shouldWarnOpenWall &&
      runtime.showToast('当前墙线未闭合，不会生成地面；如果绘制的是隔墙，可以忽略此提醒。', 'warning')
}

export function ensureCalibrationReady(runtime: StudioAppRuntime, fallbackToolId = 'scale') {
  return runtime.getPixelsPerMeter()
    ? true
    : (runtime.showToast('请先画一条参考线并填写真实长度。', 'error'), runtime.selectStudioTool(fallbackToolId), false)
}

export function clearSelection(runtime: StudioAppRuntime) {
  if (
    ((runtime.appCtx.selectedItems = runtime.appCtx.selectedItems.filter(runtime.isSelectionAllowed)),
    runtime.appCtx.selectedItem &&
      !runtime.isSelectionAllowed(runtime.appCtx.selectedItem) &&
      runtime.refreshSelection(),
    runtime.appCtx.selectedItems.length)
  ) {
    const qa2 = runtime.getCurrentPreviewScope()
    runtime.deselectAll()
    const clearSelectionWallIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((wallDrawingEntry: any) => wallDrawingEntry.kind === 'wall')
          .map((wallDrawing: any) => wallDrawing.id),
      ),
      windowIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((windowDrawingEntry: any) => windowDrawingEntry.kind === 'window')
          .map((windowDrawing: any) => windowDrawing.id),
      ),
      doorIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((doorDrawingEntry: any) => doorDrawingEntry.kind === 'door')
          .map((doorDrawing: any) => doorDrawing.id),
      ),
      railingIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((railingDrawingEntry: any) => railingDrawingEntry.kind === 'railing')
          .map((railingDrawing: any) => railingDrawing.id),
      ),
      itemIdSet = new Set(
        runtime.appCtx.selectedItems
          .filter((itemDrawingEntry: any) => itemDrawingEntry.kind === 'item')
          .map((itemDrawing: any) => itemDrawing.id),
      )
    ;(runtime.appCtx.studioState.walls = runtime.appCtx.studioState.walls.filter(
      (removedWall) => !clearSelectionWallIdSet.has(removedWall.id),
    )),
      (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.filter(
        (windowItem) => !windowIdSet.has(windowItem.id) && !clearSelectionWallIdSet.has(windowItem.wallId),
      )),
      (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.filter(
        (doorItem) => !doorIdSet.has(doorItem.id) && !clearSelectionWallIdSet.has(doorItem.wallId),
      )),
      (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.filter(
        (railingItem) => !railingIdSet.has(railingItem.id) && !clearSelectionWallIdSet.has(railingItem.wallId),
      )),
      (runtime.appCtx.studioState.items = runtime.appCtx.studioState.items.filter(
        (removedItem) => !itemIdSet.has(removedItem.id),
      )),
      clearSelectionWallIdSet.size && runtime.rebuildWallIndex(),
      runtime.refreshSelection(),
      runtime.refreshScopeItems(qa2),
      runtime.markDocumentDirty()
    return
  }
  const at5 = runtime.getSelectedObject()
  if (!at5 || !runtime.appCtx.selectedItem) return
  const qa3 = runtime.getCurrentPreviewScope()
  runtime.deselectAll(),
    runtime.appCtx.selectedItem.kind === 'wall'
      ? ((runtime.appCtx.studioState.walls = runtime.appCtx.studioState.walls.filter(
          (wallById) => wallById.id !== at5.id,
        )),
        (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.filter(
          (windowByWallId) => windowByWallId.wallId !== at5.id,
        )),
        (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.filter(
          (doorByWallId) => doorByWallId.wallId !== at5.id,
        )),
        (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.filter(
          (railingByWallId) => railingByWallId.wallId !== at5.id,
        )),
        runtime.rebuildWallIndex())
      : runtime.appCtx.selectedItem.kind === 'window'
        ? (runtime.appCtx.studioState.windows = runtime.appCtx.studioState.windows.filter(
            (windowById) => windowById.id !== at5.id,
          ))
        : runtime.appCtx.selectedItem.kind === 'door'
          ? (runtime.appCtx.studioState.doors = runtime.appCtx.studioState.doors.filter(
              (doorById) => doorById.id !== at5.id,
            ))
          : runtime.appCtx.selectedItem.kind === 'railing'
            ? (runtime.appCtx.studioState.railings = runtime.appCtx.studioState.railings.filter(
                (railingById) => railingById.id !== at5.id,
              ))
            : (runtime.appCtx.studioState.items = runtime.appCtx.studioState.items.filter(
                (excludedItem) => excludedItem.id !== at5.id,
              )),
    runtime.refreshSelection(),
    runtime.refreshScopeItems(qa3),
    runtime.markDocumentDirty()
}

export function finalizeAddedItem(runtime: StudioAppRuntime, addedItem: any, movingIds = [addedItem.id]) {
  /**
   * 排气扇只吸墙、不参与台面吸附（0.8.0 在这里明确 `return`）。
   * 朝向保持拖动后的状态，只有新建路径才会先按墙走向对齐。
   */
  if (addedItem?.type === 'exhaust-fan') {
    snapExhaustFan(addedItem, runtime.appCtx.studioState.walls, runtime.getPixelsPerMeter())
    return
  }
  return snapItemToSurface2({
    THREE: ns2,
    item: addedItem,
    items: runtime.appCtx.studioState.items,
    pixelsPerMeter: runtime.getPixelsPerMeter(),
    enabled: runtime.isSnapEnabled() && runtime.appCtx.studioState.settings.snapSurfaces !== false,
    movingIds: movingIds,
    mountModel: (mountedModelItem: any, externalModel: any) =>
      runtime.externalModelRegistry.addExternalItemModel(
        mountedModelItem,
        externalModel,
        runtime.materialLoadOptionsForItem(mountedModelItem),
      ),
  })
}

export function duplicateSelection(runtime: StudioAppRuntime) {
  const duplicateSourceIdSet = new Set([
      ...(runtime.appCtx.selectedItem?.kind === 'item' ? [runtime.appCtx.selectedItem.id] : []),
      ...runtime.appCtx.selectedItems
        .filter((duplicateDrawingEntry: any) => duplicateDrawingEntry.kind === 'item')
        .map((duplicateDrawing: any) => duplicateDrawing.id),
    ]),
    duplicateItems = runtime.appCtx.studioState.items.filter(
      (filteredSceneItem) =>
        duplicateSourceIdSet.has(filteredSceneItem.id) && runtime.isPlanItemVisible(filteredSceneItem),
    )
  if (!duplicateItems.length) {
    runtime.showToast('请先选择要复制的灯具、家具或电器。')
    return
  }
  const ft3 = runtime.captureUndoSnapshot(),
    duplicateOffset = (runtime.getPixelsPerMeter() || 100) * 0.12,
    duplicateClones = duplicateItems.map((sourceItem) => ({
      ...structuredClone(sourceItem),
      id: generateId('item'),
      x: sourceItem.x + duplicateOffset,
      y: sourceItem.y + duplicateOffset,
    }))
  remapCourtyardAttachments2(duplicateItems, duplicateClones),
    runtime.pushUndoEntry(duplicateClones),
    runtime.appCtx.studioState.items.push(...duplicateClones),
    runtime.validateSelectionChange(ft3) &&
      (runtime.applyPlacementChange(ft3),
      duplicateClones.length === 1
        ? runtime.selectSceneObject('item', duplicateClones[0].id)
        : ((runtime.appCtx.selectedItem = null),
          (runtime.appCtx.selectedItems = duplicateClones.map((clonedItem) => ({
            kind: 'item',
            id: clonedItem.id,
          })))),
      runtime.refreshScopeItems(
        runtime.classifySelectionScope(
          duplicateClones.map((clonedItemRecord) => ({
            kind: 'item',
            id: clonedItemRecord.id,
          })),
        ),
      ),
      runtime.markDocumentDirty(),
      runtime.syncStudioClipboardFacade(),
      runtime.showToast('已复制 ' + duplicateClones.length + ' 个物件。'))
}

export function collectSelectedPlanItems(runtime: StudioAppRuntime) {
  const planItemIdSet = new Set([
    ...(runtime.appCtx.selectedItem?.kind === 'item' ? [runtime.appCtx.selectedItem.id] : []),
    ...runtime.appCtx.selectedItems
      .filter((planDrawingEntry: any) => planDrawingEntry.kind === 'item')
      .map((planDrawing: any) => planDrawing.id),
  ])
  return runtime.appCtx.studioState.items.filter(
    (candidateSceneItem) => planItemIdSet.has(candidateSceneItem.id) && runtime.isPlanItemVisible(candidateSceneItem),
  )
}

export function mirrorSelection(runtime: StudioAppRuntime) {
  const zy2 = runtime.collectSelectedPlanItems()
  if (!zy2.length) {
    runtime.showToast('请先选择要复制的灯具、家具或电器。')
    return
  }
  runtime.appCtx.clipboardItems = zy2.map((mirroredSourceItem: any) => structuredClone(mirroredSourceItem))
  const ae7 = runtime.getActiveFloor()
  ;(runtime.appCtx.clipboardSourceFloor = {
    id: ae7.id,
    originX: ae7.originX,
    originY: ae7.originY,
    offsetX: ae7.offsetX,
    offsetZ: ae7.offsetZ,
    rotation: ae7.rotation,
    scene: {
      calibration: structuredClone(runtime.appCtx.studioState.calibration),
    },
  }),
    (runtime.appCtx.pasteOffsetFactor = 0),
    runtime.syncStudioClipboardFacade(),
    runtime.showToast('已复制 ' + runtime.appCtx.clipboardItems.length + ' 个物件，按 ⌘/Ctrl+V 粘贴。')
}

export function rotateSelection(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.clipboardItems.length) {
    runtime.showToast('暂无可粘贴的物件。')
    return
  }
  if (
    runtime.appCtx.clipboardItems.some(
      (validatedPlanItem: any) => validatedPlanItem.type === 'flooropening' || isCourtyardDrawing2(validatedPlanItem),
    ) &&
    !runtime.ensureCalibrationReady()
  )
    return
  if (
    runtime.appCtx.activeLibraryCategory === 'courtyard' &&
    runtime.appCtx.clipboardItems.some((courtyardPlanItem: any) => !isCourtyardPlanItem2(courtyardPlanItem))
  ) {
    runtime.showToast('庭院编辑中只能粘贴庭院对象，请先切换分类。')
    return
  }
  const every = runtime.appCtx.clipboardItems.every((planItemEntry: any) => lampItemTypeSet.has(planItemEntry.type))
  every && runtime.appCtx.activeLibraryCategory !== 'light'
    ? runtime.setAssetCategory('light')
    : !every && runtime.appCtx.activeLibraryCategory === 'light' && runtime.setAssetCategory('home')
  const ft4 = runtime.captureUndoSnapshot()
  runtime.appCtx.pasteOffsetFactor += 1
  const selectionOffset = (runtime.getPixelsPerMeter() || 100) * 0.12 * runtime.appCtx.pasteOffsetFactor,
    movedClones = runtime.appCtx.clipboardItems.map((movedSourceItem: any) => ({
      ...structuredClone(movedSourceItem),
      id: generateId('item'),
      x: movedSourceItem.x + selectionOffset,
      y: movedSourceItem.y + selectionOffset,
      ...((movedSourceItem.type === 'flooropening' ||
        isCourtyardDrawing2(movedSourceItem) ||
        movedSourceItem.courtyardGate) &&
      runtime.appCtx.clipboardSourceFloor &&
      runtime.appCtx.clipboardSourceFloor.id !== runtime.getActiveFloor().id
        ? {
            ...runtime.worldPointForFloor(
              movedSourceItem,
              runtime.appCtx.clipboardSourceFloor,
              runtime.getActiveFloor(),
            ),
            rotation:
              movedSourceItem.rotation +
              finite2(runtime.appCtx.clipboardSourceFloor.rotation, 0) -
              finite2(runtime.getActiveFloor().rotation, 0),
          }
        : {}),
      ...(lampItemTypeSet.has(movedSourceItem.type) &&
      !runtime.appCtx.studioState.lightGroups.some((lightGroup) => lightGroup.id === movedSourceItem.lightGroupId)
        ? {
            lightGroupId: runtime.getLightGroups().id,
          }
        : {}),
    }))
  remapCourtyardAttachments2(runtime.appCtx.clipboardItems, movedClones),
    runtime.pushUndoEntry(movedClones),
    runtime.appCtx.studioState.items.push(...movedClones),
    runtime.validateSelectionChange(ft4) &&
      (runtime.applyPlacementChange(ft4),
      movedClones.length === 1
        ? runtime.selectSceneObject('item', movedClones[0].id)
        : ((runtime.appCtx.selectedItem = null),
          (runtime.appCtx.selectedItems = movedClones.map((movedItem: any) => ({
            kind: 'item',
            id: movedItem.id,
          })))),
      runtime.refreshScopeItems(
        runtime.classifySelectionScope(
          movedClones.map((movedItemRecord: any) => ({
            kind: 'item',
            id: movedItemRecord.id,
          })),
        ),
      ),
      runtime.markDocumentDirty(),
      runtime.syncStudioClipboardFacade(),
      runtime.showToast('已粘贴 ' + movedClones.length + ' 个物件。'))
}
