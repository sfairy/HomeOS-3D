import { DEFAULT_BUTTON_SIZE, buttonIconSize } from '@app/bridge/presets'
import { createPurifierExtras } from '../climate/climate'
import {
  airerMapControlPosition,
  airerMapControlService,
  airerVisualPosition,
  normalizeAirerDirection,
} from '../airer/airer'
import { domElement } from '@app/shared/util/dom-factory'
import { applyRangeProgressCss } from '@app/shared/util/range-progress'
import { createStageDeviceVisual } from '../core/stage-device-visual'
import { createPopupFeedback } from '@app/shared/util/popup-feedback'
import { attributesOf, haNumber } from '../device/device'
import { doorContactMismatchNotice, doorPanelTitle } from './door-panel-state'

/**
 * 三次 Hermite 切线缓动（两端切线为 0，等价 smoothstep）。
 * 单独导出便于测试：窗帘、电机、梦幻帘共用同一条曲线。
 */
export function coverEaseTangent(progress: number) {
  const clampedProgress = Math.max(0, Math.min(1, Number(progress) || 0))
  return clampedProgress * clampedProgress * (3 - 2 * clampedProgress)
}

export function createCoverFeedback({
  now: now = () => performance.now(),
  smoothingTime: smoothingTime = 180,
  commandPreview: commandPreview = false,
  travelTime: travelTime = 6000,
  storage: storage,
  scope: scope,
  wallNow: wallNow = () => Date.now(),
  /**
   * 瞬态停滞判定窗口（ms）：设备报 opening/closing 时，若位置长时间零推进、又没有在途的乐观动画，
   * 就认定这一轮瞬态是「卡在状态上没回收」而不是真的在走，把它降级为 unknown（界面回落「在线」）。
   * 取 120s：一次完整行程通常不超过 1 分钟，正常开合绝不会被误判；实测卡死一次持续了 37 分钟，
   * 两分钟后回落「在线」对用户来说仍然及时。
   */
  stallTimeout: stallTimeoutMs = 120000,
  /**
   * 拖动上报节流（ms）：窗帘与电机共用。指针移动事件远高于渲染帧率，
   * 每个事件都改 draft 会让卡片/3D 每帧重建；50ms（≈20Hz）足够跟手。
   */
  reportInterval: reportIntervalMs = 50,
}: {
  now?: () => number
  smoothingTime?: number
  commandPreview?: boolean
  travelTime?: number
  storage?: Storage
  scope?: string
  wallNow?: () => number
  stallTimeout?: number
  reportInterval?: number
} = {}) {
  const feedbackByEntityId = new Map(),
    readLastUpdated = (state: any) => Date.parse(state.raw?.last_updated ?? state.raw?.updatedAt ?? ''),
    storageKeyFor = (entityId: any) => (scope ? 'hb-cover-presentation:v1:' + scope + ':' + entityId : null),
    shouldPersist = (entry: any) =>
      commandPreview && entry.actual.dream && entry.actual.overallFeedbackAvailable === false
  function clearPresentation(clearedEntityId: any) {
    try {
      const storageKey = storageKeyFor(clearedEntityId)
      storageKey && storage?.removeItem(storageKey)
    } catch {
      /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
    }
  }
  function savePresentation(savedEntityId: any, savedEntry: any) {
    if (!shouldPersist(savedEntry) || !savedEntry.estimated || savedEntry.position === null) return
    const activeMotion = savedEntry.motion,
      payload = {
        position: savedEntry.position,
        savedAt: wallNow(),
        motion: activeMotion
          ? {
              to: activeMotion.to,
              duration: Math.max(0, activeMotion.duration - (now() - activeMotion.start)),
            }
          : null,
      }
    try {
      const writeStorageKey = storageKeyFor(savedEntityId)
      writeStorageKey && storage?.setItem(writeStorageKey, JSON.stringify(payload))
    } catch {
      /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
    }
  }
  function restorePresentation(restoredEntityId: any, restoredEntry: any) {
    if (!shouldPersist(restoredEntry)) {
      clearPresentation(restoredEntityId)
      return
    }
    // 位置本身没有可信来源时（梦幻帘拿不到叶片反馈，整体位置一律为 null），别把历史估算的
    // 陈旧位置复活到轨道上 —— 否则会摆出一个与设备真实姿态相反的开合度。
    if (restoredEntry.position === null) {
      clearPresentation(restoredEntityId)
      return
    }
    try {
      const readStorageKey = storageKeyFor(restoredEntityId),
        stored = readStorageKey && JSON.parse(storage?.getItem(readStorageKey) || 'null'),
        isValidPosition = (candidatePosition: any) =>
          typeof candidatePosition == 'number' &&
          Number.isFinite(candidatePosition) &&
          candidatePosition >= 0 &&
          candidatePosition <= 100
      if (!stored || !isValidPosition(stored.position) || !Number.isFinite(stored.savedAt)) return
      const elapsedMs = Math.max(0, wallNow() - stored.savedAt),
        storedMotion = stored.motion
      if (
        storedMotion &&
        (!isValidPosition(storedMotion.to) ||
          !Number.isFinite(storedMotion.duration) ||
          storedMotion.duration < 0 ||
          storedMotion.duration > travelTime)
      )
        return
      if (((restoredEntry.position = stored.position), storedMotion)) {
        const progress = storedMotion.duration > 0 ? Math.min(1, elapsedMs / storedMotion.duration) : 1
        ;(restoredEntry.position += (storedMotion.to - restoredEntry.position) * progress),
          progress < 1 &&
            (restoredEntry.motion = {
              from: restoredEntry.position,
              to: storedMotion.to,
              start: now(),
              duration: storedMotion.duration - elapsedMs,
            })
      }
      ;(restoredEntry.estimated = true), (restoredEntry.railUnconfirmed = true)
    } catch {
      /* 存储写入是 best-effort：隐私模式 / 配额 / 序列化失败都不应影响本次渲染 */
    }
  }
  function trackProgress(trackedEntry: any, nextActual: any) {
    if (!nextActual.moving) {
      ;(trackedEntry.progressAt = null), (trackedEntry.progressPosition = null), (trackedEntry.stalled = false)
      return
    }
    // 没有位置轴的设备拿不到「推进」证据，不能据此判停滞：此时宁可继续相信设备报的瞬态。
    if (nextActual.position === null || nextActual.position === undefined) {
      ;(trackedEntry.progressAt = now()), (trackedEntry.progressPosition = null), (trackedEntry.stalled = false)
      return
    }
    // 只有「位置真的变了」才算推进。这台电机跑起来会在 closing↔opening 之间反复横跳，
    // 拿状态变化当推进信号会把看门狗永久清零，卡死也就永远发现不了。
    ;(trackedEntry.progressPosition === null || trackedEntry.progressPosition !== nextActual.position) &&
      ((trackedEntry.progressAt = now()), (trackedEntry.progressPosition = nextActual.position))
  }
  function refreshStall(trackedEntry: any, timeMs: any) {
    // 有在途乐观动画时不算停滞：那段时间的位移是本地预览在跑，设备本来就还没回报。
    const nextStalled = !!(
      trackedEntry.actual?.moving &&
      !trackedEntry.motion &&
      trackedEntry.progressAt !== null &&
      trackedEntry.progressPosition !== null &&
      timeMs - trackedEntry.progressAt > stallTimeoutMs
    )
    if (nextStalled === trackedEntry.stalled) return false
    trackedEntry.stalled = nextStalled
    // 判停就等于承认这一轮指令没有真的在走：顺手释放挂着的预览意图，
    // 免得卡片一直按「有在途指令」显示忙碌/目标值。
    nextStalled && (trackedEntry.intent = null)
    return true
  }
  function advanceMotion(trackedEntry: any, timeMs: any) {
    if (!trackedEntry.motion) return false
    const {
        from: fromPosition,
        to: toPosition,
        start: startedAt,
        duration: durationMs = smoothingTime,
      } = trackedEntry.motion,
      linearProgress = Math.max(0, Math.min(1, (timeMs - startedAt) / durationMs)),
      // 切线曲线：起止速度为 0 的三次 Hermite（smoothstep），
      // 窗帘与电机共用，避免线性动画在启动/停止瞬间「顿一下」。
      motionProgress = commandPreview ? coverEaseTangent(linearProgress) : linearProgress
    return (
      (trackedEntry.position = fromPosition + (toPosition - fromPosition) * motionProgress),
      motionProgress === 1 && (trackedEntry.motion = null),
      true
    )
  }
  function retargetMotion(retargetedEntry: any, targetPosition: any) {
    const isResumable = commandPreview && retargetedEntry.actual.axis !== 'blade'
    if (
      targetPosition === null ||
      retargetedEntry.position === null ||
      smoothingTime <= 0 ||
      (!isResumable && !retargetedEntry.actual.moving && retargetedEntry.actual.axis !== 'blade')
    ) {
      ;(retargetedEntry.position = targetPosition), (retargetedEntry.motion = null)
      return
    }
    if (retargetedEntry.motion?.to === targetPosition) return
    const remainingDistance = Math.abs(targetPosition - retargetedEntry.position),
      retargetDurationMs =
        isResumable && !retargetedEntry.actual.moving && retargetedEntry.intent?.service !== 'stop_cover'
          ? Math.max(smoothingTime, Math.min(1200, (remainingDistance / 100) * travelTime))
          : smoothingTime
    retargetedEntry.motion =
      remainingDistance === 0
        ? null
        : {
            from: retargetedEntry.position,
            to: targetPosition,
            start: now(),
            duration: retargetDurationMs,
          }
  }
  function sync(syncedEntityId: any, nextState: any) {
    let stateEntry = feedbackByEntityId.get(syncedEntityId)
    if (!stateEntry) {
      ;(stateEntry = {
        actual: nextState,
        position: nextState.position,
        motion: null as any,
        intent: null as any,
        token: null as any,
        error: '',
        draft: null as any,
        bladeHold: null as any,
        railUnconfirmed: false,
        estimated: false,
        lastAvailable: nextState.available ? nextState : null,
        lastTimestamp: readLastUpdated(nextState),
        progressAt: null as any,
        progressPosition: null as any,
        stalled: false,
      }),
        restorePresentation(syncedEntityId, stateEntry),
        // 首次见到就用这一帧武装停滞计时：否则设备只在进入 opening/closing 时发一条、
        // 之后长时间沉默的话，计时器永远不启动，卡死也就永远发现不了。
        trackProgress(stateEntry, nextState),
        feedbackByEntityId.set(syncedEntityId, stateEntry)
      return
    }
    const previousState = stateEntry.actual
    if (readLastUpdated(nextState) < stateEntry.lastTimestamp) return
    if (
      (Number.isFinite(readLastUpdated(nextState)) && (stateEntry.lastTimestamp = readLastUpdated(nextState)),
      nextState.dream !== previousState.dream ||
        nextState.overallFeedbackAvailable !== previousState.overallFeedbackAvailable)
    ) {
      feedbackByEntityId.delete(syncedEntityId), sync(syncedEntityId, nextState)
      return
    }
    const isPositionChanged = nextState.position !== previousState.position,
      isStateChanged = nextState.state !== previousState.state,
      lastAvailableChanged =
        !stateEntry.lastAvailable ||
        nextState.position !== stateEntry.lastAvailable.position ||
        nextState.state !== stateEntry.lastAvailable.state
    trackProgress(stateEntry, nextState)
    if (((stateEntry.actual = nextState), advanceMotion(stateEntry, now()), !nextState.available)) {
      ;(stateEntry.motion = null),
        (stateEntry.intent = null),
        (stateEntry.draft = null),
        (stateEntry.bladeHold = null),
        (stateEntry.railUnconfirmed = !!nextState.dream),
        savePresentation(syncedEntityId, stateEntry)
      return
    }
    refreshStall(stateEntry, now())

    if (
      stateEntry.estimated &&
      !stateEntry.intent &&
      !stateEntry.motion &&
      nextState.position !== null &&
      Math.abs(nextState.position - stateEntry.position) > 0.01
    ) {
      ;(stateEntry.position = nextState.position),
        (stateEntry.estimated = false),
        (stateEntry.railUnconfirmed = false),
        (stateEntry.lastAvailable = nextState),
        clearPresentation(syncedEntityId)
      return
    }
    if (((stateEntry.lastAvailable = nextState), stateEntry.bladeHold !== null)) {
      if (nextState.position !== stateEntry.bladeHold) return
      ;(stateEntry.position = nextState.position),
        (stateEntry.motion = null),
        (stateEntry.estimated = false),
        (stateEntry.bladeHold = null),
        (stateEntry.intent = null)
      return
    }
    const intentDirection = stateEntry.intent?.direction
    if (
      (commandPreview &&
      !nextState.dream &&
      nextState.axis !== 'blade' &&
      stateEntry.intent?.target !== null &&
      ((intentDirection > 0 && nextState.opening) || (intentDirection < 0 && nextState.closing)) &&
      nextState.position !== null &&
      stateEntry.position !== null &&
      (nextState.position - stateEntry.position) * intentDirection < 0
        ? (stateEntry.estimated = true)
        : (isPositionChanged ||
            (stateEntry.estimated &&
              nextState.axis === 'blade' &&
              !stateEntry.intent &&
              readLastUpdated(nextState) > readLastUpdated(previousState)) ||
            (isStateChanged && !nextState.moving)) &&
          ((stateEntry.estimated = false), retargetMotion(stateEntry, nextState.position)),
      lastAvailableChanged &&
        nextState.overallFeedbackAvailable !== false &&
        ((stateEntry.railUnconfirmed = false), stateEntry.intent))
    ) {
      const reachedIntentTarget = nextState.position !== null && nextState.position === stateEntry.intent.target
      ;(!nextState.moving &&
        (reachedIntentTarget || stateEntry.intent.service === 'stop_cover' || stateEntry.intent.confirmed)) ||
      (isPositionChanged && !nextState.moving)
        ? (stateEntry.intent = null)
        : nextState.moving && ((stateEntry.intent.confirmed = true), (stateEntry.intent.expires = Infinity))
    }
  }
  function begin(command: any, token: any, { defer: defer = false } = {}) {
    const commandEntry = feedbackByEntityId.get(command.entityId)
    if (!commandEntry) return
    advanceMotion(commandEntry, now()), (commandEntry.error = ''), (commandEntry.token = token)
    const draftPosition = commandEntry.draft
    ;(commandEntry.draft = null), (commandEntry.bladeHold = null)
    const intentTarget =
        command.service === 'open_cover'
          ? 100
          : command.service === 'close_cover'
            ? 0
            : command.service === 'stop_cover'
              ? null
              : command.data.position,
      commandDirection =
        command.service === 'open_cover'
          ? 1
          : command.service === 'close_cover'
            ? -1
            : intentTarget === null
              ? 0
              : Math.sign(intentTarget - (commandEntry.position ?? commandEntry.actual.position ?? intentTarget))
    commandPreview &&
      command.service === 'set_cover_position' &&
      draftPosition !== null &&
      draftPosition === intentTarget &&
      ((commandEntry.position = draftPosition),
      (commandEntry.motion = null),
      (commandEntry.estimated = true),
      commandEntry.actual.axis === 'blade' && (commandEntry.bladeHold = intentTarget)),
      (command.service === 'stop_cover' || defer) && (commandEntry.motion = null),
      (commandEntry.intent = {
        service: command.service,
        target: intentTarget,
        direction: commandDirection,
        confirmed: false,
        expires: now() + 15000,
      }),
      commandPreview && !defer && intentTarget !== null && startPreview(command.entityId, token),
      commandEntry.actual.dream &&
        ['open_cover', 'close_cover', 'stop_cover'].includes(command.service) &&
        (commandEntry.railUnconfirmed =
          commandEntry.railUnconfirmed || command.service === 'open_cover' || !commandEntry.actual.closedConfirmed),
      savePresentation(command.entityId, commandEntry)
  }
  function startPreview(previewEntityId: any, previewToken: any) {
    const previewEntry = feedbackByEntityId.get(previewEntityId)
    if (
      !commandPreview ||
      !previewEntry?.intent ||
      previewEntry.token !== previewToken ||
      previewEntry.intent.target === null
    )
      return false
    advanceMotion(previewEntry, now())
    const startPosition = previewEntry.position ?? 0,
      previewTargetPosition = previewEntry.intent.target
    return (
      (previewEntry.position = startPosition),
      (previewEntry.estimated =
        startPosition !== previewTargetPosition ||
        previewEntry.actual.position !== previewTargetPosition ||
        previewEntry.railUnconfirmed),
      (previewEntry.motion =
        startPosition === previewTargetPosition
          ? null
          : {
              from: startPosition,
              to: previewTargetPosition,
              start: now(),
              duration: Math.max(180, (Math.abs(previewTargetPosition - startPosition) / 100) * travelTime),
            }),
      savePresentation(previewEntityId, previewEntry),
      true
    )
  }
  function fail(failedEntityId: any, failedToken: any, message: any) {
    const failedEntry = feedbackByEntityId.get(failedEntityId)
    return !failedEntry || failedEntry.token !== failedToken
      ? false
      : (advanceMotion(failedEntry, now()),
        (failedEntry.motion = null),
        (failedEntry.intent = null),
        (failedEntry.draft = null),
        (failedEntry.bladeHold = null),
        (failedEntry.error = message),
        failedEntry.actual.position !== null &&
          ((failedEntry.position = failedEntry.actual.position), (failedEntry.estimated = false)),
        clearPresentation(failedEntityId),
        true)
  }
  function read(readEntityId: any, fallbackState: any) {
    const snapshotEntry = feedbackByEntityId.get(readEntityId)
    if (!snapshotEntry) return fallbackState
    // 停滞（卡在 opening/closing 且位置零推进）时不假装在动，也不谎报终态：整轮降级为 unknown，
    // 由卡片回落「在线」。位置仍按设备最后一次上报值展示，不摆出一个假的端点姿态。
    const isStalled = !!snapshotEntry.stalled && !snapshotEntry.motion,
      // 方向以设备为准，其次才轮到本地预览动画：
      //   1) 设备自己在报 opening/closing → 直接用它的方向。本地预览为了对齐设备上报位置会做一次
      //      反向微调（开启途中预览跑到 54、设备报 50，回补动画是 54→50 的下降），若按动画方向判，
      //      卡片会在「整体正在开启」上闪一下「整体正在关闭」。
      //   2) 设备已报出终态（open/closed）→ 位置可能还在收尾对齐，但「正在开启/关闭」已经不成立，
      //      标签立刻采信设备终态，只有位置继续动画。
      //   3) 设备沉默（还没回报）→ 才用本地预览动画的方向。
      deviceMoving = !isStalled && (!!snapshotEntry.actual.opening || !!snapshotEntry.actual.closing),
      deviceSettled = !isStalled && (snapshotEntry.actual.state === 'open' || snapshotEntry.actual.state === 'closed'),
      hasMotionEstimate = !!(commandPreview && snapshotEntry.motion),
      motionOpening = hasMotionEstimate ? snapshotEntry.motion.to > snapshotEntry.motion.from : false,
      // 设备已报终态时一般以设备为准（见 2），但用户刚下发的指令还没被设备确认时例外：
      // 否则点了「关闭」的那一瞬间卡片仍显示「整体已开启」，要等设备回报道 closing 才变，
      // 看起来像没反应。
      useMotionDirection = hasMotionEstimate && !deviceMoving && (!deviceSettled || !!snapshotEntry.intent),
      opening = isStalled ? false : deviceMoving ? !!snapshotEntry.actual.opening : useMotionDirection && motionOpening,
      closing = isStalled ? false : deviceMoving ? !!snapshotEntry.actual.closing : useMotionDirection && !motionOpening
    return {
      ...snapshotEntry.actual,
      position: (commandPreview ? snapshotEntry.draft : null) ?? snapshotEntry.position,
      estimated: snapshotEntry.estimated,
      dragging: !!(commandPreview && snapshotEntry.draft !== null),
      state: isStalled ? 'unknown' : opening ? 'opening' : closing ? 'closing' : snapshotEntry.actual.state,
      opening: opening,
      closing: closing,
      moving: opening || closing,
      stalled: isStalled,
      on:
        snapshotEntry.actual.available &&
        (shouldPersist(snapshotEntry) && snapshotEntry.estimated
          ? snapshotEntry.position > 0
          : snapshotEntry.actual.on),
      closedConfirmed: !!(
        snapshotEntry.actual.closedConfirmed &&
        !snapshotEntry.railUnconfirmed &&
        !snapshotEntry.motion &&
        !snapshotEntry.estimated
      ),
      awaitingArrival: snapshotEntry.railUnconfirmed,
      targetPosition: snapshotEntry.draft ?? snapshotEntry.intent?.target ?? null,
      pendingService: snapshotEntry.intent?.service || '',
      preview: !!snapshotEntry.intent,
      error: snapshotEntry.error,
    }
  }
  function tick(nowMs = now()) {
    let hasChanged = false
    for (const tickEntry of feedbackByEntityId.values())
      refreshStall(tickEntry, nowMs) && (hasChanged = true),
        tickEntry.intent?.expires <= nowMs &&
          ((tickEntry.intent = null),
          (hasChanged = true),
          tickEntry.actual.axis === 'blade' &&
            ((tickEntry.motion = null),
            (tickEntry.position = tickEntry.actual.position),
            (tickEntry.estimated = false),
            (tickEntry.bladeHold = null))),
        (hasChanged = advanceMotion(tickEntry, nowMs) || hasChanged)
    return hasChanged
  }
  function nextDelay(currentTimeMs = now()) {
    let delayMs = Infinity
    for (const delayEntry of feedbackByEntityId.values()) {
      // 停滞是「时间到了才成立」的判断，设备一沉默就再没有 sync 把界面推醒；
      // 这里主动排一次唤醒，保证卡死到点后弹窗能回落「在线」。
      const stallDelay =
        delayEntry.actual?.moving &&
        !delayEntry.stalled &&
        delayEntry.progressAt !== null &&
        delayEntry.progressPosition !== null
          ? Math.max(0, delayEntry.progressAt + stallTimeoutMs - currentTimeMs)
          : Infinity
      delayMs = Math.min(
        delayMs,
        delayEntry.motion ? 0 : Infinity,
        delayEntry.intent ? Math.max(0, delayEntry.intent.expires - currentTimeMs) : Infinity,
        stallDelay,
      )
    }
    return delayMs
  }
  function retain(entityIds: any) {
    const retainedEntityIdSet = new Set(entityIds)
    for (const staleEntityId of feedbackByEntityId.keys())
      retainedEntityIdSet.has(staleEntityId) || feedbackByEntityId.delete(staleEntityId)
  }
  function preview(draftEntityId: any, position: any) {
    const draftEntry = feedbackByEntityId.get(draftEntityId)
    draftEntry && (draftEntry.draft = Number.isFinite(position) ? Math.max(0, Math.min(100, position)) : null)
  }
  /**
   * 拖动上报：与 `preview` 同一语义，但按 `reportInterval` 节流。
   * 清空（null）永远立即生效，否则松手后最后一帧会被节流吞掉，轨道停在半路。
   */
  function report(draftEntityId: string, position: number | null, timeMs = now()) {
    const draftEntry = feedbackByEntityId.get(draftEntityId)
    if (!draftEntry) return false
    const nextPosition = position !== null && Number.isFinite(position) ? Math.max(0, Math.min(100, position)) : null
    if (
      nextPosition !== null &&
      draftEntry.lastReportAt !== undefined &&
      timeMs - draftEntry.lastReportAt < reportIntervalMs
    )
      return false
    return ((draftEntry.lastReportAt = timeMs), (draftEntry.draft = nextPosition), true)
  }
  /** 卡片首帧查询：没有缓存时回退到调用方给的初始状态，行为等同于 read。 */
  function probe<T>(probeEntityId: string, fallbackState: T): T {
    return feedbackByEntityId.has(probeEntityId) ? read(probeEntityId, fallbackState) : fallbackState
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
    report: report,
    probe: probe,
    clear: () => feedbackByEntityId.clear(),
  }
}

