import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  courtyardFootprintLoops as courtyardFootprintLoops2,
  outerPerimeterLine as outerPerimeterLine2,
  sceneModelOrigin as sceneModelOrigin2,
} from '../../../plan/courtyard-drawing'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { polygonArea as polygonArea2, subtractPolygonLoops as subtractPolygonLoops2 } from '../../../plan/geometry'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import { buildFloorEdgeOutline } from '../geometry/floor-edge'

export function buildCourtyardFoundation(
  runtime: StudioAppRuntime,
  { ppm: courtyardPixelsPerMeter, toWorld: courtyardToWorld }: any,
) {
  const floorEdgeIndoorLoops = runtime.appCtx.sceneRootNode.userData.floorEdgeIndoorLoops
  if (!floorEdgeIndoorLoops) return
  const courtyardDrawingList = runtime.appCtx.studioState.items.filter(
      (courtyardDrawingItem) =>
        courtyardDrawingItem.type === 'courtyard-area' || courtyardDrawingItem.type === 'courtyard-fence',
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
    ])
  if (runtime.appCtx.sceneRootNode.userData.floorEdgeKey === courtyardSignature) return
  for (const foundationChildObject of [...runtime.appCtx.sceneRootNode.children])
    (foundationChildObject.userData.exportRole === 'outline' || foundationChildObject.userData.courtyardFoundation) &&
      (runtime.appCtx.sceneRootNode.remove(foundationChildObject), runtime.disposeObjectTree(foundationChildObject))
  runtime.appCtx.sceneRootNode.userData.floorEdgeKey = courtyardSignature
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
    outerFootprintLoops = courtyardFootprintLoops.filter((footprintLoop: any) => polygonArea2(footprintLoop) > 0)
  if (courtyardDrawingList.length && outerFootprintLoops.length) {
    const cutoutLoops = [
        ...floorEdgeIndoorLoops.map((cutoutIndoorLoopGroup: any) =>
          cutoutIndoorLoopGroup.map((cutoutIndoorPoint: any) => ({
            x: cutoutIndoorPoint.x,
            y: cutoutIndoorPoint.z,
          })),
        ),
        ...courtyardFootprintLoops.filter((holeFootprintLoop: any) => polygonArea2(holeFootprintLoop) < 0),
        ...(runtime.appCtx.sceneRootNode.userData.floorEdgeOpenings || []),
      ],
      holedFootprintLoops = subtractPolygonLoops2(outerFootprintLoops, cutoutLoops, 0.00001),
      ms4 = runtime.buildShapesWithHoles(holedFootprintLoops)
    if (ms4.length) {
      const foundationMesh = new ns2.Mesh(
        new ns2.ExtrudeGeometry(ms4, {
          depth: 0.16,
          bevelEnabled: false,
          steps: 1,
        }),
        runtime.createFloorMaterial(),
      )
      ;(foundationMesh.rotation.x = Math.PI / 2),
        (foundationMesh.position.y = -0.008),
        (foundationMesh.receiveShadow = true),
        Object.assign(foundationMesh.userData, {
          courtyardFoundation: true,
          exportRole: 'plan',
          regionReceiverKind: 'floor',
          regionFloorId: runtime.appCtx.activeFloorId,
        }),
        runtime.appCtx.sceneRootNode.add(foundationMesh)
    }
  }
  if (runtime.appCtx.studioState.settings.floorEdgeVisible !== false) {
    for (const closedFootprintLoop of outerFootprintLoops)
      buildFloorEdgeOutline(
        runtime.appCtx,
        courtyardDrawingList.length
          ? outerPerimeterLine2(closedFootprintLoop)
          : closedFootprintLoop.map((perimeterPoint: any) => ({
              x: perimeterPoint.x,
              z: perimeterPoint.y,
            })),
        floorEdge,
        -0.168,
      )
  }
}

