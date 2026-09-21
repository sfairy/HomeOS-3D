/**
 * 按需渲染的帧循环。
 *
 * 3D 场景的驱动核心：所有动画（相机过渡、灯光渐变、自动旋转）都不自己排帧，而是把「下一次
 * 还需在多少毫秒后运行」告诉这里，由本模块决定排 rAF 还是定时器。对外导出
 * createDemandFrameLoop。step 回调返回值：Infinity 表示已静止，<= 0 表示立刻再来一帧，有限
 * 正数表示那么久之后再醒一次。
 */

/**
 * 创建帧循环实例；时间源、rAF 与定时器均可注入，测试里可手动推进，页面隐藏或渲染器丢失
 * 上下文时也可从外部整体停摆而不必销毁实例。
 */
export function createDemandFrameLoop({
  step: step,
  onWake: onWake = () => {},
  now: now = () => performance.now(),
  requestFrame: requestFrame = rafCallback => requestAnimationFrame(rafCallback),
  cancelFrame: cancelFrame = rafHandle => cancelAnimationFrame(rafHandle),
  schedule: schedule = (timerCallback, delayMs) => setTimeout(timerCallback, delayMs),
  cancel: cancel = timerId => clearTimeout(timerId)
}) {
  let frameHandle = null;
  let deadlineTimerId = null;
  let isAvailable = true;
  let isDisposed = false;
  let isStepping = false;
  let wakeRequested = false;
  // 帧句柄与延迟句柄互斥：任一非空都表示「已经安排好下一次运行」，避免重复排程。
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
  // 由这里统一决定排 rAF、排定时器、还是因为已有排程而什么都不做。
  function wake() {
    // 已销毁或当前不可用（页面隐藏 / 渲染器不可用）时既不排帧也不排定时器，
    // 等 setAvailable(true) 时再统一唤醒。
    if (!isDisposed && !!isAvailable) {
      // 正在 step 中触发唤醒：只记标志，等本次 step 结束由 handleFrame 续排，
      // 否则会在同一帧内重入，导致一帧里跑两次 step。
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
    // step 抛错也必须复位 isStepping，否则此后 wake 只会置标志、永远不再排帧，动画静默卡死。
    try {
      nextDelayMs = step(timestamp);
    } finally {
      isStepping = false;
    }
    if (!isDisposed && !!isAvailable) {
      // 两种情况需要立刻续帧：step 期间被唤醒，或 step 明确要求尽快（<= 0）。
      // 有限延迟走定时器而不是连排 rAF —— 这才是「按需渲染」的本意，静止时零耗电。
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
    setAvailable(isAvailableNext) {
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
