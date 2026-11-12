import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { validatePlacementChange as validatePlacementChange2 } from '../../items/studio-placement'
import { getStudioFacadeState, patchStudioFacadeState } from '../../../../../engine/index'
import { buildStudioHistoryPatch } from '../../ui/studio-history'
import { applyDocumentPatch, canApplyDocumentPatch } from '../../store/document-store'
import type { DocumentPatch } from '../../store/document-store'
import { diffDocumentPatches, describeDocumentPatch } from '../../store/document-diff'
import { historyChangePreviewScope, itemPreviewScope } from '../../scene/studio-preview-scope'
import type { PreviewScope } from '../../scene/studio-preview-scope'
import { previewScopeOptions } from '../interaction/preview-scope'

export function syncStudioHistoryFacade(runtime: StudioAppRuntime) {
  patchStudioFacadeState({
    history: buildStudioHistoryPatch(runtime.historyUndoDepth(), runtime.historyRedoDepth()),
    activeTool: runtime.appCtx.activeToolName,
  })
}

/**
 * 复制 / 粘贴按钮的可用性。
 *
 * 选择或剪贴板一变就 patch —— 但**先比对**当前 facade 值，相同则不派发：
 * `refreshStudioUi` 在一次点击里会被调多次，无脑 patch 会让壳层每个事件都整体换一份
 * state 对象，按钮的 `:disabled` 也跟着抖。剪贴板内容不参与比较（不可枚举）。
 */
export function syncStudioClipboardFacade(runtime: StudioAppRuntime) {
  const canCopy = runtime.collectSelectedPlanItems().length > 0
  const canPaste = runtime.appCtx.clipboardItems.length > 0
  const currentClipboard = getStudioFacadeState().clipboard
  if (currentClipboard?.canCopy === canCopy && currentClipboard?.canPaste === canPaste) return
  patchStudioFacadeState({ clipboard: { canCopy, canPaste } })
}

/** 撤销 / 重做：先 canApply 再出栈；失败不出栈，应用失败由历史 store 压回并回调提示。 */
export function historyFailureMessage(_runtime: StudioAppRuntime, direction: 'undo' | 'redo', reason: string): string {
  const historyActionName = direction === 'undo' ? '撤销' : '重做'
  return reason === 'not-applicable'
    ? '无法' + historyActionName + '：该操作与后续改动冲突（例如合并墙上新增了门窗或栏杆）。'
    : historyActionName + '失败：历史状态已失效，未做修改。'
}

export async function undoStudioHistory(runtime: StudioAppRuntime) {
  await runtime.applyStudioHistoryDirection('undo')
}

export async function redoStudioHistory(runtime: StudioAppRuntime) {
  await runtime.applyStudioHistoryDirection('redo')
}

export async function applyStudioHistoryDirection(runtime: StudioAppRuntime, direction: 'undo' | 'redo') {
  const historyStore = runtime.studioHistoryStore
  if (!historyStore) return
  if (runtime.isStudioDraftReadonly()) {
    runtime.showToast('只读：草稿载入失败，无法撤销 / 重做。', 'error')
    return
  }
  runtime.pendingHistoryScene = null
  // 补丁是在 `undo()` / `redo()` 内部就地应用的，所以「改前」必须提前拍快照，
  // 否则撤销重做只能保守地整屏重建（`historyChangePreviewScope` 需要前后两份场景）。
  const previousScene = captureHistoryScene(runtime)
  const historyResult = direction === 'undo' ? historyStore.undo() : historyStore.redo()
  if (!historyResult.ok) {
    if (historyResult.reason !== 'empty')
      runtime.showToast(runtime.historyFailureMessage(direction, historyResult.reason), 'warning')
    runtime.syncStudioHistoryFacade()
    return
  }
  runtime.refreshAfterHistoryChange(historyResult.entry.patch, previousScene)
  runtime.syncStudioHistoryFacade()
}

