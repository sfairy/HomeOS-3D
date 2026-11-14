import { createEffectCache as createEffectCache2 } from '../../studio-effect-cache'
import { createPreviewResourceHandoff as createPreviewResourceHandoff2 } from '../../studio-preview-resources'
import { createContextResourceTracker } from '../../studio-context-resources'
import { createRenderInfoSnapshot, syncRenderInfoDataset } from '../../../render-kit/render-info'
import { urlFlag } from '../../../render-kit/url-flags'

import { createMotionBuffer as createMotionBuffer2 } from '../../scene/studio-motion-buffer'
import { createBackgroundCache as createBackgroundCache2 } from '../../scene/studio-background-cache'
import { stageStartup as stageStartup2 } from '../../../stage-startup'
import {
  interactionResourcePolicy,
  resolveSunShadowMapSize,
  EDITOR_CONTACT_SHADOW_CAPTURES_PER_SYNC,
} from '../../../studio-resource-policy'
import {
  installLightingShaderFailsafe,
  restoreLightingShaderChecksIfReady,
  type LightingShaderFailsafe,
} from '../lights/lighting-shader-failsafe'
import {
  probeWebglAvailability,
  webglUnavailableMessage,
  type WebglAvailability,
} from '@/shared/utils/perf/webgl-availability.util'
import {
  STUDIO_COMPAT_CAPTURES_PER_SYNC,
  STUDIO_COMPAT_NOTICE,
  isStudioCompatMode,
  recordStudioGpuIncident,
  studioCompatModeSource,
} from '../../../studio-gpu-compat'
import { scheduleShaderWarmup } from './studio-shader-compile-warmup'

import { createOverviewStack as createOverviewStack2 } from '../../scene/overview/studio-overview-stack'

import { createWeatherAtmosphereController } from '../lights/weather-atmosphere'
import { installWeatherHostMessages } from '../lights/weather-host-messages'

import { createDemandFrameLoop as createDemandFrameLoop2 } from '../../../../bridge/scene/frame-loop'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'

import { createSpotShadowAtlasController as createSpotShadowAtlasController2 } from '../../scene/shadow/studio-shadow-atlas'
import { createRegionLightController as createRegionLightController2 } from '../../../plan/studio-plan2-region-lights'
import { createContactShadowController as createContactShadowController2 } from '../../../plan/studio-plan2-contact-shadows'
import { finite as finite2 } from '../../../loaders/studio-normalization'

import type { StudioAppContext } from '../studio-app-context'
export interface CreateStudioRendererDeps {
  appCtx: StudioAppContext
  beginMotionMeasurement: any
  bindFrameDriver: any
  canBuildScene: any
  computeRenderPixelRatio: any
  createOrbitControls: any
  disposeShadowAtlas: any
  effectCache: any
  endMotionMeasurement: any
  ensureDiagnosticsHud: any
  getPreviewFloorMode: any
  hasPendingSceneWork: any
  isEmbedStageMode: any
  isEmbeddedStage: any
  isPerformanceDiagnostics: any
  isRenderStatsTest: any
  lampsLayerIndex: any
  needsMotionPresentation: any
  planToWorldPoint: any
  previewResources: any
  publishModelLoadState: any
  publishRenderStats: any
  recordFrameTime: any
  recordRenderTiming: any
  refreshBaseLighting: any
  renderStudioFrame: any
  resizeStudioRenderer: any
  scheduleLightPrecompile: any
  scheduleStudioRender: any
  selectElement: any
  setShadowFreeze: any
  setupSceneShadows: (root: unknown, options?: { rebuildAtlas?: boolean }) => number
  syncCameraModeControls: any
  syncCameraViewControls: any
  updateCameraView: any
  updateMotionStats: any
  updateRenderStatsHud: any
}

/**
 * WebGL 可用性探测结果落日志。
 *
 * 软件光栅化（SwiftShader 等）能出图但帧时间是硬件的几十倍；硬件则留一条 GPU 指纹 ——
 * 线上报「3D 崩了」时第一件要确认的就是到底跑在什么 GPU / 驱动上（同一版本浏览器在
 * 不同 GPU 上表现完全不同）。
 */
