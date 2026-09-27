/**
 * 预览渲染管线：场景重建、静态网格合并、灯光缓存与阴影预算。
 *
 * 自 studio-app.ts 外提（依赖闭包自底向上）。对本模块之外的 studio-app.ts
 * 内部零依赖：只引用 import 与自身成员，故与 studio-app.ts 之间不存在循环引用。
 */
import {
  PREVIEW_OBJECT_LAYER,
  buildArchitectureLayer,
  isRegionLightingEnabled,
  isSelected,
  isStageViewerMode,
  makeWallSideMaterial,
  materialByRenderKey,
  studioMaxTextureAnisotropy,
  studioPalette,
  wallDerivedData
} from "./studio-architecture.js";
import { state } from "./studio-state.js";
import {
  PLAN_LABEL,
  collectPreviewLights,
  currentPixelsPerMeter,
  currentPreviewFloorMode,
  floorItemKey,
  getCurrentFloor,
  isAdaptiveLightCacheEnabled,
  isLightEnabled,
  lightCacheCanvasElement,
  lightGroupForItem,
  selectElement,
  setLightCacheVisible
} from "./studio-plan-render.js";
import {
  finite,
  kelvinToRgbHex,
  normalizeFullRotation,
  normalizeLabelText
} from "../loaders/studio-normalization.js";
import {
  yieldToIdle,
  yieldToScheduler
} from "./studio-yield.js";
import { buildLightDeltaPixels } from "../export/export-utils.js";
import { debugLog } from "../../utils/debug-log.js";
import {
  ALL_ITEM_MODELS,
  createExternalModelManager
} from "../loaders/studio-external-models.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import {
  BATCH_OPTIMIZED_ITEM_TYPES,
  HOME_ITEM_TYPES,
  JOINERY_ITEM_TYPES,
  LIGHT_ITEM_TYPES,
  SQUARE_EDGE_ITEM_TYPES,
  STAIR_ITEM_TYPES
} from "./studio-item-types.js";
import { REGION_LIGHT_LAYER } from "../plan/studio-plan2-region-lights.js";
import {
  clamp,
  closedWallFloorPolygons,
  localSpotShadowSettings,
  polygonArea,
  selectShadowCastingLightIds,
  spotLightBrightnessResponse,
  spotShadowTextureUnitLimit,
  subtractPolygonLoops
} from "../plan/geometry.js";
import {
  addChairModel,
  addVehicleChargingEffect,
  buildCurtainGeometry,
  computeTelevisionBodyMetrics,
  countMaterialTextures,
  measureTelevisionBodyFrontZ,
  waitForShaderCompilation
} from "./studio-mesh-variants.js";
import {
  RENDER_CACHE_VERSION,
  cacheSceneDescriptor,
  createRenderCache,
  sha256,
  stableCacheJSON
} from "../../bridge/render-cache.js";
import {
  applyItemOrientation,
  applyItemPosture,
  buildPillarOutline,
  buildPolygonShapes,
  offsetPolygonOutward,
  polygonLoopToPath
} from "./studio-plan-geometry.js";
import { cacheObjectTransforms } from "../../bridge/scene-matrices.js";
import {
  DEFAULT_LIGHT_SETTINGS,
  LIGHT_TYPE_BRIGHTNESS_SCALE,
  SELF_LIT_ITEM_TYPES,
  STUDIO_PALETTE,
  TV_MOUNT_STYLES
} from "./studio-config-tables.js";
import {
  addBoxMesh,
  addCylinderMesh,
  bakeMergedItemMeshes,
  buildRugGeometry,
  collectMeshDescendants,
  collectMeshDescriptors,
  computeGeometrySignature,
  computeMaterialSignature,
  disposeSceneSubtree,
  mergedWallBandGeometryCache,
  resolveRugMaterial,
  rugGeometryBySizeKey,
  rugMaterialByColorKey,
  shareGeometryAndMaterials
} from "./studio-mesh-geometry.js";
import { mergeGeometries } from "/static/vendor/three/0.186.0/BufferGeometryUtils.js";
import {
  buildItemBody,
  finishItemModel
} from "./item-builders/registry.js";
import { addSecurityModel } from "../loaders/studio-security-models.js";
import {
  addRollerCurtain,
  addTrackCurtain
} from "../loaders/studio-curtain-track.js";
import {
  FEATURE_WALL_STYLE_MATERIAL,
  createFeatureWallTexture,
  createMuralArtTexture,
  createStoneSlabTexture,
  normalizeFeatureWallStyle
} from "../materials/studio-surface-textures.js";
import { drawTrackedText } from "../plan/studio-plan-drawing.js";
import {
  maxLightAngleForType,
  normalizePillarShape
} from "./studio-scene-normalize.js";
import { setWallGradientHeight } from "../materials/studio-wall-materials.js";
import {
  createMaterialSurfaceTexture,
  hasMaterialSurfaceTexture
} from "../materials/studio-surface-fabrics.js";
import { createWarmTelevisionGlass } from "../materials/studio-television-glass.js";
import { drawTelevisionPoster } from "../materials/studio-television-poster.js";
import { lightEffectColorHex } from "../../bridge/light-motion.js";
import {
  MATERIAL_STYLE_AUTO,
  applyMaterialStyle
} from "./studio-material-styles.js";
import {
  WARM_HOME_STYLE,
  applyItemFinish,
  decorateWarmFloor
} from "./studio-scene-style.js";
import { computeFloorBounds } from "./studio-overview-center.js";
import { floorOpeningPolygon } from "../plan/studio-floor-openings.js";
import { GLTFLoader } from "/static/vendor/three/0.186.0/GLTFLoader.js";
import { roundToDecimals } from "../../utils/numbers.js";

export const renderCache = isStageViewerMode
  ? createRenderCache({
      sceneId: new URLSearchParams(window.location.search).get("sceneId"),
      projectId: new URLSearchParams(window.location.search).get("projectId"),
      report: (cachePayload: any) => {
        document.documentElement.dataset.lightRenderCache = JSON.stringify(cachePayload);
      }
    })
  : null;

/**
 * 计算光照渲染缓存的场景指纹（sha256）。舞台模式靠它判断画面是否与缓存一致，
 */
export function sceneCacheDescriptor(widthPx: any, heightPx: any) {
  const floorScenes =
    currentPreviewFloorMode() === "all" ? state.studioDocument.floors : [getCurrentFloor()];
  state.previewCamera.updateMatrixWorld();
  /**
   * 把 4x4 矩阵元素抹到 1e-8 供缓存指纹使用（相机矩阵末位会抖动：同一机位两次
   */
  const roundMatrixElements = (matrixElements: any) =>
    matrixElements.map((matrixEntry: any) => roundToDecimals(matrixEntry, 8));
  const visibility: any = [];
  state.previewModelRoot.traverse((object: any) => {
    if (["background", "grid"].includes(object.userData?.exportRole)) {
      visibility.push([object.userData.exportRole, object.visible]);
    }
  });
  return sha256(
    stableCacheJSON({
      version: RENDER_CACHE_VERSION,
      // three.js 版本单独入指纹：光照 / 阴影的着色器随版本而变，同一份配置渲染出的像素并不相同，
      threeRevision: threeModuleMin.REVISION,
      scene: cacheSceneDescriptor(floorScenes),
      mode: currentPreviewFloorMode(),
      gap: state.studioDocument.previewFloorGap,
      uniformOverviewStack: state.studioDocument.uniformOverviewStack === true,
      ...(state.studioDocument.uniformOverviewStack === true
        ? {
            overviewProjection: "saved-camera-v1"
          }
        : {}),
      lighting: state.baseLighting,
      // 材质风格与墙体透明度都参与渲染缓存的指纹：任一项变了，上一版缓存必须作废。
      style: studioPalette(),
      // 家居配色同样会改变家具像素，而默认风格下它并不体现在 style 里（style 还是 STUDIO_PALETTE），
      homeStyle: homePalette(),
      wallOpacity: state.wallOpacityOverride,
      visibility: visibility,
      reflections: state.groundReflectionSettingsKey,
      curtains: state.curtainFrameKey,
      ...(state.backgroundTheme !== "grid"
        ? {
            backgroundTheme: "v5:" + state.backgroundTheme
          }
        : {}),
      models: externalModelManager.cacheRepresentation(
        floorScenes.flatMap((floor: any) => floor.scene.items)
      ),
      camera: {
        world: roundMatrixElements(state.previewCamera.matrixWorld.elements),
        projection: roundMatrixElements(state.previewCamera.projectionMatrix.elements)
      },
      width: widthPx,
      height: heightPx,
      toneMapping: state.renderer.toneMapping,
      exposure: state.renderer.toneMappingExposure,
      colorSpace: state.renderer.outputColorSpace,
      shadows: state.renderer.shadowMap.type
    })
  );
}

export const isAutoDiagramEmbed =
  new URLSearchParams(window.location.search).get("auto-diagram-embed") === "1";

export const previewSyncButtons = [...document.querySelectorAll("[data-preview-sync]")];

export const refreshPreviewButton = selectElement("#refresh-preview");

export const previewQualityStatusElement = selectElement("#preview-quality-status");

export const modelLoadingStatusElement = selectElement("#model-loading-status");

export const previewRenderShieldElement = selectElement("#preview-render-shield");

export const MAX_SPOT_SHADOW_TEXTURE_UNITS = 8;

export const RECT_AREA_LIGHT_TEXTURE_UNITS = 2;

export const RESERVED_TEXTURE_UNITS = 1;

export const FALLBACK_MAX_TEXTURE_SIZE = 1024;

export const MIN_SHADOW_CAMERA_MARGIN = 0.8;

/**
 * 判断某类物件是否仍被任何楼层使用，外部模型管理器据此决定能否释放 glTF 资源。
 */
export function isItemTypeInUse(queriedItemType: any) {
  return !!state.studioDocument?.floors?.some((searchedFloor: any) =>
    searchedFloor.scene?.items?.some((searchedItem: any) => {
      if (queriedItemType.startsWith("tv_")) {
        const tvMountStyle = TV_MOUNT_STYLES.has(searchedItem.tvMountStyle)
          ? searchedItem.tvMountStyle
          : "standard";
        return searchedItem.type === "tv" && queriedItemType === "tv_" + tvMountStyle;
      }
      return searchedItem.type === queriedItemType;
    })
  );
}

export const gltfLoader = new GLTFLoader();

export function deferModelTypeForLater(deferredType: any) {
  if (deferredType) {
    if (!state.deferredModelTypes.includes(deferredType)) {
      state.deferredModelTypes.push(deferredType);
    }
    scheduleDeferredModelLoad();
  }
}

/**
 * 延迟释放被搁置的模型加载：页面刚打开时先压后（等首屏与草稿稳定），
 */
export function scheduleDeferredModelLoad(delayMs = 900) {
  window.clearTimeout(state.deferredModelTimer);
  state.deferredModelTimer = window.setTimeout(
    () => {
      state.deferredModelTimer = null;
      if (
        !state.areExternalModelsDeferred ||
        document.hidden ||
        state.isExportRendering ||
        state.isCameraMotionActive
      ) {
        if (state.areExternalModelsDeferred) {
          scheduleDeferredModelLoad(300);
        }
        return;
      }
      const uniqueModelTypes = [...new Set(state.deferredModelTypes)];
      state.deferredModelTypes = [];
      Promise.allSettled(releaseDeferredModels(uniqueModelTypes));
    },
    Math.max(0, delayMs)
  );
}

/**
 * 立即放行若干模型类型的加载，并取消待执行的延迟释放。置 isReleasingDeferredModels
 */
export function releaseDeferredModels(modelTypes: any = []) {
  window.clearTimeout(state.deferredModelTimer);
  state.deferredModelTimer = null;
  state.areExternalModelsDeferred = false;
  const pendingModelTypes = [...new Set<any>(modelTypes)].filter(
    candidateModelType => (ALL_ITEM_MODELS as any)[candidateModelType]
  );
  if (!pendingModelTypes.length) {
    return [];
  }
  state.isReleasingDeferredModels = true;
  const modelLoadPromises = pendingModelTypes.map(loadingModelType =>
    loadExternalItemModel(loadingModelType)
  );
  state.isReleasingDeferredModels = false;
  return modelLoadPromises;
}

/**
 * 合并短时间内的多次预览重建请求（80ms 防抖），只保留最后一次。
 */
export function schedulePreviewRebuild() {
  updateModelLoadingStatus();
  if (!isAutoDiagramEmbed && !state.isAutoDiagramLoading) {
    if (state.isExportRendering || state.isCameraMotionActive) {
      state.isPrecompilePending = true;
      return;
    }
    window.clearTimeout(state.precompileRenderTimer);
    state.precompileRenderTimer = window.setTimeout(() => {
      state.precompileRenderTimer = null;
      applySceneRefresh({
        force: true,
        precompile: true
      });
    }, 80);
  }
}

export const externalModelManager = createExternalModelManager({
  THREE: threeModuleMin,
  loader: gltfLoader,
  stairItemTypes: STAIR_ITEM_TYPES,
  isModelInUse: isItemTypeInUse,
  requestRender: schedulePreviewRebuild,
  onLoadStateChange: updateModelLoadingStatus,
  maxConcurrentLoads: 2,
  deferralHost: {
    isDeferred: () => state.areExternalModelsDeferred,
    isReleasing: () => state.isReleasingDeferredModels,
    defer: deferModelTypeForLater
  }
});

export const { loadExternalItemModel: loadExternalItemModel, modelTypeForItem: modelTypeForItem } =
  externalModelManager;

/**
 * 刷新「正在载入模型」提示，并在模型全部就绪后补一次被打断的预编译。载入期间临时
 */
export function updateModelLoadingStatus(loadState = externalModelManager.modelLoadState()) {
  if (!modelLoadingStatusElement) {
    return;
  }
  const isLoading = loadState.active > 0 || loadState.queued > 0;
  if (!isLoading && state.isPrecompilePending) {
    state.isPrecompilePending = false;
    window.clearTimeout(state.precompileRenderTimer);
    state.precompileRenderTimer = null;
    if (state.orbitControls && !state.isExportBusy) {
      state.orbitControls.enabled = false;
    }
    modelLoadingStatusElement.hidden = false;
    modelLoadingStatusElement
      .querySelector("span:last-child")
      ?.replaceChildren(document.createTextNode("正在完成模型…"));
    applySceneRefresh({
      force: true,
      precompile: true
    });
    window.requestAnimationFrame(() => updateModelLoadingStatus());
    return;
  }
  if (state.orbitControls && !state.isExportBusy) {
    state.orbitControls.enabled = !isLoading;
  }
  modelLoadingStatusElement.hidden = !isLoading;
  modelLoadingStatusElement
    .querySelector("span:last-child")
    ?.replaceChildren(
      document.createTextNode(
        isLoading ? "正在加载模型… " + (loadState.active + loadState.queued) : ""
      )
    );
}

/**
 * 往父分组里挂一个外部 glTF 物件，并刷新「模型加载中」提示。只是
 */
export function addExternalItemModel(
  parentGroup: any,
  itemDefinition: any,
  scene = paletteForItemType(itemDefinition.type, itemDefinition.materialStyle)
) {
  const modelObject = externalModelManager.addExternalItemModel(
    parentGroup,
    itemDefinition,
    scene,
    {
      selected: isSelected("item", itemDefinition.id)
    }
  );
  updateModelLoadingStatus();
  return modelObject;
}

export const pendingSceneUpdateScopes = new Set();

export const precompiledModelSignatures = new WeakSet();

export const precompiledLightSignatures = new Set();

export const MAX_PRECOMPILE_PLAN_COUNT = 16;

/**
 * 取（并缓存）由闭合墙体围出的楼板多边形。
 */
export function floorPolygonsForWalls(polygonToleranceMeters: any) {
  const polygonDerived = wallDerivedData(polygonToleranceMeters);
  polygonDerived.floorPolygons ||= closedWallFloorPolygons(
    state.activeScene.walls,
    polygonDerived.tolerance
  );
  return polygonDerived.floorPolygons;
}

/**
 * 取家居材质调色板：默认风格也采用暖阳原木的家居配色（WARM_HOME_STYLE），
 */
export function homePalette() {
  if (state.studioSceneStyle === "warm-wood") {
    return {
      ...studioPalette(),
      warmFurniture: true
    };
  }
  return {
    ...STUDIO_PALETTE,
    ...WARM_HOME_STYLE,
    warmFurniture: true
  };
}

/**
 * 按物件类型挑调色板：家居类（HOME_ITEM_TYPES）走 homePalette()，默认风格即暖阳家居配色；
 */
export function paletteForItemType(itemType: any, materialStyle = MATERIAL_STYLE_AUTO) {
  const basePalette = HOME_ITEM_TYPES.has(itemType) ? homePalette() : studioPalette();
  const finishedPalette = applyItemFinish(basePalette, itemType, JOINERY_ITEM_TYPES);
  const styledPalette = applyMaterialStyle(finishedPalette, itemType, materialStyle);
  if (styledPalette.surface === null) {
    return finishedPalette;
  }
  // 质感信息随调色板一起走：与既有的 warmWood / warmFurniture 标记同一套做法，
  return {
    ...styledPalette.palette,
    materialSurface: styledPalette.surface,
    materialRoughness: styledPalette.roughness,
    materialMetalness: styledPalette.metalness,
    materialRoles: styledPalette.roles ?? null
  };
}

/**
 * 按方位角 / 仰角把平行光摆到球面位置上。极坐标转直角坐标：水平距离 = cos(仰角) × 距离，
 */
export function positionLightFromAngles(light: any, azimuthDeg: any, elevationDeg: any, lightDistance: any) {
  if (!light) {
    return;
  }
  const azimuthRad = threeModuleMin.MathUtils.degToRad(azimuthDeg);
  const elevationRad = threeModuleMin.MathUtils.degToRad(elevationDeg);
  const horizontalDistance = Math.cos(elevationRad) * lightDistance;
  light.position.set(
    Math.cos(azimuthRad) * horizontalDistance,
    Math.sin(elevationRad) * lightDistance,
    Math.sin(azimuthRad) * horizontalDistance
  );
}

export function applyBaseLighting() {
  const palette = studioPalette();
  const lightingSettings = state.baseLighting;
  if (!state.previewOverlayScene || !state.renderer) {
    return;
  }
  state.previewOverlayScene.background = null;
  state.renderer.setClearColor(palette.background, 0);
  state.previewOverlayScene.fog = null;
  state.renderer.toneMappingExposure = lightingSettings.exposure;
  const regionLightingScale = isRegionLightingEnabled ? 0.5 : 1;
  // 暖阳原木：整套基础光换成暖白 —— 天光偏暖、地面反光偏米黄、主光更黄，
  const isWarmWood = !!palette.warmWood;
  if (state.hemisphereLight) {
    state.hemisphereLight.color.setHex(isWarmWood ? 16776178 : 14278376);
    state.hemisphereLight.groundColor.setHex(isWarmWood ? 10524035 : 1909296);
    state.hemisphereLight.intensity = lightingSettings.hemisphereIntensity * regionLightingScale;
  }
  if (state.ambientLight) {
    state.ambientLight.color.setHex(isWarmWood ? 15592162 : 9673384);
    state.ambientLight.intensity = lightingSettings.ambientIntensity * regionLightingScale;
  }
  if (state.mainDirectionalLight) {
    state.mainDirectionalLight.color.setHex(isWarmWood ? 16774367 : 15922426);
    state.mainDirectionalLight.intensity = lightingSettings.mainIntensity * regionLightingScale;
    positionLightFromAngles(
      state.mainDirectionalLight,
      lightingSettings.mainAzimuth,
      lightingSettings.mainElevation,
      18.4
    );
    state.mainDirectionalLight.shadow.bias = -0.00012;
    state.mainDirectionalLight.shadow.normalBias = 0.016;
    state.mainDirectionalLight.shadow.radius = 1.75;
    state.mainDirectionalLight.shadow.blurSamples = 4;
    if (state.isHighShadowQuality) {
      state.mainDirectionalLight.shadow.radius = 1.2;
      state.mainDirectionalLight.shadow.blurSamples = 8;
    }
    state.mainDirectionalLight.shadow.intensity = lightingSettings.mainShadowIntensity;
  }
  if (state.fillDirectionalLight) {
    state.fillDirectionalLight.color.setHex(isWarmWood ? 14346221 : 10528437);
    state.fillDirectionalLight.intensity = lightingSettings.fillIntensity * regionLightingScale;
    positionLightFromAngles(
      state.fillDirectionalLight,
      lightingSettings.fillAzimuth,
      lightingSettings.fillElevation,
      15.2
    );
  }
  if (state.topDirectionalLight) {
    state.topDirectionalLight.color.setHex(isWarmWood ? 16776693 : 16185338);
    state.topDirectionalLight.intensity = lightingSettings.topIntensity * regionLightingScale;
    positionLightFromAngles(
      state.topDirectionalLight,
      lightingSettings.topAzimuth,
      lightingSettings.topElevation,
      16.1
    );
  }
}

