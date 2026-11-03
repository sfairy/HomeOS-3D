/**
 * 风：风线、阵风带、落叶。
 *
 * 只有风线时，观众看到的是「屏幕在动」；加上被吹起来的落叶与横扫的阵风带，
 * 才能感到**方向性**——这是「大风」和「下雨」在观感上最本质的区别。
 */
import { WEATHER_COLOR } from "./colors";
import type { WeatherFrame } from "./frame";
import { LEAF_PARTICLES, WIND_STREAKS } from "./particles";

/** 阵风带条数。 */
const GUST_BANDS = 3;
export function createWindRenderer() {
  function drawStreaks(frame: WeatherFrame, strength: number) {
    const { ctx, width, height, deltaSeconds } = frame;
    const count = Math.min(WIND_STREAKS, Math.round((6 + strength * 30) * frame.quality));
    ctx.save();
    ctx.strokeStyle = WEATHER_COLOR;
    ctx.lineWidth = 1;
    for (let index = 0; index < count; index++) {
      const streak = frame.particles.wind[index];
      streak.x += deltaSeconds * (0.12 + streak.z * 0.42) * (0.45 + frame.gust);
      if (streak.x > 1.12) {
        streak.x = -0.12;
        streak.y = Math.random();
      }
      const length = (0.05 + streak.z * 0.16) * width;
      ctx.globalAlpha = (0.06 + streak.z * 0.14) * Math.min(1, strength);
      ctx.beginPath();
      ctx.moveTo(streak.x * width, streak.y * height);
      ctx.lineTo(streak.x * width - length, streak.y * height - length * 0.08);
      ctx.stroke();
    }
    ctx.restore();
  }

  /** 阵风带：几条很淡的横向宽带扫过画面，把「一阵风过去」变成可见的。 */
  function drawGustBands(frame: WeatherFrame, strength: number) {
    const { ctx, width, height } = frame;
    ctx.save();
    ctx.fillStyle = WEATHER_COLOR;
    const elapsed = frame.elapsedSeconds;
    for (let index = 0; index < GUST_BANDS; index++) {
      const progress = (elapsed * (0.05 + index * 0.012) + index * 0.37) % 1;
      const bandHeight = height * (0.012 + index * 0.006);
      const bandTop = height * (0.2 + index * 0.14 + Math.sin(elapsed * 0.2 + index) * 0.02);
      ctx.globalAlpha = 0.03 * strength * Math.sin(progress * Math.PI);
      ctx.fillRect((progress - 0.3) * width * 1.4, bandTop, width * 0.7, bandHeight);
    }
    ctx.restore();
  }

  function drawLeaves(frame: WeatherFrame, strength: number) {
    const leafSprite = frame.sprites.leafSprite();
    if (!leafSprite) return;
    const { ctx, width, height, deltaSeconds } = frame;
    const count = Math.min(LEAF_PARTICLES, Math.round(LEAF_PARTICLES * strength * frame.quality));
    ctx.save();
    for (let index = 0; index < count; index++) {
      const leaf = frame.particles.leaves[index];
      leaf.y += deltaSeconds * (0.055 + leaf.z * 0.06);
      leaf.x +=
        deltaSeconds *
        (0.09 * leaf.drift * (0.6 + frame.gust) + Math.sin(frame.elapsedSeconds * 1.4 + leaf.seed) * 0.03);
      if (leaf.y > 1.06 || leaf.x > 1.08) {
        leaf.y = -0.06;
        leaf.x = Math.random() * 0.9 - 0.1;
      }
      const size = width * (0.012 + leaf.size * 0.016);
      ctx.save();
      ctx.translate(leaf.x * width, leaf.y * height);
      ctx.rotate(frame.elapsedSeconds * leaf.spin + leaf.seed);
      ctx.globalAlpha = 0.55 + leaf.z * 0.35;
      ctx.drawImage(leafSprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
    ctx.restore();
  }

  return {
    draw(frame: WeatherFrame) {
      const preset = frame.preset;
      const strength = Math.max(preset.wind || 0, frame.windSpeed);
      if (strength > 0.02) {
        drawGustBands(frame, strength);
        drawStreaks(frame, strength);
      }
      if ((preset.leaves || 0) > 0) drawLeaves(frame, preset.leaves || 0);
    },
    reset() {},
  };
}
