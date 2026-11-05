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
import { rainTiltRatio } from './sprites'

const TAU = Math.PI * 2
/** 雨丝基础长度（CSS px），随景深与 `rainScale` 放大。 */
const RAIN_BASE_STREAK = 12
const RAIN_DEPTH_STREAK = 28
/** 风把雨丝吹斜的最大水平位移。 */
const MAX_RAIN_TILT = 30

function rainTilt(windSpeed: number, gust: number) {
  return Math.min(MAX_RAIN_TILT, 2 + windSpeed * (MAX_RAIN_TILT - 2) * (0.55 + gust * 0.65))
}

/** 贴图档位：0 / 10 / 20 / 30 px 四档，取最近的即可。 */
function tiltBucket(tilt: number) {
  return Math.max(0, Math.min(3, Math.round(tilt / 10)))
}

type RainLayerConfig = {
  count: number
  speed: number
  length: number
  alpha: number
  tiltIndex: number
  /**
   * 贴图斜率（水平位移 / 纵向高度）。横向速度必须按它算：贴图怎么斜，
   * 雨滴就该怎么走，否则动画方向与贴图倾角互相打架。
   */
  tiltRatio: number
}

function advanceAndDrawRain(frame: WeatherFrame, particles: WeatherParticle[], config: RainLayerConfig) {
  const { ctx, width, height, deltaSeconds } = frame
  const sprite = frame.sprites.rainSprite(config.tiltIndex)
  if (!sprite) return
  const drawWidth = (config.length * sprite.width) / sprite.height
  // 竖直位移（屏幕高度/秒）× 贴图斜率 = 水平位移（屏幕高度/秒），再换成屏幕宽度归一。
  const driftScale = config.tiltRatio * (height / width)
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
    ctx.globalAlpha = config.alpha * (0.55 + drop.z * 0.45)
    ctx.drawImage(sprite, drop.x * width - drawWidth / 2, drop.y * height - config.length, drawWidth, config.length)
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
  advanceAndDrawRain(frame, frame.particles.rainFar, {
    count: Math.min(RAIN_FAR_PARTICLES, Math.floor(rain * 260 * budget)),
    speed: speed * 0.8,
    length: (RAIN_BASE_STREAK + 8 * scale) * 0.7,
    alpha: 0.22,
    tiltIndex,
    tiltRatio,
  })
  advanceAndDrawRain(frame, frame.particles.rainMid, {
    count: Math.min(RAIN_MID_PARTICLES, Math.floor(rain * 150 * budget)),
    speed,
    length: RAIN_BASE_STREAK + 16 * scale,
    alpha: 0.4,
    tiltIndex,
    tiltRatio,
  })
  advanceAndDrawRain(frame, frame.particles.rainNear, {
    count: Math.min(RAIN_NEAR_PARTICLES, Math.floor(rain * 90 * depth * budget)),
    speed: speed * 1.25,
    length: RAIN_BASE_STREAK + RAIN_DEPTH_STREAK * scale,
    alpha: 0.55,
    tiltIndex,
    tiltRatio,
  })
}

/** 雪花最小可见半径（CSS px）：远景雪若按 `size * z` 直接算会不足 0.5px，等于没画。 */
const MIN_SNOW_RADIUS = 0.9
/** 雪花下落速度：远景慢、近景快，但整体要能在 6~18 秒内穿过画面。 */
const SNOW_FALL_BASE = 0.045
const SNOW_FALL_DEPTH = 0.11

function drawSnowFlake(frame: WeatherFrame, flake: WeatherParticle, soft: HTMLCanvasElement | null, scale: number) {
  const { ctx, width, height, deltaSeconds } = frame
  // 雪花边落边左右飘，飘的相位由 seed 固定，同一片雪花不会跳相。
  flake.y += deltaSeconds * (SNOW_FALL_BASE + flake.z * SNOW_FALL_DEPTH)
  flake.x += deltaSeconds * flake.z * Math.sin(frame.elapsedSeconds * 0.8 + flake.seed) * 0.03
  if (flake.y > 1.03) {
    flake.y = -0.03
    flake.x = Math.random()
  }
  flake.x = ((flake.x % 1) + 1) % 1
  const radius = Math.max(MIN_SNOW_RADIUS, flake.size * flake.z * scale)
  if (!soft) {
    ctx.globalAlpha = 0.25 + flake.z * 0.4
    ctx.beginPath()
    ctx.arc(flake.x * width, flake.y * height, radius, 0, TAU)
    ctx.fill()
    return
  }
  // 近景雪花用柔光贴图：硬边圆点在大直径下很像「白纸屑」。
  const size = radius * 7.5
  ctx.globalAlpha = 0.3 + flake.z * 0.5
  ctx.drawImage(soft, flake.x * width - size / 2, flake.y * height - size / 2, size, size)
}

function drawSnow(frame: WeatherFrame) {
  const snow = frame.preset.snow || 0
  const scale = frame.preset.snowScale || 1
  const budget = frame.density * frame.quality
  const soft = snow > 0 ? frame.sprites.glowSprite('255,250,238') : null
  const farCount = Math.min(SNOW_FAR_PARTICLES, Math.floor(snow * 210 * budget))
  const nearCount = Math.min(SNOW_NEAR_PARTICLES, Math.floor(snow * 110 * budget))
  frame.ctx.fillStyle = WEATHER_COLOR
  for (let index = 0; index < farCount; index++)
    drawSnowFlake(frame, frame.particles.snowFar[index], null, scale * 0.75)
  for (let index = 0; index < nearCount; index++) drawSnowFlake(frame, frame.particles.snowNear[index], soft, scale)
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
  const tiltIndex = tiltBucket(tilt)
  frame.ctx.save()
  frame.ctx.strokeStyle = WEATHER_COLOR
  frame.ctx.fillStyle = WEATHER_COLOR
  if (preset.rain) drawRain(frame, tiltIndex)
  if (preset.snow) drawSnow(frame)
  frame.ctx.restore()
  frame.ctx.globalAlpha = 1
}
