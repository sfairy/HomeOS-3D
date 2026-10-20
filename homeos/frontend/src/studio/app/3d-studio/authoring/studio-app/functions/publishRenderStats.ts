


























































import type { StudioAppContext } from "../studio-app-context";
export interface PublishRenderStatsDeps { appCtx: StudioAppContext; computeAverage: any; computePercentile: any; diagnosticsState: any; externalModelRegistry: any; isPerformanceDiagnostics: any; meshStatsByType: any; publishIntervalMs: any; roundToDigits: any; snapshotRenderStats: any; }

export function publishRenderStats(deps: PublishRenderStatsDeps, publishTimestamp = performance.now(), shouldForcePublish = false) {
  const { appCtx, computeAverage, computePercentile, diagnosticsState, externalModelRegistry, isPerformanceDiagnostics, meshStatsByType, publishIntervalMs, roundToDigits, snapshotRenderStats } = deps;

  if (!isPerformanceDiagnostics || !appCtx.threeRenderer || !diagnosticsState.hud) return;
  const xt6 = diagnosticsState;
  if (!shouldForcePublish && publishTimestamp - xt6.lastPublishAt < publishIntervalMs) return;
  xt6.lastPublishAt = publishTimestamp;
  const domElement2 = appCtx.threeRenderer.domElement,
    bu2 = computeAverage(xt6.frameIntervals),
    ql2 = computePercentile(xt6.frameIntervals, 0.5),
    jy2 = snapshotRenderStats(),
    shaderProgramCount = appCtx.threeRenderer.info.programs?.length,
    statsPublishPayload = {
      enabled: true,
      floorSwitch: xt6.floorSwitch
        ? {
            target: xt6.floorSwitch.target,
            frames: xt6.floorSwitch.frames,
            maxFrameMs: roundToDigits(xt6.floorSwitch.maxTickMs || 0, 2),
            longFrames: xt6.floorSwitch.tickLongFrames || 0,
            maxRenderGapMs: roundToDigits(xt6.floorSwitch.maxMs, 2),
            maxRenderCpuMs: roundToDigits(xt6.floorSwitch.maxRenderCpuMs || 0, 2),
            slowRenderCount: xt6.floorSwitch.slowRenderCount || 0,
            phases: xt6.floorSwitch.phases,
            worstFrame: xt6.floorSwitch.worstFrame,
            averageCpuMs: roundToDigits(
              xt6.floorSwitch.cpuMs / Math.max(1, xt6.floorSwitch.frames),
              2,
            ),
          }
        : null,
      motionActive: xt6.motionActive,
      frame: {
        samples: xt6.frameIntervals.length,
        averageFps: roundToDigits(bu2 ? 1000 / bu2 : null),
        medianFps: roundToDigits(ql2 ? 1000 / ql2 : null),
        p95Ms: roundToDigits(computePercentile(xt6.frameIntervals, 0.95), 2),
      },
      cpuRenderMs: {
        samples: xt6.cpuRenderTimes.length,
        average: roundToDigits(computeAverage(xt6.cpuRenderTimes), 2),
        p95: roundToDigits(computePercentile(xt6.cpuRenderTimes, 0.95), 2),
      },
      gpuRenderMs: {
        supported: !!xt6.gpuExtension,
        status: xt6.gpuStatus,
        samples: xt6.gpuRenderTimes.length,
        average: roundToDigits(computeAverage(xt6.gpuRenderTimes), 2),
        p95: roundToDigits(computePercentile(xt6.gpuRenderTimes, 0.95), 2),
      },
      render: {
        calls: Number(domElement2.dataset.renderCalls || 0),
        triangles: Number(domElement2.dataset.renderTriangles || 0),
        lines: Number(domElement2.dataset.renderLines || 0),
      },
      memory: {
        geometries: Number(appCtx.threeRenderer.info.memory.geometries || 0),
        textures: Number(appCtx.threeRenderer.info.memory.textures || 0),
        programs: Number.isFinite(shaderProgramCount) ? shaderProgramCount : null,
      },
      scene: jy2,
      models: {
        loads: externalModelRegistry.modelLoadState(),
        templates: externalModelRegistry.cacheRepresentation(
          (appCtx.studioProject?.floors || []).flatMap(
            (shouldForcePublishFloorEntry: any) => shouldForcePublishFloorEntry.scene?.items || [],
          ),
        ),
        built: Object.fromEntries(meshStatsByType),
      },
      viewport: {
        devicePixelRatio: roundToDigits(appCtx.threeRenderer.getPixelRatio(), 2),
        canvasWidth: domElement2.width,
        canvasHeight: domElement2.height,
        cssWidth: Math.round(domElement2.clientWidth),
        cssHeight: Math.round(domElement2.clientHeight),
      },
      lighting: {
        adaptiveCacheEnabled: appCtx.isAdaptiveRenderActive,
        residentCacheMode: appCtx.isResidentCacheMode,
        cacheReady: appCtx.isCacheReady,
      },
    },
    frameStatsText = statsPublishPayload.frame.samples
      ? statsPublishPayload.frame.averageFps +
        " / " +
        statsPublishPayload.frame.medianFps +
        " FPS · P95 " +
        statsPublishPayload.frame.p95Ms +
        " ms"
      : "移动镜头后采样",
    status = statsPublishPayload.gpuRenderMs.samples
      ? statsPublishPayload.gpuRenderMs.average +
        " ms · P95 " +
        statsPublishPayload.gpuRenderMs.p95 +
        " ms"
      : statsPublishPayload.gpuRenderMs.status;
  ((xt6.hud.innerHTML = [
    "<strong>3D 性能诊断</strong><span>" +
      (xt6.motionActive ? "交互 / 阻尼中" : "空闲") +
      "</span>",
    "<span>帧率</span><b>" + frameStatsText + "</b>",
    "<span>CPU 提交</span><b>" +
      (statsPublishPayload.cpuRenderMs.average ?? "—") +
      " ms · P95 " +
      (statsPublishPayload.cpuRenderMs.p95 ?? "—") +
      " ms</b>",
    "<span>GPU 渲染</span><b>" + status + "</b>",
    "<span>绘制</span><b>" +
      statsPublishPayload.render.calls +
      " calls · " +
      statsPublishPayload.render.triangles.toLocaleString() +
      " tris</b>",
    "<span>场景</span><b>" + jy2.meshes + " mesh · " + jy2.materials + " 材质实例</b>",
    "<span>资源</span><b>" +
      statsPublishPayload.memory.geometries +
      " 几何 · " +
      statsPublishPayload.memory.textures +
      " 纹理 · " +
      (statsPublishPayload.memory.programs ?? "—") +
      " 程序</b>",
    "<span>灯光</span><b>" +
      jy2.visibleLights +
      "/" +
      jy2.lights +
      " 可见 · " +
      jy2.activeUserFixtures +
      " 用户灯 · " +
      jy2.activeSpotShadows +
      " 阴影</b>",
    "<span>画布</span><b>" +
      statsPublishPayload.viewport.canvasWidth +
      "×" +
      statsPublishPayload.viewport.canvasHeight +
      " · DPR " +
      statsPublishPayload.viewport.devicePixelRatio +
      "</b>",
    "<span>光照缓存</span><b>" +
      (statsPublishPayload.lighting.adaptiveCacheEnabled
        ? "自适应"
        : statsPublishPayload.lighting.residentCacheMode
          ? "驻留"
          : "实时") +
      "</b>",
  ].join("")),
    (document.documentElement.dataset.performanceDiagnostics =
      JSON.stringify(statsPublishPayload)));

}
