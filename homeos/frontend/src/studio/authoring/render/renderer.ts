import { sha256 as sha2562, stableCacheJSON as stableCacheJSON2 } from '@app/bridge/scene/render-cache'
import { type StudioAppContext } from '../app-context'
import { createEffectCache as createEffectCache2 } from '../studio-effect-cache'
import { createPreviewResourceHandoff as createPreviewResourceHandoff2 } from '../studio-preview-resources'
import { createContextResourceTracker } from '../studio-context-resources'
import { createRenderInfoSnapshot, syncRenderInfoDataset } from '../render-kit/render-info'
import { urlFlag } from '../render-kit/url-flags'
import { createMotionBuffer as createMotionBuffer2 } from '../scene/studio-motion-buffer'
import { createBackgroundCache as createBackgroundCache2 } from '../scene/studio-background-cache'
import { stageStartup as stageStartup2 } from '../stage-startup'
import {
  interactionResourcePolicy,
  resolveSunShadowMapSize,
  EDITOR_CONTACT_SHADOW_CAPTURES_PER_SYNC,
} from '../studio-resource-policy'
import {
  installLightingShaderFailsafe,
  restoreLightingShaderChecksIfReady,
  type LightingShaderFailsafe,
} from '../lights/lighting'
import {
  probeWebglAvailability,
  webglUnavailableMessage,
  type WebglAvailability,
} from '@/kernel/perf/webgl-availability'
import {
  STUDIO_COMPAT_CAPTURES_PER_SYNC,
  STUDIO_COMPAT_NOTICE,
  isStudioCompatMode,
  recordStudioGpuIncident,
  studioCompatModeSource,
} from '../studio-gpu-compat'
import { scheduleShaderWarmup } from './studio-shader-compile-warmup'
import { createOverviewStack as createOverviewStack2 } from '../scene/overview/studio-overview-stack'
import { createWeatherAtmosphereController, installWeatherHostMessages } from '../lights/weather-atmosphere'
import { createDemandFrameLoop as createDemandFrameLoop2 } from '@app/bridge/scene/frame-loop'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { createSpotShadowAtlasController as createSpotShadowAtlasController2 } from '../scene/shadow/studio-shadow-atlas'
import { createRegionLightController as createRegionLightController2 } from '../plan/studio-plan2-region'
import { createContactShadowController as createContactShadowController2 } from '../plan/studio-plan2-contact-shadows'
import { finite as finite2 } from '../loaders/studio-normalization'
import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { clamp as clamp2 } from '../plan/geometry'
import { syncControlValue as syncControlValue2 } from '../ui/ui-controls'
import { disposeStudioFonts } from '../boot/studio-boot'
import { releaseMetalEnvironmentTextures } from '../materials/studio-metal-environment'
import { releaseSurfaceDetailTextures } from '../materials/studio-surface'
import { releaseSurfaceStyleTextures } from '../materials/studio-surface'
import { disposeOverlapAndPreview } from '../ui/wiring'

export interface AcquireRenderSurfaceDeps {
  appCtx: StudioAppContext
  collectLampEntries: any
  drawToActiveSurface: any
  ensureLightCache: any
  hasPendingSceneWork: any
  previewLightCacheCanvasElement: any
  renderCacheWriter: any
  requestStudioRender: any
  sceneCacheDescriptor: any
  scheduleStudioRender: any
  setFadeOverlay: any
  showCachedLights: any
}

