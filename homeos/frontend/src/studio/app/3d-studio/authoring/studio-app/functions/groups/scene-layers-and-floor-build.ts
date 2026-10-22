import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { compactStaticDeviceParts as compactStaticDeviceParts2 } from "../../../items/studio-device-batching";
import { isCourtyardPlanItem as isCourtyardPlanItem2 } from "../../../../plan/courtyard-plan";
import { courtyardFootprintLoops as courtyardFootprintLoops2, outerPerimeterLine as outerPerimeterLine2, sceneModelOrigin as sceneModelOrigin2 } from "../../../../plan/courtyard-drawing";
import { applyShadowReceiverTrial as applyShadowReceiverTrial2 } from "../../../studio-shadow-receiver-trial";
import { buildStaticMaterialKey } from "../../../../materials/studio-static-material-key";
import { compactRuntimeFurniture as compactRuntimeFurniture2 } from "../../../items/studio-runtime-furniture";
import { cacheObjectTransforms as cacheObjectTransforms2 } from "../../../../../bridge/scene/scene-matrices";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { mergeGeometries as mergeGeometries2 } from "/static/vendor/three/0.186.1/BufferGeometryUtils.js";
import { axisLockedPoint as axisLockedPoint2, clamp as clamp2, distance as distance2, polygonArea as polygonArea2, snapPoint as snapPoint2, subtractPolygonLoops as subtractPolygonLoops2 } from "../../../../plan/geometry";
import { finite as finite2 } from "../../../../loaders/studio-normalization";
import { lampItemTypeSet } from "../../../items/item-catalog";
import type { UpdateCameraViewOptions } from "../../../types/studio-app-types";
import { precompileShaderPrograms } from "../../../scene/studio-shader-precompile";
import { minPointDistance } from "../../../scene/studio-scene-payload";
import { applyItemOrientation } from "../../scene/item-orientation";
import { buildFloorEdgeOutline } from "../../scene/floor-edge";

export function buildCourtyardFoundation(runtime: StudioAppRuntime, { ppm: courtyardPixelsPerMeter, toWorld: courtyardToWorld }: any) {
  const floorEdgeIndoorLoops = runtime.appCtx.sceneRootNode.userData.floorEdgeIndoorLoops;
  if (!floorEdgeIndoorLoops) return;
  const courtyardDrawingList = runtime.appCtx.studioState.items.filter(
      (courtyardDrawingItem) =>
        courtyardDrawingItem.type === "courtyard-area" ||
        courtyardDrawingItem.type === "courtyard-fence",
    ),
    floorEdge = runtime.backgroundSettings().floorEdge,
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
      runtime.appCtx.studioState.settings.floorEdgeVisible,
    ]);
  if (runtime.appCtx.sceneRootNode.userData.floorEdgeKey === courtyardSignature) return;
  for (const foundationChildObject of [...runtime.appCtx.sceneRootNode.children])
    (foundationChildObject.userData.exportRole === "outline" ||
      foundationChildObject.userData.courtyardFoundation) &&
      (runtime.appCtx.sceneRootNode.remove(foundationChildObject), runtime.disposeObjectTree(foundationChildObject));
  runtime.appCtx.sceneRootNode.userData.floorEdgeKey = courtyardSignature;
  const courtyardFootprintLoops = courtyardDrawingList.length
      ? courtyardFootprintLoops2(
          floorEdgeIndoorLoops,
          courtyardDrawingList,
          courtyardPixelsPerMeter,
          courtyardToWorld,
          runtime.appCtx.studioState.walls,
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
        ...(runtime.appCtx.sceneRootNode.userData.floorEdgeOpenings || []),
      ],
      holedFootprintLoops = subtractPolygonLoops2(outerFootprintLoops, cutoutLoops, 0.00001),
      ms4 = runtime.buildShapesWithHoles(holedFootprintLoops);
    if (ms4.length) {
      const foundationMesh = new ns2.Mesh(
        new ns2.ExtrudeGeometry(ms4, {
          depth: 0.16,
          bevelEnabled: false,
          steps: 1,
        }),
        runtime.createFloorMaterial(),
      );
      ((foundationMesh.rotation.x = Math.PI / 2),
        (foundationMesh.position.y = -0.008),
        (foundationMesh.receiveShadow = true),
        Object.assign(foundationMesh.userData, {
          courtyardFoundation: true,
          exportRole: "plan",
          regionReceiverKind: "floor",
          regionFloorId: runtime.appCtx.activeFloorId,
        }),
        runtime.appCtx.sceneRootNode.add(foundationMesh));
    }
  }
  if (runtime.appCtx.studioState.settings.floorEdgeVisible !== false) {
    for (const closedFootprintLoop of outerFootprintLoops)
      buildFloorEdgeOutline(
        runtime.appCtx, courtyardDrawingList.length
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

export function buildGroundShadow(runtime: StudioAppRuntime, groundShadowLoopList: any, groundShadowHeight: any, groundShadowHoles: any[] = []) {
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
    const shadowLayerPoints = runtime.expandPolygonOutward(
        groundShadowPoints,
        shadowLayerConfig.spread,
      ).map((shadowLayerPoint: any) => ({
        x: shadowLayerPoint.x + shadowLayerConfig.offsetX,
        y: shadowLayerPoint.y + shadowLayerConfig.offsetY,
      })),
      ms5 = groundShadowHoles.length
        ? runtime.buildShapesWithHoles(subtractPolygonLoops2([shadowLayerPoints], groundShadowHoles))
        : runtime.createOutlinePath(ns2.Shape, shadowLayerPoints),
      groundShadowMesh = new ns2.Mesh(
        new ns2.ShapeGeometry(ms5, 1),
        new ns2.MeshBasicMaterial({
          color: 329482,
          transparent: true,
          opacity: shadowLayerConfig.opacity,
          depthWrite: false,
          toneMapped: false,
          side: ns2.DoubleSide,
          forceSinglePass: runtime.isEmbeddedStage,
        }),
      );
    ((groundShadowMesh.rotation.x = Math.PI / 2),
      (groundShadowMesh.position.y = groundShadowHeight + 0.001 + shadowLayerIndex * 0.00015),
      (groundShadowMesh.userData.floorPlanGroundShadow = true),
      (groundShadowMesh.userData.exportRole = "background"),
      (groundShadowMesh.visible = runtime.appCtx.sceneStyle !== "warm-wood"),
      (groundShadowMesh.renderOrder = 1 + shadowLayerIndex),
      runtime.appCtx.sceneRootNode.add(groundShadowMesh));
  });
}

