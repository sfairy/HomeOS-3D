/**
 * @file source.ts
 * @module @homeos/shared/notification
 * @brief 通知来源的中文标签 / 筛选 Tab 排序 / 来源归一化与匹配（前后端共用）。
 *
 * 职责：
 *  - 维护通知 source key → 简短中文标签映射；
 *  - 维护筛选 Tab 排序优先级（NOTIFICATION_FILTER_PRIORITY）；
 *  - 提供统计图表用归一化（合并相近来源）与筛选 Tab 用归一化（保留更细粒度）；
 *  - 提供生命安全类通知识别（不受 DND 静音与"重要通知"开关影响）。
 *
 * 关键依赖：
 *  - 后端通知列表 / 统计 API 用本表渲染 source 与 filter；
 *  - 前端通知中心抽屉 / 筛选 Tab 共用本表与排序。
 *
 * 约定：
 *  - source 可为任意字符串（advisor-* / earthquake-* 等带前缀变体）；
 *  - normalizeNotificationSource 用于图表合并；normalizeNotificationFilterKey 用于筛选 Tab；
 *  - isLifeSafetyNotification 是 DND / 重要通知开关的"硬通道路径"。
 */

/**
 * 通知来源 → 简短中文标签（列表 / 抽屉 / 筛选 Tab）。
 * 命中规则：精确匹配 source key；带前缀变体在 notificationSourceLabel 中处理。
 */
export const NOTIFICATION_SOURCE_SHORT_LABELS: Record<string, string> = {
  'alert-rule': '告警',
  system: '系统',
  energy: '能耗',
  'energy-budget': '预算',
  'energy-anomaly': '能耗',
  'water-monitor': '用水',
  'device-monitor': '设备',
  emergency: '紧急',
  'home-mode': '模式',
  automation: '自动化',
  'environment-health': '环境',
  'earthquake-eew': '地震预警',
  'earthquake-catalog': '震情',
  earthquake: '地震',
  security: '安防',
  advisor: '智能顾问',
  hazard: '隐患',
  drill: '演习',
  voice: '语音',
  presence: '人员',
}

const ADVISOR_CATEGORY_LABELS: Record<string, string> = {
  security: '安防顾问',
  env: '环境顾问',
  energy: '能源顾问',
  water: '用水顾问',
  tip: '智能顾问',
}

/** 筛选 Tab 排序（不含 all） */
export const NOTIFICATION_FILTER_PRIORITY = [
  'alert-rule',
  'security',
  'environment-health',
  'earthquake',
  'energy-anomaly',
  'energy-budget',
  'energy',
  'advisor',
  'device-monitor',
  'water-monitor',
  'home-mode',
  'automation',
  'voice',
  'system',
] as const

function advisorSourceLabel(source: string): string | null {
  if (!source.startsWith('advisor-')) return null
  const category = source.slice('advisor-'.length)
  return ADVISOR_CATEGORY_LABELS[category] ?? '智能顾问'
}

/** 统计图表用：合并相近来源 */
export function normalizeNotificationSource(source?: string | null): string {
  const src = String(source || '').trim()
  if (!src || src === 'system') return 'system'
  if (src === 'alert-rule' || src.startsWith('alert-rule')) return 'alert-rule'
  if (src.startsWith('earthquake')) return 'earthquake'
  if (src.startsWith('advisor-')) return 'advisor'
  if (src === 'energy-budget') return 'energy-budget'
  if (src.startsWith('energy')) return 'energy'
  if (
    src === 'emergency' ||
    src.startsWith('security') ||
    src.startsWith('hazard') ||
    src.startsWith('drill')
  ) {
    return 'security'
  }
  if (src.startsWith('environment')) return 'environment-health'
  if (src.startsWith('device')) return 'device-monitor'
  if (src.startsWith('water')) return 'water-monitor'
  if (src.startsWith('home-mode')) return 'home-mode'
  if (src.startsWith('voice')) return 'voice'
  return src
}