export async function acquireRenderSurface(deps: AcquireRenderSurfaceDeps) {
  const {
    appCtx,
    collectLampEntries,
    drawToActiveSurface,
    ensureLightCache,
    hasPendingSceneWork,
    previewLightCacheCanvasElement,
    renderCacheWriter,
    requestStudioRender,
    sceneCacheDescriptor,
    scheduleStudioRender,
    setFadeOverlay,
    showCachedLights,
  } = deps

  if (
    ((appCtx.renderCommitTimeoutId = null),
    appCtx.isDisposed ||
      !appCtx.isHighDetailQuality ||
      renderCacheWriter?.closed ||
      !appCtx.threeRenderer ||
      appCtx.pendingRuntimeSettings ||
      appCtx.isRenderSuppressed ||
      appCtx.isWindowHidden ||
      appCtx.isCapturingLights ||
      appCtx.prewarmState ||
      appCtx.isPrewarming ||
      appCtx.isCurtainMoving ||
      appCtx.isVacuumMoving ||
      appCtx.isBackgroundMoving ||
      appCtx.isPrecompilePending)
  )
    return
  if (
    hasPendingSceneWork() ||
    appCtx.lightPrecompileController?.isBuilding() ||
    appCtx.lightPrecompileController?.isPending()
  ) {
    scheduleStudioRender(120)
    return
  }
  const domElement4 = appCtx.threeRenderer.domElement,
    width4 = domElement4.width,
    height4 = domElement4.height
  if (!width4 || !height4) return
  const Et2 = appCtx.modelRevisionCounter,
    shouldAbortSurface = () =>
      !appCtx.isDisposed &&
      appCtx.isHighDetailQuality &&
      !renderCacheWriter?.closed &&
      !hasPendingSceneWork() &&
      Et2 === appCtx.modelRevisionCounter &&
      !appCtx.pendingRuntimeSettings &&
      !appCtx.isRenderSuppressed &&
      !appCtx.isWindowHidden &&
      !appCtx.prewarmState &&
      !appCtx.isPrewarming &&
      !appCtx.isCurtainMoving &&
      !appCtx.isVacuumMoving &&
      !appCtx.isBackgroundMoving &&
      !appCtx.isPrecompilePending
  appCtx.isCapturingLights = true
  let acquiredSurfaceCanvas: any,
    previousSurfaceCanvas: any = null,
    surfaceKey,
    isSurfaceSuspended = false
  try {
    const fr2 = collectLampEntries(),
      surfaceRequestKey = sha2562(
        stableCacheJSON2({
          kind: 'settled-rgba-v1',
          base: sceneCacheDescriptor(width4, height4),
          lights: fr2.map(({ item: lightEntryItem, itemKey: lightEntryKey, group: lightEntryGroup }: any) => ({
            key: lightEntryKey,
            enabled: lightEntryGroup?.enabled !== false,
            brightness: lightEntryItem.lightBrightness,
            temperature: lightEntryItem.lightTemperature,
            color: lightEntryItem.lightColorRgb || null,
          })),
        }),
      )
    if (
      ((surfaceKey = surfaceRequestKey),
      (acquiredSurfaceCanvas = await renderCacheWriter?.acquire(
        surfaceRequestKey,
        width4,
        height4,
        shouldAbortSurface,
      )),
      !shouldAbortSurface())
    )
      return
    if (!acquiredSurfaceCanvas) {
      const jl2 = ensureLightCache(fr2)
      showCachedLights(jl2),
        requestStudioRender(),
        appCtx.threeRenderer.render(appCtx.threeScene, appCtx.threeCamera),
        (acquiredSurfaceCanvas = document.createElement('canvas')),
        (previousSurfaceCanvas = acquiredSurfaceCanvas),
        (acquiredSurfaceCanvas.width = width4),
        (acquiredSurfaceCanvas.height = height4)
      const context = acquiredSurfaceCanvas.getContext('2d')
      if (!context) throw new Error('当前浏览器无法创建静止画面缓存。')
      context.drawImage(domElement4, 0, 0)
    }
    if (!shouldAbortSurface()) return
    const snapshotSurfacePainter = previewLightCacheCanvasElement.getContext('2d')
    if (!snapshotSurfacePainter) throw new Error('当前浏览器无法创建静止画面缓存。')
    ;(previewLightCacheCanvasElement.width = width4),
      (previewLightCacheCanvasElement.height = height4),
      snapshotSurfacePainter.clearRect(0, 0, width4, height4),
      snapshotSurfacePainter.drawImage(acquiredSurfaceCanvas.image || acquiredSurfaceCanvas, 0, 0),
      appCtx.lightGroupCacheByFloor.clear(),
      appCtx.lightGainByFloor.clear(),
      (appCtx.isCacheReady = true),
      (appCtx.isFrameDirty = false),
      (domElement4.dataset.lightCachePixels = String(width4 * height4)),
      (domElement4.dataset.lightCacheRetainedGroups = 'complete-frame'),
      setFadeOverlay(true),
      previousSurfaceCanvas &&
        (drawToActiveSurface(surfaceKey, previousSurfaceCanvas, shouldAbortSurface), (previousSurfaceCanvas = null))
  } catch (snapshotError: any) {
    ;(isSurfaceSuspended = true),
      setFadeOverlay(false),
      window.HomeOSLog?.error!(snapshotError, {
        phase: 'interaction3d-settled-cache',
      })!
  } finally {
    try {
      acquiredSurfaceCanvas?.close?.(),
        previousSurfaceCanvas && (previousSurfaceCanvas.width = previousSurfaceCanvas.height = 0)
    } finally {
      appCtx.isCapturingLights = false
    }
    appCtx.isFrameDirty && (!isSurfaceSuspended || Et2 !== appCtx.modelRevisionCounter) && scheduleStudioRender(420)
  }
}

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
  /**
   * 每帧画完重算 3D 编辑叠层（0.8.7 渲染函数末尾的 `overlay.update()`）。
   * 灯位圆点是「世界坐标 × 当前相机」的投影；挂在 orbitControls 的 `change` 上不够 ——
   * 相机模式切换会 dispose 并重建 controls，旧监听静默失效，圆点就停在旧位置。
   */
  refreshEditorOverlay: () => void
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

