import { isWarmSceneStyle } from '../../app/shared/scene-styles'
import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  courtyardFootprintLoops as courtyardFootprintLoops2,
  outerPerimeterLine as outerPerimeterLine2,
  sceneModelOrigin as sceneModelOrigin2,
} from '../plan/courtyard-drawing'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import * as ns from '/static/vendor/three/0.187.0/three.module.min.js'
import { polygonArea as polygonArea2, subtractPolygonLoops as subtractPolygonLoops2 } from '../plan/geometry'
import { finite as finite2 } from '../loaders/studio-normalization'
import { buildFloorEdgeOutline } from '../geometry'
import { reorderFloors as reorderFloors2 } from '../plan/floor'
import { createFloorCopy } from '../plan/floor'
import { generateId } from '../ui/studio-app-helpers'
import { createFloorRecord } from '../scene/payload/studio-document-payload'
import { confirmFloorDeletion } from '../ui/dialogs'
import {
  resolveFloorRegionPlates,
  resolveHeatingPolylines,
  shouldRenderHeating,
  type FloorRenderRecord,
  type HeatingPolyline,
} from '../plan/studio-floor'

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
      (groundShadowMesh.visible = !isWarmSceneStyle(runtime.appCtx.sceneStyle)),
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
    // 切层 / 切「全楼」后刷新工作区提示（「全楼视图仅编辑当前楼层」）。
    runtime.refreshWorkspaceView?.(),
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
    // 0.8.7 3D 视口编辑要在地图像素与世界米之间来回换算，原点必须一起返回，
    // 否则调用方只能再推导一遍（两处推导迟早会漂移）。
    origin: { x: floorMapperOriginX, y: floorMapperOriginY },
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

export function uniqueFloorName(runtime: StudioAppRuntime, baseName: any, currentFloorId = '') {
  const set = new Set(
    (runtime.appCtx.studioProject?.floors || [])
      .filter((otherFloor: any) => otherFloor.id !== currentFloorId)
      .map((otherFloorName: any) => otherFloorName.name),
  )
  if (!set.has(baseName)) return baseName
  let num = 2
  for (; set.has(baseName + ' ' + num); ) num += 1
  return baseName + ' ' + num
}

export function hideFloorActionMenu(runtime: StudioAppRuntime) {
  ;(runtime.floorActionMenuElement.hidden = true), (runtime.appCtx.pendingFloorMenuId = '')
}

export function showFloorActionMenu(runtime: StudioAppRuntime, floorRow: any, menuOpenEvent: any) {
  runtime.appCtx.pendingFloorMenuId = floorRow.id
  const selector = runtime.floorActionMenuElement.querySelector('[data-floor-action="delete"]')
  ;(selector.disabled = runtime.appCtx.studioProject.floors.length <= 1),
    (runtime.floorActionMenuElement.hidden = false),
    (runtime.floorActionMenuElement.style.left = Math.min(menuOpenEvent.clientX, window.innerWidth - 116) + 'px'),
    (runtime.floorActionMenuElement.style.top = Math.min(menuOpenEvent.clientY, window.innerHeight - 118) + 'px')
}

export async function floorActionHandler(runtime: StudioAppRuntime, floorToDelete: any) {
  if (!floorToDelete || runtime.appCtx.studioProject.floors.length <= 1) return
  if (await confirmFloorDeletion(floorToDelete.name)) await confirmFloorDelete(runtime, floorToDelete)
}

