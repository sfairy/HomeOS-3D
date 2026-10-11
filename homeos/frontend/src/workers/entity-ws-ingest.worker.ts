/** 实体 WS 批次规范化 Worker（主线程以外执行 delta 合并 + old_state 拷贝）。 */
import { expose } from 'comlink'
import {
  normalizeWsBatchChangesSync,
  type WsDeltaChange,
} from '@/shared/entity/utils/state-delta.util'
import type { EntitiesMap } from '@/shared/types/entity-store'

/**
 * 规范化 WS 批次：将原始 delta 合并、补齐 old_state 后产出可应用条目。
 * 直接复用主线程同步实现，把 CPU 密集计算移到 Worker 线程以避免 UI 卡顿。
 */
function normalizeBatch(changes: WsDeltaChange[], entitySnapshots: EntitiesMap) {
  return normalizeWsBatchChangesSync(changes, entitySnapshots)
}

expose({ normalizeBatch })
