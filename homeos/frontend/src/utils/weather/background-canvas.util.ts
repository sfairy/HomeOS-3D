/**
 * 天气背景 Canvas 绘制：闪电、阳光、积雪与大气层等场景层渲染。
 */
import type { WeatherEffectProfile } from '@/utils/weather/effect-condition.util'
import {
  profileHasLightning,
  profileHasRain,
  profileHasSnow,
  profileHasSleet,
  profilePrecipIntensity,
  profileRainIntensity,
} from '@/utils/weather/effect-condition.util'
import type {
  ResolvedWeatherEffectConfig,
  WeatherEffectSceneParams,
} from '@/utils/weather/effect-presets.util'
import type { LightningPoint } from '@/types/weather-canvas'
import type { Cloud, Star } from '@/utils/weather/background-particles.util'
import {
  ShootingStar,
  Lightning,
  createWeatherSceneParticles,
} from '@/utils/weather/background-particles.util'
import { windDriftOffset, wrapOffset, resolveCelestialPosition, resolveGust } from '@/utils/weather/animation.util'

export {
  ShootingStar,
  Lightning,
  createWeatherSceneParticles,
  profileHasLightning,
  profileHasRain,
  profileHasSnow,
  profileHasSleet,
  profilePrecipIntensity,
  profileRainIntensity,
}

/** 各天气类型的天空基调色（白天/夜间两组 RGB） */
const SKY_BASE_COLORS: Record<string, { day: [number, number, number]; night: [number, number, number] }> = {
  'clear-day': { day: [98, 168, 235], night: [8, 12, 30] },
  'clear-night': { day: [98, 168, 235], night: [8, 12, 30] },
  'partly-cloudy': { day: [112, 146, 190], night: [10, 14, 34] },
  cloudy: { day: [96, 108, 132], night: [9, 13, 30] },
  drizzle: { day: [92, 104, 126], night: [9, 13, 30] },
  rain: { day: [82, 94, 116], night: [8, 12, 28] },
  'heavy-rain': { day: [64, 74, 96], night: [6, 10, 24] },
  thunderstorm: { day: [52, 56, 82], night: [5, 7, 20] },
  snow: { day: [168, 184, 208], night: [16, 22, 42] },
  sleet: { day: [118, 132, 158], night: [14, 18, 36] },
  windy: { day: [104, 134, 172], night: [12, 16, 34] },
  hail: { day: [98, 110, 136], night: [11, 15, 32] },
  sandstorm: { day: [196, 172, 124], night: [36, 30, 20] },
}

function mixColor(
  a: [number, number, number],
  b: [number, number, number],
  t: number,
): [number, number, number] {
  const k = Math.min(1, Math.max(0, t))
  return [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k, a[2] + (b[2] - a[2]) * k]
}

function rgbCss(c: [number, number, number], alpha: number): string {
  return `rgba(${Math.round(c[0])}, ${Math.round(c[1])}, ${Math.round(c[2])}, ${alpha})`
}

/**
 * 天空氛围层：仅非晴天场景画顶部天空条带轻微着色。
 * 晴天/晴夜跳过——天气层叠在 UI 之上，任何罩色都会像蒙版。
 */
export function drawSkyAtmosphere(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  profile: WeatherEffectProfile,
  scene: Partial<WeatherEffectSceneParams> | null | undefined,
) {
  // 晴空只靠太阳晕/卷云/星月表达，不做天空罩色
  if (profile.kind === 'clear-day' || profile.kind === 'clear-night') return

  const sceneParams = scene || {}
  const tint = sceneParams.skyTint ?? 1
  const darken = sceneParams.skyDarken ?? 0.65
  if (tint <= 0.01 && darken <= 0.01) return

  const base = SKY_BASE_COLORS[profile.kind] || SKY_BASE_COLORS['clear-day']
  const dayMix = mixColor(base.night, base.day, profile.dayPhase)
  const twilightStrength = Math.max(0, Math.sin(profile.dayPhase * Math.PI) - 0.55) * 2.2
  const twilight = mixColor(
    dayMix,
    [255, 170, 110],
    profile.isNight ? 0 : Math.min(1, twilightStrength * 0.55),
  )

  const nightDark = profile.isNight ? (1 - profile.dayPhase) * 0.5 : 0
  const top = mixColor(twilight, [6, 8, 20], nightDark * darken)
  // 仅顶部天空带，避免整页蒙版感
  const intensity = Math.min(0.18, 0.06 + tint * 0.06 + darken * 0.015)
  const topAlpha = intensity * (0.85 + profile.dayPhase * 0.2)
  // 多留一段全透明尾部，避免 fillRect 底边在 DPR 缩放后露出 1px 接缝
  const skyBand = h * 0.38

  ctx.save()
  const grad = ctx.createLinearGradient(0, 0, 0, skyBand)
  grad.addColorStop(0, rgbCss(top, topAlpha))
  grad.addColorStop(0.45, rgbCss(top, topAlpha * 0.3))
  grad.addColorStop(0.82, rgbCss(top, 0))
  grad.addColorStop(1, rgbCss(top, 0))
  ctx.fillStyle = grad
  ctx.fillRect(0, 0, w, skyBand)

  // 雷暴/暴雨：顶部局部压暗光晕，不铺满全屏
  if (profile.kind === 'thunderstorm' || profile.kind === 'heavy-rain') {
    const storm = (sceneParams.darkening ?? 0.65) * 0.18
    if (storm > 0.02) {
      const dark = ctx.createRadialGradient(w * 0.5, 0, 0, w * 0.5, 0, w * 0.55)
      dark.addColorStop(0, `rgba(4, 6, 14, ${Math.min(0.2, storm)})`)
      dark.addColorStop(1, 'rgba(4, 6, 14, 0)')
      ctx.fillStyle = dark
      ctx.fillRect(0, 0, w, h * 0.4)
    }
  }
  ctx.restore()
}

