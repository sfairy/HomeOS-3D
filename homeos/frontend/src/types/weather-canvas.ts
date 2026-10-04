/**
 * 天气背景 Canvas / 动画层共享类型。
 * 依赖：天气特效工具模块（profile / preset / particle classes）。
 */
import type { WeatherEffectProfile } from '@/utils/weather/effect-condition.util'
import type {
  ResolvedWeatherEffectConfig,
  WeatherEffectSceneParams,
} from '@/utils/weather/effect-presets.util'
import type {
  FastRain,
  GlassDrop,
  HailPellet,
  LeafParticle,
  SnowCrystal,
} from '@/utils/weather/particle-classes'

/** 天气背景质量档位：full=完整，lite=精简，static=静态，off=关闭 */
type WeatherBackgroundQuality = 'full' | 'lite' | 'static' | 'off' | ''

/** 天气背景组件 props */
export interface WeatherBackgroundProps {
  quality?: WeatherBackgroundQuality | string // 质量档位
  /** 渲染层：atmosphere=天空背景（UI 之后）；precip=降水粒子（UI 之前） */
  layer?: 'atmosphere' | 'precip' | ''
}

/** 性能模式：high=高，medium=中，low=低，static=静态，off=关闭 */
export type WeatherPerfMode = 'high' | 'medium' | 'low' | 'static' | 'off' | string

/** 闪电折线点 */
export interface LightningPoint {
  x: number // X 坐标
  y: number // Y 坐标
}

/** 云朵气泡 */
export interface CloudPuff {
  x: number // X 坐标
  y: number // Y 坐标
  r: number // 半径
  highlight: number // 高光强度
}

/** 流星轨迹点 */
export interface ShootingStarTrailPoint {
  x: number // X 坐标
  y: number // Y 坐标
}

export type {
  WeatherEffectProfile,
  GlassDrop,
  FastRain,
  SnowCrystal,
  LeafParticle,
  HailPellet,
}

/** OffscreenCanvas 粒子 Worker 消息（主线程 -> weather-particle.worker） */
type WeatherParticleWorkerInitMessage = {
  type: 'init' // 消息类型：初始化
  canvas: OffscreenCanvas // OffscreenCanvas 句柄
  width: number // 画布宽度
  height: number // 画布高度
  dpr: number // 设备像素比
  profile?: WeatherEffectProfile // 天气特效 profile
  wind?: number // 风速
  rainAngle?: number // 雨角度
  particleCounts?: ResolvedWeatherEffectConfig['particleCounts'] // 各类粒子数量
  rainIntensity?: number | null // 雨强度
  scene?: WeatherEffectSceneParams | null // 场景参数
  active?: boolean // 是否激活
}

/** Worker 画布尺寸变更消息 */
type WeatherParticleWorkerResizeMessage = {
  type: 'resize' // 消息类型：尺寸变更
  width: number // 新画布宽度
  height: number // 新画布高度
  dpr: number // 新设备像素比
  particleCounts?: ResolvedWeatherEffectConfig['particleCounts'] // 各类粒子数量
}

/** Worker 状态更新消息（不重建画布，仅更新参数） */
type WeatherParticleWorkerStateMessage = {
  type: 'state' // 消息类型：状态更新
  profile?: WeatherEffectProfile // 天气特效 profile
  wind?: number // 风速
  rainAngle?: number // 雨角度
  particleCounts?: ResolvedWeatherEffectConfig['particleCounts'] // 各类粒子数量
  rainIntensity?: number | null // 雨强度
  scene?: WeatherEffectSceneParams | null // 场景参数
  active?: boolean // 是否激活
}

/** Worker 停止消息 */
type WeatherParticleWorkerStopMessage = {
  type: 'stop' // 消息类型：停止
}

/** 粒子 Worker 消息联合类型 */
export type WeatherParticleWorkerMessage =
  | WeatherParticleWorkerInitMessage
  | WeatherParticleWorkerResizeMessage
  | WeatherParticleWorkerStateMessage
  | WeatherParticleWorkerStopMessage