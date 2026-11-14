/**
 * 地面交互层：水花、涟漪、水洼反光。
 *
 * 这是「像天气」和「像天气场景」的分界线。雨滴只在空中划过时，人也只能说
 * 「有个下雨特效」；雨滴砸在真实地板上溅起水花、水面成块反光，才会让人
 * 觉得屋外真的在下雨。
 *
 * 落点由 `frame.ground`（舞台投影来的真实地面四边形）决定：
 * 随机取 `u/v` → 双线性插值成屏幕坐标，所以无论怎么转视角，水花都贴在地板上。
 *
 * **不铺整片底、也不堆雪**：湿痕只由成块的水洼表示（不再沿地板四边形铺一层竖直渐变），
 * 积雪堆积整块不做。前者在画面上就是一块半透明的灰白梯形「底板」—— 天气一开，画面下部
 * 像被盖了一块板；后者铺的是一块块白色斑块，压扁的云贴图看起来就是「躺在地上的云朵」
 * （用户反馈要求去掉）。所以本模块只画有明确形状且贴地的元素：成块水洼、贴水高光、
 * 以及落点水花与涟漪。
 */
import type { WeatherFrame } from './frame'
import { createSeededRandom, pointOnQuad, quadDepthAt, quadSheenSpan, sampleNearGroundPoint } from './ground-quad'
import type { SplashEvent } from './particles'

const TAU = Math.PI * 2
/** 强度 1 时的每秒溅射次数。 */
const SPLASH_PER_SECOND = 34
/** 涟漪与溅射的生命周期（秒）。 */
const RIPPLE_LIFE = 0.62
/** 雪粉：雪片落地只是轻轻扬起一小团粉，比水花短、比水花淡。 */
const SNOW_PUFF_LIFE = 0.38
/** 雪粉贴图颜色：雪不是水，不能复用雨水的冷蓝。 */
const SNOW_PUFF_RGB = '250,252,255'
/** 第二圈涟漪的延迟与初始强度：一次水花会有内外两圈波纹扩散开。 */
const SECOND_RIPPLE_DELAY = 0.13
const SECOND_RIPPLE_GAIN = 0.55
/** 溅射水珠只在最初这段时间可见（再往后就落回地面了）。 */
const DROPLET_SECONDS = 0.2
/** 水冠：水花初起时向上拔起的一小簇水，是「砸」出来的关键形态。 */
const CROWN_SECONDS = 0.12
/** 水珠水平初速度（CSS px/s，已按近远系数缩放）。 */
const DROPLET_SPEED = 70
/** 水珠重力项（px/s²）：0.2 秒内能明显抛起再落下，不然只是钉在地上的亮点。 */
const DROPLET_GRAVITY = 280
/** 地面椭圆的透视压扁比例。 */
const RIPPLE_FLATTEN = 0.34
/** 湿地的收敛速度：下雨后水洼约 1 秒内起效，停雨后慢慢收干。 */
const WET_CONVERGE = 2.2
/** 采样点落到画面外的容差：贴边的涟漪还要露出一半。 */
const OFFSCREEN_MARGIN = 0.05
/** 水洼在四边形内部的峰值不透明度上限（再高就会盖住地板纹理）。 */
const WET_MAX_ALPHA = 0.2
/** 水洼的固定布点数。 */
const PUDDLE_COUNT = 11
/** 布点用的固定种子：每次重建天气层都落在同一批位置，切天气不会整体跳一下。 */
const GROUND_DETAIL_SEED = 0x51ed270b

type GroundState = {
  spawnAccumulator: number
  spawnCursor: number
  wetLevel: number
}

/** 一块水洼 / 雪堆：`u/v` 是地板参数，随相机一起变换。 */
type GroundPatch = {
  u: number
  v: number
  /** 半径系数（占画面宽度比例）。 */
  radius: number
  /** 不透明度系数（0~1）。 */
  strength: number
  /** 贴图变体（云贴图有 3 种团块布局，用来做不规则雪堆）。 */
  variant: number
}

