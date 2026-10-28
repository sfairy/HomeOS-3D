import type { StudioAppRuntime } from "../../runtime/studio-app-runtime";
import { sceneModelOrigin as sceneModelOrigin2 } from "../../../../plan/courtyard-drawing";
import { inspectShadowReceiverTrial as inspectShadowReceiverTrial2 } from "../../../studio-shadow-receiver-trial";
import { cacheObjectTransforms as cacheObjectTransforms2 } from "../../../../../bridge/scene/scene-matrices";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import { clamp as clamp2 } from "../../../../plan/geometry";
import { finite as finite2 } from "../../../../loaders/studio-normalization";
import type { SceneRefreshOptions } from "../../../types/studio-app-types";
import { composeItemKey } from "../../../ui/studio-app-helpers";
import { applyItemOrientation } from "../../scene/item-orientation";

export function updateRenderStatsHud(runtime: StudioAppRuntime, ) {
  if (!runtime.isRenderStatsTest || !runtime.appCtx.threeRenderer) return;
  runtime.updateExternalModelDataset();
  const domElement = runtime.appCtx.threeRenderer.domElement,
    renderStatsPayload = {
      calls: Number(domElement.dataset.renderCalls || 0),
      triangles: Number(domElement.dataset.renderTriangles || 0),
      instanceSaved: Number(domElement.dataset.instanceDrawCallsSaved || 0),
      staticItemSaved: Number(domElement.dataset.staticItemDrawCallsSaved || 0),
    };
  let homeosRenderStatsTestOutputElement = document.querySelector(
    "#homeos-render-stats-test-output",
  );
  (homeosRenderStatsTestOutputElement ||
    ((homeosRenderStatsTestOutputElement = document.createElement("output")),
    (homeosRenderStatsTestOutputElement.id = "homeos-render-stats-test-output"),
    document.body.append(homeosRenderStatsTestOutputElement)),
    (homeosRenderStatsTestOutputElement.textContent =
      "渲染统计：" +
      renderStatsPayload.calls +
      " 次调用，" +
      renderStatsPayload.triangles +
      " 个三角面；重复实例节省 " +
      renderStatsPayload.instanceSaved +
      " 次，跨模型材质合批节省 " +
      renderStatsPayload.staticItemSaved +
      " 次。"),
    (document.documentElement.dataset.renderStatsTest = JSON.stringify(renderStatsPayload)));
}

export function pushBoundedSample(runtime: StudioAppRuntime, sampleList: any, sampleValue: any) {
  Number.isFinite(sampleValue) &&
    (sampleList.push(sampleValue),
    sampleList.length > runtime.maxFrameSampleCount &&
      sampleList.splice(0, sampleList.length - runtime.maxFrameSampleCount));
}

export function computeAverage(runtime: StudioAppRuntime, numberList: any) {
  return numberList.length
    ? numberList.reduce((sumAccumulator: any, numberValue: any) => sumAccumulator + numberValue, 0) /
        numberList.length
    : null;
}

export function computePercentile(runtime: StudioAppRuntime, sampleSeries: any, percentileRatio: any) {
  if (!sampleSeries.length) return null;
  const sort = [...sampleSeries].sort((leftSample, rightSample) => leftSample - rightSample),
    percentileIndex = Math.min(
      sort.length - 1,
      Math.max(0, Math.ceil(sort.length * percentileRatio) - 1),
    );
  return sort[percentileIndex];
}

export function roundToDigits(runtime: StudioAppRuntime, numericValue: any, digitCount = 1) {
  return Number.isFinite(numericValue) ? Number(numericValue.toFixed(digitCount)) : null;
}

export function ensureDiagnosticsHud(runtime: StudioAppRuntime, ) {
  if (!runtime.isPerformanceDiagnostics || !runtime.appCtx.threeRenderer || runtime.diagnosticsState.hud) return;
  const diagnosticsOutputElement = document.createElement("output");
  ((diagnosticsOutputElement.id = "performance-diagnostics"),
    (diagnosticsOutputElement.className = "performance-diagnostics"),
    diagnosticsOutputElement.setAttribute("aria-label", "3D 性能诊断"),
    diagnosticsOutputElement.setAttribute("aria-live", "off"),
    (diagnosticsOutputElement.textContent = "性能诊断初始化中…"),
    runtime.selectElement("#preview-3d")?.append(diagnosticsOutputElement),
    (runtime.diagnosticsState.hud = diagnosticsOutputElement),
    (runtime.diagnosticsState.gpuContext = runtime.appCtx.threeRenderer.getContext?.() || null),
    (runtime.diagnosticsState.gpuExtension =
      runtime.diagnosticsState.gpuContext?.getExtension?.("EXT_disjoint_timer_query_webgl2") || null),
    (runtime.diagnosticsState.gpuStatus = runtime.diagnosticsState.gpuExtension ? "等待样本" : "不可用"));
}

export function beginMotionMeasurement(runtime: StudioAppRuntime, motionActivity: any) {
  if (!runtime.isPerformanceDiagnostics || !motionActivity) return false;
  const xt2 = runtime.diagnosticsState,
    gpuContext = xt2.gpuContext,
    gpuExtension = xt2.gpuExtension;
  if (
    !gpuContext ||
    !gpuExtension ||
    xt2.gpuQueryActive ||
    xt2.gpuQueriesPending.length >= runtime.maxPendingGpuQueries
  )
    return false;
  try {
    const query = gpuContext.createQuery();
    return query
      ? (gpuContext.beginQuery(gpuExtension.TIME_ELAPSED_EXT, query),
        (xt2.gpuQueryActive = query),
        (xt2.gpuStatus = "采样中"),
        true)
      : false;
  } catch {
    return ((xt2.gpuStatus = "不可用"), false);
  }
}

export function endMotionMeasurement(runtime: StudioAppRuntime, motionSession: any) {
  if (!motionSession) return;
  const xt3 = runtime.diagnosticsState,
    gpuContext2 = xt3.gpuContext,
    gpuExtension2 = xt3.gpuExtension,
    gpuQueryActive = xt3.gpuQueryActive;
  if (((xt3.gpuQueryActive = null), !(!gpuContext2 || !gpuExtension2 || !gpuQueryActive)))
    try {
      (gpuContext2.endQuery(gpuExtension2.TIME_ELAPSED_EXT),
        xt3.gpuQueriesPending.push(gpuQueryActive));
    } catch {
      (gpuContext2.deleteQuery?.(gpuQueryActive), (xt3.gpuStatus = "不可用"));
    }
}

