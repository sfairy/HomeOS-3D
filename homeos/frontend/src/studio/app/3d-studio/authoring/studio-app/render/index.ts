/**
 * `render` 域的对外出口：本目录各文件的导出在此汇总。
 *
 * 存在意义：`boot.ts` 是转发层，需要本域的全部实现函数；逐文件 import 会把它
 * 的导入段撑到几百行（拆分子域后一度涨到 126 个 import 块）。按域导入让
 * 「这个域提供什么」在调用点一眼可见，同时把导入行数压回可控范围。
 * 域内文件之间仍直接相对 import，不经 barrel（避免环与无谓的间接层）。
 */
export { acquireRenderSurface } from './acquireRenderSurface'
export type { AcquireRenderSurfaceDeps } from './acquireRenderSurface'
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
} from './camera-frames'
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
export { createStudioRenderer } from './createStudioRenderer'
export type { CreateStudioRendererDeps } from './createStudioRenderer'
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
} from './frame-driver'
export { fadeLightsIn, fadeLightsOut } from './lights-fade'
export {
  beginMotionMeasurement,
  endMotionMeasurement,
  updateMotionStats,
  needsMotionPresentation,
} from './motion-measurement'
export { handleOrbitStart, handleOrbitChange, handleOrbitEnd, createOrbitControls } from './orbit-controls'
export { publishRenderStats } from './publishRenderStats'
export type { PublishRenderStatsDeps } from './publishRenderStats'
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
} from './render-budget'
export {
  configureCappedGroundReflection,
  createMotionIdleQualityApplier,
  createSceneTextureAnisotropySync,
  createShadowCasterMuter,
  bindNamedPageHideOnce,
} from './render-loop-idle-quality'
export type { PageHideBinding } from './render-loop-idle-quality'
export { applyOrbitControlSettingsTo, syncViewOffsetFor, createRenderLoopTeardown } from './render-loop-lifecycle'
export { attachReflectionProbeMesh } from './render-loop-reflection-probe'
export {
  refreshFloorControls,
  resizeStudioRenderer,
  stateViewportAspectGetCanvasSize,
  refreshCanvasSizeUi,
  resolvePixelRatio,
  resizeRenderCanvas,
  syncCanvasSizeInputs,
  handleCanvasSizeInput,
} from './renderer-resize'
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
} from './stats'
export { runStudioRenderLoop } from './studio-render-loop'
export type { StudioRenderDeps } from './studio-render-loop'
export { releaseStudioRenderer, clearStudioDocumentResidue } from './studio-render-release'
export { scheduleShaderWarmup } from './studio-shader-compile-warmup'
