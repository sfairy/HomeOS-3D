import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { idleRenderPixelRatio, interactionResourcePolicy } from '../studio-resource-policy'
import {
  adaptiveDeviceLightBudget as adaptiveDeviceLightBudget2,
  adaptiveLightRenderCost as adaptiveLightRenderCost2,
  assessAdaptiveRenderFrames as assessAdaptiveRenderFrames2,
  clamp as clamp2,
} from '../plan/geometry'
import { inspectShadowReceiverTrial as inspectShadowReceiverTrial2 } from '../studio-shadow-receiver-trial'
import { finite as finite2 } from '../loaders/studio-normalization'

export function assessRenderBudget(runtime: StudioAppRuntime) {
  const bf2 = runtime.collectActiveLightEntries(),
    rendererCanvas = runtime.appCtx.threeRenderer?.domElement,
    previewPixelCount =
      rendererCanvas?.width && rendererCanvas?.height
        ? rendererCanvas.width * rendererCanvas.height
        : Math.max(window.innerWidth * window.innerHeight * 0.32, 120000)
  return {
    count: bf2.length,
    cost: adaptiveLightRenderCost2(
      bf2.map((lightEntry: any) => ({
        type: lightEntry.type,
        angle: lightEntry.lightAngle,
        brightness: lightEntry.lightBrightness,
        enabled: true,
      })),
    ),
    budget: adaptiveDeviceLightBudget2({
      hardwareConcurrency: navigator.hardwareConcurrency,
      deviceMemory: navigator.deviceMemory,
      previewPixels: previewPixelCount,
    }),
  }
}

export function canRenderScene(runtime: StudioAppRuntime) {
  if (runtime.isEmbeddedStage)
    return (
      (runtime.appCtx.isAdaptiveRenderActive = true),
      (runtime.appCtx.hasAdaptiveRenderStarted = true),
      {
        count: 0,
        cost: 0,
        budget: 0,
      }
    )
  const zl2 = runtime.assessRenderBudget(),
    Yn2 = runtime.appCtx.isAdaptiveRenderActive
  return (
    runtime.appCtx.hasAdaptiveRenderStarted
      ? runtime.appCtx.isAdaptiveRenderActive &&
        zl2.cost < Math.min(zl2.budget * 0.68, Math.max(runtime.appCtx.adaptiveRenderCostBudget * 0.55, 1)) &&
        ((runtime.appCtx.isAdaptiveRenderActive = false),
        (runtime.appCtx.adaptiveRenderCostBudget = 0),
        (runtime.appCtx.slowFrameStreak = 0))
      : (runtime.appCtx.hasAdaptiveRenderStarted = true),
    Yn2 &&
      !runtime.appCtx.isAdaptiveRenderActive &&
      ((runtime.appCtx.modelRevisionCounter += 1),
      (runtime.appCtx.isCacheReady = false),
      (runtime.appCtx.isFrameDirty = false),
      runtime.setFadeOverlay(false)),
    zl2
  )
}

export function applyAdaptiveQuality(runtime: StudioAppRuntime, frameAssessment: any) {
  runtime.appCtx.isAdaptiveRenderActive ||
    !frameAssessment?.sufficient ||
    ((runtime.appCtx.isAdaptiveRenderActive = true),
    (runtime.appCtx.hasAdaptiveRenderStarted = true),
    (runtime.appCtx.adaptiveRenderCostBudget = runtime.assessRenderBudget().cost),
    (runtime.appCtx.modelRevisionCounter += 1),
    (runtime.appCtx.isFrameDirty = true),
    runtime.requestStudioRender())
}

export function resetFrameSamples(runtime: StudioAppRuntime) {
  if (runtime.appCtx.isAdaptiveRenderActive) return
  const renderFrameAssessment = assessAdaptiveRenderFrames2(runtime.appCtx.frameDurationSamples)
  if (!renderFrameAssessment.sufficient) return
  const zl3 = runtime.assessRenderBudget(),
    renderCostRatio = zl3.cost / Math.max(zl3.budget, 1),
    qualityStepLimit = renderCostRatio >= 1.8 ? 3 : renderCostRatio >= 1 ? 4 : 5
  renderFrameAssessment.severe
    ? (runtime.appCtx.slowFrameStreak = qualityStepLimit)
    : renderFrameAssessment.slow
      ? (runtime.appCtx.slowFrameStreak += 1)
      : renderFrameAssessment.smooth && (runtime.appCtx.slowFrameStreak = 0),
    runtime.appCtx.slowFrameStreak >= qualityStepLimit && runtime.applyAdaptiveQuality(renderFrameAssessment)
}

