export function createStartupPresentation({
  env: windowHost = globalThis,
  coverWindow: coverWindow = null,


  onProgress: onProgress = (_progress: any) => {},
  onComplete: onComplete = () => {},
  onMotionComplete: onMotionComplete = () => {},

  onPreparationFrame: onPreparationFrame = (_shouldPrepareThisFrame: any) => {},
  duration: durationMs = 320,
  onShadowsProgress: onShadowsProgress = null,
  onEffectsProgress: onEffectsProgress = null,
  waitForEffects: shouldWaitForEffects = false,
  shadowDuration: shadowDurationMs = 180,
  effectsDuration: effectsDurationMs = 240,
}: any = {}) {
  let presentationPhase = "idle",
    animationFrameId: any = null,
    progressStartMs: any = null,
    shadowsStartMs: any = null,
    effectsStartMs: any = null,
    fallbackTimeoutId: any = null,
    hasCompletedMotion = false,
    hasStartedShadows = !shouldWaitForEffects,
    hasStartedEffects = !shouldWaitForEffects,
    lastPreparationTimeMs: any = null;
  const interruptEventNames = ["pointerdown", "wheel", "keydown"];
  function detachEventListeners() {
    (animationFrameId !== null && windowHost.cancelAnimationFrame(animationFrameId),
      fallbackTimeoutId !== null && windowHost.clearTimeout?.(fallbackTimeoutId),
      (animationFrameId = fallbackTimeoutId = null),
      coverWindow?.removeEventListener("hb-display-reveal", handleDisplayReveal));
    for (const removedEventName of interruptEventNames)
      windowHost.removeEventListener(removedEventName, finishPresentation, true);
    (windowHost.removeEventListener("pagehide", disposePresentation),
      windowHost.document?.removeEventListener("visibilitychange", handleVisibilityChange));
  }
  function completeMotion() {
    hasCompletedMotion || ((hasCompletedMotion = true), onProgress(1), onMotionComplete());
  }
  function finishPresentation() {
    presentationPhase === "done" ||
      presentationPhase === "disposed" ||
      ((presentationPhase = "done"),
      detachEventListeners(),
      completeMotion(),
      onShadowsProgress?.(1),
      onEffectsProgress?.(1),
      onComplete());
  }
  function handleVisibilityChange() {
    windowHost.document?.hidden && finishPresentation();
  }
  function scheduleAnimationFrame() {
    presentationPhase === "running" &&
      hasCompletedMotion &&
      animationFrameId === null &&
      (animationFrameId = windowHost.requestAnimationFrame(advancePresentationFrame));
  }
  function handleShadowsReady() {
    presentationPhase === "done" ||
      presentationPhase === "disposed" ||
      hasStartedShadows ||
      ((hasStartedShadows = true), scheduleAnimationFrame());
  }
  function handleEffectsReady() {
    presentationPhase === "done" ||
      presentationPhase === "disposed" ||
      hasStartedEffects ||
      ((hasStartedEffects = true), scheduleAnimationFrame());
  }
  function advancePresentationFrame(frameTimeMs: any) {
    if (((animationFrameId = null), presentationPhase !== "running")) return;
    progressStartMs ??= frameTimeMs;
    const progressRatio = Math.min(1, Math.max(0, (frameTimeMs - progressStartMs) / durationMs));
    if (
      (onProgress(1 - (1 - progressRatio) ** 3),
      hasCompletedMotion ||
        (onPreparationFrame(
          progressRatio >= 0.5 &&
            progressRatio < 1 &&
            lastPreparationTimeMs !== null &&
            frameTimeMs - lastPreparationTimeMs <= 24,
        ),
        (lastPreparationTimeMs = frameTimeMs)),
      progressRatio < 1)
    ) {
      animationFrameId = windowHost.requestAnimationFrame(advancePresentationFrame);
      return;
    }
    if ((completeMotion(), !onShadowsProgress && !onEffectsProgress)) {
      finishPresentation();
      return;
    }
    if (
      ((fallbackTimeoutId ??=
        windowHost.setTimeout?.(() => {
          (handleShadowsReady(), handleEffectsReady());
        }, 3000) ?? null),
      onShadowsProgress)
    ) {
      if (!hasStartedShadows) return;
      shadowsStartMs ??= frameTimeMs;
      const shadowsProgressRatio = Math.min(
        1,
        Math.max(0, (frameTimeMs - shadowsStartMs) / shadowDurationMs),
      );
      if (
        (onShadowsProgress(
          shadowsProgressRatio * shadowsProgressRatio * (3 - 2 * shadowsProgressRatio),
        ),
        shadowsProgressRatio < 1)
      ) {
        animationFrameId = windowHost.requestAnimationFrame(advancePresentationFrame);
        return;
      }
    }
    if (!onEffectsProgress) {
      finishPresentation();
      return;
    }
    if (!hasStartedEffects) return;
    effectsStartMs ??= frameTimeMs;
    const effectsProgressRatio = Math.min(
      1,
      Math.max(0, (frameTimeMs - effectsStartMs) / effectsDurationMs),
    );
    (onEffectsProgress(
      effectsProgressRatio * effectsProgressRatio * (3 - 2 * effectsProgressRatio),
    ),
      effectsProgressRatio === 1
        ? finishPresentation()
        : (animationFrameId = windowHost.requestAnimationFrame(advancePresentationFrame)));
  }
  function handleDisplayReveal() {
    presentationPhase === "waiting" &&
      (coverWindow?.removeEventListener("hb-display-reveal", handleDisplayReveal),
      (presentationPhase = "running"),
      (animationFrameId = windowHost.requestAnimationFrame(advancePresentationFrame)));
  }
  function startPresentation() {
    if (presentationPhase !== "idle") return;
    const displaySplashElement = coverWindow?.document?.getElementById("display-splash");
    if (
      !displaySplashElement ||
      windowHost.document?.hidden ||
      windowHost.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      finishPresentation();
      return;
    }
    ((presentationPhase = "waiting"),
      onProgress(0),
      onShadowsProgress?.(0),
      onEffectsProgress?.(0));
    for (const addedEventName of interruptEventNames)
      windowHost.addEventListener(addedEventName, finishPresentation, true);
    (windowHost.addEventListener("pagehide", disposePresentation),
      windowHost.document?.addEventListener("visibilitychange", handleVisibilityChange),
      coverWindow.addEventListener("hb-display-reveal", handleDisplayReveal),
      displaySplashElement.classList.contains("is-leaving") && handleDisplayReveal());
  }
  function disposePresentation() {
    presentationPhase !== "disposed" &&
      ((presentationPhase = "disposed"),
      detachEventListeners(),
      onProgress(1),
      onShadowsProgress?.(1),
      onEffectsProgress?.(1));
  }
  return {
    start: startPresentation,
    finish: finishPresentation,
    shadowsReady: handleShadowsReady,
    effectsReady: handleEffectsReady,
    dispose: disposePresentation,
    get phase() {
      return presentationPhase;
    },
  };
}