async function confirmFloorDelete(runtime: StudioAppRuntime, floorToDelete?: any) {
  const deletedFloor =
    floorToDelete ||
    runtime.appCtx.studioProject.floors.find(
      (floorEntryMatch: { id?: string }) => floorEntryMatch.id === runtime.appCtx.pendingFloorDeleteId,
    )
  runtime.appCtx.pendingFloorDeleteId = ''
  if (!deletedFloor || runtime.appCtx.studioProject.floors.length <= 1) return
  const deletedFloorIndex = runtime.appCtx.studioProject.floors.findIndex(
    (floorIndexMatch: any) => floorIndexMatch.id === deletedFloor.id,
  )
  if (deletedFloorIndex < 0) return
  runtime.appCtx.studioProject.floors.splice(deletedFloorIndex, 1),
    runtime.appCtx.studioProject.floors.forEach((elevationFloor: any, floorOrderIndex: any) => {
      elevationFloor.elevation = floorOrderIndex * runtime.appCtx.studioProject.defaultFloorHeight
    })
  const nextActiveFloor =
    runtime.appCtx.studioProject.floors[Math.max(0, deletedFloorIndex - 1)] || runtime.appCtx.studioProject.floors[0]
  await runtime.selectFloor(nextActiveFloor.id, {
    persist: false,
  }),
    runtime.updateFloorPreviewButtons(),
    runtime.markDocumentDirty(),
    runtime.showToast('已删除“' + deletedFloor.name + '”。', 'success')
}

export function openFloorRenameDialog(runtime: StudioAppRuntime, floorToRename: any) {
  floorToRename &&
    ((runtime.appCtx.pendingFloorMenuId = floorToRename.id),
    (runtime.floorRenameInputElement.value = floorToRename.name),
    runtime.floorRenameDialogElement.showModal(),
    requestAnimationFrame(() => runtime.floorRenameInputElement.select()))
}

export function clearDropIndicator(runtime: StudioAppRuntime) {
  for (const dropIndicatorElement of runtime.floorListElement.querySelectorAll('.floor-row'))
    dropIndicatorElement.classList.remove('drop-before', 'drop-after'), delete dropIndicatorElement.dataset.dropPosition
}

export function moveFloorRow(runtime: StudioAppRuntime, draggedFloorId: any, targetFloorId: any, dropAfterFlag: any) {
  const reorderedFloors = reorderFloors2(
    runtime.appCtx.studioProject.floors,
    draggedFloorId,
    targetFloorId,
    dropAfterFlag,
    runtime.appCtx.studioProject.defaultFloorHeight,
  )
  if (reorderedFloors === runtime.appCtx.studioProject.floors) return
  const movedFloor = runtime.appCtx.studioProject.floors.find(
    (movedFloorMatch: any) => movedFloorMatch.id === draggedFloorId,
  )
  ;(runtime.appCtx.studioProject.floors = reorderedFloors),
    runtime.syncGlobalControls(),
    runtime.updateFloorPreviewButtons(),
    runtime.renderFloorList(),
    runtime.requestSceneRebuild({
      force: true,
    }),
    runtime.markDocumentDirty(),
    movedFloor && runtime.showToast('已调整“' + movedFloor.name + '”的楼层顺序。', 'success')
}

export function renderFloorList(runtime: StudioAppRuntime) {
  const ae2 = runtime.getActiveFloor(),
    activeFloorIndex = ae2
      ? runtime.appCtx.studioProject.floors.findIndex((activeFloorMatch: any) => activeFloorMatch.id === ae2.id)
      : -1,
    canAlignFloor = runtime.appCtx.studioProject.floors.length > 1 && activeFloorIndex > 0
  ;(runtime.alignFloorButton.hidden = !canAlignFloor),
    (runtime.alignFloorButton.disabled = !canAlignFloor || !ae2?.scene?.calibration),
    (runtime.alignFloorButton.textContent = ae2?.aligned ? '重新对齐' : '对齐楼层'),
    runtime.appCtx.alignmentState?.stage === 'reference'
      ? ((runtime.activeToolLabel.textContent = '楼层对齐 · 参照层'),
        (runtime.toolHelpElement.textContent =
          '点击' + runtime.appCtx.alignmentState.referenceFloor.name + '上的楼梯角、墙角或柱点；Esc 取消'))
      : runtime.appCtx.alignmentState?.stage === 'current' &&
        ((runtime.activeToolLabel.textContent = '楼层对齐 · 当前层'),
        (runtime.toolHelpElement.textContent = '点击' + ae2.name + '上的相同位置；系统会自动重合上下楼层'))
}