export function recordFrameTime(runtime: StudioAppRuntime, frameTimestamp = performance.now()) {
  if (
    (!runtime.appCtx.isRenderSuppressed && !(runtime.isEmbeddedStage && runtime.appCtx.isPrewarming)) ||
    runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isAdaptiveRenderActive ||
    !runtime.collectActiveLightEntries().length
  ) {
    runtime.appCtx.samplingWindowStartMs = 0
    return
  }
  if (runtime.appCtx.samplingWindowStartMs > 0) {
    const frameDeltaMs = frameTimestamp - runtime.appCtx.samplingWindowStartMs
    frameDeltaMs >= 8 &&
      (frameDeltaMs <= 120 || (runtime.isEmbeddedStage && frameDeltaMs <= 2000)) &&
      runtime.appCtx.frameDurationSamples.push(Math.min(frameDeltaMs, 120))
  }
  ;(runtime.appCtx.samplingWindowStartMs = frameTimestamp),
    !(runtime.appCtx.frameDurationSamples.length < 24) &&
      (runtime.resetFrameSamples(), runtime.appCtx.frameDurationSamples.splice(0, 12))
}

export function getPreviewSyncMode(runtime: StudioAppRuntime) {
  return runtime.appCtx.studioState.settings?.livePreviewEnabled !== false
}

export function refreshPreviewSync(runtime: StudioAppRuntime) {
  const kl2 = runtime.getPreviewSyncMode()
  for (const previewSyncButton of runtime.previewSyncControls) {
    const isPreviewSyncActive = previewSyncButton.dataset.previewSync === (kl2 ? 'live' : 'manual')
    previewSyncButton.classList.toggle('active', isPreviewSyncActive),
      previewSyncButton.setAttribute('aria-pressed', String(isPreviewSyncActive))
  }
  ;(runtime.refreshPreviewButton.hidden = kl2),
    (runtime.refreshPreviewButton.disabled = !runtime.appCtx.isSceneDirty),
    runtime.refreshPreviewButton.classList.toggle('is-dirty', runtime.appCtx.isSceneDirty),
    (runtime.refreshPreviewButton.textContent = runtime.appCtx.isSceneDirty ? '待更新 · 更新' : '已更新')
}

export function requestStudioRender(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.orbitControls) return
  // 有新内容要画：静态帧缓存作废，下一次整帧重新捕获。
  runtime.effectCache?.invalidate()
  const ht2 = runtime.areLightsEnabled(),
    at6 = runtime.isEmbeddedStage && runtime.appCtx.prewarmState && !runtime.appCtx.isCapturingLights
  runtime.appCtx.lightPrecompileController?.setEnabled(runtime.isEmbeddedStage || !ht2 || !!at6),
    (runtime.appCtx.orbitControls.enableRotate = runtime.getCameraView() !== 'top'),
    /**
     * 预览状态徽标：**每次重绘都强制隐藏并清空**，与上游 0.8.9 的 `qt()` 一致
     * （那边同样是 `hidden = true; title = ''; textContent = ''`）。
     *
     * 曾经这里带一个 `previewIssueCount() === 0` 条件，为了「别把刚写进去的诊断抹掉」；
     * 但诊断已经改走 `console.error` + `window.__studioPreviewIssues` +
     * `<html data-preview-issues>`（见 `preview-diagnostics.ts`），这个 span 回到
     * 上游的预留位语义 —— 不再有内容需要保护，也就没有理由让它在有异常时常显。
     */
    runtime.previewQualityStatusElement &&
      ((runtime.previewQualityStatusElement.hidden = true),
      (runtime.previewQualityStatusElement.title = ''),
      (runtime.previewQualityStatusElement.textContent = '')),
    runtime.refreshLightPreviewButton &&
      ((runtime.refreshLightPreviewButton.hidden = true), (runtime.refreshLightPreviewButton.disabled = true))
}

