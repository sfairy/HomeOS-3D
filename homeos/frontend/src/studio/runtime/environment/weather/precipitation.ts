import { WEATHER_COLOR } from './colors'
import type { WeatherFrame } from './frame'
import {
  RAIN_FAR_PARTICLES,
  RAIN_MID_PARTICLES,
  RAIN_NEAR_PARTICLES,
  SNOW_FAR_PARTICLES,
  SNOW_NEAR_PARTICLES,
  type WeatherParticle,
} from './particles'
import { rainTiltBucket, rainTiltRatio } from './sprites'

const TAU = Math.PI * 2
/** 雨丝基础长度（CSS px），随景深与 `rainScale` 放大。 */
const RAIN_BASE_STREAK = 12
const RAIN_DEPTH_STREAK = 28
/** 风把雨丝吹斜的最大水平位移（px）。 */
const MAX_RAIN_TILT = 35

/**
 * 连续倾角：0~35px 之间随「风速 × 阵风」平滑变化。
 *
 * 旧实现只有 0/10/20/30 四档贴图，阵风是连续量而贴图是离散量，倾角会在几个角度
 * 之间来回跳 —— 观感是整片雨每隔几十毫秒「抖一下」。现在倾角连续计算，只在
 * 取贴图时归到 5px 一档，跳变已经低于肉眼阈值。
 */
function rainTilt(windSpeed: number, gust: number) {
  const drive = 0.18 + windSpeed * (MAX_RAIN_TILT - 0.18) * (0.5 + gust * 0.7)
  return Math.min(MAX_RAIN_TILT, drive)
}

type RainLayerConfig = {
  count: number
  speed: number
  length: number
  alpha: number
  /**
   * 该层的景深范围（`z` 的最小/最大值），用来把「远雨细、近雨粗」写成连续差异。
   * 与粒子池里的 `z` 区间一致时，同一层内部也会有自己的粗细分布。
   */
  depthFrom: number
  depthTo: number
  /** 近景档：贴图带柔焦外晕。 */
  soft: boolean
  /**
   * 贴图斜率（水平位移 / 纵向高度）。横向速度必须按它算：贴图怎么斜，
   * 雨滴就该怎么走，否则动画方向与贴图倾角互相打架。
   */
  tiltRatio: number
}

function advanceAndDrawRain(
  frame: WeatherFrame,
  particles: WeatherParticle[],
  config: RainLayerConfig,
  tiltIndex: number,
) {
  const { ctx, width, height, deltaSeconds } = frame
  const sprite = frame.sprites.rainSprite(tiltIndex, config.soft)
  if (!sprite) return
  const spriteAspect = sprite.width / sprite.height
  // 竖直位移（屏幕高度/秒）× 贴图斜率 = 水平位移（屏幕高度/秒），再换成屏幕宽度归一。
  const driftScale = config.tiltRatio * (height / width)
  // 闪电照亮雨丝：真实雷雨中整片雨幕会随放电一起变亮，这是「闪电在场景里」的关键线索。
  const flashBoost = 1 + frame.flash * 0.85
  const depthSpan = Math.max(0.001, config.depthTo - config.depthFrom)
  for (let index = 0; index < config.count; index++) {
    const drop = particles[index]
    const fall = deltaSeconds * (0.55 + drop.z * 0.75) * config.speed
    drop.y += fall
    drop.x += fall * driftScale
    if (drop.y > 1.04) {
      drop.y = -0.04
      drop.x = Math.random()
    }
    if (drop.x > 1.06) drop.x -= 1.12
    else if (drop.x < -0.06) drop.x += 1.12
    // 逐滴尺寸：同一层里也有长有短。整层用同一个长度就是「雨帘贴纸」的来源。
    const depthRatio = Math.min(1, Math.max(0, (drop.z - config.depthFrom) / depthSpan))
    const length = config.length * (0.62 + depthRatio * 0.62) * (0.82 + drop.size * 0.18)
    const drawWidth = Math.max(0.8, length * spriteAspect)
    ctx.globalAlpha = Math.min(1, config.alpha * (0.5 + drop.z * 0.55) * flashBoost)
    ctx.drawImage(sprite, drop.x * width - drawWidth / 2, drop.y * height - length, drawWidth, length)
  }
}

function drawRain(frame: WeatherFrame, tiltIndex: number) {
  const preset = frame.preset
  const rain = preset.rain || 0
  const scale = preset.rainScale || 1
  const speed = preset.rainSpeed || 1
  const depth = preset.rainDepth ?? 0.5
  const budget = frame.density * frame.quality
  const tiltRatio = rainTiltRatio(tiltIndex)
  // 远：细密低透明，量大；中：主视觉；近：少量、粗、带柔焦（贴图本身是渐隐尾）。
  advanceAndDrawRain(
    frame,
    frame.particles.rainFar,
    {
      count: Math.min(RAIN_FAR_PARTICLES, Math.floor(rain * 260 * budget)),
      speed: speed * 0.8,
      length: (RAIN_BASE_STREAK + 8 * scale) * 0.7,
      alpha: 0.22,
      depthFrom: 0.1,
      depthTo: 0.4,
      soft: false,
      tiltRatio,
    },
    tiltIndex,
  )
  advanceAndDrawRain(
    frame,
    frame.particles.rainMid,
    {
      count: Math.min(RAIN_MID_PARTICLES, Math.floor(rain * 150 * budget)),
      speed,
      length: RAIN_BASE_STREAK + 16 * scale,
      alpha: 0.4,
      depthFrom: 0.35,
      depthTo: 0.7,
      soft: false,
      tiltRatio,
    },
    tiltIndex,
  )
  advanceAndDrawRain(
    frame,
    frame.particles.rainNear,
    {
      count: Math.min(RAIN_NEAR_PARTICLES, Math.floor(rain * 90 * depth * budget)),
      speed: speed * 1.25,
      length: RAIN_BASE_STREAK + RAIN_DEPTH_STREAK * scale,
      alpha: 0.55,
      depthFrom: 0.65,
      depthTo: 1,
      soft: true,
      tiltRatio,
    },
    tiltIndex,
  )
}

