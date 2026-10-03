/**
 * 家庭模式日志标签模块
 *
 * 职责：
 *  - 提供家庭模式触发 / 执行日志的 source / reason 中文标签映射。
 *  - 提供标签查询函数，容忍未知 key。
 *
 * 关键依赖：
 *  - 后端日志写入时使用英文 key（如 "manual" / "trigger"）；
 *  - 前端列表 / 详情页调用本模块函数渲染中文标签。
 *
 * 约定：
 *  - 未知 source 回退为 "其他"；
 *  - 空 source / reason 显示为 "—"。
 */

/**
 * 家庭模式触发 / 执行日志 source → 中文标签映射。
 */
export const HOME_MODE_LOG_SOURCE_LABELS: Record<string, string> = {
  manual: '手动',           // 用户手动切换
  trigger: '触发器',         // 触发器规则命中
  calendar: '日历',          // 日历事件驱动
  deactivate: '停用',        // 模式被停用
  security: '安防',          // 安防联动
  weather_linkage: '天气联动',
  energy_linkage: '能源联动',
  advisor: '智能顾问',
  agent: '智能管家',
  presence: '人员',          // 人员状态变化
  voice: '语音',             // 语音指令
  automation: '自动化',      // 自动化触发
  entity: '实体变化',        // 实体状态变化
  everyone_left: '全员离家', // 全员离家自动切换
  time: '定时',              // 定时计划
}

/**
 * 家庭模式触发 reason → 中文标签映射（部分后端仍写英文 key）。
 */
export const HOME_MODE_LOG_REASON_LABELS: Record<string, string> = {
  automation: '自动化触发',
  manual: '手动切换',
  voice: '语音指令',
  agent: '智能管家',
  trigger: '触发器',
  calendar: '日历事件',
  security: '安防联动',
  weather_linkage: '天气联动',
  energy_linkage: '能源联动',
  advisor: '智能顾问',
  presence: '人员状态',
  entity: '实体变化',
  everyone_left: '全员离家',
  time: '定时计划',
}

/**
 * 获取 source 的中文标签。
 *
 * @param source 日志 source key（如 "manual" / "trigger"）
 * @returns 中文标签；空值返回 "—"，未知 key 返回 "其他"
 */
export function homeModeLogSourceLabel(source: string | null | undefined): string {
  if (!source) return '—'
  return HOME_MODE_LOG_SOURCE_LABELS[source] ?? '其他'
}

/**
 * 获取 reason 的中文标签。
 *
 * @param reason 日志 reason key（英文）
 * @returns 中文标签；空值返回 "—"
 *
 * 策略：
 *  1. 命中映射表 → 返回表中的中文标签；
 *  2. 未命中 → 将下划线替换为空格后返回。
 */
export function homeModeLogReasonLabel(reason: string | null | undefined): string {
  const raw = String(reason || '').trim()
  if (!raw) return '—'
  if (HOME_MODE_LOG_REASON_LABELS[raw]) return HOME_MODE_LOG_REASON_LABELS[raw]
  // 未命中的英文 key 兜底：下划线转空格
  return raw.replace(/_/g, ' ')
}

/** 触发日志聚合结果（前后端分析轨统一口径） */
export interface HomeModeTriggerLogAnalytics {
  sourceBuckets: Array<{ key: string; count: number }>
  dayBuckets: Array<{ date: string; count: number }>
  ok: number
  fail: number
  total: number
}

/** 在（已过滤）日志集合上做聚合 */
export function aggregateHomeModeTriggerLogs(
  logs: Array<{ source?: string | null; success?: boolean | null; executedAt?: string | null }>,
): HomeModeTriggerLogAnalytics {
  const bySource = new Map<string, number>()
  const byDay = new Map<string, number>()
  let ok = 0
  let fail = 0
  for (const row of logs) {
    const src = String(row.source || 'manual')
    bySource.set(src, (bySource.get(src) || 0) + 1)
    if (row.success === false) fail += 1
    else ok += 1
    const day = String(row.executedAt || '').slice(0, 10)
    if (day) byDay.set(day, (byDay.get(day) || 0) + 1)
  }
  const sourceBuckets = [...bySource.entries()]
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)
  const dayBuckets = [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, count]) => ({ date, count }))
  return { sourceBuckets, dayBuckets, ok, fail, total: logs.length }
}