export function flushGpuQueries(runtime: StudioAppRuntime, ) {
  if (!runtime.isPerformanceDiagnostics) return;
  const xt4 = runtime.diagnosticsState,
    gpuContext3 = xt4.gpuContext,
    gpuExtension3 = xt4.gpuExtension;
  if (!gpuContext3 || !gpuExtension3 || !xt4.gpuQueriesPending.length) return;
  if (gpuContext3.getParameter(gpuExtension3.GPU_DISJOINT_EXT)) {
    for (const gpuQueryHandle of xt4.gpuQueriesPending.splice(0))
      gpuContext3.deleteQuery(gpuQueryHandle);
    ((xt4.gpuRenderTimes.length = 0), (xt4.gpuStatus = "采样失效"));
    return;
  }
  const pendingGpuQueryHandles: any = [];
  for (const pendingGpuQuery of xt4.gpuQueriesPending) {
    if (!gpuContext3.getQueryParameter(pendingGpuQuery, gpuContext3.QUERY_RESULT_AVAILABLE)) {
      pendingGpuQueryHandles.push(pendingGpuQuery);
      continue;
    }
    const queryParameter = gpuContext3.getQueryParameter(pendingGpuQuery, gpuContext3.QUERY_RESULT);
    (runtime.pushBoundedSample(xt4.gpuRenderTimes, queryParameter / 1000000),
      gpuContext3.deleteQuery(pendingGpuQuery),
      (xt4.gpuStatus = "可用"));
  }
  xt4.gpuQueriesPending = pendingGpuQueryHandles;
}

export function measureFloorSwitchPhase(runtime: StudioAppRuntime, phaseName: any, phaseTask: any) {
  const floorSwitch = runtime.isPerformanceDiagnostics && runtime.diagnosticsState.floorSwitch;
  if (!floorSwitch || performance.now() > floorSwitch.until) return phaseTask();
  const now = performance.now();
  try {
    return phaseTask();
  } finally {
    const phaseElapsedMs = performance.now() - now;
    ((floorSwitch.phases ||= {}), (floorSwitch.pendingPhases ||= {}));
    const phaseStats = (floorSwitch.phases[phaseName] ||= {
      calls: 0,
      totalMs: 0,
      maxMs: 0,
    });
    (phaseStats.calls++,
      (phaseStats.totalMs += phaseElapsedMs),
      (phaseStats.maxMs = Math.max(phaseStats.maxMs, phaseElapsedMs)),
      (floorSwitch.pendingPhases[phaseName] =
        (floorSwitch.pendingPhases[phaseName] || 0) + phaseElapsedMs));
  }
}

export function recordFloorSwitchTick(runtime: StudioAppRuntime, tickTimestamp: any, shouldTrackLongFrame = true) {
  const floorSwitch2 = runtime.isPerformanceDiagnostics && runtime.diagnosticsState.floorSwitch;
  if (!(!floorSwitch2 || performance.now() > floorSwitch2.until)) {
    if (!shouldTrackLongFrame) {
      floorSwitch2.lastTick = null;
      return;
    }
    if (floorSwitch2.lastTick != null) {
      const tickDeltaMs = tickTimestamp - floorSwitch2.lastTick;
      ((floorSwitch2.maxTickMs = Math.max(floorSwitch2.maxTickMs || 0, tickDeltaMs)),
        tickDeltaMs > 50 && (floorSwitch2.tickLongFrames = (floorSwitch2.tickLongFrames || 0) + 1));
    }
    ((floorSwitch2.lastTick = tickTimestamp),
      (floorSwitch2.checksSinceRender = (floorSwitch2.checksSinceRender || 0) + 1));
  }
}

export function recordRenderTiming(runtime: StudioAppRuntime, renderTimestamp: any, cpuRenderMs: any, motionActive: any) {
  if (!runtime.isPerformanceDiagnostics) return;
  const xt5 = runtime.diagnosticsState,
    floorSwitch3 = xt5.floorSwitch,
    renderNowMs = performance.now();
  if (floorSwitch3 && renderNowMs <= floorSwitch3.until) {
    const renderGapMs = renderNowMs - floorSwitch3.last;
    ((floorSwitch3.last = renderNowMs),
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
      cpuRenderMs > 50 && (floorSwitch3.slowRenderCount = (floorSwitch3.slowRenderCount || 0) + 1));
  }
  if (motionActive) {
    if ((runtime.pushBoundedSample(xt5.cpuRenderTimes, cpuRenderMs), xt5.lastMotionRenderAt > 0)) {
      const frameIntervalMs = renderTimestamp - xt5.lastMotionRenderAt;
      frameIntervalMs >= 2 &&
        frameIntervalMs <= 250 &&
        runtime.pushBoundedSample(xt5.frameIntervals, frameIntervalMs);
    }
    xt5.lastMotionRenderAt = renderTimestamp;
  } else xt5.lastMotionRenderAt = 0;
}

