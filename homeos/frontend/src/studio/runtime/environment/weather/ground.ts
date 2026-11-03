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
import type { WeatherFrame } from "./frame";
import { pointOnQuad, quadVerticalRange } from "./ground-quad";
import type { SplashEvent } from "./particles";

const TAU = Math.PI * 2;
/** 强度 1 时的每秒溅射次数。 */
const SPLASH_PER_SECOND = 34;
/** 涟漪与溅射的生命周期（秒）。 */
const RIPPLE_LIFE = 0.62;
/** 溅射水珠只在最初这段时间可见（再往后就落回地面了）。 */
const DROPLET_SECONDS = 0.2;
/** 地面椭圆的透视压扁比例。 */
const RIPPLE_FLATTEN = 0.34;
/** 湿地 / 积雪的收敛速度：湿地快、积雪慢（20~40 秒才铺白）。 */
const WET_CONVERGE = 2.2;
const SNOW_CONVERGE = 0.06;

type GroundState = {
  spawnAccumulator: number;
  spawnCursor: number;
  wetLevel: number;
  snowCover: number;
};

function traceGroundPath(frame: WeatherFrame) {
  const { ctx, ground, width, height } = frame;
  const [firstPoint, ...restPoints] = ground;
  ctx.beginPath();
  ctx.moveTo(firstPoint[0] * width, firstPoint[1] * height);
  for (const point of restPoints) ctx.lineTo(point[0] * width, point[1] * height);
  ctx.closePath();
}

function spawnSplash(frame: WeatherFrame, state: GroundState) {
  const pool = frame.particles.splashes;
  if (!pool.length) return;
  const u = Math.random();
  const v = Math.random();
  const depth = 1 - v;
  // 太靠近地平线的点不撒水花：那里地板的真实面积很小，画上去会糊在墙上。
  if (depth < 0.04) return;
  const splash = pool[state.spawnCursor % pool.length];
  state.spawnCursor += 1;
  const [x, y] = pointOnQuad(frame.ground, u, v);
  splash.active = true;
  splash.x = x;
  splash.y = y;
  splash.depth = depth;
  splash.age = 0;
  splash.seed = Math.random() * TAU;
  splash.weight = Math.random() < 0.12 ? 1 : 0;
  splash.life = splash.weight > 0.5 ? RIPPLE_LIFE * 1.25 : RIPPLE_LIFE;
}

function advanceSplashes(frame: WeatherFrame, state: GroundState, strength: number) {
  state.spawnAccumulator += frame.deltaSeconds * strength * SPLASH_PER_SECOND * frame.quality;
  // 单帧最多补 6 朵，避免从后台切回来时一次性喷一屏。
  for (let spawned = 0; state.spawnAccumulator >= 1 && spawned < 6; spawned++) {
    state.spawnAccumulator -= 1;
    spawnSplash(frame, state);
  }
  if (state.spawnAccumulator < 0) state.spawnAccumulator = 0;
  for (const splash of frame.particles.splashes) {
    if (!splash.active) continue;
    splash.age += frame.deltaSeconds;
    if (splash.age >= splash.life) splash.active = false;
  }
}

/** 溅射水珠：3~5 颗沿抛物线弹出，只在最初 0.2 秒可见（之后已落回地面）。 */
function drawDroplets(frame: WeatherFrame, splash: SplashEvent) {
  if (splash.age > DROPLET_SECONDS) return;
  const { ctx, width, height } = frame;
  const scale = (0.45 + splash.depth * 0.85) * (splash.weight > 0.5 ? 1.15 : 1);
  const count = splash.weight > 0.5 ? 5 : 3;
  const fade = 1 - splash.age / DROPLET_SECONDS;
  const travel = splash.age * 30 * scale;
  ctx.fillStyle = `rgba(232,244,255,${0.75 * fade})`;
  for (let index = 0; index < count; index++) {
    const angle = splash.seed + index * 2.399;
    const horizontal = Math.cos(angle) * travel;
    // 竖直方向按重力回落：先上抛再加速下坠。
    const vertical = Math.sin(angle) * travel * 0.8 - 150 * splash.age * splash.age * scale;
    ctx.fillRect(
      splash.x * width + horizontal - 0.7,
      splash.y * height + vertical - 0.7,
      1.4 + scale,
      1.4 + scale,
    );
  }
}

function drawRipple(frame: WeatherFrame, splash: SplashEvent) {
  const { ctx, width, height } = frame;
  const progress = Math.min(1, splash.age / splash.life);
  const scale = 0.45 + splash.depth * 0.85;
  const maxRadius = (splash.weight > 0.5 ? 9 : 13) * scale;
  const radius = 1 + maxRadius * Math.sqrt(progress);
  // 远端（靠近地平线）压低透明度，否则水花会比地板本身还抢眼。
  const distanceFade = 0.25 + splash.depth * 0.75;
  ctx.strokeStyle = `rgba(226,240,255,${(1 - progress) * 0.5 * distanceFade})`;
  ctx.lineWidth = Math.max(0.5, 1.1 * scale);
  ctx.beginPath();
  ctx.ellipse(splash.x * width, splash.y * height, radius, radius * RIPPLE_FLATTEN, 0, 0, TAU);
  ctx.stroke();
}

