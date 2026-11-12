import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  courtyardBoundaryPoints as courtyardBoundaryPoints2,
  sceneContentBounds as sceneContentBounds2,
  sceneModelOrigin as sceneModelOrigin2,
} from '../../../plan/courtyard-drawing'
import { decorateWarmFloor as decorateWarmFloor2 } from '../../scene/studio-scene-style'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { isCourtyardDrawing as isCourtyardDrawing2, finite as finite2 } from '../../../loaders/studio-normalization'
import type { SceneRebuildOptions } from '../../types/studio-app-types'

export function requestSceneRebuild(runtime: StudioAppRuntime, rebuildOptions: SceneRebuildOptions = {}) {
  if (typeof runtime.appCtx.isSceneStillLoading < 'u' && runtime.appCtx.isSceneStillLoading) {
    runtime.assetLoaderState.revision++
    return
  }
  const isForcedRebuild = rebuildOptions.force === true,
    isExternalOnlyRebuild = rebuildOptions.externalModelsOnly === true,
    scope =
      typeof rebuildOptions.scope === 'string' && ['items', 'lights', 'architecture'].includes(rebuildOptions.scope)
        ? rebuildOptions.scope
        : 'all'
  if (!runtime.getPreviewSyncMode() && !isForcedRebuild) {
    rebuildOptions.transient !== true && (runtime.appCtx.isSceneDirty = true), runtime.refreshPreviewSync()
    return
  }
  isForcedRebuild
    ? ((runtime.appCtx.isMaterialPrecompilePending = true),
      isExternalOnlyRebuild || (runtime.dirtyFloorIdSet.add('all'), (runtime.appCtx.hasAllFloorsSelected = true)))
    : (runtime.dirtyFloorIdSet.add(scope), scope === 'all' && (runtime.appCtx.hasAllFloorsSelected = true)),
    isExternalOnlyRebuild && (runtime.appCtx.isRuntimeWarmupDone = true),
    rebuildOptions.precompile === true && (runtime.appCtx.isRendererLost = true),
    rebuildOptions.preserveLightCache !== true && (runtime.appCtx.isLightCachePreserved = true),
    !runtime.appCtx.isPrecompileBlocked &&
      ((runtime.appCtx.isPrecompileBlocked = true),
      requestAnimationFrame(() => {
        if (
          ((runtime.appCtx.isPrecompileBlocked = false),
          runtime.appCtx.isWindowHidden && !runtime.appCtx.isMaterialPrecompilePending)
        )
          return
        const wl4 = runtime.getPreviewSyncMode() || runtime.appCtx.isMaterialPrecompilePending
        if (((runtime.appCtx.isMaterialPrecompilePending = false), !wl4)) {
          ;(runtime.appCtx.isSceneDirty = true), runtime.refreshPreviewSync()
          return
        }
        const rebuildScopeSet = new Set(runtime.dirtyFloorIdSet)
        runtime.dirtyFloorIdSet.clear()
        const yl5 = runtime.appCtx.hasAllFloorsSelected || rebuildScopeSet.has('all')
        runtime.appCtx.hasAllFloorsSelected = false
        const shouldPreserveLightCacheOnRebuild = !runtime.appCtx.isLightCachePreserved
        runtime.appCtx.isLightCachePreserved = false
        const Hr2 = typeof runtime.appCtx.isRuntimeWarmupDone < 'u' && runtime.appCtx.isRuntimeWarmupDone
        typeof runtime.appCtx.isRuntimeWarmupDone < 'u' && (runtime.appCtx.isRuntimeWarmupDone = false),
          typeof runtime.stageLoadTiming == 'function' && runtime.stageLoadTiming('rebuild-start'),
          Hr2 &&
          !yl5 &&
          !rebuildScopeSet.has('architecture') &&
          !rebuildScopeSet.has('lights') &&
          runtime.appCtx.sceneRootNode?.children?.length
            ? (runtime.getPreviewFloorMode() === 'all'
                ? runtime.buildLayerForFloor('items', {
                    preserveLightCache: false,
                  })
                : (runtime.buildFloorAtIndex(new Set(['items']), {
                    preserveLightCache: false,
                  }),
                  true)) ||
              runtime.rebuildFloorLayers({
                preserveLightCache: shouldPreserveLightCacheOnRebuild,
              })
            : yl5 || !runtime.appCtx.studioState.walls.length
              ? runtime.rebuildFloorLayers({
                  preserveLightCache: shouldPreserveLightCacheOnRebuild,
                })
              : runtime.buildFloorAtIndex(rebuildScopeSet, {
                  preserveLightCache: shouldPreserveLightCacheOnRebuild,
                  allowTransforms: !Hr2 && rebuildScopeSet.size === 1 && rebuildScopeSet.has('items'),
                }),
          typeof runtime.stageLoadTiming == 'function' && runtime.stageLoadTiming('rebuild-end')
        const zd2 = runtime.appCtx.isRendererLost
        ;(runtime.appCtx.isRendererLost = false),
          runtime.updateExternalModelDataset(),
          (zd2 || runtime.collectSharedMaterials().length) && runtime.scheduleExternalPrecompile(),
          (runtime.appCtx.isSceneDirty = false),
          runtime.refreshPreviewSync()
      }))
}

