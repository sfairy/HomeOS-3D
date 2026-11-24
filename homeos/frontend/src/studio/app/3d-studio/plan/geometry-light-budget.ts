/**
 * 灯光 / 阴影预算：按灯类型与设备能力决定「渲染多少、用多大阴影贴图」。
 *
 * 从 `geometry.ts` 拆出（纯移动，无逻辑改动）：这一组只依赖 `clamp`，与墙体/多边形
 * 几何没有任何交集，放在一起是为了让 `geometry.ts` 只保留「平面几何」这一件事。
 * 消费方仍从 `./geometry` 导入（那里 `export *` 转发），调用点无需改动。
 */
import { clamp } from './geometry-clamp'

export function spotLightBrightnessResponse(lightType = 'downlight', rawBrightness = 0) {
  const normalizedBrightness = clamp(Number(rawBrightness) || 0, 0, 1),
    squaredBrightness = normalizedBrightness * normalizedBrightness
  if (lightType !== 'ceilinglight' || normalizedBrightness <= 0 || normalizedBrightness >= 0.35)
    return squaredBrightness
  const spillLight = 0.08 * normalizedBrightness * (1 - normalizedBrightness / 0.35)
  return squaredBrightness + spillLight
}

export function adaptiveLightRenderCost(lights: any[] = []) {
  return lights.reduce(
    (accumulatedCost, light) =>
      light?.enabled === false || Math.max(0, Number(light?.brightness) || 0) <= 0
        ? accumulatedCost
        : light?.type === 'striplight'
          ? accumulatedCost + 0.3
          : light?.type === 'ceilinglight'
            ? accumulatedCost + (Number(light?.angle) >= 140 ? 1.65 : 1.1)
            : light?.type === 'downlight'
              ? accumulatedCost + 1
              : accumulatedCost,
    0,
  )
}

export function adaptiveDeviceLightBudget({ hardwareConcurrency = 4, deviceMemory = 8, previewPixels = 500000 } = {}) {
  const concurrencyCount = clamp(Number(hardwareConcurrency) || 4, 2, 24),
    memoryGb = clamp(Number(deviceMemory) || 8, 2, 32),
    previewPixelCount = clamp(Number(previewPixels) || 500000, 120000, 4000000),
    baseFrameCost = 4.5 + Math.min(concurrencyCount, 16) * 0.55,
    memoryFactor = memoryGb <= 4 ? 0.78 : memoryGb < 8 ? 0.88 : memoryGb >= 16 ? 1.1 : 1,
    resolutionFactor = clamp(Math.sqrt(500000 / previewPixelCount), 0.72, 1.2)
  return clamp(baseFrameCost * memoryFactor * resolutionFactor, 4, 16)
}

export function assessAdaptiveRenderFrames(frameTimes: any[] = []) {
  const validFrameTimes = frameTimes
    .map(Number)
    .filter((frameTimeMs) => Number.isFinite(frameTimeMs) && frameTimeMs >= 8 && frameTimeMs <= 120)
  if (validFrameTimes.length < 12)
    return {
      sufficient: false,
      sampleCount: validFrameTimes.length,
    }
  const sortedFrameTimes = [...validFrameTimes].sort((leftFrameMs, rightFrameMs) => leftFrameMs - rightFrameMs),
    sampleAtQuantile = (quantile: any) =>
      sortedFrameTimes[Math.min(Math.floor((sortedFrameTimes.length - 1) * quantile), sortedFrameTimes.length - 1)],
    averageFrameMs =
      validFrameTimes.reduce((runningTotal, frameMs) => runningTotal + frameMs, 0) / validFrameTimes.length,
    p75FrameMs = sampleAtQuantile(0.75),
    p90FrameMs = sampleAtQuantile(0.9)
  return {
    sufficient: true,
    sampleCount: validFrameTimes.length,
    averageFrameMs: averageFrameMs,
    p75FrameMs: p75FrameMs,
    p90FrameMs: p90FrameMs,
    fps: 1000 / averageFrameMs,
    severe: averageFrameMs >= 45 || p75FrameMs >= 50 || p90FrameMs >= 68,
    slow: averageFrameMs >= 34 || p75FrameMs >= 38 || p90FrameMs >= 55,
    smooth: averageFrameMs <= 24 && p90FrameMs <= 32,
  }
}

export function planLabelProjectionMetrics(planWidthPx: any, planHeightPx: any, baselineRatio = 0.86) {
  const widthPx = Math.max(0, Number(planWidthPx) || 0),
    heightPx = Math.max(0, Number(planHeightPx) || 0),
    clampedBaselineRatio = clamp(Number.isFinite(Number(baselineRatio)) ? Number(baselineRatio) : 0.86, 0.3, 1)
  return {
    titleStartX: -widthPx * (0.5 - 115 / 2048),
    titleY: heightPx * (130 / 640 - 0.5),
    titleFontSize: (heightPx * 184) / 640,
    titleMaxWidth: (widthPx * 1340) / 2048,
    iconX: widthPx * (1580 / 2048 - 0.5),
    iconY: heightPx * (130 / 640 - 0.5),
    iconSize: (heightPx * 170) / 640,
    subtitleStartX: -widthPx * (0.5 - 72 / 2048),
    subtitleY: heightPx * (410 / 640 - 0.5),
    subtitleFontSize: (heightPx * 310) / 640,
    subtitleMaxWidth: (widthPx * 1880) / 2048,
    baselineY: heightPx * (590 / 640 - 0.5),
    baselineStartX: -widthPx * (0.5 - 74 / 2048),
    baselineLength: ((widthPx * 1880) / 2048) * clampedBaselineRatio,
    baselineLineWidth: (heightPx * 16) / 640,
    baselineCapHalfHeight: (heightPx * 24) / 640,
  }
}