function reportWebglAvailability(availability: WebglAvailability): void {
  if (availability.isSoftware) {
    window.HomeOSLog?.warn?.('WebGL 走软件光栅化，3D 画面会明显变慢', {
      phase: 'studio-webgl-software',
      renderer: availability.renderer,
      vendor: availability.vendor,
    })
    return
  }
  window.HomeOSLog?.info?.('GPU 指纹', {
    phase: 'studio-gpu-info',
    api: availability.api,
    renderer: availability.renderer,
    vendor: availability.vendor,
  })
}

/**
 * 建场景前的着色器预热（B12）。
 *
 * 兼容模式跳过：`compileAsync` 会为整个场景一次性并行编译所有 program，是初始化阶段
 * 最大的一笔 GPU 提交，也正是 GPU 看门狗最容易判超时的地方 —— 我们用「后续交互偶尔
 * 编译卡一下」换「不至于把 GPU 进程搞崩」。
 */
function startShaderWarmup(
  renderer: Parameters<typeof scheduleShaderWarmup>[0]['renderer'],
  scene: unknown,
  camera: unknown,
): (() => void) | null {
  if (isStudioCompatMode()) {
    window.HomeOSLog?.warn?.(STUDIO_COMPAT_NOTICE, {
      phase: 'studio-gpu-compat',
      source: studioCompatModeSource(),
    })
    return null
  }
  return scheduleShaderWarmup({ renderer, scene, camera })
}

/**
 * 一次 `sync` 允许烘焙几层接触阴影。
 *
 * 旧实现编辑器是 `Infinity`：多层户型的冷启动会在**一帧**里连做 N 次全屏烘焙
 * （每层一次接触图 + 表面图集）。拆帧对最终画质没有影响（控制器把剩余楼层放回待办
 * 并 requestFrame），只是多几帧才补齐 —— 换来单帧 GPU 提交时长可控。
 */
function resolveContactShadowCaptureCap(isEmbeddedStage: boolean): number {
  if (isEmbeddedStage) return 1
  return isStudioCompatMode() ? STUDIO_COMPAT_CAPTURES_PER_SYNC : EDITOR_CONTACT_SHADOW_CAPTURES_PER_SYNC
}