export function snapshotRenderStats(runtime: StudioAppRuntime, ) {
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
    };
  let meshCount = 0,
    lightCount = 0,
    visibleLightCount = 0,
    activeSpotShadowCount = 0;
  (runtime.appCtx.threeScene?.traverse((snapshotRenderStatsSceneObject: any) => {
    if (snapshotRenderStatsSceneObject.isMesh) {
      meshCount += 1;
      let instanceItemType = snapshotRenderStatsSceneObject.userData.instanceItemType;
      for (
        let objectNode = snapshotRenderStatsSceneObject;
        objectNode && !instanceItemType;
        objectNode = objectNode.parent
      )
        instanceItemType =
          itemTypeByModelId.get(objectNode.userData.editorModelId) ||
          objectNode.userData.environmentModelType;
      instanceItemType ||= snapshotRenderStatsSceneObject.userData.reflectionOverlay
        ? "reflection"
        : snapshotRenderStatsSceneObject.userData.exportRole || "other";
      const typeMeshStats = (meshTypeStats[instanceItemType] ||= {
        meshes: 0,
        triangles: 0,
      });
      if (
        (typeMeshStats.meshes++,
        (typeMeshStats.triangles +=
          ((snapshotRenderStatsSceneObject.geometry?.index?.count ??
            snapshotRenderStatsSceneObject.geometry?.attributes.position?.count ??
            0) /
            3) *
          (snapshotRenderStatsSceneObject.isInstancedMesh
            ? snapshotRenderStatsSceneObject.count
            : 1)),
        snapshotRenderStatsSceneObject.userData.runtimeFurnitureStats)
      ) {
        for (const furnitureStatKey of Object.keys(furnitureStatsByKind))
          (furnitureStatsByKind as any)[furnitureStatKey] +=
            snapshotRenderStatsSceneObject.userData.runtimeFurnitureStats[furnitureStatKey];
      }
      const material = Array.isArray(snapshotRenderStatsSceneObject.material)
        ? snapshotRenderStatsSceneObject.material
        : [snapshotRenderStatsSceneObject.material];
      for (const sceneMaterial of material) sceneMaterial && materialSet.add(sceneMaterial);
    }
    snapshotRenderStatsSceneObject.isLight &&
      ((lightCount += 1),
      snapshotRenderStatsSceneObject.visible !== false &&
        finite2(snapshotRenderStatsSceneObject.intensity, 0) > 0 &&
        (visibleLightCount += 1),
      snapshotRenderStatsSceneObject.isSpotLight &&
        snapshotRenderStatsSceneObject.castShadow &&
        snapshotRenderStatsSceneObject.visible !== false &&
        (activeSpotShadowCount += 1));
  }),
    runtime.appCtx.threeRenderer?.domElement?.dataset.spotShadowMode === "atlas" &&
      (activeSpotShadowCount = Math.max(
        activeSpotShadowCount,
        Math.floor(finite2(runtime.appCtx.threeRenderer.domElement.dataset.activeSpotShadows, 0)),
      )));
  const activeUserLightEntries = runtime.collectLampEntries().filter(
    ({ item: lightItemEntry, group: lightGroupEntry }: any) =>
      lightGroupEntry?.enabled !== false && finite2(lightItemEntry.lightBrightness, 0) > 0,
  ).length;
  // 阴影接收试验（`?shadow-receiver-trial=non-casters`）只做诊断上报，默认关闭。
  const shadowReceiverTrialStats = inspectShadowReceiverTrial2(runtime.appCtx.sceneRootNode),
    shadowReceiverTrial = shadowReceiverTrialStats.mode ? shadowReceiverTrialStats : null,
    diagnosticsDataset = runtime.appCtx.threeRenderer?.domElement?.ownerDocument?.documentElement?.dataset;
  (diagnosticsDataset &&
    (shadowReceiverTrial
      ? (diagnosticsDataset.shadowReceiverTrial = JSON.stringify(shadowReceiverTrial))
      : delete diagnosticsDataset.shadowReceiverTrial));
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
  };
}

export function updateMotionStats(runtime: StudioAppRuntime, motionTimestamp: any, isMotionActive: any) {
  runtime.isPerformanceDiagnostics &&
    ((runtime.diagnosticsState.motionActive = isMotionActive),
    isMotionActive || (runtime.diagnosticsState.lastMotionRenderAt = 0),
    runtime.flushGpuQueries(),
    runtime.publishRenderStats(motionTimestamp));
}

export function renderStudioFrame(runtime: StudioAppRuntime, ) {
  ((runtime.appCtx.isLightCacheReady = true), (runtime.appCtx.isLightCachePending = false), runtime.appCtx.lightingScheduler?.wake());
}

export function needsMotionPresentation(runtime: StudioAppRuntime, ) {
  return !runtime.appCtx.isDisposed && !document.hidden && runtime.appCtx.isHighDetailQuality;
}

export function bindFrameDriver(runtime: StudioAppRuntime, frameCallback: any) {
  const domElement3 = runtime.appCtx.threeRenderer.domElement,
    handleRendererLost = (rendererLostEvent: any) => {
      (rendererLostEvent.preventDefault(),
        !runtime.appCtx.isDisposed &&
          ((runtime.appCtx.isDisposed = true),
          runtime.emitRuntimeDiagnostic("gpu-lost"),
          // 0.8.1：先把渲染期登记过的 GPU 资源就地 dispose，再清各类缓存，
          // 否则上下文丢失后这些对象会悬空占显存（大户型再进时整批重建）。
          runtime.appCtx.contextResources?.releaseLostContext(),
          runtime.appCtx.lightingScheduler?.setAvailable(false),
          (runtime.appCtx.modelRevisionCounter += 1),
          (runtime.appCtx.isFrameDirty = true),
          window.clearTimeout(runtime.appCtx.renderCommitTimeoutId),
          (runtime.appCtx.renderCommitTimeoutId = null),
          runtime.appCtx.activeLongTask?.cancel(),
          runtime.disposeShadowAtlas(),
          runtime.appCtx.compiledShaderCache?.clear(),
          runtime.effectCache?.resetContext(),
          runtime.previewResources?.release(),
          window.clearTimeout(runtime.appCtx.precompileDebounceId),
          (runtime.appCtx.precompileDebounceId = null),
          window.clearTimeout(runtime.appCtx.precompileTimeoutId),
          (runtime.appCtx.precompileTimeoutId = null),
          (runtime.appCtx.isEnvironmentLoading = true),
          runtime.appCtx.lightPrecompileController?.setContextLost(true)));
    },
    handleRendererRestored = () => {
      runtime.appCtx.isDisposed &&
        ((runtime.appCtx.isDisposed = false),
        runtime.emitRuntimeDiagnostic("gpu-restored"),
        runtime.disposeShadowAtlas(),
        runtime.appCtx.compiledShaderCache?.clear(),
        runtime.effectCache?.resetContext(),
        runtime.previewResources?.release(),
        (runtime.appCtx.isCacheReady = false),
        (runtime.appCtx.isFrameDirty = true),
        runtime.setFadeOverlay(false),
        runtime.appCtx.contactShadowController?.invalidateContext(),
        runtime.appCtx.rendererLossHandler?.invalidateContext(),
        runtime.appCtx.threeScene?.traverse((traversedLight: any) => {
          traversedLight.isLight &&
            traversedLight.castShadow &&
            traversedLight.shadow &&
            (traversedLight.shadow.needsUpdate = true);
        }),
        (runtime.appCtx.currentPrecompileSignature = ""),
        runtime.precompiledMaterialKeySet.clear(),
        runtime.renderStudioFrame(),
        frameCallback(),
        runtime.needsMotionPresentation() && runtime.scheduleLightPrecompile());
    };
  return (
    domElement3.addEventListener("webglcontextlost", handleRendererLost),
    domElement3.addEventListener("webglcontextrestored", handleRendererRestored),
    () => {
      (domElement3.removeEventListener("webglcontextlost", handleRendererLost),
        domElement3.removeEventListener("webglcontextrestored", handleRendererRestored));
    }
  );
}

