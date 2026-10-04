/**
 * 天气背景粒子类集合（雨 / 雪 / 雹 / 玻璃雨滴）
 *
 * 职责：
 * - 定义雨滴、雪花、冰雹、玻璃近景雨滴等粒子类，封装各自初始化、运动、绘制逻辑。
 * - 由 weather/background-canvas 等渲染层按天气效果实例化与调度。
 *
 * 依赖：
 * - @/utils/weather/effect-condition.util 的降水判定与强度量化。
 * - @/utils/weather/effect-presets.util 的效果场景参数。
 * - @/utils/weather/animation.util 的雨滴倾角解析。
 *
 * 注意：
 * - 粒子坐标 / 半径 / 速度为数值运行时状态，不翻译。
 * - 类名（GlassDrop / Raindrop / Snowflake / ...）为内部标识符，不翻译。
 */
import type { WeatherEffectProfile } from '@/utils/weather/effect-condition.util'
import type { WeatherEffectSceneParams } from '@/utils/weather/effect-presets.util'
import { resolveRainTiltAngle } from '@/utils/weather/animation.util'
import {
  profileHasRain,
  profileHasSnow,
  profileHasHail,
  profilePrecipIntensity,
} from '@/utils/weather/effect-condition.util'

type TrailPoint = { x: number; y: number; r: number }

/** 玻璃雨滴（近景） */
export class GlassDrop {
  x = 0
  y = 0
  r = 0
  speed = 0
  trail: TrailPoint[] = []
  maxTrail = 0
  opacity = 0
  wobble = 0
  wobbleSpeed = 0
  wobbleAmp = 0
  splashing = false
  splashProgress = 0
  windBias = 0
  _dropGrad?: CanvasGradient
  _dropGradR = 0
  _dropGradO = 0

  constructor(w: number, h: number) {
    this.init(w, h)
  }

  init(w: number, h: number, randomX = true) {
    this.x = randomX ? Math.random() * w : -20
    this.y = -20 - Math.random() * 100
    this.r = 1.5 + Math.random() * 2.5
    this.speed = 0.8 + Math.random() * 1.5
    this.trail = []
    this.maxTrail = Math.floor(5 + Math.random() * 8)
    this.opacity = 0.3 + Math.random() * 0.4
    this.wobble = Math.random() * Math.PI * 2
    this.wobbleSpeed = 0.015 + Math.random() * 0.015
    this.wobbleAmp = 0.15 + Math.random() * 0.25
    this.windBias = 0.25 + Math.random() * 0.35
    this.splashing = false
    this.splashProgress = 0
  }

