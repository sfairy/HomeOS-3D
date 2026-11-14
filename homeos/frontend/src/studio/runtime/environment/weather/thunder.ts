import { WEATHER_FLASH_SECONDS, weatherFlashEnvelope, weatherFlashVisible } from '@/studio/platform/weather-flash'

import { WEATHER_COLOR } from './colors'
import type { WeatherFrame } from './frame'

/** 首次放电前等一会儿，避免刚切到雷雨就立刻闪。 */
const FIRST_DELAY_MIN = 1.2
const FIRST_DELAY_MAX = 2.4
/** 雷暴簇内部的连续放电间隔：真实的雷雨是「一阵一阵」地闪，不是匀速节拍器。 */
const BURST_GAP_MIN = 0.16
const BURST_GAP_MAX = 0.46
/** 一阵放电结束后的安静期（秒）。 */
const QUIET_GAP_MIN = 3.6
const QUIET_GAP_MAX = 8.4
/** 每阵包含的放电次数。 */
const BURST_STRIKES_MIN = 2
const BURST_STRIKES_MAX = 4
/** 单次放电的强度范围：同一阵里也要有强有弱（下限抬高，避免暗弱的闪电像掉帧）。 */
const STRIKE_GAIN_MIN = 0.72
const STRIKE_GAIN_MAX = 1

/** 地面落点辉光半径（占画面短边比例）。 */
const GROUND_GLOW_RADIUS = 0.055

const RANDOM = (from: number, to: number) => from + Math.random() * (to - from)
const RANDOM_INT = (from: number, to: number) => Math.floor(RANDOM(from, to + 1))

/** 中点位移法：反复在两端点之间插一个偏移中点，得到自然的锯齿。 */
function subdivide(from: number[], to: number[], spread: number, depth: number): number[][] {
  if (!depth) return [from, to]
  const mid = [
    (from[0] + to[0]) / 2 + RANDOM(-spread, spread),
    (from[1] + to[1]) / 2 + RANDOM(-spread * 0.2, spread * 0.2),
  ]
  return [
    ...subdivide(from, mid, spread * 0.48, depth - 1).slice(0, -1),
    ...subdivide(mid, to, spread * 0.48, depth - 1),
  ]
}

type BoltSet = {
  /** 主干 + 支叉；第一项是主干。 */
  bolts: number[][][]
  /** 主干落点（归一化屏幕坐标），地面辉光画在这里。 */
  terminus: readonly [number, number]
  /** 云底起点（闪电从这一带钻进云里，云底辉光画在这里）。 */
  origin: readonly [number, number]
}

/** 一条主干 + 从主干五个点分出的支叉。 */
function buildBolts(): BoltSet {
  const originX = RANDOM(0.16, 0.74)
  const originY = -0.04
  // 落点与起点横向错开：全竖直的闪电看起来像一根电线。
  const endX = Math.min(0.94, Math.max(0.06, originX + RANDOM(-0.16, 0.18)))
  const endY = RANDOM(0.44, 0.6)
  const trunk = subdivide([originX, originY], [endX, endY], 0.05, 5)
  const trunkLength = trunk.length
  const forkIndexes = [7, 14, 21, 28, 34].filter((index) => index < trunkLength - 2)
  const branches = forkIndexes.map((index) => {
    const fork = trunk[index]
    // 支叉向下、向外分叉；越靠下的支叉越长。
    const branchLength = RANDOM(0.05, 0.13) * (0.7 + index / Math.max(1, trunkLength))
    return subdivide(fork, [fork[0] + RANDOM(-0.1, 0.1), fork[1] + branchLength], 0.016, 3)
  })
  return {
    bolts: [trunk, ...branches],
    terminus: [endX, endY],
    origin: [originX, originY],
  }
}

/**
 * 多层描边代替 `ctx.shadowBlur`。
 *
 * `shadowBlur` 每帧都要重新算一遍高斯模糊，墙面平板上一次放电就是几十毫秒的抖动；
 * 三层同心描边（宽而淡 → 中 → 细而亮）在观感上几乎一样，代价只是一次普通 stroke。
 */
function strokeBolt(frame: WeatherFrame, bolt: number[][], lineWidth: number, alpha: number) {
  frame.ctx.globalAlpha = alpha
  frame.ctx.lineWidth = lineWidth
  frame.ctx.beginPath()
  bolt.forEach(([x, y], pointIndex) =>
    pointIndex
      ? frame.ctx.lineTo(x * frame.width, y * frame.height)
      : frame.ctx.moveTo(x * frame.width, y * frame.height),
  )
  frame.ctx.stroke()
}

function drawBolts(frame: WeatherFrame, bolts: number[][][], intensity: number) {
  // 外晕 → 中层 → 内芯；主干比支叉粗一档。
  //
  // 内芯亮度单独抬一档：闪电的通道在物理上几乎瞬间爆到过曝，而 `intensity` 在
  // 30fps 的采样里往往只落在 0.4~0.6（峰值帧被跳过）。直接按 intensity 画出来
  // 是一条灰线，像画面划痕。外晕与中层仍按 intensity 走，所以「弱闪电」依然更暗。
  const coreAlpha = Math.min(1, intensity * 1.9)
  const passes = [
    { widthScale: 6.5, alpha: 0.14 * intensity },
    { widthScale: 3, alpha: 0.42 * intensity },
    { widthScale: 1.5, alpha: coreAlpha },
  ] as const
  for (const pass of passes)
    bolts.forEach((bolt, boltIndex) =>
      strokeBolt(
        frame,
        bolt,
        (boltIndex === 0 ? 1.5 : 0.62) * pass.widthScale,
        Math.min(1, pass.alpha * (boltIndex === 0 ? 1 : 0.75)),
      ),
    )
}

