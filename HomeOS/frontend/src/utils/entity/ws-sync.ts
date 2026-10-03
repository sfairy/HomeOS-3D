/**
 * @file entity-ws-sync.ts
 * @module frontend/src/utils
 * entity WebSocket 同步状态助手：分块 apply 等待 / 同步状态创建 / 定时器清理。
 */
import type { EntitySocketSyncState } from '@/types/entity-store'

// ── entity-ws-sync.util ──
const CHUNK_APPLY_WAIT_MS = 8_000

/** waitForPendingChunkApplies：函数，按签名入参返回处理结果。 */
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

/** createEntitySocketSyncState：函数，按签名入参返回处理结果。 */
export function createEntitySocketSyncState(): EntitySocketSyncState {
  return {
    initialStatesReceived: false,
    restFallbackTimer: null,
    chunkedEntities: null,
    loadingFallbackTimer: null,
    incrementalToken: null,
    incrementalExpected: 0,
    incrementalReceivedCount: 0,
    pendingChunkApplies: 0,
    incrementalEndScheduled: false,
  }
}

/** 登记一次 END 收尾：捕获当前 token/已收数量；重复 END 返回 null */
export function scheduleIncrementalEnd(
  sync: EntitySocketSyncState,
): { token: unknown; received: number } | null {
  if (sync.incrementalToken == null || sync.incrementalEndScheduled) return null
  sync.incrementalEndScheduled = true
  return { token: sync.incrementalToken, received: sync.incrementalReceivedCount }
}

/** clearEntitySocketSyncTimers：函数，按签名入参返回处理结果。 */
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
