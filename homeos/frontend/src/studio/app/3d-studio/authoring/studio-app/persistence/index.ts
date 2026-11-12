/**
 * `persistence` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
export { applyLoadedDraft } from './applyLoadedDraft'
export type { ApplyLoadedDraftDeps } from './applyLoadedDraft'
export {
  markWallsChanged,
  rebuildWallIndex,
  getPixelsPerMeter,
  historyUndoDepth,
  historyRedoDepth,
  isStudioDraftReadonly,
  downloadStudioLocalCopy,
  renderStudioReadonlyBanner,
} from './draft-state'
export {
  syncStudioHistoryFacade,
  syncStudioClipboardFacade,
  historyFailureMessage,
  undoStudioHistory,
  redoStudioHistory,
  applyStudioHistoryDirection,
  collectPatchFloorIds,
  canApplyHistoryPatch,
  refreshAfterHistoryChange,
  validateSelectionChange,
  primeHistorySnapshot,
  deselectAll,
  applyPlacementChange,
  flushPendingHistory,
} from './history'
export { scheduleNearbyModelUpgradesAfterReady } from './nearby-model-upgrades'
export {
  hideStudioReadonlyBanner,
  applyStudioSaveState,
  getStudioSaveStore,
  syncDraftPayloadAfterSave,
  recordSaveConflictFromServer,
  settleStudioSaveResult,
  waitForStudioInteractionIdle,
  flushStudioSaveOnce,
  notifyStudioDraftLoadFailure,
  retryStudioDraftLoad,
  flushStudioSaveBeforeTeardown,
  showToast,
  showSaveState,
  markDocumentDirty,
  scheduleAutosave,
  handleInteractionEnded,
  isInteractionBusy,
  hasUnsavedChanges,
  refreshExitDialogButtons,
  closeExitDialog,
  leaveStudio,
  flushAutosave,
} from './save'
export {
  sceneSyncFlushIsDirty,
  flushSceneSyncRuntime,
  currentSceneSyncSinceKey,
  rememberSceneSyncKey,
  refreshAfterSceneSyncOutcome,
  fetchStudioApi,
} from './scene-sync'
