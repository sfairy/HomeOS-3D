import { clamp as clamp2 } from "../../../plan/geometry";
import { finite as finite2 } from "../../../loaders/studio-normalization";
import {
  lightIntensityFactor,
  lightPresetCatalog,
  lightFluxLumens,
  lightAngleLimitForType,
  renderCandelaFromFlux,
  renderLuminanceFromFlux,
} from "../../lights/studio-app-light-data";

/**
 * 灯具「全亮」时的强度（cd / 灯带则是 cd·m⁻²）。
 *
 * 这份数值必须和 `addLightModel` 建灯时用的完全一致 —— 开关灯与调亮度的淡入淡出
 * 都以它为 1.0 基准，两边算法不一致就会出现「点一下灯，亮度先跳一下」。
 */
export function computeDownlightRange(runStudioRenderLoopLightItem: any) {
  const lightPreset =
      (lightPresetCatalog as any)[runStudioRenderLoopLightItem.type] || lightPresetCatalog.downlight,
    downlightTypeScale = (lightIntensityFactor as any)[runStudioRenderLoopLightItem.type] || 1.1;
  if (runStudioRenderLoopLightItem.type !== "striplight") {
    const beamAngle = clamp2(
      finite2(runStudioRenderLoopLightItem.lightAngle, lightPreset.angle),
      15,
      lightAngleLimitForType(runStudioRenderLoopLightItem.type),
    );
    return (
      renderCandelaFromFlux(
        runStudioRenderLoopLightItem.type,
        lightFluxLumens[runStudioRenderLoopLightItem.type] ?? lightFluxLumens.downlight,
        beamAngle,
      ) * downlightTypeScale
    );
  }
  const downlightRange = clamp2(
      finite2(runStudioRenderLoopLightItem.lightRange, lightPreset.range),
      0.5,
      10,
    ),
    downlightElevation = Math.max(finite2(runStudioRenderLoopLightItem.elevation, 2.7), 0.4);
  return (
    renderLuminanceFromFlux(
      "striplight",
      lightFluxLumens.striplight,
      clamp2(finite2(runStudioRenderLoopLightItem.width, 2), 0.1, 8) * 0.94,
      clamp2(finite2(runStudioRenderLoopLightItem.depth, 0.28), 0.1, 8) * 0.94,
    ) *
    clamp2(downlightRange / lightPreset.range, 0.45, 1.65) *
    clamp2(Math.max(1, Math.pow(downlightElevation / 2.7, 2)), 1, 4) *
    downlightTypeScale
  );
}
