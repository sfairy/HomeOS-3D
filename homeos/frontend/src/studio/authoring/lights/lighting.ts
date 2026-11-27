import { type StudioAppRuntime } from '../runtime/studio-app-runtime'
import { applySunShadowTuning } from '../scene/studio-sun-shadow-tuning'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2, selectShadowCastingLightIds as selectShadowCastingLightIds2 } from '../plan/geometry'
import { syncControlValue as syncControlValue2 } from '../ui/ui-controls'
import { DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2, finite as finite2, normalizeBaseLighting as normalizeBaseLighting2, normalizeBaseLightingByTheme as normalizeBaseLightingByTheme2, normalizeLabelText as normalizeLabelText2 } from '../loaders/studio-normalization'
import { normalizeSceneStyle } from '../../app/shared/scene-styles'
import { minTextureSize, maxTextureUnitLimit, planLabelAccentAlpha, normalizePlanLabelColor, planLabelThemeColors } from '../scene/payload/studio-scene-payload'
import { buildLightDeltaPixels as buildLightDeltaPixels2 } from '../export/export-utils'
import { type StudioAppContext } from '../app-context'
import { precompileShaderPrograms } from '../scene/studio-shader-precompile'
import { lightSignatureOf } from '../ui/lighting'
import { applyTextureQuality } from '../render-kit/texture-quality'
import { drawTrackedText as drawTrackedText2 } from '../plan/studio-plan'
import { lampItemTypeSet } from '../items/item-catalog'
import { isPlacedItemHidden } from '../items/placed-item-state'
import { lightPresetCatalog } from './studio-app-light-data'
import { addStripFixture } from './strip-light/strip-light-model'
import { lightEffectColorHex } from '../../app/bridge/light-motion'
import { dashboardCanvasFont } from '../../app/shared/dashboard-fonts'


export function refreshBaseLighting(runtime: StudioAppRuntime) {
  const yt2 = runtime.backgroundSettings(),
    vn2 = runtime.appCtx.baseLightingSettings
  if (!runtime.appCtx.threeScene || !runtime.appCtx.threeRenderer) return
  ;(runtime.appCtx.threeScene.background = null),
    runtime.appCtx.threeRenderer.setClearColor(yt2.background, 0),
    (runtime.appCtx.threeScene.fog = null),
    (runtime.appCtx.threeRenderer.toneMappingExposure = vn2.exposure)

  const intensityScale = runtime.isEmbedStageMode ? 0.5 : 1
  // 亮度系数判据是 `isEmbedStageMode`（舞台 + `?lighting=region`），不是 `isEmbeddedStage`：
  // 标准舞台 URL 走 1.0，是曝光与墙面自发光一起调好的基线；换成 `isEmbeddedStage` 会把半球光/
  // 环境光/三盏方向光整体砍半，墙直接掉成暗褐色块，开灯也补不回来。
  // 阴影档位的判据同样是 `isEmbedStageMode`（舞台 + legacy 光影），不是 `isEmbeddedStage`：
  // 标准光影 v2 的舞台要与编辑器「同一档」阴影（预设浓度 ×1.5、柔化 3.25/12 采样），
  // 否则组件明明切到了标准光影，舞台上却还是老档的 0.18 硬边影 —— 观感就是「部署后没立体感」。
  const isStageSurface = runtime.isEmbedStageMode === true
  runtime.appCtx.hemisphereLight &&
    (runtime.appCtx.hemisphereLight.color.setHex(yt2.warmWood ? 16776178 : 14606046),
    runtime.appCtx.hemisphereLight.groundColor.setHex(yt2.warmWood ? 10524035 : 2236962),
    (runtime.appCtx.hemisphereLight.intensity = vn2.hemisphereIntensity * intensityScale)),
    runtime.appCtx.ambientLight &&
      (runtime.appCtx.ambientLight.color.setHex(yt2.warmWood ? 15592162 : 10132122),
      (runtime.appCtx.ambientLight.intensity = vn2.ambientIntensity * intensityScale)),
    runtime.appCtx.mainDirectionalLight &&
      (runtime.appCtx.mainDirectionalLight.color.setHex(yt2.warmWood ? 16774367 : 16053492),
      (runtime.appCtx.mainDirectionalLight.intensity = vn2.mainIntensity * intensityScale),
      runtime.positionLightFromAngles(runtime.appCtx.mainDirectionalLight, vn2.mainAzimuth, vn2.mainElevation, 18.4),
      applySunShadowTuning(runtime.appCtx.mainDirectionalLight, {
        isStageSurface,
        isGroundShadowEnabled: runtime.appCtx.isGroundShadowEnabled,
        mainShadowIntensity: vn2.mainShadowIntensity,
      }),
      // 区域光补丁里的「太阳方向」必须和这盏灯同一份：方向取「指向光源」的单位向量
      // （`positionLightFromAngles` 把灯摆在原点之外 18.4m 处、target 仍是原点），
      // 阴影参考值取刚调好的 `shadow.intensity`。墙面的朝向差、落影强度都从这里来。
      runtime.appCtx.regionLightController?.setSunDirection?.(
        Math.cos(ns2.MathUtils.degToRad(vn2.mainAzimuth)) * Math.cos(ns2.MathUtils.degToRad(vn2.mainElevation)),
        Math.sin(ns2.MathUtils.degToRad(vn2.mainElevation)),
        Math.sin(ns2.MathUtils.degToRad(vn2.mainAzimuth)) * Math.cos(ns2.MathUtils.degToRad(vn2.mainElevation)),
      ),
      runtime.appCtx.regionLightController?.setSunShadowScale?.(runtime.appCtx.mainDirectionalLight.shadow.intensity)),
    runtime.appCtx.fillDirectionalLight &&
      (runtime.appCtx.fillDirectionalLight.color.setHex(yt2.warmWood ? 14346221 : 10921638),
      (runtime.appCtx.fillDirectionalLight.intensity = vn2.fillIntensity * intensityScale),
      runtime.positionLightFromAngles(runtime.appCtx.fillDirectionalLight, vn2.fillAzimuth, vn2.fillElevation, 15.2)),
    runtime.appCtx.topDirectionalLight &&
      (runtime.appCtx.topDirectionalLight.color.setHex(yt2.warmWood ? 16776693 : 16250871),
      (runtime.appCtx.topDirectionalLight.intensity = vn2.topIntensity * intensityScale),
      runtime.positionLightFromAngles(runtime.appCtx.topDirectionalLight, vn2.topAzimuth, vn2.topElevation, 16.1))
  // 上面刚把灯光恢复到「基线」。天气系数必须以这份基线为基准重新叠回去：
  // 不补这一下的话，用户改一次基础光、或场景重建一次，天气就被冲掉（雨还在下、灯回到满亮）。
  runtime.appCtx.weatherAtmosphere?.refreshBaseline()
}

