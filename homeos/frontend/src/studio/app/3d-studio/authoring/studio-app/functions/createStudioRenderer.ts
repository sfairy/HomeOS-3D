







import { createEffectCache as createEffectCache2 } from "../../studio-effect-cache";
import { createPreviewResourceHandoff as createPreviewResourceHandoff2 } from "../../studio-preview-resources";
import { createContextResourceTracker } from "../../studio-context-resources";












import { createMotionBuffer as createMotionBuffer2 } from "../../scene/studio-motion-buffer";
import { createBackgroundCache as createBackgroundCache2 } from "../../scene/studio-background-cache";
import { stageStartup as stageStartup2 } from "../../../stage-startup";
import { interactionResourcePolicy } from "../../../studio-resource-policy";






import { createOverviewStack as createOverviewStack2 } from "../../scene/studio-overview-stack";






import { createDemandFrameLoop as createDemandFrameLoop2 } from "../../../../bridge/scene/frame-loop";
import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";














import { createSpotShadowAtlasController as createSpotShadowAtlasController2 } from "../../scene/studio-shadow-atlas";
import { createRegionLightController as createRegionLightController2 } from "../../../plan/studio-plan2-region-lights";
import { createContactShadowController as createContactShadowController2 } from "../../../plan/studio-plan2-contact-shadows";
import {
  finite as finite2,
} from "../../../loaders/studio-normalization";



















import type { StudioAppContext } from "../studio-app-context";
export interface CreateStudioRendererDeps { appCtx: StudioAppContext; beginMotionMeasurement: any; bindFrameDriver: any; canBuildScene: any; computeRenderPixelRatio: any; createOrbitControls: any; disposeShadowAtlas: any; effectCache: any; endMotionMeasurement: any; ensureDiagnosticsHud: any; getPreviewFloorMode: any; hasPendingSceneWork: any; isEmbedStageMode: any; isEmbeddedStage: any; isPerformanceDiagnostics: any; isRenderStatsTest: any; lampsLayerIndex: any; needsMotionPresentation: any; planToWorldPoint: any; previewResources: any; publishModelLoadState: any; publishRenderStats: any; recordFrameTime: any; recordRenderTiming: any; refreshBaseLighting: any; renderStudioFrame: any; resizeStudioRenderer: any; scheduleLightPrecompile: any; scheduleStudioRender: any; selectElement: any; setShadowFreeze: any; setupSceneShadows: (root: unknown, options?: { rebuildAtlas?: boolean }) => number; syncCameraModeControls: any; syncCameraViewControls: any; updateCameraView: any; updateMotionStats: any; updateRenderStatsHud: any; }

