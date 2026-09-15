const pageBehaviorModuleUrl = new URL(
  import.meta.url.startsWith("file:")
    ? "../../static/modules/interaction3d/page-behavior.js?v=20260915211726"
    : "/static/modules/interaction3d/page-behavior.js?v=20260915211726",
  import.meta.url
);
export const { resolvePageBehavior } = await import(pageBehaviorModuleUrl.href);
export function createIdleRotation({
  now: now = () => performance.now(),
  returnToBase: returnToBase,
  start: startRotation,
  rotate: applyRotationStep,
  stop: stopRotation
}) {
  let rotationConfig = {
    enabled: false,
    idleSeconds: 30,
    speed: 6,
    direction: "clockwise"
  };
  let isRotationAvailable = false;
  let isRotationHeld = false;
  let rotationPhase = "waiting";
  let waitingSinceMs = now();
  let lastRotationMs = 0;
  let rotationAngleRad = 0;
  let rotationElapsedS = 0;
  let rotationActivityRevision = 0;
  function resetRotationState(activityTimestampMs = now()) {
    const wasRotating = rotationPhase === "returning" || rotationPhase === "rotating";
    rotationActivityRevision++;
    rotationPhase = "waiting";
    waitingSinceMs = activityTimestampMs;
    lastRotationMs = 0;
    rotationAngleRad = 0;
    rotationElapsedS = 0;
    if (wasRotating) {
      stopRotation();
    }
  }
  return {
    configure(configureOptions = {}, configureTimestampMs = now()) {
      const nextRotationConfig = {
        enabled: configureOptions?.enabled === true,
        direction:
          configureOptions?.direction === "counterclockwise" ? "counterclockwise" : "clockwise",
        idleSeconds: Number.isInteger(configureOptions?.idleSeconds)
          ? Math.max(1, Math.min(3600, configureOptions.idleSeconds))
          : 30,
        speed: Number.isFinite(configureOptions?.speed)
          ? Math.max(0.5, Math.min(30, configureOptions.speed))
          : 6
      };
      if (JSON.stringify(nextRotationConfig) !== JSON.stringify(rotationConfig)) {
        rotationConfig = nextRotationConfig;
        resetRotationState(configureTimestampMs);
      }
    },
    setAvailable(availableTimestampMs, availableFlag = now()) {
      if (isRotationAvailable !== !!availableTimestampMs) {
        isRotationAvailable = !!availableTimestampMs;
        resetRotationState(availableFlag);
      }
    },
    hold(heldFlag, holdTimestampMs = now()) {
      isRotationHeld = !!heldFlag;
      resetRotationState(holdTimestampMs);
    },
    activity: resetRotationState,
    tick(tickTimestampMs = now()) {
      if (!!rotationConfig.enabled && !!isRotationAvailable && !isRotationHeld) {
        if (
          rotationPhase === "waiting" &&
          tickTimestampMs - waitingSinceMs >= rotationConfig.idleSeconds * 1000
        ) {
          rotationPhase = "returning";
          const returnRevision = ++rotationActivityRevision;
          returnToBase(() => {
            if (
              returnRevision === rotationActivityRevision &&
              rotationPhase === "returning" &&
              !!isRotationAvailable &&
              !isRotationHeld &&
              !!rotationConfig.enabled
            ) {
              rotationPhase = "rotating";
              lastRotationMs = now();
              rotationAngleRad = 0;
              rotationElapsedS = 0;
              startRotation();
            }
          });
        } else if (rotationPhase === "rotating") {
          const deltaSeconds = Math.max(
            0,
            Math.min(0.1, (tickTimestampMs - lastRotationMs) / 1000)
          );
          lastRotationMs = tickTimestampMs;
          const rampProgress = Math.min(1, rotationElapsedS / 0.6);
          rotationElapsedS += deltaSeconds;
          rotationAngleRad =
            (rotationAngleRad +
              (((deltaSeconds * rotationConfig.speed * Math.PI) / 180) *
                (rampProgress + Math.min(1, rotationElapsedS / 0.6))) /
                2) %
            (Math.PI * 2);
          applyRotationStep(
            rotationConfig.direction === "counterclockwise" ? -rotationAngleRad : rotationAngleRad
          );
        }
      }
    },
    dispose() {
      isRotationAvailable = false;
      resetRotationState();
    },
    nextDelay(delayTimestampMs = now()) {
      if (!rotationConfig.enabled || !isRotationAvailable || isRotationHeld) {
        return Infinity;
      } else if (rotationPhase === "rotating") {
        return 0;
      } else if (rotationPhase === "waiting") {
        return Math.max(0, waitingSinceMs + rotationConfig.idleSeconds * 1000 - delayTimestampMs);
      } else {
        return Infinity;
      }
    },
    get phase() {
      return rotationPhase;
    }
  };
}
export function createIdleFocusExit({
  now: focusExitNow = () => performance.now(),
  onExit: onIdleExit
} = {}) {
  let focusExitConfig = {
    enabled: false,
    idleSeconds: 30
  };
  let isFocusExitAvailable = false;
  let isFocusExitHeld = false;
  let isFocusExitDisposed = false;
  let hasFocusIdleExited = false;
  let focusExitActivityMs = focusExitNow();
  function restartFocusIdleTimer(focusExitTimestampMs = focusExitNow()) {
    if (!isFocusExitDisposed) {
      focusExitActivityMs = focusExitTimestampMs;
      hasFocusIdleExited = false;
    }
  }
  return {
    configure(focusExitOptions = {}, focusExitConfigureMs = focusExitNow()) {
      if (isFocusExitDisposed) {
        return;
      }
      const nextFocusExitConfig = {
        enabled: focusExitOptions?.enabled === true,
        idleSeconds: Number.isInteger(focusExitOptions?.idleSeconds)
          ? Math.max(1, Math.min(3600, focusExitOptions.idleSeconds))
          : 30
      };
      if (
        nextFocusExitConfig.enabled !== focusExitConfig.enabled ||
        nextFocusExitConfig.idleSeconds !== focusExitConfig.idleSeconds
      ) {
        focusExitConfig = nextFocusExitConfig;
        restartFocusIdleTimer(focusExitConfigureMs);
      }
    },
    setAvailable(focusExitAvailableFlag, focusExitAvailableMs = focusExitNow()) {
      if (!isFocusExitDisposed && isFocusExitAvailable !== !!focusExitAvailableFlag) {
        isFocusExitAvailable = !!focusExitAvailableFlag;
        if (!isFocusExitAvailable) {
          isFocusExitHeld = false;
        }
        restartFocusIdleTimer(focusExitAvailableMs);
      }
    },
    hold(focusExitHeldFlag, focusExitHoldMs = focusExitNow()) {
      if (!isFocusExitDisposed) {
        isFocusExitHeld = !!focusExitHeldFlag;
        restartFocusIdleTimer(focusExitHoldMs);
      }
    },
    activity: restartFocusIdleTimer,
    tick(focusExitTickMs = focusExitNow()) {
      if (
        !isFocusExitDisposed &&
        !!focusExitConfig.enabled &&
        !!isFocusExitAvailable &&
        !isFocusExitHeld &&
        !hasFocusIdleExited
      ) {
        if (focusExitTickMs - focusExitActivityMs >= focusExitConfig.idleSeconds * 1000) {
          hasFocusIdleExited = true;
          onIdleExit();
        }
      }
    },
    nextDelay(focusExitDelayMs = focusExitNow()) {
      if (
        isFocusExitDisposed ||
        !focusExitConfig.enabled ||
        !isFocusExitAvailable ||
        isFocusExitHeld ||
        hasFocusIdleExited
      ) {
        return Infinity;
      } else {
        return Math.max(
          0,
          focusExitActivityMs + focusExitConfig.idleSeconds * 1000 - focusExitDelayMs
        );
      }
    },
    dispose() {
      isFocusExitDisposed = true;
      isFocusExitAvailable = false;
      isFocusExitHeld = false;
    }
  };
}
export function createIdleIconVisibility({
  now: iconVisibilityNow = () => performance.now(),
  onChange: onVisibilityChange = () => {}
} = {}) {
  let iconVisibilityConfig = {
    enabled: false,
    idleSeconds: 30
  };
  let isIconVisibilityAvailable = false;
  let isIconVisibilityHeld = false;
  let areIconsHidden = false;
  let isIconVisibilityDisposed = false;
  let iconActivityMs = iconVisibilityNow();
  function setIconsHidden(hiddenFlag) {
    if (areIconsHidden !== hiddenFlag) {
      areIconsHidden = hiddenFlag;
      onVisibilityChange(areIconsHidden);
    }
  }
  function restartIconIdleTimer(iconResetTimestampMs = iconVisibilityNow()) {
    if (!isIconVisibilityDisposed) {
      iconActivityMs = iconResetTimestampMs;
      setIconsHidden(false);
    }
  }
  return {
    configure(iconVisibilityOptions = {}, iconConfigureMs = iconVisibilityNow()) {
      if (isIconVisibilityDisposed) {
        return;
      }
      const nextIconVisibilityConfig = {
        enabled: iconVisibilityOptions?.enabled === true,
        idleSeconds: Number.isInteger(iconVisibilityOptions?.idleSeconds)
          ? Math.max(1, Math.min(3600, iconVisibilityOptions.idleSeconds))
          : 30
      };
      if (
        nextIconVisibilityConfig.enabled !== iconVisibilityConfig.enabled ||
        nextIconVisibilityConfig.idleSeconds !== iconVisibilityConfig.idleSeconds
      ) {
        iconVisibilityConfig = nextIconVisibilityConfig;
        restartIconIdleTimer(iconConfigureMs);
      }
    },
    setAvailable(iconAvailableFlag, iconAvailableMs = iconVisibilityNow()) {
      if (!isIconVisibilityDisposed && isIconVisibilityAvailable !== !!iconAvailableFlag) {
        isIconVisibilityAvailable = !!iconAvailableFlag;
        if (!isIconVisibilityAvailable) {
          isIconVisibilityHeld = false;
        }
        restartIconIdleTimer(iconAvailableMs);
      }
    },
    hold(iconHeldFlag, iconHoldMs = iconVisibilityNow()) {
      if (!isIconVisibilityDisposed) {
        isIconVisibilityHeld = !!iconHeldFlag;
        restartIconIdleTimer(iconHoldMs);
      }
    },
    activity: restartIconIdleTimer,
    tick(iconTickMs = iconVisibilityNow()) {
      if (
        !isIconVisibilityDisposed &&
        !!iconVisibilityConfig.enabled &&
        !!isIconVisibilityAvailable &&
        !isIconVisibilityHeld
      ) {
        if (iconTickMs - iconActivityMs >= iconVisibilityConfig.idleSeconds * 1000) {
          setIconsHidden(true);
        }
      }
    },
    dispose() {
      if (!isIconVisibilityDisposed) {
        isIconVisibilityDisposed = true;
        isIconVisibilityAvailable = false;
        isIconVisibilityHeld = false;
        setIconsHidden(false);
      }
    },
    get hidden() {
      return areIconsHidden;
    },
    nextDelay(iconDelayMs = iconVisibilityNow()) {
      if (
        isIconVisibilityDisposed ||
        !iconVisibilityConfig.enabled ||
        !isIconVisibilityAvailable ||
        isIconVisibilityHeld ||
        areIconsHidden
      ) {
        return Infinity;
      } else {
        return Math.max(0, iconActivityMs + iconVisibilityConfig.idleSeconds * 1000 - iconDelayMs);
      }
    }
  };
}