export function setShadowQualityHigh(runtime: StudioAppRuntime, isHighQuality: any) {
  const isHighQualityEnabled = isHighQuality === true
  if (isHighQualityEnabled !== runtime.appCtx.isGroundShadowEnabled) {
    if (isHighQualityEnabled && runtime.appCtx.mainDirectionalLight?.shadow?.camera) {
      const camera = runtime.appCtx.mainDirectionalLight.shadow.camera
      runtime.appCtx.savedShadowCamera = {
        left: camera.left,
        right: camera.right,
        top: camera.top,
        bottom: camera.bottom,
        near: camera.near,
        far: camera.far,
      }
    }
    if (
      ((runtime.appCtx.isGroundShadowEnabled = isHighQualityEnabled),
      runtime.refreshBaseLighting(),
      !isHighQualityEnabled && runtime.appCtx.savedShadowCamera && runtime.appCtx.mainDirectionalLight?.shadow?.camera)
    ) {
      const camera2 = runtime.appCtx.mainDirectionalLight.shadow.camera
      Object.assign(camera2, runtime.appCtx.savedShadowCamera),
        camera2.updateProjectionMatrix(),
        (runtime.appCtx.savedShadowCamera = null)
    }
    runtime.appCtx.mainDirectionalLight?.shadow && (runtime.appCtx.mainDirectionalLight.shadow.needsUpdate = true),
      runtime.appCtx.threeRenderer?.domElement &&
        (runtime.appCtx.threeRenderer.domElement.dataset.exportShadowQuality = isHighQualityEnabled
          ? 'high'
          : 'realtime')
  }
}

export function clampShadowMapSize(runtime: StudioAppRuntime, shadowMapSize: any) {
  if (!runtime.appCtx.isGroundShadowEnabled) return shadowMapSize
  const maxTextureSize = Math.max(
    1,
    Math.floor(finite2(runtime.appCtx.threeRenderer?.capabilities?.maxTextureSize, minTextureSize)),
  )
  return Math.min(maxTextureSize, Math.max(shadowMapSize, minTextureSize))
}

export function syncBaseLightingControls(runtime: StudioAppRuntime) {
  for (const baseLightControlInput of runtime.baseLightControlInputs) {
    const baseLightValue = (runtime.appCtx.baseLightingSettings as any)[
        baseLightControlInput.dataset.baseLightControl!
      ],
      isIntegerStep = baseLightControlInput.step === '5'
    syncControlValue2(
      baseLightControlInput,
      isIntegerStep ? Math.round(baseLightValue) : Number(baseLightValue.toFixed(2)),
    )
  }
}

export function applyBaseLighting(runtime: StudioAppRuntime, baseLightingConfig: any) {
  const vn3 = runtime.appCtx.baseLightingSettings
  ;(runtime.appCtx.baseLightingSettings = normalizeBaseLighting2(baseLightingConfig)),
    runtime.syncBaseLightingControls(),
    runtime.refreshBaseLighting(),
    runtime.refreshSceneRender({
      shadows: Object.keys(DEFAULT_BASE_LIGHTING2).some(
        (lightingKey) => (vn3 as any)[lightingKey] !== (runtime.appCtx.baseLightingSettings as any)[lightingKey],
      ),
    })
}

/**
 * 当前风格下应该生效的基础光照。
 *
 * 0.8.7 起每个风格各自保存一份：优先取 `baseLightingByTheme[当前风格]`，没调过才回落到
 * 文档级 `baseLighting`（老户型的兼容路径）。**不要**在别处直接读 `studioProject.baseLighting`，
 * 否则切到自然木语后仍然套着默认风格的光照。
 */
export function baseLightingForCurrentStyle(runtime: StudioAppRuntime) {
  const project = runtime.appCtx.studioProject
  if (!project) return DEFAULT_BASE_LIGHTING2
  const byTheme = normalizeBaseLightingByTheme2(project.baseLightingByTheme)
  const style = normalizeSceneStyle(runtime.appCtx.sceneStyle)
  return normalizeBaseLighting2(byTheme[style] ?? project.baseLighting ?? DEFAULT_BASE_LIGHTING2)
}

/** 把当前编辑中的光照写回**当前风格**那一格（另一风格不受影响）。 */
function persistBaseLightingForCurrentStyle(runtime: StudioAppRuntime, lighting: unknown) {
  const project = runtime.appCtx.studioProject
  if (!project) return
  const style = normalizeSceneStyle(runtime.appCtx.sceneStyle)
  const normalized = normalizeBaseLighting2(lighting)
  project.baseLightingByTheme = {
    ...normalizeBaseLightingByTheme2(project.baseLightingByTheme),
    [style]: normalized,
  }
  // 文档级 `baseLighting` 只作为「默认风格」的镜像，老版本读取时才不会丢。
  if (style === 'default') project.baseLighting = normalized
}

/**
 * 打开进阶光照面板时的本地修订（过期守卫用）。
 *
 * 放在模块级而不是 `appCtx`：它只服务「打开 → 保存」这一对动作，
 * 进文档或进运行时上下文都会变成一份需要同步的影子状态。
 */
let lightingPanelOpenedRevision: number | null = null
/** 打开面板时的场景风格：切了风格（材质/光影预设变了）就不能沿用面板里的数值。 */
let lightingPanelOpenedStyle: string | null = null

