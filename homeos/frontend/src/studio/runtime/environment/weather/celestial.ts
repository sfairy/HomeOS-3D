/**
 * 星空层：星点、星芒与流星。
 *
 * 不做太阳、不做月亮 —— 这两个天体在 3D 场景里会抢主体，而且白天/夜里的
 * 「光源位置」会和真实户型朝向打架。晴夜的情绪交给**会闪的星**：
 * 每颗星有独立相位慢闪，最亮的一档带十字星芒与柔光晕，再加一条极淡的银河带，
 * 这样夜间画面即使只有深蓝底也不会显得空。
 */
import type { WeatherFrame } from "./frame";

const TAU = Math.PI * 2;
/** 流星：首次出现前的等待区间与飞行时长。 */
const METEOR_FIRST_DELAY = { min: 6, max: 11 };
const METEOR_GAP = { min: 8, max: 14 };
const METEOR_LIFE = 0.95;
/** 星芒：只有最亮的一档才画，否则整片天空会变成「星星贴纸」。 */
const SPARKLE_SIZE_THRESHOLD = 2;

const RANDOM = (from: number, to: number) => from + Math.random() * (to - from);

type MeteorState = {
  /** 已飞行时长；≥ `METEOR_LIFE` 表示当前没有流星。 */
  age: number;
  x: number;
  y: number;
  tilt: number;
  nextIn: number;
};

/**
 * 闪烁包络：两个不可通约的频率叠一层慢呼吸，避免所有星「一起呼吸」。
 * 返回值 0~1，`seed` 让每颗星相位错开。
 */
function twinkle(elapsedSeconds: number, seed: number) {
  const fast = Math.sin(elapsedSeconds * 2.1 + seed * 3.1);
  const slow = Math.sin(elapsedSeconds * 0.7 + seed);
  return 0.5 + 0.32 * fast + 0.18 * slow;
}

/** 银河带：一条极淡的斜向亮带，只在星空足够强时出现。 */
function drawStarBand(frame: WeatherFrame, strength: number) {
  const { ctx, width, height } = frame;
  const band = ctx.createLinearGradient(0, 0, width, height * 0.9);
  band.addColorStop(0, "rgba(120,148,214,0)");
  band.addColorStop(0.45, `rgba(148,172,232,${0.05 * strength})`);
  band.addColorStop(0.62, `rgba(186,204,246,${0.04 * strength})`);
  band.addColorStop(1, "rgba(120,148,214,0)");
  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = band;
  ctx.fillRect(0, 0, width, height * 0.72);
  ctx.restore();
}

/** 十字星芒：横竖两条渐隐细线，亮度跟闪烁走。 */
function drawSparkle(frame: WeatherFrame, x: number, y: number, arm: number, alpha: number) {
  const { ctx } = frame;
  const gradient = ctx.createLinearGradient(x - arm, y, x + arm, y);
  gradient.addColorStop(0, "rgba(255,252,236,0)");
  gradient.addColorStop(0.5, `rgba(255,252,236,${alpha})`);
  gradient.addColorStop(1, "rgba(255,252,236,0)");
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 0.9;
  ctx.beginPath();
  ctx.moveTo(x - arm, y);
  ctx.lineTo(x + arm, y);
  ctx.moveTo(x, y - arm);
  ctx.lineTo(x, y + arm);
  ctx.stroke();
}

function drawStars(frame: WeatherFrame, strength: number) {
  if (strength <= 0.02) return;
  const { ctx, width, height } = frame;
  const starList = frame.particles.stars;
  const count = Math.min(
    starList.length,
    Math.round(starList.length * Math.min(1.4, strength) * frame.quality),
  );
  const starHalo = frame.sprites.glowSprite("255,250,232");
  drawStarBand(frame, strength);
  ctx.save();
  ctx.fillStyle = "#fff8e6";
  for (let index = 0; index < count; index++) {
    const star = starList[index];
    const glow = twinkle(frame.elapsedSeconds, star.seed);
    const x = star.x * width;
    const y = star.y * height;
    ctx.globalAlpha = Math.max(0.08, glow * 0.95 * Math.min(1, strength));
    ctx.beginPath();
    ctx.arc(x, y, star.size * 0.6, 0, TAU);
    ctx.fill();
    if (star.size <= SPARKLE_SIZE_THRESHOLD) continue;
    // 最亮的一档：柔光晕 + 十字星芒，闪烁时一起明灭，才有「眨眼」的观感。
    if (starHalo) {
      const halo = star.size * 16;
      ctx.globalAlpha = glow * 0.4 * Math.min(1, strength);
      ctx.drawImage(starHalo, x - halo / 2, y - halo / 2, halo, halo);
    }
    drawSparkle(frame, x, y, star.size * 4.2, glow * 0.5 * Math.min(1, strength));
  }
  ctx.restore();
}

function drawMeteor(frame: WeatherFrame, meteor: MeteorState, enabled: boolean) {
  if (!enabled) {
    meteor.age = METEOR_LIFE;
    return;
  }
  if (meteor.age >= METEOR_LIFE) {
    meteor.nextIn -= frame.deltaSeconds;
    if (meteor.nextIn > 0) return;
    meteor.age = 0;
    meteor.x = RANDOM(0.1, 0.75);
    meteor.y = RANDOM(0.03, 0.22);
    meteor.tilt = RANDOM(0.18, 0.34);
    meteor.nextIn = RANDOM(METEOR_GAP.min, METEOR_GAP.max);
  }
  meteor.age += frame.deltaSeconds;
  const progress = Math.min(1, meteor.age / METEOR_LIFE);
  const { ctx, width, height } = frame;
  const travel = width * 0.5 * progress;
  const x = meteor.x * width + travel;
  const y = meteor.y * height + travel * meteor.tilt;
  const tail = width * 0.16 * (1 - progress * 0.4);
  ctx.save();
  ctx.globalAlpha = Math.sin(progress * Math.PI) * 0.85;
  ctx.strokeStyle = "#fffdf2";
  ctx.lineWidth = 1.6;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(x, y);
  ctx.lineTo(x - tail, y - tail * meteor.tilt);
  ctx.stroke();
  ctx.restore();
}

export function createCelestialRenderer() {
  const meteor: MeteorState = {
    age: METEOR_LIFE,
    x: 0,
    y: 0,
    tilt: 0,
    nextIn: RANDOM(METEOR_FIRST_DELAY.min, METEOR_FIRST_DELAY.max),
  };

  return {
    draw(frame: WeatherFrame) {
      const preset = frame.preset;
      drawStars(frame, preset.stars || 0);
      drawMeteor(frame, meteor, preset.meteor === true);
    },
    reset() {
      meteor.age = METEOR_LIFE;
      meteor.nextIn = RANDOM(METEOR_FIRST_DELAY.min, METEOR_FIRST_DELAY.max);
    },
  };
}
