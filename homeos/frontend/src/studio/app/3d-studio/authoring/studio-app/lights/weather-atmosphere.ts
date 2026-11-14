/**
 * 舞台侧的「天气大气」控制器：把天气键换成一组光照系数，乘到基础灯光上。
 *
 * 为什么需要它
 * ------------
 * 2D 天气层画的是「天上的东西」，房间本身没有反应：雷雨里墙面依然暖亮，
 * 雪天依然是中午的光，观感永远是「给户型盖了一层特效」。
 *
 * 设计要点
 * --------
 * - **只做乘数与插值**：亮度是相对 `refreshBaseLighting` 写好的基线做缩放，
 *   色温是从用户设定的原色朝天气目标色**插值**（带强度上限）。天气只能说
 *   「今天暗一点、光更冷一点」，不会覆盖任何亮度 / 色温 / 方向设定。
 * - **离散步进**：天气切换只走 4 步（约 0.6 秒），闪电只走 4 步（约 0.7 秒）。
 *   舞台的静态帧缓存是按「相机 + 曝光」签名的，逐帧改灯光等于逐帧整帧重绘，
 *   墙面平板撑不住；4 步已经足够看出「慢慢阴下来 / 猛地亮一下」。
 * - **可精确回退**：`dispose` 与空天气都回到中性系数（亮度 ×1、色温回原色、无雾），
 *   与没有接入天气时的画面完全一致 —— 反复切换不会把色温越带越偏。
 */
import {
  NEUTRAL_WEATHER_ATMOSPHERE,
  WEATHER_ATMOSPHERE_LIMITS,
  WEATHER_LIGHTNING_BOOST,
  weatherAtmosphereProfile,
  type WeatherAtmosphereProfile,
} from '@/studio/platform/weather-atmosphere'
import { weatherFlashEnvelope } from '@/studio/platform/weather-flash'

import { finite as finite2 } from '../../../loaders/studio-normalization'
import type { StudioAppContext } from '../studio-app-context'

/** 天气切换的步数与总时长。 */
const TRANSITION_STEPS = 4
const TRANSITION_MS = 600
/**
 * 一次放电的采样点。
 *
 * 只取 3 档是刻意的：每档都要重算一次场景光照（一次整帧渲染），而雷暴簇里放电
 * 间隔只有 0.16~0.46 秒，档位越多越容易在低端设备上连成一片卡顿。3 档已经能看出
 * 「猛地亮一下 → 回落 → 归零」。
 *
 * 末档 `seconds: null` 表示「本次放电结束」，按 0 精确恢复基线 —— 光靠包络采样会在
 * 0.92 秒处留下 ~0.003 的余辉，曝光与色温就永远回不到用户设定的精确值。
 */
const FLASH_SAMPLE_POINTS = [
  { delayMs: 0, seconds: 0 },
  { delayMs: 160, seconds: 0.16 },
  { delayMs: 920, seconds: null },
] as const

/** 每次放电最多 3 次重绘，中间步骤之间至少隔这么久（毫秒）。 */
const FLASH_MIN_RENDER_GAP_MS = 130

/** 闪电时把灯光推向的冷白色（`r,g,b` 片段；与 2D 闪电层的暖白有意区分）。 */
const LIGHTNING_TINT_RGB = '233,242,255'

/** 只用到 three 的雾与颜色两件事，按结构声明即可，避免把这个模块绑死在 three 的类型上。 */
export type ThreeColorLike = {
  setStyle(style: string): void
  setHex(hex: number): void
  getHex(): number
  lerp(color: ThreeColorLike, alpha: number): void
}
export type ThreeFogLike = { color: ThreeColorLike; density: number; isFogExp2?: boolean }
export type ThreeNamespaceLike = {
  Color: new () => ThreeColorLike
  FogExp2: new (color: number, density: number) => ThreeFogLike
}

/** 基础光照的绝对值；天气系数永远乘在它上面。 */
type LightBaseline = {
  hemisphere: number
  ambient: number
  main: number
  fill: number
  top: number
  exposure: number
  /** 各盏灯的原始颜色（`getHex`），天气只做插值、不改用户设定。 */
  hemisphereSky: number
  hemisphereGround: number
  ambientColor: number
  mainColor: number
  fillColor: number
  topColor: number
}