/**
 * 把请求的阴影贴图边长适配到本机 GPU 能力与当前画质档。非高画质档原样返回（实时预览优先保帧率）。
 */
export function resolveShadowMapSize(requestedSize: any) {
  if (!state.isHighShadowQuality) {
    return requestedSize;
  }
  const maxTextureSize = Math.max(
    1,
    Math.floor(finite(state.renderer?.capabilities?.maxTextureSize, FALLBACK_MAX_TEXTURE_SIZE))
  );
  return Math.min(maxTextureSize, Math.max(requestedSize, FALLBACK_MAX_TEXTURE_SIZE));
}

/**
 * 取当前该读哪一份相机设置。全景（所有楼层）模式下相机属于整份文档，存在
 */
export function cameraSettingsSource() {
  if (currentPreviewFloorMode() === "all") {
    return state.studioDocument.combinedCameraSettings;
  } else {
    return state.activeScene.settings;
  }
}

/**
 * 当前相机视向：顶视图或自由视角。只认 "top"，其余（包括缺字段的老草稿）一律按 "free"
 */
export function currentCameraView() {
  if (cameraSettingsSource()?.cameraView === "top") {
    return "top";
  } else {
    return "free";
  }
}

/**
 * 是否开启实时预览（关掉后需要手动点「更新」才刷新三维画面）。
 */
export function isLivePreviewEnabled() {
  return state.activeScene.settings?.livePreviewEnabled !== false;
}

/**
 * 同步预览模式控件（实时 / 手动）与「更新」按钮状态。手动模式下按钮才显示，并用
 */
export function syncPreviewControls() {
  const isLivePreview = isLivePreviewEnabled();
  for (const previewSyncButton of previewSyncButtons) {
    const isPreviewSyncActive =
      (previewSyncButton as any).dataset.previewSync === (isLivePreview ? "live" : "manual");
    previewSyncButton.classList.toggle("active", isPreviewSyncActive);
    previewSyncButton.setAttribute("aria-pressed", String(isPreviewSyncActive));
  }
  refreshPreviewButton.hidden = isLivePreview;
  refreshPreviewButton.disabled = !state.isPreviewDirty;
  refreshPreviewButton.classList.toggle("is-dirty", state.isPreviewDirty);
  refreshPreviewButton.textContent = state.isPreviewDirty ? "待更新 · 更新" : "已更新";
}

export function applyRenderQualityMode() {
  if (!state.orbitControls) {
    return;
  }
  const isAdaptiveCache = isAdaptiveLightCacheEnabled();
  const isStageLightTransition =
    isStageViewerMode && state.lightTransitionSession && !state.isLightCacheBuilding;
  state.spotShadowAtlasController?.setEnabled(
    isStageViewerMode || !isAdaptiveCache || !!isStageLightTransition
  );
  state.orbitControls.enableRotate = currentCameraView() !== "top";
  if (previewQualityStatusElement) {
    previewQualityStatusElement.hidden = true;
    previewQualityStatusElement.title = "";
    previewQualityStatusElement.textContent = "";
  }
}

export function requestRenderFrame() {
  state.needsRender = true;
  state.hasRenderedFrame = false;
  state.demandFrameLoop?.wake();
}

/**
 * 判断当前是否还有「渲染相关」的异步工作没落地，供光照缓存烘焙前的准入检查使用。覆盖外部
 */
export function hasPendingRenderWork() {
  const modelLoadState = externalModelManager.modelLoadState();
  return (
    modelLoadState.active > 0 ||
    modelLoadState.queued > 0 ||
    state.isPrecompilePending ||
    state.precompileRenderTimer !== null ||
    state.isSceneUpdateQueued
  );
}

export function scheduleCacheWrite(cacheKey: any, cacheCanvas: any, isStillValid: any) {
  state.activeCacheWriteHandle?.cancel();
  const orbitControlsHandle = state.orbitControls;
  const writeHandle: any = {
    cancelled: false,
    frame: null,
    timer: null,
    idle: null,
    cancel: null
  };
  /**
   * 判断这次写盘是否仍然值得提交（未被取消，且外部校验仍通过）。
   */
  const canCommitWrite = () => !writeHandle.cancelled && isStillValid();
  /**
   * 取消本次缓存写入：解绑全部监听、清空离屏画布并置取消标记。
   */
  const cancelCacheWrite = () => {
    writeHandle.cancelled = true;
    if (writeHandle.frame !== null) {
      window.cancelAnimationFrame(writeHandle.frame);
    }
    if (writeHandle.timer !== null) {
      window.clearTimeout(writeHandle.timer);
    }
    if (writeHandle.idle !== null) {
      window.cancelIdleCallback?.(writeHandle.idle);
    }
    writeHandle.frame = writeHandle.timer = writeHandle.idle = null;
    window.removeEventListener("pagehide", cancelCacheWrite);
    window.removeEventListener("pointerdown", cancelCacheWrite, true);
    window.removeEventListener("wheel", cancelCacheWrite, true);
    orbitControlsHandle?.removeEventListener("start", cancelCacheWrite);
    orbitControlsHandle?.removeEventListener("change", cancelCacheWrite);
    if (cacheCanvas) {
      cacheCanvas.width = cacheCanvas.height = 0;
      cacheCanvas = null;
    }
    if (state.activeCacheWriteHandle === writeHandle) {
      state.activeCacheWriteHandle = null;
    }
  };
  writeHandle.cancel = cancelCacheWrite;
  state.activeCacheWriteHandle = writeHandle;
  /**
   * 上报缓存写盘过程中的异常（走宿主注入的 HABridgeLog，不打断渲染流程）。
   */
  const logCacheWriteError = (cacheError: any) =>
    window.HABridgeLog?.error?.(cacheError, {
      phase: "interaction3d-cache-write"
    });
  /**
   * 真正执行写盘（由空闲回调触发），无论成败都收尾清理。用 Promise.resolve().then 把写盘推到
   */
  const runCacheWrite = () => {
    writeHandle.idle = null;
    Promise.resolve()
      .then(() => {
        if (canCommitWrite()) {
          return renderCache?.write(cacheKey, cacheCanvas, canCommitWrite);
        }
      })
      .catch(logCacheWriteError)
      .finally(cancelCacheWrite);
  };
  try {
    window.addEventListener("pagehide", cancelCacheWrite, {
      once: true
    });
    window.addEventListener("pointerdown", cancelCacheWrite, {
      capture: true,
      passive: true
    });
    window.addEventListener("wheel", cancelCacheWrite, {
      capture: true,
      passive: true
    });
    orbitControlsHandle?.addEventListener("start", cancelCacheWrite);
    orbitControlsHandle?.addEventListener("change", cancelCacheWrite);
    writeHandle.frame = window.requestAnimationFrame(() => {
      writeHandle.frame = null;
      if (!canCommitWrite()) {
        cancelCacheWrite();
        return;
      }
      writeHandle.timer = window.setTimeout(() => {
        writeHandle.timer = null;
        if (!canCommitWrite()) {
          cancelCacheWrite();
          return;
        }
        try {
          if (typeof window.requestIdleCallback == "function") {
            writeHandle.idle = window.requestIdleCallback(runCacheWrite);
          } else {
            runCacheWrite();
          }
        } catch (idleCallbackError) {
          cancelCacheWrite();
          logCacheWriteError(idleCallbackError);
        }
      }, 180);
    });
  } catch (cacheWriteFailure) {
    cancelCacheWrite();
    logCacheWriteError(cacheWriteFailure);
  }
}

export async function settleStageLightCache() {
  state.lightCacheSettleTimer = null;
  if (
    !state.isFrameLoopAvailable ||
    renderCache?.closed ||
    !state.renderer ||
    state.exportRenderState ||
    state.isCameraMotionActive ||
    state.isExportRendering ||
    state.isLightCacheBuilding ||
    state.lightTransitionSession ||
    state.isMotionRendering ||
    state.isCurtainMoving ||
    state.isVacuumMoving ||
    state.isBackgroundFrameVisible ||
    state.isLightFadeAnimating
  ) {
    return;
  }
  if (
    hasPendingRenderWork() ||
    state.spotShadowAtlasController?.isBuilding() ||
    state.spotShadowAtlasController?.isPending()
  ) {
    scheduleLightCacheBuild(120);
    return;
  }
  const stageCanvasElement = state.renderer.domElement;
  const stageCanvasWidthPx = stageCanvasElement.width;
  const stageCanvasHeightPx = stageCanvasElement.height;
  if (!stageCanvasWidthPx || !stageCanvasHeightPx) {
    return;
  }
  const settleCacheRevision = state.lightCacheRevision;
  /**
   * 复验「本次缓存烘焙是否仍然有效」。与函数开头的准入条件同源，但额外要求
   */
  const isSettleValid = () =>
    state.isFrameLoopAvailable &&
    !renderCache?.closed &&
    !hasPendingRenderWork() &&
    settleCacheRevision === state.lightCacheRevision &&
    !state.exportRenderState &&
    !state.isCameraMotionActive &&
    !state.isExportRendering &&
    !state.lightTransitionSession &&
    !state.isMotionRendering &&
    !state.isCurtainMoving &&
    !state.isVacuumMoving &&
    !state.isBackgroundFrameVisible &&
    !state.isLightFadeAnimating;
  state.isLightCacheBuilding = true;
  let cacheEntry;
  let transientCacheCanvas = null;
  let settleCacheKey;
  let didSettleFail = false;
  try {
    const settlePreviewLights = collectPreviewLights();
    const settleCacheSignature = sha256(
      stableCacheJSON({
        kind: "settled-rgba-v1",
        base: sceneCacheDescriptor(stageCanvasWidthPx, stageCanvasHeightPx),
        lights: settlePreviewLights.map(
          ({ item: settledLightItem, itemKey: settledLightKey, group: settledLightGroup }: any) => ({
            key: settledLightKey,
            enabled: settledLightGroup?.enabled !== false,
            brightness: settledLightItem.lightBrightness,
            temperature: settledLightItem.lightTemperature
          })
        )
      })
    );
    settleCacheKey = settleCacheSignature;
    cacheEntry = await renderCache?.acquire(
      settleCacheSignature,
      stageCanvasWidthPx,
      stageCanvasHeightPx,
      isSettleValid
    );
    if (!isSettleValid()) {
      return;
    }
    if (!cacheEntry) {
      const settledLightsByKey = ensureLightModels(settlePreviewLights);
      applyLightVisibility(settledLightsByKey);
      applyRenderQualityMode();
      state.renderer.render(state.previewOverlayScene, state.previewCamera);
      cacheEntry = document.createElement("canvas");
      transientCacheCanvas = cacheEntry;
      cacheEntry.width = stageCanvasWidthPx;
      cacheEntry.height = stageCanvasHeightPx;
      const scratchCanvasContext = cacheEntry.getContext("2d");
      if (!scratchCanvasContext) {
        throw new Error("当前浏览器无法创建静止画面缓存。");
      }
      scratchCanvasContext.drawImage(stageCanvasElement, 0, 0);
    }
    if (!isSettleValid()) {
      return;
    }
    const lightCacheContext = lightCacheCanvasElement.getContext("2d");
    if (!lightCacheContext) {
      throw new Error("当前浏览器无法创建静止画面缓存。");
    }
    lightCacheCanvasElement.width = stageCanvasWidthPx;
    lightCacheCanvasElement.height = stageCanvasHeightPx;
    lightCacheContext.clearRect(0, 0, stageCanvasWidthPx, stageCanvasHeightPx);
    lightCacheContext.drawImage((cacheEntry as any).image || cacheEntry, 0, 0);
    state.canvasByLightGroupKey.clear();
    state.brightnessByLightGroupKey.clear();
    state.isLightCacheReady = true;
    state.needsLightCacheRefresh = false;
    stageCanvasElement.dataset.lightCachePixels = String(stageCanvasWidthPx * stageCanvasHeightPx);
    stageCanvasElement.dataset.lightCacheRetainedGroups = "complete-frame";
    setLightCacheVisible(true);
    if (transientCacheCanvas) {
      scheduleCacheWrite(settleCacheKey, transientCacheCanvas, isSettleValid);
      transientCacheCanvas = null;
    }
  } catch (settleCacheError) {
    didSettleFail = true;
    setLightCacheVisible(false);
    window.HABridgeLog?.error?.(settleCacheError, {
      phase: "interaction3d-settled-cache"
    });
  } finally {
    try {
      (cacheEntry as any)?.close?.();
      if (transientCacheCanvas) {
        transientCacheCanvas.width = transientCacheCanvas.height = 0;
      }
    } finally {
      state.isLightCacheBuilding = false;
    }
    if (state.needsLightCacheRefresh && (!didSettleFail || settleCacheRevision !== state.lightCacheRevision)) {
      scheduleLightCacheBuild(420);
    }
  }
}

/**
 * 按各灯光分组的当前亮度，把分组画布合成为一张光照缓存图。只在缓存图层可见时合成（hidden 说明走实时
 */
export function compositeLightCache() {
  if (!state.isLightCacheReady || lightCacheCanvasElement.hidden) {
    return;
  }
  const compositeContext = lightCacheCanvasElement.getContext("2d");
  if (compositeContext) {
    compositeContext.clearRect(0, 0, lightCacheCanvasElement.width, lightCacheCanvasElement.height);
    for (const [groupKey, groupCanvas] of state.canvasByLightGroupKey) {
      const groupBrightness = clamp(finite(state.brightnessByLightGroupKey.get(groupKey), 0), 0, 1);
      if (!(groupBrightness <= 0.001)) {
        compositeContext.save();
        compositeContext.globalAlpha = groupBrightness;
        compositeContext.drawImage(groupCanvas, 0, 0);
        compositeContext.restore();
      }
    }
  }
}

export function invalidateRender(options: any = {}) {
  if (isStageViewerMode && (options.scene === true || options.shadows === true)) {
    state.sceneCacheRevision++;
  }
  state.needsRender = true;
  state.hasRenderedFrame = false;
  state.demandFrameLoop?.wake();
  if (isStageViewerMode && (options.scene === true || options.shadows === true)) {
    cacheObjectTransforms(state.previewOverlayScene, threeModuleMin.Object3D);
  }
  if (options.shadows === true) {
    state.previewOverlayScene?.traverse((invalidatedObject: any) => {
      if (invalidatedObject.isLight && invalidatedObject.castShadow && invalidatedObject.shadow) {
        invalidatedObject.shadow.needsUpdate = true;
      }
    });
  }
  if (!state.isPreservingLightCache) {
    if (
      options.preserveLightCache === true &&
      isAdaptiveLightCacheEnabled() &&
      !state.exportRenderState
    ) {
      if (!state.isLightCacheReady && !state.isLightCacheBuilding) {
        scheduleLightCacheBuild();
      }
      return;
    }
    if (isAdaptiveLightCacheEnabled() && !state.exportRenderState) {
      state.lightCacheRevision += 1;
      state.needsLightCacheRefresh = true;
      if (isStageViewerMode || options.scene === true || !state.isLightCacheReady) {
        setLightCacheVisible(false);
      }
      scheduleLightCacheBuild();
      applyRenderQualityMode();
    } else {
      window.clearTimeout(state.lightCacheSettleTimer);
      state.lightCacheSettleTimer = null;
      state.isLightCacheReady = false;
      state.needsLightCacheRefresh = false;
      setLightCacheVisible(false);
    }
  }
}

export function rebuildLightModelsPreservingCache() {
  state.isPreservingLightCache = true;
  try {
    if (currentPreviewFloorMode() === "all") {
      refreshPreviewScene({
        preserveLightCache: true
      });
    } else {
      refreshLightsLayer({
        preserveLightCache: true
      });
    }
  } finally {
    state.isPreservingLightCache = false;
  }
}

export function collectLightsByItemKey() {
  const lightsByItemKey = new Map();
  state.previewModelRoot?.traverse((lightObject: any) => {
    const lightItemId = lightObject.userData?.lightItemId;
    if (!lightObject.isLight || !lightItemId) {
      return;
    }
    const lightItemKey = floorItemKey(lightObject.userData?.lightFloorId, lightItemId);
    if (!lightsByItemKey.has(lightItemKey)) {
      lightsByItemKey.set(lightItemKey, []);
    }
    lightsByItemKey.get(lightItemKey).push(lightObject);
  });
  return lightsByItemKey;
}

export function ensureLightModels(previewLights: any) {
  let lightsByKey = collectLightsByItemKey();
  if (previewLights.every((lightEntry: any) => lightsByKey.has(lightEntry.itemKey))) {
    return lightsByKey;
  }
  if (isStageViewerMode) {
    return addMissingLightModels(previewLights, lightsByKey);
  }
  state.isRebuildingLightModels = true;
  state.forcedVisibleLightIds = new Set();
  try {
    rebuildLightModelsPreservingCache();
  } finally {
    state.forcedVisibleLightIds = null;
    state.isRebuildingLightModels = false;
  }
  lightsByKey = collectLightsByItemKey();
  return lightsByKey;
}

export function addMissingLightModels(missingPreviewLights: any, missingLightsByKey: any) {
  const previousActiveScene = state.activeScene;
  const previousActiveFloorId = state.activeFloorId;
  const wasRebuildingLightModels = state.isRebuildingLightModels;
  const isOverviewMode = currentPreviewFloorMode() === "all";
  try {
    state.isRebuildingLightModels = true;
    for (const {
      floor: targetFloorForLight,
      item: missingLightItem,
      itemKey: missingLightItemKey
    } of missingPreviewLights) {
      if (
        missingLightsByKey.has(missingLightItemKey) ||
        (!isOverviewMode && targetFloorForLight.id !== previousActiveFloorId)
      ) {
        continue;
      }
      const lightModelGroup = isOverviewMode
        ? state.previewModelRoot?.children.find(
            (floorGroupCandidate: any) => floorGroupCandidate.userData?.floorId === targetFloorForLight.id
          )
        : state.previewModelRoot;
      if (!lightModelGroup) {
        continue;
      }
      state.activeScene = targetFloorForLight.scene;
      state.activeFloorId = targetFloorForLight.id;
      const modelPixelsPerMeter = currentPixelsPerMeter();
      if (!modelPixelsPerMeter) {
        continue;
      }
      const floorBounds = computeFloorBounds();
      const lightOriginX = isOverviewMode
        ? finite(targetFloorForLight.originX, 0)
        : (floorBounds.minX + floorBounds.maxX) / 2;
      const lightOriginY = isOverviewMode
        ? finite(targetFloorForLight.originY, 0)
        : (floorBounds.minY + floorBounds.maxY) / 2;
      const lightGroupObject = new threeModuleMin.Group();
      addLightFixtureToScene(lightGroupObject, missingLightItem, collectShadowCastingLightIds());
      lightGroupObject.position.set(
        (missingLightItem.x - lightOriginX) / modelPixelsPerMeter,
        missingLightItem.elevation || 0,
        (missingLightItem.y - lightOriginY) / modelPixelsPerMeter
      );
      applyItemOrientation(lightGroupObject, missingLightItem);
      lightGroupObject.userData.modelLayer = "lights";
      lightGroupObject.userData.exportRole = "plan";
      lightModelGroup.add(lightGroupObject);
      if (isStageViewerMode) {
        cacheObjectTransforms(lightGroupObject, threeModuleMin.Object3D);
      }
      const lightModelObject: any = [];
      lightGroupObject.traverse((lightModelObjects: any) => {
        if (lightModelObjects.isLight) {
          lightModelObject.push(lightModelObjects);
        }
      });
      if (lightModelObject.length) {
        missingLightsByKey.set(missingLightItemKey, lightModelObject);
      }
    }
  } finally {
    state.activeScene = previousActiveScene;
    state.activeFloorId = previousActiveFloorId;
    state.isRebuildingLightModels = wasRebuildingLightModels;
  }
  applyShadowBudget(state.previewModelRoot, {
    rebuildAtlas: false
  });
  return missingLightsByKey;
}

export function setLightModelVisibility(modelLightsByItemKey: any, visibleItemKey = "") {
  for (const [visibleLightItemKey, visibleLightObjects] of modelLightsByItemKey) {
    const isLightVisible = visibleLightItemKey === visibleItemKey;
    for (const visibleLightObject of visibleLightObjects) {
      visibleLightObject.visible = isLightVisible;
      visibleLightObject.intensity = isLightVisible
        ? finite(visibleLightObject.userData?.lightOnIntensity, 0)
        : 0;
      if (visibleLightObject.isSpotLight) {
        visibleLightObject.castShadow = isLightVisible;
        if (isLightVisible && visibleLightObject.shadow && !visibleLightObject.shadow.map) {
          visibleLightObject.shadow.needsUpdate = true;
        }
      }
    }
  }
  requestRenderFrame();
}

/**
 * 取当前「生效中」灯具的物件键集合（分组开启且亮度大于 0）。与 collectActiveLights 的
 */
export function activeLightItemKeys() {
  return new Set(
    collectPreviewLights()
      .filter(
        ({ item: activeLightCandidate, group: candidateLightGroup }: any) =>
          candidateLightGroup?.enabled !== false &&
          finite(activeLightCandidate.lightBrightness, 0) > 0
      )
      .map(({ itemKey: activeLightKey }: any) => activeLightKey)
  );
}

