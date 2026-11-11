/**
 * 自适应画质治理器。
 *
 * 天气层的开销随屏幕面积与粒子数线性增长，墙面平板和 4K 桌面能承受的档位完全不同。
 * 这里用帧间隔的指数移动平均（EMA）判断当前设备吃不吃得下：
 *
 * - 连续 90 帧超过目标帧间隔的 1.32 倍（60fps 目标时 22ms）→ 降一档；
 * - 连续 240 帧低于目标帧间隔的 1.05 倍（60fps 目标时 17.5ms）→ 升一档；
 * - 档位只有 0.55 / 0.8 / 1 三档，且用因子而不是开关，避免画面突变。
 *
 * **升档阈值必须高于帧循环的上限帧间隔**：阈值按 `targetFrameMs` 等比缩放，30fps 出帧时
 * 升档线是 35ms；写死 17.5ms 会在 30fps 上限下永远达不到，降档之后就再也升不回来，
 * 表现为「卡过一次之后一直很糊」。
 */

const QUALITY_LEVELS = [0.55, 0.8, 1] as const
const SAMPLE_ALPHA = 0.06
const SLOW_FRAME_RATIO = 1.32
const FAST_FRAME_RATIO = 1.05
const SLOW_FRAMES_TO_DROP = 90
const FAST_FRAMES_TO_RAISE = 240

export function createQualityGovernor(targetFrameMs = 1000 / 60) {
  const slowFrameMs = targetFrameMs * SLOW_FRAME_RATIO
  const fastFrameMs = targetFrameMs * FAST_FRAME_RATIO
  let level = QUALITY_LEVELS.length - 1
  let averageFrameMs = targetFrameMs
  let hasSample = false
  let slowFrames = 0
  let fastFrames = 0

  function drop() {
    level = Math.max(0, level - 1)
    slowFrames = 0
    fastFrames = 0
  }

  function raise() {
    level = Math.min(QUALITY_LEVELS.length - 1, level + 1)
    slowFrames = 0
    fastFrames = 0
  }

  return {
    /** 当前画质因子；刚启动时按满档，先给最好的观感再按实测降。 */
    get factor() {
      return QUALITY_LEVELS[level]
    },
    /** 记录一帧耗时；`deltaSeconds` 为 0（定格重绘）时不计入。 */
    sample(deltaSeconds: number) {
      if (deltaSeconds <= 0) return
      const frameMs = deltaSeconds * 1000
      // 第一帧直接取实测值：初值只是猜测，遇到 4K 屏会先假装流畅 90 帧。
      averageFrameMs = hasSample ? averageFrameMs + (frameMs - averageFrameMs) * SAMPLE_ALPHA : frameMs
      hasSample = true
      if (averageFrameMs > slowFrameMs) {
        slowFrames += 1
        fastFrames = 0
      } else if (averageFrameMs < fastFrameMs) {
        fastFrames += 1
        slowFrames = 0
      }
      if (slowFrames >= SLOW_FRAMES_TO_DROP) drop()
      else if (fastFrames >= FAST_FRAMES_TO_RAISE) raise()
    },
    reset() {
      level = QUALITY_LEVELS.length - 1
      averageFrameMs = targetFrameMs
      hasSample = false
      slowFrames = 0
      fastFrames = 0
    },
  }
}

export type QualityGovernor = ReturnType<typeof createQualityGovernor>
