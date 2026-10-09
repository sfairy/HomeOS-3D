export function createDemandFrameLoop({
  step: step,
  onWake: onWake = () => {},
  now: now = () => performance.now(),
  maxFps: maxFps = 60,
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
    nextFrameTimeMs = -Infinity;
  const frameIntervalMs =
      maxFps === Infinity
        ? 0
        : 1000 / (Number.isFinite(maxFps) && maxFps > 0 ? Math.min(maxFps, 60) : 60),
    frameStats = {
      frames: 0,
      deadlines: 0,
    };
  function clearPendingHandles() {
    (animationFrameId !== null && cancelFrame(animationFrameId),
      timeoutId !== null && cancel(timeoutId),
      (animationFrameId = timeoutId = null));
  }
  function wakeLoop() {
    if (!(isDisposed || !isAvailable)) {
      if (isStepping) {
        hasPendingWake = true;
        return;
      }
      (timeoutId !== null && cancel(timeoutId),
        (timeoutId = null),
        animationFrameId === null && (onWake(), (animationFrameId = requestFrame(runFrameTick))));
    }
  }
  function runFrameTick(frameTimestamp = now()) {
    if (((animationFrameId = null), isDisposed || !isAvailable)) return;
    if (frameTimestamp + 1.5 < nextFrameTimeMs) {
      animationFrameId = requestFrame(runFrameTick);
      return;
    }
    ((nextFrameTimeMs =
      frameTimestamp - nextFrameTimeMs >= frameIntervalMs
        ? frameTimestamp + frameIntervalMs
        : nextFrameTimeMs + frameIntervalMs),
      (isStepping = true),
      (hasPendingWake = false),
      frameStats.frames++);
    let nextDelayMs = Infinity;
    try {
      nextDelayMs = step(frameTimestamp);
    } finally {
      isStepping = false;
    }
    isDisposed ||
      !isAvailable ||
      (hasPendingWake || nextDelayMs <= 0
        ? (animationFrameId = requestFrame(runFrameTick))
        : Number.isFinite(nextDelayMs) &&
          (timeoutId = schedule(() => {
            ((timeoutId = null), frameStats.deadlines++, wakeLoop());
          }, nextDelayMs)));
  }
  return {
    wake: wakeLoop,
    stats: frameStats,
    wakeAnimation() {
      isStepping || wakeLoop();
    },
    setAvailable(nextAvailable: any) {
      isDisposed ||
        isAvailable === !!nextAvailable ||
        ((isAvailable = !!nextAvailable),
        isAvailable ? wakeLoop() : (clearPendingHandles(), (nextFrameTimeMs = -Infinity)));
    },
    dispose() {
      ((isDisposed = true), clearPendingHandles());
    },
    get pending() {
      return animationFrameId !== null || timeoutId !== null;
    },
  };
}
