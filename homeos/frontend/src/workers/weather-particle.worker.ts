/**
 * 天气雨雪粒子 OffscreenCanvas Worker（P3）。
 * 主线程仅保留静态场景合成，粒子层在 Worker 内 rAF 更新，避免主线程繁忙时丢帧。
 *
 * 关键依赖：@/utils/weather/particle-classes（粒子初始化与绘制）、
 *   @/utils/weather/effect-condition.util（profile）、@/utils/weather/effect-presets.util（scene）、
 *   @/types/weather-canvas（Worker 消息类型）。
 *
 * 消息协议（标准 postMessage / self.onmessage，单向接收主线程指令，无回传）：
 * - init: 携带 OffscreenCanvas 句柄与初始参数，初始化画布并按需启动渲染循环；
 * - resize: 画布尺寸 / dpr 变化，按新尺寸重置画布并重建粒子；
 * - state: 仅更新参数（profile / wind / rainAngle / counts / intensity / scene / active），
 *     不重建画布；active 控制渲染循环启停；
 * - stop: 停止渲染循环并清空画布。
 */
import {
  initWeatherParticles,
  drawWeatherParticles,
} from '@/utils/weather/particle-classes'
import type {
  ParticleCountConfig,
  WeatherParticles,
} from '@/utils/weather/particle-classes'
import type { WeatherEffectProfile } from '@/utils/weather/effect-condition.util'
import type { WeatherEffectSceneParams } from '@/utils/weather/effect-presets.util'
import type { WeatherParticleWorkerMessage } from '@/types/weather-canvas'

/** OffscreenCanvas 2D 上下文（init 时由主线程 transfer 而来） */
let ctx: OffscreenCanvasRenderingContext2D | null = null
/** 画布 CSS 宽度（粒子计算基准） */
let cssWidth = 0
/** 画布 CSS 高度（粒子计算基准） */
let cssHeight = 0
/** 设备像素比，用于画布物理像素与 setTransform 缩放 */
let dpr = 1
/** 粒子集合（雨 / 雪 / 叶 / 冰雹 / 玻璃水滴等），随尺寸变化重建 */
let particles: WeatherParticles | null = null
/** 当前天气特效 profile，作为粒子绘制的输入 */
let profile: WeatherEffectProfile = {
  kind: 'clear-day',
  precipIntensity: 0,
  wind: 0.3,
  windDir: 1,
  cloudCover: 0.1,
  isNight: false,
  dayPhase: 0,
  rawState: 'sunny',
  humidity: 50,
  temperature: 20,
  visibilityKm: 12,
  isHaze: false,
}
/** 风速（影响粒子漂移方向与速度） */
let wind = 0.3
/** 雨滴角度偏移（侧风时倾斜） */
let rainAngle = 0.03
/** 各类粒子数量配置（来自 resolved 效果配置） */
let particleCounts: Partial<ParticleCountConfig> | null = null
/** 雨强度（null 表示未指定，由 profile 自行推导） */
let rainIntensity: number | null = null
/** 场景参数（背景色 / 光照等，来自 effect-presets） */
let scene: WeatherEffectSceneParams | null = null
/** 渲染循环运行标记 */
let running = false
/** 上一帧时间戳（计算 dt 用） */
let lastTs = 0
/** requestAnimationFrame 句柄（用于停止循环） */
let rafId: number | null = null

/** rAF 帧回调：清空画布后按当前参数绘制粒子，dt 归一化到 60fps 且上限避免大跳变。 */
function tick(ts: number) {
  if (!running || !ctx) return
  const dt = lastTs ? Math.min((ts - lastTs) / (1000 / 60), 24) : 1
  lastTs = ts
  ctx.clearRect(0, 0, cssWidth, cssHeight)
  if (particles) {
    drawWeatherParticles(
      ctx as unknown as CanvasRenderingContext2D,
      cssWidth,
      cssHeight,
      profile,
      wind,
      rainAngle,
      dt,
      particles,
      {
        rainIntensity: rainIntensity ?? undefined,
        scene: scene ?? undefined,
      },
    )
  }
  rafId = requestAnimationFrame(tick)
}

/** 启动渲染循环；已在运行则跳过。重置 lastTs 以避免首帧 dt 异常。 */
function startLoop() {
  if (running) return
  running = true
  lastTs = 0
  rafId = requestAnimationFrame(tick)
}

/** 停止渲染循环：取消 rAF、清空计时器并清空画布，停止后画面留白。 */
function stopLoop() {
  running = false
  if (rafId) {
    cancelAnimationFrame(rafId)
    rafId = null
  }
  lastTs = 0
  if (ctx) ctx.clearRect(0, 0, cssWidth, cssHeight)
}

/** 应用新尺寸 / dpr：调整画布物理像素与变换矩阵，并按新尺寸重建粒子集合。 */
function applySize(width: number, height: number, pixelRatio: number) {
  cssWidth = width
  cssHeight = height
  dpr = pixelRatio || 1
  if (!ctx) return
  ctx.canvas.width = Math.round(cssWidth * dpr)
  ctx.canvas.height = Math.round(cssHeight * dpr)
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
  particles = initWeatherParticles(cssWidth, cssHeight, particleCounts || undefined)
}

/**
 * 主线程消息分发：按消息类型更新画布、参数或循环状态。
 * 消息类型见文件头协议说明；所有更新均为单向，不向主线程回传。
 */
self.onmessage = (event: MessageEvent<WeatherParticleWorkerMessage>) => {
  const msg = event.data
  switch (msg.type) {
    case 'init': {
      // 接管 OffscreenCanvas 上下文，应用初始尺寸与参数后按需启动循环
      ctx = msg.canvas.getContext('2d')
      if (msg.particleCounts) particleCounts = msg.particleCounts
      applySize(msg.width, msg.height, msg.dpr)
      if (msg.profile) profile = msg.profile
      wind = msg.wind ?? 0.3
      rainAngle = msg.rainAngle ?? 0.03
      rainIntensity = msg.rainIntensity ?? null
      scene = msg.scene ?? null
      if (msg.active !== false) startLoop()
      break
    }
    case 'resize':
      // 尺寸变化：可能附带新的粒子数量配置，重建画布与粒子
      if (msg.particleCounts) particleCounts = msg.particleCounts
      applySize(msg.width, msg.height, msg.dpr)
      break
    case 'state':
      // 参数更新：仅覆盖传入字段，不重建画布；active 控制循环启停
      if (msg.profile != null) profile = msg.profile
      if (msg.wind != null) wind = msg.wind
      if (msg.rainAngle != null) rainAngle = msg.rainAngle
      if (msg.particleCounts) particleCounts = msg.particleCounts
      if (msg.rainIntensity != null) rainIntensity = msg.rainIntensity
      if (msg.scene != null) scene = msg.scene
      if (msg.active === true) startLoop()
      else if (msg.active === false) stopLoop()
      break
    case 'stop':
      // 显式停止：取消循环并清空画布
      stopLoop()
      break
    default:
      break
  }
}
