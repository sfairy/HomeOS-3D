import { clamp as clamp2 } from "../../../plan/geometry";
import { finite as finite2 } from "../../../loaders/studio-normalization";
import { lightIntensityFactor, lightPresetCatalog } from "../../lights/studio-app-light-data";

export function computeDownlightRange(runStudioRenderLoopLightItem: any) {
    const downlight7 =
        (lightPresetCatalog as any)[runStudioRenderLoopLightItem.type] || lightPresetCatalog.downlight,
      downlightTypeScale = (lightIntensityFactor as any)[runStudioRenderLoopLightItem.type] || 1.1;
    if (runStudioRenderLoopLightItem.type !== "striplight")
      return (
        (runStudioRenderLoopLightItem.type === "ceilinglight" ? 680 : 520) * downlightTypeScale
      );
    const downlightRange = clamp2(
        finite2(runStudioRenderLoopLightItem.lightRange, downlight7.range),
        0.5,
        10,
      ),
      downlightElevation = Math.max(finite2(runStudioRenderLoopLightItem.elevation, 2.7), 0.4);
    return (
      48 *
      clamp2(downlightRange / downlight7.range, 0.45, 1.65) *
      clamp2(Math.max(1, Math.pow(downlightElevation / 2.7, 2)), 1, 4) *
      downlightTypeScale
    );
  }