/**
 * 让「每一次主画面出图」都顺带刷新一次 3D 编辑叠层。
 *
 * 为什么包 `renderer.render` 而不是挂在帧循环 / `orbitControls` 事件上：
 * - 帧循环尾部会在 `isLightCachePending` 的分支里提前返回，叠层就漏刷；
 * - `orbitControls` 在相机模式切换时会被 dispose 重建，旧实例上的监听静默失效；
 * - 直接 `renderStudioFrame` / 灯光缓存 / 静止画面缓存都不经过帧循环。
 * 而**画面变了叠层必须变**，所以唯一可靠的锚点就是「主相机出图」这一件事本身。
 * 子相机（阴影图集 / 反射探针 / 导出用的离屏相机）与 render target 出图一律跳过。
 */
function installOverlayRefreshHook(
  appCtx: {
    threeRenderer: {
      render: (scene: unknown, camera: unknown) => unknown
      getRenderTarget?: () => unknown
    }
    threeCamera: unknown
  },
  refresh: () => void,
): void {
  const renderer = appCtx.threeRenderer
  if (!renderer || typeof renderer.render !== 'function') return
  const baseRender = renderer.render.bind(renderer)
  renderer.render = (scene: unknown, camera: unknown) => {
    const result = baseRender(scene, camera)
    // 只在「主相机 → 屏幕」这一路刷新；shadow atlas / 反射 / 导出都用自己的相机或帧缓冲。
    if (camera === appCtx.threeCamera && !renderer.getRenderTarget?.())
      // 叠层是纯 DOM：它出错绝不能把 3D 出帧一起带崩（否则表现为「转一下画面就停了」）。
      try {
        refresh()
      } catch (overlayError) {
        console.warn('[studio] 编辑叠层刷新失败', overlayError)
      }
    return result
  }
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
    refreshEditorOverlay,
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
  /**
   * 本实例登记的 `pagehide` 监听（具名 + 可摘）。
   *
   * SPA 路由切换**不**触发 `pagehide`：匿名 `once` 闭包一旦挂上就再也摘不掉，
   * 会把 `appCtx`（含整份户型文档）与 `deps`（闭包着整个引导作用域）一起钉住 ——
   * 之后即使所有资源都正确释放，它们也仍然是可达对象。统一走这里登记，
   * `disposeRendererEvents` 与引导失败分支对称摘除。
   */
  const pageHideCleanups: Array<() => void> = []
  function registerPageHide(handler: () => void): void {
    const listener = () => handler()
    window.addEventListener('pagehide', listener, { once: true })
    pageHideCleanups.push(() => window.removeEventListener('pagehide', listener))
  }
  function removePageHideListeners(): void {
    for (const removeListener of pageHideCleanups.splice(0)) {
      try {
        removeListener()
      } catch {
        /* 宿主已拆时 remove 可能抛，忽略 */
      }
    }
  }
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
   * 已经够长了，再加两个 `if` 会读不出降级顺序。
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
      // 0.8.7 在渲染函数末尾统一刷一次编辑叠层（灯位圆点 / 圆环 / 高度手柄）。
      // 这里包住 `render` 建立同一个不变量：**画面更新 ⇒ 叠层更新**，与走哪条渲染路径无关
      // （帧循环、直接 `renderStudioFrame`、灯光缓存、静止画面缓存）。
      installOverlayRefreshHook(appCtx, refreshEditorOverlay),
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
        registerPageHide(() => {
          disposeShadowAtlas(), appCtx.shadowAtlasCanvas.dispose()
        })),
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
        registerPageHide(() => {
          appCtx.compiledShaderCache?.dispose(), deps.effectCache?.dispose(), deps.previewResources?.release()
        })),
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

    /**
     * 建 / 换光影管线（0.8.9）。
     *
     * 两条管线互斥，**不能并存**：轻量柔光会在 `scene.onBeforeRender` 里换掉受光面材质，
     * 标准光影的聚光灯阴影图集则按逐灯投影另算一套；同时存在会得到「双倍亮度 + 两套阴影」。
     * 所以切换时先把旧的 `dispose()`（它会还原换掉的材质），再建新的。
     *
     * `useRegion` 由**调用时刻**决定，不是创建时的闭包值：绘制页切换会再次调进来。
     */
    function setupLightingPipeline(useRegion: boolean) {
      appCtx.lightPrecompileController?.dispose?.()
      appCtx.regionLightController?.dispose?.()
      appCtx.contactShadowController?.dispose?.()
      ;(appCtx.lightPrecompileController = null),
        (appCtx.regionLightController = null),
        (appCtx.contactShadowController = null)
      if (!useRegion) {
        appCtx.lightPrecompileController = createSpotShadowAtlasController2({
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
        })
        return
      }
      appCtx.contactShadowController = createContactShadowController2({
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
      })
      appCtx.regionLightController = createRegionLightController2({
        THREE: ns2,
        renderer: appCtx.threeRenderer,
        reuseRendererMatrices: isEmbeddedStage && interactionResourcePolicy.reuseLightMatrices,
        scene: appCtx.threeScene,
        getRoot: () => appCtx.sceneRootNode,
        contactShadows: appCtx.contactShadowController,
        requestFrame: renderStudioFrame,
      })
      // 控制器建好就先把当前的太阳方向 / 阴影浓度灌进去：`refreshBaseLighting` 可能
      // 在它之前就跑过一次（那时还没有 controller），不补这一下，首帧墙面会按
      // uniform 的缺省方向算朝向，切层后也不会自己纠正。
      if (appCtx.mainDirectionalLight) {
        appCtx.regionLightController.setSunDirection(
          appCtx.mainDirectionalLight.position.x,
          appCtx.mainDirectionalLight.position.y,
          appCtx.mainDirectionalLight.position.z,
        )
        appCtx.regionLightController.setSunShadowScale(appCtx.mainDirectionalLight.shadow?.intensity ?? 0.18)
      }
    }

    /**
     * 供绘制页切换光影模式：换管线 + 让调用方重建灯光层（灯光要重新注册）。
     *
     * `options.render === false` 给「换完管线马上要整场景重建」的调用方用：换管线时旧控制器
     * 已 `dispose()`、新控制器还没有任何灯注册，此刻画一帧就是**一盏灯都没有**的中转画面
     * （区域模式下是整片只剩环境项的灰面）。上游 `wh()` 在同一个任务里紧接着 `Jn(A0())`
     * 重建，中间不渲染；这里用这个开关表达同一件事。
     */
    appCtx.applyLightingPipeline = (mode: 'standard' | 'region', options?: { render?: boolean }) => {
      appCtx.previewLightingMode = mode
      setupLightingPipeline(isEmbedStageMode || mode === 'region')
      refreshBaseLighting()
      options?.render === false || renderStudioFrame()
    }

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
      registerPageHide(() => appCtx.overviewStackController?.dispose()),
      // 0.8.9：光影管线可切换（绘制页的「标准光影 / 轻量柔光」）。
      // 嵌入舞台仍由 `isEmbedStageMode` 固定；绘制页初值取户型草稿里的 `lightingMode`。
      setupLightingPipeline(isEmbedStageMode || appCtx.previewLightingMode === 'region'),
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
        // 先摘本实例登记过的 pagehide（含它自己）：否则闭包把 appCtx / deps 钉住。
        removePageHideListeners()
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
      registerPageHide(disposeRendererEvents)
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
    removePageHideListeners()
    // 上下文资源追踪器给 `EventDispatcher.prototype.addEventListener` 装了引用计数补丁：
    // 不在失败分支里还原，整个页面会一直带着这个补丁，并继续收集后续渲染器的资源。
    try {
      appCtx.contextResources?.dispose?.()
    } catch {
      /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失 */
    }
    appCtx.contextResources = null
    lightingShaderFailsafe?.dispose(), (lightingShaderFailsafe = null)
    disposeWeatherHostMessages?.(), (disposeWeatherHostMessages = null)
  }

  return disposeRendererEvents
}

