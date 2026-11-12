import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { sceneModelOrigin as sceneModelOrigin2 } from '../../../plan/courtyard-drawing'
import { cacheObjectTransforms as cacheObjectTransforms2 } from '../../../../bridge/scene/scene-matrices'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2 } from '../../../plan/geometry'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import { composeItemKey } from '../../ui/studio-app-helpers'
import { applyItemOrientation } from '../geometry/item-orientation'
import { applyLightOnState } from '../../lights/strip-light/strip-light-model'

export function restoreLightVisibility(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.isCacheReady || runtime.previewLightCacheCanvasElement.hidden) return
  const overlaySurfacePainter = runtime.previewLightCacheCanvasElement.getContext('2d')
  if (overlaySurfacePainter) {
    overlaySurfacePainter.clearRect(
      0,
      0,
      runtime.previewLightCacheCanvasElement.width,
      runtime.previewLightCacheCanvasElement.height,
    )
    for (const [overlayGroupId, overlayImage] of runtime.appCtx.lightGroupCacheByFloor) {
      const overlayAlpha = clamp2(finite2(runtime.appCtx.lightGainByFloor.get(overlayGroupId), 0), 0, 1)
      overlayAlpha <= 0.001 ||
        (overlaySurfacePainter.save(),
        (overlaySurfacePainter.globalAlpha = overlayAlpha),
        overlaySurfacePainter.drawImage(overlayImage, 0, 0),
        overlaySurfacePainter.restore())
    }
  }
}

export function findLightGroup(runtime: StudioAppRuntime, lightGroupId: any) {
  return (
    runtime.appCtx.studioState.lightGroups?.find((candidateLightGroup) => candidateLightGroup.id === lightGroupId) ||
    null
  )
}

export function transitionLightGroups(runtime: StudioAppRuntime, transitionGroupIds: any) {
  const uniqueTransitionGroupIds = [...new Set(transitionGroupIds)].filter(Boolean)
  runtime.areLightsEnabled() && !runtime.appCtx.pendingRuntimeSettings
    ? runtime.fadeLightsIn(uniqueTransitionGroupIds)
    : runtime.fadeLightsOut(uniqueTransitionGroupIds) ||
      runtime.requestSceneRebuild({
        scope: 'lights',
        preserveLightCache: true,
      }),
    runtime.syncLightGroupList(),
    runtime.refreshStudioUi(),
    runtime.refreshStudioView(),
    runtime.requestStudioRender(),
    runtime.scheduleLightPrecompile()
}

export function syncLightCache(runtime: StudioAppRuntime) {
  runtime.appCtx.isLightOverrideOn = true
  try {
    runtime.getPreviewFloorMode() === 'all'
      ? runtime.rebuildFloorLayers({
          preserveLightCache: true,
        })
      : runtime.buildLightsLayer({
          preserveLightCache: true,
        })
  } finally {
    runtime.appCtx.isLightOverrideOn = false
  }
}

export function buildLightCacheMap(runtime: StudioAppRuntime) {
  const lightsByItemKey = new Map()
  return (
    runtime.appCtx.sceneRootNode?.traverse((cacheLightObject: any) => {
      const cachedLightItemId = cacheLightObject.userData?.lightItemId
      if (!cacheLightObject.isLight || !cachedLightItemId) return
      const ji3 = composeItemKey(cacheLightObject.userData?.lightFloorId, cachedLightItemId)
      lightsByItemKey.has(ji3) || lightsByItemKey.set(ji3, []), lightsByItemKey.get(ji3).push(cacheLightObject)
    }),
    lightsByItemKey
  )
}

export function ensureLightCache(runtime: StudioAppRuntime, lightEntries: any) {
  let lightCacheMap = runtime.buildLightCacheMap()
  if (lightEntries.every((lightCacheEntry: any) => lightCacheMap.has(lightCacheEntry.itemKey))) return lightCacheMap
  if (runtime.isEmbeddedStage) return runtime.updateLightCache(lightEntries, lightCacheMap)
  ;(runtime.appCtx.isResidentCacheMode = true), (runtime.appCtx.overriddenFloorIds = new Set())
  try {
    runtime.syncLightCache()
  } finally {
    ;(runtime.appCtx.overriddenFloorIds = null), (runtime.appCtx.isResidentCacheMode = false)
  }
  return ((lightCacheMap = runtime.buildLightCacheMap()), lightCacheMap)
}