export function computeRenderPixelRatio(runtime: StudioAppRuntime, isMotionQuality = false) {
  // 参数名历史遗留：true = 运动/交互中的质量档，false = 静置高清档。
  const idleRatio = idleRenderPixelRatio(runtime.isEmbeddedStage ? runtime.appCtx.basePixelRatio : 1)
  if (
    runtime.isEmbeddedStage &&
    isMotionQuality &&
    runtime.appCtx.adaptivePixelRatio !== null &&
    (!runtime.appCtx.isPrewarming || runtime.appCtx.isRenderSuppressed)
  )
    return Math.max(idleRatio * runtime.appCtx.adaptivePixelRatio, Math.min(idleRatio, 1))
  if (runtime.isEmbedStageMode) {
    return isMotionQuality ? Math.min(idleRatio, interactionResourcePolicy.motion.maxPixelRatio) : idleRatio
  }
  const Kt2 = runtime.isEmbeddedStage && runtime.appCtx.isPrewarming
  let ratio = idleRatio
  // 运动期不再把 DPR 硬砍到 1；仅在超预算时温和下调，地板不低于 0.85×idle。
  if (runtime.isEmbeddedStage && (isMotionQuality || Kt2)) {
    const { cost: zl4, budget: zl5 } = runtime.assessRenderBudget()
    zl4 > zl5 && (ratio = Math.min(ratio, clamp2(Math.sqrt(zl5 / zl4) * idleRatio, idleRatio * 0.85, idleRatio)))
  }
  return ratio
}

export function updateRenderStatsHud(runtime: StudioAppRuntime) {
  if (!runtime.isRenderStatsTest || !runtime.appCtx.threeRenderer) return
  runtime.updateExternalModelDataset()
  const domElement = runtime.appCtx.threeRenderer.domElement,
    renderStatsPayload = {
      calls: Number(domElement.dataset.renderCalls || 0),
      triangles: Number(domElement.dataset.renderTriangles || 0),
      instanceSaved: Number(domElement.dataset.instanceDrawCallsSaved || 0),
      staticItemSaved: Number(domElement.dataset.staticItemDrawCallsSaved || 0),
    }
  let homeosRenderStatsTestOutputElement = document.querySelector('#homeos-render-stats-test-output')
  homeosRenderStatsTestOutputElement ||
    ((homeosRenderStatsTestOutputElement = document.createElement('output')),
    (homeosRenderStatsTestOutputElement.id = 'homeos-render-stats-test-output'),
    document.body.append(homeosRenderStatsTestOutputElement)),
    (homeosRenderStatsTestOutputElement.textContent =
      '渲染统计：' +
      renderStatsPayload.calls +
      ' 次调用，' +
      renderStatsPayload.triangles +
      ' 个三角面；重复实例节省 ' +
      renderStatsPayload.instanceSaved +
      ' 次，跨模型材质合批节省 ' +
      renderStatsPayload.staticItemSaved +
      ' 次。'),
    (document.documentElement.dataset.renderStatsTest = JSON.stringify(renderStatsPayload))
}

export function pushBoundedSample(runtime: StudioAppRuntime, sampleList: any, sampleValue: any) {
  Number.isFinite(sampleValue) &&
    (sampleList.push(sampleValue),
    sampleList.length > runtime.maxFrameSampleCount &&
      sampleList.splice(0, sampleList.length - runtime.maxFrameSampleCount))
}

export function computeAverage(_runtime: StudioAppRuntime, numberList: any) {
  return numberList.length
    ? numberList.reduce((sumAccumulator: any, numberValue: any) => sumAccumulator + numberValue, 0) / numberList.length
    : null
}

export function computePercentile(_runtime: StudioAppRuntime, sampleSeries: any, percentileRatio: any) {
  if (!sampleSeries.length) return null
  const sort = [...sampleSeries].sort((leftSample, rightSample) => leftSample - rightSample),
    percentileIndex = Math.min(sort.length - 1, Math.max(0, Math.ceil(sort.length * percentileRatio) - 1))
  return sort[percentileIndex]
}

