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