export async function selectFloor(
  runtime: StudioAppRuntime,
  targetFloorIdSelection: any,
  { persist: didFloorChange = false } = {},
) {
  const targetFloor = runtime.appCtx.studioProject?.floors.find(
    (floorLookup: any) => floorLookup.id === targetFloorIdSelection,
  )
  if (!targetFloor) return
  const selectionRequestId = ++runtime.appCtx.floorSelectionRequestId,
    tu2 = runtime.getPreviewFloorMode() === 'all' ? runtime.captureOverviewCamera() : null
  runtime.appCtx.alignmentState?.floorId !== targetFloor.id && (runtime.appCtx.alignmentState = null),
    (runtime.appCtx.activeFloorId = targetFloor.id),
    (runtime.appCtx.studioProject.activeFloorId = targetFloor.id),
    (runtime.appCtx.studioState = targetFloor.scene),
    (runtime.appCtx.activeLightGroupId = ''),
    runtime.refreshSelection(),
    runtime.refreshPreviewScene(),
    runtime.planPainter?.setTool(runtime.appCtx.activeToolName),
    (runtime.appCtx.previewEndPoint = null),
    // C5：切楼层不再清空撤销 / 重做栈（历史是跨楼层的文档补丁）。
    (runtime.appCtx.planView.rotation = runtime.appCtx.studioState.settings.planViewRotation),
    Promise.allSettled(runtime.preloadDefaultModels())
  const gu2 = runtime.loadBackgroundImage()
  runtime.isEmbeddedStage || (await gu2),
    !(
      selectionRequestId !== runtime.appCtx.floorSelectionRequestId || runtime.appCtx.activeFloorId !== targetFloor.id
    ) &&
      (runtime.refreshScopeItems(),
      runtime.renderFloorList(),
      runtime.resetView(),
      requestAnimationFrame(() => {
        if (
          !(
            selectionRequestId !== runtime.appCtx.floorSelectionRequestId ||
            runtime.appCtx.activeFloorId !== targetFloor.id
          )
        ) {
          if (runtime.getPreviewFloorMode() === 'all') {
            tu2 && runtime.applyCameraState(tu2, tu2.viewportAspect),
              runtime.syncCameraModeControls(runtime.getCameraMode()),
              runtime.syncCameraViewControls(runtime.getCameraView())
            return
          }
          if (runtime.appCtx.studioState.settings.fixedCameraView) {
            runtime.applyCameraSnapshot({
              recordChange: false,
              silent: true,
            })
            return
          }
          runtime.setCameraMode(runtime.getCameraMode(), {
            preserveView: false,
          }),
            runtime.updateCameraView()
        }
      }),
      didFloorChange && runtime.markDocumentDirty())
}

export async function copyFloor(runtime: StudioAppRuntime, sourceFloor: { id: string } | undefined) {
  if (!sourceFloor || runtime.isEmbeddedStage) return
  let copiedFloor: ReturnType<typeof createFloorCopy> | undefined
  try {
    copiedFloor = createFloorCopy(runtime.appCtx.studioProject.floors, sourceFloor.id, {
      newId: generateId,
      floorHeight: runtime.appCtx.studioProject.defaultFloorHeight,
    })
  } catch (copyError) {
    runtime.showToast(copyError instanceof Error ? copyError.message : '楼层复制失败。', 'error')
    return
  }
  if (!copiedFloor) return
  runtime.appCtx.studioProject.floors.push(copiedFloor)
  const floorSelection = runtime.selectFloor(copiedFloor.id, { persist: false })
  runtime.markDocumentDirty()
  runtime.updateFloorPreviewButtons()
  await floorSelection
  runtime.appCtx.activeFloorId === copiedFloor.id &&
    runtime.showToast(`已复制为“${copiedFloor.name}”，绘图位置保持一致，设备关联需重新配置。`, 'success')
  runtime.selectStudioTool('select')
}

