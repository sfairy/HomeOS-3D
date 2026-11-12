/**
 * `lights` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
export { addLightModel } from './addLightModel'
export type { AddLightModelDeps } from './addLightModel'
export {
  refreshBaseLighting,
  setShadowQualityHigh,
  clampShadowMapSize,
  syncBaseLightingControls,
  applyBaseLighting,
  saveBaseLightingEdit,
  openLightingDialog,
  confirmLightingDialog,
  updateBaseLightingFromInput,
  collectActiveLightEntries,
  areLightsEnabled,
} from './base-lighting'
export { beginLightingPreview } from './beginLightingPreview'
export type { BeginLightingPreviewDeps } from './beginLightingPreview'
export {
  moveAreaRow,
  moveLightGroupToArea,
  refreshLightAreasFromHa,
  readSavedLightAreaOrder,
  persistLightAreaOrder,
  applySavedLightAreaOrder,
  isKnownLightAreaId,
  syncAreaAssignOptions,
  openLightGroupAreaDialog,
  closeLightGroupAreaDialog,
  toggleAreaExpanded,
  createAreaSection,
  maybeShowDrawingLightNotice,
} from './light-areas'
export {
  restoreLightVisibility,
  findLightGroup,
  transitionLightGroups,
  syncLightCache,
  buildLightCacheMap,
  ensureLightCache,
  updateLightCache,
  showLightCacheFor,
  collectActiveLightGroupKeys,
  showCachedLights,
  captureLightSnapshot,
  restorePreviewAfterFade,
} from './light-cache'
export {
  captureUndoSnapshot,
  resolveLightGroup,
  resolveFloorDefaultGroup,
  isLampEnabled,
  getScreenLightGroups,
  getChargingLightGroups,
  getOrderedFloorList,
  composeLightGroupKey,
  collectLampEntries,
  listLightGroupRows,
  listScreenRows,
  listChargingRows,
  syncScreenLayers,
  syncChargingLayers,
  pushUndoEntry,
} from './light-group-rows'
export { collectLightTargetInputs, syncLightTargetGroups, buildLightGroupList } from './light-group-targets'
export {
  getLightGroups,
  syncLightGroupSelect,
  hideLightGroupActionMenu,
  showLightGroupActionMenu,
  deleteLightGroup,
  uniqueLightGroupName,
  duplicateLightGroup,
  createLightGroupRow,
  syncLightGroupList,
  setAllLightGroupsEnabled,
} from './light-groups'
export { syncLightShapeAndRepaint } from './light-shape-sync'
export { installLightingShaderFailsafe, restoreLightingShaderChecksIfReady } from './lighting-shader-failsafe'
export type { LightingShaderFailsafe } from './lighting-shader-failsafe'
export {
  planLightPrecompileBatches,
  shouldSuspendSceneWork,
  shouldDeferSceneWork,
  scheduleLightPrecompile,
  scheduleExternalPrecompile,
} from './precompile'
export {
  addStripLightPreview,
  applyAccentEmissive,
  planLabelAccentColor,
  createPlanLabel,
  collectLightSourceSpecs,
} from './preview-meshes'
export { setShadowFreeze, updateShadowState } from './scene-shadows-control'
export { collectShadowCandidates, setupSceneShadows } from './scene-shadows'