export function saveBaseLightingEdit(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.studioProject || !runtime.baseLightControlsElement) return
  // 记下打开面板时的修订：保存时据此判断「面板打开期间别的页面是否写过」。
  lightingPanelOpenedRevision = runtime.appCtx.localSaveRevision
  lightingPanelOpenedStyle = String(runtime.appCtx.sceneStyle || 'default')
  const en2 = runtime.exportDialogElement?.open ? runtime.exportDialogElement : document.body
  runtime.baseLightControlsElement.parentElement !== en2 && en2.append(runtime.baseLightControlsElement),
    runtime.baseLightControlsElement.hidden && runtime.applyBaseLighting(baseLightingForCurrentStyle(runtime)),
    (runtime.baseLightControlsElement.hidden = false)
  const panelBoundingRect = runtime.baseLightControlsElement.getBoundingClientRect()
  ;(panelBoundingRect.right > window.innerWidth - 8 ||
    panelBoundingRect.bottom > window.innerHeight - 8 ||
    panelBoundingRect.left < 8 ||
    panelBoundingRect.top < 8) &&
    ((runtime.baseLightControlsElement.style.right = 'auto'),
    (runtime.baseLightControlsElement.style.left =
      clamp2(panelBoundingRect.left, 8, Math.max(8, window.innerWidth - panelBoundingRect.width - 8)) + 'px'),
    (runtime.baseLightControlsElement.style.top =
      clamp2(panelBoundingRect.top, 8, Math.max(8, window.innerHeight - panelBoundingRect.height - 8)) + 'px'))
}

export function openLightingDialog(runtime: StudioAppRuntime) {
  runtime.baseLightControlsElement &&
    (runtime.appCtx.studioProject && runtime.applyBaseLighting(baseLightingForCurrentStyle(runtime)),
    (runtime.baseLightControlsElement.hidden = true))
}

/** 面板过期判定：修订变了或场景风格变了都要让用户重开面板。 */
function lightingStaleMessage(runtime: StudioAppRuntime): string | null {
  if (lightingPanelOpenedRevision != null && lightingPanelOpenedRevision !== runtime.appCtx.localSaveRevision) {
    return '户型已在其他页面更新，请重新保存光照。'
  }
  const styleChanged =
    lightingPanelOpenedStyle != null && lightingPanelOpenedStyle !== String(runtime.appCtx.sceneStyle || 'default')
  // 0.8.8 原文：主题 / 光影模式切换后旧面板的数值已不对应当前主题，必须重开。
  return styleChanged ? '户型主题或光影模式已切换，请重新打开进阶设置。' : null
}

export function confirmLightingDialog(runtime: StudioAppRuntime) {
  if (!runtime.appCtx.studioProject) return
  /**
   * 过期守卫（0.8.7）：面板打开期间别的页面可能保存过新修订。
   * 此时继续写会把对方的光照盖掉，所以要求重新打开面板再保存。
   */
  if (lightingStaleMessage(runtime)) {
    runtime.showToast(lightingStaleMessage(runtime)!, 'warning')
    return
  }
  const normalizedBaseLighting = normalizeBaseLighting2(runtime.appCtx.baseLightingSettings)
  try {
    persistBaseLightingForCurrentStyle(runtime, normalizedBaseLighting)
  } catch (error) {
    // 0.8.7：保存失败要给可执行的提示，而不是静默停在旧值。
    runtime.showToast('光照保存失败，请重试。', 'error')
    globalThis.window?.HomeOSLog?.error?.('光照保存失败', { phase: 'studio-base-lighting', reason: String(error) })
    return
  }
  ;(runtime.appCtx.studioProject.baseLighting = runtime.appCtx.studioProject.baseLighting ?? normalizedBaseLighting),
    runtime.applyBaseLighting(normalizedBaseLighting),
    runtime.markDocumentDirty(),
    runtime.appCtx.lightPreviewWorker?.postMessage({
      type: 'base-lighting-saved',
      lighting: normalizedBaseLighting,
    }),
    runtime.flushAutosave(),
    runtime.showToast('当前主题光照已保存。', 'success')
}

export function updateBaseLightingFromInput(runtime: StudioAppRuntime, lightingInput: any) {
  const baseLightControl = lightingInput.dataset.baseLightControl
  baseLightControl in runtime.appCtx.baseLightingSettings &&
    ((runtime.appCtx.baseLightingSettings = normalizeBaseLighting2({
      ...runtime.appCtx.baseLightingSettings,
      [baseLightControl]: finite2(lightingInput.value, (runtime.appCtx.baseLightingSettings as any)[baseLightControl]),
    })),
    runtime.refreshBaseLighting(),
    runtime.refreshSceneRender({
      shadows: true,
    }))
}

export function collectActiveLightEntries(runtime: StudioAppRuntime) {
  return runtime
    .collectLampEntries()
    .filter(
      ({ item: lightItem, group: lightGroupDefinition }: any) =>
        lightGroupDefinition?.enabled !== false && finite2(lightItem.lightBrightness, 0) > 0,
    )
    .map(({ item: lightItemRef }: any) => lightItemRef)
}

export function areLightsEnabled(runtime: StudioAppRuntime) {
  return runtime.isEmbedStageMode
    ? false
    : (runtime.canRenderScene(),
      runtime.appCtx.isAdaptiveRenderActive &&
        !runtime.appCtx.isEnvironmentActive &&
        !runtime.appCtx.isCurtainMoving &&
        !runtime.appCtx.isVacuumMoving &&
        !runtime.appCtx.isLockMoving &&
        !runtime.appCtx.isBackgroundMoving)
}



export interface BeginLightingPreviewDeps {
  acquireRenderSurface: any
  appCtx: StudioAppContext
  areLightsEnabled: any
  awaitNextFramePair: any
  buildLightCacheMap: any
  captureFramePixels: any
  collectLampEntries: any
  ensureLightCache: any
  ensureRenderReady: any
  isEmbeddedStage: any
  previewLightCacheCanvasElement: any
  requestStudioRender: any
  rerenderScene: any
  restoreLightVisibility: any
  restorePreviewAfterFade: any
  scheduleStudioRender: any
  setFadeOverlay: any
  showCachedLights: any
  showLightCacheFor: any
  waitForIdleFrame: any
}