export function roundToDigits(_runtime: StudioAppRuntime, numericValue: any, digitCount = 1) {
  return Number.isFinite(numericValue) ? Number(numericValue.toFixed(digitCount)) : null
}

export function ensureDiagnosticsHud(runtime: StudioAppRuntime) {
  if (!runtime.isPerformanceDiagnostics || !runtime.appCtx.threeRenderer || runtime.diagnosticsState.hud) return
  const diagnosticsOutputElement = document.createElement('output')
  ;(diagnosticsOutputElement.id = 'performance-diagnostics'),
    (diagnosticsOutputElement.className = 'performance-diagnostics'),
    diagnosticsOutputElement.setAttribute('aria-label', '3D 性能诊断'),
    diagnosticsOutputElement.setAttribute('aria-live', 'off'),
    (diagnosticsOutputElement.textContent = '性能诊断初始化中…'),
    runtime.selectElement('#preview-3d')?.append(diagnosticsOutputElement),
    (runtime.diagnosticsState.hud = diagnosticsOutputElement),
    (runtime.diagnosticsState.gpuContext = runtime.appCtx.threeRenderer.getContext?.() || null),
    (runtime.diagnosticsState.gpuExtension =
      runtime.diagnosticsState.gpuContext?.getExtension?.('EXT_disjoint_timer_query_webgl2') || null),
    (runtime.diagnosticsState.gpuStatus = runtime.diagnosticsState.gpuExtension ? '等待样本' : '不可用')
}

export function flushGpuQueries(runtime: StudioAppRuntime) {
  if (!runtime.isPerformanceDiagnostics) return
  const xt4 = runtime.diagnosticsState,
    gpuContext3 = xt4.gpuContext,
    gpuExtension3 = xt4.gpuExtension
  if (!gpuContext3 || !gpuExtension3 || !xt4.gpuQueriesPending.length) return
  if (gpuContext3.getParameter(gpuExtension3.GPU_DISJOINT_EXT)) {
    for (const gpuQueryHandle of xt4.gpuQueriesPending.splice(0)) gpuContext3.deleteQuery(gpuQueryHandle)
    ;(xt4.gpuRenderTimes.length = 0), (xt4.gpuStatus = '采样失效')
    return
  }
  const pendingGpuQueryHandles: any = []
  for (const pendingGpuQuery of xt4.gpuQueriesPending) {
    if (!gpuContext3.getQueryParameter(pendingGpuQuery, gpuContext3.QUERY_RESULT_AVAILABLE)) {
      pendingGpuQueryHandles.push(pendingGpuQuery)
      continue
    }
    const queryParameter = gpuContext3.getQueryParameter(pendingGpuQuery, gpuContext3.QUERY_RESULT)
    runtime.pushBoundedSample(xt4.gpuRenderTimes, queryParameter / 1000000),
      gpuContext3.deleteQuery(pendingGpuQuery),
      (xt4.gpuStatus = '可用')
  }
  xt4.gpuQueriesPending = pendingGpuQueryHandles
}

export function measureFloorSwitchPhase(runtime: StudioAppRuntime, phaseName: any, phaseTask: any) {
  const floorSwitch = runtime.isPerformanceDiagnostics && runtime.diagnosticsState.floorSwitch
  if (!floorSwitch || performance.now() > floorSwitch.until) return phaseTask()
  const now = performance.now()
  try {
    return phaseTask()
  } finally {
    const phaseElapsedMs = performance.now() - now
    ;(floorSwitch.phases ||= {}), (floorSwitch.pendingPhases ||= {})
    const phaseStats = (floorSwitch.phases[phaseName] ||= {
      calls: 0,
      totalMs: 0,
      maxMs: 0,
    })
    phaseStats.calls++,
      (phaseStats.totalMs += phaseElapsedMs),
      (phaseStats.maxMs = Math.max(phaseStats.maxMs, phaseElapsedMs)),
      (floorSwitch.pendingPhases[phaseName] = (floorSwitch.pendingPhases[phaseName] || 0) + phaseElapsedMs)
  }
}

