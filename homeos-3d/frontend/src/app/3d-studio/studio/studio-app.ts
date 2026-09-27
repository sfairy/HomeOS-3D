/**
 * 3D 户型工作室主脚本，全工作室唯一的编排层：平面绘制、three.js 三维呈现、
 */
import {
  normalizeCurtainTrack,
  curtainFootprintDepth,
  createCurtainTrack,
  curtainPanelRanges,
  addRollerCurtain,
  addTrackCurtain
} from "../loaders/studio-curtain-track.js";
import { drawTelevisionPoster } from "../materials/studio-television-poster.js";
import { apiAuthChallenge, apiRequestError } from "../../utils/api-request.js";
import { capturePointer, releasePointer } from "../../utils/pointer-capture.js";
// 浮动菜单的统一定位（按实测尺寸夹进视口 / 翻转），与编辑器共用一份。
import {
  moveFloatingPanelIntoBounds,
  positionPointMenu
} from "../../shared/menu-positioning.js";
import { paletteColor } from "../../utils/colors.js";
import { roundToDecimals } from "../../utils/numbers.js";
// 未绑定窗帘的默认开合度：与运行时的未绑定兜底同值，只定义在 utils/cover-features.js 一处。
import { COVER_DEFAULT_PREVIEW_POSITION } from "../../utils/cover-features.js";
import { yieldToIdle, yieldToScheduler } from "./studio-yield.js";
import {
  APPLIANCE_ITEM_TYPES,
  APPLIANCE_MODEL_ITEM_TYPES,
  BATCH_OPTIMIZED_ITEM_TYPES,
  EXTERNAL_MODEL_ITEM_TYPES,
  HOME_ITEM_TYPES,
  JOINERY_ITEM_TYPES,
  LIGHT_ITEM_TYPES,
  ROUND_FOOTPRINT_ITEM_TYPES,
  ROUND_TABLE_TURNTABLE_ITEM_TYPES,
  SQUARE_EDGE_ITEM_TYPES,
  STAIR_DIRECTION_ITEM_TYPES,
  STAIR_ITEM_TYPES,
  isRoundTableTurntableItem
} from "./studio-item-types.js";
// 物件模型的构建分派：谓词 + 62 个构建体都在 item-builders/ 下，
import { buildItemBody, finishItemModel } from "./item-builders/registry.js";
import {
  FEATURE_WALL_STYLE_MATERIAL,
  normalizeMuralArtStyle,
  normalizeFeatureWallStyle,
  createMuralArtTexture,
  createFeatureWallTexture,
  createStoneSlabTexture
} from "../materials/studio-surface-textures.js";
import {
  createMaterialSurfaceTexture,
  hasMaterialSurfaceTexture
} from "../materials/studio-surface-fabrics.js";
import { createOverviewStack } from "./studio-overview-stack.js";
import { windowGeometryParts } from "../plan/studio-window-geometry.js";
import {
  MAX_CAMERA_POLAR_ANGLE,
  constrainCameraPosition,
  constrainCameraPose
} from "./studio-camera-constraints.js";
import { addSecurityModel } from "../loaders/studio-security-models.js";
import { createFloorTransition } from "./studio-floor-transition.js";
import { floorOpeningPolygon } from "../plan/studio-floor-openings.js";
import { createGroundReflections } from "../reflection/studio-ground-reflections.js";
import { createMotionPresentation } from "./studio-motion-presentation.js";
import { renderStudioAssetPalette } from "./studio-asset-palette.js";
import {
  createWallSideMaterial,
  setWallGradientHeight,
  setWallCornerDistances
} from "../materials/studio-wall-materials.js";
import {
  WARM_HOME_STYLE,
  WARM_WOOD_STYLE,
  applyItemFinish,
  decorateWarmFloor
} from "./studio-scene-style.js";
// 逐物件「材质风格」属性：色卡覆盖 + 质感族。解析顺序是「基础色卡 → applyItemFinish → 这一层」，
import {
  MATERIAL_STYLE_AUTO,
  MATERIAL_STYLE_ITEM_TYPES,
  isMaterialStyleCapable,
  materialStyleOptionsFor,
  materialStyleAutoLabel,
  normalizeMaterialStyle,
  applyMaterialStyle
} from "./studio-material-styles.js";
import {
  DOOR_MATERIAL_AUTO,
  doorMaterialAutoLabel,
  doorMaterialOptionsFor,
  findDoorMaterial,
  normalizeDoorMaterial
} from "./studio-door-materials.js";
import { createWarmTelevisionGlass } from "../materials/studio-television-glass.js";
import {
  RENDER_CACHE_VERSION,
  createRenderCache,
  cacheSceneDescriptor,
  sha256,
  stableCacheJSON
} from "../../bridge/render-cache.js";
import { transformSceneCamera } from "../../bridge/scene-frame.js";
import { sceneUpdatePlan } from "../../bridge/scene-update.js";
import { createDemandFrameLoop } from "../../bridge/frame-loop.js";
import { cacheObjectTransforms } from "../../bridge/scene-matrices.js";
import { withRequestTimeout } from "../../utils/request-timeout.js";
import { SCENE_REQUEST_TIMEOUT_MS } from "../../utils/api-fetch.js";
import { debugLog } from "../../utils/debug-log.js";
// 首屏分段埋点（`[3D-load]`）：开关与出口都在 utils/debug-log.js，本文件只负责在链上打点。
import { createLoadTiming } from "../../bridge/load-timing.js";
// 舞台页的提前起跑（舞台页里非 null）：它已经替我们读过场景持久缓存、发过场景接口请求、
import { stageStartup } from "../stage-startup.js";
// 场景持久缓存：把「归一后的场景文档」跨会话存起来，舞台页二次打开时跳过整段逐层归一。
import { prepareSceneDocument } from "../scene-persistent-cache.js";
// 接口请求的超时预算由 utils/api-fetch.js 统一持有（requestStudioApi 是唯一出入口）。
import { apiFetch } from "../../utils/api-fetch.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import { OrbitControls } from "/static/vendor/three/0.186.0/OrbitControls.js";
import { RoundedBoxGeometry } from "/static/vendor/three/0.186.0/RoundedBoxGeometry.js";
import { mergeGeometries } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";
import { GLTFLoader } from "/static/vendor/three/0.186.0/GLTFLoader.js";
import { SameOriginDRACOLoader } from "../export/draco-loader.js";
import {
  createLightTransition,
  sampleLightTransition,
  lightTransitionDurationMs,
  mapLightEffectState,
  lightEffectColorHex
} from "../../bridge/light-motion.js";
import {
  adaptiveDeviceLightBudget,
  adaptiveLightRenderCost,
  assessAdaptiveRenderFrames,
  axisLockedPoint,
  canonicalPolygonKey,
  clamp,
  clampWindowT,
  closedWallFloorPolygons,
  closedWallPolygons,
  distance,
  doorLeafRotation,
  itemRotationFromPointers,
  localSpotShadowSettings,
  mergeCollinearWallSegments,
  modelBounds,
  nearestWall,
  pointInRotatedRectangle,
  pointInPolygon,
  planLabelProjectionMetrics,
  polygonArea,
  projectPointToSegment,
  resizeRotatedItemFromCorner,
  remapWallAttachment,
  selectShadowCastingLightIds,
  segmentIntersection,
  slidingDoorPanelCenters,
  spotShadowTextureUnitLimit,
  spotLightBrightnessResponse,
  splitWallSegments,
  snapPoint,
  uncoveredCollinearWallSegments,
  unclosedWallEndpoints,
  subtractPolygonLoops,
  validatedUnionPolygonLoops,
  wallLengthMeters,
  wallIntersections,
  wallJoinExtensions,
  wallSolidPieces
} from "../plan/geometry.js";
import {
  buildLightDeltaPixels,
  buildStoredZip,
  EXPORT_IMAGE_EXTENSION,
  EXPORT_IMAGE_MIME_TYPE,
  EXPORT_IMAGE_QUALITY,
  EXPORT_RENDER_SCALE,
  scaledExportResolution
} from "../export/export-utils.js";
// 布局层（折叠 / 拖拽调宽 / 状态记忆）与折叠快捷键都在 shared/ 下，与 /index 编辑器共用同一份
import {
  createLayoutController,
  bindLayoutControls
} from "../../shared/layout-shell.js";
import { bindLayoutShortcuts } from "../../shared/layout-shortcuts.js";
import {
  MAX_EXPORT_PRESET_COUNT,
  exportPresetIsEmpty,
  exportPresetSummary,
  normalizeActiveExportPresetSlot,
  normalizeExportPreset,
  normalizeExportPresetSlots
} from "../export/export-presets.js";
import { reorderFloors } from "../plan/floor-order.js";
import { syncControlValue } from "./ui-controls.js";
import {
  initializeNumberInputs,
  initializeStudioSelects,
  syncStudioSelect
} from "./studio-widgets.js";
import {
  createExternalModelManager,
  ALL_ITEM_MODELS
} from "../loaders/studio-external-models.js";
import {
  createPlanDrawingTools,
  drawTrackedText
} from "../plan/studio-plan-drawing.js";
import { createSpotShadowAtlasController } from "./studio-shadow-atlas.js";
import { createRegionLightController, REGION_LIGHT_LAYER } from "../plan/studio-plan2-region-lights.js";
import { createContactShadowController } from "../plan/studio-plan2-contact-shadows.js";
import {
  DEFAULT_BASE_LIGHTING,
  finite,
  itemMinimumHeight,
  itemMinimumFootprint,
  kelvinToRgbHex,
  normalizeCameraSettings,
  normalizeBaseLighting,
  normalizeFixedCameraView,
  normalizeFullRotation,
  normalizeLabelText,
  normalizePoint
} from "../loaders/studio-normalization.js";
import {
  DEFAULT_EXPORT_HEIGHT,
  DEFAULT_EXPORT_WIDTH,
  DEFAULT_LIGHT_SETTINGS,
  DOOR_TYPE_DIMENSIONS,
  ITEM_TYPE_DEFINITIONS,
  LIGHT_FIELD_CONFIG,
  LIGHT_TYPE_BRIGHTNESS_SCALE,
  LIGHT_TYPE_MAX_ANGLE_DEG,
  MOBILE_TV_MOUNT_DIMENSIONS,
  ROUND_PLAN_RING_RATIOS_BY_TYPE,
  SELF_LIT_ITEM_TYPES,
  STUDIO_PALETTE,
  TELEVISION_MOUNT_DEPTHS,
  TELEVISION_MOUNT_ELEVATIONS,
  TELEVISION_PLAN_MIN_DEPTH,
  TOOL_HELP_TEXT,
  TV_MOUNT_STYLES
} from "./studio-config-tables.js";
import {
  BATCH_MERGE_ITEM_TYPES,
  INSTANCE_MERGE_ITEM_TYPES,
  addBoxMesh,
  addCylinderMesh,
  bakeMergedItemMeshes,
  buildMergedWallGeometry,
  buildRugGeometry,
  collectMeshDescendants,
  collectMeshDescriptors,
  computeGeometrySignature,
  computeMaterialKey,
  computeMaterialSignature,
  disposeSceneSubtree,
  mergedWallBandGeometryCache,
  normalizePartSpec,
  resolveRugMaterial,
  rugGeometryBySizeKey,
  rugMaterialByColorKey,
  shareGeometryAndMaterials
} from "./studio-mesh-geometry.js";
import {
  ITEM_AXES,
  appendPillarOutlineArc,
  applyItemOrientation,
  applyItemPosture,
  buildPillarOutline,
  buildPolygonShapes,
  buildWallFootprint,
  createId,
  itemAxisSet,
  itemFromPlanFootprintResize,
  itemPlanFootprint,
  normalizePillarAxis,
  normalizeStripAxis,
  offsetPolygonOutward,
  pillarIsLying,
  pointInBounds,
  polygonLoopToPath,
  scenePointToFloorPoint,
  segmentIntersectsBounds,
  splitWallsWithOpenings,
  stripIsStanding,
  tracePillarPlanPath
} from "./studio-plan-geometry.js";
import {
  LIGHT_PRECOMPILE_TIMEOUT_MS,
  addChairModel,
  addVehicleChargingEffect,
  buildCurtainGeometry,
  computeTelevisionBodyMetrics,
  countMaterialTextures,
  measureTelevisionBodyFrontZ,
  waitForShaderCompilation
} from "./studio-mesh-variants.js";
import {
  FLOOR_SCENE_SCHEMA_VERSION,
  createEmptyScene
} from "./studio-scene-defaults.js";
import { state } from "./studio-state.js";
import {
  CURTAIN_PREVIEW_DEFAULT_SCHEMA_VERSION,
  PILLAR_SHAPES,
  applyDoorMaterialStyle,
  captureLegacyLayoutSeed,
  materialStyleSnapshotFields,
  maxLightAngleForType,
  migrateLegacyCurtainPreview,
  normalizePillarShape,
  normalizeScene,
  pillarShapeSet
} from "./studio-scene-normalize.js";
import {
  PREVIEW_OBJECT_LAYER,
  WALL_RUNTIME_PROFILE,
  addFloorContactShadow,
  addPlanBandMesh,
  addWallBandMesh,
  addWallExtrusion,
  addWindowFrameMeshes,
  buildArchitectureLayer,
  createInvisibleWallMaterial,
  createWallTopMaterial,
  doorMaterialRecipeColor,
  doorMaterialRecipeOptions,
  isRegionLightingEnabled,
  isSelected,
  isStageViewerMode,
  isWallShaderTrialEnabled,
  makeWallSideMaterial,
  materialByRenderKey,
  resolveSharedWallMaterial,
  studioMaxTextureAnisotropy,
  studioPalette,
  wallDerivedCacheByScene,
  wallDerivedData,
  wallJoinExtensionsForWalls
} from "./studio-architecture.js";
import {
  PLAN_ACCENT,
  PLAN_ACCENT_BRIGHT,
  PLAN_HANDLE,
  PLAN_LABEL,
  STUDIO_ACCENT_BRIGHT_FALLBACK,
  STUDIO_ACCENT_FALLBACK,
  STUDIO_HANDLE_FALLBACK,
  STUDIO_LABEL_FALLBACK,
  collectActiveLights,
  collectPreviewLights,
  currentPixelsPerMeter,
  currentPreviewFloorMode,
  drawPlanItem,
  floorGroupKey,
  floorItemKey,
  getCurrentFloor,
  isAdaptiveLightCacheEnabled,
  isLightEnabled,
  lightCacheCanvasElement,
  lightGroupForItem,
  lightGroupForItemInScene,
  lightGroupScopeKey,
  measureLightRenderCost,
  planCanvasElement,
  planContext,
  planToScreen,
  selectElement,
  setLightCacheVisible,
  updateAdaptiveRenderState
} from "./studio-plan-render.js";
import {
  computeFloorBounds,
  computeOverviewCenter,
  floorPointToScenePoint,
  floorWorldMatrix,
  worldPointForFloor
} from "./studio-overview-center.js";
import {
  FALLBACK_MAX_TEXTURE_SIZE,
  ITEM_BUILDER_DEPS,
  MAX_PRECOMPILE_PLAN_COUNT,
  MAX_SPOT_SHADOW_TEXTURE_UNITS,
  MIN_SHADOW_CAMERA_MARGIN,
  RECT_AREA_LIGHT_TEXTURE_UNITS,
  RESERVED_TEXTURE_UNITS,
  activeLightItemKeys,
  addExternalItemModel,
  addFloorEdgeOutline,
  addFloorGrid,
  addFloorGroundShadow,
  addLightFixtureToScene,
  addMissingLightModels,
  addRugMeshes,
  addStripLightPreview,
  addTelevisionScreenMeshes,
  applyBaseLighting,
  applyLightVisibility,
  applyRenderQualityMode,
  applySceneRefresh,
  applyShadowBudget,
  batchRepeatedItemMeshes,
  buildFeatureWallItemMeshGroup,
  buildItemModel,
  buildLightCache,
  buildLightPrecompilePlan,
  buildMuralItemMeshGroup,
  buildPillarItemMeshGroup,
  buildPillarSolidGeometry,
  buildPlanLabelMesh,
  cameraSettingsSource,
  clearPreviewModel,
  collectExternalModelSignatures,
  collectLightsByItemKey,
  collectShadowCastingLightIds,
  collectSpotShadowCandidates,
  compositeLightCache,
  computeFloorPlanContext,
  computeSceneBoundingBox,
  createStyledPillarMaterial,
  createTelevisionPosterTexture,
  currentCameraView,
  deferModelTypeForLater,
  drawRenderShield,
  ensureLightModels,
  externalModelManager,
  fitDirectionalShadowCamera,
  floorPolygonsForWalls,
  getMarbleTableTopTexture,
  getStoneSlabTexture,
  gltfLoader,
  hasPendingRenderWork,
  hideRenderShield,
  highlightSelectedModel,
  homePalette,
  invalidateRender,
  isAutoDiagramEmbed,
  isCameraGestureActive,
  isItemTypeInUse,
  isLightPrecompilePending,
  isLivePreviewEnabled,
  isObjectInExcludedLayer,
  lightConfigurationSignature,
  loadExternalItemModel,
  markAsLightSourcePreview,
  maxTexturesPerMesh,
  mergeStaticItemMeshes,
  modelLoadingStatusElement,
  modelTypeForItem,
  nextPaint,
  paletteForItemType,
  pendingSceneUpdateScopes,
  positionLightFromAngles,
  precompiledLightSignatures,
  precompiledModelSignatures,
  previewQualityStatusElement,
  previewRenderShieldElement,
  previewSyncButtons,
  publishExternalMaterialStats,
  queryMaxTextureUnits,
  readCanvasPixels,
  rebuildArchitectureRoot,
  rebuildLightModelsPreservingCache,
  rebuildModelLayer,
  rebuildPreviewScene,
  refreshItemsLayer,
  refreshLightsLayer,
  refreshPreviewButton,
  refreshPreviewScene,
  refreshSceneScopes,
  releaseDeferredModels,
  removeModelLayer,
  renderCache,
  renderPreviewFrames,
  requestRenderFrame,
  resolveShadowMapSize,
  sceneCacheDescriptor,
  scheduleCacheWrite,
  scheduleDeferredModelLoad,
  scheduleLightCacheBuild,
  scheduleLightPrecompile,
  scheduleModelPrecompile,
  schedulePreviewRebuild,
  setLightModelVisibility,
  settleStageLightCache,
  stoneSlabTextureByFlavor,
  syncPreviewControls,
  updateModelLoadingStatus
} from "./studio-render-pipeline.js";
import {
  assessFrameRateForAdaptive,
  enableAdaptiveRender,
  exportDimensions,
  exportHeightInput,
  exportPixelRatio,
  exportPreviewStageElement,
  exportWidthInput,
  targetPixelRatio,
  updateRenderPixelRatio
} from "./studio-render-quality.js";
import { createLightTransitionController } from "./studio-light-transition.js";
import { createFloorEffectsController } from "./studio-floor-effects.js";
import { createFloorCacheController } from "./studio-floor-cache.js";
import { createStageBackgroundController } from "./studio-stage-background.js";
import {
  cloneStudioDocument,
  createFloor,
  documentBindingIdentities,
  floorNameForIndex,
  handleSaveConflict,
  handleSaveInteractionConfirmation,
  markDocumentDirty,
  normalizeStudioDocument,
  openSaveConflictDialog,
  openSaveInteractionDialog,
  putStudioScene,
  renderSaveInteractionDialog,
  requestInteractionConfirmationIfNeeded,
  requestStudioApi,
  resolveSaveInteraction,
  saveConflictDialogElement,
  saveConflictReopenButton,
  saveInteractionDialogElement,
  saveInteractionImpactsElement,
  saveInteractionMessageElement,
  saveInteractionProjectsElement,
  saveInteractionReopenButton,
  saveInteractionSummaryElement,
  saveStateElement,
  saveStudioDraft,
  sceneRemovedBindingTargets,
  setSaveConflictPendingUi,
  setSaveInteractionPendingUi,
  setSaveState,
  showToast,
  snapshotDocumentForSave,
  toastElement,
  updateOnboardingSteps
} from "./studio-document-save.js";
import {
  CAMERA_NEAR_DISTANCE_RATIO,
  MAX_CAMERA_NEAR,
  MIN_CAMERA_NEAR,
  applyFocalLength,
  buildExportPreset,
  cameraFocalLengthInputs,
  collectCheckedExportFileKeys,
  createOrbitControls,
  currentFocalLength,
  currentTopRotationDeg,
  exportDialogElement,
  exportFolderNameInput,
  exportLockRatioInput,
  exportPresetAddButton,
  exportPresetDeleteButton,
  exportPresetEmptyStateElement,
  exportPresetEmptyTitleElement,
  exportPresetLabel,
  exportPresetRenameButton,
  exportPresetSlotsElement,
  finishCameraMotion,
  handleCameraMotionMoved,
  measureVisibleHeight,
  renderExportPresetSlots,
  saveActiveExportPreset,
  scheduleExportPresetSave,
  startCameraMotion,
  updateCameraClipPlanes
} from "./studio-camera-presets.js";
import { createStageRuntimeController } from "./studio-stage-runtime.js";
/**
 * 首屏分段埋点（`?debug=1` 或 `?performance-diagnostics=1` 时才输出）。
 */
const loadTiming = createLoadTiming("studio");
// 模块求值本身也是一个可观测的节点：它与进口的下载 / 解析是一体的，出现异常长间隔说明模块树变重了。
loadTiming("module-evaluated");

/**
 * 平面画布（2D planContext）取色。
 */
// 画布上取不到令牌时的兜底色。四枚各自对应自己的色相 ——
const STUDIO_AURA_FALLBACK = "#c9a0ff";
const STUDIO_ECO_FALLBACK = "#5fd0a8";
/** 吸附点 / 量测读数 / 窗默认描边。 */
const PLAN_GUIDE = () => paletteColor("--guide", STUDIO_AURA_FALLBACK);
/** 闭合空间有效。 */
const PLAN_DONE = () => paletteColor("--done", STUDIO_ECO_FALLBACK);

const STUDIO_PAPER_FALLBACK = "#0b0f12";
/** 户型画布的「纸」底色（导出与截图时先把整张画布铺满它）。原来是 #0d1319。 */
const PLAN_PAPER = () => paletteColor("--hos-tool-bg", STUDIO_PAPER_FALLBACK);

// 材质风格（default / warm-wood）与墙体透明度覆盖：两者都由舞台侧通过
window.addEventListener("pagehide", () => renderCache?.close(), {
  once: true
});
const autoDiagramComponentId =
  new URLSearchParams(window.location.search).get("auto-diagram-component") || "";
const exportFolderName = new URLSearchParams(window.location.search).get("export-folder") || "";
const floorSelectionParam = new URLSearchParams(window.location.search).has("floor-selection")
  ? new URLSearchParams(window.location.search).get("floor-selection")
  : null;
if (isAutoDiagramEmbed) {
  document.body.classList.add("auto-diagram-embedded");
}
const planStageElement = selectElement("#plan-stage");
const canvasEmptyElement = selectElement("#canvas-empty");
const projectNameElement = selectElement("#project-name");
const importPlanButton = selectElement("#import-plan");
const planFileInput = selectElement("#plan-file");
const toggleBackgroundButton = selectElement("#toggle-background");
const removePlanButton = selectElement("#remove-plan");
const addFloorButton = selectElement("#add-floor");
const floorListElement = selectElement("#floor-list");
const alignFloorButton = selectElement("#align-floor");
const floorContextMenuElement = selectElement("#floor-context-menu");
const floorRenameDialogElement = selectElement("#floor-rename-dialog");
const floorRenameFormElement = selectElement("#floor-rename-form");
const floorRenameInputElement = selectElement("#floor-rename-input");
const floorDeleteDialogElement = selectElement("#floor-delete-dialog");
const floorDeleteFormElement = selectElement("#floor-delete-form");
const floorDeleteNameElement = selectElement("#floor-delete-name");
const saveConflictLoadButton = selectElement("#save-conflict-load");
const saveConflictOverwriteButton = selectElement("#save-conflict-overwrite");
const saveConflictLaterButton = selectElement("#save-conflict-later");
const saveInteractionConfirmButton = selectElement("#save-interaction-confirm");
const saveInteractionKeepButton = selectElement("#save-interaction-keep");
const globalWallHeightInput = selectElement("#global-wall-height");
const globalWallThicknessInput = selectElement("#global-wall-thickness");
const globalWallOpacityInput = selectElement("#global-wall-opacity");
const toggleFloorEdgeButton = selectElement("#toggle-floor-edge");
const toolButtons = [...document.querySelectorAll("[data-tool]")];
const finishWallButton = selectElement("#finish-wall");
const deleteSelectionButton = selectElement("#delete-selection");
const activeToolLabelElement = selectElement("#active-tool-label");
const toolHelpElement = selectElement("#tool-help");
const cursorPositionElement = selectElement("#cursor-position");
const snapIndicatorElement = selectElement("#snap-indicator");
const snapToggleButton = selectElement("#snap-toggle");
const snapToggleStateElement = selectElement("#snap-toggle-state");
const snapSettingsToggleButton = selectElement("#snap-settings-toggle");
const snapSettingsPanelElement = selectElement("#snap-settings-panel");
const snapSettingInputs = [...document.querySelectorAll("[data-snap-setting]")];
const snapToleranceInput = selectElement("#snap-tolerance");
const snapToleranceValueElement = selectElement("#snap-tolerance-value");
const zoomValueElement = selectElement("#zoom-value");
const scaleDialogElement = selectElement("#scale-dialog");
const scaleFormElement = selectElement("#scale-form");
const referencePixelsElement = selectElement("#reference-pixels");
const referenceMetersInput = selectElement("#reference-meters");
const lightGroupRenameDialogElement = selectElement("#light-group-rename-dialog");
const lightGroupRenameFormElement = selectElement("#light-group-rename-form");
const lightGroupRenameInputElement = selectElement("#light-group-rename-input");
const lightPropertyApplyDialogElement = selectElement("#light-property-apply-dialog");
const lightPropertyApplyFormElement = selectElement("#light-property-apply-form");
const lightPropertyTargetListElement = selectElement("#light-property-target-list");
const lightPropertySelectionCountElement = selectElement("#light-property-selection-count");
const lightPropertyToggleAllButton = selectElement("#light-property-toggle-all");
const lightPropertyApplyTitleElement = selectElement("#light-property-apply-title");
const lightPropertyApplyValueInput = selectElement("#light-property-apply-value");
const lightPropertyApplyButtons = [...document.querySelectorAll("[data-apply-light-property]")];
const inspectorEmptyElement = selectElement("#inspector-empty");
const selectionInspectorElement = selectElement("#selection-inspector");
const selectionHeadingElement = selectElement(".selection-heading");
const selectionIdElement = selectElement("#selection-id");
const lightPreviewNoteElement = selectElement("#light-preview-note");
const wallFieldsElement = selectElement("#wall-fields");
const windowFieldsElement = selectElement("#window-fields");
const doorFieldsElement = selectElement("#door-fields");
const railingFieldsElement = selectElement("#railing-fields");
const itemFieldsElement = selectElement("#item-fields");
const labelTextFieldsElement = selectElement("#label-text-fields");
const lightFieldsElement = selectElement("#light-fields");
const itemHeightFieldElement = selectElement("#item-height-field");
const itemElevationFieldElement = selectElement("#item-elevation-field");
const itemRotationFieldElement = selectElement("#item-rotation-field");
const itemRotationActionsElement = selectElement("#item-rotation-actions");
const itemVerticalRotationFieldElement = selectElement("#item-vertical-rotation-field");
const itemVerticalRotationLabelElement = selectElement("#item-vertical-rotation-label");
const itemStripOrientationHeadingElement = selectElement("#item-strip-orientation-heading");
const itemStripRollFieldElement = selectElement("#item-strip-roll-field");
const itemStripRollInput = selectElement("#item-strip-roll");
const itemLightSourceVisibilityFieldElement = selectElement("#item-light-source-visibility-field");
const itemLightSourceVisibleInput = selectElement("#item-light-source-visible");
const curtainPositionFieldElement = selectElement("#curtain-position-field");
const roundTableTurntableFieldElement = selectElement("#round-table-turntable-field");
const stairDirectionFieldElement = selectElement("#stair-direction-field");
const tvMountStyleFieldElement = selectElement("#tv-mount-style-field");
const muralStyleFieldElement = selectElement("#mural-style-field");
const featureWallStyleFieldElement = selectElement("#feature-wall-style-field");
const materialStyleFieldElement = selectElement("#material-style-field");
const fridgeStyleFieldElement = selectElement("#fridge-style-fields");
const fridgeStyleRadioInputs = [...document.querySelectorAll('input[name="fridge-style"]')];
const pillarShapeFieldElement = selectElement("#pillar-shape-field");
const stripAxisFieldElement = selectElement("#strip-axis-field");
const pillarAxisFieldElement = selectElement("#pillar-axis-field");
const shoeCabinetActionsElement = selectElement("#shoe-cabinet-actions");
const shoeCabinetMirrorInput = selectElement("#shoe-cabinet-mirror");
const itemWidthLabelElement = selectElement("#item-width-label");
const itemDepthLabelElement = selectElement("#item-depth-label");
const itemHeightLabelElement = selectElement("#item-height-label");
const sceneCountsElement = selectElement("#scene-counts");
const previewFloorButtons = [...document.querySelectorAll("[data-preview-floor]")];
const cameraViewButtons = [...document.querySelectorAll("[data-camera-view]")];
const cameraRotateTopButtons = [...document.querySelectorAll("[data-camera-rotate-top]")];
const cameraModeButtons = [...document.querySelectorAll("[data-camera-mode]")];
const baseLightControlInputs: any[] = [...document.querySelectorAll("[data-base-light-control]")];
const baseLightControlsElement = selectElement("#base-light-controls");
const baseLightControlsHeaderElement = baseLightControlsElement?.querySelector(
  ".base-light-controls-header"
);
const resetBaseLightingButton = selectElement("#reset-base-lighting");
const saveBaseLightingButton = selectElement("#save-base-lighting");
const closeBaseLightingButton = selectElement("#close-base-lighting");
const openBaseLightingButtons = [
  selectElement("#open-base-lighting"),
  selectElement("#export-open-base-lighting")
].filter(Boolean);
if (baseLightControlsElement && baseLightControlsElement.parentElement !== document.body) {
  document.body.append(baseLightControlsElement);
}
const saveCameraViewButton = selectElement("#save-camera-view");
const fixedCameraViewInput = selectElement("#fixed-camera-view");
const floorCameraActionsElement = selectElement("#floor-camera-actions");
const overviewCameraActionsElement = selectElement("#overview-camera-actions");
const saveOverviewViewButton = selectElement("#save-overview-view");
const fixedOverviewViewInput = selectElement("#fixed-overview-view");
const previewFloorGapControlElement = selectElement("#preview-floor-gap-control");
const previewFloorGapInput = selectElement("#preview-floor-gap");
const previewFloorUniformControlElement = selectElement("#preview-floor-uniform-control");
const previewFloorUniformInput = selectElement("#preview-floor-uniform");
const exportPreviewFrameElement = selectElement("#export-preview-frame");
const exportAspectLabelElement = selectElement("#export-aspect-label");
const exportResolutionLabelElement = selectElement("#export-resolution-label");
const exportStatusElement = selectElement("#export-status");
const exportPackageButton = selectElement("#export-package");
const exportSaveViewButton = selectElement("#export-save-view");
const exportGroupFilesInput = selectElement("#export-group-files");
const exportFloorSelectElement = selectElement("#export-floor-select");
const exportFloorGapControlElement = selectElement("#export-floor-gap-control");
const exportFloorGapInput = selectElement("#export-floor-gap");
const exportPresetRenameDialogElement = selectElement("#export-preset-rename-dialog");
const exportPresetRenameFormElement = selectElement("#export-preset-rename-form");
const exportPresetRenameInputElement = selectElement("#export-preset-rename-input");
const exportPresetDeleteDialogElement = selectElement("#export-preset-delete-dialog");
const exportPresetDeleteFormElement = selectElement("#export-preset-delete-form");
const exportPresetDeleteNameElement = selectElement("#export-preset-delete-name");
const exportOverwriteDialogElement = selectElement("#export-overwrite-dialog");
const exportOverwriteNameElement = selectElement("#export-overwrite-name");
const exportCompleteDialogElement = selectElement("#export-complete-dialog");
const exportCompleteTitleElement = selectElement("#export-complete-title");
const exportCompleteMessageElement = selectElement("#export-complete-message");
const exportCompletePathElement = selectElement("#export-complete-path");
const studioShellElement = selectElement(".studio-shell");
const libraryPanelElement = selectElement(".library-panel");
const libraryResizerElement = selectElement("#library-resizer");
const detailsPanelElement = selectElement(".details-panel");
const detailsResizerElement = selectElement("#details-resizer");

/* ===== 布局层：三栏宽度、3D 预览高度、折叠态 ===== */

/**
 * 布局状态的存储键。
 */
const STUDIO_LAYOUT_STORAGE_KEY = "homeos.layout.v1.studio";

// 布局常量缓存槽，含义与失效时机见下方 studioLayoutMetrics()。

const studioLayout = createLayoutController({
  storageKey: STUDIO_LAYOUT_STORAGE_KEY,
  shell: studioShellElement,
  panels: [
    {
      id: "library",
      sizeVar: "--layout-library-w",
      element: libraryPanelElement,
      unit: "px",
      def: 204,
      minVar: "--layout-library-min-w",
      maxVar: "--layout-library-max-w",
      collapsible: true
    },
    {
      id: "details",
      sizeVar: "--details-panel-width",
      element: detailsPanelElement,
      unit: "%",
      def: 29,
      // 百分比栏的上下限随窗口尺寸变化，是本模块唯一必须现算的一类：窗口变窄 / 变矮之后，
      limits: () => {
        const panelLimits = measurePanelLimits();
        return {
          min: panelLimits.minimumWidthRatio * 100,
          max: panelLimits.maximumWidthRatio * 100
        };
      },
      collapsible: true
    },
    {
      id: "previewHeight",
      sizeVar: "--preview-panel-height",
      varTarget: detailsPanelElement,
      unit: "%",
      def: 52,
      limits: () => {
        const panelLimits = measurePanelLimits();
        return {
          min: panelLimits.minimumHeightRatio * 100,
          max: panelLimits.maximumHeightRatio * 100
        };
      }
    }
  ],
  separators: [
    {
      // 右栏那条老分隔条：一个手柄同时管两个方向（横着拖改宽度、竖着拖改预览高度），
      element: detailsResizerElement,
      orientation: "both",
      label: "拖动调整 3D 预览高度与属性栏宽度",
      // ARIA 只报预览高度，与迁移前一致（横竖两轴没法用一对 aria-valuenow 表达）。
      ariaPanel: "previewHeight",
      axes: [
        {
          panelId: "previewHeight",
          axis: "y",
          sign: 1,
          reference: () => detailsPanelElement.getBoundingClientRect().height
        },
        {
          panelId: "details",
          axis: "x",
          sign: -1,
          reference: () => studioShellElement.getBoundingClientRect().width
        }
      ]
    },
    {
      element: libraryResizerElement,
      orientation: "vertical",
      label: "拖动调整素材栏宽度",
      axes: [{ panelId: "library", axis: "x", sign: 1 }]
    }
  ]
  // 不设 onChange：布局变化后平面画布与 3D 舞台的尺寸重算各自挂在 ResizeObserver 上
});

/**
 * 把老文档里的两个布局比例搬进 localStorage。只在本地还没有任何布局记录时生效（判定在
 */
function migrateLegacyLayoutSettings() {
  if (!state.pendingLegacyLayoutSeed) {
    return;
  }
  const legacyLayoutSeed = state.pendingLegacyLayoutSeed;
  state.pendingLegacyLayoutSeed = null;
  studioLayout.seedPanels(legacyLayoutSeed);
}
/* 素材卡片必须先渲染：下面两行一次性抓走全部 [data-item-type] 与分组标题并据此绑事件，
   晚于这里生成的卡片会「看得见、点不动」。数据表在 studio-asset-palette.js。 */
renderStudioAssetPalette(selectElement("#asset-grid"));
const assetCategoryButtons = [...document.querySelectorAll("[data-asset-category]")];
const assetHeadingCategoryButtons = [...document.querySelectorAll("[data-asset-heading-category]")];
const itemTypeButtons = [...document.querySelectorAll("[data-item-type]")];
const assetGridElement = selectElement("#asset-grid");
const lightAssetRowElement = selectElement("#light-asset-row");
const lightLayerPanelElement = selectElement("#light-layer-panel");
const lightLayerActionsElement = selectElement("#light-layer-actions");
const lightGroupListElement = selectElement("#light-group-list");
const addLightGroupButton = selectElement("#add-light-group");
const lightGroupsOffButton = selectElement("#light-groups-off");
const lightGroupContextMenuElement = selectElement("#light-group-context-menu");
const areaContextMenuElement = selectElement("#area-context-menu");
const addAreaButton = selectElement("#add-area");
const areaRenameDialogElement = selectElement("#area-rename-dialog");
const areaRenameFormElement = selectElement("#area-rename-form");
const areaRenameTitleElement = selectElement("#area-rename-title");
const areaRenameInputElement = selectElement("#area-rename-input");
const lightGroupAreaDialogElement = selectElement("#light-group-area-dialog");
const lightGroupAreaFormElement = selectElement("#light-group-area-form");
const lightGroupAreaNameElement = selectElement("#light-group-area-name");
const lightGroupAreaSelectElement = selectElement("#light-group-area-select");
const lightGroupAreaNewNameElement = selectElement("#light-group-area-new-name");
/**
 * 改挂装方式时把进深与离地高度拨到对应档。两样都只在「当前值恰好等于某一种挂装的标称值」
 */
function snapTelevisionMountDimensions(televisionItem: any, nextMountStyle: any) {
  const televisionDepth = finite(televisionItem.depth, 0);
  if (
    Object.values(TELEVISION_MOUNT_DEPTHS).some(
      nominalDepth => Math.abs(televisionDepth - nominalDepth) < 0.001
    )
  ) {
    televisionItem.depth = (TELEVISION_MOUNT_DEPTHS as any)[nextMountStyle];
  }
  const televisionElevation = finite(televisionItem.elevation, 0);
  if (
    Object.values(TELEVISION_MOUNT_ELEVATIONS).some(
      nominalElevation => Math.abs(televisionElevation - nominalElevation) < 0.001
    )
  ) {
    televisionItem.elevation = (TELEVISION_MOUNT_ELEVATIONS as any)[nextMountStyle];
  }
}
/**
 * 汇总若干楼层里出现过的外部模型类型（去重）。窗帘被排除 —— 它是参数化几何现场
 */
function collectItemModelTypes(sourceFloors: any = []) {
  return [
    ...new Set(
      sourceFloors.flatMap((sourceFloor: any) =>
        (sourceFloor?.scene?.items || [])
          .filter((filteredItem: any) => filteredItem.type !== "curtain")
          .map((mappedItem: any) => modelTypeForItem(mappedItem))
          .filter((modelType: any) => (ALL_ITEM_MODELS as any)[modelType])
      )
    )
  ];
}
/**
 * 当前预览范围内需要的外部模型类型。单层预览只看当前层，整层堆叠（all）要看所有
 */
function currentFloorModelTypes() {
  const modelSourceFloors =
    currentPreviewFloorMode() === "all"
      ? state.studioDocument?.floors || []
      : [getCurrentFloor()].filter(Boolean);
  return collectItemModelTypes(modelSourceFloors);
}
const dracoLoader = new SameOriginDRACOLoader(
  "/static/3d-studio/export/draco-decoder-worker.js"
);
dracoLoader.setDecoderPath("/static/vendor/three/0.186.0/draco/");
dracoLoader.setDecoderConfig({
  type: "wasm"
});
dracoLoader.setWorkerLimit(2);
dracoLoader.preload();
gltfLoader.setDRACOLoader(dracoLoader);
/**
 * 放行当前预览范围内所有被搁置的模型，返回全部加载 Promise。
 */
function releaseAllDeferredModels() {
  return releaseDeferredModels(currentFloorModelTypes());
}
/**
 * 跳过防抖立刻重建预览，用于展示页「已就绪」与导出前这类必须同步完成的时机。
 */
function forcePreviewRebuild() {
  updateModelLoadingStatus();
  state.isPrecompilePending = false;
  window.clearTimeout(state.precompileRenderTimer);
  state.precompileRenderTimer = null;
  applySceneRefresh({
    force: true,
    precompile: true
  });
}
// 几何体与材质的进程内复用池：键是尺寸 / 颜色等可枚举参数。
// 自身发光的物件类型：电视机、汽车、户型铭牌与三类灯具。
// 允许做「烘焙式合批」的物件白名单：把整件家具的所有网格焊成一份几何。
// 走新版合批构建路径的物件类型，构建时会打上 optimizationBatch 标记便于统计。
// 灯光属性面板的字段登记表：字段名 → 界面控件与单位。
/**
 * 把灯光属性的原始输入夹到合法区间并归一精度。中文界面传入字符串且用户可输任意
 */
function sanitizeLightFieldValue(lightFieldKey: any, rawValue: any, lightingItemType: any) {
  if (lightFieldKey === "lightTemperature") {
    return Math.round(clamp(finite(rawValue, 3000), 2200, 6500));
  } else if (lightFieldKey === "lightBrightness") {
    return Math.round(clamp(finite(rawValue, 50), 0, 100));
  } else if (lightFieldKey === "lightRange") {
    return Math.round(clamp(finite(rawValue, 3.5), 0.5, 10) * 10) / 10;
  } else if (lightFieldKey === "lightAngle") {
    return Math.round(clamp(finite(rawValue, 90), 15, maxLightAngleForType(lightingItemType)));
  } else if (lightFieldKey === "elevation") {
    return Math.round(clamp(finite(rawValue, 2.7), 0, 6) * 100) / 100;
  } else {
    return finite(rawValue);
  }
}
/**
 * 按字段单位把数值格式化成界面文案。角度与百分比紧贴数字（48% / 48°），米与开尔文
 */
function formatLightFieldValue(formattedFieldKey: any, value: any) {
  const fieldConfig = (LIGHT_FIELD_CONFIG as any)[formattedFieldKey];
  if (!fieldConfig) {
    return String(value);
  }
  const formattedValue = ["lightRange", "elevation"].includes(formattedFieldKey)
    ? Number(value).toFixed(formattedFieldKey === "elevation" ? 2 : 1)
    : Math.round(value);
  if (["%", "°"].includes(fieldConfig.unit)) {
    return "" + formattedValue + fieldConfig.unit;
  } else {
    return formattedValue + " " + fieldConfig.unit;
  }
}
// 工具提示文案（标题 + 说明），与界面文案一致，改动请同步 studio.css 的宽度假设。
const isStudioRoute = isStageViewerMode || /^\/3d-studio\/?$/.test(window.location.pathname);
const metricsCanvas = document.createElement("canvas");
const metricsContext = metricsCanvas.getContext("2d");
const {
  drawMetricGrid: drawMetricGrid,
  drawLine: drawPlanLine,
  drawPoint: drawPlanPoint,
  drawOpenEndpointWarning: drawOpenEndpointWarning,
  drawFloatingLabel: drawFloatingLabel
} = createPlanDrawingTools({
  context: planContext,
  planToScreen: planToScreen,
  screenToPlan: screenToPlan,
  pixelsPerMeter: currentPixelsPerMeter,
  getCanvasSize: () => ({
    width: state.viewportWidthPx,
    height: state.viewportHeightPx
  }),
  getViewZoom: () => state.viewTransform.zoom
});

// 本文件的状态集中在下面这段 let 里（没有状态容器对象）：绘制 / 预览 / 导出三处回调都要
const selectedDoorType = "solid";
const expandedAreaIds = new Set();
// 「稍后处理」：用户先不当场二选一。冲突记录留着（本地内容一点不丢、也绝不静默覆盖），
// 「本次删除影响」的确认记录：删除模型后保存会让 3D 控件绑定悬空时，服务端不落盘、先要一次确认
// 「保留模型」：收起对话框但记录留着（本地删除与撤销栈一点不动、也绝不按未确认的计划清理）。
try {
  // 不支持 / 被策略禁用时保持 null：下文一律用 lightingChannel?.，退化成「无跨标签同步」。
  if (typeof BroadcastChannel == "function") {
    state.lightingChannel = new BroadcastChannel("homeos-studio3d-base-lighting-v1");
  }
} catch {}
/**
 * 让楼层名在同一份文档里唯一：重名时追加「 2」「 3」这样的序号。
 */
function uniqueFloorName(name: any, excludeFloorId = "") {
  const existingNames = new Set(
    (state.studioDocument?.floors || [])
      .filter((siblingFloor: any) => siblingFloor.id !== excludeFloorId)
      .map((namedFloor: any) => namedFloor.name)
  );
  if (!existingNames.has(name)) {
    return name;
  }
  let suffix = 2;
  while (existingNames.has(name + " " + suffix)) {
    suffix += 1;
  }
  return name + " " + suffix;
}
/**
 * 关闭楼层右键菜单。
 */
function closeFloorContextMenu() {
  floorContextMenuElement.hidden = true;
  state.floorMenuTargetId = "";
}
function openFloorContextMenu(menuFloor: any, contextMenuEvent: any) {
  state.floorMenuTargetId = menuFloor.id;
  const floorDeleteButton = floorContextMenuElement.querySelector('[data-floor-action="delete"]');
  floorDeleteButton.disabled = state.studioDocument.floors.length <= 1;
  floorContextMenuElement.hidden = false;
  positionPointMenu({
    menuElement: floorContextMenuElement,
    clientX: contextMenuEvent.clientX,
    clientY: contextMenuEvent.clientY
  });
}
/**
 * 弹出删除楼层确认框；最后一层直接拒绝。
 */
function requestFloorDelete(targetFloor: any) {
  if (!!targetFloor && !(state.studioDocument.floors.length <= 1)) {
    state.floorDeleteTargetId = targetFloor.id;
    floorDeleteNameElement.textContent = targetFloor.name;
    floorDeleteDialogElement.showModal();
  }
}
/**
 * 关闭删除楼层对话框并清掉待删目标。
 */
function closeFloorDeleteDialog() {
  state.floorDeleteTargetId = "";
  if (floorDeleteDialogElement.open) {
    floorDeleteDialogElement.close();
  }
}
/**
 * 执行删除楼层：移除记录、重排标高、切到相邻层并落盘。删后按 defaultFloorHeight 重排
 */
async function deleteFloor() {
  const floorToDelete = state.studioDocument.floors.find(
    (deletedFloor: any) => deletedFloor.id === state.floorDeleteTargetId
  );
  closeFloorDeleteDialog();
  if (!floorToDelete || state.studioDocument.floors.length <= 1) {
    return;
  }
  const floorIndex = state.studioDocument.floors.findIndex(
    (indexedFloor: any) => indexedFloor.id === floorToDelete.id
  );
  state.studioDocument.floors.splice(floorIndex, 1);
  state.studioDocument.floors.forEach((renumberedFloor: any, orderedIndex: any) => {
    renumberedFloor.elevation = orderedIndex * state.studioDocument.defaultFloorHeight;
  });
  const nextFloor = state.studioDocument.floors[Math.max(0, floorIndex - 1)] || state.studioDocument.floors[0];
  await activateFloor(nextFloor.id, {
    persist: false
  });
  syncPreviewFloorButtons();
  markDocumentDirty();
  showToast("已删除“" + floorToDelete.name + "”。", "success");
}
/**
 * 打开楼层重命名对话框并预填当前名字。
 */
function openFloorRenameDialog(renamedFloor: any) {
  if (renamedFloor) {
    state.floorMenuTargetId = renamedFloor.id;
    floorRenameInputElement.value = renamedFloor.name;
    floorRenameDialogElement.showModal();
    requestAnimationFrame(() => floorRenameInputElement.select());
  }
}
/**
 * 重绘楼层列表。列表项同时承担三种交互：单击切层、长按 280ms 拖动排序、右键出菜单。
 */
function renderFloorList() {
  if (state.studioDocument) {
    floorListElement.replaceChildren();
    for (const listedFloor of state.studioDocument.floors) {
      const floorRowElement = document.createElement("div");
      floorRowElement.className =
        "floor-row" +
        (listedFloor.id === state.activeFloorId ? " active" : "") +
        (listedFloor.aligned ? "" : " unaligned");
      floorRowElement.dataset.floorId = listedFloor.id;
      floorRowElement.draggable = true;
      floorRowElement.setAttribute(
        "aria-label",
        listedFloor.name +
          "，" +
          (listedFloor.id === state.activeFloorId ? "当前楼层，" : "") +
          "长按拖动排序，右键可重命名或删除"
      );
      let isDragReady = false;
      let dragReadyTimer: any = null;
      /**
       * 复位本行「长按待拖」状态：清掉定时器并移除高亮样式。
       */
      const resetDragReady = () => {
        if (dragReadyTimer) {
          clearTimeout(dragReadyTimer);
        }
        dragReadyTimer = null;
        isDragReady = false;
        floorRowElement.classList.remove("drag-ready");
      };
      floorRowElement.addEventListener("pointerdown", pointerDownEvent => {
        if (pointerDownEvent.button === 0 && !(pointerDownEvent.target as any).closest("button")) {
          resetDragReady();
          dragReadyTimer = setTimeout(() => {
            dragReadyTimer = null;
            isDragReady = true;
            floorRowElement.classList.add("drag-ready");
          }, 280);
        }
      });
      floorRowElement.addEventListener("pointerup", resetDragReady);
      floorRowElement.addEventListener("pointercancel", resetDragReady);
      floorRowElement.addEventListener("dragstart", dragStartEvent => {
        if (!isDragReady) {
          dragStartEvent.preventDefault();
          resetDragReady();
          return;
        }
        state.draggingFloorId = listedFloor.id;
        floorRowElement.classList.remove("drag-ready");
        floorRowElement.classList.add("dragging");
        dragStartEvent.dataTransfer!.effectAllowed = "move";
        dragStartEvent.dataTransfer!.setData("application/x-homeos-floor", listedFloor.id);
      });
      floorRowElement.addEventListener("dragend", () => {
        state.draggingFloorId = "";
        floorRowElement.classList.remove("dragging");
        resetDragReady();
        clearFloorDropIndicators();
      });
      floorRowElement.addEventListener("dragover", dragOverEvent => {
        if (!state.draggingFloorId || state.draggingFloorId === listedFloor.id) {
          return;
        }
        dragOverEvent.preventDefault();
        clearFloorDropIndicators();
        const isAfterMidpoint =
          dragOverEvent.clientY >=
          floorRowElement.getBoundingClientRect().top +
            floorRowElement.getBoundingClientRect().height / 2;
        floorRowElement.dataset.dropPosition = isAfterMidpoint ? "after" : "before";
        floorRowElement.classList.add(isAfterMidpoint ? "drop-after" : "drop-before");
        if (dragOverEvent.dataTransfer) {
          dragOverEvent.dataTransfer!.dropEffect = "move";
        }
      });
      floorRowElement.addEventListener("drop", dropEvent => {
        if (!state.draggingFloorId || state.draggingFloorId === listedFloor.id) {
          return;
        }
        dropEvent.preventDefault();
        const draggedFloorId = state.draggingFloorId;
        const isAfterTarget = floorRowElement.dataset.dropPosition === "after";
        state.draggingFloorId = "";
        clearFloorDropIndicators();
        reorderFloorList(draggedFloorId, listedFloor.id, isAfterTarget);
      });
      const activateButton = document.createElement("button");
      activateButton.type = "button";
      activateButton.textContent = listedFloor.id === state.activeFloorId ? "●" : "○";
      activateButton.title = "切换到" + listedFloor.name;
      activateButton.addEventListener("click", activateEvent => {
        activateEvent.stopPropagation();
        activateFloor(listedFloor.id, {
          persist: true
        });
      });
      const floorNameElement = document.createElement("span");
      floorNameElement.textContent = listedFloor.name;
      floorNameElement.title = "长按后拖动可调整楼层顺序，右键可重命名或删除楼层";
      const stateElement = document.createElement("small");
      const listedFloorIndex = state.studioDocument.floors.findIndex(
        (reorderedFloor: any) => reorderedFloor.id === listedFloor.id
      );
      stateElement.textContent =
        listedFloorIndex === 0 ? "基准" : listedFloor.aligned ? "已对齐" : "待对齐";
      floorRowElement.addEventListener("click", () => {
        activateFloor(listedFloor.id, {
          persist: true
        });
      });
      floorRowElement.addEventListener("contextmenu", floorContextMenuEvent => {
        floorContextMenuEvent.preventDefault();
        openFloorContextMenu(listedFloor, floorContextMenuEvent);
      });
      floorRowElement.append(activateButton, floorNameElement, stateElement);
      floorListElement.append(floorRowElement);
    }
    updateFloorAlignmentControls();
  }
}
/**
 * 清掉所有楼层行上的拖放落点指示。dragend 与每次重新计算落点前都会调用，
 */
function clearFloorDropIndicators() {
  for (const staleRowElement of floorListElement.querySelectorAll(".floor-row")) {
    staleRowElement.classList.remove("drop-before", "drop-after");
    delete staleRowElement.dataset.dropPosition;
  }
}
/**
 * 把被拖动的楼层移到目标楼层的上方或下方，并落盘新的顺序。数组重排交给纯函数
 */
function reorderFloorList(draggedFloorIdParam: any, targetFloorIdParam: any, shouldInsertAfter: any) {
  const reorderedFloors = reorderFloors(
    state.studioDocument.floors,
    draggedFloorIdParam,
    targetFloorIdParam,
    shouldInsertAfter,
    state.studioDocument.defaultFloorHeight
  );
  if (reorderedFloors === state.studioDocument.floors) {
    return;
  }
  const draggedFloor = state.studioDocument.floors.find(
    (movedFloor: any) => movedFloor.id === draggedFloorIdParam
  );
  state.studioDocument.floors = reorderedFloors;
  renderFloorList();
  syncPreviewFloorButtons();
  updateFloorAlignmentControls();
  applySceneRefresh({
    force: true
  });
  markDocumentDirty();
  if (draggedFloor) {
    showToast("已调整“" + draggedFloor.name + "”的楼层顺序。", "success");
  }
}
/**
 * 按当前状态刷新「对齐楼层」按钮与工具栏引导文案。只有非基准层（下标 > 0）且已完成
 */
function updateFloorAlignmentControls() {
  const currentFloor = getCurrentFloor();
  const activeFloorIndex = currentFloor
    ? state.studioDocument.floors.findIndex((floorEntry: any) => floorEntry.id === currentFloor.id)
    : -1;
  const canAlign = state.studioDocument.floors.length > 1 && activeFloorIndex > 0;
  alignFloorButton.hidden = !canAlign;
  alignFloorButton.disabled = !canAlign || !currentFloor?.scene?.calibration;
  alignFloorButton.textContent = currentFloor?.aligned ? "重新对齐" : "对齐楼层";
  if (state.floorAlignState?.stage === "reference") {
    activeToolLabelElement.textContent = "楼层对齐 · 参照层";
    toolHelpElement.textContent =
      "点击" + state.floorAlignState.referenceFloor.name + "上的楼梯角、墙角或柱点；Esc 取消";
  } else if (state.floorAlignState?.stage === "current") {
    activeToolLabelElement.textContent = "楼层对齐 · 当前层";
    toolHelpElement.textContent =
      "点击" + currentFloor.name + "上的相同位置；系统会自动重合上下楼层";
  }
}
/**
 * 切换当前编辑楼层（列表点击、楼层按钮、导出逐层遍历都走这里）。切层是全局状态重置点：
 */
async function activateFloor(targetFloorId: any, { persist: shouldPersist = false } = {}) {
  const requestedFloorRecord = state.studioDocument?.floors.find(
    (requestedFloor: any) => requestedFloor.id === targetFloorId
  );
  if (!requestedFloorRecord) {
    return;
  }
  const activationToken = ++state.floorSwitchToken;
  const overviewFloor = currentPreviewFloorMode() === "all" ? captureCameraSnapshot() : null;
  if (state.floorAlignState?.floorId !== requestedFloorRecord.id) {
    state.floorAlignState = null;
  }
  state.activeFloorId = requestedFloorRecord.id;
  state.studioDocument.activeFloorId = requestedFloorRecord.id;
  state.activeScene = requestedFloorRecord.scene;
  state.activeLightGroupId = "";
  clearSelection();
  resetScaleInteractionState();
  state.scalePreviewStart = null;
  state.undoStack = [];
  state.redoStack = [];
  state.viewTransform.rotation = state.activeScene.settings.planViewRotation;
  Promise.allSettled(releaseAllDeferredModels());
  await loadBackgroundTexture();
  if (activationToken === state.floorSwitchToken && state.activeFloorId === requestedFloorRecord.id) {
    refreshStudio();
    updateFloorAlignmentControls();
    fitViewToBounds();
    requestAnimationFrame(() => {
      if (activationToken === state.floorSwitchToken && state.activeFloorId === requestedFloorRecord.id) {
        if (currentPreviewFloorMode() === "all") {
          if (overviewFloor) {
            applyCameraSnapshot(overviewFloor, overviewFloor.viewportAspect);
          }
          syncCameraModeButtons(currentCameraMode());
          syncCameraViewButtons(currentCameraView());
          return;
        }
        if (state.activeScene.settings.fixedCameraView) {
          restoreStoredCameraView({
            recordChange: false,
            silent: true
          });
          return;
        }
        applyCameraMode(currentCameraMode(), {
          preserveView: false
        });
        resetCameraView();
      }
    });
    if (shouldPersist) {
      markDocumentDirty();
    }
  }
}
async function addFloor() {
  const newFloor = createFloor(state.studioDocument.floors.length);
  newFloor.name = uniqueFloorName(newFloor.name);
  state.studioDocument.floors.push(newFloor);
  syncPreviewFloorButtons();
  await activateFloor(newFloor.id, {
    persist: false
  });
  markDocumentDirty();
  showToast("已新增“" + newFloor.name + "”，导入并校准后会设置上下层参照点。", "success");
  activateTool("select");
}
/**
 * 把平面像素点从一层楼层的坐标系换算到另一层。实现是「先转到世界、再转回平面」两步
 */
function convertBetweenFloors(planPoint: any, fromFloor: any, toFloor: any) {
  return scenePointToFloorPoint(toFloor, floorPointToScenePoint(fromFloor, planPoint));
}
/**
 * 取参照层的墙并换算到当前层坐标系，供对齐时吸附使用。
 */
function referenceWallsForAlignment() {
  if (!state.floorAlignState) {
    return [];
  }
  const alignmentFloor = getCurrentFloor();
  return state.floorAlignState.referenceFloor.scene.walls.map((sourceWall: any) => ({
    ...sourceWall,
    start: convertBetweenFloors(sourceWall.start, state.floorAlignState.referenceFloor, alignmentFloor),
    end: convertBetweenFloors(sourceWall.end, state.floorAlignState.referenceFloor, alignmentFloor)
  }));
}
/**
 * 进入楼层对齐流程的第一阶段（在参照层上点参照点）。参照层固定取楼层列表中的上一层，
 */
function startFloorAlignment() {
  const alignmentSourceFloor = getCurrentFloor();
  const currentFloorIndex =
    state.studioDocument?.floors.findIndex((listFloor: any) => listFloor.id === alignmentSourceFloor?.id) ?? -1;
  const referenceFloor =
    currentFloorIndex > 0 ? state.studioDocument.floors[currentFloorIndex - 1] : null;
  if (!!alignmentSourceFloor && !!referenceFloor) {
    if (!alignmentSourceFloor.scene.calibration || !referenceFloor.scene.calibration) {
      showToast("当前层和参照层都需要先完成比例校准。", "error");
      return;
    }
    state.floorAlignState = {
      floorId: alignmentSourceFloor.id,
      referenceFloor: referenceFloor,
      stage: "reference",
      referencePoint: null
    };
    clearSelection();
    activateTool("select");
    planCanvasElement.style.cursor = "crosshair";
    updateFloorAlignmentControls();
    renderPlanView();
    showToast("先在半透明的" + referenceFloor.name + "上点击一个参照点。");
  }
}
/**
 * 放弃楼层对齐流程，恢复画布光标与工具状态。用户按 Esc、或点了别的楼层导致流程失效时
 */
function cancelFloorAlignment() {
  if (state.floorAlignState) {
    state.floorAlignState = null;
    planCanvasElement.style.cursor = "";
    activateTool("select");
    updateFloorAlignmentControls();
    renderPlanView();
    showToast("已取消楼层对齐。", "success");
  }
}
/**
 * 处理楼层对齐的两阶段画布点击：先在参照层按 18/zoom 平面像素吸附取参照点并换算到参照层坐标系，
 */
function handleFloorAlignClick(clickPoint: any) {
  if (!state.floorAlignState) {
    return false;
  }
  const alignmentTargetFloor = getCurrentFloor();
  if (!alignmentTargetFloor || alignmentTargetFloor.id !== state.floorAlignState.floorId) {
    cancelFloorAlignment();
    return true;
  }
  if (state.floorAlignState.stage === "reference") {
    const referenceWalls = referenceWallsForAlignment();
    const snappedReferencePoint =
      nearestWall(clickPoint, referenceWalls, 18 / state.viewTransform.zoom)?.point || clickPoint;
    state.floorAlignState.referencePoint = convertBetweenFloors(
      snappedReferencePoint,
      alignmentTargetFloor,
      state.floorAlignState.referenceFloor
    );
    state.floorAlignState.stage = "current";
    updateFloorAlignmentControls();
    renderPlanView();
    showToast("现在点击" + alignmentTargetFloor.name + "上的同一个位置。");
    return true;
  }
  const alignPoint =
    nearestWall(clickPoint, alignmentTargetFloor.scene.walls, 18 / state.viewTransform.zoom)?.point ||
    clickPoint;
  const referenceOffset = floorPointToScenePoint(
    state.floorAlignState.referenceFloor,
    state.floorAlignState.referencePoint
  );
  alignmentTargetFloor.originX = alignPoint.x;
  alignmentTargetFloor.originY = alignPoint.y;
  alignmentTargetFloor.originInitialized = true;
  alignmentTargetFloor.offsetX = referenceOffset.x;
  alignmentTargetFloor.offsetZ = referenceOffset.z;
  alignmentTargetFloor.rotation = state.floorAlignState.referenceFloor.rotation || 0;
  alignmentTargetFloor.aligned = true;
  alignmentTargetFloor.alignmentPending = false;
  alignmentTargetFloor.alignment = {
    referenceFloorId: state.floorAlignState.referenceFloor.id,
    referencePoint: {
      ...state.floorAlignState.referencePoint
    },
    currentPoint: {
      ...alignPoint
    }
  };
  state.floorAlignState = null;
  planCanvasElement.style.cursor = "";
  activateTool("select");
  renderFloorList();
  renderPlanView();
  applySceneRefresh({
    force: true
  });
  markDocumentDirty();
  showToast(alignmentTargetFloor.name + "已与下层参照点对齐。", "success");
  return true;
}
/**
 * 提交「预览楼层间距」输入值（合法区间 0~20m）。与 exportFloorGap 分开存储：预览间距只
 */
function commitPreviewFloorGap() {
  const previewGap = clamp(
    finite(previewFloorGapInput.value, state.studioDocument?.previewFloorGap || 3),
    0,
    20
  );
  if (!(Math.abs(previewGap - finite(state.studioDocument?.previewFloorGap, 3)) < 0.000001)) {
    state.studioDocument.previewFloorGap = previewGap;
    previewFloorGapInput.value = previewGap.toFixed(1);
    refreshPreviewScene();
    markDocumentDirty();
  }
}
/**
 * 提交「统一整景堆叠」开关。该开关决定整景预览是共用一套相机投影还是逐层套用各自视角，
 */
function commitUniformOverviewStack() {
  state.studioDocument.uniformOverviewStack = previewFloorUniformInput.checked;
  invalidateRender({
    scene: true
  });
  markDocumentDirty();
}
/**
 * 提交「导出楼层间距」输入框的值，合法区间 0~20m。与 previewFloorGap 分开存储：
 */
function commitExportFloorGap() {
  const exportGap = clamp(
    finite(exportFloorGapInput.value, state.studioDocument?.exportFloorGap || 3),
    0,
    20
  );
  if (!(Math.abs(exportGap - finite(state.studioDocument?.exportFloorGap, 3)) < 0.000001)) {
    state.studioDocument.exportFloorGap = exportGap;
    exportFloorGapInput.value = exportGap.toFixed(1);
    refreshPreviewScene();
    exportStatusElement.textContent = "全楼层间距已设为 " + exportGap.toFixed(1) + " m";
    markDocumentDirty();
  }
}
function cloneSceneForHistory(sourceScene = state.activeScene) {
  return structuredClone(sourceScene);
}
/**
 * 当前楼层里的电视列表。
 */
function televisionItems() {
  return state.activeScene.items.filter((televisionItem: any) => televisionItem.type === "tv");
}
/**
 * 当前楼层里的小汽车物件（类型 smallcar）。充电图层编号与充电负载估算都以它为准；
 */
function carItems() {
  return state.activeScene.items.filter((carItem: any) => carItem.type === "smallcar");
}
/**
 * 取当前预览范围内的楼层列表：整景（all）给全部楼层，单层只给当前层。单层分支用
 */
function previewFloors() {
  if (currentPreviewFloorMode() === "all") {
    return state.studioDocument.floors;
  } else {
    return [getCurrentFloor()].filter(Boolean);
  }
}
/**
 * 计算某楼层在整景导出图里相对基准层的垂直偏移（米）。单层导出无堆叠概念，返回 0。
 */
function floorExportOffset(measuredFloor: any) {
  if (currentPreviewFloorMode() !== "all") {
    return 0;
  }
  const offsetFloorIndex = state.studioDocument.floors.findIndex(
    (indexedFloorRecord: any) => indexedFloorRecord.id === measuredFloor?.id
  );
  return Math.max(offsetFloorIndex, 0) * finite(state.studioDocument.exportFloorGap, 3);
}
/**
 * 收集楼层里的灯组，并算出每组内的灯具。
 */
function collectLightGroups(groupSourceFloors = state.studioDocument?.floors || []) {
  return groupSourceFloors.flatMap((groupFloor: any) =>
    groupFloor.scene.lightGroups.map((listedGroup: any, groupPosition: any) => ({
      floor: groupFloor,
      group: listedGroup,
      index: groupPosition,
      key: floorGroupKey(groupFloor.id, listedGroup.id),
      lights: groupFloor.scene.items.filter(
        (groupLight: any) =>
          LIGHT_ITEM_TYPES.has(groupLight.type) && groupLight.lightGroupId === listedGroup.id
      )
    }))
  );
}
/**
 * 收集楼层里的电视，位置下标用于给「电视画面 N」图层编号。
 */
function collectTelevisions(televisionSourceFloors = state.studioDocument?.floors || []) {
  return televisionSourceFloors.flatMap((televisionFloor: any) =>
    televisionFloor.scene.items
      .filter((televisionCandidate: any) => televisionCandidate.type === "tv")
      .map((televisionEntry: any, televisionPosition: any) => ({
        floor: televisionFloor,
        item: televisionEntry,
        index: televisionPosition,
        key: televisionFloor.id + ":" + televisionEntry.id
      }))
  );
}
/**
 * 收集楼层里的小汽车，位置下标用于给「汽车充电 N」图层编号。与 collectTelevisions /
 */
function collectCars(carSourceFloors = state.studioDocument?.floors || []) {
  return carSourceFloors.flatMap((carFloor: any) =>
    carFloor.scene.items
      .filter((carCandidate: any) => carCandidate.type === "smallcar")
      .map((carEntry: any, carPosition: any) => ({
        floor: carFloor,
        item: carEntry,
        index: carPosition,
        key: carFloor.id + ":" + carEntry.id
      }))
  );
}
/**
 * 给新增 / 粘贴进来的电视分配唯一的「电视画面 N」图层名：已用名取自当前楼层全部电视，
 */
function assignTelevisionLayerNames(televisionItemsToName: any) {
  const usedTelevisionLayerNames = new Set(
    televisionItems().map((televisionLayerItem: any) => televisionLayerItem.screenLayerName)
  );
  let televisionLayerCounter = 1;
  for (const televisionLayerTarget of televisionItemsToName) {
    if (televisionLayerTarget.type === "tv") {
      while (usedTelevisionLayerNames.has("电视画面 " + televisionLayerCounter)) {
        televisionLayerCounter += 1;
      }
      televisionLayerTarget.screenLayerName = "电视画面 " + televisionLayerCounter;
      televisionLayerTarget.screenEnabled = televisionLayerTarget.screenEnabled !== false;
      usedTelevisionLayerNames.add(televisionLayerTarget.screenLayerName);
      televisionLayerCounter += 1;
    }
  }
}
/**
 * 给新增 / 粘贴进来的小汽车分配唯一的「汽车充电 N」图层名，与 assignTelevisionLayerNames
 */
function assignCarLayerNames(carItemsToName: any) {
  const usedCarLayerNames = new Set(carItems().map((carLayerItem: any) => carLayerItem.chargingLayerName));
  let carLayerCounter = 1;
  for (const carLayerTarget of carItemsToName) {
    if (carLayerTarget.type === "smallcar") {
      while (usedCarLayerNames.has("汽车充电 " + carLayerCounter)) {
        carLayerCounter += 1;
      }
      carLayerTarget.chargingLayerName = "汽车充电 " + carLayerCounter;
      carLayerTarget.chargingEnabled = carLayerTarget.chargingEnabled === true;
      usedCarLayerNames.add(carLayerTarget.chargingLayerName);
      carLayerCounter += 1;
    }
  }
}
/**
 * 统一补齐电视 / 小汽车的图层名，供新增与粘贴物件后调用。
 */
function normalizeLayerNames(itemsToName: any) {
  assignTelevisionLayerNames(itemsToName);
  assignCarLayerNames(itemsToName);
}
/**
 * 确保当前场景至少有一个灯组，并返回当前激活的那个。有副作用：会就地补出 lightGroups
 */
function ensureActiveLightGroup() {
  const sceneLightGroups = (state.activeScene.lightGroups ||= []);
  if (!sceneLightGroups.length) {
    sceneLightGroups.push({
      id: createId("light-group"),
      name: "默认灯组",
      enabled: true,
      areaId: null
    });
  }
  if (!sceneLightGroups.some((existingGroupRef: any) => existingGroupRef.id === state.activeLightGroupId)) {
    state.activeLightGroupId = sceneLightGroups[0].id;
  }
  return (
    sceneLightGroups.find((activeGroup: any) => activeGroup.id === state.activeLightGroupId) ||
    sceneLightGroups[0]
  );
}
/**
 * 重建「所属灯组」下拉框，并按传入物件回填选中项。选项取自 activeScene.lightGroups，
 */
function renderLightGroupSelect(selectedItem: any) {
  const lightGroupSelectElement = selectElement("#light-group");
  lightGroupSelectElement.replaceChildren();
  for (const optionGroup of state.activeScene.lightGroups || []) {
    const optionElement = document.createElement("option");
    optionElement.value = optionGroup.id;
    optionElement.textContent = optionGroup.name;
    lightGroupSelectElement.append(optionElement);
  }
  lightGroupSelectElement.value =
    lightGroupForItem(selectedItem)?.id || ensureActiveLightGroup().id;
  syncStudioSelect(lightGroupSelectElement);
}
/**
 * 关闭灯组右键菜单，并清掉菜单记录的目标灯组 id。
 */
function closeLightGroupContextMenu() {
  lightGroupContextMenuElement.hidden = true;
  state.lightGroupMenuTargetId = "";
}
/**
 * 在鼠标位置打开灯组右键菜单（重命名 / 复制 / 删除）。打开前先把该组设为激活并重绘列表，
 */
function openLightGroupContextMenu(menuGroup: any, groupContextMenuEvent: any) {
  state.lightGroupMenuTargetId = menuGroup.id;
  state.activeLightGroupId = menuGroup.id;
  renderLightGroupList();
  const groupDeleteButton = lightGroupContextMenuElement.querySelector(
    '[data-light-group-action="delete"]'
  );
  groupDeleteButton.disabled = state.activeScene.lightGroups.length <= 1;
  lightGroupContextMenuElement.hidden = false;
  positionPointMenu({
    menuElement: lightGroupContextMenuElement,
    clientX: groupContextMenuEvent.clientX,
    clientY: groupContextMenuEvent.clientY
  });
}
/**
 * 删除一个灯组，连同组内的灯。语义是「组没了，灯也不该留着」：先收集组内灯具 id 再
 */
function deleteLightGroup(removedGroup: any) {
  if (!removedGroup || state.activeScene.lightGroups.length <= 1) {
    return;
  }
  pushHistorySnapshot();
  const fallbackGroup = state.activeScene.lightGroups.find(
    (fallbackGroupRef: any) => fallbackGroupRef.id !== removedGroup.id
  );
  const removedLightIds = new Set(
    state.activeScene.items
      .filter(
        (groupLightCandidate: any) =>
          LIGHT_ITEM_TYPES.has(groupLightCandidate.type) &&
          groupLightCandidate.lightGroupId === removedGroup.id
      )
      .map((groupLightIdSource: any) => groupLightIdSource.id)
  );
  state.activeScene.items = state.activeScene.items.filter(
    (removableItem: any) => !removedLightIds.has(removableItem.id)
  );
  state.activeScene.lightGroups = state.activeScene.lightGroups.filter(
    (filteredGroup: any) => filteredGroup.id !== removedGroup.id
  );
  if (state.primarySelection?.kind === "item" && removedLightIds.has(state.primarySelection.id)) {
    state.primarySelection = null;
  }
  state.multiSelection = state.multiSelection.filter(
    (selectionEntry: any) => selectionEntry.kind !== "item" || !removedLightIds.has(selectionEntry.id)
  );
  if (state.activeLightGroupId === removedGroup.id) {
    state.activeLightGroupId = fallbackGroup.id;
  }
  refreshStudio("lights");
  markDocumentDirty();
  showToast(
    "已删除“" + removedGroup.name + "”及组内 " + removedLightIds.size + " 盏灯。",
    "success"
  );
}
/**
 * 给灯组取一个不重名的名字，重名时追加「 2」「 3」…… 后缀从 2 起递增而不是拼随机数，
 * @returns {string} 场景内唯一的名字。
 */
function uniqueLightGroupName(requestedGroupName: any) {
  const existingGroupNames = new Set(state.activeScene.lightGroups.map((namedGroup: any) => namedGroup.name));
  if (!existingGroupNames.has(requestedGroupName)) {
    return requestedGroupName;
  }
  let nameSuffix = 2;
  while (existingGroupNames.has(requestedGroupName + " " + nameSuffix)) {
    nameSuffix += 1;
  }
  return requestedGroupName + " " + nameSuffix;
}
/**
 * 复制一个灯组及其组内全部灯具，副本插在原组后并成为激活组。名字走 uniqueLightGroupName
 */
function duplicateLightGroup(sourceGroup: any) {
  if (!sourceGroup) {
    return;
  }
  pushHistorySnapshot();
  const copy = {
    ...structuredClone(sourceGroup),
    id: createId("light-group"),
    name: uniqueLightGroupName(sourceGroup.name + " 副本")
  };
  const groupIndex = state.activeScene.lightGroups.findIndex(
    (sourceGroupRef: any) => sourceGroupRef.id === sourceGroup.id
  );
  state.activeScene.lightGroups.splice(groupIndex + 1, 0, copy);
  const copiedLights = state.activeScene.items
    .filter(
      (copiedLight: any) =>
        LIGHT_ITEM_TYPES.has(copiedLight.type) && copiedLight.lightGroupId === sourceGroup.id
    )
    .map((copiedLightRecord: any) => ({
      ...structuredClone(copiedLightRecord),
      id: createId("item"),
      lightGroupId: copy.id
    }));
  state.activeScene.items.push(...copiedLights);
  state.activeLightGroupId = copy.id;
  state.primarySelection =
    copiedLights.length === 1
      ? {
          kind: "item",
          id: copiedLights[0].id
        }
      : null;
  state.multiSelection =
    copiedLights.length > 1
      ? copiedLights.map((copiedLightEntry: any) => ({
          kind: "item",
          id: copiedLightEntry.id
        }))
      : [];
  renderLightGroupList();
  refreshStudio("lights");
  markDocumentDirty();
  showToast("已复制“" + sourceGroup.name + "”及组内 " + copiedLights.length + " 盏灯。", "success");
}
/**
 * 清掉灯组行与区域行上的拖放落点高亮 / 落点标记。dragend 与每次重新计算落点前都会调用，
 */
function clearLightGroupDropIndicators() {
  for (const staleGroupRowElement of lightGroupListElement.querySelectorAll(".light-group-row")) {
    staleGroupRowElement.classList.remove("drop-before", "drop-after");
    delete staleGroupRowElement.dataset.dropPosition;
  }
  for (const staleAreaRowElement of lightGroupListElement.querySelectorAll(".light-area-row")) {
    staleAreaRowElement.classList.remove("drop-into");
  }
}
/**
 * 把灯组移动到目标区域，可插到某组之前 / 之后。只有区域或顺序真的变了才写撤销记录；
 * @param {boolean} [placeAfter=false] true 表示插到锚点之后。
 */
function moveLightGroupToArea(sourceId: any, targetAreaId: any, targetGroupId: any = null, placeAfter = false) {
  const sceneLightGroups = state.activeScene.lightGroups || [];
  const movedLightGroup = sceneLightGroups.find((movedGroupRef: any) => movedGroupRef.id === sourceId);
  if (!movedLightGroup) {
    return;
  }
  const nextAreaId = targetAreaId || null;
  // 先记下「区域是否真的变了」：与顺序变化分开判断，两者都没变才放弃这次拖动。
  const areaChanged = (movedLightGroup.areaId || null) !== nextAreaId;
  let nextOrder = sceneLightGroups;
  if (targetGroupId) {
    const remainingGroups = sceneLightGroups.filter(
      (remainingGroupRef: any) => remainingGroupRef.id !== sourceId
    );
    const anchorIndex = remainingGroups.findIndex(
      (anchorGroupRef: any) => anchorGroupRef.id === targetGroupId
    );
    if (anchorIndex >= 0) {
      nextOrder = [...remainingGroups];
      nextOrder.splice(anchorIndex + (placeAfter ? 1 : 0), 0, movedLightGroup);
    }
  }
  const orderChanged = nextOrder.some(
    (orderedGroup: any, orderedIndex: any) => orderedGroup.id !== sceneLightGroups[orderedIndex]?.id
  );
  if (!areaChanged && !orderChanged) {
    return;
  }
  pushHistorySnapshot();
  movedLightGroup.areaId = nextAreaId;
  if (orderChanged) {
    state.activeScene.lightGroups = nextOrder;
  }
  if (nextAreaId) {
    expandedAreaIds.add(nextAreaId);
  }
  renderLightGroupList();
  renderInspector();
  markDocumentDirty();
}
/**
 * 创建一个灯组列表行（含长按拖动排序与右键菜单）。鼠标 / 触控的拖动门限不同：触摸必须
 */
function createLightGroupRow(listedLightGroup: any) {
  const groupRowElement = document.createElement("div");
  groupRowElement.className =
    "light-group-row" + (listedLightGroup.id === state.activeLightGroupId ? " active" : "");
  groupRowElement.dataset.lightGroupId = listedLightGroup.id;
  groupRowElement.dataset.lightGroupAreaId = listedLightGroup.areaId || "";
  groupRowElement.draggable = true;
  groupRowElement.setAttribute(
    "aria-label",
    listedLightGroup.name + "，长按拖动排序，右键可重命名、复制或删除"
  );
  let isGroupDragReady = false;
  let groupDragReadyTimer: any = null;
  // 复位长按拖动状态：清定时器与高亮，pointerup / pointercancel / dragend 共用。
  const resetGroupDragReady = () => {
    if (groupDragReadyTimer) {
      clearTimeout(groupDragReadyTimer);
    }
    groupDragReadyTimer = null;
    isGroupDragReady = false;
    groupRowElement.classList.remove("drag-ready");
  };
  // 行本身可拖动，但触摸必须先按住：图层面板要滚动，若第一下触摸就进入拖动会抢走滚动。
  groupRowElement.addEventListener("pointerdown", groupPointerDownEvent => {
    resetGroupDragReady();
    if (groupPointerDownEvent.button !== 0 || (groupPointerDownEvent.target as any).closest("button")) {
      return;
    }
    if (groupPointerDownEvent.pointerType !== "touch") {
      isGroupDragReady = true;
      return;
    }
    groupDragReadyTimer = setTimeout(() => {
      groupDragReadyTimer = null;
      isGroupDragReady = true;
      groupRowElement.classList.add("drag-ready");
    }, 280);
  });
  groupRowElement.addEventListener("pointerup", resetGroupDragReady);
  groupRowElement.addEventListener("pointercancel", resetGroupDragReady);
  groupRowElement.addEventListener("dragstart", groupDragStartEvent => {
    if (!isGroupDragReady) {
      groupDragStartEvent.preventDefault();
      resetGroupDragReady();
      return;
    }
    state.draggingLightGroupId = listedLightGroup.id;
    groupRowElement.classList.remove("drag-ready");
    groupRowElement.classList.add("dragging");
    groupDragStartEvent.dataTransfer!.effectAllowed = "move";
    groupDragStartEvent.dataTransfer!.setData(
      "application/x-homeos-light-group",
      listedLightGroup.id
    );
  });
  groupRowElement.addEventListener("dragend", () => {
    state.draggingLightGroupId = "";
    groupRowElement.classList.remove("dragging");
    resetGroupDragReady();
    clearLightGroupDropIndicators();
  });
  groupRowElement.addEventListener("click", () => {
    state.activeLightGroupId = listedLightGroup.id;
    renderLightGroupList();
  });
  groupRowElement.addEventListener("contextmenu", groupMenuEvent => {
    groupMenuEvent.preventDefault();
    openLightGroupContextMenu(listedLightGroup, groupMenuEvent);
  });
  groupRowElement.addEventListener("dragover", groupDragOverEvent => {
    if (!state.draggingLightGroupId || state.draggingLightGroupId === listedLightGroup.id) {
      return;
    }
    groupDragOverEvent.preventDefault();
    clearLightGroupDropIndicators();
    const isGroupAfterMidpoint =
      groupDragOverEvent.clientY >=
      groupRowElement.getBoundingClientRect().top +
        groupRowElement.getBoundingClientRect().height / 2;
    groupRowElement.dataset.dropPosition = isGroupAfterMidpoint ? "after" : "before";
    groupRowElement.classList.add(isGroupAfterMidpoint ? "drop-after" : "drop-before");
    if (groupDragOverEvent.dataTransfer) {
      groupDragOverEvent.dataTransfer!.dropEffect = "move";
    }
  });
  groupRowElement.addEventListener("drop", groupDropEvent => {
    if (!state.draggingLightGroupId || state.draggingLightGroupId === listedLightGroup.id) {
      return;
    }
    groupDropEvent.preventDefault();
    const draggedGroupIdValue = state.draggingLightGroupId;
    const shouldInsertGroupAfter = groupRowElement.dataset.dropPosition === "after";
    state.draggingLightGroupId = "";
    clearLightGroupDropIndicators();
    moveLightGroupToArea(
      draggedGroupIdValue,
      listedLightGroup.areaId || null,
      listedLightGroup.id,
      shouldInsertGroupAfter
    );
  });
  const toggleButton = document.createElement("button");
  toggleButton.type = "button";
  toggleButton.className = listedLightGroup.enabled ? "on" : "";
  toggleButton.textContent = listedLightGroup.enabled ? "◉" : "○";
  toggleButton.title = listedLightGroup.enabled ? "关闭这个灯组" : "开启这个灯组";
  toggleButton.addEventListener("click", toggleEvent => {
    toggleEvent.stopPropagation();
    pushHistorySnapshot();
    listedLightGroup.enabled = !listedLightGroup.enabled;
    updateLightGroupsEnabled([listedLightGroup.id]);
    markDocumentDirty();
  });
  const groupNameElement = document.createElement("span");
  groupNameElement.className = "light-group-name";
  groupNameElement.textContent = listedLightGroup.name;
  groupNameElement.title = "长按灯组后拖动排序或移入区域，右键可设置区域、重命名、复制或删除";
  const countElement = document.createElement("small");
  countElement.textContent = String(
    state.activeScene.items.filter(
      (countedLight: any) =>
        LIGHT_ITEM_TYPES.has(countedLight.type) && countedLight.lightGroupId === listedLightGroup.id
    ).length
  );
  groupRowElement.append(toggleButton, groupNameElement, countElement);
  return groupRowElement;
}
/**
 * 创建一个「区域」区块（可折叠，内含该区域的灯组行）。区域头同时是拖放目标，只有
 */
function createAreaSection(listedArea: any, memberGroups: any) {
  const isAreaExpanded = expandedAreaIds.has(listedArea.id);
  const areaSectionElement = document.createElement("div");
  areaSectionElement.className = "light-area-section";
  areaSectionElement.dataset.areaId = listedArea.id;
  const areaHeaderElement = document.createElement("div");
  areaHeaderElement.className = "light-area-row" + (isAreaExpanded ? " expanded" : "");
  areaHeaderElement.setAttribute(
    "aria-label",
    listedArea.name + "，单击展开或收起，右键可重命名或删除"
  );
  const areaCaretElement = document.createElement("button");
  areaCaretElement.type = "button";
  areaCaretElement.className = "light-area-caret";
  areaCaretElement.textContent = isAreaExpanded ? "▾" : "▸";
  areaCaretElement.title = isAreaExpanded ? "收起区域" : "展开区域";
  areaCaretElement.addEventListener("click", caretEvent => {
    caretEvent.stopPropagation();
    toggleAreaExpanded(listedArea.id);
  });
  areaHeaderElement.addEventListener("dragover", areaDragOverEvent => {
    if (!state.draggingLightGroupId) {
      return;
    }
    // 取一次被拖动的灯组，用它当前的区域判断要不要显示「可放入」高亮。
    const draggedLightGroup = (state.activeScene.lightGroups || []).find(
      (draggedGroupRef: any) => draggedGroupRef.id === state.draggingLightGroupId
    );
    if (!draggedLightGroup) {
      return;
    }
    areaDragOverEvent.preventDefault();
    clearLightGroupDropIndicators();
    if ((draggedLightGroup.areaId || null) !== listedArea.id) {
      areaHeaderElement.classList.add("drop-into");
    }
    if (areaDragOverEvent.dataTransfer) {
      areaDragOverEvent.dataTransfer!.dropEffect = "move";
    }
  });
  areaHeaderElement.addEventListener("dragleave", areaDragLeaveEvent => {
    if (!areaHeaderElement.contains(areaDragLeaveEvent.relatedTarget as any)) {
      areaHeaderElement.classList.remove("drop-into");
    }
  });
  areaHeaderElement.addEventListener("drop", areaDropEvent => {
    if (!state.draggingLightGroupId) {
      return;
    }
    areaDropEvent.preventDefault();
    areaDropEvent.stopPropagation();
    const draggedGroupIdValue = state.draggingLightGroupId;
    state.draggingLightGroupId = "";
    clearLightGroupDropIndicators();
    moveLightGroupToArea(draggedGroupIdValue, listedArea.id);
  });
  const areaNameElement = document.createElement("span");
  areaNameElement.className = "light-area-name";
  areaNameElement.textContent = listedArea.name;
  const areaCountElement = document.createElement("small");
  areaCountElement.textContent = String(memberGroups.length);
  areaHeaderElement.append(areaCaretElement, areaNameElement, areaCountElement);
  areaHeaderElement.addEventListener("click", () => toggleAreaExpanded(listedArea.id));
  areaHeaderElement.addEventListener("contextmenu", areaMenuEvent => {
    areaMenuEvent.preventDefault();
    openAreaContextMenu(listedArea, areaMenuEvent);
  });
  areaSectionElement.append(areaHeaderElement);
  if (isAreaExpanded) {
    if (!memberGroups.length) {
      const emptyAreaElement = document.createElement("div");
      emptyAreaElement.className = "light-area-empty";
      emptyAreaElement.textContent = "暂无灯组";
      areaSectionElement.append(emptyAreaElement);
    } else {
      const areaGroupsElement = document.createElement("div");
      areaGroupsElement.className = "light-area-groups";
      for (const memberGroup of memberGroups) {
        areaGroupsElement.append(createLightGroupRow(memberGroup));
      }
      areaSectionElement.append(areaGroupsElement);
    }
  }
  return areaSectionElement;
}
/**
 * 展开 / 收起某个区域（展开状态只存在内存里，不写入文档）。
 */
function toggleAreaExpanded(areaId: any) {
  if (expandedAreaIds.has(areaId)) {
    expandedAreaIds.delete(areaId);
  } else {
    expandedAreaIds.add(areaId);
  }
  renderLightGroupList();
}
/**
 * 归一区域名（去首尾空白、限长，空名等同于「未填写」）。
 */
function normalizeAreaName(requestedAreaName: any) {
  return normalizeLabelText(requestedAreaName, "", 16);
}
/**
 * 判断区域名是否已被占用。
 */
function areaNameTaken(areaName: any, excludeAreaId: any = null) {
  return (state.activeScene.areas || []).some(
    (namedArea: any) => namedArea.id !== excludeAreaId && namedArea.name === areaName
  );
}
/**
 * 以「新建」模式打开区域命名对话框。新建与重命名共用同一个 <dialog>，靠 areaRenameMode /
 */
function openAreaCreateDialog() {
  state.areaRenameMode = "create";
  state.areaRenameId = "";
  areaRenameTitleElement.textContent = "新建区域";
  areaRenameInputElement.value = "";
  areaRenameDialogElement.showModal();
  requestAnimationFrame(() => areaRenameInputElement.focus());
}
/**
 * 以「重命名」模式打开区域对话框，并预填原名字。预填后在 requestAnimationFrame 里调
 */
function openAreaRenameDialog(renameTargetArea: any) {
  if (!renameTargetArea) {
    return;
  }
  state.areaRenameMode = "rename";
  state.areaRenameId = renameTargetArea.id;
  areaRenameTitleElement.textContent = "重命名区域";
  areaRenameInputElement.value = renameTargetArea.name;
  areaRenameDialogElement.showModal();
  requestAnimationFrame(() => areaRenameInputElement.select());
}
/**
 * 关闭区域命名对话框，并把模式重置回「新建」。必须重置：残留上次的 rename 模式与 id
 */
function closeAreaRenameDialog() {
  state.areaRenameMode = "create";
  state.areaRenameId = "";
  areaRenameDialogElement.close();
}
function deleteArea(removedArea: any) {
  if (!removedArea) {
    return;
  }
  pushHistorySnapshot();
  for (const ownedLightGroup of state.activeScene.lightGroups || []) {
    if (ownedLightGroup.areaId === removedArea.id) {
      ownedLightGroup.areaId = null;
    }
  }
  state.activeScene.areas = (state.activeScene.areas || []).filter(
    (filteredArea: any) => filteredArea.id !== removedArea.id
  );
  expandedAreaIds.delete(removedArea.id);
  renderLightGroupList();
  markDocumentDirty();
  showToast("已删除区域“" + removedArea.name + "”，组内灯组已移到未分类。", "success");
}
/**
 * 在鼠标位置打开区域右键菜单（重命名 / 删除）。与灯组菜单同理，坐标交给
 */
function openAreaContextMenu(menuArea: any, areaMenuEvent: any) {
  state.areaContextMenuId = menuArea.id;
  areaContextMenuElement.hidden = false;
  positionPointMenu({
    menuElement: areaContextMenuElement,
    clientX: areaMenuEvent.clientX,
    clientY: areaMenuEvent.clientY
  });
}
/**
 * 关闭区域右键菜单，并清掉目标区域 id。
 */
function closeAreaContextMenu() {
  areaContextMenuElement.hidden = true;
  state.areaContextMenuId = "";
}
/**
 * 重建「所属区域」下拉框：「未分类」恒在首位，其后是当前场景的全部区域。选项少，
 */
function syncAreaAssignOptions(selectedAreaId: any) {
  const areaOptions = [
    {
      value: "",
      label: "未分类"
    }
  ];
  for (const listedArea of state.activeScene.areas || []) {
    areaOptions.push({
      value: listedArea.id,
      label: listedArea.name
    });
  }
  lightGroupAreaSelectElement.replaceChildren(
    ...areaOptions.map(areaOption => {
      const optionElement = document.createElement("option");
      optionElement.value = areaOption.value;
      optionElement.textContent = areaOption.label;
      return optionElement;
    })
  );
  lightGroupAreaSelectElement.value = areaOptions.some(
    areaOption => areaOption.value === selectedAreaId
  )
    ? selectedAreaId
    : "";
  syncStudioSelect(lightGroupAreaSelectElement);
}
/**
 * 打开灯组的「分配区域」对话框。打开前按该灯组当前所属区域回填下拉框，并清空
 */
function openLightGroupAreaDialog(assignTargetGroup: any) {
  if (!assignTargetGroup) {
    return;
  }
  state.areaAssignGroupId = assignTargetGroup.id;
  lightGroupAreaNameElement.textContent = assignTargetGroup.name;
  lightGroupAreaNewNameElement.value = "";
  syncAreaAssignOptions(assignTargetGroup.areaId || "");
  lightGroupAreaDialogElement.showModal();
}
/**
 * 关闭灯组的「分配区域」对话框，并清掉目标灯组 id。
 */
function closeLightGroupAreaDialog() {
  state.areaAssignGroupId = "";
  lightGroupAreaDialogElement.close();
}
/**
 * 在「分配区域」对话框里直接新建区域，并立即把它设为当前选项。名字先过 normalizeAreaName
 */
function createAreaFromAssignDialog() {
  const newAreaName = normalizeAreaName(lightGroupAreaNewNameElement.value);
  if (!newAreaName) {
    showToast("请输入新区域名称。", "error");
    return;
  }
  if (areaNameTaken(newAreaName)) {
    showToast("已存在同名区域。", "error");
    return;
  }
  pushHistorySnapshot();
  const createdArea = {
    id: createId("area"),
    name: newAreaName
  };
  (state.activeScene.areas ||= []).push(createdArea);
  expandedAreaIds.add(createdArea.id);
  syncAreaAssignOptions(createdArea.id);
  lightGroupAreaNewNameElement.value = "";
  renderLightGroupList();
  markDocumentDirty();
  showToast("已新建区域“" + newAreaName + "”并选中。", "success");
}
/**
 * 重绘右侧图层面板（灯光 / 电器 / 家居三个分类共用一个面板）。内容跟着 activeAssetTab 走：
 */
function renderLightGroupList() {
  const televisions = televisionItems();
  const cars = carItems();
  const showLightGroups = state.activeAssetTab === "light";
  const showTelevisionScreens = state.activeAssetTab === "appliance" && televisions.length > 0;
  const showCarCharging = state.activeAssetTab === "home" && cars.length > 0;
  lightLayerPanelElement.hidden = !(showLightGroups || showTelevisionScreens || showCarCharging);
  if (lightLayerPanelElement.hidden) {
    return;
  }
  // 同一个面板服务三个分类：灯光页下的灯组、电器页下每台电视的画面图层、
  lightGroupsOffButton.textContent = showLightGroups
    ? "全关"
    : showTelevisionScreens
      ? "全关画面"
      : "全关充电";
  addAreaButton.hidden = !showLightGroups;
  addLightGroupButton.hidden = !showLightGroups;
  lightLayerActionsElement.classList.toggle("single", !showLightGroups);
  lightGroupListElement.replaceChildren();
  if (showLightGroups) {
    ensureActiveLightGroup();
    const sceneAreas = state.activeScene.areas || [];
    const areaIdSet = new Set(sceneAreas.map((areaRef: any) => areaRef.id));
    const groupsByAreaId = new Map();
    const unassignedLightGroups = [];
    for (const listedLightGroup of state.activeScene.lightGroups) {
      const listedAreaId = areaIdSet.has(listedLightGroup.areaId) ? listedLightGroup.areaId : null;
      if (listedAreaId) {
        if (!groupsByAreaId.has(listedAreaId)) {
          groupsByAreaId.set(listedAreaId, []);
        }
        groupsByAreaId.get(listedAreaId).push(listedLightGroup);
      } else {
        unassignedLightGroups.push(listedLightGroup);
      }
    }
    for (const listedArea of sceneAreas) {
      lightGroupListElement.append(
        createAreaSection(listedArea, groupsByAreaId.get(listedArea.id) || [])
      );
    }
    for (const unassignedLightGroup of unassignedLightGroups) {
      lightGroupListElement.append(createLightGroupRow(unassignedLightGroup));
    }
  }
  if (showTelevisionScreens) {
    for (const [televisionLayerIndex, television] of televisions.entries()) {
      lightGroupListElement.append(createTelevisionLayerRow(televisionLayerIndex, television));
    }
  }
  if (showCarCharging) {
    for (const [carRowLayerIndex, car] of cars.entries()) {
      lightGroupListElement.append(createCarChargingLayerRow(carRowLayerIndex, car));
    }
  }
}
/**
 * 创建一个电视画面图层行（开关图标 + 名称 + 计数）。开关字段语义是「是否关闭」：
 */
function createTelevisionLayerRow(televisionLayerIndex: any, television: any) {
  const televisionRowElement = document.createElement("div");
  televisionRowElement.className = "light-group-row tv-screen-layer-row";
  televisionRowElement.setAttribute(
    "aria-label",
    (television.screenLayerName || "电视画面 " + (televisionLayerIndex + 1)) + "，可独立开启或关闭"
  );
  const televisionToggleButton = document.createElement("button");
  televisionToggleButton.type = "button";
  televisionToggleButton.className = television.screenEnabled !== false ? "on" : "";
  televisionToggleButton.textContent = television.screenEnabled !== false ? "◉" : "○";
  televisionToggleButton.title =
    television.screenEnabled !== false ? "关闭电视画面" : "开启电视画面";
  televisionToggleButton.addEventListener("click", () => {
    pushHistorySnapshot();
    television.screenEnabled = television.screenEnabled === false;
    refreshStudio("items");
    markDocumentDirty();
  });
  const televisionNameElement = document.createElement("span");
  televisionNameElement.className = "light-group-name";
  televisionNameElement.textContent =
    television.screenLayerName || "电视画面 " + (televisionLayerIndex + 1);
  televisionNameElement.title = "电视开启画面";
  const televisionCountElement = document.createElement("small");
  televisionCountElement.textContent = "1";
  televisionRowElement.append(
    televisionToggleButton,
    televisionNameElement,
    televisionCountElement
  );
  return televisionRowElement;
}
/**
 * 创建一个汽车充电图层行（开关图标 + 名称 + 计数）。与电视行相反，充电状态的默认值是
 */
function createCarChargingLayerRow(carRowLayerIndex: any, car: any) {
  const carRowElement = document.createElement("div");
  carRowElement.className = "light-group-row car-charging-layer-row";
  carRowElement.setAttribute(
    "aria-label",
    (car.chargingLayerName || "汽车充电 " + (carRowLayerIndex + 1)) + "，可独立开启或关闭"
  );
  const carToggleButton = document.createElement("button");
  carToggleButton.type = "button";
  carToggleButton.className = car.chargingEnabled === true ? "on" : "";
  carToggleButton.textContent = car.chargingEnabled === true ? "◉" : "○";
  carToggleButton.title = car.chargingEnabled === true ? "关闭汽车充电状态" : "开启汽车充电状态";
  carToggleButton.addEventListener("click", () => {
    pushHistorySnapshot();
    car.chargingEnabled = car.chargingEnabled !== true;
    refreshStudio("items");
    markDocumentDirty();
  });
  const carNameElement = document.createElement("span");
  carNameElement.className = "light-group-name";
  carNameElement.textContent = car.chargingLayerName || "汽车充电 " + (carRowLayerIndex + 1);
  carNameElement.title = "汽车充电中状态图层";
  const carCountElement = document.createElement("small");
  carCountElement.textContent = "1";
  carRowElement.append(carToggleButton, carNameElement, carCountElement);
  return carRowElement;
}
/**
 * 一键开 / 关当前楼层的全部灯组（图层面板的「全关」按钮在灯光页的语义）。所有组状态已经
 */
function setLightGroupsEnabled(enabled: any) {
  const enabledGroups = state.activeScene.lightGroups || [];
  if (enabledGroups.every((enabledGroup: any) => enabledGroup.enabled === enabled)) {
    return;
  }
  pushHistorySnapshot();
  for (const updatedGroup of enabledGroups) {
    updatedGroup.enabled = enabled;
  }
  updateLightGroupsEnabled(enabledGroups.map((groupRef: any) => groupRef.id));
  markDocumentDirty();
}
/**
 * 一键开 / 关当前楼层全部电视画面。判据是 screenEnabled !== false（该字段语义为「是否关闭」，
 */
function setTelevisionScreensEnabled(enabled: any) {
  const televisions = televisionItems();
  if (televisions.every((televisionItem: any) => (televisionItem.screenEnabled !== false) === enabled)) {
    return;
  }
  pushHistorySnapshot();
  for (const televisionToggleTarget of televisions) {
    televisionToggleTarget.screenEnabled = enabled;
  }
  applySceneRefresh({
    scope: "items",
    preserveLightCache: true
  });
  markDocumentDirty();
}
/**
 * 一键开 / 关当前楼层的全部汽车充电状态。与电视相反，这里按 chargingEnabled === true
 */
function setCarChargingEnabled(enabled: any) {
  const cars = carItems();
  if (cars.every((carItem: any) => (carItem.chargingEnabled === true) === enabled)) {
    return;
  }
  pushHistorySnapshot();
  for (const carToggleTarget of cars) {
    carToggleTarget.chargingEnabled = enabled;
  }
  applySceneRefresh({
    scope: "items",
    preserveLightCache: true
  });
  markDocumentDirty();
}
/**
 * 按当前资产分类（灯光 / 电器 / 家居）把「全开 / 全关」转发给对应子函数。面板上只有一个
 */
function setCategoryLayersEnabled(enabled: any) {
  if (state.activeAssetTab === "appliance") {
    setTelevisionScreensEnabled(enabled);
  } else if (state.activeAssetTab === "home") {
    setCarChargingEnabled(enabled);
  } else {
    setLightGroupsEnabled(enabled);
  }
  renderLightGroupList();
}
/**
 * 清空全部选中状态（主选中与多选一并清）。切层、撤销、进入对齐等场景都会先调用它；
 */
function clearSelection() {
  state.primarySelection = null;
  state.multiSelection = [];
}
/**
 * 设置单选：把指定对象设为主选中并清空多选。
 */
function setSelection(setSelectionKind: any, selectionId: any) {
  state.primarySelection =
    setSelectionKind && selectionId
      ? {
          kind: setSelectionKind,
          id: selectionId
        }
      : null;
  state.multiSelection = [];
}
function scopeForItem(scopedItem: any) {
  if (scopedItem?.type === "flooropening") {
    return "all";
  } else if (LIGHT_ITEM_TYPES.has(scopedItem?.type)) {
    return "lights";
  } else {
    return "items";
  }
}
/**
 * 推断选中集合对应的最小刷新作用域，供选中联动与属性修改后重绘。规则：全是门窗栏杆等
 */
function scopeForSelection(selection: any) {
  if (
    selection.length &&
    selection.every((kindEntry: any) => ["door", "window", "railing"].includes(kindEntry.kind))
  ) {
    return "architecture";
  }
  if (!selection.length || selection.some((itemEntry: any) => itemEntry.kind !== "item")) {
    return "all";
  }
  const selectedItemIds = new Set(selection.map((selectionIdEntry: any) => selectionIdEntry.id));
  const selectedItems = state.activeScene.items.filter((matchedItem: any) =>
    selectedItemIds.has(matchedItem.id)
  );
  if (
    !selectedItems.length ||
    selectedItems.some((flaggedItem: any) => flaggedItem.type === "flooropening")
  ) {
    return "all";
  }
  const selectionLightCount = selectedItems.filter((lightFlagItem: any) =>
    LIGHT_ITEM_TYPES.has(lightFlagItem.type)
  ).length;
  if (selectionLightCount === selectedItems.length) {
    return "lights";
  } else if (selectionLightCount === 0) {
    return "items";
  } else {
    return "all";
  }
}
/**
 * 取当前选中（优先多选，其次主选中）的刷新作用域。
 */
function currentSelectionScope() {
  return scopeForSelection(
    state.multiSelection.length ? state.multiSelection : state.primarySelection ? [state.primarySelection] : []
  );
}
/**
 * 推断选中集合中与光照相关的刷新作用域。与 scopeForSelection 的差别在「没有灯」时：
 */
function lightScopeForSelection(lightSelection: any) {
  if (!lightSelection.length) {
    return null;
  }
  if (
    lightSelection.every((architectureEntry: any) =>
      ["wall", "door", "window", "railing"].includes(architectureEntry.kind)
    )
  ) {
    return "architecture";
  }
  if (lightSelection.some((nonItemEntry: any) => nonItemEntry.kind !== "item")) {
    return "all";
  }
  const lightSelectedIds = new Set(lightSelection.map((itemIdEntry: any) => itemIdEntry.id));
  const matchedItems = state.activeScene.items.filter((matchedLightItem: any) =>
    lightSelectedIds.has(matchedLightItem.id)
  );
  if (!matchedItems.length) {
    return null;
  }
  const lightItems = matchedItems.filter(
    (nonLightItem: any) => !LIGHT_ITEM_TYPES.has(nonLightItem.type) || nonLightItem.type === "striplight"
  );
  if (!lightItems.length) {
    return null;
  }
  const lightItemCount = lightItems.filter((lightOnlyItem: any) =>
    LIGHT_ITEM_TYPES.has(lightOnlyItem.type)
  ).length;
  if (lightItemCount === lightItems.length) {
    return "lights";
  } else if (lightItemCount === 0) {
    return "items";
  } else {
    return "all";
  }
}
/**
 * 取当前选中（优先多选，其次主选中）中与光照相关的作用域。
 */
function currentLightScope() {
  return lightScopeForSelection(
    state.multiSelection.length ? state.multiSelection : state.primarySelection ? [state.primarySelection] : []
  );
}
/**
 * 请求刷新场景，作用域取「调用方想要的」与「当前选中实际需要的」并集：选中状态会影响哪些对象
 */
function requestSceneRefresh(refreshScope: any) {
  const detectedScope = currentLightScope();
  const scopes = new Set([refreshScope, detectedScope].filter(Boolean));
  if (scopes.size) {
    if (scopes.has("all")) {
      applySceneRefresh({
        scope: "all",
        preserveLightCache: true
      });
      return;
    }
    for (const pendingScope of scopes) {
      applySceneRefresh({
        scope: pendingScope,
        preserveLightCache: true
      });
    }
  }
}
/**
 * 按几何交点重新切分墙体，并把门窗栏杆重挂到切分后的墙上（原地改写场景）。每次墙体几何
 */
function refreshSplitGeometry() {
  const recomputedGeometry = splitWallsWithOpenings(
    state.activeScene.walls,
    state.activeScene.windows,
    state.activeScene.doors,
    currentPixelsPerMeter() || 1,
    state.activeScene.railings
  );
  state.activeScene.walls = recomputedGeometry.walls;
  state.activeScene.windows = recomputedGeometry.windows;
  state.activeScene.doors = recomputedGeometry.doors;
  state.activeScene.railings = recomputedGeometry.railings;
}
/**
 * 合并共线的相邻墙段，并把门窗栏杆重挂到合并后的墙上。容差 1e-6 米（1 微米）：只吃吸附与
 */
function mergeCollinearWalls() {
  const wallById = new Map(state.activeScene.walls.map((indexedWall: any) => [indexedWall.id, indexedWall]));
  const merged = mergeCollinearWallSegments(state.activeScene.walls, 0.000001);
  if (merged.walls.length === state.activeScene.walls.length) {
    return 0;
  }
  const mergedWallById = new Map(
    merged.walls.map((mergedEntryWall: any) => [mergedEntryWall.id, mergedEntryWall])
  );
  /**
   * 把挂在旧墙上的附件按 wallIdMap 重挂到合并后的新墙。三个前置条件（新墙 id、旧墙对象、
   */
  const remapMergedAttachment = (wallAttachment: any) => {
    const newWallId = merged.wallIdMap.get(wallAttachment.wallId);
    const oldWall = wallById.get(wallAttachment.wallId);
    const newWall = mergedWallById.get(newWallId);
    if (!newWallId || !oldWall || !newWall) {
      return wallAttachment;
    }
    const remappedAttachment = remapWallAttachment(wallAttachment, oldWall, newWall);
    remappedAttachment.t = clampWindowT(newWall, remappedAttachment, currentPixelsPerMeter() || 1);
    return remappedAttachment;
  };
  const removedWallCount = state.activeScene.walls.length - merged.walls.length;
  state.activeScene.walls = merged.walls;
  state.activeScene.windows = state.activeScene.windows.map(remapMergedAttachment);
  state.activeScene.doors = state.activeScene.doors.map(remapMergedAttachment);
  state.activeScene.railings = state.activeScene.railings.map(remapMergedAttachment);
  return removedWallCount;
}
/**
 * 在改动文档前压入一条撤销快照，并清空重做栈。栈上限 40 步：再多也几乎没人会连点 40 次
 */
function pushHistorySnapshot() {
  state.undoStack.push(cloneSceneForHistory());
  if (state.undoStack.length > 40) {
    state.undoStack.shift();
  }
  state.redoStack = [];
}
function pushHistoryEntry(snapshotScene: any) {
  state.undoStack.push(snapshotScene);
  if (state.undoStack.length > 40) {
    state.undoStack.shift();
  }
  state.redoStack = [];
}
/**
 * 把一份场景快照套用为当前场景（撤销与重做的共同出口）。快照先过 normalizeScene 归一
 */
async function applySceneSnapshot(rawScene: any) {
  state.activeScene = normalizeScene(rawScene);
  const snapshotFloorRecord = getCurrentFloor();
  if (snapshotFloorRecord) {
    snapshotFloorRecord.scene = state.activeScene;
  }
  state.viewTransform.rotation = state.activeScene.settings.planViewRotation;
  clearSelection();
  resetScaleInteractionState();
  await loadBackgroundTexture();
  refreshStudio();
  markDocumentDirty();
}
/**
 * 撤销一步：先把当前状态压入重做栈，再取出撤销栈顶快照套用。
 */
async function undo() {
  if (state.historyBusy || !state.undoStack.length) {
    return;
  }
  state.historyBusy = !0;
  try {
    state.redoStack.push(cloneSceneForHistory());
    const undoSnapshot = state.undoStack.pop();
    await applySceneSnapshot(undoSnapshot);
  } finally {
    // 套用失败也必须放闩：闩卡住的话之后所有撤销都静默失效，且界面上没有任何提示。
    state.historyBusy = !1;
  }
}
/**
 * 重做一步：先把当前状态压回撤销栈，再取出重做栈顶快照套用。
 */
async function redo() {
  if (state.historyBusy || !state.redoStack.length) {
    return;
  }
  state.historyBusy = !0;
  try {
    state.undoStack.push(cloneSceneForHistory());
    const redoSnapshot = state.redoStack.pop();
    await applySceneSnapshot(redoSnapshot);
  } finally {
    state.historyBusy = !1;
  }
}
function applyHistoryShortcut(shortcutEvent: any) {
  if (shortcutEvent.repeat) {
    return;
  }
  (shortcutEvent.shiftKey ? redo : undo)();
}
/**
 * 载入一份草稿记录（首次打开、冲突后切换版本、埋点刷新都走这里）。sceneLoadToken 自增做竞态守卫，
 */
async function loadStudioRecord(record: any) {
  const loadToken = ++state.sceneLoadToken;
  window.clearTimeout(state.deferredModelTimer);
  state.deferredModelTimer = null;
  state.deferredModelTypes = [];
  state.areExternalModelsDeferred = false;
  state.savedSceneRecord = record;
  const preparedScene = stageStartup
    ? prepareSceneDocument(record, stageStartup.cache.peek(stageStartup.key), normalizeStudioDocument)
    : null;
  state.studioDocument = preparedScene ? preparedScene.document : normalizeStudioDocument(record.scene);
  if (preparedScene) {
    loadTiming(preparedScene.reused ? "scene-preparation-reused" : "scene-preparation-built");
    if (!preparedScene.reused) {
      // 写回缓存：下一次打开就能命中。异步、静默，写不进去只是下次还要重新归一。
      stageStartup!.cache.schedule(stageStartup!.key, record, state.studioDocument);
    }
  }
  if (isStageViewerMode) {
    for (const livePreviewFloor of state.studioDocument.floors) {
      livePreviewFloor.scene.settings.livePreviewEnabled = true;
    }
  }
  applyBaseLightingSettings(state.studioDocument.baseLighting);
  state.activeFloorId = state.studioDocument.activeFloorId;
  if (isAutoDiagramEmbed && floorSelectionParam !== null) {
    const selectedFloor = state.studioDocument.floors.find(
      (selectedFloorParam: any) => selectedFloorParam.id === floorSelectionParam
    );
    if (floorSelectionParam === "all" && state.studioDocument.floors.length > 1) {
      state.studioDocument.previewFloorMode = "all";
    } else if (selectedFloor) {
      state.studioDocument.previewFloorMode = "active";
      state.studioDocument.activeFloorId = selectedFloor.id;
      state.activeFloorId = selectedFloor.id;
    }
  }
  state.activeScene = getCurrentFloor().scene;
  state.activeLightGroupId = "";
  clearSelection();
  resetScaleInteractionState();
  state.undoStack = [];
  state.redoStack = [];
  const modelTypeList = currentFloorModelTypes();
  const isEmbedded = isAutoDiagramEmbed;
  if (isEmbedded) {
    state.isAutoDiagramLoading = true;
  }
  let embedLoadPromises = [];
  if (isEmbedded) {
    embedLoadPromises = modelTypeList.map(pendingModelType =>
      loadExternalItemModel(pendingModelType)
    );
  }
  state.areExternalModelsDeferred = !isEmbedded;
  state.deferredModelTypes = isEmbedded ? [] : modelTypeList;
  if (!isEmbedded) {
    scheduleDeferredModelLoad();
  }
  updateModelLoadingStatus();
  syncPreviewFloorButtons();
  updateFloorAlignmentControls();
  state.viewTransform.rotation = state.activeScene.settings.planViewRotation;
  await loadBackgroundTexture();
  refreshStudio(isEmbedded ? "none" : "all");
  if (!isEmbedded) {
    scheduleLightPrecompile(1200);
  }
  if (isEmbedded) {
    try {
      const loadPromise = Promise.allSettled(embedLoadPromises);
      await Promise.race([loadPromise, new Promise(resolve => window.setTimeout(resolve, 3500))]);
      Promise.allSettled(embedLoadPromises).then(() => {
        if (loadToken === state.sceneLoadToken) {
          forcePreviewRebuild();
        }
      });
    } finally {
      if (loadToken === state.sceneLoadToken) {
        window.clearTimeout(state.precompileRenderTimer);
        state.precompileRenderTimer = null;
        state.isAutoDiagramLoading = false;
        updateModelLoadingStatus();
      }
    }
  } else {
    applySceneRefresh({
      force: true
    });
    Promise.allSettled(embedLoadPromises).then(() => {
      if (loadToken === state.sceneLoadToken) {
        forcePreviewRebuild();
      }
    });
  }
  resizePlanCanvas();
  fitViewToBounds();
  if (!isEmbedded) {
    requestAnimationFrame(() => {
      if (savedCameraView()) {
        restoreStoredCameraView({
          recordChange: false,
          silent: true
        });
      } else {
        applyCameraMode(currentCameraMode(), {
          preserveView: false
        });
        resetCameraView();
      }
    });
  }
}
/**
 * 「稍后处理」：收起对话框，但冲突记录留着。这是三条出路里唯一不丢东西的一条 ——
 */
function deferSaveConflict() {
  if (!state.saveConflict) {
    saveConflictDialogElement.close();
    return;
  }
  state.saveConflictDeferred = true;
  setSaveState("等待处理保存冲突", "error");
  setSaveConflictPendingUi(true);
  saveConflictDialogElement.close();
}
/**
 * 冲突已按用户选择处理掉：清记录、撤掉界面上的常驻入口、关对话框。
 */
function resolveSaveConflict() {
  state.saveConflict = null;
  state.saveConflictDeferred = false;
  setSaveConflictPendingUi(false);
  saveConflictDialogElement.close();
}
/**
 * 「保留模型」：撤销这次删除，把模型放回原位 —— 模型回来后那几条绑定重新成立，保存自然通过。
 */
async function keepModelForInteraction() {
  if (!state.saveInteractionConfirmation) {
    saveInteractionDialogElement.close();
    return;
  }
  if (!state.undoStack.length || state.historyBusy) {
    deferSaveInteraction();
    return;
  }
  resolveSaveInteraction();
  await undo();
}
/**
 * 「稍后处理」：收起对话框，但确认记录留着、本地删除与撤销栈一点不动 —— 用户随时可以 Ctrl/Cmd+Z
 */
function deferSaveInteraction() {
  if (!state.saveInteractionConfirmation) {
    saveInteractionDialogElement.close();
    return;
  }
  state.saveInteractionDeferred = true;
  setSaveState("等待处理删除影响", "error");
  setSaveInteractionPendingUi(true);
  saveInteractionDialogElement.close();
}
/**
 * 「确认删除并保存」：带令牌、连同 428 当时捕获的**同一个 revision 与场景快照**重发，服务端才会
 */
async function confirmSaveInteraction() {
  const confirmation = state.saveInteractionConfirmation;
  if (!confirmation) {
    saveInteractionDialogElement.close();
    return;
  }
  if (state.isSaving) {
    return;
  }
  if (confirmation.localRevision !== state.changeRevision) {
    resolveSaveInteraction();
    saveStudioDraft();
    return;
  }
  // 用户这次是主动确认，不再处于「保留模型」的挂起态：失败时保持对话框与挂起记录（不放行自动保存），
  state.saveInteractionDeferred = false;
  state.isSaving = true;
  setSaveState("正在保存…", "saving");
  try {
    // 关键：revision 与 scene 都用 428 当时捕获的那一份，令牌是它们的哈希，换了就落不到同一份计划。
    state.savedSceneRecord = await putStudioScene(
      { revision: confirmation.revision },
      confirmation.scene,
      confirmation.token
    );
    resolveSaveInteraction();
    state.savedRevision = confirmation.localRevision;
    if (state.changeRevision === state.savedRevision) {
      setSaveState("已自动保存", "saved");
      showToast("已删除模型并同步清理交互配置。", "success");
    }
  } catch (saveRequestError: any) {
    if (saveRequestError.status === 428 && saveRequestError.code === "STUDIO3D_INTERACTION_CONFIRMATION") {
      // 期间场景或关联仪表盘变了：服务端回了新令牌，重新弹框（更新令牌），绝不静默重试。
      handleSaveInteractionConfirmation(
        saveRequestError.payload?.detail,
        confirmation.revision,
        confirmation.scene,
        confirmation.localRevision,
        {
          reopenDialog: true
        }
      );
      return;
    }
    if (saveRequestError.status === 409 && saveRequestError.code === "STUDIO3D_REVISION_CONFLICT") {
      // 重发期间草稿被别处更新：这次确认已作废，转交 409 冲突流程让用户选版本。
      resolveSaveInteraction();
      try {
        const remoteScene = await requestStudioApi("/studio3d");
        handleSaveConflict(remoteScene, snapshotDocumentForSave(), confirmation.localRevision, {
          reopenDialog: true
        });
      } catch (conflictLoadError: any) {
        setSaveState("保存失败", "error");
        showToast(conflictLoadError.message || "3D 草稿保存失败。", "error");
      }
      return;
    }
    window.HABridgeLog?.error?.(saveRequestError, {
      phase: "studio-save"
    });
    setSaveState("保存失败", "error");
    showToast(saveRequestError.message || "3D 草稿保存失败。", "error");
  } finally {
    state.isSaving = false;
    // 与 saveStudioDraft 同一口径：重发期间又落了新编辑（changeRevision 前进）且没有挂着的
    if (!state.saveConflict && !state.saveInteractionConfirmation && state.changeRevision !== state.savedRevision) {
      window.clearTimeout(state.autosaveTimer);
      state.autosaveTimer = window.setTimeout(saveStudioDraft, 500);
    }
  }
}
saveConflictDialogElement.addEventListener("cancel", (dialogCancelEvent: any) => {
  // ESC 不再是「按了没反应」：它等同于「稍后处理」—— 内容一点不丢、也不静默覆盖，
  dialogCancelEvent.preventDefault();
  deferSaveConflict();
});
saveConflictLaterButton.addEventListener("click", deferSaveConflict);
saveConflictReopenButton.addEventListener("click", () => {
  if (state.saveConflict) {
    openSaveConflictDialog();
  }
});
saveConflictLoadButton.addEventListener("click", async () => {
  const conflict = state.saveConflict;
  if (conflict) {
    resolveSaveConflict();
    try {
      await loadStudioRecord(conflict.latest);
      state.savedRevision = state.changeRevision;
      setSaveState("已加载服务器版本", "saved");
      showToast("已加载另一页面保存的户型，当前页面没有执行覆盖。", "success");
    } catch (serverLoadError: any) {
      setSaveState("载入失败", "error");
      showToast(serverLoadError.message || "服务器版本载入失败。", "error");
    }
  }
});
saveConflictOverwriteButton.addEventListener("click", () => {
  const overwriteConflict = state.saveConflict;
  if (overwriteConflict) {
    state.studioDocument = normalizeStudioDocument(overwriteConflict.localScene);
    state.activeFloorId = state.studioDocument.activeFloorId;
    state.activeScene = getCurrentFloor().scene;
    state.savedSceneRecord = overwriteConflict.latest;
    resolveSaveConflict();
    setSaveState("正在确认覆盖…", "saving");
    window.clearTimeout(state.autosaveTimer);
    state.autosaveTimer = window.setTimeout(saveStudioDraft, 0);
  }
});
saveInteractionDialogElement.addEventListener("cancel", (dialogCancelEvent: any) => {
  // ESC 与「保留模型」同义：收起对话框，本地删除与撤销栈一点不动，
  dialogCancelEvent.preventDefault();
  deferSaveInteraction();
});
saveInteractionKeepButton.addEventListener("click", keepModelForInteraction);
saveInteractionReopenButton.addEventListener("click", () => {
  if (state.saveInteractionConfirmation) {
    openSaveInteractionDialog();
  }
});
saveInteractionConfirmButton.addEventListener("click", confirmSaveInteraction);
/**
 * 把画布坐标绕视口中心旋转，得到屏幕上实际显示的位置。角度取负：document 里存的是
 */
function rotateScreenPoint(screenCoordinates: any) {
  const centerX = state.viewportWidthPx / 2;
  const centerY = state.viewportHeightPx / 2;
  const viewRotationRad = (-state.viewTransform.rotation * Math.PI) / 180;
  const cosRotation = Math.cos(viewRotationRad);
  const sinRotation = Math.sin(viewRotationRad);
  const offsetX = screenCoordinates.x - centerX;
  const offsetY = screenCoordinates.y - centerY;
  return {
    x: centerX + offsetX * cosRotation - offsetY * sinRotation,
    y: centerY + offsetX * sinRotation + offsetY * cosRotation
  };
}
/**
 * 画布坐标 → 平面坐标，是 planToScreen 与 rotateScreenPoint 的联合逆运算。顺序与正向
 */
function screenToPlan(screenPointToConvert: any) {
  const rotatedPoint = rotateScreenPoint(screenPointToConvert);
  return {
    x: (rotatedPoint.x - state.viewTransform.offsetX) / state.viewTransform.zoom,
    y: (rotatedPoint.y - state.viewTransform.offsetY) / state.viewTransform.zoom
  };
}
/**
 * 把指针事件的 client 坐标换算成画布局部坐标。用 getBoundingClientRect 而不是
 */
function canvasPointFromEvent(pointerEvent: any) {
  const canvasRect = planCanvasElement.getBoundingClientRect();
  return {
    x: pointerEvent.clientX - canvasRect.left,
    y: pointerEvent.clientY - canvasRect.top
  };
}
/**
 * 计算当前楼层内容的平面包围盒，供「适应视图」与初始取景使用。优先级是墙 → 家具 →
 */
function sceneModelBounds() {
  if (state.activeScene.walls.length) {
    return modelBounds({
      background: null,
      walls: state.activeScene.walls,
      items: []
    });
  } else if (state.activeScene.items.length) {
    return modelBounds({
      background: null,
      walls: [],
      items: state.activeScene.items
    });
  } else {
    return modelBounds(state.activeScene);
  }
}
function fitViewToBounds() {
  const bounds = sceneModelBounds();
  const padding = clamp(Math.min(state.viewportWidthPx, state.viewportHeightPx) * 0.045, 18, 34);
  const availableWidth = Math.max(state.viewportWidthPx - padding * 2, 80);
  const availableHeight = Math.max(state.viewportHeightPx - padding * 2, 80);
  const isQuarterTurn = Math.abs(state.viewTransform.rotation / 90) % 2 === 1;
  const contentWidth = isQuarterTurn ? bounds.height : bounds.width;
  const contentHeight = isQuarterTurn ? bounds.width : bounds.height;
  state.viewTransform.zoom = clamp(
    Math.min(availableWidth / contentWidth, availableHeight / contentHeight),
    0.03,
    8
  );
  state.viewTransform.offsetX =
    state.viewportWidthPx / 2 - (bounds.minX + bounds.width / 2) * state.viewTransform.zoom;
  state.viewTransform.offsetY =
    state.viewportHeightPx / 2 - (bounds.minY + bounds.height / 2) * state.viewTransform.zoom;
  state.isViewFitted = true;
  renderPlanView();
}
/**
 * 以某个屏幕点为锚点缩放平面视图（滚轮缩放）。记下锚点对应的平面坐标与旋转后屏幕坐标，改完
 */
function zoomViewAt(
  factor: any,
  anchorPoint = {
    x: state.viewportWidthPx / 2,
    y: state.viewportHeightPx / 2
  }
) {
  const planAnchor = screenToPlan(anchorPoint);
  const screenAnchor = rotateScreenPoint(anchorPoint);
  state.viewTransform.zoom = clamp(state.viewTransform.zoom * factor, 0.03, 12);
  state.viewTransform.offsetX = screenAnchor.x - planAnchor.x * state.viewTransform.zoom;
  state.viewTransform.offsetY = screenAnchor.y - planAnchor.y * state.viewTransform.zoom;
  renderPlanView();
}
function rotatePlanView() {
  state.viewTransform.rotation = (state.viewTransform.rotation + 90) % 360;
  state.activeScene.settings.planViewRotation = state.viewTransform.rotation;
  fitViewToBounds();
  markDocumentDirty();
}
/**
 * 按容器尺寸重设画布分辨率与绘制上下文（窗口 resize、侧栏折叠时调用）。设备像素比封顶 2：
 */
function resizePlanCanvas() {
  const stageRect = planStageElement.getBoundingClientRect();
  state.viewportWidthPx = Math.max(Math.round(stageRect.width), 1);
  state.viewportHeightPx = Math.max(Math.round(stageRect.height), 1);
  const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
  planCanvasElement.width = Math.round(state.viewportWidthPx * pixelRatio);
  planCanvasElement.height = Math.round(state.viewportHeightPx * pixelRatio);
  planContext.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  if (state.isViewFitted) {
    renderPlanView();
  } else {
    fitViewToBounds();
  }
}
/**
 * 取（并缓存）墙体两两之间的交点，供墙端清理与绘制吸附使用。
 */
function wallIntersectionsForWalls(intersectionToleranceMeters: any) {
  const intersectionDerived = wallDerivedData(intersectionToleranceMeters);
  intersectionDerived.intersections ||= wallIntersections(state.activeScene.walls);
  return intersectionDerived.intersections;
}
/**
 * 取（并缓存）没有闭合的墙端点，用于提示「这一圈墙还没围成房间」。判定依赖楼板多边形：
 */
function unclosedEndpointsForWalls(endpointToleranceMeters: any) {
  const endpointDerived = wallDerivedData(endpointToleranceMeters);
  endpointDerived.unclosedEndpoints ||= unclosedWallEndpoints(
    state.activeScene.walls,
    endpointDerived.tolerance,
    floorPolygonsForWalls(endpointToleranceMeters)
  );
  return endpointDerived.unclosedEndpoints;
}
/**
 * 算出门 / 窗 / 栏杆在平面上的落位：中心点、两端点与墙方向单位向量。洞口位置以「沿墙比例 t」
 */
function openingPlacementInfo(opening: any) {
  const hostWallRecord = state.activeScene.walls.find((hostWall: any) => hostWall.id === opening.wallId);
  if (!hostWallRecord) {
    return null;
  }
  const deltaX = hostWallRecord.end.x - hostWallRecord.start.x;
  const deltaY = hostWallRecord.end.y - hostWallRecord.start.y;
  const wallLengthPlan = Math.hypot(deltaX, deltaY);
  if (!wallLengthPlan) {
    return null;
  }
  const clampedT = clampWindowT(hostWallRecord, opening, currentPixelsPerMeter() || 1);
  const position = {
    x: hostWallRecord.start.x + deltaX * clampedT,
    y: hostWallRecord.start.y + deltaY * clampedT
  };
  const halfWidthPlan = Math.min(
    (opening.width * (currentPixelsPerMeter() || 1)) / 2,
    wallLengthPlan / 2
  );
  const direction = {
    x: deltaX / wallLengthPlan,
    y: deltaY / wallLengthPlan
  };
  return {
    wall: hostWallRecord,
    center: position,
    start: {
      x: position.x - direction.x * halfWidthPlan,
      y: position.y - direction.y * halfWidthPlan
    },
    end: {
      x: position.x + direction.x * halfWidthPlan,
      y: position.y + direction.y * halfWidthPlan
    },
    unit: direction
  };
}
/**
 * 在平面图上绘制一段栏杆（三层描边 + 两端圆点 + 选中时的浮动标签）。最外层用近黑色、宽度为
 */
function drawPlanRailing(railing: any, railingOptions: any = {}) {
  const railingPlacement = openingPlacementInfo(railing);
  if (!railingPlacement) {
    return;
  }
  const isRailingSelected = isSelected("railing", railing.id);
  const railingStrokeColor = railingOptions.preview
    ? "rgba(123, 220, 240, .72)"
    : isRailingSelected
      ? PLAN_ACCENT_BRIGHT()
      : "#8bd7e8";
  const railingOutlineWidthPx = Math.max(
    10,
    railingPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * state.viewTransform.zoom + 5
  );
  drawPlanLine(railingPlacement.start, railingPlacement.end, {
    color: "rgba(7, 16, 21, .94)",
    width: railingOutlineWidthPx,
    cap: "butt"
  });
  drawPlanLine(railingPlacement.start, railingPlacement.end, {
    color: railingStrokeColor,
    width: isRailingSelected ? 5 : 3,
    cap: "butt"
  });
  drawPlanLine(railingPlacement.start, railingPlacement.end, {
    color: "rgba(224, 250, 255, .72)",
    width: 1,
    cap: "butt"
  });
  drawPlanPoint(railingPlacement.start, railingStrokeColor, isRailingSelected ? 3 : 2);
  drawPlanPoint(railingPlacement.end, railingStrokeColor, isRailingSelected ? 3 : 2);
  if (isRailingSelected && !railingOptions.preview) {
    drawFloatingLabel(
      railingPlacement.center,
      "玻璃栏杆 · " + railing.width.toFixed(2) + " m",
      "#8bd7e8"
    );
  }
}
function drawPlanDoor(door: any, doorOptions: any = {}) {
  const doorPlacement = openingPlacementInfo(door);
  if (!doorPlacement) {
    return;
  }
  const isDoorSelected = isSelected("door", door.id);
  const doorType = door.doorType || "solid";
  const doorStrokeColor = doorOptions.preview
    ? "rgba(255, 189, 110, .76)"
    : isDoorSelected
      ? PLAN_ACCENT_BRIGHT()
      : ["solid", "double", "entry", "roller-shutter", "frame-only"].includes(doorType)
        ? "#edf2f7"
        : "#bfe9ff";
  const doorOutlineWidthPx = Math.max(
    10,
    doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * state.viewTransform.zoom + 5
  );
  drawPlanLine(doorPlacement.start, doorPlacement.end, {
    color: "rgba(7, 16, 21, .94)",
    width: doorOutlineWidthPx,
    cap: "butt"
  });
  if (doorType === "frame-only") {
    const frameNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    const frameJambHalfWidthPx = Math.max(
      5 / state.viewTransform.zoom,
      doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * 0.55
    );
    for (const frameJambPoint of [doorPlacement.start, doorPlacement.end]) {
      drawPlanLine(
        {
          x: frameJambPoint.x - frameNormal.x * frameJambHalfWidthPx,
          y: frameJambPoint.y - frameNormal.y * frameJambHalfWidthPx
        },
        {
          x: frameJambPoint.x + frameNormal.x * frameJambHalfWidthPx,
          y: frameJambPoint.y + frameNormal.y * frameJambHalfWidthPx
        },
        {
          color: doorStrokeColor,
          width: isDoorSelected ? 4 : 3,
          cap: "butt"
        }
      );
    }
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "仅门框 · " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  if (doorType === "sliding-glass") {
    const panelNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    const panelOffsetPx = Math.max(
      2.5 / state.viewTransform.zoom,
      doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * 0.16
    );
    const openingLengthPx = distance(doorPlacement.start, doorPlacement.end);
    const hingeDirection = door.hinge === "right" ? 1 : -1;
    // 两扇门板分别贴在墙的两个面上；「内外翻转」就是交换哪一扇在哪个面。
    const panelFlipSign = door.swing === -1 ? -1 : 1;
    const panelCenters = slidingDoorPanelCenters(openingLengthPx, hingeDirection);
    const panelHalfWidthPx = openingLengthPx * 0.27;
    for (const [panelCenterOffset, panelSideSign] of [
      [panelCenters.fixed, -panelFlipSign],
      [panelCenters.moving, panelFlipSign]
    ]) {
      const panelCenterPoint = {
        x: doorPlacement.center.x + doorPlacement.unit.x * panelCenterOffset,
        y: doorPlacement.center.y + doorPlacement.unit.y * panelCenterOffset
      };
      const panelNormalOffset = {
        x: panelNormal.x * panelOffsetPx * panelSideSign,
        y: panelNormal.y * panelOffsetPx * panelSideSign
      };
      const panelStartPoint = {
        x: panelCenterPoint.x - doorPlacement.unit.x * panelHalfWidthPx + panelNormalOffset.x,
        y: panelCenterPoint.y - doorPlacement.unit.y * panelHalfWidthPx + panelNormalOffset.y
      };
      const panelEndPoint = {
        x: panelCenterPoint.x + doorPlacement.unit.x * panelHalfWidthPx + panelNormalOffset.x,
        y: panelCenterPoint.y + doorPlacement.unit.y * panelHalfWidthPx + panelNormalOffset.y
      };
      drawPlanLine(panelStartPoint, panelEndPoint, {
        color: doorStrokeColor,
        width: isDoorSelected ? 4 : 3,
        cap: "butt"
      });
      drawPlanPoint(panelSideSign < 0 ? panelEndPoint : panelStartPoint, doorStrokeColor, 2);
    }
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "玻璃推拉门 · " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  if (doorType === "roller-shutter") {
    const shutterNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    const shutterOffsetPx =
      Math.max(
        2 / state.viewTransform.zoom,
        doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * 0.08
      ) * (door.swing === -1 ? -1 : 1);
    drawPlanLine(
      {
        x: doorPlacement.start.x + shutterNormal.x * shutterOffsetPx,
        y: doorPlacement.start.y + shutterNormal.y * shutterOffsetPx
      },
      {
        x: doorPlacement.end.x + shutterNormal.x * shutterOffsetPx,
        y: doorPlacement.end.y + shutterNormal.y * shutterOffsetPx
      },
      {
        color: doorStrokeColor,
        width: isDoorSelected ? 5 : 4,
        cap: "butt"
      }
    );
    const shutterLengthPx = distance(doorPlacement.start, doorPlacement.end);
    const slatCount = Math.max(3, Math.min(18, Math.round(door.width / 0.35)));
    for (let slatIndex = 1; slatIndex < slatCount; slatIndex += 1) {
      const slatOffset = shutterLengthPx * (slatIndex / slatCount - 0.5);
      const slatPoint = {
        x:
          doorPlacement.center.x +
          doorPlacement.unit.x * slatOffset +
          shutterNormal.x * shutterOffsetPx,
        y:
          doorPlacement.center.y +
          doorPlacement.unit.y * slatOffset +
          shutterNormal.y * shutterOffsetPx
      };
      drawPlanLine(
        {
          x: slatPoint.x - (shutterNormal.x * 3) / state.viewTransform.zoom,
          y: slatPoint.y - (shutterNormal.y * 3) / state.viewTransform.zoom
        },
        {
          x: slatPoint.x + (shutterNormal.x * 3) / state.viewTransform.zoom,
          y: slatPoint.y + (shutterNormal.y * 3) / state.viewTransform.zoom
        },
        {
          color: "rgba(167, 178, 188, .72)",
          width: 1,
          cap: "butt"
        }
      );
    }
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "卷帘门 · " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  if (doorType === "entry") {
    const entryNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    // 内外翻转 = 把这一对门带以墙中心线镜像，整体换到墙的另一面。
    const entryFlipSign = door.swing === -1 ? -1 : 1;
    const entryOffsetPx =
      Math.max(
        2 / state.viewTransform.zoom,
        doorPlacement.wall.thickness * (currentPixelsPerMeter() || 100) * 0.08
      ) * entryFlipSign;
    drawPlanLine(
      {
        x: doorPlacement.start.x + entryNormal.x * entryOffsetPx,
        y: doorPlacement.start.y + entryNormal.y * entryOffsetPx
      },
      {
        x: doorPlacement.end.x + entryNormal.x * entryOffsetPx,
        y: doorPlacement.end.y + entryNormal.y * entryOffsetPx
      },
      {
        color: doorStrokeColor,
        width: doorOptions.preview ? 3 : isDoorSelected ? 5 : 4,
        cap: "butt"
      }
    );
    drawPlanLine(
      {
        x: doorPlacement.start.x - entryNormal.x * entryOffsetPx,
        y: doorPlacement.start.y - entryNormal.y * entryOffsetPx
      },
      {
        x: doorPlacement.end.x - entryNormal.x * entryOffsetPx,
        y: doorPlacement.end.y - entryNormal.y * entryOffsetPx
      },
      {
        color: "rgba(167, 178, 188, .72)",
        width: 1,
        cap: "butt"
      }
    );
    const entryHandleDirection = door.hinge === "right" ? -1 : 1;
    drawPlanPoint(
      {
        x: doorPlacement.center.x + doorPlacement.unit.x * door.width * entryHandleDirection * 0.34,
        y: doorPlacement.center.y + doorPlacement.unit.y * door.width * entryHandleDirection * 0.34
      },
      doorStrokeColor,
      isDoorSelected ? 3 : 2
    );
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "入户门（常闭）· " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  if (doorType === "double") {
    const doubleDoorNormal = {
      x: -doorPlacement.unit.y,
      y: doorPlacement.unit.x
    };
    const doubleSwingSign = door.swing === -1 ? -1 : 1;
    const leafOffsetPx = (distance(doorPlacement.start, doorPlacement.end) / 2) * doubleSwingSign;
    const firstLeafPoint = {
      x: doorPlacement.start.x + doubleDoorNormal.x * leafOffsetPx,
      y: doorPlacement.start.y + doubleDoorNormal.y * leafOffsetPx
    };
    const secondLeafPoint = {
      x: doorPlacement.end.x + doubleDoorNormal.x * leafOffsetPx,
      y: doorPlacement.end.y + doubleDoorNormal.y * leafOffsetPx
    };
    drawPlanLine(doorPlacement.start, firstLeafPoint, {
      color: doorStrokeColor,
      width: doorOptions.preview ? 2 : isDoorSelected ? 4 : 3,
      cap: "butt"
    });
    drawPlanLine(doorPlacement.end, secondLeafPoint, {
      color: doorStrokeColor,
      width: doorOptions.preview ? 2 : isDoorSelected ? 4 : 3,
      cap: "butt"
    });
    drawPlanPoint(doorPlacement.start, doorStrokeColor, isDoorSelected ? 3.5 : 2.5);
    drawPlanPoint(doorPlacement.end, doorStrokeColor, isDoorSelected ? 3.5 : 2.5);
    if (isDoorSelected) {
      drawFloatingLabel(
        doorPlacement.center,
        "双开门 · " + door.width.toFixed(2) + " m",
        PLAN_ACCENT_BRIGHT()
      );
    }
    return;
  }
  const isRightHinged = door.hinge === "right";
  const hingePoint = isRightHinged ? doorPlacement.end : doorPlacement.start;
  const freePoint = isRightHinged ? doorPlacement.start : doorPlacement.end;
  const doorVector = {
    x: freePoint.x - hingePoint.x,
    y: freePoint.y - hingePoint.y
  };
  const swingSign = door.swing === -1 ? -1 : 1;
  const swingEndPoint = {
    x: hingePoint.x - doorVector.y * swingSign,
    y: hingePoint.y + doorVector.x * swingSign
  };
  drawPlanLine(hingePoint, swingEndPoint, {
    color: doorStrokeColor,
    width: doorOptions.preview ? 2 : isDoorSelected ? 4 : 3,
    cap: "butt",
    dash: doorOptions.preview ? [5, 4] : undefined
  });
  if (doorType === "glass") {
    const glassInsetVector = {
      x: (doorPlacement.unit.x * 3) / state.viewTransform.zoom,
      y: (doorPlacement.unit.y * 3) / state.viewTransform.zoom
    };
    drawPlanLine(
      {
        x: hingePoint.x + glassInsetVector.x,
        y: hingePoint.y + glassInsetVector.y
      },
      {
        x: swingEndPoint.x + glassInsetVector.x,
        y: swingEndPoint.y + glassInsetVector.y
      },
      {
        color: "rgba(183, 229, 247, .58)",
        width: 1,
        cap: "butt"
      }
    );
  }
  const hingeScreenPoint = planToScreen(hingePoint);
  const doorRadiusPx = distance(hingePoint, freePoint) * state.viewTransform.zoom;
  const doorStartAngleRad = Math.atan2(doorVector.y, doorVector.x);
  const doorEndAngleRad = doorStartAngleRad + (swingSign * Math.PI) / 2;
  planContext.save();
  planContext.strokeStyle = doorStrokeColor;
  planContext.lineWidth = doorOptions.preview ? 1 : isDoorSelected ? 2 : 1.25;
  if (doorOptions.preview) {
    planContext.setLineDash([5, 4]);
  }
  planContext.beginPath();
  planContext.arc(
    hingeScreenPoint.x,
    hingeScreenPoint.y,
    doorRadiusPx,
    doorStartAngleRad,
    doorEndAngleRad,
    swingSign < 0
  );
  planContext.stroke();
  planContext.restore();
  drawPlanPoint(hingePoint, doorStrokeColor, isDoorSelected ? 3.5 : 2.5);
  if (isDoorSelected) {
    drawFloatingLabel(
      doorPlacement.center,
      "" + (doorType === "glass" ? "玻璃门 · " : "") + door.width.toFixed(2) + " m",
      PLAN_ACCENT_BRIGHT()
    );
  }
}

/**
 * 把物件的局部坐标（以物件中心为原点、未旋转）换算成平面坐标，就是一次绕物件中心的
 */
function rotateLocalToPlan(rotatingItem: any, localX: any, localY: any) {
  const rotationRad = ((Number(rotatingItem.rotation) || 0) * Math.PI) / 180;
  return {
    x: rotatingItem.x + localX * Math.cos(rotationRad) - localY * Math.sin(rotationRad),
    y: rotatingItem.y + localX * Math.sin(rotationRad) + localY * Math.cos(rotationRad)
  };
}
/**
 * 算出选中物件在平面上的控制点：四角缩放手柄 + 顶部旋转手柄。手柄位置先按物件半宽 / 半深算出
 */
function itemControlHandles(handleItem: any) {
  const pixelsPerMeter = currentPixelsPerMeter() || 100;
  const handleFootprint = itemPlanFootprint(handleItem);
  /**
   * 控制点相对物件中心的横向半宽，单位像素。
   */
  const controlHalfWidthPlan = (handleFootprint.width * pixelsPerMeter) / 2;
  /**
   * 控制点相对物件中心的纵向半深，单位像素。
   */
  const halfDepthPlan = (handleFootprint.depth * pixelsPerMeter) / 2;
  return {
    corners: [
      {
        x: -1,
        y: -1
      },
      {
        x: 1,
        y: -1
      },
      {
        x: 1,
        y: 1
      },
      {
        x: -1,
        y: 1
      }
    ].map(corner => ({
      ...corner,
      point: rotateLocalToPlan(
        handleItem,
        corner.x * controlHalfWidthPlan,
        corner.y * halfDepthPlan
      ),
      opposite: rotateLocalToPlan(
        handleItem,
        -corner.x * controlHalfWidthPlan,
        -corner.y * halfDepthPlan
      )
    })),
    rotationStem: rotateLocalToPlan(handleItem, 0, -halfDepthPlan),
    rotationHandle: rotateLocalToPlan(
      handleItem,
      0,
      -halfDepthPlan - 17 / Math.max(state.viewTransform.zoom, 0.01)
    )
  };
}
/**
 * 手柄拾取：判断平面点击是否落在选中物件的旋转手柄或角点缩放手柄上。只在「选择工具 + 恰好单选一个物件」时生效
 */
function hitTestItemHandle(hitPlanPoint: any) {
  if (state.activeTool !== "select" || state.primarySelection?.kind !== "item" || state.multiSelection.length) {
    return null;
  }
  const hitItem = findSelectedEntity();
  if (!hitItem) {
    return null;
  }
  const itemControls = itemControlHandles(hitItem);
  const handleHitRadiusPx = 9 / Math.max(state.viewTransform.zoom, 0.01);
  if (distance(hitPlanPoint, itemControls.rotationHandle) <= handleHitRadiusPx) {
    return {
      type: "rotate-item",
      item: hitItem,
      controls: itemControls
    };
  }
  const cornerHandle = itemControls.corners.find(
    handleCandidate => distance(hitPlanPoint, handleCandidate.point) <= handleHitRadiusPx
  );
  if (cornerHandle) {
    return {
      type: "resize-item",
      item: hitItem,
      controls: itemControls,
      corner: cornerHandle
    };
  } else {
    return null;
  }
}
/**
 * 由任意两个点构造轴对齐包围盒（不要求两点有序）。框选、橡皮筋矩形等都从「按下点 +
 */
function boundsFromPoints(firstPoint: any, secondPoint: any) {
  return {
    minX: Math.min(firstPoint.x, secondPoint.x),
    minY: Math.min(firstPoint.y, secondPoint.y),
    maxX: Math.max(firstPoint.x, secondPoint.x),
    maxY: Math.max(firstPoint.y, secondPoint.y)
  };
}
/**
 * 框选命中测试：列出与矩形框相交 / 落入框内的所有实体。线性实体（墙、门窗、栏杆）用
 */
function collectEntitiesInMarquee(marqueeStart: any, marqueeEnd: any) {
  const marqueeBounds = boundsFromPoints(marqueeStart, marqueeEnd);
  const marqueePixelsPerMeter = currentPixelsPerMeter() || 100;
  const hitEntities = [];
  const isLightPlanTab = state.activeAssetTab === "light";
  if (!isLightPlanTab) {
    for (const marqueeWall of state.activeScene.walls) {
      if (segmentIntersectsBounds(marqueeWall.start, marqueeWall.end, marqueeBounds)) {
        hitEntities.push({
          kind: "wall",
          id: marqueeWall.id
        });
      }
    }
    for (const marqueeWindow of state.activeScene.windows) {
      const marqueeWindowPlacement = openingPlacementInfo(marqueeWindow);
      if (
        marqueeWindowPlacement &&
        segmentIntersectsBounds(
          marqueeWindowPlacement.start,
          marqueeWindowPlacement.end,
          marqueeBounds
        )
      ) {
        hitEntities.push({
          kind: "window",
          id: marqueeWindow.id
        });
      }
    }
    for (const marqueeDoor of state.activeScene.doors) {
      const marqueeDoorPlacement = openingPlacementInfo(marqueeDoor);
      if (
        marqueeDoorPlacement &&
        segmentIntersectsBounds(marqueeDoorPlacement.start, marqueeDoorPlacement.end, marqueeBounds)
      ) {
        hitEntities.push({
          kind: "door",
          id: marqueeDoor.id
        });
      }
    }
    for (const marqueeRailing of state.activeScene.railings) {
      const marqueeRailingPlacement = openingPlacementInfo(marqueeRailing);
      if (
        marqueeRailingPlacement &&
        segmentIntersectsBounds(
          marqueeRailingPlacement.start,
          marqueeRailingPlacement.end,
          marqueeBounds
        )
      ) {
        hitEntities.push({
          kind: "railing",
          id: marqueeRailing.id
        });
      }
    }
  }
  const marqueeCorners = [
    {
      x: marqueeBounds.minX,
      y: marqueeBounds.minY
    },
    {
      x: marqueeBounds.maxX,
      y: marqueeBounds.minY
    },
    {
      x: marqueeBounds.maxX,
      y: marqueeBounds.maxY
    },
    {
      x: marqueeBounds.minX,
      y: marqueeBounds.maxY
    }
  ];
  for (const marqueeItem of state.activeScene.items) {
    if (LIGHT_ITEM_TYPES.has(marqueeItem.type) !== isLightPlanTab) {
      continue;
    }
    const marqueeItemRotationRad = (marqueeItem.rotation * Math.PI) / 180;
    const marqueeCosRotation = Math.cos(marqueeItemRotationRad);
    const marqueeSinRotation = Math.sin(marqueeItemRotationRad);
    const marqueeItemFootprint = itemPlanFootprint(marqueeItem);
    const marqueeHalfWidthPlan = (marqueeItemFootprint.width * marqueePixelsPerMeter) / 2;
    const marqueeHalfDepthPlan = (marqueeItemFootprint.depth * marqueePixelsPerMeter) / 2;
    const marqueeItemCorners = [
      [-marqueeHalfWidthPlan, -marqueeHalfDepthPlan],
      [marqueeHalfWidthPlan, -marqueeHalfDepthPlan],
      [marqueeHalfWidthPlan, marqueeHalfDepthPlan],
      [-marqueeHalfWidthPlan, marqueeHalfDepthPlan]
    ].map(([cornerLocalX, cornerLocalY]) => ({
      x: marqueeItem.x + cornerLocalX * marqueeCosRotation - cornerLocalY * marqueeSinRotation,
      y: marqueeItem.y + cornerLocalX * marqueeSinRotation + cornerLocalY * marqueeCosRotation
    }));
    if (
      pointInBounds(marqueeItem, marqueeBounds) ||
      marqueeItemCorners.some(itemCorner => pointInBounds(itemCorner, marqueeBounds)) ||
      marqueeCorners.some(marqueeCorner =>
        pointInRotatedRectangle(
          marqueeCorner,
          itemWithPlanFootprint(marqueeItem),
          marqueePixelsPerMeter
        )
      )
    ) {
      hitEntities.push({
        kind: "item",
        id: marqueeItem.id
      });
    }
  }
  return hitEntities;
}
function syncMetricsCanvas() {
  if (!planCanvasElement.width || !planCanvasElement.height || !metricsContext) {
    return false;
  } else {
    if (metricsCanvas.width !== planCanvasElement.width) {
      metricsCanvas.width = planCanvasElement.width;
    }
    if (metricsCanvas.height !== planCanvasElement.height) {
      metricsCanvas.height = planCanvasElement.height;
    }
    metricsContext.setTransform(1, 0, 0, 1, 0, 0);
    metricsContext.clearRect(0, 0, metricsCanvas.width, metricsCanvas.height);
    metricsContext.drawImage(planCanvasElement, 0, 0);
    return true;
  }
}
function blitMetricsCanvas({ offsetX: metricsOffsetX = 0, offsetY: metricsOffsetY = 0 } = {}) {
  if (
    !metricsCanvas.width ||
    !metricsCanvas.height ||
    metricsCanvas.width !== planCanvasElement.width ||
    metricsCanvas.height !== planCanvasElement.height
  ) {
    return false;
  }
  const metricsScaleX = planCanvasElement.width / Math.max(state.viewportWidthPx, 1);
  const metricsScaleY = planCanvasElement.height / Math.max(state.viewportHeightPx, 1);
  planContext.save();
  planContext.setTransform(1, 0, 0, 1, 0, 0);
  planContext.fillStyle = PLAN_PAPER();
  planContext.fillRect(0, 0, planCanvasElement.width, planCanvasElement.height);
  planContext.drawImage(
    metricsCanvas,
    Math.round(metricsOffsetX * metricsScaleX),
    Math.round(metricsOffsetY * metricsScaleY)
  );
  planContext.restore();
  return true;
}
/**
 * 在快照之上叠画框选矩形（只画框，不重绘平面）。与 blitMetricsCanvas 配套：先贴回快照
 */
function drawMarqueeOverlay() {
  if (state.pointerInteraction?.type !== "marquee") {
    return;
  }
  const marqueeStartScreen = planToScreen(state.pointerInteraction.start);
  const marqueeEndScreen = planToScreen(state.pointerInteraction.current);
  const marqueeLeftPx = Math.min(marqueeStartScreen.x, marqueeEndScreen.x);
  const marqueeTopPx = Math.min(marqueeStartScreen.y, marqueeEndScreen.y);
  const marqueeWidthPx = Math.abs(marqueeEndScreen.x - marqueeStartScreen.x);
  const marqueeHeightPx = Math.abs(marqueeEndScreen.y - marqueeStartScreen.y);
  planContext.save();
  planContext.translate(state.viewportWidthPx / 2, state.viewportHeightPx / 2);
  planContext.rotate((state.viewTransform.rotation * Math.PI) / 180);
  planContext.translate(-state.viewportWidthPx / 2, -state.viewportHeightPx / 2);
  planContext.fillStyle = "rgba(255, 157, 46, .10)";
  planContext.strokeStyle = "rgba(255, 176, 74, .92)";
  planContext.lineWidth = 1;
  planContext.setLineDash([6, 4]);
  planContext.fillRect(marqueeLeftPx, marqueeTopPx, marqueeWidthPx, marqueeHeightPx);
  planContext.strokeRect(
    marqueeLeftPx + 0.5,
    marqueeTopPx + 0.5,
    Math.max(marqueeWidthPx - 1, 0),
    Math.max(marqueeHeightPx - 1, 0)
  );
  planContext.restore();
}
function renderPlanView() {
  const isLightPlanView = state.activeAssetTab === "light";
  planContext.clearRect(0, 0, state.viewportWidthPx, state.viewportHeightPx);
  planContext.fillStyle = PLAN_PAPER();
  planContext.fillRect(0, 0, state.viewportWidthPx, state.viewportHeightPx);
  planContext.save();
  planContext.translate(state.viewportWidthPx / 2, state.viewportHeightPx / 2);
  planContext.rotate((state.viewTransform.rotation * Math.PI) / 180);
  planContext.translate(-state.viewportWidthPx / 2, -state.viewportHeightPx / 2);
  if (state.backgroundTexture && state.activeScene.background && state.activeScene.settings.backgroundVisible) {
    const planOriginScreen = planToScreen({
      x: 0,
      y: 0
    });
    planContext.save();
    planContext.globalAlpha = isLightPlanView ? 0.3 : 0.54;
    planContext.drawImage(
      state.backgroundTexture,
      planOriginScreen.x,
      planOriginScreen.y,
      state.activeScene.background.width * state.viewTransform.zoom,
      state.activeScene.background.height * state.viewTransform.zoom
    );
    planContext.restore();
  }
  drawMetricGrid();
  const planRenderPixelsPerMeter = currentPixelsPerMeter() || 100;
  if (state.floorAlignState) {
    planContext.save();
    planContext.globalAlpha = 0.58;
    for (const alignmentWall of referenceWallsForAlignment()) {
      drawPlanLine(alignmentWall.start, alignmentWall.end, {
        color: "#52cfe0",
        width: Math.max(2, alignmentWall.thickness * planRenderPixelsPerMeter * state.viewTransform.zoom),
        dash: [7, 5],
        cap: "square"
      });
    }
    planContext.restore();
    if (state.floorAlignState.referencePoint) {
      const alignmentReferencePoint = convertBetweenFloors(
        state.floorAlignState.referencePoint,
        state.floorAlignState.referenceFloor,
        getCurrentFloor()
      );
      drawPlanPoint(alignmentReferencePoint, "#ffb14f", 4.5);
      drawFloatingLabel(alignmentReferencePoint, "参照点", "#ffb14f");
    }
  }
  planContext.save();
  if (isLightPlanView) {
    planContext.globalAlpha = 0.48;
  }
  for (const planWall of state.activeScene.walls) {
    const isPlanWallSelected = isSelected("wall", planWall.id);
    const planWallWidthPx = Math.max(
      planWall.thickness * planRenderPixelsPerMeter * state.viewTransform.zoom,
      4
    );
    if (isPlanWallSelected) {
      drawPlanLine(planWall.start, planWall.end, {
        color: "rgba(255, 157, 46, .38)",
        width: planWallWidthPx + 7,
        cap: "square"
      });
    }
    drawPlanLine(planWall.start, planWall.end, {
      color: isPlanWallSelected ? "#f1d7b9" : "#c7d0d7",
      width: planWallWidthPx,
      cap: "square"
    });
    drawPlanLine(planWall.start, planWall.end, {
      color: "rgba(39, 51, 61, .82)",
      width: 1
    });
    if (state.activeTool === "wall" || isPlanWallSelected) {
      drawPlanPoint(planWall.start, isPlanWallSelected ? PLAN_ACCENT() : "#6c7c88", 3.5);
      drawPlanPoint(planWall.end, isPlanWallSelected ? PLAN_ACCENT() : "#6c7c88", 3.5);
    }
    if (isPlanWallSelected && state.multiSelection.length <= 1) {
      drawFloatingLabel(
        {
          x: (planWall.start.x + planWall.end.x) / 2,
          y: (planWall.start.y + planWall.end.y) / 2
        },
        wallLengthMeters(planWall, planRenderPixelsPerMeter).toFixed(2) + " m",
        "#ffb14f"
      );
    }
  }
  for (const planWindow of state.activeScene.windows) {
    const planWindowPlacement = openingPlacementInfo(planWindow);
    if (!planWindowPlacement) {
      continue;
    }
    const isPlanWindowSelected = isSelected("window", planWindow.id);
    drawPlanLine(planWindowPlacement.start, planWindowPlacement.end, {
      color: "rgba(7, 16, 21, .9)",
      width: Math.max(
        10,
        planWindowPlacement.wall.thickness * planRenderPixelsPerMeter * state.viewTransform.zoom + 5
      ),
      cap: "butt"
    });
    drawPlanLine(planWindowPlacement.start, planWindowPlacement.end, {
      color: isPlanWindowSelected ? PLAN_ACCENT_BRIGHT() : PLAN_GUIDE(),
      width: isPlanWindowSelected ? 5 : 3,
      cap: "butt"
    });
    drawPlanLine(planWindowPlacement.start, planWindowPlacement.end, {
      color: "rgba(224, 250, 255, .9)",
      width: 1,
      cap: "butt"
    });
    if (planWindow.hasDivider !== false && planWindow.width > 1.2) {
      const windowDividerNormal = {
        x: -planWindowPlacement.unit.y,
        y: planWindowPlacement.unit.x
      };
      const windowDividerHalfWidthPx = Math.max(
        planWindowPlacement.wall.thickness * planRenderPixelsPerMeter * state.viewTransform.zoom * 0.72,
        5 / state.viewTransform.zoom
      );
      drawPlanLine(
        {
          x: planWindowPlacement.center.x - windowDividerNormal.x * windowDividerHalfWidthPx,
          y: planWindowPlacement.center.y - windowDividerNormal.y * windowDividerHalfWidthPx
        },
        {
          x: planWindowPlacement.center.x + windowDividerNormal.x * windowDividerHalfWidthPx,
          y: planWindowPlacement.center.y + windowDividerNormal.y * windowDividerHalfWidthPx
        },
        {
          color: isPlanWindowSelected ? PLAN_ACCENT_BRIGHT() : "rgba(224, 250, 255, .9)",
          width: 1.5,
          cap: "butt"
        }
      );
    }
    if (isPlanWindowSelected && state.multiSelection.length <= 1) {
      drawFloatingLabel(planWindowPlacement.center, planWindow.width.toFixed(2) + " m", PLAN_GUIDE());
    }
  }
  for (const planDoor of state.activeScene.doors) {
    drawPlanDoor(planDoor);
  }
  for (const planRailing of state.activeScene.railings) {
    drawPlanRailing(planRailing);
  }
  if (state.pointerInteraction?.type === "draw-flooropening") {
    const { start: floorOpeningDragStart, current: floorOpeningDragEnd } = state.pointerInteraction;
    drawPlanItem({
      ...ITEM_TYPE_DEFINITIONS.flooropening,
      type: "flooropening",
      id: "opening-preview",
      rotation: 0,
      x: (floorOpeningDragStart.x + floorOpeningDragEnd.x) / 2,
      y: (floorOpeningDragStart.y + floorOpeningDragEnd.y) / 2,
      width: Math.abs(floorOpeningDragEnd.x - floorOpeningDragStart.x) / planRenderPixelsPerMeter,
      depth: Math.abs(floorOpeningDragEnd.y - floorOpeningDragStart.y) / planRenderPixelsPerMeter
    });
  }
  for (const planItem of state.activeScene.items) {
    if (!LIGHT_ITEM_TYPES.has(planItem.type)) {
      drawPlanItem(planItem);
    }
  }
  if (!state.floorAlignState) {
    const detectedOpenEndpoints = unclosedEndpointsForWalls(planRenderPixelsPerMeter);
    for (const detectedOpenEndpoint of detectedOpenEndpoints) {
      drawOpenEndpointWarning(detectedOpenEndpoint);
      if (detectedOpenEndpoints.length <= 3) {
        drawFloatingLabel(detectedOpenEndpoint, "未闭合", "#ff766e");
      }
    }
  }
  planContext.restore();
  if (isLightPlanView) {
    for (const planLightItem of state.activeScene.items) {
      if (LIGHT_ITEM_TYPES.has(planLightItem.type)) {
        drawPlanItem(planLightItem);
      }
    }
  }
  const calibrationReference = state.activeScene.calibration?.reference;
  if (calibrationReference && state.activeTool === "scale") {
    drawPlanLine(calibrationReference.start, calibrationReference.end, {
      color: "rgba(255, 157, 46, .72)",
      width: 2,
      dash: [7, 5]
    });
    drawPlanPoint(calibrationReference.start, PLAN_ACCENT(), 3.5);
    drawPlanPoint(calibrationReference.end, PLAN_ACCENT(), 3.5);
    drawFloatingLabel(
      {
        x: (calibrationReference.start.x + calibrationReference.end.x) / 2,
        y: (calibrationReference.start.y + calibrationReference.end.y) / 2
      },
      calibrationReference.meters.toFixed(2) + " m 参考",
      "#ffad45"
    );
  }
  if (state.scalePreviewStart && state.scalePreviewCurrent) {
    drawPlanLine(state.scalePreviewStart, state.scalePreviewCurrent, {
      color: PLAN_ACCENT(),
      width: 2,
      dash: [7, 5]
    });
    drawPlanPoint(state.scalePreviewStart, PLAN_ACCENT());
    drawPlanPoint(state.scalePreviewCurrent, PLAN_ACCENT());
  }
  if (state.scaleStartPoint && state.snapTarget) {
    const isClosingSpace = isSnapClosingSpace(state.snapTarget);
    drawPlanLine(state.scaleStartPoint, state.snapTarget.point, {
      color: PLAN_ACCENT(),
      width: 2,
      dash: [7, 5]
    });
    drawPlanPoint(state.scaleStartPoint, PLAN_ACCENT());
    drawPlanPoint(
      state.snapTarget.point,
      isClosingSpace ? PLAN_DONE() : state.snapTarget.kind ? PLAN_GUIDE() : PLAN_ACCENT(),
      isClosingSpace ? 5 : 3.5
    );
    const scaleDistanceMeters =
      distance(state.scaleStartPoint, state.snapTarget.point) / planRenderPixelsPerMeter;
    drawFloatingLabel(
      {
        x: (state.scaleStartPoint.x + state.snapTarget.point.x) / 2,
        y: (state.scaleStartPoint.y + state.snapTarget.point.y) / 2
      },
      scaleDistanceMeters.toFixed(2) + " m",
      "#ffb04a"
    );
    if (isClosingSpace) {
      drawFloatingLabel(state.snapTarget.point, "点击闭合空间", PLAN_DONE());
    }
  } else if (state.snapTarget?.kind && ["wall", "scale"].includes(state.activeTool)) {
    drawPlanPoint(state.snapTarget.point, PLAN_GUIDE());
    drawFloatingLabel(state.snapTarget.point, state.snapTarget.label, PLAN_GUIDE());
  }
  if (state.activeTool === "window" && state.windowSnapTarget) {
    const previewWindowRecord = {
      wallId: state.windowSnapTarget.wall.id,
      t: state.windowSnapTarget.t,
      width: 1.4
    };
    const previewWindowPlacement = openingPlacementInfo(previewWindowRecord);
    if (previewWindowPlacement) {
      drawPlanLine(previewWindowPlacement.start, previewWindowPlacement.end, {
        color: "rgba(67, 210, 230, .75)",
        width: 5,
        dash: [5, 4],
        cap: "butt"
      });
    }
  }
  if (state.activeTool === "door" && state.doorSnapTarget) {
    const doorTypeDimensions = DOOR_TYPE_DIMENSIONS[selectedDoorType] || DOOR_TYPE_DIMENSIONS.solid;
    drawPlanDoor(
      {
        wallId: state.doorSnapTarget.wall.id,
        t: state.doorSnapTarget.t,
        width: doorTypeDimensions.width,
        height: doorTypeDimensions.height,
        doorType: selectedDoorType,
        hinge: "left",
        swing: 1
      },
      {
        preview: true
      }
    );
  }
  if (state.activeTool === "railing" && state.railingSnapTarget) {
    drawPlanRailing(
      {
        wallId: state.railingSnapTarget.wall.id,
        t: state.railingSnapTarget.t,
        width: 2,
        height: 1.1
      },
      {
        preview: true
      }
    );
  }
  planContext.restore();
  drawMarqueeOverlay();
  zoomValueElement.textContent = Math.round(state.viewTransform.zoom * 100) + "%";
}
/**
 * 按 primarySelection 取回被选中的实体对象。单选状态只存 {kind, id}，真正的对象要从当前
 */
function findSelectedEntity() {
  if (!state.primarySelection) {
    return null;
  }
  /**
   * 按选中类型到对应集合里按 id 查找；未知 kind 兜底为空数组。
   */
  const selectedEntity = (
    ({
      wall: state.activeScene.walls,
      window: state.activeScene.windows,
      door: state.activeScene.doors,
      railing: state.activeScene.railings,
      item: state.activeScene.items
    } as any)[state.primarySelection.kind] || []
  ).find((entityCandidate: any) => entityCandidate.id === state.primarySelection.id);
  if (!selectedEntity) {
    state.primarySelection = null;
  }
  return selectedEntity || null;
}
function hitTestEntityAt(hitTestPlanPoint: any) {
  const hitPixelsPerMeter = currentPixelsPerMeter() || 100;
  const hitLightTab = state.activeAssetTab === "light";
  for (const hitItemEntity of [...state.activeScene.items].reverse()) {
    if (
      LIGHT_ITEM_TYPES.has(hitItemEntity.type) === hitLightTab &&
      pointInRotatedRectangle(
        hitTestPlanPoint,
        itemWithPlanFootprint(hitItemEntity),
        hitPixelsPerMeter
      )
    ) {
      return {
        kind: "item",
        id: hitItemEntity.id
      };
    }
  }
  if (hitLightTab) {
    return null;
  }
  for (const hitWindow of [...state.activeScene.windows].reverse()) {
    const hitWindowPlacement = openingPlacementInfo(hitWindow);
    if (
      hitWindowPlacement &&
      projectPointToSegment(hitTestPlanPoint, hitWindowPlacement.start, hitWindowPlacement.end)
        .distance <=
        10 / state.viewTransform.zoom
    ) {
      return {
        kind: "window",
        id: hitWindow.id
      };
    }
  }
  for (const hitDoor of [...state.activeScene.doors].reverse()) {
    const hitDoorPlacement = openingPlacementInfo(hitDoor);
    if (
      hitDoorPlacement &&
      projectPointToSegment(hitTestPlanPoint, hitDoorPlacement.start, hitDoorPlacement.end)
        .distance <=
        12 / state.viewTransform.zoom
    ) {
      return {
        kind: "door",
        id: hitDoor.id
      };
    }
  }
  for (const hitRailing of [...state.activeScene.railings].reverse()) {
    const hitRailingPlacement = openingPlacementInfo(hitRailing);
    if (
      hitRailingPlacement &&
      projectPointToSegment(hitTestPlanPoint, hitRailingPlacement.start, hitRailingPlacement.end)
        .distance <=
        12 / state.viewTransform.zoom
    ) {
      return {
        kind: "railing",
        id: hitRailing.id
      };
    }
  }
  for (const hitWall of [...state.activeScene.walls].reverse()) {
    const hitWallHalfWidthPx = Math.max(
      (hitWall.thickness * hitPixelsPerMeter) / 2,
      8 / state.viewTransform.zoom
    );
    if (
      projectPointToSegment(hitTestPlanPoint, hitWall.start, hitWall.end).distance <=
      hitWallHalfWidthPx
    ) {
      return {
        kind: "wall",
        id: hitWall.id
      };
    }
  }
  return null;
}
/**
 * 读 studio.css 声明的一枚长度型布局变量。读不到时用兜底值 —— 这里宁可退化到「旧版本写死的那个
 */
function readStudioLayoutLength(element: any, cssVarName: any, fallbackPx: any) {
  const rawValue = getComputedStyle(element).getPropertyValue(cssVarName).trim();
  const numericValue = Number.parseFloat(rawValue);
  return Number.isFinite(numericValue) && numericValue > 0 ? numericValue : fallbackPx;
}

function studioLayoutMetrics() {
  if (state.studioLayoutConstants) {
    return state.studioLayoutConstants;
  }
  const shellStyle = getComputedStyle(studioShellElement);
  const columnGapPx = Number.parseFloat(shellStyle.columnGap);
  state.studioLayoutConstants = {
    detailsMinWidthPx: readStudioLayoutLength(studioShellElement, "--layout-details-min-w", 420),
    // 中栏宽度下限：拖大右栏时至少要给中间绘图台留这么多。
    centerMinWidthPx: readStudioLayoutLength(studioShellElement, "--layout-center-min-w", 400),
    // 库栏宽度下限：库栏量不到宽度（尚未布局）时的兜底，也是右栏上限里要扣掉的那一段。
    libraryMinWidthPx: readStudioLayoutLength(studioShellElement, "--layout-library-min-w", 168),
    // 列间距会随断点变，写死 20px 会在窄屏下少扣一格。
    shellColumnGapPx: Number.isFinite(columnGapPx) ? columnGapPx : 10,
    // 右栏三行网格的两个内容下限与分隔条高度，全部声明在 .details-panel 上。
    previewMinHeightPx: readStudioLayoutLength(detailsPanelElement, "--layout-preview-min-h", 320),
    inspectorMinHeightPx: readStudioLayoutLength(
      detailsPanelElement,
      "--layout-inspector-min-h",
      170
    ),
    dividerHeightPx: readStudioLayoutLength(detailsPanelElement, "--layout-divider-h", 14)
  };
  return state.studioLayoutConstants;
}

/**
 * 量出右栏宽度与 3D 预览高度的比例上下限（拖拽与键盘调宽共用）。全部用「当前实际像素 ÷ 参考像素」
 */
function measurePanelLimits() {
  const metrics = studioLayoutMetrics();
  const detailsPanelRect = detailsPanelElement.getBoundingClientRect();
  const shellRect = studioShellElement.getBoundingClientRect();
  const panelHeightPx = detailsPanelRect.height || Math.max(window.innerHeight - 90, 340);
  const shellWidthPx = shellRect.width || Math.max(window.innerWidth - 20, 860);
  const resizerHeightPx =
    detailsResizerElement.parentElement?.getBoundingClientRect().height || metrics.dividerHeightPx;
  const libraryPanelWidthPx =
    libraryPanelElement?.getBoundingClientRect().width || metrics.libraryMinWidthPx;
  return {
    minimumHeightRatio: clamp(
      metrics.previewMinHeightPx / panelHeightPx,
      0.08,
      0.5
    ),
    maximumHeightRatio: clamp(
      (panelHeightPx - resizerHeightPx - metrics.inspectorMinHeightPx) / panelHeightPx,
      0.5,
      0.94
    ),
    minimumWidthRatio: clamp(metrics.detailsMinWidthPx / shellWidthPx, 0.08, 0.45),
    // 上限 = 扣掉库栏、两条列间距、中栏下限之后，剩下全给右栏。
    maximumWidthRatio: clamp(
      (shellWidthPx -
        libraryPanelWidthPx -
        metrics.shellColumnGapPx * 2 -
        metrics.centerMinWidthPx) /
        shellWidthPx,
      0.45,
      0.86
    )
  };
}
/**
 * 吸附当前是否生效：用户没在设置里关掉吸附，且没有按住临时关闭键
 */
function isSnapEnabled() {
  return state.activeScene.settings.snapEnabled !== false && !state.isSnapTemporarilyDisabled;
}
/**
 * 展开 / 收起吸附设置面板，并同步按钮的 aria-expanded 状态。
 */
function setSnapSettingsVisible(isVisible: any) {
  snapSettingsPanelElement.hidden = !isVisible;
  snapSettingsToggleButton.setAttribute("aria-expanded", String(isVisible));
}
/**
 * 把吸附设置（总开关、各吸附项、容差）同步到工具栏控件。所有判定都用 !== false：老草稿里这些字段
 */
function syncSnapControls() {
  const isSnapOn = state.activeScene.settings.snapEnabled !== false;
  snapToggleButton.classList.toggle("active", isSnapOn);
  snapToggleButton.setAttribute("aria-pressed", String(isSnapOn));
  snapToggleStateElement.textContent = isSnapOn ? "开" : "关";
  for (const snapSettingInput of snapSettingInputs) {
    (snapSettingInput as any).checked = state.activeScene.settings[(snapSettingInput as any).dataset.snapSetting] !== false;
  }
  syncControlValue(
    snapToleranceInput,
    clamp(Math.round(finite(state.activeScene.settings.snapTolerance, 13)), 6, 24)
  );
  snapToleranceValueElement.textContent = snapToleranceInput.value + " px";
  if (!state.scaleAnchorPoint) {
    snapIndicatorElement.textContent = isSnapOn ? "吸附：开启" : "吸附：关闭";
  }
}
/**
 * 全量刷新工作台界面（墙面全局参数、物件计数、面板比例、相机与灯光控件）。这是「场景数据变化后把 UI
 */
function syncStudioUi() {
  syncSnapControls();
  renderFloorList();
  toggleBackgroundButton.disabled = !state.activeScene.background;
  toggleBackgroundButton.textContent = state.activeScene.settings.backgroundVisible ? "隐藏" : "显示";
  removePlanButton.disabled = !state.activeScene.background;
  syncControlValue(globalWallHeightInput, state.activeScene.settings.wallHeight.toFixed(2));
  syncControlValue(globalWallThicknessInput, state.activeScene.settings.wallThickness.toFixed(2));
  syncControlValue(globalWallOpacityInput, Math.round(state.activeScene.settings.wallOpacity * 100));
  toggleFloorEdgeButton.textContent =
    state.activeScene.settings.floorEdgeVisible === false ? "隐藏" : "显示";
  toggleFloorEdgeButton.setAttribute(
    "aria-pressed",
    String(state.activeScene.settings.floorEdgeVisible !== false)
  );
  canvasEmptyElement.hidden =
    !!state.activeScene.background || !!state.activeScene.walls.length || !!state.activeScene.items.length;
  sceneCountsElement.textContent =
    state.activeScene.walls.length +
    " 墙 · " +
    state.activeScene.windows.length +
    " 窗 · " +
    state.activeScene.doors.length +
    " 门 · " +
    state.activeScene.railings.length +
    " 栏杆 · " +
    state.activeScene.items.length +
    " 物件";
  renderLightGroupList();
  // 布局比例现在归 studioLayout 管（localStorage），这里只做两件事：
  migrateLegacyLayoutSettings();
  studioLayout.refresh();
  applyCameraMode(currentCameraMode());
  applyCameraView(currentCameraView());
  syncPreviewControls();
  syncCameraViewControls();
  applyBaseLighting();
  updateOnboardingSteps();
}
/**
 * 渲染右侧属性检查器：按选中类型显示对应字段组并回填当前值。三种状态互斥：框选多选（只提示数量）、单选（按 kind 切
 */
function renderInspector() {
  const inspectedEntity = findSelectedEntity();
  const multiSelectionCount = state.multiSelection.length;
  inspectorEmptyElement.hidden = !!inspectedEntity;
  selectionInspectorElement.hidden = !inspectedEntity;
  deleteSelectionButton.disabled = !inspectedEntity && !multiSelectionCount;
  if (multiSelectionCount) {
    inspectorEmptyElement.hidden = false;
    selectionInspectorElement.hidden = true;
    inspectorEmptyElement.querySelector("strong").textContent =
      "已框选 " + multiSelectionCount + " 个对象";
    inspectorEmptyElement.querySelector("p").textContent =
      "可以直接批量删除；单击一个对象可继续精确编辑属性。";
    return;
  }
  inspectorEmptyElement.querySelector("strong").textContent = "选择画布中的对象";
  inspectorEmptyElement.querySelector("p").textContent =
    "选中墙体、窗户、门或家具后，可在这里精确调整。";
  if (!!inspectedEntity && !!state.primarySelection) {
    lightPreviewNoteElement.hidden = true;
    selectionHeadingElement.classList.remove("light-selected");
    wallFieldsElement.hidden = state.primarySelection.kind !== "wall";
    windowFieldsElement.hidden = state.primarySelection.kind !== "window";
    doorFieldsElement.hidden = state.primarySelection.kind !== "door";
    railingFieldsElement.hidden = state.primarySelection.kind !== "railing";
    itemFieldsElement.hidden = state.primarySelection.kind !== "item";
    selectionIdElement.hidden = state.primarySelection.kind === "item";
    selectionIdElement.textContent = selectionIdElement.hidden ? "" : inspectedEntity.id;
    if (state.primarySelection.kind === "wall") {
      selectElement("#selection-title").textContent = "墙体";
      syncControlValue(
        selectElement("#wall-length"),
        wallLengthMeters(inspectedEntity, currentPixelsPerMeter() || 1).toFixed(2) + " m"
      );
      syncControlValue(selectElement("#wall-height"), inspectedEntity.height.toFixed(2));
      syncControlValue(selectElement("#wall-thickness"), inspectedEntity.thickness.toFixed(2));
      const customWallOpacity =
        inspectedEntity.opacity === null || inspectedEntity.opacity === undefined
          ? null
          : clamp(finite(inspectedEntity.opacity, state.activeScene.settings.wallOpacity), 0, 1);
      selectElement("#wall-opacity-mode").value = customWallOpacity === null ? "global" : "custom";
      syncControlValue(
        selectElement("#wall-opacity"),
        Math.round((customWallOpacity ?? state.activeScene.settings.wallOpacity) * 100)
      );
      selectElement("#wall-opacity").disabled = customWallOpacity === null;
      syncStudioSelect(selectElement("#wall-opacity-mode"));
      selectElement("#wall-open-end-mode").value =
        inspectedEntity.allowOpenEnd === true ? "allowed" : "auto";
      syncStudioSelect(selectElement("#wall-open-end-mode"));
    } else if (state.primarySelection.kind === "window") {
      selectElement("#selection-title").textContent = "窗户";
      syncControlValue(selectElement("#window-width"), inspectedEntity.width.toFixed(2));
      syncControlValue(selectElement("#window-height"), inspectedEntity.height.toFixed(2));
      syncControlValue(selectElement("#window-sill"), inspectedEntity.sill.toFixed(2));
      selectElement("#window-divider").value =
        inspectedEntity.hasDivider === false ? "without" : "with";
      syncStudioSelect(selectElement("#window-divider"));
      syncControlValue(
        selectElement("#window-position"),
        Math.round(inspectedEntity.t * 100) + "%"
      );
    } else if (state.primarySelection.kind === "door") {
      selectElement("#selection-title").textContent =
        ({
          solid: "普通平开门",
          double: "双开门",
          entry: "入户门（常闭）",
          glass: "玻璃平开门",
          "sliding-glass": "玻璃推拉门",
          "roller-shutter": "卷帘门",
          "frame-only": "仅门框"
        } as any)[inspectedEntity.doorType] || "普通平开门";
      selectElement("#door-type").value = inspectedEntity.doorType || "solid";
      syncStudioSelect(selectElement("#door-type"));
      syncControlValue(selectElement("#door-width"), inspectedEntity.width.toFixed(2));
      syncControlValue(selectElement("#door-height"), inspectedEntity.height.toFixed(2));
      syncControlValue(selectElement("#door-position"), Math.round(inspectedEntity.t * 100) + "%");
      // 所有门型默认都显示「合页侧」与「内外开」两个开关，只有真正没有门扇可翻的类型例外：
      selectElement(".door-actions").hidden = inspectedEntity.doorType === "frame-only";
      selectElement("#door-hinge").hidden = ["double", "roller-shutter"].includes(
        inspectedEntity.doorType
      );
      selectElement("#door-swing").hidden = false;
      // 门材质档位按门型重建：玻璃门型才多出清玻 / 茶玻，其余门型那一格会被归一到 auto。
      syncDoorMaterialOptions(inspectedEntity.doorType, inspectedEntity.materialStyle);
    } else if (state.primarySelection.kind === "railing") {
      selectElement("#selection-title").textContent = "玻璃栏杆";
      syncControlValue(selectElement("#railing-width"), inspectedEntity.width.toFixed(2));
      syncControlValue(selectElement("#railing-height"), inspectedEntity.height.toFixed(2));
      syncControlValue(
        selectElement("#railing-position"),
        Math.round(inspectedEntity.t * 100) + "%"
      );
    } else {
      const inspectorItemDefinition = (ITEM_TYPE_DEFINITIONS as any)[inspectedEntity.type];
      const isLabelItem = inspectedEntity.type === "planlabel";
      const isLightItem = LIGHT_ITEM_TYPES.has(inspectedEntity.type);
      selectElement("#selection-title").textContent = inspectorItemDefinition?.name || "物件";
      lightPreviewNoteElement.hidden = !isLightItem;
      selectionHeadingElement.classList.toggle("light-selected", isLightItem);
      labelTextFieldsElement.hidden = !isLabelItem;
      lightFieldsElement.hidden = !isLightItem;
      curtainPositionFieldElement.hidden =
        inspectedEntity.type !== "curtain" ||
        normalizeCurtainTrack(inspectedEntity).curtainForm === "roller";
      selectElement("#curtain-track-fields").hidden = inspectedEntity.type !== "curtain";
      itemHeightFieldElement.hidden =
        isLabelItem || isLightItem || inspectedEntity.type === "flooropening";
      itemElevationFieldElement.hidden = isLabelItem || inspectedEntity.type === "flooropening";
      itemRotationFieldElement.hidden = inspectedEntity.type === "ceilinglight";
      itemRotationActionsElement.hidden = inspectedEntity.type === "ceilinglight";
      selectElement("#item-depth").readOnly =
        inspectedEntity.type === "curtain" &&
        normalizeCurtainTrack(inspectedEntity).curtainTrack !== "straight";
      const isCameraLikeItem = ["camera", "presence"].includes(inspectedEntity.type);
      itemVerticalRotationFieldElement.hidden = !isLightItem && !isCameraLikeItem;
      itemVerticalRotationFieldElement.title = isCameraLikeItem
        ? "0° 正装，±90° 侧装，180° 倒装；离地高度为底座安装点高度"
        : "";
      itemStripRollFieldElement.hidden = inspectedEntity.type !== "striplight";
      itemStripOrientationHeadingElement.hidden = inspectedEntity.type !== "striplight";
      itemLightSourceVisibilityFieldElement.hidden = inspectedEntity.type !== "striplight";
      roundTableTurntableFieldElement.hidden = !ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(
        inspectedEntity.type
      );
      stairDirectionFieldElement.hidden = !STAIR_DIRECTION_ITEM_TYPES.has(inspectedEntity.type);
      tvMountStyleFieldElement.hidden = inspectedEntity.type !== "tv";
      muralStyleFieldElement.hidden = inspectedEntity.type !== "mural";
      featureWallStyleFieldElement.hidden = inspectedEntity.type !== "featurewall";
      // 冰箱款式只对冰箱显示；回填时非 double 一律归一为 standard（与读取口径一致）。
      fridgeStyleFieldElement.hidden = inspectedEntity.type !== "fridge";
      if (inspectedEntity.type === "fridge") {
        for (const fridgeStyleRadioInput of fridgeStyleRadioInputs) {
          (fridgeStyleRadioInput as any).checked =
            (fridgeStyleRadioInput as any).value ===
            (inspectedEntity.fridgeStyle === "double" ? "double" : "standard");
        }
      }
      // 材质风格是**通用**属性：所有家居家电类型都显示，因此按「类型是否支持」而不是枚举来判断。
      materialStyleFieldElement.hidden = !isMaterialStyleCapable(inspectedEntity.type);
      pillarShapeFieldElement.hidden = inspectedEntity.type !== "pillar";
      stripAxisFieldElement.hidden = inspectedEntity.type !== "striplight";
      pillarAxisFieldElement.hidden = inspectedEntity.type !== "pillar";
      shoeCabinetActionsElement.hidden = inspectedEntity.type !== "shoecabinet";
      shoeCabinetMirrorInput.setAttribute(
        "aria-pressed",
        inspectedEntity.shoeCabinetMirrored === true ? "true" : "false"
      );
      selectElement("#item-rotation-label").textContent =
        inspectedEntity.type === "striplight"
          ? "平面旋转（°）"
          : isLightItem
            ? "平面方向（°）"
            : "旋转角度（°）";
      selectElement("#item-rotation").min = inspectedEntity.type === "striplight" ? "0" : "-360";
      selectElement("#item-rotation").max = "360";
      itemVerticalRotationLabelElement.textContent =
        inspectedEntity.type === "striplight"
          ? "安装倾斜（°）"
          : isCameraLikeItem
            ? "安装翻转／侧装（°）"
            : "出光角度（°）";
      selectElement("#item-vertical-rotation").min =
        inspectedEntity.type === "striplight" ? "0" : isCameraLikeItem ? "-180" : "-90";
      selectElement("#item-vertical-rotation").max =
        inspectedEntity.type === "striplight" ? "360" : isCameraLikeItem ? "180" : "90";
      for (const propertyApplyButton of lightPropertyApplyButtons) {
        (propertyApplyButton as any).hidden = !isLightItem;
      }
      itemWidthLabelElement.textContent =
        inspectedEntity.type === "flooropening"
          ? "洞口宽（m）"
          : inspectedEntity.type === "striplight"
            ? "发光长度（m）"
            : inspectedEntity.type === "pillar"
              ? "截面宽（m）"
              : "宽（m）";
      if (inspectedEntity.type === "curtain") {
        itemWidthLabelElement.textContent = "主边长度（m）";
      }
      itemDepthLabelElement.textContent =
        inspectedEntity.type === "flooropening"
          ? "洞口长（m）"
          : inspectedEntity.type === "striplight"
            ? "发光宽度（m）"
            : isLabelItem
              ? "铭牌高（m）"
              : inspectedEntity.type === "pillar"
                ? "截面深（m）"
                : "深（m）";
      if (isLabelItem) {
        syncControlValue(selectElement("#label-title"), inspectedEntity.title || "家庭总览");
        syncControlValue(
          selectElement("#label-title-spacing"),
          Math.round(clamp(finite(inspectedEntity.titleSpacing, 1.05), 0, 1.8) * 100)
        );
        syncControlValue(selectElement("#label-subtitle"), inspectedEntity.subtitle || "HOME PLAN");
        syncControlValue(
          selectElement("#label-subtitle-spacing"),
          Math.round(clamp(finite(inspectedEntity.subtitleSpacing, 0.08), 0, 0.6) * 100)
        );
        syncControlValue(
          selectElement("#label-line-length"),
          Math.round(clamp(finite(inspectedEntity.lineLength, 0.86), 0.3, 1) * 100)
        );
      }
      if (isLightItem) {
        const inspectorLightDefaults =
          (DEFAULT_LIGHT_SETTINGS as any)[inspectedEntity.type] || DEFAULT_LIGHT_SETTINGS.downlight;
        state.activeLightGroupId = lightGroupForItem(inspectedEntity)?.id || ensureActiveLightGroup().id;
        renderLightGroupList();
        renderLightGroupSelect(inspectedEntity);
        syncControlValue(
          selectElement("#light-temperature"),
          Math.round(
            clamp(
              finite(inspectedEntity.lightTemperature, inspectorLightDefaults.temperature),
              2200,
              6500
            )
          )
        );
        syncControlValue(
          selectElement("#light-brightness"),
          Math.round(
            clamp(
              finite(inspectedEntity.lightBrightness, inspectorLightDefaults.brightness),
              0,
              100
            )
          )
        );
        syncControlValue(
          selectElement("#light-range"),
          clamp(finite(inspectedEntity.lightRange, inspectorLightDefaults.range), 0.5, 10).toFixed(
            1
          )
        );
        selectElement("#light-angle").max = String(maxLightAngleForType(inspectedEntity.type));
        syncControlValue(
          selectElement("#light-angle"),
          Math.round(
            clamp(
              finite(inspectedEntity.lightAngle, inspectorLightDefaults.angle),
              15,
              maxLightAngleForType(inspectedEntity.type)
            )
          )
        );
        const inspectorVerticalRotation =
          inspectedEntity.type === "striplight"
            ? normalizeFullRotation(inspectedEntity.verticalRotation)
            : clamp(finite(inspectedEntity.verticalRotation, 0), -90, 90);
        syncControlValue(
          selectElement("#item-vertical-rotation"),
          Math.round(inspectorVerticalRotation * 100) / 100
        );
        syncControlValue(
          itemStripRollInput,
          Math.round(clamp(finite(inspectedEntity.stripRollRotation, 0), 0, 360) * 100) / 100
        );
        itemLightSourceVisibleInput.checked = inspectedEntity.lightSourceVisible !== false;
      }
      if (isCameraLikeItem) {
        syncControlValue(
          selectElement("#item-vertical-rotation"),
          Math.round(clamp(finite(inspectedEntity.verticalRotation, 0), -180, 180) * 100) / 100
        );
      }
      if (inspectedEntity.type === "curtain") {
        selectElement("#curtain-position").value = ["left", "right", "split"].includes(
          inspectedEntity.curtainPosition
        )
          ? inspectedEntity.curtainPosition
          : "split";
        syncStudioSelect(selectElement("#curtain-position"));
        const curtainSettings = normalizeCurtainTrack(inspectedEntity);
        // 形态（普通窗帘 / 卷帘）：卷帘下「轨道 + 布面」那一整组字段都不适用，统一隐藏，
        const curtainIsRoller = curtainSettings.curtainForm === "roller";
        selectElement("#curtain-form").value = curtainIsRoller ? "roller" : "standard";
        syncStudioSelect(selectElement("#curtain-form"));
        for (const [curtainSelectId, curtainSelectValue] of [
          ["curtain-track", curtainSettings.curtainTrack],
          ["curtain-corner", curtainSettings.curtainCorner],
          ["curtain-fabric", inspectedEntity.curtainFabric || "cloth"]
        ]) {
          selectElement("#" + curtainSelectId).value = curtainSelectValue;
          syncStudioSelect(selectElement("#" + curtainSelectId));
        }
        for (const [curtainNumberId, curtainNumberValue] of [
          ["curtain-left-length", curtainSettings.curtainLeftLength],
          ["curtain-right-length", curtainSettings.curtainRightLength],
          ["curtain-meet", curtainSettings.curtainMeet],
          ["curtain-preview", curtainSettings.curtainPreview]
        ]) {
          syncControlValue(selectElement("#" + curtainNumberId), curtainNumberValue);
        }
        selectElement("#curtain-track-field").hidden = curtainIsRoller;
        selectElement("#curtain-fabric-field").hidden = curtainIsRoller;
        selectElement("#curtain-corner-field").hidden =
          curtainIsRoller || curtainSettings.curtainTrack !== "l";
        selectElement("#curtain-left-length-field").hidden =
          curtainIsRoller ||
          curtainSettings.curtainTrack === "straight" ||
          (curtainSettings.curtainTrack === "l" && curtainSettings.curtainCorner !== "left");
        selectElement("#curtain-right-length-field").hidden =
          curtainIsRoller ||
          curtainSettings.curtainTrack === "straight" ||
          (curtainSettings.curtainTrack === "l" && curtainSettings.curtainCorner !== "right");
        selectElement("#curtain-meet-field").hidden =
          curtainIsRoller || inspectedEntity.curtainPosition !== "split";
        // 卷帘的说明文字要讲清「0% 放下 / 100% 卷起」这一套与轨道帘不同的方向语义。
        selectElement("#curtain-note").textContent = curtainIsRoller
          ? "卷帘垂直升降，0% 完全放下、100% 完全卷起；控制沿用普通窗帘。"
          : "预览打开：0% 为关闭，100% 为完全收拢。主边长度在下方调整，旋转可改变开口朝向；合拢位置沿整条轨道计算。";
        selectElement("#curtain-preview").title = curtainIsRoller
          ? "0% 完全放下，100% 完全卷起；仅调整模型预览，不控制设备"
          : "0为关闭，100为全开；仅调整模型预览，不控制设备";
      }
      if (ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(inspectedEntity.type)) {
        selectElement("#round-table-turntable").value = isRoundTableTurntableItem(inspectedEntity)
          ? "with"
          : "without";
        syncStudioSelect(selectElement("#round-table-turntable"));
      }
      if (STAIR_DIRECTION_ITEM_TYPES.has(inspectedEntity.type)) {
        selectElement("#stair-direction").value = ["left", "right"].includes(
          inspectedEntity.stairDirection
        )
          ? inspectedEntity.stairDirection
          : "right";
        syncStudioSelect(selectElement("#stair-direction"));
      }
      if (inspectedEntity.type === "tv") {
        selectElement("#tv-mount-style").value = TV_MOUNT_STYLES.has(inspectedEntity.tvMountStyle)
          ? inspectedEntity.tvMountStyle
          : "standard";
        syncStudioSelect(selectElement("#tv-mount-style"));
      }
      if (inspectedEntity.type === "mural") {
        selectElement("#mural-style").value = normalizeMuralArtStyle(inspectedEntity.muralStyle);
        syncStudioSelect(selectElement("#mural-style"));
      }
      if (inspectedEntity.type === "featurewall") {
        selectElement("#feature-wall-style").value = normalizeFeatureWallStyle(
          inspectedEntity.wallStyle
        );
        syncStudioSelect(selectElement("#feature-wall-style"));
      }
      if (isMaterialStyleCapable(inspectedEntity.type)) {
        syncMaterialStyleOptions(inspectedEntity.type, inspectedEntity.materialStyle);
      }
      if (inspectedEntity.type === "pillar") {
        selectElement("#pillar-shape").value = normalizePillarShape(inspectedEntity.pillarShape);
        syncStudioSelect(selectElement("#pillar-shape"));
        selectElement("#pillar-axis").value = normalizePillarAxis(inspectedEntity.pillarAxis);
        syncStudioSelect(selectElement("#pillar-axis"));
      }
      if (inspectedEntity.type === "striplight") {
        selectElement("#strip-axis").value = normalizeStripAxis(inspectedEntity.stripAxis);
        syncStudioSelect(selectElement("#strip-axis"));
      }
      syncControlValue(
        selectElement("#item-x"),
        (inspectedEntity.x / (currentPixelsPerMeter() || 1)).toFixed(2)
      );
      syncControlValue(
        selectElement("#item-y"),
        (inspectedEntity.y / (currentPixelsPerMeter() || 1)).toFixed(2)
      );
      const sizeFractionDigits = inspectedEntity.type === "presence" ? 3 : 2;
      for (const itemSizeInput of [selectElement("#item-width"), selectElement("#item-depth")]) {
        itemSizeInput.min = String(itemMinimumFootprint(inspectedEntity.type));
        itemSizeInput.step = inspectedEntity.type === "presence" ? "0.005" : "0.05";
      }
      syncControlValue(
        selectElement("#item-width"),
        inspectedEntity.width.toFixed(sizeFractionDigits)
      );
      selectElement("#item-height").min = String(itemMinimumHeight(inspectedEntity.type));
      selectElement("#item-height").step =
        inspectedEntity.type === "rug"
          ? "0.002"
          : inspectedEntity.type === "presence"
            ? "0.005"
            : "0.05";
      itemHeightLabelElement.textContent = pillarIsLying(inspectedEntity) ? "长（m）" : "高（m）";
      syncControlValue(
        selectElement("#item-height"),
        inspectedEntity.type === "rug"
          ? inspectedEntity.height.toFixed(3)
          : inspectedEntity.height.toFixed(sizeFractionDigits)
      );
      syncControlValue(
        selectElement("#item-depth"),
        inspectedEntity.depth.toFixed(sizeFractionDigits)
      );
      syncControlValue(
        selectElement("#item-elevation"),
        (inspectedEntity.elevation || 0).toFixed(2)
      );
      syncControlValue(
        selectElement("#item-rotation"),
        Math.round(inspectedEntity.rotation * 100) / 100
      );
    }
  }
}
/**
 * 保存 / 编辑流程里的统一刷新入口：先同步 UI 与属性检查器，再重画平面视图，最后按 scope
 */
function refreshStudio(refreshScopeName = "all") {
  syncStudioUi();
  renderInspector();
  renderPlanView();
  if (refreshScopeName !== "none") {
    applySceneRefresh({
      scope: refreshScopeName
    });
  }
}
function activateTool(toolName: any) {
  if (!(TOOL_HELP_TEXT as any)[toolName]) {
    return;
  }
  if (state.activeAssetTab === "light" && toolName !== "select") {
    showToast("灯光编辑中户型已锁定，请先切回家居或电器。");
    return;
  }
  const shouldWarnUnclosedWall =
    state.activeTool === "wall" && toolName !== "wall" && state.scalePointCount > 0;
  state.activeTool = toolName;
  planCanvasElement.dataset.tool = toolName;
  planCanvasElement.style.cursor = "";
  for (const toolButton of toolButtons) {
    toolButton.classList.toggle("active", (toolButton as any).dataset.tool === toolName);
  }
  [activeToolLabelElement.textContent, toolHelpElement.textContent] =
    state.activeAssetTab === "light"
      ? ["灯光编辑", "户型已锁定；框选多盏灯后可整体拖动，Shift 锁轴，Option/Alt 复制"]
      : (TOOL_HELP_TEXT as any)[toolName];
  finishWallButton.hidden = toolName !== "wall" || !state.scaleStartPoint;
  if (toolName !== "wall") {
    resetScaleInteractionState();
  }
  if (toolName !== "scale") {
    state.scalePreviewStart = null;
  }
  state.snapTarget = null;
  state.windowSnapTarget = null;
  state.doorSnapTarget = null;
  state.railingSnapTarget = null;
  renderPlanView();
  if (shouldWarnUnclosedWall) {
    showToast("当前墙线未闭合，不会生成地面；如果绘制的是隔墙，可以忽略此提醒。", "warning");
  }
}
function ensureCalibration(fallbackTool = "scale") {
  if (currentPixelsPerMeter()) {
    return true;
  } else {
    showToast("请先画一条参考线并填写真实长度。", "error");
    activateTool(fallbackTool);
    return false;
  }
}
function deleteSelection() {
  if (state.multiSelection.length) {
    const selectionScope = currentSelectionScope();
    pushHistorySnapshot();
    const wallSelectionIds = new Set(
      state.multiSelection
        .filter((wallSelection: any) => wallSelection.kind === "wall")
        .map((wallSelectionId: any) => wallSelectionId.id)
    );
    const windowSelectionIds = new Set(
      state.multiSelection
        .filter((windowSelection: any) => windowSelection.kind === "window")
        .map((windowSelectionId: any) => windowSelectionId.id)
    );
    const doorSelectionIds = new Set(
      state.multiSelection
        .filter((doorSelection: any) => doorSelection.kind === "door")
        .map((doorSelectionId: any) => doorSelectionId.id)
    );
    const railingSelectionIds = new Set(
      state.multiSelection
        .filter((railingSelection: any) => railingSelection.kind === "railing")
        .map((railingSelectionId: any) => railingSelectionId.id)
    );
    const itemSelectionIds = new Set(
      state.multiSelection
        .filter((itemSelection: any) => itemSelection.kind === "item")
        .map((itemSelectionId: any) => itemSelectionId.id)
    );
    state.activeScene.walls = state.activeScene.walls.filter(
      (filteredWall: any) => !wallSelectionIds.has(filteredWall.id)
    );
    state.activeScene.windows = state.activeScene.windows.filter(
      (filteredWindow: any) =>
        !windowSelectionIds.has(filteredWindow.id) && !wallSelectionIds.has(filteredWindow.wallId)
    );
    state.activeScene.doors = state.activeScene.doors.filter(
      (filteredDoor: any) =>
        !doorSelectionIds.has(filteredDoor.id) && !wallSelectionIds.has(filteredDoor.wallId)
    );
    state.activeScene.railings = state.activeScene.railings.filter(
      (filteredRailing: any) =>
        !railingSelectionIds.has(filteredRailing.id) &&
        !wallSelectionIds.has(filteredRailing.wallId)
    );
    state.activeScene.items = state.activeScene.items.filter(
      (outsideSelectionItem: any) => !itemSelectionIds.has(outsideSelectionItem.id)
    );
    if (wallSelectionIds.size) {
      mergeCollinearWalls();
    }
    clearSelection();
    refreshStudio(selectionScope);
    markDocumentDirty();
    return;
  }
  const targetEntity = findSelectedEntity();
  if (!targetEntity || !state.primarySelection) {
    return;
  }
  const targetScope = currentSelectionScope();
  pushHistorySnapshot();
  if (state.primarySelection.kind === "wall") {
    state.activeScene.walls = state.activeScene.walls.filter(
      (wallToRemove: any) => wallToRemove.id !== targetEntity.id
    );
    state.activeScene.windows = state.activeScene.windows.filter(
      (windowOnRemovedWall: any) => windowOnRemovedWall.wallId !== targetEntity.id
    );
    state.activeScene.doors = state.activeScene.doors.filter(
      (doorOnRemovedWall: any) => doorOnRemovedWall.wallId !== targetEntity.id
    );
    state.activeScene.railings = state.activeScene.railings.filter(
      (railingOnRemovedWall: any) => railingOnRemovedWall.wallId !== targetEntity.id
    );
    mergeCollinearWalls();
  } else if (state.primarySelection.kind === "window") {
    state.activeScene.windows = state.activeScene.windows.filter(
      (windowToRemove: any) => windowToRemove.id !== targetEntity.id
    );
  } else if (state.primarySelection.kind === "door") {
    state.activeScene.doors = state.activeScene.doors.filter(
      (doorToRemove: any) => doorToRemove.id !== targetEntity.id
    );
  } else if (state.primarySelection.kind === "railing") {
    state.activeScene.railings = state.activeScene.railings.filter(
      (railingToRemove: any) => railingToRemove.id !== targetEntity.id
    );
  } else {
    state.activeScene.items = state.activeScene.items.filter(
      (itemToRemove: any) => itemToRemove.id !== targetEntity.id
    );
  }
  clearSelection();
  refreshStudio(targetScope);
  markDocumentDirty();
}
function createSceneItem(newItemType: any, itemPosition: any, overrides: any = {}) {
  const typeDefinition = (ITEM_TYPE_DEFINITIONS as any)[newItemType];
  if (!typeDefinition || !ensureCalibration()) {
    return;
  }
  const newLightDefaults = (DEFAULT_LIGHT_SETTINGS as any)[newItemType] || DEFAULT_LIGHT_SETTINGS.downlight;
  const itemLightGroup = LIGHT_ITEM_TYPES.has(newItemType) ? ensureActiveLightGroup() : null;
  pushHistorySnapshot();
  const newItem = {
    id: createId("item"),
    type: newItemType,
    x: itemPosition.x,
    y: itemPosition.y,
    rotation: 0,
    width: overrides.width ?? typeDefinition.width,
    depth: overrides.depth ?? typeDefinition.depth,
    height: typeDefinition.height,
    elevation: typeDefinition.elevation || 0,
    color: typeDefinition.color,
    ...(newItemType === "planlabel"
      ? {
          title: "家庭总览",
          subtitle: "HOME PLAN",
          titleSpacing: 1.05,
          subtitleSpacing: 0.08,
          lineLength: 0.86
        }
      : {}),
    ...(["camera", "presence"].includes(newItemType)
      ? {
          verticalRotation: 0
        }
      : {}),
    ...(newItemType === "tv"
      ? {
          screenEnabled: true,
          screenLayerName: "电视画面 " + (televisionItems().length + 1),
          tvMountStyle: "standard",
          // 新电视默认壁挂：进深与离地高度都按挂装档位给（壁挂 60mm / 面板下沿 0.70m），
          depth: TELEVISION_MOUNT_DEPTHS.standard,
          elevation: TELEVISION_MOUNT_ELEVATIONS.standard
        }
      : {}),
    ...(newItemType === "smallcar"
      ? {
          chargingEnabled: false,
          chargingLayerName: "汽车充电 " + (carItems().length + 1)
        }
      : {}),
    ...(newItemType === "curtain"
      ? {
          curtainPosition: "split",
          ...normalizeCurtainTrack({
            curtainFabric: "cloth"
          })
        }
      : {}),
    ...(newItemType === "mural"
      ? {
          muralStyle: typeDefinition.muralStyle
        }
      : {}),
    ...(newItemType === "featurewall"
      ? {
          wallStyle: typeDefinition.wallStyle
        }
      : {}),
    ...(newItemType === "pillar"
      ? {
          pillarShape: typeDefinition.pillarShape,
          pillarAxis: typeDefinition.pillarAxis
        }
      : {}),
    ...(STAIR_DIRECTION_ITEM_TYPES.has(newItemType)
      ? {
          stairDirection: "right"
        }
      : {}),
    ...(newItemType === "shoecabinet"
      ? {
          shoeCabinetMirrored: false
        }
      : {}),
    ...(ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(newItemType)
      ? {
          roundTableTurntable: false
        }
      : {}),
    ...(LIGHT_ITEM_TYPES.has(newItemType)
      ? {
          lightGroupId: itemLightGroup.id,
          verticalRotation: 0,
          ...(newItemType === "striplight"
            ? {
                stripAxis: "horizontal",
                stripRollRotation: 0,
                lightSourceVisible: true
              }
            : {}),
          lightTemperature: newLightDefaults.temperature,
          lightBrightness: newLightDefaults.brightness,
          lightRange: newLightDefaults.range,
          lightAngle: newLightDefaults.angle
        }
      : {})
  };
  normalizeLayerNames([newItem]);
  state.activeScene.items.push(newItem);
  setSelection("item", newItem.id);
  activateTool("select");
  refreshStudio(scopeForItem(newItem));
  markDocumentDirty();
}
/**
 * 原地复制选中的家具 / 电器 / 灯具（不走系统剪贴板）。只复制物件、不复制墙与门窗；灯光页签只复制灯。
 */
function duplicateSelection() {
  const sourceItemIds = new Set([
    ...(state.primarySelection?.kind === "item" ? [state.primarySelection.id] : []),
    ...state.multiSelection
      .filter((duplicateSelectionEntry: any) => duplicateSelectionEntry.kind === "item")
      .map((duplicateSelectionId: any) => duplicateSelectionId.id)
  ]);
  const isLightDuplicateTab = state.activeAssetTab === "light";
  const sourceItems = state.activeScene.items.filter(
    (duplicateCandidate: any) =>
      sourceItemIds.has(duplicateCandidate.id) &&
      LIGHT_ITEM_TYPES.has(duplicateCandidate.type) === isLightDuplicateTab
  );
  if (!sourceItems.length) {
    showToast("请先选择要复制的灯具、家具或电器。");
    return;
  }
  pushHistorySnapshot();
  /**
   * 副本相对原件的平面偏移量。固定取 0.12 米（换算成像素）而不是随机值：连续多次复制会形成
   */
  const duplicateOffsetPlan = (currentPixelsPerMeter() || 100) * 0.12;
  const duplicatedItems = sourceItems.map((duplicateSourceItem: any) => ({
    ...structuredClone(duplicateSourceItem),
    id: createId("item"),
    x: duplicateSourceItem.x + duplicateOffsetPlan,
    y: duplicateSourceItem.y + duplicateOffsetPlan
  }));
  normalizeLayerNames(duplicatedItems);
  state.activeScene.items.push(...duplicatedItems);
  if (duplicatedItems.length === 1) {
    setSelection("item", duplicatedItems[0].id);
  } else {
    state.primarySelection = null;
    state.multiSelection = duplicatedItems.map((duplicatedItem: any) => ({
      kind: "item",
      id: duplicatedItem.id
    }));
  }
  refreshStudio(
    sourceItems.some((duplicatedSource: any) => duplicatedSource.type === "flooropening")
      ? "all"
      : isLightDuplicateTab
        ? "lights"
        : "items"
  );
  markDocumentDirty();
  showToast("已复制 " + duplicatedItems.length + " 个物件。");
}
/**
 * 收集要放进剪贴板的物件（复制与剪切共用的取数逻辑）。与 duplicateSelection 同一套筛选
 */
function collectClipboardItems() {
  const clipboardSourceIds = new Set([
    ...(state.primarySelection?.kind === "item" ? [state.primarySelection.id] : []),
    ...state.multiSelection
      .filter((clipboardSelectionEntry: any) => clipboardSelectionEntry.kind === "item")
      .map((clipboardSelectionId: any) => clipboardSelectionId.id)
  ]);
  const isLightClipboardTab = state.activeAssetTab === "light";
  return state.activeScene.items.filter(
    (clipboardSourceItem: any) =>
      clipboardSourceIds.has(clipboardSourceItem.id) &&
      LIGHT_ITEM_TYPES.has(clipboardSourceItem.type) === isLightClipboardTab
  );
}
/**
 * 把选中物件深拷贝进模块级剪贴板（Ctrl/Cmd+C）。同时记下「复制来源楼层」的标定与楼层变换参数：
 */
function copySelectionToClipboard() {
  const copiedClipboardItems = collectClipboardItems();
  if (!copiedClipboardItems.length) {
    showToast("请先选择要复制的灯具、家具或电器。");
    return;
  }
  state.clipboardItems = copiedClipboardItems.map((clipboardSourceClone: any) =>
    structuredClone(clipboardSourceClone)
  );
  const clipboardOriginFloor = getCurrentFloor();
  state.clipboardSourceFloor = {
    id: clipboardOriginFloor.id,
    originX: clipboardOriginFloor.originX,
    originY: clipboardOriginFloor.originY,
    offsetX: clipboardOriginFloor.offsetX,
    offsetZ: clipboardOriginFloor.offsetZ,
    rotation: clipboardOriginFloor.rotation,
    scene: {
      calibration: structuredClone(state.activeScene.calibration)
    }
  };
  state.pasteOffsetStep = 0;
  showToast("已复制 " + state.clipboardItems.length + " 个物件，按 ⌘/Ctrl+V 粘贴。");
}
function pasteClipboardItems() {
  if (!state.clipboardItems.length) {
    showToast("暂无可粘贴的物件。");
    return;
  }
  if (
    state.clipboardItems.some((clipboardFloorOpening: any) => clipboardFloorOpening.type === "flooropening") &&
    !ensureCalibration()
  ) {
    return;
  }
  const isClipboardLightOnly = state.clipboardItems.every((clipboardLightCandidate: any) =>
    LIGHT_ITEM_TYPES.has(clipboardLightCandidate.type)
  );
  if (isClipboardLightOnly && state.activeAssetTab !== "light") {
    activateAssetTab("light");
  } else if (!isClipboardLightOnly && state.activeAssetTab === "light") {
    activateAssetTab("home");
  }
  pushHistorySnapshot();
  state.pasteOffsetStep += 1;
  const pasteOffsetPlan = (currentPixelsPerMeter() || 100) * 0.12 * state.pasteOffsetStep;
  const pastedItems = state.clipboardItems.map((pastedSourceItem: any) => ({
    ...structuredClone(pastedSourceItem),
    id: createId("item"),
    x: pastedSourceItem.x + pasteOffsetPlan,
    y: pastedSourceItem.y + pasteOffsetPlan,
    ...(pastedSourceItem.type === "flooropening" &&
    state.clipboardSourceFloor &&
    state.clipboardSourceFloor.id !== getCurrentFloor().id
      ? {
          ...convertBetweenFloors(pastedSourceItem, state.clipboardSourceFloor, getCurrentFloor()),
          rotation:
            pastedSourceItem.rotation +
            finite(state.clipboardSourceFloor.rotation, 0) -
            finite(getCurrentFloor().rotation, 0)
        }
      : {}),
    ...(LIGHT_ITEM_TYPES.has(pastedSourceItem.type) &&
    !state.activeScene.lightGroups.some(
      (pastedLightGroup: any) => pastedLightGroup.id === pastedSourceItem.lightGroupId
    )
      ? {
          lightGroupId: ensureActiveLightGroup().id
        }
      : {})
  }));
  normalizeLayerNames(pastedItems);
  state.activeScene.items.push(...pastedItems);
  if (pastedItems.length === 1) {
    setSelection("item", pastedItems[0].id);
  } else {
    state.primarySelection = null;
    state.multiSelection = pastedItems.map((pastedItem: any) => ({
      kind: "item",
      id: pastedItem.id
    }));
  }
  refreshStudio(
    pastedItems.some((pastedFloorOpening: any) => pastedFloorOpening.type === "flooropening")
      ? "all"
      : isClipboardLightOnly
        ? "lights"
        : "items"
  );
  markDocumentDirty();
  showToast("已粘贴 " + pastedItems.length + " 个物件。");
}
async function loadBackgroundTexture() {
  const backgroundLoadRevision = ++state.backgroundRevision;
  state.backgroundTexture = null;
  if (!state.activeScene.background?.url) {
    return;
  }
  const backgroundUrl = state.activeScene.background.url;
  await new Promise(resolveBackgroundLoad => {
    let hasBackgroundSettled = false;
    /**
     * 结束本次底图加载等待（幂等：load / error / 超时谁先到谁生效）。
     */
    const settleBackgroundLoad = () => {
      if (!hasBackgroundSettled) {
        hasBackgroundSettled = true;
        resolveBackgroundLoad(undefined);
      }
    };
    const backgroundImage = new Image();
    const backgroundLoadTimeoutId = window.setTimeout(settleBackgroundLoad, 2000);
    backgroundImage.addEventListener(
      "load",
      () => {
        if (
          backgroundLoadRevision !== state.backgroundRevision ||
          state.activeScene.background?.url !== backgroundUrl
        ) {
          settleBackgroundLoad();
          return;
        }
        state.backgroundTexture = backgroundImage;
        window.clearTimeout(backgroundLoadTimeoutId);
        if (hasBackgroundSettled) {
          renderPlanView();
        } else {
          settleBackgroundLoad();
        }
      },
      {
        once: true
      }
    );
    backgroundImage.addEventListener(
      "error",
      () => {
        window.clearTimeout(backgroundLoadTimeoutId);
        if (backgroundLoadRevision === state.backgroundRevision) {
          showToast("底图加载失败，请重新导入。", "error");
        }
        settleBackgroundLoad();
      },
      {
        once: true
      }
    );
    backgroundImage.src = backgroundUrl;
  });
}
/**
 * 上传用户选中的底图文件并设为当前楼层底图。前端先按扩展名粗筛（后端仍复验）。上传期间禁用按钮并改文案，防止同一张图
 */
async function uploadPlanImage(file: any) {
  if (file) {
    if (!/\.(png|jpe?g|webp|svg)$/i.test(file.name)) {
      showToast("仅支持 PNG、JPG、JPEG、WebP 和 SVG 图片。", "error");
      return;
    }
    importPlanButton.disabled = true;
    importPlanButton.textContent = "上传中…";
    try {
      const uploadResponse = await requestStudioApi("/assets/user", {
        method: "POST",
        body: file,
        headers: {
          "Content-Type": file.type || "application/octet-stream",
          "X-File-Name": encodeURIComponent(file.name)
        }
      });
      pushHistorySnapshot();
      state.activeScene.background = {
        assetId: uploadResponse.assetId,
        url: uploadResponse.url,
        name: uploadResponse.name,
        width: uploadResponse.width,
        height: uploadResponse.height
      };
      const backgroundFloor = getCurrentFloor();
      if (backgroundFloor && !backgroundFloor.originInitialized) {
        backgroundFloor.originX = uploadResponse.width / 2;
        backgroundFloor.originY = uploadResponse.height / 2;
        backgroundFloor.originInitialized = true;
      }
      state.activeScene.settings.backgroundVisible = true;
      await loadBackgroundTexture();
      fitViewToBounds();
      refreshStudio();
      markDocumentDirty();
      activateTool("scale");
      showToast("底图已导入，请在图上画一条已知长度的参考线。");
    } catch (uploadError: any) {
      showToast(uploadError.message || "底图上传失败。", "error");
    } finally {
      importPlanButton.disabled = false;
      importPlanButton.textContent = "导入";
    }
  }
}
/**
 * 重建「材质风格」下拉的档位。档位随物件类型变化（沙发是布艺组、柜类是木作组、洁具是陶瓷组…），
 */
function syncMaterialStyleOptions(itemType: any, selectedStyle: any) {
  const selectControl = selectElement("#material-style");
  const optionSignature = itemType + ":" + materialStyleOptionsFor(itemType).length;
  if (selectControl.dataset.optionSignature !== optionSignature) {
    selectControl.textContent = "";
    // 「跟随全局风格」永远排最前：它是默认值，也是「这块我不管」的出口。
    const autoOption = document.createElement("option");
    autoOption.value = MATERIAL_STYLE_AUTO;
    autoOption.textContent = materialStyleAutoLabel(itemType);
    selectControl.append(autoOption);
    for (const styleOption of materialStyleOptionsFor(itemType)) {
      const optionElement = document.createElement("option");
      optionElement.value = styleOption.id;
      optionElement.textContent = styleOption.label;
      selectControl.append(optionElement);
    }
    selectControl.dataset.optionSignature = optionSignature;
  }
  selectControl.value = normalizeMaterialStyle(itemType, selectedStyle);
  syncStudioSelect(selectControl);
}

/**
 * 重建「门材质」下拉的档位。档位随门型变化（玻璃门多出清玻 / 茶玻两档，实心门没有），
 */
function syncDoorMaterialOptions(doorType: any, selectedStyle: any) {
  const selectControl = selectElement("#door-material");
  const optionSignature = doorType + ":" + doorMaterialOptionsFor(doorType).length;
  if (selectControl.dataset.optionSignature !== optionSignature) {
    selectControl.textContent = "";
    // 「跟随全局风格」永远排最前：它是默认值，也是「这扇门我不管」的出口。
    const autoOption = document.createElement("option");
    autoOption.value = DOOR_MATERIAL_AUTO;
    autoOption.textContent = doorMaterialAutoLabel();
    selectControl.append(autoOption);
    for (const styleOption of doorMaterialOptionsFor(doorType)) {
      const optionElement = document.createElement("option");
      optionElement.value = styleOption.id;
      optionElement.textContent = styleOption.label;
      selectControl.append(optionElement);
    }
    selectControl.dataset.optionSignature = optionSignature;
  }
  selectControl.value = normalizeDoorMaterial(doorType, selectedStyle);
  syncStudioSelect(selectControl);
}

/**
 * 切换「高阴影质量」档位；降档时把阴影相机视锥还原回升档前的备份。升档前先备份 shadow.camera 的六向
 */
function setHighShadowQuality(isHighQuality: any) {
  const nextHighQuality = isHighQuality === true;
  if (nextHighQuality !== state.isHighShadowQuality) {
    if (nextHighQuality && state.mainDirectionalLight?.shadow?.camera) {
      const savedShadowCamera = state.mainDirectionalLight.shadow.camera;
      state.savedShadowCameraBounds = {
        left: savedShadowCamera.left,
        right: savedShadowCamera.right,
        top: savedShadowCamera.top,
        bottom: savedShadowCamera.bottom,
        near: savedShadowCamera.near,
        far: savedShadowCamera.far
      };
    }
    state.isHighShadowQuality = nextHighQuality;
    applyBaseLighting();
    if (!nextHighQuality && state.savedShadowCameraBounds && state.mainDirectionalLight?.shadow?.camera) {
      const restoredShadowCamera = state.mainDirectionalLight.shadow.camera;
      Object.assign(restoredShadowCamera, state.savedShadowCameraBounds);
      restoredShadowCamera.updateProjectionMatrix();
      state.savedShadowCameraBounds = null;
    }
    if (state.mainDirectionalLight?.shadow) {
      state.mainDirectionalLight.shadow.needsUpdate = true;
    }
    if (state.renderer?.domElement) {
      state.renderer.domElement.dataset.exportShadowQuality = nextHighQuality ? "high" : "realtime";
    }
  }
}
/**
 * 把 baseLighting 的当前值回填到「基础照明」面板的各个输入框上（模型 → 视图）。整数档位
 */
function syncBaseLightControlInputs() {
  for (const controlInput of baseLightControlInputs) {
    const controlValue = (state.baseLighting as any)[(controlInput as any).dataset.baseLightControl];
    const isIntegerStep = (controlInput as any).step === "5";
    syncControlValue(
      controlInput,
      isIntegerStep ? Math.round(controlValue) : Number(controlValue.toFixed(2))
    );
  }
}
/**
 * 应用一份基础光配置：归一化 → 回填控件 → 重设灯光 → 失效渲染。先 normalizeBaseLighting
 */
function applyBaseLightingSettings(lightingConfig: any) {
  const previousLighting = state.baseLighting;
  state.baseLighting = normalizeBaseLighting(lightingConfig);
  syncBaseLightControlInputs();
  applyBaseLighting();
  invalidateRender({
    shadows: Object.keys(DEFAULT_BASE_LIGHTING).some(
      configField => (previousLighting as any)[configField] !== (state.baseLighting as any)[configField]
    )
  });
}
/**
 * 打开基础光设置面板（必要时先回填一次文档里的配置）。挂载点跟着导出对话框走：对话框打开时面板必须挂进
 */
function openBaseLightingPanel() {
  if (!state.studioDocument || !baseLightControlsElement) {
    return;
  }
  const mountParent = exportDialogElement?.open ? exportDialogElement : document.body;
  if (baseLightControlsElement.parentElement !== mountParent) {
    mountParent.append(baseLightControlsElement);
  }
  if (baseLightControlsElement.hidden) {
    applyBaseLightingSettings(state.studioDocument.baseLighting);
  }
  baseLightControlsElement.hidden = false;
  const panelRect = baseLightControlsElement.getBoundingClientRect();
  if (
    panelRect.right > window.innerWidth - 8 ||
    panelRect.bottom > window.innerHeight - 8 ||
    panelRect.left < 8 ||
    panelRect.top < 8
  ) {
    moveFloatingPanelIntoBounds({
      panelElement: baseLightControlsElement,
      leftPx: panelRect.left,
      topPx: panelRect.top
    });
  }
}
function closeBaseLightingPanel() {
  if (baseLightControlsElement) {
    if (state.studioDocument) {
      applyBaseLightingSettings(state.studioDocument.baseLighting);
    }
    baseLightControlsElement.hidden = true;
  }
}
function saveBaseLighting() {
  if (!state.studioDocument) {
    return;
  }
  const normalizedLighting = normalizeBaseLighting(state.baseLighting);
  state.studioDocument.baseLighting = normalizedLighting;
  applyBaseLightingSettings(normalizedLighting);
  markDocumentDirty();
  state.lightingChannel?.postMessage({
    type: "base-lighting-saved",
    lighting: normalizedLighting
  });
  // 不能用「调用过 saveStudioDraft」当成功：冲突挂着或请求失败时它并不会落盘，
  saveStudioDraft().then(baseLightingSaveOutcome => {
    if (baseLightingSaveOutcome === "saved") {
      showToast("基础光设置已保存，导图和自动化控件已同步。", "success");
    } else if (
      baseLightingSaveOutcome === "blocked-by-conflict" ||
      baseLightingSaveOutcome === "blocked-by-interaction-confirmation"
    ) {
      showToast("基础光设置已记录，但户型草稿还没保存，请先处理顶栏的保存提示。", "error");
    }
  });
}
/**
 * 处理基础光面板单个控件的输入事件。只接受面板上真实存在的键（controlKey in baseLighting），防止
 */
function handleBaseLightControlInput(editedControlInput: any) {
  const controlKey = editedControlInput.dataset.baseLightControl;
  if (controlKey in state.baseLighting) {
    state.baseLighting = normalizeBaseLighting({
      ...state.baseLighting,
      [controlKey]: finite(editedControlInput.value, (state.baseLighting as any)[controlKey])
    });
    applyBaseLighting();
    invalidateRender({
      shadows: true
    });
  }
}
/**
 * 当前相机投影模式，只有透视与正交两种。用「是不是 perspective」来判断而非白名单校验
 */
function currentCameraMode() {
  if (cameraSettingsSource()?.cameraMode === "perspective") {
    return "perspective";
  } else {
    return "orthographic";
  }
}
/**
 * 计算俯视图相机的「上方向」向量，使平面图按相机顶旋角在屏幕上摆正。相机在俯视时 up 取
 */
function topViewUpVector(rotationDeg = currentTopRotationDeg()) {
  const rotationAngleRad = threeModuleMin.MathUtils.degToRad(rotationDeg);
  return new threeModuleMin.Vector3(Math.sin(rotationAngleRad), 0, -Math.cos(rotationAngleRad));
}
/**
 * 采集一帧的耗时样本（渲染循环每帧结束时调用）。只在「需要被度量的渲染」里采样：相机运动（或舞台播放动画）才关心帧率，
 */
function sampleFrameInterval(frameTimestampMs = performance.now()) {
  if (
    (!state.isCameraMotionActive && (!isStageViewerMode || !state.isMotionRendering)) ||
    state.exportRenderState ||
    state.isAdaptiveRenderActive ||
    !collectActiveLights().length
  ) {
    state.lastFrameTimestampMs = 0;
    return;
  }
  if (state.lastFrameTimestampMs > 0) {
    const frameIntervalMs = frameTimestampMs - state.lastFrameTimestampMs;
    if (
      frameIntervalMs >= 8 &&
      (frameIntervalMs <= 120 || (isStageViewerMode && frameIntervalMs <= 2000))
    ) {
      state.recentFrameDurationsMs.push(Math.min(frameIntervalMs, 120));
    }
  }
  state.lastFrameTimestampMs = frameTimestampMs;
  if (!(state.recentFrameDurationsMs.length < 24)) {
    assessFrameRateForAdaptive();
    state.recentFrameDurationsMs.splice(0, 12);
  }
}
function syncCameraModeButtons(cameraMode = currentCameraMode()) {
  for (const cameraModeButton of cameraModeButtons) {
    cameraModeButton.classList.toggle("active", (cameraModeButton as any).dataset.cameraMode === cameraMode);
  }
  syncFocalLengthInputs(cameraMode);
}
/**
 * 同步「视角」工具栏的选中态：高亮当前视角按钮，并只在顶视图下启用顶旋按钮。active 类与
 */
function syncCameraViewButtons(cameraView = currentCameraView()) {
  for (const cameraViewButton of cameraViewButtons) {
    const isCameraViewActive = (cameraViewButton as any).dataset.cameraView === cameraView;
    cameraViewButton.classList.toggle("active", isCameraViewActive);
    cameraViewButton.setAttribute("aria-pressed", String(isCameraViewActive));
  }
  for (const cameraRotateButton of cameraRotateTopButtons) {
    (cameraRotateButton as any).disabled = cameraView !== "top";
  }
}
/**
 * 把焦距回填到各处的焦距输入框，并按投影模式控制可用性。正交相机没有焦距概念，因此非透视
 */
function syncFocalLengthInputs(syncCameraMode = currentCameraMode()) {
  for (const focalLengthInputElement of cameraFocalLengthInputs) {
    syncControlValue(focalLengthInputElement, Math.round(currentFocalLength()));
    (focalLengthInputElement as any).disabled = syncCameraMode !== "perspective";
    focalLengthInputElement
      .closest(".camera-focal-control")
      ?.classList.toggle("is-disabled", (focalLengthInputElement as any).disabled);
  }
}
const LIGHT_FADE_DURATION_MS = 150;
function fadeLightGroups(groupIds: any, durationMs = LIGHT_FADE_DURATION_MS) {
  const targetGroupIds = [...new Set(groupIds)].filter(Boolean);
  if (!targetGroupIds.length) {
    return;
  }
  const groupFades = targetGroupIds.map(fadedGroupId => ({
    groupId: lightGroupScopeKey(state.activeFloorId, fadedGroupId),
    from: clamp(
      finite(
        state.brightnessByLightGroupKey.get(lightGroupScopeKey(state.activeFloorId, fadedGroupId)),
        findLightGroup(fadedGroupId)?.enabled === false ? 0 : 1
      ),
      0,
      1
    ),
    to: findLightGroup(fadedGroupId)?.enabled === false ? 0 : 1
  }));
  cancelAnimationFrame(state.lightGroupFadeFrame);
  if (!state.isLightCacheReady) {
    for (const immediateFade of groupFades) {
      state.brightnessByLightGroupKey.set(immediateFade.groupId, immediateFade.to);
    }
    if (!state.isLightCacheBuilding) {
      scheduleLightCacheBuild(0);
    }
    return;
  }
  const fadeStartMs = performance.now();
  /**
   * 淡入淡出的每帧推进：按缓动插值写回分组亮度并重新合成缓存图层。
   */
  const stepGroupFade = (fadeTimestampMs: any) => {
    const fadeProgress = clamp((fadeTimestampMs - fadeStartMs) / durationMs, 0, 1);
    const easedFadeProgress = fadeProgress * fadeProgress * (3 - fadeProgress * 2);
    for (const groupFade of groupFades) {
      state.brightnessByLightGroupKey.set(
        groupFade.groupId,
        groupFade.from + (groupFade.to - groupFade.from) * easedFadeProgress
      );
    }
    compositeLightCache();
    if (fadeProgress < 1) {
      state.lightGroupFadeFrame = requestAnimationFrame(stepGroupFade);
    } else {
      state.lightGroupFadeFrame = 0;
    }
  };
  state.lightGroupFadeFrame = requestAnimationFrame(stepGroupFade);
}
/**
 * 按 id 在当前楼层的灯光分组里查分组对象。
 */
function findLightGroup(lightGroupIdParam: any) {
  return (
    state.activeScene.lightGroups?.find(
      (lightGroupCandidate: any) => lightGroupCandidate.id === lightGroupIdParam
    ) || null
  );
}
function transitionLightGroups(transitionGroupIds: any, transitionDurationMs = LIGHT_FADE_DURATION_MS) {
  if (!state.previewModelRoot) {
    return false;
  }
  const transitionGroupIdSet = new Set(transitionGroupIds);
  const shouldForceLightOff = isAdaptiveLightCacheEnabled() && !state.exportRenderState;
  const lightTransitions: any = [];
  state.previewModelRoot.traverse((previewLightObject: any) => {
    if (
      !previewLightObject.isLight ||
      !transitionGroupIdSet.has(previewLightObject.userData?.lightGroupId)
    ) {
      return;
    }
    const targetLightIntensity =
      findLightGroup(previewLightObject.userData.lightGroupId)?.enabled !== false &&
      !shouldForceLightOff
        ? finite(previewLightObject.userData.lightOnIntensity, 0)
        : 0;
    if (targetLightIntensity > 0) {
      previewLightObject.visible = true;
    }
    lightTransitions.push({
      object: previewLightObject,
      from: finite(previewLightObject.intensity, 0),
      to: targetLightIntensity
    });
  });
  if (!lightTransitions.length) {
    return false;
  }
  if (lightTransitions.some(({ to: transitionTarget }: any) => transitionTarget > 0)) {
    applyShadowBudget(state.previewModelRoot, {
      rebuildAtlas: false
    });
  }
  cancelAnimationFrame(state.sceneTransitionFrame);
  const transitionStartMs = performance.now();
  /**
   * 灯光强度过渡的每帧推进（缓动同样是 smoothstep，与 fadeLightGroups 一致）。
   */
  const stepLightTransition = (transitionTimestampMs: any) => {
    const transitionProgress = clamp(
      (transitionTimestampMs - transitionStartMs) / transitionDurationMs,
      0,
      1
    );
    const easedTransitionProgress =
      transitionProgress * transitionProgress * (3 - transitionProgress * 2);
    for (const lightTransition of lightTransitions) {
      lightTransition.object.intensity =
        lightTransition.from +
        (lightTransition.to - lightTransition.from) * easedTransitionProgress;
    }
    requestRenderFrame();
    if (transitionProgress < 1) {
      state.sceneTransitionFrame = requestAnimationFrame(stepLightTransition);
    } else {
      state.sceneTransitionFrame = 0;
      let shouldHideLights = false;
      for (const hiddenLightTransition of lightTransitions) {
        if (!(hiddenLightTransition.to > 0)) {
          hiddenLightTransition.object.visible = false;
          shouldHideLights = true;
        }
      }
      if (shouldHideLights) {
        applyShadowBudget(state.previewModelRoot, {
          rebuildAtlas: false
        });
      }
    }
  };
  state.sceneTransitionFrame = requestAnimationFrame(stepLightTransition);
  return true;
}
function updateLightGroupsEnabled(enabledGroupIds: any) {
  const enabledGroupIdList = [...new Set(enabledGroupIds)].filter(Boolean);
  if (isAdaptiveLightCacheEnabled() && !state.exportRenderState) {
    fadeLightGroups(enabledGroupIdList);
  } else if (!transitionLightGroups(enabledGroupIdList)) {
    applySceneRefresh({
      scope: "lights",
      preserveLightCache: true
    });
  }
  renderLightGroupList();
  renderInspector();
  renderPlanView();
  applyRenderQualityMode();
  scheduleLightPrecompile();
}
function invalidateLightCacheSoon() {
  if (!!isAdaptiveLightCacheEnabled() && !state.exportRenderState && !state.isLightCacheBuilding) {
    state.needsLightCacheRefresh = true;
    scheduleLightCacheBuild(0);
    applyRenderQualityMode();
  }
}
function beginExportRender() {
  window.clearTimeout(state.sceneUpdateTimer);
  state.sceneUpdateTimer = null;
  state.isExportRendering = true;
  window.clearTimeout(state.lightCacheSettleTimer);
  state.lightCacheSettleTimer = null;
  if (state.isLightCacheBuilding) {
    state.lightCacheRevision += 1;
    state.needsLightCacheRefresh = true;
  }
}
function endExportRender() {
  window.clearTimeout(state.sceneUpdateTimer);
  state.sceneUpdateTimer = window.setTimeout(() => {
    state.sceneUpdateTimer = null;
    state.isExportRendering = false;
    if (pendingSceneUpdateScopes.size && !state.isSceneUpdateQueued) {
      const pendingRefreshScopes = [...pendingSceneUpdateScopes];
      const nextRefreshScope = pendingRefreshScopes.includes("all")
        ? "all"
        : pendingRefreshScopes[0];
      applySceneRefresh({
        scope: nextRefreshScope,
        preserveLightCache: !state.shouldInvalidateLightCache
      });
    }
    if (state.needsLightCacheRefresh) {
      scheduleLightCacheBuild(420);
    }
    if (state.isPrecompilePending) {
      schedulePreviewRebuild();
    }
  }, 120);
}
/**
 * 刷新导出侧栏里与「视角」相关的控件可见性与文案（单层视角 / 全楼总览两套）。两种模式互斥：单层模式显示楼层视角操作、
 */
function syncCameraViewControls() {
  const hasMultipleFloors = (state.studioDocument?.floors.length || 0) > 1;
  const isCameraOverviewMode = currentPreviewFloorMode() === "all";
  floorCameraActionsElement.hidden = isCameraOverviewMode;
  overviewCameraActionsElement.hidden = !hasMultipleFloors || !isCameraOverviewMode;
  previewFloorGapControlElement.hidden = !hasMultipleFloors || !isCameraOverviewMode;
  syncControlValue(previewFloorGapInput, finite(state.studioDocument?.previewFloorGap, 3).toFixed(1));
  previewFloorUniformControlElement.hidden = !hasMultipleFloors || !isCameraOverviewMode;
  previewFloorUniformInput.checked = state.studioDocument?.uniformOverviewStack === true;
  const hasFloorFixedView = !!state.activeScene.settings?.fixedCameraView;
  const hasOverviewFixedView = !!state.studioDocument?.combinedFixedCameraView;
  fixedCameraViewInput.disabled = !hasFloorFixedView;
  fixedCameraViewInput.classList.toggle("has-saved-view", hasFloorFixedView);
  fixedOverviewViewInput.disabled = !hasOverviewFixedView;
  fixedOverviewViewInput.classList.toggle("has-saved-view", hasOverviewFixedView);
  const hasFixedCameraView = isCameraOverviewMode ? hasOverviewFixedView : hasFloorFixedView;
  exportSaveViewButton.textContent = isCameraOverviewMode ? "保存总览" : "保存视角";
  exportSaveViewButton.title = isCameraOverviewMode
    ? "记录当前导图的全楼角度和投影方式"
    : "记录当前导图的角度、缩放和投影方式";
  selectElement("#export-use-fixed").textContent = isCameraOverviewMode ? "恢复总览" : "恢复视角";
  selectElement("#export-use-fixed").title = isCameraOverviewMode
    ? "恢复已保存的全楼总览视角"
    : "恢复当前楼层已保存的视角";
  selectElement("#export-use-fixed").disabled = !!state.isExportBusy || !hasFixedCameraView;
  selectElement("#export-use-fixed").classList.toggle("has-saved-view", hasFixedCameraView);
}
/**
 * 取当前模式下已保存的固定相机视角快照。总览模式读文档级的 combinedFixedCameraView，
 */
function savedCameraView() {
  if (currentPreviewFloorMode() === "all") {
    return state.studioDocument?.combinedFixedCameraView;
  } else {
    return state.activeScene.settings?.fixedCameraView;
  }
}
function storeCameraView(cameraViewSnapshot: any) {
  if (currentPreviewFloorMode() === "all") {
    state.studioDocument.combinedFixedCameraView = cameraViewSnapshot;
  } else {
    state.activeScene.settings.fixedCameraView = cameraViewSnapshot;
  }
}
/**
 * 把当前相机状态存成「固定视角」书签并立即落盘。快照覆盖恢复所需的一切：投影方式、视角标识、顶旋角、位置与 target、
 */
async function saveCurrentCameraView() {
  if (!state.previewCamera || !state.orbitControls) {
    return;
  }
  const viewLabel = currentPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
  if (!state.exportRenderState) {
    pushHistorySnapshot();
  }
  const savedTarget = state.orbitControls.target;
  storeCameraView({
    mode: state.previewCamera.isPerspectiveCamera ? "perspective" : "orthographic",
    view: currentCameraView(),
    topRotation: currentTopRotationDeg(),
    position: {
      x: state.previewCamera.position.x,
      y: state.previewCamera.position.y,
      z: state.previewCamera.position.z
    },
    target: {
      x: savedTarget.x,
      y: savedTarget.y,
      z: savedTarget.z
    },
    visibleHeight: measureVisibleHeight(state.previewCamera, savedTarget),
    fov: state.previewCamera.isPerspectiveCamera ? state.previewCamera.fov : 36,
    focalLength: state.previewCamera.isPerspectiveCamera ? currentFocalLength() : null
  });
  syncCameraViewControls();
  if (state.exportRenderState) {
    exportStatusElement.textContent = viewLabel + "已保存";
    const exportViewSaveOutcome = await saveStudioDraft();
    showToast(
      exportViewSaveOutcome === "saved" || exportViewSaveOutcome === "no-changes"
        ? viewLabel + "已保存。"
        : viewLabel + "已记录，待顶栏保存提示处理后再落盘。"
    );
    return;
  }
  markDocumentDirty();
  window.clearTimeout(state.autosaveTimer);
  state.autosaveTimer = null;
  const cameraViewSaveOutcome = await saveStudioDraft();
  // 冲突 / 未确认的删除影响 / 失败时不能说「已保存」：那正是用户以为改动落盘了、实际没有的那种情况。
  if (
    cameraViewSaveOutcome === "blocked-by-conflict" ||
    cameraViewSaveOutcome === "blocked-by-interaction-confirmation" ||
    cameraViewSaveOutcome === "failed"
  ) {
    showToast(viewLabel + "已记录，待顶栏保存提示处理后再落盘。", "error");
  } else if (state.changeRevision === state.savedRevision) {
    showToast(viewLabel + "已保存。");
  } else {
    showToast(viewLabel + "已记录，正在保存…");
  }
}
function restoreStoredCameraView(restoreViewOptions: any = {}) {
  const storedView = savedCameraView();
  if (!storedView || !state.previewCamera || !state.orbitControls) {
    return;
  }
  const modeChanged = storedView.mode !== currentCameraMode();
  const viewChanged = storedView.view !== currentCameraView();
  const topRotationChanged = storedView.topRotation !== currentTopRotationDeg();
  const focalLengthChanged =
    storedView.focalLength !== null &&
    Math.abs(storedView.focalLength - currentFocalLength()) > 1e-8;
  const shouldRecordChange = restoreViewOptions.recordChange !== false;
  if (
    (modeChanged || viewChanged || topRotationChanged || focalLengthChanged) &&
    shouldRecordChange
  ) {
    pushHistorySnapshot();
  }
  const storedCameraSettings = cameraSettingsSource();
  storedCameraSettings.cameraMode = storedView.mode;
  storedCameraSettings.cameraView = storedView.view;
  storedCameraSettings.cameraTopRotation = storedView.topRotation;
  if (storedView.focalLength !== null) {
    storedCameraSettings.cameraFocalLength = storedView.focalLength;
  }
  applyCameraMode(storedView.mode, {
    preserveView: false
  });
  const cameraTargetVector = new threeModuleMin.Vector3(
    storedView.target.x,
    storedView.target.y,
    storedView.target.z
  );
  state.previewCamera.position.set(storedView.position.x, storedView.position.y, storedView.position.z);
  state.previewCamera.up.copy(
    storedView.view === "top"
      ? topViewUpVector(storedView.topRotation)
      : new threeModuleMin.Vector3(0, 1, 0)
  );
  state.previewCamera.userData.frameSize = storedView.visibleHeight;
  state.previewCamera.userData.cameraView = storedView.view;
  state.previewCamera.userData.topRotation = storedView.topRotation;
  state.previewCamera.userData.viewportAspect ||= Math.max(
    selectElement("#preview-3d").clientWidth /
      Math.max(selectElement("#preview-3d").clientHeight, 1),
    0.1
  );
  state.previewCamera.zoom = 1;
  if (state.previewCamera.isPerspectiveCamera) {
    state.previewCamera.aspect = state.previewCamera.userData.viewportAspect;
    if (storedView.focalLength !== null) {
      applyFocalLength(state.previewCamera, storedView.focalLength);
    } else {
      state.previewCamera.fov = storedView.fov;
      state.previewCamera.updateProjectionMatrix();
      storedCameraSettings.cameraFocalLength = clamp(state.previewCamera.getFocalLength(), 18, 120);
    }
  } else {
    applyOrthographicFrame(
      storedView.visibleHeight,
      state.previewCamera.userData.viewportAspect,
      state.previewCamera
    );
  }
  updateCameraClipPlanes(state.previewCamera, cameraTargetVector);
  state.previewCamera.lookAt(cameraTargetVector);
  state.previewCamera.updateProjectionMatrix();
  state.orbitControls.target.copy(cameraTargetVector);
  applyRenderQualityMode();
  state.orbitControls.update();
  syncCameraModeButtons(storedView.mode);
  syncCameraViewButtons(storedView.view);
  if (
    (modeChanged || viewChanged || topRotationChanged || focalLengthChanged) &&
    shouldRecordChange
  ) {
    markDocumentDirty();
  }
  if (!restoreViewOptions.silent) {
    const restoreViewLabel = currentPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
    showToast("已恢复上次保存的" + restoreViewLabel + "。");
  }
}
/**
 * 切换相机视角（free / top），必要时重排相机位置。顶视图把相机抬到目标上方（透视按可视高度
 */
function applyCameraView(requestedView: any, viewRequestOptions: any = {}) {
  const normalizedView = requestedView === "top" ? "top" : "free";
  const topRotationDeg = currentTopRotationDeg();
  syncCameraViewButtons(normalizedView);
  if (!state.previewCamera || !state.orbitControls) {
    return;
  }
  if (
    state.previewCamera.userData.cameraView === normalizedView &&
    (normalizedView !== "top" || state.previewCamera.userData.topRotation === topRotationDeg) &&
    viewRequestOptions.force !== true
  ) {
    applyRenderQualityMode();
    return;
  }
  if (normalizedView === "free") {
    resetCameraView({
      view: "free"
    });
    return;
  }
  const cameraTarget = state.orbitControls.target.clone();
  const visibleHeight = measureVisibleHeight(state.previewCamera, cameraTarget);
  const targetDistanceToCamera = Math.max(state.previewCamera.position.distanceTo(cameraTarget), 8);
  state.previewCamera.up.copy(topViewUpVector(topRotationDeg));
  if (state.previewCamera.isPerspectiveCamera) {
    applyFocalLength();
    const topViewFovRad = threeModuleMin.MathUtils.degToRad(state.previewCamera.getEffectiveFOV());
    const cameraHeight = Math.max(visibleHeight / (Math.tan(topViewFovRad / 2) * 2), 8);
    state.previewCamera.position.set(cameraTarget.x, cameraTarget.y + cameraHeight, cameraTarget.z);
  } else {
    applyOrthographicFrame(
      visibleHeight,
      state.previewCamera.userData.viewportAspect || 1,
      state.previewCamera
    );
    state.previewCamera.position.set(
      cameraTarget.x,
      cameraTarget.y + targetDistanceToCamera,
      cameraTarget.z
    );
  }
  state.previewCamera.userData.frameSize = visibleHeight;
  state.previewCamera.userData.cameraView = "top";
  state.previewCamera.userData.topRotation = topRotationDeg;
  updateCameraClipPlanes(state.previewCamera, cameraTarget);
  state.previewCamera.lookAt(cameraTarget);
  state.previewCamera.updateProjectionMatrix();
  state.orbitControls.target.copy(cameraTarget);
  applyRenderQualityMode();
  state.orbitControls.update();
}
function applyCameraMode(requestedMode: any, modeOptions: any = {}) {
  const normalizedMode = requestedMode === "perspective" ? "perspective" : "orthographic";
  syncCameraModeButtons(normalizedMode);
  if (!state.renderer) {
    return;
  }
  if ((normalizedMode === "perspective") == !!state.previewCamera?.isPerspectiveCamera) {
    applyFocalLength();
    applyRenderQualityMode();
    return;
  }
  const shouldPreserveView = modeOptions.preserveView !== false;
  const previousCamera = state.previewCamera;
  const orbitTarget = state.orbitControls?.target.clone() || new threeModuleMin.Vector3(0, 0.6, 0);
  const offsetVector = previousCamera
    ? previousCamera.position.clone().sub(orbitTarget)
    : new threeModuleMin.Vector3(1.12, 1.42, 1.2);
  const offsetLength = Math.max(offsetVector.length(), 2);
  const cameraDirection =
    offsetVector.lengthSq() > 1e-8
      ? offsetVector.normalize()
      : new threeModuleMin.Vector3(1.12, 1.42, 1.2).normalize();
  const viewportAspect =
    previousCamera?.userData.viewportAspect ||
    Math.max(
      selectElement("#preview-3d").clientWidth /
        Math.max(selectElement("#preview-3d").clientHeight, 1),
      0.1
    );
  const currentVisibleHeight =
    shouldPreserveView && previousCamera
      ? measureVisibleHeight(previousCamera, orbitTarget)
      : previousCamera?.userData.frameSize || 10;
  state.orbitControls?.dispose();
  if (normalizedMode === "perspective") {
    state.previewCamera = new threeModuleMin.PerspectiveCamera(36, viewportAspect, 0.02, 200);
    applyFocalLength(state.previewCamera);
    const perspectiveDistance =
      currentVisibleHeight /
      (Math.tan(threeModuleMin.MathUtils.degToRad(state.previewCamera.getEffectiveFOV()) / 2) * 2);
    const placementDistance = shouldPreserveView ? perspectiveDistance : offsetLength;
    state.previewCamera.position
      .copy(orbitTarget)
      .addScaledVector(cameraDirection, Math.max(placementDistance, 2));
  } else {
    state.previewCamera = new threeModuleMin.OrthographicCamera(-5, 5, 5, -5, 0.02, 200);
    state.previewCamera.position.copy(orbitTarget).addScaledVector(cameraDirection, offsetLength);
    applyOrthographicFrame(currentVisibleHeight, viewportAspect, state.previewCamera);
  }
  state.previewCamera.layers.enable(PREVIEW_OBJECT_LAYER);
  state.previewCamera.userData.viewportAspect = viewportAspect;
  state.previewCamera.userData.frameSize = currentVisibleHeight;
  state.previewCamera.userData.cameraView = previousCamera?.userData.cameraView || "free";
  state.previewCamera.userData.topRotation = previousCamera?.userData.topRotation || 0;
  state.previewCamera.up.copy(previousCamera?.up || new threeModuleMin.Vector3(0, 1, 0));
  updateCameraClipPlanes(state.previewCamera, orbitTarget);
  state.previewCamera.lookAt(orbitTarget);
  state.previewCamera.updateProjectionMatrix();
  state.orbitControls = createOrbitControls(state.previewCamera);
  state.orbitControls.target.copy(orbitTarget);
  applyRenderQualityMode();
  if (!isStageViewerMode || modeOptions.deferControlUpdate !== true) {
    state.orbitControls.update();
  }
}
/**
 * 判断这次初始化失败是不是「创建 WebGL 上下文」失败。
 */
function isWebglContextCreationFailure(stageInitError: any) {
  return /Error creating WebGL context/.test(String(stageInitError?.message || ""));
}
async function initializeStudioStage({ isRetry = false } = {}) {
  const stageContainer = selectElement("#preview-3d");
  try {
    state.previewOverlayScene = new threeModuleMin.Scene();
    state.previewCamera = new threeModuleMin.OrthographicCamera(-5, 5, 5, -5, 0.05, 200);
    state.previewCamera.layers.enable(PREVIEW_OBJECT_LAYER);
    state.renderer = new threeModuleMin.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: "high-performance"
    });
    if (isStageViewerMode) {
      state.renderer.domElement.addEventListener("webglcontextrestored", () => {
        state.appliedLightPrecompileSignature = "";
        precompiledLightSignatures.clear();
        scheduleLightPrecompile();
      });
    }
    state.renderer.setPixelRatio(targetPixelRatio());
    state.renderer.outputColorSpace = threeModuleMin.SRGBColorSpace;
    state.renderer.toneMapping = threeModuleMin.NeutralToneMapping;
    state.renderer.toneMappingExposure = 1.04;
    state.renderer.shadowMap.enabled = !isRegionLightingEnabled;
    state.renderer.shadowMap.type = threeModuleMin.VSMShadowMap;
    stageContainer.append(state.renderer.domElement);
    state.orbitControls = createOrbitControls(state.previewCamera);
    updateModelLoadingStatus();
    syncCameraModeButtons("orthographic");
    syncCameraViewButtons();
    state.hemisphereLight = new threeModuleMin.HemisphereLight(12504556, 1515053, 1.12);
    state.hemisphereLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.hemisphereLight);
    state.ambientLight = new threeModuleMin.AmbientLight(7175581, 0.42);
    state.ambientLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.ambientLight);
    state.mainDirectionalLight = new threeModuleMin.DirectionalLight(14543103, 2.05);
    state.mainDirectionalLight.position.set(-7, 22, 6);
    state.mainDirectionalLight.castShadow = true;
    state.mainDirectionalLight.shadow.mapSize.set(2048, 2048);
    state.mainDirectionalLight.shadow.camera.left = -20;
    state.mainDirectionalLight.shadow.camera.right = 20;
    state.mainDirectionalLight.shadow.camera.top = 20;
    state.mainDirectionalLight.shadow.camera.bottom = -20;
    state.mainDirectionalLight.shadow.autoUpdate = false;
    state.mainDirectionalLight.shadow.needsUpdate = true;
    state.mainDirectionalLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.mainDirectionalLight);
    state.fillDirectionalLight = new threeModuleMin.DirectionalLight(8886724, 0.72);
    state.fillDirectionalLight.position.set(9, 7, -10);
    state.fillDirectionalLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.fillDirectionalLight);
    state.topDirectionalLight = new threeModuleMin.DirectionalLight(15791103, 0.68);
    state.topDirectionalLight.position.set(0, 16, 1);
    state.topDirectionalLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.topDirectionalLight);
    state.previewModelRoot = new threeModuleMin.Group();
    state.previewOverlayScene.add(state.previewModelRoot);
    let overviewLayoutDocument: any;
    let overviewLayoutRevision: any;
    let overviewCenter = [0, 0, 0];
    let overviewBoundsByFloor = new Map();
    state.overviewStackController = createOverviewStack({
      THREE: threeModuleMin,
      renderer: state.renderer,
      scene: state.previewOverlayScene,
      getCamera: () => state.previewCamera,
      getLayout: () => {
        const documentFloors = state.studioDocument?.floors || [];
        const floorGap = state.exportRenderState
          ? finite(state.studioDocument?.exportFloorGap, 3)
          : finite(state.studioDocument?.previewFloorGap, 3);
        if (
          state.studioDocument?.uniformOverviewStack &&
          (overviewLayoutDocument !== state.studioDocument ||
            overviewLayoutRevision !== state.sceneCacheRevision)
        ) {
          const floorsBounds = new threeModuleMin.Box3();
          overviewBoundsByFloor = new Map();
          for (const overviewSourceFloor of documentFloors) {
            const floorWallVertices = [];
            for (const floorWall of overviewSourceFloor.scene.walls) {
              for (const wallPoint of [floorWall.start, floorWall.end]) {
                const floorScenePoint = floorPointToScenePoint(overviewSourceFloor, wallPoint);
                floorsBounds.expandByPoint(
                  new threeModuleMin.Vector3(floorScenePoint.x, 0, floorScenePoint.z)
                );
                floorWallVertices.push(
                  [floorScenePoint.x, 0, floorScenePoint.z],
                  [floorScenePoint.x, finite(floorWall.height, 2.8), floorScenePoint.z]
                );
              }
            }
            overviewBoundsByFloor.set(overviewSourceFloor.id, floorWallVertices);
          }
          overviewCenter = (
            floorsBounds.isEmpty()
              ? new threeModuleMin.Vector3()
              : floorsBounds.getCenter(new threeModuleMin.Vector3())
          ).toArray();
          overviewLayoutDocument = state.studioDocument;
          overviewLayoutRevision = state.sceneCacheRevision;
        }
        return {
          enabled: state.studioDocument?.uniformOverviewStack === true,
          floors: documentFloors,
          gap: floorGap,
          bounds: overviewBoundsByFloor,
          center: [
            overviewCenter[0],
            ((documentFloors.length - 1) * floorGap) / 2,
            overviewCenter[2]
          ],
          amount: state.overviewStackAmount ?? (currentPreviewFloorMode() === "all" ? 1 : 0)
        };
      }
    });
    window.addEventListener("pagehide", () => state.overviewStackController?.dispose(), {
      once: true
    });
    if (isRegionLightingEnabled) {
      state.contactShadowController = createContactShadowController({
        THREE: threeModuleMin,
        renderer: state.renderer,
        getRoot: () => state.previewModelRoot,
        requestFrame: requestRenderFrame,
        canBuild: () =>
          externalModelManager.modelLoadState().active === 0 &&
          externalModelManager.modelLoadState().queued === 0
      });
      state.regionLightController = createRegionLightController({
        THREE: threeModuleMin,
        renderer: state.renderer,
        scene: state.previewOverlayScene,
        getRoot: () => state.previewModelRoot,
        contactShadows: state.contactShadowController,
        requestFrame: requestRenderFrame
      });
    } else {
      state.spotShadowAtlasController = createSpotShadowAtlasController({
        THREE: threeModuleMin,
        renderer: state.renderer,
        scene: state.previewOverlayScene,
        camera: state.previewCamera,
        syncBeforeRender: isStageViewerMode,
        requestFrame: requestRenderFrame,
        canBuild: () =>
          !document.hidden &&
          !state.exportRenderState &&
          !state.isCameraMotionActive &&
          !state.isMotionRendering &&
          !state.isCurtainMoving &&
          !state.isVacuumMoving &&
          !state.isBackgroundFrameVisible &&
          !state.isExportRendering &&
          !state.isLightCacheBuilding &&
          externalModelManager.modelLoadState().active === 0 &&
          externalModelManager.modelLoadState().queued === 0
      });
    }
    applyBaseLighting();
    state.resizeObserver = new ResizeObserver(handleStageResize);
    state.resizeObserver.observe(stageContainer);
    resetCameraView();
    let lastFrameTimeMs = performance.now();
    let lastMotionFrameTimeMs = -Infinity;
    const renderFrame = (rafTimestampMs = performance.now()) => {
      if (!state.renderer) {
        return Infinity;
      }
      const frameDeltaSeconds = Math.min(
        Math.max((rafTimestampMs - lastFrameTimeMs) / 1000, 0),
        0.05
      );
      lastFrameTimeMs = rafTimestampMs;
      if (document.hidden) {
        return Infinity;
      }
      const controlsChanged = state.orbitControls.update(frameDeltaSeconds);
      if (controlsChanged) {
        lastMotionFrameTimeMs = rafTimestampMs;
      }
      const idleDelayMs = rafTimestampMs - lastMotionFrameTimeMs < 600 ? 0 : Infinity;
      if (controlsChanged) {
        state.needsRender = true;
      }
      if (!state.needsRender && state.hasRenderedFrame) {
        return idleDelayMs;
      }
      state.needsRender = false;
      state.renderer.render(state.previewOverlayScene, state.previewCamera);
      sampleFrameInterval();
      state.hasRenderedFrame = true;
      if (isStageViewerMode) {
        state.renderer.domElement.dispatchEvent(new Event("hb-i3d-camera-frame"));
      }
      return idleDelayMs;
    };
    state.demandFrameLoop = createDemandFrameLoop({
      onWake() {
        lastFrameTimeMs = performance.now();
      },
      step(stepTimestampMs) {
        return renderFrame(stepTimestampMs);
      }
    });
    const wakeFrameLoop = () => state.demandFrameLoop.wake();
    const syncFrameLoopAvailability = () => {
      lastFrameTimeMs = performance.now();
      const frameLoopEnabled = !document.hidden && state.isFrameLoopAvailable;
      state.demandFrameLoop.setAvailable(frameLoopEnabled);
      if (frameLoopEnabled) {
        requestRenderFrame();
        if (state.needsLightCacheRefresh) {
          scheduleLightCacheBuild();
        }
      } else {
        window.clearTimeout(state.lightCacheSettleTimer);
        state.lightCacheSettleTimer = null;
      }
    };
    if (isStageViewerMode) {
      const handleParentVisibilityChange = (visibilityEvent: any) => {
        state.isFrameLoopAvailable = visibilityEvent.detail === true;
        syncFrameLoopAvailability();
        if (state.isFrameLoopAvailable && state.shouldRerunLightPrecompile) {
          scheduleLightPrecompile();
        }
      };
      state.renderer.domElement.addEventListener(
        "hb-i3d-parent-visibility",
        handleParentVisibilityChange
      );
      for (const eventName of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "wheel",
        "keydown",
        "keyup"
      ]) {
        state.renderer.domElement.addEventListener(eventName, wakeFrameLoop, {
          passive: true
        });
      }
      document.addEventListener("visibilitychange", syncFrameLoopAvailability);
      window.addEventListener(
        "pagehide",
        () => {
          state.demandFrameLoop.dispose();
          document.removeEventListener("visibilitychange", syncFrameLoopAvailability);
          state.spotShadowAtlasController?.dispose?.();
          state.regionLightController?.dispose();
          state.contactShadowController?.dispose();
          state.renderer.domElement.removeEventListener(
            "hb-i3d-parent-visibility",
            handleParentVisibilityChange
          );
          for (const cleanupEventName of [
            "pointerdown",
            "pointermove",
            "pointerup",
            "pointercancel",
            "wheel",
            "keydown",
            "keyup"
          ]) {
            state.renderer.domElement.removeEventListener(cleanupEventName, wakeFrameLoop);
          }
        },
        {
          once: true
        }
      );
      syncFrameLoopAvailability();
      wakeFrameLoop();
    } else {
      for (const eventName of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "wheel",
        "keydown",
        "keyup"
      ]) {
        state.renderer.domElement.addEventListener(eventName, wakeFrameLoop, {
          passive: true
        });
      }
      document.addEventListener("visibilitychange", syncFrameLoopAvailability);
      syncFrameLoopAvailability();
      wakeFrameLoop();
    }
  } catch (webglInitError) {
    // 建不出上下文先重试一次（只一次）：GPU 进程刚重启、或显存一时腾不出来时（macOS 上
    if (!state.renderer && !isRetry && isWebglContextCreationFailure(webglInitError)) {
      await new Promise(resolveStageRetry => window.setTimeout(resolveStageRetry, 1000));
      await initializeStudioStage({
        isRetry: true
      });
      return;
    }
    selectElement("#webgl-message").hidden = false;
    window.HABridgeLog?.error?.(webglInitError, {
      phase: "studio-webgl-init"
    });
    debugLog("error", webglInitError);
    // 渲染器根本没建起来时这一页后面每一步都直接用 renderer，继续往下跑只会以
    if (!state.renderer) {
      throw new Error("当前浏览器无法创建 3D 画面，可能是显卡资源不足或已被其它 3D 页面占用，请关闭后重试。");
    }
  }
}
/**
 * 按可视高度与视口纵横比设置正交相机的视锥边界。aspect ≥ 1 时以高度为准向两侧扩宽；
 */
function applyOrthographicFrame(frameVisibleHeight: any, aspect: any, orthoCamera = state.previewCamera) {
  if (!orthoCamera?.isOrthographicCamera) {
    return;
  }
  const halfHeight = Math.max(frameVisibleHeight, 1) / 2;
  if (aspect >= 1) {
    orthoCamera.left = -halfHeight * aspect;
    orthoCamera.right = halfHeight * aspect;
    orthoCamera.top = halfHeight;
    orthoCamera.bottom = -halfHeight;
  } else {
    orthoCamera.left = -halfHeight;
    orthoCamera.right = halfHeight;
    orthoCamera.top = halfHeight / Math.max(aspect, 0.1);
    orthoCamera.bottom = -halfHeight / Math.max(aspect, 0.1);
  }
  orthoCamera.updateProjectionMatrix();
}
function handleStageResize() {
  if (!state.renderer) {
    return;
  }
  if (state.exportRenderState) {
    resizeExportStage();
    return;
  }
  const resizeContainer = selectElement("#preview-3d");
  const resizeStageWidthPx = Math.max(resizeContainer.clientWidth, 1);
  const resizeStageHeightPx = Math.max(resizeContainer.clientHeight, 1);
  const currentCanvasSize = isStageViewerMode
    ? state.renderer.getSize(new threeModuleMin.Vector2())
    : null;
  const isCanvasSizeCurrent =
    currentCanvasSize?.x === resizeStageWidthPx && currentCanvasSize?.y === resizeStageHeightPx;
  const projectionSignature = isStageViewerMode
    ? state.previewCamera.projectionMatrix.elements.join(",")
    : "";
  if (!isCanvasSizeCurrent) {
    state.renderer.setSize(resizeStageWidthPx, resizeStageHeightPx, false);
  }
  state.previewCamera.userData.viewportAspect = resizeStageWidthPx / resizeStageHeightPx;
  if (state.previewCamera.isOrthographicCamera) {
    applyOrthographicFrame(
      state.previewCamera.userData.frameSize || 10,
      state.previewCamera.userData.viewportAspect
    );
  } else {
    state.previewCamera.aspect = state.previewCamera.userData.viewportAspect;
    applyFocalLength();
  }
  if (
    !isCanvasSizeCurrent ||
    projectionSignature !== state.previewCamera.projectionMatrix.elements.join(",")
  ) {
    invalidateRender();
  }
}
/**
 * 采集当前相机状态快照，供导出 / 打印流程保存与还原。
 */
function captureCameraSnapshot() {
  if (!state.previewCamera || !state.orbitControls) {
    return null;
  } else {
    return {
      mode: state.previewCamera.isPerspectiveCamera ? "perspective" : "orthographic",
      cameraView: state.previewCamera.userData.cameraView || currentCameraView(),
      topRotation: state.previewCamera.userData.topRotation || 0,
      position: state.previewCamera.position.clone(),
      target: state.orbitControls.target.clone(),
      up: state.previewCamera.up.clone(),
      zoom: state.previewCamera.zoom,
      visibleHeight: measureVisibleHeight(state.previewCamera, state.orbitControls.target),
      frameSize:
        state.previewCamera.userData.frameSize ||
        measureVisibleHeight(state.previewCamera, state.orbitControls.target),
      viewportAspect: state.previewCamera.userData.viewportAspect || 1,
      fov: state.previewCamera.isPerspectiveCamera ? state.previewCamera.fov : 36,
      near: state.previewCamera.near,
      far: state.previewCamera.far
    };
  }
}
/**
 * 把相机快照应用到当前相机与控制器（导出 / 打印前的还原入口）。快照里的投影模式可能与当前
 */
function applyCameraSnapshot(snapshot: any, snapshotAspect = snapshot?.viewportAspect || 1) {
  if (!!snapshot && !!state.renderer) {
    applyCameraMode(snapshot.mode, {
      preserveView: false
    });
    state.previewCamera.position.copy(snapshot.position);
    state.previewCamera.up.copy(snapshot.up);
    state.previewCamera.zoom = snapshot.zoom || 1;
    state.previewCamera.near = snapshot.near;
    state.previewCamera.far = snapshot.far;
    state.previewCamera.userData.frameSize = snapshot.frameSize;
    state.previewCamera.userData.viewportAspect = snapshotAspect;
    state.previewCamera.userData.cameraView = snapshot.cameraView || currentCameraView();
    state.previewCamera.userData.topRotation = snapshot.topRotation || 0;
    if (state.previewCamera.isPerspectiveCamera) {
      state.previewCamera.fov = snapshot.fov;
      state.previewCamera.aspect = snapshotAspect;
    } else {
      applyOrthographicFrame(snapshot.frameSize, snapshotAspect, state.previewCamera);
    }
    state.previewCamera.lookAt(snapshot.target);
    state.previewCamera.updateProjectionMatrix();
    state.orbitControls.target.copy(snapshot.target);
    applyRenderQualityMode();
    state.orbitControls.update();
  }
}
/**
 * 刷新导出面板的分辨率与比例文案，并用宽高比驱动预览框形状。宽高比用内联的最大公约数（辗转相除）约分，得到
 */
function syncExportResolutionLabels() {
  const { width: exportWidthPx, height: exportHeightPx } = exportDimensions();
  exportResolutionLabelElement.textContent = exportWidthPx + " × " + exportHeightPx + " px";
  const aspectDivisor = ((dividend, divisor) => {
    while (divisor) {
      [dividend, divisor] = [divisor, dividend % divisor];
    }
    return dividend;
  })(exportWidthPx, exportHeightPx);
  const aspectWidth = exportWidthPx / aspectDivisor;
  const aspectHeight = exportHeightPx / aspectDivisor;
  exportAspectLabelElement.textContent =
    aspectWidth <= 32 && aspectHeight <= 32
      ? aspectWidth + " : " + aspectHeight
      : (exportWidthPx / exportHeightPx).toFixed(2) + " : 1";
  exportPreviewFrameElement.style.setProperty(
    "--export-aspect",
    String(exportWidthPx / exportHeightPx)
  );
}
/**
 * 在导出预览态下把渲染器与相机适配到预览框，使最终产物构图与屏幕预览一致。准入条件缺一不可：已进入导出态、导出任务不在
 */
function resizeExportStage() {
  if (!state.exportRenderState || state.isExportBusy || !state.renderer || !state.previewCamera) {
    return;
  }
  const { width: resizeWidthPx, height: resizeHeightPx } = exportDimensions();
  const stageAspect = resizeWidthPx / resizeHeightPx;
  const availableWidthPx = Math.max(exportPreviewStageElement.clientWidth, 1);
  const availableHeightPx = Math.max(exportPreviewStageElement.clientHeight, 1);
  const exportPixelRatioValue = isAutoDiagramEmbed
    ? exportPixelRatio(false)
    : Math.min(window.devicePixelRatio || 1, 2);
  state.renderer.setPixelRatio(exportPixelRatioValue);
  state.renderer.setSize(availableWidthPx, availableHeightPx, false);
  state.previewCamera.userData.viewportAspect = stageAspect;
  if (state.previewCamera.isOrthographicCamera) {
    applyOrthographicFrame(state.previewCamera.userData.frameSize || 10, stageAspect, state.previewCamera);
  } else {
    state.previewCamera.aspect = stageAspect;
    applyFocalLength();
  }
  state.orbitControls.update();
  invalidateRender();
}
/**
 * 刷新导出预览：先更新分辨率标签，等两帧后再重设画布（避开布局未定的时刻）。
 */
function refreshExportPreview() {
  syncExportResolutionLabels();
  requestAnimationFrame(() => requestAnimationFrame(resizeExportStage));
}
/**
 * 处理导出宽高输入，按锁定比例联动另一边并夹紧到 320–4096。shouldClampBoth 为真时
 */
function setExportDimension(dimension: any, shouldClampBoth = false) {
  const inputDimensionValue = Number(
    (dimension === "width" ? exportWidthInput : exportHeightInput).value
  );
  if (!Number.isFinite(inputDimensionValue) || inputDimensionValue <= 0) {
    return;
  }
  let nextWidthPx = dimension === "width" ? inputDimensionValue : Number(exportWidthInput.value);
  let nextHeightPx = dimension === "height" ? inputDimensionValue : Number(exportHeightInput.value);
  nextWidthPx =
    Number.isFinite(nextWidthPx) && nextWidthPx > 0 ? nextWidthPx : DEFAULT_EXPORT_WIDTH;
  nextHeightPx =
    Number.isFinite(nextHeightPx) && nextHeightPx > 0 ? nextHeightPx : DEFAULT_EXPORT_HEIGHT;
  if (exportLockRatioInput.checked) {
    if (dimension === "width") {
      if (shouldClampBoth) {
        nextWidthPx = clamp(nextWidthPx, 320, 4096);
        nextHeightPx = Math.round(nextWidthPx / state.exportAspectRatio);
        if (nextHeightPx < 320) {
          nextHeightPx = 320;
          nextWidthPx = Math.round(nextHeightPx * state.exportAspectRatio);
        }
        if (nextHeightPx > 4096) {
          nextHeightPx = 4096;
          nextWidthPx = Math.round(nextHeightPx * state.exportAspectRatio);
        }
      } else {
        nextHeightPx = Math.round(clamp(nextWidthPx / state.exportAspectRatio, 320, 4096));
      }
    } else if (shouldClampBoth) {
      nextHeightPx = clamp(nextHeightPx, 320, 4096);
      nextWidthPx = Math.round(nextHeightPx * state.exportAspectRatio);
      if (nextWidthPx < 320) {
        nextWidthPx = 320;
        nextHeightPx = Math.round(nextWidthPx / state.exportAspectRatio);
      }
      if (nextWidthPx > 4096) {
        nextWidthPx = 4096;
        nextHeightPx = Math.round(nextWidthPx / state.exportAspectRatio);
      }
    } else {
      nextWidthPx = Math.round(clamp(nextHeightPx * state.exportAspectRatio, 320, 4096));
    }
  }
  if (shouldClampBoth) {
    nextWidthPx = Math.round(clamp(nextWidthPx, 320, 4096));
    nextHeightPx = Math.round(clamp(nextHeightPx, 320, 4096));
    exportWidthInput.value = String(nextWidthPx);
    exportHeightInput.value = String(nextHeightPx);
  } else if (exportLockRatioInput.checked) {
    if (dimension === "width") {
      exportHeightInput.value = String(nextHeightPx);
    } else {
      exportWidthInput.value = String(nextWidthPx);
    }
  }
  refreshExportPreview();
}
/**
 * 恢复导出预览用的已保存机位（按导出宽高比重算投影）。与 restoreStoredCameraView 的区别：
 */
function restoreExportCamera(restoreOptions: any = {}) {
  const savedExportView = savedCameraView();
  if (!savedExportView || !state.exportRenderState) {
    return;
  }
  const exportAspect = exportDimensions().width / exportDimensions().height;
  const exportCameraSettings = cameraSettingsSource();
  exportCameraSettings.cameraMode = savedExportView.mode;
  exportCameraSettings.cameraView = savedExportView.view;
  exportCameraSettings.cameraTopRotation = savedExportView.topRotation;
  if (savedExportView.focalLength !== null) {
    exportCameraSettings.cameraFocalLength = savedExportView.focalLength;
  }
  applyCameraSnapshot(
    {
      mode: savedExportView.mode,
      cameraView: savedExportView.view,
      topRotation: savedExportView.topRotation,
      position: new threeModuleMin.Vector3(
        savedExportView.position.x,
        savedExportView.position.y,
        savedExportView.position.z
      ),
      target: new threeModuleMin.Vector3(
        savedExportView.target.x,
        savedExportView.target.y,
        savedExportView.target.z
      ),
      up:
        savedExportView.view === "top"
          ? topViewUpVector(savedExportView.topRotation)
          : new threeModuleMin.Vector3(0, 1, 0),
      zoom: 1,
      visibleHeight: savedExportView.visibleHeight,
      frameSize: savedExportView.visibleHeight,
      viewportAspect: exportAspect,
      fov: savedExportView.fov,
      near: 0.02,
      far: Math.max(
        new threeModuleMin.Vector3(
          savedExportView.position.x,
          savedExportView.position.y,
          savedExportView.position.z
        ).distanceTo(
          new threeModuleMin.Vector3(
            savedExportView.target.x,
            savedExportView.target.y,
            savedExportView.target.z
          )
        ) * (savedExportView.mode === "perspective" ? 8 : 5),
        100
      )
    },
    exportAspect
  );
  syncCameraModeButtons(savedExportView.mode);
  syncCameraViewButtons(savedExportView.view);
  if (!restoreOptions.silent) {
    const exportViewLabel = currentPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
    exportStatusElement.textContent = "已恢复上次保存的" + exportViewLabel;
    showToast("已恢复上次保存的" + exportViewLabel + "。");
  }
}
/**
 * 把档位里保存的相机参数应用到当前相机（并按导出宽高比还原投影）。
 */
function applyPresetCamera(presetCamera: any) {
  const presetAspect = exportDimensions().width / exportDimensions().height;
  const presetCameraSettings = cameraSettingsSource();
  presetCameraSettings.cameraMode = presetCamera.mode;
  presetCameraSettings.cameraView = presetCamera.view;
  presetCameraSettings.cameraTopRotation = presetCamera.topRotation;
  if (presetCamera.focalLength !== null) {
    presetCameraSettings.cameraFocalLength = presetCamera.focalLength;
  }
  const presetPosition = new threeModuleMin.Vector3(
    presetCamera.position.x,
    presetCamera.position.y,
    presetCamera.position.z
  );
  const presetTargetVector = new threeModuleMin.Vector3(
    presetCamera.target.x,
    presetCamera.target.y,
    presetCamera.target.z
  );
  applyCameraSnapshot(
    {
      mode: presetCamera.mode,
      cameraView: presetCamera.view,
      topRotation: presetCamera.topRotation,
      position: presetPosition,
      target: presetTargetVector,
      up:
        presetCamera.view === "top"
          ? topViewUpVector(presetCamera.topRotation)
          : new threeModuleMin.Vector3(0, 1, 0),
      zoom: 1,
      visibleHeight: presetCamera.visibleHeight,
      frameSize: presetCamera.visibleHeight,
      viewportAspect: presetAspect,
      fov: presetCamera.fov,
      near: 0.02,
      far: Math.max(
        presetPosition.distanceTo(presetTargetVector) *
          (presetCamera.mode === "perspective" ? 8 : 5),
        100
      )
    },
    presetAspect
  );
  syncCameraModeButtons(presetCamera.mode);
  syncCameraViewButtons(presetCamera.view);
}
/**
 * 应用指定槽位的导出档位：分辨率、楼层选择、勾选的文件与相机一次性还原。兼容旧的选中项
 */
function applyExportPreset(slotIndex: any, applyOptions: any = {}) {
  const exportPreset = normalizeExportPreset(state.studioDocument?.exportPresets?.[slotIndex]);
  if (!exportPreset || !state.exportRenderState) {
    return false;
  }
  exportWidthInput.value = String(exportPreset.width);
  exportHeightInput.value = String(exportPreset.height);
  exportLockRatioInput.checked = exportPreset.lockRatio;
  state.exportAspectRatio = exportPreset.width / exportPreset.height;
  state.studioDocument.exportFloorGap = exportPreset.floorGap;
  const presetFloor = state.studioDocument.floors.find(
    (presetFloorCandidate: any) => presetFloorCandidate.id === exportPreset.floorId
  );
  const presetFloorSelection =
    exportPreset.floorMode === "all" && state.studioDocument.floors.length > 1
      ? "all"
      : presetFloor?.id || getCurrentFloor()?.id || state.activeFloorId;
  applyExportFloorSelection(presetFloorSelection);
  exportFloorGapInput.value = exportPreset.floorGap.toFixed(1);
  exportFolderNameInput.value = exportPreset.folderName;
  const presetSelectedFiles = new Set(exportPreset.selectedFiles);
  const includesScreenFiles = presetSelectedFiles.has("televisionOn");
  const includesVehicleFiles = presetSelectedFiles.has("vehicleCharging");
  for (const exportFileInput of exportDialogElement.querySelectorAll("input[data-export-file]")) {
    const exportFileKey = exportFileInput.dataset.exportFile;
    exportFileInput.checked =
      presetSelectedFiles.has(exportFileKey) ||
      (includesScreenFiles && exportFileKey.startsWith("screen:")) ||
      (includesVehicleFiles && exportFileKey.startsWith("vehicle:"));
  }
  applyPresetCamera(exportPreset.camera);
  syncExportResolutionLabels();
  syncCameraViewControls();
  if (!applyOptions.silent) {
    exportStatusElement.textContent = "已切换到档位 " + String(slotIndex + 1).padStart(2, "0");
    showToast("已应用导出档位 " + String(slotIndex + 1).padStart(2, "0") + "。", "success");
  }
  refreshExportPreview();
  return true;
}
/**
 * 切换活动导出档位：先保存当前档位，再应用目标档位。非法下标或导出进行中直接忽略。
 */
function selectExportPresetSlot(presetSlotIndexToApply: any) {
  const presetSlotCount = state.studioDocument?.exportPresets?.length || 0;
  if (
    !Number.isInteger(presetSlotIndexToApply) ||
    presetSlotIndexToApply < 0 ||
    presetSlotIndexToApply >= presetSlotCount ||
    state.isExportBusy
  ) {
    return;
  }
  saveActiveExportPreset();
  state.studioDocument.activeExportPresetSlot = presetSlotIndexToApply;
  const didApplyPreset = applyExportPreset(presetSlotIndexToApply);
  state.exportPresets = false;
  renderExportPresetSlots();
  markDocumentDirty();
  if (!didApplyPreset) {
    exportStatusElement.textContent =
      "存档 " + String(presetSlotIndexToApply + 1).padStart(2, "0") + " 没有设置";
  }
}
/**
 * 生成不与其他档位重名的名称（重名则追加递增序号）。名称先按 normalizeLabelText 截到 24 字；
 */
function uniqueExportPresetName(baseName: any, excludeSlotIndex = -1) {
  const normalizedPresetName = normalizeLabelText(baseName, "导出视角", 24);
  const presetLabelSet = new Set(
    (state.studioDocument?.exportPresets || [])
      .map((presetEntry: any, presetEntryIndex: any) =>
        presetEntryIndex === excludeSlotIndex
          ? ""
          : exportPresetLabel(presetEntry, presetEntryIndex)
      )
      .filter(Boolean)
  );
  if (!presetLabelSet.has(normalizedPresetName)) {
    return normalizedPresetName;
  }
  let duplicateSuffixNumber = 2;
  while (presetLabelSet.has(normalizedPresetName + " " + duplicateSuffixNumber)) {
    duplicateSuffixNumber += 1;
  }
  return (normalizedPresetName + " " + duplicateSuffixNumber).slice(0, 24);
}
/**
 * 新增一个导出档位：以当前视角为初始状态，并沿用上一个档位的分辨率设置。先保存当前档位以免
 */
function addExportPresetSlot() {
  if (!state.exportRenderState || state.isExportBusy) {
    return;
  }
  saveActiveExportPreset();
  state.studioDocument.exportPresets = normalizeExportPresetSlots(state.studioDocument.exportPresets);
  if (state.studioDocument.exportPresets.length >= MAX_EXPORT_PRESET_COUNT) {
    showToast("最多可以保存 8 个导出存档。");
    return;
  }
  const presetCount = state.studioDocument.exportPresets.length;
  const presetBaseName =
    currentPreviewFloorMode() === "all"
      ? "全楼"
      : getCurrentFloor()?.name || "存档 " + (presetCount + 1);
  const newPresetName = uniqueExportPresetName(presetBaseName + "视角");
  const previousPreset = state.studioDocument.exportPresets.slice(0, presetCount).reverse().find(Boolean);
  const newPreset: any = buildExportPreset({
    name: newPresetName
  });
  if (previousPreset) {
    newPreset.width = previousPreset.width;
    newPreset.height = previousPreset.height;
    newPreset.lockRatio = previousPreset.lockRatio;
  }
  state.studioDocument.exportPresets.push(newPreset);
  state.studioDocument.activeExportPresetSlot = presetCount;
  state.exportPresets = false;
  renderExportPresetSlots();
  markDocumentDirty();
  exportStatusElement.textContent = "已新增“" + newPresetName + "”";
  showToast("已新增“" + newPresetName + "”，可以继续调整楼层和视角。", "success");
}
/**
 * 关闭「重命名档位」对话框；未打开时不做任何事。
 */
function closePresetRenameDialog() {
  if (exportPresetRenameDialogElement.open) {
    exportPresetRenameDialogElement.close();
  }
}
/**
 * 打开档位重命名对话框，预填当前档位显示名并全选，方便直接覆写。
 */
function openPresetRenameDialog() {
  if (state.isExportBusy) {
    return;
  }
  saveActiveExportPreset();
  const presetSlotList = normalizeExportPresetSlots(state.studioDocument?.exportPresets);
  const currentPresetSlotIndex = normalizeActiveExportPresetSlot(
    state.studioDocument?.activeExportPresetSlot,
    presetSlotList.length
  );
  if (presetSlotList[currentPresetSlotIndex]) {
    exportPresetRenameInputElement.value = exportPresetLabel(
      presetSlotList[currentPresetSlotIndex],
      currentPresetSlotIndex
    );
    exportPresetRenameDialogElement.showModal();
    requestAnimationFrame(() => exportPresetRenameInputElement.select());
  }
}
/**
 * 关闭「删除档位」对话框；未打开时不做任何事。
 */
function closePresetDeleteDialog() {
  if (exportPresetDeleteDialogElement.open) {
    exportPresetDeleteDialogElement.close();
  }
}
/**
 * 打开「删除档位」对话框，并把待删档位的显示名写进确认文案。
 */
function openPresetDeleteDialog() {
  if (state.isExportBusy) {
    return;
  }
  const presetSlotListForDelete = normalizeExportPresetSlots(state.studioDocument?.exportPresets);
  if (presetSlotListForDelete.length <= 1) {
    return;
  }
  const presetIndexForDelete = normalizeActiveExportPresetSlot(
    state.studioDocument?.activeExportPresetSlot,
    presetSlotListForDelete.length
  );
  exportPresetDeleteNameElement.textContent = exportPresetLabel(
    presetSlotListForDelete[presetIndexForDelete],
    presetIndexForDelete
  );
  exportPresetDeleteDialogElement.showModal();
}
/**
 * 删除当前导出档位并切换到相邻档位。只剩一个档位时不删（至少要留一个）。删除后活动下标取
 */
function deleteActiveExportPreset() {
  const remainingPresetSlots = normalizeExportPresetSlots(state.studioDocument?.exportPresets);
  if (remainingPresetSlots.length <= 1) {
    return;
  }
  const removedPresetIndex = normalizeActiveExportPresetSlot(
    state.studioDocument?.activeExportPresetSlot,
    remainingPresetSlots.length
  );
  const removedPresetLabel = exportPresetLabel(
    remainingPresetSlots[removedPresetIndex],
    removedPresetIndex
  );
  window.clearTimeout(state.saveRetryTimer);
  state.saveRetryTimer = null;
  state.exportPresets = false;
  remainingPresetSlots.splice(removedPresetIndex, 1);
  state.studioDocument.exportPresets = remainingPresetSlots;
  state.studioDocument.activeExportPresetSlot = Math.min(
    removedPresetIndex,
    remainingPresetSlots.length - 1
  );
  closePresetDeleteDialog();
  const didRestoreNeighborPreset = applyExportPreset(state.studioDocument.activeExportPresetSlot, {
    silent: true
  });
  renderExportPresetSlots();
  markDocumentDirty();
  exportStatusElement.textContent = didRestoreNeighborPreset
    ? "已切换到相邻存档"
    : "当前存档尚未设置";
  showToast("已删除“" + removedPresetLabel + "”，楼层和户型未受影响。", "success");
}
function ensureAutoDiagramFrame(frameAttempt = 0) {
  if (!!isAutoDiagramEmbed && !!autoDiagramComponentId && window.parent !== window) {
    requestAnimationFrame(() => {
      if (
        !state.exportRenderState ||
        !state.renderer ||
        !state.previewOverlayScene ||
        !state.previewCamera ||
        !state.orbitControls
      ) {
        return;
      }
      resizeExportStage();
      if (!state.previewModelRoot?.children?.length) {
        refreshPreviewScene();
      }
      const hasSizedExportStage =
        exportPreviewStageElement.clientWidth > 1 && exportPreviewStageElement.clientHeight > 1;
      const hasPreviewModelChildren = !!state.previewModelRoot?.children?.length;
      let isFrameProduced = false;
      if (hasSizedExportStage && hasPreviewModelChildren) {
        invalidateRender({
          shadows: true
        });
        state.orbitControls.update();
        for (let previewRenderPass = 0; previewRenderPass < 2; previewRenderPass += 1) {
          state.renderer.render(state.previewOverlayScene, state.previewCamera);
        }
        const rendererRenderStats = state.renderer.info.render;
        isFrameProduced = rendererRenderStats.calls > 0 && rendererRenderStats.triangles > 0;
        state.needsRender = false;
        state.hasRenderedFrame = isFrameProduced;
      }
      if (!isFrameProduced && frameAttempt < 7) {
        ensureAutoDiagramFrame(frameAttempt + 1);
        return;
      }
      if (!isFrameProduced) {
        window.parent.postMessage(
          {
            type: "homeos-floorplan-auto-diagram-error",
            componentId: autoDiagramComponentId,
            message: "3D户型首帧渲染失败，请刷新后重试。"
          },
          window.location.origin
        );
        return;
      }
      window.parent.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-ready",
          componentId: autoDiagramComponentId,
          floors: state.studioDocument.floors.map((floorBrief: any) => ({
            id: floorBrief.id,
            name: floorBrief.name
          })),
          floorSelection:
            currentPreviewFloorMode() === "all" ? "all" : getCurrentFloor()?.id || state.activeFloorId
        },
        window.location.origin
      );
    });
  }
}
function openExportDialog() {
  if (state.exportRenderState || !state.renderer || !state.previewCamera || !state.orbitControls) {
    return;
  }
  window.clearTimeout(state.saveRetryTimer);
  state.saveRetryTimer = null;
  state.exportPresets = false;
  const lightGroupSnapshot = collectLightGroups();
  const televisionSnapshot = collectTelevisions();
  const carSnapshot = collectCars();
  state.exportRenderState = {
    canvasParent: state.renderer.domElement.parentElement,
    camera: captureCameraSnapshot(),
    selected: state.primarySelection
      ? {
          ...state.primarySelection
        }
      : null,
    selectedMany: state.multiSelection.map((selectedItemSnapshot: any) => ({
      ...selectedItemSnapshot
    })),
    floorMode: currentPreviewFloorMode(),
    selectedFloorId: state.activeFloorId,
    floorCameraSettings: new Map(
      state.studioDocument.floors.map((floorSnapshotEntry: any) => [
        floorSnapshotEntry.id,
        {
          mode: floorSnapshotEntry.scene.settings.cameraMode,
          view: floorSnapshotEntry.scene.settings.cameraView,
          topRotation: floorSnapshotEntry.scene.settings.cameraTopRotation,
          focalLength: floorSnapshotEntry.scene.settings.cameraFocalLength
        }
      ])
    ),
    combinedCameraSettings: {
      ...state.studioDocument.combinedCameraSettings
    },
    groupStates: new Map(
      lightGroupSnapshot.map(({ key: groupStateKey, group: groupStateController }: any) => [
        groupStateKey,
        groupStateController.enabled
      ])
    ),
    tvStates: new Map(
      televisionSnapshot.map(({ key: tvStateKey, item: tvStateController }: any) => [
        tvStateKey,
        tvStateController.screenEnabled !== false
      ])
    ),
    carChargingStates: new Map(
      carSnapshot.map(({ key: carStateKey, item: carStateController }: any) => [
        carStateKey,
        carStateController.chargingEnabled === true
      ])
    ),
    cameraSettings: {
      mode: currentCameraMode(),
      view: currentCameraView(),
      topRotation: currentTopRotationDeg(),
      focalLength: currentFocalLength()
    },
    pixelRatio: state.renderer.getPixelRatio()
  };
  state.spotShadowAtlasController?.setEnabled(false);
  for (const { group: groupControllerToDisable } of lightGroupSnapshot) {
    groupControllerToDisable.enabled = false;
  }
  clearSelection();
  exportStatusElement.textContent = "准备保存到 NAS";
  exportFolderNameInput.classList.remove("invalid");
  populateExportGroupFiles();
  renderExportFloorOptions();
  syncCameraViewControls();
  renderExportPresetSlots();
  exportPackageButton.disabled = false;
  if (isAutoDiagramEmbed) {
    document.body.classList.add("auto-diagram-embedded");
    const searchParams = new URLSearchParams(window.location.search);
    const clampedExportWidth = clamp(
      finite(
        searchParams.get("dashboard-width"),
        finite(searchParams.get("component-width"), exportWidthInput.value)
      ),
      320,
      4096
    );
    const clampedExportHeight = clamp(
      finite(
        searchParams.get("dashboard-height"),
        finite(searchParams.get("component-height"), exportHeightInput.value)
      ),
      320,
      4096
    );
    exportWidthInput.value = String(Math.round(clampedExportWidth));
    exportHeightInput.value = String(Math.round(clampedExportHeight));
    exportLockRatioInput.checked = true;
    if (exportFolderName) {
      exportFolderNameInput.value = exportFolderName;
    }
    syncExportResolutionLabels();
  }
  exportDialogElement.showModal();
  exportPreviewStageElement.append(state.renderer.domElement);
  const restoredPresetSlot = normalizeActiveExportPresetSlot(
    state.studioDocument.activeExportPresetSlot,
    state.studioDocument.exportPresets.length
  );
  const didApplySavedPreset =
    restoredPresetSlot !== null &&
    applyExportPreset(restoredPresetSlot, {
      silent: true
    });
  if (isAutoDiagramEmbed && floorSelectionParam !== null) {
    const matchedFloorEntry = state.studioDocument.floors.find(
      (floorMatchCandidate: any) => floorMatchCandidate.id === floorSelectionParam
    );
    const floorSelectionId =
      floorSelectionParam === "all" && state.studioDocument.floors.length > 1
        ? "all"
        : matchedFloorEntry?.id || getCurrentFloor()?.id || state.activeFloorId;
    applyExportFloorSelection(floorSelectionId);
  }
  if (!didApplySavedPreset) {
    refreshPreviewScene();
    if (savedCameraView()) {
      restoreExportCamera({
        silent: true
      });
    } else if (isAutoDiagramEmbed) {
      applyCameraMode(currentCameraMode(), {
        preserveView: false
      });
      resetCameraView();
    }
  }
  state.exportAspectRatio = exportDimensions().width / exportDimensions().height;
  renderExportPresetSlots();
  refreshExportPreview();
  ensureAutoDiagramFrame();
}
/**
 * 填充「单独导出文件」列表：电视画面层、汽车充电层、每个灯组的透明光效层。键名约定为
 */
function populateExportGroupFiles() {
  if (!exportGroupFilesInput) {
    return;
  }
  const previewFloorEntries = previewFloors();
  const groupFileListItems: any = [];
  /**
   * 往导出文件列表追加一个可勾选项。
   */
  const appendGroupFileOption = (optionValue: any, optionLabel: any, optionHint: any) => {
    const fileListItemElement = document.createElement("li");
    const fileLabelElement = document.createElement("label");
    const fileCheckboxElement = document.createElement("input");
    fileCheckboxElement.type = "checkbox";
    fileCheckboxElement.checked = true;
    fileCheckboxElement.dataset.exportFile = optionValue;
    const fileLabelTextElement = document.createElement("span");
    fileLabelTextElement.textContent = optionLabel;
    const fileHintElement = document.createElement("small");
    fileHintElement.textContent = optionHint;
    fileLabelElement.append(fileCheckboxElement, fileLabelTextElement);
    fileListItemElement.append(fileLabelElement, fileHintElement);
    groupFileListItems.push(fileListItemElement);
  };
  collectTelevisions(previewFloorEntries).forEach(
    ({ floor: tvLayerFloor, item: tvLayerItem, index: televisionIndex, key: televisionKey }: any) => {
      const televisionLayerName =
        "" +
        (previewFloorEntries.length > 1 ? tvLayerFloor.name + "-" : "") +
        (tvLayerItem.screenLayerName || "电视画面 " + (televisionIndex + 1));
      appendGroupFileOption(
        "screen:" + televisionKey,
        sanitizeFileName(televisionLayerName, "电视画面-" + (televisionIndex + 1)) +
          "." +
          EXPORT_IMAGE_EXTENSION,
        "该电视的独立开启透明层"
      );
    }
  );
  collectCars(previewFloorEntries).forEach(
    ({ floor: vehicleFloor, item: vehicleItem, index: vehicleIndex, key: vehicleKey }: any) => {
      const vehicleLayerName =
        "" +
        (previewFloorEntries.length > 1 ? vehicleFloor.name + "-" : "") +
        (vehicleItem.chargingLayerName || "汽车充电 " + (vehicleIndex + 1));
      appendGroupFileOption(
        "vehicle:" + vehicleKey,
        sanitizeFileName(vehicleLayerName, "汽车充电-" + (vehicleIndex + 1)) +
          "." +
          EXPORT_IMAGE_EXTENSION,
        "该汽车的独立充电光效层"
      );
    }
  );
  collectLightGroups(previewFloorEntries).forEach(
    ({
      floor: lightGroupFloor,
      group: lightGroupEntity,
      index: lightGroupIndex,
      key: lightGroupKey
    }: any) => {
      const lightGroupLayerName =
        "" +
        (previewFloorEntries.length > 1 ? lightGroupFloor.name + "-" : "") +
        (lightGroupEntity.name || "灯组-" + (lightGroupIndex + 1));
      appendGroupFileOption(
        "group:" + lightGroupKey,
        sanitizeFileName(lightGroupLayerName, "灯组-" + (lightGroupIndex + 1)) +
          "." +
          EXPORT_IMAGE_EXTENSION,
        "该灯组的透明光效层"
      );
    }
  );
  exportGroupFilesInput.replaceChildren(...groupFileListItems);
}
/**
 * 重建导出对话框的楼层下拉框：先列出全部楼层，楼层数大于 1 时再追加「全楼合并」。选项必须
 */
function renderExportFloorOptions() {
  const isCombinedFloorView = currentPreviewFloorMode() === "all";
  const floorSelectValue = isCombinedFloorView ? "all" : getCurrentFloor()?.id || state.activeFloorId;
  exportFloorSelectElement.replaceChildren(
    ...state.studioDocument.floors.map((floorOptionEntry: any) => {
      const floorOptionElement = document.createElement("option");
      floorOptionElement.value = floorOptionEntry.id;
      floorOptionElement.textContent = floorOptionEntry.name;
      return floorOptionElement;
    }),
    ...(state.studioDocument.floors.length > 1
      ? [
          Object.assign(document.createElement("option"), {
            value: "all",
            textContent: "全楼合并"
          })
        ]
      : [])
  );
  exportFloorSelectElement.value = floorSelectValue;
  syncStudioSelect(exportFloorSelectElement);
  exportFloorGapControlElement.hidden = !isCombinedFloorView || state.studioDocument.floors.length <= 1;
  syncControlValue(exportFloorGapInput, finite(state.studioDocument.exportFloorGap, 3).toFixed(1));
  syncCameraViewControls();
}
/**
 * 切换导出时的楼层选择（单层 / 全楼合并），并重建相关预览。选择 "all" 只在楼层数大于 1 时
 */
function applyExportFloorSelection(requestedFloorId: any) {
  if (!state.exportRenderState || state.isExportBusy) {
    return;
  }
  const isAllFloorsSelected = requestedFloorId === "all" && state.studioDocument.floors.length > 1;
  if (!isAllFloorsSelected) {
    const selectedFloorEntry = state.studioDocument.floors.find(
      (floorLookupEntry: any) => floorLookupEntry.id === requestedFloorId
    );
    if (!selectedFloorEntry) {
      return;
    }
    state.exportRenderState.selectedFloorId = selectedFloorEntry.id;
    state.activeScene = selectedFloorEntry.scene;
  }
  state.studioDocument.previewFloorMode = isAllFloorsSelected ? "all" : "active";
  renderExportFloorOptions();
  syncPreviewFloorButtons();
  syncCameraViewControls();
  refreshPreviewScene();
  if (savedCameraView()) {
    restoreExportCamera({
      silent: true
    });
  } else {
    applyCameraMode(currentCameraMode(), {
      preserveView: false
    });
    resetCameraView();
  }
  populateExportGroupFiles();
  exportStatusElement.textContent =
    currentPreviewFloorMode() === "all"
      ? "正在构图：全楼合并"
      : "正在构图：" + (getCurrentFloor()?.name || "当前层");
  refreshExportPreview();
}
/**
 * 关闭导出对话框，并把 openExportDialog 保存的快照逐项还原回预览态。还原顺序与打开时相反：
 */
function closeExportDialog() {
  if (!state.exportRenderState || state.isExportBusy) {
    return;
  }
  closeBaseLightingPanel();
  if (baseLightControlsElement?.parentElement !== document.body) {
    document.body.append(baseLightControlsElement);
  }
  saveActiveExportPreset();
  const exportStateToRestore = state.exportRenderState;
  for (const floorToRestore of state.studioDocument.floors) {
    const savedFloorCameraSettings = exportStateToRestore.floorCameraSettings.get(
      floorToRestore.id
    );
    if (savedFloorCameraSettings) {
      floorToRestore.scene.settings.cameraMode = savedFloorCameraSettings.mode;
      floorToRestore.scene.settings.cameraView = savedFloorCameraSettings.view;
      floorToRestore.scene.settings.cameraTopRotation = savedFloorCameraSettings.topRotation;
      floorToRestore.scene.settings.cameraFocalLength = savedFloorCameraSettings.focalLength;
    }
  }
  state.studioDocument.combinedCameraSettings = {
    ...exportStateToRestore.combinedCameraSettings
  };
  state.exportRenderState = null;
  state.studioDocument.previewFloorMode = exportStateToRestore.floorMode;
  state.activeScene =
    state.studioDocument.floors.find((floorRestoreCandidate: any) => floorRestoreCandidate.id === state.activeFloorId)
      ?.scene || state.studioDocument.floors[0].scene;
  exportStateToRestore.canvasParent?.append(state.renderer.domElement);
  const cameraSettingsTarget = cameraSettingsSource();
  cameraSettingsTarget.cameraMode = exportStateToRestore.cameraSettings.mode;
  cameraSettingsTarget.cameraView = exportStateToRestore.cameraSettings.view;
  cameraSettingsTarget.cameraTopRotation = exportStateToRestore.cameraSettings.topRotation;
  cameraSettingsTarget.cameraFocalLength = exportStateToRestore.cameraSettings.focalLength;
  applyCameraSnapshot(exportStateToRestore.camera, exportStateToRestore.camera.viewportAspect);
  syncCameraModeButtons(exportStateToRestore.cameraSettings.mode);
  syncCameraViewButtons(exportStateToRestore.cameraSettings.view);
  state.primarySelection = exportStateToRestore.selected;
  state.multiSelection = exportStateToRestore.selectedMany;
  for (const { key: restoreGroupKey, group: restoreGroupController } of collectLightGroups()) {
    if (exportStateToRestore.groupStates.has(restoreGroupKey)) {
      restoreGroupController.enabled = exportStateToRestore.groupStates.get(restoreGroupKey);
    }
  }
  for (const { key: restoreTvKey, item: restoreTvController } of collectTelevisions()) {
    if (exportStateToRestore.tvStates.has(restoreTvKey)) {
      restoreTvController.screenEnabled = exportStateToRestore.tvStates.get(restoreTvKey);
    }
  }
  for (const { key: restoreCarKey, item: restoreCarController } of collectCars()) {
    if (exportStateToRestore.carChargingStates.has(restoreCarKey)) {
      restoreCarController.chargingEnabled =
        exportStateToRestore.carChargingStates.get(restoreCarKey);
    }
  }
  state.renderer.setPixelRatio(exportStateToRestore.pixelRatio);
  refreshPreviewScene();
  applyRenderQualityMode();
  handleStageResize();
  renderInspector();
  renderPlanView();
}
/**
 * 切换导出忙碌态：禁用对话框内除「关闭」与「导出」之外的控件，并显示忙碌提示。
 */
function setExportBusy(busyState: any) {
  state.isExportBusy = busyState;
  const busyNoticeElement = selectElement("#export-busy-notice");
  if (busyNoticeElement) {
    busyNoticeElement.hidden = !busyState;
  }
  exportPackageButton.disabled = busyState;
  selectElement("#export-close").disabled = busyState;
  for (const exportDialogControl of exportDialogElement.querySelectorAll("input, button")) {
    if (exportDialogControl.id !== "export-close" && exportDialogControl.id !== "export-package") {
      exportDialogControl.disabled = busyState;
    }
  }
  if (!busyState) {
    syncCameraViewControls();
    renderExportPresetSlots();
  }
  state.orbitControls.enabled = !busyState;
}
/**
 * 连渲三帧后再截图，抹平首帧可能缺纹理 / 阴影的问题（导出抓图前统一调用）。
 */
function renderExportPreviewFrames() {
  state.orbitControls.update();
  for (let previewFramePass = 0; previewFramePass < 3; previewFramePass += 1) {
    state.renderer.render(state.previewOverlayScene, state.previewCamera);
  }
}
/**
 * 把 canvas 转成 Blob（JPEG / PNG 与质量由导出常量决定）。
 */
function canvasToBlob(sourceCanvas: any) {
  return new Promise((resolveBlob, rejectBlob) => {
    sourceCanvas.toBlob(
      (producedBlob: any) => {
        if (producedBlob) {
          resolveBlob(producedBlob);
        } else {
          rejectBlob(new Error("无法生成导出图像。"));
        }
      },
      EXPORT_IMAGE_MIME_TYPE,
      EXPORT_IMAGE_QUALITY
    );
  });
}
async function captureStageImage(captureWidth: any, captureHeight: any, captureOptions: any = {}) {
  renderExportPreviewFrames();
  const captureCanvasElement = document.createElement("canvas");
  captureCanvasElement.width = captureWidth;
  captureCanvasElement.height = captureHeight;
  const captureContext = captureCanvasElement.getContext("2d", {
    willReadFrequently: captureOptions.pixels === true
  });
  if (!captureContext) {
    throw new Error("当前浏览器无法创建导出画布。");
  }
  captureContext.drawImage(state.renderer.domElement, 0, 0, captureWidth, captureHeight);
  const captureResult: any = {};
  if (captureOptions.pixels) {
    captureResult.imageData = captureContext.getImageData(0, 0, captureWidth, captureHeight);
  }
  if (captureOptions.blob) {
    captureResult.blob = await canvasToBlob(captureCanvasElement);
  }
  return captureResult;
}
/**
 * 合成电视画面层：把「点亮电视后」的画面减去「未点亮」的基准画面，得到透明的画面增量层，
 */
async function composeTelevisionLayerBlob(basePixelFrame: any, litPixelFrame: any) {
  const televisionLayerCanvas = document.createElement("canvas");
  televisionLayerCanvas.width = basePixelFrame.width;
  televisionLayerCanvas.height = basePixelFrame.height;
  const televisionLayerContext = televisionLayerCanvas.getContext("2d");
  if (!televisionLayerContext) {
    throw new Error("当前浏览器无法创建透明灯光层。");
  }
  const televisionDeltaPixels = buildLightDeltaPixels(basePixelFrame.data, litPixelFrame.data);
  televisionLayerContext.putImageData(
    new ImageData(televisionDeltaPixels as any, basePixelFrame.width, basePixelFrame.height),
    0,
    0
  );
  return canvasToBlob(televisionLayerCanvas);
}
async function compositeLightGroupShadows(
  baseFrame: any,
  lightGroupExportEntry: any,
  frameWidthPx: any,
  frameHeightPx: any,
  lightGroupOrdinal: any,
  lightGroupTotal: any
) {
  const shadowCompositeCanvas = document.createElement("canvas");
  shadowCompositeCanvas.width = frameWidthPx;
  shadowCompositeCanvas.height = frameHeightPx;
  const shadowCompositeContext = shadowCompositeCanvas.getContext("2d");
  const lightLayerCanvas = document.createElement("canvas");
  lightLayerCanvas.width = frameWidthPx;
  lightLayerCanvas.height = frameHeightPx;
  const lightLayerContext = lightLayerCanvas.getContext("2d");
  if (!shadowCompositeContext || !lightLayerContext) {
    throw new Error("当前浏览器无法合成逐灯阴影。");
  }
  const enabledGroupLights = lightGroupExportEntry.lights.filter(
    (groupLightItem: any) => finite(groupLightItem.lightBrightness, 0) > 0
  );
  try {
    for (let lightLoopIndex = 0; lightLoopIndex < enabledGroupLights.length; lightLoopIndex += 1) {
      const currentGroupLight = enabledGroupLights[lightLoopIndex];
      exportStatusElement.textContent =
        "正在渲染灯组 " +
        (lightGroupOrdinal + 1) +
        "/" +
        lightGroupTotal +
        "：" +
        lightGroupExportEntry.name +
        "（" +
        (lightLoopIndex + 1) +
        "/" +
        enabledGroupLights.length +
        "）";
      state.forcedVisibleLightIds = new Set([currentGroupLight.id]);
      if (currentPreviewFloorMode() === "all") {
        refreshPreviewScene({
          preserveLightCache: true
        });
      } else {
        refreshLightsLayer({
          preserveLightCache: true
        });
      }
      const litFrameCapture = await captureStageImage(frameWidthPx, frameHeightPx, {
        pixels: true
      });
      const lightDeltaPixelData = buildLightDeltaPixels(
        baseFrame.data,
        litFrameCapture.imageData.data
      );
      lightLayerContext.clearRect(0, 0, frameWidthPx, frameHeightPx);
      lightLayerContext.putImageData(
        new ImageData(lightDeltaPixelData as any, frameWidthPx, frameHeightPx),
        0,
        0
      );
      shadowCompositeContext.drawImage(lightLayerCanvas, 0, 0);
      await yieldToScheduler();
    }
  } finally {
    state.forcedVisibleLightIds = null;
  }
  return canvasToBlob(shadowCompositeCanvas);
}
/**
 * 合成导出用的背景底图：先铺满主题背景色，再把户型俯视图逐像素叠上去。户型俯视图由离屏
 */
async function composeBackgroundBlob(
  backgroundWidthPx: any,
  backgroundHeightPx: any,
  floorPlanImageData: any = null
) {
  const backgroundCanvasElement = document.createElement("canvas");
  backgroundCanvasElement.width = backgroundWidthPx;
  backgroundCanvasElement.height = backgroundHeightPx;
  const backgroundCanvasContext = backgroundCanvasElement.getContext("2d");
  if (!backgroundCanvasContext) {
    throw new Error("当前浏览器无法创建导出底图。");
  }
  backgroundCanvasContext.fillStyle =
    "#" + studioPalette().background.toString(16).padStart(6, "0");
  backgroundCanvasContext.fillRect(0, 0, backgroundWidthPx, backgroundHeightPx);
  if (floorPlanImageData) {
    const floorPlanCanvasElement = document.createElement("canvas");
    floorPlanCanvasElement.width = backgroundWidthPx;
    floorPlanCanvasElement.height = backgroundHeightPx;
    const floorPlanCanvasContext = floorPlanCanvasElement.getContext("2d");
    if (!floorPlanCanvasContext) {
      throw new Error("当前浏览器无法合成户型底图。");
    }
    floorPlanCanvasContext.putImageData(floorPlanImageData, 0, 0);
    backgroundCanvasContext.drawImage(floorPlanCanvasElement, 0, 0);
  }
  return canvasToBlob(backgroundCanvasElement);
}
/**
 * 把任意标签清洗成安全的文件名片段：NFKC 归一化、剔除 Windows 非法字符，把空白与连续短横线
 */
function sanitizeFileName(rawLabel: any, fallbackLabel: any) {
  return (
    String(rawLabel || "")
      .normalize("NFKC")
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 48) || fallbackLabel
  );
}
/**
 * @returns {string} 可用的文件名。
 */
function reserveExportFileName(
  nameSource: any,
  fileOrdinal: any,
  usedFileNameSet: any,
  fileExtension = EXPORT_IMAGE_EXTENSION
) {
  const sanitizedBaseName = sanitizeFileName(nameSource, "灯组-" + (fileOrdinal + 1));
  const normalizedExtension = String(fileExtension).replace(/^\./, "");
  let fileNameSuffix = 1;
  let candidateFileName = sanitizedBaseName + "." + normalizedExtension;
  while (usedFileNameSet.has(candidateFileName.toLocaleLowerCase())) {
    fileNameSuffix += 1;
    candidateFileName = sanitizedBaseName + "-" + fileNameSuffix + "." + normalizedExtension;
  }
  usedFileNameSet.add(candidateFileName.toLocaleLowerCase());
  return candidateFileName;
}
/**
 * 拍下当前相机状态（模式、位置、目标、视口宽高比、可见高度、fov）供导出使用。
 * @returns {object} 相机状态快照；正交模式下 fov 记为 null。
 */
function buildExportCameraState(aspectViewportWidth: any, aspectViewportHeight: any) {
  const orbitControlTarget = state.orbitControls.target;
  return {
    mode: state.previewCamera.isPerspectiveCamera ? "perspective" : "orthographic",
    position: {
      x: state.previewCamera.position.x,
      y: state.previewCamera.position.y,
      z: state.previewCamera.position.z
    },
    target: {
      x: orbitControlTarget.x,
      y: orbitControlTarget.y,
      z: orbitControlTarget.z
    },
    aspect: aspectViewportWidth / aspectViewportHeight,
    visibleHeight: measureVisibleHeight(state.previewCamera, orbitControlTarget),
    fov: state.previewCamera.isPerspectiveCamera ? state.previewCamera.fov : null
  };
}
/**
 * @returns {object} 导出用的灯光描述对象。
 */
function buildExportedLight(lightSourceItem: any, owningFloor = getCurrentFloor()) {
  const activeFloorPixelsPerMeter = owningFloor?.scene?.calibration?.pixelsPerMeter || 1;
  return {
    id: lightSourceItem.id,
    floorId: owningFloor?.id || null,
    type: lightSourceItem.type,
    position: {
      x: lightSourceItem.x / activeFloorPixelsPerMeter,
      z: lightSourceItem.y / activeFloorPixelsPerMeter,
      elevation: floorExportOffset(owningFloor) + (lightSourceItem.elevation || 0)
    },
    rotation: lightSourceItem.rotation || 0,
    verticalRotation: lightSourceItem.verticalRotation || 0,
    stripRollRotation:
      (lightSourceItem.type === "striplight" && lightSourceItem.stripRollRotation) || 0,
    size: {
      width: lightSourceItem.width,
      depth: lightSourceItem.depth
    },
    temperature: lightSourceItem.lightTemperature,
    brightness: lightSourceItem.lightBrightness,
    range: lightSourceItem.lightRange,
    angle: lightSourceItem.lightAngle
  };
}
/**
 * 把某个锚点（灯光 / 设备）投影到当前相机画面，返回 0~1 的归一化屏幕坐标。全楼合并模式下先把「平面像素 + 楼层
 */
function projectAnchorToFloorPlan(anchorItem: any, anchorFloor: any, floorCandidates = previewFloors()) {
  if (!anchorItem || !anchorFloor || !state.previewCamera) {
    return null;
  }
  const anchorPixelsPerMeter = anchorFloor.scene?.calibration?.pixelsPerMeter || 1;
  let anchorOffsetX = 0;
  let anchorElevation =
    Math.max(0, finite(anchorItem.elevation, 0)) +
    Math.max(0.02, finite(anchorItem.height, 0.1)) / 2;
  let anchorOffsetZ = 0;
  if (currentPreviewFloorMode() === "all") {
    const floorLocalX =
      (finite(anchorItem.x, 0) - finite(anchorFloor.originX, 0)) / anchorPixelsPerMeter;
    const floorLocalY =
      (finite(anchorItem.y, 0) - finite(anchorFloor.originY, 0)) / anchorPixelsPerMeter;
    const floorRotationRadians = -threeModuleMin.MathUtils.degToRad(
      finite(anchorFloor.rotation, 0)
    );
    anchorOffsetX =
      floorLocalX * Math.cos(floorRotationRadians) +
      floorLocalY * Math.sin(floorRotationRadians) +
      finite(anchorFloor.offsetX, 0);
    anchorOffsetZ =
      -floorLocalX * Math.sin(floorRotationRadians) +
      floorLocalY * Math.cos(floorRotationRadians) +
      finite(anchorFloor.offsetZ, 0);
    const floorsSortedByElevation = [...floorCandidates].sort(
      (floorEntryA, floorEntryB) => floorEntryA.elevation - floorEntryB.elevation
    );
    const floorStackIndex = Math.max(
      0,
      floorsSortedByElevation.findIndex(stackFloorEntry => stackFloorEntry.id === anchorFloor.id)
    );
    anchorElevation += floorStackIndex * finite(state.studioDocument.exportFloorGap, 3);
  } else {
    const singleFloorScene = anchorFloor.scene;
    const singleFloorBounds = singleFloorScene.walls?.length
      ? modelBounds({
          background: null,
          walls: singleFloorScene.walls,
          items: []
        })
      : singleFloorScene.items?.length
        ? modelBounds({
            background: null,
            walls: [],
            items: singleFloorScene.items
          })
        : modelBounds(singleFloorScene);
    anchorOffsetX =
      (finite(anchorItem.x, 0) - (singleFloorBounds.minX + singleFloorBounds.maxX) / 2) /
      anchorPixelsPerMeter;
    anchorOffsetZ =
      (finite(anchorItem.y, 0) - (singleFloorBounds.minY + singleFloorBounds.maxY) / 2) /
      anchorPixelsPerMeter;
  }
  state.previewCamera.updateMatrixWorld(true);
  const projectedAnchorPoint = new threeModuleMin.Vector3(
    anchorOffsetX,
    anchorElevation,
    anchorOffsetZ
  ).project(state.previewCamera);
  if (
    ![projectedAnchorPoint.x, projectedAnchorPoint.y, projectedAnchorPoint.z].every(
      Number.isFinite
    ) ||
    projectedAnchorPoint.z < -1 ||
    projectedAnchorPoint.z > 1
  ) {
    return null;
  } else {
    return {
      x: clamp((projectedAnchorPoint.x + 1) / 2, 0, 1),
      y: clamp((1 - projectedAnchorPoint.y) / 2, 0, 1)
    };
  }
}
/**
 * 在一组灯光里找出第一个能投影进画面的锚点，用于导出时自动取景构图；全部不可见时返回 null。
 * @returns {{x: number, y: number}|null} 首个可见锚点。
 */
function findLightAnchor(
  anchorLightItems: any,
  anchorFloorEntry: any,
  previewFloorCandidates = previewFloors()
) {
  for (const anchorLightItem of anchorLightItems || []) {
    const resolvedAnchorPoint = projectAnchorToFloorPlan(
      anchorLightItem,
      anchorFloorEntry,
      previewFloorCandidates
    );
    if (resolvedAnchorPoint) {
      return resolvedAnchorPoint;
    }
  }
  return null;
}
/**
 * 把 File / Blob 读成 Uint8Array，便于交给后端或做哈希计算。
 * @returns {Promise<Uint8Array>} 文件的原始字节。
 */
async function readFileBytes(fileSource: any) {
  return new Uint8Array(await fileSource.arrayBuffer());
}
function isolateExportVisibility(
  groupKeyFilter = "",
  televisionKeyFilter = "",
  vehicleKeyFilter = ""
) {
  for (const { key: isolatedGroupKey, group: isolatedGroupController } of collectLightGroups()) {
    isolatedGroupController.enabled = groupKeyFilter === "*" || isolatedGroupKey === groupKeyFilter;
  }
  for (const { key: isolatedTvKey, item: isolatedTvController } of collectTelevisions()) {
    isolatedTvController.screenEnabled =
      televisionKeyFilter === "*" || isolatedTvKey === televisionKeyFilter;
  }
  for (const { key: isolatedCarKey, item: isolatedCarController } of collectCars()) {
    isolatedCarController.chargingEnabled =
      vehicleKeyFilter === "*" || isolatedCarKey === vehicleKeyFilter;
  }
  refreshPreviewScene();
}
function setExportRoleVisibility(exportRole: any, roleVisibility: any) {
  if (state.previewModelRoot) {
    state.previewModelRoot.traverse((roleTargetObject: any) => {
      if (roleTargetObject.userData?.exportRole === exportRole) {
        roleTargetObject.visible = roleVisibility;
      }
    });
    invalidateRender({
      shadows: exportRole === "plan"
    });
  }
}
/**
 * 结束「同名文件夹是否覆盖」的询问：关闭对话框并把用户选择交回等待中的 Promise。用可选调用触发 resolver，
 * @param {string} [chosenAction="cancel"] "overwrite" 或 "cancel"。
 */
function settleOverwriteChoice(chosenAction = "cancel") {
  const pendingOverwriteResolver = state.overwriteConfirmResolve;
  state.overwriteConfirmResolve = null;
  if (exportOverwriteDialogElement.open) {
    exportOverwriteDialogElement.close();
  }
  pendingOverwriteResolver?.(chosenAction);
}
function showEmbeddedOverwriteDialog(hostWindow: any, displayFolderName: any) {
  const hostDocument = hostWindow.document;
  const embeddedOverwriteDialog = hostDocument.createElement("dialog");
  embeddedOverwriteDialog.className = "settings-dialog floorplan-auto-diagram-dialog";
  embeddedOverwriteDialog.setAttribute("aria-label", "同名导图已经存在");
  embeddedOverwriteDialog.innerHTML =
    '<div class="dialog-heading"><div><span>EXPORT EXISTS</span><h2>同名导图已经存在</h2></div></div>\n    <div class="floorplan-auto-diagram-guide">\n      <p>文件夹“<strong data-export-folder></strong>”已经存在。覆盖会整体替换原文件夹，原来存在但本次未导出的文件也会删除，已有仪表盘引用的同名图片会更新。</p>\n      <div class="dialog-actions"><button type="button" data-export-choice="cancel">不覆盖</button><button type="button" class="primary" data-export-choice="overwrite">覆盖更新</button></div>\n    </div>';
  embeddedOverwriteDialog.querySelector("[data-export-folder]").textContent = displayFolderName;
  return new Promise((approveOverwrite, rejectOverwriteChoice) => {
    let hasSettledChoice = false;
    /**
     * 内嵌对话框的内部结算函数：只允许结算一次，并负责摘除监听、关闭并移除 DOM。
     * @param {string} settleValue "overwrite" 或 "cancel"。
     */
    const settleChoice = (settleValue: any) => {
      if (!hasSettledChoice) {
        hasSettledChoice = true;
        window.removeEventListener("pagehide", cancelChoice);
        hostWindow.removeEventListener("pagehide", cancelChoice);
        if (embeddedOverwriteDialog.open) {
          embeddedOverwriteDialog.close();
        }
        embeddedOverwriteDialog.remove();
        approveOverwrite(settleValue);
      }
    };
    /**
     * 内嵌对话框「不覆盖」的快捷入口，供 Esc、close 事件与 pagehide 兜底共用。
     * @returns {void}
     */
    const cancelChoice = () => settleChoice("cancel");
    embeddedOverwriteDialog.addEventListener("cancel", (cancelEvent: any) => {
      cancelEvent.preventDefault();
      cancelChoice();
    });
    embeddedOverwriteDialog.addEventListener("close", cancelChoice);
    for (const choiceButton of embeddedOverwriteDialog.querySelectorAll("[data-export-choice]")) {
      choiceButton.addEventListener("click", () => settleChoice(choiceButton.dataset.exportChoice));
    }
    window.addEventListener("pagehide", cancelChoice);
    hostWindow.addEventListener("pagehide", cancelChoice);
    try {
      hostDocument.body.append(embeddedOverwriteDialog);
      embeddedOverwriteDialog.showModal();
      embeddedOverwriteDialog.querySelector('[data-export-choice="cancel"]').focus();
    } catch (dialogMountError) {
      window.removeEventListener("pagehide", cancelChoice);
      hostWindow.removeEventListener("pagehide", cancelChoice);
      embeddedOverwriteDialog.remove();
      rejectOverwriteChoice(dialogMountError);
    }
  });
}
/**
 * 询问用户是否覆盖已存在的同名导出文件夹。内嵌场景走父窗口自绘对话框；独立页面用页面内的 <dialog>，结果通过模块级
 */
function requestOverwriteDecision(overwriteFolderName: any) {
  if (state.overwriteConfirmResolve) {
    settleOverwriteChoice("cancel");
  }
  if (isAutoDiagramEmbed && autoDiagramComponentId && window.parent !== window) {
    return showEmbeddedOverwriteDialog(window.parent, overwriteFolderName);
  } else {
    exportOverwriteNameElement.textContent = overwriteFolderName;
    exportOverwriteDialogElement.showModal();
    return new Promise(overwriteDecisionResolver => {
      state.overwriteConfirmResolve = overwriteDecisionResolver;
    });
  }
}
function notifyExportStopped(stopCode: any, stopMessage: any) {
  if (!!isAutoDiagramEmbed && !!autoDiagramComponentId && window.parent !== window) {
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-stopped",
        componentId: autoDiagramComponentId,
        reason: stopCode,
        message: stopMessage
      },
      window.location.origin
    );
  }
}
/**
 * 弹出导出完成对话框，按「新建 / 覆盖」分别给出提示语与产物路径。
 * @param {object} exportOutcome 导出结果，含 overwritten 与 relativePath。
 */
function showExportCompleteDialog(exportOutcome: any) {
  const isOverwriteResult = exportOutcome?.overwritten === true;
  exportCompleteTitleElement.textContent = isOverwriteResult ? "导图覆盖完成" : "导图保存完成";
  exportCompleteMessageElement.textContent = isOverwriteResult
    ? "新导图已经安全替换原文件夹，已有仪表盘中的同名图片会自动更新。"
    : "导出的图片和数据已经保存到 NAS，可以在编辑器素材中继续使用。";
  exportCompletePathElement.textContent = "data/" + (exportOutcome?.relativePath || "exports");
  if (!exportCompleteDialogElement.open) {
    exportCompleteDialogElement.showModal();
  }
}
async function runStudioExport() {
  if (!state.exportRenderState || state.isExportBusy) {
    return;
  }
  saveActiveExportPreset();
  const exportTargetFolderName = exportFolderNameInput.value.trim();
  if (
    !exportTargetFolderName ||
    /[<>:\"/\\|?*\x00-\x1f\x7f]/.test(exportTargetFolderName) ||
    exportTargetFolderName.startsWith(".") ||
    /[. ]$/.test(exportTargetFolderName)
  ) {
    exportFolderNameInput.classList.add("invalid");
    exportFolderNameInput.focus();
    exportStatusElement.textContent = "请输入有效的文件夹名";
    return;
  }
  exportFolderNameInput.classList.remove("invalid");
  const checkedExportFileKeys = collectCheckedExportFileKeys();
  if (!checkedExportFileKeys.size) {
    exportStatusElement.textContent = "请至少勾选一项图片";
    return;
  }
  const sourceExportDimensions = exportDimensions();
  const { width: renderWidthPx, height: renderHeightPx } = scaledExportResolution(
    sourceExportDimensions.width,
    sourceExportDimensions.height,
    EXPORT_RENDER_SCALE
  );
  const savedCameraSnapshot = captureCameraSnapshot();
  const defaultExportFileNames = {
    background: "00底图." + EXPORT_IMAGE_EXTENSION,
    backgroundWithPlan: "00底图带户型." + EXPORT_IMAGE_EXTENSION,
    floorPlan: "00户型图." + EXPORT_IMAGE_EXTENSION
  };
  const reservedExportFileNames = new Set(
    Object.values(defaultExportFileNames).map(defaultExportFileName =>
      defaultExportFileName.toLocaleLowerCase()
    )
  );
  const exportFloorEntries = previewFloors();
  const lightGroupExportList = collectLightGroups(exportFloorEntries)
    .map(
      ({
        floor: lightGroupFloorEntry,
        group: groupEntry,
        index: groupOrdinal,
        key: groupExportKey
      }: any) => ({
        id: groupExportKey,
        groupId: groupEntry.id,
        floor: lightGroupFloorEntry,
        name:
          exportFloorEntries.length > 1
            ? lightGroupFloorEntry.name + "-" + groupEntry.name
            : groupEntry.name,
        enabledInEditor: state.exportRenderState.groupStates.get(groupExportKey) !== false,
        file: reserveExportFileName(
          exportFloorEntries.length > 1
            ? lightGroupFloorEntry.name + "-" + groupEntry.name
            : groupEntry.name,
          groupOrdinal,
          reservedExportFileNames
        ),
        lights: lightGroupFloorEntry.scene.items.filter(
          (floorSceneItem: any) =>
            LIGHT_ITEM_TYPES.has(floorSceneItem.type) &&
            floorSceneItem.lightGroupId === groupEntry.id
        )
      })
    )
    .filter((groupExportRow: any) => checkedExportFileKeys.has("group:" + groupExportRow.id));
  const televisionExportList = collectTelevisions(exportFloorEntries).map(
    ({ floor: tvExportFloor, item: tvExportItem, index: tvExportOrdinal, key: tvExportKey }: any) => ({
      id: "screen-" + tvExportKey,
      key: tvExportKey,
      floorId: tvExportFloor.id,
      itemId: tvExportItem.id,
      name:
        "" +
        (exportFloorEntries.length > 1 ? tvExportFloor.name + "-" : "") +
        (tvExportItem.screenLayerName || "电视画面 " + (tvExportOrdinal + 1)),
      enabledInEditor: state.exportRenderState.tvStates.get(tvExportKey) !== false,
      floor: tvExportFloor,
      item: tvExportItem,
      file: null
    })
  );
  const vehicleExportList = collectCars(exportFloorEntries).map(
    ({
      floor: vehicleExportFloor,
      item: vehicleExportItem,
      index: vehicleExportOrdinal,
      key: vehicleExportKey
    }: any) => ({
      id: "vehicle-" + vehicleExportKey,
      key: vehicleExportKey,
      floorId: vehicleExportFloor.id,
      itemId: vehicleExportItem.id,
      name:
        "" +
        (exportFloorEntries.length > 1 ? vehicleExportFloor.name + "-" : "") +
        (vehicleExportItem.chargingLayerName || "汽车充电 " + (vehicleExportOrdinal + 1)),
      chargingInEditor: state.exportRenderState.carChargingStates.get(vehicleExportKey) === true,
      floor: vehicleExportFloor,
      item: vehicleExportItem,
      file: null
    })
  );
  for (
    let tvFileAssignIndex = 0;
    tvFileAssignIndex < televisionExportList.length;
    tvFileAssignIndex += 1
  ) {
    const tvExportRow = televisionExportList[tvFileAssignIndex];
    tvExportRow.file = reserveExportFileName(
      tvExportRow.name,
      tvFileAssignIndex,
      reservedExportFileNames
    );
  }
  for (
    let vehicleFileAssignIndex = 0;
    vehicleFileAssignIndex < vehicleExportList.length;
    vehicleFileAssignIndex += 1
  ) {
    const vehicleExportRow = vehicleExportList[vehicleFileAssignIndex];
    vehicleExportRow.file = reserveExportFileName(
      vehicleExportRow.name,
      vehicleFileAssignIndex,
      reservedExportFileNames
    );
  }
  const checkedTelevisionExports = televisionExportList.filter((tvFilterRow: any) =>
    checkedExportFileKeys.has("screen:" + tvFilterRow.key)
  );
  const checkedVehicleExports = vehicleExportList.filter((vehicleFilterRow: any) =>
    checkedExportFileKeys.has("vehicle:" + vehicleFilterRow.key)
  );
  const needsCombinedRender =
    checkedExportFileKeys.has("backgroundWithPlan") ||
    checkedExportFileKeys.has("floorPlan") ||
    checkedTelevisionExports.length > 0 ||
    checkedVehicleExports.length > 0 ||
    lightGroupExportList.length > 0;
  let isOverwriteConfirmed = false;
  setExportBusy(true);
  try {
    exportStatusElement.textContent = "正在检查文件夹名…";
    if (
      (
        await requestStudioApi("/studio3d/exports/check", {
          headers: {
            "X-Export-Folder": encodeURIComponent(exportTargetFolderName)
          }
        })
      )?.exists
    ) {
      exportStatusElement.textContent = "同名导图“" + exportTargetFolderName + "”已经存在";
      const overwriteDecision = await requestOverwriteDecision(exportTargetFolderName);
      if (overwriteDecision === "rename") {
        exportStatusElement.textContent = "请修改文件夹名后重新保存";
        window.setTimeout(() => {
          exportFolderNameInput.focus();
          exportFolderNameInput.select();
        }, 0);
        notifyExportStopped("rename", "请在属性中修改文件夹名称后重新生成。");
        return;
      }
      if (overwriteDecision !== "overwrite") {
        exportStatusElement.textContent = "已取消覆盖，原导图保持不变";
        notifyExportStopped("cancel", "已取消覆盖，原导图保持不变。");
        return;
      }
      isOverwriteConfirmed = true;
    }
    state.renderer.setPixelRatio(1);
    state.renderer.setSize(renderWidthPx, renderHeightPx, false);
    applyCameraSnapshot(savedCameraSnapshot, renderWidthPx / renderHeightPx);
    setHighShadowQuality(true);
    exportStatusElement.textContent = "正在生成精细阴影导出图层…";
    isolateExportVisibility();
    let backgroundOnlyCapture = null;
    let combinedCapture: any = null;
    if (checkedExportFileKeys.has("background")) {
      setExportRoleVisibility("plan", false);
      setExportRoleVisibility("label", false);
      setExportRoleVisibility("outline", false);
      backgroundOnlyCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        pixels: true
      });
      setExportRoleVisibility("plan", true);
      setExportRoleVisibility("label", true);
      setExportRoleVisibility("outline", true);
    }
    if (needsCombinedRender) {
      combinedCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        pixels: true
      });
    }
    const exportFileEntries = [];
    if (backgroundOnlyCapture) {
      const backgroundBlob = await composeBackgroundBlob(
        renderWidthPx,
        renderHeightPx,
        backgroundOnlyCapture.imageData
      );
      exportFileEntries.push({
        name: defaultExportFileNames.background,
        data: await readFileBytes(backgroundBlob)
      });
    }
    if (checkedExportFileKeys.has("backgroundWithPlan")) {
      const combinedBlob = await composeBackgroundBlob(
        renderWidthPx,
        renderHeightPx,
        combinedCapture.imageData
      );
      exportFileEntries.push({
        name: defaultExportFileNames.backgroundWithPlan,
        data: await readFileBytes(combinedBlob)
      });
    }
    if (checkedExportFileKeys.has("floorPlan")) {
      setExportRoleVisibility("background", false);
      setExportRoleVisibility("grid", false);
      const floorPlanCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        blob: true
      });
      setExportRoleVisibility("background", true);
      setExportRoleVisibility("grid", true);
      exportFileEntries.push({
        name: defaultExportFileNames.floorPlan,
        data: await readFileBytes(floorPlanCapture.blob)
      });
    }
    for (
      let groupRenderIndex = 0;
      groupRenderIndex < lightGroupExportList.length;
      groupRenderIndex += 1
    ) {
      const groupExportRowEntry = lightGroupExportList[groupRenderIndex];
      const groupBlob = await compositeLightGroupShadows(
        combinedCapture.imageData,
        groupExportRowEntry,
        renderWidthPx,
        renderHeightPx,
        groupRenderIndex,
        lightGroupExportList.length
      );
      exportFileEntries.push({
        name: groupExportRowEntry.file,
        data: await readFileBytes(groupBlob)
      });
    }
    for (
      let tvRenderIndex = 0;
      tvRenderIndex < checkedTelevisionExports.length;
      tvRenderIndex += 1
    ) {
      const tvExportRowItem = checkedTelevisionExports[tvRenderIndex];
      exportStatusElement.textContent =
        "正在生成电视图层 " +
        (tvRenderIndex + 1) +
        "/" +
        checkedTelevisionExports.length +
        "：" +
        tvExportRowItem.name;
      isolateExportVisibility("", tvExportRowItem.key);
      const tvCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        pixels: true
      });
      const tvLayerBlob = await composeTelevisionLayerBlob(
        combinedCapture.imageData,
        tvCapture.imageData
      );
      exportFileEntries.push({
        name: tvExportRowItem.file,
        data: await readFileBytes(tvLayerBlob)
      });
    }
    for (
      let vehicleRenderIndex = 0;
      vehicleRenderIndex < checkedVehicleExports.length;
      vehicleRenderIndex += 1
    ) {
      const vehicleExportRowItem = checkedVehicleExports[vehicleRenderIndex];
      exportStatusElement.textContent =
        "正在生成汽车图层 " +
        (vehicleRenderIndex + 1) +
        "/" +
        checkedVehicleExports.length +
        "：" +
        vehicleExportRowItem.name;
      isolateExportVisibility("", "", vehicleExportRowItem.key);
      const vehicleCapture = await captureStageImage(renderWidthPx, renderHeightPx, {
        pixels: true
      });
      const vehicleLayerBlob = await composeTelevisionLayerBlob(
        combinedCapture.imageData,
        vehicleCapture.imageData
      );
      exportFileEntries.push({
        name: vehicleExportRowItem.file,
        data: await readFileBytes(vehicleLayerBlob)
      });
    }
    const exportManifest = {
      schemaVersion: 3,
      exportName: exportTargetFolderName,
      floorMode: currentPreviewFloorMode(),
      floorPresentationGap:
        currentPreviewFloorMode() === "all" ? finite(state.studioDocument.exportFloorGap, 3) : 0,
      floors: exportFloorEntries.map((manifestFloor: any) => ({
        id: manifestFloor.id,
        name: manifestFloor.name,
        elevation: floorExportOffset(manifestFloor),
        offsetX: manifestFloor.offsetX,
        offsetZ: manifestFloor.offsetZ,
        rotation: manifestFloor.rotation
      })),
      generatedAt: new Date().toISOString(),
      resolution: {
        width: renderWidthPx,
        height: renderHeightPx
      },
      sourceResolution: sourceExportDimensions,
      renderScale: EXPORT_RENDER_SCALE,
      imageFormat: {
        extension: EXPORT_IMAGE_EXTENSION,
        mimeType: EXPORT_IMAGE_MIME_TYPE,
        quality: EXPORT_IMAGE_QUALITY
      },
      camera: buildExportCameraState(renderWidthPx, renderHeightPx),
      backgroundImage: checkedExportFileKeys.has("background")
        ? defaultExportFileNames.background
        : null,
      baseImage: checkedExportFileKeys.has("backgroundWithPlan")
        ? defaultExportFileNames.backgroundWithPlan
        : null,
      floorPlanImage: checkedExportFileKeys.has("floorPlan")
        ? defaultExportFileNames.floorPlan
        : null,
      televisionOnImage:
        checkedTelevisionExports.length === 1 ? checkedTelevisionExports[0].file : null,
      televisionOnImages: checkedTelevisionExports.map((tvFileName: any) => tvFileName.file),
      vehicleChargingImage:
        checkedVehicleExports.length === 1 ? checkedVehicleExports[0].file : null,
      vehicleChargingImages: checkedVehicleExports.map((vehicleFileName: any) => vehicleFileName.file),
      exportedFiles: exportFileEntries.map(exportedFileEntry => exportedFileEntry.name),
      groups: lightGroupExportList.map((manifestGroup: any) => ({
        id: manifestGroup.id,
        groupId: manifestGroup.groupId,
        floorId: manifestGroup.floor.id,
        name: manifestGroup.name,
        file: manifestGroup.file,
        anchor: findLightAnchor(manifestGroup.lights, manifestGroup.floor, exportFloorEntries),
        enabledInEditor: manifestGroup.enabledInEditor,
        lights: manifestGroup.lights.map((manifestGroupLight: any) =>
          buildExportedLight(manifestGroupLight, manifestGroup.floor)
        )
      })),
      screens: televisionExportList.map(
        ({
          key: manifestTvKey,
          floor: manifestTvFloor,
          item: manifestTvItem,
          ...manifestTvRest
        }: any) => ({
          ...manifestTvRest,
          anchor: projectAnchorToFloorPlan(manifestTvItem, manifestTvFloor, exportFloorEntries),
          file: checkedExportFileKeys.has("screen:" + manifestTvKey) ? manifestTvRest.file : null
        })
      ),
      vehicles: vehicleExportList.map(
        ({
          key: manifestVehicleKey,
          floor: manifestVehicleFloor,
          item: manifestVehicleItem,
          ...manifestVehicleRest
        }: any) => ({
          ...manifestVehicleRest,
          anchor: projectAnchorToFloorPlan(
            manifestVehicleItem,
            manifestVehicleFloor,
            exportFloorEntries
          ),
          file: checkedExportFileKeys.has("vehicle:" + manifestVehicleKey)
            ? manifestVehicleRest.file
            : null
        })
      )
    };
    if (checkedExportFileKeys.has("dataLights")) {
      exportFileEntries.push({
        name: "lights.json",
        data: new TextEncoder().encode(JSON.stringify(exportManifest, null, 2) + "\n")
      });
    }
    if (checkedExportFileKeys.has("dataScene")) {
      const sceneSnapshot =
        currentPreviewFloorMode() === "all" ? cloneStudioDocument() : cloneSceneForHistory();
      exportFileEntries.push({
        name: "scene.json",
        data: new TextEncoder().encode(JSON.stringify(sceneSnapshot, null, 2) + "\n")
      });
    }
    exportStatusElement.textContent = "正在打包 ZIP…";
    const zipBlob = buildStoredZip(exportFileEntries);
    exportStatusElement.textContent = "正在保存到 NAS data…";
    const exportPackageBlob = new Blob([zipBlob as any], {
      type: "application/zip"
    });
    const uploadExportPackage = (allowOverwrite = false) =>
      requestStudioApi("/studio3d/exports", {
        method: "POST",
        body: exportPackageBlob,
        headers: {
          "Content-Type": "application/zip",
          "X-Export-Folder": encodeURIComponent(exportTargetFolderName),
          ...(allowOverwrite
            ? {
                "X-Export-Overwrite": "true"
              }
            : {})
        }
      });
    let exportUploadResponse;
    try {
      exportUploadResponse = await uploadExportPackage(isOverwriteConfirmed);
    } catch (exportUploadError: any) {
      if (
        exportUploadError?.status !== 409 ||
        exportUploadError?.payload?.detail?.code !== "STUDIO3D_EXPORT_EXISTS"
      ) {
        throw exportUploadError;
      }
      exportStatusElement.textContent = "同名导图“" + exportTargetFolderName + "”已经存在";
      const retryDecision = await requestOverwriteDecision(exportTargetFolderName);
      if (retryDecision === "rename") {
        exportStatusElement.textContent = "请修改文件夹名后重新保存";
        window.setTimeout(() => {
          exportFolderNameInput.focus();
          exportFolderNameInput.select();
        }, 0);
        notifyExportStopped("rename", "请在属性中修改文件夹名称后重新生成。");
        return;
      }
      if (retryDecision !== "overwrite") {
        exportStatusElement.textContent = "已取消覆盖，原导图保持不变";
        notifyExportStopped("cancel", "已取消覆盖，原导图保持不变。");
        return;
      }
      exportStatusElement.textContent = "正在安全覆盖原导图…";
      exportUploadResponse = await uploadExportPackage(true);
    }
    exportStatusElement.textContent = "已保存到 data/" + exportUploadResponse.relativePath;
    showToast("导图已保存到 data/" + exportUploadResponse.relativePath, "success");
    const embeddingHostWindow = isAutoDiagramEmbed ? window.parent : window.opener;
    if (
      autoDiagramComponentId &&
      embeddingHostWindow &&
      (isAutoDiagramEmbed || !embeddingHostWindow.closed)
    ) {
      embeddingHostWindow.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-export",
          componentId: autoDiagramComponentId,
          folderName: exportTargetFolderName,
          manifest: exportManifest
        },
        window.location.origin
      );
    }
    state.isExportComplete = true;
    updateOnboardingSteps();
    showExportCompleteDialog(exportUploadResponse);
  } catch (exportError: any) {
    window.HABridgeLog?.error?.(exportError, {
      phase: "studio-export",
      componentId: autoDiagramComponentId || ""
    });
    debugLog("error", exportError);
    exportStatusElement.textContent = exportError?.message || "导出失败，请重试。";
    showToast(exportError?.message || "导图失败。", "error");
    if (isAutoDiagramEmbed && autoDiagramComponentId && window.parent !== window) {
      window.parent.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-error",
          componentId: autoDiagramComponentId,
          message: exportError?.message || "后台生成失败，请重试。"
        },
        window.location.origin
      );
    }
  } finally {
    setHighShadowQuality(false);
    for (const {
      key: restoreGroupStateKey,
      group: restoreGroupStateController
    } of collectLightGroups()) {
      if (state.exportRenderState?.groupStates.has(restoreGroupStateKey)) {
        restoreGroupStateController.enabled =
          state.exportRenderState.groupStates.get(restoreGroupStateKey);
      }
    }
    for (const { key: restoreTvStateKey, item: restoreTvStateController } of collectTelevisions()) {
      if (state.exportRenderState?.tvStates.has(restoreTvStateKey)) {
        restoreTvStateController.screenEnabled = state.exportRenderState.tvStates.get(restoreTvStateKey);
      }
    }
    for (const { key: restoreCarStateKey, item: restoreCarStateController } of collectCars()) {
      if (state.exportRenderState?.carChargingStates.has(restoreCarStateKey)) {
        restoreCarStateController.chargingEnabled =
          state.exportRenderState.carChargingStates.get(restoreCarStateKey);
      }
    }
    refreshPreviewScene();
    applyCameraSnapshot(savedCameraSnapshot, renderWidthPx / renderHeightPx);
    setExportBusy(false);
    refreshExportPreview();
  }
}
/** 平面占位是否无法直接用「宽 x 深」表示、必须另行推导。 */
function itemFootprintSwapped(item: any) {
  return pillarIsLying(item) || stripIsStanding(item);
}
/** 返回同一个物件，但把平面占位写进 width/depth，供整件级别的辅助函数使用。 */
function itemWithPlanFootprint(item: any) {
  if (!itemFootprintSwapped(item)) {
    return item;
  }
  const footprint = itemPlanFootprint(item);
  return {
    ...item,
    width: footprint.width,
    depth: footprint.depth
  };
}
document.addEventListener("visibilitychange", () => {
  if (!document.hidden && state.shouldRerunLightPrecompile) {
    scheduleLightPrecompile();
  }
});
window.addEventListener(
  "pagehide",
  () => {
    state.isPageUnloading = true;
    window.clearTimeout(state.lightPrecompileTimer);
  },
  {
    once: true
  }
);
function syncPreviewFloorButtons() {
  const previewMode = currentPreviewFloorMode();
  const hasSeveralFloors = (state.studioDocument?.floors.length || 0) > 1;
  for (const floorModeButton of previewFloorButtons) {
    const isActiveFloorButton = (floorModeButton as any).dataset.previewFloor === previewMode;
    floorModeButton.classList.toggle("active", isActiveFloorButton);
    floorModeButton.setAttribute("aria-pressed", String(isActiveFloorButton));
    (floorModeButton as any).disabled = (floorModeButton as any).dataset.previewFloor === "all" && !hasSeveralFloors;
  }
}
function setPreviewFloorMode(mode: any, { persist: persistPreviewMode = true } = {}) {
  if (state.studioDocument) {
    state.studioDocument.previewFloorMode =
      mode === "all" && state.studioDocument.floors.length > 1 ? "all" : "active";
    syncPreviewFloorButtons();
    syncCameraViewControls();
    applyCameraMode(currentCameraMode(), {
      preserveView: false
    });
    Promise.allSettled(releaseAllDeferredModels());
    refreshPreviewScene();
    resetCameraView();
    if (persistPreviewMode) {
      markDocumentDirty();
    }
  }
}
/**
 * 只重建指定楼层（楼层内容变化时的增量切换）。叠放模式下若目标楼层对应的 Group 尚未建出（或楼层列表与场景不同步），
 */
function switchPreviewFloor(targetFloorIds: any) {
  if (!targetFloorIds.size || !state.previewModelRoot) {
    return;
  }
  if (currentPreviewFloorMode() !== "all") {
    if (targetFloorIds.has(state.activeFloorId)) {
      refreshPreviewScene();
    }
    return;
  }
  const switchRootSnapshot = state.previewModelRoot;
  const switchSceneSnapshot = state.activeScene;
  const switchFloorIdSnapshot = state.activeFloorId;
  const switchFocusSnapshot = state.floorFocusPoint;
  const switchSortedFloors = [...state.studioDocument.floors].sort(
    (switchFloorA, switchFloorB) => switchFloorA.elevation - switchFloorB.elevation
  );
  if (
    switchSortedFloors.some(
      candidateFloorRecord =>
        !switchRootSnapshot.children.some(
          (matchedFloorChild: any) => matchedFloorChild.userData?.floorId === candidateFloorRecord.id
        )
    )
  ) {
    refreshPreviewScene();
    return;
  }
  try {
    for (const [targetFloorIndex, targetFloorRecord] of switchSortedFloors.entries()) {
      if (
        targetFloorIds.has(targetFloorRecord.id) &&
        ((state.previewModelRoot = switchRootSnapshot.children.find(
          (foundFloorChild: any) => foundFloorChild.userData?.floorId === targetFloorRecord.id
        )),
        (state.activeScene = targetFloorRecord.scene),
        (state.activeFloorId = targetFloorRecord.id),
        (state.floorFocusPoint = {
          x: finite(targetFloorRecord.originX, 0),
          y: finite(targetFloorRecord.originY, 0)
        }),
        state.previewModelRoot.position.set(
          finite(targetFloorRecord.offsetX, 0),
          targetFloorIndex * state.studioDocument.previewFloorGap,
          finite(targetFloorRecord.offsetZ, 0)
        ),
        state.previewModelRoot.rotation.set(
          0,
          -threeModuleMin.MathUtils.degToRad(finite(targetFloorRecord.rotation, 0)),
          0
        ),
        state.previewModelRoot.scale.set(1, 1, 1),
        rebuildPreviewScene(),
        targetFloorIndex > 0)
      ) {
        for (const hiddenFloorChild of [...state.previewModelRoot.children]) {
          if (["background", "grid"].includes(hiddenFloorChild.userData?.exportRole)) {
            if (isStageViewerMode) {
              hiddenFloorChild.userData.floorBackgroundHidden = true;
              hiddenFloorChild.visible = false;
              continue;
            }
            state.previewModelRoot.remove(hiddenFloorChild);
            disposeSceneSubtree(hiddenFloorChild);
          }
        }
      }
    }
  } finally {
    state.previewModelRoot = switchRootSnapshot;
    state.activeScene = switchSceneSnapshot;
    state.activeFloorId = switchFloorIdSnapshot;
    state.floorFocusPoint = switchFocusSnapshot;
  }
  applyShadowBudget(switchRootSnapshot);
  fitDirectionalShadowCamera();
}
function resetCameraView(cameraViewOptions: any = {}) {
  if (!state.previewCamera || !state.orbitControls) {
    return;
  }
  const nextView =
    cameraViewOptions.view === "top"
      ? "top"
      : cameraViewOptions.view === "free"
        ? "free"
        : currentCameraView();
  const viewTopRotationDeg = currentTopRotationDeg();
  const isFloorOverview = currentPreviewFloorMode() === "all";
  const cameraPixelsPerMeter = currentPixelsPerMeter() || 100;
  const cameraFloorBounds = computeFloorBounds();
  const cameraSceneBounds = computeSceneBoundingBox({
    excludeModelLayers: new Set(["items", "lights"])
  });
  const sceneSize =
    isFloorOverview && !cameraSceneBounds.isEmpty()
      ? cameraSceneBounds.getSize(new threeModuleMin.Vector3())
      : null;
  const sceneCenter = cameraSceneBounds.isEmpty()
    ? null
    : cameraSceneBounds.getCenter(new threeModuleMin.Vector3());
  const orthoFrameSize =
    isFloorOverview && sceneSize
      ? clamp(Math.max(sceneSize.x, sceneSize.z), 5, 100)
      : clamp(
          Math.max(cameraFloorBounds.width, cameraFloorBounds.height) / cameraPixelsPerMeter,
          5,
          35
        );
  const maxWallHeight =
    isFloorOverview && sceneSize
      ? sceneSize.y
      : Math.max(0, ...state.activeScene.walls.map((sceneWall: any) => sceneWall.height || 0));
  const frameExtent = Math.max(orthoFrameSize * 1.18, orthoFrameSize + maxWallHeight * 0.32);
  state.previewCamera.userData.frameSize = frameExtent;
  state.previewCamera.userData.cameraView = nextView;
  state.previewCamera.userData.topRotation = viewTopRotationDeg;
  const resetTargetPoint = sceneCenter
    ? new threeModuleMin.Vector3(sceneCenter.x, sceneCenter.y, sceneCenter.z)
    : new threeModuleMin.Vector3(0, Math.min(0.78, orthoFrameSize * 0.055), 0);
  let resetCameraDistance;
  if (state.previewCamera.isPerspectiveCamera) {
    state.previewCamera.aspect = state.previewCamera.userData.viewportAspect || 1;
    applyFocalLength();
    const boundsDiagonal =
      frameExtent /
      (Math.tan(threeModuleMin.MathUtils.degToRad(state.previewCamera.getEffectiveFOV()) / 2) * 2);
    resetCameraDistance = Math.max(boundsDiagonal * 1.04, orthoFrameSize * 1.65, 8);
  } else {
    applyOrthographicFrame(frameExtent, state.previewCamera.userData.viewportAspect || 1);
    resetCameraDistance = Math.max(orthoFrameSize * 3.2, 18);
  }
  if (nextView === "top") {
    state.previewCamera.up.copy(topViewUpVector(viewTopRotationDeg));
    state.previewCamera.position.set(
      resetTargetPoint.x,
      resetTargetPoint.y + resetCameraDistance,
      resetTargetPoint.z
    );
  } else {
    state.previewCamera.up.set(0, 1, 0);
    const resetCameraDirection = new threeModuleMin.Vector3(1.08, 1.7, 1.12).normalize();
    state.previewCamera.position
      .copy(resetTargetPoint)
      .addScaledVector(resetCameraDirection, resetCameraDistance);
  }
  updateCameraClipPlanes(state.previewCamera, resetTargetPoint);
  state.previewCamera.zoom = 1;
  state.previewCamera.lookAt(resetTargetPoint);
  state.previewCamera.updateProjectionMatrix();
  state.orbitControls.target.copy(resetTargetPoint);
  applyRenderQualityMode();
  state.orbitControls.update();
}
function resolveSnapTarget(snapPointInput: any, anchor: any, forceOrthogonal = false) {
  const snapPixelsPerMeter = currentPixelsPerMeter() || 100;
  if (!isSnapEnabled()) {
    if (forceOrthogonal && anchor) {
      const axisLockedResult = axisLockedPoint(snapPointInput, anchor);
      return {
        ...axisLockedResult,
        kind: "axis",
        distance: distance(snapPointInput, axisLockedResult.point)
      };
    }
    return {
      point: {
        ...snapPointInput
      },
      kind: null,
      label: "",
      distance: 0
    };
  }
  const snapSettings = state.activeScene.settings;
  return snapPoint(snapPointInput, state.activeScene.walls, {
    zoom: state.viewTransform.zoom,
    screenTolerance: clamp(Math.round(finite(snapSettings.snapTolerance, 13)), 6, 24),
    anchor: anchor,
    forceOrthogonalAxis: forceOrthogonal,
    preferVerticalAxis: snapSettings.snapOrthogonal !== false,
    angleStepDegrees: 15,
    gridSize: snapPixelsPerMeter * 0.1,
    intersections:
      snapSettings.snapIntersections === false ? [] : wallIntersectionsForWalls(snapPixelsPerMeter),
    snapEndpoints: snapSettings.snapEndpoints !== false,
    snapIntersections: snapSettings.snapIntersections !== false,
    snapSegments: snapSettings.snapSegments !== false,
    snapOrthogonal: snapSettings.snapOrthogonal !== false,
    snapAngles: snapSettings.snapAngles !== false,
    snapGrid: snapSettings.snapGrid !== false
  });
}
/**
 * @returns {boolean} true 表示吸附到起点、应当闭合。
 */
function isSnapClosingSpace(snapTargetCandidate = state.snapTarget) {
  if (!state.snapEndpointCandidate || state.scalePointCount < 2 || !snapTargetCandidate?.point) {
    return false;
  }
  const endpointTolerance = Math.max(1, (currentPixelsPerMeter() || 100) * 0.01);
  return (
    snapTargetCandidate.kind === "endpoint" &&
    distance(snapTargetCandidate.point, state.snapEndpointCandidate) <= endpointTolerance
  );
}
function updateSnapIndicator(shiftKey = state.snapOverridePoint) {
  if (!state.scaleAnchorPoint) {
    return;
  }
  state.scalePreviewCurrent = {
    ...state.scaleAnchorPoint
  };
  const scalePixelsPerMeter = currentPixelsPerMeter() || 100;
  const snapDisabledLabel = state.isSnapTemporarilyDisabled ? "吸附：临时关闭" : "吸附：关闭";
  if (state.activeTool === "scale" && state.scalePreviewStart && shiftKey) {
    const scaleAxisLocked = axisLockedPoint(state.scaleAnchorPoint, state.scalePreviewStart);
    state.scalePreviewCurrent = scaleAxisLocked.point;
    state.snapTarget = null;
    snapIndicatorElement.textContent = "吸附：" + scaleAxisLocked.label;
  } else if (state.activeTool === "scale") {
    state.snapTarget = null;
    snapIndicatorElement.textContent = "吸附：自由";
  }
  cursorPositionElement.textContent =
    "X " +
    (state.scalePreviewCurrent.x / scalePixelsPerMeter).toFixed(2) +
    " m · Y " +
    (state.scalePreviewCurrent.y / scalePixelsPerMeter).toFixed(2) +
    " m";
  if (state.activeTool === "wall") {
    state.snapTarget = resolveSnapTarget(state.scaleAnchorPoint, state.scaleStartPoint, shiftKey);
    snapIndicatorElement.textContent = isSnapClosingSpace(state.snapTarget)
      ? "闭合：点击闭合空间"
      : state.snapTarget.kind
        ? (!isSnapEnabled() && shiftKey ? "锁定" : "吸附") + "：" + state.snapTarget.label
        : isSnapEnabled()
          ? "吸附：自由"
          : snapDisabledLabel;
  } else if (["window", "door", "railing"].includes(state.activeTool)) {
    const scaleWallHit = nearestWall(
      state.scalePreviewCurrent,
      state.activeScene.walls,
      16 / state.viewTransform.zoom
    );
    if (scaleWallHit) {
      const previewDoorDimensions =
        DOOR_TYPE_DIMENSIONS[selectedDoorType] || DOOR_TYPE_DIMENSIONS.solid;
      const scalePreviewPoint = {
        width:
          state.activeTool === "door" ? previewDoorDimensions.width : state.activeTool === "railing" ? 2 : 1.4,
        t: scaleWallHit.t
      };
      const openingSnapTarget = {
        wall: scaleWallHit.wall,
        t: clampWindowT(scaleWallHit.wall, scalePreviewPoint, scalePixelsPerMeter)
      };
      state.windowSnapTarget = state.activeTool === "window" ? openingSnapTarget : null;
      state.doorSnapTarget = state.activeTool === "door" ? openingSnapTarget : null;
      state.railingSnapTarget = state.activeTool === "railing" ? openingSnapTarget : null;
      snapIndicatorElement.textContent =
        state.activeTool === "door"
          ? "吸附：墙体门洞"
          : state.activeTool === "railing"
            ? "吸附：墙体栏杆"
            : "吸附：墙体";
    } else {
      state.windowSnapTarget = null;
      state.doorSnapTarget = null;
      state.railingSnapTarget = null;
      snapIndicatorElement.textContent = "吸附：未找到墙体";
    }
  } else if (state.activeTool === "pan") {
    state.snapTarget = null;
    state.windowSnapTarget = null;
    state.doorSnapTarget = null;
    state.railingSnapTarget = null;
    snapIndicatorElement.textContent = isSnapEnabled() ? "吸附：开启" : snapDisabledLabel;
    planCanvasElement.style.cursor = "";
  } else if (state.activeTool !== "scale") {
    state.snapTarget = null;
    state.windowSnapTarget = null;
    state.doorSnapTarget = null;
    state.railingSnapTarget = null;
    snapIndicatorElement.textContent = isSnapEnabled() ? "吸附：开启" : snapDisabledLabel;
    const scaleItemHandle = hitTestItemHandle(state.scalePreviewCurrent);
    planCanvasElement.style.cursor =
      scaleItemHandle?.type === "rotate-item"
        ? "grab"
        : scaleItemHandle?.type === "resize-item"
          ? "nwse-resize"
          : "";
  }
}
/**
 * 记录本次指针位置并刷新吸附预览（指针移动过程中每个事件都会调用）。
 * @param {object} snapPointerEvent 指针事件（读 shiftKey 与屏幕坐标）。
 */
function beginPointerScale(snapPointerEvent: any) {
  state.snapOverridePoint = snapPointerEvent.shiftKey;
  state.scaleAnchorPoint = screenToPlan(canvasPointFromEvent(snapPointerEvent));
  updateSnapIndicator();
}
/**
 * 平面画布按下指针的总分发器（左键 / 中键）。按下先聚焦画布，再按优先级判定命中：平移、楼层对齐、各绘制工具
 */
function onPlanCanvasPointerDown(canvasPointerEvent: any) {
  if (canvasPointerEvent.button !== 0 && canvasPointerEvent.button !== 1) {
    return;
  }
  planCanvasElement.focus({
    preventScroll: true
  });
  const downScreenPoint = canvasPointFromEvent(canvasPointerEvent);
  const pointerPlanPoint = screenToPlan(downScreenPoint);
  if (canvasPointerEvent.button === 1 || state.isPanning || state.activeTool === "pan") {
    canvasPointerEvent.preventDefault();
    beginExportRender();
    state.pointerInteraction = {
      type: "pan",
      pointerId: canvasPointerEvent.pointerId,
      screen: rotateScreenPoint(downScreenPoint),
      visibleScreen: downScreenPoint,
      offsetX: state.viewTransform.offsetX,
      offsetY: state.viewTransform.offsetY
    };
    planCanvasElement.classList.add("panning");
    syncMetricsCanvas();
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
    return;
  }
  if (state.floorAlignState && handleFloorAlignClick(pointerPlanPoint)) {
    return;
  }
  if (state.activeTool === "flooropening") {
    if (!ensureCalibration()) {
      return;
    }
    canvasPointerEvent.preventDefault();
    beginExportRender();
    state.pointerInteraction = {
      type: "draw-flooropening",
      pointerId: canvasPointerEvent.pointerId,
      start: pointerPlanPoint,
      current: pointerPlanPoint
    };
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
    return;
  }
  if (state.activeTool === "scale") {
    if (!state.scalePreviewStart) {
      state.scalePreviewStart = pointerPlanPoint;
      renderPlanView();
      return;
    }
    const axisLockedPlanPoint = canvasPointerEvent.shiftKey
      ? axisLockedPoint(pointerPlanPoint, state.scalePreviewStart).point
      : pointerPlanPoint;
    if (distance(state.scalePreviewStart, axisLockedPlanPoint) < 12 / state.viewTransform.zoom) {
      showToast("参考线太短，请重新选择终点。", "error");
      return;
    }
    state.scaleReferenceLine = {
      start: state.scalePreviewStart,
      end: axisLockedPlanPoint
    };
    state.scalePreviewStart = null;
    referencePixelsElement.textContent =
      Math.round(distance(state.scaleReferenceLine.start, state.scaleReferenceLine.end)) + " px";
    referenceMetersInput.value = state.activeScene.calibration?.reference?.meters || 3;
    scaleDialogElement.showModal();
    requestAnimationFrame(() => referenceMetersInput.select());
    renderPlanView();
    return;
  }
  if (state.activeTool === "wall") {
    if (!ensureCalibration()) {
      return;
    }
    const snapResult = resolveSnapTarget(
      pointerPlanPoint,
      state.scaleStartPoint,
      canvasPointerEvent.shiftKey
    );
    if (!state.scaleStartPoint) {
      state.scaleStartPoint = {
        ...snapResult.point
      };
      state.snapEndpointCandidate = {
        ...snapResult.point
      };
      state.scalePointCount = 0;
      finishWallButton.hidden = false;
      renderPlanView();
      return;
    }
    if (distance(state.scaleStartPoint, snapResult.point) < currentPixelsPerMeter() * 0.08) {
      showToast("墙段太短，请选择更远的终点。", "error");
      return;
    }
    const wallDraft = {
      id: createId("wall"),
      start: {
        ...state.scaleStartPoint
      },
      end: {
        ...snapResult.point
      },
      height: state.activeScene.settings.wallHeight,
      thickness: state.activeScene.settings.wallThickness
    };
    const minSegmentLength = Math.max(0.75, currentPixelsPerMeter() * 0.01);
    const uncoveredSegments = uncoveredCollinearWallSegments(
      wallDraft,
      state.activeScene.walls,
      minSegmentLength
    );
    if (!uncoveredSegments.length) {
      state.scaleStartPoint = {
        ...snapResult.point
      };
      showToast("该位置已有墙体，已跳过重复墙段。");
      renderPlanView();
      return;
    }
    const shouldAutoCloseWall =
      uncoveredSegments.length !== 1 ||
      distance(uncoveredSegments[0].start, wallDraft.start) > minSegmentLength ||
      distance(uncoveredSegments[0].end, wallDraft.end) > minSegmentLength;
    pushHistorySnapshot();
    const mergeTolerance = Math.max(1, currentPixelsPerMeter() * 0.01);
    const closedPolygonCount = closedWallPolygons(state.activeScene.walls, mergeTolerance).length;
    const newWalls = uncoveredSegments.map((segment, segmentIndex) => ({
      ...wallDraft,
      id: segmentIndex === 0 ? wallDraft.id : createId("wall"),
      start: segment.start,
      end: segment.end
    }));
    state.activeScene.walls.push(...newWalls);
    refreshSplitGeometry();
    state.scalePointCount += 1;
    const didCloseWalls =
      closedWallPolygons(state.activeScene.walls, mergeTolerance).length > closedPolygonCount;
    if (didCloseWalls) {
      resetScaleInteractionState();
    } else {
      state.scaleStartPoint = {
        ...snapResult.point
      };
    }
    setSelection("wall", newWalls[0].id);
    finishWallButton.hidden = didCloseWalls;
    refreshStudio();
    markDocumentDirty();
    if (didCloseWalls) {
      showToast("空间已闭合，地面已生成。可继续绘制下一个空间。", "success");
    } else if (shouldAutoCloseWall) {
      showToast("已跳过与现有墙体重合的部分。", "success");
    }
    return;
  }
  if (state.activeTool === "window") {
    if (!ensureCalibration()) {
      return;
    }
    const windowWallHit = nearestWall(pointerPlanPoint, state.activeScene.walls, 18 / state.viewTransform.zoom);
    if (!windowWallHit) {
      showToast("请靠近一段墙体放置窗户。", "error");
      return;
    }
    pushHistorySnapshot();
    const newWindow = {
      id: createId("window"),
      wallId: windowWallHit.wall.id,
      t: windowWallHit.t,
      width: 1.4,
      height: 1.35,
      sill: 0.85
    };
    newWindow.t = clampWindowT(windowWallHit.wall, newWindow, currentPixelsPerMeter());
    state.activeScene.windows.push(newWindow);
    const windowScope = currentLightScope();
    setSelection("window", newWindow.id);
    refreshStudio("architecture");
    requestSceneRefresh(windowScope);
    markDocumentDirty();
    return;
  }
  if (state.activeTool === "door") {
    if (!ensureCalibration()) {
      return;
    }
    const doorWallHit = nearestWall(pointerPlanPoint, state.activeScene.walls, 18 / state.viewTransform.zoom);
    if (!doorWallHit) {
      showToast("请靠近一段墙体放置门。", "error");
      return;
    }
    pushHistorySnapshot();
    const placedDoorDimensions =
      DOOR_TYPE_DIMENSIONS[selectedDoorType] || DOOR_TYPE_DIMENSIONS.solid;
    const newDoor = {
      id: createId("door"),
      wallId: doorWallHit.wall.id,
      t: doorWallHit.t,
      width: placedDoorDimensions.width,
      height: placedDoorDimensions.height,
      sill: 0,
      doorType: selectedDoorType,
      hinge: "left",
      swing: 1
    };
    newDoor.t = clampWindowT(doorWallHit.wall, newDoor, currentPixelsPerMeter());
    state.activeScene.doors.push(newDoor);
    const doorScope = currentLightScope();
    setSelection("door", newDoor.id);
    refreshStudio("architecture");
    requestSceneRefresh(doorScope);
    markDocumentDirty();
    return;
  }
  if (state.activeTool === "railing") {
    if (!ensureCalibration()) {
      return;
    }
    const railingWallHit = nearestWall(
      pointerPlanPoint,
      state.activeScene.walls,
      18 / state.viewTransform.zoom
    );
    if (!railingWallHit) {
      showToast("请靠近一段墙体放置栏杆。", "error");
      return;
    }
    pushHistorySnapshot();
    const newRailing = {
      id: createId("railing"),
      wallId: railingWallHit.wall.id,
      t: railingWallHit.t,
      width: 2,
      height: 1.1,
      sill: 0
    };
    newRailing.t = clampWindowT(railingWallHit.wall, newRailing, currentPixelsPerMeter());
    state.activeScene.railings.push(newRailing);
    const railingScope = currentLightScope();
    setSelection("railing", newRailing.id);
    refreshStudio("architecture");
    requestSceneRefresh(railingScope);
    markDocumentDirty();
    return;
  }
  if (state.activeTool === "label") {
    createSceneItem("planlabel", pointerPlanPoint);
    return;
  }
  const downItemHandle: any = hitTestItemHandle(pointerPlanPoint);
  if (downItemHandle) {
    beginExportRender();
    const originalItemSnapshot = {
      ...downItemHandle.item
    };
    state.pointerInteraction =
      downItemHandle.type === "resize-item"
        ? {
            type: "resize-item",
            pointerId: canvasPointerEvent.pointerId,
            originalItem: originalItemSnapshot,
            handle: {
              x: downItemHandle.corner.x,
              y: downItemHandle.corner.y
            },
            anchor: {
              ...downItemHandle.corner.opposite
            },
            before: cloneSceneForHistory(),
            moved: false
          }
        : {
            type: "rotate-item",
            pointerId: canvasPointerEvent.pointerId,
            originalItem: originalItemSnapshot,
            center: {
              x: originalItemSnapshot.x,
              y: originalItemSnapshot.y
            },
            startPointer: {
              ...pointerPlanPoint
            },
            before: cloneSceneForHistory(),
            moved: false
          };
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
    return;
  }
  const dragScope = currentLightScope();
  const hitEntity = hitTestEntityAt(pointerPlanPoint);
  if (!hitEntity) {
    beginExportRender();
    if (!canvasPointerEvent.shiftKey) {
      clearSelection();
    }
    state.pointerInteraction = {
      type: "marquee",
      pointerId: canvasPointerEvent.pointerId,
      start: pointerPlanPoint,
      current: pointerPlanPoint,
      additive: canvasPointerEvent.shiftKey,
      moved: false
    };
    renderInspector();
    renderPlanView();
    syncMetricsCanvas();
    if (!canvasPointerEvent.shiftKey) {
      requestSceneRefresh(dragScope);
    }
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
    return;
  }
  beginExportRender();
  const historySnapshot = hitEntity.kind === "item" ? cloneSceneForHistory() : null;
  const isMultiItemDrag =
    hitEntity.kind === "item" && state.multiSelection.length > 0 && isSelected("item", hitEntity.id);
  let draggedItems: any = [];
  let didCopyItems = false;
  if (hitEntity.kind === "item") {
    if (isMultiItemDrag) {
      const multiSelectedItemIds = new Set(
        state.multiSelection
          .filter((filteredSelection: any) => filteredSelection.kind === "item")
          .map((mappedSelection: any) => mappedSelection.id)
      );
      draggedItems = state.activeScene.items.filter((selectedIdItem: any) =>
        multiSelectedItemIds.has(selectedIdItem.id)
      );
    } else {
      setSelection("item", hitEntity.id);
      const hitSceneItem = state.activeScene.items.find(
        (hitItemRecord: any) => hitItemRecord.id === hitEntity.id
      );
      if (hitSceneItem) {
        draggedItems = [hitSceneItem];
      }
    }
    if (canvasPointerEvent.altKey && draggedItems.length) {
      const clonedItems = draggedItems.map((draggedItem: any) => ({
        ...structuredClone(draggedItem),
        id: createId("item")
      }));
      normalizeLayerNames(clonedItems);
      state.activeScene.items.push(...clonedItems);
      draggedItems = clonedItems;
      if (clonedItems.length === 1) {
        setSelection("item", clonedItems[0].id);
      } else {
        state.primarySelection = null;
        state.multiSelection = clonedItems.map((clonedSelectionItem: any) => ({
          kind: "item",
          id: clonedSelectionItem.id
        }));
      }
      didCopyItems = true;
    }
  } else {
    setSelection(hitEntity.kind, hitEntity.id);
  }
  renderInspector();
  renderPlanView();
  requestSceneRefresh(dragScope);
  const previewScope = currentSelectionScope();
  if (hitEntity.kind === "item") {
    state.pointerInteraction = {
      type: "move-items",
      pointerId: canvasPointerEvent.pointerId,
      start: pointerPlanPoint,
      originals: draggedItems.map((draggedOriginal: any) => ({
        id: draggedOriginal.id,
        x: draggedOriginal.x,
        y: draggedOriginal.y
      })),
      before: historySnapshot,
      copied: didCopyItems,
      previewScope: previewScope,
      moved: false
    };
  } else if (["window", "door", "railing"].includes(hitEntity.kind)) {
    state.pointerInteraction = {
      type: "move-opening",
      pointerId: canvasPointerEvent.pointerId,
      start: pointerPlanPoint,
      before: cloneSceneForHistory(),
      previewScope: "architecture",
      moved: false
    };
  }
  if (state.pointerInteraction) {
    capturePointer(planCanvasElement, canvasPointerEvent.pointerId);
  } else {
    endExportRender();
  }
}
function onPlanCanvasPointerMove(moveEvent: any) {
  const moveScreenPoint = canvasPointFromEvent(moveEvent);
  const movePlanPoint = screenToPlan(moveScreenPoint);
  if (state.pointerInteraction?.pointerId === moveEvent.pointerId) {
    if (state.pointerInteraction.type === "draw-flooropening") {
      state.pointerInteraction.current = moveEvent.shiftKey
        ? (() => {
            const pointerDeltaX = movePlanPoint.x - state.pointerInteraction.start.x;
            const pointerDeltaY = movePlanPoint.y - state.pointerInteraction.start.y;
            const axisDelta = Math.max(Math.abs(pointerDeltaX), Math.abs(pointerDeltaY));
            return {
              x: state.pointerInteraction.start.x + Math.sign(pointerDeltaX || 1) * axisDelta,
              y: state.pointerInteraction.start.y + Math.sign(pointerDeltaY || 1) * axisDelta
            };
          })()
        : movePlanPoint;
      renderPlanView();
      return;
    }
    if (state.pointerInteraction.type === "marquee") {
      state.pointerInteraction.current = movePlanPoint;
      state.pointerInteraction.moved =
        distance(state.pointerInteraction.start, movePlanPoint) * state.viewTransform.zoom >= 4;
      if (blitMetricsCanvas()) {
        drawMarqueeOverlay();
      } else {
        renderPlanView();
      }
      return;
    }
    if (state.pointerInteraction.type === "pan") {
      const rotatedScreenPoint = rotateScreenPoint(moveScreenPoint);
      state.viewTransform.offsetX =
        state.pointerInteraction.offsetX + rotatedScreenPoint.x - state.pointerInteraction.screen.x;
      state.viewTransform.offsetY =
        state.pointerInteraction.offsetY + rotatedScreenPoint.y - state.pointerInteraction.screen.y;
      const panDeltaX = moveScreenPoint.x - state.pointerInteraction.visibleScreen.x;
      const panDeltaY = moveScreenPoint.y - state.pointerInteraction.visibleScreen.y;
      if (
        !blitMetricsCanvas({
          offsetX: panDeltaX,
          offsetY: panDeltaY
        })
      ) {
        renderPlanView();
      }
      return;
    }
    if (state.pointerInteraction.type === "move-items") {
      if (
        !state.pointerInteraction.moved &&
        distance(movePlanPoint, state.pointerInteraction.start) * state.viewTransform.zoom < 3
      ) {
        return;
      }
      const gridStep = currentPixelsPerMeter() * 0.05;
      const shouldSnapToGrid = isSnapEnabled() && state.activeScene.settings.snapGrid !== false;
      let moveDeltaX = movePlanPoint.x - state.pointerInteraction.start.x;
      let moveDeltaY = movePlanPoint.y - state.pointerInteraction.start.y;
      if (moveEvent.shiftKey) {
        if (Math.abs(moveDeltaX) >= Math.abs(moveDeltaY)) {
          moveDeltaY = 0;
        } else {
          moveDeltaX = 0;
        }
      }
      const itemsById = new Map<any, any>(
        state.activeScene.items.map((indexedItem: any) => [indexedItem.id, indexedItem])
      );
      for (const originalItem of state.pointerInteraction.originals) {
        const draggedLiveItem = itemsById.get(originalItem.id);
        if (draggedLiveItem) {
          draggedLiveItem.x = shouldSnapToGrid
            ? Math.round((originalItem.x + moveDeltaX) / gridStep) * gridStep
            : originalItem.x + moveDeltaX;
          draggedLiveItem.y = shouldSnapToGrid
            ? Math.round((originalItem.y + moveDeltaY) / gridStep) * gridStep
            : originalItem.y + moveDeltaY;
        }
      }
      state.pointerInteraction.moved = state.pointerInteraction.originals.some((original: any) => {
        const comparedLiveItem = itemsById.get(original.id);
        return (
          comparedLiveItem &&
          (Math.abs(comparedLiveItem.x - original.x) > 0.000001 ||
            Math.abs(comparedLiveItem.y - original.y) > 0.000001)
        );
      });
      renderPlanView();
      return;
    }
    if (state.pointerInteraction.type === "resize-item") {
      if (
        !state.pointerInteraction.moved &&
        distance(movePlanPoint, state.pointerInteraction.handle) * state.viewTransform.zoom < 3
      ) {
        return;
      }
      const resizedSelectedItem = findSelectedEntity();
      if (!resizedSelectedItem) {
        return;
      }
      // 平躺的立柱按平面足迹（宽 × 长）缩放，因此先取带足迹的副本参与缩放，
      const resizeSourceItem = itemWithPlanFootprint(state.pointerInteraction.originalItem);
      const originalHeight = Math.max(finite(resizeSourceItem.height, 0.05), 0.001);
      const minFootprint = itemMinimumFootprint(resizeSourceItem.type);
      const resizeConstraints = moveEvent.shiftKey
        ? {
            minimum: Math.max(
              minFootprint / Math.max(resizeSourceItem.width, minFootprint),
              minFootprint / Math.max(resizeSourceItem.depth, minFootprint),
              itemMinimumHeight(resizeSourceItem.type) / originalHeight
            ),
            maximum: Math.min(
              8 / Math.max(resizeSourceItem.width, minFootprint),
              8 / Math.max(resizeSourceItem.depth, minFootprint),
              6 / originalHeight
            )
          }
        : undefined;
      const resizedItem = resizeRotatedItemFromCorner(
        resizeSourceItem,
        state.pointerInteraction.handle,
        state.pointerInteraction.anchor,
        movePlanPoint,
        currentPixelsPerMeter() || 1,
        moveEvent.shiftKey,
        {
          ...resizeConstraints,
          minimumDimension: minFootprint
        }
      );
      Object.assign(
        resizedSelectedItem,
        itemFromPlanFootprintResize(state.pointerInteraction.originalItem, resizedItem)
      );
      if (
        resizedSelectedItem.type === "curtain" &&
        normalizeCurtainTrack(resizedSelectedItem).curtainTrack !== "straight"
      ) {
        const resizeOriginalItem = state.pointerInteraction.originalItem;
        const dragCurtainTrack = normalizeCurtainTrack(resizeOriginalItem);
        const curtainScaleRatio =
          Math.max(0.2, resizedSelectedItem.depth - 0.18) /
          Math.max(0.2, resizeOriginalItem.depth - 0.18);
        Object.assign(
          resizedSelectedItem,
          normalizeCurtainTrack({
            ...resizedSelectedItem,
            curtainLeftLength: dragCurtainTrack.curtainLeftLength * curtainScaleRatio,
            curtainRightLength: dragCurtainTrack.curtainRightLength * curtainScaleRatio
          })
        );
        resizedSelectedItem.depth = curtainFootprintDepth(resizedSelectedItem);
      }
      state.pointerInteraction.moved =
        Math.abs(resizedSelectedItem.x - state.pointerInteraction.originalItem.x) > 0.000001 ||
        Math.abs(resizedSelectedItem.y - state.pointerInteraction.originalItem.y) > 0.000001 ||
        Math.abs(resizedSelectedItem.width - state.pointerInteraction.originalItem.width) > 0.000001 ||
        Math.abs(resizedSelectedItem.depth - state.pointerInteraction.originalItem.depth) > 0.000001 ||
        Math.abs(resizedSelectedItem.height - state.pointerInteraction.originalItem.height) > 0.000001;
      renderPlanView();
      return;
    }
    if (state.pointerInteraction.type === "rotate-item") {
      if (
        !state.pointerInteraction.moved &&
        distance(movePlanPoint, state.pointerInteraction.startPointer) * state.viewTransform.zoom < 3
      ) {
        return;
      }
      const rotatedItem = findSelectedEntity();
      if (!rotatedItem) {
        return;
      }
      rotatedItem.rotation = itemRotationFromPointers(
        state.pointerInteraction.originalItem.rotation,
        state.pointerInteraction.center,
        state.pointerInteraction.startPointer,
        movePlanPoint,
        moveEvent.shiftKey ? 15 : 0
      );
      state.pointerInteraction.moved =
        Math.abs(rotatedItem.rotation - state.pointerInteraction.originalItem.rotation) > 0.000001;
      renderPlanView();
      return;
    }
    if (state.pointerInteraction.type === "move-opening") {
      if (
        !state.pointerInteraction.moved &&
        distance(movePlanPoint, state.pointerInteraction.start) * state.viewTransform.zoom < 3
      ) {
        return;
      }
      const openingEntity = findSelectedEntity();
      const openingWall = state.activeScene.walls.find(
        (openingWallRecord: any) => openingWallRecord.id === openingEntity?.wallId
      );
      if (!openingEntity || !openingWall) {
        return;
      }
      openingEntity.t = clampWindowT(
        openingWall,
        {
          ...openingEntity,
          t: projectPointToSegment(movePlanPoint, openingWall.start, openingWall.end).t
        },
        currentPixelsPerMeter()
      );
      const originalOpening = state.pointerInteraction.before?.[state.primarySelection?.kind + "s"]?.find?.(
        (openingSnapshot: any) => openingSnapshot.id === openingEntity.id
      );
      state.pointerInteraction.moved =
        !originalOpening || Math.abs(openingEntity.t - originalOpening.t) > 0.000001;
      renderPlanView();
      return;
    }
  }
  beginPointerScale(moveEvent);
  if (state.floorAlignState || ["scale", "wall", "window", "door", "railing"].includes(state.activeTool)) {
    renderPlanView();
  }
}
/**
 * 相机手势的合并帧回调：把一帧内的多次指针移动合成一次处理。先清帧句柄再取状态，这样回调过程中再次调度不会被覆盖 ——
 */
function onCameraGestureFrame() {
  state.cameraGestureFrame = 0;
  const gestureState = state.cameraGestureState;
  state.cameraGestureState = null;
  if (gestureState) {
    onPlanCanvasPointerMove(gestureState);
  }
}
/**
 * 记录相机手势的最新坐标并安排下一帧处理（节流入口）。只保存最新位置，帧回调取用时天然丢掉中间态 —— 相机跟随不需要
 */
function updateCameraGestureState(moveTrackingEvent: any) {
  state.cameraGestureState = {
    clientX: moveTrackingEvent.clientX,
    clientY: moveTrackingEvent.clientY,
    pointerId: moveTrackingEvent.pointerId,
    shiftKey: moveTrackingEvent.shiftKey
  };
  state.cameraGestureFrame ||= requestAnimationFrame(onCameraGestureFrame);
}
function endCameraGesture(pointerId: any) {
  if (!!state.cameraGestureState && state.cameraGestureState.pointerId === pointerId) {
    if (state.cameraGestureFrame) {
      cancelAnimationFrame(state.cameraGestureFrame);
    }
    onCameraGestureFrame();
  }
}
/**
 * 滚轮缩放的沉降帧回调：把累积的目标缩放一次性应用到视图。
 * @returns {void}
 */
function onCameraSettleFrame() {
  state.cameraSettleFrame = 0;
  const targetZoom = state.cameraTargetZoom;
  const settleTargetPoint = state.cameraTargetPoint;
  state.cameraTargetZoom = 1;
  state.cameraTargetPoint = null;
  if (settleTargetPoint && Math.abs(targetZoom - 1) > 1e-8) {
    zoomViewAt(targetZoom, settleTargetPoint);
  }
}
function onPlanCanvasWheel(wheelEvent: any) {
  state.cameraTargetZoom *= Math.exp(-wheelEvent.deltaY * 0.0012);
  state.cameraTargetPoint = canvasPointFromEvent(wheelEvent);
  beginExportRender();
  state.cameraSettleFrame ||= requestAnimationFrame(onCameraSettleFrame);
  window.clearTimeout(state.cameraSettleTimer);
  state.cameraSettleTimer = window.setTimeout(() => {
    state.cameraSettleTimer = null;
    if (state.cameraSettleFrame) {
      cancelAnimationFrame(state.cameraSettleFrame);
      onCameraSettleFrame();
    }
    endExportRender();
  }, 90);
}
function onPlanCanvasPointerUp(releaseEvent: any) {
  if (!state.pointerInteraction || state.pointerInteraction.pointerId !== releaseEvent.pointerId) {
    return;
  }
  if (state.pointerInteraction.type === "draw-flooropening") {
    const { start: marqueeStartPoint, current: currentPoint } = state.pointerInteraction;
    releasePointer(planCanvasElement, releaseEvent.pointerId);
    state.pointerInteraction = null;
    endExportRender();
    const marqueeWidth = Math.abs(currentPoint.x - marqueeStartPoint.x) / currentPixelsPerMeter();
    const marqueeDepth = Math.abs(currentPoint.y - marqueeStartPoint.y) / currentPixelsPerMeter();
    if (releaseEvent.type !== "pointercancel" && marqueeWidth >= 0.1 && marqueeDepth >= 0.1) {
      createSceneItem(
        "flooropening",
        {
          x: (marqueeStartPoint.x + currentPoint.x) / 2,
          y: (marqueeStartPoint.y + currentPoint.y) / 2
        },
        {
          width: Math.min(20, marqueeWidth),
          depth: Math.min(20, marqueeDepth)
        }
      );
    } else {
      renderPlanView();
    }
    return;
  }
  if (state.pointerInteraction.type === "marquee") {
    const marqueeScope = currentLightScope();
    const additiveEntities = state.pointerInteraction.additive
      ? [...(state.primarySelection ? [state.primarySelection] : []), ...state.multiSelection]
      : [];
    const marqueeEntities = state.pointerInteraction.moved
      ? collectEntitiesInMarquee(state.pointerInteraction.start, state.pointerInteraction.current)
      : [];
    const selectedEntities = [
      ...new Map(
        [...additiveEntities, ...marqueeEntities].map(entity => [
          entity.kind + ":" + entity.id,
          entity
        ])
      ).values()
    ];
    if (selectedEntities.length === 1) {
      setSelection(selectedEntities[0].kind, selectedEntities[0].id);
    } else {
      state.primarySelection = null;
      state.multiSelection = selectedEntities;
    }
    releasePointer(planCanvasElement, releaseEvent.pointerId);
    state.pointerInteraction = null;
    renderInspector();
    renderPlanView();
    requestSceneRefresh(marqueeScope);
    endExportRender();
    return;
  }
  const interaction = state.pointerInteraction;
  const didChangeScene = interaction.moved || interaction.copied;
  if (didChangeScene) {
    pushHistoryEntry(state.pointerInteraction.before);
    markDocumentDirty();
  }
  if (["move-items", "resize-item", "rotate-item", "move-opening"].includes(interaction.type)) {
    renderInspector();
  }
  if (didChangeScene && interaction.type === "move-opening") {
    applySceneRefresh({
      scope: "architecture"
    });
  } else if (
    didChangeScene &&
    ["move-items", "resize-item", "rotate-item"].includes(interaction.type)
  ) {
    const previewedSelectedItem = findSelectedEntity();
    applySceneRefresh({
      scope:
        interaction.previewScope ||
        (previewedSelectedItem ? scopeForItem(previewedSelectedItem) : currentSelectionScope())
    });
  }
  if (state.pointerInteraction.type === "pan") {
    planCanvasElement.classList.remove("panning");
  }
  releasePointer(planCanvasElement, releaseEvent.pointerId);
  state.pointerInteraction = null;
  if (interaction.type === "pan") {
    renderPlanView();
  }
  endExportRender();
}
/**
 * 指针结束的统一入口：先结束相机手势，再走抬起的收尾逻辑。
 * @param {PointerEvent} endEvent 指针事件（pointerup / pointercancel）。
 */
function onPlanCanvasPointerEnd(endEvent: any) {
  endCameraGesture(endEvent.pointerId);
  onPlanCanvasPointerUp(endEvent);
}
function applyInspectorChanges(entityKind: any) {
  const editingEntity = findSelectedEntity();
  if (!editingEntity || state.primarySelection?.kind !== entityKind) {
    return;
  }
  const inspectorRefreshScope =
    entityKind === "item"
      ? scopeForItem(editingEntity)
      : ["door", "window", "railing"].includes(entityKind)
        ? "architecture"
        : "all";
  pushHistorySnapshot();
  if (entityKind === "wall") {
    editingEntity.height = clamp(
      finite(selectElement("#wall-height").value, editingEntity.height),
      0.01,
      6
    );
    editingEntity.thickness = clamp(
      finite(selectElement("#wall-thickness").value, editingEntity.thickness),
      0.01,
      3
    );
    editingEntity.opacity =
      selectElement("#wall-opacity-mode").value === "custom"
        ? clamp(
            finite(selectElement("#wall-opacity").value, state.activeScene.settings.wallOpacity * 100),
            0,
            100
          ) / 100
        : null;
    editingEntity.allowOpenEnd = selectElement("#wall-open-end-mode").value === "allowed";
    state.activeScene.settings.wallHeight = editingEntity.height;
    state.activeScene.settings.wallThickness = editingEntity.thickness;
  } else if (entityKind === "window") {
    editingEntity.width = clamp(
      finite(selectElement("#window-width").value, editingEntity.width),
      0.3,
      20
    );
    editingEntity.height = clamp(
      finite(selectElement("#window-height").value, editingEntity.height),
      0.3,
      20
    );
    editingEntity.sill = clamp(
      finite(selectElement("#window-sill").value, editingEntity.sill),
      0,
      20
    );
    editingEntity.hasDivider = selectElement("#window-divider").value !== "without";
    const windowWall = state.activeScene.walls.find(
      (windowWallRecord: any) => windowWallRecord.id === editingEntity.wallId
    );
    if (windowWall) {
      editingEntity.t = clampWindowT(windowWall, editingEntity, currentPixelsPerMeter());
    }
  } else if (entityKind === "door") {
    editingEntity.doorType = Object.hasOwn(DOOR_TYPE_DIMENSIONS, selectElement("#door-type").value)
      ? selectElement("#door-type").value
      : "solid";
    applyDoorMaterialStyle(
      editingEntity,
      editingEntity.doorType,
      selectElement("#door-material").value
    );
    editingEntity.width = clamp(
      finite(selectElement("#door-width").value, editingEntity.width),
      0.55,
      20
    );
    editingEntity.height = clamp(
      finite(selectElement("#door-height").value, editingEntity.height),
      1.8,
      20
    );
    const doorWall = state.activeScene.walls.find(
      (doorWallRecord: any) => doorWallRecord.id === editingEntity.wallId
    );
    if (doorWall) {
      editingEntity.t = clampWindowT(doorWall, editingEntity, currentPixelsPerMeter());
    }
  } else if (entityKind === "railing") {
    editingEntity.width = clamp(
      finite(selectElement("#railing-width").value, editingEntity.width),
      0.3,
      20
    );
    editingEntity.height = clamp(
      finite(selectElement("#railing-height").value, editingEntity.height),
      0.5,
      3
    );
    const inspectorRailingWall = state.activeScene.walls.find(
      (railingWallRecord: any) => railingWallRecord.id === editingEntity.wallId
    );
    if (inspectorRailingWall) {
      editingEntity.t = clampWindowT(inspectorRailingWall, editingEntity, currentPixelsPerMeter());
    }
  } else {
    const inspectorPixelsPerMeter = currentPixelsPerMeter() || 1;
    editingEntity.x =
      finite(selectElement("#item-x").value, editingEntity.x / inspectorPixelsPerMeter) *
      inspectorPixelsPerMeter;
    editingEntity.y =
      finite(selectElement("#item-y").value, editingEntity.y / inspectorPixelsPerMeter) *
      inspectorPixelsPerMeter;
    editingEntity.width = clamp(
      finite(selectElement("#item-width").value, editingEntity.width),
      itemMinimumFootprint(editingEntity.type),
      8
    );
    editingEntity.height = clamp(
      finite(selectElement("#item-height").value, editingEntity.height),
      itemMinimumHeight(editingEntity.type),
      6
    );
    editingEntity.depth = clamp(
      finite(selectElement("#item-depth").value, editingEntity.depth),
      itemMinimumFootprint(editingEntity.type),
      8
    );
    editingEntity.elevation = clamp(
      finite(selectElement("#item-elevation").value, editingEntity.elevation || 0),
      0,
      6
    );
    editingEntity.rotation =
      editingEntity.type === "striplight"
        ? normalizeFullRotation(selectElement("#item-rotation").value, editingEntity.rotation)
        : finite(selectElement("#item-rotation").value, editingEntity.rotation);
    if (editingEntity.type === "planlabel") {
      editingEntity.title = normalizeLabelText(selectElement("#label-title").value, "家庭总览", 24);
      editingEntity.subtitle = normalizeLabelText(
        selectElement("#label-subtitle").value,
        "HOME PLAN",
        36
      );
      editingEntity.titleSpacing = clamp(
        finite(selectElement("#label-title-spacing").value, 105) / 100,
        0,
        1.8
      );
      editingEntity.subtitleSpacing = clamp(
        finite(selectElement("#label-subtitle-spacing").value, 8) / 100,
        0,
        0.6
      );
      editingEntity.lineLength = clamp(
        finite(selectElement("#label-line-length").value, 86) / 100,
        0.3,
        1
      );
      editingEntity.height = 0.01;
      editingEntity.elevation = 0;
    }
    if (editingEntity.type === "curtain") {
      editingEntity.curtainPosition = ["left", "right", "split"].includes(
        selectElement("#curtain-position").value
      )
        ? selectElement("#curtain-position").value
        : "split";
      const editedCurtainTrack = normalizeCurtainTrack(editingEntity).curtainTrack;
      Object.assign(
        editingEntity,
        normalizeCurtainTrack({
          // 形态先于轨道：卷帘会把下面的 curtainTrack 收敛成直线型（归一化里处理）。
          curtainForm: selectElement("#curtain-form").value,
          curtainTrack: selectElement("#curtain-track").value,
          curtainCorner: selectElement("#curtain-corner").value,
          curtainLeftLength: selectElement("#curtain-left-length").value,
          curtainRightLength: selectElement("#curtain-right-length").value,
          curtainMeet: selectElement("#curtain-meet").value,
          curtainPreview: selectElement("#curtain-preview").value,
          curtainFabric: selectElement("#curtain-fabric").value
        })
      );
      if (editedCurtainTrack !== "straight" && editingEntity.curtainTrack === "straight") {
        editingEntity.depth = 0.18;
      }
      editingEntity.depth = curtainFootprintDepth(editingEntity);
    }
    if (ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(editingEntity.type)) {
      editingEntity.roundTableTurntable = selectElement("#round-table-turntable").value === "with";
    }
    if (editingEntity.type === "fridge") {
      // 只有 double 落键，其余（含未选、脏值）一律归一为 standard —— 与回填口径一致。
      editingEntity.fridgeStyle =
        (document.querySelector('input[name="fridge-style"]:checked') as any)?.value === "double"
          ? "double"
          : "standard";
    }
    if (STAIR_DIRECTION_ITEM_TYPES.has(editingEntity.type)) {
      editingEntity.stairDirection = ["left", "right"].includes(
        selectElement("#stair-direction").value
      )
        ? selectElement("#stair-direction").value
        : "right";
    }
    if (editingEntity.type === "tv") {
      const previousMountStyle = TV_MOUNT_STYLES.has(editingEntity.tvMountStyle)
        ? editingEntity.tvMountStyle
        : "standard";
      const nextMountStyle = TV_MOUNT_STYLES.has(selectElement("#tv-mount-style").value)
        ? selectElement("#tv-mount-style").value
        : "standard";
      if (previousMountStyle !== nextMountStyle && nextMountStyle === "mobile") {
        editingEntity.height = Math.max(editingEntity.height, MOBILE_TV_MOUNT_DIMENSIONS.height);
        editingEntity.elevation = 0;
      } else if (
        previousMountStyle === "mobile" &&
        nextMountStyle !== "mobile" &&
        Math.abs(editingEntity.height - MOBILE_TV_MOUNT_DIMENSIONS.height) < 0.001
      ) {
        editingEntity.height = ITEM_TYPE_DEFINITIONS.tv.height;
      }
      // 进深与离地高度跟着挂装方式走（壁挂 60mm / 0.70m，座装 180mm / 落地，移动 550mm / 落地）：
      snapTelevisionMountDimensions(editingEntity, nextMountStyle);
      editingEntity.tvMountStyle = nextMountStyle;
    }
    if (editingEntity.type === "mural") {
      editingEntity.muralStyle = normalizeMuralArtStyle(selectElement("#mural-style").value);
    }
    if (editingEntity.type === "featurewall") {
      editingEntity.wallStyle = normalizeFeatureWallStyle(
        selectElement("#feature-wall-style").value
      );
    }
    if (isMaterialStyleCapable(editingEntity.type)) {
      const nextMaterialStyle = normalizeMaterialStyle(
        editingEntity.type,
        selectElement("#material-style").value
      );
      // auto 不落键：草稿 / 快照里只有真正选过风格才留下 materialStyle，
      if (nextMaterialStyle === MATERIAL_STYLE_AUTO) {
        delete editingEntity.materialStyle;
      } else {
        editingEntity.materialStyle = nextMaterialStyle;
      }
    }
    if (editingEntity.type === "pillar") {
      editingEntity.pillarShape = normalizePillarShape(selectElement("#pillar-shape").value);
      editingEntity.pillarAxis = normalizePillarAxis(selectElement("#pillar-axis").value);
    }
    if (editingEntity.type === "striplight") {
      editingEntity.stripAxis = normalizeStripAxis(selectElement("#strip-axis").value);
    }
    if (LIGHT_ITEM_TYPES.has(editingEntity.type)) {
      const defaultLightSettings =
        (DEFAULT_LIGHT_SETTINGS as any)[editingEntity.type] || DEFAULT_LIGHT_SETTINGS.downlight;
      editingEntity.verticalRotation =
        editingEntity.type === "striplight"
          ? normalizeFullRotation(
              selectElement("#item-vertical-rotation").value,
              editingEntity.verticalRotation || 0
            )
          : clamp(
              finite(
                selectElement("#item-vertical-rotation").value,
                editingEntity.verticalRotation || 0
              ),
              -90,
              90
            );
      if (editingEntity.type === "striplight") {
        editingEntity.stripRollRotation = normalizeFullRotation(
          itemStripRollInput.value,
          editingEntity.stripRollRotation || 0
        );
        editingEntity.lightSourceVisible = itemLightSourceVisibleInput.checked;
      }
      editingEntity.lightGroupId = state.activeScene.lightGroups.some(
        (ownerLightGroup: any) => ownerLightGroup.id === selectElement("#light-group").value
      )
        ? selectElement("#light-group").value
        : ensureActiveLightGroup().id;
      editingEntity.lightTemperature = clamp(
        finite(selectElement("#light-temperature").value, defaultLightSettings.temperature),
        2200,
        6500
      );
      editingEntity.lightBrightness = clamp(
        finite(selectElement("#light-brightness").value, defaultLightSettings.brightness),
        0,
        100
      );
      editingEntity.lightRange = clamp(
        finite(selectElement("#light-range").value, defaultLightSettings.range),
        0.5,
        10
      );
      editingEntity.lightAngle = clamp(
        finite(selectElement("#light-angle").value, defaultLightSettings.angle),
        15,
        maxLightAngleForType(editingEntity.type)
      );
      editingEntity.height = (ITEM_TYPE_DEFINITIONS as any)[editingEntity.type].height;
    } else if (["camera", "presence"].includes(editingEntity.type)) {
      editingEntity.verticalRotation = clamp(
        finite(selectElement("#item-vertical-rotation").value, editingEntity.verticalRotation || 0),
        -180,
        180
      );
    }
  }
  refreshStudio(inspectorRefreshScope);
  markDocumentDirty();
}
/**
 * 清空比例尺 / 画墙的临时状态（绘制结束或取消时调用）。
 * @returns {void}
 */
function resetScaleInteractionState() {
  state.scaleStartPoint = null;
  state.snapEndpointCandidate = null;
  state.scalePointCount = 0;
  finishWallButton.hidden = true;
}
/**
 * 结束连续画墙：清掉临时状态并重绘画布（工具栏「完成」按钮调用）。
 * @returns {void}
 */
function finishWallDrawing() {
  resetScaleInteractionState();
  renderPlanView();
}
async function initializeStudio() {
  if (!isStudioRoute) {
    setSaveState("地址无效", "error");
    return;
  }
  try {
    // 必须 await：initializeStudioStage 内部可能在等一次上下文重建重试，不等它就直接
    await initializeStudioStage();
    resizePlanCanvas();
    const pageSearchParams = new URLSearchParams(window.location.search);
    loadTiming("draft-requested");
    const studioRecord = await requestStudioApi(
      isStageViewerMode
        ? "/modules/interaction3d/scenes/" +
            encodeURIComponent(pageSearchParams.get("sceneId") || "") +
            "/current?projectId=" +
            encodeURIComponent(pageSearchParams.get("projectId") || "")
        : "/studio3d",
      {},
      // 舞台页的预热响应（stage-startup.js 已经发过同一个 URL）；非舞台页为 null，
      stageStartup?.response
    );
    projectNameElement.textContent = "户型图绘制";
    document.title = "户型图绘制";
    loadTiming("draft-fetched");
    await loadStudioRecord(studioRecord);
    loadTiming("draft-loaded");
    if (isStageViewerMode) {
      await new Promise(requestAnimationFrame);
      const { mountStage: mountStage } = await (stageStartup?.module ||
        import(/* @vite-ignore */ "/api/v1/modules/interaction3d/core/stage.js"));
      mountStage(createStageController());
      loadTiming("stage-mounted");
      return;
    }
    setSaveState("已自动保存", "saved");
    if (autoDiagramComponentId) {
      if (isAutoDiagramEmbed) {
        openExportDialog();
      } else {
        window.setTimeout(() => openExportDialog(), 180);
      }
    }
  } catch (studioLoadError: any) {
    if (isStageViewerMode) {
      window.parent.postMessage(
        {
          channel: "hb-i3d-v1",
          type: "error",
          message: studioLoadError.message || "无法载入3D户型。"
        },
        window.location.origin
      );
    }
    setSaveState("载入失败", "error");
    showToast(studioLoadError.message || "无法载入项目。", "error");
  }
}
toolButtons.forEach(button =>
  button.addEventListener("click", () => activateTool((button as any).dataset.tool))
);
addFloorButton.addEventListener("click", () => {
  addFloor();
});
alignFloorButton.addEventListener("click", startFloorAlignment);
previewFloorGapInput.addEventListener("change", commitPreviewFloorGap);
previewFloorUniformInput.addEventListener("change", commitUniformOverviewStack);
exportFloorGapInput.addEventListener("change", commitExportFloorGap);
for (const previewFloorButton of previewFloorButtons) {
  previewFloorButton.addEventListener("click", () =>
    setPreviewFloorMode((previewFloorButton as any).dataset.previewFloor)
  );
}
importPlanButton.addEventListener("click", () => planFileInput.click());
planFileInput.addEventListener("change", async () => {
  await uploadPlanImage(planFileInput.files?.[0]);
  planFileInput.value = "";
});
toggleBackgroundButton.addEventListener("click", () => {
  if (state.activeScene.background) {
    pushHistorySnapshot();
    state.activeScene.settings.backgroundVisible = !state.activeScene.settings.backgroundVisible;
    syncStudioUi();
    renderPlanView();
    markDocumentDirty();
  }
});
removePlanButton.addEventListener("click", () => {
  if (state.activeScene.background) {
    pushHistorySnapshot();
    state.activeScene.background = null;
    state.backgroundTexture = null;
    refreshStudio();
    fitViewToBounds();
    markDocumentDirty();
    showToast("底图引用已移除，现在可以在编辑器中删除这张图片。", "success");
  }
});
/**
 * @param {HTMLInputElement} input 触发编辑的墙高 / 墙厚 / 墙不透明度输入框。
 */
function beginWallSettingEdit(input: any) {
  if (state.activeWallSettingInput && state.activeWallSettingInput !== input) {
    commitWallSettingInput();
  }
  if (!state.activeWallSettingInput) {
    pushHistorySnapshot();
    state.activeWallSettingInput = input;
    beginExportRender();
  }
}
/**
 * @returns {void} 无返回值。
 */
function scheduleOverlayRedraw() {
  state.overlayRedrawFrame ||= requestAnimationFrame(() => {
    state.overlayRedrawFrame = 0;
    renderPlanView();
  });
}
/**
 * 结束全局墙参数编辑：回填输入框显示值、刷新检查器与整场景，并解除导出渲染挂起。
 * @returns {void} 无返回值。
 */
function commitWallSettingInput() {
  window.clearTimeout(state.wallSettingCommitTimer);
  state.wallSettingCommitTimer = null;
  if (state.activeWallSettingInput) {
    state.activeWallSettingInput = null;
    syncControlValue(globalWallHeightInput, state.activeScene.settings.wallHeight.toFixed(2));
    syncControlValue(globalWallThicknessInput, state.activeScene.settings.wallThickness.toFixed(2));
    syncControlValue(globalWallOpacityInput, Math.round(state.activeScene.settings.wallOpacity * 100));
    renderInspector();
    applySceneRefresh({
      scope: "all"
    });
    endExportRender();
  }
}
/**
 * 延迟提交全局墙参数编辑，用于合并 change / blur 触发的多次提交。
 * @param {number} [commitDelayMs=80] 延迟毫秒数，传 0 表示立刻提交。
 */
function scheduleWallSettingCommit(commitDelayMs = 80) {
  window.clearTimeout(state.wallSettingCommitTimer);
  state.wallSettingCommitTimer = window.setTimeout(commitWallSettingInput, commitDelayMs);
}
/**
 * @returns {void} 无返回值。
 */
function applyGlobalWallHeight() {
  const nextWallHeight = clamp(
    finite(globalWallHeightInput.value, state.activeScene.settings.wallHeight),
    0.01,
    6
  );
  if (
    !(Math.abs(nextWallHeight - state.activeScene.settings.wallHeight) < 1e-8) ||
    !state.activeScene.walls.every((heightWall: any) => Math.abs(heightWall.height - nextWallHeight) < 1e-8)
  ) {
    beginWallSettingEdit(globalWallHeightInput);
    state.activeScene.settings.wallHeight = nextWallHeight;
    for (const heightTargetWall of state.activeScene.walls) {
      heightTargetWall.height = nextWallHeight;
    }
    markDocumentDirty();
  }
}
/**
 * 把「全局墙厚」输入框的值写到场景设置与所有墙体，并同步平面视图重绘。
 * @returns {void} 无返回值。
 */
function applyGlobalWallThickness() {
  const nextWallThickness = clamp(
    finite(globalWallThicknessInput.value, state.activeScene.settings.wallThickness),
    0.01,
    3
  );
  if (
    !(Math.abs(nextWallThickness - state.activeScene.settings.wallThickness) < 1e-8) ||
    !state.activeScene.walls.every(
      (thicknessWall: any) => Math.abs(thicknessWall.thickness - nextWallThickness) < 1e-8
    )
  ) {
    beginWallSettingEdit(globalWallThicknessInput);
    state.activeScene.settings.wallThickness = nextWallThickness;
    for (const thicknessTargetWall of state.activeScene.walls) {
      thicknessTargetWall.thickness = nextWallThickness;
    }
    scheduleOverlayRedraw();
    markDocumentDirty();
  }
}
/**
 * 把「全局墙不透明度」输入框的百分比换算成 0-1 后写入场景设置。
 * @returns {void} 无返回值。
 */
function applyGlobalWallOpacity() {
  const nextWallOpacity =
    clamp(finite(globalWallOpacityInput.value, state.activeScene.settings.wallOpacity * 100), 0, 100) /
    100;
  if (!(Math.abs(nextWallOpacity - state.activeScene.settings.wallOpacity) < 1e-8)) {
    beginWallSettingEdit(globalWallOpacityInput);
    state.activeScene.settings.wallOpacity = nextWallOpacity;
    markDocumentDirty();
  }
}
for (const [wallSettingInput, wallSettingCommitHandler] of [
  [globalWallHeightInput, applyGlobalWallHeight],
  [globalWallThicknessInput, applyGlobalWallThickness],
  [globalWallOpacityInput, applyGlobalWallOpacity]
]) {
  wallSettingInput.addEventListener("input", wallSettingCommitHandler);
  wallSettingInput.addEventListener("change", () => {
    wallSettingCommitHandler();
    scheduleWallSettingCommit();
  });
  wallSettingInput.addEventListener("blur", () => scheduleWallSettingCommit(0));
}
toggleFloorEdgeButton.addEventListener("click", () => {
  pushHistorySnapshot();
  state.activeScene.settings.floorEdgeVisible = state.activeScene.settings.floorEdgeVisible === false;
  refreshStudio();
  markDocumentDirty();
});
function syncAssetTabVisibility() {
  for (const headingButton of assetHeadingCategoryButtons) {
    (headingButton as any).hidden = (headingButton as any).dataset.assetHeadingCategory !== state.activeAssetTab;
  }
  for (const itemTypeButton of itemTypeButtons) {
    const buttonItemType = (itemTypeButton as any).dataset.itemType;
    const isLightItemType = LIGHT_ITEM_TYPES.has(buttonItemType);
    const isApplianceItem = APPLIANCE_ITEM_TYPES.has(buttonItemType);
    const isVisibleForTab =
      state.activeAssetTab === "light"
        ? isLightItemType
        : state.activeAssetTab === "appliance"
          ? isApplianceItem
          : !isApplianceItem && !isLightItemType;
    (itemTypeButton as any).hidden = !isVisibleForTab;
  }
}
function activateAssetTab(tabName: any) {
  const assetTab = ["home", "appliance", "light"].includes(tabName) ? tabName : "home";
  const tabLightScope = currentLightScope();
  closeLightGroupContextMenu();
  state.activeAssetTab = assetTab;
  for (const assetTabButton of assetCategoryButtons) {
    const isActiveCategory = (assetTabButton as any).dataset.assetCategory === assetTab;
    assetTabButton.classList.toggle("active", isActiveCategory);
    assetTabButton.setAttribute("aria-pressed", String(isActiveCategory));
  }
  syncAssetTabVisibility();
  assetGridElement.hidden = assetTab === "light";
  lightAssetRowElement.hidden = assetTab !== "light";
  const tabSelectedItem = findSelectedEntity();
  const isSelectedLightItem =
    state.primarySelection?.kind === "item" &&
    tabSelectedItem &&
    LIGHT_ITEM_TYPES.has(tabSelectedItem.type);
  if (state.primarySelection && (assetTab === "light") != !!isSelectedLightItem) {
    clearSelection();
  }
  if (state.multiSelection.length) {
    clearSelection();
  }
  activateTool("select");
  renderLightGroupList();
  renderInspector();
  renderPlanView();
  if (tabLightScope !== currentLightScope()) {
    requestSceneRefresh(tabLightScope);
  }
}
for (const categoryButton of assetCategoryButtons) {
  categoryButton.addEventListener("click", () =>
    activateAssetTab((categoryButton as any).dataset.assetCategory)
  );
}
activateAssetTab("home");
addLightGroupButton.addEventListener("click", () => {
  pushHistorySnapshot();
  const existingLightGroupNames = new Set(
    state.activeScene.lightGroups.map((namedLightGroup: any) => namedLightGroup.name)
  );
  let newGroupSuffix = state.activeScene.lightGroups.length + 1;
  while (existingLightGroupNames.has("灯组 " + newGroupSuffix)) {
    newGroupSuffix += 1;
  }
  const newLightGroup = {
    id: createId("light-group"),
    name: "灯组 " + newGroupSuffix,
    enabled: true,
    areaId: null
  };
  state.activeScene.lightGroups.push(newLightGroup);
  state.activeLightGroupId = newLightGroup.id;
  renderLightGroupList();
  renderInspector();
  markDocumentDirty();
});
lightGroupsOffButton.addEventListener("click", () => setCategoryLayersEnabled(false));
addAreaButton.addEventListener("click", () => openAreaCreateDialog());
areaRenameFormElement.addEventListener("submit", (areaRenameSubmitEvent: any) => {
  areaRenameSubmitEvent.preventDefault();
  const submittedAreaName = normalizeAreaName(areaRenameInputElement.value);
  if (!submittedAreaName) {
    showToast("请输入区域名称。", "error");
    return;
  }
  if (state.areaRenameMode === "rename") {
    // 按对话框打开时记录的区域 ID 找回待重命名的区域；找不到说明已被删除。
    const renameTargetArea = (state.activeScene.areas || []).find(
      (areaLookupEntry: any) => areaLookupEntry.id === state.areaRenameId
    );
    if (!renameTargetArea) {
      closeAreaRenameDialog();
      return;
    }
    if (renameTargetArea.name === submittedAreaName) {
      closeAreaRenameDialog();
      return;
    }
    if (areaNameTaken(submittedAreaName, renameTargetArea.id)) {
      showToast("已存在同名区域。", "error");
      return;
    }
    pushHistorySnapshot();
    renameTargetArea.name = submittedAreaName;
    renderLightGroupList();
    markDocumentDirty();
  } else {
    if (areaNameTaken(submittedAreaName)) {
      showToast("已存在同名区域。", "error");
      return;
    }
    pushHistorySnapshot();
    const createdArea = {
      id: createId("area"),
      name: submittedAreaName
    };
    (state.activeScene.areas ||= []).push(createdArea);
    expandedAreaIds.add(createdArea.id);
    renderLightGroupList();
    markDocumentDirty();
  }
  closeAreaRenameDialog();
});
selectElement("#area-rename-close").addEventListener("click", closeAreaRenameDialog);
selectElement("#area-rename-cancel").addEventListener("click", closeAreaRenameDialog);
areaRenameDialogElement.addEventListener("cancel", () => {
  state.areaRenameMode = "create";
  state.areaRenameId = "";
});
for (const areaActionButton of areaContextMenuElement.querySelectorAll("[data-area-action]")) {
  areaActionButton.addEventListener("click", () => {
    // 按右键菜单记录的区域 ID 找回目标区域。
    const menuArea = (state.activeScene.areas || []).find(
      (areaLookupEntry: any) => areaLookupEntry.id === state.areaContextMenuId
    );
    const areaActionName = areaActionButton.dataset.areaAction;
    closeAreaContextMenu();
    if (menuArea) {
      if (areaActionName === "rename") {
        openAreaRenameDialog(menuArea);
      } else if (areaActionName === "delete") {
        deleteArea(menuArea);
      }
    }
  });
}
lightGroupAreaFormElement.addEventListener("submit", (lightGroupAreaSubmitEvent: any) => {
  lightGroupAreaSubmitEvent.preventDefault();
  // 按对话框记录找回待分配区域的灯组。
  const assignTargetGroup = (state.activeScene.lightGroups || []).find(
    (groupLookupEntry: any) => groupLookupEntry.id === state.areaAssignGroupId
  );
  if (assignTargetGroup) {
    const nextAreaId = lightGroupAreaSelectElement.value || null;
    if (
      nextAreaId === null ||
      (state.activeScene.areas || []).some((areaRef: any) => areaRef.id === nextAreaId)
    ) {
      if ((assignTargetGroup.areaId || null) !== nextAreaId) {
        pushHistorySnapshot();
        assignTargetGroup.areaId = nextAreaId;
        if (nextAreaId) {
          expandedAreaIds.add(nextAreaId);
        }
        renderLightGroupList();
        markDocumentDirty();
      }
    }
  }
  closeLightGroupAreaDialog();
});
selectElement("#light-group-area-close").addEventListener("click", closeLightGroupAreaDialog);
selectElement("#light-group-area-cancel").addEventListener("click", closeLightGroupAreaDialog);
lightGroupAreaDialogElement.addEventListener("cancel", () => {
  state.areaAssignGroupId = "";
});
selectElement("#light-group-area-create").addEventListener("click", createAreaFromAssignDialog);
lightGroupAreaNewNameElement.addEventListener("keydown", (areaNewNameKeyEvent: any) => {
  if (areaNewNameKeyEvent.key === "Enter") {
    areaNewNameKeyEvent.preventDefault();
    createAreaFromAssignDialog();
  }
});
for (const lightGroupActionButton of lightGroupContextMenuElement.querySelectorAll(
  "[data-light-group-action]"
)) {
  lightGroupActionButton.addEventListener("click", () => {
    const menuLightGroup = state.activeScene.lightGroups.find(
      (menuLightGroupCandidate: any) => menuLightGroupCandidate.id === state.lightGroupMenuTargetId
    );
    const lightGroupActionName = lightGroupActionButton.dataset.lightGroupAction;
    closeLightGroupContextMenu();
    if (menuLightGroup) {
      if (lightGroupActionName === "area") {
        openLightGroupAreaDialog(menuLightGroup);
      } else if (lightGroupActionName === "rename") {
        state.droppedLightGroupId = menuLightGroup.id;
        lightGroupRenameInputElement.value = menuLightGroup.name;
        lightGroupRenameDialogElement.showModal();
        requestAnimationFrame(() => lightGroupRenameInputElement.select());
      } else if (lightGroupActionName === "duplicate") {
        duplicateLightGroup(menuLightGroup);
      } else if (lightGroupActionName === "delete") {
        deleteLightGroup(menuLightGroup);
      }
    }
  });
}
for (const floorActionButton of floorContextMenuElement.querySelectorAll("[data-floor-action]")) {
  floorActionButton.addEventListener("click", () => {
    const menuFloorRecord = state.studioDocument.floors.find(
      (menuFloorCandidate: any) => menuFloorCandidate.id === state.floorMenuTargetId
    );
    const floorActionName = floorActionButton.dataset.floorAction;
    closeFloorContextMenu();
    if (menuFloorRecord) {
      if (floorActionName === "rename") {
        openFloorRenameDialog(menuFloorRecord);
      } else if (floorActionName === "delete") {
        requestFloorDelete(menuFloorRecord);
      }
    }
  });
}
document.addEventListener("pointerdown", documentPointerEvent => {
  if (
    !lightGroupContextMenuElement.hidden &&
    !lightGroupContextMenuElement.contains(documentPointerEvent.target)
  ) {
    closeLightGroupContextMenu();
  }
  if (
    !areaContextMenuElement.hidden &&
    !areaContextMenuElement.contains(documentPointerEvent.target)
  ) {
    closeAreaContextMenu();
  }
  if (
    !floorContextMenuElement.hidden &&
    !floorContextMenuElement.contains(documentPointerEvent.target)
  ) {
    closeFloorContextMenu();
  }
  if (!snapSettingsPanelElement.hidden && !(documentPointerEvent.target as any).closest(".snap-control")) {
    setSnapSettingsVisible(false);
  }
});
/**
 * 关闭楼层重命名对话框，并清掉记录的目标楼层 ID。
 * @returns {void}
 */
function closeFloorRenameDialog() {
  state.floorMenuTargetId = "";
  floorRenameDialogElement.close();
}
selectElement("#floor-rename-close").addEventListener("click", closeFloorRenameDialog);
selectElement("#floor-rename-cancel").addEventListener("click", closeFloorRenameDialog);
floorRenameDialogElement.addEventListener("cancel", () => {
  state.floorMenuTargetId = "";
});
floorRenameFormElement.addEventListener("submit", (floorRenameSubmitEvent: any) => {
  floorRenameSubmitEvent.preventDefault();
  const renameTargetFloor = state.studioDocument.floors.find(
    (renameFloorEntry: any) => renameFloorEntry.id === state.floorMenuTargetId
  );
  if (!renameTargetFloor) {
    closeFloorRenameDialog();
    return;
  }
  const renamedFloorName = uniqueFloorName(
    normalizeLabelText(floorRenameInputElement.value, renameTargetFloor.name, 24),
    renameTargetFloor.id
  );
  if (renamedFloorName !== renameTargetFloor.name) {
    renameTargetFloor.name = renamedFloorName;
    renderFloorList();
    populateExportGroupFiles();
    markDocumentDirty();
    showToast("已重命名为“" + renamedFloorName + "”。", "success");
  }
  closeFloorRenameDialog();
});
selectElement("#floor-delete-close").addEventListener("click", closeFloorDeleteDialog);
selectElement("#floor-delete-cancel").addEventListener("click", closeFloorDeleteDialog);
floorDeleteDialogElement.addEventListener("cancel", (floorDeleteCancelEvent: any) => {
  floorDeleteCancelEvent.preventDefault();
  closeFloorDeleteDialog();
});
floorDeleteFormElement.addEventListener("submit", (floorDeleteSubmitEvent: any) => {
  floorDeleteSubmitEvent.preventDefault();
  deleteFloor();
});
/**
 * 关闭灯组重命名对话框，并清掉记录的目标灯组 ID。
 * @returns {void}
 */
function closeLightGroupRenameDialog() {
  state.droppedLightGroupId = "";
  lightGroupRenameDialogElement.close();
}
selectElement("#light-group-rename-close").addEventListener("click", closeLightGroupRenameDialog);
selectElement("#light-group-rename-cancel").addEventListener("click", closeLightGroupRenameDialog);
lightGroupRenameDialogElement.addEventListener("cancel", () => {
  state.droppedLightGroupId = "";
});
lightGroupRenameFormElement.addEventListener("submit", (lightGroupRenameSubmitEvent: any) => {
  lightGroupRenameSubmitEvent.preventDefault();
  const renameTargetLightGroup = state.activeScene.lightGroups.find(
    (lightGroupLookupEntry: any) => lightGroupLookupEntry.id === state.droppedLightGroupId
  );
  if (!renameTargetLightGroup) {
    closeLightGroupRenameDialog();
    return;
  }
  const renamedLightGroupName = normalizeLabelText(
    lightGroupRenameInputElement.value,
    renameTargetLightGroup.name,
    24
  );
  if (renamedLightGroupName !== renameTargetLightGroup.name) {
    pushHistorySnapshot();
    renameTargetLightGroup.name = renamedLightGroupName;
    refreshStudio("none");
    markDocumentDirty();
  }
  closeLightGroupRenameDialog();
});
function closeLightPropertyDialog() {
  state.activeLightPropertyEdit = null;
  lightPropertyApplyDialogElement.close();
}
/**
 * @returns {Array<HTMLInputElement>} 勾选框数组（可能为空）。
 */
function collectLightTargetItems(lightTargetScopeElement = lightPropertyTargetListElement) {
  return [...lightTargetScopeElement.querySelectorAll("[data-light-target-item-id]")];
}
function syncLightTargetSelection() {
  const lightTargetItemElements = collectLightTargetItems();
  const checkedLightTargetCount = lightTargetItemElements.filter(
    lightTargetItemElement => lightTargetItemElement.checked
  ).length;
  lightPropertySelectionCountElement.textContent =
    checkedLightTargetCount + "/" + lightTargetItemElements.length + " 灯";
  lightPropertyToggleAllButton.disabled = !lightTargetItemElements.length;
  lightPropertyToggleAllButton.textContent =
    lightTargetItemElements.length && checkedLightTargetCount === lightTargetItemElements.length
      ? "取消全选"
      : "全选";
  for (const lightGroupSectionElement of lightPropertyTargetListElement.querySelectorAll(
    "[data-light-target-group-id]"
  )) {
    const lightGroupItemElements = collectLightTargetItems(lightGroupSectionElement);
    const lightGroupCheckedCount = lightGroupItemElements.filter(
      lightGroupItemElement => lightGroupItemElement.checked
    ).length;
    lightGroupSectionElement.querySelector("[data-light-target-group-count]").textContent =
      lightGroupCheckedCount + "/" + lightGroupItemElements.length + " 灯";
    lightGroupSectionElement.querySelector("[data-light-target-group-toggle]").textContent =
      lightGroupItemElements.length && lightGroupCheckedCount === lightGroupItemElements.length
        ? "取消全选"
        : "全选";
  }
}
function renderLightPropertyTargets(lightPropertyFieldKey: any) {
  lightPropertyTargetListElement.replaceChildren();
  let renderedLightCount = 0;
  for (const lightTargetGroup of state.activeScene.lightGroups) {
    const lightTargetGroupItems = state.activeScene.items.filter(
      (lightTargetGroupItem: any) =>
        LIGHT_ITEM_TYPES.has(lightTargetGroupItem.type) &&
        lightTargetGroupItem.lightGroupId === lightTargetGroup.id
    );
    if (!lightTargetGroupItems.length) {
      continue;
    }
    renderedLightCount += lightTargetGroupItems.length;
    const createdLightGroupSection = document.createElement("section");
    createdLightGroupSection.className = "light-property-target-group";
    createdLightGroupSection.dataset.lightTargetGroupId = lightTargetGroup.id;
    const lightGroupHeaderElement = document.createElement("header");
    const lightGroupNameElement = document.createElement("strong");
    lightGroupNameElement.textContent = lightTargetGroup.name;
    const lightGroupCountElement = document.createElement("span");
    lightGroupCountElement.dataset.lightTargetGroupCount = "";
    const lightGroupToggleButton = document.createElement("button");
    lightGroupToggleButton.type = "button";
    lightGroupToggleButton.dataset.lightTargetGroupToggle = "";
    lightGroupToggleButton.textContent = "取消全选";
    lightGroupHeaderElement.append(
      lightGroupNameElement,
      lightGroupCountElement,
      lightGroupToggleButton
    );
    const lightTargetGridElement = document.createElement("div");
    lightTargetGridElement.className = "light-property-target-grid";
    const lightCountsByItemType = new Map();
    for (const listedLightItem of lightTargetGroupItems) {
      lightCountsByItemType.set(
        listedLightItem.type,
        (lightCountsByItemType.get(listedLightItem.type) || 0) + 1
      );
    }
    const lightOrdinalsByItemType = new Map();
    for (const listedLightEntry of lightTargetGroupItems) {
      const listedLightDefinition =
        (ITEM_TYPE_DEFINITIONS as any)[listedLightEntry.type] || ITEM_TYPE_DEFINITIONS.downlight;
      // 同一类型内的第几盏灯，用于「筒灯 2」这样的显示名。
      const listedLightOrdinal = (lightOrdinalsByItemType.get(listedLightEntry.type) || 0) + 1;
      lightOrdinalsByItemType.set(listedLightEntry.type, listedLightOrdinal);
      const lightTargetLabelElement = document.createElement("label");
      lightTargetLabelElement.className = "light-property-target-item";
      const lightTargetCheckboxElement = document.createElement("input");
      lightTargetCheckboxElement.type = "checkbox";
      lightTargetCheckboxElement.checked = true;
      lightTargetCheckboxElement.dataset.lightTargetItemId = listedLightEntry.id;
      const lightTargetTextElement = document.createElement("span");
      const lightTargetNameElement = document.createElement("strong");
      lightTargetNameElement.textContent =
        lightCountsByItemType.get(listedLightEntry.type) > 1
          ? listedLightDefinition.name + " " + listedLightOrdinal
          : listedLightDefinition.name;
      const lightTargetValueElement = document.createElement("small");
      const sanitizedLightFieldValue = sanitizeLightFieldValue(
        lightPropertyFieldKey,
        listedLightEntry[lightPropertyFieldKey],
        listedLightEntry.type
      );
      lightTargetValueElement.textContent =
        (listedLightEntry.id === state.primarySelection?.id ? "当前灯 · " : "") +
        "当前 " +
        formatLightFieldValue(lightPropertyFieldKey, sanitizedLightFieldValue);
      lightTargetTextElement.append(lightTargetNameElement, lightTargetValueElement);
      lightTargetLabelElement.append(lightTargetCheckboxElement, lightTargetTextElement);
      lightTargetGridElement.append(lightTargetLabelElement);
    }
    createdLightGroupSection.append(lightGroupHeaderElement, lightTargetGridElement);
    lightPropertyTargetListElement.append(createdLightGroupSection);
  }
  if (!renderedLightCount) {
    const emptyLightTargetsElement = document.createElement("p");
    emptyLightTargetsElement.className = "light-property-target-empty";
    emptyLightTargetsElement.textContent = "当前没有可应用的灯具。";
    lightPropertyTargetListElement.append(emptyLightTargetsElement);
  }
  syncLightTargetSelection();
}
for (const lightPropertyApplyButton of lightPropertyApplyButtons) {
  lightPropertyApplyButton.addEventListener("click", () => {
    const lightPropertySelectedEntity = findSelectedEntity();
    const lightPropertyFieldName = (lightPropertyApplyButton as any).dataset.applyLightProperty;
    const lightPropertyFieldConfig = (LIGHT_FIELD_CONFIG as any)[lightPropertyFieldName];
    if (
      !lightPropertySelectedEntity ||
      state.primarySelection?.kind !== "item" ||
      !LIGHT_ITEM_TYPES.has(lightPropertySelectedEntity.type) ||
      !lightPropertyFieldConfig
    ) {
      return;
    }
    const lightPropertyFieldValue = sanitizeLightFieldValue(
      lightPropertyFieldName,
      selectElement(lightPropertyFieldConfig.input).value,
      lightPropertySelectedEntity.type
    );
    state.activeLightPropertyEdit = {
      property: lightPropertyFieldName,
      label: lightPropertyFieldConfig.label,
      value: lightPropertyFieldValue
    };
    lightPropertyApplyTitleElement.textContent = "应用" + lightPropertyFieldConfig.label;
    lightPropertyApplyValueInput.textContent = formatLightFieldValue(
      lightPropertyFieldName,
      lightPropertyFieldValue
    );
    renderLightPropertyTargets(lightPropertyFieldName);
    lightPropertyApplyDialogElement.showModal();
    requestAnimationFrame(() => lightPropertyToggleAllButton.focus());
  });
}
lightPropertyToggleAllButton.addEventListener("click", () => {
  const lightPropertyTargetCheckboxes = collectLightTargetItems();
  const shouldSelectAllTargets =
    !lightPropertyTargetCheckboxes.length ||
    !lightPropertyTargetCheckboxes.every(
      lightPropertyTargetCheckbox => lightPropertyTargetCheckbox.checked
    );
  for (const lightPropertyCheckboxToSet of lightPropertyTargetCheckboxes) {
    lightPropertyCheckboxToSet.checked = shouldSelectAllTargets;
  }
  syncLightTargetSelection();
});
lightPropertyTargetListElement.addEventListener("click", (lightTargetListClickEvent: any) => {
  const lightGroupToggleElement = lightTargetListClickEvent.target.closest(
    "[data-light-target-group-toggle]"
  );
  if (!lightGroupToggleElement) {
    return;
  }
  const lightGroupTargetElement = lightGroupToggleElement.closest("[data-light-target-group-id]");
  const lightGroupTargetCheckboxes = collectLightTargetItems(lightGroupTargetElement);
  const shouldSelectGroupTargets = !lightGroupTargetCheckboxes.every(
    lightGroupTargetCheckbox => lightGroupTargetCheckbox.checked
  );
  for (const lightGroupCheckboxToSet of lightGroupTargetCheckboxes) {
    lightGroupCheckboxToSet.checked = shouldSelectGroupTargets;
  }
  syncLightTargetSelection();
});
lightPropertyTargetListElement.addEventListener("change", syncLightTargetSelection);
selectElement("#light-property-apply-close").addEventListener("click", closeLightPropertyDialog);
selectElement("#light-property-apply-cancel").addEventListener("click", closeLightPropertyDialog);
lightPropertyApplyDialogElement.addEventListener("cancel", () => {
  state.activeLightPropertyEdit = null;
});
lightPropertyApplyFormElement.addEventListener("submit", (lightPropertyApplySubmitEvent: any) => {
  lightPropertyApplySubmitEvent.preventDefault();
  if (!state.activeLightPropertyEdit) {
    closeLightPropertyDialog();
    return;
  }
  const {
    property: appliedLightProperty,
    label: appliedLightPropertyLabel,
    value: appliedLightPropertyValue
  } = state.activeLightPropertyEdit;
  const lightPropertyTargetItemIds = new Set(
    collectLightTargetItems()
      .filter(lightPropertyApplyCheckbox => lightPropertyApplyCheckbox.checked)
      .map(
        lightPropertyTargetItemCheckbox => lightPropertyTargetItemCheckbox.dataset.lightTargetItemId
      )
  );
  const lightPropertyAffectedItems = state.activeScene.items.filter(
    (lightPropertyAffectedItem: any) =>
      LIGHT_ITEM_TYPES.has(lightPropertyAffectedItem.type) &&
      lightPropertyTargetItemIds.has(lightPropertyAffectedItem.id)
  );
  if (!lightPropertyAffectedItems.length) {
    showToast("请至少选择一盏灯。", "error");
    return;
  }
  const lightPropertyPendingChanges = lightPropertyAffectedItems
    .map((lightPropertyPendingItem: any) => ({
      item: lightPropertyPendingItem,
      value: sanitizeLightFieldValue(
        appliedLightProperty,
        appliedLightPropertyValue,
        lightPropertyPendingItem.type
      )
    }))
    .filter(
      (lightPropertyFilteredChange: any) =>
        Math.abs(
          finite(lightPropertyFilteredChange.item[appliedLightProperty]) -
            lightPropertyFilteredChange.value
        ) > 0.000001
    );
  if (lightPropertyPendingChanges.length) {
    pushHistorySnapshot();
    for (const lightPropertyChangeEntry of lightPropertyPendingChanges) {
      lightPropertyChangeEntry.item[appliedLightProperty] = lightPropertyChangeEntry.value;
    }
    refreshStudio("lights");
    markDocumentDirty();
  }
  closeLightPropertyDialog();
  showToast(
    "已将" + appliedLightPropertyLabel + "应用到 " + lightPropertyAffectedItems.length + " 盏灯。",
    "success"
  );
});

// 墙面批量应用复用灯光批量对话框的结构：默认全选、跳过没有改动的墙，
const wallPropertyApplyDialogElement = selectElement("#wall-property-apply-dialog");
const wallPropertyApplyFormElement = selectElement("#wall-property-apply-form");
const wallPropertyApplyTitleElement = selectElement("#wall-property-apply-title");
const wallPropertyApplyValueElement = selectElement("#wall-property-apply-value");
const wallPropertyTargetListElement = selectElement("#wall-property-target-list");
const wallPropertySelectionCountElement = selectElement("#wall-property-selection-count");
const wallPropertyToggleAllButton = selectElement("#wall-property-toggle-all");
const wallPropertyApplyButtons = [...document.querySelectorAll("[data-apply-wall-property]")];

/**
 * 关闭墙面批量应用对话框，并清空待应用的编辑内容。
 * @returns {void}
 */
function closeWallPropertyApplyDialog() {
  state.wallPropertyApplyEdit = null;
  wallPropertyApplyDialogElement.close();
}
/**
 * 收集某个作用域内的墙面勾选框（不传则默认整份列表）。
 * @returns {Array<HTMLInputElement>} 勾选框数组（可能为空）。
 */
function collectWallTargetCheckboxes(wallTargetScopeElement = wallPropertyTargetListElement) {
  return [...wallTargetScopeElement.querySelectorAll("[data-wall-target-item-id]")];
}
/**
 * @returns {number} 0~100 的整数百分比。
 */
function wallEffectiveOpacityPercent(wallRecord: any) {
  const globalOpacity = finite(state.activeScene.settings.wallOpacity, 0.24);
  const customOpacity =
    wallRecord.opacity === null || wallRecord.opacity === undefined
      ? null
      : clamp(finite(wallRecord.opacity, globalOpacity), 0, 1);
  return Math.round((customOpacity === null ? globalOpacity : customOpacity) * 100);
}
/**
 * @returns {string} 展示用文案。
 */
function wallPropertyCurrentText(wallRecord: any, wallPropertyKey: any) {
  if (wallPropertyKey === "height") {
    return finite(wallRecord.height, 2.8).toFixed(2) + " m";
  }
  if (wallPropertyKey === "thickness") {
    return finite(wallRecord.thickness, 0.12).toFixed(2) + " m";
  }
  const hasCustomOpacity =
    wallRecord.opacity !== null &&
    wallRecord.opacity !== undefined &&
    Number.isFinite(wallRecord.opacity);
  if (wallPropertyKey === "opacityMode") {
    return hasCustomOpacity
      ? "单独设置 " + wallEffectiveOpacityPercent(wallRecord) + "%"
      : "跟随通用";
  }
  return (hasCustomOpacity ? "" : "跟随通用 ") + wallEffectiveOpacityPercent(wallRecord) + "%";
}
/**
 * 同步墙面批量对话框的选择计数与全选按钮文案。
 * @returns {void}
 */
function syncWallTargetSelection() {
  const wallTargetCheckboxes = collectWallTargetCheckboxes();
  const checkedWallTargetCount = wallTargetCheckboxes.filter(
    wallTargetCheckbox => wallTargetCheckbox.checked
  ).length;
  wallPropertySelectionCountElement.textContent =
    checkedWallTargetCount + "/" + wallTargetCheckboxes.length + " 面墙";
  wallPropertyToggleAllButton.disabled = !wallTargetCheckboxes.length;
  wallPropertyToggleAllButton.textContent =
    wallTargetCheckboxes.length && checkedWallTargetCount === wallTargetCheckboxes.length
      ? "取消全选"
      : "全选";
}
function renderWallPropertyTargets(wallPropertyKey: any) {
  wallPropertyTargetListElement.replaceChildren();
  const listedWalls = state.activeScene.walls || [];
  if (!listedWalls.length) {
    const emptyWallTargetsElement = document.createElement("p");
    emptyWallTargetsElement.className = "light-property-target-empty";
    emptyWallTargetsElement.textContent = "当前楼层没有可应用的墙体。";
    wallPropertyTargetListElement.append(emptyWallTargetsElement);
    syncWallTargetSelection();
    return;
  }
  const wallTargetSectionElement = document.createElement("section");
  wallTargetSectionElement.className = "light-property-target-group";
  const wallTargetGridElement = document.createElement("div");
  wallTargetGridElement.className = "light-property-target-grid";
  listedWalls.forEach((listedWall: any, listedWallOrdinal: any) => {
    const wallTargetLabelElement = document.createElement("label");
    wallTargetLabelElement.className = "light-property-target-item";
    const wallTargetCheckboxElement = document.createElement("input");
    wallTargetCheckboxElement.type = "checkbox";
    wallTargetCheckboxElement.checked = true;
    wallTargetCheckboxElement.dataset.wallTargetItemId = listedWall.id;
    const wallTargetTextElement = document.createElement("span");
    const wallTargetNameElement = document.createElement("strong");
    wallTargetNameElement.textContent = "墙体 " + (listedWallOrdinal + 1);
    const wallTargetValueElement = document.createElement("small");
    wallTargetValueElement.textContent =
      (state.primarySelection?.kind === "wall" && state.primarySelection.id === listedWall.id
        ? "当前墙 · "
        : "") +
      "当前 " +
      wallPropertyCurrentText(listedWall, wallPropertyKey);
    wallTargetTextElement.append(wallTargetNameElement, wallTargetValueElement);
    wallTargetLabelElement.append(wallTargetCheckboxElement, wallTargetTextElement);
    wallTargetGridElement.append(wallTargetLabelElement);
  });
  wallTargetSectionElement.append(wallTargetGridElement);
  wallPropertyTargetListElement.append(wallTargetSectionElement);
  syncWallTargetSelection();
}
for (const wallPropertyApplyButton of wallPropertyApplyButtons) {
  wallPropertyApplyButton.addEventListener("click", () => {
    const wallPropertySelectedWall =
      state.primarySelection?.kind === "wall" ? findSelectedEntity() : null;
    if (!wallPropertySelectedWall) {
      return;
    }
    const wallPropertyKey = (wallPropertyApplyButton as any).dataset.applyWallProperty;
    const wallOpacityMode =
      selectElement("#wall-opacity-mode").value === "custom" ? "custom" : "global";
    const wallOpacityPercent = clamp(
      finite(
        selectElement("#wall-opacity").value,
        finite(state.activeScene.settings.wallOpacity, 0.24) * 100
      ),
      0,
      100
    );
    if (wallPropertyKey === "opacityMode") {
      state.wallPropertyApplyEdit = {
        property: "opacityMode",
        mode: wallOpacityMode,
        opacity: clamp(wallOpacityPercent / 100, 0, 1),
        label: "透明度设置",
        valueText:
          wallOpacityMode === "global"
            ? "跟随通用"
            : "单独设置（" + Math.round(wallOpacityPercent) + "%）"
      };
    } else if (wallPropertyKey === "opacity") {
      state.wallPropertyApplyEdit = {
        property: "opacity",
        mode: "custom",
        opacity: clamp(wallOpacityPercent / 100, 0, 1),
        label: "透明度",
        valueText: Math.round(wallOpacityPercent) + "%"
      };
    } else if (wallPropertyKey === "height") {
      const wallHeightValue = clamp(
        finite(selectElement("#wall-height").value, finite(state.activeScene.settings.wallHeight, 2.8)),
        0.01,
        6
      );
      state.wallPropertyApplyEdit = {
        property: "height",
        value: wallHeightValue,
        label: "墙高",
        valueText: wallHeightValue.toFixed(2) + " m"
      };
    } else if (wallPropertyKey === "thickness") {
      const wallThicknessValue = clamp(
        finite(
          selectElement("#wall-thickness").value,
          finite(state.activeScene.settings.wallThickness, 0.12)
        ),
        0.01,
        3
      );
      state.wallPropertyApplyEdit = {
        property: "thickness",
        value: wallThicknessValue,
        label: "厚度",
        valueText: wallThicknessValue.toFixed(2) + " m"
      };
    } else {
      return;
    }
    wallPropertyApplyTitleElement.textContent = "应用" + state.wallPropertyApplyEdit.label;
    wallPropertyApplyValueElement.textContent = state.wallPropertyApplyEdit.valueText;
    renderWallPropertyTargets(wallPropertyKey);
    wallPropertyApplyDialogElement.showModal();
    requestAnimationFrame(() => wallPropertyToggleAllButton.focus());
  });
}
wallPropertyToggleAllButton.addEventListener("click", () => {
  const wallTargetCheckboxes = collectWallTargetCheckboxes();
  const shouldSelectAllWallTargets =
    !wallTargetCheckboxes.length ||
    !wallTargetCheckboxes.every(wallTargetCheckbox => wallTargetCheckbox.checked);
  for (const wallTargetCheckboxToSet of wallTargetCheckboxes) {
    wallTargetCheckboxToSet.checked = shouldSelectAllWallTargets;
  }
  syncWallTargetSelection();
});
wallPropertyTargetListElement.addEventListener("change", syncWallTargetSelection);
selectElement("#wall-property-apply-close").addEventListener("click", closeWallPropertyApplyDialog);
selectElement("#wall-property-apply-cancel").addEventListener(
  "click",
  closeWallPropertyApplyDialog
);
wallPropertyApplyDialogElement.addEventListener("cancel", () => {
  state.wallPropertyApplyEdit = null;
});
wallPropertyApplyFormElement.addEventListener("submit", (wallPropertyApplySubmitEvent: any) => {
  wallPropertyApplySubmitEvent.preventDefault();
  const appliedWallEdit = state.wallPropertyApplyEdit;
  if (!appliedWallEdit) {
    closeWallPropertyApplyDialog();
    return;
  }
  const wallPropertyCheckedBoxes = collectWallTargetCheckboxes().filter(
    wallTargetCheckbox => wallTargetCheckbox.checked
  );
  if (!wallPropertyCheckedBoxes.length) {
    showToast("请至少选择一面墙体。", "error");
    return;
  }
  const wallPropertyTargetIds = new Set(
    wallPropertyCheckedBoxes.map(wallTargetCheckbox => wallTargetCheckbox.dataset.wallTargetItemId)
  );
  const wallPropertyPendingChanges = [];
  for (const listedWall of state.activeScene.walls || []) {
    if (!wallPropertyTargetIds.has(listedWall.id)) {
      continue;
    }
    if (appliedWallEdit.property === "height") {
      if (Math.abs(finite(listedWall.height, 0) - appliedWallEdit.value) < 1e-8) {
        continue;
      }
      wallPropertyPendingChanges.push([listedWall, "height", appliedWallEdit.value]);
      continue;
    }
    if (appliedWallEdit.property === "thickness") {
      if (Math.abs(finite(listedWall.thickness, 0) - appliedWallEdit.value) < 1e-8) {
        continue;
      }
      wallPropertyPendingChanges.push([listedWall, "thickness", appliedWallEdit.value]);
      continue;
    }
    // `null` 表示跟随楼层级的全局透明度，数值才是这面墙的单独覆盖值。
    const currentCustomOpacity =
      listedWall.opacity === null || listedWall.opacity === undefined
        ? null
        : clamp(finite(listedWall.opacity, finite(state.activeScene.settings.wallOpacity, 0.24)), 0, 1);
    const nextOpacity =
      appliedWallEdit.property === "opacityMode" && appliedWallEdit.mode === "global"
        ? null
        : appliedWallEdit.opacity;
    if (nextOpacity === null) {
      if (currentCustomOpacity === null) {
        continue;
      }
    } else if (
      currentCustomOpacity !== null &&
      Math.abs(currentCustomOpacity - nextOpacity) < 1e-8
    ) {
      continue;
    }
    wallPropertyPendingChanges.push([listedWall, "opacity", nextOpacity]);
  }
  if (wallPropertyPendingChanges.length) {
    pushHistorySnapshot();
    for (const [pendingWall, pendingWallKey, pendingWallValue] of wallPropertyPendingChanges) {
      pendingWall[pendingWallKey] = pendingWallValue;
    }
    if (appliedWallEdit.property === "height") {
      state.activeScene.settings.wallHeight = appliedWallEdit.value;
    } else if (appliedWallEdit.property === "thickness") {
      state.activeScene.settings.wallThickness = appliedWallEdit.value;
    }
    refreshStudio("architecture");
    markDocumentDirty();
  }
  const appliedWallCount = wallPropertyCheckedBoxes.length;
  closeWallPropertyApplyDialog();
  showToast("已将" + appliedWallEdit.label + "应用到 " + appliedWallCount + " 面墙体。", "success");
});
for (const paletteItemTypeButton of itemTypeButtons) {
  paletteItemTypeButton.addEventListener("dragstart", (itemTypeDragStartEvent: any) => {
    itemTypeDragStartEvent.dataTransfer!.effectAllowed = "copy";
    itemTypeDragStartEvent.dataTransfer!.setData(
      "application/x-homeos-3d-item",
      (paletteItemTypeButton as any).dataset.itemType
    );
  });
  paletteItemTypeButton.addEventListener("click", () => {
    const paletteDropPoint = screenToPlan({
      x: state.viewportWidthPx / 2,
      y: state.viewportHeightPx / 2
    });
    createSceneItem((paletteItemTypeButton as any).dataset.itemType, paletteDropPoint);
  });
}
planStageElement.addEventListener("dragenter", (stageDragEnterEvent: any) => {
  if ([...stageDragEnterEvent.dataTransfer!.types].includes("application/x-homeos-3d-item")) {
    planStageElement.classList.add("dragging-item");
  }
});
planStageElement.addEventListener("dragover", (stageDragOverEvent: any) => {
  if ([...stageDragOverEvent.dataTransfer!.types].includes("application/x-homeos-3d-item")) {
    stageDragOverEvent.preventDefault();
    stageDragOverEvent.dataTransfer!.dropEffect = "copy";
    planStageElement.classList.add("dragging-item");
  }
});
planStageElement.addEventListener("dragleave", (stageDragLeaveEvent: any) => {
  if (!planStageElement.contains(stageDragLeaveEvent.relatedTarget)) {
    planStageElement.classList.remove("dragging-item");
  }
});
planStageElement.addEventListener("drop", (stageItemDropEvent: any) => {
  stageItemDropEvent.preventDefault();
  planStageElement.classList.remove("dragging-item");
  const droppedItemTypeKey = stageItemDropEvent.dataTransfer!.getData(
    "application/x-homeos-3d-item"
  );
  if (droppedItemTypeKey) {
    createSceneItem(droppedItemTypeKey, screenToPlan(canvasPointFromEvent(stageItemDropEvent)));
  }
});
planCanvasElement.addEventListener("pointerdown", onPlanCanvasPointerDown);
planCanvasElement.addEventListener("pointermove", updateCameraGestureState);
planCanvasElement.addEventListener("pointerup", onPlanCanvasPointerEnd);
planCanvasElement.addEventListener("pointercancel", onPlanCanvasPointerEnd);
planCanvasElement.addEventListener("contextmenu", (canvasContextMenuEvent: any) =>
  canvasContextMenuEvent.preventDefault()
);
planCanvasElement.addEventListener(
  "wheel",
  (canvasWheelEvent: any) => {
    canvasWheelEvent.preventDefault();
    onPlanCanvasWheel(canvasWheelEvent);
  },
  {
    passive: false
  }
);
selectElement("#fit-view").addEventListener("click", fitViewToBounds);
selectElement("#rotate-plan-view").addEventListener("click", rotatePlanView);
selectElement("#zoom-in").addEventListener("click", () => zoomViewAt(1.18));
selectElement("#zoom-out").addEventListener("click", () => zoomViewAt(1 / 1.18));
selectElement("#reset-camera").addEventListener("click", resetCameraView);
saveCameraViewButton.addEventListener("click", saveCurrentCameraView);
fixedCameraViewInput.addEventListener("click", restoreStoredCameraView);
saveOverviewViewButton.addEventListener("click", saveCurrentCameraView);
fixedOverviewViewInput.addEventListener("click", restoreStoredCameraView);
exportSaveViewButton.addEventListener("click", saveCurrentCameraView);
selectElement("#open-export").addEventListener("click", openExportDialog);
selectElement("#export-close").addEventListener("click", () => {
  if (!state.isExportBusy) {
    exportDialogElement.close();
  }
});
exportDialogElement.addEventListener("cancel", (exportDialogCancelEvent: any) => {
  exportDialogCancelEvent.preventDefault();
  if (!state.isExportBusy) {
    exportDialogElement.close();
  }
});
exportDialogElement.addEventListener("close", closeExportDialog);
selectElement("#export-overwrite-close").addEventListener("click", () =>
  settleOverwriteChoice("cancel")
);
selectElement("#export-overwrite-cancel").addEventListener("click", () =>
  settleOverwriteChoice("cancel")
);
selectElement("#export-overwrite-rename").addEventListener("click", () =>
  settleOverwriteChoice("rename")
);
selectElement("#export-overwrite-confirm").addEventListener("click", () =>
  settleOverwriteChoice("overwrite")
);
exportOverwriteDialogElement.addEventListener("cancel", (overwriteDialogCancelEvent: any) => {
  overwriteDialogCancelEvent.preventDefault();
  settleOverwriteChoice("cancel");
});
const closeExportCompleteDialog = () => {
  if (exportCompleteDialogElement.open) {
    exportCompleteDialogElement.close();
  }
};
selectElement("#export-complete-close").addEventListener("click", closeExportCompleteDialog);
selectElement("#export-complete-confirm").addEventListener("click", closeExportCompleteDialog);
exportPresetSlotsElement.addEventListener("click", (presetSlotsClickEvent: any) => {
  const exportPresetSlotElement = presetSlotsClickEvent.target.closest("[data-export-preset-slot]");
  if (exportPresetSlotElement) {
    selectExportPresetSlot(Number(exportPresetSlotElement.dataset.exportPresetSlot));
  }
});
exportPresetAddButton.addEventListener("click", addExportPresetSlot);
exportPresetRenameButton.addEventListener("click", openPresetRenameDialog);
exportPresetDeleteButton.addEventListener("click", openPresetDeleteDialog);
selectElement("#export-preset-rename-close").addEventListener("click", closePresetRenameDialog);
selectElement("#export-preset-rename-cancel").addEventListener("click", closePresetRenameDialog);
exportPresetRenameDialogElement.addEventListener("cancel", (presetRenameCancelEvent: any) => {
  presetRenameCancelEvent.preventDefault();
  closePresetRenameDialog();
});
exportPresetRenameFormElement.addEventListener("submit", (presetRenameSubmitEvent: any) => {
  presetRenameSubmitEvent.preventDefault();
  const normalizedExportPresetSlots = normalizeExportPresetSlots(state.studioDocument?.exportPresets);
  const activeExportPresetIndex = normalizeActiveExportPresetSlot(
    state.studioDocument?.activeExportPresetSlot,
    normalizedExportPresetSlots.length
  );
  const exportPresetBeingRenamed = normalizedExportPresetSlots[activeExportPresetIndex];
  if (!exportPresetBeingRenamed) {
    closePresetRenameDialog();
    return;
  }
  const previousExportPresetLabel = exportPresetLabel(
    exportPresetBeingRenamed,
    activeExportPresetIndex
  );
  const renamedExportPresetName = uniqueExportPresetName(
    exportPresetRenameInputElement.value,
    activeExportPresetIndex
  );
  exportPresetBeingRenamed.name = renamedExportPresetName;
  state.studioDocument.exportPresets = normalizedExportPresetSlots;
  closePresetRenameDialog();
  renderExportPresetSlots();
  markDocumentDirty();
  if (renamedExportPresetName !== previousExportPresetLabel) {
    showToast("已重命名为“" + renamedExportPresetName + "”。", "success");
  }
});
selectElement("#export-preset-delete-close").addEventListener("click", closePresetDeleteDialog);
selectElement("#export-preset-delete-cancel").addEventListener("click", closePresetDeleteDialog);
exportPresetDeleteDialogElement.addEventListener("cancel", (presetDeleteCancelEvent: any) => {
  presetDeleteCancelEvent.preventDefault();
  closePresetDeleteDialog();
});
exportPresetDeleteFormElement.addEventListener("submit", (presetDeleteSubmitEvent: any) => {
  presetDeleteSubmitEvent.preventDefault();
  deleteActiveExportPreset();
});
exportDialogElement.addEventListener("input", (exportDialogInputEvent: any) => {
  if (!exportDialogInputEvent.target?.closest?.("#export-preset-slots")) {
    scheduleExportPresetSave();
  }
});
exportDialogElement.addEventListener("change", (exportDialogChangeEvent: any) => {
  if (!exportDialogChangeEvent.target?.closest?.("#export-preset-slots")) {
    scheduleExportPresetSave();
  }
});
exportDialogElement.addEventListener("click", (exportDialogClickEvent: any) => {
  if (
    exportDialogClickEvent.target?.closest?.(
      "[data-camera-view], [data-camera-mode], [data-camera-rotate-top]"
    )
  ) {
    scheduleExportPresetSave();
  }
});
exportWidthInput.addEventListener("input", () => setExportDimension("width"));
exportHeightInput.addEventListener("input", () => setExportDimension("height"));
exportWidthInput.addEventListener("change", () => setExportDimension("width", true));
exportHeightInput.addEventListener("change", () => setExportDimension("height", true));
exportLockRatioInput.addEventListener("change", () => {
  const { width: exportWidthValue, height: exportHeightValue } = exportDimensions();
  if (exportLockRatioInput.checked) {
    state.exportAspectRatio = exportWidthValue / exportHeightValue;
  }
  syncExportResolutionLabels();
});
selectElement("#export-use-fixed").addEventListener("click", restoreExportCamera);
exportFloorSelectElement.addEventListener("change", () =>
  applyExportFloorSelection(exportFloorSelectElement.value)
);
exportPackageButton.addEventListener("click", runStudioExport);
/**
 * @param {string} [lightingStatus="ready"] 状态标记：ready / preview / saved / cancelled。
 */
function postBaseLightingState(lightingStatus = "ready") {
  if (
    !!isAutoDiagramEmbed &&
    !!autoDiagramComponentId &&
    window.parent !== window &&
    !!state.studioDocument
  ) {
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-base-lighting-state",
        componentId: autoDiagramComponentId,
        status: lightingStatus,
        lighting: normalizeBaseLighting(state.baseLighting),
        savedLighting: normalizeBaseLighting(state.studioDocument.baseLighting),
        defaults: normalizeBaseLighting(DEFAULT_BASE_LIGHTING)
      },
      window.location.origin
    );
  }
}
function postFloorStateToParent() {
  if (
    !!isAutoDiagramEmbed &&
    !!autoDiagramComponentId &&
    window.parent !== window &&
    !!state.studioDocument
  ) {
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-floor-state",
        componentId: autoDiagramComponentId,
        floors: state.studioDocument.floors.map((floorSummaryEntry: any) => ({
          id: floorSummaryEntry.id,
          name: floorSummaryEntry.name
        })),
        floorSelection:
          currentPreviewFloorMode() === "all" ? "all" : getCurrentFloor()?.id || state.activeFloorId
      },
      window.location.origin
    );
  }
}
window.addEventListener("message", parentWindowMessageEvent => {
  if (
    !isAutoDiagramEmbed ||
    parentWindowMessageEvent.origin !== window.location.origin ||
    parentWindowMessageEvent.source !== window.parent
  ) {
    return;
  }
  const parentMessagePayload = parentWindowMessageEvent.data;
  if (!!parentMessagePayload && parentMessagePayload.componentId === autoDiagramComponentId) {
    if (parentMessagePayload.type === "homeos-floorplan-auto-diagram-floor") {
      if (parentMessagePayload.command === "set-floor") {
        const requestedFloorMatch = state.studioDocument.floors.find(
          (requestedFloorEntry: any) => requestedFloorEntry.id === parentMessagePayload.value
        );
        const resolvedRequestedFloorId =
          parentMessagePayload.value === "all" && state.studioDocument.floors.length > 1
            ? "all"
            : requestedFloorMatch?.id || getCurrentFloor()?.id || state.activeFloorId;
        applyExportFloorSelection(resolvedRequestedFloorId);
        postFloorStateToParent();
      }
      return;
    }
    if (parentMessagePayload.type === "homeos-floorplan-auto-diagram-base-lighting") {
      if (parentMessagePayload.command === "request-state") {
        baseLightControlsElement.hidden = true;
        applyBaseLightingSettings(state.studioDocument.baseLighting);
        postBaseLightingState("ready");
      } else if (parentMessagePayload.command === "preview") {
        baseLightControlsElement.hidden = true;
        applyBaseLightingSettings(parentMessagePayload.lighting);
        postBaseLightingState("preview");
      } else if (parentMessagePayload.command === "reset") {
        baseLightControlsElement.hidden = true;
        applyBaseLightingSettings(DEFAULT_BASE_LIGHTING);
        postBaseLightingState("preview");
      } else if (parentMessagePayload.command === "save") {
        baseLightControlsElement.hidden = true;
        applyBaseLightingSettings(parentMessagePayload.lighting);
        saveBaseLighting();
        postBaseLightingState("saved");
      } else if (
        parentMessagePayload.command === "cancel" ||
        parentMessagePayload.command === "close"
      ) {
        closeBaseLightingPanel();
        postBaseLightingState("cancelled");
      } else {
        openBaseLightingPanel();
      }
      return;
    }
    if (parentMessagePayload.type === "homeos-floorplan-auto-diagram-camera") {
      const editableCameraSettings = cameraSettingsSource();
      if (parentMessagePayload.command === "restore") {
        const incomingCameraSettings = parentMessagePayload.value || {};
        editableCameraSettings.cameraMode =
          incomingCameraSettings.mode === "perspective" ? "perspective" : "orthographic";
        editableCameraSettings.cameraView = incomingCameraSettings.view === "top" ? "top" : "free";
        editableCameraSettings.cameraTopRotation =
          (((Math.round(finite(incomingCameraSettings.topRotation, 0) / 90) * 90) % 360) + 360) %
          360;
        editableCameraSettings.cameraFocalLength = clamp(
          finite(incomingCameraSettings.focalLength, 50),
          18,
          120
        );
        if (incomingCameraSettings.snapshot) {
          applyCameraSnapshot(
            incomingCameraSettings.snapshot,
            incomingCameraSettings.snapshot.viewportAspect
          );
        } else {
          applyCameraMode(editableCameraSettings.cameraMode, {
            preserveView: true
          });
          applyCameraView(editableCameraSettings.cameraView, {
            force: true
          });
          applyFocalLength();
        }
      } else if (parentMessagePayload.command === "set-view") {
        editableCameraSettings.cameraView = parentMessagePayload.value === "top" ? "top" : "free";
        applyCameraView(editableCameraSettings.cameraView);
      } else if (parentMessagePayload.command === "set-mode") {
        editableCameraSettings.cameraMode =
          parentMessagePayload.value === "perspective" ? "perspective" : "orthographic";
        applyCameraMode(editableCameraSettings.cameraMode);
      } else if (parentMessagePayload.command === "rotate-top") {
        editableCameraSettings.cameraView = "top";
        editableCameraSettings.cameraTopRotation = (currentTopRotationDeg() + 90) % 360;
        applyCameraView("top", {
          force: true
        });
      } else if (parentMessagePayload.command === "set-focal-length") {
        editableCameraSettings.cameraFocalLength = clamp(
          finite(parentMessagePayload.value, currentFocalLength()),
          18,
          120
        );
        applyFocalLength();
      }
      invalidateRender();
      return;
    }
    if (
      parentMessagePayload.type === "homeos-floorplan-auto-diagram-generate" &&
      !state.isExportBusy
    ) {
      for (const exportFileCheckbox of exportDialogElement.querySelectorAll(
        "input[data-export-file]"
      )) {
        exportFileCheckbox.checked = true;
      }
      exportFolderNameInput.value = String(parentMessagePayload.folderName || "").trim();
      exportWidthInput.value = String(
        Math.round(clamp(finite(parentMessagePayload.width, exportWidthInput.value), 320, 4096))
      );
      exportHeightInput.value = String(
        Math.round(clamp(finite(parentMessagePayload.height, exportHeightInput.value), 320, 4096))
      );
      exportLockRatioInput.checked = true;
      syncExportResolutionLabels();
      runStudioExport();
    }
  }
});
for (const previewSyncToggleButton of previewSyncButtons) {
  previewSyncToggleButton.addEventListener("click", () => {
    const shouldEnableLivePreview = (previewSyncToggleButton as any).dataset.previewSync !== "manual";
    if (shouldEnableLivePreview !== isLivePreviewEnabled()) {
      pushHistorySnapshot();
      state.activeScene.settings.livePreviewEnabled = shouldEnableLivePreview;
      markDocumentDirty();
      syncPreviewControls();
      if (shouldEnableLivePreview) {
        applySceneRefresh({
          force: true
        });
      } else {
        invalidateLightCacheSoon();
      }
    }
  });
}
refreshPreviewButton.addEventListener("click", () =>
  applySceneRefresh({
    force: true
  })
);
for (const cameraModeToggleButton of cameraModeButtons) {
  cameraModeToggleButton.addEventListener("click", () => {
    const requestedCameraMode =
      (cameraModeToggleButton as any).dataset.cameraMode === "perspective" ? "perspective" : "orthographic";
    if (requestedCameraMode !== currentCameraMode()) {
      if (!state.exportRenderState) {
        pushHistorySnapshot();
      }
      cameraSettingsSource().cameraMode = requestedCameraMode;
      applyCameraMode(requestedCameraMode);
      if (state.exportRenderState) {
        exportStatusElement.textContent =
          requestedCameraMode === "perspective" ? "已切换为透视构图" : "已切换为正交构图";
      } else {
        markDocumentDirty();
      }
    }
  });
}
for (const cameraViewToggleButton of cameraViewButtons) {
  cameraViewToggleButton.addEventListener("click", () => {
    const requestedCameraView =
      (cameraViewToggleButton as any).dataset.cameraView === "top" ? "top" : "free";
    if (requestedCameraView !== currentCameraView()) {
      if (!state.exportRenderState) {
        pushHistorySnapshot();
      }
      cameraSettingsSource().cameraView = requestedCameraView;
      applyCameraView(requestedCameraView);
      if (state.exportRenderState) {
        exportStatusElement.textContent =
          requestedCameraView === "top" ? "已切换为顶视构图" : "已切换为自由构图";
      } else {
        markDocumentDirty();
      }
    }
  });
}
for (const cameraRotateTopButton of cameraRotateTopButtons) {
  cameraRotateTopButton.addEventListener("click", () => {
    if (currentCameraView() === "top") {
      if (!state.exportRenderState) {
        pushHistorySnapshot();
      }
      cameraSettingsSource().cameraTopRotation = (currentTopRotationDeg() + 90) % 360;
      applyCameraView("top", {
        force: true
      });
      if (state.exportRenderState) {
        exportStatusElement.textContent = "顶视已旋转 " + currentTopRotationDeg() + "°";
      } else {
        markDocumentDirty();
      }
    }
  });
}
for (const cameraFocalLengthInput of cameraFocalLengthInputs) {
  cameraFocalLengthInput.addEventListener("change", () => {
    const nextFocalLengthValue = clamp(
      finite((cameraFocalLengthInput as any).value, currentFocalLength()),
      18,
      120
    );
    for (const syncedFocalLengthInput of cameraFocalLengthInputs) {
      (syncedFocalLengthInput as any).value = String(Math.round(nextFocalLengthValue));
    }
    if (!(Math.abs(nextFocalLengthValue - currentFocalLength()) < 1e-8)) {
      if (!state.exportRenderState) {
        pushHistorySnapshot();
      }
      cameraSettingsSource().cameraFocalLength = nextFocalLengthValue;
      applyFocalLength();
      if (state.exportRenderState) {
        exportStatusElement.textContent = "焦段已设为 " + Math.round(nextFocalLengthValue) + " mm";
      } else {
        markDocumentDirty();
      }
    }
  });
}
for (const baseLightControlInput of baseLightControlInputs) {
  baseLightControlInput.addEventListener("input", () =>
    handleBaseLightControlInput(baseLightControlInput)
  );
  baseLightControlInput.addEventListener("change", () => {
    handleBaseLightControlInput(baseLightControlInput);
    syncBaseLightControlInputs();
  });
}
for (const openBaseLightingButton of openBaseLightingButtons) {
  openBaseLightingButton.addEventListener("click", openBaseLightingPanel);
}
closeBaseLightingButton?.addEventListener("click", closeBaseLightingPanel);
saveBaseLightingButton?.addEventListener("click", saveBaseLighting);
resetBaseLightingButton?.addEventListener("click", () => {
  applyBaseLightingSettings(DEFAULT_BASE_LIGHTING);
});
baseLightControlsHeaderElement?.addEventListener("pointerdown", (panelDragStartEvent: any) => {
  if (panelDragStartEvent.button !== 0 || panelDragStartEvent.target.closest("button")) {
    return;
  }
  const panelStartRect = baseLightControlsElement.getBoundingClientRect();
  state.panelResizeState = {
    pointerId: panelDragStartEvent.pointerId,
    startX: panelDragStartEvent.clientX,
    startY: panelDragStartEvent.clientY,
    startLeft: panelStartRect.left,
    startTop: panelStartRect.top,
    moved: false
  };
  capturePointer(baseLightControlsHeaderElement, panelDragStartEvent.pointerId);
});
baseLightControlsHeaderElement?.addEventListener("pointermove", (panelDragMoveEvent: any) => {
  if (!state.panelResizeState || panelDragMoveEvent.pointerId !== state.panelResizeState.pointerId) {
    return;
  }
  const panelDragDeltaX = panelDragMoveEvent.clientX - state.panelResizeState.startX;
  const panelDragDeltaY = panelDragMoveEvent.clientY - state.panelResizeState.startY;
  if (!state.panelResizeState.moved && Math.hypot(panelDragDeltaX, panelDragDeltaY) < 4) {
    return;
  }
  state.panelResizeState.moved = true;
  panelDragMoveEvent.preventDefault();
  // 夹取算法与「打开时兜一遍」共用一处：8px 边距、按实测尺寸、清掉 right 只留 left/top。
  moveFloatingPanelIntoBounds({
    panelElement: baseLightControlsElement,
    leftPx: state.panelResizeState.startLeft + panelDragDeltaX,
    topPx: state.panelResizeState.startTop + panelDragDeltaY
  });
});
const endPanelDrag = (panelDragEndEvent: any) => {
  if (!!state.panelResizeState && panelDragEndEvent.pointerId === state.panelResizeState.pointerId) {
    state.panelResizeState = null;
  }
};
baseLightControlsHeaderElement?.addEventListener("pointerup", endPanelDrag);
baseLightControlsHeaderElement?.addEventListener("pointercancel", endPanelDrag);
state.lightingChannel?.addEventListener("message", (lightingChannelMessageEvent: any) => {
  if (lightingChannelMessageEvent.data?.type !== "base-lighting-saved") {
    return;
  }
  const mirroredBaseLighting = normalizeBaseLighting(lightingChannelMessageEvent.data.lighting);
  if (state.studioDocument) {
    state.studioDocument.baseLighting = mirroredBaseLighting;
  }
  applyBaseLightingSettings(mirroredBaseLighting);
});
snapToggleButton.addEventListener("click", () => {
  pushHistorySnapshot();
  state.activeScene.settings.snapEnabled = state.activeScene.settings.snapEnabled === false;
  syncSnapControls();
  updateSnapIndicator();
  renderPlanView();
  markDocumentDirty();
});
snapSettingsToggleButton.addEventListener("click", (snapSettingsToggleEvent: any) => {
  snapSettingsToggleEvent.stopPropagation();
  setSnapSettingsVisible(snapSettingsPanelElement.hidden);
});
snapSettingsPanelElement.addEventListener("pointerdown", (snapSettingsPointerDownEvent: any) =>
  snapSettingsPointerDownEvent.stopPropagation()
);
for (const snapSettingToggleInput of snapSettingInputs) {
  snapSettingToggleInput.addEventListener("change", () => {
    pushHistorySnapshot();
    state.activeScene.settings[(snapSettingToggleInput as any).dataset.snapSetting] =
      (snapSettingToggleInput as any).checked;
    updateSnapIndicator();
    renderPlanView();
    markDocumentDirty();
  });
}
snapToleranceInput.addEventListener("input", () => {
  snapToleranceValueElement.textContent = snapToleranceInput.value + " px";
});
snapToleranceInput.addEventListener("change", () => {
  const nextSnapTolerancePx = clamp(Math.round(finite(snapToleranceInput.value, 13)), 6, 24);
  if (nextSnapTolerancePx !== state.activeScene.settings.snapTolerance) {
    pushHistorySnapshot();
    state.activeScene.settings.snapTolerance = nextSnapTolerancePx;
    syncSnapControls();
    updateSnapIndicator();
    renderPlanView();
    markDocumentDirty();
  }
});
finishWallButton.addEventListener("click", () => finishWallDrawing());
deleteSelectionButton.addEventListener("click", deleteSelection);
selectElement("#scale-close").addEventListener("click", () => {
  state.scaleReferenceLine = null;
  scaleDialogElement.close();
  renderPlanView();
});
selectElement("#scale-cancel").addEventListener("click", () => {
  state.scaleReferenceLine = null;
  scaleDialogElement.close();
  activateTool("scale");
});
scaleFormElement.addEventListener("submit", (scaleSubmitEvent: any) => {
  scaleSubmitEvent.preventDefault();
  if (!state.scaleReferenceLine) {
    return;
  }
  const referenceMeters = finite(referenceMetersInput.value, 0);
  const referencePixelLength = distance(state.scaleReferenceLine.start, state.scaleReferenceLine.end);
  if (referenceMeters <= 0 || referencePixelLength <= 0) {
    showToast("请输入有效的真实长度。", "error");
    return;
  }
  pushHistorySnapshot();
  state.activeScene.calibration = {
    pixelsPerMeter: referencePixelLength / referenceMeters,
    reference: {
      ...state.scaleReferenceLine,
      meters: referenceMeters
    }
  };
  state.scaleReferenceLine = null;
  scaleDialogElement.close();
  activateTool("wall");
  refreshStudio();
  resetCameraView();
  markDocumentDirty();
  const calibrationFloor = getCurrentFloor();
  if (
    state.studioDocument.floors.findIndex(
      (calibrationFloorEntry: any) => calibrationFloorEntry.id === calibrationFloor?.id
    ) > 0 &&
    calibrationFloor?.alignmentPending
  ) {
    requestAnimationFrame(() => startFloorAlignment());
    showToast("比例已标定，接下来设置上下楼层的参照点。");
  } else {
    showToast("比例已标定，可以沿着底图连续描墙了。");
  }
});
for (const wallInspectorInput of [
  selectElement("#wall-height"),
  selectElement("#wall-thickness"),
  selectElement("#wall-opacity-mode"),
  selectElement("#wall-opacity"),
  selectElement("#wall-open-end-mode")
]) {
  wallInspectorInput.addEventListener("change", () => applyInspectorChanges("wall"));
}
for (const windowInspectorInput of [
  selectElement("#window-width"),
  selectElement("#window-height"),
  selectElement("#window-sill"),
  selectElement("#window-divider")
]) {
  windowInspectorInput.addEventListener("change", () => applyInspectorChanges("window"));
}
for (const doorInspectorInput of [
  selectElement("#door-type"),
  selectElement("#door-material"),
  selectElement("#door-width"),
  selectElement("#door-height")
]) {
  doorInspectorInput.addEventListener("change", () => applyInspectorChanges("door"));
}
for (const railingInspectorInput of [
  selectElement("#railing-width"),
  selectElement("#railing-height")
]) {
  railingInspectorInput.addEventListener("change", () => applyInspectorChanges("railing"));
}
for (const itemInspectorInput of [
  selectElement("#item-x"),
  selectElement("#item-y"),
  selectElement("#item-width"),
  selectElement("#item-height"),
  selectElement("#item-depth"),
  selectElement("#item-elevation"),
  selectElement("#item-rotation"),
  selectElement("#item-vertical-rotation"),
  itemStripRollInput
]) {
  itemInspectorInput.addEventListener("change", () => applyInspectorChanges("item"));
}
itemLightSourceVisibleInput.addEventListener("change", () => applyInspectorChanges("item"));
for (const labelInspectorInput of [
  selectElement("#label-title"),
  selectElement("#label-title-spacing"),
  selectElement("#label-subtitle"),
  selectElement("#label-subtitle-spacing"),
  selectElement("#label-line-length")
]) {
  labelInspectorInput.addEventListener("change", () => applyInspectorChanges("item"));
}
for (const lightInspectorInput of [
  selectElement("#light-group"),
  selectElement("#light-temperature"),
  selectElement("#light-brightness"),
  selectElement("#light-range"),
  selectElement("#light-angle")
]) {
  lightInspectorInput.addEventListener("change", () => applyInspectorChanges("item"));
}
selectElement("#curtain-position").addEventListener("change", () => applyInspectorChanges("item"));
for (const curtainInspectorInput of [
  "curtain-form",
  "curtain-track",
  "curtain-corner",
  "curtain-left-length",
  "curtain-right-length",
  "curtain-meet",
  "curtain-fabric",
  "curtain-preview"
]) {
  selectElement("#" + curtainInspectorInput).addEventListener("change", () =>
    applyInspectorChanges("item")
  );
}
selectElement("#round-table-turntable").addEventListener("change", () =>
  applyInspectorChanges("item")
);
selectElement("#stair-direction").addEventListener("change", () => applyInspectorChanges("item"));
selectElement("#tv-mount-style").addEventListener("change", () => applyInspectorChanges("item"));
selectElement("#mural-style").addEventListener("change", () => applyInspectorChanges("item"));
selectElement("#feature-wall-style").addEventListener("change", () =>
  applyInspectorChanges("item")
);
selectElement("#material-style").addEventListener("change", () => applyInspectorChanges("item"));
for (const fridgeStyleRadioInput of fridgeStyleRadioInputs) {
  fridgeStyleRadioInput.addEventListener("change", () => applyInspectorChanges("item"));
}
selectElement("#pillar-shape").addEventListener("change", () => applyInspectorChanges("item"));
selectElement("#pillar-axis").addEventListener("change", () => applyInspectorChanges("item"));
selectElement("#strip-axis").addEventListener("change", () => applyInspectorChanges("item"));
shoeCabinetMirrorInput.addEventListener("click", () => {
  const mirrorToggleItem = findSelectedEntity();
  if (
    !!mirrorToggleItem &&
    state.primarySelection?.kind === "item" &&
    mirrorToggleItem.type === "shoecabinet"
  ) {
    pushHistorySnapshot();
    mirrorToggleItem.shoeCabinetMirrored = mirrorToggleItem.shoeCabinetMirrored !== true;
    refreshStudio(scopeForItem(mirrorToggleItem));
    markDocumentDirty();
  }
});
selectionInspectorElement.addEventListener("submit", (inspectorSubmitEvent: any) =>
  inspectorSubmitEvent.preventDefault()
);
selectElement("#door-hinge").addEventListener("click", () => {
  const hingeToggleDoor = findSelectedEntity();
  if (
    !!hingeToggleDoor &&
    state.primarySelection?.kind === "door" &&
    !["double", "roller-shutter"].includes(hingeToggleDoor.doorType)
  ) {
    pushHistorySnapshot();
    hingeToggleDoor.hinge = hingeToggleDoor.hinge === "right" ? "left" : "right";
    refreshStudio("architecture");
    markDocumentDirty();
  }
});
selectElement("#door-swing").addEventListener("click", () => {
  const swingToggleDoor = findSelectedEntity();
  if (
    !!swingToggleDoor &&
    state.primarySelection?.kind === "door" &&
    swingToggleDoor.doorType !== "frame-only"
  ) {
    pushHistorySnapshot();
    swingToggleDoor.swing = swingToggleDoor.swing === -1 ? 1 : -1;
    refreshStudio("architecture");
    markDocumentDirty();
  }
});
for (const rotateButton of document.querySelectorAll("[data-rotate]")) {
  rotateButton.addEventListener("click", () => {
    const rotateTargetItem = findSelectedEntity();
    if (!rotateTargetItem || state.primarySelection?.kind !== "item") {
      return;
    }
    pushHistorySnapshot();
    const rotateResultAngle = rotateTargetItem.rotation + Number((rotateButton as any).dataset.rotate);
    rotateTargetItem.rotation =
      rotateTargetItem.type === "striplight"
        ? normalizeFullRotation(rotateResultAngle)
        : rotateResultAngle % 360;
    refreshStudio(scopeForItem(rotateTargetItem));
    markDocumentDirty();
  });
}
window.addEventListener("keydown", windowKeyDownEvent => {
  if (isStageViewerMode || windowKeyDownEvent.defaultPrevented || exportDialogElement.open) {
    return;
  }
  if (windowKeyDownEvent.key === "Escape" && !snapSettingsPanelElement.hidden) {
    setSnapSettingsVisible(false);
    return;
  }
  const isTypingInField =
    windowKeyDownEvent.target instanceof HTMLInputElement ||
    windowKeyDownEvent.target instanceof HTMLTextAreaElement ||
    scaleDialogElement.open;
  if (windowKeyDownEvent.code === "Space" && !isTypingInField) {
    state.isPanning = true;
    windowKeyDownEvent.preventDefault();
  }
  if (windowKeyDownEvent.key.toLowerCase() === "s" && !isTypingInField) {
    state.isSnapTemporarilyDisabled = true;
    updateSnapIndicator();
    renderPlanView();
  }
  if (isTypingInField) {
    return;
  }
  if (
    windowKeyDownEvent.key === "Shift" &&
    !state.pointerInteraction &&
    (state.activeTool === "scale" || state.activeTool === "wall")
  ) {
    state.snapOverridePoint = true;
    updateSnapIndicator();
    renderPlanView();
  }
  const hasCommandModifier = windowKeyDownEvent.metaKey || windowKeyDownEvent.ctrlKey;
  if (hasCommandModifier && windowKeyDownEvent.key.toLowerCase() === "z") {
    windowKeyDownEvent.preventDefault();
    applyHistoryShortcut(windowKeyDownEvent);
    return;
  }
  if (hasCommandModifier && windowKeyDownEvent.key.toLowerCase() === "d") {
    windowKeyDownEvent.preventDefault();
    duplicateSelection();
    return;
  }
  if (hasCommandModifier && windowKeyDownEvent.key.toLowerCase() === "c") {
    windowKeyDownEvent.preventDefault();
    copySelectionToClipboard();
    return;
  }
  if (hasCommandModifier && windowKeyDownEvent.key.toLowerCase() === "v") {
    windowKeyDownEvent.preventDefault();
    pasteClipboardItems();
    return;
  }
  if (windowKeyDownEvent.key === "Delete" || windowKeyDownEvent.key === "Backspace") {
    windowKeyDownEvent.preventDefault();
    deleteSelection();
    return;
  }
  const arrowNudgeVector = {
    ArrowLeft: {
      x: -1,
      y: 0
    },
    ArrowRight: {
      x: 1,
      y: 0
    },
    ArrowUp: {
      x: 0,
      y: -1
    },
    ArrowDown: {
      x: 0,
      y: 1
    }
  }[windowKeyDownEvent.key];
  if (arrowNudgeVector && !hasCommandModifier) {
    const nudgeTargetItemIds =
      state.primarySelection?.kind === "item"
        ? [state.primarySelection.id]
        : state.multiSelection
            .filter((nudgeSelectedEntity: any) => nudgeSelectedEntity.kind === "item")
            .map((nudgeSelectedItem: any) => nudgeSelectedItem.id);
    if (nudgeTargetItemIds.length) {
      windowKeyDownEvent.preventDefault();
      if (!windowKeyDownEvent.repeat) {
        pushHistorySnapshot();
      }
      const nudgeStepMeters =
        (windowKeyDownEvent.altKey ? 0.01 : windowKeyDownEvent.shiftKey ? 0.25 : 0.05) *
        (currentPixelsPerMeter() || 1);
      const nudgeItemIdSet = new Set(nudgeTargetItemIds);
      for (const nudgeSceneItem of state.activeScene.items) {
        if (nudgeItemIdSet.has(nudgeSceneItem.id)) {
          nudgeSceneItem.x += arrowNudgeVector.x * nudgeStepMeters;
          nudgeSceneItem.y += arrowNudgeVector.y * nudgeStepMeters;
        }
      }
      refreshStudio(currentSelectionScope());
      markDocumentDirty();
      return;
    }
  }
  if (windowKeyDownEvent.key === "Escape") {
    if (state.activeTool === "flooropening" || state.pointerInteraction?.type === "draw-flooropening") {
      windowKeyDownEvent.preventDefault();
      if (state.pointerInteraction?.type === "draw-flooropening") {
        releasePointer(planCanvasElement, state.pointerInteraction.pointerId);
        state.pointerInteraction = null;
        endExportRender();
      }
      activateTool("select");
      return;
    }
    if (state.floorAlignState) {
      windowKeyDownEvent.preventDefault();
      cancelFloorAlignment();
      return;
    }
    closeLightGroupContextMenu();
    finishWallDrawing();
    const previousRendererLightScope = currentLightScope();
    clearSelection();
    renderInspector();
    renderPlanView();
    requestSceneRefresh(previousRendererLightScope);
  }
});
window.addEventListener("keyup", windowKeyUpEvent => {
  if (windowKeyUpEvent.code === "Space") {
    state.isPanning = false;
  }
  if (windowKeyUpEvent.key.toLowerCase() === "s") {
    state.isSnapTemporarilyDisabled = false;
    updateSnapIndicator();
    renderPlanView();
  }
  if (windowKeyUpEvent.key === "Shift") {
    state.snapOverridePoint = false;
    updateSnapIndicator();
    renderPlanView();
  }
});
window.addEventListener("blur", () => {
  state.isPanning = false;
  state.snapOverridePoint = false;
  state.isSnapTemporarilyDisabled = false;
});
window.addEventListener("beforeunload", beforeUnloadEvent => {
  if (state.changeRevision !== state.savedRevision) {
    beforeUnloadEvent.preventDefault();
    beforeUnloadEvent.returnValue = "";
  }
});
document.addEventListener("visibilitychange", () => {
  if (!document.hidden) {
    invalidateRender();
  }
});
new ResizeObserver(resizePlanCanvas).observe(planStageElement);

/* ===== 布局层接线：把手条 / 快捷键 ===== */

const studioLayoutControls = bindLayoutControls({ controller: studioLayout, root: document });

/**
 * 执行一个布局动作并同步共享控件的可视态。快捷键入口不经过 bindLayoutControls 的点击处理，
 */
function runLayoutAction(layoutAction: any) {
  layoutAction();
  studioLayoutControls.sync();
}

bindLayoutShortcuts({
  bindings: [
    {
      id: "toggle-library",
      combo: "Mod+B",
      run: () => runLayoutAction(() => studioLayout.togglePanel("library"))
    },
    {
      id: "toggle-details",
      combo: "Mod+Shift+B",
      run: () => runLayoutAction(() => studioLayout.togglePanel("details"))
    }
  ]
});

window.addEventListener("resize", () => {
  state.studioLayoutConstants = null;
  studioLayout.refresh();
});

initializeStudioSelects();
initializeNumberInputs();
syncBaseLightControlInputs();
/**
 * 等待自适应灯光缓存构建完成（最多 1.8 秒），导出取图前用它确保光照已就绪。
 * @returns {Promise<void>} 缓存就绪或超时后 resolve。
 */
async function waitForLightCacheSettle() {
  if (!isAdaptiveLightCacheEnabled()) {
    return;
  }
  scheduleLightCacheBuild(0);
  const lightCacheWaitDeadline = performance.now() + 1800;
  while (
    isAdaptiveLightCacheEnabled() &&
    (!state.isLightCacheReady || state.needsLightCacheRefresh || lightCacheCanvasElement.hidden) &&
    performance.now() < lightCacheWaitDeadline
  ) {
    await new Promise(requestAnimationFrame);
  }
}
/**
 * 创建舞台控制器：把楼层缓存、位姿与相机混合投影、灯光过渡/渐变、轨道控制覆盖等运行时操作封装成一组闭包接口。
 * @returns {object} 舞台控制器对象，暴露相机帧监听、帧循环、楼层切换、灯光状态应用等接口。
 */
function createStageController() {
  if (state.renderer.debug) {
    state.renderer.debug.checkShaderErrors = false;
  }
  const referenceProjectDocument = normalizeStudioDocument(
    state.savedSceneRecord.referenceScene || state.savedSceneRecord.scene
  );
  let lastRequestedFloorGap: any = null;

  const floorCacheStats = {
    reusedTransitions: 0,
    rebuiltTransitions: 0,
    reusedFloors: 0
  };
  let appearanceSignature = "";

  state.lightingChannel?.close();
  state.lightingChannel = null;

  let environmentAirflowController: any = null;
  let curtainSyncHandler: any = null;
  let televisionSyncHandler: any = null;
  let needsSpotShadowRefresh = false;
  let shadowRefreshModelRoot: any;
  let shadowRefreshSceneRevision: any;
  let shadowCastingLights: any = [];
  let curtainBoundsBoxes: any = [];
  let previousCurtainFloorIds: any = [];
  let contactShadowFloorIds: any = [];
  const stageBackgroundController = createStageBackgroundController();

  let presentedPromise;

  let isBaseLightingPreviewActive = false;

  let uniformOverviewStackOverride: any;
  let overviewStackAnimation: any = null;

  let isCameraMotionRunning = false;
  let isControlInteractionActive = false;

  const lightTransitionController = createLightTransitionController({
    isCameraMotionRunning: () => isCameraMotionRunning,
    isControlInteractionActive: {
      get: () => isControlInteractionActive,
      set: (next: any) => {
        isControlInteractionActive = next;
      }
    }
  });
  const stageRuntimeController = createStageRuntimeController({
    isCameraMotionRunning: () => isCameraMotionRunning,
    isControlInteractionActive: {
      get: () => isControlInteractionActive,
      set: (next: any) => {
        isControlInteractionActive = next;
      }
    },
    lightTransitionController: () => lightTransitionController
  });

  /**
   * 暂停或恢复编辑器特效（地面反射），并把当前特效状态写到渲染容器的 dataset 便于排查。
   * @param {boolean} areEditorEffectsPaused 是否暂停特效。
   * @param {boolean} isLightPreviewMode 是否灯光预览模式（预览时仍保留反射）。
   */
  function setEditorEffects(areEditorEffectsPaused: any, isLightPreviewMode: any) {
    const shouldSuspendReflections = areEditorEffectsPaused && !isLightPreviewMode;
    state.renderer.domElement.dataset.editorEffects = areEditorEffectsPaused
      ? isLightPreviewMode
        ? "light-preview"
        : "paused"
      : "runtime";
    if (stageRuntimeController.floorEffectsController.areFloorEffectsPaused !== shouldSuspendReflections) {
      stageRuntimeController.floorEffectsController.areFloorEffectsPaused = shouldSuspendReflections;
      stageRuntimeController.floorEffectsController.groundReflectionsController.setSuspended?.(stageRuntimeController.floorEffectsController.areFloorEffectsPaused || stageRuntimeController.floorEffectsController.areReflectionsSuspended);
      requestRenderFrame();
    }
  }

  state.contactShadowController?.setFrameProvider?.((frameProviderFloorId: any) => {
    const frameProviderRecord = stageRuntimeController.floorTransitionController.records.find(
      frameProviderEntry => frameProviderEntry.id === frameProviderFloorId
    );
    if (frameProviderRecord) {
      frameProviderRecord.node.updateWorldMatrix(true, false);
      return frameProviderRecord.node.matrixWorld.clone().multiply(frameProviderRecord.baseFrame);
    } else {
      return floorWorldMatrix(frameProviderFloorId);
    }
  });
  state.regionLightController?.setMotionTransformProvider?.((motionTransformFloorId: any) => {
    const motionTransformRecord = stageRuntimeController.floorTransitionController.records.find(
      motionTransformEntry => motionTransformEntry.id === motionTransformFloorId
    );
    if (motionTransformRecord) {
      motionTransformRecord.node.updateWorldMatrix(true, false);
      return (motionTransformRecord.lightingTransform ||= new threeModuleMin.Matrix4())
        .copy(motionTransformRecord.node.matrixWorld)
        .invert()
        .premultiply(state.previewModelRoot.matrixWorld);
    } else {
      return null;
    }
  });
  globalThis.window?.addEventListener(
    "pagehide",
    () => {
      stageRuntimeController.floorTransitionController.finish();
      stageRuntimeController.floorCacheController.releaseFloorCache();
    },
    {
      once: true
    }
  );
  globalThis.window?.addEventListener("pagehide", () => stageRuntimeController.floorEffectsController.groundReflectionsController.dispose(), {
    once: true
  });
  const overlayOnBeforeRender = state.previewOverlayScene.onBeforeRender;
  const shadowRefreshProbeMesh = new threeModuleMin.Mesh(
    new threeModuleMin.BufferGeometry().setAttribute(
      "position",
      new threeModuleMin.Float32BufferAttribute([], 3)
    ),
    new threeModuleMin.MeshBasicMaterial({
      colorWrite: false,
      depthWrite: false,
      depthTest: false
    })
  );
  shadowRefreshProbeMesh.name = "interaction3d-curtain-shadow-refresh";
  shadowRefreshProbeMesh.frustumCulled = false;
  shadowRefreshProbeMesh.renderOrder = -1000000000;
  shadowRefreshProbeMesh.layers.enableAll();
  shadowRefreshProbeMesh.onBeforeRender = () => {
    if (needsSpotShadowRefresh && !stageRuntimeController.floorEffectsController.areShadowsFrozen) {
      needsSpotShadowRefresh = state.spotShadowAtlasController
        ? !state.spotShadowAtlasController.refreshGeometry(state.previewModelRoot, curtainBoundsBoxes)
        : false;
    }
  };
  state.previewOverlayScene.add(shadowRefreshProbeMesh);
  globalThis.window?.addEventListener(
    "pagehide",
    () => {
      shadowRefreshProbeMesh.removeFromParent();
      shadowRefreshProbeMesh.geometry.dispose();
      shadowRefreshProbeMesh.material.dispose();
    },
    {
      once: true
    }
  );
  state.previewOverlayScene.onBeforeRender = function (...overlayRenderArguments: any[]) {
    if (stageRuntimeController.floorEffectsController.groundReflectionsController.stats.inCapture) {
      return;
    }
    stageRuntimeController.floorEffectsController.restoreShadowIntensity();
    if (!stageRuntimeController.floorEffectsController.areShadowsFrozen) {
      curtainSyncHandler?.();
    }
    televisionSyncHandler?.();
    if (needsSpotShadowRefresh && !stageRuntimeController.floorEffectsController.areShadowsFrozen) {
      if (
        shadowRefreshModelRoot !== state.previewModelRoot ||
        shadowRefreshSceneRevision !== state.sceneCacheRevision
      ) {
        shadowRefreshModelRoot = state.previewModelRoot;
        shadowRefreshSceneRevision = state.sceneCacheRevision;
        shadowCastingLights = [];
        curtainBoundsBoxes = [];
        state.previewModelRoot?.updateWorldMatrix(true, true);
        state.previewModelRoot?.traverse((shadowTraversedNode: any) => {
          if (shadowTraversedNode.userData?.environmentModelType === "curtain") {
            curtainBoundsBoxes.push(new threeModuleMin.Box3().setFromObject(shadowTraversedNode));
          }
        });
        state.previewOverlayScene.traverse((sceneLightNode: any) => {
          if (sceneLightNode.isLight && sceneLightNode.castShadow && sceneLightNode.shadow) {
            shadowCastingLights.push(sceneLightNode);
          }
        });
      }
      for (const shadowCastingLight of shadowCastingLights) {
        shadowCastingLight.shadow.needsUpdate = true;
      }
      state.contactShadowController?.invalidate(contactShadowFloorIds, true);
    }
    overlayOnBeforeRender?.apply(this, overlayRenderArguments);
    if (!stageRuntimeController.floorEffectsController.areShadowsFrozen) {
      stageRuntimeController.floorCacheController.environmentSceneController?.setRoot(
        state.previewModelRoot,
        state.sceneCacheRevision + ":" + state.environmentStructureKey
      );
      environmentAirflowController?.setRoot(state.previewModelRoot, state.sceneCacheRevision);
    }
    stageBackgroundController.applyBackgroundVisibility();
    stageRuntimeController.syncPreviewProjection();
    if (!state.renderer.getRenderTarget()) {
      stageRuntimeController.floorEffectsController.groundReflectionsController.render(overlayRenderArguments[2], {
        worldMatricesCurrent: true
      });
      const reflectionStatsJson = JSON.stringify({
        ...stageRuntimeController.floorEffectsController.groundReflectionsController.stats
      });
      if (state.renderer.domElement.dataset.reflectionStats !== reflectionStatsJson) {
        state.renderer.domElement.dataset.reflectionStats = reflectionStatsJson;
      }
    }
  };

  return {
    onCameraChange(cameraFrameListener: any) {
      const cameraFrameCanvas = state.renderer.domElement;
      cameraFrameCanvas.addEventListener("hb-i3d-camera-frame", cameraFrameListener);
      return () =>
        cameraFrameCanvas.removeEventListener("hb-i3d-camera-frame", cameraFrameListener);
    },
    createFrameLoop: (frameLoopOptions: any) => createDemandFrameLoop(frameLoopOptions),
    setPresentedVisible(isStagePresented: any) {
      state.renderer.domElement.dispatchEvent?.(
        new CustomEvent("hb-i3d-parent-visibility", {
          detail: isStagePresented === true
        })
      );
    },
    THREE: threeModuleMin,
    constrainCameraPose: constrainCameraPose,
    container: selectElement("#preview-3d"),
    canvas: state.renderer.domElement,
    get groundReflections() {
      return stageRuntimeController.floorEffectsController.groundReflectionsController;
    },
    invalidateReflections(reflectionChangeKey: any) {
      stageRuntimeController.floorEffectsController.groundReflectionsController.changed(reflectionChangeKey);
    },
    get modelRoot() {
      return state.previewModelRoot;
    },
    get overlayScene() {
      return state.previewOverlayScene;
    },
    get sceneRevision() {
      return state.sceneCacheRevision;
    },
    get environmentRevision() {
      return state.sceneCacheRevision + ":" + state.environmentStructureKey;
    },
    setEnvironmentScene(environmentSceneSync: any) {
      stageRuntimeController.floorCacheController.environmentSceneController = environmentSceneSync;
    },
    setEnvironmentAirflow(environmentAirflowSync: any) {
      environmentAirflowController = environmentAirflowSync;
    },
    setCurtainSync(curtainFrameSync: any) {
      curtainSyncHandler = curtainFrameSync;
    },
    setTelevisionSync(televisionFrameSync: any) {
      televisionSyncHandler = televisionFrameSync;
    },
    curtainFrame({
      key: nextCurtainFrameKey,
      structure: nextEnvironmentStructureKey,
      floorIds: movingCurtainFloorIds = [],
      moving: isCurtainMovingNow
    }: any) {
      const didCurtainFrameChange = nextCurtainFrameKey !== state.curtainFrameKey;
      const wasCurtainMoving = state.isCurtainMoving;
      if (!!didCurtainFrameChange || wasCurtainMoving !== isCurtainMovingNow) {
        if (didCurtainFrameChange) {
          try {
            const parseCurtainFrames = (serializedCurtainFrames: any) => {
              const curtainRowsByFloorId = new Map();
              for (const curtainFrameRow of JSON.parse(serializedCurtainFrames)) {
                const curtainRowFloorId = curtainFrameRow[1];
                if (!curtainRowsByFloorId.has(curtainRowFloorId)) {
                  curtainRowsByFloorId.set(curtainRowFloorId, []);
                }
                curtainRowsByFloorId.get(curtainRowFloorId).push(curtainFrameRow);
              }
              return curtainRowsByFloorId;
            };
            const previousCurtainRows = parseCurtainFrames(state.curtainFrameKey);
            const nextCurtainRows = parseCurtainFrames(nextCurtainFrameKey);
            stageRuntimeController.floorEffectsController.groundReflectionsController.changed(
              [...new Set([...previousCurtainRows.keys(), ...nextCurtainRows.keys()])].filter(
                changedCurtainFloorId =>
                  JSON.stringify(previousCurtainRows.get(changedCurtainFloorId)) !==
                  JSON.stringify(nextCurtainRows.get(changedCurtainFloorId))
              )
            );
          } catch {
            stageRuntimeController.floorEffectsController.groundReflectionsController.changed(movingCurtainFloorIds);
          }
        }
        if (nextEnvironmentStructureKey !== state.environmentStructureKey) {
          state.spotShadowAtlasController?.prepareRoot(state.previewModelRoot);
          state.regionLightController?.invalidate();
        }
        contactShadowFloorIds = [
          ...new Set([...previousCurtainFloorIds, ...movingCurtainFloorIds])
        ];
        previousCurtainFloorIds = movingCurtainFloorIds;
        if (didCurtainFrameChange || isCurtainMovingNow) {
          if (!wasCurtainMoving) {
            lightTransitionController.beginLightTransitionSession();
            lightTransitionController.syncLightTransitionSession(performance.now(), true);
          }
          if (didCurtainFrameChange) {
            needsSpotShadowRefresh = true;
          }
          state.lightCacheRevision += 1;
          state.needsLightCacheRefresh = true;
          setLightCacheVisible(false);
        }
        state.curtainFrameKey = nextCurtainFrameKey;
        state.isCurtainMoving = isCurtainMovingNow;
        state.environmentStructureKey = nextEnvironmentStructureKey;
        if (!isCurtainMovingNow) {
          lightTransitionController.endLightTransitionSession();
        }
        requestRenderFrame();
      }
    },
    requestRender() {
      invalidateRender({
        preserveLightCache: true
      });
    },
    setBackgroundTheme(backgroundThemeSyncController: any) {
      stageBackgroundController.backgroundThemeController = backgroundThemeSyncController;
      stageBackgroundController.applyBackgroundVisibility();
    },
    backgroundFrame(isBackgroundFrameShown: any) {
      const shouldShowBackground = isBackgroundFrameShown === true;
      if (shouldShowBackground !== state.isBackgroundFrameVisible) {
        state.isBackgroundFrameVisible = shouldShowBackground;
        if (!isRegionLightingEnabled) {
          if (shouldShowBackground) {
            lightTransitionController.beginLightTransitionSession();
            lightTransitionController.syncLightTransitionSession(performance.now(), true);
          } else {
            state.lightCacheRevision++;
            state.needsLightCacheRefresh = true;
            lightTransitionController.endLightTransitionSession();
          }
        }
      }
      requestRenderFrame();
    },
    setVacuumMoving(isVacuumMovingRequested: any) {
      const shouldVacuumMove = isVacuumMovingRequested === true;
      if (shouldVacuumMove !== state.isVacuumMoving) {
        state.isVacuumMoving = shouldVacuumMove;
        if (shouldVacuumMove) {
          lightTransitionController.beginLightTransitionSession();
          lightTransitionController.syncLightTransitionSession(performance.now(), true);
        } else {
          state.lightCacheRevision++;
          state.needsLightCacheRefresh = true;
          lightTransitionController.endLightTransitionSession();
        }
        requestRenderFrame();
      }
    },
    environmentModelPose(poseFloorId: any, poseModelId: any) {
      let environmentModelRoot: any;
      state.previewModelRoot?.traverse((poseSceneNode: any) => {
        if (
          poseSceneNode.userData?.environmentFloorId === poseFloorId &&
          poseSceneNode.userData?.environmentModelId === poseModelId
        ) {
          environmentModelRoot = poseSceneNode;
        }
      });
      if (!environmentModelRoot) {
        return null;
      }
      environmentModelRoot = environmentModelRoot.userData.vacuumMobileRoot || environmentModelRoot;
      environmentModelRoot.updateWorldMatrix(true, true);
      const environmentModelBounds = new threeModuleMin.Box3();
      const environmentMeshBounds = new threeModuleMin.Box3();
      environmentModelRoot.traverse((boundsMeshNode: any) => {
        if (!!boundsMeshNode.isMesh && !!boundsMeshNode.geometry) {
          for (
            let boundsAncestorNode = boundsMeshNode;
            boundsAncestorNode && boundsAncestorNode !== environmentModelRoot;
            boundsAncestorNode = boundsAncestorNode.parent
          ) {
            if (boundsAncestorNode.userData?.environmentEffect) {
              return;
            }
          }
          boundsMeshNode.geometry.computeBoundingBox();
          if (boundsMeshNode.geometry.boundingBox) {
            environmentModelBounds.union(
              environmentMeshBounds
                .copy(boundsMeshNode.geometry.boundingBox)
                .applyMatrix4(boundsMeshNode.matrixWorld)
            );
          }
        }
      });
      if (environmentModelBounds.isEmpty()) {
        return null;
      } else {
        return {
          center: environmentModelBounds.getCenter(new threeModuleMin.Vector3()).toArray(),
          size: environmentModelBounds.getSize(new threeModuleMin.Vector3()).toArray(),
          forward: new threeModuleMin.Vector3(0, 0, 1)
            .transformDirection(environmentModelRoot.matrixWorld)
            .toArray()
        };
      }
    },
    setEnvironmentActive(isEnvironmentActiveRequested: any) {
      const shouldEnvironmentActivate = isEnvironmentActiveRequested === true;
      if (shouldEnvironmentActivate !== state.isEnvironmentActive) {
        if (shouldEnvironmentActivate) {
          lightTransitionController.beginLightTransitionSession();
          lightTransitionController.syncLightTransitionSession(performance.now(), true);
        }
        state.isEnvironmentActive = shouldEnvironmentActivate;
        if (!shouldEnvironmentActivate) {
          lightTransitionController.endLightTransitionSession();
        }
        invalidateRender();
      }
    },
    pickEnvironmentModel(
      pickClientX: any,
      pickClientY: any,
      pickModelReferences: any = [],
      requestedSampleRadiusPx = 0
    ) {
      if (!state.previewModelRoot || !pickModelReferences.length) {
        return null;
      }
      const pickCanvasRect = state.renderer.domElement.getBoundingClientRect();
      if (!pickCanvasRect.width || !pickCanvasRect.height) {
        return null;
      }
      const pickModelKeys = new Set(
        pickModelReferences.map((pickModelReference: any) =>
          JSON.stringify([pickModelReference.floorId, pickModelReference.modelId])
        )
      );
      const pickModelReferenceByMesh = new Map();
      const pickCandidateMeshes: any = [];
      const curtainPanelModelKeys = new Set();
      state.previewModelRoot.updateWorldMatrix(true, true);
      state.previewCamera.updateMatrixWorld();
      state.previewModelRoot.traverse((pickMeshNode: any) => {
        if (!pickMeshNode.isMesh) {
          return;
        }
        let pickedModelReference = null;
        for (
          let pickAncestorNode = pickMeshNode;
          pickAncestorNode;
          pickAncestorNode = pickAncestorNode.parent
        ) {
          if (!pickAncestorNode.visible || pickAncestorNode.userData?.environmentEffect) {
            return;
          }
          if (!pickedModelReference && pickAncestorNode.userData?.environmentModelId) {
            pickedModelReference = {
              modelId: pickAncestorNode.userData.environmentModelId,
              floorId: pickAncestorNode.userData.environmentFloorId
            };
          }
        }
        if (
          !!pickedModelReference &&
          !!pickModelKeys.has(
            JSON.stringify([pickedModelReference.floorId, pickedModelReference.modelId])
          ) &&
          !!(
            Array.isArray(pickMeshNode.material) ? pickMeshNode.material : [pickMeshNode.material]
          ).some(
            (pickMeshMaterial: any) =>
              pickMeshMaterial &&
              pickMeshMaterial.visible !== false &&
              pickMeshMaterial.opacity !== 0
          )
        ) {
          pickModelReferenceByMesh.set(pickMeshNode, pickedModelReference);
          pickCandidateMeshes.push(pickMeshNode);
          if (pickMeshNode.userData?.curtainMotionPanel) {
            curtainPanelModelKeys.add(
              JSON.stringify([pickedModelReference.floorId, pickedModelReference.modelId])
            );
          }
        }
      });
      const pickableMeshes = pickCandidateMeshes.filter((pickableMeshNode: any) => {
        const pickableModelReference = pickModelReferenceByMesh.get(pickableMeshNode);
        return (
          !curtainPanelModelKeys.has(
            JSON.stringify([pickableModelReference.floorId, pickableModelReference.modelId])
          ) || pickableMeshNode.userData?.curtainMotionPanel
        );
      });
      const pickRaycaster = new threeModuleMin.Raycaster();
      const clampedSampleRadiusPx = Math.max(0, Math.min(12, requestedSampleRadiusPx));
      const pointerSampleOffsets = [
        [0, 0],
        ...(clampedSampleRadiusPx
          ? [
              [clampedSampleRadiusPx, 0],
              [-clampedSampleRadiusPx, 0],
              [0, clampedSampleRadiusPx],
              [0, -clampedSampleRadiusPx],
              [clampedSampleRadiusPx * 0.7, clampedSampleRadiusPx * 0.7],
              [-clampedSampleRadiusPx * 0.7, clampedSampleRadiusPx * 0.7],
              [clampedSampleRadiusPx * 0.7, -clampedSampleRadiusPx * 0.7],
              [-clampedSampleRadiusPx * 0.7, -clampedSampleRadiusPx * 0.7]
            ]
          : [])
      ];
      const pickMeshesByFloorId = new Map();
      for (const pickFloorMesh of pickableMeshes) {
        const pickMeshFloorId = pickModelReferenceByMesh.get(pickFloorMesh).floorId;
        if (!pickMeshesByFloorId.has(pickMeshFloorId)) {
          pickMeshesByFloorId.set(pickMeshFloorId, []);
        }
        pickMeshesByFloorId.get(pickMeshFloorId).push(pickFloorMesh);
      }
      for (const [sampleOffsetX, sampleOffsetY] of pointerSampleOffsets) {
        const samplePointerNdc = new threeModuleMin.Vector2(
          ((pickClientX + sampleOffsetX - pickCanvasRect.left) / pickCanvasRect.width) * 2 - 1,
          1 - ((pickClientY + sampleOffsetY - pickCanvasRect.top) / pickCanvasRect.height) * 2
        );
        let nearestPickHit = null;
        for (const [hitFloorId, hitFloorMeshes] of pickMeshesByFloorId) {
          if (state.overviewStackController) {
            state.overviewStackController.rayForFloor(hitFloorId, samplePointerNdc, pickRaycaster);
          } else {
            pickRaycaster.setFromCamera(samplePointerNdc, state.previewCamera);
          }
          for (const pickIntersection of pickRaycaster.intersectObjects(hitFloorMeshes, false)) {
            const pickHitMaterial = Array.isArray(pickIntersection.object.material)
              ? pickIntersection.object.material[pickIntersection.face?.materialIndex || 0]
              : pickIntersection.object.material;
            if (
              pickHitMaterial?.visible !== false &&
              pickHitMaterial?.opacity !== 0 &&
              (!nearestPickHit || pickIntersection.distance < nearestPickHit.distance)
            ) {
              nearestPickHit = pickIntersection;
            }
          }
        }
        if (nearestPickHit) {
          return pickModelReferenceByMesh.get(nearestPickHit.object);
        }
      }
      return null;
    },
    get camera() {
      return state.previewCamera;
    },
    presentationCamera(cameraFloorOrObject: any) {
      if (typeof cameraFloorOrObject != "string") {
        for (
          let cameraAncestorNode = cameraFloorOrObject;
          cameraAncestorNode;
          cameraAncestorNode = cameraAncestorNode.parent
        ) {
          const cameraObjectFloorId =
            cameraAncestorNode.userData?.floorId ||
            cameraAncestorNode.userData?.environmentFloorId ||
            cameraAncestorNode.userData?.regionFloorId;
          if (cameraObjectFloorId) {
            cameraFloorOrObject = String(cameraObjectFloorId);
            break;
          }
        }
      }
      return state.overviewStackController?.cameraForFloor(cameraFloorOrObject) || state.previewCamera;
    },
    presentationRay(presentationRayFloorId: any, presentationRayNdc: any, presentationRaycaster: any) {
      if (state.overviewStackController) {
        return state.overviewStackController.rayForFloor(
          presentationRayFloorId,
          presentationRayNdc,
          presentationRaycaster
        );
      } else {
        presentationRaycaster.setFromCamera(presentationRayNdc, state.previewCamera);
        return presentationRaycaster;
      }
    },
    get controls() {
      return state.orbitControls;
    },
    get document() {
      return state.studioDocument;
    },
    get defaults() {
      return DEFAULT_BASE_LIGHTING;
    },
    get regionLighting() {
      return state.regionLightController;
    },
    invalidateRegionLighting() {
      state.regionLightController?.sync(state.previewCamera);
      requestRenderFrame();
    },
    transformCamera(transformedCameraState: any, transformedFloorId: any, shouldSwapProject = false) {
      return transformSceneCamera(
        transformedCameraState,
        referenceProjectDocument,
        state.studioDocument,
        transformedFloorId,
        shouldSwapProject
      );
    },
    async readSceneUpdate(sceneSyncAbortSignal: any) {
      const pageQueryParams = new URLSearchParams(window.location.search);
      const sceneSyncQueryParams = new URLSearchParams({
        projectId: pageQueryParams.get("projectId") || "",
        since: state.savedSceneRecord.syncKey || ""
      });
      const sceneSyncResponse = await withRequestTimeout(
        SCENE_REQUEST_TIMEOUT_MS,
        async sceneSyncSignal => {
          const sceneSyncHttpResponse = await fetch(
            "/api/v1/modules/interaction3d/scenes/" +
              encodeURIComponent(pageQueryParams.get("sceneId") || "") +
              "/current?" +
              sceneSyncQueryParams,
            {
              credentials: "same-origin",
              signal: sceneSyncSignal
            }
          );
          if (sceneSyncHttpResponse.status === 204) {
            return null;
          }
          if (!sceneSyncHttpResponse.ok) {
            throw new Error("户型同步暂时不可用");
          }
          return sceneSyncHttpResponse.json();
        },
        sceneSyncAbortSignal
      );
      if (!sceneSyncResponse) {
        return null;
      }
      const incomingUpdatePlan = sceneUpdatePlan(
        normalizeStudioDocument(state.savedSceneRecord.scene),
        normalizeStudioDocument(sceneSyncResponse.scene)
      );
      if (!incomingUpdatePlan.full && !incomingUpdatePlan.floors.length) {
        const incomingStudioDocument = normalizeStudioDocument(sceneSyncResponse.scene);
        state.studioDocument.baseLighting = incomingStudioDocument.baseLighting;
        for (const incomingFloorSummary of incomingStudioDocument.floors) {
          const matchingFloorRecord = state.studioDocument.floors.find(
            (matchedFloorSummary: any) => matchedFloorSummary.id === incomingFloorSummary.id
          );
          if (matchingFloorRecord) {
            matchingFloorRecord.name = incomingFloorSummary.name;
          }
        }
        if (incomingUpdatePlan.lighting && !isBaseLightingPreviewActive) {
          stageRuntimeController.floorCacheController.releaseFloorCache();
          applyBaseLightingSettings(incomingStudioDocument.baseLighting);
        }
        state.savedSceneRecord = sceneSyncResponse;
        return null;
      }
      return sceneSyncResponse;
    },
    get savedScene() {
      return state.savedSceneRecord;
    },
    async replaceScene(replacementStudioRecord: any) {
      const replacementDocument = normalizeStudioDocument(replacementStudioRecord.scene);
      const replacementPlan = sceneUpdatePlan(
        normalizeStudioDocument(state.savedSceneRecord.scene),
        replacementDocument
      );
      stageRuntimeController.floorTransitionController.finish();
      stageRuntimeController.floorCacheController.releaseFloorCache(
        replacementPlan.full || replacementPlan.lighting ? null : new Set(replacementPlan.floors)
      );
      lightTransitionController.teardownLightTransitions();
      presentedPromise = null;
      stageRuntimeController.orbitPivotOverride = null;
      stageRuntimeController.boundsCacheModelRoot = null;
      stageRuntimeController.boundsCacheSceneRevision = undefined;
      stageRuntimeController.boundsCacheCenter = null;
      lightTransitionController.hasReceivedLightStates = false;
      lightTransitionController.forceLightStateRefresh = true;
      stageBackgroundController.backgroundThemeModelRoot = null;
      stageBackgroundController.backgroundThemeFirstChild = null;
      if (!replacementPlan.full) {
        replacementDocument.activeFloorId = state.activeFloorId;
        replacementDocument.previewFloorMode = state.studioDocument.previewFloorMode;
        for (const replacementFloorEntry of replacementDocument.floors) {
          replacementFloorEntry.scene.settings.livePreviewEnabled = true;
          const existingFloorEntry = state.studioDocument.floors.find(
            (existingFloorMatch: any) => existingFloorMatch.id === replacementFloorEntry.id
          );
          if (existingFloorEntry && !replacementPlan.floors.includes(replacementFloorEntry.id)) {
            for (const replacementLightGroup of replacementFloorEntry.scene.lightGroups) {
              const existingLightGroupEntry = existingFloorEntry.scene.lightGroups.find(
                (existingLightGroupMatch: any) => existingLightGroupMatch.id === replacementLightGroup.id
              );
              if (existingLightGroupEntry) {
                replacementLightGroup.enabled = existingLightGroupEntry.enabled;
              }
            }
            for (const replacementLightItem of replacementFloorEntry.scene.items) {
              if (!LIGHT_ITEM_TYPES.has(replacementLightItem.type)) {
                continue;
              }
              const existingLightItemEntry = existingFloorEntry.scene.items.find(
                (existingLightItemMatch: any) => existingLightItemMatch.id === replacementLightItem.id
              );
              if (existingLightItemEntry) {
                replacementLightItem.lightBrightness = existingLightItemEntry.lightBrightness;
                replacementLightItem.lightTemperature = existingLightItemEntry.lightTemperature;
              }
            }
          }
        }
        state.studioDocument = replacementDocument;
        state.savedSceneRecord = replacementStudioRecord;
        if (uniformOverviewStackOverride !== undefined) {
          state.studioDocument.uniformOverviewStack = uniformOverviewStackOverride;
        }
        state.activeScene = getCurrentFloor().scene;
        switchPreviewFloor(new Set(replacementPlan.floors));
        Promise.allSettled(releaseAllDeferredModels());
        return;
      }
      await loadStudioRecord(replacementStudioRecord);
      await new Promise(requestAnimationFrame);
      await new Promise(requestAnimationFrame);
      if (uniformOverviewStackOverride !== undefined) {
        state.studioDocument.uniformOverviewStack = uniformOverviewStackOverride;
      }
    },
    coverSceneUpdate() {
      const sceneCoverCanvas = document.createElement("canvas");
      sceneCoverCanvas.width = state.renderer.domElement.width;
      sceneCoverCanvas.height = state.renderer.domElement.height;
      state.renderer.render(state.previewOverlayScene, state.previewCamera);
      const sceneCoverContext: any = sceneCoverCanvas.getContext("2d");
      sceneCoverContext.drawImage(state.renderer.domElement, 0, 0);
      if (!lightCacheCanvasElement.hidden) {
        sceneCoverContext.drawImage(
          lightCacheCanvasElement,
          0,
          0,
          sceneCoverCanvas.width,
          sceneCoverCanvas.height
        );
      }
      const rendererCanvasVisibility = state.renderer.domElement.style.visibility;
      const lightCacheCanvasVisibility = lightCacheCanvasElement.style.visibility;
      state.renderer.domElement.style.visibility = "hidden";
      lightCacheCanvasElement.style.visibility = "hidden";
      Object.assign(sceneCoverCanvas.style, {
        position: "absolute",
        inset: "0",
        width: "100%",
        height: "100%",
        zIndex: "6",
        pointerEvents: "auto"
      });
      sceneCoverCanvas.setAttribute("aria-label", "正在同步户型");
      selectElement("#preview-3d").append(sceneCoverCanvas);
      return () => {
        state.renderer.domElement.style.visibility = rendererCanvasVisibility;
        lightCacheCanvasElement.style.visibility = lightCacheCanvasVisibility;
        sceneCoverCanvas.remove();
      };
    },
    getOrbitCenter() {
      return stageRuntimeController.resolveOrbitCenter(state.orbitControls.target).toArray();
    },
    setOrbitPivot(orbitPivotPoint: any) {
      stageRuntimeController.orbitPivotOverride = orbitPivotPoint
        ? new threeModuleMin.Vector3().fromArray(orbitPivotPoint)
        : null;
      stageRuntimeController.installOrbitControlsOverrides();
    },
    orbitCameraPose(sourceCameraPose: any, pivotRotationRad: any) {
      const rotatedCameraPose = structuredClone(sourceCameraPose);
      const normalizedRotationRad = finite(pivotRotationRad, 0) % (Math.PI * 2);
      if (
        Math.abs(normalizedRotationRad) < 1e-12 ||
        Math.abs(Math.abs(normalizedRotationRad) - Math.PI * 2) < 1e-12
      ) {
        return rotatedCameraPose;
      }
      stageRuntimeController.orbitPivotOverride ||= stageRuntimeController.resolveOrbitCenter(
        new threeModuleMin.Vector3().fromArray(sourceCameraPose.target)
      );
      const orbitRotationQuaternion = new threeModuleMin.Quaternion().setFromAxisAngle(
        new threeModuleMin.Vector3(0, 1, 0),
        normalizedRotationRad
      );
      for (const poseFieldName of ["position", "target"]) {
        rotatedCameraPose[poseFieldName] = new threeModuleMin.Vector3()
          .fromArray(sourceCameraPose[poseFieldName])
          .sub(stageRuntimeController.orbitPivotOverride)
          .applyQuaternion(orbitRotationQuaternion)
          .add(stageRuntimeController.orbitPivotOverride)
          .toArray();
      }
      let poseUpVector = new threeModuleMin.Vector3().fromArray(sourceCameraPose.up || [0, 1, 0]);
      const poseViewDirection = new threeModuleMin.Vector3()
        .fromArray(sourceCameraPose.position)
        .sub(new threeModuleMin.Vector3().fromArray(sourceCameraPose.target));
      if (
        poseUpVector.lengthSq() < 1e-12 ||
        poseUpVector.clone().cross(poseViewDirection).lengthSq() < 1e-12
      ) {
        const poseTopRotationRad = threeModuleMin.MathUtils.degToRad(
          finite(sourceCameraPose.topRotation, 0)
        );
        poseUpVector = new threeModuleMin.Vector3(
          Math.sin(poseTopRotationRad),
          0,
          -Math.cos(poseTopRotationRad)
        );
        if (poseUpVector.clone().cross(poseViewDirection).lengthSq() < 1e-12) {
          poseUpVector.set(1, 0, 0);
        }
      }
      rotatedCameraPose.up = poseUpVector.applyQuaternion(orbitRotationQuaternion).toArray();
      return rotatedCameraPose;
    },
    setFocusViewport(focusViewportValue: any) {
      const clampedFocusViewport = clamp(finite(focusViewportValue, 0), 0, 0.7);
      if (clampedFocusViewport !== stageRuntimeController.focusViewportRatio) {
        stageRuntimeController.focusViewportRatio = clampedFocusViewport;
        stageRuntimeController.syncPreviewProjection();
        invalidateRender({
          preserveLightCache: false
        });
      }
    },
    beginCameraMotion(blendCameraMode: any, blendCameraPose: any, motionPhaseKind = "focus") {
      stageRuntimeController.floorEffectsController.motionPresentation.camera(!!blendCameraPose, {
        live: motionPhaseKind === "focus"
      });
      const poseBeforeMotion = this.cameraState();
      const shouldBlendProjection =
        blendCameraPose && (stageRuntimeController.cameraBlendState || poseBeforeMotion.mode !== blendCameraMode);
      const blendFromHeight = shouldBlendProjection
        ? (stageRuntimeController.cameraBlendState?.height ?? measureVisibleHeight(state.previewCamera, state.orbitControls.target))
        : 0;
      const blendFromWeight =
        stageRuntimeController.cameraBlendState?.weight ?? (poseBeforeMotion.mode === "perspective" ? 1 : 0);
      stageRuntimeController.cameraBlendState = null;
      isCameraMotionRunning = true;
      isControlInteractionActive = false;
      if (isAdaptiveLightCacheEnabled()) {
        lightTransitionController.beginLightTransitionSession();
        lightTransitionController.syncLightTransitionSession(performance.now());
        applyShadowBudget(state.previewModelRoot, {
          rebuildAtlas: false
        });
        requestRenderFrame();
      }
      applyCameraMode(blendCameraMode, {
        preserveView: true,
        deferControlUpdate: true
      });
      stageRuntimeController.recreateOrbitControls();
      stageRuntimeController.installOrbitControlsOverrides();
      startCameraMotion();
      if (shouldBlendProjection) {
        stageRuntimeController.cameraBlendState = {
          fromHeight: blendFromHeight,
          toHeight: stageRuntimeController.measurePoseVisibleHeight(blendCameraPose),
          height: blendFromHeight,
          fromWeight: blendFromWeight,
          toWeight: blendCameraMode === "perspective" ? 1 : 0,
          weight: blendFromWeight
        };
        return poseBeforeMotion;
      } else {
        return this.cameraState();
      }
    },
    applyCameraFrame(frameCameraPose: any, frameProgress: any, frameFocusViewport: any) {
      const frameFocusViewportValue = clamp(finite(frameFocusViewport, 0), 0, 0.7);
      const isFocusViewportUnchanged = frameFocusViewportValue === stageRuntimeController.focusViewportRatio;
      stageRuntimeController.focusViewportRatio = frameFocusViewportValue;
      this.applyCameraPose(frameCameraPose, frameProgress, isFocusViewportUnchanged);
      stageRuntimeController.floorEffectsController.motionPresentation.advance(frameProgress);
    },
    applyCameraPose(appliedCameraPose: any, appliedProgress = 1, applyPreserveLightCache = true) {
      appliedCameraPose = constrainCameraPose(appliedCameraPose);
      if (stageRuntimeController.cameraBlendState) {
        if (appliedProgress >= 1) {
          stageRuntimeController.cameraBlendState = null;
        } else {
          stageRuntimeController.cameraBlendState.height =
            stageRuntimeController.cameraBlendState.fromHeight +
            (stageRuntimeController.cameraBlendState.toHeight - stageRuntimeController.cameraBlendState.fromHeight) * appliedProgress;
          stageRuntimeController.cameraBlendState.weight =
            stageRuntimeController.cameraBlendState.fromWeight +
            (stageRuntimeController.cameraBlendState.toWeight - stageRuntimeController.cameraBlendState.fromWeight) * appliedProgress;
        }
      }
      handleCameraMotionMoved();
      const activeCameraSettings = cameraSettingsSource();
      activeCameraSettings.cameraView = appliedCameraPose.view || "free";
      activeCameraSettings.cameraTopRotation = appliedCameraPose.topRotation || 0;
      activeCameraSettings.cameraFocalLength = appliedCameraPose.focalLength || 50;
      state.previewCamera.position.fromArray(appliedCameraPose.position);
      state.orbitControls.target.fromArray(appliedCameraPose.target);
      state.previewCamera.up.fromArray(appliedCameraPose.up || [0, 1, 0]);
      state.previewCamera.zoom = appliedCameraPose.zoom;
      state.previewCamera.userData.frameSize = appliedCameraPose.frameSize || 10;
      state.previewCamera.userData.cameraView = activeCameraSettings.cameraView;
      state.previewCamera.userData.topRotation = activeCameraSettings.cameraTopRotation;
      if (state.previewCamera.isOrthographicCamera) {
        applyOrthographicFrame(
          state.previewCamera.userData.frameSize,
          state.previewCamera.userData.viewportAspect || 1
        );
      } else {
        applyFocalLength();
      }
      state.previewCamera.lookAt(state.orbitControls.target);
      updateCameraClipPlanes(state.previewCamera, state.orbitControls.target);
      state.previewCamera.updateMatrixWorld();
      stageRuntimeController.syncPreviewProjection();
      invalidateRender({
        preserveLightCache: applyPreserveLightCache
      });
    },
    endCameraMotion() {
      stageRuntimeController.floorEffectsController.motionPresentation.camera(false);
      isCameraMotionRunning = false;
      stageRuntimeController.recreateOrbitControls();
      finishCameraMotion();
      invalidateRender();
      if (
        typeof state.lightTransitionSession !== "undefined" &&
        state.lightTransitionSession === lightTransitionController.lightTransitionSessionToken &&
        !lightTransitionController.lightTransitionsByLight.size
      ) {
        if (lightTransitionController.lightSettleTimeoutHandle !== null) {
          window.clearTimeout(lightTransitionController.lightSettleTimeoutHandle);
        }
        lightTransitionController.lightSettleTimeoutHandle = window.setTimeout(lightTransitionController.endLightTransitionSession, 180);
      }
    },
    setUniformOverviewStack(uniformOverviewStackFlag: any) {
      uniformOverviewStackOverride =
        typeof uniformOverviewStackFlag == "boolean" ? uniformOverviewStackFlag : undefined;
      const nextUniformOverviewStackFlag =
        uniformOverviewStackOverride ?? state.savedSceneRecord.scene.uniformOverviewStack === true;
      if (state.studioDocument.uniformOverviewStack !== nextUniformOverviewStackFlag) {
        this.finishFloorTransition();
        state.studioDocument.uniformOverviewStack = nextUniformOverviewStackFlag;
        stageRuntimeController.orbitPivotOverride = null;
        stageRuntimeController.boundsCacheModelRoot = null;
        stageRuntimeController.floorEffectsController.groundReflectionsController.changed();
        invalidateRender({
          scene: true
        });
      }
    },
    setFloorGap(floorGapValue: any) {
      const clampedFloorGapOrNull = Number.isFinite(floorGapValue)
        ? clamp(floorGapValue, 0, 20)
        : null;
      if (clampedFloorGapOrNull !== null || lastRequestedFloorGap !== null) {
        const appliedFloorGapValue =
          clampedFloorGapOrNull ?? normalizeStudioDocument(state.savedSceneRecord.scene).previewFloorGap;
        if (Math.abs(state.studioDocument.previewFloorGap - appliedFloorGapValue) > 0.000001) {
          stageRuntimeController.floorTransitionController.finish();
          const isOverviewFloorMode = currentPreviewFloorMode() === "all";
          const detachedFloorRecords = isOverviewFloorMode
            ? stageRuntimeController.floorTransitionController.take(
                state.studioDocument.floors.map((gapFloorId: any) => gapFloorId.id),
                floorWorldMatrix,
                true
              )
            : [];
          try {
            state.studioDocument.previewFloorGap = appliedFloorGapValue;
            for (const reusedFloorRecord of detachedFloorRecords) {
              stageRuntimeController.floorTransitionController.reuse(
                reusedFloorRecord,
                floorWorldMatrix(reusedFloorRecord.id)
              );
            }
          } finally {
            if (isOverviewFloorMode) {
              stageRuntimeController.floorEffectsController.suspendFloorEffects(false);
            }
          }
          if (isOverviewFloorMode) {
            stageRuntimeController.orbitPivotOverride = null;
            stageRuntimeController.boundsCacheModelRoot = null;
            fitDirectionalShadowCamera();
            invalidateRender({
              scene: true,
              shadows: true
            });
          }
        }
      }
      lastRequestedFloorGap = clampedFloorGapOrNull;
    },
    appearance(appearanceOptions: any) {
      // 材质风格与墙体透明度会整体换掉墙面 / 地板 / 门窗 / 灯光的着色方式，
      const nextSceneStyle =
        appearanceOptions.sceneStyle === "warm-wood" ? "warm-wood" : "default";
      const nextWallOpacityOverride =
        typeof appearanceOptions.wallOpacity == "number" &&
        Number.isFinite(appearanceOptions.wallOpacity)
          ? clamp(appearanceOptions.wallOpacity, 0, 1)
          : null;
      if (
        nextSceneStyle !== state.studioSceneStyle ||
        nextWallOpacityOverride !== state.wallOpacityOverride
      ) {
        this.finishFloorTransition();
        stageRuntimeController.floorCacheController.releaseFloorCache();
        const poseBeforeStyleChange = this.cameraState();
        state.studioSceneStyle = nextSceneStyle;
        state.wallOpacityOverride = nextWallOpacityOverride;
        rebuildPreviewScene();
        this.restoreCamera(poseBeforeStyleChange);
      }
      const nextAppearanceSignature = JSON.stringify([
        appearanceOptions.baseLighting,
        appearanceOptions.lightingMode,
        appearanceOptions.lightRegionOverrides,
        nextSceneStyle,
        nextWallOpacityOverride
      ]);
      if (nextAppearanceSignature !== appearanceSignature) {
        stageRuntimeController.floorCacheController.releaseFloorCache();
        appearanceSignature = nextAppearanceSignature;
        stageRuntimeController.floorEffectsController.groundReflectionsController.changed();
      }
      if (stageRuntimeController.floorEffectsController.groundReflectionsController.configure(appearanceOptions.groundReflection)) {
        state.groundReflectionSettingsKey = JSON.stringify(stageRuntimeController.floorEffectsController.groundReflectionsController.settings);
        invalidateRender();
      }
      state.regionLightController?.setOverrides(appearanceOptions.lightRegionOverrides || {});
      isBaseLightingPreviewActive = !!appearanceOptions.baseLighting;
      const nextRenderScale = clamp(finite(appearanceOptions.renderScale, 1), 0.25, 2);
      const nextMotionRenderScale =
        typeof appearanceOptions.motionRenderScale == "number" &&
        Number.isFinite(appearanceOptions.motionRenderScale)
          ? clamp(appearanceOptions.motionRenderScale, 0.25, 1)
          : null;
      if (nextRenderScale !== state.renderScale || nextMotionRenderScale !== state.motionRenderScale) {
        state.renderScale = nextRenderScale;
        state.motionRenderScale = nextMotionRenderScale;
        state.renderer.setPixelRatio(targetPixelRatio(state.isCameraMotionActive));
        handleStageResize();
        invalidateRender();
      }
      // 画布默认透明：缺字段（老实例 / 未设置）一律当作不画背景，只有显式 true 才显示。
      const nextBackgroundVisible = appearanceOptions.backgroundVisible === true;
      const backgroundVisibilityChanged = stageBackgroundController.isBackgroundVisible !== nextBackgroundVisible;
      const nextBackgroundThemeName = stageBackgroundController.backgroundThemeController?.theme || "grid";
      const backgroundThemeNameChanged = state.backgroundTheme !== nextBackgroundThemeName;
      state.backgroundTheme = nextBackgroundThemeName;
      stageBackgroundController.isBackgroundVisible = nextBackgroundVisible;
      document.body.classList.toggle("is-background-hidden", !stageBackgroundController.isBackgroundVisible);
      stageBackgroundController.applyBackgroundVisibility();
      const nextBaseLightingState = normalizeBaseLighting(
        appearanceOptions.baseLighting || state.studioDocument.baseLighting
      );
      if (state.regionLightController?.setFloorBrightness(nextBaseLightingState.floorBrightness)) {
        invalidateRender();
      }
      if (JSON.stringify(nextBaseLightingState) !== JSON.stringify(state.baseLighting)) {
        applyBaseLightingSettings(nextBaseLightingState);
      }
      if (backgroundVisibilityChanged || backgroundThemeNameChanged) {
        invalidateRender();
      }
    },
    floorDefaultCamera(defaultCameraFloorId: any) {
      const savedFloorCameraView =
        defaultCameraFloorId === "all"
          ? referenceProjectDocument?.combinedFixedCameraView
          : referenceProjectDocument?.floors.find(
              (defaultCameraFloorEntry: any) => defaultCameraFloorEntry.id === defaultCameraFloorId
            )?.scene.settings?.fixedCameraView;
      if (!savedFloorCameraView) {
        return null;
      }
      const defaultCameraPose: any = {
        mode: savedFloorCameraView.mode,
        view: savedFloorCameraView.view,
        topRotation: savedFloorCameraView.topRotation,
        position: [
          savedFloorCameraView.position.x,
          savedFloorCameraView.position.y,
          savedFloorCameraView.position.z
        ],
        target: [
          savedFloorCameraView.target.x,
          savedFloorCameraView.target.y,
          savedFloorCameraView.target.z
        ],
        zoom: 1,
        frameSize: savedFloorCameraView.visibleHeight,
        focalLength: savedFloorCameraView.focalLength || 50
      };
      return transformSceneCamera(
        defaultCameraPose,
        referenceProjectDocument,
        state.studioDocument,
        defaultCameraFloorId
      );
    },
    get floorTransitionActive() {
      return stageRuntimeController.floorTransitionController.active;
    },
    advanceFloorTransition(motionProgress: any, floorMotionPose: any) {
      if (overviewStackAnimation) {
        state.overviewStackAmount =
          overviewStackAnimation.from +
          (overviewStackAnimation.to - overviewStackAnimation.from) * motionProgress;
      }
      const floorMotionSample = floorMotionPose
        ? {
            height: stageRuntimeController.cameraBlendState
              ? stageRuntimeController.cameraBlendState.fromHeight +
                (stageRuntimeController.cameraBlendState.toHeight - stageRuntimeController.cameraBlendState.fromHeight) * motionProgress
              : stageRuntimeController.measurePoseVisibleHeight(floorMotionPose),
            weight: stageRuntimeController.cameraBlendState
              ? stageRuntimeController.cameraBlendState.fromWeight +
                (stageRuntimeController.cameraBlendState.toWeight - stageRuntimeController.cameraBlendState.fromWeight) * motionProgress
              : floorMotionPose.mode === "perspective"
                ? 1
                : 0,
            distance: new threeModuleMin.Vector3()
              .fromArray(floorMotionPose.position)
              .distanceTo(new threeModuleMin.Vector3().fromArray(floorMotionPose.target))
          }
        : null;
      stageRuntimeController.floorTransitionController.sample(motionProgress, floorMotionPose, floorMotionSample);
      if (motionProgress >= 1) {
        overviewStackAnimation = null;
        state.overviewStackAmount = null;
      }
    },
    setFloorSlideCameras(slideFromPose: any, slideToPose: any) {
      /**
       * 量出某台机位的相机到目标点的直线距离。
       * @param {object} measuredPose 机位（position / target 为三元数组）。
       * @returns {number} 相机到目标的距离（米）。
       */
      const poseCameraDistance = (measuredPose: any) =>
        new threeModuleMin.Vector3()
          .fromArray(measuredPose.position)
          .distanceTo(new threeModuleMin.Vector3().fromArray(measuredPose.target));
      stageRuntimeController.floorTransitionController.setSlideCameras(slideFromPose, slideToPose, {
        from: {
          height: stageRuntimeController.cameraBlendState?.fromHeight ?? stageRuntimeController.measurePoseVisibleHeight(slideFromPose),
          weight: stageRuntimeController.cameraBlendState?.fromWeight ?? (slideFromPose.mode === "perspective" ? 1 : 0),
          distance: poseCameraDistance(slideFromPose)
        },
        to: {
          height: stageRuntimeController.measurePoseVisibleHeight(slideToPose),
          weight: slideToPose.mode === "perspective" ? 1 : 0,
          distance: poseCameraDistance(slideToPose)
        }
      });
    },
    finishFloorTransition() {
      stageRuntimeController.floorTransitionController.finish();
      overviewStackAnimation = null;
      state.overviewStackAmount = null;
    },
    get floorCacheSize() {
      return stageRuntimeController.floorCacheController.floorTransitionCacheById.size;
    },
    get floorEffectsFollow() {
      return stageRuntimeController.floorEffectsController.areFloorEffectsFollowed;
    },
    transitionFloor(transitionTargetFloorId: any) {
      const floorIdsByElevationOrder = [...state.studioDocument.floors]
        .sort(
          (elevationLeftFloor, elevationRightFloor) =>
            elevationLeftFloor.elevation - elevationRightFloor.elevation
        )
        .map(orderedFloorEntry => orderedFloorEntry.id);
      /**
       * @returns {THREE.Matrix4} 该楼层的变换矩阵。
       */
      const floorMatrixForId = (matrixTargetFloorId: any) => {
        const matrixTargetFloor = state.studioDocument.floors.find(
          (matrixFloorMatch: any) => matrixFloorMatch.id === matrixTargetFloorId
        );
        const matrixTargetScale = matrixTargetFloor.scene.calibration?.pixelsPerMeter || 1;
        const matrixTargetOrigin = this.worldPoint(matrixTargetFloorId, 0, 0, 0);
        return new threeModuleMin.Matrix4()
          .makeBasis(
            this.worldPoint(matrixTargetFloorId, matrixTargetScale, 0, 0).sub(matrixTargetOrigin),
            new threeModuleMin.Vector3(0, 1, 0),
            this.worldPoint(matrixTargetFloorId, 0, matrixTargetScale, 0).sub(matrixTargetOrigin)
          )
          .setPosition(matrixTargetOrigin);
      };
      const isOverviewStackMode = currentPreviewFloorMode() === "all";
      overviewStackAnimation = {
        from: state.overviewStackAmount ?? (isOverviewStackMode ? 1 : 0),
        to: transitionTargetFloorId === "all" ? 1 : 0
      };
      state.overviewStackAmount = overviewStackAnimation.from;
      const transitionSourceFloorKey = isOverviewStackMode ? "all" : state.activeFloorId;
      const transitionDetachedRecords = stageRuntimeController.floorTransitionController.take(
        isOverviewStackMode ? floorIdsByElevationOrder : [state.activeFloorId],
        floorMatrixForId,
        isOverviewStackMode
      );
      for (const transitionDetachedRecord of transitionDetachedRecords) {
        transitionDetachedRecord.cacheKey ||= transitionSourceFloorKey;
        transitionDetachedRecord.cacheEpoch ??= stageRuntimeController.floorCacheController.floorCacheEpoch;
      }
      const transitionBoundsBox = new threeModuleMin.Box3();
      for (const boundsTraversedRecord of transitionDetachedRecords) {
        boundsTraversedRecord.node.traverseVisible((boundsSceneNode: any) => {
          if (
            !!boundsSceneNode.isMesh &&
            !!boundsSceneNode.geometry &&
            !["background", "grid", "contact-shadow"].includes(boundsSceneNode.userData?.exportRole)
          ) {
            if (!boundsSceneNode.geometry.boundingBox) {
              boundsSceneNode.geometry.computeBoundingBox();
            }
            if (boundsSceneNode.geometry.boundingBox) {
              transitionBoundsBox.union(
                boundsSceneNode.geometry.boundingBox
                  .clone()
                  .applyMatrix4(boundsSceneNode.matrixWorld)
              );
            }
          }
        });
      }
      const transitionBoundsSize = transitionBoundsBox.getSize(new threeModuleMin.Vector3());
      const isAdjacentFloorTransition = !isOverviewStackMode && transitionTargetFloorId !== "all";
      const transitionCameraUp = isAdjacentFloorTransition
        ? new threeModuleMin.Vector3(0, 1, 0).applyQuaternion(state.previewCamera.quaternion).normalize()
        : null;
      const transitionVisibleHeight = isAdjacentFloorTransition
        ? measureVisibleHeight(state.previewCamera, state.orbitControls.target) * 1.2
        : Math.max(20, transitionBoundsSize.x, transitionBoundsSize.z) * 1.5;
      const sourceFloorScrollPosition =
        transitionDetachedRecords.find((scrollRecordEntry: any) =>
          Number.isFinite(scrollRecordEntry.scrollPosition)
        )?.scrollPosition ?? floorIdsByElevationOrder.indexOf(transitionSourceFloorKey);
      const destinationElevationIndex = floorIdsByElevationOrder.indexOf(transitionTargetFloorId);
      const intermediateTransitionFloorIds = isAdjacentFloorTransition
        ? floorIdsByElevationOrder.slice(
            Math.min(Math.floor(sourceFloorScrollPosition), destinationElevationIndex),
            Math.max(Math.ceil(sourceFloorScrollPosition), destinationElevationIndex) + 1
          )
        : [];
      const transitionFloorIdList =
        transitionTargetFloorId === "all"
          ? floorIdsByElevationOrder
          : [
              transitionTargetFloorId,
              ...intermediateTransitionFloorIds.filter(
                filteredTransitionFloorId => filteredTransitionFloorId !== transitionTargetFloorId
              )
            ];
      const transitionRecordList = transitionFloorIdList.map(
        mappedFloorId =>
          transitionDetachedRecords.find(
            (matchedTransitionRecord: any) =>
              matchedTransitionRecord.id === mappedFloorId &&
              matchedTransitionRecord.cacheEpoch === stageRuntimeController.floorCacheController.floorCacheEpoch
          ) || stageRuntimeController.floorCacheController.floorTransitionCacheById.get(mappedFloorId)
      );
      const reusableTransitionCount = transitionRecordList.filter(Boolean).length;
      if (isAdjacentFloorTransition) {
        for (
          let capturedFloorIndex = 0;
          capturedFloorIndex < transitionFloorIdList.length;
          capturedFloorIndex++
        ) {
          if (transitionRecordList[capturedFloorIndex]) {
            continue;
          }
          this.setFloor(transitionFloorIdList[capturedFloorIndex]);
          const capturedFloorRecord = stageRuntimeController.floorTransitionController.capture(
            [transitionFloorIdList[capturedFloorIndex]],
            floorMatrixForId,
            false
          )[0];
          capturedFloorRecord.frame = capturedFloorRecord.baseFrame.clone();
          capturedFloorRecord.cacheKey = transitionFloorIdList[capturedFloorIndex];
          capturedFloorRecord.cacheEpoch = stageRuntimeController.floorCacheController.floorCacheEpoch;
          capturedFloorRecord.node.removeFromParent();
          transitionRecordList[capturedFloorIndex] = capturedFloorRecord;
        }
      }
      const reusableTransitionRecords = transitionRecordList.every(Boolean)
        ? transitionRecordList
        : null;
      if (reusableTransitionRecords && reusableTransitionCount === transitionFloorIdList.length) {
        floorCacheStats.reusedTransitions++;
      } else {
        floorCacheStats.rebuiltTransitions++;
      }
      if (reusableTransitionRecords) {
        floorCacheStats.reusedFloors += reusableTransitionCount;
      }
      state.renderer.domElement.dataset.floorReuseStats = JSON.stringify(floorCacheStats);
      if (reusableTransitionRecords) {
        for (const releasedTransitionRecord of reusableTransitionRecords) {
          stageRuntimeController.floorCacheController.environmentSceneController?.releaseRoot?.(releasedTransitionRecord.node);
          state.regionLightController?.releaseRoot?.(releasedTransitionRecord.node);
          stageRuntimeController.floorCacheController.floorTransitionCacheById.delete(releasedTransitionRecord.id);
        }
      } else {
        stageRuntimeController.floorCacheController.releaseFloorCache(new Set(transitionFloorIdList));
      }
      this.setFloor(transitionTargetFloorId, reusableTransitionRecords, floorMatrixForId);
      const destinationOrbitCenter = this.getOrbitCenter();
      const destinationFloorRecords = stageRuntimeController.floorTransitionController.capture(
        transitionFloorIdList,
        floorMatrixForId,
        transitionTargetFloorId === "all" || transitionFloorIdList.length > 1
      );
      for (const positionedFloorRecord of destinationFloorRecords) {
        positionedFloorRecord.cacheKey = transitionTargetFloorId;
        positionedFloorRecord.cacheEpoch = stageRuntimeController.floorCacheController.floorCacheEpoch;
      }
      stageRuntimeController.floorTransitionController.begin(
        transitionDetachedRecords,
        destinationFloorRecords,
        floorIdsByElevationOrder,
        transitionVisibleHeight,
        isAdjacentFloorTransition,
        transitionCameraUp,
        transitionTargetFloorId
      );
      curtainSyncHandler?.();
      televisionSyncHandler?.();
      return destinationOrbitCenter;
    },
    setFloor(setFloorId: any, setFloorRecords: any = null, floorMatrixResolver = floorWorldMatrix) {
      const floorRecordForId =
        state.studioDocument.floors.find((activeFloorEntry: any) => activeFloorEntry.id === setFloorId) ||
        state.studioDocument.floors[0];
      const nextPreviewFloorMode =
        setFloorId === "all" && state.studioDocument.floors.length > 1 ? "all" : "active";
      if (
        !!setFloorRecords ||
        state.activeFloorId !== floorRecordForId.id ||
        currentPreviewFloorMode() !== nextPreviewFloorMode
      ) {
        if (
          lightTransitionController.lightTransitionsByLight.size ||
          (typeof state.lightTransitionSession !== "undefined" &&
            state.lightTransitionSession === lightTransitionController.lightTransitionSessionToken)
        ) {
          lightTransitionController.teardownLightTransitions();
        }
        lightTransitionController.hasReceivedLightStates = false;
        lightTransitionController.forceLightStateRefresh = true;
        state.activeFloorId = floorRecordForId.id;
        state.studioDocument.activeFloorId = floorRecordForId.id;
        state.activeScene = floorRecordForId.scene;
        if (setFloorRecords) {
          state.studioDocument.previewFloorMode = nextPreviewFloorMode;
          syncPreviewFloorButtons();
          syncCameraViewControls();
          const lowestElevationFloorId = [...state.studioDocument.floors].sort(
            (floorSortLeft, floorSortRight) => floorSortLeft.elevation - floorSortRight.elevation
          )[0].id;
          for (const restoredFloorRecord of setFloorRecords) {
            stageRuntimeController.floorTransitionController
              .reuse(restoredFloorRecord, floorMatrixResolver(restoredFloorRecord.id))
              .traverse((restoreSceneNode: any) => {
                if (["background", "grid"].includes(restoreSceneNode.userData?.exportRole)) {
                  restoreSceneNode.userData.floorBackgroundHidden =
                    nextPreviewFloorMode === "all" &&
                    restoredFloorRecord.id !== lowestElevationFloorId;
                  restoreSceneNode.visible =
                    stageBackgroundController.isBackgroundVisible &&
                    (!restoreSceneNode.userData.floorBackgroundHidden ||
                      restoreSceneNode.userData.backgroundThemeKeepVisible === true) &&
                    !restoreSceneNode.userData.backgroundThemeHidden;
                }
              });
          }
          state.previewModelRoot.userData.regionFloorId = floorRecordForId.id;
          if (state.regionLightController) {
            state.previewModelRoot.traverse((lightRegistrarSceneNode: any) => {
              if (
                !lightRegistrarSceneNode.isLight ||
                !lightRegistrarSceneNode.userData.lightItemId
              ) {
                return;
              }
              const registrableLightItem = state.studioDocument.floors
                .find(
                  (registrableFloorEntry: any) =>
                    registrableFloorEntry.id === lightRegistrarSceneNode.userData.lightFloorId
                )
                ?.scene.items.find(
                  (registrableLightItemMatch: any) =>
                    registrableLightItemMatch.id === lightRegistrarSceneNode.userData.lightItemId
                );
              if (registrableLightItem) {
                state.regionLightController.register(lightRegistrarSceneNode, registrableLightItem);
              }
            });
          }
          applyShadowBudget(state.previewModelRoot);
          applyCameraMode(currentCameraMode(), {
            preserveView: false
          });
          invalidateRender({
            scene: true,
            shadows: true
          });
          fitDirectionalShadowCamera();
          resetCameraView();
        } else {
          setPreviewFloorMode(setFloorId === "all" ? "all" : "active", {
            persist: false
          });
        }
        stageRuntimeController.orbitPivotOverride = null;
      }
    },
    worldPoint: worldPointForFloor,
    presentationPoint(
      presentationFloorId: any,
      presentationPlanX: any,
      presentationPlanY: any,
      presentationElevationMeters = 0.1
    ) {
      const presentationFloorRecord = stageRuntimeController.floorTransitionController.records.find(
        presentationRecordMatch => presentationRecordMatch.id === presentationFloorId
      );
      /**
       * @returns {THREE.Vector3|null} 展示坐标点；无控制器时即原值。
       */
      const toPresentationPoint = (presentationWorldPoint: any) =>
        presentationWorldPoint && state.overviewStackController
          ? state.overviewStackController.presentationPoint(presentationFloorId, presentationWorldPoint)
          : presentationWorldPoint;
      if (!presentationFloorRecord) {
        return toPresentationPoint(
          worldPointForFloor(
            presentationFloorId,
            presentationPlanX,
            presentationPlanY,
            presentationElevationMeters
          )
        );
      }
      const presentationFloorEntry = state.studioDocument.floors.find(
        (presentationFloorMatch: any) => presentationFloorMatch.id === presentationFloorId
      );
      if (!presentationFloorEntry) {
        return null;
      }
      presentationFloorRecord.node.updateWorldMatrix(true, false);
      const presentationFloorScale = presentationFloorEntry.scene.calibration?.pixelsPerMeter || 1;
      return toPresentationPoint(
        new threeModuleMin.Vector3(
          presentationPlanX / presentationFloorScale,
          presentationElevationMeters,
          presentationPlanY / presentationFloorScale
        )
          .applyMatrix4(presentationFloorRecord.baseFrame)
          .applyMatrix4(presentationFloorRecord.node.matrixWorld)
      );
    },
    setLightStates: lightTransitionController.applyLightStates,
    setEditorEffects: setEditorEffects,
    mapLightEffectState: (mappedLightState: any) => mapLightEffectState(mappedLightState),
    lightEffectColorHex: (mappedKelvin: any) => lightEffectColorHex(mappedKelvin),
    cameraState(shouldResetOrbitControls = false) {
      if (shouldResetOrbitControls) {
        stageRuntimeController.recreateOrbitControls();
      }
      return {
        position: state.previewCamera.position.toArray(),
        target: state.orbitControls.target.toArray(),
        zoom: state.previewCamera.zoom,
        mode: state.previewCamera.isPerspectiveCamera ? "perspective" : "orthographic",
        up: state.previewCamera.up.toArray(),
        frameSize: state.previewCamera.userData.frameSize || 10,
        view: currentCameraView(),
        topRotation: currentTopRotationDeg(),
        focalLength: currentFocalLength()
      };
    },
    setCameraProjection(projectionCameraMode: any) {
      cameraSettingsSource().cameraMode =
        projectionCameraMode === "perspective" ? "perspective" : "orthographic";
      applyCameraMode(cameraSettingsSource().cameraMode, {
        preserveView: true,
        deferControlUpdate: true
      });
      stageRuntimeController.recreateOrbitControls();
    },
    setCameraFocalLength(focalLengthValue: any) {
      cameraSettingsSource().cameraFocalLength = clamp(finite(focalLengthValue, 50), 18, 120);
      applyFocalLength();
      invalidateRender();
    },
    setCameraInteraction(interactionOptions: any = {}) {
      const controlRotationMode = ["horizontal", "vertical"].includes(
        interactionOptions.rotationMode
      )
        ? interactionOptions.rotationMode
        : "free";
      const shouldEnableControls = interactionOptions.enabled === true;
      const shouldEnablePan = interactionOptions.panEnabled !== false;
      const shouldEnableZoom = interactionOptions.zoomEnabled !== false;
      const interactionChanged =
        stageRuntimeController.isCameraInteractionEnabled !== shouldEnableControls ||
        stageRuntimeController.rotationConstraintMode !== controlRotationMode ||
        stageRuntimeController.controlsPanEnabled !== shouldEnablePan ||
        stageRuntimeController.controlsZoomEnabled !== shouldEnableZoom;
      stageRuntimeController.isCameraInteractionEnabled = shouldEnableControls;
      stageRuntimeController.rotationConstraintMode = controlRotationMode;
      stageRuntimeController.controlsPanEnabled = shouldEnablePan;
      stageRuntimeController.controlsZoomEnabled = shouldEnableZoom;
      if (interactionChanged) {
        stageRuntimeController.recreateOrbitControls();
      } else {
        state.orbitControls.enabled = shouldEnableControls;
      }
      stageRuntimeController.installOrbitControlsOverrides();
    },
    whenPresented() {
      presentedPromise ||= (async () => {
        const deferredModelReleasePromises = releaseAllDeferredModels();
        let presentTimeoutHandle;
        try {
          await Promise.race([
            Promise.allSettled(deferredModelReleasePromises),
            new Promise(resolvePresentTimeout => {
              presentTimeoutHandle = window.setTimeout(resolvePresentTimeout, 8000);
            })
          ]);
        } finally {
          window.clearTimeout(presentTimeoutHandle);
        }
        forcePreviewRebuild();
        await new Promise(requestAnimationFrame);
        await new Promise(requestAnimationFrame);
        stageBackgroundController.applyBackgroundVisibility();
        await waitForLightCacheSettle();
        state.renderer.render(state.previewOverlayScene, state.previewCamera);
        await new Promise(requestAnimationFrame);
      })();
      return presentedPromise;
    },
    setCameraView(cameraViewName: any) {
      cameraSettingsSource().cameraView = cameraViewName === "top" ? "top" : "free";
      applyCameraView(cameraSettingsSource().cameraView, {
        force: true
      });
    },
    getCameraMotionState() {
      if (stageRuntimeController.cameraBlendState) {
        return {
          ...stageRuntimeController.cameraBlendState
        };
      } else {
        return null;
      }
    },
    restoreCamera(restoredCameraPose: any, restoredCameraFloorId: any = null) {
      restoredCameraPose = constrainCameraPose(restoredCameraPose);
      stageRuntimeController.cameraBlendState = null;
      if (!restoredCameraPose) {
        resetCameraView();
        stageRuntimeController.recreateOrbitControls();
        return;
      }
      const restoredCameraSettings = cameraSettingsSource();
      restoredCameraSettings.cameraMode = restoredCameraPose.mode;
      restoredCameraSettings.cameraView = restoredCameraPose.view || "free";
      restoredCameraSettings.cameraTopRotation = restoredCameraPose.topRotation || 0;
      restoredCameraSettings.cameraFocalLength = restoredCameraPose.focalLength || 50;
      applyCameraMode(restoredCameraPose.mode, {
        preserveView: false
      });
      state.previewCamera.position.fromArray(restoredCameraPose.position);
      if (restoredCameraPose.up) {
        state.previewCamera.up.fromArray(restoredCameraPose.up);
      }
      state.orbitControls.target.fromArray(restoredCameraPose.target);
      state.previewCamera.zoom = restoredCameraPose.zoom;
      if (restoredCameraPose.frameSize) {
        state.previewCamera.userData.frameSize = restoredCameraPose.frameSize;
      }
      state.previewCamera.userData.cameraView = restoredCameraSettings.cameraView;
      state.previewCamera.userData.topRotation = restoredCameraSettings.cameraTopRotation;
      updateCameraClipPlanes(state.previewCamera, state.orbitControls.target);
      handleStageResize();
      stageRuntimeController.recreateOrbitControls(state.orbitControls.target.clone());
      stageRuntimeController.cameraBlendState = restoredCameraFloorId
        ? {
            ...restoredCameraFloorId
          }
        : null;
      stageRuntimeController.syncPreviewProjection();
      invalidateRender();
    },
    topView() {
      applyCameraView("top", {
        force: true
      });
    }
  };
}
initializeStudio();