export function getSceneContentBounds(runtime: StudioAppRuntime) {
  return sceneContentBounds2(runtime.appCtx.studioState)
}

export function computeCourtyardBounds(runtime: StudioAppRuntime, { physicalStack: isPhysicalStack = false } = {}) {
  if (!runtime.appCtx.studioProject?.floors?.length) return null
  const isAllFloors = runtime.getPreviewFloorMode() === 'all',
    sort4 = isAllFloors
      ? [...runtime.appCtx.studioProject.floors].sort((floorA, floorB) => floorA.elevation - floorB.elevation)
      : runtime.appCtx.studioProject.floors.filter(
          (isPhysicalStackFloorMatch: any) => isPhysicalStackFloorMatch.id === runtime.appCtx.activeFloorId,
        )
  if (
    !sort4.some((isPhysicalStackFloorCandidate: any) =>
      isPhysicalStackFloorCandidate.scene.items.some(isCourtyardDrawing2),
    )
  )
    return null
  const courtyardBoundsBox = new ns2.Box3(),
    floorGapMeters = runtime.appCtx.pendingRuntimeSettings
      ? finite2(runtime.appCtx.studioProject.exportFloorGap, 3)
      : finite2(runtime.appCtx.studioProject.previewFloorGap, 3)
  return (
    sort4.forEach((isPhysicalStackFloorEntry: any, isPhysicalStackFloorIndex: any) => {
      const isPhysicalStackPixelsPerMeter = isPhysicalStackFloorEntry.scene.calibration?.pixelsPerMeter || 100,
        isPhysicalStackFloorModelOrigin = sceneModelOrigin2(isPhysicalStackFloorEntry.scene, isPhysicalStackFloorEntry),
        floorElevationOffset = isAllFloors
          ? isPhysicalStack
            ? isPhysicalStackFloorEntry.elevation - sort4[0].elevation
            : isPhysicalStackFloorIndex * floorGapMeters
          : 0,
        maxCourtyardHeight = Math.max(
          0,
          ...isPhysicalStackFloorEntry.scene.walls.map((isPhysicalStackWallEntry: any) =>
            finite2(isPhysicalStackWallEntry.height, isPhysicalStackFloorEntry.scene.settings?.wallHeight || 2.8),
          ),
          ...isPhysicalStackFloorEntry.scene.items
            .filter(isCourtyardDrawing2)
            .map(
              (courtyardLevelDrawing: any) =>
                finite2(courtyardLevelDrawing.elevation, 0) + finite2(courtyardLevelDrawing.height, 0),
            ),
        )
      for (const courtyardBoundaryPoint of courtyardBoundaryPoints2(
        isPhysicalStackFloorEntry.scene,
        isPhysicalStackPixelsPerMeter,
      )) {
        const $a4 = isAllFloors
          ? runtime.planToWorldPoint(isPhysicalStackFloorEntry, courtyardBoundaryPoint)
          : {
              x: (courtyardBoundaryPoint.x - isPhysicalStackFloorModelOrigin.x) / isPhysicalStackPixelsPerMeter,
              z: (courtyardBoundaryPoint.y - isPhysicalStackFloorModelOrigin.y) / isPhysicalStackPixelsPerMeter,
            }
        courtyardBoundsBox.expandByPoint(new ns2.Vector3($a4.x, floorElevationOffset, $a4.z)),
          courtyardBoundsBox.expandByPoint(new ns2.Vector3($a4.x, floorElevationOffset + maxCourtyardHeight, $a4.z))
      }
    }),
    courtyardBoundsBox.isEmpty() ? null : courtyardBoundsBox
  )
}

export function createFloorMaterial(runtime: StudioAppRuntime) {
  const yt5 = runtime.backgroundSettings(),
    floorMaterial = new ns2.MeshStandardMaterial({
      color: yt5.floor,
      roughness: 0.96,
      metalness: 0,
      emissive: yt5.floor,
      emissiveIntensity: 0.025,
    })
  return (decorateWarmFloor2(floorMaterial, yt5), floorMaterial)
}