export async function addNewFloor(runtime: StudioAppRuntime) {
  const newFloorRecord = createFloorRecord(runtime.studioDocumentDeps(), runtime.appCtx.studioProject.floors.length)
  ;(newFloorRecord.name = runtime.uniqueFloorName(newFloorRecord.name)),
    runtime.appCtx.studioProject.floors.push(newFloorRecord),
    runtime.updateFloorPreviewButtons(),
    await runtime.selectFloor(newFloorRecord.id, {
      persist: false,
    }),
    runtime.markDocumentDirty(),
    runtime.showToast('已新增“' + newFloorRecord.name + '”，导入并校准后会设置上下层参照点。', 'success'),
    runtime.selectStudioTool('select')
}

/**
 * 地面分区板与地暖盘管的**挂载器**（0.8.9）。
 *
 * 与 `plan/studio-floor-render.ts` 的分工：那边只算规格（纯函数、可断言），
 * 这边唯一职责是把规格变成 three 对象并挂进场景根。
 *
 * ## 必须保持的三件事
 *
 * 1. **先隐藏整板再挂分区板**：两张面共面会 z-fighting，表现为地面持续闪烁；
 *    找不到整板时仍然挂分区板（宁可少一层阴影，也不要地面不出现）。
 * 2. **分区板带 `regionReceiverKind = 'floor'`**：与整板同标记，才不会被
 *    「导出 / 阴影」两条链路当成外来物体。
 * 3. **盘管用 `LineSegments` 而不是管子**：几十米管径做 TubeGeometry 会给每层增加
 *    数万三角面；一根 1.5px 的线在俯视里已经够辨识。
 *
 * ## 为什么用窄类型而不是宽类型转换
 *
 * three 由 `/static/vendor/...` 以原始 ES 模块导入，没有类型声明。用 `as` 直转宽类型
 * 会把「拼错类名」也放过去（运行期才炸），而本仓的宽类型棘轮只降不升。
 * 这里声明一个**只含用到成员**的接口，拼错会当场编译失败。
 */

/** 盘管离地高度（米）：略高于地面板，避免与板共面闪烁。 */
const HEATING_LIFT = 0.004

/** 盘管颜色（橙红，与「供热」语义一致）。 */
const HEATING_COLOR = 0xd4622a

/** 平面点（`{x, y}`，与 `FloorPoint` 同形）。 */
type PlanPt = { x: number; y: number }
type ThreeColor = { clone: () => ThreeColor; multiplyScalar: (scale: number) => ThreeColor }
/** three 对象里本模块用到的成员。 */
type ThreeObject = {
  visible: boolean
  name: string
  position: { set: (x: number, y: number, z: number) => void }
  rotation: { x: number; y: number; z: number }
  userData: Record<string, unknown>
  children: ThreeObject[]
  traverse: (visitor: (child: ThreeObject) => void) => void
  add: (...children: ThreeObject[]) => void
  remove: (...children: ThreeObject[]) => void
}
type ThreeShape = {
  moveTo: (x: number, y: number) => void
  lineTo: (x: number, y: number) => void
  closePath: () => void
  holes: ThreeShape[]
}
type ThreeGeometry = { dispose: () => void; setAttribute: (name: string, attribute: unknown) => void }

type ThreeNamespace = {
  Group: new () => ThreeObject
  Mesh: new (geometry: ThreeGeometry, material: unknown) => ThreeObject
  LineSegments: new (geometry: ThreeGeometry, material: unknown) => ThreeObject
  Shape: new () => ThreeShape
  ShapeGeometry: new (shape: ThreeShape, curveSegments?: number) => ThreeGeometry
  BufferGeometry: new () => ThreeGeometry
  Float32BufferAttribute: new (array: number[], itemSize: number) => unknown
  LineBasicMaterial: new (options: { color: number; transparent?: boolean; opacity?: number }) => unknown
  MeshStandardMaterial: new (options: { color: ThreeColor | number; roughness: number; metalness: number }) => unknown
  Color: new (color: unknown) => ThreeColor
}

const three = ns as unknown as ThreeNamespace

/** 分区板材质参数（由 `plan/studio-floor-render.ts` 产出）。 */
export type FloorRegionMaterialParams = { brightness: number; roughness: number }