export async function beginLightingPreview(deps: BeginLightingPreviewDeps) {
  const {
    acquireRenderSurface,
    appCtx,
    areLightsEnabled,
    awaitNextFramePair,
    buildLightCacheMap,
    captureFramePixels,
    collectLampEntries,
    ensureLightCache,
    ensureRenderReady,
    isEmbeddedStage,
    previewLightCacheCanvasElement,
    requestStudioRender,
    rerenderScene,
    restoreLightVisibility,
    restorePreviewAfterFade,
    scheduleStudioRender,
    setFadeOverlay,
    showCachedLights,
    showLightCacheFor,
    waitForIdleFrame,
  } = deps

  if (isEmbeddedStage) return acquireRenderSurface()
  if (
    ((appCtx.renderCommitTimeoutId = null),
    !appCtx.threeRenderer ||
      appCtx.pendingRuntimeSettings ||
      appCtx.isRenderSuppressed ||
      appCtx.isWindowHidden ||
      appCtx.isCapturingLights ||
      appCtx.prewarmState ||
      appCtx.isPrewarming ||
      !areLightsEnabled())
  )
    return
  const Et3 = appCtx.modelRevisionCounter,
    previewLightEntries = collectLampEntries().filter(
      ({ item: previewLightItem, group: _previewLightGroup }: any) => finite2(previewLightItem.lightBrightness, 0) > 0,
    ),
    domElement6 = appCtx.threeRenderer.domElement
  let width5 = domElement6.width,
    height5 = domElement6.height
  if (!width5 || !height5 || !previewLightEntries.length) return
  ;(appCtx.isCapturingLights = true), (appCtx.isFrameDirty = true)
  const enabled = appCtx.orbitControls.enabled,
    previewVisibilityByObject = new Map()
  let isPreviewLocked = false
  requestStudioRender()
  try {
    const previewSurfacePainter = previewLightCacheCanvasElement.getContext('2d')
    if (!previewSurfacePainter) throw new Error('当前浏览器无法显示多灯缓存。')
    ;(previewLightCacheCanvasElement.hidden ||
      !appCtx.isCacheReady ||
      previewLightCacheCanvasElement.width !== width5 ||
      previewLightCacheCanvasElement.height !== height5) &&
      ((previewLightCacheCanvasElement.width = width5),
      (previewLightCacheCanvasElement.height = height5),
      previewSurfacePainter.clearRect(0, 0, width5, height5))
    const compositeCanvas = document.createElement('canvas')
    ;(compositeCanvas.width = width5), (compositeCanvas.height = height5)
    const compositePainter = compositeCanvas.getContext('2d'),
      lightDeltaCanvas = document.createElement('canvas')
    ;(lightDeltaCanvas.width = width5), (lightDeltaCanvas.height = height5)
    const lightDeltaPainter = lightDeltaCanvas.getContext('2d')
    if (!compositePainter || !lightDeltaPainter) throw new Error('当前浏览器无法合成多灯缓存。')
    const lightLayerCanvasByKey = new Map(),
      jl3 = ensureLightCache(previewLightEntries)
    if (
      (await awaitNextFramePair(),
      Et3 !== appCtx.modelRevisionCounter ||
        appCtx.pendingRuntimeSettings ||
        appCtx.isRenderSuppressed ||
        appCtx.isWindowHidden ||
        !areLightsEnabled())
    )
      return
    showLightCacheFor(jl3),
      compositePainter.clearRect(0, 0, width5, height5),
      appCtx.sceneRootNode.traverse((gridObject: any) => {
        gridObject.userData?.exportRole === 'grid' &&
          (previewVisibilityByObject.set(gridObject, gridObject.visible), (gridObject.visible = false))
      })
    let cachedLightPixels
    for (const previewEntry of previewLightEntries) {
      if (
        (await waitForIdleFrame(),
        Et3 !== appCtx.modelRevisionCounter ||
          appCtx.pendingRuntimeSettings ||
          appCtx.isRenderSuppressed ||
          appCtx.isWindowHidden ||
          !areLightsEnabled())
      )
        break
      const { group: previewGroup, itemKey: previewItemKey, groupKey: previewGroupKey } = previewEntry
      lightDeltaPainter.clearRect(0, 0, width5, height5)
      {
        cachedLightPixels ||
          (showLightCacheFor(jl3), rerenderScene(), (cachedLightPixels = captureFramePixels(width5, height5))),
          showLightCacheFor(jl3, previewItemKey),
          rerenderScene()
        const ff2 = captureFramePixels(width5, height5),
          lightDeltaPixels = buildLightDeltaPixels2(cachedLightPixels.data, ff2.data)
        lightDeltaPainter.putImageData(new ImageData(lightDeltaPixels, width5, height5), 0, 0)
      }
      compositePainter.drawImage(lightDeltaCanvas, 0, 0)
      let lightLayerCanvas = lightLayerCanvasByKey.get(previewGroupKey)
      if (
        (lightLayerCanvas ||
          ((lightLayerCanvas = document.createElement('canvas')),
          (lightLayerCanvas.width = width5),
          (lightLayerCanvas.height = height5),
          (lightLayerCanvas.userData = {
            enabled: previewGroup?.enabled !== false,
          }),
          lightLayerCanvasByKey.set(previewGroupKey, lightLayerCanvas)),
        lightLayerCanvas.getContext('2d')?.drawImage(lightDeltaCanvas, 0, 0),
        await ensureRenderReady(),
        Et3 !== appCtx.modelRevisionCounter ||
          appCtx.pendingRuntimeSettings ||
          appCtx.isRenderSuppressed ||
          appCtx.isWindowHidden ||
          !areLightsEnabled())
      )
        break
    }
    if (Et3 === appCtx.modelRevisionCounter && !appCtx.pendingRuntimeSettings && areLightsEnabled()) {
      appCtx.lightGroupCacheByFloor = lightLayerCanvasByKey
      for (const [lightLayerKey, lightLayerTarget] of lightLayerCanvasByKey)
        appCtx.lightGainByFloor.set(lightLayerKey, lightLayerTarget.userData?.enabled === false ? 0 : 1)
      ;(appCtx.isCacheReady = true),
        (appCtx.isFrameDirty = false),
        setFadeOverlay(true),
        restoreLightVisibility(),
        (isPreviewLocked = true)
    }
  } catch (previewCaptureError: any) {
    window.HomeOSLog?.error!(previewCaptureError, {
      phase: 'studio-light-cache',
    }),
      console.error(previewCaptureError),
      (appCtx.isCacheReady = !previewLightCacheCanvasElement.hidden)
  } finally {
    for (const [restoreObject, restoreVisibility] of previewVisibilityByObject)
      restoreObject.visible = restoreVisibility
    const restoredLightCache = buildLightCacheMap()
    appCtx.prewarmState
      ? appCtx.prewarmState.restore()
      : appCtx.isRenderSuppressed
        ? showCachedLights(restoredLightCache)
        : showLightCacheFor(restoredLightCache),
      rerenderScene(),
      isPreviewLocked ? requestAnimationFrame(() => restorePreviewAfterFade()) : restorePreviewAfterFade(),
      (appCtx.orbitControls.enabled = enabled),
      (appCtx.isCapturingLights = false),
      requestStudioRender(),
      appCtx.isFrameDirty && areLightsEnabled() && !appCtx.pendingRuntimeSettings && scheduleStudioRender()
  }
}

