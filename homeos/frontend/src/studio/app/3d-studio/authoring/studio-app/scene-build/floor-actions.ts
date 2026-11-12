import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { reorderFloors as reorderFloors2 } from '../../../plan/floor-order'
import { createFloorCopy } from '../../../plan/floor-copy'
import { generateId } from '../../ui/studio-app-helpers'
import { createFloorRecord } from '../../scene/payload/studio-document-payload'
import { confirmFloorDeletion } from '../ui/studio-confirm-dialogs'

export function uniqueFloorName(runtime: StudioAppRuntime, baseName: any, currentFloorId = '') {
  const set = new Set(
    (runtime.appCtx.studioProject?.floors || [])
      .filter((otherFloor: any) => otherFloor.id !== currentFloorId)
      .map((otherFloorName: any) => otherFloorName.name),
  )
  if (!set.has(baseName)) return baseName
  let num = 2
  for (; set.has(baseName + ' ' + num); ) num += 1
  return baseName + ' ' + num
}

export function hideFloorActionMenu(runtime: StudioAppRuntime) {
  ;(runtime.floorActionMenuElement.hidden = true), (runtime.appCtx.pendingFloorMenuId = '')
}

export function showFloorActionMenu(runtime: StudioAppRuntime, floorRow: any, menuOpenEvent: any) {
  runtime.appCtx.pendingFloorMenuId = floorRow.id
  const selector = runtime.floorActionMenuElement.querySelector('[data-floor-action="delete"]')
  ;(selector.disabled = runtime.appCtx.studioProject.floors.length <= 1),
    (runtime.floorActionMenuElement.hidden = false),
    (runtime.floorActionMenuElement.style.left = Math.min(menuOpenEvent.clientX, window.innerWidth - 116) + 'px'),
    (runtime.floorActionMenuElement.style.top = Math.min(menuOpenEvent.clientY, window.innerHeight - 118) + 'px')
}

export async function floorActionHandler(runtime: StudioAppRuntime, floorToDelete: any) {
  if (!floorToDelete || runtime.appCtx.studioProject.floors.length <= 1) return
  if (await confirmFloorDeletion(floorToDelete.name)) await confirmFloorDelete(runtime, floorToDelete)
}

async function confirmFloorDelete(runtime: StudioAppRuntime, floorToDelete?: any) {
  const deletedFloor =
    floorToDelete ||
    runtime.appCtx.studioProject.floors.find(
      (floorEntryMatch: { id?: string }) => floorEntryMatch.id === runtime.appCtx.pendingFloorDeleteId,
    )
  runtime.appCtx.pendingFloorDeleteId = ''
  if (!deletedFloor || runtime.appCtx.studioProject.floors.length <= 1) return
  const deletedFloorIndex = runtime.appCtx.studioProject.floors.findIndex(
    (floorIndexMatch: any) => floorIndexMatch.id === deletedFloor.id,
  )
  if (deletedFloorIndex < 0) return
  runtime.appCtx.studioProject.floors.splice(deletedFloorIndex, 1),
    runtime.appCtx.studioProject.floors.forEach((elevationFloor: any, floorOrderIndex: any) => {
      elevationFloor.elevation = floorOrderIndex * runtime.appCtx.studioProject.defaultFloorHeight
    })
  const nextActiveFloor =
    runtime.appCtx.studioProject.floors[Math.max(0, deletedFloorIndex - 1)] || runtime.appCtx.studioProject.floors[0]
  await runtime.selectFloor(nextActiveFloor.id, {
    persist: false,
  }),
    runtime.updateFloorPreviewButtons(),
    runtime.markDocumentDirty(),
    runtime.showToast('已删除“' + deletedFloor.name + '”。', 'success')
}

export function openFloorRenameDialog(runtime: StudioAppRuntime, floorToRename: any) {
  floorToRename &&
    ((runtime.appCtx.pendingFloorMenuId = floorToRename.id),
    (runtime.floorRenameInputElement.value = floorToRename.name),
    runtime.floorRenameDialogElement.showModal(),
    requestAnimationFrame(() => runtime.floorRenameInputElement.select()))
}

export function clearDropIndicator(runtime: StudioAppRuntime) {
  for (const dropIndicatorElement of runtime.floorListElement.querySelectorAll('.floor-row'))
    dropIndicatorElement.classList.remove('drop-before', 'drop-after'), delete dropIndicatorElement.dataset.dropPosition
}

export function moveFloorRow(runtime: StudioAppRuntime, draggedFloorId: any, targetFloorId: any, dropAfterFlag: any) {
  const reorderedFloors = reorderFloors2(
    runtime.appCtx.studioProject.floors,
    draggedFloorId,
    targetFloorId,
    dropAfterFlag,
    runtime.appCtx.studioProject.defaultFloorHeight,
  )
  if (reorderedFloors === runtime.appCtx.studioProject.floors) return
  const movedFloor = runtime.appCtx.studioProject.floors.find(
    (movedFloorMatch: any) => movedFloorMatch.id === draggedFloorId,
  )
  ;(runtime.appCtx.studioProject.floors = reorderedFloors),
    runtime.syncGlobalControls(),
    runtime.updateFloorPreviewButtons(),
    runtime.renderFloorList(),
    runtime.requestSceneRebuild({
      force: true,
    }),
    runtime.markDocumentDirty(),
    movedFloor && runtime.showToast('已调整“' + movedFloor.name + '”的楼层顺序。', 'success')
}