/** 分组面板的宿主元素与回调。 */
type CoverGroupPanelOptions = {
  element?: any
  onControl?: (...args: any[]) => any
  onPreview?: (...args: any[]) => any
}

/** 分组面板一次 update 的输入：分组条目 + 各成员的实时状态。 */
type CoverGroupUpdateState = {
  /** 分组条目：memberItems / panelLayout / label。 */
  item?: any
  /** 成员 id → cover 状态。 */
  states?: Record<string, any>
  /** 成员 id → 展示状态（位置 / 角度等）。 */
  presentations?: Record<string, any>
  /** 是否处于编辑态。 */
  editing?: boolean
  /** 成员 id → 错误文案。 */
  errors?: Record<string, any>
}

export function createCoverGroupPanel({
  element: panelElement,
  onControl: onControl = async () => {},
  onPreview: onPreview = () => {},
}: CoverGroupPanelOptions = {}) {
  const documentNode = panelElement?.ownerDocument || globalThis.document,
    rootElement = panelElement || documentNode.createElement('section')
  rootElement.classList.add('i3d-cover-group-panel')
  const titleElement = documentNode.createElement('h3')
  ;(titleElement.className = 'i3d-cover-group-title'), rootElement.append(titleElement)
  const panels = [0, 1].map(() =>
    createCoverPanel({
      element: documentNode.createElement('section'),
      onControl: onControl,
      onPreview: onPreview,
    }),
  )
  return (
    panels.forEach((mountedPanel) => rootElement.append(mountedPanel.root)),
    {
      root: rootElement,
      update(state: CoverGroupUpdateState = {}) {
        const memberItems = state.item?.memberItems || []
        rootElement.classList.toggle('is-vertical', state.item?.panelLayout === 'vertical'),
          (titleElement.textContent = state.item?.label || '双层窗帘'),
          rootElement.setAttribute('aria-label', titleElement.textContent),
          panels.forEach((layerPanel, index) => {
            const member = memberItems[index]
            ;(layerPanel.root.hidden = !member),
              layerPanel.root.setAttribute('aria-label', member?.label || '窗帘 ' + (index + 1)),
              member
                ? layerPanel.update({
                    item: member,
                    state: state.states?.[member.id],
                    presentation: state.presentations?.[member.id],
                    editing: state.editing,
                    error: state.errors?.[member.id] || '',
                  })
                : layerPanel.deactivate()
          })
      },
      deactivate() {
        panels.forEach((deactivatedPanel) => deactivatedPanel.deactivate())
      },
      dispose() {
        panels.forEach((disposedPanel) => disposedPanel.dispose()), rootElement.replaceChildren()
      },
    }
  )
}

/** 窗帘实例（后端 entity + 前端 kind 的混合形态，只用到这几个字段）。 */
type CurtainLike = {
  id?: string
  /** 窗帘形态：dream 表示梦幻帘，不参与分组。 */
  coverKind?: string
  /** 所属楼层。 */
  floorId?: string
  /** 对应的 HA 实体 id。 */
  entityId?: string
}

/** 窗帘分组（一组两台，成对控制）。 */
export type CurtainGroupLike = {
  id?: string
  /** 成对的两台窗帘 id。 */
  memberIds?: string[]
  /** 分组所属楼层。 */
  floorId?: string
}

/** 分组逻辑读到的环境快照。 */
type CurtainEnvironmentLike = {
  curtains?: CurtainLike[]
  curtainGroups?: CurtainGroupLike[]
}

export const curtainGroupEntryId = (curtainGroup: CurtainGroupLike) => 'curtain-group:' + curtainGroup.id
export function validCurtainGroups(environment: CurtainEnvironmentLike = {}) {
  const curtainsById = new Map((environment.curtains || []).map((curtain) => [curtain.id, curtain])),
    usedMemberIdSet = new Set<string>()
  return (environment.curtainGroups || []).filter((candidateGroup) => {
    const groupMemberIds = candidateGroup.memberIds
    if (
      !candidateGroup.id ||
      !Array.isArray(groupMemberIds) ||
      groupMemberIds.length !== 2 ||
      groupMemberIds[0] === groupMemberIds[1]
    )
      return false
    const memberCurtains = groupMemberIds.map((candidateMemberId) => curtainsById.get(candidateMemberId))
    return memberCurtains.some(
      (memberCurtain) =>
        !memberCurtain ||
        memberCurtain.floorId !== candidateGroup.floorId ||
        memberCurtain.coverKind === 'dream' ||
        usedMemberIdSet.has(memberCurtain.id!),
    ) ||
      (memberCurtains[0]!.entityId && memberCurtains[0]!.entityId === memberCurtains[1]!.entityId!)
      ? false
      : (groupMemberIds.forEach((acceptedMemberId) => usedMemberIdSet.add(acceptedMemberId)), true)
  })
}
export function curtainGroupCandidates(curtainEnvironment: CurtainEnvironmentLike, curtainId: string) {
  const anchorCurtain = curtainEnvironment?.curtains?.find((matchingCurtain) => matchingCurtain.id === curtainId),
    groupedCurtainIdSet = new Set<string>(
      validCurtainGroups(curtainEnvironment).flatMap((existingGroup) => existingGroup.memberIds) as string[],
    )
  return !anchorCurtain?.floorId || anchorCurtain.coverKind === 'dream' || groupedCurtainIdSet.has(anchorCurtain.id!)
    ? []
    : curtainEnvironment.curtains!.filter(
        (candidateCurtain) =>
          candidateCurtain.id !== anchorCurtain.id &&
          candidateCurtain.floorId === anchorCurtain.floorId &&
          candidateCurtain.coverKind !== 'dream' &&
          !groupedCurtainIdSet.has(candidateCurtain.id!) &&
          (!anchorCurtain.entityId || candidateCurtain.entityId !== anchorCurtain.entityId),
      )
}
export function createCurtainGroup(groupEnvironment: any, firstMemberId: any, secondMemberId: any, groupId: any) {
  const primaryCurtain = groupEnvironment.curtains.find((selectedCurtain: any) => selectedCurtain.id === firstMemberId)
  if (
    !curtainGroupCandidates(groupEnvironment, firstMemberId).some(
      (eligibleCurtain) => eligibleCurtain.id === secondMemberId,
    )
  )
    throw new Error('请选择同楼层未组合、实体不同的普通窗帘。')
  const createdGroup = {
    id: groupId,
    label: '双层窗帘',
    floorId: primaryCurtain.floorId,
    memberIds: [firstMemberId, secondMemberId],
    size: primaryCurtain.size ?? DEFAULT_BUTTON_SIZE,
    iconSize: buttonIconSize(primaryCurtain.size ?? DEFAULT_BUTTON_SIZE),
    hitSize: primaryCurtain.hitSize ?? Math.max(DEFAULT_BUTTON_SIZE, primaryCurtain.size ?? DEFAULT_BUTTON_SIZE),
    clickAction: ['panel', 'turn-on-focus', 'turn-on', 'turn-on-panel'].includes(primaryCurtain.clickAction)
      ? primaryCurtain.clickAction
      : 'focus',
    visible: primaryCurtain.visible !== false,
    hiddenClickable: primaryCurtain.hiddenClickable === true,
    buttonHidden: primaryCurtain.buttonHidden === true,
  }
  for (const propertyName of ['x', 'y', 'height', 'focusCamera'])
    primaryCurtain[propertyName] !== undefined &&
      ((createdGroup as any)[propertyName] = structuredClone(primaryCurtain[propertyName]))
  return createdGroup
}

/**
 * 窗帘 / 晾衣架 / 开窗器的**展示用**姿态记忆（0.8.4 `cover-memory` 前端消费端）。
 *
 * 为什么需要它：HA 的 `cover` 实体在 `opening` / `closing` 期间通常只报方向、不报实时
 * 位置，部分电机甚至到位后才更新 `current_position`。后端 `cover_memory.py` 会把这些
 * 观察攒成「上次位置 + 补间样本」，本模块负责两件事：
 *
 * 1. 拉取 `GET /cover-memory` 并把后端条目归一成渲染层认识的形状；
 * 2. 把本地 HA 状态观测（`current_position` / `current_tilt_position` / `state=closed`）
 *    按 `at` 取新合并进去 —— 后端快照是低频的，实时状态才是「刚刚停在哪」的权威。
 *
 * 三条硬边界（与上游一致）：只读、按 `scope` 失效（换 HA 连接后旧历史一律作废）、
 * 失败静默（拿不到记忆只影响动画，绝不能影响控制）。
 *
 * 条目形状（`cover-state.ts` 的 `coverMemorySample` 直接消费）：
 *
 * ```ts
 * {
 *   position?: { position: 0-100, at: ms, nativeTilt: boolean },
 *   tilt?: { position: 0-100, at: ms },
 *   closedAt?: ms,
 *   closedNative?: boolean,
 *   estimates: { rail?: { position, at, target?, duration? }, dream?: ..., "airer:0:0"?: ... }
 * }
 * ```
 */

/** 记忆里的一条「位置 + 时刻」。 */
export interface CoverMemoryPoint {
  position: number
  at: number
  nativeTilt?: boolean
  /**
   * HA 标了 `assumed_state`：这个位置是**推测**出来的（红外/射频控制的电机、
   * 重启后恢复的状态）。带这个标记的点仍然要更新显示，但渲染层不该把它当成
   * 精确值去做「还差几厘米」的判断。
   */
  assumed?: boolean
}

/** 记忆里的一条补间样本（后端 `sample()` 的产物）。 */
export interface CoverMemoryEstimate {
  position: number
  at: number
  target?: number
  duration?: number
  delay?: number
}

/** 单个实体的记忆条目。 */
export interface CoverMemoryEntry {
  position?: CoverMemoryPoint
  tilt?: CoverMemoryPoint
  closedAt?: number
  closedNative?: boolean
  estimates: Record<string, CoverMemoryEstimate>
  /**
   * 本段行程的起点（0.8.9）。没有它就只能在「最后一次上报」和「估算目标」之间插值，
   * 而行程刚开始时最后一次上报可能已经过时几百毫秒 —— 起点让补间从正确的像素位置出发。
   */
  travel?: CoverMemoryTravel
  /** 上一次观察到的开合状态（用于识别「刚进入 opening/closing」这个瞬间）。 */
  lastState?: string
}

/** 归约后的实体记忆表。 */
export type CoverMemoryMap = Record<string, CoverMemoryEntry>

/** 只认 `cover.` 域的实体：其它域即使被后端误写进来也不参与补间。 */
const COVER_ENTITY_PATTERN = /^cover\.[a-z0-9_]+$/
/** 允许参与记忆聚合的 HA 状态（瞬态也要，方向本身就是证据）。 */
const COVER_MEMORY_STATES = ['open', 'closed', 'opening', 'closing']

/** 有限数字；`bool` 不算数字（`true` 在 JS 里会被 `Number()` 变成 1）。 */
function finiteNumber(value: any): number | null {
  return typeof value == 'number' && Number.isFinite(value) ? value : null
}

/** 0–100 的位置；越界视为脏数据。 */
function coverPosition(value: any): number | null {
  const numericValue = typeof value == 'number' ? value : typeof value == 'string' && value.trim() ? Number(value) : NaN
  return Number.isFinite(numericValue) && numericValue >= 0 && numericValue <= 100 ? numericValue : null
}

/** 毫秒时间戳：只接受正数，避免 0 / NaN 把「更新」判定搞反。 */
function timestamp(value: any): number | null {
  const numericValue = finiteNumber(value)
  return numericValue !== null && numericValue > 0 ? numericValue : null
}

/** 单轴「位置 + 时刻」点：`nativeTilt` / `assumed` 只在为真时写入（保持条目精简）。 */
function readAxisPoint(value: unknown, fallbackAt: number | null): CoverMemoryPoint | null {
  if (!value || typeof value != 'object') return null
  const point = value as Record<string, unknown>
  const pointPosition = coverPosition(point.position),
    pointAt = timestamp(point.at) ?? fallbackAt
  if (pointPosition === null || pointAt === null) return null
  return {
    position: pointPosition,
    at: pointAt,
    ...(point.nativeTilt === true ? { nativeTilt: true } : {}),
    ...(point.assumed === true ? { assumed: true } : {}),
  }
}

/**
 * 读位置与倾角两轴。
 *
 * 两套形状都要认：上游 `{position: {...}, tilt: {...}}`，本仓库 `{open, attributes: {...}}`。
 * 认不出来就留空，不猜。
 */
function readAxisPoints(raw: any, fallbackAt: number | null) {
  const points: Pick<CoverMemoryEntry, 'position' | 'tilt'> = {}
  const positionPoint = readAxisPoint(raw.position, fallbackAt)
  if (positionPoint) points.position = positionPoint
  else {
    // 本仓库形状：`open` 是最近一次上报的位置，`reportAt` 是它的时刻。
    const legacyPosition = coverPosition(raw.open ?? raw.attributes?.current_position)
    if (legacyPosition !== null && fallbackAt !== null)
      points.position = {
        position: legacyPosition,
        at: fallbackAt,
        ...(raw.nativeTilt === true ? { nativeTilt: true } : {}),
      }
  }
  const tiltPoint = readAxisPoint(raw.tilt, fallbackAt)
  if (tiltPoint) points.tilt = tiltPoint
  else {
    const legacyTilt = coverPosition(raw.attributes?.tilt ?? raw.attributes?.current_tilt_position)
    if (legacyTilt !== null && fallbackAt !== null) points.tilt = { position: legacyTilt, at: fallbackAt }
  }
  return points
}

/**
 * 把后端（0.8.4 上游或本仓库 `cover_memory.py`）的一条记录归一成 `CoverMemoryEntry`。
 *
 * 两套形状都要认：
 * - 上游：`{position: {position, at, nativeTilt}, tilt: {...}, closedAt, estimates: {rail: ...}}`；
 * - 本仓库：`{open, attributes: {current_position, tilt}, reportAt, identity, estimates: [...]}`。
 *
 * 认不出来的字段一律丢掉，不猜。
 */
export function normalizeCoverMemoryEntry(raw: any): CoverMemoryEntry | null {
  if (!raw || typeof raw != 'object') return null
  const entry: CoverMemoryEntry = { estimates: {} }
  const fallbackAt = timestamp(raw.reportAt) ?? timestamp(raw.at) ?? timestamp(raw.last_updated) ?? null

  Object.assign(entry, readAxisPoints(raw, fallbackAt))

  // 0.8.9：行程起点与上次状态。
  const travel = readTravelPayload(raw.travel ?? raw.knownStart ?? raw.known_start)
  if (travel) entry.travel = travel
  const lastState = readLastState(raw.lastState, COVER_MEMORY_STATES)
  if (lastState) entry.lastState = lastState

  const closedAt = timestamp(raw.closedAt)
  if (closedAt !== null) {
    entry.closedAt = closedAt
    entry.closedNative = raw.closedNative === true
  }

  const readEstimate = (value: any): CoverMemoryEstimate | null => {
    if (!value || typeof value != 'object') return null
    const estimatePosition = coverPosition(value.position),
      estimateAt = timestamp(value.at) ?? fallbackAt
    if (estimatePosition === null || estimateAt === null) return null
    const estimate: CoverMemoryEstimate = { position: estimatePosition, at: estimateAt }
    const target = coverPosition(value.target)
    if (target !== null) estimate.target = target
    if (finiteNumber(value.duration) !== null && value.duration >= 0 && value.duration <= 600)
      estimate.duration = value.duration
    if (finiteNumber(value.delay) !== null && value.delay >= 0 && value.delay <= 2400) estimate.delay = value.delay
    return estimate
  }

  if (Array.isArray(raw.estimates)) {
    // 本仓库：`estimates` 是一个数组，最后一条才是当前这一段行程。
    const axis = typeof raw.identity == 'string' && raw.identity ? raw.identity : 'rail',
      latestEstimate = readEstimate(raw.estimates[raw.estimates.length - 1])
    if (latestEstimate) entry.estimates[axis] = latestEstimate
  } else if (raw.estimates && typeof raw.estimates == 'object') {
    for (const [axis, value] of Object.entries(raw.estimates)) {
      const estimate = readEstimate(value)
      estimate && axis && (entry.estimates[axis] = estimate)
    }
  }

  return entry.position || entry.tilt || entry.closedAt || Object.keys(entry.estimates).length ? entry : null
}

/** 取 `at` 更晚的那条；相同时保留已有值（后端快照不覆盖刚刚的本地观测）。 */
function laterPoint(
  current: CoverMemoryPoint | undefined,
  candidate: CoverMemoryPoint | null,
): CoverMemoryPoint | undefined {
  if (!candidate) return current
  if (!current || candidate.at > current.at) return candidate
  return current
}

/** 合并两条记忆：逐轴、逐通道按 `at` 取新。 */
export function mergeCoverMemoryEntries(
  current: CoverMemoryEntry | undefined,
  incoming: CoverMemoryEntry | null,
): CoverMemoryEntry | undefined {
  if (!incoming) return current
  const merged: CoverMemoryEntry = {
    ...(current || { estimates: {} }),
    estimates: { ...(current?.estimates || {}) },
  }
  const position = laterPoint(merged.position, incoming.position || null)
  if (position) merged.position = position
  const tilt = laterPoint(merged.tilt, incoming.tilt || null)
  if (tilt) merged.tilt = tilt
  if (incoming.closedAt && (!merged.closedAt || incoming.closedAt > merged.closedAt)) {
    merged.closedAt = incoming.closedAt
    merged.closedNative = incoming.closedNative === true
  }
  for (const [axis, estimate] of Object.entries(incoming.estimates)) {
    const existingEstimate = merged.estimates[axis]
    if (!existingEstimate || estimate.at >= existingEstimate.at) merged.estimates[axis] = estimate
  }
  // 行程字段（起点 / 上次状态）单独合并，见 `mergeTravelState`。
  mergeTravelState(merged, incoming)
  return merged
}

/**
 * 本地观察：把一帧 HA 状态压进记忆。
 *
 * 与上游 `_0x3b59f2` 同口径 —— 只认 `cover.` 域、可用、且状态在开合四态里的实体；
 * `current_position` 比已有记录新才覆盖；`closed` 直接记成「已合拢」的时刻。
 */
export function observeCoverMemoryState(
  current: CoverMemoryEntry | undefined,
  stateChange: any,
): CoverMemoryEntry | undefined {
  const rawState = stateChange?.newState || stateChange
  if (!rawState || typeof rawState != 'object') return current
  if (rawState.available === false) return current
  const stateText = String(rawState.state || '')
    .trim()
    .toLowerCase()
  if (!COVER_MEMORY_STATES.includes(stateText)) return current
  const attributes = rawState.attributes && typeof rawState.attributes == 'object' ? rawState.attributes : {}
  const observedAt = observedTimestamp(rawState),
    supportedFeatures = supportedFeatureBits(attributes)
  const next: CoverMemoryEntry = {
    ...(current || { estimates: {} }),
    estimates: { ...(current?.estimates || {}) },
  }
  /*
   * `assumed_state`（0.8.9）：HA 只在「它自己也不确定」时给这个标记 —— 红外/射频控制的
   * 电机、重启后从 `restore_state` 恢复的位置。带标记的读数仍然要更新（否则显示会停在
   * 旧值），但打上 `assumed` 让渲染层知道它不该被当成精确值。
   */
  const assumedState = isAssumedState(attributes, rawState)
  const reportedPosition = coverPosition(attributes.current_position)
  if (reportedPosition !== null && observedAt >= (next.position?.at || 0))
    next.position = {
      position: reportedPosition,
      at: observedAt,
      nativeTilt: coverPosition(attributes.current_tilt_position) !== null || !!(supportedFeatures & 240),
      ...(assumedState ? { assumed: true } : {}),
    }
  // 行程起点（0.8.9 `known_start`）：see `nextTravelState` for the "once per travel" rule.
  Object.assign(next, nextTravelState(next, stateText, reportedPosition, observedAt))
  const reportedTilt = coverPosition(attributes.current_tilt_position)
  if (reportedTilt !== null && observedAt >= (next.tilt?.at || 0))
    next.tilt = { position: reportedTilt, at: observedAt }
  if (stateText == 'closed') {
    const closedAt = Math.max(observedAt, next.closedAt || 0)
    next.closedAt = closedAt
    next.closedNative = true
  }
  return next.position || next.tilt || next.closedAt || Object.keys(next.estimates).length ? next : current
}

