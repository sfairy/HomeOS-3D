/**
 * 统一执行历史工具
 *
 * 所属模块：linkage-health（由 LinkageHealthModule 提供）
 * 职责：定义纳入"统一执行历史"的告警通知来源集合，并提供类型解析、
 *  成功判定与合并排序截断等纯函数工具。
 * 供 ExecutionHistoryService 在合并多来源历史时调用。
 */
import { isExecutionRecordType } from '@homeos/shared';
import type { ExecutionRecordType, UnifiedExecutionRecord } from './execution-history.service';

/**
 * 统一执行历史中展示的告警通知来源
 *
 * 这些来源的通知会被归一化为 type='alert' 的执行记录，
 * 涵盖告警规则、能源、水务、安防、应急、环境、设备、日程、地震与家庭模式等。
 */
export const EXECUTION_HISTORY_ALERT_SOURCES = [
  'alert-rule',
  'energy-budget',
  'energy-anomaly',
  'water-monitor',
  'security',
  'emergency',
  'environment-health',
  'device-monitor',
  'device-health',
  'schedule-reminder',
  'automation',
  'earthquake-eew',
  'earthquake-catalog',
  'home-mode',
] as const;

/**
 * 解析可选的执行历史类型筛选。
 *
 * @param type 原始查询参数（可能为空或非法值）。
 * @returns 合法类型则返回该类型，空串/非法值返回 undefined（表示不筛选）。
 */
export function parseExecutionHistoryType(type?: string): ExecutionRecordType | undefined {
  if (!type?.trim()) return undefined;
  const normalized = type.trim();
  if (!isExecutionRecordType(normalized)) return undefined;
  return normalized as ExecutionRecordType;
}

/**
 * 告警级别是否视为执行成功。
 *
 * 约定：danger 级别代表严重告警，视为失败；其余级别（info/warning/success 等）视为成功。
 *
 * @param level 告警级别字符串。
 * @returns 非 danger 返回 true。
 */
export function alertSuccessFromLevel(level: string): boolean {
  return level !== 'danger';
}

/**
 * 合并后按时间倒序并截断。
 *
 * @param records 已归一化的统一执行记录数组（会被原地排序）。
 * @param limit 期望保留的条数，夹在 [1, 100] 区间。
 * @returns 排序并截断后的记录数组。
 */
export function sortAndLimitExecutionRecords(
  records: UnifiedExecutionRecord[],
  limit: number,
): UnifiedExecutionRecord[] {
  const take = Math.min(Math.max(limit, 1), 100);
  records.sort((a, b) => new Date(b.executedAt).getTime() - new Date(a.executedAt).getTime());
  return records.slice(0, take);
}