export function recordFloorSwitchTick(runtime: StudioAppRuntime, tickTimestamp: any, shouldTrackLongFrame = true) {
  const floorSwitch2 = runtime.isPerformanceDiagnostics && runtime.diagnosticsState.floorSwitch
  if (!(!floorSwitch2 || performance.now() > floorSwitch2.until)) {
    if (!shouldTrackLongFrame) {
      floorSwitch2.lastTick = null
      return
    }
    if (floorSwitch2.lastTick != null) {
      const tickDeltaMs = tickTimestamp - floorSwitch2.lastTick
      ;(floorSwitch2.maxTickMs = Math.max(floorSwitch2.maxTickMs || 0, tickDeltaMs)),
        tickDeltaMs > 50 && (floorSwitch2.tickLongFrames = (floorSwitch2.tickLongFrames || 0) + 1)
    }
    ;(floorSwitch2.lastTick = tickTimestamp),
      (floorSwitch2.checksSinceRender = (floorSwitch2.checksSinceRender || 0) + 1)
  }
}

export function recordRenderTiming(
  runtime: StudioAppRuntime,
  renderTimestamp: any,
  cpuRenderMs: any,
  motionActive: any,
) {
  if (!runtime.isPerformanceDiagnostics) return
  const xt5 = runtime.diagnosticsState,
    floorSwitch3 = xt5.floorSwitch,
    renderNowMs = performance.now()
  if (floorSwitch3 && renderNowMs <= floorSwitch3.until) {
    const renderGapMs = renderNowMs - floorSwitch3.last
    ;(floorSwitch3.last = renderNowMs),
      floorSwitch3.frames++,
      renderGapMs > floorSwitch3.maxMs &&
        (floorSwitch3.worstFrame = {
          renderGapMs: renderGapMs,
          cpuRenderMs: cpuRenderMs,
          checksSinceRender: floorSwitch3.checksSinceRender,
          phases: {
            ...floorSwitch3.pendingPhases,
          },
          programs: runtime.appCtx.threeRenderer.info.programs?.length,
          geometries: runtime.appCtx.threeRenderer.info.memory.geometries,
          contact: runtime.appCtx.contactShadowController
            ? {
                ...runtime.appCtx.contactShadowController.stats,
              }
            : null,
        }),
      (floorSwitch3.pendingPhases = {}),
      (floorSwitch3.checksSinceRender = 0),
      (floorSwitch3.maxMs = Math.max(floorSwitch3.maxMs, renderGapMs)),
      renderGapMs > 50 && floorSwitch3.longFrames++,
      (floorSwitch3.cpuMs += cpuRenderMs),
      (floorSwitch3.maxRenderCpuMs = Math.max(floorSwitch3.maxRenderCpuMs || 0, cpuRenderMs)),
      cpuRenderMs > 50 && (floorSwitch3.slowRenderCount = (floorSwitch3.slowRenderCount || 0) + 1)
  }
  if (motionActive) {
    if ((runtime.pushBoundedSample(xt5.cpuRenderTimes, cpuRenderMs), xt5.lastMotionRenderAt > 0)) {
      const frameIntervalMs = renderTimestamp - xt5.lastMotionRenderAt
      frameIntervalMs >= 2 && frameIntervalMs <= 250 && runtime.pushBoundedSample(xt5.frameIntervals, frameIntervalMs)
    }
    xt5.lastMotionRenderAt = renderTimestamp
  } else xt5.lastMotionRenderAt = 0
}