export function refreshFloorControls(runtime: StudioAppRuntime) {
  const hasMultipleFloors = (runtime.appCtx.studioProject?.floors.length || 0) > 1,
    isOverviewMode = runtime.getPreviewFloorMode() === 'all'
  ;(runtime.floorCameraActionsElement.hidden = isOverviewMode),
    (runtime.overviewCameraActionsElement.hidden = !hasMultipleFloors || !isOverviewMode),
    (runtime.previewFloorGapControlElement.hidden = !hasMultipleFloors || !isOverviewMode),
    syncControlValue2(
      runtime.previewFloorGapInput,
      finite2(runtime.appCtx.studioProject?.previewFloorGap, 3).toFixed(1),
    ),
    (runtime.previewFloorUniformControlElement.hidden = !hasMultipleFloors || !isOverviewMode),
    (runtime.previewFloorUniformInput.checked = runtime.appCtx.studioProject?.uniformOverviewStack === true)
  const hasSavedFloorView = !!runtime.appCtx.studioState.settings?.fixedCameraView,
    hasSavedOverviewView = !!runtime.appCtx.studioProject?.combinedFixedCameraView
  ;(runtime.fixedCameraViewButton.disabled = !hasSavedFloorView),
    runtime.fixedCameraViewButton.classList.toggle('has-saved-view', hasSavedFloorView),
    (runtime.fixedOverviewViewButton.disabled = !hasSavedOverviewView),
    runtime.fixedOverviewViewButton.classList.toggle('has-saved-view', hasSavedOverviewView)
  const hasSavedCameraView = isOverviewMode ? hasSavedOverviewView : hasSavedFloorView
  ;(runtime.exportSaveViewButton.textContent = isOverviewMode ? '保存总览' : '保存视角'),
    (runtime.exportSaveViewButton.title = isOverviewMode
      ? '记录当前导图的全楼角度和投影方式'
      : '记录当前导图的角度、缩放和投影方式'),
    (runtime.selectElement('#export-use-fixed').textContent = isOverviewMode ? '恢复总览' : '恢复视角'),
    (runtime.selectElement('#export-use-fixed').title = isOverviewMode
      ? '恢复已保存的全楼总览视角'
      : '恢复当前楼层已保存的视角'),
    (runtime.selectElement('#export-use-fixed').disabled = !!runtime.appCtx.isInteractionLocked || !hasSavedCameraView),
    runtime.selectElement('#export-use-fixed').classList.toggle('has-saved-view', hasSavedCameraView)
}

