/**
 * 雷电闪光包络：2D 天气层与 3D 舞台共用的**纯函数**。
 *
 * 为什么单独抽出来：2D 画布负责画雷电图，3D 舞台负责让闪电照亮家具与墙面。
 * 两边各写一套衰减曲线时，同一道闪电会在两个层里以不同节奏明灭，观感立刻「假」。
 * 这里只放数值，不碰 DOM / canvas / three，任何一侧都能直接 import。
 */

/** 一次放电的可见总时长（含主闪与回闪，秒）。 */
export const WEATHER_FLASH_SECONDS = 0.66

/**
 * 主闪衰减系数：越大越「啪」地一下。
 *
 * 18/s（时间常数 ~55ms）是为了 30fps 的天气层：26/s 时包络在 38ms 内就衰减到 1/e，
 * 30fps 下很容易「一帧都没采到峰值」，表现为闪电偶尔只闪一下暗光。真实雷电的
 * 主闪持续几十毫秒到一百多毫秒，18/s 既够干脆又不会漏帧。
 */
const PRIMARY_DECAY = 18
/** 回闪开始时间与强度：主闪之后约 80ms 的一次弱回闪，是真实雷电的关键细节。 */
const RETURN_FLASH_DELAY = 0.085
const RETURN_FLASH_GAIN = 0.55
const RETURN_FLASH_DECAY = 16
/** 余辉：放电结束后云层与地面还会亮一小会儿，不能立刻归零。 */
const AFTERGLOW_GAIN = 0.12
const AFTERGLOW_DECAY = 4

/**
 * 双闪包络：主闪 + 回闪 + 一段缓慢余辉。
 *
 * @param elapsedSeconds 距放电开始的秒数（负数按 0 处理）
 * @param gain 本次放电的强度系数（0~1）
 * @returns 0~1 的发光强度
 */
export function weatherFlashEnvelope(elapsedSeconds: number, gain = 1): number {
  const elapsed = elapsedSeconds > 0 ? elapsedSeconds : 0
  const primary = Math.exp(-elapsed * PRIMARY_DECAY)
  const returnFlash =
    elapsed > RETURN_FLASH_DELAY
      ? Math.exp(-(elapsed - RETURN_FLASH_DELAY) * RETURN_FLASH_DECAY) * RETURN_FLASH_GAIN
      : 0
  const afterglow = Math.exp(-elapsed * AFTERGLOW_DECAY) * AFTERGLOW_GAIN
  const clampedGain = gain > 0 ? (gain > 1 ? 1 : gain) : 0
  const envelope = Math.min(1, primary + returnFlash + afterglow)
  return envelope * clampedGain
}

/** 该包络是否已经衰减到看不出来（调用方据此停帧 / 停定时器）。 */
export function weatherFlashVisible(intensity: number): boolean {
  return intensity > 0.004
}
