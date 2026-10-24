import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { MATERIAL_STYLE_AUTO, materialStylePaletteColors, normalizeMaterialStyle } from "../../../../materials/studio-material-presets";
import { buildStaticMaterialKey } from "../../../../materials/studio-static-material-key";
import { RENDER_CACHE_VERSION as RENDER_CACHE_VERSION2, cacheSceneDescriptor as cacheSceneDescriptor2, sha256 as sha2562, stableCacheJSON as stableCacheJSON2 } from "../../../../../bridge/scene/render-cache";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { clamp as clamp2, nearestWall as nearestWall2 } from "../../../../plan/geometry";
import { reorderFloors as reorderFloors2 } from "../../../../plan/floor-order";
import { ALL_ITEM_MODELS as ALL_ITEM_MODELS2 } from "../../../../loaders/studio-external-models";
import { isCourtyardDrawing as isCourtyardDrawing2, finite as finite2 } from "../../../../loaders/studio-normalization";
import { normalizePillarShape as normalizePillarShape2 } from "../../../items/studio-item-posture";
import { lampItemTypeSet, tvMountStyleSet } from "../../../items/item-catalog";
import { STORAGE_SECTION_TYPES, storageSectionModelType } from "../../../items/studio-storage-sections";
import { composeKey, composeItemKey } from "../../../ui/studio-app-helpers";
import { normalizeMaterialSurfaceOverrides } from "../../../scene/studio-scene-payload";
import { createFloorRecord, normalizeStudioDocument } from "../../../scene/studio-document-payload";

export function sceneCacheDescriptor(runtime: StudioAppRuntime, descriptorWidth: any, descriptorHeight: any) {
  const floors = runtime.getPreviewFloorMode() === "all" ? runtime.appCtx.studioProject.floors : [runtime.getActiveFloor()];
  runtime.appCtx.threeCamera.updateMatrixWorld();
  const roundMatrixNumbers = (matrixElements: any) =>
      matrixElements.map(
        (matrixElementValue: any) => Math.round(matrixElementValue * 100000000) / 100000000,
      ),
    list: any = [];
  return (
    runtime.appCtx.sceneRootNode.traverse((sceneObject: any) => {
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
        mode: runtime.getPreviewFloorMode(),
        gap: runtime.appCtx.studioProject.previewFloorGap,
        uniformOverviewStack: runtime.appCtx.studioProject.uniformOverviewStack === true,
        ...(runtime.appCtx.studioProject.uniformOverviewStack === true
          ? {
              overviewProjection: "saved-camera-v1",
            }
          : {}),
        ...(runtime.isEmbedStageMode && runtime.appCtx.sceneStyle === "warm-wood"
          ? {
              warmRegionLighting: "v13-balanced-wash",
            }
          : {}),
        lighting: runtime.appCtx.baseLightingSettings,
        style: runtime.backgroundSettings(),
        wallOpacity: runtime.appCtx.wallOpacityValue,
        visibility: list,
        reflections: runtime.appCtx.reflectionSettingsJson,
        curtains: runtime.appCtx.curtainStructureJson,
        ...(runtime.appCtx.backgroundThemeName !== "grid"
          ? {
              backgroundTheme: "v6:" + runtime.appCtx.backgroundThemeName,
            }
          : {}),
        models: runtime.externalModelRegistry.cacheRepresentation(
          floors.flatMap((sceneItem: any) => sceneItem.scene.items),
        ),
        camera: {
          world: roundMatrixNumbers(runtime.appCtx.threeCamera.matrixWorld.elements),
          projection: roundMatrixNumbers(runtime.appCtx.threeCamera.projectionMatrix.elements),
        },
        width: descriptorWidth,
        height: descriptorHeight,
        toneMapping: runtime.appCtx.threeRenderer.toneMapping,
        exposure: runtime.appCtx.threeRenderer.toneMappingExposure,
        colorSpace: runtime.appCtx.threeRenderer.outputColorSpace,
        shadows: runtime.appCtx.threeRenderer.shadowMap.type,
      }),
    )
  );
}