export function resizeStudioRenderer(
  runtime: StudioAppRuntime,
  { preserveCanvasSize: shouldPreserveCanvasSize = false } = {},
) {
  if (!runtime.appCtx.threeRenderer) return
  if (runtime.appCtx.pendingRuntimeSettings) {
    runtime.resizeRenderCanvas()
    return
  }
  const previewStageElement = runtime.selectElement('#preview-3d'),
    size = runtime.isEmbeddedStage ? runtime.appCtx.threeRenderer.getSize(new ns2.Vector2()) : null,
    viewportWidth = Math.max(shouldPreserveCanvasSize && size ? size.x : previewStageElement.clientWidth, 1),
    viewportHeight = Math.max(shouldPreserveCanvasSize && size ? size.y : previewStageElement.clientHeight, 1),
    isViewportSizeUnchanged = size?.x === viewportWidth && size?.y === viewportHeight,
    join3 = runtime.isEmbeddedStage ? runtime.appCtx.threeCamera.projectionMatrix.elements.join(',') : ''
  isViewportSizeUnchanged || runtime.appCtx.threeRenderer.setSize(viewportWidth, viewportHeight, false),
    (runtime.appCtx.threeCamera.userData.viewportAspect = viewportWidth / viewportHeight),
    runtime.appCtx.threeCamera.isOrthographicCamera
      ? runtime.applyOrthoFrame(
          runtime.appCtx.threeCamera.userData.frameSize || 10,
          runtime.appCtx.threeCamera.userData.viewportAspect,
        )
      : ((runtime.appCtx.threeCamera.aspect = runtime.appCtx.threeCamera.userData.viewportAspect),
        runtime.applyCameraFocalLength()),
    (!isViewportSizeUnchanged || join3 !== runtime.appCtx.threeCamera.projectionMatrix.elements.join(',')) &&
      runtime.refreshSceneRender()
}

export function stateViewportAspectGetCanvasSize(runtime: StudioAppRuntime) {
  return {
    width: Math.round(clamp2(finite2(runtime.exportWidthInput.value, runtime.defaultExportWidth), 320, 4096)),
    height: Math.round(clamp2(finite2(runtime.exportHeightInput.value, runtime.defaultExportHeight), 320, 4096)),
  }
}

