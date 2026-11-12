/**
 * `ui` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
export { filterAssetList, toggleAssetGroup, setAssetCategory } from './asset-library'
export { bindExportDialogWiring } from './export-dialog-wiring'
export {
  readInspectorGroupCollapseState,
  writeInspectorGroupCollapseState,
  inspectorGroupHasVisibleField,
  countInspectorGroupFields,
  syncInspectorGroups,
  toggleInspectorGroup,
} from './inspector-groups'
export { lightSignatureOf } from './light-signature'
export { classifyLightingScope } from './lighting-scope'
export { getPanelRatioLimits, applyPanelRatios, applyDetailsRatio } from './panel-layout'
export { closeOpenPopovers, applyLightGroupRename, createLightGroup } from './popover-dismiss'
export { refreshStudioUiInner } from './refreshStudioUiInner'
export type { RefreshStudioUiInnerDeps } from './refreshStudioUiInner'
export { refreshStudioView } from './refreshStudioView'
export type { RefreshStudioViewDeps } from './refreshStudioView'
export { prepareSaveConflictDialog, openSaveConflictDialog, recordSaveConflict } from './save-conflict-dialog'
export { materialSlotGroupView } from './slot-group-view'
export { isSnapEnabled, setSnapSettingsOpen, syncSnapControls, applySnapTolerance } from './snap-controls'
export { refreshStepChecklist } from './step-checklist'
export { confirmFloorDeletion, showDrawingLightNotice } from './studio-confirm-dialogs'
export { bindToolOptionWiring } from './tool-option-wiring'
export {
  applyWallHeightInput,
  applyWallThicknessInput,
  applyWallOpacityInput,
  scheduleWallApply,
  commitWallHeight,
  commitWallThickness,
  commitWallOpacity,
} from './wall-inputs'
export { bindWindowDesignerWiring } from './window-designer-wiring'
