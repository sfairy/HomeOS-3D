/**
 * `render` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
export { acquireRenderSurface } from './renderer'
export type { AcquireRenderSurfaceDeps } from './renderer'
export {
  captureCameraView,
  storeFixedCameraView,
  updateCameraPlanes,
  computeVisibleHeight,
  adjustFrameSize,
  computeFrameSize,
  computeOrthoFrameSize,
  resolveFrameSize,
  saveCameraView,
  applyCameraSnapshot,
  setCameraView,
  setCameraMode,
  applyOrthoFrame,
  captureOverviewCamera,
  applyCameraState,
} from './camera'
export {
  cameraSettings,
  getCameraMode,
  getCameraView,
  getCameraTopRotation,
  buildCameraUpVector,
  getCameraFocalLength,
  syncCameraModeControls,
  syncCameraViewControls,
  syncCameraFocalLengthControl,
  applyCameraFocalLength,
} from './camera'
export { createStudioRenderer } from './renderer'
export type { CreateStudioRendererDeps } from './renderer'
export {
  renderStudioFrame,
  bindFrameDriver,
  setFadeOverlay,
  hasPendingSceneWork,
  canBuildScene,
  drawToActiveSurface,
  awaitNextFramePair,
  captureFramePixels,
  rerenderScene,
  ensureRenderReady,
  waitForIdleFrame,
  scheduleStudioRender,
  discardLightingEdit,
  resetPlanInteraction,
  endStudioGesture,
  isEffectCacheReady,
} from './render-loop'
export { fadeLightsIn, fadeLightsOut } from './render-loop'
export {
  beginMotionMeasurement,
  endMotionMeasurement,
  updateMotionStats,
  needsMotionPresentation,
} from './motion-measurement'
export { handleOrbitStart, handleOrbitChange, handleOrbitEnd, createOrbitControls } from './camera'
export { publishRenderStats } from './render-loop'
export type { PublishRenderStatsDeps } from './render-loop'
export {
  assessRenderBudget,
  canRenderScene,
  applyAdaptiveQuality,
  resetFrameSamples,
  recordFrameTime,
  getPreviewSyncMode,
  refreshPreviewSync,
  requestStudioRender,
  computeRenderPixelRatio,
} from './render-metrics'
export {
  configureCappedGroundReflection,
  createMotionIdleQualityApplier,
  createSceneTextureAnisotropySync,
  createShadowCasterMuter,
  bindNamedPageHideOnce,
} from './render-loop'
export type { PageHideBinding } from './render-loop'
export { applyOrbitControlSettingsTo, syncViewOffsetFor, createRenderLoopTeardown } from './render-loop'
export { attachReflectionProbeMesh } from './render-loop'
export {
  refreshFloorControls,
  resizeStudioRenderer,
  stateViewportAspectGetCanvasSize,
  refreshCanvasSizeUi,
  resolvePixelRatio,
  resizeRenderCanvas,
  syncCanvasSizeInputs,
  handleCanvasSizeInput,
} from './renderer'
export { refreshSceneRender, disposeShadowAtlas, prepareShadowAtlas } from './scene-refresh'
export {
  updateRenderStatsHud,
  pushBoundedSample,
  computeAverage,
  computePercentile,
  roundToDigits,
  ensureDiagnosticsHud,
  flushGpuQueries,
  measureFloorSwitchPhase,
  recordFloorSwitchTick,
  recordRenderTiming,
  snapshotRenderStats,
} from './render-metrics'
export { runStudioRenderLoop } from './render-loop'
export type { StudioRenderDeps } from './render-loop'
export { releaseStudioRenderer, releaseStudioOwnedResources, clearStudioDocumentResidue } from './renderer'
export { scheduleShaderWarmup } from './studio-shader-compile-warmup'
