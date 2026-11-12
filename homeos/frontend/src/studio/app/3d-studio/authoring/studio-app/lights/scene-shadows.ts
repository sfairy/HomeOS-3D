import type { StudioAppRuntime } from '../runtime/studio-app-runtime'
import {
  selectShadowCastingLightIds as selectShadowCastingLightIds2,
  spotShadowTextureUnitLimit as spotShadowTextureUnitLimit2,
} from '../../../plan/geometry'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import { maxTextureUnitLimit, shadowTextureUnits, reservedTextureUnits } from '../../scene/payload/studio-scene-payload'

export function collectShadowCandidates(runtime: StudioAppRuntime, shadowSearchRoot = runtime.appCtx.sceneRootNode) {
  const shadowCandidates: any = []
  return (
    shadowSearchRoot?.traverse((shadowCandidateLight: any) => {
      if (!shadowCandidateLight.isSpotLight || shadowCandidateLight.userData?.shadowCandidate !== true) return
      const candidateFloorId = String(shadowCandidateLight.userData?.lightFloorId || ''),
        candidateItemId = String(shadowCandidateLight.userData?.lightItemId || '')
      candidateItemId &&
        shadowCandidates.push({
          id: candidateFloorId + ':' + candidateItemId,
          groupId: candidateFloorId + ':' + String(shadowCandidateLight.userData?.lightGroupId || ''),
          type: String(shadowCandidateLight.userData?.lightType || 'downlight'),
          brightness: finite2(shadowCandidateLight.userData?.lightBrightness, 0),
          enabled: shadowCandidateLight.visible !== false,
        })
    }),
    shadowCandidates
  )
}