/** 落点辉光：一道闪电「打到地上」，地面必须亮一下，否则闪电像悬在半空。 */
function drawGroundGlow(frame: WeatherFrame, set: BoltSet, intensity: number) {
  const sprite = frame.sprites.glowSprite(WEATHER_RGB_GLOW)
  if (!sprite) return
  const { ctx, width, height } = frame
  const radius = Math.min(width, height) * GROUND_GLOW_RADIUS * (0.8 + intensity * 0.5)
  const x = set.terminus[0] * width
  const y = set.terminus[1] * height
  ctx.save()
  ctx.globalAlpha = Math.min(1, intensity * 0.72)
  // 竖向压扁：这是地面上的反光，不是空中的光球。
  ctx.drawImage(sprite, x - radius, y - radius * 0.42, radius * 2, radius * 0.84)
  ctx.restore()
}

/**
 * 云底辉光：闪电的源头在云里，云底要有被照亮的一块。
 *
 * 只画一小片局部渐变，不是整屏提亮 —— 天气层不允许整屏上色。
 */
function drawCloudGlow(frame: WeatherFrame, set: BoltSet, intensity: number) {
  const sprite = frame.sprites.glowSprite(WEATHER_RGB_GLOW)
  if (!sprite) return
  const { ctx, width, height } = frame
  const radius = width * 0.16 * (0.7 + intensity * 0.6)
  const x = set.origin[0] * width
  const y = Math.max(0, set.origin[1] * height) + height * 0.02
  ctx.save()
  ctx.globalAlpha = intensity * 0.34
  ctx.drawImage(sprite, x - radius / 2, y - radius / 4, radius, radius / 2)
  ctx.restore()
}

const WEATHER_RGB_GLOW = '255,246,221'

export type ThunderRendererOptions = {
  /** 每次放电开始时回调（0~1 强度）。宿主据此让 3D 舞台同步闪一次。 */
  onStrike?: (intensity: number) => void
}

export function createThunderRenderer(options: ThunderRendererOptions = {}) {
  let gapSeconds = RANDOM(FIRST_DELAY_MIN, FIRST_DELAY_MAX)
  let remainingSeconds = 0
  let intensity = 0
  /** 本次放电的强度系数，与包络相乘。 */
  let strikeGain = 1
  /** 当前这阵雷暴还剩几次放电。 */
  let strikesLeft = 0
  let boltSet: BoltSet | null = null

  function reset() {
    gapSeconds = RANDOM(FIRST_DELAY_MIN, FIRST_DELAY_MAX)
    remainingSeconds = 0
    intensity = 0
    strikeGain = 1
    strikesLeft = 0
    boltSet = null
  }

  /** 开始一次新的放电，并决定下一次间隔属于「阵内」还是「安静期」。 */
  function strike() {
    boltSet = buildBolts()
    remainingSeconds = WEATHER_FLASH_SECONDS
    strikeGain = RANDOM(STRIKE_GAIN_MIN, STRIKE_GAIN_MAX)
    if (strikesLeft <= 0) strikesLeft = RANDOM_INT(BURST_STRIKES_MIN, BURST_STRIKES_MAX)
    strikesLeft -= 1
    gapSeconds = strikesLeft > 0 ? RANDOM(BURST_GAP_MIN, BURST_GAP_MAX) : RANDOM(QUIET_GAP_MIN, QUIET_GAP_MAX)
    options.onStrike?.(strikeGain)
  }

  return {
    /**
     * 每帧**绘制前**调用，返回当前闪光强度（0~1）。
     * 强度要供湿地反光与全屏调色共用，所以不能等画的时候才算。
     */
    advance(frame: WeatherFrame, enabled: boolean) {
      if (!enabled) {
        remainingSeconds = 0
        intensity = 0
        return 0
      }
      gapSeconds -= frame.deltaSeconds
      if (gapSeconds <= 0) strike()
      remainingSeconds = Math.max(0, remainingSeconds - frame.deltaSeconds)
      intensity = remainingSeconds > 0 ? weatherFlashEnvelope(WEATHER_FLASH_SECONDS - remainingSeconds, strikeGain) : 0
      return intensity
    },
    draw(frame: WeatherFrame) {
      if (!weatherFlashVisible(intensity) || !boltSet) return
      frame.ctx.save()
      frame.ctx.strokeStyle = WEATHER_COLOR
      frame.ctx.lineJoin = 'round'
      frame.ctx.lineCap = 'round'
      drawCloudGlow(frame, boltSet, intensity)
      drawBolts(frame, boltSet.bolts, intensity)
      drawGroundGlow(frame, boltSet, intensity)
      frame.ctx.restore()
      frame.ctx.globalAlpha = 1
    },
    reset,
  }
}

export type ThunderRenderer = ReturnType<typeof createThunderRenderer>