export function buildGroundShadow(
  runtime: StudioAppRuntime,
  groundShadowLoopList: any,
  groundShadowHeight: any,
  groundShadowHoles: any[] = [],
) {
  if (!Array.isArray(groundShadowLoopList) || groundShadowLoopList.length < 3) return
  const groundShadowPoints = groundShadowLoopList.map((groundShadowLoopPoint) => ({
    x: groundShadowLoopPoint.x,
    y: groundShadowLoopPoint.z,
  }))
  ;[
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
    const shadowLayerPoints = runtime
        .expandPolygonOutward(groundShadowPoints, shadowLayerConfig.spread)
        .map((shadowLayerPoint: any) => ({
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
      )
    ;(groundShadowMesh.rotation.x = Math.PI / 2),
      (groundShadowMesh.position.y = groundShadowHeight + 0.001 + shadowLayerIndex * 0.00015),
      (groundShadowMesh.userData.floorPlanGroundShadow = true),
      (groundShadowMesh.userData.exportRole = 'background'),
      (groundShadowMesh.visible = runtime.appCtx.sceneStyle !== 'warm-wood'),
      (groundShadowMesh.renderOrder = 1 + shadowLayerIndex),
      runtime.appCtx.sceneRootNode.add(groundShadowMesh)
  })
}

export function getPreviewFloorMode(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioProject?.previewFloorMode === 'all' && runtime.appCtx.studioProject.floors.length > 1
    ? 'all'
    : 'active'
}

export function updateFloorPreviewButtons(runtime: StudioAppRuntime) {
  const le2 = runtime.getPreviewFloorMode(),
    shouldEnableFloorPreview = (runtime.appCtx.studioProject?.floors.length || 0) > 1
  for (const floorPreviewButton of runtime.previewFloorControls) {
    const isActiveFloorPreviewButton = floorPreviewButton.dataset.previewFloor === le2
    floorPreviewButton.classList.toggle('active', isActiveFloorPreviewButton),
      floorPreviewButton.setAttribute('aria-pressed', String(isActiveFloorPreviewButton)),
      (floorPreviewButton.disabled = floorPreviewButton.dataset.previewFloor === 'all' && !shouldEnableFloorPreview)
  }
}

export function setPreviewFloor(
  runtime: StudioAppRuntime,
  previewFloorId: any,
  { persist: shouldPersistPreview = true } = {},
) {
  runtime.appCtx.studioProject &&
    ((runtime.appCtx.studioProject.previewFloorMode =
      previewFloorId === 'all' && runtime.appCtx.studioProject.floors.length > 1 ? 'all' : 'active'),
    runtime.updateFloorPreviewButtons(),
    runtime.refreshFloorControls(),
    runtime.setCameraMode(runtime.getCameraMode(), {
      preserveView: false,
    }),
    Promise.allSettled(runtime.preloadDefaultModels()),
    runtime.rebuildFloorLayers(),
    runtime.updateCameraView(),
    shouldPersistPreview && runtime.markDocumentDirty())
}

export function rebuildFloorLayers(runtime: StudioAppRuntime, floorRebuildOptions: Record<string, any> = {}) {
  if (runtime.appCtx.isSceneStillLoading) {
    runtime.assetLoaderState.revision++
    return
  }
  // 预览重建期间先不销毁旧材质/几何，交给交接队列在渲染帧结束后统一回收。
  const rebuildFloors = () => {
    for (const _floorLayerEntry of runtime.buildFloorsAsync(floorRebuildOptions));
  }
  runtime.previewResources
    ? runtime.previewResources.run(
        rebuildFloors,
        !runtime.isEmbeddedStage && !runtime.appCtx.isRenderSuppressed && !document.hidden,
      )
    : rebuildFloors()
}

export function* buildFloorsAsync(
  runtime: StudioAppRuntime,
  { preserveLightCache: preserveLightCacheSnapshot = false } = {},
): Generator<any, void, unknown> {
  if (!runtime.appCtx.sceneRootNode) return
  if ((runtime.stageLoadTiming('model-build'), runtime.getPreviewFloorMode() !== 'all')) {
    runtime.buildStudioScene({
      preserveLightCache: preserveLightCacheSnapshot,
    }),
      runtime.computeSceneExtent()
    return
  }
  const rootForFloors = runtime.appCtx.sceneRootNode,
    viewModelForFloors = runtime.appCtx.studioState,
    oe5 = runtime.appCtx.activeFloorId,
    nn3 = runtime.appCtx.sceneModelOrigin
  runtime.refreshBaseLighting(),
    runtime.disposeFloorScene(),
    runtime.refreshSceneRender({
      shadows: true,
      scene: true,
      preserveLightCache: preserveLightCacheSnapshot,
    })
  const sort6 = [...runtime.appCtx.studioProject.floors].sort(
      (firstFloor, secondFloor) => firstFloor.elevation - secondFloor.elevation,
    ),
    floorGap = runtime.appCtx.pendingRuntimeSettings
      ? finite2(runtime.appCtx.studioProject.exportFloorGap, 3)
      : finite2(runtime.appCtx.studioProject.previewFloorGap, 3)
  for (const [floorSortIndex, preserveLightCacheSnapshotFloorRecord] of sort6.entries()) {
    const floorGroupContainer = new ns2.Group()
    ;(floorGroupContainer.name = 'floor-' + preserveLightCacheSnapshotFloorRecord.id),
      (floorGroupContainer.userData.floorId = preserveLightCacheSnapshotFloorRecord.id)
    try {
      ;(runtime.appCtx.sceneRootNode = floorGroupContainer),
        (runtime.appCtx.studioState = preserveLightCacheSnapshotFloorRecord.scene),
        (runtime.appCtx.activeFloorId = preserveLightCacheSnapshotFloorRecord.id),
        (runtime.appCtx.sceneModelOrigin = {
          x: finite2(preserveLightCacheSnapshotFloorRecord.originX, 0),
          y: finite2(preserveLightCacheSnapshotFloorRecord.originY, 0),
        }),
        runtime.buildStudioScene({
          preserveLightCache: preserveLightCacheSnapshot,
        })
    } catch (floorBuildError: any) {
      throw (runtime.disposeObjectTree(floorGroupContainer), floorBuildError)
    } finally {
      ;(runtime.appCtx.sceneRootNode = rootForFloors),
        (runtime.appCtx.studioState = viewModelForFloors),
        (runtime.appCtx.activeFloorId = oe5),
        (runtime.appCtx.sceneModelOrigin = nn3)
    }
    if (floorSortIndex > 0) {
      for (const preserveLightCacheSnapshotFloorChildObject of [...floorGroupContainer.children])
        if (['background', 'grid'].includes(preserveLightCacheSnapshotFloorChildObject.userData?.exportRole)) {
          if (runtime.isEmbeddedStage) {
            ;(preserveLightCacheSnapshotFloorChildObject.userData.floorBackgroundHidden = true),
              (preserveLightCacheSnapshotFloorChildObject.visible = false)
            continue
          }
          floorGroupContainer.remove(preserveLightCacheSnapshotFloorChildObject),
            runtime.disposeObjectTree(preserveLightCacheSnapshotFloorChildObject)
        }
    }
    floorGroupContainer.position.set(
      finite2(preserveLightCacheSnapshotFloorRecord.offsetX, 0),
      floorSortIndex * floorGap,
      finite2(preserveLightCacheSnapshotFloorRecord.offsetZ, 0),
    ),
      (floorGroupContainer.rotation.y = -ns2.MathUtils.degToRad(
        finite2(preserveLightCacheSnapshotFloorRecord.rotation, 0),
      )),
      rootForFloors.add(floorGroupContainer),
      floorSortIndex < sort6.length - 1 && (yield)
  }
  ;(runtime.appCtx.sceneRootNode = rootForFloors),
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
    })
}

