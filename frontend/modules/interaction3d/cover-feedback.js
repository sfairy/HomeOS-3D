/**
 * 窗帘的「展示态」推算：把 HA 的离散上报补成连续的动画表现。
 *
 * 在 3D 子系统里的位置：HA 只会在位置变化时上报 current_position，而窗帘在
 * 6 秒的行程里可能只上报两三次。本模块夹在状态与 3D 动画之间，负责：
 * 1) 平滑补间（smoothingTime）——把跳变的位置渲染成连续运动；
 * 2) 指令乐观推算（commandPreview）——用户点了开合后立刻按行程时间推算位置；
 * 3) 断线续算（storage）——梦幻帘没有可信整体反馈，刷新页面后接着推算。
 *
 * 对外提供：createCoverFeedback —— 返回 sync / begin / startPreview / fail / read /
 * tick / nextDelay / retain / preview / clear。
 *
 * 与 HA 的字段约定：判定「上报是否更新」用 attributes.last_updated / updatedAt；
 * 梦幻帘（dream）且 overallFeedbackAvailable === false 时才启用持久化。
 */

/**
 * 创建窗帘展示态推算器。
 *
 * @param {object} [options] 参数。
 * @param {() => number} [options.now] 单调时钟（performance.now），用于补间计时。
 * @param {number} [options.smoothingTime=180] 位置补间时长（毫秒）。
 * @param {boolean} [options.commandPreview=false] 是否启用指令乐观推算。
 * @param {number} [options.travelTime=6000] 走完全程（0→100%）的假设耗时（毫秒）。
 * @param {Storage} [options.storage] 持久化后端，通常为 localStorage。
 * @param {string} [options.scope] 存储作用域（隔离不同页面 / 项目）。
 * @param {() => number} [options.wallNow] 墙上时钟（Date.now），用于跨刷新计时。
 * @returns {object} 推算器句柄。
 */