/** 筛选 Tab 用：保留更细粒度（如 energy-anomaly） */
export function normalizeNotificationFilterKey(source?: string | null): string {
  const src = String(source || '').trim()
  if (!src || src === 'system') return 'system'
  if (src === 'alert-rule' || src.startsWith('alert-rule')) return 'alert-rule'
  if (src.startsWith('earthquake')) return 'earthquake'
  if (src.startsWith('advisor-')) return 'advisor'
  if (src === 'energy-budget') return 'energy-budget'
  if (src === 'energy-anomaly') return 'energy-anomaly'
  if (src.startsWith('energy')) return 'energy'
  if (
    src === 'emergency' ||
    src.startsWith('security') ||
    src.startsWith('hazard') ||
    src.startsWith('drill')
  ) {
    return 'security'
  }
  if (src.startsWith('environment')) return 'environment-health'
  if (src.startsWith('device')) return 'device-monitor'
  if (src.startsWith('water')) return 'water-monitor'
  if (src.startsWith('home-mode')) return 'home-mode'
  if (src === 'automation') return 'automation'
  if (src.startsWith('voice')) return 'voice'
  return 'system'
}

/**
 * 生命安全 / 紧急类通知：不受「重要通知」开关与普通 DND 静音。
 * - level=danger 一律放行
 * - source 命中安防/紧急/地震预警/用水危急等前缀放行
 */
export function isLifeSafetyNotification(
  level: string | null | undefined,
  source?: string | null,
): boolean {
  if (String(level || '').toLowerCase() === 'danger') return true
  const src = String(source || '').trim().toLowerCase()
  if (!src) return false
  if (src === 'emergency' || src === 'security' || src === 'water-monitor') return true
  if (src.startsWith('security') || src.startsWith('hazard') || src.startsWith('drill')) return true
  if (src.startsWith('earthquake')) return true
  if (src.startsWith('water')) return true
  return false
}

/**
 * 返回通知来源的简短中文标签（列表抽屉/筛选Tab共用）。
 * 对 advisor-*、earthquake-*、energy-* 等带前缀变体做分类合并；未命中的未知来源兜底为「系统」。
 *
 * @param source 通知 source 字符串（可 null/undefined/空串）
 * @returns 中文标签（空或未知源返回「系统」，最长不超过 5 汉字）
 */
export function notificationSourceLabel(source?: string | null): string {
  const src = String(source || '').trim()
  if (!src) return '系统'
  if (NOTIFICATION_SOURCE_SHORT_LABELS[src]) return NOTIFICATION_SOURCE_SHORT_LABELS[src]

  const advisor = advisorSourceLabel(src)
  if (advisor) return advisor

  if (src.startsWith('alert-rule')) return '告警'
  if (src.startsWith('earthquake')) return '地震'
  if (src.startsWith('energy')) return '能耗'
  if (src.startsWith('security') || src.includes('linkage')) return '安防'
  if (src.startsWith('environment')) return '环境'
  if (src.startsWith('device')) return '设备'
  if (src.startsWith('water')) return '用水'
  if (src.startsWith('home-mode')) return '模式'
  if (src.startsWith('voice')) return '语音'
  if (src.startsWith('hazard')) return '隐患'
  if (src.startsWith('drill')) return '演习'
  if (src.startsWith('advisor')) return '智能顾问'
  return '系统'
}

/**
 * 判断给定通知 source 是否匹配前端筛选 Tab 的 filterKey（all/earthquake/security 等）。
 * 主要用于前端通知中心按 Tab 过滤本地列表；对 energy、advisor、earthquake 等带前缀的源做通配匹配。
 *
 * @param source   通知的 source 字段（可 null/undefined/空）
 * @param filterKey 筛选 Tab 的 key（"all" 表示不限制；其余见 NOTIFICATION_FILTER_PRIORITY）
 * @returns true 表示该通知源匹配筛选条件（可在当前 Tab 显示）
 */
export function matchesNotificationSourceFilter(
  source: string | null | undefined,
  filterKey: string,
): boolean {
  if (!filterKey || filterKey === 'all') return true
  const src = String(source || '').trim()
  const normalized = normalizeNotificationFilterKey(src)

  if (filterKey === 'system') {
    return !src || normalized === 'system'
  }
  if (filterKey === 'earthquake') {
    return src.startsWith('earthquake')
  }
  if (filterKey === 'advisor') {
    return src.startsWith('advisor-')
  }
  if (filterKey === 'energy') {
    return src.startsWith('energy') && !src.startsWith('advisor-')
  }
  if (filterKey === 'security') {
    return (
      src === 'emergency' ||
      src.startsWith('security') ||
      src.startsWith('hazard') ||
      src.startsWith('drill')
    )
  }
  if (filterKey === 'device-monitor') {
    return src.startsWith('device')
  }
  if (filterKey === 'environment-health') {
    return src.startsWith('environment')
  }
  if (filterKey === 'water-monitor') {
    return src.startsWith('water')
  }
  if (filterKey === 'home-mode') {
    return src.startsWith('home-mode')
  }
  if (filterKey === 'voice') {
    return src.startsWith('voice')
  }

  return normalized === filterKey || src === filterKey
}

