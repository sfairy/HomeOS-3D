/**
 * 地面交互层：水花、涟漪、湿地反光、积雪。
 *
 * 这是「像天气」和「像天气场景」的分界线。雨滴只在空中划过时，人也只能说
 * 「有个下雨特效」；雨滴砸在真实地板上溅起水花、地面慢慢变湿反光，才会让人
 * 觉得屋外真的在下雨。
 *
 * 落点由 `frame.ground`（舞台投影来的真实地面四边形）决定：
 * 随机取 `u/v` → 双线性插值成屏幕坐标，所以无论怎么转视角，水花都贴在地板上。
 */
import type { WeatherFrame } from './frame'
import {
  createSeededRandom,
  nearGroundCutY,
  pointOnQuad,
  quadDepthAt,
  quadSheenSpan,
  sampleNearGroundPoint,
} from './ground-quad'
import type { SplashEvent } from './particles'

const TAU = Math.PI * 2
/** 强度 1 时的每秒溅射次数。 */
const SPLASH_PER_SECOND = 34
/** 涟漪与溅射的生命周期（秒）。 */
const RIPPLE_LIFE = 0.62
/** 溅射水珠只在最初这段时间可见（再往后就落回地面了）。 */
const DROPLET_SECONDS = 0.2
/** 水珠水平初速度（CSS px/s，已按近远系数缩放）。 */
const DROPLET_SPEED = 70
/** 水珠重力项（px/s²）：0.2 秒内能明显抛起再落下，不然只是钉在地上的亮点。 */
const DROPLET_GRAVITY = 280
/** 地面椭圆的透视压扁比例。 */
const RIPPLE_FLATTEN = 0.34
/** 湿地 / 积雪的收敛速度：湿地快、积雪慢（20~40 秒才铺白）。 */
const WET_CONVERGE = 2.2
const SNOW_CONVERGE = 0.06
/** 采样点落到画面外的容差：贴边的涟漪还要露出一半。 */
const OFFSCREEN_MARGIN = 0.05
/** 湿地 / 积雪在四边形内部的峰值不透明度上限（再高就会盖住地板纹理）。 */
const WET_MAX_ALPHA = 0.2
const SNOW_MAX_ALPHA = 0.2

type GroundState = {
  spawnAccumulator: number
  spawnCursor: number
  wetLevel: number
  snowCover: number
}

function traceGroundPath(frame: WeatherFrame) {
  const { ctx, ground, width, height } = frame
  const [firstPoint, ...restPoints] = ground
  ctx.beginPath()
  ctx.moveTo(firstPoint[0] * width, firstPoint[1] * height)
  for (const point of restPoints) ctx.lineTo(point[0] * width, point[1] * height)
  ctx.closePath()
}

/**
 * 地面层的「柔边」填充渐变。
 *
 * 直接沿裁剪路径铺满时，四边形的四条边是**硬切边**：只要天气一动，地板上就会
 * 浮出一块边缘笔直的「方块画布阴影」（用户实际反馈）。这里把 alpha 做成
 * **从画面下部往上淡出**的竖直渐变：上界处 alpha 归零，所以地板上看不到任何
 * 横向分界线，画面里也不会出现一块矩形色块。
 *
 * 为什么是竖直方向而不是以地面中心为圆心：相机绕户型转一圈时地板投影是旋转的，
 * 圆心的位置会跟着「近边」飘到画面左侧或右侧，特效重心又回到画布中间
 * （用户实际反馈）。屏幕纵向是唯一与相机无关的「远近」轴——越靠下越近，
 * 所以水痕与积雪按纵向铺，重心稳定落在画面下部。
 *
 * @param fadeStart 从底部往上多少比例开始衰减（0.5 表示中线以下才开始变淡）。
 */
function groundSheenGradient(frame: WeatherFrame, rgb: string, peakAlpha: number, fadeStart: number) {
  const { ctx, height, ground } = frame
  const [topY, bottomY] = quadSheenSpan(ground)
  const gradient = ctx.createLinearGradient(0, bottomY * height, 0, topY * height)
  const alpha = Math.max(0, Math.min(1, peakAlpha))
  const fadeFrom = Math.min(0.9, Math.max(0.05, fadeStart))
  // 底部最强：脚下的积水 / 积雪最厚。
  gradient.addColorStop(0, `rgba(${rgb},${alpha})`)
  gradient.addColorStop(fadeFrom * 0.45, `rgba(${rgb},${alpha * 0.78})`)
  // 中段压到不足一半：远端不会与近端一样白，积雪才有厚薄之分。
  gradient.addColorStop(fadeFrom, `rgba(${rgb},${alpha * 0.4})`)
  gradient.addColorStop(1, `rgba(${rgb},0)`)
  return gradient
}