export function snapshotRenderStats(runtime: StudioAppRuntime) {
  const materialSet = new Set(),
    meshTypeStats: Record<string, { meshes: number; triangles: number }> = {},
    itemTypeByModelId = new Map(
      (runtime.appCtx.studioProject?.floors || []).flatMap((sceneFloor: any) =>
        (sceneFloor.scene?.items || []).map((snapshotRenderStatsSceneItem: any) => [
          snapshotRenderStatsSceneItem.id,
          snapshotRenderStatsSceneItem.type,
        ]),
      ),
    ),
    furnitureStatsByKind = {
      before: 0,
      after: 0,
      triangles: 0,
    }
  let meshCount = 0,
    lightCount = 0,
    visibleLightCount = 0,
    activeSpotShadowCount = 0
  runtime.appCtx.threeScene?.traverse((snapshotRenderStatsSceneObject: any) => {
    if (snapshotRenderStatsSceneObject.isMesh) {
      meshCount += 1
      let instanceItemType = snapshotRenderStatsSceneObject.userData.instanceItemType
      for (
        let objectNode = snapshotRenderStatsSceneObject;
        objectNode && !instanceItemType;
        objectNode = objectNode.parent
      )
        instanceItemType =
          itemTypeByModelId.get(objectNode.userData.editorModelId) || objectNode.userData.environmentModelType
      instanceItemType ||= snapshotRenderStatsSceneObject.userData.reflectionOverlay
        ? 'reflection'
        : snapshotRenderStatsSceneObject.userData.exportRole || 'other'
      const typeMeshStats = (meshTypeStats[instanceItemType] ||= {
        meshes: 0,
        triangles: 0,
      })
      if (
        (typeMeshStats.meshes++,
        (typeMeshStats.triangles +=
          ((snapshotRenderStatsSceneObject.geometry?.index?.count ??
            snapshotRenderStatsSceneObject.geometry?.attributes.position?.count ??
            0) /
            3) *
          (snapshotRenderStatsSceneObject.isInstancedMesh ? snapshotRenderStatsSceneObject.count : 1)),
        snapshotRenderStatsSceneObject.userData.runtimeFurnitureStats)
      ) {
        for (const furnitureStatKey of Object.keys(furnitureStatsByKind))
          (furnitureStatsByKind as any)[furnitureStatKey] +=
            snapshotRenderStatsSceneObject.userData.runtimeFurnitureStats[furnitureStatKey]
      }
      const material = Array.isArray(snapshotRenderStatsSceneObject.material)
        ? snapshotRenderStatsSceneObject.material
        : [snapshotRenderStatsSceneObject.material]
      for (const sceneMaterial of material) sceneMaterial && materialSet.add(sceneMaterial)
    }
    snapshotRenderStatsSceneObject.isLight &&
      ((lightCount += 1),
      snapshotRenderStatsSceneObject.visible !== false &&
        finite2(snapshotRenderStatsSceneObject.intensity, 0) > 0 &&
        (visibleLightCount += 1),
      snapshotRenderStatsSceneObject.isSpotLight &&
        snapshotRenderStatsSceneObject.castShadow &&
        snapshotRenderStatsSceneObject.visible !== false &&
        (activeSpotShadowCount += 1))
  }),
    runtime.appCtx.threeRenderer?.domElement?.dataset.spotShadowMode === 'atlas' &&
      (activeSpotShadowCount = Math.max(
        activeSpotShadowCount,
        Math.floor(finite2(runtime.appCtx.threeRenderer.domElement.dataset.activeSpotShadows, 0)),
      ))
  const activeUserLightEntries = runtime
    .collectLampEntries()
    .filter(
      ({ item: lightItemEntry, group: lightGroupEntry }: any) =>
        lightGroupEntry?.enabled !== false && finite2(lightItemEntry.lightBrightness, 0) > 0,
    ).length
  // 阴影接收试验（`?shadow-receiver-trial=non-casters`）只做诊断上报，默认关闭。
  const shadowReceiverTrialStats = inspectShadowReceiverTrial2(runtime.appCtx.sceneRootNode),
    shadowReceiverTrial = shadowReceiverTrialStats.mode ? shadowReceiverTrialStats : null,
    diagnosticsDataset = runtime.appCtx.threeRenderer?.domElement?.ownerDocument?.documentElement?.dataset
  diagnosticsDataset &&
    (shadowReceiverTrial
      ? (diagnosticsDataset.shadowReceiverTrial = JSON.stringify(shadowReceiverTrial))
      : delete diagnosticsDataset.shadowReceiverTrial)
  return {
    meshes: meshCount,
    materials: materialSet.size,
    lights: lightCount,
    visibleLights: visibleLightCount,
    activeUserFixtures: activeUserLightEntries,
    activeSpotShadows: activeSpotShadowCount,
    shadowReceiverTrial,
    runtimeFurniture: furnitureStatsByKind,
    meshTypes: meshTypeStats,
  }
}
