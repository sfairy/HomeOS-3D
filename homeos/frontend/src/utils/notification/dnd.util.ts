/**
 * 勿扰模式（DND）工具。
 *
 * 核心判定 / 默认窗口 / 时长计算以 @homeos/shared 为唯一源；
 * 本文件保留 FE UI 辅助（格式化、预设、滑块样式、设置解析）。
 */
import {
  DEFAULT_DND_START,
  DEFAULT_DND_END,
  isDndActive,
  dndDurationHours,
} from '@homeos/shared'
import { sliderTrackStyle } from '@/utils/ui/progress-bar.util'
import type { DndPreset, NotificationSettingsParsed } from '@/types/alert-rules'

/** 前端 UI 滑块预览语义别名：与 shared isDndActive 行为完全一致，仅命名贴合预览场景 */
export const isHourInDnd = isDndActive
export { DEFAULT_DND_START, DEFAULT_DND_END, dndDurationHours }

/**
 * 通知偏好默认值与解析：全局开关、勿扰时段等配置归一化。
 */
const DEFAULT_NOTIFY_PREFS: NotificationSettingsParsed = {
  globalNotifyEnabled: true,
  importantNotifyEnabled: true,
  offlineNotifyEnabled: true,
  lowBatteryNotifyEnabled: true,
  dndStart: DEFAULT_DND_START,
  dndEnd: DEFAULT_DND_END,
  dndActive: false,
}

/**
 * 将后端返回的通知设置数据解析为结构化偏好。
 * 各布尔开关缺省视为 true；勿扰时段缺省取 shared 默认值。
 */
export function parseNotificationSettings(data: unknown): NotificationSettingsParsed {
  if (!data || typeof data !== 'object') return { ...DEFAULT_NOTIFY_PREFS }
  const row = data as Record<string, unknown>
  return {
    globalNotifyEnabled: row.globalNotifyEnabled !== false,
    importantNotifyEnabled: row.importantNotifyEnabled !== false,
    offlineNotifyEnabled: row.offlineNotifyEnabled !== false,
    lowBatteryNotifyEnabled: row.lowBatteryNotifyEnabled !== false,
    dndStart: Number(row.dndStart ?? DEFAULT_DND_START),
    dndEnd: Number(row.dndEnd ?? DEFAULT_DND_END),
    dndActive: !!row.dndActive,
  }
}

/** 勿扰预设列表：夜间休息 / 深度睡眠 / 午休 / 晚间静默 */
export const DND_PRESETS: DndPreset[] = [
  { id: 'night', label: '夜间休息', start: 22, end: 7 },
  { id: 'deep', label: '深度睡眠', start: 23, end: 8 },
  { id: 'nap', label: '午休', start: 12, end: 14 },
  { id: 'evening', label: '晚间静默', start: 21, end: 9 },
]

/**
 * 将小时数格式化为 HH:00 字符串。
 */
export function formatHour(h: number) {
  const n = Number(h)
  if (!Number.isFinite(n)) return '00:00'
  return `${String(Math.max(0, Math.min(23, Math.floor(n)))).padStart(2, '0')}:00`
}

/**
 * 生成勿扰时段的可读标签。
 */
export function dndRangeLabel(start: number, end: number) {
  const s = formatHour(start)
  const e = formatHour(end)
  if (start > end) return `${s} → 次日 ${e}`
  if (start === end) return `${s} → 全天静默`
  return `${s} → ${e}`
}

/**
 * 计算勿扰滑块的轨道样式。
 */
export function dndRangeStyle(value: number) {
  return sliderTrackStyle({
    value: Math.max(0, Math.min(23, Number(value) || 0)),
    min: 0,
    max: 23,
    step: 1,
    color: 'rgba(251,191,36,0.55)',
    colorEnd: 'rgba(251,191,36,0.85)',
  })
}
