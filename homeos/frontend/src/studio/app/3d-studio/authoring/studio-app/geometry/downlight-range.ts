import { clamp as clamp2 } from '../../../plan/geometry'
import { finite as finite2 } from '../../../loaders/studio-normalization'
import {
  lightIntensityFactor,
  lightPresetCatalog,
  lightFluxLumens,
  lightAngleLimitForType,
  renderCandelaFromFlux,
} from '../../lights/studio-app-light-data'
import { stripLuminance } from '../../lights/strip-light/strip-light-spec'

/**
 * 灯具「全亮」时的强度（cd / 灯带则是 cd·m⁻²）。
 *
 * 这份数值必须和 `addLightModel` 建灯时用的完全一致 —— 开关灯与调亮度的淡入淡出
 * 都以它为 1.0 基准，两边算法不一致就会出现「点一下灯，亮度先跳一下」。
 * 灯带直接取 `strip-light-spec.ts` 的 `stripLuminance`，和建灯同一个函数。
 */
export function computeDownlightRange(runStudioRenderLoopLightItem: any) {
  if (runStudioRenderLoopLightItem.type === 'striplight') return stripLuminance(runStudioRenderLoopLightItem)
  const lightPreset = (lightPresetCatalog as any)[runStudioRenderLoopLightItem.type] || lightPresetCatalog.downlight,
    downlightTypeScale = (lightIntensityFactor as any)[runStudioRenderLoopLightItem.type] || 1.1,
    beamAngle = clamp2(
      finite2(runStudioRenderLoopLightItem.lightAngle, lightPreset.angle),
      15,
      lightAngleLimitForType(runStudioRenderLoopLightItem.type),
    )
  return (
    renderCandelaFromFlux(
      runStudioRenderLoopLightItem.type,
      lightFluxLumens[runStudioRenderLoopLightItem.type] ?? lightFluxLumens.downlight,
      beamAngle,
    ) * downlightTypeScale
  )
}
