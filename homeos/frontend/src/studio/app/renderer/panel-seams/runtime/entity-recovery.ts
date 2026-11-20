/**
 * 实体「恢复可用」检测（0.8.7 修复：实体恢复后折线图仍停在旧数据）。
 *
 * 问题根因是**缓存与退避都不会因为「实体又活了」而复位**：
 *
 * 1. `historySeriesCache` 里的旧点还在，取用时按 `fetchedAt + interval` 判定「还新鲜」，
 *    于是恢复后第一次刷新仍然拿到停机前的数据；
 * 2. `EntityRequestPolicy` 会把 404 / 410 之类判成永久屏蔽（`nextAt = Infinity`），
 *    HA 那边实体重建后，这边永远不再请求；
 * 3. 重试计数 `historyRetryAttempt` 到上限后停在原地，需要外部把它清零。
 *
 * 所以恢复判定必须发生在**状态流**这一层：只有这里同时知道「上一帧不可用、这一帧可用」。
 * 判定为恢复时做三件事 —— 清该实体历史缓存、解除请求屏蔽、重置重试计数 —— 然后
 * 合并成一次历史刷新（同一批恢复的实体不该各刷一遍）。
 */

/** 结构类型：只声明本模块真正读写的字段，避免把 PanelRenderer 拖成依赖。 */
export type HistoryRecoveryTarget = {
  historySeries: Map<unknown, unknown>
  historySeriesCache: Map<string, unknown>
  historyRequestPolicy: { success(entityId: string): void }
  historyRetryAttempt: number
}

const availabilityByOwner = new WeakMap<object, Map<string, boolean>>()
const pendingByOwner = new WeakMap<object, Set<string>>()
const timerByOwner = new WeakMap<object, ReturnType<typeof setTimeout>>()

/** 这批恢复合并成一次刷新的等待时间：足够让同一批快照里的实体都处理完。 */
const RECOVERY_REFRESH_DELAY_MS = 300

/**
 * 实体是否「真的可用」。
 *
 * 与 `lineChartRuntimeStateNeedsHydration` 同口径，但**不**把 `0` / `off` 当成不可用：
 * 灯关着、电量为 0 都是正常状态，恢复判定只关心 unknown / unavailable / none。
 */
export function entityIsAvailable(state: unknown): boolean {
  if (!state || typeof state !== 'object') return false
  const resolved = (state as { newState?: unknown }).newState || state
  if (!resolved || typeof resolved !== 'object') return false
  const record = resolved as { available?: unknown; state?: unknown }
  if (record.available === false) return false
  const value = String(record.state ?? '')
    .trim()
    .toLowerCase()
  return value !== '' && !['unknown', 'unavailable', 'none', 'null'].includes(value)
}

function availabilityMap(owner: object): Map<string, boolean> {
  const existing = availabilityByOwner.get(owner)
  if (existing) return existing
  const created = new Map<string, boolean>()
  availabilityByOwner.set(owner, created)
  return created
}

/** 删掉该实体的历史缓存（`historySeries` 单条 + `historySeriesCache` 全部窗口）。 */
function invalidateHistory(target: HistoryRecoveryTarget, entityId: string): void {
  target.historySeries.delete(entityId)
  const prefix = `${entityId}:`
  for (const key of [...target.historySeriesCache.keys()]) {
    if (key.startsWith(prefix)) target.historySeriesCache.delete(key)
  }
}

/**
 * 记下这次可用性；**只在「上次不可用 → 这次可用」**时返回 true。
 *
 * 首次观测不算恢复（`before` 是 undefined）：否则页面初次加载就会清一遍缓存，
 * 把「打开即命中缓存」这个正常收益丢掉。
 */
export function noteEntityAvailability(owner: object, entityId: string, state: unknown): boolean {
  const map = availabilityMap(owner)
  const available = entityIsAvailable(state)
  const before = map.get(entityId)
  map.set(entityId, available)
  return before === false && available
}

/**
 * 处理一次恢复：清缓存、解除屏蔽、重置退避，并合并调度一次历史刷新。
 *
 * @param refresh 触发历史刷新（通常是 `refreshHistorySeries` 的绑定版本）
 */
export function handleEntityRecovered(
  owner: object,
  entityId: string,
  target: HistoryRecoveryTarget,
  refresh: () => void,
): void {
  invalidateHistory(target, entityId)
  target.historyRequestPolicy.success(entityId)
  // 退避计数必须清零：否则「连续失败 4 次后永久不再重试」会让恢复后的图表永远停在旧数据。
  target.historyRetryAttempt = 0
  const pending = pendingByOwner.get(owner) ?? new Set<string>()
  pendingByOwner.set(owner, pending)
  pending.add(entityId)
  if (timerByOwner.has(owner)) return
  timerByOwner.set(
    owner,
    setTimeout(() => {
      timerByOwner.delete(owner)
      pendingByOwner.delete(owner)
      refresh()
    }, RECOVERY_REFRESH_DELAY_MS),
  )
}

/** 断开连接 / 销毁时清理：不清会让同一批实体在下次连接里被误判成「恢复」。 */
export function resetEntityRecovery(owner: object): void {
  availabilityByOwner.delete(owner)
  pendingByOwner.delete(owner)
  const timer = timerByOwner.get(owner)
  if (timer !== undefined) clearTimeout(timer)
  timerByOwner.delete(owner)
}