export function updateLightCache(runtime: StudioAppRuntime, incrementalLightEntries: any, lightCacheTarget: any) {
  const sceneSnapshot = runtime.appCtx.studioState,
    oe3 = runtime.appCtx.activeFloorId,
    Xr2 = runtime.appCtx.isResidentCacheMode,
    isAllFloorsView = runtime.getPreviewFloorMode() === 'all'
  try {
    runtime.appCtx.isResidentCacheMode = true
    for (const { floor: cacheFloor, item: cacheLightItem, itemKey: cacheItemKey } of incrementalLightEntries) {
      if (lightCacheTarget.has(cacheItemKey) || (!isAllFloorsView && cacheFloor.id !== oe3)) continue
      const floorGroup = isAllFloorsView
        ? runtime.appCtx.sceneRootNode?.children.find(
            (floorChildGroup: any) => floorChildGroup.userData?.floorId === cacheFloor.id,
          )
        : runtime.appCtx.sceneRootNode
      if (!floorGroup) continue
      ;(runtime.appCtx.studioState = cacheFloor.scene), (runtime.appCtx.activeFloorId = cacheFloor.id)
      const lightCacheTargetPixelsPerMeter = runtime.getPixelsPerMeter()
      if (!lightCacheTargetPixelsPerMeter) continue
      const floorModelOrigin = sceneModelOrigin2(cacheFloor.scene, cacheFloor),
        floorOriginX = isAllFloorsView ? finite2(cacheFloor.originX, 0) : floorModelOrigin.x,
        floorOriginY = isAllFloorsView ? finite2(cacheFloor.originY, 0) : floorModelOrigin.y,
        lightProxyGroup = new ns2.Group()
      runtime.addLightModel(lightProxyGroup, cacheLightItem, runtime.collectLightSourceSpecs()),
        lightProxyGroup.position.set(
          (cacheLightItem.x - floorOriginX) / lightCacheTargetPixelsPerMeter,
          cacheLightItem.elevation || 0,
          (cacheLightItem.y - floorOriginY) / lightCacheTargetPixelsPerMeter,
        ),
        applyItemOrientation(lightProxyGroup, cacheLightItem),
        (lightProxyGroup.userData.modelLayer = 'lights'),
        (lightProxyGroup.userData.exportRole = 'plan'),
        floorGroup.add(lightProxyGroup),
        runtime.isEmbeddedStage && cacheObjectTransforms2(lightProxyGroup, ns2.Object3D)
      const proxyLights: any = []
      lightProxyGroup.traverse((proxyLightObject: any) => {
        proxyLightObject.isLight && proxyLights.push(proxyLightObject)
      }),
        proxyLights.length && lightCacheTarget.set(cacheItemKey, proxyLights)
    }
  } finally {
    ;(runtime.appCtx.studioState = sceneSnapshot),
      (runtime.appCtx.activeFloorId = oe3),
      (runtime.appCtx.isResidentCacheMode = Xr2)
  }
  return (
    runtime.setupSceneShadows(runtime.appCtx.sceneRootNode, {
      rebuildAtlas: false,
    }),
    lightCacheTarget
  )
}

