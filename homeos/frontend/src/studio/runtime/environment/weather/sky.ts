/**
 * 天空底色。
 *
 * 只画「顶部一层色 + 地平线一条光」，不做整屏压暗：3D 场景本身的明暗与设备状态
 * 必须继续可读。星点、日月、云层各有独立模块，这里只负责大气的底色。
 */
import type { WeatherFrame } from "./frame";
import { quadVerticalRange } from "./ground-quad";
import { SKY_MAX_ALPHA, SKY_MAX_STOP, clampAlpha } from "./overlay-caps";
import type { WeatherSkyTone } from "./presets";

type SkyTone = {
  /** `r,g,b` 片段，拼进 `rgba()`。 */
  rgb: string;
  /** 靠近地平线的一档色（更浅更亮）；缺省沿用 `rgb`。 */
  toRgb?: string;
  alpha: number;
  /** 渐隐结束位置（占画面高度比例）。 */
  stop: number;
  /** 地平线那条光的颜色；缺省表示不画。 */
  horizonRgb?: string;
};

const SKY_TONES: Readonly<Record<WeatherSkyTone, SkyTone>> = Object.freeze({
  // 晴天：从顶上饱和的天蓝过渡到地平线附近的浅蓝，云才显得「浮在天上」。
  // 3D 场景底色偏暗，蓝色必须给足 alpha 才「蓝得出来」，所以这里高于夜间档。
  blue: {
    rgb: "52,138,240",
    toRgb: "150,205,246",
    alpha: 0.46,
    stop: 0.42,
    horizonRgb: "206,228,246",
  },
  // 多云：蓝色淡一档，留出被云占掉的空间。
  dayblue: {
    rgb: "78,152,232",
    toRgb: "168,210,246",
    alpha: 0.4,
    stop: 0.42,
    horizonRgb: "210,230,246",
  },
  warm: { rgb: "255,214,150", alpha: 0.18, stop: 0.5, horizonRgb: "255,206,140" },
  soft: { rgb: "198,212,226", alpha: 0.15, stop: 0.46, horizonRgb: "214,226,238" },
  overcast: { rgb: "148,160,172", alpha: 0.24, stop: 0.56 },
  night: { rgb: "16,28,56", alpha: 0.32, stop: 0.62, horizonRgb: "42,66,112" },
  alert: { rgb: "255,176,90", alpha: 0.15, stop: 0.5, horizonRgb: "236,158,92" },
  storm: { rgb: "58,64,80", alpha: 0.2, stop: 0.55 },
});

export function createSkyRenderer() {
  let gradientKey = "";
  let gradient: CanvasGradient | null = null;

  function ensureGradient(frame: WeatherFrame, toneName: WeatherSkyTone, tone: SkyTone) {
    const key = `${toneName}:${Math.round(frame.width)}x${Math.round(frame.height)}`;
    if (key !== gradientKey || !gradient) {
      gradientKey = key;
      // 天空只染顶部一条，且必须在 `SKY_MAX_STOP` 之前完全淡出，不能压到户型主体。
      const stop = Math.min(SKY_MAX_STOP, tone.stop);
      const alpha = clampAlpha(tone.alpha, SKY_MAX_ALPHA);
      gradient = frame.ctx.createLinearGradient(0, 0, 0, frame.height * stop);
      gradient.addColorStop(0, `rgba(${tone.rgb},${alpha})`);
      gradient.addColorStop(0.62, `rgba(${tone.toRgb || tone.rgb},${alpha * 0.62})`);
      gradient.addColorStop(1, `rgba(${tone.toRgb || tone.rgb},0)`);
    }
    return gradient;
  }

  function drawSky(frame: WeatherFrame, tone: SkyTone) {
    const toneName = frame.preset.sky;
    if (!toneName) return;
    const stop = Math.min(SKY_MAX_STOP, tone.stop);
    frame.ctx.save();
    frame.ctx.fillStyle = ensureGradient(frame, toneName, tone);
    frame.ctx.fillRect(0, 0, frame.width, Math.ceil(frame.height * stop));
    frame.ctx.restore();
  }

  /** 地平线光：落在地面远端，把「天空」与「地面」缝在一起，避免上下两块割裂。 */
  function drawHorizon(frame: WeatherFrame, tone: SkyTone) {
    if (!tone.horizonRgb) return;
    // 地面四边形的上沿就是「最远处的地板」，地平线光落在这里最自然。
    const [farY] = quadVerticalRange(frame.ground);
    const horizonY = Math.max(frame.height * 0.28, Math.min(frame.height * 0.82, farY * frame.height));
    const bandHeight = frame.height * 0.09;
    const horizonAlpha = clampAlpha(tone.alpha * 0.85, SKY_MAX_ALPHA * 0.6);
    const { ctx, width } = frame;
    ctx.save();
    const haze = ctx.createLinearGradient(0, horizonY - bandHeight, 0, horizonY + bandHeight);
    haze.addColorStop(0, `rgba(${tone.horizonRgb},0)`);
    haze.addColorStop(0.5, `rgba(${tone.horizonRgb},${horizonAlpha})`);
    haze.addColorStop(1, `rgba(${tone.horizonRgb},0)`);
    ctx.fillStyle = haze;
    ctx.fillRect(0, horizonY - bandHeight, width, bandHeight * 2);
    ctx.restore();
  }

  return {
    draw(frame: WeatherFrame) {
      const toneName = frame.preset.sky;
      if (!toneName) return;
      const tone = SKY_TONES[toneName];
      if (!tone) return;
      drawSky(frame, tone);
      drawHorizon(frame, tone);
    },
    reset() {
      gradientKey = "";
      gradient = null;
    },
  };
}
