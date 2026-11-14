/**
 * 云：一朵朵**漂移的云**，出现在多云以及全部降水天气。
 *
 * 这里刻意没有「云幕」形态：铺满画面宽度的灰带会把下面的户型、家具与设备状态
 * 一起盖住，属于背景遮盖层——天气层不允许出现任何整屏填充。
 * 所以云只有一种画法：**一张云的贴图**按不同远近、不同速度横向漂过画面，
 * 越近的云越大越快，靠视差拉开层次。
 *
 * 云只在画面上部活动，并且给每朵云单独限制不透明度上限，绝不下探到户型主体上。
 * 降水天气（雨 / 雪 / 雷雨 / 雨夹雪）同样是这套云，只是换成更暗更沉的底色：
 * 雨从晴空落下是「特效」，雨从低压的暗云下落下才是「天气」。
 */

import type { WeatherFrame } from './frame'

/** 单朵云的不透明度上限：再高就会像一块盖在画面上的白布。 */
const CLOUD_MAX_ALPHA = 0.62
/**
 * 阴天模式下单朵云的不透明度上限。
 *
 * 阴天靠**重叠**取胜而不是靠单朵变浓：十几朵淡云叠在一起才是一片均匀的灰白。
 * 单朵一旦画到 0.2 以上，就会重新看出「一朵」的轮廓，等于白改。
 */
const OVERCAST_MAX_ALPHA = 0.16
/** 阴天模式云贴图的最小/最大宽度（占画面宽度比例）：必须够宽才能横向连成片。 */
const OVERCAST_MIN_WIDTH = 0.42
const OVERCAST_MAX_WIDTH = 0.62
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

/**
 * 阴天模式的云幕布局：**更多、更宽、更淡、贴顶**。
 *
 * 用途是「不能出现云朵，但必须有云」的天气（雪天、雨夹雪）。真实的下雪天是整片
 * 均匀的灰白阴天，看不出单朵云；所以这里不改变「只用云贴图、不做整屏填充」的规则，
 * 而是让十几朵很淡的云在画面顶部互相重叠，自然叠成一片连片的灰白。
 *
 * 为什么用生成而不是手写常量表：布局条目多（14 条）且只要求「相位错开、纵深分散」，
 * 手写容易写成整齐的排列；这里用互质的步长把相位、纵深、尺寸都摊开，结果仍是
 * **确定值**（模块加载时算一次），不会每次切天气都跳位置。
 */
const OVERCAST_LAYOUT: readonly CloudLayout[] = Object.freeze(
  Array.from({ length: 14 }, (_unused, index) => ({
    // 全部贴近画面顶部：阴天的云幕压在户型上方，不能下探到家具上。
    y: 0.01 + ((index * 0.37) % 1) * 0.11,
    depth: 0.3 + ((index * 0.61) % 1) * 0.65,
    // 相位按 0.107 递增且不回绕到 0，避免出现「两朵云永远重合」。
    phase: (index * 0.107) % 1,
    size: 1.35 + ((index * 0.29) % 1) * 0.55,
    variant: index % 3,
  })),
)

/**
 * 一朵云在该布局下的宽度（占画面宽度比例）。
 *
 * 阴天要连成片，所以单朵更宽（`OVERCAST_MIN_WIDTH` 起）且不随 `size` 收窄太多；
 * 独立云朵则按远近与自身尺寸给宽，避免整片天空的云一样大。
 */
function cloudWidthOf(layout: CloudLayout, amount: number, overcast: boolean) {
  const factor = overcast
    ? OVERCAST_MIN_WIDTH + layout.depth * 0.2 * layout.size
    : (0.14 + layout.depth * 0.2) * layout.size
  const maxWidth = overcast ? OVERCAST_MAX_WIDTH : CLOUD_MAX_WIDTH
  return Math.min(maxWidth, factor) * (0.85 + amount * 0.15)
}

/**
 * 一朵云的最终不透明度（含预设的 `cloudAlpha` 与闪电提亮）。
 *
 * 阴天不乘 `cloudAlpha`：那枚系数是按「几朵独立的云」调的，套到重叠的云幕上会让整片
 * 灰白过浓、把户型压住。阴天的浓度只由 `OVERCAST_MAX_ALPHA` 与重叠层数决定。
 */
function cloudAlphaOf(frame: WeatherFrame, layout: CloudLayout, amount: number, overcast: boolean) {
  const cap = overcast
    ? Math.min(OVERCAST_MAX_ALPHA, 0.09 + layout.depth * 0.05)
    : Math.min(CLOUD_MAX_ALPHA, 0.34 + layout.depth * 0.3)
  // 闪电照亮云底：整朵云在放电瞬间一起提亮，观感比只画一条亮线真实得多。
  const flashBoost = 1 + frame.flash * 1.1
  const presetScale = overcast ? 1 : (frame.preset.cloudAlpha ?? 1)
  return Math.min(0.92, cap * Math.min(1, amount) * presetScale * flashBoost)
}

function drawCloud(
  frame: WeatherFrame,
  rgb: string,
  bottomRgb: string,
  layout: CloudLayout,
  amount: number,
  overcast: boolean,
) {
  const { ctx, width, height } = frame
  const sprite = frame.sprites.cloudSprite(rgb, bottomRgb, layout.variant)
  if (!sprite) return
  const drift = (frame.preset.cloudDrift ?? 0.03) * (0.4 + layout.depth * 0.8)
  // 相位 + 时间 → 0~1.5 的横向位置，两端各多留 0.25 屏让云「从画面外飘进来」。
  const progress = (((frame.elapsedSeconds * drift + layout.phase) % 1.5) + 1.5) % 1.5
  const cloudWidth = width * cloudWidthOf(layout, amount, overcast)
  const cloudHeight = cloudWidth * (sprite.height / sprite.width)
  const centerX = (progress - 0.25) * width
  const centerY = height * Math.min(CLOUD_MAX_CENTER, layout.y + layout.depth * 0.04)
  ctx.globalAlpha = cloudAlphaOf(frame, layout, amount, overcast)
  ctx.drawImage(sprite, centerX - cloudWidth / 2, centerY - cloudHeight * CLOUD_SPRITE_CENTER, cloudWidth, cloudHeight)
}

/**
 * 这一帧要画几朵云。
 *
 * 阴天**按层数**取（重叠才连成片，少画会立刻露出单朵轮廓）；独立云朵按 `clouds` 系数
 * 取，画质降档时先省远景。两种口径差得远，所以分开写而不是压成一个三元表达式。
 */
function cloudCountOf(amount: number, layout: readonly CloudLayout[], quality: number, overcast: boolean) {
  const fullQuality = quality >= 0.8
  if (overcast) return fullQuality ? layout.length : Math.max(6, Math.round(layout.length * 0.6))
  const qualityCount = fullQuality ? layout.length : layout.length - 4
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
      // 阴天模式：换成重叠的云幕布局（见 `OVERCAST_LAYOUT` 的说明）。
      const overcast = frame.preset.cloudOvercast === true
      const layout = overcast ? OVERCAST_LAYOUT : CLOUD_LAYOUT
      const count = Math.min(cloudCountOf(amount, layout, frame.quality, overcast), layout.length)
      ctx.save()
      for (let index = 0; index < count; index++) drawCloud(frame, rgb, bottomRgb, layout[index], amount, overcast)
      ctx.restore()
      ctx.globalAlpha = 1
    },
    reset() {},
  }
}