/** 撤销 / 重做前的场景快照；克隆失败时返回 null，调用方退回整屏重建。 */
function captureHistoryScene(runtime: StudioAppRuntime): Record<string, unknown> | null {
  const scene = runtime.appCtx.studioState
  if (!scene) return null
  try {
    return structuredClone(scene) as unknown as Record<string, unknown>
  } catch {
    return null
  }
}

/** 补丁影响到的楼层 id（batch 递归展开），用于刷新楼层缩略图与楼层组。 */
export function collectPatchFloorIds(
  runtime: StudioAppRuntime,
  documentPatch: DocumentPatch,
  affectedFloorIds = new Set<string>(),
): Set<string> {
  if (documentPatch.kind === 'batch') {
    for (const nestedPatch of documentPatch.patches) runtime.collectPatchFloorIds(nestedPatch, affectedFloorIds)
    return affectedFloorIds
  }
  if (documentPatch.floorId) affectedFloorIds.add(documentPatch.floorId)
  return affectedFloorIds
}

/** 合并墙保护：撤销会改写活动楼层的墙，而当前墙上已有新增门窗 / 栏杆时判定不可应用。 */
export function canApplyHistoryPatch(runtime: StudioAppRuntime, documentPatch: DocumentPatch): boolean {
  try {
    const currentProject = runtime.appCtx.studioProject
    if (!currentProject || !canApplyDocumentPatch(currentProject, documentPatch)) return false
    const targetProject = structuredClone(currentProject)
    if (!applyDocumentPatch(targetProject, documentPatch)) return false
    const activeFloor = runtime.getActiveFloor()
    const targetFloor = targetProject.floors?.find(
      (floorRecord: any) => floorRecord.id === (activeFloor?.id ?? runtime.appCtx.activeFloorId),
    )
    if (!activeFloor?.scene || !targetFloor?.scene) return true
    const targetWallById = new Map<string, any>(
      (targetFloor.scene.walls || []).map((targetWall: any) => [targetWall.id, targetWall]),
    )
    const changedWallIds = new Set<string>()
    for (const currentWall of activeFloor.scene.walls || []) {
      const targetWall = targetWallById.get(currentWall?.id)
      if (
        targetWall &&
        (targetWall.start?.x !== currentWall.start?.x ||
          targetWall.start?.y !== currentWall.start?.y ||
          targetWall.end?.x !== currentWall.end?.x ||
          targetWall.end?.y !== currentWall.end?.y)
      )
        changedWallIds.add(currentWall.id)
    }
    if (!changedWallIds.size) return true
    for (const attachmentKey of ['windows', 'doors', 'railings']) {
      const targetAttachmentIds = new Set(
        (targetFloor.scene[attachmentKey] || []).map((attachmentRecord: any) => attachmentRecord.id),
      )
      if (
        (activeFloor.scene[attachmentKey] || []).some(
          (attachmentRecord: any) =>
            changedWallIds.has(attachmentRecord.wallId) && !targetAttachmentIds.has(attachmentRecord.id),
        )
      )
        return false
    }
    return true
  } catch {
    return false
  }
}

/**
 * 历史补丁已就地改完文档，这里只同步运行时派生视图（活动楼层场景 / 旋转 / 预览 / 楼层组）。
 *
 * `previousScene` 是补丁应用**之前**的活动楼层场景快照。有了它就能按
 * `historyChangePreviewScope` 精确决定重绘范围：只改备注 / 选择 → `'none'`，改了灯 → `'lights'`，
 * 改了物品 → `'items'`；拿不到快照或判定不出来时退回 `'all'`（保守）。
 */
export function refreshAfterHistoryChange(
  runtime: StudioAppRuntime,
  documentPatch: DocumentPatch,
  previousScene?: Record<string, unknown> | null,
) {
  const affectedFloorIds = runtime.collectPatchFloorIds(documentPatch)
  const activeFloor = runtime.getActiveFloor()
  if (activeFloor && affectedFloorIds.has(activeFloor.id)) {
    runtime.appCtx.studioState = activeFloor.scene
    runtime.appCtx.planView.rotation =
      runtime.appCtx.studioState?.settings?.planViewRotation ?? runtime.appCtx.planView.rotation
  }
  runtime.selectStudioTool('select'),
    runtime.refreshSelection(),
    runtime.refreshPreviewScene(),
    runtime.refreshScopeItems(resolveHistoryPreviewScope(runtime, previousScene)),
    void runtime.loadBackgroundImage(),
    runtime.syncFloorGroups(affectedFloorIds),
    runtime.renderFloorList(),
    runtime.markDocumentDirty()
}