  update(w: number, h: number, wind: number, dt: number) {
    if (this.splashing) {
      this.splashProgress += dt * 0.15
      if (this.splashProgress >= 1) {
        this.splashing = false
        this.splashProgress = 0
        this.init(w, h)
      }
      return
    }
    this.trail.unshift({ x: this.x, y: this.y, r: this.r * 0.45 })
    if (this.trail.length > this.maxTrail) this.trail.pop()
    this.wobble += this.wobbleSpeed * dt
    this.y += this.speed * dt * 1.5
    this.x += (Math.sin(this.wobble) * this.wobbleAmp + wind * this.windBias) * dt
    if (this.y > h - 20) {
      this.splashing = true
      this.splashProgress = 0
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    if (this.splashing) {
      const splashX = this.x
      const splashY = this.y
      const splashAlpha = (1 - this.splashProgress) * this.opacity
      for (let i = 0; i < 5; i++) {
        const angle = (i / 5) * Math.PI * 2
        const dist = this.splashProgress * 8
        ctx.beginPath()
        ctx.arc(
          splashX + Math.cos(angle) * dist,
          splashY + Math.sin(angle) * dist * 0.5,
          this.r * (0.3 - this.splashProgress * 0.2),
          0,
          Math.PI * 2,
        )
        ctx.fillStyle = `rgba(200, 220, 240, ${splashAlpha * 0.5})`
        ctx.fill()
      }
      return
    }
    this.trail.forEach((t, i) => {
      const alpha = (1 - i / this.trail.length) * 0.2 * this.opacity
      ctx.beginPath()
      ctx.arc(t.x, t.y, t.r * (1 - i * 0.08), 0, Math.PI * 2)
      ctx.fillStyle = `rgba(180, 200, 220, ${alpha})`
      ctx.fill()
    })
    ctx.save()
    ctx.translate(this.x, this.y)
    if (!this._dropGrad || this._dropGradR !== this.r || this._dropGradO !== this.opacity) {
      this._dropGradR = this.r
      this._dropGradO = this.opacity
      this._dropGrad = ctx.createRadialGradient(-this.r * 0.3, -this.r * 0.3, 0, 0, 0, this.r)
      this._dropGrad.addColorStop(0, `rgba(255, 255, 255, ${this.opacity})`)
      this._dropGrad.addColorStop(0.3, `rgba(200, 220, 240, ${this.opacity * 0.6})`)
      this._dropGrad.addColorStop(1, `rgba(150, 180, 210, ${this.opacity * 0.2})`)
    }
    ctx.beginPath()
    ctx.arc(0, 0, this.r, 0, Math.PI * 2)
    ctx.fillStyle = this._dropGrad
    ctx.fill()
    ctx.beginPath()
    ctx.arc(-this.r * 0.25, -this.r * 0.25, this.r * 0.3, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255, 255, 255, ${this.opacity * 0.85})`
    ctx.fill()
    ctx.restore()
  }
}

/** 快速雨滴（远景）：按貌态分毛毛雨/中雨/暴雨帘 */
export type RainLook = 'drizzle' | 'rain' | 'heavy'

function rainLookFromKind(kind: WeatherEffectProfile['kind']): RainLook {
  if (kind === 'drizzle') return 'drizzle'
  if (kind === 'heavy-rain' || kind === 'thunderstorm') return 'heavy'
  return 'rain'
}

/** FastRain：类，构造参数与成员语义见成员 JSDoc。 */
export class FastRain {
  x = 0
  y = 0
  len = 0
  speed = 0
  opacity = 0
  angle = 0.03
  splash = 0
  splashX = 0
  splashY = 0
  splashR = 0
  look: RainLook = 'rain'
  depth = 0.5
  _streakGrad?: CanvasGradient
  _streakLen = 0
  _streakO = 0

  constructor(w: number, h: number) {
    this.reset(w, h, true)
  }

  reset(w: number, h: number, init = false) {
    this.x = Math.random() * (w + 400) - 200
    this.y = init ? Math.random() * h : -50 - Math.random() * 80
    this.depth = Math.random()
    const d = this.depth
    if (this.look === 'drizzle') {
      this.len = 4 + Math.random() * 8
      this.speed = 3.5 + Math.random() * 4.5
      this.opacity = 0.1 + Math.random() * 0.16
    } else if (this.look === 'heavy') {
      this.len = 10 + Math.random() * 16 * (0.45 + d * 0.7)
      this.speed = 22 + Math.random() * 14 * (0.6 + d * 0.5)
      this.opacity = 0.22 + Math.random() * 0.28 * (0.5 + d)
    } else {
      this.len = (16 + Math.random() * 22) * (0.5 + d * 0.75)
      this.speed = 14 + Math.random() * 10 * (0.55 + d * 0.6)
      this.opacity = (0.22 + Math.random() * 0.28) * (0.45 + d * 0.7)
    }
    this.angle = 0.03
    this.splash = 0
    this._streakGrad = undefined
  }

  update(w: number, h: number, wind: number, dt: number, look?: RainLook) {
    if (look && look !== this.look) {
      this.look = look
      this.reset(w, h, true)
    }
    if (this.splash > 0) {
      this.splash -= dt * (this.look === 'drizzle' ? 0.08 : 0.05)
      this.splashR += dt * (this.look === 'heavy' ? 0.75 : 0.55)
      if (this.splash <= 0) this.reset(w, h)
      return
    }
    const vx = wind * (this.look === 'drizzle' ? 0.55 : 1.5)
    this.y += this.speed * dt
    this.x += vx * dt
    this.angle = resolveRainTiltAngle(wind, this.speed)
    if (this.y > h + 8) {
      if (this.look === 'drizzle') {
        this.reset(w, h)
        return
      }
      this.splash = 1
      this.splashX = this.x
      this.splashY = h - 6
      this.splashR = this.look === 'heavy' ? 2.2 : 1.5
    } else if (this.x > w + 200 || this.x < -200) {
      this.reset(w, h)
    }
  }

  draw(ctx: CanvasRenderingContext2D, _angle?: number) {
    if (this.splash > 0) {
      const a = this.splash * this.opacity * 0.55
      ctx.save()
      ctx.strokeStyle = `rgba(185, 205, 230, ${a})`
      ctx.lineWidth = 0.7
      ctx.beginPath()
      ctx.ellipse(this.splashX, this.splashY, this.splashR, this.splashR * 0.32, 0, 0, Math.PI * 2)
      ctx.stroke()
      ctx.fillStyle = `rgba(190, 210, 235, ${a * 0.35})`
      ctx.beginPath()
      ctx.ellipse(this.splashX, this.splashY, this.splashR * 0.5, this.splashR * 0.16, 0, 0, Math.PI * 2)
      ctx.fill()
      if (this.look === 'heavy' || this.depth > 0.65) {
        for (let i = 0; i < 3; i++) {
          const ang = -0.6 + i * 0.6
          const dist = this.splashR * (1.1 + i * 0.15)
          ctx.fillStyle = `rgba(200, 220, 240, ${a * 0.4})`
          ctx.beginPath()
          ctx.arc(
            this.splashX + Math.cos(ang) * dist,
            this.splashY - Math.abs(Math.sin(ang)) * dist * 0.35,
            0.7,
            0,
            Math.PI * 2,
          )
          ctx.fill()
        }
      }
      ctx.restore()
      return
    }
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.angle)
    if (!this._streakGrad || this._streakLen !== this.len || this._streakO !== this.opacity) {
      this._streakLen = this.len
      this._streakO = this.opacity
      this._streakGrad = ctx.createLinearGradient(0, 0, 0, this.len)
      this._streakGrad.addColorStop(0, `rgba(210, 226, 244, ${this.opacity})`)
      this._streakGrad.addColorStop(0.5, `rgba(182, 203, 228, ${this.opacity * 0.6})`)
      this._streakGrad.addColorStop(1, 'rgba(170, 194, 222, 0)')
    }
    ctx.globalAlpha = 1
    ctx.strokeStyle = this._streakGrad
    ctx.lineWidth = this.look === 'drizzle' ? 0.7 : this.look === 'heavy' ? 1.15 : 1.35
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(0, 0)
    ctx.lineTo(0, this.len)
    ctx.stroke()
    if (this.look !== 'drizzle') {
      ctx.fillStyle = `rgba(230, 240, 250, ${this.opacity * 0.7})`
      ctx.beginPath()
      ctx.arc(0, 0, this.look === 'heavy' ? 0.9 : 1.1, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/** 六角雪花：按景深分层（近大远小），全部为六棱晶体 */
export class SnowCrystal {
  x = 0
  y = 0
  size = 0
  speed = 0
  opacity = 0
  rotation = 0
  rotationSpeed = 0
  wobble = 0
  wobbleSpeed = 0
  blur = 0
  /** 景深（0=远景小/慢/锐利，1=近景大/快/柔焦） */
  depth = 0.5
  /** 垂直漂浮相位 */
  floatPhase = 0
  /** 闪光相位 */
  glintPhase = 0
  /** 分叉层数：远景 1，近景 2 */
  branchLayers = 2

  constructor(w: number, h: number) {
    this.reset(w, h, true)
  }

  reset(w: number, h: number, init = false, tempC = 0) {
    this.x = Math.random() * w
    this.y = init ? Math.random() * h : -30 - Math.random() * 60
    this.depth = Math.random()
    const powder = tempC < -5
    const sizeMul = powder ? 0.7 : 1
    this.size = (2.6 + Math.random() * 4.4) * (0.7 + this.depth * 1.05) * sizeMul
    this.speed = (0.35 + Math.random() * 0.75) * (0.6 + this.depth * 0.65)
    this.opacity = (0.62 + Math.random() * 0.38) * (1 - this.depth * 0.22)
    this.rotation = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() - 0.5) * 0.012
    this.wobble = Math.random() * Math.PI * 2
    this.wobbleSpeed = 0.004 + Math.random() * 0.006
    this.floatPhase = Math.random() * Math.PI * 2
    this.branchLayers = this.size > 5.2 ? 2 : 1
    this.blur = Math.random() * 0.5
    this.glintPhase = Math.random() * Math.PI * 2
  }

  update(w: number, h: number, wind: number, dt: number, tempC = 0) {
    this.wobble += this.wobbleSpeed * dt
    this.floatPhase += 0.018 * dt
    this.glintPhase += 0.02 * dt
    const floatY = Math.sin(this.floatPhase) * 0.4 * (1 - this.depth)
    const windMag = Math.abs(wind)
    const horiz = wind * (0.35 + this.depth * 0.45 + windMag * 0.18)
    this.y += (this.speed + floatY) * dt * (windMag > 1.4 ? 0.72 : 1)
    this.x += (horiz + Math.sin(this.wobble) * (0.2 + this.depth * 0.3)) * dt
    this.rotation += this.rotationSpeed * dt
    if (this.y > h + 30) this.reset(w, h, false, tempC)
    if (this.x > w + 50) this.x = -50
    if (this.x < -50) this.x = w + 50
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation)
    ctx.globalAlpha = this.opacity * (1 - this.blur * 0.5)
    const s = this.size
    ctx.strokeStyle = `rgba(255, 255, 255, ${0.78 + this.blur * 0.22})`
    ctx.lineWidth = Math.max(0.5, 0.42 + this.blur * 0.28 + s * 0.035)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 中心六边形
    ctx.beginPath()
    const hexR = s * 0.2
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 + Math.PI / 6
      const px = Math.cos(a) * hexR
      const py = Math.sin(a) * hexR
      if (i === 0) ctx.moveTo(px, py)
      else ctx.lineTo(px, py)
    }
    ctx.closePath()
    ctx.fillStyle = `rgba(255, 255, 255, ${0.55 + this.blur * 0.2})`
    ctx.fill()
    ctx.stroke()

    // 六条主棱 + 60° 分叉
    const layers = this.branchLayers
    for (let i = 0; i < 6; i++) {
      ctx.save()
      ctx.rotate((i / 6) * Math.PI * 2)
      ctx.beginPath()
      ctx.moveTo(0, hexR * 0.85)
      ctx.lineTo(0, s)
      ctx.stroke()
      for (let j = 1; j <= layers; j++) {
        const y = s * (0.34 + (j - 1) * 0.26)
        const len = s * (0.42 - (j - 1) * 0.1)
        const dx = len * 0.866
        const dy = len * 0.5
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(dx, y + dy)
        ctx.stroke()
        ctx.beginPath()
        ctx.moveTo(0, y)
        ctx.lineTo(-dx, y + dy)
        ctx.stroke()
      }
      ctx.restore()
    }

    if (s > 4.2 && Math.sin(this.glintPhase) > 0.985) {
      ctx.globalAlpha = this.opacity * (Math.sin(this.glintPhase) - 0.985) * 55
      ctx.fillStyle = 'rgba(255, 255, 255, 1)'
      ctx.beginPath()
      ctx.arc(0, 0, s * 0.28, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/** 飘叶/尘絮（大风） */
export class LeafParticle {
  x = 0
  y = 0
  size = 0
  speed = 0
  rotation = 0
  rotationSpeed = 0
  opacity = 0
  hue = 0
  sway = 0
  swaySpeed = 0
  gustPhase = 0

  constructor(w: number, h: number) {
    this.reset(w, h, true)
  }

  reset(w: number, h: number, init = false) {
    this.x = Math.random() * w
    this.y = init ? Math.random() * h : -20 - Math.random() * 40
    this.size = 4 + Math.random() * 8
    this.speed = 0.9 + Math.random() * 1.8
    this.rotation = Math.random() * Math.PI * 2
    this.rotationSpeed = (Math.random() - 0.5) * 0.06
    this.opacity = 0.35 + Math.random() * 0.45
    this.hue = 25 + Math.random() * 40
    this.sway = Math.random() * Math.PI * 2
    this.swaySpeed = 0.015 + Math.random() * 0.02
    this.gustPhase = Math.random() * Math.PI * 2
  }

  update(w: number, h: number, wind: number, dt: number, sandMode = false) {
    this.sway += this.swaySpeed * dt
    this.gustPhase += 0.02 * dt
    const gust = 1 + Math.sin(this.gustPhase) * 0.28
    const horiz = sandMode ? wind * 3.4 : wind * 2.6
    this.x += (horiz + Math.sin(this.sway) * (sandMode ? 0.6 : 1.1)) * dt
    this.y +=
      (this.speed * (sandMode ? 0.22 : 0.4) + Math.max(0, Math.sin(this.sway + 1.3)) * 1.2) *
      dt *
      gust
    this.rotation += this.rotationSpeed * dt * gust * (1 + Math.abs(wind) * 0.5)
    if (this.y > h + 30 || this.x > w + 100 || this.x < -120) this.reset(w, h)
    if (this.x < -120) this.x = w + 60
  }

  draw(ctx: CanvasRenderingContext2D, wind = 0, sandMode = false) {
    ctx.save()
    ctx.translate(this.x, this.y)
    ctx.rotate(this.rotation + wind * 0.08)
    ctx.globalAlpha = this.opacity
    if (sandMode) {
      ctx.fillStyle = `hsla(${32 + (this.hue % 8)}, 48%, 52%, 0.62)`
      ctx.beginPath()
      ctx.ellipse(0, 0, this.size * 0.42, this.size * 0.12, 0, 0, Math.PI * 2)
      ctx.fill()
    } else {
      ctx.fillStyle = `hsla(${this.hue}, 45%, 42%, 0.75)`
      ctx.beginPath()
      ctx.ellipse(0, 0, this.size, this.size * 0.55, 0, 0, Math.PI * 2)
      ctx.fill()
      // 叶脉高光
      ctx.fillStyle = `hsla(${this.hue}, 40%, 55%, 0.35)`
      ctx.beginPath()
      ctx.ellipse(this.size * 0.15, 0, this.size * 0.55, this.size * 0.24, 0, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.restore()
  }
}

/** 冰雹颗粒 */
export class HailPellet {
  x = 0
  y = 0
  r = 0
  speed = 0
  opacity = 0
  bouncing = false
  bounceProgress = 0
  bounceHeight = 0
  bounceX = 0

  constructor(w: number, h: number) {
    this.reset(w, h, true)
  }

  reset(w: number, h: number, init = false) {
    this.x = Math.random() * w
    this.y = init ? Math.random() * h * 0.5 : -20
    const roll = Math.pow(Math.random(), 2.2)
    this.r = 1.1 + roll * 4.6
    this.speed = 7 + this.r * 2.4 + Math.random() * 6
    this.opacity = 0.5 + Math.random() * 0.4
    this.bouncing = false
    this.bounceProgress = 0
    this.bounceHeight = 5 + this.r * 3.2 + Math.random() * 8
    this.bounceX = 0
  }

  update(w: number, h: number, wind: number, dt: number, bounceStrength = 1) {
    if (this.bouncing) {
      this.bounceProgress += dt * 0.2 * bounceStrength
      if (this.bounceProgress >= 1) {
        this.bouncing = false
        this.reset(w, h)
      }
      return
    }
    this.y += this.speed * dt
    this.x += wind * 1.2 * dt
    if (this.y > h - 30) {
      this.bouncing = true
      this.bounceProgress = 0
      this.bounceX = wind * (2 + Math.random() * 3)
    }
  }

  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    let drawY = this.y
    let drawX = this.x
    if (this.bouncing) {
      const t = this.bounceProgress
      drawY = this.y - Math.sin(t * Math.PI) * this.bounceHeight
      drawX = this.x + this.bounceX * t
      ctx.globalAlpha = this.opacity * (1 - t * 0.6)
      ctx.strokeStyle = `rgba(190, 210, 235, ${this.opacity * (1 - t) * 0.45})`
      ctx.lineWidth = 0.8
      ctx.beginPath()
      ctx.ellipse(this.x, this.y + 4, 3 + t * 7, 1.2 + t * 2, 0, 0, Math.PI * 2)
      ctx.stroke()
    } else {
      ctx.globalAlpha = this.opacity
    }
    // 半透明冰核：蓝灰外缘 + 白芯 + 高光
    ctx.fillStyle = 'rgba(150, 175, 205, 0.5)'
    ctx.beginPath()
    ctx.arc(drawX, drawY, this.r, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(215, 230, 248, 0.8)'
    ctx.beginPath()
    ctx.arc(drawX, drawY, this.r * 0.72, 0, Math.PI * 2)
    ctx.fill()
    ctx.fillStyle = 'rgba(255, 255, 255, 0.95)'
    ctx.beginPath()
    ctx.arc(drawX - this.r * 0.28, drawY - this.r * 0.28, this.r * 0.3, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

export interface WeatherParticles {
  glassDrops: GlassDrop[]
  fastRain: FastRain[]
  snowCrystals: SnowCrystal[]
  leaves: LeafParticle[]
  hail: HailPellet[]
}

export interface ParticleCountConfig {
  glassDrops: number
  fastRain: number
  snowCrystals: number
  leaves: number
  hail: number
}

export function initWeatherParticles(
  w: number,
  h: number,
  counts: Partial<ParticleCountConfig> = {},
): WeatherParticles {
  const c = {
    glassDrops: counts.glassDrops ?? 40,
    fastRain: counts.fastRain ?? 150,
    snowCrystals: counts.snowCrystals ?? 120,
    leaves: counts.leaves ?? 20,
    hail: counts.hail ?? 45,
  }
  return {
    glassDrops: Array.from({ length: c.glassDrops }, () => new GlassDrop(w, h)),
    fastRain: Array.from({ length: c.fastRain }, () => new FastRain(w, h)),
    snowCrystals: Array.from({ length: c.snowCrystals }, () => new SnowCrystal(w, h)),
    leaves: Array.from({ length: c.leaves }, () => new LeafParticle(w, h)),
    hail: Array.from({ length: c.hail }, () => new HailPellet(w, h)),
  }
}

interface DrawWeatherParticlesOpts {
  drawGlass?: boolean
  drawRain?: boolean
  drawSnow?: boolean
  drawLeaves?: boolean
  drawHail?: boolean
  rainIntensity?: number
  scene?: Partial<WeatherEffectSceneParams>
  /** 粒子数量倍率（性能降级时 <1） */
  countScale?: number
}

export function drawWeatherParticles(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  profile: WeatherEffectProfile,
  wind: number,
  rainAngle: number,
  dt: number,
  particles: WeatherParticles,
  opts: DrawWeatherParticlesOpts = {},
) {
  const drawGlass = opts.drawGlass !== false
  const drawRain = opts.drawRain !== false
  const drawSnow = opts.drawSnow !== false
  const drawLeaves = opts.drawLeaves !== false
  const drawHail = opts.drawHail !== false
  const countScale = opts.countScale ?? 1
  const intensity = opts.rainIntensity ?? profilePrecipIntensity(profile)
  const scene = opts.scene || {}

  if (drawGlass && profileHasRain(profile) && intensity > 0.2) {
    const glassMul = scene.glassDrops ?? 1
    const glassScale =
      (profile.kind === 'drizzle' ? 0.4 : profile.kind === 'heavy-rain' ? 1.5 : 1.15) * glassMul
    const glassCount = Math.ceil(particles.glassDrops.length * glassScale * intensity * countScale)
    particles.glassDrops.slice(0, glassCount).forEach((d) => {
      d.update(w, h, wind, dt)
      d.draw(ctx)
    })
  }
  if (drawRain && (profileHasRain(profile) || profile.kind === 'sleet')) {
    const rainMul = profile.kind === 'sleet' ? (scene.rainRatio ?? 0.55) : 1
    const rainScale =
      (profile.kind === 'drizzle' ? 0.55 : profile.kind === 'heavy-rain' ? 1.6 : 1.3) * rainMul
    const rainCount = Math.ceil(
      particles.fastRain.length * rainScale * Math.max(0.35, intensity) * countScale,
    )
    particles.fastRain.slice(0, rainCount).forEach((r) => {
      r.update(w, h, wind, dt, rainLookFromKind(profile.kind))
      r.draw(ctx, rainAngle)
    })
  }
  if (drawSnow && (profileHasSnow(profile) || profile.kind === 'sleet')) {
    const snowMul = profile.kind === 'sleet' ? (scene.snowRatio ?? 0.45) : 1
    const snowScale = 1.45 * snowMul
    const snowCount = Math.ceil(
      particles.snowCrystals.length * snowScale * Math.max(0.35, intensity) * countScale,
    )
    particles.snowCrystals.slice(0, snowCount).forEach((s) => {
      s.update(w, h, wind, dt, profile.temperature)
      s.draw(ctx)
    })
    if (profile.kind === 'sleet' && profile.temperature < 2 && particles.hail.length) {
      const iceCount = Math.ceil(particles.hail.length * 0.28 * countScale)
      particles.hail.slice(0, iceCount).forEach((p) => {
        p.update(w, h, wind, dt, 0.55)
        p.draw(ctx)
      })
    }
  }
  if (drawLeaves && (profile.kind === 'windy' || Math.abs(wind) > 1)) {
    const leafCount = Math.ceil(particles.leaves.length * countScale)
    particles.leaves.slice(0, leafCount).forEach((l) => {
      l.update(w, h, wind, dt)
      l.draw(ctx, wind)
    })
  }
  if (drawHail && profileHasHail(profile)) {
    const hailMul = scene.hailDensity ?? 1
    const bounce = scene.hailBounce ?? 1
    const hailCount = Math.ceil(particles.hail.length * hailMul * countScale)
    particles.hail.slice(0, hailCount).forEach((p) => {
      p.update(w, h, wind, dt, bounce)
      p.draw(ctx)
    })
    // 冰雹常伴降雨：补一层稀疏雨丝增强真实感
    if (particles.fastRain.length) {
      const rainCount = Math.ceil(particles.fastRain.length * 0.32 * countScale)
      particles.fastRain.slice(0, rainCount).forEach((r) => {
        r.update(w, h, wind, dt, rainLookFromKind(profile.kind))
        const saved = r.opacity
        r.opacity = Math.min(0.2, saved * 0.45)
        r.draw(ctx)
        r.opacity = saved
      })
    }
  }
}