export function setFadeOverlay(runtime: StudioAppRuntime, isOverlayVisible: any) {
  ((runtime.previewLightCacheCanvasElement.hidden = !isOverlayVisible),
    runtime.isEmbeddedStage &&
      runtime.appCtx.threeRenderer &&
      (runtime.appCtx.threeRenderer.domElement.style.opacity = isOverlayVisible ? "0" : "1"));
}

export function hasPendingSceneWork(runtime: StudioAppRuntime, ) {
  const modelLoadState = runtime.externalModelRegistry.modelLoadState();
  return (
    (modelLoadState.pending ?? modelLoadState.active + modelLoadState.queued) > 0 ||
    runtime.appCtx.isModelLoadPending ||
    runtime.appCtx.replacementFrameCount > 0 ||
    runtime.appCtx.modelLoadTimeoutId !== null ||
    runtime.appCtx.isPrecompileBlocked
  );
}

export function canBuildScene(runtime: StudioAppRuntime, ) {
  return !(runtime.isEmbeddedStage && runtime.appCtx.isExternalModelPending) && !runtime.hasPendingSceneWork();
}

export function drawToActiveSurface(runtime: StudioAppRuntime, drawingTargetCanvas: any, drawingSourceImage: any, isCancelled: any) {
  runtime.appCtx.activeLongTask?.cancel();
  const studioOrbitControls = runtime.appCtx.orbitControls,
    renderTaskOptions = {
      cancelled: false,
      frame: null as any,
      timer: null as any,
      idle: null as any,
      cancel: null as any,
    },
    isRenderTaskActive = () => !renderTaskOptions.cancelled && isCancelled(),
    cancelRenderTask = () => {
      ((renderTaskOptions.cancelled = true),
        renderTaskOptions.frame !== null && window.cancelAnimationFrame(renderTaskOptions.frame),
        renderTaskOptions.timer !== null && window.clearTimeout(renderTaskOptions.timer),
        renderTaskOptions.idle !== null && window.cancelIdleCallback?.(renderTaskOptions.idle),
        (renderTaskOptions.frame = renderTaskOptions.timer = renderTaskOptions.idle = null),
        window.removeEventListener("pagehide", cancelRenderTask),
        window.removeEventListener("pointerdown", cancelRenderTask, true),
        window.removeEventListener("wheel", cancelRenderTask, true),
        studioOrbitControls?.removeEventListener("start", cancelRenderTask),
        studioOrbitControls?.removeEventListener("change", cancelRenderTask),
        drawingSourceImage &&
          ((drawingSourceImage.width = drawingSourceImage.height = 0), (drawingSourceImage = null)),
        runtime.appCtx.activeLongTask === renderTaskOptions && (runtime.appCtx.activeLongTask = null));
    };
  ((renderTaskOptions.cancel = cancelRenderTask), (runtime.appCtx.activeLongTask = renderTaskOptions));
  const handleRenderTaskError = (renderError: any) =>
      window.HomeOSLog?.error!(renderError, {
        phase: "interaction3d-cache-write",
      })!,
    handleRenderTaskIdle = () => {
      ((renderTaskOptions.idle = null),
        Promise.resolve()
          .then(() => {
            if (isRenderTaskActive())
              return runtime.renderCacheWriter?.write(
                drawingTargetCanvas,
                drawingSourceImage,
                isRenderTaskActive,
              );
          })
          .catch(handleRenderTaskError)
          .finally(cancelRenderTask));
    };
  try {
    (window.addEventListener("pagehide", cancelRenderTask, {
      once: true,
    }),
      window.addEventListener("pointerdown", cancelRenderTask, {
        capture: true,
        passive: true,
      }),
      window.addEventListener("wheel", cancelRenderTask, {
        capture: true,
        passive: true,
      }),
      studioOrbitControls?.addEventListener("start", cancelRenderTask),
      studioOrbitControls?.addEventListener("change", cancelRenderTask),
      (renderTaskOptions.frame = window.requestAnimationFrame(() => {
        if (((renderTaskOptions.frame = null), !isRenderTaskActive())) {
          cancelRenderTask();
          return;
        }
        renderTaskOptions.timer = window.setTimeout(() => {
          if (((renderTaskOptions.timer = null), !isRenderTaskActive())) {
            cancelRenderTask();
            return;
          }
          try {
            typeof window.requestIdleCallback == "function"
              ? (renderTaskOptions.idle = window.requestIdleCallback(handleRenderTaskIdle))
              : handleRenderTaskIdle();
          } catch (renderSetupError: any) {
            (cancelRenderTask(), handleRenderTaskError(renderSetupError));
          }
        }, 180);
      })));
  } catch (renderLoopError: any) {
    (cancelRenderTask(), handleRenderTaskError(renderLoopError));
  }
}

export function restoreLightVisibility(runtime: StudioAppRuntime, ) {
  if (!runtime.appCtx.isCacheReady || runtime.previewLightCacheCanvasElement.hidden) return;
  const overlaySurfacePainter = runtime.previewLightCacheCanvasElement.getContext("2d");
  if (overlaySurfacePainter) {
    overlaySurfacePainter.clearRect(
      0,
      0,
      runtime.previewLightCacheCanvasElement.width,
      runtime.previewLightCacheCanvasElement.height,
    );
    for (const [overlayGroupId, overlayImage] of runtime.appCtx.lightGroupCacheByFloor) {
      const overlayAlpha = clamp2(finite2(runtime.appCtx.lightGainByFloor.get(overlayGroupId), 0), 0, 1);
      overlayAlpha <= 0.001 ||
        (overlaySurfacePainter.save(),
        (overlaySurfacePainter.globalAlpha = overlayAlpha),
        overlaySurfacePainter.drawImage(overlayImage, 0, 0),
        overlaySurfacePainter.restore());
    }
  }
}

