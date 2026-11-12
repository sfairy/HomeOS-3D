import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import { precompileShaderPrograms } from '../../scene/studio-shader-precompile'
import { lightSignatureOf } from '../ui/light-signature'

export function planLightPrecompileBatches(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.sceneRootNode) return []
  const visibleLights: any = [],
    lightsByGroupId = new Map()
  runtime.appCtx.sceneRootNode.traverse((sceneLight: any) => {
    if (
      !sceneLight.isLight ||
      !sceneLight.userData?.lightItemId ||
      (!runtime.isEmbeddedStage && finite2(sceneLight.userData.lightOnIntensity, 0) <= 0)
    )
      return
    sceneLight.visible !== false && visibleLights.push(sceneLight)
    const planLightPrecompileBatchesLightGroupId = String(sceneLight.userData.lightGroupId || '')
    planLightPrecompileBatchesLightGroupId &&
      (lightsByGroupId.has(planLightPrecompileBatchesLightGroupId) ||
        lightsByGroupId.set(planLightPrecompileBatchesLightGroupId, []),
      lightsByGroupId.get(planLightPrecompileBatchesLightGroupId).push(sceneLight))
  })
  const flat = [...lightsByGroupId.values()].flat(),
    processedSignatureSet = new Set(),
    lightBatches: any = [],
    lg2 = lightSignatureOf(visibleLights),
    lightCacheKey = runtime.appCtx.sceneRootNode.uuid + ':' + runtime.appCtx.externalPrecompilePassCount
  runtime.appCtx.currentPrecompileSignature !== lightCacheKey &&
    ((runtime.appCtx.currentPrecompileSignature = lightCacheKey), runtime.precompiledMaterialKeySet.clear())
  const addLightBatch = (planLightPrecompileBatchesLightEntries: any, lightChanges: any, isForcedBatch = false) => {
    const lg3 = lightSignatureOf(planLightPrecompileBatchesLightEntries)
    processedSignatureSet.has(lg3) ||
      (processedSignatureSet.add(lg3),
      !runtime.precompiledMaterialKeySet.has(lg3) &&
        ((!isForcedBatch &&
          lg3 !== lg2 &&
          runtime.precompiledMaterialKeySet.size + lightBatches.length >= runtime.maxPrecompileBatchSize) ||
          lightBatches.push({
            signature: lg3,
            lights: lightChanges
              .filter((batchLightEntry: any) => batchLightEntry.visible)
              .map((lightChangeRecord: any) => lightChangeRecord.light),
            changes: lightChanges,
          })))
  }
  addLightBatch(visibleLights, [], true),
    addLightBatch(
      [],
      flat.map((groupLightEntry) => ({
        light: groupLightEntry,
        visible: false,
      })),
      true,
    )
  for (const groupLights of lightsByGroupId.values()) {
    const hiddenLights = groupLights.filter((hiddenLightEntry: any) => hiddenLightEntry.visible === false)
    hiddenLights.length &&
      addLightBatch(
        [...visibleLights, ...hiddenLights],
        hiddenLights.map((revealLightChange: any) => ({
          light: revealLightChange,
          visible: true,
        })),
      )
    const visibleGroupLights = groupLights.filter((visibleGroupLight: any) => visibleGroupLight.visible !== false)
    visibleGroupLights.length &&
      addLightBatch(
        visibleLights.filter((retainedLight: any) => !visibleGroupLights.includes(retainedLight)),
        visibleGroupLights.map((hideLightChange: any) => ({
          light: hideLightChange,
          visible: false,
        })),
      )
  }
  return (
    runtime.isEmbeddedStage &&
      addLightBatch(
        flat,
        flat.map((flatLightEntry) => ({
          light: flatLightEntry,
          visible: true,
        })),
        true,
      ),
    lightBatches
  )
}

export function shouldSuspendSceneWork(runtime: StudioAppRuntime) {
  return (
    runtime.appCtx.isPageHidden ||
    runtime.appCtx.isDisposed ||
    document.hidden ||
    (runtime.isEmbeddedStage && (!runtime.appCtx.isHighDetailQuality || runtime.renderCacheWriter?.closed))
  )
}