export function syncFloorGroups(runtime: StudioAppRuntime, layerKeySet: any) {
  if (!layerKeySet.size || !runtime.appCtx.sceneRootNode) return
  if (runtime.getPreviewFloorMode() !== 'all') {
    layerKeySet.has(runtime.appCtx.activeFloorId) && runtime.rebuildFloorLayers()
    return
  }
  const rootForFloorSync = runtime.appCtx.sceneRootNode,
    viewModelForFloorSync = runtime.appCtx.studioState,
    oe6 = runtime.appCtx.activeFloorId,
    nn4 = runtime.appCtx.sceneModelOrigin,
    sort7 = [...runtime.appCtx.studioProject.floors].sort(
      (firstSortFloor, secondSortFloor) => firstSortFloor.elevation - secondSortFloor.elevation,
    )
  if (
    sort7.some(
      (syncFloor) =>
        !rootForFloorSync.children.some(
          (existingFloorChild: any) => existingFloorChild.userData?.floorId === syncFloor.id,
        ),
    )
  ) {
    runtime.rebuildFloorLayers()
    return
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
        runtime.appCtx.sceneRootNode.rotation.set(0, -ns2.MathUtils.degToRad(finite2(syncFloorRecord.rotation, 0)), 0),
        runtime.appCtx.sceneRootNode.scale.set(1, 1, 1),
        runtime.buildStudioScene(),
        floorSyncIndex > 0)
      ) {
        for (const staleFloorChild of [...runtime.appCtx.sceneRootNode.children])
          if (['background', 'grid'].includes(staleFloorChild.userData?.exportRole)) {
            if (runtime.isEmbeddedStage) {
              ;(staleFloorChild.userData.floorBackgroundHidden = true), (staleFloorChild.visible = false)
              continue
            }
            runtime.appCtx.sceneRootNode.remove(staleFloorChild), runtime.disposeObjectTree(staleFloorChild)
          }
      }
  } finally {
    ;(runtime.appCtx.sceneRootNode = rootForFloorSync),
      (runtime.appCtx.studioState = viewModelForFloorSync),
      (runtime.appCtx.activeFloorId = oe6),
      (runtime.appCtx.sceneModelOrigin = nn4)
  }
  runtime.setupSceneShadows(rootForFloorSync), runtime.computeSceneExtent()
}