function createPatches(seed: number, count: number, radiusFrom: number, radiusTo: number): GroundPatch[] {
  const random = createSeededRandom(seed)
  return Array.from({ length: count }, (_, index) => ({
    // `v` 落在近边一带（0 = 近边、1 = 远边）：积水与积雪都堆在脚下，
    // 与落点采样（`NEAR_GROUND_V_MAX`）用同一段纵深，视觉上才是一块地面。
    u: random(),
    v: 0.04 + Math.pow(random(), 1.5) * 0.46,
    radius: radiusFrom + random() * (radiusTo - radiusFrom),
    strength: 0.45 + random() * 0.55,
    variant: index % 3,
  }))
}

/**
 * 落地溅射的形态。
 *
 * 雨是液体，砸在地上会溅水珠、扩散涟漪；雪不是 —— 雪片落地只会塌进雪里，
 * 最多扬起一小团雪粉。显式字段优先，缺省时按「有雨才是水花」推导，
 * 这样即使以后新增只下雪的天气，也不会意外画出一地水花。
 */
function splashStyleOf(frame: WeatherFrame): 'water' | 'snow' {
  const style = frame.preset.splashStyle
  if (style === 'water' || style === 'snow') return style
  return frame.preset.rain ? 'water' : 'snow'
}

function spawnSplash(frame: WeatherFrame, state: GroundState, life: number) {
  const pool = frame.particles.splashes
  if (!pool.length) return
  // 在地板近边带上取点：横向铺满整条宽度，纵深向脚下压（见 `sampleNearGroundPoint`）。
  const sample = sampleNearGroundPoint(frame.ground)
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
  splash.life = life
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

function advanceSplashes(frame: WeatherFrame, state: GroundState, strength: number, style: 'water' | 'snow') {
  // 阵风越大，雨点越密：水花的生成频率跟着阵风一起呼吸，不是匀速掉。
  // 雪粉不吃阵风（雪片是飘落的，不是被风斜砸下来的），所以呼吸幅度压到很小。
  const gustFactor = style === 'snow' ? 0.94 + frame.gust * 0.12 : 0.82 + frame.gust * 0.36
  state.spawnAccumulator += frame.deltaSeconds * strength * SPLASH_PER_SECOND * frame.quality * gustFactor
  const life = style === 'snow' ? SNOW_PUFF_LIFE : RIPPLE_LIFE
  // 单帧最多补 6 朵，避免从后台切回来时一次性喷一屏。
  for (let spawned = 0; state.spawnAccumulator >= 1 && spawned < 6; spawned++) {
    state.spawnAccumulator -= 1
    spawnSplash(frame, state, life)
  }
  if (state.spawnAccumulator < 0) state.spawnAccumulator = 0
  for (const splash of frame.particles.splashes) {
    if (!splash.active) continue
    splash.age += frame.deltaSeconds
    if (splash.age >= splash.life) splash.active = false
  }
}

/** 溅射水珠：2~5 颗沿抛物线弹出，只在最初 0.2 秒可见（之后已落回地面）。 */
function drawDroplets(frame: WeatherFrame, splash: SplashEvent) {
  if (splash.age > DROPLET_SECONDS) return
  const { ctx, width, height } = frame
  const { x: centerX, y: centerY, depth } = resolveSplash(frame, splash)
  const scale = 0.45 + depth * 0.85
  // 近处的水花更「炸」：水珠数量与飞散距离都跟远近走。
  const count = 2 + Math.round(depth * 3)
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
  // 水冠：初起的一小簇向上拔起的水，砸下去才有东西「立」起来。
  if (splash.age > CROWN_SECONDS) return
  const crownProgress = splash.age / CROWN_SECONDS
  const crownHeight = 4.5 * scale * crownProgress
  ctx.fillStyle = `rgba(240,248,255,${0.62 * (1 - crownProgress)})`
  for (let index = 0; index < 3; index++) {
    const spread = (index - 1) * 1.8 * scale
    ctx.fillRect(centerX * width + spread - 0.5, centerY * height - crownHeight, 1, crownHeight)
  }
}

/** 一圈涟漪；`progressOffset` 用于画延迟出现的第二圈。 */
function drawRippleRing(
  frame: WeatherFrame,
  centerX: number,
  centerY: number,
  scale: number,
  depth: number,
  progress: number,
  alphaGain: number,
) {
  if (progress <= 0 || progress >= 1) return
  const { ctx, width, height } = frame
  const maxRadius = 13 * scale
  const radius = 1 + maxRadius * Math.sqrt(progress)
  // 远端（靠近地平线）压低透明度，否则水花会比地板本身还抢眼。
  const distanceFade = 0.25 + depth * 0.75
  ctx.strokeStyle = `rgba(226,240,255,${(1 - progress) * 0.5 * distanceFade * alphaGain})`
  ctx.lineWidth = Math.max(0.5, 1.1 * scale)
  ctx.beginPath()
  ctx.ellipse(centerX * width, centerY * height, radius, radius * RIPPLE_FLATTEN, 0, 0, TAU)
  ctx.stroke()
}

function drawRipple(frame: WeatherFrame, splash: SplashEvent) {
  const { x: centerX, y: centerY, depth } = resolveSplash(frame, splash)
  const scale = 0.45 + depth * 0.85
  const progress = Math.min(1, splash.age / splash.life)
  drawRippleRing(frame, centerX, centerY, scale, depth, progress, 1)
  // 第二圈：主圈铺开一点之后才出现，衰减更快。
  const secondProgress = (splash.age - SECOND_RIPPLE_DELAY) / (splash.life - SECOND_RIPPLE_DELAY)
  drawRippleRing(frame, centerX, centerY, scale * 0.78, depth, secondProgress, SECOND_RIPPLE_GAIN)
}

/**
 * 雪粉：雪片落地扬起来的一小团粉。
 *
 * 不是水花：没有涟漪圈、没有弹起的水珠、没有水冠 —— 那些都是液体的行为。
 * 只有一团很淡的白色柔光从落点向上散开、很快消失，配合缓慢累积的积雪，
 * 才像「雪落在地上」。
 */
function drawSnowPuff(frame: WeatherFrame, splash: SplashEvent) {
  const { ctx, width, height } = frame
  const { x: centerX, y: centerY, depth } = resolveSplash(frame, splash)
  const sprite = frame.sprites.glowSprite(SNOW_PUFF_RGB)
  if (!sprite) return
  const progress = Math.min(1, splash.age / splash.life)
  const scale = 0.4 + depth * 0.75
  // 先快后慢地散开，像粉末被压散；同时整体淡出。
  const radius = (2.4 + 7 * Math.sqrt(progress)) * scale
  const distanceFade = 0.3 + depth * 0.7
  ctx.save()
  ctx.globalAlpha = (1 - progress) * 0.42 * distanceFade
  // 纵向压扁：雪粉贴地扬起，不是一个悬在空中的光球。
  ctx.drawImage(sprite, centerX * width - radius, centerY * height - radius * 0.55, radius * 2, radius * 1.1)
  ctx.restore()
}

function drawSplashes(frame: WeatherFrame, style: 'water' | 'snow') {
  const { ctx } = frame
  ctx.save()
  for (const splash of frame.particles.splashes) {
    if (!splash.active) continue
    if (style === 'snow') {
      drawSnowPuff(frame, splash)
      continue
    }
    drawRipple(frame, splash)
    drawDroplets(frame, splash)
  }
  ctx.restore()
}

/** 减弱动效时用一组固定的落点代替生命周期，画面仍然「落地」但不闪动。 */
function drawStaticSplashes(frame: WeatherFrame, style: 'water' | 'snow') {
  const { ctx, width, height } = frame
  ctx.save()
  const puffSprite = style === 'snow' ? frame.sprites.glowSprite(SNOW_PUFF_RGB) : null
  // 水花用描边画涟漪；雪粉用柔光点，绝不画圈（画圈就等于在说「地上有水面」）。
  ctx.strokeStyle = 'rgba(226,240,255,0.22)'
  ctx.lineWidth = 0.9
  // 固定种子：每次重绘都落在同一批点上，静态帧不能一帧一个样。
  const random = createSeededRandom(0x9e3779b9)
  for (let index = 0; index < 18; index++) {
    // 与动态水花用同一套采样，静态帧的落点重心一致。
    const sample = sampleNearGroundPoint(frame.ground, random)
    // 四边形可能大幅越出画面（相机推近），屏幕外的固定涟漪不必画。
    if (sample.x < -OFFSCREEN_MARGIN || sample.x > 1 + OFFSCREEN_MARGIN) continue
    if (sample.y < -OFFSCREEN_MARGIN || sample.y > 1 + OFFSCREEN_MARGIN) continue
    if (style === 'snow') {
      if (!puffSprite) continue
      const radius = 5.5 * (0.7 + sample.depth * 0.5)
      ctx.globalAlpha = 0.16
      ctx.drawImage(puffSprite, sample.x * width - radius, sample.y * height - radius * 0.55, radius * 2, radius * 1.1)
      continue
    }
    const radius = 6 * (0.7 + sample.depth * 0.5)
    ctx.beginPath()
    ctx.ellipse(sample.x * width, sample.y * height, radius, radius * RIPPLE_FLATTEN, 0, 0, TAU)
    ctx.stroke()
  }
  ctx.restore()
  ctx.globalAlpha = 1
}

/**
 * 湿痕带的上缘淡出（0~1）：落在带上缘附近的水洼/雪堆要淡掉，否则椭圆会被硬切出直边。
 *
 * @param y 归一化屏幕纵向位置
 * @param bandTopY 带宽上缘（`quadSheenSpan` 的 `topY`）
 */
function bandEdgeFade(y: number, bandTopY: number) {
  const fadeHeight = 0.1
  return Math.min(1, Math.max(0, (y - bandTopY) / fadeHeight))
}

/**
 * 水洼：成块的湿地反光。
 *
 * 「湿」的观感完全由这些椭圆水洼给出来 —— 没有铺底的竖直渐变（那层会变成一块
 * 半透明底板，见模块头注释）。只有成块的水洼才像积水，均匀填充像蒙了层灰纱。
 *
 * 水洼必须与水花落在**同一条湿痕带**里（`quadSheenSpan`）：水洼铺到画面中部、
 * 水花却只在下部时，两者观感会分裂（用户反馈「溅水偏中」的同一类问题）。
 * 带上缘用一小段 alpha 斜坡淡出，避免椭圆被硬切出直边。
 */
/**
 * 该画多少块地面细节（水洼 / 雪堆）。
 *
 * 画质降档时少画几块：这些是大面积半透明叠加，是地面层里最贵的一段。
 * 抽成函数而不是在绘制里写三元，是为了不把两个绘制函数的复杂度推过门禁阈值。
 */
function visiblePatchCount(total: number, quality: number) {
  return quality >= 0.8 ? total : Math.ceil(total * 0.6)
}

function drawPuddles(frame: WeatherFrame, puddles: readonly GroundPatch[], wetLevel: number, bandTopY: number) {
  const { ctx, width, height } = frame
  const sprite = frame.sprites.glowSprite('214,228,244')
  if (!sprite) return
  const flashBoost = 1 + frame.flash * 1.6
  const count = visiblePatchCount(puddles.length, frame.quality)
  for (let index = 0; index < count; index++) {
    const puddle = puddles[index]
    const [x, y] = pointOnQuad(frame.ground, puddle.u, puddle.v)
    const depth = quadDepthAt(frame.ground, y)
    // 中心在画面外的水洼不必画（相机推近时会大量越界）。
    if (x < -0.2 || x > 1.2 || y < -0.1 || y > 1.1) continue
    const edgeFade = bandEdgeFade(y, bandTopY)
    if (edgeFade <= 0.01) continue
    const radius = width * puddle.radius * (0.72 + depth * 0.6)
    ctx.globalAlpha =
      Math.min(0.34, WET_MAX_ALPHA * 1.1 * puddle.strength * wetLevel * flashBoost * (0.4 + depth * 0.6)) * edgeFade
    if (ctx.globalAlpha <= 0.004) continue
    ctx.drawImage(
      sprite,
      x * width - radius,
      y * height - radius * RIPPLE_FLATTEN,
      radius * 2,
      radius * 2 * RIPPLE_FLATTEN,
    )
  }
}

/**
 * 湿地：水洼与横向高光，**不铺整片底**。
 *
 * 曾经这里会沿地板四边形铺一层竖直淡出的冷白渐变，用来表达「整片地板都湿了」。
 * 但那层渐变在地板上就是一块**半透明的灰白梯形底板**：天气一开，画面下部像被盖了
 * 一块板，比「湿」本身更抢眼（用户反馈要求去掉）。现在只保留成块的水洼与贴水的
 * 高光短划 —— 湿的观感由形状给出来，而不是由一层覆盖整片地板的填充给出来。
 */
function drawWet(frame: WeatherFrame, wetLevel: number, puddles: readonly GroundPatch[]) {
  if (wetLevel <= 0.02) return
  const { ctx, width, height } = frame
  // 只用湿痕带的上缘做柔边：水洼与高光超过这条线就淡出，避免被硬切出直边。
  const [topY] = quadSheenSpan(frame.ground)
  const flashBoost = 1 + frame.flash * 1.6
  ctx.save()
  drawPuddles(frame, puddles, wetLevel, topY)
  // 横向高光短划：位置缓慢漂移 + 低频闪烁，模拟水面反光。
  // 高光跟着水洼走，用同一条湿痕带的柔边上缘淡出 —— 这里**不能**用屏幕 y 硬筛：
  // 相机斜着看时地板近边是斜的，硬筛会把右半边的高光整片切掉（只剩左下）。
  const highlightCount = Math.round(10 * frame.quality) + 4
  ctx.fillStyle = 'rgba(236,246,255,0.9)'
  for (let index = 0; index < highlightCount; index++) {
    const phase = frame.elapsedSeconds * 0.22 + index * 1.37
    // 高光贴在水洼上：一半取水洼位置、一半取地板参数，避免高光悬在没有水的地方。
    const puddle = puddles[index % puddles.length]
    const u = (((puddle.u + Math.sin(phase) * 0.03) % 1) + 1) % 1
    const v = (((puddle.v + Math.cos(phase * 0.7) * 0.02) % 1) + 1) % 1
    const [x, y] = pointOnQuad(frame.ground, u, v)
    const edgeFade = bandEdgeFade(y, topY)
    if (edgeFade <= 0.01) continue
    // 远近按屏幕纵向位置重算：`v` 在旋转视角下不能代表远近。
    const depth = quadDepthAt(frame.ground, y)
    ctx.globalAlpha = (0.12 + 0.16 * Math.abs(Math.sin(phase * 2.3))) * wetLevel * flashBoost * edgeFade
    ctx.fillRect(x * width, y * height, (14 + (index % 4) * 9) * (0.6 + depth * 0.5), 1 + depth)
  }
  ctx.restore()
}

export function createGroundRenderer() {
  const state: GroundState = {
    spawnAccumulator: 0,
    spawnCursor: 0,
    wetLevel: 0,
  }
  // 布点只算一次：切成雨再切回来，水洼还在原地，不会整体跳一下。
  const puddles = createPatches(GROUND_DETAIL_SEED, PUDDLE_COUNT, 0.05, 0.14)

  return {
    draw(frame: WeatherFrame) {
      const targetWet = frame.preset.wet || 0
      const strength = frame.preset.splash || 0
      // 溅射形态跟降水种类走：雨溅水，雪扬粉。见 `splashStyleOf`。
      const splashStyle = splashStyleOf(frame)
      if (frame.reducedMotion) {
        // 定格模式下不推进生命周期；湿痕直接取目标值，静态帧才看得出下过雨。
        state.wetLevel = targetWet
        drawWet(frame, state.wetLevel, puddles)
        if (strength > 0) drawStaticSplashes(frame, splashStyle)
        return
      }
      state.wetLevel += (targetWet - state.wetLevel) * Math.min(1, frame.deltaSeconds * WET_CONVERGE)
      if (strength > 0) advanceSplashes(frame, state, strength, splashStyle)
      drawWet(frame, state.wetLevel, puddles)
      drawSplashes(frame, splashStyle)
    },
    reset() {
      state.spawnAccumulator = 0
      state.spawnCursor = 0
      state.wetLevel = 0
    },
  }
}