export function drawLightningBolt(
  ctx: CanvasRenderingContext2D,
  lightning: Lightning,
  flash: number,
) {
  ctx.save()
  ctx.globalAlpha = flash * 0.3
  ctx.shadowBlur = 40
  ctx.shadowColor = 'rgba(180, 160, 255, 1)'
  ctx.strokeStyle = `rgba(220, 200, 255, ${flash * 0.5})`
  ctx.lineWidth = 8
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.beginPath()
  ctx.moveTo(lightning.points[0].x, lightning.points[0].y)
  for (let i = 1; i < lightning.points.length; i++) {
    ctx.lineTo(lightning.points[i].x, lightning.points[i].y)
  }
  ctx.stroke()
  ctx.globalAlpha = flash * 0.6
  ctx.shadowBlur = 25
  ctx.strokeStyle = `rgba(240, 235, 255, ${flash})`
  ctx.lineWidth = 4
  ctx.stroke()
  ctx.globalAlpha = 1
  ctx.strokeStyle = `rgba(255, 255, 255, ${flash})`
  ctx.lineWidth = 2
  ctx.shadowBlur = 15
  ctx.shadowColor = `rgba(255, 255, 255, ${flash})`
  ctx.stroke()
  lightning.branches.forEach((branch: LightningPoint[]) => {
    ctx.beginPath()
    ctx.moveTo(branch[0].x, branch[0].y)
    branch.forEach((p: LightningPoint) => ctx.lineTo(p.x, p.y))
    ctx.strokeStyle = `rgba(200, 180, 255, ${flash * 0.7})`
    ctx.lineWidth = 2.5
    ctx.stroke()
    ctx.strokeStyle = `rgba(255, 255, 255, ${flash * 0.5})`
    ctx.lineWidth = 1
    ctx.stroke()
  })
  ctx.restore()
}

export function drawPuddleShimmer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  wind: number = 0,
) {
  ctx.save()
  const windSkew = wind * 3
  for (let i = 0; i < 5; i++) {
    const phase = t / (2800 + i * 400) + i * 1.3
    const px = w * (0.12 + i * 0.16 + Math.sin(phase * 0.6) * 0.018) + windSkew
    const py = h * (0.91 + Math.sin(i * 1.9) * 0.03)
    const ripple = Math.sin(phase) * 0.5 + 0.5
    ctx.globalAlpha = ripple * 0.07
    ctx.beginPath()
    ctx.ellipse(px, py, 28 + ripple * 10, 2.5 + ripple * 1.2, wind * 0.04, 0, Math.PI * 2)
    ctx.fillStyle = 'rgba(180, 200, 220, 1)'
    ctx.fill()
  }
  ctx.restore()
}