/** 雪花最小可见半径（CSS px）：远景雪若按 `size * z` 直接算会不足 0.5px，等于没画。 */
const MIN_SNOW_RADIUS = 0.9
/** 雪花下落速度：远景慢、近景快，但整体要能在 6~18 秒内穿过画面。 */
const SNOW_FALL_BASE = 0.045
const SNOW_FALL_DEPTH = 0.11
/** 风对雪的横向推力（屏幕高度/秒，满风时）；比雨小，雪更「飘」。 */
const SNOW_WIND_PUSH = 0.17
/** 横向离场边距：雪走出画面外一点再绕回，避免整片在边缘消失又出现。 */
const SNOW_WRAP_MARGIN = 0.06

function drawSnowFlake(
  frame: WeatherFrame,
  flake: WeatherParticle,
  soft: HTMLCanvasElement | null,
  scale: number,
  windPush: number,
) {
  const { ctx, width, height, deltaSeconds } = frame
  const flashBoost = 1 + frame.flash * 0.7
  // 每片雪花自己的下落速度：`seed` 决定快慢，大小也跟着略有差异（大雪花更容易被看到）。
  const fallSpeed = (SNOW_FALL_BASE + flake.z * SNOW_FALL_DEPTH) * (0.78 + (flake.seed % 1) * 0.42)
  flake.y += deltaSeconds * fallSpeed
  // 风把雪整体推斜；远景受风更明显（远处风场更开阔），近景更沉。
  flake.x += deltaSeconds * windPush * (1.15 - flake.z * 0.55) * (height / width)
  // 边落边左右飘，飘的相位由 seed 固定，同一片雪花不会跳相。
  flake.x += deltaSeconds * flake.z * Math.sin(frame.elapsedSeconds * 0.8 + flake.seed) * 0.018
  if (flake.y > 1.03) {
    flake.y = -0.03
    flake.x = Math.random()
  }
  if (flake.x > 1 + SNOW_WRAP_MARGIN) flake.x -= 1 + SNOW_WRAP_MARGIN * 2
  else if (flake.x < -SNOW_WRAP_MARGIN) flake.x += 1 + SNOW_WRAP_MARGIN * 2
  const radius = Math.max(MIN_SNOW_RADIUS, flake.size * flake.z * scale)
  // 轻微明暗差：真实雪片有厚有薄，亮度一致会像一层均匀白噪点。
  const thickness = 0.82 + (flake.seed % 0.7) * 0.36
  if (!soft) {
    ctx.globalAlpha = Math.min(1, (0.25 + flake.z * 0.4) * thickness * flashBoost)
    ctx.beginPath()
    ctx.arc(flake.x * width, flake.y * height, radius, 0, TAU)
    ctx.fill()
    return
  }
  // 近景雪花用柔光贴图：硬边圆点在大直径下很像「白纸屑」。
  const size = radius * 7.5
  ctx.globalAlpha = Math.min(1, (0.3 + flake.z * 0.5) * thickness * flashBoost)
  ctx.drawImage(soft, flake.x * width - size / 2, flake.y * height - size / 2, size, size)
}

function drawSnow(frame: WeatherFrame) {
  const snow = frame.preset.snow || 0
  const scale = frame.preset.snowScale || 1
  const budget = frame.density * frame.quality
  const soft = snow > 0 ? frame.sprites.snowSprite('255,250,238') : null
  const farCount = Math.min(SNOW_FAR_PARTICLES, Math.floor(snow * 210 * budget))
  const nearCount = Math.min(SNOW_NEAR_PARTICLES, Math.floor(snow * 110 * budget))
  // 风 + 阵风 → 横向推力；无风时也留一点点漂移，雪不会像直落的米粒。
  const windPush = (0.012 + frame.windSpeed * SNOW_WIND_PUSH) * (0.5 + frame.gust * 0.6)
  frame.ctx.fillStyle = WEATHER_COLOR
  for (let index = 0; index < farCount; index++)
    drawSnowFlake(frame, frame.particles.snowFar[index], null, scale * 0.75, windPush)
  for (let index = 0; index < nearCount; index++)
    drawSnowFlake(frame, frame.particles.snowNear[index], soft, scale, windPush)
}

/**
 * 按预设渲染雨与雪；两者可以同时出现（雨夹雪）。
 *
 * 这里只画「天上落下来的东西」，不动背景：没有全屏雾幕、没有整屏雨帘贴图。
 * 冰雹不再是独立的天气种类，落地反馈里的「重水花」一并去掉。
 */
export function drawPrecipitation(frame: WeatherFrame) {
  const preset = frame.preset
  const tilt = rainTilt(frame.windSpeed, frame.gust)
  const tiltIndex = rainTiltBucket(tilt)
  frame.ctx.save()
  frame.ctx.strokeStyle = WEATHER_COLOR
  frame.ctx.fillStyle = WEATHER_COLOR
  if (preset.rain) drawRain(frame, tiltIndex)
  if (preset.snow) drawSnow(frame)
  frame.ctx.restore()
  frame.ctx.globalAlpha = 1
}