/** 把记忆挂到实体状态上（与上游 `{...state, coverMemory}` 同口径）。 */
export function attachCoverMemory(states: Record<string, any>, memory: CoverMemoryMap) {
  if (!states || typeof states != 'object') return states
  let patchedStates: Record<string, any> | null = null
  for (const entityId of Object.keys(memory)) {
    const entry = memory[entityId],
      stateValue = states[entityId]
    if (!entry) continue
    if (!stateValue) {
      patchedStates ||= { ...states }
      patchedStates[entityId] = {
        entityId: entityId,
        state: 'unavailable',
        available: false,
        attributes: {},
        coverMemory: entry,
      }
      continue
    }
    const rawState = stateValue.newState || stateValue
    if (rawState.coverMemory === entry) continue
    patchedStates ||= { ...states }
    patchedStates[entityId] = { ...rawState, coverMemory: entry }
  }
  return patchedStates || states
}

export interface CoverMemoryClientOptions {
  projectId?: string
  componentId?: string
  /** 注入用（单测 / 宿主自带的 fetch）；默认 `window.fetch`。 */
  fetchImpl?: typeof fetch | null
  /** 拉取超时；上游 10s。 */
  timeoutMs?: number
}

export interface CoverMemoryClient {
  /** 记录一批 HA 状态（不传 `patch` 时按整表替换实体集合）。 */
  observe(states: Record<string, any> | null | undefined, options?: { patch?: boolean }): void
  /** 按实体状态生成带 `coverMemory` 的副本；没有记忆时原样返回。 */
  hydrate(states: Record<string, any>): Record<string, any>
  /** 拉取后端快照；`force` 时忽略节流。返回是否成功（失败静默）。 */
  load(force?: boolean): Promise<boolean>
  /** `cover_memory_changed` 推送：合并后重新拉取（单飞 + 40ms 合并窗口）。 */
  notifyChanged(entityId?: string): void
  /** 当前记忆表（只读快照，调试用）。 */
  entries(): CoverMemoryMap
  dispose(): void
}

/** 同一组件被多次挂载时不重复打接口：40ms 内的拉取合并成一次。 */
const MIN_FETCH_INTERVAL_MS = 40

/**
 * 创建记忆客户端。
 *
 * 生命周期：`observe` 持续喂状态；`load` 在舞台就绪后拉一次，之后由
 * `cover_memory_changed` 驱动；`dispose` 之后所有回调都变成空操作。
 */
export function createCoverMemoryClient({
  projectId = '',
  componentId = '',
  fetchImpl = typeof fetch == 'function' ? fetch.bind(globalThis) : null,
  timeoutMs = 10000,
}: CoverMemoryClientOptions = {}): CoverMemoryClient {
  const resolvedFetch: typeof fetch =
    fetchImpl ?? ((() => Promise.reject(new Error('fetch unavailable'))) as typeof fetch)
  let memory: CoverMemoryMap = {},
    // 本地观测单独存一份：后端快照回来时不能把它覆盖掉（本地往往更新）。
    localMemory: CoverMemoryMap = {},
    scope: string | null = null,
    isDisposed = false,
    activeAbortController: AbortController | null = null,
    inflightLoad: Promise<boolean> | null = null,
    pendingReloadTimerId: ReturnType<typeof setTimeout> | null = null,
    lastLoadAt = 0,
    subscribedEntityIds: Set<string> | null = null

  /** 作用域变化（换了 HA 连接）：旧历史全部作废，等下一次拉取重建。 */
  const applyScope = (nextScope: string) => {
    if (nextScope === scope) return
    scope = nextScope
    memory = {}
  }

  /** 只保留当前订阅集合里的实体；整表模式下 `null` 表示不过滤。 */
  const pruneMemory = () => {
    if (!subscribedEntityIds) return
    for (const entityId of Object.keys(memory)) subscribedEntityIds.has(entityId) || delete memory[entityId]
    // 本地观测同样要裁掉：否则下一次 `rebuildMemory` 会把已退订的实体又并回来。
    for (const entityId of Object.keys(localMemory)) subscribedEntityIds.has(entityId) || delete localMemory[entityId]
  }

  const rebuildMemory = () => {
    const mergedMemory: CoverMemoryMap = { ...memory }
    for (const [entityId, localEntry] of Object.entries(localMemory))
      mergedMemory[entityId] = mergeCoverMemoryEntries(mergedMemory[entityId], localEntry) || localEntry
    memory = mergedMemory
  }

  async function fetchSnapshot(): Promise<boolean> {
    if (isDisposed || !resolvedFetch || !projectId || !componentId) return false
    activeAbortController?.abort()
    const abortController = new AbortController()
    activeAbortController = abortController
    const timeoutId = setTimeout(() => abortController.abort(), timeoutMs)
    try {
      const response = await resolvedFetch(
        '/api/v1/modules/interaction3d/cover-memory?projectId=' +
          encodeURIComponent(projectId) +
          '&componentId=' +
          encodeURIComponent(componentId),
        { credentials: 'same-origin', signal: abortController.signal },
      )
      if (isDisposed || activeAbortController !== abortController) return false
      if (!response.ok) return false
      const payload = await response.json()
      if (isDisposed || activeAbortController !== abortController) return false
      if (!payload || typeof payload != 'object') return false
      const nextScope = typeof payload.scope == 'string' ? payload.scope : '',
        entries = payload.entries && typeof payload.entries == 'object' ? payload.entries : {}
      if (scope === null) scope = nextScope
      else applyScope(nextScope)
      for (const [entityId, rawEntry] of Object.entries(entries)) {
        if (!COVER_ENTITY_PATTERN.test(entityId)) continue
        if (subscribedEntityIds && !subscribedEntityIds.has(entityId)) continue
        const normalizedEntry = normalizeCoverMemoryEntry(rawEntry)
        if (!normalizedEntry) continue
        memory[entityId] = mergeCoverMemoryEntries(memory[entityId], normalizedEntry) || normalizedEntry
      }
      lastLoadAt = Date.now()
      return true
    } catch {
      // 超时 / 断网 / 非 JSON：记忆只是展示增强，失败静默。
      return false
    } finally {
      clearTimeout(timeoutId)
      if (activeAbortController === abortController) activeAbortController = null
    }
  }

  const startLoad = (force: boolean) => {
    if (isDisposed) return Promise.resolve(false)
    if (inflightLoad) return inflightLoad
    const elapsedMs = Date.now() - lastLoadAt
    if (!force && elapsedMs < MIN_FETCH_INTERVAL_MS) return Promise.resolve(false)
    const loadPromise = fetchSnapshot().finally(() => {
      inflightLoad === loadPromise && (inflightLoad = null)
    })
    inflightLoad = loadPromise
    return loadPromise
  }

  return {
    observe(states, options = {}) {
      if (isDisposed || !states || typeof states != 'object') return
      const isPatch = options.patch === true,
        stateEntries = Object.entries(states)
      if (!isPatch) subscribedEntityIds = new Set()
      subscribedEntityIds ||= new Set()
      for (const [entityId, stateChange] of stateEntries) {
        if (!COVER_ENTITY_PATTERN.test(entityId)) continue
        subscribedEntityIds.add(entityId)
        localMemory[entityId] = observeCoverMemoryState(localMemory[entityId], stateChange) || localMemory[entityId]
        const localEntry = localMemory[entityId]
        if (localEntry) {
          memory[entityId] = mergeCoverMemoryEntries(memory[entityId], localEntry) || localEntry
        }
      }
      if (!isPatch) pruneMemory()
    },
    hydrate(states) {
      if (isDisposed) return states
      rebuildMemory()
      return attachCoverMemory(states, memory)
    },
    load(force = false) {
      return startLoad(force)
    },
    notifyChanged(entityId?: string) {
      if (isDisposed) return
      if (entityId && COVER_ENTITY_PATTERN.test(entityId)) {
        // 后端只会在该实体真的变了时推送；把它标脏即可，拉取一次会带回全部条目。
        const localEntry = localMemory[entityId]
        localEntry && (memory[entityId] = mergeCoverMemoryEntries(memory[entityId], localEntry) || localEntry)
      }
      if (pendingReloadTimerId !== null) return
      pendingReloadTimerId = setTimeout(() => {
        pendingReloadTimerId = null
        void startLoad(true)
      }, MIN_FETCH_INTERVAL_MS)
    },
    entries() {
      rebuildMemory()
      return { ...memory }
    },
    dispose() {
      if (isDisposed) return
      isDisposed = true
      pendingReloadTimerId !== null && (clearTimeout(pendingReloadTimerId), (pendingReloadTimerId = null))
      activeAbortController?.abort()
      activeAbortController = null
      inflightLoad = null
      memory = {}
      localMemory = {}
    },
  }
}

/**
 * 窗帘姿态记忆的**行程字段**（0.8.9 `known_start` / `assumed_state`）。
 *
 * 从 `cover-memory-client.ts` 单独切出的理由：那份文件已经 500+ 行；
 * 而这里全是**纯判定**（不含 IO、不含状态表），可以独立断言。
 *
 * 三个概念：
 * - `assumed`：HA 标记「这个位置是它推测的」（红外电机、重启恢复）。仍要更新显示，但打标。
 * - `travel`：一段行程的**起点**（0.8.9 `known_start`）。没有它，补间只能从「最后一次上报」
 *   出发，而那个值在行程开始时可能已经过时几百毫秒 —— 帘布会先跳一下再动。
 * - `lastState`：上一帧的开合状态，只用于识别「刚进入 opening/closing」这个跃迁。
 *
 * 注意：起点取「行程首帧上报的位置」，不是「停下时的位置」。HA 报 `opening` 的那一帧
 * 往往已经移动了一点；两个值都不精确，取新鲜的那个（停下时的值在稀疏上报下可能
 * 过时数百毫秒）。
 */

/** 行程方向。 */
export type CoverTravelDirection = 'opening' | 'closing'

/** 一次行程的**已知起点**（0.8.9 `known_start`）。 */
export interface CoverMemoryTravel {
  /** 起步时的位置（0–100）。 */
  from: number
  /** 起步时刻（毫秒）。 */
  at: number
  /** 方向。 */
  direction: CoverTravelDirection
}

/** 行程字段落在条目上的形状（本模块只关心这几个键）。 */
export interface CoverTravelFields {
  travel?: CoverMemoryTravel
  lastState?: string
}

/** 0–100 的位置；越界 / 非数一律视作未知。 */
function position(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) && value >= 0 && value <= 100 ? value : null
  if (typeof value !== 'string' || !value.trim()) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 100 ? parsed : null
}

