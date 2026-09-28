/**
 * 自 studio-app.ts 外提的独立单元（Phase A：安全外提）。
 * 对本模块之外的 studio-app.ts 内部零依赖：只引用 import 与自身成员，故不存在循环引用。
 */
import {
  currentPreviewFloorMode,
  selectElement
} from "./studio-plan-render.js";
import { state } from "./studio-state.js";
import * as threeModuleMin from "/static/vendor/three/0.186.0/three.module.min.js";
import {
  PREVIEW_OBJECT_LAYER,
  isRegionLightingEnabled,
  isStageViewerMode
} from "./studio-architecture.js";
import {
  applyBaseLighting,
  externalModelManager,
  invalidateRender,
  precompiledLightSignatures,
  requestRenderFrame,
  scheduleLightCacheBuild,
  scheduleLightPrecompile,
  updateModelLoadingStatus
} from "./studio-render-pipeline.js";
import { targetPixelRatio } from "./studio-render-quality.js";
import { createOrbitControls } from "./studio-camera-presets.js";
import {
  resetCameraView,
  syncCameraModeButtons,
  syncCameraViewButtons
} from "./studio-camera-mode.js";
import { createOverviewStack } from "./studio-overview-stack.js";
import { finite } from "../loaders/studio-normalization.js";
import { floorPointToScenePoint } from "./studio-overview-center.js";
import { createContactShadowController } from "../plan/studio-plan2-contact-shadows.js";
import { createRegionLightController } from "../plan/studio-plan2-region-lights.js";
import { createSpotShadowAtlasController } from "./studio-shadow-atlas.js";
import { handleStageResize } from "./studio-export-dialogs.js";
import { sampleFrameInterval } from "./studio-geometry-utils.js";
import { createDemandFrameLoop } from "../../bridge/frame-loop.js";
import { debugLog } from "../../utils/debug-log.js";

/**
 * 判断这次初始化失败是不是「创建 WebGL 上下文」失败。
 */
export function isWebglContextCreationFailure(stageInitError: any) {
  return /Error creating WebGL context/.test(String(stageInitError?.message || ""));
}

/**
 * 创建 WebGL 上下文的尝试档位，按「要求从高到低」排列。
 *
 * 背景：`GL_VENDOR/RENDERER = Disabled` + `BindToCurrentSequence failed` 表示
 * Chromium 的 GPU 通道建不起来（GPU 进程刚崩、正在重启、被降级，或嵌入式 iframe
 * 里申请高性能独显被拒）。此时继续用同一套高要求参数重试只会一直失败，
 * 而是应该逐档放松要求：先去掉独显要求，再去掉抗锯齿，通常就能建出来。
 */
const WEBGL_CONTEXT_ATTEMPTS: Array<{
  antialias: boolean;
  powerPreference: "high-performance" | "default";
}> = [
  { antialias: true, powerPreference: "high-performance" },
  { antialias: true, powerPreference: "default" },
  { antialias: false, powerPreference: "default" }
];

/**
 * 每档之间的退避（毫秒）：第 N 档失败后，进入第 N+1 档前等这么久。
 * GPU 进程刚崩时上下文会短暂创建不出来，等一会儿往往自愈，所以给一点时间。
 */
const WEBGL_CREATION_RETRY_DELAYS_MS = [800, 2000];

/**
 * 清理一次失败的舞台初始化留下的半成品。
 *
 * 只要渲染器已经建起来（失败点在后半段），画布就已经挂进 `#preview-3d`、上下文也已经
 * 占用。此时若直接重试，会再建一个渲染器 + 一块新画布，把旧的那份连同它的 WebGL
 * 上下文一起晾在原地——既漏上下文，也会出现两块画布叠着。所以重试前必须先清干净。
 */
function disposePartialStageInit() {
  if (!state.renderer) {
    return;
  }
  try {
    state.orbitControls?.dispose?.();
    state.renderer.domElement.remove();
    state.renderer.dispose();
  } catch (stageCleanupError) {
    debugLog("warn", stageCleanupError);
  }
  state.renderer = null;
  state.orbitControls = null;
}

