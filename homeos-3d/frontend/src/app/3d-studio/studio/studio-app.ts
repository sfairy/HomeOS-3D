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
import {
  PLAN_DONE,
  PLAN_GUIDE,
  PLAN_PAPER,
  STUDIO_AURA_FALLBACK,
  STUDIO_ECO_FALLBACK,
  STUDIO_PAPER_FALLBACK,
  convertBetweenFloors,
  drawFloatingLabel,
  drawMarqueeOverlay,
  drawMetricGrid,
  drawOpenEndpointWarning,
  drawPlanDoor,
  drawPlanLine,
  drawPlanPoint,
  drawPlanRailing,
  isSnapClosingSpace,
  openingPlacementInfo,
  referenceWallsForAlignment,
  renderPlanView,
  rotateScreenPoint,
  screenToPlan,
  selectedDoorType,
  unclosedEndpointsForWalls,
  zoomValueElement
} from "./studio-plan-draw.js";
import {
  applyCameraMode,
  applyOrthographicFrame,
  cameraModeButtons,
  cameraRotateTopButtons,
  cameraViewButtons,
  cloneSceneForHistory,
  currentCameraMode,
  pushHistorySnapshot,
  resetCameraView,
  restoreStoredCameraView,
  savedCameraView,
  syncCameraModeButtons,
  syncCameraViewButtons,
  syncFocalLengthInputs,
  topViewUpVector
} from "./studio-camera-mode.js";
import {
  assetHeadingCategoryButtons,
  exportSaveViewButton,
  fixedCameraViewInput,
  fixedOverviewViewInput,
  floorCameraActionsElement,
  itemTypeButtons,
  overviewCameraActionsElement,
  previewFloorGapControlElement,
  previewFloorGapInput,
  previewFloorUniformControlElement,
  previewFloorUniformInput,
  snapIndicatorElement,
  snapSettingInputs,
  snapToggleButton,
  snapToggleStateElement,
  snapToleranceInput,
  snapToleranceValueElement,
  syncAssetTabVisibility,
  syncCameraViewControls,
  syncDoorMaterialOptions,
  syncMaterialStyleOptions,
  syncSnapControls
} from "./studio-control-sync.js";
import {
  applyCameraSnapshot,
  applyCameraView,
  captureCameraSnapshot
} from "./studio-camera-snapshot.js";
import {
  LIGHT_FADE_DURATION_MS,
  STUDIO_LAYOUT_STORAGE_KEY,
  activateFloor,
  activeToolLabelElement,
  addAreaButton,
  addLightGroupButton,
  alignFloorButton,
  areaContextMenuElement,
  canvasEmptyElement,
  carItems,
  clearFloorDropIndicators,
  clearLightGroupDropIndicators,
  clearSelection,
  collectItemModelTypes,
  createAreaSection,
  createCarChargingLayerRow,
  createLightGroupRow,
  createTelevisionLayerRow,
  currentFloorModelTypes,
  curtainPositionFieldElement,
  deleteSelectionButton,
  detailsPanelElement,
  detailsResizerElement,
  doorFieldsElement,
  ensureActiveLightGroup,
  expandedAreaIds,
  fadeLightGroups,
  featureWallStyleFieldElement,
  findLightGroup,
  findSelectedEntity,
  finishWallButton,
  fitViewToBounds,
  floorContextMenuElement,
  floorListElement,
  fridgeStyleFieldElement,
  fridgeStyleRadioInputs,
  globalWallHeightInput,
  globalWallOpacityInput,
  globalWallThicknessInput,
  inspectorEmptyElement,
  itemDepthLabelElement,
  itemElevationFieldElement,
  itemFieldsElement,
  itemHeightFieldElement,
  itemHeightLabelElement,
  itemLightSourceVisibilityFieldElement,
  itemLightSourceVisibleInput,
  itemRotationActionsElement,
  itemRotationFieldElement,
  itemStripOrientationHeadingElement,
  itemStripRollFieldElement,
  itemStripRollInput,
  itemVerticalRotationFieldElement,
  itemVerticalRotationLabelElement,
  itemWidthLabelElement,
  labelTextFieldsElement,
  libraryPanelElement,
  libraryResizerElement,
  lightFieldsElement,
  lightGroupContextMenuElement,
  lightGroupListElement,
  lightGroupsOffButton,
  lightLayerActionsElement,
  lightLayerPanelElement,
  lightPreviewNoteElement,
  lightPropertyApplyButtons,
  loadBackgroundTexture,
  materialStyleFieldElement,
  measurePanelLimits,
  migrateLegacyLayoutSettings,
  moveLightGroupToArea,
  muralStyleFieldElement,
  openAreaContextMenu,
  openFloorContextMenu,
  openLightGroupContextMenu,
  pillarAxisFieldElement,
  pillarShapeFieldElement,
  previewFloorButtons,
  railingFieldsElement,
  readStudioLayoutLength,
  refreshStudio,
  releaseAllDeferredModels,
  removePlanButton,
  renderFloorList,
  renderInspector,
  renderLightGroupList,
  renderLightGroupSelect,
  reorderFloorList,
  resetScaleInteractionState,
  roundTableTurntableFieldElement,
  sceneCountsElement,
  sceneModelBounds,
  selectionHeadingElement,
  selectionIdElement,
  selectionInspectorElement,
  shoeCabinetActionsElement,
  shoeCabinetMirrorInput,
  stairDirectionFieldElement,
  stripAxisFieldElement,
  studioLayout,
  studioLayoutMetrics,
  studioShellElement,
  syncPreviewFloorButtons,
  syncStudioUi,
  televisionItems,
  toggleAreaExpanded,
  toggleBackgroundButton,
  toggleFloorEdgeButton,
  toolHelpElement,
  transitionLightGroups,
  tvMountStyleFieldElement,
  updateFloorAlignmentControls,
  updateLightGroupsEnabled,
  wallFieldsElement,
  windowFieldsElement
} from "./studio-ui-refresh.js";
import {
  applyBaseLightingSettings,
  applyExportFloorSelection,
  applyExportPreset,
  applyPresetCamera,
  autoDiagramComponentId,
  baseLightControlInputs,
  baseLightControlsElement,
  closeBaseLightingPanel,
  closeExportDialog,
  closePresetDeleteDialog,
  closePresetRenameDialog,
  collectCars,
  collectLightGroups,
  collectTelevisions,
  deleteActiveExportPreset,
  ensureAutoDiagramFrame,
  exportAspectLabelElement,
  exportFloorGapControlElement,
  exportFloorGapInput,
  exportFloorSelectElement,
  exportFolderName,
  exportGroupFilesInput,
  exportPackageButton,
  exportPresetDeleteDialogElement,
  exportPresetDeleteNameElement,
  exportPresetRenameDialogElement,
  exportPresetRenameInputElement,
  exportPreviewFrameElement,
  exportResolutionLabelElement,
  exportStatusElement,
  floorSelectionParam,
  handleStageResize,
  openExportDialog,
  openPresetDeleteDialog,
  openPresetRenameDialog,
  populateExportGroupFiles,
  previewFloors,
  refreshExportPreview,
  renderExportFloorOptions,
  renderExportPreviewFrames,
  resizeExportStage,
  restoreExportCamera,
  sanitizeFileName,
  syncBaseLightControlInputs,
  syncExportResolutionLabels
} from "./studio-export-dialogs.js";
import {
  activateTool,
  assignCarLayerNames,
  assignTelevisionLayerNames,
  beginExportRender,
  beginPointerScale,
  blitMetricsCanvas,
  boundsFromPoints,
  cancelFloorAlignment,
  canvasPointFromEvent,
  collectEntitiesInMarquee,
  createSceneItem,
  currentLightScope,
  currentSelectionScope,
  cursorPositionElement,
  endCameraGesture,
  endExportRender,
  ensureCalibration,
  handleFloorAlignClick,
  hitTestEntityAt,
  hitTestItemHandle,
  isSnapEnabled,
  itemControlHandles,
  itemFootprintSwapped,
  itemWithPlanFootprint,
  lightScopeForSelection,
  metricsCanvas,
  metricsContext,
  normalizeLayerNames,
  onCameraGestureFrame,
  onCameraSettleFrame,
  onPlanCanvasPointerDown,
  onPlanCanvasPointerEnd,
  onPlanCanvasPointerMove,
  onPlanCanvasPointerUp,
  onPlanCanvasWheel,
  pushHistoryEntry,
  referenceMetersInput,
  referencePixelsElement,
  refreshSplitGeometry,
  requestSceneRefresh,
  resolveSnapTarget,
  rotateLocalToPlan,
  scaleDialogElement,
  scopeForItem,
  scopeForSelection,
  setSelection,
  syncMetricsCanvas,
  toolButtons,
  updateSnapIndicator,
  wallIntersectionsForWalls,
  zoomViewAt
} from "./studio-plan-interaction.js";
import {
  mergeCollinearWalls,
  sampleFrameInterval
} from "./studio-geometry-utils.js";
import {
  openBaseLightingPanel,
  postBaseLightingState,
  saveBaseLighting,
  setHighShadowQuality
} from "./studio-base-lighting.js";
import {
  areaNameTaken,
  closeFloorDeleteDialog,
  createAreaFromAssignDialog,
  deleteFloor,
  floorDeleteDialogElement,
  lightGroupAreaNewNameElement,
  lightGroupAreaSelectElement,
  normalizeAreaName,
  projectAnchorToFloorPlan,
  startFloorAlignment,
  switchPreviewFloor,
  syncAreaAssignOptions
} from "./studio-floor-switch.js";
import {
  addExportPresetSlot,
  buildExportedLight,
  canvasToBlob,
  captureStageImage,
  composeBackgroundBlob,
  compositeLightGroupShadows,
  floorExportOffset,
  selectExportPresetSlot,
  setExportDimension,
  uniqueExportPresetName
} from "./studio-export-pipeline.js";
import {
  activateAssetTab,
  assetCategoryButtons,
  assetGridElement,
  closeLightGroupContextMenu,
  collectClipboardItems,
  copySelectionToClipboard,
  deleteSelection,
  duplicateSelection,
  lightAssetRowElement,
  pasteClipboardItems
} from "./studio-selection-ops.js";
import {
  applyGlobalWallThickness,
  beginWallSettingEdit,
  collectLightTargetItems,
  collectWallTargetCheckboxes,
  commitWallSettingInput,
  formatLightFieldValue,
  lightPropertySelectionCountElement,
  lightPropertyTargetListElement,
  lightPropertyToggleAllButton,
  renderLightPropertyTargets,
  renderWallPropertyTargets,
  sanitizeLightFieldValue,
  scheduleOverlayRedraw,
  syncLightTargetSelection,
  syncWallTargetSelection,
  wallEffectiveOpacityPercent,
  wallPropertyCurrentText,
  wallPropertySelectionCountElement,
  wallPropertyTargetListElement,
  wallPropertyToggleAllButton
} from "./studio-property-panels.js";
import {
  applyInspectorChanges,
  snapTelevisionMountDimensions
} from "./studio-inspector-apply.js";
import {
  initializeStudioStage,
  isWebglContextCreationFailure
} from "./studio-stage-init.js";
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