/**
 * 按「当前生效的灯」批量设置可见性（缓存烘焙结束后的还原用）。与 setLightModelVisibility 的区别：
 */
export function applyLightVisibility(visibilityLightsByItemKey: any) {
  const activeLightKeys = activeLightItemKeys();
  for (const [visibilityItemKey, visibilityLightObjects] of visibilityLightsByItemKey) {
    const isLightKeyActive = activeLightKeys.has(visibilityItemKey);
    for (const visibilityLightObject of visibilityLightObjects) {
      visibilityLightObject.visible = isLightKeyActive;
      visibilityLightObject.intensity = isLightKeyActive
        ? finite(visibilityLightObject.userData?.lightOnIntensity, 0)
        : 0;
      if (visibilityLightObject.isSpotLight) {
        visibilityLightObject.castShadow = false;
      }
    }
  }
  requestRenderFrame();
}

/**
 * 把当前画面（含光照缓存图层）拷进遮挡画布，遮住缓存烘焙过程的中间态。烘焙要逐灯渲染并读回像素，实时画布会短暂处于
 */
export function drawRenderShield() {
  if (!previewRenderShieldElement || !state.renderer?.domElement) {
    return;
  }
  const shieldSourceCanvas = state.renderer.domElement;
  if (!shieldSourceCanvas.width || !shieldSourceCanvas.height) {
    return;
  }
  if (isStageViewerMode) {
    window.clearTimeout(state.shieldHideTimer);
    state.shieldHideTimer = null;
    previewRenderShieldElement.style.transition = "none";
    previewRenderShieldElement.style.opacity = "1";
  }
  previewRenderShieldElement.width = shieldSourceCanvas.width;
  previewRenderShieldElement.height = shieldSourceCanvas.height;
  const shieldContext = previewRenderShieldElement.getContext("2d");
  if (shieldContext) {
    shieldContext.globalCompositeOperation = "source-over";
    shieldContext.globalAlpha = 1;
    shieldContext.fillStyle = "#" + studioPalette().background.toString(16).padStart(6, "0");
    shieldContext.fillRect(
      0,
      0,
      previewRenderShieldElement.width,
      previewRenderShieldElement.height
    );
    if (isStageViewerMode) {
      state.renderer.render(state.previewOverlayScene, state.previewCamera);
    }
    shieldContext.drawImage(shieldSourceCanvas, 0, 0);
    if (!lightCacheCanvasElement.hidden) {
      if (isStageViewerMode) {
        shieldContext.drawImage(
          lightCacheCanvasElement,
          0,
          0,
          previewRenderShieldElement.width,
          previewRenderShieldElement.height
        );
      } else {
        shieldContext.drawImage(lightCacheCanvasElement, 0, 0);
      }
    }
    previewRenderShieldElement.hidden = false;
  }
}

/**
 * 隐藏渲染遮挡层；舞台模式下可选择 180ms 淡出。硬切换会让人觉得画面「跳」了一下，故舞台模式在有缓存结果时
 */
export function hideRenderShield({ smooth: isSmooth = false } = {}) {
  if (previewRenderShieldElement) {
    if (isStageViewerMode) {
      window.clearTimeout(state.shieldHideTimer);
      state.shieldHideTimer = null;
      if (isSmooth && !previewRenderShieldElement.hidden) {
        previewRenderShieldElement.style.transition = "opacity 180ms ease-out";
        previewRenderShieldElement.style.opacity = "0";
        state.shieldHideTimer = window.setTimeout(() => {
          state.shieldHideTimer = null;
          previewRenderShieldElement.hidden = true;
          previewRenderShieldElement.style.transition = "none";
          previewRenderShieldElement.style.opacity = "1";
        }, 180);
        return;
      }
      previewRenderShieldElement.style.transition = "none";
      previewRenderShieldElement.style.opacity = "1";
    }
    previewRenderShieldElement.hidden = true;
  }
}

/**
 * 等待画面真正绘制上屏，用于「挡住画布 → 渲染 → 读像素」的预览取图流程。先调用
 */
export function nextPaint() {
  drawRenderShield();
  return new Promise(resolvePaint =>
    requestAnimationFrame(() => requestAnimationFrame(resolvePaint))
  );
}

export function readCanvasPixels(readbackWidthPx: any, readbackHeightPx: any) {
  const readbackCanvas = document.createElement("canvas");
  readbackCanvas.width = readbackWidthPx;
  readbackCanvas.height = readbackHeightPx;
  const readbackContext = readbackCanvas.getContext("2d", {
    willReadFrequently: true
  });
  if (!readbackContext) {
    throw new Error("当前浏览器无法创建多灯缓存画布。");
  }
  readbackContext.drawImage(state.renderer.domElement, 0, 0, readbackWidthPx, readbackHeightPx);
  return readbackContext.getImageData(0, 0, readbackWidthPx, readbackHeightPx);
}

/**
 * 连续渲染 3 帧预览场景，让延迟生效的渲染效果（阴影图集分配、后处理）收敛后再读像素。
 */
export function renderPreviewFrames() {
  for (let frameIndex = 0; frameIndex < 3; frameIndex += 1) {
    state.renderer.render(state.previewOverlayScene, state.previewCamera);
  }
}

export function scheduleLightCacheBuild(settleDelayMs = 420) {
  if (
    (!isStageViewerMode || !!state.isFrameLoopAvailable) &&
    (!isStageViewerMode || !renderCache?.closed) &&
    !!state.renderer &&
    !!state.previewModelRoot &&
    !state.exportRenderState &&
    !state.isCameraMotionActive &&
    !state.isExportRendering &&
    !state.isLightCacheBuilding &&
    !state.lightTransitionSession &&
    !state.isMotionRendering &&
    !!isAdaptiveLightCacheEnabled()
  ) {
    window.clearTimeout(state.lightCacheSettleTimer);
    state.lightCacheSettleTimer = window.setTimeout(() => {
      const settleModelLoadState = externalModelManager.modelLoadState();
      if (settleModelLoadState.active > 0 || settleModelLoadState.queued > 0) {
        state.lightCacheSettleTimer = null;
        scheduleLightCacheBuild(240);
        return;
      }
      buildLightCache();
    }, settleDelayMs);
  }
}

export async function buildLightCache() {
  if (isStageViewerMode) {
    return settleStageLightCache();
  }
  state.lightCacheSettleTimer = null;
  if (
    !state.renderer ||
    state.exportRenderState ||
    state.isCameraMotionActive ||
    state.isExportRendering ||
    state.isLightCacheBuilding ||
    state.lightTransitionSession ||
    state.isMotionRendering ||
    !isAdaptiveLightCacheEnabled()
  ) {
    return;
  }
  const cacheRevision = state.lightCacheRevision;
  const cachePreviewLights = collectPreviewLights().filter(
    ({ item: cacheLightItem, group: cacheLightGroup }: any) =>
      finite(cacheLightItem.lightBrightness, 0) > 0
  );
  const cacheCanvasElement = state.renderer.domElement;
  let cacheWidthPx = cacheCanvasElement.width;
  let cacheHeightPx = cacheCanvasElement.height;
  if (!cacheWidthPx || !cacheHeightPx || !cachePreviewLights.length) {
    return;
  }
  state.isLightCacheBuilding = true;
  state.needsLightCacheRefresh = true;
  const controlsEnabled = state.orbitControls.enabled;
  const gridVisibilityByObject = new Map();
  let didBuildCache = false;
  applyRenderQualityMode();
  try {
    const cacheContext = lightCacheCanvasElement.getContext("2d");
    if (!cacheContext) {
      throw new Error("当前浏览器无法显示多灯缓存。");
    }
    if (
      lightCacheCanvasElement.hidden ||
      !state.isLightCacheReady ||
      lightCacheCanvasElement.width !== cacheWidthPx ||
      lightCacheCanvasElement.height !== cacheHeightPx
    ) {
      lightCacheCanvasElement.width = cacheWidthPx;
      lightCacheCanvasElement.height = cacheHeightPx;
      cacheContext.clearRect(0, 0, cacheWidthPx, cacheHeightPx);
    }
    const accumulatedLightCanvas = document.createElement("canvas");
    accumulatedLightCanvas.width = cacheWidthPx;
    accumulatedLightCanvas.height = cacheHeightPx;
    const accumulatedLightContext = accumulatedLightCanvas.getContext("2d");
    const deltaLightCanvas = document.createElement("canvas");
    deltaLightCanvas.width = cacheWidthPx;
    deltaLightCanvas.height = cacheHeightPx;
    const deltaLightContext = deltaLightCanvas.getContext("2d");
    if (!accumulatedLightContext || !deltaLightContext) {
      throw new Error("当前浏览器无法合成多灯缓存。");
    }
    const lightCanvasByGroupKey = new Map();
    const cacheLightsByKey = ensureLightModels(cachePreviewLights);
    await nextPaint();
    if (
      cacheRevision !== state.lightCacheRevision ||
      state.exportRenderState ||
      state.isCameraMotionActive ||
      state.isExportRendering ||
      !isAdaptiveLightCacheEnabled()
    ) {
      return;
    }
    setLightModelVisibility(cacheLightsByKey);
    accumulatedLightContext.clearRect(0, 0, cacheWidthPx, cacheHeightPx);
    state.previewModelRoot.traverse((previewObject: any) => {
      if (previewObject.userData?.exportRole === "grid") {
        gridVisibilityByObject.set(previewObject, previewObject.visible);
        previewObject.visible = false;
      }
    });
    let baselineLightPixels;
    for (const cacheLightEntry of cachePreviewLights) {
      await yieldToIdle();
      if (
        cacheRevision !== state.lightCacheRevision ||
        state.exportRenderState ||
        state.isCameraMotionActive ||
        state.isExportRendering ||
        !isAdaptiveLightCacheEnabled()
      ) {
        break;
      }
      const {
        group: entryLightGroup,
        itemKey: entryItemKey,
        groupKey: entryGroupKey
      } = cacheLightEntry;
      deltaLightContext.clearRect(0, 0, cacheWidthPx, cacheHeightPx);
      {
        if (!baselineLightPixels) {
          setLightModelVisibility(cacheLightsByKey);
          renderPreviewFrames();
          baselineLightPixels = readCanvasPixels(cacheWidthPx, cacheHeightPx);
        }
        setLightModelVisibility(cacheLightsByKey, entryItemKey);
        renderPreviewFrames();
        const isolatedLightPixels = readCanvasPixels(cacheWidthPx, cacheHeightPx);
        const lightDeltaPixels = buildLightDeltaPixels(
          baselineLightPixels.data,
          isolatedLightPixels.data
        );
        deltaLightContext.putImageData(
          new ImageData(lightDeltaPixels as any, cacheWidthPx, cacheHeightPx),
          0,
          0
        );
      }
      accumulatedLightContext.drawImage(deltaLightCanvas, 0, 0);
      let groupLightCanvas = lightCanvasByGroupKey.get(entryGroupKey);
      if (!groupLightCanvas) {
        groupLightCanvas = document.createElement("canvas");
        groupLightCanvas.width = cacheWidthPx;
        groupLightCanvas.height = cacheHeightPx;
        groupLightCanvas.userData = {
          enabled: entryLightGroup?.enabled !== false
        };
        lightCanvasByGroupKey.set(entryGroupKey, groupLightCanvas);
      }
      groupLightCanvas.getContext("2d")?.drawImage(deltaLightCanvas, 0, 0);
      await yieldToScheduler();
      if (
        cacheRevision !== state.lightCacheRevision ||
        state.exportRenderState ||
        state.isCameraMotionActive ||
        state.isExportRendering ||
        !isAdaptiveLightCacheEnabled()
      ) {
        break;
      }
    }
    if (
      cacheRevision === state.lightCacheRevision &&
      !state.exportRenderState &&
      isAdaptiveLightCacheEnabled()
    ) {
      state.canvasByLightGroupKey = lightCanvasByGroupKey;
      for (const [builtGroupKey, builtGroupCanvas] of lightCanvasByGroupKey) {
        state.brightnessByLightGroupKey.set(
          builtGroupKey,
          builtGroupCanvas.userData?.enabled === false ? 0 : 1
        );
      }
      state.isLightCacheReady = true;
      state.needsLightCacheRefresh = false;
      setLightCacheVisible(true);
      compositeLightCache();
      didBuildCache = true;
    }
  } catch (lightCacheBuildError) {
    window.HABridgeLog?.error?.(lightCacheBuildError, {
      phase: "studio-light-cache"
    });
    debugLog("error", lightCacheBuildError);
    state.isLightCacheReady = !lightCacheCanvasElement.hidden;
  } finally {
    for (const [restoredObject, restoredVisibility] of gridVisibilityByObject) {
      restoredObject.visible = restoredVisibility;
    }
    const restoredLightsByKey = collectLightsByItemKey();
    if (state.lightTransitionSession) {
      state.lightTransitionSession.restore();
    } else if (state.isCameraMotionActive) {
      applyLightVisibility(restoredLightsByKey);
    } else {
      setLightModelVisibility(restoredLightsByKey);
    }
    renderPreviewFrames();
    if (didBuildCache) {
      requestAnimationFrame(() => hideRenderShield());
    } else {
      hideRenderShield();
    }
    state.orbitControls.enabled = controlsEnabled;
    state.isLightCacheBuilding = false;
    applyRenderQualityMode();
    if (state.needsLightCacheRefresh && isAdaptiveLightCacheEnabled() && !state.exportRenderState) {
      scheduleLightCacheBuild();
    }
  }
}

/**
 * 清空预览模型根节点下的全部子节点，并逐个释放其 GPU 资源。先复制 children 再遍历：
 */
export function clearPreviewModel() {
  if (state.previewModelRoot) {
    for (const removedChild of [...state.previewModelRoot.children]) {
      state.previewModelRoot.remove(removedChild);
      disposeSceneSubtree(removedChild);
    }
  }
}

export function addRugMeshes(rugParent: any, rugItem: any, rugBaseColor: any, rugInsetColor: any) {
  const servedRugGeometry = buildRugGeometry(rugItem.width, rugItem.height, rugItem.depth);
  if (!servedRugGeometry) {
    return false;
  }
  const isRugSelected = isSelected("item", rugItem.id);
  const rugBaseMaterial = isRugSelected
    ? resolveRugMaterial(rugBaseColor).clone()
    : resolveRugMaterial(rugBaseColor);
  const rugBaseMesh = new threeModuleMin.Mesh(servedRugGeometry.base, rugBaseMaterial);
  rugBaseMesh.position.y = servedRugGeometry.rugThickness * 0.5;
  rugBaseMesh.castShadow = false;
  rugBaseMesh.receiveShadow = true;
  rugBaseMesh.userData.rugSharedGeometry = true;
  rugBaseMesh.userData.rugSharedMaterial = !isRugSelected;
  rugParent.add(rugBaseMesh);
  const rugInsetMaterial = isRugSelected
    ? resolveRugMaterial(rugInsetColor, true).clone()
    : resolveRugMaterial(rugInsetColor, true);
  const rugInsetMesh = new threeModuleMin.Mesh(servedRugGeometry.inset, rugInsetMaterial);
  rugInsetMesh.rotation.x = -Math.PI / 2;
  rugInsetMesh.position.y = servedRugGeometry.rugThickness + 0.001;
  rugInsetMesh.castShadow = false;
  rugInsetMesh.receiveShadow = true;
  rugInsetMesh.renderOrder = 1;
  rugInsetMesh.userData.rugSharedGeometry = true;
  rugInsetMesh.userData.rugSharedMaterial = !isRugSelected;
  rugParent.add(rugInsetMesh);
  rugParent.userData.optimizationStats = {
    type: "rug",
    before: 2,
    after: 2,
    sharedResources: true
  };
  return true;
}

/**
 * @returns {THREE.Object3D} 传入的同一个对象，便于链式书写。
 */
export function markAsLightSourcePreview(lightSourceObject: any) {
  lightSourceObject.userData.exportRole = "light-source-preview";
  lightSourceObject.castShadow = false;
  lightSourceObject.receiveShadow = false;
  lightSourceObject.renderOrder = 20;
  return lightSourceObject;
}

export function addStripLightPreview(previewParent: any, stripLightItem: any) {
  if (stripLightItem.type !== "striplight") {
    return;
  }
  const previewGroup = new threeModuleMin.Group();
  previewGroup.userData.exportRole = "light-source-preview";
  previewGroup.userData.lightSourcePreview = true;
  previewGroup.visible =
    stripLightItem.lightSourceVisible !== false &&
    !state.exportRenderState &&
    isSelected("item", stripLightItem.id);
  const lightEmissiveColor = kelvinToRgbHex(stripLightItem.lightTemperature) || 16762219;
  const stripDepth = clamp(finite(stripLightItem.depth, 0.28), 0.1, 8);
  const stripWidth = clamp(finite(stripLightItem.width, 1), 0.1, 8);
  const stripThickness = stripDepth;
  const yawGroup = new threeModuleMin.Group();
  yawGroup.rotation.z = threeModuleMin.MathUtils.degToRad(
    normalizeFullRotation(stripLightItem.verticalRotation)
  );
  const rollGroup = new threeModuleMin.Group();
  rollGroup.rotation.x = threeModuleMin.MathUtils.degToRad(
    normalizeFullRotation(stripLightItem.stripRollRotation)
  );
  const glowLength = clamp(finite(stripLightItem.lightRange, 3.5) * 0.16, 0.28, 0.72);
  markAsLightSourcePreview(
    addBoxMesh(
      rollGroup,
      stripWidth,
      0.014,
      stripThickness,
      0,
      -glowLength,
      0,
      lightEmissiveColor,
      {
        rounded: false,
        transparent: true,
        opacity: 0.24,
        depthWrite: false,
        emissive: lightEmissiveColor,
        emissiveIntensity: 0.68,
        castShadow: false,
        receiveShadow: false
      }
    )
  );
  markAsLightSourcePreview(
    addCylinderMesh(
      rollGroup,
      0.012,
      0.012,
      glowLength,
      0,
      -glowLength * 0.5,
      0,
      lightEmissiveColor,
      {
        segments: 10,
        transparent: true,
        opacity: 0.78,
        depthWrite: false,
        roughness: 0.3,
        emissive: lightEmissiveColor,
        emissiveIntensity: 0.8
      }
    )
  );
  const emitterConeMesh = new threeModuleMin.Mesh(
    new threeModuleMin.ConeGeometry(0.045, 0.12, 10),
    new threeModuleMin.MeshBasicMaterial({
      color: lightEmissiveColor,
      transparent: true,
      opacity: 0.82,
      depthWrite: false
    })
  );
  emitterConeMesh.rotation.x = Math.PI;
  emitterConeMesh.position.set(0, -glowLength, 0);
  markAsLightSourcePreview(emitterConeMesh);
  rollGroup.add(emitterConeMesh);
  yawGroup.add(rollGroup);
  previewGroup.add(yawGroup);
  previewParent.add(previewGroup);
}

export function highlightSelectedModel(highlightRoot: any, shouldHighlight: any) {
  if (!shouldHighlight) {
    return;
  }
  const accentPalette = studioPalette();
  highlightRoot.traverse((highlightNode: any) => {
    const highlightMaterials = Array.isArray(highlightNode.material)
      ? highlightNode.material
      : highlightNode.material
        ? [highlightNode.material]
        : [];
    for (const highlightMaterial of highlightMaterials) {
      if (highlightMaterial?.isMeshStandardMaterial) {
        highlightMaterial.emissive = new threeModuleMin.Color(accentPalette.accent);
        highlightMaterial.emissiveIntensity = 0.32;
      }
    }
  });
}

