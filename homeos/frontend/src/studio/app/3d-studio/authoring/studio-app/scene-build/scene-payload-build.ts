import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  MATERIAL_STYLE_AUTO,
  materialStylePaletteColors,
  normalizeMaterialStyle,
} from '../../../materials/studio-material-presets'
import { buildStaticMaterialKey } from '../../../materials/studio-static-material-key'
import {
  RENDER_CACHE_VERSION as RENDER_CACHE_VERSION2,
  cacheSceneDescriptor as cacheSceneDescriptor2,
  sha256 as sha2562,
  stableCacheJSON as stableCacheJSON2,
} from '../../../../bridge/scene/render-cache'
import { ALL_ITEM_MODELS as ALL_ITEM_MODELS2 } from '../../../loaders/studio-external-models'
import { isCourtyardDrawing as isCourtyardDrawing2 } from '../../../loaders/studio-normalization'
import { normalizePillarShape as normalizePillarShape2 } from '../../items/studio-item-posture'
import { tvMountStyleSet } from '../../items/item-catalog'
import { STORAGE_SECTION_TYPES, storageSectionModelType } from '../../items/studio-storage-sections'
import { normalizeMaterialSurfaceOverrides } from '../../scene/payload/studio-scene-payload'
import { normalizeStudioDocument } from '../../scene/payload/studio-document-payload'