export function getPreviewFloorMode(runtime: StudioAppRuntime, ) {
  return runtime.appCtx.studioProject?.previewFloorMode === "all" && runtime.appCtx.studioProject.floors.length > 1
    ? "all"
    : "active";
}

export function updateFloorPreviewButtons(runtime: StudioAppRuntime, ) {
  const le2 = runtime.getPreviewFloorMode(),
    shouldEnableFloorPreview = (runtime.appCtx.studioProject?.floors.length || 0) > 1;
  for (const floorPreviewButton of runtime.previewFloorControls) {
    const isActiveFloorPreviewButton = floorPreviewButton.dataset.previewFloor === le2;
    (floorPreviewButton.classList.toggle("active", isActiveFloorPreviewButton),
      floorPreviewButton.setAttribute("aria-pressed", String(isActiveFloorPreviewButton)),
      (floorPreviewButton.disabled =
        floorPreviewButton.dataset.previewFloor === "all" && !shouldEnableFloorPreview));
  }
}

export function setPreviewFloor(runtime: StudioAppRuntime, previewFloorId: any, { persist: shouldPersistPreview = true } = {}) {
  runtime.appCtx.studioProject &&
    ((runtime.appCtx.studioProject.previewFloorMode =
      previewFloorId === "all" && runtime.appCtx.studioProject.floors.length > 1 ? "all" : "active"),
    runtime.updateFloorPreviewButtons(),
    runtime.refreshFloorControls(),
    runtime.setCameraMode(runtime.getCameraMode(), {
      preserveView: false,
    }),
    Promise.allSettled(runtime.preloadDefaultModels()),
    runtime.rebuildFloorLayers(),
    runtime.updateCameraView(),
    shouldPersistPreview && runtime.markDocumentDirty());
}

export function rebuildFloorLayers(runtime: StudioAppRuntime, floorRebuildOptions: Record<string, any> = {}) {
  if (runtime.appCtx.isSceneStillLoading) {
    runtime.assetLoaderState.revision++;
    return;
  }
  // 预览重建期间先不销毁旧材质/几何，交给交接队列在渲染帧结束后统一回收。
  const rebuildFloors = () => {
    for (const _floorLayerEntry of runtime.buildFloorsAsync(floorRebuildOptions));
  };
  runtime.previewResources
    ? runtime.previewResources.run(rebuildFloors, !runtime.isEmbeddedStage && !runtime.appCtx.isRenderSuppressed && !document.hidden)
    : rebuildFloors();
}

export async function waitForSceneRevision(runtime: StudioAppRuntime, ) {
  const sceneAtStart = runtime.appCtx.studioProject,
    rootAtStart = runtime.appCtx.sceneRootNode,
    isSceneRevisionCurrent = () =>
      !runtime.assetLoaderState.disposed && sceneAtStart === runtime.appCtx.studioProject && rootAtStart === runtime.appCtx.sceneRootNode;
  for (; isSceneRevisionCurrent();) {
    const revision = runtime.assetLoaderState.revision,
      bg2 = runtime.buildFloorsAsync();
    try {
      let shouldWaitForScene = false;
      for (; isSceneRevisionCurrent() && revision === runtime.assetLoaderState.revision;) {
        if (bg2.next().done) {
          shouldWaitForScene = true;
          break;
        }
        await new Promise(requestAnimationFrame);
      }
      if (shouldWaitForScene)
        return (
          (runtime.appCtx.isSceneStillLoading = false),
          runtime.updateExternalModelDataset(),
          runtime.scheduleExternalPrecompile(),
          (runtime.appCtx.isSceneDirty = false),
          runtime.refreshPreviewSync(),
          true
        );
    } finally {
      bg2.return();
    }
  }
  return false;
}

