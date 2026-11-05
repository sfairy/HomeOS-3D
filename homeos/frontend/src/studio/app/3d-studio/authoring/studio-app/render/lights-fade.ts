/** 灯光组淡入 / 淡出帧步进（从 `functions/groups/render-stats-and-frame-loop` 拆出）。 */

import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import { clamp as clamp2 } from '../../../plan/geometry'
import { finite as finite2 } from '../../../loaders/studio-normalization'

type FadeLightLike = {
  isLight?: boolean
  visible: boolean
  intensity: number
  userData: { lightGroupId?: string; lightOnIntensity?: number }
}

type FadeLightEntry = { object: FadeLightLike; from: number; to: number }

export function fadeLightsIn(
  runtime: StudioAppRuntime,
  lightGroupIdList: string[],
  fadeDurationMs = runtime.lightTransitionMs,
) {
  const uniqueLightGroupIds = [...new Set(lightGroupIdList)].filter(Boolean)
  if (!uniqueLightGroupIds.length) return
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
  }))
  if ((cancelAnimationFrame(runtime.appCtx.lightCaptureFrameId), !runtime.appCtx.isCacheReady)) {
    for (const lightFadeEntry of lightFadeEntries)
      runtime.appCtx.lightGainByFloor.set(lightFadeEntry.groupId, lightFadeEntry.to)
    runtime.appCtx.isCapturingLights || runtime.scheduleStudioRender(0)
    return
  }
  const fadeStartMs = performance.now(),
    fadeFrameStep = (fadeTimestamp: number) => {
      // 实例可能已在淡入过程中被回收（SPA 换页 / GPU 上下文丢失）：渲染器一旦释放，
      // 这个自续约的帧步进必须自己停下，否则会永远对着已 dispose 的 scene 出帧。
      if (!runtime.appCtx.threeRenderer || runtime.appCtx.isDisposed) {
        runtime.appCtx.lightCaptureFrameId = 0
        return
      }
      const fadeProgress = clamp2((fadeTimestamp - fadeStartMs) / fadeDurationMs, 0, 1),
        easedFadeProgress = fadeProgress * fadeProgress * (3 - 2 * fadeProgress)
      for (const lightFadeTarget of lightFadeEntries)
        runtime.appCtx.lightGainByFloor.set(
          lightFadeTarget.groupId,
          lightFadeTarget.from + (lightFadeTarget.to - lightFadeTarget.from) * easedFadeProgress,
        )
      runtime.restoreLightVisibility(),
        fadeProgress < 1
          ? (runtime.appCtx.lightCaptureFrameId = requestAnimationFrame(fadeFrameStep))
          : (runtime.appCtx.lightCaptureFrameId = 0)
    }
  runtime.appCtx.lightCaptureFrameId = requestAnimationFrame(fadeFrameStep)
}

export function fadeLightsOut(
  runtime: StudioAppRuntime,
  fadeGroupIdList: string[],
  fadeOutDurationMs = runtime.lightTransitionMs,
) {
  if (!runtime.appCtx.sceneRootNode) return false
  const fadeGroupIdSet = new Set(fadeGroupIdList),
    ht3 = runtime.areLightsEnabled() && !runtime.appCtx.pendingRuntimeSettings,
    fadeLightEntries: FadeLightEntry[] = []
  if (
    (runtime.appCtx.sceneRootNode.traverse((fadeLightObject: FadeLightLike) => {
      const lightGroupId = fadeLightObject.userData?.lightGroupId
      if (!fadeLightObject.isLight || !lightGroupId || !fadeGroupIdSet.has(lightGroupId)) return
      const targetLightIntensity =
        runtime.findLightGroup(lightGroupId)?.enabled !== false && !ht3
          ? finite2(fadeLightObject.userData.lightOnIntensity, 0)
          : 0
      targetLightIntensity > 0 && (fadeLightObject.visible = true),
        fadeLightEntries.push({
          object: fadeLightObject,
          from: finite2(fadeLightObject.intensity, 0),
          to: targetLightIntensity,
        })
    }),
    !fadeLightEntries.length)
  )
    return false
  fadeLightEntries.some(({ to: fadeListEntry }) => fadeListEntry > 0) &&
    runtime.setupSceneShadows(runtime.appCtx.sceneRootNode, {
      rebuildAtlas: false,
    }),
    cancelAnimationFrame(runtime.appCtx.cacheWarmFrameId)
  const fadeOutStartMs = performance.now(),
    fadeOutFrameStep = (fadeOutTimestamp: number) => {
      if (!runtime.appCtx.threeRenderer || runtime.appCtx.isDisposed) {
        runtime.appCtx.cacheWarmFrameId = 0
        return
      }
      const fadeOutProgress = clamp2((fadeOutTimestamp - fadeOutStartMs) / fadeOutDurationMs, 0, 1),
        easedFadeOutProgress = fadeOutProgress * fadeOutProgress * (3 - 2 * fadeOutProgress)
      for (const fadeOutLightEntry of fadeLightEntries)
        fadeOutLightEntry.object.intensity =
          fadeOutLightEntry.from + (fadeOutLightEntry.to - fadeOutLightEntry.from) * easedFadeOutProgress
      if ((runtime.renderStudioFrame(), fadeOutProgress < 1))
        runtime.appCtx.cacheWarmFrameId = requestAnimationFrame(fadeOutFrameStep)
      else {
        runtime.appCtx.cacheWarmFrameId = 0
        let hasVisibilityChange = false
        for (const fadeOutTarget of fadeLightEntries)
          fadeOutTarget.to > 0 || ((fadeOutTarget.object.visible = false), (hasVisibilityChange = true))
        hasVisibilityChange &&
          runtime.setupSceneShadows(runtime.appCtx.sceneRootNode, {
            rebuildAtlas: false,
          })
      }
    }
  return ((runtime.appCtx.cacheWarmFrameId = requestAnimationFrame(fadeOutFrameStep)), true)
}
