/**
 * `interaction` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
export { applyToolSetting } from './applyToolSetting'
export type { ApplyToolSettingDeps } from './applyToolSetting'
export { createSceneItem } from './createSceneItem'
export type { CreateSceneItemDeps } from './createSceneItem'
export { handlePointerDown } from './handlePointerDown'
export type { HandlePointerDownDeps } from './handlePointerDown'
export { handlePointerUp } from './handlePointerUp'
export type { HandlePointerUpDeps } from './handlePointerUp'
export { hitTestPlanItem } from './hitTestPlanItem'
export type { HitTestPlanItemDeps } from './hitTestPlanItem'
export {
  clearLightGroupDropIndicator,
  collectListDragDropTargets,
  applyListDragDropIndicator,
  activateListDrag,
  handleListDragPointerMove,
  handleListDragPointerUp,
  handleListDragPointerCancel,
  handleListDragTouchMove,
  finishListDrag,
  beginListRowDrag,
} from './list-drag'
export {
  hitTestHandle,
  boundsFromCorners,
  marqueeDelta,
  updateMarqueeOverlay,
  drawMarqueeOverlay,
  renderPlanScene,
  getSelectedObject,
} from './marquee'
export { bindModelDragDrop } from './model-drag-drop'
export {
  updateSnapIndicator,
  toggleSnapSetting,
  schedulePointerMove,
  handlePointerMove,
  cancelPointerDrag,
  scheduleDragUpdate,
  handleCanvasWheel,
  finishPointerDrag,
  handlePointerRelease,
  refreshPreviewScene,
  resetCameraView,
} from './pointer-input'
export {
  createSelectionRef,
  refreshSelection,
  isPlanItemVisible,
  isSelectionAllowed,
  selectSceneObject,
  getDefaultSelectionScope,
  previewScopeOptions,
  resolvePreviewScope,
  classifySelectionScope,
  getCurrentPreviewScope,
  getPreviewScopeSelection,
  setPreviewScope,
} from './preview-scope'
export {
  setDrawingToolGroupOpen,
  closeDrawingToolGroups,
  syncDrawingToolGroupStates,
  selectStudioTool,
  ensureCalibrationReady,
  clearSelection,
  finalizeAddedItem,
  duplicateSelection,
  collectSelectedPlanItems,
  mirrorSelection,
  rotateSelection,
} from './tool-selection'
