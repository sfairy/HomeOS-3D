import { COURTYARD_MODELS, courtyardPalette } from "../plan/courtyard-models";
import {
  prepareVehicleChargeGeometry,
  prepareSuvRoofGlass,
  applyVehicleFinish,
} from "../authoring/items/studio-vehicle-models";
import { decorateWarmFloor } from "../authoring/scene/studio-scene-style";
import { pipelineDispenserModelType } from "../authoring/items/pipeline-dispenser";
import { storageSectionModelType } from "../authoring/items/studio-storage-sections";
import { enlargeWarmLeaves } from "../materials/studio-warm-foliage";
import {
  applyCarFinish,
  smoothCarSurfaceNormals,
} from "../materials/studio-car-finish";
import {
  repairGlassCabinetBack,
  repairWallCabinetSides,
  repairSideboardJoints,
  repairSideboardGlassDoor,
} from "../materials/studio-cabinet-back";
import { finite } from "./studio-normalization";
import { createModelPersistentCache } from "../cache/model-persistent-cache";
import { modelTemplateKey, captureModelTemplateBounds } from "../cache/model-template-codec";
import { modelPlacementBounds } from "./model-placement-bounds";
import {
  messageOfPreviewError,
  reportPreviewIssue,
  statusOfPreviewError,
} from "./preview-diagnostics";
import { prepareModelTextures } from "../cache/model-texture-cache";
import { releaseModelAsset } from "./model-asset-loader";
import { DECOR_MODELS, DECOR_THEMES } from "../authoring/items/decor-models";
import {
  isStoneSlabFlavor,
  isStructuralModelFamily,
  materialRoleRecipeFor,
  materialRoleRecipeForRole,
  resolveModelFamily,
  resolveModelMaterialRole,
  stoneSlabFlavorForMaterial,
  stoneSlabSurfaceFinish,
  usesNamedMaterialRole,
} from "../materials/studio-model-material-roles";
import { groupVehicleMaterialSlots } from "../materials/studio-material-slot-groups";
import { hasSemanticSlotRoles } from "../materials/model-slot-roles";
import { canonicalExternalMaterialName, legacyExternalMaterialName } from "../materials/legacy-material-aliases";
import { usesDetailMaterialPipeline as sharedUsesDetailMaterialPipeline } from "../materials/material-pipeline";
import { createStoneSlabTexture } from "../materials/studio-surface-textures";
import { ensureSceneBoxUvs } from "../materials/studio-box-uv";
import {
  SURFACE_DETAIL_ANISOTROPY,
  SURFACE_DETAIL_BUMP_UNIT,
  SURFACE_DETAIL_SCALE,
  createSurfaceDetailTexture,
} from "../materials/studio-surface-normal-maps";
import { applyMetalEnvironmentFinish } from "../materials/studio-metal-environment";
import { resolvePillarMaterialSpec } from "../materials/studio-pillar-material";
import {
  materialStyleRecipeFor,
  materialStyleRoleColorFor,
} from "../materials/studio-material-presets";
import {
  createFurnitureBatchCache,
  compactFurnitureIndices,
} from "../authoring/items/studio-furniture-batching";
import {
  sofaFamilyItemTypes, preparedRestoreTimeoutMs, paletteOverrideItemTypes,
  PILLAR_ASSET_SHAPES, PILLAR_MODEL_ITEM_TYPES,
  insetBedBaseGeometry, applyStoneSlabPlanarUv,
  warmWoodFurnitureItemTypes, roleTableItemTypes, diningMaterialRolesByItemType,
  warmCabinetItemTypes, countertopMaterialIndexByItemType, luminancePaletteItemTypes,
  applianceItemTypes,
} from "./external-models/_shared";
import { ALL_ITEM_MODELS } from "./external-models/all-item-models";
import { applyModelAnchors } from "./external-models/model-anchors";
export { ALL_ITEM_MODELS } from "./external-models/all-item-models";
/** 外模型加载状态； */
type ExternalModelLoadState = {
  /** 正在加载的数量。 */
  active: number;
  /** 已开始加载（去重后）的条目数。 */
  pending: number;
  /** 队列里等待的数量。 */
  queued: number;
  /** 并发上限。 */
  limit: number;
  /** 单项加载超时（毫秒）。 */
  timeoutMs: number;
  /** 材质缓存条目数。 */
  materials: number;
  /** 材质复用命中次数。 */
  materialReuses: number;
};

/** createPaletteMaterial 的材质覆盖项。 */
type PaletteMaterialOptions = {
  roughness?: number;
  metalness?: number;
  flatShading?: boolean;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  /** 启用 polygonOffset（避免细节件与主体 z-fighting）。 */
  polygonOffset?: boolean;
  polygonOffsetFactor?: number;
  polygonOffsetUnits?: number;
  /** 自发光色（跟随墙体的构件要与墙体一样靠自发光提亮）。 */
  emissive?: number;
  emissiveIntensity?: number;
  /**
   * 清漆层。给了就换成 `MeshPhysicalMaterial` —— 墙体的 `clearcoat 0.05` 只能挂在
   * physical 材质上，跟随件要逐项照搬墙的表面参数，否则高光形状对不上。
   */
  clearcoat?: number;
  clearcoatRoughness?: number;
  /** 该材质「跟随墙体」：标记进 userData，后续统一发光 / 档位逻辑据此豁免。 */
  wallFollow?: boolean;
};

/** 外模型附加样式选项。 */
type ExternalModelStyleOptions = {
  /** 其余样式键：各子系统的调色板字段。 */
  [styleKey: string]: any;
  /** 暖木色系家具材质总开关。 */
  warmWood?: boolean;
};

