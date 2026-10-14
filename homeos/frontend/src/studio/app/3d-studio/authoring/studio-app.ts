import { trimRetainedFloors as trimRetainedFloors2 } from "./scene/studio-floor-cache-budget";
import { compactStaticDeviceParts as compactStaticDeviceParts2 } from "./items/studio-device-batching";
import { snapItemToSurface as snapItemToSurface2 } from "./items/studio-surface-snap";
import {
  isCourtyardPlanItem as isCourtyardPlanItem2,
  courtyardToolAllowed as courtyardToolAllowed2,
  courtyardPlanColor as courtyardPlanColor2,
} from "../plan/courtyard-plan";
import {
  validatePlacementChange as validatePlacementChange2,
  restorePlacementScene as restorePlacementScene2,
} from "./items/studio-placement";
import {
  hitDrawing as hitDrawing2,
  buildingFootprints as buildingFootprints2,
  courtyardBoundaryPoints as courtyardBoundaryPoints2,
  courtyardFootprintLoops as courtyardFootprintLoops2,
  courtyardSurfaceRise as courtyardSurfaceRise2,
  outerPerimeterLine as outerPerimeterLine2,
  sceneContentBounds as sceneContentBounds2,
  sceneModelOrigin as sceneModelOrigin2,
  anchorGate as anchorGate2,
  isCourtyardGate as isCourtyardGate2,
  syncCourtyardGates as syncCourtyardGates2,
  surfaceExclusions as surfaceExclusions2,
  remapCourtyardAttachments as remapCourtyardAttachments2,
} from "../plan/courtyard-drawing";
import { createCourtyardDrawingEditor as createCourtyardDrawingEditor2 } from "../plan/courtyard-drawing-editor";
let planPainter: any = null,
  gardenGateItemType = "garden-gate",
  gardenGateSnapCandidate: any = null;
import {
  airerDimensions as airerDimensions2,
} from "./items/studio-airer";
import {
  fanDimensions as fanDimensions2,
} from "./items/studio-fan";
import {
  doorMaterialPartIndex,
  doorMaterialPartRolesForType,
  materialRoleLabel,
  resolveMaterialPaletteColor,
} from "../materials/studio-model-material-roles";
import {
  MATERIAL_STYLE_AUTO,
  buildCustomMaterialStyleRecord,
  customMaterialStyleId,
  isMaterialStyleCapable,
  materialStyleAutoLabel,
  materialStyleGroupFor,
  materialStyleLabel,
  materialStyleOptionsFor,
  materialStyleOptionsSignature,
  materialStylePaletteColors,
  materialStylePresetFor,
  materialStylePresetSwatchColors,
  materialStyleRecipeFor,
  normalizeMaterialStyle,
  registerCustomMaterialStyles,
} from "../materials/studio-material-presets";
import { materialSlotGroupOf } from "../materials/studio-material-slot-groups";
import { buildStaticMaterialKey } from "../materials/studio-static-material-key";
import {
  normalizeMuralArtStyle,
  normalizeFeatureWallStyle,
} from "../materials/studio-surface-textures";
import { createMotionBuffer as createMotionBuffer2 } from "./scene/studio-motion-buffer";
import { createBackgroundCache as createBackgroundCache2 } from "./scene/studio-background-cache";
import { createLoadTiming as createLoadTiming2 } from "../../bridge/scene/load-timing";
import { stageStartup as stageStartup2 } from "../stage-startup";
import { interactionResourcePolicy } from "../studio-resource-policy";
import { createPreviewTransformCache } from "../studio-preview-transforms";
import { validGeometryLoops as validGeometryLoops2 } from "../geometry-persistent-cache";
import {
  prepareBackground as prepareBackground2,
  loadImportedImage as loadImportedImage2,
  backgroundFailure as backgroundFailure2,
  type BackgroundImportDiagnostics,
} from "../plan/background-import";
const stageLoadTiming = createLoadTiming2("stage");
stageLoadTiming("module-ready");
import {
  WARM_WOOD_STYLE as WARM_WOOD_STYLE2,
  decorateWarmFloor as decorateWarmFloor2,
} from "./scene/studio-scene-style";
import {
  normalizeCurtainTrack as normalizeCurtainTrack2,
  curtainFootprintDepth as curtainFootprintDepth2,
} from "../loaders/studio-curtain-track";
import { createOverviewStack as createOverviewStack2 } from "./scene/studio-overview-stack";
import { createStartupPresentation as createStartupPresentation2 } from "./scene/studio-startup-presentation";
import {
  MAX_CAMERA_POLAR_ANGLE as MAX_CAMERA_POLAR_ANGLE2,
  constrainCameraPosition as constrainCameraPosition2,
  constrainCameraPose as constrainCameraPose2,
} from "./scene/studio-camera-constraints";
import { compactRuntimeFurniture as compactRuntimeFurniture2 } from "./items/studio-runtime-furniture";
import { createReflectionPasses as createReflectionPasses2 } from "../reflection/studio-reflection-passes";
import { createReflectionDetail as createReflectionDetail2 } from "../reflection/studio-reflection-detail";
import { createOverviewDetail as createOverviewDetail2 } from "./scene/studio-overview-detail";
import { overviewFloorId as overviewFloorId2 } from "./scene/studio-overview-stack";
import { createFloorTransition as createFloorTransition2 } from "./scene/studio-floor-transition";
import { floorOpeningPolygon as floorOpeningPolygon2 } from "../plan/studio-floor-openings";
import { remapOpeningsToWalls } from "../plan/studio-wall-openings";
import { createGroundReflections as createGroundReflections2 } from "../reflection/studio-ground-reflections";
import { createMotionPresentation as createMotionPresentation2 } from "./scene/studio-motion-presentation";
import {
  mergeWallBands as mergeWallBands2,
} from "../materials/studio-wall-materials";
import {
  RENDER_CACHE_VERSION as RENDER_CACHE_VERSION2,
  createRenderCache as createRenderCache2,
  cacheSceneDescriptor as cacheSceneDescriptor2,
  sha256 as sha2562,
  stableCacheJSON as stableCacheJSON2,
} from "../../bridge/scene/render-cache";
import { transformSceneCamera as transformSceneCamera2 } from "../../bridge/scene/scene-frame";
import { normalizeGroundReflection as normalizeGroundReflection2 } from "../../bridge/scene/reflection-settings";
import { sceneUpdatePlan as sceneUpdatePlan2 } from "../../bridge/scene/scene-update";
import { createDemandFrameLoop as createDemandFrameLoop2 } from "../../bridge/scene/frame-loop";
import { cacheObjectTransforms as cacheObjectTransforms2 } from "../../bridge/scene/scene-matrices";
import { syncHtmlRangeProgress as syncHtmlRangeProgress2 } from "../../shared/util/range-progress";
import { withRequestTimeout as withRequestTimeout2 } from "../../shared/util/request-timeout";
import * as ns2 from "/static/vendor/three/0.186.0/three.module.min.js";
import { OrbitControls as OrbitControls2 } from "/static/vendor/three/0.186.0/OrbitControls.js";
import { RoundedBoxGeometry as RoundedBoxGeometry2 } from "/static/vendor/three/0.186.0/RoundedBoxGeometry.js";
import { mergeGeometries as mergeGeometries2 } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";
import { GLTFLoader as GLTFLoader2 } from "/static/vendor/three/0.186.0/GLTFLoader.js";
import { SameOriginDRACOLoader as SameOriginDRACOLoader2 } from "../export/draco-loader";
import { createModelAssetLoader as createModelAssetLoader2 } from "../loaders/model-asset-loader";
import {
  createLightTransition as createLightTransition2,
  sampleLightTransition as sampleLightTransition2,
  lightTransitionDurationMs as lightTransitionDurationMs2,
  mapLightEffectState as mapLightEffectState2,
  lightEffectColorHex as lightEffectColorHex2,
} from "../../bridge/light-motion";
import {
  adaptiveDeviceLightBudget as adaptiveDeviceLightBudget2,
  adaptiveLightRenderCost as adaptiveLightRenderCost2,
  assessAdaptiveRenderFrames as assessAdaptiveRenderFrames2,
  axisLockedPoint as axisLockedPoint2,
  clamp as clamp2,
  clampWindowT as clampWindowT2,
  closedWallFloorPolygons as closedWallFloorPolygons2,
  closedWallPolygons as closedWallPolygons2,
  distance as distance2,
  itemRotationFromPointers as itemRotationFromPointers2,
  localSpotShadowSettings as localSpotShadowSettings2,
  mergeCollinearWallSegments as mergeCollinearWallSegments2,
  nearestWall as nearestWall2,
  pointInRotatedRectangle as pointInRotatedRectangle2,
  polygonArea as polygonArea2,
  projectPointToSegment as projectPointToSegment2,
  resizeRotatedItemFromCorner as resizeRotatedItemFromCorner2,
  remapWallAttachment as remapWallAttachment2,
  selectShadowCastingLightIds as selectShadowCastingLightIds2,
  segmentIntersection as segmentIntersection2,
  spotShadowTextureUnitLimit as spotShadowTextureUnitLimit2,
  spotLightBrightnessResponse as spotLightBrightnessResponse2,
  snapPoint as snapPoint2,
  uncoveredCollinearWallSegments as uncoveredCollinearWallSegments2,
  unclosedWallEndpoints as unclosedWallEndpoints2,
  subtractPolygonLoops as subtractPolygonLoops2,
  wallLengthMeters as wallLengthMeters2,
  wallIntersections as wallIntersections2,
  wallJoinExtensions as wallJoinExtensions2,
} from "../plan/geometry";
import {
  buildLightDeltaPixels as buildLightDeltaPixels2,
  buildStoredZip as buildStoredZip2,
  EXPORT_IMAGE_EXTENSION as EXPORT_IMAGE_EXTENSION2,
  EXPORT_IMAGE_MIME_TYPE as EXPORT_IMAGE_MIME_TYPE2,
  EXPORT_IMAGE_QUALITY as EXPORT_IMAGE_QUALITY2,
  EXPORT_RENDER_SCALE as EXPORT_RENDER_SCALE2,
  scaledExportResolution as scaledExportResolution2,
} from "../export/export-utils";
import {
  MAX_EXPORT_PRESET_COUNT as MAX_EXPORT_PRESET_COUNT2,
  exportPresetIsEmpty as exportPresetIsEmpty2,
  normalizeActiveExportPresetSlot as normalizeActiveExportPresetSlot2,
  normalizeExportPreset as normalizeExportPreset2,
  normalizeExportPresetSlots as normalizeExportPresetSlots2,
} from "../export/export-presets";
import { reorderFloors as reorderFloors2 } from "../plan/floor-order";
import { syncControlValue as syncControlValue2 } from "./ui/ui-controls";
import {
  initializeNumberInputs as initializeNumberInputs2,
  initializeStudioSelects as initializeStudioSelects2,
  syncStudioSelect as syncStudioSelect2,
} from "./ui/studio-widgets";
import {
  createExternalModelManager as createExternalModelManager2,
  ALL_ITEM_MODELS as ALL_ITEM_MODELS2,
} from "../loaders/studio-external-models";
import {
  createPlanDrawingTools as createPlanDrawingTools2,
  drawTrackedText as drawTrackedText2,
} from "../plan/studio-plan-drawing";
import { createSpotShadowAtlasController as createSpotShadowAtlasController2 } from "./scene/studio-shadow-atlas";
import { createRegionLightController as createRegionLightController2 } from "../plan/studio-plan2-region-lights";
import { createContactShadowController as createContactShadowController2 } from "../plan/studio-plan2-contact-shadows";
import {
  isCourtyardDrawing as isCourtyardDrawing2,
  DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2,
  finite as finite2,
  itemMinimumHeight as itemMinimumHeight2,
  itemMinimumFootprint as itemMinimumFootprint2,
  kelvinToRgbHex as kelvinToRgbHex2,
  normalizeBaseLighting as normalizeBaseLighting2,
  normalizeFullRotation as normalizeFullRotation2,
  normalizeLabelText as normalizeLabelText2,
} from "../loaders/studio-normalization";
import {
  DEFAULT_STRIP_AXIS as DEFAULT_STRIP_AXIS2,
  itemFromPlanFootprintResize as itemFromPlanFootprintResize2,
  itemPlanFootprint as itemPlanFootprint2,
  itemWithPlanFootprint as itemWithPlanFootprint2,
  normalizePillarAxis as normalizePillarAxis2,
  normalizePillarShape as normalizePillarShape2,
  normalizeStripAxis as normalizeStripAxis2,
  pillarIsLying as pillarIsLying2,
} from "./items/studio-item-posture";
import { itemTypeCatalog, lampItemTypeSet, openStairTypeSet, roundTableTypeSet, sofaMinDimensions, stairItemTypeSet, tvMountStyleSet } from "./items/item-catalog";
import { installLibraryNameScroll, libraryCardVisible, normalizeLibraryCategory } from "./items/studio-model-library";
import { defaultViewSettings } from "./scene/studio-view-settings";
window.__homeosStudioModuleVersion =
  "20260904-local-shadow-edge-v6-depth-precision-v1-model-load-state-v3-floor-scope-v1-ground-grid-v3-depth-fade-v2-local-shadow-depth-v1-export-shadow-quality-v1-base-light-entry-v1-auto-diagram-preview-hd-v1-auto-diagram-floor-v1-20260905-first-light-prewarm-v3-20260905-orbit-architecture-center-v1";
import { createLegacyScope } from '@/studio/platform/legacy-scope';
import { navigateInShell } from '@/studio/platform/shell-navigation';
import { shellNotify } from '@/studio/platform/shell-chrome';
import {
  patchStudioFacadeState,
  registerStudioCommandHandler,
  resetStudioFacade,
} from '../../../engine';
import { buildStudioHistoryPatch } from './ui/studio-history';
import type {
  CylinderMeshOptions,
  ArchitectureMeshOptions,
  SceneRebuildOptions,
  ExportImageOptions,
  ExportImageResult,
  CameraSnapshotOptions,
  CameraModeOptions,
  CameraViewChangeOptions,
  ExportDialogOptions,
  ApplyExportOptions,
  UpdateCameraViewOptions,
  LightEffectOptions,
  CameraInteractionOptions,
  StudioControlElement,
  ListDragRowSession,
  PlanEditPreviewFlags,
  StudioApiRequestOptions,
  DoorPartMaterial,
  SceneItemSizeOverrides,
  SceneRefreshOptions,
} from './types/studio-app-types';
import {
  isTurntableRoundTable,
  generateId,
  composeKey,
  composeItemKey,
  materialSlabLabel,
} from './ui/studio-app-helpers';
import {
  lightPresetCatalog,
  lightIntensityFactor,
  lightAngleLimitForType,
  lightPropertyFields,
  normalizeLightPropertyValue,
  formatLightPropertyValue,
} from './lights/studio-app-light-data';
import { addBoxMesh } from "./items/studio-mesh-primitives";
import { resolveListDragDrop } from "./ui/studio-list-drag-drop";
import { buildGeometryKey, collectChildMeshes } from "./items/studio-furniture-batching";
import { precompileShaderPrograms } from "./scene/studio-shader-precompile";
import { resolveInteractionCleanup } from "./ui/studio-interaction-cleanup";
import { buildMaterialSignature, collectSharedMeshRecords } from "./items/studio-shared-mesh-records";
import { maxTextureUnitLimit, planLabelDefaultColor, planLabelAccentAlpha, shadowTextureUnits, reservedTextureUnits, minTextureSize, minPointDistance, doorTypeCatalog, createStudioDocument, normalizeMaterialOverrides, normalizeMaterialSurfaceOverrides, normalizeScenePayload, normalizePlanLabelColor } from "./scene/studio-scene-payload";
import { createFloorRecord, normalizeStudioDocument } from "./scene/studio-document-payload";
import { addArchitectureMesh as addArchitectureMeshCore, addWindowFrames as addWindowFramesCore } from "./scene/studio-box-mesh";
import {
  renderExportLayers as renderExportLayersCore,
  sanitizeExportName,
} from "./ui/studio-export-layers";
import { startupStudio } from "./boot/studio-boot";
import { buildItemModel as buildItemModelCore } from "./items/studio-item-model";
import {
  drawDoor as drawDoorCore,
  drawCourtyardArea as drawCourtyardAreaCore,
} from "../plan/studio-plan-item-drawing";
import { createOutlinePath as createOutlinePathCore, buildShapesWithHoles as buildShapesWithHolesCore, createSceneWallSideMaterial as createWallSideMaterialCore, createWallTopMaterial as createWallTopMaterialCore, expandPolygonOutward as expandPolygonOutwardCore, buildInteriorScene as buildInteriorSceneCore } from "./scene/studio-walls";
import { createStudioRenderContext } from "./studio-app/studio-render-context";
import { createStudioAppContext } from "./studio-app/studio-app-context";

let disposeActiveStudio: (() => void) | null = null;

/**
 * 引导户型图绘制（重复调用会先回收上一次）。
 *
 * 由 `StudioView.vue` 在 `onMounted` 调用、`onBeforeUnmount` 调 `teardownStudio()`。
 * 原实现以顶层 `startupStudio()` 收尾、顶层直读 DOM 契约 —— 一次性引导，视图只能整页
 * 跳转。现在整包搬入本函数内：DOM 契约、three.js 场景与全部模块状态按次重建，
 * 卸载时释放渲染器/缓存写入器/观察者与文档级残留。
 */
export function bootStudio(): void {
  const scope = createLegacyScope('studio-app');
  const innerCleanup = scope.run(() => {
  const appCtx = createStudioAppContext();

// 路由 fade 过渡期间编辑器与户型页会短暂共存；必须限定在本页根节点内查询，
  // 否则 #inspector-empty / #backup-open 等撞 id 会拿到对方 DOM（例如编辑器空态没有 <strong>）。
  const studioRootElement =
    document.querySelector(".studio-chrome-root") || document;
  const selectElement = (selectorText: any) =>
    studioRootElement.querySelector(selectorText),
  isEmbeddedStage =
    window.location.pathname ===
    "/api/v1/modules/interaction3d/stage.html",
  geometryCacheHandle: any = isEmbeddedStage ? stageStartup2?.geometryCache : null,
  isEmbedStageMode =
    isEmbeddedStage &&
    new URLSearchParams(window.location.search).get("lighting") === "region",
  defaultWallRuntimeProfile = "shader";
window.__homeosWallRuntimeProfile = defaultWallRuntimeProfile || "baseline";
const renderCacheWriter = isEmbeddedStage
  ? createRenderCache2({
      sceneId: new URLSearchParams(window.location.search).get("sceneId"),
      projectId: new URLSearchParams(window.location.search).get("projectId"),
      report: (reportPayload) => {
        document.documentElement.dataset.lightRenderCache = JSON.stringify(reportPayload);
      },
    })
  : null;
window.addEventListener("pagehide", () => renderCacheWriter?.close(), {
  once: true,
});
function sceneCacheDescriptor(descriptorWidth: any, descriptorHeight: any) {
  const floors = getPreviewFloorMode() === "all" ? appCtx.studioProject.floors : [getActiveFloor()];
  appCtx.threeCamera.updateMatrixWorld();
  const roundMatrixNumbers = (matrixElements: any) =>
      matrixElements.map(
        (matrixElementValue: any) => Math.round(matrixElementValue * 100000000) / 100000000,
      ),
    list: any = [];
  return (
    appCtx.sceneRootNode.traverse((sceneObject: any) => {
      ["background", "grid"].includes(sceneObject.userData?.exportRole) &&
        list.push([sceneObject.userData.exportRole, sceneObject.visible]);
    }),
    sha2562(
      stableCacheJSON2({
        ...(floors.some((floorRecord: any) => floorRecord.scene.items.some(isCourtyardDrawing2))
          ? {
              courtyardGeometry: "v5-foundation-finish-perimeter",
            }
          : {}),
        version: RENDER_CACHE_VERSION2,
        doorGeometry: "v2-dual-slide-tight-double",
        regionFalloff: "v2-broad",
        regionLightGain: "v3-default80",
        wallUnion: "v3-near-collinear",
        scene: cacheSceneDescriptor2(floors),
        mode: getPreviewFloorMode(),
        gap: appCtx.studioProject.previewFloorGap,
        uniformOverviewStack: appCtx.studioProject.uniformOverviewStack === true,
        ...(appCtx.studioProject.uniformOverviewStack === true
          ? {
              overviewProjection: "saved-camera-v1",
            }
          : {}),
        ...(isEmbedStageMode && appCtx.sceneStyle === "warm-wood"
          ? {
              warmRegionLighting: "v13-balanced-wash",
            }
          : {}),
        lighting: appCtx.baseLightingSettings,
        style: backgroundSettings(),
        wallOpacity: appCtx.wallOpacityValue,
        visibility: list,
        reflections: appCtx.reflectionSettingsJson,
        curtains: appCtx.curtainStructureJson,
        ...(appCtx.backgroundThemeName !== "grid"
          ? {
              backgroundTheme: "v6:" + appCtx.backgroundThemeName,
            }
          : {}),
        models: externalModelRegistry.cacheRepresentation(
          floors.flatMap((sceneItem: any) => sceneItem.scene.items),
        ),
        camera: {
          world: roundMatrixNumbers(appCtx.threeCamera.matrixWorld.elements),
          projection: roundMatrixNumbers(appCtx.threeCamera.projectionMatrix.elements),
        },
        width: descriptorWidth,
        height: descriptorHeight,
        toneMapping: appCtx.threeRenderer.toneMapping,
        exposure: appCtx.threeRenderer.toneMappingExposure,
        colorSpace: appCtx.threeRenderer.outputColorSpace,
        shadows: appCtx.threeRenderer.shadowMap.type,
      }),
    )
  );
}
const autoDiagramComponentId =
    new URLSearchParams(window.location.search).get("auto-diagram-component") || "",
  isAutoDiagramEmbed =
    new URLSearchParams(window.location.search).get("auto-diagram-embed") === "1",
  exportFolderQueryValue = new URLSearchParams(window.location.search).get("export-folder") || "",
  floorSelectionId = new URLSearchParams(window.location.search).has("floor-selection")
    ? new URLSearchParams(window.location.search).get("floor-selection")
    : null;
isAutoDiagramEmbed && document.body.classList.add("auto-diagram-embedded");
// 嵌入舞台（总览 / 展示 iframe）默认透明底：等父页 config 再决定是否显示网格/星空。
// 否则场景 JSON 默认 backgroundVisible:true 会先铺一层不透明背景，房子周围看起来「没铺满」。
if (isEmbeddedStage) {
  document.body.classList.add("is-background-hidden");
}
const planCanvasElement = selectElement("#plan-canvas"),
  planStageElement = selectElement("#plan-stage"),
  canvasEmptyElement = selectElement("#canvas-empty"),
  projectNameElement = selectElement("#project-name"),
  saveStateElement = selectElement("#save-state"),
  importPlanButton = selectElement("#import-plan"),
  planFileInput = selectElement("#plan-file"),
  toggleBackgroundButton = selectElement("#toggle-background"),
  removePlanButton = selectElement("#remove-plan"),
  addFloorButton = selectElement("#add-floor"),
  floorListElement = selectElement("#floor-list"),
  alignFloorButton = selectElement("#align-floor"),
  floorActionMenuElement = selectElement("#floor-context-menu"),
  floorRenameDialogElement = selectElement("#floor-rename-dialog"),
  floorRenameFormElement = selectElement("#floor-rename-form"),
  floorRenameInputElement = selectElement("#floor-rename-input"),
  floorDeleteDialogElement = selectElement("#floor-delete-dialog"),
  floorDeleteFormElement = selectElement("#floor-delete-form"),
  floorDeleteNameElement = selectElement("#floor-delete-name"),
  saveConflictDialogElement = selectElement("#save-conflict-dialog"),
  saveConflictLoadButton = selectElement("#save-conflict-load"),
  saveConflictOverwriteButton = selectElement("#save-conflict-overwrite"),
  studioBackLinkElement = selectElement("#studio-back-link"),
  studioExitDialogElement = selectElement("#studio-exit-dialog"),
  studioExitMessageElement = selectElement("#studio-exit-message"),
  studioExitSaveButton = selectElement("#studio-exit-save"),
  studioExitDiscardButton = selectElement("#studio-exit-discard"),
  studioExitContinueButton = selectElement("#studio-exit-continue"),
  globalWallHeightInput = selectElement("#global-wall-height"),
  globalWallThicknessInput = selectElement("#global-wall-thickness"),
  globalWallOpacityInput = selectElement("#global-wall-opacity"),
  toggleFloorEdgeButton = selectElement("#toggle-floor-edge"),
  toolButtons = [...document.querySelectorAll<StudioControlElement>("[data-tool]")],
  drawingToolSections = [...document.querySelectorAll<StudioControlElement>(".drawing-tool-section")],
    finishWallButton = selectElement("#finish-wall"),
  deleteSelectionButton = selectElement("#delete-selection"),
  activeToolLabel = selectElement("#active-tool-label"),
  toolHelpElement = selectElement("#tool-help"),
  cursorPositionElement = selectElement("#cursor-position"),
  snapIndicatorElement = selectElement("#snap-indicator"),
  snapToggleButton = selectElement("#snap-toggle"),
  snapToggleStateElement = selectElement("#snap-toggle-state"),
  snapSettingsToggleButton = selectElement("#snap-settings-toggle"),
  snapSettingsPanel = selectElement("#snap-settings-panel"),
  snapSettingControls = [...document.querySelectorAll<StudioControlElement>("[data-snap-setting]")],
  snapToleranceInput = selectElement("#snap-tolerance"),
  snapToleranceValueElement = selectElement("#snap-tolerance-value"),
  zoomValueElement = selectElement("#zoom-value"),
  scaleDialogElement = selectElement("#scale-dialog"),
  scaleFormElement = selectElement("#scale-form"),
  referencePixelsElement = selectElement("#reference-pixels"),
  referenceMetersInput = selectElement("#reference-meters"),
  lightGroupRenameDialogElement = selectElement("#light-group-rename-dialog"),
  lightGroupRenameFormElement = selectElement("#light-group-rename-form"),
  lightGroupRenameInputElement = selectElement("#light-group-rename-input"),
  lightPropertyApplyDialogElement = selectElement("#light-property-apply-dialog"),
  lightPropertyApplyFormElement = selectElement("#light-property-apply-form"),
  lightPropertyTargetListElement = selectElement("#light-property-target-list"),
  lightPropertySelectionCountElement = selectElement("#light-property-selection-count"),
  lightPropertyToggleAllButton = selectElement("#light-property-toggle-all"),
  lightPropertyApplyTitleElement = selectElement("#light-property-apply-title"),
  lightPropertyApplyValueElement = selectElement("#light-property-apply-value"),
  applyLightPropertyControls = [...document.querySelectorAll<StudioControlElement>("[data-apply-light-property]")],
  toastElement = selectElement("#toast"),
  inspectorEmptyElement = selectElement("#inspector-empty"),
  selectionInspectorElement = selectElement("#selection-inspector"),
  selectionHeadingElement = selectElement(".selection-heading"),
  selectionIdElement = selectElement("#selection-id"),
  lightPreviewNoteElement = selectElement("#light-preview-note"),
  wallFieldsElement = selectElement("#wall-fields"),
  windowFieldsElement = selectElement("#window-fields"),
  doorFieldsElement = selectElement("#door-fields"),
  railingFieldsElement = selectElement("#railing-fields"),
  itemFieldsElement = selectElement("#item-fields"),
  labelTextFieldsElement = selectElement("#label-text-fields"),
  lightFieldsElement = selectElement("#light-fields"),
  itemHeightFieldElement = selectElement("#item-height-field"),
  itemElevationFieldElement = selectElement("#item-elevation-field"),
  itemRotationFieldElement = selectElement("#item-rotation-field"),
  itemRotationActionsElement = selectElement("#item-rotation-actions"),
  itemVerticalRotationFieldElement = selectElement("#item-vertical-rotation-field"),
  itemVerticalRotationLabelElement = selectElement("#item-vertical-rotation-label"),
  itemStripOrientationHeadingElement = selectElement("#item-strip-orientation-heading"),
  itemStripRollFieldElement = selectElement("#item-strip-roll-field"),
  itemStripRollInput = selectElement("#item-strip-roll"),
  itemLightSourceVisibilityFieldElement = selectElement("#item-light-source-visibility-field"),
  itemLightSourceVisibleInput = selectElement("#item-light-source-visible"),
  curtainPositionFieldElement = selectElement("#curtain-position-field"),
  roundTableTurntableFieldElement = selectElement("#round-table-turntable-field"),
  stairDirectionFieldElement = selectElement("#stair-direction-field"),
  tvMountStyleFieldElement = selectElement("#tv-mount-style-field"),
  shoeCabinetActionsElement = selectElement("#shoe-cabinet-actions"),
  shoeCabinetMirrorButton = selectElement("#shoe-cabinet-mirror"),
  itemWidthLabelElement = selectElement("#item-width-label"),
  itemDepthLabelElement = selectElement("#item-depth-label"),
  itemHeightLabelElement = selectElement("#item-height-label"),
  pillarShapeFieldElement = selectElement("#pillar-shape-field"),
  pillarAxisFieldElement = selectElement("#pillar-axis-field"),
  stripAxisFieldElement = selectElement("#strip-axis-field"),
  materialFieldsElement = selectElement("#material-fields"),
  materialSlotListElement = selectElement("#material-slot-list"),
  materialSlotGroupsElement = selectElement("#material-slot-groups"),
  materialResetAllButton = selectElement("#material-reset-all"),
  materialSavePresetButton = selectElement("#material-save-preset"),
  materialApplySameButton = selectElement("#material-apply-same"),
  materialSummaryElement = selectElement("#material-summary"),
  materialStyleFieldElement = selectElement("#material-style-field"),
  materialStyleStripElement = selectElement("#material-style-strip"),
  materialStyleDeleteButton = selectElement("#material-style-delete"),
  materialPresetDialogElement = selectElement("#material-preset-dialog"),
  materialPresetFormElement = selectElement("#material-preset-form"),
  materialPresetNameInput = selectElement("#material-preset-name"),
  materialPresetCancelButton = selectElement("#material-preset-cancel"),
  materialApplyDialogElement = selectElement("#material-apply-dialog"),
  materialApplyFormElement = selectElement("#material-apply-form"),
  materialApplyCountElement = selectElement("#material-apply-count"),
  materialApplyCancelButton = selectElement("#material-apply-cancel"),
  inspectorGroupsElement = document.querySelectorAll<HTMLElement>(".inspector-group"),
  sceneCountsElement = selectElement("#scene-counts"),
  previewSyncControls = [...document.querySelectorAll<StudioControlElement>("[data-preview-sync]")],
  previewFloorControls = [...document.querySelectorAll<StudioControlElement>("[data-preview-floor]")],
  refreshPreviewButton = selectElement("#refresh-preview"),
  refreshLightPreviewButton = selectElement("#refresh-light-preview"),
  previewQualityStatusElement = selectElement("#preview-quality-status"),
  modelLoadingStatusElement = selectElement("#model-loading-status");
const previewLightCacheCanvasElement = selectElement("#preview-light-cache"),
  previewRenderShieldElement = selectElement("#preview-render-shield");
const cameraViewControls = [...document.querySelectorAll<StudioControlElement>("[data-camera-view]")],
  cameraRotateTopControls = [...document.querySelectorAll<StudioControlElement>("[data-camera-rotate-top]")],
  cameraModeControls = [...document.querySelectorAll<StudioControlElement>("[data-camera-mode]")],
  cameraFocalLengthControls = [...document.querySelectorAll<StudioControlElement>("[data-camera-focal-length]")],
  baseLightControlInputs = [...document.querySelectorAll<StudioControlElement>("[data-base-light-control]")],
  baseLightControlsElement = selectElement("#base-light-controls"),
  baseLightHeaderElement = baseLightControlsElement?.querySelector(".base-light-controls-header"),
  resetBaseLightingButton = selectElement("#reset-base-lighting"),
  saveBaseLightingButton = selectElement("#save-base-lighting"),
  closeBaseLightingButton = selectElement("#close-base-lighting"),
  openBaseLightingButtons = [
    selectElement("#open-base-lighting"),
    selectElement("#export-open-base-lighting"),
  ].filter(Boolean);
baseLightControlsElement &&
  baseLightControlsElement.parentElement !== document.body &&
  document.body.append(baseLightControlsElement);
const saveCameraViewButton = selectElement("#save-camera-view"),
  fixedCameraViewButton = selectElement("#fixed-camera-view"),
  floorCameraActionsElement = selectElement("#floor-camera-actions"),
  overviewCameraActionsElement = selectElement("#overview-camera-actions"),
  saveOverviewViewButton = selectElement("#save-overview-view"),
  fixedOverviewViewButton = selectElement("#fixed-overview-view"),
  previewFloorGapControlElement = selectElement("#preview-floor-gap-control"),
  previewFloorGapInput = selectElement("#preview-floor-gap"),
  previewFloorUniformControlElement = selectElement("#preview-floor-uniform-control"),
  previewFloorUniformInput = selectElement("#preview-floor-uniform"),
  exportDialogElement = selectElement("#export-dialog"),
  exportPreviewFrameElement = selectElement("#export-preview-frame"),
  exportPreviewStageElement = selectElement("#export-preview-stage"),
  exportPresetEmptyStateElement = selectElement("#export-preset-empty-state"),
  exportPresetEmptyTitleElement = selectElement("#export-preset-empty-title"),
  exportWidthInput = selectElement("#export-width"),
  exportHeightInput = selectElement("#export-height"),
  exportLockRatioInput = selectElement("#export-lock-ratio"),
  exportAspectLabelElement = selectElement("#export-aspect-label"),
  exportResolutionLabelElement = selectElement("#export-resolution-label"),
  exportStatusElement = selectElement("#export-status"),
  exportPackageButton = selectElement("#export-package"),
  exportFolderNameInput = selectElement("#export-folder-name"),
  exportSaveViewButton = selectElement("#export-save-view"),
  exportGroupFilesElement = selectElement("#export-group-files"),
  exportFloorSelectElement = selectElement("#export-floor-select"),
  exportFloorGapControlElement = selectElement("#export-floor-gap-control"),
  exportFloorGapInput = selectElement("#export-floor-gap"),
  exportPresetSlotsElement = selectElement("#export-preset-slots"),
  exportPresetAddButton = selectElement("#export-preset-add"),
  exportPresetRenameButton = selectElement("#export-preset-rename"),
  exportPresetDeleteButton = selectElement("#export-preset-delete"),
  exportPresetRenameDialogElement = selectElement("#export-preset-rename-dialog"),
  exportPresetRenameFormElement = selectElement("#export-preset-rename-form"),
  exportPresetRenameInputElement = selectElement("#export-preset-rename-input"),
  exportPresetDeleteDialogElement = selectElement("#export-preset-delete-dialog"),
  exportPresetDeleteFormElement = selectElement("#export-preset-delete-form"),
  exportPresetDeleteNameElement = selectElement("#export-preset-delete-name"),
  exportOverwriteDialogElement = selectElement("#export-overwrite-dialog"),
  exportOverwriteNameElement = selectElement("#export-overwrite-name"),
  exportCompleteDialogElement = selectElement("#export-complete-dialog"),
  exportCompleteTitleElement = selectElement("#export-complete-title"),
  exportCompleteMessageElement = selectElement("#export-complete-message"),
  exportCompletePathElement = selectElement("#export-complete-path"),
  studioShellElement = selectElement(".studio-shell"),
  detailsPanelElement = selectElement(".details-panel"),
  detailsResizerElement = selectElement("#details-resizer"),
  assetCategoryButtons = [...document.querySelectorAll<StudioControlElement>("[data-asset-category]")],
  assetHeadingCategoryControls = [...document.querySelectorAll<StudioControlElement>("[data-asset-heading-category]")],
  itemTypeButtons = [...document.querySelectorAll<StudioControlElement>("[data-item-type]")],
  assetGridElement = selectElement("#asset-grid"),
  assetSearchInput = selectElement("#asset-search"),
  assetSearchEmptyElement = selectElement("#asset-search-empty"),
  /** 模型名溢出时循环滚动（灯具模板卡由模块内部跳过）。 */
  libraryNameScroll = installLibraryNameScroll(itemTypeButtons),
  lightAssetRowElement = selectElement("#light-asset-row"),
  lightLayerPanelElement = selectElement("#light-layer-panel"),
  lightGroupListElement = selectElement("#light-group-list"),
  addLightGroupButton = selectElement("#add-light-group"),
  lightGroupsOffButton = selectElement("#light-groups-off"),
  lightGroupActionMenuElement = selectElement("#light-group-context-menu"),
  lightGroupAreaDialogElement = selectElement("#light-group-area-dialog"),
  lightGroupAreaFormElement = selectElement("#light-group-area-form"),
  lightGroupAreaSelectElement = selectElement("#light-group-area-select"),
  lightGroupAreaNameElement = selectElement("#light-group-area-name"),
  lampsLayerIndex = 2;
function checkModelInUse(modelKey: any) {
  return !!appCtx.studioProject?.floors?.some((floorSelection: any) =>
    floorSelection.scene?.items?.some((floorItem: any) => {
      if (modelKey.startsWith("tv_")) {
        const tvMountStyle = tvMountStyleSet.has(floorItem.tvMountStyle)
          ? floorItem.tvMountStyle
          : "standard";
        return floorItem.type === "tv" && modelKey === "tv_" + tvMountStyle;
      }
      if (modelKey.startsWith("pillar_")) {
        const pillarShape = modelKey.slice("pillar_".length);
        return (
          floorItem.type === "pillar" &&
          normalizePillarShape2(floorItem.pillarShape) === pillarShape
        );
      }
      return floorItem.type === modelKey;
    }),
  );
}
function collectScenePayload(
  floorRecords: any[] = [],
  { includeCurtains: includeCurtainFlag = false } = {},
) {
  return [
    ...new Set(
      floorRecords.flatMap((floorEntry) =>
        (floorEntry?.scene?.items || [])
          .filter((itemEntry: any) => includeCurtainFlag || itemEntry.type !== "curtain")
          .map((itemRecord: any) => modelTypeForItem(itemRecord))
          .filter((assetModelKey: any) => (ALL_ITEM_MODELS2 as any)[assetModelKey]),
      ),
    ),
  ];
}
function collectSelectedFloors() {
  const activeFloorRecords =
    getPreviewFloorMode() === "all"
      ? appCtx.studioProject?.floors || []
      : [getActiveFloor()].filter(Boolean);
  return collectScenePayload(activeFloorRecords);
}
const modelAssetLoader = createModelAssetLoader2({
  THREE: ns2,
  GLTFLoader: GLTFLoader2,
  createDracoLoader(loaderConfig: any) {
    const dracoLoader = new SameOriginDRACOLoader2(
      "/static/3d-studio/export/draco-decoder-worker.js",
      loaderConfig,
    );
    return (
      dracoLoader.setDecoderPath("/static/vendor/three/0.186.0/draco/"),
      dracoLoader.setDecoderConfig({
        type: "wasm",
      }),
      dracoLoader.setWorkerLimit(1),
      dracoLoader
    );
  },
});
const modelPresentationState = {
  presented: false,
  pending: false,
};
const assetLoaderState = {
  revision: 0,
  disposed: false,
};
window.addEventListener(
  "pagehide",
  () => {
    assetLoaderState.disposed = true;
  },
  {
    once: true,
  },
);
((window.externalModelLoadsDeferred = false),
  (window.__homeosDeferExternalModel = (modelTypeName) => {
    modelTypeName &&
      (appCtx.deferredModelTypes.includes(modelTypeName) || appCtx.deferredModelTypes.push(modelTypeName),
      scheduleModelLoadFlush());
  }));
function scheduleModelLoadFlush(flushDelayMs = 900) {
  (window.clearTimeout(appCtx.modelLoadDebounceId),
    (appCtx.modelLoadDebounceId = window.setTimeout(
      () => {
        if (
          ((appCtx.modelLoadDebounceId = null),
          !appCtx.isExternalModelLoadDeferred || document.hidden || appCtx.isWindowHidden || appCtx.isRenderSuppressed)
        ) {
          appCtx.isExternalModelLoadDeferred && scheduleModelLoadFlush(300);
          return;
        }
        const uniqueModelTypes = [...new Set(appCtx.deferredModelTypes)];
        ((appCtx.deferredModelTypes = []), Promise.allSettled(loadModelsForTypes(uniqueModelTypes)));
      },
      Math.max(0, flushDelayMs),
    )));
}
function loadModelsForTypes(requestedModelTypes: any[] = []) {
  (window.clearTimeout(appCtx.modelLoadDebounceId),
    (appCtx.modelLoadDebounceId = null),
    (appCtx.isExternalModelLoadDeferred = false),
    (window.externalModelLoadsDeferred = false));
  const filter = [...new Set(requestedModelTypes)].filter(
    (modelTypeFilterKey) => (ALL_ITEM_MODELS2 as any)[modelTypeFilterKey],
  );
  if (!filter.length) return [];
  window.__homeosReleasingDeferredModels = true;
  const map = filter.map((modelTypeEntry) => ensureExternalModelLoaded(modelTypeEntry));
  return ((window.__homeosReleasingDeferredModels = false), map);
}
function preloadDefaultModels() {
  return loadModelsForTypes(collectSelectedFloors());
}
function requestSceneRender() {
  if (typeof appCtx.isExternalModelPending < "u" && appCtx.isExternalModelPending) {
    appCtx.isModelLoadPending = true;
    return;
  }
  if (isAutoDiagramEmbed || appCtx.isModelLoadDeferred) {
    publishModelLoadState();
    return;
  }
  ((appCtx.isModelLoadPending = true),
    publishModelLoadState(),
    appCtx.isModelLoadPending &&
      (appCtx.isWindowHidden ||
        appCtx.isRenderSuppressed ||
        (appCtx.modelLoadTimeoutId === null &&
          (appCtx.modelLoadTimeoutId = window.setTimeout(() => {
            ((appCtx.modelLoadTimeoutId = null),
              !(appCtx.isWindowHidden || appCtx.isRenderSuppressed) && finishModelLoad());
          }, 500)))));
}
function finishModelLoad() {
  (!appCtx.isModelLoadPending && !isAutoDiagramEmbed && !appCtx.isModelLoadDeferred) ||
    ((appCtx.isModelLoadPending = false),
    window.clearTimeout(appCtx.modelLoadTimeoutId),
    (appCtx.modelLoadTimeoutId = null),
    (appCtx.replacementFrameCount += 1),
    publishModelLoadState(),
    typeof appCtx.isRuntimeWarmupDone < "u" &&
      isEmbeddedStage &&
      appCtx.sceneRootNode?.children?.length &&
      (appCtx.isRuntimeWarmupDone = true),
    requestSceneRebuild({
      force: true,
      precompile: true,
      externalModelsOnly: true,
    }),
    window.requestAnimationFrame(() => {
      ((appCtx.replacementFrameCount -= 1), publishModelLoadState());
    }));
}
const externalModelRegistry = createExternalModelManager2({
    THREE: ns2,
    geometryCache: isEmbeddedStage ? stageStartup2?.furnitureCache : null,
    loader: modelAssetLoader,
    stairItemTypes: stairItemTypeSet,
    isModelInUse: checkModelInUse,
    requestRender: requestSceneRender,
    onLoadStateChange: publishModelLoadState,
    maxConcurrentLoads: 2,
  }),
  {
    loadExternalItemModel: ensureExternalModelLoaded,
    preloadPersistentModels: preloadPersistentModels,
    modelTypeForItem: modelTypeForItem,
  } = externalModelRegistry;
/** 楼层文档净化需要的外部状态（见 `scene/studio-document-payload`）：注册表 + 当前项目（只读默认层高）。 */
// `studioProject` 用 getter 转发：它在 `let` 声明（约 1222 行）之前就可能被这里**构造** deps，
// 取值必须推迟到目标函数真正读它的那一刻，否则会把「只读一次」变成「构造即读」，
// 在声明的 TDZ 里炸（原实现只有 createFloorRecord 那一支会读它）。
const studioDocumentDeps = () => ({
  externalModelRegistry,
  get studioProject() {
    return appCtx.studioProject;
  },
});
/** 「材质属性」检查面板的运行态。 */
appCtx.expandedMaterialSurfaceSlots = new Set();
function publishModelLoadState(modelLoaderEntry = externalModelRegistry.modelLoadState()) {
  const pending = modelLoaderEntry.pending ?? modelLoaderEntry.active + modelLoaderEntry.queued,
    isModelLoadSettled = appCtx.isModelLoadActive && pending === 0;
  if (
    ((appCtx.isModelLoadActive = pending > 0),
    !pending &&
      appCtx.isModelLoadPending &&
      !isAutoDiagramEmbed &&
      !appCtx.isModelLoadDeferred &&
      !appCtx.isWindowHidden &&
      !appCtx.isRenderSuppressed &&
      (typeof appCtx.isExternalModelPending > "u" || !appCtx.isExternalModelPending))
  ) {
    finishModelLoad();
    return;
  }
  isModelLoadSettled && !appCtx.isModelLoadPending && appCtx.replacementFrameCount === 0 && renderStudioFrame();
  const hn2 = pending > 0 || appCtx.isModelLoadPending || appCtx.replacementFrameCount > 0;
  (updateModelLoadIndicator(modelLoaderEntry, hn2),
    modelLoadingStatusElement &&
      (appCtx.orbitControls && !appCtx.isInteractionLocked && (appCtx.orbitControls.enabled = !hn2),
      (modelLoadingStatusElement.hidden = !hn2),
      modelLoadingStatusElement
        .querySelector("span:last-child")
        ?.replaceChildren(
          document.createTextNode(
            pending > 0 ? "正在加载模型… " + pending : hn2 ? "正在完成模型…" : "",
          ),
        )));

  appCtx.isMaterialSlotPanelPending &&
    appCtx.selectedItem?.kind === "item" &&
    renderMaterialSlotPanel(getSelectedObject());
}
function emitRuntimeDiagnostic(eventName: any, timingRecord: Record<string, any> = {}) {
  try {
    if (!isEmbeddedStage && ["gpu-lost", "gpu-restored"].includes(eventName)) {
      const isContextRestored = eventName === "gpu-restored",
        contextCanvas = appCtx.threeRenderer?.domElement;
      (window.HomeOSLog?.report as any)?.(
        isContextRestored ? "success" : "warning",
        "3D 图形",
        isContextRestored
          ? "3D 图形上下文已恢复，正在重建画面与阴影缓存"
          : "3D 图形上下文已丢失，预览暂时停止，等待浏览器恢复",
        {
          phase: "studio-webgl-context",
          code: eventName,
        },
        "画布像素：" +
          (contextCanvas?.width || 0) +
          " × " +
          (contextCanvas?.height || 0) +
          "\n像素比：" +
          (appCtx.threeRenderer?.getPixelRatio?.() || 1),
      );
      return;
    }
    if (
      !isEmbeddedStage ||
      window.parent === window ||
      ![
        "category-switch-start",
        "category-switch-applied",
        "source-adopt-start",
        "source-adopt-complete",
        "source-adopt-failed",
        "gpu-lost",
        "gpu-restored",
        "models-loading-resumed",
        "models-completion-resumed",
      ].includes(eventName)
    )
      return;
    const options: Record<string, any> = {};
    for (const timingKey of [
      "sourceRevision",
      "floorCount",
      "durationMs",
      "pending",
      "active",
      "queued",
      "replacementFrames",
      "fromCategory",
      "toCategory",
      "mapPixels",
      "mapTextures",
    ])
      typeof timingRecord?.[timingKey] == "number" &&
        Number.isFinite(timingRecord[timingKey]) &&
        (options[timingKey] = Math.max(0, Math.min(1000000000, timingRecord[timingKey])));
    if (
      (eventName.startsWith("gpu-") || eventName.startsWith("category-switch-")) &&
      typeof appCtx.threeRenderer < "u"
    ) {
      if (eventName.startsWith("category-switch-")) {
        const rendererSnapshot = appCtx.threeRenderer?.info;
        for (const [metricKey, metricValue] of Object.entries({
          geometries: rendererSnapshot?.memory?.geometries,
          textures: rendererSnapshot?.memory?.textures,
          programs: rendererSnapshot?.programs?.length,
        }))
          typeof metricValue == "number" &&
            Number.isFinite(metricValue) &&
            (options[metricKey] = Math.max(0, Math.min(1000000000, metricValue)));
      }
      const runtimeStatsReport = {
        width: appCtx.threeRenderer?.domElement?.width,
        height: appCtx.threeRenderer?.domElement?.height,
        dpr: appCtx.threeRenderer?.getPixelRatio?.(),
      };
      for (const [statKey, statValue] of Object.entries(runtimeStatsReport))
        typeof statValue == "number" &&
          Number.isFinite(statValue) &&
          (options[statKey] = Math.max(0, Math.min(1000000000, statValue)));
    }
    (typeof timingRecord?.replacementPending == "boolean" &&
      (options.replacementPending = timingRecord.replacementPending),
      window.parent.postMessage(
        {
          channel: "hb-i3d-v1",
          type: "runtime-diagnostic",
          code: eventName,
          counts: options,
        },
        window.location.origin,
      ));
  } catch { /* Worker / 广播通道不可用（环境不支持或扩展未加载）：功能降级为单通道，不影响主流程 */ }
}
function updateModelLoadIndicator(loadStateSnapshot: any, isPresentationPending: any) {
  try {
    const pending2 = modelPresentationState.pending;
    if (
      ((modelPresentationState.pending = isPresentationPending),
      !modelPresentationState.presented || pending2 || !isPresentationPending)
    )
      return;
    const pending3 =
      loadStateSnapshot.pending ?? loadStateSnapshot.active + loadStateSnapshot.queued;
    emitRuntimeDiagnostic(pending3 > 0 ? "models-loading-resumed" : "models-completion-resumed", {
      pending: pending3,
      active: loadStateSnapshot.active,
      queued: loadStateSnapshot.queued,
      replacementPending: appCtx.isModelLoadPending,
      replacementFrames: appCtx.replacementFrameCount,
    });
  } catch { /* 诊断上报 best-effort：加载状态快照上报失败不应中断加载流程 */ }
}
const floorGroupCacheByKey = new Map(),
  materialCacheByKey = new Map(),
  geometryCacheByKey = new Map(),
  textureCacheByKey = new Map(),
  instanceTestTypeSet = new Set([
    "airer",
    "fan",
    "speaker",
    "tv",
    "smallcar",
    "suv",
    "scooter",
    "planlabel",
    "downlight",
    "ceilinglight",
    "striplight",
  ]),
  optimizedItemKeySet = new Set(),
  nextTenItemTypeSet = new Set([
    "aquarium",
    "bed",
    "nightstand",
    "curtain",
    "vanity",
    "desk",
    "bookcase",
    "piano",
    "table",
    "rounddiningtable",
  ]),
  optimizationItemTypeSet = new Set([
    "drawer-chest",
    "wardrobe",
    "office-chair",
    "bunk-bed",
    "pool-table",
    "tea-table-set",
    "coffeetable",
    "squarecoffeetable",
    "tvstand",
    "rug",
    "plant",
    "bed",
    "nightstand",
    "vanity",
    "desk",
    "bookcase",
    "aquarium",
    "curtain",
    "table",
    "rounddiningtable",
    "rounddiningtableturntable",
    "chair",
    "bar",
    "sideboard",
    "shoecabinet",
    "cabinet",
    "glasscabinet",
    "shelf",
    "wallcabinet",
    "kitchenbase",
    "kitchensink",
    "kitchencooktop",
    "kitchenisland",
    "basin",
    "toilet",
    "squattoilet",
    "urinal",
    "shower",
    "bathtub",
    "glasspartition",
    "stairs",
    "pillar",
  ]),
  applianceOptimizationTypeSet = new Set([
    "smart-socket-86",
    "router",
    "humidifier",
    "dehumidifier",
    "heater",
    "tv",
    "wallac",
    "floorac",
    "airpurifier",
    "robotvacuum",
    "floorlamp",
    "walllamp",
    "fridge",
    "freezer",
    "rangehood",
    "dishwasher",
    "steamoven",
    "microwave",
    "ricecooker",
    "washer",
    "dryer",
    "storagewaterheater",
    "gaswaterheater",
    "desktop",
    "laptop",
    "nas",
    "printer",
  ]);
/** 某物件的模型加载选项 = 当前主题调色板 + 该物件自己的材质档位 + 该物件自己的覆盖色+ 该物件自己的逐槽表面参数。 */
function materialLoadOptionsForItem(itemRecordRef: any) {
  const itemModelType = externalModelRegistry.modelTypeForItem(itemRecordRef),
    itemMaterialStyle = normalizeMaterialStyle(itemModelType, itemRecordRef?.materialStyle),
    itemMaterialOverrides =
      itemRecordRef?.materialOverrides &&
      typeof itemRecordRef.materialOverrides == "object" &&
      !Array.isArray(itemRecordRef.materialOverrides)
        ? itemRecordRef.materialOverrides
        : null,
    itemMaterialSurfaceOverrides = normalizeMaterialSurfaceOverrides(
      itemRecordRef?.materialSurfaceOverrides,
    ),
    materialOverrideEntries = itemMaterialOverrides ? Object.keys(itemMaterialOverrides) : [],
    materialSurfaceOverrideEntries = Object.keys(itemMaterialSurfaceOverrides);
  const itemLoadOptions = {
    ...backgroundSettings(),
    ...materialStylePaletteColors(itemModelType, itemMaterialStyle),
  };
  itemMaterialStyle !== MATERIAL_STYLE_AUTO && (itemLoadOptions.materialStyle = itemMaterialStyle);
  materialOverrideEntries.length && (itemLoadOptions.materialOverrides = itemMaterialOverrides);
  materialSurfaceOverrideEntries.length &&
    (itemLoadOptions.materialSurfaceOverrides = itemMaterialSurfaceOverrides);
  return itemLoadOptions;
}
function applyItemOptimization(
  modelSource: any,
  itemRecordRef: any,
  modelLoadOptions = materialLoadOptionsForItem(itemRecordRef),
) {
  const addExternalItemModel = externalModelRegistry.addExternalItemModel(
    modelSource,
    itemRecordRef,
    modelLoadOptions,
    {
      selected: createSelectionRef("item", itemRecordRef.id),
      staticMaterialKey: buildStaticMaterialKey,
      staticVertexTint: isEmbeddedStage,
    },
  );
  return (publishModelLoadState(), addExternalItemModel);
}
const toolHelpMessages = {
    "courtyard-area": [
      "庭院地面",
      "圈出区域或拖画矩形，选择草坪、木平台、铺装；靠近墙面吸附，Enter 完成",
    ],
    "courtyard-path": ["汀步路径", "逐点画路线，自动排列汀步；Enter 完成，Esc 取消"],
    "courtyard-gate": ["庭院门", "靠近围挡预览门洞，点击放置；门款在右侧属性栏选择，Esc 退出"],
    "courtyard-fence": ["庭院围挡", "逐点画路线，选择矮墙、木栅或绿篱；Enter 完成"],
    flooropening: [
      "楼板洞口",
      "拖出矩形洞口；仅切除当前层楼板，楼梯通往上层时请在上层开洞。Esc 取消",
    ],
    select: [
      "选择工具",
      "移动时 Shift 锁轴；缩放时 Shift 等比例；Option/Alt 拖动复制；⌘/Ctrl+C、V 复制粘贴",
    ],
    pan: ["平移画布", "按住左键拖动即可平移画布；滚轮缩放；中键或按住空格拖动同样可平移"],
    scale: ["参考线工具", "依次单击两个端点；按住 Shift 强制锁定水平或垂直轴线"],
    wall: ["连续画墙", "逐点绘制并回到起点闭合空间；未闭合不会生成地面，按住 Shift 锁轴，Esc 结束"],
    window: ["窗户工具", "靠近墙体单击，窗户会自动吸附并生成真实窗洞"],
    door: ["门工具", "靠近墙体单击，门会自动吸附并生成门洞；选中后可翻转开启方向"],
    railing: ["玻璃栏杆", "靠近墙体单击，栏杆会吸附到墙段并替换对应的实体墙"],
    label: ["户型铭牌", "单击画布放置；选中后可修改文字、拖动、缩放和旋转"],
  },
  isStudioEntry =
    isEmbeddedStage ||
    /^\/3d-studio\/?$/.test(window.location.pathname),
  planCanvasRenderer = planCanvasElement.getContext("2d"),
  overlayCanvasElement = document.createElement("canvas"),
  overlayCanvasRenderer = overlayCanvasElement.getContext("2d"),
  {
    drawMetricGrid: drawSelectionRect,
    drawLine: drawGuideSegment,
    drawPoint: drawPointMarker,
    drawOpenEndpointWarning: drawPolygonPath,
    drawFloatingLabel: drawLabelText,
  } = createPlanDrawingTools2({
    context: planCanvasRenderer,
    planToScreen: planToScreen,
    screenToPlan: screenToPlan,
    pixelsPerMeter: getPixelsPerMeter,
    getCanvasSize: () => ({
      width: appCtx.planViewWidth,
      height: appCtx.planViewHeight,
    }),
    getViewZoom: () => appCtx.planView.zoom,
  });
appCtx.studioState = createStudioDocument();
const activeDoorType = "solid";
appCtx.expandedAreaIds = new Set();
/** 灯光面板的区域改为只读，唯一来源是 HA 区域注册表（后端 /ha/areas 已同步的数据）。 */
const dirtyFloorIdSet = new Set();
const wallJoinCacheByWall = new WeakMap();
const defaultExportWidth = 1852,
  defaultExportHeight = 1293;
appCtx.exportAspectRatio = defaultExportWidth / defaultExportHeight;
appCtx.baseLightingSettings = normalizeBaseLighting2(DEFAULT_BASE_LIGHTING2);
try {
  typeof BroadcastChannel == "function" &&
    (appCtx.lightPreviewWorker = new BroadcastChannel("homeos-studio3d-base-lighting-v1"));
} catch { /* Worker / 广播通道不可用（环境不支持或扩展未加载）：功能降级为单通道，不影响主流程 */ }
appCtx.lightGroupCacheByFloor = new Map();
appCtx.lightGainByFloor = new Map();
const disposedMaterialSet = new WeakSet();
const precompiledMaterialKeySet = new Set(),
  maxPrecompileBatchSize = 16;
function getActiveFloor() {
  const oe2 = appCtx.pendingRuntimeSettings?.selectedFloorId || appCtx.activeFloorId;
  return (
    appCtx.studioProject?.floors.find((floorMatch: any) => floorMatch.id === oe2) ||
    appCtx.studioProject?.floors[0] ||
    null
  );
}
function captureStudioSnapshot() {
  return structuredClone(appCtx.studioProject || normalizeStudioDocument(appCtx.studioState, studioDocumentDeps()));
}
function getLocalSaveRevision() {
  const runtimeSnapshot = captureStudioSnapshot();
  if (!appCtx.pendingRuntimeSettings) return runtimeSnapshot;
  runtimeSnapshot.previewFloorMode = appCtx.pendingRuntimeSettings.floorMode;
  for (const snapshotFloor of runtimeSnapshot.floors || []) {
    const floorCameraSetting = appCtx.pendingRuntimeSettings.floorCameraSettings.get(snapshotFloor.id);
    floorCameraSetting &&
      ((snapshotFloor.scene.settings.cameraMode = floorCameraSetting.mode),
      (snapshotFloor.scene.settings.cameraView = floorCameraSetting.view),
      (snapshotFloor.scene.settings.cameraTopRotation = floorCameraSetting.topRotation),
      (snapshotFloor.scene.settings.cameraFocalLength = floorCameraSetting.focalLength));
  }
  return (
    (runtimeSnapshot.combinedCameraSettings = {
      ...appCtx.pendingRuntimeSettings.combinedCameraSettings,
    }),
    runtimeSnapshot
  );
}
function uniqueFloorName(baseName: any, currentFloorId = "") {
  const set = new Set(
    (appCtx.studioProject?.floors || [])
      .filter((otherFloor: any) => otherFloor.id !== currentFloorId)
      .map((otherFloorName: any) => otherFloorName.name),
  );
  if (!set.has(baseName)) return baseName;
  let num = 2;
  for (; set.has(baseName + " " + num);) num += 1;
  return baseName + " " + num;
}
function hideFloorActionMenu() {
  ((floorActionMenuElement.hidden = true), (appCtx.pendingFloorMenuId = ""));
}
function showFloorActionMenu(floorRow: any, menuOpenEvent: any) {
  appCtx.pendingFloorMenuId = floorRow.id;
  const selector = floorActionMenuElement.querySelector('[data-floor-action="delete"]');
  ((selector.disabled = appCtx.studioProject.floors.length <= 1),
    (floorActionMenuElement.hidden = false),
    (floorActionMenuElement.style.left =
      Math.min(menuOpenEvent.clientX, window.innerWidth - 116) + "px"),
    (floorActionMenuElement.style.top =
      Math.min(menuOpenEvent.clientY, window.innerHeight - 82) + "px"));
}
function floorActionHandler(floorToDelete: any) {
  !floorToDelete ||
    appCtx.studioProject.floors.length <= 1 ||
    ((appCtx.pendingFloorDeleteId = floorToDelete.id),
    (floorDeleteNameElement.textContent = floorToDelete.name),
    floorDeleteDialogElement.showModal());
}
function closeFloorDeleteDialog() {
  ((appCtx.pendingFloorDeleteId = ""), floorDeleteDialogElement.open && floorDeleteDialogElement.close());
}
async function confirmFloorDelete() {
  const deletedFloor = appCtx.studioProject.floors.find(
    (floorEntryMatch: any) => floorEntryMatch.id === appCtx.pendingFloorDeleteId,
  );
  if ((closeFloorDeleteDialog(), !deletedFloor || appCtx.studioProject.floors.length <= 1)) return;
  const deletedFloorIndex = appCtx.studioProject.floors.findIndex(
    (floorIndexMatch: any) => floorIndexMatch.id === deletedFloor.id,
  );
  (appCtx.studioProject.floors.splice(deletedFloorIndex, 1),
    appCtx.studioProject.floors.forEach((elevationFloor: any, floorOrderIndex: any) => {
      elevationFloor.elevation = floorOrderIndex * appCtx.studioProject.defaultFloorHeight;
    }));
  const nextActiveFloor =
    appCtx.studioProject.floors[Math.max(0, deletedFloorIndex - 1)] || appCtx.studioProject.floors[0];
  (await selectFloor(nextActiveFloor.id, {
    persist: false,
  }),
    updateFloorPreviewButtons(),
    markDocumentDirty(),
    showToast("已删除“" + deletedFloor.name + "”。", "success"));
}
function openFloorRenameDialog(floorToRename: any) {
  floorToRename &&
    ((appCtx.pendingFloorMenuId = floorToRename.id),
    (floorRenameInputElement.value = floorToRename.name),
    floorRenameDialogElement.showModal(),
    requestAnimationFrame(() => floorRenameInputElement.select()));
}
function syncGlobalControls() {
  if (appCtx.studioProject) {
    floorListElement.replaceChildren();
    for (const floorRowRecord of appCtx.studioProject.floors) {
      const element = document.createElement("div");
      ((element.className =
        "floor-row" +
        (floorRowRecord.id === appCtx.activeFloorId ? " active" : "") +
        (floorRowRecord.aligned ? "" : " unaligned")),
        (element.dataset.floorId = floorRowRecord.id),
        (element.draggable = true),
        element.setAttribute(
          "aria-label",
          floorRowRecord.name +
            "，" +
            (floorRowRecord.id === appCtx.activeFloorId ? "当前楼层，" : "") +
            "长按拖动排序，右键可重命名或删除",
        ));
      let isFloorDropAfter = false,
        longPressTimeoutId: any = null;
      const cancelLongPress = () => {
        (longPressTimeoutId && clearTimeout(longPressTimeoutId),
          (longPressTimeoutId = null),
          (isFloorDropAfter = false),
          element.classList.remove("drag-ready"));
      };
      (element.addEventListener("pointerdown", (pointerDownEvent) => {
        pointerDownEvent.button !== 0 ||
          (pointerDownEvent.target instanceof Element &&
            pointerDownEvent.target.closest("button")) ||
          (cancelLongPress(),
          (longPressTimeoutId = setTimeout(() => {
            ((longPressTimeoutId = null),
              (isFloorDropAfter = true),
              element.classList.add("drag-ready"));
          }, 280)));
      }),
        element.addEventListener("pointerup", cancelLongPress),
        element.addEventListener("pointercancel", cancelLongPress),
        element.addEventListener("dragstart", (dragStartEvent) => {
          if (!isFloorDropAfter) {
            (dragStartEvent.preventDefault(), cancelLongPress());
            return;
          }
          ((appCtx.movingFloorId = floorRowRecord.id),
            element.classList.remove("drag-ready"),
            element.classList.add("dragging"),
            (dragStartEvent.dataTransfer!.effectAllowed = "move"),
            dragStartEvent.dataTransfer!.setData(
              "application/x-homeos-floor",
              floorRowRecord.id,
            ));
        }),
        element.addEventListener("dragend", () => {
          ((appCtx.movingFloorId = ""),
            element.classList.remove("dragging"),
            cancelLongPress(),
            clearDropIndicator());
        }),
        element.addEventListener("dragover", (dragOverEvent) => {
          if (!appCtx.movingFloorId || appCtx.movingFloorId === floorRowRecord.id) return;
          (dragOverEvent.preventDefault(), clearDropIndicator());
          const isDropAfterPointer =
            dragOverEvent.clientY >=
            element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2;
          ((element.dataset.dropPosition = isDropAfterPointer ? "after" : "before"),
            element.classList.add(isDropAfterPointer ? "drop-after" : "drop-before"),
            dragOverEvent.dataTransfer && (dragOverEvent.dataTransfer.dropEffect = "move"));
        }),
        element.addEventListener("drop", (dropEvent) => {
          if (!appCtx.movingFloorId || appCtx.movingFloorId === floorRowRecord.id) return;
          dropEvent.preventDefault();
          const rr2 = appCtx.movingFloorId,
            isDropPositionAfter = element.dataset.dropPosition === "after";
          ((appCtx.movingFloorId = ""),
            clearDropIndicator(),
            moveFloorRow(rr2, floorRowRecord.id, isDropPositionAfter));
        }));
      const floorSwitchButton = document.createElement("button");
      ((floorSwitchButton.type = "button"),
        (floorSwitchButton.textContent = floorRowRecord.id === appCtx.activeFloorId ? "●" : "○"),
        (floorSwitchButton.title = "切换到" + floorRowRecord.name),
        floorSwitchButton.addEventListener("click", (switchClickEvent) => {
          (switchClickEvent.stopPropagation(),
            selectFloor(floorRowRecord.id, {
              persist: true,
            }));
        }));
      const floorNameLabel = document.createElement("span");
      ((floorNameLabel.textContent = floorRowRecord.name),
        (floorNameLabel.title = "长按后拖动可调整楼层顺序，右键可重命名或删除楼层"));
      const floorStatusNote = document.createElement("small"),
        floorRowIndex = appCtx.studioProject.floors.findIndex(
          (floorIndexEntry: any) => floorIndexEntry.id === floorRowRecord.id,
        );
      ((floorStatusNote.textContent =
        floorRowIndex === 0 ? "基准" : floorRowRecord.aligned ? "已对齐" : "待对齐"),
        element.addEventListener("click", () => {
          selectFloor(floorRowRecord.id, {
            persist: true,
          });
        }),
        element.addEventListener("contextmenu", (rowActionMenuEvent) => {
          (rowActionMenuEvent.preventDefault(),
            showFloorActionMenu(floorRowRecord, rowActionMenuEvent));
        }),
        element.append(floorSwitchButton, floorNameLabel, floorStatusNote),
        floorListElement.append(element));
    }
    renderFloorList();
  }
}
function clearDropIndicator() {
  for (const dropIndicatorElement of floorListElement.querySelectorAll(".floor-row"))
    (dropIndicatorElement.classList.remove("drop-before", "drop-after"),
      delete dropIndicatorElement.dataset.dropPosition);
}
function moveFloorRow(draggedFloorId: any, targetFloorId: any, dropAfterFlag: any) {
  const reorderedFloors = reorderFloors2(
    appCtx.studioProject.floors,
    draggedFloorId,
    targetFloorId,
    dropAfterFlag,
    appCtx.studioProject.defaultFloorHeight,
  );
  if (reorderedFloors === appCtx.studioProject.floors) return;
  const movedFloor = appCtx.studioProject.floors.find(
    (movedFloorMatch: any) => movedFloorMatch.id === draggedFloorId,
  );
  ((appCtx.studioProject.floors = reorderedFloors),
    syncGlobalControls(),
    updateFloorPreviewButtons(),
    renderFloorList(),
    requestSceneRebuild({
      force: true,
    }),
    markDocumentDirty(),
    movedFloor && showToast("已调整“" + movedFloor.name + "”的楼层顺序。", "success"));
}
function renderFloorList() {
  const ae2 = getActiveFloor(),
    activeFloorIndex = ae2
      ? appCtx.studioProject.floors.findIndex((activeFloorMatch: any) => activeFloorMatch.id === ae2.id)
      : -1,
    canAlignFloor = appCtx.studioProject.floors.length > 1 && activeFloorIndex > 0;
  ((alignFloorButton.hidden = !canAlignFloor),
    (alignFloorButton.disabled = !canAlignFloor || !ae2?.scene?.calibration),
    (alignFloorButton.textContent = ae2?.aligned ? "重新对齐" : "对齐楼层"),
    appCtx.alignmentState?.stage === "reference"
      ? ((activeToolLabel.textContent = "楼层对齐 · 参照层"),
        (toolHelpElement.textContent =
          "点击" + appCtx.alignmentState.referenceFloor.name + "上的楼梯角、墙角或柱点；Esc 取消"))
      : appCtx.alignmentState?.stage === "current" &&
        ((activeToolLabel.textContent = "楼层对齐 · 当前层"),
        (toolHelpElement.textContent =
          "点击" + ae2.name + "上的相同位置；系统会自动重合上下楼层")));
}
async function selectFloor(targetFloorIdSelection: any, { persist: didFloorChange = false } = {}) {
  const targetFloor = appCtx.studioProject?.floors.find(
    (floorLookup: any) => floorLookup.id === targetFloorIdSelection,
  );
  if (!targetFloor) return;
  const selectionRequestId = ++appCtx.floorSelectionRequestId,
    tu2 = getPreviewFloorMode() === "all" ? captureOverviewCamera() : null;
  (appCtx.alignmentState?.floorId !== targetFloor.id && (appCtx.alignmentState = null),
    (appCtx.activeFloorId = targetFloor.id),
    (appCtx.studioProject.activeFloorId = targetFloor.id),
    (appCtx.studioState = targetFloor.scene),
    (appCtx.activeLightGroupId = ""),
    refreshSelection(),
    refreshPreviewScene(),
    planPainter?.setTool(appCtx.activeToolName),
    (appCtx.previewEndPoint = null),
    (appCtx.undoRecords = []),
    (appCtx.redoRecords = []),
    (appCtx.planView.rotation = appCtx.studioState.settings.planViewRotation),
    Promise.allSettled(preloadDefaultModels()));
  const gu2 = loadBackgroundImage();
  (isEmbeddedStage || (await gu2),
    !(selectionRequestId !== appCtx.floorSelectionRequestId || appCtx.activeFloorId !== targetFloor.id) &&
      (refreshScopeItems(),
      renderFloorList(),
      resetView(),
      requestAnimationFrame(() => {
        if (!(selectionRequestId !== appCtx.floorSelectionRequestId || appCtx.activeFloorId !== targetFloor.id)) {
          if (getPreviewFloorMode() === "all") {
            (tu2 && applyCameraState(tu2, tu2.viewportAspect),
              syncCameraModeControls(getCameraMode()),
              syncCameraViewControls(getCameraView()));
            return;
          }
          if (appCtx.studioState.settings.fixedCameraView) {
            applyCameraSnapshot({
              recordChange: false,
              silent: true,
            });
            return;
          }
          (setCameraMode(getCameraMode(), {
            preserveView: false,
          }),
            updateCameraView());
        }
      }),
      didFloorChange && markDocumentDirty()));
}
async function addNewFloor() {
  const newFloorRecord = createFloorRecord(studioDocumentDeps(), appCtx.studioProject.floors.length);
  ((newFloorRecord.name = uniqueFloorName(newFloorRecord.name)),
    appCtx.studioProject.floors.push(newFloorRecord),
    updateFloorPreviewButtons(),
    await selectFloor(newFloorRecord.id, {
      persist: false,
    }),
    markDocumentDirty(),
    showToast("已新增“" + newFloorRecord.name + "”，导入并校准后会设置上下层参照点。", "success"),
    selectStudioTool("select"));
}
function planToWorldPoint(calibrationFloor: any, planPoint: any) {
  const pixelsPerMeter = calibrationFloor?.scene?.calibration?.pixelsPerMeter || 1,
    localX = (planPoint.x - finite2(calibrationFloor?.originX, 0)) / pixelsPerMeter,
    localY = (planPoint.y - finite2(calibrationFloor?.originY, 0)) / pixelsPerMeter,
    rotationRadians = -ns2.MathUtils.degToRad(finite2(calibrationFloor?.rotation, 0));
  return {
    x:
      finite2(calibrationFloor?.offsetX, 0) +
      Math.cos(rotationRadians) * localX +
      Math.sin(rotationRadians) * localY,
    z:
      finite2(calibrationFloor?.offsetZ, 0) -
      Math.sin(rotationRadians) * localX +
      Math.cos(rotationRadians) * localY,
  };
}
function worldToPlanPoint(calibrationSourceFloor: any, worldAnchorPoint: any) {
  const inversePixelsPerMeter = calibrationSourceFloor?.scene?.calibration?.pixelsPerMeter || 1,
    inverseRotation = -ns2.MathUtils.degToRad(finite2(calibrationSourceFloor?.rotation, 0)),
    relativeX = worldAnchorPoint.x - finite2(calibrationSourceFloor?.offsetX, 0),
    relativeZ = worldAnchorPoint.z - finite2(calibrationSourceFloor?.offsetZ, 0);
  return {
    x:
      finite2(calibrationSourceFloor?.originX, 0) +
      (Math.cos(inverseRotation) * relativeX - Math.sin(inverseRotation) * relativeZ) *
        inversePixelsPerMeter,
    y:
      finite2(calibrationSourceFloor?.originY, 0) +
      (Math.sin(inverseRotation) * relativeX + Math.cos(inverseRotation) * relativeZ) *
        inversePixelsPerMeter,
  };
}
function worldPointForFloor(sourcePoint: any, sourceFloorArg: any, calibratedFloor: any) {
  return worldToPlanPoint(calibratedFloor, planToWorldPoint(sourceFloorArg, sourcePoint));
}
function getActiveWalls() {
  if (!appCtx.alignmentState) return [];
  const ae3 = getActiveFloor();
  return appCtx.alignmentState.referenceFloor.scene.walls.map((segmentRecord: any) => ({
    ...segmentRecord,
    start: worldPointForFloor(segmentRecord.start, appCtx.alignmentState.referenceFloor, ae3),
    end: worldPointForFloor(segmentRecord.end, appCtx.alignmentState.referenceFloor, ae3),
  }));
}
function startFloorAlign() {
  const ae4 = getActiveFloor(),
    activeFloorSequenceIndex =
      appCtx.studioProject?.floors.findIndex((activeFloorLookup: any) => activeFloorLookup.id === ae4?.id) ??
      -1,
    previousFloor =
      activeFloorSequenceIndex > 0 ? appCtx.studioProject.floors[activeFloorSequenceIndex - 1] : null;
  if (!(!ae4 || !previousFloor)) {
    if (!ae4.scene.calibration || !previousFloor.scene.calibration) {
      showToast("当前层和参照层都需要先完成比例校准。", "error");
      return;
    }
    ((appCtx.alignmentState = {
      floorId: ae4.id,
      referenceFloor: previousFloor,
      stage: "reference",
      referencePoint: null as any,
    }),
      refreshSelection(),
      selectStudioTool("select"),
      (planCanvasElement.style.cursor = "crosshair"),
      renderFloorList(),
      refreshStudioView(),
      showToast("先在半透明的" + previousFloor.name + "上点击一个参照点。"));
  }
}
function cancelFloorAlign() {
  appCtx.alignmentState &&
    ((appCtx.alignmentState = null),
    (planCanvasElement.style.cursor = ""),
    selectStudioTool("select"),
    renderFloorList(),
    refreshStudioView(),
    showToast("已取消楼层对齐。", "success"));
}
function isSameAlignmentFloor(clickedPlanPoint: any) {
  if (!appCtx.alignmentState) return false;
  const ae5 = getActiveFloor();
  if (!ae5 || ae5.id !== appCtx.alignmentState.floorId) return (cancelFloorAlign(), true);
  if (appCtx.alignmentState.stage === "reference") {
    const activeWallList = getActiveWalls(),
      snappedPoint =
        nearestWall2(clickedPlanPoint, activeWallList, 18 / appCtx.planView.zoom)?.point ||
        clickedPlanPoint;
    return (
      (appCtx.alignmentState.referencePoint = worldPointForFloor(
        snappedPoint,
        ae5,
        appCtx.alignmentState.referenceFloor,
      )),
      (appCtx.alignmentState.stage = "current"),
      renderFloorList(),
      refreshStudioView(),
      showToast("现在点击" + ae5.name + "上的同一个位置。"),
      true
    );
  }
  const vector =
      nearestWall2(clickedPlanPoint, ae5.scene.walls, 18 / appCtx.planView.zoom)?.point ||
      clickedPlanPoint,
    $a2 = planToWorldPoint(appCtx.alignmentState.referenceFloor, appCtx.alignmentState.referencePoint);
  return (
    (ae5.originX = vector.x),
    (ae5.originY = vector.y),
    (ae5.originInitialized = true),
    (ae5.offsetX = $a2.x),
    (ae5.offsetZ = $a2.z),
    (ae5.rotation = appCtx.alignmentState.referenceFloor.rotation || 0),
    (ae5.aligned = true),
    (ae5.alignmentPending = false),
    (ae5.alignment = {
      referenceFloorId: appCtx.alignmentState.referenceFloor.id,
      referencePoint: {
        ...appCtx.alignmentState.referencePoint,
      },
      currentPoint: {
        ...vector,
      },
    }),
    (appCtx.alignmentState = null),
    (planCanvasElement.style.cursor = ""),
    selectStudioTool("select"),
    syncGlobalControls(),
    refreshStudioView(),
    requestSceneRebuild({
      force: true,
    }),
    markDocumentDirty(),
    showToast(ae5.name + "已与下层参照点对齐。", "success"),
    true
  );
}
function updatePreviewFloorGap() {
  const previewFloorGapSize = clamp2(
    finite2(previewFloorGapInput.value, appCtx.studioProject?.previewFloorGap || 3),
    0,
    20,
  );
  Math.abs(previewFloorGapSize - finite2(appCtx.studioProject?.previewFloorGap, 3)) < 0.000001 ||
    ((appCtx.studioProject.previewFloorGap = previewFloorGapSize),
    (previewFloorGapInput.value = previewFloorGapSize.toFixed(1)),
    rebuildFloorLayers(),
    markDocumentDirty());
}
function updateUniformOverviewStack() {
  ((appCtx.studioProject.uniformOverviewStack = previewFloorUniformInput.checked),
    refreshSceneRender({
      scene: true,
    }),
    markDocumentDirty());
}
function updateExportFloorGap() {
  const exportFloorGap = clamp2(
    finite2(exportFloorGapInput.value, appCtx.studioProject?.exportFloorGap || 3),
    0,
    20,
  );
  Math.abs(exportFloorGap - finite2(appCtx.studioProject?.exportFloorGap, 3)) < 0.000001 ||
    ((appCtx.studioProject.exportFloorGap = exportFloorGap),
    (exportFloorGapInput.value = exportFloorGap.toFixed(1)),
    rebuildFloorLayers(),
    (exportStatusElement.textContent = "全楼层间距已设为 " + exportFloorGap.toFixed(1) + " m"),
    markDocumentDirty());
}
/** 逐槽表面参数的**入库净化**：只接受 `{ "<GLB 材质名>": { roughness?, metalness? } }`，两个值都规整到 0–1 并按两位小数定下来（避免浮点尾数让产物不稳定）。 */
function captureUndoSnapshot(snapshotSource = appCtx.studioState) {
  return structuredClone(snapshotSource);
}
function resolveLightGroup(lightGroupOwner: any) {
  return (
    appCtx.studioState.lightGroups?.find(
      (matchedLightGroup) => matchedLightGroup.id === lightGroupOwner?.lightGroupId,
    ) ||
    appCtx.studioState.lightGroups?.[0] ||
    null
  );
}
function resolveFloorDefaultGroup(lightGroupOwnerItem: any, ownerScene = appCtx.studioState) {
  return (
    ownerScene?.lightGroups?.find(
      (lightGroupMatch) => lightGroupMatch.id === lightGroupOwnerItem?.lightGroupId,
    ) ||
    ownerScene?.lightGroups?.[0] ||
    null
  );
}
function isLampEnabled(lampStateRef: any) {
  return appCtx.overriddenFloorIds !== null
    ? appCtx.overriddenFloorIds.has(lampStateRef.id)
    : resolveLightGroup(lampStateRef)?.enabled === false
      ? false
      : appCtx.pendingRuntimeSettings || appCtx.isLightOverrideOn || !areLightsEnabled();
}
function getScreenLightGroups() {
  return appCtx.studioState.items.filter((tvItem) => tvItem.type === "tv");
}
function getChargingLightGroups() {
  return appCtx.studioState.items.filter((vehicleItem) =>
    ["smallcar", "suv", "scooter"].includes(vehicleItem.type),
  );
}
function getOrderedFloorList() {
  return getPreviewFloorMode() === "all"
    ? appCtx.studioProject.floors
    : [getActiveFloor()].filter(Boolean);
}
function floorElevationFor(elevationFloorRef: any) {
  if (getPreviewFloorMode() !== "all") return 0;
  const elevationFloorIndex = appCtx.studioProject.floors.findIndex(
    (elevationFloorMatch: any) => elevationFloorMatch.id === elevationFloorRef?.id,
  );
  return Math.max(elevationFloorIndex, 0) * finite2(appCtx.studioProject.exportFloorGap, 3);
}
function composeLightGroupKey(groupKeyFloor: any, groupKeyGroup: any) {
  return getPreviewFloorMode() === "all" ? composeKey(groupKeyFloor, groupKeyGroup) : groupKeyGroup;
}
function collectLampEntries() {
  return (
    getPreviewFloorMode() === "all"
      ? appCtx.studioProject?.floors || []
      : [getActiveFloor()].filter(Boolean)
  ).flatMap((floorEntryLamp: any) =>
    floorEntryLamp.scene.items
      .filter((lampItem: any) => lampItemTypeSet.has(lampItem.type))
      .map((lampItemRef: any) => {
        const dy2 = resolveFloorDefaultGroup(lampItemRef, floorEntryLamp.scene);
        return {
          floor: floorEntryLamp,
          item: lampItemRef,
          group: dy2,
          itemKey: composeItemKey(floorEntryLamp.id, lampItemRef.id),
          groupKey: composeLightGroupKey(floorEntryLamp.id, dy2?.id || "__ungrouped"),
        };
      }),
  );
}
function listLightGroupRows(lightGroupFloors = appCtx.studioProject?.floors || []) {
  return lightGroupFloors.flatMap((lightGroupFloor: any) =>
    lightGroupFloor.scene.lightGroups.map((lightGroupRecord: any, lightGroupIndex: any) => ({
      floor: lightGroupFloor,
      group: lightGroupRecord,
      index: lightGroupIndex,
      key: composeKey(lightGroupFloor.id, lightGroupRecord.id),
      lights: lightGroupFloor.scene.items.filter(
        (lampItemMatch: any) =>
          lampItemTypeSet.has(lampItemMatch.type) &&
          lampItemMatch.lightGroupId === lightGroupRecord.id,
      ),
    })),
  );
}
function listScreenRows(screenFloors = appCtx.studioProject?.floors || []) {
  return screenFloors.flatMap((screenFloor: any) =>
    screenFloor.scene.items
      .filter((tvItemCandidate: any) => tvItemCandidate.type === "tv")
      .map((tvItemRef: any, tvItemIndex: any) => ({
        floor: screenFloor,
        item: tvItemRef,
        index: tvItemIndex,
        key: screenFloor.id + ":" + tvItemRef.id,
      })),
  );
}
function listChargingRows(chargingFloors = appCtx.studioProject?.floors || []) {
  return chargingFloors.flatMap((chargingFloor: any) =>
    chargingFloor.scene.items
      .filter((vehicleItemCandidate: any) =>
        ["smallcar", "suv", "scooter"].includes(vehicleItemCandidate.type),
      )
      .map((vehicleItemRef: any, vehicleItemIndex: any) => ({
        floor: chargingFloor,
        item: vehicleItemRef,
        index: vehicleItemIndex,
        key: chargingFloor.id + ":" + vehicleItemRef.id,
      })),
  );
}
function syncScreenLayers(floorArgScreen: any) {
  const screenLayerNameSet = new Set(
    getScreenLightGroups().map((screenLayerEntry) => screenLayerEntry.screenLayerName),
  );
  let screenLayerNumber = 1;
  for (const screenItem of floorArgScreen)
    if (screenItem.type === "tv") {
      for (; screenLayerNameSet.has("电视画面 " + screenLayerNumber);) screenLayerNumber += 1;
      ((screenItem.screenLayerName = "电视画面 " + screenLayerNumber),
        (screenItem.screenEnabled = screenItem.screenEnabled !== false),
        screenLayerNameSet.add(screenItem.screenLayerName),
        (screenLayerNumber += 1));
    }
}
function syncChargingLayers(floorArgCharging: any) {
  const chargingLayerNameSet = new Set(
    getChargingLightGroups().map((chargingLayerEntry) => chargingLayerEntry.chargingLayerName),
  );
  let chargingLayerNumber = 1;
  for (const chargingItem of floorArgCharging)
    if (["smallcar", "suv", "scooter"].includes(chargingItem.type)) {
      for (; chargingLayerNameSet.has("汽车充电 " + chargingLayerNumber);) chargingLayerNumber += 1;
      ((chargingItem.chargingLayerName = "汽车充电 " + chargingLayerNumber),
        (chargingItem.chargingEnabled = chargingItem.chargingEnabled === true),
        chargingLayerNameSet.add(chargingItem.chargingLayerName),
        (chargingLayerNumber += 1));
    }
}
function pushUndoEntry(undoSnapshotArg: any) {
  (syncScreenLayers(undoSnapshotArg), syncChargingLayers(undoSnapshotArg));
}
function getLightGroups() {
  const lightGroups = appCtx.studioState.lightGroups || (appCtx.studioState.lightGroups = []);
  return (
    lightGroups.length ||
      lightGroups.push({
        id: generateId("light-group"),
        name: "默认灯组",
        enabled: true,
        areaId: null as any,
      }),
    lightGroups.some((lightGroupIdMatch) => lightGroupIdMatch.id === appCtx.activeLightGroupId) ||
      (appCtx.activeLightGroupId = lightGroups[0].id),
    lightGroups.find((lightGroupByName) => lightGroupByName.id === appCtx.activeLightGroupId) ||
      lightGroups[0]
  );
}
function syncLightGroupSelect(lightGroupSourceItem: any) {
  const lightGroupSelectElement = selectElement("#light-group");
  lightGroupSelectElement.replaceChildren();
  for (const lightGroupOption of appCtx.studioState.lightGroups || []) {
    const lightGroupOptionElement = document.createElement("option");
    ((lightGroupOptionElement.value = lightGroupOption.id),
      (lightGroupOptionElement.textContent = lightGroupOption.name),
      lightGroupSelectElement.append(lightGroupOptionElement));
  }
  ((lightGroupSelectElement.value =
    resolveLightGroup(lightGroupSourceItem)?.id || getLightGroups().id),
    syncStudioSelect2(lightGroupSelectElement));
}
function hideLightGroupActionMenu() {
  ((lightGroupActionMenuElement.hidden = true), (appCtx.pendingLightGroupId = ""));
}
function showLightGroupActionMenu(lightGroupRow: any, lightGroupMenuEvent: any) {
  ((appCtx.pendingLightGroupId = lightGroupRow.id),
    (appCtx.activeLightGroupId = lightGroupRow.id),
    syncLightGroupList());
  const lightGroupDeleteControl = lightGroupActionMenuElement.querySelector(
    '[data-light-group-action="delete"]',
  );
  ((lightGroupDeleteControl.disabled = appCtx.studioState.lightGroups.length <= 1),
    (lightGroupActionMenuElement.hidden = false),
    (lightGroupActionMenuElement.style.left =
      Math.min(lightGroupMenuEvent.clientX, window.innerWidth - 116) + "px"),
    (lightGroupActionMenuElement.style.top =
      Math.min(lightGroupMenuEvent.clientY, window.innerHeight - 148) + "px"));
}
function deleteLightGroup(lightGroupToDelete: any) {
  if (!lightGroupToDelete || appCtx.studioState.lightGroups.length <= 1) return;
  deselectAll();
  const fallbackLightGroup = appCtx.studioState.lightGroups.find(
      (otherLightGroup) => otherLightGroup.id !== lightGroupToDelete.id,
    ),
    deletedLampIdSet = new Set(
      appCtx.studioState.items
        .filter(
          (lampInGroup) =>
            lampItemTypeSet.has(lampInGroup.type) &&
            lampInGroup.lightGroupId === lightGroupToDelete.id,
        )
        .map((lampInGroupId) => lampInGroupId.id),
    );
  ((appCtx.studioState.items = appCtx.studioState.items.filter(
    (remainingItem) => !deletedLampIdSet.has(remainingItem.id),
  )),
    (appCtx.studioState.lightGroups = appCtx.studioState.lightGroups.filter(
      (remainingLightGroup) => remainingLightGroup.id !== lightGroupToDelete.id,
    )),
    appCtx.selectedItem?.kind === "item" && deletedLampIdSet.has(appCtx.selectedItem.id) && (appCtx.selectedItem = null),
    (appCtx.selectedItems = appCtx.selectedItems.filter(
      (remainingSelection: any) =>
        remainingSelection.kind !== "item" || !deletedLampIdSet.has(remainingSelection.id),
    )),
    appCtx.activeLightGroupId === lightGroupToDelete.id && (appCtx.activeLightGroupId = fallbackLightGroup!.id),
    refreshScopeItems("lights"),
    markDocumentDirty(),
    showToast(
      "已删除“" + lightGroupToDelete.name + "”及组内 " + deletedLampIdSet.size + " 盏灯。",
      "success",
    ));
}
function uniqueLightGroupName(lightGroupBaseName: any) {
  const lightGroupNameSet = new Set(
    appCtx.studioState.lightGroups.map((existingGroupName) => existingGroupName.name),
  );
  if (!lightGroupNameSet.has(lightGroupBaseName)) return lightGroupBaseName;
  let duplicateNameSuffix = 2;
  for (; lightGroupNameSet.has(lightGroupBaseName + " " + duplicateNameSuffix);)
    duplicateNameSuffix += 1;
  return lightGroupBaseName + " " + duplicateNameSuffix;
}
function duplicateLightGroup(lightGroupToDuplicate: any) {
  if (!lightGroupToDuplicate) return;
  deselectAll();
  const duplicatedLightGroup = {
      ...structuredClone(lightGroupToDuplicate),
      id: generateId("light-group"),
      name: uniqueLightGroupName(lightGroupToDuplicate.name + " 副本"),
    },
    sourceLightGroupIndex = appCtx.studioState.lightGroups.findIndex(
      (sourceGroupMatch) => sourceGroupMatch.id === lightGroupToDuplicate.id,
    );
  appCtx.studioState.lightGroups.splice(sourceLightGroupIndex + 1, 0, duplicatedLightGroup);
  const clonedLampItems = appCtx.studioState.items
    .filter(
      (lampInSourceGroup) =>
        lampItemTypeSet.has(lampInSourceGroup.type) &&
        lampInSourceGroup.lightGroupId === lightGroupToDuplicate.id,
    )
    .map((clonedLamp) => ({
      ...structuredClone(clonedLamp),
      id: generateId("item"),
      lightGroupId: duplicatedLightGroup.id,
    }));
  (appCtx.studioState.items.push(...clonedLampItems),
    (appCtx.activeLightGroupId = duplicatedLightGroup.id),
    (appCtx.selectedItem =
      clonedLampItems.length === 1
        ? {
            kind: "item",
            id: clonedLampItems[0].id,
          }
        : null),
    (appCtx.selectedItems =
      clonedLampItems.length > 1
        ? clonedLampItems.map((relinkedLamp) => ({
            kind: "item",
            id: relinkedLamp.id,
          }))
        : []),
    syncLightGroupList(),
    refreshScopeItems("lights"),
    markDocumentDirty(),
    showToast(
      "已复制“" + lightGroupToDuplicate.name + "”及组内 " + clonedLampItems.length + " 盏灯。",
      "success",
    ));
}
function clearLightGroupDropIndicator() {
  for (const lightGroupDropIndicatorElement of lightGroupListElement.querySelectorAll(
    ".light-group-row",
  ))
    (lightGroupDropIndicatorElement.classList.remove("drop-before", "drop-after"),
      delete lightGroupDropIndicatorElement.dataset.dropPosition);
  for (const areaDropIndicatorElement of lightGroupListElement.querySelectorAll(".light-area-row"))
    (areaDropIndicatorElement.classList.remove("drop-into", "drop-before", "drop-after"),
      delete areaDropIndicatorElement.dataset.dropPosition);
}
const LIST_DRAG_TOUCH_HOLD_MS = 280,
  LIST_DRAG_START_DISTANCE = 6,
  LIST_DRAG_TOUCH_GIVE_UP_DISTANCE = 8,
  LIST_DRAG_CLICK_SUPPRESS_MS = 240;
/** 起拖瞬间把所有落点的矩形抓一份快照，之后拖动过程中不再读 DOM：这样即使源行被重绘（同一帧内不会），本次拖动的判定也不会错位。 */
function collectListDragDropTargets() {
  const listDragDropTargets: any[] = [];
  for (const areaRowElement of lightGroupListElement.querySelectorAll(".light-area-row")) {
    const listedAreaId = areaRowElement.dataset.areaId;
    if (!listedAreaId) continue;
    const areaSectionElement = areaRowElement.closest(".light-area-section");
    listDragDropTargets.push({
      kind: "area",
      id: listedAreaId,
      rowElement: areaRowElement,
      rowRect: areaRowElement.getBoundingClientRect(),
      sectionRect: areaSectionElement ? areaSectionElement.getBoundingClientRect() : null,
    });
  }
  for (const groupRowElement of lightGroupListElement.querySelectorAll(".light-group-row")) {
    const listedGroupId = groupRowElement.dataset.lightGroupId;
    if (!listedGroupId) continue;
    listDragDropTargets.push({
      kind: "group",
      id: listedGroupId,
      areaId: groupRowElement.dataset.lightGroupAreaId || null,
      rowElement: groupRowElement,
      rowRect: groupRowElement.getBoundingClientRect(),
      sectionRect: null as any,
    });
  }
  return listDragDropTargets;
}
/** 指针落点 → 落点语义。 */
function applyListDragDropIndicator(listDragSession: any, pendingListDrop: any) {
  clearLightGroupDropIndicator();
  if (!pendingListDrop) return;
  const findDropIndicatorRow = (dropIndicatorTargetId: any) =>
    listDragSession.dropTargets.find(
      (dropTargetCandidate: any) => dropTargetCandidate.id === dropIndicatorTargetId,
    )?.rowElement;
  if (pendingListDrop.kind === "area") {
    findDropIndicatorRow(pendingListDrop.targetId)?.classList.add(
      pendingListDrop.insertAfter ? "drop-after" : "drop-before",
    );
    return;
  }
  if (pendingListDrop.anchorGroupId) {
    findDropIndicatorRow(pendingListDrop.anchorGroupId)?.classList.add(
      pendingListDrop.insertAfter ? "drop-after" : "drop-before",
    );
    return;
  }
  pendingListDrop.areaId &&
    findDropIndicatorRow(pendingListDrop.areaId)?.classList.add("drop-into");
}
function activateListDrag(listDragSession: any) {
  (listDragSession.active = true),
    (listDragSession.dropTargets = collectListDragDropTargets()),
    listDragSession.rowElement.classList.remove("drag-ready"),
    listDragSession.rowElement.classList.add("dragging"),
    document.documentElement.classList.add("list-drag-active");
  const dragGhostElement = document.createElement("div");
  ((dragGhostElement.className = "light-row-drag-ghost"),
    (dragGhostElement.textContent = listDragSession.name || ""),
    document.body.append(dragGhostElement),
    (listDragSession.ghostElement = dragGhostElement));
  try {
    listDragSession.rowElement.setPointerCapture(listDragSession.pointerId);
  } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
}
function handleListDragPointerMove(listDragPointerMoveEvent: any) {
  const listDragSession = appCtx.activeListDragSession;
  if (!listDragSession || listDragPointerMoveEvent.pointerId !== listDragSession.pointerId) return;
  const movedDistance = Math.hypot(
    listDragPointerMoveEvent.clientX - listDragSession.startX,
    listDragPointerMoveEvent.clientY - listDragSession.startY,
  );
  if (!listDragSession.active) {

    if (!listDragSession.armed) {
      movedDistance > LIST_DRAG_TOUCH_GIVE_UP_DISTANCE && finishListDrag(false);
      return;
    }
    if (movedDistance < LIST_DRAG_START_DISTANCE) return;
    activateListDrag(listDragSession);
  }
  (listDragPointerMoveEvent.cancelable && listDragPointerMoveEvent.preventDefault(),
    listDragSession.ghostElement &&
      ((listDragSession.ghostElement.style.left = listDragPointerMoveEvent.clientX + "px"),
      (listDragSession.ghostElement.style.top = listDragPointerMoveEvent.clientY + "px")),
    (listDragSession.pendingDrop = resolveListDragDrop(
      listDragSession,
      listDragPointerMoveEvent.clientX,
      listDragPointerMoveEvent.clientY,
    )),
    applyListDragDropIndicator(listDragSession, listDragSession.pendingDrop));
}
function handleListDragPointerUp(listDragPointerUpEvent: any) {
  const listDragSession = appCtx.activeListDragSession;
  if (!listDragSession || listDragPointerUpEvent.pointerId !== listDragSession.pointerId) return;
  finishListDrag(true);
}
function handleListDragPointerCancel() {
  finishListDrag(false);
}
/** 触摸拖动期间必须吃掉 touchmove，否则面板会跟着手指一起滚动。 */
function handleListDragTouchMove(listDragTouchMoveEvent: any) {
  appCtx.activeListDragSession?.active &&
    listDragTouchMoveEvent.cancelable &&
    listDragTouchMoveEvent.preventDefault();
}
function finishListDrag(commitListDropFlag: any) {
  const listDragSession = appCtx.activeListDragSession;
  if (!listDragSession) return;
  (appCtx.activeListDragSession = null),
    listDragSession.holdTimeoutId && clearTimeout(listDragSession.holdTimeoutId),
    window.removeEventListener("pointermove", handleListDragPointerMove),
    window.removeEventListener("pointerup", handleListDragPointerUp),
    window.removeEventListener("pointercancel", handleListDragPointerCancel),
    window.removeEventListener("touchmove", handleListDragTouchMove),
    listDragSession.ghostElement?.remove(),
    listDragSession.rowElement.classList.remove("dragging", "drag-ready"),
    document.documentElement.classList.remove("list-drag-active"),
    clearLightGroupDropIndicator();

  if (!listDragSession.active) return;
  appCtx.listDragEndedAt = Date.now();
  const pendingListDrop = listDragSession.pendingDrop;
  pendingListDrop &&
    commitListDropFlag &&
    (pendingListDrop.kind === "area"
      ? moveAreaRow(listDragSession.id, pendingListDrop.targetId, pendingListDrop.insertAfter)
      : moveLightGroupToArea(
          listDragSession.id,
          pendingListDrop.areaId,
          pendingListDrop.anchorGroupId,
          pendingListDrop.insertAfter,
        ));
}
/** 行上的 pointerdown 入口。 */
function beginListRowDrag(
  listDragRowSession: ListDragRowSession | null,
  listDragPointerDownEvent: any,
) {
  appCtx.activeListDragSession && finishListDrag(false);
  ((listDragRowSession!.pointerId = listDragPointerDownEvent.pointerId),
    (listDragRowSession!.pointerType = listDragPointerDownEvent.pointerType || "mouse"),
    (listDragRowSession!.startX = listDragPointerDownEvent.clientX),
    (listDragRowSession!.startY = listDragPointerDownEvent.clientY),
    (listDragRowSession!.armed = listDragRowSession!.pointerType !== "touch"),
    (listDragRowSession!.active = false),
    (listDragRowSession!.pendingDrop = null),
    (listDragRowSession!.ghostElement = null),
    (listDragRowSession!.dropTargets = []),
    (listDragRowSession!.holdTimeoutId = null),
    (appCtx.activeListDragSession = listDragRowSession));
  listDragRowSession!.armed ||
    (listDragRowSession!.holdTimeoutId = setTimeout(() => {
      ((listDragRowSession!.holdTimeoutId = null),
        appCtx.activeListDragSession === listDragRowSession &&
          ((listDragRowSession!.armed = true),
          listDragRowSession!.rowElement.classList.add("drag-ready")));
    }, LIST_DRAG_TOUCH_HOLD_MS));
  (window.addEventListener("pointermove", handleListDragPointerMove, { passive: false }),
    window.addEventListener("pointerup", handleListDragPointerUp),
    window.addEventListener("pointercancel", handleListDragPointerCancel),
    window.addEventListener("touchmove", handleListDragTouchMove, { passive: false }));
}
/** 按区域头的拖放结果重排区域顺序。 */
function moveAreaRow(draggedAreaId: any, targetAreaId: any, insertAfterFlag: any) {
  const draggedAreaIndex = appCtx.lightAreaRecords.findIndex(
      (draggedAreaMatch) => draggedAreaMatch.areaId === draggedAreaId,
    ),
    targetAreaIndex = appCtx.lightAreaRecords.findIndex(
      (targetAreaMatch) => targetAreaMatch.areaId === targetAreaId,
    );
  if (draggedAreaIndex < 0 || targetAreaIndex < 0 || draggedAreaIndex === targetAreaIndex) return;
  const reorderedAreas = [...appCtx.lightAreaRecords],
    [draggedArea] = reorderedAreas.splice(draggedAreaIndex, 1),
    insertAreaIndex = reorderedAreas.findIndex(
      (insertTargetMatch) => insertTargetMatch.areaId === targetAreaId,
    );
  if (insertAreaIndex < 0) return;
  reorderedAreas.splice(insertAreaIndex + (insertAfterFlag ? 1 : 0), 0, draggedArea);
  if (
    reorderedAreas.every(
      (orderedArea, orderedAreaIndex) =>
        orderedArea.areaId === appCtx.lightAreaRecords[orderedAreaIndex]?.areaId,
    )
  )
    return;
  appCtx.lightAreaRecords = reorderedAreas;
  persistLightAreaOrder();
  syncLightGroupList();
}
/** 把灯组移动到目标区域，可插到某组之前 / 之后（targetGroupId 为空表示只换区域、不改顺序）。 */
function moveLightGroupToArea(
  draggedGroupId: any,
  targetAreaId: any,
  targetGroupId: any = null,
  insertAfterFlag = false,
) {
  const movedLightGroup = appCtx.studioState.lightGroups.find(
    (draggedGroupMatch) => draggedGroupMatch.id === draggedGroupId,
  );
  if (!movedLightGroup) return;
  const nextAreaId = targetAreaId || null,
    areaChanged = (movedLightGroup.areaId || null) !== nextAreaId;
  let reorderedLightGroups = appCtx.studioState.lightGroups;
  if (targetGroupId) {
    const remainingLightGroups = appCtx.studioState.lightGroups.filter(
        (remainingGroupMatch) => remainingGroupMatch.id !== draggedGroupId,
      ),
      anchorGroupIndex = remainingLightGroups.findIndex(
        (anchorGroupMatch) => anchorGroupMatch.id === targetGroupId,
      );
    if (anchorGroupIndex >= 0) {
      reorderedLightGroups = [...remainingLightGroups];
      reorderedLightGroups.splice(
        anchorGroupIndex + (insertAfterFlag ? 1 : 0),
        0,
        movedLightGroup,
      );
    }
  }
  const orderChanged = reorderedLightGroups.some(
    (orderedGroup, orderedGroupIndex) =>
      orderedGroup.id !== appCtx.studioState.lightGroups[orderedGroupIndex]?.id,
  );
  if (!areaChanged && !orderChanged) return;
  (deselectAll(),
    (movedLightGroup.areaId = nextAreaId),
    orderChanged && (appCtx.studioState.lightGroups = reorderedLightGroups),
    nextAreaId && appCtx.expandedAreaIds.add(nextAreaId),
    syncLightGroupList(),
    refreshStudioUi(),
    markDocumentDirty());
}
/** 拉取 HA 区域注册表，作为灯光面板唯一的区域来源（只读，但展示顺序可在本地拖动调整）。 */
async function refreshLightAreasFromHa() {
  let fetchedAreaRecords: { areaId: string; name: string }[] = [];
  try {
    const areaApiPayload = await fetchStudioApi("/ha/areas"),
      listedAreaItems = Array.isArray(areaApiPayload?.items) ? areaApiPayload.items : [];
    fetchedAreaRecords = listedAreaItems
      .map((areaItem: any) => ({
        areaId: String(areaItem?.areaId || areaItem?.id || "").trim(),
        name: String(areaItem?.name || "").trim(),
      }))
      .filter((areaRecord: any) => areaRecord.areaId && areaRecord.name);
  } catch (lightAreaError: any) {
    fetchedAreaRecords = [];
  }
  appCtx.lightAreaRecords = applySavedLightAreaOrder(fetchedAreaRecords);
  syncLightGroupList();
}
/** 灯光面板区域顺序的本地记录：HA 提供区域集合，顺序只是前端展示偏好，不写回 HA / 文档。 */
const LIGHT_AREA_ORDER_STORAGE_KEY = "homeos3d.studio.light-area-order";
function readSavedLightAreaOrder(): string[] {
  try {
    const savedOrder = JSON.parse(
      window.localStorage.getItem(LIGHT_AREA_ORDER_STORAGE_KEY) || "[]",
    );
    return Array.isArray(savedOrder) ? savedOrder.map((areaIdItem) => String(areaIdItem)) : [];
  } catch (lightAreaOrderError: any) {
    return [];
  }
}
function persistLightAreaOrder() {
  try {
    window.localStorage.setItem(
      LIGHT_AREA_ORDER_STORAGE_KEY,
      JSON.stringify(appCtx.lightAreaRecords.map((areaRecord) => areaRecord.areaId)),
    );
  } catch(lightAreaOrderError: any) { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
}
/** 按本地记录的 areaId 顺序重排 HA 区域； */
function applySavedLightAreaOrder(areaRecords: { areaId: string; name: string }[]) {
  const areaRecordById = new Map(areaRecords.map((areaRecord) => [areaRecord.areaId, areaRecord])),
    orderedAreaRecords: any[] = [];
  for (const savedAreaId of readSavedLightAreaOrder()) {
    const savedAreaRecord = areaRecordById.get(savedAreaId);
    savedAreaRecord && (orderedAreaRecords.push(savedAreaRecord), areaRecordById.delete(savedAreaId));
  }
  for (const remainingAreaRecord of areaRecords)
    areaRecordById.has(remainingAreaRecord.areaId) &&
      (orderedAreaRecords.push(remainingAreaRecord), areaRecordById.delete(remainingAreaRecord.areaId));
  return orderedAreaRecords;
}
/** 该 areaId 是否为当前 HA 里的有效区域（渲染分组 / 分配校验用）。 */
function isKnownLightAreaId(areaId: any) {
  return !!areaId && appCtx.lightAreaRecords.some((areaRecord) => areaRecord.areaId === areaId);
}
/** 重建「所属区域」下拉框：「未分类」恒在首位，其后是 HA 区域注册表里的全部区域。 */
function syncAreaAssignOptions(selectedAreaId: any) {
  const areaOptionRecords = [
    {
      value: "",
      label: "未分类",
    },
  ];
  for (const listedArea of appCtx.lightAreaRecords)
    areaOptionRecords.push({
      value: listedArea.areaId,
      label: listedArea.name,
    });
  (lightGroupAreaSelectElement.replaceChildren(
    ...areaOptionRecords.map((areaOptionRecord) => {
      const areaOptionElement = document.createElement("option");
      return (
        (areaOptionElement.value = areaOptionRecord.value),
        (areaOptionElement.textContent = areaOptionRecord.label),
        areaOptionElement
      );
    }),
  ),
    (lightGroupAreaSelectElement.value = areaOptionRecords.some(
      (areaOptionRecord) => areaOptionRecord.value === selectedAreaId,
    )
      ? selectedAreaId
      : ""),
    syncStudioSelect2(lightGroupAreaSelectElement));
}
/** 打开灯组的「设置区域」对话框，按该灯组当前所属区域回填下拉框。 */
function openLightGroupAreaDialog(assignTargetGroup: any) {
  assignTargetGroup &&
    ((appCtx.areaAssignGroupId = assignTargetGroup.id),
    (lightGroupAreaNameElement.textContent = assignTargetGroup.name),
    syncAreaAssignOptions(assignTargetGroup.areaId || ""),
    lightGroupAreaDialogElement.showModal());
}
function closeLightGroupAreaDialog() {
  ((appCtx.areaAssignGroupId = ""), lightGroupAreaDialogElement.close());
}
/** 展开 / 收起某个区域。 */
function toggleAreaExpanded(toggledAreaId: any) {
  (appCtx.expandedAreaIds.has(toggledAreaId)
    ? appCtx.expandedAreaIds.delete(toggledAreaId)
    : appCtx.expandedAreaIds.add(toggledAreaId),
    syncLightGroupList());
}
/** 创建一个灯组列表行（长按拖动排序 / 移入区域 + 右键菜单）。 */
function createLightGroupRow(listedLightGroup: any) {
  const lightGroupRowElement = document.createElement("div");
  ((lightGroupRowElement.className =
    "light-group-row" + (listedLightGroup.id === appCtx.activeLightGroupId ? " active" : "")),
    (lightGroupRowElement.dataset.lightGroupId = listedLightGroup.id),
    (lightGroupRowElement.dataset.lightGroupAreaId = listedLightGroup.areaId || ""),
    lightGroupRowElement.setAttribute(
      "aria-label",
      listedLightGroup.name + "，拖动可排序或移入区域，右键可设置区域、重命名、复制或删除",
    ));
  const listDragRowSession: ListDragRowSession = {
    kind: "group",
    id: listedLightGroup.id,
    name: listedLightGroup.name,
    rowElement: lightGroupRowElement,
    pointerId: -1,
    pointerType: "mouse",
    startX: 0,
    startY: 0,
    armed: false,
    active: false,
    holdTimeoutId: null as any,
    ghostElement: null as any,
    dropTargets: [] as any[],
    pendingDrop: null as any,
  };
  (lightGroupRowElement.addEventListener("pointerdown", (groupPointerDownEvent) => {
    groupPointerDownEvent.button === 0 &&
      !(
        groupPointerDownEvent.target instanceof Element &&
        groupPointerDownEvent.target.closest("button")
      ) &&
      beginListRowDrag(listDragRowSession, groupPointerDownEvent);
  }),
    lightGroupRowElement.addEventListener("click", () => {
      ((appCtx.activeLightGroupId = listedLightGroup.id), syncLightGroupList());
    }),
    lightGroupRowElement.addEventListener("contextmenu", (groupActionMenuEvent) => {
      (groupActionMenuEvent.preventDefault(),
        showLightGroupActionMenu(listedLightGroup, groupActionMenuEvent));
    }));
  const groupToggleButton = document.createElement("button");
  ((groupToggleButton.type = "button"),
    (groupToggleButton.className = listedLightGroup.enabled ? "on" : ""),
    (groupToggleButton.textContent = listedLightGroup.enabled ? "◉" : "○"),
    (groupToggleButton.title = listedLightGroup.enabled ? "关闭这个灯组" : "开启这个灯组"),
    groupToggleButton.addEventListener("click", (groupToggleClickEvent) => {
      (groupToggleClickEvent.stopPropagation(),
        deselectAll(),
        (listedLightGroup.enabled = !listedLightGroup.enabled),
        transitionLightGroups([listedLightGroup.id]),
        markDocumentDirty());
    }));
  const groupNameLabel = document.createElement("span");
  ((groupNameLabel.className = "light-group-name"),
    (groupNameLabel.textContent = listedLightGroup.name),
    (groupNameLabel.title = "拖动灯组可排序或移入区域，右键可设置区域、重命名、复制或删除"));
  const groupLampCountNote = document.createElement("small");
  ((groupLampCountNote.textContent = String(
    appCtx.studioState.items.filter(
      (lampInRowGroup) =>
        lampItemTypeSet.has(lampInRowGroup.type) &&
        lampInRowGroup.lightGroupId === listedLightGroup.id,
    ).length,
  )),
    lightGroupRowElement.append(groupToggleButton, groupNameLabel, groupLampCountNote));
  return lightGroupRowElement;
}
/** 创建一个「区域」区块：区域来自 HA，可折叠、可拖动排序，也是拖放目标（灯组拖到头上即挂进该区域）。 */
function createAreaSection(listedArea: any, memberLightGroups: any) {
  const isAreaExpanded = appCtx.expandedAreaIds.has(listedArea.areaId),
    areaSectionElement = document.createElement("div");
  ((areaSectionElement.className = "light-area-section"),
    (areaSectionElement.dataset.areaId = listedArea.areaId));
  const areaHeaderElement = document.createElement("div");
  ((areaHeaderElement.className = "light-area-row" + (isAreaExpanded ? " expanded" : "")),
    (areaHeaderElement.dataset.areaId = listedArea.areaId),
    areaHeaderElement.setAttribute(
      "aria-label",
      listedArea.name + "，单击展开或收起，拖动可调整区域顺序；区域来自 HA，不可新建或删除",
    ));
  const areaDragRowSession: ListDragRowSession = {
    kind: "area",
    id: listedArea.areaId,
    name: listedArea.name,
    rowElement: areaHeaderElement,
    pointerId: -1,
    pointerType: "mouse",
    startX: 0,
    startY: 0,
    armed: false,
    active: false,
    holdTimeoutId: null as any,
    ghostElement: null as any,
    dropTargets: [] as any[],
    pendingDrop: null as any,
  };
  (areaHeaderElement.addEventListener("pointerdown", (areaPointerDownEvent) => {
    areaPointerDownEvent.button === 0 &&
      !(
        areaPointerDownEvent.target instanceof Element &&
        areaPointerDownEvent.target.closest("button")
      ) &&
      beginListRowDrag(areaDragRowSession, areaPointerDownEvent);
  }),
    areaHeaderElement.addEventListener("click", () => toggleAreaExpanded(listedArea.areaId)));
  const areaCaretButton = document.createElement("button");
  ((areaCaretButton.type = "button"),
    (areaCaretButton.className = "light-area-caret"),
    (areaCaretButton.textContent = isAreaExpanded ? "▾" : "▸"),
    (areaCaretButton.title = isAreaExpanded ? "收起区域" : "展开区域"),
    areaCaretButton.addEventListener("click", (areaCaretEvent) => {
      (areaCaretEvent.stopPropagation(), toggleAreaExpanded(listedArea.areaId));
    }));
  const areaNameLabel = document.createElement("span");
  ((areaNameLabel.className = "light-area-name"), (areaNameLabel.textContent = listedArea.name));
  const areaCountNote = document.createElement("small");
  ((areaCountNote.textContent = String(memberLightGroups.length)),
    areaHeaderElement.append(areaCaretButton, areaNameLabel, areaCountNote),
    areaSectionElement.append(areaHeaderElement));
  if (isAreaExpanded) {
    if (!memberLightGroups.length) {
      const emptyAreaNote = document.createElement("div");
      ((emptyAreaNote.className = "light-area-empty"),
        (emptyAreaNote.textContent = "暂无灯组"),
        areaSectionElement.append(emptyAreaNote));
    } else {
      const areaGroupsContainer = document.createElement("div");
      ((areaGroupsContainer.className = "light-area-groups"),
        memberLightGroups.forEach((memberLightGroup: any) =>
          areaGroupsContainer.append(createLightGroupRow(memberLightGroup)),
        ),
        areaSectionElement.append(areaGroupsContainer));
    }
  }
  return areaSectionElement;
}
function syncLightGroupList() {
  if (
    ((lightLayerPanelElement.hidden = appCtx.activeLibraryCategory !== "light"),
    !lightLayerPanelElement.hidden)
  ) {
    (getLightGroups(), lightGroupListElement.replaceChildren());
    const sceneAreas = appCtx.lightAreaRecords,
      knownAreaIdSet = new Set(sceneAreas.map((areaRef) => areaRef.areaId)),
      areaMemberGroupMap = new Map(),
      unassignedLightGroups: any[] = [];
    for (const listedLightGroup of appCtx.studioState.lightGroups) {
      const listedAreaId = knownAreaIdSet.has(listedLightGroup.areaId)
        ? listedLightGroup.areaId
        : null;
      listedAreaId
        ? (areaMemberGroupMap.has(listedAreaId) || areaMemberGroupMap.set(listedAreaId, []),
          areaMemberGroupMap.get(listedAreaId).push(listedLightGroup))
        : unassignedLightGroups.push(listedLightGroup);
    }
    for (const listedArea of sceneAreas)
      lightGroupListElement.append(
        createAreaSection(listedArea, areaMemberGroupMap.get(listedArea.areaId) || []),
      );
    for (const unassignedLightGroup of unassignedLightGroups)
      lightGroupListElement.append(createLightGroupRow(unassignedLightGroup));
    for (const [screenRowIndex, screenLayerItem] of getScreenLightGroups().entries()) {
      const screenLayerRowElement = document.createElement("div");
      ((screenLayerRowElement.className = "light-group-row tv-screen-layer-row"),
        screenLayerRowElement.setAttribute(
          "aria-label",
          (screenLayerItem.screenLayerName || "电视画面 " + (screenRowIndex + 1)) +
            "，可独立开启或关闭",
        ));
      const screenToggleButton = document.createElement("button");
      ((screenToggleButton.type = "button"),
        (screenToggleButton.className = screenLayerItem.screenEnabled !== false ? "on" : ""),
        (screenToggleButton.textContent = screenLayerItem.screenEnabled !== false ? "◉" : "○"),
        (screenToggleButton.title =
          screenLayerItem.screenEnabled !== false ? "关闭电视画面" : "开启电视画面"),
        screenToggleButton.addEventListener("click", () => {
          (deselectAll(),
            (screenLayerItem.screenEnabled = screenLayerItem.screenEnabled === false),
            refreshScopeItems("items"),
            markDocumentDirty());
        }));
      const screenNameLabel = document.createElement("span");
      ((screenNameLabel.className = "light-group-name"),
        (screenNameLabel.textContent =
          screenLayerItem.screenLayerName || "电视画面 " + (screenRowIndex + 1)),
        (screenNameLabel.title = "电视开启画面"));
      const screenLayerIndexNote = document.createElement("small");
      ((screenLayerIndexNote.textContent = "1"),
        screenLayerRowElement.append(screenToggleButton, screenNameLabel, screenLayerIndexNote),
        lightGroupListElement.append(screenLayerRowElement));
    }
    for (const [chargingRowIndex, chargingLayerItem] of getChargingLightGroups().entries()) {
      const chargingLayerRowElement = document.createElement("div");
      ((chargingLayerRowElement.className = "light-group-row car-charging-layer-row"),
        chargingLayerRowElement.setAttribute(
          "aria-label",
          (chargingLayerItem.chargingLayerName || "汽车充电 " + (chargingRowIndex + 1)) +
            "，可独立开启或关闭",
        ));
      const chargingToggleButton = document.createElement("button");
      ((chargingToggleButton.type = "button"),
        (chargingToggleButton.className = chargingLayerItem.chargingEnabled === true ? "on" : ""),
        (chargingToggleButton.textContent = chargingLayerItem.chargingEnabled === true ? "◉" : "○"),
        (chargingToggleButton.title =
          chargingLayerItem.chargingEnabled === true ? "关闭汽车充电状态" : "开启汽车充电状态"),
        chargingToggleButton.addEventListener("click", () => {
          (deselectAll(),
            (chargingLayerItem.chargingEnabled = chargingLayerItem.chargingEnabled !== true),
            refreshScopeItems("items"),
            markDocumentDirty());
        }));
      const chargingNameLabel = document.createElement("span");
      ((chargingNameLabel.className = "light-group-name"),
        (chargingNameLabel.textContent =
          chargingLayerItem.chargingLayerName || "汽车充电 " + (chargingRowIndex + 1)),
        (chargingNameLabel.title = "汽车充电中状态图层"));
      const chargingIndexNote = document.createElement("small");
      ((chargingIndexNote.textContent = "1"),
        chargingLayerRowElement.append(chargingToggleButton, chargingNameLabel, chargingIndexNote),
        lightGroupListElement.append(chargingLayerRowElement));
    }
  }
}
function setAllLightGroupsEnabled(enabledFlag: any) {
  const bl2 = getScreenLightGroups(),
    gl2 = getChargingLightGroups();
  if (!(
    (appCtx.studioState.lightGroups || []).every(
      (lightGroupEnabledCheck) => lightGroupEnabledCheck.enabled === enabledFlag,
    ) &&
    bl2.every(
      (screenEnabledCheck) => (screenEnabledCheck.screenEnabled !== false) === enabledFlag,
    ) &&
    gl2.every(
      (chargingEnabledCheck) => (chargingEnabledCheck.chargingEnabled === true) === enabledFlag,
    )
  )) {
    deselectAll();
    for (const lightGroupToggleTarget of appCtx.studioState.lightGroups)
      lightGroupToggleTarget.enabled = enabledFlag;
    for (const screenToggleTarget of bl2) screenToggleTarget.screenEnabled = enabledFlag;
    for (const chargingToggleTarget of gl2) chargingToggleTarget.chargingEnabled = enabledFlag;
    (transitionLightGroups(appCtx.studioState.lightGroups.map((lightGroupIdItem) => lightGroupIdItem.id)),
      (bl2.length || gl2.length) &&
        requestSceneRebuild({
          scope: "items",
          preserveLightCache: true,
        }),
      markDocumentDirty());
  }
}
function createSelectionRef(selectionKind: any, selectionId: any) {
  return (
    (appCtx.selectedItem?.kind === selectionKind && appCtx.selectedItem.id === selectionId) ||
    appCtx.selectedItems.some(
      (selectionCandidate: any) =>
        selectionCandidate.kind === selectionKind && selectionCandidate.id === selectionId,
    )
  );
}
function refreshSelection() {
  ((appCtx.selectedItem = null), (appCtx.selectedItems = []));
}
function isPlanItemVisible(planItemRef: any) {
  return appCtx.activeLibraryCategory === "courtyard"
    ? isCourtyardPlanItem2(planItemRef)
    : lampItemTypeSet.has(planItemRef.type) === (appCtx.activeLibraryCategory === "light");
}
function isSelectionAllowed(selectionObject: any) {
  return selectionObject
    ? selectionObject.kind === "item"
      ? isPlanItemVisible(
          appCtx.studioState.items.find((itemLookupMatch) => itemLookupMatch.id === selectionObject.id) ||
            {},
        )
      : !["courtyard", "light"].includes(appCtx.activeLibraryCategory)
    : false;
}
function selectSceneObject(objectKind: any, objectId: any) {
  ((appCtx.selectedItem =
    objectKind && objectId
      ? {
          kind: objectKind,
          id: objectId,
        }
      : null),
    (appCtx.selectedItems = []));
}
function getDefaultSelectionScope() {
  return appCtx.studioState.walls?.length >= 3 && closedWallLoops(getPixelsPerMeter()).length
    ? "items"
    : "all";
}
function resolvePreviewScope(scopeItem: any) {
  return scopeItem?.type === "flooropening"
    ? "all"
    : isCourtyardDrawing2(scopeItem) || isCourtyardGate2(scopeItem)
      ? getDefaultSelectionScope()
      : lampItemTypeSet.has(scopeItem?.type)
        ? "lights"
        : "items";
}
function classifySelectionScope(selectionList: any) {
  if (
    selectionList.length &&
    selectionList.every((archElementSelection: any) =>
      ["door", "window", "railing"].includes(archElementSelection.kind),
    )
  )
    return "architecture";
  if (
    !selectionList.length ||
    selectionList.some((nonItemSelection: any) => nonItemSelection.kind !== "item")
  )
    return "all";
  const selectedIdSet = new Set(selectionList.map((selectionIdEntry: any) => selectionIdEntry.id)),
    scopedSelectedItems = appCtx.studioState.items.filter((selectedItemRef) =>
      selectedIdSet.has(selectedItemRef.id),
    );
  if (
    !scopedSelectedItems.length ||
    scopedSelectedItems.some((floorOpeningItem) => floorOpeningItem.type === "flooropening")
  )
    return "all";
  if (
    scopedSelectedItems.some(
      (courtyardItem) => isCourtyardDrawing2(courtyardItem) || isCourtyardGate2(courtyardItem),
    )
  )
    return scopedSelectedItems.some((lampSelectedItem) =>
      lampItemTypeSet.has(lampSelectedItem.type),
    )
      ? "all"
      : getDefaultSelectionScope();
  const lampCount = scopedSelectedItems.filter((lampCountItem) =>
    lampItemTypeSet.has(lampCountItem.type),
  ).length;
  return lampCount === scopedSelectedItems.length ? "lights" : lampCount === 0 ? "items" : "all";
}
function getCurrentPreviewScope() {
  return classifySelectionScope(
    appCtx.selectedItems.length ? appCtx.selectedItems : appCtx.selectedItem ? [appCtx.selectedItem] : [],
  );
}
function classifyLightingScope(lightSelectionList: any) {
  if (!lightSelectionList.length) return null;
  if (
    lightSelectionList.every((archElementCheck: any) =>
      ["wall", "door", "window", "railing"].includes(archElementCheck.kind),
    )
  )
    return "architecture";
  if (lightSelectionList.some((nonItemCheck: any) => nonItemCheck.kind !== "item")) return "all";
  const lightSelectionIdSet = new Set(
      lightSelectionList.map((lightSelectionIdEntry: any) => lightSelectionIdEntry.id),
    ),
    lightSelectedItems = appCtx.studioState.items.filter((lightSelectedRef) =>
      lightSelectionIdSet.has(lightSelectedRef.id),
    );
  if (!lightSelectedItems.length) return null;
  const lightFixtureItems = lightSelectedItems.filter(
    (lightFixtureRef) =>
      !lampItemTypeSet.has(lightFixtureRef.type) || lightFixtureRef.type === "striplight",
  );
  if (!lightFixtureItems.length) return null;
  const lampFixtureCount = lightFixtureItems.filter((lampFixtureRef) =>
    lampItemTypeSet.has(lampFixtureRef.type),
  ).length;
  return lampFixtureCount === lightFixtureItems.length
    ? "lights"
    : lampFixtureCount === 0
      ? "items"
      : "all";
}
function getPreviewScopeSelection() {
  return classifyLightingScope(
    appCtx.selectedItems.length ? appCtx.selectedItems : appCtx.selectedItem ? [appCtx.selectedItem] : [],
  );
}
function setPreviewScope(scopeRequest: any) {
  const defaultScope = getPreviewScopeSelection(),
    previewScopeSet = new Set([scopeRequest, defaultScope].filter(Boolean));
  if (previewScopeSet.size) {
    if (previewScopeSet.has("all")) {
      requestSceneRebuild({
        scope: "all",
        preserveLightCache: true,
      });
      return;
    }
    for (const previewScopeEntry of previewScopeSet)
      requestSceneRebuild({
        scope: previewScopeEntry,
        preserveLightCache: true,
      });
  }
}
function markWallsChanged() {
  const tf3 = remapOpeningsToWalls(
    appCtx.studioState.walls,
    appCtx.studioState.windows,
    appCtx.studioState.doors,
    getPixelsPerMeter() || 1,
    appCtx.studioState.railings,
  );
  ((appCtx.studioState.walls = tf3.walls),
    (appCtx.studioState.windows = tf3.windows),
    (appCtx.studioState.doors = tf3.doors),
    (appCtx.studioState.railings = tf3.railings));
}
function rebuildWallIndex() {
  const wallByIdBeforeMerge = new Map(
      appCtx.studioState.walls.map((wallEntry) => [wallEntry.id, wallEntry]),
    ),
    mergedWallResult = mergeCollinearWallSegments2(appCtx.studioState.walls, 0.000001);
  if (mergedWallResult.walls.length === appCtx.studioState.walls.length) return 0;
  const wallByIdAfterMerge = new Map(
      mergedWallResult.walls.map((mergedWallEntry: any) => [mergedWallEntry.id, mergedWallEntry]),
    ),
    remapWallAttachment = (attachmentRecord: any) => {
      const mergedWallId = mergedWallResult.wallIdMap.get(attachmentRecord.wallId),
        sourceWallRecord = wallByIdBeforeMerge.get(attachmentRecord.wallId),
        targetWallRecord = wallByIdAfterMerge.get(mergedWallId);
      if (!mergedWallId || !sourceWallRecord || !targetWallRecord) return attachmentRecord;
      const remappedAttachment = remapWallAttachment2(
        attachmentRecord,
        sourceWallRecord,
        targetWallRecord,
      );
      return (
        (remappedAttachment.t = clampWindowT2(
          targetWallRecord,
          remappedAttachment,
          getPixelsPerMeter() || 1,
        )),
        remappedAttachment
      );
    },
    removedWallCount = appCtx.studioState.walls.length - mergedWallResult.walls.length;
  return (
    (appCtx.studioState.walls = mergedWallResult.walls),
    (appCtx.studioState.windows = appCtx.studioState.windows.map(remapWallAttachment)),
    (appCtx.studioState.doors = appCtx.studioState.doors.map(remapWallAttachment)),
    (appCtx.studioState.railings = appCtx.studioState.railings.map(remapWallAttachment)),
    removedWallCount
  );
}
function getPixelsPerMeter() {
  return appCtx.studioState.calibration?.pixelsPerMeter || 0;
}
class StudioApiError extends Error {
  /** HTTP 状态码，调用方按它分支（409 冲突 / 428 需要交互确认）。 */
  status: number;
  /** 服务端返回的错误体，detail.code 用来细分失败原因。 */
  payload: any;
  constructor(errorMessage: any, errorStatus: any, errorPayload: any) {
    (super(errorMessage), (this.status = errorStatus), (this.payload = errorPayload));
  }
}
async function fetchStudioApi(
  apiPath: any,
  requestOptions: StudioApiRequestOptions = {},
  responsePromise: any = null,
) {
  if (isEmbeddedStage && requestOptions.method && requestOptions.method !== "GET")
    throw new Error("交互户型为只读视图。");
  const httpResponse = await (responsePromise ||
      fetch("/api/v1" + apiPath, {
        cache: "no-store",
        ...requestOptions,
        headers: requestOptions.body
          ? {
              "Content-Type": "application/json",
              ...(requestOptions.headers || {}),
            }
          : requestOptions.headers,
      })),
    responseTextBody = httpResponse.status === 204 ? "" : await httpResponse.text();
  let errorBody: any = null;
  if (responseTextBody)
    try {
      errorBody = JSON.parse(responseTextBody);
    } catch {
      errorBody = null;
    }
  if (httpResponse.status === 401) {
    navigateInShell("/login?next=" + encodeURIComponent(window.location.pathname));
    const ru2 = new StudioApiError("登录状态已失效。", httpResponse.status, errorBody);
    throw window.HomeOSLog?.linkError!(ru2, httpResponse)! || ru2;
  }
  if (httpResponse.status === 403 && errorBody?.detail?.code === "LICENSE_RESTRICTED") {
    navigateInShell("/activate");
    const ru3 = new StudioApiError("当前授权无法使用户型图绘制。", httpResponse.status, errorBody);
    throw window.HomeOSLog?.linkError!(ru3, httpResponse)! || ru3;
  }
  if (!httpResponse.ok) {
    const errorDetail = errorBody?.detail,
      ru4 = new StudioApiError(
        typeof errorDetail == "string"
          ? errorDetail
          : errorDetail?.message || "请求失败（HTTP " + httpResponse.status + "）",
        httpResponse.status,
        errorBody,
      );
    throw window.HomeOSLog?.linkError!(ru4, httpResponse)! || ru4;
  }
  return errorBody;
}
function showToast(toastMessage: any, toastKind = "") {
  // 走外壳 chrome toast（App 根挂载的 VNotification），不再操作本页 .toast DOM。
  shellNotify(String(toastMessage ?? ""), String(toastKind ?? ""));
}
function showSaveState(saveStateText: any, saveStateKind = "") {
  ((saveStateElement.className = ("save-state " + saveStateKind).trim()),
    (saveStateElement.innerHTML = "<i></i>" + saveStateText));
  const mapped =
    saveStateKind === "saving"
      ? "saving"
      : saveStateKind === "error"
        ? "error"
        : saveStateKind === "saved"
          ? "saved"
          : saveStateText?.includes?.("未保存") || saveStateKind === "saving"
            ? "dirty"
            : "idle";
  patchStudioFacadeState({
    dirty: mapped === "dirty" || mapped === "saving",
    saveState: mapped as any,
    history: {
      canUndo: appCtx.undoRecords.length > 0,
      canRedo: appCtx.redoRecords.length > 0,
      undoDepth: appCtx.undoRecords.length,
      redoDepth: appCtx.redoRecords.length,
    },
    activeTool: appCtx.activeToolName,
  });
}

function syncStudioHistoryFacade() {
  patchStudioFacadeState({
    history: buildStudioHistoryPatch(appCtx.undoRecords.length, appCtx.redoRecords.length),
    activeTool: appCtx.activeToolName,
  });
}

/** 语义正确的撤销 / 重做（旧名 deleteSelectedObjects / duplicateSelectedObjects 易误导）。 */
async function undoStudioHistory() {
  if (!appCtx.undoRecords.length) return;
  appCtx.redoRecords.push(captureUndoSnapshot());
  const pop = appCtx.undoRecords.pop();
  await restoreSnapshot(pop);
  syncStudioHistoryFacade();
}
async function redoStudioHistory() {
  if (!appCtx.redoRecords.length) return;
  appCtx.undoRecords.push(captureUndoSnapshot());
  const pop2 = appCtx.redoRecords.pop();
  await restoreSnapshot(pop2);
  syncStudioHistoryFacade();
}
function validateSelectionChange(placementChange: any) {
  const placementError = validatePlacementChange2(
    placementChange,
    appCtx.studioState,
    getPixelsPerMeter() || 100,
  );
  return placementError
    ? (showToast(placementError, "error"),
      appCtx.selectedItem && !getSelectedObject() && refreshSelection(),
      (appCtx.selectedItems = appCtx.selectedItems.filter(
        (selectionEntry: any) =>
          selectionEntry.kind !== "item" ||
          appCtx.studioState.items.some((selectedItemMatch) => selectedItemMatch.id === selectionEntry.id),
      )),
      false)
    : true;
}
function deselectAll() {
  (appCtx.undoRecords.push(captureUndoSnapshot()),
    appCtx.undoRecords.length > 40 && appCtx.undoRecords.shift(),
    (appCtx.redoRecords = []));
}
function applyPlacementChange(undoSnapshot: any) {
  (appCtx.undoRecords.push(undoSnapshot),
    appCtx.undoRecords.length > 40 && appCtx.undoRecords.shift(),
    (appCtx.redoRecords = []));
}
async function restoreSnapshot(snapshotDocument: any) {
  /**
   * 0.6.8 合并墙保护：恢复删除备份前，若恢复会改写一面当前仍存在的墙，
   * 而当前场景在这面墙上新增了门窗或栏杆（不在备份的 attachmentIds 内），
   * 说明合并墙在备份之后又发生变化，此时拒绝恢复，提示先撤销这些改动。
   */
  const backupWallById = new Map<string, any>(
      (snapshotDocument.walls || []).map((backupWall: any) => [backupWall.id, backupWall]),
    ),
    changedWallIds = new Set(
      (appCtx.studioState.walls || [])
        .filter((currentWall) => {
          const backupWall = backupWallById.get(currentWall.id);
          return (
            backupWall &&
            (backupWall.start.x !== currentWall.start.x ||
              backupWall.start.y !== currentWall.start.y ||
              backupWall.end.x !== currentWall.end.x ||
              backupWall.end.y !== currentWall.end.y)
          );
        })
        .map((currentWall) => currentWall.id),
    );
  if (changedWallIds.size)
    for (const attachmentKey of ["windows", "doors", "railings"]) {
      const backupAttachmentIds = new Set(
        (snapshotDocument[attachmentKey] || []).map((attachmentRecord: any) => attachmentRecord.id),
      );
      if (
        ((appCtx.studioState as any)[attachmentKey] || []).some(
          (attachmentRecord: any) =>
            changedWallIds.has(attachmentRecord.wallId) &&
            !backupAttachmentIds.has(attachmentRecord.id),
        )
      )
        throw new Error("合并墙上已有新增门窗或栏杆，请先撤销这些改动，再撤销删除。");
    }
  (selectStudioTool("select"), (appCtx.studioState = normalizeScenePayload(snapshotDocument, externalModelRegistry)));
  const ae6 = getActiveFloor();
  (ae6 && (ae6.scene = appCtx.studioState),
    (appCtx.planView.rotation = appCtx.studioState.settings.planViewRotation),
    refreshSelection(),
    refreshPreviewScene(),
    await loadBackgroundImage(),
    refreshScopeItems(),
    markDocumentDirty());
}
/** @deprecated 误导性旧名，实际为 undo；请用 undoStudioHistory */
async function deleteSelectedObjects() {
  await undoStudioHistory();
}
/** @deprecated 误导性旧名，实际为 redo；请用 redoStudioHistory */
async function duplicateSelectedObjects() {
  await redoStudioHistory();
}
function markDocumentDirty() {
  isEmbeddedStage ||
    (syncCourtyardGates2(appCtx.studioState.items, getPixelsPerMeter() || 100),
    (appCtx.isExporting = false),
    (appCtx.localSaveRevision += 1),
    (appCtx.firstLocalChangeAt ??= Date.now()),
    (appCtx.lastLocalChangeAt = Date.now()),
    showSaveState("有未保存修改", "saving"),
    scheduleAutosave(),
    refreshStepChecklist());
}
async function applyLoadedDraft(draftPayload: any, draftScene: any = null) {
  stageLoadTiming("draft-normalize-start");
  const draftApplyRequestId = ++appCtx.draftLoadRequestId;
  if (
    (window.clearTimeout(appCtx.modelLoadDebounceId),
    (appCtx.modelLoadDebounceId = null),
    (appCtx.deferredModelTypes = []),
    (appCtx.isExternalModelLoadDeferred = false),
    (window.externalModelLoadsDeferred = false),
    (appCtx.loadedDraft = draftPayload),
    (appCtx.isSceneStillLoading = isEmbeddedStage),
    (appCtx.studioProject = draftScene || normalizeStudioDocument(draftPayload.scene, studioDocumentDeps())),
    isEmbeddedStage)
  ) {
    for (const livePreviewFloor of appCtx.studioProject.floors)
      livePreviewFloor.scene.settings.livePreviewEnabled = true;
  }
  if (
    (applyBaseLighting(appCtx.studioProject.baseLighting),
    (appCtx.activeFloorId = appCtx.studioProject.activeFloorId),
    isAutoDiagramEmbed &&
      appCtx.studioProject.floors.length > 1 &&
      (appCtx.studioProject.previewFloorMode = "all"),
    isAutoDiagramEmbed && floorSelectionId !== null)
  ) {
    const floorSelectionRecord = appCtx.studioProject.floors.find(
      (floorSelectionMatch: any) => floorSelectionMatch.id === floorSelectionId,
    );
    floorSelectionId === "all" && appCtx.studioProject.floors.length > 1
      ? (appCtx.studioProject.previewFloorMode = "all")
      : floorSelectionRecord &&
        ((appCtx.studioProject.previewFloorMode = "active"),
        (appCtx.studioProject.activeFloorId = floorSelectionRecord.id),
        (appCtx.activeFloorId = floorSelectionRecord.id));
  }
  ((appCtx.studioState = getActiveFloor().scene),
    (appCtx.activeLightGroupId = ""),
    refreshSelection(),
    refreshPreviewScene(),
    (appCtx.undoRecords = []),
    (appCtx.redoRecords = []));

  await refreshLightAreasFromHa();
  const selectedFloorRecords = collectSelectedFloors();
  if (isEmbeddedStage) {
    appCtx.isExternalModelPending = true;
    const sceneModelPayload = collectScenePayload(appCtx.studioProject.floors, {
      includeCurtains: true,
    });
    (preloadPersistentModels(sceneModelPayload),
      Promise.allSettled(loadModelsForTypes(sceneModelPayload)).then(
        (modelLoadResults) => (stageLoadTiming("initial-models-ready"), modelLoadResults),
      ),
      stageLoadTiming("initial-models-start"));
  }
  const Qe2 = isAutoDiagramEmbed;
  Qe2 && (appCtx.isModelLoadDeferred = true);
  let preloadModelPromises: any[] = [];
  (Qe2 &&
    (preloadModelPromises = selectedFloorRecords.map((modelRecord) =>
      ensureExternalModelLoaded(modelRecord),
    )),
    (appCtx.isExternalModelLoadDeferred = !Qe2 && !isEmbeddedStage),
    (window.externalModelLoadsDeferred = appCtx.isExternalModelLoadDeferred),
    (appCtx.deferredModelTypes = Qe2 ? [] : selectedFloorRecords),
    appCtx.isExternalModelLoadDeferred && scheduleModelLoadFlush(),
    publishModelLoadState(),
    updateFloorPreviewButtons(),
    renderFloorList(),
    (appCtx.planView.rotation = appCtx.studioState.settings.planViewRotation),
    stageLoadTiming("background-start"));
  const gu3 = loadBackgroundImage();
  if (
    (isEmbeddedStage || (await gu3),
    stageLoadTiming("background-end"),
    refreshScopeItems(Qe2 ? "none" : "all"),
    !Qe2 && !isEmbeddedStage && scheduleLightPrecompile(1200),
    Qe2)
  )
    try {
      const allSettled = Promise.allSettled(preloadModelPromises);
      (await Promise.race([
        allSettled,
        new Promise((raceTimeoutResolve) => window.setTimeout(raceTimeoutResolve, 3500)),
      ]),
        Promise.allSettled(preloadModelPromises).then(() => {
          draftApplyRequestId === appCtx.draftLoadRequestId && finishModelLoad();
        }));
    } finally {
      draftApplyRequestId === appCtx.draftLoadRequestId &&
        (window.clearTimeout(appCtx.modelLoadTimeoutId),
        (appCtx.modelLoadTimeoutId = null),
        (appCtx.isModelLoadDeferred = false),
        publishModelLoadState());
    }
  else
    (requestSceneRebuild({
      force: true,
    }),
      preloadModelPromises.length &&
        Promise.allSettled(preloadModelPromises).then(() => {
          draftApplyRequestId === appCtx.draftLoadRequestId && finishModelLoad();
        }));
  (resizePlanStage(),
    resetView(),
    !Qe2 &&
      !isEmbeddedStage &&
      requestAnimationFrame(() => {
        captureCameraView()
          ? applyCameraSnapshot({
              recordChange: false,
              silent: true,
            })
          : (setCameraMode(getCameraMode(), {
              preserveView: false,
            }),
            updateCameraView());
      }));
}
function recordSaveConflict(conflictLatest: any, conflictLocalScene: any, conflictTargetVersion: any) {
  ((appCtx.pendingConflict = {
    latest: conflictLatest,
    localScene: conflictLocalScene,
    targetVersion: conflictTargetVersion,
  }),
    showSaveState("等待处理保存冲突", "error"),
    saveConflictDialogElement.open || saveConflictDialogElement.showModal());
}
/** 0.6.8 退出保护：非重试性保存失败后锁定的版本；自动保存重试状态与退出请求状态。 */
/** 自动保存节奏：最后一次修改后 3s 合并保存，首次修改后最多 15s 兜底。 */
const AUTOSAVE_DEBOUNCE_MS = 3000,
  AUTOSAVE_MAX_DELAY_MS = 15000;
/** 等待进行中保存完成的解析器；等待交互结束再落盘的解析器（退出「保存并退出」用）。 */
const saveWaiterResolvers = new Set<() => void>(),
  exitWaiterResolvers = new Set<() => void>();
/** 保存失败后的重试状态复位（重试次数、重试到期时间、非重试性失败锁定版本）。 */
function resetSaveRetryState() {
  ((appCtx.saveFailureRetryCount = 0), (appCtx.saveRetryDueAt = 0), (appCtx.failedSaveRevision = -1));
}
/** 自动保存调度：合并 3s 内的多次修改，首次修改后最多 15s 兜底；失败重试按退避到期时间。 */
function scheduleAutosave(explicitDelayMs?: number) {
  if (
    (window.clearTimeout(appCtx.autosaveTimeoutId),
    (appCtx.autosaveTimeoutId = null),
    isEmbeddedStage ||
      appCtx.isPageSuspended ||
      (document.hidden && appCtx.saveRetryDueAt > 0) ||
      navigator.onLine === false ||
      !appCtx.loadedDraft ||
      appCtx.isSaveInFlight ||
      studioExitDialogElement.open ||
      appCtx.pendingConflict ||
      appCtx.localSaveRevision === appCtx.remoteSaveRevision ||
      appCtx.localSaveRevision === appCtx.blockedSaveRevision ||
      appCtx.localSaveRevision === appCtx.failedSaveRevision)
  )
    return;
  const now = Date.now(),
    dueAt =
      appCtx.saveRetryDueAt > 0
        ? appCtx.saveRetryDueAt
        : explicitDelayMs !== undefined
          ? now + explicitDelayMs
          : Math.min(
              (appCtx.lastLocalChangeAt ?? now) + AUTOSAVE_DEBOUNCE_MS,
              (appCtx.firstLocalChangeAt ?? now) + AUTOSAVE_MAX_DELAY_MS,
            );
  appCtx.autosaveTimeoutId = window.setTimeout(flushAutosave, Math.max(0, dueAt - now));
}
/** 交互（平面拖拽 / 渲染抑制 / 庭院绘制）结束后：释放退出等待者，并补一次被推迟的自动保存。 */
function handleInteractionEnded() {
  if (!isInteractionBusy()) {
    for (const exitWaiter of exitWaiterResolvers) exitWaiter();
    (exitWaiterResolvers.clear(),
      appCtx.isInteractionDeferredSave && ((appCtx.isInteractionDeferredSave = false), scheduleAutosave()));
  }
}
function isInteractionBusy() {
  return appCtx.isWindowHidden || appCtx.isRenderSuppressed || !!planPainter?.isDragging?.();
}
/** 退出前的未保存判定：进行中保存、版本差、导出存档脏、平面拖拽或庭院绘制待提交。 */
function hasUnsavedChanges() {
  return (
    appCtx.isSaveInFlight ||
    appCtx.localSaveRevision !== appCtx.remoteSaveRevision ||
    appCtx.isExportPresetDirty ||
    !!appCtx.marqueeBox?.moved ||
    !!planPainter?.hasPendingChange?.()
  );
}
function refreshExitDialogButtons() {
  ((studioExitSaveButton.disabled = appCtx.isExitSaveInFlight),
    (studioExitDiscardButton.disabled = appCtx.isSaveInFlight || appCtx.isExitSaveInFlight),
    (studioExitSaveButton.textContent = appCtx.isExitSaveInFlight ? "正在保存…" : "保存并退出"));
}
/** 「继续编辑」/ Esc：作废当前退出请求，释放等待者并关闭对话框。 */
function closeExitDialog() {
  ((appCtx.exitSaveRequestId += 1), (appCtx.isExitSaveInFlight = false));
  for (const exitWaiter of exitWaiterResolvers) exitWaiter();
  (exitWaiterResolvers.clear(),
    studioExitDialogElement.close(),
    refreshExitDialogButtons(),
    scheduleAutosave());
}
/** 「不保存并退出」：标记离开状态并跳转回编辑器。 */
function leaveStudio() {
  ((appCtx.isLeavingStudio = true),
    window.clearTimeout(appCtx.autosaveTimeoutId),
    (appCtx.autosaveTimeoutId = null),
    navigateInShell(studioBackLinkElement.href));
}
async function flushAutosave() {
  if (
    isEmbeddedStage ||
    appCtx.isPageSuspended ||
    (document.hidden && appCtx.saveRetryDueAt > 0) ||
    navigator.onLine === false ||
    !appCtx.loadedDraft ||
    appCtx.isSaveInFlight ||
    appCtx.pendingConflict ||
    appCtx.localSaveRevision === appCtx.remoteSaveRevision ||
    appCtx.localSaveRevision === appCtx.failedSaveRevision
  )
    return;
  if (Date.now() < appCtx.saveRetryDueAt) {
    scheduleAutosave();
    return;
  }
  if (appCtx.localSaveRevision === appCtx.blockedSaveRevision) return;
  if (isInteractionBusy()) {
    appCtx.isInteractionDeferredSave = true;
    return;
  }
  (window.clearTimeout(appCtx.autosaveTimeoutId), (appCtx.autosaveTimeoutId = null), (appCtx.isInteractionDeferredSave = false));
  const previousFirstLocalChangeAt = appCtx.firstLocalChangeAt,
    previousLastLocalChangeAt = appCtx.lastLocalChangeAt;
  ((appCtx.firstLocalChangeAt = appCtx.lastLocalChangeAt = null), (appCtx.isSaveInFlight = true), refreshExitDialogButtons());
  const saveRevisionAtStart = appCtx.localSaveRevision;
  showSaveState("正在保存…", "saving");
  const saveStudioDraft = async (draftToSave: any) => {
    const latestLocalRevision = getLocalSaveRevision(),
      putStudioDraft = (interactionConfirmationToken = "") =>
        fetchStudioApi("/studio3d", {
          method: "PUT",
          hbLogContext: {
            phase: "studio-save",
          },
          body: JSON.stringify({
            revision: draftToSave.revision,
            scene: latestLocalRevision,
            interactionConfirmation: interactionConfirmationToken,
          }),
        });
    try {
      return await putStudioDraft();
    } catch (saveError: any) {
      const saveErrorDetail = saveError.payload?.detail;
      if (saveError.status !== 428 || saveErrorDetail?.code !== "STUDIO3D_INTERACTION_CONFIRMATION")
        throw saveError;
      return (await resolveInteractionCleanup(saveErrorDetail, deleteSelectedObjects, showToast))
        ? putStudioDraft(saveErrorDetail.token)
        : ((appCtx.blockedSaveRevision = saveRevisionAtStart),
          showSaveState("删除未确认，尚未保存", "error"),
          null);
    }
  };
  try {
    try {
      const savedDraft = await saveStudioDraft(appCtx.loadedDraft);
      if (!savedDraft) return;
      appCtx.loadedDraft = savedDraft;
    } catch (conflictError: any) {
      if (conflictError.status !== 409) throw conflictError;
      const xa2 = await fetchStudioApi("/studio3d");
      recordSaveConflict(xa2, getLocalSaveRevision(), saveRevisionAtStart);
      return;
    }
    (resetSaveRetryState(),
      (appCtx.remoteSaveRevision = Math.max(appCtx.remoteSaveRevision, saveRevisionAtStart)),
      appCtx.localSaveRevision === appCtx.remoteSaveRevision && showSaveState("已自动保存", "saved"));
  } catch (saveFailure: any) {
    (window.HomeOSLog?.error!(saveFailure, {
      phase: "studio-save",
    }),
      (appCtx.saveFailureRetryCount += 1));
    const isRetryableFailure =
      !saveFailure.status ||
      [408, 425, 429].includes(saveFailure.status) ||
      saveFailure.status >= 500;
    (isRetryableFailure
      ? ((appCtx.saveRetryDueAt =
          Date.now() + Math.min(30000, 2000 * 2 ** Math.min(appCtx.saveFailureRetryCount - 1, 4))),
        showSaveState("保存失败，稍后自动重试", "error"))
      : ((appCtx.failedSaveRevision = saveRevisionAtStart),
        (appCtx.saveRetryDueAt = 0),
        showSaveState("保存失败，修改后重试", "error")),
      (appCtx.saveFailureRetryCount === 1 || !isRetryableFailure) &&
        showToast(saveFailure.message || "3D 草稿保存失败。", "error"));
  } finally {
    (appCtx.remoteSaveRevision < saveRevisionAtStart &&
      ((appCtx.firstLocalChangeAt = Math.min(
        previousFirstLocalChangeAt ?? Date.now(),
        appCtx.firstLocalChangeAt ?? Date.now(),
      )),
      (appCtx.lastLocalChangeAt = Math.max(previousLastLocalChangeAt ?? 0, appCtx.lastLocalChangeAt ?? 0))),
      (appCtx.isSaveInFlight = false),
      refreshExitDialogButtons());
    for (const saveWaiter of saveWaiterResolvers) saveWaiter();
    (saveWaiterResolvers.clear(), scheduleAutosave());
  }
}
(saveConflictDialogElement.addEventListener("cancel", (dialogCancelEvent: any) =>
  dialogCancelEvent.preventDefault(),
),
  saveConflictLoadButton.addEventListener("click", async () => {
    const Vr2 = appCtx.pendingConflict;
    if (Vr2) {
      ((appCtx.pendingConflict = null),
        window.clearTimeout(appCtx.autosaveTimeoutId),
        resetSaveRetryState(),
        (appCtx.blockedSaveRevision = -1),
        (appCtx.firstLocalChangeAt = appCtx.lastLocalChangeAt = null),
        saveConflictDialogElement.close());
      try {
        (await applyLoadedDraft(Vr2.latest),
          (appCtx.remoteSaveRevision = appCtx.localSaveRevision),
          showSaveState("已加载服务器版本", "saved"),
          showToast("已加载另一页面保存的户型，当前页面没有执行覆盖。", "success"),
          scheduleAutosave(0));
      } catch (loadFailure: any) {
        (showSaveState("载入失败", "error"),
          showToast(loadFailure.message || "服务器版本载入失败。", "error"));
      }
    }
  }),
  saveConflictOverwriteButton.addEventListener("click", () => {
    const Vr3 = appCtx.pendingConflict;
    Vr3 &&
      (resetSaveRetryState(),
      (appCtx.studioProject = normalizeStudioDocument(Vr3.localScene, studioDocumentDeps())),
      (appCtx.activeFloorId = appCtx.studioProject.activeFloorId),
      (appCtx.studioState = getActiveFloor().scene),
      (appCtx.loadedDraft = Vr3.latest),
      (appCtx.pendingConflict = null),
      saveConflictDialogElement.close(),
      showSaveState("正在确认覆盖…", "saving"),
      window.clearTimeout(appCtx.autosaveTimeoutId),
      scheduleAutosave(0));
  }));
// 退出保护三态对话框：返回编辑器前的未保存拦截、等待保存完成后再退出、不保存直接退出。
studioBackLinkElement.addEventListener("click", (studioBackLinkEvent: any) => {
  if (
    studioBackLinkEvent.button ||
    studioBackLinkEvent.ctrlKey ||
    studioBackLinkEvent.metaKey ||
    studioBackLinkEvent.shiftKey ||
    studioBackLinkEvent.altKey
  )
    return;
  // 已保存：交给外壳路由同文档内切回总览（该链接是普通 <a>，不拦截就会整页跳转）。
  if (!hasUnsavedChanges()) {
    (studioBackLinkEvent.preventDefault(), navigateInShell(studioBackLinkElement.href));
    return;
  }
  (studioBackLinkEvent.preventDefault(),
    window.clearTimeout(appCtx.autosaveTimeoutId),
    (appCtx.autosaveTimeoutId = null),
    (studioExitMessageElement.textContent = appCtx.isSaveInFlight
      ? "户型正在保存。可以等待保存完成后退出，或继续编辑。"
      : "户型还有未保存的修改。保存成功后再退出，或不保存本次待提交的修改。已保存的内容会保留。"),
    refreshExitDialogButtons(),
    studioExitDialogElement.open || studioExitDialogElement.showModal());
});
studioExitContinueButton.addEventListener("click", closeExitDialog);
studioExitDialogElement.addEventListener("keydown", (studioExitKeyEvent: any) =>
  studioExitKeyEvent.stopPropagation(),
);
studioExitDialogElement.addEventListener("cancel", (studioExitCancelEvent: any) => {
  (studioExitCancelEvent.preventDefault(), closeExitDialog());
});
studioExitDiscardButton.addEventListener("click", () => {
  if (!appCtx.isSaveInFlight && !appCtx.isExitSaveInFlight) leaveStudio();
});
studioExitSaveButton.addEventListener("click", async () => {
  if (appCtx.isExitSaveInFlight) return;
  const exitSaveRequestToken = ++appCtx.exitSaveRequestId;
  ((appCtx.isExitSaveInFlight = true),
    refreshExitDialogButtons(),
    (studioExitMessageElement.textContent = "正在保存，成功后将返回编辑器。你也可以继续编辑。"));
  try {
    if (
      (appCtx.isSaveInFlight && (await new Promise<void>((resolve) => saveWaiterResolvers.add(resolve))),
      exitSaveRequestToken !== appCtx.exitSaveRequestId ||
        (isInteractionBusy() &&
          (await new Promise<void>((resolve) => exitWaiterResolvers.add(resolve))),
        exitSaveRequestToken !== appCtx.exitSaveRequestId) ||
        (resetSaveRetryState(),
        (appCtx.blockedSaveRevision = -1),
        saveExportPreset(),
        await flushAutosave(),
        exitSaveRequestToken !== appCtx.exitSaveRequestId))
    )
      return;
    if (appCtx.pendingConflict) {
      (closeExitDialog(), showToast("请先处理保存冲突，再返回编辑器。", "error"));
      return;
    }
    if (!hasUnsavedChanges()) {
      leaveStudio();
      return;
    }
    studioExitMessageElement.textContent =
      navigator.onLine === false
        ? "当前网络不可用，修改还未保存。请恢复连接后重试，或继续编辑。"
        : "修改尚未全部保存，已留在当前页面。请重试保存，或继续编辑处理提示。";
  } catch (exitSaveFailure: any) {
    (exitSaveRequestToken === appCtx.exitSaveRequestId &&
      (studioExitMessageElement.textContent = "保存未完成，已留在当前页面。请重试或继续编辑。"),
      window.HomeOSLog?.error!(exitSaveFailure, {
        phase: "studio-exit-save",
      })!);
  } finally {
    exitSaveRequestToken === appCtx.exitSaveRequestId &&
      ((appCtx.isExitSaveInFlight = false), refreshExitDialogButtons());
  }
});
function planToScreen(planPointInput: any) {
  return {
    x: planPointInput.x * appCtx.planView.zoom + appCtx.planView.offsetX,
    y: planPointInput.y * appCtx.planView.zoom + appCtx.planView.offsetY,
  };
}
function screenToPlanPoint(screenPointInput: any) {
  const halfViewWidth = appCtx.planViewWidth / 2,
    halfViewHeight = appCtx.planViewHeight / 2,
    viewRotationRadians = (-appCtx.planView.rotation * Math.PI) / 180,
    cos = Math.cos(viewRotationRadians),
    sin = Math.sin(viewRotationRadians),
    centeredX = screenPointInput.x - halfViewWidth,
    centeredY = screenPointInput.y - halfViewHeight;
  return {
    x: halfViewWidth + centeredX * cos - centeredY * sin,
    y: halfViewHeight + centeredX * sin + centeredY * cos,
  };
}
function screenToPlan(screenPoint: any) {
  const nl2 = screenToPlanPoint(screenPoint);
  return {
    x: (nl2.x - appCtx.planView.offsetX) / appCtx.planView.zoom,
    y: (nl2.y - appCtx.planView.offsetY) / appCtx.planView.zoom,
  };
}
function eventToLocalPoint(pointerEventArg: any) {
  const boundingClientRect = planCanvasElement.getBoundingClientRect();
  return {
    x: pointerEventArg.clientX - boundingClientRect.left,
    y: pointerEventArg.clientY - boundingClientRect.top,
  };
}
function getCanvasSize() {
  return sceneContentBounds2(appCtx.studioState);
}
function resetView() {
  const ey2 = getCanvasSize(),
    viewPadding = clamp2(Math.min(appCtx.planViewWidth, appCtx.planViewHeight) * 0.045, 18, 34),
    availableWidth = Math.max(appCtx.planViewWidth - viewPadding * 2, 80),
    availableHeight = Math.max(appCtx.planViewHeight - viewPadding * 2, 80),
    isQuarterTurn = Math.abs(appCtx.planView.rotation / 90) % 2 === 1,
    height2 = isQuarterTurn ? ey2.height : ey2.width,
    width2 = isQuarterTurn ? ey2.width : ey2.height;
  ((appCtx.planView.zoom = clamp2(Math.min(availableWidth / height2, availableHeight / width2), 0.03, 8)),
    (appCtx.planView.offsetX = appCtx.planViewWidth / 2 - (ey2.minX + ey2.width / 2) * appCtx.planView.zoom),
    (appCtx.planView.offsetY = appCtx.planViewHeight / 2 - (ey2.minY + ey2.height / 2) * appCtx.planView.zoom),
    (appCtx.isAutoFitRequested = true),
    refreshStudioView());
}
function zoomByScale(
  zoomScale: any,
  zoomScreenPoint = {
    x: appCtx.planViewWidth / 2,
    y: appCtx.planViewHeight / 2,
  },
) {
  const pr2 = screenToPlan(zoomScreenPoint),
    nl3 = screenToPlanPoint(zoomScreenPoint);
  ((appCtx.planView.zoom = clamp2(appCtx.planView.zoom * zoomScale, 0.03, 12)),
    (appCtx.planView.offsetX = nl3.x - pr2.x * appCtx.planView.zoom),
    (appCtx.planView.offsetY = nl3.y - pr2.y * appCtx.planView.zoom),
    refreshStudioView());
}
function rotatePlanView() {
  ((appCtx.planView.rotation = (appCtx.planView.rotation + 90) % 360),
    (appCtx.studioState.settings.planViewRotation = appCtx.planView.rotation),
    resetView(),
    markDocumentDirty());
}
function resizePlanStage() {
  const planStageRect = planStageElement.getBoundingClientRect();
  ((appCtx.planViewWidth = Math.max(Math.round(planStageRect.width), 1)),
    (appCtx.planViewHeight = Math.max(Math.round(planStageRect.height), 1)));
  const min = Math.min(window.devicePixelRatio || 1, 2);
  ((planCanvasElement.width = Math.round(appCtx.planViewWidth * min)),
    (planCanvasElement.height = Math.round(appCtx.planViewHeight * min)),
    planCanvasRenderer.setTransform(min, 0, 0, min, 0, 0),
    appCtx.isAutoFitRequested ? refreshStudioView() : resetView());
}
function buildSnapIndex(snapTolerancePx: any) {
  const snapTolerance = Math.max(1, snapTolerancePx * 0.01),
    join = appCtx.studioState.walls
      .map(
        (snapWallRecord) =>
          snapWallRecord.id +
          "," +
          snapWallRecord.start.x +
          "," +
          snapWallRecord.start.y +
          "," +
          snapWallRecord.end.x +
          "," +
          snapWallRecord.end.y +
          "," +
          snapWallRecord.thickness +
          "," +
          (snapWallRecord.allowOpenEnd === true ? 1 : 0),
      )
      .join(";");
  let cachedSnapIndex = wallJoinCacheByWall.get(appCtx.studioState);
  return (
    (!cachedSnapIndex || cachedSnapIndex.signature !== snapTolerance + "|" + join) &&
      ((cachedSnapIndex = {
        signature: snapTolerance + "|" + join,
        tolerance: snapTolerance,
        floorPolygons: null as any,
        intersections: null as any,
        joinExtensions: null as any,
        unclosedEndpoints: null as any,
      }),
      wallJoinCacheByWall.set(appCtx.studioState, cachedSnapIndex)),
    cachedSnapIndex
  );
}
function closedWallLoops(wallLoopList: any) {
  const _l2 = buildSnapIndex(wallLoopList);
  return (
    (_l2.floorPolygons ||= closedWallFloorPolygons2(appCtx.studioState.walls, _l2.tolerance)),
    _l2.floorPolygons
  );
}
function computeWallIntersections(intersectWallList: any) {
  const _l3 = buildSnapIndex(intersectWallList);
  return ((_l3.intersections ||= wallIntersections2(appCtx.studioState.walls)), _l3.intersections);
}
function computeSurfaceExclusions(exclusionWallList: any) {
  const _l4 = buildSnapIndex(exclusionWallList);
  return ((_l4.joinExtensions ||= wallJoinExtensions2(appCtx.studioState.walls)), _l4.joinExtensions);
}
function computeWallPolygons(polygonWallList: any) {
  const _l5 = buildSnapIndex(polygonWallList);
  return (
    (_l5.unclosedEndpoints ||= unclosedWallEndpoints2(
      appCtx.studioState.walls,
      _l5.tolerance,
      closedWallLoops(polygonWallList),
    )),
    _l5.unclosedEndpoints
  );
}
function wallWindowSpan(windowRecord: any) {
  const owningWall = appCtx.studioState.walls.find((wallMatch) => wallMatch.id === windowRecord.wallId);
  if (!owningWall) return null;
  const wallDeltaX = owningWall.end.x - owningWall.start.x,
    wallDeltaY = owningWall.end.y - owningWall.start.y,
    hypot = Math.hypot(wallDeltaX, wallDeltaY);
  if (!hypot) return null;
  const windowClampT = clampWindowT2(owningWall, windowRecord, getPixelsPerMeter() || 1),
    windowCenterPoint = {
      x: owningWall.start.x + wallDeltaX * windowClampT,
      y: owningWall.start.y + wallDeltaY * windowClampT,
    },
    windowHalfWidth = Math.min((windowRecord.width * (getPixelsPerMeter() || 1)) / 2, hypot / 2),
    wallUnitVector = {
      x: wallDeltaX / hypot,
      y: wallDeltaY / hypot,
    };
  return {
    wall: owningWall,
    center: windowCenterPoint,
    start: {
      x: windowCenterPoint.x - wallUnitVector.x * windowHalfWidth,
      y: windowCenterPoint.y - wallUnitVector.y * windowHalfWidth,
    },
    end: {
      x: windowCenterPoint.x + wallUnitVector.x * windowHalfWidth,
      y: windowCenterPoint.y + wallUnitVector.y * windowHalfWidth,
    },
    unit: wallUnitVector,
  };
}
function drawRailing(railingRecord: any, railingView: PlanEditPreviewFlags = {}) {
  const xo2 = wallWindowSpan(railingRecord);
  if (!xo2) return;
  const railingSelected = createSelectionRef("railing", railingRecord.id),
    railingColor = railingView.preview
      ? "rgba(123, 220, 240, .72)"
      : railingSelected
        ? "#ffaf46"
        : "#8bd7e8",
    railingLineWidth = Math.max(
      10,
      xo2.wall.thickness * (getPixelsPerMeter() || 100) * appCtx.planView.zoom + 5,
    );
  (drawGuideSegment(xo2.start, xo2.end, {
    color: "rgba(7, 16, 21, .94)",
    width: railingLineWidth,
    cap: "butt",
  }),
    drawGuideSegment(xo2.start, xo2.end, {
      color: railingColor,
      width: railingSelected ? 5 : 3,
      cap: "butt",
    }),
    drawGuideSegment(xo2.start, xo2.end, {
      color: "rgba(224, 250, 255, .72)",
      width: 1,
      cap: "butt",
    }),
    drawPointMarker(xo2.start, railingColor, railingSelected ? 3 : 2),
    drawPointMarker(xo2.end, railingColor, railingSelected ? 3 : 2),
    railingSelected &&
      !railingView.preview &&
      drawLabelText(xo2.center, "玻璃栏杆 · " + railingRecord.width.toFixed(2) + " m", "#8bd7e8"));
}
/** 抬亮上限：抬到这个比例还没达标就认了，免得把颜色冲成纯白、丢掉档位辨识度。 */

/** WCAG 口径的相对亮度（sRGB → 线性）。 */

/** 平面图这扇门用哪块料代表（取「最占视线」的部件； */

/** 平面图门色：**与 3D 同一条取色链**（档位配方 → 主题键 → 逐门覆盖色）。 */
function rotateLocalPoint(originPoint: any, localOffsetX: any, localOffsetY: any) {
  const rotationRad = ((Number(originPoint.rotation) || 0) * Math.PI) / 180;
  return {
    x: originPoint.x + localOffsetX * Math.cos(rotationRad) - localOffsetY * Math.sin(rotationRad),
    y: originPoint.y + localOffsetX * Math.sin(rotationRad) + localOffsetY * Math.cos(rotationRad),
  };
}
function buildHandleGeometry(geometryItem: any) {
  const handlePixelsPerMeter = getPixelsPerMeter() || 100,
    handleFootprint = itemPlanFootprint2(geometryItem),
    halfItemWidth = (handleFootprint.width * handlePixelsPerMeter) / 2,
    halfItemDepth = (handleFootprint.depth * handlePixelsPerMeter) / 2;
  return {
    corners: [
      {
        x: -1,
        y: -1,
      },
      {
        x: 1,
        y: -1,
      },
      {
        x: 1,
        y: 1,
      },
      {
        x: -1,
        y: 1,
      },
    ].map((handleDirections) => ({
      ...handleDirections,
      point: rotateLocalPoint(
        geometryItem,
        handleDirections.x * halfItemWidth,
        handleDirections.y * halfItemDepth,
      ),
      opposite: rotateLocalPoint(
        geometryItem,
        -handleDirections.x * halfItemWidth,
        -handleDirections.y * halfItemDepth,
      ),
    })),
    rotationStem: rotateLocalPoint(geometryItem, 0, -halfItemDepth),
    rotationHandle: rotateLocalPoint(
      geometryItem,
      0,
      -halfItemDepth - 17 / Math.max(appCtx.planView.zoom, 0.01),
    ),
  };
}
function hitTestHandle(pointerPoint: any) {
  if (appCtx.activeToolName !== "select" || appCtx.selectedItem?.kind !== "item" || appCtx.selectedItems.length)
    return null;
  const at3 = getSelectedObject();
  if (!at3 || isCourtyardDrawing2(at3)) return null;
  const ky2 = buildHandleGeometry(at3),
    handleHitRadius = 9 / Math.max(appCtx.planView.zoom, 0.01);
  if (distance2(pointerPoint, ky2.rotationHandle) <= handleHitRadius)
    return {
      type: "rotate-item",
      item: at3,
      controls: ky2,
    };
  if (
    at3.type === "smart-socket-86" &&
    Math.min(at3.width, at3.depth) * getPixelsPerMeter() * appCtx.planView.zoom < 18
  )
    return null;
  const hitCorner = ky2.corners.find(
    (cornerCandidate) => distance2(pointerPoint, cornerCandidate.point) <= handleHitRadius,
  );
  return hitCorner
    ? {
        type: "resize-item",
        item: at3,
        controls: ky2,
        corner: hitCorner,
      }
    : null;
}
function boundsFromCorners(cornerA: any, cornerB: any) {
  return {
    minX: Math.min(cornerA.x, cornerB.x),
    minY: Math.min(cornerA.y, cornerB.y),
    maxX: Math.max(cornerA.x, cornerB.x),
    maxY: Math.max(cornerA.y, cornerB.y),
  };
}
function isPointInBounds(pointRef: any, boundsRef: any) {
  return (
    pointRef.x >= boundsRef.minX &&
    pointRef.x <= boundsRef.maxX &&
    pointRef.y >= boundsRef.minY &&
    pointRef.y <= boundsRef.maxY
  );
}
function boundsIntersectSegment(segStart: any, segEnd: any, boundsRect: any) {
  if (isPointInBounds(segStart, boundsRect) || isPointInBounds(segEnd, boundsRect)) return true;
  const boundsCorners = [
    {
      x: boundsRect.minX,
      y: boundsRect.minY,
    },
    {
      x: boundsRect.maxX,
      y: boundsRect.minY,
    },
    {
      x: boundsRect.maxX,
      y: boundsRect.maxY,
    },
    {
      x: boundsRect.minX,
      y: boundsRect.maxY,
    },
  ];
  for (let edgeIndex = 0; edgeIndex < boundsCorners.length; edgeIndex += 1)
    if (
      segmentIntersection2(
        segStart,
        segEnd,
        boundsCorners[edgeIndex],
        boundsCorners[(edgeIndex + 1) % boundsCorners.length],
      )
    )
      return true;
  return false;
}
function marqueeDelta(marqueeStartPoint: any, marqueeCurrentPoint: any) {
  const ry2 = boundsFromCorners(marqueeStartPoint, marqueeCurrentPoint),
    scenePixelsPerMeter = getPixelsPerMeter() || 100,
    intersectingWalls: any[] = [];
  if (!(appCtx.activeLibraryCategory === "light") && appCtx.activeLibraryCategory !== "courtyard") {
    for (const wallHit of appCtx.studioState.walls)
      boundsIntersectSegment(wallHit.start, wallHit.end, ry2) &&
        intersectingWalls.push({
          kind: "wall",
          id: wallHit.id,
        });
    for (const windowHit of appCtx.studioState.windows) {
      const xo4 = wallWindowSpan(windowHit);
      xo4 &&
        boundsIntersectSegment(xo4.start, xo4.end, ry2) &&
        intersectingWalls.push({
          kind: "window",
          id: windowHit.id,
        });
    }
    for (const doorHit of appCtx.studioState.doors) {
      const xo5 = wallWindowSpan(doorHit);
      xo5 &&
        boundsIntersectSegment(xo5.start, xo5.end, ry2) &&
        intersectingWalls.push({
          kind: "door",
          id: doorHit.id,
        });
    }
    for (const railingHit of appCtx.studioState.railings) {
      const xo6 = wallWindowSpan(railingHit);
      xo6 &&
        boundsIntersectSegment(xo6.start, xo6.end, ry2) &&
        intersectingWalls.push({
          kind: "railing",
          id: railingHit.id,
        });
    }
  }
  const marqueeCorners = [
    {
      x: ry2.minX,
      y: ry2.minY,
    },
    {
      x: ry2.maxX,
      y: ry2.minY,
    },
    {
      x: ry2.maxX,
      y: ry2.maxY,
    },
    {
      x: ry2.minX,
      y: ry2.maxY,
    },
  ];
  for (const itemBoundsRecord of appCtx.studioState.items) {
    if (!isPlanItemVisible(itemBoundsRecord)) continue;
    const itemRotationRad = (itemBoundsRecord.rotation * Math.PI) / 180,
      cos2 = Math.cos(itemRotationRad),
      sin2 = Math.sin(itemRotationRad),
      itemBoundsFootprint = itemPlanFootprint2(itemBoundsRecord),
      halfWidthPx = (itemBoundsFootprint.width * scenePixelsPerMeter) / 2,
      halfDepthPx = (itemBoundsFootprint.depth * scenePixelsPerMeter) / 2,
      itemCornerPoints = [
        [-halfWidthPx, -halfDepthPx],
        [halfWidthPx, -halfDepthPx],
        [halfWidthPx, halfDepthPx],
        [-halfWidthPx, halfDepthPx],
      ].map(([cornerLocalX, cornerLocalY]) => ({
        x: itemBoundsRecord.x + cornerLocalX * cos2 - cornerLocalY * sin2,
        y: itemBoundsRecord.y + cornerLocalX * sin2 + cornerLocalY * cos2,
      }));
    (isPointInBounds(itemBoundsRecord, ry2) ||
      itemCornerPoints.some((cornerPoint) => isPointInBounds(cornerPoint, ry2)) ||
      marqueeCorners.some((cornerTestPoint) =>
        pointInRotatedRectangle2(
          cornerTestPoint,
          itemWithPlanFootprint2(itemBoundsRecord),
          scenePixelsPerMeter,
        ),
      )) &&
      intersectingWalls.push({
        kind: "item",
        id: itemBoundsRecord.id,
      });
  }
  return intersectingWalls;
}
function updateMarqueeOverlay() {
  return !planCanvasElement.width || !planCanvasElement.height || !overlayCanvasRenderer
    ? false
    : (overlayCanvasElement.width !== planCanvasElement.width &&
        (overlayCanvasElement.width = planCanvasElement.width),
      overlayCanvasElement.height !== planCanvasElement.height &&
        (overlayCanvasElement.height = planCanvasElement.height),
      overlayCanvasRenderer.setTransform(1, 0, 0, 1, 0, 0),
      overlayCanvasRenderer.clearRect(
        0,
        0,
        overlayCanvasElement.width,
        overlayCanvasElement.height,
      ),
      overlayCanvasRenderer.drawImage(planCanvasElement, 0, 0),
      true);
}
function drawMarqueeOverlay({ offsetX: overlayDrawX = 0, offsetY: overlayDrawY = 0 } = {}) {
  if (
    !overlayCanvasElement.width ||
    !overlayCanvasElement.height ||
    overlayCanvasElement.width !== planCanvasElement.width ||
    overlayCanvasElement.height !== planCanvasElement.height
  )
    return false;
  const overlayScaleX = planCanvasElement.width / Math.max(appCtx.planViewWidth, 1),
    overlayScaleY = planCanvasElement.height / Math.max(appCtx.planViewHeight, 1);
  return (
    planCanvasRenderer.save(),
    planCanvasRenderer.setTransform(1, 0, 0, 1, 0, 0),
    (planCanvasRenderer.fillStyle = "#0d1319"),
    planCanvasRenderer.fillRect(0, 0, planCanvasElement.width, planCanvasElement.height),
    planCanvasRenderer.drawImage(
      overlayCanvasElement,
      Math.round(overlayDrawX * overlayScaleX),
      Math.round(overlayDrawY * overlayScaleY),
    ),
    planCanvasRenderer.restore(),
    true
  );
}
function renderPlanScene() {
  if (appCtx.marqueeBox?.type !== "marquee") return;
  const zr4 = planToScreen(appCtx.marqueeBox.start),
    zr5 = planToScreen(appCtx.marqueeBox.current),
    marqueeLeft = Math.min(zr4.x, zr5.x),
    marqueeTop = Math.min(zr4.y, zr5.y),
    abs = Math.abs(zr5.x - zr4.x),
    abs2 = Math.abs(zr5.y - zr4.y);
  (planCanvasRenderer.save(),
    planCanvasRenderer.translate(appCtx.planViewWidth / 2, appCtx.planViewHeight / 2),
    planCanvasRenderer.rotate((appCtx.planView.rotation * Math.PI) / 180),
    planCanvasRenderer.translate(-appCtx.planViewWidth / 2, -appCtx.planViewHeight / 2),
    (planCanvasRenderer.fillStyle = "rgba(255, 157, 46, .10)"),
    (planCanvasRenderer.strokeStyle = "rgba(255, 176, 74, .92)"),
    (planCanvasRenderer.lineWidth = 1),
    planCanvasRenderer.setLineDash([6, 4]),
    planCanvasRenderer.fillRect(marqueeLeft, marqueeTop, abs, abs2),
    planCanvasRenderer.strokeRect(
      marqueeLeft + 0.5,
      marqueeTop + 0.5,
      Math.max(abs - 1, 0),
      Math.max(abs2 - 1, 0),
    ),
    planCanvasRenderer.restore());
}
function refreshStudioView() {
  const isLightCategory = appCtx.activeLibraryCategory === "light";
  if (
    (planCanvasRenderer.clearRect(0, 0, appCtx.planViewWidth, appCtx.planViewHeight),
    (planCanvasRenderer.fillStyle = "#0d1319"),
    planCanvasRenderer.fillRect(0, 0, appCtx.planViewWidth, appCtx.planViewHeight),
    planCanvasRenderer.save(),
    planCanvasRenderer.translate(appCtx.planViewWidth / 2, appCtx.planViewHeight / 2),
    planCanvasRenderer.rotate((appCtx.planView.rotation * Math.PI) / 180),
    planCanvasRenderer.translate(-appCtx.planViewWidth / 2, -appCtx.planViewHeight / 2),
    appCtx.backgroundImageSource && appCtx.studioState.background && appCtx.studioState.settings.backgroundVisible)
  ) {
    const zr6 = planToScreen({
      x: 0,
      y: 0,
    });
    (planCanvasRenderer.save(),
      (planCanvasRenderer.globalAlpha = isLightCategory ? 0.3 : 0.54),
      planCanvasRenderer.drawImage(
        appCtx.backgroundImageSource,
        zr6.x,
        zr6.y,
        appCtx.studioState.background.width * appCtx.planView.zoom,
        appCtx.studioState.background.height * appCtx.planView.zoom,
      ),
      planCanvasRenderer.restore());
  }
  drawSelectionRect();
  const wallPixelsPerMeter = getPixelsPerMeter() || 100;
  if (appCtx.alignmentState) {
    (planCanvasRenderer.save(), (planCanvasRenderer.globalAlpha = 0.58));
    for (const wallHitRef of getActiveWalls())
      drawGuideSegment(wallHitRef.start, wallHitRef.end, {
        color: "#52cfe0",
        width: Math.max(2, wallHitRef.thickness * wallPixelsPerMeter * appCtx.planView.zoom),
        dash: [7, 5],
        cap: "square",
      });
    if ((planCanvasRenderer.restore(), appCtx.alignmentState.referencePoint)) {
      const ji2 = worldPointForFloor(
        appCtx.alignmentState.referencePoint,
        appCtx.alignmentState.referenceFloor,
        getActiveFloor(),
      );
      (drawPointMarker(ji2, "#ffb14f", 4.5), drawLabelText(ji2, "参照点", "#ffb14f"));
    }
  }
  (planCanvasRenderer.save(), isLightCategory && (planCanvasRenderer.globalAlpha = 0.48));
  for (const courtyardAreaItem of appCtx.studioState.items)
    courtyardAreaItem.type === "courtyard-area" && drawCourtyardArea(courtyardAreaItem);
  for (const hitWallRecord of appCtx.studioState.walls) {
    const ne4 = createSelectionRef("wall", hitWallRecord.id),
      wallLineWidth = Math.max(hitWallRecord.thickness * wallPixelsPerMeter * appCtx.planView.zoom, 4);
    (ne4 &&
      drawGuideSegment(hitWallRecord.start, hitWallRecord.end, {
        color: "rgba(255, 157, 46, .38)",
        width: wallLineWidth + 7,
        cap: "square",
      }),
      drawGuideSegment(hitWallRecord.start, hitWallRecord.end, {
        color: ne4 ? "#f1d7b9" : "#c7d0d7",
        width: wallLineWidth,
        cap: "square",
      }),
      drawGuideSegment(hitWallRecord.start, hitWallRecord.end, {
        color: "rgba(39, 51, 61, .82)",
        width: 1,
      }),
      (appCtx.activeToolName === "wall" || ne4) &&
        (drawPointMarker(hitWallRecord.start, ne4 ? "#ff9d2e" : "#6c7c88", 3.5),
        drawPointMarker(hitWallRecord.end, ne4 ? "#ff9d2e" : "#6c7c88", 3.5)),
      ne4 &&
        appCtx.selectedItems.length <= 1 &&
        drawLabelText(
          {
            x: (hitWallRecord.start.x + hitWallRecord.end.x) / 2,
            y: (hitWallRecord.start.y + hitWallRecord.end.y) / 2,
          },
          wallLengthMeters2(hitWallRecord, wallPixelsPerMeter).toFixed(2) + " m",
          "#ffb14f",
        ));
  }
  for (const windowHitRecord of appCtx.studioState.windows) {
    const xo7 = wallWindowSpan(windowHitRecord);
    if (!xo7) continue;
    const ne5 = createSelectionRef("window", windowHitRecord.id);
    if (
      (drawGuideSegment(xo7.start, xo7.end, {
        color: "rgba(7, 16, 21, .9)",
        width: Math.max(10, xo7.wall.thickness * wallPixelsPerMeter * appCtx.planView.zoom + 5),
        cap: "butt",
      }),
      drawGuideSegment(xo7.start, xo7.end, {
        color: ne5 ? "#ffaf46" : "#43d2e6",
        width: ne5 ? 5 : 3,
        cap: "butt",
      }),
      drawGuideSegment(xo7.start, xo7.end, {
        color: "rgba(224, 250, 255, .9)",
        width: 1,
        cap: "butt",
      }),
      windowHitRecord.hasDivider !== false && windowHitRecord.width > 1.2)
    ) {
      const windowNormalVector = {
          x: -xo7.unit.y,
          y: xo7.unit.x,
        },
        windowFrameOffset = Math.max(
          xo7.wall.thickness * wallPixelsPerMeter * appCtx.planView.zoom * 0.72,
          5 / appCtx.planView.zoom,
        );
      drawGuideSegment(
        {
          x: xo7.center.x - windowNormalVector.x * windowFrameOffset,
          y: xo7.center.y - windowNormalVector.y * windowFrameOffset,
        },
        {
          x: xo7.center.x + windowNormalVector.x * windowFrameOffset,
          y: xo7.center.y + windowNormalVector.y * windowFrameOffset,
        },
        {
          color: ne5 ? "#ffaf46" : "rgba(224, 250, 255, .9)",
          width: 1.5,
          cap: "butt",
        },
      );
    }
    ne5 &&
      appCtx.selectedItems.length <= 1 &&
      drawLabelText(xo7.center, windowHitRecord.width.toFixed(2) + " m", "#43d2e6");
  }
  for (const doorHitRecord of appCtx.studioState.doors) drawDoor(doorHitRecord);
  for (const railingHitRecord of appCtx.studioState.railings) drawRailing(railingHitRecord);
  if (appCtx.marqueeBox?.type === "draw-flooropening") {
    const { start: marqueeMinPoint, current: marqueeMaxPoint } = appCtx.marqueeBox;
    drawCourtyardArea({
      ...itemTypeCatalog.flooropening,
      type: "flooropening",
      id: "opening-preview",
      rotation: 0,
      x: (marqueeMinPoint.x + marqueeMaxPoint.x) / 2,
      y: (marqueeMinPoint.y + marqueeMaxPoint.y) / 2,
      width: Math.abs(marqueeMaxPoint.x - marqueeMinPoint.x) / wallPixelsPerMeter,
      depth: Math.abs(marqueeMaxPoint.y - marqueeMinPoint.y) / wallPixelsPerMeter,
    });
  }
  for (const nonLampItem of appCtx.studioState.items)
    !lampItemTypeSet.has(nonLampItem.type) &&
      nonLampItem.type !== "courtyard-area" &&
      drawCourtyardArea(nonLampItem);
  if (!appCtx.alignmentState) {
    const ty2 = computeWallPolygons(wallPixelsPerMeter);
    for (const openLoop of ty2)
      (drawPolygonPath(openLoop), ty2.length <= 3 && drawLabelText(openLoop, "未闭合", "#ff766e"));
  }
  if ((planCanvasRenderer.restore(), isLightCategory)) {
    for (const litLampItem of appCtx.studioState.items)
      lampItemTypeSet.has(litLampItem.type) && drawCourtyardArea(litLampItem);
  }
  const calibrationReference = appCtx.studioState.calibration?.reference;
  if (
    (calibrationReference &&
      appCtx.activeToolName === "scale" &&
      (drawGuideSegment(calibrationReference.start, calibrationReference.end, {
        color: "rgba(255, 157, 46, .72)",
        width: 2,
        dash: [7, 5],
      }),
      drawPointMarker(calibrationReference.start, "#ff9d2e", 3.5),
      drawPointMarker(calibrationReference.end, "#ff9d2e", 3.5),
      drawLabelText(
        {
          x: (calibrationReference.start.x + calibrationReference.end.x) / 2,
          y: (calibrationReference.start.y + calibrationReference.end.y) / 2,
        },
        calibrationReference.meters.toFixed(2) + " m 参考",
        "#ffad45",
      )),
    appCtx.previewEndPoint &&
      appCtx.hoverPoint &&
      (drawGuideSegment(appCtx.previewEndPoint, appCtx.hoverPoint, {
        color: "#ff9d2e",
        width: 2,
        dash: [7, 5],
      }),
      drawPointMarker(appCtx.previewEndPoint, "#ff9d2e"),
      drawPointMarker(appCtx.hoverPoint, "#ff9d2e")),
    appCtx.segmentStartPoint && appCtx.snapHit)
  ) {
    const eg2 = formatMeasurement(appCtx.snapHit);
    (drawGuideSegment(appCtx.segmentStartPoint, appCtx.snapHit.point, {
      color: "#ff9d2e",
      width: 2,
      dash: [7, 5],
    }),
      drawPointMarker(appCtx.segmentStartPoint, "#ff9d2e"),
      drawPointMarker(
        appCtx.snapHit.point,
        eg2 ? "#76cfa1" : appCtx.snapHit.kind ? "#43d2e6" : "#ff9d2e",
        eg2 ? 5 : 3.5,
      ));
    const segmentLengthMeters = distance2(appCtx.segmentStartPoint, appCtx.snapHit.point) / wallPixelsPerMeter;
    (drawLabelText(
      {
        x: (appCtx.segmentStartPoint.x + appCtx.snapHit.point.x) / 2,
        y: (appCtx.segmentStartPoint.y + appCtx.snapHit.point.y) / 2,
      },
      segmentLengthMeters.toFixed(2) + " m",
      "#ffb04a",
    ),
      eg2 && drawLabelText(appCtx.snapHit.point, "点击闭合空间", "#76cfa1"));
  } else
    appCtx.snapHit?.kind &&
      ["wall", "scale"].includes(appCtx.activeToolName) &&
      (drawPointMarker(appCtx.snapHit.point, "#43d2e6"),
      drawLabelText(appCtx.snapHit.point, appCtx.snapHit.label, "#43d2e6"));
  if (appCtx.activeToolName === "window" && appCtx.windowPlacement) {
    const windowPlacementRecord = {
        wallId: appCtx.windowPlacement.wall.id,
        t: appCtx.windowPlacement.t,
        width: 1.4,
      },
      xo8 = wallWindowSpan(windowPlacementRecord);
    xo8 &&
      drawGuideSegment(xo8.start, xo8.end, {
        color: "rgba(67, 210, 230, .75)",
        width: 5,
        dash: [5, 4],
        cap: "butt",
      });
  }
  if (appCtx.activeToolName === "door" && appCtx.doorPlacement) {
    const solid = doorTypeCatalog[activeDoorType] || doorTypeCatalog.solid;
    drawDoor(
      {
        wallId: appCtx.doorPlacement.wall.id,
        t: appCtx.doorPlacement.t,
        width: solid.width,
        height: solid.height,
        doorType: activeDoorType,
        hinge: "left",
        swing: 1,
      },
      {
        preview: true,
      },
    );
  }
  (appCtx.activeToolName === "railing" &&
    appCtx.railingPlacement &&
    drawRailing(
      {
        wallId: appCtx.railingPlacement.wall.id,
        t: appCtx.railingPlacement.t,
        width: 2,
        height: 1.1,
      },
      {
        preview: true,
      },
    ),
    planCanvasRenderer.restore(),
    renderPlanScene(),
    appCtx.activeToolName === "courtyard-gate" &&
      gardenGateSnapCandidate &&
      (planCanvasRenderer.save(),
      (planCanvasRenderer.globalAlpha = 0.65),
      drawCourtyardArea(gardenGateSnapCandidate),
      planCanvasRenderer.restore(),
      drawPointMarker(gardenGateSnapCandidate, "#43d2e6"),
      drawLabelText(gardenGateSnapCandidate, "点击放置庭院门", "#43d2e6")),
    planPainter?.draw(planCanvasRenderer),
    (zoomValueElement.textContent = Math.round(appCtx.planView.zoom * 100) + "%"));
}
function getSelectedObject() {
  if (!appCtx.selectedItem) return null;
  const selectedObjectRecord = (
    ({
      wall: appCtx.studioState.walls,
      window: appCtx.studioState.windows,
      door: appCtx.studioState.doors,
      railing: appCtx.studioState.railings,
      item: appCtx.studioState.items,
    } as any)[appCtx.selectedItem.kind] || []
  ).find((selectedMatch: any) => selectedMatch.id === appCtx.selectedItem.id);
  return (selectedObjectRecord || (appCtx.selectedItem = null), selectedObjectRecord || null);
}
function hitTestPlanItem(planHitPoint: any) {
  const itemPixelsPerMeter = getPixelsPerMeter() || 100,
    isLightCategoryHit = appCtx.activeLibraryCategory === "light";
  for (const hitCandidateItem of [...appCtx.studioState.items].reverse()) {
    if (!isPlanItemVisible(hitCandidateItem) || hitCandidateItem.type === "courtyard-area")
      continue;
    const hitTestRect =
      hitCandidateItem.type === "smart-socket-86"
        ? {
            ...hitCandidateItem,
            width: Math.max(hitCandidateItem.width, 12 / (itemPixelsPerMeter * appCtx.planView.zoom)),
            depth: Math.max(hitCandidateItem.depth, 12 / (itemPixelsPerMeter * appCtx.planView.zoom)),
          }
        : itemWithPlanFootprint2(hitCandidateItem);
    if (
      isCourtyardDrawing2(hitCandidateItem)
        ? hitDrawing2(hitCandidateItem, planHitPoint, itemPixelsPerMeter, 9 / appCtx.planView.zoom)
        : pointInRotatedRectangle2(planHitPoint, hitTestRect, itemPixelsPerMeter)
    )
      return {
        kind: "item",
        id: hitCandidateItem.id,
      };
  }
  if (appCtx.activeLibraryCategory === "courtyard") {
    for (const surfaceCandidate of [...appCtx.studioState.items].reverse())
      if (
        surfaceCandidate.type === "courtyard-area" &&
        hitDrawing2(
          surfaceCandidate,
          planHitPoint,
          itemPixelsPerMeter,
          9 / appCtx.planView.zoom,
          surfaceExclusions2(
            surfaceCandidate,
            appCtx.studioState.items,
            buildingFootprints2(
              appCtx.studioState.walls,
              closedWallLoops(itemPixelsPerMeter),
              itemPixelsPerMeter,
            ),
            itemPixelsPerMeter,
          ),
        )
      )
        return {
          kind: "item",
          id: surfaceCandidate.id,
        };
    return null;
  }
  if (isLightCategoryHit) return null;
  for (const windowSurfaceRecord of [...appCtx.studioState.windows].reverse()) {
    const xo9 = wallWindowSpan(windowSurfaceRecord);
    if (
      xo9 &&
      projectPointToSegment2(planHitPoint, xo9.start, xo9.end).distance <= 10 / appCtx.planView.zoom
    )
      return {
        kind: "window",
        id: windowSurfaceRecord.id,
      };
  }
  for (const doorSurfaceRecord of [...appCtx.studioState.doors].reverse()) {
    const doorSpan = wallWindowSpan(doorSurfaceRecord);
    if (
      doorSpan &&
      projectPointToSegment2(planHitPoint, doorSpan.start, doorSpan.end).distance <=
        12 / appCtx.planView.zoom
    )
      return {
        kind: "door",
        id: doorSurfaceRecord.id,
      };
  }
  for (const railingSurfaceRecord of [...appCtx.studioState.railings].reverse()) {
    const railingSpan = wallWindowSpan(railingSurfaceRecord);
    if (
      railingSpan &&
      projectPointToSegment2(planHitPoint, railingSpan.start, railingSpan.end).distance <=
        12 / appCtx.planView.zoom
    )
      return {
        kind: "railing",
        id: railingSurfaceRecord.id,
      };
  }
  for (const wallSurfaceRecord of [...appCtx.studioState.walls].reverse()) {
    const wallHitPadding = Math.max(
      (wallSurfaceRecord.thickness * itemPixelsPerMeter) / 2,
      8 / appCtx.planView.zoom,
    );
    if (
      projectPointToSegment2(planHitPoint, wallSurfaceRecord.start, wallSurfaceRecord.end)
        .distance <= wallHitPadding
    )
      return {
        kind: "wall",
        id: wallSurfaceRecord.id,
      };
  }
  for (const surfaceExclusionItem of [...appCtx.studioState.items].reverse())
    if (
      surfaceExclusionItem.type === "courtyard-area" &&
      hitDrawing2(
        surfaceExclusionItem,
        planHitPoint,
        itemPixelsPerMeter,
        9 / appCtx.planView.zoom,
        surfaceExclusions2(
          surfaceExclusionItem,
          appCtx.studioState.items,
          buildingFootprints2(
            appCtx.studioState.walls,
            closedWallLoops(itemPixelsPerMeter),
            itemPixelsPerMeter,
          ),
          itemPixelsPerMeter,
        ),
      )
    )
      return {
        kind: "item",
        id: surfaceExclusionItem.id,
      };
  return null;
}
function refreshStepChecklist() {
  const stepCompletionFlags = {
      background: !!appCtx.studioState.background,
      scale: !!appCtx.studioState.calibration,
      walls: appCtx.studioState.walls.length > 0 || appCtx.studioState.items.some(isCourtyardDrawing2),
      items: appCtx.studioState.items.some(
        (nonLampCheckItem) => !lampItemTypeSet.has(nonLampCheckItem.type),
      ),
      lights: appCtx.studioState.items.some((lampCheckItem) => lampItemTypeSet.has(lampCheckItem.type)),
      export: appCtx.isExporting,
    },
    activeStepName =
      ["background", "scale", "walls", "items", "lights", "export"].find(
        (stepKey) => !(stepCompletionFlags as any)[stepKey],
      ) || "export";
  for (const stepElement of document.querySelectorAll<StudioControlElement>("[data-step]"))
    (stepElement.classList.toggle("complete", (stepCompletionFlags as any)[stepElement.dataset.step!]),
      stepElement.classList.toggle("active", stepElement.dataset.step === activeStepName));
  patchStudioFacadeState({ workflowStep: activeStepName });
  // 同步 Vue 工作流按钮完成态
  for (const stepButton of document.querySelectorAll<HTMLElement>(".sc-workflow__step[data-step]")) {
    const stepId = stepButton.getAttribute("data-step") || "";
    stepButton.classList.toggle("is-complete", !!(stepCompletionFlags as any)[stepId]);
    stepButton.classList.toggle("is-active", stepId === activeStepName);
  }
}
function getPanelRatioLimits() {
  const detailsPanelRect = detailsPanelElement.getBoundingClientRect(),
    studioShellRect = studioShellElement.getBoundingClientRect(),
    panelMaxHeight = detailsPanelRect.height || Math.max(window.innerHeight - 90, 340),
    shellMaxWidth = studioShellRect.width || Math.max(window.innerWidth - 20, 860),
    resizerHeight = detailsResizerElement.parentElement?.getBoundingClientRect().height || 14,
    libraryPanelWidth =
      studioShellElement.querySelector(".library-panel")?.getBoundingClientRect().width || 168;
  return {
    minimumHeightRatio: clamp2(320 / panelMaxHeight, 0.08, 0.5),
    maximumHeightRatio: clamp2((panelMaxHeight - resizerHeight - 170) / panelMaxHeight, 0.5, 0.94),
    minimumWidthRatio: clamp2(360 / shellMaxWidth, 0.08, 0.45),
    maximumWidthRatio: clamp2(
      (shellMaxWidth - libraryPanelWidth - 20 - 320) / shellMaxWidth,
      0.45,
      0.86,
    ),
  };
}
function applyPanelRatios() {
  const yl2 = getPanelRatioLimits(),
    previewPanelRatio = clamp2(
      finite2(appCtx.studioState.settings?.previewPanelRatio, 0.52),
      yl2.minimumHeightRatio,
      yl2.maximumHeightRatio,
    );
  ((appCtx.studioState.settings.previewPanelRatio = previewPanelRatio),
    detailsPanelElement.style.setProperty(
      "--preview-panel-height",
      (previewPanelRatio * 100).toFixed(2) + "%",
    ),
    detailsResizerElement.setAttribute(
      "aria-valuemin",
      String(Math.round(yl2.minimumHeightRatio * 100)),
    ),
    detailsResizerElement.setAttribute(
      "aria-valuemax",
      String(Math.round(yl2.maximumHeightRatio * 100)),
    ),
    detailsResizerElement.setAttribute(
      "aria-valuenow",
      String(Math.round(previewPanelRatio * 100)),
    ));
}
function applyDetailsRatio() {
  const yl3 = getPanelRatioLimits(),
    detailsPanelWidthRatio = clamp2(
      finite2(appCtx.studioState.settings?.detailsPanelWidthRatio, 0.29),
      yl3.minimumWidthRatio,
      yl3.maximumWidthRatio,
    );
  ((appCtx.studioState.settings.detailsPanelWidthRatio = detailsPanelWidthRatio),
    studioShellElement.style.setProperty(
      "--details-panel-width",
      (detailsPanelWidthRatio * 100).toFixed(2) + "%",
    ));
}
function isSnapEnabled() {
  return appCtx.studioState.settings.snapEnabled !== false && !appCtx.isSnapTemporarilyOff;
}
function setSnapSettingsOpen(settingsOpen: any) {
  ((snapSettingsPanel.hidden = !settingsOpen),
    snapSettingsToggleButton.setAttribute("aria-expanded", String(settingsOpen)));
}
function syncSnapControls() {
  const isSnapOn = appCtx.studioState.settings.snapEnabled !== false;
  (snapToggleButton.classList.toggle("active", isSnapOn),
    snapToggleButton.setAttribute("aria-pressed", String(isSnapOn)),
    (snapToggleStateElement.textContent = isSnapOn ? "开" : "关"));
  for (const snapSettingInput of snapSettingControls)
    snapSettingInput.checked = (appCtx.studioState.settings as any)[snapSettingInput.dataset.snapSetting!] !== false;
  (syncControlValue2(
    snapToleranceInput,
    clamp2(Math.round(finite2(appCtx.studioState.settings.snapTolerance, 13)), 6, 24),
  ),
    /* `hos-range-ui` 的左侧金色段靠 `--progress-pct` 裁切：每次回填数值都要同步一次，
       否则改档位后条子还停在旧进度。 */
    syncHtmlRangeProgress2(snapToleranceInput),
    (snapToleranceValueElement.textContent = snapToleranceInput.value + " px"),
    appCtx.activeSnapTarget ||
      (snapIndicatorElement.textContent = isSnapOn ? "吸附：开启" : "吸附：关闭"));
}
function applySnapTolerance(resizeMoveEvent: any) {
  if (!appCtx.dragStart) return;
  const draggedDetailsPanelRect = detailsPanelElement.getBoundingClientRect(),
    draggedStudioShellRect = studioShellElement.getBoundingClientRect();
  if (draggedDetailsPanelRect.height <= 0 || draggedStudioShellRect.width <= 0) return;
  const yl4 = getPanelRatioLimits(),
    dragDeltaX = resizeMoveEvent.clientX - appCtx.dragStart.startX,
    dragDeltaY = resizeMoveEvent.clientY - appCtx.dragStart.startY;
  if (Math.hypot(dragDeltaX, dragDeltaY) < 2) return;
  detailsResizerElement.dataset.resizeAxis = "both";
  const heightRatioDelta = dragDeltaY / draggedDetailsPanelRect.height,
    widthRatioDelta = dragDeltaX / draggedStudioShellRect.width;
  ((appCtx.studioState.settings.previewPanelRatio = clamp2(
    appCtx.dragStart.startPreviewRatio + heightRatioDelta,
    yl4.minimumHeightRatio,
    yl4.maximumHeightRatio,
  )),
    (appCtx.studioState.settings.detailsPanelWidthRatio = clamp2(
      appCtx.dragStart.startWidthRatio - widthRatioDelta,
      yl4.minimumWidthRatio,
      yl4.maximumWidthRatio,
    )),
    applyPanelRatios(),
    applyDetailsRatio());
}
function refreshBackground() {
  const planTitleText = appCtx.studioState.items.some(
    (drawingItem) => isCourtyardDrawing2(drawingItem) || drawingItem.type.startsWith("garden-"),
  )
    ? appCtx.studioState.walls.length
      ? "户型与庭院绘制"
      : "庭院绘制"
    : "户型图绘制";
  ((projectNameElement.textContent = planTitleText),
    (document.title = planTitleText),
    syncSnapControls(),
    syncGlobalControls(),
    (toggleBackgroundButton.disabled = !appCtx.studioState.background),
    (toggleBackgroundButton.textContent = appCtx.studioState.settings.backgroundVisible ? "隐藏" : "显示"),
    (removePlanButton.disabled = !appCtx.studioState.background),
    syncControlValue2(globalWallHeightInput, appCtx.studioState.settings.wallHeight.toFixed(2)),
    syncControlValue2(globalWallThicknessInput, appCtx.studioState.settings.wallThickness.toFixed(2)),
    syncControlValue2(globalWallOpacityInput, Math.round(appCtx.studioState.settings.wallOpacity * 100)),
    (toggleFloorEdgeButton.textContent =
      appCtx.studioState.settings.floorEdgeVisible === false ? "隐藏" : "显示"),
    toggleFloorEdgeButton.setAttribute(
      "aria-pressed",
      String(appCtx.studioState.settings.floorEdgeVisible !== false),
    ),
    (canvasEmptyElement.hidden = !!(
      appCtx.studioState.background ||
      appCtx.studioState.walls.length ||
      appCtx.studioState.items.length
    )),
    (sceneCountsElement.textContent =
      appCtx.studioState.walls.length +
      " 墙 · " +
      appCtx.studioState.windows.length +
      " 窗 · " +
      appCtx.studioState.doors.length +
      " 门 · " +
      appCtx.studioState.railings.length +
      " 栏杆 · " +
      appCtx.studioState.items.length +
      " 物件"),
    syncLightGroupList(),
    applyPanelRatios(),
    applyDetailsRatio(),
    setCameraMode(getCameraMode()),
    setCameraView(getCameraView()),
    refreshPreviewSync(),
    refreshFloorControls(),
    refreshBaseLighting(),
    refreshStepChecklist());
}
function refreshStudioUiInner(shouldClearActiveElement = false) {
  const setControlValue = (controlElement: any, controlValue: any) =>
      syncControlValue2(
        controlElement,
        controlValue,
        shouldClearActiveElement ? null : document.activeElement,
      ),
    at4 = getSelectedObject(),
    selectionCount = appCtx.selectedItems.length;
  if (
    (planPainter?.refresh(at4),
    (inspectorEmptyElement.hidden = !!at4),
    (selectionInspectorElement.hidden = !at4),
    (deleteSelectionButton.disabled = !at4 && !selectionCount),
    selectionCount)
  ) {
    ((inspectorEmptyElement.hidden = false),
      (selectionInspectorElement.hidden = true),
      (inspectorEmptyElement.querySelector("strong").textContent =
        "已框选 " + selectionCount + " 个对象"),
      (inspectorEmptyElement.querySelector("p").textContent =
        "可以直接批量删除；单击一个对象可继续精确编辑属性。"));
    return;
  }
  if (
    ((inspectorEmptyElement.querySelector("strong").textContent = "选择画布中的对象"),
    (inspectorEmptyElement.querySelector("p").textContent =
      "选中墙体、窗户、门或家具后，可在这里精确调整。"),
    (selectElement("#courtyard-gate-style-field").hidden = !isCourtyardGate2(at4)),
    isCourtyardGate2(at4) &&
      ((selectElement("#courtyard-gate-style").value = at4.type),
      syncStudioSelect2(selectElement("#courtyard-gate-style"))),
    !(!at4 || !appCtx.selectedItem))
  ) {
    if (
      ((lightPreviewNoteElement.hidden = true),
      selectionHeadingElement.classList.remove("light-selected"),
      (wallFieldsElement.hidden = appCtx.selectedItem.kind !== "wall"),
      (windowFieldsElement.hidden = appCtx.selectedItem.kind !== "window"),
      (doorFieldsElement.hidden = appCtx.selectedItem.kind !== "door"),
      (railingFieldsElement.hidden = appCtx.selectedItem.kind !== "railing"),
      (itemFieldsElement.hidden = appCtx.selectedItem.kind !== "item"),
      (selectionIdElement.hidden = appCtx.selectedItem.kind === "item"),
      (selectionIdElement.textContent = selectionIdElement.hidden ? "" : at4.id),
      isCourtyardDrawing2(at4))
    ) {
      ((itemFieldsElement.hidden = true),
        (selectElement("#selection-title").textContent = (itemTypeCatalog as any)[at4.type].name));
      return;
    }


    appCtx.selectedItem.kind === "door"
      ? renderDoorMaterialPanel(at4)
      : renderMaterialSlotPanel(at4);
    if (appCtx.selectedItem.kind === "wall") {
      ((selectElement("#selection-title").textContent = "墙体"),
        setControlValue(
          selectElement("#wall-length"),
          wallLengthMeters2(at4, getPixelsPerMeter() || 1).toFixed(2) + " m",
        ),
        setControlValue(selectElement("#wall-height"), at4.height.toFixed(2)),
        setControlValue(selectElement("#wall-thickness"), at4.thickness.toFixed(2)));
      const customWallOpacity =
        at4.opacity === null || at4.opacity === undefined
          ? null
          : clamp2(finite2(at4.opacity, appCtx.studioState.settings.wallOpacity), 0, 1);
      ((selectElement("#wall-opacity-mode").value =
        customWallOpacity === null ? "global" : "custom"),
        setControlValue(
          selectElement("#wall-opacity"),
          Math.round((customWallOpacity ?? appCtx.studioState.settings.wallOpacity) * 100),
        ),
        (selectElement("#wall-opacity").disabled = customWallOpacity === null),
        syncStudioSelect2(selectElement("#wall-opacity-mode")),
        (selectElement("#wall-open-end-mode").value =
          at4.allowOpenEnd === true ? "allowed" : "auto"),
        syncStudioSelect2(selectElement("#wall-open-end-mode")));
    } else {
      if (appCtx.selectedItem.kind === "window")
        ((selectElement("#selection-title").textContent = "窗户"),
          setControlValue(selectElement("#window-width"), at4.width.toFixed(2)),
          setControlValue(selectElement("#window-height"), at4.height.toFixed(2)),
          setControlValue(selectElement("#window-sill"), at4.sill.toFixed(2)),
          (selectElement("#window-divider").value = at4.hasDivider === false ? "without" : "with"),
          syncStudioSelect2(selectElement("#window-divider")),
          setControlValue(selectElement("#window-position"), Math.round(at4.t * 100) + "%"));
      else {
        if (appCtx.selectedItem.kind === "door")
          ((selectElement("#selection-title").textContent =
            ({
              solid: "普通平开门",
              double: "双开门",
              entry: "入户门（常闭）",
              glass: "玻璃平开门",
              "sliding-glass": "玻璃推拉门（常开）",
              "roller-shutter": "卷帘门",
              "frame-only": "仅门框",
            } as any)[at4.doorType] || "普通平开门"),
            (selectElement("#door-type").value = at4.doorType || "solid"),
            syncStudioSelect2(selectElement("#door-type")),
            setControlValue(selectElement("#door-width"), at4.width.toFixed(2)),
            setControlValue(selectElement("#door-height"), at4.height.toFixed(2)),
            setControlValue(selectElement("#door-position"), Math.round(at4.t * 100) + "%"),
            (selectElement(".door-actions").hidden = at4.doorType === "frame-only"),
            (selectElement("#door-hinge").hidden = [
              "double",
              "roller-shutter",
              "frame-only",
            ].includes(at4.doorType)),
            (selectElement("#door-swing").hidden = ["sliding-glass", "frame-only"].includes(
              at4.doorType,
            )),
            (selectElement("#door-hinge").textContent =
              at4.doorType === "sliding-glass" ? "左右推拉" : "左右换边"),
            (selectElement("#door-swing").textContent =
              at4.doorType === "double"
                ? "双扇内外开"
                : at4.doorType === "roller-shutter"
                  ? "内外侧"
                  : "内外翻转"));
        else {
          if (appCtx.selectedItem.kind === "railing")
            ((selectElement("#selection-title").textContent = "玻璃栏杆"),
              setControlValue(selectElement("#railing-width"), at4.width.toFixed(2)),
              setControlValue(selectElement("#railing-height"), at4.height.toFixed(2)),
              setControlValue(selectElement("#railing-position"), Math.round(at4.t * 100) + "%"));
          else {
            const itemTypeDefinition = (itemTypeCatalog as any)[at4.type],
              isPlanLabel = at4.type === "planlabel",
              isLightItem = lampItemTypeSet.has(at4.type);
            if (
              ((selectElement("#selection-title").textContent = itemTypeDefinition?.name || "物件"),
              (lightPreviewNoteElement.hidden = !isLightItem),
              selectionHeadingElement.classList.toggle("light-selected", isLightItem),
              (labelTextFieldsElement.hidden = !isPlanLabel),
              (lightFieldsElement.hidden = !isLightItem),
              (curtainPositionFieldElement.hidden = at4.type !== "curtain"),
              (selectElement("#fridge-style-fields").hidden = at4.type !== "fridge"),
              at4.type === "fridge")
            ) {
              for (const fridgeStyleInput of document.querySelectorAll<StudioControlElement>(
                'input[name="fridge-style"]',
              ))
                fridgeStyleInput.checked =
                  fridgeStyleInput.value === (at4.fridgeStyle === "double" ? "double" : "standard");
            }
            if (
              ((selectElement("#curtain-track-fields").hidden = at4.type !== "curtain"),
              (selectElement("#airer-model-fields").hidden = at4.type !== "airer"),
              at4.type === "airer")
            ) {
              const airerDimensions = airerDimensions2(at4);
              (setControlValue(
                selectElement("#airer-style"),
                airerDimensions.airerStyle === "single" ? "single" : "double",
              ),
                setControlValue(
                  selectElement("#airer-extension"),
                  String(airerDimensions.airerExtension),
                ),
                setControlValue(
                  selectElement("#airer-preview"),
                  String(airerDimensions.airerPreview),
                ));
            }
            if (
              ((selectElement("#item-elevation").title =
                at4.type === "airer" ? "顶部机身安装面距本层地面的高度" : ""),
              (selectElement("#fan-model-fields").hidden = at4.type !== "fan"),
              at4.type === "fan")
            ) {
              const fanDimensions = fanDimensions2(at4);
              (setControlValue(
                selectElement("#fan-model-scale"),
                String(Math.round(fanDimensions.fanScale * 100)),
              ),
                setControlValue(
                  selectElement("#fan-model-height"),
                  fanDimensions.fanHeight.toFixed(2),
                ));
            }
            for (const itemDimensionInput of [
              selectElement("#item-width"),
              selectElement("#item-height"),
              selectElement("#item-depth"),
            ])
              itemDimensionInput.readOnly =
                at4.type === "fan" ||
                (at4.type === "airer" && itemDimensionInput.id === "item-height");
            ((itemHeightFieldElement.hidden =
              isPlanLabel || isLightItem || at4.type === "flooropening"),
              (itemElevationFieldElement.hidden = isPlanLabel || at4.type === "flooropening"),
              (itemRotationFieldElement.hidden = at4.type === "ceilinglight"),
              (itemRotationActionsElement.hidden = at4.type === "ceilinglight"),
              (selectElement("#item-depth").readOnly =
                at4.type === "fan" ||
                (at4.type === "curtain" &&
                  normalizeCurtainTrack2(at4).curtainTrack !== "straight")));
            const includes = ["camera", "presence"].includes(at4.type);
            ((itemVerticalRotationFieldElement.hidden = !(isLightItem || includes)),
              (itemVerticalRotationFieldElement.title = includes
                ? "0° 正装，±90° 侧装，180° 倒装；离地高度为底座安装点高度"
                : ""),
              (itemStripRollFieldElement.hidden = at4.type !== "striplight"),
              (itemStripOrientationHeadingElement.hidden = at4.type !== "striplight"),
              (itemLightSourceVisibilityFieldElement.hidden = at4.type !== "striplight"),
              (pillarShapeFieldElement.hidden = at4.type !== "pillar"),
              (pillarAxisFieldElement.hidden = at4.type !== "pillar"),
              (stripAxisFieldElement.hidden = at4.type !== "striplight"),
              (roundTableTurntableFieldElement.hidden = !roundTableTypeSet.has(at4.type)),
              (selectElement("#sofa-chaise-side-field").hidden = at4.type !== "sofa-l"),
              (selectElement("#mural-style-field").hidden = at4.type !== "mural"),
              (selectElement("#featurewall-style-field").hidden = at4.type !== "featurewall"),
              at4.type === "sofa-l" &&
                ((selectElement("#sofa-chaise-side").value =
                  at4.sofaChaiseSide === "left" ? "left" : "right"),
                syncStudioSelect2(selectElement("#sofa-chaise-side"))),
              (stairDirectionFieldElement.hidden = !openStairTypeSet.has(at4.type)),
              (tvMountStyleFieldElement.hidden = at4.type !== "tv"),
              (shoeCabinetActionsElement.hidden = at4.type !== "shoecabinet"),
              shoeCabinetMirrorButton.setAttribute(
                "aria-pressed",
                at4.shoeCabinetMirrored === true ? "true" : "false",
              ),
              (selectElement("#item-rotation-label").textContent =
                at4.type === "striplight"
                  ? "平面旋转（°）"
                  : isLightItem
                    ? "平面方向（°）"
                    : "旋转角度（°）"),
              (selectElement("#item-rotation").min = at4.type === "striplight" ? "0" : "-360"),
              (selectElement("#item-rotation").max = "360"),
              (itemVerticalRotationLabelElement.textContent =
                at4.type === "striplight"
                  ? "安装倾斜（°）"
                  : includes
                    ? "安装翻转／侧装（°）"
                    : "出光角度（°）"),
              (selectElement("#item-vertical-rotation").min =
                at4.type === "striplight" ? "0" : includes ? "-180" : "-90"),
              (selectElement("#item-vertical-rotation").max =
                at4.type === "striplight" ? "360" : includes ? "180" : "90"));
            for (const lightControlElement of applyLightPropertyControls)
              lightControlElement.hidden = !isLightItem;
            if (
              ((itemWidthLabelElement.textContent =
                at4.type === "flooropening"
                  ? "洞口宽（m）"
                  : at4.type === "striplight"
                    ? "发光长度（m）"
                    : at4.type === "pillar"
                      ? "长（m）"
                      : "宽（m）"),
              at4.type === "curtain" && (itemWidthLabelElement.textContent = "主边长度（m）"),
              (itemDepthLabelElement.textContent =
                at4.type === "flooropening"
                  ? "洞口长（m）"
                  : at4.type === "striplight"
                    ? "发光宽度（m）"
                    : isPlanLabel
                      ? "铭牌高（m）"
                      : at4.type === "pillar"
                        ? "宽（m）"
                        : "深（m）"),
              isPlanLabel &&
                (setControlValue(selectElement("#label-title"), at4.title || "家庭总览"),
                setControlValue(
                  selectElement("#label-title-spacing"),
                  Math.round(clamp2(finite2(at4.titleSpacing, 1.05), 0, 1.8) * 100),
                ),
                setControlValue(selectElement("#label-subtitle"), at4.subtitle || "HOME PLAN"),
                setControlValue(
                  selectElement("#label-subtitle-spacing"),
                  Math.round(clamp2(finite2(at4.subtitleSpacing, 0.08), 0, 0.6) * 100),
                ),
                setControlValue(
                  selectElement("#label-line-length"),
                  Math.round(clamp2(finite2(at4.lineLength, 0.86), 0.3, 1) * 100),
                ),
                setControlValue(
                  selectElement("#label-color"),
                  normalizePlanLabelColor(at4.labelColor),
                )),
              isLightItem)
            ) {
              const downlight2 = (lightPresetCatalog as any)[at4.type] || lightPresetCatalog.downlight;
              ((appCtx.activeLightGroupId = resolveLightGroup(at4)?.id || getLightGroups().id),
                syncLightGroupList(),
                syncLightGroupSelect(at4),
                setControlValue(
                  selectElement("#light-temperature"),
                  Math.round(
                    clamp2(finite2(at4.lightTemperature, downlight2.temperature), 2200, 6500),
                  ),
                ),
                setControlValue(
                  selectElement("#light-brightness"),
                  Math.round(clamp2(finite2(at4.lightBrightness, downlight2.brightness), 0, 100)),
                ),
                setControlValue(
                  selectElement("#light-range"),
                  clamp2(finite2(at4.lightRange, downlight2.range), 0.5, 10).toFixed(1),
                ),
                (selectElement("#light-angle").max = String(lightAngleLimitForType(at4.type))),
                setControlValue(
                  selectElement("#light-angle"),
                  Math.round(
                    clamp2(
                      finite2(at4.lightAngle, downlight2.angle),
                      15,
                      lightAngleLimitForType(at4.type),
                    ),
                  ),
                ));
              const itemVerticalRotation =
                at4.type === "striplight"
                  ? normalizeFullRotation2(at4.verticalRotation)
                  : clamp2(finite2(at4.verticalRotation, 0), -90, 90);
              (setControlValue(
                selectElement("#item-vertical-rotation"),
                Math.round(itemVerticalRotation * 100) / 100,
              ),
                setControlValue(
                  itemStripRollInput,
                  Math.round(clamp2(finite2(at4.stripRollRotation, 0), 0, 360) * 100) / 100,
                ),
                (itemLightSourceVisibleInput.checked = at4.lightSourceVisible !== false));
            }
            if (
              (includes &&
                syncControlValue2(
                  selectElement("#item-vertical-rotation"),
                  Math.round(clamp2(finite2(at4.verticalRotation, 0), -180, 180) * 100) / 100,
                ),
              at4.type === "curtain")
            ) {
              const isRollerCurtain = at4.curtainForm === "roller";
              ((selectElement("#curtain-form").value = isRollerCurtain ? "roller" : "standard"),
                syncStudioSelect2(selectElement("#curtain-form")),
                (curtainPositionFieldElement.hidden = isRollerCurtain),
                (selectElement("#curtain-track-field").hidden = isRollerCurtain),
                (selectElement("#curtain-position").value = ["left", "right", "split"].includes(
                  at4.curtainPosition,
                )
                  ? at4.curtainPosition
                  : "split"),
                syncStudioSelect2(selectElement("#curtain-position")));
              const curtainTrackSettings = normalizeCurtainTrack2(at4);
              for (const [curtainControlId, curtainControlValue] of [
                ["curtain-track", curtainTrackSettings.curtainTrack],
                ["curtain-corner", curtainTrackSettings.curtainCorner],
                ["curtain-fabric", at4.curtainFabric || "cloth"],
              ])
                ((selectElement("#" + curtainControlId).value = curtainControlValue),
                  syncStudioSelect2(selectElement("#" + curtainControlId)));
              for (const [curtainSyncId, curtainSyncValue] of [
                ["curtain-left-length", curtainTrackSettings.curtainLeftLength],
                ["curtain-right-length", curtainTrackSettings.curtainRightLength],
                ["curtain-meet", curtainTrackSettings.curtainMeet],
                ["curtain-preview", curtainTrackSettings.curtainPreview],
              ])
                syncControlValue2(selectElement("#" + curtainSyncId), curtainSyncValue);
              ((selectElement("#curtain-corner-field").hidden =
                curtainTrackSettings.curtainTrack !== "l"),
                (selectElement("#curtain-left-length-field").hidden =
                  curtainTrackSettings.curtainTrack === "straight" ||
                  (curtainTrackSettings.curtainTrack === "l" &&
                    curtainTrackSettings.curtainCorner !== "left")),
                (selectElement("#curtain-right-length-field").hidden =
                  curtainTrackSettings.curtainTrack === "straight" ||
                  (curtainTrackSettings.curtainTrack === "l" &&
                    curtainTrackSettings.curtainCorner !== "right")),
                (selectElement("#curtain-meet-field").hidden =
                  isRollerCurtain || at4.curtainPosition !== "split"));
            }
            (roundTableTypeSet.has(at4.type) &&
              ((selectElement("#round-table-turntable").value = isTurntableRoundTable(at4)
                ? "with"
                : "without"),
              syncStudioSelect2(selectElement("#round-table-turntable"))),
              openStairTypeSet.has(at4.type) &&
                ((selectElement("#stair-direction").value = ["left", "right"].includes(
                  at4.stairDirection,
                )
                  ? at4.stairDirection
                  : "right"),
                syncStudioSelect2(selectElement("#stair-direction"))),
              at4.type === "tv" &&
                ((selectElement("#tv-mount-style").value = tvMountStyleSet.has(at4.tvMountStyle)
                  ? at4.tvMountStyle
                  : "standard"),
                syncStudioSelect2(selectElement("#tv-mount-style"))),
              at4.type === "mural" &&
                ((selectElement("#mural-style").value = normalizeMuralArtStyle(at4.muralStyle)),
                syncStudioSelect2(selectElement("#mural-style"))),
              at4.type === "featurewall" &&
                ((selectElement("#featurewall-style").value = normalizeFeatureWallStyle(
                  at4.wallStyle,
                )),
                syncStudioSelect2(selectElement("#featurewall-style"))),
              at4.type === "pillar" &&
                ((selectElement("#pillar-shape").value = normalizePillarShape2(at4.pillarShape)),
                syncStudioSelect2(selectElement("#pillar-shape")),
                (selectElement("#pillar-axis").value = normalizePillarAxis2(at4.pillarAxis)),
                syncStudioSelect2(selectElement("#pillar-axis"))),
              at4.type === "striplight" &&
                ((selectElement("#strip-axis").value = normalizeStripAxis2(at4.stripAxis)),
                syncStudioSelect2(selectElement("#strip-axis"))),
              setControlValue(
                selectElement("#item-x"),
                (at4.x / (getPixelsPerMeter() || 1)).toFixed(2),
              ),
              setControlValue(
                selectElement("#item-y"),
                (at4.y / (getPixelsPerMeter() || 1)).toFixed(2),
              ));
            const dimensionDecimals =
              at4.type === "presence" ||
              at4.type.startsWith("decor-") ||
              [
                "smart-socket-86",
                "bunk-bed",
                "wardrobe",
                "office-chair",
                "router",
                "humidifier",
                "dehumidifier",
                "heater",
                "pool-table",
              ].includes(at4.type)
                ? 3
                : 2;
            for (const footprintInput of [
              selectElement("#item-width"),
              selectElement("#item-depth"),
            ])
              ((footprintInput.min = String(itemMinimumFootprint2(at4.type))),
                (footprintInput.step =
                  at4.type === "smart-socket-86"
                    ? "0.001"
                    : dimensionDecimals === 3
                      ? "0.005"
                      : "0.05"));
            (setControlValue(selectElement("#item-width"), at4.width.toFixed(dimensionDecimals)),
              (itemHeightLabelElement.textContent = pillarIsLying2(at4) ? "长（m）" : "高（m）"),
              (selectElement("#item-height").min = String(itemMinimumHeight2(at4.type))),
              (selectElement("#item-height").step =
                at4.type === "smart-socket-86"
                  ? "0.001"
                  : at4.type === "rug"
                    ? "0.002"
                    : dimensionDecimals === 3
                      ? "0.005"
                      : "0.05"),
              setControlValue(
                selectElement("#item-height"),
                at4.type === "rug" ? at4.height.toFixed(3) : at4.height.toFixed(dimensionDecimals),
              ),
              setControlValue(selectElement("#item-depth"), at4.depth.toFixed(dimensionDecimals)),
              setControlValue(selectElement("#item-elevation"), (at4.elevation || 0).toFixed(2)),
              setControlValue(
                selectElement("#item-rotation"),
                Math.round(at4.rotation * 100) / 100,
              ));
          }
        }
      }
    }
  }
}
/** 刷新整个属性检查器：先跑「按选中类型逐个开关字段」的逻辑，再统一收敛一次分组。 */
function refreshStudioUi(shouldClearActiveElement = false) {
  refreshStudioUiInner(shouldClearActiveElement);
  syncInspectorGroups();
}

/** 分组折叠状态：`{ [分组名]: true }` = 该组被折叠，跨会话保留。 */
const INSPECTOR_GROUP_STORAGE_KEY = "homeos3d.studio.inspector-groups";
/** 架构选中项 → 「尺寸与开口」组的标题（同一组在不同选中类型下换个说法）。 */
const INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND = {
  wall: "墙体尺寸",
  window: "窗户尺寸",
  door: "门尺寸",
  railing: "栏杆尺寸",
};
function readInspectorGroupCollapseState() {
  try {
    const storedState = JSON.parse(
      window.localStorage.getItem(INSPECTOR_GROUP_STORAGE_KEY) || "{}",
    );
    return storedState && typeof storedState == "object" ? storedState : {};
  } catch {
    return {};
  }
}
function writeInspectorGroupCollapseState(collapseState: any) {
  try {
    window.localStorage.setItem(INSPECTOR_GROUP_STORAGE_KEY, JSON.stringify(collapseState));
  } catch { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
}
appCtx.inspectorGroupCollapseState = readInspectorGroupCollapseState();
/** 组内是否还有可见字段。 */
function inspectorGroupHasVisibleField(inspectorGroupElement: any) {
  const groupBodyElement = inspectorGroupElement.querySelector(".inspector-group-body");
  if (!groupBodyElement) return false;
  for (const groupUnitElement of groupBodyElement.children)
    if (!groupUnitElement.hasAttribute("hidden")) return true;
  return false;
}
/** 折叠徽标里的字段条数：只数组内当前可见的字段行。 */
function countInspectorGroupFields(inspectorGroupElement: any) {
  const groupBodyElement = inspectorGroupElement.querySelector(".inspector-group-body");
  if (!groupBodyElement) return 0;
  let visibleFieldCount = 0;
  for (const groupUnitElement of groupBodyElement.children) {
    if (groupUnitElement.hasAttribute("hidden")) continue;
    const leafFieldElements = groupUnitElement.matches("label")
      ? [groupUnitElement]
      : [...groupUnitElement.querySelectorAll("label")];
    visibleFieldCount += leafFieldElements.filter(
      (leafFieldElement) => !leafFieldElement.hasAttribute("hidden"),
    ).length;
  }
  return visibleFieldCount;
}
/** 收敛分组：空组整组隐藏、组标题随选中类型换说法、折叠态回放、计数徽标只在折叠时出现。 */
function syncInspectorGroups() {
  const architectureKind = (INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND as any)[appCtx.selectedItem?.kind]
    ? appCtx.selectedItem.kind
    : "";
  for (const inspectorGroupElement of inspectorGroupsElement) {
    const groupName = inspectorGroupElement.dataset.inspectorGroup,
      isCollapsed = appCtx.inspectorGroupCollapseState[groupName!] === true,
      hasVisibleField = inspectorGroupHasVisibleField(inspectorGroupElement);
    inspectorGroupElement.hidden = !hasVisibleField;
    inspectorGroupElement.classList.toggle("is-collapsed", isCollapsed);
    const groupTitleElement = inspectorGroupElement.querySelector(".inspector-group-title"),
      groupCountElement = inspectorGroupElement.querySelector<HTMLElement>(
        ".inspector-group-count",
      );
    groupName === "geometry" &&
      architectureKind &&
      groupTitleElement &&
      (groupTitleElement.textContent = (INSPECTOR_GROUP_TITLE_BY_ARCHITECTURE_KIND as any)[architectureKind]);
    inspectorGroupElement
      .querySelector(".inspector-group-header")
      ?.setAttribute("aria-expanded", String(!isCollapsed));
    if (groupCountElement) {
      const visibleFieldCount = hasVisibleField
        ? countInspectorGroupFields(inspectorGroupElement)
        : 0;
      ((groupCountElement.textContent = visibleFieldCount ? visibleFieldCount + " 项" : ""),
        (groupCountElement.hidden = !isCollapsed || !visibleFieldCount));
    }
  }
}
/** 折叠 / 展开某个分组并记住选择。 */
function toggleInspectorGroup(inspectorGroupElement: any) {
  const groupName = inspectorGroupElement?.dataset.inspectorGroup;
  if (!groupName) return;
  appCtx.inspectorGroupCollapseState = {
    ...appCtx.inspectorGroupCollapseState,
    [groupName]: !inspectorGroupElement.classList.contains("is-collapsed"),
  };
  writeInspectorGroupCollapseState(appCtx.inspectorGroupCollapseState);
  syncInspectorGroups();
}
function materialSlotPanelSignatureFor(modelItem: any, materialSlotEntries: any) {
  return [
    modelItem?.id || "",
    appCtx.sceneStyle,
    materialSlotEntries === null ? "pending" : "ready",
    JSON.stringify(modelItem?.materialOverrides || {}),
    JSON.stringify(normalizeMaterialSurfaceOverrides(modelItem?.materialSurfaceOverrides)),
    String(modelItem?.materialStyle || ""),
    appCtx.materialSlotGroupFilter,
    appCtx.materialStyleOptionSignature,
    materialSlotEntries ? materialSlotEntries.map((slotEntry: any) => slotEntry.name).join(",") : "",
  ].join("|");
}


/** 一枚色卡上排的 3–4 格调色板缩略。 */
function materialStyleSwatchColors(preset: any, fallbackPalette: any, slotRoles: any) {
  return materialStylePresetSwatchColors(preset, fallbackPalette || backgroundSettings(), {
    roles: slotRoles,
  });
}
/** 重建「材质风格」色卡条：档位表随模型类型变化（沙发是布艺 / 皮革组、柜类是木作组…），所以色卡不写死在标记里； */
function syncMaterialStyleStrip(modelItem: any, modelType: any, slotRoles: any) {
  if (!materialStyleStripElement) return;
  ensureCustomMaterialStylesLoaded();
  const presetOptions = isMaterialStyleCapable(modelType) ? materialStyleOptionsFor(modelType) : [],

    optionSignature = materialStyleOptionsSignature(modelType, slotRoles),
    itemPalette = backgroundSettings();
  if (optionSignature !== appCtx.materialStyleOptionSignature) {
    appCtx.materialStyleOptionSignature = optionSignature;
    const chipFragment = document.createDocumentFragment(),
      autoChip = createMaterialStyleChip(
        MATERIAL_STYLE_AUTO,
        materialStyleAutoLabel(modelType),
        materialStyleSwatchColors(null, itemPalette, slotRoles),
        false,
      );
    chipFragment.append(autoChip);
    for (const presetOption of presetOptions)
      chipFragment.append(
        createMaterialStyleChip(
          presetOption.id,
          presetOption.label,
          materialStyleSwatchColors(presetOption, itemPalette, slotRoles),
          presetOption.id.startsWith("custom:"),
        ),
      );
    materialStyleStripElement.replaceChildren(chipFragment);
  }
  const selectedStyle = normalizeMaterialStyle(modelType, modelItem?.materialStyle);
  for (const styleChip of materialStyleStripElement.children) {
    const isActive = styleChip.dataset.materialStyleId === selectedStyle;
    (styleChip.classList.toggle("is-active", isActive),
      styleChip.setAttribute("aria-checked", String(isActive)),
      styleChip.setAttribute("tabindex", isActive ? "0" : "-1"));
  }
  const hasPresets = presetOptions.length > 0;
  materialStyleStripElement.hidden = !hasPresets;
  materialStyleFieldElement && (materialStyleFieldElement.hidden = !hasPresets);
  materialStyleDeleteButton &&
    (materialStyleDeleteButton.hidden = !selectedStyle.startsWith("custom:"));
}
/** 一枚色卡：上方调色板缩略，下方档位名。 */
function createMaterialStyleChip(styleId: any, styleLabel: any, swatchColors: any, isCustom: any) {
  const styleChip = document.createElement("button"),
    swatchStrip = document.createElement("span"),
    labelElement = document.createElement("span");
  return (
    (styleChip.type = "button"),
    (styleChip.className = "material-style-chip" + (isCustom ? " is-custom" : "")),
    (styleChip.dataset.materialStyleId = styleId),
    styleChip.setAttribute("role", "radio"),
    styleChip.setAttribute("aria-checked", "false"),
    styleChip.setAttribute("tabindex", "-1"),
    (styleChip.title = styleLabel + (isCustom ? "（个人预设）" : "")),
    (swatchStrip.className = "material-style-chip-swatches"),
    swatchStrip.append(
      ...swatchColors.map((swatchColor: any) => {
        const swatchCell = document.createElement("i");
        return ((swatchCell.style.background = swatchColor), swatchCell);
      }),
    ),
    (labelElement.className = "material-style-chip-label"),
    (labelElement.textContent = styleLabel),
    styleChip.append(swatchStrip, labelElement),
    styleChip
  );
}


/** 过滤后的槽位 + 当前可选的族（少于两族时不给筛选条，避免为 5 个槽位加一排芯片）。 */
function materialSlotGroupView(materialSlotEntries: any) {
  const groupsInOrder: any = [];
  for (const slotEntry of materialSlotEntries) {
    const slotGroup = materialSlotGroupOf(slotEntry);
    if (!groupsInOrder.some((groupEntry: any) => groupEntry.id === slotGroup.id))
      groupsInOrder.push({ id: slotGroup.id, label: slotGroup.label });
  }
  const isFilterable = groupsInOrder.length > 1,
    activeGroupId =
      isFilterable && groupsInOrder.some((groupEntry: any) => groupEntry.id === appCtx.materialSlotGroupFilter)
        ? appCtx.materialSlotGroupFilter
        : "";
  return {
    groups: groupsInOrder,
    isFilterable: isFilterable,
    activeGroupId: activeGroupId,
    visibleSlotEntries: activeGroupId
      ? materialSlotEntries.filter((slotEntry: any) => materialSlotGroupOf(slotEntry).id === activeGroupId)
      : materialSlotEntries,
  };
}
function renderMaterialSlotGroupChips(groupView: any) {
  if (!materialSlotGroupsElement) return;
  if (!groupView.isFilterable) {
    ((materialSlotGroupsElement.hidden = true), materialSlotGroupsElement.replaceChildren());
    return;
  }
  const chipFragment = document.createDocumentFragment(),
    chipEntries = [{ id: "", label: "全部" }, ...groupView.groups];
  for (const chipEntry of chipEntries) {
    const groupChip = document.createElement("button");
    ((groupChip.type = "button"),
      (groupChip.className =
        "material-slot-group-chip" +
        (chipEntry.id === groupView.activeGroupId ? " is-active" : "")),
      (groupChip.dataset.materialSlotGroup = chipEntry.id),
      (groupChip.textContent = chipEntry.label),
      groupChip.addEventListener("click", () => setMaterialSlotGroupFilter(chipEntry.id)),
      chipFragment.append(groupChip));
  }
  (materialSlotGroupsElement.replaceChildren(chipFragment),
    (materialSlotGroupsElement.hidden = false),
    materialSlotGroupsElement.classList.toggle("is-filtering", Boolean(groupView.activeGroupId)));
}
/** 切槽位筛选：清面板签名逼下一次刷新重画（筛选是纯展示状态，不进文档、不进撤销）。 */
function setMaterialSlotGroupFilter(groupId: any) {
  groupId === appCtx.materialSlotGroupFilter ||
    ((appCtx.materialSlotGroupFilter = groupId),
    (appCtx.materialSlotPanelSignature = ""),
    refreshStudioUi());
}
/** 一行只读表面参数：粗糙 / 金属 / 透明 / 自发光。 */
function materialSlotMetaText(slotEntry: any) {
  const metaParts = [
    "粗糙 " + slotEntry.roughness.toFixed(2),
    "金属 " + slotEntry.metalness.toFixed(2),
  ];
  slotEntry.slab && metaParts.push(materialSlabLabel(slotEntry.slab) + "整图");
  (slotEntry.transparent || slotEntry.opacity < 1) &&
    metaParts.push("透明 " + Math.round(slotEntry.opacity * 100) + "%");
  slotEntry.emissive &&
    slotEntry.emissive !== "#000000" &&
    slotEntry.emissiveIntensity > 0 &&
    metaParts.push("自发光 " + Math.round(slotEntry.emissiveIntensity * 100) + "%");
  return metaParts.join(" · ");
}
/** 门的材质部件表（部件顺序 `DOOR_MATERIAL_PARTS` / 各门型部件 / 部件索引）统一放在`materials/studio-model-material-roles.ts`：运行时出图、材质面板与 CI 校验脚本共用同一份事实（门没有 GLB 可扫，槽位全靠这张表定义），门型增删部件时不会两边各… */


/** 门部件「跟随主题」时读的调色板键（返回色号）。 */
function doorPartThemeColor(doorType: string, role: string, palette: any) {
  const themeKeys = {
    frame:
      doorType === "solid" || doorType === "frame-only"
        ? ["solidDoorFrame", "doorFrame", "frame"]
        : doorType === "entry"
          ? ["entryDoorFrame", "doorFrame", "frame"]
          : ["doorFrame", "frame"],
    door: doorType === "entry" ? ["furnitureDark"] : ["doorLeaf"],
    glass: ["glass"],
    metal: doorType === "entry" ? ["furnitureLight"] : ["furnitureDark"],
    shutter: ["rollerCurtain", "furnitureSoft"],
    slat: ["rollerSlat", "furnitureDark"],
    trim: ["furnitureSoft", "furnitureDark"],
  }[role];
  if (!themeKeys) return resolveMaterialPaletteColor(palette, "furniture");


  for (const themeKey of themeKeys) {
    const colorValue = palette?.[themeKey];
    if (typeof colorValue === "number") return colorValue;
  }
  return resolveMaterialPaletteColor(palette, themeKeys[themeKeys.length - 1]);
}
/** 门的逐部件材质 —— 出图与面板**同源**的那一份（改这里就等于同时改画面与检查面板）。 */
function resolveDoorPartMaterials(doorRecord: any, themePalette: any): Record<string, DoorPartMaterial> {
  const doorType = doorRecord?.doorType || "solid",
    doorStyleId = normalizeMaterialStyle("door", doorRecord?.materialStyle),
    doorPalette = {
      ...themePalette,
      ...materialStylePaletteColors("door", doorStyleId),
    };
  doorStyleId !== MATERIAL_STYLE_AUTO && (doorPalette.materialStyle = doorStyleId);
  const overrideColors = normalizeMaterialOverrides(doorRecord?.materialOverrides) || {},
    surfaceOverrides = normalizeMaterialSurfaceOverrides(doorRecord?.materialSurfaceOverrides),
    partMaterials: Record<string, DoorPartMaterial> = {};
  for (const role of doorMaterialPartRolesForType(doorType)) {
    const partIndex = doorMaterialPartIndex(role),
      materialName = "door-material-" + partIndex,
      styleRecipe = materialStyleRecipeFor("door", materialName, doorPalette, partIndex),
      overrideColor = overrideColors[materialName],
      overrideColorValue = overrideColor ? Number.parseInt(overrideColor.slice(1), 16) : undefined,
      slotSurfaceOverride = surfaceOverrides[materialName] || {};
    partMaterials[role] = {
      role,
      materialName,
      /** 画面用的色号：逐门覆盖色 > 档位配方 > 主题键。 */
      colorValue:
        overrideColorValue !== undefined
          ? overrideColorValue
          : styleRecipe?.colorValue ?? doorPartThemeColor(doorType, role, doorPalette),
      overrideColor: overrideColor || "",

      roughness: slotSurfaceOverride.roughness ?? styleRecipe?.roughness,
      metalness: slotSurfaceOverride.metalness ?? styleRecipe?.metalness,
      transparent: styleRecipe?.transparent === true,
      opacity: styleRecipe?.opacity ?? 1,
      depthWrite: styleRecipe?.depthWrite !== false,
      emissiveValue: styleRecipe?.emissiveValue,
      emissiveIntensity: styleRecipe?.emissiveIntensity,
    };
  }
  return partMaterials;
}
/** 画面上的门部件色：选中时叠一层主题 accent（沿用架构构件「选中即高亮」的老规矩），但**只叠一半** —— 从前的写法是把整扇门刷成 accent，于是编辑材质时画面上永远是一片高亮色，看不出自己改了什么（「选了风格没变化」）。 */
function doorPartDisplayColor(partMaterial: any, isSelected: boolean, themePalette: any) {
  const partColorValue = partMaterial?.colorValue;
  if (!isSelected || typeof partColorValue !== "number") return partColorValue;
  const accentColor = themePalette?.accent;
  if (typeof accentColor !== "number") return partColorValue;
  const mixChannel = (shift: number) => {
    const partChannel = (partColorValue >> shift) & 255,
      accentChannel = (accentColor >> shift) & 255;
    return Math.round(partChannel + (accentChannel - partChannel) * 0.5);
  };
  return (mixChannel(16) << 16) | (mixChannel(8) << 8) | mixChannel(0);
}
/** 门部件材质 → `addArchitectureMesh` 的 options。 */
function doorPartMeshOptions(partMaterial: any, baseOptions: any) {
  if (!partMaterial) return baseOptions;
  const meshOptions = { ...baseOptions };
  partMaterial.roughness !== undefined && (meshOptions.roughness = partMaterial.roughness);
  partMaterial.metalness !== undefined && (meshOptions.metalness = partMaterial.metalness);
  partMaterial.transparent &&
    ((meshOptions.transparent = true),
    (meshOptions.opacity = partMaterial.opacity),
    (meshOptions.depthWrite = partMaterial.depthWrite));
  partMaterial.emissiveValue !== undefined &&
    ((meshOptions.emissive = partMaterial.emissiveValue),
    (meshOptions.emissiveIntensity = partMaterial.emissiveIntensity ?? 0.5));
  return meshOptions;
}
/** 门的「材质属性」槽位表：形状与 `loader.describeItemMaterials` 的输出一致，于是同一块面板 DOM、同一套写入函数与同一份色卡逻辑都能直接复用。 */
function describeDoorMaterials(doorRecord: any) {
  const themePalette = backgroundSettings(),
    partMaterials = resolveDoorPartMaterials(doorRecord, themePalette),
    surfaceOverrides = normalizeMaterialSurfaceOverrides(doorRecord?.materialSurfaceOverrides);
  return doorMaterialPartRolesForType(doorRecord?.doorType).map((role) => {
    const partMaterial = partMaterials[role];
    return {
      name: partMaterial.materialName,
      role,
      roleSource: "role-table",
      slot: doorMaterialPartIndex(role),
      /** 门永远由角色表出图：没有「沿用模型自带色」这种情况。 */
      fromPalette: true,
      color: "#" + (partMaterial.colorValue & 0xffffff).toString(16).padStart(6, "0"),
      roughness: partMaterial.roughness ?? 0.58,
      metalness: partMaterial.metalness ?? 0.08,
      transparent: partMaterial.transparent === true,
      opacity: partMaterial.opacity ?? 1,
      emissive: "",
      emissiveIntensity: 0,
      depthWrite: partMaterial.depthWrite !== false,
      overrideColor: partMaterial.overrideColor,
      surfaceOverride: surfaceOverrides[partMaterial.materialName] || null,
      slab: "",
    };
  });
}
/** 同款门（同 doorType）的其它扇数：面板上「应用到同类」的可点状态。 */
function doorMaterialPeerCount(doorRecord: any) {
  return materialSameModelPeerCount({ kind: "door", record: doorRecord });
}
/** 重建「材质属性」面板的门版本：与 `renderMaterialSlotPanel` 共用色卡条 / 槽位行 / 动作按钮，只有槽位来源不同（门是程序化部件，家具是 GLB 材质槽）。 */
function renderDoorMaterialPanel(doorRecord: any) {
  if (!materialFieldsElement || !materialSlotListElement || !doorRecord) return;
  const doorPartRoles = doorMaterialPartRolesForType(doorRecord.doorType);
  materialFieldsElement.hidden = false;
  syncMaterialStyleStrip(doorRecord, "door", doorPartRoles);
  const materialSlotEntries = describeDoorMaterials(doorRecord),
    panelSignature = materialSlotPanelSignatureFor(doorRecord, materialSlotEntries);
  if (panelSignature === appCtx.materialSlotPanelSignature) return;
  appCtx.materialSlotPanelSignature = panelSignature;
  appCtx.isMaterialSlotPanelPending = false;

  for (const expandedSlotName of [...appCtx.expandedMaterialSurfaceSlots])
    materialSlotEntries.some((slotEntry) => slotEntry.name === expandedSlotName) ||
      appCtx.expandedMaterialSurfaceSlots.delete(expandedSlotName);
  const overrideCount = materialSlotEntries.filter((slotEntry) => Boolean(slotEntry.overrideColor))
      .length,
    surfaceOverrideCount = materialSlotEntries.filter((slotEntry) =>
      Boolean(slotEntry.surfaceOverride),
    ).length,
    doorMaterialStyle = normalizeMaterialStyle("door", doorRecord.materialStyle),
    hasMaterialStyle = doorMaterialStyle !== MATERIAL_STYLE_AUTO,
    peerCount = doorMaterialPeerCount(doorRecord),
    groupView = materialSlotGroupView(materialSlotEntries);
  materialSummaryElement.textContent =
    (hasMaterialStyle ? materialStyleLabel("door", doorMaterialStyle) + " · " : "") +
    materialSlotEntries.length +
    " 个材质部件 · " +
    materialCoverageSummary(overrideCount, surfaceOverrideCount);
  ((materialResetAllButton.disabled = !overrideCount && !surfaceOverrideCount && !hasMaterialStyle),
    (materialSavePresetButton.disabled = false),
    (materialApplySameButton.disabled = !peerCount),
    (materialApplySameButton.title = peerCount
      ? "把当前档位与逐部件改动复制给其它 " + peerCount + " 扇同款门"
      : "场景里没有其它同款门"));
  renderMaterialSlotGroupChips(groupView);
  const slotRowFragment = document.createDocumentFragment();
  for (const slotEntry of groupView.visibleSlotEntries)
    slotRowFragment.append(createMaterialSlotRow(slotEntry));
  if (!groupView.visibleSlotEntries.length) {
    const emptyElement = document.createElement("p");
    ((emptyElement.className = "material-slot-empty"),
      (emptyElement.textContent = "这一族里没有部件。"),
      slotRowFragment.append(emptyElement));
  }
  materialSlotListElement.replaceChildren(slotRowFragment);
}
/** 重建「材质属性」检查面板：先给「材质风格」预设下拉（选一档 = 整套角色换料），再列出选中物件的每个 GLB 材质槽位 → 角色 → 当前显色与表面。 */
function renderMaterialSlotPanel(modelItem: any) {
  if (!materialFieldsElement || !materialSlotListElement) return;
  const hasExternalModel = Boolean(
    modelItem && externalModelRegistry.hasExternalModelForItem(modelItem),
  );
  materialFieldsElement.hidden = !hasExternalModel;
  if (!hasExternalModel) {
    ((appCtx.materialSlotPanelSignature = ""),
      (appCtx.materialStyleOptionSignature = ""),
      materialSlotListElement.replaceChildren());
    return;
  }
  const itemModelType = externalModelRegistry.modelTypeForItem(modelItem);

  const materialSlotEntries = externalModelRegistry.describeItemMaterials(
      modelItem,
      materialLoadOptionsForItem(modelItem),
    ),
    slotRoles = materialSlotEntries
      ? materialSlotEntries.map((slotEntry: any) => slotEntry.role)
      : null;
  syncMaterialStyleStrip(modelItem, itemModelType, slotRoles);
  const panelSignature = materialSlotPanelSignatureFor(modelItem, materialSlotEntries);
  if (panelSignature === appCtx.materialSlotPanelSignature) return;
  appCtx.materialSlotPanelSignature = panelSignature;
  if (!materialSlotEntries) {
    ((appCtx.isMaterialSlotPanelPending = true),
      (materialSummaryElement.textContent = "模型加载中，稍后自动刷新…"),
      materialSlotListElement.replaceChildren(),
      (materialResetAllButton.disabled = true),
      (materialSavePresetButton.disabled = true),
      (materialApplySameButton.disabled = true),
      materialSlotGroupsElement && (materialSlotGroupsElement.hidden = true));
    return;
  }
  appCtx.isMaterialSlotPanelPending = false;

  for (const expandedSlotName of [...appCtx.expandedMaterialSurfaceSlots])
    materialSlotEntries.some((slotEntry: any) => slotEntry.name === expandedSlotName) ||
      appCtx.expandedMaterialSurfaceSlots.delete(expandedSlotName);
  const overrideCount = materialSlotEntries.filter(
      (slotEntry: any) => Boolean(slotEntry.overrideColor),
    ).length,
    surfaceOverrideCount = materialSlotEntries.filter(
      (slotEntry: any) => Boolean(slotEntry.surfaceOverride),
    ).length,
    itemMaterialStyle = normalizeMaterialStyle(itemModelType, modelItem?.materialStyle),
    hasMaterialStyle = itemMaterialStyle !== MATERIAL_STYLE_AUTO,
    peerCount = materialSameModelPeerCount({ kind: "item", record: modelItem }),
    groupView = materialSlotGroupView(materialSlotEntries);
  materialSummaryElement.textContent =
    (hasMaterialStyle ? materialStyleLabel(itemModelType, itemMaterialStyle) + " · " : "") +
    materialSlotEntries.length +
    " 个材质槽位 · " +
    materialCoverageSummary(overrideCount, surfaceOverrideCount);
  ((materialResetAllButton.disabled = !overrideCount && !surfaceOverrideCount && !hasMaterialStyle),
    (materialSavePresetButton.disabled = false),
    (materialApplySameButton.disabled = !peerCount),
    (materialApplySameButton.title = peerCount
      ? "把当前档位与逐槽改动复制给其它 " + peerCount + " 件同模型物件"
      : "场景里没有其它同模型物件"));
  renderMaterialSlotGroupChips(groupView);
  const showGroupLabels =
      !groupView.activeGroupId &&
      groupView.isFilterable &&
      materialSlotEntries.length >= 8,
    slotRowFragment = document.createDocumentFragment();
  let lastGroupId = "";
  for (const slotEntry of groupView.visibleSlotEntries) {
    const slotGroup = materialSlotGroupOf(slotEntry);
    if (showGroupLabels && slotGroup.id !== lastGroupId) {
      lastGroupId = slotGroup.id;
      const groupLabelElement = document.createElement("div");
      ((groupLabelElement.className = "material-slot-group-label"),
        (groupLabelElement.textContent = slotGroup.label),
        slotRowFragment.append(groupLabelElement));
    }
    slotRowFragment.append(createMaterialSlotRow(slotEntry));
  }
  if (!groupView.visibleSlotEntries.length) {
    const emptyElement = document.createElement("p");
    ((emptyElement.className = "material-slot-empty"),
      (emptyElement.textContent = "这一族里没有槽位。"),
      slotRowFragment.append(emptyElement));
  }
  materialSlotListElement.replaceChildren(slotRowFragment);
}
/** 一行覆盖情况的说法：颜色改了几处、表面参数改了几处，都没改就说跟随主题。 */
function materialCoverageSummary(overrideCount: any, surfaceOverrideCount: any) {
  const changeParts: any[] = [];
  overrideCount && changeParts.push("改色 " + overrideCount);
  surfaceOverrideCount && changeParts.push("改参数 " + surfaceOverrideCount);
  return changeParts.length ? changeParts.join(" · ") : "全部跟随主题";
}
/** 一条槽位行：左边角色 / 槽位号 / GLB 名，右边色块 + 十六进制 + 参数 + 复位。 */
function createMaterialSlotRow(slotEntry: any) {
  const displayedColor = (slotEntry.overrideColor || slotEntry.color || "#000000").toLowerCase(),
    surfaceOverride = slotEntry.surfaceOverride || null,
    hasOverride = Boolean(slotEntry.overrideColor),
    hasSurfaceOverride = Boolean(surfaceOverride),
    isSurfaceExpanded = appCtx.expandedMaterialSurfaceSlots.has(slotEntry.name),
    slotRow = document.createElement("div"),
    slotLineElement = document.createElement("div"),
    slotTextElement = document.createElement("span"),
    roleElement = document.createElement("span"),
    nameElement = document.createElement("span"),
    slabBadgeElement = document.createElement("span"),
    controlsElement = document.createElement("span"),
    colorInputElement = document.createElement("input"),
    hexInputElement = document.createElement("input"),
    surfaceToggleButton = document.createElement("button"),
    resetButtonElement = document.createElement("button");
  return (
    (slotRow.className =
      "material-slot" +
      (hasOverride ? " is-overridden" : "") +
      (hasSurfaceOverride ? " has-surface-override" : "")),
    (slotRow.dataset.materialSlot = slotEntry.name),
    (slotRow.title = materialSlotMetaText(slotEntry)),
    (slotLineElement.className = "material-slot-line"),
    (slotTextElement.className = "material-slot-text"),
    (roleElement.className = "material-slot-role"),
    (roleElement.textContent =
      materialRoleLabel(slotEntry.role) +
      (Number.isFinite(slotEntry.slot) ? " · #" + slotEntry.slot : "")),
    (nameElement.className = "material-slot-name"),
    (nameElement.textContent = slotEntry.name),
    (nameElement.title =
      slotEntry.name + (slotEntry.fromPalette ? "（跟随主题调色板）" : "（沿用模型自带颜色）")),
    (slabBadgeElement.className = "material-slot-slab"),
    (slabBadgeElement.textContent = materialSlabLabel(slotEntry.slab)),
    (slabBadgeElement.title =
      materialSlabLabel(slotEntry.slab) +
      "整图：这一槽会贴一张自带的石材纹路（颜色仍可调，纹路不受影响）"),
    slotEntry.slab || (slabBadgeElement.hidden = true),
    (controlsElement.className = "material-slot-controls"),
    (colorInputElement.type = "color"),
    (colorInputElement.className = "material-slot-color"),
    (colorInputElement.dataset.materialSlotColor = slotEntry.name),
    (colorInputElement.value = displayedColor),
    (colorInputElement.title = "点开取色器给这个槽位指定颜色；改完写进当前物件"),
    (hexInputElement.type = "text"),
    (hexInputElement.className = "material-slot-hex"),
    (hexInputElement.dataset.materialSlotHex = slotEntry.name),
    (hexInputElement.value = displayedColor),
    (hexInputElement.spellcheck = false),
    (hexInputElement.maxLength = 7),
    (hexInputElement.title = "可以直接粘贴十六进制色值，回车或离开输入框生效"),
    (surfaceToggleButton.type = "button"),
    (surfaceToggleButton.className = "material-slot-surface-toggle"),
    (surfaceToggleButton.dataset.materialSlotSurfaceToggle = slotEntry.name),
    (surfaceToggleButton.setAttribute("aria-expanded", String(isSurfaceExpanded))),
    (surfaceToggleButton.textContent = hasSurfaceOverride ? "参数 •" : "参数"),
    (surfaceToggleButton.title =
      "调整该槽位的粗糙度与金属度（当前 " + materialSlotMetaText(slotEntry) + "）"),
    (resetButtonElement.type = "button"),
    (resetButtonElement.className = "material-slot-reset"),
    (resetButtonElement.dataset.materialSlotReset = slotEntry.name),
    (resetButtonElement.textContent = "↺"),
    (resetButtonElement.disabled = !hasOverride),
    (resetButtonElement.title = hasOverride ? "清除该槽位的手动颜色" : "该槽位当前就跟随主题"),
    controlsElement.append(
      colorInputElement,
      hexInputElement,
      surfaceToggleButton,
      resetButtonElement,
    ),
    slotTextElement.append(roleElement, nameElement, slabBadgeElement),
    slotLineElement.append(slotTextElement, controlsElement),
    slotRow.append(slotLineElement),
    slotRow.append(createMaterialSlotSurfacePanel(slotEntry, isSurfaceExpanded)),
    slotRow
  );
}
/** 槽位行展开后的表面参数面板：粗糙度 / 金属度两个滑块 + 一处「跟随档位」复位。 */
function createMaterialSlotSurfacePanel(slotEntry: any, isSurfaceExpanded: any) {
  const surfacePanelElement = document.createElement("div");
  surfacePanelElement.className = "material-slot-surface";
  surfacePanelElement.dataset.materialSlotSurface = slotEntry.name;
  surfacePanelElement.hidden = !isSurfaceExpanded;
  for (const surfaceField of [
    { key: "roughness", label: "粗糙度", value: slotEntry.roughness },
    { key: "metalness", label: "金属度", value: slotEntry.metalness },
  ]) {
    const fieldLabelElement = document.createElement("label"),
      rangeInputElement = document.createElement("input"),
      outputElement = document.createElement("output");
    ((fieldLabelElement.className = "material-slot-surface-field"),
      (fieldLabelElement.textContent = surfaceField.label),
      (rangeInputElement.type = "range"),
      (rangeInputElement.min = "0"),
      (rangeInputElement.max = "1"),
      (rangeInputElement.step = "0.01"),
      (rangeInputElement.value = String(
        Math.min(1, Math.max(0, Number(surfaceField.value) || 0)),
      )),
      (rangeInputElement.dataset.materialSlotSurfaceKey = surfaceField.key),
      (rangeInputElement.dataset.materialSlotSurfaceName = slotEntry.name),
      /* 统一滑条观感（几何/配色）由 main.css 的 `hos-range-ui` 提供，本处不再写几何。 */
      rangeInputElement.classList.add("hos-range-ui"),
      (outputElement.textContent = Number(rangeInputElement.value).toFixed(2)),
      /* 自绘轨道靠 `--progress-pct` 铺左侧金色段：初值先写一次，否则整条都是灰槽。 */
      syncHtmlRangeProgress2(rangeInputElement),
      fieldLabelElement.append(rangeInputElement, outputElement),
      surfacePanelElement.append(fieldLabelElement));
  }
  const surfaceResetButton = document.createElement("button");
  return (
    (surfaceResetButton.type = "button"),
    (surfaceResetButton.className = "material-slot-surface-reset"),
    (surfaceResetButton.dataset.materialSlotSurfaceReset = slotEntry.name),
    (surfaceResetButton.textContent = "跟随档位（清除这两项改动）"),
    surfacePanelElement.append(surfaceResetButton),
    surfacePanelElement
  );
}
/** 场景里同款物件的其它数量（「应用到同类」的按钮状态与提示用）：家具按模型比，门按门型比。 */
function materialSameModelPeerCount(target: any) {
  return materialSameModelPeerRecords(target).length;
}
/** 材质编辑用的「模型类型」：家具取注册表里的模型类型，门就是 `door` —— 门的档位组与角色表都以 `door` 为键（门型差异由部件表处理，不另开模型类型）。 */
function materialEditModelType(record: any, kind: any) {
  return kind === "door" ? "door" : externalModelRegistry.modelTypeForItem(record);
}
/** 当前选中对象里那一个「可做材质编辑」的：家具（GLB 模型）或门（户型洞口）。 */
function selectedMaterialEditTarget() {
  const selectedObject = getSelectedObject();
  if (!selectedObject || !isSelectionAllowed(appCtx.selectedItem)) return null;
  if (appCtx.selectedItem?.kind === "item") return { kind: "item", record: selectedObject };
  if (appCtx.selectedItem?.kind === "door") return { kind: "door", record: selectedObject };
  return null;
}
/** 同款物件的其它成员：家具按 itemType 比，门按 **doorType** 比 —— 门的「同款」就是同一种门型（实木门与推拉门的部件都不一样，互相套用材质只会套出一堆无主的覆盖色）。 */
function materialSameModelPeerRecords(target: any) {
  if (!target) return [];
  if (target.kind === "door") {
    const doorType = target.record?.doorType || "solid";
    return appCtx.studioState.doors.filter(
      (sceneDoor) => sceneDoor.id !== target.record.id && (sceneDoor.doorType || "solid") === doorType,
    );
  }
  const modelType = materialEditModelType(target.record, target.kind);
  if (!modelType) return [];
  return appCtx.studioState.items.filter(
    (sceneItem) =>
      sceneItem !== target.record &&
      sceneItem?.id !== target.record?.id &&
      externalModelRegistry.modelTypeForItem(sceneItem) === modelType,
  );
}
/** 逐物件材质编辑的公共收尾：只调用一次 `captureUndoSnapshot`，改动为真才落撤销 / 重建。 */
function commitItemMaterialEdit(mutationFunction: any) {
  const materialEditTarget = selectedMaterialEditTarget();
  if (!materialEditTarget) return false;
  const undoSnapshot = captureUndoSnapshot();
  if (!mutationFunction(materialEditTarget.record, materialEditTarget.kind)) return false;
  return (
    (appCtx.materialSlotPanelSignature = ""),
    applyPlacementChange(undoSnapshot),
    refreshScopeItems(
      materialEditTarget.kind === "door"
        ? "architecture"
        : resolvePreviewScope(materialEditTarget.record),
    ),
    markDocumentDirty(),
    true
  );
}
/** 写入 / 清除逐物件材质覆盖色。 */
function setItemMaterialOverride(materialName: any, overrideColor: any) {
  commitItemMaterialEdit((modelItem: any) => {
    const previousOverrides =
        modelItem.materialOverrides &&
        typeof modelItem.materialOverrides == "object" &&
        !Array.isArray(modelItem.materialOverrides)
          ? { ...modelItem.materialOverrides }
          : {},
      nextOverrides = { ...previousOverrides },
      isOverrideColor =
        typeof overrideColor == "string" && /^#[0-9a-f]{6}$/i.test(overrideColor);
    if (!materialName)
      for (const overrideKey of Object.keys(nextOverrides)) delete nextOverrides[overrideKey];
    else if (isOverrideColor) nextOverrides[materialName] = overrideColor.toLowerCase();
    else delete nextOverrides[materialName];
    const touchedKeys = new Set([
      ...Object.keys(previousOverrides),
      ...Object.keys(nextOverrides),
    ]);
    if (
      ![...touchedKeys].some(
        (touchedKey) => previousOverrides[touchedKey] !== nextOverrides[touchedKey],
      )
    )
      return false;
    const normalizedOverrides = Object.fromEntries(
      Object.entries(nextOverrides).sort(([keyA], [keyB]) => (keyA < keyB ? -1 : keyA > keyB ? 1 : 0)),
    );
    Object.keys(normalizedOverrides).length
      ? (modelItem.materialOverrides = normalizedOverrides)
      : delete modelItem.materialOverrides;
    return true;
  });
}
/** 写入 / 清除「材质风格」档位（`item.materialStyle`）。 */
function setItemMaterialStyle(styleValue: any) {
  commitItemMaterialEdit((modelItem: any, materialEditTargetKind: any) => {
    const modelType = materialEditModelType(modelItem, materialEditTargetKind),
      previousStyle = normalizeMaterialStyle(modelType, modelItem.materialStyle),
      nextStyle = normalizeMaterialStyle(modelType, styleValue);
    if (nextStyle === previousStyle) return false;
    nextStyle === MATERIAL_STYLE_AUTO
      ? delete modelItem.materialStyle
      : (modelItem.materialStyle = nextStyle);
    return true;
  });
}
/** 「全部跟随主题」：档位与逐槽覆盖色一起清掉（面板上那颗按钮的语义就是全复位）。 */
function resetItemMaterialAll() {
  commitItemMaterialEdit((modelItem: any, materialEditTargetKind: any) => {
    const modelType = materialEditModelType(modelItem, materialEditTargetKind),
      hasOverrides = Boolean(
        modelItem.materialOverrides &&
          typeof modelItem.materialOverrides == "object" &&
          Object.keys(modelItem.materialOverrides).length,
      ),
      hasSurfaceOverrides = Boolean(
        Object.keys(normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides)).length,
      ),
      hasMaterialStyle =
        normalizeMaterialStyle(modelType, modelItem.materialStyle) !== MATERIAL_STYLE_AUTO;
    if (!hasOverrides && !hasSurfaceOverrides && !hasMaterialStyle) return false;
    (delete modelItem.materialOverrides,
      delete modelItem.materialSurfaceOverrides,
      delete modelItem.materialStyle);
    return true;
  });
}
/** 写入 / 清除某个槽位的表面参数覆盖（`item.materialSurfaceOverrides`）。 */
function setItemMaterialSurfaceOverride(materialName: any, surfaceKey: any, surfaceValue: any) {
  if (!materialName || !["roughness", "metalness"].includes(surfaceKey)) return;
  commitItemMaterialEdit((modelItem: any) => {
    const previousSurfaceOverrides = normalizeMaterialSurfaceOverrides(
        modelItem.materialSurfaceOverrides,
      ),
      previousSlotOverride = previousSurfaceOverrides[materialName] || {},
      isSurfaceNumber =
        typeof surfaceValue == "number" && Number.isFinite(surfaceValue),
      nextSlotOverride = { ...previousSlotOverride };
    isSurfaceNumber
      ? (nextSlotOverride[surfaceKey] = Math.round(Math.min(1, Math.max(0, surfaceValue)) * 100) / 100)
      : delete nextSlotOverride[surfaceKey];
    const nextSurfaceOverrides = { ...previousSurfaceOverrides };
    Object.keys(nextSlotOverride).length
      ? (nextSurfaceOverrides[materialName] = nextSlotOverride)
      : delete nextSurfaceOverrides[materialName];
    const normalizedSurfaceOverrides = normalizeMaterialSurfaceOverrides(nextSurfaceOverrides);
    if (
      JSON.stringify(normalizedSurfaceOverrides) === JSON.stringify(previousSurfaceOverrides)
    )
      return false;
    return (
      Object.keys(normalizedSurfaceOverrides).length
        ? (modelItem.materialSurfaceOverrides = normalizedSurfaceOverrides)
        : delete modelItem.materialSurfaceOverrides,
      true
    );
  });
}


/** 个人预设落在 localStorage：跨项目、跨会话复用，但**不进**户型文档（换台机器就没了）。 */
const MATERIAL_STYLE_CUSTOM_STORAGE_KEY = "homeos3d.studio.material-styles";
function readStoredCustomMaterialStyles() {
  try {
    return JSON.parse(window.localStorage.getItem(MATERIAL_STYLE_CUSTOM_STORAGE_KEY) || "[]");
  } catch {
    return [];
  }
}
/** 把存储里的个人预设装进档位表； */
function loadCustomMaterialStyles() {
  const acceptedRecords = registerCustomMaterialStyles(readStoredCustomMaterialStyles());
  return acceptedRecords;
}
/** 个人预设只装一次：档位表的查询是热路径（每次刷新面板都要走），不能每次读 localStorage。 */
function ensureCustomMaterialStylesLoaded() {
  appCtx.areCustomMaterialStylesLoaded ||
    ((appCtx.areCustomMaterialStylesLoaded = true), loadCustomMaterialStyles());
}
function writeStoredCustomMaterialStyles(records: any) {
  try {
    window.localStorage.setItem(MATERIAL_STYLE_CUSTOM_STORAGE_KEY, JSON.stringify(records));
  } catch { /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */ }
}
/** 把当前物件的出图结果存成一档个人预设（同名同组覆盖）。 */
function saveCurrentItemMaterialStyle(label: any) {
  const materialEditTarget = selectedMaterialEditTarget(),
    modelItem = materialEditTarget?.record;
  if (!modelItem) return "";
  const modelType = materialEditModelType(modelItem, materialEditTarget.kind),
    presetGroup = materialStyleGroupFor(modelType);
  if (!presetGroup) return "";
  const materialSlotEntries =
    materialEditTarget.kind === "door"
      ? describeDoorMaterials(modelItem)
      : externalModelRegistry.describeItemMaterials(
          modelItem,
          materialLoadOptionsForItem(modelItem),
        );
  if (!materialSlotEntries) return "";
  const currentStyle = normalizeMaterialStyle(modelType, modelItem.materialStyle),
    customId = customMaterialStyleId(presetGroup, label),
    customRecord = buildCustomMaterialStyleRecord(
      customId,
      label,
      presetGroup,
      materialSlotEntries.map((slotEntry: any) => ({
        role: slotEntry.role,
        color: slotEntry.color || "#888888",
        roughness: slotEntry.roughness,
        metalness: slotEntry.metalness,

        slab: slotEntry.slab || "",
      })),
      materialStylePresetFor(modelType, currentStyle),
    );
  if (!customRecord) return "";
  const remainingRecords = loadCustomMaterialStyles().filter(
    (customStyleRecord) => customStyleRecord.id !== customId,
  );
  const nextRecords = [...remainingRecords, customRecord];
  (writeStoredCustomMaterialStyles(nextRecords),
    loadCustomMaterialStyles(),
    (appCtx.materialStyleOptionSignature = ""),
    (appCtx.materialSlotPanelSignature = ""));

  setItemMaterialStyle(customId);
  return label;
}
/** 删除一档个人预设； */
function deleteCustomMaterialStyle(styleId: any) {
  if (!String(styleId).startsWith("custom:")) return;
  const nextRecords = loadCustomMaterialStyles().filter(
    (customStyleRecord) => customStyleRecord.id !== styleId,
  );
  (writeStoredCustomMaterialStyles(nextRecords),
    loadCustomMaterialStyles(),
    (appCtx.materialStyleOptionSignature = ""));


  const affectedItems = appCtx.studioState.items.filter(
      (sceneItem) => sceneItem.materialStyle === styleId,
    ),
    affectedDoors = appCtx.studioState.doors.filter(
      (sceneDoor) => sceneDoor.materialStyle === styleId,
    );
  if (!affectedItems.length && !affectedDoors.length)
    return void (appCtx.materialSlotPanelSignature = "");
  const undoSnapshot = captureUndoSnapshot();
  for (const affectedItem of affectedItems) delete affectedItem.materialStyle;
  for (const affectedDoor of affectedDoors) delete affectedDoor.materialStyle;
  (applyPlacementChange(undoSnapshot),
    affectedItems.length && refreshScopeItems("items"),
    affectedDoors.length && refreshScopeItems("architecture"),
    markDocumentDirty());
}
/** 「应用到同类物件」：把当前物件的档位、逐槽颜色与表面参数复制给场景里同模型的其它物件。 */
function applyMaterialToSameModelItems() {
  const materialEditTarget = selectedMaterialEditTarget(),
    modelItem = materialEditTarget?.record;
  if (!modelItem) return 0;
  const peerItems = materialSameModelPeerRecords(materialEditTarget);
  if (!peerItems.length) return 0;
  const materialOverrides = modelItem.materialOverrides
      ? { ...modelItem.materialOverrides }
      : null,
    materialSurfaceOverrides = Object.keys(
      normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides),
    ).length
      ? normalizeMaterialSurfaceOverrides(modelItem.materialSurfaceOverrides)
      : null,
    materialStyle = modelItem.materialStyle || null;
  const undoSnapshot = captureUndoSnapshot();
  for (const peerItem of peerItems)
    (materialStyle
      ? (peerItem.materialStyle = materialStyle)
      : delete peerItem.materialStyle,
      materialOverrides
        ? (peerItem.materialOverrides = { ...materialOverrides })
        : delete peerItem.materialOverrides,
      materialSurfaceOverrides
        ? (peerItem.materialSurfaceOverrides = { ...materialSurfaceOverrides })
        : delete peerItem.materialSurfaceOverrides);
  return (
    (appCtx.materialSlotPanelSignature = ""),
    applyPlacementChange(undoSnapshot),
    refreshScopeItems(
      materialEditTarget.kind === "door"
        ? "architecture"
        : resolvePreviewScope(materialEditTarget.record),
    ),
    markDocumentDirty(),
    peerItems.length
  );
}
function refreshScopeItems(scopeFilter = "all") {
  (refreshBackground(),
    refreshStudioUi(),
    refreshStudioView(),
    scopeFilter !== "none" &&
      requestSceneRebuild({
        scope: scopeFilter,
      }));
}
function setDrawingToolGroupOpen(drawingToolSection: any, isDrawingToolGroupOpen: any) {
  const drawingToolToggle = drawingToolSection.querySelector(".drawing-tool-toggle");
  const drawingToolPanel = drawingToolSection.querySelector(".drawing-tool-buttons");
  if (!drawingToolToggle || !drawingToolPanel) return;
  (drawingToolSection.classList.toggle("open", isDrawingToolGroupOpen),
    (drawingToolPanel.hidden = !isDrawingToolGroupOpen),
    drawingToolToggle.setAttribute("aria-expanded", String(isDrawingToolGroupOpen)));
}
function closeDrawingToolGroups(drawingToolGroupToKeep: any = null) {
  for (const drawingToolSection of drawingToolSections)
    if (drawingToolSection !== drawingToolGroupToKeep)
      setDrawingToolGroupOpen(drawingToolSection, false);
}
function syncDrawingToolGroupStates() {
  for (const drawingToolSection of drawingToolSections) {
    const activeDrawingToolBadge =
      drawingToolSection.querySelector<StudioControlElement>(".drawing-tool-active");
    if (!activeDrawingToolBadge) continue;
    const activeDrawingToolButton =
      drawingToolSection.querySelector<StudioControlElement>(".tool-button.active");
    activeDrawingToolBadge.textContent = "";
    if (activeDrawingToolButton) {
      const activeDrawingToolIcon = activeDrawingToolButton.querySelector("i");
      const activeDrawingToolLabel = activeDrawingToolButton.querySelector("span");
      if (activeDrawingToolIcon) activeDrawingToolBadge.append(activeDrawingToolIcon.cloneNode(true));
      if (activeDrawingToolLabel?.textContent)
        activeDrawingToolBadge.append(activeDrawingToolLabel.textContent);
    }
    (activeDrawingToolBadge.hidden = !activeDrawingToolButton),
      drawingToolSection.classList.toggle("has-active", Boolean(activeDrawingToolButton));
  }
}
function selectStudioTool(toolId: any) {
  if (!(toolHelpMessages as any)[toolId]) return;
  if (
    (toolId.startsWith("courtyard-") &&
      appCtx.activeLibraryCategory !== "courtyard" &&
      setAssetCategory("courtyard"),
    appCtx.activeLibraryCategory === "courtyard" && !courtyardToolAllowed2(toolId))
  ) {
    showToast("庭院编辑中户型已锁定，请先切回家居或电器。");
    return;
  }

  if (appCtx.activeLibraryCategory === "light" && toolId !== "select" && toolId !== "pan") {
    showToast("灯光编辑中户型已锁定，请先切回家居、电器或庭院。");
    return;
  }
  const shouldWarnOpenWall = appCtx.activeToolName === "wall" && toolId !== "wall" && appCtx.wallSegmentCount > 0;
  ((appCtx.activeToolName = toolId),
    planPainter?.setTool(toolId),
    (planCanvasElement.dataset.tool = toolId),
    (planCanvasElement.style.cursor = ""));
  for (const toolButton of toolButtons)
    (toolButton.classList.toggle("active", toolButton.dataset.tool === toolId),
      toolButton.setAttribute("aria-pressed", String(toolButton.dataset.tool === toolId)));
  patchStudioFacadeState({ activeTool: toolId });
  patchStudioFacadeState({ activeTool: toolId });
  (closeDrawingToolGroups(),
    syncDrawingToolGroupStates(),
    ([activeToolLabel.textContent, toolHelpElement.textContent] =
    appCtx.activeLibraryCategory === "light" && toolId === "select"
      ? ["灯光编辑", "户型已锁定；框选多盏灯后可整体拖动，Shift 锁轴，Option/Alt 复制"]
      : appCtx.activeLibraryCategory === "courtyard" && toolId === "select"
        ? ["庭院编辑", "其他对象已锁定；可选择、移动、框选庭院对象，切换分类恢复编辑"]
        : (toolHelpMessages as any)[toolId]),
    (finishWallButton.hidden = toolId !== "wall" || !appCtx.segmentStartPoint),
    toolId !== "wall" && refreshPreviewScene(),
    toolId !== "scale" && (appCtx.previewEndPoint = null),
    (appCtx.snapHit = null),
    (appCtx.windowPlacement = null),
    (appCtx.doorPlacement = null),
    (appCtx.railingPlacement = null),
    refreshStudioView(),
    shouldWarnOpenWall &&
      showToast("当前墙线未闭合，不会生成地面；如果绘制的是隔墙，可以忽略此提醒。", "warning"));
}
function ensureCalibrationReady(fallbackToolId = "scale") {
  return getPixelsPerMeter()
    ? true
    : (showToast("请先画一条参考线并填写真实长度。", "error"),
      selectStudioTool(fallbackToolId),
      false);
}
function clearSelection() {
  if (
    ((appCtx.selectedItems = appCtx.selectedItems.filter(isSelectionAllowed)),
    appCtx.selectedItem && !isSelectionAllowed(appCtx.selectedItem) && refreshSelection(),
    appCtx.selectedItems.length)
  ) {
    const qa2 = getCurrentPreviewScope();
    deselectAll();
    const clearSelectionWallIdSet = new Set(
        appCtx.selectedItems
          .filter((wallDrawingEntry: any) => wallDrawingEntry.kind === "wall")
          .map((wallDrawing: any) => wallDrawing.id),
      ),
      windowIdSet = new Set(
        appCtx.selectedItems
          .filter((windowDrawingEntry: any) => windowDrawingEntry.kind === "window")
          .map((windowDrawing: any) => windowDrawing.id),
      ),
      doorIdSet = new Set(
        appCtx.selectedItems
          .filter((doorDrawingEntry: any) => doorDrawingEntry.kind === "door")
          .map((doorDrawing: any) => doorDrawing.id),
      ),
      railingIdSet = new Set(
        appCtx.selectedItems
          .filter((railingDrawingEntry: any) => railingDrawingEntry.kind === "railing")
          .map((railingDrawing: any) => railingDrawing.id),
      ),
      itemIdSet = new Set(
        appCtx.selectedItems
          .filter((itemDrawingEntry: any) => itemDrawingEntry.kind === "item")
          .map((itemDrawing: any) => itemDrawing.id),
      );
    ((appCtx.studioState.walls = appCtx.studioState.walls.filter(
      (removedWall) => !clearSelectionWallIdSet.has(removedWall.id),
    )),
      (appCtx.studioState.windows = appCtx.studioState.windows.filter(
        (windowItem) =>
          !windowIdSet.has(windowItem.id) && !clearSelectionWallIdSet.has(windowItem.wallId),
      )),
      (appCtx.studioState.doors = appCtx.studioState.doors.filter(
        (doorItem) => !doorIdSet.has(doorItem.id) && !clearSelectionWallIdSet.has(doorItem.wallId),
      )),
      (appCtx.studioState.railings = appCtx.studioState.railings.filter(
        (railingItem) =>
          !railingIdSet.has(railingItem.id) && !clearSelectionWallIdSet.has(railingItem.wallId),
      )),
      (appCtx.studioState.items = appCtx.studioState.items.filter(
        (removedItem) => !itemIdSet.has(removedItem.id),
      )),
      clearSelectionWallIdSet.size && rebuildWallIndex(),
      refreshSelection(),
      refreshScopeItems(qa2),
      markDocumentDirty());
    return;
  }
  const at5 = getSelectedObject();
  if (!at5 || !appCtx.selectedItem) return;
  const qa3 = getCurrentPreviewScope();
  (deselectAll(),
    appCtx.selectedItem.kind === "wall"
      ? ((appCtx.studioState.walls = appCtx.studioState.walls.filter((wallById) => wallById.id !== at5.id)),
        (appCtx.studioState.windows = appCtx.studioState.windows.filter(
          (windowByWallId) => windowByWallId.wallId !== at5.id,
        )),
        (appCtx.studioState.doors = appCtx.studioState.doors.filter(
          (doorByWallId) => doorByWallId.wallId !== at5.id,
        )),
        (appCtx.studioState.railings = appCtx.studioState.railings.filter(
          (railingByWallId) => railingByWallId.wallId !== at5.id,
        )),
        rebuildWallIndex())
      : appCtx.selectedItem.kind === "window"
        ? (appCtx.studioState.windows = appCtx.studioState.windows.filter(
            (windowById) => windowById.id !== at5.id,
          ))
        : appCtx.selectedItem.kind === "door"
          ? (appCtx.studioState.doors = appCtx.studioState.doors.filter((doorById) => doorById.id !== at5.id))
          : appCtx.selectedItem.kind === "railing"
            ? (appCtx.studioState.railings = appCtx.studioState.railings.filter(
                (railingById) => railingById.id !== at5.id,
              ))
            : (appCtx.studioState.items = appCtx.studioState.items.filter(
                (excludedItem) => excludedItem.id !== at5.id,
              )),
    refreshSelection(),
    refreshScopeItems(qa3),
    markDocumentDirty());
}
function finalizeAddedItem(addedItem: any, movingIds = [addedItem.id]) {
  return snapItemToSurface2({
    THREE: ns2,
    item: addedItem,
    items: appCtx.studioState.items,
    pixelsPerMeter: getPixelsPerMeter(),
    enabled: isSnapEnabled() && appCtx.studioState.settings.snapSurfaces !== false,
    movingIds: movingIds,
    mountModel: (mountedModelItem: any, externalModel: any) =>
      externalModelRegistry.addExternalItemModel(
        mountedModelItem,
        externalModel,
        materialLoadOptionsForItem(mountedModelItem),
      ),
  });
}
function createSceneItem(
  sceneItemType: any,
  itemPosition: any,
  sizeOverrides: SceneItemSizeOverrides = {},
) {
  const typeDefinition = (itemTypeCatalog as any)[sceneItemType];
  if (!typeDefinition || !ensureCalibrationReady()) return;
  if (
    appCtx.activeLibraryCategory === "courtyard" &&
    !isCourtyardPlanItem2({
      type: sceneItemType,
    })
  ) {
    showToast("庭院编辑中其他对象已锁定，请先切换分类。");
    return;
  }
  const downlight3 = (lightPresetCatalog as any)[sceneItemType] || lightPresetCatalog.downlight,
    _a2 = lampItemTypeSet.has(sceneItemType) ? getLightGroups() : null,
    ft2 = captureUndoSnapshot(),
    createdItem = {
      id: generateId("item"),
      type: sceneItemType,
      x: itemPosition.x,
      y: itemPosition.y,
      rotation: 0,
      width: sizeOverrides.width ?? typeDefinition.width,
      depth: sizeOverrides.depth ?? typeDefinition.depth,
      height: typeDefinition.height,
      elevation: typeDefinition.elevation || 0,
      color: typeDefinition.color,
      ...(sceneItemType === "planlabel"
        ? {
            title: "家庭总览",
            subtitle: "HOME PLAN",
            titleSpacing: 1.05,
            subtitleSpacing: 0.08,
            lineLength: 0.86,
            labelColor: planLabelDefaultColor,
          }
        : {}),
      ...(["camera", "presence"].includes(sceneItemType)
        ? {
            verticalRotation: 0,
          }
        : {}),
      ...(sceneItemType === "tv"
        ? {
            screenEnabled: true,
            screenLayerName: "电视画面 " + (getScreenLightGroups().length + 1),
            tvMountStyle: "standard",
          }
        : {}),
      ...(["smallcar", "suv", "scooter"].includes(sceneItemType)
        ? {
            chargingEnabled: false,
            chargingLayerName: "汽车充电 " + (getChargingLightGroups().length + 1),
          }
        : {}),
      ...(sceneItemType === "curtain"
        ? {
            curtainPosition: "split",
            ...normalizeCurtainTrack2({
              curtainFabric: "cloth",
            }),
          }
        : {}),
      ...(openStairTypeSet.has(sceneItemType)
        ? {
            stairDirection: "right",
          }
        : {}),
      ...(sceneItemType === "shoecabinet"
        ? {
            shoeCabinetMirrored: false,
          }
        : {}),
      ...(sceneItemType === "pillar"
        ? {
            pillarShape: typeDefinition.pillarShape,
            pillarAxis: typeDefinition.pillarAxis,
          }
        : {}),
      ...(sceneItemType === "mural"
        ? {
            muralStyle: typeDefinition.muralStyle || "bauhaus",
          }
        : {}),
      ...(sceneItemType === "featurewall"
        ? {
            wallStyle: typeDefinition.wallStyle || "marble",
          }
        : {}),
      ...(sceneItemType === "sofa-l"
        ? {
            sofaChaiseSide: "right",
          }
        : {}),
      ...(roundTableTypeSet.has(sceneItemType)
        ? {
            roundTableTurntable: false,
          }
        : {}),
      ...(lampItemTypeSet.has(sceneItemType)
        ? {
            lightGroupId: _a2!.id,
            verticalRotation: 0,
            ...(sceneItemType === "striplight"
              ? {
                  stripAxis: DEFAULT_STRIP_AXIS2,
                  stripRollRotation: 0,
                  lightSourceVisible: true,
                }
              : {}),
            lightTemperature: downlight3.temperature,
            lightBrightness: downlight3.brightness,
            lightRange: downlight3.range,
            lightAngle: downlight3.angle,
          }
        : {}),
    };
  (pushUndoEntry([createdItem]),
    finalizeAddedItem(createdItem),
    anchorGate2(createdItem, appCtx.studioState.items, getPixelsPerMeter(), 24 / appCtx.planView.zoom),
    appCtx.studioState.items.push(createdItem),
    syncCourtyardGates2(appCtx.studioState.items, getPixelsPerMeter()),
    validateSelectionChange(ft2) &&
      (applyPlacementChange(ft2),
      selectSceneObject("item", createdItem.id),
      appCtx.activeToolName !== "courtyard-gate" && selectStudioTool("select"),
      refreshScopeItems(resolvePreviewScope(createdItem)),
      markDocumentDirty()));
}
function duplicateSelection() {
  const duplicateSourceIdSet = new Set([
      ...(appCtx.selectedItem?.kind === "item" ? [appCtx.selectedItem.id] : []),
      ...appCtx.selectedItems
        .filter((duplicateDrawingEntry: any) => duplicateDrawingEntry.kind === "item")
        .map((duplicateDrawing: any) => duplicateDrawing.id),
    ]),
    duplicateItems = appCtx.studioState.items.filter(
      (filteredSceneItem) =>
        duplicateSourceIdSet.has(filteredSceneItem.id) && isPlanItemVisible(filteredSceneItem),
    );
  if (!duplicateItems.length) {
    showToast("请先选择要复制的灯具、家具或电器。");
    return;
  }
  const ft3 = captureUndoSnapshot(),
    duplicateOffset = (getPixelsPerMeter() || 100) * 0.12,
    duplicateClones = duplicateItems.map((sourceItem) => ({
      ...structuredClone(sourceItem),
      id: generateId("item"),
      x: sourceItem.x + duplicateOffset,
      y: sourceItem.y + duplicateOffset,
    }));
  (remapCourtyardAttachments2(duplicateItems, duplicateClones),
    pushUndoEntry(duplicateClones),
    appCtx.studioState.items.push(...duplicateClones),
    validateSelectionChange(ft3) &&
      (applyPlacementChange(ft3),
      duplicateClones.length === 1
        ? selectSceneObject("item", duplicateClones[0].id)
        : ((appCtx.selectedItem = null),
          (appCtx.selectedItems = duplicateClones.map((clonedItem) => ({
            kind: "item",
            id: clonedItem.id,
          })))),
      refreshScopeItems(
        classifySelectionScope(
          duplicateClones.map((clonedItemRecord) => ({
            kind: "item",
            id: clonedItemRecord.id,
          })),
        ),
      ),
      markDocumentDirty(),
      showToast("已复制 " + duplicateClones.length + " 个物件。")));
}
function collectSelectedPlanItems() {
  const planItemIdSet = new Set([
      ...(appCtx.selectedItem?.kind === "item" ? [appCtx.selectedItem.id] : []),
      ...appCtx.selectedItems
        .filter((planDrawingEntry: any) => planDrawingEntry.kind === "item")
        .map((planDrawing: any) => planDrawing.id),
    ]);
  return appCtx.studioState.items.filter(
    (candidateSceneItem) =>
      planItemIdSet.has(candidateSceneItem.id) && isPlanItemVisible(candidateSceneItem),
  );
}
function mirrorSelection() {
  const zy2 = collectSelectedPlanItems();
  if (!zy2.length) {
    showToast("请先选择要复制的灯具、家具或电器。");
    return;
  }
  appCtx.clipboardItems = zy2.map((mirroredSourceItem) => structuredClone(mirroredSourceItem));
  const ae7 = getActiveFloor();
  ((appCtx.clipboardSourceFloor = {
    id: ae7.id,
    originX: ae7.originX,
    originY: ae7.originY,
    offsetX: ae7.offsetX,
    offsetZ: ae7.offsetZ,
    rotation: ae7.rotation,
    scene: {
      calibration: structuredClone(appCtx.studioState.calibration),
    },
  }),
    (appCtx.pasteOffsetFactor = 0),
    showToast("已复制 " + appCtx.clipboardItems.length + " 个物件，按 ⌘/Ctrl+V 粘贴。"));
}
function rotateSelection() {
  if (!appCtx.clipboardItems.length) {
    showToast("暂无可粘贴的物件。");
    return;
  }
  if (
    appCtx.clipboardItems.some(
      (validatedPlanItem: any) =>
        validatedPlanItem.type === "flooropening" || isCourtyardDrawing2(validatedPlanItem),
    ) &&
    !ensureCalibrationReady()
  )
    return;
  if (
    appCtx.activeLibraryCategory === "courtyard" &&
    appCtx.clipboardItems.some((courtyardPlanItem: any) => !isCourtyardPlanItem2(courtyardPlanItem))
  ) {
    showToast("庭院编辑中只能粘贴庭院对象，请先切换分类。");
    return;
  }
  const every = appCtx.clipboardItems.every((planItemEntry: any) => lampItemTypeSet.has(planItemEntry.type));
  every && appCtx.activeLibraryCategory !== "light"
    ? setAssetCategory("light")
    : !every && appCtx.activeLibraryCategory === "light" && setAssetCategory("home");
  const ft4 = captureUndoSnapshot();
  appCtx.pasteOffsetFactor += 1;
  const selectionOffset = (getPixelsPerMeter() || 100) * 0.12 * appCtx.pasteOffsetFactor,
    movedClones = appCtx.clipboardItems.map((movedSourceItem: any) => ({
      ...structuredClone(movedSourceItem),
      id: generateId("item"),
      x: movedSourceItem.x + selectionOffset,
      y: movedSourceItem.y + selectionOffset,
      ...((movedSourceItem.type === "flooropening" ||
        isCourtyardDrawing2(movedSourceItem) ||
        movedSourceItem.courtyardGate) &&
      appCtx.clipboardSourceFloor &&
      appCtx.clipboardSourceFloor.id !== getActiveFloor().id
        ? {
            ...worldPointForFloor(movedSourceItem, appCtx.clipboardSourceFloor, getActiveFloor()),
            rotation:
              movedSourceItem.rotation +
              finite2(appCtx.clipboardSourceFloor.rotation, 0) -
              finite2(getActiveFloor().rotation, 0),
          }
        : {}),
      ...(lampItemTypeSet.has(movedSourceItem.type) &&
      !appCtx.studioState.lightGroups.some((lightGroup) => lightGroup.id === movedSourceItem.lightGroupId)
        ? {
            lightGroupId: getLightGroups().id,
          }
        : {}),
    }));
  (remapCourtyardAttachments2(appCtx.clipboardItems, movedClones),
    pushUndoEntry(movedClones),
    appCtx.studioState.items.push(...movedClones),
    validateSelectionChange(ft4) &&
      (applyPlacementChange(ft4),
      movedClones.length === 1
        ? selectSceneObject("item", movedClones[0].id)
        : ((appCtx.selectedItem = null),
          (appCtx.selectedItems = movedClones.map((movedItem: any) => ({
            kind: "item",
            id: movedItem.id,
          })))),
      refreshScopeItems(
        classifySelectionScope(
          movedClones.map((movedItemRecord: any) => ({
            kind: "item",
            id: movedItemRecord.id,
          })),
        ),
      ),
      markDocumentDirty(),
      showToast("已粘贴 " + movedClones.length + " 个物件。")));
}
async function loadBackgroundImage() {
  const backgroundLoadToken = ++appCtx.backgroundLoadRequestId;
  if (((appCtx.backgroundImageSource = null), !appCtx.studioState.background?.url)) return;
  const url = appCtx.studioState.background.url;
  await new Promise<void>((resolveLoad) => {
    let isLoadResolved = false;
    const handleLoadTimeout = () => {
        isLoadResolved || ((isLoadResolved = true), resolveLoad());
      },
      image = new Image(),
      loadTimeoutId = window.setTimeout(handleLoadTimeout, 2000);
    (image.addEventListener(
      "load",
      () => {
        if (
          backgroundLoadToken !== appCtx.backgroundLoadRequestId ||
          appCtx.studioState.background?.url !== url
        ) {
          handleLoadTimeout();
          return;
        }
        ((appCtx.backgroundImageSource = image),
          window.clearTimeout(loadTimeoutId),
          isLoadResolved ? refreshStudioView() : handleLoadTimeout());
      },
      {
        once: true,
      },
    ),
      image.addEventListener(
        "error",
        () => {
          (window.clearTimeout(loadTimeoutId),
            backgroundLoadToken === appCtx.backgroundLoadRequestId &&
              showToast("底图加载失败，请重新导入。", "error"),
            handleLoadTimeout());
        },
        {
          once: true,
        },
      ),
      (image.src = url));
  });
}
async function importBackgroundFile(backgroundFile: any) {
  if (!backgroundFile || importPlanButton.disabled) return;
  const importOptions: BackgroundImportDiagnostics = {},
    ae8 = getActiveFloor(),
    background = appCtx.studioState.background,
    backgroundImportErrorElement = selectElement("#background-import-error");
  ((backgroundImportErrorElement.hidden = true),
    (importPlanButton.disabled = true),
    (importPlanButton.textContent = "处理中…"));
  try {
    const preparedBackground = await prepareBackground2(backgroundFile, importOptions);
    ((importOptions.stage = "上传图片"), (importPlanButton.textContent = "上传中…"));
    const uploadResponse = await withRequestTimeout2(120000, (abortSignal) =>
      fetchStudioApi("/assets/user", {
        method: "POST",
        body: preparedBackground.file,
        signal: abortSignal,
        headers: {
          "Content-Type": preparedBackground.file.type,
          "X-File-Name": encodeURIComponent(preparedBackground.file.name),
        },
      }),
    );
    ((importOptions.stage = "加载底图"),
      (importOptions.uploadSize = uploadResponse.width + " × " + uploadResponse.height),
      (importPlanButton.textContent = "加载中…"));
    const importedImage = await loadImportedImage2(uploadResponse.url),
      width3 = importedImage.naturalWidth || uploadResponse.width,
      height3 = importedImage.naturalHeight || uploadResponse.height;
    if (getActiveFloor() !== ae8 || appCtx.studioState.background !== background) {
      showToast("当前户型已切换或底图已改变，请重新导入。", "warning");
      return;
    }
    (deselectAll(),
      (appCtx.studioState.background = {
        assetId: uploadResponse.assetId,
        url: uploadResponse.url,
        name: uploadResponse.name,
        width: width3,
        height: height3,
      }));
    const ae9 = getActiveFloor();
    (ae9 &&
      !ae9.originInitialized &&
      ((ae9.originX = width3 / 2), (ae9.originY = height3 / 2), (ae9.originInitialized = true)),
      (appCtx.studioState.settings.backgroundVisible = true),
      ++appCtx.backgroundLoadRequestId,
      (appCtx.backgroundImageSource = importedImage),
      resetView(),
      refreshScopeItems(),
      markDocumentDirty(),
      selectStudioTool("scale"));
    const join2 = preparedBackground.adjustments.join("，");
    showToast(
      (join2 ? join2 + "。" : "") + "底图已导入，请在图上画一条已知长度的参考线。",
      join2 ? "warning" : "",
    );
  } catch (importError: any) {
    const backgroundFailure = backgroundFailure2(importError, importOptions);
    ((selectElement("#background-import-message").textContent = backgroundFailure.message),
      (selectElement("#background-import-details").value = backgroundFailure.details),
      (backgroundImportErrorElement.hidden = false),
      showToast(backgroundFailure.message, "error"));
  } finally {
    ((importPlanButton.disabled = false), (importPlanButton.textContent = "导入"));
  }
}
/** 当前主题下的视图 / 光照设置：默认值再叠 WARM_WOOD_STYLE（含 warmWood 标记）。 */
type BackgroundViewSettings = typeof defaultViewSettings & Record<string, any>;

function backgroundSettings(): BackgroundViewSettings {
  return appCtx.sceneStyle === "warm-wood"
    ? {
        ...defaultViewSettings,
        ...WARM_WOOD_STYLE2,
      }
    : defaultViewSettings;
}
function positionLightFromAngles(lightObject: any, azimuthDegrees: any, elevationDegrees: any, lightDistance: any) {
  if (!lightObject) return;
  const degToRad = ns2.MathUtils.degToRad(azimuthDegrees),
    degToRad2 = ns2.MathUtils.degToRad(elevationDegrees),
    horizontalDistance = Math.cos(degToRad2) * lightDistance;
  lightObject.position.set(
    Math.cos(degToRad) * horizontalDistance,
    Math.sin(degToRad2) * lightDistance,
    Math.sin(degToRad) * horizontalDistance,
  );
}
function refreshBaseLighting() {
  const yt2 = backgroundSettings(),
    vn2 = appCtx.baseLightingSettings;
  if (!appCtx.threeScene || !appCtx.threeRenderer) return;
  ((appCtx.threeScene.background = null),
    appCtx.threeRenderer.setClearColor(yt2.background, 0),
    (appCtx.threeScene.fog = null),
    (appCtx.threeRenderer.toneMappingExposure = vn2.exposure));


  const intensityScale = isEmbedStageMode ? 0.5 : 1;
  (appCtx.hemisphereLight &&
    (appCtx.hemisphereLight.color.setHex(yt2.warmWood ? 16776178 : 14606046),
    appCtx.hemisphereLight.groundColor.setHex(yt2.warmWood ? 10524035 : 2236962),
    (appCtx.hemisphereLight.intensity = vn2.hemisphereIntensity * intensityScale)),
    appCtx.ambientLight &&
      (appCtx.ambientLight.color.setHex(yt2.warmWood ? 15592162 : 10132122),
      (appCtx.ambientLight.intensity = vn2.ambientIntensity * intensityScale)),
    appCtx.mainDirectionalLight &&
      (appCtx.mainDirectionalLight.color.setHex(yt2.warmWood ? 16774367 : 16053492),
      (appCtx.mainDirectionalLight.intensity = vn2.mainIntensity * intensityScale),
      positionLightFromAngles(appCtx.mainDirectionalLight, vn2.mainAzimuth, vn2.mainElevation, 18.4),
      (appCtx.mainDirectionalLight.shadow.bias = -0.00012),
      (appCtx.mainDirectionalLight.shadow.normalBias = 0.016),
      (appCtx.mainDirectionalLight.shadow.radius = 1.75),
      (appCtx.mainDirectionalLight.shadow.blurSamples = 4),
      appCtx.isGroundShadowEnabled &&
        ((appCtx.mainDirectionalLight.shadow.radius = 1.2), (appCtx.mainDirectionalLight.shadow.blurSamples = 8)),
      (appCtx.mainDirectionalLight.shadow.intensity = vn2.mainShadowIntensity)),
    appCtx.fillDirectionalLight &&
      (appCtx.fillDirectionalLight.color.setHex(yt2.warmWood ? 14346221 : 10921638),
      (appCtx.fillDirectionalLight.intensity = vn2.fillIntensity * intensityScale),
      positionLightFromAngles(appCtx.fillDirectionalLight, vn2.fillAzimuth, vn2.fillElevation, 15.2)),
    appCtx.topDirectionalLight &&
      (appCtx.topDirectionalLight.color.setHex(yt2.warmWood ? 16776693 : 16250871),
      (appCtx.topDirectionalLight.intensity = vn2.topIntensity * intensityScale),
      positionLightFromAngles(appCtx.topDirectionalLight, vn2.topAzimuth, vn2.topElevation, 16.1)));
}
function setShadowQualityHigh(isHighQuality: any) {
  const isHighQualityEnabled = isHighQuality === true;
  if (isHighQualityEnabled !== appCtx.isGroundShadowEnabled) {
    if (isHighQualityEnabled && appCtx.mainDirectionalLight?.shadow?.camera) {
      const camera = appCtx.mainDirectionalLight.shadow.camera;
      appCtx.savedShadowCamera = {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
        near: camera.near,
        far: camera.far,
      };
    }
    if (
      ((appCtx.isGroundShadowEnabled = isHighQualityEnabled),
      refreshBaseLighting(),
      !isHighQualityEnabled && appCtx.savedShadowCamera && appCtx.mainDirectionalLight?.shadow?.camera)
    ) {
      const camera2 = appCtx.mainDirectionalLight.shadow.camera;
      (Object.assign(camera2, appCtx.savedShadowCamera),
        camera2.updateProjectionMatrix(),
        (appCtx.savedShadowCamera = null));
    }
    (appCtx.mainDirectionalLight?.shadow && (appCtx.mainDirectionalLight.shadow.needsUpdate = true),
      appCtx.threeRenderer?.domElement &&
        (appCtx.threeRenderer.domElement.dataset.exportShadowQuality = isHighQualityEnabled
          ? "high"
          : "realtime"));
  }
}
function clampShadowMapSize(shadowMapSize: any) {
  if (!appCtx.isGroundShadowEnabled) return shadowMapSize;
  const maxTextureSize = Math.max(
    1,
    Math.floor(finite2(appCtx.threeRenderer?.capabilities?.maxTextureSize, minTextureSize)),
  );
  return Math.min(maxTextureSize, Math.max(shadowMapSize, minTextureSize));
}
function syncBaseLightingControls() {
  for (const baseLightControlInput of baseLightControlInputs) {
    const baseLightValue = (appCtx.baseLightingSettings as any)[baseLightControlInput.dataset.baseLightControl!],
      isIntegerStep = baseLightControlInput.step === "5";
    syncControlValue2(
      baseLightControlInput,
      isIntegerStep ? Math.round(baseLightValue) : Number(baseLightValue.toFixed(2)),
    );
  }
}
function applyBaseLighting(baseLightingConfig: any) {
  const vn3 = appCtx.baseLightingSettings;
  ((appCtx.baseLightingSettings = normalizeBaseLighting2(baseLightingConfig)),
    syncBaseLightingControls(),
    refreshBaseLighting(),
    refreshSceneRender({
      shadows: Object.keys(DEFAULT_BASE_LIGHTING2).some(
        (lightingKey) => (vn3 as any)[lightingKey] !== (appCtx.baseLightingSettings as any)[lightingKey],
      ),
    }));
}
function saveBaseLightingEdit() {
  if (!appCtx.studioProject || !baseLightControlsElement) return;
  const en2 = exportDialogElement?.open ? exportDialogElement : document.body;
  (baseLightControlsElement.parentElement !== en2 && en2.append(baseLightControlsElement),
    baseLightControlsElement.hidden && applyBaseLighting(appCtx.studioProject.baseLighting),
    (baseLightControlsElement.hidden = false));
  const panelBoundingRect = baseLightControlsElement.getBoundingClientRect();
  (panelBoundingRect.right > window.innerWidth - 8 ||
    panelBoundingRect.bottom > window.innerHeight - 8 ||
    panelBoundingRect.left < 8 ||
    panelBoundingRect.top < 8) &&
    ((baseLightControlsElement.style.right = "auto"),
    (baseLightControlsElement.style.left =
      clamp2(
        panelBoundingRect.left,
        8,
        Math.max(8, window.innerWidth - panelBoundingRect.width - 8),
      ) + "px"),
    (baseLightControlsElement.style.top =
      clamp2(
        panelBoundingRect.top,
        8,
        Math.max(8, window.innerHeight - panelBoundingRect.height - 8),
      ) + "px"));
}
function openLightingDialog() {
  baseLightControlsElement &&
    (appCtx.studioProject && applyBaseLighting(appCtx.studioProject.baseLighting),
    (baseLightControlsElement.hidden = true));
}
function confirmLightingDialog() {
  if (!appCtx.studioProject) return;
  const normalizedBaseLighting = normalizeBaseLighting2(appCtx.baseLightingSettings);
  ((appCtx.studioProject.baseLighting = normalizedBaseLighting),
    applyBaseLighting(normalizedBaseLighting),
    markDocumentDirty(),
    appCtx.lightPreviewWorker?.postMessage({
      type: "base-lighting-saved",
      lighting: normalizedBaseLighting,
    }),
    flushAutosave(),
    showToast("基础光设置已保存，导图和自动化控件已同步。", "success"));
}
function updateBaseLightingFromInput(lightingInput: any) {
  const baseLightControl = lightingInput.dataset.baseLightControl;
  baseLightControl in appCtx.baseLightingSettings &&
    ((appCtx.baseLightingSettings = normalizeBaseLighting2({
      ...appCtx.baseLightingSettings,
      [baseLightControl]: finite2(lightingInput.value, (appCtx.baseLightingSettings as any)[baseLightControl]),
    })),
    refreshBaseLighting(),
    refreshSceneRender({
      shadows: true,
    }));
}
function cameraSettings() {
  return getPreviewFloorMode() === "all"
    ? appCtx.studioProject.combinedCameraSettings
    : appCtx.studioState.settings;
}
function getCameraMode() {
  return cameraSettings()?.cameraMode === "perspective" ? "perspective" : "orthographic";
}
function getCameraView() {
  return cameraSettings()?.cameraView === "top" ? "top" : "free";
}
function getCameraTopRotation() {
  return (
    (((Math.round(finite2(cameraSettings()?.cameraTopRotation, 0) / 90) * 90) % 360) + 360) % 360
  );
}
function buildCameraUpVector(topRotationDegrees = getCameraTopRotation()) {
  const degToRad3 = ns2.MathUtils.degToRad(topRotationDegrees);
  return new ns2.Vector3(Math.sin(degToRad3), 0, -Math.cos(degToRad3));
}
function getCameraFocalLength() {
  return clamp2(finite2(cameraSettings()?.cameraFocalLength, 50), 18, 120);
}
function collectActiveLightEntries() {
  return collectLampEntries()
    .filter(
      ({ item: lightItem, group: lightGroupDefinition }: any) =>
        lightGroupDefinition?.enabled !== false && finite2(lightItem.lightBrightness, 0) > 0,
    )
    .map(({ item: lightItemRef }: any) => lightItemRef);
}
function assessRenderBudget() {
  const bf2 = collectActiveLightEntries(),
    rendererCanvas = appCtx.threeRenderer?.domElement,
    previewPixelCount =
      rendererCanvas?.width && rendererCanvas?.height
        ? rendererCanvas.width * rendererCanvas.height
        : Math.max(window.innerWidth * window.innerHeight * 0.32, 120000);
  return {
    count: bf2.length,
    cost: adaptiveLightRenderCost2(
      bf2.map((lightEntry: any) => ({
        type: lightEntry.type,
        angle: lightEntry.lightAngle,
        brightness: lightEntry.lightBrightness,
        enabled: true,
      })),
    ),
    budget: adaptiveDeviceLightBudget2({
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      previewPixels: previewPixelCount,
    }),
  };
}
function canRenderScene() {
  if (isEmbeddedStage)
    return (
      (appCtx.isAdaptiveRenderActive = true),
      (appCtx.hasAdaptiveRenderStarted = true),
      {
        count: 0,
        cost: 0,
        budget: 0,
      }
    );
  const zl2 = assessRenderBudget(),
    Yn2 = appCtx.isAdaptiveRenderActive;
  return (
    appCtx.hasAdaptiveRenderStarted
      ? appCtx.isAdaptiveRenderActive &&
        zl2.cost < Math.min(zl2.budget * 0.68, Math.max(appCtx.adaptiveRenderCostBudget * 0.55, 1)) &&
        ((appCtx.isAdaptiveRenderActive = false),
        (appCtx.adaptiveRenderCostBudget = 0),
        (appCtx.slowFrameStreak = 0))
      : (appCtx.hasAdaptiveRenderStarted = true),
    Yn2 &&
      !appCtx.isAdaptiveRenderActive &&
      ((appCtx.modelRevisionCounter += 1),
      (appCtx.isCacheReady = false),
      (appCtx.isFrameDirty = false),
      setFadeOverlay(false)),
    zl2
  );
}
function areLightsEnabled() {
  return isEmbedStageMode
    ? false
    : (canRenderScene(),
      appCtx.isAdaptiveRenderActive &&
        !appCtx.isEnvironmentActive &&
        !appCtx.isCurtainMoving &&
        !appCtx.isVacuumMoving &&
        !appCtx.isLockMoving &&
        !appCtx.isBackgroundMoving);
}
function applyAdaptiveQuality(frameAssessment: any) {
  appCtx.isAdaptiveRenderActive ||
    !frameAssessment?.sufficient ||
    ((appCtx.isAdaptiveRenderActive = true),
    (appCtx.hasAdaptiveRenderStarted = true),
    (appCtx.adaptiveRenderCostBudget = assessRenderBudget().cost),
    (appCtx.modelRevisionCounter += 1),
    (appCtx.isFrameDirty = true),
    requestStudioRender());
}
function resetFrameSamples() {
  if (appCtx.isAdaptiveRenderActive) return;
  const renderFrameAssessment = assessAdaptiveRenderFrames2(appCtx.frameDurationSamples);
  if (!renderFrameAssessment.sufficient) return;
  const zl3 = assessRenderBudget(),
    renderCostRatio = zl3.cost / Math.max(zl3.budget, 1),
    qualityStepLimit = renderCostRatio >= 1.8 ? 3 : renderCostRatio >= 1 ? 4 : 5;
  (renderFrameAssessment.severe
      ? (appCtx.slowFrameStreak = qualityStepLimit)
      : renderFrameAssessment.slow
        ? (appCtx.slowFrameStreak += 1)
        : renderFrameAssessment.smooth && (appCtx.slowFrameStreak = 0),
    appCtx.slowFrameStreak >= qualityStepLimit && applyAdaptiveQuality(renderFrameAssessment));
}
function recordFrameTime(frameTimestamp = performance.now()) {
  if (
    (!appCtx.isRenderSuppressed && !(isEmbeddedStage && appCtx.isPrewarming)) ||
    appCtx.pendingRuntimeSettings ||
    appCtx.isAdaptiveRenderActive ||
    !collectActiveLightEntries().length
  ) {
    appCtx.samplingWindowStartMs = 0;
    return;
  }
  if (appCtx.samplingWindowStartMs > 0) {
    const frameDeltaMs = frameTimestamp - appCtx.samplingWindowStartMs;
    frameDeltaMs >= 8 &&
      (frameDeltaMs <= 120 || (isEmbeddedStage && frameDeltaMs <= 2000)) &&
      appCtx.frameDurationSamples.push(Math.min(frameDeltaMs, 120));
  }
  ((appCtx.samplingWindowStartMs = frameTimestamp),
    !(appCtx.frameDurationSamples.length < 24) &&
      (resetFrameSamples(), appCtx.frameDurationSamples.splice(0, 12)));
}
function getPreviewSyncMode() {
  return appCtx.studioState.settings?.livePreviewEnabled !== false;
}
function refreshPreviewSync() {
  const kl2 = getPreviewSyncMode();
  for (const previewSyncButton of previewSyncControls) {
    const isPreviewSyncActive = previewSyncButton.dataset.previewSync === (kl2 ? "live" : "manual");
    (previewSyncButton.classList.toggle("active", isPreviewSyncActive),
      previewSyncButton.setAttribute("aria-pressed", String(isPreviewSyncActive)));
  }
  ((refreshPreviewButton.hidden = kl2),
    (refreshPreviewButton.disabled = !appCtx.isSceneDirty),
    refreshPreviewButton.classList.toggle("is-dirty", appCtx.isSceneDirty),
    (refreshPreviewButton.textContent = appCtx.isSceneDirty ? "待更新 · 更新" : "已更新"));
}
function syncCameraModeControls(cameraMode = getCameraMode()) {
  for (const cameraModeButton of cameraModeControls)
    cameraModeButton.classList.toggle("active", cameraModeButton.dataset.cameraMode === cameraMode);
  syncCameraFocalLengthControl(cameraMode);
}
function syncCameraViewControls(cameraView = getCameraView()) {
  for (const cameraViewButton of cameraViewControls) {
    const isCameraViewActive = cameraViewButton.dataset.cameraView === cameraView;
    (cameraViewButton.classList.toggle("active", isCameraViewActive),
      cameraViewButton.setAttribute("aria-pressed", String(isCameraViewActive)));
  }
  for (const cameraViewDependentButton of cameraRotateTopControls)
    cameraViewDependentButton.disabled = cameraView !== "top";
}
function syncCameraFocalLengthControl(cameraModeName = getCameraMode()) {
  for (const focalLengthInput of cameraFocalLengthControls)
    (syncControlValue2(focalLengthInput, Math.round(getCameraFocalLength())),
      (focalLengthInput.disabled = cameraModeName !== "perspective"),
      focalLengthInput
        .closest(".camera-focal-control")
        ?.classList.toggle("is-disabled", focalLengthInput.disabled));
}
function applyCameraFocalLength(
  targetCamera = appCtx.threeCamera,
  focalLengthValue = getCameraFocalLength(),
) {
  targetCamera?.isPerspectiveCamera &&
    targetCamera.setFocalLength(clamp2(finite2(focalLengthValue, 50), 18, 120));
}
function requestStudioRender() {
  if (!appCtx.orbitControls) return;
  const ht2 = areLightsEnabled(),
    at6 = isEmbeddedStage && appCtx.prewarmState && !appCtx.isCapturingLights;
  (appCtx.lightPrecompileController?.setEnabled(isEmbeddedStage || !ht2 || !!at6),
    (appCtx.orbitControls.enableRotate = getCameraView() !== "top"),
    previewQualityStatusElement &&
      ((previewQualityStatusElement.hidden = true),
      (previewQualityStatusElement.title = ""),
      (previewQualityStatusElement.textContent = "")),
    refreshLightPreviewButton &&
      ((refreshLightPreviewButton.hidden = true), (refreshLightPreviewButton.disabled = true)));
}
function computeRenderPixelRatio(isMotionQuality = false) {
  // 参数名历史遗留：true = 运动/交互中的质量档，false = 静置高清档。
  const dprCap = Math.min(window.devicePixelRatio || 1, 1.6);
  const idleRatio = dprCap * (isEmbeddedStage ? appCtx.basePixelRatio : 1);
  if (
    isEmbeddedStage &&
    isMotionQuality &&
    appCtx.adaptivePixelRatio !== null &&
    (!appCtx.isPrewarming || appCtx.isRenderSuppressed)
  )
    return Math.max(idleRatio * appCtx.adaptivePixelRatio, Math.min(idleRatio, 1));
  if (isEmbedStageMode) {
    return isMotionQuality
      ? Math.min(idleRatio, interactionResourcePolicy.motion.maxPixelRatio)
      : idleRatio;
  }
  const Kt2 = isEmbeddedStage && appCtx.isPrewarming;
  let ratio = idleRatio;
  // 运动期不再把 DPR 硬砍到 1；仅在超预算时温和下调，地板不低于 0.85×idle。
  if (isEmbeddedStage && (isMotionQuality || Kt2)) {
    const { cost: zl4, budget: zl5 } = assessRenderBudget();
    zl4 > zl5 &&
      (ratio = Math.min(ratio, clamp2(Math.sqrt(zl5 / zl4) * idleRatio, idleRatio * 0.85, idleRatio)));
  }
  return ratio;
}
const isRenderStatsTest = new URLSearchParams(window.location.search).has("render-stats-test"),
  isPerformanceDiagnostics =
    new URLSearchParams(window.location.search).get("performance-diagnostics") === "1",
  meshStatsByType = new Map(),
  maxFrameSampleCount = 240,
  publishIntervalMs = 750,
  maxPendingGpuQueries = 4,
  diagnosticsState = {
    hud: null as any,
    frameIntervals: [] as any[],
    cpuRenderTimes: [] as any[],
    gpuRenderTimes: [] as any[],
    lastMotionRenderAt: 0,
    floorSwitch: null as any,
    lastPublishAt: 0,
    motionActive: false,
    gpuContext: null as any,
    gpuExtension: null as any,
    gpuQueryActive: null as any,
    gpuQueriesPending: [] as any[],
    gpuStatus: "未初始化",
  };
function updateRenderStatsHud() {
  if (!isRenderStatsTest || !appCtx.threeRenderer) return;
  updateExternalModelDataset();
  const domElement = appCtx.threeRenderer.domElement,
    renderStatsPayload = {
      calls: Number(domElement.dataset.renderCalls || 0),
      triangles: Number(domElement.dataset.renderTriangles || 0),
      instanceSaved: Number(domElement.dataset.instanceDrawCallsSaved || 0),
      staticItemSaved: Number(domElement.dataset.staticItemDrawCallsSaved || 0),
    };
  let homeosRenderStatsTestOutputElement = document.querySelector(
    "#homeos-render-stats-test-output",
  );
  (homeosRenderStatsTestOutputElement ||
    ((homeosRenderStatsTestOutputElement = document.createElement("output")),
    (homeosRenderStatsTestOutputElement.id = "homeos-render-stats-test-output"),
    document.body.append(homeosRenderStatsTestOutputElement)),
    (homeosRenderStatsTestOutputElement.textContent =
      "渲染统计：" +
      renderStatsPayload.calls +
      " 次调用，" +
      renderStatsPayload.triangles +
      " 个三角面；重复实例节省 " +
      renderStatsPayload.instanceSaved +
      " 次，跨模型材质合批节省 " +
      renderStatsPayload.staticItemSaved +
      " 次。"),
    (document.documentElement.dataset.renderStatsTest = JSON.stringify(renderStatsPayload)));
}
function pushBoundedSample(sampleList: any, sampleValue: any) {
  Number.isFinite(sampleValue) &&
    (sampleList.push(sampleValue),
    sampleList.length > maxFrameSampleCount &&
      sampleList.splice(0, sampleList.length - maxFrameSampleCount));
}
function computeAverage(numberList: any) {
  return numberList.length
    ? numberList.reduce((sumAccumulator: any, numberValue: any) => sumAccumulator + numberValue, 0) /
        numberList.length
    : null;
}
function computePercentile(sampleSeries: any, percentileRatio: any) {
  if (!sampleSeries.length) return null;
  const sort = [...sampleSeries].sort((leftSample, rightSample) => leftSample - rightSample),
    percentileIndex = Math.min(
      sort.length - 1,
      Math.max(0, Math.ceil(sort.length * percentileRatio) - 1),
    );
  return sort[percentileIndex];
}
function roundToDigits(numericValue: any, digitCount = 1) {
  return Number.isFinite(numericValue) ? Number(numericValue.toFixed(digitCount)) : null;
}
function ensureDiagnosticsHud() {
  if (!isPerformanceDiagnostics || !appCtx.threeRenderer || diagnosticsState.hud) return;
  const diagnosticsOutputElement = document.createElement("output");
  ((diagnosticsOutputElement.id = "performance-diagnostics"),
    (diagnosticsOutputElement.className = "performance-diagnostics"),
    diagnosticsOutputElement.setAttribute("aria-label", "3D 性能诊断"),
    diagnosticsOutputElement.setAttribute("aria-live", "off"),
    (diagnosticsOutputElement.textContent = "性能诊断初始化中…"),
    selectElement("#preview-3d")?.append(diagnosticsOutputElement),
    (diagnosticsState.hud = diagnosticsOutputElement),
    (diagnosticsState.gpuContext = appCtx.threeRenderer.getContext?.() || null),
    (diagnosticsState.gpuExtension =
      diagnosticsState.gpuContext?.getExtension?.("EXT_disjoint_timer_query_webgl2") || null),
    (diagnosticsState.gpuStatus = diagnosticsState.gpuExtension ? "等待样本" : "不可用"));
}
function beginMotionMeasurement(motionActivity: any) {
  if (!isPerformanceDiagnostics || !motionActivity) return false;
  const xt2 = diagnosticsState,
    gpuContext = xt2.gpuContext,
    gpuExtension = xt2.gpuExtension;
  if (
    !gpuContext ||
    !gpuExtension ||
    xt2.gpuQueryActive ||
    xt2.gpuQueriesPending.length >= maxPendingGpuQueries
  )
    return false;
  try {
    const query = gpuContext.createQuery();
    return query
      ? (gpuContext.beginQuery(gpuExtension.TIME_ELAPSED_EXT, query),
        (xt2.gpuQueryActive = query),
        (xt2.gpuStatus = "采样中"),
        true)
      : false;
  } catch {
    return ((xt2.gpuStatus = "不可用"), false);
  }
}
function endMotionMeasurement(motionSession: any) {
  if (!motionSession) return;
  const xt3 = diagnosticsState,
    gpuContext2 = xt3.gpuContext,
    gpuExtension2 = xt3.gpuExtension,
    gpuQueryActive = xt3.gpuQueryActive;
  if (((xt3.gpuQueryActive = null), !(!gpuContext2 || !gpuExtension2 || !gpuQueryActive)))
    try {
      (gpuContext2.endQuery(gpuExtension2.TIME_ELAPSED_EXT),
        xt3.gpuQueriesPending.push(gpuQueryActive));
    } catch {
      (gpuContext2.deleteQuery?.(gpuQueryActive), (xt3.gpuStatus = "不可用"));
    }
}
function flushGpuQueries() {
  if (!isPerformanceDiagnostics) return;
  const xt4 = diagnosticsState,
    gpuContext3 = xt4.gpuContext,
    gpuExtension3 = xt4.gpuExtension;
  if (!gpuContext3 || !gpuExtension3 || !xt4.gpuQueriesPending.length) return;
  if (gpuContext3.getParameter(gpuExtension3.GPU_DISJOINT_EXT)) {
    for (const gpuQueryHandle of xt4.gpuQueriesPending.splice(0))
      gpuContext3.deleteQuery(gpuQueryHandle);
    ((xt4.gpuRenderTimes.length = 0), (xt4.gpuStatus = "采样失效"));
    return;
  }
  const pendingGpuQueryHandles: any = [];
  for (const pendingGpuQuery of xt4.gpuQueriesPending) {
    if (!gpuContext3.getQueryParameter(pendingGpuQuery, gpuContext3.QUERY_RESULT_AVAILABLE)) {
      pendingGpuQueryHandles.push(pendingGpuQuery);
      continue;
    }
    const queryParameter = gpuContext3.getQueryParameter(pendingGpuQuery, gpuContext3.QUERY_RESULT);
    (pushBoundedSample(xt4.gpuRenderTimes, queryParameter / 1000000),
      gpuContext3.deleteQuery(pendingGpuQuery),
      (xt4.gpuStatus = "可用"));
  }
  xt4.gpuQueriesPending = pendingGpuQueryHandles;
}
function measureFloorSwitchPhase(phaseName: any, phaseTask: any) {
  const floorSwitch = isPerformanceDiagnostics && diagnosticsState.floorSwitch;
  if (!floorSwitch || performance.now() > floorSwitch.until) return phaseTask();
  const now = performance.now();
  try {
    return phaseTask();
  } finally {
    const phaseElapsedMs = performance.now() - now;
    ((floorSwitch.phases ||= {}), (floorSwitch.pendingPhases ||= {}));
    const phaseStats = (floorSwitch.phases[phaseName] ||= {
      calls: 0,
      totalMs: 0,
      maxMs: 0,
    });
    (phaseStats.calls++,
      (phaseStats.totalMs += phaseElapsedMs),
      (phaseStats.maxMs = Math.max(phaseStats.maxMs, phaseElapsedMs)),
      (floorSwitch.pendingPhases[phaseName] =
        (floorSwitch.pendingPhases[phaseName] || 0) + phaseElapsedMs));
  }
}
function recordFloorSwitchTick(tickTimestamp: any, shouldTrackLongFrame = true) {
  const floorSwitch2 = isPerformanceDiagnostics && diagnosticsState.floorSwitch;
  if (!(!floorSwitch2 || performance.now() > floorSwitch2.until)) {
    if (!shouldTrackLongFrame) {
      floorSwitch2.lastTick = null;
      return;
    }
    if (floorSwitch2.lastTick != null) {
      const tickDeltaMs = tickTimestamp - floorSwitch2.lastTick;
      ((floorSwitch2.maxTickMs = Math.max(floorSwitch2.maxTickMs || 0, tickDeltaMs)),
        tickDeltaMs > 50 && (floorSwitch2.tickLongFrames = (floorSwitch2.tickLongFrames || 0) + 1));
    }
    ((floorSwitch2.lastTick = tickTimestamp),
      (floorSwitch2.checksSinceRender = (floorSwitch2.checksSinceRender || 0) + 1));
  }
}
function recordRenderTiming(renderTimestamp: any, cpuRenderMs: any, motionActive: any) {
  if (!isPerformanceDiagnostics) return;
  const xt5 = diagnosticsState,
    floorSwitch3 = xt5.floorSwitch,
    renderNowMs = performance.now();
  if (floorSwitch3 && renderNowMs <= floorSwitch3.until) {
    const renderGapMs = renderNowMs - floorSwitch3.last;
    ((floorSwitch3.last = renderNowMs),
      floorSwitch3.frames++,
      renderGapMs > floorSwitch3.maxMs &&
        (floorSwitch3.worstFrame = {
          renderGapMs: renderGapMs,
          cpuRenderMs: cpuRenderMs,
          checksSinceRender: floorSwitch3.checksSinceRender,
          phases: {
            ...floorSwitch3.pendingPhases,
          },
          programs: appCtx.threeRenderer.info.programs?.length,
          geometries: appCtx.threeRenderer.info.memory.geometries,
          contact: appCtx.contactShadowController
            ? {
                ...appCtx.contactShadowController.stats,
              }
            : null,
        }),
      (floorSwitch3.pendingPhases = {}),
      (floorSwitch3.checksSinceRender = 0),
      (floorSwitch3.maxMs = Math.max(floorSwitch3.maxMs, renderGapMs)),
      renderGapMs > 50 && floorSwitch3.longFrames++,
      (floorSwitch3.cpuMs += cpuRenderMs),
      (floorSwitch3.maxRenderCpuMs = Math.max(floorSwitch3.maxRenderCpuMs || 0, cpuRenderMs)),
      cpuRenderMs > 50 && (floorSwitch3.slowRenderCount = (floorSwitch3.slowRenderCount || 0) + 1));
  }
  if (motionActive) {
    if ((pushBoundedSample(xt5.cpuRenderTimes, cpuRenderMs), xt5.lastMotionRenderAt > 0)) {
      const frameIntervalMs = renderTimestamp - xt5.lastMotionRenderAt;
      frameIntervalMs >= 2 &&
        frameIntervalMs <= 250 &&
        pushBoundedSample(xt5.frameIntervals, frameIntervalMs);
    }
    xt5.lastMotionRenderAt = renderTimestamp;
  } else xt5.lastMotionRenderAt = 0;
}
function snapshotRenderStats() {
  const materialSet = new Set(),
    meshTypeStats: Record<string, { meshes: number; triangles: number }> = {},
    itemTypeByModelId = new Map(
      (appCtx.studioProject?.floors || []).flatMap((sceneFloor: any) =>
        (sceneFloor.scene?.items || []).map((snapshotRenderStatsSceneItem: any) => [
          snapshotRenderStatsSceneItem.id,
          snapshotRenderStatsSceneItem.type,
        ]),
      ),
    ),
    furnitureStatsByKind = {
      before: 0,
      after: 0,
      triangles: 0,
    };
  let meshCount = 0,
    lightCount = 0,
    visibleLightCount = 0,
    activeSpotShadowCount = 0;
  (appCtx.threeScene?.traverse((snapshotRenderStatsSceneObject: any) => {
    if (snapshotRenderStatsSceneObject.isMesh) {
      meshCount += 1;
      let instanceItemType = snapshotRenderStatsSceneObject.userData.instanceItemType;
      for (
        let objectNode = snapshotRenderStatsSceneObject;
        objectNode && !instanceItemType;
        objectNode = objectNode.parent
      )
        instanceItemType =
          itemTypeByModelId.get(objectNode.userData.editorModelId) ||
          objectNode.userData.environmentModelType;
      instanceItemType ||= snapshotRenderStatsSceneObject.userData.reflectionOverlay
        ? "reflection"
        : snapshotRenderStatsSceneObject.userData.exportRole || "other";
      const typeMeshStats = (meshTypeStats[instanceItemType] ||= {
        meshes: 0,
        triangles: 0,
      });
      if (
        (typeMeshStats.meshes++,
        (typeMeshStats.triangles +=
          ((snapshotRenderStatsSceneObject.geometry?.index?.count ??
            snapshotRenderStatsSceneObject.geometry?.attributes.position?.count ??
            0) /
            3) *
          (snapshotRenderStatsSceneObject.isInstancedMesh
            ? snapshotRenderStatsSceneObject.count
            : 1)),
        snapshotRenderStatsSceneObject.userData.runtimeFurnitureStats)
      ) {
        for (const furnitureStatKey of Object.keys(furnitureStatsByKind))
          (furnitureStatsByKind as any)[furnitureStatKey] +=
            snapshotRenderStatsSceneObject.userData.runtimeFurnitureStats[furnitureStatKey];
      }
      const material = Array.isArray(snapshotRenderStatsSceneObject.material)
        ? snapshotRenderStatsSceneObject.material
        : [snapshotRenderStatsSceneObject.material];
      for (const sceneMaterial of material) sceneMaterial && materialSet.add(sceneMaterial);
    }
    snapshotRenderStatsSceneObject.isLight &&
      ((lightCount += 1),
      snapshotRenderStatsSceneObject.visible !== false &&
        finite2(snapshotRenderStatsSceneObject.intensity, 0) > 0 &&
        (visibleLightCount += 1),
      snapshotRenderStatsSceneObject.isSpotLight &&
        snapshotRenderStatsSceneObject.castShadow &&
        snapshotRenderStatsSceneObject.visible !== false &&
        (activeSpotShadowCount += 1));
  }),
    appCtx.threeRenderer?.domElement?.dataset.spotShadowMode === "atlas" &&
      (activeSpotShadowCount = Math.max(
        activeSpotShadowCount,
        Math.floor(finite2(appCtx.threeRenderer.domElement.dataset.activeSpotShadows, 0)),
      )));
  const activeUserLightEntries = collectLampEntries().filter(
    ({ item: lightItemEntry, group: lightGroupEntry }: any) =>
      lightGroupEntry?.enabled !== false && finite2(lightItemEntry.lightBrightness, 0) > 0,
  ).length;
  return {
    meshes: meshCount,
    materials: materialSet.size,
    lights: lightCount,
    visibleLights: visibleLightCount,
    activeUserFixtures: activeUserLightEntries,
    activeSpotShadows: activeSpotShadowCount,
    runtimeFurniture: furnitureStatsByKind,
    meshTypes: meshTypeStats,
  };
}
function publishRenderStats(publishTimestamp = performance.now(), shouldForcePublish = false) {
  if (!isPerformanceDiagnostics || !appCtx.threeRenderer || !diagnosticsState.hud) return;
  const xt6 = diagnosticsState;
  if (!shouldForcePublish && publishTimestamp - xt6.lastPublishAt < publishIntervalMs) return;
  xt6.lastPublishAt = publishTimestamp;
  const domElement2 = appCtx.threeRenderer.domElement,
    bu2 = computeAverage(xt6.frameIntervals),
    ql2 = computePercentile(xt6.frameIntervals, 0.5),
    jy2 = snapshotRenderStats(),
    shaderProgramCount = appCtx.threeRenderer.info.programs?.length,
    statsPublishPayload = {
      enabled: true,
      floorSwitch: xt6.floorSwitch
        ? {
            target: xt6.floorSwitch.target,
            frames: xt6.floorSwitch.frames,
            maxFrameMs: roundToDigits(xt6.floorSwitch.maxTickMs || 0, 2),
            longFrames: xt6.floorSwitch.tickLongFrames || 0,
            maxRenderGapMs: roundToDigits(xt6.floorSwitch.maxMs, 2),
            maxRenderCpuMs: roundToDigits(xt6.floorSwitch.maxRenderCpuMs || 0, 2),
            slowRenderCount: xt6.floorSwitch.slowRenderCount || 0,
            phases: xt6.floorSwitch.phases,
            worstFrame: xt6.floorSwitch.worstFrame,
            averageCpuMs: roundToDigits(
              xt6.floorSwitch.cpuMs / Math.max(1, xt6.floorSwitch.frames),
              2,
            ),
          }
        : null,
      motionActive: xt6.motionActive,
      frame: {
        samples: xt6.frameIntervals.length,
        averageFps: roundToDigits(bu2 ? 1000 / bu2 : null),
        medianFps: roundToDigits(ql2 ? 1000 / ql2 : null),
        p95Ms: roundToDigits(computePercentile(xt6.frameIntervals, 0.95), 2),
      },
      cpuRenderMs: {
        samples: xt6.cpuRenderTimes.length,
        average: roundToDigits(computeAverage(xt6.cpuRenderTimes), 2),
        p95: roundToDigits(computePercentile(xt6.cpuRenderTimes, 0.95), 2),
      },
      gpuRenderMs: {
        supported: !!xt6.gpuExtension,
        status: xt6.gpuStatus,
        samples: xt6.gpuRenderTimes.length,
        average: roundToDigits(computeAverage(xt6.gpuRenderTimes), 2),
        p95: roundToDigits(computePercentile(xt6.gpuRenderTimes, 0.95), 2),
      },
      render: {
        calls: Number(domElement2.dataset.renderCalls || 0),
        triangles: Number(domElement2.dataset.renderTriangles || 0),
        lines: Number(domElement2.dataset.renderLines || 0),
      },
      memory: {
        geometries: Number(appCtx.threeRenderer.info.memory.geometries || 0),
        textures: Number(appCtx.threeRenderer.info.memory.textures || 0),
        programs: Number.isFinite(shaderProgramCount) ? shaderProgramCount : null,
      },
      scene: jy2,
      models: {
        loads: externalModelRegistry.modelLoadState(),
        templates: externalModelRegistry.cacheRepresentation(
          (appCtx.studioProject?.floors || []).flatMap(
            (shouldForcePublishFloorEntry: any) => shouldForcePublishFloorEntry.scene?.items || [],
          ),
        ),
        built: Object.fromEntries(meshStatsByType),
      },
      viewport: {
        devicePixelRatio: roundToDigits(appCtx.threeRenderer.getPixelRatio(), 2),
        canvasWidth: domElement2.width,
        canvasHeight: domElement2.height,
        cssWidth: Math.round(domElement2.clientWidth),
        cssHeight: Math.round(domElement2.clientHeight),
      },
      lighting: {
        adaptiveCacheEnabled: appCtx.isAdaptiveRenderActive,
        residentCacheMode: appCtx.isResidentCacheMode,
        cacheReady: appCtx.isCacheReady,
      },
    },
    frameStatsText = statsPublishPayload.frame.samples
      ? statsPublishPayload.frame.averageFps +
        " / " +
        statsPublishPayload.frame.medianFps +
        " FPS · P95 " +
        statsPublishPayload.frame.p95Ms +
        " ms"
      : "移动镜头后采样",
    status = statsPublishPayload.gpuRenderMs.samples
      ? statsPublishPayload.gpuRenderMs.average +
        " ms · P95 " +
        statsPublishPayload.gpuRenderMs.p95 +
        " ms"
      : statsPublishPayload.gpuRenderMs.status;
  ((xt6.hud.innerHTML = [
    "<strong>3D 性能诊断</strong><span>" +
      (xt6.motionActive ? "交互 / 阻尼中" : "空闲") +
      "</span>",
    "<span>帧率</span><b>" + frameStatsText + "</b>",
    "<span>CPU 提交</span><b>" +
      (statsPublishPayload.cpuRenderMs.average ?? "—") +
      " ms · P95 " +
      (statsPublishPayload.cpuRenderMs.p95 ?? "—") +
      " ms</b>",
    "<span>GPU 渲染</span><b>" + status + "</b>",
    "<span>绘制</span><b>" +
      statsPublishPayload.render.calls +
      " calls · " +
      statsPublishPayload.render.triangles.toLocaleString() +
      " tris</b>",
    "<span>场景</span><b>" + jy2.meshes + " mesh · " + jy2.materials + " 材质实例</b>",
    "<span>资源</span><b>" +
      statsPublishPayload.memory.geometries +
      " 几何 · " +
      statsPublishPayload.memory.textures +
      " 纹理 · " +
      (statsPublishPayload.memory.programs ?? "—") +
      " 程序</b>",
    "<span>灯光</span><b>" +
      jy2.visibleLights +
      "/" +
      jy2.lights +
      " 可见 · " +
      jy2.activeUserFixtures +
      " 用户灯 · " +
      jy2.activeSpotShadows +
      " 阴影</b>",
    "<span>画布</span><b>" +
      statsPublishPayload.viewport.canvasWidth +
      "×" +
      statsPublishPayload.viewport.canvasHeight +
      " · DPR " +
      statsPublishPayload.viewport.devicePixelRatio +
      "</b>",
    "<span>光照缓存</span><b>" +
      (statsPublishPayload.lighting.adaptiveCacheEnabled
        ? "自适应"
        : statsPublishPayload.lighting.residentCacheMode
          ? "驻留"
          : "实时") +
      "</b>",
  ].join("")),
    (document.documentElement.dataset.performanceDiagnostics =
      JSON.stringify(statsPublishPayload)));
}
function updateMotionStats(motionTimestamp: any, isMotionActive: any) {
  isPerformanceDiagnostics &&
    ((diagnosticsState.motionActive = isMotionActive),
    isMotionActive || (diagnosticsState.lastMotionRenderAt = 0),
    flushGpuQueries(),
    publishRenderStats(motionTimestamp));
}
const lightTransitionMs = 150;
function renderStudioFrame() {
  ((appCtx.isLightCacheReady = true), (appCtx.isLightCachePending = false), appCtx.lightingScheduler?.wake());
}
function needsMotionPresentation() {
  return !appCtx.isDisposed && !document.hidden && appCtx.isHighDetailQuality;
}
function bindFrameDriver(frameCallback: any) {
  const domElement3 = appCtx.threeRenderer.domElement,
    handleRendererLost = (rendererLostEvent: any) => {
      (rendererLostEvent.preventDefault(),
        !appCtx.isDisposed &&
          ((appCtx.isDisposed = true),
          emitRuntimeDiagnostic("gpu-lost"),
          appCtx.lightingScheduler?.setAvailable(false),
          (appCtx.modelRevisionCounter += 1),
          (appCtx.isFrameDirty = true),
          window.clearTimeout(appCtx.renderCommitTimeoutId),
          (appCtx.renderCommitTimeoutId = null),
          appCtx.activeLongTask?.cancel(),
          disposeShadowAtlas(),
          appCtx.compiledShaderCache?.clear(),
          window.clearTimeout(appCtx.precompileDebounceId),
          (appCtx.precompileDebounceId = null),
          window.clearTimeout(appCtx.precompileTimeoutId),
          (appCtx.precompileTimeoutId = null),
          (appCtx.isEnvironmentLoading = true),
          appCtx.lightPrecompileController?.setContextLost(true)));
    },
    handleRendererRestored = () => {
      appCtx.isDisposed &&
        ((appCtx.isDisposed = false),
        emitRuntimeDiagnostic("gpu-restored"),
        disposeShadowAtlas(),
        appCtx.compiledShaderCache?.clear(),
        (appCtx.isCacheReady = false),
        (appCtx.isFrameDirty = true),
        setFadeOverlay(false),
        appCtx.contactShadowController?.invalidateContext(),
        appCtx.rendererLossHandler?.invalidateContext(),
        appCtx.threeScene?.traverse((traversedLight: any) => {
          traversedLight.isLight &&
            traversedLight.castShadow &&
            traversedLight.shadow &&
            (traversedLight.shadow.needsUpdate = true);
        }),
        (appCtx.currentPrecompileSignature = ""),
        precompiledMaterialKeySet.clear(),
        renderStudioFrame(),
        frameCallback(),
        needsMotionPresentation() && scheduleLightPrecompile());
    };
  return (
    domElement3.addEventListener("webglcontextlost", handleRendererLost),
    domElement3.addEventListener("webglcontextrestored", handleRendererRestored),
    () => {
      (domElement3.removeEventListener("webglcontextlost", handleRendererLost),
        domElement3.removeEventListener("webglcontextrestored", handleRendererRestored));
    }
  );
}
function setFadeOverlay(isOverlayVisible: any) {
  ((previewLightCacheCanvasElement.hidden = !isOverlayVisible),
    isEmbeddedStage &&
      appCtx.threeRenderer &&
      (appCtx.threeRenderer.domElement.style.opacity = isOverlayVisible ? "0" : "1"));
}
function hasPendingSceneWork() {
  const modelLoadState = externalModelRegistry.modelLoadState();
  return (
    (modelLoadState.pending ?? modelLoadState.active + modelLoadState.queued) > 0 ||
    appCtx.isModelLoadPending ||
    appCtx.replacementFrameCount > 0 ||
    appCtx.modelLoadTimeoutId !== null ||
    appCtx.isPrecompileBlocked
  );
}
function canBuildScene() {
  return !(isEmbeddedStage && appCtx.isExternalModelPending) && !hasPendingSceneWork();
}
function drawToActiveSurface(drawingTargetCanvas: any, drawingSourceImage: any, isCancelled: any) {
  appCtx.activeLongTask?.cancel();
  const studioOrbitControls = appCtx.orbitControls,
    renderTaskOptions = {
      cancelled: false,
      frame: null as any,
      timer: null as any,
      idle: null as any,
      cancel: null as any,
    },
    isRenderTaskActive = () => !renderTaskOptions.cancelled && isCancelled(),
    cancelRenderTask = () => {
      ((renderTaskOptions.cancelled = true),
        renderTaskOptions.frame !== null && window.cancelAnimationFrame(renderTaskOptions.frame),
        renderTaskOptions.timer !== null && window.clearTimeout(renderTaskOptions.timer),
        renderTaskOptions.idle !== null && window.cancelIdleCallback?.(renderTaskOptions.idle),
        (renderTaskOptions.frame = renderTaskOptions.timer = renderTaskOptions.idle = null),
        window.removeEventListener("pagehide", cancelRenderTask),
        window.removeEventListener("pointerdown", cancelRenderTask, true),
        window.removeEventListener("wheel", cancelRenderTask, true),
        studioOrbitControls?.removeEventListener("start", cancelRenderTask),
        studioOrbitControls?.removeEventListener("change", cancelRenderTask),
        drawingSourceImage &&
          ((drawingSourceImage.width = drawingSourceImage.height = 0), (drawingSourceImage = null)),
        appCtx.activeLongTask === renderTaskOptions && (appCtx.activeLongTask = null));
    };
  ((renderTaskOptions.cancel = cancelRenderTask), (appCtx.activeLongTask = renderTaskOptions));
  const handleRenderTaskError = (renderError: any) =>
      window.HomeOSLog?.error!(renderError, {
        phase: "interaction3d-cache-write",
      })!,
    runRenderTaskIdle = () => {
      ((renderTaskOptions.idle = null),
        Promise.resolve()
          .then(() => {
            if (isRenderTaskActive())
              return renderCacheWriter?.write(
                drawingTargetCanvas,
                drawingSourceImage,
                isRenderTaskActive,
              );
          })
          .catch(handleRenderTaskError)
          .finally(cancelRenderTask));
    };
  try {
    (window.addEventListener("pagehide", cancelRenderTask, {
      once: true,
    }),
      window.addEventListener("pointerdown", cancelRenderTask, {
        capture: true,
        passive: true,
      }),
      window.addEventListener("wheel", cancelRenderTask, {
        capture: true,
        passive: true,
      }),
      studioOrbitControls?.addEventListener("start", cancelRenderTask),
      studioOrbitControls?.addEventListener("change", cancelRenderTask),
      (renderTaskOptions.frame = window.requestAnimationFrame(() => {
        if (((renderTaskOptions.frame = null), !isRenderTaskActive())) {
          cancelRenderTask();
          return;
        }
        renderTaskOptions.timer = window.setTimeout(() => {
          if (((renderTaskOptions.timer = null), !isRenderTaskActive())) {
            cancelRenderTask();
            return;
          }
          try {
            typeof window.requestIdleCallback == "function"
              ? (renderTaskOptions.idle = window.requestIdleCallback(runRenderTaskIdle))
              : runRenderTaskIdle();
          } catch (renderSetupError: any) {
            (cancelRenderTask(), handleRenderTaskError(renderSetupError));
          }
        }, 180);
      })));
  } catch (renderLoopError: any) {
    (cancelRenderTask(), handleRenderTaskError(renderLoopError));
  }
}
async function acquireRenderSurface() {
  if (
    ((appCtx.renderCommitTimeoutId = null),
    appCtx.isDisposed ||
      !appCtx.isHighDetailQuality ||
      renderCacheWriter?.closed ||
      !appCtx.threeRenderer ||
      appCtx.pendingRuntimeSettings ||
      appCtx.isRenderSuppressed ||
      appCtx.isWindowHidden ||
      appCtx.isCapturingLights ||
      appCtx.prewarmState ||
      appCtx.isPrewarming ||
      appCtx.isCurtainMoving ||
      appCtx.isVacuumMoving ||
      appCtx.isBackgroundMoving ||
      appCtx.isPrecompilePending)
  )
    return;
  if (
    hasPendingSceneWork() ||
    appCtx.lightPrecompileController?.isBuilding() ||
    appCtx.lightPrecompileController?.isPending()
  ) {
    scheduleStudioRender(120);
    return;
  }
  const domElement4 = appCtx.threeRenderer.domElement,
    width4 = domElement4.width,
    height4 = domElement4.height;
  if (!width4 || !height4) return;
  const Et2 = appCtx.modelRevisionCounter,
    shouldAbortSurface = () =>
      !appCtx.isDisposed &&
      appCtx.isHighDetailQuality &&
      !renderCacheWriter?.closed &&
      !hasPendingSceneWork() &&
      Et2 === appCtx.modelRevisionCounter &&
      !appCtx.pendingRuntimeSettings &&
      !appCtx.isRenderSuppressed &&
      !appCtx.isWindowHidden &&
      !appCtx.prewarmState &&
      !appCtx.isPrewarming &&
      !appCtx.isCurtainMoving &&
      !appCtx.isVacuumMoving &&
      !appCtx.isBackgroundMoving &&
      !appCtx.isPrecompilePending;
  appCtx.isCapturingLights = true;
  let acquiredSurfaceCanvas: any,
    previousSurfaceCanvas: any = null,
    surfaceKey,
    isSurfaceSuspended = false;
  try {
    const fr2 = collectLampEntries(),
      surfaceRequestKey = sha2562(
        stableCacheJSON2({
          kind: "settled-rgba-v1",
          base: sceneCacheDescriptor(width4, height4),
          lights: fr2.map(
            ({ item: lightEntryItem, itemKey: lightEntryKey, group: lightEntryGroup }: any) => ({
              key: lightEntryKey,
              enabled: lightEntryGroup?.enabled !== false,
              brightness: lightEntryItem.lightBrightness,
              temperature: lightEntryItem.lightTemperature,
              color: lightEntryItem.lightColorRgb || null,
            }),
          ),
        }),
      );
    if (
      ((surfaceKey = surfaceRequestKey),
      (acquiredSurfaceCanvas = await renderCacheWriter?.acquire(
        surfaceRequestKey,
        width4,
        height4,
        shouldAbortSurface,
      )),
      !shouldAbortSurface())
    )
      return;
    if (!acquiredSurfaceCanvas) {
      const jl2 = ensureLightCache(fr2);
      (showCachedLights(jl2),
        requestStudioRender(),
        appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera),
        (acquiredSurfaceCanvas = document.createElement("canvas")),
        (previousSurfaceCanvas = acquiredSurfaceCanvas),
        (acquiredSurfaceCanvas.width = width4),
        (acquiredSurfaceCanvas.height = height4));
      const context = acquiredSurfaceCanvas.getContext("2d");
      if (!context) throw new Error("当前浏览器无法创建静止画面缓存。");
      context.drawImage(domElement4, 0, 0);
    }
    if (!shouldAbortSurface()) return;
    const snapshotSurfacePainter = previewLightCacheCanvasElement.getContext("2d");
    if (!snapshotSurfacePainter) throw new Error("当前浏览器无法创建静止画面缓存。");
    ((previewLightCacheCanvasElement.width = width4),
      (previewLightCacheCanvasElement.height = height4),
      snapshotSurfacePainter.clearRect(0, 0, width4, height4),
      snapshotSurfacePainter.drawImage(acquiredSurfaceCanvas.image || acquiredSurfaceCanvas, 0, 0),
      appCtx.lightGroupCacheByFloor.clear(),
      appCtx.lightGainByFloor.clear(),
      (appCtx.isCacheReady = true),
      (appCtx.isFrameDirty = false),
      (domElement4.dataset.lightCachePixels = String(width4 * height4)),
      (domElement4.dataset.lightCacheRetainedGroups = "complete-frame"),
      setFadeOverlay(true),
      previousSurfaceCanvas &&
        (drawToActiveSurface(surfaceKey, previousSurfaceCanvas, shouldAbortSurface),
        (previousSurfaceCanvas = null)));
  } catch (snapshotError: any) {
    ((isSurfaceSuspended = true),
      setFadeOverlay(false),
      window.HomeOSLog?.error!(snapshotError, {
        phase: "interaction3d-settled-cache",
      })!);
  } finally {
    try {
      (acquiredSurfaceCanvas?.close?.(),
        previousSurfaceCanvas && (previousSurfaceCanvas.width = previousSurfaceCanvas.height = 0));
    } finally {
      appCtx.isCapturingLights = false;
    }
    appCtx.isFrameDirty &&
      (!isSurfaceSuspended || Et2 !== appCtx.modelRevisionCounter) &&
      scheduleStudioRender(420);
  }
}
function restoreLightVisibility() {
  if (!appCtx.isCacheReady || previewLightCacheCanvasElement.hidden) return;
  const overlaySurfacePainter = previewLightCacheCanvasElement.getContext("2d");
  if (overlaySurfacePainter) {
    overlaySurfacePainter.clearRect(
      0,
      0,
      previewLightCacheCanvasElement.width,
      previewLightCacheCanvasElement.height,
    );
    for (const [overlayGroupId, overlayImage] of appCtx.lightGroupCacheByFloor) {
      const overlayAlpha = clamp2(finite2(appCtx.lightGainByFloor.get(overlayGroupId), 0), 0, 1);
      overlayAlpha <= 0.001 ||
        (overlaySurfacePainter.save(),
        (overlaySurfacePainter.globalAlpha = overlayAlpha),
        overlaySurfacePainter.drawImage(overlayImage, 0, 0),
        overlaySurfacePainter.restore());
    }
  }
}
function fadeLightsIn(lightGroupIdList: any, fadeDurationMs = lightTransitionMs) {
  const uniqueLightGroupIds = [...new Set(lightGroupIdList)].filter(Boolean);
  if (!uniqueLightGroupIds.length) return;
  const lightFadeEntries = uniqueLightGroupIds.map((fadeGroupId) => ({
    groupId: composeLightGroupKey(appCtx.activeFloorId, fadeGroupId),
    from: clamp2(
      finite2(
        appCtx.lightGainByFloor.get(composeLightGroupKey(appCtx.activeFloorId, fadeGroupId)),
        findLightGroup(fadeGroupId)?.enabled === false ? 0 : 1,
      ),
      0,
      1,
    ),
    to: findLightGroup(fadeGroupId)?.enabled === false ? 0 : 1,
  }));
  if ((cancelAnimationFrame(appCtx.lightCaptureFrameId), !appCtx.isCacheReady)) {
    for (const lightFadeEntry of lightFadeEntries)
      appCtx.lightGainByFloor.set(lightFadeEntry.groupId, lightFadeEntry.to);
    appCtx.isCapturingLights || scheduleStudioRender(0);
    return;
  }
  const fadeStartMs = performance.now(),
    fadeFrameStep = (fadeTimestamp: any) => {
      const fadeProgress = clamp2((fadeTimestamp - fadeStartMs) / fadeDurationMs, 0, 1),
        easedFadeProgress = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
      for (const lightFadeTarget of lightFadeEntries)
        appCtx.lightGainByFloor.set(
          lightFadeTarget.groupId,
          lightFadeTarget.from + (lightFadeTarget.to - lightFadeTarget.from) * easedFadeProgress,
        );
      (restoreLightVisibility(),
        fadeProgress < 1
          ? (appCtx.lightCaptureFrameId = requestAnimationFrame(fadeFrameStep))
          : (appCtx.lightCaptureFrameId = 0));
    };
  appCtx.lightCaptureFrameId = requestAnimationFrame(fadeFrameStep);
}
function findLightGroup(lightGroupId: any) {
  return (
    appCtx.studioState.lightGroups?.find(
      (candidateLightGroup) => candidateLightGroup.id === lightGroupId,
    ) || null
  );
}
function fadeLightsOut(fadeGroupIdList: any, fadeOutDurationMs = lightTransitionMs) {
  if (!appCtx.sceneRootNode) return false;
  const fadeGroupIdSet = new Set(fadeGroupIdList),
    ht3 = areLightsEnabled() && !appCtx.pendingRuntimeSettings,
    fadeLightEntries: any = [];
  if (
    (appCtx.sceneRootNode.traverse((fadeLightObject: any) => {
      if (!fadeLightObject.isLight || !fadeGroupIdSet.has(fadeLightObject.userData?.lightGroupId))
        return;
      const targetLightIntensity =
        findLightGroup(fadeLightObject.userData.lightGroupId)?.enabled !== false && !ht3
          ? finite2(fadeLightObject.userData.lightOnIntensity, 0)
          : 0;
      (targetLightIntensity > 0 && (fadeLightObject.visible = true),
        fadeLightEntries.push({
          object: fadeLightObject,
          from: finite2(fadeLightObject.intensity, 0),
          to: targetLightIntensity,
        }));
    }),
    !fadeLightEntries.length)
  )
    return false;
  (fadeLightEntries.some(({ to: fadeListEntry }: any) => fadeListEntry > 0) &&
    setupSceneShadows(appCtx.sceneRootNode, {
      rebuildAtlas: false,
    }),
    cancelAnimationFrame(appCtx.cacheWarmFrameId));
  const fadeOutStartMs = performance.now(),
    fadeOutFrameStep = (fadeOutTimestamp: any) => {
      const fadeOutProgress = clamp2((fadeOutTimestamp - fadeOutStartMs) / fadeOutDurationMs, 0, 1),
        easedFadeOutProgress = fadeOutProgress * fadeOutProgress * (3 - 2 * fadeOutProgress);
      for (const fadeOutLightEntry of fadeLightEntries)
        fadeOutLightEntry.object.intensity =
          fadeOutLightEntry.from +
          (fadeOutLightEntry.to - fadeOutLightEntry.from) * easedFadeOutProgress;
      if ((renderStudioFrame(), fadeOutProgress < 1))
        appCtx.cacheWarmFrameId = requestAnimationFrame(fadeOutFrameStep);
      else {
        appCtx.cacheWarmFrameId = 0;
        let hasVisibilityChange = false;
        for (const fadeOutTarget of fadeLightEntries)
          fadeOutTarget.to > 0 ||
            ((fadeOutTarget.object.visible = false), (hasVisibilityChange = true));
        hasVisibilityChange &&
          setupSceneShadows(appCtx.sceneRootNode, {
            rebuildAtlas: false,
          });
      }
    };
  return ((appCtx.cacheWarmFrameId = requestAnimationFrame(fadeOutFrameStep)), true);
}
function transitionLightGroups(transitionGroupIds: any) {
  const uniqueTransitionGroupIds = [...new Set(transitionGroupIds)].filter(Boolean);
  (areLightsEnabled() && !appCtx.pendingRuntimeSettings
    ? fadeLightsIn(uniqueTransitionGroupIds)
    : fadeLightsOut(uniqueTransitionGroupIds) ||
      requestSceneRebuild({
        scope: "lights",
        preserveLightCache: true,
      }),
    syncLightGroupList(),
    refreshStudioUi(),
    refreshStudioView(),
    requestStudioRender(),
    scheduleLightPrecompile());
}
function refreshSceneRender(refreshOptions: SceneRefreshOptions = {}) {
  if (
    (isEmbeddedStage &&
      (refreshOptions.scene === true || refreshOptions.shadows === true) &&
      appCtx.sceneRevisionCount++,
    (appCtx.isLightCacheReady = true),
    (appCtx.isLightCachePending = false),
    appCtx.lightingScheduler?.wake(),
    isEmbeddedStage &&
      (refreshOptions.scene === true || refreshOptions.shadows === true) &&
      cacheObjectTransforms2(appCtx.threeScene, ns2.Object3D),
    refreshOptions.shadows === true &&
      appCtx.threeScene?.traverse((shadowLightObject: any) => {
        shadowLightObject.isLight &&
          shadowLightObject.castShadow &&
          shadowLightObject.shadow &&
          (shadowLightObject.shadow.needsUpdate = true);
      }),
    !appCtx.isLightOverrideOn)
  ) {
    if (
      refreshOptions.preserveLightCache === true &&
      areLightsEnabled() &&
      !appCtx.pendingRuntimeSettings
    ) {
      !appCtx.isCacheReady && !appCtx.isCapturingLights && scheduleStudioRender();
      return;
    }
    areLightsEnabled() && !appCtx.pendingRuntimeSettings
      ? ((appCtx.modelRevisionCounter += 1),
        (appCtx.isFrameDirty = true),
        (isEmbeddedStage || refreshOptions.scene === true || !appCtx.isCacheReady) &&
          setFadeOverlay(false),
        scheduleStudioRender(),
        requestStudioRender())
      : (window.clearTimeout(appCtx.renderCommitTimeoutId),
        (appCtx.renderCommitTimeoutId = null),
        (appCtx.isCacheReady = false),
        (appCtx.isFrameDirty = false),
        setFadeOverlay(false));
  }
}
function syncLightCache() {
  appCtx.isLightOverrideOn = true;
  try {
    getPreviewFloorMode() === "all"
      ? rebuildFloorLayers({
          preserveLightCache: true,
        })
      : buildLightsLayer({
          preserveLightCache: true,
        });
  } finally {
    appCtx.isLightOverrideOn = false;
  }
}
function buildLightCacheMap() {
  const lightsByItemKey = new Map();
  return (
    appCtx.sceneRootNode?.traverse((cacheLightObject: any) => {
      const cachedLightItemId = cacheLightObject.userData?.lightItemId;
      if (!cacheLightObject.isLight || !cachedLightItemId) return;
      const ji3 = composeItemKey(cacheLightObject.userData?.lightFloorId, cachedLightItemId);
      (lightsByItemKey.has(ji3) || lightsByItemKey.set(ji3, []),
        lightsByItemKey.get(ji3).push(cacheLightObject));
    }),
    lightsByItemKey
  );
}
function ensureLightCache(lightEntries: any) {
  let lightCacheMap = buildLightCacheMap();
  if (lightEntries.every((lightCacheEntry: any) => lightCacheMap.has(lightCacheEntry.itemKey)))
    return lightCacheMap;
  if (isEmbeddedStage) return updateLightCache(lightEntries, lightCacheMap);
  ((appCtx.isResidentCacheMode = true), (appCtx.overriddenFloorIds = new Set()));
  try {
    syncLightCache();
  } finally {
    ((appCtx.overriddenFloorIds = null), (appCtx.isResidentCacheMode = false));
  }
  return ((lightCacheMap = buildLightCacheMap()), lightCacheMap);
}
function updateLightCache(incrementalLightEntries: any, lightCacheTarget: any) {
  const sceneSnapshot = appCtx.studioState,
    oe3 = appCtx.activeFloorId,
    Xr2 = appCtx.isResidentCacheMode,
    isAllFloorsView = getPreviewFloorMode() === "all";
  try {
    appCtx.isResidentCacheMode = true;
    for (const {
      floor: cacheFloor,
      item: cacheLightItem,
      itemKey: cacheItemKey,
    } of incrementalLightEntries) {
      if (lightCacheTarget.has(cacheItemKey) || (!isAllFloorsView && cacheFloor.id !== oe3))
        continue;
      const floorGroup = isAllFloorsView
        ? appCtx.sceneRootNode?.children.find(
            (floorChildGroup: any) => floorChildGroup.userData?.floorId === cacheFloor.id,
          )
        : appCtx.sceneRootNode;
      if (!floorGroup) continue;
      ((appCtx.studioState = cacheFloor.scene), (appCtx.activeFloorId = cacheFloor.id));
      const lightCacheTargetPixelsPerMeter = getPixelsPerMeter();
      if (!lightCacheTargetPixelsPerMeter) continue;
      const floorModelOrigin = sceneModelOrigin2(cacheFloor.scene, cacheFloor),
        floorOriginX = isAllFloorsView ? finite2(cacheFloor.originX, 0) : floorModelOrigin.x,
        floorOriginY = isAllFloorsView ? finite2(cacheFloor.originY, 0) : floorModelOrigin.y,
        lightProxyGroup = new ns2.Group();
      (addLightModel(lightProxyGroup, cacheLightItem, collectLightSourceSpecs()),
        lightProxyGroup.position.set(
          (cacheLightItem.x - floorOriginX) / lightCacheTargetPixelsPerMeter,
          cacheLightItem.elevation || 0,
          (cacheLightItem.y - floorOriginY) / lightCacheTargetPixelsPerMeter,
        ),
        applyItemOrientation(lightProxyGroup, cacheLightItem),
        (lightProxyGroup.userData.modelLayer = "lights"),
        (lightProxyGroup.userData.exportRole = "plan"),
        floorGroup.add(lightProxyGroup),
        isEmbeddedStage && cacheObjectTransforms2(lightProxyGroup, ns2.Object3D));
      const proxyLights: any = [];
      (lightProxyGroup.traverse((proxyLightObject: any) => {
        proxyLightObject.isLight && proxyLights.push(proxyLightObject);
      }),
        proxyLights.length && lightCacheTarget.set(cacheItemKey, proxyLights));
    }
  } finally {
    ((appCtx.studioState = sceneSnapshot), (appCtx.activeFloorId = oe3), (appCtx.isResidentCacheMode = Xr2));
  }
  return (
    setupSceneShadows(appCtx.sceneRootNode, {
      rebuildAtlas: false,
    }),
    lightCacheTarget
  );
}
function showLightCacheFor(cacheMapSource: any, activeCacheKey = "") {
  for (const [cacheEntryKey, cacheLightObjects] of cacheMapSource) {
    const isCacheEntryActive = cacheEntryKey === activeCacheKey;
    for (const cacheTargetLight of cacheLightObjects)
      ((cacheTargetLight.visible = isCacheEntryActive),
        (cacheTargetLight.intensity = isCacheEntryActive
          ? finite2(cacheTargetLight.userData?.lightOnIntensity, 0)
          : 0),
        cacheTargetLight.isSpotLight &&
          ((cacheTargetLight.castShadow = isCacheEntryActive),
          isCacheEntryActive &&
            cacheTargetLight.shadow &&
            !cacheTargetLight.shadow.map &&
            (cacheTargetLight.shadow.needsUpdate = true)));
  }
  (isEmbeddedStage || appCtx.lightPrecompileController?.syncRenderUniforms(appCtx.threeScene, appCtx.threeCamera),
    renderStudioFrame());
}
function collectActiveLightGroupKeys() {
  return new Set(
    collectLampEntries()
      .filter(
        ({ item: activeEntryItem, group: activeEntryGroup }: any) =>
          activeEntryGroup?.enabled !== false && finite2(activeEntryItem.lightBrightness, 0) > 0,
      )
      .map(({ itemKey: activeEntryKey }: any) => activeEntryKey),
  );
}
function showCachedLights(cacheMapForDisplay: any) {
  const sv2 = collectActiveLightGroupKeys();
  for (const [displayCacheKey, displayLightObjects] of cacheMapForDisplay) {
    const isDisplayEntryActive = sv2.has(displayCacheKey);
    for (const displayLightObject of displayLightObjects)
      ((displayLightObject.visible = isDisplayEntryActive),
        (displayLightObject.intensity = isDisplayEntryActive
          ? finite2(displayLightObject.userData?.lightOnIntensity, 0)
          : 0),
        displayLightObject.isSpotLight && (displayLightObject.castShadow = false));
  }
  (isEmbeddedStage || appCtx.lightPrecompileController?.syncRenderUniforms(appCtx.threeScene, appCtx.threeCamera),
    renderStudioFrame());
}
function captureLightSnapshot() {
  if (!previewRenderShieldElement || !appCtx.threeRenderer?.domElement) return;
  const domElement5 = appCtx.threeRenderer.domElement;
  if (!domElement5.width || !domElement5.height) return;
  (isEmbeddedStage &&
    (window.clearTimeout(appCtx.previewShieldTimeoutId),
    (appCtx.previewShieldTimeoutId = null),
    (previewRenderShieldElement.style.transition = "none"),
    (previewRenderShieldElement.style.opacity = "1")),
    (previewRenderShieldElement.width = domElement5.width),
    (previewRenderShieldElement.height = domElement5.height));
  const compositeSurfacePainter = previewRenderShieldElement.getContext("2d");
  compositeSurfacePainter &&
    ((compositeSurfacePainter.globalCompositeOperation = "source-over"),
    (compositeSurfacePainter.globalAlpha = 1),
    (compositeSurfacePainter.fillStyle =
      "#" + backgroundSettings().background.toString(16).padStart(6, "0")),
    compositeSurfacePainter.fillRect(
      0,
      0,
      previewRenderShieldElement.width,
      previewRenderShieldElement.height,
    ),
    isEmbeddedStage && appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera),
    compositeSurfacePainter.drawImage(domElement5, 0, 0),
    previewLightCacheCanvasElement.hidden ||
      (isEmbeddedStage
        ? compositeSurfacePainter.drawImage(
            previewLightCacheCanvasElement,
            0,
            0,
            previewRenderShieldElement.width,
            previewRenderShieldElement.height,
          )
        : compositeSurfacePainter.drawImage(previewLightCacheCanvasElement, 0, 0)),
    (previewRenderShieldElement.hidden = false));
}
function restorePreviewAfterFade({ smooth: isSmoothRestore = false } = {}) {
  if (previewRenderShieldElement) {
    if (isEmbeddedStage) {
      if (
        (window.clearTimeout(appCtx.previewShieldTimeoutId),
        (appCtx.previewShieldTimeoutId = null),
        isSmoothRestore && !previewRenderShieldElement.hidden)
      ) {
        ((previewRenderShieldElement.style.transition = "opacity 180ms ease-out"),
          (previewRenderShieldElement.style.opacity = "0"),
          (appCtx.previewShieldTimeoutId = window.setTimeout(() => {
            ((appCtx.previewShieldTimeoutId = null),
              (previewRenderShieldElement.hidden = true),
              (previewRenderShieldElement.style.transition = "none"),
              (previewRenderShieldElement.style.opacity = "1"));
          }, 180)));
        return;
      }
      ((previewRenderShieldElement.style.transition = "none"),
        (previewRenderShieldElement.style.opacity = "1"));
    }
    previewRenderShieldElement.hidden = true;
  }
}
function awaitNextFramePair() {
  return (
    captureLightSnapshot(),
    new Promise((resolveFramePair) =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFramePair)),
    )
  );
}
function captureFramePixels(captureWidth: any, captureHeight: any) {
  const captureCanvas = document.createElement("canvas");
  ((captureCanvas.width = captureWidth), (captureCanvas.height = captureHeight));
  const capturePixelPainter = captureCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!capturePixelPainter) throw new Error("当前浏览器无法创建多灯缓存画布。");
  return (
    capturePixelPainter.drawImage(appCtx.threeRenderer.domElement, 0, 0, captureWidth, captureHeight),
    capturePixelPainter.getImageData(0, 0, captureWidth, captureHeight)
  );
}
function rerenderScene() {
  for (let renderPassIndex = 0; renderPassIndex < 3; renderPassIndex += 1)
    appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera);
}
function ensureRenderReady() {
  return globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise<void>((resolveRenderWait) => requestAnimationFrame(() => resolveRenderWait()));
}
function waitForIdleFrame() {
  return globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : typeof globalThis.requestIdleCallback === "function"
      ? new Promise<void>((resolveIdleWait) =>
          requestIdleCallback(() => resolveIdleWait(), {
            timeout: 80,
          }),
        )
      : new Promise<void>((resolveAnimationWait) =>
          requestAnimationFrame(() => resolveAnimationWait()));
}
function scheduleStudioRender(renderDelayMs = 420) {
  appCtx.isDisposed ||
    (isEmbeddedStage && !appCtx.isHighDetailQuality) ||
    (isEmbeddedStage && renderCacheWriter?.closed) ||
    !appCtx.threeRenderer ||
    !appCtx.sceneRootNode ||
    appCtx.pendingRuntimeSettings ||
    appCtx.isRenderSuppressed ||
    appCtx.isWindowHidden ||
    appCtx.isCapturingLights ||
    appCtx.prewarmState ||
    appCtx.isPrewarming ||
    !areLightsEnabled() ||
    (window.clearTimeout(appCtx.renderCommitTimeoutId),
    (appCtx.renderCommitTimeoutId = window.setTimeout(() => {
      const modelLoadState2 = externalModelRegistry.modelLoadState();
      if ((modelLoadState2.pending ?? modelLoadState2.active + modelLoadState2.queued) > 0) {
        ((appCtx.renderCommitTimeoutId = null), scheduleStudioRender(240));
        return;
      }
      beginLightingPreview();
    }, renderDelayMs)));
}
function discardLightingEdit() {
  !areLightsEnabled() ||
    appCtx.pendingRuntimeSettings ||
    appCtx.isCapturingLights ||
    ((appCtx.isFrameDirty = true), scheduleStudioRender(0), requestStudioRender());
}
async function beginLightingPreview() {
  if (isEmbeddedStage) return acquireRenderSurface();
  if (
    ((appCtx.renderCommitTimeoutId = null),
    !appCtx.threeRenderer ||
      appCtx.pendingRuntimeSettings ||
      appCtx.isRenderSuppressed ||
      appCtx.isWindowHidden ||
      appCtx.isCapturingLights ||
      appCtx.prewarmState ||
      appCtx.isPrewarming ||
      !areLightsEnabled())
  )
    return;
  const Et3 = appCtx.modelRevisionCounter,
    previewLightEntries = collectLampEntries().filter(
      ({ item: previewLightItem, group: _previewLightGroup }: any) =>
        finite2(previewLightItem.lightBrightness, 0) > 0,
    ),
    domElement6 = appCtx.threeRenderer.domElement;
  let width5 = domElement6.width,
    height5 = domElement6.height;
  if (!width5 || !height5 || !previewLightEntries.length) return;
  ((appCtx.isCapturingLights = true), (appCtx.isFrameDirty = true));
  const enabled = appCtx.orbitControls.enabled,
    previewVisibilityByObject = new Map();
  let isPreviewLocked = false;
  requestStudioRender();
  try {
    const previewSurfacePainter = previewLightCacheCanvasElement.getContext("2d");
    if (!previewSurfacePainter) throw new Error("当前浏览器无法显示多灯缓存。");
    (previewLightCacheCanvasElement.hidden ||
      !appCtx.isCacheReady ||
      previewLightCacheCanvasElement.width !== width5 ||
      previewLightCacheCanvasElement.height !== height5) &&
      ((previewLightCacheCanvasElement.width = width5),
      (previewLightCacheCanvasElement.height = height5),
      previewSurfacePainter.clearRect(0, 0, width5, height5));
    const compositeCanvas = document.createElement("canvas");
    ((compositeCanvas.width = width5), (compositeCanvas.height = height5));
    const compositePainter = compositeCanvas.getContext("2d"),
      lightDeltaCanvas = document.createElement("canvas");
    ((lightDeltaCanvas.width = width5), (lightDeltaCanvas.height = height5));
    const lightDeltaPainter = lightDeltaCanvas.getContext("2d");
    if (!compositePainter || !lightDeltaPainter) throw new Error("当前浏览器无法合成多灯缓存。");
    const lightLayerCanvasByKey = new Map(),
      jl3 = ensureLightCache(previewLightEntries);
    if (
      (await awaitNextFramePair(),
      Et3 !== appCtx.modelRevisionCounter ||
        appCtx.pendingRuntimeSettings ||
        appCtx.isRenderSuppressed ||
        appCtx.isWindowHidden ||
        !areLightsEnabled())
    )
      return;
    (showLightCacheFor(jl3),
      compositePainter.clearRect(0, 0, width5, height5),
      appCtx.sceneRootNode.traverse((gridObject: any) => {
        gridObject.userData?.exportRole === "grid" &&
          (previewVisibilityByObject.set(gridObject, gridObject.visible),
          (gridObject.visible = false));
      }));
    let cachedLightPixels;
    for (const previewEntry of previewLightEntries) {
      if (
        (await waitForIdleFrame(),
        Et3 !== appCtx.modelRevisionCounter ||
          appCtx.pendingRuntimeSettings ||
          appCtx.isRenderSuppressed ||
          appCtx.isWindowHidden ||
          !areLightsEnabled())
      )
        break;
      const {
        group: previewGroup,
        itemKey: previewItemKey,
        groupKey: previewGroupKey,
      } = previewEntry;
      lightDeltaPainter.clearRect(0, 0, width5, height5);
      {
        (cachedLightPixels ||
          (showLightCacheFor(jl3),
          rerenderScene(),
          (cachedLightPixels = captureFramePixels(width5, height5))),
          showLightCacheFor(jl3, previewItemKey),
          rerenderScene());
        const ff2 = captureFramePixels(width5, height5),
          lightDeltaPixels = buildLightDeltaPixels2(cachedLightPixels.data, ff2.data);
        lightDeltaPainter.putImageData(new ImageData(lightDeltaPixels, width5, height5), 0, 0);
      }
      compositePainter.drawImage(lightDeltaCanvas, 0, 0);
      let lightLayerCanvas = lightLayerCanvasByKey.get(previewGroupKey);
      if (
        (lightLayerCanvas ||
          ((lightLayerCanvas = document.createElement("canvas")),
          (lightLayerCanvas.width = width5),
          (lightLayerCanvas.height = height5),
          (lightLayerCanvas.userData = {
            enabled: previewGroup?.enabled !== false,
          }),
          lightLayerCanvasByKey.set(previewGroupKey, lightLayerCanvas)),
        lightLayerCanvas.getContext("2d")?.drawImage(lightDeltaCanvas, 0, 0),
        await ensureRenderReady(),
        Et3 !== appCtx.modelRevisionCounter ||
          appCtx.pendingRuntimeSettings ||
          appCtx.isRenderSuppressed ||
          appCtx.isWindowHidden ||
          !areLightsEnabled())
      )
        break;
    }
    if (Et3 === appCtx.modelRevisionCounter && !appCtx.pendingRuntimeSettings && areLightsEnabled()) {
      appCtx.lightGroupCacheByFloor = lightLayerCanvasByKey;
      for (const [lightLayerKey, lightLayerTarget] of lightLayerCanvasByKey)
        appCtx.lightGainByFloor.set(lightLayerKey, lightLayerTarget.userData?.enabled === false ? 0 : 1);
      ((appCtx.isCacheReady = true),
        (appCtx.isFrameDirty = false),
        setFadeOverlay(true),
        restoreLightVisibility(),
        (isPreviewLocked = true));
    }
  } catch (previewCaptureError: any) {
    (window.HomeOSLog?.error!(previewCaptureError, {
      phase: "studio-light-cache",
    }),
      console.error(previewCaptureError),
      (appCtx.isCacheReady = !previewLightCacheCanvasElement.hidden));
  } finally {
    for (const [restoreObject, restoreVisibility] of previewVisibilityByObject)
      restoreObject.visible = restoreVisibility;
    const restoredLightCache = buildLightCacheMap();
    (appCtx.prewarmState
      ? appCtx.prewarmState.restore()
      : appCtx.isRenderSuppressed
        ? showCachedLights(restoredLightCache)
        : showLightCacheFor(restoredLightCache),
      rerenderScene(),
      isPreviewLocked
        ? requestAnimationFrame(() => restorePreviewAfterFade())
        : restorePreviewAfterFade(),
      (appCtx.orbitControls.enabled = enabled),
      (appCtx.isCapturingLights = false),
      requestStudioRender(),
      appCtx.isFrameDirty && areLightsEnabled() && !appCtx.pendingRuntimeSettings && scheduleStudioRender());
  }
}
function resetPlanInteraction() {
  (window.clearTimeout(appCtx.deferredRenderTimeoutId),
    (appCtx.deferredRenderTimeoutId = null),
    (appCtx.isWindowHidden = true),
    window.clearTimeout(appCtx.renderCommitTimeoutId),
    (appCtx.renderCommitTimeoutId = null),
    appCtx.isCapturingLights && ((appCtx.modelRevisionCounter += 1), (appCtx.isFrameDirty = true)));
}
function endStudioGesture() {
  (window.clearTimeout(appCtx.deferredRenderTimeoutId),
    (appCtx.deferredRenderTimeoutId = window.setTimeout(() => {
      if (
        ((appCtx.deferredRenderTimeoutId = null),
        (appCtx.isWindowHidden = false),
        handleInteractionEnded(),
        dirtyFloorIdSet.size && !appCtx.isPrecompileBlocked)
      ) {
        const activeScopes = [...dirtyFloorIdSet],
          activeScopeName = activeScopes.includes("all") ? "all" : activeScopes[0];
        requestSceneRebuild({
          scope: activeScopeName as string,
          preserveLightCache: !appCtx.isLightCachePreserved,
        });
      }
      (appCtx.isFrameDirty && scheduleStudioRender(420), appCtx.isModelLoadPending && requestSceneRender());
    }, 120)));
}
function disposeShadowAtlas() {
  (window.clearTimeout(appCtx.shadowPrepareTimeoutId),
    (appCtx.shadowPrepareTimeoutId = null),
    (appCtx.isShadowPreparing = appCtx.isShadowFrozen = false),
    appCtx.shadowAtlasCanvas?.clear());
}
function prepareShadowAtlas() {
  if (
    !appCtx.shadowAtlasCanvas ||
    appCtx.shadowPrepareTimeoutId !== null ||
    appCtx.isRenderSuppressed ||
    appCtx.isShadowPreparing ||
    document.hidden ||
    !appCtx.isHighDetailQuality ||
    appCtx.isExternalModelPending
  )
    return;
  const zn2 = computeRenderPixelRatio(true);
  zn2 >= computeRenderPixelRatio(false) ||
    appCtx.shadowAtlasCanvas.matches(zn2) ||
    (appCtx.shadowPrepareTimeoutId = window.setTimeout(() => {
      ((appCtx.shadowPrepareTimeoutId = null),
        !appCtx.isRenderSuppressed &&
          !appCtx.isShadowPreparing &&
          !document.hidden &&
          appCtx.isHighDetailQuality &&
          appCtx.shadowAtlasCanvas.prepare(computeRenderPixelRatio(true)));
    }, 250));
}
function setShadowFreeze(isFrozen = true) {
  (appCtx.isShadowFrozen &&
    (!isEmbedStageMode ||
      Math.abs(appCtx.threeRenderer.getPixelRatio() - computeRenderPixelRatio(false)) > 0.000001 ||
      !appCtx.shadowAtlasCanvas?.matches(computeRenderPixelRatio(true))) &&
    updateShadowState(true, {
      preserveLightCache: true,
    }),
    appCtx.isShadowFrozen
      ? (appCtx.compiledShaderCache?.clear(), appCtx.shadowAtlasCanvas.render(appCtx.threeScene, appCtx.threeCamera))
      : appCtx.compiledShaderCache
        ? appCtx.compiledShaderCache.render(appCtx.threeScene, appCtx.threeCamera, {
            background: appCtx.backgroundController?.cacheBackground,
            changed: isFrozen,
            enabled: appCtx.isBackgroundMoving && !appCtx.isRenderSuppressed && !appCtx.pendingRuntimeSettings,
          })
        : appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera),
    prepareShadowAtlas());
}
function updateShadowState(
  isShadowsEnabled: any,
  { preserveLightCache: shouldPreserveLightCache = false } = {},
) {
  if (!appCtx.threeRenderer || (appCtx.pendingRuntimeSettings && !isAutoDiagramEmbed)) return;
  const zn3 = computeRenderPixelRatio(false),
    isPixelRatioStable = Math.abs(appCtx.threeRenderer.getPixelRatio() - zn3) < 0.000001;
  if (
    (!appCtx.isShadowPreparing &&
      isShadowsEnabled &&
      appCtx.isRenderSuppressed &&
      isEmbeddedStage &&
      isEmbedStageMode &&
      isPixelRatioStable &&
      computeRenderPixelRatio(true) < zn3 &&
      appCtx.shadowAtlasCanvas?.matches(computeRenderPixelRatio(true)) &&
      (appCtx.isShadowPreparing = true),
    appCtx.isShadowPreparing)
  ) {
    if (
      isEmbedStageMode &&
      isPixelRatioStable &&
      (!isShadowsEnabled || appCtx.shadowAtlasCanvas?.matches(computeRenderPixelRatio(true)))
    ) {
      ((appCtx.isShadowFrozen = isShadowsEnabled),
        isShadowsEnabled || (appCtx.isShadowPreparing = false),
        refreshSceneRender({
          preserveLightCache: shouldPreserveLightCache,
        }));
      return;
    }
    appCtx.isShadowPreparing = appCtx.isShadowFrozen = false;
  }
  const $f2 = appCtx.pendingRuntimeSettings
    ? resolvePixelRatio(isShadowsEnabled)
    : computeRenderPixelRatio(isShadowsEnabled);
  (Math.abs(appCtx.threeRenderer.getPixelRatio() - $f2) > 0.000001 && appCtx.threeRenderer.setPixelRatio($f2),
    refreshSceneRender({
      preserveLightCache: shouldPreserveLightCache,
    }));
}
function handleOrbitStart() {
  const hasShadowPreparePending = appCtx.rendererRestoreTimeoutId !== null;
  (window.clearTimeout(appCtx.rendererRestoreTimeoutId),
    (appCtx.rendererRestoreTimeoutId = null),
    (appCtx.isRenderSuppressed = true),
    (appCtx.isAdaptiveRenderPaused = hasShadowPreparePending || appCtx.isShadowFrozen),
    (appCtx.frameDurationSamples = []),
    (appCtx.samplingWindowStartMs = 0),
    requestStudioRender());
}
function handleOrbitChange() {
  appCtx.isAdaptiveRenderPaused ||
    ((appCtx.isAdaptiveRenderPaused = true),
    requestStudioRender(),
    updateShadowState(true, {
      preserveLightCache: true,
    }));
}
function handleOrbitEnd() {
  const Xi2 = appCtx.isAdaptiveRenderPaused;
  if (
    (resetFrameSamples(),
    (appCtx.isRenderSuppressed = false),
    handleInteractionEnded(),
    (appCtx.isAdaptiveRenderPaused = false),
    (appCtx.samplingWindowStartMs = 0),
    requestStudioRender(),
    window.clearTimeout(appCtx.rendererRestoreTimeoutId),
    !Xi2)
  ) {
    appCtx.pendingRuntimeSettings && !appCtx.isInteractionLocked && syncExportControls();
    return;
  }
  // 立即恢复全质量像素比，避免拖转结束后再糊 140ms。
  ((appCtx.rendererRestoreTimeoutId = null),
    updateShadowState(false, {
      preserveLightCache: true,
    }),
    appCtx.pendingRuntimeSettings && !appCtx.isInteractionLocked && syncExportControls());
}
function refreshFloorControls() {
  const hasMultipleFloors = (appCtx.studioProject?.floors.length || 0) > 1,
    isOverviewMode = getPreviewFloorMode() === "all";
  ((floorCameraActionsElement.hidden = isOverviewMode),
    (overviewCameraActionsElement.hidden = !hasMultipleFloors || !isOverviewMode),
    (previewFloorGapControlElement.hidden = !hasMultipleFloors || !isOverviewMode),
    syncControlValue2(previewFloorGapInput, finite2(appCtx.studioProject?.previewFloorGap, 3).toFixed(1)),
    (previewFloorUniformControlElement.hidden = !hasMultipleFloors || !isOverviewMode),
    (previewFloorUniformInput.checked = appCtx.studioProject?.uniformOverviewStack === true));
  const hasSavedFloorView = !!appCtx.studioState.settings?.fixedCameraView,
    hasSavedOverviewView = !!appCtx.studioProject?.combinedFixedCameraView;
  ((fixedCameraViewButton.disabled = !hasSavedFloorView),
    fixedCameraViewButton.classList.toggle("has-saved-view", hasSavedFloorView),
    (fixedOverviewViewButton.disabled = !hasSavedOverviewView),
    fixedOverviewViewButton.classList.toggle("has-saved-view", hasSavedOverviewView));
  const hasSavedCameraView = isOverviewMode ? hasSavedOverviewView : hasSavedFloorView;
  ((exportSaveViewButton.textContent = isOverviewMode ? "保存总览" : "保存视角"),
    (exportSaveViewButton.title = isOverviewMode
      ? "记录当前导图的全楼角度和投影方式"
      : "记录当前导图的角度、缩放和投影方式"),
    (selectElement("#export-use-fixed").textContent = isOverviewMode ? "恢复总览" : "恢复视角"),
    (selectElement("#export-use-fixed").title = isOverviewMode
      ? "恢复已保存的全楼总览视角"
      : "恢复当前楼层已保存的视角"),
    (selectElement("#export-use-fixed").disabled = !!appCtx.isInteractionLocked || !hasSavedCameraView),
    selectElement("#export-use-fixed").classList.toggle("has-saved-view", hasSavedCameraView));
}
function captureCameraView() {
  return getPreviewFloorMode() === "all"
    ? appCtx.studioProject?.combinedFixedCameraView
    : appCtx.studioState.settings?.fixedCameraView;
}
function storeFixedCameraView(cameraViewSnapshot: any) {
  getPreviewFloorMode() === "all"
    ? (appCtx.studioProject.combinedFixedCameraView = cameraViewSnapshot)
    : (appCtx.studioState.settings.fixedCameraView = cameraViewSnapshot);
}
function createOrbitControls(orbitCamera: any) {
  const orbitControlsHandle = new OrbitControls2(orbitCamera, appCtx.threeRenderer.domElement);
  ((orbitControlsHandle.touchDragThreshold = isEmbeddedStage ? 8 : 0),
    (orbitControlsHandle.enableDamping = true),
    (orbitControlsHandle.rotateSmoothing = 8),
    (orbitControlsHandle.rotateSmoothingThreshold = 0.000001),
    (orbitControlsHandle.dampingFactor = 0.22),
    (orbitControlsHandle.minDistance = 2),
    (orbitControlsHandle.maxDistance = 100),
    (orbitControlsHandle.minZoom = 0.35),
    (orbitControlsHandle.maxZoom = 6),
    (orbitControlsHandle.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE2),
    orbitControlsHandle.target.set(0, 0.6, 0));
  const bind = orbitControlsHandle.update.bind(orbitControlsHandle);
  return (
    (orbitControlsHandle.update = (deltaSeconds: any) => {
      (orbitControlsHandle._quat.identity(),
        orbitControlsHandle._quatInverse.identity(),
        getCameraView() !== "top" &&
          (!isEmbeddedStage ||
            orbitControlsHandle._sphericalDelta.theta ||
            orbitControlsHandle._sphericalDelta.phi) &&
          orbitCamera.up.set(0, 1, 0),
        (orbitControlsHandle.maxPolarAngle = Math.min(
          orbitControlsHandle.maxPolarAngle,
          MAX_CAMERA_POLAR_ANGLE2,
        )),
        (orbitControlsHandle.minPolarAngle = Math.min(
          orbitControlsHandle.minPolarAngle,
          orbitControlsHandle.maxPolarAngle,
        )));
      const boundOrbitDelta = bind(deltaSeconds),
        polarAngle = orbitControlsHandle.getPolarAngle();
      return (
        ((polarAngle >= orbitControlsHandle.maxPolarAngle - 1e-8 &&
          orbitControlsHandle._sphericalDelta.phi > 0) ||
          (polarAngle <= orbitControlsHandle.minPolarAngle + 0.000001 &&
            orbitControlsHandle._sphericalDelta.phi < 0)) &&
          (orbitControlsHandle._sphericalDelta.phi = 0),
        constrainCameraPosition2(orbitCamera.position, orbitControlsHandle.target)
          ? (orbitControlsHandle._sphericalDelta.phi > 0 &&
              (orbitControlsHandle._sphericalDelta.phi = 0),
            orbitCamera.lookAt(orbitControlsHandle.target),
            orbitCamera.updateMatrixWorld(),
            orbitControlsHandle.dispatchEvent({
              type: "change",
            }),
            true)
          : boundOrbitDelta
      );
    }),
    orbitControlsHandle.addEventListener("start", handleOrbitStart),
    orbitControlsHandle.addEventListener("change", () => {
      (updateCameraPlanes(orbitCamera, orbitControlsHandle.target),
        appCtx.isRenderSuppressed
          ? (handleOrbitChange(),
            refreshSceneRender({
              preserveLightCache: true,
            }))
          : refreshSceneRender());
    }),
    orbitControlsHandle.addEventListener("change", () => {
      if (!appCtx.pendingRuntimeSettings || appCtx.isInteractionLocked) return;
      const activePresetSlot = normalizeActiveExportPresetSlot2(
        appCtx.studioProject?.activeExportPresetSlot,
        appCtx.studioProject?.exportPresets?.length,
      );
      appCtx.isExportPresetDirty ||
        appCtx.studioProject?.exportPresets?.[activePresetSlot] ||
        ((appCtx.isExportPresetDirty = true), renderExportPresetSlots());
    }),
    orbitControlsHandle.addEventListener("end", handleOrbitEnd),
    orbitControlsHandle
  );
}
const minCameraNear = 0.02,
  maxCameraNear = 0.6,
  cameraNearFactor = 0.01;
function updateCameraPlanes(planeCamera = appCtx.threeCamera, planeTarget = appCtx.orbitControls?.target) {
  if (!planeCamera || !planeTarget) return false;
  const cameraTargetDistance = Math.max(planeCamera.position.distanceTo(planeTarget), 1),
    computedCameraNear = planeCamera.isPerspectiveCamera
      ? clamp2(cameraTargetDistance * cameraNearFactor, minCameraNear, maxCameraNear)
      : 0.02,
    computedCameraFar = Math.max(
      cameraTargetDistance * (planeCamera.isPerspectiveCamera ? 6 : 5),
      100,
    );
  return Math.abs(planeCamera.near - computedCameraNear) < 0.000001 &&
    Math.abs(planeCamera.far - computedCameraFar) < 0.0001
    ? false
    : ((planeCamera.near = computedCameraNear),
      (planeCamera.far = computedCameraFar),
      planeCamera.updateProjectionMatrix(),
      true);
}
function computeVisibleHeight(heightCamera: any, heightTarget: any) {
  if (heightCamera?.isOrthographicCamera)
    return (
      Math.abs(heightCamera.top - heightCamera.bottom) / Math.max(heightCamera.zoom || 1, 0.000001)
    );
  if (heightCamera?.isPerspectiveCamera) {
    const cameraDistance = Math.max(heightCamera.position.distanceTo(heightTarget), 0.0001),
      degToRad4 = ns2.MathUtils.degToRad(heightCamera.getEffectiveFOV());
    return 2 * cameraDistance * Math.tan(degToRad4 / 2);
  }
  return 10;
}
function adjustFrameSize(visibleHeight: any, viewportAspectRatio = 1, cameraZoomFactor = 1) {
  const clampedAspect = Math.max(finite2(viewportAspectRatio, 1), 0.1),
    clampedZoom = Math.max(finite2(cameraZoomFactor, 1), 0.000001);
  return Math.max(finite2(visibleHeight, 10), 0.000001) * Math.min(1, clampedAspect) * clampedZoom;
}
function computeFrameSize(frameCamera: any, frameTarget: any) {
  const storedFrameSize = Number(frameCamera?.userData?.frameSize);
  if (frameCamera?.isOrthographicCamera && Number.isFinite(storedFrameSize) && storedFrameSize > 0)
    return storedFrameSize;
  const cameraAspect = frameCamera?.userData?.viewportAspect || frameCamera?.aspect || 1,
    cameraZoom = frameCamera?.isOrthographicCamera ? Math.max(frameCamera.zoom || 1, 0.000001) : 1;
  return adjustFrameSize(computeVisibleHeight(frameCamera, frameTarget), cameraAspect, cameraZoom);
}
function computeOrthoFrameSize(orthoCamera: any, orthoTarget: any) {
  const orthoAspect = orthoCamera?.userData?.viewportAspect || orthoCamera?.aspect || 1;
  if (orthoCamera?.isOrthographicCamera) {
    const orthoStoredFrameSize = Number(orthoCamera?.userData?.frameSize);
    if (Number.isFinite(orthoStoredFrameSize) && orthoStoredFrameSize > 0)
      return orthoStoredFrameSize / Math.max(orthoCamera.zoom || 1, 0.000001);
  }
  return adjustFrameSize(computeVisibleHeight(orthoCamera, orthoTarget), orthoAspect);
}
function resolveFrameSize(cameraViewSettings: any, targetAspect: any, targetZoom = 1) {
  const settingsFrameSize = Number(cameraViewSettings?.frameSize);
  return Number.isFinite(settingsFrameSize) && settingsFrameSize > 0
    ? settingsFrameSize
    : adjustFrameSize(cameraViewSettings?.visibleHeight, targetAspect, targetZoom);
}
async function saveCameraView() {
  if (!appCtx.threeCamera || !appCtx.orbitControls) return;
  const cameraViewLabel = getPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
  appCtx.pendingRuntimeSettings || deselectAll();
  const target = appCtx.orbitControls.target;
  if (
    (storeFixedCameraView({
      mode: appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
      view: getCameraView(),
      topRotation: getCameraTopRotation(),
      position: {
        x: appCtx.threeCamera.position.x,
        y: appCtx.threeCamera.position.y,
        z: appCtx.threeCamera.position.z,
      },
      target: {
        x: target.x,
        y: target.y,
        z: target.z,
      },
      visibleHeight: computeVisibleHeight(appCtx.threeCamera, target),
      frameSize: computeOrthoFrameSize(appCtx.threeCamera, target),
      fov: appCtx.threeCamera.isPerspectiveCamera ? appCtx.threeCamera.fov : 36,
      focalLength: appCtx.threeCamera.isPerspectiveCamera ? getCameraFocalLength() : null,
    }),
    refreshFloorControls(),
    appCtx.pendingRuntimeSettings)
  ) {
    ((exportStatusElement.textContent = cameraViewLabel + "已保存"),
      await flushAutosave(),
      showToast(cameraViewLabel + "已保存。"));
    return;
  }
  (markDocumentDirty(),
    window.clearTimeout(appCtx.autosaveTimeoutId),
    (appCtx.autosaveTimeoutId = null),
    await flushAutosave(),
    showToast(
      appCtx.localSaveRevision === appCtx.remoteSaveRevision
        ? cameraViewLabel + "已保存。"
        : cameraViewLabel + "已记录，正在保存…",
    ));
}
function applyCameraSnapshot(snapshotOptions: CameraSnapshotOptions = {}) {
  const cs2 = captureCameraView();
  if (!cs2 || !appCtx.threeCamera || !appCtx.orbitControls) return;
  const hasModeChanged = cs2.mode !== getCameraMode(),
    hasViewChanged = cs2.view !== getCameraView(),
    hasRotationChanged = cs2.topRotation !== getCameraTopRotation(),
    hasFocalLengthChanged =
      cs2.focalLength !== null && Math.abs(cs2.focalLength - getCameraFocalLength()) > 1e-8,
    shouldRecordChange = snapshotOptions.recordChange !== false;
  (hasModeChanged || hasViewChanged || hasRotationChanged || hasFocalLengthChanged) &&
    shouldRecordChange &&
    deselectAll();
  const ut2 = cameraSettings();
  ((ut2.cameraMode = cs2.mode),
    (ut2.cameraView = cs2.view),
    (ut2.cameraTopRotation = cs2.topRotation),
    cs2.focalLength !== null && (ut2.cameraFocalLength = cs2.focalLength),
    setCameraMode(cs2.mode, {
      preserveView: false,
    }));
  const snapshotTargetVector = new ns2.Vector3(cs2.target.x, cs2.target.y, cs2.target.z);
  (appCtx.threeCamera.position.set(cs2.position.x, cs2.position.y, cs2.position.z),
    appCtx.threeCamera.up.copy(
      cs2.view === "top" ? buildCameraUpVector(cs2.topRotation) : new ns2.Vector3(0, 1, 0),
    ),
    (appCtx.threeCamera.userData.viewportAspect ||= Math.max(
      selectElement("#preview-3d").clientWidth /
        Math.max(selectElement("#preview-3d").clientHeight, 1),
      0.1,
    )));
  const ds2 = resolveFrameSize(cs2, appCtx.threeCamera.userData.viewportAspect);
  if (
    ((appCtx.threeCamera.userData.frameSize = ds2),
    (appCtx.threeCamera.userData.cameraView = cs2.view),
    (appCtx.threeCamera.userData.topRotation = cs2.topRotation),
    (appCtx.threeCamera.zoom = 1),
    appCtx.threeCamera.isPerspectiveCamera
      ? ((appCtx.threeCamera.aspect = appCtx.threeCamera.userData.viewportAspect),
        cs2.focalLength !== null
          ? applyCameraFocalLength(appCtx.threeCamera, cs2.focalLength)
          : ((appCtx.threeCamera.fov = cs2.fov),
            appCtx.threeCamera.updateProjectionMatrix(),
            (ut2.cameraFocalLength = clamp2(appCtx.threeCamera.getFocalLength(), 18, 120))))
      : applyOrthoFrame(ds2, appCtx.threeCamera.userData.viewportAspect, appCtx.threeCamera),
    updateCameraPlanes(appCtx.threeCamera, snapshotTargetVector),
    appCtx.threeCamera.lookAt(snapshotTargetVector),
    appCtx.threeCamera.updateProjectionMatrix(),
    appCtx.orbitControls.target.copy(snapshotTargetVector),
    requestStudioRender(),
    appCtx.orbitControls.update(),
    syncCameraModeControls(cs2.mode),
    syncCameraViewControls(cs2.view),
    (hasModeChanged || hasViewChanged || hasRotationChanged || hasFocalLengthChanged) &&
      shouldRecordChange &&
      markDocumentDirty(),
    !snapshotOptions.silent)
  ) {
    const restoredViewLabel = getPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
    showToast("已恢复上次保存的" + restoredViewLabel + "。");
  }
}
function setCameraView(requestedCameraView: any, viewChangeOptions: CameraViewChangeOptions = {}) {
  const cameraViewName = requestedCameraView === "top" ? "top" : "free",
    qn2 = getCameraTopRotation();
  if ((syncCameraViewControls(cameraViewName), !appCtx.threeCamera || !appCtx.orbitControls)) return;
  if (
    appCtx.threeCamera.userData.cameraView === cameraViewName &&
    (cameraViewName !== "top" || appCtx.threeCamera.userData.topRotation === qn2) &&
    viewChangeOptions.force !== true
  ) {
    requestStudioRender();
    return;
  }
  if (cameraViewName === "free") {
    updateCameraView({
      view: "free",
    });
    return;
  }
  const clone = appCtx.orbitControls.target.clone(),
    bo2 = computeVisibleHeight(appCtx.threeCamera, clone),
    wf2 = computeFrameSize(appCtx.threeCamera, clone),
    cameraTopDistance = Math.max(appCtx.threeCamera.position.distanceTo(clone), 8);
  if ((appCtx.threeCamera.up.copy(buildCameraUpVector(qn2)), appCtx.threeCamera.isPerspectiveCamera)) {
    applyCameraFocalLength();
    const degToRad5 = ns2.MathUtils.degToRad(appCtx.threeCamera.getEffectiveFOV()),
      cameraFreeDistance = Math.max(bo2 / (2 * Math.tan(degToRad5 / 2)), 8);
    appCtx.threeCamera.position.set(clone.x, clone.y + cameraFreeDistance, clone.z);
  } else
    (applyOrthoFrame(wf2, appCtx.threeCamera.userData.viewportAspect || 1, appCtx.threeCamera),
      appCtx.threeCamera.position.set(clone.x, clone.y + cameraTopDistance, clone.z));
  ((appCtx.threeCamera.userData.frameSize = wf2),
    (appCtx.threeCamera.userData.cameraView = "top"),
    (appCtx.threeCamera.userData.topRotation = qn2),
    updateCameraPlanes(appCtx.threeCamera, clone),
    appCtx.threeCamera.lookAt(clone),
    appCtx.threeCamera.updateProjectionMatrix(),
    appCtx.orbitControls.target.copy(clone),
    requestStudioRender(),
    appCtx.orbitControls.update());
}
function setCameraMode(requestedCameraMode: any, modeChangeOptions: CameraModeOptions = {}) {
  const cameraModeValue = requestedCameraMode === "perspective" ? "perspective" : "orthographic";
  if ((syncCameraModeControls(cameraModeValue), !appCtx.threeRenderer)) return;
  if ((cameraModeValue === "perspective") == !!appCtx.threeCamera?.isPerspectiveCamera) {
    (applyCameraFocalLength(), requestStudioRender());
    return;
  }
  const shouldPreserveView = modeChangeOptions.preserveView !== false,
    previousCamera = appCtx.threeCamera,
    previousCameraTarget = appCtx.orbitControls?.target.clone() || new ns2.Vector3(0, 0.6, 0),
    sub = previousCamera
      ? previousCamera.position.clone().sub(previousCameraTarget)
      : new ns2.Vector3(1.12, 1.42, 1.2),
    defaultCameraDistance = Math.max(sub.length(), 2),
    normalize =
      sub.lengthSq() > 1e-8 ? sub.normalize() : new ns2.Vector3(1.12, 1.42, 1.2).normalize(),
    newCameraAspect =
      previousCamera?.userData.viewportAspect ||
      Math.max(
        selectElement("#preview-3d").clientWidth /
          Math.max(selectElement("#preview-3d").clientHeight, 1),
        0.1,
      ),
    bo3 =
      shouldPreserveView && previousCamera
        ? computeVisibleHeight(previousCamera, previousCameraTarget)
        : previousCamera?.userData.frameSize || 10,
    oc2 =
      shouldPreserveView && previousCamera
        ? adjustFrameSize(bo3, newCameraAspect)
        : previousCamera?.userData.frameSize || 10;
  if ((appCtx.orbitControls?.dispose(), cameraModeValue === "perspective")) {
    ((appCtx.threeCamera = new ns2.PerspectiveCamera(36, newCameraAspect, 0.02, 200)),
      applyCameraFocalLength(appCtx.threeCamera));
    const computedCameraDistance =
        bo3 / (2 * Math.tan(ns2.MathUtils.degToRad(appCtx.threeCamera.getEffectiveFOV()) / 2)),
      cameraPlacementDistance = shouldPreserveView ? computedCameraDistance : defaultCameraDistance;
    appCtx.threeCamera.position
      .copy(previousCameraTarget)
      .addScaledVector(normalize, Math.max(cameraPlacementDistance, 2));
  } else
    ((appCtx.threeCamera = new ns2.OrthographicCamera(-5, 5, 5, -5, 0.02, 200)),
      appCtx.threeCamera.position
        .copy(previousCameraTarget)
        .addScaledVector(normalize, defaultCameraDistance),
      applyOrthoFrame(oc2, newCameraAspect, appCtx.threeCamera));
  (appCtx.threeCamera.layers.enable(lampsLayerIndex),
    (appCtx.threeCamera.userData.viewportAspect = newCameraAspect),
    (appCtx.threeCamera.userData.frameSize = oc2),
    (appCtx.threeCamera.userData.cameraView = previousCamera?.userData.cameraView || "free"),
    (appCtx.threeCamera.userData.topRotation = previousCamera?.userData.topRotation || 0),
    appCtx.threeCamera.up.copy(previousCamera?.up || new ns2.Vector3(0, 1, 0)),
    updateCameraPlanes(appCtx.threeCamera, previousCameraTarget),
    appCtx.threeCamera.lookAt(previousCameraTarget),
    appCtx.threeCamera.updateProjectionMatrix(),
    (appCtx.orbitControls = createOrbitControls(appCtx.threeCamera)),
    appCtx.orbitControls.target.copy(previousCameraTarget),
    requestStudioRender(),
    (isEmbeddedStage && modeChangeOptions.deferControlUpdate === true) || appCtx.orbitControls.update());
}
function createStudioRenderer() {
  const previewViewportElement = selectElement("#preview-3d");
  try {
    ((appCtx.threeScene = new ns2.Scene()),
      (appCtx.threeCamera = new ns2.OrthographicCamera(-5, 5, 5, -5, 0.05, 200)),
      appCtx.threeCamera.layers.enable(lampsLayerIndex),
      (appCtx.threeRenderer = new ns2.WebGLRenderer({
        antialias: true,
        alpha: true,
        powerPreference: "high-performance",
      })),
      isEmbeddedStage && appCtx.threeRenderer.debug && (appCtx.threeRenderer.debug.checkShaderErrors = false),
      appCtx.threeRenderer.setPixelRatio(computeRenderPixelRatio()),
      (appCtx.threeRenderer.outputColorSpace = ns2.SRGBColorSpace),
      (appCtx.threeRenderer.toneMapping = ns2.NeutralToneMapping),
      (appCtx.threeRenderer.toneMappingExposure = 1.04),
      isEmbeddedStage &&
        isEmbedStageMode &&
        ((appCtx.shadowAtlasCanvas = createMotionBuffer2({
          THREE: ns2,
          renderer: appCtx.threeRenderer,
          maxSamples: interactionResourcePolicy.motion.maxSamples,
        })),
        window.addEventListener(
          "pagehide",
          () => {
            (disposeShadowAtlas(), appCtx.shadowAtlasCanvas.dispose());
          },
          {
            once: true,
          },
        )),
      (appCtx.threeRenderer.shadowMap.enabled = !isEmbedStageMode),
      (appCtx.threeRenderer.shadowMap.type = ns2.VSMShadowMap),
      previewViewportElement.append(appCtx.threeRenderer.domElement),
      isEmbeddedStage &&
        ((appCtx.compiledShaderCache = createBackgroundCache2({
          THREE: ns2,
          renderer: appCtx.threeRenderer,
        })),
        window.addEventListener("pagehide", () => appCtx.compiledShaderCache.dispose(), {
          once: true,
        })),
      ensureDiagnosticsHud(),
      (appCtx.orbitControls = createOrbitControls(appCtx.threeCamera)),
      publishModelLoadState(),
      syncCameraModeControls("orthographic"),
      syncCameraViewControls(),
      (appCtx.hemisphereLight = new ns2.HemisphereLight(12504556, 1515053, 1.12)),
      appCtx.hemisphereLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.hemisphereLight),
      (appCtx.ambientLight = new ns2.AmbientLight(7175581, 0.42)),
      appCtx.ambientLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.ambientLight),
      (appCtx.mainDirectionalLight = new ns2.DirectionalLight(14543103, 2.05)),
      appCtx.mainDirectionalLight.position.set(-7, 22, 6),
      (appCtx.mainDirectionalLight.castShadow = true),
      appCtx.mainDirectionalLight.shadow.mapSize.set(2048, 2048),
      (appCtx.mainDirectionalLight.shadow.camera.left = -20),
      (appCtx.mainDirectionalLight.shadow.camera.right = 20),
      (appCtx.mainDirectionalLight.shadow.camera.top = 20),
      (appCtx.mainDirectionalLight.shadow.camera.bottom = -20),
      (appCtx.mainDirectionalLight.shadow.autoUpdate = false),
      (appCtx.mainDirectionalLight.shadow.needsUpdate = true),
      appCtx.mainDirectionalLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.mainDirectionalLight),
      (appCtx.fillDirectionalLight = new ns2.DirectionalLight(8886724, 0.72)),
      appCtx.fillDirectionalLight.position.set(9, 7, -10),
      appCtx.fillDirectionalLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.fillDirectionalLight),
      (appCtx.topDirectionalLight = new ns2.DirectionalLight(15791103, 0.68)),
      appCtx.topDirectionalLight.position.set(0, 16, 1),
      appCtx.topDirectionalLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.topDirectionalLight),
      (appCtx.sceneRootNode = new ns2.Group()),
      appCtx.threeScene.add(appCtx.sceneRootNode));
    let previousOverviewSource: any,
      previousOverviewGap: any,
      overviewStackCenter = [0, 0, 0],
      floorBoundsById = new Map();
    ((appCtx.overviewStackController = createOverviewStack2({
      THREE: ns2,
      renderer: appCtx.threeRenderer,
      scene: appCtx.threeScene,
      getCamera: () => appCtx.threeCamera,
      getLayout: () => {
        const overviewFloors = appCtx.studioProject?.floors || [],
          overviewFloorGap = appCtx.pendingRuntimeSettings
            ? finite2(appCtx.studioProject?.exportFloorGap, 3)
            : finite2(appCtx.studioProject?.previewFloorGap, 3);
        if (
          appCtx.studioProject?.uniformOverviewStack &&
          (previousOverviewSource !== appCtx.studioProject || previousOverviewGap !== appCtx.sceneRevisionCount)
        ) {
          const overviewBoundsBox = new ns2.Box3();
          floorBoundsById = new Map();
          for (const overviewFloor of overviewFloors) {
            const floorBoundsPoints: any[] = [];
            for (const floorWall of overviewFloor.scene.walls)
              for (const wallEndpoint of [floorWall.start, floorWall.end]) {
                const $a3 = planToWorldPoint(overviewFloor, wallEndpoint);
                (overviewBoundsBox.expandByPoint(new ns2.Vector3($a3.x, 0, $a3.z)),
                  floorBoundsPoints.push(
                    [$a3.x, 0, $a3.z],
                    [$a3.x, finite2(floorWall.height, 2.8), $a3.z],
                  ));
              }
            floorBoundsById.set(overviewFloor.id, floorBoundsPoints);
          }
          ((overviewStackCenter = (
            overviewBoundsBox.isEmpty()
              ? new ns2.Vector3()
              : overviewBoundsBox.getCenter(new ns2.Vector3())
          ).toArray()),
            (previousOverviewSource = appCtx.studioProject),
            (previousOverviewGap = appCtx.sceneRevisionCount));
        }
        return {
          enabled: appCtx.studioProject?.uniformOverviewStack === true,
          floors: overviewFloors,
          gap: overviewFloorGap,
          bounds: floorBoundsById,
          center: [
            overviewStackCenter[0],
            ((overviewFloors.length - 1) * overviewFloorGap) / 2,
            overviewStackCenter[2],
          ],
          amount: appCtx.animatedTransitionValue ?? (getPreviewFloorMode() === "all" ? 1 : 0),
        };
      },
    })),
      window.addEventListener("pagehide", () => appCtx.overviewStackController?.dispose(), {
        once: true,
      }),
      isEmbedStageMode
        ? ((appCtx.contactShadowController = createContactShadowController2({
            THREE: ns2,
            renderer: appCtx.threeRenderer,
            ...(isEmbeddedStage ? interactionResourcePolicy.contactShadows : {}),
            persistentCache: isEmbeddedStage ? stageStartup2?.shadowCache : null,
            getRoot: () => appCtx.sceneRootNode,
            requestFrame: renderStudioFrame,
            followMotion: true,
            maxCapturesPerSync: isEmbeddedStage ? 1 : Infinity,
            deferSurfaceBake: isEmbeddedStage,
            deferInitialBake: isEmbeddedStage,
            surfaceBatchSize: isEmbeddedStage ? 4 : 2,
            canBuild: canBuildScene,
          })),
          (appCtx.regionLightController = createRegionLightController2({
            THREE: ns2,
            renderer: appCtx.threeRenderer,
            reuseRendererMatrices: isEmbeddedStage && interactionResourcePolicy.reuseLightMatrices,
            scene: appCtx.threeScene,
            getRoot: () => appCtx.sceneRootNode,
            contactShadows: appCtx.contactShadowController,
            requestFrame: renderStudioFrame,
          })))
        : (appCtx.lightPrecompileController = createSpotShadowAtlasController2({
            THREE: ns2,
            renderer: appCtx.threeRenderer,
            scene: appCtx.threeScene,
            camera: appCtx.threeCamera,
            syncBeforeRender: isEmbeddedStage,
            requestFrame: renderStudioFrame,
            canBuild: () =>
              !document.hidden &&
              !appCtx.pendingRuntimeSettings &&
              !appCtx.isRenderSuppressed &&
              !appCtx.isPrewarming &&
              !appCtx.isCurtainMoving &&
              !appCtx.isVacuumMoving &&
              !appCtx.isBackgroundMoving &&
              !appCtx.isWindowHidden &&
              !appCtx.isCapturingLights &&
              !hasPendingSceneWork(),
          })),
      refreshBaseLighting(),
      (appCtx.resizeObserverInstance = new ResizeObserver(() => resizeStudioRenderer())),
      appCtx.resizeObserverInstance.observe(previewViewportElement),
      updateCameraView());
    let lastStatsPublishMs = performance.now(),
      lastMotionMs = -Infinity;
    const runStudioFrameStep = (frameStepTimestamp = performance.now()) => {
      if (!appCtx.threeRenderer) return;
      const frameStepDelta = Math.min(
        Math.max((frameStepTimestamp - lastStatsPublishMs) / 1000, 0),
        0.05,
      );
      if (
        ((lastStatsPublishMs = frameStepTimestamp),
        document.hidden || (isEmbeddedStage && appCtx.isExternalModelPending))
      )
        return Infinity;
      const didControlsUpdate = appCtx.orbitControls.update(frameStepDelta);
      didControlsUpdate && (lastMotionMs = frameStepTimestamp);
      const renderWakeValue = frameStepTimestamp - lastMotionMs < 600 ? 0 : Infinity;
      didControlsUpdate && (appCtx.isLightCacheReady = true);
      const Kt3 = appCtx.isRenderSuppressed || didControlsUpdate || appCtx.isPrewarming;
      if (
        (updateMotionStats(frameStepTimestamp, Kt3),
        !appCtx.isLightCacheReady && !appCtx.isLightCacheDeferred && appCtx.isLightCachePending)
      )
        return renderWakeValue;
      const qr2 = appCtx.isLightCacheReady || !appCtx.isLightCachePending;
      appCtx.isLightCacheReady = appCtx.isLightCacheDeferred = false;
      const yy2 = beginMotionMeasurement(Kt3),
        motionMeasureStartMs = isPerformanceDiagnostics ? performance.now() : 0;
      setShadowFreeze(qr2);
      const motionMeasureMs = isPerformanceDiagnostics
        ? performance.now() - motionMeasureStartMs
        : 0;
      (endMotionMeasurement(yy2),
        recordRenderTiming(frameStepTimestamp, motionMeasureMs, Kt3),
        isPerformanceDiagnostics &&
          renderWakeValue === Infinity &&
          publishRenderStats(frameStepTimestamp, true));
      const render = appCtx.threeRenderer.info.render;
      if (
        ((appCtx.threeRenderer.domElement.dataset.renderCalls = String(render.calls)),
        (appCtx.threeRenderer.domElement.dataset.renderTriangles = String(render.triangles)),
        (appCtx.threeRenderer.domElement.dataset.renderLines = String(render.lines)),
        isEmbeddedStage && (isPerformanceDiagnostics || isRenderStatsTest))
      ) {
        const stringify = JSON.stringify({
          ...appCtx.threeRenderer.info.memory,
          programs: appCtx.threeRenderer.info.programs?.length,
          contact: appCtx.contactShadowController?.stats,
        });
        appCtx.threeRenderer.domElement.dataset.renderResources !== stringify &&
          (appCtx.threeRenderer.domElement.dataset.renderResources = stringify);
      }
      return (
        updateRenderStatsHud(),
        recordFrameTime(),
        (appCtx.isLightCachePending = true),
        isEmbeddedStage && appCtx.threeRenderer.domElement.dispatchEvent(new Event("hb-i3d-camera-frame")),
        renderWakeValue
      );
    };
    {
      appCtx.lightingScheduler = createDemandFrameLoop2({
        onWake() {
          const publishNowMs = performance.now();
          publishNowMs - lastStatsPublishMs > 50 && (lastStatsPublishMs = publishNowMs);
        },
        step(frameStepSeconds: any) {
          const frameStepResult = runStudioFrameStep(frameStepSeconds);
          return (
            (appCtx.threeRenderer.domElement.dataset.renderFrameChecks = String(
              appCtx.lightingScheduler.stats.frames,
            )),
            frameStepResult
          );
        },
      });
      const wakeStudio = () => appCtx.lightingScheduler.wake(),
        handlePageVisibility = () => {
          lastStatsPublishMs = performance.now();
          const tf4 = needsMotionPresentation();
          (appCtx.lightingScheduler.setAvailable(tf4),
            tf4
              ? (appCtx.lightPrecompileController?.setContextLost(false),
                renderStudioFrame(),
                appCtx.isFrameDirty && scheduleStudioRender())
              : (disposeShadowAtlas(),
                appCtx.compiledShaderCache?.clear(),
                window.clearTimeout(appCtx.renderCommitTimeoutId),
                (appCtx.renderCommitTimeoutId = null)));
        },
        handleParentVisibility = (visibilityEvent: any) => {
          ((appCtx.isHighDetailQuality = visibilityEvent.detail === true),
            handlePageVisibility(),
            appCtx.isHighDetailQuality && appCtx.isEnvironmentLoading && scheduleLightPrecompile());
        },
        ev2 = bindFrameDriver(handlePageVisibility);
      appCtx.threeRenderer.domElement.addEventListener("hb-i3d-parent-visibility", handleParentVisibility);
      for (const visibilityEventName of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "wheel",
        "keydown",
        "keyup",
      ])
        appCtx.threeRenderer.domElement.addEventListener(visibilityEventName, wakeStudio, {
          passive: true,
        });
      (document.addEventListener("visibilitychange", handlePageVisibility),
        window.addEventListener(
          "pagehide",
          () => {
            (ev2(),
              appCtx.lightingScheduler.dispose(),
              document.removeEventListener("visibilitychange", handlePageVisibility),
              appCtx.lightPrecompileController?.dispose?.(),
              appCtx.regionLightController?.dispose(),
              appCtx.contactShadowController?.dispose(),
              appCtx.threeRenderer.domElement.removeEventListener(
                "hb-i3d-parent-visibility",
                handleParentVisibility,
              ));
            for (const removeEventName of [
              "pointerdown",
              "pointermove",
              "pointerup",
              "pointercancel",
              "wheel",
              "keydown",
              "keyup",
            ])
              appCtx.threeRenderer.domElement.removeEventListener(removeEventName, wakeStudio);
          },
          {
            once: true,
          },
        ),
        handlePageVisibility(),
        wakeStudio());
    }
  } catch (frameDriverError: any) {
    ((selectElement("#webgl-message").hidden = false),
      window.HomeOSLog?.error!(frameDriverError, {
        phase: "studio-webgl-init",
      })!,
      console.error(frameDriverError));
  }
}
function applyOrthoFrame(orthoFrameSize: any, orthoFrameAspect: any, orthoFrameCamera = appCtx.threeCamera) {
  if (!orthoFrameCamera?.isOrthographicCamera) return;
  const frameHalfHeight = Math.max(orthoFrameSize, 1) / 2;
  (orthoFrameAspect >= 1
    ? ((orthoFrameCamera.left = -frameHalfHeight * orthoFrameAspect),
      (orthoFrameCamera.right = frameHalfHeight * orthoFrameAspect),
      (orthoFrameCamera.top = frameHalfHeight),
      (orthoFrameCamera.bottom = -frameHalfHeight))
    : ((orthoFrameCamera.left = -frameHalfHeight),
      (orthoFrameCamera.right = frameHalfHeight),
      (orthoFrameCamera.top = frameHalfHeight / Math.max(orthoFrameAspect, 0.1)),
      (orthoFrameCamera.bottom = -frameHalfHeight / Math.max(orthoFrameAspect, 0.1))),
    orthoFrameCamera.updateProjectionMatrix());
}
function resizeStudioRenderer({ preserveCanvasSize: shouldPreserveCanvasSize = false } = {}) {
  if (!appCtx.threeRenderer) return;
  if (appCtx.pendingRuntimeSettings) {
    resizeRenderCanvas();
    return;
  }
  const previewStageElement = selectElement("#preview-3d"),
    size = isEmbeddedStage ? appCtx.threeRenderer.getSize(new ns2.Vector2()) : null,
    viewportWidth = Math.max(
      shouldPreserveCanvasSize && size ? size.x : previewStageElement.clientWidth,
      1,
    ),
    viewportHeight = Math.max(
      shouldPreserveCanvasSize && size ? size.y : previewStageElement.clientHeight,
      1,
    ),
    isViewportSizeUnchanged = size?.x === viewportWidth && size?.y === viewportHeight,
    join3 = isEmbeddedStage ? appCtx.threeCamera.projectionMatrix.elements.join(",") : "";
  (isViewportSizeUnchanged || appCtx.threeRenderer.setSize(viewportWidth, viewportHeight, false),
    (appCtx.threeCamera.userData.viewportAspect = viewportWidth / viewportHeight),
    appCtx.threeCamera.isOrthographicCamera
      ? applyOrthoFrame(appCtx.threeCamera.userData.frameSize || 10, appCtx.threeCamera.userData.viewportAspect)
      : ((appCtx.threeCamera.aspect = appCtx.threeCamera.userData.viewportAspect), applyCameraFocalLength()),
    (!isViewportSizeUnchanged || join3 !== appCtx.threeCamera.projectionMatrix.elements.join(",")) &&
      refreshSceneRender());
}
function captureOverviewCamera() {
  return !appCtx.threeCamera || !appCtx.orbitControls
    ? null
    : {
        mode: appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
        cameraView: appCtx.threeCamera.userData.cameraView || getCameraView(),
        topRotation: appCtx.threeCamera.userData.topRotation || 0,
        position: appCtx.threeCamera.position.clone(),
        target: appCtx.orbitControls.target.clone(),
        up: appCtx.threeCamera.up.clone(),
        zoom: appCtx.threeCamera.zoom,
        visibleHeight: computeVisibleHeight(appCtx.threeCamera, appCtx.orbitControls.target),
        frameSize: computeFrameSize(appCtx.threeCamera, appCtx.orbitControls.target),
        viewportAspect: appCtx.threeCamera.userData.viewportAspect || 1,
        fov: appCtx.threeCamera.isPerspectiveCamera ? appCtx.threeCamera.fov : 36,
        near: appCtx.threeCamera.near,
        far: appCtx.threeCamera.far,
      };
}
function applyCameraState(
  cameraStateSnapshot: any,
  stateViewportAspect = cameraStateSnapshot?.viewportAspect || 1,
) {
  !cameraStateSnapshot ||
    !appCtx.threeRenderer ||
    (setCameraMode(cameraStateSnapshot.mode, {
      preserveView: false,
    }),
    appCtx.threeCamera.position.copy(cameraStateSnapshot.position),
    appCtx.threeCamera.up.copy(cameraStateSnapshot.up),
    (appCtx.threeCamera.zoom = cameraStateSnapshot.zoom || 1),
    (appCtx.threeCamera.near = cameraStateSnapshot.near),
    (appCtx.threeCamera.far = cameraStateSnapshot.far),
    (appCtx.threeCamera.userData.frameSize = resolveFrameSize(
      cameraStateSnapshot,
      stateViewportAspect,
      cameraStateSnapshot.zoom || 1,
    )),
    (appCtx.threeCamera.userData.viewportAspect = stateViewportAspect),
    (appCtx.threeCamera.userData.cameraView = cameraStateSnapshot.cameraView || getCameraView()),
    (appCtx.threeCamera.userData.topRotation = cameraStateSnapshot.topRotation || 0),
    appCtx.threeCamera.isPerspectiveCamera
      ? ((appCtx.threeCamera.fov = cameraStateSnapshot.fov), (appCtx.threeCamera.aspect = stateViewportAspect))
      : applyOrthoFrame(appCtx.threeCamera.userData.frameSize, stateViewportAspect, appCtx.threeCamera),
    appCtx.threeCamera.lookAt(cameraStateSnapshot.target),
    appCtx.threeCamera.updateProjectionMatrix(),
    appCtx.orbitControls.target.copy(cameraStateSnapshot.target),
    requestStudioRender(),
    appCtx.orbitControls.update());
}
function stateViewportAspectGetCanvasSize() {
  return {
    width: Math.round(clamp2(finite2(exportWidthInput.value, defaultExportWidth), 320, 4096)),
    height: Math.round(clamp2(finite2(exportHeightInput.value, defaultExportHeight), 320, 4096)),
  };
}
function refreshCanvasSizeUi() {
  const { width: wn2, height: wn3 } = stateViewportAspectGetCanvasSize();
  exportResolutionLabelElement.textContent = wn2 + " × " + wn3 + " px";
  const greatestCommonDivisor = ((gcdLeft, gcdRight) => {
      for (; gcdRight;) [gcdLeft, gcdRight] = [gcdRight, gcdLeft % gcdRight];
      return gcdLeft;
    })(wn2, wn3),
    ratioWidth = wn2 / greatestCommonDivisor,
    ratioHeight = wn3 / greatestCommonDivisor;
  ((exportAspectLabelElement.textContent =
    ratioWidth <= 32 && ratioHeight <= 32
      ? ratioWidth + " : " + ratioHeight
      : (wn2 / wn3).toFixed(2) + " : 1"),
    exportPreviewFrameElement.style.setProperty("--export-aspect", String(wn2 / wn3)));
}
function resolvePixelRatio(isExportMode = false) {
  const devicePixelRatioValue = window.devicePixelRatio || 1;
  if (!isAutoDiagramEmbed || !exportPreviewStageElement) return devicePixelRatioValue;
  const { width: wn4, height: wn5 } = stateViewportAspectGetCanvasSize(),
    hostClientWidth = Math.max(exportPreviewStageElement.clientWidth, 1),
    hostClientHeight = Math.max(exportPreviewStageElement.clientHeight, 1),
    cappedPixelRatio = Math.max(
      devicePixelRatioValue,
      wn4 / hostClientWidth,
      wn5 / hostClientHeight,
      1.5,
    );
  return Math.min(cappedPixelRatio, isExportMode ? 2 : 4);
}
function resizeRenderCanvas() {
  if (!appCtx.pendingRuntimeSettings || appCtx.isInteractionLocked || !appCtx.threeRenderer || !appCtx.threeCamera) return;
  const { width: wn6, height: wn7 } = stateViewportAspectGetCanvasSize(),
    canvasAspect = wn6 / wn7,
    canvasClientWidth = Math.max(exportPreviewStageElement.clientWidth, 1),
    canvasClientHeight = Math.max(exportPreviewStageElement.clientHeight, 1),
    $f3 = isAutoDiagramEmbed ? resolvePixelRatio(false) : Math.min(window.devicePixelRatio || 1, 2);
  (appCtx.threeRenderer.setPixelRatio($f3),
    appCtx.threeRenderer.setSize(canvasClientWidth, canvasClientHeight, false),
    (appCtx.threeCamera.userData.viewportAspect = canvasAspect),
    appCtx.threeCamera.isOrthographicCamera
      ? applyOrthoFrame(appCtx.threeCamera.userData.frameSize || 10, canvasAspect, appCtx.threeCamera)
      : ((appCtx.threeCamera.aspect = canvasAspect), applyCameraFocalLength()),
    appCtx.orbitControls.update(),
    refreshSceneRender());
}
function syncCanvasSizeInputs() {
  (refreshCanvasSizeUi(), requestAnimationFrame(() => requestAnimationFrame(resizeRenderCanvas)));
}
function handleCanvasSizeInput(dimensionName: any, shouldCommitSize = false) {
  const inputDimensionValue = Number(
    (dimensionName === "width" ? exportWidthInput : exportHeightInput).value,
  );
  if (!Number.isFinite(inputDimensionValue) || inputDimensionValue <= 0) return;
  let nextCanvasWidth =
      dimensionName === "width" ? inputDimensionValue : Number(exportWidthInput.value),
    nextCanvasHeight =
      dimensionName === "height" ? inputDimensionValue : Number(exportHeightInput.value);
  ((nextCanvasWidth =
    Number.isFinite(nextCanvasWidth) && nextCanvasWidth > 0 ? nextCanvasWidth : defaultExportWidth),
    (nextCanvasHeight =
      Number.isFinite(nextCanvasHeight) && nextCanvasHeight > 0
        ? nextCanvasHeight
        : defaultExportHeight),
    exportLockRatioInput.checked &&
      (dimensionName === "width"
        ? shouldCommitSize
          ? ((nextCanvasWidth = clamp2(nextCanvasWidth, 320, 4096)),
            (nextCanvasHeight = Math.round(nextCanvasWidth / appCtx.exportAspectRatio)),
            nextCanvasHeight < 320 &&
              ((nextCanvasHeight = 320),
              (nextCanvasWidth = Math.round(nextCanvasHeight * appCtx.exportAspectRatio))),
            nextCanvasHeight > 4096 &&
              ((nextCanvasHeight = 4096),
              (nextCanvasWidth = Math.round(nextCanvasHeight * appCtx.exportAspectRatio))))
          : (nextCanvasHeight = Math.round(clamp2(nextCanvasWidth / appCtx.exportAspectRatio, 320, 4096)))
        : shouldCommitSize
          ? ((nextCanvasHeight = clamp2(nextCanvasHeight, 320, 4096)),
            (nextCanvasWidth = Math.round(nextCanvasHeight * appCtx.exportAspectRatio)),
            nextCanvasWidth < 320 &&
              ((nextCanvasWidth = 320),
              (nextCanvasHeight = Math.round(nextCanvasWidth / appCtx.exportAspectRatio))),
            nextCanvasWidth > 4096 &&
              ((nextCanvasWidth = 4096),
              (nextCanvasHeight = Math.round(nextCanvasWidth / appCtx.exportAspectRatio))))
          : (nextCanvasWidth = Math.round(
              clamp2(nextCanvasHeight * appCtx.exportAspectRatio, 320, 4096),
            ))),
    shouldCommitSize
      ? ((nextCanvasWidth = Math.round(clamp2(nextCanvasWidth, 320, 4096))),
        (nextCanvasHeight = Math.round(clamp2(nextCanvasHeight, 320, 4096))),
        (exportWidthInput.value = String(nextCanvasWidth)),
        (exportHeightInput.value = String(nextCanvasHeight)))
      : exportLockRatioInput.checked &&
        (dimensionName === "width"
          ? (exportHeightInput.value = String(nextCanvasHeight))
          : (exportWidthInput.value = String(nextCanvasWidth))),
    syncCanvasSizeInputs());
}
function openExportDialog(exportDialogOptions: ExportDialogOptions = {}) {
  const cs3 = captureCameraView();
  if (!cs3 || !appCtx.pendingRuntimeSettings) return;
  const exportAspect =
      stateViewportAspectGetCanvasSize().width / stateViewportAspectGetCanvasSize().height,
    ut3 = cameraSettings();
  if (
    ((ut3.cameraMode = cs3.mode),
    (ut3.cameraView = cs3.view),
    (ut3.cameraTopRotation = cs3.topRotation),
    cs3.focalLength !== null && (ut3.cameraFocalLength = cs3.focalLength),
    applyCameraState(
      {
        mode: cs3.mode,
        cameraView: cs3.view,
        topRotation: cs3.topRotation,
        position: new ns2.Vector3(cs3.position.x, cs3.position.y, cs3.position.z),
        target: new ns2.Vector3(cs3.target.x, cs3.target.y, cs3.target.z),
        up: cs3.view === "top" ? buildCameraUpVector(cs3.topRotation) : new ns2.Vector3(0, 1, 0),
        zoom: 1,
        visibleHeight: cs3.visibleHeight,
        frameSize: resolveFrameSize(cs3, exportAspect),
        viewportAspect: exportAspect,
        fov: cs3.fov,
        near: 0.02,
        far: Math.max(
          new ns2.Vector3(cs3.position.x, cs3.position.y, cs3.position.z).distanceTo(
            new ns2.Vector3(cs3.target.x, cs3.target.y, cs3.target.z),
          ) * (cs3.mode === "perspective" ? 8 : 5),
          100,
        ),
      },
      exportAspect,
    ),
    syncCameraModeControls(cs3.mode),
    syncCameraViewControls(cs3.view),
    !exportDialogOptions.silent)
  ) {
    const exportViewLabel = getPreviewFloorMode() === "all" ? "总览视角" : "当前层视角";
    ((exportStatusElement.textContent = "已恢复上次保存的" + exportViewLabel),
      showToast("已恢复上次保存的" + exportViewLabel + "。"));
  }
}
function renderExportPresetSlots() {
  const normalizedExportPresets = normalizeExportPresetSlots2(appCtx.studioProject?.exportPresets),
    normalizedActiveSlot = normalizeActiveExportPresetSlot2(
      appCtx.studioProject?.activeExportPresetSlot,
      normalizedExportPresets.length,
    );
  ((appCtx.studioProject.exportPresets = normalizedExportPresets),
    (appCtx.studioProject.activeExportPresetSlot = normalizedActiveSlot));
  const floorNameById = new Map(
    (appCtx.studioProject?.floors || []).map((presetFloor: any) => [presetFloor.id, presetFloor.name]),
  );
  exportPresetSlotsElement.replaceChildren(
    ...normalizedExportPresets.map((exportPreset, presetSlotIndex) => {
      const presetSlotButton = document.createElement("button");
      ((presetSlotButton.type = "button"),
        (presetSlotButton.dataset.exportPresetSlot = String(presetSlotIndex)),
        presetSlotButton.setAttribute("role", "tab"));
      const presetSlotNameLabel = document.createElement("strong"),
        presetSlotStateLabel = document.createElement("small");
      ((presetSlotNameLabel.textContent =
        (exportPreset?.name || floorNameById.get(exportPreset?.floorId) || "未命名存档") as string),
        (presetSlotStateLabel.textContent = exportPreset ? "已设置" : "未设置"));
      const isActivePresetSlot = presetSlotIndex === normalizedActiveSlot;
      return (
        presetSlotButton.classList.toggle("active", isActivePresetSlot),
        presetSlotButton.classList.toggle("has-value", !!exportPreset),
        presetSlotButton.setAttribute("aria-selected", String(isActivePresetSlot)),
        (presetSlotButton.title = exportPreset
          ? presetSlotNameLabel.textContent + "：已设置"
          : presetSlotNameLabel.textContent + "：未设置"),
        presetSlotButton.append(presetSlotNameLabel, presetSlotStateLabel),
        presetSlotButton
      );
    }),
  );
  const activePreset = normalizedExportPresets[normalizedActiveSlot];
  ((exportPresetAddButton.disabled = normalizedExportPresets.length >= MAX_EXPORT_PRESET_COUNT2),
    (exportPresetRenameButton.disabled = !activePreset),
    (exportPresetDeleteButton.disabled = normalizedExportPresets.length <= 1));
  const isPresetEmpty = exportPresetIsEmpty2(activePreset, appCtx.isExportPresetDirty);
  ((exportPresetEmptyStateElement.hidden = !isPresetEmpty),
    (exportPresetEmptyTitleElement.textContent = activePreset
      ? formatPresetLabel(activePreset, normalizedActiveSlot) + "已设置"
      : "当前存档尚未设置"));
}
function buildExportPreset({ name: presetName = "" } = {}) {
  if (appCtx.threeCamera.isPerspectiveCamera) {
    const cameraFocalLengthInput = selectElement("#camera-focal-length"),
      inputFocalLength = clamp2(
        finite2(cameraFocalLengthInput?.value, getCameraFocalLength()),
        18,
        120,
      );
    cameraSettings().cameraFocalLength = inputFocalLength;
    for (const focalLengthControl of cameraFocalLengthControls)
      focalLengthControl.value = String(Math.round(inputFocalLength));
    applyCameraFocalLength(appCtx.threeCamera, inputFocalLength);
  }
  const { width: wn8, height: wn9 } = stateViewportAspectGetCanvasSize(),
    exportCameraTarget = appCtx.orbitControls.target;
  return normalizeExportPreset2({
    name: presetName,
    width: wn8,
    height: wn9,
    lockRatio: exportLockRatioInput.checked,
    floorMode: getPreviewFloorMode() === "all" ? "all" : "floor",
    floorId: getActiveFloor()?.id || appCtx.activeFloorId,
    floorGap: finite2(appCtx.studioProject.exportFloorGap, 3),
    camera: {
      mode: appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
      view: getCameraView(),
      topRotation: getCameraTopRotation(),
      position: {
        x: appCtx.threeCamera.position.x,
        y: appCtx.threeCamera.position.y,
        z: appCtx.threeCamera.position.z,
      },
      target: {
        x: exportCameraTarget.x,
        y: exportCameraTarget.y,
        z: exportCameraTarget.z,
      },
      visibleHeight: computeVisibleHeight(appCtx.threeCamera, exportCameraTarget),
      frameSize: computeOrthoFrameSize(appCtx.threeCamera, exportCameraTarget),
      fov: appCtx.threeCamera.isPerspectiveCamera ? appCtx.threeCamera.fov : 36,
      focalLength: appCtx.threeCamera.isPerspectiveCamera ? getCameraFocalLength() : null,
    },
    folderName: exportFolderNameInput.value,
    selectedFiles: [...collectSelectedExportFiles()],
  });
}
function importCameraPreset(cameraPresetSpec: any) {
  const presetAspect =
      stateViewportAspectGetCanvasSize().width / stateViewportAspectGetCanvasSize().height,
    ut4 = cameraSettings();
  ((ut4.cameraMode = cameraPresetSpec.mode),
    (ut4.cameraView = cameraPresetSpec.view),
    (ut4.cameraTopRotation = cameraPresetSpec.topRotation),
    cameraPresetSpec.focalLength !== null &&
      (ut4.cameraFocalLength = cameraPresetSpec.focalLength));
  const presetPosition = new ns2.Vector3(
      cameraPresetSpec.position.x,
      cameraPresetSpec.position.y,
      cameraPresetSpec.position.z,
    ),
    presetTarget = new ns2.Vector3(
      cameraPresetSpec.target.x,
      cameraPresetSpec.target.y,
      cameraPresetSpec.target.z,
    );
  (applyCameraState(
    {
      mode: cameraPresetSpec.mode,
      cameraView: cameraPresetSpec.view,
      topRotation: cameraPresetSpec.topRotation,
      position: presetPosition,
      target: presetTarget,
      up:
        cameraPresetSpec.view === "top"
          ? buildCameraUpVector(cameraPresetSpec.topRotation)
          : new ns2.Vector3(0, 1, 0),
      zoom: 1,
      visibleHeight: cameraPresetSpec.visibleHeight,
      frameSize: resolveFrameSize(cameraPresetSpec, presetAspect),
      viewportAspect: presetAspect,
      fov: cameraPresetSpec.fov,
      near: 0.02,
      far: Math.max(
        presetPosition.distanceTo(presetTarget) * (cameraPresetSpec.mode === "perspective" ? 8 : 5),
        100,
      ),
    },
    presetAspect,
  ),
    syncCameraModeControls(cameraPresetSpec.mode),
    syncCameraViewControls(cameraPresetSpec.view));
}
function applyExportPreset(presetSlotIndexToApply: any, applyOptions: ApplyExportOptions = {}) {
  const appliedPreset = normalizeExportPreset2(
    appCtx.studioProject?.exportPresets?.[presetSlotIndexToApply],
  );
  if (!appliedPreset || !appCtx.pendingRuntimeSettings) return false;
  ((exportWidthInput.value = String(appliedPreset.width)),
    (exportHeightInput.value = String(appliedPreset.height)),
    (exportLockRatioInput.checked = appliedPreset.lockRatio),
    (appCtx.exportAspectRatio = appliedPreset.width / appliedPreset.height),
    (appCtx.studioProject.exportFloorGap = appliedPreset.floorGap));
  const presetFloorEntry = appCtx.studioProject.floors.find(
      (applyOptionsMatchedFloor: any) => applyOptionsMatchedFloor.id === appliedPreset.floorId,
    ),
    presetFloorId =
      appliedPreset.floorMode === "all" && appCtx.studioProject.floors.length > 1
        ? "all"
        : presetFloorEntry?.id || getActiveFloor()?.id || appCtx.activeFloorId;
  (selectPreviewFloor(presetFloorId),
    (exportFloorGapInput.value = appliedPreset.floorGap.toFixed(1)),
    (exportFolderNameInput.value = appliedPreset.folderName));
  const selectedExportFileSet = new Set(appliedPreset.selectedFiles),
    hasTelevisionFile = selectedExportFileSet.has("televisionOn"),
    hasVehicleFile = selectedExportFileSet.has("vehicleCharging");
  for (const exportFileInput of exportDialogElement.querySelectorAll("input[data-export-file]")) {
    const exportFile = exportFileInput.dataset.exportFile;
    exportFileInput.checked =
      selectedExportFileSet.has(exportFile) ||
      (hasTelevisionFile && exportFile.startsWith("screen:")) ||
      (hasVehicleFile && exportFile.startsWith("vehicle:"));
  }
  return (
    importCameraPreset(appliedPreset.camera),
    refreshCanvasSizeUi(),
    refreshFloorControls(),
    applyOptions.silent ||
      ((exportStatusElement.textContent =
        "已切换到档位 " + String(presetSlotIndexToApply + 1).padStart(2, "0")),
      showToast(
        "已应用导出档位 " + String(presetSlotIndexToApply + 1).padStart(2, "0") + "。",
        "success",
      )),
    syncCanvasSizeInputs(),
    true
  );
}
function selectExportPresetSlot(slotIndex: any) {
  const exportPresetCount = appCtx.studioProject?.exportPresets?.length || 0;
  if (
    !Number.isInteger(slotIndex) ||
    slotIndex < 0 ||
    slotIndex >= exportPresetCount ||
    appCtx.isInteractionLocked
  )
    return;
  (saveExportPreset(), (appCtx.studioProject.activeExportPresetSlot = slotIndex));
  const du2 = applyExportPreset(slotIndex);
  ((appCtx.isExportPresetDirty = false),
    renderExportPresetSlots(),
    markDocumentDirty(),
    du2 ||
      (exportStatusElement.textContent =
        "存档 " + String(slotIndex + 1).padStart(2, "0") + " 没有设置"));
}
function saveExportPreset() {
  if (
    (window.clearTimeout(appCtx.exportPreviewTimeoutId),
    (appCtx.exportPreviewTimeoutId = null),
    !appCtx.isExportPresetDirty)
  )
    return false;
  const targetPresetSlot = normalizeActiveExportPresetSlot2(
    appCtx.studioProject?.activeExportPresetSlot,
    appCtx.studioProject?.exportPresets?.length,
  );
  if (!appCtx.pendingRuntimeSettings || appCtx.isInteractionLocked) return false;
  appCtx.studioProject.exportPresets = normalizeExportPresetSlots2(appCtx.studioProject.exportPresets);
  const currentPresetName = appCtx.studioProject.exportPresets[targetPresetSlot]?.name || "";
  return (
    (appCtx.studioProject.exportPresets[targetPresetSlot] = buildExportPreset({
      name: currentPresetName,
    })),
    (appCtx.isExportPresetDirty = false),
    renderExportPresetSlots(),
    markDocumentDirty(),
    true
  );
}
function syncExportControls() {
  !appCtx.pendingRuntimeSettings ||
    appCtx.isInteractionLocked ||
    ((appCtx.isExportPresetDirty = true),
    renderExportPresetSlots(),
    window.clearTimeout(appCtx.exportPreviewTimeoutId),
    (appCtx.exportPreviewTimeoutId = window.setTimeout(saveExportPreset, 360)));
}
function formatPresetLabel(labelPreset: any, labelSlotIndex: any) {
  if (!labelPreset) return "存档 " + String(labelSlotIndex + 1).padStart(2, "0");
  const presetFloorName = (appCtx.studioProject?.floors || []).find(
    (labelFloor: any) => labelFloor.id === labelPreset.floorId,
  )?.name;
  return (
    labelPreset.name || presetFloorName || "存档 " + String(labelSlotIndex + 1).padStart(2, "0")
  );
}
function makeUniquePresetName(basePresetName: any, ignoredSlotIndex = -1) {
  const normalizedPresetName = normalizeLabelText2(basePresetName, "导出视角", 24),
    presetNameSet = new Set(
      (appCtx.studioProject?.exportPresets || [])
        .map((nameSlotPreset: any, nameSlotIndex: any) =>
          nameSlotIndex === ignoredSlotIndex
            ? ""
            : formatPresetLabel(nameSlotPreset, nameSlotIndex),
        )
        .filter(Boolean),
    );
  if (!presetNameSet.has(normalizedPresetName)) return normalizedPresetName;
  let ignoredSlotIndexDuplicateNameSuffix = 2;
  for (; presetNameSet.has(normalizedPresetName + " " + ignoredSlotIndexDuplicateNameSuffix);)
    ignoredSlotIndexDuplicateNameSuffix += 1;
  return (normalizedPresetName + " " + ignoredSlotIndexDuplicateNameSuffix).slice(0, 24);
}
function saveAsNewPreset() {
  if (!appCtx.pendingRuntimeSettings || appCtx.isInteractionLocked) return;
  if (
    (saveExportPreset(),
    (appCtx.studioProject.exportPresets = normalizeExportPresetSlots2(appCtx.studioProject.exportPresets)),
    appCtx.studioProject.exportPresets.length >= MAX_EXPORT_PRESET_COUNT2)
  ) {
    showToast("最多可以保存 8 个导出存档。");
    return;
  }
  const nextPresetSlotIndex = appCtx.studioProject.exportPresets.length,
    newPresetName =
      getPreviewFloorMode() === "all"
        ? "全楼"
        : getActiveFloor()?.name || "存档 " + (nextPresetSlotIndex + 1),
    hf2 = makeUniquePresetName(newPresetName + "视角"),
    lastExportPreset = appCtx.studioProject.exportPresets
      .slice(0, nextPresetSlotIndex)
      .reverse()
      .find(Boolean),
    vf2 = buildExportPreset({
      name: hf2,
    });
  (lastExportPreset &&
    ((vf2!.width = lastExportPreset.width),
    (vf2!.height = lastExportPreset.height),
    (vf2!.lockRatio = lastExportPreset.lockRatio)),
    appCtx.studioProject.exportPresets.push(vf2),
    (appCtx.studioProject.activeExportPresetSlot = nextPresetSlotIndex),
    (appCtx.isExportPresetDirty = false),
    renderExportPresetSlots(),
    markDocumentDirty(),
    (exportStatusElement.textContent = "已新增“" + hf2 + "”"),
    showToast("已新增“" + hf2 + "”，可以继续调整楼层和视角。", "success"));
}
function closePresetRenameDialog() {
  exportPresetRenameDialogElement.open && exportPresetRenameDialogElement.close();
}
function openPresetRenameDialog() {
  if (appCtx.isInteractionLocked) return;
  saveExportPreset();
  const renamePresetSlots = normalizeExportPresetSlots2(appCtx.studioProject?.exportPresets),
    renameActiveSlot = normalizeActiveExportPresetSlot2(
      appCtx.studioProject?.activeExportPresetSlot,
      renamePresetSlots.length,
    );
  renamePresetSlots[renameActiveSlot] &&
    ((exportPresetRenameInputElement.value = formatPresetLabel(
      renamePresetSlots[renameActiveSlot],
      renameActiveSlot,
    )),
    exportPresetRenameDialogElement.showModal(),
    requestAnimationFrame(() => exportPresetRenameInputElement.select()));
}
function closePresetDeleteDialog() {
  exportPresetDeleteDialogElement.open && exportPresetDeleteDialogElement.close();
}
function openPresetDeleteDialog() {
  if (appCtx.isInteractionLocked) return;
  const deletePresetSlots = normalizeExportPresetSlots2(appCtx.studioProject?.exportPresets);
  if (deletePresetSlots.length <= 1) return;
  const deleteActiveSlot = normalizeActiveExportPresetSlot2(
    appCtx.studioProject?.activeExportPresetSlot,
    deletePresetSlots.length,
  );
  ((exportPresetDeleteNameElement.textContent = formatPresetLabel(
    deletePresetSlots[deleteActiveSlot],
    deleteActiveSlot,
  )),
    exportPresetDeleteDialogElement.showModal());
}
function confirmDeletePreset() {
  const updatedPresetSlots = normalizeExportPresetSlots2(appCtx.studioProject?.exportPresets);
  if (updatedPresetSlots.length <= 1) return;
  const deletedSlotIndex = normalizeActiveExportPresetSlot2(
      appCtx.studioProject?.activeExportPresetSlot,
      updatedPresetSlots.length,
    ),
    ja2 = formatPresetLabel(updatedPresetSlots[deletedSlotIndex], deletedSlotIndex);
  (window.clearTimeout(appCtx.exportPreviewTimeoutId),
    (appCtx.exportPreviewTimeoutId = null),
    (appCtx.isExportPresetDirty = false),
    updatedPresetSlots.splice(deletedSlotIndex, 1),
    (appCtx.studioProject.exportPresets = updatedPresetSlots),
    (appCtx.studioProject.activeExportPresetSlot = Math.min(
      deletedSlotIndex,
      updatedPresetSlots.length - 1,
    )),
    closePresetDeleteDialog());
  const du3 = applyExportPreset(appCtx.studioProject.activeExportPresetSlot, {
    silent: true,
  });
  (renderExportPresetSlots(),
    markDocumentDirty(),
    (exportStatusElement.textContent = du3 ? "已切换到相邻存档" : "当前存档尚未设置"),
    showToast("已删除“" + ja2 + "”，楼层和户型未受影响。", "success"));
}
function ensureSceneRendered(renderAttempt = 0) {
  !isAutoDiagramEmbed ||
    !autoDiagramComponentId ||
    window.parent === window ||
    requestAnimationFrame(() => {
      if (
        !appCtx.pendingRuntimeSettings ||
        !appCtx.threeRenderer ||
        !appCtx.threeScene ||
        !appCtx.threeCamera ||
        !appCtx.orbitControls
      )
        return;
      (resizeRenderCanvas(), appCtx.sceneRootNode?.children?.length || rebuildFloorLayers());
      const hasUsableViewport =
          exportPreviewStageElement.clientWidth > 1 && exportPreviewStageElement.clientHeight > 1,
        hasSceneChildren = !!appCtx.sceneRootNode?.children?.length;
      let isSceneReady = false;
      if (hasUsableViewport && hasSceneChildren) {
        (refreshSceneRender({
          shadows: true,
        }),
          appCtx.orbitControls.update());
        for (let renderRetryIndex = 0; renderRetryIndex < 2; renderRetryIndex += 1)
          appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera);
        const render2 = appCtx.threeRenderer.info.render;
        ((isSceneReady = render2.calls > 0 && render2.triangles > 0),
          (appCtx.threeRenderer.domElement.dataset.renderCalls = String(render2.calls)),
          (appCtx.threeRenderer.domElement.dataset.renderTriangles = String(render2.triangles)),
          (appCtx.threeRenderer.domElement.dataset.renderLines = String(render2.lines)),
          (appCtx.isLightCacheReady = false),
          (appCtx.isLightCachePending = isSceneReady),
          updateRenderStatsHud());
      }
      if (!isSceneReady && renderAttempt < 7) {
        ensureSceneRendered(renderAttempt + 1);
        return;
      }
      if (!isSceneReady) {
        window.parent.postMessage(
          {
            type: "homeos-floorplan-auto-diagram-error",
            componentId: autoDiagramComponentId,
            message: "3D户型首帧渲染失败，请刷新后重试。",
          },
          window.location.origin,
        );
        return;
      }
      window.parent.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-ready",
          componentId: autoDiagramComponentId,
          floors: appCtx.studioProject.floors.map((exportFloorEntry: any) => ({
            id: exportFloorEntry.id,
            name: exportFloorEntry.name,
          })),
          floorSelection:
            getPreviewFloorMode() === "all" ? "all" : getActiveFloor()?.id || appCtx.activeFloorId,
        },
        window.location.origin,
      );
    });
}
function openExportPanel() {
  if (appCtx.pendingRuntimeSettings || !appCtx.threeRenderer || !appCtx.threeCamera || !appCtx.orbitControls) return;
  (window.clearTimeout(appCtx.exportPreviewTimeoutId),
    (appCtx.exportPreviewTimeoutId = null),
    (appCtx.isExportPresetDirty = false));
  const va2 = listLightGroupRows(),
    televisionEntries = listScreenRows(),
    na2 = listChargingRows();
  ((appCtx.pendingRuntimeSettings = {
    canvasParent: appCtx.threeRenderer.domElement.parentElement,
    camera: captureOverviewCamera(),
    selected: appCtx.selectedItem
      ? {
          ...appCtx.selectedItem,
        }
      : null,
    selectedMany: appCtx.selectedItems.map((selectedSceneItem: any) => ({
      ...selectedSceneItem,
    })),
    floorMode: getPreviewFloorMode(),
    selectedFloorId: appCtx.activeFloorId,
    floorCameraSettings: new Map(
      appCtx.studioProject.floors.map((floorCameraEntry: any) => [
        floorCameraEntry.id,
        {
          mode: floorCameraEntry.scene.settings.cameraMode,
          view: floorCameraEntry.scene.settings.cameraView,
          topRotation: floorCameraEntry.scene.settings.cameraTopRotation,
          focalLength: floorCameraEntry.scene.settings.cameraFocalLength,
        },
      ]),
    ),
    combinedCameraSettings: {
      ...appCtx.studioProject.combinedCameraSettings,
    },
    groupStates: new Map(
      va2.map(({ key: groupStateKey, group: groupStateGroup }: any) => [
        groupStateKey,
        groupStateGroup.enabled,
      ]),
    ),
    tvStates: new Map(
      televisionEntries.map(({ key: televisionStateKey, item: televisionStateItem }: any) => [
        televisionStateKey,
        televisionStateItem.screenEnabled !== false,
      ]),
    ),
    carChargingStates: new Map(
      na2.map(({ key: chargingStateKey, item: chargingStateItem }: any) => [
        chargingStateKey,
        chargingStateItem.chargingEnabled === true,
      ]),
    ),
    cameraSettings: {
      mode: getCameraMode(),
      view: getCameraView(),
      topRotation: getCameraTopRotation(),
      focalLength: getCameraFocalLength(),
    },
    pixelRatio: appCtx.threeRenderer.getPixelRatio(),
  }),
    appCtx.lightPrecompileController?.setEnabled(false));
  for (const { group: disabledGroup } of va2) disabledGroup.enabled = false;
  if (
    (refreshSelection(),
    (exportStatusElement.textContent = "准备保存到 NAS"),
    exportFolderNameInput.classList.remove("invalid"),
    renderExportLayers(),
    prepareFreeCameraCapture(),
    refreshFloorControls(),
    renderExportPresetSlots(),
    (exportPackageButton.disabled = false),
    isAutoDiagramEmbed)
  ) {
    document.body.classList.add("auto-diagram-embedded");
    const uRLSearchParams = new URLSearchParams(window.location.search),
      exportWidth = clamp2(
        finite2(
          uRLSearchParams.get("dashboard-width"),
          finite2(uRLSearchParams.get("component-width"), exportWidthInput.value),
        ),
        320,
        4096,
      ),
      exportHeight = clamp2(
        finite2(
          uRLSearchParams.get("dashboard-height"),
          finite2(uRLSearchParams.get("component-height"), exportHeightInput.value),
        ),
        320,
        4096,
      );
    ((exportWidthInput.value = String(Math.round(exportWidth))),
      (exportHeightInput.value = String(Math.round(exportHeight))),
      (exportLockRatioInput.checked = true),
      exportFolderQueryValue && (exportFolderNameInput.value = exportFolderQueryValue),
      refreshCanvasSizeUi());
  }
  (exportDialogElement.showModal(), exportPreviewStageElement.append(appCtx.threeRenderer.domElement));
  const resolvedPresetSlot = normalizeActiveExportPresetSlot2(
      appCtx.studioProject.activeExportPresetSlot,
      appCtx.studioProject.exportPresets.length,
    ),
    du4 =
      resolvedPresetSlot !== null &&
      applyExportPreset(resolvedPresetSlot, {
        silent: true,
      });
  if (isAutoDiagramEmbed && floorSelectionId !== null) {
    const exportFloorMatch = appCtx.studioProject.floors.find(
        (exportFloorCandidate: any) => exportFloorCandidate.id === floorSelectionId,
      ),
      exportFloorId =
        floorSelectionId === "all" && appCtx.studioProject.floors.length > 1
          ? "all"
          : exportFloorMatch?.id || getActiveFloor()?.id || appCtx.activeFloorId;
    selectPreviewFloor(exportFloorId);
  }
  (du4 ||
    (rebuildFloorLayers(),
    captureCameraView()
      ? openExportDialog({
          silent: true,
        })
      : isAutoDiagramEmbed &&
        (setCameraMode(getCameraMode(), {
          preserveView: false,
        }),
        updateCameraView())),
    (appCtx.exportAspectRatio =
      stateViewportAspectGetCanvasSize().width / stateViewportAspectGetCanvasSize().height),
    renderExportPresetSlots(),
    syncCanvasSizeInputs(),
    ensureSceneRendered());
}
function prepareFreeCameraCapture() {
  const isExportAllFloors = getPreviewFloorMode() === "all",
    captureFloorId = isExportAllFloors ? "all" : getActiveFloor()?.id || appCtx.activeFloorId;
  (exportFloorSelectElement.replaceChildren(
    ...appCtx.studioProject.floors.map((captureFloor: any) => {
      const floorOptionElement = document.createElement("option");
      return (
        (floorOptionElement.value = captureFloor.id),
        (floorOptionElement.textContent = captureFloor.name),
        floorOptionElement
      );
    }),
    ...(appCtx.studioProject.floors.length > 1
      ? [
          Object.assign(document.createElement("option"), {
            value: "all",
            textContent: "全楼合并",
          }),
        ]
      : []),
  ),
    (exportFloorSelectElement.value = captureFloorId),
    syncStudioSelect2(exportFloorSelectElement),
    (exportFloorGapControlElement.hidden = !isExportAllFloors || appCtx.studioProject.floors.length <= 1),
    syncControlValue2(exportFloorGapInput, finite2(appCtx.studioProject.exportFloorGap, 3).toFixed(1)),
    refreshFloorControls());
}
function selectPreviewFloor(selectedFloorId: any) {
  if (!appCtx.pendingRuntimeSettings || appCtx.isInteractionLocked) return;
  const isAllFloorsPreview = selectedFloorId === "all" && appCtx.studioProject.floors.length > 1;
  if (!isAllFloorsPreview) {
    const selectedFloor = appCtx.studioProject.floors.find(
      (floorCandidate: any) => floorCandidate.id === selectedFloorId,
    );
    if (!selectedFloor) return;
    ((appCtx.pendingRuntimeSettings.selectedFloorId = selectedFloor.id),
      (appCtx.studioState = selectedFloor.scene));
  }
  ((appCtx.studioProject.previewFloorMode = isAllFloorsPreview ? "all" : "active"),
    prepareFreeCameraCapture(),
    updateFloorPreviewButtons(),
    refreshFloorControls(),
    rebuildFloorLayers(),
    captureCameraView()
      ? openExportDialog({
          silent: true,
        })
      : (setCameraMode(getCameraMode(), {
          preserveView: false,
        }),
        updateCameraView()),
    renderExportLayers(),
    (exportStatusElement.textContent =
      getPreviewFloorMode() === "all"
        ? "正在构图：全楼合并"
        : "正在构图：" + (getActiveFloor()?.name || "当前层")),
    syncCanvasSizeInputs());
}
function collectSelectedExportFiles() {
  return new Set(
    [...exportDialogElement.querySelectorAll("input[data-export-file]:checked")].map(
      (exportFileCheckbox) => exportFileCheckbox.dataset.exportFile,
    ),
  );
}
function restorePreviewAfterExport() {
  if (!appCtx.pendingRuntimeSettings || appCtx.isInteractionLocked) return;
  (openLightingDialog(),
    baseLightControlsElement?.parentElement !== document.body &&
      document.body.append(baseLightControlsElement),
    saveExportPreset());
  const exportSessionState = appCtx.pendingRuntimeSettings;
  for (const sessionFloor of appCtx.studioProject.floors) {
    const floorCameraSettings = exportSessionState.floorCameraSettings.get(sessionFloor.id);
    floorCameraSettings &&
      ((sessionFloor.scene.settings.cameraMode = floorCameraSettings.mode),
      (sessionFloor.scene.settings.cameraView = floorCameraSettings.view),
      (sessionFloor.scene.settings.cameraTopRotation = floorCameraSettings.topRotation),
      (sessionFloor.scene.settings.cameraFocalLength = floorCameraSettings.focalLength));
  }
  ((appCtx.studioProject.combinedCameraSettings = {
    ...exportSessionState.combinedCameraSettings,
  }),
    (appCtx.pendingRuntimeSettings = null),
    (appCtx.studioProject.previewFloorMode = exportSessionState.floorMode),
    (appCtx.studioState =
      appCtx.studioProject.floors.find(
        (sessionFloorCandidate: any) => sessionFloorCandidate.id === appCtx.activeFloorId,
      )?.scene || appCtx.studioProject.floors[0].scene),
    exportSessionState.canvasParent?.append(appCtx.threeRenderer.domElement));
  const ut5 = cameraSettings();
  ((ut5.cameraMode = exportSessionState.cameraSettings.mode),
    (ut5.cameraView = exportSessionState.cameraSettings.view),
    (ut5.cameraTopRotation = exportSessionState.cameraSettings.topRotation),
    (ut5.cameraFocalLength = exportSessionState.cameraSettings.focalLength),
    applyCameraState(exportSessionState.camera, exportSessionState.camera.viewportAspect),
    syncCameraModeControls(exportSessionState.cameraSettings.mode),
    syncCameraViewControls(exportSessionState.cameraSettings.view),
    (appCtx.selectedItem = exportSessionState.selected),
    (appCtx.selectedItems = exportSessionState.selectedMany));
  for (const { key: sessionGroupKey, group: sessionGroup } of listLightGroupRows())
    exportSessionState.groupStates.has(sessionGroupKey) &&
      (sessionGroup.enabled = exportSessionState.groupStates.get(sessionGroupKey));
  for (const { key: sessionTelevisionKey, item: sessionTelevisionItem } of listScreenRows())
    exportSessionState.tvStates.has(sessionTelevisionKey) &&
      (sessionTelevisionItem.screenEnabled = exportSessionState.tvStates.get(sessionTelevisionKey));
  for (const { key: sessionChargingKey, item: sessionChargingItem } of listChargingRows())
    exportSessionState.carChargingStates.has(sessionChargingKey) &&
      (sessionChargingItem.chargingEnabled =
        exportSessionState.carChargingStates.get(sessionChargingKey));
  (appCtx.threeRenderer.setPixelRatio(exportSessionState.pixelRatio),
    rebuildFloorLayers(),
    requestStudioRender(),
    resizeStudioRenderer(),
    refreshStudioUi(),
    refreshStudioView());
}
function setExportBusy(isBusy: any) {
  appCtx.isInteractionLocked = isBusy;
  const exportBusyNoticeElement = selectElement("#export-busy-notice");
  (exportBusyNoticeElement && (exportBusyNoticeElement.hidden = !isBusy),
    (exportPackageButton.disabled = isBusy),
    (selectElement("#export-close").disabled = isBusy));
  for (const exportControl of exportDialogElement.querySelectorAll("input, button"))
    exportControl.id !== "export-close" &&
      exportControl.id !== "export-package" &&
      (exportControl.disabled = isBusy);
  (isBusy || (refreshFloorControls(), renderExportPresetSlots()),
    (appCtx.orbitControls.enabled = !isBusy));
}
function prepareExportRender() {
  appCtx.orbitControls.update();
  for (let exportRenderPassIndex = 0; exportRenderPassIndex < 3; exportRenderPassIndex += 1)
    appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera);
}
function canvasToBlob(blobCanvas: any): Promise<Blob> {
  return new Promise((resolveBlob, rejectBlob) => {
    blobCanvas.toBlob(
      (resultBlob: any) => {
        resultBlob ? resolveBlob(resultBlob) : rejectBlob(new Error("无法生成导出图像。"));
      },
      EXPORT_IMAGE_MIME_TYPE2,
      EXPORT_IMAGE_QUALITY2,
    );
  });
}
async function renderExportImage(
  imageWidth: any,
  imageHeight: any,
  renderImageOptions: ExportImageOptions = {},
): Promise<ExportImageResult> {
  prepareExportRender();
  const exportCanvas = document.createElement("canvas");
  ((exportCanvas.width = imageWidth), (exportCanvas.height = imageHeight));
  const exportCanvasPainter = exportCanvas.getContext("2d", {
    willReadFrequently: renderImageOptions.pixels === true,
  });
  if (!exportCanvasPainter) throw new Error("当前浏览器无法创建导出画布。");
  exportCanvasPainter.drawImage(appCtx.threeRenderer.domElement, 0, 0, imageWidth, imageHeight);
  const exportImageResult: ExportImageResult = {};
  return (
    renderImageOptions.pixels &&
      (exportImageResult.imageData = exportCanvasPainter.getImageData(
        0,
        0,
        imageWidth,
        imageHeight,
      )),
    renderImageOptions.blob && (exportImageResult.blob = await canvasToBlob(exportCanvas)),
    exportImageResult
  );
}
async function renderLightDeltaLayer(basePixelBuffer: any, litPixelBuffer: any) {
  const shadowDeltaCanvas = document.createElement("canvas");
  ((shadowDeltaCanvas.width = basePixelBuffer.width),
    (shadowDeltaCanvas.height = basePixelBuffer.height));
  const shadowDeltaPainter = shadowDeltaCanvas.getContext("2d");
  if (!shadowDeltaPainter) throw new Error("当前浏览器无法创建透明灯光层。");
  const deltaPixels = buildLightDeltaPixels2(basePixelBuffer.data, litPixelBuffer.data);
  return (
    shadowDeltaPainter.putImageData(
      new ImageData(deltaPixels, basePixelBuffer.width, basePixelBuffer.height),
      0,
      0,
    ),
    canvasToBlob(shadowDeltaCanvas)
  );
}
async function renderLightShadowLayer(
  shadowBasePixels: any,
  shadowLightGroup: any,
  shadowWidth: any,
  shadowHeight: any,
  shadowLightIndex: any,
  shadowLightTotal: any,
) {
  const lightShadowCanvas = document.createElement("canvas");
  ((lightShadowCanvas.width = shadowWidth), (lightShadowCanvas.height = shadowHeight));
  const lightShadowPainter = lightShadowCanvas.getContext("2d"),
    shadowMaskCanvas = document.createElement("canvas");
  ((shadowMaskCanvas.width = shadowWidth), (shadowMaskCanvas.height = shadowHeight));
  const shadowMaskPainter = shadowMaskCanvas.getContext("2d");
  if (!lightShadowPainter || !shadowMaskPainter) throw new Error("当前浏览器无法合成逐灯阴影。");
  const shadowLightList = shadowLightGroup.lights.filter(
    (shadowLightEntry: any) => finite2(shadowLightEntry.lightBrightness, 0) > 0,
  );
  try {
    for (
      let shadowLightListIndex = 0;
      shadowLightListIndex < shadowLightList.length;
      shadowLightListIndex += 1
    ) {
      const shadowLightItem = shadowLightList[shadowLightListIndex];
      ((exportStatusElement.textContent =
        "正在渲染灯组 " +
        (shadowLightIndex + 1) +
        "/" +
        shadowLightTotal +
        "：" +
        shadowLightGroup.name +
        "（" +
        (shadowLightListIndex + 1) +
        "/" +
        shadowLightList.length +
        "）"),
        (appCtx.overriddenFloorIds = new Set([shadowLightItem.id])),
        getPreviewFloorMode() === "all"
          ? rebuildFloorLayers({
              preserveLightCache: true,
            })
          : buildLightsLayer({
              preserveLightCache: true,
            }));
      const ja3 = await renderExportImage(shadowWidth, shadowHeight, {
          pixels: true,
        }),
        shadowDeltaPixels = buildLightDeltaPixels2(shadowBasePixels.data, ja3.imageData!.data);
      (shadowMaskPainter.clearRect(0, 0, shadowWidth, shadowHeight),
        shadowMaskPainter.putImageData(
          new ImageData(shadowDeltaPixels, shadowWidth, shadowHeight),
          0,
          0,
        ),
        lightShadowPainter.drawImage(shadowMaskCanvas, 0, 0),
        await ensureRenderReady());
    }
  } finally {
    appCtx.overriddenFloorIds = null;
  }
  return canvasToBlob(lightShadowCanvas);
}
async function renderBackgroundLayer(
  backgroundWidth: any,
  backgroundHeight: any,
  backgroundPixelBuffer: any = null,
) {
  const backgroundCanvas = document.createElement("canvas");
  ((backgroundCanvas.width = backgroundWidth), (backgroundCanvas.height = backgroundHeight));
  const backgroundPainter = backgroundCanvas.getContext("2d");
  if (!backgroundPainter) throw new Error("当前浏览器无法创建导出底图。");
  if (
    ((backgroundPainter.fillStyle =
      "#" + backgroundSettings().background.toString(16).padStart(6, "0")),
    backgroundPainter.fillRect(0, 0, backgroundWidth, backgroundHeight),
    backgroundPixelBuffer)
  ) {
    const backgroundPlanCanvas = document.createElement("canvas");
    ((backgroundPlanCanvas.width = backgroundWidth),
      (backgroundPlanCanvas.height = backgroundHeight));
    const backgroundPlanPainter = backgroundPlanCanvas.getContext("2d");
    if (!backgroundPlanPainter) throw new Error("当前浏览器无法合成户型底图。");
    (backgroundPlanPainter.putImageData(backgroundPixelBuffer, 0, 0),
      backgroundPainter.drawImage(backgroundPlanCanvas, 0, 0));
  }
  return canvasToBlob(backgroundCanvas);
}
function makeUniqueFileName(
  fileBaseName: any,
  fileNameIndex: any,
  usedFileNameSet: any,
  fileExtension = EXPORT_IMAGE_EXTENSION2,
) {
  const dc2 = sanitizeExportName(fileBaseName, "灯组-" + (fileNameIndex + 1)),
    replace = String(fileExtension).replace(/^\./, "");
  let fileNameSuffix = 1,
    candidateFileName = dc2 + "." + replace;
  for (; usedFileNameSet.has(candidateFileName.toLocaleLowerCase());)
    ((fileNameSuffix += 1), (candidateFileName = dc2 + "-" + fileNameSuffix + "." + replace));
  return (usedFileNameSet.add(candidateFileName.toLocaleLowerCase()), candidateFileName);
}
function buildExportCamera(cameraWidth: any, cameraHeight: any) {
  const exportTargetVector = appCtx.orbitControls.target;
  return {
    mode: appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
    position: {
      x: appCtx.threeCamera.position.x,
      y: appCtx.threeCamera.position.y,
      z: appCtx.threeCamera.position.z,
    },
    target: {
      x: exportTargetVector.x,
      y: exportTargetVector.y,
      z: exportTargetVector.z,
    },
    aspect: cameraWidth / cameraHeight,
    visibleHeight: computeVisibleHeight(appCtx.threeCamera, exportTargetVector),
    frameSize: computeOrthoFrameSize(appCtx.threeCamera, exportTargetVector),
    fov: appCtx.threeCamera.isPerspectiveCamera ? appCtx.threeCamera.fov : null,
  };
}
function buildLightExportEntry(exportLightItem: any, exportLightFloor = getActiveFloor()) {
  const floorPixelsPerMeter = exportLightFloor?.scene?.calibration?.pixelsPerMeter || 1;
  return {
    id: exportLightItem.id,
    floorId: exportLightFloor?.id || null,
    type: exportLightItem.type,
    position: {
      x: exportLightItem.x / floorPixelsPerMeter,
      z: exportLightItem.y / floorPixelsPerMeter,
      elevation: floorElevationFor(exportLightFloor) + (exportLightItem.elevation || 0),
    },
    rotation: exportLightItem.rotation || 0,
    verticalRotation: exportLightItem.verticalRotation || 0,
    stripRollRotation:
      (exportLightItem.type === "striplight" && exportLightItem.stripRollRotation) || 0,
    size: {
      width: exportLightItem.width,
      depth: exportLightItem.depth,
    },
    temperature: exportLightItem.lightTemperature,
    ...(exportLightItem.lightColorRgb
      ? {
          color: exportLightItem.lightColorRgb,
        }
      : {}),
    brightness: exportLightItem.lightBrightness,
    range: exportLightItem.lightRange,
    angle: exportLightItem.lightAngle,
  };
}
function projectItemAnchor(anchorItem: any, anchorFloor: any, anchorFloors = getOrderedFloorList()) {
  if (!anchorItem || !anchorFloor || !appCtx.threeCamera) return null;
  const anchorPixelsPerMeter = anchorFloor.scene?.calibration?.pixelsPerMeter || 1;
  let anchorLocalX = 0,
    anchorElevationY =
      Math.max(0, finite2(anchorItem.elevation, 0)) +
      ((anchorItem.type === "airer" ? -1 : 1) * Math.max(0.02, finite2(anchorItem.height, 0.1))) /
        2;
  anchorItem.type === "courtyard-area" &&
    (anchorElevationY =
      Math.max(0, finite2(anchorItem.elevation, 0)) + courtyardSurfaceRise2(anchorItem) - 0.006);
  let anchorLocalZ = 0;
  if (getPreviewFloorMode() === "all") {
    const itemRelativeX =
        (finite2(anchorItem.x, 0) - finite2(anchorFloor.originX, 0)) / anchorPixelsPerMeter,
      itemRelativeY =
        (finite2(anchorItem.y, 0) - finite2(anchorFloor.originY, 0)) / anchorPixelsPerMeter,
      anchorFloorsItemRotationRad = -ns2.MathUtils.degToRad(finite2(anchorFloor.rotation, 0));
    ((anchorLocalX =
      itemRelativeX * Math.cos(anchorFloorsItemRotationRad) +
      itemRelativeY * Math.sin(anchorFloorsItemRotationRad) +
      finite2(anchorFloor.offsetX, 0)),
      (anchorLocalZ =
        -itemRelativeX * Math.sin(anchorFloorsItemRotationRad) +
        itemRelativeY * Math.cos(anchorFloorsItemRotationRad) +
        finite2(anchorFloor.offsetZ, 0)));
    const sort2 = [...anchorFloors].sort(
        (sortLeftItem, sortRightItem) => sortLeftItem.elevation - sortRightItem.elevation,
      ),
      floorGapOffset = Math.max(
        0,
        sort2.findIndex((indexItem) => indexItem.id === anchorFloor.id),
      );
    anchorElevationY += floorGapOffset * finite2(appCtx.studioProject.exportFloorGap, 3);
  } else {
    const anchorModelOrigin = sceneModelOrigin2(anchorFloor.scene, anchorFloor);
    ((anchorLocalX = (finite2(anchorItem.x, 0) - anchorModelOrigin.x) / anchorPixelsPerMeter),
      (anchorLocalZ = (finite2(anchorItem.y, 0) - anchorModelOrigin.y) / anchorPixelsPerMeter));
  }
  appCtx.threeCamera.updateMatrixWorld(true);
  const project = new ns2.Vector3(anchorLocalX, anchorElevationY, anchorLocalZ).project(
    appCtx.threeCamera,
  );
  return ![project.x, project.y, project.z].every(Number.isFinite) ||
    project.z < -1 ||
    project.z > 1
    ? null
    : {
        x: clamp2((project.x + 1) / 2, 0, 1),
        y: clamp2((1 - project.y) / 2, 0, 1),
      };
}
function projectLightGroupAnchor(
  anchorLights: any,
  anchorGroupFloor: any,
  anchorGroupFloors = getOrderedFloorList(),
) {
  for (const anchorLightItem of anchorLights || []) {
    const zu2 = projectItemAnchor(anchorLightItem, anchorGroupFloor, anchorGroupFloors);
    if (zu2) return zu2;
  }
  return null;
}
async function blobToBytes(sourceBlob: any) {
  return new Uint8Array(await sourceBlob.arrayBuffer());
}
function applyExportVisibility(groupKeyFilter = "", screenKeyFilter = "", vehicleKeyFilter = "") {
  for (const { key: visibleGroupKey, group: visibleGroup } of listLightGroupRows())
    visibleGroup.enabled = groupKeyFilter === "*" || visibleGroupKey === groupKeyFilter;
  for (const { key: visibleScreenKey, item: visibleScreenItem } of listScreenRows())
    visibleScreenItem.screenEnabled =
      screenKeyFilter === "*" || visibleScreenKey === screenKeyFilter;
  for (const { key: visibleVehicleKey, item: visibleVehicleItem } of listChargingRows())
    visibleVehicleItem.chargingEnabled =
      vehicleKeyFilter === "*" || visibleVehicleKey === vehicleKeyFilter;
  rebuildFloorLayers();
}
const exportVisibilityByObject = new WeakMap();
function setExportRoleVisibility(exportRole: any, isRoleVisible: any) {
  appCtx.sceneRootNode &&
    (appCtx.sceneRootNode.traverse((roleObject: any) => {
      roleObject.userData?.exportRole === exportRole &&
        (isRoleVisible
          ? exportVisibilityByObject.has(roleObject) &&
            ((roleObject.visible = exportVisibilityByObject.get(roleObject)),
            exportVisibilityByObject.delete(roleObject))
          : (exportVisibilityByObject.has(roleObject) ||
              exportVisibilityByObject.set(roleObject, roleObject.visible),
            (roleObject.visible = false)));
    }),
    refreshSceneRender({
      shadows: exportRole === "plan",
    }));
}
function resolveOverwriteChoice(overwriteChoice = "cancel") {
  const bl3 = appCtx.overwriteResolver;
  ((appCtx.overwriteResolver = null),
    exportOverwriteDialogElement.open && exportOverwriteDialogElement.close(),
    bl3?.(overwriteChoice));
}
function showConflictDialog(dialogWindowHost: any, conflictFolderName: any) {
  const document2 = dialogWindowHost.document,
    conflictDialogElement = document2.createElement("dialog");
  return (
    (conflictDialogElement.className = "settings-dialog floorplan-auto-diagram-dialog"),
    conflictDialogElement.setAttribute("aria-label", "同名导图已经存在"),
    (conflictDialogElement.innerHTML =
      '<div class="dialog-heading"><div><span>EXPORT EXISTS</span><h2>同名导图已经存在</h2></div></div>\n    <div class="floorplan-auto-diagram-guide">\n      <p>文件夹“<strong data-export-folder></strong>”已经存在。覆盖会整体替换原文件夹，原来存在但本次未导出的文件也会删除，已有仪表盘引用的同名图片会更新。</p>\n      <div class="dialog-actions"><button type="button" data-export-choice="cancel">不覆盖</button><button type="button" class="primary" data-export-choice="overwrite">覆盖更新</button></div>\n    </div>'),
    (conflictDialogElement.querySelector("[data-export-folder]").textContent = conflictFolderName),
    new Promise((resolveConflict, rejectConflict) => {
      let isConflictSettled = false;
      const settleConflictChoice = (chosenExportChoice: any) => {
          isConflictSettled ||
            ((isConflictSettled = true),
            window.removeEventListener("pagehide", cancelConflictDialog),
            dialogWindowHost.removeEventListener("pagehide", cancelConflictDialog),
            conflictDialogElement.open && conflictDialogElement.close(),
            conflictDialogElement.remove(),
            resolveConflict(chosenExportChoice));
        },
        cancelConflictDialog = () => settleConflictChoice("cancel");
      (conflictDialogElement.addEventListener("cancel", (conflictFolderNameDialogCancelEvent: any) => {
        (conflictFolderNameDialogCancelEvent.preventDefault(), cancelConflictDialog());
      }),
        conflictDialogElement.addEventListener("close", cancelConflictDialog));
      for (const conflictChoiceButton of conflictDialogElement.querySelectorAll(
        "[data-export-choice]",
      ))
        conflictChoiceButton.addEventListener("click", () =>
          settleConflictChoice(conflictChoiceButton.dataset.exportChoice),
        );
      (window.addEventListener("pagehide", cancelConflictDialog),
        dialogWindowHost.addEventListener("pagehide", cancelConflictDialog));
      try {
        (document2.body.append(conflictDialogElement),
          conflictDialogElement.showModal(),
          conflictDialogElement.querySelector('[data-export-choice="cancel"]').focus());
      } catch (conflictDialogError: any) {
        (window.removeEventListener("pagehide", cancelConflictDialog),
          dialogWindowHost.removeEventListener("pagehide", cancelConflictDialog),
          conflictDialogElement.remove(),
          rejectConflict(conflictDialogError));
      }
    })
  );
}
function beginExportFlow(exportFolderName: any) {
  return (
    appCtx.overwriteResolver && resolveOverwriteChoice("cancel"),
    isAutoDiagramEmbed && autoDiagramComponentId && window.parent !== window
      ? showConflictDialog(window.parent, exportFolderName)
      : ((exportOverwriteNameElement.textContent = exportFolderName),
        exportOverwriteDialogElement.showModal(),
        new Promise((resolveOverwrite) => {
          appCtx.overwriteResolver = resolveOverwrite;
        }))
  );
}
function reportExportFailure(failureReason: any, failureMessage: any) {
  !isAutoDiagramEmbed ||
    !autoDiagramComponentId ||
    window.parent === window ||
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-stopped",
        componentId: autoDiagramComponentId,
        reason: failureReason,
        message: failureMessage,
      },
      window.location.origin,
    );
}
function showExportResult(exportResult: any) {
  if (isAutoDiagramEmbed && autoDiagramComponentId && window.parent !== window) return;
  const isOverwritten = exportResult?.overwritten === true;
  ((exportCompleteTitleElement.textContent = isOverwritten ? "导图覆盖完成" : "导图保存完成"),
    (exportCompleteMessageElement.textContent = isOverwritten
      ? "新导图已经安全替换原文件夹，已有仪表盘中的同名图片会自动更新。"
      : "导出的图片和数据已经保存到 NAS，可以在编辑器素材中继续使用。"),
    (exportCompletePathElement.textContent = "data/" + (exportResult?.relativePath || "exports")),
    exportCompleteDialogElement.open || exportCompleteDialogElement.showModal());
}
async function generateExportBundle() {
  if (!appCtx.pendingRuntimeSettings || appCtx.isInteractionLocked) return;
  saveExportPreset();
  const trim = exportFolderNameInput.value.trim();
  if (
    !trim ||
    /[<>:\"/\\|?*\x00-\x1f\x7f]/.test(trim) ||
    trim.startsWith(".") ||
    /[. ]$/.test(trim)
  ) {
    (exportFolderNameInput.classList.add("invalid"),
      exportFolderNameInput.focus(),
      (exportStatusElement.textContent = "请输入有效的文件夹名"));
    return;
  }
  exportFolderNameInput.classList.remove("invalid");
  const qf2 = collectSelectedExportFiles();
  if (!qf2.size) {
    exportStatusElement.textContent = "请至少勾选一项图片";
    return;
  }
  const exportBaseSize = stateViewportAspectGetCanvasSize(),
    { width: exportTargetWidth, height: exportTargetHeight } = scaledExportResolution2(
      exportBaseSize.width,
      exportBaseSize.height,
      EXPORT_RENDER_SCALE2,
    ),
    tu3 = captureOverviewCamera(),
    exportFileNames = {
      background: "00底图." + EXPORT_IMAGE_EXTENSION2,
      backgroundWithPlan: "00底图带户型." + EXPORT_IMAGE_EXTENSION2,
      floorPlan: "00户型图." + EXPORT_IMAGE_EXTENSION2,
    },
    usedExportNameSet = new Set(
      Object.values(exportFileNames).map((exportNameValue) => exportNameValue.toLocaleLowerCase()),
    ),
    wl3 = getOrderedFloorList(),
    exportGroups = listLightGroupRows(wl3)
      .map(
        ({
          floor: exportGroupFloor,
          group: exportGroup,
          index: exportGroupIndex,
          key: exportGroupKey,
        }: any) => ({
          id: exportGroupKey,
          groupId: exportGroup.id,
          floor: exportGroupFloor,
          name: wl3.length > 1 ? exportGroupFloor.name + "-" + exportGroup.name : exportGroup.name,
          enabledInEditor: appCtx.pendingRuntimeSettings.groupStates.get(exportGroupKey) !== false,
          file: makeUniqueFileName(
            wl3.length > 1 ? exportGroupFloor.name + "-" + exportGroup.name : exportGroup.name,
            exportGroupIndex,
            usedExportNameSet,
          ),
          lights: exportGroupFloor.scene.items.filter(
            (groupLightItem: any) =>
              lampItemTypeSet.has(groupLightItem.type) &&
              groupLightItem.lightGroupId === exportGroup.id,
          ),
        }),
      )
      .filter((filteredGroup: any) => qf2.has("group:" + filteredGroup.id)),
    exportScreenEntries = listScreenRows(wl3).map(
      ({
        floor: generateExportBundleScreenFloor,
        item: screenEntryItem,
        index: screenEntryIndex,
        key: screenEntryKey,
      }: any) => ({
        id: "screen-" + screenEntryKey,
        key: screenEntryKey,
        floorId: generateExportBundleScreenFloor.id,
        itemId: screenEntryItem.id,
        name:
          "" +
          (wl3.length > 1 ? generateExportBundleScreenFloor.name + "-" : "") +
          (screenEntryItem.screenLayerName || "电视画面 " + (screenEntryIndex + 1)),
        enabledInEditor: appCtx.pendingRuntimeSettings.tvStates.get(screenEntryKey) !== false,
        floor: generateExportBundleScreenFloor,
        item: screenEntryItem,
        file: null as any,
      }),
    ),
    exportVehicleEntries = listChargingRows(wl3).map(
      ({
        floor: vehicleFloor,
        item: vehicleEntryItem,
        index: vehicleEntryIndex,
        key: vehicleEntryKey,
      }: any) => ({
        id: "vehicle-" + vehicleEntryKey,
        key: vehicleEntryKey,
        floorId: vehicleFloor.id,
        itemId: vehicleEntryItem.id,
        name:
          "" +
          (wl3.length > 1 ? vehicleFloor.name + "-" : "") +
          (vehicleEntryItem.chargingLayerName || "汽车充电 " + (vehicleEntryIndex + 1)),
        chargingInEditor: appCtx.pendingRuntimeSettings.carChargingStates.get(vehicleEntryKey) === true,
        floor: vehicleFloor,
        item: vehicleEntryItem,
        file: null as any,
      }),
    );
  for (
    let screenFileIndex = 0;
    screenFileIndex < exportScreenEntries.length;
    screenFileIndex += 1
  ) {
    const screenFileEntry = exportScreenEntries[screenFileIndex];
    screenFileEntry.file = makeUniqueFileName(
      screenFileEntry.name,
      screenFileIndex,
      usedExportNameSet,
    );
  }
  for (
    let vehicleFileIndex = 0;
    vehicleFileIndex < exportVehicleEntries.length;
    vehicleFileIndex += 1
  ) {
    const vehicleFileEntry = exportVehicleEntries[vehicleFileIndex];
    vehicleFileEntry.file = makeUniqueFileName(
      vehicleFileEntry.name,
      vehicleFileIndex,
      usedExportNameSet,
    );
  }
  const selectedScreenEntries = exportScreenEntries.filter((selectedScreenEntry: any) =>
      qf2.has("screen:" + selectedScreenEntry.key),
    ),
    selectedVehicleEntries = exportVehicleEntries.filter((selectedVehicleEntry: any) =>
      qf2.has("vehicle:" + selectedVehicleEntry.key),
    ),
    hasAnyLayer =
      qf2.has("backgroundWithPlan") ||
      qf2.has("floorPlan") ||
      selectedScreenEntries.length > 0 ||
      selectedVehicleEntries.length > 0 ||
      exportGroups.length > 0;
  let isOverwriting = false;
  setExportBusy(true);
  try {
    if (
      ((exportStatusElement.textContent = "正在检查文件夹名…"),
      (
        await fetchStudioApi("/studio3d/exports/check", {
          headers: {
            "X-Export-Folder": encodeURIComponent(trim),
          },
        })
      )?.exists)
    ) {
      exportStatusElement.textContent = "同名导图“" + trim + "”已经存在";
      const zf2 = await beginExportFlow(trim);
      if (zf2 === "rename") {
        ((exportStatusElement.textContent = "请修改文件夹名后重新保存"),
          window.setTimeout(() => {
            (exportFolderNameInput.focus(), exportFolderNameInput.select());
          }, 0),
          reportExportFailure("rename", "请在属性中修改文件夹名称后重新生成。"));
        return;
      }
      if (zf2 !== "overwrite") {
        ((exportStatusElement.textContent = "已取消覆盖，原导图保持不变"),
          reportExportFailure("cancel", "已取消覆盖，原导图保持不变。"));
        return;
      }
      isOverwriting = true;
    }
    (appCtx.threeRenderer.setPixelRatio(1),
      appCtx.threeRenderer.setSize(exportTargetWidth, exportTargetHeight, false),
      applyCameraState(tu3, exportTargetWidth / exportTargetHeight),
      setShadowQualityHigh(true),
      (exportStatusElement.textContent = "正在生成精细阴影导出图层…"),
      applyExportVisibility());
    let onStateImage: any = null,
      baseStateImage: any = null;
    (qf2.has("background") &&
      (setExportRoleVisibility("plan", false),
      setExportRoleVisibility("label", false),
      setExportRoleVisibility("outline", false),
      (onStateImage = await renderExportImage(exportTargetWidth, exportTargetHeight, {
        pixels: true,
      })),
      setExportRoleVisibility("plan", true),
      setExportRoleVisibility("label", true),
      setExportRoleVisibility("outline", true)),
      hasAnyLayer &&
        (baseStateImage = await renderExportImage(exportTargetWidth, exportTargetHeight, {
          pixels: true,
        })));
    const generatedFileEntries: any[] = [];
    if (onStateImage) {
      const yf2 = await renderBackgroundLayer(
        exportTargetWidth,
        exportTargetHeight,
        onStateImage.imageData,
      );
      generatedFileEntries.push({
        name: exportFileNames.background,
        data: await blobToBytes(yf2),
      });
    }
    if (qf2.has("backgroundWithPlan")) {
      const yf3 = await renderBackgroundLayer(
        exportTargetWidth,
        exportTargetHeight,
        baseStateImage.imageData,
      );
      generatedFileEntries.push({
        name: exportFileNames.backgroundWithPlan,
        data: await blobToBytes(yf3),
      });
    }
    if (qf2.has("floorPlan")) {
      (setExportRoleVisibility("background", false), setExportRoleVisibility("grid", false));
      const ja4 = await renderExportImage(exportTargetWidth, exportTargetHeight, {
        blob: true,
      });
      (setExportRoleVisibility("background", true),
        setExportRoleVisibility("grid", true),
        generatedFileEntries.push({
          name: exportFileNames.floorPlan,
          data: await blobToBytes(ja4.blob),
        }));
    }
    for (let groupFileIndex = 0; groupFileIndex < exportGroups.length; groupFileIndex += 1) {
      const generatedGroupEntry = exportGroups[groupFileIndex],
        lv2 = await renderLightShadowLayer(
          baseStateImage.imageData,
          generatedGroupEntry,
          exportTargetWidth,
          exportTargetHeight,
          groupFileIndex,
          exportGroups.length,
        );
      generatedFileEntries.push({
        name: generatedGroupEntry.file,
        data: await blobToBytes(lv2),
      });
    }
    for (
      let screenLayerIndex = 0;
      screenLayerIndex < selectedScreenEntries.length;
      screenLayerIndex += 1
    ) {
      const generatedScreenEntry = selectedScreenEntries[screenLayerIndex];
      ((exportStatusElement.textContent =
        "正在生成电视图层 " +
        (screenLayerIndex + 1) +
        "/" +
        selectedScreenEntries.length +
        "：" +
        generatedScreenEntry.name),
        applyExportVisibility("", generatedScreenEntry.key));
      const ja5 = await renderExportImage(exportTargetWidth, exportTargetHeight, {
          pixels: true,
        }),
        uf2 = await renderLightDeltaLayer(baseStateImage.imageData, ja5.imageData);
      generatedFileEntries.push({
        name: generatedScreenEntry.file,
        data: await blobToBytes(uf2),
      });
    }
    for (
      let vehicleLayerIndex = 0;
      vehicleLayerIndex < selectedVehicleEntries.length;
      vehicleLayerIndex += 1
    ) {
      const generatedVehicleEntry = selectedVehicleEntries[vehicleLayerIndex];
      ((exportStatusElement.textContent =
        "正在生成汽车图层 " +
        (vehicleLayerIndex + 1) +
        "/" +
        selectedVehicleEntries.length +
        "：" +
        generatedVehicleEntry.name),
        applyExportVisibility("", "", generatedVehicleEntry.key));
      const ja6 = await renderExportImage(exportTargetWidth, exportTargetHeight, {
          pixels: true,
        }),
        uf3 = await renderLightDeltaLayer(baseStateImage.imageData, ja6.imageData);
      generatedFileEntries.push({
        name: generatedVehicleEntry.file,
        data: await blobToBytes(uf3),
      });
    }
    const exportManifest = {
      schemaVersion: 3,
      exportName: trim,
      floorMode: getPreviewFloorMode(),
      floorPresentationGap:
        getPreviewFloorMode() === "all" ? finite2(appCtx.studioProject.exportFloorGap, 3) : 0,
      floors: wl3.map((manifestFloor: any) => ({
        id: manifestFloor.id,
        name: manifestFloor.name,
        elevation: floorElevationFor(manifestFloor),
        offsetX: manifestFloor.offsetX,
        offsetZ: manifestFloor.offsetZ,
        rotation: manifestFloor.rotation,
      })),
      generatedAt: new Date().toISOString(),
      resolution: {
        width: exportTargetWidth,
        height: exportTargetHeight,
      },
      sourceResolution: exportBaseSize,
      renderScale: EXPORT_RENDER_SCALE2,
      imageFormat: {
        extension: EXPORT_IMAGE_EXTENSION2,
        mimeType: EXPORT_IMAGE_MIME_TYPE2,
        quality: EXPORT_IMAGE_QUALITY2,
      },
      camera: buildExportCamera(exportTargetWidth, exportTargetHeight),
      backgroundImage: qf2.has("background") ? exportFileNames.background : null,
      baseImage: qf2.has("backgroundWithPlan") ? exportFileNames.backgroundWithPlan : null,
      floorPlanImage: qf2.has("floorPlan") ? exportFileNames.floorPlan : null,
      televisionOnImage: selectedScreenEntries.length === 1 ? selectedScreenEntries[0].file : null,
      televisionOnImages: selectedScreenEntries.map((manifestScreen: any) => manifestScreen.file),
      vehicleChargingImage:
        selectedVehicleEntries.length === 1 ? selectedVehicleEntries[0].file : null,
      vehicleChargingImages: selectedVehicleEntries.map((manifestVehicle: any) => manifestVehicle.file),
      exportedFiles: generatedFileEntries.map((manifestFile) => manifestFile.name),
      groups: exportGroups.map((manifestGroup: any) => ({
        id: manifestGroup.id,
        groupId: manifestGroup.groupId,
        floorId: manifestGroup.floor.id,
        name: manifestGroup.name,
        file: manifestGroup.file,
        anchor: projectLightGroupAnchor(manifestGroup.lights, manifestGroup.floor, wl3),
        enabledInEditor: manifestGroup.enabledInEditor,
        lights: manifestGroup.lights.map((manifestLight: any) =>
          buildLightExportEntry(manifestLight, manifestGroup.floor),
        ),
      })),
      screens: exportScreenEntries.map(
        ({
          key: manifestScreenKey,
          floor: manifestScreenFloor,
          item: manifestScreenItem,
          ...manifestScreenRest
        }: any) => ({
          ...manifestScreenRest,
          anchor: projectItemAnchor(manifestScreenItem, manifestScreenFloor, wl3),
          file: qf2.has("screen:" + manifestScreenKey) ? manifestScreenRest.file : null,
        }),
      ),
      vehicles: exportVehicleEntries.map(
        ({
          key: manifestVehicleKey,
          floor: manifestVehicleFloor,
          item: manifestVehicleItem,
          ...manifestVehicleRest
        }: any) => ({
          ...manifestVehicleRest,
          anchor: projectItemAnchor(manifestVehicleItem, manifestVehicleFloor, wl3),
          file: qf2.has("vehicle:" + manifestVehicleKey) ? manifestVehicleRest.file : null,
        }),
      ),
    };
    if (
      (qf2.has("dataLights") &&
        generatedFileEntries.push({
          name: "lights.json",
          data: new TextEncoder().encode(JSON.stringify(exportManifest, null, 2) + "\n"),
        }),
      qf2.has("dataScene"))
    ) {
      const exportScenePayload =
        getPreviewFloorMode() === "all" ? captureStudioSnapshot() : captureUndoSnapshot();
      generatedFileEntries.push({
        name: "scene.json",
        data: new TextEncoder().encode(JSON.stringify(exportScenePayload, null, 2) + "\n"),
      });
    }
    exportStatusElement.textContent = "正在打包 ZIP…";
    const zipBytes = buildStoredZip2(generatedFileEntries);
    exportStatusElement.textContent = "正在保存到 NAS data…";
    const blob = new Blob([zipBytes], {
        type: "application/zip",
      }),
      saveExportBundle = (shouldOverwrite = false) =>
        fetchStudioApi("/studio3d/exports", {
          method: "POST",
          body: blob,
          headers: {
            "Content-Type": "application/zip",
            "X-Export-Folder": encodeURIComponent(trim),
            ...(shouldOverwrite
              ? {
                  "X-Export-Overwrite": "true",
                }
              : {}),
          },
        });
    let saveResult;
    try {
      saveResult = await saveExportBundle(isOverwriting);
    } catch (saveConflictError: any) {
      if (
        saveConflictError?.status !== 409 ||
        saveConflictError?.payload?.detail?.code !== "STUDIO3D_EXPORT_EXISTS"
      )
        throw saveConflictError;
      exportStatusElement.textContent = "同名导图“" + trim + "”已经存在";
      const zf3 = await beginExportFlow(trim);
      if (zf3 === "rename") {
        ((exportStatusElement.textContent = "请修改文件夹名后重新保存"),
          window.setTimeout(() => {
            (exportFolderNameInput.focus(), exportFolderNameInput.select());
          }, 0),
          reportExportFailure("rename", "请在属性中修改文件夹名称后重新生成。"));
        return;
      }
      if (zf3 !== "overwrite") {
        ((exportStatusElement.textContent = "已取消覆盖，原导图保持不变"),
          reportExportFailure("cancel", "已取消覆盖，原导图保持不变。"));
        return;
      }
      ((exportStatusElement.textContent = "正在安全覆盖原导图…"),
        (saveResult = await saveExportBundle(true)));
    }
    ((exportStatusElement.textContent = "已保存到 data/" + saveResult.relativePath),
      showToast("导图已保存到 data/" + saveResult.relativePath, "success"));
    const parent = isAutoDiagramEmbed ? window.parent : window.opener;
    (autoDiagramComponentId &&
      parent &&
      (isAutoDiagramEmbed || !parent.closed) &&
      parent.postMessage(
        {
          type: "homeos-floorplan-auto-diagram-export",
          componentId: autoDiagramComponentId,
          folderName: trim,
          manifest: exportManifest,
          saved: {
            relativePath: String(saveResult?.relativePath || "exports/" + trim),
            overwritten: saveResult?.overwritten === true,
          },
        },
        window.location.origin,
      ),
      (appCtx.isExporting = true),
      refreshStepChecklist(),
      showExportResult(saveResult));
  } catch (exportFlowError: any) {
    (window.HomeOSLog?.error!(exportFlowError, {
      phase: "studio-export",
      componentId: autoDiagramComponentId || "",
    }),
      console.error(exportFlowError),
      (exportStatusElement.textContent = exportFlowError?.message || "导出失败，请重试。"),
      showToast(exportFlowError?.message || "导图失败。", "error"),
      isAutoDiagramEmbed &&
        autoDiagramComponentId &&
        window.parent !== window &&
        window.parent.postMessage(
          {
            type: "homeos-floorplan-auto-diagram-error",
            componentId: autoDiagramComponentId,
            message: exportFlowError?.message || "后台生成失败，请重试。",
          },
          window.location.origin,
        ));
  } finally {
    setShadowQualityHigh(false);
    for (const { key: restoreGroupKey, group: restoreGroup } of listLightGroupRows())
      appCtx.pendingRuntimeSettings?.groupStates.has(restoreGroupKey) &&
        (restoreGroup.enabled = appCtx.pendingRuntimeSettings.groupStates.get(restoreGroupKey));
    for (const { key: restoreScreenKey, item: restoreScreenItem } of listScreenRows())
      appCtx.pendingRuntimeSettings?.tvStates.has(restoreScreenKey) &&
        (restoreScreenItem.screenEnabled = appCtx.pendingRuntimeSettings.tvStates.get(restoreScreenKey));
    for (const { key: restoreVehicleKey, item: restoreVehicleItem } of listChargingRows())
      appCtx.pendingRuntimeSettings?.carChargingStates.has(restoreVehicleKey) &&
        (restoreVehicleItem.chargingEnabled =
          appCtx.pendingRuntimeSettings.carChargingStates.get(restoreVehicleKey));
    (rebuildFloorLayers(),
      applyCameraState(tu3, exportTargetWidth / exportTargetHeight),
      setExportBusy(false),
      syncCanvasSizeInputs());
  }
}
function disposeObjectTree(disposedRoot: any) {
  const geometrySet = new Set(),
    materialDisposeSet = new Set(),
    textureSet = new Set();
  disposedRoot.traverse((traversedNode: any) => {
    (traversedNode.shadow?.dispose?.(),
      traversedNode.geometry &&
        !geometrySet.has(traversedNode.geometry) &&
        !traversedNode.userData.externalModelSharedGeometry &&
        !traversedNode.userData.sofaSharedGeometry &&
        !traversedNode.userData.rugSharedGeometry &&
        !traversedNode.userData.architectureSharedGeometry &&
        (geometrySet.add(traversedNode.geometry), traversedNode.geometry.dispose?.()));
    const nodeMaterials = Array.isArray(traversedNode.material)
      ? traversedNode.material
      : traversedNode.material
        ? [traversedNode.material]
        : [];
    for (const nodeMaterial of nodeMaterials)
      if (!materialDisposeSet.has(nodeMaterial)) {
        if (
          (materialDisposeSet.add(nodeMaterial),
          !traversedNode.userData.externalModelSharedTextures &&
            !traversedNode.userData.externalModelSharedMaterial &&
            !traversedNode.userData.sofaSharedMaterial &&
            !traversedNode.userData.rugSharedMaterial &&
            !traversedNode.userData.architectureSharedMaterial)
        ) {
          for (const [materialPropertyKey, materialPropertyValue] of Object.entries(
            nodeMaterial,
          ) as [string, any][])
            materialPropertyKey === "envMap" ||
              !materialPropertyValue?.isTexture ||
              materialPropertyValue.isRenderTargetTexture ||
              textureSet.has(materialPropertyValue) ||
              (textureSet.add(materialPropertyValue), materialPropertyValue.dispose());
        }
        !traversedNode.userData.sofaSharedMaterial &&
          !traversedNode.userData.rugSharedMaterial &&
          !traversedNode.userData.architectureSharedMaterial &&
          !traversedNode.userData.externalModelSharedMaterial &&
          nodeMaterial.dispose?.();
      }
  });
}
function disposeFloorScene() {
  if (appCtx.sceneRootNode) {
    for (const floorChildObject of [...appCtx.sceneRootNode.children])
      (appCtx.sceneRootNode.remove(floorChildObject), disposeObjectTree(floorChildObject));
  }
}
/** 盒子网格构件的外部状态（见 `scene/studio-box-mesh`）：两个缓存 + 主题视图设置。 */
const studioBoxMeshDeps = () => ({ geometryCacheByKey, textureCacheByKey, backgroundSettings });
/** 电视模型构件的外部状态（见 `items/studio-television-model`）：嵌入舞台标记 + 渲染器（只读）+ 主题视图设置。 */
const studioTelevisionDeps = () => ({ isEmbeddedStage, threeRenderer: appCtx.threeRenderer, backgroundSettings });
/**
 * 物品模型总装的外部句柄（见 `items/studio-item-model`）：13 个宿主兄弟构件
 * （圆柱网格 / 灯具 / 铭牌 / 墙面材质 / 释放 / 合批 / 优化 …）+ 12 项只读状态
 * （项目文档 / 当前楼层 / 诊断统计表 / 主题视图 / 类型集合）。
 *
 * 这些都是 `let`／函数声明，全部在**本行之前**已就位，且本工厂只在 `buildItemModel`
 * 被调用时才求值（16200 / 16664 / 20036 三处，都在更深的内层函数里），所以不像
 * `studioDocumentDeps` 那样需要 getter 转发。
 */
/** 墙体构件族的外部状态（见 `scene/studio-walls`）。 */
const studioWallsDeps = () => ({
  activeFloorId: appCtx.activeFloorId,
  addArchitectureMesh,
  addWindowFrames,
  backgroundSettings,
  computeSurfaceExclusions,
  createSelectionRef,
  defaultWallRuntimeProfile,
  doorPartDisplayColor,
  doorPartMeshOptions,
  doorPartThemeColor,
  geometryCacheHandle,
  isEmbedStageMode,
  isEmbeddedStage,
  lampsLayerIndex,
  resolveDoorPartMaterials,
  sceneRootNode: appCtx.sceneRootNode,
  sceneStyle: appCtx.sceneStyle,
  studioState: appCtx.studioState,
  wallOpacityValue: appCtx.wallOpacityValue,
});

/** 墙体构件（原 studio-app 直系声明，P4 搬进 `scene/studio-walls`，此处绑定外部状态）。 */
function createOutlinePath(outlineShapeConstructor: any, outlinePointList: any) {
  return createOutlinePathCore(studioWallsDeps(), outlineShapeConstructor, outlinePointList);
}
/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
function buildShapesWithHoles(polygonLoopList: any) {
  return buildShapesWithHolesCore(studioWallsDeps(), polygonLoopList);
}
/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
function createWallSideMaterial(wallSideColor: any, wallSideOpacity: any, wallSideOptions: any = {}) {
  return createWallSideMaterialCore(studioWallsDeps(), wallSideColor, wallSideOpacity, wallSideOptions);
}
/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
function createWallTopMaterial(wallTopBaseColor: any, wallTopOpacity: any, wallTopOptions: any = {}) {
  return createWallTopMaterialCore(studioWallsDeps(), wallTopBaseColor, wallTopOpacity, wallTopOptions);
}
/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
function expandPolygonOutward(polygonPointList: any, outwardOffset: any) {
  return expandPolygonOutwardCore(studioWallsDeps(), polygonPointList, outwardOffset);
}
/** 墙体构件（同族，转发见 `scene/studio-walls`）。 */
function buildInteriorScene(interiorDeps: { ppm: any; toWorld: any; floorSurfaceY: any }) {
  return buildInteriorSceneCore(studioWallsDeps(), interiorDeps);
}
const studioItemModelDeps = () => ({
  addCylinderMesh,
  applyAccentEmissive,
  createSelectionRef,
  createPlanLabel,
  addLightModel,
  addRugMeshes,
  addStripLightPreview,
  disposeObjectTree,
  mergeMeshesByType,
  createWallSideMaterial,
  createWallTopMaterial,
  applyItemOptimization,
  getPixelsPerMeter,
  closedWallLoops,
  backgroundSettings,
  studioState: appCtx.studioState,
  studioTelevisionDeps,
  activeFloorId: appCtx.activeFloorId,
  isEmbeddedStage,
  isPerformanceDiagnostics,
  lampsLayerIndex,
  meshStatsByType,
  nextTenItemTypeSet,
  optimizationItemTypeSet,
  applianceOptimizationTypeSet,
});
/** 物品模型总装（原 studio-app 直系声明，P4 搬进 `items/studio-item-model`，此处只转发句柄）。 */
function buildItemModel(modelItem: any, modelShadowIds: any = null) {
  return buildItemModelCore(studioItemModelDeps(), modelItem, modelShadowIds);
}
/**
 * 平面图物品绘制的外部句柄（见 `plan/studio-plan-item-drawing`）：平面画布与坐标换算
 * （`planCanvasRenderer` / `planView` / `planToScreen` / `getPixelsPerMeter`）+ 宿主从
 * `createPlanDrawingTools` 解构出的三个画笔别名 + 灯具判据 / 铭牌配色 / 门部件材质通道。
 *
 * 引用的 `let`（画布、视图、三个画笔别名，约 1183~1196 行）都在**本行之前**，且工厂只在
 * `drawDoor` / `drawCourtyardArea` 被调用时求值（7 处调用点都在更深的内层函数里）。
 */
const studioPlanItemDrawingDeps = () => ({
  planCanvasRenderer,
  planView: appCtx.planView,
  planPainter,
  drawGuideSegment,
  drawPointMarker,
  drawLabelText,
  planToScreen,
  getPixelsPerMeter,
  createSelectionRef,
  wallWindowSpan,
  isLampEnabled,
  planLabelAccentColor,
  resolveDoorPartMaterials,
  doorPartDisplayColor,
  backgroundSettings,
});
/** 门平面符号（原 studio-app 直系声明，P4 搬进 `plan/studio-plan-item-drawing`，此处只转发句柄）。 */
function drawDoor(doorRecord: any, doorView: PlanEditPreviewFlags = {}) {
  return drawDoorCore(studioPlanItemDrawingDeps(), doorRecord, doorView);
}
/** 庭院区 / 部件的平面绘制（同上）。 */
function drawCourtyardArea(planItem: any) {
  return drawCourtyardAreaCore(studioPlanItemDrawingDeps(), planItem);
}
/** 导出图层清单渲染的外部状态（见 `ui/studio-export-layers`）：容器元素 + 三个取数助手。 */
const studioExportLayerDeps = () => ({
  exportGroupFilesElement,
  getOrderedFloorList,
  listScreenRows,
  listChargingRows,
  listLightGroupRows,
});
/** 导出图层清单渲染（原 studio-app 直系声明，P4 搬进 `ui/studio-export-layers`，此处绑定容器与取数助手）。 */
function renderExportLayers() {
  return renderExportLayersCore(studioExportLayerDeps());
}
/** 引导序列的外部状态（见 `boot/studio-boot`）：入口判定 / 取数 / 渲染器与舞台挂载 / 状态提示 / 嵌入契约。 */
const studioBootDeps = () => ({
  isStudioEntry,
  isEmbeddedStage,
  isAutoDiagramEmbed,
  autoDiagramComponentId,
  projectNameElement,
  stageLoadTiming,
  showSaveState,
  showToast,
  fetchStudioApi,
  createStudioRenderer,
  resizePlanStage,
  applyLoadedDraft,
  runStudioRenderLoop,
  openExportPanel,
  normalizeDocument: (rawDocument: any) => normalizeStudioDocument(rawDocument, studioDocumentDeps()),
});
/** 盒子网格构件（原 studio-app 直系声明，P4 搬进 `scene/studio-box-mesh`，此处绑定外部状态）。 */
function addArchitectureMesh(
  architectureParent: any,
  architectureSpecs: any,
  architectureColor: any,
  architectureOptions: ArchitectureMeshOptions = {},
) {
  return addArchitectureMeshCore(
    studioBoxMeshDeps(),
    architectureParent,
    architectureSpecs,
    architectureColor,
    architectureOptions,
  );
}
function addWindowFrames(
  windowParent: any,
  windowOpenings: any,
  windowFrameColor: any,
  windowGlassColor: any,
) {
  return addWindowFramesCore(
    studioBoxMeshDeps(),
    windowParent,
    windowOpenings,
    windowFrameColor,
    windowGlassColor,
  );
}
function buildRugGeometry(rugWidth: any, rugThickness: any, rugDepth: any) {
  const clampedRugThickness = clamp2(rugThickness, 0.004, 0.018),
    rugGeometryKey = rugWidth + ":" + clampedRugThickness + ":" + rugDepth;
  if (!floorGroupCacheByKey.has(rugGeometryKey)) {
    const rugMinDimension = Math.max(Math.min(rugWidth, clampedRugThickness, rugDepth), 0.001),
      rugCornerRadius = Math.min(
        Math.min(rugWidth, rugDepth) * 0.018,
        rugMinDimension * 0.45,
        0.08,
      ),
      rugBaseGeometry = new RoundedBoxGeometry2(
        rugWidth,
        clampedRugThickness,
        rugDepth,
        2,
        rugCornerRadius,
      ),
      rugInsetGeometry = new ns2.PlaneGeometry(rugWidth * 0.88, rugDepth * 0.84);
    floorGroupCacheByKey.set(rugGeometryKey, {
      base: rugBaseGeometry,
      inset: rugInsetGeometry,
      rugThickness: clampedRugThickness,
    });
  }
  return floorGroupCacheByKey.get(rugGeometryKey);
}
function createRugMaterial(rugColor: any, isInsetMaterial = false) {
  const rugMaterialKey = (isInsetMaterial ? "inset" : "base") + ":" + rugColor;
  return (
    materialCacheByKey.has(rugMaterialKey) ||
      materialCacheByKey.set(
        rugMaterialKey,
        new ns2.MeshStandardMaterial({
          color: rugColor,
          roughness: 1,
          metalness: 0,
          ...(isInsetMaterial
            ? {
                polygonOffset: true,
                polygonOffsetFactor: -2,
                polygonOffsetUnits: -4,
              }
            : {}),
        }),
      ),
    materialCacheByKey.get(rugMaterialKey)
  );
}
function addRugMeshes(rugParent: any, rugItem: any, rugBaseColor: any, rugInsetColor: any) {
  const bv2 = buildRugGeometry(rugItem.width, rugItem.height, rugItem.depth);
  if (!bv2) return false;
  const ne7 = createSelectionRef("item", rugItem.id),
    clone3 = ne7 ? createRugMaterial(rugBaseColor).clone() : createRugMaterial(rugBaseColor),
    rugBaseMesh = new ns2.Mesh(bv2.base, clone3);
  ((rugBaseMesh.position.y = bv2.rugThickness * 0.5),
    (rugBaseMesh.castShadow = false),
    (rugBaseMesh.receiveShadow = true),
    (rugBaseMesh.userData.rugSharedGeometry = true),
    (rugBaseMesh.userData.rugSharedMaterial = !ne7),
    rugParent.add(rugBaseMesh));
  const clone4 = ne7
      ? createRugMaterial(rugInsetColor, true).clone()
      : createRugMaterial(rugInsetColor, true),
    rugInsetMesh = new ns2.Mesh(bv2.inset, clone4);
  return (
    (rugInsetMesh.rotation.x = -Math.PI / 2),
    (rugInsetMesh.position.y = bv2.rugThickness + 0.001),
    (rugInsetMesh.castShadow = false),
    (rugInsetMesh.receiveShadow = true),
    (rugInsetMesh.renderOrder = 1),
    (rugInsetMesh.userData.rugSharedGeometry = true),
    (rugInsetMesh.userData.rugSharedMaterial = !ne7),
    rugParent.add(rugInsetMesh),
    (rugParent.userData.optimizationStats = {
      type: "rug",
      before: 2,
      after: 2,
      sharedResources: true,
    }),
    true
  );
}
function mergeMeshesByType(mergeRoot: any, mergeItemType: any) {
  if (!optimizedItemKeySet.has(mergeItemType)) return;
  const gu4 = collectChildMeshes(mergeRoot),
    geometryByKey = new Map(),
    materialBySignature = new Map();
  for (const mergeMesh of gu4) {
    const geometryParameters = mergeMesh.geometry?.parameters,
      meshGeometryKey = geometryParameters
        ? mergeMesh.geometry.type + ":" + JSON.stringify(geometryParameters)
        : "";
    meshGeometryKey && geometryByKey.has(meshGeometryKey)
      ? (mergeMesh.geometry.dispose(), (mergeMesh.geometry = geometryByKey.get(meshGeometryKey)))
      : meshGeometryKey && geometryByKey.set(meshGeometryKey, mergeMesh.geometry);
    const tg2 = buildMaterialSignature(mergeMesh);
    tg2 && materialBySignature.has(tg2)
      ? (mergeMesh.material.dispose(), (mergeMesh.material = materialBySignature.get(tg2)))
      : tg2 && materialBySignature.set(tg2, mergeMesh.material);
  }
  mergeRoot.userData.optimizationStats = {
    type: mergeItemType,
    before: gu4.length,
    after: gu4.length,
    uniqueGeometries: new Set(gu4.map((uniqueGeometryMesh: any) => uniqueGeometryMesh.geometry)).size,
    uniqueMaterials: new Set(gu4.map((uniqueMaterialMesh: any) => uniqueMaterialMesh.material)).size,
  };
}
function addCylinderMesh(
  cylinderParent: any,
  cylinderRadiusTop: any,
  cylinderRadiusBottom: any,
  cylinderHeight: any,
  cylinderX: any,
  cylinderY: any,
  cylinderZ: any,
  cylinderColor: any,
  cylinderOptions: CylinderMeshOptions = {},
) {
  const cylinderMaterial = new ns2.MeshStandardMaterial({
      color: cylinderColor,
      roughness: cylinderOptions.roughness ?? 0.62,
      metalness: cylinderOptions.metalness ?? 0.03,
      transparent: !!cylinderOptions.transparent,
      opacity: cylinderOptions.opacity ?? 1,
      depthWrite: cylinderOptions.depthWrite ?? true,
    }),
    cylinderMesh = new ns2.Mesh(
      new ns2.CylinderGeometry(
        cylinderRadiusTop,
        cylinderRadiusBottom,
        cylinderHeight,
        cylinderOptions.segments ?? 24,
      ),
      cylinderMaterial,
    );
  return (
    cylinderMesh.position.set(cylinderX, cylinderY, cylinderZ),
    cylinderOptions.rotationX && (cylinderMesh.rotation.x = cylinderOptions.rotationX),
    cylinderOptions.rotationZ && (cylinderMesh.rotation.z = cylinderOptions.rotationZ),
    (cylinderMesh.castShadow = cylinderOptions.castShadow !== false),
    (cylinderMesh.receiveShadow = cylinderOptions.receiveShadow !== false),
    cylinderParent.add(cylinderMesh),
    cylinderMesh
  );
}
function configureLightSourcePreview(previewSourceMesh: any) {
  return (
    (previewSourceMesh.userData.exportRole = "light-source-preview"),
    (previewSourceMesh.castShadow = false),
    (previewSourceMesh.receiveShadow = false),
    (previewSourceMesh.renderOrder = 20),
    previewSourceMesh
  );
}
function addStripLightPreview(stripPreviewParent: any, stripLightItem: any) {
  if (stripLightItem.type !== "striplight") return;
  const stripPreviewGroup = new ns2.Group();
  ((stripPreviewGroup.userData.exportRole = "light-source-preview"),
    (stripPreviewGroup.userData.lightSourcePreview = true),
    (stripPreviewGroup.visible =
      stripLightItem.lightSourceVisible !== false &&
      !appCtx.pendingRuntimeSettings &&
      createSelectionRef("item", stripLightItem.id)));
  const stripLightColorHex = kelvinToRgbHex2(stripLightItem.lightTemperature) || 16762219,
    stripLightDepth = clamp2(finite2(stripLightItem.depth, 0.28), 0.1, 8),
    stripLightWidth = clamp2(finite2(stripLightItem.width, 1), 0.1, 8),
    stripLightOffset = clamp2(finite2(stripLightItem.lightRange, 3.5) * 0.16, 0.28, 0.72),
    stripVerticalGroup = new ns2.Group();
  stripVerticalGroup.rotation.z = ns2.MathUtils.degToRad(
    normalizeFullRotation2(stripLightItem.verticalRotation),
  );
  const stripRollGroup = new ns2.Group();
  stripRollGroup.rotation.x = ns2.MathUtils.degToRad(
    normalizeFullRotation2(stripLightItem.stripRollRotation),
  );
  (configureLightSourcePreview(
    addBoxMesh(
      stripRollGroup,
      stripLightWidth,
      0.014,
      stripLightDepth,
      0,
      -stripLightOffset,
      0,
      stripLightColorHex,
      {
        rounded: false,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        emissive: stripLightColorHex,
        emissiveIntensity: 0.68,
        castShadow: false,
        receiveShadow: false,
      },
    ),
  ),
    configureLightSourcePreview(
      addCylinderMesh(
        stripRollGroup,
        0.012,
        0.012,
        stripLightOffset,
        0,
        -stripLightOffset * 0.5,
        0,
        stripLightColorHex,
        {
          segments: 10,
          transparent: true,
          opacity: 0.78,
          depthWrite: false,
          roughness: 0.3,
          emissive: stripLightColorHex,
          emissiveIntensity: 0.8,
        },
      ),
    ));
  const stripLightMesh = new ns2.Mesh(
    new ns2.ConeGeometry(0.045, 0.12, 10),
    new ns2.MeshBasicMaterial({
      color: stripLightColorHex,
      transparent: true,
      opacity: 0.82,
      depthWrite: false,
    }),
  );
  ((stripLightMesh.rotation.x = Math.PI),
    stripLightMesh.position.set(0, -stripLightOffset, 0),
    configureLightSourcePreview(stripLightMesh),
    stripRollGroup.add(stripLightMesh),
    stripVerticalGroup.add(stripRollGroup));
  (stripPreviewGroup.add(stripVerticalGroup), stripPreviewParent.add(stripPreviewGroup));
}
function applyAccentEmissive(accentRoot: any, isAccentActive: any) {
  if (!isAccentActive) return;
  const yt3 = backgroundSettings();
  accentRoot.traverse((accentObject: any) => {
    const accentMaterials = Array.isArray(accentObject.material)
      ? accentObject.material
      : accentObject.material
        ? [accentObject.material]
        : [];
    for (const accentMaterial of accentMaterials)
      accentMaterial?.isMeshStandardMaterial &&
        ((accentMaterial.emissive = new ns2.Color(yt3.accent)),
        (accentMaterial.emissiveIntensity = 0.32));
  });
}
/** 由铭牌颜色派生底线 / 描边的半透明色，保证描边永远跟字色同源。 */
function planLabelAccentColor(candidateColor: any, alpha = planLabelAccentAlpha) {
  const labelColorHex = normalizePlanLabelColor(candidateColor);
  return (
    "rgba(" +
    Number.parseInt(labelColorHex.slice(1, 3), 16) +
    ", " +
    Number.parseInt(labelColorHex.slice(3, 5), 16) +
    ", " +
    Number.parseInt(labelColorHex.slice(5, 7), 16) +
    ", " +
    alpha +
    ")"
  );
}
function createPlanLabel(labelSpec: any) {
  const labelCanvas = document.createElement("canvas");
  ((labelCanvas.width = 2048), (labelCanvas.height = 640));
  const labelCanvasPainter = labelCanvas.getContext("2d"),
    labelPaintColor = normalizePlanLabelColor(labelSpec.labelColor);
  (labelCanvasPainter!.clearRect(0, 0, labelCanvas.width, labelCanvas.height),
    (labelCanvasPainter!.fillStyle = labelPaintColor),
    (labelCanvasPainter!.textAlign = "left"),
    (labelCanvasPainter!.textBaseline = "middle"));
  const labelTitleText = normalizeLabelText2(labelSpec.title, "家庭总览", 24),
    labelSubtitleText = normalizeLabelText2(labelSpec.subtitle, "HOME PLAN", 36),
    labelTitleX = 115,
    labelTitleFontSize = 184;
  ((labelCanvasPainter!.font = "700 " + labelTitleFontSize + "px sans-serif"),
    drawTrackedText2(
      labelCanvasPainter,
      labelTitleText,
      labelTitleX,
      130,
      labelTitleFontSize * clamp2(finite2(labelSpec.titleSpacing, 1.05), 0, 1.8),
      1340,
    ));
  const labelGlyphX = 1580,
    labelGlyphY = 130,
    labelGlyphSize = 170;
  ((labelCanvasPainter!.fillStyle = labelPaintColor),
    labelCanvasPainter!.beginPath(),
    labelCanvasPainter!.moveTo(labelGlyphX, labelGlyphY - labelGlyphSize * 0.58),
    labelCanvasPainter!.lineTo(
      labelGlyphX + labelGlyphSize * 0.56,
      labelGlyphY - labelGlyphSize * 0.02,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX + labelGlyphSize * 0.38,
      labelGlyphY - labelGlyphSize * 0.02,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX + labelGlyphSize * 0.38,
      labelGlyphY + labelGlyphSize * 0.5,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX - labelGlyphSize * 0.38,
      labelGlyphY + labelGlyphSize * 0.5,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX - labelGlyphSize * 0.38,
      labelGlyphY - labelGlyphSize * 0.02,
    ),
    labelCanvasPainter!.lineTo(
      labelGlyphX - labelGlyphSize * 0.56,
      labelGlyphY - labelGlyphSize * 0.02,
    ),
    labelCanvasPainter!.closePath(),
    labelCanvasPainter!.fill(),
    labelCanvasPainter!.save(),
    (labelCanvasPainter!.globalCompositeOperation = "destination-out"),
    labelCanvasPainter!.fillRect(
      labelGlyphX - labelGlyphSize * 0.09,
      labelGlyphY + labelGlyphSize * 0.2,
      labelGlyphSize * 0.18,
      labelGlyphSize * 0.3,
    ),
    labelCanvasPainter!.restore(),
    (labelCanvasPainter!.fillStyle = labelPaintColor),
    (labelCanvasPainter!.textAlign = "left"));
  const labelSubtitleFontSize = 310;
  ((labelCanvasPainter!.font =
    "400 " + labelSubtitleFontSize + 'px "Arial Narrow", Arial, sans-serif'),
    drawTrackedText2(
      labelCanvasPainter,
      labelSubtitleText,
      72,
      410,
      labelSubtitleFontSize * clamp2(finite2(labelSpec.subtitleSpacing, 0.08), 0, 0.6),
      1880,
    ));
  const labelLineStartX = 74,
    labelLineEndX = labelLineStartX + 1880 * clamp2(finite2(labelSpec.lineLength, 0.86), 0.3, 1);
  ((labelCanvasPainter!.strokeStyle = planLabelAccentColor(labelSpec.labelColor)),
    (labelCanvasPainter!.lineWidth = 16),
    labelCanvasPainter!.beginPath(),
    labelCanvasPainter!.moveTo(labelLineStartX, 590),
    labelCanvasPainter!.lineTo(labelLineEndX, 590),
    labelCanvasPainter!.moveTo(labelLineStartX, 566),
    labelCanvasPainter!.lineTo(labelLineStartX, 614),
    labelCanvasPainter!.moveTo(labelLineEndX, 566),
    labelCanvasPainter!.lineTo(labelLineEndX, 614),
    labelCanvasPainter!.stroke());
  const labelTexture = new ns2.CanvasTexture(labelCanvas);
  ((labelTexture.colorSpace = ns2.SRGBColorSpace),
    (labelTexture.anisotropy = Math.min(appCtx.threeRenderer?.capabilities?.getMaxAnisotropy?.() || 1, 8)),
    (labelTexture.needsUpdate = true));
  const labelPlaneMesh = new ns2.Mesh(
    new ns2.PlaneGeometry(labelSpec.width, labelSpec.depth),
    new ns2.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      toneMapped: false,
      side: ns2.DoubleSide,
      forceSinglePass: isEmbeddedStage,
    }),
  );
  return (
    (labelPlaneMesh.rotation.x = -Math.PI / 2),
    (labelPlaneMesh.position.y = 0.008),
    (labelPlaneMesh.castShadow = false),
    (labelPlaneMesh.receiveShadow = false),
    (labelPlaneMesh.renderOrder = 8),
    labelPlaneMesh
  );
}
function collectLightSourceSpecs() {
  return new Set(
    selectShadowCastingLightIds2(
      appCtx.studioState.items.map((lightSourceItem) => ({
        id: lightSourceItem.id,
        groupId: lightSourceItem.lightGroupId,
        type: lightSourceItem.type,
        brightness: finite2(
          lightSourceItem.lightBrightness,
          (lightPresetCatalog as any)[lightSourceItem.type]?.brightness || 0,
        ),
        enabled: lampItemTypeSet.has(lightSourceItem.type) && isLampEnabled(lightSourceItem),
      })),
      maxTextureUnitLimit,
    ),
  );
}
function countMaterialTextures(countedMaterial: any) {
  if (!countedMaterial || countedMaterial.isMeshBasicMaterial || countedMaterial.isShadowMaterial)
    return 0;
  let textureCount = Object.values(countedMaterial).filter(
    (materialValue: any) => materialValue?.isTexture === true,
  ).length;
  return (
    countedMaterial.isMeshPhysicalMaterial &&
      finite2(countedMaterial.transmission, 0) > 0 &&
      (textureCount += 1),
    textureCount
  );
}
function findMaxMaterialTextures(textureSearchRoot = appCtx.sceneRootNode) {
  let maxTextureUnits = 0;
  return (
    textureSearchRoot?.traverse((textureSearchMesh: any) => {
      if (!textureSearchMesh.isMesh) return;
      const searchMaterials = Array.isArray(textureSearchMesh.material)
        ? textureSearchMesh.material
        : textureSearchMesh.material
          ? [textureSearchMesh.material]
          : [];
      for (const searchMaterial of searchMaterials)
        maxTextureUnits = Math.max(maxTextureUnits, countMaterialTextures(searchMaterial));
    }),
    appCtx.threeScene?.environment?.isTexture && (maxTextureUnits += 1),
    maxTextureUnits
  );
}
function getMaxTextureUnits() {
  const glHandle = appCtx.threeRenderer?.getContext?.(),
    maxTextureImageUnits = glHandle?.getParameter?.(glHandle.MAX_TEXTURE_IMAGE_UNITS);
  return Math.max(
    1,
    Math.floor(finite2(maxTextureImageUnits, appCtx.threeRenderer?.capabilities?.maxTextures || 16)),
  );
}
function collectShadowCandidates(shadowSearchRoot = appCtx.sceneRootNode) {
  const shadowCandidates: any = [];
  return (
    shadowSearchRoot?.traverse((shadowCandidateLight: any) => {
      if (
        !shadowCandidateLight.isSpotLight ||
        shadowCandidateLight.userData?.shadowCandidate !== true
      )
        return;
      const candidateFloorId = String(shadowCandidateLight.userData?.lightFloorId || ""),
        candidateItemId = String(shadowCandidateLight.userData?.lightItemId || "");
      candidateItemId &&
        shadowCandidates.push({
          id: candidateFloorId + ":" + candidateItemId,
          groupId:
            candidateFloorId + ":" + String(shadowCandidateLight.userData?.lightGroupId || ""),
          type: String(shadowCandidateLight.userData?.lightType || "downlight"),
          brightness: finite2(shadowCandidateLight.userData?.lightBrightness, 0),
          enabled: shadowCandidateLight.visible !== false,
        });
    }),
    shadowCandidates
  );
}
function setupSceneShadows(
  shadowSetupRoot = appCtx.sceneRootNode,
  { rebuildAtlas: shouldRebuildAtlas = true } = {},
) {
  if (isEmbedStageMode)
    return (
      shadowSetupRoot?.traverse((atlasLightObject: any) => {
        atlasLightObject.isLight &&
          atlasLightObject.userData?.lightItemId &&
          ((atlasLightObject.castShadow = false), atlasLightObject.layers.set(30));
      }),
      appCtx.threeRenderer &&
        ((appCtx.threeRenderer.domElement.dataset.spotShadowMode = "region"),
        (appCtx.threeRenderer.domElement.dataset.activeSpotShadows = "0")),
      0
    );
  if (!shadowSetupRoot || !appCtx.threeRenderer) return 0;
  const xv2 = getMaxTextureUnits(),
    qv2 = findMaxMaterialTextures(shadowSetupRoot);
  let nonSpotShadowUnitCount = 0;
  appCtx.threeScene?.traverse((nonSpotLightObject: any) => {
    nonSpotLightObject.visible !== false &&
      nonSpotLightObject.isLight &&
      !nonSpotLightObject.isSpotLight &&
      nonSpotLightObject.castShadow &&
      (nonSpotShadowUnitCount += 1);
  });
  let hasRectAreaLight = false;
  shadowSetupRoot.traverse((rectAreaLightObject: any) => {
    rectAreaLightObject.visible !== false &&
      rectAreaLightObject.isRectAreaLight &&
      (hasRectAreaLight = true);
  });
  const Gw2 = hasRectAreaLight ? shadowTextureUnits : 0,
    availableShadowUnits = xv2 - qv2 - nonSpotShadowUnitCount - Gw2 - reservedTextureUnits,
    shadowAtlasUnits =
      appCtx.lightPrecompileController?.textureUnitsFor?.(
        collectShadowCandidates(shadowSetupRoot).filter(
          (shadowCandidateLight: any) => shadowCandidateLight.enabled,
        ).length,
      ) || 1,
    shadowBudgetChanged = appCtx.lightPrecompileController?.setBudgetAvailable?.(
      availableShadowUnits >= shadowAtlasUnits,
    );
  if (!appCtx.pendingRuntimeSettings && appCtx.lightPrecompileController && availableShadowUnits >= shadowAtlasUnits) {
    const schedule = shouldRebuildAtlas || shadowBudgetChanged
        ? appCtx.lightPrecompileController.schedule(shadowSetupRoot)
        : collectShadowCandidates(shadowSetupRoot).length,
      sync = appCtx.lightPrecompileController.sync(shadowSetupRoot),
      domElement7 = appCtx.threeRenderer.domElement;
    ((domElement7.dataset.fragmentTextureUnits = String(xv2)),
      (domElement7.dataset.materialTextureUnits = String(qv2)),
      (domElement7.dataset.spotShadowLimit = String(schedule)),
      (domElement7.dataset.activeSpotShadows = String(sync)));
    let activeUserLightCount = 0;
    return (
      shadowSetupRoot.traverse((countedUserLight: any) => {
        countedUserLight.isLight &&
          countedUserLight.userData?.lightItemId &&
          countedUserLight.visible !== false &&
          (activeUserLightCount += 1);
      }),
      (domElement7.dataset.activeUserLights = String(activeUserLightCount)),
      sync
    );
  }
  const spotShadowLimit = spotShadowTextureUnitLimit2({
    maxTextureUnits: xv2,
    materialTextureUnits: qv2,
    nonSpotShadowTextureUnits: nonSpotShadowUnitCount,
    rectAreaLightTextureUnits: Gw2,
    reservedTextureUnits: appCtx.lightPrecompileController
      ? Math.max(reservedTextureUnits, shadowAtlasUnits)
      : reservedTextureUnits,
    hardLimit: maxTextureUnitLimit,
  });
  appCtx.lightPrecompileController &&
    (appCtx.pendingRuntimeSettings && appCtx.lightPrecompileController.setEnabled(false),
    appCtx.lightPrecompileController.sync(shadowSetupRoot));
  const castShadowLightIdSet = new Set(
    selectShadowCastingLightIds2(collectShadowCandidates(shadowSetupRoot), spotShadowLimit),
  );
  let appliedSpotShadowCount = 0;
  shadowSetupRoot.traverse((spotShadowLight: any) => {
    if (!spotShadowLight.isSpotLight || !spotShadowLight.userData?.lightItemId) return;
    const spotLightKey =
        String(spotShadowLight.userData?.lightFloorId || "") +
        ":" +
        String(spotShadowLight.userData.lightItemId),
      isSpotShadowEnabled = castShadowLightIdSet.has(spotLightKey);
    ((spotShadowLight.castShadow = isSpotShadowEnabled),
      isSpotShadowEnabled &&
        ((appliedSpotShadowCount += 1),
        spotShadowLight.shadow &&
          !spotShadowLight.shadow.map &&
          (spotShadowLight.shadow.needsUpdate = true)));
  });
  const domElement8 = appCtx.threeRenderer.domElement;
  ((domElement8.dataset.spotShadowMode = "individual"),
    (domElement8.dataset.fragmentTextureUnits = String(xv2)),
    (domElement8.dataset.materialTextureUnits = String(qv2)),
    (domElement8.dataset.spotShadowLimit = String(spotShadowLimit)),
    (domElement8.dataset.activeSpotShadows = String(appliedSpotShadowCount)));
  let visibleUserLightCount = 0;
  return (
    shadowSetupRoot.traverse((visibleUserLight: any) => {
      visibleUserLight.isLight &&
        visibleUserLight.userData?.lightItemId &&
        visibleUserLight.visible !== false &&
        (visibleUserLightCount += 1);
    }),
    (domElement8.dataset.activeUserLights = String(visibleUserLightCount)),
    appliedSpotShadowCount
  );
}
function addLightModel(lightModelParent: any, lightModelItem: any, shadowLightIdSet: any) {
  const lightColorHex = isEmbeddedStage
      ? lightEffectColorHex2(lightModelItem.lightTemperature, lightModelItem.lightColorRgb)
      : kelvinToRgbHex2(lightModelItem.lightTemperature),
    eu3 = isLampEnabled(lightModelItem) && finite2(lightModelItem.lightBrightness, 0) > 0,
    isLightPreviewEnabled =
      !appCtx.pendingRuntimeSettings &&
      appCtx.overriddenFloorIds === null &&
      (isEmbeddedStage || !areLightsEnabled()),
    Xr3 = !appCtx.pendingRuntimeSettings && appCtx.isResidentCacheMode;
  if (!eu3 && !isLightPreviewEnabled && !Xr3) return;
  const downlight4 = (lightPresetCatalog as any)[lightModelItem.type] || lightPresetCatalog.downlight,
    lightBrightnessRatio =
      clamp2(
        finite2(lightModelItem.lightBrightness, downlight4.brightness),
        0,
        isEmbeddedStage ? 150 : 100,
      ) / 100,
    lightTypeIntensityFactor = (lightIntensityFactor as any)[lightModelItem.type] || 1.1,
    isStripLight = lightModelItem.type === "striplight",
    zl6 = resolveLightGroup(lightModelItem);
  if (isStripLight) {
    const lightRange = clamp2(finite2(lightModelItem.lightRange, downlight4.range), 0.5, 10),
      lightRangeFactor = clamp2(lightRange / downlight4.range, 0.45, 1.65),
      lightElevation = Math.max(finite2(lightModelItem.elevation, 2.7), 0.4),
      lightElevationFactor = clamp2(Math.max(1, Math.pow(lightElevation / 2.7, 2)), 1, 4),
      stripRollRotationDeg = normalizeFullRotation2(lightModelItem.stripRollRotation),
      lightRotationGroup = new ns2.Group();
    lightRotationGroup.rotation.z = ns2.MathUtils.degToRad(
      normalizeFullRotation2(lightModelItem.verticalRotation),
    );
    const lightOnIntensity =
      48 *
      (isEmbedStageMode ? lightBrightnessRatio : Math.pow(lightBrightnessRatio, 0.82)) *
      lightRangeFactor *
      lightElevationFactor *
      lightTypeIntensityFactor;

    const lightRollGroup = new ns2.Group();
    lightRollGroup.rotation.x = ns2.MathUtils.degToRad(stripRollRotationDeg);
    const rectAreaLight = new ns2.RectAreaLight(
      lightColorHex,
      eu3 ? lightOnIntensity : 0,
      Math.max(0.1, finite2(lightModelItem.width, 1)) * 0.94,
      Math.max(0.1, finite2(lightModelItem.depth, 0.28)) * 0.94,
    );
    ((rectAreaLight.visible = eu3),
      (rectAreaLight.position.y = -0.04),
      (rectAreaLight.rotation.x = -Math.PI / 2),
      (rectAreaLight.userData.lightItemId = lightModelItem.id),
      (rectAreaLight.userData.lightGroupId = zl6?.id || ""),
      (rectAreaLight.userData.lightFloorId = appCtx.activeFloorId),
      (rectAreaLight.userData.lightSourceType = "continuous-area-strip"),
      (rectAreaLight.userData.lightOnIntensity = lightOnIntensity),
      isEmbedStageMode &&
        ((rectAreaLight.userData.regionFullIntensity =
          48 * lightRangeFactor * lightElevationFactor * lightTypeIntensityFactor),
        appCtx.regionLightController?.register(rectAreaLight, lightModelItem)),
      lightRollGroup.add(rectAreaLight),
      lightRotationGroup.add(lightRollGroup));
    lightModelParent.add(lightRotationGroup);
    return;
  }
  const isInShadowSet = shadowLightIdSet?.has(lightModelItem.id) === true,
    shouldCastShadow = isInShadowSet || Xr3 || isLightPreviewEnabled,
    spotLightRange = clamp2(finite2(lightModelItem.lightRange, downlight4.range), 0.5, 10),
    spotLightAngle = clamp2(
      finite2(lightModelItem.lightAngle, downlight4.angle),
      15,
      lightAngleLimitForType(lightModelItem.type),
    ),
    spotLightCount = 1,
    spotLightIntensity =
      (lightModelItem.type === "ceilinglight" ? 680 : 520) *
      (isEmbedStageMode
        ? lightBrightnessRatio
        : spotLightBrightnessResponse2(lightModelItem.type, lightBrightnessRatio) *
          Math.max(1, lightBrightnessRatio)) *
      lightTypeIntensityFactor;
  for (let spotLightIndex = 0; spotLightIndex < spotLightCount; spotLightIndex += 1) {
    const spotLightX =
        spotLightCount === 1
          ? 0
          : -lightModelItem.width * 0.47 +
            (lightModelItem.width * 0.94 * spotLightIndex) / (spotLightCount - 1),
      spotLight = new ns2.SpotLight(
        lightColorHex,
        eu3 ? spotLightIntensity / spotLightCount : 0,
        spotLightRange,
        ns2.MathUtils.degToRad(spotLightAngle / 2),
        0.86,
        2,
      );
    if (
      ((spotLight.visible = eu3),
      spotLight.position.set(spotLightX, -0.025, 0),
      (spotLight.castShadow = false),
      spotLight.layers.enable(lampsLayerIndex),
      shouldCastShadow)
    ) {
      const spotShadowSettings = localSpotShadowSettings2(
          lightModelItem.type,
          spotLightRange,
          spotLightAngle,
        ),
        $y2 = clampShadowMapSize(spotShadowSettings.mapSize);
      (spotLight.shadow.mapSize.set($y2, $y2),
        (spotLight.shadow.camera.near = clamp2(spotLightRange * 0.05, 0.12, 0.24)),
        (spotLight.shadow.camera.far = spotLightRange),
        spotLight.shadow.camera.layers.set(lampsLayerIndex),
        (spotLight.shadow.bias = -0.00005),
        (spotLight.shadow.normalBias = spotShadowSettings.normalBias),
        (spotLight.shadow.radius = spotShadowSettings.radius),
        (spotLight.shadow.blurSamples = appCtx.isGroundShadowEnabled
          ? Math.max(8, spotShadowSettings.blurSamples)
          : spotShadowSettings.blurSamples),
        (spotLight.shadow.autoUpdate = false),
        (spotLight.shadow.needsUpdate = isInShadowSet));
    }
    ((spotLight.userData.lightItemId = lightModelItem.id),
      (spotLight.userData.lightGroupId = zl6?.id || ""),
      (spotLight.userData.lightFloorId = appCtx.activeFloorId),
      (spotLight.userData.lightType = lightModelItem.type),
      (spotLight.userData.lightBrightness = finite2(
        lightModelItem.lightBrightness,
        downlight4.brightness,
      )),
      (spotLight.userData.shadowCandidate = true),
      (spotLight.userData.prewarmShadow = isEmbeddedStage),
      (spotLight.userData.lightOnIntensity = spotLightIntensity / spotLightCount),
      isEmbedStageMode &&
        ((spotLight.userData.regionFullIntensity =
          (lightModelItem.type === "ceilinglight" ? 680 : 520) * lightTypeIntensityFactor),
        appCtx.regionLightController?.register(spotLight, lightModelItem)));
    const spotLightTarget = new ns2.Object3D();
    (spotLightTarget.position.set(
      spotLightX,
      -Math.max(finite2(lightModelItem.elevation, 2.68), 0.8),
      0,
    ),
      lightModelParent.add(spotLightTarget),
      (spotLight.target = spotLightTarget),
      lightModelParent.add(spotLight));
  }
}
function applyItemOrientation(orientedItemGroup: any, itemDescriptor: any) {
  if (
    ((orientedItemGroup.rotation.y = -ns2.MathUtils.degToRad(finite2(itemDescriptor.rotation, 0))),
    openStairTypeSet.has(itemDescriptor.type) &&
      (orientedItemGroup.scale.x = itemDescriptor.stairDirection === "left" ? -1 : 1),
    itemDescriptor.type === "shoecabinet" &&
      itemDescriptor.shoeCabinetMirrored === true &&
      (orientedItemGroup.scale.x = -1),
    ["camera", "presence"].includes(itemDescriptor.type))
  ) {
    ((orientedItemGroup.rotation.order = "YXZ"),
      (orientedItemGroup.rotation.x = ns2.MathUtils.degToRad(
        clamp2(finite2(itemDescriptor.verticalRotation, 0), -180, 180),
      )));
    return;
  }
  if (lampItemTypeSet.has(itemDescriptor.type)) {
    if (itemDescriptor.type === "striplight")
      ((orientedItemGroup.rotation.order = "YXZ"),
        (orientedItemGroup.rotation.x = 0),
        (orientedItemGroup.rotation.z = 0));
    else {
      const degToRad6 = ns2.MathUtils.degToRad(
        clamp2(finite2(itemDescriptor.verticalRotation, 0), -90, 90),
      );
      ((orientedItemGroup.rotation.order = "YXZ"), (orientedItemGroup.rotation.x = degToRad6));
    }
  }
}
function batchSharedMeshes(batchSceneRoot: any, batchItemEntries: any) {
  const signatureGroupsByKey = new Map();
  for (const { item: batchItem, group: batchItemGroup } of batchItemEntries) {
    if (
      instanceTestTypeSet.has(batchItem.type) ||
      (isEmbeddedStage &&
        [
          "airer",
          "fan",
          "storagewaterheater",
          "gaswaterheater",
          "airpurifier",
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "fridge",
          "freezer",
          "dishwasher",
          "washer",
          "dryer",
          "plant",
          "camera",
          "presence",
          "speaker",
          "tv",
          "robotvacuum",
          "smallcar",
          "suv",
          "scooter",
        ].includes(batchItem.type)) ||
      createSelectionRef("item", batchItem.id)
    )
      continue;
    const kv2 = collectSharedMeshRecords(batchItemGroup);
    if (!kv2) continue;
    const batchSignature = JSON.stringify([
      batchItem.type,
      kv2.map((meshDescriptor: any) => meshDescriptor.signature),
    ]);
    (signatureGroupsByKey.has(batchSignature) || signatureGroupsByKey.set(batchSignature, []),
      signatureGroupsByKey.get(batchSignature).push({
        item: batchItem,
        group: batchItemGroup,
        descriptors: kv2,
      }));
  }
  batchSceneRoot.updateMatrixWorld(true);
  const invert3 = batchSceneRoot.matrixWorld.clone().invert(),
    instanceBatchStats: any[] = [];
  for (const signatureGroup of signatureGroupsByKey.values()) {
    if (signatureGroup.length < 2) continue;
    const descriptorCount = signatureGroup[0].descriptors.length;
    for (let descriptorIndex = 0; descriptorIndex < descriptorCount; descriptorIndex += 1) {
      const mesh = signatureGroup[0].descriptors[descriptorIndex].mesh,
        instanceMaterial = mesh.userData.externalModelSharedMaterial
          ? mesh.material
          : mesh.material.clone(),
        instancedMesh = new ns2.InstancedMesh(
          mesh.geometry,
          instanceMaterial,
          signatureGroup.length,
        );
      ((instancedMesh.name =
        "homeos-instance-" + signatureGroup[0].item.type + "-" + (descriptorIndex + 1)),
        (instancedMesh.castShadow = mesh.castShadow),
        (instancedMesh.receiveShadow = mesh.receiveShadow),
        (instancedMesh.renderOrder = mesh.renderOrder),
        instancedMesh.instanceMatrix.setUsage(ns2.StaticDrawUsage),
        isEmbeddedStage && (instancedMesh.matrixAutoUpdate = false),
        (instancedMesh.userData.externalModelSharedGeometry = true),
        (instancedMesh.userData.externalModelSharedTextures = true),
        (instancedMesh.userData.externalModelSharedMaterial =
          mesh.userData.externalModelSharedMaterial === true),
        (instancedMesh.userData.modelLayer = "items"),
        (instancedMesh.userData.exportRole = "plan"),
        (instancedMesh.userData.instanceItemType = signatureGroup[0].item.type),
        (instancedMesh.userData.instanceItemIds = signatureGroup.map(
          ({ item: batchItemEntry }: any) => batchItemEntry.id,
        )),
        signatureGroup.forEach(({ descriptors: batchDescriptor }: any, instanceIndex: any) => {
          const multiplyMatrices3 = new ns2.Matrix4().multiplyMatrices(
            invert3,
            batchDescriptor[descriptorIndex].mesh.matrixWorld,
          );
          instancedMesh.setMatrixAt(instanceIndex, multiplyMatrices3);
        }),
        (instancedMesh.instanceMatrix.needsUpdate = true),
        instancedMesh.computeBoundingBox(),
        instancedMesh.computeBoundingSphere(),
        batchSceneRoot.add(instancedMesh));
    }
    for (const { group: batchGroup } of signatureGroup)
      (batchSceneRoot.remove(batchGroup), disposeObjectTree(batchGroup));
    instanceBatchStats.push({
      type: signatureGroup[0].item.type,
      instances: signatureGroup.length,
      before: signatureGroup.length * descriptorCount,
      after: descriptorCount,
    });
  }
  return (
    (batchSceneRoot.userData.instanceBatchStats = instanceBatchStats),
    appCtx.threeRenderer?.domElement &&
      ((appCtx.threeRenderer.domElement.dataset.instanceBatchCount = String(instanceBatchStats.length)),
      (appCtx.threeRenderer.domElement.dataset.instanceCount = String(
        instanceBatchStats.reduce(
          (instanceCountAccumulator, batchStat) => instanceCountAccumulator + batchStat.instances,
          0,
        ),
      )),
      (appCtx.threeRenderer.domElement.dataset.instanceDrawCallsSaved = String(
        instanceBatchStats.reduce(
          (savedCountAccumulator, savedStat) =>
            savedCountAccumulator + savedStat.before - savedStat.after,
          0,
        ),
      ))),
    instanceBatchStats
  );
}
function mergeStaticItemMeshes(mergeSceneRoot: any, mergeItemEntries: any) {
  const staticGroupsBySignature = new Map(),
    attributeNamesOf = (mergeItemEntriesSourceMesh: any) => {
      const sort3 = Object.keys(mergeItemEntriesSourceMesh.geometry.attributes)
        .filter(
          (mergeItemEntriesSourceMeshAttributeName) =>
            mergeItemEntriesSourceMeshAttributeName !== "color" ||
            mergeItemEntriesSourceMesh.material.vertexColors,
        )
        .sort();
      return !isEmbeddedStage ||
        Object.values(mergeItemEntriesSourceMesh.material).some(
          (mergeItemEntriesSourceMeshMaterialValue: any) =>
            mergeItemEntriesSourceMeshMaterialValue?.isTexture,
        )
        ? sort3
        : sort3.filter(
            (textureAttributeName) =>
              textureAttributeName === "position" ||
              textureAttributeName === "normal" ||
              (textureAttributeName === "color" &&
                mergeItemEntriesSourceMesh.material.vertexColors),
          );
    };
  mergeSceneRoot.updateMatrixWorld(true);
  for (const { item: staticItem, group: staticItemGroup } of mergeItemEntries)
    staticItemGroup.parent !== mergeSceneRoot ||
      staticItemGroup.userData?.courtyardSurface === true ||
      instanceTestTypeSet.has(staticItem.type) ||
      (isEmbeddedStage &&
        [
          "airer",
          "fan",
          "storagewaterheater",
          "gaswaterheater",
          "airpurifier",
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "fridge",
          "freezer",
          "dishwasher",
          "washer",
          "dryer",
          "plant",
          "camera",
          "presence",
          "speaker",
          "tv",
          "robotvacuum",
          "smallcar",
          "suv",
          "scooter",
        ].includes(staticItem.type)) ||
      createSelectionRef("item", staticItem.id) ||
      staticItemGroup.traverse((staticMesh: any) => {
        if (
          !staticMesh.isMesh ||
          staticMesh.isInstancedMesh ||
          staticMesh.geometry.drawRange.start !== 0 ||
          staticMesh.geometry.drawRange.count !== Infinity
        )
          return;
        for (
          let ancestorNode = staticMesh;
          ancestorNode && ancestorNode !== mergeSceneRoot;
          ancestorNode = ancestorNode.parent
        )
          if (!ancestorNode.visible) return;
        const isEmulatedVertexColor = isEmbeddedStage && !staticMesh.material?.vertexColors,
          ra3 = buildStaticMaterialKey(staticMesh, isEmbeddedStage, isEmulatedVertexColor);
        if (!ra3 || staticMesh.matrixWorld.determinant() < 0) return;
        const attributeSizePairs = attributeNamesOf(staticMesh).map((signatureAttributeName) => [
          signatureAttributeName,
          staticMesh.geometry.attributes[signatureAttributeName].itemSize,
        ]);
        isEmulatedVertexColor && attributeSizePairs.push(["color", 3]);
        const attributeSignatureJson = isEmbeddedStage
            ? JSON.stringify(attributeSizePairs)
            : buildGeometryKey(staticMesh),
          staticBatchKey = ra3 + ":" + attributeSignatureJson + ":" + isEmulatedVertexColor;
        (staticGroupsBySignature.has(staticBatchKey) ||
          staticGroupsBySignature.set(staticBatchKey, []),
          staticGroupsBySignature.get(staticBatchKey).push(staticMesh));
      });
  const invert4 = mergeSceneRoot.matrixWorld.clone().invert(),
    staticBatchStats: any[] = [],
    disposableMaterialSet = new Set();
  for (const staticGroup of staticGroupsBySignature.values()) {
    if (staticGroup.length < 2) continue;
    const clonedGeometries = staticGroup.map((mergedSourceMesh: any) => {
        const multiplyMatrices4 = new ns2.Matrix4().multiplyMatrices(
            invert4,
            mergedSourceMesh.matrixWorld,
          ),
          clone5 = mergedSourceMesh.geometry.clone();
        if (isEmbeddedStage) {
          const keptAttributeNames = attributeNamesOf(mergedSourceMesh);
          for (const mergedAttributeName of Object.keys(clone5.attributes))
            keptAttributeNames.includes(mergedAttributeName) ||
              clone5.deleteAttribute(mergedAttributeName);
          for (const keptAttribute of keptAttributeNames) {
            const sourceAttribute = mergedSourceMesh.geometry.attributes[keptAttribute];
            if (
              !sourceAttribute.isInterleavedBufferAttribute &&
              !sourceAttribute.normalized &&
              sourceAttribute.array instanceof Float32Array
            )
              continue;
            const float32Array = new Float32Array(sourceAttribute.count * sourceAttribute.itemSize),
              componentAccessors = ["getX", "getY", "getZ", "getW"];
            for (let vertexIndex = 0; vertexIndex < sourceAttribute.count; vertexIndex++)
              for (
                let componentIndex = 0;
                componentIndex < sourceAttribute.itemSize;
                componentIndex++
              )
                float32Array[vertexIndex * sourceAttribute.itemSize + componentIndex] =
                  componentIndex < 4
                    ? sourceAttribute[componentAccessors[componentIndex]](vertexIndex)
                    : sourceAttribute.getComponent(vertexIndex, componentIndex);
            clone5.setAttribute(
              keptAttribute,
              new ns2.BufferAttribute(float32Array, sourceAttribute.itemSize),
            );
          }
          if (!mergedSourceMesh.material.vertexColors) {
            const count2 = clone5.attributes.position.count,
              componentArray = new Float32Array(count2 * 3),
              color2 = mergedSourceMesh.material.color;
            for (let colorVertexIndex = 0; colorVertexIndex < count2; colorVertexIndex++)
              ((componentArray[colorVertexIndex * 3] = color2.r),
                (componentArray[colorVertexIndex * 3 + 1] = color2.g),
                (componentArray[colorVertexIndex * 3 + 2] = color2.b));
            clone5.setAttribute("color", new ns2.BufferAttribute(componentArray, 3));
          }
          if (!clone5.index) {
            const count3 = clone5.attributes.position.count,
              uint16Array = count3 <= 65536 ? new Uint16Array(count3) : new Uint32Array(count3);
            for (let indexVertex = 0; indexVertex < count3; indexVertex++)
              uint16Array[indexVertex] = indexVertex;
            clone5.setIndex(new ns2.BufferAttribute(uint16Array, 1));
          }
        }
        return clone5.applyMatrix4(multiplyMatrices4);
      }),
      mergedGeometry = mergeGeometries2(clonedGeometries);
    if ((clonedGeometries.forEach((clonedGeometry: any) => clonedGeometry.dispose()), !mergedGeometry))
      continue;
    const representativeMesh = staticGroup[0],
      isVertexColorInjected = isEmbeddedStage && !representativeMesh.material.vertexColors,
      clone6 = isVertexColorInjected
        ? representativeMesh.material.clone()
        : representativeMesh.material;
    isVertexColorInjected && (clone6.color.setRGB(1, 1, 1), (clone6.vertexColors = true));
    const mergedMesh = new ns2.Mesh(mergedGeometry, clone6);
    (isEmbeddedStage && (mergedMesh.matrixAutoUpdate = false),
      (mergedMesh.castShadow = representativeMesh.castShadow),
      (mergedMesh.receiveShadow = representativeMesh.receiveShadow),
      (mergedMesh.renderOrder = representativeMesh.renderOrder),
      (mergedMesh.layers.mask = representativeMesh.layers.mask),
      (mergedMesh.userData.externalModelSharedTextures =
        representativeMesh.userData.externalModelSharedTextures === true),
      (mergedMesh.userData.externalModelSharedMaterial =
        !isVertexColorInjected && representativeMesh.userData.externalModelSharedMaterial === true),
      (mergedMesh.userData.reflectionSimplifiable = isEmbeddedStage),
      (mergedMesh.userData.modelLayer = "items"),
      (mergedMesh.userData.exportRole = "plan"));
    for (const consumedMesh of staticGroup)
      (consumedMesh.parent?.remove(consumedMesh),
        consumedMesh.userData.externalModelSharedGeometry || consumedMesh.geometry.dispose(),
        consumedMesh.userData.externalModelSharedMaterial ||
          disposableMaterialSet.add(consumedMesh.material));
    (mergeSceneRoot.add(mergedMesh),
      staticBatchStats.push({
        before: staticGroup.length,
        after: 1,
      }));
  }
  for (const { group: leftoverGroup } of mergeItemEntries) {
    let hasRenderableChild = false;
    (leftoverGroup.traverse((leftoverChild: any) => {
      (leftoverChild.isMesh ||
        leftoverChild.isLine ||
        leftoverChild.isPoints ||
        leftoverChild.isSprite) &&
        (hasRenderableChild = true);
    }),
      leftoverGroup.parent === mergeSceneRoot &&
        !hasRenderableChild &&
        mergeSceneRoot.remove(leftoverGroup));
  }
  const retainedMaterialSet = new Set();
  mergeSceneRoot.traverse((materialHolder: any) => {
    for (const retainedMaterial of Array.isArray(materialHolder.material)
      ? materialHolder.material
      : materialHolder.material
        ? [materialHolder.material]
        : [])
      retainedMaterialSet.add(retainedMaterial);
  });
  for (const disposableMaterial of disposableMaterialSet)
    retainedMaterialSet.has(disposableMaterial) || (disposableMaterial as any).dispose?.();
  return (
    (mergeSceneRoot.userData.staticItemBatchStats = staticBatchStats),
    appCtx.threeRenderer?.domElement &&
      ((appCtx.threeRenderer.domElement.dataset.staticItemBatchCount = String(staticBatchStats.length)),
      (appCtx.threeRenderer.domElement.dataset.staticItemDrawCallsSaved = String(
        staticBatchStats.reduce(
          (savedAccumulator, staticBatchStat) =>
            savedAccumulator + staticBatchStat.before - staticBatchStat.after,
          0,
        ),
      ))),
    staticBatchStats
  );
}
function collectSharedMaterials() {
  const sharedMaterialSet = new Set();
  return (
    appCtx.sceneRootNode?.traverse((sharedMesh: any) => {
      if (!sharedMesh.isMesh || !sharedMesh.userData.externalModelSharedGeometry) return;
      const meshMaterials = Array.isArray(sharedMesh.material)
        ? sharedMesh.material
        : sharedMesh.material
          ? [sharedMesh.material]
          : [];
      for (const sharedMaterial of meshMaterials)
        sharedMaterial &&
          !disposedMaterialSet.has(sharedMaterial) &&
          sharedMaterialSet.add(sharedMaterial);
    }),
    [...sharedMaterialSet]
  );
}
function updateExternalModelDataset() {
  if (!appCtx.threeRenderer?.domElement) return;
  const modelLoadState3 = externalModelRegistry.modelLoadState();
  ((appCtx.threeRenderer.domElement.dataset.externalSharedMaterialCount = String(
    modelLoadState3.materials,
  )),
    (appCtx.threeRenderer.domElement.dataset.externalMaterialReuseCount = String(
      modelLoadState3.materialReuses,
    )),
    (appCtx.threeRenderer.domElement.dataset.externalPrecompilePassCount = String(
      appCtx.externalPrecompilePassCount,
    )),
    (appCtx.threeRenderer.domElement.dataset.lightPrecompilePassCount = String(appCtx.lightPrecompilePassCount)));
}
function lightSignatureOf(lightList: any) {
  let lightListSpotLightCount = 0,
    rectAreaLightCount = 0,
    pointLightCount = 0,
    otherLightCount = 0;
  for (const lightListLightEntry of lightList)
    lightListLightEntry.isSpotLight
      ? (lightListSpotLightCount += 1)
      : lightListLightEntry.isRectAreaLight
        ? (rectAreaLightCount += 1)
        : lightListLightEntry.isPointLight
          ? (pointLightCount += 1)
          : (otherLightCount += 1);
  return (
    lightListSpotLightCount +
    ":" +
    rectAreaLightCount +
    ":" +
    pointLightCount +
    ":" +
    otherLightCount
  );
}
function planLightPrecompileBatches() {
  if (!appCtx.sceneRootNode) return [];
  const visibleLights: any = [],
    lightsByGroupId = new Map();
  appCtx.sceneRootNode.traverse((sceneLight: any) => {
    if (
      !sceneLight.isLight ||
      !sceneLight.userData?.lightItemId ||
      (!isEmbeddedStage && finite2(sceneLight.userData.lightOnIntensity, 0) <= 0)
    )
      return;
    sceneLight.visible !== false && visibleLights.push(sceneLight);
    const planLightPrecompileBatchesLightGroupId = String(sceneLight.userData.lightGroupId || "");
    planLightPrecompileBatchesLightGroupId &&
      (lightsByGroupId.has(planLightPrecompileBatchesLightGroupId) ||
        lightsByGroupId.set(planLightPrecompileBatchesLightGroupId, []),
      lightsByGroupId.get(planLightPrecompileBatchesLightGroupId).push(sceneLight));
  });
  const flat = [...lightsByGroupId.values()].flat(),
    processedSignatureSet = new Set(),
    lightBatches: any = [],
    lg2 = lightSignatureOf(visibleLights),
    lightCacheKey = appCtx.sceneRootNode.uuid + ":" + appCtx.externalPrecompilePassCount;
  appCtx.currentPrecompileSignature !== lightCacheKey &&
    ((appCtx.currentPrecompileSignature = lightCacheKey), precompiledMaterialKeySet.clear());
  const addLightBatch = (
    planLightPrecompileBatchesLightEntries: any,
    lightChanges: any,
    isForcedBatch = false,
  ) => {
    const lg3 = lightSignatureOf(planLightPrecompileBatchesLightEntries);
    processedSignatureSet.has(lg3) ||
      (processedSignatureSet.add(lg3),
      !precompiledMaterialKeySet.has(lg3) &&
        ((!isForcedBatch &&
          lg3 !== lg2 &&
          precompiledMaterialKeySet.size + lightBatches.length >= maxPrecompileBatchSize) ||
          lightBatches.push({
            signature: lg3,
            lights: lightChanges
              .filter((batchLightEntry: any) => batchLightEntry.visible)
              .map((lightChangeRecord: any) => lightChangeRecord.light),
            changes: lightChanges,
          })));
  };
  (addLightBatch(visibleLights, [], true),
    addLightBatch(
      [],
      flat.map((groupLightEntry) => ({
        light: groupLightEntry,
        visible: false,
      })),
      true,
    ));
  for (const groupLights of lightsByGroupId.values()) {
    const hiddenLights = groupLights.filter(
      (hiddenLightEntry: any) => hiddenLightEntry.visible === false,
    );
    hiddenLights.length &&
      addLightBatch(
        [...visibleLights, ...hiddenLights],
        hiddenLights.map((revealLightChange: any) => ({
          light: revealLightChange,
          visible: true,
        })),
      );
    const visibleGroupLights = groupLights.filter(
      (visibleGroupLight: any) => visibleGroupLight.visible !== false,
    );
    visibleGroupLights.length &&
      addLightBatch(
        visibleLights.filter((retainedLight: any) => !visibleGroupLights.includes(retainedLight)),
        visibleGroupLights.map((hideLightChange: any) => ({
          light: hideLightChange,
          visible: false,
        })),
      );
  }
  return (
    isEmbeddedStage &&
      addLightBatch(
        flat,
        flat.map((flatLightEntry) => ({
          light: flatLightEntry,
          visible: true,
        })),
        true,
      ),
    lightBatches
  );
}
function shouldSuspendSceneWork() {
  return (
    appCtx.isPageHidden ||
    appCtx.isDisposed ||
    document.hidden ||
    (isEmbeddedStage && (!appCtx.isHighDetailQuality || renderCacheWriter?.closed))
  );
}
function shouldDeferSceneWork() {
  return (
    appCtx.pendingRuntimeSettings ||
    appCtx.isRenderSuppressed ||
    appCtx.isWindowHidden ||
    appCtx.isCapturingLights ||
    appCtx.isRendererUnavailable ||
    (isEmbeddedStage && (appCtx.isPrewarming || appCtx.prewarmState)) ||
    (!isEmbeddedStage && areLightsEnabled())
  );
}
function scheduleLightPrecompile(delayMs = 360) {
  isEmbedStageMode ||
    isAutoDiagramEmbed ||
    appCtx.isPageHidden ||
    ((appCtx.isEnvironmentLoading = true),
    window.clearTimeout(appCtx.precompileDebounceId),
    !(appCtx.isLightPrecompileRunning || shouldSuspendSceneWork()) &&
      (appCtx.precompileDebounceId = window.setTimeout(async () => {
        if (((appCtx.precompileDebounceId = null), shouldSuspendSceneWork())) return;
        const modelLoadState4 = externalModelRegistry.modelLoadState();
        if (
          !appCtx.threeRenderer ||
          !appCtx.threeScene ||
          !appCtx.threeCamera ||
          !appCtx.sceneRootNode ||
          shouldDeferSceneWork() ||
          appCtx.isExternalModelLoadDeferred ||
          appCtx.modelLoadDebounceId ||
          (modelLoadState4.pending ?? modelLoadState4.active + modelLoadState4.queued) > 0
        ) {
          scheduleLightPrecompile(240);
          return;
        }
        const qv3 = planLightPrecompileBatches(),
          lightSceneRoot = appCtx.sceneRootNode,
          ue2 = appCtx.threeScene,
          activeRenderer = appCtx.threeRenderer;
        if (!qv3.length) {
          ((appCtx.isEnvironmentLoading = false),
            (activeRenderer.domElement.dataset.lightPrecompileState = "ready"),
            updateExternalModelDataset());
          return;
        }
        ((appCtx.isLightPrecompileRunning = true),
          (appCtx.isEnvironmentLoading = false),
          (activeRenderer.domElement.dataset.lightPrecompileState = "working"),
          (activeRenderer.domElement.dataset.lightPrecompilePlanCount = String(qv3.length)));
        const shouldAbortPrecompile = () =>
          appCtx.sceneRootNode === lightSceneRoot &&
          appCtx.threeScene === ue2 &&
          appCtx.threeRenderer === activeRenderer &&
          !appCtx.isEnvironmentLoading &&
          !shouldSuspendSceneWork() &&
          !shouldDeferSceneWork();
        let isPrecompileComplete = true;
        try {
          for (const pendingLightBatch of qv3) {
            if ((await waitForIdleFrame(), !shouldAbortPrecompile())) {
              ((isPrecompileComplete = false), (appCtx.isEnvironmentLoading = true));
              break;
            }
            const lightChangeRecords = pendingLightBatch.changes.map(
              ({ light: pendingLightEntry, visible: nextVisibleState }: any) => ({
                light: pendingLightEntry,
                nextVisible: nextVisibleState,
                visible: pendingLightEntry.visible,
                intensity: pendingLightEntry.intensity,
              }),
            );
            let compilePromise: any = null;
            try {
              for (const lightChangeEntry of lightChangeRecords)
                ((lightChangeEntry.light.intensity = 0),
                  (lightChangeEntry.light.visible = lightChangeEntry.nextVisible));
              (setupSceneShadows(lightSceneRoot, {
                rebuildAtlas: false,
              }),
                (compilePromise = precompileShaderPrograms(
                  activeRenderer,
                  ue2,
                  appCtx.threeCamera,
                  shouldAbortPrecompile,
                )));
            } finally {
              for (const restoreLightEntry of lightChangeRecords)
                ((restoreLightEntry.light.visible = restoreLightEntry.visible),
                  (restoreLightEntry.light.intensity = restoreLightEntry.intensity));
              setupSceneShadows(lightSceneRoot, {
                rebuildAtlas: false,
              });
            }
            if (!(await compilePromise) || !shouldAbortPrecompile()) {
              ((isPrecompileComplete = false),
                (activeRenderer.domElement.dataset.lightPrecompileDeferred = "true"),
                (appCtx.isEnvironmentLoading ||= !shouldAbortPrecompile()));
              break;
            }
            ((appCtx.lightPrecompilePassCount += 1),
              precompiledMaterialKeySet.add(pendingLightBatch.signature));
          }
          isPrecompileComplete
            ? (delete activeRenderer.domElement.dataset.lightPrecompileDeferred,
              (activeRenderer.domElement.dataset.lightPrecompileState = "ready"))
            : (activeRenderer.domElement.dataset.lightPrecompileState = "deferred");
        } catch {
          activeRenderer.domElement.dataset.lightPrecompileState = "fallback";
        } finally {
          ((appCtx.isLightPrecompileRunning = false),
            updateExternalModelDataset(),
            appCtx.isEnvironmentLoading && scheduleLightPrecompile(240));
        }
      }, delayMs)));
}
(document.addEventListener("visibilitychange", () => {
  !document.hidden && appCtx.isEnvironmentLoading && scheduleLightPrecompile();
}),
  window.addEventListener(
    "pagehide",
    () => {
      ((appCtx.isPageHidden = true), window.clearTimeout(appCtx.precompileDebounceId));
    },
    {
      once: true,
    },
  ));
function scheduleExternalPrecompile(initialDelayMs = 0) {
  isEmbedStageMode ||
    ((appCtx.isRecoveryRender = true),
    window.clearTimeout(appCtx.precompileTimeoutId),
    !(appCtx.isRendererUnavailable || appCtx.isDisposed) &&
      (appCtx.precompileTimeoutId = window.setTimeout(async () => {
        if (
          ((appCtx.precompileTimeoutId = null),
          !appCtx.threeRenderer ||
            !appCtx.threeScene ||
            !appCtx.threeCamera ||
            !appCtx.sceneRootNode ||
            appCtx.pendingRuntimeSettings ||
            document.hidden ||
            appCtx.isRenderSuppressed ||
            appCtx.isWindowHidden ||
            appCtx.isCapturingLights)
        ) {
          scheduleExternalPrecompile(240);
          return;
        }
        const sg2 = collectSharedMaterials();
        if (!sg2.length) {
          ((appCtx.isRecoveryRender = false), updateExternalModelDataset(), scheduleLightPrecompile());
          return;
        }
        ((appCtx.isRendererUnavailable = true),
          (appCtx.isRecoveryRender = false),
          (appCtx.threeRenderer.domElement.dataset.externalPrecompileState = "working"));
        try {
          (setupSceneShadows(appCtx.sceneRootNode, {
            rebuildAtlas: false,
          }),
            appCtx.threeRenderer.compile(appCtx.threeScene, appCtx.threeCamera),
            sg2.forEach((materialToCache) => disposedMaterialSet.add(materialToCache as object)),
            (appCtx.externalPrecompilePassCount += 1),
            (appCtx.threeRenderer.domElement.dataset.externalPrecompileState = "ready"));
        } catch {
          appCtx.threeRenderer.domElement.dataset.externalPrecompileState = "fallback";
        } finally {
          ((appCtx.isRendererUnavailable = false),
            updateExternalModelDataset(),
            appCtx.isRecoveryRender ? scheduleExternalPrecompile(120) : scheduleLightPrecompile());
        }
      }, initialDelayMs)));
}
function requestSceneRebuild(rebuildOptions: SceneRebuildOptions = {}) {
  if (typeof appCtx.isSceneStillLoading < "u" && appCtx.isSceneStillLoading) {
    assetLoaderState.revision++;
    return;
  }
  const isForcedRebuild = rebuildOptions.force === true,
    isExternalOnlyRebuild = rebuildOptions.externalModelsOnly === true,
    scope =
      typeof rebuildOptions.scope === "string" &&
      ["items", "lights", "architecture"].includes(rebuildOptions.scope)
        ? rebuildOptions.scope
        : "all";
  if (!getPreviewSyncMode() && !isForcedRebuild) {
    (rebuildOptions.transient !== true && (appCtx.isSceneDirty = true), refreshPreviewSync());
    return;
  }
  (isForcedRebuild
    ? ((appCtx.isMaterialPrecompilePending = true),
      isExternalOnlyRebuild || (dirtyFloorIdSet.add("all"), (appCtx.hasAllFloorsSelected = true)))
    : (dirtyFloorIdSet.add(scope), scope === "all" && (appCtx.hasAllFloorsSelected = true)),
    isExternalOnlyRebuild && (appCtx.isRuntimeWarmupDone = true),
    rebuildOptions.precompile === true && (appCtx.isRendererLost = true),
    rebuildOptions.preserveLightCache !== true && (appCtx.isLightCachePreserved = true),
    !appCtx.isPrecompileBlocked &&
      ((appCtx.isPrecompileBlocked = true),
      requestAnimationFrame(() => {
        if (((appCtx.isPrecompileBlocked = false), appCtx.isWindowHidden && !appCtx.isMaterialPrecompilePending)) return;
        const wl4 = getPreviewSyncMode() || appCtx.isMaterialPrecompilePending;
        if (((appCtx.isMaterialPrecompilePending = false), !wl4)) {
          ((appCtx.isSceneDirty = true), refreshPreviewSync());
          return;
        }
        const rebuildScopeSet = new Set(dirtyFloorIdSet);
        dirtyFloorIdSet.clear();
        const yl5 = appCtx.hasAllFloorsSelected || rebuildScopeSet.has("all");
        appCtx.hasAllFloorsSelected = false;
        const shouldPreserveLightCacheOnRebuild = !appCtx.isLightCachePreserved;
        appCtx.isLightCachePreserved = false;
        const Hr2 = typeof appCtx.isRuntimeWarmupDone < "u" && appCtx.isRuntimeWarmupDone;
        (typeof appCtx.isRuntimeWarmupDone < "u" && (appCtx.isRuntimeWarmupDone = false),
          typeof stageLoadTiming == "function" && stageLoadTiming("rebuild-start"),
          Hr2 &&
          !yl5 &&
          !rebuildScopeSet.has("architecture") &&
          !rebuildScopeSet.has("lights") &&
          appCtx.sceneRootNode?.children?.length
            ? (getPreviewFloorMode() === "all"
                ? buildLayerForFloor("items", {
                    preserveLightCache: false,
                  })
                : (buildFloorAtIndex(new Set(["items"]), {
                    preserveLightCache: false,
                  }),
                  true)) ||
              rebuildFloorLayers({
                preserveLightCache: shouldPreserveLightCacheOnRebuild,
              })
            : yl5 || !appCtx.studioState.walls.length
              ? rebuildFloorLayers({
                  preserveLightCache: shouldPreserveLightCacheOnRebuild,
                })
              : buildFloorAtIndex(rebuildScopeSet, {
                  preserveLightCache: shouldPreserveLightCacheOnRebuild,
                  allowTransforms: !Hr2 && rebuildScopeSet.size === 1 && rebuildScopeSet.has("items"),
                }),
          typeof stageLoadTiming == "function" && stageLoadTiming("rebuild-end"));
        const zd2 = appCtx.isRendererLost;
        ((appCtx.isRendererLost = false),
          updateExternalModelDataset(),
          (zd2 || collectSharedMaterials().length) && scheduleExternalPrecompile(),
          (appCtx.isSceneDirty = false),
          refreshPreviewSync());
      })));
}
function getSceneContentBounds() {
  return sceneContentBounds2(appCtx.studioState);
}
function computeCourtyardBounds({ physicalStack: isPhysicalStack = false } = {}) {
  if (!appCtx.studioProject?.floors?.length) return null;
  const isAllFloors = getPreviewFloorMode() === "all",
    sort4 = isAllFloors
      ? [...appCtx.studioProject.floors].sort((floorA, floorB) => floorA.elevation - floorB.elevation)
      : appCtx.studioProject.floors.filter(
          (isPhysicalStackFloorMatch: any) => isPhysicalStackFloorMatch.id === appCtx.activeFloorId,
        );
  if (
    !sort4.some((isPhysicalStackFloorCandidate: any) =>
      isPhysicalStackFloorCandidate.scene.items.some(isCourtyardDrawing2),
    )
  )
    return null;
  const courtyardBoundsBox = new ns2.Box3(),
    floorGapMeters = appCtx.pendingRuntimeSettings
      ? finite2(appCtx.studioProject.exportFloorGap, 3)
      : finite2(appCtx.studioProject.previewFloorGap, 3);
  return (
    sort4.forEach((isPhysicalStackFloorEntry: any, isPhysicalStackFloorIndex: any) => {
      const isPhysicalStackPixelsPerMeter =
          isPhysicalStackFloorEntry.scene.calibration?.pixelsPerMeter || 100,
        isPhysicalStackFloorModelOrigin = sceneModelOrigin2(
          isPhysicalStackFloorEntry.scene,
          isPhysicalStackFloorEntry,
        ),
        floorElevationOffset = isAllFloors
          ? isPhysicalStack
            ? isPhysicalStackFloorEntry.elevation - sort4[0].elevation
            : isPhysicalStackFloorIndex * floorGapMeters
          : 0,
        maxCourtyardHeight = Math.max(
          0,
          ...isPhysicalStackFloorEntry.scene.walls.map((isPhysicalStackWallEntry: any) =>
            finite2(
              isPhysicalStackWallEntry.height,
              isPhysicalStackFloorEntry.scene.settings?.wallHeight || 2.8,
            ),
          ),
          ...isPhysicalStackFloorEntry.scene.items
            .filter(isCourtyardDrawing2)
            .map(
              (courtyardLevelDrawing: any) =>
                finite2(courtyardLevelDrawing.elevation, 0) +
                finite2(courtyardLevelDrawing.height, 0),
            ),
        );
      for (const courtyardBoundaryPoint of courtyardBoundaryPoints2(
        isPhysicalStackFloorEntry.scene,
        isPhysicalStackPixelsPerMeter,
      )) {
        const $a4 = isAllFloors
          ? planToWorldPoint(isPhysicalStackFloorEntry, courtyardBoundaryPoint)
          : {
              x:
                (courtyardBoundaryPoint.x - isPhysicalStackFloorModelOrigin.x) /
                isPhysicalStackPixelsPerMeter,
              z:
                (courtyardBoundaryPoint.y - isPhysicalStackFloorModelOrigin.y) /
                isPhysicalStackPixelsPerMeter,
            };
        (courtyardBoundsBox.expandByPoint(new ns2.Vector3($a4.x, floorElevationOffset, $a4.z)),
          courtyardBoundsBox.expandByPoint(
            new ns2.Vector3($a4.x, floorElevationOffset + maxCourtyardHeight, $a4.z),
          ));
      }
    }),
    courtyardBoundsBox.isEmpty() ? null : courtyardBoundsBox
  );
}
function buildFloorEdgeOutline(floorEdgePointList: any, floorEdgeColor: any, floorEdgeHeight: any) {
  const outlineBoxGeometries: any[] = [],
    shadowBoxGeometries: any[] = [];
  for (let floorEdgeIndex = 0; floorEdgeIndex < floorEdgePointList.length; floorEdgeIndex += 1) {
    const floorEdgeStartPoint = floorEdgePointList[floorEdgeIndex],
      floorEdgeEndPoint = floorEdgePointList[(floorEdgeIndex + 1) % floorEdgePointList.length],
      floorEdgeDeltaX = floorEdgeEndPoint.x - floorEdgeStartPoint.x,
      floorEdgeDeltaZ = floorEdgeEndPoint.z - floorEdgeStartPoint.z,
      hypot6 = Math.hypot(floorEdgeDeltaX, floorEdgeDeltaZ);
    if (hypot6 <= 0.001) continue;
    const floorEdgeMidX = (floorEdgeStartPoint.x + floorEdgeEndPoint.x) / 2,
      floorEdgeMidZ = (floorEdgeStartPoint.z + floorEdgeEndPoint.z) / 2,
      floorEdgeAngle = -Math.atan2(floorEdgeDeltaZ, floorEdgeDeltaX),
      compose2 = new ns2.Matrix4().compose(
        new ns2.Vector3(floorEdgeMidX, floorEdgeHeight + 0.021, floorEdgeMidZ),
        new ns2.Quaternion().setFromAxisAngle(new ns2.Vector3(0, 1, 0), floorEdgeAngle),
        new ns2.Vector3(1, 1, 1),
      ),
      compose3 = new ns2.Matrix4().compose(
        new ns2.Vector3(floorEdgeMidX, floorEdgeHeight + 0.026, floorEdgeMidZ),
        new ns2.Quaternion().setFromAxisAngle(new ns2.Vector3(0, 1, 0), floorEdgeAngle),
        new ns2.Vector3(1, 1, 1),
      );
    (outlineBoxGeometries.push(new ns2.BoxGeometry(hypot6, 0.042, 0.038).applyMatrix4(compose2)),
      shadowBoxGeometries.push(
        new ns2.BoxGeometry(hypot6 + 0.025, 0.066, 0.078).applyMatrix4(compose3),
      ));
  }
  const outlineMergedGeometry = outlineBoxGeometries.length
      ? mergeGeometries2(outlineBoxGeometries)
      : null,
    shadowMergedGeometry = shadowBoxGeometries.length
      ? mergeGeometries2(shadowBoxGeometries)
      : null;
  if (
    (outlineBoxGeometries.forEach((outlineBoxGeometry) => outlineBoxGeometry.dispose()),
    shadowBoxGeometries.forEach((shadowBoxGeometry) => shadowBoxGeometry.dispose()),
    outlineMergedGeometry)
  ) {
    const floorOutlineMesh = new ns2.Mesh(
      outlineMergedGeometry,
      new ns2.MeshBasicMaterial({
        color: floorEdgeColor,
        transparent: true,
        opacity: 0.82,
        toneMapped: false,
      }),
    );
    ((floorOutlineMesh.renderOrder = 3),
      (floorOutlineMesh.userData.exportRole = "outline"),
      (floorOutlineMesh.userData.batchedFloorEdgeCount = floorEdgePointList.length),
      appCtx.sceneRootNode.add(floorOutlineMesh));
  }
  if (shadowMergedGeometry) {
    const floorShadowMesh = new ns2.Mesh(
      shadowMergedGeometry,
      new ns2.MeshBasicMaterial({
        color: floorEdgeColor,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        blending: ns2.AdditiveBlending,
        toneMapped: false,
      }),
    );
    ((floorShadowMesh.renderOrder = 2),
      (floorShadowMesh.userData.exportRole = "outline"),
      (floorShadowMesh.userData.batchedFloorEdgeCount = floorEdgePointList.length),
      appCtx.sceneRootNode.add(floorShadowMesh));
  }
}
function createFloorMaterial() {
  const yt5 = backgroundSettings(),
    floorMaterial = new ns2.MeshStandardMaterial({
      color: yt5.floor,
      roughness: 0.96,
      metalness: 0,
      emissive: yt5.floor,
      emissiveIntensity: 0.025,
    });
  return (decorateWarmFloor2(floorMaterial, yt5), floorMaterial);
}
function buildCourtyardFoundation({ ppm: courtyardPixelsPerMeter, toWorld: courtyardToWorld }: any) {
  const floorEdgeIndoorLoops = appCtx.sceneRootNode.userData.floorEdgeIndoorLoops;
  if (!floorEdgeIndoorLoops) return;
  const courtyardDrawingList = appCtx.studioState.items.filter(
      (courtyardDrawingItem) =>
        courtyardDrawingItem.type === "courtyard-area" ||
        courtyardDrawingItem.type === "courtyard-fence",
    ),
    floorEdge = backgroundSettings().floorEdge,
    courtyardSignature = JSON.stringify([
      floorEdgeIndoorLoops,
      courtyardDrawingList.map((courtyardDrawingEntry) => [
        courtyardDrawingEntry.type,
        courtyardDrawingEntry.x,
        courtyardDrawingEntry.y,
        courtyardDrawingEntry.width,
        courtyardDrawingEntry.depth,
        courtyardDrawingEntry.rotation,
        courtyardDrawingEntry.drawing.points,
        courtyardDrawingEntry.drawing.holes,
        courtyardDrawingEntry.drawing.closed,
        courtyardDrawingEntry.drawing.thickness,
        courtyardDrawingEntry.drawing.style,
      ]),
      courtyardPixelsPerMeter,
      floorEdge,
      appCtx.studioState.settings.floorEdgeVisible,
    ]);
  if (appCtx.sceneRootNode.userData.floorEdgeKey === courtyardSignature) return;
  for (const foundationChildObject of [...appCtx.sceneRootNode.children])
    (foundationChildObject.userData.exportRole === "outline" ||
      foundationChildObject.userData.courtyardFoundation) &&
      (appCtx.sceneRootNode.remove(foundationChildObject), disposeObjectTree(foundationChildObject));
  appCtx.sceneRootNode.userData.floorEdgeKey = courtyardSignature;
  const courtyardFootprintLoops = courtyardDrawingList.length
      ? courtyardFootprintLoops2(
          floorEdgeIndoorLoops,
          courtyardDrawingList,
          courtyardPixelsPerMeter,
          courtyardToWorld,
          appCtx.studioState.walls,
        )
      : floorEdgeIndoorLoops.map((indoorLoopGroup: any) =>
          indoorLoopGroup.map((indoorLoopPoint: any) => ({
            x: indoorLoopPoint.x,
            y: indoorLoopPoint.z,
          })),
        ),
    outerFootprintLoops = courtyardFootprintLoops.filter(
      (footprintLoop: any) => polygonArea2(footprintLoop) > 0,
    );
  if (courtyardDrawingList.length && outerFootprintLoops.length) {
    const cutoutLoops = [
        ...floorEdgeIndoorLoops.map((cutoutIndoorLoopGroup: any) =>
          cutoutIndoorLoopGroup.map((cutoutIndoorPoint: any) => ({
            x: cutoutIndoorPoint.x,
            y: cutoutIndoorPoint.z,
          })),
        ),
        ...courtyardFootprintLoops.filter(
          (holeFootprintLoop: any) => polygonArea2(holeFootprintLoop) < 0,
        ),
        ...(appCtx.sceneRootNode.userData.floorEdgeOpenings || []),
      ],
      holedFootprintLoops = subtractPolygonLoops2(outerFootprintLoops, cutoutLoops, 0.00001),
      ms4 = buildShapesWithHoles(holedFootprintLoops);
    if (ms4.length) {
      const foundationMesh = new ns2.Mesh(
        new ns2.ExtrudeGeometry(ms4, {
          depth: 0.16,
          bevelEnabled: false,
          steps: 1,
        }),
        createFloorMaterial(),
      );
      ((foundationMesh.rotation.x = Math.PI / 2),
        (foundationMesh.position.y = -0.008),
        (foundationMesh.receiveShadow = true),
        Object.assign(foundationMesh.userData, {
          courtyardFoundation: true,
          exportRole: "plan",
          regionReceiverKind: "floor",
          regionFloorId: appCtx.activeFloorId,
        }),
        appCtx.sceneRootNode.add(foundationMesh));
    }
  }
  if (appCtx.studioState.settings.floorEdgeVisible !== false) {
    for (const closedFootprintLoop of outerFootprintLoops)
      buildFloorEdgeOutline(
        courtyardDrawingList.length
          ? outerPerimeterLine2(closedFootprintLoop)
          : closedFootprintLoop.map((perimeterPoint: any) => ({
              x: perimeterPoint.x,
              z: perimeterPoint.y,
            })),
        floorEdge,
        -0.168,
      );
  }
}
function createGroundGrid(groundGridSize: any, groundGridTheme: any, groundGridHeight: any) {
  const groundGridDivisions = Math.max(Math.round(groundGridSize / 1.25), 12),
    groundGrid = new ns2.GridHelper(
      groundGridSize,
      groundGridDivisions,
      groundGridTheme.grid,
      groundGridTheme.grid,
    ),
    cameraWorldPosition = new ns2.Vector3();
  ((groundGrid.material.transparent = true),
    (groundGrid.material.opacity = 0.24),
    (groundGrid.material.depthWrite = false),
    (groundGrid.material.toneMapped = false),
    (groundGrid.material.onBeforeCompile = (gridShader: any) => {
      ((gridShader.uniforms.gridFadeNear = {
        value: groundGridSize * 0.18,
      }),
        (gridShader.uniforms.gridFadeFar = {
          value: groundGridSize * 0.46,
        }),
        (gridShader.uniforms.gridDepthFadeNear = {
          value: groundGridSize * 0.18,
        }),
        (gridShader.uniforms.gridDepthFadeFar = {
          value: groundGridSize * 0.36,
        }),
        (gridShader.vertexShader = gridShader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec2 vGridLocalPosition;\nvarying float vGridViewDepth;",
          )
          .replace(
            "#include <project_vertex>",
            "#include <project_vertex>\nvGridLocalPosition = position.xz;\nvGridViewDepth = max(-mvPosition.z, 0.0);",
          )),
        (gridShader.fragmentShader = gridShader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nuniform float gridFadeNear;\nuniform float gridFadeFar;\nuniform float gridDepthFadeNear;\nuniform float gridDepthFadeFar;\nvarying vec2 vGridLocalPosition;\nvarying float vGridViewDepth;",
          )
          .replace(
            "vec4 diffuseColor = vec4( diffuse, opacity );",
            "vec4 diffuseColor = vec4( diffuse, opacity );\nfloat radialFade = 1.0 - smoothstep(gridFadeNear, gridFadeFar, length(vGridLocalPosition));\nfloat depthFade = 1.0 - smoothstep(gridDepthFadeNear, gridDepthFadeFar, vGridViewDepth);\ndiffuseColor.a *= radialFade * mix(0.28, 1.0, depthFade);",
          )),
        (groundGrid.material.userData.depthFadeShader = gridShader));
    }),
    (groundGrid.onBeforeRender = (_gridRenderer: any, _gridScene: any, gridCamera: any) => {
      const depthFadeShader = groundGrid.material.userData.depthFadeShader;
      if (!depthFadeShader) return;
      groundGrid.getWorldPosition(cameraWorldPosition);
      const cameraDistanceToOrigin = Math.max(
          gridCamera.position.distanceTo(appCtx.orbitControls?.target || cameraWorldPosition),
          1,
        ),
        cameraViewHeight = gridCamera.isOrthographicCamera
          ? Math.abs(gridCamera.top - gridCamera.bottom) / Math.max(gridCamera.zoom, 0.001)
          : 2 * cameraDistanceToOrigin * Math.tan(ns2.MathUtils.degToRad(gridCamera.fov * 0.5)),
        cameraViewWidth = Math.max(
          Math.hypot(cameraViewHeight * Math.max(gridCamera.aspect, 0.1), cameraViewHeight),
          2,
        ),
        gridFadeNear = cameraDistanceToOrigin + cameraViewWidth * 0.2;
      ((depthFadeShader.uniforms.gridDepthFadeNear.value = gridFadeNear),
        (depthFadeShader.uniforms.gridDepthFadeFar.value = Math.max(
          gridFadeNear + 1,
          cameraDistanceToOrigin + cameraViewWidth * 0.85,
        )));
    }),
    (groundGrid.position.y = groundGridHeight + 0.012),
    (groundGrid.renderOrder = 2),
    (groundGrid.userData.exportRole = "grid"),
    appCtx.sceneRootNode.add(groundGrid));
}
function buildGroundShadow(groundShadowLoopList: any, groundShadowHeight: any, groundShadowHoles: any[] = []) {
  if (!Array.isArray(groundShadowLoopList) || groundShadowLoopList.length < 3) return;
  const groundShadowPoints = groundShadowLoopList.map((groundShadowLoopPoint) => ({
    x: groundShadowLoopPoint.x,
    y: groundShadowLoopPoint.z,
  }));
  [
    {
      spread: 0.035,
      offsetX: 0.13,
      offsetY: -0.1,
      opacity: 0.12,
    },
    {
      spread: 0.13,
      offsetX: 0.18,
      offsetY: -0.14,
      opacity: 0.055,
    },
    {
      spread: 0.3,
      offsetX: 0.24,
      offsetY: -0.19,
      opacity: 0.018,
    },
  ].forEach((shadowLayerConfig, shadowLayerIndex) => {
    const shadowLayerPoints = expandPolygonOutward(
        groundShadowPoints,
        shadowLayerConfig.spread,
      ).map((shadowLayerPoint: any) => ({
        x: shadowLayerPoint.x + shadowLayerConfig.offsetX,
        y: shadowLayerPoint.y + shadowLayerConfig.offsetY,
      })),
      ms5 = groundShadowHoles.length
        ? buildShapesWithHoles(subtractPolygonLoops2([shadowLayerPoints], groundShadowHoles))
        : createOutlinePath(ns2.Shape, shadowLayerPoints),
      groundShadowMesh = new ns2.Mesh(
        new ns2.ShapeGeometry(ms5, 1),
        new ns2.MeshBasicMaterial({
          color: 329482,
          transparent: true,
          opacity: shadowLayerConfig.opacity,
          depthWrite: false,
          toneMapped: false,
          side: ns2.DoubleSide,
          forceSinglePass: isEmbeddedStage,
        }),
      );
    ((groundShadowMesh.rotation.x = Math.PI / 2),
      (groundShadowMesh.position.y = groundShadowHeight + 0.001 + shadowLayerIndex * 0.00015),
      (groundShadowMesh.userData.floorPlanGroundShadow = true),
      (groundShadowMesh.userData.exportRole = "background"),
      (groundShadowMesh.visible = appCtx.sceneStyle !== "warm-wood"),
      (groundShadowMesh.renderOrder = 1 + shadowLayerIndex),
      appCtx.sceneRootNode.add(groundShadowMesh));
  });
}
function buildStudioScene({ preserveLightCache: preserveLightCache = false } = {}) {
  if (
    (appCtx.contactShadowController?.invalidate(),
    isEmbedStageMode && appCtx.sceneRootNode && (appCtx.sceneRootNode.userData.regionFloorId = appCtx.activeFloorId),
    !appCtx.sceneRootNode)
  )
    return;
  (refreshBaseLighting(),
    disposeFloorScene(),
    refreshSceneRender({
      shadows: true,
      scene: true,
      preserveLightCache: preserveLightCache,
    }));
  const buildStudioSceneScenePixelsPerMeter = getPixelsPerMeter();
  if (!buildStudioSceneScenePixelsPerMeter) return;
  const yt7 = backgroundSettings(),
    qu2 = getSceneContentBounds(),
    nn2 = appCtx.sceneModelOrigin || sceneModelOrigin2(appCtx.studioState, getActiveFloor()),
    planOriginX = nn2.x,
    planOriginY = nn2.y,
    planPointToWorld = (buildStudioScenePlanPoint: any) => ({
      x: (buildStudioScenePlanPoint.x - planOriginX) / buildStudioSceneScenePixelsPerMeter,
      z: (buildStudioScenePlanPoint.y - planOriginY) / buildStudioSceneScenePixelsPerMeter,
    }),
    planWidth = Math.max(qu2.width / buildStudioSceneScenePixelsPerMeter + 1, 3),
    planHeight = Math.max(qu2.height / buildStudioSceneScenePixelsPerMeter + 1, 3),
    groundPlaneY = -0.008,
    groundPlaneGap = 0.16,
    groundShadowPlaneY = groundPlaneY - groundPlaneGap - 0.035,
    groundPlaneSize = Math.max(Math.max(planWidth, planHeight) * 16, 260),
    groundPlane = new ns2.Mesh(
      new ns2.PlaneGeometry(groundPlaneSize, groundPlaneSize),
      new ns2.MeshBasicMaterial({
        color: yt7.ground,
        toneMapped: false,
      }),
    );
  ((groundPlane.rotation.x = -Math.PI / 2),
    (groundPlane.position.y = groundShadowPlaneY),
    (groundPlane.receiveShadow = false),
    (groundPlane.userData.exportRole = "background"),
    (groundPlane.userData.groundReflectionReceiver = true),
    (groundPlane.userData.regionFloorId = appCtx.activeFloorId),
    appCtx.sceneRootNode.add(groundPlane),
    createGroundGrid(groundPlaneSize, yt7, groundShadowPlaneY));
  const mg2 = createFloorMaterial(),
    mr2 = closedWallLoops(buildStudioSceneScenePixelsPerMeter);
  ((appCtx.sceneRootNode.userData.floorEdgeIndoorLoops = []), delete appCtx.sceneRootNode.userData.floorEdgeKey);
  const floorOpeningLoops = appCtx.studioState.items
    .filter(
      (buildStudioSceneFloorOpeningItem) =>
        buildStudioSceneFloorOpeningItem.type === "flooropening",
    )
    .map((floorOpeningDrawing) =>
      floorOpeningPolygon2(floorOpeningDrawing, buildStudioSceneScenePixelsPerMeter).map(
        (floorOpeningPoint) => {
          const floorOpeningWorldPoint = planPointToWorld(floorOpeningPoint);
          return {
            x: floorOpeningWorldPoint.x,
            y: floorOpeningWorldPoint.z,
          };
        },
      ),
    );
  appCtx.sceneRootNode.userData.floorEdgeOpenings = floorOpeningLoops;
  const addFloorIndoorLoop = (floorOpeningIndoorLoop: any) => {
      (buildGroundShadow(floorOpeningIndoorLoop, groundShadowPlaneY),
        appCtx.sceneRootNode.userData.floorEdgeIndoorLoops.push(floorOpeningIndoorLoop));
    },
    addGroundPlateMesh = (floorPlateGeometry: any, groundPlateGeometry: any, isVerticalFloorPlate: any) => {
      const groundPlateMesh = new ns2.Mesh(groundPlateGeometry, mg2);
      ((groundPlateMesh.rotation.x = isVerticalFloorPlate ? Math.PI / 2 : 0),
        (groundPlateMesh.position.y = isVerticalFloorPlate
          ? groundPlaneY
          : groundPlaneY - groundPlaneGap / 2),
        (groundPlateMesh.castShadow = false),
        (groundPlateMesh.receiveShadow = true),
        (groundPlateMesh.userData.exportRole = "plan"),
        (groundPlateMesh.userData.regionReceiverKind = "floor"),
        (groundPlateMesh.userData.regionFloorId = appCtx.activeFloorId),
        appCtx.sceneRootNode.add(groundPlateMesh),
        floorOpeningLoops.length || addFloorIndoorLoop(floorPlateGeometry));
    };
  if (floorOpeningLoops.length) {
    const floorOpeningWorldLoops = mr2.length
        ? mr2.map((floorOpeningWorldMap: any) =>
            floorOpeningWorldMap.map((floorOpeningPlanPoint: any) => {
              const floorOpeningPlanWorldPoint = planPointToWorld(floorOpeningPlanPoint);
              return {
                x: floorOpeningPlanWorldPoint.x,
                y: floorOpeningPlanWorldPoint.z,
              };
            }),
          )
        : [
            [
              {
                x: -planWidth / 2,
                y: -planHeight / 2,
              },
              {
                x: planWidth / 2,
                y: -planHeight / 2,
              },
              {
                x: planWidth / 2,
                y: planHeight / 2,
              },
              {
                x: -planWidth / 2,
                y: planHeight / 2,
              },
            ],
          ],
      floorOpeningSubtractLoops = geometryCacheHandle
        ? geometryCacheHandle.value(
            "floor-openings",
            [floorOpeningWorldLoops, floorOpeningLoops],
            () => subtractPolygonLoops2(floorOpeningWorldLoops, floorOpeningLoops),
            validGeometryLoops2,
          )
        : subtractPolygonLoops2(floorOpeningWorldLoops, floorOpeningLoops),
      ms6 = buildShapesWithHoles(floorOpeningSubtractLoops);
    ms6.length
      ? addGroundPlateMesh(
          [],
          new ns2.ExtrudeGeometry(ms6, {
            depth: groundPlaneGap,
            bevelEnabled: false,
            steps: 1,
          }),
          true,
        )
      : mg2.dispose();
    for (const openingDifferenceOuterLoop of floorOpeningSubtractLoops.filter(
      (openingDifferenceLoop: any) => polygonArea2(openingDifferenceLoop) > 0,
    )) {
      const openingDifferenceWorldLoop = openingDifferenceOuterLoop.map((differenceLoopPoint: any) => ({
        x: differenceLoopPoint.x,
        z: differenceLoopPoint.y,
      }));
      (buildGroundShadow(openingDifferenceWorldLoop, groundShadowPlaneY, floorOpeningLoops),
        appCtx.sceneRootNode.userData.floorEdgeIndoorLoops.push(openingDifferenceWorldLoop));
    }
  } else {
    if (mr2.length) {
      const modelWorldLoops = mr2.map((modelLoopGroup: any) => modelLoopGroup.map(planPointToWorld)),
        modelShapeList = modelWorldLoops.map((modelWorldLoop: any) => {
          const modelShape = new ns2.Shape();
          return (
            modelWorldLoop.forEach((modelShapePoint: any, modelShapePointIndex: any) => {
              modelShapePointIndex === 0
                ? modelShape.moveTo(modelShapePoint.x, modelShapePoint.z)
                : modelShape.lineTo(modelShapePoint.x, modelShapePoint.z);
            }),
            modelShape.closePath(),
            modelShape
          );
        });
      addGroundPlateMesh(
        modelWorldLoops[0],
        new ns2.ExtrudeGeometry(modelShapeList, {
          depth: groundPlaneGap,
          bevelEnabled: false,
          steps: 1,
        }),
        true,
      );
      for (const extraModelLoop of modelWorldLoops.slice(1)) addFloorIndoorLoop(extraModelLoop);
    } else {
      if (
        appCtx.studioState.items.some(
          (gardenOrCourtyardItem) =>
            isCourtyardDrawing2(gardenOrCourtyardItem) ||
            gardenOrCourtyardItem.type.startsWith("garden-"),
        )
      )
        mg2.dispose();
      else {
        const groundCornerPoints = [
          {
            x: -planWidth / 2,
            z: -planHeight / 2,
          },
          {
            x: planWidth / 2,
            z: -planHeight / 2,
          },
          {
            x: planWidth / 2,
            z: planHeight / 2,
          },
          {
            x: -planWidth / 2,
            z: planHeight / 2,
          },
        ];
        addGroundPlateMesh(
          groundCornerPoints,
          new ns2.BoxGeometry(planWidth, groundPlaneGap, planHeight),
          false,
        );
      }
    }
  }
  (buildCourtyardFoundation({
    ppm: buildStudioSceneScenePixelsPerMeter,
    toWorld: planPointToWorld,
  }),
    buildInteriorScene({
      ppm: buildStudioSceneScenePixelsPerMeter,
      toWorld: planPointToWorld,
      floorSurfaceY: groundPlaneY,
    }));
  const $u2 = collectLightSourceSpecs(),
    placedItemRecords: any[] = [];
  for (const placedItem of appCtx.studioState.items) {
    const placedItemWorldPoint = planPointToWorld(placedItem);
    if (placedItem.type === "flooropening") continue;
    const vu2 = buildItemModel(placedItem, $u2);
    (isEmbeddedStage &&
      !createSelectionRef("item", placedItem.id) &&
      compactStaticDeviceParts2(ns2, vu2, placedItem.type, buildStaticMaterialKey),
      isEmbeddedStage &&
        Object.assign(vu2.userData, {
          editorModelId: placedItem.id,
          editorFloorId: appCtx.activeFloorId,
        }),
      isEmbedStageMode &&
        ["smallcar", "suv", "scooter"].includes(placedItem.type) &&
        (vu2.userData.preserveDetailedSurface = true),
      isEmbeddedStage &&
        [
          "airer",
          "fan",
          "ceiling-fan",
          "storagewaterheater",
          "gaswaterheater",
          "airpurifier",
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "fridge",
          "freezer",
          "dishwasher",
          "washer",
          "dryer",
          "plant",
          "camera",
          "presence",
          "speaker",
          "tv",
          "robotvacuum",
          "smallcar",
          "suv",
          "scooter",
        ].includes(placedItem.type) &&
        ((vu2.userData.environmentModelId = placedItem.id),
        (vu2.userData.environmentModelType = ["smallcar", "suv", "scooter"].includes(
          placedItem.type,
        )
          ? "smallcar"
          : placedItem.type),
        (vu2.userData.environmentFloorId = appCtx.activeFloorId)),
      vu2.position.set(placedItemWorldPoint.x, placedItem.elevation || 0, placedItemWorldPoint.z),
      applyItemOrientation(vu2, placedItem),
      (vu2.userData.modelLayer = lampItemTypeSet.has(placedItem.type) ? "lights" : "items"),
      (vu2.userData.exportRole = placedItem.type === "planlabel" ? "label" : "plan"),
      appCtx.sceneRootNode.add(vu2),
      lampItemTypeSet.has(placedItem.type) ||
        placedItemRecords.push({
          item: placedItem,
          group: vu2,
        }));
  }
  (batchSharedMeshes(appCtx.sceneRootNode, placedItemRecords),
    isEmbedStageMode &&
      (new URLSearchParams(window.location.search).get("wall-trial") ?? defaultWallRuntimeProfile)
        .split(",")
        .includes("merge") &&
      mergeWallBands2(ns2, appCtx.sceneRootNode, mergeGeometries2),
    isEmbeddedStage &&
      new URLSearchParams(window.location.search).get("furniture-runtime") !== "baseline" &&
      compactRuntimeFurniture2(
        appCtx.sceneRootNode,
        placedItemRecords.filter(
          ({ item: locatedItemRef }) => !createSelectionRef("item", locatedItemRef.id),
        ),
        {
          THREE: ns2,
          mergeGeometries: mergeGeometries2,
          materialKey: buildStaticMaterialKey,
        },
      ),
    mergeStaticItemMeshes(appCtx.sceneRootNode, placedItemRecords),
    appCtx.sceneRootNode.traverse((sceneNodeForFlags: any) => {
      sceneNodeForFlags !== appCtx.sceneRootNode &&
        !sceneNodeForFlags.userData.exportRole &&
        (sceneNodeForFlags.userData.exportRole = "plan");
    }),
    setupSceneShadows(appCtx.sceneRootNode, {
      rebuildAtlas: !preserveLightCache,
    }),
    isEmbeddedStage && cacheObjectTransforms2(appCtx.sceneRootNode, ns2.Object3D),
    appCtx.sceneStyle === "warm-wood" &&
      appCtx.sceneRootNode.traverse((sceneNodeVisibility: any) => {
        (["background", "grid"].includes(sceneNodeVisibility.userData?.exportRole) ||
          sceneNodeVisibility.userData?.floorPlanGroundShadow === true ||
          sceneNodeVisibility.userData?.batchedWallContactShadowCount != null) &&
          ((sceneNodeVisibility.userData.backgroundThemeHidden = true),
          (sceneNodeVisibility.visible = false));
      }));
}
function getPreviewFloorMode() {
  return appCtx.studioProject?.previewFloorMode === "all" && appCtx.studioProject.floors.length > 1
    ? "all"
    : "active";
}
function updateFloorPreviewButtons() {
  const le2 = getPreviewFloorMode(),
    shouldEnableFloorPreview = (appCtx.studioProject?.floors.length || 0) > 1;
  for (const floorPreviewButton of previewFloorControls) {
    const isActiveFloorPreviewButton = floorPreviewButton.dataset.previewFloor === le2;
    (floorPreviewButton.classList.toggle("active", isActiveFloorPreviewButton),
      floorPreviewButton.setAttribute("aria-pressed", String(isActiveFloorPreviewButton)),
      (floorPreviewButton.disabled =
        floorPreviewButton.dataset.previewFloor === "all" && !shouldEnableFloorPreview));
  }
}
function setPreviewFloor(previewFloorId: any, { persist: shouldPersistPreview = true } = {}) {
  appCtx.studioProject &&
    ((appCtx.studioProject.previewFloorMode =
      previewFloorId === "all" && appCtx.studioProject.floors.length > 1 ? "all" : "active"),
    updateFloorPreviewButtons(),
    refreshFloorControls(),
    setCameraMode(getCameraMode(), {
      preserveView: false,
    }),
    Promise.allSettled(preloadDefaultModels()),
    rebuildFloorLayers(),
    updateCameraView(),
    shouldPersistPreview && markDocumentDirty());
}
function rebuildFloorLayers(floorRebuildOptions: Record<string, any> = {}) {
  if (appCtx.isSceneStillLoading) {
    assetLoaderState.revision++;
    return;
  }
  for (const _floorLayerEntry of buildFloorsAsync(floorRebuildOptions));
}
async function waitForSceneRevision() {
  const sceneAtStart = appCtx.studioProject,
    rootAtStart = appCtx.sceneRootNode,
    isSceneRevisionCurrent = () =>
      !assetLoaderState.disposed && sceneAtStart === appCtx.studioProject && rootAtStart === appCtx.sceneRootNode;
  for (; isSceneRevisionCurrent();) {
    const revision = assetLoaderState.revision,
      bg2 = buildFloorsAsync();
    try {
      let shouldWaitForScene = false;
      for (; isSceneRevisionCurrent() && revision === assetLoaderState.revision;) {
        if (bg2.next().done) {
          shouldWaitForScene = true;
          break;
        }
        await new Promise(requestAnimationFrame);
      }
      if (shouldWaitForScene)
        return (
          (appCtx.isSceneStillLoading = false),
          updateExternalModelDataset(),
          scheduleExternalPrecompile(),
          (appCtx.isSceneDirty = false),
          refreshPreviewSync(),
          true
        );
    } finally {
      bg2.return();
    }
  }
  return false;
}
async function waitForSceneReady(sceneWaitTimeout: any = null) {
  if (!isEmbedStageMode || !appCtx.regionLightController || !appCtx.threeRenderer) return;
  const sceneSnapshotRef = appCtx.sceneRootNode,
    floorsSnapshotRef = appCtx.threeRenderer,
    ue3 = appCtx.threeScene,
    cameraSnapshotRef = appCtx.threeCamera,
    Gt2 = appCtx.sceneRevisionCount,
    isSceneStable = () =>
      !assetLoaderState.disposed &&
      !appCtx.isDisposed &&
      !document.hidden &&
      appCtx.isHighDetailQuality &&
      appCtx.sceneRootNode === sceneSnapshotRef &&
      appCtx.threeRenderer === floorsSnapshotRef &&
      appCtx.threeScene === ue3 &&
      appCtx.threeCamera === cameraSnapshotRef &&
      appCtx.sceneRevisionCount === Gt2;
  (ue3.updateMatrixWorld(true),
    appCtx.regionLightController.sync(cameraSnapshotRef),
    sceneWaitTimeout?.preparePresentationMaterials?.(
      sceneSnapshotRef,
      Gt2 + ":" + appCtx.curtainFrameKey,
    ));
  try {
    await precompileShaderPrograms(floorsSnapshotRef, ue3, cameraSnapshotRef, isSceneStable, {
      visibleOnly: true,
      pollInterval: 16,
    });
  } catch { /* 着色器预编译是预热优化：失败时退回按需编译，不影响渲染正确性 */ }
}
function* buildFloorsAsync({
  preserveLightCache: preserveLightCacheSnapshot = false,
} = {}): Generator<any, void, unknown> {
  if (!appCtx.sceneRootNode) return;
  if ((stageLoadTiming("model-build"), getPreviewFloorMode() !== "all")) {
    (buildStudioScene({
      preserveLightCache: preserveLightCacheSnapshot,
    }),
      computeSceneExtent());
    return;
  }
  const rootForFloors = appCtx.sceneRootNode,
    viewModelForFloors = appCtx.studioState,
    oe5 = appCtx.activeFloorId,
    nn3 = appCtx.sceneModelOrigin;
  (refreshBaseLighting(),
    disposeFloorScene(),
    refreshSceneRender({
      shadows: true,
      scene: true,
      preserveLightCache: preserveLightCacheSnapshot,
    }));
  const sort6 = [...appCtx.studioProject.floors].sort(
      (firstFloor, secondFloor) => firstFloor.elevation - secondFloor.elevation,
    ),
    floorGap = appCtx.pendingRuntimeSettings
      ? finite2(appCtx.studioProject.exportFloorGap, 3)
      : finite2(appCtx.studioProject.previewFloorGap, 3);
  for (const [floorSortIndex, preserveLightCacheSnapshotFloorRecord] of sort6.entries()) {
    const floorGroupContainer = new ns2.Group();
    ((floorGroupContainer.name = "floor-" + preserveLightCacheSnapshotFloorRecord.id),
      (floorGroupContainer.userData.floorId = preserveLightCacheSnapshotFloorRecord.id));
    try {
      ((appCtx.sceneRootNode = floorGroupContainer),
        (appCtx.studioState = preserveLightCacheSnapshotFloorRecord.scene),
        (appCtx.activeFloorId = preserveLightCacheSnapshotFloorRecord.id),
        (appCtx.sceneModelOrigin = {
          x: finite2(preserveLightCacheSnapshotFloorRecord.originX, 0),
          y: finite2(preserveLightCacheSnapshotFloorRecord.originY, 0),
        }),
        buildStudioScene({
          preserveLightCache: preserveLightCacheSnapshot,
        }));
    } catch (floorBuildError: any) {
      throw (disposeObjectTree(floorGroupContainer), floorBuildError);
    } finally {
      ((appCtx.sceneRootNode = rootForFloors),
        (appCtx.studioState = viewModelForFloors),
        (appCtx.activeFloorId = oe5),
        (appCtx.sceneModelOrigin = nn3));
    }
    if (floorSortIndex > 0) {
      for (const preserveLightCacheSnapshotFloorChildObject of [...floorGroupContainer.children])
        if (
          ["background", "grid"].includes(
            preserveLightCacheSnapshotFloorChildObject.userData?.exportRole,
          )
        ) {
          if (isEmbeddedStage) {
            ((preserveLightCacheSnapshotFloorChildObject.userData.floorBackgroundHidden = true),
              (preserveLightCacheSnapshotFloorChildObject.visible = false));
            continue;
          }
          (floorGroupContainer.remove(preserveLightCacheSnapshotFloorChildObject),
            disposeObjectTree(preserveLightCacheSnapshotFloorChildObject));
        }
    }
    (floorGroupContainer.position.set(
      finite2(preserveLightCacheSnapshotFloorRecord.offsetX, 0),
      floorSortIndex * floorGap,
      finite2(preserveLightCacheSnapshotFloorRecord.offsetZ, 0),
    ),
      (floorGroupContainer.rotation.y = -ns2.MathUtils.degToRad(
        finite2(preserveLightCacheSnapshotFloorRecord.rotation, 0),
      )),
      rootForFloors.add(floorGroupContainer),
      floorSortIndex < sort6.length - 1 && (yield));
  }
  ((appCtx.sceneRootNode = rootForFloors),
    (appCtx.studioState = viewModelForFloors),
    (appCtx.activeFloorId = oe5),
    (appCtx.sceneModelOrigin = nn3),
    setupSceneShadows(appCtx.sceneRootNode, {
      rebuildAtlas: !preserveLightCacheSnapshot,
    }),
    computeSceneExtent(),
    refreshSceneRender({
      shadows: true,
      scene: true,
      preserveLightCache: preserveLightCacheSnapshot,
    }));
}
function syncFloorGroups(layerKeySet: any) {
  if (!layerKeySet.size || !appCtx.sceneRootNode) return;
  if (getPreviewFloorMode() !== "all") {
    layerKeySet.has(appCtx.activeFloorId) && rebuildFloorLayers();
    return;
  }
  const rootForFloorSync = appCtx.sceneRootNode,
    viewModelForFloorSync = appCtx.studioState,
    oe6 = appCtx.activeFloorId,
    nn4 = appCtx.sceneModelOrigin,
    sort7 = [...appCtx.studioProject.floors].sort(
      (firstSortFloor, secondSortFloor) => firstSortFloor.elevation - secondSortFloor.elevation,
    );
  if (
    sort7.some(
      (syncFloor) =>
        !rootForFloorSync.children.some(
          (existingFloorChild: any) => existingFloorChild.userData?.floorId === syncFloor.id,
        ),
    )
  ) {
    rebuildFloorLayers();
    return;
  }
  try {
    for (const [floorSyncIndex, syncFloorRecord] of sort7.entries())
      if (
        layerKeySet.has(syncFloorRecord.id) &&
        ((appCtx.sceneRootNode = rootForFloorSync.children.find(
          (matchingFloorChild: any) => matchingFloorChild.userData?.floorId === syncFloorRecord.id,
        )),
        (appCtx.studioState = syncFloorRecord.scene),
        (appCtx.activeFloorId = syncFloorRecord.id),
        (appCtx.sceneModelOrigin = {
          x: finite2(syncFloorRecord.originX, 0),
          y: finite2(syncFloorRecord.originY, 0),
        }),
        appCtx.sceneRootNode.position.set(
          finite2(syncFloorRecord.offsetX, 0),
          floorSyncIndex * appCtx.studioProject.previewFloorGap,
          finite2(syncFloorRecord.offsetZ, 0),
        ),
        appCtx.sceneRootNode.rotation.set(
          0,
          -ns2.MathUtils.degToRad(finite2(syncFloorRecord.rotation, 0)),
          0,
        ),
        appCtx.sceneRootNode.scale.set(1, 1, 1),
        buildStudioScene(),
        floorSyncIndex > 0)
      ) {
        for (const staleFloorChild of [...appCtx.sceneRootNode.children])
          if (["background", "grid"].includes(staleFloorChild.userData?.exportRole)) {
            if (isEmbeddedStage) {
              ((staleFloorChild.userData.floorBackgroundHidden = true),
                (staleFloorChild.visible = false));
              continue;
            }
            (appCtx.sceneRootNode.remove(staleFloorChild), disposeObjectTree(staleFloorChild));
          }
      }
  } finally {
    ((appCtx.sceneRootNode = rootForFloorSync),
      (appCtx.studioState = viewModelForFloorSync),
      (appCtx.activeFloorId = oe6),
      (appCtx.sceneModelOrigin = nn4));
  }
  (setupSceneShadows(rootForFloorSync), computeSceneExtent());
}
function createFloorWorldMapper() {
  const floorMapperPpm = getPixelsPerMeter();
  if (!floorMapperPpm) return null;
  const nn5 = appCtx.sceneModelOrigin || sceneModelOrigin2(appCtx.studioState, getActiveFloor()),
    floorMapperOriginX = nn5.x,
    floorMapperOriginY = nn5.y;
  return {
    ppm: floorMapperPpm,
    floorSurfaceY: -0.008,
    floorPolygons: closedWallLoops(floorMapperPpm),
    toWorld: (mapperPoint: any) => ({
      x: (mapperPoint.x - floorMapperOriginX) / floorMapperPpm,
      z: (mapperPoint.y - floorMapperOriginY) / floorMapperPpm,
    }),
  };
}
const previewTransformCache = createPreviewTransformCache();
function previewTransformContext() {
  const previewTransformOrigin = appCtx.sceneModelOrigin || sceneModelOrigin2(appCtx.studioState, getActiveFloor());
  return {
    items: appCtx.studioState.items,
    contextKey: JSON.stringify([
      appCtx.activeFloorId,
      getPreviewFloorMode(),
      previewTransformOrigin,
      backgroundSettings(),
      appCtx.baseLightingSettings,
      appCtx.studioState.settings,
      appCtx.studioState.background,
      appCtx.studioState.walls,
      appCtx.studioState.windows,
      appCtx.studioState.doors,
      appCtx.studioState.railings,
    ]),
    isEligible: (previewCandidate: any) =>
      !lampItemTypeSet.has(previewCandidate.type) &&
      previewCandidate.type !== "flooropening" &&
      !isCourtyardPlanItem2(previewCandidate),
    isSelected: (previewCandidate: any) => createSelectionRef("item", previewCandidate.id),
  };
}
function capturePreviewTransforms(layerItemRecords: any) {
  isEmbeddedStage ||
    isEmbedStageMode ||
    !appCtx.sceneRootNode ||
    previewTransformCache.capture(appCtx.sceneRootNode, {
      ...previewTransformContext(),
      groups: layerItemRecords,
    });
}
function applyPreviewTransforms(
  worldMapper: any,
  { preserveLightCache: shouldPreservePreviewLightCache, shadowRoot: previewShadowRoot }: any,
) {
  if (isEmbeddedStage || isEmbedStageMode || !appCtx.sceneRootNode) return false;
  const movedTransforms = previewTransformCache.plan(appCtx.sceneRootNode, previewTransformContext());
  if (!movedTransforms) return false;
  for (const { item: movedItem, group: movedGroup } of movedTransforms) {
    const world = worldMapper.toWorld(movedItem);
    (movedGroup.position.set(world.x, movedItem.elevation || 0, world.z),
      applyItemOrientation(movedGroup, movedItem));
  }
  return (
    previewTransformCache.commit(appCtx.sceneRootNode, movedTransforms),
    movedTransforms.length &&
      (setupSceneShadows(previewShadowRoot, {
        rebuildAtlas: !shouldPreservePreviewLightCache,
      }),
      refreshSceneRender({
        shadows: !shouldPreservePreviewLightCache,
        preserveLightCache: shouldPreservePreviewLightCache,
      })),
    true
  );
}
function buildSceneLayers(layerKeyList: any) {
  if (appCtx.sceneRootNode) {
    for (const layerChildObject of [...appCtx.sceneRootNode.children])
      layerChildObject.userData.modelLayer === layerKeyList &&
        (appCtx.sceneRootNode.remove(layerChildObject), disposeObjectTree(layerChildObject));
  }
}
function buildLayerGroup(
  layerKey: any,
  {
    preserveLightCache: preserveLayerLightCache = false,
    shadowRoot: layerShadowRoot = appCtx.sceneRootNode,
    allowTransforms: allowLayerTransforms = false,
  } = {},
) {
  if (!appCtx.sceneRootNode) return;
  const mg3 = createFloorWorldMapper();
  if (!mg3) return;
  if (layerKey === "items" && allowLayerTransforms && applyPreviewTransforms(mg3, {
    preserveLightCache: preserveLayerLightCache,
    shadowRoot: layerShadowRoot,
  }))
    return;
  buildSceneLayers(layerKey);
  const isLightsLayer = layerKey === "lights",
    $u3 = isLightsLayer ? collectLightSourceSpecs() : null,
    layerItemRecords: any[] = [];
  for (const layerItem of appCtx.studioState.items) {
    if (lampItemTypeSet.has(layerItem.type) !== isLightsLayer) continue;
    const world = mg3.toWorld(layerItem);
    if (layerItem.type === "flooropening") continue;
    const vu3 = buildItemModel(layerItem, $u3);
    (isEmbeddedStage &&
      !createSelectionRef("item", layerItem.id) &&
      compactStaticDeviceParts2(ns2, vu3, layerItem.type, buildStaticMaterialKey),
      isEmbeddedStage &&
        Object.assign(vu3.userData, {
          editorModelId: layerItem.id,
          editorFloorId: appCtx.activeFloorId,
        }),
      isEmbedStageMode &&
        ["smallcar", "suv", "scooter"].includes(layerItem.type) &&
        (vu3.userData.preserveDetailedSurface = true),
      isEmbeddedStage &&
        [
          "airer",
          "fan",
          "ceiling-fan",
          "storagewaterheater",
          "gaswaterheater",
          "airpurifier",
          "wallac",
          "floorac",
          "airoutlet",
          "curtain",
          "nas",
          "fridge",
          "freezer",
          "dishwasher",
          "washer",
          "dryer",
          "plant",
          "camera",
          "presence",
          "speaker",
          "tv",
          "robotvacuum",
          "smallcar",
          "suv",
          "scooter",
        ].includes(layerItem.type) &&
        ((vu3.userData.environmentModelId = layerItem.id),
        (vu3.userData.environmentModelType = ["smallcar", "suv", "scooter"].includes(layerItem.type)
          ? "smallcar"
          : layerItem.type),
        (vu3.userData.environmentFloorId = appCtx.activeFloorId)),
      vu3.position.set(world.x, layerItem.elevation || 0, world.z),
      applyItemOrientation(vu3, layerItem),
      (vu3.userData.modelLayer = layerKey),
      appCtx.sceneRootNode.add(vu3),
      isLightsLayer ||
        layerItemRecords.push({
          item: layerItem,
          group: vu3,
        }));
  }
  (isLightsLayer ||
    (batchSharedMeshes(appCtx.sceneRootNode, layerItemRecords),
    isEmbeddedStage &&
      new URLSearchParams(window.location.search).get("furniture-runtime") !== "baseline" &&
      compactRuntimeFurniture2(
        appCtx.sceneRootNode,
        layerItemRecords.filter(
          ({ item: layerItemRef }) => !createSelectionRef("item", layerItemRef.id),
        ),
        {
          THREE: ns2,
          mergeGeometries: mergeGeometries2,
          materialKey: buildStaticMaterialKey,
        },
      ),
    mergeStaticItemMeshes(appCtx.sceneRootNode, layerItemRecords),
    buildCourtyardFoundation(mg3)),
    setupSceneShadows(layerShadowRoot, {
      rebuildAtlas: !preserveLayerLightCache,
    }),
    isEmbeddedStage && cacheObjectTransforms2(appCtx.sceneRootNode, ns2.Object3D),
    isLightsLayer && requestStudioRender(),
    refreshSceneRender({
      shadows: !isLightsLayer && !preserveLayerLightCache,
      preserveLightCache: preserveLayerLightCache,
    }),
    isLightsLayer || capturePreviewTransforms(layerItemRecords));
}
function buildArchitectureLayer({
  preserveLightCache: preserveArchitectureLightCache = false,
  shadowRoot: architectureShadowRoot = appCtx.sceneRootNode,
} = {}) {
  const mg4 = createFloorWorldMapper();
  !appCtx.sceneRootNode ||
    !mg4 ||
    (buildSceneLayers("architecture"),
    buildInteriorScene(mg4),
    preserveArchitectureLightCache || appCtx.contactShadowController?.invalidate(),
    setupSceneShadows(architectureShadowRoot, {
      rebuildAtlas: !preserveArchitectureLightCache,
    }),
    refreshSceneRender({
      shadows: !preserveArchitectureLightCache,
      scene: true,
      preserveLightCache: preserveArchitectureLightCache,
    }));
}
function buildItemsLayer(itemsLayerOptions: Record<string, any> = {}) {
  buildLayerGroup("items", itemsLayerOptions);
}
function buildLightsLayer(lightsLayerOptions: Record<string, any> = {}) {
  buildLayerGroup("lights", lightsLayerOptions);
}
function buildFloorAtIndex(requestedLayerSet: any, sceneLayerOptions: any) {
  const floorBuildRoot = appCtx.sceneRootNode,
    nn6 = appCtx.sceneModelOrigin;
  if (getPreviewFloorMode() === "all") {
    const floorRecordAtId = appCtx.studioProject.floors.find(
        (candidateFloor: any) => candidateFloor.id === appCtx.activeFloorId,
      ),
      floorGroupAtId = floorBuildRoot?.children.find(
        (floorGroupChild: any) => floorGroupChild.userData?.floorId === appCtx.activeFloorId,
      );
    if (!floorRecordAtId || !floorGroupAtId) {
      rebuildFloorLayers(sceneLayerOptions);
      return;
    }
    ((appCtx.sceneRootNode = floorGroupAtId),
      (appCtx.sceneModelOrigin = {
        x: finite2(floorRecordAtId.originX, 0),
        y: finite2(floorRecordAtId.originY, 0),
      }));
  }
  try {
    const floorBuildOptions = {
      ...sceneLayerOptions,
      shadowRoot: floorBuildRoot,
    };
    (requestedLayerSet.has("architecture") && buildArchitectureLayer(floorBuildOptions),
      requestedLayerSet.has("items") && buildItemsLayer(floorBuildOptions),
      requestedLayerSet.has("lights") && buildLightsLayer(floorBuildOptions));
  } finally {
    ((appCtx.sceneRootNode = floorBuildRoot), (appCtx.sceneModelOrigin = nn6));
  }
}
function buildLayerForFloor(floorLayerKey: any, layerFloorOptions: Record<string, any> = {}) {
  const layerFloorRoot = appCtx.sceneRootNode,
    viewModelForLayer = appCtx.studioState,
    oe7 = appCtx.activeFloorId,
    nn7 = appCtx.sceneModelOrigin,
    sort8 = [...(appCtx.studioProject?.floors || [])].sort(
      (firstLayerFloor, secondLayerFloor) => firstLayerFloor.elevation - secondLayerFloor.elevation,
    );
  if (!layerFloorRoot || !sort8.length) return false;
  try {
    for (const layerFloorRecord of sort8) {
      const layerFloorGroup = layerFloorRoot.children.find(
        (layerFloorChild: any) => layerFloorChild.userData?.floorId === layerFloorRecord.id,
      );
      if (!layerFloorGroup) return false;
      ((appCtx.sceneRootNode = layerFloorGroup),
        (appCtx.studioState = layerFloorRecord.scene),
        (appCtx.activeFloorId = layerFloorRecord.id),
        (appCtx.sceneModelOrigin = {
          x: finite2(layerFloorRecord.originX, 0),
          y: finite2(layerFloorRecord.originY, 0),
        }),
        buildLayerGroup(floorLayerKey, {
          ...layerFloorOptions,
          shadowRoot: layerFloorRoot,
        }));
    }
  } finally {
    ((appCtx.sceneRootNode = layerFloorRoot),
      (appCtx.studioState = viewModelForLayer),
      (appCtx.activeFloorId = oe7),
      (appCtx.sceneModelOrigin = nn7));
  }
  return (computeSceneExtent(), true);
}
function isDescendantOfRoot(ancestorStartNode: any, ancestorStopSet: any) {
  for (
    let isDescendantOfRootAncestorNode = ancestorStartNode;
    isDescendantOfRootAncestorNode && isDescendantOfRootAncestorNode !== appCtx.sceneRootNode;
    isDescendantOfRootAncestorNode = isDescendantOfRootAncestorNode.parent
  )
    if (ancestorStopSet.has(isDescendantOfRootAncestorNode.userData?.modelLayer)) return true;
  return false;
}
function computeSceneBounds({ excludeModelLayers: excludeModelLayers = null }: any = {}) {
  const sceneBoundsBox = new ns2.Box3();
  return (
    appCtx.sceneRootNode.updateWorldMatrix(true, true),
    appCtx.sceneRootNode.traverse((boundsMeshNode: any) => {
      if (
        !(
          !boundsMeshNode.isMesh ||
          ["background", "grid", "light-source-preview"].includes(
            boundsMeshNode.userData?.exportRole,
          )
        ) &&
        !(excludeModelLayers && isDescendantOfRoot(boundsMeshNode, excludeModelLayers))
      ) {
        if (boundsMeshNode.isInstancedMesh) {
          (boundsMeshNode.computeBoundingBox(),
            boundsMeshNode.boundingBox &&
              sceneBoundsBox.union(
                boundsMeshNode.boundingBox.clone().applyMatrix4(boundsMeshNode.matrixWorld),
              ));
          return;
        }
        (boundsMeshNode.geometry.computeBoundingBox(),
          boundsMeshNode.geometry.boundingBox &&
            sceneBoundsBox.union(
              boundsMeshNode.geometry.boundingBox.clone().applyMatrix4(boundsMeshNode.matrixWorld),
            ));
      }
    }),
    sceneBoundsBox
  );
}
function computeSceneExtent() {
  if (!appCtx.isGroundShadowEnabled || !appCtx.mainDirectionalLight?.shadow?.camera || !appCtx.sceneRootNode)
    return false;
  const qu4 = computeSceneBounds();
  if (qu4.isEmpty()) return false;
  (appCtx.sceneRootNode.updateWorldMatrix(true, true),
    appCtx.mainDirectionalLight.updateWorldMatrix(true, false),
    appCtx.mainDirectionalLight.target.updateWorldMatrix(true, false));
  const camera3 = appCtx.mainDirectionalLight.shadow.camera,
    setFromMatrixPosition = new ns2.Vector3().setFromMatrixPosition(
      appCtx.mainDirectionalLight.matrixWorld,
    ),
    setFromMatrixPosition2 = new ns2.Vector3().setFromMatrixPosition(
      appCtx.mainDirectionalLight.target.matrixWorld,
    );
  (camera3.position.copy(setFromMatrixPosition),
    camera3.lookAt(setFromMatrixPosition2),
    camera3.updateMatrixWorld(true));
  const sceneMinPoint = new ns2.Vector3(Infinity, Infinity, Infinity),
    sceneMaxPoint = new ns2.Vector3(-Infinity, -Infinity, -Infinity);
  for (const sceneBoundsX of [qu4.min.x, qu4.max.x])
    for (const sceneBoundsY of [qu4.min.y, qu4.max.y])
      for (const sceneBoundsZ of [qu4.min.z, qu4.max.z]) {
        const matrix4 = new ns2.Vector3(sceneBoundsX, sceneBoundsY, sceneBoundsZ).applyMatrix4(
          camera3.matrixWorldInverse,
        );
        (sceneMinPoint.min(matrix4), sceneMaxPoint.max(matrix4));
      }
  const sceneSpan = Math.max(
      sceneMaxPoint.x - sceneMinPoint.x,
      sceneMaxPoint.y - sceneMinPoint.y,
      1,
    ),
    groundExtent = Math.max(minPointDistance, sceneSpan * 0.05),
    sceneMinDepth = -sceneMaxPoint.z,
    sceneMaxDepth = -sceneMinPoint.z,
    shadowExtent = Math.max(minPointDistance, (sceneMaxDepth - sceneMinDepth) * 0.08);
  return (
    (camera3.left = sceneMinPoint.x - groundExtent),
    (camera3.right = sceneMaxPoint.x + groundExtent),
    (camera3.bottom = sceneMinPoint.y - groundExtent),
    (camera3.top = sceneMaxPoint.y + groundExtent),
    (camera3.near = Math.max(0.1, sceneMinDepth - shadowExtent)),
    (camera3.far = Math.max(camera3.near + 1, sceneMaxDepth + shadowExtent)),
    camera3.updateProjectionMatrix(),
    (appCtx.mainDirectionalLight.shadow.needsUpdate = true),
    true
  );
}
function updateCameraView(cameraViewOptions: UpdateCameraViewOptions = {}) {
  if (!appCtx.threeCamera || !appCtx.orbitControls) return;
  const viewMode =
      cameraViewOptions.view === "top"
        ? "top"
        : cameraViewOptions.view === "free"
          ? "free"
          : getCameraView(),
    qn3 = getCameraTopRotation(),
    isShowingAllFloors = getPreviewFloorMode() === "all",
    cameraViewPpm = getPixelsPerMeter() || 100,
    qu5 = getSceneContentBounds(),
    ug2 = computeCourtyardBounds(),
    qu6 =
      ug2 ||
      computeSceneBounds({
        excludeModelLayers: new Set(["items", "lights"]),
      }),
    size2 = (isShowingAllFloors || ug2) && !qu6.isEmpty() ? qu6.getSize(new ns2.Vector3()) : null,
    sceneCenterVector = qu6.isEmpty() ? null : qu6.getCenter(new ns2.Vector3()),
    cameraTargetRadius = size2
      ? clamp2(Math.max(size2.x, size2.z), 5, 100)
      : clamp2(Math.max(qu5.width, qu5.height) / cameraViewPpm, 5, 35),
    sceneHeight = size2
      ? size2.y
      : Math.max(0, ...appCtx.studioState.walls.map((viewWall) => viewWall.height || 0)),
    cameraViewOptionsCameraDistance = Math.max(
      cameraTargetRadius * 1.18,
      cameraTargetRadius + sceneHeight * 0.32,
    );
  ((appCtx.threeCamera.userData.frameSize = cameraViewOptionsCameraDistance),
    (appCtx.threeCamera.userData.cameraView = viewMode),
    (appCtx.threeCamera.userData.topRotation = qn3));
  const cameraTarget = sceneCenterVector
    ? new ns2.Vector3(sceneCenterVector.x, sceneCenterVector.y, sceneCenterVector.z)
    : new ns2.Vector3(0, Math.min(0.78, cameraTargetRadius * 0.055), 0);
  let cameraDistanceResult;
  if (appCtx.threeCamera.isPerspectiveCamera) {
    ((appCtx.threeCamera.aspect = appCtx.threeCamera.userData.viewportAspect || 1), applyCameraFocalLength());
    const cameraFovDistance =
      cameraViewOptionsCameraDistance /
      (2 * Math.tan(ns2.MathUtils.degToRad(appCtx.threeCamera.getEffectiveFOV()) / 2));
    cameraDistanceResult = Math.max(cameraFovDistance * 1.04, cameraTargetRadius * 1.65, 8);
  } else
    (applyOrthoFrame(cameraViewOptionsCameraDistance, appCtx.threeCamera.userData.viewportAspect || 1),
      (cameraDistanceResult = Math.max(cameraTargetRadius * 3.2, 18)));
  if (viewMode === "top")
    (appCtx.threeCamera.up.copy(buildCameraUpVector(qn3)),
      appCtx.threeCamera.position.set(
        cameraTarget.x,
        cameraTarget.y + cameraDistanceResult,
        cameraTarget.z,
      ));
  else {
    appCtx.threeCamera.up.set(0, 1, 0);
    const normalize2 = new ns2.Vector3(1.08, 1.7, 1.12).normalize();
    appCtx.threeCamera.position.copy(cameraTarget).addScaledVector(normalize2, cameraDistanceResult);
  }
  (updateCameraPlanes(appCtx.threeCamera, cameraTarget),
    (appCtx.threeCamera.zoom = 1),
    appCtx.threeCamera.lookAt(cameraTarget),
    appCtx.threeCamera.updateProjectionMatrix(),
    appCtx.orbitControls.target.copy(cameraTarget),
    requestStudioRender(),
    appCtx.orbitControls.update());
}
function axisLockedDistance(dragStartPoint: any, dragEndPoint: any, isShiftPressed = false) {
  const measurePpm = getPixelsPerMeter() || 100;
  if (!isSnapEnabled()) {
    if (isShiftPressed && dragEndPoint) {
      const axisLockedPoint = axisLockedPoint2(dragStartPoint, dragEndPoint);
      return {
        ...axisLockedPoint,
        kind: "axis",
        distance: distance2(dragStartPoint, axisLockedPoint.point),
      };
    }
    return {
      point: {
        ...dragStartPoint,
      },
      kind: null as any,
      label: "",
      distance: 0,
    };
  }
  const settings = appCtx.studioState.settings;
  return snapPoint2(dragStartPoint, appCtx.studioState.walls, {
    zoom: appCtx.planView.zoom,
    screenTolerance: clamp2(Math.round(finite2(settings.snapTolerance, 13)), 6, 24),
    anchor: dragEndPoint,
    forceOrthogonalAxis: isShiftPressed,
    preferVerticalAxis: settings.snapOrthogonal !== false,
    angleStepDegrees: 15,
    gridSize: measurePpm * 0.1,
    intersections: settings.snapIntersections === false ? [] : computeWallIntersections(measurePpm),
    snapEndpoints: settings.snapEndpoints !== false,
    snapIntersections: settings.snapIntersections !== false,
    snapSegments: settings.snapSegments !== false,
    snapOrthogonal: settings.snapOrthogonal !== false,
    snapAngles: settings.snapAngles !== false,
    snapGrid: settings.snapGrid !== false,
  });
}
function formatMeasurement(measurementRecord = appCtx.snapHit) {
  if (!appCtx.snapEndpointPoint || appCtx.wallSegmentCount < 2 || !measurementRecord?.point) return false;
  const measurementTolerance = Math.max(1, (getPixelsPerMeter() || 100) * 0.01);
  return (
    measurementRecord.kind === "endpoint" &&
    distance2(measurementRecord.point, appCtx.snapEndpointPoint) <= measurementTolerance
  );
}
function updateSnapIndicator(snapWallTarget = appCtx.isForceSnapDisabled) {
  if (!appCtx.activeSnapTarget) return;
  appCtx.hoverPoint = {
    ...appCtx.activeSnapTarget,
  };
  const snapPpm = getPixelsPerMeter() || 100,
    snapStatusLabel = appCtx.isSnapTemporarilyOff ? "吸附：临时关闭" : "吸附：关闭";
  if (appCtx.activeToolName === "scale" && appCtx.previewEndPoint && snapWallTarget) {
    const snapGuidePoint = axisLockedPoint2(appCtx.activeSnapTarget, appCtx.previewEndPoint);
    ((appCtx.hoverPoint = snapGuidePoint.point),
      (appCtx.snapHit = null),
      (snapIndicatorElement.textContent = "吸附：" + snapGuidePoint.label));
  } else
    appCtx.activeToolName === "scale" &&
      ((appCtx.snapHit = null), (snapIndicatorElement.textContent = "吸附：自由"));
  if (
    ((cursorPositionElement.textContent =
      "X " +
      (appCtx.hoverPoint.x / snapPpm).toFixed(2) +
      " m · Y " +
      (appCtx.hoverPoint.y / snapPpm).toFixed(2) +
      " m"),
    appCtx.activeToolName === "wall")
  )
    ((appCtx.snapHit = axisLockedDistance(appCtx.activeSnapTarget, appCtx.segmentStartPoint, snapWallTarget)),
      (snapIndicatorElement.textContent = formatMeasurement(appCtx.snapHit)
        ? "闭合：点击闭合空间"
        : appCtx.snapHit.kind
          ? (!isSnapEnabled() && snapWallTarget ? "锁定" : "吸附") + "：" + appCtx.snapHit.label
          : isSnapEnabled()
            ? "吸附：自由"
            : snapStatusLabel));
  else {
    if (appCtx.activeToolName === "courtyard-gate")
      ((gardenGateSnapCandidate = {
        ...(itemTypeCatalog as any)[gardenGateItemType],
        type: gardenGateItemType,
        ...appCtx.hoverPoint,
        rotation: 0,
      }),
        anchorGate2(gardenGateSnapCandidate, appCtx.studioState.items, snapPpm, 24 / appCtx.planView.zoom) ||
          (gardenGateSnapCandidate = null),
        (snapIndicatorElement.textContent = gardenGateSnapCandidate
          ? "吸附：围挡门洞"
          : "吸附：请靠近足够宽的围挡"));
    else {
      if (["window", "door", "railing"].includes(appCtx.activeToolName)) {
        const nearestSnapWall = nearestWall2(appCtx.hoverPoint, appCtx.studioState.walls, 16 / appCtx.planView.zoom);
        if (nearestSnapWall) {
          const solid2 = doorTypeCatalog[activeDoorType] || doorTypeCatalog.solid,
            snapProbeOptions = {
              width:
                appCtx.activeToolName === "door" ? solid2.width : appCtx.activeToolName === "railing" ? 2 : 1.4,
              t: nearestSnapWall.t,
            },
            snapResolvedProbe = {
              wall: nearestSnapWall.wall,
              t: clampWindowT2(nearestSnapWall.wall, snapProbeOptions, snapPpm),
            };
          ((appCtx.windowPlacement = appCtx.activeToolName === "window" ? snapResolvedProbe : null),
            (appCtx.doorPlacement = appCtx.activeToolName === "door" ? snapResolvedProbe : null),
            (appCtx.railingPlacement = appCtx.activeToolName === "railing" ? snapResolvedProbe : null),
            (snapIndicatorElement.textContent =
              appCtx.activeToolName === "door"
                ? "吸附：墙体门洞"
                : appCtx.activeToolName === "railing"
                  ? "吸附：墙体栏杆"
                  : "吸附：墙体"));
        } else
          ((appCtx.windowPlacement = null),
            (appCtx.doorPlacement = null),
            (appCtx.railingPlacement = null),
            (snapIndicatorElement.textContent = "吸附：未找到墙体"));
      } else if (appCtx.activeToolName === "pan") {

        ((appCtx.snapHit = null),
          (appCtx.windowPlacement = null),
          (appCtx.doorPlacement = null),
          (appCtx.railingPlacement = null),
          (snapIndicatorElement.textContent = isSnapEnabled() ? "吸附：开启" : snapStatusLabel),
          (planCanvasElement.style.cursor = ""));
      } else {
        if (appCtx.activeToolName !== "scale") {
          ((appCtx.snapHit = null),
            (appCtx.windowPlacement = null),
            (appCtx.doorPlacement = null),
            (appCtx.railingPlacement = null),
            (snapIndicatorElement.textContent = isSnapEnabled() ? "吸附：开启" : snapStatusLabel));
          const df2 = hitTestHandle(appCtx.hoverPoint);
          planCanvasElement.style.cursor =
            df2?.type === "rotate-item" ? "grab" : df2?.type === "resize-item" ? "nwse-resize" : "";
        }
      }
    }
  }
}
function toggleSnapSetting(snapToggleEvent: any) {
  ((appCtx.isForceSnapDisabled = snapToggleEvent.shiftKey),
    (appCtx.activeSnapTarget = screenToPlan(eventToLocalPoint(snapToggleEvent))),
    updateSnapIndicator());
}
function handlePointerDown(handlePointerDownPointerDownEvent: any) {
  if (
    handlePointerDownPointerDownEvent.button !== 0 &&
    handlePointerDownPointerDownEvent.button !== 1
  )
    return;
  planCanvasElement.focus({
    preventScroll: true,
  });
  const pointerDownPoint = eventToLocalPoint(handlePointerDownPointerDownEvent),
    pr3 = screenToPlan(pointerDownPoint);
  if (
    handlePointerDownPointerDownEvent.button === 1 ||
    appCtx.isMiddleButtonPanning ||
    appCtx.activeToolName === "pan"
  ) {
    (handlePointerDownPointerDownEvent.preventDefault(),
      resetPlanInteraction(),
      (appCtx.marqueeBox = {
        type: "pan",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        screen: screenToPlanPoint(pointerDownPoint),
        visibleScreen: pointerDownPoint,
        offsetX: appCtx.planView.offsetX,
        offsetY: appCtx.planView.offsetY,
      }),
      planCanvasElement.classList.add("panning"),
      updateMarqueeOverlay(),
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId));
    return;
  }
  if (appCtx.alignmentState && isSameAlignmentFloor(pr3)) return;
  if (appCtx.activeToolName === "flooropening") {
    if (!ensureCalibrationReady()) return;
    (handlePointerDownPointerDownEvent.preventDefault(),
      resetPlanInteraction(),
      (appCtx.marqueeBox = {
        type: "draw-flooropening",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        start: pr3,
        current: pr3,
      }),
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId));
    return;
  }
  if (appCtx.activeToolName === "scale") {
    if (!appCtx.previewEndPoint) {
      ((appCtx.previewEndPoint = pr3), refreshStudioView());
      return;
    }
    const point = handlePointerDownPointerDownEvent.shiftKey
      ? axisLockedPoint2(pr3, appCtx.previewEndPoint).point
      : pr3;
    if (distance2(appCtx.previewEndPoint, point) < 12 / appCtx.planView.zoom) {
      showToast("参考线太短，请重新选择终点。", "error");
      return;
    }
    ((appCtx.measureSpan = {
      start: appCtx.previewEndPoint,
      end: point,
    }),
      (appCtx.previewEndPoint = null),
      (referencePixelsElement.textContent =
        Math.round(distance2(appCtx.measureSpan.start, appCtx.measureSpan.end)) + " px"),
      (referenceMetersInput.value = appCtx.studioState.calibration?.reference?.meters || 3),
      scaleDialogElement.showModal(),
      requestAnimationFrame(() => referenceMetersInput.select()),
      refreshStudioView());
    return;
  }
  if (appCtx.activeToolName === "wall") {
    if (!ensureCalibrationReady()) return;
    const ju2 = axisLockedDistance(
      pr3,
      appCtx.segmentStartPoint,
      handlePointerDownPointerDownEvent.shiftKey,
    );
    if (!appCtx.segmentStartPoint) {
      ((appCtx.segmentStartPoint = {
        ...ju2.point,
      }),
        (appCtx.snapEndpointPoint = {
          ...ju2.point,
        }),
        (appCtx.wallSegmentCount = 0),
        (finishWallButton.hidden = false),
        refreshStudioView());
      return;
    }
    if (distance2(appCtx.segmentStartPoint, ju2.point) < getPixelsPerMeter() * 0.08) {
      showToast("墙段太短，请选择更远的终点。", "error");
      return;
    }
    const wallDraft = {
        id: generateId("wall"),
        start: {
          ...appCtx.segmentStartPoint,
        },
        end: {
          ...ju2.point,
        },
        height: appCtx.studioState.settings.wallHeight,
        thickness: appCtx.studioState.settings.wallThickness,
      },
      minWallLength = Math.max(0.75, getPixelsPerMeter() * 0.01),
      uncoveredWallSegments = uncoveredCollinearWallSegments2(
        wallDraft,
        appCtx.studioState.walls,
        minWallLength,
      );
    if (!uncoveredWallSegments.length) {
      ((appCtx.segmentStartPoint = {
        ...ju2.point,
      }),
        showToast("该位置已有墙体，已跳过重复墙段。"),
        refreshStudioView());
      return;
    }
    const isWallSplitAmbiguous =
      uncoveredWallSegments.length !== 1 ||
      distance2(uncoveredWallSegments[0].start, wallDraft.start) > minWallLength ||
      distance2(uncoveredWallSegments[0].end, wallDraft.end) > minWallLength;
    deselectAll();
    const wallMergeTolerance = Math.max(1, getPixelsPerMeter() * 0.01),
      closedWallCount = closedWallPolygons2(appCtx.studioState.walls, wallMergeTolerance).length,
      splitWallSegments = uncoveredWallSegments.map((wallSegmentPiece, wallSegmentIndex) => ({
        ...wallDraft,
        id: wallSegmentIndex === 0 ? wallDraft.id : generateId("wall"),
        start: wallSegmentPiece.start,
        end: wallSegmentPiece.end,
      }));
    (appCtx.studioState.walls.push(...splitWallSegments), markWallsChanged(), (appCtx.wallSegmentCount += 1));
    const hasWallPolygonGrown =
      closedWallPolygons2(appCtx.studioState.walls, wallMergeTolerance).length > closedWallCount;
    (hasWallPolygonGrown
      ? refreshPreviewScene()
      : (appCtx.segmentStartPoint = {
          ...ju2.point,
        }),
      selectSceneObject("wall", splitWallSegments[0].id),
      (finishWallButton.hidden = hasWallPolygonGrown),
      refreshScopeItems(),
      markDocumentDirty(),
      hasWallPolygonGrown
        ? showToast("空间已闭合，地面已生成。可继续绘制下一个空间。", "success")
        : isWallSplitAmbiguous && showToast("已跳过与现有墙体重合的部分。", "success"));
    return;
  }
  if (appCtx.activeToolName === "courtyard-gate") {
    if (!ensureCalibrationReady()) return;
    const placedElementRecord = {
      ...(itemTypeCatalog as any)[gardenGateItemType],
      type: gardenGateItemType,
      ...pr3,
    };
    if (
      !anchorGate2(placedElementRecord, appCtx.studioState.items, getPixelsPerMeter(), 24 / appCtx.planView.zoom)
    ) {
      showToast("请靠近一段足够宽的围挡放置庭院门。", "error");
      return;
    }
    createSceneItem(gardenGateItemType, placedElementRecord);
    return;
  }
  if (appCtx.activeToolName === "window") {
    if (!ensureCalibrationReady()) return;
    const nearestWindowWall = nearestWall2(pr3, appCtx.studioState.walls, 18 / appCtx.planView.zoom);
    if (!nearestWindowWall) {
      showToast("请靠近一段墙体放置窗户。", "error");
      return;
    }
    const ft5 = captureUndoSnapshot(),
      newWindowRecord = {
        id: generateId("window"),
        wallId: nearestWindowWall.wall.id,
        t: nearestWindowWall.t,
        width: 1.4,
        height: 1.35,
        sill: 0.85,
      };
    if (
      ((newWindowRecord.t = clampWindowT2(
        nearestWindowWall.wall,
        newWindowRecord,
        getPixelsPerMeter(),
      )),
      appCtx.studioState.windows.push(newWindowRecord),
      !validateSelectionChange(ft5))
    )
      return;
    applyPlacementChange(ft5);
    const ao2 = getPreviewScopeSelection();
    (selectSceneObject("window", newWindowRecord.id),
      refreshScopeItems("architecture"),
      setPreviewScope(ao2),
      markDocumentDirty());
    return;
  }
  if (appCtx.activeToolName === "door") {
    if (!ensureCalibrationReady()) return;
    const nearestDoorWall = nearestWall2(pr3, appCtx.studioState.walls, 18 / appCtx.planView.zoom);
    if (!nearestDoorWall) {
      showToast("请靠近一段墙体放置门。", "error");
      return;
    }
    const ft6 = captureUndoSnapshot(),
      solid3 = doorTypeCatalog[activeDoorType] || doorTypeCatalog.solid,
      newDoorRecord = {
        id: generateId("door"),
        wallId: nearestDoorWall.wall.id,
        t: nearestDoorWall.t,
        width: solid3.width,
        height: solid3.height,
        sill: 0,
        doorType: activeDoorType,
        hinge: "left",
        swing: 1,
      };
    if (
      ((newDoorRecord.t = clampWindowT2(nearestDoorWall.wall, newDoorRecord, getPixelsPerMeter())),
      appCtx.studioState.doors.push(newDoorRecord),
      !validateSelectionChange(ft6))
    )
      return;
    applyPlacementChange(ft6);
    const ao3 = getPreviewScopeSelection();
    (selectSceneObject("door", newDoorRecord.id),
      refreshScopeItems("architecture"),
      setPreviewScope(ao3),
      markDocumentDirty());
    return;
  }
  if (appCtx.activeToolName === "railing") {
    if (!ensureCalibrationReady()) return;
    const nearestRailingWall = nearestWall2(pr3, appCtx.studioState.walls, 18 / appCtx.planView.zoom);
    if (!nearestRailingWall) {
      showToast("请靠近一段墙体放置栏杆。", "error");
      return;
    }
    const ft7 = captureUndoSnapshot(),
      newRailingRecord = {
        id: generateId("railing"),
        wallId: nearestRailingWall.wall.id,
        t: nearestRailingWall.t,
        width: 2,
        height: 1.1,
        sill: 0,
      };
    if (
      ((newRailingRecord.t = clampWindowT2(
        nearestRailingWall.wall,
        newRailingRecord,
        getPixelsPerMeter(),
      )),
      appCtx.studioState.railings.push(newRailingRecord),
      !validateSelectionChange(ft7))
    )
      return;
    applyPlacementChange(ft7);
    const ao4 = getPreviewScopeSelection();
    (selectSceneObject("railing", newRailingRecord.id),
      refreshScopeItems("architecture"),
      setPreviewScope(ao4),
      markDocumentDirty());
    return;
  }
  if (appCtx.activeToolName === "label") {
    createSceneItem("planlabel", pr3);
    return;
  }
  const df3 = hitTestHandle(pr3);
  if (df3) {
    resetPlanInteraction();
    const newItemRecord = {
      ...df3.item,
    };
    ((appCtx.marqueeBox =
      df3.type === "resize-item"
        ? {
            type: "resize-item",
            pointerId: handlePointerDownPointerDownEvent.pointerId,
            originalItem: newItemRecord,
            handle: {
              x: df3.corner!.x,
              y: df3.corner!.y,
            },
            anchor: {
              ...df3.corner!.opposite,
            },
            before: captureUndoSnapshot(),
            moved: false,
          }
        : {
            type: "rotate-item",
            pointerId: handlePointerDownPointerDownEvent.pointerId,
            originalItem: newItemRecord,
            center: {
              x: newItemRecord.x,
              y: newItemRecord.y,
            },
            startPointer: {
              ...pr3,
            },
            before: captureUndoSnapshot(),
            moved: false,
          }),
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId));
    return;
  }
  const ao5 = getPreviewScopeSelection(),
    fy2 = hitTestPlanItem(pr3);
  if (!fy2) {
    (resetPlanInteraction(),
      handlePointerDownPointerDownEvent.shiftKey || refreshSelection(),
      (appCtx.marqueeBox = {
        type: "marquee",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        start: pr3,
        current: pr3,
        additive: handlePointerDownPointerDownEvent.shiftKey,
        moved: false,
      }),
      refreshStudioUi(),
      refreshStudioView(),
      updateMarqueeOverlay(),
      handlePointerDownPointerDownEvent.shiftKey || setPreviewScope(ao5),
      planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId));
    return;
  }
  resetPlanInteraction();
  const ft8 = fy2.kind === "item" ? captureUndoSnapshot() : null,
    ne9 = fy2.kind === "item" && appCtx.selectedItems.length > 0 && createSelectionRef("item", fy2.id);
  let placedItems: any = [],
    shouldRebuildItems = false;
  if (fy2.kind === "item") {
    if (ne9) {
      const existingItemIdSet = new Set(
        appCtx.selectedItems
          .filter((itemHistoryEntry: any) => itemHistoryEntry.kind === "item")
          .map((itemIdEntry: any) => itemIdEntry.id),
      );
      placedItems = appCtx.studioState.items.filter((historyItem) =>
        existingItemIdSet.has(historyItem.id),
      );
    } else {
      selectSceneObject("item", fy2.id);
      const foundPlacementItem = appCtx.studioState.items.find(
        (matchingItem) => matchingItem.id === fy2.id,
      );
      foundPlacementItem && (placedItems = [foundPlacementItem]);
    }
    if (handlePointerDownPointerDownEvent.altKey && placedItems.length) {
      const clonedItems = placedItems.map((clonedItemSource: any) => ({
        ...structuredClone(clonedItemSource),
        id: generateId("item"),
      }));
      (remapCourtyardAttachments2(placedItems, clonedItems),
        pushUndoEntry(clonedItems),
        appCtx.studioState.items.push(...clonedItems),
        (placedItems = clonedItems),
        clonedItems.length === 1
          ? selectSceneObject("item", clonedItems[0].id)
          : ((appCtx.selectedItem = null),
            (appCtx.selectedItems = clonedItems.map((publishedItem: any) => ({
              kind: "item",
              id: publishedItem.id,
            })))),
        (shouldRebuildItems = true));
    }
  } else selectSceneObject(fy2.kind, fy2.id);
  (refreshStudioUi(), refreshStudioView(), setPreviewScope(ao5));
  const qa4 = getCurrentPreviewScope();
  (fy2.kind === "item"
    ? (appCtx.marqueeBox = {
        type: "move-items",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        start: pr3,
        originals: placedItems.map((originalItemEntry: any) => ({
          id: originalItemEntry.id,
          x: originalItemEntry.x,
          y: originalItemEntry.y,
        })),
        before: ft8,
        copied: shouldRebuildItems,
        previewScope: qa4,
        moved: false,
      })
    : ["window", "door", "railing"].includes(fy2.kind) &&
      (appCtx.marqueeBox = {
        type: "move-opening",
        pointerId: handlePointerDownPointerDownEvent.pointerId,
        start: pr3,
        before: captureUndoSnapshot(),
        previewScope: "architecture",
        moved: false,
      }),
    appCtx.marqueeBox
      ? planCanvasElement.setPointerCapture(handlePointerDownPointerDownEvent.pointerId)
      : endStudioGesture());
}
function handlePointerUp(pointerUpEvent: any) {
  const ya2 = eventToLocalPoint(pointerUpEvent),
    pr4 = screenToPlan(ya2);
  if (appCtx.marqueeBox?.pointerId === pointerUpEvent.pointerId) {
    if (appCtx.marqueeBox.type === "draw-flooropening") {
      ((appCtx.marqueeBox.current = pointerUpEvent.shiftKey
        ? (() => {
            const cornerDeltaX = pr4.x - appCtx.marqueeBox.start.x,
              cornerDeltaY = pr4.y - appCtx.marqueeBox.start.y,
              cornerDragMagnitude = Math.max(Math.abs(cornerDeltaX), Math.abs(cornerDeltaY));
            return {
              x: appCtx.marqueeBox.start.x + Math.sign(cornerDeltaX || 1) * cornerDragMagnitude,
              y: appCtx.marqueeBox.start.y + Math.sign(cornerDeltaY || 1) * cornerDragMagnitude,
            };
          })()
        : pr4),
        refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "marquee") {
      ((appCtx.marqueeBox.current = pr4),
        (appCtx.marqueeBox.moved = distance2(appCtx.marqueeBox.start, pr4) * appCtx.planView.zoom >= 4),
        drawMarqueeOverlay() ? renderPlanScene() : refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "pan") {
      const nl4 = screenToPlanPoint(ya2);
      ((appCtx.planView.offsetX = appCtx.marqueeBox.offsetX + nl4.x - appCtx.marqueeBox.screen.x),
        (appCtx.planView.offsetY = appCtx.marqueeBox.offsetY + nl4.y - appCtx.marqueeBox.screen.y));
      const handleDeltaX = ya2.x - appCtx.marqueeBox.visibleScreen.x,
        handleDeltaY = ya2.y - appCtx.marqueeBox.visibleScreen.y;
      drawMarqueeOverlay({
        offsetX: handleDeltaX,
        offsetY: handleDeltaY,
      }) || refreshStudioView();
      return;
    }
    if (appCtx.marqueeBox.type === "move-items") {
      if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.start) * appCtx.planView.zoom < 3) return;
      const moveThreshold = getPixelsPerMeter() * 0.05,
        wr2 = isSnapEnabled() && appCtx.studioState.settings.snapGrid !== false;
      let dragOffsetX = pr4.x - appCtx.marqueeBox.start.x,
        dragOffsetY = pr4.y - appCtx.marqueeBox.start.y;
      pointerUpEvent.shiftKey &&
        (Math.abs(dragOffsetX) >= Math.abs(dragOffsetY) ? (dragOffsetY = 0) : (dragOffsetX = 0));
      const itemsByItemId = new Map(
        appCtx.studioState.items.map((handlePointerUpItemEntry) => [
          handlePointerUpItemEntry.id,
          handlePointerUpItemEntry,
        ]),
      );
      for (const originalItemSnapshot of appCtx.marqueeBox.originals) {
        const currentItemEntry = itemsByItemId.get(originalItemSnapshot.id);
        currentItemEntry &&
          ((currentItemEntry.x = wr2
            ? Math.round((originalItemSnapshot.x + dragOffsetX) / moveThreshold) * moveThreshold
            : originalItemSnapshot.x + dragOffsetX),
          (currentItemEntry.y = wr2
            ? Math.round((originalItemSnapshot.y + dragOffsetY) / moveThreshold) * moveThreshold
            : originalItemSnapshot.y + dragOffsetY));
      }
      if (appCtx.marqueeBox.originals.length === 1) {
        const firstOriginalItem = itemsByItemId.get(appCtx.marqueeBox.originals[0].id);
        isCourtyardGate2(firstOriginalItem) &&
          anchorGate2(
            firstOriginalItem,
            appCtx.studioState.items,
            getPixelsPerMeter(),
            24 / appCtx.planView.zoom,
          );
      }
      ((appCtx.marqueeBox.moved = appCtx.marqueeBox.originals.some((movedOriginalItem: any) => {
        const movedItemEntry = itemsByItemId.get(movedOriginalItem.id);
        return (
          movedItemEntry &&
          (Math.abs(movedItemEntry.x - movedOriginalItem.x) > 0.000001 ||
            Math.abs(movedItemEntry.y - movedOriginalItem.y) > 0.000001)
        );
      })),
        refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "resize-item") {
      if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.handle) * appCtx.planView.zoom < 3) return;
      const at7 = getSelectedObject();
      if (!at7) return;
      const itemHeightMeters = Math.max(finite2(appCtx.marqueeBox.originalItem.height, 0.05), 0.001),

        resizeSourceItem = itemWithPlanFootprint2(appCtx.marqueeBox.originalItem),
        itemMinimumFootprint = itemMinimumFootprint2(appCtx.marqueeBox.originalItem.type),
        itemResizeLimits =
          at7.type === "fan"
            ? {
                minimum: 0.6 / fanDimensions2(appCtx.marqueeBox.originalItem).fanScale,
                maximum: 1.6 / fanDimensions2(appCtx.marqueeBox.originalItem).fanScale,
              }
            : pointerUpEvent.shiftKey
              ? {
                  minimum: Math.max(
                    itemMinimumFootprint / Math.max(resizeSourceItem.width, itemMinimumFootprint),
                    itemMinimumFootprint / Math.max(resizeSourceItem.depth, itemMinimumFootprint),
                    itemMinimumHeight2(appCtx.marqueeBox.originalItem.type) / itemHeightMeters,
                  ),
                  maximum: Math.min(
                    8 / Math.max(resizeSourceItem.width, itemMinimumFootprint),
                    8 / Math.max(resizeSourceItem.depth, itemMinimumFootprint),
                    6 / itemHeightMeters,
                  ),
                }
              : undefined,
        resizedItemResult = resizeRotatedItemFromCorner2(
          resizeSourceItem,
          appCtx.marqueeBox.handle,
          appCtx.marqueeBox.anchor,
          pr4,
          getPixelsPerMeter() || 1,
          pointerUpEvent.shiftKey || at7.type === "fan",
          {
            ...itemResizeLimits,
            minimumDimension: itemMinimumFootprint,
          },
        );
      if (
        (Object.assign(at7, itemFromPlanFootprintResize2(appCtx.marqueeBox.originalItem, resizedItemResult)),
        at7.type === "fan" &&
          Object.assign(
            at7,
            fanDimensions2({
              ...appCtx.marqueeBox.originalItem,
              fanScale: resizedItemResult.width / 0.434,
            }),
          ),
        at7.type === "curtain" && normalizeCurtainTrack2(at7).curtainTrack !== "straight")
      ) {
        const originalItem = appCtx.marqueeBox.originalItem,
          normalizedCurtainConfig = normalizeCurtainTrack2(originalItem),
          curtainDepthRatio =
            Math.max(0.2, at7.depth - 0.18) / Math.max(0.2, originalItem.depth - 0.18);
        (Object.assign(
          at7,
          normalizeCurtainTrack2({
            ...at7,
            curtainLeftLength: normalizedCurtainConfig.curtainLeftLength * curtainDepthRatio,
            curtainRightLength: normalizedCurtainConfig.curtainRightLength * curtainDepthRatio,
          }),
        ),
          (at7.depth = curtainFootprintDepth2(at7)));
      }
      ((appCtx.marqueeBox.moved =
        Math.abs(at7.x - appCtx.marqueeBox.originalItem.x) > 0.000001 ||
        Math.abs(at7.y - appCtx.marqueeBox.originalItem.y) > 0.000001 ||
        Math.abs(at7.width - appCtx.marqueeBox.originalItem.width) > 0.000001 ||
        Math.abs(at7.depth - appCtx.marqueeBox.originalItem.depth) > 0.000001 ||
        Math.abs(at7.height - appCtx.marqueeBox.originalItem.height) > 0.000001),
        refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "rotate-item") {
      if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.startPointer) * appCtx.planView.zoom < 3) return;
      const at8 = getSelectedObject();
      if (!at8) return;
      ((at8.rotation = itemRotationFromPointers2(
        appCtx.marqueeBox.originalItem.rotation,
        appCtx.marqueeBox.center,
        appCtx.marqueeBox.startPointer,
        pr4,
        pointerUpEvent.shiftKey ? 15 : 0,
      )),
        (appCtx.marqueeBox.moved = Math.abs(at8.rotation - appCtx.marqueeBox.originalItem.rotation) > 0.000001),
        refreshStudioView());
      return;
    }
    if (appCtx.marqueeBox.type === "move-opening") {
      if (!appCtx.marqueeBox.moved && distance2(pr4, appCtx.marqueeBox.start) * appCtx.planView.zoom < 3) return;
      const at9 = getSelectedObject(),
        itemWallRecord = appCtx.studioState.walls.find((itemWall) => itemWall.id === at9?.wallId);
      if (!at9 || !itemWallRecord) return;
      at9.t = clampWindowT2(
        itemWallRecord,
        {
          ...at9,
          t: projectPointToSegment2(pr4, itemWallRecord.start, itemWallRecord.end).t,
        },
        getPixelsPerMeter(),
      );
      const beforeItemRecord = appCtx.marqueeBox.before?.[appCtx.selectedItem?.kind + "s"]?.find?.(
        (beforeItem: any) => beforeItem.id === at9.id,
      );
      ((appCtx.marqueeBox.moved = !beforeItemRecord || Math.abs(at9.t - beforeItemRecord.t) > 0.000001),
        refreshStudioView());
      return;
    }
  }
  (toggleSnapSetting(pointerUpEvent),
    (appCtx.alignmentState || ["scale", "wall", "window", "door", "railing"].includes(appCtx.activeToolName)) &&
      refreshStudioView());
}
function schedulePointerMove() {
  appCtx.pointerFrameId = 0;
  const Hi2 = appCtx.activePointerState;
  ((appCtx.activePointerState = null), Hi2 && handlePointerUp(Hi2));
}
function handlePointerMove(pointerMoveEvent: any) {
  ((appCtx.activePointerState = {
    clientX: pointerMoveEvent.clientX,
    clientY: pointerMoveEvent.clientY,
    pointerId: pointerMoveEvent.pointerId,
    shiftKey: pointerMoveEvent.shiftKey,
  }),
    appCtx.pointerFrameId || (appCtx.pointerFrameId = requestAnimationFrame(schedulePointerMove)));
}
function cancelPointerDrag(cancelPointerDragActivePointerId: any) {
  !appCtx.activePointerState ||
    appCtx.activePointerState.pointerId !== cancelPointerDragActivePointerId ||
    (appCtx.pointerFrameId && cancelAnimationFrame(appCtx.pointerFrameId), schedulePointerMove());
}
function scheduleDragUpdate() {
  appCtx.renderLoopFrameId = 0;
  const Gd2 = appCtx.pinchStartDistance,
    Wd2 = appCtx.pinchStartCenter;
  ((appCtx.pinchStartDistance = 1),
    (appCtx.pinchStartCenter = null),
    Wd2 && Math.abs(Gd2 - 1) > 1e-8 && zoomByScale(Gd2, Wd2));
}
function handleCanvasWheel(wheelEvent: any) {
  ((appCtx.pinchStartDistance *= Math.exp(-wheelEvent.deltaY * 0.0012)),
    (appCtx.pinchStartCenter = eventToLocalPoint(wheelEvent)),
    resetPlanInteraction(),
    appCtx.renderLoopFrameId || (appCtx.renderLoopFrameId = requestAnimationFrame(scheduleDragUpdate)),
    window.clearTimeout(appCtx.renderLoopTimeoutId),
    (appCtx.renderLoopTimeoutId = window.setTimeout(() => {
      ((appCtx.renderLoopTimeoutId = null),
        appCtx.renderLoopFrameId && (cancelAnimationFrame(appCtx.renderLoopFrameId), scheduleDragUpdate()),
        endStudioGesture());
    }, 90)));
}
function finishPointerDrag(pointerCancelEvent: any) {
  if (!appCtx.marqueeBox || appCtx.marqueeBox.pointerId !== pointerCancelEvent.pointerId) return;
  if (appCtx.marqueeBox.type === "draw-flooropening") {
    const { start: finishPointerDragDragStart, current: dragCurrent } = appCtx.marqueeBox;
    try {
      planCanvasElement.releasePointerCapture(pointerCancelEvent.pointerId);
    } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
    ((appCtx.marqueeBox = null), endStudioGesture());
    const dragDeltaXMeters =
        Math.abs(dragCurrent.x - finishPointerDragDragStart.x) / getPixelsPerMeter(),
      dragDeltaYMeters =
        Math.abs(dragCurrent.y - finishPointerDragDragStart.y) / getPixelsPerMeter();
    pointerCancelEvent.type !== "pointercancel" &&
    dragDeltaXMeters >= 0.1 &&
    dragDeltaYMeters >= 0.1
      ? createSceneItem(
          "flooropening",
          {
            x: (finishPointerDragDragStart.x + dragCurrent.x) / 2,
            y: (finishPointerDragDragStart.y + dragCurrent.y) / 2,
          },
          {
            width: Math.min(20, dragDeltaXMeters),
            depth: Math.min(20, dragDeltaYMeters),
          },
        )
      : refreshStudioView();
    return;
  }
  if (appCtx.marqueeBox.type === "marquee") {
    const ao6 = getPreviewScopeSelection(),
      dragAdditionEntries = appCtx.marqueeBox.additive
        ? [...(appCtx.selectedItem ? [appCtx.selectedItem] : []), ...appCtx.selectedItems]
        : [],
      dy3 = appCtx.marqueeBox.moved ? marqueeDelta(appCtx.marqueeBox.start, appCtx.marqueeBox.current) : [],
      dragMergedEntries = [
        ...new Map(
          [...dragAdditionEntries, ...dy3].map((dragEntry) => [
            dragEntry.kind + ":" + dragEntry.id,
            dragEntry,
          ]),
        ).values(),
      ];
    dragMergedEntries.length === 1
      ? selectSceneObject(dragMergedEntries[0].kind, dragMergedEntries[0].id)
      : ((appCtx.selectedItem = null), (appCtx.selectedItems = dragMergedEntries));
    try {
      planCanvasElement.releasePointerCapture(pointerCancelEvent.pointerId);
    } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
    ((appCtx.marqueeBox = null),
      refreshStudioUi(),
      refreshStudioView(),
      setPreviewScope(ao6),
      endStudioGesture());
    return;
  }
  const activeDragGesture = appCtx.marqueeBox;
  let copied = activeDragGesture.moved || activeDragGesture.copied;
  if (copied && activeDragGesture.type === "move-items")
    for (const draggedOriginal of activeDragGesture.originals) {
      const draggedItemRecord = appCtx.studioState.items.find(
        (draggedItem) => draggedItem.id === draggedOriginal.id,
      );
      draggedItemRecord &&
        anchorGate2(draggedItemRecord, appCtx.studioState.items, getPixelsPerMeter(), 24 / appCtx.planView.zoom);
    }
  if (
    copied &&
    pointerCancelEvent.type !== "pointercancel" &&
    activeDragGesture.type === "move-items"
  ) {
    const draggedOriginalIds = activeDragGesture.originals.map(
      (draggedOriginalItem: any) => draggedOriginalItem.id,
    );
    if (draggedOriginalIds.length === 1) {
      const firstDraggedItemRecord = appCtx.studioState.items.find(
        (firstDraggedItem) => firstDraggedItem.id === draggedOriginalIds[0],
      );
      firstDraggedItemRecord && finalizeAddedItem(firstDraggedItemRecord, draggedOriginalIds);
    }
  }
  if (
    (activeDragGesture.before && pointerCancelEvent.type === "pointercancel"
      ? (restorePlacementScene2(appCtx.studioState, activeDragGesture.before),
        appCtx.selectedItem && !getSelectedObject() && refreshSelection(),
        (copied = false),
        refreshStudioView())
      : copied &&
        !validateSelectionChange(activeDragGesture.before) &&
        ((copied = false), refreshStudioView()),
    copied && (applyPlacementChange(appCtx.marqueeBox.before), markDocumentDirty()),
    ["move-items", "resize-item", "rotate-item", "move-opening"].includes(activeDragGesture.type) &&
      refreshStudioUi(),
    copied && activeDragGesture.type === "move-opening")
  )
    requestSceneRebuild({
      scope: "architecture",
    });
  else {
    if (copied && ["move-items", "resize-item", "rotate-item"].includes(activeDragGesture.type)) {
      const activePlacedElement = getSelectedObject();
      requestSceneRebuild({
        scope:
          activeDragGesture.previewScope ||
          (activePlacedElement
            ? resolvePreviewScope(activePlacedElement)
            : getCurrentPreviewScope()),
      });
    }
  }
  appCtx.marqueeBox.type === "pan" && planCanvasElement.classList.remove("panning");
  try {
    planCanvasElement.releasePointerCapture(pointerCancelEvent.pointerId);
  } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
  ((appCtx.marqueeBox = null),
    activeDragGesture.type === "pan" && refreshStudioView(),
    endStudioGesture());
}
function handlePointerRelease(releasePointerId: any) {
  (cancelPointerDrag(releasePointerId.pointerId), finishPointerDrag(releasePointerId));
}
function applyToolSetting(selectedToolName: any) {
  const toolPlacedElement = getSelectedObject();
  if (
    !toolPlacedElement ||
    appCtx.selectedItem?.kind !== selectedToolName ||
    !isSelectionAllowed(appCtx.selectedItem)
  )
    return;
  const yr2 =
      selectedToolName === "item"
        ? resolvePreviewScope(toolPlacedElement)
        : ["door", "window", "railing"].includes(selectedToolName)
          ? "architecture"
          : "all",
    ft9 = captureUndoSnapshot();
  if (selectedToolName === "wall")
    ((toolPlacedElement.height = clamp2(
      finite2(selectElement("#wall-height").value, toolPlacedElement.height),
      0.01,
      6,
    )),
      (toolPlacedElement.thickness = clamp2(
        finite2(selectElement("#wall-thickness").value, toolPlacedElement.thickness),
        0.01,
        3,
      )),
      (toolPlacedElement.opacity =
        selectElement("#wall-opacity-mode").value === "custom"
          ? clamp2(
              finite2(selectElement("#wall-opacity").value, appCtx.studioState.settings.wallOpacity * 100),
              0,
              100,
            ) / 100
          : null),
      (toolPlacedElement.allowOpenEnd = selectElement("#wall-open-end-mode").value === "allowed"),
      (appCtx.studioState.settings.wallHeight = toolPlacedElement.height),
      (appCtx.studioState.settings.wallThickness = toolPlacedElement.thickness));
  else {
    if (selectedToolName === "window") {
      ((toolPlacedElement.width = clamp2(
        finite2(selectElement("#window-width").value, toolPlacedElement.width),
        0.3,
        20,
      )),
        (toolPlacedElement.height = clamp2(
          finite2(selectElement("#window-height").value, toolPlacedElement.height),
          0.3,
          20,
        )),
        (toolPlacedElement.sill = clamp2(
          finite2(selectElement("#window-sill").value, toolPlacedElement.sill),
          0,
          20,
        )),
        (toolPlacedElement.hasDivider = selectElement("#window-divider").value !== "without"));
      const toolAnchorWallRecord = appCtx.studioState.walls.find(
        (toolAnchorWall) => toolAnchorWall.id === toolPlacedElement.wallId,
      );
      toolAnchorWallRecord &&
        (toolPlacedElement.t = clampWindowT2(
          toolAnchorWallRecord,
          toolPlacedElement,
          getPixelsPerMeter(),
        ));
    } else {
      if (selectedToolName === "door") {
        ((toolPlacedElement.doorType = Object.hasOwn(
          doorTypeCatalog,
          selectElement("#door-type").value,
        )
          ? selectElement("#door-type").value
          : "solid"),
          (toolPlacedElement.width = clamp2(
            finite2(selectElement("#door-width").value, toolPlacedElement.width),
            0.55,
            20,
          )),
          (toolPlacedElement.height = clamp2(
            finite2(selectElement("#door-height").value, toolPlacedElement.height),
            1.8,
            20,
          )));
        const toolWindowWallRecord = appCtx.studioState.walls.find(
          (toolWindowWall) => toolWindowWall.id === toolPlacedElement.wallId,
        );
        toolWindowWallRecord &&
          (toolPlacedElement.t = clampWindowT2(
            toolWindowWallRecord,
            toolPlacedElement,
            getPixelsPerMeter(),
          ));
      } else {
        if (selectedToolName === "railing") {
          ((toolPlacedElement.width = clamp2(
            finite2(selectElement("#railing-width").value, toolPlacedElement.width),
            0.3,
            20,
          )),
            (toolPlacedElement.height = clamp2(
              finite2(selectElement("#railing-height").value, toolPlacedElement.height),
              0.5,
              3,
            )));
          const toolDoorWallRecord = appCtx.studioState.walls.find(
            (toolDoorWall) => toolDoorWall.id === toolPlacedElement.wallId,
          );
          toolDoorWallRecord &&
            (toolPlacedElement.t = clampWindowT2(
              toolDoorWallRecord,
              toolPlacedElement,
              getPixelsPerMeter(),
            ));
        } else {
          const toolPpm = getPixelsPerMeter() || 1;
          if (
            ((toolPlacedElement.x =
              finite2(selectElement("#item-x").value, toolPlacedElement.x / toolPpm) * toolPpm),
            (toolPlacedElement.y =
              finite2(selectElement("#item-y").value, toolPlacedElement.y / toolPpm) * toolPpm),
            toolPlacedElement.type === "fan" &&
              Object.assign(
                toolPlacedElement,
                fanDimensions2({
                  ...toolPlacedElement,
                  fanHeight: Number(selectElement("#fan-model-height").value),
                  fanScale: Number(selectElement("#fan-model-scale").value) / 100,
                }),
              ),
            (toolPlacedElement.width = clamp2(
              finite2(selectElement("#item-width").value, toolPlacedElement.width),
              itemMinimumFootprint2(toolPlacedElement.type),
              8,
            )),
            (toolPlacedElement.height = clamp2(
              finite2(selectElement("#item-height").value, toolPlacedElement.height),
              itemMinimumHeight2(toolPlacedElement.type),
              6,
            )),
            (toolPlacedElement.depth = clamp2(
              finite2(selectElement("#item-depth").value, toolPlacedElement.depth),
              itemMinimumFootprint2(toolPlacedElement.type),
              8,
            )),
            toolPlacedElement.type === "sofa-l" &&
              (toolPlacedElement.sofaChaiseSide =
                selectElement("#sofa-chaise-side").value === "left" ? "left" : "right"),
            toolPlacedElement.type === "fan" &&
              Object.assign(toolPlacedElement, fanDimensions2(toolPlacedElement)),
            (toolPlacedElement.elevation = clamp2(
              finite2(selectElement("#item-elevation").value, toolPlacedElement.elevation || 0),
              0,
              6,
            )),
            toolPlacedElement.type === "airer" &&
              Object.assign(
                toolPlacedElement,
                airerDimensions2({
                  ...toolPlacedElement,
                  airerStyle:
                    selectElement("#airer-style").value === "single" ? "single" : "double",
                  airerExtension: Number(selectElement("#airer-extension").value),
                  airerPreview: Number(selectElement("#airer-preview").value),
                }),
              ),
            (toolPlacedElement.rotation =
              toolPlacedElement.type === "striplight"
                ? normalizeFullRotation2(
                    selectElement("#item-rotation").value,
                    toolPlacedElement.rotation,
                  )
                : finite2(selectElement("#item-rotation").value, toolPlacedElement.rotation)),
            toolPlacedElement.type === "planlabel" &&
              ((toolPlacedElement.title = normalizeLabelText2(
                selectElement("#label-title").value,
                "家庭总览",
                24,
              )),
              (toolPlacedElement.subtitle = normalizeLabelText2(
                selectElement("#label-subtitle").value,
                "HOME PLAN",
                36,
              )),
              (toolPlacedElement.titleSpacing = clamp2(
                finite2(selectElement("#label-title-spacing").value, 105) / 100,
                0,
                1.8,
              )),
              (toolPlacedElement.subtitleSpacing = clamp2(
                finite2(selectElement("#label-subtitle-spacing").value, 8) / 100,
                0,
                0.6,
              )),
              (toolPlacedElement.lineLength = clamp2(
                finite2(selectElement("#label-line-length").value, 86) / 100,
                0.3,
                1,
              )),
              (toolPlacedElement.labelColor = normalizePlanLabelColor(
                selectElement("#label-color").value,
              )),
              (toolPlacedElement.height = 0.01),
              (toolPlacedElement.elevation = 0)),
            toolPlacedElement.type === "curtain")
          ) {
            toolPlacedElement.curtainPosition = ["left", "right", "split"].includes(
              selectElement("#curtain-position").value,
            )
              ? selectElement("#curtain-position").value
              : "split";
            const curtainTrack = normalizeCurtainTrack2(toolPlacedElement).curtainTrack;
            ((toolPlacedElement.curtainForm =
              selectElement("#curtain-form").value === "roller" ? "roller" : "standard"),
              Object.assign(
                toolPlacedElement,
                normalizeCurtainTrack2({
                  curtainForm: toolPlacedElement.curtainForm,
                  curtainTrack: selectElement("#curtain-track").value,
                  curtainCorner: selectElement("#curtain-corner").value,
                  curtainLeftLength: selectElement("#curtain-left-length").value,
                  curtainRightLength: selectElement("#curtain-right-length").value,
                  curtainMeet: selectElement("#curtain-meet").value,
                  curtainPreview: selectElement("#curtain-preview").value,
                  curtainFabric: selectElement("#curtain-fabric").value,
                }),
              ),
              curtainTrack !== "straight" &&
                toolPlacedElement.curtainTrack === "straight" &&
                (toolPlacedElement.depth = 0.18),
              (toolPlacedElement.depth = curtainFootprintDepth2(toolPlacedElement)));
          }
          if (
            (roundTableTypeSet.has(toolPlacedElement.type) &&
              (toolPlacedElement.roundTableTurntable =
                selectElement("#round-table-turntable").value === "with"),
            toolPlacedElement.type === "fridge" &&
              (toolPlacedElement.fridgeStyle =
                document.querySelector<StudioControlElement>('input[name="fridge-style"]:checked')?.value === "double"
                  ? "double"
                  : "standard"),
            openStairTypeSet.has(toolPlacedElement.type) &&
              (toolPlacedElement.stairDirection = ["left", "right"].includes(
                selectElement("#stair-direction").value,
              )
                ? selectElement("#stair-direction").value
                : "right"),
            toolPlacedElement.type === "pillar" &&
              ((toolPlacedElement.pillarShape = normalizePillarShape2(
                selectElement("#pillar-shape").value,
              )),
              (toolPlacedElement.pillarAxis = normalizePillarAxis2(
                selectElement("#pillar-axis").value,
              ))),
            toolPlacedElement.type === "striplight" &&
              ((toolPlacedElement.stripAxis = normalizeStripAxis2(
                selectElement("#strip-axis").value,
              ))),
            toolPlacedElement.type === "mural" &&
              (toolPlacedElement.muralStyle = normalizeMuralArtStyle(
                selectElement("#mural-style").value,
              )),
            toolPlacedElement.type === "featurewall" &&
              (toolPlacedElement.wallStyle = normalizeFeatureWallStyle(
                selectElement("#featurewall-style").value,
              )),
            toolPlacedElement.type === "tv")
          ) {
            const tvMountStyle2 = tvMountStyleSet.has(toolPlacedElement.tvMountStyle)
                ? toolPlacedElement.tvMountStyle
                : "standard",
              tvMountStyleValue = tvMountStyleSet.has(selectElement("#tv-mount-style").value)
                ? selectElement("#tv-mount-style").value
                : "standard";
            (tvMountStyle2 !== tvMountStyleValue && tvMountStyleValue === "mobile"
              ? ((toolPlacedElement.height = Math.max(
                  toolPlacedElement.height,
                  sofaMinDimensions.height,
                )),
                (toolPlacedElement.depth = Math.max(
                  toolPlacedElement.depth,
                  sofaMinDimensions.depth,
                )),
                (toolPlacedElement.elevation = 0))
              : tvMountStyle2 === "mobile" &&
                tvMountStyleValue !== "mobile" &&
                Math.abs(toolPlacedElement.height - sofaMinDimensions.height) < 0.001 &&
                Math.abs(toolPlacedElement.depth - sofaMinDimensions.depth) < 0.001 &&
                ((toolPlacedElement.height = itemTypeCatalog.tv.height),
                (toolPlacedElement.depth = itemTypeCatalog.tv.depth)),
              (toolPlacedElement.tvMountStyle = tvMountStyleValue));
          }
          if (lampItemTypeSet.has(toolPlacedElement.type)) {
            const downlight5 =
              (lightPresetCatalog as any)[toolPlacedElement.type] || lightPresetCatalog.downlight;
            ((toolPlacedElement.verticalRotation =
              toolPlacedElement.type === "striplight"
                ? normalizeFullRotation2(
                    selectElement("#item-vertical-rotation").value,
                    toolPlacedElement.verticalRotation || 0,
                  )
                : clamp2(
                    finite2(
                      selectElement("#item-vertical-rotation").value,
                      toolPlacedElement.verticalRotation || 0,
                    ),
                    -90,
                    90,
                  )),
              toolPlacedElement.type === "striplight" &&
                ((toolPlacedElement.stripRollRotation = normalizeFullRotation2(
                  itemStripRollInput.value,
                  toolPlacedElement.stripRollRotation || 0,
                )),
                (toolPlacedElement.lightSourceVisible = itemLightSourceVisibleInput.checked)),
              (toolPlacedElement.lightGroupId = appCtx.studioState.lightGroups.some(
                (matchingLightGroup) =>
                  matchingLightGroup.id === selectElement("#light-group").value,
              )
                ? selectElement("#light-group").value
                : getLightGroups().id),
              (toolPlacedElement.lightTemperature = clamp2(
                finite2(selectElement("#light-temperature").value, downlight5.temperature),
                2200,
                6500,
              )),
              (toolPlacedElement.lightBrightness = clamp2(
                finite2(selectElement("#light-brightness").value, downlight5.brightness),
                0,
                100,
              )),
              (toolPlacedElement.lightRange = clamp2(
                finite2(selectElement("#light-range").value, downlight5.range),
                0.5,
                10,
              )),
              (toolPlacedElement.lightAngle = clamp2(
                finite2(selectElement("#light-angle").value, downlight5.angle),
                15,
                lightAngleLimitForType(toolPlacedElement.type),
              )),
              (toolPlacedElement.height = (itemTypeCatalog as any)[toolPlacedElement.type].height));
          } else
            ["camera", "presence"].includes(toolPlacedElement.type) &&
              (toolPlacedElement.verticalRotation = clamp2(
                finite2(
                  selectElement("#item-vertical-rotation").value,
                  toolPlacedElement.verticalRotation || 0,
                ),
                -180,
                180,
              ));
        }
      }
    }
  }
  if (
    (selectedToolName === "item" &&
      toolPlacedElement.type.startsWith("garden-gate") &&
      (anchorGate2(toolPlacedElement, appCtx.studioState.items, getPixelsPerMeter(), 24 / appCtx.planView.zoom),
      syncCourtyardGates2(appCtx.studioState.items, getPixelsPerMeter())),
    !validateSelectionChange(ft9))
  ) {
    (refreshStudioUi(true), refreshScopeItems(yr2));
    return;
  }
  (applyPlacementChange(ft9), refreshScopeItems(yr2), markDocumentDirty());
}
function refreshPreviewScene() {
  ((appCtx.segmentStartPoint = null),
    (appCtx.snapEndpointPoint = null),
    (appCtx.wallSegmentCount = 0),
    (finishWallButton.hidden = true));
}
function resetCameraView() {
  (refreshPreviewScene(), refreshStudioView());
}
(toolButtons.forEach((toolClickButton) =>
  toolClickButton.addEventListener("click", () => selectStudioTool(toolClickButton.dataset.tool)),
),
  addFloorButton.addEventListener("click", () => {
    addNewFloor();
  }),
  alignFloorButton.addEventListener("click", startFloorAlign),
  previewFloorGapInput.addEventListener("change", updatePreviewFloorGap),
  previewFloorUniformInput.addEventListener("change", updateUniformOverviewStack),
  exportFloorGapInput.addEventListener("change", updateExportFloorGap));
for (const drawingToolSection of drawingToolSections) {
  const drawingToolToggle = drawingToolSection.querySelector(".drawing-tool-toggle");
  if (!drawingToolToggle) continue;
  drawingToolToggle.addEventListener("click", (drawingToolToggleClickEvent) => {
    (drawingToolToggleClickEvent.stopPropagation(),
      closeDrawingToolGroups(drawingToolSection),
      setDrawingToolGroupOpen(
        drawingToolSection,
        !drawingToolSection.classList.contains("open"),
      ));
  });
}
for (const previewFloorButton of previewFloorControls)
  previewFloorButton.addEventListener("click", () =>
    setPreviewFloor(previewFloorButton.dataset.previewFloor),
  );
(importPlanButton.addEventListener("click", () => planFileInput.click()),
  selectElement("#background-import-copy").addEventListener("click", async () => {
    const backgroundImportDetailsField = selectElement("#background-import-details");
    try {
      (await navigator.clipboard.writeText(backgroundImportDetailsField.value),
        showToast("诊断信息已复制。"));
    } catch {
      ((backgroundImportDetailsField.closest("details").open = true),
        backgroundImportDetailsField.focus(),
        backgroundImportDetailsField.select(),
        showToast("请长按或按 Ctrl/Cmd+C 复制选中的诊断信息。", "warning"));
    }
  }),
  planFileInput.addEventListener("change", async () => {
    (await importBackgroundFile(planFileInput.files?.[0]), (planFileInput.value = ""));
  }),
  toggleBackgroundButton.addEventListener("click", () => {
    appCtx.studioState.background &&
      (deselectAll(),
      (appCtx.studioState.settings.backgroundVisible = !appCtx.studioState.settings.backgroundVisible),
      refreshBackground(),
      refreshStudioView(),
      markDocumentDirty());
  }),
  removePlanButton.addEventListener("click", () => {
    appCtx.studioState.background &&
      (deselectAll(),
      (appCtx.studioState.background = null),
      (appCtx.backgroundImageSource = null),
      refreshScopeItems(),
      resetView(),
      markDocumentDirty(),
      showToast("底图引用已移除，现在可以在编辑器中删除这张图片。", "success"));
  }));
function applyWallHeightInput(wallHeightValue: any) {
  (appCtx.activePointerId && appCtx.activePointerId !== wallHeightValue && applyWallOpacityInput(),
    !appCtx.activePointerId &&
      (deselectAll(), (appCtx.activePointerId = wallHeightValue), resetPlanInteraction()));
}
function applyWallThicknessInput() {
  appCtx.pointerMoveCount ||
    (appCtx.pointerMoveCount = requestAnimationFrame(() => {
      ((appCtx.pointerMoveCount = 0), refreshStudioView());
    }));
}
function applyWallOpacityInput() {
  (window.clearTimeout(appCtx.pointerReleaseTimeoutId),
    (appCtx.pointerReleaseTimeoutId = null),
    appCtx.activePointerId &&
      ((appCtx.activePointerId = null),
      syncControlValue2(globalWallHeightInput, appCtx.studioState.settings.wallHeight.toFixed(2)),
      syncControlValue2(globalWallThicknessInput, appCtx.studioState.settings.wallThickness.toFixed(2)),
      syncControlValue2(globalWallOpacityInput, Math.round(appCtx.studioState.settings.wallOpacity * 100)),
      refreshStudioUi(),
      requestSceneRebuild({
        scope: "all",
      }),
      endStudioGesture()));
}
function scheduleWallApply(wallApplyDelayMs = 80) {
  (window.clearTimeout(appCtx.pointerReleaseTimeoutId),
    (appCtx.pointerReleaseTimeoutId = window.setTimeout(applyWallOpacityInput, wallApplyDelayMs)));
}
function commitWallHeight() {
  const committedWallHeight = clamp2(
    finite2(globalWallHeightInput.value, appCtx.studioState.settings.wallHeight),
    0.01,
    6,
  );
  if (!(
    Math.abs(committedWallHeight - appCtx.studioState.settings.wallHeight) < 1e-8 &&
    appCtx.studioState.walls.every(
      (checkedWallHeightTarget) =>
        Math.abs(checkedWallHeightTarget.height - committedWallHeight) < 1e-8,
    )
  )) {
    (applyWallHeightInput(globalWallHeightInput),
      (appCtx.studioState.settings.wallHeight = committedWallHeight));
    for (const heightUpdateWall of appCtx.studioState.walls) heightUpdateWall.height = committedWallHeight;
    markDocumentDirty();
  }
}
function commitWallThickness() {
  const committedWallThickness = clamp2(
    finite2(globalWallThicknessInput.value, appCtx.studioState.settings.wallThickness),
    0.01,
    3,
  );
  if (!(
    Math.abs(committedWallThickness - appCtx.studioState.settings.wallThickness) < 1e-8 &&
    appCtx.studioState.walls.every(
      (checkedWallThicknessTarget) =>
        Math.abs(checkedWallThicknessTarget.thickness - committedWallThickness) < 1e-8,
    )
  )) {
    (applyWallHeightInput(globalWallThicknessInput),
      (appCtx.studioState.settings.wallThickness = committedWallThickness));
    for (const thicknessUpdateWall of appCtx.studioState.walls)
      thicknessUpdateWall.thickness = committedWallThickness;
    (applyWallThicknessInput(), markDocumentDirty());
  }
}
function commitWallOpacity() {
  const committedWallOpacity =
    clamp2(finite2(globalWallOpacityInput.value, appCtx.studioState.settings.wallOpacity * 100), 0, 100) /
    100;
  Math.abs(committedWallOpacity - appCtx.studioState.settings.wallOpacity) < 1e-8 ||
    (applyWallHeightInput(globalWallOpacityInput),
    (appCtx.studioState.settings.wallOpacity = committedWallOpacity),
    markDocumentDirty());
}
for (const [wallOpacityInput, wallOpacitySetting] of [
  [globalWallHeightInput, commitWallHeight],
  [globalWallThicknessInput, commitWallThickness],
  [globalWallOpacityInput, commitWallOpacity],
])
  (wallOpacityInput.addEventListener("input", wallOpacitySetting),
    wallOpacityInput.addEventListener("change", () => {
      (wallOpacitySetting(), scheduleWallApply());
    }),
    wallOpacityInput.addEventListener("blur", () => scheduleWallApply(0)));
toggleFloorEdgeButton.addEventListener("click", () => {
  (deselectAll(),
    (appCtx.studioState.settings.floorEdgeVisible = appCtx.studioState.settings.floorEdgeVisible === false),
    refreshScopeItems(),
    markDocumentDirty());
});
function filterAssetList() {
  const librarySearchText = (assetSearchInput?.value || "").trim().toLocaleLowerCase().replace(/\s+/g, ""),
    activeLibraryCategory = normalizeLibraryCategory(appCtx.activeLibraryCategory);
  libraryNameScroll.cancelAll();
  let assetMatchCount = 0;
  for (const assetToolbarEntryButton of itemTypeButtons) {
    // 「灯光」大类单独一行（`#light-asset-row`），卡片上不带 `data-library-*`，只能按类型集合判；
    // 其余三个大类（home / appliance / courtyard）一律交给模型库的 DOM 判定，避免两处各写一套。
    const itemType = assetToolbarEntryButton.dataset.itemType,
      isAssetCardVisible =
        activeLibraryCategory === "light"
          ? lampItemTypeSet.has(itemType!)
          : libraryCardVisible(
              assetToolbarEntryButton,
              activeLibraryCategory,
              null,
              librarySearchText,
            ) &&
            // 庭院门是画在平面上的构件，不进模型卡列表（与 0.7.6 的 `libraryCardVisible` 调用点多一层收窄）。
            (activeLibraryCategory !== "courtyard" || !isCourtyardGate2({ type: itemType }));
    assetToolbarEntryButton.hidden = !isAssetCardVisible;
    assetToolbarEntryButton.hidden || (assetMatchCount += 1);
  }
  for (const searchResultRow of assetHeadingCategoryControls)
    if (
      ((searchResultRow.hidden =
        searchResultRow.dataset.assetHeadingCategory !== activeLibraryCategory),
      !searchResultRow.hidden)
    ) {
      let nextElementSibling = searchResultRow.nextElementSibling as StudioControlElement,
        isResultRowHidden = false;
      for (; nextElementSibling && !nextElementSibling.hasAttribute("data-asset-heading-category");)
        (nextElementSibling.hasAttribute("data-item-type") &&
          !nextElementSibling.hidden &&
          (isResultRowHidden = true),
          (nextElementSibling = nextElementSibling.nextElementSibling as StudioControlElement));
      searchResultRow.hidden = !isResultRowHidden;
    }
  assetSearchEmptyElement && (assetSearchEmptyElement.hidden = !librarySearchText || assetMatchCount > 0);
}
function setAssetCategory(assetCategory: any) {
  // 合法大类只在模型库里定义一次：非法值回落 `home`，卡片过滤与按钮态都用收窄后的值。
  const selectedAssetCategory = normalizeLibraryCategory(assetCategory),
    ao7 = getPreviewScopeSelection();
  (hideLightGroupActionMenu(), (appCtx.activeLibraryCategory = selectedAssetCategory));
  for (const assetCategoryButton of assetCategoryButtons) {
    const isActiveAssetCategory =
      assetCategoryButton.dataset.assetCategory === selectedAssetCategory;
    (assetCategoryButton.classList.toggle("active", isActiveAssetCategory),
      assetCategoryButton.setAttribute("aria-pressed", String(isActiveAssetCategory)));
  }
  filterAssetList();
  for (const setAssetCategoryToolButton of toolButtons)
    setAssetCategoryToolButton.disabled =
      selectedAssetCategory === "courtyard" &&
      !courtyardToolAllowed2(setAssetCategoryToolButton.dataset.tool);
  for (const toolControlEntry of [
    "global-wall-height",
    "global-wall-thickness",
    "global-wall-opacity",
    "toggle-floor-edge",
  ]) {
    const elementById = document.getElementById(toolControlEntry) as StudioControlElement | null;
    elementById && (elementById.disabled = selectedAssetCategory === "courtyard");
  }
  ((assetGridElement.hidden = selectedAssetCategory === "light"),
    (lightAssetRowElement.hidden = selectedAssetCategory !== "light"));
  (appCtx.selectedItem && !isSelectionAllowed(appCtx.selectedItem) && refreshSelection(),
    appCtx.selectedItems.length && refreshSelection(),
    selectStudioTool("select"),
    syncLightGroupList(),
    refreshStudioUi(),
    refreshStudioView(),
    ao7 !== getPreviewScopeSelection() && setPreviewScope(ao7));
}
for (const assetCategoryClickButton of assetCategoryButtons)
  assetCategoryClickButton.addEventListener("click", () =>
    setAssetCategory(assetCategoryClickButton.dataset.assetCategory),
  );
(assetSearchInput?.addEventListener("input", filterAssetList),
  assetSearchInput?.addEventListener("search", filterAssetList),
  setAssetCategory("home"),
  addLightGroupButton.addEventListener("click", () => {
    deselectAll();
    const assetCategoryClickButtonLightGroupNameSet = new Set(
      appCtx.studioState.lightGroups.map(
        (lightGroupNameSetExistingLightGroup) => lightGroupNameSetExistingLightGroup.name,
      ),
    );
    let nextLightGroupIndex = appCtx.studioState.lightGroups.length + 1;
    for (; assetCategoryClickButtonLightGroupNameSet.has("灯组 " + nextLightGroupIndex);)
      nextLightGroupIndex += 1;
    const nextLightGroupIndexNewLightGroupRecord = {
      id: generateId("light-group"),
      name: "灯组 " + nextLightGroupIndex,
      enabled: true,
      areaId: null as any,
    };
    (appCtx.studioState.lightGroups.push(nextLightGroupIndexNewLightGroupRecord),
      (appCtx.activeLightGroupId = nextLightGroupIndexNewLightGroupRecord.id),
      syncLightGroupList(),
      refreshStudioUi(),
      markDocumentDirty());
  }),
  lightGroupsOffButton.addEventListener("click", () => setAllLightGroupsEnabled(false)));
for (const lightGroupActionButton of lightGroupActionMenuElement.querySelectorAll(
  "[data-light-group-action]",
))
  lightGroupActionButton.addEventListener("click", () => {
    const selectedLightGroup = appCtx.studioState.lightGroups.find(
        (targetLightGroup) => targetLightGroup.id === appCtx.pendingLightGroupId,
      ),
      lightGroupAction = lightGroupActionButton.dataset.lightGroupAction;
    (hideLightGroupActionMenu(),
      selectedLightGroup &&
        (lightGroupAction === "area"
          ? openLightGroupAreaDialog(selectedLightGroup)
          : lightGroupAction === "rename"
            ? ((appCtx.renamingLightGroupId = selectedLightGroup.id),
              (lightGroupRenameInputElement.value = selectedLightGroup.name),
              lightGroupRenameDialogElement.showModal(),
              requestAnimationFrame(() => lightGroupRenameInputElement.select()))
            : lightGroupAction === "duplicate"
              ? duplicateLightGroup(selectedLightGroup)
              : lightGroupAction === "delete" && deleteLightGroup(selectedLightGroup)));
  });


lightGroupListElement.addEventListener(
  "click",
  (listClickEvent: any) => {
    Date.now() - appCtx.listDragEndedAt < LIST_DRAG_CLICK_SUPPRESS_MS &&
      (listClickEvent.stopPropagation(), listClickEvent.preventDefault());
  },
  true,
);
lightGroupAreaFormElement.addEventListener("submit", (lightGroupAreaSubmitEvent: any) => {
  lightGroupAreaSubmitEvent.preventDefault();

  const assignTargetGroup = (appCtx.studioState.lightGroups || []).find(
    (groupLookupEntry) => groupLookupEntry.id === appCtx.areaAssignGroupId,
  );
  if (assignTargetGroup) {
    const nextAreaId = lightGroupAreaSelectElement.value || null;
    if (nextAreaId === null || isKnownLightAreaId(nextAreaId))
      (assignTargetGroup.areaId || null) !== nextAreaId &&
        (deselectAll(),
        (assignTargetGroup.areaId = nextAreaId),
        nextAreaId && appCtx.expandedAreaIds.add(nextAreaId),
        syncLightGroupList(),
        markDocumentDirty());
  }
  closeLightGroupAreaDialog();
});
selectElement("#light-group-area-close").addEventListener("click", closeLightGroupAreaDialog);
selectElement("#light-group-area-cancel").addEventListener("click", closeLightGroupAreaDialog);
lightGroupAreaDialogElement.addEventListener("cancel", () => {
  appCtx.areaAssignGroupId = "";
});
for (const floorActionButton of floorActionMenuElement.querySelectorAll("[data-floor-action]"))
  floorActionButton.addEventListener("click", () => {
    const floorActionButtonSelectedFloor = appCtx.studioProject.floors.find(
        (selectedFloorTargetFloor: any) => selectedFloorTargetFloor.id === appCtx.pendingFloorMenuId,
      ),
      floorAction = floorActionButton.dataset.floorAction;
    (hideFloorActionMenu(),
      floorActionButtonSelectedFloor &&
        (floorAction === "rename"
          ? openFloorRenameDialog(floorActionButtonSelectedFloor)
          : floorAction === "delete" && floorActionHandler(floorActionButtonSelectedFloor)));
  });
document.addEventListener("pointerdown", (documentPointerDownEvent) => {
  (!lightGroupActionMenuElement.hidden &&
    !lightGroupActionMenuElement.contains(documentPointerDownEvent.target) &&
    hideLightGroupActionMenu(),
    !floorActionMenuElement.hidden &&
      !floorActionMenuElement.contains(documentPointerDownEvent.target) &&
      hideFloorActionMenu(),
    !snapSettingsPanel.hidden &&
      !(documentPointerDownEvent.target as Element).closest(".snap-control") &&
      setSnapSettingsOpen(false),
    !(documentPointerDownEvent.target as Element).closest(".drawing-tool-section") &&
      closeDrawingToolGroups());
});
function closeOpenPopovers() {
  ((appCtx.pendingFloorMenuId = ""), floorRenameDialogElement.close());
}
(selectElement("#floor-rename-close").addEventListener("click", closeOpenPopovers),
  selectElement("#floor-rename-cancel").addEventListener("click", closeOpenPopovers),
  floorRenameDialogElement.addEventListener("cancel", () => {
    appCtx.pendingFloorMenuId = "";
  }),
  floorRenameFormElement.addEventListener("submit", (floorRenameSubmitEvent: any) => {
    floorRenameSubmitEvent.preventDefault();
    const renamedFloor = appCtx.studioProject.floors.find(
      (renameFloorTarget: any) => renameFloorTarget.id === appCtx.pendingFloorMenuId,
    );
    if (!renamedFloor) {
      closeOpenPopovers();
      return;
    }
    const floorRenamePayload = uniqueFloorName(
      normalizeLabelText2(floorRenameInputElement.value, renamedFloor.name, 24),
      renamedFloor.id,
    );
    (floorRenamePayload !== renamedFloor.name &&
      ((renamedFloor.name = floorRenamePayload),
      syncGlobalControls(),
      renderExportLayers(),
      markDocumentDirty(),
      showToast("已重命名为“" + floorRenamePayload + "”。", "success")),
      closeOpenPopovers());
  }),
  selectElement("#floor-delete-close").addEventListener("click", closeFloorDeleteDialog),
  selectElement("#floor-delete-cancel").addEventListener("click", closeFloorDeleteDialog),
  floorDeleteDialogElement.addEventListener("cancel", (floorRenameCancelEvent: any) => {
    (floorRenameCancelEvent.preventDefault(), closeFloorDeleteDialog());
  }),
  floorDeleteFormElement.addEventListener("submit", (lightGroupRenameSubmitEvent: any) => {
    (lightGroupRenameSubmitEvent.preventDefault(), confirmFloorDelete());
  }));
function applyLightGroupRename() {
  ((appCtx.renamingLightGroupId = ""), lightGroupRenameDialogElement.close());
}
(selectElement("#light-group-rename-close").addEventListener("click", applyLightGroupRename),
  selectElement("#light-group-rename-cancel").addEventListener("click", applyLightGroupRename),
  lightGroupRenameDialogElement.addEventListener("cancel", () => {
    appCtx.renamingLightGroupId = "";
  }),
  lightGroupRenameFormElement.addEventListener("submit", (lightGroupCreateSubmitEvent: any) => {
    lightGroupCreateSubmitEvent.preventDefault();
    const createdLightGroup = appCtx.studioState.lightGroups.find(
      (createLightGroupTarget) => createLightGroupTarget.id === appCtx.renamingLightGroupId,
    );
    if (!createdLightGroup) {
      applyLightGroupRename();
      return;
    }
    const normalizedLightGroupName = normalizeLabelText2(
      lightGroupRenameInputElement.value,
      createdLightGroup.name,
      24,
    );
    (normalizedLightGroupName !== createdLightGroup.name &&
      (deselectAll(),
      (createdLightGroup.name = normalizedLightGroupName),
      refreshScopeItems("none"),
      markDocumentDirty()),
      applyLightGroupRename());
  }));
function createLightGroup() {
  ((appCtx.pendingLightPropertyApply = null), lightPropertyApplyDialogElement.close());
}
function collectLightTargetInputs(lightTargetRoot = lightPropertyTargetListElement) {
  return [...lightTargetRoot.querySelectorAll("[data-light-target-item-id]")];
}
function syncLightTargetGroups() {
  const ys2 = collectLightTargetInputs(),
    checkedGroupToggleCount = ys2.filter(
      (lightGroupToggleInput) => lightGroupToggleInput.checked,
    ).length;
  ((lightPropertySelectionCountElement.textContent =
    checkedGroupToggleCount + "/" + ys2.length + " 灯"),
    (lightPropertyToggleAllButton.disabled = !ys2.length),
    (lightPropertyToggleAllButton.textContent =
      ys2.length && checkedGroupToggleCount === ys2.length ? "取消全选" : "全选"));
  for (const lightTargetGroupRow of lightPropertyTargetListElement.querySelectorAll(
    "[data-light-target-group-id]",
  )) {
    const ys3 = collectLightTargetInputs(lightTargetGroupRow),
      checkedTargetToggleCount = ys3.filter(
        (lightTargetToggleInput) => lightTargetToggleInput.checked,
      ).length;
    ((lightTargetGroupRow.querySelector("[data-light-target-group-count]").textContent =
      checkedTargetToggleCount + "/" + ys3.length + " 灯"),
      (lightTargetGroupRow.querySelector("[data-light-target-group-toggle]").textContent =
        ys3.length && checkedTargetToggleCount === ys3.length ? "取消全选" : "全选"));
  }
}
function buildLightGroupList(listedLightGroup: any) {
  lightPropertyTargetListElement.replaceChildren();
  let lightGroupListIndex = 0;
  for (const listedGroup of appCtx.studioState.lightGroups) {
    const lightGroupItems = appCtx.studioState.items.filter(
      (lightGroupItem) =>
        lampItemTypeSet.has(lightGroupItem.type) && lightGroupItem.lightGroupId === listedGroup.id,
    );
    if (!lightGroupItems.length) continue;
    lightGroupListIndex += lightGroupItems.length;
    const lightGroupSection = document.createElement("section");
    ((lightGroupSection.className = "light-property-target-group"),
      (lightGroupSection.dataset.lightTargetGroupId = listedGroup.id));
    const lightGroupHeader = document.createElement("header"),
      lightGroupHeading = document.createElement("strong");
    lightGroupHeading.textContent = listedGroup.name;
    const lightGroupCountBadge = document.createElement("span");
    lightGroupCountBadge.dataset.lightTargetGroupCount = "";
    const lightTargetToggleButton = document.createElement("button");
    ((lightTargetToggleButton.type = "button"),
      (lightTargetToggleButton.dataset.lightTargetGroupToggle = ""),
      (lightTargetToggleButton.textContent = "取消全选"),
      lightGroupHeader.append(lightGroupHeading, lightGroupCountBadge, lightTargetToggleButton));
    const lightTargetListContainer = document.createElement("div");
    lightTargetListContainer.className = "light-property-target-grid";
    const lightItemCountsByType = new Map();
    for (const countedLightItem of lightGroupItems)
      lightItemCountsByType.set(
        countedLightItem.type,
        (lightItemCountsByType.get(countedLightItem.type) || 0) + 1,
      );
    const lightItemIndexByType = new Map();
    for (const indexedLightItem of lightGroupItems) {
      const downlight6 = (itemTypeCatalog as any)[indexedLightItem.type] || itemTypeCatalog.downlight,
        lightItemTypeIndex = (lightItemIndexByType.get(indexedLightItem.type) || 0) + 1;
      lightItemIndexByType.set(indexedLightItem.type, lightItemTypeIndex);
      const lightTargetLabel = document.createElement("label");
      lightTargetLabel.className = "light-property-target-item";
      const lightTargetCheckbox = document.createElement("input");
      ((lightTargetCheckbox.type = "checkbox"),
        (lightTargetCheckbox.checked = true),
        (lightTargetCheckbox.dataset.lightTargetItemId = indexedLightItem.id));
      const lightTargetNameLabel = document.createElement("span"),
        lightTargetItemTitle = document.createElement("strong");
      lightTargetItemTitle.textContent =
        lightItemCountsByType.get(indexedLightItem.type) > 1
          ? downlight6.name + " " + lightItemTypeIndex
          : downlight6.name;
      const lightTargetDetailNote = document.createElement("small"),
        kd3 = normalizeLightPropertyValue(
          listedLightGroup,
          indexedLightItem[listedLightGroup],
          indexedLightItem.type,
        );
      ((lightTargetDetailNote.textContent =
        (indexedLightItem.id === appCtx.selectedItem?.id ? "当前灯 · " : "") +
        "当前 " +
        formatLightPropertyValue(listedLightGroup, kd3)),
        lightTargetNameLabel.append(lightTargetItemTitle, lightTargetDetailNote),
        lightTargetLabel.append(lightTargetCheckbox, lightTargetNameLabel),
        lightTargetListContainer.append(lightTargetLabel));
    }
    (lightGroupSection.append(lightGroupHeader, lightTargetListContainer),
      lightPropertyTargetListElement.append(lightGroupSection));
  }
  if (!lightGroupListIndex) {
    const lightGroupEmptyMessage = document.createElement("p");
    ((lightGroupEmptyMessage.className = "light-property-target-empty"),
      (lightGroupEmptyMessage.textContent = "当前没有可应用的灯具。"),
      lightPropertyTargetListElement.append(lightGroupEmptyMessage));
  }
  syncLightTargetGroups();
}
for (const lightTargetToggleRow of applyLightPropertyControls)
  lightTargetToggleRow.addEventListener("click", () => {
    const lightTargetPlacedElement = getSelectedObject(),
      applyLightProperty = lightTargetToggleRow.dataset.applyLightProperty,
      lightPropertyBinding = (lightPropertyFields as any)[applyLightProperty!];
    if (
      !lightTargetPlacedElement ||
      appCtx.selectedItem?.kind !== "item" ||
      !lampItemTypeSet.has(lightTargetPlacedElement.type) ||
      !lightPropertyBinding
    )
      return;
    const kd4 = normalizeLightPropertyValue(
      applyLightProperty,
      selectElement(lightPropertyBinding.input).value,
      lightTargetPlacedElement.type,
    );
    ((appCtx.pendingLightPropertyApply = {
      property: applyLightProperty,
      label: lightPropertyBinding.label,
      value: kd4,
    }),
      (lightPropertyApplyTitleElement.textContent = "应用" + lightPropertyBinding.label),
      (lightPropertyApplyValueElement.textContent = formatLightPropertyValue(
        applyLightProperty,
        kd4,
      )),
      buildLightGroupList(applyLightProperty),
      lightPropertyApplyDialogElement.showModal(),
      requestAnimationFrame(() => lightPropertyToggleAllButton.focus()));
  });
(lightPropertyToggleAllButton.addEventListener("click", () => {
  const ys4 = collectLightTargetInputs(),
    shouldCheckAllTargets =
      !ys4.length || !ys4.every((partialToggleInput) => partialToggleInput.checked);
  for (const synchronizedToggleInput of ys4)
    synchronizedToggleInput.checked = shouldCheckAllTargets;
  syncLightTargetGroups();
}),
  lightPropertyTargetListElement.addEventListener("click", (lightTargetClickEvent: any) => {
    const closest = lightTargetClickEvent.target.closest("[data-light-target-group-toggle]");
    if (!closest) return;
    const closestLightTargetRow = closest.closest("[data-light-target-group-id]"),
      ys5 = collectLightTargetInputs(closestLightTargetRow),
      isAllTargetsChecked = !ys5.every((allTargetsInput) => allTargetsInput.checked);
    for (const bulkToggleInput of ys5) bulkToggleInput.checked = isAllTargetsChecked;
    syncLightTargetGroups();
  }),
  lightPropertyTargetListElement.addEventListener("change", syncLightTargetGroups),
  selectElement("#light-property-apply-close").addEventListener("click", createLightGroup),
  selectElement("#light-property-apply-cancel").addEventListener("click", createLightGroup),
  lightPropertyApplyDialogElement.addEventListener("cancel", () => {
    appCtx.pendingLightPropertyApply = null;
  }),
  lightPropertyApplyFormElement.addEventListener("submit", (lightTargetSubmitEvent: any) => {
    if ((lightTargetSubmitEvent.preventDefault(), !appCtx.pendingLightPropertyApply)) {
      createLightGroup();
      return;
    }
    const { property: Oi2, label: Oi3, value: Oi4 } = appCtx.pendingLightPropertyApply,
      lightTargetItemIdSet = new Set(
        collectLightTargetInputs()
          .filter((checkedTargetInput) => checkedTargetInput.checked)
          .map((targetItemInput) => targetItemInput.dataset.lightTargetItemId),
      ),
      lightTargetItems = appCtx.studioState.items.filter(
        (lightTargetItem) =>
          lampItemTypeSet.has(lightTargetItem.type) && lightTargetItemIdSet.has(lightTargetItem.id),
      );
    if (!lightTargetItems.length) {
      showToast("请至少选择一盏灯。", "error");
      return;
    }
    const lightTargetChanges = lightTargetItems
      .map((lightTargetChangeItem) => ({
        item: lightTargetChangeItem,
        value: normalizeLightPropertyValue(Oi2, Oi4, lightTargetChangeItem.type),
      }))
      .filter(
        (lightTargetChange) =>
          Math.abs(finite2(lightTargetChange.item[Oi2]) - lightTargetChange.value) > 0.000001,
      );
    if (lightTargetChanges.length) {
      deselectAll();
      for (const appliedLightTargetChange of lightTargetChanges)
        appliedLightTargetChange.item[Oi2] = appliedLightTargetChange.value;
      (refreshScopeItems("lights"), markDocumentDirty());
    }
    (createLightGroup(),
      showToast("已将" + Oi3 + "应用到 " + lightTargetItems.length + " 盏灯。", "success"));
  }),
  selectElement("#courtyard-gate-style").addEventListener("change", () => {
    const gatePlacedElement = getSelectedObject(),
      courtyardGateStyle = selectElement("#courtyard-gate-style").value;
    !isCourtyardGate2(gatePlacedElement) ||
      !isCourtyardGate2({
        type: courtyardGateStyle,
      }) ||
      (deselectAll(),
      (gatePlacedElement.type = courtyardGateStyle),
      (gardenGateItemType = courtyardGateStyle),
      refreshScopeItems(resolvePreviewScope(gatePlacedElement)),
      markDocumentDirty());
  }));
for (const assetToolbarDragButton of itemTypeButtons)
  (assetToolbarDragButton.addEventListener("dragstart", (assetDragStartEvent) => {
    ((assetDragStartEvent.dataTransfer!.effectAllowed = "copy"),
      assetDragStartEvent.dataTransfer!.setData(
        "application/x-homeos-item",
        assetToolbarDragButton.dataset.itemType!,
      ));
  }),
    assetToolbarDragButton.addEventListener("click", () => {
      if (
        isCourtyardGate2({
          type: assetToolbarDragButton.dataset.itemType,
        })
      ) {
        ((gardenGateItemType = assetToolbarDragButton.dataset.itemType!),
          selectStudioTool("courtyard-gate"));
        return;
      }
      const pr5 = screenToPlan({
        x: appCtx.planViewWidth / 2,
        y: appCtx.planViewHeight / 2,
      });
      createSceneItem(assetToolbarDragButton.dataset.itemType, pr5);
    }));
(planStageElement.addEventListener("dragenter", (assetDragEnterEvent: any) => {
  [...assetDragEnterEvent.dataTransfer.types].includes("application/x-homeos-item") &&
    planStageElement.classList.add("dragging-item");
}),
  planStageElement.addEventListener("dragover", (assetDragOverEvent: any) => {
    [...assetDragOverEvent.dataTransfer.types].includes("application/x-homeos-item") &&
      (assetDragOverEvent.preventDefault(),
      (assetDragOverEvent.dataTransfer.dropEffect = "copy"),
      planStageElement.classList.add("dragging-item"));
  }),
  planStageElement.addEventListener("dragleave", (assetDragLeaveEvent: any) => {
    planStageElement.contains(assetDragLeaveEvent.relatedTarget) ||
      planStageElement.classList.remove("dragging-item");
  }),
  planStageElement.addEventListener("drop", (assetDropEvent: any) => {
    (assetDropEvent.preventDefault(), planStageElement.classList.remove("dragging-item"));
    const data = assetDropEvent.dataTransfer.getData("application/x-homeos-item");
    data && createSceneItem(data, screenToPlan(eventToLocalPoint(assetDropEvent)));
  }),
  (planPainter = createCourtyardDrawingEditor2({
    canvas: planCanvasElement,
    toolbar: document.querySelector(".plan-toolbar"),
    inspector: selectionInspectorElement,
    scene: () => appCtx.studioState,
    selected: () => (appCtx.selectedItem?.kind === "item" ? getSelectedObject() : null),
    point: (pointerPlanPoint: any) => screenToPlan(eventToLocalPoint(pointerPlanPoint)),
    screen: planToScreen,
    ppm: () => getPixelsPerMeter() || 100,
    zoom: () => appCtx.planView.zoom,
    feedback: (toolFeedback: any) => {
      ((snapIndicatorElement.textContent = toolFeedback?.kind
        ? "吸附：" + toolFeedback.label
        : isSnapEnabled()
          ? "吸附：自由"
          : "吸附：关闭"),
        toolFeedback?.point &&
          (cursorPositionElement.textContent =
            "X " +
            (toolFeedback.point.x / (getPixelsPerMeter() || 100)).toFixed(2) +
            " m · Y " +
            (toolFeedback.point.y / (getPixelsPerMeter() || 100)).toFixed(2) +
            " m"));
    },
    snap: axisLockedDistance,
    snapping: isSnapEnabled,
    calibrated: ensureCalibrationReady,
    panning: () => appCtx.isMiddleButtonPanning,
    planColor: (courtyardPlanColor: any) => courtyardPlanColor2(courtyardPlanColor, itemTypeCatalog),
    buildings: () =>
      buildingFootprints2(
        appCtx.studioState.walls,
        closedWallLoops(getPixelsPerMeter()),
        getPixelsPerMeter(),
      ),
    clone: captureUndoSnapshot,
    snapshot: deselectAll,
    push: applyPlacementChange,
    changed: markDocumentDirty,
    refresh: () => refreshScopeItems(getDefaultSelectionScope()),
    draw: refreshStudioView,
    interactionEnded: handleInteractionEnded,
    select: (selectedToolItem: any) => selectSceneObject("item", selectedToolItem),
    isSelected: (toolSelectionItem: any) => createSelectionRef("item", toolSelectionItem),
    id: () => generateId("courtyard"),
    setTool: selectStudioTool,
    toast: showToast,
  })),
  planCanvasElement.addEventListener("pointerdown", handlePointerDown),
  planCanvasElement.addEventListener("pointermove", handlePointerMove),
  planCanvasElement.addEventListener("pointerup", handlePointerRelease),
  planCanvasElement.addEventListener("pointercancel", handlePointerRelease),
  planCanvasElement.addEventListener("contextmenu", (canvasMenuEvent: any) =>
    canvasMenuEvent.preventDefault(),
  ),
  planCanvasElement.addEventListener(
    "wheel",
    (canvasPointerEvent: any) => {
      (canvasPointerEvent.preventDefault(), handleCanvasWheel(canvasPointerEvent));
    },
    {
      passive: false,
    },
  ),
  selectElement("#fit-view").addEventListener("click", resetView),
  selectElement("#rotate-plan-view").addEventListener("click", rotatePlanView),
  selectElement("#zoom-in").addEventListener("click", () => zoomByScale(1.18)),
  selectElement("#zoom-out").addEventListener("click", () => zoomByScale(1 / 1.18)),
  selectElement("#reset-camera").addEventListener("click", updateCameraView),
  saveCameraViewButton.addEventListener("click", saveCameraView),
  fixedCameraViewButton.addEventListener("click", applyCameraSnapshot),
  saveOverviewViewButton.addEventListener("click", saveCameraView),
  fixedOverviewViewButton.addEventListener("click", applyCameraSnapshot),
  exportSaveViewButton.addEventListener("click", saveCameraView),
  selectElement("#open-export").addEventListener("click", openExportPanel),
  selectElement("#export-close").addEventListener("click", () => {
    appCtx.isInteractionLocked || exportDialogElement.close();
  }),
  exportDialogElement.addEventListener("cancel", (exportDialogCancelEvent: any) => {
    (exportDialogCancelEvent.preventDefault(), appCtx.isInteractionLocked || exportDialogElement.close());
  }),
  exportDialogElement.addEventListener("close", restorePreviewAfterExport),
  selectElement("#export-overwrite-close").addEventListener("click", () =>
    resolveOverwriteChoice("cancel"),
  ),
  selectElement("#export-overwrite-cancel").addEventListener("click", () =>
    resolveOverwriteChoice("cancel"),
  ),
  selectElement("#export-overwrite-rename").addEventListener("click", () =>
    resolveOverwriteChoice("rename"),
  ),
  selectElement("#export-overwrite-confirm").addEventListener("click", () =>
    resolveOverwriteChoice("overwrite"),
  ),
  exportOverwriteDialogElement.addEventListener("cancel", (overwriteDialogCancelEvent: any) => {
    (overwriteDialogCancelEvent.preventDefault(), resolveOverwriteChoice("cancel"));
  }));
const closeExportCompleteDialog = () => {
  exportCompleteDialogElement.open && exportCompleteDialogElement.close();
};
(selectElement("#export-complete-close").addEventListener("click", closeExportCompleteDialog),
  selectElement("#export-complete-confirm").addEventListener("click", closeExportCompleteDialog),
  exportPresetSlotsElement.addEventListener("click", (presetSlotClickEvent: any) => {
    const closestPresetSlotButton = presetSlotClickEvent.target.closest(
      "[data-export-preset-slot]",
    );
    closestPresetSlotButton &&
      selectExportPresetSlot(Number(closestPresetSlotButton.dataset.exportPresetSlot));
  }),
  exportPresetAddButton.addEventListener("click", saveAsNewPreset),
  exportPresetRenameButton.addEventListener("click", openPresetRenameDialog),
  exportPresetDeleteButton.addEventListener("click", openPresetDeleteDialog),
  selectElement("#export-preset-rename-close").addEventListener("click", closePresetRenameDialog),
  selectElement("#export-preset-rename-cancel").addEventListener("click", closePresetRenameDialog),
  exportPresetRenameDialogElement.addEventListener("cancel", (presetRenameDialogCancelEvent: any) => {
    (presetRenameDialogCancelEvent.preventDefault(), closePresetRenameDialog());
  }),
  exportPresetRenameFormElement.addEventListener("submit", (presetRenameSubmitEvent: any) => {
    presetRenameSubmitEvent.preventDefault();
    const presetRenameSubmitEventExportPresetSlots = normalizeExportPresetSlots2(
        appCtx.studioProject?.exportPresets,
      ),
      activePresetSlotIndex = normalizeActiveExportPresetSlot2(
        appCtx.studioProject?.activeExportPresetSlot,
        presetRenameSubmitEventExportPresetSlots.length,
      ),
      activePresetSlotIndexActivePresetSlot =
        presetRenameSubmitEventExportPresetSlots[activePresetSlotIndex];
    if (!activePresetSlotIndexActivePresetSlot) {
      closePresetRenameDialog();
      return;
    }
    const ja7 = formatPresetLabel(activePresetSlotIndexActivePresetSlot, activePresetSlotIndex),
      hf3 = makeUniquePresetName(exportPresetRenameInputElement.value, activePresetSlotIndex);
    ((activePresetSlotIndexActivePresetSlot.name = hf3),
      (appCtx.studioProject.exportPresets = presetRenameSubmitEventExportPresetSlots),
      closePresetRenameDialog(),
      renderExportPresetSlots(),
      markDocumentDirty(),
      hf3 !== ja7 && showToast("已重命名为“" + hf3 + "”。", "success"));
  }),
  selectElement("#export-preset-delete-close").addEventListener("click", closePresetDeleteDialog),
  selectElement("#export-preset-delete-cancel").addEventListener("click", closePresetDeleteDialog),
  exportPresetDeleteDialogElement.addEventListener("cancel", (presetDeleteDialogCancelEvent: any) => {
    (presetDeleteDialogCancelEvent.preventDefault(), closePresetDeleteDialog());
  }),
  exportPresetDeleteFormElement.addEventListener("submit", (exportDeleteSubmitEvent: any) => {
    (exportDeleteSubmitEvent.preventDefault(), confirmDeletePreset());
  }),
  exportDialogElement.addEventListener("input", (exportDialogInputEvent: any) => {
    exportDialogInputEvent.target?.closest?.("#export-preset-slots") || syncExportControls();
  }),
  exportDialogElement.addEventListener("change", (exportDialogChangeEvent: any) => {
    exportDialogChangeEvent.target?.closest?.("#export-preset-slots") || syncExportControls();
  }),
  exportDialogElement.addEventListener("click", (exportDialogClickEvent: any) => {
    exportDialogClickEvent.target?.closest?.(
      "[data-camera-view], [data-camera-mode], [data-camera-rotate-top]",
    ) && syncExportControls();
  }),
  exportWidthInput.addEventListener("input", () => handleCanvasSizeInput("width")),
  exportHeightInput.addEventListener("input", () => handleCanvasSizeInput("height")),
  exportWidthInput.addEventListener("change", () => handleCanvasSizeInput("width", true)),
  exportHeightInput.addEventListener("change", () => handleCanvasSizeInput("height", true)),
  exportLockRatioInput.addEventListener("change", () => {
    const { width: viewportPixelWidth, height: viewportPixelHeight } =
      stateViewportAspectGetCanvasSize();
    (exportLockRatioInput.checked && (appCtx.exportAspectRatio = viewportPixelWidth / viewportPixelHeight),
      refreshCanvasSizeUi());
  }),
  selectElement("#export-use-fixed").addEventListener("click", openExportDialog),
  exportFloorSelectElement.addEventListener("change", () =>
    selectPreviewFloor(exportFloorSelectElement.value),
  ),
  exportPackageButton.addEventListener("click", generateExportBundle));
function postBridgeState(bridgeStateName = "ready") {
  !isAutoDiagramEmbed ||
    !autoDiagramComponentId ||
    window.parent === window ||
    !appCtx.studioProject ||
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-base-lighting-state",
        componentId: autoDiagramComponentId,
        status: bridgeStateName,
        lighting: normalizeBaseLighting2(appCtx.baseLightingSettings),
        savedLighting: normalizeBaseLighting2(appCtx.studioProject.baseLighting),
        defaults: normalizeBaseLighting2(DEFAULT_BASE_LIGHTING2),
      },
      window.location.origin,
    );
}
function postBridgeFloors() {
  !isAutoDiagramEmbed ||
    !autoDiagramComponentId ||
    window.parent === window ||
    !appCtx.studioProject ||
    window.parent.postMessage(
      {
        type: "homeos-floorplan-auto-diagram-floor-state",
        componentId: autoDiagramComponentId,
        floors: appCtx.studioProject.floors.map((bridgeFloorEntry: any) => ({
          id: bridgeFloorEntry.id,
          name: bridgeFloorEntry.name,
        })),
        floorSelection:
          getPreviewFloorMode() === "all" ? "all" : getActiveFloor()?.id || appCtx.activeFloorId,
      },
      window.location.origin,
    );
}
window.addEventListener("message", (bridgeMessageEvent) => {
  if (
    !isAutoDiagramEmbed ||
    bridgeMessageEvent.origin !== window.location.origin ||
    bridgeMessageEvent.source !== window.parent
  )
    return;
  const data2 = bridgeMessageEvent.data;
  if (!(!data2 || data2.componentId !== autoDiagramComponentId)) {
    if (data2.type === "homeos-floorplan-auto-diagram-floor") {
      if (data2.command === "set-floor") {
        const bridgeFloorRecord = appCtx.studioProject.floors.find(
            (bridgeFloor: any) => bridgeFloor.id === data2.value,
          ),
          bridgeFloorId =
            data2.value === "all" && appCtx.studioProject.floors.length > 1
              ? "all"
              : bridgeFloorRecord?.id || getActiveFloor()?.id || appCtx.activeFloorId;
        (selectPreviewFloor(bridgeFloorId), postBridgeFloors());
      }
      return;
    }
    if (data2.type === "homeos-floorplan-auto-diagram-base-lighting") {
      data2.command === "request-state"
        ? ((baseLightControlsElement.hidden = true),
          applyBaseLighting(appCtx.studioProject.baseLighting),
          postBridgeState("ready"))
        : data2.command === "preview"
          ? ((baseLightControlsElement.hidden = true),
            applyBaseLighting(data2.lighting),
            postBridgeState("preview"))
          : data2.command === "reset"
            ? ((baseLightControlsElement.hidden = true),
              applyBaseLighting(DEFAULT_BASE_LIGHTING2),
              postBridgeState("preview"))
            : data2.command === "save"
              ? ((baseLightControlsElement.hidden = true),
                applyBaseLighting(data2.lighting),
                confirmLightingDialog(),
                postBridgeState("saved"))
              : data2.command === "cancel" || data2.command === "close"
                ? (openLightingDialog(), postBridgeState("cancelled"))
                : saveBaseLightingEdit();
      return;
    }
    if (data2.type === "homeos-floorplan-auto-diagram-camera") {
      const ut6 = cameraSettings();
      if (data2.command === "restore") {
        const bridgeCameraState = data2.value || {};
        ((ut6.cameraMode =
          bridgeCameraState.mode === "perspective" ? "perspective" : "orthographic"),
          (ut6.cameraView = bridgeCameraState.view === "top" ? "top" : "free"),
          (ut6.cameraTopRotation =
            (((Math.round(finite2(bridgeCameraState.topRotation, 0) / 90) * 90) % 360) + 360) %
            360),
          (ut6.cameraFocalLength = clamp2(finite2(bridgeCameraState.focalLength, 50), 18, 120)),
          bridgeCameraState.snapshot
            ? applyCameraState(
                bridgeCameraState.snapshot,
                bridgeCameraState.snapshot.viewportAspect,
              )
            : (setCameraMode(ut6.cameraMode, {
                preserveView: true,
              }),
              setCameraView(ut6.cameraView, {
                force: true,
              }),
              applyCameraFocalLength()));
      } else
        data2.command === "set-view"
          ? ((ut6.cameraView = data2.value === "top" ? "top" : "free"),
            setCameraView(ut6.cameraView))
          : data2.command === "set-mode"
            ? ((ut6.cameraMode = data2.value === "perspective" ? "perspective" : "orthographic"),
              setCameraMode(ut6.cameraMode))
            : data2.command === "rotate-top"
              ? ((ut6.cameraView = "top"),
                (ut6.cameraTopRotation = (getCameraTopRotation() + 90) % 360),
                setCameraView("top", {
                  force: true,
                }))
              : data2.command === "set-focal-length" &&
                ((ut6.cameraFocalLength = clamp2(
                  finite2(data2.value, getCameraFocalLength()),
                  18,
                  120,
                )),
                applyCameraFocalLength());
      refreshSceneRender();
      return;
    }
    if (data2.type === "homeos-floorplan-auto-diagram-generate" && !appCtx.isInteractionLocked) {
      for (const bridgeCameraStateExportFileCheckbox of exportDialogElement.querySelectorAll(
        "input[data-export-file]",
      ))
        bridgeCameraStateExportFileCheckbox.checked = true;
      ((exportFolderNameInput.value = String(data2.folderName || "").trim()),
        (exportWidthInput.value = String(
          Math.round(clamp2(finite2(data2.width, exportWidthInput.value), 320, 4096)),
        )),
        (exportHeightInput.value = String(
          Math.round(clamp2(finite2(data2.height, exportHeightInput.value), 320, 4096)),
        )),
        (exportLockRatioInput.checked = true),
        refreshCanvasSizeUi(),
        generateExportBundle());
    }
  }
});
for (const previewSyncMenuRow of previewSyncControls)
  previewSyncMenuRow.addEventListener("click", () => {
    const isPreviewSyncEnabled = previewSyncMenuRow.dataset.previewSync !== "manual";
    isPreviewSyncEnabled !== getPreviewSyncMode() &&
      (deselectAll(),
      (appCtx.studioState.settings.livePreviewEnabled = isPreviewSyncEnabled),
      markDocumentDirty(),
      refreshPreviewSync(),
      isPreviewSyncEnabled
        ? requestSceneRebuild({
            force: true,
          })
        : discardLightingEdit());
  });
(refreshPreviewButton.addEventListener("click", () =>
  requestSceneRebuild({
    force: true,
  }),
),
  refreshLightPreviewButton?.addEventListener("click", discardLightingEdit),
  detailsResizerElement.addEventListener("pointerdown", (panelPointerDownEvent: any) => {
    panelPointerDownEvent.button === 0 &&
      ((appCtx.dragStart = {
        pointerId: panelPointerDownEvent.pointerId,
        startX: panelPointerDownEvent.clientX,
        startY: panelPointerDownEvent.clientY,
        startPreviewRatio: appCtx.studioState.settings.previewPanelRatio,
        startWidthRatio: appCtx.studioState.settings.detailsPanelWidthRatio,
      }),
      detailsPanelElement.classList.add("resizing"),
      studioShellElement.classList.add("resizing"),
      (detailsResizerElement.dataset.resizeAxis = "pending"),
      detailsResizerElement.setPointerCapture(panelPointerDownEvent.pointerId));
  }),
  detailsResizerElement.addEventListener("pointermove", (panelPointerMoveEvent: any) => {
    if (appCtx.dragStart?.pointerId === panelPointerMoveEvent.pointerId) {
      if ((panelPointerMoveEvent.buttons & 1) === 0) {
        finishPanelResize(panelPointerMoveEvent);
        return;
      }
      applySnapTolerance(panelPointerMoveEvent);
    }
  }));
const finishPanelResize = (panelPointerUpEvent: any = null, shouldPersistPanelSize = true) => {
  if (
    !appCtx.dragStart ||
    (panelPointerUpEvent?.pointerId !== undefined &&
      appCtx.dragStart.pointerId !== panelPointerUpEvent.pointerId)
  )
    return;
  const qn4 = appCtx.dragStart;
  appCtx.dragStart = null;
  const didPanelSizeChange =
    Math.abs(appCtx.studioState.settings.previewPanelRatio - qn4.startPreviewRatio) > 0.0001 ||
    Math.abs(appCtx.studioState.settings.detailsPanelWidthRatio - qn4.startWidthRatio) > 0.0001;
  if (
    (detailsPanelElement.classList.remove("resizing"),
    studioShellElement.classList.remove("resizing"),
    delete detailsResizerElement.dataset.resizeAxis,
    shouldPersistPanelSize)
  )
    try {
      detailsResizerElement.hasPointerCapture(qn4.pointerId) &&
        detailsResizerElement.releasePointerCapture(qn4.pointerId);
    } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
  didPanelSizeChange && markDocumentDirty();
};
(detailsResizerElement.addEventListener("pointerup", finishPanelResize),
  detailsResizerElement.addEventListener("pointercancel", finishPanelResize),
  detailsResizerElement.addEventListener("lostpointercapture", (panelLostCaptureEvent: any) =>
    finishPanelResize(panelLostCaptureEvent, false),
  ),
  window.addEventListener("pointerup", finishPanelResize, true),
  window.addEventListener("pointercancel", finishPanelResize, true),
  window.addEventListener("blur", () => finishPanelResize()),
  detailsResizerElement.addEventListener("keydown", (panelKeyDownEvent: any) => {
    const panelVerticalDelta =
        panelKeyDownEvent.key === "ArrowUp"
          ? -0.03
          : panelKeyDownEvent.key === "ArrowDown"
            ? 0.03
            : 0,
      panelHorizontalDelta =
        panelKeyDownEvent.key === "ArrowLeft"
          ? 0.03
          : panelKeyDownEvent.key === "ArrowRight"
            ? -0.03
            : 0;
    if (!panelVerticalDelta && !panelHorizontalDelta) return;
    panelKeyDownEvent.preventDefault();
    const yl6 = getPanelRatioLimits();
    ((appCtx.studioState.settings.previewPanelRatio = clamp2(
      appCtx.studioState.settings.previewPanelRatio + panelVerticalDelta,
      yl6.minimumHeightRatio,
      yl6.maximumHeightRatio,
    )),
      (appCtx.studioState.settings.detailsPanelWidthRatio = clamp2(
        appCtx.studioState.settings.detailsPanelWidthRatio + panelHorizontalDelta,
        yl6.minimumWidthRatio,
        yl6.maximumWidthRatio,
      )),
      applyPanelRatios(),
      applyDetailsRatio(),
      markDocumentDirty());
  }));
for (const cameraModeOptionRow of cameraModeControls)
  cameraModeOptionRow.addEventListener("click", () => {
    const cameraProjectionMode =
      cameraModeOptionRow.dataset.cameraMode === "perspective" ? "perspective" : "orthographic";
    cameraProjectionMode !== getCameraMode() &&
      (appCtx.pendingRuntimeSettings || deselectAll(),
      (cameraSettings().cameraMode = cameraProjectionMode),
      setCameraMode(cameraProjectionMode),
      appCtx.pendingRuntimeSettings
        ? (exportStatusElement.textContent =
            cameraProjectionMode === "perspective" ? "已切换为透视构图" : "已切换为正交构图")
        : markDocumentDirty());
  });
for (const cameraViewOptionRow of cameraViewControls)
  cameraViewOptionRow.addEventListener("click", () => {
    const cameraViewDirection = cameraViewOptionRow.dataset.cameraView === "top" ? "top" : "free";
    cameraViewDirection !== getCameraView() &&
      (appCtx.pendingRuntimeSettings || deselectAll(),
      (cameraSettings().cameraView = cameraViewDirection),
      setCameraView(cameraViewDirection),
      appCtx.pendingRuntimeSettings
        ? (exportStatusElement.textContent =
            cameraViewDirection === "top" ? "已切换为顶视构图" : "已切换为自由构图")
        : markDocumentDirty());
  });
for (const cameraPresetButton of cameraRotateTopControls)
  cameraPresetButton.addEventListener("click", () => {
    getCameraView() === "top" &&
      (appCtx.pendingRuntimeSettings || deselectAll(),
      (cameraSettings().cameraTopRotation = (getCameraTopRotation() + 90) % 360),
      setCameraView("top", {
        force: true,
      }),
      appCtx.pendingRuntimeSettings
        ? (exportStatusElement.textContent = "顶视已旋转 " + getCameraTopRotation() + "°")
        : markDocumentDirty());
  });
for (const cameraPresetButtonFocalLengthInput of cameraFocalLengthControls)
  cameraPresetButtonFocalLengthInput.addEventListener("change", () => {
    const clampedFocalLength = clamp2(
      finite2(cameraPresetButtonFocalLengthInput.value, getCameraFocalLength()),
      18,
      120,
    );
    for (const focalLengthInputField of cameraFocalLengthControls)
      focalLengthInputField.value = String(Math.round(clampedFocalLength));
    Math.abs(clampedFocalLength - getCameraFocalLength()) < 1e-8 ||
      (appCtx.pendingRuntimeSettings || deselectAll(),
      (cameraSettings().cameraFocalLength = clampedFocalLength),
      applyCameraFocalLength(),
      appCtx.pendingRuntimeSettings
        ? (exportStatusElement.textContent = "焦段已设为 " + Math.round(clampedFocalLength) + " mm")
        : markDocumentDirty());
  });
for (const resetCameraButton of baseLightControlInputs)
  (resetCameraButton.addEventListener("input", () =>
    updateBaseLightingFromInput(resetCameraButton),
  ),
    resetCameraButton.addEventListener("change", () => {
      (updateBaseLightingFromInput(resetCameraButton), syncBaseLightingControls());
    }));
for (const cameraActionButton of openBaseLightingButtons)
  cameraActionButton.addEventListener("click", saveBaseLightingEdit);
(closeBaseLightingButton?.addEventListener("click", openLightingDialog),
  saveBaseLightingButton?.addEventListener("click", confirmLightingDialog),
  resetBaseLightingButton?.addEventListener("click", () => {
    applyBaseLighting(DEFAULT_BASE_LIGHTING2);
  }),
  baseLightHeaderElement?.addEventListener("pointerdown", (viewportPointerDownEvent: any) => {
    if (viewportPointerDownEvent.button !== 0 || viewportPointerDownEvent.target.closest("button"))
      return;
    const viewportRectBox = baseLightControlsElement.getBoundingClientRect();
    appCtx.pointerDragState = {
      pointerId: viewportPointerDownEvent.pointerId,
      startX: viewportPointerDownEvent.clientX,
      startY: viewportPointerDownEvent.clientY,
      startLeft: viewportRectBox.left,
      startTop: viewportRectBox.top,
      moved: false,
    };
    try {
      baseLightHeaderElement.setPointerCapture(viewportPointerDownEvent.pointerId);
    } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
  }),
  baseLightHeaderElement?.addEventListener("pointermove", (viewportPointerMoveEvent: any) => {
    if (!appCtx.pointerDragState || viewportPointerMoveEvent.pointerId !== appCtx.pointerDragState.pointerId)
      return;
    const viewportDragDeltaX = viewportPointerMoveEvent.clientX - appCtx.pointerDragState.startX,
      viewportDragDeltaY = viewportPointerMoveEvent.clientY - appCtx.pointerDragState.startY;
    if (!appCtx.pointerDragState.moved && Math.hypot(viewportDragDeltaX, viewportDragDeltaY) < 4) return;
    ((appCtx.pointerDragState.moved = true), viewportPointerMoveEvent.preventDefault());
    const dragViewportRectBox = baseLightControlsElement.getBoundingClientRect(),
      maxViewportLeft = Math.max(8, window.innerWidth - dragViewportRectBox.width - 8),
      maxViewportTop = Math.max(8, window.innerHeight - dragViewportRectBox.height - 8);
    ((baseLightControlsElement.style.right = "auto"),
      (baseLightControlsElement.style.left =
        clamp2(appCtx.pointerDragState.startLeft + viewportDragDeltaX, 8, maxViewportLeft) + "px"),
      (baseLightControlsElement.style.top =
        clamp2(appCtx.pointerDragState.startTop + viewportDragDeltaY, 8, maxViewportTop) + "px"));
  }));
const finishViewportDrag = (viewportPointerUpEvent: any) => {
  !appCtx.pointerDragState ||
    viewportPointerUpEvent.pointerId !== appCtx.pointerDragState.pointerId ||
    (appCtx.pointerDragState = null);
};
(baseLightHeaderElement?.addEventListener("pointerup", finishViewportDrag),
  baseLightHeaderElement?.addEventListener("pointercancel", finishViewportDrag),
  appCtx.lightPreviewWorker?.addEventListener("message", (lightingMessageEvent: any) => {
    if (lightingMessageEvent.data?.type !== "base-lighting-saved") return;
    const lightingMessageEventNormalizedBaseLighting = normalizeBaseLighting2(
      lightingMessageEvent.data.lighting,
    );
    (appCtx.studioProject && (appCtx.studioProject.baseLighting = lightingMessageEventNormalizedBaseLighting),
      applyBaseLighting(lightingMessageEventNormalizedBaseLighting));
  }),
  snapToggleButton.addEventListener("click", () => {
    (deselectAll(),
      (appCtx.studioState.settings.snapEnabled = appCtx.studioState.settings.snapEnabled === false),
      syncSnapControls(),
      updateSnapIndicator(),
      refreshStudioView(),
      markDocumentDirty());
  }),
  snapSettingsToggleButton.addEventListener("click", (settingsPanelClickEvent: any) => {
    (settingsPanelClickEvent.stopPropagation(), setSnapSettingsOpen(snapSettingsPanel.hidden));
  }),
  snapSettingsPanel.addEventListener("pointerdown", (settingsPanelPointerDownEvent: any) =>
    settingsPanelPointerDownEvent.stopPropagation(),
  ));
for (const settingsPanelPointerDownEventSnapSettingInput of snapSettingControls)
  settingsPanelPointerDownEventSnapSettingInput.addEventListener("change", () => {
    (deselectAll(),
      ((appCtx.studioState.settings as any)[settingsPanelPointerDownEventSnapSettingInput.dataset.snapSetting!] =
        settingsPanelPointerDownEventSnapSettingInput.checked),
      updateSnapIndicator(),
      refreshStudioView(),
      markDocumentDirty());
  });
(snapToleranceInput.addEventListener("input", () => {
  (snapToleranceValueElement.textContent = snapToleranceInput.value + " px"),
    syncHtmlRangeProgress2(snapToleranceInput);
}),
  snapToleranceInput.addEventListener("change", () => {
    const snapToleranceValue = clamp2(Math.round(finite2(snapToleranceInput.value, 13)), 6, 24);
    snapToleranceValue !== appCtx.studioState.settings.snapTolerance &&
      (deselectAll(),
      (appCtx.studioState.settings.snapTolerance = snapToleranceValue),
      syncSnapControls(),
      updateSnapIndicator(),
      refreshStudioView(),
      markDocumentDirty());
  }),
  finishWallButton.addEventListener("click", () => resetCameraView()),
  deleteSelectionButton.addEventListener("click", clearSelection),
  selectElement("#scale-close").addEventListener("click", () => {
    ((appCtx.measureSpan = null), scaleDialogElement.close(), refreshStudioView());
  }),
  selectElement("#scale-cancel").addEventListener("click", () => {
    ((appCtx.measureSpan = null), scaleDialogElement.close(), selectStudioTool("scale"));
  }),
  scaleFormElement.addEventListener("submit", (alignmentSubmitEvent: any) => {
    if ((alignmentSubmitEvent.preventDefault(), !appCtx.measureSpan)) return;
    const floorOffsetValue = finite2(referenceMetersInput.value, 0),
      floorReferenceDistance = distance2(appCtx.measureSpan.start, appCtx.measureSpan.end);
    if (floorOffsetValue <= 0 || floorReferenceDistance <= 0) {
      showToast("请输入有效的真实长度。", "error");
      return;
    }
    (deselectAll(),
      (appCtx.studioState.calibration = {
        pixelsPerMeter: floorReferenceDistance / floorOffsetValue,
        reference: {
          ...appCtx.measureSpan,
          meters: floorOffsetValue,
        },
      }),
      (appCtx.measureSpan = null),
      scaleDialogElement.close(),
      selectStudioTool("wall"),
      refreshScopeItems(),
      updateCameraView(),
      markDocumentDirty());
    const floorReferenceDistanceActiveFloorRecord = getActiveFloor();
    appCtx.studioProject.floors.findIndex(
      (alignmentCandidateFloor: any) =>
        alignmentCandidateFloor.id === floorReferenceDistanceActiveFloorRecord?.id,
    ) > 0 && floorReferenceDistanceActiveFloorRecord?.alignmentPending
      ? (requestAnimationFrame(() => startFloorAlign()),
        showToast("比例已标定，接下来设置上下楼层的参照点。"))
      : showToast("比例已标定，可以沿着底图连续描墙了。");
  }));
for (const doorOptionInput of [
  selectElement("#wall-height"),
  selectElement("#wall-thickness"),
  selectElement("#wall-opacity-mode"),
  selectElement("#wall-opacity"),
  selectElement("#wall-open-end-mode"),
])
  doorOptionInput.addEventListener("change", () => applyToolSetting("wall"));
for (const windowOptionInput of [
  selectElement("#window-width"),
  selectElement("#window-height"),
  selectElement("#window-sill"),
  selectElement("#window-divider"),
])
  windowOptionInput.addEventListener("change", () => applyToolSetting("window"));
for (const doorTypeOptionInput of [
  selectElement("#door-type"),
  selectElement("#door-width"),
  selectElement("#door-height"),
])
  doorTypeOptionInput.addEventListener("change", () => applyToolSetting("door"));
for (const railingOptionInput of [
  selectElement("#railing-width"),
  selectElement("#railing-height"),
])
  railingOptionInput.addEventListener("change", () => applyToolSetting("railing"));
for (const furnitureOptionInput of [
  selectElement("#airer-style"),
  selectElement("#airer-extension"),
  selectElement("#airer-preview"),
  selectElement("#fan-model-scale"),
  selectElement("#fan-model-height"),
  selectElement("#item-x"),
  selectElement("#item-y"),
  selectElement("#item-width"),
  selectElement("#item-height"),
  selectElement("#item-depth"),
  selectElement("#item-elevation"),
  selectElement("#item-rotation"),
  selectElement("#item-vertical-rotation"),
  itemStripRollInput,
])
  furnitureOptionInput.addEventListener("change", () => applyToolSetting("item"));
itemLightSourceVisibleInput.addEventListener("change", () => applyToolSetting("item"));
for (const applianceOptionInput of [
  selectElement("#label-title"),
  selectElement("#label-title-spacing"),
  selectElement("#label-subtitle"),
  selectElement("#label-subtitle-spacing"),
  selectElement("#label-line-length"),
  selectElement("#label-color"),
])
  applianceOptionInput.addEventListener("change", () => applyToolSetting("item"));
for (const courtyardOptionInput of [
  selectElement("#light-group"),
  selectElement("#light-temperature"),
  selectElement("#light-brightness"),
  selectElement("#light-range"),
  selectElement("#light-angle"),
])
  courtyardOptionInput.addEventListener("change", () => applyToolSetting("item"));
selectElement("#curtain-position").addEventListener("change", () => applyToolSetting("item"));
for (const lightingOptionInput of [
  "curtain-form",
  "curtain-track",
  "curtain-corner",
  "curtain-left-length",
  "curtain-right-length",
  "curtain-meet",
  "curtain-fabric",
  "curtain-preview",
])
  selectElement("#" + lightingOptionInput).addEventListener("change", () =>
    applyToolSetting("item"),
  );
(selectElement("#round-table-turntable").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#sofa-chaise-side").addEventListener("change", () => applyToolSetting("item")));
for (const lightingOptionInputFridgeStyleInput of document.querySelectorAll(
  'input[name="fridge-style"]',
))
  lightingOptionInputFridgeStyleInput.addEventListener("change", () => applyToolSetting("item"));
(selectElement("#stair-direction").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#tv-mount-style").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#pillar-shape").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#pillar-axis").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#strip-axis").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#mural-style").addEventListener("change", () => applyToolSetting("item")),
  selectElement("#featurewall-style").addEventListener("change", () => applyToolSetting("item")),

  materialSlotListElement.addEventListener("input", (materialColorInputEvent: any) => {
    const materialColorInput = materialColorInputEvent.target.closest("[data-material-slot-color]"),
      materialSlotRow = materialColorInput?.closest(".material-slot"),
      materialHexInput = materialSlotRow?.querySelector("[data-material-slot-hex]");
    materialHexInput &&
      materialColorInput &&
      ((materialHexInput.value = String(materialColorInput.value).toLowerCase()),
      materialHexInput.classList.remove("is-invalid"));

    const materialSurfaceRange = materialColorInputEvent.target.closest(
      "[data-material-slot-surface-key]",
    );
    if (materialSurfaceRange) {
      const materialSurfaceOutput = materialSurfaceRange
        .closest(".material-slot-surface-field")
        ?.querySelector("output");
      materialSurfaceOutput &&
        (materialSurfaceOutput.textContent = Number(materialSurfaceRange.value).toFixed(2));
      /* 拖拽时轨道上的金色段要跟着圆点走，否则读数变了、填充还停在旧位置。 */
      syncHtmlRangeProgress2(materialSurfaceRange);
    }
  }),
  materialSlotListElement.addEventListener("change", (materialSlotChangeEvent: any) => {
    const materialColorInput = materialSlotChangeEvent.target.closest(
      "[data-material-slot-color]",
    );
    if (materialColorInput) {
      setItemMaterialOverride(
        materialColorInput.dataset.materialSlotColor,
        materialColorInput.value,
      );
      return;
    }

    const materialHexInput = materialSlotChangeEvent.target.closest("[data-material-slot-hex]");
    if (materialHexInput) {
      const hexColorValue = String(materialHexInput.value).trim().toLowerCase(),
        normalizedHexValue = /^[0-9a-f]{6}$/.test(hexColorValue)
          ? "#" + hexColorValue
          : hexColorValue;
      if (!/^#[0-9a-f]{6}$/.test(normalizedHexValue)) {

        const materialRowColorInput = materialHexInput
          .closest(".material-slot")
          ?.querySelector("[data-material-slot-color]");
        (materialHexInput.classList.add("is-invalid"),
          materialRowColorInput &&
            (materialHexInput.value = String(materialRowColorInput.value).toLowerCase()));
        return;
      }
      (materialHexInput.classList.remove("is-invalid"),
        (materialHexInput.value = normalizedHexValue),
        setItemMaterialOverride(materialHexInput.dataset.materialSlotHex, normalizedHexValue));
      return;
    }
    const materialSurfaceRange = materialSlotChangeEvent.target.closest(
      "[data-material-slot-surface-key]",
    );
    materialSurfaceRange &&
      setItemMaterialSurfaceOverride(
        materialSurfaceRange.dataset.materialSlotSurfaceName,
        materialSurfaceRange.dataset.materialSlotSurfaceKey,
        Number(materialSurfaceRange.value),
      );
  }),
  materialSlotListElement.addEventListener("click", (materialSlotClickEvent: any) => {
    const materialResetButton = materialSlotClickEvent.target.closest("[data-material-slot-reset]");
    if (materialResetButton) {
      setItemMaterialOverride(materialResetButton.dataset.materialSlotReset, "");
      return;
    }
    const materialSurfaceResetButton = materialSlotClickEvent.target.closest(
      "[data-material-slot-surface-reset]",
    );
    if (materialSurfaceResetButton) {

      const surfaceResetSlotName = materialSurfaceResetButton.dataset.materialSlotSurfaceReset;
      setItemMaterialSurfaceOverride(surfaceResetSlotName, "roughness", null);
      setItemMaterialSurfaceOverride(surfaceResetSlotName, "metalness", null);
      return;
    }
    const materialSurfaceToggle = materialSlotClickEvent.target.closest(
      "[data-material-slot-surface-toggle]",
    );
    if (!materialSurfaceToggle) return;

    const surfaceToggleSlotName = materialSurfaceToggle.dataset.materialSlotSurfaceToggle;
    appCtx.expandedMaterialSurfaceSlots.has(surfaceToggleSlotName)
      ? appCtx.expandedMaterialSurfaceSlots.delete(surfaceToggleSlotName)
      : appCtx.expandedMaterialSurfaceSlots.add(surfaceToggleSlotName);
    const materialSlotRow = materialSurfaceToggle.closest(".material-slot"),
      materialSurfacePanel = materialSlotRow?.querySelector("[data-material-slot-surface]"),
      isSurfaceExpanded = appCtx.expandedMaterialSurfaceSlots.has(surfaceToggleSlotName);
    (materialSurfaceToggle.setAttribute("aria-expanded", String(isSurfaceExpanded)),
      materialSurfacePanel && (materialSurfacePanel.hidden = !isSurfaceExpanded));
  }),
  materialStyleStripElement.addEventListener("click", (materialStyleClickEvent: any) => {
    const materialStyleChip = materialStyleClickEvent.target.closest("[data-material-style-id]");
    materialStyleChip &&
      setItemMaterialStyle(materialStyleChip.dataset.materialStyleId);
  }),
  materialStyleDeleteButton.addEventListener("click", () => {
    const materialEditTarget = selectedMaterialEditTarget(),
      selectedModelType = materialEditModelType(
        materialEditTarget?.record,
        materialEditTarget?.kind,
      ),
      selectedStyle = normalizeMaterialStyle(
        selectedModelType,
        materialEditTarget?.record?.materialStyle,
      );
    selectedStyle.startsWith("custom:") && deleteCustomMaterialStyle(selectedStyle);
  }),
  materialResetAllButton.addEventListener("click", () => resetItemMaterialAll()),

  materialSavePresetButton.addEventListener("click", () => {
    const materialEditTarget = selectedMaterialEditTarget(),
      modelType = materialEditModelType(materialEditTarget?.record, materialEditTarget?.kind);
    if (!materialEditTarget || !materialStyleGroupFor(modelType)) return;
    (materialPresetNameInput &&
      (materialPresetNameInput.value = materialStyleLabel(
        modelType,
        materialEditTarget.record.materialStyle,
      )),
      materialPresetDialogElement?.showModal(),
      materialPresetNameInput?.focus(),
      materialPresetNameInput?.select());
  }),
  materialPresetFormElement.addEventListener("submit", () => {
    const presetLabel = String(materialPresetNameInput?.value || "").trim();
    presetLabel && saveCurrentItemMaterialStyle(presetLabel.slice(0, 16));
  }),
  materialPresetCancelButton.addEventListener("click", () =>
    materialPresetDialogElement?.close(),
  ),
  materialApplySameButton.addEventListener("click", () => {
    const peerCount = materialSameModelPeerCount(selectedMaterialEditTarget());
    if (!peerCount) return;
    (materialApplyCountElement &&
      (materialApplyCountElement.textContent = peerCount + " 件同类物件"),
      materialApplyDialogElement?.showModal());
  }),
  materialApplyFormElement.addEventListener("submit", () => {
    materialApplyDialogElement?.close();
    applyMaterialToSameModelItems();
  }),
  materialApplyCancelButton.addEventListener("click", () => materialApplyDialogElement?.close()),
  inspectorGroupsElement.forEach((inspectorGroupElement) => {
    const inspectorGroupHeader = inspectorGroupElement.querySelector(
      ".inspector-group-header",
    );
    inspectorGroupHeader?.addEventListener("click", () =>
      toggleInspectorGroup(inspectorGroupElement),
    );
  }),
  shoeCabinetMirrorButton.addEventListener("click", () => {
    const shoeCabinetElement = getSelectedObject();
    !shoeCabinetElement ||
      appCtx.selectedItem?.kind !== "item" ||
      shoeCabinetElement.type !== "shoecabinet" ||
      (deselectAll(),
      (shoeCabinetElement.shoeCabinetMirrored = shoeCabinetElement.shoeCabinetMirrored !== true),
      refreshScopeItems(resolvePreviewScope(shoeCabinetElement)),
      markDocumentDirty());
  }),
  selectionInspectorElement.addEventListener("submit", (optionsSubmitEvent: any) =>
    optionsSubmitEvent.preventDefault(),
  ),
  selectElement("#door-hinge").addEventListener("click", () => {
    const doorElement = getSelectedObject();
    !doorElement ||
      appCtx.selectedItem?.kind !== "door" ||
      ["double", "roller-shutter", "frame-only"].includes(doorElement.doorType) ||
      (deselectAll(),
      (doorElement.hinge = doorElement.hinge === "right" ? "left" : "right"),
      refreshScopeItems("architecture"),
      markDocumentDirty());
  }),
  selectElement("#door-swing").addEventListener("click", () => {
    const swingDoorElement = getSelectedObject();
    !swingDoorElement ||
      appCtx.selectedItem?.kind !== "door" ||
      ["sliding-glass", "frame-only"].includes(swingDoorElement.doorType) ||
      (deselectAll(),
      (swingDoorElement.swing = swingDoorElement.swing === -1 ? 1 : -1),
      refreshScopeItems("architecture"),
      markDocumentDirty());
  }));
for (const rotateControlButton of document.querySelectorAll<StudioControlElement>("[data-rotate]"))
  rotateControlButton.addEventListener("click", () => {
    const rotatePlacedElement = getSelectedObject();
    if (!rotatePlacedElement || appCtx.selectedItem?.kind !== "item") return;
    const elementSnapshot = captureUndoSnapshot(),
      nextRotation = rotatePlacedElement.rotation + Number(rotateControlButton.dataset.rotate);
    if (
      ((rotatePlacedElement.rotation =
        rotatePlacedElement.type === "striplight"
          ? normalizeFullRotation2(nextRotation)
          : nextRotation % 360),
      !validateSelectionChange(elementSnapshot))
    ) {
      refreshScopeItems(resolvePreviewScope(rotatePlacedElement));
      return;
    }
    (applyPlacementChange(elementSnapshot),
      refreshScopeItems(resolvePreviewScope(rotatePlacedElement)),
      markDocumentDirty());
  });
if (
  (window.addEventListener("keydown", (windowKeyDownEvent) => {
    if (isEmbeddedStage || windowKeyDownEvent.defaultPrevented || exportDialogElement.open) return;
    if (windowKeyDownEvent.key === "Escape" && !snapSettingsPanel.hidden) {
      setSnapSettingsOpen(false);
      return;
    }
    if (
      windowKeyDownEvent.key === "Escape" &&
      drawingToolSections.some((drawingToolSection) => drawingToolSection.classList.contains("open"))
    ) {
      closeDrawingToolGroups();
      return;
    }
    const open =
      windowKeyDownEvent.target instanceof HTMLInputElement ||
      windowKeyDownEvent.target instanceof HTMLTextAreaElement ||
      scaleDialogElement.open;
    if (
      (windowKeyDownEvent.code === "Space" &&
        !open &&
        ((appCtx.isMiddleButtonPanning = true), windowKeyDownEvent.preventDefault()),
      windowKeyDownEvent.key.toLowerCase() === "s" &&
        !open &&
        ((appCtx.isSnapTemporarilyOff = true), updateSnapIndicator(), refreshStudioView()),
      open)
    )
      return;
    windowKeyDownEvent.key === "Shift" &&
      !appCtx.marqueeBox &&
      (appCtx.activeToolName === "scale" || appCtx.activeToolName === "wall") &&
      ((appCtx.isForceSnapDisabled = true), updateSnapIndicator(), refreshStudioView());
    const ctrlKey = windowKeyDownEvent.metaKey || windowKeyDownEvent.ctrlKey;
    const keyLowerStudio = windowKeyDownEvent.key.toLowerCase();
    if (ctrlKey && keyLowerStudio === "z") {
      (windowKeyDownEvent.preventDefault(),
        windowKeyDownEvent.shiftKey ? void redoStudioHistory() : void undoStudioHistory());
      return;
    }
    if (ctrlKey && keyLowerStudio === "y" && !windowKeyDownEvent.shiftKey) {
      (windowKeyDownEvent.preventDefault(), void redoStudioHistory());
      return;
    }
    if (ctrlKey && keyLowerStudio === "d") {
      (windowKeyDownEvent.preventDefault(), duplicateSelection());
      return;
    }
    // mirrorSelection / rotateSelection 虽名误导，语义实为 copy / paste
    if (ctrlKey && keyLowerStudio === "c" && !windowKeyDownEvent.shiftKey) {
      (windowKeyDownEvent.preventDefault(), mirrorSelection());
      return;
    }
    if (ctrlKey && keyLowerStudio === "v" && !windowKeyDownEvent.shiftKey) {
      (windowKeyDownEvent.preventDefault(), rotateSelection());
      return;
    }
    if (windowKeyDownEvent.key === "Delete" || windowKeyDownEvent.key === "Backspace") {
      (windowKeyDownEvent.preventDefault(), clearSelection());
      return;
    }
    const arrowKeyDirections = {
      ArrowLeft: {
        x: -1,
        y: 0,
      },
      ArrowRight: {
        x: 1,
        y: 0,
      },
      ArrowUp: {
        x: 0,
        y: -1,
      },
      ArrowDown: {
        x: 0,
        y: 1,
      },
    }[windowKeyDownEvent.key];
    if (arrowKeyDirections && !ctrlKey) {
      const selectedItemIds =
        appCtx.selectedItem?.kind === "item"
          ? [appCtx.selectedItem.id]
          : appCtx.selectedItems
              .filter((selectedHistoryEntry: any) => selectedHistoryEntry.kind === "item")
              .map((selectedItemEntry: any) => selectedItemEntry.id);
      if (selectedItemIds.length) {
        windowKeyDownEvent.preventDefault();
        const elementSnapshotBeforeMove = captureUndoSnapshot(),
          nudgeStep =
            (windowKeyDownEvent.altKey ? 0.01 : windowKeyDownEvent.shiftKey ? 0.25 : 0.05) *
            (getPixelsPerMeter() || 1),
          selectedItemIdSet = new Set(selectedItemIds);
        for (const movedSceneItem of appCtx.studioState.items)
          selectedItemIdSet.has(movedSceneItem.id) &&
            ((movedSceneItem.x += arrowKeyDirections.x * nudgeStep),
            (movedSceneItem.y += arrowKeyDirections.y * nudgeStep),
            selectedItemIds.length === 1 &&
              isCourtyardGate2(movedSceneItem) &&
              anchorGate2(
                movedSceneItem,
                appCtx.studioState.items,
                getPixelsPerMeter(),
                24 / appCtx.planView.zoom,
              ));
        if (!validateSelectionChange(elementSnapshotBeforeMove)) {
          refreshScopeItems(getCurrentPreviewScope());
          return;
        }
        (applyPlacementChange(elementSnapshotBeforeMove),
          refreshScopeItems(getCurrentPreviewScope()),
          markDocumentDirty());
        return;
      }
    }
    if (windowKeyDownEvent.key === "Escape") {
      if (
        appCtx.activeToolName === "courtyard-gate" ||
        appCtx.activeToolName === "flooropening" ||
        appCtx.marqueeBox?.type === "draw-flooropening"
      ) {
        if ((windowKeyDownEvent.preventDefault(), appCtx.marqueeBox?.type === "draw-flooropening")) {
          try {
            planCanvasElement.releasePointerCapture(appCtx.marqueeBox.pointerId);
          } catch { /* 指针捕获：指针已失效（pointercancel / 元素已卸载）时规范要求抛错，忽略即可 */ }
          ((appCtx.marqueeBox = null), endStudioGesture());
        }
        selectStudioTool("select");
        return;
      }
      if (appCtx.alignmentState) {
        (windowKeyDownEvent.preventDefault(), cancelFloorAlign());
        return;
      }
      (hideLightGroupActionMenu(), resetCameraView());
      const ao8 = getPreviewScopeSelection();
      (refreshSelection(), refreshStudioUi(), refreshStudioView(), setPreviewScope(ao8));
    }
  }),
  window.addEventListener("keyup", (windowKeyUpEvent) => {
    (windowKeyUpEvent.code === "Space" && (appCtx.isMiddleButtonPanning = false),
      windowKeyUpEvent.key.toLowerCase() === "s" &&
        ((appCtx.isSnapTemporarilyOff = false), updateSnapIndicator(), refreshStudioView()),
      windowKeyUpEvent.key === "Shift" &&
        ((appCtx.isForceSnapDisabled = false), updateSnapIndicator(), refreshStudioView()));
  }),
  window.addEventListener("blur", () => {
    ((appCtx.isMiddleButtonPanning = false),
      (appCtx.isForceSnapDisabled = false),
      (appCtx.isSnapTemporarilyOff = false));
  }),
  window.addEventListener("online", () => {
    ((appCtx.saveRetryDueAt = 0), scheduleAutosave(0));
  }),
  window.addEventListener("offline", () => {
    (window.clearTimeout(appCtx.autosaveTimeoutId), (appCtx.autosaveTimeoutId = null));
  }),
  window.addEventListener("pagehide", () => {
    ((appCtx.isPageSuspended = true), window.clearTimeout(appCtx.autosaveTimeoutId), (appCtx.autosaveTimeoutId = null));
  }),
  window.addEventListener("pageshow", () => {
    ((appCtx.isPageSuspended = false), (appCtx.isLeavingStudio = false), scheduleAutosave());
  }),
  window.addEventListener("beforeunload", (beforeUnloadEvent) => {
    isEmbeddedStage ||
      appCtx.isLeavingStudio ||
      !hasUnsavedChanges() ||
      (beforeUnloadEvent.preventDefault(), (beforeUnloadEvent.returnValue = ""));
  }),
  document.addEventListener("visibilitychange", () => {
    (document.hidden || refreshSceneRender(), scheduleAutosave());
  }),
  new URLSearchParams(window.location.search).has("model-export"))
) {
  window.__homeosExportFurnitureJson = (furnitureExportType, exportOverrides: Record<string, any> = {}) => {
    const furnitureDefinition = (itemTypeCatalog as any)[furnitureExportType];
    if (!furnitureDefinition) throw new Error("Unknown furniture type: " + furnitureExportType);
    const furnitureExportItem = {
        id: "offline-export-" + furnitureExportType,
        type: furnitureExportType,
        width: furnitureDefinition.width,
        height: furnitureDefinition.height,
        depth: furnitureDefinition.depth,
        elevation: furnitureDefinition.elevation || 0,
        rotation: 0,
        curtainPosition: "split",
        roundTableTurntable: false,
        stairDirection: "right",
        shoeCabinetMirrored: false,
        tvMountStyle: "standard",
        screenEnabled: true,
        offlineModelExport: true,
        ...exportOverrides,
      },
      vu4 = buildItemModel(furnitureExportItem);
    ((vu4.name = "homeos-v1-" + furnitureExportType), vu4.updateMatrixWorld(true));
    const jSON = vu4.toJSON();
    return (disposeObjectTree(vu4), jSON);
  };
  const modelExportType = new URLSearchParams(window.location.search).get("model-export");
  if (modelExportType && modelExportType !== "1") {
    const modelExportPresets =
        {
          curtain_left: {
            type: "curtain",
            curtainPosition: "left",
          },
          curtain_right: {
            type: "curtain",
            curtainPosition: "right",
          },
          curtain_split: {
            type: "curtain",
            curtainPosition: "split",
          },
          rounddiningtable_turntable: {
            type: "rounddiningtable",
            roundTableTurntable: true,
          },
          tv_standard: {
            type: "tv",
            tvMountStyle: "standard",
          },
          tv_tabletop: {
            type: "tv",
            tvMountStyle: "tabletop",
          },
          tv_mobile: {
            type: "tv",
            tvMountStyle: "mobile",
          },
        }[modelExportType] || {},
      resolvedExportType = modelExportPresets.type || modelExportType;
    requestAnimationFrame(() => {
      try {
        const exportPayloadField = document.createElement("textarea");
        ((exportPayloadField.id = "homeos-model-export"), (exportPayloadField.hidden = true));
        const exportPayloadJson = JSON.stringify(
          window.__homeosExportFurnitureJson!(resolvedExportType, modelExportPresets),
        );
        ((exportPayloadField.value = exportPayloadJson),
          (exportPayloadField.textContent = exportPayloadJson),
          document.body.append(exportPayloadField),
          (document.documentElement.dataset.modelExportReady = modelExportType));
      } catch (exportError: any) {
        document.documentElement.dataset.modelExportError =
          exportError?.message || String(exportError);
      }
    });
  }
}
const materialTestType = new URLSearchParams(window.location.search).get("material-test");
materialTestType &&
  (async () => {
    const materialTestGroup = new ns2.Group();
    try {
      document.documentElement.dataset.materialTestStage = "loading";
      const materialTestDefinition = (itemTypeCatalog as any)[materialTestType];
      if (!materialTestDefinition || !(ALL_ITEM_MODELS2 as any)[materialTestType])
        throw new Error("Unsupported material test type: " + materialTestType);
      if (!(await ensureExternalModelLoaded(materialTestType)))
        throw new Error("Material test model failed to load: " + materialTestType);
      document.documentElement.dataset.materialTestStage = "renderer";
      for (
        let materialLoadFrameIndex = 0;
        !appCtx.threeRenderer && materialLoadFrameIndex < 120;
        materialLoadFrameIndex += 1
      )
        await ensureRenderReady();
      if (!appCtx.threeRenderer || !appCtx.threeCamera || !appCtx.threeScene)
        throw new Error("Material test renderer was not initialized");
      const materialTestResults: any = [];
      for (let materialTestIndex = 0; materialTestIndex < 3; materialTestIndex += 1) {
        const materialTestItem = {
            id: "material-test-" + materialTestType + "-" + (materialTestIndex + 1),
            type: materialTestType,
            width: materialTestDefinition.width,
            height: materialTestDefinition.height,
            depth: materialTestDefinition.depth,
            elevation: 0,
            rotation: 0,
          },
          materialTestNode = new ns2.Group();
        if (!applyItemOptimization(materialTestNode, materialTestItem))
          throw new Error("Material test model was not mounted: " + materialTestType);
        (materialTestNode.traverse((materialTestMesh: any) => {
          if (!materialTestMesh.isMesh) return;
          const meshMaterialList = Array.isArray(materialTestMesh.material)
            ? materialTestMesh.material
            : [materialTestMesh.material];
          materialTestResults.push(...meshMaterialList.filter(Boolean));
        }),
          materialTestGroup.add(materialTestNode));
      }
      ((document.documentElement.dataset.materialTestStage = "compiling"),
        appCtx.threeRenderer.compile(materialTestGroup, appCtx.threeCamera, appCtx.threeScene));
      const size3 = new Set(materialTestResults).size;
      for (
        let materialWaitFrameIndex = 0;
        materialWaitFrameIndex < 600;
        materialWaitFrameIndex += 1
      ) {
        const modelLoadState5 = externalModelRegistry.modelLoadState();
        if (modelLoadState5.active === 0 && modelLoadState5.queued === 0) break;
        await ensureRenderReady();
      }
      const modelLoadState6 = externalModelRegistry.modelLoadState(),
        materialTestStats = {
          models: 3,
          slots: materialTestResults.length,
          unique: size3,
          shared: materialTestResults.length - size3,
          cacheMaterials: modelLoadState6.materials,
          cacheReuses: modelLoadState6.materialReuses,
        };
      document.documentElement.dataset.materialTestStats = JSON.stringify(materialTestStats);
      const materialTestStatusElement = document.createElement("output");
      ((materialTestStatusElement.id = "homeos-material-test-output"),
        materialTestStatusElement.setAttribute("aria-live", "polite"),
        (materialTestStatusElement.textContent =
          "材质测试 " +
          materialTestType +
          "：" +
          materialTestStats.models +
          " 个模型，" +
          materialTestStats.slots +
          " 个材质槽，" +
          materialTestStats.unique +
          " 种唯一材质，" +
          materialTestStats.shared +
          " 个槽复用；当前缓存 " +
          materialTestStats.cacheMaterials +
          " 种，累计复用 " +
          materialTestStats.cacheReuses +
          " 次。"),
        document.body.append(materialTestStatusElement),
        (document.documentElement.dataset.materialTestReady = materialTestType),
        (document.documentElement.dataset.materialTestStage = "ready"));
    } catch (materialTestError: any) {
      ((document.documentElement.dataset.materialTestError =
        materialTestError?.message || String(materialTestError)),
        (document.documentElement.dataset.materialTestStage = "error"));
    } finally {
      disposeObjectTree(materialTestGroup);
    }
  })();
const instanceTestType = new URLSearchParams(window.location.search).get("instance-test");
if (instanceTestType) {
  const instanceTestGroup = new ns2.Group(),
    instanceTestGeometry = new ns2.BoxGeometry(0.5, 0.86, 0.5);
  try {
    if (instanceTestTypeSet.has(instanceTestType))
      throw new Error("Unsupported instance test type: " + instanceTestType);
    const instanceTestEntries: any[] = [];
    for (let instanceTestIndex = 0; instanceTestIndex < 3; instanceTestIndex += 1) {
      const instanceTestItem = {
          id: "instance-test-" + instanceTestType + "-" + (instanceTestIndex + 1),
          type: instanceTestType,
        },
        instanceTestItemGroup = new ns2.Group(),
        instanceTestMesh = new ns2.Mesh(
          instanceTestGeometry,
          new ns2.MeshStandardMaterial({
            color: defaultViewSettings.furniture,
            roughness: 0.72,
          }),
        );
      ((instanceTestMesh.position.y = 0.43),
        (instanceTestMesh.userData.externalModelSharedGeometry = true),
        (instanceTestItemGroup.position.x = instanceTestIndex * 0.9),
        (instanceTestItemGroup.rotation.y = ns2.MathUtils.degToRad(instanceTestIndex * 30)),
        instanceTestItemGroup.add(instanceTestMesh),
        instanceTestGroup.add(instanceTestItemGroup),
        instanceTestEntries.push({
          item: instanceTestItem,
          group: instanceTestItemGroup,
        }));
    }
    const instanceTestStats = batchSharedMeshes(instanceTestGroup, instanceTestEntries);
    ((document.documentElement.dataset.instanceTestStats = JSON.stringify(instanceTestStats)),
      (document.documentElement.dataset.instanceTestReady = instanceTestType));
  } catch (instanceTestError: any) {
    document.documentElement.dataset.instanceTestError =
      instanceTestError?.message || String(instanceTestError);
  } finally {
    (disposeObjectTree(instanceTestGroup), instanceTestGeometry.dispose());
  }
}
(new ResizeObserver(resizePlanStage).observe(planStageElement),
  initializeStudioSelects2(),
  initializeNumberInputs2(),
  syncBaseLightingControls());
async function waitForStageReady() {
  if (!areLightsEnabled()) return;
  scheduleStudioRender(0);
  const stageReadyDeadline = performance.now() + 1800;
  for (
    ;
    areLightsEnabled() &&
    (!appCtx.isCacheReady || appCtx.isFrameDirty || previewLightCacheCanvasElement.hidden) &&
    performance.now() < stageReadyDeadline;
  )
    await new Promise(requestAnimationFrame);
}
function runStudioRenderLoop() {
  const ctx = createStudioRenderContext();
  const zn4 = normalizeStudioDocument(
    appCtx.loadedDraft.referenceScene || appCtx.loadedDraft.scene,
    studioDocumentDeps(),
  );
  const retainedFloorsByKey = new Map(),
    renderLoopStats = {
      reusedTransitions: 0,
      rebuiltTransitions: 0,
      reusedFloors: 0,
    };
  const disposeRetainedNode = (releaseEntry: any) => {
      (ctx.floorRetentionService?.releaseRoot?.(releaseEntry.node, {
        dispose: true,
      }),
        appCtx.regionLightController?.releaseRoot?.(releaseEntry.node),
        disposeObjectTree(releaseEntry.node));
    },
    trimRetainedFloors = (keepKeySet: any = null) => {
      keepKeySet || ctx.cacheEpoch++;
      for (const [retainedKey, retainedEntry] of retainedFloorsByKey)
        (keepKeySet && !keepKeySet.has(retainedKey)) ||
          (disposeRetainedNode(retainedEntry), retainedFloorsByKey.delete(retainedKey));
    };
  function retainFloorNode(retainRequest: any) {
    if (!retainRequest.cacheKey || retainRequest.cacheEpoch !== ctx.cacheEpoch) return false;
    const retainFloorId = retainRequest.id,
      previousRetainedEntry = retainedFloorsByKey.get(retainFloorId);
    return (
      previousRetainedEntry &&
        previousRetainedEntry.node !== retainRequest.node &&
        disposeRetainedNode(previousRetainedEntry),
      retainRequest.node.position.set(0, 0, 0),
      retainRequest.node.quaternion.identity(),
      retainRequest.node.scale.set(1, 1, 1),
      retainRequest.node.updateMatrixWorld(true),
      retainedFloorsByKey.delete(retainFloorId),
      retainedFloorsByKey.set(retainFloorId, retainRequest),
      appCtx.regionLightController?.retainRoot?.(retainRequest.node),
      ctx.floorRetentionService?.retainRoot?.(retainRequest.node),
      trimRetainedFloors2(retainedFloorsByKey, disposeRetainedNode),
      true
    );
  }
  (appCtx.lightPreviewWorker?.close(), (appCtx.lightPreviewWorker = null));
  ctx.isBackgroundVisible = !isEmbeddedStage;
  const retainedLayerKeySet = new Set(["items", "lights"]);
  const snapshotOrthoCamera = new ns2.OrthographicCamera(),
    snapshotPerspectiveCamera = new ns2.PerspectiveCamera(),
    cameraSyncState = {
      matrix: new ns2.Matrix4(),
      /** 上一次同步用的相机运动规格，用来判断是否需要重新同步。 */
      motion: null as any,
      camera: null as any,
      distance: 0,
      height: 0,
      aspect: 1,
      weight: 0,
      near: 0,
      far: 0,
    },
    projectedScreenPoint = new ns2.Vector2();
  function computeCameraFrameDistance(cameraFrameSpec: any) {
    return cameraFrameSpec.mode !== "perspective"
      ? Math.max(1, cameraFrameSpec.frameSize || 10) /
          cameraFrameSpec.zoom /
          Math.min(1, Math.max(0.1, appCtx.threeCamera.userData.viewportAspect || 1))
      : ((snapshotPerspectiveCamera.aspect = appCtx.threeCamera.userData.viewportAspect || 1),
        (snapshotPerspectiveCamera.zoom = cameraFrameSpec.zoom),
        snapshotPerspectiveCamera.setFocalLength(cameraFrameSpec.focalLength || 50),
        2 *
          new ns2.Vector3()
            .fromArray(cameraFrameSpec.position)
            .distanceTo(new ns2.Vector3().fromArray(cameraFrameSpec.target)) *
          Math.tan(ns2.MathUtils.degToRad(snapshotPerspectiveCamera.getEffectiveFOV()) / 2));
  }
  function syncSnapshotCamera() {
    if (!ctx.cameraMotionSpec) return;
    const syncSnapshotCameraCameraTargetDistance = Math.max(
        0.000001,
        appCtx.threeCamera.position.distanceTo(appCtx.orbitControls.target),
      ),
      snapshotSceneHeight = Math.max(0.000001, ctx.cameraMotionSpec.height),
      viewportAspect = appCtx.threeCamera.userData.viewportAspect || 1,
      weight = ctx.cameraMotionSpec.weight,
      view = appCtx.threeCamera.view,
      view2 = snapshotOrthoCamera.view,
      isViewEqual =
        view === view2 ||
        (view &&
          view2 &&
          view.enabled === view2.enabled &&
          view.fullWidth === view2.fullWidth &&
          view.fullHeight === view2.fullHeight &&
          view.offsetX === view2.offsetX &&
          view.offsetY === view2.offsetY &&
          view.width === view2.width &&
          view.height === view2.height);
    if (
      cameraSyncState.motion === ctx.cameraMotionSpec &&
      cameraSyncState.camera === appCtx.threeCamera &&
      cameraSyncState.distance === syncSnapshotCameraCameraTargetDistance &&
      cameraSyncState.height === snapshotSceneHeight &&
      cameraSyncState.aspect === viewportAspect &&
      cameraSyncState.weight === weight &&
      cameraSyncState.near === appCtx.threeCamera.near &&
      cameraSyncState.far === appCtx.threeCamera.far &&
      isViewEqual &&
      cameraSyncState.matrix.equals(appCtx.threeCamera.projectionMatrix)
    )
      return;
    (Object.assign(snapshotOrthoCamera, {
      left: (-snapshotSceneHeight * viewportAspect) / 2,
      right: (snapshotSceneHeight * viewportAspect) / 2,
      top: snapshotSceneHeight / 2,
      bottom: -snapshotSceneHeight / 2,
      near: appCtx.threeCamera.near,
      far: appCtx.threeCamera.far,
      zoom: 1,
    }),
      Object.assign(snapshotPerspectiveCamera, {
        fov: ns2.MathUtils.radToDeg(
          2 * Math.atan(snapshotSceneHeight / (2 * syncSnapshotCameraCameraTargetDistance)),
        ),
        aspect: viewportAspect,
        near: appCtx.threeCamera.near,
        far: appCtx.threeCamera.far,
        zoom: 1,
      }));
    for (const cameraForProjection of [snapshotOrthoCamera, snapshotPerspectiveCamera])
      ((cameraForProjection.view = appCtx.threeCamera.view
        ? {
            ...appCtx.threeCamera.view,
          }
        : null),
        cameraForProjection.updateProjectionMatrix());
    const elements = snapshotOrthoCamera.projectionMatrix.elements,
      elements2 = snapshotPerspectiveCamera.projectionMatrix.elements;
    for (let matrixUpdateIndex = 0; matrixUpdateIndex < 16; matrixUpdateIndex++)
      appCtx.threeCamera.projectionMatrix.elements[matrixUpdateIndex] =
        elements[matrixUpdateIndex] * (1 - weight) +
        (elements2[matrixUpdateIndex] / syncSnapshotCameraCameraTargetDistance) * weight;
    (appCtx.threeCamera.projectionMatrixInverse.copy(appCtx.threeCamera.projectionMatrix).invert(),
      (cameraSyncState.motion = ctx.cameraMotionSpec),
      (cameraSyncState.camera = appCtx.threeCamera),
      (cameraSyncState.distance = syncSnapshotCameraCameraTargetDistance),
      (cameraSyncState.height = snapshotSceneHeight),
      (cameraSyncState.aspect = viewportAspect),
      (cameraSyncState.weight = weight),
      (cameraSyncState.near = appCtx.threeCamera.near),
      (cameraSyncState.far = appCtx.threeCamera.far),
      cameraSyncState.matrix.copy(appCtx.threeCamera.projectionMatrix));
  }
  const lightTransitionsByLight = new Map(),
    lightTransitionsByKey = new Map();
  ctx.runStudioRenderLoopLightsByItemKey = new Map();
  ctx.lightRecordsByItemKey = new Map();
  const controlsRestoreOptions = {
    restore: () => sampleLightTransitions(performance.now(), true),
  };
  function applyLightTransitionFrame(runStudioRenderLoopFrameTimestamp: any) {
    if (
      (ctx.presentationHandle !== null && window.clearTimeout(ctx.presentationHandle),
      (ctx.presentationHandle = null),
      runStudioRenderLoopFrameTimestamp)
    ) {
      if (appCtx.isPrewarming) return;
      ((appCtx.isPrewarming = true),
        (appCtx.samplingWindowStartMs = 0),
        updateShadowState(true, {
          preserveLightCache: true,
        }));
    } else
      appCtx.isPrewarming &&
        (ctx.presentationHandle = window.setTimeout(() => {
          ((ctx.presentationHandle = null),
            (appCtx.isPrewarming = false),
            resetFrameSamples(),
            (appCtx.samplingWindowStartMs = 0),
            updateShadowState(appCtx.isRenderSuppressed, {
              preserveLightCache: true,
            }));
        }, 140));
  }
  function normalizeLightBrightness(runStudioRenderLoopLightObject: any, brightnessPercent: any) {
    const normalizeLightBrightnessLightBrightnessRatio =
      clamp2(finite2(brightnessPercent, 0), 0, 150) / 100;
    return isEmbedStageMode
      ? normalizeLightBrightnessLightBrightnessRatio
      : runStudioRenderLoopLightObject.type === "striplight"
        ? Math.pow(normalizeLightBrightnessLightBrightnessRatio, 0.82)
        : spotLightBrightnessResponse2(
            runStudioRenderLoopLightObject.type,
            normalizeLightBrightnessLightBrightnessRatio,
          ) * Math.max(1, normalizeLightBrightnessLightBrightnessRatio);
  }
  function computeDownlightRange(runStudioRenderLoopLightItem: any) {
    const downlight7 =
        (lightPresetCatalog as any)[runStudioRenderLoopLightItem.type] || lightPresetCatalog.downlight,
      downlightTypeScale = (lightIntensityFactor as any)[runStudioRenderLoopLightItem.type] || 1.1;
    if (runStudioRenderLoopLightItem.type !== "striplight")
      return (
        (runStudioRenderLoopLightItem.type === "ceilinglight" ? 680 : 520) * downlightTypeScale
      );
    const downlightRange = clamp2(
        finite2(runStudioRenderLoopLightItem.lightRange, downlight7.range),
        0.5,
        10,
      ),
      downlightElevation = Math.max(finite2(runStudioRenderLoopLightItem.elevation, 2.7), 0.4);
    return (
      48 *
      clamp2(downlightRange / downlight7.range, 0.45, 1.65) *
      clamp2(Math.max(1, Math.pow(downlightElevation / 2.7, 2)), 1, 4) *
      downlightTypeScale
    );
  }
  function applySpotLightState(spotLightUpdater: any, spotLightState: any) {
    ((spotLightUpdater.intensity = spotLightState.intensity),
      spotLightUpdater.color.fromArray(spotLightState.color),
      (spotLightUpdater.visible = spotLightState.intensity > 0.000001 || !spotLightState.complete));
  }
  function sampleLightTransitions(transitionTimestamp: any, immediateTransition = false) {
    if (appCtx.prewarmState === controlsRestoreOptions) {
      if (
        ((ctx.pendingCameraState !== appCtx.sceneRootNode ||
          ctx.pendingTransitionSpec !== appCtx.sceneRootNode?.children[0]) &&
          ((ctx.pendingCameraState = appCtx.sceneRootNode),
          (ctx.pendingTransitionSpec = appCtx.sceneRootNode?.children[0]),
          (ctx.runStudioRenderLoopLightsByItemKey = buildLightCacheMap()),
          (ctx.lightRecordsByItemKey = new Map(
            collectLampEntries().map((lightRecordEntry: any) => [
              lightRecordEntry.itemKey,
              lightRecordEntry,
            ]),
          )),
          (ctx.shouldResetCamera = true)),
        immediateTransition || ctx.shouldResetCamera)
      )
        for (const [lightItemKey, groupedLights] of ctx.runStudioRenderLoopLightsByItemKey) {
          const lightRecord = ctx.lightRecordsByItemKey.get(lightItemKey);
          if (!lightRecord) continue;
          const shouldLightBeOn =
            lightRecord.group?.enabled !== false && lightRecord.item.lightBrightness > 0;
          for (const managedLight of groupedLights)
            ((managedLight.intensity = shouldLightBeOn
              ? finite2(managedLight.userData.lightOnIntensity, 0)
              : 0),
              (managedLight.visible = shouldLightBeOn),
              managedLight.color.setHex(
                lightEffectColorHex2(
                  lightRecord.item.lightTemperature,
                  lightRecord.item.lightColorRgb,
                ),
              ));
        }
      ctx.shouldResetCamera = false;
    }
    for (const [transitionLight, lightTransition] of lightTransitionsByLight)
      applySpotLightState(
        transitionLight,
        sampleLightTransition2(lightTransition, transitionTimestamp),
      );
  }
  function sampleTransitionProgress(sampledTransition: any, sampleTimestamp: any) {
    const transitionProgress = sampledTransition.duration
      ? clamp2((sampleTimestamp - sampledTransition.started) / sampledTransition.duration, 0, 1)
      : 1;
    return (
      sampledTransition.from +
      (sampledTransition.to - sampledTransition.from) *
        transitionProgress *
        transitionProgress *
        (3 - 2 * transitionProgress)
    );
  }
  function onLightsChanged() {
    (ctx.renderTickCounter && cancelAnimationFrame(ctx.renderTickCounter),
      (ctx.renderTickCounter = 0),
      lightTransitionsByKey.clear(),
      (appCtx.isPrecompilePending = false));
  }
  function resetLightTransitions(changedTimestamp: any) {
    if (
      ((ctx.renderTickCounter = 0),
      !appCtx.isCacheReady || appCtx.isFrameDirty || previewLightCacheCanvasElement.hidden || appCtx.prewarmState)
    ) {
      onLightsChanged();
      return;
    }
    for (const [resetLight, resetTransition] of lightTransitionsByKey)
      (appCtx.lightGainByFloor.set(
        resetLight,
        sampleTransitionProgress(resetTransition, changedTimestamp),
      ),
        changedTimestamp >= resetTransition.started + resetTransition.duration &&
          lightTransitionsByKey.delete(resetLight));
    ((appCtx.isPrecompilePending = lightTransitionsByKey.size > 0),
      restoreLightVisibility(),
      lightTransitionsByKey.size &&
        (ctx.renderTickCounter = requestAnimationFrame(resetLightTransitions)));
  }
  function applyLightStates(lightStateMap: any, applyTimestamp: any, lightApplyOptions: any) {
    if (
      !appCtx.isCacheReady ||
      appCtx.isFrameDirty ||
      appCtx.isCapturingLights ||
      previewLightCacheCanvasElement.hidden ||
      appCtx.prewarmState ||
      ctx.isSnapshotMode ||
      ctx.isViewTransitioning
    )
      return false;
    const visibleLightEntries = [...lightStateMap.values()].filter(
      (floorLightEntry) =>
        getPreviewFloorMode() === "all" || floorLightEntry.floorId === appCtx.activeFloorId,
    );
    if (
      !visibleLightEntries.every(
        (lightStateEntry) =>
          !lightStateEntry.colorChanged &&
          lightStateEntry.previousBrightness === lightStateEntry.item.lightBrightness &&
          lightStateEntry.previousKelvin === lightStateEntry.item.lightTemperature &&
          appCtx.lightGroupCacheByFloor.has(
            composeLightGroupKey(lightStateEntry.floorId, lightStateEntry.item.lightGroupId),
          ),
      )
    )
      return false;
    const applyNow = performance.now();
    for (const appliedLightState of visibleLightEntries) {
      const es2 = composeLightGroupKey(
          appliedLightState.floorId,
          appliedLightState.item.lightGroupId,
        ),
        existingLightTransition = lightTransitionsByKey.get(es2),
        lightOnProgress = existingLightTransition
          ? sampleTransitionProgress(existingLightTransition, applyNow)
          : finite2(appCtx.lightGainByFloor.get(es2), appliedLightState.wasOn ? 1 : 0);
      lightTransitionsByKey.set(es2, {
        from: lightOnProgress,
        to: appliedLightState.isOn ? 1 : 0,
        started: applyNow,
        duration: lightTransitionDurationMs2(
          appliedLightState.wasOn,
          appliedLightState.isOn,
          appliedLightState.fadeDuration,
          {
            ...lightApplyOptions,
            immediate: applyTimestamp,
          },
        ),
      });
    }
    return (
      ctx.renderTickCounter && cancelAnimationFrame(ctx.renderTickCounter),
      resetLightTransitions(applyNow),
      true
    );
  }
  function resetLightEffectStates() {
    const previousTransitionsByKey = new Map(lightTransitionsByKey);
    (onLightsChanged(),
      (appCtx.prewarmState = controlsRestoreOptions),
      ctx.overviewTimeoutHandle !== null && window.clearTimeout(ctx.overviewTimeoutHandle),
      (ctx.overviewTimeoutHandle = null),
      window.clearTimeout(appCtx.renderCommitTimeoutId),
      (appCtx.renderCommitTimeoutId = null),
      (appCtx.modelRevisionCounter += 1),
      (appCtx.isFrameDirty = true),
      appCtx.isCapturingLights || restorePreviewAfterFade(),
      setFadeOverlay(false));
    const fr3 = collectLampEntries();
    ((ctx.runStudioRenderLoopLightsByItemKey = ensureLightCache(fr3)),
      (ctx.lightRecordsByItemKey = new Map(
        fr3.map((resetRecordEntry: any) => [resetRecordEntry.itemKey, resetRecordEntry]),
      )),
      (ctx.pendingCameraState = appCtx.sceneRootNode),
      (ctx.pendingTransitionSpec = appCtx.sceneRootNode?.children[0]),
      (ctx.shouldResetCamera = true));
    const resetNow = performance.now();
    for (const resetRecord of fr3) {
      const previousTransition = previousTransitionsByKey.get(resetRecord.groupKey);
      if (!previousTransition) continue;
      const resetProgress = sampleTransitionProgress(previousTransition, resetNow);
      for (const restoredLight of ctx.runStudioRenderLoopLightsByItemKey.get(resetRecord.itemKey) ||
        []) {
        const resetLightEffectStatesLightOnIntensity = finite2(
            restoredLight.userData.lightOnIntensity,
            0,
          ),
          array = restoredLight.color.toArray();
        lightTransitionsByLight.set(
          restoredLight,
          createLightTransition2(
            {
              intensity: resetLightEffectStatesLightOnIntensity * resetProgress,
              color: array,
            },
            {
              intensity: resetLightEffectStatesLightOnIntensity * previousTransition.to,
              color: array,
            },
            resetNow,
            Math.max(0, previousTransition.started + previousTransition.duration - resetNow),
          ),
        );
      }
    }
    return (
      lightTransitionsByLight.size &&
        !ctx.reflectionPassCounter &&
        (ctx.reflectionPassCounter = requestAnimationFrame(checkTransitionsSettled)),
      requestStudioRender(),
      ctx.runStudioRenderLoopLightsByItemKey
    );
  }
  function scheduleControlsRestore() {
    if (
      ((ctx.overviewTimeoutHandle = null),
      !(
        appCtx.isEnvironmentActive ||
        appCtx.isCurtainMoving ||
        appCtx.isVacuumMoving ||
        appCtx.isBackgroundMoving ||
        ctx.isSnapshotMode ||
        ctx.isViewTransitioning ||
        lightTransitionsByLight.size ||
        appCtx.prewarmState !== controlsRestoreOptions
      ))
    ) {
      if (appCtx.isCapturingLights || appCtx.isPrewarming) {
        ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 60);
        return;
      }
      ((appCtx.prewarmState = null),
        areLightsEnabled() && ((appCtx.isFrameDirty = true), scheduleStudioRender(0)));
    }
  }
  function checkTransitionsSettled(controlsTimestamp: any) {
    ((ctx.reflectionPassCounter = 0), sampleLightTransitions(controlsTimestamp));
    let hasPendingTransition = false;
    for (const [pendingLight, pendingTransition] of lightTransitionsByLight)
      controlsTimestamp - pendingTransition.started < pendingTransition.duration ||
        (lightTransitionsByLight.delete(pendingLight),
        pendingLight.visible || (hasPendingTransition = true));
    (hasPendingTransition &&
      (setupSceneShadows(appCtx.sceneRootNode, {
        rebuildAtlas: false,
      }),
      scheduleLightPrecompile()),
      renderStudioFrame(),
      lightTransitionsByLight.size
        ? (ctx.reflectionPassCounter = requestAnimationFrame(checkTransitionsSettled))
        : (applyLightTransitionFrame(false),
          appCtx.prewarmState === controlsRestoreOptions &&
            (ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 180))));
  }
  function hasActiveLightTransition() {
    (onLightsChanged(),
      ctx.reflectionPassCounter && cancelAnimationFrame(ctx.reflectionPassCounter),
      ctx.overviewTimeoutHandle !== null && window.clearTimeout(ctx.overviewTimeoutHandle),
      ctx.presentationHandle !== null && window.clearTimeout(ctx.presentationHandle),
      (ctx.reflectionPassCounter = 0),
      (ctx.overviewTimeoutHandle = null),
      (ctx.presentationHandle = null),
      (appCtx.isPrewarming = false));
    for (const [activeLight, activeTransition] of lightTransitionsByLight)
      applySpotLightState(activeLight, {
        ...activeTransition.to,
        complete: true,
      });
    (lightTransitionsByLight.clear(),
      (ctx.isViewTransitioning = false),
      ctx.runStudioRenderLoopLightsByItemKey.clear(),
      ctx.lightRecordsByItemKey.clear(),
      appCtx.prewarmState === controlsRestoreOptions && (appCtx.prewarmState = null));
  }
  const weakMap = new WeakMap();
  function applyLightEffects(
    lightEffectEntries: any,
    lightEffectOptions: LightEffectOptions = {},
  ) {
    const lightEffectsByKey = new Map(
        lightEffectEntries.map((lightEffectEntry: any) => [
          composeItemKey(lightEffectEntry.floorId, lightEffectEntry.groupId),
          lightEffectEntry,
        ]),
      ),
      isPartialUpdate = lightEffectOptions.partial === true;
    ((lightEffectEntries = isPartialUpdate
      ? [...lightEffectsByKey.values()]
      : appCtx.studioProject.floors.flatMap((effectFloor: any) =>
          (effectFloor.scene.lightGroups || []).map(
            (effectGroup: any) =>
              lightEffectsByKey.get(composeItemKey(effectFloor.id, effectGroup.id)) || {
                floorId: effectFloor.id,
                groupId: effectGroup.id,
                on: false,
                brightnessSupported: false,
                temperatureSupported: false,
              },
          ),
        )),
      ctx.isPresentationRunning ||
        ((ctx.isPresentationRunning = true),
        window.addEventListener("pagehide", hasActiveLightTransition, {
          once: true,
        })));
    const isImmediateTransition =
        lightEffectOptions.immediate === true ||
        !ctx.isEntranceComplete ||
        window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
      pendingEffectsByKey = new Map(),
      floorsByFloorId = new Map(
        appCtx.studioProject.floors.map((lightEffectOptionsFloorEntry: any) => [
          lightEffectOptionsFloorEntry.id,
          lightEffectOptionsFloorEntry,
        ]),
      ),
      lightEffectBucketsByFloor = new Map();
    for (const lightEffect of lightEffectEntries) {
      const lightEffectState = mapLightEffectState2(lightEffect),
        effectFloorRecord = floorsByFloorId.get(lightEffect.floorId) as any;
      if (!effectFloorRecord) continue;
      let lightEffectBucket = lightEffectBucketsByFloor.get(effectFloorRecord);
      if (!lightEffectBucket) {
        lightEffectBucket = {
          groups: new Map(
            (effectFloorRecord.scene.lightGroups || []).map((bucketGroup: any) => [
              bucketGroup.id,
              bucketGroup,
            ]),
          ),
          items: new Map(),
        };
        for (const effectSceneItem of effectFloorRecord.scene.items)
          if (lampItemTypeSet.has(effectSceneItem.type)) {
            const bucketItems = lightEffectBucket.items.get(effectSceneItem.lightGroupId) || [];
            (bucketItems.push(effectSceneItem),
              lightEffectBucket.items.set(effectSceneItem.lightGroupId, bucketItems));
          }
        lightEffectBucketsByFloor.set(effectFloorRecord, lightEffectBucket);
      }
      const effectLightGroup = lightEffectBucket.groups.get(lightEffect.groupId);
      if (!effectLightGroup) continue;
      const isLightGroupEnabled = effectLightGroup.enabled !== false,
        isLightOn = lightEffect.on === true;
      effectLightGroup.enabled = isLightOn;
      for (const effectLightItem of lightEffectBucket.items.get(effectLightGroup.id) || []) {
        const lightBrightness = effectLightItem.lightBrightness,
          lightTemperature = effectLightItem.lightTemperature,
          lightColorRgb = effectLightItem.lightColorRgb;
        weakMap.has(effectLightItem) ||
          weakMap.set(effectLightItem, {
            brightness: lightBrightness,
            kelvin: lightTemperature,
          });
        const previousLightValue = weakMap.get(effectLightItem);
        (Number.isFinite(lightEffectState.brightness)
          ? (effectLightItem.lightBrightness = lightEffectState.brightness)
          : lightEffect.brightnessSupported === false &&
            (effectLightItem.lightBrightness = previousLightValue.brightness),
          Number.isFinite(lightEffectState.kelvin)
            ? (effectLightItem.lightTemperature = lightEffectState.kelvin)
            : lightEffect.temperatureSupported === false &&
              (effectLightItem.lightTemperature = previousLightValue.kelvin),
          (effectLightItem.lightColorRgb = lightEffectState.colorRgb || null));
        const hasLightColorChanged =
          String(lightColorRgb || []) !== String(effectLightItem.lightColorRgb || []);
        (!ctx.hasControlsRestored &&
          !hasLightColorChanged &&
          isLightGroupEnabled === isLightOn &&
          lightBrightness === effectLightItem.lightBrightness &&
          lightTemperature === effectLightItem.lightTemperature) ||
          pendingEffectsByKey.set(composeItemKey(effectFloorRecord.id, effectLightItem.id), {
            item: effectLightItem,
            floorId: effectFloorRecord.id,
            wasOn: isLightGroupEnabled,
            isOn: isLightOn,
            previousBrightness: lightBrightness,
            previousKelvin: lightTemperature,
            previousColorRgb: lightColorRgb,
            colorChanged: hasLightColorChanged,
            fadeDuration: lightEffect.fadeDuration,
          });
      }
    }
    if (
      (isPartialUpdate || ((ctx.isEntranceComplete = true), (ctx.hasControlsRestored = false)),
      !pendingEffectsByKey.size)
    )
      return;
    const ht4 = areLightsEnabled();
    if (ht4 && applyLightStates(pendingEffectsByKey, isImmediateTransition, lightEffectOptions))
      return;
    let lightsByKey = buildLightCacheMap();
    const previousLightsByKey = lightsByKey;
    ht4
      ? (lightsByKey = resetLightEffectStates())
      : [...pendingEffectsByKey.keys()].some(
          (pendingLightKey) => !lightsByKey.has(pendingLightKey),
        ) &&
        (lightsByKey = ensureLightCache(
          collectLampEntries().filter((trackedLightRecord: any) =>
            pendingEffectsByKey.has(trackedLightRecord.itemKey),
          ),
        ));
    let shouldRefreshLights = false;
    const effectNow = performance.now();
    for (const [effectKey, effectState] of pendingEffectsByKey) {
      if (getPreviewFloorMode() !== "all" && effectState.floorId !== appCtx.activeFloorId) continue;
      const affectedLights = lightsByKey.get(effectKey);
      if (affectedLights?.length)
        for (const affectedLight of affectedLights) {
          const existingEffectTransition = lightTransitionsByLight.get(affectedLight),
            previousBrightnessRatio = normalizeLightBrightness(
              effectState.item,
              effectState.previousBrightness,
            ),
            baseLightIntensity =
              previousLightsByKey.get(effectKey)?.includes(affectedLight) &&
              previousBrightnessRatio > 1e-7 &&
              affectedLight.userData.lightOnIntensity > 0
                ? affectedLight.userData.lightOnIntensity / previousBrightnessRatio
                : computeDownlightRange(effectState.item),
            lightEffectOptionsTargetLightIntensity =
              baseLightIntensity *
              normalizeLightBrightness(effectState.item, effectState.item.lightBrightness),
            lightTargetState = {
              intensity: effectState.isOn ? lightEffectOptionsTargetLightIntensity : 0,
              color: new ns2.Color(
                lightEffectColorHex2(
                  effectState.item.lightTemperature,
                  effectState.item.lightColorRgb,
                ),
              ).toArray(),
            },
            currentTransitionSample = existingEffectTransition
              ? sampleLightTransition2(existingEffectTransition, effectNow)
              : null,
            lightStartState =
              !effectState.wasOn &&
              effectState.isOn &&
              (!currentTransitionSample || currentTransitionSample.intensity <= 0.000001)
                ? {
                    intensity: 0,
                    color: lightTargetState.color,
                  }
                : currentTransitionSample || {
                    intensity: ht4
                      ? effectState.wasOn
                        ? baseLightIntensity * previousBrightnessRatio
                        : 0
                      : affectedLight.intensity,
                    color: ht4
                      ? new ns2.Color(
                          lightEffectColorHex2(
                            effectState.previousKelvin,
                            effectState.previousColorRgb,
                          ),
                        ).toArray()
                      : affectedLight.color.toArray(),
                  };
          ((affectedLight.userData.lightOnIntensity = lightEffectOptionsTargetLightIntensity),
            (affectedLight.userData.lightBrightness = effectState.item.lightBrightness));
          const lightTransitionDurationMs = lightTransitionDurationMs2(
              effectState.wasOn,
              effectState.isOn,
              effectState.fadeDuration,
              {
                ...lightEffectOptions,
                immediate: isImmediateTransition,
                temperatureChanged:
                  effectState.colorChanged ||
                  effectState.previousKelvin !== effectState.item.lightTemperature,
              },
            ),
            newLightTransition = createLightTransition2(
              lightStartState,
              lightTargetState,
              effectNow,
              lightTransitionDurationMs,
            ),
            visible2 = affectedLight.visible;
          (applySpotLightState(
            affectedLight,
            sampleLightTransition2(newLightTransition, effectNow),
          ),
            (shouldRefreshLights ||= visible2 !== affectedLight.visible),
            lightTransitionDurationMs
              ? lightTransitionsByLight.set(affectedLight, newLightTransition)
              : lightTransitionsByLight.delete(affectedLight));
        }
    }
    (ht4 && sampleLightTransitions(effectNow),
      (shouldRefreshLights || ht4) &&
        setupSceneShadows(appCtx.sceneRootNode, {
          rebuildAtlas: false,
        }),
      shouldRefreshLights && scheduleLightPrecompile(),
      applyLightTransitionFrame(lightTransitionsByLight.size > 0),
      renderStudioFrame(),
      ctx.reflectionPassCounter ||
        (lightTransitionsByLight.size
          ? (ctx.reflectionPassCounter = requestAnimationFrame(checkTransitionsSettled))
          : ht4 && (ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 100))));
  }
  function syncViewOffset() {
    appCtx.threeRenderer.getSize(projectedScreenPoint);
    const viewOffsetWidth = Math.max(projectedScreenPoint.x || 1, 1),
      viewOffsetHeight = Math.max(projectedScreenPoint.y || 1, 1),
      viewOffsetSignature =
        viewOffsetWidth + "/" + viewOffsetHeight + "/" + ctx.stereoSampleIndex + "/" + appCtx.threeCamera.uuid;
    if (viewOffsetSignature === ctx.lastViewOffsetSignature) {
      syncSnapshotCamera();
      return;
    }
    ((ctx.lastViewOffsetSignature = viewOffsetSignature),
      ctx.stereoSampleIndex
        ? appCtx.threeCamera.setViewOffset(
            viewOffsetWidth,
            viewOffsetHeight,
            (viewOffsetWidth * ctx.stereoSampleIndex) / 2,
            0,
            viewOffsetWidth,
            viewOffsetHeight,
          )
        : appCtx.threeCamera.clearViewOffset(),
      syncSnapshotCamera());
  }
  function applyOrbitControlSettings() {
    ((appCtx.orbitControls.enablePan = ctx.shouldEnablePan),
      (appCtx.orbitControls.enableZoom = ctx.shouldEnableZoom),
      ctx.cameraViewMode === "horizontal" &&
        (appCtx.orbitControls.minPolarAngle = appCtx.orbitControls.maxPolarAngle = appCtx.orbitControls.getPolarAngle()),
      ctx.cameraViewMode === "vertical" &&
        (appCtx.orbitControls.minAzimuthAngle = appCtx.orbitControls.maxAzimuthAngle =
          appCtx.orbitControls.getAzimuthalAngle()));
  }
  function planToWorldForFloor(
    runStudioRenderLoopTargetFloorId: any,
    targetPlanX: any,
    targetPlanY: any,
    floorElevation = 0.1,
  ) {
    const targetFloorRecord = appCtx.studioProject.floors.find(
      (matchingFloor: any) => matchingFloor.id === runStudioRenderLoopTargetFloorId,
    );
    if (!targetFloorRecord) return null;
    const floorElevationFloorPixelsPerMeter =
      targetFloorRecord.scene.calibration?.pixelsPerMeter || 1;
    if (getPreviewFloorMode() === "all") {
      const sort9 = [...appCtx.studioProject.floors].sort(
          (firstElevationFloor, secondElevationFloor) =>
            firstElevationFloor.elevation - secondElevationFloor.elevation,
        ),
        $a5 = planToWorldPoint(targetFloorRecord, {
          x: targetPlanX,
          y: targetPlanY,
        });
      return new ns2.Vector3(
        $a5.x,
        sort9.indexOf(targetFloorRecord) * appCtx.studioProject.previewFloorGap + floorElevation,
        $a5.z,
      );
    }
    const floorElevationFloorModelOrigin = sceneModelOrigin2(
      targetFloorRecord.scene,
      targetFloorRecord,
    );
    return new ns2.Vector3(
      (targetPlanX - floorElevationFloorModelOrigin.x) / floorElevationFloorPixelsPerMeter,
      floorElevation,
      (targetPlanY - floorElevationFloorModelOrigin.y) / floorElevationFloorPixelsPerMeter,
    );
  }
  function cameraTargetForFloor(lookupFloorId: any) {
    if (!appCtx.studioProject.floors.some((presentFloor: any) => presentFloor.id === lookupFloorId))
      return null;
    const targetFloorPpm =
        appCtx.studioProject.floors.find((targetFloorEntry: any) => targetFloorEntry.id === lookupFloorId)
          ?.scene.calibration?.pixelsPerMeter || 1,
      floorTargetPoint = planToWorldForFloor(lookupFloorId, 0, 0, 0);
    return new ns2.Matrix4()
      .makeBasis(
        planToWorldForFloor(lookupFloorId, targetFloorPpm, 0, 0).sub(floorTargetPoint),
        new ns2.Vector3(0, 1, 0),
        planToWorldForFloor(lookupFloorId, 0, targetFloorPpm, 0).sub(floorTargetPoint),
      )
      .setPosition(floorTargetPoint);
  }
  function computeOverviewBox() {
    const ug3 = computeCourtyardBounds({
      physicalStack: appCtx.studioProject.uniformOverviewStack === true,
    });
    if (ug3) return ug3.getCenter(new ns2.Vector3());
    const isOverviewAllFloorsView = getPreviewFloorMode() === "all";
    if (isOverviewAllFloorsView && appCtx.studioProject.floors.length < 2) return null;
    const floors3 = isOverviewAllFloorsView
        ? appCtx.studioProject.floors
        : appCtx.studioProject.floors.filter((includedFloor: any) => includedFloor.id === appCtx.activeFloorId),
      computeOverviewBoxOverviewBoundsBox = new ns2.Box3();
    let maxFloorElevation = 0;
    for (const computeOverviewBoxOverviewFloor of floors3)
      for (const overviewWall of computeOverviewBoxOverviewFloor.scene.walls || []) {
        for (const wallPlanPoint of [overviewWall.start, overviewWall.end]) {
          if (
            !wallPlanPoint ||
            !Number.isFinite(wallPlanPoint.x) ||
            !Number.isFinite(wallPlanPoint.y)
          )
            continue;
          const $a6 = isOverviewAllFloorsView
            ? planToWorldPoint(computeOverviewBoxOverviewFloor, wallPlanPoint)
            : {
                x: wallPlanPoint.x,
                z: wallPlanPoint.y,
              };
          computeOverviewBoxOverviewBoundsBox.expandByPoint(new ns2.Vector3($a6.x, 0, $a6.z));
        }
        maxFloorElevation = Math.max(
          maxFloorElevation,
          finite2(
            overviewWall.height,
            computeOverviewBoxOverviewFloor.scene.settings?.wallHeight || 2.8,
          ),
        );
      }
    if (computeOverviewBoxOverviewBoundsBox.isEmpty()) return null;
    const center = computeOverviewBoxOverviewBoundsBox.getCenter(new ns2.Vector3());
    if (isOverviewAllFloorsView) {
      const floorElevations = floors3.map((stackFloor: any) => stackFloor.elevation),
        overviewStackGap =
          appCtx.studioProject.uniformOverviewStack === true
            ? Math.max(...floorElevations) - Math.min(...floorElevations)
            : (appCtx.studioProject.floors.length - 1) * appCtx.studioProject.previewFloorGap;
      return ((center.y = overviewStackGap / 2 + maxFloorElevation / 2), center);
    }
    return planToWorldForFloor(appCtx.activeFloorId, center.x, center.z, maxFloorElevation / 2);
  }
  function computeCameraTarget(targetVector: any) {
    const targetScopeKey = getPreviewFloorMode() === "all" ? "all" : appCtx.activeFloorId;
    if (
      ctx.renderRootRef !== appCtx.sceneRootNode ||
      ctx.renderKeyRef !== appCtx.sceneRevisionCount ||
      ctx.renderViewRef !== targetScopeKey
    ) {
      const floorOverviewBox = computeOverviewBox(),
        computedSceneBounds = floorOverviewBox
          ? null
          : computeSceneBounds({
              excludeModelLayers: retainedLayerKeySet,
            });
      ((ctx.renderRootRef = appCtx.sceneRootNode),
        (ctx.renderKeyRef = appCtx.sceneRevisionCount),
        (ctx.renderViewRef = targetScopeKey),
        (ctx.viewportBaseCamera =
          floorOverviewBox ||
          (computedSceneBounds.isEmpty()
            ? null
            : computedSceneBounds.getCenter(new ns2.Vector3()))));
    }
    return (ctx.viewportBaseCamera || targetVector).clone();
  }
  function configureOrbitControls() {
    if (
      (ctx.orbitTargetVector || (ctx.orbitTargetVector = computeCameraTarget(appCtx.orbitControls.target)),
      ctx.orbitTargetAnchor === appCtx.orbitControls)
    )
      return;
    const configureOrbitControlsOrbitControls = appCtx.orbitControls,
      activeCamera = appCtx.threeCamera,
      bind2 = configureOrbitControlsOrbitControls.update.bind(configureOrbitControlsOrbitControls);
    ctx.orbitTargetAnchor = configureOrbitControlsOrbitControls;
    let cachedOrbitShiftPivot: any = null,
      cachedOrbitShiftProject: any = null,
      cachedOrbitShiftScope: any = null,
      cachedOrbitShiftFloorGap: any = null,
      cachedOrbitShiftRuntimeSettings: any = null,
      cachedOrbitShiftOverview: any = null;
    const panCameraForward = () => {
        if (
          !ctx.isPerspectiveCameraMode ||
          !activeCamera.isPerspectiveCamera ||
          !ctx.cameraForwardVector ||
          ctx.isSnapshotMode
        )
          return;
        const normalize3 = configureOrbitControlsOrbitControls.target
            .clone()
            .sub(activeCamera.position)
            .normalize(),
          dot = ctx.cameraForwardVector.clone().sub(activeCamera.position).dot(normalize3);
        !Number.isFinite(dot) ||
          dot <= configureOrbitControlsOrbitControls.minDistance ||
          configureOrbitControlsOrbitControls.target
            .copy(activeCamera.position)
            .addScaledVector(normalize3, dot);
      },
      bind3 = configureOrbitControlsOrbitControls._pan.bind(configureOrbitControlsOrbitControls);
    configureOrbitControlsOrbitControls._pan = (panDeltaX: any, panDeltaY: any) => {
      panCameraForward();
      const zoom =
        ctx.isPerspectiveCameraMode && activeCamera.isPerspectiveCamera ? activeCamera.zoom : 1;
      return bind3(panDeltaX / zoom, panDeltaY / zoom);
    };
    for (const dollyMethodName of ["_dollyIn", "_dollyOut"]) {
      const bind4 = configureOrbitControlsOrbitControls[dollyMethodName].bind(
        configureOrbitControlsOrbitControls,
      );
      configureOrbitControlsOrbitControls[dollyMethodName] = (dollyDelta: any) => (
        panCameraForward(),
        bind4(dollyDelta)
      );
    }
    const queueControlsRestore = () => {
      appCtx.prewarmState === controlsRestoreOptions &&
        (ctx.overviewTimeoutHandle !== null && window.clearTimeout(ctx.overviewTimeoutHandle),
        (ctx.overviewTimeoutHandle = null),
        ctx.isViewTransitioning ||
          (ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 180)));
    };
    (configureOrbitControlsOrbitControls.addEventListener("start", () => {
      ctx.isSnapshotMode || (ctx.isViewTransitioning = true);
    }),
      configureOrbitControlsOrbitControls.addEventListener("change", () => {
        ctx.isSnapshotMode ||
          (ctx.isViewTransitioning &&
            areLightsEnabled() &&
            appCtx.prewarmState !== controlsRestoreOptions &&
            (resetLightEffectStates(),
            sampleLightTransitions(performance.now()),
            setupSceneShadows(appCtx.sceneRootNode, {
              rebuildAtlas: false,
            })),
          queueControlsRestore());
      }),
      configureOrbitControlsOrbitControls.addEventListener("end", () => {
        ctx.isSnapshotMode || ((ctx.isViewTransitioning = false), queueControlsRestore());
      }));
    let enabled2 = configureOrbitControlsOrbitControls.enabled;
    (Object.defineProperty(configureOrbitControlsOrbitControls, "enabled", {
      configurable: true,
      get: () => ctx.isOrbitEnabled && !ctx.isSnapshotMode && enabled2,
      set: (controlsSetState) => {
        enabled2 = controlsSetState === true;
      },
    }),
      Object.defineProperty(configureOrbitControlsOrbitControls, "enableRotate", {
        configurable: true,
        get: () => true,
        set() {},
      }),
      (configureOrbitControlsOrbitControls.update = (controlsDeltaTime: any) => {
        if (
          ctx.isSnapshotMode ||
          configureOrbitControlsOrbitControls !== appCtx.orbitControls ||
          activeCamera !== appCtx.threeCamera
        )
          return false;
        (ctx.orbitTargetVector ||
          (ctx.orbitTargetVector = computeCameraTarget(configureOrbitControlsOrbitControls.target)));
        const clone7 = activeCamera.quaternion.clone();
        if (
          getCameraView() === "top" &&
          (configureOrbitControlsOrbitControls._sphericalDelta.theta ||
            configureOrbitControlsOrbitControls._sphericalDelta.phi)
        ) {
          const sub2 = activeCamera.position
              .clone()
              .sub(configureOrbitControlsOrbitControls.target),
            targetDistance = Math.max(sub2.length(), 0.001);
          if (Math.hypot(sub2.x, sub2.z) < targetDistance * 0.00001 && sub2.y > 0) {
            const quaternion = new ns2.Vector3(0, 1, 0).applyQuaternion(activeCamera.quaternion);
            ((quaternion.y = 0),
              quaternion.normalize(),
              sub2.set(
                -quaternion.x * targetDistance * 0.000001,
                targetDistance,
                -quaternion.z * targetDistance * 0.000001,
              ),
              activeCamera.position.copy(configureOrbitControlsOrbitControls.target).add(sub2));
          }
          (activeCamera.up.set(0, 1, 0),
            configureOrbitControlsOrbitControls._quat.identity(),
            configureOrbitControlsOrbitControls._quatInverse.identity(),
            configureOrbitControlsOrbitControls._spherical.setFromVector3(sub2),
            (configureOrbitControlsOrbitControls.minPolarAngle = 0),
            (configureOrbitControlsOrbitControls.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE2),
            (configureOrbitControlsOrbitControls.minAzimuthAngle = -Infinity),
            (configureOrbitControlsOrbitControls.maxAzimuthAngle = Infinity),
            (cameraSettings().cameraView = "free"),
            (activeCamera.userData.cameraView = "free"),
            applyOrbitControlSettings());
        }
        const controlsUpdate = bind2(controlsDeltaTime);
        if (
          ctx.isSnapshotMode ||
          configureOrbitControlsOrbitControls !== appCtx.orbitControls ||
          activeCamera !== appCtx.threeCamera
        )
          return controlsUpdate;
        if (ctx.isOrbitEnabled && clone7.angleTo(activeCamera.quaternion) > 1e-7) {
          const orbitShiftScope = getPreviewFloorMode(),
            orbitShiftFloorGap = appCtx.pendingRuntimeSettings
              ? appCtx.studioProject?.exportFloorGap
              : appCtx.studioProject?.previewFloorGap,
            isOverviewOrbitShift =
              !!(appCtx.pendingRuntimeSettings && orbitShiftScope === "all" &&
                appCtx.studioProject?.uniformOverviewStack);
          if (
            !cachedOrbitShiftPivot ||
            cachedOrbitShiftProject !== appCtx.studioProject ||
            cachedOrbitShiftScope !== orbitShiftScope ||
            cachedOrbitShiftFloorGap !== orbitShiftFloorGap ||
            cachedOrbitShiftRuntimeSettings !== appCtx.pendingRuntimeSettings ||
            cachedOrbitShiftOverview !== isOverviewOrbitShift
          ) {
            const overviewOrbitPivot = isOverviewOrbitShift
                ? appCtx.overviewStackController?.getOrbitPivot?.()
                : null,
              fallbackPivotCenter = overviewOrbitPivot ? null : computeOverviewBox(),
              fallbackPivotBounds =
                overviewOrbitPivot || fallbackPivotCenter
                  ? null
                  : appCtx.sceneRootNode
                    ? computeSceneBounds({
                        excludeModelLayers: new Set(["items", "lights"]),
                      })
                    : null;
            ((cachedOrbitShiftPivot =
              overviewOrbitPivot?.clone() ||
              fallbackPivotCenter?.clone() ||
              (fallbackPivotBounds && !fallbackPivotBounds.isEmpty()
                ? fallbackPivotBounds.getCenter(new ns2.Vector3())
                : configureOrbitControlsOrbitControls.target.clone())),
              (cachedOrbitShiftProject = appCtx.studioProject),
              (cachedOrbitShiftScope = orbitShiftScope),
              (cachedOrbitShiftFloorGap = orbitShiftFloorGap),
              (cachedOrbitShiftRuntimeSettings = appCtx.pendingRuntimeSettings),
              (cachedOrbitShiftOverview = isOverviewOrbitShift));
          }
          const multiply = activeCamera.quaternion.clone().multiply(clone7.invert()),
            sub3 = cachedOrbitShiftPivot.clone().sub(configureOrbitControlsOrbitControls.target),
            sub4 = sub3.clone().sub(sub3.applyQuaternion(multiply));
          return (
            activeCamera.position.add(sub4),
            configureOrbitControlsOrbitControls.target.add(sub4),
            constrainCameraPosition2(
              activeCamera.position,
              configureOrbitControlsOrbitControls.target,
            ),
            activeCamera.lookAt(configureOrbitControlsOrbitControls.target),
            activeCamera.updateMatrixWorld(),
            configureOrbitControlsOrbitControls.dispatchEvent({
              type: "change",
            }),
            true
          );
        }
        return controlsUpdate;
      }));
  }
  ctx.reflectionModeIndex = isEmbeddedStage ? 0 : 1;
  const reflectionMaterialsByMesh = new WeakMap();
  ctx.isReflectionEnabled = !isEmbeddedStage;
  function applyReflectionVisibility() {
    if (!ctx.isReflectionEnabled) {
      for (const reflectionTarget of ctx.syncTargets)
        if (!(
          !reflectionTarget.userData?.floorPlanGroundShadow &&
          reflectionTarget.userData?.batchedWallContactShadowCount == null
        )) {
          for (const reflectionMaterial of [reflectionTarget.material].flat().filter(Boolean))
            (reflectionMaterialsByMesh.has(reflectionMaterial) ||
              reflectionMaterialsByMesh.set(reflectionMaterial, reflectionMaterial.opacity),
              (reflectionMaterial.opacity =
                reflectionMaterialsByMesh.get(reflectionMaterial) * ctx.reflectionModeIndex));
        }
      ctx.reflectionModeIndex === 1 && (ctx.isReflectionEnabled = true);
    }
  }
  function prepareReflectionTargets() {
    ((ctx.cameraRootRef !== appCtx.sceneRootNode || ctx.cameraFirstChildRef !== appCtx.sceneRootNode?.children[0]) &&
      ((ctx.cameraRootRef = appCtx.sceneRootNode),
      (ctx.cameraFirstChildRef = appCtx.sceneRootNode?.children[0]),
      (ctx.syncTargets = []),
      appCtx.sceneRootNode?.traverse((reflectionNode: any) => {
        (["background", "grid"].includes(reflectionNode.userData?.exportRole) ||
          reflectionNode.userData?.floorPlanGroundShadow === true ||
          reflectionNode.userData?.batchedWallContactShadowCount != null) &&
          ctx.syncTargets.push(reflectionNode);
      })),
      appCtx.backgroundController?.sync(ctx.syncTargets, ctx.isBackgroundVisible));
    for (const preparedReflectionTarget of ctx.syncTargets)
      preparedReflectionTarget.visible =
        ctx.isBackgroundVisible &&
        (!preparedReflectionTarget.userData.floorBackgroundHidden ||
          preparedReflectionTarget.userData.backgroundThemeKeepVisible === true) &&
        !preparedReflectionTarget.userData.backgroundThemeHidden;
    applyReflectionVisibility();
  }
  const isRenderLoopPerformanceDiagnostics =
      new URLSearchParams(globalThis.window?.location?.search || "").get(
        "performance-diagnostics",
      ) === "1",
    isBaselineGeometryMode =
      isRenderLoopPerformanceDiagnostics &&
      new URLSearchParams(window.location.search).get("geometry-detail") === "baseline",
    reflectionDetail = createReflectionDetail2({
      THREE: ns2,
      includeRuntime: !isBaselineGeometryMode,
      worldError: 0.06,
      ratio: 0.1,
      runtimeWorldError: 0.025,
      requestFrame: () => {
        (groundReflections.changed(), renderStudioFrame());
      },
    }),
    reflectionPasses = createReflectionPasses2({
      THREE: ns2,
      requestFrame: () => {
        (groundReflections.changed(), renderStudioFrame());
      },
    });
  reflectionPasses.options.small = false;
  const isReflectionDiagnosticsMode =
    new URLSearchParams(globalThis.window?.location?.search || "").get(
      "performance-diagnostics",
    ) === "1" && new URLSearchParams(window.location.search).get("reflection-work") === "baseline";
  ctx.previousReflectionEnabled = isEmbeddedStage;
  ctx.isReflectionDisabled = !isEmbeddedStage;
  ctx.reflectionDetailMode = isEmbeddedStage ? 0 : 1;
  ctx.shouldStartPresentation = !isEmbeddedStage;
  (appCtx.regionLightController?.setPresentationGain(ctx.reflectionDetailMode),
    appCtx.regionLightController?.setShadowPresentationGain(ctx.reflectionModeIndex));
  const progressListenerSet = new Set<(progress: number) => void>(),
    startupPresentation = createStartupPresentation2({
      coverWindow: window.parent,
      waitForEffects: true,
      onPreparationFrame: (preparationFrame: any) =>
        appCtx.contactShadowController?.prepareDuringEntrance?.(preparationFrame),
      onProgress: (startupProgress: any) => {
        (appCtx.overviewStackController?.setEntryProgress(startupProgress),
          appCtx.regionLightController?.setPresentationGain(startupProgress),
          renderStudioFrame());
      },
      onShadowsProgress: (shadowsProgress: any) => {
        (shadowsProgress > 0 &&
          !ctx.hasEffectsPrepared &&
          ((ctx.hasEffectsPrepared = true), stageLoadTiming("shadows-reveal-start")),
          (ctx.reflectionModeIndex = shadowsProgress),
          appCtx.regionLightController?.setShadowPresentationGain(shadowsProgress),
          applyReflectionVisibility(),
          renderStudioFrame());
      },
      onEffectsProgress: (effectsProgress: any) => {
        (effectsProgress > 0 &&
          !ctx.isStartupPresentationDone &&
          ((ctx.isStartupPresentationDone = true), stageLoadTiming("effects-reveal-start")),


          (ctx.reflectionDetailMode = effectsProgress));
        for (const progressListener of progressListenerSet) progressListener(effectsProgress);
      },
      onComplete: () => {
        stageLoadTiming("entry-finished");
      },
      onMotionComplete: () => {
        (stageLoadTiming("entry-motion-finished"),
          (ctx.isReflectionDisabled = true),
          appCtx.contactShadowController?.finishDeferredSurfaceBake?.(),
          renderStudioFrame());
      },
    });
  window.addEventListener(
    "pagehide",
    () => {
      (progressListenerSet.clear(), startupPresentation.dispose());
    },
    {
      once: true,
    },
  );
  const groundReflections = (appCtx.rendererLossHandler = createGroundReflections2({
      passes: reflectionPasses,
      detail: reflectionDetail,
      THREE: ns2,
      renderer: appCtx.threeRenderer,
      scene: appCtx.threeScene,
      ...interactionResourcePolicy.reflections,
      getRoot: () => appCtx.sceneRootNode,
      getSceneRevision: () => appCtx.sceneRevisionCount + ":" + appCtx.curtainFrameKey,
      floorLighting: isEmbedStageMode,
      persistentCache: isEmbedStageMode ? stageStartup2?.reflectionCache : null,
      getPersistentState: (floorId: any) => appCtx.regionLightController?.persistentKey?.(floorId),
      getPersistentMaterialState: (material: any) =>
        ctx.floorRetentionService?.persistentMaterialKey?.(material),
      getFloorCamera: (floorCamera: any, cameraFloorId: any) =>
        appCtx.overviewStackController?.reflectionCamera(floorCamera, cameraFloorId) || floorCamera,
      cull: !isReflectionDiagnosticsMode,
      maxResumeCapturesPerFrame: 1,
      syncLighting: (lightingCamera: any) =>
        isReflectionDiagnosticsMode
          ? appCtx.regionLightController?.sync(lightingCamera, true)
          : appCtx.regionLightController?.syncCamera(lightingCamera),
      requestFrame: () => renderStudioFrame(),
      getStateKey: () =>
        [
          appCtx.sceneRevisionCount,
          appCtx.isEnvironmentActive,
          appCtx.studioProject.uniformOverviewStack === true,
          isEmbedStageMode ? "" : appCtx.modelRevisionCounter,
          appCtx.isCacheReady,
          appCtx.threeRenderer.toneMappingExposure,
        ].join("|"),
    })),
    floorEffectsQuery = new URLSearchParams(globalThis.window?.location?.search || "").get(
      "floorEffects",
    );
  ctx.previousReflectionEnabled && groundReflections.setSuspended(true);
  const motionPresentation = createMotionPresentation2({
    reflections(reflectionsSuspended: any) {
      ((ctx.shouldSuspendReflections = reflectionsSuspended),
        groundReflections.setSuspended?.(
          ctx.previousReflectionEnabled || ctx.isReflectionsSuspended || reflectionsSuspended,
          {
            fade: !ctx.isReflectionsSuspended && !ctx.previousReflectionEnabled,
          },
        ));
    },
    shadows(shadowsEnabled: any) {
      (appCtx.contactShadowController?.setVisibleFloor?.(
        getPreviewFloorMode() === "all" ? null : appCtx.activeFloorId,
      ),
        appCtx.contactShadowController?.setMotion?.(shadowsEnabled));
    },
  });
  function applyShadowSettings(nextShadowsEnabled: any, prevShadowsEnabled: any) {
    const shadowSettingsChanged = nextShadowsEnabled && !prevShadowsEnabled;
    ((appCtx.threeRenderer.domElement.dataset.editorEffects = nextShadowsEnabled
      ? prevShadowsEnabled
        ? "light-preview"
        : "paused"
      : "runtime"),
      ctx.isReflectionsSuspended !== shadowSettingsChanged &&
        ((ctx.isReflectionsSuspended = shadowSettingsChanged),
        groundReflections.setSuspended?.(
          ctx.previousReflectionEnabled || ctx.isReflectionsSuspended || ctx.shouldSuspendReflections,
        ),
        renderStudioFrame()));
  }
  const We3 =
    (isEmbedStageMode || floorEffectsQuery === "follow") && floorEffectsQuery !== "deferred";
  const shadowIntensitiesByLight = new Map();
  function setShadowsEnabled(shadowEnabledFlag: any) {
    if (ctx.hasShadowBoost !== shadowEnabledFlag) {
      if (((ctx.hasShadowBoost = shadowEnabledFlag), We3)) {
        (shadowEnabledFlag && (ctx.isShadowBoostActive = appCtx.threeRenderer.shadowMap.autoUpdate),
          (appCtx.threeRenderer.shadowMap.autoUpdate = shadowEnabledFlag || ctx.isShadowBoostActive),
          (appCtx.threeRenderer.shadowMap.needsUpdate = true),
          appCtx.regionLightController?.setMotion?.(shadowEnabledFlag, true));
        return;
      }
      (shadowEnabledFlag
        ? ((ctx.shadowBoostStart = null),
          (ctx.isShadowBoostActive = appCtx.threeRenderer.shadowMap.autoUpdate),
          (appCtx.threeRenderer.shadowMap.autoUpdate = false),
          (appCtx.threeRenderer.shadowMap.needsUpdate = false),
          appCtx.threeScene.traverse((shadowNode: any) => {
            !shadowNode.isLight ||
              !shadowNode.castShadow ||
              !shadowNode.shadow ||
              (shadowIntensitiesByLight.has(shadowNode.shadow) ||
                shadowIntensitiesByLight.set(shadowNode.shadow, shadowNode.shadow.intensity ?? 1),
              (shadowNode.shadow.intensity = 0));
          }))
        : ((appCtx.threeRenderer.shadowMap.autoUpdate = ctx.isShadowBoostActive),
          (appCtx.threeRenderer.shadowMap.needsUpdate = true),
          (ctx.shadowBoostStart = performance.now())),
        appCtx.regionLightController?.setMotion?.(shadowEnabledFlag));
    }
  }
  function updateShadowBoost() {
    if (ctx.hasShadowBoost || ctx.shadowBoostStart === null) return;
    const shadowBoostProgress = Math.min(1, (performance.now() - ctx.shadowBoostStart) / 280);
    for (const [boostedLight, baselineIntensity] of shadowIntensitiesByLight)
      boostedLight.intensity = baselineIntensity * shadowBoostProgress;
    shadowBoostProgress < 1
      ? renderStudioFrame()
      : (shadowIntensitiesByLight.clear(), (ctx.shadowBoostStart = null));
  }
  const scheduleTask = (schedulerKey: any, schedulerWork: any) =>
    typeof measureFloorSwitchPhase == "function"
      ? measureFloorSwitchPhase(schedulerKey, schedulerWork)
      : schedulerWork();
  function suspendReflections(suspendedFlag: any) {
    (motionPresentation.floor(suspendedFlag), setShadowsEnabled(suspendedFlag));
  }
  const floorTransition = createFloorTransition2({
      THREE: ns2,
      getRoot: () => appCtx.sceneRootNode,
      dispose: disposeObjectTree,
      release: retainFloorNode,
      suspendReflections: suspendReflections,
      invalidate: (invalidatedFloorId) => {
        (invalidatedFloorId &&
          ((ctx.orbitTargetVector = null),
          (ctx.renderRootRef = null),
          (ctx.renderKeyRef = undefined),
          (ctx.viewportBaseCamera = null),
          configureOrbitControls()),
          We3 && !invalidatedFloorId && computeSceneExtent(),
          refreshSceneRender(
            invalidatedFloorId
              ? {
                  scene: true,
                  shadows: true,
                }
              : {
                  preserveLightCache: true,
                },
          ));
      },
    }),
    recordsByFloorId = new Map();
  function invalidateFloorTransition(resolvedFloorId: any) {
    const floorTransitionRecord = floorTransition.records.find(
      (transitionRecord: any) => transitionRecord.id === resolvedFloorId,
    );
    if (floorTransitionRecord)
      return (
        floorTransitionRecord.node.updateWorldMatrix(true, false),
        floorTransitionRecord.node.matrixWorld.clone().multiply(floorTransitionRecord.baseFrame)
      );
    const sceneSnapshotKeys = [
      appCtx.sceneRootNode,
      appCtx.studioProject,
      appCtx.sceneRevisionCount,
      getPreviewFloorMode(),
      appCtx.studioProject.previewFloorGap,
    ];
    return (
      sceneSnapshotKeys.some(
        (snapshotItem, snapshotIndex) => snapshotItem !== ctx.previousSceneSnapshot[snapshotIndex],
      ) && ((ctx.previousSceneSnapshot = sceneSnapshotKeys), recordsByFloorId.clear()),
      recordsByFloorId.has(resolvedFloorId) ||
        recordsByFloorId.set(resolvedFloorId, cameraTargetForFloor(resolvedFloorId)),
      recordsByFloorId.get(resolvedFloorId)
    );
  }
  (appCtx.contactShadowController?.setFrameProvider?.(invalidateFloorTransition),
    appCtx.regionLightController?.setMotionTransformProvider?.((motionNode: any) => {
      const motionRecord = floorTransition.records.find(
        (motionRecordEntry: any) => motionRecordEntry.id === motionNode,
      );
      return motionRecord
        ? (motionRecord.node.updateWorldMatrix(true, false),
          (motionRecord.lightingTransform ||= new ns2.Matrix4())
            .copy(motionRecord.node.matrixWorld)
            .invert()
            .premultiply(appCtx.sceneRootNode.matrixWorld))
        : null;
    }),
    globalThis.window?.addEventListener(
      "pagehide",
      () => {
        (floorTransition.finish(), trimRetainedFloors());
      },
      {
        once: true,
      },
    ),
    globalThis.window?.addEventListener("pagehide", () => groundReflections.dispose(), {
      once: true,
    }));
  const onBeforeRender = appCtx.threeScene.onBeforeRender,
    reflectionProbeMesh = new ns2.Mesh(
      new ns2.BufferGeometry().setAttribute("position", new ns2.Float32BufferAttribute([], 3)),
      new ns2.MeshBasicMaterial({
        colorWrite: false,
        depthWrite: false,
        depthTest: false,
      }),
    );
  ((reflectionProbeMesh.name = "interaction3d-curtain-shadow-refresh"),
    (reflectionProbeMesh.frustumCulled = false),
    (reflectionProbeMesh.renderOrder = -1000000000),
    reflectionProbeMesh.layers.enableAll(),
    (reflectionProbeMesh.onBeforeRender = () => {
      ctx.shouldRefreshGeometry &&
        !ctx.hasShadowBoost &&
        (ctx.shouldRefreshGeometry = appCtx.lightPrecompileController
          ? !appCtx.lightPrecompileController.refreshGeometry(appCtx.sceneRootNode, ctx.geometryBoxes)
          : false);
    }),
    appCtx.threeScene.add(reflectionProbeMesh),
    globalThis.window?.addEventListener(
      "pagehide",
      () => {
        (reflectionProbeMesh.removeFromParent(),
          reflectionProbeMesh.geometry.dispose(),
          reflectionProbeMesh.material.dispose());
      },
      {
        once: true,
      },
    ),
    (appCtx.threeScene.onBeforeRender = function (...renderArgs: any[]) {
      if (groundReflections.stats.inCapture) {
        isReflectionDiagnosticsMode && appCtx.regionLightController?.sync(renderArgs[2], true);
        return;
      }
      groundReflections.setInsideEnabled?.(getPreviewFloorMode() !== "all");
      if (
        (updateShadowBoost(),
        ctx.reflectionDetailMode === 0 && ctx.releaseStartupDeviceSync?.(),
        ctx.hasShadowBoost || scheduleTask("curtains", () => ctx.releaseCurtains?.()),
        scheduleTask("television-screens", () => ctx.releaseTelevisionScreens?.()),
        ctx.shouldRefreshGeometry && !ctx.hasShadowBoost)
      ) {
        (ctx.geometryRootRef !== appCtx.sceneRootNode || ctx.geometryKeyRef !== appCtx.sceneRevisionCount) &&
          ((ctx.geometryRootRef = appCtx.sceneRootNode),
          (ctx.geometryKeyRef = appCtx.sceneRevisionCount),
          (ctx.shadowLights = []),
          (ctx.geometryBoxes = []),
          appCtx.sceneRootNode?.updateWorldMatrix(true, true),
          appCtx.sceneRootNode?.traverse((probeNode: any) => {
            probeNode.userData?.environmentModelType === "curtain" &&
              ctx.geometryBoxes.push(new ns2.Box3().setFromObject(probeNode));
          }),
          appCtx.threeScene.traverse((sceneShadowNode: any) => {
            sceneShadowNode.isLight &&
              sceneShadowNode.castShadow &&
              sceneShadowNode.shadow &&
              ctx.shadowLights.push(sceneShadowNode);
          }));
        for (const shadowUpdateLight of ctx.shadowLights) shadowUpdateLight.shadow.needsUpdate = true;
        appCtx.contactShadowController?.invalidate(ctx.invalidationBounds, true);
      }
      if (
        (scheduleTask("lighting-and-contact", () => onBeforeRender?.apply(this, renderArgs)),
        ctx.hasShadowBoost ||
          (ctx.floorRetentionService?.setRoot(
            appCtx.sceneRootNode,
            appCtx.sceneRevisionCount + ":" + appCtx.curtainFrameKey,
          ),
          ctx.sceneRetentionService?.setRoot(appCtx.sceneRootNode, appCtx.sceneRevisionCount)),
        prepareReflectionTargets(),
        syncViewOffset(),
        ctx.previousReflectionEnabled &&
          ctx.isReflectionDisabled &&
          !appCtx.contactShadowController?.isPending?.() &&
          !appCtx.contactShadowController?.hasPendingSurfaces?.() &&
          ((ctx.previousReflectionEnabled = false),
          groundReflections.setSuspended(ctx.isReflectionsSuspended || ctx.shouldSuspendReflections, {

            fadeIn: true,
          }),
          groundReflections.changed(),
          stageLoadTiming("surface-shadows-ready"),
          startupPresentation.shadowsReady()),
        !ctx.previousReflectionEnabled &&


          (!appCtx.threeRenderer.getRenderTarget() || appCtx.shadowAtlasCanvas?.isScreenPass) &&
          (scheduleTask("reflections", () => {
            const renderGroundReflections = () =>
              groundReflections.render(renderArgs[2], {
                worldMatricesCurrent: true,
              });
            ctx.reflectionDetailMode < 1 && appCtx.regionLightController
              ? appCtx.regionLightController.withPresentationGain(1, renderGroundReflections)
              : renderGroundReflections();
          }),
          ctx.isReflectionDisabled &&
            !ctx.isShadowReady &&
            groundReflections.isPrepared() &&
            ((ctx.isShadowReady = true),
            stageLoadTiming("reflections-ready"),
            startupPresentation.effectsReady()),
          isRenderLoopPerformanceDiagnostics || isRenderStatsTest))
      ) {
        const reflectionStatsJson = JSON.stringify({
          ...groundReflections.stats,
          detail: reflectionDetail?.stats,
        });
        appCtx.threeRenderer.domElement.dataset.reflectionStats !== reflectionStatsJson &&
          (appCtx.threeRenderer.domElement.dataset.reflectionStats = reflectionStatsJson);
      }
      renderArgs[2] === appCtx.threeCamera &&
        (!appCtx.threeRenderer.getRenderTarget() || appCtx.shadowAtlasCanvas?.isScreenPass) &&
        (overviewDetail.prepare(appCtx.sceneRootNode, appCtx.sceneRevisionCount),
        overviewDetail.begin(renderArgs[2]),
        isRenderLoopPerformanceDiagnostics &&
          (appCtx.threeRenderer.domElement.dataset.overviewDetailStats = JSON.stringify(
            overviewDetail.stats,
          )));
    }));
  const overviewDetail = createOverviewDetail2({
    THREE: ns2,
    renderer: appCtx.threeRenderer,
    scene: appCtx.threeScene,
    getCamera: () => appCtx.threeCamera,
    getFloorId: overviewFloorId2,
    getFloorCamera: (overviewCamera, overviewFloorId) =>
      appCtx.overviewStackController?.cameraForFloor(overviewFloorId2(overviewCamera), overviewFloorId) ||
      overviewFloorId,
    enabled: () =>
      !isBaselineGeometryMode &&
      getPreviewFloorMode() === "all" &&
      !ctx.isPerspectiveCameraMode &&
      !ctx.stereoSampleIndex &&
      !ctx.isRenderLoopOverviewMode &&
      !ctx.hasShadowBoost &&
      ctx.isReflectionDisabled &&
      ctx.reflectionDetailMode === 1 &&
      !appCtx.pendingRuntimeSettings &&
      (!appCtx.threeRenderer.getRenderTarget() || appCtx.shadowAtlasCanvas?.isScreenPass),
    requestFrame: () => {
      (appCtx.compiledShaderCache?.clear(), renderStudioFrame());
    },
  });
  window.addEventListener("pagehide", () => overviewDetail.dispose(), {
    once: true,
  });
  const onAfterRender = appCtx.threeScene.onAfterRender;
  appCtx.threeScene.onAfterRender = function (...afterRenderArgs: any[]) {
    (onAfterRender?.apply(this, afterRenderArgs),
      ctx.isShadowReady &&
        ctx.reflectionDetailMode === 1 &&
        afterRenderArgs[2] === appCtx.threeCamera &&
        (!appCtx.threeRenderer.getRenderTarget() || appCtx.shadowAtlasCanvas?.isScreenPass) &&
        (appCtx.contactShadowController?.allowPersistence?.(),
        groundReflections.allowPersistence()),
      !ctx.shouldStartPresentation &&
        afterRenderArgs[2] === appCtx.threeCamera &&
        ctx.reflectionModeIndex > 0 &&
        ((ctx.shouldStartPresentation = true), renderStudioFrame()));
  };
  function buildCameraPose(poseTarget = appCtx.orbitControls.target.clone()) {
    const clone8 = appCtx.threeCamera.position.clone();
    (appCtx.orbitControls.dispose(),
      (appCtx.orbitControls = createOrbitControls(appCtx.threeCamera)),
      appCtx.threeCamera.position.copy(clone8),
      appCtx.orbitControls.target.copy(poseTarget));
    const poseDistance = Math.max(clone8.distanceTo(poseTarget), 0.001);
    ((appCtx.orbitControls.minDistance = Math.min(ctx.isPerspectiveCameraMode ? 0.1 : 2, poseDistance)),
      (appCtx.orbitControls.maxDistance = Math.max(100, poseDistance * 2)),
      (appCtx.orbitControls.minZoom = Math.min(0.35, appCtx.threeCamera.zoom)),
      (appCtx.orbitControls.maxZoom = Math.max(ctx.isPerspectiveCameraMode ? 100 : 6, appCtx.threeCamera.zoom)),
      (appCtx.orbitControls.maxPolarAngle = MAX_CAMERA_POLAR_ANGLE2),
      (appCtx.orbitControls.enableRotate = true),
      (appCtx.orbitControls.enabled = ctx.isOrbitEnabled),
      appCtx.orbitControls.update(),
      applyOrbitControlSettings(),
      configureOrbitControls(),
      syncViewOffset(),
      appCtx.threeCamera.updateMatrixWorld());
  }
  return {
    reportLifecycle(lifecycleEvent: any, lifecycleDetail: any) {
      emitRuntimeDiagnostic(lifecycleEvent, lifecycleDetail);
    },
    onCameraChange(changedCamera: any) {
      const domElement9 = appCtx.threeRenderer.domElement;
      return (
        domElement9.addEventListener("hb-i3d-camera-frame", changedCamera),
        () => domElement9.removeEventListener("hb-i3d-camera-frame", changedCamera)
      );
    },
    createFrameLoop: (frameLoopCallback: any) => createDemandFrameLoop2(frameLoopCallback),
    setPresentedVisible(presentedVisible: any) {
      appCtx.threeRenderer.domElement.dispatchEvent?.(
        new CustomEvent("hb-i3d-parent-visibility", {
          detail: presentedVisible === true,
        }),
      );
    },
    THREE: ns2,
    constrainCameraPose: constrainCameraPose2,
    container: selectElement("#preview-3d"),
    canvas: appCtx.threeRenderer.domElement,
    get groundReflections() {
      return groundReflections;
    },
    invalidateReflections(reflectionInvalidateReason: any) {
      groundReflections.changed(reflectionInvalidateReason);
    },
    get modelRoot() {
      return appCtx.sceneRootNode;
    },
    get retainedModelRoots() {
      return [...retainedFloorsByKey.values()].map((environmentEntry) => environmentEntry.node);
    },
    get overlayScene() {
      return appCtx.threeScene;
    },
    get backgroundFloor() {
      return getPreviewFloorMode() === "all" ? "all" : appCtx.activeFloorId;
    },
    get backgroundFloorTransition() {
      return floorTransition.active && ctx.unusedRenderState
        ? {
            from: ctx.unusedRenderState,
            amount: ctx.unusedRenderCounter,
          }
        : null;
    },
    get sceneRevision() {
      return appCtx.sceneRevisionCount;
    },
    get environmentRevision() {
      return appCtx.sceneRevisionCount + ":" + appCtx.curtainFrameKey;
    },
    prepareEnvironmentMaterials() {
      appCtx.regionLightController?.prepareMaterials();
    },
    setEnvironmentScene(environmentScene: any) {
      ctx.floorRetentionService = environmentScene;
    },
    setEnvironmentAirflow(environmentAirflow: any) {
      ctx.sceneRetentionService = environmentAirflow;
    },
    setCurtainSync(curtainSync: any) {
      ctx.releaseCurtains = curtainSync;
    },
    setTelevisionSync(televisionSync: any) {
      ctx.releaseTelevisionScreens = televisionSync;
    },
    setStartupDeviceSync(startupDeviceSync: any) {
      ctx.releaseStartupDeviceSync = startupDeviceSync;
    },
    curtainFrame({
      key: curtainKey,
      structure: curtainStructure,
      floorIds: curtainFloorIds = [],
      moving: runStudioRenderLoopIsCurtainMoving,
    }: any) {
      const hasCurtainKeyChanged = curtainKey !== appCtx.curtainStructureJson,
        Dr2 = appCtx.isCurtainMoving;
      if (!(!hasCurtainKeyChanged && Dr2 === runStudioRenderLoopIsCurtainMoving)) {
        if (hasCurtainKeyChanged)
          try {
            const parseCurtainFrame = (curtainPayloadJson: any) => {
                const curtainPanelsByKey = new Map();
                for (const curtainEntryPair of JSON.parse(curtainPayloadJson)) {
                  const curtainEntryValue = curtainEntryPair[1];
                  (curtainPanelsByKey.has(curtainEntryValue) ||
                    curtainPanelsByKey.set(curtainEntryValue, []),
                    curtainPanelsByKey.get(curtainEntryValue).push(curtainEntryPair));
                }
                return curtainPanelsByKey;
              },
              previousCurtainPanels = parseCurtainFrame(appCtx.curtainStructureJson),
              currentCurtainPanels = parseCurtainFrame(curtainKey);
            groundReflections.changed(
              [
                ...new Set([...previousCurtainPanels.keys(), ...currentCurtainPanels.keys()]),
              ].filter(
                (curtainPanelKey) =>
                  JSON.stringify(previousCurtainPanels.get(curtainPanelKey)) !==
                  JSON.stringify(currentCurtainPanels.get(curtainPanelKey)),
              ),
            );
          } catch {
            groundReflections.changed(curtainFloorIds);
          }
        (curtainStructure !== appCtx.curtainFrameKey &&
          (appCtx.lightPrecompileController?.prepareRoot(appCtx.sceneRootNode),
          appCtx.regionLightController?.invalidate()),
          (ctx.invalidationBounds = [...new Set([...ctx.backgroundBoundaries, ...curtainFloorIds])]),
          (ctx.backgroundBoundaries = curtainFloorIds),
          (hasCurtainKeyChanged || runStudioRenderLoopIsCurtainMoving) &&
            (Dr2 || (resetLightEffectStates(), sampleLightTransitions(performance.now(), true)),
            hasCurtainKeyChanged && (ctx.shouldRefreshGeometry = true),
            (appCtx.modelRevisionCounter += 1),
            (appCtx.isFrameDirty = true),
            setFadeOverlay(false)),
          (appCtx.curtainStructureJson = curtainKey),
          (appCtx.isCurtainMoving = runStudioRenderLoopIsCurtainMoving),
          (appCtx.curtainFrameKey = curtainStructure),
          runStudioRenderLoopIsCurtainMoving || scheduleControlsRestore(),
          renderStudioFrame());
      }
    },
    requestRender() {
      refreshSceneRender({
        preserveLightCache: true,
      });
    },
    setBackgroundTheme(backgroundTheme: any) {
      ((appCtx.backgroundController = backgroundTheme), prepareReflectionTargets());
    },
    backgroundFrame(backgroundValue: any, { separate: separateBackground = false } = {}) {
      const isBackgroundEnabled = backgroundValue === true;
      (isBackgroundEnabled !== appCtx.isBackgroundMoving &&
        ((appCtx.isBackgroundMoving = isBackgroundEnabled),
        isEmbedStageMode ||
          (isBackgroundEnabled
            ? (resetLightEffectStates(), sampleLightTransitions(performance.now(), true))
            : (appCtx.modelRevisionCounter++, (appCtx.isFrameDirty = true), scheduleControlsRestore()))),
        separateBackground && isBackgroundEnabled
          ? ((appCtx.isLightCacheDeferred = true), appCtx.lightingScheduler?.wake())
          : renderStudioFrame());
    },
    setVacuumMoving(vacuumMoving: any) {
      const isVacuumMovingRequested = vacuumMoving === true;
      isVacuumMovingRequested !== appCtx.isVacuumMoving &&
        ((appCtx.isVacuumMoving = isVacuumMovingRequested),
        appCtx.vacuumMoveCount++,
        isVacuumMovingRequested
          ? (resetLightEffectStates(), sampleLightTransitions(performance.now(), true))
          : (appCtx.modelRevisionCounter++, (appCtx.isFrameDirty = true), scheduleControlsRestore()),
        renderStudioFrame());
    },
    setLockMoving(lockMoving: any) {
      const isLockMovingRequested = lockMoving === true;
      isLockMovingRequested !== appCtx.isLockMoving &&
        ((appCtx.isLockMoving = isLockMovingRequested),
        appCtx.lockMoveCount++,
        isLockMovingRequested
          ? (resetLightEffectStates(), sampleLightTransitions(performance.now(), true))
          : (appCtx.modelRevisionCounter++, (appCtx.isFrameDirty = true), scheduleControlsRestore()),
        renderStudioFrame());
    },
    environmentModelPose(environmentPose: any, poseFloorId: any) {
      let poseRoot: any;
      if (
        (appCtx.sceneRootNode?.traverse((poseCandidateNode: any) => {
          poseCandidateNode.userData?.environmentFloorId === environmentPose &&
            poseCandidateNode.userData?.environmentModelId === poseFloorId &&
            (poseRoot = poseCandidateNode);
        }),
        !poseRoot)
      )
        return null;
      ((poseRoot = poseRoot.userData.vacuumMobileRoot || poseRoot),
        poseRoot.updateWorldMatrix(true, true));
      const poseBoundsBox = new ns2.Box3(),
        poseResultBox = new ns2.Box3();
      return (
        poseRoot.traverse((poseMesh: any) => {
          if (!(!poseMesh.isMesh || !poseMesh.geometry)) {
            for (
              let poseAncestorNode = poseMesh;
              poseAncestorNode && poseAncestorNode !== poseRoot;
              poseAncestorNode = poseAncestorNode.parent
            )
              if (poseAncestorNode.userData?.environmentEffect) return;
            (poseMesh.geometry.computeBoundingBox(),
              poseMesh.geometry.boundingBox &&
                poseBoundsBox.union(
                  poseResultBox
                    .copy(poseMesh.geometry.boundingBox)
                    .applyMatrix4(poseMesh.matrixWorld),
                ));
          }
        }),
        poseBoundsBox.isEmpty()
          ? null
          : {
              center: poseBoundsBox.getCenter(new ns2.Vector3()).toArray(),
              size: poseBoundsBox.getSize(new ns2.Vector3()).toArray(),
              forward: new ns2.Vector3(0, 0, 1).transformDirection(poseRoot.matrixWorld).toArray(),
            }
      );
    },
    setEnvironmentActive(environmentActive: any) {
      const isEnvironmentActiveRequested = environmentActive === true;
      isEnvironmentActiveRequested !== appCtx.isEnvironmentActive &&
        (isEnvironmentActiveRequested &&
          (resetLightEffectStates(), sampleLightTransitions(performance.now(), true)),
        (appCtx.isEnvironmentActive = isEnvironmentActiveRequested),
        isEnvironmentActiveRequested || scheduleControlsRestore(),
        refreshSceneRender());
    },
    pickEnvironmentModel(
      pointerClientX: any,
      pointerClientY: any,
      pickFloorEntries: any[] = [],
      pickSpreadRadius = 0,
    ) {
      if (!appCtx.sceneRootNode || !pickFloorEntries.length) return null;
      const canvasClientRect = appCtx.threeRenderer.domElement.getBoundingClientRect();
      if (!canvasClientRect.width || !canvasClientRect.height) return null;
      const usedModelKeySet = new Set(
          pickFloorEntries.map((usedModelEntry) =>
            JSON.stringify([usedModelEntry.floorId, usedModelEntry.modelId]),
          ),
        ),
        entriesByMesh = new Map(),
        pickableMeshes: any = [],
        visitedModelKeySet = new Set();
      (appCtx.sceneRootNode.updateWorldMatrix(true, true),
        appCtx.threeCamera.updateMatrixWorld(),
        appCtx.sceneRootNode.traverse((pickMesh: any) => {
          if (!pickMesh.isMesh) return;
          let currentPickEntry: any = null;
          for (
            let pickAncestorNode = pickMesh;
            pickAncestorNode;
            pickAncestorNode = pickAncestorNode.parent
          ) {
            if (!pickAncestorNode.visible || pickAncestorNode.userData?.environmentEffect) return;
            !currentPickEntry &&
              pickAncestorNode.userData?.environmentModelId &&
              (currentPickEntry = {
                modelId: pickAncestorNode.userData.environmentModelId,
                floorId: pickAncestorNode.userData.environmentFloorId,
              });
          }
          !currentPickEntry ||
            !usedModelKeySet.has(
              JSON.stringify([currentPickEntry.floorId, currentPickEntry.modelId]),
            ) ||
            !(Array.isArray(pickMesh.material) ? pickMesh.material : [pickMesh.material]).some(
              (renderableNode: any) =>
                renderableNode && renderableNode.visible !== false && renderableNode.opacity !== 0,
            ) ||
            (entriesByMesh.set(pickMesh, currentPickEntry),
            pickableMeshes.push(pickMesh),
            pickMesh.userData?.curtainMotionPanel &&
              visitedModelKeySet.add(
                JSON.stringify([currentPickEntry.floorId, currentPickEntry.modelId]),
              ));
        }));
      const renderedMeshes = pickableMeshes.filter((filterMesh: any) => {
          const meshEntry = entriesByMesh.get(filterMesh);
          return (
            !visitedModelKeySet.has(JSON.stringify([meshEntry.floorId, meshEntry.modelId])) ||
            filterMesh.userData?.curtainMotionPanel
          );
        }),
        pickRaycaster = new ns2.Raycaster(),
        clampedSpreadRadius = Math.max(0, Math.min(12, pickSpreadRadius)),
        sampleOffsets = [
          [0, 0],
          ...(clampedSpreadRadius
            ? [
                [clampedSpreadRadius, 0],
                [-clampedSpreadRadius, 0],
                [0, clampedSpreadRadius],
                [0, -clampedSpreadRadius],
                [clampedSpreadRadius * 0.7, clampedSpreadRadius * 0.7],
                [-clampedSpreadRadius * 0.7, clampedSpreadRadius * 0.7],
                [clampedSpreadRadius * 0.7, -clampedSpreadRadius * 0.7],
                [-clampedSpreadRadius * 0.7, -clampedSpreadRadius * 0.7],
              ]
            : []),
        ],
        objectsByMesh = new Map();
      for (const raycastMesh of renderedMeshes) {
        const floorId = entriesByMesh.get(raycastMesh).floorId;
        (objectsByMesh.has(floorId) || objectsByMesh.set(floorId, []),
          objectsByMesh.get(floorId).push(raycastMesh));
      }
      for (const [sampleOffsetX, sampleOffsetY] of sampleOffsets) {
        const sampleNdcPoint = new ns2.Vector2(
          ((pointerClientX + sampleOffsetX - canvasClientRect.left) / canvasClientRect.width) * 2 -
            1,
          1 -
            ((pointerClientY + sampleOffsetY - canvasClientRect.top) / canvasClientRect.height) * 2,
        );
        let nearestHit: any = null;
        for (const [raycastObject, raycastTargets] of objectsByMesh) {
          appCtx.overviewStackController
            ? appCtx.overviewStackController.rayForFloor(raycastObject, sampleNdcPoint, pickRaycaster)
            : pickRaycaster.setFromCamera(sampleNdcPoint, appCtx.threeCamera);
          for (const rayIntersection of pickRaycaster.intersectObjects(raycastTargets, false)) {
            const hitMaterial = Array.isArray(rayIntersection.object.material)
              ? rayIntersection.object.material[rayIntersection.face?.materialIndex || 0]
              : rayIntersection.object.material;
            hitMaterial?.visible !== false &&
              hitMaterial?.opacity !== 0 &&
              (!nearestHit || rayIntersection.distance < nearestHit.distance) &&
              (nearestHit = rayIntersection);
          }
        }
        if (nearestHit) return entriesByMesh.get(nearestHit.object);
      }
      return null;
    },
    get camera() {
      return appCtx.threeCamera;
    },
    presentationCamera(presentationCameraRoot: any) {
      if (typeof presentationCameraRoot != "string")
        for (
          let presentationAncestor = presentationCameraRoot;
          presentationAncestor;
          presentationAncestor = presentationAncestor.parent
        ) {
          const presentationFloorId =
            presentationAncestor.userData?.floorId ||
            presentationAncestor.userData?.environmentFloorId ||
            presentationAncestor.userData?.regionFloorId;
          if (presentationFloorId) {
            presentationCameraRoot = String(presentationFloorId);
            break;
          }
        }
      return appCtx.overviewStackController?.cameraForFloor(presentationCameraRoot) || appCtx.threeCamera;
    },
    presentationRay(rayCamera: any, rayClientX: any, rayClientY: any) {
      return appCtx.overviewStackController
        ? appCtx.overviewStackController.rayForFloor(rayCamera, rayClientX, rayClientY)
        : (rayClientY.setFromCamera(rayClientX, appCtx.threeCamera), rayClientY);
    },
    get controls() {
      return appCtx.orbitControls;
    },
    get document() {
      return appCtx.studioProject;
    },
    get defaults() {
      return DEFAULT_BASE_LIGHTING2;
    },
    get regionLighting() {
      return appCtx.regionLightController;
    },
    invalidateRegionLighting() {
      (appCtx.regionLightController?.sync(appCtx.threeCamera), renderStudioFrame());
    },
    transformCamera(cameraFromState: any, cameraToState: any, immediateCameraTransform = false) {
      return transformSceneCamera2(
        cameraFromState,
        zn4,
        appCtx.studioProject,
        cameraToState,
        immediateCameraTransform,
      );
    },
    async readSceneUpdate(sceneUpdatePayload: any) {
      const sceneUpdateParams = new URLSearchParams(window.location.search),
        sceneUpdateQuery = new URLSearchParams({
          projectId: sceneUpdateParams.get("projectId") || "",
          since: appCtx.loadedDraft.syncKey || "",
        }),
        sceneUpdateResponse = await withRequestTimeout2(
          15000,
          async (sceneUpdatePayloadAbortSignal) => {
            const sceneUpdateFetchResponse = await fetch(
              "/api/v1/modules/interaction3d/scenes/" +
                encodeURIComponent(sceneUpdateParams.get("sceneId") || "") +
                "/current?" +
                sceneUpdateQuery,
              {
                credentials: "same-origin",
                signal: sceneUpdatePayloadAbortSignal,
              },
            );
            if (sceneUpdateFetchResponse.status === 204) return null;
            if (!sceneUpdateFetchResponse.ok) throw new Error("户型同步暂时不可用");
            return sceneUpdateFetchResponse.json();
          },
          sceneUpdatePayload,
        );
      if (!sceneUpdateResponse) return null;
      const sceneUpdatePlan = sceneUpdatePlan2(
        normalizeStudioDocument(appCtx.loadedDraft.scene, studioDocumentDeps()),
        normalizeStudioDocument(sceneUpdateResponse.scene, studioDocumentDeps()),
      );
      if (!sceneUpdatePlan.full && !sceneUpdatePlan.floors.length) {
        const zn5 = normalizeStudioDocument(sceneUpdateResponse.scene, studioDocumentDeps());
        appCtx.studioProject.baseLighting = zn5.baseLighting;
        for (const updatedFloorEntry of zn5.floors) {
          const localFloorRecord = appCtx.studioProject.floors.find(
            (existingFloorRecord: any) => existingFloorRecord.id === updatedFloorEntry.id,
          );
          localFloorRecord && (localFloorRecord.name = updatedFloorEntry.name);
        }
        return (
          sceneUpdatePlan.lighting &&
            !ctx.hasBaseLightingApplied &&
            (trimRetainedFloors(), applyBaseLighting(zn5.baseLighting)),
          (appCtx.loadedDraft = sceneUpdateResponse),
          null
        );
      }
      return sceneUpdateResponse;
    },
    get savedScene() {
      return appCtx.loadedDraft;
    },
    async replaceScene(replacementScene: any) {
      const zn6 = normalizeStudioDocument(replacementScene.scene, studioDocumentDeps()),
        replaceScenePlan = sceneUpdatePlan2(normalizeStudioDocument(appCtx.loadedDraft.scene, studioDocumentDeps()), zn6);
      if (
        (floorTransition.finish(),
        trimRetainedFloors(
          replaceScenePlan.full || replaceScenePlan.lighting
            ? null
            : new Set(replaceScenePlan.floors),
        ),
        hasActiveLightTransition(),
        (ctx.cameraRestoreState = null),
        (ctx.orbitTargetVector = null),
        (ctx.renderRootRef = null),
        (ctx.renderKeyRef = undefined),
        (ctx.viewportBaseCamera = null),
        (ctx.isEntranceComplete = false),
        (ctx.hasControlsRestored = true),
        (ctx.cameraRootRef = null),
        (ctx.cameraFirstChildRef = null),
        !replaceScenePlan.full)
      ) {
        ((zn6.activeFloorId = appCtx.activeFloorId),
          (zn6.previewFloorMode = appCtx.studioProject.previewFloorMode),
          (zn6.previewFloorGap = appCtx.studioProject.previewFloorGap));
        for (const replacedFloorEntry of zn6.floors) {
          replacedFloorEntry.scene.settings.livePreviewEnabled = true;
          const localReplacedFloor = appCtx.studioProject.floors.find(
            (replacementSceneMatchedFloor: any) =>
              replacementSceneMatchedFloor.id === replacedFloorEntry.id,
          );
          if (localReplacedFloor && !replaceScenePlan.floors.includes(replacedFloorEntry.id)) {
            for (const incomingLightGroup of replacedFloorEntry.scene.lightGroups) {
              const localLightGroup = localReplacedFloor.scene.lightGroups.find(
                (replacementSceneMatchedLightGroup: any) =>
                  replacementSceneMatchedLightGroup.id === incomingLightGroup.id,
              );
              localLightGroup && (incomingLightGroup.enabled = localLightGroup.enabled);
            }
            for (const incomingLightItem of replacedFloorEntry.scene.items) {
              if (!lampItemTypeSet.has(incomingLightItem.type)) continue;
              const localLightItem = localReplacedFloor.scene.items.find(
                (existingLightItem: any) => existingLightItem.id === incomingLightItem.id,
              );
              localLightItem &&
                ((incomingLightItem.lightBrightness = localLightItem.lightBrightness),
                (incomingLightItem.lightTemperature = localLightItem.lightTemperature),
                (incomingLightItem.lightColorRgb = localLightItem.lightColorRgb));
            }
          }
        }
        ((appCtx.studioProject = zn6),
          (appCtx.loadedDraft = replacementScene),
          ctx.overviewStackOption !== undefined &&
            (appCtx.studioProject.uniformOverviewStack = ctx.overviewStackOption),
          (appCtx.studioState = getActiveFloor().scene),
          syncFloorGroups(new Set(replaceScenePlan.floors)),
          Promise.allSettled(preloadDefaultModels()));
        return;
      }
      (await applyLoadedDraft(replacementScene),
        ctx.overviewStackOption !== undefined &&
          (appCtx.studioProject.uniformOverviewStack = ctx.overviewStackOption));
    },
    coverSceneUpdate() {
      appCtx.compiledShaderCache?.clear();
      const thumbnailCanvas = document.createElement("canvas");
      ((thumbnailCanvas.width = appCtx.threeRenderer.domElement.width),
        (thumbnailCanvas.height = appCtx.threeRenderer.domElement.height),
        appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera));
      const thumbnailPainter = thumbnailCanvas.getContext("2d");
      (thumbnailPainter!.drawImage(appCtx.threeRenderer.domElement, 0, 0),
        previewLightCacheCanvasElement.hidden ||
          thumbnailPainter!.drawImage(
            previewLightCacheCanvasElement,
            0,
            0,
            thumbnailCanvas.width,
            thumbnailCanvas.height,
          ));
      const visibility = appCtx.threeRenderer.domElement.style.visibility,
        visibility2 = previewLightCacheCanvasElement.style.visibility;
      return (
        (appCtx.threeRenderer.domElement.style.visibility = "hidden"),
        (previewLightCacheCanvasElement.style.visibility = "hidden"),
        Object.assign(thumbnailCanvas.style, {
          position: "absolute",
          inset: "0",
          width: "100%",
          height: "100%",
          zIndex: "6",
          pointerEvents: "auto",
        }),
        thumbnailCanvas.setAttribute("aria-label", "正在同步户型"),
        selectElement("#preview-3d").append(thumbnailCanvas),
        () => {
          ((appCtx.threeRenderer.domElement.style.visibility = visibility),
            (previewLightCacheCanvasElement.style.visibility = visibility2),
            thumbnailCanvas.remove());
        }
      );
    },
    getOrbitCenter() {
      return computeCameraTarget(appCtx.orbitControls.target).toArray();
    },
    setOrbitPivot(orbitPivot: any) {
      ((ctx.orbitTargetVector = orbitPivot ? new ns2.Vector3().fromArray(orbitPivot) : null),
        configureOrbitControls());
    },
    orbitCameraPose(orbitPose: any, topRotation: any) {
      const structuredClone2 = structuredClone(orbitPose),
        normalizedTopRotation = finite2(topRotation, 0) % (Math.PI * 2);
      if (
        Math.abs(normalizedTopRotation) < 1e-12 ||
        Math.abs(Math.abs(normalizedTopRotation) - Math.PI * 2) < 1e-12
      )
        return structuredClone2;
      ctx.orbitTargetVector ||
        (ctx.orbitTargetVector = computeCameraTarget(new ns2.Vector3().fromArray(orbitPose.target)));
      const setFromAxisAngle = new ns2.Quaternion().setFromAxisAngle(
        new ns2.Vector3(0, 1, 0),
        normalizedTopRotation,
      );
      for (const cameraPoseKey of ["position", "target"])
        structuredClone2[cameraPoseKey] = new ns2.Vector3()
          .fromArray(orbitPose[cameraPoseKey])
          .sub(ctx.orbitTargetVector)
          .applyQuaternion(setFromAxisAngle)
          .add(ctx.orbitTargetVector)
          .toArray();
      let array2 = new ns2.Vector3().fromArray(orbitPose.up || [0, 1, 0]);
      const sub5 = new ns2.Vector3()
        .fromArray(orbitPose.position)
        .sub(new ns2.Vector3().fromArray(orbitPose.target));
      if (array2.lengthSq() < 1e-12 || array2.clone().cross(sub5).lengthSq() < 1e-12) {
        const degToRad7 = ns2.MathUtils.degToRad(finite2(orbitPose.topRotation, 0));
        ((array2 = new ns2.Vector3(Math.sin(degToRad7), 0, -Math.cos(degToRad7))),
          array2.clone().cross(sub5).lengthSq() < 1e-12 && array2.set(1, 0, 0));
      }
      return (
        (structuredClone2.up = array2.applyQuaternion(setFromAxisAngle).toArray()),
        structuredClone2
      );
    },
    setFocusViewport(focusViewport: any) {
      const focusWeight = clamp2(finite2(focusViewport, 0), 0, 0.7);
      focusWeight !== ctx.stereoSampleIndex &&
        ((ctx.stereoSampleIndex = focusWeight),
        syncViewOffset(),
        refreshSceneRender({
          preserveLightCache: false,
        }));
    },
    beginCameraMotion(
      runStudioRenderLoopCameraMode: any,
      cameraAnimationEnabled: any,
      motionReason = "focus",
    ) {
      motionPresentation.camera(!!cameraAnimationEnabled, {
        live: motionReason === "focus",
      });
      const cameraState = this.cameraState(),
        shouldAnimateCamera =
          cameraAnimationEnabled &&
          (ctx.cameraMotionSpec || cameraState.mode !== runStudioRenderLoopCameraMode),
        bo4 = shouldAnimateCamera
          ? (ctx.cameraMotionSpec?.height ?? computeVisibleHeight(appCtx.threeCamera, appCtx.orbitControls.target))
          : 0,
        startCameraWeight =
          ctx.cameraMotionSpec?.weight ?? (cameraState.mode === "perspective" ? 1 : 0);
      return (
        (ctx.cameraMotionSpec = null),
        (ctx.isSnapshotMode = true),
        (ctx.isRenderLoopOverviewMode = !!cameraAnimationEnabled),
        (ctx.isViewTransitioning = false),
        areLightsEnabled() &&
          (resetLightEffectStates(),
          sampleLightTransitions(performance.now()),
          setupSceneShadows(appCtx.sceneRootNode, {
            rebuildAtlas: false,
          }),
          renderStudioFrame()),
        setCameraMode(runStudioRenderLoopCameraMode, {
          preserveView: true,
          deferControlUpdate: true,
        }),
        buildCameraPose(),
        configureOrbitControls(),
        // 自动旋转 / idle 回位保持静置像素比；仅用户 focus / 交互走运动降采样。
        motionReason !== "idle" && handleOrbitStart(),
        shouldAnimateCamera
          ? ((ctx.cameraMotionSpec = {
              fromHeight: bo4,
              toHeight: computeCameraFrameDistance(cameraAnimationEnabled),
              height: bo4,
              fromWeight: startCameraWeight,
              toWeight: runStudioRenderLoopCameraMode === "perspective" ? 1 : 0,
              weight: startCameraWeight,
            }),
            cameraState)
          : this.cameraState()
      );
    },
    applyCameraFrame(targetCameraMode: any, targetCameraPose: any, cameraBlendWeight: any) {
      const cameraBlendValue = clamp2(finite2(cameraBlendWeight, 0), 0, 0.7),
        isCameraWeightEqual = cameraBlendValue === ctx.stereoSampleIndex;
      ((ctx.stereoSampleIndex = cameraBlendValue),
        this.applyCameraPose(targetCameraMode, targetCameraPose, isCameraWeightEqual),
        motionPresentation.advance(targetCameraPose));
    },
    applyCameraPose(cameraViewState: any, poseWeight = 1, applyPoseImmediately = true) {
      ((cameraViewState = constrainCameraPose2(cameraViewState)),
        ctx.cameraMotionSpec &&
          (poseWeight >= 1
            ? (ctx.cameraMotionSpec = null)
            : ((ctx.cameraMotionSpec.height =
                ctx.cameraMotionSpec.fromHeight +
                (ctx.cameraMotionSpec.toHeight - ctx.cameraMotionSpec.fromHeight) * poseWeight),
              (ctx.cameraMotionSpec.weight =
                ctx.cameraMotionSpec.fromWeight +
                (ctx.cameraMotionSpec.toWeight - ctx.cameraMotionSpec.fromWeight) * poseWeight))),
        handleOrbitChange());
      const ut7 = cameraSettings();
      ((ut7.cameraView = cameraViewState.view || "free"),
        (ut7.cameraTopRotation = cameraViewState.topRotation || 0),
        (ut7.cameraFocalLength = cameraViewState.focalLength || 50),
        appCtx.threeCamera.position.fromArray(cameraViewState.position),
        appCtx.orbitControls.target.fromArray(cameraViewState.target),
        appCtx.threeCamera.up.fromArray(cameraViewState.up || [0, 1, 0]),
        (appCtx.threeCamera.zoom = cameraViewState.zoom),
        (appCtx.threeCamera.userData.frameSize = cameraViewState.frameSize || 10),
        (appCtx.threeCamera.userData.cameraView = ut7.cameraView),
        (appCtx.threeCamera.userData.topRotation = ut7.cameraTopRotation),
        appCtx.threeCamera.isOrthographicCamera
          ? applyOrthoFrame(
              appCtx.threeCamera.userData.frameSize,
              appCtx.threeCamera.userData.viewportAspect || 1,
            )
          : applyCameraFocalLength(),
        appCtx.threeCamera.lookAt(appCtx.orbitControls.target),
        updateCameraPlanes(appCtx.threeCamera, appCtx.orbitControls.target),
        appCtx.threeCamera.updateMatrixWorld(),
        syncViewOffset(),
        refreshSceneRender({
          preserveLightCache: applyPoseImmediately,
        }));
    },
    endCameraMotion() {
      (motionPresentation.camera(false),
        (ctx.isSnapshotMode = false),
        (ctx.isRenderLoopOverviewMode = false),
        buildCameraPose(),
        handleOrbitEnd(),
        refreshSceneRender(),
        typeof appCtx.prewarmState < "u" &&
          appCtx.prewarmState === controlsRestoreOptions &&
          !lightTransitionsByLight.size &&
          (ctx.overviewTimeoutHandle !== null && window.clearTimeout(ctx.overviewTimeoutHandle),
          (ctx.overviewTimeoutHandle = window.setTimeout(scheduleControlsRestore, 180))));
    },
    setUniformOverviewStack(uniformOverviewEnabled: any) {
      ctx.overviewStackOption =
        typeof uniformOverviewEnabled == "boolean" ? uniformOverviewEnabled : undefined;
      const resolvedUniformOverview =
        ctx.overviewStackOption ?? appCtx.loadedDraft.scene.uniformOverviewStack === true;
      appCtx.studioProject.uniformOverviewStack !== resolvedUniformOverview &&
        (this.finishFloorTransition(),
        (appCtx.studioProject.uniformOverviewStack = resolvedUniformOverview),
        (ctx.orbitTargetVector = null),
        (ctx.renderRootRef = null),
        groundReflections.changed(),
        refreshSceneRender({
          scene: true,
        }));
    },
    setFloorGap(floorGapValue: any) {
      const clampedFloorGap = Number.isFinite(floorGapValue) ? clamp2(floorGapValue, 0, 20) : null;
      if (clampedFloorGap !== null || ctx.unusedRenderHandle !== null) {
        const previewFloorGap =
          clampedFloorGap ?? normalizeStudioDocument(appCtx.loadedDraft.scene, studioDocumentDeps()).previewFloorGap;
        if (Math.abs(appCtx.studioProject.previewFloorGap - previewFloorGap) > 0.000001) {
          floorTransition.finish();
          const isOverviewAllFloors = getPreviewFloorMode() === "all",
            take = isOverviewAllFloors
              ? floorTransition.take(
                  appCtx.studioProject.floors.map((overviewFloorEntry: any) => overviewFloorEntry.id),
                  cameraTargetForFloor,
                  true,
                )
              : [];
          try {
            appCtx.studioProject.previewFloorGap = previewFloorGap;
            for (const reusableTransition of take)
              floorTransition.reuse(
                reusableTransition,
                cameraTargetForFloor(reusableTransition.id),
              );
          } finally {
            isOverviewAllFloors && suspendReflections(false);
          }
          isOverviewAllFloors &&
            ((ctx.orbitTargetVector = null),
            (ctx.renderRootRef = null),
            computeSceneExtent(),
            refreshSceneRender({
              scene: true,
              shadows: true,
            }));
        }
      }
      ctx.unusedRenderHandle = clampedFloorGap;
    },
    appearance(appearanceSettings: any) {
      const appearanceSceneStyle =
          appearanceSettings.sceneStyle === "warm-wood" ? "warm-wood" : "default",
        appearanceWallOpacity =
          typeof appearanceSettings.wallOpacity == "number" &&
          Number.isFinite(appearanceSettings.wallOpacity)
            ? clamp2(appearanceSettings.wallOpacity, 0, 1)
            : null;
      if (
        (appCtx.regionLightController?.setSceneStyle?.(appearanceSceneStyle),
        appearanceSceneStyle !== appCtx.sceneStyle || appearanceWallOpacity !== appCtx.wallOpacityValue)
      ) {
        (this.finishFloorTransition(), trimRetainedFloors());
        const cameraState2 = this.cameraState();
        ((appCtx.sceneStyle = appearanceSceneStyle),
          (appCtx.wallOpacityValue = appearanceWallOpacity),
          rebuildFloorLayers(),
          (ctx.orbitTargetVector = null),
          (ctx.renderRootRef = null),
          this.restoreCamera(cameraState2));
      }
      const appearanceSignatureJson = JSON.stringify([
        appearanceSettings.baseLighting,
        appearanceSettings.lightingMode,
        appearanceSceneStyle,
        appearanceWallOpacity,
      ]);
      appearanceSignatureJson !== ctx.lastRenderSignature &&
        (trimRetainedFloors(),
        (ctx.lastRenderSignature = appearanceSignatureJson),
        groundReflections.changed());
      const normalizedGroundReflection = normalizeGroundReflection2(
        appearanceSettings.groundReflection,
      );
      groundReflections.configure(normalizedGroundReflection) &&
        ((appCtx.reflectionSettingsJson = JSON.stringify(groundReflections.settings)),
        refreshSceneRender());
      const lightRegionOverrides =
          appCtx.regionLightController?.setOverrides(appearanceSettings.lightRegionOverrides || {}) ??
          appearanceSettings.lightRegionOverrides ??
          {},
        lightRegionOverridesJson = JSON.stringify(lightRegionOverrides);
      (lightRegionOverridesJson !== ctx.lastStateJson &&
        ((ctx.lastStateJson = lightRegionOverridesJson),
        groundReflections.changed(),
        refreshSceneRender()),
        (ctx.hasBaseLightingApplied = !!appearanceSettings.baseLighting));
      const clampedRenderScale = clamp2(finite2(appearanceSettings.renderScale, 1), 0.25, 2),
        clampedMotionRenderScale =
          typeof appearanceSettings.motionRenderScale == "number" &&
          Number.isFinite(appearanceSettings.motionRenderScale)
            ? clamp2(appearanceSettings.motionRenderScale, 0.25, 1)
            : null;
      (clampedRenderScale !== appCtx.basePixelRatio || clampedMotionRenderScale !== appCtx.adaptivePixelRatio) &&
        ((appCtx.basePixelRatio = clampedRenderScale),
        (appCtx.adaptivePixelRatio = clampedMotionRenderScale),
        appCtx.threeRenderer.setPixelRatio(computeRenderPixelRatio(appCtx.isRenderSuppressed)),
        resizeStudioRenderer(),
        refreshSceneRender());
      const hasBackgroundVisibilityChanged =
          ctx.isBackgroundVisible !== (appearanceSettings.backgroundVisible !== false),
        resolvedBackgroundTheme = appCtx.backgroundController?.theme || "grid",
        hasBackgroundThemeChanged = appCtx.backgroundThemeName !== resolvedBackgroundTheme;
      ((appCtx.backgroundThemeName = resolvedBackgroundTheme),
        (ctx.isBackgroundVisible = appearanceSettings.backgroundVisible !== false),
        document.body.classList.toggle("is-background-hidden", !ctx.isBackgroundVisible),
        prepareReflectionTargets());
      const normalizedAppearanceLighting = normalizeBaseLighting2(
        appearanceSettings.baseLighting || appCtx.studioProject.baseLighting,
      );
      (appCtx.regionLightController?.setFloorBrightness(normalizedAppearanceLighting.floorBrightness) &&
        refreshSceneRender(),
        JSON.stringify(normalizedAppearanceLighting) !== JSON.stringify(appCtx.baseLightingSettings) &&
          applyBaseLighting(normalizedAppearanceLighting),
        (hasBackgroundVisibilityChanged || hasBackgroundThemeChanged) && refreshSceneRender());
    },
    floorDefaultCamera(defaultCameraFloorId: any) {
      const fixedCameraView =
        defaultCameraFloorId === "all"
          ? zn4?.combinedFixedCameraView
          : zn4?.floors.find((cameraFloorEntry: any) => cameraFloorEntry.id === defaultCameraFloorId)
              ?.scene.settings?.fixedCameraView;
      if (!fixedCameraView) return null;
      const resolvedPreviewAspect =
          appCtx.threeCamera.userData.viewportAspect ||
          Math.max(
            selectElement("#preview-3d").clientWidth /
              Math.max(selectElement("#preview-3d").clientHeight, 1),
            0.1,
          ),
        floorDefaultCameraOptions = {
          mode: fixedCameraView.mode,
          view: fixedCameraView.view,
          topRotation: fixedCameraView.topRotation,
          position: [
            fixedCameraView.position.x,
            fixedCameraView.position.y,
            fixedCameraView.position.z,
          ],
          target: [fixedCameraView.target.x, fixedCameraView.target.y, fixedCameraView.target.z],
          zoom: 1,
          frameSize: resolveFrameSize(fixedCameraView, resolvedPreviewAspect),
          focalLength: fixedCameraView.focalLength || 50,
        };
      return transformSceneCamera2(
        floorDefaultCameraOptions,
        zn4,
        appCtx.studioProject,
        defaultCameraFloorId,
      );
    },
    get floorTransitionActive() {
      return floorTransition.active;
    },
    advanceFloorTransition(transitionProgressRatio: any, transitionFrame: any) {
      ((ctx.unusedRenderCounter = clamp2(transitionProgressRatio, 0, 1)),
        ctx.transitionRange &&
          (appCtx.animatedTransitionValue =
            ctx.transitionRange.from +
            (ctx.transitionRange.to - ctx.transitionRange.from) * transitionProgressRatio));
      const floorTransitionFrameOptions = transitionFrame
        ? {
            height: ctx.cameraMotionSpec
              ? ctx.cameraMotionSpec.fromHeight +
                (ctx.cameraMotionSpec.toHeight - ctx.cameraMotionSpec.fromHeight) * transitionProgressRatio
              : computeCameraFrameDistance(transitionFrame),
            weight: ctx.cameraMotionSpec
              ? ctx.cameraMotionSpec.fromWeight +
                (ctx.cameraMotionSpec.toWeight - ctx.cameraMotionSpec.fromWeight) * transitionProgressRatio
              : transitionFrame.mode === "perspective"
                ? 1
                : 0,
            distance: new ns2.Vector3()
              .fromArray(transitionFrame.position)
              .distanceTo(new ns2.Vector3().fromArray(transitionFrame.target)),
          }
        : null;
      (scheduleTask("motion-and-settle", () =>
        floorTransition.sample(
          transitionProgressRatio,
          transitionFrame,
          floorTransitionFrameOptions,
        ),
      ),
        transitionProgressRatio >= 1 &&
          ((ctx.transitionRange = null), (appCtx.animatedTransitionValue = null)));
    },
    setFloorSlideCameras(floorSlideCameras: any, floorSlideViews: any) {
      const measureCameraDistance = (slidePose: any) =>
        new ns2.Vector3()
          .fromArray(slidePose.position)
          .distanceTo(new ns2.Vector3().fromArray(slidePose.target));
      floorTransition.setSlideCameras(floorSlideCameras, floorSlideViews, {
        from: {
          height: ctx.cameraMotionSpec?.fromHeight ?? computeCameraFrameDistance(floorSlideCameras),
          weight:
            ctx.cameraMotionSpec?.fromWeight ?? (floorSlideCameras.mode === "perspective" ? 1 : 0),
          distance: measureCameraDistance(floorSlideCameras),
        },
        to: {
          height: computeCameraFrameDistance(floorSlideViews),
          weight: floorSlideViews.mode === "perspective" ? 1 : 0,
          distance: measureCameraDistance(floorSlideViews),
        },
      });
    },
    finishFloorTransition() {
      (floorTransition.finish(),
        (ctx.transitionRange = null),
        (appCtx.animatedTransitionValue = null),
        typeof isPerformanceDiagnostics < "u" &&
          isPerformanceDiagnostics &&
          diagnosticsState.floorSwitch &&
          (diagnosticsState.floorSwitch.until = performance.now() + 400));
    },
    get floorCacheSize() {
      return retainedFloorsByKey.size;
    },
    profileFrameWork: scheduleTask,
    recordFloorFrame(recordedFloorId: any, recordedFrame: any) {
      typeof recordFloorSwitchTick == "function" &&
        recordFloorSwitchTick(recordedFloorId, recordedFrame);
    },
    get floorEffectsFollow() {
      return We3;
    },
    transitionFloor(transitionFloorId: any) {
      ((ctx.unusedRenderState = getPreviewFloorMode() === "all" ? "all" : appCtx.activeFloorId),
        (ctx.unusedRenderCounter = 0),
        typeof isPerformanceDiagnostics < "u" &&
          isPerformanceDiagnostics &&
          (diagnosticsState.floorSwitch = {
            target: transitionFloorId,
            last: performance.now(),
            until: Infinity,
            frames: 0,
            maxMs: 0,
            longFrames: 0,
            cpuMs: 0,
          }));
      const sortedFloorIds = [...appCtx.studioProject.floors]
          .sort(
            (firstSortedFloor, secondSortedFloor) =>
              firstSortedFloor.elevation - secondSortedFloor.elevation,
          )
          .map((sortedFloorRecord) => sortedFloorRecord.id),
        capturedFramesByKey = new Map(),
        frameForFloor = (cacheFloorId: any) => {
          const frameCacheKey = JSON.stringify([getPreviewFloorMode(), cacheFloorId]);
          if (capturedFramesByKey.has(frameCacheKey))
            return capturedFramesByKey.get(frameCacheKey).clone();
          const cachedFloor = appCtx.studioProject.floors.find(
              (cachedFloorRecord: any) => cachedFloorRecord.id === cacheFloorId,
            ),
            cachedFloorPpm = cachedFloor.scene.calibration?.pixelsPerMeter || 1,
            worldPoint = this.worldPoint(cacheFloorId, 0, 0, 0),
            setPosition = new ns2.Matrix4()
              .makeBasis(
                this.worldPoint(cacheFloorId, cachedFloorPpm, 0, 0).sub(worldPoint),
                new ns2.Vector3(0, 1, 0),
                this.worldPoint(cacheFloorId, 0, cachedFloorPpm, 0).sub(worldPoint),
              )
              .setPosition(worldPoint);
          return (capturedFramesByKey.set(frameCacheKey, setPosition), setPosition.clone());
        },
        isTransitionAllFloors = getPreviewFloorMode() === "all";
      ((ctx.transitionRange = {
        from: appCtx.animatedTransitionValue ?? (isTransitionAllFloors ? 1 : 0),
        to: transitionFloorId === "all" ? 1 : 0,
      }),
        (appCtx.animatedTransitionValue = ctx.transitionRange.from));
      const transitionScopeKey = isTransitionAllFloors ? "all" : appCtx.activeFloorId,
        detachedRecords = scheduleTask("detach-source", () =>
          floorTransition.take(
            isTransitionAllFloors ? sortedFloorIds : [appCtx.activeFloorId],
            frameForFloor,
            isTransitionAllFloors,
          ),
        );
      for (const detachedRecord of detachedRecords)
        ((detachedRecord.cacheKey ||= transitionScopeKey),
          (detachedRecord.cacheEpoch ??= ctx.cacheEpoch));
      const isSingleFloorTransition = !isTransitionAllFloors && transitionFloorId !== "all";
      let unionBounds;
      if (isSingleFloorTransition)
        unionBounds = computeVisibleHeight(appCtx.threeCamera, appCtx.orbitControls.target) * 1.2;
      else {
        const floorBoundsBox = new ns2.Box3();
        for (const capturedRecord of detachedRecords)
          capturedRecord.node.traverseVisible((transitionFloorIdVisibleNode: any) => {
            if (
              !transitionFloorIdVisibleNode.isMesh ||
              !transitionFloorIdVisibleNode.geometry ||
              ["background", "grid", "contact-shadow"].includes(
                transitionFloorIdVisibleNode.userData?.exportRole,
              )
            )
              return;
            const geometry = transitionFloorIdVisibleNode.isInstancedMesh
              ? transitionFloorIdVisibleNode
              : transitionFloorIdVisibleNode.geometry;
            (geometry.boundingBox || geometry.computeBoundingBox(),
              geometry.boundingBox &&
                floorBoundsBox.union(
                  geometry.boundingBox
                    .clone()
                    .applyMatrix4(transitionFloorIdVisibleNode.matrixWorld),
                ));
          });
        const size4 = floorBoundsBox.getSize(new ns2.Vector3());
        unionBounds = Math.max(20, size4.x, size4.z) * 1.5;
      }
      const normalize4 = isSingleFloorTransition
          ? new ns2.Vector3(0, 1, 0).applyQuaternion(appCtx.threeCamera.quaternion).normalize()
          : null,
        indexOf =
          detachedRecords.find((scrollRecord: any) => Number.isFinite(scrollRecord.scrollPosition))
            ?.scrollPosition ?? sortedFloorIds.indexOf(transitionScopeKey),
        indexOf2 = sortedFloorIds.indexOf(transitionFloorId),
        slice2 = isSingleFloorTransition
          ? sortedFloorIds.slice(
              Math.min(Math.floor(indexOf), indexOf2),
              Math.max(Math.ceil(indexOf), indexOf2) + 1,
            )
          : [],
        transitionFloorOrder =
          transitionFloorId === "all"
            ? sortedFloorIds
            : [
                transitionFloorId,
                ...slice2.filter((orderedFloorId) => orderedFloorId !== transitionFloorId),
              ],
        orderedRecords = transitionFloorOrder.map(
          (destFloorId) =>
            detachedRecords.find(
              (capturedFloorRecord: any) =>
                capturedFloorRecord.id === destFloorId &&
                capturedFloorRecord.cacheEpoch === ctx.cacheEpoch,
            ) || retainedFloorsByKey.get(destFloorId),
        ),
        readyRecordCount = orderedRecords.filter(Boolean).length;
      if (isSingleFloorTransition || transitionFloorId === "all")
        for (let captureIndex = 0; captureIndex < transitionFloorOrder.length; captureIndex++) {
          if (orderedRecords[captureIndex]) continue;
          this.setFloor(transitionFloorOrder[captureIndex]);
          const singleCaptureRecord = floorTransition.capture(
            [transitionFloorOrder[captureIndex]],
            frameForFloor,
            false,
          )[0];
          ((singleCaptureRecord.frame = singleCaptureRecord.baseFrame.clone()),
            (singleCaptureRecord.cacheKey = transitionFloorOrder[captureIndex]),
            (singleCaptureRecord.cacheEpoch = ctx.cacheEpoch),
            singleCaptureRecord.node.removeFromParent(),
            (orderedRecords[captureIndex] = singleCaptureRecord));
        }
      const allCapturedRecords = orderedRecords.every(Boolean) ? orderedRecords : null;
      if (
        (allCapturedRecords && readyRecordCount === transitionFloorOrder.length
          ? renderLoopStats.reusedTransitions++
          : renderLoopStats.rebuiltTransitions++,
        allCapturedRecords && (renderLoopStats.reusedFloors += readyRecordCount),
        (appCtx.threeRenderer.domElement.dataset.floorReuseStats = JSON.stringify(renderLoopStats)),
        allCapturedRecords)
      ) {
        for (const capturedFloorEntry of allCapturedRecords)
          (ctx.floorRetentionService?.releaseRoot?.(capturedFloorEntry.node),
            appCtx.regionLightController?.releaseRoot?.(capturedFloorEntry.node),
            retainedFloorsByKey.delete(capturedFloorEntry.id));
      } else trimRetainedFloors(new Set(transitionFloorOrder));
      scheduleTask("set-destination", () =>
        this.setFloor(transitionFloorId, allCapturedRecords, frameForFloor),
      );
      const orbitCenter = this.getOrbitCenter(),
        destinationRecords = scheduleTask("capture-destination", () =>
          floorTransition.capture(
            transitionFloorOrder,
            frameForFloor,
            transitionFloorId === "all" || transitionFloorOrder.length > 1,
          ),
        );
      for (const destinationRecord of destinationRecords)
        ((destinationRecord.cacheKey = transitionFloorId),
          (destinationRecord.cacheEpoch = ctx.cacheEpoch));
      return (
        scheduleTask("begin-motion", () =>
          floorTransition.begin(
            detachedRecords,
            destinationRecords,
            sortedFloorIds,
            unionBounds,
            isSingleFloorTransition,
            normalize4,
            transitionFloorId,
          ),
        ),
        appCtx.contactShadowController?.prepareMotion?.(),
        ctx.releaseCurtains?.(),
        ctx.releaseTelevisionScreens?.(),
        orbitCenter
      );
    },
    setFloor(appliedFloorId: any, reusedFloorIds: any = null, resolveFloorTarget = cameraTargetForFloor) {
      const appliedFloor =
          appCtx.studioProject.floors.find(
            (appliedFloorRecord: any) => appliedFloorRecord.id === appliedFloorId,
          ) || appCtx.studioProject.floors[0],
        appliedFloorMode =
          appliedFloorId === "all" && appCtx.studioProject.floors.length > 1 ? "all" : "active";
      if (!(
        !reusedFloorIds &&
        appCtx.activeFloorId === appliedFloor.id &&
        getPreviewFloorMode() === appliedFloorMode
      )) {
        if (
          ((lightTransitionsByLight.size ||
            (typeof appCtx.prewarmState < "u" && appCtx.prewarmState === controlsRestoreOptions)) &&
            hasActiveLightTransition(),
          (ctx.isEntranceComplete = false),
          (ctx.hasControlsRestored = true),
          (appCtx.activeFloorId = appliedFloor.id),
          (appCtx.studioProject.activeFloorId = appliedFloor.id),
          (appCtx.studioState = appliedFloor.scene),
          reusedFloorIds)
        ) {
          ((appCtx.studioProject.previewFloorMode = appliedFloorMode),
            updateFloorPreviewButtons(),
            refreshFloorControls());
          const lowestFloorId = [...appCtx.studioProject.floors].sort(
            (firstSortedElevationFloor, secondSortedElevationFloor) =>
              firstSortedElevationFloor.elevation - secondSortedElevationFloor.elevation,
          )[0].id;
          for (const reusedFloorId of reusedFloorIds)
            floorTransition
              .reuse(reusedFloorId, resolveFloorTarget(reusedFloorId.id))
              .traverse((reusedFloorNode: any) => {
                ["background", "grid"].includes(reusedFloorNode.userData?.exportRole) &&
                  ((reusedFloorNode.userData.floorBackgroundHidden =
                    appliedFloorMode === "all" && reusedFloorId.id !== lowestFloorId),
                  (reusedFloorNode.visible =
                    ctx.isBackgroundVisible &&
                    (!reusedFloorNode.userData.floorBackgroundHidden ||
                      reusedFloorNode.userData.backgroundThemeKeepVisible === true) &&
                    !reusedFloorNode.userData.backgroundThemeHidden));
              });
          ((appCtx.sceneRootNode.userData.regionFloorId = appliedFloor.id),
            appCtx.regionLightController &&
              appCtx.sceneRootNode.traverse((sceneLightNode: any) => {
                if (!sceneLightNode.isLight || !sceneLightNode.userData.lightItemId) return;
                const matchedLightItem = appCtx.studioProject.floors
                  .find(
                    (lightFloorRecord: any) =>
                      lightFloorRecord.id === sceneLightNode.userData.lightFloorId,
                  )
                  ?.scene.items.find(
                    (lightItemRecord: any) => lightItemRecord.id === sceneLightNode.userData.lightItemId,
                  );
                matchedLightItem &&
                  appCtx.regionLightController.register(sceneLightNode, matchedLightItem);
              }),
            setupSceneShadows(appCtx.sceneRootNode),
            setCameraMode(getCameraMode(), {
              preserveView: false,
            }),
            refreshSceneRender({
              scene: true,
              shadows: true,
            }),
            computeSceneExtent(),
            updateCameraView());
        } else
          setPreviewFloor(appliedFloorId === "all" ? "all" : "active", {
            persist: false,
          });
        ctx.orbitTargetVector = null;
      }
    },
    worldPoint: planToWorldForFloor,
    presentationPoint(pointFloorId: any, pointPlanX: any, pointPlanY: any, pointElevation = 0.1) {
      const pointFloorRecord = floorTransition.records.find(
          (pointRecordEntry: any) => pointRecordEntry.id === pointFloorId,
        ),
        transformPresentationPoint = (transformedPoint: any) =>
          transformedPoint && appCtx.overviewStackController
            ? appCtx.overviewStackController.presentationPoint(pointFloorId, transformedPoint)
            : transformedPoint;
      if (!pointFloorRecord)
        return transformPresentationPoint(
          planToWorldForFloor(pointFloorId, pointPlanX, pointPlanY, pointElevation),
        );
      const pointFloor = appCtx.studioProject.floors.find(
        (pointFloorEntry: any) => pointFloorEntry.id === pointFloorId,
      );
      if (!pointFloor) return null;
      pointFloorRecord.node.updateWorldMatrix(true, false);
      const pointFloorPpm = pointFloor.scene.calibration?.pixelsPerMeter || 1;
      return transformPresentationPoint(
        new ns2.Vector3(pointPlanX / pointFloorPpm, pointElevation, pointPlanY / pointFloorPpm)
          .applyMatrix4(pointFloorRecord.baseFrame)
          .applyMatrix4(pointFloorRecord.node.matrixWorld),
      );
    },
    get lightStatePatchReady() {
      return ctx.isEntranceComplete && !ctx.hasControlsRestored;
    },
    setLightStates: applyLightEffects,
    onStartupEffectsProgress(startupEffectsProgress: any) {
      return (
        progressListenerSet.add(startupEffectsProgress),
        startupEffectsProgress(ctx.reflectionDetailMode),
        () => progressListenerSet.delete(startupEffectsProgress)
      );
    },
    setEditorEffects: applyShadowSettings,
    mapLightEffectState: (lightEffectStateInput: any) => mapLightEffectState2(lightEffectStateInput),
    lightEffectColorHex: (lightColorHexInput: any) => lightEffectColorHex2(lightColorHexInput),
    cameraState(applyCameraStateImmediately = false) {
      return (
        applyCameraStateImmediately && buildCameraPose(),
        {
          position: appCtx.threeCamera.position.toArray(),
          target: appCtx.orbitControls.target.toArray(),
          zoom: appCtx.threeCamera.zoom,
          mode: appCtx.threeCamera.isPerspectiveCamera ? "perspective" : "orthographic",
          up: appCtx.threeCamera.up.toArray(),
          frameSize: appCtx.threeCamera.userData.frameSize || 10,
          view: getCameraView(),
          topRotation: getCameraTopRotation(),
          focalLength: getCameraFocalLength(),
        }
      );
    },
    setCameraProjection(cameraProjection: any) {
      ((cameraSettings().cameraMode =
        cameraProjection === "perspective" ? "perspective" : "orthographic"),
        setCameraMode(cameraSettings().cameraMode, {
          preserveView: true,
          deferControlUpdate: true,
        }),
        buildCameraPose());
    },
    setCameraFocalLength(cameraFocalLength: any) {
      ((cameraSettings().cameraFocalLength = clamp2(finite2(cameraFocalLength, 50), 18, 120)),
        applyCameraFocalLength(),
        refreshSceneRender());
    },
    setCameraInteraction(cameraInteractionOptions: CameraInteractionOptions = {}) {
      const rotationMode = ["horizontal", "vertical"].includes(
          cameraInteractionOptions.rotationMode!,
        )
          ? cameraInteractionOptions.rotationMode
          : "free",
        isCameraInteractionEnabled = cameraInteractionOptions.enabled === true,
        isPanEnabled = cameraInteractionOptions.panEnabled !== false,
        isZoomEnabled = cameraInteractionOptions.zoomEnabled !== false,
        isFocusEditingEnabled = cameraInteractionOptions.focusEditing === true,
        cameraInteractionChanged =
          ctx.isOrbitEnabled !== isCameraInteractionEnabled ||
          ctx.cameraViewMode !== rotationMode ||
          ctx.shouldEnablePan !== isPanEnabled ||
          ctx.shouldEnableZoom !== isZoomEnabled ||
          ctx.isPerspectiveCameraMode !== isFocusEditingEnabled;
      ((ctx.isOrbitEnabled = isCameraInteractionEnabled),
        (ctx.cameraViewMode = rotationMode!),
        (ctx.shouldEnablePan = isPanEnabled),
        (ctx.shouldEnableZoom = isZoomEnabled),
        (ctx.isPerspectiveCameraMode = isFocusEditingEnabled),
        (ctx.cameraForwardVector =
          isFocusEditingEnabled &&
          Array.isArray(cameraInteractionOptions.focusPoint) &&
          cameraInteractionOptions.focusPoint.length === 3 &&
          cameraInteractionOptions.focusPoint.every(Number.isFinite)
            ? new ns2.Vector3().fromArray(cameraInteractionOptions.focusPoint)
            : null),
        cameraInteractionChanged
          ? buildCameraPose()
          : (appCtx.orbitControls.enabled = isCameraInteractionEnabled),
        configureOrbitControls());
    },
    whenPresented() {
      return (
        (ctx.cameraRestoreState ||= (async () => {
          const appInstance = appCtx.studioProject,
            isCurrentAppInstance = () =>
              !assetLoaderState.disposed && appCtx.studioProject === appInstance;
          (stageLoadTiming("presentation-start"),
            (appCtx.isExternalModelPending = true),
            window.clearTimeout(appCtx.modelLoadTimeoutId),
            (appCtx.modelLoadTimeoutId = null));
          const cl2 = preloadDefaultModels();
          let settledTimerHandle;
          const modelsSettledPromise = Promise.allSettled(cl2).then(
            () => (stageLoadTiming("models-settled"), true),
          );
          let cameraReadyResolve;
          try {
            if (
              ((cameraReadyResolve = await Promise.race([
                modelsSettledPromise,
                new Promise((cameraReadyResolver) => {
                  settledTimerHandle = window.setTimeout(() => cameraReadyResolver(false), 8000);
                }),
              ])),
              !isCurrentAppInstance())
            )
              return;
            cameraReadyResolve || stageLoadTiming("model-wait-timeout");
            const jo2 = appCtx.isSceneStillLoading;
            if (jo2) {
              if (((appCtx.isModelLoadPending = false), isEmbeddedStage)) {
                if (!(await waitForSceneRevision())) return;
              } else
                ((appCtx.isSceneStillLoading = false),
                  requestSceneRebuild({
                    force: true,
                    precompile: true,
                  }));
            } else appCtx.isModelLoadPending && finishModelLoad();
            if (
              (await new Promise(requestAnimationFrame),
              !isCurrentAppInstance() ||
                (jo2 &&
                  (this.restoreCamera(
                    ctx.savedCameraState?.value || null,
                    ctx.savedCameraState?.projection || null,
                  ),
                  (ctx.savedCameraState = null),
                  await waitForSceneReady(ctx.floorRetentionService)),
                !isCurrentAppInstance()))
            )
              return;
            stageLoadTiming("replacement-frame");
          } finally {
            (window.clearTimeout(settledTimerHandle),
              appCtx.studioProject === appInstance &&
                ((appCtx.isExternalModelPending = false),
                isCurrentAppInstance() && appCtx.isModelLoadPending && requestSceneRender()));
          }
          for (
            renderStudioFrame(), await new Promise(requestAnimationFrame);
            !isEmbeddedStage && appCtx.contactShadowController?.isPending() && canBuildScene();
          )
            await new Promise(requestAnimationFrame);
          isCurrentAppInstance() &&
            (stageLoadTiming("settled-frame"),
            prepareReflectionTargets(),
            stageLoadTiming("presentation-background-ready"),
            await waitForStageReady(),
            isCurrentAppInstance() &&
              (stageLoadTiming(isEmbedStageMode ? "light-cache-not-required" : "light-cache-ready"),
              stageLoadTiming("final-render-start"),
              appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera),
              stageLoadTiming("final-render-end"),
              await new Promise(requestAnimationFrame),
              isCurrentAppInstance() &&
                (stageLoadTiming("presented"),
                geometryCacheHandle?.presented?.(),
                stageStartup2?.furnitureCache?.presented?.(),
                stageLoadTiming(
                  cameraReadyResolve ? "complete-model-frame" : "fallback-model-frame",
                ),
                startupPresentation.start(),
                (modelPresentationState.presented = true))));
        })()),
        ctx.cameraRestoreState
      );
    },
    setCameraView(runStudioRenderLoopCameraView: any) {
      ((cameraSettings().cameraView = runStudioRenderLoopCameraView === "top" ? "top" : "free"),
        setCameraView(cameraSettings().cameraView, {
          force: true,
        }));
    },
    getCameraMotionState() {
      return ctx.cameraMotionSpec
        ? {
            ...ctx.cameraMotionSpec,
          }
        : null;
    },
    restoreCamera(restoredCameraState: any, cameraRestoreOptions: any = null) {
      if (
        (appCtx.isSceneStillLoading &&
          (ctx.savedCameraState = {
            value: restoredCameraState,
            projection: cameraRestoreOptions,
          }),
        (restoredCameraState = constrainCameraPose2(restoredCameraState)),
        (ctx.cameraMotionSpec = null),
        !restoredCameraState)
      ) {
        (updateCameraView(), buildCameraPose());
        return;
      }
      const ut8 = cameraSettings();
      ((ut8.cameraMode = restoredCameraState.mode),
        (ut8.cameraView = restoredCameraState.view || "free"),
        (ut8.cameraTopRotation = restoredCameraState.topRotation || 0),
        (ut8.cameraFocalLength = restoredCameraState.focalLength || 50),
        setCameraMode(restoredCameraState.mode, {
          preserveView: false,
        }),
        appCtx.threeCamera.position.fromArray(restoredCameraState.position),
        restoredCameraState.up && appCtx.threeCamera.up.fromArray(restoredCameraState.up),
        appCtx.orbitControls.target.fromArray(restoredCameraState.target),
        (appCtx.threeCamera.zoom = restoredCameraState.zoom),
        restoredCameraState.frameSize &&
          (appCtx.threeCamera.userData.frameSize = restoredCameraState.frameSize),
        (appCtx.threeCamera.userData.cameraView = ut8.cameraView),
        (appCtx.threeCamera.userData.topRotation = ut8.cameraTopRotation),
        updateCameraPlanes(appCtx.threeCamera, appCtx.orbitControls.target),
        resizeStudioRenderer({
          preserveCanvasSize: true,
        }),
        buildCameraPose(appCtx.orbitControls.target.clone()),
        (ctx.cameraMotionSpec = cameraRestoreOptions
          ? {
              ...cameraRestoreOptions,
            }
          : null),
        syncViewOffset(),
        refreshSceneRender());
    },
    topView() {
      setCameraView("top", {
        force: true,
      });
    },
  };
}
startupStudio(studioBootDeps());

  function jumpWorkflowStep(step: string) {
    patchStudioFacadeState({ workflowStep: step });
    if (step === "background") {
      importPlanButton?.focus?.();
      importPlanButton?.click?.();
      return;
    }
    if (step === "scale") {
      selectStudioTool("scale");
      return;
    }
    if (step === "walls") {
      selectStudioTool("wall");
      return;
    }
    if (step === "items") {
      try {
        setAssetCategory?.("home");
      } catch { /* 可选注入钩子未提供或抛错：调用方继续后续流程 */ }
      selectStudioTool("select");
      return;
    }
    if (step === "lights") {
      try {
        setAssetCategory?.("light");
      } catch { /* 可选注入钩子未提供或抛错：调用方继续后续流程 */ }
      selectStudioTool("select");
      return;
    }
    if (step === "export") {
      openExportPanel();
    }
  }

  registerStudioCommandHandler((command) => {
    switch (command.type) {
      case "undo":
        void undoStudioHistory();
        break;
      case "redo":
        void redoStudioHistory();
        break;
      case "delete":
        clearSelection();
        break;
      case "copy":
        mirrorSelection();
        break;
      case "paste":
        rotateSelection();
        break;
      case "setTool":
        selectStudioTool(command.tool);
        break;
      case "setWorkflowStep":
        jumpWorkflowStep(command.step);
        break;
      case "setPlanFocus":
        document.querySelector(".studio-chrome-root")?.classList.toggle(
          "sc-shell--plan-focus",
          !!command.focus,
        );
        patchStudioFacadeState({ planFocus: !!command.focus });
        window.dispatchEvent(new Event("resize"));
        break;
      case "setLibraryCollapsed":
        document.querySelector(".studio-chrome-root")?.classList.toggle(
          "sc-shell--library-rail",
          !!command.collapsed,
        );
        patchStudioFacadeState({ libraryCollapsed: !!command.collapsed });
        window.dispatchEvent(new Event("resize"));
        break;
      default:
        break;
    }
  });
  refreshStepChecklist();
  syncStudioHistoryFacade();

  // ── 显式回收：需要访问引导体内作用域的资源 ──────────────────────────────
  return () => {
    registerStudioCommandHandler(null);
    // SPA 内路由不会触发 pagehide / beforeunload（那是整页导航的路径），所以在拆场景之前
    // 尽力提交一次未保存修改；「不保存并退出」（isLeavingStudio）时按用户意愿跳过。
    if (!isEmbeddedStage && !appCtx.isLeavingStudio && hasUnsavedChanges()) {
      try {
        void flushAutosave()
      } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    }
    // 灯光渲染缓存写入器（嵌入式 stage 的 WebSocket 通道）
    try {
      renderCacheWriter?.close?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    // 渲染循环：取消当前长任务（其内部会摘掉 pagehide/pointerdown/wheel 与控制器监听）
    try {
      appCtx.activeLongTask?.cancel?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    appCtx.activeLongTask = null
    if (appCtx.renderLoopFrameId) cancelAnimationFrame(appCtx.renderLoopFrameId)
    appCtx.renderLoopFrameId = 0
    window.clearTimeout(appCtx.renderLoopTimeoutId)
    window.clearTimeout(appCtx.pointerReleaseTimeoutId)
    window.clearTimeout(appCtx.exportPreviewTimeoutId)
    window.clearTimeout(appCtx.previewShieldTimeoutId)
    window.clearTimeout(appCtx.modelLoadTimeoutId)
    // 尺寸观察者与 three.js 资源
    try {
      appCtx.resizeObserverInstance?.disconnect?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.lightPreviewWorker?.close?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.lightPrecompileController?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.backgroundController?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.lightingScheduler?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      planPainter?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    // 模块级状态声明在引导函数之外（跨次引导存活），这里复位到声明时的默认值，
    // 避免下一次进入 /3d-studio 时带着上一次的画笔/围栏选择。
    planPainter = null
    gardenGateItemType = "garden-gate"
    gardenGateSnapCandidate = null
    try {
      appCtx.orbitControls?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.threeRenderer?.dispose?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    try {
      appCtx.threeRenderer?.forceContextLoss?.()
    } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    appCtx.threeRenderer = null
    appCtx.threeScene = null
    appCtx.threeCamera = null
    appCtx.orbitControls = null
    appCtx.sceneRootNode = null
    // 文档级残留（嵌入式 stage 的 body 类与诊断用 dataset）
    document.body.classList.remove('auto-diagram-embedded')
    document.documentElement.classList.remove('list-drag-active')
    const documentDataset = document.documentElement.dataset
    for (const datasetKey of [
      'lightRenderCache',
      'renderStatsTest',
      'performanceDiagnostics',
      'modelExportReady',
      'modelExportError',
      'materialTestStage',
      'materialTestStats',
      'materialTestReady',
      'materialTestError',
      'instanceTestStats',
      'instanceTestReady',
      'instanceTestError',
    ]) {
      delete documentDataset[datasetKey]
    }
    // 挂在 window 上的内部契约（`__homeosStudioModuleVersion` 是模块求值期写入的
    // 版本标记，不随本次引导产生，因此这里不动它）。
    const windowContract: any = window
    delete windowContract.__homeosWallRuntimeProfile
    delete windowContract.__homeosDeferExternalModel
    delete windowContract.__homeosReleasingDeferredModels
    delete windowContract.__homeosExportFurnitureJson
    delete windowContract.externalModelLoadsDeferred
  };
  });

  disposeActiveStudio = () => {
    try {
      innerCleanup?.();
    } finally {
      // 无论显式回收是否成功，登记过的全局监听/定时器/观察器都必须释放
      scope.dispose();
      resetStudioFacade();
    }
  };
}

/** 回收户型图绘制（`/3d-studio`、`/stage`）：释放渲染器、观察者与引导期登记的全局副作用。 */
export function teardownStudio(): void {
  const dispose = disposeActiveStudio;
  disposeActiveStudio = null;
  dispose?.();
}
