/**
 * 天气背景星空 / 云 / 闪电 / 流星粒子与场景管理
 *
 * 职责：
 * - 定义星星、云朵、闪电、流星等粒子类与初始化工厂。
 * - 提供粒子场景的统一初始化、更新与绘制入口，供天气背景画布调用。
 *
 * 依赖：
 * - @/utils/weather/particle-classes 的降水粒子初始化。
 * - @/utils/weather/effect-presets.util 的已解析效果配置。
 * - @/utils/weather/effect-condition.util 的效果判定。
 * - @/types/weather-canvas 的云 / 闪电 / 流星轨迹类型。
 *
 * 注意：
 * - 粒子坐标 / 速度 / 相位为运行时数值状态，不翻译。
 * - 类名（Star / CloudPuff / ...）为内部标识符，不翻译。
 */
import { initWeatherParticles } from '@/utils/weather/particle-classes'
import type { ResolvedWeatherEffectConfig } from '@/utils/weather/effect-presets.util'
import type { WeatherEffectProfile } from '@/utils/weather/effect-condition.util'
import type {
  CloudPuff,
  LightningPoint,
  ShootingStarTrailPoint,
} from '@/types/weather-canvas'

/** 星星粒子（夜间星空）：大小、底亮、闪烁幅度各自独立 */
export class Star {
  x: number
  y: number
  size: number
  baseBrightness: number
  brightness: number
  twinkleSpeed: number
  twinkleAmp: number
  twinkleFloor: number
  twinklePeak: number
  phase: number
  twinkleMode: number
  isBlue: boolean
  hasRays: boolean
  rayLen: number
  rayAngle: number
  glowSize: number
  glowOpacity: number

