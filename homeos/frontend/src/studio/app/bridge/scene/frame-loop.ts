/**
 * 按需驱动的渲染帧循环（0.8.2 `frame-loop`，0.8.4 增加截止时间对齐与休眠）。
 *
 * 与 0.8.2 的差别（0.8.4）：
 * - `alignDeadlines`：把下一帧的定时器对齐到「本次推进间隔 - 一帧」的误差带上，
 *   短间隔（≤100ms）时额外留 1ms 余量，避免 setTimeout 抖动导致的跳帧；
 * - `sleep()`：页面不可见时彻底停摆（不清 `pending` 语义之外的唤醒），`setAvailable(true)` 再唤醒；
 * - `stats` / `pending` 保持不变。
 */

const EARLY_FRAME_TOLERANCE_MS = 1.5
const DEADLINE_WINDOW_LIMIT_MS = 100
const DEADLINE_FRAME_SLACK_MS = 1000 / 60
/** 调用方显式传入的上限（高刷屏 A/B 用）；默认仍是 60。 */
const MAX_FPS_LIMIT = 240

export function createDemandFrameLoop({
  step: step,
  onWake: onWake = () => {},
  now: now = () => performance.now(),
  maxFps: maxFps = 60,
  alignDeadlines: alignDeadlines = false,
  requestFrame: requestFrame = (onAnimationFrame: any) => requestAnimationFrame(onAnimationFrame),
  cancelFrame: cancelFrame = (animationFrameHandle: any) => cancelAnimationFrame(animationFrameHandle),
  schedule: schedule = (onTimeout: any, timeoutDelayMs: any) => setTimeout(onTimeout, timeoutDelayMs),
  cancel: cancel = (timeoutHandle: any) => clearTimeout(timeoutHandle),
}: any) {
  let animationFrameId: any = null,
    timeoutId: any = null,
    isAvailable = true,
    isDisposed = false,
    isStepping = false,
    hasPendingWake = false,
    isParked = false,
    nextFrameTimeMs = -Infinity,
    deadlineTargetMs = -Infinity,
    deadlineWindowMs = 0
  const frameIntervalMs =
      maxFps === Infinity ? 0 : 1000 / (Number.isFinite(maxFps) && maxFps > 0 ? Math.min(maxFps, MAX_FPS_LIMIT) : 60),
    frameStats = {
      frames: 0,
      deadlines: 0,
    }
  function clearPendingHandles() {
    animationFrameId !== null && cancelFrame(animationFrameId),
      timeoutId !== null && cancel(timeoutId),
      (animationFrameId = timeoutId = null),
      (deadlineTargetMs = -Infinity)
  }
  /** 只请求下一帧（不清定时器）：截止时间对齐分支里由定时器回调进来。 */
  function requestNextFrame() {
    animationFrameId === null && (onWake(), (animationFrameId = requestFrame(tickFrameLoop)))
  }
  function wakeLoop() {
    if (isDisposed || !isAvailable) return
    // 上一次 `sleep()` 之后再 wake 视为恢复运行。
    isParked = false
    if (isStepping) {
      hasPendingWake = true
      return
    }
    timeoutId !== null && cancel(timeoutId), (timeoutId = null), (deadlineTargetMs = -Infinity), requestNextFrame()
  }
  function tickFrameLoop(frameTimestamp = now()) {
    if (((animationFrameId = null), isDisposed || !isAvailable || isParked)) return
    if (
      frameTimestamp + EARLY_FRAME_TOLERANCE_MS < nextFrameTimeMs ||
      frameTimestamp + deadlineWindowMs < deadlineTargetMs
    ) {
      animationFrameId = requestFrame(tickFrameLoop)
      return
    }
    ;(nextFrameTimeMs =
      frameTimestamp - nextFrameTimeMs >= frameIntervalMs
        ? frameTimestamp + frameIntervalMs
        : nextFrameTimeMs + frameIntervalMs),
      (isStepping = true),
      (hasPendingWake = false),
      frameStats.frames++
    let nextDelayMs = Infinity
    try {
      nextDelayMs = step(frameTimestamp)
    } finally {
      isStepping = false
    }
    if (isDisposed || !isAvailable || isParked) return
    if (hasPendingWake || nextDelayMs <= 0) {
      ;(deadlineTargetMs = -Infinity), (animationFrameId = requestFrame(tickFrameLoop))
      return
    }
    if (!Number.isFinite(nextDelayMs)) return
    if (!alignDeadlines) {
      timeoutId = schedule(() => {
        ;(timeoutId = null), frameStats.deadlines++, wakeLoop()
      }, nextDelayMs)
      return
    }
    // 对齐模式：目标截止时间 = 本次时间戳 + 推进间隔，提前一帧进入下一轮。
    deadlineTargetMs = frameTimestamp + nextDelayMs
    deadlineWindowMs = nextDelayMs <= DEADLINE_WINDOW_LIMIT_MS ? 1 : 0
    const remainingMs = deadlineTargetMs - now() - DEADLINE_FRAME_SLACK_MS
    if (remainingMs <= 0) {
      animationFrameId = requestFrame(tickFrameLoop)
      return
    }
    timeoutId = schedule(() => {
      ;(timeoutId = null), frameStats.deadlines++, requestNextFrame()
    }, remainingMs)
  }
  return {
    wake: wakeLoop,
    stats: frameStats,
    wakeAnimation() {
      isStepping || wakeLoop()
    },
    /** 页面切到后台：停掉所有已排队的帧与定时器，并在 `setAvailable(true)` 前不再自唤醒。 */
    sleep() {
      clearPendingHandles(), (hasPendingWake = false), (isParked = true)
    },
    setAvailable(nextAvailable: any) {
      isDisposed ||
        isAvailable === !!nextAvailable ||
        ((isAvailable = !!nextAvailable),
        isAvailable ? wakeLoop() : (clearPendingHandles(), (nextFrameTimeMs = -Infinity)))
    },
    dispose() {
      ;(isDisposed = true), clearPendingHandles()
    },
    get pending() {
      return animationFrameId !== null || timeoutId !== null
    },
  }
}