export function fadeLightsIn(runtime: StudioAppRuntime, lightGroupIdList: any, fadeDurationMs = runtime.lightTransitionMs) {
  const uniqueLightGroupIds = [...new Set(lightGroupIdList)].filter(Boolean);
  if (!uniqueLightGroupIds.length) return;
  const lightFadeEntries = uniqueLightGroupIds.map((fadeGroupId) => ({
    groupId: runtime.composeLightGroupKey(runtime.appCtx.activeFloorId, fadeGroupId),
    from: clamp2(
      finite2(
        runtime.appCtx.lightGainByFloor.get(runtime.composeLightGroupKey(runtime.appCtx.activeFloorId, fadeGroupId)),
        runtime.findLightGroup(fadeGroupId)?.enabled === false ? 0 : 1,
      ),
      0,
      1,
    ),
    to: runtime.findLightGroup(fadeGroupId)?.enabled === false ? 0 : 1,
  }));
  if ((cancelAnimationFrame(runtime.appCtx.lightCaptureFrameId), !runtime.appCtx.isCacheReady)) {
    for (const lightFadeEntry of lightFadeEntries)
      runtime.appCtx.lightGainByFloor.set(lightFadeEntry.groupId, lightFadeEntry.to);
    runtime.appCtx.isCapturingLights || runtime.scheduleStudioRender(0);
    return;
  }
  const fadeStartMs = performance.now(),
    fadeFrameStep = (fadeTimestamp: any) => {
      const fadeProgress = clamp2((fadeTimestamp - fadeStartMs) / fadeDurationMs, 0, 1),
        easedFadeProgress = fadeProgress * fadeProgress * (3 - 2 * fadeProgress);
      for (const lightFadeTarget of lightFadeEntries)
        runtime.appCtx.lightGainByFloor.set(
          lightFadeTarget.groupId,
          lightFadeTarget.from + (lightFadeTarget.to - lightFadeTarget.from) * easedFadeProgress,
        );
      (runtime.restoreLightVisibility(),
        fadeProgress < 1
          ? (runtime.appCtx.lightCaptureFrameId = requestAnimationFrame(fadeFrameStep))
          : (runtime.appCtx.lightCaptureFrameId = 0));
    };
  runtime.appCtx.lightCaptureFrameId = requestAnimationFrame(fadeFrameStep);
}

export function findLightGroup(runtime: StudioAppRuntime, lightGroupId: any) {
  return (
    runtime.appCtx.studioState.lightGroups?.find(
      (candidateLightGroup) => candidateLightGroup.id === lightGroupId,
    ) || null
  );
}

export function fadeLightsOut(runtime: StudioAppRuntime, fadeGroupIdList: any, fadeOutDurationMs = runtime.lightTransitionMs) {
  if (!runtime.appCtx.sceneRootNode) return false;
  const fadeGroupIdSet = new Set(fadeGroupIdList),
    ht3 = runtime.areLightsEnabled() && !runtime.appCtx.pendingRuntimeSettings,
    fadeLightEntries: any = [];
  if (
    (runtime.appCtx.sceneRootNode.traverse((fadeLightObject: any) => {
      if (!fadeLightObject.isLight || !fadeGroupIdSet.has(fadeLightObject.userData?.lightGroupId))
        return;
      const targetLightIntensity =
        runtime.findLightGroup(fadeLightObject.userData.lightGroupId)?.enabled !== false && !ht3
          ? finite2(fadeLightObject.userData.lightOnIntensity, 0)
          : 0;
      (targetLightIntensity > 0 && (fadeLightObject.visible = true),
        fadeLightEntries.push({
          object: fadeLightObject,
          from: finite2(fadeLightObject.intensity, 0),
          to: targetLightIntensity,
        }));
    }),
    !fadeLightEntries.length)
  )
    return false;
  (fadeLightEntries.some(({ to: fadeListEntry }: any) => fadeListEntry > 0) &&
    runtime.setupSceneShadows(runtime.appCtx.sceneRootNode, {
      rebuildAtlas: false,
    }),
    cancelAnimationFrame(runtime.appCtx.cacheWarmFrameId));
  const fadeOutStartMs = performance.now(),
    fadeOutFrameStep = (fadeOutTimestamp: any) => {
      const fadeOutProgress = clamp2((fadeOutTimestamp - fadeOutStartMs) / fadeOutDurationMs, 0, 1),
        easedFadeOutProgress = fadeOutProgress * fadeOutProgress * (3 - 2 * fadeOutProgress);
      for (const fadeOutLightEntry of fadeLightEntries)
        fadeOutLightEntry.object.intensity =
          fadeOutLightEntry.from +
          (fadeOutLightEntry.to - fadeOutLightEntry.from) * easedFadeOutProgress;
      if ((runtime.renderStudioFrame(), fadeOutProgress < 1))
        runtime.appCtx.cacheWarmFrameId = requestAnimationFrame(fadeOutFrameStep);
      else {
        runtime.appCtx.cacheWarmFrameId = 0;
        let hasVisibilityChange = false;
        for (const fadeOutTarget of fadeLightEntries)
          fadeOutTarget.to > 0 ||
            ((fadeOutTarget.object.visible = false), (hasVisibilityChange = true));
        hasVisibilityChange &&
          runtime.setupSceneShadows(runtime.appCtx.sceneRootNode, {
            rebuildAtlas: false,
          });
      }
    };
  return ((runtime.appCtx.cacheWarmFrameId = requestAnimationFrame(fadeOutFrameStep)), true);
}

export function transitionLightGroups(runtime: StudioAppRuntime, transitionGroupIds: any) {
  const uniqueTransitionGroupIds = [...new Set(transitionGroupIds)].filter(Boolean);
  (runtime.areLightsEnabled() && !runtime.appCtx.pendingRuntimeSettings
    ? runtime.fadeLightsIn(uniqueTransitionGroupIds)
    : runtime.fadeLightsOut(uniqueTransitionGroupIds) ||
      runtime.requestSceneRebuild({
        scope: "lights",
        preserveLightCache: true,
      }),
    runtime.syncLightGroupList(),
    runtime.refreshStudioUi(),
    runtime.refreshStudioView(),
    runtime.requestStudioRender(),
    runtime.scheduleLightPrecompile());
}

