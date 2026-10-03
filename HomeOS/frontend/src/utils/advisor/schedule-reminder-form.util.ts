/**
 * 日程提醒表单工具
 *
 * 所属模块：日程 / 提醒（Schedule Reminder）
 * 职责：定义提醒类型 / 频率 / 图标 / 快捷模板等常量；提供表单状态默认值、
 *   表单 ↔ payload 转换、可提交校验、频率 / 类型标签格式化、预设进度计算等。
 * 依赖：无外部依赖，纯函数 + 常量工具。
 */

/** 提醒类型枚举（id 用于存储，label / color 用于 UI 展示） */
export const REMINDER_TYPES = [
  { id: 'recycle', label: '垃圾 / 回收', color: '#3b82f6' },
  { id: 'cleaning', label: '清洁', color: '#a78bfa' },
  { id: 'maintenance', label: '设备维护', color: '#f59e0b' },
  { id: 'medication', label: '健康 / 用药', color: '#ec4899' },
  { id: 'custom', label: '自定义', color: '#f97316' },
] as const

/** 提醒图标候选列表（表单选择器用） */
export const REMINDER_ICON_OPTIONS = [
  '📌',
  '♻️',
  '🍂',
  '🗑️',
  '🧹',
  '🛏️',
  '💧',
  '🔧',
  '🤖',
  '❄️',
  '💊',
  '🐱',
  '🛁',
  '🏥',
  '🔔',
]

/** 提醒快捷模板：一键填充表单的预置场景 */
export const REMINDER_QUICK_TEMPLATES = [
  {
    label: '可回收垃圾',
    icon: '♻️',
    type: 'recycle',
    frequency: 'weekly',
    dayOfWeek: 2,
    customDaysText: '',
    color: '#3b82f6',
  },
  {
    label: '周末大扫除',
    icon: '🧹',
    type: 'cleaning',
    frequency: 'weekly',
    dayOfWeek: 6,
    customDaysText: '',
    color: '#a78bfa',
  },
  {
    label: '净水器滤芯',
    icon: '💧',
    type: 'maintenance',
    frequency: 'monthly',
    dayOfWeek: 0,
    customDaysText: '1',
    color: '#38bdf8',
  },
  {
    label: '体内驱虫',
    icon: '💊',
    type: 'medication',
    frequency: 'monthly',
    dayOfWeek: 0,
    customDaysText: '1',
    color: '#ec4899',
  },
]

/** 频率选项（value 用于存储，label 用于下拉展示） */
export const REMINDER_FREQ_OPTIONS = [
  { value: 'daily', label: '每天' },
  { value: 'weekly', label: '每周' },
  { value: 'biweekly', label: '双周' },
  { value: 'monthly', label: '每月' },
]

/** 预设提醒的元信息（emoji + accent 色） */
const REMINDER_PRESET_META: Record<string, { emoji: string; accent: string }> = {
  'waste-sorting': { emoji: '♻️', accent: '#22c55e' },
  'household-cleaning': { emoji: '🧹', accent: '#a78bfa' },
  'device-maintenance': { emoji: '🔧', accent: '#f59e0b' },
}

/** 频率 id → 中文标签映射 */
const FREQ_LABELS: Record<string, string> = {
  daily: '每天',
  weekly: '每周',
  biweekly: '双周',
  monthly: '每月',
  custom: '自定义',
}

/** 星期标签：索引 0 = 周日，1 = 周一，… 6 = 周六 */
const DOW_LABELS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
/** REMINDER_DOW_LABELS：常量，取值语义见定义处。 */
export const REMINDER_DOW_LABELS = DOW_LABELS
/** 月内日期快捷选择候选 */
export const REMINDER_MONTH_DAY_QUICK = [1, 5, 10, 15, 20, 28]
/**
 * 解析自定义天数文本为数字数组。
 *
 * @param text 用户输入的天数文本，支持空格 / 逗号 / 分号（中英文）分隔
 * @returns 去重前有效的日期数字（1–31）数组
 */
export function parseReminderCustomDays(text: string): number[] {
  return String(text || '')
    .split(/[\s,，;；]+/)
    .map((s) => parseInt(s, 10))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 31)
}

/**
 * 将天数数组格式化为展示文本（去重 + 升序 + 逗号连接）。
 *
 * @param days 天数数组
 * @returns 形如 "1,15,28" 的文本
 */
export function formatReminderCustomDaysText(days: number[]): string {
  return [...new Set(days)].sort((a, b) => a - b).join(',')
}

/**
 * 根据类型 id 返回展示标签。
 *
 * @param type 提醒类型 id
 * @returns 对应的中文标签；未知类型回退为 '自定义'
 */
export function reminderTypeLabel(type: string): string {
  return REMINDER_TYPES.find((t) => t.id === type)?.label ?? '自定义'
}

/**
 * 格式化提醒的频率展示标签（含星期 / 月内日期 / 提醒时间后缀）。
 *
 * @param item.frequency 频率 id
 * @param item.dayOfWeek 星期索引（0=周日）；仅 weekly / biweekly 时追加
 * @param item.customDays 月内日期数组；仅 monthly 时追加
 * @param item.scheduleLabel 自定义调度标签；存在时直接返回，跳过格式化
 * @param item.time 提醒时间 HH:MM；存在时追加 " · HH:MM"
 * @returns 形如 "每周 周二 · 07:00" / "每月 1、15 号 · 21:30" 的展示文本
 */
