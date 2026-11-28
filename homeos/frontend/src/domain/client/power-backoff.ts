/**
 * 客户端上报的失败退避（纯函数，无依赖，便于单独验证）。
 *
 * ## 为什么需要退避
 *
 * 上报周期默认 10 秒。后端不可达（重启 / 改地址 / Wi-Fi 切换）时，旧实现每个周期都
 * 重新采集一次 CPU / 内存 / 电池并构建整份 payload，然后失败一次 —— 这既是无意义的
 * 采样开销，也让同一个错误每 10 秒刷一条日志。而恢复之后本来就应该立刻回到正常节奏，
 * 所以退避必须是「失败才延长、成功立刻清零」，不是固定间隔。
 *
 * ## 为什么不做「离线补报」
 *
 * 后端存的是每个客户端的**当前状态快照**（`self._states[clientId]`），不是时间序列：
 * 补报一条过期的样本只会把界面上「最近一次上报」的时间戳写错，反而制造假数据。
 * 断线期间的数据没有消费方，因此这里只做退避，不做队列。
 */

/** 首次失败的等待时长（毫秒）。 */
export const REPORT_BACKOFF_BASE_MS = 10_000
/** 退避上限（毫秒）:不无限增长,避免网络恢复后还要等太久才回到正常上报。 */
export const REPORT_BACKOFF_MAX_MS = 120_000

/**
 * 下一次失败后的等待时长。
 *
 * @param currentMs 当前退避时长；`0` 表示上一次是成功的（或从未失败）
 * @returns 加倍后的退避，首次失败返回 BASE，封顶 MAX
 */
export function nextReportBackoffMs(currentMs: number): number {
  if (!Number.isFinite(currentMs) || currentMs <= 0) return REPORT_BACKOFF_BASE_MS
  return Math.min(currentMs * 2, REPORT_BACKOFF_MAX_MS)
}

/**
 * 本次尝试是否应被退避跳过。
 *
 * @param nowMs 当前时刻（`Date.now()`）
 * @param nextAttemptAtMs 允许再次尝试的时刻；`0` 表示立即允许
 */
export function isReportBackedOff(nowMs: number, nextAttemptAtMs: number): boolean {
  if (!Number.isFinite(nextAttemptAtMs) || nextAttemptAtMs <= 0) return false
  return nowMs < nextAttemptAtMs
}