/**
 * 分区板材质工厂。
 *
 * 用整板同款基础色乘上分区的明度系数 —— 换贴图会在相邻分区之间错位（木纹对不上），
 * 只调明度在视觉上等价于「同一批木料的不同深浅」。
 *
 * 0.9.0：明度当**比值**用并逐通道夹到 1。纯 `multiplyScalar` 在亮基色（瓷砖）上会把
 * 砖缝一起推成白色、纹理消失；夹取后亮基色在 +20 档只是「不再更亮」，砖缝保留。
 * 贴图仍然参与（`color` 与 `map` 相乘），所以木纹/砖缝不会丢。
 */
export function createFloorRegionMaterialFactory(baseColor: unknown) {
  const color = new three.Color(baseColor)
  return (params: FloorRegionMaterialParams) => {
    // three 的 shim 只声明了 Color 的构造，取通道要放宽到结构类型；这里不引入 any。
    const tonedColor = color.clone().multiplyScalar(params.brightness) as unknown as {
      r: number
      g: number
      b: number
    }
    tonedColor.r = Math.min(1, tonedColor.r)
    tonedColor.g = Math.min(1, tonedColor.g)
    tonedColor.b = Math.min(1, tonedColor.b)
    return new three.MeshStandardMaterial({
      color: tonedColor as unknown as ThreeColor,
      roughness: params.roughness,
      metalness: 0,
    })
  }
}

export type MountFloorRegionOptions = {
  /** 场景根（通常 `appCtx.sceneRootNode`）。 */
  root: ThreeObject | null | undefined
  /** 当前楼层记录（含 `floorRegions` / `floorFinishTones` / `underfloorHeating`）。 */
  floorRecord: FloorRenderRecord | null | undefined
  /** 场景风格（只影响 `theme` 铺面的明度）。 */
  sceneStyle?: string
  /** 平面点 → 世界坐标。 */
  toWorld: (point: PlanPt) => { x: number; z: number }
  /** 地面板顶面的世界高度（米）。 */
  floorSurfaceY: number
  /** 材质工厂：给参数、出 MeshStandardMaterial（由宿主注入，复用其基础色）。 */
  createMaterial: (params: FloorRegionMaterialParams) => unknown
}

/** 宿主上下文里本模块用到的部分。 */
type FloorSceneAppCtx = {
  sceneRootNode?: ThreeObject | null
  activeFloorId?: string
  sceneStyle?: unknown
  studioProject?: { floors?: ReadonlyArray<{ id?: string } & FloorRenderRecord> }
}

/**
 * 宿主适配：从编辑器上下文取「当前楼层记录 + 场景根 + 风格」。
 *
 * 两个调用点（`buildStudioScene` 单层 / `buildArchitectureLayer` 多层）都用它，
 * 避免各自推导一遍楼层记录 —— 推导写两遍必然会在某次重构后不一致。
 */
export function mountFloorRegionVisualsForScene(options: {
  appCtx: FloorSceneAppCtx
  toWorld: (point: PlanPt) => { x: number; z: number }
  floorSurfaceY: number
  floorColor: unknown
}): ThreeObject | null {
  const { appCtx, toWorld, floorSurfaceY, floorColor } = options
  const floorRecord = (appCtx.studioProject?.floors || []).find(
    (floorCandidate) => floorCandidate.id === appCtx.activeFloorId,
  )
  return mountFloorRegionVisuals({
    root: appCtx.sceneRootNode,
    floorRecord,
    sceneStyle: String(appCtx.sceneStyle || 'default'),
    toWorld,
    floorSurfaceY,
    createMaterial: createFloorRegionMaterialFactory(floorColor),
  })
}

/**
 * 挂载分区板与盘管。
 *
 * 返回挂上的分组（没有手工分区时返回 `null`，调用方什么都不要做）。
 * 挂之前会清掉上一轮的同类节点 —— 重建楼层时不能叠加。
 */