export async function waitForSceneReady(runtime: StudioAppRuntime, sceneWaitTimeout: any = null) {
  if (!runtime.isEmbedStageMode || !runtime.appCtx.regionLightController || !runtime.appCtx.threeRenderer) return;
  const sceneSnapshotRef = runtime.appCtx.sceneRootNode,
    floorsSnapshotRef = runtime.appCtx.threeRenderer,
    ue3 = runtime.appCtx.threeScene,
    cameraSnapshotRef = runtime.appCtx.threeCamera,
    Gt2 = runtime.appCtx.sceneRevisionCount,
    isSceneStable = () =>
      !runtime.assetLoaderState.disposed &&
      !runtime.appCtx.isDisposed &&
      !document.hidden &&
      runtime.appCtx.isHighDetailQuality &&
      runtime.appCtx.sceneRootNode === sceneSnapshotRef &&
      runtime.appCtx.threeRenderer === floorsSnapshotRef &&
      runtime.appCtx.threeScene === ue3 &&
      runtime.appCtx.threeCamera === cameraSnapshotRef &&
      runtime.appCtx.sceneRevisionCount === Gt2;
  (ue3.updateMatrixWorld(true),
    runtime.appCtx.regionLightController.sync(cameraSnapshotRef),
    sceneWaitTimeout?.preparePresentationMaterials?.(
      sceneSnapshotRef,
      Gt2 + ":" + runtime.appCtx.curtainFrameKey,
    ));
  try {
    await precompileShaderPrograms(floorsSnapshotRef, ue3, cameraSnapshotRef, isSceneStable, {
      visibleOnly: true,
      pollInterval: 16,
    });
  } catch { /* 着色器预编译是预热优化：失败时退回按需编译，不影响渲染正确性 */ }
}

