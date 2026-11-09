import * as ns2 from '/static/vendor/three/0.187.0/three.module.min.js'
import { lightEffectColorHex as lightEffectColorHex2 } from '../../../../bridge/light-motion'
import { clamp as clamp2, localSpotShadowSettings as localSpotShadowSettings2 } from '../../../plan/geometry'

import { finite as finite2 } from '../../../loaders/studio-normalization'

import {
  lightPresetCatalog,
  lightIntensityFactor,
  lightAngleLimitForType,
  lightBrightnessResponse,
  lightFluxLumens,
  renderCandelaFromFlux,
} from '../../lights/studio-app-light-data'
import { createStripRectAreaLight } from '../../lights/strip-light/strip-light-model'

import type { StudioAppContext } from '../studio-app-context'
export interface AddLightModelDeps {
  appCtx: StudioAppContext
  areLightsEnabled: any
  clampShadowMapSize: any
  isEmbedStageMode: any
  isEmbeddedStage: any
  isLampEnabled: any
  lampsLayerIndex: any
  resolveLightGroup: any
}

export function addLightModel(
  deps: AddLightModelDeps,
  lightModelParent: any,
  lightModelItem: any,
  shadowLightIdSet: any,
) {
  const {
    appCtx,
    areLightsEnabled,
    clampShadowMapSize,
    isEmbedStageMode,
    isEmbeddedStage,
    isLampEnabled,
    lampsLayerIndex,
    resolveLightGroup,
  } = deps

  // 建灯与渲染循环的淡入淡出用同一个取色函数，否则开灯第一帧颜色会跳一下。
  const lightColorHex = lightEffectColorHex2(lightModelItem.lightTemperature, lightModelItem.lightColorRgb),
    eu3 = isLampEnabled(lightModelItem) && finite2(lightModelItem.lightBrightness, 0) > 0,
    isLightPreviewEnabled =
      !appCtx.pendingRuntimeSettings && appCtx.overriddenFloorIds === null && (isEmbeddedStage || !areLightsEnabled()),
    Xr3 = !appCtx.pendingRuntimeSettings && appCtx.isResidentCacheMode
  if (!eu3 && !isLightPreviewEnabled && !Xr3) return
  const downlight4 = (lightPresetCatalog as any)[lightModelItem.type] || lightPresetCatalog.downlight,
    lightBrightnessRatio =
      clamp2(finite2(lightModelItem.lightBrightness, downlight4.brightness), 0, isEmbeddedStage ? 150 : 100) / 100,
    lightTypeIntensityFactor = (lightIntensityFactor as any)[lightModelItem.type] || 1.1,
    zl6 = resolveLightGroup(lightModelItem)
  if (lightModelItem.type === 'striplight') {
    // 位姿 / 尺寸 / 亮度都在 `strip-light-spec.ts`；发光本体在物件模型阶段另建（不进灯光缓存）。
    const rectAreaLight = createStripRectAreaLight(lightModelItem, {
      colorHex: lightColorHex,
      isOn: eu3,
      isEmbedStage: isEmbedStageMode,
      floorId: appCtx.activeFloorId,
      groupId: zl6?.id || '',
    })
    isEmbedStageMode && appCtx.regionLightController?.register(rectAreaLight, lightModelItem)
    lightModelParent.add(rectAreaLight)
    return
  }
  const isInShadowSet = shadowLightIdSet?.has(lightModelItem.id) === true,
    spotLightRange = clamp2(finite2(lightModelItem.lightRange, downlight4.range), 0.5, 10),
    spotLightAngle = clamp2(
      finite2(lightModelItem.lightAngle, downlight4.angle),
      15,
      lightAngleLimitForType(lightModelItem.type),
    ),
    spotLightCount = 1,
    // 轴向光强 = 光通量 / 光束立体角：同一只灯收窄光束会变亮，这是现实里换反光杯的行为。
    // 之前是写死常量（筒灯 520 / 吊灯 680），改光束角对亮度毫无影响。
    // `renderCandelaFromFlux` 里含「渲染白点」标定与窄光束上限：出厂 48° 仍是 520 cd。
    spotLightCandela = renderCandelaFromFlux(
      lightModelItem.type,
      lightFluxLumens[lightModelItem.type] ?? lightFluxLumens.downlight,
      spotLightAngle,
    ),
    spotLightIntensity =
      spotLightCandela *
      lightBrightnessResponse(lightModelItem.type, lightBrightnessRatio, isEmbedStageMode) *
      lightTypeIntensityFactor
  for (let spotLightIndex = 0; spotLightIndex < spotLightCount; spotLightIndex += 1) {
    const spotLightX =
        spotLightCount === 1
          ? 0
          : -lightModelItem.width * 0.47 + (lightModelItem.width * 0.94 * spotLightIndex) / (spotLightCount - 1),
      spotLight = new ns2.SpotLight(
        lightColorHex,
        eu3 ? spotLightIntensity / spotLightCount : 0,
        spotLightRange,
        ns2.MathUtils.degToRad(spotLightAngle / 2),
        0.86,
        2,
      )
    ;(spotLight.visible = eu3),
      spotLight.position.set(spotLightX, -0.025, 0),
      (spotLight.castShadow = false),
      spotLight.layers.enable(lampsLayerIndex)
    // 阴影相机必须对每盏灯都配好：图集会给所有候选射灯渲染阴影，不只是前 8 盏。
    // 没配的灯 `shadow.camera.layers` 停在默认图层 0，而墙体遮挡体只挂在灯光图层上，
    // 深度图里没有墙，整片光斑直接穿墙照进隔壁房间。
    const spotShadowSettings = localSpotShadowSettings2(lightModelItem.type, spotLightRange, spotLightAngle),
      $y2 = clampShadowMapSize(spotShadowSettings.mapSize)
    spotLight.shadow.mapSize.set($y2, $y2),
      (spotLight.shadow.camera.near = clamp2(spotLightRange * 0.05, 0.12, 0.24)),
      (spotLight.shadow.camera.far = spotLightRange),
      spotLight.shadow.camera.layers.set(lampsLayerIndex),
      (spotLight.shadow.bias = -0.00005),
      (spotLight.shadow.normalBias = spotShadowSettings.normalBias),
      (spotLight.shadow.radius = spotShadowSettings.radius),
      (spotLight.shadow.blurSamples = appCtx.isGroundShadowEnabled
        ? Math.max(8, spotShadowSettings.blurSamples)
        : spotShadowSettings.blurSamples),
      (spotLight.shadow.autoUpdate = false),
      (spotLight.shadow.needsUpdate = isInShadowSet)
    ;(spotLight.userData.lightItemId = lightModelItem.id),
      (spotLight.userData.lightGroupId = zl6?.id || ''),
      (spotLight.userData.lightFloorId = appCtx.activeFloorId),
      (spotLight.userData.lightType = lightModelItem.type),
      (spotLight.userData.lightBrightness = finite2(lightModelItem.lightBrightness, downlight4.brightness)),
      (spotLight.userData.shadowCandidate = true),
      (spotLight.userData.prewarmShadow = isEmbeddedStage),
      (spotLight.userData.lightOnIntensity = spotLightIntensity / spotLightCount),
      isEmbedStageMode &&
        ((spotLight.userData.regionFullIntensity = spotLightCandela * lightTypeIntensityFactor),
        appCtx.regionLightController?.register(spotLight, lightModelItem))
    const spotLightTarget = new ns2.Object3D()
    spotLightTarget.position.set(spotLightX, -Math.max(finite2(lightModelItem.elevation, 2.68), 0.8), 0),
      lightModelParent.add(spotLightTarget),
      (spotLight.target = spotLightTarget),
      lightModelParent.add(spotLight)
  }
}