  constructor(w: number, h: number) {
    this.x = Math.random() * w
    this.y = Math.random() * h
    const roll = Math.random()
    // 三类星：细碎背景 / 中等主星 / 少数大亮星，闪烁幅度彼此拉开
    if (roll < 0.58) {
      this.size = 0.45 + Math.random() * 0.7
      this.baseBrightness = 0.18 + Math.random() * 0.28
      this.twinkleAmp = 0.4 + Math.random() * 0.5
      this.twinkleFloor = 0.12 + Math.random() * 0.22
      this.twinklePeak = 0.95 + Math.random() * 0.35
      this.twinkleSpeed = 0.04 + Math.random() * 0.12
      this.hasRays = false
    } else if (roll < 0.88) {
      this.size = 0.95 + Math.random() * 1.35
      this.baseBrightness = 0.4 + Math.random() * 0.38
      this.twinkleAmp = 0.38 + Math.random() * 0.52
      this.twinkleFloor = 0.22 + Math.random() * 0.22
      this.twinklePeak = 1.1 + Math.random() * 0.4
      this.twinkleSpeed = 0.03 + Math.random() * 0.1
      this.hasRays = Math.random() > 0.78
    } else {
      this.size = 2.0 + Math.random() * 2.4
      this.baseBrightness = 0.72 + Math.random() * 0.28
      this.twinkleAmp = 0.5 + Math.random() * 0.5
      this.twinkleFloor = 0.38 + Math.random() * 0.2
      this.twinklePeak = 1.2 + Math.random() * 0.5
      this.twinkleSpeed = 0.022 + Math.random() * 0.08
      this.hasRays = Math.random() > 0.35
    }
    this.brightness = this.baseBrightness
    this.phase = Math.random() * Math.PI * 2
    this.twinkleMode = Math.floor(Math.random() * 4)
    this.isBlue = Math.random() > 0.62
    this.rayLen = this.size * (1.8 + Math.random() * 3.2)
    this.rayAngle = Math.random() * Math.PI
    this.glowSize = 3 + Math.floor(Math.random() * 6)
    this.glowOpacity = 0.25 + Math.random() * 0.55
  }
  update(dt: number) {
    this.phase += this.twinkleSpeed * dt
    let wave: number
    switch (this.twinkleMode) {
      case 0:
        wave = Math.abs(Math.sin(this.phase))
        break
      case 1:
        wave = 0.5 + 0.5 * Math.sin(this.phase)
        break
      case 2:
        wave = Math.abs(Math.sin(this.phase * 2.3 + Math.cos(this.phase * 1.4) * 1.1))
        break
      default:
        wave = 0.5 + 0.5 * Math.cos(this.phase) * (0.55 + 0.45 * Math.sin(this.phase * 0.7))
        break
    }
    wave = Math.min(1, Math.max(0, wave))
    const lo = this.twinkleFloor
    const hi = this.twinklePeak
    const span = (hi - lo) * (0.35 + this.twinkleAmp)
    this.brightness = this.baseBrightness * (lo + span * wave)
    if (this.hasRays) this.rayAngle += 0.002 * dt
  }
  draw(ctx: CanvasRenderingContext2D) {
    ctx.save()
    const hue = this.isBlue ? 220 : 50
    const sat = this.isBlue ? 50 : 30
    const lum = this.isBlue ? 85 : 88
    const alpha = Math.max(0, this.brightness) * ctx.globalAlpha
    if (this.hasRays && this.size > 1.4 && alpha > 0.5) {
      ctx.globalAlpha = Math.min(1, (alpha - 0.45) * 1.1)
      ctx.strokeStyle = `hsla(${hue}, 35%, 88%, ${alpha * 0.32})`
      ctx.lineWidth = Math.max(0.4, this.size * 0.12)
      ctx.lineCap = 'round'
      ctx.beginPath()
      ctx.moveTo(
        this.x - Math.cos(this.rayAngle) * this.rayLen,
        this.y - Math.sin(this.rayAngle) * this.rayLen,
      )
      ctx.lineTo(
        this.x + Math.cos(this.rayAngle) * this.rayLen,
        this.y + Math.sin(this.rayAngle) * this.rayLen,
      )
      ctx.stroke()
    }
    ctx.globalAlpha = Math.min(1, alpha)
    if (this.size > 1.6 && alpha > 0.48) {
      ctx.shadowBlur = Math.min(6, this.glowSize * 0.7)
      ctx.shadowColor = `hsla(${hue}, ${sat}%, ${lum}%, ${alpha * this.glowOpacity * 0.55})`
    }
    ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${Math.min(1, alpha)})`
    ctx.beginPath()
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2)
    ctx.fill()
    ctx.restore()
  }
}

/** 流星粒子 */
export class ShootingStar {
  x: number
  y: number
  length: number
  speed: number
  alpha: number
  trail: ShootingStarTrailPoint[]
  maxTrail: number

  constructor(w: number, h: number) {
    this.x = Math.random() * w * 0.7
    this.y = Math.random() * h * 0.25
    this.length = 55 + Math.random() * 70
    this.speed = 12 + Math.random() * 8
    this.alpha = 1
    this.trail = []
    this.maxTrail = 14
  }
  update(dt: number) {
    this.trail.unshift({ x: this.x, y: this.y })
    if (this.trail.length > this.maxTrail) this.trail.pop()
    this.x += this.speed * dt
    this.y += this.speed * 0.55 * dt
    this.alpha -= 0.02 * dt
    return this.alpha <= 0
  }
  draw(ctx: CanvasRenderingContext2D) {
    for (let i = this.trail.length - 1; i > 0; i--) {
      const t = this.trail[i]
      const prev = this.trail[i - 1]
      const progress = i / this.trail.length
      ctx.beginPath()
      ctx.strokeStyle = `rgba(255, 255, 255, ${progress * this.alpha * 0.5})`
      ctx.lineWidth = progress * 2
      ctx.moveTo(prev.x, prev.y)
      ctx.lineTo(t.x, t.y)
      ctx.stroke()
    }
    const grad = ctx.createLinearGradient(
      this.x,
      this.y,
      this.x + this.length,
      this.y - this.length * 0.4,
    )
    grad.addColorStop(0, `rgba(255, 255, 255, ${this.alpha})`)
    grad.addColorStop(0.3, `rgba(200, 220, 255, ${this.alpha * 0.6})`)
    grad.addColorStop(1, 'rgba(200, 220, 255, 0)')
    ctx.beginPath()
    ctx.strokeStyle = grad
    ctx.lineWidth = 2
    ctx.moveTo(this.x, this.y)
    ctx.lineTo(this.x + this.length, this.y - this.length * 0.4)
    ctx.stroke()
    ctx.beginPath()
    ctx.arc(this.x, this.y, 2.5, 0, Math.PI * 2)
    ctx.fillStyle = `rgba(255, 255, 255, ${this.alpha})`
    ctx.fill()
  }
}

/** 云貌：积云 / 层云 / 雨层云 / 柔雪云 */
type CloudLook = 'cumulus' | 'stratus' | 'nimbus' | 'soft'

/** 云朵粒子（多层视差，左进右出连续漂移） */
export class Cloud {
  layer: number
  w: number
  h: number
  x: number
  y: number
  width: number
  height: number
  speed: number
  opacity: number
  puffs: CloudPuff[]
  phaseOffset: number
  index: number
  look: CloudLook
  /** 预渲染 sprite（白昼 / 雷暴 / 夜云），避免每帧重建径向渐变 */
  _sprite: HTMLCanvasElement | null = null
  _spriteStorm: HTMLCanvasElement | null = null
  _spriteNight: HTMLCanvasElement | null = null
  _spriteW = 0
  _spriteH = 0

  constructor(
    w: number,
    h: number,
    layer: number = 1,
    index: number = 0,
    look: CloudLook = 'cumulus',
  ) {
    this.layer = layer
    this.index = index
    this.look = look
    this.phaseOffset = index * 1.7 + layer * 0.9
    this.w = w
    this.h = h
    this.width = 0
    this.height = 0
    this.speed = 0
    this.opacity = 0
    this.puffs = []
    this.x = 0
    this.y = 0
    this.regenerateShape()
    this.placeOnTrack(this.initialTrackPhase())
  }

  /** 构建云朵离屏 sprite：按貌态与昼夜配色，阴影只画在 puff 上避免矩形蒙版 */
  private buildSprite(mode: 'day' | 'storm' | 'night'): HTMLCanvasElement | null {
    if (typeof document === 'undefined') return null
    const spriteW = Math.max(8, Math.round(this.width * 1.2))
    const spriteH = Math.max(8, Math.round(this.height * 2))
    const canvas = document.createElement('canvas')
    canvas.width = spriteW
    canvas.height = spriteH
    const sctx = canvas.getContext('2d')
    if (!sctx) return null

    // 按天气貌态取色：积云亮白、层云灰、雨云深蓝灰、夜云冷灰
    let core: [number, number, number]
    let mid: [number, number, number]
    let edge: [number, number, number]
    let shade: [number, number, number]
    if (mode === 'storm' || this.look === 'nimbus') {
      core = [232, 236, 248]
      mid = [168, 178, 200]
      edge = [98, 110, 140]
      shade = [42, 52, 78]
    } else if (mode === 'night') {
      core = [168, 178, 210]
      mid = [110, 122, 158]
      edge = [62, 72, 108]
      shade = [28, 34, 58]
    } else if (this.look === 'soft') {
      core = [255, 255, 255]
      mid = [236, 242, 252]
      edge = [210, 222, 240]
      shade = [150, 168, 198]
    } else if (this.look === 'stratus') {
      core = [248, 250, 255]
      mid = [210, 218, 232]
      edge = [168, 180, 202]
      shade = [110, 124, 150]
    } else {
      core = [255, 255, 255]
      mid = [242, 248, 255]
      edge = [210, 224, 242]
      shade = [120, 140, 172]
    }

    const offsetX = this.width * 0.6
    const offsetY = this.height
    for (let i = 0; i < this.puffs.length; i++) {
      const p = this.puffs[i]
      const px = offsetX + (p.x - this.width * 0.5)
      const py = offsetY + p.y
      const r = p.r
      const highlight =
        mode === 'storm' || this.look === 'nimbus' ? p.highlight * 0.78 : p.highlight
      // 主体：顶部受光
      const grad = sctx.createRadialGradient(px + r * 0.12, py - r * 0.32, 0, px, py, r)
      grad.addColorStop(0, `rgba(${core[0]}, ${core[1]}, ${core[2]}, ${highlight})`)
      grad.addColorStop(0.4, `rgba(${mid[0]}, ${mid[1]}, ${mid[2]}, ${highlight * 0.72})`)
      grad.addColorStop(0.78, `rgba(${edge[0]}, ${edge[1]}, ${edge[2]}, ${highlight * 0.28})`)
      grad.addColorStop(1, `rgba(${edge[0]}, ${edge[1]}, ${edge[2]}, 0)`)
      sctx.fillStyle = grad
      sctx.beginPath()
      sctx.arc(px, py, r, 0, Math.PI * 2)
      sctx.fill()
      // 体积感：只在 puff 底部加深，不铺矩形
      const under = sctx.createRadialGradient(px, py + r * 0.28, 0, px, py + r * 0.1, r * 0.95)
      const underA =
        mode === 'storm' || this.look === 'nimbus' ? 0.28 : mode === 'night' ? 0.22 : 0.14
      under.addColorStop(0, `rgba(${shade[0]}, ${shade[1]}, ${shade[2]}, ${underA})`)
      under.addColorStop(1, `rgba(${shade[0]}, ${shade[1]}, ${shade[2]}, 0)`)
      sctx.fillStyle = under
      sctx.beginPath()
      sctx.arc(px, py, r, 0, Math.PI * 2)
      sctx.fill()
    }
    return canvas
  }

  /** 仅首次构造时随机形状；貌态决定扁平度与体积 */
  regenerateShape() {
    const look = this.look
    const wide =
      look === 'stratus' || look === 'nimbus'
        ? 620 + Math.random() * 720
        : look === 'soft'
          ? 480 + Math.random() * 520
          : 420 + Math.random() * 480
    const tall =
      look === 'cumulus'
        ? 130 + Math.random() * 150
        : look === 'nimbus'
          ? 90 + Math.random() * 140
          : look === 'soft'
            ? 110 + Math.random() * 120
            : 70 + Math.random() * 90
    this.width = wide * (1 + this.layer * 0.22)
    this.height = tall * (1 + this.layer * 0.16)
    this.speed = (0.35 + Math.random() * 0.5) * (0.7 + this.layer * 0.28)
    // 积云更实、层云略淡、雨云偏沉
    const baseOp =
      look === 'cumulus' ? 0.34 : look === 'soft' ? 0.3 : look === 'nimbus' ? 0.36 : 0.26
    this.opacity = baseOp + Math.random() * 0.1 + this.layer * 0.04
    this.puffs = []
    const puffCount =
      look === 'cumulus' ? 6 + Math.floor(Math.random() * 5) : 4 + Math.floor(Math.random() * 5)
    for (let i = 0; i < puffCount; i++) {
      // 积云：上部鼓起；层云/雨云：更扁、底边更齐
      const yBias = look === 'cumulus' || look === 'soft' ? -0.15 : 0.08
      this.puffs.push({
        x: Math.random() * this.width * 0.78,
        y: (Math.random() - 0.5 + yBias) * this.height * (look === 'cumulus' ? 0.55 : 0.35),
        r: (0.45 + Math.random() * 0.5) * this.height * (look === 'cumulus' ? 0.5 : 0.42),
        highlight: 0.62 + (i % 4) * 0.05,
      })
    }
    const smallCount = look === 'cumulus' ? 7 + Math.floor(Math.random() * 6) : 4 + Math.floor(Math.random() * 5)
    for (let i = 0; i < smallCount; i++) {
      this.puffs.push({
        x: Math.random() * this.width * 0.85,
        y: (Math.random() - 0.45) * this.height * 0.28,
        r: (0.12 + Math.random() * 0.22) * this.height * 0.42,
        highlight: 0.48 + (i % 3) * 0.05,
      })
    }
    this.puffs.sort((a: CloudPuff, b: CloudPuff) => b.r - a.r)
    this._spriteW = Math.max(8, Math.round(this.width * 1.2))
    this._spriteH = Math.max(8, Math.round(this.height * 2))
    this._sprite = null
    this._spriteStorm = null
    this._spriteNight = null
  }

  initialTrackPhase() {
    const slots = 8
    return ((this.index + this.layer * 0.2) % slots) / slots
  }

  placeOnTrack(phase: number) {
    const trackLen = this.w + this.width + 120
    this.x = -this.width - 64 + phase * trackLen
    // 积云略高、层云/雨云偏低更贴天际
    const baseY =
      this.look === 'cumulus'
        ? 0.04
        : this.look === 'soft'
          ? 0.06
          : this.look === 'nimbus'
            ? this.layer >= 3
              ? 0.0
              : 0.015
            : 0.02
    const layerSpread = this.look === 'stratus' || this.look === 'nimbus' ? 0.055 : 0.1
    this.y = this.h * (baseY + this.layer * layerSpread) + (this.index % 4) * this.h * 0.028
  }

  recycle() {
    this.x = -this.width - 64 - Math.random() * 48
    const baseY =
      this.look === 'cumulus' ? 0.04 : this.look === 'soft' ? 0.06 : this.look === 'nimbus' ? 0.01 : 0.02
    const layerSpread = this.look === 'stratus' || this.look === 'nimbus' ? 0.055 : 0.1
    this.y = this.h * (baseY + this.layer * layerSpread) + Math.random() * this.h * 0.08
  }

  updateDimensions(w: number, h: number) {
    if (this.w > 0) this.x = (this.x / this.w) * w
    this.w = w
    this.h = h
  }

  update(dt: number, wind: number) {
    const drift = this.speed + Math.max(0, wind) * 1.05
    this.x += drift * dt
    if (this.x > this.w + 56) this.recycle()
  }

  draw(
    ctx: CanvasRenderingContext2D,
    timeMs: number = 0,
    storm = false,
    alphaMul = 1,
    night = false,
  ): void {
    const breatheY = Math.sin(timeMs * 0.00007 + this.phaseOffset) * 0.9
    const mode: 'day' | 'storm' | 'night' = storm || this.look === 'nimbus' ? 'storm' : night ? 'night' : 'day'
    let sprite =
      mode === 'storm' ? this._spriteStorm : mode === 'night' ? this._spriteNight : this._sprite
    if (!sprite) {
      sprite = this.buildSprite(mode)
      if (mode === 'storm') this._spriteStorm = sprite
      else if (mode === 'night') this._spriteNight = sprite
      else this._sprite = sprite
      if (!sprite) return
    }
    ctx.save()
    const nightDim = night && mode !== 'storm' ? 0.82 : 1
    ctx.globalAlpha = (storm || this.look === 'nimbus' ? this.opacity * 1.2 : this.opacity) * alphaMul * nightDim
    ctx.drawImage(
      sprite,
      this.x + this.width * 0.5 - this._spriteW / 2,
      this.y + breatheY - this._spriteH / 2,
      this._spriteW,
      this._spriteH,
    )
    ctx.restore()
  }
}

/** 闪电路径生成 */
export class Lightning {
  w: number
  h: number
  points: LightningPoint[]
  branches: LightningPoint[][]

  constructor(w: number, h: number) {
    this.w = w
    this.h = h
    this.points = []
    this.branches = []
    this.generate()
  }
  generate() {
    this.points = []
    this.branches = []
    const startX = this.w * 0.18 + Math.random() * this.w * 0.64
    const endX = startX + (Math.random() - 0.45) * this.w * 0.22
    const endY = this.h * (0.42 + Math.random() * 0.38)
    const segs = 12 + Math.floor(Math.random() * 8)
    const raw: LightningPoint[] = [{ x: startX, y: 0 }]
    for (let i = 1; i <= segs; i++) {
      const t = i / segs
      raw.push({
        x: startX + (endX - startX) * t,
        y: endY * t,
      })
    }
    const displaced = this.midpointDisplace(raw, this.w * 0.045, 3)
    this.points = displaced
    displaced.forEach((p, i) => {
      if (i < 2 || i > displaced.length - 3) return
      if (Math.random() > 0.32) return
      const bLen = 3 + Math.floor(Math.random() * 4)
      const branch: LightningPoint[] = [{ x: p.x, y: p.y }]
      let bx = p.x
      let by = p.y
      const dir = Math.random() > 0.5 ? 1 : -1
      for (let j = 0; j < bLen; j++) {
        bx += dir * (8 + Math.random() * 28)
        by += 14 + Math.random() * 26
        branch.push({ x: bx, y: by })
      }
      this.branches.push(branch)
    })
  }

  private midpointDisplace(pts: LightningPoint[], amp: number, depth: number): LightningPoint[] {
    if (depth <= 0) return pts
    const next: LightningPoint[] = []
    for (let i = 0; i < pts.length - 1; i++) {
      const a = pts[i]
      const b = pts[i + 1]
      next.push(a)
      next.push({
        x: (a.x + b.x) * 0.5 + (Math.random() - 0.5) * amp * 2,
        y: (a.y + b.y) * 0.5 + (Math.random() - 0.5) * amp * 0.35,
      })
    }
    next.push(pts[pts.length - 1])
    return this.midpointDisplace(next, amp * 0.52, depth - 1)
  }
}

/** 初始化天气场景粒子（星星、云、雨雪等） */
export function createWeatherSceneParticles(
  w: number,
  h: number,
  effectConfig?: ResolvedWeatherEffectConfig,
  profile?: WeatherEffectProfile,
) {
  const counts = effectConfig?.particleCounts
  const weatherParticles = initWeatherParticles(w, h, counts)
  const night = profile?.isNight ?? true
  // 阴天/雾夜星光更少；局部多云仍可见部分星
  const kind = profile?.kind
  const cloudCover = profile?.cloudCover ?? 0.3
  let starCount = 0
  if (night) {
    const base = effectConfig?.starCount ?? 110
    if (kind === 'clear-night' || kind === 'clear-day') starCount = base
    else if (kind === 'partly-cloudy' || kind === 'windy')
      starCount = Math.round(base * (0.55 - cloudCover * 0.2))
    else if (kind === 'cloudy') starCount = Math.round(base * 0.18)
    else starCount = 0
  }
  const drawClouds = !kind || (kind !== 'clear-day' && kind !== 'clear-night')
  let cloudCount = drawClouds ? (effectConfig?.cloudLayers ?? 6) : 0
  let look: CloudLook = 'stratus'
  if (kind === 'partly-cloudy') {
    cloudCount = Math.max(3, Math.round(cloudCount * 0.5))
    look = 'cumulus'
  } else if (kind === 'cloudy' || kind === 'windy' || kind === 'drizzle') {
    look = 'stratus'
  } else if (
    kind === 'thunderstorm' ||
    kind === 'heavy-rain' ||
    kind === 'hail' ||
    kind === 'rain'
  ) {
    look = 'nimbus'
    cloudCount = Math.max(4, Math.round(cloudCount * 0.9))
  } else if (kind === 'snow' || kind === 'sleet') {
    look = 'soft'
  } else if (kind === 'sandstorm') {
    cloudCount = Math.max(2, Math.round(cloudCount * 0.35))
    look = 'stratus'
  }
  const clouds: Cloud[] = []
  for (let i = 0; i < cloudCount; i++) {
    const layer = 1 + Math.floor((i * 3) / Math.max(1, cloudCount))
    const cloudLayer = look === 'cumulus' ? Math.min(3, layer + (i % 2)) : layer
    clouds.push(new Cloud(w, h, cloudLayer, i, look))
  }
  return {
    ...weatherParticles,
    stars: Array.from({ length: starCount }, () => new Star(w, h)),
    shootingStars: [] as ShootingStar[],
    clouds,
  }
}