export function refreshCanvasSizeUi(runtime: StudioAppRuntime) {
  const { width: wn2, height: wn3 } = runtime.stateViewportAspectGetCanvasSize()
  runtime.exportResolutionLabelElement.textContent = wn2 + ' × ' + wn3 + ' px'
  const greatestCommonDivisor = ((gcdLeft, gcdRight) => {
      for (; gcdRight; ) [gcdLeft, gcdRight] = [gcdRight, gcdLeft % gcdRight]
      return gcdLeft
    })(wn2, wn3),
    ratioWidth = wn2 / greatestCommonDivisor,
    ratioHeight = wn3 / greatestCommonDivisor
  ;(runtime.exportAspectLabelElement.textContent =
    ratioWidth <= 32 && ratioHeight <= 32 ? ratioWidth + ' : ' + ratioHeight : (wn2 / wn3).toFixed(2) + ' : 1'),
    runtime.exportPreviewFrameElement.style.setProperty('--export-aspect', String(wn2 / wn3))
}

export function resolvePixelRatio(runtime: StudioAppRuntime, isExportMode = false) {
  const devicePixelRatioValue = window.devicePixelRatio || 1
  if (!runtime.isAutoDiagramEmbed || !runtime.exportPreviewStageElement) return devicePixelRatioValue
  const { width: wn4, height: wn5 } = runtime.stateViewportAspectGetCanvasSize(),
    hostClientWidth = Math.max(runtime.exportPreviewStageElement.clientWidth, 1),
    hostClientHeight = Math.max(runtime.exportPreviewStageElement.clientHeight, 1),
    cappedPixelRatio = Math.max(devicePixelRatioValue, wn4 / hostClientWidth, wn5 / hostClientHeight, 1.5)
  return Math.min(cappedPixelRatio, isExportMode ? 2 : 4)
}

export function resizeRenderCanvas(runtime: StudioAppRuntime) {
  if (
    !runtime.appCtx.pendingRuntimeSettings ||
    runtime.appCtx.isInteractionLocked ||
    !runtime.appCtx.threeRenderer ||
    !runtime.appCtx.threeCamera
  )
    return
  const { width: wn6, height: wn7 } = runtime.stateViewportAspectGetCanvasSize(),
    canvasAspect = wn6 / wn7,
    canvasClientWidth = Math.max(runtime.exportPreviewStageElement.clientWidth, 1),
    canvasClientHeight = Math.max(runtime.exportPreviewStageElement.clientHeight, 1),
    $f3 = runtime.isAutoDiagramEmbed ? runtime.resolvePixelRatio(false) : Math.min(window.devicePixelRatio || 1, 2)
  runtime.appCtx.threeRenderer.setPixelRatio($f3),
    runtime.appCtx.threeRenderer.setSize(canvasClientWidth, canvasClientHeight, false),
    (runtime.appCtx.threeCamera.userData.viewportAspect = canvasAspect),
    runtime.appCtx.threeCamera.isOrthographicCamera
      ? runtime.applyOrthoFrame(
          runtime.appCtx.threeCamera.userData.frameSize || 10,
          canvasAspect,
          runtime.appCtx.threeCamera,
        )
      : ((runtime.appCtx.threeCamera.aspect = canvasAspect), runtime.applyCameraFocalLength()),
    runtime.appCtx.orbitControls.update(),
    runtime.refreshSceneRender()
}

export function syncCanvasSizeInputs(runtime: StudioAppRuntime) {
  runtime.refreshCanvasSizeUi(), requestAnimationFrame(() => requestAnimationFrame(runtime.resizeRenderCanvas))
}

