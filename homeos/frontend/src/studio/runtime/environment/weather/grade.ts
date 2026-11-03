/**
 * 全屏调色与暗角。
 *
 * 只做「染」不做「盖」：alpha 控制在 0.1 以内，让 3D 场景本身的明暗与设备状态依旧可读。
 * 雷电闪光也在这里叠加，和白闪一起构成「闪一下整个画面」的观感。
 */
import type { WeatherFrame } from "./frame";
import type { WeatherGradeTone } from "./presets";

const GRADE_RGB: Readonly<Record<WeatherGradeTone, string>> = Object.freeze({
  warm: "255,196,128",
  cool: "150,180,214",
  overcast: "148,156,168",
  night: "40,64,120",
  amber: "255,170,96",
  storm: "104,120,164",
});

/** 闪光叠加的强度上限：再高就会盖住宿主画面。 */
const FLASH_OVERLAY_ALPHA = 0.07;

export function createGradeRenderer() {
  let vignetteKey = "";
  let vignette: CanvasGradient | null = null;

  function ensureVignette(frame: WeatherFrame) {
    const key = `${Math.round(frame.width)}x${Math.round(frame.height)}`;
    if (key === vignetteKey && vignette) return vignette;
    vignetteKey = key;
    const radius = Math.hypot(frame.width, frame.height) * 0.62;
    vignette = frame.ctx.createRadialGradient(
      frame.width / 2,
      frame.height / 2,
      radius * 0.42,
      frame.width / 2,
      frame.height / 2,
      radius,
    );
    vignette.addColorStop(0, "rgba(0,0,0,0)");
    vignette.addColorStop(1, "rgba(0,0,0,1)");
    return vignette;
  }

  return {
    draw(frame: WeatherFrame) {
      const { ctx, width, height } = frame;
      const tone = frame.preset.grade;
      const toneAlpha = frame.preset.gradeAlpha ?? 0.06;
      ctx.save();
      if (tone && toneAlpha > 0) {
        // 闪电瞬间把整体色温再压亮一点，配合湿地反光形成「被照到」的感觉。
        ctx.globalAlpha = Math.min(0.16, toneAlpha * (1 + frame.flash * 0.9));
        ctx.fillStyle = `rgba(${GRADE_RGB[tone]},1)`;
        ctx.fillRect(0, 0, width, height);
      }
      if (frame.flash > 0.01) {
        ctx.globalAlpha = frame.flash * FLASH_OVERLAY_ALPHA;
        ctx.fillStyle = "rgba(255,252,240,1)";
        ctx.fillRect(0, 0, width, height);
      }
      const vignetteStrength = frame.preset.vignette || 0;
      if (vignetteStrength > 0) {
        ctx.globalAlpha = vignetteStrength;
        ctx.fillStyle = ensureVignette(frame);
        ctx.fillRect(0, 0, width, height);
      }
      ctx.restore();
    },
    reset() {
      vignetteKey = "";
      vignette = null;
    },
  };
}