export function checkModelInUse(runtime: StudioAppRuntime, modelKey: any) {
  return !!runtime.appCtx.studioProject?.floors?.some((floorSelection: any) =>
    floorSelection.scene?.items?.some((floorItem: any) => {
      /** 两节柜是同一 `type` 的变体模型：按实际解析出的模型类型反查“已放置”。 */
      if (
        STORAGE_SECTION_TYPES.has(floorItem.type) &&
        storageSectionModelType(floorItem) === modelKey
      )
        return true;
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

export function collectScenePayload(runtime: StudioAppRuntime, 
  floorRecords: any[] = [],
  { includeCurtains: includeCurtainFlag = false } = {},
) {
  return [
    ...new Set(
      floorRecords.flatMap((floorEntry) =>
        (floorEntry?.scene?.items || [])
          .filter((itemEntry: any) => includeCurtainFlag || itemEntry.type !== "curtain")
          .map((itemRecord: any) => runtime.modelTypeForItem(itemRecord))
          .filter((assetModelKey: any) => (ALL_ITEM_MODELS2 as any)[assetModelKey]),
      ),
    ),
  ];
}

export function collectSelectedFloors(runtime: StudioAppRuntime, ) {
  const activeFloorRecords =
    runtime.getPreviewFloorMode() === "all"
      ? runtime.appCtx.studioProject?.floors || []
      : [runtime.getActiveFloor()].filter(Boolean);
  return runtime.collectScenePayload(activeFloorRecords);
}

export function scheduleModelLoadFlush(runtime: StudioAppRuntime, flushDelayMs = 900) {
  (window.clearTimeout(runtime.appCtx.modelLoadDebounceId),
    (runtime.appCtx.modelLoadDebounceId = window.setTimeout(
      () => {
        if (
          ((runtime.appCtx.modelLoadDebounceId = null),
          !runtime.appCtx.isExternalModelLoadDeferred || document.hidden || runtime.appCtx.isWindowHidden || runtime.appCtx.isRenderSuppressed)
        ) {
          runtime.appCtx.isExternalModelLoadDeferred && runtime.scheduleModelLoadFlush(300);
          return;
        }
        const uniqueModelTypes = [...new Set(runtime.appCtx.deferredModelTypes)];
        ((runtime.appCtx.deferredModelTypes = []), Promise.allSettled(runtime.loadModelsForTypes(uniqueModelTypes)));
      },
      Math.max(0, flushDelayMs),
    )));
}

export function loadModelsForTypes(runtime: StudioAppRuntime, requestedModelTypes: any[] = []) {
  (window.clearTimeout(runtime.appCtx.modelLoadDebounceId),
    (runtime.appCtx.modelLoadDebounceId = null),
    (runtime.appCtx.isExternalModelLoadDeferred = false),
    (window.externalModelLoadsDeferred = false));
  const filter = [...new Set(requestedModelTypes)].filter(
    (modelTypeFilterKey) => (ALL_ITEM_MODELS2 as any)[modelTypeFilterKey],
  );
  if (!filter.length) return [];
  window.__homeosReleasingDeferredModels = true;
  const map = filter.map((modelTypeEntry) => runtime.ensureExternalModelLoaded(modelTypeEntry));
  return ((window.__homeosReleasingDeferredModels = false), map);
}

export function preloadDefaultModels(runtime: StudioAppRuntime, ) {
  return runtime.loadModelsForTypes(runtime.collectSelectedFloors());
}

export function requestSceneRender(runtime: StudioAppRuntime, ) {
  if (typeof runtime.appCtx.isExternalModelPending < "u" && runtime.appCtx.isExternalModelPending) {
    runtime.appCtx.isModelLoadPending = true;
    return;
  }
  if (runtime.isAutoDiagramEmbed || runtime.appCtx.isModelLoadDeferred) {
    runtime.publishModelLoadState();
    return;
  }
  ((runtime.appCtx.isModelLoadPending = true),
    runtime.publishModelLoadState(),
    runtime.appCtx.isModelLoadPending &&
      (runtime.appCtx.isWindowHidden ||
        runtime.appCtx.isRenderSuppressed ||
        (runtime.appCtx.modelLoadTimeoutId === null &&
          (runtime.appCtx.modelLoadTimeoutId = window.setTimeout(() => {
            ((runtime.appCtx.modelLoadTimeoutId = null),
              !(runtime.appCtx.isWindowHidden || runtime.appCtx.isRenderSuppressed) && runtime.finishModelLoad());
          }, 500)))));
}

export function finishModelLoad(runtime: StudioAppRuntime, ) {
  (!runtime.appCtx.isModelLoadPending && !runtime.isAutoDiagramEmbed && !runtime.appCtx.isModelLoadDeferred) ||
    ((runtime.appCtx.isModelLoadPending = false),
    window.clearTimeout(runtime.appCtx.modelLoadTimeoutId),
    (runtime.appCtx.modelLoadTimeoutId = null),
    (runtime.appCtx.replacementFrameCount += 1),
    runtime.publishModelLoadState(),
    typeof runtime.appCtx.isRuntimeWarmupDone < "u" &&
      runtime.isEmbeddedStage &&
      runtime.appCtx.sceneRootNode?.children?.length &&
      (runtime.appCtx.isRuntimeWarmupDone = true),
    runtime.requestSceneRebuild({
      force: true,
      precompile: true,
      externalModelsOnly: true,
    }),
    window.requestAnimationFrame(() => {
      ((runtime.appCtx.replacementFrameCount -= 1), runtime.publishModelLoadState());
    }));
}

export function publishModelLoadState(runtime: StudioAppRuntime, modelLoaderEntry = runtime.externalModelRegistry.modelLoadState()) {
  const pending = modelLoaderEntry.pending ?? modelLoaderEntry.active + modelLoaderEntry.queued,
    isModelLoadSettled = runtime.appCtx.isModelLoadActive && pending === 0;
  if (
    ((runtime.appCtx.isModelLoadActive = pending > 0),
    !pending &&
      runtime.appCtx.isModelLoadPending &&
      !runtime.isAutoDiagramEmbed &&
      !runtime.appCtx.isModelLoadDeferred &&
      !runtime.appCtx.isWindowHidden &&
      !runtime.appCtx.isRenderSuppressed &&
      (typeof runtime.appCtx.isExternalModelPending > "u" || !runtime.appCtx.isExternalModelPending))
  ) {
    runtime.finishModelLoad();
    return;
  }
  isModelLoadSettled && !runtime.appCtx.isModelLoadPending && runtime.appCtx.replacementFrameCount === 0 && runtime.renderStudioFrame();
  const hn2 = pending > 0 || runtime.appCtx.isModelLoadPending || runtime.appCtx.replacementFrameCount > 0;
  (runtime.updateModelLoadIndicator(modelLoaderEntry, hn2),
    runtime.modelLoadingStatusElement &&
      (runtime.appCtx.orbitControls && !runtime.appCtx.isInteractionLocked && (runtime.appCtx.orbitControls.enabled = !hn2),
      (runtime.modelLoadingStatusElement.hidden = !hn2),
      runtime.modelLoadingStatusElement
        .querySelector("span:last-child")
        ?.replaceChildren(
          document.createTextNode(
            pending > 0 ? "正在加载模型… " + pending : hn2 ? "正在完成模型…" : "",
          ),
        )));

  runtime.appCtx.isMaterialSlotPanelPending &&
    runtime.appCtx.selectedItem?.kind === "item" &&
    runtime.renderMaterialSlotPanel(runtime.getSelectedObject());
}

export function emitRuntimeDiagnostic(runtime: StudioAppRuntime, eventName: any, timingRecord: Record<string, any> = {}) {
  try {
    if (!runtime.isEmbeddedStage && ["gpu-lost", "gpu-restored"].includes(eventName)) {
      const isContextRestored = eventName === "gpu-restored",
        contextCanvas = runtime.appCtx.threeRenderer?.domElement;
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
          (runtime.appCtx.threeRenderer?.getPixelRatio?.() || 1),
      );
      return;
    }
    if (
      !runtime.isEmbeddedStage ||
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
      typeof runtime.appCtx.threeRenderer < "u"
    ) {
      if (eventName.startsWith("category-switch-")) {
        const rendererSnapshot = runtime.appCtx.threeRenderer?.info;
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
        width: runtime.appCtx.threeRenderer?.domElement?.width,
        height: runtime.appCtx.threeRenderer?.domElement?.height,
        dpr: runtime.appCtx.threeRenderer?.getPixelRatio?.(),
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

export function updateModelLoadIndicator(runtime: StudioAppRuntime, loadStateSnapshot: any, isPresentationPending: any) {
  try {
    const pending2 = runtime.modelPresentationState.pending;
    if (
      ((runtime.modelPresentationState.pending = isPresentationPending),
      !runtime.modelPresentationState.presented || pending2 || !isPresentationPending)
    )
      return;
    const pending3 =
      loadStateSnapshot.pending ?? loadStateSnapshot.active + loadStateSnapshot.queued;
    runtime.emitRuntimeDiagnostic(pending3 > 0 ? "models-loading-resumed" : "models-completion-resumed", {
      pending: pending3,
      active: loadStateSnapshot.active,
      queued: loadStateSnapshot.queued,
      replacementPending: runtime.appCtx.isModelLoadPending,
      replacementFrames: runtime.appCtx.replacementFrameCount,
    });
  } catch { /* 诊断上报 best-effort：加载状态快照上报失败不应中断加载流程 */ }
}

/** 某物件的模型加载选项 = 当前主题调色板 + 该物件自己的材质档位 + 该物件自己的覆盖色+ 该物件自己的逐槽表面参数。 */
export function materialLoadOptionsForItem(runtime: StudioAppRuntime, itemRecordRef: any) {
  const itemModelType = runtime.externalModelRegistry.modelTypeForItem(itemRecordRef),
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
    ...runtime.backgroundSettings(),
    ...materialStylePaletteColors(itemModelType, itemMaterialStyle),
    /**
     * 墙体**实际**的透过率（用户可能拖过滑条 / 单面墙有自定义 opacity）。
     * `backgroundSettings().wallOpacity` 只是主题默认值，配墙的柱体只能读这里的实时值，
     * 否则调完墙体透明度，柱子还停在 0.36。
     */
    wallOpacity: runtime.appCtx.wallOpacityValue ?? runtime.appCtx.studioState.settings.wallOpacity,
  };
  itemMaterialStyle !== MATERIAL_STYLE_AUTO && (itemLoadOptions.materialStyle = itemMaterialStyle);
  materialOverrideEntries.length && (itemLoadOptions.materialOverrides = itemMaterialOverrides);
  materialSurfaceOverrideEntries.length &&
    (itemLoadOptions.materialSurfaceOverrides = itemMaterialSurfaceOverrides);
  return itemLoadOptions;
}

export function applyItemOptimization(runtime: StudioAppRuntime, 
  modelSource: any,
  itemRecordRef: any,
  modelLoadOptions = runtime.materialLoadOptionsForItem(itemRecordRef),
) {
  const addExternalItemModel = runtime.externalModelRegistry.addExternalItemModel(
    modelSource,
    itemRecordRef,
    modelLoadOptions,
    {
      selected: runtime.createSelectionRef("item", itemRecordRef.id),
      staticMaterialKey: buildStaticMaterialKey,
      staticVertexTint: runtime.isEmbeddedStage,
    },
  );
  return (runtime.publishModelLoadState(), addExternalItemModel);
}

export function getActiveFloor(runtime: StudioAppRuntime, ) {
  const oe2 = runtime.appCtx.pendingRuntimeSettings?.selectedFloorId || runtime.appCtx.activeFloorId;
  return (
    runtime.appCtx.studioProject?.floors.find((floorMatch: any) => floorMatch.id === oe2) ||
    runtime.appCtx.studioProject?.floors[0] ||
    null
  );
}

export function captureStudioSnapshot(runtime: StudioAppRuntime, ) {
  return structuredClone(runtime.appCtx.studioProject || normalizeStudioDocument(runtime.appCtx.studioState, runtime.studioDocumentDeps()));
}

export function getLocalSaveRevision(runtime: StudioAppRuntime, ) {
  const runtimeSnapshot = runtime.captureStudioSnapshot();
  if (!runtime.appCtx.pendingRuntimeSettings) return runtimeSnapshot;
  runtimeSnapshot.previewFloorMode = runtime.appCtx.pendingRuntimeSettings.floorMode;
  for (const snapshotFloor of runtimeSnapshot.floors || []) {
    const floorCameraSetting = runtime.appCtx.pendingRuntimeSettings.floorCameraSettings.get(snapshotFloor.id);
    floorCameraSetting &&
      ((snapshotFloor.scene.settings.cameraMode = floorCameraSetting.mode),
      (snapshotFloor.scene.settings.cameraView = floorCameraSetting.view),
      (snapshotFloor.scene.settings.cameraTopRotation = floorCameraSetting.topRotation),
      (snapshotFloor.scene.settings.cameraFocalLength = floorCameraSetting.focalLength));
  }
  return (
    (runtimeSnapshot.combinedCameraSettings = {
      ...runtime.appCtx.pendingRuntimeSettings.combinedCameraSettings,
    }),
    runtimeSnapshot
  );
}

export function uniqueFloorName(runtime: StudioAppRuntime, baseName: any, currentFloorId = "") {
  const set = new Set(
    (runtime.appCtx.studioProject?.floors || [])
      .filter((otherFloor: any) => otherFloor.id !== currentFloorId)
      .map((otherFloorName: any) => otherFloorName.name),
  );
  if (!set.has(baseName)) return baseName;
  let num = 2;
  for (; set.has(baseName + " " + num);) num += 1;
  return baseName + " " + num;
}

export function hideFloorActionMenu(runtime: StudioAppRuntime, ) {
  ((runtime.floorActionMenuElement.hidden = true), (runtime.appCtx.pendingFloorMenuId = ""));
}

export function showFloorActionMenu(runtime: StudioAppRuntime, floorRow: any, menuOpenEvent: any) {
  runtime.appCtx.pendingFloorMenuId = floorRow.id;
  const selector = runtime.floorActionMenuElement.querySelector('[data-floor-action="delete"]');
  ((selector.disabled = runtime.appCtx.studioProject.floors.length <= 1),
    (runtime.floorActionMenuElement.hidden = false),
    (runtime.floorActionMenuElement.style.left =
      Math.min(menuOpenEvent.clientX, window.innerWidth - 116) + "px"),
    (runtime.floorActionMenuElement.style.top =
      Math.min(menuOpenEvent.clientY, window.innerHeight - 82) + "px"));
}

export function floorActionHandler(runtime: StudioAppRuntime, floorToDelete: any) {
  !floorToDelete ||
    runtime.appCtx.studioProject.floors.length <= 1 ||
    ((runtime.appCtx.pendingFloorDeleteId = floorToDelete.id),
    (runtime.floorDeleteNameElement.textContent = floorToDelete.name),
    runtime.floorDeleteDialogElement.showModal());
}

export function closeFloorDeleteDialog(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.pendingFloorDeleteId = ""), runtime.floorDeleteDialogElement.open && runtime.floorDeleteDialogElement.close());
}

export async function confirmFloorDelete(runtime: StudioAppRuntime, ) {
  const deletedFloor = runtime.appCtx.studioProject.floors.find(
    (floorEntryMatch: any) => floorEntryMatch.id === runtime.appCtx.pendingFloorDeleteId,
  );
  if ((runtime.closeFloorDeleteDialog(), !deletedFloor || runtime.appCtx.studioProject.floors.length <= 1)) return;
  const deletedFloorIndex = runtime.appCtx.studioProject.floors.findIndex(
    (floorIndexMatch: any) => floorIndexMatch.id === deletedFloor.id,
  );
  (runtime.appCtx.studioProject.floors.splice(deletedFloorIndex, 1),
    runtime.appCtx.studioProject.floors.forEach((elevationFloor: any, floorOrderIndex: any) => {
      elevationFloor.elevation = floorOrderIndex * runtime.appCtx.studioProject.defaultFloorHeight;
    }));
  const nextActiveFloor =
    runtime.appCtx.studioProject.floors[Math.max(0, deletedFloorIndex - 1)] || runtime.appCtx.studioProject.floors[0];
  (await runtime.selectFloor(nextActiveFloor.id, {
    persist: false,
  }),
    runtime.updateFloorPreviewButtons(),
    runtime.markDocumentDirty(),
    runtime.showToast("已删除“" + deletedFloor.name + "”。", "success"));
}

export function openFloorRenameDialog(runtime: StudioAppRuntime, floorToRename: any) {
  floorToRename &&
    ((runtime.appCtx.pendingFloorMenuId = floorToRename.id),
    (runtime.floorRenameInputElement.value = floorToRename.name),
    runtime.floorRenameDialogElement.showModal(),
    requestAnimationFrame(() => runtime.floorRenameInputElement.select()));
}

export function syncGlobalControls(runtime: StudioAppRuntime, ) {
  if (runtime.appCtx.studioProject) {
    runtime.floorListElement.replaceChildren();
    for (const floorRowRecord of runtime.appCtx.studioProject.floors) {
      const element = document.createElement("div");
      ((element.className =
        "floor-row" +
        (floorRowRecord.id === runtime.appCtx.activeFloorId ? " active" : "") +
        (floorRowRecord.aligned ? "" : " unaligned")),
        (element.dataset.floorId = floorRowRecord.id),
        (element.draggable = true),
        element.setAttribute(
          "aria-label",
          floorRowRecord.name +
            "，" +
            (floorRowRecord.id === runtime.appCtx.activeFloorId ? "当前楼层，" : "") +
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
          ((runtime.appCtx.movingFloorId = floorRowRecord.id),
            element.classList.remove("drag-ready"),
            element.classList.add("dragging"),
            (dragStartEvent.dataTransfer!.effectAllowed = "move"),
            dragStartEvent.dataTransfer!.setData(
              "application/x-homeos-floor",
              floorRowRecord.id,
            ));
        }),
        element.addEventListener("dragend", () => {
          ((runtime.appCtx.movingFloorId = ""),
            element.classList.remove("dragging"),
            cancelLongPress(),
            runtime.clearDropIndicator());
        }),
        element.addEventListener("dragover", (dragOverEvent) => {
          if (!runtime.appCtx.movingFloorId || runtime.appCtx.movingFloorId === floorRowRecord.id) return;
          (dragOverEvent.preventDefault(), runtime.clearDropIndicator());
          const isDropAfterPointer =
            dragOverEvent.clientY >=
            element.getBoundingClientRect().top + element.getBoundingClientRect().height / 2;
          ((element.dataset.dropPosition = isDropAfterPointer ? "after" : "before"),
            element.classList.add(isDropAfterPointer ? "drop-after" : "drop-before"),
            dragOverEvent.dataTransfer && (dragOverEvent.dataTransfer.dropEffect = "move"));
        }),
        element.addEventListener("drop", (dropEvent) => {
          if (!runtime.appCtx.movingFloorId || runtime.appCtx.movingFloorId === floorRowRecord.id) return;
          dropEvent.preventDefault();
          const rr2 = runtime.appCtx.movingFloorId,
            isDropPositionAfter = element.dataset.dropPosition === "after";
          ((runtime.appCtx.movingFloorId = ""),
            runtime.clearDropIndicator(),
            runtime.moveFloorRow(rr2, floorRowRecord.id, isDropPositionAfter));
        }));
      const floorSwitchButton = document.createElement("button");
      ((floorSwitchButton.type = "button"),
        (floorSwitchButton.textContent = floorRowRecord.id === runtime.appCtx.activeFloorId ? "●" : "○"),
        (floorSwitchButton.title = "切换到" + floorRowRecord.name),
        floorSwitchButton.addEventListener("click", (switchClickEvent) => {
          (switchClickEvent.stopPropagation(),
            runtime.selectFloor(floorRowRecord.id, {
              persist: true,
            }));
        }));
      const floorNameLabel = document.createElement("span");
      ((floorNameLabel.textContent = floorRowRecord.name),
        (floorNameLabel.title = "长按后拖动可调整楼层顺序，右键可重命名或删除楼层"));
      const floorStatusNote = document.createElement("small"),
        floorRowIndex = runtime.appCtx.studioProject.floors.findIndex(
          (floorIndexEntry: any) => floorIndexEntry.id === floorRowRecord.id,
        );
      ((floorStatusNote.textContent =
        floorRowIndex === 0 ? "基准" : floorRowRecord.aligned ? "已对齐" : "待对齐"),
        element.addEventListener("click", () => {
          runtime.selectFloor(floorRowRecord.id, {
            persist: true,
          });
        }),
        element.addEventListener("contextmenu", (rowActionMenuEvent) => {
          (rowActionMenuEvent.preventDefault(),
            runtime.showFloorActionMenu(floorRowRecord, rowActionMenuEvent));
        }),
        element.append(floorSwitchButton, floorNameLabel, floorStatusNote),
        runtime.floorListElement.append(element));
    }
    runtime.renderFloorList();
  }
}

export function clearDropIndicator(runtime: StudioAppRuntime, ) {
  for (const dropIndicatorElement of runtime.floorListElement.querySelectorAll(".floor-row"))
    (dropIndicatorElement.classList.remove("drop-before", "drop-after"),
      delete dropIndicatorElement.dataset.dropPosition);
}

export function moveFloorRow(runtime: StudioAppRuntime, draggedFloorId: any, targetFloorId: any, dropAfterFlag: any) {
  const reorderedFloors = reorderFloors2(
    runtime.appCtx.studioProject.floors,
    draggedFloorId,
    targetFloorId,
    dropAfterFlag,
    runtime.appCtx.studioProject.defaultFloorHeight,
  );
  if (reorderedFloors === runtime.appCtx.studioProject.floors) return;
  const movedFloor = runtime.appCtx.studioProject.floors.find(
    (movedFloorMatch: any) => movedFloorMatch.id === draggedFloorId,
  );
  ((runtime.appCtx.studioProject.floors = reorderedFloors),
    runtime.syncGlobalControls(),
    runtime.updateFloorPreviewButtons(),
    runtime.renderFloorList(),
    runtime.requestSceneRebuild({
      force: true,
    }),
    runtime.markDocumentDirty(),
    movedFloor && runtime.showToast("已调整“" + movedFloor.name + "”的楼层顺序。", "success"));
}

export function renderFloorList(runtime: StudioAppRuntime, ) {
  const ae2 = runtime.getActiveFloor(),
    activeFloorIndex = ae2
      ? runtime.appCtx.studioProject.floors.findIndex((activeFloorMatch: any) => activeFloorMatch.id === ae2.id)
      : -1,
    canAlignFloor = runtime.appCtx.studioProject.floors.length > 1 && activeFloorIndex > 0;
  ((runtime.alignFloorButton.hidden = !canAlignFloor),
    (runtime.alignFloorButton.disabled = !canAlignFloor || !ae2?.scene?.calibration),
    (runtime.alignFloorButton.textContent = ae2?.aligned ? "重新对齐" : "对齐楼层"),
    runtime.appCtx.alignmentState?.stage === "reference"
      ? ((runtime.activeToolLabel.textContent = "楼层对齐 · 参照层"),
        (runtime.toolHelpElement.textContent =
          "点击" + runtime.appCtx.alignmentState.referenceFloor.name + "上的楼梯角、墙角或柱点；Esc 取消"))
      : runtime.appCtx.alignmentState?.stage === "current" &&
        ((runtime.activeToolLabel.textContent = "楼层对齐 · 当前层"),
        (runtime.toolHelpElement.textContent =
          "点击" + ae2.name + "上的相同位置；系统会自动重合上下楼层")));
}

export async function selectFloor(runtime: StudioAppRuntime, targetFloorIdSelection: any, { persist: didFloorChange = false } = {}) {
  const targetFloor = runtime.appCtx.studioProject?.floors.find(
    (floorLookup: any) => floorLookup.id === targetFloorIdSelection,
  );
  if (!targetFloor) return;
  const selectionRequestId = ++runtime.appCtx.floorSelectionRequestId,
    tu2 = runtime.getPreviewFloorMode() === "all" ? runtime.captureOverviewCamera() : null;
  (runtime.appCtx.alignmentState?.floorId !== targetFloor.id && (runtime.appCtx.alignmentState = null),
    (runtime.appCtx.activeFloorId = targetFloor.id),
    (runtime.appCtx.studioProject.activeFloorId = targetFloor.id),
    (runtime.appCtx.studioState = targetFloor.scene),
    (runtime.appCtx.activeLightGroupId = ""),
    runtime.refreshSelection(),
    runtime.refreshPreviewScene(),
    runtime.planPainter?.setTool(runtime.appCtx.activeToolName),
    (runtime.appCtx.previewEndPoint = null),
    // C5：切楼层不再清空撤销 / 重做栈（历史是跨楼层的文档补丁）。
    (runtime.appCtx.planView.rotation = runtime.appCtx.studioState.settings.planViewRotation),
    Promise.allSettled(runtime.preloadDefaultModels()));
  const gu2 = runtime.loadBackgroundImage();
  (runtime.isEmbeddedStage || (await gu2),
    !(selectionRequestId !== runtime.appCtx.floorSelectionRequestId || runtime.appCtx.activeFloorId !== targetFloor.id) &&
      (runtime.refreshScopeItems(),
      runtime.renderFloorList(),
      runtime.resetView(),
      requestAnimationFrame(() => {
        if (!(selectionRequestId !== runtime.appCtx.floorSelectionRequestId || runtime.appCtx.activeFloorId !== targetFloor.id)) {
          if (runtime.getPreviewFloorMode() === "all") {
            (tu2 && runtime.applyCameraState(tu2, tu2.viewportAspect),
              runtime.syncCameraModeControls(runtime.getCameraMode()),
              runtime.syncCameraViewControls(runtime.getCameraView()));
            return;
          }
          if (runtime.appCtx.studioState.settings.fixedCameraView) {
            runtime.applyCameraSnapshot({
              recordChange: false,
              silent: true,
            });
            return;
          }
          (runtime.setCameraMode(runtime.getCameraMode(), {
            preserveView: false,
          }),
            runtime.updateCameraView());
        }
      }),
      didFloorChange && runtime.markDocumentDirty()));
}

export async function addNewFloor(runtime: StudioAppRuntime, ) {
  const newFloorRecord = createFloorRecord(runtime.studioDocumentDeps(), runtime.appCtx.studioProject.floors.length);
  ((newFloorRecord.name = runtime.uniqueFloorName(newFloorRecord.name)),
    runtime.appCtx.studioProject.floors.push(newFloorRecord),
    runtime.updateFloorPreviewButtons(),
    await runtime.selectFloor(newFloorRecord.id, {
      persist: false,
    }),
    runtime.markDocumentDirty(),
    runtime.showToast("已新增“" + newFloorRecord.name + "”，导入并校准后会设置上下层参照点。", "success"),
    runtime.selectStudioTool("select"));
}

export function planToWorldPoint(runtime: StudioAppRuntime, calibrationFloor: any, planPoint: any) {
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

export function worldToPlanPoint(runtime: StudioAppRuntime, calibrationSourceFloor: any, worldAnchorPoint: any) {
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

export function worldPointForFloor(runtime: StudioAppRuntime, sourcePoint: any, sourceFloorArg: any, calibratedFloor: any) {
  return runtime.worldToPlanPoint(calibratedFloor, runtime.planToWorldPoint(sourceFloorArg, sourcePoint));
}

export function getActiveWalls(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.alignmentState) return [];
  const ae3 = runtime.getActiveFloor();
  return runtime.appCtx.alignmentState.referenceFloor.scene.walls.map((segmentRecord: any) => ({
    ...segmentRecord,
    start: runtime.worldPointForFloor(segmentRecord.start, runtime.appCtx.alignmentState.referenceFloor, ae3),
    end: runtime.worldPointForFloor(segmentRecord.end, runtime.appCtx.alignmentState.referenceFloor, ae3),
  }));
}

export function startFloorAlign(runtime: StudioAppRuntime, ) {
  const ae4 = runtime.getActiveFloor(),
    activeFloorSequenceIndex =
      runtime.appCtx.studioProject?.floors.findIndex((activeFloorLookup: any) => activeFloorLookup.id === ae4?.id) ??
      -1,
    previousFloor =
      activeFloorSequenceIndex > 0 ? runtime.appCtx.studioProject.floors[activeFloorSequenceIndex - 1] : null;
  if (!(!ae4 || !previousFloor)) {
    if (!ae4.scene.calibration || !previousFloor.scene.calibration) {
      runtime.showToast("当前层和参照层都需要先完成比例校准。", "error");
      return;
    }
    ((runtime.appCtx.alignmentState = {
      floorId: ae4.id,
      referenceFloor: previousFloor,
      stage: "reference",
      referencePoint: null as any,
    }),
      runtime.refreshSelection(),
      runtime.selectStudioTool("select"),
      (runtime.planCanvasElement.style.cursor = "crosshair"),
      runtime.renderFloorList(),
      runtime.refreshStudioView(),
      runtime.showToast("先在半透明的" + previousFloor.name + "上点击一个参照点。"));
  }
}

export function cancelFloorAlign(runtime: StudioAppRuntime, ) {
  runtime.appCtx.alignmentState &&
    ((runtime.appCtx.alignmentState = null),
    (runtime.planCanvasElement.style.cursor = ""),
    runtime.selectStudioTool("select"),
    runtime.renderFloorList(),
    runtime.refreshStudioView(),
    runtime.showToast("已取消楼层对齐。", "success"));
}

export function isSameAlignmentFloor(runtime: StudioAppRuntime, clickedPlanPoint: any) {
  if (!runtime.appCtx.alignmentState) return false;
  const ae5 = runtime.getActiveFloor();
  if (!ae5 || ae5.id !== runtime.appCtx.alignmentState.floorId) return (runtime.cancelFloorAlign(), true);
  if (runtime.appCtx.alignmentState.stage === "reference") {
    const activeWallList = runtime.getActiveWalls(),
      snappedPoint =
        nearestWall2(clickedPlanPoint, activeWallList, 18 / runtime.appCtx.planView.zoom)?.point ||
        clickedPlanPoint;
    return (
      (runtime.appCtx.alignmentState.referencePoint = runtime.worldPointForFloor(
        snappedPoint,
        ae5,
        runtime.appCtx.alignmentState.referenceFloor,
      )),
      (runtime.appCtx.alignmentState.stage = "current"),
      runtime.renderFloorList(),
      runtime.refreshStudioView(),
      runtime.showToast("现在点击" + ae5.name + "上的同一个位置。"),
      true
    );
  }
  const vector =
      nearestWall2(clickedPlanPoint, ae5.scene.walls, 18 / runtime.appCtx.planView.zoom)?.point ||
      clickedPlanPoint,
    $a2 = runtime.planToWorldPoint(runtime.appCtx.alignmentState.referenceFloor, runtime.appCtx.alignmentState.referencePoint);
  return (
    (ae5.originX = vector.x),
    (ae5.originY = vector.y),
    (ae5.originInitialized = true),
    (ae5.offsetX = $a2.x),
    (ae5.offsetZ = $a2.z),
    (ae5.rotation = runtime.appCtx.alignmentState.referenceFloor.rotation || 0),
    (ae5.aligned = true),
    (ae5.alignmentPending = false),
    (ae5.alignment = {
      referenceFloorId: runtime.appCtx.alignmentState.referenceFloor.id,
      referencePoint: {
        ...runtime.appCtx.alignmentState.referencePoint,
      },
      currentPoint: {
        ...vector,
      },
    }),
    (runtime.appCtx.alignmentState = null),
    (runtime.planCanvasElement.style.cursor = ""),
    runtime.selectStudioTool("select"),
    runtime.syncGlobalControls(),
    runtime.refreshStudioView(),
    runtime.requestSceneRebuild({
      force: true,
    }),
    runtime.markDocumentDirty(),
    runtime.showToast(ae5.name + "已与下层参照点对齐。", "success"),
    true
  );
}

export function updatePreviewFloorGap(runtime: StudioAppRuntime, ) {
  const previewFloorGapSize = clamp2(
    finite2(runtime.previewFloorGapInput.value, runtime.appCtx.studioProject?.previewFloorGap || 3),
    0,
    20,
  );
  Math.abs(previewFloorGapSize - finite2(runtime.appCtx.studioProject?.previewFloorGap, 3)) < 0.000001 ||
    ((runtime.appCtx.studioProject.previewFloorGap = previewFloorGapSize),
    (runtime.previewFloorGapInput.value = previewFloorGapSize.toFixed(1)),
    runtime.rebuildFloorLayers(),
    runtime.markDocumentDirty());
}

export function updateUniformOverviewStack(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.studioProject.uniformOverviewStack = runtime.previewFloorUniformInput.checked),
    runtime.refreshSceneRender({
      scene: true,
    }),
    runtime.markDocumentDirty());
}

export function updateExportFloorGap(runtime: StudioAppRuntime, ) {
  const exportFloorGap = clamp2(
    finite2(runtime.exportFloorGapInput.value, runtime.appCtx.studioProject?.exportFloorGap || 3),
    0,
    20,
  );
  Math.abs(exportFloorGap - finite2(runtime.appCtx.studioProject?.exportFloorGap, 3)) < 0.000001 ||
    ((runtime.appCtx.studioProject.exportFloorGap = exportFloorGap),
    (runtime.exportFloorGapInput.value = exportFloorGap.toFixed(1)),
    runtime.rebuildFloorLayers(),
    (runtime.exportStatusElement.textContent = "全楼层间距已设为 " + exportFloorGap.toFixed(1) + " m"),
    runtime.markDocumentDirty());
}

/** 逐槽表面参数的**入库净化**：只接受 `{ "<GLB 材质名>": { roughness?, metalness? } }`，两个值都规整到 0–1 并按两位小数定下来（避免浮点尾数让产物不稳定）。 */
export function captureUndoSnapshot(runtime: StudioAppRuntime, snapshotSource = runtime.appCtx.studioState) {
  return structuredClone(snapshotSource);
}

export function resolveLightGroup(runtime: StudioAppRuntime, lightGroupOwner: any) {
  return (
    runtime.appCtx.studioState.lightGroups?.find(
      (matchedLightGroup) => matchedLightGroup.id === lightGroupOwner?.lightGroupId,
    ) ||
    runtime.appCtx.studioState.lightGroups?.[0] ||
    null
  );
}

export function resolveFloorDefaultGroup(runtime: StudioAppRuntime, lightGroupOwnerItem: any, ownerScene = runtime.appCtx.studioState) {
  return (
    ownerScene?.lightGroups?.find(
      (lightGroupMatch) => lightGroupMatch.id === lightGroupOwnerItem?.lightGroupId,
    ) ||
    ownerScene?.lightGroups?.[0] ||
    null
  );
}

export function isLampEnabled(runtime: StudioAppRuntime, lampStateRef: any) {
  return runtime.appCtx.overriddenFloorIds !== null
    ? runtime.appCtx.overriddenFloorIds.has(lampStateRef.id)
    : runtime.resolveLightGroup(lampStateRef)?.enabled === false
      ? false
      : runtime.appCtx.pendingRuntimeSettings || runtime.appCtx.isLightOverrideOn || !runtime.areLightsEnabled();
}

export function getScreenLightGroups(runtime: StudioAppRuntime, ) {
  return runtime.appCtx.studioState.items.filter((tvItem) => tvItem.type === "tv");
}

export function getChargingLightGroups(runtime: StudioAppRuntime, ) {
  return runtime.appCtx.studioState.items.filter((vehicleItem) =>
    ["smallcar", "suv", "scooter"].includes(vehicleItem.type),
  );
}

export function getOrderedFloorList(runtime: StudioAppRuntime, ) {
  return runtime.getPreviewFloorMode() === "all"
    ? runtime.appCtx.studioProject.floors
    : [runtime.getActiveFloor()].filter(Boolean);
}

export function floorElevationFor(runtime: StudioAppRuntime, elevationFloorRef: any) {
  if (runtime.getPreviewFloorMode() !== "all") return 0;
  const elevationFloorIndex = runtime.appCtx.studioProject.floors.findIndex(
    (elevationFloorMatch: any) => elevationFloorMatch.id === elevationFloorRef?.id,
  );
  return Math.max(elevationFloorIndex, 0) * finite2(runtime.appCtx.studioProject.exportFloorGap, 3);
}

export function composeLightGroupKey(runtime: StudioAppRuntime, groupKeyFloor: any, groupKeyGroup: any) {
  return runtime.getPreviewFloorMode() === "all" ? composeKey(groupKeyFloor, groupKeyGroup) : groupKeyGroup;
}

export function collectLampEntries(runtime: StudioAppRuntime, ) {
  return (
    runtime.getPreviewFloorMode() === "all"
      ? runtime.appCtx.studioProject?.floors || []
      : [runtime.getActiveFloor()].filter(Boolean)
  ).flatMap((floorEntryLamp: any) =>
    floorEntryLamp.scene.items
      .filter((lampItem: any) => lampItemTypeSet.has(lampItem.type))
      .map((lampItemRef: any) => {
        const dy2 = runtime.resolveFloorDefaultGroup(lampItemRef, floorEntryLamp.scene);
        return {
          floor: floorEntryLamp,
          item: lampItemRef,
          group: dy2,
          itemKey: composeItemKey(floorEntryLamp.id, lampItemRef.id),
          groupKey: runtime.composeLightGroupKey(floorEntryLamp.id, dy2?.id || "__ungrouped"),
        };
      }),
  );
}

export function listLightGroupRows(runtime: StudioAppRuntime, lightGroupFloors = runtime.appCtx.studioProject?.floors || []) {
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

export function listScreenRows(runtime: StudioAppRuntime, screenFloors = runtime.appCtx.studioProject?.floors || []) {
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

export function listChargingRows(runtime: StudioAppRuntime, chargingFloors = runtime.appCtx.studioProject?.floors || []) {
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

export function syncScreenLayers(runtime: StudioAppRuntime, floorArgScreen: any) {
  const screenLayerNameSet = new Set(
    runtime.getScreenLightGroups().map((screenLayerEntry: any) => screenLayerEntry.screenLayerName),
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

export function syncChargingLayers(runtime: StudioAppRuntime, floorArgCharging: any) {
  const chargingLayerNameSet = new Set(
    runtime.getChargingLightGroups().map((chargingLayerEntry: any) => chargingLayerEntry.chargingLayerName),
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

export function pushUndoEntry(runtime: StudioAppRuntime, undoSnapshotArg: any) {
  (runtime.syncScreenLayers(undoSnapshotArg), runtime.syncChargingLayers(undoSnapshotArg));
}