export function handleCanvasSizeInput(runtime: StudioAppRuntime, dimensionName: any, shouldCommitSize = false) {
  const inputDimensionValue = Number(
    (dimensionName === 'width' ? runtime.exportWidthInput : runtime.exportHeightInput).value,
  )
  if (!Number.isFinite(inputDimensionValue) || inputDimensionValue <= 0) return
  let nextCanvasWidth = dimensionName === 'width' ? inputDimensionValue : Number(runtime.exportWidthInput.value),
    nextCanvasHeight = dimensionName === 'height' ? inputDimensionValue : Number(runtime.exportHeightInput.value)
  ;(nextCanvasWidth =
    Number.isFinite(nextCanvasWidth) && nextCanvasWidth > 0 ? nextCanvasWidth : runtime.defaultExportWidth),
    (nextCanvasHeight =
      Number.isFinite(nextCanvasHeight) && nextCanvasHeight > 0 ? nextCanvasHeight : runtime.defaultExportHeight),
    runtime.exportLockRatioInput.checked &&
      (dimensionName === 'width'
        ? shouldCommitSize
          ? ((nextCanvasWidth = clamp2(nextCanvasWidth, 320, 4096)),
            (nextCanvasHeight = Math.round(nextCanvasWidth / runtime.appCtx.exportAspectRatio)),
            nextCanvasHeight < 320 &&
              ((nextCanvasHeight = 320),
              (nextCanvasWidth = Math.round(nextCanvasHeight * runtime.appCtx.exportAspectRatio))),
            nextCanvasHeight > 4096 &&
              ((nextCanvasHeight = 4096),
              (nextCanvasWidth = Math.round(nextCanvasHeight * runtime.appCtx.exportAspectRatio))))
          : (nextCanvasHeight = Math.round(clamp2(nextCanvasWidth / runtime.appCtx.exportAspectRatio, 320, 4096)))
        : shouldCommitSize
          ? ((nextCanvasHeight = clamp2(nextCanvasHeight, 320, 4096)),
            (nextCanvasWidth = Math.round(nextCanvasHeight * runtime.appCtx.exportAspectRatio)),
            nextCanvasWidth < 320 &&
              ((nextCanvasWidth = 320),
              (nextCanvasHeight = Math.round(nextCanvasWidth / runtime.appCtx.exportAspectRatio))),
            nextCanvasWidth > 4096 &&
              ((nextCanvasWidth = 4096),
              (nextCanvasHeight = Math.round(nextCanvasWidth / runtime.appCtx.exportAspectRatio))))
          : (nextCanvasWidth = Math.round(clamp2(nextCanvasHeight * runtime.appCtx.exportAspectRatio, 320, 4096)))),
    shouldCommitSize
      ? ((nextCanvasWidth = Math.round(clamp2(nextCanvasWidth, 320, 4096))),
        (nextCanvasHeight = Math.round(clamp2(nextCanvasHeight, 320, 4096))),
        (runtime.exportWidthInput.value = String(nextCanvasWidth)),
        (runtime.exportHeightInput.value = String(nextCanvasHeight)))
      : runtime.exportLockRatioInput.checked &&
        (dimensionName === 'width'
          ? (runtime.exportHeightInput.value = String(nextCanvasHeight))
          : (runtime.exportWidthInput.value = String(nextCanvasWidth))),
    runtime.syncCanvasSizeInputs()
}

/**
 * studio 引导期的资源释放（从 `studio-app/boot` 的 teardown 闭包里拆出）。
 *
 * 这里只有「对已经建好的句柄做释放」和「清掉挂在 document / window 上的残留」两类动作，
 * 不持有任何引导期状态 —— 于是可以从那个 4000 行的宿主函数里独立出来。
 */

type DisposableLike = { dispose?: () => void }
type RendererLike = DisposableLike & { forceContextLoss?: () => void }

/** teardown 需要回收的 three.js 句柄（`appCtx` 的子集）。 */
type StudioRendererHandles = {
  orbitControls?: DisposableLike | null
  contextResources?: DisposableLike | null
  threeRenderer?: RendererLike | null
  threeScene?: unknown
  threeCamera?: unknown
  sceneRootNode?: unknown
}

/**
 * 按依赖顺序释放渲染器相关资源。
 *
 * `contextResources` 必须在 `threeRenderer.dispose()` 之前：它还原 EventDispatcher 补丁并
 * 清空登记表，晚于 renderer 释放就再也拿不到那些对象了。
 */