export function buildPlanLabelMesh(labelSettings: any) {
  const labelCanvasElement = document.createElement("canvas");
  labelCanvasElement.width = 2048;
  labelCanvasElement.height = 640;
  const labelContext: any = labelCanvasElement.getContext("2d");
  labelContext.clearRect(0, 0, labelCanvasElement.width, labelCanvasElement.height);
  labelContext.fillStyle = PLAN_LABEL();
  labelContext.textAlign = "left";
  labelContext.textBaseline = "middle";
  const labelTitle = normalizeLabelText(labelSettings.title, "家庭总览", 24);
  const labelSubtitle = normalizeLabelText(labelSettings.subtitle, "HOME PLAN", 36);
  const titleX = 115;
  const titleFontSize = 184;
  labelContext.font = "700 " + titleFontSize + "px sans-serif";
  drawTrackedText(
    labelContext,
    labelTitle,
    titleX,
    130,
    titleFontSize * clamp(finite(labelSettings.titleSpacing, 1.05), 0, 1.8),
    1340
  );
  const badgeX = 1580;
  const badgeY = 130;
  const badgeSize = 170;
  labelContext.fillStyle = PLAN_LABEL();
  labelContext.beginPath();
  labelContext.moveTo(badgeX, badgeY - badgeSize * 0.58);
  labelContext.lineTo(badgeX + badgeSize * 0.56, badgeY - badgeSize * 0.02);
  labelContext.lineTo(badgeX + badgeSize * 0.38, badgeY - badgeSize * 0.02);
  labelContext.lineTo(badgeX + badgeSize * 0.38, badgeY + badgeSize * 0.5);
  labelContext.lineTo(badgeX - badgeSize * 0.38, badgeY + badgeSize * 0.5);
  labelContext.lineTo(badgeX - badgeSize * 0.38, badgeY - badgeSize * 0.02);
  labelContext.lineTo(badgeX - badgeSize * 0.56, badgeY - badgeSize * 0.02);
  labelContext.closePath();
  labelContext.fill();
  labelContext.save();
  labelContext.globalCompositeOperation = "destination-out";
  labelContext.fillRect(
    badgeX - badgeSize * 0.09,
    badgeY + badgeSize * 0.2,
    badgeSize * 0.18,
    badgeSize * 0.3
  );
  labelContext.restore();
  labelContext.fillStyle = PLAN_LABEL();
  labelContext.textAlign = "left";
  const subtitleFontSize = 310;
  labelContext.font = "400 " + subtitleFontSize + 'px "Arial Narrow", Arial, sans-serif';
  drawTrackedText(
    labelContext,
    labelSubtitle,
    72,
    410,
    subtitleFontSize * clamp(finite(labelSettings.subtitleSpacing, 0.08), 0, 0.6),
    1880
  );
  const ruleStartX = 74;
  const ruleEndX = ruleStartX + clamp(finite(labelSettings.lineLength, 0.86), 0.3, 1) * 1880;
  labelContext.strokeStyle = "rgba(146, 155, 170, 0.72)";
  labelContext.lineWidth = 16;
  labelContext.beginPath();
  labelContext.moveTo(ruleStartX, 590);
  labelContext.lineTo(ruleEndX, 590);
  labelContext.moveTo(ruleStartX, 566);
  labelContext.lineTo(ruleStartX, 614);
  labelContext.moveTo(ruleEndX, 566);
  labelContext.lineTo(ruleEndX, 614);
  labelContext.stroke();
  const labelTexture = new threeModuleMin.CanvasTexture(labelCanvasElement);
  labelTexture.colorSpace = threeModuleMin.SRGBColorSpace;
  labelTexture.anisotropy = Math.min(state.renderer?.capabilities?.getMaxAnisotropy?.() || 1, 8);
  labelTexture.needsUpdate = true;
  const labelMesh = new threeModuleMin.Mesh(
    new threeModuleMin.PlaneGeometry(labelSettings.width, labelSettings.depth),
    new threeModuleMin.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      toneMapped: false,
      side: threeModuleMin.DoubleSide,
      forceSinglePass: isStageViewerMode
    })
  );
  labelMesh.rotation.x = -Math.PI / 2;
  labelMesh.position.y = 0.008;
  labelMesh.castShadow = false;
  labelMesh.receiveShadow = false;
  labelMesh.renderOrder = 8;
  return labelMesh;
}

export function collectShadowCastingLightIds() {
  return new Set(
    selectShadowCastingLightIds(
      state.activeScene.items.map((sceneLightItem: any) => ({
        id: sceneLightItem.id,
        groupId: sceneLightItem.lightGroupId,
        type: sceneLightItem.type,
        brightness: finite(
          sceneLightItem.lightBrightness,
          (DEFAULT_LIGHT_SETTINGS as any)[sceneLightItem.type]?.brightness || 0
        ),
        enabled: LIGHT_ITEM_TYPES.has(sceneLightItem.type) && isLightEnabled(sceneLightItem)
      })),
      MAX_SPOT_SHADOW_TEXTURE_UNITS
    )
  );
}

/**
 * @returns {number} 单 mesh 最大纹理单元数。
 */
export function maxTexturesPerMesh(measuredRoot = state.previewModelRoot) {
  let maxTextureCount = 0;
  measuredRoot?.traverse((measuredMesh: any) => {
    if (!measuredMesh.isMesh) {
      return;
    }
    const meshMaterials = Array.isArray(measuredMesh.material)
      ? measuredMesh.material
      : measuredMesh.material
        ? [measuredMesh.material]
        : [];
    for (const meshMaterial of meshMaterials) {
      maxTextureCount = Math.max(maxTextureCount, countMaterialTextures(meshMaterial));
    }
  });
  if (state.previewOverlayScene?.environment?.isTexture) {
    maxTextureCount += 1;
  }
  return maxTextureCount;
}

/**
 * @returns {number} 可用的最大纹理单元数（至少为 1）。
 */
export function queryMaxTextureUnits() {
  const glContext = state.renderer?.getContext?.();
  const maxImageUnits = glContext?.getParameter?.(glContext.MAX_TEXTURE_IMAGE_UNITS);
  return Math.max(1, Math.floor(finite(maxImageUnits, state.renderer?.capabilities?.maxTextures || 16)));
}

/**
 * @returns {Array<object>} 候选项列表（id / groupId / type / brightness / enabled）。
 */
export function collectSpotShadowCandidates(shadowSearchRoot = state.previewModelRoot) {
  const shadowCandidates: any = [];
  shadowSearchRoot?.traverse((spotlightNode: any) => {
    if (!spotlightNode.isSpotLight || spotlightNode.userData?.shadowCandidate !== true) {
      return;
    }
    const candidateFloorId = String(spotlightNode.userData?.lightFloorId || "");
    const candidateItemId = String(spotlightNode.userData?.lightItemId || "");
    if (candidateItemId) {
      shadowCandidates.push({
        id: candidateFloorId + ":" + candidateItemId,
        groupId: candidateFloorId + ":" + String(spotlightNode.userData?.lightGroupId || ""),
        type: String(spotlightNode.userData?.lightType || "downlight"),
        brightness: finite(spotlightNode.userData?.lightBrightness, 0),
        enabled: spotlightNode.visible !== false
      });
    }
  });
  return shadowCandidates;
}

export function applyShadowBudget(
  shadowRoot = state.previewModelRoot,
  { rebuildAtlas: shouldRebuildAtlas = true } = {}
) {
  if (isRegionLightingEnabled) {
    shadowRoot?.traverse((regionLightNode: any) => {
      if (regionLightNode.isLight && regionLightNode.userData?.lightItemId) {
        regionLightNode.castShadow = false;
        regionLightNode.layers.set(REGION_LIGHT_LAYER);
      }
    });
    if (state.renderer) {
      state.renderer.domElement.dataset.spotShadowMode = "region";
      state.renderer.domElement.dataset.activeSpotShadows = "0";
    }
    return 0;
  }
  if (!shadowRoot || !state.renderer) {
    return 0;
  }
  const fragmentTextureUnits = queryMaxTextureUnits();
  const materialTextureUnits = maxTexturesPerMesh(shadowRoot);
  let nonSpotShadowTextureUnits = 0;
  state.previewOverlayScene?.traverse((overlayLightNode: any) => {
    if (
      overlayLightNode.visible !== false &&
      overlayLightNode.isLight &&
      !overlayLightNode.isSpotLight &&
      overlayLightNode.castShadow
    ) {
      nonSpotShadowTextureUnits += 1;
    }
  });
  let hasRectAreaLight = false;
  shadowRoot.traverse((rectAreaLightNode: any) => {
    if (rectAreaLightNode.visible !== false && rectAreaLightNode.isRectAreaLight) {
      hasRectAreaLight = true;
    }
  });
  const rectAreaTextureUnits = hasRectAreaLight ? RECT_AREA_LIGHT_TEXTURE_UNITS : 0;
  const availableSpotShadowUnits =
    fragmentTextureUnits -
    materialTextureUnits -
    nonSpotShadowTextureUnits -
    rectAreaTextureUnits -
    RESERVED_TEXTURE_UNITS;
  if (!state.exportRenderState && state.spotShadowAtlasController && availableSpotShadowUnits >= 1) {
    const spotShadowLimit = shouldRebuildAtlas
      ? state.spotShadowAtlasController.schedule(shadowRoot)
      : collectSpotShadowCandidates(shadowRoot).length;
    const activeSpotShadowCount = state.spotShadowAtlasController.sync(shadowRoot);
    const atlasCanvasElement = state.renderer.domElement;
    atlasCanvasElement.dataset.fragmentTextureUnits = String(fragmentTextureUnits);
    atlasCanvasElement.dataset.materialTextureUnits = String(materialTextureUnits);
    atlasCanvasElement.dataset.spotShadowLimit = String(spotShadowLimit);
    atlasCanvasElement.dataset.activeSpotShadows = String(activeSpotShadowCount);
    let atlasUserLightCount = 0;
    shadowRoot.traverse((atlasLightNode: any) => {
      if (
        atlasLightNode.isLight &&
        atlasLightNode.userData?.lightItemId &&
        atlasLightNode.visible !== false
      ) {
        atlasUserLightCount += 1;
      }
    });
    atlasCanvasElement.dataset.activeUserLights = String(atlasUserLightCount);
    return activeSpotShadowCount;
  }
  const computedShadowLimit = spotShadowTextureUnitLimit({
    maxTextureUnits: fragmentTextureUnits,
    materialTextureUnits: materialTextureUnits,
    nonSpotShadowTextureUnits: nonSpotShadowTextureUnits,
    rectAreaLightTextureUnits: rectAreaTextureUnits,
    reservedTextureUnits: RESERVED_TEXTURE_UNITS,
    hardLimit: MAX_SPOT_SHADOW_TEXTURE_UNITS
  });
  if (state.exportRenderState && state.spotShadowAtlasController) {
    state.spotShadowAtlasController.setEnabled(false);
    state.spotShadowAtlasController.sync(shadowRoot);
  }
  const shadowCastingKeySet = new Set(
    selectShadowCastingLightIds(collectSpotShadowCandidates(shadowRoot), computedShadowLimit)
  );
  let enabledSpotShadowCount = 0;
  shadowRoot.traverse((spotLightNode: any) => {
    if (!spotLightNode.isSpotLight || !spotLightNode.userData?.lightItemId) {
      return;
    }
    const spotLightKey =
      String(spotLightNode.userData?.lightFloorId || "") +
      ":" +
      String(spotLightNode.userData.lightItemId);
    const isSpotShadowEnabled = shadowCastingKeySet.has(spotLightKey);
    spotLightNode.castShadow = isSpotShadowEnabled;
    if (isSpotShadowEnabled) {
      enabledSpotShadowCount += 1;
      if (spotLightNode.shadow && !spotLightNode.shadow.map) {
        spotLightNode.shadow.needsUpdate = true;
      }
    }
  });
  const individualShadowCanvas = state.renderer.domElement;
  individualShadowCanvas.dataset.spotShadowMode = "individual";
  individualShadowCanvas.dataset.fragmentTextureUnits = String(fragmentTextureUnits);
  individualShadowCanvas.dataset.materialTextureUnits = String(materialTextureUnits);
  individualShadowCanvas.dataset.spotShadowLimit = String(computedShadowLimit);
  individualShadowCanvas.dataset.activeSpotShadows = String(enabledSpotShadowCount);
  let individualUserLightCount = 0;
  shadowRoot.traverse((countedLightNode: any) => {
    if (
      countedLightNode.isLight &&
      countedLightNode.userData?.lightItemId &&
      countedLightNode.visible !== false
    ) {
      individualUserLightCount += 1;
    }
  });
  individualShadowCanvas.dataset.activeUserLights = String(individualUserLightCount);
  return enabledSpotShadowCount;
}

export function addLightFixtureToScene(fixtureParent: any, lightFixtureItem: any, prewarmItemIdSet: any) {
  const fixtureColorHex = isStageViewerMode
    ? lightEffectColorHex(lightFixtureItem.lightTemperature)
    : kelvinToRgbHex(lightFixtureItem.lightTemperature);
  const isFixtureOn =
    isLightEnabled(lightFixtureItem) && finite(lightFixtureItem.lightBrightness, 0) > 0;
  const shouldRefreshLight =
    !state.exportRenderState &&
    state.forcedVisibleLightIds === null &&
    (isStageViewerMode || !isAdaptiveLightCacheEnabled());
  const isRebuildingModels = !state.exportRenderState && state.isRebuildingLightModels;
  if (!isFixtureOn && !shouldRefreshLight && !isRebuildingModels) {
    return;
  }
  const lightTypeDefaults =
    (DEFAULT_LIGHT_SETTINGS as any)[lightFixtureItem.type] || DEFAULT_LIGHT_SETTINGS.downlight;
  // 亮度比例：舞台查看器允许到 150%，编辑器预览仍封顶 100%。
  const brightnessRatio =
    clamp(
      finite(lightFixtureItem.lightBrightness, lightTypeDefaults.brightness),
      0,
      isStageViewerMode ? 150 : 100
    ) / 100;
  const brightnessScale = (LIGHT_TYPE_BRIGHTNESS_SCALE as any)[lightFixtureItem.type] || 1.1;
  const isStripLight = lightFixtureItem.type === "striplight";
  const owningLightGroup = lightGroupForItem(lightFixtureItem);
  if (isStripLight) {
    const stripAreaWidth = clamp(finite(lightFixtureItem.width, 2), 0.1, 8);
    const stripAreaDepth = clamp(finite(lightFixtureItem.depth, 0.28), 0.1, 8);
    const stripLightRange = clamp(
      finite(lightFixtureItem.lightRange, lightTypeDefaults.range),
      0.5,
      10
    );
    const rangeRatio = clamp(stripLightRange / lightTypeDefaults.range, 0.45, 1.65);
    const lightElevation = Math.max(finite(lightFixtureItem.elevation, 2.7), 0.4);
    const elevationGain = clamp(Math.max(1, Math.pow(lightElevation / 2.7, 2)), 1, 4);
    const yawLightGroup = new threeModuleMin.Group();
    yawLightGroup.rotation.z = threeModuleMin.MathUtils.degToRad(
      normalizeFullRotation(lightFixtureItem.verticalRotation)
    );
    const rollLightGroup = new threeModuleMin.Group();
    rollLightGroup.rotation.x = threeModuleMin.MathUtils.degToRad(
      normalizeFullRotation(lightFixtureItem.stripRollRotation)
    );
    const stripIntensity =
      (isRegionLightingEnabled ? brightnessRatio : Math.pow(brightnessRatio, 0.82)) *
      48 *
      rangeRatio *
      elevationGain *
      brightnessScale;
    const rectAreaLight = new threeModuleMin.RectAreaLight(
      fixtureColorHex,
      isFixtureOn ? stripIntensity : 0,
      stripAreaWidth * 0.94,
      stripAreaDepth * 0.94
    );
    rectAreaLight.visible = isFixtureOn;
    rectAreaLight.position.y = -0.04;
    rectAreaLight.rotation.x = -Math.PI / 2;
    rectAreaLight.userData.lightItemId = lightFixtureItem.id;
    rectAreaLight.userData.lightGroupId = owningLightGroup?.id || "";
    rectAreaLight.userData.lightFloorId = state.activeFloorId;
    rectAreaLight.userData.lightSourceType = "continuous-area-strip";
    rectAreaLight.userData.lightOnIntensity = stripIntensity;
    if (isRegionLightingEnabled) {
      rectAreaLight.userData.regionFullIntensity =
        rangeRatio * 48 * elevationGain * brightnessScale;
      state.regionLightController?.register(rectAreaLight, lightFixtureItem);
    }
    rollLightGroup.add(rectAreaLight);
    yawLightGroup.add(rollLightGroup);
    fixtureParent.add(yawLightGroup);
    return;
  }
  const needsShadowRefresh = prewarmItemIdSet?.has(lightFixtureItem.id) === true;
  const shouldConfigureShadow = needsShadowRefresh || isRebuildingModels || shouldRefreshLight;
  const spotRange = clamp(finite(lightFixtureItem.lightRange, lightTypeDefaults.range), 0.5, 10);
  const spotAngleDeg = clamp(
    finite(lightFixtureItem.lightAngle, lightTypeDefaults.angle),
    15,
    maxLightAngleForType(lightFixtureItem.type)
  );
  const spotLightCount = 1;
  const spotBaseIntensity =
    (lightFixtureItem.type === "ceilinglight" ? 680 : 520) *
    (isRegionLightingEnabled
      ? brightnessRatio
      : // 超过 100% 的部分不能被灯型的响应曲线压饱和，否则调高亮度看不出变化，
        // 因此这里额外乘一个「至少为 1」的提亮因子。
        spotLightBrightnessResponse(lightFixtureItem.type, brightnessRatio) *
          Math.max(1, brightnessRatio)) *
    brightnessScale;
  for (let spotIndex = 0; spotIndex < spotLightCount; spotIndex += 1) {
    const spotOffsetX =
      spotLightCount === 1
        ? 0
        : -lightFixtureItem.width * 0.47 +
          (lightFixtureItem.width * 0.94 * spotIndex) / (spotLightCount - 1);
    const spotLight = new threeModuleMin.SpotLight(
      fixtureColorHex,
      isFixtureOn ? spotBaseIntensity / spotLightCount : 0,
      spotRange,
      threeModuleMin.MathUtils.degToRad(spotAngleDeg / 2),
      0.86,
      2
    );
    spotLight.visible = isFixtureOn;
    spotLight.position.set(spotOffsetX, -0.025, 0);
    spotLight.castShadow = false;
    spotLight.layers.enable(PREVIEW_OBJECT_LAYER);
    if (shouldConfigureShadow) {
      const spotShadowSettings = localSpotShadowSettings(
        lightFixtureItem.type,
        spotRange,
        spotAngleDeg
      );
      const spotShadowMapSize = resolveShadowMapSize(spotShadowSettings.mapSize);
      spotLight.shadow.mapSize.set(spotShadowMapSize, spotShadowMapSize);
      spotLight.shadow.camera.near = clamp(spotRange * 0.05, 0.12, 0.24);
      spotLight.shadow.camera.far = spotRange;
      spotLight.shadow.camera.layers.set(PREVIEW_OBJECT_LAYER);
      spotLight.shadow.bias = -0.00005;
      spotLight.shadow.normalBias = spotShadowSettings.normalBias;
      spotLight.shadow.radius = spotShadowSettings.radius;
      spotLight.shadow.blurSamples = state.isHighShadowQuality
        ? Math.max(8, spotShadowSettings.blurSamples)
        : spotShadowSettings.blurSamples;
      spotLight.shadow.autoUpdate = false;
      spotLight.shadow.needsUpdate = needsShadowRefresh;
    }
    spotLight.userData.lightItemId = lightFixtureItem.id;
    spotLight.userData.lightGroupId = owningLightGroup?.id || "";
    spotLight.userData.lightFloorId = state.activeFloorId;
    spotLight.userData.lightType = lightFixtureItem.type;
    spotLight.userData.lightBrightness = finite(
      lightFixtureItem.lightBrightness,
      lightTypeDefaults.brightness
    );
    spotLight.userData.shadowCandidate = true;
    spotLight.userData.prewarmShadow = isStageViewerMode;
    spotLight.userData.lightOnIntensity = spotBaseIntensity / spotLightCount;
    if (isRegionLightingEnabled) {
      spotLight.userData.regionFullIntensity =
        (lightFixtureItem.type === "ceilinglight" ? 680 : 520) * brightnessScale;
      state.regionLightController?.register(spotLight, lightFixtureItem);
    }
    const spotTarget = new threeModuleMin.Object3D();
    spotTarget.position.set(
      spotOffsetX,
      -Math.max(finite(lightFixtureItem.elevation, 2.68), 0.8),
      0
    );
    fixtureParent.add(spotTarget);
    spotLight.target = spotTarget;
    fixtureParent.add(spotLight);
  }
}

/**
 * @returns {THREE.CanvasTexture|null} 海报贴图；无法创建画布时为 null。
 */
export function createTelevisionPosterTexture() {
  const posterCanvasElement = document.createElement("canvas");
  posterCanvasElement.width = 960;
  posterCanvasElement.height = 540;
  const posterContext = posterCanvasElement.getContext("2d");
  if (!posterContext) {
    return null;
  }
  drawTelevisionPoster(posterCanvasElement, posterContext);
  const posterTexture = new threeModuleMin.CanvasTexture(posterCanvasElement);
  posterTexture.colorSpace = threeModuleMin.SRGBColorSpace;
  posterTexture.anisotropy = Math.min(state.renderer?.capabilities?.getMaxAnisotropy?.() || 1, 8);
  posterTexture.needsUpdate = true;
  return posterTexture;
}