/**
 * 灯光注入版 shader 的编译兜底。
 *
 * 分层灯光把全部灯具搬进 `UserFloorLights` UBO，同时把这些灯的 `layers.mask` 清零
 * （不让 three 的原生逐灯路径再算一遍）。这套注入的 GLSL 一旦在某个 GPU/驱动的编译器上
 * 过不去，灯就既不进原生路径、也不进分层循环 —— 画面只剩环境光，而且 three 只会在控制台
 * 打一行，不会自己恢复，用户看到的就是「灯不亮」。
 *
 * 这里把这种失败变成「退原生逐灯」：
 * - `setEnabled(false)`：停掉分层与图集，`layers.mask` 还原、已编材质改 defines 重编；
 * - `setupSceneShadows`：按原生逐灯重新分配阴影；
 * - 结论写进 dataset 与日志，现场可以一眼看出走了哪条路。
 *
 * `checkShaderErrors` 只在首帧附近需要（程序首次使用时会同步读一次 program log），
 * 舞台原本为了省这点开销关掉了它，所以这里临时打开，等分层路径就绪或看门狗超时后还原。
 *
 * 拆成独立模块是为了不让 `createStudioRenderer` 再涨：那里要管渲染器降级、帧循环、
 * 上下文丢失，本来就已经在复杂度与文件规模的边上。
 */

/** 只声明本模块真正用到的 GL 查询接口。 */
type GlLike = {
  getShaderSource?: (shader: unknown) => string | null
  getProgramInfoLog?: (program: unknown) => string | null
  getShaderInfoLog?: (shader: unknown) => string | null
}

/**
 * 从 shader 诊断里抠出出错行号。
 *
 * `program log` 只有一句 "Fragment shader is not compiled."，真正有用的行号在
 * `getShaderInfoLog` 里（形如 `ERROR: 0:123: 'xxx' : syntax error`）。现场只看到
 * program log 时根本定位不到是哪一句注入的 GLSL 编不过，只能整条管线回退。
 */
function shaderErrorLines(shaderInfoLog: string) {
  const errorLines = new Set<number>()
  for (const logMatch of shaderInfoLog.matchAll(/ERROR:\s*\d+:(\d+)/g)) errorLines.add(Number(logMatch[1]))
  return [...errorLines].sort((leftLine, rightLine) => leftLine - rightLine)
}

/** 按出错行号截取源码上下文（最多 3 处、每处 ±3 行），避免把整份 shader 打进日志。 */
function excerptShaderAroundErrors(shaderSource: string, shaderInfoLog: string) {
  const errorLines = shaderErrorLines(shaderInfoLog)
  if (!shaderSource || !errorLines.length) return ''
  const shaderSourceLines = shaderSource.split('\n'),
    excerptLines: string[] = []
  for (const errorLine of errorLines.slice(0, 3)) {
    const excerptStart = Math.max(0, errorLine - 4),
      excerptEnd = Math.min(shaderSourceLines.length, errorLine + 3)
    excerptLines.push(`--- 第 ${errorLine} 行 ---`)
    for (let sourceLineIndex = excerptStart; sourceLineIndex < excerptEnd; sourceLineIndex += 1)
      excerptLines.push(`${sourceLineIndex + 1}: ${shaderSourceLines[sourceLineIndex]}`)
  }
  return excerptLines.join('\n')
}

/** 组装「哪一支 shader、哪一行、那一行长什么样」，同时写进 dataset 供现场核对。 */
function describeShaderFailure(gl: GlLike, vertexShader: unknown, fragmentShader: unknown) {
  const vertexInfoLog = gl?.getShaderInfoLog?.(vertexShader) || '',
    fragmentInfoLog = gl?.getShaderInfoLog?.(fragmentShader) || '',
    failedStage = fragmentInfoLog.trim() ? 'fragment' : vertexInfoLog.trim() ? 'vertex' : 'unknown',
    failedSource = gl?.getShaderSource?.(failedStage === 'vertex' ? vertexShader : fragmentShader) || '',
    failedInfoLog = failedStage === 'vertex' ? vertexInfoLog : fragmentInfoLog,
    excerpt = excerptShaderAroundErrors(failedSource, failedInfoLog)
  return {
    failedStage,
    detail: [failedInfoLog.trim(), excerpt].filter(Boolean).join('\n').slice(0, 4000),
  }
}

type ShaderErrorReporter = (gl: GlLike, program: unknown, vertexShader: unknown, fragmentShader: unknown) => void

type ShaderDebugLike = {
  checkShaderErrors: boolean
  onShaderError: ShaderErrorReporter | null
}

/** 兜底逻辑需要的运行期上下文（只取用得到的字段）。 */
type FailsafeAppCtx = {
  threeRenderer?: {
    debug?: ShaderDebugLike
    domElement: { dataset: Record<string, string | undefined> }
  }
  sceneRootNode?: unknown
  lightPrecompileController?: {
    setEnabled: (enabled: boolean) => void
    prepareRoot: (root: unknown) => void
    isPending: () => boolean
    isBuilding: () => boolean
    activeCount: () => number
  }
}

/** 只出现在我们注入的 chunk 里；命中说明失败的确实是补丁过的材质。 */
const LIGHTING_PATCH_MARKERS = [
  'HB_FLOOR_LIGHTS',
  'UserFloorLights',
  'USE_USER_SPOT_SHADOW_ATLAS',
  'getUserSpotAtlasShadow',
  'userFloorDirectionalShadow',
]

export interface LightingShaderFailsafe {
  /** 卸载：撤销 handler、还原 `checkShaderErrors`。 */
  dispose: () => void
  /** 首轮编译结束后调用，把 `checkShaderErrors` 还原成各模式原本的取值。 */
  restoreChecks: () => void
}

