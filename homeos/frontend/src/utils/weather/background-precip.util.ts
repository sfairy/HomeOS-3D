/**
 * 天气背景降水与特效绘制
 *
 * 职责：
 * - 绘制雨 / 雪 / 冰雹 / 飘叶等降水粒子，并管理其生命周期与强度。
 * - 绘制闪电闪烁（含 leader / stroke / afterglow 相位）与场景层合成。
 * - 合成水洼涟漪、雨雾、雪霾、积雪等场景层效果。
 *
 * 依赖：
 * - @/utils/weather/particle-classes 的粒子绘制与类型。
 * - @/utils/weather/effect-condition.util 的效果判定。
 * - @/utils/weather/effect-presets.util 的已解析效果配置。
 * - @/utils/weather/background-canvas.util 的闪电与场景层绘制工具。
 *
 * 注意：
 * - `lightningPhase`（idle / leader / stroke / afterglow）为相位标识符，不翻译。
 * - 坐标 / 计时为运行时数值状态，不翻译。
 */
import { drawWeatherParticles } from '@/utils/weather/particle-classes'
import type {
  FastRain,
  GlassDrop,
  HailPellet,
  LeafParticle,
  SnowCrystal,
} from '@/utils/weather/particle-classes'
import type { WeatherEffectProfile } from '@/utils/weather/effect-condition.util'
import type { ResolvedWeatherEffectConfig } from '@/utils/weather/effect-presets.util'
import {
  Lightning,
  drawLightningBolt,
  drawPuddleShimmer,
  drawRainMist,
  drawSnowHaze,
  drawSnowAccumulation,
  profileHasLightning,
  profileHasRain,
  profileHasSnow,
  profileHasSleet,
} from '@/utils/weather/background-canvas.util'

type WeatherPrecipState = {
  lightning: Lightning | null
  lightningTimer: number
  lightningNext: number
  lightningFlash: number
  lightningGlow: number
  lightningPhase: 'idle' | 'leader' | 'stroke' | 'afterglow'
  lightningRepeat: boolean
}