export function mountFloorRegionVisuals(options: MountFloorRegionOptions): ThreeObject | null {
  const { root, floorRecord, sceneStyle = 'default', toWorld, floorSurfaceY, createMaterial } = options
  if (!root) return null

  disposePreviousVisuals(root)

  const plates = resolveFloorRegionPlates(floorRecord, sceneStyle)
  if (!plates) {
    // 关键：没有手工分区时把整板**显回来**。只藏不显会让「删掉全部分区」变成地面消失。
    setWholeFloorPlateVisible(root, true)
    return null
  }

  // 整板退场：分区板会覆盖同一块地面，留着就是闪烁。
  setWholeFloorPlateVisible(root, false)

  const group = new three.Group()
  group.userData.floorRegionPlates = true
  group.name = 'floor-region-plates'
  for (const plate of plates) {
    const mesh = buildPlateMesh(plate, toWorld, floorSurfaceY, createMaterial)
    if (mesh) group.add(mesh)
  }
  const coils = buildHeatingGroup(floorRecord, toWorld, floorSurfaceY)
  if (coils) group.add(coils)
  root.add(group)
  return group
}

/** 拆掉上一轮挂的节点（分层重建 / 切楼层都会走到这里）。 */
function disposePreviousVisuals(root: ThreeObject): void {
  for (const staleNode of [...root.children]) {
    const isOurs = staleNode.userData?.floorRegionPlates === true || staleNode.userData?.underfloorHeating === true
    if (!isOurs) continue
    root.remove(staleNode)
    disposeOwnedResources(staleNode)
  }
}

/** 只释放本模块自己 new 的几何 / 材质（分区板材质可能共享贴图）。 */
function disposeOwnedResources(node: ThreeObject): void {
  node.traverse((child) => {
    ;(child as unknown as { geometry?: ThreeGeometry }).geometry?.dispose?.()
    if (child.userData?.floorRegionPlate !== true && child.userData?.underfloorHeating !== true) return
    ;(child as unknown as { material?: { dispose?: () => void } }).material?.dispose?.()
  })
}

/** 整板显隐（保留节点：关掉分区后要能原样显回来）。 */
function setWholeFloorPlateVisible(root: ThreeObject, visible: boolean): void {
  for (const node of root.children) {
    if (node.userData?.regionReceiverKind === 'floor') node.visible = visible
  }
  root.userData.floorRegionPlatesActive = !visible
}

function buildPlateMesh(
  plate: { outline: PlanPt[]; holes: PlanPt[][]; params: FloorRegionMaterialParams },
  toWorld: (point: PlanPt) => { x: number; z: number },
  floorSurfaceY: number,
  createMaterial: (params: FloorRegionMaterialParams) => unknown,
): ThreeObject | null {
  const shape = ringToShape(plate.outline, toWorld)
  if (!shape) return null
  for (const hole of plate.holes) {
    const holePath = ringToShape(hole, toWorld)
    if (holePath) shape.holes.push(holePath)
  }
  const mesh = new three.Mesh(new three.ShapeGeometry(shape, 1), createMaterial(plate.params))
  // 与整板同姿态：XZ 平面、顶面抬到地面高度。
  mesh.rotation.x = Math.PI / 2
  mesh.position.set(0, floorSurfaceY, 0)
  mesh.userData.regionReceiverKind = 'floor'
  mesh.userData.exportRole = 'plan'
  mesh.userData.floorRegionPlate = true
  return mesh
}

/** 平面环 → three.Shape（`Shape` 用 xy，映射到世界 xz）。 */
function ringToShape(ring: readonly PlanPt[], toWorld: (point: PlanPt) => { x: number; z: number }): ThreeShape | null {
  if (!Array.isArray(ring) || ring.length < 3) return null
  const shape = new three.Shape()
  ring.forEach((point, index) => {
    const world = toWorld(point)
    if (index === 0) shape.moveTo(world.x, world.z)
    else shape.lineTo(world.x, world.z)
  })
  shape.closePath()
  return shape
}