/** 控制器内部共享状态（纯数据 + 引用，便于把长函数拆到模块级）。 */
type AtmosphereState = {
  appCtx: StudioAppContext
  fogColor: ThreeColorLike
  /** 复用的插值色实例（每盏灯插值时临时 setStyle，避免每帧 new Color）。 */
  tintColor: ThreeColorLike
  /** 造一个指数雾（three 实例由调用方注入，避免这里再 import 一份 three）。 */
  createFog: (color: number, density: number) => ThreeFogLike
  baseline: LightBaseline | null
}

export type WeatherAtmosphereControllerOptions = {
  appCtx: StudioAppContext
  /** three 命名空间（必须与场景同一个实例，不要另起一份 import）。 */
  THREE: ThreeNamespaceLike
  /** 重绘一步：调用方负责清掉静态帧缓存并唤醒帧循环。 */
  requestRender: () => void
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancel?: (handle: ReturnType<typeof setTimeout>) => void
}

const clamp = (value: number, from: number, to: number) => (value < from ? from : value > to ? to : value)
const lerp = (from: number, to: number, amount: number) => from + (to - from) * amount

function lerpProfile(
  from: WeatherAtmosphereProfile,
  to: WeatherAtmosphereProfile,
  amount: number,
): WeatherAtmosphereProfile {
  return {
    hemisphere: lerp(from.hemisphere, to.hemisphere, amount),
    ambient: lerp(from.ambient, to.ambient, amount),
    main: lerp(from.main, to.main, amount),
    fill: lerp(from.fill, to.fill, amount),
    top: lerp(from.top, to.top, amount),
    exposure: lerp(from.exposure, to.exposure, amount),
    fogDensity: lerp(from.fogDensity, to.fogDensity, amount),
    // 雾色 / 色温目标色按字符串存，过渡时取更接近目标的那一端
    // （逐通道插值在这里看不出来，却要多一份状态）。
    fogRgb: amount < 0.5 ? from.fogRgb : to.fogRgb,
    lightTint: amount < 0.5 ? from.lightTint : to.lightTint,
    tintStrength: lerp(from.tintStrength, to.tintStrength, amount),
  }
}

/** `r,g,b` 片段 → `rgb(...)` 字符串（three 的 `Color.setStyle` 直接吃这个格式）。 */
function rgbStyle(fragment: string) {
  const channels = fragment.split(',').map((channel) => clamp(Number(channel) || 0, 0, 255).toFixed(0))
  return `rgb(${channels[0]},${channels[1]},${channels[2]})`
}

/** `r,g,b` 片段 → 提亮后的颜色（闪电时雾色跟着变亮，否则闪电里雾是一块脏灰）。 */
function fogColorFor(fragment: string, boost: number) {
  const channels = fragment.split(',').map((channel) => clamp(Number(channel) || 0, 0, 255))
  const lighten = clamp(boost * WEATHER_LIGHTNING_BOOST.fog, 0, 0.6)
  const mix = (channel: number) => Math.round(channel + (255 - channel) * lighten)
  return `rgb(${mix(channels[0])},${mix(channels[1])},${mix(channels[2])})`
}

/** 取一份「未被天气改过」的基线（由 `refreshBaseLighting` 写完之后调用）。 */
function captureBaseline(state: AtmosphereState) {
  const { appCtx } = state
  state.baseline = {
    hemisphere: finite2(appCtx.hemisphereLight?.intensity, 1),
    ambient: finite2(appCtx.ambientLight?.intensity, 1),
    main: finite2(appCtx.mainDirectionalLight?.intensity, 1),
    fill: finite2(appCtx.fillDirectionalLight?.intensity, 1),
    top: finite2(appCtx.topDirectionalLight?.intensity, 1),
    exposure: finite2(appCtx.threeRenderer?.toneMappingExposure, 1),
    // 颜色也只读一次：之后每次应用都从这几个原色重新插值，反复切换不会累积漂移。
    hemisphereSky: colorHex(appCtx.hemisphereLight?.color, 0xffffff),
    hemisphereGround: colorHex(appCtx.hemisphereLight?.groundColor, 0xffffff),
    ambientColor: colorHex(appCtx.ambientLight?.color, 0xffffff),
    mainColor: colorHex(appCtx.mainDirectionalLight?.color, 0xffffff),
    fillColor: colorHex(appCtx.fillDirectionalLight?.color, 0xffffff),
    topColor: colorHex(appCtx.topDirectionalLight?.color, 0xffffff),
  }
}