export function addTelevisionScreenMeshes(
  televisionParent: any,
  televisionScreenItem: any,
  tvScreenWidth: any,
  tvBodyDepth: any,
  tvTotalHeight: any
) {
  const { bodyHeight: bodyHeight, centerY: screenCenterY } = computeTelevisionBodyMetrics(
    televisionScreenItem,
    tvTotalHeight
  );
  const screenWidth = tvScreenWidth * 0.965;
  const screenHeight = bodyHeight * 0.94;
  const screenDepth = 0.012;
  // 屏幕前脸：贴机身前脸再往前 3mm，于是屏幕后 3mm 埋进机身、前 3mm 露在外面（贴平会闪烁）。
  const measuredBodyFrontZ = measureTelevisionBodyFrontZ(
    televisionParent,
    screenCenterY - bodyHeight * 0.5,
    screenCenterY + bodyHeight * 0.5
  );
  const screenOffsetZ =
    measuredBodyFrontZ === null
      ? Math.max(tvBodyDepth * 0.28, 0.05) * 0.5 + 0.006
      : measuredBodyFrontZ + 0.003;
  const screenCenterZ = screenOffsetZ - screenDepth * 0.5;
  if (televisionScreenItem.screenEnabled === false) {
    const screenOffMesh = addBoxMesh(
      televisionParent,
      screenWidth,
      screenHeight,
      screenDepth,
      0,
      screenCenterY,
      screenCenterZ,
      527122,
      {
        roughness: 0.18
      }
    );
    screenOffMesh.userData.televisionScreen = true;
    // 暖阳原木：熄灭的屏幕换成手工玻璃材质（暖色玻璃 + 微弱反光），
    if (studioPalette().warmWood) {
      const tvOffFrameMaterial = screenOffMesh.material;
      const warmTelevisionGlass = createWarmTelevisionGlass(threeModuleMin);
      screenOffMesh.material = [
        tvOffFrameMaterial,
        tvOffFrameMaterial,
        tvOffFrameMaterial,
        tvOffFrameMaterial,
        warmTelevisionGlass,
        tvOffFrameMaterial
      ];
    }
    // 屏幕玻璃的冷暖由材质决定，但 2D 画布的贴图渲染走的是 interaction3d 运行时，
    screenOffMesh.userData.sceneStyle = studioPalette().warmWood ? "warm-wood" : "default";
    if (isStageViewerMode) {
      screenOffMesh.userData.environmentEffect = true;
    }
    return;
  }
  const screenGlowMesh = new threeModuleMin.Mesh(
    new threeModuleMin.PlaneGeometry(screenWidth * 1.035, screenHeight * 1.08),
    new threeModuleMin.MeshBasicMaterial({
      color: 7253215,
      transparent: true,
      opacity: 0.09,
      depthTest: false,
      depthWrite: false,
      blending: threeModuleMin.AdditiveBlending,
      toneMapped: false,
      side: threeModuleMin.DoubleSide
    })
  );
  screenGlowMesh.userData.televisionGlow = true;
  if (isStageViewerMode) {
    screenGlowMesh.userData.environmentEffect = true;
  }
  screenGlowMesh.position.set(0, screenCenterY, screenOffsetZ - 0.014);
  screenGlowMesh.renderOrder = 6;
  screenGlowMesh.castShadow = false;
  screenGlowMesh.receiveShadow = false;
  televisionParent.add(screenGlowMesh);
  const tvPosterTexture = createTelevisionPosterTexture();
  const tvFrameMaterial = new threeModuleMin.MeshBasicMaterial({
    color: 527122,
    toneMapped: false
  });
  const tvScreenMaterial = new threeModuleMin.MeshBasicMaterial({
    color: tvPosterTexture ? 16777215 : 1519946,
    map: tvPosterTexture,
    toneMapped: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2
  });
  const tvScreenMesh = new threeModuleMin.Mesh(
    new threeModuleMin.BoxGeometry(screenWidth, screenHeight, screenDepth),
    [
      tvFrameMaterial,
      tvFrameMaterial,
      tvFrameMaterial,
      tvFrameMaterial,
      tvScreenMaterial,
      tvFrameMaterial
    ]
  );
  tvScreenMesh.userData.televisionScreen = true;
  // 亮屏时 2D 贴图由运行时按 userData.sceneStyle 选冷暖玻璃底色。
  tvScreenMesh.userData.sceneStyle = studioPalette().warmWood ? "warm-wood" : "default";
  if (isStageViewerMode) {
    tvScreenMesh.userData.environmentEffect = true;
  }
  tvScreenMesh.position.set(0, screenCenterY, screenCenterZ);
  tvScreenMesh.renderOrder = 7;
  tvScreenMesh.castShadow = false;
  tvScreenMesh.receiveShadow = false;
  televisionParent.add(tvScreenMesh);
}

export function buildMuralItemMeshGroup(
  group: any,
  item: any,
  itemWidth: any,
  itemDepth: any,
  itemHeight: any,
  frameColor: any,
  artColor: any
) {
  const frameDepth = Math.max(itemDepth, 0.04);
  const frameBand = Math.min(itemWidth, itemHeight) * 0.058;
  const artWidth = Math.max(itemWidth - frameBand * 1.9, itemWidth * 0.36);
  const artHeight = Math.max(itemHeight - frameBand * 1.9, itemHeight * 0.36);
  const wallZ = -frameDepth * 0.5;
  addBoxMesh(
    group,
    itemWidth,
    itemHeight,
    frameDepth * 0.66,
    0,
    itemHeight * 0.5,
    wallZ + frameDepth * 0.33,
    frameColor,
    {
      rounded: false,
      roughness: 0.62,
      metalness: 0.04
    }
  );
  addBoxMesh(
    group,
    artWidth,
    artHeight,
    frameDepth * 0.34,
    0,
    itemHeight * 0.5,
    wallZ + frameDepth * 0.5,
    artColor,
    {
      rounded: false,
      roughness: 0.94,
      metalness: 0
    }
  );
  const muralTexture = createMuralArtTexture(
    threeModuleMin,
    item.muralStyle,
    studioMaxTextureAnisotropy()
  );
  if (muralTexture) {
    const artworkMesh = new threeModuleMin.Mesh(
      new threeModuleMin.PlaneGeometry(artWidth, artHeight),
      new threeModuleMin.MeshStandardMaterial({
        map: muralTexture,
        roughness: 0.82,
        metalness: 0
      })
    );
    artworkMesh.position.set(0, itemHeight * 0.5, wallZ + frameDepth * 0.72);
    artworkMesh.castShadow = false;
    artworkMesh.receiveShadow = true;
    group.add(artworkMesh);
  }
  const frameProfile = {
    rounded: false,
    roughness: 0.4,
    metalness: 0.16
  };
  addBoxMesh(
    group,
    itemWidth,
    frameBand,
    frameDepth,
    0,
    frameBand * 0.5,
    0,
    frameColor,
    frameProfile
  );
  addBoxMesh(
    group,
    itemWidth,
    frameBand,
    frameDepth,
    0,
    itemHeight - frameBand * 0.5,
    0,
    frameColor,
    frameProfile
  );
  addBoxMesh(
    group,
    frameBand,
    itemHeight - frameBand * 2,
    frameDepth,
    -itemWidth * 0.5 + frameBand * 0.5,
    itemHeight * 0.5,
    0,
    frameColor,
    frameProfile
  );
  addBoxMesh(
    group,
    frameBand,
    itemHeight - frameBand * 2,
    frameDepth,
    itemWidth * 0.5 - frameBand * 0.5,
    itemHeight * 0.5,
    0,
    frameColor,
    frameProfile
  );
}

export function buildFeatureWallItemMeshGroup(group: any, item: any, itemWidth: any, itemDepth: any, itemHeight: any) {
  const wallStyle = normalizeFeatureWallStyle(item.wallStyle);
  const wallMaterial = (FEATURE_WALL_STYLE_MATERIAL as any)[wallStyle];
  const panelDepth = Math.max(itemDepth, 0.04);
  addBoxMesh(
    group,
    itemWidth,
    itemHeight,
    panelDepth,
    0,
    itemHeight * 0.5,
    -panelDepth * 0.5,
    wallMaterial.color,
    {
      rounded: false,
      roughness: wallMaterial.roughness,
      metalness: wallMaterial.metalness
    }
  );
  const panelTexture = createFeatureWallTexture(
    threeModuleMin,
    wallStyle,
    studioMaxTextureAnisotropy()
  );
  if (panelTexture) {
    const claddingMesh = new threeModuleMin.Mesh(
      new threeModuleMin.PlaneGeometry(itemWidth, itemHeight),
      new threeModuleMin.MeshStandardMaterial({
        map: panelTexture,
        roughness: wallMaterial.roughness,
        metalness: wallMaterial.metalness
      })
    );
    claddingMesh.position.set(0, itemHeight * 0.5, 0.0015);
    claddingMesh.castShadow = false;
    claddingMesh.receiveShadow = true;
    group.add(claddingMesh);
  }
  if (wallStyle === "slat") {
    const slatCount = Math.min(48, Math.max(4, Math.round(itemWidth / 0.1)));
    const slatPitch = itemWidth / slatCount;
    const slatWidth = slatPitch * 0.62;
    const slatDepth = Math.min(Math.max(panelDepth * 0.62, 0.02), 0.05);
    for (let slat = 0; slat < slatCount; slat += 1) {
      addBoxMesh(
        group,
        slatWidth,
        itemHeight,
        slatDepth,
        -itemWidth * 0.5 + slatPitch * (slat + 0.5),
        itemHeight * 0.5,
        slatDepth * 0.5 + 0.002,
        wallMaterial.color,
        {
          rounded: false,
          roughness: 0.7,
          metalness: 0.03
        }
      );
    }
  }
}

/**
 * 为非方形造型生成封闭无缝隙的立柱实体。结果与方盒采用同一套约定：
 */
export function buildPillarSolidGeometry(shape: any, width: any, depth: any, height: any) {
  const solidGeometry = new threeModuleMin.ExtrudeGeometry(
    buildPillarOutline(shape, width, depth),
    {
      depth: height,
      bevelEnabled: false,
      steps: 1,
      curveSegments: 1
    }
  );
  solidGeometry.rotateX(-Math.PI / 2);
  solidGeometry.translate(0, -height / 2, 0);
  solidGeometry.computeVertexNormals();
  return solidGeometry;
}

/**
 * 柱体占位几何的材质：选了「与柜同料」的档位时按角色配方造一份标准材质，与外部模型到位后用
 */
export function createStyledPillarMaterial(palette: any) {
  const pillarBodyRecipe = palette.materialRoles.body;
  const pillarMaterial = new threeModuleMin.MeshStandardMaterial({
    color: pillarBodyRecipe.color,
    roughness: Number.isFinite(pillarBodyRecipe.roughness) ? pillarBodyRecipe.roughness : 0.66,
    metalness: Number.isFinite(pillarBodyRecipe.metalness) ? pillarBodyRecipe.metalness : 0.02,
    side: threeModuleMin.FrontSide,
    transparent: false,
    opacity: 1,
    depthWrite: true,
    toneMapped: true
  });
  const pillarSurface = pillarBodyRecipe.surface;
  if (pillarSurface && hasMaterialSurfaceTexture(pillarSurface)) {
    const pillarSurfaceTexture = createMaterialSurfaceTexture(threeModuleMin, pillarSurface, {
      maxAnisotropy: studioMaxTextureAnisotropy(),
      // 平铺密度取配方里那一位，不写就是默认的 2 次（与外部模型那一路同一个默认值）。
      repeat: pillarBodyRecipe.repeat ?? 2
    });
    if (pillarSurfaceTexture) {
      pillarMaterial.map = pillarSurfaceTexture;
    }
  }
  if (palette.warmFurniture) {
    pillarMaterial.emissive = new threeModuleMin.Color(pillarBodyRecipe.color);
    pillarMaterial.emissiveIntensity = 0.065;
  }
  pillarMaterial.name = "pillar · HomeOS material style";
  return pillarMaterial;
}

export function buildPillarItemMeshGroup(group: any, item: any, itemWidth: any, itemDepth: any, itemHeight: any, palette: any) {
  const pillarWallOpacity = Math.min((palette.wallOpacity || 0) * 1.75, 0.55);
  const pillarBodyRecipe = palette?.materialRoles?.body ?? null;
  const pillarIsStyled = Number.isFinite(pillarBodyRecipe?.color);
  const pillarMaterial = pillarIsStyled
    ? createStyledPillarMaterial(palette)
    : makeWallSideMaterial(palette.wall, pillarWallOpacity, {
        depthWrite: false,
        depthFunc: threeModuleMin.LessDepth
      });
  const pillarShape = normalizePillarShape(item.pillarShape);
  const pillarGeometry =
    pillarShape === "square"
      ? new threeModuleMin.BoxGeometry(itemWidth, itemHeight, itemDepth)
      : buildPillarSolidGeometry(pillarShape, itemWidth, itemDepth, itemHeight);
  const pillarMesh = new threeModuleMin.Mesh(pillarGeometry, pillarMaterial);
  pillarMesh.position.y = itemHeight * 0.5;
  setWallGradientHeight(threeModuleMin, pillarMesh.geometry, "y", itemHeight * 0.5, 1, itemHeight);
  pillarMesh.castShadow = true;
  pillarMesh.receiveShadow = true;
  pillarMesh.renderOrder = 4;
  pillarMesh.userData.reflectionRole = "wall";
  pillarMesh.layers.set(PREVIEW_OBJECT_LAYER);
  group.add(pillarMesh);
}

/**
 * 出厂构建器需要的外部依赖：本模块私有的网格构造与收尾工具。
 */
export const ITEM_BUILDER_DEPS = {
  addBoxMesh,
  addChairModel,
  addCylinderMesh,
  addExternalItemModel,
  addLightFixtureToScene,
  addRugMeshes,
  addSecurityModel,
  addStripLightPreview,
  addTelevisionScreenMeshes,
  addTrackCurtain,
  addRollerCurtain,
  addVehicleChargingEffect,
  applyItemPosture,
  bakeMergedItemMeshes,
  buildCurtainGeometry,
  buildFeatureWallItemMeshGroup,
  buildMuralItemMeshGroup,
  buildPillarItemMeshGroup,
  buildPlanLabelMesh,
  clamp,
  computeTelevisionBodyMetrics,
  disposeSceneSubtree,
  highlightSelectedModel,
  isSelected,
  isStageViewerMode,
  shareGeometryAndMaterials,
  threeModuleMin,
  marbleTopTexture: getMarbleTableTopTexture,
  stoneSlabTexture: getStoneSlabTexture
};

/**
 * 石材板整图，按色号取：程序化几何（茶几的两块石板、餐桌台面）用它贴图，与外部模型走
 */
export const stoneSlabTextureByFlavor = new Map();

export function getStoneSlabTexture(flavor: any) {
  if (!stoneSlabTextureByFlavor.has(flavor)) {
    stoneSlabTextureByFlavor.set(
      flavor,
      createStoneSlabTexture(threeModuleMin, flavor, studioMaxTextureAnisotropy())
    );
  }
  return stoneSlabTextureByFlavor.get(flavor) ?? null;
}

export function getMarbleTableTopTexture() {
  return getStoneSlabTexture("marble");
}

/**
 * 把一个平面条目构建成三维模型组 —— 全工程「条目数据 → three.js 对象」的唯一入口。
 */
export function buildItemModel(itemSpec: any, prewarmLightIdSet: any = null) {
  const itemGroup = new threeModuleMin.Group();
  itemGroup.userData.squareEdges = SQUARE_EDGE_ITEM_TYPES.has(itemSpec.type);
  if (BATCH_OPTIMIZED_ITEM_TYPES.has(itemSpec.type)) {
    itemGroup.userData.optimizationBatch = "v1-next-ten";
  }
  // 家居类走暖阳家居色卡（默认风格也生效），建筑 / 结构件仍取场景色卡；
  const itemPalette = paletteForItemType(itemSpec.type, itemSpec.materialStyle);
  // 构建上下文 = 模块私有依赖 + 本次调用的入参与配色别名。
  const itemBuilderContext = {
    ...ITEM_BUILDER_DEPS,
    itemSpec,
    itemGroup,
    prewarmLightIdSet,
    itemWidth: itemSpec.width,
    itemDepth: itemSpec.depth,
    itemHeight: itemSpec.height,
    itemPalette,
    furnitureColor: itemPalette.furniture,
    applianceColor: itemPalette.appliance ?? itemPalette.furniture,
    furnitureSoftColor: itemPalette.furnitureSoft,
    furnitureLightColor: itemPalette.furnitureLight,
    furnitureDarkColor: itemPalette.furnitureDark
  };
  // 轨道帘那条支路自带收尾（构建完直接返回模型组），其余类型统一走 finishItemModel。
  if (buildItemBody(itemBuilderContext)) {
    return itemGroup;
  }
  finishItemModel(itemBuilderContext);
  return itemGroup;
}

export function batchRepeatedItemMeshes(instanceRoot: any, instanceItemEntries: any) {
  const descriptorsBySignature = new Map();
  for (const { item: instanceItemSpec, group: instanceItemGroup } of instanceItemEntries) {
    if (
      SELF_LIT_ITEM_TYPES.has(instanceItemSpec.type) ||
      (isStageViewerMode &&
        [
          "wallac",
          "floorac",
          "airoutlet",
          "airpurifier",
          "curtain",
          "freshair",
          "thermostat",
          "humidifier",
          "dehumidifier",
          "nas",
          "camera",
          "presence",
          "tv",
          "robotvacuum",
          "doorbell",
          "heater",
          "ceilingac",
          "ceilingfan",
          "vacuumcleaner",
          "floorwasher"
        ].includes(instanceItemSpec.type)) ||
      isSelected("item", instanceItemSpec.id)
    ) {
      continue;
    }
    const itemMeshDescriptors = collectMeshDescriptors(instanceItemGroup);
    if (!itemMeshDescriptors) {
      continue;
    }
    const instanceSignature = JSON.stringify([
      instanceItemSpec.type,
      itemMeshDescriptors.map((descriptor: any) => descriptor.signature)
    ]);
    if (!descriptorsBySignature.has(instanceSignature)) {
      descriptorsBySignature.set(instanceSignature, []);
    }
    descriptorsBySignature.get(instanceSignature).push({
      item: instanceItemSpec,
      group: instanceItemGroup,
      descriptors: itemMeshDescriptors
    });
  }
  instanceRoot.updateMatrixWorld(true);
  const instanceRootInverse = instanceRoot.matrixWorld.clone().invert();
  const instanceBatchStats = [];
  for (const batchEntries of descriptorsBySignature.values()) {
    if (batchEntries.length < 2) {
      continue;
    }
    const descriptorCount = batchEntries[0].descriptors.length;
    for (let descriptorIndex = 0; descriptorIndex < descriptorCount; descriptorIndex += 1) {
      const sourceMesh = batchEntries[0].descriptors[descriptorIndex].mesh;
      const batchedMaterial = sourceMesh.userData.externalModelSharedMaterial
        ? sourceMesh.material
        : sourceMesh.material.clone();
      const instancedMesh = new threeModuleMin.InstancedMesh(
        sourceMesh.geometry,
        batchedMaterial,
        batchEntries.length
      );
      instancedMesh.name =
        "homeos-instance-" + batchEntries[0].item.type + "-" + (descriptorIndex + 1);
      instancedMesh.castShadow = sourceMesh.castShadow;
      instancedMesh.receiveShadow = sourceMesh.receiveShadow;
      instancedMesh.renderOrder = sourceMesh.renderOrder;
      instancedMesh.instanceMatrix.setUsage(threeModuleMin.StaticDrawUsage);
      instancedMesh.userData.externalModelSharedGeometry = true;
      instancedMesh.userData.externalModelSharedTextures = true;
      instancedMesh.userData.externalModelSharedMaterial =
        sourceMesh.userData.externalModelSharedMaterial === true;
      instancedMesh.userData.modelLayer = "items";
      instancedMesh.userData.exportRole = "plan";
      instancedMesh.userData.instanceItemType = batchEntries[0].item.type;
      instancedMesh.userData.instanceItemIds = batchEntries.map(
        ({ item: instanceItemEntry }: any) => instanceItemEntry.id
      );
      batchEntries.forEach(({ descriptors: batchDescriptors }: any, instanceIndex: any) => {
        const instanceMatrix = new threeModuleMin.Matrix4().multiplyMatrices(
          instanceRootInverse,
          batchDescriptors[descriptorIndex].mesh.matrixWorld
        );
        instancedMesh.setMatrixAt(instanceIndex, instanceMatrix);
      });
      instancedMesh.instanceMatrix.needsUpdate = true;
      instancedMesh.computeBoundingBox();
      instancedMesh.computeBoundingSphere();
      instanceRoot.add(instancedMesh);
    }
    for (const { group: batchedSourceGroup } of batchEntries) {
      instanceRoot.remove(batchedSourceGroup);
      disposeSceneSubtree(batchedSourceGroup);
    }
    instanceBatchStats.push({
      type: batchEntries[0].item.type,
      instances: batchEntries.length,
      before: batchEntries.length * descriptorCount,
      after: descriptorCount
    });
  }
  instanceRoot.userData.instanceBatchStats = instanceBatchStats;
  if (state.renderer?.domElement) {
    state.renderer.domElement.dataset.instanceBatchCount = String(instanceBatchStats.length);
    state.renderer.domElement.dataset.instanceCount = String(
      instanceBatchStats.reduce(
        (totalInstances, instanceBatchStat) => totalInstances + instanceBatchStat.instances,
        0
      )
    );
    state.renderer.domElement.dataset.instanceDrawCallsSaved = String(
      instanceBatchStats.reduce(
        (totalReduction, geometryBatchStat) =>
          totalReduction + geometryBatchStat.before - geometryBatchStat.after,
        0
      )
    );
  }
  return instanceBatchStats;
}

