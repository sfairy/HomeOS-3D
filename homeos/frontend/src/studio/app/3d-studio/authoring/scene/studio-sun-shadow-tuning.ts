/**
 * 太阳（主方向光）的阴影参数 —— 舞台与编辑器两档。
 *
 * 这些值是 0.8.2 的原始取值，别再写死成单档（此前两处都用了舞台档 1.75/4，
 * 编辑器里的太阳阴影边缘因此偏硬、几乎没有柔化过渡）：
 *
 * - 舞台：`radius 1.75 / blurSamples 4`，阴影边缘利落，观众不会注意到噪点；
 * - 编辑器：`radius 3.25 / blurSamples 12`，便于摆放家具时看清投影边界；
 * - 开了地面阴影（贴地接触阴影）再压回 `1.2 / 8`，否则和接触阴影叠起来糊成一片；
 * - 浓度：编辑器（无地面阴影、非舞台）把预设再乘 1.5 并夹到 1 —— 少了这一段，
 *   预设 0.18 就只剩 0.18，家具投影整体偏淡、落在墙上也几乎没有暗部。
 *
 * 注意：这里只管「阴影」，亮度的 `intensityScale` 是另一套判据（见调用方注释）。
 */
export function applySunShadowTuning(
  sunLight: { shadow: Record<string, number> },
  {
    isStageSurface,
    isGroundShadowEnabled,
    mainShadowIntensity,
  }: { isStageSurface: boolean; isGroundShadowEnabled: boolean; mainShadowIntensity: number },
) {
  const sunShadow = sunLight.shadow;
  ((sunShadow.bias = -0.00012),
    (sunShadow.normalBias = 0.016),
    (sunShadow.radius = isStageSurface ? 1.75 : 3.25),
    (sunShadow.blurSamples = isStageSurface ? 4 : 12),
    isGroundShadowEnabled && ((sunShadow.radius = 1.2), (sunShadow.blurSamples = 8)),
    (sunShadow.intensity = Math.min(
      1,
      mainShadowIntensity * (isGroundShadowEnabled || isStageSurface ? 1 : 1.5),
    )));
}
