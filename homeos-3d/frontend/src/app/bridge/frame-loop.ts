/**
 * 按需渲染的帧循环。
 */

type FrameLoopDeps = {
  step: (timestamp: number) => number;
  onWake?: () => void;
  now?: () => number;
  requestFrame?: (callback: (timestamp: number) => void) => number;
  cancelFrame?: (handle: number) => void;
  schedule?: (callback: () => void, delayMs: number) => ReturnType<typeof setTimeout>;
  cancel?: (timerId: ReturnType<typeof setTimeout>) => void;
};

/**
 * 创建帧循环实例；时间源、rAF 与定时器均可注入，测试里可手动推进，页面隐藏或渲染器丢失
 */
export function createDemandFrameLoop({
  step: step,
  onWake: onWake = () => {},
  now: now = () => performance.now(),
  requestFrame: requestFrame = rafCallback => requestAnimationFrame(rafCallback),
  cancelFrame: cancelFrame = rafHandle => cancelAnimationFrame(rafHandle),
  schedule: schedule = (timerCallback, delayMs) => setTimeout(timerCallback, delayMs),
  cancel: cancel = timerId => clearTimeout(timerId)
}: FrameLoopDeps) {
  let frameHandle: number | null = null;
  let deadlineTimerId: ReturnType<typeof setTimeout> | null = null;
  let isAvailable = true;
  let isDisposed = false;
  let isStepping = false;
  let wakeRequested = false;
  function cancelScheduled() {
    if (frameHandle !== null) {
      cancelFrame(frameHandle);
    }
    if (deadlineTimerId !== null) {
      cancel(deadlineTimerId);
    }
    frameHandle = deadlineTimerId = null;
  }
  // 外部唯一的「现在有活干」入口：调用方（相机过渡、灯光渐变等）在状态变化后调它，
  function wake() {
    // 已销毁或当前不可用（页面隐藏 / 渲染器不可用）时既不排帧也不排定时器，
    if (!isDisposed && !!isAvailable) {
      // 正在 step 中触发唤醒：只记标志，等本次 step 结束由 handleFrame 续排，
      if (isStepping) {
        wakeRequested = true;
        return;
      }
      // 有新的立刻出帧需求时，原先安排的延迟唤醒已无意义，先撤掉。
      if (deadlineTimerId !== null) {
        cancel(deadlineTimerId);
      }
      deadlineTimerId = null;
      // frameHandle 非空说明已有帧在排队，再排一次会凭空翻倍帧率。
      if (frameHandle === null) {
        // onWake 在真正排帧之前调用，调用方可以在此做一次性准备（例如同步画布尺寸）。
        onWake();
        frameHandle = requestFrame(handleFrame);
      }
    }
  }
  // timestamp 允许缺省：手动触发的首帧没有 rAF 提供的时间戳。
  function handleFrame(timestamp = now()) {
    frameHandle = null;
    if (isDisposed || !isAvailable) {
      return;
    }
    isStepping = true;
    // 先清标志再 step：step 期间再次 wake 会把它重新置真，从而自然续排下一帧。
    wakeRequested = false;
    let nextDelayMs = Infinity;
    try {
      nextDelayMs = step(timestamp);
    } finally {
      isStepping = false;
    }
    if (!isDisposed && !!isAvailable) {
      // 两种情况需要立刻续帧：step 期间被唤醒，或 step 明确要求尽快（<= 0）。
      if (wakeRequested || nextDelayMs <= 0) {
        frameHandle = requestFrame(handleFrame);
      } else if (Number.isFinite(nextDelayMs)) {
        deadlineTimerId = schedule(() => {
          deadlineTimerId = null;
          wake();
        }, nextDelayMs);
      }
    }
  }
  return {
    wake: wake,
    setAvailable(isAvailableNext: unknown) {
      // 只在可用性真正翻转时动作：重复设置同一个值不应打断已经排好的帧或定时器。
      if (!isDisposed && isAvailable !== !!isAvailableNext) {
        isAvailable = !!isAvailableNext;
        if (isAvailable) {
          wake();
        } else {
          cancelScheduled();
        }
      }
    },
    dispose() {
      isDisposed = true;
      cancelScheduled();
    },
    get pending() {
      // 供调用方判断循环是否还有待执行的活儿（例如决定是否允许重建场景）。
      return frameHandle !== null || deadlineTimerId !== null;
    }
  };
}