export function createStudioRenderer(deps: CreateStudioRendererDeps) {
  const {
    appCtx,
    beginMotionMeasurement,
    bindFrameDriver,
    canBuildScene,
    computeRenderPixelRatio,
    createOrbitControls,
    disposeShadowAtlas,
    endMotionMeasurement,
    ensureDiagnosticsHud,
    getPreviewFloorMode,
    hasPendingSceneWork,
    isEmbedStageMode,
    isEmbeddedStage,
    isPerformanceDiagnostics,
    isRenderStatsTest,
    lampsLayerIndex,
    needsMotionPresentation,
    planToWorldPoint,
    publishModelLoadState,
    publishRenderStats,
    recordFrameTime,
    recordRenderTiming,
    refreshBaseLighting,
    renderStudioFrame,
    resizeStudioRenderer,
    scheduleLightPrecompile,
    scheduleStudioRender,
    selectElement,
    setShadowFreeze,
    setupSceneShadows,
    syncCameraModeControls,
    syncCameraViewControls,
    updateCameraView,
    updateMotionStats,
    updateRenderStatsHud,
  } = deps

  let disposeRendererEvents: (() => void) | null = null
  /** B12：presented 前的着色器空闲预热（compileAsync）。 */
  let shaderWarmupCanceller: (() => void) | null = null
  /** 灯光补丁编译兜底（见 `lighting-shader-failsafe.ts`）；渲染器建好之后才注册。 */
  let lightingShaderFailsafe: LightingShaderFailsafe | null = null
  /** 天气消息监听的卸载句柄（见 `installWeatherHostMessages`）。 */
  let disposeWeatherHostMessages: (() => void) | null = null
  const previewViewportElement = selectElement('#preview-3d')
  /**
   * 创建 WebGL 渲染器，失败时逐步降级。
   *
   * 华为 ArkWeb（com.huawei.webview）等设备上，`antialias` + `powerPreference:"high-performance"`
   * 的组合可能直接拿不到上下文，而同一台机器的浏览器却正常 —— 表现为「App 里 3D 整块空白」。
   * 逐级降级能把这类设备救回来，也让失败点更早暴露：三次都失败才抛给外层错误处理。
   *
   * 降级只对「浏览器给 GL，但某些属性拿不到上下文」有意义。浏览器整体禁用 GL 时
   * （Edge 的 GPU 进程连续崩溃后会以 `--use-gl=disabled` 重启，报错里是
   * `GL_VENDOR = Disabled` / `BindToCurrentSequence failed`），三次尝试是三次注定失败的
   * 建上下文 + 六条同样的 three 控制台报错。所以先用 1×1 探针问一次，禁用就立刻
   * 给出可操作文案（`#webgl-message` + `hb-i3d-v1` 的 error），不再制造噪音。
   */
  /**
   * 建渲染器之前的 WebGL 预检；不可用直接抛错（文案面向用户）。
   *
   * 抽成独立函数是为了不给 `createRendererWithFallback` 增加分支：那个函数的三级降级
   * 已经在复杂度棘轮基线上，再加两个 `if` 就会让门禁失败（且它本身已经够长了）。
   */
  function ensureWebglAvailable() {
    const availability = probeWebglAvailability()
    if (!availability.available) {
      // 记一条带时间的故障：同一环境短时间内反复拿不到 GL 时，下次引导直接进兼容模式，
      // 而不是每次都以「最高画质 + 着色器预热」去撞同一堵墙（见 studio-gpu-compat.ts）。
      recordStudioGpuIncident('webgl-unavailable')
      window.HomeOSLog?.warn?.('WebGL 不可用，跳过渲染器创建', {
        phase: 'studio-webgl-unavailable',
        api: availability.api,
        renderer: availability.renderer,
        vendor: availability.vendor,
      })
      throw new Error(webglUnavailableMessage())
    }
    reportWebglAvailability(availability)
  }

  function createRendererWithFallback() {
    ensureWebglAvailable()
    const attempts = [
      { antialias: true, alpha: true, powerPreference: 'high-performance' },
      { antialias: false, alpha: true, powerPreference: 'default' },
      { antialias: false, alpha: true },
    ] as const
    let lastError: unknown = null
    for (let index = 0; index < attempts.length; index += 1) {
      try {
        const renderer = new ns2.WebGLRenderer(attempts[index] as any)
        if (index > 0) {
          window.HomeOSLog?.warn?.('3D 渲染器已降级创建', {
            phase: 'studio-webgl-fallback',
            attempt: index,
          })!
        }
        return renderer
      } catch (rendererError: unknown) {
        lastError = rendererError
        window.HomeOSLog?.warn?.(rendererError, {
          phase: 'studio-webgl-attempt',
          attempt: index,
        })!
      }
    }
    throw lastError || new Error('无法创建 WebGL 渲染器')
  }
  try {
    ;(appCtx.threeScene = new ns2.Scene()),
      (appCtx.threeCamera = new ns2.OrthographicCamera(-5, 5, 5, -5, 0.05, 200)),
      appCtx.threeCamera.layers.enable(lampsLayerIndex),
      (appCtx.threeRenderer = createRendererWithFallback()),
      // 0.8.1：非嵌入舞台（= 编辑态）才追踪上下文资源；嵌入舞台用的是宿主页面共享的渲染上下文。
      isEmbedStageMode || (appCtx.contextResources = createContextResourceTracker(appCtx.threeRenderer)),
      // 灯光补丁的编译兜底会临时打开 checkShaderErrors（见 installLightingShaderFailsafe），
      // 所以舞台上的 `checkShaderErrors = false` 也交给它统一管。
      (lightingShaderFailsafe = installLightingShaderFailsafe({
        appCtx,
        setupSceneShadows,
        scheduleStudioRender,
      })),
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
          'pagehide',
          () => {
            disposeShadowAtlas(), appCtx.shadowAtlasCanvas.dispose()
          },
          {
            once: true,
          },
        )),
      /**
       * 舞台也要方向光阴影（见 `interactionResourcePolicy.stageSunShadow`）。
       *
       * 编辑器走 VSM 图集 + 分层方向光；舞台没有图集，但主方向光本身一直挂着
       * `castShadow = true`，此前只是被 `shadowMap.enabled = false` 一刀关掉。
       * 打开之后墙/地/家具才第一次互相投影 —— 这是「墙面发平」的主因。
       */
      (appCtx.threeRenderer.shadowMap.enabled = !isEmbedStageMode || interactionResourcePolicy.stageSunShadow.enabled),
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
        (deps.previewResources = createPreviewResourceHandoff2((resource: any) => resource?.dispose?.())),
        window.addEventListener(
          'pagehide',
          () => {
            appCtx.compiledShaderCache?.dispose(), deps.effectCache?.dispose(), deps.previewResources?.release()
          },
          {
            once: true,
          },
        )),
      ensureDiagnosticsHud(),
      (appCtx.orbitControls = createOrbitControls(appCtx.threeCamera)),
      publishModelLoadState(),
      syncCameraModeControls('orthographic'),
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
      appCtx.mainDirectionalLight.shadow.mapSize.set(
        resolveSunShadowMapSize(isEmbedStageMode),
        resolveSunShadowMapSize(isEmbedStageMode),
      ),
      isEmbedStageMode &&
        ((appCtx.mainDirectionalLight.shadow.bias = interactionResourcePolicy.stageSunShadow.bias),
        (appCtx.mainDirectionalLight.shadow.normalBias = interactionResourcePolicy.stageSunShadow.normalBias),
        // 静态：只在场景重建（`setupSceneShadows` 会打 needsUpdate）与交互期由
        // `setShadowsEnabled` 放开，日常帧不重渲阴影图。
        (appCtx.threeRenderer.shadowMap.autoUpdate = false)),
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
      /**
       * 天气大气：把天气键换成光照系数（主光 / 环境光 / 曝光 / 雾）。
       *
       * 建在灯光之后、`refreshBaseLighting()` 之前 —— 后者的末尾会调用
       * `refreshBaseline()` 抓一份「未被天气改过」的基线，天气系数永远乘在它上面。
       * 每次应用都要重绘，而舞台的静态帧缓存按「相机 + 曝光」签名，所以只清缓存、
       * 让下一帧重捕，不在这里直接调 render。
       */
      (appCtx.weatherAtmosphere = createWeatherAtmosphereController({
        appCtx,
        THREE: ns2,
        /**
         * 重绘一步：走「**不重算阴影**」的那条路径。
         *
         * 这里连踩三次性能坑，最终定位在阴影上：
         * 1. `effectCache.invalidate()` + `isCacheReady=false` → 每步重抓地面反射与
         *    接触阴影，舞台掉到 **1.8fps**。
         * 2. `compiledShaderCache.clear()` → 背景层整块重画，p95 仍有 75ms。
         * 3. 看起来最合理的 `isLightCacheReady = true`（= `renderStudioFrame()` 语义）
         *    其实会让帧循环走 `setShadowFreeze(true)`，**每次都重渲整套 VSM 阴影图**，
         *    实测连续放电时 p95 141ms、峰值 225ms。
         *
         * 现在用 `isLightCacheDeferred`：帧循环判定 `qr2 = ready || !pending` 为 false，
         * 于是 `setShadowFreeze(false)` —— 只重画整帧、不动阴影。阴影图是深度图，
         * 曝光与灯光亮度本来就不参与，天气改的正是这两样，所以画面完全正确。
         */
        requestRender: () => {
          appCtx.isLightCacheReady = false
          appCtx.isLightCacheDeferred = true
          appCtx.isLightCachePending = true
          appCtx.lightingScheduler?.wake?.()
        },
      })),
      (disposeWeatherHostMessages = installWeatherHostMessages(appCtx)),
      (appCtx.sceneRootNode = new ns2.Group()),
      appCtx.threeScene.add(appCtx.sceneRootNode)
    let previousOverviewSource: any,
      previousOverviewGap: any,
      overviewStackCenter = [0, 0, 0],
      floorBoundsById = new Map()
    ;(appCtx.overviewStackController = createOverviewStack2({
      THREE: ns2,
      renderer: appCtx.threeRenderer,
      scene: appCtx.threeScene,
      getCamera: () => appCtx.threeCamera,
      getLayout: () => {
        const overviewFloors = appCtx.studioProject?.floors || [],
          overviewFloorGap = appCtx.pendingRuntimeSettings
            ? finite2(appCtx.studioProject?.exportFloorGap, 3)
            : finite2(appCtx.studioProject?.previewFloorGap, 3)
        if (
          appCtx.studioProject?.uniformOverviewStack &&
          (previousOverviewSource !== appCtx.studioProject || previousOverviewGap !== appCtx.sceneRevisionCount)
        ) {
          const overviewBoundsBox = new ns2.Box3()
          floorBoundsById = new Map()
          for (const overviewFloor of overviewFloors) {
            const floorBoundsPoints: any[] = []
            for (const floorWall of overviewFloor.scene.walls)
              for (const wallEndpoint of [floorWall.start, floorWall.end]) {
                const $a3 = planToWorldPoint(overviewFloor, wallEndpoint)
                overviewBoundsBox.expandByPoint(new ns2.Vector3($a3.x, 0, $a3.z)),
                  floorBoundsPoints.push([$a3.x, 0, $a3.z], [$a3.x, finite2(floorWall.height, 2.8), $a3.z])
              }
            floorBoundsById.set(overviewFloor.id, floorBoundsPoints)
          }
          ;(overviewStackCenter = (
            overviewBoundsBox.isEmpty() ? new ns2.Vector3() : overviewBoundsBox.getCenter(new ns2.Vector3())
          ).toArray()),
            (previousOverviewSource = appCtx.studioProject),
            (previousOverviewGap = appCtx.sceneRevisionCount)
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
          amount: appCtx.animatedTransitionValue ?? (getPreviewFloorMode() === 'all' ? 1 : 0),
        }
      },
    })),
      window.addEventListener('pagehide', () => appCtx.overviewStackController?.dispose(), {
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
            maxCapturesPerSync: resolveContactShadowCaptureCap(isEmbeddedStage),
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
          })),
          // 控制器建好就先把当前的太阳方向 / 阴影浓度灌进去：`refreshBaseLighting` 可能
          // 在它之前就跑过一次（那时还没有 controller），不补这一下，首帧墙面会按
          // uniform 的缺省方向算朝向，切层后也不会自己纠正。
          appCtx.mainDirectionalLight &&
            (appCtx.regionLightController.setSunDirection(
              appCtx.mainDirectionalLight.position.x,
              appCtx.mainDirectionalLight.position.y,
              appCtx.mainDirectionalLight.position.z,
            ),
            appCtx.regionLightController.setSunShadowScale(appCtx.mainDirectionalLight.shadow?.intensity ?? 0.18)))
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
      updateCameraView()
    let lastStatsPublishMs = performance.now(),
      lastMotionMs = -Infinity
    const lastRenderInfo = createRenderInfoSnapshot()
    const stepStudioFrame = (frameStepTimestamp = performance.now()) => {
      if (!appCtx.threeRenderer) return
      restoreLightingShaderChecksIfReady(appCtx, lightingShaderFailsafe)
      const frameStepDelta = Math.min(Math.max((frameStepTimestamp - lastStatsPublishMs) / 1000, 0), 0.05)
      if (
        ((lastStatsPublishMs = frameStepTimestamp),
        document.hidden || (isEmbeddedStage && appCtx.isExternalModelPending))
      )
        return Infinity
      const didControlsUpdate = appCtx.orbitControls.update(frameStepDelta)
      didControlsUpdate && (lastMotionMs = frameStepTimestamp)
      const renderWakeValue = frameStepTimestamp - lastMotionMs < 600 ? 0 : Infinity
      didControlsUpdate && (appCtx.isLightCacheReady = true)
      const Kt3 = appCtx.isRenderSuppressed || didControlsUpdate || appCtx.isPrewarming
      if (
        (updateMotionStats(frameStepTimestamp, Kt3),
        !appCtx.isLightCacheReady && !appCtx.isLightCacheDeferred && appCtx.isLightCachePending)
      )
        return renderWakeValue
      const qr2 = appCtx.isLightCacheReady || !appCtx.isLightCachePending
      appCtx.isLightCacheReady = appCtx.isLightCacheDeferred = false
      const yy2 = beginMotionMeasurement(Kt3),
        motionMeasureStartMs = isPerformanceDiagnostics ? performance.now() : 0
      setShadowFreeze(qr2)
      const motionMeasureMs = isPerformanceDiagnostics ? performance.now() - motionMeasureStartMs : 0
      endMotionMeasurement(yy2),
        recordRenderTiming(frameStepTimestamp, motionMeasureMs, Kt3),
        isPerformanceDiagnostics && renderWakeValue === Infinity && publishRenderStats(frameStepTimestamp, true)
      const render = appCtx.threeRenderer.info.render
      if (
        (syncRenderInfoDataset(appCtx.threeRenderer.domElement.dataset, render, lastRenderInfo),
        isEmbeddedStage && (isPerformanceDiagnostics || isRenderStatsTest))
      ) {
        const stringify = JSON.stringify({
          ...appCtx.threeRenderer.info.memory,
          programs: appCtx.threeRenderer.info.programs?.length,
          contact: appCtx.contactShadowController?.stats,
        })
        appCtx.threeRenderer.domElement.dataset.renderResources !== stringify &&
          (appCtx.threeRenderer.domElement.dataset.renderResources = stringify)
      }
      return (
        updateRenderStatsHud(),
        recordFrameTime(),
        (appCtx.isLightCachePending = true),
        isEmbeddedStage && appCtx.threeRenderer.domElement.dispatchEvent(new Event('hb-i3d-camera-frame')),
        renderWakeValue
      )
    }
    {
      appCtx.lightingScheduler = createDemandFrameLoop2({
        // 0.8.4：按推进间隔对齐截止时间（舞台侧同款），避免 setTimeout 抖动顶帧。
        alignDeadlines: true,
        // 默认 60；`?max-fps=120` 在高刷屏上做真机 A/B（天气画质阈值按 60 帧间隔标定）。
        maxFps: Number(urlFlag('max-fps')) || 60,
        onWake() {
          const publishNowMs = performance.now()
          publishNowMs - lastStatsPublishMs > 50 && (lastStatsPublishMs = publishNowMs)
        },
        step(frameStepSeconds: any) {
          // 分类过渡期间顺带记录 GL 帧耗时（没有采样会话时为 null，`render()` 直接忽略）。
          const categoryFrameStartedAt = appCtx.categoryDiagnostics?.startFrame?.() ?? null
          const frameStepResult = stepStudioFrame(frameStepSeconds)
          appCtx.categoryDiagnostics?.render?.(categoryFrameStartedAt, {
            calls: appCtx.threeRenderer?.info?.render?.calls ?? 0,
          })
          return (
            (appCtx.threeRenderer.domElement.dataset.renderFrameChecks = String(appCtx.lightingScheduler.stats.frames)),
            frameStepResult
          )
        },
      })
      const rendererDomElement = appCtx.threeRenderer.domElement
      let rendererEventsDisposed = false
      const wakeStudio = () => appCtx.lightingScheduler.wake(),
        handlePageVisibility = () => {
          lastStatsPublishMs = performance.now()
          const tf4 = needsMotionPresentation()
          appCtx.lightingScheduler.setAvailable(tf4),
            tf4
              ? (appCtx.lightPrecompileController?.setContextLost(false),
                renderStudioFrame(),
                appCtx.isFrameDirty && scheduleStudioRender())
              : (disposeShadowAtlas(),
                appCtx.compiledShaderCache?.clear(),
                window.clearTimeout(appCtx.renderCommitTimeoutId),
                (appCtx.renderCommitTimeoutId = null))
        },
        handleParentVisibility = (visibilityEvent: any) => {
          ;(appCtx.isHighDetailQuality = visibilityEvent.detail === true),
            handlePageVisibility(),
            appCtx.isHighDetailQuality && appCtx.isEnvironmentLoading && scheduleLightPrecompile()
        },
        ev2 = bindFrameDriver(handlePageVisibility)
      rendererDomElement.addEventListener('hb-i3d-parent-visibility', handleParentVisibility)
      for (const visibilityEventName of [
        'pointerdown',
        'pointermove',
        'pointerup',
        'pointercancel',
        'wheel',
        'keydown',
        'keyup',
      ])
        rendererDomElement.addEventListener(visibilityEventName, wakeStudio, {
          passive: true,
        })
      document.addEventListener('visibilitychange', handlePageVisibility)
      disposeRendererEvents = () => {
        if (rendererEventsDisposed) return
        rendererEventsDisposed = true
        ev2()
        document.removeEventListener('visibilitychange', handlePageVisibility)
        rendererDomElement.removeEventListener('hb-i3d-parent-visibility', handleParentVisibility)
        for (const removeEventName of [
          'pointerdown',
          'pointermove',
          'pointerup',
          'pointercancel',
          'wheel',
          'keydown',
          'keyup',
        ])
          rendererDomElement.removeEventListener(removeEventName, wakeStudio)
        try {
          appCtx.lightingScheduler?.dispose?.()
          appCtx.lightPrecompileController?.dispose?.()
          appCtx.regionLightController?.dispose?.()
          appCtx.contactShadowController?.dispose?.()
          // 兜底注册的 onShaderError 闭包住整个 appCtx；不注销会在下一次引导里留着旧 handler。
          lightingShaderFailsafe?.dispose(), (lightingShaderFailsafe = null)
          shaderWarmupCanceller?.(), (shaderWarmupCanceller = null)
          disposeWeatherHostMessages?.(), (disposeWeatherHostMessages = null)
          appCtx.weatherAtmosphere?.dispose?.(), (appCtx.weatherAtmosphere = null)
        } catch {
          /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失 */
        }
      }
      // 整页卸载（pagehide）与 SPA 内显式回收都会走到同一个清理函数，重复调用是幂等的。
      window.addEventListener('pagehide', disposeRendererEvents, { once: true })
      // B12：先让首帧出画，再在空闲时用 compileAsync 预热着色器，减少后续交互的编译卡顿。
      shaderWarmupCanceller = startShaderWarmup(appCtx.threeRenderer, appCtx.threeScene, appCtx.threeCamera)
      handlePageVisibility()
      wakeStudio()
    }
  } catch (frameDriverError: unknown) {
    const frameDriverMessage =
      frameDriverError instanceof Error ? frameDriverError.message : String(frameDriverError ?? '')
    // 3D 初始化失败（真机上最常见的是 WebView 只给到 WebGL1，或根本没拿到 WebGL 上下文）。
    // 必须同时做两件事，否则用户只会看到整块空白：
    // 1) 在本 iframe 内露出 #webgl-message；
    // 2) 通过 type:"error" 通知宿主走 failSceneLoad —— 舞台 iframe 在 presented 之前是
    //    opacity:0 的，只做 (1) 用户依然一片空白。
    const webglMessageElement = selectElement('#webgl-message') as HTMLElement | null
    if (webglMessageElement) webglMessageElement.hidden = false
    if (window.parent !== window) {
      window.parent.postMessage(
        {
          channel: 'hb-i3d-v1',
          type: 'error',
          message: `3D 画面初始化失败：${frameDriverMessage || 'WebGL 上下文不可用'}`,
        },
        window.location.origin,
      )
    }
    window.HomeOSLog?.error?.(frameDriverError, {
      phase: 'studio-webgl-init',
    })
    console.error(frameDriverError)
    // 引导中途中止时渲染器可能已经建好：兜底 handler 也一并撤掉，避免挂到废弃上下文上。
    lightingShaderFailsafe?.dispose(), (lightingShaderFailsafe = null)
    disposeWeatherHostMessages?.(), (disposeWeatherHostMessages = null)
  }

  return disposeRendererEvents
}
