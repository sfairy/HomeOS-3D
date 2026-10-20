























import * as ns2 from "/static/vendor/three/0.186.1/three.module.min.js";
import {
  lightEffectColorHex as lightEffectColorHex2,
} from "../../../../bridge/light-motion";
import {
  clamp as clamp2,
  localSpotShadowSettings as localSpotShadowSettings2,
  spotLightBrightnessResponse as spotLightBrightnessResponse2,
} from "../../../plan/geometry";










import {
  finite as finite2,
  kelvinToRgbHex as kelvinToRgbHex2,
  normalizeFullRotation as normalizeFullRotation2,
} from "../../../loaders/studio-normalization";








import {
  lightPresetCatalog,
  lightIntensityFactor,
  lightAngleLimitForType,
} from '../../lights/studio-app-light-data';









import type { StudioAppContext } from "../studio-app-context";
export interface AddLightModelDeps { appCtx: StudioAppContext; areLightsEnabled: any; clampShadowMapSize: any; isEmbedStageMode: any; isEmbeddedStage: any; isLampEnabled: any; lampsLayerIndex: any; resolveLightGroup: any; }

export function addLightModel(deps: AddLightModelDeps, lightModelParent: any, lightModelItem: any, shadowLightIdSet: any) {
  const { appCtx, areLightsEnabled, clampShadowMapSize, isEmbedStageMode, isEmbeddedStage, isLampEnabled, lampsLayerIndex, resolveLightGroup } = deps;

  const lightColorHex = isEmbeddedStage
      ? lightEffectColorHex2(lightModelItem.lightTemperature, lightModelItem.lightColorRgb)
      : kelvinToRgbHex2(lightModelItem.lightTemperature),
    eu3 = isLampEnabled(lightModelItem) && finite2(lightModelItem.lightBrightness, 0) > 0,
    isLightPreviewEnabled =
      !appCtx.pendingRuntimeSettings &&
      appCtx.overriddenFloorIds === null &&
      (isEmbeddedStage || !areLightsEnabled()),
    Xr3 = !appCtx.pendingRuntimeSettings && appCtx.isResidentCacheMode;
  if (!eu3 && !isLightPreviewEnabled && !Xr3) return;
  const downlight4 = (lightPresetCatalog as any)[lightModelItem.type] || lightPresetCatalog.downlight,
    lightBrightnessRatio =
      clamp2(
        finite2(lightModelItem.lightBrightness, downlight4.brightness),
        0,
        isEmbeddedStage ? 150 : 100,
      ) / 100,
    lightTypeIntensityFactor = (lightIntensityFactor as any)[lightModelItem.type] || 1.1,
    isStripLight = lightModelItem.type === "striplight",
    zl6 = resolveLightGroup(lightModelItem);
  if (isStripLight) {
    const lightRange = clamp2(finite2(lightModelItem.lightRange, downlight4.range), 0.5, 10),
      lightRangeFactor = clamp2(lightRange / downlight4.range, 0.45, 1.65),
      lightElevation = Math.max(finite2(lightModelItem.elevation, 2.7), 0.4),
      lightElevationFactor = clamp2(Math.max(1, Math.pow(lightElevation / 2.7, 2)), 1, 4),
      stripRollRotationDeg = normalizeFullRotation2(lightModelItem.stripRollRotation),
      lightRotationGroup = new ns2.Group();
    lightRotationGroup.rotation.z = ns2.MathUtils.degToRad(
      normalizeFullRotation2(lightModelItem.verticalRotation),
    );
    const lightOnIntensity =
      48 *
      (isEmbedStageMode ? lightBrightnessRatio : Math.pow(lightBrightnessRatio, 0.82)) *
      lightRangeFactor *
      lightElevationFactor *
      lightTypeIntensityFactor;

    const lightRollGroup = new ns2.Group();
    lightRollGroup.rotation.x = ns2.MathUtils.degToRad(stripRollRotationDeg);
    const rectAreaLight = new ns2.RectAreaLight(
      lightColorHex,
      eu3 ? lightOnIntensity : 0,
      Math.max(0.1, finite2(lightModelItem.width, 1)) * 0.94,
      Math.max(0.1, finite2(lightModelItem.depth, 0.28)) * 0.94,
    );
    ((rectAreaLight.visible = eu3),
      (rectAreaLight.position.y = -0.04),
      (rectAreaLight.rotation.x = -Math.PI / 2),
      (rectAreaLight.userData.lightItemId = lightModelItem.id),
      (rectAreaLight.userData.lightGroupId = zl6?.id || ""),
      (rectAreaLight.userData.lightFloorId = appCtx.activeFloorId),
      (rectAreaLight.userData.lightSourceType = "continuous-area-strip"),
      (rectAreaLight.userData.lightOnIntensity = lightOnIntensity),
      isEmbedStageMode &&
        ((rectAreaLight.userData.regionFullIntensity =
          48 * lightRangeFactor * lightElevationFactor * lightTypeIntensityFactor),
        appCtx.regionLightController?.register(rectAreaLight, lightModelItem)),
      lightRollGroup.add(rectAreaLight),
      lightRotationGroup.add(lightRollGroup));
    lightModelParent.add(lightRotationGroup);
    return;
  }
  const isInShadowSet = shadowLightIdSet?.has(lightModelItem.id) === true,
    shouldCastShadow = isInShadowSet || Xr3 || isLightPreviewEnabled,
    spotLightRange = clamp2(finite2(lightModelItem.lightRange, downlight4.range), 0.5, 10),
    spotLightAngle = clamp2(
      finite2(lightModelItem.lightAngle, downlight4.angle),
      15,
      lightAngleLimitForType(lightModelItem.type),
    ),
    spotLightCount = 1,
    spotLightIntensity =
      (lightModelItem.type === "ceilinglight" ? 680 : 520) *
      (isEmbedStageMode
        ? lightBrightnessRatio
        : spotLightBrightnessResponse2(lightModelItem.type, lightBrightnessRatio) *
          Math.max(1, lightBrightnessRatio)) *
      lightTypeIntensityFactor;
  for (let spotLightIndex = 0; spotLightIndex < spotLightCount; spotLightIndex += 1) {
    const spotLightX =
        spotLightCount === 1
          ? 0
          : -lightModelItem.width * 0.47 +
            (lightModelItem.width * 0.94 * spotLightIndex) / (spotLightCount - 1),
      spotLight = new ns2.SpotLight(
        lightColorHex,
        eu3 ? spotLightIntensity / spotLightCount : 0,
        spotLightRange,
        ns2.MathUtils.degToRad(spotLightAngle / 2),
        0.86,
        2,
      );
    if (
      ((spotLight.visible = eu3),
      spotLight.position.set(spotLightX, -0.025, 0),
      (spotLight.castShadow = false),
      spotLight.layers.enable(lampsLayerIndex),
      shouldCastShadow)
    ) {
      const spotShadowSettings = localSpotShadowSettings2(
          lightModelItem.type,
          spotLightRange,
          spotLightAngle,
        ),
        $y2 = clampShadowMapSize(spotShadowSettings.mapSize);
      (spotLight.shadow.mapSize.set($y2, $y2),
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
        (spotLight.shadow.needsUpdate = isInShadowSet));
    }
    ((spotLight.userData.lightItemId = lightModelItem.id),
      (spotLight.userData.lightGroupId = zl6?.id || ""),
      (spotLight.userData.lightFloorId = appCtx.activeFloorId),
      (spotLight.userData.lightType = lightModelItem.type),
      (spotLight.userData.lightBrightness = finite2(
        lightModelItem.lightBrightness,
        downlight4.brightness,
      )),
      (spotLight.userData.shadowCandidate = true),
      (spotLight.userData.prewarmShadow = isEmbeddedStage),
      (spotLight.userData.lightOnIntensity = spotLightIntensity / spotLightCount),
      isEmbedStageMode &&
        ((spotLight.userData.regionFullIntensity =
          (lightModelItem.type === "ceilinglight" ? 680 : 520) * lightTypeIntensityFactor),
        appCtx.regionLightController?.register(spotLight, lightModelItem)));
    const spotLightTarget = new ns2.Object3D();
    (spotLightTarget.position.set(
      spotLightX,
      -Math.max(finite2(lightModelItem.elevation, 2.68), 0.8),
      0,
    ),
      lightModelParent.add(spotLightTarget),
      (spotLight.target = spotLightTarget),
      lightModelParent.add(spotLight));
  }

}
