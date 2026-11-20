import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { applySunShadowTuning } from '../../scene/studio-sun-shadow-tuning'
import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { clamp as clamp2 } from '../../../plan/geometry'
import { syncControlValue as syncControlValue2 } from '../../ui/ui-controls'
import {
  DEFAULT_BASE_LIGHTING as DEFAULT_BASE_LIGHTING2,
  finite as finite2,
  normalizeBaseLighting as normalizeBaseLighting2,
  normalizeBaseLightingByTheme as normalizeBaseLightingByTheme2,
} from '../../../loaders/studio-normalization'
import { normalizeSceneStyle } from '../../../../shared/scene-styles'
import { minTextureSize } from '../../scene/payload/studio-scene-payload'

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
