/**
 * 雾与霾。
 *
 * 只用十几团同尺寸雾球平移，看起来会像「一层磨砂玻璃」；天气 App 的雾是有层次的：
 * 远处一整条横向雾带吃掉地平线，中景是缓慢翻滚的雾团，近处几乎透明。
 * 所以这里「雾带 + 雾团」两层叠加，雾带按条数换速度。
 */
import type { WeatherFrame } from "./frame";

/** 雾团贴图边长：一张径向渐变，运行时只做 drawImage 位移。 */
const FOG_SPRITE_SIZE = 256;
const FOG_BLOBS = 12;
/** 雾带漂移速度（画面宽度 / 秒），近处更快。 */
const FOG_BAND_SPEEDS = [0.008, 0.015, 0.024] as const;

type FogSprite = {
  canvas: HTMLCanvasElement;
  tint: string;
};

export function createFogRenderer(doc: Document) {
  let sprite: FogSprite | null = null;

  function buildSprite(tint: string): FogSprite | null {
    const canvas = doc.createElement("canvas");
    canvas.width = FOG_SPRITE_SIZE;
    canvas.height = FOG_SPRITE_SIZE;
    const spriteCtx = canvas.getContext("2d");
    if (!spriteCtx) return null;
    const radius = FOG_SPRITE_SIZE / 2;
    const gradient = spriteCtx.createRadialGradient(radius, radius, 0, radius, radius, radius);
    gradient.addColorStop(0, `rgba(${tint},0.55)`);
    gradient.addColorStop(0.55, `rgba(${tint},0.22)`);
    gradient.addColorStop(1, `rgba(${tint},0)`);
    spriteCtx.fillStyle = gradient;
    spriteCtx.fillRect(0, 0, FOG_SPRITE_SIZE, FOG_SPRITE_SIZE);
    return { canvas, tint };
  }

  function ensureSprite(tint: string) {
    if (sprite?.tint === tint) return sprite.canvas;
    sprite = buildSprite(tint);
    return sprite?.canvas || null;
  }

  /** 横向雾带：吃掉远处地平线，是「能见度下降」的主要来源。 */
  function drawBands(frame: WeatherFrame, strength: number, tint: string) {
    const bandCount = Math.min(FOG_BAND_SPEEDS.length, frame.preset.fogBands || 0);
    if (bandCount <= 0) return;
    const bandSprite = frame.sprites.fogBandSprite(tint);
    if (!bandSprite) return;
    const { ctx, width, height } = frame;
    for (let index = 0; index < bandCount; index++) {
      const speed = FOG_BAND_SPEEDS[index];
      const bandHeight = height * (0.2 + index * 0.05);
      const bandWidth = width * (1.5 + index * 0.35);
      const drift = ((frame.elapsedSeconds * speed + index * 0.37) % 1) * width * 0.6;
      const top = height * (0.34 + index * 0.13) - bandHeight / 2;
      ctx.globalAlpha = strength * (0.5 - index * 0.09);
      ctx.drawImage(bandSprite, -drift, top, bandWidth, bandHeight);
      ctx.drawImage(bandSprite, bandWidth - drift, top, bandWidth, bandHeight);
    }
  }

  /** 雾团：中景翻滚的团块，让雾「有厚度」而不是一条平带。 */
  function drawBlobs(frame: WeatherFrame, strength: number, tint: string) {
    const blobSprite = ensureSprite(tint);
    if (!blobSprite) return;
    const { ctx, width, height } = frame;
    const size = Math.max(width, height) * 0.9;
    const count = Math.max(4, Math.round(FOG_BLOBS * frame.quality));
    for (let index = 0; index < count; index++) {
      const drift = Math.sin(frame.elapsedSeconds * 0.12 + index * 1.7) * width * 0.08;
      const x = ((index * 0.37) % 1) * width + drift;
      const y = (0.15 + ((index * 0.53) % 1) * 0.75) * height;
      ctx.globalAlpha = strength * (0.16 + ((index * 7) % 5) * 0.03);
      ctx.drawImage(blobSprite, x - size / 2, y - size / 2, size, size);
    }
  }

  return {
    draw(frame: WeatherFrame) {
      const strength = frame.preset.fog || 0;
      if (strength <= 0) return;
      const tint = frame.preset.fogTint || "196,204,212";
      frame.ctx.save();
      drawBands(frame, strength, tint);
      drawBlobs(frame, strength, tint);
      frame.ctx.restore();
    },
    reset() {
      sprite = null;
    },
  };
}