function spawnSplash(frame: WeatherFrame, state: GroundState) {
  const pool = frame.particles.splashes
  if (!pool.length) return
  // 只在「靠画面底部的一段」里取点：相机怎么转，水花都在画面下部。
  const sample = sampleNearGroundPoint(frame.ground)
  if (!sample) return
  // 相机推近时四边形会大幅越出画面：屏幕外的点不占池位，否则可见的水花会变稀。
  if (sample.x < -OFFSCREEN_MARGIN || sample.x > 1 + OFFSCREEN_MARGIN) return
  if (sample.y < -OFFSCREEN_MARGIN || sample.y > 1 + OFFSCREEN_MARGIN) return
  const splash = pool[state.spawnCursor % pool.length]
  state.spawnCursor += 1
  splash.active = true
  splash.u = sample.u
  splash.v = sample.v
  splash.depth = sample.depth
  splash.age = 0
  splash.seed = Math.random() * TAU
  splash.life = RIPPLE_LIFE
}

/**
 * 落点每帧重新投影并重算远近。
 *
 * `u/v` 在相机移动后仍然指向同一块地板，但屏幕坐标会变；远近系数也按**当前**
 * 屏幕纵向位置算，而不是沿用生成时的值——否则视角一变，远端的水花会顶着一副
 * 近处的尺寸与不透明度。
 */
function resolveSplash(frame: WeatherFrame, splash: SplashEvent) {
  const [x, y] = pointOnQuad(frame.ground, splash.u, splash.v)
  splash.depth = quadDepthAt(frame.ground, y)
  return { x, y, depth: splash.depth }
}

function advanceSplashes(frame: WeatherFrame, state: GroundState, strength: number) {
  state.spawnAccumulator += frame.deltaSeconds * strength * SPLASH_PER_SECOND * frame.quality
  // 单帧最多补 6 朵，避免从后台切回来时一次性喷一屏。
  for (let spawned = 0; state.spawnAccumulator >= 1 && spawned < 6; spawned++) {
    state.spawnAccumulator -= 1
    spawnSplash(frame, state)
  }
  if (state.spawnAccumulator < 0) state.spawnAccumulator = 0
  for (const splash of frame.particles.splashes) {
    if (!splash.active) continue
    splash.age += frame.deltaSeconds
    if (splash.age >= splash.life) splash.active = false
  }
}

/** 溅射水珠：3~5 颗沿抛物线弹出，只在最初 0.2 秒可见（之后已落回地面）。 */
function drawDroplets(frame: WeatherFrame, splash: SplashEvent) {
  if (splash.age > DROPLET_SECONDS) return
  const { ctx, width, height } = frame
  const { x: centerX, y: centerY, depth } = resolveSplash(frame, splash)
  const scale = 0.45 + depth * 0.85
  const count = 3
  const fade = 1 - splash.age / DROPLET_SECONDS
  const travel = splash.age * DROPLET_SPEED * scale
  const fall = DROPLET_GRAVITY * splash.age * splash.age * scale
  ctx.fillStyle = `rgba(232,244,255,${0.75 * fade})`
  for (let index = 0; index < count; index++) {
    const angle = splash.seed + index * 2.399
    const horizontal = Math.cos(angle) * travel
    // 竖直方向按重力回落：先上抛再加速下坠。
    const vertical = Math.sin(angle) * travel * 0.6 - fall
    ctx.fillRect(centerX * width + horizontal - 0.7, centerY * height + vertical - 0.7, 1.4 + scale, 1.4 + scale)
  }
}

function drawRipple(frame: WeatherFrame, splash: SplashEvent) {
  const { ctx, width, height } = frame
  const { x: centerX, y: centerY, depth } = resolveSplash(frame, splash)
  const progress = Math.min(1, splash.age / splash.life)
  const scale = 0.45 + depth * 0.85
  const maxRadius = 13 * scale
  const radius = 1 + maxRadius * Math.sqrt(progress)
  // 远端（靠近地平线）压低透明度，否则水花会比地板本身还抢眼。
  const distanceFade = 0.25 + depth * 0.75
  ctx.strokeStyle = `rgba(226,240,255,${(1 - progress) * 0.5 * distanceFade})`
  ctx.lineWidth = Math.max(0.5, 1.1 * scale)
  ctx.beginPath()
  ctx.ellipse(centerX * width, centerY * height, radius, radius * RIPPLE_FLATTEN, 0, 0, TAU)
  ctx.stroke()
}

function drawSplashes(frame: WeatherFrame) {
  const { ctx } = frame
  ctx.save()
  for (const splash of frame.particles.splashes) {
    if (!splash.active) continue
    drawRipple(frame, splash)
    drawDroplets(frame, splash)
  }
  ctx.restore()
}