export function createFloorWorldMapper(runtime: StudioAppRuntime) {
  const floorMapperPpm = runtime.getPixelsPerMeter()
  if (!floorMapperPpm) return null
  const nn5 =
      runtime.appCtx.sceneModelOrigin || sceneModelOrigin2(runtime.appCtx.studioState, runtime.getActiveFloor()),
    floorMapperOriginX = nn5.x,
    floorMapperOriginY = nn5.y
  return {
    ppm: floorMapperPpm,
    floorSurfaceY: -0.008,
    floorPolygons: runtime.closedWallLoops(floorMapperPpm),
    toWorld: (mapperPoint: any) => ({
      x: (mapperPoint.x - floorMapperOriginX) / floorMapperPpm,
      z: (mapperPoint.y - floorMapperOriginY) / floorMapperPpm,
    }),
  }
}

export function buildFloorAtIndex(runtime: StudioAppRuntime, requestedLayerSet: any, sceneLayerOptions: any) {
  const floorBuildRoot = runtime.appCtx.sceneRootNode,
    nn6 = runtime.appCtx.sceneModelOrigin
  if (runtime.getPreviewFloorMode() === 'all') {
    const floorRecordAtId = runtime.appCtx.studioProject.floors.find(
        (candidateFloor: any) => candidateFloor.id === runtime.appCtx.activeFloorId,
      ),
      floorGroupAtId = floorBuildRoot?.children.find(
        (floorGroupChild: any) => floorGroupChild.userData?.floorId === runtime.appCtx.activeFloorId,
      )
    if (!floorRecordAtId || !floorGroupAtId) {
      runtime.rebuildFloorLayers(sceneLayerOptions)
      return
    }
    ;(runtime.appCtx.sceneRootNode = floorGroupAtId),
      (runtime.appCtx.sceneModelOrigin = {
        x: finite2(floorRecordAtId.originX, 0),
        y: finite2(floorRecordAtId.originY, 0),
      })
  }
  try {
    const floorBuildOptions = {
      ...sceneLayerOptions,
      shadowRoot: floorBuildRoot,
    }
    requestedLayerSet.has('architecture') && runtime.buildArchitectureLayer(floorBuildOptions),
      requestedLayerSet.has('items') && runtime.buildItemsLayer(floorBuildOptions),
      requestedLayerSet.has('lights') && runtime.buildLightsLayer(floorBuildOptions)
  } finally {
    ;(runtime.appCtx.sceneRootNode = floorBuildRoot), (runtime.appCtx.sceneModelOrigin = nn6)
  }
}

export function buildLayerForFloor(
  runtime: StudioAppRuntime,
  floorLayerKey: any,
  layerFloorOptions: Record<string, any> = {},
) {
  const layerFloorRoot = runtime.appCtx.sceneRootNode,
    viewModelForLayer = runtime.appCtx.studioState,
    oe7 = runtime.appCtx.activeFloorId,
    nn7 = runtime.appCtx.sceneModelOrigin,
    sort8 = [...(runtime.appCtx.studioProject?.floors || [])].sort(
      (firstLayerFloor, secondLayerFloor) => firstLayerFloor.elevation - secondLayerFloor.elevation,
    )
  if (!layerFloorRoot || !sort8.length) return false
  try {
    for (const layerFloorRecord of sort8) {
      const layerFloorGroup = layerFloorRoot.children.find(
        (layerFloorChild: any) => layerFloorChild.userData?.floorId === layerFloorRecord.id,
      )
      if (!layerFloorGroup) return false
      ;(runtime.appCtx.sceneRootNode = layerFloorGroup),
        (runtime.appCtx.studioState = layerFloorRecord.scene),
        (runtime.appCtx.activeFloorId = layerFloorRecord.id),
        (runtime.appCtx.sceneModelOrigin = {
          x: finite2(layerFloorRecord.originX, 0),
          y: finite2(layerFloorRecord.originY, 0),
        }),
        runtime.buildLayerGroup(floorLayerKey, {
          ...layerFloorOptions,
          shadowRoot: layerFloorRoot,
        })
    }
  } finally {
    ;(runtime.appCtx.sceneRootNode = layerFloorRoot),
      (runtime.appCtx.studioState = viewModelForLayer),
      (runtime.appCtx.activeFloorId = oe7),
      (runtime.appCtx.sceneModelOrigin = nn7)
  }
  return (runtime.computeSceneExtent(), true)
}