export function shouldDeferSceneWork(runtime: StudioAppRuntime) {
  return (
    runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isRenderSuppressed ||
    runtime.appCtx.isWindowHidden ||
    runtime.appCtx.isCapturingLights ||
    runtime.appCtx.isRendererUnavailable ||
    (runtime.isEmbeddedStage && (runtime.appCtx.isPrewarming || runtime.appCtx.prewarmState)) ||
    (!runtime.isEmbeddedStage && runtime.areLightsEnabled())
  )
}

export function scheduleLightPrecompile(runtime: StudioAppRuntime, delayMs = 360) {
  runtime.isEmbedStageMode ||
    runtime.isAutoDiagramEmbed ||
    runtime.appCtx.isPageHidden ||
    ((runtime.appCtx.isEnvironmentLoading = true),
    window.clearTimeout(runtime.appCtx.precompileDebounceId),
    !(runtime.appCtx.isLightPrecompileRunning || runtime.shouldSuspendSceneWork()) &&
      (runtime.appCtx.precompileDebounceId = window.setTimeout(async () => {
        if (((runtime.appCtx.precompileDebounceId = null), runtime.shouldSuspendSceneWork())) return
        const modelLoadState4 = runtime.externalModelRegistry.modelLoadState()
        if (
          !runtime.appCtx.threeRenderer ||
          !runtime.appCtx.threeScene ||
          !runtime.appCtx.threeCamera ||
          !runtime.appCtx.sceneRootNode ||
          runtime.shouldDeferSceneWork() ||
          runtime.appCtx.isExternalModelLoadDeferred ||
          runtime.appCtx.modelLoadDebounceId ||
          (modelLoadState4.pending ?? modelLoadState4.active + modelLoadState4.queued) > 0
        ) {
          runtime.scheduleLightPrecompile(240)
          return
        }
        const qv3 = runtime.planLightPrecompileBatches(),
          lightSceneRoot = runtime.appCtx.sceneRootNode,
          ue2 = runtime.appCtx.threeScene,
          activeRenderer = runtime.appCtx.threeRenderer
        if (!qv3.length) {
          ;(runtime.appCtx.isEnvironmentLoading = false),
            (activeRenderer.domElement.dataset.lightPrecompileState = 'ready'),
            runtime.updateExternalModelDataset()
          return
        }
        ;(runtime.appCtx.isLightPrecompileRunning = true),
          (runtime.appCtx.isEnvironmentLoading = false),
          (activeRenderer.domElement.dataset.lightPrecompileState = 'working'),
          (activeRenderer.domElement.dataset.lightPrecompilePlanCount = String(qv3.length))
        const shouldAbortPrecompile = () =>
          runtime.appCtx.sceneRootNode === lightSceneRoot &&
          runtime.appCtx.threeScene === ue2 &&
          runtime.appCtx.threeRenderer === activeRenderer &&
          !runtime.appCtx.isEnvironmentLoading &&
          !runtime.shouldSuspendSceneWork() &&
          !runtime.shouldDeferSceneWork()
        let isPrecompileComplete = true
        try {
          for (const pendingLightBatch of qv3) {
            if ((await runtime.waitForIdleFrame(), !shouldAbortPrecompile())) {
              ;(isPrecompileComplete = false), (runtime.appCtx.isEnvironmentLoading = true)
              break
            }
            const lightChangeRecords = pendingLightBatch.changes.map(
              ({ light: pendingLightEntry, visible: nextVisibleState }: any) => ({
                light: pendingLightEntry,
                nextVisible: nextVisibleState,
                visible: pendingLightEntry.visible,
                intensity: pendingLightEntry.intensity,
              }),
            )
            let compilePromise: any = null
            try {
              for (const lightChangeEntry of lightChangeRecords)
                (lightChangeEntry.light.intensity = 0), (lightChangeEntry.light.visible = lightChangeEntry.nextVisible)
              runtime.setupSceneShadows(lightSceneRoot, {
                rebuildAtlas: false,
              }),
                (compilePromise = precompileShaderPrograms(
                  activeRenderer,
                  ue2,
                  runtime.appCtx.threeCamera,
                  shouldAbortPrecompile,
                ))
            } finally {
              for (const restoreLightEntry of lightChangeRecords)
                (restoreLightEntry.light.visible = restoreLightEntry.visible),
                  (restoreLightEntry.light.intensity = restoreLightEntry.intensity)
              runtime.setupSceneShadows(lightSceneRoot, {
                rebuildAtlas: false,
              })
            }
            if (!(await compilePromise) || !shouldAbortPrecompile()) {
              ;(isPrecompileComplete = false),
                (activeRenderer.domElement.dataset.lightPrecompileDeferred = 'true'),
                (runtime.appCtx.isEnvironmentLoading ||= !shouldAbortPrecompile())
              break
            }
            ;(runtime.appCtx.lightPrecompilePassCount += 1),
              runtime.precompiledMaterialKeySet.add(pendingLightBatch.signature)
          }
          isPrecompileComplete
            ? (delete activeRenderer.domElement.dataset.lightPrecompileDeferred,
              (activeRenderer.domElement.dataset.lightPrecompileState = 'ready'))
            : (activeRenderer.domElement.dataset.lightPrecompileState = 'deferred')
        } catch {
          activeRenderer.domElement.dataset.lightPrecompileState = 'fallback'
        } finally {
          ;(runtime.appCtx.isLightPrecompileRunning = false),
            runtime.updateExternalModelDataset(),
            runtime.appCtx.isEnvironmentLoading && runtime.scheduleLightPrecompile(240)
        }
      }, delayMs)))
}

