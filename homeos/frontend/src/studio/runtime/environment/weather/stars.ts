/**
 * 星：晴夜里一片**会闪的星星**（含偶尔划过的流星）。
 *
 * 为什么只有星星、没有夜空渐变：天气层是盖在 3D 舞台上的透明画布，任何整屏
 * 渐变都会把户型压暗、把设备图标糊掉。所以「夜」不靠给背景染色——画面里只多出
 * 星点、星芒与流星这些**具体物体**，不多出任何遮盖层。
 *
 * 观感由四层叠出来（缺一层就会像「屏幕上的白点」）：
 * 1. 每颗星独立的双频慢闪：两个不可通约的频率叠加，整片星空不会同步呼吸；
 * 2. 最亮的一档额外带柔光晕，闪烁时一起明灭，真的有「眨眼」的感觉；
 * 3. 最亮的一档再压一道十字星芒，星点才像星星而不是像素点；
 * 4. 色温与地平线消光：真实星空有冷白与暖黄之分，靠近地平线的星会被大气吃暗。
 */

import type { WeatherFrame } from './frame'
import { STAR_FIELD_HEIGHT } from './particles'

const TAU = Math.PI * 2

/** 星点颜色：两种色温交替，避免整片星空是同一个白。 */
const STAR_RGB_WARM = '255,240,206'
const STAR_RGB_NEUTRAL = '255,250,232'
const STAR_RGB_COOL = '208,226,255'
/** 只有最亮的一档才画星芒，否则整片天空会变成「星星贴纸」。 */
const SPARKLE_SIZE_THRESHOLD = 2
/** 单颗星星点的不透明度上限。 */
const STAR_MAX_ALPHA = 0.95
/** 闪烁的最低亮度：压到 0 会让星星「熄掉」，看起来像掉帧。 */
const STAR_MIN_GLOW = 0.08
/** 地平线消光的起始高度（占星空区域的比例）：底部这一段的星会被吃掉。 */
const HORIZON_FADE_START = 0.62

/** 流星：首次出现前的等待区间、间隔与飞行时长。 */
const METEOR_FIRST_DELAY = { min: 6, max: 11 }
const METEOR_GAP = { min: 8, max: 14 }
const METEOR_LIFE = 0.95

const RANDOM = (from: number, to: number) => from + Math.random() * (to - from)

type MeteorState = {
  /** 已飞行时长；≥ `METEOR_LIFE` 表示当前没有流星。 */
  age: number
  x: number
  y: number
  tilt: number
  nextIn: number
}

/**
 * 闪烁包络：两个不可通约的频率叠一层慢呼吸，避免所有星「一起呼吸」。
 * 返回值 0~1，`seed` 让每颗星相位错开。
 */
function twinkle(elapsedSeconds: number, seed: number) {
  const fast = Math.sin(elapsedSeconds * 2.1 + seed * 3.1)
  const slow = Math.sin(elapsedSeconds * 0.7 + seed)
  return 0.5 + 0.32 * fast + 0.18 * slow
}

/** 星点色温：按 seed 分三档，暖黄 / 中性 / 冷蓝，比例接近真实星空的分布。 */
function starColor(seed: number) {
  const pick = seed % 1
  if (pick < 0.18) return STAR_RGB_COOL
  if (pick > 0.72) return STAR_RGB_WARM
  return STAR_RGB_NEUTRAL
}

/**
 * 地平线消光：越靠近星空区域的下缘越暗。
 *
 * 真实星空在地平线附近会被大气层吃掉大半，星星「一直亮到画面中间」是
 * 一眼假的来源之一；这里按屏幕纵向位置做一条平滑衰减带。
 */
function horizonExtinction(y: number, height: number) {
  const fieldBottom = height * STAR_FIELD_HEIGHT
  if (fieldBottom <= 0) return 1
  const ratio = y / fieldBottom
  if (ratio <= HORIZON_FADE_START) return 1
  const fade = (ratio - HORIZON_FADE_START) / (1 - HORIZON_FADE_START)
  return Math.max(0.08, 1 - fade * fade)
}

/** 十字星芒：横竖两条渐隐细线，亮度跟闪烁走。 */
function drawSparkle(frame: WeatherFrame, x: number, y: number, arm: number, alpha: number, rgb: string) {
  const { ctx } = frame
  const gradient = ctx.createLinearGradient(x - arm, y, x + arm, y)
  gradient.addColorStop(0, `rgba(${rgb},0)`)
  gradient.addColorStop(0.5, `rgba(${rgb},${alpha})`)
  gradient.addColorStop(1, `rgba(${rgb},0)`)
  ctx.strokeStyle = gradient
  ctx.lineWidth = 0.9
  ctx.beginPath()
  ctx.moveTo(x - arm, y)
  ctx.lineTo(x + arm, y)
  ctx.moveTo(x, y - arm)
  ctx.lineTo(x, y + arm)
  ctx.stroke()
}

