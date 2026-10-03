/**
 * 安防事件展示工具模块。
 *
 * 职责：
 * - 将后端 SecurityEvent 行映射为安防页展示项（图标 key、CSS 类、标签、时间）；
 * - 识别联动失败类事件类型，统一标记为「联动失败」；
 * - 提供事件过滤（按类型/区域/联动失败）与近期联动失败筛选能力；
 * - 映射事件 CSS 类到审计日志 modifier key。
 *
 * 依赖：formatSecurityTime（locale-format 时间格式化）。
 */
/** 安防 SecurityEvent 类型 → 展示元数据（图标 key 由视图层映射为组件） */
import { formatSecurityTime } from '@/utils/format/locale-format.util'

/**
 * 已知的联动失败事件类型集合。
 * 以 linkage_ 或 away_sim_ 开头且包含 failed 的类型也视为联动失败。
 */
const SECURITY_EVENT_LINKAGE_TYPES = [
  'linkage_auto_arm_failed',
  'linkage_away_sim_failed',
  'linkage_home_mode_failed',
  'linkage_action_failed',
  'emergency_action_failed',
  'away_sim_enable_failed',
  'away_sim_action_failed',
]

/**
 * 判定事件类型是否属于联动失败。
 *
 * @param type 事件类型字符串
 * @returns true 表示联动失败类事件
 */
function isSecurityLinkageFailureType(type: string | null | undefined) {
  if (!type) return false
  if (SECURITY_EVENT_LINKAGE_TYPES.includes(type)) return true
  // 兜底：未知联动/离家模拟失败类型也按联动失败处理
  return type.startsWith('linkage_') || (type.startsWith('away_sim_') && type.includes('failed'))
}

/** 安防事件类型展示元数据：图标 key、CSS 类、短标签 */
type SecurityEventTypeMeta = { iconKey: string; css: string; shortLabel: string }

/**
 * 事件类型 → 展示元数据映射表。
 * CSS 类名保持原样（视图层样式钩子），不翻译。
 */
const TYPE_META: Record<string, SecurityEventTypeMeta> = {
  arm: { iconKey: 'shield', css: 'sec-event-item--mode', shortLabel: '布防' },
  disarm: { iconKey: 'shieldOff', css: 'sec-event-item--mode', shortLabel: '撤防' },
  alarm: { iconKey: 'alert', css: 'sec-event-item--danger', shortLabel: '告警' },
  hazard: { iconKey: 'alert', css: 'sec-event-item--danger', shortLabel: '危险传感器' },
  emergency: { iconKey: 'siren', css: 'sec-event-item--danger', shortLabel: '紧急' },
  false_alarm_feedback: {
    iconKey: 'shieldCheck',
    css: 'sec-event-item--ok',
    shortLabel: '误报反馈',
  },
  linkage_auto_arm_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  linkage_away_sim_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  linkage_home_mode_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  linkage_action_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  emergency_action_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  away_sim_enable_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
  away_sim_action_failed: {
    iconKey: 'wifiOff',
    css: 'sec-event-item--danger',
    shortLabel: '联动失败',
  },
}

/**
 * 根据事件类型解析展示元数据。
 *
 * @param type 事件类型
 * @returns 元数据对象；未知联动失败类型返回统一「联动失败」元数据，其余返回默认「事件」
 */
function metaForType(type: string) {
  if (TYPE_META[type]) return TYPE_META[type]
  if (isSecurityLinkageFailureType(type)) {
    return { iconKey: 'wifiOff', css: 'sec-event-item--danger', shortLabel: '联动失败' }
  }
  return { iconKey: 'bell', css: 'sec-event-item--sensor', shortLabel: '事件' }
}

/**
 * 格式化安防事件时间。
 *
 * @param createdAt 创建时间（Date/字符串/时间戳）
 * @returns 格式化后的时间字符串
 */
function formatSecurityEventTime(createdAt: Date | string | number | null | undefined) {
  return formatSecurityTime(createdAt)
}