export function mergeStaticItemMeshes(staticBatchRoot: any, staticItemEntries: any) {
  const meshGroupsBySignature = new Map();
  const collectBatchableAttributes = (attributeSourceMesh: any) => {
    const attributeNames = Object.keys(attributeSourceMesh.geometry.attributes)
      .filter(
        filteredAttributeName =>
          filteredAttributeName !== "color" || attributeSourceMesh.material.vertexColors
      )
      .sort();
    if (
      !isStageViewerMode ||
      Object.values(attributeSourceMesh.material).some(
        (inspectedMaterialValue: any) => inspectedMaterialValue?.isTexture
      )
    ) {
      return attributeNames;
    } else {
      return attributeNames.filter(
        supportedAttributeName =>
          supportedAttributeName === "position" ||
          supportedAttributeName === "normal" ||
          (supportedAttributeName === "color" && attributeSourceMesh.material.vertexColors)
      );
    }
  };
  staticBatchRoot.updateMatrixWorld(true);
  for (const { item: staticItemSpec, group: staticItemGroup } of staticItemEntries) {
    if (
      staticItemGroup.parent === staticBatchRoot &&
      !SELF_LIT_ITEM_TYPES.has(staticItemSpec.type) &&
      (!isStageViewerMode ||
        ![
          "wallac",
          "floorac",
          "airoutlet",
          "airpurifier",
          "curtain",
          "freshair",
          "thermostat",
          "humidifier",
          "dehumidifier",
          "nas",
          "camera",
          "presence",
          "tv",
          "robotvacuum",
          "doorbell",
          "heater",
          "ceilingac",
          "ceilingfan",
          "vacuumcleaner",
          "floorwasher"
        ].includes(staticItemSpec.type)) &&
      !isSelected("item", staticItemSpec.id)
    ) {
      staticItemGroup.traverse((batchedSourceMesh: any) => {
        if (
          !batchedSourceMesh.isMesh ||
          batchedSourceMesh.isInstancedMesh ||
          batchedSourceMesh.geometry.drawRange.start !== 0 ||
          batchedSourceMesh.geometry.drawRange.count !== Infinity
        ) {
          return;
        }
        for (
          let ancestorObject = batchedSourceMesh;
          ancestorObject && ancestorObject !== staticBatchRoot;
          ancestorObject = ancestorObject.parent
        ) {
          if (!ancestorObject.visible) {
            return;
          }
        }
        const needsVertexColors = isStageViewerMode && !batchedSourceMesh.material?.vertexColors;
        const batchedMaterialSignature = computeMaterialSignature(
          batchedSourceMesh,
          isStageViewerMode,
          needsVertexColors
        );
        if (!batchedMaterialSignature || batchedSourceMesh.matrixWorld.determinant() < 0) {
          return;
        }
        const geometryAttributes = collectBatchableAttributes(batchedSourceMesh).map(
          keptAttributeName => [
            keptAttributeName,
            batchedSourceMesh.geometry.attributes[keptAttributeName].itemSize
          ]
        );
        if (needsVertexColors) {
          geometryAttributes.push(["color", 3]);
        }
        const batchedGeometrySignature = isStageViewerMode
          ? JSON.stringify(geometryAttributes)
          : computeGeometrySignature(batchedSourceMesh);
        const meshSignature =
          batchedMaterialSignature + ":" + batchedGeometrySignature + ":" + needsVertexColors;
        if (!meshGroupsBySignature.has(meshSignature)) {
          meshGroupsBySignature.set(meshSignature, []);
        }
        meshGroupsBySignature.get(meshSignature).push(batchedSourceMesh);
      });
    }
  }
  const staticBatchRootInverse = staticBatchRoot.matrixWorld.clone().invert();
  const staticBatchStats = [];
  const mergedMaterials = new Set<any>();
  for (const meshGroup of meshGroupsBySignature.values()) {
    if (meshGroup.length < 2) {
      continue;
    }
    const clonedGeometries = meshGroup.map((mergedSourceMesh: any) => {
      const mergeRelativeMatrix = new threeModuleMin.Matrix4().multiplyMatrices(
        staticBatchRootInverse,
        mergedSourceMesh.matrixWorld
      );
      const clonedGeometry = mergedSourceMesh.geometry.clone();
      if (isStageViewerMode) {
        const keptAttributes = collectBatchableAttributes(mergedSourceMesh);
        for (const existingAttributeName of Object.keys(clonedGeometry.attributes)) {
          if (!keptAttributes.includes(existingAttributeName)) {
            clonedGeometry.deleteAttribute(existingAttributeName);
          }
        }
        for (const sourceAttributeName of keptAttributes) {
          const sourceAttribute = mergedSourceMesh.geometry.attributes[sourceAttributeName];
          if (
            !sourceAttribute.isInterleavedBufferAttribute &&
            !sourceAttribute.normalized &&
            sourceAttribute.array instanceof Float32Array
          ) {
            continue;
          }
          const attributeValues = new Float32Array(
            sourceAttribute.count * sourceAttribute.itemSize
          );
          const vectorComponentGetters = ["getX", "getY", "getZ", "getW"];
          for (
            let attributeVertexIndex = 0;
            attributeVertexIndex < sourceAttribute.count;
            attributeVertexIndex++
          ) {
            for (
              let componentIndex = 0;
              componentIndex < sourceAttribute.itemSize;
              componentIndex++
            ) {
              attributeValues[attributeVertexIndex * sourceAttribute.itemSize + componentIndex] =
                componentIndex < 4
                  ? sourceAttribute[vectorComponentGetters[componentIndex]](attributeVertexIndex)
                  : sourceAttribute.getComponent(attributeVertexIndex, componentIndex);
            }
          }
          clonedGeometry.setAttribute(
            sourceAttributeName,
            new threeModuleMin.BufferAttribute(attributeValues, sourceAttribute.itemSize)
          );
        }
        if (!mergedSourceMesh.material.vertexColors) {
          const vertexCount = clonedGeometry.attributes.position.count;
          const vertexColorValues = new Float32Array(vertexCount * 3);
          const materialColor = mergedSourceMesh.material.color;
          for (let colorVertexIndex = 0; colorVertexIndex < vertexCount; colorVertexIndex++) {
            vertexColorValues[colorVertexIndex * 3] = materialColor.r;
            vertexColorValues[colorVertexIndex * 3 + 1] = materialColor.g;
            vertexColorValues[colorVertexIndex * 3 + 2] = materialColor.b;
          }
          clonedGeometry.setAttribute(
            "color",
            new threeModuleMin.BufferAttribute(vertexColorValues, 3)
          );
        }
        if (!clonedGeometry.index) {
          const indexCount = clonedGeometry.attributes.position.count;
          const indexArray =
            indexCount <= 65536 ? new Uint16Array(indexCount) : new Uint32Array(indexCount);
          for (let vertexIndexCounter = 0; vertexIndexCounter < indexCount; vertexIndexCounter++) {
            indexArray[vertexIndexCounter] = vertexIndexCounter;
          }
          clonedGeometry.setIndex(new threeModuleMin.BufferAttribute(indexArray, 1));
        }
      }
      return clonedGeometry.applyMatrix4(mergeRelativeMatrix);
    });
    const staticMergedGeometry = mergeGeometries(clonedGeometries);
    clonedGeometries.forEach((disposedGeometry: any) => disposedGeometry.dispose());
    if (!staticMergedGeometry) {
      continue;
    }
    const sampleMesh = meshGroup[0];
    const needsClonedMaterial = isStageViewerMode && !sampleMesh.material.vertexColors;
    const batchMaterial = needsClonedMaterial ? sampleMesh.material.clone() : sampleMesh.material;
    if (needsClonedMaterial) {
      batchMaterial.color.setRGB(1, 1, 1);
      batchMaterial.vertexColors = true;
    }
    const mergedMesh = new threeModuleMin.Mesh(staticMergedGeometry, batchMaterial);
    mergedMesh.castShadow = sampleMesh.castShadow;
    mergedMesh.receiveShadow = sampleMesh.receiveShadow;
    mergedMesh.renderOrder = sampleMesh.renderOrder;
    mergedMesh.layers.mask = sampleMesh.layers.mask;
    mergedMesh.userData.externalModelSharedTextures =
      sampleMesh.userData.externalModelSharedTextures === true;
    mergedMesh.userData.externalModelSharedMaterial =
      !needsClonedMaterial && sampleMesh.userData.externalModelSharedMaterial === true;
    mergedMesh.userData.reflectionSimplifiable = isStageViewerMode;
    mergedMesh.userData.modelLayer = "items";
    mergedMesh.userData.exportRole = "plan";
    for (const batchedStaticMesh of meshGroup) {
      batchedStaticMesh.parent?.remove(batchedStaticMesh);
      if (!batchedStaticMesh.userData.externalModelSharedGeometry) {
        batchedStaticMesh.geometry.dispose();
      }
      if (!batchedStaticMesh.userData.externalModelSharedMaterial) {
        mergedMaterials.add(batchedStaticMesh.material);
      }
    }
    staticBatchRoot.add(mergedMesh);
    staticBatchStats.push({
      before: meshGroup.length,
      after: 1
    });
  }
  for (const { group: emptiedItemGroup } of staticItemEntries) {
    if (
      emptiedItemGroup.parent === staticBatchRoot &&
      collectMeshDescendants(emptiedItemGroup).length === 0
    ) {
      staticBatchRoot.remove(emptiedItemGroup);
    }
  }
  const liveMaterials = new Set();
  staticBatchRoot.traverse((liveMaterialNode: any) => {
    for (const liveNodeMaterial of Array.isArray(liveMaterialNode.material)
      ? liveMaterialNode.material
      : liveMaterialNode.material
        ? [liveMaterialNode.material]
        : []) {
      liveMaterials.add(liveNodeMaterial);
    }
  });
  for (const disposedMaterial of mergedMaterials) {
    if (!liveMaterials.has(disposedMaterial)) {
      disposedMaterial.dispose?.();
    }
  }
  staticBatchRoot.userData.staticItemBatchStats = staticBatchStats;
  if (state.renderer?.domElement) {
    state.renderer.domElement.dataset.staticItemBatchCount = String(staticBatchStats.length);
    state.renderer.domElement.dataset.staticItemDrawCallsSaved = String(
      staticBatchStats.reduce(
        (totalRemoved, staticBatchStat) =>
          totalRemoved + staticBatchStat.before - staticBatchStat.after,
        0
      )
    );
  }
  return staticBatchStats;
}

/**
 * 收集外部模型里「尚未预编译过」的共享材质。外部模型为省内存会复用同一份几何与材质，这里只挑出带
 */
export function collectExternalModelSignatures() {
  const materialSignatures = new Set();
  state.previewModelRoot?.traverse((externalModelNode: any) => {
    if (!externalModelNode.isMesh || !externalModelNode.userData.externalModelSharedGeometry) {
      return;
    }
    const nodeMaterialList = Array.isArray(externalModelNode.material)
      ? externalModelNode.material
      : externalModelNode.material
        ? [externalModelNode.material]
        : [];
    for (const uncompiledMaterial of nodeMaterialList) {
      if (uncompiledMaterial && !precompiledModelSignatures.has(uncompiledMaterial)) {
        materialSignatures.add(uncompiledMaterial);
      }
    }
  });
  return [...materialSignatures];
}

export function publishExternalMaterialStats() {
  if (!state.renderer?.domElement) {
    return;
  }
  const materialLoadState = externalModelManager.modelLoadState();
  state.renderer.domElement.dataset.externalSharedMaterialCount = String(materialLoadState.materials);
  state.renderer.domElement.dataset.externalMaterialReuseCount = String(materialLoadState.materialReuses);
  state.renderer.domElement.dataset.externalPrecompilePassCount = String(state.externalPrecompilePassCount);
  state.renderer.domElement.dataset.lightPrecompilePassCount = String(state.lightPrecompilePassCount);
}

export function lightConfigurationSignature(countedLights: any) {
  let spotLightTotal = 0;
  let rectAreaLightCount = 0;
  let pointLightCount = 0;
  let otherLightCount = 0;
  for (const classifiedLight of countedLights) {
    if (classifiedLight.isSpotLight) {
      spotLightTotal += 1;
    } else if (classifiedLight.isRectAreaLight) {
      rectAreaLightCount += 1;
    } else if (classifiedLight.isPointLight) {
      pointLightCount += 1;
    } else {
      otherLightCount += 1;
    }
  }
  return spotLightTotal + ":" + rectAreaLightCount + ":" + pointLightCount + ":" + otherLightCount;
}

export function buildLightPrecompilePlan() {
  if (!state.previewModelRoot) {
    return [];
  }
  const visibleLights: any = [];
  const lightsByGroupId = new Map();
  state.previewModelRoot.traverse((traversedLight: any) => {
    if (
      !traversedLight.isLight ||
      !traversedLight.userData?.lightItemId ||
      (!isStageViewerMode && finite(traversedLight.userData.lightOnIntensity, 0) <= 0)
    ) {
      return;
    }
    if (traversedLight.visible !== false) {
      visibleLights.push(traversedLight);
    }
    const owningLightGroupId = String(traversedLight.userData.lightGroupId || "");
    if (owningLightGroupId) {
      if (!lightsByGroupId.has(owningLightGroupId)) {
        lightsByGroupId.set(owningLightGroupId, []);
      }
      lightsByGroupId.get(owningLightGroupId).push(traversedLight);
    }
  });
  const groupedLights = [...lightsByGroupId.values()].flat();
  const seenLightSignatures = new Set();
  const builtPrecompilePlan: any = [];
  const currentLightSignature = lightConfigurationSignature(visibleLights);
  const lightPrecompileCacheKey = state.previewModelRoot.uuid + ":" + state.externalPrecompilePassCount;
  if (state.appliedLightPrecompileSignature !== lightPrecompileCacheKey) {
    state.appliedLightPrecompileSignature = lightPrecompileCacheKey;
    precompiledLightSignatures.clear();
  }
  const addPrecompileChanges = (signatureLights: any, reportedLightChanges: any, forceEntry = false) => {
    const lightSignature = lightConfigurationSignature(signatureLights);
    if (!seenLightSignatures.has(lightSignature)) {
      seenLightSignatures.add(lightSignature);
      if (!precompiledLightSignatures.has(lightSignature)) {
        if (
          !!forceEntry ||
          lightSignature === currentLightSignature ||
          !(
            precompiledLightSignatures.size + builtPrecompilePlan.length >=
            MAX_PRECOMPILE_PLAN_COUNT
          )
        ) {
          builtPrecompilePlan.push({
            signature: lightSignature,
            lights: reportedLightChanges
              .filter((visibleChange: any) => visibleChange.visible)
              .map((visibleChangeEntry: any) => visibleChangeEntry.light),
            changes: reportedLightChanges
          });
        }
      }
    }
  };
  addPrecompileChanges(visibleLights, [], true);
  addPrecompileChanges(
    [],
    groupedLights.map(groupedLight => ({
      light: groupedLight,
      visible: false
    })),
    true
  );
  for (const groupLights of lightsByGroupId.values()) {
    const hiddenGroupLights = groupLights.filter((hiddenLight: any) => hiddenLight.visible === false);
    if (hiddenGroupLights.length) {
      addPrecompileChanges(
        [...visibleLights, ...hiddenGroupLights],
        hiddenGroupLights.map((hiddenLightEntry: any) => ({
          light: hiddenLightEntry,
          visible: true
        }))
      );
    }
    const visibleGroupLights = groupLights.filter((visibleLight: any) => visibleLight.visible !== false);
    if (visibleGroupLights.length) {
      addPrecompileChanges(
        visibleLights.filter((keptVisibleLight: any) => !visibleGroupLights.includes(keptVisibleLight)),
        visibleGroupLights.map((visibleLightEntry: any) => ({
          light: visibleLightEntry,
          visible: false
        }))
      );
    }
  }
  if (isStageViewerMode) {
    addPrecompileChanges(
      groupedLights,
      groupedLights.map(allLightEntry => ({
        light: allLightEntry,
        visible: true
      })),
      true
    );
  }
  return builtPrecompilePlan;
}

/**
 * 判断此刻是否应当暂停灯光预编译。页面正在卸载或标签页不可见时暂停；舞台（viewer）模式下还要求帧循环可用且渲染缓存
 * @returns {boolean} true 表示应暂停 / 推迟预编译。
 */
export function isLightPrecompilePending() {
  return (
    state.isPageUnloading ||
    document.hidden ||
    (isStageViewerMode && (!state.isFrameLoopAvailable || renderCache?.closed))
  );
}

/**
 * 判断是否处于「正在动相机 / 正在过渡灯光」的高干扰期。相机手势、导出渲染、灯光缓存重建、外部模型预编译、灯光明暗过渡
 * @returns {boolean} true 表示此刻不宜做预编译。
 */
export function isCameraGestureActive() {
  return (
    state.exportRenderState ||
    state.isCameraMotionActive ||
    state.isExportRendering ||
    state.isLightCacheBuilding ||
    state.isExternalPrecompileRunning ||
    (isStageViewerMode && (state.isMotionRendering || state.lightTransitionSession)) ||
    (!isStageViewerMode && isAdaptiveLightCacheEnabled())
  );
}

export function scheduleLightPrecompile(precompileDelayMs = 360) {
  if (!isRegionLightingEnabled && !isAutoDiagramEmbed && !state.isPageUnloading) {
    state.shouldRerunLightPrecompile = true;
    window.clearTimeout(state.lightPrecompileTimer);
    if (!state.isLightPrecompileRunning && !isLightPrecompilePending()) {
      state.lightPrecompileTimer = window.setTimeout(async () => {
        state.lightPrecompileTimer = null;
        if (isLightPrecompilePending()) {
          return;
        }
        const precompileModelLoadState = externalModelManager.modelLoadState();
        if (
          !state.renderer ||
          !state.previewOverlayScene ||
          !state.previewCamera ||
          !state.previewModelRoot ||
          isCameraGestureActive() ||
          state.areExternalModelsDeferred ||
          state.deferredModelTimer ||
          precompileModelLoadState.active > 0 ||
          precompileModelLoadState.queued > 0
        ) {
          scheduleLightPrecompile(240);
          return;
        }
        const pendingPrecompilePlan = buildLightPrecompilePlan();
        const capturedRoot = state.previewModelRoot;
        const capturedOverlayScene = state.previewOverlayScene;
        const capturedRenderer = state.renderer;
        if (!pendingPrecompilePlan.length) {
          state.shouldRerunLightPrecompile = false;
          capturedRenderer.domElement.dataset.lightPrecompileState = "ready";
          publishExternalMaterialStats();
          return;
        }
        state.isLightPrecompileRunning = true;
        state.shouldRerunLightPrecompile = false;
        capturedRenderer.domElement.dataset.lightPrecompileState = "working";
        capturedRenderer.domElement.dataset.lightPrecompilePlanCount = String(
          pendingPrecompilePlan.length
        );
        /**
         * @returns {boolean} true 表示可以继续应用当前计划。
         */
        const isPlanStillCurrent = () =>
          state.previewModelRoot === capturedRoot &&
          state.previewOverlayScene === capturedOverlayScene &&
          state.renderer === capturedRenderer &&
          !state.shouldRerunLightPrecompile &&
          !isLightPrecompilePending() &&
          !isCameraGestureActive();
        let shouldApplyPlan = true;
        try {
          for (const planEntry of pendingPrecompilePlan) {
            await yieldToIdle();
            if (!isPlanStillCurrent()) {
              shouldApplyPlan = false;
              state.shouldRerunLightPrecompile = true;
              break;
            }
            const appliedLightChanges = planEntry.changes.map(
              ({ light: changedLight, visible: nextVisible }: any) => ({
                light: changedLight,
                nextVisible: nextVisible,
                visible: changedLight.visible,
                intensity: changedLight.intensity
              })
            );
            let compilePromise = null;
            try {
              for (const hiddenChange of appliedLightChanges) {
                hiddenChange.light.intensity = 0;
                hiddenChange.light.visible = hiddenChange.nextVisible;
              }
              applyShadowBudget(capturedRoot, {
                rebuildAtlas: false
              });
              compilePromise = waitForShaderCompilation(
                capturedRenderer,
                capturedOverlayScene,
                state.previewCamera,
                isPlanStillCurrent
              );
            } finally {
              for (const restoredChange of appliedLightChanges) {
                restoredChange.light.visible = restoredChange.visible;
                restoredChange.light.intensity = restoredChange.intensity;
              }
              applyShadowBudget(capturedRoot, {
                rebuildAtlas: false
              });
            }
            if (!(await compilePromise) || !isPlanStillCurrent()) {
              shouldApplyPlan = false;
              capturedRenderer.domElement.dataset.lightPrecompileDeferred = "true";
              state.shouldRerunLightPrecompile ||= !isPlanStillCurrent();
              break;
            }
            state.lightPrecompilePassCount += 1;
            precompiledLightSignatures.add(planEntry.signature);
          }
          if (shouldApplyPlan) {
            delete capturedRenderer.domElement.dataset.lightPrecompileDeferred;
            capturedRenderer.domElement.dataset.lightPrecompileState = "ready";
          } else {
            capturedRenderer.domElement.dataset.lightPrecompileState = "deferred";
          }
        } catch (precompileError) {
          capturedRenderer.domElement.dataset.lightPrecompileState = "fallback";
          // 预编译只是优化，跳过不是故障；状态已经写在 dataset 上，控制台这份只在 ?debug=1 时出现。
          debugLog("debug", "3D first-light precompile skipped", precompileError);
        } finally {
          state.isLightPrecompileRunning = false;
          publishExternalMaterialStats();
          if (state.shouldRerunLightPrecompile) {
            scheduleLightPrecompile(240);
          }
        }
      }, precompileDelayMs);
    }
  }
}