// 材质风格（default / warm-wood）与墙体透明度覆盖：两者都由舞台侧通过
window.addEventListener("pagehide", () => renderCache?.close(), {
  once: true
});
if (isAutoDiagramEmbed) {
  document.body.classList.add("auto-diagram-embedded");
}
const planStageElement = selectElement("#plan-stage");
const projectNameElement = selectElement("#project-name");
const importPlanButton = selectElement("#import-plan");
const planFileInput = selectElement("#plan-file");
const addFloorButton = selectElement("#add-floor");
const floorRenameDialogElement = selectElement("#floor-rename-dialog");
const floorRenameFormElement = selectElement("#floor-rename-form");
const floorRenameInputElement = selectElement("#floor-rename-input");
const floorDeleteFormElement = selectElement("#floor-delete-form");
const floorDeleteNameElement = selectElement("#floor-delete-name");
const saveConflictLoadButton = selectElement("#save-conflict-load");
const saveConflictOverwriteButton = selectElement("#save-conflict-overwrite");
const saveConflictLaterButton = selectElement("#save-conflict-later");
const saveInteractionConfirmButton = selectElement("#save-interaction-confirm");
const saveInteractionKeepButton = selectElement("#save-interaction-keep");
const snapSettingsToggleButton = selectElement("#snap-settings-toggle");
const snapSettingsPanelElement = selectElement("#snap-settings-panel");
const scaleFormElement = selectElement("#scale-form");
const lightGroupRenameDialogElement = selectElement("#light-group-rename-dialog");
const lightGroupRenameFormElement = selectElement("#light-group-rename-form");
const lightGroupRenameInputElement = selectElement("#light-group-rename-input");
const lightPropertyApplyDialogElement = selectElement("#light-property-apply-dialog");
const lightPropertyApplyFormElement = selectElement("#light-property-apply-form");
const lightPropertyApplyTitleElement = selectElement("#light-property-apply-title");
const lightPropertyApplyValueInput = selectElement("#light-property-apply-value");
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
const saveOverviewViewButton = selectElement("#save-overview-view");
const exportPresetRenameFormElement = selectElement("#export-preset-rename-form");
const exportPresetDeleteFormElement = selectElement("#export-preset-delete-form");
const exportOverwriteDialogElement = selectElement("#export-overwrite-dialog");
const exportOverwriteNameElement = selectElement("#export-overwrite-name");
const exportCompleteDialogElement = selectElement("#export-complete-dialog");
const exportCompleteTitleElement = selectElement("#export-complete-title");
const exportCompleteMessageElement = selectElement("#export-complete-message");
const exportCompletePathElement = selectElement("#export-complete-path");