export function refreshSceneRender(runtime: StudioAppRuntime, refreshOptions: SceneRefreshOptions = {}) {
  // 场景/材质/阴影有变化时先作废静态帧缓存，下一次渲染会重新捕获。
  runtime.effectCache?.invalidate();
  if (
    (runtime.isEmbeddedStage &&
      (refreshOptions.scene === true || refreshOptions.shadows === true) &&
      runtime.appCtx.sceneRevisionCount++,
    (runtime.appCtx.isLightCacheReady = true),
    (runtime.appCtx.isLightCachePending = false),
    runtime.appCtx.lightingScheduler?.wake(),
    runtime.isEmbeddedStage &&
      (refreshOptions.scene === true || refreshOptions.shadows === true) &&
      cacheObjectTransforms2(runtime.appCtx.threeScene, ns2.Object3D),
    refreshOptions.shadows === true &&
      runtime.appCtx.threeScene?.traverse((shadowLightObject: any) => {
        shadowLightObject.isLight &&
          shadowLightObject.castShadow &&
          shadowLightObject.shadow &&
          (shadowLightObject.shadow.needsUpdate = true);
      }),
    !runtime.appCtx.isLightOverrideOn)
  ) {
    if (
      refreshOptions.preserveLightCache === true &&
      runtime.areLightsEnabled() &&
      !runtime.appCtx.pendingRuntimeSettings
    ) {
      !runtime.appCtx.isCacheReady && !runtime.appCtx.isCapturingLights && runtime.scheduleStudioRender();
      return;
    }
    runtime.areLightsEnabled() && !runtime.appCtx.pendingRuntimeSettings
      ? ((runtime.appCtx.modelRevisionCounter += 1),
        (runtime.appCtx.isFrameDirty = true),
        (runtime.isEmbeddedStage || refreshOptions.scene === true || !runtime.appCtx.isCacheReady) &&
          runtime.setFadeOverlay(false),
        runtime.scheduleStudioRender(),
        runtime.requestStudioRender())
      : (window.clearTimeout(runtime.appCtx.renderCommitTimeoutId),
        (runtime.appCtx.renderCommitTimeoutId = null),
        (runtime.appCtx.isCacheReady = false),
        (runtime.appCtx.isFrameDirty = false),
        runtime.setFadeOverlay(false));
  }
}

export function syncLightCache(runtime: StudioAppRuntime, ) {
  runtime.appCtx.isLightOverrideOn = true;
  try {
    runtime.getPreviewFloorMode() === "all"
      ? runtime.rebuildFloorLayers({
          preserveLightCache: true,
        })
      : runtime.buildLightsLayer({
          preserveLightCache: true,
        });
  } finally {
    runtime.appCtx.isLightOverrideOn = false;
  }
}

export function buildLightCacheMap(runtime: StudioAppRuntime, ) {
  const lightsByItemKey = new Map();
  return (
    runtime.appCtx.sceneRootNode?.traverse((cacheLightObject: any) => {
      const cachedLightItemId = cacheLightObject.userData?.lightItemId;
      if (!cacheLightObject.isLight || !cachedLightItemId) return;
      const ji3 = composeItemKey(cacheLightObject.userData?.lightFloorId, cachedLightItemId);
      (lightsByItemKey.has(ji3) || lightsByItemKey.set(ji3, []),
        lightsByItemKey.get(ji3).push(cacheLightObject));
    }),
    lightsByItemKey
  );
}

export function ensureLightCache(runtime: StudioAppRuntime, lightEntries: any) {
  let lightCacheMap = runtime.buildLightCacheMap();
  if (lightEntries.every((lightCacheEntry: any) => lightCacheMap.has(lightCacheEntry.itemKey)))
    return lightCacheMap;
  if (runtime.isEmbeddedStage) return runtime.updateLightCache(lightEntries, lightCacheMap);
  ((runtime.appCtx.isResidentCacheMode = true), (runtime.appCtx.overriddenFloorIds = new Set()));
  try {
    runtime.syncLightCache();
  } finally {
    ((runtime.appCtx.overriddenFloorIds = null), (runtime.appCtx.isResidentCacheMode = false));
  }
  return ((lightCacheMap = runtime.buildLightCacheMap()), lightCacheMap);
}

export function updateLightCache(runtime: StudioAppRuntime, incrementalLightEntries: any, lightCacheTarget: any) {
  const sceneSnapshot = runtime.appCtx.studioState,
    oe3 = runtime.appCtx.activeFloorId,
    Xr2 = runtime.appCtx.isResidentCacheMode,
    isAllFloorsView = runtime.getPreviewFloorMode() === "all";
  try {
    runtime.appCtx.isResidentCacheMode = true;
    for (const {
      floor: cacheFloor,
      item: cacheLightItem,
      itemKey: cacheItemKey,
    } of incrementalLightEntries) {
      if (lightCacheTarget.has(cacheItemKey) || (!isAllFloorsView && cacheFloor.id !== oe3))
        continue;
      const floorGroup = isAllFloorsView
        ? runtime.appCtx.sceneRootNode?.children.find(
            (floorChildGroup: any) => floorChildGroup.userData?.floorId === cacheFloor.id,
          )
        : runtime.appCtx.sceneRootNode;
      if (!floorGroup) continue;
      ((runtime.appCtx.studioState = cacheFloor.scene), (runtime.appCtx.activeFloorId = cacheFloor.id));
      const lightCacheTargetPixelsPerMeter = runtime.getPixelsPerMeter();
      if (!lightCacheTargetPixelsPerMeter) continue;
      const floorModelOrigin = sceneModelOrigin2(cacheFloor.scene, cacheFloor),
        floorOriginX = isAllFloorsView ? finite2(cacheFloor.originX, 0) : floorModelOrigin.x,
        floorOriginY = isAllFloorsView ? finite2(cacheFloor.originY, 0) : floorModelOrigin.y,
        lightProxyGroup = new ns2.Group();
      (runtime.addLightModel(lightProxyGroup, cacheLightItem, runtime.collectLightSourceSpecs()),
        lightProxyGroup.position.set(
          (cacheLightItem.x - floorOriginX) / lightCacheTargetPixelsPerMeter,
          cacheLightItem.elevation || 0,
          (cacheLightItem.y - floorOriginY) / lightCacheTargetPixelsPerMeter,
        ),
        applyItemOrientation(lightProxyGroup, cacheLightItem),
        (lightProxyGroup.userData.modelLayer = "lights"),
        (lightProxyGroup.userData.exportRole = "plan"),
        floorGroup.add(lightProxyGroup),
        runtime.isEmbeddedStage && cacheObjectTransforms2(lightProxyGroup, ns2.Object3D));
      const proxyLights: any = [];
      (lightProxyGroup.traverse((proxyLightObject: any) => {
        proxyLightObject.isLight && proxyLights.push(proxyLightObject);
      }),
        proxyLights.length && lightCacheTarget.set(cacheItemKey, proxyLights));
    }
  } finally {
    ((runtime.appCtx.studioState = sceneSnapshot), (runtime.appCtx.activeFloorId = oe3), (runtime.appCtx.isResidentCacheMode = Xr2));
  }
  return (
    runtime.setupSceneShadows(runtime.appCtx.sceneRootNode, {
      rebuildAtlas: false,
    }),
    lightCacheTarget
  );
}

