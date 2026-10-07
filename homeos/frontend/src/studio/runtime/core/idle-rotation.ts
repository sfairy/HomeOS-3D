export { resolvePageBehavior } from "@app/bridge/page-behavior";
/** idle 配置项：三种 idle 控制器（旋转 / 聚焦退出 / 图标隐藏）共用。 */
type IdleRotationOptions = {
  enabled?: boolean;
  /** 顺时针 / 逆时针（只有旋转控制器用）。 */
  direction?: string;
  /** 空闲多少秒后触发，1..3600。 */
  idleSeconds?: number;
  /** 旋转速度（度/秒），0.5..30。 */
  speed?: number;
};

export function createIdleRotation({
  now: now = () => performance.now(),
  returnToBase: returnToBase,
  start: startRotation,
  rotate: applyRotationStep,
  stop: stopRotation,
}: any) {
  let rotationConfig = {
      enabled: false,
      idleSeconds: 30,
      speed: 6,
      direction: "clockwise",
    },
    isRotationAvailable = false,
    isRotationHeld = false,
    rotationPhase = "waiting",
    waitingSinceMs = now(),
    lastRotationMs = 0,
    rotationAngleRad = 0,
    rotationElapsedS = 0,
    rotationActivityRevision = 0;
  function resetRotationState(activityTimestampMs = now()) {
    const wasRotating = rotationPhase === "returning" || rotationPhase === "rotating";
    (rotationActivityRevision++,
      (rotationPhase = "waiting"),
      (waitingSinceMs = activityTimestampMs),
      (lastRotationMs = 0),
      (rotationAngleRad = 0),
      (rotationElapsedS = 0),
      wasRotating && stopRotation());
  }
  return {
    configure(configureOptions: IdleRotationOptions = {}, configureTimestampMs = now()) {
      const nextRotationConfig = {
        enabled: configureOptions?.enabled === true,
        direction:
          configureOptions?.direction === "counterclockwise" ? "counterclockwise" : "clockwise",
        idleSeconds: Number.isInteger(configureOptions?.idleSeconds)
          ? Math.max(1, Math.min(3600, configureOptions.idleSeconds!))
          : 30,
        speed: Number.isFinite(configureOptions?.speed)
          ? Math.max(0.5, Math.min(30, configureOptions.speed!))
          : 6,
      };
      JSON.stringify(nextRotationConfig) !== JSON.stringify(rotationConfig) &&
        ((rotationConfig = nextRotationConfig), resetRotationState(configureTimestampMs));
    },
    setAvailable(availableFlag: any, availableTimestampMs = now()) {
      isRotationAvailable !== !!availableFlag &&
        ((isRotationAvailable = !!availableFlag), resetRotationState(availableTimestampMs));
    },
    hold(heldFlag: any, holdTimestampMs = now()) {
      ((isRotationHeld = !!heldFlag), resetRotationState(holdTimestampMs));
    },
    activity: resetRotationState,
    tick(tickTimestampMs = now()) {
      if (!(!rotationConfig.enabled || !isRotationAvailable || isRotationHeld)) {
        if (
          rotationPhase === "waiting" &&
          tickTimestampMs - waitingSinceMs >= rotationConfig.idleSeconds * 1000
        ) {
          rotationPhase = "returning";
          const returnRevision = ++rotationActivityRevision;
          returnToBase(() => {
            returnRevision !== rotationActivityRevision ||
              rotationPhase !== "returning" ||
              !isRotationAvailable ||
              isRotationHeld ||
              !rotationConfig.enabled ||
              ((rotationPhase = "rotating"),
              (lastRotationMs = now()),
              (rotationAngleRad = 0),
              (rotationElapsedS = 0),
              startRotation());
          });
        } else {
          if (rotationPhase === "rotating") {
            const deltaSeconds = Math.max(
              0,
              Math.min(0.1, (tickTimestampMs - lastRotationMs) / 1000),
            );
            lastRotationMs = tickTimestampMs;
            const rampProgress = Math.min(1, rotationElapsedS / 0.6);
            ((rotationElapsedS += deltaSeconds),
              (rotationAngleRad =
                (rotationAngleRad +
                  (((deltaSeconds * rotationConfig.speed * Math.PI) / 180) *
                    (rampProgress + Math.min(1, rotationElapsedS / 0.6))) /
                    2) %
                (Math.PI * 2)),
              applyRotationStep(
                rotationConfig.direction === "counterclockwise"
                  ? -rotationAngleRad
                  : rotationAngleRad,
              ));
          }
        }
      }
    },
    dispose() {
      ((isRotationAvailable = false), resetRotationState());
    },
    nextDelay(delayTimestampMs = now()) {
      return !rotationConfig.enabled || !isRotationAvailable || isRotationHeld
        ? Infinity
        : rotationPhase === "rotating"
          ? 0
          : rotationPhase === "waiting"
            ? Math.max(0, waitingSinceMs + rotationConfig.idleSeconds * 1000 - delayTimestampMs)
            : Infinity;
    },
    get phase() {
      return rotationPhase;
    },
  };
}
export function createIdleFocusExit({
  now: focusExitNow = () => performance.now(),
  onExit: onIdleExit,
}: { now?: () => number; onExit?: (...args: any[]) => any } = {}) {
  let focusExitConfig = {
      enabled: false,
      idleSeconds: 30,
    },
    isFocusExitAvailable = false,
    isFocusExitHeld = false,
    isFocusExitDisposed = false,
    hasFocusIdleExited = false,
    focusExitActivityMs = focusExitNow();
  function restartFocusIdleTimer(focusExitTimestampMs = focusExitNow()) {
    isFocusExitDisposed ||
      ((focusExitActivityMs = focusExitTimestampMs), (hasFocusIdleExited = false));
  }
  return {
    configure(focusExitOptions: IdleRotationOptions = {}, focusExitConfigureMs = focusExitNow()) {
      if (isFocusExitDisposed) return;
      const nextFocusExitConfig = {
        enabled: focusExitOptions?.enabled === true,
        idleSeconds: Number.isInteger(focusExitOptions?.idleSeconds)
          ? Math.max(1, Math.min(3600, focusExitOptions.idleSeconds!))
          : 30,
      };
      (nextFocusExitConfig.enabled === focusExitConfig.enabled &&
        nextFocusExitConfig.idleSeconds === focusExitConfig.idleSeconds) ||
        ((focusExitConfig = nextFocusExitConfig), restartFocusIdleTimer(focusExitConfigureMs));
    },
    setAvailable(focusExitAvailableFlag: any, focusExitAvailableMs = focusExitNow()) {
      isFocusExitDisposed ||
        isFocusExitAvailable === !!focusExitAvailableFlag ||
        ((isFocusExitAvailable = !!focusExitAvailableFlag),
        isFocusExitAvailable || (isFocusExitHeld = false),
        restartFocusIdleTimer(focusExitAvailableMs));
    },
    hold(focusExitHeldFlag: any, focusExitHoldMs = focusExitNow()) {
      isFocusExitDisposed ||
        ((isFocusExitHeld = !!focusExitHeldFlag), restartFocusIdleTimer(focusExitHoldMs));
    },
    activity: restartFocusIdleTimer,
    tick(focusExitTickMs = focusExitNow()) {
      isFocusExitDisposed ||
        !focusExitConfig.enabled ||
        !isFocusExitAvailable ||
        isFocusExitHeld ||
        hasFocusIdleExited ||
        (focusExitTickMs - focusExitActivityMs >= focusExitConfig.idleSeconds * 1000 &&
          ((hasFocusIdleExited = true), onIdleExit!()));
    },
    nextDelay(focusExitDelayMs = focusExitNow()) {
      return isFocusExitDisposed ||
        !focusExitConfig.enabled ||
        !isFocusExitAvailable ||
        isFocusExitHeld ||
        hasFocusIdleExited
        ? Infinity
        : Math.max(0, focusExitActivityMs + focusExitConfig.idleSeconds * 1000 - focusExitDelayMs);
    },
    dispose() {
      ((isFocusExitDisposed = true), (isFocusExitAvailable = false), (isFocusExitHeld = false));
    },
  };
}
export function createIdleIconVisibility({
  now: iconVisibilityNow = () => performance.now(),
  onChange: onVisibilityChange = (_hiddenFlag: boolean) => {},
} = {}) {
  let iconVisibilityConfig = {
      enabled: false,
      idleSeconds: 30,
    },
    isIconVisibilityAvailable = false,
    isIconVisibilityHeld = false,
    shouldHideIcons = false,
    isIconVisibilityDisposed = false,
    iconActivityMs = iconVisibilityNow();
  function setIconsHidden(hiddenFlag: any) {
    shouldHideIcons !== hiddenFlag &&
      ((shouldHideIcons = hiddenFlag), onVisibilityChange(shouldHideIcons));
  }
  function restartIconIdleTimer(iconResetTimestampMs = iconVisibilityNow()) {
    isIconVisibilityDisposed || ((iconActivityMs = iconResetTimestampMs), setIconsHidden(false));
  }
  return {
    configure(iconVisibilityOptions: IdleRotationOptions = {}, iconConfigureMs = iconVisibilityNow()) {
      if (isIconVisibilityDisposed) return;
      const nextIconVisibilityConfig = {
        enabled: iconVisibilityOptions?.enabled === true,
        idleSeconds: Number.isInteger(iconVisibilityOptions?.idleSeconds)
          ? Math.max(1, Math.min(3600, iconVisibilityOptions.idleSeconds!))
          : 30,
      };
      (nextIconVisibilityConfig.enabled === iconVisibilityConfig.enabled &&
        nextIconVisibilityConfig.idleSeconds === iconVisibilityConfig.idleSeconds) ||
        ((iconVisibilityConfig = nextIconVisibilityConfig), restartIconIdleTimer(iconConfigureMs));
    },
    setAvailable(iconAvailableFlag: any, iconAvailableMs = iconVisibilityNow()) {
      isIconVisibilityDisposed ||
        isIconVisibilityAvailable === !!iconAvailableFlag ||
        ((isIconVisibilityAvailable = !!iconAvailableFlag),
        isIconVisibilityAvailable || (isIconVisibilityHeld = false),
        restartIconIdleTimer(iconAvailableMs));
    },
    hold(iconHeldFlag: any, iconHoldMs = iconVisibilityNow()) {
      isIconVisibilityDisposed ||
        ((isIconVisibilityHeld = !!iconHeldFlag), restartIconIdleTimer(iconHoldMs));
    },
    activity: restartIconIdleTimer,
    tick(iconTickMs = iconVisibilityNow()) {
      isIconVisibilityDisposed ||
        !iconVisibilityConfig.enabled ||
        !isIconVisibilityAvailable ||
        isIconVisibilityHeld ||
        (iconTickMs - iconActivityMs >= iconVisibilityConfig.idleSeconds * 1000 &&
          setIconsHidden(true));
    },
    dispose() {
      isIconVisibilityDisposed ||
        ((isIconVisibilityDisposed = true),
        (isIconVisibilityAvailable = false),
        (isIconVisibilityHeld = false),
        setIconsHidden(false));
    },
    get hidden() {
      return shouldHideIcons;
    },
    nextDelay(iconDelayMs = iconVisibilityNow()) {
      return isIconVisibilityDisposed ||
        !iconVisibilityConfig.enabled ||
        !isIconVisibilityAvailable ||
        isIconVisibilityHeld ||
        shouldHideIcons
        ? Infinity
        : Math.max(0, iconActivityMs + iconVisibilityConfig.idleSeconds * 1000 - iconDelayMs);
    },
  };
}