/* ===== 布局层：三栏宽度、3D 预览高度、折叠态 ===== */


// 布局常量缓存槽，含义与失效时机见下方 studioLayoutMetrics()。


/* 素材卡片必须先渲染：下面两行一次性抓走全部 [data-item-type] 与分组标题并据此绑事件，
   晚于这里生成的卡片会「看得见、点不动」。数据表在 studio-asset-palette.js。 */
renderStudioAssetPalette(selectElement("#asset-grid"));
const areaRenameDialogElement = selectElement("#area-rename-dialog");
const areaRenameFormElement = selectElement("#area-rename-form");
const areaRenameTitleElement = selectElement("#area-rename-title");
const areaRenameInputElement = selectElement("#area-rename-input");
const lightGroupAreaDialogElement = selectElement("#light-group-area-dialog");
const lightGroupAreaFormElement = selectElement("#light-group-area-form");
const lightGroupAreaNameElement = selectElement("#light-group-area-name");
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
// 工具提示文案（标题 + 说明），与界面文案一致，改动请同步 studio.css 的宽度假设。
const isStudioRoute = isStageViewerMode || /^\/3d-studio\/?$/.test(window.location.pathname);

// 本文件的状态集中在下面这段 let 里（没有状态容器对象）：绘制 / 预览 / 导出三处回调都要
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
 * 关闭区域右键菜单，并清掉目标区域 id。
 */
function closeAreaContextMenu() {
  areaContextMenuElement.hidden = true;
  state.areaContextMenuId = "";
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
 * 展开 / 收起吸附设置面板，并同步按钮的 aria-expanded 状态。
 */
function setSnapSettingsVisible(isVisible: any) {
  snapSettingsPanelElement.hidden = !isVisible;
  snapSettingsToggleButton.setAttribute("aria-expanded", String(isVisible));
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
function invalidateLightCacheSoon() {
  if (!!isAdaptiveLightCacheEnabled() && !state.exportRenderState && !state.isLightCacheBuilding) {
    state.needsLightCacheRefresh = true;
    scheduleLightCacheBuild(0);
    applyRenderQualityMode();
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
const wallPropertyApplyButtons = [...document.querySelectorAll("[data-apply-wall-property]")];

/**
 * 关闭墙面批量应用对话框，并清空待应用的编辑内容。
 * @returns {void}
 */
function closeWallPropertyApplyDialog() {
  state.wallPropertyApplyEdit = null;
  wallPropertyApplyDialogElement.close();
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