function drawAtmosphereLayer(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  profile: WeatherEffectProfile,
  t: number,
  sceneParams: Partial<WeatherEffectSceneParams> | null | undefined,
  wind: number = 0,
) {
  ctx.save()
  const night = profile.isNight
  const scene = sceneParams || {}
  const { sunX, sunY, moonX, moonY, elev } = resolveCelestialPosition(profile.dayPhase, w, h)
  if (!night && (profile.kind === 'clear-day' || profile.kind === 'partly-cloudy')) {
    // 局部多云已有光柱，日晕再弱一档，避免两套高光叠出亮环
    const glow = scene.sunGlow ?? (profile.kind === 'partly-cloudy' ? 0.42 : 1)
    const warm = 1 - elev
    const coreA = 0.08 * glow
    const glowR = w * 0.48
    // 内径从 0 起、多段缓衰减，避免 Canvas 径向渐变在色标处勒出一圈白环
    const warmGlow = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, glowR)
    const gR = 255
    const gG = (t: number) => Math.round(248 - warm * (18 + t * 16))
    const gB = (t: number) => Math.round(220 - warm * (36 + t * 18))
    warmGlow.addColorStop(0, `rgba(${gR}, ${gG(0)}, ${gB(0)}, ${coreA})`)
    warmGlow.addColorStop(0.1, `rgba(${gR}, ${gG(0.25)}, ${gB(0.25)}, ${coreA * 0.5})`)
    warmGlow.addColorStop(0.28, `rgba(${gR}, ${gG(0.5)}, ${gB(0.5)}, ${coreA * 0.22})`)
    warmGlow.addColorStop(0.52, `rgba(${gR}, ${gG(0.75)}, ${gB(0.75)}, ${coreA * 0.08})`)
    warmGlow.addColorStop(0.78, `rgba(${gR}, ${gG(1)}, ${gB(1)}, ${coreA * 0.025})`)
    warmGlow.addColorStop(1, 'rgba(255, 210, 150, 0)')
    ctx.fillStyle = warmGlow
    ctx.beginPath()
    ctx.arc(sunX, sunY, glowR, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = `rgba(255, ${Math.round(248 - warm * 20)}, ${Math.round(220 - warm * 40)}, ${0.18 * glow})`
    ctx.beginPath()
    ctx.arc(sunX, sunY, Math.max(5, w * 0.01), 0, Math.PI * 2)
    ctx.fill()
    if ((scene.heatHaze ?? 0) > 0.1 && elev > 0.35) {
      const haze = scene.heatHaze!
      const bands = 4 + Math.round(haze * 3)
      for (let i = 0; i < bands; i++) {
        const phase = t / (2200 + i * 380) + i
        const hx = w * (0.08 + i * 0.16) + Math.sin(phase) * 22 + wind * 5
        const hy = h * (0.7 + (i % 3) * 0.06 + Math.sin(phase * 0.8) * 0.012)
        const hr = w * (0.1 + (i % 4) * 0.018)
        ctx.globalAlpha = 0.038 * haze * (0.65 + 0.35 * Math.sin(phase * 1.6))
        const heat = ctx.createRadialGradient(hx, hy, 0, hx, hy, hr)
        heat.addColorStop(0, 'rgba(255, 208, 130, 0.5)')
        heat.addColorStop(1, 'rgba(255, 180, 100, 0)')
        ctx.fillStyle = heat
        ctx.beginPath()
        ctx.ellipse(hx, hy, hr, hr * 0.16, Math.sin(phase) * 0.08, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }
  }
  if (night && (profile.kind === 'clear-night' || profile.kind === 'clear-day')) {
    const moonGlow = scene.moonGlow ?? 0.75
    const moon = ctx.createRadialGradient(moonX, moonY, 0, moonX, moonY, w * 0.35)
    moon.addColorStop(0, `rgba(200, 215, 255, ${0.08 * moonGlow})`)
    moon.addColorStop(0.5, `rgba(160, 180, 230, ${0.025 * moonGlow})`)
    moon.addColorStop(1, 'rgba(0,0,0,0)')
    ctx.fillStyle = moon
    ctx.beginPath()
    ctx.arc(moonX, moonY, w * 0.35, 0, Math.PI * 2)
    ctx.fill()
    const diskR = Math.max(7, w * 0.014)
    ctx.fillStyle = `rgba(225, 232, 248, ${0.28 * moonGlow})`
    ctx.beginPath()
    ctx.arc(moonX, moonY, diskR, 0, Math.PI * 2)
    ctx.fill()
    if (profile.humidity > 70) {
      ctx.strokeStyle = `rgba(190, 210, 255, ${0.12 * moonGlow})`
      ctx.lineWidth = 2.5
      ctx.beginPath()
      ctx.arc(moonX, moonY, diskR * 2.4, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

function drawDustMotes(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  alpha: number,
  count: number = 25,
  wind: number = 0,
) {
  if (alpha <= 0.02 || count <= 0) return
  ctx.save()
  ctx.fillStyle = 'rgba(255, 255, 240, 1)'
  for (let i = 0; i < count; i++) {
    const seed = i * 137.5
    const dx = ((seed * 7919) % 1000) / 1000
    const dy = ((seed * 6271) % 1000) / 1000
    const size = 0.5 + ((seed * 3571) % 5) * 0.18
    const floatX = Math.sin(t / (5200 + i * 280) + i) * 10 + wind * 6
    const floatY = Math.cos(t / (7200 + i * 360) + i * 0.7) * 5
    const moteAlpha = (0.12 + 0.12 * Math.sin(t / (3200 + i * 480) + i * 2)) * alpha
    ctx.globalAlpha = moteAlpha
    ctx.beginPath()
    ctx.arc(w * dx + floatX, h * dy + floatY, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

function drawSunbeams(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  strength: number,
  occlude = 1,
  dayPhase = 1,
) {
  if (strength <= 0.05 || occlude <= 0.04) return
  ctx.save()
  const { sunX, sunY } = resolveCelestialPosition(dayPhase, w, h)
  const pulse = 0.88 + Math.sin(t / 7500) * 0.12
  ctx.globalAlpha = 0.07 * strength * pulse * occlude
  for (let i = 0; i < 4; i++) {
    const angle = -0.38 + i * 0.11 + Math.sin(t / 6500 + i * 1.3) * 0.012
    ctx.save()
    ctx.translate(sunX, sunY)
    ctx.rotate(angle)
    const len = h * 0.78
    const hw = 36 + i * 16
    // 沿宽度方向衰减，避免 fillRect 硬边在低透明度下看起来像一条白线
    const beam = ctx.createLinearGradient(-hw, 0, hw, 0)
    beam.addColorStop(0, 'rgba(255, 248, 210, 0)')
    beam.addColorStop(0.5, 'rgba(255, 242, 200, 0.28)')
    beam.addColorStop(1, 'rgba(255, 248, 210, 0)')
    ctx.fillStyle = beam
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(-hw, len)
    ctx.lineTo(hw, len)
    ctx.closePath()
    ctx.fill()
    ctx.restore()
  }
  ctx.restore()
}

/** 银河带：斜向柔光带 + 带内高密度星点 */
function drawMilkyWay(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  strength: number,
) {
  if (strength <= 0.05) return
  ctx.save()
  const grad = ctx.createLinearGradient(0, 0, w, h * 0.55)
  grad.addColorStop(0, 'rgba(200, 210, 240, 0)')
  grad.addColorStop(0.45, `rgba(205, 215, 245, ${0.05 * strength})`)
  grad.addColorStop(1, 'rgba(210, 220, 250, 0)')
  ctx.fillStyle = grad
  ctx.beginPath()
  ctx.moveTo(w * 0.1, 0)
  ctx.lineTo(w * 0.62, 0)
  ctx.lineTo(w * 0.05, h * 0.8)
  ctx.lineTo(-w * 0.2, h * 0.8)
  ctx.closePath()
  ctx.fill()
  // 带内星点：大小与闪烁幅度按序号拉开，避免一排同样的小点
  const stars = 73
  for (let i = 0; i < stars; i++) {
    const sx = (((i * 137.5) % 100) / 100) * w * 0.72 + w * 0.04
    const sy = (((i * 197.3) % 100) / 100) * h * 0.68
    const bandT = sx / w + sy / h
    if (bandT > 1.25 || bandT < 0.15) continue
    const mag = ((i * 53) % 100) / 100
    const twAmp = 0.25 + (((i * 71) % 100) / 100) * 0.7
    const tw = 0.35 + twAmp * Math.abs(Math.sin(t / (900 + (i % 7) * 180) + i * 2.1))
    const size = 0.25 + mag * mag * 1.35
    ctx.fillStyle = `rgba(235, 240, 255, ${0.22 + 0.55 * tw * strength * (0.35 + mag)})`
    ctx.beginPath()
    ctx.arc(sx, sy, size, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 满天星野：按画面面积铺满整屏，每颗独立闪烁 */
function drawFullSkyStars(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  strength: number,
) {
  if (strength <= 0.04) return
  const n = Math.round(Math.min(870, Math.max(400, (w * h) / 3300)))
  ctx.save()
  ctx.fillStyle = 'rgb(236, 242, 255)'
  for (let i = 0; i < n; i++) {
    const sx = (((i * 0.6180339887) % 1) * w)
    const sy = (((i * 0.4142135623) % 1) * h)
    const mag = ((i * 89) % 100) / 100
    const amp = 0.4 + (((i * 41) % 100) / 100) * 0.55
    const floor = 0.08 + (((i * 17) % 40) / 100)
    const period = 380 + (i % 17) * 70
    const tw = floor + amp * Math.abs(Math.sin(t / period + i * 1.37))
    const a = (0.16 + 0.78 * tw * (0.22 + mag)) * strength
    if (a < 0.035) continue
    ctx.globalAlpha = Math.min(1, a)
    if (mag > 0.88) {
      ctx.beginPath()
      ctx.arc(sx, sy, 0.9 + mag * 1.1, 0, Math.PI * 2)
      ctx.fill()
    } else if (mag > 0.62) {
      const s = 1.15 + mag * 0.7
      ctx.fillRect(sx, sy, s, s)
    } else {
      const s = 0.85 + mag * 0.55
      ctx.fillRect(sx, sy, s, s)
    }
  }
  ctx.restore()
}

/** 高空卷云：断开的柔雾团，不用扁椭圆连成一条白带 */
function drawCirrus(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  wind: number,
  strength: number,
) {
  if (strength <= 0.04) return
  ctx.save()
  const dir = wind < 0 ? -1 : 1
  const period = w * 1.45
  const wisps = 5
  for (let i = 0; i < wisps; i++) {
    const travel = (t / 1000) * (5.5 + i * 0.9)
    const wrapped = ((dir * travel) % period + period) % period
    const x0 = w * ((i * 0.19) % 0.72) - wrapped * 0.28 + wind * 8
    const y0 = h * (0.09 + (i % 3) * 0.05 + Math.sin(t / 32000 + i * 1.4) * 0.012)
    const len = w * (0.16 + (i % 3) * 0.05)
    const tilt = (i % 2 === 0 ? 0.08 : -0.06) + Math.sin(t / 42000 + i) * 0.02
    const puffs = 3
    for (let j = 0; j < puffs; j++) {
      const u = (j + 0.5) / puffs
      if (j === 1 && i % 2 === 0) continue
      const px = x0 + len * u
      const py = y0 + Math.sin(u * Math.PI * 1.6 + i) * h * 0.014
      const rx = w * (0.035 + (j % 2) * 0.012)
      const ry = h * (0.022 + ((j + i) % 3) * 0.006)
      const a = strength * (0.03 + Math.sin(u * Math.PI) * 0.028)
      const fadeR = Math.min(rx, ry)
      const grad = ctx.createRadialGradient(px, py, 0, px, py, fadeR)
      grad.addColorStop(0, `rgba(255, 252, 248, ${a})`)
      grad.addColorStop(0.55, `rgba(236, 244, 255, ${a * 0.32})`)
      grad.addColorStop(1, 'rgba(255, 255, 255, 0)')
      ctx.fillStyle = grad
      ctx.beginPath()
      ctx.ellipse(px, py, rx, ry, tilt, 0, Math.PI * 2)
      ctx.fill()
    }
  }
  ctx.restore()
}

/** 风中气流横线（大风/沙尘暴/暴雨雨帘） */
function drawWindStreaks(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  wind: number,
  strength: number,
  count = 14,
) {
  if (strength <= 0.05 || Math.abs(wind) <= 0.35) return
  ctx.save()
  const dir = wind < 0 ? -1 : 1
  const speedPx = t * 0.055
  for (let i = 0; i < count; i++) {
    const seed = i * 97.3
    const y = (((seed * 71) % 100) / 100) * h * 0.86
    const len = 40 + ((seed * 13) % 60)
    const phase = ((seed * 19) % 100) / 100
    const travel = ((speedPx * 0.9 + phase * w) % (w + 180))
    const x0 = dir > 0 ? w + 90 - travel : -90 + travel
    const alpha = 0.07 + (((seed * 7) % 10) / 10) * 0.15
    const x1 = x0 + len * dir
    const grad = ctx.createLinearGradient(x0, y, x1, y)
    grad.addColorStop(0, `rgba(230, 235, 245, ${alpha * strength})`)
    grad.addColorStop(1, 'rgba(230, 235, 245, 0)')
    ctx.strokeStyle = grad
    ctx.lineWidth = 1.2
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x1, y)
    ctx.stroke()
  }
  ctx.restore()
}

/** 地面吹雪（大风雪时底部快速掠过的白色细线） */
function drawSnowDrift(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  wind: number,
  strength: number,
) {
  if (strength <= 0.05 || Math.abs(wind) <= 0.5) return
  ctx.save()
  const dir = wind < 0 ? -1 : 1
  const speedPx = t * 0.08
  const count = 12
  for (let i = 0; i < count; i++) {
    const seed = i * 61.7
    const y = h * (0.78 + (((seed * 31) % 100) / 100) * 0.2)
    const len = 30 + ((seed * 11) % 50)
    const phase = ((seed * 29) % 100) / 100
    const travel = (speedPx * 0.8 + phase * w) % (w + 200)
    const x0 = dir > 0 ? w + 100 - travel : -100 + travel
    const alpha = 0.1 + (((seed * 5) % 10) / 10) * 0.12
    ctx.strokeStyle = `rgba(240, 245, 255, ${alpha * strength})`
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(x0, y)
    ctx.lineTo(x0 + len * dir, y - 3)
    ctx.stroke()
  }
  ctx.restore()
}

/** 地面剪影：仅夜间底部灯火微点，不再铺深色底部蒙版 */
function drawGroundSilhouette(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  profile: WeatherEffectProfile,
  sceneParams: Partial<WeatherEffectSceneParams> | null | undefined,
) {
  if (!profile.isNight) return
  const scene = sceneParams || {}
  const strength = scene.skyDarken ?? 0.65
  ctx.save()
  const lights = 26
  for (let i = 0; i < lights; i++) {
    const lx = (((i * 127.3) % 100) / 100) * w
    const ly = h * (0.9 + (((i * 41.7) % 100) / 100) * 0.08)
    const flicker = 0.5 + 0.5 * Math.sin(t / 2400 + i * 3.7)
    ctx.fillStyle = `rgba(255, 190, 110, ${0.26 * flicker * strength})`
    ctx.beginPath()
    ctx.arc(lx, ly, 0.6 + ((i * 17) % 4) * 0.25, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/** 沙尘暴：水平尘带 + 近地尘锋，不做整屏尘幕蒙版 */
function drawSandstormHaze(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  _profile: WeatherEffectProfile,
  sceneParams: Partial<WeatherEffectSceneParams> | null | undefined,
  wind: number = 0,
) {
  const scene = sceneParams || {}
  const opacity = (scene.opacity ?? scene.fogOpacity ?? 0.6) * (0.75 + wind * 0.1)
  const drift = scene.fogDrift ?? scene.driftSpeed ?? 1.1
  ctx.save()
  // 多层水平尘带：更贴近近地（沙尘暴主体在中低空）
  const bands = 7
  for (let i = 0; i < bands; i++) {
    const layerT = (t / (3200 + i * 620)) * drift
    const depth = i / (bands - 1)
    const wx =
      wrapOffset(windDriftOffset(wind, t, 0.8 + i * 0.12), w) +
      w * (0.08 + ((i * 0.21) % 0.85)) +
      Math.sin(layerT) * 28
    const wy = h * (0.35 + depth * 0.5 + Math.sin(layerT * 0.7 + i) * 0.03)
    const wr = w * (0.13 + depth * 0.14)
    const a = opacity * (0.14 + depth * 0.24)
    const grad = ctx.createRadialGradient(wx, wy, 0, wx, wy, wr)
    grad.addColorStop(0, `rgba(202, 172, 112, ${a})`)
    grad.addColorStop(0.5, `rgba(184, 150, 90, ${a * 0.5})`)
    grad.addColorStop(1, 'rgba(160, 126, 70, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(wx, wy, wr, wr * 0.24, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  // 近地滚动的尘锋
  const frontStrength = (scene.intensity ?? 0.6) * (0.6 + wind * 0.12)
  const frontW = w * 0.42
  const frontX = wrapOffset(windDriftOffset(wind, t, 1.5), w + frontW) - frontW * 0.5
  const frontH = h * (0.14 + frontStrength * 0.09)
  const breatheF = Math.sin(t / 2600) * h * 0.02
  const front = ctx.createLinearGradient(frontX - frontW * 0.4, 0, frontX + frontW * 0.4, 0)
  front.addColorStop(0, 'rgba(118, 94, 56, 0)')
  front.addColorStop(0.42, `rgba(150, 118, 72, ${0.22 * frontStrength})`)
  front.addColorStop(0.55, `rgba(118, 92, 54, ${0.28 * frontStrength})`)
  front.addColorStop(1, 'rgba(108, 84, 48, 0)')
  ctx.fillStyle = front
  ctx.beginPath()
  ctx.moveTo(frontX - frontW * 0.4, h)
  ctx.quadraticCurveTo(frontX, h - frontH + breatheF, frontX + frontW * 0.4, h)
  ctx.closePath()
  ctx.fill()
  ctx.restore()
}

/** 极光：夜间晴朗低概率的飘动光带（rich 效果，随时间包络淡入淡出） */
function drawAurora(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  t: number,
  strength: number,
  wind: number = 0,
) {
  if (strength <= 0.04) return
  ctx.save()
  ctx.globalCompositeOperation = 'screen'
  const baseY = h * 0.14
  const drift = windDriftOffset(wind, t, 0.25)
  // 多条蜿蜒光带（不做半屏底光蒙版）
  for (let band = 0; band < 4; band++) {
    const hue = 140 + band * 34
    const grad = ctx.createLinearGradient(0, baseY + band * 18, 0, h * 0.55 + band * 8)
    grad.addColorStop(0, `hsla(${hue}, 85%, 62%, 0)`)
    grad.addColorStop(0.35, `hsla(${hue + 22}, 80%, 64%, ${0.1 * strength})`)
    grad.addColorStop(0.7, `hsla(${hue + 42}, 82%, 60%, ${0.06 * strength})`)
    grad.addColorStop(1, `hsla(${hue + 55}, 85%, 58%, 0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.moveTo(-60 + drift, baseY + band * 18)
    const segCount = 8
    for (let i = 0; i <= segCount; i++) {
      const segX = -60 + drift + ((w + 120) / segCount) * i
      const wave = Math.sin(t / (2200 + band * 420) + i * 1.3 + band) * h * 0.055
      const lift = Math.sin(t / 3400 + band * 2.1) * h * 0.045
      const segY = baseY + band * 18 + wave + lift
      if (i === 0) ctx.moveTo(segX, segY)
      else ctx.lineTo(segX, segY)
    }
    // 向下收束到光带下方，避免铺成半屏色块
    for (let i = segCount; i >= 0; i--) {
      const segX = -60 + drift + ((w + 120) / segCount) * i
      const wave = Math.sin(t / (2200 + band * 420) + i * 1.3 + band) * h * 0.055
      const lift = Math.sin(t / 3400 + band * 2.1) * h * 0.045
      ctx.lineTo(segX, baseY + band * 18 + wave + lift + h * 0.12)
    }
    ctx.closePath()
    ctx.fill()
  }
  ctx.restore()
}

export function drawSnowAccumulation(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  strength: number,
  coldTint: number,
  t: number = 0,
) {
  if (strength <= 0.05) return
  ctx.save()
  const breathe = t > 0 ? 0.92 + Math.sin(t / 8000) * 0.08 : 1
  const patches = 7
  for (let i = 0; i < patches; i++) {
    const px = w * (0.06 + i * 0.14)
    const py = h * (0.9 + ((i * 37) % 5) * 0.012)
    const pr = w * (0.08 + ((i * 13) % 4) * 0.02)
    const a = 0.1 * strength * breathe * (0.7 + ((i * 7) % 5) * 0.06)
    const grad = ctx.createRadialGradient(px, py, 0, px, py, pr)
    grad.addColorStop(
      0,
      `rgba(${220 - coldTint * 15}, ${230 - coldTint * 8}, 245, ${a})`,
    )
    grad.addColorStop(1, 'rgba(210, 220, 235, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(px, py, pr, pr * 0.22, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

/**
 * 按层排序的云顺序缓存。
 *
 * ``layer`` 只在构造时确定，云数组本身也是场景创建时一次性建好的，所以「谁在前面」
 * 是稳定事实；原实现每帧 ``[...clouds].sort(...)`` 都在分配一份副本 + 重排，
 * 这里按数组身份缓存一次（数组换了或长度变了才重排）。
 */
const sortedCloudsCache = new WeakMap<Cloud[], Cloud[]>()
function cloudsByLayer(clouds: Cloud[]) {
  const cached = sortedCloudsCache.get(clouds)
  if (cached && cached.length === clouds.length) return cached
  const sorted = [...clouds].sort((a, b) => a.layer - b.layer)
  sortedCloudsCache.set(clouds, sorted)
  return sorted
}

function drawDriftingClouds(
  ctx: CanvasRenderingContext2D,
  clouds: Cloud[],
  t: number,
  dt: number,
  wind: number,
  driftMul: number,
  windMul: number,
  options: { storm?: boolean; alphaMul?: number; night?: boolean } = {},
) {
  const storm = options.storm ?? false
  const alphaMul = options.alphaMul ?? 1
  const night = options.night ?? false
  const sorted = cloudsByLayer(clouds)
  const effectiveWind = wind * windMul * driftMul
  sorted.forEach((c: Cloud) => {
    c.update(dt, effectiveWind)
    c.draw(ctx, t, storm, alphaMul, night)
  })
}

export function drawAmbientScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  profile: WeatherEffectProfile,
  t: number,
  dt: number,
  wind: number,
  rich: boolean,
  effectConfig: ResolvedWeatherEffectConfig,
  { stars, clouds }: { stars: Star[]; clouds: Cloud[] },
) {
  const scene = effectConfig.scene!
  const night = profile.isNight
  const starBright = scene.starBrightness ?? 1
  const kind = profile.kind

  // 夜空：晴夜最亮；局部多云/阴天随云量压暗星光（贴合实际遮挡）
  if (
    night &&
    ['clear-night', 'clear-day', 'partly-cloudy', 'cloudy', 'windy'].includes(kind)
  ) {
    const coverDim =
      kind === 'clear-night' || kind === 'clear-day'
        ? 1
        : kind === 'partly-cloudy'
          ? Math.max(0.35, 1 - profile.cloudCover * 0.7)
          : Math.max(0.15, 1 - profile.cloudCover * 0.9)
    drawFullSkyStars(ctx, w, h, t, starBright * coverDim)
    stars.forEach((s: Star) => {
      s.update(dt)
      ctx.save()
      ctx.globalAlpha = starBright * coverDim
      s.draw(ctx)
      ctx.restore()
    })
    if (kind === 'clear-night') {
      drawMilkyWay(ctx, w, h, t, (scene.starBrightness ?? 0.8) * coverDim)
    }
    if (rich && kind === 'clear-night') {
      const env = Math.pow(Math.max(0, Math.sin(t / 26000 + 1.2)), 3)
      if (env > 0.02) drawAurora(ctx, w, h, t, (scene.aurora ?? 1) * env, wind)
    }
  }

  if (kind === 'sandstorm') {
    drawSandstormHaze(ctx, w, h, t, profile, scene, wind)
  }

  // 局部多云：高空淡卷云点缀（晴天不画，避免天空被丝状高光打断）
  if (!night && kind === 'partly-cloudy') {
    drawCirrus(ctx, w, h, t, wind, 0.32)
  }

  if (kind === 'clear-day' && !night && rich) {
    drawDustMotes(
      ctx,
      w,
      h,
      t,
      0.55 * (scene.dustMotes ?? 0.6),
      Math.round(22 * (scene.dustMotes ?? 0.6)),
      wind,
    )
  }

  const driftMul = scene.driftSpeed ?? 1

  // 局部多云：稀疏积云 + 云隙阳光（白天）
  if (kind === 'partly-cloudy') {
    drawDriftingClouds(ctx, clouds, t, dt, wind, driftMul, 1.5 + wind * 0.2, {
      alphaMul: night ? 1.05 : 1.35,
      night,
    })
    if (!night && rich) {
      const { sunX } = resolveCelestialPosition(profile.dayPhase, w, h)
      let occlude = 1
      clouds.forEach((c) => {
        const cx = c.x + c.width * 0.5
        const dist = Math.abs(cx - sunX) / Math.max(90, c.width * 0.5)
        if (dist < 1.05) occlude = Math.min(occlude, 0.62 + dist * 0.38)
      })
      drawSunbeams(
        ctx,
        w,
        h,
        t,
        (scene.sunbeam ?? 0.55) * (1 - profile.cloudCover * 0.35),
        occlude,
        profile.dayPhase,
      )
      drawDustMotes(ctx, w, h, t, 0.22 * (scene.dustMotes ?? 0.28), 10, wind)
    }
  }

  // 阴天 / 大风：层云铺展，风大时漂得更快
  if (kind === 'cloudy' || kind === 'windy') {
    const gust = resolveGust(t, Math.abs(wind), scene.gustStrength ?? 1)
    const windMul =
      kind === 'windy' ? 1.6 + Math.abs(wind) * 0.35 + gust * 1.4 : 1.4 + Math.abs(wind) * 0.25
    const alpha =
      kind === 'cloudy'
        ? Math.min(1.15, (scene.opacity ?? 0.75) * (night ? 0.88 : 1.0))
        : night
          ? 0.75
          : 0.95
    drawDriftingClouds(ctx, clouds, t, dt, wind, driftMul, windMul, { alphaMul: alpha, night })
  }

  // 毛毛雨 / 雨：偏低暗云，昼夜都有
  if (kind === 'drizzle' || kind === 'rain') {
    drawDriftingClouds(ctx, clouds, t, dt, wind, driftMul * 0.85, 1.1, {
      alphaMul: kind === 'rain' ? (night ? 0.85 : 0.95) : night ? 0.7 : 0.78,
      night,
      storm: kind === 'rain',
    })
  }

  // 暴雨 / 雷雨 / 冰雹：浓厚雨层云
  if (kind === 'thunderstorm' || kind === 'heavy-rain' || kind === 'hail') {
    drawDriftingClouds(ctx, clouds, t, dt, wind, driftMul * 0.9, 0.85 + wind * 0.15, {
      storm: true,
      alphaMul: kind === 'hail' ? 0.85 : 1.05,
      night,
    })
  }

  // 雪 / 雨雪：柔白云层
  if (kind === 'snow' || kind === 'sleet') {
    drawDriftingClouds(ctx, clouds, t, dt, wind, driftMul * 0.6, 0.7 + wind * 0.2, {
      alphaMul: night ? 0.7 : 0.88,
      storm: kind === 'sleet',
      night,
    })
  }

  // 气流丝：大风/沙尘更明显；暴雨时偏弱雨帘感
  if (
    rich &&
    (kind === 'windy' || kind === 'sandstorm' || kind === 'heavy-rain' || kind === 'thunderstorm')
  ) {
    const streakStrength =
      (kind === 'sandstorm' ? 0.85 : kind === 'windy' ? 0.75 : kind === 'heavy-rain' ? 0.35 : 0.42) *
      (0.55 + resolveGust(t, Math.abs(wind), scene.gustStrength ?? 1) * 0.7)
    drawWindStreaks(ctx, w, h, t, wind, streakStrength)
  }

  // 吹雪：风速够才出现
  if (rich && (kind === 'snow' || kind === 'sleet') && Math.abs(wind) > 0.45) {
    drawSnowDrift(ctx, w, h, t, wind, kind === 'snow' ? 0.75 : 0.45)
  }

  drawGroundSilhouette(ctx, w, h, t, profile, scene)
  drawAtmosphereLayer(ctx, w, h, profile, t, scene, wind)
}

export function drawRainMist(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity: number,
  mist: number = 0.4,
  t: number = 0,
) {
  // 雨雾贴近地面与中景，像真实雨幕尾迹
  const pulse = t > 0 ? 0.92 + Math.sin(t / 4200) * 0.08 : 1
  const a = (0.05 + intensity * 0.1 + mist * 0.05) * pulse
  ctx.save()
  for (let i = 0; i < 7; i++) {
    const phase = t / (3800 + i * 420) + i * 1.1
    const mx = w * (0.08 + i * 0.13) + Math.sin(phase) * 20
    const my = h * (0.62 + (i % 3) * 0.1 + Math.cos(phase * 0.8) * 0.025)
    const mr = w * (0.09 + (i % 3) * 0.025)
    const grad = ctx.createRadialGradient(mx, my, 0, mx, my, mr)
    grad.addColorStop(0, `rgba(78, 86, 102, ${a})`)
    grad.addColorStop(1, 'rgba(50, 55, 70, 0)')
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(mx, my, mr, mr * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}

export function drawSnowHaze(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  intensity: number,
  coldTint: number = 0.5,
  t: number = 0,
) {
  // 雪霾：偏中低空的冷色软絮
  const pulse = t > 0 ? 0.94 + Math.sin(t / 5800) * 0.06 : 1
  const b = 200 + coldTint * 10
  ctx.save()
  for (let i = 0; i < 6; i++) {
    const phase = t / (4600 + i * 500) + i
    const sx = w * (0.1 + i * 0.15) + Math.sin(phase) * 18
    const sy = h * (0.48 + (i % 3) * 0.14 + Math.cos(phase * 0.7) * 0.03)
    const sr = w * (0.08 + (i % 2) * 0.035)
    const a = 0.07 * intensity * pulse
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, sr)
    grad.addColorStop(0, `rgba(${b + 10}, ${b + 16}, ${b + 22}, ${a})`)
    grad.addColorStop(1, `rgba(${b}, ${b + 8}, ${b + 18}, 0)`)
    ctx.fillStyle = grad
    ctx.beginPath()
    ctx.ellipse(sx, sy, sr, sr * 0.3, 0, 0, Math.PI * 2)
    ctx.fill()
  }
  ctx.restore()
}
