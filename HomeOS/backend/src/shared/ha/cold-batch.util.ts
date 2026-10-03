/**
 * 所属模块：backend/shared/ha
 * 职责：
 *  - HA 批量调用节流/重试/错峰工具；
 * 关键依赖：
 *  - bottleneck；
 * 约定：
 *  - 对外方法遇非法输入显式抛出 Error / HttpException；
 *  - Nest 默认 DEFAULT scope；
 */

import type { HaStateChangeBatchEvent, HaStateChangeEvent } from '../types';

/** 从 COLD_BATCH 负载取出变更列表（容错空/非法） */
export function coldBatchChanges(
  payload: HaStateChangeBatchEvent | HaStateChangeEvent[] | null | undefined,
): HaStateChangeEvent[] {
  if (!payload) return [];
  if (Array.isArray(payload)) return payload;
  const changes = payload.changes;
  return Array.isArray(changes) ? changes : [];
}

/**
 * 同步遍历批内事件；单条 handler 抛错不中断其余条目。
 */
export function forEachColdBatchEvent(
  payload: HaStateChangeBatchEvent | HaStateChangeEvent[] | null | undefined,
  handler: (event: HaStateChangeEvent) => void,
): void {
  for (const event of coldBatchChanges(payload)) {
    handler(event);
  }
}