export function releaseStudioRenderer(appCtx: StudioRendererHandles): void {
  try {
    appCtx.orbitControls?.dispose?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  try {
    appCtx.contextResources?.dispose?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  appCtx.contextResources = null
  try {
    // 模块级共享纹理跨实例存活，必须趁渲染器还在时释放，否则它们的 dispose 监听留住旧渲染器与画布。
    releaseMetalEnvironmentTextures()
    releaseSurfaceDetailTextures()
    releaseSurfaceStyleTextures()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  try {
    appCtx.threeRenderer?.dispose?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  try {
    appCtx.threeRenderer?.forceContextLoss?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  appCtx.threeRenderer = null
  appCtx.threeScene = null
  appCtx.threeCamera = null
  appCtx.orbitControls = null
  appCtx.sceneRootNode = null
}

/** studio 实例级资源：`StudioAppRuntime` 上能取到的四张「按规格共享」缓存。 */
type StudioSharedCaches = {
  geometryCacheByKey?: Map<unknown, unknown> | null
  floorGroupCacheByKey?: Map<unknown, unknown> | null
  textureCacheByKey?: Map<unknown, unknown> | null
  materialCacheByKey?: Map<unknown, unknown> | null
}

/** 地毯缓存条目：一份 base 几何 + 一份 inset 面（运行时是裸 three 对象，这里只关心 dispose）。 */
type RugGeometryRecord = { base?: DisposableLike; inset?: DisposableLike }

/**
 * 释放「只挂在 pagehide 上、SPA 路由切换永远等不到」的实例级资源。
 *
 * 三样东西每进出一次 studio 就会留一份：
 * - 素材缩略图 / 重叠浮层用的**第二个** `WebGLRenderer`（浏览器同时存活的上下文上限约 16 个，
 *   被挤掉的会是主画布 —— 表现为整块黑屏 / `Context Lost`）；
 * - 外部模型管理器持有的 GLTF 模板（每个 itemType 一份几何 + 贴图，是单笔最大的一块）；
 * - 按规格共享的架构几何 / 材质：`disposeObjectTree` 刻意跳过带 `shared` 标记的资源，
 *   所以必须在这里单独收尾（`textureCacheByKey` 里放的是材质，不是纹理，历史命名）。
 */
/** 释放按规格共享的架构几何（含地毯的 base / inset 两份）。 */
function disposeSharedGeometries(caches?: StudioSharedCaches): void {
  const geometrySet = new Set<DisposableLike>()
  for (const sharedGeometry of caches?.geometryCacheByKey?.values() ?? [])
    if (sharedGeometry) geometrySet.add(sharedGeometry as DisposableLike)
  for (const rugEntry of caches?.floorGroupCacheByKey?.values() ?? []) {
    const rugRecord = rugEntry as RugGeometryRecord | null
    if (rugRecord?.base) geometrySet.add(rugRecord.base)
    if (rugRecord?.inset) geometrySet.add(rugRecord.inset)
  }
  for (const sharedGeometry of geometrySet) sharedGeometry.dispose?.()
  caches?.geometryCacheByKey?.clear()
  caches?.floorGroupCacheByKey?.clear()
}

/** 释放按规格共享的材质（`textureCacheByKey` 里放的也是材质，历史命名）。 */
function disposeSharedMaterials(caches?: StudioSharedCaches): void {
  const materialSet = new Set<DisposableLike>()
  for (const cachedMaterial of caches?.textureCacheByKey?.values() ?? [])
    if (cachedMaterial) materialSet.add(cachedMaterial as DisposableLike)
  for (const cachedMaterial of caches?.materialCacheByKey?.values() ?? [])
    if (cachedMaterial) materialSet.add(cachedMaterial as DisposableLike)
  for (const sharedMaterial of materialSet) sharedMaterial.dispose?.()
  caches?.textureCacheByKey?.clear()
  caches?.materialCacheByKey?.clear()
}

export function releaseStudioOwnedResources(
  runtime: unknown,
  externalModelRegistry?: DisposableLike | null,
  caches?: StudioSharedCaches,
): void {
  try {
    disposeOverlapAndPreview(runtime as never)
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  try {
    externalModelRegistry?.dispose?.()
  } catch {
    /* 清理期失败无需处理：资源可能已释放 / 上下文已丢失，继续走后续清理 */
  }
  disposeSharedGeometries(caches)
  disposeSharedMaterials(caches)
}

/** 引导期写在 DOM 上的诊断标记：嵌入式 stage 的 body 类、dataset 键与 window 内部契约。 */
export function clearStudioDocumentResidue(): void {
  disposeStudioFonts()
  document.body.classList.remove('auto-diagram-embedded')
  document.documentElement.classList.remove('list-drag-active')
  const documentDataset = document.documentElement.dataset
  for (const datasetKey of [
    'lightRenderCache',
    'renderStatsTest',
    'performanceDiagnostics',
    'modelExportReady',
    'modelExportError',
    'materialTestStage',
    'materialTestStats',
    'materialTestReady',
    'materialTestError',
    'instanceTestStats',
    'instanceTestReady',
    'instanceTestError',
    'effectCacheStats',
    'interactionBatchStats',
    'shadowReceiverTrial',
    // 灯光路径的诊断标记：舞台/编辑器模式、「已退回原生逐灯」的结论、锥体参数就地同步计数。
    'stageLightingMode',
    'lightingFallback',
    'lightShapeSync',
  ]) {
    delete documentDataset[datasetKey]
  }
  // 挂在 window 上的内部契约（`__homeosStudioModuleVersion` 是模块求值期写入的版本标记，
  // 不随本次引导产生，因此这里不动它）。
  const windowContract = window as unknown as Record<string, unknown>
  delete windowContract.__homeosWallRuntimeProfile
  delete windowContract.__homeosDeferExternalModel
  delete windowContract.__homeosReleasingDeferredModels
  delete windowContract.__homeosExportFurnitureJson
  delete windowContract.externalModelLoadsDeferred
}
