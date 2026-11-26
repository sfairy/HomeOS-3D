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
