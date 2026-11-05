/**
 * 天气粒子池：雨按**三档景深**分开存（远 / 中 / 近），雪分远近两档，地面水花单独一段。
 *
 * 为什么要分档：同一种天气里，远处的雨是细密低透明的，近处的雨少而粗，还会带柔焦。
 * 混在一个池里就只能画成一张「雨帘贴纸」，这正是之前效果不够电影感的主因。
 *
 * 位置全部用 0~1 归一化，尺寸/速度用 `z`（0 远 ~ 1 近）拉开层次。
 */

export type WeatherParticle = {
  x: number
  y: number
  z: number
  seed: number
  size: number
}

/**
 * 一次落地水花。
 *
 * `u/v` 是**地面四边形上的归一化参数**，不是屏幕坐标：每帧绘制前用当前
 * `frame.ground` 重新插值一次，转视角时水花才会跟着地板走而不是冻在屏幕上。
 * `depth` 是屏幕纵向的远近系数（0 远 ~ 1 近）。
 */
export type SplashEvent = {
  active: boolean
  u: number
  v: number
  depth: number
  age: number
  life: number
  seed: number
}

export type WeatherParticlePool = {
  rainFar: WeatherParticle[]
  rainMid: WeatherParticle[]
  rainNear: WeatherParticle[]
  snowFar: WeatherParticle[]
  snowNear: WeatherParticle[]
  /** 晴夜星点：`seed` 是各自的闪烁相位，`size` 是半径系数。 */
  stars: WeatherParticle[]
  splashes: SplashEvent[]
}

/** 各池上限。同一天气里多档同时出现时也共用这些上限，不会叠加到失控。 */
export const RAIN_FAR_PARTICLES = 380
export const RAIN_MID_PARTICLES = 260
export const RAIN_NEAR_PARTICLES = 90
export const SNOW_FAR_PARTICLES = 300
export const SNOW_NEAR_PARTICLES = 140
export const STAR_PARTICLES = 160
export const SPLASH_EVENTS = 200

/** 星点只铺在画面上部这个比例内：再往下就压到户型与家具上了。 */
export const STAR_FIELD_HEIGHT = 0.52

const RANDOM = (from: number, to: number) => from + Math.random() * (to - from)

function createParticles(count: number, minSize: number, maxSize: number, zFrom = 0.25, zTo = 1): WeatherParticle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: RANDOM(zFrom, zTo),
    seed: RANDOM(0, Math.PI * 2),
    size: RANDOM(minSize, maxSize),
  }))
}

function createSplashes(): SplashEvent[] {
  return Array.from({ length: SPLASH_EVENTS }, () => ({
    active: false,
    u: 0,
    v: 0,
    depth: 0,
    age: 0,
    life: 0,
    seed: 0,
  }))
}

export function createParticlePool(): WeatherParticlePool {
  const stars = createParticles(STAR_PARTICLES, 0.55, 2.3)
  // 星点只在画面上部：落到底部就会像屏幕上的脏点，也会盖住户型。
  for (const star of stars) star.y *= STAR_FIELD_HEIGHT
  return {
    // 三档景深各占一段 `z`：远雨慢而小、近雨快而大。共用同一段随机区间时
    // 三档速度分布完全重合，景深只剩透明度差异，看起来是一层雨帘。
    rainFar: createParticles(RAIN_FAR_PARTICLES, 0.4, 1.2, 0.1, 0.4),
    rainMid: createParticles(RAIN_MID_PARTICLES, 0.6, 2.1, 0.35, 0.7),
    rainNear: createParticles(RAIN_NEAR_PARTICLES, 1, 3.1, 0.65, 1),
    snowFar: createParticles(SNOW_FAR_PARTICLES, 0.5, 1.3, 0.1, 0.4),
    snowNear: createParticles(SNOW_NEAR_PARTICLES, 1, 3.1, 0.65, 1),
    stars,
    splashes: createSplashes(),
  }
}

export function disposeParticlePool(pool: WeatherParticlePool) {
  for (const layerName of ['rainFar', 'rainMid', 'rainNear', 'snowFar', 'snowNear', 'stars', 'splashes'] as const)
    pool[layerName].length = 0
}