export function scheduleModelPrecompile(modelPrecompileDelayMs = 0) {
  if (!isRegionLightingEnabled) {
    state.shouldRerunExternalPrecompile = true;
    window.clearTimeout(state.externalPrecompileTimer);
    if (!state.isExternalPrecompileRunning) {
      state.externalPrecompileTimer = window.setTimeout(async () => {
        state.externalPrecompileTimer = null;
        if (
          !state.renderer ||
          !state.previewOverlayScene ||
          !state.previewCamera ||
          !state.previewModelRoot ||
          state.exportRenderState ||
          document.hidden ||
          state.isCameraMotionActive ||
          state.isExportRendering ||
          state.isLightCacheBuilding
        ) {
          scheduleModelPrecompile(240);
          return;
        }
        const modelSignatures = collectExternalModelSignatures();
        if (!modelSignatures.length) {
          state.shouldRerunExternalPrecompile = false;
          publishExternalMaterialStats();
          scheduleLightPrecompile();
          return;
        }
        state.isExternalPrecompileRunning = true;
        state.shouldRerunExternalPrecompile = false;
        state.renderer.domElement.dataset.externalPrecompileState = "working";
        try {
          applyShadowBudget(state.previewModelRoot, {
            rebuildAtlas: false
          });
          state.renderer.compile(state.previewOverlayScene, state.previewCamera);
          modelSignatures.forEach(modelSignature => precompiledModelSignatures.add(modelSignature as any));
          state.externalPrecompilePassCount += 1;
          state.renderer.domElement.dataset.externalPrecompileState = "ready";
        } catch (modelPrecompileError) {
          state.renderer.domElement.dataset.externalPrecompileState = "fallback";
          // 与首帧预编译同理：跳过只是落到 fallback，控制台这份只在 ?debug=1 时出现。
          debugLog("debug", "3D model precompile skipped", modelPrecompileError);
        } finally {
          state.isExternalPrecompileRunning = false;
          publishExternalMaterialStats();
          if (state.shouldRerunExternalPrecompile) {
            scheduleModelPrecompile(120);
          } else {
            scheduleLightPrecompile();
          }
        }
      }, modelPrecompileDelayMs);
    }
  }
}

export function applySceneRefresh(refreshOptions: any = {}) {
  const isRefreshForced = refreshOptions.force === true;
  const normalizedScope = ["items", "lights", "architecture"].includes(refreshOptions.scope)
    ? refreshOptions.scope
    : "all";
  if (!isLivePreviewEnabled() && !isRefreshForced) {
    if (refreshOptions.transient !== true) {
      state.isPreviewDirty = true;
    }
    syncPreviewControls();
    return;
  }
  if (isRefreshForced) {
    state.isForcedSceneUpdate = true;
    pendingSceneUpdateScopes.add("all");
  } else {
    pendingSceneUpdateScopes.add(normalizedScope);
  }
  if (refreshOptions.precompile === true) {
    state.shouldPrecompileExternalModels = true;
  }
  if (refreshOptions.preserveLightCache !== true) {
    state.shouldInvalidateLightCache = true;
  }
  if (!state.isSceneUpdateQueued) {
    state.isSceneUpdateQueued = true;
    requestAnimationFrame(() => {
      state.isSceneUpdateQueued = false;
      if (state.isExportRendering && !state.isForcedSceneUpdate) {
        return;
      }
      const shouldRefreshNow = isLivePreviewEnabled() || state.isForcedSceneUpdate;
      state.isForcedSceneUpdate = false;
      if (!shouldRefreshNow) {
        state.isPreviewDirty = true;
        syncPreviewControls();
        return;
      }
      const pendingScopes = new Set(pendingSceneUpdateScopes);
      pendingSceneUpdateScopes.clear();
      const shouldPreserveLightCache = !state.shouldInvalidateLightCache;
      state.shouldInvalidateLightCache = false;
      if (pendingScopes.has("all") || !state.activeScene.walls.length) {
        refreshPreviewScene({
          preserveLightCache: shouldPreserveLightCache
        });
      } else {
        refreshSceneScopes(pendingScopes, {
          preserveLightCache: shouldPreserveLightCache
        });
      }
      const shouldPrecompileModels = state.shouldPrecompileExternalModels;
      state.shouldPrecompileExternalModels = false;
      publishExternalMaterialStats();
      if (shouldPrecompileModels || collectExternalModelSignatures().length) {
        scheduleModelPrecompile();
      }
      state.isPreviewDirty = false;
      syncPreviewControls();
    });
  }
}

export function addFloorEdgeOutline(edgeLoop: any, outlineColor: any, edgeSurfaceY: any) {
  const outlineGeometries = [];
  const capGeometries = [];
  for (let edgeLoopIndex = 0; edgeLoopIndex < edgeLoop.length; edgeLoopIndex += 1) {
    const edgeStartPoint = edgeLoop[edgeLoopIndex];
    const edgeEndPoint = edgeLoop[(edgeLoopIndex + 1) % edgeLoop.length];
    const edgeDeltaX = edgeEndPoint.x - edgeStartPoint.x;
    const edgeDeltaZ = edgeEndPoint.z - edgeStartPoint.z;
    const edgeLength = Math.hypot(edgeDeltaX, edgeDeltaZ);
    if (edgeLength <= 0.001) {
      continue;
    }
    /**
     * 这条边中点在 X 轴上的坐标，用来把描边条平移到边的正中。
     * @type {number}
     */
    const edgeCenterX = (edgeStartPoint.x + edgeEndPoint.x) / 2;
    /**
     * 同一条边中点在 Z 轴上的坐标（平面 y 轴对应世界 z 轴）。
     * @type {number}
     */
    const centerZ = (edgeStartPoint.z + edgeEndPoint.z) / 2;
    const edgeRotation = -Math.atan2(edgeDeltaZ, edgeDeltaX);
    const outlineMatrix = new threeModuleMin.Matrix4().compose(
      new threeModuleMin.Vector3(edgeCenterX, edgeSurfaceY + 0.021, centerZ),
      new threeModuleMin.Quaternion().setFromAxisAngle(
        new threeModuleMin.Vector3(0, 1, 0),
        edgeRotation
      ),
      new threeModuleMin.Vector3(1, 1, 1)
    );
    const capMatrix = new threeModuleMin.Matrix4().compose(
      new threeModuleMin.Vector3(edgeCenterX, edgeSurfaceY + 0.026, centerZ),
      new threeModuleMin.Quaternion().setFromAxisAngle(
        new threeModuleMin.Vector3(0, 1, 0),
        edgeRotation
      ),
      new threeModuleMin.Vector3(1, 1, 1)
    );
    outlineGeometries.push(
      new threeModuleMin.BoxGeometry(edgeLength, 0.042, 0.038).applyMatrix4(outlineMatrix)
    );
    capGeometries.push(
      new threeModuleMin.BoxGeometry(edgeLength + 0.025, 0.066, 0.078).applyMatrix4(capMatrix)
    );
  }
  const outlineGeometry = outlineGeometries.length ? mergeGeometries(outlineGeometries) : null;
  const capGeometry = capGeometries.length ? mergeGeometries(capGeometries) : null;
  outlineGeometries.forEach(outlinePartGeometry => outlinePartGeometry.dispose());
  capGeometries.forEach(capPartGeometry => capPartGeometry.dispose());
  if (outlineGeometry) {
    const outlineMesh = new threeModuleMin.Mesh(
      outlineGeometry,
      new threeModuleMin.MeshBasicMaterial({
        color: outlineColor,
        transparent: true,
        opacity: 0.82,
        toneMapped: false
      })
    );
    outlineMesh.renderOrder = 3;
    outlineMesh.userData.exportRole = "outline";
    outlineMesh.userData.batchedFloorEdgeCount = edgeLoop.length;
    state.previewModelRoot.add(outlineMesh);
  }
  if (capGeometry) {
    const capMesh = new threeModuleMin.Mesh(
      capGeometry,
      new threeModuleMin.MeshBasicMaterial({
        color: outlineColor,
        transparent: true,
        opacity: 0.09,
        depthWrite: false,
        blending: threeModuleMin.AdditiveBlending,
        toneMapped: false
      })
    );
    capMesh.renderOrder = 2;
    capMesh.userData.exportRole = "outline";
    capMesh.userData.batchedFloorEdgeCount = edgeLoop.length;
    state.previewModelRoot.add(capMesh);
  }
}

export function addFloorGrid(gridSize: any, gridPalette: any, gridHeightY: any) {
  const gridDivisions = Math.max(Math.round(gridSize / 1.25), 12);
  const gridHelper = new threeModuleMin.GridHelper(
    gridSize,
    gridDivisions,
    gridPalette.grid,
    gridPalette.grid
  );
  const gridWorldPosition = new threeModuleMin.Vector3();
  gridHelper.material.transparent = true;
  gridHelper.material.opacity = 0.24;
  gridHelper.material.depthWrite = false;
  gridHelper.material.toneMapped = false;
  gridHelper.material.onBeforeCompile = (shader: any) => {
    shader.uniforms.gridFadeNear = {
      value: gridSize * 0.18
    };
    shader.uniforms.gridFadeFar = {
      value: gridSize * 0.46
    };
    shader.uniforms.gridDepthFadeNear = {
      value: gridSize * 0.18
    };
    shader.uniforms.gridDepthFadeFar = {
      value: gridSize * 0.36
    };
    shader.vertexShader = shader.vertexShader
      .replace(
        "#include <common>",
        "#include <common>\nvarying vec2 vGridLocalPosition;\nvarying float vGridViewDepth;"
      )
      .replace(
        "#include <project_vertex>",
        "#include <project_vertex>\nvGridLocalPosition = position.xz;\nvGridViewDepth = max(-mvPosition.z, 0.0);"
      );
    shader.fragmentShader = shader.fragmentShader
      .replace(
        "#include <common>",
        "#include <common>\nuniform float gridFadeNear;\nuniform float gridFadeFar;\nuniform float gridDepthFadeNear;\nuniform float gridDepthFadeFar;\nvarying vec2 vGridLocalPosition;\nvarying float vGridViewDepth;"
      )
      .replace(
        "vec4 diffuseColor = vec4( diffuse, opacity );",
        "vec4 diffuseColor = vec4( diffuse, opacity );\nfloat radialFade = 1.0 - smoothstep(gridFadeNear, gridFadeFar, length(vGridLocalPosition));\nfloat depthFade = 1.0 - smoothstep(gridDepthFadeNear, gridDepthFadeFar, vGridViewDepth);\ndiffuseColor.a *= radialFade * mix(0.28, 1.0, depthFade);"
      );
    gridHelper.material.userData.depthFadeShader = shader;
  };
  gridHelper.onBeforeRender = (shaderMaterial: any, renderedScene: any, activeCamera: any) => {
    const depthFadeShader = gridHelper.material.userData.depthFadeShader;
    if (!depthFadeShader) {
      return;
    }
    gridHelper.getWorldPosition(gridWorldPosition);
    const gridCameraDistance = Math.max(
      activeCamera.position.distanceTo(state.orbitControls?.target || gridWorldPosition),
      1
    );
    const viewHeight = activeCamera.isOrthographicCamera
      ? Math.abs(activeCamera.top - activeCamera.bottom) / Math.max(activeCamera.zoom, 0.001)
      : gridCameraDistance *
        2 *
        Math.tan(threeModuleMin.MathUtils.degToRad(activeCamera.fov * 0.5));
    const viewDiagonal = Math.max(
      Math.hypot(viewHeight * Math.max(activeCamera.aspect, 0.1), viewHeight),
      2
    );
    const fadeNearDistance = gridCameraDistance + viewDiagonal * 0.2;
    depthFadeShader.uniforms.gridDepthFadeNear.value = fadeNearDistance;
    depthFadeShader.uniforms.gridDepthFadeFar.value = Math.max(
      fadeNearDistance + 1,
      gridCameraDistance + viewDiagonal * 0.85
    );
  };
  gridHelper.position.y = gridHeightY + 0.012;
  gridHelper.renderOrder = 2;
  gridHelper.userData.exportRole = "grid";
  state.previewModelRoot.add(gridHelper);
}

export function addFloorGroundShadow(groundShadowPolygon: any, groundShadowSurfaceY: any, holes: any = []) {
  if (!Array.isArray(groundShadowPolygon) || groundShadowPolygon.length < 3) {
    return;
  }
  const shadowPlanarPoints = groundShadowPolygon.map(shadowPolygonPoint => ({
    x: shadowPolygonPoint.x,
    y: shadowPolygonPoint.z
  }));
  [
    {
      spread: 0.035,
      offsetX: 0.13,
      offsetY: -0.1,
      opacity: 0.12
    },
    {
      spread: 0.13,
      offsetX: 0.18,
      offsetY: -0.14,
      opacity: 0.055
    },
    {
      spread: 0.3,
      offsetX: 0.24,
      offsetY: -0.19,
      opacity: 0.018
    }
  ].forEach((layerSpec, layerIndex) => {
    const shadowOffsetPoints = offsetPolygonOutward(shadowPlanarPoints, layerSpec.spread).map(
      (shadowOffsetPoint: any) => ({
        x: shadowOffsetPoint.x + layerSpec.offsetX,
        y: shadowOffsetPoint.y + layerSpec.offsetY
      })
    );
    const groundShadowShape = holes.length
      ? buildPolygonShapes(subtractPolygonLoops([shadowOffsetPoints], holes))
      : polygonLoopToPath(threeModuleMin.Shape, shadowOffsetPoints);
    const groundShadowMesh = new threeModuleMin.Mesh(
      new threeModuleMin.ShapeGeometry(groundShadowShape, 1),
      new threeModuleMin.MeshBasicMaterial({
        color: 329482,
        transparent: true,
        opacity: layerSpec.opacity,
        depthWrite: false,
        toneMapped: false,
        side: threeModuleMin.DoubleSide,
        forceSinglePass: isStageViewerMode
      })
    );
    groundShadowMesh.rotation.x = Math.PI / 2;
    groundShadowMesh.position.y = groundShadowSurfaceY + 0.001 + layerIndex * 0.00015;
    groundShadowMesh.userData.floorPlanGroundShadow = true;
    groundShadowMesh.renderOrder = 1 + layerIndex;
    state.previewModelRoot.add(groundShadowMesh);
  });
}