export function createExternalModelManager({
  THREE: threeNamespace,
  loader: assetLoader,
  stairItemTypes: stairItemTypes,
  isModelInUse: isModelInUse,
  requestRender: requestRender,
  onLoadStateChange = (_loadState: ExternalModelLoadState) => {},
  maxConcurrentLoads = 2,
  loadTimeoutMs = 12000,
  retryDelayMs = 5000,
  maxAutomaticRetries = 2,
  lifecycle: lifecycleTarget = globalThis.window,
  geometryCache: geometryCache = null,
  persistentCache = createModelPersistentCache({
    THREE: threeNamespace,
  }),
}: any) {
  const preparedTemplatesByItemType = new Map(),
    inflightLoadsByItemType = new Map(),
    restorePromisesByItemType = new Map(),
    restoreEligibleByItemType = new Map(),
    loadQueue: any = [],
    activeItemTypes = new Set(),
    retryStateByItemType = new Map(),
    pendingCancelResolvers = new Set<(inFlightResult: any) => void>(),
    activeTimeoutHandles = new Set<ReturnType<typeof setTimeout>>();
  let isDisposed = false;
  const materialCacheBySignature = new Map(),
    materialVariantsBySource = new WeakMap(),
    geometryVariantsBySource = new WeakMap(),
    furnitureBatchCache = createFurnitureBatchCache(threeNamespace, {
      geometryCache: geometryCache,
    }),
    effectiveConcurrentLimit = Math.max(1, Math.floor(finite(maxConcurrentLoads, 2))),
    effectiveLoadTimeoutMs = Math.max(50, Math.floor(finite(loadTimeoutMs, 12000)));
  let activeLoadCount = 0,
    materialReuseCount = 0;
  function collectLoadState(): ExternalModelLoadState {
    return {
      active: activeLoadCount,
      pending: activeItemTypes.size,
      queued: loadQueue.length,
      limit: effectiveConcurrentLimit,
      timeoutMs: effectiveLoadTimeoutMs,
      materials: materialCacheBySignature.size,
      materialReuses: materialReuseCount,
    };
  }
  function notifyLoadStateChange() {
    isDisposed || onLoadStateChange(collectLoadState());
  }
  function pumpLoadQueue() {
    for (; !isDisposed && activeLoadCount < effectiveConcurrentLimit && loadQueue.length;) {
      const queuedLoadEntry = loadQueue.shift();
      ((activeLoadCount += 1),
        notifyLoadStateChange(),
        Promise.resolve()
          .then(() => (isDisposed ? null : queuedLoadEntry.run()))
          .then(queuedLoadEntry.resolve, queuedLoadEntry.reject)
          .finally(() => {
            ((activeLoadCount -= 1), pumpLoadQueue(), notifyLoadStateChange());
          }));
    }
  }
  function enqueueLoadTask(loadTaskRunner: any) {
    return isDisposed
      ? Promise.resolve(null)
      : new Promise((resolveLoadTask, rejectLoadTask) => {
          (loadQueue.push({
            run: loadTaskRunner,
            resolve: resolveLoadTask,
            reject: rejectLoadTask,
          }),
            notifyLoadStateChange(),
            pumpLoadQueue());
        });
  }
  async function loadTemplateForItem(
    itemDefinition: any,
    itemTypeName: any,
    { skipPersistentRestore = false } = {},
  ) {
    const templateCacheKey = modelTemplateKey(threeNamespace, itemTypeName, itemDefinition),
      restoredPreparedTemplate = skipPersistentRestore
        ? null
        : await persistentCache.restore(templateCacheKey);
    if (restoredPreparedTemplate)
      return {
        preparedTemplate: restoredPreparedTemplate,
      };
    if (!itemDefinition?.url) throw new Error("模型 " + itemTypeName + " 没有可用资源");
    /**
     * GLTFLoader 在 `scenes` 为空时不会报错，只让 `gltf.scene` 变成 undefined，
     * 于是整件模型静默不显示（30 款精修件踩过）。解析成功但场景为空必须当失败处理。
     */
    const assertScene = (asset: any, url: string) => {
      if (asset?.scene) {
        let meshCount = 0;
        asset.scene.traverse?.((node: any) => {
          if (node.isMesh) meshCount += 1;
        });
        if (meshCount > 0) return asset;
        reportPreviewIssue({
          stage: 'parse',
          itemType: itemTypeName,
          url,
          message: 'GLB 场景内没有任何网格（预览必然空白）',
        });
        const emptyError = new Error(`模型 ${itemTypeName} 场景为空`) as Error & { response?: unknown };
        emptyError.response = { status: 200 };
        throw emptyError;
      }
      reportPreviewIssue({
        stage: 'parse',
        itemType: itemTypeName,
        url,
        message: 'GLB 没有默认场景（gltf.scene 为空，模型不会显示）',
      });
      const sceneError = new Error(`模型 ${itemTypeName} 缺少默认场景`) as Error & { response?: unknown };
      sceneError.response = { status: 200 };
      throw sceneError;
    };
    try {
      const loadedAsset = assertScene(await assetLoader.loadAsync(itemDefinition.url), itemDefinition.url);
      return (
        await prepareModelTextures(loadedAsset),
        {
          ...loadedAsset,
          preparedCacheKey: templateCacheKey,
        }
      );
    } catch (primaryLoadError: any) {
      if (isDisposed || !itemDefinition.fallbackUrl) {
        reportPreviewIssue({
          stage: 'load',
          itemType: itemTypeName,
          url: itemDefinition.url,
          status: statusOfPreviewError(primaryLoadError),
          message: messageOfPreviewError(primaryLoadError),
        });
        throw primaryLoadError;
      }
      try {
        const fallbackAsset = await assetLoader.loadAsync(itemDefinition.fallbackUrl);
        assertScene(fallbackAsset, itemDefinition.fallbackUrl);
        // 回退成功也要留痕：lite 是运行期首选变体，它坏了说明压缩产物有问题，
        // 悄悄用完整件顶上会让「lite 解析失败」永远没人修。
        reportPreviewIssue({
          stage: 'fallback',
          itemType: itemTypeName,
          url: itemDefinition.url,
          status: statusOfPreviewError(primaryLoadError),
          message: `lite 加载失败，已回退完整件：${messageOfPreviewError(primaryLoadError)}`,
        });
        return fallbackAsset;
      } catch (fallbackLoadError: any) {
        reportPreviewIssue({
          stage: 'load',
          itemType: itemTypeName,
          url: itemDefinition.fallbackUrl,
          status: statusOfPreviewError(fallbackLoadError),
          message: `主资源与备用资源都失败：${messageOfPreviewError(primaryLoadError)}；${messageOfPreviewError(fallbackLoadError)}`,
        });
        throw new AggregateError(
          [primaryLoadError, fallbackLoadError],
          "模型 " + itemTypeName + " 的主资源和备用资源均不可用",
        );
      }
    }
  }
  function scheduleTimeout(onTimeoutElapsed: any, timeoutDelayMs: any) {
    const scheduledTimeoutHandle = setTimeout(() => {
      (activeTimeoutHandles.delete(scheduledTimeoutHandle), onTimeoutElapsed());
    }, timeoutDelayMs);
    return (activeTimeoutHandles.add(scheduledTimeoutHandle), scheduledTimeoutHandle);
  }
  function cancelScheduledTimeout(timeoutHandleToCancel: any) {
    (clearTimeout(timeoutHandleToCancel), activeTimeoutHandles.delete(timeoutHandleToCancel));
  }
  function isPermanentAssetFailure(assetLoadError: any) {
    return Array.isArray(assetLoadError?.errors)
      ? assetLoadError.errors.every(isPermanentAssetFailure)
      : [404, 410].includes(Number(assetLoadError?.response?.status ?? assetLoadError?.status));
  }
  function recordLoadFailure(failedItemTypeName: any, failureCause: any) {
    const attemptCount = (retryStateByItemType.get(failedItemTypeName)?.attempts || 0) + 1,
      isPermanentFailure = isPermanentAssetFailure(failureCause),
      retryDelayForAttemptMs = isPermanentFailure
        ? 300000
        : Math.min(60000, Math.max(50, retryDelayMs) * 3 ** (attemptCount - 1)),
      retryStateEntry = {
        attempts: attemptCount,
        permanent: isPermanentFailure,
        retryAt: Date.now() + retryDelayForAttemptMs,
        timer: null as any,
      };
    (retryStateByItemType.set(failedItemTypeName, retryStateEntry),
      !isPermanentFailure &&
        attemptCount <= Math.max(0, maxAutomaticRetries) &&
        ((retryStateEntry.timer = scheduleTimeout(() => {
          ((retryStateEntry.timer = null),
            (retryStateEntry.retryAt = 0),
            !isDisposed &&
              isModelInUse(failedItemTypeName) &&
              lifecycleTarget?.navigator?.onLine !== false &&
              loadExternalItemModel(failedItemTypeName));
        }, retryDelayForAttemptMs)),
        retryStateEntry.timer.unref?.()),
      globalThis.window?.HomeOSLog?.error!(
        failureCause,
        {
          phase: "studio-model-load",
        },
        "无法载入外部模型 " + failedItemTypeName + "：" + (failureCause?.message || failureCause),
      )!,
      console.error("无法载入外部模型 " + failedItemTypeName, failureCause));
  }
  function retryPendingModels() {
    if (!isDisposed) {
      for (const [retryItemType, retryEntry] of retryStateByItemType)
        retryEntry.permanent ||
          (cancelScheduledTimeout(retryEntry.timer),
          retryStateByItemType.delete(retryItemType),
          isModelInUse(retryItemType) && loadExternalItemModel(retryItemType));
    }
  }
  function disposeModelManager() {
    if (!isDisposed) {
      ((isDisposed = true),
        assetLoader.dispose?.(),
        furnitureBatchCache.dispose(),
        lifecycleTarget?.removeEventListener?.("online", retryPendingModels),
        lifecycleTarget?.removeEventListener?.("pagehide", disposeModelManager));
      for (const timeoutHandleToClear of activeTimeoutHandles) clearTimeout(timeoutHandleToClear);
      activeTimeoutHandles.clear();
      for (const cancelResolver of pendingCancelResolvers) cancelResolver(null);
      pendingCancelResolvers.clear();
      for (const discardedQueueEntry of loadQueue.splice(0)) discardedQueueEntry.resolve(null);
      (activeItemTypes.clear(),
        retryStateByItemType.clear(),
        inflightLoadsByItemType.clear(),
        restorePromisesByItemType.clear(),
        restoreEligibleByItemType.clear());
    }
  }
  (lifecycleTarget?.addEventListener?.("online", retryPendingModels),
    lifecycleTarget?.addEventListener?.("pagehide", disposeModelManager, {
      once: true,
    }));
  function resolveModelTypeForItem(item: any): string {
    return item.type === "sofa-l"
      ? item.sofaChaiseSide === "left"
        ? "sofa-l-left"
        : "sofa-l"
      : item.type === "pillar"
        ? PILLAR_ASSET_SHAPES.has(item.pillarShape)
          ? "pillar_" + item.pillarShape
          : "pillar"
        : item.type === "curtain"
          ? "curtain_" +
            (["left", "right", "split"].includes(item.curtainPosition)
              ? item.curtainPosition
              : "split")
          : item.type === "rounddiningtable" &&
              (item.roundTableTurntable === true || item.type === "rounddiningtableturntable")
            ? "rounddiningtable_turntable"
            : item.type === "tv"
              ? "tv_" +
                (["standard", "tabletop", "mobile"].includes(item.tvMountStyle)
                  ? item.tvMountStyle
                  : "standard")
              : item.type === "pipelinewaterpurifier"
                ? pipelineDispenserModelType(item)
                : storageSectionModelType(item);
  }
  function preloadPersistentModels(itemTypeList: any[] = []) {
    if (isDisposed) return Promise.resolve([]);
    const restoredTemplatePromises = [...new Set(itemTypeList)]
      .filter((requestedItemType) => (ALL_ITEM_MODELS as any)[requestedItemType])
      .map((resolvedItemType) => {
        if (preparedTemplatesByItemType.has(resolvedItemType))
          return Promise.resolve(preparedTemplatesByItemType.get(resolvedItemType));
        if (inflightLoadsByItemType.has(resolvedItemType))
          return inflightLoadsByItemType.get(resolvedItemType);
        if (restorePromisesByItemType.has(resolvedItemType))
          return restorePromisesByItemType.get(resolvedItemType);
        const cachedModelDefinition = (ALL_ITEM_MODELS as any)[resolvedItemType];
        restoreEligibleByItemType.set(resolvedItemType, true);
        const pendingRestorePromise = Promise.resolve()
            .then(() =>
              persistentCache.restore(
                modelTemplateKey(threeNamespace, resolvedItemType, cachedModelDefinition),
                {
                  valid: () =>
                    !isDisposed && restoreEligibleByItemType.get(resolvedItemType) === true,
                },
              ),
            )
            .then((restoredTemplate) =>
              isDisposed
                ? (releaseModelAsset(restoredTemplate), null)
                : (restoredTemplate &&
                    !preparedTemplatesByItemType.has(resolvedItemType) &&
                    !inflightLoadsByItemType.has(resolvedItemType) &&
                    (compactFurnitureIndices(
                      threeNamespace,
                      restoredTemplate.source,
                      resolvedItemType,
                    ),
                    preparedTemplatesByItemType.set(resolvedItemType, restoredTemplate)),
                  restoredTemplate),
            )
            .catch(() => null)
            .finally(() => {
              restorePromisesByItemType.get(resolvedItemType) === pendingRestorePromise &&
                restorePromisesByItemType.delete(resolvedItemType);
            });
        return (
          restorePromisesByItemType.set(resolvedItemType, pendingRestorePromise),
          pendingRestorePromise
        );
      });
    return Promise.all(restoredTemplatePromises);
  }
  function applyLoadedTemplate(loadedItemType: any, loadResult: any) {
    if (isDisposed) return (releaseModelAsset(loadResult), null);
    if (!loadResult) return null;
    if (loadResult.preparedTemplate)
      return (
        compactFurnitureIndices(threeNamespace, loadResult.preparedTemplate.source, loadedItemType),
        retryStateByItemType.delete(loadedItemType),
        preparedTemplatesByItemType.set(loadedItemType, loadResult.preparedTemplate),
        isModelInUse(loadedItemType) &&
          requestRender({
            force: true,
          }),
        loadResult.preparedTemplate
      );
    const templateScene = loadResult.scene || loadResult.scenes?.[0];
    if (!templateScene) throw new Error("模型 " + loadedItemType + " 没有可显示的场景");

    /**
     * 槽位名归一：**改名后 GLB 里是新名，而本文件下游 30 处历史分支仍按旧名取色**
     * （`material-<n>` 下标、`M03_Pewter_Shine`、`B-1`、`cabinet-material-0`…）。
     * 在模板入库前把名字换回旧名，所有读取点——本文件的、车辆的、检查面板的——
     * 看到的一直是旧名，逻辑与视觉都不变；别名表为空时这一步不会改动任何名字。
     *
     * 新代码不要依赖这里的旧名，按角色判定（`resolveModelMaterialRole`）。
     */
    normalizeTemplateSlotNames(templateScene, loadedItemType);
    /**
     * 补盒式 UV：模型库 645/660 个 GLB 没有 `TEXCOORD_0`，而表面法线图必须采样 UV。
     * 必须在模板入库前做完 —— 之后几何体会被克隆 / 合批，补 UV 的时机就晚了。
     */
    ensureSceneBoxUvs(threeNamespace, templateScene);


    applyStoneSlabPlanarUv(threeNamespace, templateScene, loadedItemType);
    if (
      (compactFurnitureIndices(threeNamespace, templateScene, loadedItemType),
      (loadedItemType === "glasscabinet" || loadedItemType === "bookcase") &&
        repairGlassCabinetBack(threeNamespace, templateScene, loadedItemType),
      loadedItemType === "wallcabinet" && repairWallCabinetSides(threeNamespace, templateScene),
      loadedItemType === "sideboard" && repairSideboardJoints(threeNamespace, templateScene),
      loadedItemType === "sideboard" && repairSideboardGlassDoor(threeNamespace, templateScene),
      ["suv", "scooter"].includes(loadedItemType) &&
        prepareVehicleChargeGeometry(threeNamespace, templateScene),
      loadedItemType === "suv" && prepareSuvRoofGlass(threeNamespace, templateScene),
      loadedItemType === "smallcar")
    ) {
      const smoothedGeometryByOriginal = new Map();
      templateScene.traverse((carMesh: any) => {
        if (!carMesh.isMesh) return;
        const originalGeometry = carMesh.geometry;
        (smoothedGeometryByOriginal.has(originalGeometry) ||
          smoothedGeometryByOriginal.set(
            originalGeometry,
            smoothCarSurfaceNormals(threeNamespace, originalGeometry),
          ),
          (carMesh.geometry = smoothedGeometryByOriginal.get(originalGeometry)));
      });
      for (const [cachedGeometry, smoothedGeometry] of smoothedGeometryByOriginal)
        cachedGeometry !== smoothedGeometry && cachedGeometry.dispose();
    }
    (loadedItemType === "bed" &&
      templateScene.traverse((bedMesh: any) => {
        bedMesh.isMesh && (bedMesh.geometry = insetBedBaseGeometry(bedMesh.geometry));
      }),
      templateScene.updateMatrixWorld(true));
    // 取尺寸优先用模型里烘焙的 `homeosPlacementBounds`（省一次整树遍历、结果确定）；
    // 没烘焙 / 烘焙不可信时回退几何体自算。
    const modelSize = (
      modelPlacementBounds(threeNamespace, templateScene) ??
      new threeNamespace.Box3().setFromObject(templateScene)
    ).getSize(new threeNamespace.Vector3());
    if (
      ![modelSize.x, modelSize.y, modelSize.z].every(
        (sizeAxis) => Number.isFinite(sizeAxis) && sizeAxis > 0.001,
      )
    )
      throw new Error("模型 " + loadedItemType + " 的尺寸无效");
    const loadedModelEntry = {
      source: templateScene,
      size: modelSize,
      bounds: captureModelTemplateBounds(templateScene),
    };
    if (
      (retryStateByItemType.delete(loadedItemType),
      preparedTemplatesByItemType.set(loadedItemType, loadedModelEntry),
      loadResult.preparedCacheKey)
    )
      try {
        persistentCache.schedule(loadResult.preparedCacheKey, loadedModelEntry);
      } catch { /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */ }
    return (
      isModelInUse(loadedItemType) &&
        requestRender({
          force: true,
        }),
      loadedModelEntry
    );
  }
  function loadExternalItemModel(modelItemType: any) {
    if (isDisposed) return Promise.resolve(null);
    if (
      typeof window < "u" &&
      window.externalModelLoadsDeferred &&
      !window.__homeosReleasingDeferredModels
    )
      return (window.__homeosDeferExternalModel?.(modelItemType), Promise.resolve(null));
    if (preparedTemplatesByItemType.has(modelItemType))
      return Promise.resolve(preparedTemplatesByItemType.get(modelItemType));
    if (inflightLoadsByItemType.has(modelItemType))
      return inflightLoadsByItemType.get(modelItemType);
    const targetModelDefinition = (ALL_ITEM_MODELS as any)[modelItemType];
    if (!targetModelDefinition) return Promise.resolve(null);
    const retryState = retryStateByItemType.get(modelItemType);
    if (retryState && Date.now() < retryState.retryAt) return Promise.resolve(null);
    retryState && cancelScheduledTimeout(retryState.timer);
    restoreEligibleByItemType.has(modelItemType) ||
      restoreEligibleByItemType.set(modelItemType, true);
    const sharedRestorePromise = restorePromisesByItemType.get(modelItemType),
      restoreCacheKey = modelTemplateKey(threeNamespace, modelItemType, targetModelDefinition),
      restorePromise =
        sharedRestorePromise ||
        Promise.resolve()
          .then(() =>
            persistentCache.restore(restoreCacheKey, {
              valid: () => !isDisposed && restoreEligibleByItemType.get(modelItemType) === true,
            }),
          )
          .catch(() => null);
    let queuedTaskPromise: any = null;
    const startQueuedLoad = () =>
      (queuedTaskPromise ||= enqueueLoadTask(async () => {
        restoreEligibleByItemType.set(modelItemType, false);
        const preparedTemplateFromLoad = await loadTemplateForItem(
          targetModelDefinition,
          modelItemType,
          {
            skipPersistentRestore: true,
          },
        );
        try {
          return applyLoadedTemplate(modelItemType, preparedTemplateFromLoad);
        } catch (applyPreparedError: any) {
          throw (releaseModelAsset(preparedTemplateFromLoad), applyPreparedError);
        }
      }));
    let settleInFlightLoad: any;
    const inFlightLoadPromise = new Promise((resolveInFlightLoad) => {
      settleInFlightLoad = (inFlightResult: any) => {
        pendingCancelResolvers.delete(settleInFlightLoad) &&
          (activeItemTypes.delete(modelItemType),
          cancelScheduledTimeout(hardTimeoutHandle),
          resolveInFlightLoad(inFlightResult),
          notifyLoadStateChange());
      };
    });
    (pendingCancelResolvers.add(settleInFlightLoad),
      inflightLoadsByItemType.set(modelItemType, inFlightLoadPromise),
      activeItemTypes.add(modelItemType));
    const hardTimeoutHandle = scheduleTimeout(
      () => settleInFlightLoad(null),
      effectiveLoadTimeoutMs,
    );
    return (
      notifyLoadStateChange(),
      new Promise((resolveOuterLoad, rejectOuterLoad) => {
        let isLoadSettled = false,
          restoreTimeoutHandle: any = null;
        const completeLoad = () => {
          if (!isLoadSettled) {
            if (
              ((isLoadSettled = true), cancelScheduledTimeout(restoreTimeoutHandle), isDisposed)
            ) {
              resolveOuterLoad(null);
              return;
            }
            startQueuedLoad().then(resolveOuterLoad, rejectOuterLoad);
          }
        };
        ((restoreTimeoutHandle = scheduleTimeout(completeLoad, preparedRestoreTimeoutMs)),
          restorePromise.then((preparedTemplateResult: any) => {
            if (isLoadSettled) {
              preparedTemplateResult &&
                preparedTemplatesByItemType.get(modelItemType) !== preparedTemplateResult &&
                releaseModelAsset(preparedTemplateResult);
              return;
            }
            if ((cancelScheduledTimeout(restoreTimeoutHandle), preparedTemplateResult)) {
              ((isLoadSettled = true), restoreEligibleByItemType.set(modelItemType, false));
              try {
                resolveOuterLoad(
                  applyLoadedTemplate(modelItemType, {
                    preparedTemplate: preparedTemplateResult,
                  }),
                );
              } catch (preparedApplyError: any) {
                (releaseModelAsset(preparedTemplateResult), rejectOuterLoad(preparedApplyError));
              }
            } else completeLoad();
          }, completeLoad));
      })
        .catch(
          (loadAttemptError) => (
            isDisposed || recordLoadFailure(modelItemType, loadAttemptError),
            null
          ),
        )
        .then(settleInFlightLoad)
        .finally(() => inflightLoadsByItemType.delete(modelItemType)),
      inFlightLoadPromise
    );
  }
  /** 该材质是否自带图集贴图（`car_tms` 这类整块烘焙的 UV 图集）。 */
  function materialHasAtlas(material: any) {
    return Boolean(material?.map?.isTexture);
  }
  /**
   * 图集材质**只能**克隆，绝不能按调色板重建。
   *
   * 这类材质把车漆、玻璃、尾灯、轮毂全烘焙进一张贴图，`color` 只当乘性底色用
   * （`car.glb` 就是纯白 `[1,1,1,1]`）。一旦换成「一个角色一个颜色」的新材质，
   * `map` 会被顺手丢掉，模型只剩那层纯色 —— 看起来就是整台车变成白壳。
   * 所以遇到图集材质时保留贴图与 alpha 裁剪参数，只清掉发光/调色板残留。
   */
  function keepAtlasMaterial(sourceMaterial: any, labelSuffix: string) {
    const clonedMaterial = sourceMaterial.clone?.() || sourceMaterial;
    return (
      (clonedMaterial.emissive?.set?.(0), (clonedMaterial.emissiveIntensity = 0)),
      (clonedMaterial.name = (sourceMaterial.name || "external-model") + labelSuffix),
      (clonedMaterial.userData = {
        ...(clonedMaterial.userData || {}),
        homeosAtlasKept: true,
      }),
      clonedMaterial
    );
  }
  function applyDefaultPaletteMaterial(originalMaterial: any, paletteColors: any) {
    if (!originalMaterial) return originalMaterial;
    if (materialHasAtlas(originalMaterial))
      return keepAtlasMaterial(originalMaterial, " · HomeOS atlas");
    const baseColor = originalMaterial.color?.clone?.() || new threeNamespace.Color(16777215),
      baseLuminance = baseColor.r * 0.2126 + baseColor.g * 0.7152 + baseColor.b * 0.0722,
      paletteColor =
        baseLuminance < 0.1
          ? paletteColors.furnitureDark
          : baseLuminance < 0.42
            ? paletteColors.furniture
            : baseLuminance < 0.72
              ? paletteColors.furnitureSoft
              : paletteColors.furnitureLight,
      emissiveBaseColor = new threeNamespace.Color(paletteColor).multiplyScalar(0.34),
      defaultPaletteMaterial = new threeNamespace.MeshStandardMaterial({
        color: emissiveBaseColor,
        roughness: baseLuminance < 0.1 ? 0.34 : baseLuminance < 0.42 ? 0.52 : 0.58,
        metalness: baseLuminance < 0.1 ? 0.22 : 0.04,
        emissive: paletteColor,
        emissiveIntensity: 0.46,
        side: originalMaterial.side ?? threeNamespace.FrontSide,
        transparent: false,
        opacity: 1,
        depthWrite: originalMaterial.depthWrite ?? true,
        depthTest: originalMaterial.depthTest ?? true,
        toneMapped: true,
      });
    return (
      (defaultPaletteMaterial.name =
        (originalMaterial.name || "external-model") + " · HomeOS palette"),
      defaultPaletteMaterial
    );
  }
  function createPaletteMaterial(
    templateMaterial: any,
    materialColor: any,
    materialOptions: PaletteMaterialOptions = {},
  ) {
    if (!templateMaterial) return templateMaterial;
    // 图集材质不能被「一个角色一个颜色」覆盖，否则贴图连同 UV 细节一起消失。
    if (materialHasAtlas(templateMaterial))
      return keepAtlasMaterial(templateMaterial, " · HomeOS atlas");
    // 只有需要清漆层（跟随墙体的构件）才建 physical 材质：多一套 clearcoat 参数，
    // 对普通家具没有收益，还会让材质键 / 合批多一维。
    const PaletteMaterialConstructor =
      materialOptions.clearcoat === undefined
        ? threeNamespace.MeshStandardMaterial
        : threeNamespace.MeshPhysicalMaterial;
    const derivedMaterial = new PaletteMaterialConstructor({
      color: materialColor,
      roughness: materialOptions.roughness ?? 0.58,
      metalness: materialOptions.metalness ?? 0.04,
      flatShading: materialOptions.flatShading ?? false,
      emissive: materialOptions.emissive ?? 0,
      emissiveIntensity: materialOptions.emissiveIntensity ?? 0,
      ...(materialOptions.clearcoat === undefined
        ? {}
        : {
            clearcoat: materialOptions.clearcoat,
            clearcoatRoughness: materialOptions.clearcoatRoughness ?? 0,
          }),
      side: templateMaterial.side ?? threeNamespace.FrontSide,
      transparent: materialOptions.transparent ?? false,
      opacity: materialOptions.opacity ?? 1,
      depthWrite: materialOptions.depthWrite ?? templateMaterial.depthWrite ?? true,
      depthTest: templateMaterial.depthTest ?? true,
      toneMapped: true,
    });
    return (
      (derivedMaterial.name =
        (templateMaterial.name || "external-model") + " · HomeOS furniture material"),
      (derivedMaterial.polygonOffset = materialOptions.polygonOffset === true),
      (derivedMaterial.polygonOffsetFactor = materialOptions.polygonOffsetFactor ?? 0),
      (derivedMaterial.polygonOffsetUnits = materialOptions.polygonOffsetUnits ?? 0),
      materialOptions.wallFollow === true &&
        (derivedMaterial.userData = { ...(derivedMaterial.userData || {}), homeosWallFollow: true }),
      derivedMaterial
    );
  }
  function applyWarmWoodFurnitureMaterial(meshMaterial: any, warmPalette: any, furnitureItemType: any) {
    const isWarmCabinetItem = warmPalette.warmWood && warmCabinetItemTypes.has(furnitureItemType);
    (isWarmCabinetItem &&
      (warmPalette = {
        ...warmPalette,
        wood: warmPalette.cabinetWood ?? warmPalette.wood,
      }),
      warmPalette.warmWood &&
        (["sofa", "bed", "chair", "rug", "curtain_left", "curtain_right", "curtain_split"].includes(
          furnitureItemType,
        ) ||
          (warmPalette = {
            ...warmPalette,
            furnitureSoft: warmPalette.furnitureLight,
          }),
        [
          "cabinet",
          "wallcabinet",
          "shoecabinet",
          "sideboard",
          "bookcase",
          "shelf",
          "nightstand",
          "tvstand",
          "kitchenbase",
          "desk",
          "vanity",
          "glasscabinet",
        ].includes(furnitureItemType) &&
          (warmPalette = {
            ...warmPalette,
            furniture: warmPalette.wood,
            furnitureSoft: warmPalette.wood,
            furnitureDark: warmPalette.wood,
          })));
    // 槽位改名后仍要让下面 30 处「按下标 / 原始名取色」的历史分支看到旧名：
    // 别名表与改名同源生成，见 materials/legacy-material-aliases.ts。
    const materialName = canonicalExternalMaterialName(
      meshMaterial?.name,
      furnitureItemType,
    );
    if (furnitureItemType === "shower" && warmPalette.showerMetal !== undefined)
      return createPaletteMaterial(meshMaterial, warmPalette.showerMetal, {
        roughness: 0.48,
        metalness: 0.3,
      });
    if (PILLAR_MODEL_ITEM_TYPES.has(furnitureItemType)) {
      /**
       * 柱体三条槽位：`body` / `base`（柱础）/ `trim`（柱帽、收边）。
       * 角色一律走角色表（`pillar-body` / `pillar_quarter-trim` 这类名字旧正则匹配不到），
       * 配方里的「配墙」与「配柜档位」两条分支见 `materials/studio-pillar-material.ts`。
       */
      const pillarRole =
        resolveModelMaterialRole(furnitureItemType, materialName)?.role ?? "body";
      const pillarSpec = resolvePillarMaterialSpec(furnitureItemType, pillarRole, warmPalette);
      const pillarMaterial = createPaletteMaterial(meshMaterial, pillarSpec.color, {
        roughness: pillarSpec.roughness,
        metalness: pillarSpec.metalness,
        clearcoat: pillarSpec.clearcoat,
        clearcoatRoughness: pillarSpec.clearcoatRoughness,
        emissive: pillarSpec.emissive,
        emissiveIntensity: pillarSpec.emissiveIntensity,
        transparent: pillarSpec.transparent,
        opacity: pillarSpec.opacity,
        /**
         * 配墙档要跟墙一样「让后面透出来」：墙把 `depthWrite` 关掉
         * （`createSceneWallSideMaterial`），柱体若写深度，就会在墙膜后面挖一个洞。
         */
        ...(pillarSpec.wallFollow && pillarSpec.transparent ? { depthWrite: false } : {}),
        wallFollow: pillarSpec.wallFollow,
      });
      return pillarMaterial;
    }
    const diningMaterialRole = warmPalette.warmWood
      ? (diningMaterialRolesByItemType as any)[furnitureItemType]?.[
          Number(materialName.match(/material-(\d+)$/)?.[1])
        ]
      : null;
    if (diningMaterialRole) {
      const diningRoleColors = {
          wood: warmPalette.wood,
          linen: warmPalette.diningLinen ?? 15919316,
          sage: warmPalette.diningSage ?? 10926731,
          ceramic: warmPalette.applianceSoft,
        },
        isFabricRole = diningMaterialRole === "linen" || diningMaterialRole === "sage",
        diningFabricMaterial = createPaletteMaterial(
          meshMaterial,
          (diningRoleColors as any)[diningMaterialRole],
          {
            roughness: isFabricRole ? 0.94 : diningMaterialRole === "ceramic" ? 0.3 : 0.58,
            metalness: 0,
          },
        );
      return (
        (diningFabricMaterial.userData.warmDiningFabric = isFabricRole),
        (diningFabricMaterial.userData.warmDiningMaterial = diningMaterialRole),
        diningFabricMaterial
      );
    }
    let resolvedMaterialColor = warmPalette.furniture;
    if (/^curtain_(left|right|split)$/.test(furnitureItemType)) {
      const curtainMaterialIndex = materialName.match(/material-(\d+)/)?.[1] ?? "";
      ["0", "4"].includes(curtainMaterialIndex)
        ? (resolvedMaterialColor = warmPalette.furnitureDark)
        : ["1", "5", "2", "3"].includes(curtainMaterialIndex)
          ? (resolvedMaterialColor = warmPalette.furnitureSoft)
          : (resolvedMaterialColor = warmPalette.furniture);
    } else {
      if (
        furnitureItemType === "coffeetable" ||
        furnitureItemType === "kitchenisland" ||
        furnitureItemType === "squarecoffeetable"
      ) {


        const slabPartRole = materialName.match(/material-\d+-([a-z]+)$/)?.[1];
        resolvedMaterialColor =
          slabPartRole === "top"
            ? warmPalette.furnitureSoft
            : slabPartRole === "base" || slabPartRole === "body" || slabPartRole === "leg"
              ? warmPalette.furnitureDark
              : slabPartRole === "door"
                ? warmPalette.furnitureSoft
                : slabPartRole === "metal"
                  ? warmPalette.furniture
                  : materialName.endsWith("-dark")
                    ? warmPalette.furnitureDark
                    : materialName.endsWith("-light") || materialName.endsWith("-soft")
                      ? warmPalette.furnitureSoft
                      : warmPalette.furniture;
      } else {
        if (furnitureItemType === "tvstand") {
          const tvstandBaseColor =
              meshMaterial?.color?.clone?.() || new threeNamespace.Color(16777215),
            tvstandBaseLuminance =
              tvstandBaseColor.r * 0.2126 +
              tvstandBaseColor.g * 0.7152 +
              tvstandBaseColor.b * 0.0722;
          resolvedMaterialColor =
            materialName.endsWith("-dark") || tvstandBaseLuminance < 0.16
              ? warmPalette.furnitureDark
              : materialName.endsWith("-soft") ||
                  materialName.endsWith("-light") ||
                  tvstandBaseLuminance >= 0.3
                ? warmPalette.furnitureSoft
                : warmPalette.furniture;
        } else {
          if (
            ["table", "rounddiningtable", "rounddiningtable_turntable"].includes(furnitureItemType)
          ) {
            const tableMaterialIndex = materialName.match(/material-(\d+)/)?.[1] ?? "",
              tableSoftMaterialIndices =
                furnitureItemType === "rounddiningtable_turntable" ? ["0", "3"] : ["0"],
              tableBaseColor = meshMaterial?.color?.clone?.() || new threeNamespace.Color(16777215),
              tableBaseLuminance =
                tableBaseColor.r * 0.2126 + tableBaseColor.g * 0.7152 + tableBaseColor.b * 0.0722;
            resolvedMaterialColor = tableSoftMaterialIndices.includes(tableMaterialIndex)
              ? warmPalette.furnitureSoft
              : tableBaseLuminance < 0.2
                ? warmPalette.furnitureDark
                : tableBaseLuminance < 0.55
                  ? warmPalette.furniture
                  : warmPalette.furnitureSoft;
          } else {
            if (
              ["kitchenbase", "kitchensink", "kitchencooktop", "basin"].includes(furnitureItemType)
            ) {
              const kitchenMaterialIndex = materialName.match(/material-(\d+)/)?.[1] ?? "",
                kitchenCounterMaterialIndex = furnitureItemType === "basin" ? "1" : "2",
                kitchenBaseColor =
                  meshMaterial?.color?.clone?.() || new threeNamespace.Color(16777215),
                kitchenBaseLuminance =
                  kitchenBaseColor.r * 0.2126 +
                  kitchenBaseColor.g * 0.7152 +
                  kitchenBaseColor.b * 0.0722;
              resolvedMaterialColor =
                kitchenMaterialIndex === kitchenCounterMaterialIndex
                  ? warmPalette.furniture
                  : kitchenBaseLuminance < 0.2
                    ? warmPalette.furnitureDark
                    : kitchenBaseLuminance < 0.55
                      ? warmPalette.furniture
                      : warmPalette.furnitureSoft;
            } else {
              if (furnitureItemType === "stairs") resolvedMaterialColor = warmPalette.furniture;
              else {
                if (
                  furnitureItemType === "plant" &&
                  (materialName.endsWith("-soft") || materialName.endsWith("-dark"))
                )
                  resolvedMaterialColor = warmPalette.furniture;
                else {
                  if (materialName.includes("foliagesoft")) resolvedMaterialColor = 7835779;
                  else {
                    if (materialName.includes("foliage")) resolvedMaterialColor = 6257261;
                    else {
                      if (materialName.endsWith("-soft") || materialName.endsWith("-light"))
                        resolvedMaterialColor = warmPalette.furnitureSoft;
                      else {
                        if (materialName.endsWith("-dark"))
                          resolvedMaterialColor = warmPalette.furnitureDark;
                        else {
                          if (luminancePaletteItemTypes.has(furnitureItemType)) {
                            const solidPaletteColor =
                                meshMaterial.color?.clone?.() || new threeNamespace.Color(16777215),
                              solidPaletteLuminance =
                                solidPaletteColor.r * 0.2126 +
                                solidPaletteColor.g * 0.7152 +
                                solidPaletteColor.b * 0.0722;
                            resolvedMaterialColor =
                              solidPaletteLuminance < 0.2
                                ? warmPalette.furnitureDark
                                : solidPaletteLuminance < 0.55
                                  ? warmPalette.furniture
                                  : warmPalette.furnitureSoft;
                          }
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    }
    if (warmPalette.warmWood) {
      const warmWoodMaterialIndex = materialName.match(/material-(\d+)/)?.[1] ?? "";
      (furnitureItemType === "bed" &&
        (resolvedMaterialColor = ["1", "3"].includes(warmWoodMaterialIndex)
          ? warmPalette.furnitureLight
          : warmPalette.wood),
        furnitureItemType === "sofa" &&
          (resolvedMaterialColor = materialName.includes("cushion")
            ? (warmPalette.sofaFabric ??
              (warmPalette.warmWood ? warmPalette.furnitureLight : warmPalette.furnitureSoft))
            : warmPalette.wood),
        furnitureItemType === "cabinet" &&
          (resolvedMaterialColor = warmWoodMaterialIndex === "2" ? 5462356 : warmPalette.wood),
        furnitureItemType === "nightstand" &&
          (resolvedMaterialColor = warmWoodMaterialIndex === "2" ? 5462356 : warmPalette.wood),
        ["table", "rounddiningtable", "rounddiningtable_turntable"].includes(furnitureItemType) &&
          (resolvedMaterialColor = ["0", "3"].includes(warmWoodMaterialIndex)
            ? warmPalette.wood
            : warmPalette.furnitureLight),
        furnitureItemType === "tvstand" && (resolvedMaterialColor = warmPalette.wood),
        furnitureItemType === "sideboard" && (resolvedMaterialColor = warmPalette.wood),
        furnitureItemType === "bookcase" &&
          Number(warmWoodMaterialIndex) >= 11 &&
          (resolvedMaterialColor = [
            warmPalette.joineryAccent,
            warmPalette.decorAccent,
            warmPalette.furnitureLight,
          ][Number(warmWoodMaterialIndex) % 3]),
        furnitureItemType === "plant" &&
          (resolvedMaterialColor = materialName.includes("foliagesoft")
            ? 9877369
            : materialName.includes("foliage")
              ? warmPalette.leafColor
              : materialName.endsWith("-soft")
                ? warmPalette.decorAccent
                : warmPalette.furnitureDark),
        furnitureItemType === "rug" &&
          (resolvedMaterialColor = materialName.endsWith("-soft")
            ? warmPalette.furnitureLight
            : warmPalette.joineryAccent),
        furnitureItemType.startsWith("curtain_") &&
          (resolvedMaterialColor = ["2", "3", "5", "1"].includes(warmWoodMaterialIndex)
            ? 16776696
            : warmPalette.furnitureDark),
        furnitureItemType === "chair" &&
          (resolvedMaterialColor =
            warmWoodMaterialIndex === "0"
              ? (warmPalette.chairFabric ?? warmPalette.furnitureSoft)
              : warmPalette.wood),
        ["toilet", "squattoilet", "urinal", "bathtub", "basin"].includes(furnitureItemType) &&
          (resolvedMaterialColor = warmPalette.applianceSoft));
    }
    let isCountertopMaterial = false,
      isMetalFinish = false;
    if (isWarmCabinetItem) {
      const warmCabinetMaterialIndex = materialName.match(/material-(\d+)$/)?.[1] ?? "";
      if (
        ((isCountertopMaterial =
          (countertopMaterialIndexByItemType as any)[furnitureItemType] !== undefined &&
          warmCabinetMaterialIndex === (countertopMaterialIndexByItemType as any)[furnitureItemType]),
        furnitureItemType === "tvstand")
      ) {
        const tvstandMaterialColor = meshMaterial.color,
          tvstandMaterialLuminance = tvstandMaterialColor
            ? tvstandMaterialColor.r * 0.2126 +
              tvstandMaterialColor.g * 0.7152 +
              tvstandMaterialColor.b * 0.0722
            : 0;
        isCountertopMaterial =
          materialName.endsWith("-soft") ||
          (!materialName.includes("ha-tvstand-") && tvstandMaterialLuminance >= 0.3);
      }
      (["kitchensink", "kitchencooktop"].includes(furnitureItemType) &&
        (resolvedMaterialColor = warmPalette.wood),
        furnitureItemType === "kitchensink" &&
          ["3", "4", "5", "6"].includes(warmCabinetMaterialIndex) &&
          ((resolvedMaterialColor = ["3", "4"].includes(warmCabinetMaterialIndex)
            ? 10200481
            : 11450548),
          (isMetalFinish = true)),
        furnitureItemType === "kitchencooktop" &&
          ["3", "6", "7"].includes(warmCabinetMaterialIndex) &&
          (resolvedMaterialColor = 4212549),
        ((furnitureItemType === "kitchenbase" && warmCabinetMaterialIndex === "4") ||
          (furnitureItemType === "kitchensink" && warmCabinetMaterialIndex === "8") ||
          (furnitureItemType === "kitchencooktop" && warmCabinetMaterialIndex === "5")) &&
          (resolvedMaterialColor = 7830384),
        furnitureItemType === "cabinet" &&
          warmCabinetMaterialIndex === "1" &&
          (resolvedMaterialColor = 9794135),
        isCountertopMaterial && (resolvedMaterialColor = warmPalette.countertop ?? 16117989));
    }
    const usePolygonOffset = furnitureItemType === "rug" && materialName.endsWith("-soft"),
      isTransparentFinish =
        materialName.endsWith("-glass") ||
        meshMaterial?.transparent === true ||
        (meshMaterial?.opacity ?? 1) < 1;
    return (
      warmPalette.warmWood && isTransparentFinish && (resolvedMaterialColor = warmPalette.glass),
      createPaletteMaterial(meshMaterial, resolvedMaterialColor, {
        roughness: isCountertopMaterial
          ? 0.65
          : isMetalFinish
            ? 0.36
            : warmPalette.warmWood && isTransparentFinish
              ? 0.18
              : materialName.includes("foliage") || furnitureItemType === "rug"
                ? 0.9
                : 0.72,
        metalness: isMetalFinish
          ? 0.55
          : isWarmCabinetItem || materialName.includes("foliage") || furnitureItemType === "rug"
            ? 0
            : 0.02,
        polygonOffset: usePolygonOffset,
        polygonOffsetFactor: usePolygonOffset ? -2 : 0,
        polygonOffsetUnits: usePolygonOffset ? -4 : 0,
        transparent: isTransparentFinish,
        opacity: isTransparentFinish ? (warmPalette.warmWood ? meshMaterial.opacity : 0.42) : 1,
        depthWrite: !isTransparentFinish,
      })
    );
  }
  function applyStairMaterial(stairMaterial: any, stairPalette: any, stairItemTypeName: any) {
    if (!stairMaterial) return stairMaterial;
    if (
      ["glassstairs", "floatingstairs"].includes(stairItemTypeName) &&
      stairMaterial.transparent === true &&
      finite(stairMaterial.opacity, 1) < 0.5
    ) {
      const stairGlassMaterial = new threeNamespace.MeshStandardMaterial({
        color: stairPalette.warmWood ? stairPalette.glass : stairPalette.furnitureSoft,
        roughness: 0.12,
        metalness: 0.04,
        transparent: true,
        opacity: 0.3,
        side: threeNamespace.DoubleSide,
        depthWrite: false,
        depthTest: true,
        toneMapped: true,
      });
      return (
        (stairGlassMaterial.name = (stairMaterial.name || "stair-glass") + " · HomeOS glass"),
        stairGlassMaterial
      );
    }
    const isSteelStair = stairItemTypeName === "steelstairs";
    if (stairPalette.warmWood) {
      const isTreadMaterial =
          stairItemTypeName === "floatingstairs"
            ? stairMaterial.name === "B-1"
            : isSteelStair
              ? /^004$/.test(stairMaterial.name || "")
              : /^sacfdsa010$/.test(stairMaterial.name || ""),
        stairTreadMaterial = createPaletteMaterial(
          stairMaterial,
          isTreadMaterial ? stairPalette.floor : 7567993,
          {
            roughness: isTreadMaterial ? 0.84 : 0.38,
            metalness: isTreadMaterial ? 0 : 0.5,
          },
        );
      return (
        isTreadMaterial &&
          (decorateWarmFloor(stairTreadMaterial, stairPalette),
          (stairTreadMaterial.userData.warmFloorTread = true)),
        stairTreadMaterial
      );
    }
    const stairFrameColor = stairPalette.furnitureSoft,
      stairFrameMaterial = new threeNamespace.MeshStandardMaterial({
        color: stairFrameColor,
        roughness: isSteelStair ? 0.38 : 0.58,
        metalness: isSteelStair ? 0.42 : 0.08,
        emissive: stairFrameColor,
        emissiveIntensity: 0.07,
        side: stairMaterial.side ?? threeNamespace.FrontSide,
        transparent: false,
        opacity: 1,
        depthWrite: true,
        depthTest: true,
        toneMapped: true,
      });
    return (
      (stairFrameMaterial.name = (stairMaterial.name || "stair-frame") + " · HomeOS palette"),
      stairFrameMaterial
    );
  }
  function applyItemDetailMaterial(detailMaterial: any, itemPalette: any, detailItemType: any) {
    if (typeof threeNamespace.MeshStandardMaterial != "function")
      return detailMaterial.clone?.() || detailMaterial;


    if (
      roleTableItemTypes.has(detailItemType) &&
      !isStructuralModelFamily(resolveModelFamily(detailItemType)) &&
      // 语义对照表模型的材质名虽然是「候选色」写法（`plant-candidate-body`），但角色表已经
      // 把它还原成真实构件（`pot`），必须走角色表而不是按尾词当角色。
      (!usesNamedMaterialRole(detailMaterial.name) || hasSemanticSlotRoles(detailItemType))
    ) {
      const roleTableRecipe = materialRoleRecipeFor(detailItemType, detailMaterial.name, itemPalette);
      if (roleTableRecipe) {
        const roleTableMaterial = createPaletteMaterial(detailMaterial, roleTableRecipe.colorValue, {
          roughness: roleTableRecipe.roughness,
          metalness: roleTableRecipe.metalness,
          flatShading: roleTableRecipe.flatShading,
          transparent: roleTableRecipe.transparent,
          opacity: roleTableRecipe.opacity,
          depthWrite: roleTableRecipe.depthWrite,
          polygonOffset: roleTableRecipe.polygonOffset,
        });
        if (roleTableRecipe.emissiveValue !== undefined) {
          roleTableMaterial.emissive.setHex(roleTableRecipe.emissiveValue);
          roleTableMaterial.emissiveIntensity = roleTableRecipe.emissiveIntensity ?? 0.5;
        }
        if (roleTableRecipe.fabricLike) roleTableMaterial.userData.warmDiningFabric = true;
        return roleTableMaterial;
      }
    }
    if (paletteOverrideItemTypes.has(detailItemType)) {
      const detailRole = detailMaterial.name?.split(/-(?:furniture|detail)-/)[1],
        isWarmWoodItem = itemPalette.warmWood,
        lightAccentColor = itemPalette.furnitureLight ?? itemPalette.furnitureSoft,
        isCompactApplianceItem = [
          "smart-socket-86",
          "router",
          "humidifier",
          "dehumidifier",
          "heater",
        ].includes(detailItemType);
      let detailRoleColors;
      isCompactApplianceItem
        ? (detailRoleColors = {
            body: itemPalette.appliance ?? itemPalette.furniture,
            panel: itemPalette.applianceSoft ?? itemPalette.furnitureSoft,
            recess: itemPalette.applianceDark ?? itemPalette.furnitureDark,
            indicator: isWarmWoodItem ? itemPalette.furnitureSoft : lightAccentColor,
            water: itemPalette.glass ?? lightAccentColor,
            control: lightAccentColor,
          })
        : ["wardrobe", "drawer-chest"].includes(detailItemType)
          ? (detailRoleColors = {
              frame: isWarmWoodItem ? itemPalette.wood : itemPalette.furniture,
              panel: isWarmWoodItem ? itemPalette.cabinetWood : itemPalette.furnitureSoft,
              shadow: isWarmWoodItem ? itemPalette.woodDark : itemPalette.furnitureDark,
              handle: isWarmWoodItem ? itemPalette.furnitureDark : lightAccentColor,
            })
          : detailItemType === "office-chair"
            ? (detailRoleColors = {
                frame: isWarmWoodItem ? itemPalette.wood : itemPalette.furniture,
                fabric: isWarmWoodItem ? itemPalette.sofaFabric : itemPalette.furnitureSoft,
                shadow: itemPalette.applianceDark ?? itemPalette.furnitureDark,
                surface: lightAccentColor,
                accent: itemPalette.furnitureSoft,
              })
            : (detailRoleColors = {
                frame: isWarmWoodItem ? itemPalette.wood : itemPalette.furniture,
                fabric:
                  detailItemType === "pool-table"
                    ? itemPalette.furnitureSoft
                    : isWarmWoodItem
                      ? lightAccentColor
                      : itemPalette.furnitureSoft,
                shadow: isWarmWoodItem ? itemPalette.woodDark : itemPalette.furnitureDark,
                surface: lightAccentColor,
                accent: isWarmWoodItem ? itemPalette.furnitureSoft : itemPalette.furniture,
              });
      const detailRoleMaterial = createPaletteMaterial(
        detailMaterial,
        (detailRoleColors as any)[detailRole] ?? itemPalette.furniture,
        {
          roughness: ["fabric", "surface", "accent"].includes(detailRole)
            ? 0.91
            : detailRole === "water"
              ? 0.26
              : 0.72,
          metalness: 0,
        },
      );
      return (
        detailItemType === "bed" &&
          detailRole === "fabric" &&
          (detailRoleMaterial.userData.plan2SurfaceSlope = true),
        detailRoleMaterial
      );
    }
    if (detailItemType === "aquarium" && detailMaterial.name?.startsWith("aquarium-aquatic-")) {
      const aquariumRole = detailMaterial.name.split("-aquatic-")[1],
        isWarmWoodAquarium = itemPalette.warmWood,
        aquariumRoleColors = {
          frame: isWarmWoodAquarium ? itemPalette.cabinetWood : itemPalette.furniture,
          shadow: itemPalette.furnitureDark,
          sand:
            (isWarmWoodAquarium ? itemPalette.countertop : itemPalette.furnitureLight) ??
            itemPalette.furnitureSoft,
          rock: isWarmWoodAquarium ? itemPalette.applianceDark : itemPalette.furnitureSoft,
          foliage: isWarmWoodAquarium ? itemPalette.leafColor : itemPalette.furniture,
          fish:
            (isWarmWoodAquarium ? itemPalette.decorAccent : itemPalette.furnitureLight) ??
            itemPalette.furnitureSoft,
          glass: itemPalette.glass ?? itemPalette.furnitureSoft,
          water: itemPalette.glass ?? itemPalette.furnitureSoft,
        },
        isGlassAquariumRole = aquariumRole === "glass" || aquariumRole === "water";
      return createPaletteMaterial(detailMaterial, (aquariumRoleColors as any)[aquariumRole], {
        roughness: isGlassAquariumRole ? 0.18 : 0.78,
        metalness: 0,
        flatShading: aquariumRole === "rock",
        transparent: isGlassAquariumRole,
        opacity: isGlassAquariumRole ? detailMaterial.opacity : 1,
        depthWrite: !isGlassAquariumRole,
      });
    }
    if (detailItemType === "tea-table-set") {
      const teaTableRole = detailMaterial.name?.split("-tea-")[1],
        teaTableRoleColors = itemPalette.warmWood
          ? {
              frame: itemPalette.wood,
              panel: itemPalette.woodLight,
              recess: itemPalette.furnitureDark,
              ceramic: itemPalette.furnitureLight,
              accent: itemPalette.decorAccent,
            }
          : {
              frame: 8226713,
              panel: 10332346,
              recess: 5397873,
              ceramic: 12634839,
              accent: 10332346,
            };
      return createPaletteMaterial(
        detailMaterial,
        (teaTableRoleColors as any)[teaTableRole] ?? teaTableRoleColors.frame,
        {
          roughness: teaTableRole === "ceramic" ? 0.6 : 0.82,
          metalness: 0,
        },
      );
    }
    if (COURTYARD_MODELS[detailItemType]) {
      const gardenRole = detailMaterial.name?.split("-garden-")[1],
        gardenPalette = courtyardPalette(detailItemType, itemPalette.warmWood ? "warm" : "default");
      return createPaletteMaterial(
        detailMaterial,
        gardenPalette[gardenRole] ?? gardenPalette.base,
        {
          roughness: gardenRole === "water" ? 0.3 : 0.82,
          metalness: 0,
        },
      );
    }
    if ((DECOR_MODELS as any)[detailItemType]) {
      const decorRoleIndex = Number(detailMaterial.name?.split("-decor-")[1]),
        decorRole = (DECOR_MODELS as any)[detailItemType].roles[decorRoleIndex],
        decorThemePalette = DECOR_THEMES[itemPalette.warmWood ? "warm" : "default"];
      return createPaletteMaterial(
        detailMaterial,
        (decorThemePalette as any)[decorRole] ?? decorThemePalette.base,
        {
          roughness: 0.82,
          metalness: 0,
        },
      );
    }
    if (detailMaterial.name?.includes("-furniture-")) {
      const furnitureRole = detailMaterial.name.split("-furniture-")[1],
        isDiningItem = [
          "chair",
          "table",
          "rounddiningtable",
          "rounddiningtable_turntable",
        ].includes(detailItemType),
        isSofaFamilyItem = sofaFamilyItemTypes.has(detailItemType) || detailItemType === "bed",
        isWarmWoodStyle = itemPalette.warmWood,
        furnitureFrameColor = isWarmWoodStyle
          ? detailItemType === "tvstand"
            ? itemPalette.cabinetWood
            : itemPalette.wood
          : itemPalette.furniture,
        furnitureFabricColor = isWarmWoodStyle
          ? detailItemType === "sofa"
            ? itemPalette.sofaFabric
            : isDiningItem
              ? itemPalette.diningLinen
              : itemPalette.furnitureLight
          : itemPalette.furnitureSoft,
        furnitureSurfaceColor = isWarmWoodStyle
          ? isSofaFamilyItem
            ? itemPalette.furnitureLight
            : itemPalette.countertop
          : itemPalette.furnitureSoft,
        furnitureAccentColor = isDiningItem
          ? isWarmWoodStyle
            ? itemPalette.wood
            : itemPalette.furnitureSoft
          : isWarmWoodStyle
            ? itemPalette.furnitureSoft
            : itemPalette.furnitureDark,
        furnitureRoleColors = {
          frame: furnitureFrameColor,
          fabric: furnitureFabricColor,
          surface: furnitureSurfaceColor,
          accent: furnitureAccentColor,
          shadow: isWarmWoodStyle ? itemPalette.woodDark : itemPalette.furnitureDark,
        };
      if (
        (!isWarmWoodStyle &&
          (detailItemType === "bed" ||
            isDiningItem ||
            ["coffeetable", "squarecoffeetable"].includes(detailItemType)) &&
          (furnitureRoleColors.frame = itemPalette.furnitureDark),
        !isWarmWoodStyle &&
          detailItemType === "bed" &&
          ((furnitureRoleColors.frame = itemPalette.furniture),
          (furnitureRoleColors.accent = itemPalette.furniture)),
        !isWarmWoodStyle &&
          detailItemType === "rounddiningtable_turntable" &&
          (furnitureRoleColors.surface = itemPalette.furniture),
        sofaFamilyItemTypes.has(detailItemType) &&
          ((furnitureRoleColors.fabric = isWarmWoodStyle
            ? itemPalette.wood
            : itemPalette.furniture),
          (furnitureRoleColors.surface = isWarmWoodStyle
            ? itemPalette.sofaFabric
            : itemPalette.furnitureSoft),
          (furnitureRoleColors.accent = isWarmWoodStyle
            ? itemPalette.furnitureSoft
            : itemPalette.furniture)),
        detailItemType === "vanity")
      ) {
        const vanityRoleColors = {
          frame: isWarmWoodStyle ? itemPalette.wood : itemPalette.furnitureDark,
          fabric: isWarmWoodStyle ? itemPalette.cabinetWood : itemPalette.furniture,
          shadow: isWarmWoodStyle ? itemPalette.woodDark : itemPalette.furnitureDark,
          surface: isWarmWoodStyle ? itemPalette.countertop : itemPalette.furnitureSoft,
          accent: itemPalette.glass,
        };
        return createPaletteMaterial(detailMaterial, (vanityRoleColors as any)[furnitureRole], {
          roughness: furnitureRole === "accent" ? 0.18 : 0.73,
          metalness: furnitureRole === "accent" ? 0.18 : 0,
          transparent: furnitureRole === "accent",
          opacity: furnitureRole === "accent" ? 0.42 : 1,
          depthWrite: furnitureRole !== "accent",
        });
      }
      const isSoftFurnitureRole =
        furnitureRole === "fabric" ||
        (isSofaFamilyItem && ["surface", "accent"].includes(furnitureRole));
      return createPaletteMaterial(
        detailMaterial,
        (furnitureRoleColors as any)[furnitureRole] ?? furnitureFrameColor,
        {
          roughness: isSoftFurnitureRole ? 0.94 : furnitureRole === "surface" ? 0.64 : 0.73,
          metalness: 0,
        },
      );
    }
    if (itemPalette.warmWood && detailItemType === "piano") {
      const pianoMaterialName = (detailMaterial.name || "").toLowerCase(),
        isGoldenPiano = pianoMaterialName.includes("金色"),
        pianoBaseColor = isGoldenPiano
          ? 12296558
          : pianoMaterialName.includes("color_009") || pianoMaterialName.includes("blinds_weave")
            ? 3423034
            : pianoMaterialName.includes("*1")
              ? 16315885
              : 9991250,
        pianoMaterial = createPaletteMaterial(detailMaterial, pianoBaseColor, {
          roughness: isGoldenPiano ? 0.4 : 0.55,
          metalness: isGoldenPiano ? 0.5 : 0,
        });
      return ((pianoMaterial.userData.plan2SurfaceContact = false), pianoMaterial);
    }
    if (
      ["storagewaterheater", "gaswaterheater"].includes(detailItemType) &&
      detailMaterial.name?.startsWith(detailItemType + "-detail-")
    ) {
      const heaterDetailRole = detailMaterial.name.split("-detail-")[1],
        heaterSoftColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft,
        heaterBodyColor = itemPalette.appliance ?? itemPalette.furniture,
        heaterDarkColor = itemPalette.applianceDark ?? itemPalette.furnitureDark;
      return createPaletteMaterial(
        detailMaterial,
        ({
          body: heaterSoftColor,
          panel: heaterDarkColor,
          recess: heaterDarkColor,
          trim: heaterBodyColor,
          control: heaterSoftColor,
        } as any)[heaterDetailRole] ?? heaterSoftColor,
        {
          roughness: 0.82,
          metalness: 0,
        },
      );
    }
    if (
      detailItemType === "robotvacuum" &&
      detailMaterial.name?.startsWith("robotvacuum-detail-")
    ) {
      const vacuumDetailRole = detailMaterial.name.split("-detail-")[1],
        vacuumBodyColor = itemPalette.appliance ?? itemPalette.furniture ?? 10134967,
        vacuumPanelColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft ?? 11911118,
        vacuumDarkColor = itemPalette.applianceDark ?? itemPalette.furnitureDark ?? 6845576,
        vacuumRoleColors = {
          body: vacuumBodyColor,
          panel: vacuumPanelColor,
          dark: new threeNamespace.Color(vacuumDarkColor).multiplyScalar(0.42),
          trim: vacuumDarkColor,
          indicator: vacuumPanelColor,
        };
      return createPaletteMaterial(
        detailMaterial,
        (vacuumRoleColors as any)[vacuumDetailRole] ?? vacuumBodyColor,
        {
          roughness: 0.82,
          metalness: 0,
          flatShading: false,
        },
      );
    }
    if (
      ["airpurifier", "floorac", "desktop", "laptop"].includes(detailItemType) &&
      detailMaterial.name?.includes("-detail-")
    ) {
      const applianceDetailRole = detailMaterial.name.split("-detail-")[1],
        appliancePanelColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft ?? 11911118,
        applianceDarkColor = itemPalette.applianceDark ?? itemPalette.furnitureDark ?? 6845576,
        applianceDetailRoleColors = {
          body: appliancePanelColor,
          panel: applianceDarkColor,
          recess: new threeNamespace.Color(applianceDarkColor).multiplyScalar(0.42),
          trim: itemPalette.appliance ?? appliancePanelColor,
          control: appliancePanelColor,
        };
      return createPaletteMaterial(
        detailMaterial,
        (applianceDetailRoleColors as any)[applianceDetailRole] ?? appliancePanelColor,
        {
          roughness: 0.82,
          metalness: 0,
        },
      );
    }
    if (detailItemType === "printer" && detailMaterial.name?.startsWith("printer-detail-")) {
      const printerDetailRole = detailMaterial.name.split("-detail-")[1],
        printerBodyColor = itemPalette.appliance ?? itemPalette.furniture,
        printerRoleColors = {
          body: printerBodyColor,
          panel: itemPalette.applianceSoft ?? itemPalette.furnitureSoft,
          recess: itemPalette.applianceDark ?? itemPalette.furnitureDark,
          paper: itemPalette.furnitureLight,
        };
      return createPaletteMaterial(
        detailMaterial,
        (printerRoleColors as any)[printerDetailRole] ?? printerBodyColor,
        {
          roughness: 0.82,
          metalness: 0,
        },
      );
    }
    if (detailItemType === "nas") {
      const nasMaterialIndex = Number((detailMaterial?.name || "").match(/material-(\d+)/)?.[1]),
        nasPanelColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft ?? 11911118,
        nasDarkColor = itemPalette.applianceDark ?? itemPalette.furnitureDark ?? 6845576,
        nasRecessColor = new threeNamespace.Color(nasDarkColor).multiplyScalar(0.48),
        nasRoleColorList = [
          nasPanelColor,
          nasDarkColor,
          nasRecessColor,
          itemPalette.appliance ?? nasPanelColor,
          8702858,
        ],
        nasRoleMaterial = createPaletteMaterial(
          detailMaterial,
          nasRoleColorList[nasMaterialIndex] ?? nasDarkColor,
          {
            roughness: 0.82,
            metalness: 0,
          },
        );
      return (
        nasMaterialIndex === 4 &&
          (nasRoleMaterial.emissive.set(6798195), (nasRoleMaterial.emissiveIntensity = 0.5)),
        nasRoleMaterial
      );
    }
    if (applianceItemTypes.has(detailItemType)) {
      const applianceMaterialName = (detailMaterial?.name || "").toLowerCase(),
        applianceBaseColor = detailMaterial?.color?.clone?.() || new threeNamespace.Color(16777215),
        applianceLuminance =
          applianceBaseColor.r * 0.2126 +
          applianceBaseColor.g * 0.7152 +
          applianceBaseColor.b * 0.0722,
        applianceMaterialIndex = applianceMaterialName.match(/material-(\d+)/)?.[1],
        applianceBodyColor = itemPalette.appliance ?? itemPalette.furniture,
        applianceSoftBodyColor = itemPalette.applianceSoft ?? itemPalette.furnitureSoft,
        applianceDarkBodyColor = itemPalette.applianceDark ?? itemPalette.furnitureDark,
        isTranslucentPanel =
          ["desktop", "laptop", "nas"].includes(detailItemType) && applianceMaterialIndex === "0",
        applianceResolvedColor =
          detailItemType === "walllamp"
            ? applianceMaterialIndex === "2"
              ? itemPalette.accent
              : applianceBodyColor
            : detailItemType === "floorlamp"
              ? itemPalette.floorLampBody
                ? applianceMaterialIndex === "3"
                  ? applianceSoftBodyColor
                  : itemPalette.floorLampBody
                : applianceBodyColor
              : detailItemType === "desktop"
                ? applianceMaterialIndex === "1"
                  ? applianceDarkBodyColor
                  : applianceSoftBodyColor
                : detailItemType === "laptop" && applianceMaterialIndex === "2"
                  ? applianceDarkBodyColor
                  : (detailItemType === "laptop" && applianceMaterialIndex === "1") ||
                      isTranslucentPanel
                    ? applianceSoftBodyColor
                    : detailItemType.startsWith("tv_")
                      ? applianceDarkBodyColor
                      : detailItemType === "pipelinewaterpurifier" ||
                          detailItemType === "tea_bar_machine"
                        ? applianceLuminance < 0.16
                          ? applianceBodyColor
                          : applianceSoftBodyColor
                        : applianceMaterialName.endsWith("-dark") || applianceLuminance < 0.16
                          ? applianceDarkBodyColor
                          : applianceMaterialName.endsWith("-soft") || applianceLuminance < 0.45
                            ? applianceSoftBodyColor
                            : applianceBodyColor,
        applianceRoleMaterial = createPaletteMaterial(detailMaterial, applianceResolvedColor, {
          roughness: 0.82,
          metalness: 0,
          flatShading: false,
        });
      return (
        ((detailItemType === "laptop" && applianceMaterialIndex === "2") ||
          (detailItemType === "nas" && ["2", "4"].includes(applianceMaterialIndex))) &&
          ((applianceRoleMaterial.polygonOffset = true),
          (applianceRoleMaterial.polygonOffsetFactor = -1),
          (applianceRoleMaterial.polygonOffsetUnits = -1)),
        detailItemType === "tea_bar_machine" &&
          ((applianceRoleMaterial.emissive = new threeNamespace.Color(0)),
          (applianceRoleMaterial.emissiveIntensity = 0)),
        applianceRoleMaterial
      );
    }
    if (warmWoodFurnitureItemTypes.has(detailItemType))
      return applyWarmWoodFurnitureMaterial(detailMaterial, itemPalette, detailItemType);
    if (detailItemType === "sofa") {
      const isSofaCushion = /cushion/i.test(detailMaterial?.name || "");
      return createPaletteMaterial(
        detailMaterial,
        isSofaCushion ? itemPalette.furnitureSoft : itemPalette.furniture,
        {
          roughness: 0.8,
          metalness: 0.01,
        },
      );
    }
    if (detailItemType === "elevator") {
      const isElevatorPanelMaterial = /Color_00[34]/i.test(detailMaterial?.name || ""),
        elevatorPanelColor = isElevatorPanelMaterial
          ? new threeNamespace.Color(itemPalette.wall)
          : new threeNamespace.Color(itemPalette.furniture);
      return createPaletteMaterial(
        detailMaterial,
        elevatorPanelColor,
        isElevatorPanelMaterial
          ? {
              roughness: 0.82,
              metalness: 0.01,
            }
          : {},
      );
    }
    if (detailItemType === "piano") {
      const pianoName = (detailMaterial?.name || "").toLowerCase(),
        pianoColor = pianoName.includes("color_009")
          ? itemPalette.furnitureDark
          : pianoName.includes("blinds_weave") ||
              pianoName.includes("金色") ||
              pianoName.includes("*1")
            ? itemPalette.furnitureSoft
            : itemPalette.furniture,
        pianoSurfaceMaterial = new threeNamespace.MeshStandardMaterial({
          color: pianoColor,
          roughness: 0.72,
          metalness: 0.06,
          emissive: pianoColor,
          emissiveIntensity: 0.08,
          side: detailMaterial?.side ?? threeNamespace.FrontSide,
          transparent: false,
          opacity: 1,
          depthWrite: detailMaterial?.depthWrite ?? true,
          depthTest: detailMaterial?.depthTest ?? true,
          toneMapped: true,
        });
      return (
        (pianoSurfaceMaterial.userData.plan2SurfaceContact = false),
        (pianoSurfaceMaterial.name =
          (detailMaterial?.name || "piano") + " · HomeOS furniture palette"),
        pianoSurfaceMaterial
      );
    }
    return stairItemTypes.has(detailItemType)
      ? applyStairMaterial(detailMaterial, itemPalette, detailItemType)
      : applyDefaultPaletteMaterial(detailMaterial, itemPalette);
  }
  function smoothGeometryNormals(sourceGeometry: any) {
    const clonedGeometry = sourceGeometry?.clone?.();
    return clonedGeometry?.computeVertexNormals
      ? (clonedGeometry.computeVertexNormals(),
        clonedGeometry.attributes?.normal && (clonedGeometry.attributes.normal.needsUpdate = true),
        clonedGeometry.computeBoundingBox?.(),
        clonedGeometry.computeBoundingSphere?.(),
        clonedGeometry)
      : sourceGeometry;
  }
  function collectVertexSet(geometry: any, materialIndex: any = null) {
    const vertexIndices = new Set(),
      positionAttribute = geometry?.attributes?.position;
    if (!positionAttribute) return vertexIndices;
    const indexAttribute = geometry.index,
      matchingGroups = Number.isInteger(materialIndex)
        ? (geometry.groups || []).filter(
            (geometryGroup: any) => geometryGroup.materialIndex === materialIndex,
          )
        : [];
    if (matchingGroups.length)
      for (const geometryGroupEntry of matchingGroups) {
        const groupEndIndex = geometryGroupEntry.start + geometryGroupEntry.count;
        for (
          let vertexIndex = geometryGroupEntry.start;
          vertexIndex < groupEndIndex;
          vertexIndex += 1
        )
          vertexIndices.add(indexAttribute ? indexAttribute.getX(vertexIndex) : vertexIndex);
      }
    else {
      if (materialIndex === null) {
        for (
          let sequentialVertexIndex = 0;
          sequentialVertexIndex < positionAttribute.count;
          sequentialVertexIndex += 1
        )
          vertexIndices.add(sequentialVertexIndex);
      }
    }
    return vertexIndices;
  }
  function measureYRange(geometryAttribute: any, vertexIndexIterable: any) {
    let minY = Infinity,
      maxY = -Infinity;
    for (const measuredVertexIndex of vertexIndexIterable) {
      const vertexY = geometryAttribute.getY(measuredVertexIndex);
      ((minY = Math.min(minY, vertexY)), (maxY = Math.max(maxY, vertexY)));
    }
    return {
      min: minY,
      max: maxY,
    };
  }
  function alignLaptopScreenGeometry(
    screenGeometry: any,
    screenSourceGeometry: any,
    screenMaterialIndex: any = null,
    sourceMaterialIndex: any = null,
  ) {
    if (!screenGeometry?.attributes?.position) return screenGeometry;
    const screenPositionAttribute = screenGeometry.attributes.position,
      screenVertexIndices = collectVertexSet(screenGeometry, screenMaterialIndex);
    if (!screenVertexIndices.size) return screenGeometry;
    const { min: screenMinY, max: screenMaxY } = measureYRange(
      screenPositionAttribute,
      screenVertexIndices,
    );
    if (
      !Number.isFinite(screenMinY) ||
      !Number.isFinite(screenMaxY) ||
      screenMaxY - screenMinY < 0.001
    )
      return screenGeometry;
    const sourcePositionAttribute = screenSourceGeometry?.attributes?.position,
      sourceVertexIndices = collectVertexSet(screenSourceGeometry, sourceMaterialIndex);
    if (!sourcePositionAttribute || !sourceVertexIndices.size) return screenGeometry;
    const sourceYRange = measureYRange(sourcePositionAttribute, sourceVertexIndices);
    if (!Number.isFinite(sourceYRange.min) || !Number.isFinite(sourceYRange.max))
      return screenGeometry;
    const midY = (sourceYRange.min + sourceYRange.max) / 2;
    let lowerVertex: any = null,
      upperVertex: any = null;
    for (const vertexLoopIndex of sourceVertexIndices) {
      const vertexPosition = {
        y: sourcePositionAttribute.getY(vertexLoopIndex),
        z: sourcePositionAttribute.getZ(vertexLoopIndex),
      };
      (vertexPosition.y <= midY &&
        (!lowerVertex || vertexPosition.z > lowerVertex.z) &&
        (lowerVertex = vertexPosition),
        vertexPosition.y > midY &&
          (!upperVertex || vertexPosition.z > upperVertex.z) &&
          (upperVertex = vertexPosition));
    }
    if (!lowerVertex || !upperVertex || upperVertex.y - lowerVertex.y < 0.001)
      return screenGeometry;
    const screenHeight = upperVertex.y - lowerVertex.y,
      lowerY = lowerVertex.y + screenHeight * 0.04,
      upperY = upperVertex.y - screenHeight * 0.07,
      screenHeightRange = screenMaxY - screenMinY;
    let minZ = Infinity,
      maxZ = -Infinity;
    for (const zVertexIndex of screenVertexIndices) {
      const vertexZ = screenPositionAttribute.getZ(zVertexIndex);
      ((minZ = Math.min(minZ, vertexZ)), (maxZ = Math.max(maxZ, vertexZ)));
    }
    const zRange = Math.max(maxZ - minZ, 0.001),
      zInset = Math.min(zRange, screenHeight * 0.022),
      zOffset = screenHeight * 0.008,
      alignedGeometry = screenGeometry.clone?.();
    if (!alignedGeometry?.attributes?.position) return screenGeometry;
    const alignedPositionAttribute = alignedGeometry.attributes.position;
    for (const alignVertexIndex of screenVertexIndices) {
      const alignVertexY = screenPositionAttribute.getY(alignVertexIndex),
        alignedY = lowerY + ((alignVertexY - screenMinY) / screenHeightRange) * (upperY - lowerY),
        alignedZ =
          lowerVertex.z +
          ((alignedY - lowerVertex.y) / screenHeight) * (upperVertex.z - lowerVertex.z) +
          zOffset,
        zRatio = (screenPositionAttribute.getZ(alignVertexIndex) - minZ) / zRange;
      (alignedPositionAttribute.setY(alignVertexIndex, alignedY),
        alignedPositionAttribute.setZ(alignVertexIndex, alignedZ - zInset * (1 - zRatio)));
    }
    return (
      (alignedPositionAttribute.needsUpdate = true),
      alignedGeometry.computeVertexNormals?.(),
      alignedGeometry.computeBoundingBox?.(),
      alignedGeometry.computeBoundingSphere?.(),
      alignedGeometry
    );
  }
  const TEXTURE_MAP_PROPERTY_NAMES = Object.freeze([
      "alphaMap",
      "anisotropyMap",
      "aoMap",
      "bumpMap",
      "clearcoatMap",
      "clearcoatNormalMap",
      "clearcoatRoughnessMap",
      "displacementMap",
      "emissiveMap",
      "envMap",
      "gradientMap",
      "iridescenceMap",
      "iridescenceThicknessMap",
      "lightMap",
      "map",
      "matcap",
      "metalnessMap",
      "normalMap",
      "roughnessMap",
      "sheenColorMap",
      "sheenRoughnessMap",
      "specularColorMap",
      "specularIntensityMap",
      "thicknessMap",
      "transmissionMap",
    ]),
    MATERIAL_PROPERTY_NAMES = Object.freeze([
      "alphaHash",
      "alphaTest",
      "alphaToCoverage",
      "anisotropy",
      "aoMapIntensity",
      "attenuationColor",
      "attenuationDistance",
      "blendAlpha",
      "blendColor",
      "blendDst",
      "blendDstAlpha",
      "blendEquation",
      "blendEquationAlpha",
      "blending",
      "blendSrc",
      "blendSrcAlpha",
      "bumpScale",
      "clearcoat",
      "clearcoatNormalScale",
      "clearcoatRoughness",
      "clipIntersection",
      "clipShadows",
      "color",
      "colorWrite",
      "depthFunc",
      "depthTest",
      "depthWrite",
      "displacementBias",
      "displacementScale",
      "dithering",
      "emissive",
      "emissiveIntensity",
      "envMapIntensity",
      "flatShading",
      "fog",
      "forceSinglePass",
      "ior",
      "iridescence",
      "iridescenceIOR",
      "iridescenceThicknessRange",
      "lightMapIntensity",
      "metalness",
      "normalMapType",
      "normalScale",
      "opacity",
      "polygonOffset",
      "polygonOffsetFactor",
      "polygonOffsetUnits",
      "precision",
      "premultipliedAlpha",
      "reflectivity",
      "refractionRatio",
      "roughness",
      "shadowSide",
      "sheen",
      "sheenColor",
      "sheenRoughness",
      "side",
      "specularColor",
      "specularIntensity",
      "stencilFail",
      "stencilFunc",
      "stencilFuncMask",
      "stencilRef",
      "stencilWrite",
      "stencilWriteMask",
      "stencilZFail",
      "stencilZPass",
      "thickness",
      "toneMapped",
      "transmission",
      /**
       * 半透明开关本身：配墙的柱体是 `transparent + opacity` 一起改的，
       * 只签 `opacity` 会让「透明 0.59」与「不透明 0.59」共用同一份材质。
       */
      "transparent",
      "vertexColors",
      "visible",
      "wireframe",
      "wireframeLinecap",
      "wireframeLinejoin",
      "wireframeLinewidth",
    ]);
/**
 * 把模板里的材质名换回**旧名**（只在别名表命中时）。
 *
 * 背景：GLB 槽位按契约改名后，本文件下游 30 处历史分支仍按旧名/下标取色
 * （`material-<n>`、`M03_Pewter_Shine`、`B-1`、`cabinet-material-0`…），
 * 别名表 `legacy-material-aliases.generated.ts` 与改名同源生成。这里在模板入库前
 * 单点归一，所有读取点（取色分支 / 车辆收尾 / 检查面板）看到的都是旧名，
 * 行为与改名前一模一样；别名表为空时这是 no-op。
 *
 * 注意：这里**只**处理有别名（真正改过名）的材质，未改名模型连大小写都不动。
 */
function normalizeTemplateSlotNames(templateScene: any, itemType: string): void {
  templateScene?.traverse?.((node: any) => {
    if (!node?.material) return;
    const materials = Array.isArray(node.material) ? node.material : [node.material];
    for (const material of materials) {
      const legacy = legacyExternalMaterialName(material?.name, itemType);
      if (legacy && legacy !== material.name) material.name = legacy;
    }
  });
}

/** 普通字面量对象（调色板 / 覆盖表这类）：交给签名函数逐键展开。 */
function isPlainRecord(recordValue: any): boolean {
  if (!recordValue || typeof recordValue != "object" || Array.isArray(recordValue)) return false;
  const recordPrototype = Object.getPrototypeOf(recordValue);
  return recordPrototype === Object.prototype || recordPrototype === null;
}
function normalizeMaterialValue(materialValue: any): any {
    return materialValue === undefined
      ? "undefined"
      : materialValue === null
        ? null
        : typeof materialValue == "number"
          ? Number.isNaN(materialValue)
            ? "NaN"
            : Number.isFinite(materialValue)
              ? Object.is(materialValue, -0)
                ? 0
                : materialValue
              : materialValue > 0
                ? "Infinity"
                : "-Infinity"
          : ["string", "boolean"].includes(typeof materialValue)
            ? materialValue
            : materialValue.isTexture
              ? ["texture", materialValue.uuid ?? materialValue.id ?? "anonymous"]
              : materialValue.isColor
                ? [materialValue.r, materialValue.g, materialValue.b]
                : Array.isArray(materialValue)
                  ? materialValue.map(normalizeMaterialValue)
                  : typeof materialValue.toArray == "function"
                    ? materialValue.toArray().map(normalizeMaterialValue)
                    : ["x", "y", "z", "w"].some(
                          (axisName) => typeof materialValue[axisName] == "number",
                        )
                      ? [materialValue.x, materialValue.y, materialValue.z, materialValue.w].map(
                          normalizeMaterialValue,
                        )
                      : isPlainRecord(materialValue)
                        ?

                          Object.keys(materialValue)
                            .sort()
                            .map((recordKey) => [
                              recordKey,
                              normalizeMaterialValue(materialValue[recordKey]),
                            ])
                        : String(materialValue);
  }
  function materialSignature(materialToSign: any) {
    if (materialToSign?.isShaderMaterial || materialToSign?.isRawShaderMaterial)
      return JSON.stringify([
        materialToSign.type || "ShaderMaterial",
        "unique",
        materialToSign.uuid || materialToSign.id,
      ]);
    const customProgramKey =
      typeof materialToSign?.customProgramCacheKey == "function"
        ? materialToSign.customProgramCacheKey()
        : "";
    return JSON.stringify([
      materialToSign?.type || materialToSign?.constructor?.name || "Material",
      customProgramKey,
      materialToSign?.userData?.plan2SurfaceContact !== false,
      materialToSign?.userData?.plan2SurfaceSlope === true,
      MATERIAL_PROPERTY_NAMES.map((propertyName) => [
        propertyName,
        normalizeMaterialValue(materialToSign?.[propertyName]),
      ]),
      TEXTURE_MAP_PROPERTY_NAMES.map((texturePropertyName) => [
        texturePropertyName,
        normalizeMaterialValue(materialToSign?.[texturePropertyName]),
      ]),
    ]);
  }
  function optionsSignature(optionsObject: any) {
    return JSON.stringify(
      Object.keys(optionsObject)
        .sort()
        .map((optionName) => [optionName, normalizeMaterialValue(optionsObject[optionName])]),
    );
  }
  /** 该（模型，材质名）是否走 `applyItemDetailMaterial` 的调色板 / 角色表出图。 */
  function usesDetailMaterialPipeline(itemType: any, materialName: any, palette: any) {
    // 判定本身放在 `materials/material-pipeline.ts`：审计 / 修复脚本要判「GLB 里的 PBR
    // 数值会不会被读」，必须与运行时同源，不能各写一份（`coffeetable` 就是被两份逻辑
    // 判岔了：脚本以为要回填，运行时其实整块重建）。
    return sharedUsesDetailMaterialPipeline(itemType, materialName, Boolean(palette?.warmWood));
  }
  /**
   * 净化器 / 立柜空调的**导引面**：整块网格只挂一张 `*-material-2|3`，挂载时会被隐藏。
   *
   * 2026-10-23 回滚备注：实测原始件（`airpurifier-detail-*` / `floorac-detail-*`）没有任何
   * 独立导引面 —— 5 个 primitive 分别是机身 / 面板 / 凹陷 / 收边 / 控制屏，都有实体几何。
   * 这段分支只对「导出器把材质改成 `material-<n>` 且拆出单独导引件」的模型有意义，
   * 不能改成按 `recess` 角色判定（那会把真实的凹陷面整块隐藏）。保留原逻辑。
   */
  function isHiddenApplianceGuideMesh(modelType: any, meshMaterials: any) {
    return (
      (modelType === "airpurifier" || modelType === "floorac") &&
      meshMaterials.every(
        (guideMaterial: any) =>
          guideMaterial?.name ===
          modelType + "-material-" + (modelType === "airpurifier" ? 3 : 2),
      )
    );
  }
  /** 取某个材质名上的**逐物件覆盖色**（`item.materialOverrides`）。 */
  function materialOverrideColorFor(palette: any, materialName: any) {
    const overridePalette = palette?.materialOverrides;
    if (!materialName || !overridePalette || typeof overridePalette != "object") return null;
    const overrideColor = overridePalette[materialName];
    return typeof overrideColor == "string" && /^#[0-9a-f]{6}$/i.test(overrideColor)
      ? overrideColor.toLowerCase()
      : null;
  }
  function applyMaterialOverride(resolvedMaterial: any, materialName: any, palette: any) {
    const overrideColor = materialOverrideColorFor(palette, materialName);
    if (!overrideColor || !resolvedMaterial?.color) return resolvedMaterial;
    // 图集槽位不吃逐物件覆盖色：颜色由整张 UV 图集提供，覆盖上去只会把车漆、
    // 玻璃、尾灯一起涂成一块纯色（历史数据里残留的覆盖色也一并失效）。
    if (materialHasAtlas(resolvedMaterial)) return resolvedMaterial;
    const previousColorHex = resolvedMaterial.color.getHex();


    resolvedMaterial.emissive?.isColor &&
      resolvedMaterial.emissive.getHex() === previousColorHex &&
      resolvedMaterial.emissive.set(overrideColor);
    resolvedMaterial.color.set(overrideColor);
    return resolvedMaterial;
  }
  /** 取某个材质名上的**逐槽表面覆盖**（`item.materialSurfaceOverrides`）。 */
  function materialSurfaceOverrideFor(palette: any, materialName: any) {
    const surfaceOverridePalette = palette?.materialSurfaceOverrides;
    if (!materialName || !surfaceOverridePalette || typeof surfaceOverridePalette != "object")
      return null;
    const surfaceOverride = surfaceOverridePalette[materialName];
    if (!surfaceOverride || typeof surfaceOverride != "object") return null;
    const roughness = normalizeSurfaceOverrideValue(surfaceOverride.roughness),
      metalness = normalizeSurfaceOverrideValue(surfaceOverride.metalness);
    return roughness === null && metalness === null ? null : { roughness, metalness };
  }
  function normalizeSurfaceOverrideValue(surfaceValue: any) {
    return typeof surfaceValue == "number" && Number.isFinite(surfaceValue)
      ? Math.min(1, Math.max(0, surfaceValue))
      : null;
  }
  function applyMaterialSurfaceOverride(resolvedMaterial: any, materialName: any, palette: any) {
    const surfaceOverride = materialSurfaceOverrideFor(palette, materialName);
    if (!surfaceOverride || !resolvedMaterial) return resolvedMaterial;
    surfaceOverride.roughness !== null && (resolvedMaterial.roughness = surfaceOverride.roughness);
    surfaceOverride.metalness !== null && (resolvedMaterial.metalness = surfaceOverride.metalness);
    return resolvedMaterial;
  }
  /**
   * 共享程序化**细节（bump）图**（审计 M3 的 S1 策略，见
   * `materials/studio-surface-normal-maps.ts`）。
   *
   * 表面族来自角色配方（`surface`），细节强度按族取 `SURFACE_DETAIL_SCALE` ——
   * 与审计报告同一张表，所以「审计说缺细节」和「运行时挂没挂」不会各说各话。
   * 只在最后一手挂：颜色 / 粗糙度 / 档位配方都算完了，细节不参与取色，
   * 不会影响 30 处历史分支。
   *
   * 2026-10-24：从 `normalMap` 换成 `bumpMap` —— three 的 `normalMap` 没有屏幕
   * 导数滤波，按米平铺的高频假细节在大平板上会缩成一层层波浪条带（电梯门 / 衣柜门 /
   * 餐边柜侧板 / 2m 出风口）；`bumpMap` 走 `dFdx`/`dFdy`，扰动幅度跟着 mip 一起
   * 收敛，条带消失。旧的 `normalMap` 必须**显式清空**，防止模板 / 缓存里残留双份扰动。
   */
  function applySurfaceDetailFinish(
    targetMaterial: any,
    materialName: any,
    itemType: any,
    palette: any,
  ) {
    if (!targetMaterial?.isMeshStandardMaterial) return targetMaterial;
    // 图集 / 石材板自带整块贴图与专属 UV 布局：再叠一张按米平铺的细节图会错位。
    if (targetMaterial.map?.isTexture) return targetMaterial;
    // 半透明件（玻璃 / 纱帘）先不挂：细节在透射里收益很低，还会干扰 reflection pass。
    if (targetMaterial.transparent || targetMaterial.opacity < 1) return targetMaterial;
    const materialRole = resolveModelMaterialRole(itemType, materialName)?.role;
    if (!materialRole) return targetMaterial;
    const roleRecipe = materialRoleRecipeForRole(itemType, materialRole, palette);
    const surface = roleRecipe?.surface;
    /**
     * 各向异性必须跟着渲染器的上限走（与石材板 / 图集贴图一致，见 `createStoneSlabTexture`）。
     *
     * 默认值 1 会让 `metal` 那种「10 条纹 / 0.4m」的细节图在掠射角度直接欠采样：
     * 风口、油烟机这类大平板本来就是斜着看的，细节会拍成一条条来回摆的波纹
     * （2026-10-24 的「出风口显示怪纹」就是这个），而不是细腻的金属表面。
     */
    const detailTexture = createSurfaceDetailTexture(
      threeNamespace,
      surface,
      SURFACE_DETAIL_ANISOTROPY,
    );
    /** 槽位可以按倍数收口（0 = 不挂）：大平板钣金件不参与「按米平铺」的程序化细节。 */
    const detailScaleMultiplier =
      roleRecipe?.surfaceDetailScale ?? roleRecipe?.surfaceNormalScale ?? 1;
    const detailStrength = surface ? SURFACE_DETAIL_SCALE[surface] * detailScaleMultiplier : 0;
    // 无论挂不挂，都先清掉可能残留的旧法线（模板复用 / 旧缓存 / 旧草稿）。
    targetMaterial.normalMap = null;
    targetMaterial.normalScale?.set?.(0, 0);
    if (!detailTexture || !detailStrength) {
      targetMaterial.bumpMap = null;
      targetMaterial.needsUpdate = true;
      return targetMaterial;
    }
    targetMaterial.bumpMap = detailTexture;
    targetMaterial.bumpScale = detailStrength * SURFACE_DETAIL_BUMP_UNIT;
    targetMaterial.userData = {
      ...(targetMaterial.userData || {}),
      homeosSurfaceDetail: surface,
    };
    targetMaterial.needsUpdate = true;
    return targetMaterial;
  }
  /** 石材板贴图：整块石材按**一张整图**贴到板面上（配合装载期补的平面 UV，见`applyStoneSlabPlanarUv`）。 */
  const stoneSlabTextureByFlavor = new Map();
  function stoneSlabTextureFor(flavor: any) {
    if (!stoneSlabTextureByFlavor.has(flavor)) {

      const slabTexture = createStoneSlabTexture(threeNamespace, flavor, 8)?.clone?.() ?? null;
      slabTexture &&
        ((slabTexture.wrapS = threeNamespace.RepeatWrapping),
        (slabTexture.wrapT = threeNamespace.RepeatWrapping),
        (slabTexture.needsUpdate = true));
      stoneSlabTextureByFlavor.set(flavor, slabTexture);
    }
    return stoneSlabTextureByFlavor.get(flavor);
  }
  /** 把某槽位按「石材板」或「非石材板」收口。 */
  function applyStoneSlabFinish(slabMaterial: any, flavor: any) {
    if (!slabMaterial) return slabMaterial;
    const isSlab = isStoneSlabFlavor(flavor),
      wasSlab = isStoneSlabFlavor(slabMaterial.userData?.homeosStoneSlab);

    if (!isSlab && !wasSlab) return slabMaterial;
    const previousTexture = slabMaterial.map;
    if (isSlab) {
      const slabTexture = stoneSlabTextureFor(flavor);
      if (slabTexture) slabMaterial.map = slabTexture;
      const slabFinish = stoneSlabSurfaceFinish(flavor);
      slabFinish &&
        ((slabMaterial.roughness = slabFinish.roughness),
        (slabMaterial.metalness = slabFinish.metalness));
      slabMaterial.userData && (slabMaterial.userData.homeosStoneSlab = flavor);
    } else {
      slabMaterial.map = null;
      delete slabMaterial.userData?.homeosStoneSlab;
    }
    if (previousTexture !== slabMaterial.map) slabMaterial.needsUpdate = true;
    return slabMaterial;
  }
  /** 某槽位的石材板色号：只认**显式声明**（角色表或档位配方），不按槽位号猜。 */
  function stoneSlabFlavorFor(palette: any, itemType: any, materialName: any, materialIndex = 0) {
    const styleRecipe = materialStyleRecipeFor(itemType, materialName, palette, materialIndex);


    return styleRecipe
      ? (isStoneSlabFlavor(styleRecipe.slab) ? styleRecipe.slab : null)
      : stoneSlabFlavorForMaterial(itemType, materialName, materialIndex);
  }
  /** 逐物件「材质风格」档位（`item.materialStyle`）的最后一手，**紧挨在逐槽覆盖色之前**：· 档位 = 整套角色换料，所以它要盖住家族底表 / 模型专用配方 / 暖木收尾算出来的颜色； */
  function applyMaterialStyleRecipe(resolvedMaterial: any, materialName: any, itemType: any, palette: any) {
    const styleRecipe = materialStyleRecipeFor(itemType, materialName, palette);
    if (!styleRecipe || !resolvedMaterial) return resolvedMaterial;
    if (styleRecipe.colorValue !== undefined && resolvedMaterial.color?.setHex) {
      const previousColorHex = resolvedMaterial.color.getHex();
      resolvedMaterial.color.setHex(styleRecipe.colorValue);

      resolvedMaterial.emissive?.isColor &&
        resolvedMaterial.emissive.getHex() === previousColorHex &&
        resolvedMaterial.emissive.setHex(styleRecipe.colorValue);
    }
    if (styleRecipe.emissiveValue !== undefined && resolvedMaterial.emissive?.setHex) {
      resolvedMaterial.emissive.setHex(styleRecipe.emissiveValue);
      resolvedMaterial.emissiveIntensity = styleRecipe.emissiveIntensity ?? 0.5;
    }
    styleRecipe.roughness !== undefined && (resolvedMaterial.roughness = styleRecipe.roughness);
    styleRecipe.metalness !== undefined && (resolvedMaterial.metalness = styleRecipe.metalness);
    styleRecipe.transparent !== undefined && (resolvedMaterial.transparent = styleRecipe.transparent);
    styleRecipe.opacity !== undefined && (resolvedMaterial.opacity = styleRecipe.opacity);
    styleRecipe.depthWrite !== undefined && (resolvedMaterial.depthWrite = styleRecipe.depthWrite);
    if (
      styleRecipe.flatShading !== undefined &&
      resolvedMaterial.flatShading !== styleRecipe.flatShading
    ) {
      ((resolvedMaterial.flatShading = styleRecipe.flatShading),
        (resolvedMaterial.needsUpdate = true));
    }
    styleRecipe.fabricLike &&
      resolvedMaterial.userData &&
      (resolvedMaterial.userData.warmDiningFabric = true);


    applyStoneSlabFinish(
      resolvedMaterial,
      isStoneSlabFlavor(styleRecipe.slab) ? styleRecipe.slab : null,
    );
    return resolvedMaterial;
  }
  function resolveSharedMaterial(sourceMaterial: any, palette: any, itemType: any, styleKey: any, partKey = "") {
    if (!sourceMaterial) return sourceMaterial;
    let variantCacheByStyle = materialVariantsBySource.get(sourceMaterial);
    variantCacheByStyle ||
      ((variantCacheByStyle = new Map()),
      materialVariantsBySource.set(sourceMaterial, variantCacheByStyle));
    const sourceSignature = JSON.stringify([
        sourceMaterial.version,
        sourceMaterial.name,
        normalizeMaterialValue(sourceMaterial.color),
        sourceMaterial.side,
        sourceMaterial.transparent,
        sourceMaterial.opacity,
        sourceMaterial.depthWrite,
        sourceMaterial.depthTest,
      ]),
      variantCacheKey = partKey ? itemType + ":" + partKey : itemType,
      cachedVariant = variantCacheByStyle.get(variantCacheKey);
    if (cachedVariant?.styleKey === styleKey && cachedVariant.sourceKey === sourceSignature)
      return ((materialReuseCount += 1), cachedVariant.material);
    const resolvedMaterial =
      usesDetailMaterialPipeline(itemType, sourceMaterial.name, palette)
        ? applyItemDetailMaterial(sourceMaterial, palette, itemType)
        : sourceMaterial.clone?.() || sourceMaterial;


    applyStoneSlabFinish(resolvedMaterial, stoneSlabFlavorForMaterial(itemType, sourceMaterial.name));
    if (
      (palette.warmWood &&
        !(DECOR_MODELS as any)[itemType] &&
        resolvedMaterial.color &&
        !resolvedMaterial.transparent &&
        /**
         * 「跟随墙体」的构件（柱体的配墙档）已经按墙体自身的 0.30/0.32 自发光标定过，
         * 这里再统一压到 0.065 会把它重新变成「比墙暗一档」—— 正好抵消配墙的效果。
         */
        !resolvedMaterial.userData?.homeosWallFollow &&
        !(itemType === "nas" && /^nas-material-4(?:$|\s)/.test(sourceMaterial.name || "")) &&


        !stoneSlabFlavorFor(palette, itemType, sourceMaterial.name) &&
        ((resolvedMaterial.emissive = resolvedMaterial.color.clone()),
        (resolvedMaterial.emissiveIntensity =
          itemType.startsWith("curtain_") &&
          ["1", "2", "3", "5"].includes((sourceMaterial.name || "").match(/material-(\d+)/)?.[1])
            ? 0.38
            : sofaFamilyItemTypes.has(itemType) || ["bed", "rug", "chair"].includes(itemType)
              ? 0.12
              : 0.065)),
      palette.warmWood && itemType === "stairs")
    ) {
      const isFloorTreadMaterial = /(?:material-1|-soft)$/.test(sourceMaterial.name || "");
      (resolvedMaterial.color?.set?.(isFloorTreadMaterial ? palette.floor : palette.floorEdge),
        resolvedMaterial.emissive?.copy?.(resolvedMaterial.color),
        (resolvedMaterial.metalness = 0),
        isFloorTreadMaterial &&
          (decorateWarmFloor(resolvedMaterial, palette),
          (resolvedMaterial.userData.warmFloorTread = true)));
    }
    (resolvedMaterial.userData?.warmFloorTread && (resolvedMaterial.emissiveIntensity = 0.075),
      resolvedMaterial.userData?.warmDiningMaterial &&
        (resolvedMaterial.emissiveIntensity = resolvedMaterial.userData.warmDiningFabric
          ? 0.1
          : 0.05));
    const cabinetDoorMaterialIndex = ({
      sideboard: "3",
      shoecabinet: "4",
      wallcabinet: "3",
      kitchenbase: "3",
      kitchensink: "7",
      kitchencooktop: "4",
    } as any)[itemType],
      /** 储物柜（`cabinet.glb`）是唯一把**柜体与两扇柜门并进同一个闭合箱**的柜类：整个1.60×1.90×0.45 的箱体就是 `cabinet-material-0`，正脸那 ±z 两面是柜门面（拉手装在这面上），顶 / 侧 / 底 / 背也是这一支料 —— 它没有独立柜体槽。 */
      isStyledCabinetDoorMaterial =
        itemType === "cabinet" &&
        palette.materialStyle !== undefined &&
        (sourceMaterial.name || "").endsWith("cabinet-material-0");
    if (
      (palette.warmWood &&
        cabinetDoorMaterialIndex !== undefined &&
        (sourceMaterial.name || "").endsWith("material-" + cabinetDoorMaterialIndex)) ||
      isStyledCabinetDoorMaterial
    ) {
      const styledCabinetBodyColorValue = isStyledCabinetDoorMaterial
          ? materialStyleRoleColorFor("cabinet", "body", palette)
          : undefined,
        doorEdgeColor =
          styledCabinetBodyColorValue !== undefined
            ? new threeNamespace.Color(styledCabinetBodyColorValue)
            : ["sideboard", "shoecabinet", "wallcabinet"].includes(itemType)
              ? new threeNamespace.Color(palette.woodDark ?? palette.furnitureDark)
              : null;
      ((resolvedMaterial.onBeforeCompile = (shaderProgram: any) => {
        ((shaderProgram.vertexShader = shaderProgram.vertexShader
          .replace("#include <common>", "#include <common>\nvarying float warmDoorFace;")
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nwarmDoorFace = abs(normal.z);",
          )),
          doorEdgeColor
            ? ((shaderProgram.uniforms.warmDoorEdgeColor = {
                value: doorEdgeColor,
              }),
              (shaderProgram.fragmentShader = shaderProgram.fragmentShader
                .replace(
                  "#include <common>",
                  "#include <common>\nvarying float warmDoorFace;\nuniform vec3 warmDoorEdgeColor;",
                )
                .replace(
                  "#include <color_fragment>",
                  "#include <color_fragment>\nif (warmDoorFace < 0.85) diffuseColor.rgb = warmDoorEdgeColor;",
                )
                .replace(
                  "#include <emissivemap_fragment>",
                  "#include <emissivemap_fragment>\nif (warmDoorFace < 0.85) totalEmissiveRadiance = warmDoorEdgeColor * 0.065;",
                )))
            : (shaderProgram.fragmentShader = shaderProgram.fragmentShader
                .replace("#include <common>", "#include <common>\nvarying float warmDoorFace;")
                .replace(
                  "#include <color_fragment>",
                  "#include <color_fragment>\ndiffuseColor.rgb *= mix(0.70, 1.0, smoothstep(0.45, 0.85, warmDoorFace));",
                )));
      }),
        (resolvedMaterial.customProgramCacheKey = () =>
          doorEdgeColor
            ? "warm-cabinet-door-returns-v2-" + doorEdgeColor.getHexString()
            : "warm-cabinet-door-returns-v1"),
        doorEdgeColor && (resolvedMaterial.userData.warmCabinetDoorReturns = true));
    }
    if (
      palette.warmWood &&
      itemType === "shoecabinet" &&
      /material-3$/.test(sourceMaterial.name || "")
    ) {
      const shoeTopColor = new threeNamespace.Color(palette.countertop);
      ((resolvedMaterial.onBeforeCompile = (shoeShaderProgram: any) => {
        ((shoeShaderProgram.uniforms.warmShoeTopColor = {
          value: shoeTopColor,
        }),
          (shoeShaderProgram.vertexShader = shoeShaderProgram.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 warmShoePosition;")
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nwarmShoePosition = position;",
            )),
          (shoeShaderProgram.fragmentShader = shoeShaderProgram.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 warmShoePosition;\nuniform vec3 warmShoeTopColor;",
            )
            .replace(
              "#include <color_fragment>",
              "#include <color_fragment>\nfloat warmShoeTop = step(-0.002, warmShoePosition.x) * step(0.932, warmShoePosition.y) * (1.0 - step(0.970, warmShoePosition.y));\ndiffuseColor.rgb = mix(diffuseColor.rgb, warmShoeTopColor, warmShoeTop);",
            )
            .replace(
              "#include <emissivemap_fragment>",
              "#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, warmShoeTopColor * 0.065, warmShoeTop);",
            )));
      }),
        (resolvedMaterial.customProgramCacheKey = () =>
          "warm-shoe-countertop-v1-" + shoeTopColor.getHexString()));
    }
    /**
     * 床品「搭毯」支料：按角色判定，不认死 `material-1`。
     * 原始件是 `bed-furniture-fabric`（角色 fabric / 槽位 1），上一轮重建件是
     * `bed-material-1`，两种命名都要命中，否则暖木主题的床尾毯会静默失效。
     */
    const bedRunnerSlot = itemType === "bed" ? resolveModelMaterialRole("bed", sourceMaterial.name) : null;
    if (
      palette.warmWood &&
      bedRunnerSlot &&
      (bedRunnerSlot.role === "fabric" || bedRunnerSlot.role === "upholstery" || bedRunnerSlot.slot === 1)
    ) {
      const bedRunnerColor = new threeNamespace.Color(palette.runnerColor ?? palette.furnitureSoft);
      ((resolvedMaterial.roughness = 0.94),
        (resolvedMaterial.onBeforeCompile = (bedShaderProgram: any) => {
          ((bedShaderProgram.uniforms.warmBedRunner = {
            value: bedRunnerColor,
          }),
            (bedShaderProgram.vertexShader = bedShaderProgram.vertexShader
              .replace("#include <common>", "#include <common>\nvarying float warmBedZ;")
              .replace(
                "#include <begin_vertex>",
                "#include <begin_vertex>\nwarmBedZ = position.z;",
              )),
            (bedShaderProgram.fragmentShader = bedShaderProgram.fragmentShader
              .replace(
                "#include <common>",
                "#include <common>\nvarying float warmBedZ;\nuniform vec3 warmBedRunner;",
              )
              .replace(
                "#include <color_fragment>",
                "#include <color_fragment>\nfloat warmRunner = smoothstep(0.40, 0.415, warmBedZ) * (1.0 - smoothstep(0.86, 0.875, warmBedZ));\ndiffuseColor.rgb = mix(diffuseColor.rgb, warmBedRunner, warmRunner);",
              )
              .replace(
                "#include <emissivemap_fragment>",
                "#include <emissivemap_fragment>\ntotalEmissiveRadiance = mix(totalEmissiveRadiance, warmBedRunner * 0.12, warmRunner);",
              )));
        }),
        (resolvedMaterial.customProgramCacheKey = () =>
          "warm-bed-runner-v1-" + bedRunnerColor.getHexString()));
    }
    (itemType === "smallcar" &&
      (palette.warmWood &&
        (resolvedMaterial.color?.set?.(16776696),
        (resolvedMaterial.roughness = 0.38),
        (resolvedMaterial.metalness = 0.02),
        (resolvedMaterial.emissiveMap = resolvedMaterial.map),
        (resolvedMaterial.emissiveIntensity = 0.08)),
      applyCarFinish(resolvedMaterial, {
        pearlWhite: palette.warmWood === true,
      })),
      ((itemType === "glasscabinet" &&
        /^glasscabinet-material-(0|10)$/.test(sourceMaterial.name)) ||
        (itemType === "bookcase" && /^bookcase-material-(0|7)$/.test(sourceMaterial.name))) &&
        (resolvedMaterial.color?.set?.(
          palette.warmWood ? (palette.cabinetWood ?? palette.wood) : palette.furniture,
        ),
        (resolvedMaterial.transparent = false),
        (resolvedMaterial.opacity = 1),
        (resolvedMaterial.depthWrite = true),
        (resolvedMaterial.depthTest = true)),
      ["suv", "scooter"].includes(itemType) &&
        applyVehicleFinish(threeNamespace, resolvedMaterial, sourceMaterial, palette),
      itemType === "steelstairs" &&
        ((resolvedMaterial.metalness = 0),
        (resolvedMaterial.roughness = 0.9),
        (resolvedMaterial.envMap = null),
        (resolvedMaterial.envMapIntensity = 0)),
      itemType === "steelstairs" &&
        partKey === "handrail" &&
        (resolvedMaterial.color?.set?.(palette.furnitureDark),
        resolvedMaterial.emissive?.copy?.(resolvedMaterial.color),
        (resolvedMaterial.onBeforeCompile = threeNamespace.Material.prototype.onBeforeCompile),
        (resolvedMaterial.customProgramCacheKey =
          threeNamespace.Material.prototype.customProgramCacheKey),
        delete resolvedMaterial.userData.warmFloorTread));

    applyMaterialStyleRecipe(resolvedMaterial, sourceMaterial.name, itemType, palette);


    applyMaterialOverride(resolvedMaterial, sourceMaterial.name, palette);

    applyMaterialSurfaceOverride(resolvedMaterial, sourceMaterial.name, palette);

    applySurfaceDetailFinish(resolvedMaterial, sourceMaterial.name, itemType, palette);
    // 最后一道：所有颜色 / 粗糙度 / 档位都算完之后，只按最终 metalness 决定要不要补 IBL 替身。
    applyMetalEnvironmentFinish(resolvedMaterial, threeNamespace, itemType);
    const resolvedSignature = materialSignature(resolvedMaterial);
    if (materialCacheBySignature.has(resolvedSignature)) {
      ((materialReuseCount += 1),
        resolvedMaterial !== sourceMaterial && resolvedMaterial.dispose?.());
      const cachedSharedMaterial = materialCacheBySignature.get(resolvedSignature);
      return (
        variantCacheByStyle.set(variantCacheKey, {
          styleKey: styleKey,
          sourceKey: sourceSignature,
          material: cachedSharedMaterial,
        }),
        cachedSharedMaterial
      );
    }
    return (
      materialCacheBySignature.set(resolvedSignature, resolvedMaterial),
      variantCacheByStyle.set(variantCacheKey, {
        styleKey: styleKey,
        sourceKey: sourceSignature,
        material: resolvedMaterial,
      }),
      resolvedMaterial
    );
  }
  function getCachedGeometryVariant(cacheOwner: any, baseGeometry: any, variantKey: any, buildVariant: any) {
    if (!baseGeometry) return baseGeometry;
    let variantsBySourceGeometry = geometryVariantsBySource.get(cacheOwner);
    variantsBySourceGeometry ||
      ((variantsBySourceGeometry = new WeakMap()),
      geometryVariantsBySource.set(cacheOwner, variantsBySourceGeometry));
    let variantsByBaseGeometry = variantsBySourceGeometry.get(baseGeometry);
    return (
      variantsByBaseGeometry ||
        ((variantsByBaseGeometry = new Map()),
        variantsBySourceGeometry.set(baseGeometry, variantsByBaseGeometry)),
      variantsByBaseGeometry.has(variantKey) ||
        variantsByBaseGeometry.set(variantKey, buildVariant()),
      variantsByBaseGeometry.get(variantKey)
    );
  }
  function addExternalItemModel(
    parentGroup: any,
    targetSize: any,
    addOptions: ExternalModelStyleOptions = {},
    { selected: isSelected = false, staticMaterialKey = null, staticVertexTint = true }: any = {},
  ) {
    /**
     * 电视不走外部模型：机身/边框/发光线/挂装底座与屏幕贴图全部由 `addTelevisionModel`
     * 程序化生成，屏幕贴图挂在那块 `televisionScreen` 网格上。
     *
     * `tv_standard` GLB 只是同一块 16:9 面板的替身（单一 `screen` 槽，材质恒为近黑
     * #0A0C0F，运行时不会往上贴画面）。`preserveOrigin + preserveAspect` 让它按 1.8 的
     * 宽度等比放大到 1.8 × 1.013 并坐落在底面 y=0，比程序化面板（1.737 × 0.977，16:9）
     * 更高，于是画面下方露出一整块纯黑面板——即「电视画面显示异常」。
     *
     * 返回 `false`（「没加外部模型」）：`buildItemModel` 只在返回 `true` 时清掉程序化
     * 子网格，返回 `true` 会把边框 / 挂装底座一起删掉、只留一块空面板。
     */
    if (targetSize?.type === "tv") return false;
    const modelType = resolveModelTypeForItem(targetSize),
      loadedModel = preparedTemplatesByItemType.get(modelType);
    if (!loadedModel) return (loadExternalItemModel(modelType), false);
    const optionsKey = optionsSignature(addOptions),
      modelClone = loadedModel.source.clone(true),
      curtainPart = /^curtain_(left|right|split)$/.exec(modelType)?.[1];
    curtainPart && (modelClone.userData.curtainRigRoot = true);
    /**
     * 吊扇 / 排气扇的动态转子：GLB 的转子节点在 `extras` 里带 `fanPart: "rotor"` 与
     * `contactShadowRestMatrix`（本地静止矩阵）。克隆后把矩阵重新记一次并给整棵子树打上
     * `interactionDynamicPart`，供 `fan-motion` 取件、合批跳过、接触阴影按静止姿态烘焙。
     * 没有这一步，`ceiling-fan-rotor` 这类只带节点名（旧批次无 extras）的模型会找不到转子。
     */
    (modelType === "ceiling-fan" || modelType === "exhaust-fan") &&
      modelClone.traverse((fanNode: any) => {
        if (
          fanNode.userData?.fanPart !== "rotor" &&
          fanNode.name !== "ceiling-fan-rotor"
        )
          return;
        (fanNode.userData.fanPart = "rotor"),
          fanNode.updateMatrix(),
          (fanNode.userData.contactShadowRestMatrix = fanNode.matrix.toArray()),
          fanNode.traverse((fanPartNode: any) => {
            fanPartNode.userData ||= {};
            fanPartNode.userData.interactionDynamicPart = true;
          });
      });
    let screenReference: any = null;
    (modelType === "laptop" &&
      modelClone.traverse((laptopMesh: any) => {
        if (!laptopMesh.isMesh || screenReference) return;
        const screenMaterialIndexInMesh = (
          Array.isArray(laptopMesh.material) ? laptopMesh.material : [laptopMesh.material]
        ).findIndex(
          (meshMaterialEntry: any) =>
            (meshMaterialEntry?.name || "").toLowerCase().match(/material-(\d+)/)?.[1] === "1",
        );
        screenMaterialIndexInMesh < 0 ||
          (screenReference = {
            geometry: laptopMesh.geometry,
            materialIndex: Array.isArray(laptopMesh.material) ? screenMaterialIndexInMesh : null,
          });
      }),
      modelClone.traverse((modelMesh: any) => {
        if (!modelMesh.isMesh) return;
        const meshMaterials = Array.isArray(modelMesh.material)
          ? modelMesh.material
          : [modelMesh.material];
        if (
          ((modelMesh.userData.externalModelSharedGeometry = true),
          (modelMesh.userData.externalModelSharedTextures = true),

          PILLAR_MODEL_ITEM_TYPES.has(modelType) &&
            (modelMesh.userData.reflectionRole = "wall"),
          isHiddenApplianceGuideMesh(modelType, meshMaterials))
        ) {
          ((modelMesh.visible = false),
            (modelMesh.userData.hiddenApplianceGuide = true),
            (modelMesh.userData.externalModelSharedMaterial = true));
          return;
        }
        if (modelType === "plant" && addOptions.warmWood) {
          const leafMaterialKey =
            "warm-leaves:" +
            meshMaterials
              .map((leafMaterialEntry: any) => (/foliage/i.test(leafMaterialEntry?.name || "") ? 1 : 0))
              .join(",");
          modelMesh.geometry = getCachedGeometryVariant(
            loadedModel,
            modelMesh.geometry,
            leafMaterialKey,
            () => enlargeWarmLeaves(modelMesh.geometry, meshMaterials),
          );
        }
        if (curtainPart) {
          const curtainMaterialNumber = Number(
            /material-(\d+)$/.exec(meshMaterials[0]?.name || "")?.[1],
          );
          modelMesh.userData.curtainPart =
            curtainMaterialNumber === 0
              ? "rod"
              : curtainMaterialNumber === (curtainPart === "split" ? 1 : 3)
                ? "cap"
                : (curtainPart === "split" ? [2, 3] : [4, 5]).includes(curtainMaterialNumber)
                  ? "cloth"
                  : "band";
        }
        const panelMaterialIndex = meshMaterials.findIndex(
          (panelMaterialEntry: any) =>
            (panelMaterialEntry?.name || "").toLowerCase().match(/material-(\d+)/)?.[1] === "2",
        );
        if (modelType === "laptop" && panelMaterialIndex >= 0 && screenReference) {
          const screenPanelMaterialIndex = Array.isArray(modelMesh.material)
              ? panelMaterialIndex
              : null,
            screenGeometryKey = JSON.stringify([
              "laptop-screen",
              screenReference.geometry.uuid,
              screenPanelMaterialIndex,
              screenReference.materialIndex,
            ]);
          modelMesh.geometry = getCachedGeometryVariant(
            loadedModel,
            modelMesh.geometry,
            screenGeometryKey,
            () =>
              alignLaptopScreenGeometry(
                modelMesh.geometry,
                screenReference.geometry,
                screenPanelMaterialIndex,
                screenReference.materialIndex,
              ),
          );
        } else
          (modelType === "tea_bar_machine" || modelType === "dishwasher") &&
            (modelMesh.geometry = getCachedGeometryVariant(
              loadedModel,
              modelMesh.geometry,
              "smooth-appliance",
              () => smoothGeometryNormals(modelMesh.geometry),
            ));
        const resolveMeshMaterial = (meshSourceMaterial: any) => {
          const steelStairPartKey =
              modelType === "steelstairs" && ["Geom3D_8", "Geom3D_61"].includes(modelMesh.name)
                ? "handrail"
                : "",
            sharedMaterial = resolveSharedMaterial(
              meshSourceMaterial,
              addOptions,
              modelType,
              optionsKey,
              steelStairPartKey,
            ),
            materialForMesh = (isSelected && sharedMaterial?.clone?.()) || sharedMaterial;
          return (
            isSelected &&
              [
                "sideboard",
                "shoecabinet",
                "wallcabinet",


                "cabinet",
                "suv",
                "scooter",
              ].includes(modelType) &&
              ((materialForMesh.onBeforeCompile = sharedMaterial.onBeforeCompile),
              (materialForMesh.customProgramCacheKey = sharedMaterial.customProgramCacheKey)),
            materialForMesh
          );
        };
        if (
          ((modelMesh.material = Array.isArray(modelMesh.material)
            ? modelMesh.material.map(resolveMeshMaterial)
            : resolveMeshMaterial(modelMesh.material)),
          warmWoodFurnitureItemTypes.has(modelType) &&
            (Array.isArray(modelMesh.material) ? modelMesh.material : [modelMesh.material]).some(
              (transparentMaterialEntry: any) =>
                transparentMaterialEntry?.transparent && transparentMaterialEntry.opacity < 1,
            ) &&
            (modelMesh.renderOrder = Math.max(modelMesh.renderOrder, 6)),
          (modelMesh.castShadow = modelType !== "rug"),
          (modelMesh.receiveShadow =
            !["glassstairs", "floatingstairs"].includes(modelType) ||
            modelMesh.material?.transparent !== true),
          modelType === "laptop" || modelType === "nas")
        ) {
          const meshMaterialList = Array.isArray(modelMesh.material)
            ? modelMesh.material
            : [modelMesh.material];
          for (const opaqueMaterial of meshMaterialList)
            opaqueMaterial &&
              !opaqueMaterial.transparent &&
              opaqueMaterial.opacity >= 0.999 &&
              ((opaqueMaterial.depthWrite = true),
              (opaqueMaterial.depthTest = true),
              (opaqueMaterial.forceSinglePass = true));
        }
        if (modelType === "rug") {
          const rugMaterialList = Array.isArray(modelMesh.material)
            ? modelMesh.material
            : [modelMesh.material];
          modelMesh.renderOrder = rugMaterialList.some(
            (rugMaterialEntry: any) => rugMaterialEntry?.polygonOffset,
          )
            ? 1
            : 0;
        }
        modelMesh.userData.externalModelSharedMaterial = !isSelected;
      }),
      isSelected ||
        furnitureBatchCache.prepare(
          modelClone,
          loadedModel,
          modelType,
          staticMaterialKey,
          staticVertexTint,
        ));
    const catalogDefinition = (ALL_ITEM_MODELS as any)[modelType],
      scaleBasisSize =
        Array.isArray(catalogDefinition?.scaleBasis) && catalogDefinition.scaleBasis.length === 3
          ? {
              x: catalogDefinition.scaleBasis[0],
              y: catalogDefinition.scaleBasis[1],
              z: catalogDefinition.scaleBasis[2],
            }
          : loadedModel.size;
    if (catalogDefinition?.preserveAspect) {
      const fitScale = Math.min(
        targetSize.width / scaleBasisSize.x,
        targetSize.height / scaleBasisSize.y,
        targetSize.depth / scaleBasisSize.z,
      );
      modelClone.scale.setScalar(fitScale);
    } else
      modelClone.scale.set(
        targetSize.width / scaleBasisSize.x,
        targetSize.height / scaleBasisSize.y,
        targetSize.depth / scaleBasisSize.z,
      );
    if (catalogDefinition?.preserveOrigin) {
      if (catalogDefinition?.groundAlign) {
        modelClone.updateMatrixWorld(true);
        const groundBox = new threeNamespace.Box3().setFromObject(modelClone);
        ((modelClone.position.y -= groundBox.min.y),
          (modelClone.position.y += finite(catalogDefinition.groundOffset, 0)));
      }
    } else {
      modelClone.updateMatrixWorld(true);
      // 摆放包围盒同样优先用烘焙的那一份，再按实例矩阵变换，省掉一次整树 `setFromObject`；
      // 钢琴 / 前置净水器的烘焙盒与几何体对不上，这两个仍走几何体自算（并开精确模式）。
      const isGeometryMeasuredModel =
        modelType === "piano" || modelType === "pipelinewaterpurifier";
      loadedModel.placementBounds === undefined &&
        (loadedModel.placementBounds = modelPlacementBounds(threeNamespace, loadedModel.source));
      const boundsBox =
          loadedModel.placementBounds && !isGeometryMeasuredModel
            ? loadedModel.placementBounds.clone().applyMatrix4(modelClone.matrixWorld)
            : new threeNamespace.Box3().setFromObject(modelClone, isGeometryMeasuredModel),
        boundsCenter = boundsBox.getCenter(new threeNamespace.Vector3());
      modelClone.position.set(-boundsCenter.x, -boundsBox.min.y, -boundsCenter.z);
    }
    applyModelAnchors(modelType, modelClone);
    return (parentGroup.add(modelClone), true);
  }
  /** 该物件是否挂外部 GLB 模型（`3d-studio` 检查面板据此决定要不要显示「材质属性」）。 */
  function hasExternalModelForItem(targetSize: any) {
    return Boolean(targetSize?.type && (ALL_ITEM_MODELS as any)[resolveModelTypeForItem(targetSize)]);
  }
  /** 列出物件模型的**材质槽位检查表**：每个槽位的角色、当前实际显色与表面参数。 */
  function describeItemMaterials(targetSize: any, addOptions: ExternalModelStyleOptions = {}) {
    const modelType = resolveModelTypeForItem(targetSize),
      preparedModel = preparedTemplatesByItemType.get(modelType);
    if (!preparedModel) return null;
    const optionsKey = optionsSignature(addOptions),
      rawSlotEntries: any = [];
    preparedModel.source.traverse((templateMesh: any) => {
      if (!templateMesh.isMesh) return;
      const meshMaterials = Array.isArray(templateMesh.material)
        ? templateMesh.material
        : [templateMesh.material];
      if (isHiddenApplianceGuideMesh(modelType, meshMaterials)) return;
      meshMaterials.forEach((templateMaterial: any, materialIndexInMesh: any) => {
        const slotName = templateMaterial?.name;
        if (!slotName || rawSlotEntries.some((slotEntry: any) => slotEntry.name === slotName)) return;
        const resolvedMaterial = resolveSharedMaterial(
            templateMaterial,
            addOptions,
            modelType,
            optionsKey,
          ),
          roleResolution = resolveModelMaterialRole(modelType, slotName, materialIndexInMesh);
        rawSlotEntries.push({
          name: slotName,
          role: roleResolution.role,
          roleSource: roleResolution.source,
          slot: roleResolution.slot ?? materialIndexInMesh,
          /** 该槽位是否由角色表 / 调色板出图； */
          fromPalette: usesDetailMaterialPipeline(modelType, slotName, addOptions),
          /** 该槽位自带图集贴图：颜色来自贴图，面板只允许调表面参数。 */
          hasAtlas: materialHasAtlas(resolvedMaterial),
          color: resolvedMaterial?.color ? "#" + resolvedMaterial.color.getHexString() : "",
          roughness: finite(resolvedMaterial?.roughness, 0),
          metalness: finite(resolvedMaterial?.metalness, 0),
          transparent: resolvedMaterial?.transparent === true,
          opacity: finite(resolvedMaterial?.opacity, 1),
          emissive: resolvedMaterial?.emissive?.isColor
            ? "#" + resolvedMaterial.emissive.getHexString()
            : "",
          emissiveIntensity: finite(resolvedMaterial?.emissiveIntensity, 0),
          depthWrite: resolvedMaterial?.depthWrite !== false,
          overrideColor: materialHasAtlas(resolvedMaterial)
            ? ""
            : materialOverrideColorFor(addOptions, slotName) || "",
          surfaceOverride: materialSurfaceOverrideFor(addOptions, slotName),
          /** 该槽位实际用的石材板色号（"" = 不是石材板）。 */
          slab: isStoneSlabFlavor(resolvedMaterial?.userData?.homeosStoneSlab)
            ? resolvedMaterial.userData.homeosStoneSlab
            : "",
        });
      });
    });
    const sortedSlotEntries = rawSlotEntries.sort((slotEntryA: any, slotEntryB: any) => {
      const slotIndexA = Number.isFinite(slotEntryA.slot) ? slotEntryA.slot : Number.MAX_SAFE_INTEGER,
        slotIndexB = Number.isFinite(slotEntryB.slot) ? slotEntryB.slot : Number.MAX_SAFE_INTEGER;
      return (
        slotIndexA - slotIndexB ||
        slotEntryA.name.localeCompare(slotEntryB.name, "en", { numeric: true })
      );
    });
    return groupVehicleMaterialSlots(modelType, sortedSlotEntries);
  }
  return {
    addExternalItemModel: addExternalItemModel,
    loadExternalItemModel: loadExternalItemModel,
    preloadPersistentModels: preloadPersistentModels,
    modelTypeForItem: resolveModelTypeForItem,
    modelLoadState: collectLoadState,
    persistentCacheState: () => persistentCache.stats(),
    retryFailedModels: retryPendingModels,
    dispose: disposeModelManager,
    hasExternalModelForItem: hasExternalModelForItem,
    describeItemMaterials: describeItemMaterials,
    cacheRepresentation(itemTypeArray: any[]) {
      return [...new Set(itemTypeArray.map(resolveModelTypeForItem).filter(Boolean))]
        .sort()
        .map((typeName) => ({
          type: typeName,
          definition: (ALL_ITEM_MODELS as any)[typeName],
          loaded: preparedTemplatesByItemType.has(typeName),
          rendererRevision: new URL(import.meta.url).search,
        }));
    },
  };
}