export function setupSceneShadows(
  runtime: StudioAppRuntime,
  shadowSetupRoot = runtime.appCtx.sceneRootNode,
  { rebuildAtlas: shouldRebuildAtlas = true } = {},
) {
  if (runtime.isEmbedStageMode)
    return (
      shadowSetupRoot?.traverse((atlasLightObject: any) => {
        atlasLightObject.isLight &&
          atlasLightObject.userData?.lightItemId &&
          ((atlasLightObject.castShadow = false), atlasLightObject.layers.set(30))
        // 舞台没有射灯图集，但主方向光保留一张静态阴影图（见 studio-resource-policy
        // 的 stageSunShadow）。场景重建后必须显式打一次 needsUpdate，否则这张图会
        // 永远停在上一版户型上。
        atlasLightObject.isDirectionalLight && atlasLightObject.shadow && (atlasLightObject.shadow.needsUpdate = true)
      }),
      runtime.appCtx.threeRenderer &&
        ((runtime.appCtx.threeRenderer.domElement.dataset.spotShadowMode = 'region'),
        (runtime.appCtx.threeRenderer.domElement.dataset.activeSpotShadows = '0'),
        (runtime.appCtx.threeRenderer.shadowMap.needsUpdate = true)),
      0
    )
  if (!shadowSetupRoot || !runtime.appCtx.threeRenderer) return 0
  const xv2 = runtime.getMaxTextureUnits(),
    qv2 = runtime.findMaxMaterialTextures(shadowSetupRoot)
  let nonSpotShadowUnitCount = 0
  runtime.appCtx.threeScene?.traverse((nonSpotLightObject: any) => {
    nonSpotLightObject.visible !== false &&
      nonSpotLightObject.isLight &&
      !nonSpotLightObject.isSpotLight &&
      nonSpotLightObject.castShadow &&
      (nonSpotShadowUnitCount += 1)
  })
  let hasRectAreaLight = false
  shadowSetupRoot.traverse((rectAreaLightObject: any) => {
    rectAreaLightObject.visible !== false && rectAreaLightObject.isRectAreaLight && (hasRectAreaLight = true)
  })
  const rectAreaShadowUnits = hasRectAreaLight ? shadowTextureUnits : 0,
    // 分层灯光接管后，面光与方向光阴影都不再走 three 的「每盏灯一个纹理单元」，
    // 而是固定的「面光 2 个 LTC + 方向光 1 层数组纹理」。两者取大值，不能相加：
    // 图集路径与分层路径是互斥的，相加会把预算算得比实际紧张，提前把分层路径关掉。
    controllerAreaUnits = runtime.appCtx.lightPrecompileController?.areaTextureUnits?.() || 0,
    controllerDirectionalUnits = runtime.appCtx.lightPrecompileController?.directionalTextureUnits?.() || 0,
    Gw2 = Math.max(rectAreaShadowUnits, controllerAreaUnits),
    availableShadowUnits =
      xv2 - qv2 - Math.max(nonSpotShadowUnitCount, controllerDirectionalUnits) - Gw2 - reservedTextureUnits,
    shadowAtlasUnits =
      runtime.appCtx.lightPrecompileController?.textureUnitsFor?.(
        runtime
          .collectShadowCandidates(shadowSetupRoot)
          .filter((shadowCandidateLight: any) => shadowCandidateLight.enabled).length,
      ) || 1,
    shadowBudgetChanged = runtime.appCtx.lightPrecompileController?.setBudgetAvailable?.(
      availableShadowUnits >= shadowAtlasUnits,
    ),
    isAtlasFallback = runtime.appCtx.lightPrecompileController?.isFallback?.() === true
  if (
    !isAtlasFallback &&
    !runtime.appCtx.pendingRuntimeSettings &&
    runtime.appCtx.lightPrecompileController &&
    availableShadowUnits >= shadowAtlasUnits
  ) {
    const schedule =
        shouldRebuildAtlas || shadowBudgetChanged
          ? runtime.appCtx.lightPrecompileController.schedule(shadowSetupRoot)
          : runtime.collectShadowCandidates(shadowSetupRoot).length,
      sync = runtime.appCtx.lightPrecompileController.sync(shadowSetupRoot),
      domElement7 = runtime.appCtx.threeRenderer.domElement
    ;(domElement7.dataset.fragmentTextureUnits = String(xv2)),
      (domElement7.dataset.materialTextureUnits = String(qv2)),
      (domElement7.dataset.spotShadowLimit = String(schedule)),
      (domElement7.dataset.activeSpotShadows = String(sync))
    let activeUserLightCount = 0
    return (
      shadowSetupRoot.traverse((countedUserLight: any) => {
        countedUserLight.isLight &&
          countedUserLight.userData?.lightItemId &&
          countedUserLight.visible !== false &&
          (activeUserLightCount += 1)
      }),
      (domElement7.dataset.activeUserLights = String(activeUserLightCount)),
      sync
    )
  }
  const spotShadowLimit = spotShadowTextureUnitLimit2({
    maxTextureUnits: xv2,
    materialTextureUnits: qv2,
    nonSpotShadowTextureUnits: nonSpotShadowUnitCount,
    rectAreaLightTextureUnits: Gw2,
    reservedTextureUnits: runtime.appCtx.lightPrecompileController
      ? Math.max(reservedTextureUnits, shadowAtlasUnits)
      : reservedTextureUnits,
    hardLimit: maxTextureUnitLimit,
  })
  runtime.appCtx.lightPrecompileController &&
    (runtime.appCtx.pendingRuntimeSettings && runtime.appCtx.lightPrecompileController.setEnabled(false),
    runtime.appCtx.lightPrecompileController.sync(shadowSetupRoot))
  const castShadowLightIdSet = new Set(
    selectShadowCastingLightIds2(runtime.collectShadowCandidates(shadowSetupRoot), spotShadowLimit),
  )
  let appliedSpotShadowCount = 0
  shadowSetupRoot.traverse((spotShadowLight: any) => {
    if (!spotShadowLight.isSpotLight || !spotShadowLight.userData?.lightItemId) return
    const spotLightKey =
        String(spotShadowLight.userData?.lightFloorId || '') + ':' + String(spotShadowLight.userData.lightItemId),
      isSpotShadowEnabled = castShadowLightIdSet.has(spotLightKey)
    ;(spotShadowLight.castShadow = isSpotShadowEnabled),
      isSpotShadowEnabled &&
        ((appliedSpotShadowCount += 1),
        spotShadowLight.shadow && !spotShadowLight.shadow.map && (spotShadowLight.shadow.needsUpdate = true))
  })
  const domElement8 = runtime.appCtx.threeRenderer.domElement
  ;(domElement8.dataset.spotShadowMode = 'individual'),
    (domElement8.dataset.fragmentTextureUnits = String(xv2)),
    (domElement8.dataset.materialTextureUnits = String(qv2)),
    (domElement8.dataset.spotShadowLimit = String(spotShadowLimit)),
    (domElement8.dataset.activeSpotShadows = String(appliedSpotShadowCount))
  let visibleUserLightCount = 0
  return (
    shadowSetupRoot.traverse((visibleUserLight: any) => {
      visibleUserLight.isLight &&
        visibleUserLight.userData?.lightItemId &&
        visibleUserLight.visible !== false &&
        (visibleUserLightCount += 1)
    }),
    (domElement8.dataset.activeUserLights = String(visibleUserLightCount)),
    appliedSpotShadowCount
  )
}
