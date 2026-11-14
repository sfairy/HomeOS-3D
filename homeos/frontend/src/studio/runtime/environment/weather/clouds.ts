/**
 * 云：一朵朵**漂移的云**，出现在多云以及全部降水天气（含雪天）。
 *
 * 这里刻意没有「云幕」形态：铺满画面宽度的灰带会把下面的户型、家具与设备状态
 * 一起盖住，属于背景遮盖层——天气层不允许出现任何整屏填充。
 * 试过用「很多很淡的云互相重叠」去凑阴天色，结果是一片**雾**：云的辨识度来自
 * 「有边界、有体积的团块」，把单朵压淡到看不出轮廓，剩下的就只是灰蒙蒙的空气。
 * 所以云只有一种画法：**一张有实体感的云贴图**按不同远近、不同速度横向漂过画面，
 * 越近的云越大越快，靠视差拉开层次。
 *
 * 云只在画面上部活动，并且给每朵云单独限制不透明度上限，绝不下探到户型主体上。
 * 降水天气（雨 / 雪 / 雷雨 / 雨夹雪）同样是这套云，只是换成更暗更沉或更亮更厚的底色：
 * 雨从晴空落下是「特效」，雨从低压的暗云下落下才是「天气」；雪云则偏亮偏慢。
 */

import type { WeatherFrame } from './frame'

/** 单朵云的不透明度上限：再高就会像一块盖在画面上的白布。 */
const CLOUD_MAX_ALPHA = 0.62
/** 云朵在贴图纵向上的视觉中心（贴图里云体略偏下，绘制时要按它对齐）。 */
const CLOUD_SPRITE_CENTER = 0.6
/** 云朵最大宽度（占画面宽度比例）。 */
const CLOUD_MAX_WIDTH = 0.34
/** 云朵中心允许下探到画面高度的比例。 */
const CLOUD_MAX_CENTER = 0.34
/** 晴天的云贴图颜色：接近中性白，避免在暖色场景里发黄。 */
const CLOUD_RGB = '250,252,255'
const CLOUD_BOTTOM_RGB = '196,204,220'

type CloudLayout = {
  /** 纵向位置（占画面高度比例，绘制前还会被 `CLOUD_MAX_CENTER` 夹一道）。 */
  y: number
  /** 远近系数：越大越近（更大、更快、更不透明）。 */
  depth: number
  /** 初始相位（0~1），让云朵不在同一列排队。 */
  phase: number
  /** 尺寸系数（0.7~1.2），同一远近也有大有小。 */
  size: number
  /** 贴图变体：不同团块布局，避免整片天空的云长得一模一样。 */
  variant: number
}

/**
 * 固定的云朵布局。
 *
 * 用常量表而不是随机生成：云朵是「一直都在」的物体，每次切天气重新随机会让
 * 云的位置整体跳一下；固定布局 + 时间相位就能做到「云一直在，只是慢慢飘」。
 */
const CLOUD_LAYOUT: readonly CloudLayout[] = Object.freeze([
  { y: 0.06, depth: 0.35, phase: 0.02, size: 0.85, variant: 0 },
  { y: 0.16, depth: 0.55, phase: 0.42, size: 1.05, variant: 1 },
  { y: 0.1, depth: 0.72, phase: 0.66, size: 1.12, variant: 2 },
  { y: 0.24, depth: 0.48, phase: 0.2, size: 0.92, variant: 2 },
  { y: 0.2, depth: 0.9, phase: 0.83, size: 1.18, variant: 0 },
  { y: 0.3, depth: 0.4, phase: 0.55, size: 0.8, variant: 1 },
  { y: 0.13, depth: 0.62, phase: 0.11, size: 0.96, variant: 2 },
  { y: 0.27, depth: 0.66, phase: 0.74, size: 0.88, variant: 1 },
])

/** 一朵云的宽度（占画面宽度比例）：按远近与自身尺寸给宽，避免整片天空的云一样大。 */
function cloudWidthOf(layout: CloudLayout, amount: number) {
  return Math.min(CLOUD_MAX_WIDTH, (0.14 + layout.depth * 0.2) * layout.size) * (0.85 + amount * 0.15)
}

/** 一朵云的最终不透明度（含预设的 `cloudAlpha` 与闪电提亮）。 */
function cloudAlphaOf(frame: WeatherFrame, layout: CloudLayout, amount: number) {
  const cap = Math.min(CLOUD_MAX_ALPHA, 0.34 + layout.depth * 0.3)
  // 闪电照亮云底：整朵云在放电瞬间一起提亮，观感比只画一条亮线真实得多。
  const flashBoost = 1 + frame.flash * 1.1
  return Math.min(0.92, cap * Math.min(1, amount) * (frame.preset.cloudAlpha ?? 1) * flashBoost)
}

function drawCloud(frame: WeatherFrame, rgb: string, bottomRgb: string, layout: CloudLayout, amount: number) {
  const { ctx, width, height } = frame
  const sprite = frame.sprites.cloudSprite(rgb, bottomRgb, layout.variant)
  if (!sprite) return
  const drift = (frame.preset.cloudDrift ?? 0.03) * (0.4 + layout.depth * 0.8)
  // 相位 + 时间 → 0~1.5 的横向位置，两端各多留 0.25 屏让云「从画面外飘进来」。
  const progress = (((frame.elapsedSeconds * drift + layout.phase) % 1.5) + 1.5) % 1.5
  const cloudWidth = width * cloudWidthOf(layout, amount)
  const cloudHeight = cloudWidth * (sprite.height / sprite.width)
  const centerX = (progress - 0.25) * width
  const centerY = height * Math.min(CLOUD_MAX_CENTER, layout.y + layout.depth * 0.04)
  ctx.globalAlpha = cloudAlphaOf(frame, layout, amount)
  ctx.drawImage(sprite, centerX - cloudWidth / 2, centerY - cloudHeight * CLOUD_SPRITE_CENTER, cloudWidth, cloudHeight)
}

/** 这一帧要画几朵云：画质降档时先省远景，但不少到「看不出有云」。 */
function cloudCountOf(amount: number, layout: readonly CloudLayout[], quality: number) {
  const qualityCount = quality >= 0.8 ? layout.length : layout.length - 4
  return amount >= 0.8 ? qualityCount : Math.max(2, Math.round(qualityCount * amount * 1.2))
}

export function createCloudRenderer() {
  return {
    draw(frame: WeatherFrame) {
      const amount = frame.preset.clouds || 0
      if (amount <= 0) return
      const rgb = frame.preset.cloudTint || CLOUD_RGB
      const bottomRgb = frame.preset.cloudBottom || CLOUD_BOTTOM_RGB
      const { ctx } = frame
      const count = Math.min(cloudCountOf(amount, CLOUD_LAYOUT, frame.quality), CLOUD_LAYOUT.length)
      ctx.save()
      for (let index = 0; index < count; index++) drawCloud(frame, rgb, bottomRgb, CLOUD_LAYOUT[index], amount)
      ctx.restore()
      ctx.globalAlpha = 1
    },
    reset() {},
  }
}