/** 撤销 / 重做需要重绘的作用域；快照缺失或判定失败时保守返回 `'all'`。 */
function resolveHistoryPreviewScope(
  runtime: StudioAppRuntime,
  previousScene?: Record<string, unknown> | null,
): PreviewScope {
  const nextScene = runtime.appCtx.studioState as unknown as Record<string, unknown> | undefined
  if (!previousScene || !nextScene) return 'all'
  try {
    const options = previewScopeOptions(runtime)
    return historyChangePreviewScope(previousScene, nextScene, {
      itemScope: (item) => itemPreviewScope(item, options),
      selectionScope: () => runtime.getCurrentPreviewScope(),
    })
  } catch {
    return 'all'
  }
}

export function validateSelectionChange(runtime: StudioAppRuntime, placementChange: any) {
  const placementError = validatePlacementChange2(
    placementChange,
    runtime.appCtx.studioState,
    runtime.getPixelsPerMeter() || 100,
  )
  return placementError
    ? (runtime.showToast(placementError, 'error'),
      runtime.appCtx.selectedItem && !runtime.getSelectedObject() && runtime.refreshSelection(),
      (runtime.appCtx.selectedItems = runtime.appCtx.selectedItems.filter(
        (selectionEntry: any) =>
          selectionEntry.kind !== 'item' ||
          runtime.appCtx.studioState.items.some((selectedItemMatch) => selectedItemMatch.id === selectionEntry.id),
      )),
      false)
    : true
}

/** 编辑前快照：同一楼层只保留最早一份（一次操作 = 一个事务）；切楼层后按新楼层重挂。 */
export function primeHistorySnapshot(runtime: StudioAppRuntime, snapshotScene: any = undefined) {
  const floorId = runtime.getActiveFloor()?.id ?? runtime.appCtx.activeFloorId
  if (!floorId) return
  if (runtime.pendingHistoryScene?.floorId === floorId) return
  runtime.pendingHistoryScene = {
    floorId,
    scene: snapshotScene === undefined ? runtime.captureUndoSnapshot() : snapshotScene,
  }
}

export function deselectAll(runtime: StudioAppRuntime) {
  runtime.primeHistorySnapshot()
}

export function applyPlacementChange(runtime: StudioAppRuntime, undoSnapshot: any) {
  runtime.primeHistorySnapshot(undoSnapshot)
}

/** markDocumentDirty 时把「编辑前快照 → 当前文档」的差异记成一条历史；纯选择没有 diff 条目。 */
export function flushPendingHistory(runtime: StudioAppRuntime) {
  const pendingSnapshot = runtime.pendingHistoryScene
  runtime.pendingHistoryScene = null
  const historyStore = runtime.studioHistoryStore
  if (!pendingSnapshot || !historyStore) return
  const currentProject = runtime.appCtx.studioProject
  if (!currentProject?.floors?.some((floorRecord: any) => floorRecord.id === pendingSnapshot.floorId)) return
  let beforeDocument: any
  try {
    beforeDocument = structuredClone(currentProject)
  } catch {
    return
  }
  const beforeFloor = beforeDocument.floors.find((floorRecord: any) => floorRecord.id === pendingSnapshot.floorId)
  if (!beforeFloor) return
  beforeFloor.scene = pendingSnapshot.scene
  const documentPatch = diffDocumentPatches(beforeDocument, currentProject)
  if (!documentPatch) return
  historyStore.record(documentPatch, describeDocumentPatch(documentPatch))
  runtime.syncStudioHistoryFacade()
}