/**
 * 将 API 返回的 SecurityEvent 行映射为安防页展示项。
 *
 * zones 字段可能为 JSON 字符串或数组，统一解析为 zone ID 列表。
 *
 * @param raw 原始 zones 数据
 * @returns zone ID 数组；解析失败返回空数组
 */
function parseEventZones(raw: unknown): string[] {
  if (!raw) return []
  try {
    const parsed = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!Array.isArray(parsed)) return []
    return parsed
      .map((z) => (typeof z === 'string' ? z : (z as { id?: string })?.id))
      .filter((z): z is string => Boolean(z))
  } catch {
    return []
  }
}

/** 后端 SecurityEvent 行结构 */
type SecurityEventRow = {
  id?: string
  type?: string
  createdAt?: string | number | Date
  detail?: string
  zones?: unknown
}

/** 安防页展示项类型 */
export type SecurityEventDisplayItem = {
  id: string
  type: string
  iconKey: string
  label: string
  time: string
  css: string
  ts: number
  zoneIds: string[]
  linkageFailure: boolean
  fromDb: boolean
}

/**
 * 将单条 SecurityEvent 行映射为展示项。
 *
 * @param row 后端事件行
 * @returns 展示项；label 优先用 detail，无 detail 时用类型短标签
 */
export function mapSecurityEventRow(row: SecurityEventRow | null | undefined): SecurityEventDisplayItem {
  const type = row?.type || 'event'
  const meta = metaForType(type)
  const createdAt = row?.createdAt
  const ts = createdAt ? new Date(createdAt).getTime() : 0
  const detail = String(row?.detail || '').trim()
  // label 优先使用 detail 文案，无 detail 时回退到类型短标签
  const label = detail || meta.shortLabel
  const zoneIds = parseEventZones(row?.zones)
  return {
    id: row?.id || `${type}-${ts}`,
    type,
    iconKey: meta.iconKey,
    label,
    time: formatSecurityEventTime(createdAt),
    css: meta.css,
    ts,
    zoneIds,
    linkageFailure: isSecurityLinkageFailureType(type),
    fromDb: true,
  }
}

/**
 * 按过滤器筛选安防事件。
 *
 * 支持的 filter 值：
 * - 'all' 或空：返回全部；
 * - 'zone:<zoneId>'：按区域筛选；
 * - 'linkage'：仅返回联动失败事件；
 * - 其他字符串：按事件类型精确匹配。
 *
 * @param events 展示项列表
 * @param filter 过滤器字符串
 * @returns 过滤后的列表
 */
export function filterSecurityEvents(
  events: SecurityEventDisplayItem[],
  filter: string | null | undefined,
) {
  if (!filter || filter === 'all') return events
  if (typeof filter === 'string' && filter.startsWith('zone:')) {
    const zoneId = filter.slice(5)
    return events.filter((e) => e.zoneIds?.includes(zoneId))
  }
  if (filter === 'linkage') return events.filter((e) => e.linkageFailure)
  return events.filter((e) => e.type === filter)
}

/**
 * 筛选指定时间窗口内的近期联动失败事件。
 *
 * @param events 展示项列表
 * @param withinMs 时间窗口毫秒数，默认 24 小时
 * @returns 时间窗口内的联动失败事件
 */
export function recentLinkageFailures(
  events: SecurityEventDisplayItem[],
  withinMs = 24 * 60 * 60 * 1000,
) {
  const cutoff = Date.now() - withinMs
  return events.filter((e) => e.linkageFailure && e.ts >= cutoff)
}

/**
 * 将安防事件 CSS 类名映射为审计日志 modifier key。
 *
 * @param css 事件 CSS 类名
 * @returns modifier key：danger/mode/ok/default
 */
export function securityEventCssKey(css: string) {
  if (css.includes('danger')) return 'danger'
  if (css.includes('mode')) return 'mode'
  if (css.includes('ok')) return 'ok'
  return 'default'
}