/** 盘管分组（没有可画的段时返回 `null`）。 */
function buildHeatingGroup(
  floorRecord: FloorRenderRecord | null | undefined,
  toWorld: (point: PlanPt) => { x: number; z: number },
  floorSurfaceY: number,
): ThreeObject | null {
  const polylines = resolveHeatingPolylines(floorRecord, toWorld)
  if (!shouldRenderHeating(floorRecord, polylines.length)) return null
  const positions = heatingPositions(polylines, floorSurfaceY)
  if (positions.length === 0) return null
  const geometry = new three.BufferGeometry()
  geometry.setAttribute('position', new three.Float32BufferAttribute(positions, 3))
  const lines = new three.LineSegments(
    geometry,
    new three.LineBasicMaterial({ color: HEATING_COLOR, transparent: true, opacity: 0.72 }),
  )
  lines.userData.underfloorHeating = true
  lines.userData.exportRole = 'plan'
  lines.name = 'underfloor-heating'
  return lines
}

/** 折线 → 顶点数组（每两段一条线段）。 */
function heatingPositions(polylines: readonly HeatingPolyline[], floorSurfaceY: number): number[] {
  const positions: number[] = []
  for (const polyline of polylines) {
    const [start, end] = polyline.points
    if (!start || !end) continue
    positions.push(start.x, floorSurfaceY + HEATING_LIFT, start.z, end.x, floorSurfaceY + HEATING_LIFT, end.z)
  }
  return positions
}

/**
 * 墙面家具预览的**批处理收尾**（0.8.9 `studio-wall-preview.js`）。
 *
 * ## 这个模块解决什么
 *
 * 挂墙家具（电视、壁挂空调、装饰画、壁灯…）在同一次装配里会被合批成 InstancedMesh。
 * 合批后同一批内所有实例共享一个 draw call，但它带来两个副作用：
 *
 * 1. **透明件失去稳定顺序**：合批把「先画不透明、后画透明」的绘制顺序抹平了，
 *    相邻两帧可能换上不同的顺序 —— 表现为玻璃面板闪烁（z-fighting 的邻居）。
 *    three 对透明物体按 `renderOrder` / `id` 排序，我们给每件透明/透射网格写一个
 *    **小数排序键**（`userData.studioEditorSortId`），键落在「本批最大 id 之上」，
 *    既不打乱不透明件，又让透明件在批内顺序确定。
 * 2. **批次可能漏件**：合批是按签名分组的，签名算错或可见性判断不一致时会静默漏掉
 *    一件。`planWallFurniture` 先做一次「声明参与合批的每一件都被覆盖」的校验，
 *    不满足就返回 `null`，调用方保持原状（宁可少一次优化，也不能让家具消失）。
 *
 * ## 与上游的两处有意差异
 *
 * - 上游还会重排 `root.children`（把批次与单品按固定顺序重挂）。本项目的图层顺序
 *   由 `scene-layers.ts` 统一管理（灯光/地面/墙体/物品各有固定层），在此重排会把
 *   层序打乱，因此只写排序键、不动 children。
 * - 上游的 `rebaseWallBatches`（墙体平移后按缓存原点重定位实例）在本项目**不需要**：
 *   墙体变动走整层重建（`scene-rebuild.ts`），批处理不复用，没有跨编辑累积漂移。
 *
 * ## 为什么类型这么窄
 *
 * 本模块只碰 three 的三样东西：`userData`、`material`、`traverse`。用窄接口而不是
 * 宽泛类型，既是门禁要求（宽类型棘轮只许下降），也顺手把「读哪个字段」写清楚了。
 */

/** 参与合批的节点标记（`scene-layers.ts` 写入）。 */
const ITEM_MODEL_LAYER = 'items'

/** three 的 Object3D 在本模块里被用到的部分。 */
export type SceneNodeLike = {
  id?: unknown
  userData?: Record<string, unknown> | null
  material?: unknown
  traverse?: (visit: (node: SceneNodeLike) => void) => void
}

/** 材质里只关心「是否透明 / 是否有透射」。 */
type MaterialLike = { transparent?: unknown; transmission?: unknown }

function isTransparentMesh(node: SceneNodeLike): boolean {
  const material = node.material
  if (!material) return false
  const list: unknown[] = Array.isArray(material) ? material : [material]
  return list.some((entry) => {
    const candidate = entry as MaterialLike | null | undefined
    return candidate?.transparent === true || Number(candidate?.transmission) > 0
  })
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).filter(Boolean) : []
}