function drawSplashes(frame: WeatherFrame) {
  const { ctx } = frame;
  ctx.save();
  for (const splash of frame.particles.splashes) {
    if (!splash.active) continue;
    drawRipple(frame, splash);
    drawDroplets(frame, splash);
  }
  ctx.restore();
}

/** 减弱动效时用一组固定的涟漪代替生命周期，画面仍然「落地」但不闪动。 */
function drawStaticSplashes(frame: WeatherFrame) {
  const { ctx, width, height } = frame;
  ctx.save();
  ctx.strokeStyle = "rgba(226,240,255,0.22)";
  ctx.lineWidth = 0.9;
  for (let index = 0; index < 18; index++) {
    const [x, y] = pointOnQuad(frame.ground, (index * 0.618) % 1, (index * 0.383) % 1);
    ctx.beginPath();
    ctx.ellipse(x * width, y * height, 6, 6 * RIPPLE_FLATTEN, 0, 0, TAU);
    ctx.stroke();
  }
  ctx.restore();
}

/** 湿地：地面铺一层底部加权的冷白反光，再叠几条横向高光；雷电时整体提亮。 */
function drawWet(frame: WeatherFrame, wetLevel: number) {
  if (wetLevel <= 0.02) return;
  const { ctx, width, height } = frame;
  const [minY, maxY] = quadVerticalRange(frame.ground);
  const flashBoost = 1 + frame.flash * 1.6;
  ctx.save();
  traceGroundPath(frame);
  ctx.clip();
  const sheen = ctx.createLinearGradient(0, minY * height, 0, maxY * height);
  sheen.addColorStop(0, "rgba(198,214,230,0)");
  sheen.addColorStop(0.55, `rgba(198,214,230,${0.03 * wetLevel * flashBoost})`);
  sheen.addColorStop(1, `rgba(216,232,246,${0.1 * wetLevel * flashBoost})`);
  ctx.fillStyle = sheen;
  ctx.fillRect(0, minY * height, width, (maxY - minY) * height);
  // 横向高光短划：位置缓慢漂移 + 低频闪烁，模拟水面反光。
  const highlightCount = Math.round(10 * frame.quality) + 4;
  ctx.fillStyle = "rgba(236,246,255,0.9)";
  for (let index = 0; index < highlightCount; index++) {
    const phase = frame.elapsedSeconds * 0.22 + index * 1.37;
    const u = (((index * 0.37 + Math.sin(phase) * 0.05) % 1) + 1) % 1;
    const v = 0.25 + ((index * 0.53) % 1) * 0.72;
    const [x, y] = pointOnQuad(frame.ground, u, v);
    ctx.globalAlpha = (0.12 + 0.16 * Math.abs(Math.sin(phase * 2.3))) * wetLevel * flashBoost;
    ctx.fillRect(x * width, y * height, (14 + (index % 4) * 9) * (1 - v * 0.5), 1 + (1 - v));
  }
  ctx.restore();
}

function drawSnowCover(frame: WeatherFrame, snowCover: number) {
  if (snowCover <= 0.004) return;
  const { ctx, width, height } = frame;
  const [minY, maxY] = quadVerticalRange(frame.ground);
  ctx.save();
  traceGroundPath(frame);
  ctx.clip();
  ctx.fillStyle = `rgba(246,250,255,${snowCover})`;
  ctx.fillRect(0, minY * height, width, (maxY - minY) * height);
  ctx.restore();
}

export function createGroundRenderer() {
  const state: GroundState = {
    spawnAccumulator: 0,
    spawnCursor: 0,
    wetLevel: 0,
    snowCover: 0,
  };

  return {
    draw(frame: WeatherFrame) {
      const targetWet = frame.preset.wet || 0;
      const targetSnow = frame.preset.snowCover || 0;
      const strength = frame.preset.splash || 0;
      if (frame.reducedMotion) {
        // 定格模式下不推进生命周期，但积雪仍然要「已铺好」，否则静态帧看起来没下过雪。
        state.wetLevel = targetWet;
        state.snowCover = targetSnow;
        drawWet(frame, state.wetLevel);
        drawSnowCover(frame, state.snowCover);
        if (strength > 0) drawStaticSplashes(frame);
        return;
      }
      state.wetLevel +=
        (targetWet - state.wetLevel) * Math.min(1, frame.deltaSeconds * WET_CONVERGE);
      state.snowCover +=
        (targetSnow - state.snowCover) * Math.min(1, frame.deltaSeconds * SNOW_CONVERGE);
      if (strength > 0) advanceSplashes(frame, state, strength);
      drawWet(frame, state.wetLevel);
      drawSnowCover(frame, state.snowCover);
      drawSplashes(frame);
    },
    reset() {
      state.spawnAccumulator = 0;
      state.spawnCursor = 0;
      state.wetLevel = 0;
      state.snowCover = 0;
    },
  };
}