export function drawWeatherPrecipAndEffects(
  ctx: CanvasRenderingContext2D,
  p: WeatherEffectProfile,
  w: number,
  h: number,
  t: number,
  dt: number,
  wind: number,
  rainAngle: number,
  richEffects: boolean,
  renderConfig: ResolvedWeatherEffectConfig,
  particles: {
    glassDrops: GlassDrop[]
    fastRain: FastRain[]
    snowCrystals: SnowCrystal[]
    leaves: LeafParticle[]
    hail: HailPellet[]
  },
  particleWorkerActive: boolean,
  resolvePrecipIntensity: (profile: WeatherEffectProfile) => number,
  state: WeatherPrecipState,
  particleScale: number = 1,
) {
  const scene = renderConfig.scene!
  const { leaves } = particles
  const particleOpts = { scene, rainIntensity: undefined as number | undefined }
  const scale = Math.min(1, Math.max(0.2, particleScale))

  if (profileHasSleet(p)) {
    const intensity = resolvePrecipIntensity(p)
    particleOpts.rainIntensity = intensity
    if (!particleWorkerActive) {
      drawWeatherParticles(ctx, w, h, p, wind, rainAngle, dt, particles, {
        ...particleOpts,
        rainIntensity: intensity,
        drawHail: false,
        countScale: scale,
      })
    }
    if (richEffects) {
      drawRainMist(ctx, w, h, intensity, scene.mist ?? 0.4, t)
      drawSnowHaze(ctx, w, h, intensity, scene.coldTint ?? 0.45, t)
    }
  } else if (p.kind === 'hail') {
    if (!particleWorkerActive) {
      drawWeatherParticles(ctx, w, h, p, wind, rainAngle, dt, particles, {
        scene,
        drawGlass: false,
        drawRain: false,
        drawSnow: false,
        drawLeaves: false,
        countScale: scale,
      })
    }
  } else {
    if (profileHasRain(p)) {
      const intensity = resolvePrecipIntensity(p)
      particleOpts.rainIntensity = intensity
      if (!particleWorkerActive && richEffects) {
        drawWeatherParticles(ctx, w, h, p, wind, rainAngle, dt, particles, {
          ...particleOpts,
          rainIntensity: intensity,
          drawSnow: false,
          drawRain: false,
          drawLeaves: false,
          drawHail: false,
          countScale: scale,
        })
        if (scene.puddle) drawPuddleShimmer(ctx, w, h, t, wind)
      }
      if (!particleWorkerActive) {
        drawWeatherParticles(ctx, w, h, p, wind, rainAngle, dt, particles, {
          ...particleOpts,
          rainIntensity: intensity,
          drawGlass: false,
          drawSnow: false,
          drawLeaves: false,
          drawHail: false,
          countScale: scale,
        })
      }
      drawRainMist(ctx, w, h, intensity, scene.mist ?? 0.4, t)
    }
    if (profileHasSnow(p)) {
      if (!particleWorkerActive) {
        drawWeatherParticles(ctx, w, h, p, wind, rainAngle, dt, particles, {
          scene,
          drawGlass: false,
          drawRain: false,
          drawLeaves: false,
          drawHail: false,
          countScale: scale,
        })
      }
      if (richEffects) {
        const snowIntensity = scene.intensity ?? p.precipIntensity
        drawSnowHaze(ctx, w, h, snowIntensity, scene.coldTint ?? 0.5, t)
        drawSnowAccumulation(ctx, w, h, scene.accumulation ?? 0.5, scene.coldTint ?? 0.5, t)
      }
    }
  }
  if (p.kind === 'windy' || Math.abs(wind) > 1) {
    if (!particleWorkerActive) {
      const leafScale = scene.leafParticles ?? 0.75
      const leafCount = Math.ceil(leaves.length * leafScale * scale)
      leaves.slice(0, leafCount).forEach((l: LeafParticle) => {
        l.update(w, h, wind, dt)
        l.draw(ctx, wind)
      })
    }
  }
  if (p.kind === 'sandstorm' && !particleWorkerActive) {
    const dustScale = scene.leafParticles ?? 0.9
    const dustCount = Math.ceil(leaves.length * dustScale * scale)
    leaves.slice(0, dustCount).forEach((l: LeafParticle) => {
      l.update(w, h, wind, dt, true)
      l.draw(ctx, wind, true)
    })
  }
  if (profileHasLightning(p)) {
    const now = Date.now()
    const minMs = scene.lightningMinMs ?? 2500
    const maxMs = scene.lightningMaxMs ?? 10000
    const flashStr = scene.flashStrength ?? 1
    if (now > state.lightningNext && state.lightningPhase === 'idle') {
      state.lightning = new Lightning(w, h)
      state.lightningPhase = 'leader'
      state.lightningTimer = 0.14
      state.lightningFlash = 0.18 * flashStr
      state.lightningGlow = 0.25 * flashStr
      state.lightningRepeat = Math.random() < 0.32
      state.lightningNext = now + minMs + Math.random() * (maxMs - minMs)
    }
    if (state.lightningPhase !== 'idle') {
      const boltX = state.lightning?.points[0]?.x ?? w * 0.5
      const boltY = state.lightning?.points[0]?.y ?? h * 0.05
      const isStroke = state.lightningPhase === 'stroke'
      const isLeader = state.lightningPhase === 'leader'
      const flashR = w * (isStroke ? 0.42 : 0.28)
      ctx.save()
      const flash = ctx.createRadialGradient(boltX, boltY, 0, boltX, boltY, flashR)
      const flashAlpha = isStroke
        ? state.lightningFlash * 0.42
        : isLeader
          ? state.lightningFlash * 0.12
          : state.lightningFlash * 0.16
      flash.addColorStop(0, `rgba(245, 240, 255, ${flashAlpha})`)
      flash.addColorStop(0.4, `rgba(210, 200, 255, ${flashAlpha * 0.35})`)
      flash.addColorStop(1, 'rgba(160, 150, 220, 0)')
      ctx.fillStyle = flash
      ctx.beginPath()
      ctx.arc(boltX, boltY, flashR, 0, Math.PI * 2)
      ctx.fill()
      if (isStroke) {
        const core = ctx.createRadialGradient(boltX, boltY, 0, boltX, boltY, flashR * 0.4)
        core.addColorStop(0, `rgba(255, 252, 255, ${state.lightningFlash * 0.4})`)
        core.addColorStop(1, 'rgba(255, 250, 255, 0)')
        ctx.fillStyle = core
        ctx.beginPath()
        ctx.arc(boltX, boltY, flashR * 0.4, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha =
        state.lightningPhase === 'afterglow' ? state.lightningGlow * 0.45 : state.lightningFlash * 0.2
      const cloudGlow = ctx.createRadialGradient(w * 0.5, h * 0.08, 0, w * 0.5, h * 0.08, w * 0.45)
      cloudGlow.addColorStop(0, 'rgba(210, 195, 255, 0.7)')
      cloudGlow.addColorStop(0.5, 'rgba(180, 170, 245, 0.25)')
      cloudGlow.addColorStop(1, 'rgba(140, 130, 220, 0)')
      ctx.fillStyle = cloudGlow
      ctx.beginPath()
      ctx.ellipse(w * 0.5, h * 0.08, w * 0.45, h * 0.22, 0, 0, Math.PI * 2)
      ctx.fill()
      ctx.restore()
      const boltAlpha = isLeader ? state.lightningFlash * 0.45 : state.lightningFlash
      if (state.lightning) drawLightningBolt(ctx, state.lightning, boltAlpha)

      state.lightningTimer -= 0.04 * dt
      if (state.lightningPhase === 'leader' && state.lightningTimer <= 0) {
        state.lightningPhase = 'stroke'
        state.lightningTimer = 0.07
        state.lightningFlash = 1 * flashStr
      } else if (state.lightningPhase === 'stroke' && state.lightningTimer <= 0) {
        if (state.lightningRepeat) {
          state.lightningRepeat = false
          state.lightningPhase = 'stroke'
          state.lightningTimer = 0.055
          state.lightningFlash = 0.72 * flashStr
          state.lightning = new Lightning(w, h)
        } else {
          state.lightningPhase = 'afterglow'
          state.lightningTimer = 0.28
          state.lightningFlash = 0.22 * flashStr
          state.lightningGlow = 0.55 * flashStr
        }
      } else if (state.lightningPhase === 'afterglow') {
        state.lightningFlash = Math.max(0, state.lightningFlash - 0.025 * dt)
        state.lightningGlow = Math.max(0, state.lightningGlow - 0.018 * dt)
        if (state.lightningTimer <= 0) {
          state.lightningPhase = 'idle'
          state.lightning = null
        }
      }
    }
  }
}