/** 节点覆盖的物品 id（合批节点用 `instanceItemIds`，单品用 `studioEditorItemId`）。 */
function coveredItemIds(node: SceneNodeLike): string[] {
  const userData = node.userData
  if (!userData) return []
  const instanceIds = stringList(userData.instanceItemIds)
  if (instanceIds.length) return instanceIds
  const ranges = userData.studioEditorItemRanges
  if (Array.isArray(ranges) && ranges.length) {
    return ranges
      .map((range) => (range && typeof range === 'object' ? String((range as { id?: unknown }).id ?? '') : ''))
      .filter(Boolean)
  }
  const single = userData.studioEditorItemId
  return typeof single === 'string' && single ? [single] : []
}

export type WallFurniturePlan = {
  /** 被节点覆盖的物品 id。 */
  ids: Set<string>
  /** 参与收尾的节点（物品层）。 */
  nodes: Set<SceneNodeLike>
  /** 合批节点本身。 */
  batches: SceneNodeLike[]
}

/**
 * 校验「声明参与合批的每一件都被某个节点覆盖」。
 *
 * @param root 场景根（内部按 `modelLayer === 'items'` 收集节点；合批节点可能在更深
 *   的层级，所以用 `traverse` 而不是只看 children）
 * @param visibleIds 本次声明要参与合批的物品 id
 * @returns 覆盖完整时返回计划；缺件/无可见件时返回 `null`（调用方保持原状）
 */
export function planWallFurniture(root: unknown, visibleIds: Iterable<string>): WallFurniturePlan | null {
  const wanted = new Set(Array.from(visibleIds, String).filter(Boolean))
  const sceneRoot = root as SceneNodeLike | null | undefined
  if (!wanted.size || typeof sceneRoot?.traverse !== 'function') return null
  const ids = new Set<string>()
  const covered = new Set<SceneNodeLike>()
  const batches: SceneNodeLike[] = []
  let hasProxy = false
  sceneRoot.traverse((node) => {
    const userData = node?.userData
    if (!userData) return
    // 选择代理不是真实家具：一旦混进来就不能按批次算顺序。
    if (userData.studioEditorSelectionProxy) hasProxy = true
    if (userData.modelLayer !== ITEM_MODEL_LAYER) return
    const nodeIds = coveredItemIds(node)
    if (!nodeIds.length) return
    for (const id of nodeIds) ids.add(id)
    covered.add(node)
    if (userData.instanceItemIds || userData.studioEditorItemRanges) batches.push(node)
  })
  if (hasProxy) return null
  for (const id of wanted) if (!ids.has(id)) return null
  return { ids, nodes: covered, batches }
}

/**
 * 给透明/透射网格写稳定排序键。
 *
 * 排序键取「本批最大对象 id + 名次比例」，因此：
 * - 一定大于该批内任何不透明件（不改变不透明件的先后）；
 * - 相邻透明件之间保持 1/(n+1) 的间距，后续插入还有空间。
 *
 * @returns 写入了多少个排序键（0 表示没有透明件或覆盖不完整）
 */
export function finishWallFurniture(root: unknown, visibleIds: Iterable<string>): number {
  const plan = planWallFurniture(root, visibleIds)
  if (!plan) return 0
  const transparent: SceneNodeLike[] = []
  let maxId = 0
  for (const node of plan.nodes) {
    node.traverse?.((mesh) => {
      maxId = Math.max(maxId, Number(mesh?.id ?? 0))
      if (mesh?.material && isTransparentMesh(mesh)) transparent.push(mesh)
    })
  }
  if (!transparent.length) return 0
  transparent.sort((left, right) => Number(left.id ?? 0) - Number(right.id ?? 0))
  const count = transparent.length
  transparent.forEach((mesh, index) => {
    const userData = (mesh.userData ??= {})
    userData.studioEditorSortId = maxId + (index + 1) / (count + 1)
  })
  return count
}