function drawStars(frame: WeatherFrame, strength: number) {
  if (strength <= 0.02) return
  const { ctx, width, height } = frame
  const starList = frame.particles.stars
  const count = Math.min(starList.length, Math.round(starList.length * Math.min(1.4, strength) * frame.quality))
  // 每种色温一张柔光晕贴图（缓存里只有 3 张，命中率极高）。
  const halos = {
    cool: frame.sprites.glowSprite(STAR_RGB_COOL),
    neutral: frame.sprites.glowSprite(STAR_RGB_NEUTRAL),
    warm: frame.sprites.glowSprite(STAR_RGB_WARM),
  }
  const cap = Math.min(1, strength)
  ctx.save()
  for (let index = 0; index < count; index++) {
    const star = starList[index]
    const rgb = starColor(star.seed)
    const glow = twinkle(frame.elapsedSeconds, star.seed)
    const extinction = horizonExtinction(star.y * height, height)
    if (extinction <= 0.02) continue
    const x = star.x * width
    const y = star.y * height
    ctx.globalAlpha = Math.min(STAR_MAX_ALPHA, Math.max(STAR_MIN_GLOW, glow * 0.95 * cap * extinction))
    // 圆点而不是方块：方块在高分屏上会显出锯齿，星星立刻变成坏点。
    ctx.fillStyle = `rgb(${rgb})`
    ctx.beginPath()
    ctx.arc(x, y, star.size * 0.6, 0, TAU)
    ctx.fill()
    if (star.size <= SPARKLE_SIZE_THRESHOLD) continue
    const starHalo = rgb === STAR_RGB_COOL ? halos.cool : rgb === STAR_RGB_WARM ? halos.warm : halos.neutral
    if (starHalo) {
      // 柔光晕跟着闪烁一起明灭，这是「眨眼」感的主要来源。
      const halo = star.size * 16
      ctx.globalAlpha = glow * 0.4 * cap * extinction
      ctx.drawImage(starHalo, x - halo / 2, y - halo / 2, halo, halo)
    }
    drawSparkle(frame, x, y, star.size * 4.2, glow * 0.5 * cap * extinction, rgb)
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

function drawMeteor(frame: WeatherFrame, meteor: MeteorState, enabled: boolean) {
  if (!enabled) {
    meteor.age = METEOR_LIFE
    return
  }
  if (meteor.age >= METEOR_LIFE) {
    meteor.nextIn -= frame.deltaSeconds
    if (meteor.nextIn > 0) return
    meteor.age = 0
    meteor.x = RANDOM(0.1, 0.75)
    meteor.y = RANDOM(0.03, 0.22)
    meteor.tilt = RANDOM(0.18, 0.34)
    meteor.nextIn = RANDOM(METEOR_GAP.min, METEOR_GAP.max)
  }
  meteor.age += frame.deltaSeconds
  const progress = Math.min(1, meteor.age / METEOR_LIFE)
  const { ctx, width, height } = frame
  const travel = width * 0.5 * progress
  const x = meteor.x * width + travel
  const y = meteor.y * height + travel * meteor.tilt
  const tail = width * 0.16 * (1 - progress * 0.4)
  ctx.save()
  ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.85
  ctx.strokeStyle = '#fffdf2'
  ctx.lineWidth = 1.6
  ctx.lineCap = 'round'
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.lineTo(x - tail, y - tail * meteor.tilt)
  ctx.stroke()
  ctx.restore()
}

export function createStarRenderer() {
  const meteor: MeteorState = {
    age: METEOR_LIFE,
    x: 0,
    y: 0,
    tilt: 0,
    nextIn: RANDOM(METEOR_FIRST_DELAY.min, METEOR_FIRST_DELAY.max),
  }

  return {
    draw(frame: WeatherFrame) {
      drawStars(frame, frame.preset.stars || 0)
      drawMeteor(frame, meteor, frame.preset.meteor === true)
    },
    reset() {
      meteor.age = METEOR_LIFE
      meteor.nextIn = RANDOM(METEOR_FIRST_DELAY.min, METEOR_FIRST_DELAY.max)
    },
  }
}
