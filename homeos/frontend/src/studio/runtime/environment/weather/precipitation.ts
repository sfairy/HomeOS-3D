import { WEATHER_COLOR } from "./colors";
import type { WeatherFrame } from "./frame";
import {
  HAIL_PARTICLES,
  RAIN_FAR_PARTICLES,
  RAIN_MID_PARTICLES,
  RAIN_NEAR_PARTICLES,
  SNOW_FAR_PARTICLES,
  SNOW_NEAR_PARTICLES,
  type WeatherParticle,
} from "./particles";

const TAU = Math.PI * 2;
/** 雨丝基础长度（CSS px），随景深与 `rainScale` 放大。 */
const RAIN_BASE_STREAK = 12;
const RAIN_DEPTH_STREAK = 28;
/** 风把雨丝吹斜的最大水平位移。 */
const MAX_RAIN_TILT = 30;

function rainTilt(windSpeed: number, gust: number) {
  return Math.min(MAX_RAIN_TILT, 2 + windSpeed * (MAX_RAIN_TILT - 2) * (0.55 + gust * 0.65));
}

/** 贴图档位：0 / 10 / 20 / 30 px 四档，取最近的即可。 */
function tiltBucket(tilt: number) {
  return Math.max(0, Math.min(3, Math.round(tilt / 10)));
}

type RainLayerConfig = {
  count: number;
  speed: number;
  length: number;
  alpha: number;
  drift: number;
  tiltIndex: number;
};

function advanceAndDrawRain(
  frame: WeatherFrame,
  particles: WeatherParticle[],
  config: RainLayerConfig,
) {
  const { ctx, width, height, deltaSeconds } = frame;
  const sprite = frame.sprites.rainSprite(config.tiltIndex);
  if (!sprite) return;
  const drawWidth = (config.length * sprite.width) / sprite.height;
  for (let index = 0; index < config.count; index++) {
    const drop = particles[index];
    drop.y += deltaSeconds * (0.55 + drop.z * 0.75) * config.speed;
    drop.x += deltaSeconds * config.drift * drop.z;
    if (drop.y > 1.04) {
      drop.y = -0.04;
      drop.x = Math.random();
    }
    if (drop.x > 1.06) drop.x -= 1.12;
    else if (drop.x < -0.06) drop.x += 1.12;
    ctx.globalAlpha = config.alpha * (0.55 + drop.z * 0.45);
    ctx.drawImage(
      sprite,
      drop.x * width - drawWidth / 2,
      drop.y * height - config.length,
      drawWidth,
      config.length,
    );
  }
}

function drawRain(frame: WeatherFrame, tiltIndex: number) {
  const preset = frame.preset;
  const rain = preset.rain || 0;
  const scale = preset.rainScale || 1;
  const speed = preset.rainSpeed || 1;
  const depth = preset.rainDepth ?? 0.5;
  const budget = frame.density * frame.quality;
  const drift = tiltIndex * 2.4 * 0.35;
  // 远：细密低透明，量大；中：主视觉；近：少量、粗、带柔焦（贴图本身是渐隐尾）。
  advanceAndDrawRain(frame, frame.particles.rainFar, {
    count: Math.min(RAIN_FAR_PARTICLES, Math.floor(rain * 260 * budget)),
    speed: speed * 0.8,
    length: (RAIN_BASE_STREAK + 8 * scale) * 0.7,
    alpha: 0.22,
    drift: drift * 0.6,
    tiltIndex,
  });
  advanceAndDrawRain(frame, frame.particles.rainMid, {
    count: Math.min(RAIN_MID_PARTICLES, Math.floor(rain * 150 * budget)),
    speed,
    length: RAIN_BASE_STREAK + 16 * scale,
    alpha: 0.4,
    drift,
    tiltIndex,
  });
  advanceAndDrawRain(frame, frame.particles.rainNear, {
    count: Math.min(RAIN_NEAR_PARTICLES, Math.floor(rain * 90 * depth * budget)),
    speed: speed * 1.25,
    length: RAIN_BASE_STREAK + RAIN_DEPTH_STREAK * scale,
    alpha: 0.55,
    drift: drift * 1.4,
    tiltIndex,
  });
}