export function installLightingShaderFailsafe({
  appCtx,
  setupSceneShadows,
  scheduleStudioRender,
}: {
  appCtx: FailsafeAppCtx
  setupSceneShadows: (root: unknown, options?: { rebuildAtlas?: boolean }) => number
  scheduleStudioRender: () => void
}): LightingShaderFailsafe {
  const shaderRenderer = appCtx.threeRenderer
  if (!shaderRenderer?.debug) return { dispose: () => {}, restoreChecks: () => {} }
  // 闭包里用独立常量，避免可选链收窄在嵌套函数中失效。
  const shaderDebug: ShaderDebugLike = shaderRenderer.debug
  const previousCheckShaderErrors = shaderDebug.checkShaderErrors,
    previousOnShaderError = shaderDebug.onShaderError
  shaderDebug.checkShaderErrors = true
  let hasFallenBack = false,
    isShaderFailsafeActive = true
  const shaderFailsafeWatchdog = window.setTimeout(restoreShaderChecks, 10000)

  function restoreShaderChecks() {
    if (!isShaderFailsafeActive) return
    ;(isShaderFailsafeActive = false),
      window.clearTimeout(shaderFailsafeWatchdog),
      (shaderDebug.checkShaderErrors = previousCheckShaderErrors)
  }

  shaderDebug.onShaderError = (gl: GlLike, program: unknown, vertexShader: unknown, fragmentShader: unknown) => {
    let shaderSource = ''
    try {
      shaderSource = `${gl?.getShaderSource?.(vertexShader) || ''}\n${gl?.getShaderSource?.(fragmentShader) || ''}`
    } catch {
      /* 上下文丢失时 getShaderSource 会抛：当作「不是我们的补丁」，原始诊断照常输出 */
    }
    if (!LIGHTING_PATCH_MARKERS.some((marker) => shaderSource.includes(marker))) {
      // 与灯光无关的编译失败：保持 three 的诊断信息，不能被兜底逻辑静默掉。
      reportUnrelatedShaderError(previousOnShaderError, gl, program, vertexShader, fragmentShader)
      return
    }
    // 同一批材质会连着失败多次（每套 program 一次），只处理第一次。
    if (hasFallenBack) return
    hasFallenBack = true
    restoreShaderChecks()
    fallBackToNativeLights(appCtx, setupSceneShadows, scheduleStudioRender, shaderRenderer)
    const programLog = gl?.getProgramInfoLog?.(program) || '',
      shaderFailure = describeShaderFailure(gl, vertexShader, fragmentShader),
      failureMessage = `分层灯光着色器编译失败，已退回原生逐灯：${programLog.trim().slice(0, 200)}${
        shaderFailure.detail ? `\n[${shaderFailure.failedStage}]\n${shaderFailure.detail}` : ''
      }`
    // 现场核对入口：整段失败原因（含出错行源码）留在 dataset 上，控制台被刷掉也能查。
    document.documentElement.dataset.lightingShaderError = failureMessage.slice(0, 8000)
    console.error(`[studio-lighting] ${failureMessage}`),
      window.HomeOSLog?.error?.(failureMessage, {
        phase: 'studio-lighting-shader',
        code: 'STUDIO_LIGHTING_SHADER_FAILED',
      })!
  }

  return {
    restoreChecks: restoreShaderChecks,
    dispose() {
      window.clearTimeout(shaderFailsafeWatchdog), restoreShaderChecks()
      // 只还原成「注册前的值」：three 默认是 null，置回 undefined 会让它走不到默认报错分支。
      shaderDebug.onShaderError = previousOnShaderError ?? null
    },
  }
}

function reportUnrelatedShaderError(
  previousOnShaderError: ShaderErrorReporter | null,
  gl: GlLike,
  program: unknown,
  vertexShader: unknown,
  fragmentShader: unknown,
) {
  if (typeof previousOnShaderError === 'function') {
    previousOnShaderError(gl, program, vertexShader, fragmentShader)
    return
  }
  console.error(
    `[studio-lighting] WebGL 程序链接失败：${gl?.getProgramInfoLog?.(program) || '(无 program log)'}`,
    gl?.getShaderInfoLog?.(vertexShader),
    gl?.getShaderInfoLog?.(fragmentShader),
  )
}

function fallBackToNativeLights(
  appCtx: FailsafeAppCtx,
  setupSceneShadows: (root: unknown, options?: { rebuildAtlas?: boolean }) => number,
  scheduleStudioRender: () => void,
  shaderRenderer: NonNullable<FailsafeAppCtx['threeRenderer']>,
) {
  const fallbackRoot = appCtx.sceneRootNode
  try {
    // 顺序要紧：先把分层关掉（还原 layers.mask + defines 重编），再交给原生阴影重排。
    appCtx.lightPrecompileController?.setEnabled(false),
      appCtx.lightPrecompileController?.prepareRoot(fallbackRoot),
      setupSceneShadows(fallbackRoot, {
        rebuildAtlas: false,
      }),
      (shaderRenderer.domElement.dataset.lightingFallback = 'shader-compile'),
      (document.documentElement.dataset.lightingFallback = 'shader-compile'),
      scheduleStudioRender()
  } catch (lightingFallbackError) {
    console.error(lightingFallbackError)
  }
}

/**
 * 分层灯光/图集已经建好（或已判定不可用）就说明补丁材质的首轮编译都跑完了，
 * 可以把为了兜底临时打开的 `checkShaderErrors` 还原。
 */
export function restoreLightingShaderChecksIfReady(appCtx: FailsafeAppCtx, failsafe: LightingShaderFailsafe | null) {
  const precompile = appCtx.lightPrecompileController
  if (!precompile || precompile.isPending() || precompile.isBuilding()) return
  if (precompile.activeCount() <= 0) return
  failsafe?.restoreChecks()
}


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


/** 灯带的发光本体与朝向箭头：户型总览里不画；选中且「显示光源」开着才显示。 */
export function addStripLightPreview(runtime: StudioAppRuntime, stripPreviewParent: any, stripLightItem: any) {
  if (stripLightItem.type !== 'striplight') return
  // 否则墙面上会挂一条黑灰细条。
  const showSource =
    stripLightItem.lightSourceVisible !== false &&
    !runtime.appCtx.pendingRuntimeSettings &&
    !!runtime.createSelectionRef('item', stripLightItem.id)
  addStripFixture(stripPreviewParent, stripLightItem, {
    colorHex: lightEffectColorHex(stripLightItem.lightTemperature, stripLightItem.lightColorRgb),
    showFixture: showSource,
    showArrow: showSource,
    configurePreview: (mesh) => runtime.configureLightSourcePreview(mesh),
  })
}

