/**
 * 空闲行为：自动旋转、自动退出聚焦、自动隐藏图标 —— 页面长时间无人操作时相机动起来（展台效果）、
 * 退出聚焦的设备、把图标元素收起来。
 *
 * 约定：三个工厂都不自己起定时器，由调用方按 nextDelay() 给出的间隔反复调用 tick()；时间统一用
 * performance.now() 口径（毫秒），可注入自定义 now 便于测试。三个工厂的 setAvailable / hold 一律是
 * 「标志位在前、时间戳在后」，形参名与实参含义保持一致。
 */

// 复用渲染器的页面行为解析（默认空闲秒数等），缓存戳需与 static 资源版本保持一致。
const pageBehaviorModuleUrl = new URL(
  import.meta.url.startsWith("file:")
    ? "../../../static/bridge/page-behavior.js?v=2609262312"
    : "/static/bridge/page-behavior.js?v=2609262312",
  import.meta.url
);
export const { resolvePageBehavior } = await import(pageBehaviorModuleUrl.href);
/**
 * 创建「空闲自动旋转」控制器。
 * 状态机：waiting（等待空闲）→ returning（先把相机拉回基准位）→ rotating（缓慢自转）；
 * 任何活动都会立刻回到 waiting，并中止正在进行的旋转。
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
      // 用序列化比较避免「每次状态刷新都重建配置」导致空闲计时被反复重置。
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
      // 这里原先形参名与实参含义相反（第一个叫 availableTimestampMs 却是布尔），
      // 照着名字传参会静默把「当前时间」当成标志位。
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
          // 期间用户若有任何操作（revision 变化）或场景已切换，就放弃启动旋转。
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
          // 不夹取的话相机会瞬间转过一大截。
          const deltaSeconds = Math.max(
            0,
            Math.min(0.1, (tickTimestampMs - lastRotationMs) / 1000)
          );
          lastRotationMs = tickTimestampMs;
          // 0.6 秒的加速段：用「上一帧的进度」与「本帧的进度」取平均，
          // 相当于梯形积分，起步时角速度从 0 平滑升到额定速度，不会突然一转。
          const rampProgress = Math.min(1, rotationElapsedS / 0.6);
          rotationElapsedS += deltaSeconds;
          // 角度按度/秒换算成弧度，并对 2π 取模，避免长时间运行后数值过大丢精度。
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
     *
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
 *
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
  // 一次性闩锁：触发过之后要等下一次 activity 才会解除，避免持续空闲时反复退出。
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
          // 不可用时顺带解除「临时挂起」，避免下次可用时仍处于挂起状态。
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
     *
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
  /** 更新隐藏状态；只有真正变化时才回调，避免每帧都刷 DOM。 */
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
     *
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