export function renderFloorList(runtime: StudioAppRuntime) {
  const ae2 = runtime.getActiveFloor(),
    activeFloorIndex = ae2
      ? runtime.appCtx.studioProject.floors.findIndex((activeFloorMatch: any) => activeFloorMatch.id === ae2.id)
      : -1,
    canAlignFloor = runtime.appCtx.studioProject.floors.length > 1 && activeFloorIndex > 0
  ;(runtime.alignFloorButton.hidden = !canAlignFloor),
    (runtime.alignFloorButton.disabled = !canAlignFloor || !ae2?.scene?.calibration),
    (runtime.alignFloorButton.textContent = ae2?.aligned ? '重新对齐' : '对齐楼层'),
    runtime.appCtx.alignmentState?.stage === 'reference'
      ? ((runtime.activeToolLabel.textContent = '楼层对齐 · 参照层'),
        (runtime.toolHelpElement.textContent =
          '点击' + runtime.appCtx.alignmentState.referenceFloor.name + '上的楼梯角、墙角或柱点；Esc 取消'))
      : runtime.appCtx.alignmentState?.stage === 'current' &&
        ((runtime.activeToolLabel.textContent = '楼层对齐 · 当前层'),
        (runtime.toolHelpElement.textContent = '点击' + ae2.name + '上的相同位置；系统会自动重合上下楼层'))
}

export async function selectFloor(
  runtime: StudioAppRuntime,
  targetFloorIdSelection: any,
  { persist: didFloorChange = false } = {},
) {
  const targetFloor = runtime.appCtx.studioProject?.floors.find(
    (floorLookup: any) => floorLookup.id === targetFloorIdSelection,
  )
  if (!targetFloor) return
  const selectionRequestId = ++runtime.appCtx.floorSelectionRequestId,
    tu2 = runtime.getPreviewFloorMode() === 'all' ? runtime.captureOverviewCamera() : null
  runtime.appCtx.alignmentState?.floorId !== targetFloor.id && (runtime.appCtx.alignmentState = null),
    (runtime.appCtx.activeFloorId = targetFloor.id),
    (runtime.appCtx.studioProject.activeFloorId = targetFloor.id),
    (runtime.appCtx.studioState = targetFloor.scene),
    (runtime.appCtx.activeLightGroupId = ''),
    runtime.refreshSelection(),
    runtime.refreshPreviewScene(),
    runtime.planPainter?.setTool(runtime.appCtx.activeToolName),
    (runtime.appCtx.previewEndPoint = null),
    // C5：切楼层不再清空撤销 / 重做栈（历史是跨楼层的文档补丁）。
    (runtime.appCtx.planView.rotation = runtime.appCtx.studioState.settings.planViewRotation),
    Promise.allSettled(runtime.preloadDefaultModels())
  const gu2 = runtime.loadBackgroundImage()
  runtime.isEmbeddedStage || (await gu2),
    !(
      selectionRequestId !== runtime.appCtx.floorSelectionRequestId || runtime.appCtx.activeFloorId !== targetFloor.id
    ) &&
      (runtime.refreshScopeItems(),
      runtime.renderFloorList(),
      runtime.resetView(),
      requestAnimationFrame(() => {
        if (
          !(
            selectionRequestId !== runtime.appCtx.floorSelectionRequestId ||
            runtime.appCtx.activeFloorId !== targetFloor.id
          )
        ) {
          if (runtime.getPreviewFloorMode() === 'all') {
            tu2 && runtime.applyCameraState(tu2, tu2.viewportAspect),
              runtime.syncCameraModeControls(runtime.getCameraMode()),
              runtime.syncCameraViewControls(runtime.getCameraView())
            return
          }
          if (runtime.appCtx.studioState.settings.fixedCameraView) {
            runtime.applyCameraSnapshot({
              recordChange: false,
              silent: true,
            })
            return
          }
          runtime.setCameraMode(runtime.getCameraMode(), {
            preserveView: false,
          }),
            runtime.updateCameraView()
        }
      }),
      didFloorChange && runtime.markDocumentDirty())
}

export async function copyFloor(runtime: StudioAppRuntime, sourceFloor: { id: string } | undefined) {
  if (!sourceFloor || runtime.isEmbeddedStage) return
  let copiedFloor: ReturnType<typeof createFloorCopy> | undefined
  try {
    copiedFloor = createFloorCopy(runtime.appCtx.studioProject.floors, sourceFloor.id, {
      newId: generateId,
      floorHeight: runtime.appCtx.studioProject.defaultFloorHeight,
    })
  } catch (copyError) {
    runtime.showToast(copyError instanceof Error ? copyError.message : '楼层复制失败。', 'error')
    return
  }
  if (!copiedFloor) return
  runtime.appCtx.studioProject.floors.push(copiedFloor)
  const floorSelection = runtime.selectFloor(copiedFloor.id, { persist: false })
  runtime.markDocumentDirty()
  runtime.updateFloorPreviewButtons()
  await floorSelection
  runtime.appCtx.activeFloorId === copiedFloor.id &&
    runtime.showToast(`已复制为“${copiedFloor.name}”，绘图位置保持一致，设备关联需重新配置。`, 'success')
  runtime.selectStudioTool('select')
}

export async function addNewFloor(runtime: StudioAppRuntime) {
  const newFloorRecord = createFloorRecord(runtime.studioDocumentDeps(), runtime.appCtx.studioProject.floors.length)
  ;(newFloorRecord.name = runtime.uniqueFloorName(newFloorRecord.name)),
    runtime.appCtx.studioProject.floors.push(newFloorRecord),
    runtime.updateFloorPreviewButtons(),
    await runtime.selectFloor(newFloorRecord.id, {
      persist: false,
    }),
    runtime.markDocumentDirty(),
    runtime.showToast('已新增“' + newFloorRecord.name + '”，导入并校准后会设置上下层参照点。', 'success'),
    runtime.selectStudioTool('select')
}