export function applyAccentEmissive(runtime: StudioAppRuntime, accentRoot: any, isAccentActive: any) {
  if (!isAccentActive) return
  const yt3 = runtime.backgroundSettings()
  accentRoot.traverse((accentObject: any) => {
    const accentMaterials = Array.isArray(accentObject.material)
      ? accentObject.material
      : accentObject.material
        ? [accentObject.material]
        : []
    for (const accentMaterial of accentMaterials)
      accentMaterial?.isMeshStandardMaterial &&
        ((accentMaterial.emissive = new ns2.Color(yt3.accent)), (accentMaterial.emissiveIntensity = 0.32))
  })
}

/** 由铭牌颜色派生底线 / 描边的半透明色，保证描边永远跟字色同源。 */
export function planLabelAccentColor(_runtime: StudioAppRuntime, candidateColor: any, alpha = planLabelAccentAlpha) {
  const labelColorHex = normalizePlanLabelColor(candidateColor)
  return (
    'rgba(' +
    Number.parseInt(labelColorHex.slice(1, 3), 16) +
    ', ' +
    Number.parseInt(labelColorHex.slice(3, 5), 16) +
    ', ' +
    Number.parseInt(labelColorHex.slice(5, 7), 16) +
    ', ' +
    alpha +
    ')'
  )
}

export function createPlanLabel(runtime: StudioAppRuntime, labelSpec: any) {
  const labelCanvas = document.createElement('canvas')
  ;(labelCanvas.width = 2048), (labelCanvas.height = 640)
  const labelCanvasPainter = labelCanvas.getContext('2d'),
    labelColors = planLabelThemeColors(labelSpec.labelColor, runtime.backgroundSettings()),
    labelPaintColor = labelColors.text
  labelCanvasPainter!.clearRect(0, 0, labelCanvas.width, labelCanvas.height),
    (labelCanvasPainter!.fillStyle = labelPaintColor),
    (labelCanvasPainter!.textAlign = 'left'),
    (labelCanvasPainter!.textBaseline = 'middle')
  const labelTitleText = normalizeLabelText2(labelSpec.title, '家庭总览', 24),
    labelSubtitleText = normalizeLabelText2(labelSpec.subtitle, 'HOME PLAN', 36),
    labelTitleX = 115,
    labelTitleFontSize = 184
  ;(labelCanvasPainter!.font = dashboardCanvasFont('700 ' + labelTitleFontSize + 'px', 'sans-serif')),
    drawTrackedText2(
      labelCanvasPainter,
      labelTitleText,
      labelTitleX,
      130,
      labelTitleFontSize * clamp2(finite2(labelSpec.titleSpacing, 1.05), 0, 1.8),
      1340,
    )
  const labelGlyphX = 1580,
    labelGlyphY = 130,
    labelGlyphSize = 170
  ;(labelCanvasPainter!.fillStyle = labelPaintColor),
    labelCanvasPainter!.beginPath(),
    labelCanvasPainter!.moveTo(labelGlyphX, labelGlyphY - labelGlyphSize * 0.58),
    labelCanvasPainter!.lineTo(labelGlyphX + labelGlyphSize * 0.56, labelGlyphY - labelGlyphSize * 0.02),
    labelCanvasPainter!.lineTo(labelGlyphX + labelGlyphSize * 0.38, labelGlyphY - labelGlyphSize * 0.02),
    labelCanvasPainter!.lineTo(labelGlyphX + labelGlyphSize * 0.38, labelGlyphY + labelGlyphSize * 0.5),
    labelCanvasPainter!.lineTo(labelGlyphX - labelGlyphSize * 0.38, labelGlyphY + labelGlyphSize * 0.5),
    labelCanvasPainter!.lineTo(labelGlyphX - labelGlyphSize * 0.38, labelGlyphY - labelGlyphSize * 0.02),
    labelCanvasPainter!.lineTo(labelGlyphX - labelGlyphSize * 0.56, labelGlyphY - labelGlyphSize * 0.02),
    labelCanvasPainter!.closePath(),
    labelCanvasPainter!.fill(),
    labelCanvasPainter!.save(),
    (labelCanvasPainter!.globalCompositeOperation = 'destination-out'),
    labelCanvasPainter!.fillRect(
      labelGlyphX - labelGlyphSize * 0.09,
      labelGlyphY + labelGlyphSize * 0.2,
      labelGlyphSize * 0.18,
      labelGlyphSize * 0.3,
    ),
    labelCanvasPainter!.restore(),
    (labelCanvasPainter!.fillStyle = labelPaintColor),
    (labelCanvasPainter!.textAlign = 'left')
  const labelSubtitleFontSize = 310
  ;(labelCanvasPainter!.font = dashboardCanvasFont(
    '400 ' + labelSubtitleFontSize + 'px',
    '"Arial Narrow", Arial, sans-serif',
  )),
    drawTrackedText2(
      labelCanvasPainter,
      labelSubtitleText,
      72,
      410,
      labelSubtitleFontSize * clamp2(finite2(labelSpec.subtitleSpacing, 0.08), 0, 0.6),
      1880,
    )
  const labelLineStartX = 74,
    labelLineEndX = labelLineStartX + 1880 * clamp2(finite2(labelSpec.lineLength, 0.86), 0.3, 1)
  ;(labelCanvasPainter!.strokeStyle = labelColors.line || runtime.planLabelAccentColor(labelPaintColor)),
    (labelCanvasPainter!.lineWidth = 16),
    labelCanvasPainter!.beginPath(),
    labelCanvasPainter!.moveTo(labelLineStartX, 590),
    labelCanvasPainter!.lineTo(labelLineEndX, 590),
    labelCanvasPainter!.moveTo(labelLineStartX, 566),
    labelCanvasPainter!.lineTo(labelLineStartX, 614),
    labelCanvasPainter!.moveTo(labelLineEndX, 566),
    labelCanvasPainter!.lineTo(labelLineEndX, 614),
    labelCanvasPainter!.stroke()
  const labelTexture = new ns2.CanvasTexture(labelCanvas)
  applyTextureQuality(labelTexture, runtime.appCtx.threeRenderer, ns2.SRGBColorSpace)
  labelTexture.needsUpdate = true
  const labelPlaneMesh = new ns2.Mesh(
    new ns2.PlaneGeometry(labelSpec.width, labelSpec.depth),
    new ns2.MeshBasicMaterial({
      map: labelTexture,
      transparent: true,
      alphaTest: 0.02,
      depthWrite: false,
      toneMapped: false,
      side: ns2.DoubleSide,
      forceSinglePass: runtime.isEmbeddedStage,
    }),
  )
  return (
    (labelPlaneMesh.rotation.x = -Math.PI / 2),
    (labelPlaneMesh.position.y = 0.008),
    (labelPlaneMesh.castShadow = false),
    (labelPlaneMesh.receiveShadow = false),
    (labelPlaneMesh.renderOrder = 8),
    labelPlaneMesh
  )
}

