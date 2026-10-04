/**
 * 实体 WS 批次规范化 Worker（主线程以外执行 delta 合并 + old_state 拷贝）。
 *
 * 关键依赖：comlink（RPC 暴露）、@/utils/entity/state-delta.util（同步规范化实现）、
 *   @/types/entity-store（实体与变化类型）。
 *
 * 消息协议（comlink RPC，无 postMessage 显式事件）：
 * - 入站方法 normalizeBatch(changes: WsDeltaChange[], entitySnapshots: EntitiesMap)
 *     主线程桥 entity-ws-ingest-bridge.ts 在大批次（≥ WORKER_THRESHOLD）时调用，
 *     把待规范化的 delta 列表连同相关实体快照传入，避免主线程长任务阻塞 UI；
 * - 出站返回 NormalizedWsBatchItem[]：已合并 delta、补齐 old_state、规范化后的批次条目。
 */
import { expose } from 'comlink'
import {
  normalizeWsBatchChangesSync,
  type WsDeltaChange,
} from '@/utils/entity/state-delta.util'
import type { EntitiesMap } from '@/types/entity-store'

/**
 * 规范化 WS 批次：将原始 delta 合并、补齐 old_state 后产出可应用条目。
 * 直接复用主线程同步实现，把 CPU 密集计算移到 Worker 线程以避免 UI 卡顿。
 */
function normalizeBatch(changes: WsDeltaChange[], entitySnapshots: EntitiesMap) {
  return normalizeWsBatchChangesSync(changes, entitySnapshots)
}

expose({ normalizeBatch })