export function reminderFreqLabel(item: {
  frequency?: string
  dayOfWeek?: number | null
  customDays?: number[]
  scheduleLabel?: string
  time?: string
}): string {
  if (item.scheduleLabel) return item.scheduleLabel
  const freq = item.frequency || 'weekly'
  let label = FREQ_LABELS[freq] ?? freq
  if ((freq === 'weekly' || freq === 'biweekly') && item.dayOfWeek != null) {
    label += ` ${DOW_LABELS[item.dayOfWeek] ?? ''}`
  }
  if (freq === 'monthly' && Array.isArray(item.customDays) && item.customDays.length) {
    label += ` ${item.customDays.join('、')} 号`
  }
  if (item.time) label += ` · ${item.time}`
  return label.trim()
}

/**
 * 获取预设提醒的元信息（emoji + accent 色）。
 *
 * @param id 预设 id
 * @returns 元信息对象；未知预设回退为 { emoji: '📅', accent: '#f97316' }
 */
export function reminderPresetMeta(id: string) {
  return REMINDER_PRESET_META[id] || { emoji: '📅', accent: '#f97316' }
}

/**
 * 计算预设的应用进度百分比。
 *
 * @param preset.itemCount 预设总条目数
 * @param preset.appliedCount 已应用条目数
 * @returns 0–100 的整数百分比；itemCount 为 0 时返回 0
 */
export function reminderPresetProgress(preset: { itemCount?: number; appliedCount?: number }) {
  if (!preset.itemCount) return 0
  return Math.round(((preset.appliedCount ?? 0) / preset.itemCount) * 100)
}

/**
 * 获取预设提醒的 accent 色。
 *
 * @param id 预设 id
 * @returns accent 色值（十六进制）
 */
export function reminderPresetAccent(id: string) {
  return reminderPresetMeta(id).accent
}

/**
 * 按频率统计提醒数量。
 *
 * @param reminders 提醒列表（每项含可选 frequency）
 * @returns { total, byFreq } 总数与各频率计数（daily / weekly / biweekly / monthly）
 */
export function buildScheduleStats(reminders: Array<{ frequency?: string }> | null | undefined) {
  const byFreq = { daily: 0, weekly: 0, biweekly: 0, monthly: 0 }
  for (const r of reminders || []) {
    const f = r.frequency || 'weekly'
    if (f in byFreq) byFreq[f as keyof typeof byFreq]++
  }
  return { total: reminders?.length ?? 0, byFreq }
}
/** 提醒表单状态形状 */
interface ReminderFormState {
  type: string
  label: string
  icon: string
  frequency: string
  dayOfWeek: number
  customDays: number[]
  customDaysText: string
  color: string
  time: string
}

/**
 * 返回表单默认状态（新建提醒时的初始值）。
 *
 * @returns 默认表单状态：类型 custom、频率 weekly、星期一、07:00、橙色
 */
export function defaultReminderFormState(): ReminderFormState {
  return {
    type: 'custom',
    label: '',
    icon: '📌',
    frequency: 'weekly',
    dayOfWeek: 1,
    customDays: [],
    customDaysText: '',
    color: '#f97316',
    time: '07:00',
  }
}

/**
 * 将表单状态转换为提交 payload（仅 monthly 时解析 customDays，其余清空）。
 *
 * @param form 表单状态
 * @returns 可提交的提醒对象（含 type / label / icon / frequency / dayOfWeek / customDays / color / time）
 */
export function reminderPayloadFromForm(form: ReminderFormState) {
  const freq = form.frequency
  const customDays = freq === 'monthly' ? parseReminderCustomDays(form.customDaysText) : []
  return {
    type: form.type,
    label: form.label.trim(),
    icon: form.icon,
    frequency: freq,
    dayOfWeek: form.dayOfWeek,
    customDays,
    color: form.color,
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(form.time) ? form.time : '07:00',
  }
}

/**
 * 校验表单是否可提交：label 非空；monthly 时 customDaysText 至少解析出一天。
 *
 * @param form 表单状态
 * @returns true 表示可提交
 */
export function canSubmitReminderForm(form: ReminderFormState): boolean {
  if (!form.label.trim()) return false
  if (form.frequency === 'monthly' && !parseReminderCustomDays(form.customDaysText).length)
    return false
  return true
}

/**
 * 从已有提醒条目回填表单状态（编辑场景用）。
 *
 * @param item 已有提醒条目（各字段可选）
 * @returns 表单状态，缺失字段使用默认值
 */
export function reminderFormFromItem(item: {
  id?: string
  type?: string
  label?: string
  icon?: string
  frequency?: string
  dayOfWeek?: number | null
  customDays?: number[]
  color?: string
  time?: string
}): ReminderFormState {
  const customDays = Array.isArray(item.customDays) ? item.customDays : []
  return {
    type: item.type || 'custom',
    label: item.label || '',
    icon: item.icon || '📌',
    frequency: item.frequency || 'weekly',
    dayOfWeek: item.dayOfWeek ?? 1,
    customDays,
    customDaysText: customDays.length ? formatReminderCustomDaysText(customDays) : '',
    color: item.color || '#f97316',
    time: /^([01]\d|2[0-3]):[0-5]\d$/.test(item.time || '') ? (item.time as string) : '07:00',
  }
}