export function collectLightSourceSpecs(runtime: StudioAppRuntime) {
  const lightItems = runtime.appCtx.studioState.items
    // 0.8.7 `Fr()`：灯源清单只收 `En(item)` 的灯。隐藏的灯不建对象，也就不该占
    // 「投射阴影的灯」名额 —— 否则隐藏几盏之后真实灯具的阴影会被挤掉。
    .filter((lightSourceItem) => !isPlacedItemHidden(runtime.appCtx, lightSourceItem.id))
  return new Set(
    selectShadowCastingLightIds2(
      lightItems.map((lightSourceItem) => ({
        id: lightSourceItem.id,
        groupId: lightSourceItem.lightGroupId,
        type: lightSourceItem.type,
        brightness: finite2(
          lightSourceItem.lightBrightness,
          (lightPresetCatalog as any)[lightSourceItem.type]?.brightness || 0,
        ),
        enabled: lampItemTypeSet.has(lightSourceItem.type) && runtime.isLampEnabled(lightSourceItem),
      })),
      maxTextureUnitLimit,
    ),
  )
}

/**
 * 内嵌自动导图里「保存光照」的**定向下发**（0.8.7 `saveAutoDiagramLighting`）。
 *
 * 为什么不能复用整份自动保存：iframe 打开期间父页面可能改过户型。此时
 * 1. 整场景 PUT 会带着**旧 revision** 直接 409，冲突框还开在 iframe 里（用户看不见），
 *    改动实际丢掉；
 * 2. 就算 revision 恰好没变，整份覆盖也会把父页面在 iframe 打开期间的其它改动抹掉。
 *
 * 所以这里只做三件事：读服务器最新草稿 → 只改 `baseLightingByTheme[当前主题]` →
 * 用服务器给的 revision 提交。内容已经一致时连 PUT 都不发（避免一次无意义的修订推进）。
 */

/** 草稿响应里本模块真正用到的字段（其余原样透传，不在这里建模）。 */
export interface StudioDraftResponse {
  revision?: number
  scene?: {
    baseLightingByTheme?: Record<string, Record<string, unknown>>
    [key: string]: unknown
  }
  [key: string]: unknown
}

/** 提交函数形状：与宿主注入的 `fetchStudioApi(path, options)` 一致。 */
export type StudioApiFetch = (path: string, options?: Record<string, unknown>) => Promise<StudioDraftResponse>

/** 两份光照是否逐键相同（键集合也要一致，少一个键不等于「没变」）。 */
export function sameBaseLighting(left: unknown, right: unknown): boolean {
  if (!left || !right || typeof left !== 'object' || typeof right !== 'object') return false
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  if (leftKeys.length !== Object.keys(rightRecord).length) return false
  return leftKeys.every((key) => leftRecord[key] === rightRecord[key])
}

/**
 * 只把当前主题的基础光照写回草稿。
 *
 * 返回服务器响应（未改动时返回读到的草稿）；中途被取消（`signal` 中止 / `isCurrent`
 * 变 false）返回 `null`，调用方据此不提示成功。
 */
export async function saveAutoDiagramLighting(
  fetchStudioApi: StudioApiFetch,
  theme: string,
  lighting: Record<string, unknown>,
  options: { signal?: AbortSignal; isCurrent?: () => boolean } = {},
): Promise<StudioDraftResponse | null> {
  const isCancelled = () => options.signal?.aborted === true || options.isCurrent?.() === false
  const draft = await fetchStudioApi('/studio3d', options.signal ? { signal: options.signal } : {})
  if (isCancelled()) return null
  const byTheme = draft?.scene?.baseLightingByTheme
  if (sameBaseLighting(byTheme?.[theme], lighting)) return draft
  const scene = structuredClone(draft?.scene)
  if (!scene || typeof scene !== 'object') throw new Error('无法读取服务器户型，请稍后重试。')
  scene.baseLightingByTheme = { ...byTheme, [theme]: structuredClone(lighting) }
  const saved = await fetchStudioApi('/studio3d', {
    method: 'PUT',
    ...(options.signal ? { signal: options.signal } : {}),
    body: JSON.stringify({ revision: draft.revision, scene }),
  })
  if (isCancelled()) return null
  return saved
}

/** 宿主提供的「保存完当前主题光照」所需的薄上下文。 */
export interface EmbeddedBaseLightingTarget {
  fetchStudioApi: StudioApiFetch
  /** 当前场景风格（`appCtx.sceneStyle`）。 */
  sceneStyle: unknown
  /** 内存文档；保存成功后就地更新它，避免父页面同步前用户看到旧值。 */
  project?: {
    baseLightingByTheme?: Record<string, Record<string, unknown>>
    baseLighting?: Record<string, unknown>
  } | null
  /** 服务器 revision 已前进：调用方负责推进本地版本（否则下一次自动保存会 409）。 */
  advanceRevision?: (revision: number) => void
  /** 成功：父页面据此关闭光照面板。 */
  onSaved: () => void
  /** 失败：文案要可执行；调用方**不能**当作成功。 */
  onError: (message: string) => void
}

/**
 * 内嵌自动导图「保存光照」的完整落地：定向下发 → 推进 revision → 就地更新内存 → 回报。
 *
 * 与 `confirmLightingDialog`（编辑器内保存）的差别只有两点：不发整场景 PUT、
 * 不标记文档脏 —— iframe 里没有「整份文档」的所有权，父页面才是。
 */
export async function saveEmbeddedBaseLighting(
  target: EmbeddedBaseLightingTarget,
  theme: string,
  lighting: Record<string, unknown>,
): Promise<void> {
  try {
    const saved = await saveAutoDiagramLighting(target.fetchStudioApi, theme, lighting)
    if (!saved) return
    const savedRevision = Number(saved.revision)
    if (Number.isFinite(savedRevision)) target.advanceRevision?.(savedRevision)
    if (target.project) {
      target.project.baseLightingByTheme = { ...(target.project.baseLightingByTheme || {}), [theme]: { ...lighting } }
      if (theme === 'default') target.project.baseLighting = { ...lighting }
    }
    target.onSaved()
  } catch (error) {
    target.onError(error instanceof Error ? error.message : '光照保存失败，请重试。')
  }
}