export function createCoverFeedback({
  now: now = () => performance.now(),
  smoothingTime: smoothingTime = 180,
  commandPreview: commandPreview = false,
  travelTime: travelTime = 6000,
  storage,
  scope,
  wallNow: wallNow = () => Date.now()
} = {}) {
  const feedbackByEntityId = new Map();
  /** 取 HA 上报时间戳（毫秒）；两个字段名对应不同版本的后端。 */
  const readLastUpdated = state =>
    Date.parse(state.raw?.last_updated ?? state.raw?.updatedAt ?? "");
  /** 存储键：无 scope 时返回 null，表示不持久化。 */
  const storageKeyFor = entityId =>
    scope ? `hb-cover-presentation:v1:${scope}:${entityId}` : null;
  // 只有「梦幻帘 + 没有可信整体反馈」才值得持久化：其它情况刷新后能从 HA 直接拿到真实位置。
  const shouldPersist = entry =>
    commandPreview &&
    entry.actual.dream &&
    entry.actual.overallFeedbackAvailable === false;
  /** 清除某实体的持久化数据（容错：存储不可用 / 配额满时静默忽略）。 */
  function clearPresentation(entityId) {
    try {
      const storageKey = storageKeyFor(entityId);
      if (storageKey) {
        storage?.removeItem(storageKey);
      }
    } catch {}
  }
  /** 保存当前推算位置与剩余运动，供刷新后继续。 */
  function savePresentation(entityId, entry) {
    if (!shouldPersist(entry) || !entry.estimated || entry.position === null) {
      return;
    }
    const activeMotion = entry.motion;
    const payload = {
      position: entry.position,
      savedAt: wallNow(),
      motion: activeMotion
        ? {
            to: activeMotion.to,
            // 只存「剩余时长」而不是终点时间：performance.now() 跨刷新不可比，
            // 靠墙上时钟 + 剩余时长才能续算。
            duration: Math.max(0, activeMotion.duration - (now() - activeMotion.start))
          }
        : null
    };
    try {
      const storageKey = storageKeyFor(entityId);
      if (storageKey) {
        storage?.setItem(storageKey, JSON.stringify(payload));
      }
    } catch {}
  }
  /** 从存储恢复推算位置，并按已过去的时间推进剩余运动。 */
  function restorePresentation(entityId, entry) {
    if (!shouldPersist(entry)) {
      clearPresentation(entityId);
      return;
    }
    try {
      const storageKey = storageKeyFor(entityId);
      const stored = storageKey && JSON.parse(storage?.getItem(storageKey) || "null");
      // 校验从存储恢复的位置值：必须是 0~100 之间的有限数字。存储内容属于外部输入，
      // 手改 / 旧版本残留 / 损坏都可能塞进字符串或越界值，NaN 一旦进入动画就会整条卡死。
      const isValidPosition = value =>
        typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= 100;
      // 存储内容是外部输入，逐项校验：位置必须落在 0–100，时间戳必须可解析。
      if (!stored || !isValidPosition(stored.position) || !Number.isFinite(stored.savedAt)) {
        return;
      }
      const elapsedMs = Math.max(0, wallNow() - stored.savedAt);
      const storedMotion = stored.motion;
      // 运动数据的合法性额外限制：终点位置合法、时长在 [0, travelTime] 内，
      // 超出单程时间的值只可能是脏数据。
      if (
        storedMotion &&
        (!isValidPosition(storedMotion.to) ||
          !Number.isFinite(storedMotion.duration) ||
          storedMotion.duration < 0 ||
          storedMotion.duration > travelTime)
      ) {
        return;
      }
      entry.position = stored.position;
      if (storedMotion) {
        // 按「已过时间 / 剩余时长」推进到当前位置；跑满了就停在终点。
        const progress =
          storedMotion.duration > 0 ? Math.min(1, elapsedMs / storedMotion.duration) : 1;
        entry.position += (storedMotion.to - entry.position) * progress;
        if (progress < 1) {
          entry.motion = {
            from: entry.position,
            to: storedMotion.to,
            start: now(),
            duration: storedMotion.duration - elapsedMs
          };
        }
      }
      // 恢复出来的位置属于推算值，且整体反馈仍不可信。
      entry.estimated = true;
      entry.railUnconfirmed = true;
    } catch {}
  }
  /** 推进补间；返回是否有运动在推进（调用方据此决定是否重绘）。 */
  function advanceMotion(trackedEntry, timeMs) {
    if (!trackedEntry.motion) {
      return false;
    }
    const {
      from: fromPosition,
      to: toPosition,
      start: startedAt,
      duration: durationMs = smoothingTime
    } = trackedEntry.motion;
    const progress = Math.max(0, Math.min(1, (timeMs - startedAt) / durationMs));
    trackedEntry.position = fromPosition + (toPosition - fromPosition) * progress;
    if (progress === 1) {
      trackedEntry.motion = null;
    }
    return true;
  }
  /**
   * 吸收一次 HA 上报，更新展示态。
   *
   * @param {string} entityId 实体 ID。
   * @param {object} nextState 归一化后的窗帘状态。
   * @returns {void}
   */
  function sync(entityId, nextState) {
    let entry = feedbackByEntityId.get(entityId);
    if (!entry) {
      // 首次见到该实体：建立记录并尝试恢复持久化的推算位置。
      entry = {
        actual: nextState,
        position: nextState.position,
        motion: null,
        intent: null,
        token: null,
        error: "",
        draft: null,
        bladeHold: null,
        railUnconfirmed: false,
        estimated: false,
        lastAvailable: nextState.available ? nextState : null,
        lastTimestamp: readLastUpdated(nextState)
      };
      restorePresentation(entityId, entry);
      feedbackByEntityId.set(entityId, entry);
      return;
    }
    const previousState = entry.actual;
    // HA 的事件可能乱序到达：比已见过的时间戳更旧的上报直接丢弃。
    if (readLastUpdated(nextState) < entry.lastTimestamp) {
      return;
    }
    if (Number.isFinite(readLastUpdated(nextState))) {
      entry.lastTimestamp = readLastUpdated(nextState);
    }
    // 梦幻帘属性或反馈能力变了：语义已经不同，旧记录不能复用，重建一条。
    if (
      nextState.dream !== previousState.dream ||
      nextState.overallFeedbackAvailable !== previousState.overallFeedbackAvailable
    ) {
      feedbackByEntityId.delete(entityId);
      sync(entityId, nextState);
      return;
    }
    // 三个变化标记：真实位置变了、state 文案变了、以及「上次可用值」是否变化
    // （用于判断有没有收到一份新鲜且可用的状态）。
    const positionChanged = nextState.position !== previousState.position;
    const stateChanged = nextState.state !== previousState.state;
    const lastAvailableChanged =
      !entry.lastAvailable ||
      nextState.position !== entry.lastAvailable.position ||
      nextState.state !== entry.lastAvailable.state;
    entry.actual = nextState;
    advanceMotion(entry, now());
    if (!nextState.available) {
      // 设备掉线：清掉乐观推算，梦幻帘还要标记导轨状态未知（位置反馈不可信）。
      entry.motion = null;
      entry.intent = null;
      entry.draft = null;
      entry.bladeHold = null;
      entry.railUnconfirmed = !!nextState.dream;
      savePresentation(entityId, entry);
      return;
    }
    entry.lastAvailable = nextState;
    if (entry.bladeHold !== null) {
      // 叶片指令后的保持：等设备上报的位置追上目标值再解除，避免中途被旧值覆盖。
      if (nextState.position !== entry.bladeHold) {
        return;
      }
      entry.position = nextState.position;
      entry.motion = null;
      entry.estimated = false;
      entry.bladeHold = null;
      entry.intent = null;
      return;
    }
    if (
      positionChanged ||
      // 叶片轴的特殊情况：位置值可能不变，但上报时间更新了，也算一次有效反馈。
      (entry.estimated &&
        nextState.axis === "blade" &&
        readLastUpdated(nextState) > readLastUpdated(previousState))
    ) {
      entry.estimated = false;
      if (
        nextState.position === null ||
        entry.position === null ||
        // 已经停稳且不是叶片时不必补间，直接对齐就行。
        (!nextState.moving && nextState.axis !== "blade") ||
        smoothingTime <= 0
      ) {
        entry.position = nextState.position;
        entry.motion = null;
      } else {
        // 正在运动：从当前位置补间到上报位置，掩盖上报间隔造成的跳变。
        entry.motion = {
          from: entry.position,
          to: nextState.position,
          start: now()
        };
      }
    } else if (stateChanged && !nextState.moving) {
      // 位置没变但状态变了（例如从 opening 变成 open）：停止估算并对齐。
      entry.estimated = false;
      entry.position = nextState.position;
      entry.motion = null;
    }
    if (
      lastAvailableChanged &&
      nextState.overallFeedbackAvailable !== false &&
      // 逗号表达式：只要走到这里就先解除「导轨未知」标记，同时用 intent 是否存在作为条件。
      ((entry.railUnconfirmed = false), entry.intent)
    ) {
      const reachedIntentTarget =
        nextState.position !== null && nextState.position === entry.intent.target;
      if (
        (!nextState.moving &&
          (reachedIntentTarget ||
            entry.intent.service === "stop_cover" ||
            entry.intent.confirmed)) ||
        (positionChanged && !nextState.moving)
      ) {
        // 目标达成、暂停命令生效，或此前已确认过动起来并已停稳：意图完成。
        entry.intent = null;
      } else if (nextState.moving) {
        // 确认设备真的动了：把过期时间取消，剩下的等待交给状态变化驱动。
        entry.intent.confirmed = true;
        entry.intent.expires = Infinity;
      }
    }
  }
  /**
   * 登记一条用户指令（乐观展示的起点）。
   *
   * @param {object} command 命令描述（entityId / service / data）。
   * @param {*} token 本次命令的令牌，用于匹配后续的回调。
   * @param {object} [options] 参数。
   * @param {boolean} [options.defer=false] 为 true 时先不启动推算（等外部显式触发）。
   * @returns {void}
   */
  function begin(command, token, { defer: defer = false } = {}) {
    const commandEntry = feedbackByEntityId.get(command.entityId);
    if (!commandEntry) {
      return;
    }
    advanceMotion(commandEntry, now());
    commandEntry.error = "";
    commandEntry.token = token;
    const draftPosition = commandEntry.draft;
    commandEntry.draft = null;
    commandEntry.bladeHold = null;
    // 由服务名推断目标位置：打开即 100，关闭即 0，暂停无目标，设位置取参数。
    const intentTarget =
      command.service === "open_cover"
        ? 100
        : command.service === "close_cover"
          ? 0
          : command.service === "stop_cover"
            ? null
            : command.data.position;
    if (
      commandPreview &&
      command.service === "set_cover_position" &&
      draftPosition !== null &&
      // 只有「拖动预览值正好就是下发值」时才直接采信草稿：
      // 否则说明设备回报的位置与用户拖动不一致，应以设备为准。
      draftPosition === intentTarget
    ) {
      commandEntry.position = draftPosition;
      commandEntry.motion = null;
      commandEntry.estimated = true;
      if (commandEntry.actual.axis === "blade") {
        commandEntry.bladeHold = intentTarget;
      }
    }
    if (command.service === "stop_cover" || defer) {
      commandEntry.motion = null;
    }
    // 15 秒的意图生存期：超过它仍未从状态里得到确认就放弃（避免界面一直「执行中」）。
    commandEntry.intent = {
      service: command.service,
      target: intentTarget,
      confirmed: false,
      expires: now() + 15000
    };
    if (commandPreview && !defer && intentTarget !== null) {
      startPreview(command.entityId, token);
    }
    if (
      commandEntry.actual.dream &&
      ["open_cover", "close_cover", "stop_cover"].includes(command.service)
    ) {
      // 与 cover-panel 的判定一致：开过之后整体位置反馈不再可信。
      commandEntry.railUnconfirmed =
        commandEntry.railUnconfirmed ||
        command.service === "open_cover" ||
        !commandEntry.actual.closedConfirmed;
    }
    savePresentation(command.entityId, commandEntry);
  }
  /**
   * 启动乐观推算：按行程时间把当前位置动画到目标位置。
   *
   * @param {string} previewEntityId 实体 ID。
   * @param {*} previewToken 命令令牌，必须与当前令牌一致。
   * @returns {boolean} 是否启动了推算。
   */
  function startPreview(previewEntityId, previewToken) {
    const previewEntry = feedbackByEntityId.get(previewEntityId);
    if (
      !commandPreview ||
      !previewEntry?.intent ||
      previewEntry.token !== previewToken ||
      previewEntry.intent.target === null
    ) {
      return false;
    }
    advanceMotion(previewEntry, now());
    const startPosition = previewEntry.position ?? 0;
    const targetPosition = previewEntry.intent.target;
    previewEntry.position = startPosition;
    // 判定为推算值的三种情况：还有行程要走、设备位置还没跟上、或导轨状态未知。
    previewEntry.estimated =
      startPosition !== targetPosition ||
      previewEntry.actual.position !== targetPosition ||
      previewEntry.railUnconfirmed;
    previewEntry.motion =
      startPosition === targetPosition
        ? null
        : {
            from: startPosition,
            to: targetPosition,
            start: now(),
            // 时长按行程比例计算（走过半程就只等半程），并保底 180ms：
            // 太短的动画看起来像瞬移，反而失去「正在动」的反馈。
            duration: Math.max(180, (Math.abs(targetPosition - startPosition) / 100) * travelTime)
          };
    savePresentation(previewEntityId, previewEntry);
    return true;
  }
  /**
   * 命令失败：回退到真实位置并清除乐观状态。
   *
   * @param {string} failedEntityId 实体 ID。
   * @param {*} failedToken 命令令牌。
   * @param {string} message 错误文案。
   * @returns {boolean} 是否处理了本次失败。
   */
  function fail(failedEntityId, failedToken, message) {
    const failedEntry = feedbackByEntityId.get(failedEntityId);
    // 令牌不匹配说明这是过期回调（用户又发了新命令），忽略。
    if (!failedEntry || failedEntry.token !== failedToken) {
      return false;
    }
    advanceMotion(failedEntry, now());
    failedEntry.motion = null;
    failedEntry.intent = null;
    failedEntry.draft = null;
    failedEntry.bladeHold = null;
    failedEntry.error = message;
    if (failedEntry.actual.position !== null) {
      // 回退到设备上报的位置；位置未知时保持现状。
      failedEntry.position = failedEntry.actual.position;
      failedEntry.estimated = false;
    }
    clearPresentation(failedEntityId);
    return true;
  }
  /**
   * 读取合并了推算结果的展示态。
   *
   * @param {string} readEntityId 实体 ID。
   * @param {object} fallbackState 没有记录时直接返回的状态。
   * @returns {object} 展示态（字段与归一化状态兼容，额外带 estimated / preview 等）。
   */
  function read(readEntityId, fallbackState) {
    const snapshotEntry = feedbackByEntityId.get(readEntityId);
    if (!snapshotEntry) {
      return fallbackState;
    }
    const hasMotionEstimate = !!snapshotEntry.estimated && !!snapshotEntry.motion;
    // 估算中时，开合方向由补间的走向决定 —— 设备还没上报，state 还是旧值。
    const opening = hasMotionEstimate
      ? snapshotEntry.motion.to > snapshotEntry.motion.from
      : snapshotEntry.actual.opening;
    const closing = hasMotionEstimate
      ? snapshotEntry.motion.to < snapshotEntry.motion.from
      : snapshotEntry.actual.closing;
    return {
      ...snapshotEntry.actual,
      // 拖动中的草稿优先于推算位置，让滑杆与 3D 场景同步。
      position: (commandPreview ? snapshotEntry.draft : null) ?? snapshotEntry.position,
      estimated: snapshotEntry.estimated,
      dragging: !!commandPreview && snapshotEntry.draft !== null,
      state: hasMotionEstimate ? (opening ? "opening" : "closing") : snapshotEntry.actual.state,
      opening: opening,
      closing: closing,
      moving: opening || closing,
      // on 的判定分两种：有可信反馈时看设备；梦幻帘靠推算时用「位置大于 0」判断。
      on:
        snapshotEntry.actual.available &&
        (shouldPersist(snapshotEntry) && snapshotEntry.estimated
          ? snapshotEntry.position > 0
          : snapshotEntry.actual.on),
      // 「确认全关」是调叶片的前置条件，因此要求：设备确认 + 导轨可信 + 无补间 + 非推算。
      closedConfirmed:
        !!snapshotEntry.actual.closedConfirmed &&
        !snapshotEntry.railUnconfirmed &&
        !snapshotEntry.motion &&
        !snapshotEntry.estimated,
      awaitingArrival: snapshotEntry.railUnconfirmed,
      targetPosition: snapshotEntry.draft ?? snapshotEntry.intent?.target ?? null,
      pendingService: snapshotEntry.intent?.service || "",
      preview: !!snapshotEntry.intent,
      error: snapshotEntry.error
    };
  }
  /**
   * 推进计时：清理过期意图、推进补间。
   *
   * @param {number} [nowMs=now()] 当前时间。
   * @returns {boolean} 是否有状态变化（需要重绘）。
   */
  function tick(nowMs = now()) {
    let changed = false;
    for (const tickEntry of feedbackByEntityId.values()) {
      if (tickEntry.intent?.expires <= nowMs) {
        tickEntry.intent = null;
        changed = true;
        if (tickEntry.actual.axis === "blade") {
          // 叶片轴的超时：推算值不再可信，回到设备上报位置。
          tickEntry.motion = null;
          tickEntry.position = tickEntry.actual.position;
          tickEntry.estimated = false;
          tickEntry.bladeHold = null;
        }
      }
      changed = advanceMotion(tickEntry, nowMs) || changed;
    }
    return changed;
  }
  /**
   * 下一次需要 tick 的间隔。
   *
   * @param {number} [currentTimeMs=now()] 当前时间。
   * @returns {number} 毫秒；有补间时按 30fps 返回，否则等到最近的意图过期，都没有则 Infinity。
   */
  function nextDelay(currentTimeMs = now()) {
    let delayMs = Infinity;
    for (const delayEntry of feedbackByEntityId.values()) {
      delayMs = Math.min(
        delayMs,
        delayEntry.motion ? 1000 / 30 : Infinity,
        delayEntry.intent ? Math.max(0, delayEntry.intent.expires - currentTimeMs) : Infinity
      );
    }
    return delayMs;
  }
  /** 只保留给定实体 ID 的记录，其余清理（场景切换 / 绑定变化时调用）。 */
  function retain(entityIds) {
    const retainedEntityIds = new Set(entityIds);
    for (const staleEntityId of feedbackByEntityId.keys()) {
      if (!retainedEntityIds.has(staleEntityId)) {
        feedbackByEntityId.delete(staleEntityId);
      }
    }
  }
  /**
   * 写入拖动草稿（用户在滑杆上拖动时调用）。
   *
   * @param {string} draftEntityId 实体 ID。
   * @param {number} position 草稿位置；非有限数按「取消草稿」处理。
   * @returns {void}
   */
  function preview(draftEntityId, position) {
    const draftEntry = feedbackByEntityId.get(draftEntityId);
    if (draftEntry) {
      draftEntry.draft = Number.isFinite(position) ? Math.max(0, Math.min(100, position)) : null;
    }
  }
  return {
    sync: sync,
    begin: begin,
    startPreview: startPreview,
    fail: fail,
    read: read,
    tick: tick,
    nextDelay: nextDelay,
    retain: retain,
    preview: preview,
    clear: () => feedbackByEntityId.clear()
  };
}