export function rebuildPreviewScene({ preserveLightCache: rebuildPreserveLightCache = false } = {}) {
  // 场景重建时清掉几何/材质复用池，避免跨文档无限增长。
  for (const cachedGeometry of mergedWallBandGeometryCache.values()) {
    cachedGeometry.dispose?.();
  }
  mergedWallBandGeometryCache.clear();
  materialByRenderKey.clear();
  for (const rugEntry of rugGeometryBySizeKey.values()) {
    rugEntry.geometry?.dispose?.();
  }
  rugGeometryBySizeKey.clear();
  rugMaterialByColorKey.clear();
  state.contactShadowController?.invalidate();
  if (isRegionLightingEnabled && state.previewModelRoot) {
    state.previewModelRoot.userData.regionFloorId = state.activeFloorId;
  }
  if (!state.previewModelRoot) {
    return;
  }
  applyBaseLighting();
  clearPreviewModel();
  invalidateRender({
    shadows: true,
    scene: true,
    preserveLightCache: rebuildPreserveLightCache
  });
  const scenePixelsPerMeter = currentPixelsPerMeter();
  if (!scenePixelsPerMeter) {
    return;
  }
  const scenePalette = studioPalette();
  const sceneFloorBounds = computeFloorBounds();
  const sceneFocusX = state.floorFocusPoint?.x ?? (sceneFloorBounds.minX + sceneFloorBounds.maxX) / 2;
  const sceneFocusY = state.floorFocusPoint?.y ?? (sceneFloorBounds.minY + sceneFloorBounds.maxY) / 2;
  /**
   * @returns {{x: number, z: number}} 世界坐标（米）。
   */
  const toWorldPoint = (worldInputPoint: any) => ({
    x: (worldInputPoint.x - sceneFocusX) / scenePixelsPerMeter,
    z: (worldInputPoint.y - sceneFocusY) / scenePixelsPerMeter
  });
  const floorWidthUnits = Math.max(sceneFloorBounds.width / scenePixelsPerMeter + 1, 3);
  const floorDepthUnits = Math.max(sceneFloorBounds.height / scenePixelsPerMeter + 1, 3);
  const sceneSurfaceY = -0.008;
  const floorSlabDepth = 0.16;
  const floorTopY = sceneSurfaceY - floorSlabDepth;
  const sceneGridY = floorTopY - 0.035;
  const groundPlaneSize = Math.max(Math.max(floorWidthUnits, floorDepthUnits) * 16, 260);
  const backgroundMesh = new threeModuleMin.Mesh(
    new threeModuleMin.PlaneGeometry(groundPlaneSize, groundPlaneSize),
    new threeModuleMin.MeshBasicMaterial({
      color: scenePalette.ground,
      toneMapped: false
    })
  );
  backgroundMesh.rotation.x = -Math.PI / 2;
  backgroundMesh.position.y = sceneGridY;
  backgroundMesh.receiveShadow = false;
  backgroundMesh.userData.exportRole = "background";
  state.previewModelRoot.add(backgroundMesh);
  addFloorGrid(groundPlaneSize, scenePalette, sceneGridY);
  const floorMaterial = new threeModuleMin.MeshStandardMaterial({
    color: scenePalette.floor,
    roughness: 0.96,
    metalness: 0,
    emissive: scenePalette.floor,
    emissiveIntensity: 0.025
  });
  // 暖阳原木：往地面材质里注入「浅色橡木地板 + 板缝 + 木纹」的着色器补丁，
  decorateWarmFloor(floorMaterial, scenePalette);
  const floorPolygons = floorPolygonsForWalls(scenePixelsPerMeter);
  const floorOpeningItems = state.activeScene.items
    .filter((candidateItem: any) => candidateItem.type === "flooropening")
    .map((openingItem: any) =>
      floorOpeningPolygon(openingItem, scenePixelsPerMeter).map(polygonPlanPoint => {
        const openingWorldPoint = toWorldPoint(polygonPlanPoint);
        return {
          x: openingWorldPoint.x,
          y: openingWorldPoint.z
        };
      })
    );
  /**
   * 给一块地面轮廓补上接地阴影，以及按设置开启的轮廓线。只做叠加装饰，不生成楼板本体；有下沉洞口的场景由调用方按每块
   */
  const addFloorSurfaceMeshes = (surfacePolygons: any) => {
    addFloorGroundShadow(surfacePolygons, sceneGridY);
    if (state.activeScene.settings.floorEdgeVisible !== false) {
      addFloorEdgeOutline(surfacePolygons, scenePalette.floorEdge, floorTopY);
    }
  };
  const addFloorSlab = (slabPolygons: any, slabGeometry: any, rotateToVertical: any) => {
    const floorMesh = new threeModuleMin.Mesh(slabGeometry, floorMaterial);
    floorMesh.rotation.x = rotateToVertical ? Math.PI / 2 : 0;
    floorMesh.position.y = rotateToVertical ? sceneSurfaceY : sceneSurfaceY - floorSlabDepth / 2;
    floorMesh.castShadow = false;
    floorMesh.receiveShadow = true;
    floorMesh.userData.exportRole = "plan";
    floorMesh.userData.regionReceiverKind = "floor";
    floorMesh.userData.regionFloorId = state.activeFloorId;
    state.previewModelRoot.add(floorMesh);
    if (!floorOpeningItems.length) {
      addFloorSurfaceMeshes(slabPolygons);
    }
  };
  if (floorOpeningItems.length) {
    const worldFloorLoops = floorPolygons.length
      ? floorPolygons.map((worldFloorPolygon: any) =>
          worldFloorPolygon.map((floorPolygonPoint: any) => {
            const polygonWorldPoint = toWorldPoint(floorPolygonPoint);
            return {
              x: polygonWorldPoint.x,
              y: polygonWorldPoint.z
            };
          })
        )
      : [
          [
            {
              x: -floorWidthUnits / 2,
              y: -floorDepthUnits / 2
            },
            {
              x: floorWidthUnits / 2,
              y: -floorDepthUnits / 2
            },
            {
              x: floorWidthUnits / 2,
              y: floorDepthUnits / 2
            },
            {
              x: -floorWidthUnits / 2,
              y: floorDepthUnits / 2
            }
          ]
        ];
    const floorLoopsWithoutOpenings = subtractPolygonLoops(worldFloorLoops, floorOpeningItems);
    const floorShapes = buildPolygonShapes(floorLoopsWithoutOpenings);
    if (floorShapes.length) {
      addFloorSlab(
        [],
        new threeModuleMin.ExtrudeGeometry(floorShapes, {
          depth: floorSlabDepth,
          bevelEnabled: false,
          steps: 1
        }),
        true
      );
    } else {
      floorMaterial.dispose();
    }
    for (const positivePolygon of floorLoopsWithoutOpenings.filter(
      keptPolygon => polygonArea(keptPolygon) > 0
    )) {
      const outlineLoop = positivePolygon.map((outlinePoint: any) => ({
        x: outlinePoint.x,
        z: outlinePoint.y
      }));
      addFloorGroundShadow(outlineLoop, sceneGridY, floorOpeningItems);
      if (state.activeScene.settings.floorEdgeVisible !== false) {
        addFloorEdgeOutline(outlineLoop, scenePalette.floorEdge, floorTopY);
      }
    }
  } else if (floorPolygons.length) {
    const worldFloorPolygons = floorPolygons.map((floorPolygon: any) => floorPolygon.map(toWorldPoint));
    const outlineShapes = worldFloorPolygons.map((outline: any) => {
      const outlineShape = new threeModuleMin.Shape();
      outline.forEach((shapePoint: any, shapePointIndex: any) => {
        if (shapePointIndex === 0) {
          outlineShape.moveTo(shapePoint.x, shapePoint.z);
        } else {
          outlineShape.lineTo(shapePoint.x, shapePoint.z);
        }
      });
      outlineShape.closePath();
      return outlineShape;
    });
    addFloorSlab(
      worldFloorPolygons[0],
      new threeModuleMin.ExtrudeGeometry(outlineShapes, {
        depth: floorSlabDepth,
        bevelEnabled: false,
        steps: 1
      }),
      true
    );
    for (const outlinePolygon of worldFloorPolygons.slice(1)) {
      addFloorSurfaceMeshes(outlinePolygon);
    }
  } else {
    const groundSlabPolygons = [
      {
        x: -floorWidthUnits / 2,
        z: -floorDepthUnits / 2
      },
      {
        x: floorWidthUnits / 2,
        z: -floorDepthUnits / 2
      },
      {
        x: floorWidthUnits / 2,
        z: floorDepthUnits / 2
      },
      {
        x: -floorWidthUnits / 2,
        z: floorDepthUnits / 2
      }
    ];
    addFloorSlab(
      groundSlabPolygons,
      new threeModuleMin.BoxGeometry(floorWidthUnits, floorSlabDepth, floorDepthUnits),
      false
    );
  }
  buildArchitectureLayer({
    ppm: scenePixelsPerMeter,
    toWorld: toWorldPoint,
    floorSurfaceY: sceneSurfaceY
  });
  const sceneShadowLightIds = collectShadowCastingLightIds();
  const placedItemEntries = [];
  for (const placedItemSpec of state.activeScene.items) {
    const placedPlanPoint = toWorldPoint(placedItemSpec);
    if (placedItemSpec.type === "flooropening") {
      continue;
    }
    const placedItemModel = buildItemModel(placedItemSpec, sceneShadowLightIds);
    if (isRegionLightingEnabled && placedItemSpec.type === "smallcar") {
      placedItemModel.userData.preserveDetailedSurface = true;
    }
    if (
      isStageViewerMode &&
      [
        "wallac",
        "floorac",
        "airoutlet",
        "airpurifier",
        "curtain",
        "freshair",
        "thermostat",
        "humidifier",
        "dehumidifier",
        "nas",
        "camera",
        "presence",
        "tv",
        "robotvacuum",
        "doorbell",
        "heater",
        "ceilingac",
        "ceilingfan",
        "vacuumcleaner",
        "floorwasher"
      ].includes(placedItemSpec.type)
    ) {
      placedItemModel.userData.environmentModelId = placedItemSpec.id;
      placedItemModel.userData.environmentModelType = placedItemSpec.type;
      placedItemModel.userData.environmentFloorId = state.activeFloorId;
    }
    placedItemModel.position.set(
      placedPlanPoint.x,
      placedItemSpec.elevation || 0,
      placedPlanPoint.z
    );
    applyItemOrientation(placedItemModel, placedItemSpec);
    placedItemModel.userData.modelLayer = LIGHT_ITEM_TYPES.has(placedItemSpec.type)
      ? "lights"
      : "items";
    placedItemModel.userData.exportRole = placedItemSpec.type === "planlabel" ? "label" : "plan";
    state.previewModelRoot.add(placedItemModel);
    if (!LIGHT_ITEM_TYPES.has(placedItemSpec.type)) {
      placedItemEntries.push({
        item: placedItemSpec,
        group: placedItemModel
      });
    }
  }
  batchRepeatedItemMeshes(state.previewModelRoot, placedItemEntries);
  mergeStaticItemMeshes(state.previewModelRoot, placedItemEntries);
  state.previewModelRoot.traverse((untaggedNode: any) => {
    if (untaggedNode !== state.previewModelRoot && !untaggedNode.userData.exportRole) {
      untaggedNode.userData.exportRole = "plan";
    }
  });
  applyShadowBudget(state.previewModelRoot, {
    rebuildAtlas: !rebuildPreserveLightCache
  });
  if (isStageViewerMode) {
    cacheObjectTransforms(state.previewModelRoot, threeModuleMin.Object3D);
  }
}

export function refreshPreviewScene({ preserveLightCache: refreshPreserveLightCache = false } = {}) {
  if (!state.previewModelRoot) {
    return;
  }
  if (currentPreviewFloorMode() !== "all") {
    rebuildPreviewScene({
      preserveLightCache: refreshPreserveLightCache
    });
    fitDirectionalShadowCamera();
    return;
  }
  const refreshRootSnapshot = state.previewModelRoot;
  const refreshSceneSnapshot = state.activeScene;
  const refreshFloorIdSnapshot = state.activeFloorId;
  const refreshFocusSnapshot = state.floorFocusPoint;
  applyBaseLighting();
  clearPreviewModel();
  invalidateRender({
    shadows: true,
    scene: true,
    preserveLightCache: refreshPreserveLightCache
  });
  const refreshSortedFloors = [...state.studioDocument.floors].sort(
    (sortedFloorA, sortedFloorB) => sortedFloorA.elevation - sortedFloorB.elevation
  );
  const verticalFloorGap = state.exportRenderState
    ? finite(state.studioDocument.exportFloorGap, 3)
    : finite(state.studioDocument.previewFloorGap, 3);
  refreshSortedFloors.forEach((stackedFloor, iteratedFloorIndex) => {
    const createdFloorGroup = new threeModuleMin.Group();
    createdFloorGroup.name = "floor-" + stackedFloor.id;
    createdFloorGroup.userData.floorId = stackedFloor.id;
    state.previewModelRoot = createdFloorGroup;
    state.activeScene = stackedFloor.scene;
    state.activeFloorId = stackedFloor.id;
    state.floorFocusPoint = {
      x: finite(stackedFloor.originX, 0),
      y: finite(stackedFloor.originY, 0)
    };
    rebuildPreviewScene({
      preserveLightCache: refreshPreserveLightCache
    });
    if (iteratedFloorIndex > 0) {
      for (const staleFloorChild of [...createdFloorGroup.children]) {
        if (["background", "grid"].includes(staleFloorChild.userData?.exportRole)) {
          if (isStageViewerMode) {
            staleFloorChild.userData.floorBackgroundHidden = true;
            staleFloorChild.visible = false;
            continue;
          }
          createdFloorGroup.remove(staleFloorChild);
          disposeSceneSubtree(staleFloorChild);
        }
      }
    }
    createdFloorGroup.position.set(
      finite(stackedFloor.offsetX, 0),
      iteratedFloorIndex * verticalFloorGap,
      finite(stackedFloor.offsetZ, 0)
    );
    createdFloorGroup.rotation.y = -threeModuleMin.MathUtils.degToRad(
      finite(stackedFloor.rotation, 0)
    );
    refreshRootSnapshot.add(createdFloorGroup);
  });
  state.previewModelRoot = refreshRootSnapshot;
  state.activeScene = refreshSceneSnapshot;
  state.activeFloorId = refreshFloorIdSnapshot;
  state.floorFocusPoint = refreshFocusSnapshot;
  applyShadowBudget(state.previewModelRoot, {
    rebuildAtlas: !refreshPreserveLightCache
  });
  fitDirectionalShadowCamera();
  invalidateRender({
    shadows: true,
    scene: true,
    preserveLightCache: refreshPreserveLightCache
  });
}

/**
 * 组装当前楼层的平面上下文，供局部重建（家具层 / 灯光层 / 建筑层）复用。返回的四件事就是建几何所需的全部坐标系信息：
 */
export function computeFloorPlanContext() {
  const planContextPixelsPerMeter = currentPixelsPerMeter();
  if (!planContextPixelsPerMeter) {
    return null;
  }
  const planFloorBounds = computeFloorBounds();
  const planFocusX = state.floorFocusPoint?.x ?? (planFloorBounds.minX + planFloorBounds.maxX) / 2;
  const planFocusY = state.floorFocusPoint?.y ?? (planFloorBounds.minY + planFloorBounds.maxY) / 2;
  return {
    ppm: planContextPixelsPerMeter,
    floorSurfaceY: -0.008,
    floorPolygons: floorPolygonsForWalls(planContextPixelsPerMeter),
    toWorld: (floorPlanPoint: any) => ({
      x: (floorPlanPoint.x - planFocusX) / planContextPixelsPerMeter,
      z: (floorPlanPoint.y - planFocusY) / planContextPixelsPerMeter
    })
  };
}

/**
 * 按图层名删除模型根下的一整层节点，并释放其几何 / 纹理。
 * @param {string} removedLayerName 图层名（模型节点的 userData.modelLayer）。
 */
export function removeModelLayer(removedLayerName: any) {
  if (state.previewModelRoot) {
    for (const layerChild of [...state.previewModelRoot.children]) {
      if (layerChild.userData.modelLayer === removedLayerName) {
        state.previewModelRoot.remove(layerChild);
        disposeSceneSubtree(layerChild);
      }
    }
  }
}

export function rebuildModelLayer(
  rebuiltLayerName: any,
  {
    preserveLightCache: layerPreserveLightCache = false,
    shadowRoot: layerShadowRoot = state.previewModelRoot
  } = {}
) {
  if (!state.previewModelRoot) {
    return;
  }
  const layerFloorPlanContext = computeFloorPlanContext();
  if (!layerFloorPlanContext) {
    return;
  }
  removeModelLayer(rebuiltLayerName);
  const isLightsLayer = rebuiltLayerName === "lights";
  const layerShadowLightIds = isLightsLayer ? collectShadowCastingLightIds() : null;
  const layeredItemEntries = [];
  for (const layerItemSpec of state.activeScene.items) {
    if (LIGHT_ITEM_TYPES.has(layerItemSpec.type) !== isLightsLayer) {
      continue;
    }
    const layerPlanPoint = layerFloorPlanContext.toWorld(layerItemSpec);
    if (layerItemSpec.type === "flooropening") {
      continue;
    }
    const layerItemModel = buildItemModel(layerItemSpec, layerShadowLightIds);
    if (isRegionLightingEnabled && layerItemSpec.type === "smallcar") {
      layerItemModel.userData.preserveDetailedSurface = true;
    }
    if (
      isStageViewerMode &&
      [
        "wallac",
        "floorac",
        "airoutlet",
        "airpurifier",
        "curtain",
        "freshair",
        "thermostat",
        "humidifier",
        "dehumidifier",
        "nas",
        "camera",
        "presence",
        "tv",
        "robotvacuum",
        "doorbell",
        "heater",
        "ceilingac",
        "ceilingfan",
        "vacuumcleaner",
        "floorwasher"
      ].includes(layerItemSpec.type)
    ) {
      layerItemModel.userData.environmentModelId = layerItemSpec.id;
      layerItemModel.userData.environmentModelType = layerItemSpec.type;
      layerItemModel.userData.environmentFloorId = state.activeFloorId;
    }
    layerItemModel.position.set(layerPlanPoint.x, layerItemSpec.elevation || 0, layerPlanPoint.z);
    applyItemOrientation(layerItemModel, layerItemSpec);
    layerItemModel.userData.modelLayer = rebuiltLayerName;
    state.previewModelRoot.add(layerItemModel);
    if (!isLightsLayer) {
      layeredItemEntries.push({
        item: layerItemSpec,
        group: layerItemModel
      });
    }
  }
  if (!isLightsLayer) {
    batchRepeatedItemMeshes(state.previewModelRoot, layeredItemEntries);
    mergeStaticItemMeshes(state.previewModelRoot, layeredItemEntries);
  }
  applyShadowBudget(layerShadowRoot, {
    rebuildAtlas: !layerPreserveLightCache
  });
  if (isStageViewerMode) {
    cacheObjectTransforms(state.previewModelRoot, threeModuleMin.Object3D);
  }
  if (isLightsLayer) {
    applyRenderQualityMode();
  }
  invalidateRender({
    shadows: !isLightsLayer && !layerPreserveLightCache,
    preserveLightCache: layerPreserveLightCache
  });
}

export function rebuildArchitectureRoot({
  preserveLightCache: architecturePreserveLightCache = false,
  shadowRoot: architectureShadowRoot = state.previewModelRoot
} = {}) {
  const architectureFloorPlanContext = computeFloorPlanContext();
  if (!!state.previewModelRoot && !!architectureFloorPlanContext) {
    removeModelLayer("architecture");
    buildArchitectureLayer(architectureFloorPlanContext);
    if (!architecturePreserveLightCache) {
      state.contactShadowController?.invalidate();
    }
    applyShadowBudget(architectureShadowRoot, {
      rebuildAtlas: !architecturePreserveLightCache
    });
    invalidateRender({
      shadows: !architecturePreserveLightCache,
      scene: true,
      preserveLightCache: architecturePreserveLightCache
    });
  }
}

/**
 * 刷新家具层的薄封装（保持调用点语义清晰）。
 * @param {object} [itemLayerOptions={}] 透传给 rebuildModelLayer 的选项。
 */
export function refreshItemsLayer(itemLayerOptions: any = {}) {
  rebuildModelLayer("items", itemLayerOptions);
}

/**
 * 刷新灯光层的薄封装（保持调用点语义清晰）。
 * @param {object} [lightLayerOptions={}] 透传给 rebuildModelLayer 的选项。
 */
export function refreshLightsLayer(lightLayerOptions: any = {}) {
  rebuildModelLayer("lights", lightLayerOptions);
}

export function refreshSceneScopes(requestedScopes: any, scopeRefreshOptions: any) {
  const scopeRootSnapshot = state.previewModelRoot;
  const scopeFocusSnapshot = state.floorFocusPoint;
  if (currentPreviewFloorMode() === "all") {
    const activeFloorRecord = state.studioDocument.floors.find(
      (matchedFloorRecord: any) => matchedFloorRecord.id === state.activeFloorId
    );
    const activeFloorGroup = scopeRootSnapshot?.children.find(
      (foundFloorGroup: any) => foundFloorGroup.userData?.floorId === state.activeFloorId
    );
    if (!activeFloorRecord || !activeFloorGroup) {
      refreshPreviewScene(scopeRefreshOptions);
      return;
    }
    state.previewModelRoot = activeFloorGroup;
    state.floorFocusPoint = {
      x: finite(activeFloorRecord.originX, 0),
      y: finite(activeFloorRecord.originY, 0)
    };
  }
  try {
    const layerRefreshOptions = {
      ...scopeRefreshOptions,
      shadowRoot: scopeRootSnapshot
    };
    if (requestedScopes.has("architecture")) {
      rebuildArchitectureRoot(layerRefreshOptions);
    }
    if (requestedScopes.has("items")) {
      refreshItemsLayer(layerRefreshOptions);
    }
    if (requestedScopes.has("lights")) {
      refreshLightsLayer(layerRefreshOptions);
    }
  } finally {
    state.previewModelRoot = scopeRootSnapshot;
    state.floorFocusPoint = scopeFocusSnapshot;
  }
}

/**
 * @returns {boolean} true 表示该对象属于被排除的图层。
 */
export function isObjectInExcludedLayer(traversedObject: any, layerFilter: any) {
  for (
    let ancestor = traversedObject;
    ancestor && ancestor !== state.previewModelRoot;
    ancestor = ancestor.parent
  ) {
    if (layerFilter.has(ancestor.userData?.modelLayer)) {
      return true;
    }
  }
  return false;
}

export function computeSceneBoundingBox({ excludeModelLayers: boundingExcludedLayers = null }: any = {}) {
  const boundingBox = new threeModuleMin.Box3();
  state.previewModelRoot.updateWorldMatrix(true, true);
  state.previewModelRoot.traverse((measuredNode: any) => {
    if (
      !!measuredNode.isMesh &&
      !["background", "grid", "light-source-preview"].includes(measuredNode.userData?.exportRole) &&
      (!boundingExcludedLayers || !isObjectInExcludedLayer(measuredNode, boundingExcludedLayers))
    ) {
      if (measuredNode.isInstancedMesh) {
        measuredNode.computeBoundingBox();
        if (measuredNode.boundingBox) {
          boundingBox.union(
            measuredNode.boundingBox.clone().applyMatrix4(measuredNode.matrixWorld)
          );
        }
        return;
      }
      measuredNode.geometry.computeBoundingBox();
      if (measuredNode.geometry.boundingBox) {
        boundingBox.union(
          measuredNode.geometry.boundingBox.clone().applyMatrix4(measuredNode.matrixWorld)
        );
      }
    }
  });
  return boundingBox;
}

export function fitDirectionalShadowCamera() {
  if (!state.isHighShadowQuality || !state.mainDirectionalLight?.shadow?.camera || !state.previewModelRoot) {
    return false;
  }
  const shadowSceneBounds = computeSceneBoundingBox();
  if (shadowSceneBounds.isEmpty()) {
    return false;
  }
  state.previewModelRoot.updateWorldMatrix(true, true);
  state.mainDirectionalLight.updateWorldMatrix(true, false);
  state.mainDirectionalLight.target.updateWorldMatrix(true, false);
  const shadowCamera = state.mainDirectionalLight.shadow.camera;
  const lightPosition = new threeModuleMin.Vector3().setFromMatrixPosition(
    state.mainDirectionalLight.matrixWorld
  );
  const lightTarget = new threeModuleMin.Vector3().setFromMatrixPosition(
    state.mainDirectionalLight.target.matrixWorld
  );
  shadowCamera.position.copy(lightPosition);
  shadowCamera.lookAt(lightTarget);
  shadowCamera.updateMatrixWorld(true);
  const boundsMin = new threeModuleMin.Vector3(Infinity, Infinity, Infinity);
  const boundsMax = new threeModuleMin.Vector3(-Infinity, -Infinity, -Infinity);
  for (const cornerX of [shadowSceneBounds.min.x, shadowSceneBounds.max.x]) {
    for (const cornerY of [shadowSceneBounds.min.y, shadowSceneBounds.max.y]) {
      for (const cornerZ of [shadowSceneBounds.min.z, shadowSceneBounds.max.z]) {
        const boundsCorner = new threeModuleMin.Vector3(cornerX, cornerY, cornerZ).applyMatrix4(
          shadowCamera.matrixWorldInverse
        );
        boundsMin.min(boundsCorner);
        boundsMax.max(boundsCorner);
      }
    }
  }
  const horizontalSpan = Math.max(boundsMax.x - boundsMin.x, boundsMax.y - boundsMin.y, 1);
  const cameraMargin = Math.max(MIN_SHADOW_CAMERA_MARGIN, horizontalSpan * 0.05);
  const nearDistance = -boundsMax.z;
  const farDistance = -boundsMin.z;
  const depthMargin = Math.max(MIN_SHADOW_CAMERA_MARGIN, (farDistance - nearDistance) * 0.08);
  shadowCamera.left = boundsMin.x - cameraMargin;
  shadowCamera.right = boundsMax.x + cameraMargin;
  shadowCamera.bottom = boundsMin.y - cameraMargin;
  shadowCamera.top = boundsMax.y + cameraMargin;
  shadowCamera.near = Math.max(0.1, nearDistance - depthMargin);
  shadowCamera.far = Math.max(shadowCamera.near + 1, farDistance + depthMargin);
  shadowCamera.updateProjectionMatrix();
  state.mainDirectionalLight.shadow.needsUpdate = true;
  return true;
}