function drawSnowFlake(
  frame: WeatherFrame,
  flake: WeatherParticle,
  soft: HTMLCanvasElement | null,
  scale: number,
) {
  const { ctx, width, height, deltaSeconds } = frame;
  // 雪花边落边左右飘，飘的相位由 seed 固定，同一片雪花不会跳相。
  flake.y += deltaSeconds * (0.03 + flake.z * 0.08);
  flake.x += deltaSeconds * flake.z * Math.sin(frame.elapsedSeconds * 0.8 + flake.seed) * 0.03;
  if (flake.y > 1.03) {
    flake.y = -0.03;
    flake.x = Math.random();
  }
  flake.x = ((flake.x % 1) + 1) % 1;
  const radius = flake.size * flake.z * scale;
  if (!soft) {
    ctx.globalAlpha = 0.25 + flake.z * 0.4;
    ctx.beginPath();
    ctx.arc(flake.x * width, flake.y * height, radius, 0, TAU);
    ctx.fill();
    return;
  }
  // 近景雪花用柔光贴图：硬边圆点在大直径下很像「白纸屑」。
  const size = radius * 7.5;
  ctx.globalAlpha = 0.3 + flake.z * 0.5;
  ctx.drawImage(soft, flake.x * width - size / 2, flake.y * height - size / 2, size, size);
}

function drawSnow(frame: WeatherFrame) {
  const snow = frame.preset.snow || 0;
  const scale = frame.preset.snowScale || 1;
  const budget = frame.density * frame.quality;
  const soft = snow > 0 ? frame.sprites.glowSprite("255,250,238") : null;
  const farCount = Math.min(SNOW_FAR_PARTICLES, Math.floor(snow * 210 * budget));
  const nearCount = Math.min(SNOW_NEAR_PARTICLES, Math.floor(snow * 110 * budget));
  frame.ctx.fillStyle = WEATHER_COLOR;
  for (let index = 0; index < farCount; index++)
    drawSnowFlake(frame, frame.particles.snowFar[index], null, scale * 0.75);
  for (let index = 0; index < nearCount; index++)
    drawSnowFlake(frame, frame.particles.snowNear[index], soft, scale);
}

function drawHail(frame: WeatherFrame, tiltIndex: number) {
  const { ctx, width, height, deltaSeconds } = frame;
  const count = Math.min(
    HAIL_PARTICLES,
    Math.floor((frame.preset.hail || 0) * 200 * frame.density * frame.quality),
  );
  const sprite = frame.sprites.rainSprite(tiltIndex);
  for (let index = 0; index < count; index++) {
    const stone = frame.particles.hail[index];
    // 冰雹比雨快得多，且不带长拖尾，靠短亮条与雪花区分。
    stone.y += deltaSeconds * (0.9 + stone.z * 1.2);
    if (stone.y > 1.04) {
      stone.y = -0.04;
      stone.x = Math.random();
    }
    const length = 5 + stone.z * 9;
    ctx.globalAlpha = 0.4 + stone.z * 0.5;
    if (sprite) {
      const drawWidth = (length * sprite.width) / sprite.height;
      ctx.drawImage(
        sprite,
        stone.x * width - drawWidth / 2,
        stone.y * height - length,
        drawWidth,
        length,
      );
    } else {
      ctx.fillRect(stone.x * width, stone.y * height - length, 1.4, length);
    }
  }
}

/** 按预设渲染雨、雪、冰雹；三者可以同时出现（雨夹雪 / 冰雹伴小雨）。 */
export function drawPrecipitation(frame: WeatherFrame) {
  const preset = frame.preset;
  const tilt = rainTilt(Math.max(frame.windSpeed, preset.wind || 0), frame.gust);
  const tiltIndex = tiltBucket(tilt);
  frame.ctx.save();
  frame.ctx.strokeStyle = WEATHER_COLOR;
  frame.ctx.fillStyle = WEATHER_COLOR;
  if (preset.rain) drawRain(frame, tiltIndex);
  if (preset.snow) drawSnow(frame);
  if (preset.hail) drawHail(frame, tiltIndex);
  frame.ctx.restore();
  frame.ctx.globalAlpha = 1;
}
