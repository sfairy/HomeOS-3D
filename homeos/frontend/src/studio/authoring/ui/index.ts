/**
 * `ui` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
export { filterAssetList, toggleAssetGroup, setAssetCategory } from './asset-library'
export { bindExportDialogWiring } from './dialogs'
export {
  readInspectorGroupCollapseState,
  writeInspectorGroupCollapseState,
  inspectorGroupHasVisibleField,
  countInspectorGroupFields,
  syncInspectorGroups,
  toggleInspectorGroup,
} from './inspector-groups'
export { lightSignatureOf } from './lighting'
export { classifyLightingScope } from './lighting'
export { getPanelRatioLimits, applyPanelRatios, applyDetailsRatio, cachePanelRatios } from './workspace'
export { closeOpenPopovers, applyLightGroupRename, createLightGroup } from './workspace'
export { refreshStudioUiInner } from './refresh-view'
export type { RefreshStudioUiInnerDeps } from './refresh-view'
export { refreshStudioView } from './refresh-view'
export type { RefreshStudioViewDeps } from './refresh-view'
export { prepareSaveConflictDialog, openSaveConflictDialog, recordSaveConflict } from './dialogs'
export { installScrollbarReveal } from './workspace'
export { materialSlotGroupView } from './asset-library'
export { isSnapEnabled, setSnapSettingsOpen, syncSnapControls, applySnapTolerance } from './placement'
export { refreshStepChecklist } from './onboarding'
export { confirmFloorDeletion, showDrawingLightNotice } from './dialogs'
export { bindToolOptionWiring } from './wiring'
export {
  applyWallHeightInput,
  applyWallThicknessInput,
  applyWallOpacityInput,
  scheduleWallApply,
  commitWallHeight,
  commitWallThickness,
  commitWallOpacity,
} from './placement'
export { bindWindowDesignerWiring } from './wiring'

// 0.8.9：从 boot.ts 切出的四块（boot 在 studio split 预算上，且它的 imports 扇出也受棘轮约束，
// 所以这些入口统一从本桶转出，boot 只加 4 个名字而不是 4 条 import）。
export { toolHelpMessages } from './onboarding'
export { placeUserDecorationAtViewCenter, DECORATION_DEFAULT_SIZE } from './placement'
export { applyUserDecorationStageContext } from './placement'
export { planCanvasContext } from './placement'
