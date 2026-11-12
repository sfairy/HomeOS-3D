/**
 * `scene-build` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
export { loadBackgroundImage, importBackgroundFile, backgroundSettings } from './background-image'
export { refreshBackground, refreshStudioUi } from './background-refresh'
export { buildStudioScene } from './buildStudioScene'
export type { BuildStudioSceneDeps } from './buildStudioScene'
export {
  isDescendantOfRoot,
  computeSceneBounds,
  computeSceneExtent,
  updateCameraView,
  axisLockedDistance,
  formatMeasurement,
} from './camera-bounds'
export {
  uniqueFloorName,
  hideFloorActionMenu,
  showFloorActionMenu,
  floorActionHandler,
  openFloorRenameDialog,
  clearDropIndicator,
  moveFloorRow,
  renderFloorList,
  selectFloor,
  copyFloor,
  addNewFloor,
} from './floor-actions'
export {
  buildCourtyardFoundation,
  buildGroundShadow,
  getPreviewFloorMode,
  updateFloorPreviewButtons,
  setPreviewFloor,
  rebuildFloorLayers,
  buildFloorsAsync,
  syncFloorGroups,
  createFloorWorldMapper,
  buildFloorAtIndex,
  buildLayerForFloor,
} from './floor-build'
export { syncGlobalControls } from './global-controls'
export {
  disposeObjectTree,
  disposeFloorScene,
  createOutlinePath,
  buildShapesWithHoles,
  createWallSideMaterial,
  createWallTopMaterial,
  expandPolygonOutward,
  buildInteriorScene,
  buildItemModel,
  drawDoor,
  drawCourtyardArea,
  addArchitectureMesh,
  addWindowFrames,
  buildRugGeometry,
  createRugMaterial,
  addRugMeshes,
  mergeMeshesByType,
  configureLightSourcePreview,
} from './mesh-builders'
export {
  previewTransformContext,
  capturePreviewTransforms,
  applyPreviewTransforms,
  buildSceneLayers,
  buildLayerGroup,
  buildArchitectureLayer,
  buildItemsLayer,
  buildLightsLayer,
} from './scene-layers'
export {
  sceneCacheDescriptor,
  checkModelInUse,
  collectScenePayload,
  collectSelectedFloors,
  scheduleModelLoadFlush,
  loadModelsForTypes,
  preloadDefaultModels,
  requestSceneRender,
  finishModelLoad,
  publishModelLoadState,
  emitRuntimeDiagnostic,
  updateModelLoadIndicator,
  materialLoadOptionsForItem,
  applyItemOptimization,
  getActiveFloor,
  captureStudioSnapshot,
  getLocalSaveRevision,
} from './scene-payload-build'
export { completeSceneReadyWarmup } from './scene-ready-warmup'
export {
  requestSceneRebuild,
  getSceneContentBounds,
  computeCourtyardBounds,
  createFloorMaterial,
} from './scene-rebuild'
export { waitForSceneRevision, waitForSceneReady } from './scene-wait'
export {
  countMaterialTextures,
  findMaxMaterialTextures,
  getMaxTextureUnits,
  batchSharedMeshes,
  mergeStaticItemMeshes,
  collectSharedMaterials,
  updateExternalModelDataset,
} from './shared-meshes'
export { postBridgeState, postBridgeFloors } from './stage-bridge'