export async function initializeStudioStage({ attempt = 0 } = {}) {
  const stageContainer = selectElement("#preview-3d");
  try {
    state.previewOverlayScene = new threeModuleMin.Scene();
    state.previewCamera = new threeModuleMin.OrthographicCamera(-5, 5, 5, -5, 0.05, 200);
    state.previewCamera.layers.enable(PREVIEW_OBJECT_LAYER);
    // 逐档放松上下文要求：首次要高配（抗锯齿 + 高性能），失败后依次退到默认 GPU、
    // 关抗锯齿，直到建出来为止（档位表见 WEBGL_CONTEXT_ATTEMPTS）。
    const contextAttempt =
      WEBGL_CONTEXT_ATTEMPTS[Math.min(attempt, WEBGL_CONTEXT_ATTEMPTS.length - 1)];
    state.renderer = new threeModuleMin.WebGLRenderer({
      antialias: contextAttempt.antialias,
      alpha: true,
      powerPreference: contextAttempt.powerPreference
    });
    state.renderer.setPixelRatio(targetPixelRatio());
    state.renderer.outputColorSpace = threeModuleMin.SRGBColorSpace;
    state.renderer.toneMapping = threeModuleMin.NeutralToneMapping;
    state.renderer.toneMappingExposure = 1.04;
    state.renderer.shadowMap.enabled = !isRegionLightingEnabled;
    state.renderer.shadowMap.type = threeModuleMin.VSMShadowMap;
    stageContainer.append(state.renderer.domElement);
    state.orbitControls = createOrbitControls(state.previewCamera);
    updateModelLoadingStatus();
    syncCameraModeButtons("orthographic");
    syncCameraViewButtons();
    state.hemisphereLight = new threeModuleMin.HemisphereLight(12504556, 1515053, 1.12);
    state.hemisphereLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.hemisphereLight);
    state.ambientLight = new threeModuleMin.AmbientLight(7175581, 0.42);
    state.ambientLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.ambientLight);
    state.mainDirectionalLight = new threeModuleMin.DirectionalLight(14543103, 2.05);
    state.mainDirectionalLight.position.set(-7, 22, 6);
    state.mainDirectionalLight.castShadow = true;
    state.mainDirectionalLight.shadow.mapSize.set(2048, 2048);
    state.mainDirectionalLight.shadow.camera.left = -20;
    state.mainDirectionalLight.shadow.camera.right = 20;
    state.mainDirectionalLight.shadow.camera.top = 20;
    state.mainDirectionalLight.shadow.camera.bottom = -20;
    state.mainDirectionalLight.shadow.autoUpdate = false;
    state.mainDirectionalLight.shadow.needsUpdate = true;
    state.mainDirectionalLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.mainDirectionalLight);
    state.fillDirectionalLight = new threeModuleMin.DirectionalLight(8886724, 0.72);
    state.fillDirectionalLight.position.set(9, 7, -10);
    state.fillDirectionalLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.fillDirectionalLight);
    state.topDirectionalLight = new threeModuleMin.DirectionalLight(15791103, 0.68);
    state.topDirectionalLight.position.set(0, 16, 1);
    state.topDirectionalLight.layers.enable(PREVIEW_OBJECT_LAYER);
    state.previewOverlayScene.add(state.topDirectionalLight);
    state.previewModelRoot = new threeModuleMin.Group();
    state.previewOverlayScene.add(state.previewModelRoot);
    let overviewLayoutDocument: any;
    let overviewLayoutRevision: any;
    let overviewCenter = [0, 0, 0];
    let overviewBoundsByFloor = new Map();
    state.overviewStackController = createOverviewStack({
      THREE: threeModuleMin,
      renderer: state.renderer,
      scene: state.previewOverlayScene,
      getCamera: () => state.previewCamera,
      getLayout: () => {
        const documentFloors = state.studioDocument?.floors || [];
        const floorGap = state.exportRenderState
          ? finite(state.studioDocument?.exportFloorGap, 3)
          : finite(state.studioDocument?.previewFloorGap, 3);
        if (
          state.studioDocument?.uniformOverviewStack &&
          (overviewLayoutDocument !== state.studioDocument ||
            overviewLayoutRevision !== state.sceneCacheRevision)
        ) {
          const floorsBounds = new threeModuleMin.Box3();
          overviewBoundsByFloor = new Map();
          for (const overviewSourceFloor of documentFloors) {
            const floorWallVertices = [];
            for (const floorWall of overviewSourceFloor.scene.walls) {
              for (const wallPoint of [floorWall.start, floorWall.end]) {
                const floorScenePoint = floorPointToScenePoint(overviewSourceFloor, wallPoint);
                floorsBounds.expandByPoint(
                  new threeModuleMin.Vector3(floorScenePoint.x, 0, floorScenePoint.z)
                );
                floorWallVertices.push(
                  [floorScenePoint.x, 0, floorScenePoint.z],
                  [floorScenePoint.x, finite(floorWall.height, 2.8), floorScenePoint.z]
                );
              }
            }
            overviewBoundsByFloor.set(overviewSourceFloor.id, floorWallVertices);
          }
          overviewCenter = (
            floorsBounds.isEmpty()
              ? new threeModuleMin.Vector3()
              : floorsBounds.getCenter(new threeModuleMin.Vector3())
          ).toArray();
          overviewLayoutDocument = state.studioDocument;
          overviewLayoutRevision = state.sceneCacheRevision;
        }
        return {
          enabled: state.studioDocument?.uniformOverviewStack === true,
          floors: documentFloors,
          gap: floorGap,
          bounds: overviewBoundsByFloor,
          center: [
            overviewCenter[0],
            ((documentFloors.length - 1) * floorGap) / 2,
            overviewCenter[2]
          ],
          amount: state.overviewStackAmount ?? (currentPreviewFloorMode() === "all" ? 1 : 0)
        };
      }
    });
    window.addEventListener("pagehide", () => state.overviewStackController?.dispose(), {
      once: true
    });
    if (isRegionLightingEnabled) {
      state.contactShadowController = createContactShadowController({
        THREE: threeModuleMin,
        renderer: state.renderer,
        getRoot: () => state.previewModelRoot,
        requestFrame: requestRenderFrame,
        canBuild: () =>
          externalModelManager.modelLoadState().active === 0 &&
          externalModelManager.modelLoadState().queued === 0
      });
      state.regionLightController = createRegionLightController({
        THREE: threeModuleMin,
        renderer: state.renderer,
        scene: state.previewOverlayScene,
        getRoot: () => state.previewModelRoot,
        contactShadows: state.contactShadowController,
        requestFrame: requestRenderFrame
      });
    } else {
      state.spotShadowAtlasController = createSpotShadowAtlasController({
        THREE: threeModuleMin,
        renderer: state.renderer,
        scene: state.previewOverlayScene,
        camera: state.previewCamera,
        syncBeforeRender: isStageViewerMode,
        requestFrame: requestRenderFrame,
        canBuild: () =>
          !document.hidden &&
          !state.exportRenderState &&
          !state.isCameraMotionActive &&
          !state.isMotionRendering &&
          !state.isCurtainMoving &&
          !state.isVacuumMoving &&
          !state.isBackgroundFrameVisible &&
          !state.isExportRendering &&
          !state.isLightCacheBuilding &&
          externalModelManager.modelLoadState().active === 0 &&
          externalModelManager.modelLoadState().queued === 0
      });
    }
    applyBaseLighting();
    state.resizeObserver = new ResizeObserver(handleStageResize);
    state.resizeObserver.observe(stageContainer);
    resetCameraView();
    let lastFrameTimeMs = performance.now();
    let lastMotionFrameTimeMs = -Infinity;
    const renderFrame = (rafTimestampMs = performance.now()) => {
      if (!state.renderer) {
        return Infinity;
      }
      const frameDeltaSeconds = Math.min(
        Math.max((rafTimestampMs - lastFrameTimeMs) / 1000, 0),
        0.05
      );
      lastFrameTimeMs = rafTimestampMs;
      if (document.hidden) {
        return Infinity;
      }
      const controlsChanged = state.orbitControls.update(frameDeltaSeconds);
      if (controlsChanged) {
        lastMotionFrameTimeMs = rafTimestampMs;
      }
      const idleDelayMs = rafTimestampMs - lastMotionFrameTimeMs < 600 ? 0 : Infinity;
      if (controlsChanged) {
        state.needsRender = true;
      }
      if (!state.needsRender && state.hasRenderedFrame) {
        return idleDelayMs;
      }
      state.needsRender = false;
      state.renderer.render(state.previewOverlayScene, state.previewCamera);
      sampleFrameInterval();
      state.hasRenderedFrame = true;
      if (isStageViewerMode) {
        state.renderer.domElement.dispatchEvent(new Event("hb-i3d-camera-frame"));
      }
      return idleDelayMs;
    };
    state.demandFrameLoop = createDemandFrameLoop({
      onWake() {
        lastFrameTimeMs = performance.now();
      },
      step(stepTimestampMs) {
        return renderFrame(stepTimestampMs);
      }
    });
    const wakeFrameLoop = () => state.demandFrameLoop.wake();
    const syncFrameLoopAvailability = () => {
      lastFrameTimeMs = performance.now();
      const frameLoopEnabled =
        !document.hidden && state.isFrameLoopAvailable && !state.isWebglContextLost;
      state.demandFrameLoop.setAvailable(frameLoopEnabled);
      if (frameLoopEnabled) {
        requestRenderFrame();
        if (state.needsLightCacheRefresh) {
          scheduleLightCacheBuild();
        }
      } else {
        window.clearTimeout(state.lightCacheSettleTimer);
        state.lightCacheSettleTimer = null;
      }
    };
    /**
     * WebGL 上下文丢失。
     * 必须 `preventDefault()`：不取消该事件浏览器就不会恢复上下文，画布会永久黑掉。
     * 同时停掉帧循环，避免继续往已失效的上下文里提交绘制。
     */
    state.renderer.domElement.addEventListener("webglcontextlost", (webglContextLostEvent: any) => {
      webglContextLostEvent.preventDefault();
      state.isWebglContextLost = true;
      syncFrameLoopAvailability();
      debugLog("warn", "studio-webgl-context-lost");
    });
    /**
     * WebGL 上下文恢复。
     * 上下文丢失会作废全部 GPU 侧资源，而本应用自建的派生缓存不会跟着重建，
     * 不主动作废就会出现「画面能出、但灯光与阴影不对」这类坏状态。
     * 这里按 `invalidateRender` 的标准口径把场景 / 阴影 / 自适应灯光缓存一次性作废并重算，
     * 灯光预编译签名也一并清掉（它记的是「哪套灯已烘焙到位」，此时已不可信）。
     */
    state.renderer.domElement.addEventListener("webglcontextrestored", () => {
      state.isWebglContextLost = false;
      state.appliedLightPrecompileSignature = "";
      precompiledLightSignatures.clear();
      invalidateRender({
        scene: true,
        shadows: true
      });
      scheduleLightPrecompile();
      syncFrameLoopAvailability();
      wakeFrameLoop();
      debugLog("info", "studio-webgl-context-restored");
    });
    if (isStageViewerMode) {
      const handleParentVisibilityChange = (visibilityEvent: any) => {
        state.isFrameLoopAvailable = visibilityEvent.detail === true;
        syncFrameLoopAvailability();
        if (state.isFrameLoopAvailable && state.shouldRerunLightPrecompile) {
          scheduleLightPrecompile();
        }
      };
      state.renderer.domElement.addEventListener(
        "hb-i3d-parent-visibility",
        handleParentVisibilityChange
      );
      for (const eventName of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "wheel",
        "keydown",
        "keyup"
      ]) {
        state.renderer.domElement.addEventListener(eventName, wakeFrameLoop, {
          passive: true
        });
      }
      document.addEventListener("visibilitychange", syncFrameLoopAvailability);
      window.addEventListener(
        "pagehide",
        () => {
          state.demandFrameLoop.dispose();
          document.removeEventListener("visibilitychange", syncFrameLoopAvailability);
          state.spotShadowAtlasController?.dispose?.();
          state.regionLightController?.dispose();
          state.contactShadowController?.dispose();
          state.renderer.domElement.removeEventListener(
            "hb-i3d-parent-visibility",
            handleParentVisibilityChange
          );
          for (const cleanupEventName of [
            "pointerdown",
            "pointermove",
            "pointerup",
            "pointercancel",
            "wheel",
            "keydown",
            "keyup"
          ]) {
            state.renderer.domElement.removeEventListener(cleanupEventName, wakeFrameLoop);
          }
        },
        {
          once: true
        }
      );
      syncFrameLoopAvailability();
      wakeFrameLoop();
    } else {
      for (const eventName of [
        "pointerdown",
        "pointermove",
        "pointerup",
        "pointercancel",
        "wheel",
        "keydown",
        "keyup"
      ]) {
        state.renderer.domElement.addEventListener(eventName, wakeFrameLoop, {
          passive: true
        });
      }
      document.addEventListener("visibilitychange", syncFrameLoopAvailability);
      syncFrameLoopAvailability();
      wakeFrameLoop();
    }
  } catch (webglInitError) {
    // 上下文建不出来时逐档放松要求重试（去独显要求 → 关抗锯齿）：GPU 进程刚崩、
    // 正在重启或被降级时会短暂建不出来，等一会儿并降低要求通常就能建出来。
    if (
      isWebglContextCreationFailure(webglInitError) &&
      !state.renderer &&
      attempt < WEBGL_CONTEXT_ATTEMPTS.length - 1
    ) {
      debugLog("warn", "studio-webgl-context-retry", attempt + 1, webglInitError);
      await new Promise(resolveStageRetry =>
        window.setTimeout(resolveStageRetry, WEBGL_CREATION_RETRY_DELAYS_MS[attempt] ?? 0)
      );
      await initializeStudioStage({
        attempt: attempt + 1
      });
      return;
    }
    const webglMessageElement = selectElement("#webgl-message");
    webglMessageElement.hidden = false;
    window.HABridgeLog?.error?.(webglInitError, {
      phase: "studio-webgl-init"
    });
    debugLog("error", webglInitError);
    // 渲染器根本没建起来时这一页后面每一步都直接用 renderer，继续往下跑只会以
    if (!state.renderer) {
      // 给一个页内重试入口：GPU 进程缓过来（用户关掉其它 3D 页面、或系统恢复）之后，
      // 不必刷新整页就能重试。
      webglMessageElement.textContent =
        "当前浏览器无法创建 3D 画面（显卡资源不足、GPU 进程异常，或已被其它 3D 页面占用）。" +
        "点击此处重试；若仍失败，请关闭其它 3D 页面或重启浏览器。";
      webglMessageElement.setAttribute("role", "button");
      webglMessageElement.setAttribute("tabindex", "0");
      const retryStageInit = () => {
        webglMessageElement.hidden = true;
        webglMessageElement.onclick = null;
        webglMessageElement.onkeydown = null;
        // 防御：万一前一次失败还留着画布 / 上下文，先清掉再重建，避免叠出第二块画布。
        disposePartialStageInit();
        void initializeStudioStage();
      };
      webglMessageElement.onclick = retryStageInit;
      webglMessageElement.onkeydown = (retryKeyEvent: any) => {
        if (retryKeyEvent.key === "Enter" || retryKeyEvent.key === " ") {
          retryKeyEvent.preventDefault();
          retryStageInit();
        }
      };
      throw new Error("当前浏览器无法创建 3D 画面，可能是显卡资源不足或已被其它 3D 页面占用，请关闭后重试。");
    }
  }
}
