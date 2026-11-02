/**
 * @file entity-ws-sync.ts
 * @module frontend/src/shared/entity/utils
 * entity WebSocket 同步状态助手：分块 apply 等待 / 同步状态创建 / 定时器清理。
 */
import type { EntitySocketSyncState } from '@/shared/types/entity-store'

// ── entity-ws-sync.util ──
const CHUNK_APPLY_WAIT_MS = 8_000

export function waitForPendingChunkApplies(
  sync: EntitySocketSyncState,
  onReady: () => void,
  deadline = Date.now() + CHUNK_APPLY_WAIT_MS,
): void {
  if (sync.pendingChunkApplies <= 0) {
    onReady()
    return
  }
  if (Date.now() >= deadline) {
    onReady()
    return
  }
  setTimeout(() => waitForPendingChunkApplies(sync, onReady, deadline), 16)
}

export function createEntitySocketSyncState(): EntitySocketSyncState {
  return {
    initialStatesReceived: false,
    restFallbackTimer: null,
    loadingFallbackTimer: null,
    incrementalToken: null,
    incrementalExpected: 0,
    incrementalReceivedCount: 0,
    pendingChunkApplies: 0,
    incrementalEndScheduled: false,
    chunkedEntityIds: new Set<string>(),
    pendingPreChunkDeltas: [],
  }
}

/** 重置一批分块同步的「已到 chunk 实体集合」与暂存 delta（BEGIN / END 都要调）。 */
export function resetChunkBaselineTracking(sync: EntitySocketSyncState): void {
  sync.chunkedEntityIds = new Set<string>()
  sync.pendingPreChunkDeltas = []
}

/**
 * 分块批次是否「不完整」（需要 REST 整包回退）。
 *
 * 判据是「收到的实体数不足期望的 90%」：分块是切片而不是承诺，少量实体被权限/域过滤掉
 * 是正常的；差得更多就说明中间丢了 chunk，而 chunk 缺失是**补不回来的** —— 服务端不会再发
 * 一遍，delta 也只会更新到「有基线」的实体，缺的那些会永久停在 unavailable。
 *
 * ``expected`` 为 0 时不做判断（服务端没给总数，无从比较）。
 */
export function incrementalBatchIncomplete(expected: number, received: number): boolean {
  if (!(expected > 0)) return false
  return Math.max(0, received) < expected * 0.9
}

/** 登记一次 END 收尾：捕获当前 token/已收数量；重复 END 返回 null */
export function scheduleIncrementalEnd(
  sync: EntitySocketSyncState,
): { token: unknown; received: number } | null {
  if (sync.incrementalToken == null || sync.incrementalEndScheduled) return null
  sync.incrementalEndScheduled = true
  return { token: sync.incrementalToken, received: sync.incrementalReceivedCount }
}

export function clearEntitySocketSyncTimers(sync: EntitySocketSyncState): void {
  if (sync.restFallbackTimer) {
    clearTimeout(sync.restFallbackTimer)
    sync.restFallbackTimer = null
  }
  if (sync.loadingFallbackTimer) {
    clearTimeout(sync.loadingFallbackTimer)
    sync.loadingFallbackTimer = null
  }
}