/** 取一盏灯当前颜色的 hex；灯或颜色缺失时回落到纯白。 */
function colorHex(color: ThreeColorLike | undefined | null, fallback: number) {
  if (!color || typeof color.getHex !== 'function') return fallback
  const hex = color.getHex()
  return Number.isFinite(hex) ? hex : fallback
}

/**
 * 把一盏灯的颜色从基线插值到天气的目标色。
 *
 * 只调亮度不调色温是「把灯拧小一点」，不是「天变了」：真实雨天是冷青色的环境光，
 * 雪天是冷白偏蓝，夜里是深蓝。这里始终从 `baseHex` 重新插值（而不是在上一次结果上
 * 继续插），所以天气反复切换不会把色温越带越偏。
 */
function tintLight(
  state: AtmosphereState,
  color: ThreeColorLike | undefined | null,
  baseHex: number,
  profile: WeatherAtmosphereProfile,
  strengthScale: number,
  flash: number,
) {
  if (!color) return
  color.setHex(baseHex)
  const strength = Math.min(WEATHER_ATMOSPHERE_LIMITS.tintMax, Math.max(0, (profile.tintStrength || 0) * strengthScale))
  if (strength > 0.002) {
    state.tintColor.setStyle(rgbStyle(profile.lightTint || '255,255,255'))
    color.lerp(state.tintColor, strength)
  }
  // 闪电是冷白偏蓝的光：放电瞬间把灯光再往这个方向推一点，才像「被外面的闪电照亮」。
  if (flash > 0.01) {
    state.tintColor.setStyle(rgbStyle(LIGHTNING_TINT_RGB))
    color.lerp(state.tintColor, Math.min(0.5, flash * 0.45))
  }
}

/** 五盏灯的颜色一起跟随天气；天空色偏冷、地面反光保留一点暖（真实积水/雪面反光）。 */
function applyLightColors(state: AtmosphereState, profile: WeatherAtmosphereProfile, flash: number) {
  const base = state.baseline as LightBaseline
  const { hemisphereLight, ambientLight, mainDirectionalLight, fillDirectionalLight, topDirectionalLight } =
    state.appCtx
  tintLight(state, hemisphereLight?.color, base.hemisphereSky, profile, 1, flash)
  tintLight(state, hemisphereLight?.groundColor, base.hemisphereGround, profile, 0.45, flash)
  tintLight(state, ambientLight?.color, base.ambientColor, profile, 0.85, flash)
  tintLight(state, mainDirectionalLight?.color, base.mainColor, profile, 0.7, flash)
  tintLight(state, fillDirectionalLight?.color, base.fillColor, profile, 0.9, flash)
  tintLight(state, topDirectionalLight?.color, base.topColor, profile, 0.8, flash)
}

/** 雾：只在降水天气加，密度与颜色都受限，且只影响有 `fog` 标记的材质。 */
function syncFog(state: AtmosphereState, profile: WeatherAtmosphereProfile, flash: number) {
  const scene = state.appCtx.threeScene
  if (!scene) return
  const density = Math.min(
    WEATHER_ATMOSPHERE_LIMITS.fogMax,
    profile.fogDensity * (1 + flash * WEATHER_LIGHTNING_BOOST.fog),
  )
  if (density <= 0.0004) {
    if (scene.fog) scene.fog = null
    return
  }
  if (!scene.fog || scene.fog.isFogExp2 !== true) {
    state.fogColor.setStyle(fogColorFor(profile.fogRgb, flash))
    scene.fog = state.createFog(state.fogColor.getHex(), density)
    return
  }
  scene.fog.color.setStyle(fogColorFor(profile.fogRgb, flash))
  scene.fog.density = density
}

/**
 * 应用一组系数。`flash` 是当前闪电强度（0~1），叠加在系数之上。
 *
 * 边界钳制的是**系数**而不是最终强度：舞台在嵌入模式下会把整套灯光乘 0.5，
 * 用绝对下限去钳「乘完之后」的强度会把环境光从 0.21 抬到 0.45，
 * 等于「天气没生效却整场变亮了」。
 */
