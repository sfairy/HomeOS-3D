import type { WeatherGroundQuad } from './ground-quad'
import type { WeatherParticlePool } from './particles'
import type { WeatherEffectPreset } from './presets'
import type { SpriteCache } from './sprites'

/** 单帧渲染上下文：各图层函数只读它，不持有自己的状态。 */
export type WeatherFrame = {
  ctx: CanvasRenderingContext2D
  /** CSS 像素宽高（ctx 已按 dpr 设过 transform）。 */
  width: number
  height: number
  /** 画布面积归一化系数，用于缩放粒子数量。 */
  density: number
  deltaSeconds: number
  elapsedSeconds: number
  /** 自实体 `wind_speed` 归一化到 0~1 的风速。 */
  windSpeed: number
  /** 低频阵风包络（0~1），让降水与风线有「呼吸」，不是机械匀速。 */
  gust: number
  /** 自适应画质因子（0.55 / 0.8 / 1），只影响数量与可选图层。 */
  quality: number
  /** 当前雷电闪光强度 0~1；由雷电层在绘制前算好，湿地反光据此短暂提亮。 */
  flash: number
  /** 是否为减弱动效模式：只画定格画面，不推进生命周期。 */
  reducedMotion: boolean
  /** 真实地面四边形（归一化屏幕坐标）；舞台没发投影时为兜底透视带。 */
  ground: WeatherGroundQuad
  /** 预渲染贴图缓存（雨丝、雪花柔光球）。 */
  sprites: SpriteCache
  preset: WeatherEffectPreset
  particles: WeatherParticlePool
}