export function createStudioRenderer(deps: CreateStudioRendererDeps, ) {
  const { appCtx, beginMotionMeasurement, bindFrameDriver, canBuildScene, computeRenderPixelRatio, createOrbitControls, disposeShadowAtlas, endMotionMeasurement, ensureDiagnosticsHud, getPreviewFloorMode, hasPendingSceneWork, isEmbedStageMode, isEmbeddedStage, isPerformanceDiagnostics, isRenderStatsTest, lampsLayerIndex, needsMotionPresentation, planToWorldPoint, publishModelLoadState, publishRenderStats, recordFrameTime, recordRenderTiming, refreshBaseLighting, renderStudioFrame, resizeStudioRenderer, scheduleLightPrecompile, scheduleStudioRender, selectElement, setShadowFreeze, setupSceneShadows, syncCameraModeControls, syncCameraViewControls, updateCameraView, updateMotionStats, updateRenderStatsHud } = deps;

  let disposeRendererEvents: (() => void) | null = null;
  const previewViewportElement = selectElement("#preview-3d");
  /**
   * 创建 WebGL 渲染器，失败时逐步降级。
   *
   * 华为 ArkWeb（com.huawei.webview）等设备上，`antialias` + `powerPreference:"high-performance"`
   * 的组合可能直接拿不到上下文，而同一台机器的浏览器却正常 —— 表现为「App 里 3D 整块空白」。
   * 逐级降级能把这类设备救回来，也让失败点更早暴露：三次都失败才抛给外层错误处理。
   */
  function createRendererWithFallback() {
    const attempts = [
      { antialias: true, alpha: true, powerPreference: "high-performance" },
      { antialias: false, alpha: true, powerPreference: "default" },
      { antialias: false, alpha: true },
    ] as const;
    let lastError: unknown = null;
    for (let index = 0; index < attempts.length; index += 1) {
      try {
        const renderer = new ns2.WebGLRenderer(attempts[index] as any);
        if (index > 0) {
          window.HomeOSLog?.warn?.("3D 渲染器已降级创建", {
            phase: "studio-webgl-fallback",
            attempt: index,
          })!;
        }
        return renderer;
      } catch (rendererError: unknown) {
        lastError = rendererError;
        window.HomeOSLog?.warn?.(rendererError, {
          phase: "studio-webgl-attempt",
          attempt: index,
        })!;
      }
    }
    throw lastError || new Error("无法创建 WebGL 渲染器");
  }
  try {
    ((appCtx.threeScene = new ns2.Scene()),
      (appCtx.threeCamera = new ns2.OrthographicCamera(-5, 5, 5, -5, 0.05, 200)),
      appCtx.threeCamera.layers.enable(lampsLayerIndex),
      (appCtx.threeRenderer = createRendererWithFallback()),
      // 0.8.1：非嵌入舞台（= 编辑态）才追踪上下文资源；嵌入舞台用的是宿主页面共享的渲染上下文。
      isEmbedStageMode ||
        (appCtx.contextResources = createContextResourceTracker(appCtx.threeRenderer)),
      isEmbeddedStage && appCtx.threeRenderer.debug && (appCtx.threeRenderer.debug.checkShaderErrors = false),
      appCtx.threeRenderer.setPixelRatio(computeRenderPixelRatio()),
      (appCtx.threeRenderer.outputColorSpace = ns2.SRGBColorSpace),
      (appCtx.threeRenderer.toneMapping = ns2.NeutralToneMapping),
      (appCtx.threeRenderer.toneMappingExposure = 1.04),
      isEmbeddedStage &&
        isEmbedStageMode &&
        ((appCtx.shadowAtlasCanvas = createMotionBuffer2({
          THREE: ns2,
          renderer: appCtx.threeRenderer,
          maxSamples: interactionResourcePolicy.motion.maxSamples,
        })),
        window.addEventListener(
          "pagehide",
          () => {
            (disposeShadowAtlas(), appCtx.shadowAtlasCanvas.dispose());
          },
          {
            once: true,
          },
        )),
      (appCtx.threeRenderer.shadowMap.enabled = !isEmbedStageMode),
      (appCtx.threeRenderer.shadowMap.type = ns2.VSMShadowMap),
      previewViewportElement.append(appCtx.threeRenderer.domElement),
      isEmbeddedStage &&
        ((appCtx.compiledShaderCache = createBackgroundCache2({
          THREE: ns2,
          renderer: appCtx.threeRenderer,
        })),
        (deps.effectCache = createEffectCache2({
          THREE: ns2,
          renderer: appCtx.threeRenderer,
        })),
        (deps.previewResources = createPreviewResourceHandoff2((resource: any) =>
          resource?.dispose?.(),
        )),
        window.addEventListener(
          "pagehide",
          () => {
            (appCtx.compiledShaderCache?.dispose(), deps.effectCache?.dispose(), deps.previewResources?.release());
          },
          {
            once: true,
          },
        )),
      ensureDiagnosticsHud(),
      (appCtx.orbitControls = createOrbitControls(appCtx.threeCamera)),
      publishModelLoadState(),
      syncCameraModeControls("orthographic"),
      syncCameraViewControls(),
      (appCtx.hemisphereLight = new ns2.HemisphereLight(12504556, 1515053, 1.12)),
      appCtx.hemisphereLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.hemisphereLight),
      (appCtx.ambientLight = new ns2.AmbientLight(7175581, 0.42)),
      appCtx.ambientLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.ambientLight),
      (appCtx.mainDirectionalLight = new ns2.DirectionalLight(14543103, 2.05)),
      appCtx.mainDirectionalLight.position.set(-7, 22, 6),
      (appCtx.mainDirectionalLight.castShadow = true),
      appCtx.mainDirectionalLight.shadow.mapSize.set(2048, 2048),
      (appCtx.mainDirectionalLight.shadow.camera.left = -20),
      (appCtx.mainDirectionalLight.shadow.camera.right = 20),
      (appCtx.mainDirectionalLight.shadow.camera.top = 20),
      (appCtx.mainDirectionalLight.shadow.camera.bottom = -20),
      (appCtx.mainDirectionalLight.shadow.autoUpdate = false),
      (appCtx.mainDirectionalLight.shadow.needsUpdate = true),
      appCtx.mainDirectionalLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.mainDirectionalLight),
      (appCtx.fillDirectionalLight = new ns2.DirectionalLight(8886724, 0.72)),
      appCtx.fillDirectionalLight.position.set(9, 7, -10),
      appCtx.fillDirectionalLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.fillDirectionalLight),
      (appCtx.topDirectionalLight = new ns2.DirectionalLight(15791103, 0.68)),
      appCtx.topDirectionalLight.position.set(0, 16, 1),
      appCtx.topDirectionalLight.layers.enable(lampsLayerIndex),
      appCtx.threeScene.add(appCtx.topDirectionalLight),
      (appCtx.sceneRootNode = new ns2.Group()),
      appCtx.threeScene.add(appCtx.sceneRootNode));
    let previousOverviewSource: any,
      previousOverviewGap: any,
      overviewStackCenter = [0, 0, 0],
      floorBoundsById = new Map();
    ((appCtx.overviewStackController = createOverviewStack2({
      THREE: ns2,
      renderer: appCtx.threeRenderer,
      scene: appCtx.threeScene,
      getCamera: () => appCtx.threeCamera,
      getLayout: () => {
        const overviewFloors = appCtx.studioProject?.floors || [],
          overviewFloorGap = appCtx.pendingRuntimeSettings
            ? finite2(appCtx.studioProject?.exportFloorGap, 3)
            : finite2(appCtx.studioProject?.previewFloorGap, 3);
        if (
          appCtx.studioProject?.uniformOverviewStack &&
          (previousOverviewSource !== appCtx.studioProject || previousOverviewGap !== appCtx.sceneRevisionCount)
        ) {
          const overviewBoundsBox = new ns2.Box3();
          floorBoundsById = new Map();
          for (const overviewFloor of overviewFloors) {
            const floorBoundsPoints: any[] = [];
            for (const floorWall of overviewFloor.scene.walls)
              for (const wallEndpoint of [floorWall.start, floorWall.end]) {
                const $a3 = planToWorldPoint(overviewFloor, wallEndpoint);
                (overviewBoundsBox.expandByPoint(new ns2.Vector3($a3.x, 0, $a3.z)),
                  floorBoundsPoints.push(
                    [$a3.x, 0, $a3.z],
                    [$a3.x, finite2(floorWall.height, 2.8), $a3.z],
                  ));
              }
            floorBoundsById.set(overviewFloor.id, floorBoundsPoints);
          }
          ((overviewStackCenter = (
            overviewBoundsBox.isEmpty()
              ? new ns2.Vector3()
              : overviewBoundsBox.getCenter(new ns2.Vector3())
          ).toArray()),
            (previousOverviewSource = appCtx.studioProject),
            (previousOverviewGap = appCtx.sceneRevisionCount));
        }
        return {
          enabled: appCtx.studioProject?.uniformOverviewStack === true,
          floors: overviewFloors,
          gap: overviewFloorGap,
          bounds: floorBoundsById,
          center: [
            overviewStackCenter[0],
            ((overviewFloors.length - 1) * overviewFloorGap) / 2,
            overviewStackCenter[2],
          ],
          amount: appCtx.animatedTransitionValue ?? (getPreviewFloorMode() === "all" ? 1 : 0),
        };
      },
    })),
      window.addEventListener("pagehide", () => appCtx.overviewStackController?.dispose(), {
        once: true,
      }),
      isEmbedStageMode
        ? ((appCtx.contactShadowController = createContactShadowController2({
            THREE: ns2,
            renderer: appCtx.threeRenderer,
            ...(isEmbeddedStage ? interactionResourcePolicy.contactShadows : {}),
            persistentCache: isEmbeddedStage ? stageStartup2?.shadowCache : null,
            getRoot: () => appCtx.sceneRootNode,
            requestFrame: renderStudioFrame,
            followMotion: true,
            maxCapturesPerSync: isEmbeddedStage ? 1 : Infinity,
            deferSurfaceBake: isEmbeddedStage,
            deferInitialBake: isEmbeddedStage,
            surfaceBatchSize: isEmbeddedStage ? 4 : 2,
            canBuild: canBuildScene,
          })),
          (appCtx.regionLightController = createRegionLightController2({
            THREE: ns2,
            renderer: appCtx.threeRenderer,
            reuseRendererMatrices: isEmbeddedStage && interactionResourcePolicy.reuseLightMatrices,
            scene: appCtx.threeScene,
            getRoot: () => appCtx.sceneRootNode,
            contactShadows: appCtx.contactShadowController,
            requestFrame: renderStudioFrame,
          })))
        : (appCtx.lightPrecompileController = createSpotShadowAtlasController2({
            THREE: ns2,
            renderer: appCtx.threeRenderer,
            scene: appCtx.threeScene,
            camera: appCtx.threeCamera,
            syncBeforeRender: isEmbeddedStage,
            // 嵌入舞台切层时旧楼层还在淡出，保留它的阴影层，避免切层那几帧阴影闪一下。
            retainDetachedFloors: isEmbeddedStage,
            // 图集彻底失败时把原生逐灯阴影重排一遍；否则这些灯会一直停在
            // `castShadow = false`，用户看到的是一整片没有阴影的场景。
            onFallback: (failedRoot: unknown) =>
              setupSceneShadows(failedRoot, {
                rebuildAtlas: false,
              }),
            requestFrame: renderStudioFrame,
            canBuild: () =>
              !document.hidden &&
              !appCtx.pendingRuntimeSettings &&
              !appCtx.isRenderSuppressed &&
              !appCtx.isPrewarming &&
              !appCtx.isCurtainMoving &&
              !appCtx.isVacuumMoving &&
              !appCtx.isBackgroundMoving &&
              !appCtx.isWindowHidden &&
              !appCtx.isCapturingLights &&
              !hasPendingSceneWork(),
          })),
      refreshBaseLighting(),
      (appCtx.resizeObserverInstance = new ResizeObserver(() => resizeStudioRenderer())),
      appCtx.resizeObserverInstance.observe(previewViewportElement),
      updateCameraView());
    let lastStatsPublishMs = performance.now(),
      lastMotionMs = -Infinity;
    const stepStudioFrame = (frameStepTimestamp = performance.now()) => {
      if (!appCtx.threeRenderer) return;
      const frameStepDelta = Math.min(
        Math.max((frameStepTimestamp - lastStatsPublishMs) / 1000, 0),
        0.05,
      );
      if (
        ((lastStatsPublishMs = frameStepTimestamp),
        document.hidden || (isEmbeddedStage && appCtx.isExternalModelPending))
      )
        return Infinity;
      const didControlsUpdate = appCtx.orbitControls.update(frameStepDelta);
      didControlsUpdate && (lastMotionMs = frameStepTimestamp);
      const renderWakeValue = frameStepTimestamp - lastMotionMs < 600 ? 0 : Infinity;
      didControlsUpdate && (appCtx.isLightCacheReady = true);
      const Kt3 = appCtx.isRenderSuppressed || didControlsUpdate || appCtx.isPrewarming;
      if (
        (updateMotionStats(frameStepTimestamp, Kt3),
        !appCtx.isLightCacheReady && !appCtx.isLightCacheDeferred && appCtx.isLightCachePending)
      )
        return renderWakeValue;
      const qr2 = appCtx.isLightCacheReady || !appCtx.isLightCachePending;
      appCtx.isLightCacheReady = appCtx.isLightCacheDeferred = false;
      const yy2 = beginMotionMeasurement(Kt3),
        motionMeasureStartMs = isPerformanceDiagnostics ? performance.now() : 0;
      setShadowFreeze(qr2);
      const motionMeasureMs = isPerformanceDiagnostics
        ? performance.now() - motionMeasureStartMs
        : 0;
      (endMotionMeasurement(yy2),
        recordRenderTiming(frameStepTimestamp, motionMeasureMs, Kt3),
        isPerformanceDiagnostics &&
          renderWakeValue === Infinity &&
          publishRenderStats(frameStepTimestamp, true));
      const render = appCtx.threeRenderer.info.render;
      if (
        ((appCtx.threeRenderer.domElement.dataset.renderCalls = String(render.calls)),
        (appCtx.threeRenderer.domElement.dataset.renderTriangles = String(render.triangles)),
        (appCtx.threeRenderer.domElement.dataset.renderLines = String(render.lines)),
        isEmbeddedStage && (isPerformanceDiagnostics || isRenderStatsTest))
      ) {
        const stringify = JSON.stringify({
          ...appCtx.threeRenderer.info.memory,
          programs: appCtx.threeRenderer.info.programs?.length,
          contact: appCtx.contactShadowController?.stats,
        });
        appCtx.threeRenderer.domElement.dataset.renderResources !== stringify &&
          (appCtx.threeRenderer.domElement.dataset.renderResources = stringify);
      }
      return (
        updateRenderStatsHud(),
        recordFrameTime(),
        (appCtx.isLightCachePending = true),
        isEmbeddedStage && appCtx.threeRenderer.domElement.dispatchEvent(new Event("hb-i3d-camera-frame")),
        renderWakeValue
      );
    };
    {
      appCtx.lightingScheduler = createDemandFrameLoop2({
        onWake() {
          const publishNowMs = performance.now();
          publishNowMs - lastStatsPublishMs > 50 && (lastStatsPublishMs = publishNowMs);
        },
        step(frameStepSeconds: any) {
          const frameStepResult = stepStudioFrame(frameStepSeconds);
          return (
            (appCtx.threeRenderer.domElement.dataset.renderFrameChecks = String(
              appCtx.lightingScheduler.stats.frames,
            )),
            frameStepResult
          );
        },
      });
      const rendererDomElement = appCtx.threeRenderer.domElement;
      let rendererEventsDisposed = false;
      const wakeStudio = () => appCtx.lightingScheduler.wake(),
        handlePageVisibility = () => {
          lastStatsPublishMs = performance.now();
          const tf4 = needsMotionPresentation();
          (appCtx.lightingScheduler.setAvailable(tf4),
            tf4
              ? (appCtx.lightPrecompileController?.setContextLost(false),
                renderStudioFrame(),
                appCtx.isFrameDirty && scheduleStudioRender())
              : (disposeShadowAtlas(),
                appCtx.compiledShaderCache?.clear(),
                window.clearTimeout(appCtx.renderCommitTimeoutId),
                (appCtx.renderCommitTimeoutId = null)));
        },
        handleParentVisibility = (visibilityEvent: any) => {
          ((appCtx.isHighDetailQuality = visibilityEvent.detail === true),
            handlePageVisibility(),
            appCtx.isHighDetailQuality && appCtx.isEnvironmentLoading && scheduleLightPrecompile());
        },
        ev2 = bindFrameDriver(handlePageVisibility);
      rendererDomElement.addEventListener("hb-i3d-parent-visibility", handleParentVisibility);
      for (const visibilityEventName of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "wheel",
        "keydown",
        "keyup",
      ])
        rendererDomElement.addEventListener(visibilityEventName, wakeStudio, {
          passive: true,
        });
      document.addEventListener("visibilitychange", handlePageVisibility);
      disposeRendererEvents = () => {
        if (rendererEventsDisposed) return;
        rendererEventsDisposed = true;
        ev2();
        document.removeEventListener("visibilitychange", handlePageVisibility);
        rendererDomElement.removeEventListener("hb-i3d-parent-visibility", handleParentVisibility);
        for (const removeEventName of [
          "pointerdown",
          "pointermove",
          "pointerup",
          "pointercancel",
          "wheel",
          "keydown",
          "keyup",
        ])
          rendererDomElement.removeEventListener(removeEventName, wakeStudio);
        try {
          appCtx.lightingScheduler?.dispose?.();
          appCtx.lightPrecompileController?.dispose?.();
          appCtx.regionLightController?.dispose?.();
          appCtx.contactShadowController?.dispose?.();
        } catch {
          /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失 */
        }
      };
      // 整页卸载（pagehide）与 SPA 内显式回收都会走到同一个清理函数，重复调用是幂等的。
      window.addEventListener("pagehide", disposeRendererEvents, { once: true });
      handlePageVisibility();
      wakeStudio();
    }
  } catch (frameDriverError: unknown) {
    const frameDriverMessage =
      frameDriverError instanceof Error
        ? frameDriverError.message
        : String(frameDriverError ?? "");
    // 3D 初始化失败（真机上最常见的是 WebView 只给到 WebGL1，或根本没拿到 WebGL 上下文）。
    // 必须同时做两件事，否则用户只会看到整块空白：
    // 1) 在本 iframe 内露出 #webgl-message；
    // 2) 通过 type:"error" 通知宿主走 failSceneLoad —— 舞台 iframe 在 presented 之前是
    //    opacity:0 的，只做 (1) 用户依然一片空白。
    const webglMessageElement = selectElement("#webgl-message") as HTMLElement | null;
    if (webglMessageElement) webglMessageElement.hidden = false;
    if (window.parent !== window) {
      window.parent.postMessage(
        {
          channel: "hb-i3d-v1",
          type: "error",
          message: `3D 画面初始化失败：${frameDriverMessage || "WebGL 上下文不可用"}`,
        },
        window.location.origin,
      );
    }
    window.HomeOSLog?.error?.(frameDriverError, {
      phase: "studio-webgl-init",
    });
    console.error(frameDriverError);
  }

  return disposeRendererEvents;
}
