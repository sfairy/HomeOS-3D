/**
 * 云：一朵朵**漂移的白云**，只出现在「多云」。
 *
 * 这里刻意没有「云幕」形态：铺满画面宽度的灰带会把下面的户型、家具与设备状态
 * 一起盖住，属于背景遮盖层——天气层不允许出现任何整屏填充。
 * 所以云只有一种画法：**一张云的贴图**按不同远近、不同速度横向漂过画面，
 * 越近的云越大越快，靠视差拉开层次。
 *
 * 云只在画面上部活动，并且给每朵云单独限制不透明度上限，绝不下探到户型主体上。
 */

import type { WeatherFrame } from "./frame";

/** 单朵云的不透明度上限：再高就会像一块盖在画面上的白布。 */
const CLOUD_MAX_ALPHA = 0.62;
/** 云朵在贴图纵向上的视觉中心（贴图里云体略偏下，绘制时要按它对齐）。 */
const CLOUD_SPRITE_CENTER = 0.6;
/** 云朵最大宽度（占画面宽度比例）。 */
const CLOUD_MAX_WIDTH = 0.34;
/** 云朵中心允许下探到画面高度的比例。 */
const CLOUD_MAX_CENTER = 0.34;
/** 云朵贴图颜色：接近中性白，避免在暖色场景里发黄。 */
const CLOUD_RGB = "250,252,255";

type CloudLayout = {
  /** 纵向位置（占画面高度比例，绘制前还会被 `CLOUD_MAX_CENTER` 夹一道）。 */
  y: number;
  /** 远近系数：越大越近（更大、更快、更不透明）。 */
  depth: number;
  /** 初始相位（0~1），让云朵不在同一列排队。 */
  phase: number;
  /** 尺寸系数（0.7~1.2），同一远近也有大有小。 */
  size: number;
};

/**
 * 固定的云朵布局。
 *
 * 用常量表而不是随机生成：云朵是「一直都在」的物体，每次切天气重新随机会让
 * 云的位置整体跳一下；固定布局 + 时间相位就能做到「云一直在，只是慢慢飘」。
 */
const CLOUD_LAYOUT: readonly CloudLayout[] = Object.freeze([
  { y: 0.06, depth: 0.35, phase: 0.02, size: 0.85 },
  { y: 0.16, depth: 0.55, phase: 0.42, size: 1.05 },
  { y: 0.1, depth: 0.72, phase: 0.66, size: 1.12 },
  { y: 0.24, depth: 0.48, phase: 0.2, size: 0.92 },
  { y: 0.2, depth: 0.9, phase: 0.83, size: 1.18 },
  { y: 0.3, depth: 0.4, phase: 0.55, size: 0.8 },
]);

function drawCloud(
  frame: WeatherFrame,
  sprite: HTMLCanvasElement,
  layout: CloudLayout,
  amount: number,
) {
  const { ctx, width, height } = frame;
  const drift = (frame.preset.cloudDrift ?? 0.03) * (0.4 + layout.depth * 0.8);
  // 相位 + 时间 → 0~1.5 的横向位置，两端各多留 0.25 屏让云「从画面外飘进来」。
  const progress = (((frame.elapsedSeconds * drift + layout.phase) % 1.5) + 1.5) % 1.5;
  const cloudWidth =
    width * Math.min(CLOUD_MAX_WIDTH, (0.14 + layout.depth * 0.2) * layout.size) * (0.85 + amount * 0.15);
  const cloudHeight = cloudWidth * (sprite.height / sprite.width);
  const centerX = (progress - 0.25) * width;
  const centerY =
    height *
    Math.min(
      CLOUD_MAX_CENTER,
      layout.y + layout.depth * 0.04,
    );
  ctx.globalAlpha = Math.min(CLOUD_MAX_ALPHA, 0.34 + layout.depth * 0.3) * Math.min(1, amount);
  ctx.drawImage(
    sprite,
    centerX - cloudWidth / 2,
    centerY - cloudHeight * CLOUD_SPRITE_CENTER,
    cloudWidth,
    cloudHeight,
  );
}

export function createCloudRenderer() {
  return {
    draw(frame: WeatherFrame) {
      const amount = frame.preset.clouds || 0;
      if (amount <= 0) return;
      const sprite = frame.sprites.cloudSprite(CLOUD_RGB);
      if (!sprite) return;
      const { ctx } = frame;
      ctx.save();
      // 画质降档时少画两朵（远的先省），但不能少到「看不出有云」。
      const qualityCount = frame.quality >= 0.8 ? CLOUD_LAYOUT.length : CLOUD_LAYOUT.length - 2;
      const count =
        amount >= 0.8 ? qualityCount : Math.max(2, Math.round(qualityCount * amount * 1.2));
      for (let index = 0; index < count; index++)
        drawCloud(frame, sprite, CLOUD_LAYOUT[index], amount);
      ctx.restore();
      ctx.globalAlpha = 1;
    },
    reset() {},
  };
}