/** 毫秒时间戳；只接受正数（0 会把「更新」判定搞反）。 */
function millis(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

/** 开合状态 → 行程方向（其它状态不是「在动」）。 */
export function travelDirectionOf(stateText: string): CoverTravelDirection | null {
  if (stateText === 'opening') return 'opening'
  if (stateText === 'closing') return 'closing'
  return null
}

/**
 * 记录行程起点，返回要合并进条目的片段。
 *
 * 只在「刚进入 opening/closing」这一刻记一次：起点必须是**已知的**位置（本次上报或
 * 记忆里的最后一次），否则宁可没有 —— 一个错的起点会让补间从错误像素出发。
 */
export function nextTravelState(
  entry: CoverTravelFields & { position?: { position: number } },
  stateText: string,
  reportedPosition: number | null,
  observedAt: number,
): CoverTravelFields {
  const direction = travelDirectionOf(stateText)
  const startPosition = reportedPosition ?? entry.position?.position ?? null
  const isNewTravel = direction !== null && entry.lastState !== stateText && startPosition !== null
  if (!isNewTravel) return { travel: entry.travel, lastState: stateText }
  return { travel: { from: startPosition, at: observedAt, direction }, lastState: stateText }
}

/** 合并行程字段：起点取更晚的一段，上次状态取后到的那份（不参与时间比较）。 */
export function mergeTravelState(merged: CoverTravelFields, incoming: CoverTravelFields): void {
  const shouldAdoptTravel = incoming.travel !== undefined && (!merged.travel || incoming.travel.at >= merged.travel.at)
  if (shouldAdoptTravel) merged.travel = incoming.travel
  if (incoming.lastState) merged.lastState = incoming.lastState
}

/** 解析后端带回的行程起点：认 `travel` / `knownStart` / `known_start`，认不出来就不猜。 */
export function readTravelPayload(rawTravel: unknown): CoverMemoryTravel | null {
  if (!rawTravel || typeof rawTravel !== 'object') return null
  const source = rawTravel as Record<string, unknown>
  const from = position(source.from ?? source.start ?? source.position)
  const at = millis(source.at)
  const direction = travelDirectionOf(String(source.direction ?? ''))
  return from !== null && at !== null && direction !== null ? { from, at, direction } : null
}

/** 解析「上一帧状态」；不在开合四态里就当没有。 */
export function readLastState(raw: unknown, allowedStates: readonly string[]): string | undefined {
  const candidate = typeof raw === 'string' ? raw.trim().toLowerCase() : ''
  return allowedStates.includes(candidate) ? candidate : undefined
}

/** 观察时刻：优先用 HA 的 `updatedAt` / `last_updated`，解析不出来才用本机时间。 */
export function observedTimestamp(rawState: Record<string, unknown>): number {
  const updatedAtText = rawState.updatedAt || rawState.last_updated
  const parsed = typeof updatedAtText === 'string' ? Date.parse(updatedAtText) : Number.NaN
  return Number.isFinite(parsed) && parsed > 0 ? parsed : Date.now()
}

/** `supported_features` 位掩码；坏值按 0（与「没有能力位」同义）。 */
export function supportedFeatureBits(attributes: Record<string, unknown>): number {
  const raw = attributes.supported_features
  if (raw === null || raw === undefined) return 0
  const parsed = Number(raw)
  return Number.isFinite(parsed) ? Math.trunc(parsed) : 0
}

/** HA 是否标记了「这个状态是推测的」（`assumed_state` 有 snake/camel 两种写法）。 */
export function isAssumedState(attributes: Record<string, unknown>, rawState: Record<string, unknown>): boolean {
  return attributes.assumed_state === true || rawState.assumedState === true
}

/**
 * 开合指令的**受理状态机**（0.8.9 `beginCoverOperation` / `observeCoverOperation` /
 * `coverOperationDelay` / `coverProgress`）。
 *
 * ## 为什么必须有这一层
 *
 * 「点一下开窗帘」到「窗帘真的在动」之间有三个**用户可见**的中间态，本项目此前
 * 只有「在动 / 没在动」两种：
 *
 * 1. **已发送但设备还没受理**（RF/红外电机常见 1–3 秒空窗）—— 用户看到滑杆没反应会再点一次；
 * 2. **受理了但没到位**（`openOnly`：只能开不能关的设备，或关门时只收到 open）；
 * 3. **发了停止但没确认**（`暂停未确认`）。
 *
 * 缺少这三态的直接后果是三条 0.8.9 文案（`到位未确认` / `暂停未确认` /
 * `开合状态待确认`）无处安放 —— 它们不是「多写几句话」，而是**状态本身不存在**。
 *
 * ## 与照搬上游的差异
 *
 * 上游把 9 个纯函数平铺导出；这里合成一个 `createCoverOperation` 工厂 + 两个纯函数
 * （`operationDelay` / `operationProgress`），原因是本项目 `cover-feedback` 已经用
 * 闭包持有 presentation 缓存，再平铺 9 个导出会出现两套「谁的 deadline 是谁的」。
 */

/** 一次指令的完整状态。字段名与上游一致，便于对照 `.das` 常量。 */
export type CoverOperation = {
  token: number
  /** 目标位置；`null` = 停止（上游用 null 表达 stop）。 */
  target: number | null
  /** `1` 开 / `-1` 关 / `0` 无方向。 */
  direction: number
  /** 发指令时的位置（用于判断「有没有动」）。 */
  initial: number | null
  /** 超时时刻（ms）。 */
  deadline: number
  /** 设备状态已朝向目标变化 = 已受理。 */
  accepted: boolean
  /** 收到了与指令一致的位置回报。 */
  observed: boolean
  /** 超过 deadline 仍未受理。 */
  expired: boolean
  /** 「只能开」的设备（关指令被拒，或 open_cover 却报 100）。 */
  openOnly: boolean
  /** 发了 stop 且已到位（停止成功）。 */
  stopped: boolean
}

/** 受理窗口下限（ms）：上游 `max(15000, travel + 2000)`。 */
const MIN_ACCEPT_WINDOW_MS = 15000

/**
 * 新建一次指令。
 *
 * `deadline` 取 `max(15000, travel + 2000)`：一次完整行程通常 ≤ 60s，15s 下限是为了
 * 覆盖「设备状态轮询间隔 10s」这种慢信道，否则会误判成未受理。
 */
export function beginCoverOperation(options: {
  token: number
  target: number | null
  initial: number | null
  now: number
  travelTime: number
}): CoverOperation {
  const { token, target, initial, now, travelTime } = options
  const direction = target === null ? 0 : Math.sign(target - (initial ?? (target === 0 ? 100 : 0)))
  return {
    token,
    target,
    direction,
    initial,
    deadline: now + Math.max(MIN_ACCEPT_WINDOW_MS, travelTime + 2000),
    accepted: false,
    observed: false,
    expired: false,
    openOnly: false,
    stopped: false,
  }
}

/**
 * 用最新状态推进指令：受理 / 观测 / 过期 / 仅开 / 已停止。
 *
 * 不可推断的情形（设备标了 `assumed`、或明确说不支持整体反馈）直接原样返回 ——
 * 那是「我们不知道」，把它算成已受理会让面板显示一个假的进度。
 */
export function observeCoverOperation(
  operation: CoverOperation | null,
  next: CoverObservation,
  previous: CoverObservation | null,
  now: number,
): CoverOperation | null {
  if (!previous || !canAdvance(operation, next, previous)) return operation
  return advanceOperation(operation, next, previous, now)
}

/** `observeCoverOperation` 的状态检查入参（也便于单测直接构造）。 */
export type CoverObservation = {
  position: number | null
  state: string
  assumed?: boolean
  overallFeedbackAvailable?: boolean
}

/**
 * 这条观测是否**足以推进**指令状态。
 *
 * 三种「不知道」都原样返回、不推进：
 * - 没有指令 / 没有上一帧（无法判断变化）；
 * - 指令已停止或已过期（终态不再变）；
 * - 设备自己标了推测态或明确说没有整体反馈 —— 把它算成已受理会让面板显示假进度。
 */
function canAdvance(
  operation: CoverOperation | null,
  next: CoverObservation,
  previous: CoverObservation | null,
): operation is CoverOperation {
  if (!operation || !previous) return false
  if (operation.stopped || operation.expired) return false
  return !next.assumed && next.overallFeedbackAvailable !== false
}

/** 一次推进要改的四个布尔量（先算再合并，避免长表达式推高复杂度）。 */
function deriveFlags(operation: CoverOperation, next: CoverObservation, previous: CoverObservation, now: number) {
  const arrived = isAtTarget(operation, next.position)
  const moved = next.position !== previous.position || next.state !== previous.state
  const accepted = operation.accepted || moved || arrived
  return {
    arrived,
    accepted,
    expired: !accepted && now > operation.deadline,
    openOnly: operation.openOnly || isOpenOnlyReport(operation, next.position),
  }
}

/** 指令的目标位置是否已经到达（没有目标 = 停止指令，永远不算到达）。 */
function isAtTarget(operation: CoverOperation, nextPosition: number | null): boolean {
  return operation.target !== null && nextPosition !== null && nextPosition === operation.target
}

/** 真正的状态推进（纯计算，不含「该不该算」的前置判断）。 */
function advanceOperation(
  operation: CoverOperation,
  next: CoverObservation,
  previous: CoverObservation,
  now: number,
): CoverOperation {
  const { arrived, accepted, expired, openOnly } = deriveFlags(operation, next, previous, now)
  return {
    ...operation,
    accepted,
    observed: operation.observed || arrived,
    expired,
    openOnly,
    stopped: operation.target === null && arrived,
  }
}

/**
 * 「只能开」的判定：指令是关闭，但设备报到了 100。
 *
 * 单独拆出来是因为它有三个前置条件（有目标 / 目标低于初始 / 位置恰好 100），
 * 内联进主流程会把函数复杂度推过门禁阈值。
 */
function isOpenOnlyReport(operation: CoverOperation, nextPosition: number | null): boolean {
  if (operation.target === null) return false
  return operation.target < (operation.initial ?? 0) && nextPosition === 100
}

/** 还要等多久才该提示「未受理」；已受理或已过期返回 `Infinity`（不提示）。 */
export function operationDelay(operation: CoverOperation | null, now: number): number {
  if (!operation || !operation.accepted || operation.expired) return Number.POSITIVE_INFINITY
  return Math.max(0, operation.deadline - now)
}

/**
 * 设备状态的「上报时刻」（0.8.9 `coverReportTime`）。
 *
 * 用途：判断「这条状态是新的还是缓存」—— 位置没变但上报时间更新，说明设备真的
 * 又报了一次（而不是我们拿着旧值在算）。
 */
export function coverReportTime(
  state:
    | {
        raw?: { last_updated?: string; updatedAt?: string }
      }
    | null
    | undefined,
): number {
  return Date.parse(state?.raw?.last_updated ?? state?.raw?.updatedAt ?? '')
}

/** 一段行程插值（`from → to`）。时长下限 180ms，避免「1% 的微调」看不出在动。 */
export function coverTravel(from: number, to: number, start: number, travelTime: number) {
  return {
    from,
    to,
    start,
    duration: Math.max(180, (Math.abs(to - from) / 100) * travelTime),
  }
}

export type CoverMotion = { from: number; to: number; start: number; duration: number }

/**
 * 预览行程：先走**一半**，并开一个探测窗口（0.8.9 `previewCoverTravel`）。
 *
 * 为什么只走一半：设备受理后会自己动到目标，我方动画继续跑完会和真实位置打架，
 * 表现为轨道「冲过去又弹回来」。半程 + 探测窗口是两者的折中。
 */
export function previewCoverTravel(motion: CoverMotion, enabled: boolean) {
  if (!enabled) return { motion, probe: null as null | { until: number; end: number; to: number } }
  const { from, to, start, duration } = motion
  const halfDuration = Math.min(900, duration / 2)
  const midpoint = from + Math.sign(to - from) * Math.min(1, Math.abs(to - from) / 2)
  return {
    motion: { ...motion, to: midpoint, duration: halfDuration },
    probe: { until: start + halfDuration, end: start + duration, to },
  }
}

/**
 * 探测窗口结束后接续到目标（0.8.9 `continueCoverTravel`）。
 *
 * 返回 `null` 表示还在窗口内（调用方应保持现状）。
 */
export function continueCoverTravel(
  entry: {
    probe?: { until: number; end: number; to: number } | null
    motion?: CoverMotion | null
    position?: number | null
  },
  now: number,
): { motion: CoverMotion } | null {
  const probe = entry.probe
  if (!probe || now < probe.until) return null
  const from = entry.motion?.to ?? entry.position ?? 0
  return { motion: { from, to: probe.to, start: probe.until, duration: Math.max(180, probe.end - probe.until) } }
}

/**
 * 新指令是否与在途指令**方向相反**（0.8.9 `previousCoverDirection`）。
 *
 * 反向时不能直接覆盖动画：先让当前那段停住再反转，否则轨道会闪一下。
 */
export function previousCoverDirection(
  operation: CoverOperation | null,
  previousPosition: number | null,
  nextPosition: number | null,
): boolean {
  if (!operation?.direction || operation.stopped || operation.expired) return false
  const moved = previousPosition !== null && nextPosition !== null ? Math.sign(nextPosition - previousPosition) : 0
  return moved !== 0 && moved !== operation.direction
}

/** 别名：与上游导出名一致，便于契约门禁与排障时按上游名字检索。 */
export const coverOperationDelay = operationDelay
export const coverProgress = operationProgress

export type OperationProgress = {
  /** 位置的可信来源。 */
  source: 'history' | 'estimate' | 'reported' | 'unknown'
  /** 面板状态行文案；空串表示不额外提示（沿用普通状态文案）。 */
  label: string
}

/**
 * 指令进度 → 状态行文案。
 *
 * 文案与 0.8.9 逐字一致：`已发送` / `已发送 · 位置未知` / `已打开 · 开度未知` /
 * `已打开 · 开度未确认` / `到位未确认` / `暂停未确认` / `开合状态待确认`。
 * 分隔符用 ` · `（上游用中点，不是斜杠）。
 */
export function operationProgress(
  position: number | null,
  options: {
    estimated?: boolean
    remembered?: boolean
    moving?: boolean
    operation?: CoverOperation | null
    settledEstimate?: boolean
  } = {},
): OperationProgress {
  const { estimated, remembered, moving, operation, settledEstimate } = options
  const source: OperationProgress['source'] =
    position === null
      ? 'unknown'
      : remembered
        ? 'history'
        : estimated
          ? 'estimate'
          : settledEstimate
            ? 'reported'
            : 'reported'

  return { source, label: operationLabelFor(position, operation, moving === true) }
}

/**
 * 指令状态 → 状态行文案（抽出来是为了把函数级复杂度压在门禁阈值内）。
 *
 * 判据顺序即优先级：过期 > 停止 > 仅开 > 未受理 > 已受理未观测。
 * 顺序不能换 —— 「过期」与「未受理」都会命中 `!accepted`，先判过期才会给出
 * 「开合状态待确认」而不是永远停在「已发送」。
 */
function operationLabelFor(
  position: number | null,
  operation: CoverOperation | null | undefined,
  moving: boolean,
): string {
  if (!operation) return ''
  if (operation.expired) return '开合状态待确认'
  if (operation.target === null) return operation.stopped ? '' : '暂停未确认'
  if (operation.openOnly) return position === null ? '已打开 · 开度未知' : '已打开 · 开度未确认'
  if (!operation.accepted && !moving) return position === null ? '已发送 · 位置未知' : '已发送'
  if (operation.accepted && !operation.observed && !moving) return '到位未确认'
  return ''
}

/**
 * 从面板的 `pendingIntent` 还原一次指令 → 状态行文案。
 *
 * 面板持有的是「意图」（service/target/initial），`CoverOperation` 是它的**可判定
 * 投影**：受理窗口、过期、仅开、停止都由纯函数算，面板只负责把结果写进 DOM。
 *
 * 返回空串 = 不额外提示（沿用普通状态文案）。
 */
function coverOperationLabel(
  pendingIntent: {
    ticket: number
    target?: number | null
    initialPosition: number | null
    initialState: string
    confirmed: boolean
    blade?: boolean
  } | null,
  deviceState: {
    position: number | null
    state: string
    assumed?: boolean
    overallFeedbackAvailable?: boolean
  },
  presentation: { estimated?: boolean; moving?: boolean; position?: number | null },
  view: { airer?: boolean; editing?: boolean } = {},
): string {
  // 晾衣架：报了「在动」但没有任何位置回报 —— 不能说「升降状态未知」（那是没数据），
  // 也不能说「正在上升」（那是猜）。它优先于指令受理状态（位置都不知道，谈不上到位）。
  if (view.airer && !view.editing && deviceState.position === null && presentation.position === null) {
    return '升降位置未知'
  }
  if (!pendingIntent || pendingIntent.blade || pendingIntent.confirmed) return ''
  const now = Date.now()
  const operation = beginCoverOperation({
    token: pendingIntent.ticket,
    target: pendingIntent.target ?? null,
    initial: pendingIntent.initialPosition,
    now,
    travelTime: 15000,
  })
  const observed = observeCoverOperation(
    operation,
    {
      position: deviceState.position,
      state: deviceState.state,
      assumed: deviceState.assumed,
      overallFeedbackAvailable: deviceState.overallFeedbackAvailable,
    },
    { position: pendingIntent.initialPosition, state: pendingIntent.initialState },
    now,
  )
  return operationProgress(deviceState.position, {
    estimated: presentation.estimated,
    moving: presentation.moving,
    operation: observed,
  }).label
}

/** cover 面板的宿主元素与回调； */
type CoverPanelOptions = {
  element?: any
  onControl?: (...args: any[]) => any
  onPreview?: (...args: any[]) => any
  onExtraControl?: (...args: any[]) => any
  onLayout?: (...args: any[]) => any
  /** 宿主已经装好的反馈聚合区（`createPopupFeedback` 实例）；缺省时面板自建。 */
  feedbackSlot?: any
}

/** 面板视图模型由 stage 的 update() 注入：字段来自运行时设备状态（动态属性袋），这里按实际访问到的键显式列出并全部保持可选，不做窄化假设。 */
type CoverPanelViewModel = {
  item?: any
  states?: any
  editing?: any
  state?: any
  presentation?: any
  error?: any
  /** 实体 → HA 显示精度（`number-formats` 通道）。 */
  numberFormats?: Record<string, number>
  /** 开窗器专属提示（关联窗扇缺失等），由舞台下发。 */
  windowNotice?: string
}

export function createCoverPanel({
  element: hostElement,
  feedbackSlot: hostFeedbackSlot,
  onControl: onControl = async () => {},
  onPreview: onPreview = () => {},
  onExtraControl: onExtraControl = async () => {},
  onLayout: onLayout = () => {},
}: CoverPanelOptions = {}) {
  const ownerDocument = hostElement?.ownerDocument || globalThis.document,
    createElement = (tagName: any, className = '', textContent = '') =>
      domElement(ownerDocument, tagName, className, textContent),
    replaceChildren = (hostNode: any, ...childNodes: any[]) => {
      if (typeof hostNode.replaceChildren == 'function') hostNode.replaceChildren(...childNodes)
      else {
        for (const existingChildElement of [...(hostNode.children || [])]) existingChildElement.remove?.()
        hostNode.append(...childNodes)
      }
    },
    rootElement = hostElement || createElement('section')
  rootElement.classList.add('i3d-cover-panel')
  const headingElement = createElement('div', 'i3d-cover-heading i3d-popup-heading'),
    titleElement = createElement('h3', '', '窗帘'),
    statusElement = createElement('p', '', '尚未绑定设备'),
    headingTextElement = createElement('div', 'i3d-cover-heading-text i3d-popup-heading-text')
  const deviceVisual = createStageDeviceVisual({
    kind: 'cover',
    document: ownerDocument,
    onActivate: () => {
      if (!canControl()) return
      const presentation = resolvePresentation()
      if (
        presentation.moving ||
        (pendingIntent &&
          !pendingIntent.confirmed &&
          ['open_cover', 'close_cover', 'set_cover_position'].includes(pendingIntent.service))
      ) {
        deviceState.stopSupported && requestControl('stop_cover')
        return
      }
      // 梦幻帘点击角标切换整体轨道开合，不用叶片角度判断
      const isDream = viewModel.item?.coverKind === 'dream'
      const currentPosition =
        draftPosition ?? presentation.position ?? deviceState.position ?? (presentation.on ? 100 : 0)
      const isOpen = isDream
        ? !!(
            presentation.on ||
            presentation.state === 'open' ||
            presentation.state === 'opening' ||
            (presentation.position ?? 0) > 0
          )
        : !!(
            presentation.on ||
            currentPosition > 0 ||
            presentation.state === 'open' ||
            presentation.state === 'opening'
          )
      requestControl(isOpen ? 'close_cover' : 'open_cover')
    },
  })
  headingTextElement.append(titleElement, statusElement), headingElement.append(headingTextElement, deviceVisual.root)
  const bladeHintElement = createElement('p', 'i3d-cover-blade-hint', '叶片角度 · 50% 为 90°打开')
  bladeHintElement.hidden = true
  const controlsSlotElement = createElement('div', 'i3d-cover-controls-slot'),
    controlsElement = createElement('section', 'hb-cover-details-controls'),
    positionLabelElement = createElement('label', 'hb-cover-details-position'),
    positionHeadingElement = createElement('span', 'hb-cover-details-position-heading'),
    positionOutputElement = createElement('output')
  positionOutputElement.setAttribute('aria-label', '当前开合位置'), positionHeadingElement.append(positionOutputElement)
  const positionSliderElement = createElement('input')
  ;(positionSliderElement.type = 'range'),
    positionSliderElement.classList.add('hb-range'),
    (positionSliderElement.min = '0'),
    (positionSliderElement.max = '100'),
    (positionSliderElement.step = '1'),
    positionSliderElement.setAttribute('aria-label', '目标开合位置')
  const positionLegendElement = createElement('span', 'hb-cover-details-position-legend')
  positionLegendElement.append(createElement('small', '', '关闭'), createElement('small', '', '打开')),
    positionLabelElement.append(positionHeadingElement, positionSliderElement, positionLegendElement)
  const actionsElement = createElement('div', 'hb-cover-details-actions'),
    actionButtons: any = []
  for (const [actionLabel, controlService, capabilityKey] of [
    ['关闭', 'close_cover', 'closeSupported'],
    ['暂停', 'stop_cover', 'stopSupported'],
    ['打开', 'open_cover', 'openSupported'],
  ]) {
    const buttonElement = createElement('button')
    ;(buttonElement.type = 'button'),
      (buttonElement.dataset.coverAction = controlService),
      buttonElement.setAttribute('aria-label', actionLabel),
      buttonElement.append(createElement('strong', '', actionLabel)),
      buttonElement.addEventListener('click', () => requestControl(controlService)),
      actionButtons.push({
        button: buttonElement,
        service: controlService,
        capability: capabilityKey,
      }),
      actionsElement.append(buttonElement)
  }
  controlsElement.append(positionLabelElement, actionsElement), controlsSlotElement.append(controlsElement)
  // 开窗器的状态提示（关联窗扇缺失 / 行程未知等），由舞台随载荷下发 `windowNotice`。
  const windowNoticeElement = createElement('p', 'i3d-note i3d-window-opener-notice')
  windowNoticeElement.hidden = true
  // 开门器与门磁读数矛盾时的提示（0.9.0）；没有矛盾就整行收起。
  const doorContactNoticeElement = createElement('p', 'i3d-note i3d-door-contact-notice')
  doorContactNoticeElement.hidden = true
  const feedbackElement = createElement('p', 'i3d-cover-feedback')
  ;(feedbackElement.hidden = true),
    feedbackElement.setAttribute('role', 'status'),
    feedbackElement.setAttribute('aria-live', 'polite')
  const extrasPanelElement = createElement('div', 'i3d-climate-panel i3d-airer-extras'),
    extrasGridElement = createElement('div', 'i3d-purifier-extras i3d-extra-grid')
  extrasPanelElement.append(extrasGridElement)
  // 宿主没有反馈聚合区时自建（0.7.8 `cover-panel.js`）。
  const ownFeedbackSlot = hostFeedbackSlot ? null : createPopupFeedback({ element: rootElement }),
    feedbackSlot = hostFeedbackSlot || ownFeedbackSlot
  const purifierExtrasController = createPurifierExtras({
      element: extrasGridElement,
      feedbackSlot,
      onControl: onExtraControl,
      onLayout: onLayout,
    }),
    popupBodyElement = createElement('div', 'i3d-popup-body')
  popupBodyElement.append(
    bladeHintElement,
    controlsSlotElement,
    windowNoticeElement,
    doorContactNoticeElement,
    feedbackElement,
    extrasPanelElement,
  ),
    replaceChildren(rootElement, headingElement, popupBodyElement)
  let viewModel: CoverPanelViewModel = {},
    deviceState = coverState('', null),
    isDisposed = false,
    instanceId = 0,
    ticketCounter = 0,
    isRailUnconfirmed = false,
    nativeTiltElement: any = null,
    tiltPositionSliderElement: any = null,
    tiltPositionOutputElement: any = null,
    draftTiltPosition: any = null,
    tiltTicketCounter = 0,
    pendingIntent: any = null,
    intentTimeoutId: any = null,
    draftPosition: any = null,
    isDragging = false,
    errorText = '',
    stateRevision = 0,
    stateSignature = ''
  const AIRER_NO_FEEDBACK_MESSAGE = '设备未回报升降状态，请检查设备。',
    RANGE_NO_FEEDBACK_MESSAGE = '设备未响应，请重试。'
  const releaseFeedback = feedbackSlot.attach(feedbackElement, {
    source: () => viewModel.item?.entityId || '',
    label: () => titleElement.textContent || '',
  })
  const airerPendingFeedbackMessage = () => {
    if (!viewModel.item?.airer || !pendingIntent || pendingIntent.confirmed) return ''
    if (pendingIntent.sending) return '正在发送升降指令…'
    if (pendingIntent.service === 'stop_cover') return '等待暂停回报…'
    if (pendingIntent.service === 'open_cover') return '等待上升回报…'
    if (pendingIntent.service === 'close_cover') return '等待下降回报…'
    return '等待目标高度回报…'
  }
  const canControl = () =>
      !isDisposed && !viewModel.editing && viewModel.item?.modelAvailable !== false && deviceState.available,
    resolveTargetPosition = () =>
      draftPosition ??
      viewModel.presentation?.targetPosition ??
      viewModel.presentation?.position ??
      (pendingIntent?.confirmed ? deviceState.position : (pendingIntent?.target ?? deviceState.position)),
    resolvePresentation = () =>
      viewModel.presentation || {
        ...deviceState,
        closedConfirmed: deviceState.closedConfirmed && !isRailUnconfirmed,
      },
    resolveDreamBladePosition = () =>
      viewModel.presentation?.tiltTarget ?? viewModel.presentation?.tiltPosition ?? deviceState.tiltPosition,
    // 梦幻帘：轨道停在「全开 / 全关」两端时才可调叶片；普通帘滑杆即整体开合位置。
    canAdjustSlider = () =>
      canControl() &&
      (viewModel.item?.coverKind === 'dream'
        ? coverCanAdjustBlades(deviceState, resolvePresentation())
        : deviceState.positionSupported)
  function clearPendingIntent() {
    intentTimeoutId !== null && clearTimeout(intentTimeoutId), (intentTimeoutId = null), (pendingIntent = null)
  }
  function syncSlider() {
    const isDream = viewModel.item?.coverKind === 'dream',
      sliderPosition = isDream ? (draftPosition ?? resolveDreamBladePosition()) : resolveTargetPosition()
    ;(positionSliderElement.value = String(sliderPosition ?? 0)),
      applyRangeProgressCss(positionSliderElement, (sliderPosition ?? 0) + '%'),
      positionSliderElement.setAttribute(
        'aria-valuetext',
        sliderPosition === null
          ? '当前位置未知，滑动设置目标'
          : isDream
            ? '叶片角度 ' + Math.round(sliderPosition) + '%，50% 为 90°打开'
            : '目标 ' +
              Math.round(sliderPosition) +
              '%，当前位置' +
              (deviceState.position === null ? '未知' : Math.round(deviceState.position) + '%'),
      ),
      rootElement.setAttribute('aria-invalid', String(!!(viewModel.error || errorText)))
  }
  async function sendControl(command: any) {
    if (!deviceState.dream && command.service.includes('_tilt')) {
      const instanceAtSend = instanceId,
        tiltTicket = ++tiltTicketCounter
      ;(draftTiltPosition = null), (errorText = ''), render()
      try {
        await onControl(command, viewModel.item)
      } catch (error: any) {
        !isDisposed &&
          instanceId === instanceAtSend &&
          tiltTicketCounter === tiltTicket &&
          ((errorText = error?.message || '叶片控制失败，请重试。'), render())
      }
      return
    }
    const instanceAtSend = instanceId,
      ticket = ++ticketCounter,
      hasPresentation = !!viewModel.presentation
    clearPendingIntent(),
      (draftPosition = null),
      (isDragging = false),
      (errorText = ''),
      deviceState.dream &&
        ['open_cover', 'close_cover', 'stop_cover'].includes(command.service) &&
        (isRailUnconfirmed ||= command.service === 'open_cover' || !deviceState.closedConfirmed),
      (pendingIntent = {
        blade:
          viewModel.item?.coverKind === 'dream' &&
          ['set_cover_position', 'set_cover_tilt_position'].includes(command.service),
        ticket: ticket,
        revision: stateRevision,
        initialState: deviceState.state,
        initialPosition: deviceState.position,
        confirmed: false,
        wasMoving: false,
        service: command.service,
        target:
          command.service === 'set_cover_position'
            ? command.data.position
            : command.service === 'open_cover'
              ? 100
              : command.service === 'close_cover'
                ? 0
                : null,
        sending: true,
      }),
      hasPresentation ||
        (intentTimeoutId = setTimeout(() => {
          if (isDisposed || instanceId !== instanceAtSend || pendingIntent?.ticket !== ticket) return
          intentTimeoutId = null
          pendingIntent = null
          errorText = viewModel.item?.airer ? AIRER_NO_FEEDBACK_MESSAGE : RANGE_NO_FEEDBACK_MESSAGE
          render()
        }, 15000)),
      render()
    try {
      await onControl(command, viewModel.item)
    } catch (error: any) {
      !isDisposed &&
        instanceId === instanceAtSend &&
        ticketCounter === ticket &&
        (clearPendingIntent(),
        (errorText =
          error?.message ||
          // 0.9.0 按设备类型分开三条：门窗是「开门器控制失败」，升降是「晾衣架」，
          // 其余归到「窗帘」。混用会让门机用户以为是窗帘配错了。
          (viewModel.item?.airer
            ? '晾衣架控制失败，请重试。'
            : viewModel.item?.doorOpener === true
              ? '开门器控制失败，请重试。'
              : '窗帘控制失败，请重试。')),
        render())
    } finally {
      !isDisposed &&
        instanceId === instanceAtSend &&
        ticketCounter === ticket &&
        (hasPresentation ? clearPendingIntent() : pendingIntent && (pendingIntent.sending = false), render())
    }
  }
  function requestControl(requestedService: any, controlValue: any = undefined) {
    if (viewModel.item?.airer) {
      requestedService = airerMapControlService(requestedService, viewModel.item)
      if (requestedService === 'set_cover_position' && controlValue !== undefined && controlValue !== null)
        controlValue = airerMapControlPosition(controlValue, viewModel.item)
    }
    if (canControl())
      try {
        return sendControl(
          coverControl(
            {
              ...deviceState,
              ...resolvePresentation(),
              // 门禁（coverCanAdjustBlades）以设备自报位置为准：presentation 的位置可能还在做
              // 收尾平滑动画，别让它盖掉设备刚刚报出来的真实位置。
              position: deviceState.positionKnown ? deviceState.position : resolvePresentation().position,
            },
            requestedService,
            controlValue,
          ),
        )
      } catch (controlError: any) {
        ;(errorText = controlError.message), render()
      }
  }
  positionSliderElement.addEventListener('pointerdown', () => {
    canAdjustSlider() && (isDragging = true)
  }),
    positionSliderElement.addEventListener('input', () => {
      if (!canAdjustSlider()) return
      const sliderValue = Number(positionSliderElement.value)
      if (!Number.isFinite(sliderValue)) return
      ;(isDragging = true), (draftPosition = Math.max(0, Math.min(100, Math.round(sliderValue))))
      const previewPresentation = onPreview(viewModel.item?.entityId, draftPosition, viewModel.item)
      previewPresentation &&
        (viewModel = {
          ...viewModel,
          presentation: previewPresentation,
        }),
        render()
    }),
    positionSliderElement.addEventListener('change', () => {
      if (draftPosition === null) {
        ;(isDragging = false), syncSlider()
        return
      }
      const committedPosition = draftPosition
      if (((draftPosition = null), (isDragging = false), canAdjustSlider()))
        return requestControl(
          viewModel.item?.coverKind === 'dream' && deviceState.tiltSupported
            ? 'set_cover_tilt_position'
            : 'set_cover_position',
          committedPosition,
        )
      syncSlider()
    })
  function cancelPreview() {
    ;(draftPosition = null), (isDragging = false)
    const clearedPreview = onPreview(viewModel.item?.entityId, null, viewModel.item)
    clearedPreview &&
      (viewModel = {
        ...viewModel,
        presentation: clearedPreview,
      }),
      render()
  }
  positionSliderElement.addEventListener('pointercancel', cancelPreview),
    positionSliderElement.addEventListener('blur', () => {
      draftPosition !== null && cancelPreview()
    })
  function syncTiltSection() {
    if (
      !(
        !deviceState.dream &&
        !viewModel.item?.airer &&
        (deviceState.tiltSupported ||
          deviceState.tiltOpenSupported ||
          deviceState.tiltCloseSupported ||
          deviceState.tiltStopSupported)
      )
    ) {
      if (nativeTiltElement) {
        ;(nativeTiltElement.hidden = true), (tiltPositionSliderElement.disabled = true)
        for (const tiltButton of nativeTiltElement.children[2].children) tiltButton.disabled = true
      }
      draftTiltPosition = null
      return
    }
    if (!nativeTiltElement) {
      ;(nativeTiltElement = createElement('section', 'i3d-cover-native-tilt')),
        nativeTiltElement.append(createElement('h4', '', '叶片角度'))
      const tiltLabelElement = createElement('label', 'hb-cover-details-position')
      ;(tiltPositionOutputElement = createElement('output')),
        tiltPositionOutputElement.setAttribute('aria-label', '当前叶片位置'),
        (tiltPositionSliderElement = createElement('input')),
        (tiltPositionSliderElement.type = 'range'),
        tiltPositionSliderElement.classList.add('hb-range'),
        (tiltPositionSliderElement.min = '0'),
        (tiltPositionSliderElement.max = '100'),
        (tiltPositionSliderElement.step = '1'),
        tiltPositionSliderElement.setAttribute('aria-label', '目标叶片位置'),
        tiltPositionSliderElement.addEventListener('input', () => {
          canAdjustSlider() &&
            deviceState.tiltSupported &&
            ((draftTiltPosition = Number(tiltPositionSliderElement.value)), syncTiltSection())
        }),
        tiltPositionSliderElement.addEventListener('change', () => {
          const committedTiltPosition = draftTiltPosition
          ;(draftTiltPosition = null),
            committedTiltPosition !== null && canAdjustSlider() && deviceState.tiltSupported
              ? requestControl('set_cover_tilt_position', committedTiltPosition)
              : syncTiltSection()
        })
      const cancelTiltPreview = () => {
        ;(draftTiltPosition = null), syncTiltSection()
      }
      tiltPositionSliderElement.addEventListener('pointercancel', cancelTiltPreview),
        tiltPositionSliderElement.addEventListener('blur', cancelTiltPreview),
        tiltLabelElement.append(tiltPositionOutputElement, tiltPositionSliderElement),
        nativeTiltElement.append(tiltLabelElement)
      const tiltActionsElement = createElement('div', 'hb-cover-details-actions')
      for (const [tiltLabel, tiltService, tiltCapability] of [
        ['关闭叶片', 'close_cover_tilt', 'tiltCloseSupported'],
        ['暂停叶片', 'stop_cover_tilt', 'tiltStopSupported'],
        ['打开叶片', 'open_cover_tilt', 'tiltOpenSupported'],
      ]) {
        const tiltButtonElement = createElement('button')
        ;(tiltButtonElement.type = 'button'),
          (tiltButtonElement.dataset.coverAction = tiltService),
          (tiltButtonElement.dataset.capability = tiltCapability),
          tiltButtonElement.setAttribute('aria-label', tiltLabel),
          tiltButtonElement.append(createElement('strong', '', tiltLabel)),
          tiltButtonElement.addEventListener('click', () => ((draftTiltPosition = null), requestControl(tiltService))),
          tiltActionsElement.append(tiltButtonElement)
      }
      nativeTiltElement.append(tiltActionsElement), popupBodyElement.append(nativeTiltElement)
    }
    nativeTiltElement.hidden = false
    // 叶片角度同样支持记忆值：设备没报 current_tilt_position 时显示「上次 N%」。
    const tiltRemembered = deviceState.tiltPosition === null ? (deviceState.tiltMemory?.position ?? null) : null,
      tiltPosition = draftTiltPosition ?? deviceState.tiltPosition ?? tiltRemembered
    tiltPositionOutputElement.classList.toggle('is-remembered', tiltRemembered !== null && draftTiltPosition === null),
      (tiltPositionOutputElement.textContent =
        tiltPosition === null
          ? '未知'
          : (tiltRemembered !== null && draftTiltPosition === null ? '上次\n' : '') + Math.round(tiltPosition) + '%'),
      (tiltPositionSliderElement.value = String(tiltPosition ?? 0)),
      (tiltPositionSliderElement.disabled = !canAdjustSlider() || !deviceState.tiltSupported),
      applyRangeProgressCss(tiltPositionSliderElement, (tiltPosition ?? 0) + '%'),
      tiltPositionSliderElement.parentElement &&
        (tiltPositionSliderElement.parentElement.hidden = !deviceState.tiltSupported)
    for (const tiltButton of nativeTiltElement.children[2].children)
      (tiltButton.hidden = !(deviceState as any)[tiltButton.dataset.capability]),
        (tiltButton.disabled = !canAdjustSlider() || !(deviceState as any)[tiltButton.dataset.capability])
  }
  function render() {
    if (isDisposed) return
    ;(titleElement.textContent =
      viewModel.item?.label || deviceState.name || (viewModel.item?.airer ? '晾衣架' : '窗帘')),
      (titleElement.title = titleElement.textContent)
    const presentation = resolvePresentation()
    statusElement.textContent = viewModel.editing
      ? '控制预览'
      : viewModel.item?.entityId
        ? deviceState.available
          ? // unknown 不等于「设备不可用」：瞬态被停滞看门狗降级、或尚未拿到可信整体反馈都属于这一档，
            // 说成不可用会误导，统一回落「在线」。
            presentation.state === 'unknown'
            ? '在线'
            : coverStateLabel(presentation.state, {
                airer: !!viewModel.item?.airer,
              })
          : '设备不可用'
        : '尚未绑定设备'
    const isDreamCover = viewModel.item?.coverKind === 'dream',
      isAirerItem = viewModel.item?.airer,
      isWindowOpenerItem = viewModel.item?.windowOpener === true,
      /*
       * 门面板（0.9.0）：门机常不回报位置，所以文案要同时表达「开没开」「开度知不知道」
       * 「指令受理没受理」「开门器能不能用」。判定与文案都在 `door-panel-state.ts`，
       * 这里只负责把面板现有数据喂给它。
       */
      isDoorOpenerItem = viewModel.item?.doorOpener === true,
      doorRawState = (deviceState as any)?.state as string | undefined,
      /**
       * 门磁读数（三态）：按 `contactEntityIds` 依次找第一个有读数的实体。
       *
       * `binary_sensor` 的 `on` / `off` 与 `switch` 同构；门磁整体实体常见是
       * `door`/`garage_door` 域（`open`/`closed`）。两套都要认，否则「只在安防配了门磁」
       * 的门会永远显示「未确认」。
       */
      doorContactOpen = (() => {
        const contactEntityIds: string[] = viewModel.item?.contactEntityIds || []
        for (const contactEntityId of contactEntityIds) {
          const contactState = viewModel.states?.[contactEntityId]
          const normalizedContactState = String(contactState?.state ?? '')
            .trim()
            .toLowerCase()
          if (!normalizedContactState || contactState?.available === false) continue
          if (['on', 'open', 'opening', 'detected'].includes(normalizedContactState)) return true
          if (['off', 'closed', 'closing', 'clear'].includes(normalizedContactState)) return false
        }
        return null
      })(),
      doorOpenFromPosition =
        deviceState.position === null
          ? doorRawState === 'open' || doorRawState === 'opening'
            ? true
            : doorRawState === 'closed' || doorRawState === 'closing'
              ? false
              : null
          : (deviceState.position as number) > 0,
      doorPanelInput = {
        doorOpen: doorOpenFromPosition,
        // 门机只有 `cover` 域才给百分比；`switch` 门机只知道开/关。
        positionKnown: deviceState.position !== null,
        openerAvailable: deviceState.available,
        // 0.9.0 把「门没配好」与「开关实体掉线」分成两档文案：
        // 前者是 `门已打开 · 开门器不可用`，后者在标题后追加 ` · 开关不可用`。
        switchAvailable: deviceState.available,
        waitingForReset: (deviceState as any)?.momentarySwitch?.waitingForReset === true,
        // 面板已经在用 `pendingIntent` 表达「指令已下发、等回报」。
        awaitingReport: !!pendingIntent && !pendingIntent.confirmed,
        momentary: viewModel.item?.switchMode === 'momentary',
        targetPosition: pendingIntent?.target ?? null,
        // 门磁读数：`doorPanelLabel` 用 `doorOpen`（开门器/门机自报），这里单独带一份给
        // 「不一致」判定用 —— 两者语义不同，混用会让「门已打开 · 开度未知」误报。
        contactOpen: doorContactOpen,
      } as const,
      // 「部分开启」只看设备实际回报的位置：设备刚报 全开/100 时，本地位置还在做收尾平滑动画，
      // 拿动画中的中间值判断会让卡片先闪一下「整体部分开启」再跳「整体已开启」。
      railReportedPosition = deviceState.position ?? presentation.position,
      dreamStateLabel = (
        {
          open: '整体已开启',
          closed: '整体已关闭',
          opening: '整体正在开启',
          closing: '整体正在关闭',
        } as any
      )[presentation.state]
    // 0.8.9 指令受理状态：这里先算出来（纯函数，只读 `pendingIntent` + `presentation`），
    // 下面的链式赋值里才有东西可用 —— 链内不能再声明变量。
    const operationStatusLabel = coverOperationLabel(pendingIntent, deviceState, presentation, {
      airer: !!isAirerItem,
      editing: !!viewModel.editing,
    })
    rootElement.classList.toggle('is-dream', isDreamCover),
      // 0.9.0：门面板单独一个状态类，供 `cover-panel.css` 把动作区从「三等分」改成
      // 「按按钮数量均分」（门只有开/关两态，停止是可选）。
      rootElement.classList.toggle('is-door-opener', isDoorOpenerItem),
      (bladeHintElement.hidden = !isDreamCover),
      isDreamCover &&
        !viewModel.editing &&
        deviceState.available &&
        dreamStateLabel &&
        (statusElement.textContent = dreamStateLabel),
      !viewModel.editing &&
        deviceState.available &&
        presentation.state === 'open' &&
        railReportedPosition !== null &&
        railReportedPosition > 0 &&
        railReportedPosition < 100 &&
        (statusElement.textContent = isDreamCover ? '整体部分开启' : '部分开启'),
      isAirerItem &&
        !viewModel.editing &&
        deviceState.available &&
        (statusElement.textContent = presentation.opening
          ? '正在上升'
          : presentation.closing
            ? '正在下降'
            : presentation.position === 100
              ? '已收起'
              : presentation.position === 0
                ? '已放下'
                : presentation.moving
                  ? presentation.closing
                    ? '正在下降…'
                    : presentation.opening
                      ? '正在上升…'
                      : '等待停稳…'
                  : presentation.preview && presentation.targetPosition !== null
                    ? '正在前往 ' + Math.round(presentation.targetPosition) + '%'
                    : '已暂停'),
      // 0.7.9：晾衣架回报 unknown 时不能靠 position 猜状态，直接写「升降状态未知」。
      isAirerItem &&
        !viewModel.editing &&
        deviceState.available &&
        deviceState.state === 'unknown' &&
        (statusElement.textContent = '升降状态未知'),
      // 0.8.4：开窗器回报 unknown 时不猜开合，直接写「开窗状态未知」。
      isWindowOpenerItem &&
        !viewModel.editing &&
        deviceState.available &&
        (statusElement.textContent =
          deviceState.state === 'unknown' ? '开窗状态未知' : coverStateLabel(deviceState.state)),
      // 门面板：六条中间态（已发送 · 等待门磁回报 / 门已打开 · 开度未知 / 开门器不可用…）
      // 由纯函数给文案；这里只贴上去。优先级与「 · 开关不可用」后缀都在纯函数里定好。
      isDoorOpenerItem && !viewModel.editing && (statusElement.textContent = doorPanelTitle(doorPanelInput)),
      // 0.8.9：把「升降位置未知 / 指令受理状态」合成一处覆盖 —— 两条都是**覆盖普通状态**
      // 的高优先级文案，拆成两条 `&&` 链会把 render 的圈复杂度推过门禁阈值。
      !viewModel.editing &&
        deviceState.available &&
        !errorText &&
        (operationStatusLabel || '') !== '' &&
        (statusElement.textContent = operationStatusLabel),
      positionSliderElement.setAttribute(
        'aria-label',
        isAirerItem ? '目标升降位置' : isDreamCover ? '目标叶片角度' : '目标开合位置',
      ),
      (positionLegendElement.children[0].textContent = isAirerItem ? '最低' : isDreamCover ? '一侧闭合' : '关闭'),
      (positionLegendElement.children[1].textContent = isAirerItem ? '最高' : isDreamCover ? '反向闭合' : '打开')
    // 普通帘：开合位；梦幻帘滑杆是叶片角度，轨道开合另算
    // 设备不报位置时退回记忆值（cover-memory 客户端合进 deviceStates 的 coverMemory）：
    // 面板显示「上次 N%」，滑杆标 is-remembered（0.8.4 口径）。
    const rememberedPosition =
      draftPosition !== null
        ? null
        : deviceState.position !== null
          ? null
          : ((isDreamCover ? deviceState.tiltMemory?.position : deviceState.memory?.position) ?? null)
    const displayPosition = isDreamCover
      ? (draftPosition ?? resolveDreamBladePosition() ?? rememberedPosition)
      : (resolveTargetPosition() ?? rememberedPosition)
    const railPending =
      !!pendingIntent &&
      !pendingIntent.confirmed &&
      !pendingIntent.blade &&
      ['open_cover', 'close_cover', 'set_cover_position'].includes(pendingIntent.service)
    // 右上角图标只在「轨道真的在动」时播开合动画：调叶片（blade 意图 / 拖动叶片草稿）不算，
    // 也不会因为设备卡在 closing/opening 上就一直播（看门狗会把那一档降级，presentation.moving 随之归零）。
    const visualMoving = !!(presentation.moving || railPending)
    const visualRailPosition = isDreamCover
      ? railPending
        ? pendingIntent!.service === 'open_cover'
          ? 100
          : pendingIntent!.service === 'close_cover'
            ? 0
            : (pendingIntent!.target ?? presentation.position ?? 0)
        : (presentation.position ??
          (presentation.on || presentation.state === 'open' || presentation.state === 'opening' ? 100 : 0))
      : (displayPosition ??
        presentation.position ??
        (presentation.on || pendingIntent?.service === 'open_cover' ? 100 : 0))
    const visualTiltPosition = isDreamCover ? (displayPosition ?? deviceState.tiltPosition ?? 50) : null
    const visualOn = !!(
      deviceState.available &&
      (isDreamCover
        ? railPending
          ? pendingIntent!.service === 'open_cover' ||
            (pendingIntent!.service === 'set_cover_position' && (pendingIntent!.target ?? 0) > 0)
          : pendingIntent?.service === 'close_cover' && !pendingIntent.blade
            ? false
            : presentation.on ||
              presentation.state === 'open' ||
              presentation.state === 'opening' ||
              (presentation.position ?? 0) > 0
        : pendingIntent?.service === 'open_cover' ||
          (pendingIntent?.service === 'set_cover_position' && (pendingIntent.target ?? 0) > 0) ||
          (pendingIntent?.service === 'close_cover'
            ? false
            : presentation.on ||
              presentation.position > 0 ||
              presentation.state === 'open' ||
              presentation.state === 'opening' ||
              (visualRailPosition ?? 0) > 0))
    )
    // 0.8.9：指令受理状态已在链式赋值里用 `operationStatusLabel` 写过（见上）；
    // 这里不再重复计算 —— 保留注释说明为什么没有第二个入口。
    // 开窗器：舞台在载荷里带 `windowNotice`（关联窗扇缺失 / 行程不可知）；没有就整行收起。
    ;(windowNoticeElement.textContent = (viewModel.item?.windowOpener && viewModel.windowNotice) || ''),
      (windowNoticeElement.hidden = !windowNoticeElement.textContent),
      // 开门器与门磁两组读数都明确且矛盾时才提示（0.9.0）。
      (doorContactNoticeElement.textContent =
        (isDoorOpenerItem &&
          doorContactMismatchNotice(
            doorPanelInput.doorOpen,
            doorPanelInput.contactOpen ?? null,
            doorPanelInput.momentary && doorPanelInput.waitingForReset,
          )) ||
        ''),
      (doorContactNoticeElement.hidden = !doorContactNoticeElement.textContent),
      // 位置来自「记忆值」而不是设备回报时，滑杆标成 is-remembered（0.8.4），
      // 用户能一眼看出这是上次停的位置、不是实时读数。
      positionOutputElement.classList.toggle('is-remembered', rememberedPosition !== null),
      positionSliderElement.classList.toggle('is-remembered', rememberedPosition !== null),
      (positionOutputElement.textContent =
        rememberedPosition !== null
          ? '上次\n' + Math.round(rememberedPosition) + '%'
          : displayPosition === null
            ? '未知'
            : Math.round(displayPosition) + '%'),
      (positionOutputElement.title = isAirerItem
        ? '晾杆升降位置，100%为最高'
        : isWindowOpenerItem
          ? '开窗器控制'
          : draftPosition !== null
            ? isDreamCover
              ? '目标叶片角度预览'
              : '目标开合位置预览'
            : isDreamCover
              ? '叶片角度：50% 为 90°打开'
              : '整体开合位置'),
      positionOutputElement.setAttribute(
        'aria-label',
        isAirerItem ? '当前升降位置' : isDreamCover ? '当前叶片角度' : '当前开合位置',
      ),
      (positionSliderElement.disabled = !canAdjustSlider()),
      !viewModel.editing &&
        deviceState.available &&
        presentation.estimated &&
        !presentation.moving &&
        !(isDreamCover && dreamStateLabel) &&
        (statusElement.textContent = '在线'),
      isDreamCover &&
        !viewModel.editing &&
        deviceState.available &&
        !dreamStateLabel &&
        (!deviceState.overallFeedbackAvailable || presentation.awaitingArrival || presentation.estimated) &&
        !presentation.moving &&
        (statusElement.textContent = '在线'),
      (bladeHintElement.textContent = '叶片角度'),
      // 0.9.0 删掉了「关闭到位后可调节叶片」：叶片能不能调已经由按钮禁用态与
      // 状态行说明，再挂一句只在「已关闭且能调」时出现的 title 反而像提示缺失。
      // 只剩「设备不回报整体状态」这一种需要额外解释的情形。
      (positionSliderElement.title =
        isDreamCover && !viewModel.editing && deviceState.available && !deviceState.overallFeedbackAvailable
          ? '暂不可调节叶片'
          : '')
    for (const { button: actionButton, service: actionService, capability: capability } of actionButtons) {
      ;(actionButton.children[0].textContent =
        actionService === 'stop_cover'
          ? '暂停'
          : isAirerItem
            ? actionService === 'open_cover'
              ? '上升'
              : '下降'
            : isDreamCover
              ? actionService === 'open_cover'
                ? '开启'
                : '关闭'
              : actionService === 'open_cover'
                ? '打开'
                : '关闭'),
        (actionButton.title = isDreamCover
          ? '整体' + actionButton.children[0].textContent
          : actionButton.children[0].textContent),
        actionButton.setAttribute('aria-label', actionButton.title),
        (actionButton.disabled = !canControl() || !(deviceState as any)[capability])
      const isActiveAction = !!(pendingIntent && !pendingIntent.confirmed && pendingIntent.service === actionService)
      actionButton.setAttribute('aria-busy', String(isActiveAction)),
        actionButton.classList.toggle(
          'is-active',
          (actionService === 'open_cover' && presentation.opening) ||
            (actionService === 'close_cover' && presentation.closing),
        )
    }
    const pendingFeedback = airerPendingFeedbackMessage(),
      feedbackMessage = viewModel.error || errorText || pendingFeedback || ''
    ;(feedbackElement.textContent = feedbackMessage),
      (feedbackElement.hidden = !feedbackMessage),
      feedbackElement.classList.toggle('is-error', !!(viewModel.error || errorText)),
      rootElement.setAttribute(
        'aria-busy',
        String(!!(viewModel.presentation ? viewModel.presentation.preview : pendingIntent && !pendingIntent.confirmed)),
      ),
      syncSlider(),
      syncTiltSection()
    const lightExtra =
        viewModel.item?.extraControls?.find(
          (extraControl: any) =>
            extraControl?.domain === 'light' || String(extraControl?.entityId || '').startsWith('light.'),
        ) || null,
      lightStateEntry = lightExtra?.entityId
        ? viewModel.states?.[lightExtra.entityId] ||
          (viewModel.states instanceof Map ? viewModel.states.get(lightExtra.entityId) : null)
        : null,
      lightStateValue = String(lightStateEntry?.newState?.state ?? lightStateEntry?.state ?? '').toLowerCase()
    deviceVisual.sync({
      kind: isAirerItem ? 'airer' : 'cover',
      dream: isDreamCover,
      on: visualOn,
      available: !!deviceState.available,
      disabled: !canControl(),
      interactive: canControl(),
      label: titleElement.textContent || (isAirerItem ? '晾衣架' : '窗帘'),
      position: visualRailPosition,
      tiltPosition: visualTiltPosition,
      moving: visualMoving,
      coverDirection: viewModel.item?.coverDirection || viewModel.item?.direction || 'split',
      lightOn: lightStateValue === 'on',
    })
  }
  function update(nextViewModel: CoverPanelViewModel = {}) {
    if (isDisposed) return
    const nextEntityId = nextViewModel.item?.entityId || ''
    ;(nextEntityId !== deviceState.entityId || nextViewModel.item?.id !== viewModel.item?.id) &&
      (isDragging && onPreview(viewModel.item?.entityId, null, viewModel.item),
      instanceId++,
      (isRailUnconfirmed = false),
      clearPendingIntent(),
      (draftPosition = null),
      (draftTiltPosition = null),
      (isDragging = false),
      (errorText = ''),
      (stateRevision = 0),
      (stateSignature = ''))
    const previousState = deviceState
    ;(viewModel = nextViewModel),
      (extrasPanelElement.hidden = !nextViewModel.item?.airer || !nextViewModel.item?.extraControls?.length),
      purifierExtrasController.update({
        item: {
          ...nextViewModel.item,
          extraControls: nextViewModel.item?.airer ? nextViewModel.item.extraControls : [],
        },
        states: nextViewModel.states || {},
        editing: nextViewModel.editing,
        numberFormats: nextViewModel.numberFormats || {},
      }),
      (deviceState =
        nextViewModel.state?.entityId === nextEntityId && typeof nextViewModel.state?.positionKnown == 'boolean'
          ? nextViewModel.state
          : coverState(nextEntityId, nextViewModel.state, nextViewModel.item)),
      nextViewModel.item?.airer && (deviceState = airerState(deviceState, nextViewModel.item)),
      (errorText === AIRER_NO_FEEDBACK_MESSAGE || errorText === RANGE_NO_FEEDBACK_MESSAGE) &&
        deviceState.available &&
        (deviceState.moving || deviceState.position !== previousState.position) &&
        (errorText = ''),
      deviceState.overallFeedbackAvailable &&
        (deviceState.position !== previousState.position || deviceState.state !== previousState.state) &&
        (isRailUnconfirmed = false),
      !canAdjustSlider() &&
        isDragging &&
        ((draftPosition = null), (isDragging = false), onPreview(nextEntityId, null, viewModel.item))
    const nextSignature = JSON.stringify([
      deviceState.state,
      deviceState.position,
      deviceState.raw.updatedAt ?? deviceState.raw.last_updated,
      deviceState.raw.lastChanged ?? deviceState.raw.last_changed,
    ])
    if (
      (stateSignature !== nextSignature && ((stateSignature = nextSignature), stateRevision++),
      canControl() || ((draftPosition = null), (isDragging = false), clearPendingIntent()),
      !viewModel.presentation && pendingIntent && stateRevision > pendingIntent.revision)
    ) {
      const reachedTarget =
          pendingIntent.target !== null &&
          deviceState.position !== null &&
          Math.abs(deviceState.position - pendingIntent.target) <= 0.5,
        stoppedConfirmed = pendingIntent.service === 'stop_cover' && !deviceState.moving,
        openedConfirmed =
          pendingIntent.service === 'open_cover' &&
          deviceState.position === null &&
          deviceState.state === 'open' &&
          pendingIntent.initialState !== 'open',
        settledAfterMove = pendingIntent.confirmed && pendingIntent.wasMoving && !deviceState.moving
      if (reachedTarget || stoppedConfirmed || openedConfirmed || settledAfterMove) clearPendingIntent()
      else {
        if (pendingIntent.target !== null) {
          const expectedDirection =
              pendingIntent.initialPosition === null
                ? pendingIntent.service === 'open_cover'
                  ? 1
                  : pendingIntent.service === 'close_cover'
                    ? -1
                    : 0
                : Math.sign(pendingIntent.target - pendingIntent.initialPosition),
            movedAlongDirection =
              expectedDirection !== 0 &&
              deviceState.position !== null &&
              pendingIntent.initialPosition !== null &&
              (deviceState.position - pendingIntent.initialPosition) * expectedDirection > 0.5,
            stateFlippedInDirection =
              deviceState.state !== pendingIntent.initialState &&
              ((expectedDirection > 0 && deviceState.opening) || (expectedDirection < 0 && deviceState.closing))
          ;(movedAlongDirection || stateFlippedInDirection) &&
            ((pendingIntent.confirmed = true),
            intentTimeoutId !== null && clearTimeout(intentTimeoutId),
            (intentTimeoutId = null)),
            pendingIntent.confirmed && deviceState.moving && (pendingIntent.wasMoving = true)
        }
      }
    }
    isDragging || (draftPosition = null), render()
  }
  function dispose() {
    isDisposed ||
      ((isDisposed = true),
      isDragging && onPreview(viewModel.item?.entityId, null, viewModel.item),
      instanceId++,
      clearPendingIntent(),
      releaseFeedback(),
      ownFeedbackSlot?.dispose?.(),
      purifierExtrasController.dispose(),
      deviceVisual.dispose(),
      replaceChildren(rootElement))
  }
  return (
    render(),
    {
      root: rootElement,
      update: update,
      dispose: dispose,
      deactivate() {
        ;(draftTiltPosition = null), tiltTicketCounter++, isDragging ? cancelPreview() : syncTiltSection()
      },
    }
  )
}

/** HA 窗帘能力位。 */
const COVER_FEATURE_OPEN = 1,
  COVER_FEATURE_CLOSE = 2,
  COVER_FEATURE_SET_POSITION = 4,
  COVER_FEATURE_STOP = 8,
  COVER_FEATURE_SET_TILT_POSITION = 128,
  /** 240 = 16+32+64+128：HA 里全部 tilt（开合角度）相关能力位的并集。 */
  COVER_TILT_FEATURE_MASK = 240
/**
 * 取窗帘能力位；设备**从不**上报 `supported_features` 时，按它已经报出来的状态推断。
 */
function coverFeaturesOrInferred(attributes: any) {
  const reportedFeatures = haNumber(attributes?.supported_features)
  if (reportedFeatures !== null)
    return Number.isSafeInteger(reportedFeatures) && reportedFeatures >= 0 ? reportedFeatures : 0
  let inferredFeatures = COVER_FEATURE_OPEN | COVER_FEATURE_CLOSE | COVER_FEATURE_STOP
  if (haNumber(attributes?.current_position) !== null) inferredFeatures |= COVER_FEATURE_SET_POSITION
  if (haNumber(attributes?.current_tilt_position) !== null) inferredFeatures |= COVER_FEATURE_SET_TILT_POSITION
  return inferredFeatures
}
/** 是否有叶片反馈证据：上报了 current_tilt_position，或置起了任意一个 tilt 能力位。 */
function coverReportsTilt(attributes: any, features: number) {
  return haNumber(attributes?.current_tilt_position) !== null || !!(features & COVER_TILT_FEATURE_MASK)
}
const stateLabelByState = {
  open: '已打开',
  closed: '已关闭',
  opening: '正在打开',
  closing: '正在关闭',
}
export function coverStateLabel(stateKey: any, options: { airer?: boolean } = {}) {
  if (options.airer) {
    // 晾衣架的 HA 坐标系：100 = 升到最高（收起），0 = 落到最低（放下）。
    const airerLabelByState = {
      open: '已收起',
      closed: '已放下',
      opening: '正在上升',
      closing: '正在下降',
    }
    return Object.hasOwn(airerLabelByState, stateKey)
      ? (airerLabelByState as any)[stateKey]
      : Object.hasOwn(stateLabelByState, stateKey)
        ? (stateLabelByState as any)[stateKey]
        : '设备不可用'
  }
  return Object.hasOwn(stateLabelByState, stateKey) ? (stateLabelByState as any)[stateKey] : '设备不可用'
}
/** 晾衣架状态：positionReversed + liftReversed 交换 opening/capabilities。 */
export function airerState(coverStatus: any, binding: any = {}) {
  const direction = normalizeAirerDirection(binding)
  const source = coverStatus?.airerAdapted
    ? {
        position: coverStatus.devicePosition,
        opening: coverStatus.deviceOpening,
        closing: coverStatus.deviceClosing,
        openSupported: coverStatus.deviceOpenSupported,
        closeSupported: coverStatus.deviceCloseSupported,
        memory: coverStatus.deviceMemory,
      }
    : coverStatus
  const visualPosition = airerVisualPosition(source.position, binding)
  const opening = direction.liftReversed ? source.closing : source.opening
  const closing = direction.liftReversed ? source.opening : source.closing
  return {
    ...coverStatus,
    airerAdapted: true,
    devicePosition: source.position,
    deviceOpening: source.opening,
    deviceClosing: source.closing,
    deviceOpenSupported: source.openSupported,
    deviceCloseSupported: source.closeSupported,
    deviceMemory: source.memory,
    // 记忆位置也要按晾衣架的方向换算，否则「上次停在 80」会在反向配置的晾衣架上反着走。
    memory: source.memory
      ? {
          ...source.memory,
          position: airerVisualPosition(source.memory.position, binding),
          target: airerVisualPosition(source.memory.target, binding),
        }
      : null,
    position: visualPosition,
    visualPosition,
    opening,
    closing,
    moving: !!(opening || closing),
    openSupported: direction.liftReversed ? source.closeSupported : source.openSupported,
    closeSupported: direction.liftReversed ? source.openSupported : source.closeSupported,
  }
}
export function coverIconIsOn(component: any, coverFeedback: any) {
  if (!coverFeedback?.available) return false
  const isAirer = !!(component?.airer || component?.coverKind === 'airer')
  // 晾衣架 unknown 时图标不亮
  if (isAirer && coverFeedback.state === 'unknown') return false
  const adapted = isAirer ? airerState(coverFeedback, component) : coverFeedback
  // 设备没报位置时退回「记忆位置」：刚打开页面、HA 还没回 current_position 的那几秒，
  // 图标不能因为「位置未知」就直接熄灭。
  const knownPosition = adapted.position ?? adapted.rememberedPosition ?? adapted.memory?.position ?? null
  const isCoverOn = isAirer
    ? adapted.closing || (knownPosition !== null && knownPosition !== undefined ? knownPosition < 100 : false)
    : coverFeedback.on
  return !!(component?.iconStateReversed === true ? !isCoverOn : isCoverOn)
}
/**
 * 从后端下发的最新一帧 `coverMemory` 里取「最近一次可信位置」。
 *
 * 后端 `cover_memory.py` 会在设备不报位置时替我们估算（行程时间 + 下发目标），
 * 前端只负责按时间采样：`memory` 是快照，`estimates` 是仍在推进的补间。
 *
 * 采样规则（与 0.8.4 一致）：
 * - 有 `estimates[key]` 且比快照更新 → 用估算值；
 * - 梦幻帘只认与它当前反馈形态匹配的那一类（`nativeTilt`）；
 * - 普通帘若 `closedAt` 比快照新，视为已合拢在 0；
 * - 时间戳/位置越界一律当脏数据丢弃（不猜）。
 *
 * @param key         采样通道：`rail` / `dream` / `tilt` / `legacy-tilt` / `airer:*`
 * @param reportedPos 设备已上报的位置；非 null 时不需要记忆值
 */
function coverMemorySample(
  deviceState: any,
  binding: any,
  key: string,
  reportedPos: number | null,
  { now: nowMs = Date.now() } = {},
) {
  if (reportedPos !== null) return null
  const memory = deviceState.coverMemory
  if (!memory || typeof memory != 'object') return null
  const isAirer = !!(binding.airer || binding.coverKind === 'airer'),
    isDream = binding.coverKind === 'dream',
    sampleKey =
      key === 'tilt'
        ? 'tilt'
        : key === 'legacy-tilt'
          ? 'legacy-tilt'
          : isAirer
            ? 'airer:' + +(binding.positionReversed === true) + ':' + +(binding.liftReversed === true)
            : key === 'dream'
              ? 'dream'
              : 'rail'
  let sample = key === 'dream' ? null : memory[key === 'tilt' ? 'tilt' : 'position']
  // 梦幻帘的「整体位置」与「叶片角度」是两套机构：反馈形态和记忆形态对不上就不用。
  if (
    isDream &&
    sample &&
    ((key === 'rail' && sample.nativeTilt !== true) || (key === 'legacy-tilt' && sample.nativeTilt === true))
  )
    sample = null
  // 普通帘：后端记录了「已合拢」的时刻且比快照新，直接按 0 处理（合拢是确定的终态）。
  if (!isDream && key === 'rail' && Number.isFinite(memory.closedAt) && (!sample || memory.closedAt > sample.at))
    sample = { position: 0, at: memory.closedAt }
  const estimate = memory.estimates?.[sampleKey],
    latest = estimate && (!sample || estimate.at >= sample.at) ? estimate : sample
  if (
    !latest ||
    typeof latest.position != 'number' ||
    !Number.isFinite(latest.position) ||
    latest.position < 0 ||
    latest.position > 100 ||
    !Number.isFinite(latest.at) ||
    // 允许 5s 的时钟偏差；更超前的记忆一定是脏数据。
    latest.at > nowMs + 5000 ||
    latest.at < 0
  )
    return null
  const updatedAt = Date.parse(deviceState.updatedAt || deviceState.last_updated || '')
  if (
    !isDream &&
    key === 'rail' &&
    deviceState.state === 'closed' &&
    (!Number.isFinite(updatedAt) || updatedAt >= latest.at)
  )
    return null
  const target =
      typeof latest.target == 'number' && Number.isFinite(latest.target) && latest.target >= 0 && latest.target <= 100
        ? latest.target
        : null,
    durationMs =
      Number.isFinite(latest.duration) && latest.duration >= 0 && latest.duration <= 600000 ? latest.duration : 0,
    delayMs = Number.isFinite(latest.delay) && latest.delay >= 0 && latest.delay <= 2400 ? latest.delay : 0,
    elapsedMs = Math.max(0, nowMs - latest.at),
    movedElapsedMs = Math.max(0, elapsedMs - delayMs),
    progress = durationMs > 0 ? Math.min(1, movedElapsedMs / durationMs) : 1
  return {
    position: target === null ? latest.position : latest.position + (target - latest.position) * progress,
    target: target,
    sampledAt: nowMs,
    // 剩余行程 / 剩余延迟：给渲染层决定「还要不要继续补间」。
    duration: Math.max(0, durationMs - movedElapsedMs),
    delay: Math.max(0, delayMs - elapsedMs),
    at: latest.at,
    key: JSON.stringify([sampleKey, latest.at, latest.position, target, durationMs, delayMs]),
  }
}

export function coverState(
  entityId: any,
  stateChange: any,
  options: {
    coverKind?: string
    /** 开窗器：支持行程估算，且不支持 tilt。 */
    windowOpener?: boolean
    /** 估算行程秒数（默认 20s）。 */
    travelSeconds?: number
    /** 关掉行程估算（如实回放设备上报值）。 */
    estimateMotion?: boolean
  } = {},
) {
  const rawState = stateChange?.newState || stateChange || {},
    stateAttributes = attributesOf(rawState),
    normalizedState = String(rawState.state || '')
      .trim()
      .toLowerCase(),
    currentPosition = haNumber(stateAttributes.current_position),
    currentTiltPosition = haNumber(stateAttributes.current_tilt_position),
    isDreamCover = options.coverKind === 'dream',
    supportedFeatures = coverFeaturesOrInferred(stateAttributes),
    hasTiltFeedback = coverReportsTilt(stateAttributes, supportedFeatures),
    // 设备自报的「已完全合拢」布尔位（HA 语义：current_position === 0 时为 true）。
    reportedClosed = stateAttributes.is_closed === true,
    // 实测（乐屋/dream 帘 + 小米网关一路，supported_features=15，无 tilt 能力位）两端终态的实体属性：
    //   全关：state="closed"  is_closed=true   current_position=0
    //   全开：state="open"    is_closed=false  current_position=100
    //   （另有 device_class="curtain"、friendly_name、supported_features=15，与开合无关）
    // 注意 is_closed 只有 true / false 两个取值，没有 "open" 这种文案：开=is_closed:false，
    // 所以「全开」只能由 state="open" 表态，「全关」则 state="closed" 与 is_closed=true 都算。
    // is_closed=true 与 state="opening" 同时出现属于自相矛盾，以「正在开启」为准。
    settledClosedByDevice = normalizedState !== 'opening' && (normalizedState === 'closed' || reportedClosed),
    settledOpenByDevice = normalizedState === 'open',
    // 瞬态（opening / closing）先原样采信：实体确实在走行程时必须如实显示「整体正在开启 / 整体正在关闭」，
    // 右上角图标也据此播开合动画，不能一律吞成「在线」。
    // 但这台电机既会在真正运行时连续上报瞬态（实测约 2–4s 一次），也会把瞬态压在 closing/opening 上
    // 数十分钟不回收（实测一次卡了 37 分钟），单看某一帧快照无法区分。区分靠时间：交给反馈层看门狗
    // （cover-feedback.ts 的 stalled）——位置长时间零推进且没有在途动画时，把这一轮瞬态降级为 unknown，
    // 卡片回落「在线」，图标停动画。
    isTransientState = normalizedState === 'opening' || normalizedState === 'closing',
    // 梦幻帘由「整体轨道 + 叶片」两套机构组成，整体反馈往往不可信：拿到独立叶片反馈
    // （current_tilt_position 或 tilt 能力位）才敢相信；拿不到时至少要有终态证据或瞬态证据。
    hasOverallFeedback =
      !isDreamCover || hasTiltFeedback || settledClosedByDevice || settledOpenByDevice || isTransientState,
    normalizedRailState = settledClosedByDevice ? 'closed' : settledOpenByDevice ? 'open' : normalizedState,
    effectiveState = hasOverallFeedback ? normalizedRailState : 'unknown',
    // 可信时位置取设备上报值；全关位缺位置时按 0 兜底（statePositionHint 同口径）。
    // 瞬态缺位置不猜端点：电机没报行程就别摆位，交给乐观预览。
    effectivePosition = hasOverallFeedback
      ? settledClosedByDevice
        ? 0
        : currentPosition === null
          ? normalizedState === 'closed'
            ? 0
            : null
          : Math.max(0, Math.min(100, currentPosition))
      : null,
    computedTiltPosition = hasTiltFeedback ? currentTiltPosition : currentPosition,
    isKnownRailState = Object.hasOwn(stateLabelByState, normalizedState),
    isBoundCover = /^cover\.[a-z0-9_]+$/.test(entityId) && rawState.available !== false,
    // 晾衣架需具备 open/close/stop（features & 0xb），且
    // available!==false 或 availabilityReason==='unknown'（状态 unknown 亦可交互）
    isAirerDevice = !!(options as any).airer || options.coverKind === 'airer',
    // 开窗器（0.8.4）：HA 里同样是 cover 域，但只有「开 / 关 / 停 + 目标位置」四件套，
    // 且状态常常停在 unknown —— 放行条件比窗帘宽一档（能力位用 0xf 而不是 0xb）。
    isWindowOpener = options.windowOpener === true || options.coverKind === 'window',
    isAvailable = isAirerDevice
      ? /^cover\.[a-z0-9_]+$/.test(entityId) &&
        normalizedState !== 'unavailable' &&
        !!(supportedFeatures! & 0xb) &&
        (rawState.available !== false ||
          rawState.availabilityReason === 'unknown' ||
          (rawState as any).availability_reason === 'unknown')
      : isWindowOpener
        ? /^cover\.[a-z0-9_]+$/.test(entityId) &&
          normalizedState !== 'unavailable' &&
          !!(supportedFeatures! & 0xf) &&
          (rawState.available !== false ||
            rawState.availabilityReason === 'unknown' ||
            (rawState as any).availability_reason === 'unknown')
        : isBoundCover && isKnownRailState
  const coverStatus = {
    entityId: entityId,
    raw: rawState,
    available: isAvailable,
    dream: isDreamCover,
    overallFeedbackAvailable: hasOverallFeedback,
    // 开窗器附带行程参数，渲染层据此做「开门 20s」那类补间。
    ...(isWindowOpener
      ? {
          windowOpener: true,
          travelTime: ((options.travelSeconds || 20) as number) * 1000,
          estimateMotion: options.estimateMotion !== false,
        }
      : {}),
    name: String(stateAttributes.friendly_name || entityId || '窗帘'),
    state: effectiveState,
    position: effectivePosition,
    positionKnown: effectivePosition !== null,
    positionReported: hasOverallFeedback && currentPosition !== null,
    // 位置缺失时的兜底姿态（0 / 100 / null）：设备只报 opened / closed 而没报 current_position 时，
    // 仍能让 3D 窗帘动画摆到对应那一端，而不是一律当作全关。
    // 同样只认「可信的整体反馈」：梦幻帘拿不到叶片反馈时整体状态整个不可信，连摆位也不猜，
    // 轨道只跟随用户的乐观预览，避免把已关闭的帘摆成开启。
    statePositionHint:
      isAvailable && hasOverallFeedback
        ? normalizedRailState === 'open'
          ? 100
          : normalizedRailState === 'closed'
            ? 0
            : null
        : null,
    features: supportedFeatures,
    closedConfirmed: isAvailable && effectiveState === 'closed' && effectivePosition === 0,
    tiltPosition: computedTiltPosition === null ? null : Math.max(0, Math.min(100, computedTiltPosition)),
    tiltPositionKnown: computedTiltPosition !== null,
    opening: isAvailable && effectiveState === 'opening',
    closing: isAvailable && effectiveState === 'closing',
    moving: isAvailable && ['opening', 'closing'].includes(effectiveState),
    on:
      isAvailable &&
      (effectiveState === 'opening' ||
        (effectivePosition !== null ? effectivePosition > 0 : effectiveState === 'open')),
    openSupported: !!(supportedFeatures! & COVER_FEATURE_OPEN) || (isAirerDevice && !isKnownRailState && isAvailable),
    closeSupported: !!(supportedFeatures! & COVER_FEATURE_CLOSE) || (isAirerDevice && !isKnownRailState && isAvailable),
    positionSupported:
      !!(supportedFeatures! & COVER_FEATURE_SET_POSITION) || (isAirerDevice && !isKnownRailState && isAvailable),
    stopSupported: !!(supportedFeatures! & COVER_FEATURE_STOP) || (isAirerDevice && !isKnownRailState && isAvailable),
    tiltSupported: !!(supportedFeatures! & COVER_FEATURE_SET_TILT_POSITION),
    tiltOpenSupported: !!(supportedFeatures! & 16),
    tiltCloseSupported: !!(supportedFeatures! & 32),
    tiltStopSupported: !!(supportedFeatures! & 64),
    // 叶片可调能力：声明了 set_tilt_position 位即可 —— 设备不报能力位时，该位由
    // coverFeaturesOrInferred 从 current_tilt_position 推断出来。
    bladeSupported:
      !!(supportedFeatures! & COVER_FEATURE_SET_TILT_POSITION) ||
      (!hasTiltFeedback && !!(supportedFeatures! & COVER_FEATURE_SET_POSITION)),
  }
  // 设备没报位置时才需要记忆值；估算被关掉的开窗器连 estimates 都不认。
  const memorySource =
    isWindowOpener && options.estimateMotion === false
      ? { ...rawState, coverMemory: { ...(rawState as any).coverMemory, estimates: {} } }
      : rawState
  ;((coverStatus as any).memory = coverMemorySample(
    memorySource,
    options,
    isDreamCover && !hasTiltFeedback ? 'dream' : 'rail',
    hasOverallFeedback ? effectivePosition : null,
  )),
    ((coverStatus as any).tiltMemory = coverMemorySample(
      rawState,
      options,
      hasTiltFeedback ? 'tilt' : 'legacy-tilt',
      computedTiltPosition,
    ))
  return isAirerDevice ? airerState(coverStatus as any, options) : coverStatus
}
export function coverCanAdjustBlades(coverStatus: any, estimatedStatus = coverStatus) {
  if (
    !coverStatus.available ||
    !(coverStatus.bladeSupported || coverStatus.tiltOpenSupported || coverStatus.tiltCloseSupported)
  )
    return false
  // 普通窗帘的滑杆就是整体开合位置，有位置能力即可调。
  if (!coverStatus.dream) return true
  // 拿不到独立叶片反馈的梦幻帘：整体位置就是唯一可调轴（它同时承担叶片角度），
  // 不做「必须停在两端」的门禁 —— 否则中间位置会把滑杆整根禁掉，用户无路可走。
  if (!coverStatus.overallFeedbackAvailable) return true
  // 有独立叶片反馈时：运动过程中（含轨道在途 / 乐观预览）一律不许调叶片，否则界面会先
  // 「到位」放行滑杆，而后端此刻仍认为轨道在运行，下发就被拒。必须等 HA 真的报停稳。
  if (estimatedStatus?.moving || estimatedStatus?.opening || estimatedStatus?.closing) return false
  // 停稳后，轨道还得停在「全开」或「全关」两端；停在中间位置时滑杆禁用（置灰）。
  // 位置优先取设备自报值：presentation 里的位置可能还在做收尾平滑动画
  // （设备已经报了 60，动画还停在 100），拿动画值判断会把「半开」误判成「全开」而错误放行。
  const settledPosition =
    (coverStatus.positionKnown ? coverStatus.position : null) ??
    estimatedStatus?.position ??
    (estimatedStatus?.state === 'open' ? 100 : estimatedStatus?.state === 'closed' ? 0 : null)
  return settledPosition === 0 || settledPosition === 100
}
export function coverControl(coverDevice: any, serviceName: any, targetPosition: any) {
  const deviceLabel = coverDevice.windowOpener ? '开窗器' : '窗帘'
  if (!coverDevice.available) throw new Error(deviceLabel + '当前不可用。')
  // 开窗器没有叶片机构：任何 tilt 类指令一律拒绝（否则 HA 会回 400，用户只看到一句看不懂的报错）。
  if (coverDevice.windowOpener && String(serviceName).includes('_tilt')) throw new Error('开窗器不支持此操作。')
  const capabilityKey = (
    {
      open_cover: 'openSupported',
      close_cover: 'closeSupported',
      stop_cover: 'stopSupported',
      set_cover_position: 'positionSupported',
      set_cover_tilt_position: 'tiltSupported',
      open_cover_tilt: 'tiltOpenSupported',
      close_cover_tilt: 'tiltCloseSupported',
      stop_cover_tilt: 'tiltStopSupported',
    } as any
  )[serviceName]
  // 晾衣架状态未知时 supported_features 可能尚未回报：仍允许 open/close/stop
  const allowAirerUnknown =
    coverDevice.state === 'unknown' &&
    ['open_cover', 'close_cover', 'stop_cover', 'set_cover_position'].includes(serviceName)
  if (!capabilityKey || (!coverDevice[capabilityKey] && !allowAirerUnknown))
    throw new Error('设备不支持此' + deviceLabel + '操作。')
  if (
    coverDevice.dream &&
    ['set_cover_position', 'set_cover_tilt_position', 'open_cover_tilt', 'close_cover_tilt'].includes(serviceName) &&
    !coverCanAdjustBlades(coverDevice)
  )
    throw new Error('只有确认整体完全关闭且停止后，才能调整叶片。')
  let serviceData: Record<string, any> = {}
  if (serviceName === 'set_cover_position' || serviceName === 'set_cover_tilt_position') {
    const parsedPosition = haNumber(targetPosition)
    if (!Number.isInteger(parsedPosition) || parsedPosition! < 0 || parsedPosition! > 100)
      throw new Error('目标位置必须是 0–100 之间的整数。')
    serviceData =
      serviceName === 'set_cover_tilt_position'
        ? {
            tilt_position: parsedPosition,
          }
        : {
            position: parsedPosition,
          }
  }
  return {
    entityId: coverDevice.entityId,
    domain: 'cover',
    service: serviceName,
    data: serviceData,
  }
}

/* ------------------------------------------------------------------------- *
 * 开门器（0.9.0 `cover-state.js` 的 `doorOpener` 分支）
 *
 * 门机和窗帘共用一套「开/关/停」心智，但有两个硬差异：
 *
 * 1. **点动型（momentary）**：发一次脉冲，开关随即自动复位。因此只能开门，
 *    且在「等待复位」期间禁止再发（否则会在门还动着时反向触发）。
 * 2. **开关极性**：`switchOpenState` 决定「开」对应 `turn_on` 还是 `turn_off`，
 *    因为有些门机接线是低电平有效。
 *
 * 门磁（contact）与开门器是**两套来源**：开门器负责控制，门磁负责确认。
 * 所以 `doorSwitchState` 的 `contactOpen` 只做展示，不参与「能不能发指令」。
 * ------------------------------------------------------------------------- */

/** 开门器的两种实体形态。

- `switch`：门机只提供「开关」两态（多数车库门 / 卷帘门厂家的做法），多一个
  `switchMode`（保持型 / 点动型）与 `switchOpenState` 极性；
- `cover`：门机本身就是 `cover.*`（能报位置/行程），此时不需要开关方式，
  直接按 `open_cover` / `close_cover` / `set_cover_position` 控制。

上游文案是「选择可动门模型，再绑定 cover 或 switch 实体」—— 两种都要认。
 */
export type DoorOpenerDomain = 'switch' | 'cover'

/** 该绑定是哪种实体形态；返回 `null` 表示既不是 switch 也不是 cover。 */
export function doorOpenerDomain(binding: any): DoorOpenerDomain | null {
  const entityId = typeof binding?.entityId === 'string' ? binding.entityId : ''
  return entityId.startsWith('switch.') ? 'switch' : entityId.startsWith('cover.') ? 'cover' : null
}

/** 开门器可用：`switch` 或 `cover` 域，且不属于其它控件。 */
export function isDoorSwitch(binding: any): boolean {
  return doorOpenerDomain(binding) !== null
}

export type DoorSwitchState = {
  /** 实体在线且状态可用。 */
  available: boolean
  /** 实体形态：`switch`（两态 + 开关方式）或 `cover`（有位置/行程）。 */
  domain: DoorOpenerDomain
  /** 点动型：脉冲触发、开关自动复位。`cover` 恒为 `false`。 */
  momentary: boolean
  /** 后端下发的脉冲状态（`momentarySwitch`），仅点动型存在。 */
  pulse: any
  /** 可以发指令：在线，且点动型不在「等待复位」。 */
  ready: boolean
  /** 门磁确认的「已打开」。 */
  on: boolean
  /** 门磁原始态；`null` 表示没有门磁或未匹配。 */
  contactOpen: boolean | null
  name: string
}

/**
 * 开门器 + 门磁的合并读数。
 *
 * `switch` 与 `cover` 的可用判定不同：
 * - `switch`：状态必须是 `on` / `off`；
 * - `cover`：`open` / `closed` / `opening` / `closing` / `stopped` 都算可用
 *   （门机正在动时也要能停下）。
 *
 * @param contactOpen 门磁读数（三态），没有门磁时传 `null`
 */
export function doorSwitchState(binding: any, stateChange: any, contactOpen: boolean | null = null): DoorSwitchState {
  const domain = doorOpenerDomain(binding) ?? 'switch',
    entityState = stateChange?.newState || stateChange || {},
    normalizedState = String(entityState.state ?? '')
      .trim()
      .toLowerCase(),
    // cover 域的合法状态比 switch 宽一档：正在开合时也要允许「停止」。
    available =
      doorOpenerDomain(binding) !== null &&
      entityState.available !== false &&
      (domain === 'cover'
        ? ['open', 'closed', 'opening', 'closing', 'stopped'].includes(normalizedState)
        : ['on', 'off'].includes(normalizedState)),
    momentary = domain === 'switch' && binding?.switchMode === 'momentary',
    pulse = momentary ? entityState.momentarySwitch : null
  return {
    available,
    domain,
    momentary,
    pulse,
    // 点动型在等待复位期间必须禁用：门还在动，再发一次会反向。
    ready: available && (!momentary || !pulse?.waitingForReset),
    on: contactOpen === true,
    contactOpen: contactOpen ?? null,
    name: String(entityState.attributes?.friendly_name || binding?.entityId || '开门器'),
  }
}

/** 开门器「开 / 关」的服务调用。 */
export function doorSwitchControl(
  binding: any,
  switchStatus: Pick<DoorSwitchState, 'ready' | 'momentary' | 'domain'>,
  serviceName: string,
): { entityId: any; domain: DoorOpenerDomain; service: string; data: Record<string, unknown> } {
  if (!switchStatus?.ready) throw new Error('开门器开关暂不可用。')
  // cover 域直接复用窗帘那套服务名：open/close 的语义是固定的，不做极性换算。
  if (switchStatus.domain === 'cover') {
    if (!['open_cover', 'close_cover', 'stop_cover', 'set_cover_position'].includes(serviceName))
      throw new Error('开门器不支持此操作。')
    return { entityId: binding?.entityId, domain: 'cover', service: serviceName, data: {} }
  }
  // 点动型只能开门：关门需要「再脉冲一次」的语义，而点动开关复位前的第二次触发会被后端拒绝。
  if (serviceName !== 'open_cover' && (switchStatus.momentary || serviceName !== 'close_cover'))
    throw new Error('开门器不支持此操作。')
  const isOpenCommand = serviceName === 'open_cover',
    // `switchOpenState === 'off'` 表示低电平有效：开门对应 turn_off，关门对应 turn_on。
    service = switchStatus.momentary || isOpenCommand === (binding?.switchOpenState !== 'off') ? 'turn_on' : 'turn_off'
  return { entityId: binding?.entityId, domain: 'switch', service, data: {} }
}

const {
    normalizeCurtainTrack: normalizeTrack,
    createCurtainTrack: createTrack,
    createTrackClothGeometry: buildTrackClothGeometry,
    poseTrackCloth: poseClothGeometry,
    curtainPanelRanges: samplePanelRanges,
    createDreamBladeGeometry: createBladeGeometry,
    poseDreamBlades: poseBladeGeometry,
    createRollerCurtain: createRollerCurtain,
  } = await import('@app/shared/scene/studio-curtain-track'),
  coverDirectionSet = new Set(['left', 'right', 'split']),
  clothPartSet = new Set(['cloth', 'band']),
  trackPartSet = new Set(['rod', 'cap', ...clothPartSet]),
  MOTION_DURATION_MS = 420,
  MIN_PANEL_SCALE = 0.12,
  CLOTH_FOLD_SPACING_METERS = 0.15,
  resolveCurtainFabric = (fabricBinding: any) => (fabricBinding.curtainFabric === 'sheer' ? 'sheer' : 'cloth'),
  resolveUnboundPosition = (unboundBinding: any) =>
    !unboundBinding.entityId && Number.isFinite(unboundBinding.unboundPosition)
      ? Math.max(0, Math.min(100, unboundBinding.unboundPosition))
      : 0,
  resolveFoldCount = (widthBinding: any) =>
    Math.max(
      4,
      Math.min(
        96,
        Math.round(
          (Number(widthBinding.curtainWidth) || 1.8) /
            (resolveCoverDirection(widthBinding) === 'split' ? 2 : 1) /
            (resolveCurtainFabric(widthBinding) === 'sheer' ? 0.1 : CLOTH_FOLD_SPACING_METERS),
        ),
      ),
    ),
  sceneModelKey = (floorId: any, modelId: any) => JSON.stringify([String(floorId ?? ''), String(modelId ?? '')]),
  resolveCoverDirection = (directionBinding: any) =>
    coverDirectionSet.has(directionBinding.coverDirection)
      ? directionBinding.coverDirection
      : coverDirectionSet.has(directionBinding.curtainPosition)
        ? directionBinding.curtainPosition
        : 'split',
  resolveStatePosition = (receivedState: any) =>
    typeof receivedState?.position == 'number' && Number.isFinite(receivedState.position)
      ? Math.max(0, Math.min(100, receivedState.position))
      : null,
  // 取归一化状态里的「状态推断位置」：设备只报 opened / closed 而没报 current_position 时，
  // 仍能让 3D 窗帘摆到对应的那一端，而不是一律当作全关。
  resolveStatePositionHint = (receivedState: any) =>
    typeof receivedState?.statePositionHint == 'number' && Number.isFinite(receivedState.statePositionHint)
      ? Math.max(0, Math.min(100, receivedState.statePositionHint))
      : null,
  // 位置未知时骨架该摆在哪儿（0–100），三层优先级：状态推断值 → 已绑定全关 → 未绑定配置值。
  resolvePoseFallback = (posedRig: any) =>
    posedRig.statePositionHint ?? (posedRig.binding.entityId ? 0 : resolveUnboundPosition(posedRig.binding)),
  resolveRigBasis = (rigAnchor: any) =>
    Array.isArray(rigAnchor.userData?.curtainRigBasis) &&
    rigAnchor.userData.curtainRigBasis.length === 3 &&
    rigAnchor.userData.curtainRigBasis.every(
      (basisComponent: any) =>
        typeof basisComponent == 'number' && Number.isFinite(basisComponent) && basisComponent > 0,
    )
      ? [...rigAnchor.userData.curtainRigBasis]
      : [1.8, 2.4, 0.18]
function createClothGeometry(clothThree: any, folds: any, fabric: any) {
  const isSheer = fabric === 'sheer',
    segmentCount = Math.max(64, folds * 6),
    panelHeight = 2.28168,
    foldAmplitude = isSheer ? 0.023 : 0.046,
    clothThickness = 0.003,
    positionArray: any = [],
    normalArray: any = [],
    uvArray: any = [],
    colorArray: any = [],
    indexArray: any[] = [],
    foldDisplacement = (seamRatio: any) => foldAmplitude * Math.sin(seamRatio * folds * Math.PI * 2),
    foldSlope = (seamSlopeRatio: any) =>
      foldAmplitude * folds * Math.PI * 2 * Math.cos(seamSlopeRatio * folds * Math.PI * 2),
    pushVertex = (
      positionX: any,
      positionY: any,
      positionZ: any,
      normalX: any,
      normalY: any,
      normalZ: any,
      textureU: any,
      textureV: any,
    ) => {
      positionArray.push(positionX, positionY, positionZ),
        normalArray.push(normalX, normalY, normalZ),
        uvArray.push(textureU, textureV)
      const foldDarkness = 0.5 - 0.5 * Math.sin(positionX * folds * Math.PI * 2),
        foldShade = 1 - (isSheer ? 0.16 : 0.34) * foldDarkness * foldDarkness
      colorArray.push(foldShade, foldShade, foldShade)
    }
  for (const face of isSheer ? ['front'] : ['front', 'back', 'top', 'bottom']) {
    const faceVertexOffset = positionArray.length / 3
    for (let segmentIndex = 0; segmentIndex <= segmentCount; segmentIndex++) {
      const alongRatio = segmentIndex / segmentCount,
        foldOffset = foldDisplacement(alongRatio),
        foldSlopeSample = foldSlope(alongRatio),
        normalLength = Math.hypot(foldSlopeSample, 1)
      if (face === 'front' || face === 'back') {
        const outwardSign = face === 'front' ? 1 : -1
        for (const vertexHeight of [0, panelHeight])
          pushVertex(
            alongRatio,
            vertexHeight,
            foldOffset + (outwardSign * clothThickness) / 2,
            (-outwardSign * foldSlopeSample) / normalLength,
            0,
            outwardSign / normalLength,
            alongRatio,
            vertexHeight / panelHeight,
          )
      } else {
        const verticalSign = face === 'top' ? 1 : -1
        for (const thicknessOffset of [-clothThickness / 2, clothThickness / 2])
          pushVertex(
            alongRatio,
            verticalSign > 0 ? panelHeight : 0,
            foldOffset + thicknessOffset,
            0,
            verticalSign,
            0,
            alongRatio,
            thicknessOffset > 0 ? 1 : 0,
          )
      }
      if (segmentIndex < segmentCount) {
        const segmentVertexIndex = faceVertexOffset + segmentIndex * 2
        face === 'front' || face === 'bottom'
          ? indexArray.push(
              segmentVertexIndex,
              segmentVertexIndex + 2,
              segmentVertexIndex + 1,
              segmentVertexIndex + 1,
              segmentVertexIndex + 2,
              segmentVertexIndex + 3,
            )
          : indexArray.push(
              segmentVertexIndex,
              segmentVertexIndex + 1,
              segmentVertexIndex + 2,
              segmentVertexIndex + 1,
              segmentVertexIndex + 3,
              segmentVertexIndex + 2,
            )
      }
    }
  }
  for (const edgeX of isSheer ? [] : [0, 1]) {
    const capVertexOffset = positionArray.length / 3,
      edgeNormalSign = edgeX === 0 ? -1 : 1
    for (const edgeHeight of [0, panelHeight])
      for (const edgeThicknessOffset of [-clothThickness / 2, clothThickness / 2])
        pushVertex(
          edgeX,
          edgeHeight,
          foldDisplacement(edgeX) + edgeThicknessOffset,
          edgeNormalSign,
          0,
          0,
          edgeThicknessOffset > 0 ? 1 : 0,
          edgeHeight / panelHeight,
        )
    edgeNormalSign > 0
      ? indexArray.push(
          capVertexOffset,
          capVertexOffset + 2,
          capVertexOffset + 1,
          capVertexOffset + 1,
          capVertexOffset + 2,
          capVertexOffset + 3,
        )
      : indexArray.push(
          capVertexOffset,
          capVertexOffset + 1,
          capVertexOffset + 2,
          capVertexOffset + 1,
          capVertexOffset + 3,
          capVertexOffset + 2,
        )
  }
  const geometry = new clothThree.BufferGeometry()
  return (
    geometry.setAttribute('position', new clothThree.Float32BufferAttribute(positionArray, 3)),
    geometry.setAttribute('normal', new clothThree.Float32BufferAttribute(normalArray, 3)),
    geometry.setAttribute('uv', new clothThree.Float32BufferAttribute(uvArray, 2)),
    geometry.setAttribute('color', new clothThree.Float32BufferAttribute(colorArray, 3)),
    geometry.setIndex(indexArray),
    geometry.computeBoundingBox(),
    geometry.computeBoundingSphere(),
    geometry
  )
}
function isDescendantOf(descendant: any, ancestor: any) {
  for (let walkedNode = descendant; walkedNode; walkedNode = walkedNode.parent) if (walkedNode === ancestor) return true
  return false
}
function locateCurtainRig(environmentRoot: any) {
  const curtainParts: any = [],
    rigRoots: any = []
  function collectRigParts(visitedNode: any) {
    if (
      !(visitedNode.userData?.curtainMotionRig || visitedNode.userData?.curtainMotionPanel) &&
      !(visitedNode !== environmentRoot && visitedNode.userData?.environmentModelId != null)
    ) {
      visitedNode.userData?.curtainRigRoot === true && rigRoots.push(visitedNode),
        visitedNode.isMesh && trackPartSet.has(visitedNode.userData?.curtainPart) && curtainParts.push(visitedNode)
      for (const child of visitedNode.children || []) collectRigParts(child)
    }
  }
  if (
    (collectRigParts(environmentRoot),
    !curtainParts.some((curtainPartNode: any) => clothPartSet.has(curtainPartNode.userData.curtainPart)))
  )
    return null
  let anchor = rigRoots.find((anchorCandidate: any) =>
    curtainParts.every((partNode: any) => isDescendantOf(partNode, anchorCandidate)),
  )
  if (!anchor) {
    for (
      anchor = curtainParts[0].parent;
      anchor && !curtainParts.every((candidatePart: any) => isDescendantOf(candidatePart, anchor));
    )
      anchor = anchor.parent
  }
  return anchor && isDescendantOf(anchor, environmentRoot)
    ? {
        anchor: anchor,
        parts: curtainParts,
      }
    : null
}
export function createCurtainMotion({
  THREE: three,
  requestRender: requestRender = () => {},
}: {
  THREE?: typeof import('three')
  requestRender?: () => void
} = {}) {
  let syncedModelRoot: any = null,
    syncedSceneRevision: any,
    syncedBindingsSignature = '',
    isDisposed = false
  const clothGeometryMap = new Map()
  function getClothGeometry(foldCount: any, fabricName: any) {
    const cacheKey = fabricName + ':' + foldCount
    return (
      clothGeometryMap.has(cacheKey) ||
        clothGeometryMap.set(cacheKey, createClothGeometry(three, foldCount, fabricName)),
      clothGeometryMap.get(cacheKey)
    )
  }
  let rigsByBindingId = new Map(),
    coverStatesByEntityId = new Map(),
    isPoseKeyDirty = true,
    cachedPoseKey = '',
    previousEntityIdByBindingId = new Map(),
    generationCounter = 1,
    isStructureKeyDirty = true,
    cachedStructureKey = ''
  function markPoseDirty() {
    ;(isPoseKeyDirty = true), requestRender()
  }
  function createRig(model: any, binding: any, located: any) {
    const isRoller = binding.coverKind === 'roller',
      coveredParts = located.parts.filter(
        (coveredPart: any) =>
          isRoller || located.anchor.userData.curtainRollerModel || clothPartSet.has(coveredPart.userData.curtainPart),
      ),
      clothMaterials = coveredParts
        .filter((clothOnlyPart: any) => clothOnlyPart.userData.curtainPart === 'cloth')
        .flatMap((partMesh: any) => (Array.isArray(partMesh.material) ? partMesh.material : [partMesh.material]))
        .filter(Boolean),
      materialBrightness = (material: any) =>
        material.color ? material.color.r + material.color.g + material.color.b : 0,
      brightestMaterial = clothMaterials.reduce(
        (bestMaterial: any, candidateMaterial: any) =>
          !bestMaterial || materialBrightness(candidateMaterial) > materialBrightness(bestMaterial)
            ? candidateMaterial
            : bestMaterial,
        null,
      ),
      fabricKind = resolveCurtainFabric(binding),
      isSheerPanel = fabricKind === 'sheer',
      panelMaterial = isSheerPanel
        ? new three!.MeshStandardMaterial({
            color: 16118766,
            roughness: 1,
            metalness: 0,
            transparent: true,
            opacity: 0.68,
            depthWrite: false,
          })
        : brightestMaterial?.clone?.() ||
          new three!.MeshStandardMaterial({
            color: 13094354,
            roughness: 0.94,
            metalness: 0,
          })
    if (
      (panelMaterial.color?.lerp(new three!.Color(16777215), 0.2),
      (panelMaterial.emissiveIntensity = Math.min(panelMaterial.emissiveIntensity ?? 0, 0.06)),
      (panelMaterial.vertexColors = true),
      (panelMaterial.side = three!.DoubleSide),
      (panelMaterial.forceSinglePass = true),
      isRoller)
    ) {
      const rigBasis = resolveRigBasis(located.anchor),
        rollerCurtain = createRollerCurtain(
          three,
          {
            width: rigBasis[0],
            height: rigBasis[1],
            curtainFabric: fabricKind,
          },
          {
            material: panelMaterial,
          },
        ),
        rollerRigGroup = rollerCurtain.group
      rollerRigGroup.userData.curtainMotionRig = true
      for (const rollerMesh of rollerCurtain.meshes)
        Object.assign(rollerMesh.userData, {
          curtainMotionPanel: true,
          externalModelSharedGeometry: true,
          externalModelSharedMaterial: true,
          externalModelSharedTextures: true,
        })
      return (
        located.anchor.add(rollerRigGroup),
        {
          model: model,
          binding: binding,
          roller: rollerCurtain,
          fabric: fabricKind,
          anchor: located.anchor,
          parts: located.parts,
          rig: rollerRigGroup,
          basis: rigBasis,
          generation: generationCounter++,
          panels: rollerCurtain.meshes,
          material: panelMaterial,
          direction: resolveCoverDirection(binding),
          originals: new Map(coveredParts.map((rollerSourcePart: any) => [rollerSourcePart, rollerSourcePart.visible])),
          position: null as any,
          target: null as any,
          motionFrom: null as any,
          motionStart: null as any,
          statePositionHint: null as any,
        }
      )
    }
    const isDream = binding.coverKind === 'dream',
      trackModel = located.anchor.userData.curtainTrackModel || isDream ? createTrack(binding) : null,
      rigFolds = resolveFoldCount(binding),
      sharedGeometry = trackModel ? null : getClothGeometry(rigFolds, fabricKind),
      rigGroup = new three!.Group(),
      basis = resolveRigBasis(located.anchor)
    ;(rigGroup.name = 'curtain-motion-' + binding.id),
      (rigGroup.userData.curtainMotionRig = true),
      trackModel ? rigGroup.scale.set(1, 1, 1) : rigGroup.scale.set(basis[0] / 1.8, basis[1] / 2.4, basis[2] / 0.18),
      located.anchor.add(rigGroup)
    const panels = ['left', 'right'].map((side) => {
      const panelMesh = new three!.Mesh(
        isDream
          ? createBladeGeometry(three, trackModel, basis[1])
          : trackModel
            ? buildTrackClothGeometry(three, trackModel, basis[1], fabricKind)
            : sharedGeometry,
        panelMaterial,
      )
      return (
        (panelMesh.name = 'curtain-motion-' + binding.id + '-' + side),
        (panelMesh.userData.curtainMotionPanel = true),
        (panelMesh.userData.curtainSide = side),
        (panelMesh.userData.externalModelSharedGeometry = true),
        (panelMesh.userData.externalModelSharedTextures = true),
        (panelMesh.userData.externalModelSharedMaterial = true),
        trackModel || panelMesh.position.set(side === 'left' ? -0.9 : 0.9, 0.06, 0),
        (panelMesh.castShadow =
          !isSheerPanel && coveredParts.some((shadowCastingPart: any) => shadowCastingPart.castShadow)),
        (panelMesh.receiveShadow = coveredParts.some((shadowReceivingPart: any) => shadowReceivingPart.receiveShadow)),
        (panelMesh.visible = false),
        rigGroup.add(panelMesh),
        panelMesh
      )
    })
    return {
      model: model,
      binding: binding,
      dream: isDream,
      fabric: fabricKind,
      folds: rigFolds,
      track: trackModel,
      anchor: located.anchor,
      parts: located.parts,
      rig: rigGroup,
      basis: basis,
      generation: generationCounter++,
      panels: panels,
      material: panelMaterial,
      originals: new Map(coveredParts.map((clothSourcePart: any) => [clothSourcePart, clothSourcePart.visible])),
      direction: resolveCoverDirection(binding),
      position: null as any,
      target: null as any,
      motionFrom: null as any,
      motionStart: null as any,
      statePositionHint: null as any,
    }
  }
  function disposeRig(discardedRig: any) {
    for (const [restoredPart, wasVisible] of discardedRig.originals) restoredPart.visible = wasVisible
    if (
      (discardedRig.rig.removeFromParent(),
      discardedRig.roller?.dispose({
        keepMaterial: true,
      }),
      discardedRig.track)
    ) {
      for (const panelToDispose of discardedRig.panels) panelToDispose.geometry.dispose()
    }
    discardedRig.material.dispose()
  }
  function resetRigMotion(resetTargetRig: any) {
    ;(resetTargetRig.position = null),
      (resetTargetRig.target = null),
      (resetTargetRig.motionFrom = null),
      (resetTargetRig.motionStart = null),
      (resetTargetRig.bladePosition = null),
      (resetTargetRig.statePositionHint = null),
      applyRigPose(resetTargetRig)
  }
  function applyRigPose(posedRig: any) {
    const positionRatio = posedRig.position ?? resolvePoseFallback(posedRig)
    if (posedRig.roller) {
      for (const rollerHiddenPart of posedRig.originals.keys()) rollerHiddenPart.visible = false
      posedRig.roller.pose(positionRatio), (isPoseKeyDirty = true)
      return
    }
    if (posedRig.track) {
      for (const trackHiddenPart of posedRig.originals.keys()) trackHiddenPart.visible = false
      const trackPoseKey = positionRatio + ':' + posedRig.direction + ':' + (posedRig.bladePosition ?? 50)
      if (posedRig.geometryPose === trackPoseKey) return
      samplePanelRanges(posedRig.track, positionRatio, posedRig.direction).forEach((panelRange, sideIndex) => {
        const panel = posedRig.panels[sideIndex]
        panel.visible = panelRange.visible
        const panelPose = {
          ...panelRange,
          side: sideIndex,
          split: posedRig.direction === 'split',
        }
        posedRig.dream
          ? poseBladeGeometry(panel.geometry, posedRig.track, panelPose, posedRig.bladePosition ?? 50)
          : poseClothGeometry(panel.geometry, posedRig.track, panelPose)
      }),
        (posedRig.geometryPose = trackPoseKey),
        (isPoseKeyDirty = true)
      return
    }
    const isSplit = posedRig.direction === 'split',
      panelWidth = isSplit ? (posedRig.fabric === 'sheer' ? 0.9 : 0.906) : 1.8,
      clothScale = 1 - ((1 - MIN_PANEL_SCALE) * positionRatio) / 100
    for (const clothHiddenPart of posedRig.originals.keys()) clothHiddenPart.visible = false
    for (const posedPanel of posedRig.panels) {
      const isLeftPanel = posedPanel.userData.curtainSide === 'left'
      ;(posedPanel.visible = isSplit || posedRig.direction === (isLeftPanel ? 'left' : 'right')),
        (posedPanel.scale.x = (isLeftPanel ? 1 : -1) * panelWidth * clothScale),
        posedPanel.updateMatrix()
    }
    isPoseKeyDirty = true
  }
  function updateRigTarget(motionRig: any, receivedMotionState: any, immediate = false) {
    const incomingPosition = resolveStatePosition(receivedMotionState),
      nextStatePositionHint = resolveStatePositionHint(receivedMotionState),
      hasStatePositionHintChanged = motionRig.statePositionHint !== nextStatePositionHint,
      hasBladeChanged = motionRig.bladePosition !== receivedMotionState.bladePosition
    ;(motionRig.bladePosition = receivedMotionState.bladePosition),
      (motionRig.statePositionHint = nextStatePositionHint),
      // 叶片角度变化要立即生效（梦幻帘调叶片不该有 420ms 的滞后）。
      hasBladeChanged && motionRig.dream && applyRigPose(motionRig)
    if (incomingPosition === null) {
      // 位置未知（设备未上报 / 掉线）：保持在当前位置不动，而不是跳回 0。
      const hasPendingMotion = motionRig.target !== motionRig.position
      return (
        (motionRig.target = motionRig.position),
        (motionRig.motionStart = null),
        // 例外：骨架本来就没有位置、只能靠状态推断时，状态变了要按新推断重摆一次。
        hasStatePositionHintChanged && motionRig.position === null
          ? (applyRigPose(motionRig), true)
          : hasPendingMotion || hasBladeChanged
      )
    }
    if (motionRig.position === null || immediate) {
      const positionChanged = motionRig.position !== incomingPosition || motionRig.target !== incomingPosition
      return (
        (motionRig.position = incomingPosition),
        (motionRig.target = incomingPosition),
        (motionRig.motionStart = null),
        positionChanged && applyRigPose(motionRig),
        positionChanged || hasBladeChanged
      )
    }
    return motionRig.target === incomingPosition
      ? hasBladeChanged
      : ((motionRig.target = incomingPosition),
        (motionRig.motionFrom = motionRig.position),
        (motionRig.motionStart = null),
        true)
  }
  function setBindings(modelRoot: any, bindings: any[] = [], sceneRevision: any) {
    if (isDisposed) return
    const seenBindingIdSet = new Set(),
      seenModelKeySet = new Set(),
      normalizedBindings = (Array.isArray(bindings) ? bindings : [])
        .filter((candidateBinding) => {
          if (!candidateBinding || candidateBinding.id == null || candidateBinding.modelId == null) return false
          const bindingIdKey = String(candidateBinding.id),
            rawLocationKey = sceneModelKey(candidateBinding.floorId, candidateBinding.modelId)
          return seenBindingIdSet.has(bindingIdKey) || seenModelKeySet.has(rawLocationKey)
            ? false
            : (seenBindingIdSet.add(bindingIdKey), seenModelKeySet.add(rawLocationKey), true)
        })
        .map((rawBinding) => ({
          id: String(rawBinding.id),
          entityId: String(rawBinding.entityId ?? ''),
          floorId: String(rawBinding.floorId ?? ''),
          modelId: String(rawBinding.modelId),
          curtainWidth: Number(rawBinding.curtainWidth) > 0 ? Number(rawBinding.curtainWidth) : 1.8,
          coverDirection: rawBinding.coverDirection || 'auto',
          curtainPosition: rawBinding.curtainPosition || 'split',
          coverKind: ['dream', 'roller'].includes(rawBinding.coverKind) ? rawBinding.coverKind : 'standard',
          ...normalizeTrack(rawBinding),
          curtainFabric: resolveCurtainFabric(rawBinding),
          unboundPosition: resolveUnboundPosition(rawBinding),
        })),
      bindingsSignature = JSON.stringify(normalizedBindings)
    if (
      syncedModelRoot === modelRoot &&
      syncedSceneRevision === sceneRevision &&
      syncedBindingsSignature === bindingsSignature
    )
      return
    const entityIdByBindingId = new Map(
      normalizedBindings.map((normalizedEntry) => [normalizedEntry.id, normalizedEntry.entityId]),
    )
    for (const staleBindingId of coverStatesByEntityId.keys())
      (!entityIdByBindingId.has(staleBindingId) ||
        (previousEntityIdByBindingId.has(staleBindingId) &&
          previousEntityIdByBindingId.get(staleBindingId) !== entityIdByBindingId.get(staleBindingId))) &&
        coverStatesByEntityId.delete(staleBindingId)
    ;(previousEntityIdByBindingId = entityIdByBindingId),
      (syncedModelRoot = modelRoot || null),
      (syncedSceneRevision = sceneRevision),
      (syncedBindingsSignature = bindingsSignature)
    const modelsByLocationKey = new Map()
    normalizedBindings.length &&
      syncedModelRoot?.traverse?.((sceneNode: any) => {
        if (sceneNode.userData?.environmentModelType !== 'curtain' || sceneNode.userData?.environmentModelId == null)
          return
        let nodeFloorId = sceneNode.userData.environmentFloorId
        for (let parentNode = sceneNode.parent; nodeFloorId == null && parentNode; parentNode = parentNode.parent)
          nodeFloorId = parentNode.userData?.environmentFloorId
        modelsByLocationKey.set(sceneModelKey(nodeFloorId, sceneNode.userData.environmentModelId), sceneNode)
      })
    const locatedEntries = normalizedBindings
        .map((locatedBinding) => {
          const environmentModel = modelsByLocationKey.get(
              sceneModelKey(locatedBinding.floorId, locatedBinding.modelId),
            ),
            locatedRig = environmentModel ? locateCurtainRig(environmentModel) : null
          return locatedRig
            ? {
                binding: locatedBinding,
                model: environmentModel,
                located: locatedRig,
              }
            : null
        })
        .filter(Boolean) as any[],
      reusedRigsByBindingId = new Map()
    for (const entry of locatedEntries) {
      const existingRig = rigsByBindingId.get(entry!.binding.id)
      existingRig &&
        existingRig.binding.coverKind === entry!.binding.coverKind &&
        JSON.stringify(existingRig.basis) === JSON.stringify(resolveRigBasis(entry!.located.anchor)) &&
        (!existingRig.track ||
          JSON.stringify([normalizeTrack(existingRig.binding), existingRig.binding.curtainWidth]) ===
            JSON.stringify([normalizeTrack(entry!.binding), entry!.binding.curtainWidth])) &&
        existingRig.fabric === resolveCurtainFabric(entry!.binding) &&
        existingRig.model === entry!.model &&
        existingRig.anchor === entry!.located.anchor &&
        existingRig.parts.length === entry!.located.parts.length &&
        existingRig.parts.every((part: any, partIndex: any) => part === entry!.located.parts[partIndex]) &&
        reusedRigsByBindingId.set(entry!.binding.id, existingRig)
    }
    for (const [removedBindingId, removedRig] of rigsByBindingId)
      reusedRigsByBindingId.has(removedBindingId) || disposeRig(removedRig)
    const previousRigsByBindingId = rigsByBindingId
    rigsByBindingId = new Map()
    for (const { binding: entryBinding, model: entryModel, located: entryLocated } of locatedEntries) {
      const nextRig = reusedRigsByBindingId.get(entryBinding.id) || createRig(entryModel, entryBinding, entryLocated),
        previousRig = previousRigsByBindingId.get(entryBinding.id)
      if (
        previousRig &&
        previousRig !== nextRig &&
        previousRig.model === entryModel &&
        previousRig.binding.entityId === entryBinding.entityId
      ) {
        for (const motionFieldName of [
          'position',
          'target',
          'motionFrom',
          'motionStart',
          'bladePosition',
          'statePositionHint',
        ])
          nextRig[motionFieldName] = previousRig[motionFieldName]
        applyRigPose(nextRig)
      }
      const nextDirection = resolveCoverDirection(entryBinding)
      nextRig.binding.entityId !== entryBinding.entityId && resetRigMotion(nextRig), (nextRig.binding = entryBinding)
      const nextFolds = resolveFoldCount(entryBinding)
      if (!nextRig.track && !nextRig.roller && nextRig.folds !== nextFolds) {
        nextRig.folds = nextFolds
        for (const panelToRefold of nextRig.panels) panelToRefold.geometry = getClothGeometry(nextFolds, nextRig.fabric)
      }
      ;(nextRig.basis = resolveRigBasis(nextRig.anchor)),
        nextRig.rig.scale.set(
          ...(nextRig.track || nextRig.roller
            ? [1, 1, 1]
            : [nextRig.basis[0] / 1.8, nextRig.basis[1] / 2.4, nextRig.basis[2] / 0.18]),
        ),
        nextRig.direction !== nextDirection && ((nextRig.direction = nextDirection), applyRigPose(nextRig)),
        rigsByBindingId.set(entryBinding.id, nextRig),
        coverStatesByEntityId.has(entryBinding.id) &&
          updateRigTarget(nextRig, coverStatesByEntityId.get(entryBinding.id)),
        nextRig.position === null && applyRigPose(nextRig)
    }
    ;(isStructureKeyDirty = true), markPoseDirty()
  }
  function setState(coverBindingId: any, receivedCoverState: any, { immediate: isImmediate = false } = {}) {
    if (isDisposed || coverBindingId == null) return
    const coverBindingIdKey = String(coverBindingId),
      nextMotionState = {
        position: resolveStatePosition(receivedCoverState),
        statePositionHint: resolveStatePositionHint(receivedCoverState),
        bladePosition: Number.isFinite(receivedCoverState?.tiltPosition) ? receivedCoverState.tiltPosition : null,
      }
    coverStatesByEntityId.set(coverBindingIdKey, nextMotionState)
    const boundRig = rigsByBindingId.get(coverBindingIdKey)
    boundRig && updateRigTarget(boundRig, nextMotionState, isImmediate) && markPoseDirty()
  }
  function isMoving() {
    return (
      !isDisposed &&
      [...rigsByBindingId.values()].some(
        (pendingRig) => pendingRig.position !== null && pendingRig.target !== pendingRig.position,
      )
    )
  }
  function update(timestampMs: any) {
    if (!isMoving()) return false
    Number.isFinite(timestampMs) || (timestampMs = globalThis.performance?.now() ?? Date.now())
    let hasAnimated = false
    for (const movingRig of rigsByBindingId.values()) {
      if (movingRig.position === null || movingRig.target === movingRig.position) continue
      ;(movingRig.motionStart === null || timestampMs < movingRig.motionStart) && (movingRig.motionStart = timestampMs)
      const progressRatio = Math.min(1, (timestampMs - movingRig.motionStart) / MOTION_DURATION_MS),
        easingFactor = progressRatio * progressRatio * (3 - 2 * progressRatio),
        nextPosition =
          progressRatio === 1
            ? movingRig.target
            : movingRig.motionFrom + (movingRig.target - movingRig.motionFrom) * easingFactor
      nextPosition !== movingRig.position &&
        ((movingRig.position = nextPosition), applyRigPose(movingRig), (hasAnimated = true))
    }
    return hasAnimated
  }
  function poseKey() {
    return (
      isPoseKeyDirty &&
        ((cachedPoseKey = JSON.stringify(
          [...rigsByBindingId.values()]
            .map((poseRig) => [
              poseRig.binding.id,
              poseRig.binding.floorId,
              poseRig.binding.modelId,
              poseRig.binding.entityId,
              poseRig.generation,
              poseRig.direction,
              poseRig.basis,
              poseRig.folds,
              poseRig.bladePosition,
              poseRig.position === null
                ? 'preview-' + resolvePoseFallback(poseRig)
                : Math.round(poseRig.position * 100) / 100,
            ])
            .sort((leftPoseEntry, rightPoseEntry) => leftPoseEntry[0].localeCompare(rightPoseEntry[0])),
        )),
        (isPoseKeyDirty = false)),
      cachedPoseKey
    )
  }
  function structureKey() {
    return (
      isStructureKeyDirty &&
        ((cachedStructureKey = JSON.stringify(
          [...rigsByBindingId.values()]
            .map((structureRig) => [
              structureRig.binding.id,
              structureRig.binding.floorId,
              structureRig.binding.modelId,
              structureRig.generation,
              structureRig.direction,
              structureRig.basis,
              structureRig.folds,
            ])
            .sort((leftStructureEntry, rightStructureEntry) =>
              leftStructureEntry[0].localeCompare(rightStructureEntry[0]),
            ),
        )),
        (isStructureKeyDirty = false)),
      cachedStructureKey
    )
  }
  function dispose() {
    if (!isDisposed) {
      isDisposed = true
      for (const disposedRig of rigsByBindingId.values()) disposeRig(disposedRig)
      rigsByBindingId.clear(), coverStatesByEntityId.clear(), previousEntityIdByBindingId.clear()
      for (const cachedGeometry of clothGeometryMap.values()) cachedGeometry.dispose()
      clothGeometryMap.clear(),
        (syncedModelRoot = null),
        (isPoseKeyDirty = true),
        (isStructureKeyDirty = true),
        requestRender()
    }
  }
  return {
    setBindings: setBindings,
    setState: setState,
    update: update,
    isMoving: isMoving,
    poseKey: poseKey,
    structureKey: structureKey,
    dispose: dispose,
  }
}
