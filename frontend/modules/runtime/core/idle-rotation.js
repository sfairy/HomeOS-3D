/**
 * 空闲行为：自动旋转、自动退出聚焦、自动隐藏图标 —— 页面长时间无人操作时相机动起来（展台效果）、
 */

// 复用渲染器的页面行为解析（默认空闲秒数等），缓存戳需与 static 资源版本保持一致。
const pageBehaviorModuleUrl = new URL(
  import.meta.url.startsWith("file:")
    ? "../../../static/bridge/page-behavior.js?v=2609271508"
    : "/static/bridge/page-behavior.js?v=2609271508",
  import.meta.url
);
export const { resolvePageBehavior } = await import(pageBehaviorModuleUrl.href);
/**
 * 创建「空闲自动旋转」控制器。
 */
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
  // 活动代次号：每次有活动就自增，用于让「拉回基准位」的异步回调自动失效。
  let rotationActivityRevision = 0;
  /**
   * 复位到等待状态。
   */
  function resetRotationState(activityTimestampMs = now()) {
    const wasRotating = rotationPhase === "returning" || rotationPhase === "rotating";
    rotationActivityRevision++;
    rotationPhase = "waiting";
    waitingSinceMs = activityTimestampMs;
    lastRotationMs = 0;
    rotationAngleRad = 0;
    rotationElapsedS = 0;
    // 只有在运动过程中才需要通知外部停止，纯等待状态下不必打扰渲染层。
    if (wasRotating) {
      stopRotation();
    }
  }
  return {
    /**
     * 应用配置；配置实际变化时才复位计时。
     */
    configure(configureOptions = {}, configureTimestampMs = now()) {
      // 逐项夹取到合法区间：空闲时长 1–3600 秒（默认 30），速度 0.5–30 度/秒（默认 6）。
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
    /**
     * 设置「当前场景是否允许旋转」（例如是否处于可旋转的页面 / 视图）。
     */
    setAvailable(availableFlag, availableTimestampMs = now()) {
      // 与 idleFocusExit / idleIconVisibility 同形：标志位在前、时间戳在后。
      if (isRotationAvailable !== !!availableFlag) {
        isRotationAvailable = !!availableFlag;
        resetRotationState(availableTimestampMs);
      }
    },
    /**
     * 外部临时挂起空闲旋转（例如正在拖拽相机）。
     */
    hold(heldFlag, holdTimestampMs = now()) {
      isRotationHeld = !!heldFlag;
      resetRotationState(holdTimestampMs);
    },
    activity: resetRotationState,
    /**
     * 推进状态机。
     */
    tick(tickTimestampMs = now()) {
      if (!!rotationConfig.enabled && !!isRotationAvailable && !isRotationHeld) {
        if (
          rotationPhase === "waiting" &&
          tickTimestampMs - waitingSinceMs >= rotationConfig.idleSeconds * 1000
        ) {
          rotationPhase = "returning";
          const returnRevision = ++rotationActivityRevision;
          // 拉回基准位是异步的（可能带动画）。回调里必须逐项复核状态：
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
          // 单帧步长上限 0.1 秒：页面切到后台再回来时时间差可能是几十秒，
          const deltaSeconds = Math.max(
            0,
            Math.min(0.1, (tickTimestampMs - lastRotationMs) / 1000)
          );
          lastRotationMs = tickTimestampMs;
          // 0.6 秒的加速段：用「上一帧的进度」与「本帧的进度」取平均，
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
    /**
     * 距离下一次需要 tick 还有多久。
     * @returns {number} 毫秒；旋转中返回 0（需要每帧调用），其余不可用情况返回 Infinity。
     */
    nextDelay(delayTimestampMs = now()) {
      if (!rotationConfig.enabled || !isRotationAvailable || isRotationHeld) {
        return Infinity;
      } else if (rotationPhase === "rotating") {
        return 0;
      } else if (rotationPhase === "waiting") {
        return Math.max(0, waitingSinceMs + rotationConfig.idleSeconds * 1000 - delayTimestampMs);
      } else {
        // returning 阶段由 returnToBase 的回调驱动，不需要 tick。
        return Infinity;
      }
    },
    get phase() {
      return rotationPhase;
    }
  };
}
/**
 * 创建「空闲自动退出聚焦」控制器。
 * @param {() => void} [options.onExit] 空闲超时时的回调（每次空闲只触发一次）。
 */
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
  /** 重新开始空闲计时（同时解除已触发闩锁）。 */
  function restartFocusIdleTimer(focusExitTimestampMs = focusExitNow()) {
    if (!isFocusExitDisposed) {
      focusExitActivityMs = focusExitTimestampMs;
      hasFocusIdleExited = false;
    }
  }
  return {
    /**
     * 应用配置。
     */
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
    /**
     * 设置当前是否允许自动退出聚焦。
     */
    setAvailable(focusExitAvailableFlag, focusExitAvailableMs = focusExitNow()) {
      if (!isFocusExitDisposed && isFocusExitAvailable !== !!focusExitAvailableFlag) {
        isFocusExitAvailable = !!focusExitAvailableFlag;
        if (!isFocusExitAvailable) {
          isFocusExitHeld = false;
        }
        restartFocusIdleTimer(focusExitAvailableMs);
      }
    },
    /**
     * 临时挂起自动退出。
     */
    hold(focusExitHeldFlag, focusExitHoldMs = focusExitNow()) {
      if (!isFocusExitDisposed) {
        isFocusExitHeld = !!focusExitHeldFlag;
        restartFocusIdleTimer(focusExitHoldMs);
      }
    },
    activity: restartFocusIdleTimer,
    /**
     * 推进计时。
     */
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
    /**
     * 距离下次 tick 的间隔。
     * @returns {number} 毫秒；已触发 / 不可用时返回 Infinity。
     */
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
/**
 * 创建「空闲自动隐藏图标」控制器。
 */
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
  /** 重新开始空闲计时，并立即把图标显示出来（任何活动都等于「用户回来了」）。 */
  function restartIconIdleTimer(iconResetTimestampMs = iconVisibilityNow()) {
    if (!isIconVisibilityDisposed) {
      iconActivityMs = iconResetTimestampMs;
      setIconsHidden(false);
    }
  }
  return {
    /**
     * 应用配置。
     */
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
    /**
     * 设置当前是否允许隐藏图标。
     */
    setAvailable(iconAvailableFlag, iconAvailableMs = iconVisibilityNow()) {
      if (!isIconVisibilityDisposed && isIconVisibilityAvailable !== !!iconAvailableFlag) {
        isIconVisibilityAvailable = !!iconAvailableFlag;
        if (!isIconVisibilityAvailable) {
          isIconVisibilityHeld = false;
        }
        restartIconIdleTimer(iconAvailableMs);
      }
    },
    /**
     * 临时挂起自动隐藏（例如打开了面板，图标必须保持可见）。
     */
    hold(iconHeldFlag, iconHoldMs = iconVisibilityNow()) {
      if (!isIconVisibilityDisposed) {
        isIconVisibilityHeld = !!iconHeldFlag;
        restartIconIdleTimer(iconHoldMs);
      }
    },
    activity: restartIconIdleTimer,
    /**
     * 推进计时。
     */
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
    /**
     * 距离下次 tick 的间隔。
     * @returns {number} 毫秒；已经隐藏或不可用时返回 Infinity（无需再 tick）。
     */
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