function applyProfile(state: AtmosphereState, profile: WeatherAtmosphereProfile, flash: number) {
  if (!state.baseline) captureBaseline(state)
  const base = state.baseline as LightBaseline
  const { hemisphereLight, ambientLight, mainDirectionalLight, fillDirectionalLight, topDirectionalLight } =
    state.appCtx
  const limits = WEATHER_ATMOSPHERE_LIMITS
  const flashGain = clamp(flash, 0, 1)
  /** 系数下限 + 闪电增益 → 实际乘数。 */
  const factorFor = (value: number, min: number, boost: number) => Math.max(min, value) * (1 + flashGain * boost)

  if (hemisphereLight)
    hemisphereLight.intensity =
      base.hemisphere * factorFor(profile.hemisphere, limits.indirectMin, WEATHER_LIGHTNING_BOOST.hemisphere)
  if (ambientLight)
    ambientLight.intensity =
      base.ambient * factorFor(profile.ambient, limits.indirectMin, WEATHER_LIGHTNING_BOOST.ambient)
  if (mainDirectionalLight)
    mainDirectionalLight.intensity = base.main * factorFor(profile.main, limits.mainMin, WEATHER_LIGHTNING_BOOST.main)
  if (fillDirectionalLight)
    fillDirectionalLight.intensity =
      base.fill * factorFor(profile.fill, limits.indirectMin, WEATHER_LIGHTNING_BOOST.fill)
  if (topDirectionalLight)
    topDirectionalLight.intensity = base.top * factorFor(profile.top, limits.indirectMin, WEATHER_LIGHTNING_BOOST.top)
  const renderer = state.appCtx.threeRenderer
  if (renderer)
    renderer.toneMappingExposure =
      base.exposure *
      (clamp(profile.exposure, limits.exposureMin, limits.exposureMax) *
        (1 + flashGain * WEATHER_LIGHTNING_BOOST.exposure))
  syncFog(state, profile, flashGain)
  applyLightColors(state, profile, flashGain)
  reportAtmosphere(state)
}

/**
 * 现场排障的观察窗（与 `renderCalls` / `editorEffects` 同一套做法）：
 * 舞台上「天气没生效」时，先看这几个值有没有动，就能区分是消息没到、还是光照没叠。
 * `weatherTint` 是主方向光的实际颜色 —— 亮度变化看不见色温，这个值才看得出「天变了」。
 */
function reportAtmosphere(state: AtmosphereState) {
  const renderer = state.appCtx.threeRenderer
  const domElement = renderer?.domElement
  if (!renderer || !domElement) return
  domElement.dataset.weatherExposure = renderer.toneMappingExposure.toFixed(3)
  domElement.dataset.weatherFog = (state.appCtx.threeScene?.fog?.density ?? 0).toFixed(4)
  domElement.dataset.weatherTint = colorHex(state.appCtx.mainDirectionalLight?.color, 0xffffff)
    .toString(16)
    .padStart(6, '0')
}

/** 一次控制器会话的可变状态。 */
type AtmosphereSession = {
  state: AtmosphereState
  requestRender: () => void
  schedule: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>
  cancel: (handle: ReturnType<typeof setTimeout>) => void
  applied: WeatherAtmosphereProfile
  key: string
  transitionTimer: ReturnType<typeof setTimeout> | null
  flashTimers: ReturnType<typeof setTimeout>[]
  /** 上一次因闪电触发的重绘时刻（`performance.now()`），用于中间步骤节流。 */
  lastFlashRenderAt: number
  disposed: boolean
}

function clearSessionTimers(session: AtmosphereSession) {
  if (session.transitionTimer !== null) session.cancel(session.transitionTimer)
  for (const handle of session.flashTimers) session.cancel(handle)
  session.transitionTimer = null
  session.flashTimers = []
}

/**
 * 天气切换：从「当前已应用」缓入缓出到目标，4 步。
 *
 * 缓入缓出是必要的：阴云压过来是「先慢后快」，线性过渡看起来像有人在拉滑块。
 */
function startTransition(session: AtmosphereSession, target: WeatherAtmosphereProfile) {
  if (session.transitionTimer !== null) session.cancel(session.transitionTimer)
  const from = session.applied
  let step = 0
  const stepOnce = () => {
    if (session.disposed) return
    step += 1
    const amount = step / TRANSITION_STEPS
    session.applied = lerpProfile(from, target, amount * amount * (3 - 2 * amount))
    applyProfile(session.state, session.applied, 0)
    session.requestRender()
    if (step < TRANSITION_STEPS) session.transitionTimer = session.schedule(stepOnce, TRANSITION_MS / TRANSITION_STEPS)
    else {
      session.applied = target
      session.transitionTimer = null
    }
  }
  stepOnce()
}