export function sceneCacheDescriptor(runtime: StudioAppRuntime, descriptorWidth: any, descriptorHeight: any) {
  const floors =
    runtime.getPreviewFloorMode() === 'all' ? runtime.appCtx.studioProject.floors : [runtime.getActiveFloor()]
  runtime.appCtx.threeCamera.updateMatrixWorld()
  const roundMatrixNumbers = (matrixElements: any) =>
      matrixElements.map((matrixElementValue: any) => Math.round(matrixElementValue * 100000000) / 100000000),
    list: any = []
  return (
    runtime.appCtx.sceneRootNode.traverse((sceneObject: any) => {
      ;['background', 'grid'].includes(sceneObject.userData?.exportRole) &&
        list.push([sceneObject.userData.exportRole, sceneObject.visible])
    }),
    sha2562(
      stableCacheJSON2({
        ...(floors.some((floorRecord: any) => floorRecord.scene.items.some(isCourtyardDrawing2))
          ? {
              courtyardGeometry: 'v5-foundation-finish-perimeter',
            }
          : {}),
        version: RENDER_CACHE_VERSION2,
        doorGeometry: 'v5-default-opening',
        windowGeometry: 'v2-opening-clearance',
        regionFalloff: 'v2-broad',
        regionLightGain: 'v3-default80',
        wallUnion: 'v3-near-collinear',
        scene: cacheSceneDescriptor2(floors),
        mode: runtime.getPreviewFloorMode(),
        gap: runtime.appCtx.studioProject.previewFloorGap,
        uniformOverviewStack: runtime.appCtx.studioProject.uniformOverviewStack === true,
        ...(runtime.appCtx.studioProject.uniformOverviewStack === true
          ? {
              overviewProjection: 'saved-camera-v1',
            }
          : {}),
        ...(runtime.isEmbedStageMode && runtime.appCtx.sceneStyle === 'warm-wood'
          ? {
              warmRegionLighting: 'v13-balanced-wash',
            }
          : {}),
        lighting: runtime.appCtx.baseLightingSettings,
        style: runtime.backgroundSettings(),
        wallOpacity: runtime.appCtx.wallOpacityValue,
        visibility: list,
        reflections: runtime.appCtx.reflectionSettingsJson,
        curtains: runtime.appCtx.curtainStructureJson,
        ...(runtime.appCtx.backgroundThemeName !== 'grid'
          ? {
              backgroundTheme: 'v6:' + runtime.appCtx.backgroundThemeName,
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
  )
}

export function checkModelInUse(runtime: StudioAppRuntime, modelKey: any) {
  return !!runtime.appCtx.studioProject?.floors?.some((floorSelection: any) =>
    floorSelection.scene?.items?.some((floorItem: any) => {
      /** 两节柜是同一 `type` 的变体模型：按实际解析出的模型类型反查“已放置”。 */
      if (STORAGE_SECTION_TYPES.has(floorItem.type) && storageSectionModelType(floorItem) === modelKey) return true
      if (modelKey.startsWith('tv_')) {
        const tvMountStyle = tvMountStyleSet.has(floorItem.tvMountStyle) ? floorItem.tvMountStyle : 'standard'
        return floorItem.type === 'tv' && modelKey === 'tv_' + tvMountStyle
      }
      if (modelKey.startsWith('pillar_')) {
        const pillarShape = modelKey.slice('pillar_'.length)
        return floorItem.type === 'pillar' && normalizePillarShape2(floorItem.pillarShape) === pillarShape
      }
      return floorItem.type === modelKey
    }),
  )
}

export function collectScenePayload(
  runtime: StudioAppRuntime,
  floorRecords: any[] = [],
  { includeCurtains: includeCurtainFlag = false } = {},
) {
  return [
    ...new Set(
      floorRecords.flatMap((floorEntry) =>
        (floorEntry?.scene?.items || [])
          .filter((itemEntry: any) => includeCurtainFlag || itemEntry.type !== 'curtain')
          .map((itemRecord: any) => runtime.modelTypeForItem(itemRecord))
          .filter((assetModelKey: any) => (ALL_ITEM_MODELS2 as any)[assetModelKey]),
      ),
    ),
  ]
}

export function collectSelectedFloors(runtime: StudioAppRuntime) {
  const activeFloorRecords =
    runtime.getPreviewFloorMode() === 'all'
      ? runtime.appCtx.studioProject?.floors || []
      : [runtime.getActiveFloor()].filter(Boolean)
  return runtime.collectScenePayload(activeFloorRecords)
}

export function scheduleModelLoadFlush(runtime: StudioAppRuntime, flushDelayMs = 900) {
  window.clearTimeout(runtime.appCtx.modelLoadDebounceId),
    (runtime.appCtx.modelLoadDebounceId = window.setTimeout(
      () => {
        if (
          ((runtime.appCtx.modelLoadDebounceId = null),
          !runtime.appCtx.isExternalModelLoadDeferred ||
            document.hidden ||
            runtime.appCtx.isWindowHidden ||
            runtime.appCtx.isRenderSuppressed)
        ) {
          runtime.appCtx.isExternalModelLoadDeferred && runtime.scheduleModelLoadFlush(300)
          return
        }
        const uniqueModelTypes = [...new Set(runtime.appCtx.deferredModelTypes)]
        ;(runtime.appCtx.deferredModelTypes = []), Promise.allSettled(runtime.loadModelsForTypes(uniqueModelTypes))
      },
      Math.max(0, flushDelayMs),
    ))
}

export function loadModelsForTypes(runtime: StudioAppRuntime, requestedModelTypes: any[] = []) {
  window.clearTimeout(runtime.appCtx.modelLoadDebounceId),
    (runtime.appCtx.modelLoadDebounceId = null),
    (runtime.appCtx.isExternalModelLoadDeferred = false),
    (window.externalModelLoadsDeferred = false)
  const filter = [...new Set(requestedModelTypes)].filter(
    (modelTypeFilterKey) => (ALL_ITEM_MODELS2 as any)[modelTypeFilterKey],
  )
  if (!filter.length) return []
  window.__homeosReleasingDeferredModels = true
  const map = filter.map((modelTypeEntry) => runtime.ensureExternalModelLoaded(modelTypeEntry))
  return ((window.__homeosReleasingDeferredModels = false), map)
}

export function preloadDefaultModels(runtime: StudioAppRuntime) {
  return runtime.loadModelsForTypes(runtime.collectSelectedFloors())
}

export function requestSceneRender(runtime: StudioAppRuntime) {
  if (typeof runtime.appCtx.isExternalModelPending < 'u' && runtime.appCtx.isExternalModelPending) {
    runtime.appCtx.isModelLoadPending = true
    return
  }
  if (runtime.isAutoDiagramEmbed || runtime.appCtx.isModelLoadDeferred) {
    runtime.publishModelLoadState()
    return
  }
  ;(runtime.appCtx.isModelLoadPending = true),
    runtime.publishModelLoadState(),
    runtime.appCtx.isModelLoadPending &&
      (runtime.appCtx.isWindowHidden ||
        runtime.appCtx.isRenderSuppressed ||
        (runtime.appCtx.modelLoadTimeoutId === null &&
          (runtime.appCtx.modelLoadTimeoutId = window.setTimeout(() => {
            ;(runtime.appCtx.modelLoadTimeoutId = null),
              !(runtime.appCtx.isWindowHidden || runtime.appCtx.isRenderSuppressed) && runtime.finishModelLoad()
          }, 500))))
}

export function finishModelLoad(runtime: StudioAppRuntime) {
  ;(!runtime.appCtx.isModelLoadPending && !runtime.isAutoDiagramEmbed && !runtime.appCtx.isModelLoadDeferred) ||
    ((runtime.appCtx.isModelLoadPending = false),
    window.clearTimeout(runtime.appCtx.modelLoadTimeoutId),
    (runtime.appCtx.modelLoadTimeoutId = null),
    (runtime.appCtx.replacementFrameCount += 1),
    runtime.publishModelLoadState(),
    typeof runtime.appCtx.isRuntimeWarmupDone < 'u' &&
      runtime.isEmbeddedStage &&
      runtime.appCtx.sceneRootNode?.children?.length &&
      (runtime.appCtx.isRuntimeWarmupDone = true),
    runtime.requestSceneRebuild({
      force: true,
      precompile: true,
      externalModelsOnly: true,
    }),
    window.requestAnimationFrame(() => {
      ;(runtime.appCtx.replacementFrameCount -= 1), runtime.publishModelLoadState()
    }))
}

export function publishModelLoadState(
  runtime: StudioAppRuntime,
  modelLoaderEntry = runtime.externalModelRegistry.modelLoadState(),
) {
  const pending = modelLoaderEntry.pending ?? modelLoaderEntry.active + modelLoaderEntry.queued,
    isModelLoadSettled = runtime.appCtx.isModelLoadActive && pending === 0
  if (
    ((runtime.appCtx.isModelLoadActive = pending > 0),
    !pending &&
      runtime.appCtx.isModelLoadPending &&
      !runtime.isAutoDiagramEmbed &&
      !runtime.appCtx.isModelLoadDeferred &&
      !runtime.appCtx.isWindowHidden &&
      !runtime.appCtx.isRenderSuppressed &&
      (typeof runtime.appCtx.isExternalModelPending > 'u' || !runtime.appCtx.isExternalModelPending))
  ) {
    runtime.finishModelLoad()
    return
  }
  isModelLoadSettled &&
    !runtime.appCtx.isModelLoadPending &&
    runtime.appCtx.replacementFrameCount === 0 &&
    runtime.renderStudioFrame()
  const hn2 = pending > 0 || runtime.appCtx.isModelLoadPending || runtime.appCtx.replacementFrameCount > 0
  runtime.updateModelLoadIndicator(modelLoaderEntry, hn2),
    runtime.modelLoadingStatusElement &&
      (runtime.appCtx.orbitControls &&
        !runtime.appCtx.isInteractionLocked &&
        (runtime.appCtx.orbitControls.enabled = !hn2),
      (runtime.modelLoadingStatusElement.hidden = !hn2),
      runtime.modelLoadingStatusElement
        .querySelector('span:last-child')
        ?.replaceChildren(
          document.createTextNode(pending > 0 ? '正在加载模型… ' + pending : hn2 ? '正在完成模型…' : ''),
        ))

  runtime.appCtx.isMaterialSlotPanelPending &&
    runtime.appCtx.selectedItem?.kind === 'item' &&
    runtime.renderMaterialSlotPanel(runtime.getSelectedObject())
}

export function emitRuntimeDiagnostic(
  runtime: StudioAppRuntime,
  eventName: any,
  timingRecord: Record<string, any> = {},
) {
  try {
    if (!runtime.isEmbeddedStage && ['gpu-lost', 'gpu-restored'].includes(eventName)) {
      const isContextRestored = eventName === 'gpu-restored',
        contextCanvas = runtime.appCtx.threeRenderer?.domElement
      ;(window.HomeOSLog?.report as any)?.(
        isContextRestored ? 'success' : 'warning',
        '3D 图形',
        isContextRestored
          ? '3D 图形上下文已恢复，正在重建画面与阴影缓存'
          : '3D 图形上下文已丢失，预览暂时停止，等待浏览器恢复',
        {
          phase: 'studio-webgl-context',
          code: eventName,
        },
        '画布像素：' +
          (contextCanvas?.width || 0) +
          ' × ' +
          (contextCanvas?.height || 0) +
          '\n像素比：' +
          (runtime.appCtx.threeRenderer?.getPixelRatio?.() || 1),
      )
      return
    }
    if (
      !runtime.isEmbeddedStage ||
      window.parent === window ||
      ![
        'category-switch-start',
        'category-switch-applied',
        'source-adopt-start',
        'source-adopt-complete',
        'source-adopt-failed',
        'gpu-lost',
        'gpu-restored',
        'models-loading-resumed',
        'models-completion-resumed',
      ].includes(eventName)
    )
      return
    const options: Record<string, any> = {}
    for (const timingKey of [
      'sourceRevision',
      'floorCount',
      'durationMs',
      'pending',
      'active',
      'queued',
      'replacementFrames',
      'fromCategory',
      'toCategory',
      'mapPixels',
      'mapTextures',
    ])
      typeof timingRecord?.[timingKey] == 'number' &&
        Number.isFinite(timingRecord[timingKey]) &&
        (options[timingKey] = Math.max(0, Math.min(1000000000, timingRecord[timingKey])))
    if (
      (eventName.startsWith('gpu-') || eventName.startsWith('category-switch-')) &&
      typeof runtime.appCtx.threeRenderer < 'u'
    ) {
      if (eventName.startsWith('category-switch-')) {
        const rendererSnapshot = runtime.appCtx.threeRenderer?.info
        for (const [metricKey, metricValue] of Object.entries({
          geometries: rendererSnapshot?.memory?.geometries,
          textures: rendererSnapshot?.memory?.textures,
          programs: rendererSnapshot?.programs?.length,
        }))
          typeof metricValue == 'number' &&
            Number.isFinite(metricValue) &&
            (options[metricKey] = Math.max(0, Math.min(1000000000, metricValue)))
      }
      const runtimeStatsReport = {
        width: runtime.appCtx.threeRenderer?.domElement?.width,
        height: runtime.appCtx.threeRenderer?.domElement?.height,
        dpr: runtime.appCtx.threeRenderer?.getPixelRatio?.(),
      }
      for (const [statKey, statValue] of Object.entries(runtimeStatsReport))
        typeof statValue == 'number' &&
          Number.isFinite(statValue) &&
          (options[statKey] = Math.max(0, Math.min(1000000000, statValue)))
    }
    typeof timingRecord?.replacementPending == 'boolean' &&
      (options.replacementPending = timingRecord.replacementPending),
      window.parent.postMessage(
        {
          channel: 'hb-i3d-v1',
          type: 'runtime-diagnostic',
          code: eventName,
          counts: options,
        },
        window.location.origin,
      )
  } catch {
    /* Worker / 广播通道不可用（环境不支持或扩展未加载）：功能降级为单通道，不影响主流程 */
  }
}

export function updateModelLoadIndicator(
  runtime: StudioAppRuntime,
  loadStateSnapshot: any,
  isPresentationPending: any,
) {
  try {
    const pending2 = runtime.modelPresentationState.pending
    if (
      ((runtime.modelPresentationState.pending = isPresentationPending),
      !runtime.modelPresentationState.presented || pending2 || !isPresentationPending)
    )
      return
    const pending3 = loadStateSnapshot.pending ?? loadStateSnapshot.active + loadStateSnapshot.queued
    runtime.emitRuntimeDiagnostic(pending3 > 0 ? 'models-loading-resumed' : 'models-completion-resumed', {
      pending: pending3,
      active: loadStateSnapshot.active,
      queued: loadStateSnapshot.queued,
      replacementPending: runtime.appCtx.isModelLoadPending,
      replacementFrames: runtime.appCtx.replacementFrameCount,
    })
  } catch {
    /* 诊断上报 best-effort：加载状态快照上报失败不应中断加载流程 */
  }
}

/** 某物件的模型加载选项 = 当前主题调色板 + 该物件自己的材质档位 + 该物件自己的覆盖色+ 该物件自己的逐槽表面参数。 */
export function materialLoadOptionsForItem(runtime: StudioAppRuntime, itemRecordRef: any) {
  const itemModelType = runtime.externalModelRegistry.modelTypeForItem(itemRecordRef),
    itemMaterialStyle = normalizeMaterialStyle(itemModelType, itemRecordRef?.materialStyle),
    itemMaterialOverrides =
      itemRecordRef?.materialOverrides &&
      typeof itemRecordRef.materialOverrides == 'object' &&
      !Array.isArray(itemRecordRef.materialOverrides)
        ? itemRecordRef.materialOverrides
        : null,
    itemMaterialSurfaceOverrides = normalizeMaterialSurfaceOverrides(itemRecordRef?.materialSurfaceOverrides),
    materialOverrideEntries = itemMaterialOverrides ? Object.keys(itemMaterialOverrides) : [],
    materialSurfaceOverrideEntries = Object.keys(itemMaterialSurfaceOverrides)
  const itemLoadOptions = {
    ...runtime.backgroundSettings(),
    ...materialStylePaletteColors(itemModelType, itemMaterialStyle),
    /**
     * 墙体**实际**的透过率（用户可能拖过滑条 / 单面墙有自定义 opacity）。
     * `backgroundSettings().wallOpacity` 只是主题默认值，配墙的柱体只能读这里的实时值，
     * 否则调完墙体透明度，柱子还停在 0.36。
     */
    wallOpacity: runtime.appCtx.wallOpacityValue ?? runtime.appCtx.studioState.settings.wallOpacity,
  }
  itemMaterialStyle !== MATERIAL_STYLE_AUTO && (itemLoadOptions.materialStyle = itemMaterialStyle)
  materialOverrideEntries.length && (itemLoadOptions.materialOverrides = itemMaterialOverrides)
  materialSurfaceOverrideEntries.length && (itemLoadOptions.materialSurfaceOverrides = itemMaterialSurfaceOverrides)
  return itemLoadOptions
}

export function applyItemOptimization(
  runtime: StudioAppRuntime,
  modelSource: any,
  itemRecordRef: any,
  modelLoadOptions = runtime.materialLoadOptionsForItem(itemRecordRef),
) {
  const addExternalItemModel = runtime.externalModelRegistry.addExternalItemModel(
    modelSource,
    itemRecordRef,
    modelLoadOptions,
    {
      selected: runtime.createSelectionRef('item', itemRecordRef.id),
      staticMaterialKey: buildStaticMaterialKey,
      staticVertexTint: runtime.isEmbeddedStage,
    },
  )
  return (runtime.publishModelLoadState(), addExternalItemModel)
}

export function getActiveFloor(runtime: StudioAppRuntime) {
  const oe2 = runtime.appCtx.pendingRuntimeSettings?.selectedFloorId || runtime.appCtx.activeFloorId
  return (
    runtime.appCtx.studioProject?.floors.find((floorMatch: any) => floorMatch.id === oe2) ||
    runtime.appCtx.studioProject?.floors[0] ||
    null
  )
}

export function captureStudioSnapshot(runtime: StudioAppRuntime) {
  return structuredClone(
    runtime.appCtx.studioProject || normalizeStudioDocument(runtime.appCtx.studioState, runtime.studioDocumentDeps()),
  )
}

export function getLocalSaveRevision(runtime: StudioAppRuntime) {
  const runtimeSnapshot = runtime.captureStudioSnapshot()
  if (!runtime.appCtx.pendingRuntimeSettings) return runtimeSnapshot
  runtimeSnapshot.previewFloorMode = runtime.appCtx.pendingRuntimeSettings.floorMode
  for (const snapshotFloor of runtimeSnapshot.floors || []) {
    const floorCameraSetting = runtime.appCtx.pendingRuntimeSettings.floorCameraSettings.get(snapshotFloor.id)
    floorCameraSetting &&
      ((snapshotFloor.scene.settings.cameraMode = floorCameraSetting.mode),
      (snapshotFloor.scene.settings.cameraView = floorCameraSetting.view),
      (snapshotFloor.scene.settings.cameraTopRotation = floorCameraSetting.topRotation),
      (snapshotFloor.scene.settings.cameraFocalLength = floorCameraSetting.focalLength))
  }
  return (
    (runtimeSnapshot.combinedCameraSettings = {
      ...runtime.appCtx.pendingRuntimeSettings.combinedCameraSettings,
    }),
    runtimeSnapshot
  )
}