/** 减弱动效时用一组固定的涟漪代替生命周期，画面仍然「落地」但不闪动。 */
function drawStaticSplashes(frame: WeatherFrame) {
  const { ctx, width, height } = frame
  ctx.save()
  ctx.strokeStyle = 'rgba(226,240,255,0.22)'
  ctx.lineWidth = 0.9
  // 固定种子：每次重绘都落在同一批点上，静态帧不能一帧一个样。
  const random = createSeededRandom(0x9e3779b9)
  for (let index = 0; index < 18; index++) {
    // 与动态水花用同一套「只取画面下部」的采样，静态帧的落点重心一致。
    const sample = sampleNearGroundPoint(frame.ground, random)
    if (!sample) continue
    // 四边形可能大幅越出画面（相机推近），屏幕外的固定涟漪不必画。
    if (sample.x < -OFFSCREEN_MARGIN || sample.x > 1 + OFFSCREEN_MARGIN) continue
    if (sample.y < -OFFSCREEN_MARGIN || sample.y > 1 + OFFSCREEN_MARGIN) continue
    const radius = 6 * (0.7 + sample.depth * 0.5)
    ctx.beginPath()
    ctx.ellipse(sample.x * width, sample.y * height, radius, radius * RIPPLE_FLATTEN, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
}

/** 湿地：地面铺一层底部加权的冷白反光，再叠几条横向高光；雷电时整体提亮。 */
function drawWet(frame: WeatherFrame, wetLevel: number) {
  if (wetLevel <= 0.02) return
  const { ctx, width, height } = frame
  const [topY, bottomY] = quadSheenSpan(frame.ground)
  const flashBoost = 1 + frame.flash * 1.6
  ctx.save()
  traceGroundPath(frame)
  ctx.clip()
  // 竖直淡出的柔边渐变：上界 alpha 为 0，不会在地板上切出一条横向硬边。
  ctx.fillStyle = groundSheenGradient(frame, '206,220,236', Math.min(WET_MAX_ALPHA, 0.15 * wetLevel * flashBoost), 0.5)
  ctx.fillRect(0, topY * height, width, (bottomY - topY) * height)
  // 横向高光短划：位置缓慢漂移 + 低频闪烁，模拟水面反光。
  // 只取画面下部的一段：高光铺到远端会把视线拉回画布中间。
  const cutY = nearGroundCutY(frame.ground)
  const highlightCount = Math.round(10 * frame.quality) + 4
  ctx.fillStyle = 'rgba(236,246,255,0.9)'
  for (let index = 0; index < highlightCount; index++) {
    const phase = frame.elapsedSeconds * 0.22 + index * 1.37
    const u = (((index * 0.37 + Math.sin(phase) * 0.05) % 1) + 1) % 1
    const v = 0.25 + ((index * 0.53) % 1) * 0.72
    const [x, y] = pointOnQuad(frame.ground, u, v)
    if (y < cutY) continue
    // 远近按屏幕纵向位置重算：`v` 在旋转视角下不能代表远近。
    const depth = quadDepthAt(frame.ground, y)
    ctx.globalAlpha = (0.12 + 0.16 * Math.abs(Math.sin(phase * 2.3))) * wetLevel * flashBoost
    ctx.fillRect(x * width, y * height, (14 + (index % 4) * 9) * (0.6 + depth * 0.5), 1 + depth)
  }
  ctx.restore()
}

function drawSnowCover(frame: WeatherFrame, snowCover: number) {
  if (snowCover <= 0.004) return
  const { ctx, width, height } = frame
  const [topY, bottomY] = quadSheenSpan(frame.ground)
  ctx.save()
  traceGroundPath(frame)
  ctx.clip()
  // 同样走竖直淡出：积雪贴着画面下部积起来，远端只留一层薄白，边界不可见。
  ctx.fillStyle = groundSheenGradient(frame, '246,250,255', Math.min(SNOW_MAX_ALPHA, snowCover * 0.92), 0.55)
  ctx.fillRect(0, topY * height, width, (bottomY - topY) * height)
  ctx.restore()
}

export function createGroundRenderer() {
  const state: GroundState = {
    spawnAccumulator: 0,
    spawnCursor: 0,
    wetLevel: 0,
    snowCover: 0,
  }

  return {
    draw(frame: WeatherFrame) {
      const targetWet = frame.preset.wet || 0
      const targetSnow = frame.preset.snowCover || 0
      const strength = frame.preset.splash || 0
      if (frame.reducedMotion) {
        // 定格模式下不推进生命周期，但积雪仍然要「已铺好」，否则静态帧看起来没下过雪。
        state.wetLevel = targetWet
        state.snowCover = targetSnow
        drawWet(frame, state.wetLevel)
        drawSnowCover(frame, state.snowCover)
        if (strength > 0) drawStaticSplashes(frame)
        return
      }
      state.wetLevel += (targetWet - state.wetLevel) * Math.min(1, frame.deltaSeconds * WET_CONVERGE)
      state.snowCover += (targetSnow - state.snowCover) * Math.min(1, frame.deltaSeconds * SNOW_CONVERGE)
      if (strength > 0) advanceSplashes(frame, state, strength)
      drawWet(frame, state.wetLevel)
      drawSnowCover(frame, state.snowCover)
      drawSplashes(frame)
    },
    reset() {
      state.spawnAccumulator = 0
      state.spawnCursor = 0
      state.wetLevel = 0
      state.snowCover = 0
    },
  }
}