/**
 * 一次放电：按与 2D 闪电层**同一条包络**（`weatherFlashEnvelope`）分几步提亮。
 *
 * 两边共用包络是必须的：各写一套衰减时，2D 闪电已经暗下去而房间还亮着，
 * 或者反过来，观感会立刻「不在一场雷雨里」。
 *
 * 每一步都要一次整帧渲染，所以步数就是成本：
 * - 只有 3 步（起亮 → 半衰减 → 精确归零）；
 * - 归零那一步永远执行 —— 否则房间会停在闪光状态上。
 */
function fireStrike(session: AtmosphereSession, intensity: unknown) {
  const gain = clamp(typeof intensity === 'number' && Number.isFinite(intensity) ? intensity : 1, 0, 1)
  for (const handle of session.flashTimers) session.cancel(handle)
  session.flashTimers = FLASH_SAMPLE_POINTS.map((sample) =>
    session.schedule(() => {
      if (session.disposed) return
      // `sample.seconds === null` 表示「本次放电结束」：直接按 0 应用，保证精确回到基线，
      // 而不是让包络里那点余辉（~0.03）把曝光与色温永久顶高一点。
      applyProfile(
        session.state,
        session.applied,
        sample.seconds === null ? 0 : weatherFlashEnvelope(sample.seconds, gain),
      )
      // 中间步骤做节流：两次重绘挨得太近时跳过这次（数值已经写在灯上，下一步会一起生效）。
      // 归零步骤永远重绘 —— 不重绘的话房间会停在闪光状态上。
      const nowMs = performance.now()
      const isFinal = sample.seconds === null
      if (!isFinal && nowMs - session.lastFlashRenderAt < FLASH_MIN_RENDER_GAP_MS) return
      session.lastFlashRenderAt = nowMs
      session.requestRender()
    }, sample.delayMs),
  )
}

export function createWeatherAtmosphereController({
  appCtx,
  THREE: three,
  requestRender,
  schedule = (callback, delayMs) => setTimeout(callback, delayMs),
  cancel = (handle) => clearTimeout(handle),
}: WeatherAtmosphereControllerOptions) {
  const session: AtmosphereSession = {
    state: {
      appCtx,
      fogColor: new three.Color(),
      tintColor: new three.Color(),
      createFog: (color, density) => new three.FogExp2(color, density),
      baseline: null,
    },
    requestRender,
    schedule,
    cancel,
    applied: NEUTRAL_WEATHER_ATMOSPHERE,
    key: '',
    transitionTimer: null,
    flashTimers: [],
    lastFlashRenderAt: 0,
    disposed: false,
  }

  return {
    /** 当前天气键（空串 = 无天气）。 */
    get key() {
      return session.key
    },
    /**
     * 基础光照被重写之后调用（`refreshBaseLighting` 末尾）：重新取基线并把天气系数叠回去。
     *
     * 不这么做的话，用户在编辑器里改一次灯光、或场景重建一次，天气就「丢」了 ——
     * 灯回到满亮，雨还在下，整幅画面立刻自相矛盾。
     */
    refreshBaseline() {
      if (session.disposed) return
      captureBaseline(session.state)
      applyProfile(session.state, session.applied, 0)
      requestRender()
    },
    /** 同步天气键；同键直接返回，不触发任何重绘。 */
    setWeather(weatherKey: unknown) {
      if (session.disposed) return
      const nextKey = typeof weatherKey === 'string' ? weatherKey : ''
      if (nextKey === session.key) return
      session.key = nextKey
      startTransition(session, weatherAtmosphereProfile(nextKey))
    },
    /** 一次放电：让整个房间亮一下（与 2D 闪电共用一条包络）。 */
    pulseStrike(intensity: unknown) {
      if (!session.disposed) fireStrike(session, intensity)
    },
    dispose() {
      if (session.disposed) return
      session.disposed = true
      clearSessionTimers(session)
      // 回退到基线：SPA 内离开舞台时不能把「雷雨的光」留在下一次进入的界面上。
      session.key = ''
      session.applied = NEUTRAL_WEATHER_ATMOSPHERE
      if (session.state.baseline) applyProfile(session.state, session.applied, 0)
      session.state.baseline = null
    },
  }
}

export type WeatherAtmosphereController = ReturnType<typeof createWeatherAtmosphereController>