export function showLightCacheFor(runtime: StudioAppRuntime, cacheMapSource: any, activeCacheKey = '') {
  for (const [cacheEntryKey, cacheLightObjects] of cacheMapSource) {
    const isCacheEntryActive = cacheEntryKey === activeCacheKey
    for (const cacheTargetLight of cacheLightObjects)
      (cacheTargetLight.visible = isCacheEntryActive),
        applyLightOnState(cacheTargetLight, isCacheEntryActive),
        cacheTargetLight.isSpotLight &&
          ((cacheTargetLight.castShadow = isCacheEntryActive),
          isCacheEntryActive &&
            cacheTargetLight.shadow &&
            !cacheTargetLight.shadow.map &&
            (cacheTargetLight.shadow.needsUpdate = true))
  }
  runtime.isEmbeddedStage ||
    runtime.appCtx.lightPrecompileController?.syncRenderUniforms(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
    runtime.renderStudioFrame()
}

export function collectActiveLightGroupKeys(runtime: StudioAppRuntime) {
  return new Set(
    runtime
      .collectLampEntries()
      .filter(
        ({ item: activeEntryItem, group: activeEntryGroup }: any) =>
          activeEntryGroup?.enabled !== false && finite2(activeEntryItem.lightBrightness, 0) > 0,
      )
      .map(({ itemKey: activeEntryKey }: any) => activeEntryKey),
  )
}

export function showCachedLights(runtime: StudioAppRuntime, cacheMapForDisplay: any) {
  const sv2 = runtime.collectActiveLightGroupKeys()
  for (const [displayCacheKey, displayLightObjects] of cacheMapForDisplay) {
    const isDisplayEntryActive = sv2.has(displayCacheKey)
    for (const displayLightObject of displayLightObjects)
      (displayLightObject.visible = isDisplayEntryActive),
        applyLightOnState(displayLightObject, isDisplayEntryActive),
        displayLightObject.isSpotLight && (displayLightObject.castShadow = false)
  }
  runtime.isEmbeddedStage ||
    runtime.appCtx.lightPrecompileController?.syncRenderUniforms(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
    runtime.renderStudioFrame()
}

export function captureLightSnapshot(runtime: StudioAppRuntime) {
  if (!runtime.previewRenderShieldElement || !runtime.appCtx.threeRenderer?.domElement) return
  const domElement5 = runtime.appCtx.threeRenderer.domElement
  if (!domElement5.width || !domElement5.height) return
  runtime.isEmbeddedStage &&
    (window.clearTimeout(runtime.appCtx.previewShieldTimeoutId),
    (runtime.appCtx.previewShieldTimeoutId = null),
    (runtime.previewRenderShieldElement.style.transition = 'none'),
    (runtime.previewRenderShieldElement.style.opacity = '1')),
    (runtime.previewRenderShieldElement.width = domElement5.width),
    (runtime.previewRenderShieldElement.height = domElement5.height)
  const compositeSurfacePainter = runtime.previewRenderShieldElement.getContext('2d')
  compositeSurfacePainter &&
    ((compositeSurfacePainter.globalCompositeOperation = 'source-over'),
    (compositeSurfacePainter.globalAlpha = 1),
    (compositeSurfacePainter.fillStyle = '#' + runtime.backgroundSettings().background.toString(16).padStart(6, '0')),
    compositeSurfacePainter.fillRect(
      0,
      0,
      runtime.previewRenderShieldElement.width,
      runtime.previewRenderShieldElement.height,
    ),
    runtime.isEmbeddedStage &&
      runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
    compositeSurfacePainter.drawImage(domElement5, 0, 0),
    runtime.previewLightCacheCanvasElement.hidden ||
      (runtime.isEmbeddedStage
        ? compositeSurfacePainter.drawImage(
            runtime.previewLightCacheCanvasElement,
            0,
            0,
            runtime.previewRenderShieldElement.width,
            runtime.previewRenderShieldElement.height,
          )
        : compositeSurfacePainter.drawImage(runtime.previewLightCacheCanvasElement, 0, 0)),
    (runtime.previewRenderShieldElement.hidden = false))
}

export function restorePreviewAfterFade(runtime: StudioAppRuntime, { smooth: isSmoothRestore = false } = {}) {
  if (runtime.previewRenderShieldElement) {
    if (runtime.isEmbeddedStage) {
      if (
        (window.clearTimeout(runtime.appCtx.previewShieldTimeoutId),
        (runtime.appCtx.previewShieldTimeoutId = null),
        isSmoothRestore && !runtime.previewRenderShieldElement.hidden)
      ) {
        ;(runtime.previewRenderShieldElement.style.transition = 'opacity 180ms ease-out'),
          (runtime.previewRenderShieldElement.style.opacity = '0'),
          (runtime.appCtx.previewShieldTimeoutId = window.setTimeout(() => {
            ;(runtime.appCtx.previewShieldTimeoutId = null),
              (runtime.previewRenderShieldElement.hidden = true),
              (runtime.previewRenderShieldElement.style.transition = 'none'),
              (runtime.previewRenderShieldElement.style.opacity = '1')
          }, 180))
        return
      }
      ;(runtime.previewRenderShieldElement.style.transition = 'none'),
        (runtime.previewRenderShieldElement.style.opacity = '1')
    }
    runtime.previewRenderShieldElement.hidden = true
  }
}