/** 前端筛选 Tab 项（key 用于匹配，label 用于展示中文标题） */
export type NotificationSourceFilter = { key: string; label: string }

/**
 * 从通知数组动态构建前端筛选 Tab（按出现次数 + 优先级排序）。
 * 首个 Tab 固定为「全部」；随后按 NOTIFICATION_FILTER_PRIORITY 顺序加入命中源，再追加超额源按计数排序的结果。
 *
 * @param notifications 通知数组（每项至少含 source 字段，可空）
 * @param options.minCount 最小出现次数（默认 1，低于该阈值的源不加入 Tab；避免极零散项污染 Tab 条）
 * @param options.maxTabs  Tab 总数上限（默认 10，含「全部」项；超额截断避免 Tab 条溢出）
 * @returns NotificationSourceFilter 数组（首项恒为 { key:'all', label:'全部' }，空输入返回仅含全部项的数组）
 */
export function buildNotificationSourceFilters(
  notifications: Array<{ source?: string | null }>,
  options?: { minCount?: number; maxTabs?: number },
): NotificationSourceFilter[] {
  const minCount = options?.minCount ?? 1
  const maxTabs = options?.maxTabs ?? 10
  const counts = new Map<string, number>()

  for (const n of notifications) {
    const key = normalizeNotificationFilterKey(n.source)
    counts.set(key, (counts.get(key) || 0) + 1)
  }

  const filters: NotificationSourceFilter[] = [{ key: 'all', label: '全部' }]
  const used = new Set<string>()

  for (const key of NOTIFICATION_FILTER_PRIORITY) {
    if ((counts.get(key) || 0) >= minCount) {
      filters.push({ key, label: notificationSourceLabel(key) })
      used.add(key)
    }
  }

  const extras = [...counts.entries()]
    .filter(([key, count]) => count >= minCount && !used.has(key))
    .sort((a, b) => b[1] - a[1])

  for (const [key] of extras) {
    if (filters.length >= maxTabs) break
    filters.push({ key, label: notificationSourceLabel(key) })
  }

  return filters
}

/**
 * 后端通知列表/统计接口用的 source 过滤 DSL（传递给数据库查询构建器使用）。
 *  - exact：完全等于 value；
 *  - startsWith：source 以 value 开头（如 earthquake 匹配 earthquake-*）；
 *  - or：子句的逻辑或（用于 security = security* + emergency + hazard* + drill* 组合）。
 */
export type NotificationSourceDbFilter =
  | { kind: 'exact'; value: string }
  | { kind: 'startsWith'; value: string }
  | { kind: 'or'; clauses: Array<{ exact?: string; startsWith?: string }> }

/** 通知统计 / 列表 API 的来源筛选（支持分组 Tab） */
export function buildNotificationSourceDbFilter(filterKey: string): NotificationSourceDbFilter | null {
  if (!filterKey || filterKey === 'all') return null
  if (filterKey === 'earthquake') return { kind: 'startsWith', value: 'earthquake' }
  if (filterKey === 'advisor') return { kind: 'startsWith', value: 'advisor-' }
  if (filterKey === 'energy') return { kind: 'startsWith', value: 'energy' }
  if (filterKey === 'security') {
    return {
      kind: 'or',
      clauses: [
        { startsWith: 'security' },
        { exact: 'emergency' },
        { startsWith: 'hazard' },
        { startsWith: 'drill' },
      ],
    }
  }
  if (filterKey === 'device-monitor') return { kind: 'startsWith', value: 'device' }
  if (filterKey === 'environment-health') return { kind: 'startsWith', value: 'environment' }
  if (filterKey === 'water-monitor') return { kind: 'startsWith', value: 'water' }
  if (filterKey === 'home-mode') return { kind: 'startsWith', value: 'home-mode' }
  if (filterKey === 'voice') return { kind: 'startsWith', value: 'voice' }
  if (filterKey === 'system') return { kind: 'exact', value: 'system' }
  return { kind: 'exact', value: filterKey }
}