export function* buildFloorsAsync(runtime: StudioAppRuntime, {
  preserveLightCache: preserveLightCacheSnapshot = false,
} = {}): Generator<any, void, unknown> {
  if (!runtime.appCtx.sceneRootNode) return;
  if ((runtime.stageLoadTiming("model-build"), runtime.getPreviewFloorMode() !== "all")) {
    (runtime.buildStudioScene({
      preserveLightCache: preserveLightCacheSnapshot,
    }),
      runtime.computeSceneExtent());
    return;
  }
  const rootForFloors = runtime.appCtx.sceneRootNode,
    viewModelForFloors = runtime.appCtx.studioState,
    oe5 = runtime.appCtx.activeFloorId,
    nn3 = runtime.appCtx.sceneModelOrigin;
  (runtime.refreshBaseLighting(),
    runtime.disposeFloorScene(),
    runtime.refreshSceneRender({
      shadows: true,
      scene: true,
      preserveLightCache: preserveLightCacheSnapshot,
    }));
  const sort6 = [...runtime.appCtx.studioProject.floors].sort(
      (firstFloor, secondFloor) => firstFloor.elevation - secondFloor.elevation,
    ),
    floorGap = runtime.appCtx.pendingRuntimeSettings
      ? finite2(runtime.appCtx.studioProject.exportFloorGap, 3)
      : finite2(runtime.appCtx.studioProject.previewFloorGap, 3);
  for (const [floorSortIndex, preserveLightCacheSnapshotFloorRecord] of sort6.entries()) {
    const floorGroupContainer = new ns2.Group();
    ((floorGroupContainer.name = "floor-" + preserveLightCacheSnapshotFloorRecord.id),
      (floorGroupContainer.userData.floorId = preserveLightCacheSnapshotFloorRecord.id));
    try {
      ((runtime.appCtx.sceneRootNode = floorGroupContainer),
        (runtime.appCtx.studioState = preserveLightCacheSnapshotFloorRecord.scene),
        (runtime.appCtx.activeFloorId = preserveLightCacheSnapshotFloorRecord.id),
        (runtime.appCtx.sceneModelOrigin = {
          x: finite2(preserveLightCacheSnapshotFloorRecord.originX, 0),
          y: finite2(preserveLightCacheSnapshotFloorRecord.originY, 0),
        }),
        runtime.buildStudioScene({
          preserveLightCache: preserveLightCacheSnapshot,
        }));
    } catch (floorBuildError: any) {
      throw (runtime.disposeObjectTree(floorGroupContainer), floorBuildError);
    } finally {
      ((runtime.appCtx.sceneRootNode = rootForFloors),
        (runtime.appCtx.studioState = viewModelForFloors),
        (runtime.appCtx.activeFloorId = oe5),
        (runtime.appCtx.sceneModelOrigin = nn3));
    }
    if (floorSortIndex > 0) {
      for (const preserveLightCacheSnapshotFloorChildObject of [...floorGroupContainer.children])
        if (
          ["background", "grid"].includes(
            preserveLightCacheSnapshotFloorChildObject.userData?.exportRole,
          )
        ) {
          if (runtime.isEmbeddedStage) {
            ((preserveLightCacheSnapshotFloorChildObject.userData.floorBackgroundHidden = true),
              (preserveLightCacheSnapshotFloorChildObject.visible = false));
            continue;
          }
          (floorGroupContainer.remove(preserveLightCacheSnapshotFloorChildObject),
            runtime.disposeObjectTree(preserveLightCacheSnapshotFloorChildObject));
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
  ((runtime.appCtx.sceneRootNode = rootForFloors),
    (runtime.appCtx.studioState = viewModelForFloors),
    (runtime.appCtx.activeFloorId = oe5),
    (runtime.appCtx.sceneModelOrigin = nn3),
    runtime.setupSceneShadows(runtime.appCtx.sceneRootNode, {
      rebuildAtlas: !preserveLightCacheSnapshot,
    }),
    runtime.computeSceneExtent(),
    runtime.refreshSceneRender({
      shadows: true,
      scene: true,
      preserveLightCache: preserveLightCacheSnapshot,
    }));
}

export function syncFloorGroups(runtime: StudioAppRuntime, layerKeySet: any) {
  if (!layerKeySet.size || !runtime.appCtx.sceneRootNode) return;
  if (runtime.getPreviewFloorMode() !== "all") {
    layerKeySet.has(runtime.appCtx.activeFloorId) && runtime.rebuildFloorLayers();
    return;
  }
  const rootForFloorSync = runtime.appCtx.sceneRootNode,
    viewModelForFloorSync = runtime.appCtx.studioState,
    oe6 = runtime.appCtx.activeFloorId,
    nn4 = runtime.appCtx.sceneModelOrigin,
    sort7 = [...runtime.appCtx.studioProject.floors].sort(
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
    runtime.rebuildFloorLayers();
    return;
  }
  try {
    for (const [floorSyncIndex, syncFloorRecord] of sort7.entries())
      if (
        layerKeySet.has(syncFloorRecord.id) &&
        ((runtime.appCtx.sceneRootNode = rootForFloorSync.children.find(
          (matchingFloorChild: any) => matchingFloorChild.userData?.floorId === syncFloorRecord.id,
        )),
        (runtime.appCtx.studioState = syncFloorRecord.scene),
        (runtime.appCtx.activeFloorId = syncFloorRecord.id),
        (runtime.appCtx.sceneModelOrigin = {
          x: finite2(syncFloorRecord.originX, 0),
          y: finite2(syncFloorRecord.originY, 0),
        }),
        runtime.appCtx.sceneRootNode.position.set(
          finite2(syncFloorRecord.offsetX, 0),
          floorSyncIndex * runtime.appCtx.studioProject.previewFloorGap,
          finite2(syncFloorRecord.offsetZ, 0),
        ),
        runtime.appCtx.sceneRootNode.rotation.set(
          0,
          -ns2.MathUtils.degToRad(finite2(syncFloorRecord.rotation, 0)),
          0,
        ),
        runtime.appCtx.sceneRootNode.scale.set(1, 1, 1),
        runtime.buildStudioScene(),
        floorSyncIndex > 0)
      ) {
        for (const staleFloorChild of [...runtime.appCtx.sceneRootNode.children])
          if (["background", "grid"].includes(staleFloorChild.userData?.exportRole)) {
            if (runtime.isEmbeddedStage) {
              ((staleFloorChild.userData.floorBackgroundHidden = true),
                (staleFloorChild.visible = false));
              continue;
            }
            (runtime.appCtx.sceneRootNode.remove(staleFloorChild), runtime.disposeObjectTree(staleFloorChild));
          }
      }
  } finally {
    ((runtime.appCtx.sceneRootNode = rootForFloorSync),
      (runtime.appCtx.studioState = viewModelForFloorSync),
      (runtime.appCtx.activeFloorId = oe6),
      (runtime.appCtx.sceneModelOrigin = nn4));
  }
  (runtime.setupSceneShadows(rootForFloorSync), runtime.computeSceneExtent());
}

export function createFloorWorldMapper(runtime: StudioAppRuntime, ) {
  const floorMapperPpm = runtime.getPixelsPerMeter();
  if (!floorMapperPpm) return null;
  const nn5 = runtime.appCtx.sceneModelOrigin || sceneModelOrigin2(runtime.appCtx.studioState, runtime.getActiveFloor()),
    floorMapperOriginX = nn5.x,
    floorMapperOriginY = nn5.y;
  return {
    ppm: floorMapperPpm,
    floorSurfaceY: -0.008,
    floorPolygons: runtime.closedWallLoops(floorMapperPpm),
    toWorld: (mapperPoint: any) => ({
      x: (mapperPoint.x - floorMapperOriginX) / floorMapperPpm,
      z: (mapperPoint.y - floorMapperOriginY) / floorMapperPpm,
    }),
  };
}

export function previewTransformContext(runtime: StudioAppRuntime, ) {
  const previewTransformOrigin = runtime.appCtx.sceneModelOrigin || sceneModelOrigin2(runtime.appCtx.studioState, runtime.getActiveFloor());
  return {
    items: runtime.appCtx.studioState.items,
    contextKey: JSON.stringify([
      runtime.appCtx.activeFloorId,
      runtime.getPreviewFloorMode(),
      previewTransformOrigin,
      runtime.backgroundSettings(),
      runtime.appCtx.baseLightingSettings,
      runtime.appCtx.studioState.settings,
      runtime.appCtx.studioState.background,
      runtime.appCtx.studioState.walls,
      runtime.appCtx.studioState.windows,
      runtime.appCtx.studioState.doors,
      runtime.appCtx.studioState.railings,
    ]),
    isEligible: (previewCandidate: any) =>
      !lampItemTypeSet.has(previewCandidate.type) &&
      previewCandidate.type !== "flooropening" &&
      !isCourtyardPlanItem2(previewCandidate),
    isSelected: (previewCandidate: any) => runtime.createSelectionRef("item", previewCandidate.id),
  };
}

export function capturePreviewTransforms(runtime: StudioAppRuntime, layerItemRecords: any) {
  runtime.isEmbeddedStage ||
    runtime.isEmbedStageMode ||
    !runtime.appCtx.sceneRootNode ||
    runtime.previewTransformCache.capture(runtime.appCtx.sceneRootNode, {
      ...runtime.previewTransformContext(),
      groups: layerItemRecords,
    });
}

export function applyPreviewTransforms(runtime: StudioAppRuntime, 
  worldMapper: any,
  { preserveLightCache: shouldPreservePreviewLightCache, shadowRoot: previewShadowRoot }: any,
) {
  if (runtime.isEmbeddedStage || runtime.isEmbedStageMode || !runtime.appCtx.sceneRootNode) return false;
  const movedTransforms = runtime.previewTransformCache.plan(runtime.appCtx.sceneRootNode, runtime.previewTransformContext());
  if (!movedTransforms) return false;
  for (const { item: movedItem, group: movedGroup } of movedTransforms) {
    const world = worldMapper.toWorld(movedItem);
    (movedGroup.position.set(world.x, movedItem.elevation || 0, world.z),
      applyItemOrientation(movedGroup, movedItem));
  }
  return (
    runtime.previewTransformCache.commit(runtime.appCtx.sceneRootNode, movedTransforms),
    movedTransforms.length &&
      (runtime.setupSceneShadows(previewShadowRoot, {
        rebuildAtlas: !shouldPreservePreviewLightCache,
      }),
      runtime.refreshSceneRender({
        shadows: !shouldPreservePreviewLightCache,
        preserveLightCache: shouldPreservePreviewLightCache,
      })),
    true
  );
}

export function buildSceneLayers(runtime: StudioAppRuntime, layerKeyList: any) {
  if (runtime.appCtx.sceneRootNode) {
    for (const layerChildObject of [...runtime.appCtx.sceneRootNode.children])
      layerChildObject.userData.modelLayer === layerKeyList &&
        (runtime.appCtx.sceneRootNode.remove(layerChildObject), runtime.disposeObjectTree(layerChildObject));
  }
}

export function buildLayerGroup(runtime: StudioAppRuntime, 
  layerKey: any,
  {
    preserveLightCache: preserveLayerLightCache = false,
    shadowRoot: layerShadowRoot = runtime.appCtx.sceneRootNode,
    allowTransforms: allowLayerTransforms = false,
  } = {},
) {
  if (!runtime.appCtx.sceneRootNode) return;
  const mg3 = runtime.createFloorWorldMapper();
  if (!mg3) return;
  if (layerKey === "items" && allowLayerTransforms && runtime.applyPreviewTransforms(mg3, {
    preserveLightCache: preserveLayerLightCache,
    shadowRoot: layerShadowRoot,
  }))
    return;
  runtime.buildSceneLayers(layerKey);
  const isLightsLayer = layerKey === "lights",
    $u3 = isLightsLayer ? runtime.collectLightSourceSpecs() : null,
    layerItemRecords: any[] = [];
  for (const layerItem of runtime.appCtx.studioState.items) {
    if (lampItemTypeSet.has(layerItem.type) !== isLightsLayer) continue;
    const world = mg3.toWorld(layerItem);
    if (layerItem.type === "flooropening") continue;
    const vu3 = runtime.buildItemModel(layerItem, $u3);
    (runtime.isEmbeddedStage &&
      !runtime.createSelectionRef("item", layerItem.id) &&
      compactStaticDeviceParts2(ns2, vu3, layerItem.type, buildStaticMaterialKey),
      runtime.isEmbeddedStage &&
        Object.assign(vu3.userData, {
          editorModelId: layerItem.id,
          editorFloorId: runtime.appCtx.activeFloorId,
        }),
      runtime.isEmbedStageMode &&
        ["smallcar", "suv", "scooter"].includes(layerItem.type) &&
        (vu3.userData.preserveDetailedSurface = true),
      runtime.isEmbeddedStage &&
        [
          "airer",
          "fan",
          "ceiling-fan",
          "exhaust-fan",
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
        (vu3.userData.environmentFloorId = runtime.appCtx.activeFloorId)),
      vu3.position.set(world.x, layerItem.elevation || 0, world.z),
      applyItemOrientation(vu3, layerItem),
      (vu3.userData.modelLayer = layerKey),
      runtime.appCtx.sceneRootNode.add(vu3),
      isLightsLayer ||
        layerItemRecords.push({
          item: layerItem,
          group: vu3,
        }));
  }
  (isLightsLayer ||
    (runtime.batchSharedMeshes(runtime.appCtx.sceneRootNode, layerItemRecords),
    runtime.isEmbeddedStage &&
      new URLSearchParams(window.location.search).get("furniture-runtime") !== "baseline" &&
      compactRuntimeFurniture2(
        runtime.appCtx.sceneRootNode,
        layerItemRecords.filter(
          ({ item: layerItemRef }) => !runtime.createSelectionRef("item", layerItemRef.id),
        ),
        {
          THREE: ns2,
          mergeGeometries: mergeGeometries2,
          materialKey: buildStaticMaterialKey,
        },
      ),
    runtime.mergeStaticItemMeshes(runtime.appCtx.sceneRootNode, layerItemRecords),
    runtime.buildCourtyardFoundation(mg3)),
    runtime.setupSceneShadows(layerShadowRoot, {
      rebuildAtlas: !preserveLayerLightCache,
    }),
    applyShadowReceiverTrial2(runtime.appCtx.sceneRootNode),
    runtime.isEmbeddedStage && cacheObjectTransforms2(runtime.appCtx.sceneRootNode, ns2.Object3D),
    isLightsLayer && runtime.requestStudioRender(),
    runtime.refreshSceneRender({
      shadows: !isLightsLayer && !preserveLayerLightCache,
      preserveLightCache: preserveLayerLightCache,
    }),
    isLightsLayer || runtime.capturePreviewTransforms(layerItemRecords));
}

export function buildArchitectureLayer(runtime: StudioAppRuntime, {
  preserveLightCache: preserveArchitectureLightCache = false,
  shadowRoot: architectureShadowRoot = runtime.appCtx.sceneRootNode,
} = {}) {
  const mg4 = runtime.createFloorWorldMapper();
  !runtime.appCtx.sceneRootNode ||
    !mg4 ||
    (runtime.buildSceneLayers("architecture"),
    runtime.buildInteriorScene(mg4),
    preserveArchitectureLightCache || runtime.appCtx.contactShadowController?.invalidate(),
    runtime.setupSceneShadows(architectureShadowRoot, {
      rebuildAtlas: !preserveArchitectureLightCache,
    }),
    runtime.refreshSceneRender({
      shadows: !preserveArchitectureLightCache,
      scene: true,
      preserveLightCache: preserveArchitectureLightCache,
    }));
}

export function buildItemsLayer(runtime: StudioAppRuntime, itemsLayerOptions: Record<string, any> = {}) {
  runtime.buildLayerGroup("items", itemsLayerOptions);
}

export function buildLightsLayer(runtime: StudioAppRuntime, lightsLayerOptions: Record<string, any> = {}) {
  runtime.buildLayerGroup("lights", lightsLayerOptions);
}

export function buildFloorAtIndex(runtime: StudioAppRuntime, requestedLayerSet: any, sceneLayerOptions: any) {
  const floorBuildRoot = runtime.appCtx.sceneRootNode,
    nn6 = runtime.appCtx.sceneModelOrigin;
  if (runtime.getPreviewFloorMode() === "all") {
    const floorRecordAtId = runtime.appCtx.studioProject.floors.find(
        (candidateFloor: any) => candidateFloor.id === runtime.appCtx.activeFloorId,
      ),
      floorGroupAtId = floorBuildRoot?.children.find(
        (floorGroupChild: any) => floorGroupChild.userData?.floorId === runtime.appCtx.activeFloorId,
      );
    if (!floorRecordAtId || !floorGroupAtId) {
      runtime.rebuildFloorLayers(sceneLayerOptions);
      return;
    }
    ((runtime.appCtx.sceneRootNode = floorGroupAtId),
      (runtime.appCtx.sceneModelOrigin = {
        x: finite2(floorRecordAtId.originX, 0),
        y: finite2(floorRecordAtId.originY, 0),
      }));
  }
  try {
    const floorBuildOptions = {
      ...sceneLayerOptions,
      shadowRoot: floorBuildRoot,
    };
    (requestedLayerSet.has("architecture") && runtime.buildArchitectureLayer(floorBuildOptions),
      requestedLayerSet.has("items") && runtime.buildItemsLayer(floorBuildOptions),
      requestedLayerSet.has("lights") && runtime.buildLightsLayer(floorBuildOptions));
  } finally {
    ((runtime.appCtx.sceneRootNode = floorBuildRoot), (runtime.appCtx.sceneModelOrigin = nn6));
  }
}

export function buildLayerForFloor(runtime: StudioAppRuntime, floorLayerKey: any, layerFloorOptions: Record<string, any> = {}) {
  const layerFloorRoot = runtime.appCtx.sceneRootNode,
    viewModelForLayer = runtime.appCtx.studioState,
    oe7 = runtime.appCtx.activeFloorId,
    nn7 = runtime.appCtx.sceneModelOrigin,
    sort8 = [...(runtime.appCtx.studioProject?.floors || [])].sort(
      (firstLayerFloor, secondLayerFloor) => firstLayerFloor.elevation - secondLayerFloor.elevation,
    );
  if (!layerFloorRoot || !sort8.length) return false;
  try {
    for (const layerFloorRecord of sort8) {
      const layerFloorGroup = layerFloorRoot.children.find(
        (layerFloorChild: any) => layerFloorChild.userData?.floorId === layerFloorRecord.id,
      );
      if (!layerFloorGroup) return false;
      ((runtime.appCtx.sceneRootNode = layerFloorGroup),
        (runtime.appCtx.studioState = layerFloorRecord.scene),
        (runtime.appCtx.activeFloorId = layerFloorRecord.id),
        (runtime.appCtx.sceneModelOrigin = {
          x: finite2(layerFloorRecord.originX, 0),
          y: finite2(layerFloorRecord.originY, 0),
        }),
        runtime.buildLayerGroup(floorLayerKey, {
          ...layerFloorOptions,
          shadowRoot: layerFloorRoot,
        }));
    }
  } finally {
    ((runtime.appCtx.sceneRootNode = layerFloorRoot),
      (runtime.appCtx.studioState = viewModelForLayer),
      (runtime.appCtx.activeFloorId = oe7),
      (runtime.appCtx.sceneModelOrigin = nn7));
  }
  return (runtime.computeSceneExtent(), true);
}

export function isDescendantOfRoot(runtime: StudioAppRuntime, ancestorStartNode: any, ancestorStopSet: any) {
  for (
    let isDescendantOfRootAncestorNode = ancestorStartNode;
    isDescendantOfRootAncestorNode && isDescendantOfRootAncestorNode !== runtime.appCtx.sceneRootNode;
    isDescendantOfRootAncestorNode = isDescendantOfRootAncestorNode.parent
  )
    if (ancestorStopSet.has(isDescendantOfRootAncestorNode.userData?.modelLayer)) return true;
  return false;
}

export function computeSceneBounds(runtime: StudioAppRuntime, { excludeModelLayers: excludeModelLayers = null }: any = {}) {
  const sceneBoundsBox = new ns2.Box3();
  return (
    runtime.appCtx.sceneRootNode.updateWorldMatrix(true, true),
    runtime.appCtx.sceneRootNode.traverse((boundsMeshNode: any) => {
      if (
        !(
          !boundsMeshNode.isMesh ||
          ["background", "grid", "light-source-preview"].includes(
            boundsMeshNode.userData?.exportRole,
          )
        ) &&
        !(excludeModelLayers && runtime.isDescendantOfRoot(boundsMeshNode, excludeModelLayers))
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

export function computeSceneExtent(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.isGroundShadowEnabled || !runtime.appCtx.mainDirectionalLight?.shadow?.camera || !runtime.appCtx.sceneRootNode)
    return false;
  const qu4 = runtime.computeSceneBounds();
  if (qu4.isEmpty()) return false;
  (runtime.appCtx.sceneRootNode.updateWorldMatrix(true, true),
    runtime.appCtx.mainDirectionalLight.updateWorldMatrix(true, false),
    runtime.appCtx.mainDirectionalLight.target.updateWorldMatrix(true, false));
  const camera3 = runtime.appCtx.mainDirectionalLight.shadow.camera,
    setFromMatrixPosition = new ns2.Vector3().setFromMatrixPosition(
      runtime.appCtx.mainDirectionalLight.matrixWorld,
    ),
    setFromMatrixPosition2 = new ns2.Vector3().setFromMatrixPosition(
      runtime.appCtx.mainDirectionalLight.target.matrixWorld,
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
    (runtime.appCtx.mainDirectionalLight.shadow.needsUpdate = true),
    true
  );
}

export function updateCameraView(runtime: StudioAppRuntime, cameraViewOptions: UpdateCameraViewOptions = {}) {
  if (!runtime.appCtx.threeCamera || !runtime.appCtx.orbitControls) return;
  const viewMode =
      cameraViewOptions.view === "top"
        ? "top"
        : cameraViewOptions.view === "free"
          ? "free"
          : runtime.getCameraView(),
    qn3 = runtime.getCameraTopRotation(),
    isShowingAllFloors = runtime.getPreviewFloorMode() === "all",
    cameraViewPpm = runtime.getPixelsPerMeter() || 100,
    qu5 = runtime.getSceneContentBounds(),
    ug2 = runtime.computeCourtyardBounds(),
    qu6 =
      ug2 ||
      runtime.computeSceneBounds({
        excludeModelLayers: new Set(["items", "lights"]),
      }),
    size2 = (isShowingAllFloors || ug2) && !qu6.isEmpty() ? qu6.getSize(new ns2.Vector3()) : null,
    sceneCenterVector = qu6.isEmpty() ? null : qu6.getCenter(new ns2.Vector3()),
    cameraTargetRadius = size2
      ? clamp2(Math.max(size2.x, size2.z), 5, 100)
      : clamp2(Math.max(qu5.width, qu5.height) / cameraViewPpm, 5, 35),
    sceneHeight = size2
      ? size2.y
      : Math.max(0, ...runtime.appCtx.studioState.walls.map((viewWall) => viewWall.height || 0)),
    cameraViewOptionsCameraDistance = Math.max(
      cameraTargetRadius * 1.18,
      cameraTargetRadius + sceneHeight * 0.32,
    );
  ((runtime.appCtx.threeCamera.userData.frameSize = cameraViewOptionsCameraDistance),
    (runtime.appCtx.threeCamera.userData.cameraView = viewMode),
    (runtime.appCtx.threeCamera.userData.topRotation = qn3));
  const cameraTarget = sceneCenterVector
    ? new ns2.Vector3(sceneCenterVector.x, sceneCenterVector.y, sceneCenterVector.z)
    : new ns2.Vector3(0, Math.min(0.78, cameraTargetRadius * 0.055), 0);
  let cameraDistanceResult;
  if (runtime.appCtx.threeCamera.isPerspectiveCamera) {
    ((runtime.appCtx.threeCamera.aspect = runtime.appCtx.threeCamera.userData.viewportAspect || 1), runtime.applyCameraFocalLength());
    const cameraFovDistance =
      cameraViewOptionsCameraDistance /
      (2 * Math.tan(ns2.MathUtils.degToRad(runtime.appCtx.threeCamera.getEffectiveFOV()) / 2));
    cameraDistanceResult = Math.max(cameraFovDistance * 1.04, cameraTargetRadius * 1.65, 8);
  } else
    (runtime.applyOrthoFrame(cameraViewOptionsCameraDistance, runtime.appCtx.threeCamera.userData.viewportAspect || 1),
      (cameraDistanceResult = Math.max(cameraTargetRadius * 3.2, 18)));
  if (viewMode === "top")
    (runtime.appCtx.threeCamera.up.copy(runtime.buildCameraUpVector(qn3)),
      runtime.appCtx.threeCamera.position.set(
        cameraTarget.x,
        cameraTarget.y + cameraDistanceResult,
        cameraTarget.z,
      ));
  else {
    runtime.appCtx.threeCamera.up.set(0, 1, 0);
    const normalize2 = new ns2.Vector3(1.08, 1.7, 1.12).normalize();
    runtime.appCtx.threeCamera.position.copy(cameraTarget).addScaledVector(normalize2, cameraDistanceResult);
  }
  (runtime.updateCameraPlanes(runtime.appCtx.threeCamera, cameraTarget),
    (runtime.appCtx.threeCamera.zoom = 1),
    runtime.appCtx.threeCamera.lookAt(cameraTarget),
    runtime.appCtx.threeCamera.updateProjectionMatrix(),
    runtime.appCtx.orbitControls.target.copy(cameraTarget),
    runtime.requestStudioRender(),
    runtime.appCtx.orbitControls.update());
}

export function axisLockedDistance(runtime: StudioAppRuntime, dragStartPoint: any, dragEndPoint: any, isShiftPressed = false) {
  const measurePpm = runtime.getPixelsPerMeter() || 100;
  if (!runtime.isSnapEnabled()) {
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
  const settings = runtime.appCtx.studioState.settings;
  return snapPoint2(dragStartPoint, runtime.appCtx.studioState.walls, {
    zoom: runtime.appCtx.planView.zoom,
    screenTolerance: clamp2(Math.round(finite2(settings.snapTolerance, 13)), 6, 24),
    anchor: dragEndPoint,
    forceOrthogonalAxis: isShiftPressed,
    preferVerticalAxis: settings.snapOrthogonal !== false,
    angleStepDegrees: 15,
    gridSize: measurePpm * 0.1,
    intersections: settings.snapIntersections === false ? [] : runtime.computeWallIntersections(measurePpm),
    snapEndpoints: settings.snapEndpoints !== false,
    snapIntersections: settings.snapIntersections !== false,
    snapSegments: settings.snapSegments !== false,
    snapOrthogonal: settings.snapOrthogonal !== false,
    snapAngles: settings.snapAngles !== false,
    snapGrid: settings.snapGrid !== false,
  });
}

export function formatMeasurement(runtime: StudioAppRuntime, measurementRecord = runtime.appCtx.snapHit) {
  if (!runtime.appCtx.snapEndpointPoint || runtime.appCtx.wallSegmentCount < 2 || !measurementRecord?.point) return false;
  const measurementTolerance = Math.max(1, (runtime.getPixelsPerMeter() || 100) * 0.01);
  return (
    measurementRecord.kind === "endpoint" &&
    distance2(measurementRecord.point, runtime.appCtx.snapEndpointPoint) <= measurementTolerance
  );
}
