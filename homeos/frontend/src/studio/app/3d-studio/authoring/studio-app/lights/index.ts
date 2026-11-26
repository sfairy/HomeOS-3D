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
} from './lighting'
export { beginLightingPreview } from './lighting'
export type { BeginLightingPreviewDeps } from './lighting'
export { sameBaseLighting, saveAutoDiagramLighting, saveEmbeddedBaseLighting } from './lighting'
export type {
  EmbeddedBaseLightingTarget,
  StudioApiFetch,
  StudioDraftResponse,
} from './lighting'
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
} from './light-groups'
export { collectLightTargetInputs, syncLightTargetGroups, buildLightGroupList } from './light-groups'
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
export { syncLightShapeAndRepaint } from './light-areas'
export { installLightingShaderFailsafe, restoreLightingShaderChecksIfReady } from './lighting'
export type { LightingShaderFailsafe } from './lighting'
export {
  planLightPrecompileBatches,
  shouldSuspendSceneWork,
  shouldDeferSceneWork,
  scheduleLightPrecompile,
  scheduleExternalPrecompile,
} from './lighting'
export {
  addStripLightPreview,
  applyAccentEmissive,
  planLabelAccentColor,
  createPlanLabel,
  collectLightSourceSpecs,
} from './lighting'
export { setShadowFreeze, updateShadowState } from './shadows'
export { collectShadowCandidates, setupSceneShadows } from './shadows'
