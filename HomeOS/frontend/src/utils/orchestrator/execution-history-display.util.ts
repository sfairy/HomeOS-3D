/**
 * 执行历史记录展示工具。
 *
 * 所属模块：联动器 / Orchestrator
 * 职责：为执行历史列表提供类型标签、名称格式化与相对时间展示，供 UI 渲染使用。
 *
 * 依赖：
 *   - `@homeos/shared`：提供 `executionTypeLabel`（类型标签映射）与
 *     `formatExecutionHistoryName`（名称格式化）。
 *   - `@/utils/format/locale-format.util`：提供本地化日期时间格式化。
 */
/** 执行历史记录类型标签与相对时间展示 */
import {
  executionTypeLabel,
  formatExecutionHistoryName,
  type ExecutionHistoryDisplayInput,
} from '@homeos/shared'
import { formatLocaleDateTime } from '@/utils/format/locale-format.util'

/**
 * 获取执行历史记录的类型标签（中文）。
 *
 * @param type - 执行类型键（如 automation/script/scene）。
 * @returns 面向用户展示的类型标签字符串。
 */
export function executionHistoryTypeLabel(type: string) {
  return executionTypeLabel(type)
}

/**
 * 格式化执行历史记录的展示名称。
 *
 * @param record - 历史记录输入（含名称、ID 等，由 shared 层决定具体格式化规则）。
 * @returns 面向用户展示的名称字符串。
 */
export function executionHistoryDisplayName(record: ExecutionHistoryDisplayInput) {
  return formatExecutionHistoryName(record)
}

/**
 * 相对时间展示（用于执行历史列表）。
 *
 * 转换规则：
 *   - 空值 → '--'。
 *   - 不足 1 分钟 → '刚刚'。
 *   - 不足 60 分钟 → '${diffMin} 分钟前'。
 *   - 不足 24 小时 → '${diffHour} 小时前'。
 *   - 超过 24 小时 → 回退到本地化日期时间格式（formatLocaleDateTime）。
 *
 * @param iso - ISO 8601 时间字符串，可为空。
 * @returns 面向用户的相对时间文案。
 */
export function formatExecutionRelativeTime(iso: string | null | undefined) {
  if (!iso) return '--'
  const d = new Date(iso)
  const now = new Date()
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000)
  if (diffMin < 1) return '刚刚'
  if (diffMin < 60) return `${diffMin} 分钟前`
  const diffHour = Math.floor(diffMin / 60)
  if (diffHour < 24) return `${diffHour} 小时前`
  return formatLocaleDateTime(d)
}