export function scheduleExternalPrecompile(runtime: StudioAppRuntime, initialDelayMs = 0) {
  runtime.isEmbedStageMode ||
    ((runtime.appCtx.isRecoveryRender = true),
    window.clearTimeout(runtime.appCtx.precompileTimeoutId),
    !(runtime.appCtx.isRendererUnavailable || runtime.appCtx.isDisposed) &&
      (runtime.appCtx.precompileTimeoutId = window.setTimeout(async () => {
        if (
          ((runtime.appCtx.precompileTimeoutId = null),
          !runtime.appCtx.threeRenderer ||
            !runtime.appCtx.threeScene ||
            !runtime.appCtx.threeCamera ||
            !runtime.appCtx.sceneRootNode ||
            runtime.appCtx.pendingRuntimeSettings ||
            document.hidden ||
            runtime.appCtx.isRenderSuppressed ||
            runtime.appCtx.isWindowHidden ||
            runtime.appCtx.isCapturingLights)
        ) {
          runtime.scheduleExternalPrecompile(240)
          return
        }
        const sg2 = runtime.collectSharedMaterials()
        if (!sg2.length) {
          ;(runtime.appCtx.isRecoveryRender = false),
            runtime.updateExternalModelDataset(),
            runtime.scheduleLightPrecompile()
          return
        }
        ;(runtime.appCtx.isRendererUnavailable = true),
          (runtime.appCtx.isRecoveryRender = false),
          (runtime.appCtx.threeRenderer.domElement.dataset.externalPrecompileState = 'working')
        try {
          runtime.setupSceneShadows(runtime.appCtx.sceneRootNode, {
            rebuildAtlas: false,
          }),
            runtime.appCtx.threeRenderer.compile(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
            sg2.forEach((materialToCache: any) => runtime.disposedMaterialSet.add(materialToCache as object)),
            (runtime.appCtx.externalPrecompilePassCount += 1),
            (runtime.appCtx.threeRenderer.domElement.dataset.externalPrecompileState = 'ready')
        } catch (precompileError) {
          // 静默回退会让「模型发黑/首帧卡顿」无从排查：上游这里会向 HABridge 报一条 warning。
          ;(runtime.appCtx.threeRenderer.domElement.dataset.externalPrecompileState = 'fallback'),
            console.warn('外部模型预编译失败，已回退到逐帧编译。', precompileError)
        } finally {
          ;(runtime.appCtx.isRendererUnavailable = false),
            runtime.updateExternalModelDataset(),
            runtime.appCtx.isRecoveryRender
              ? runtime.scheduleExternalPrecompile(120)
              : runtime.scheduleLightPrecompile()
        }
      }, initialDelayMs)))
}
