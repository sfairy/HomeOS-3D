/**
 * 天气粒子池：降水按**三档景深**分开存（远 / 中 / 近），地面水花单独一段。
 *
 * 为什么要分档：同一种天气里，远处的雨是细密低透明的，近处的雨少而粗，还会带柔焦。
 * 混在一个池里就只能画成一张「雨帘贴纸」，这正是之前效果不够电影感的主因。
 *
 * 位置全部用 0~1 归一化，尺寸/速度用 `z`（0 远 ~ 1 近）拉开层次。
 */

export type WeatherParticle = {
  x: number;
  y: number;
  z: number;
  seed: number;
  size: number;
};

/** 一片落叶：额外带自旋与横向漂移速度。 */
export type LeafParticle = WeatherParticle & {
  spin: number;
  drift: number;
};

/**
 * 一次落地水花。
 *
 * `x/y` 已经是归一化屏幕坐标（由地面四边形插值而来），`depth` 是屏幕纵向的远近系数，
 * `weight` 用来区分雨滴（0）与冰雹（1）—— 冰雹的涟漪更大、还会弹一下。
 */
export type SplashEvent = {
  active: boolean;
  x: number;
  y: number;
  depth: number;
  age: number;
  life: number;
  seed: number;
  weight: number;
};

export type WeatherParticlePool = {
  rainFar: WeatherParticle[];
  rainMid: WeatherParticle[];
  rainNear: WeatherParticle[];
  snowFar: WeatherParticle[];
  snowNear: WeatherParticle[];
  hail: WeatherParticle[];
  wind: WeatherParticle[];
  leaves: LeafParticle[];
  stars: WeatherParticle[];
  splashes: SplashEvent[];
};

/** 各池上限。同一天气里多档同时出现时也共用这些上限，不会叠加到失控。 */
export const RAIN_FAR_PARTICLES = 380;
export const RAIN_MID_PARTICLES = 260;
export const RAIN_NEAR_PARTICLES = 90;
export const SNOW_FAR_PARTICLES = 300;
export const SNOW_NEAR_PARTICLES = 140;
export const HAIL_PARTICLES = 200;
export const WIND_STREAKS = 36;
export const LEAF_PARTICLES = 22;
export const STAR_PARTICLES = 150;
export const SPLASH_EVENTS = 200;

const RANDOM = (from: number, to: number) => from + Math.random() * (to - from);

function createParticles(count: number, minSize: number, maxSize: number): WeatherParticle[] {
  return Array.from({ length: count }, () => ({
    x: Math.random(),
    y: Math.random(),
    z: RANDOM(0.25, 1),
    seed: RANDOM(0, Math.PI * 2),
    size: RANDOM(minSize, maxSize),
  }));
}

function createLeaves(): LeafParticle[] {
  return createParticles(LEAF_PARTICLES, 0.6, 1.2).map((leaf) => ({
    ...leaf,
    spin: RANDOM(-2.4, 2.4),
    drift: RANDOM(0.5, 1.4),
  }));
}

function createSplashes(): SplashEvent[] {
  return Array.from({ length: SPLASH_EVENTS }, () => ({
    active: false,
    x: 0,
    y: 0,
    depth: 0,
    age: 0,
    life: 0,
    seed: 0,
    weight: 0,
  }));
}

export function createParticlePool(): WeatherParticlePool {
  const stars = createParticles(STAR_PARTICLES, 0.55, 2.3);
  // 星点只铺在画面上半部分，压到天空层能覆盖的高度以内。
  for (const star of stars) star.y *= 0.5;
  return {
    rainFar: createParticles(RAIN_FAR_PARTICLES, 0.4, 1.2),
    rainMid: createParticles(RAIN_MID_PARTICLES, 0.6, 2.1),
    rainNear: createParticles(RAIN_NEAR_PARTICLES, 1, 3.1),
    snowFar: createParticles(SNOW_FAR_PARTICLES, 0.5, 1.3),
    snowNear: createParticles(SNOW_NEAR_PARTICLES, 1, 3.1),
    hail: createParticles(HAIL_PARTICLES, 0.7, 2.2),
    wind: createParticles(WIND_STREAKS, 0.4, 1),
    leaves: createLeaves(),
    stars,
    splashes: createSplashes(),
  };
}

export function disposeParticlePool(pool: WeatherParticlePool) {
  for (const layerName of [
    "rainFar",
    "rainMid",
    "rainNear",
    "snowFar",
    "snowNear",
    "hail",
    "wind",
    "leaves",
    "stars",
    "splashes",
  ] as const)
    pool[layerName].length = 0;
}