export function showLightCacheFor(runtime: StudioAppRuntime, cacheMapSource: any, activeCacheKey = "") {
  for (const [cacheEntryKey, cacheLightObjects] of cacheMapSource) {
    const isCacheEntryActive = cacheEntryKey === activeCacheKey;
    for (const cacheTargetLight of cacheLightObjects)
      ((cacheTargetLight.visible = isCacheEntryActive),
        (cacheTargetLight.intensity = isCacheEntryActive
          ? finite2(cacheTargetLight.userData?.lightOnIntensity, 0)
          : 0),
        cacheTargetLight.isSpotLight &&
          ((cacheTargetLight.castShadow = isCacheEntryActive),
          isCacheEntryActive &&
            cacheTargetLight.shadow &&
            !cacheTargetLight.shadow.map &&
            (cacheTargetLight.shadow.needsUpdate = true)));
  }
  (runtime.isEmbeddedStage || runtime.appCtx.lightPrecompileController?.syncRenderUniforms(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
    runtime.renderStudioFrame());
}

export function collectActiveLightGroupKeys(runtime: StudioAppRuntime, ) {
  return new Set(
    runtime.collectLampEntries()
      .filter(
        ({ item: activeEntryItem, group: activeEntryGroup }: any) =>
          activeEntryGroup?.enabled !== false && finite2(activeEntryItem.lightBrightness, 0) > 0,
      )
      .map(({ itemKey: activeEntryKey }: any) => activeEntryKey),
  );
}

export function showCachedLights(runtime: StudioAppRuntime, cacheMapForDisplay: any) {
  const sv2 = runtime.collectActiveLightGroupKeys();
  for (const [displayCacheKey, displayLightObjects] of cacheMapForDisplay) {
    const isDisplayEntryActive = sv2.has(displayCacheKey);
    for (const displayLightObject of displayLightObjects)
      ((displayLightObject.visible = isDisplayEntryActive),
        (displayLightObject.intensity = isDisplayEntryActive
          ? finite2(displayLightObject.userData?.lightOnIntensity, 0)
          : 0),
        displayLightObject.isSpotLight && (displayLightObject.castShadow = false));
  }
  (runtime.isEmbeddedStage || runtime.appCtx.lightPrecompileController?.syncRenderUniforms(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
    runtime.renderStudioFrame());
}

export function captureLightSnapshot(runtime: StudioAppRuntime, ) {
  if (!runtime.previewRenderShieldElement || !runtime.appCtx.threeRenderer?.domElement) return;
  const domElement5 = runtime.appCtx.threeRenderer.domElement;
  if (!domElement5.width || !domElement5.height) return;
  (runtime.isEmbeddedStage &&
    (window.clearTimeout(runtime.appCtx.previewShieldTimeoutId),
    (runtime.appCtx.previewShieldTimeoutId = null),
    (runtime.previewRenderShieldElement.style.transition = "none"),
    (runtime.previewRenderShieldElement.style.opacity = "1")),
    (runtime.previewRenderShieldElement.width = domElement5.width),
    (runtime.previewRenderShieldElement.height = domElement5.height));
  const compositeSurfacePainter = runtime.previewRenderShieldElement.getContext("2d");
  compositeSurfacePainter &&
    ((compositeSurfacePainter.globalCompositeOperation = "source-over"),
    (compositeSurfacePainter.globalAlpha = 1),
    (compositeSurfacePainter.fillStyle =
      "#" + runtime.backgroundSettings().background.toString(16).padStart(6, "0")),
    compositeSurfacePainter.fillRect(
      0,
      0,
      runtime.previewRenderShieldElement.width,
      runtime.previewRenderShieldElement.height,
    ),
    runtime.isEmbeddedStage && runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera),
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
    (runtime.previewRenderShieldElement.hidden = false));
}

export function restorePreviewAfterFade(runtime: StudioAppRuntime, { smooth: isSmoothRestore = false } = {}) {
  if (runtime.previewRenderShieldElement) {
    if (runtime.isEmbeddedStage) {
      if (
        (window.clearTimeout(runtime.appCtx.previewShieldTimeoutId),
        (runtime.appCtx.previewShieldTimeoutId = null),
        isSmoothRestore && !runtime.previewRenderShieldElement.hidden)
      ) {
        ((runtime.previewRenderShieldElement.style.transition = "opacity 180ms ease-out"),
          (runtime.previewRenderShieldElement.style.opacity = "0"),
          (runtime.appCtx.previewShieldTimeoutId = window.setTimeout(() => {
            ((runtime.appCtx.previewShieldTimeoutId = null),
              (runtime.previewRenderShieldElement.hidden = true),
              (runtime.previewRenderShieldElement.style.transition = "none"),
              (runtime.previewRenderShieldElement.style.opacity = "1"));
          }, 180)));
        return;
      }
      ((runtime.previewRenderShieldElement.style.transition = "none"),
        (runtime.previewRenderShieldElement.style.opacity = "1"));
    }
    runtime.previewRenderShieldElement.hidden = true;
  }
}

export function awaitNextFramePair(runtime: StudioAppRuntime, ) {
  return (
    runtime.captureLightSnapshot(),
    new Promise((resolveFramePair) =>
      requestAnimationFrame(() => requestAnimationFrame(resolveFramePair)),
    )
  );
}

export function captureFramePixels(runtime: StudioAppRuntime, captureWidth: any, captureHeight: any) {
  const captureCanvas = document.createElement("canvas");
  ((captureCanvas.width = captureWidth), (captureCanvas.height = captureHeight));
  const capturePixelPainter = captureCanvas.getContext("2d", {
    willReadFrequently: true,
  });
  if (!capturePixelPainter) throw new Error("当前浏览器无法创建多灯缓存画布。");
  return (
    capturePixelPainter.drawImage(runtime.appCtx.threeRenderer.domElement, 0, 0, captureWidth, captureHeight),
    capturePixelPainter.getImageData(0, 0, captureWidth, captureHeight)
  );
}

export function rerenderScene(runtime: StudioAppRuntime, ) {
  for (let renderPassIndex = 0; renderPassIndex < 3; renderPassIndex += 1)
    runtime.appCtx.threeRenderer.render(runtime.appCtx.threeScene, runtime.appCtx.threeCamera);
}

export function ensureRenderReady(runtime: StudioAppRuntime, ) {
  return globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : new Promise<void>((resolveRenderWait) => requestAnimationFrame(() => resolveRenderWait()));
}

export function waitForIdleFrame(runtime: StudioAppRuntime, ) {
  return globalThis.scheduler?.yield
    ? globalThis.scheduler.yield()
    : typeof globalThis.requestIdleCallback === "function"
      ? new Promise<void>((resolveIdleWait) =>
          requestIdleCallback(() => resolveIdleWait(), {
            timeout: 80,
          }),
        )
      : new Promise<void>((resolveAnimationWait) =>
          requestAnimationFrame(() => resolveAnimationWait()));
}

export function scheduleStudioRender(runtime: StudioAppRuntime, renderDelayMs = 420) {
  runtime.appCtx.isDisposed ||
    (runtime.isEmbeddedStage && !runtime.appCtx.isHighDetailQuality) ||
    (runtime.isEmbeddedStage && runtime.renderCacheWriter?.closed) ||
    !runtime.appCtx.threeRenderer ||
    !runtime.appCtx.sceneRootNode ||
    runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isRenderSuppressed ||
    runtime.appCtx.isWindowHidden ||
    runtime.appCtx.isCapturingLights ||
    runtime.appCtx.prewarmState ||
    runtime.appCtx.isPrewarming ||
    !runtime.areLightsEnabled() ||
    (window.clearTimeout(runtime.appCtx.renderCommitTimeoutId),
    (runtime.appCtx.renderCommitTimeoutId = window.setTimeout(() => {
      const modelLoadState2 = runtime.externalModelRegistry.modelLoadState();
      if ((modelLoadState2.pending ?? modelLoadState2.active + modelLoadState2.queued) > 0) {
        ((runtime.appCtx.renderCommitTimeoutId = null), runtime.scheduleStudioRender(240));
        return;
      }
      runtime.beginLightingPreview();
    }, renderDelayMs)));
}

export function discardLightingEdit(runtime: StudioAppRuntime, ) {
  !runtime.areLightsEnabled() ||
    runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isCapturingLights ||
    ((runtime.appCtx.isFrameDirty = true), runtime.scheduleStudioRender(0), runtime.requestStudioRender());
}

export function resetPlanInteraction(runtime: StudioAppRuntime, ) {
  (window.clearTimeout(runtime.appCtx.deferredRenderTimeoutId),
    (runtime.appCtx.deferredRenderTimeoutId = null),
    (runtime.appCtx.isWindowHidden = true),
    window.clearTimeout(runtime.appCtx.renderCommitTimeoutId),
    (runtime.appCtx.renderCommitTimeoutId = null),
    runtime.appCtx.isCapturingLights && ((runtime.appCtx.modelRevisionCounter += 1), (runtime.appCtx.isFrameDirty = true)));
}

export function endStudioGesture(runtime: StudioAppRuntime, ) {
  (window.clearTimeout(runtime.appCtx.deferredRenderTimeoutId),
    (runtime.appCtx.deferredRenderTimeoutId = window.setTimeout(() => {
      if (
        ((runtime.appCtx.deferredRenderTimeoutId = null),
        (runtime.appCtx.isWindowHidden = false),
        runtime.handleInteractionEnded(),
        runtime.dirtyFloorIdSet.size && !runtime.appCtx.isPrecompileBlocked)
      ) {
        const activeScopes = [...runtime.dirtyFloorIdSet],
          activeScopeName = activeScopes.includes("all") ? "all" : activeScopes[0];
        runtime.requestSceneRebuild({
          scope: activeScopeName as string,
          preserveLightCache: !runtime.appCtx.isLightCachePreserved,
        });
      }
      (runtime.appCtx.isFrameDirty && runtime.scheduleStudioRender(420), runtime.appCtx.isModelLoadPending && runtime.requestSceneRender());
    }, 120)));
}

export function disposeShadowAtlas(runtime: StudioAppRuntime, ) {
  (window.clearTimeout(runtime.appCtx.shadowPrepareTimeoutId),
    (runtime.appCtx.shadowPrepareTimeoutId = null),
    (runtime.appCtx.isShadowPreparing = runtime.appCtx.isShadowFrozen = false),
    runtime.appCtx.shadowAtlasCanvas?.clear());
}

export function prepareShadowAtlas(runtime: StudioAppRuntime, ) {
  if (
    !runtime.appCtx.shadowAtlasCanvas ||
    runtime.appCtx.shadowPrepareTimeoutId !== null ||
    runtime.appCtx.isRenderSuppressed ||
    runtime.appCtx.isShadowPreparing ||
    document.hidden ||
    !runtime.appCtx.isHighDetailQuality ||
    runtime.appCtx.isExternalModelPending
  )
    return;
  const zn2 = runtime.computeRenderPixelRatio(true);
  zn2 >= runtime.computeRenderPixelRatio(false) ||
    runtime.appCtx.shadowAtlasCanvas.matches(zn2) ||
    (runtime.appCtx.shadowPrepareTimeoutId = window.setTimeout(() => {
      ((runtime.appCtx.shadowPrepareTimeoutId = null),
        !runtime.appCtx.isRenderSuppressed &&
          !runtime.appCtx.isShadowPreparing &&
          !document.hidden &&
          runtime.appCtx.isHighDetailQuality &&
          runtime.appCtx.shadowAtlasCanvas.prepare(runtime.computeRenderPixelRatio(true)));
    }, 250));
}

/** 效果缓存可用性：与 0.7.8 `ng()` 同一判定集（渲染冲突时一律退回整帧）。 */
export function isEffectCacheReady(runtime: StudioAppRuntime, ) {
  return (
    !!runtime.effectCache &&
    !runtime.appCtx.isRenderSuppressed &&
    !runtime.appCtx.isCapturingLights &&
    !runtime.appCtx.isCurtainMoving &&
    !runtime.appCtx.isVacuumMoving &&
    !runtime.appCtx.isLockMoving &&
    runtime.studioReflectionDetailMode === 1 &&
    !runtime.appCtx.pendingRuntimeSettings &&
    !runtime.appCtx.contactShadowController?.isPending?.() &&
    !runtime.appCtx.contactShadowController?.hasPendingSurfaces?.() &&
    new URLSearchParams(window.location.search).get("effect-cache") !== "baseline"
  );
}