export function selectShadowCastingLightIds(lightEntries: any[] = [], maxLightCount = 8) {
  const lightLimit = Math.max(0, Math.floor(Number(maxLightCount) || 0))
  if (lightLimit === 0) return []
  const normalizedLights = lightEntries
    .map((sourceLight, lightIndex) => ({
      id: String(sourceLight?.id || ''),
      groupId: String(sourceLight?.groupId || ''),
      type: String(sourceLight?.type || ''),
      brightness: Math.max(0, Number(sourceLight?.brightness) || 0),
      enabled: sourceLight?.enabled !== false,
      index: lightIndex,
    }))
    .filter(
      (isShadowCastingLight) =>
        isShadowCastingLight.id &&
        isShadowCastingLight.enabled &&
        isShadowCastingLight.brightness > 0 &&
        isShadowCastingLight.type !== 'striplight',
    )
    .map((scoredLight) => ({
      ...scoredLight,
      score: scoredLight.brightness * (scoredLight.type === 'ceilinglight' ? 1.08 : 1),
    }))
  if (normalizedLights.length <= lightLimit) return normalizedLights.map((mappedLight) => mappedLight.id)
  const compareLights = (leftLight: any, rightLight: any) =>
      rightLight.score - leftLight.score || leftLight.index - rightLight.index,
    bestLightByGroup = new Map()
  for (const groupLight of normalizedLights) {
    const groupKey = groupLight.groupId || '__ungrouped-' + groupLight.index,
      currentBestLight = bestLightByGroup.get(groupKey)
    ;(!currentBestLight || compareLights(groupLight, currentBestLight) < 0) &&
      bestLightByGroup.set(groupKey, groupLight)
  }
  const selectedLights = [...bestLightByGroup.values()].sort(compareLights).slice(0, lightLimit)
  if (selectedLights.length < lightLimit) {
    const selectedLightIdSet = new Set(selectedLights.map((pickedLight) => pickedLight.id)),
      remainingLights = normalizedLights
        .filter((remainingLight) => !selectedLightIdSet.has(remainingLight.id))
        .sort(compareLights)
    selectedLights.push(...remainingLights.slice(0, lightLimit - selectedLights.length))
  }
  return selectedLights.map((selectedLight) => selectedLight.id)
}

export function spotShadowTextureUnitLimit({
  maxTextureUnits = 16,
  materialTextureUnits = 0,
  nonSpotShadowTextureUnits = 1,
  rectAreaLightTextureUnits = 0,
  reservedTextureUnits = 1,
  hardLimit = 8,
} = {}) {
  const availableTextureUnits = Math.max(0, Math.floor(Number(maxTextureUnits) || 0)),
    reservedTextureUnitTotal = [
      materialTextureUnits,
      nonSpotShadowTextureUnits,
      rectAreaLightTextureUnits,
      reservedTextureUnits,
    ].reduce(
      (textureUnitTotal, textureUnitCount) => textureUnitTotal + Math.max(0, Math.floor(Number(textureUnitCount) || 0)),
      0,
    ),
    hardLimitValue = Math.max(0, Math.floor(Number(hardLimit) || 0)),
    softTextureLimit = availableTextureUnits <= 16 ? 3 : availableTextureUnits <= 24 ? 6 : hardLimitValue
  return Math.min(hardLimitValue, softTextureLimit, Math.max(0, availableTextureUnits - reservedTextureUnitTotal))
}

export function localSpotShadowSettings(fixtureType = 'downlight', shadowRangeMeters = 3.5, spotAngleDeg = 90) {
  const shadowRange = clamp(Number.isFinite(Number(shadowRangeMeters)) ? Number(shadowRangeMeters) : 3.5, 0.5, 10),
    clampedAngleDeg = clamp(Number.isFinite(Number(spotAngleDeg)) ? Number(spotAngleDeg) : 90, 15, 180),
    usesWideShadowMap = fixtureType === 'ceilinglight' && clampedAngleDeg >= 140
  return {
    mapSize: usesWideShadowMap ? 512 : 256,
    radius: usesWideShadowMap ? 2 : 1.75,
    blurSamples: usesWideShadowMap ? 12 : 12,
    normalBias: 0.018,
    wideCeilingLight: usesWideShadowMap,
    range: shadowRange,
    angle: clampedAngleDeg,
  }
}
