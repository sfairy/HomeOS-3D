/**
 * 仪表盘底栏配置常量与工厂函数
 *
 * 职责：
 * - 维护底栏卡片可选图标、配色与高亮色映射。
 * - 提供底栏项的创建工厂、默认项生成、配置规范化等工具。
 * - 提供底栏卡片主 / 副字段显示名解析（优先自定义 label，否则按字段定义）。
 *
 * 依赖：
 * - @/types/dashboard-footer 类型定义。
 * - @/utils/energy/source.util 与 @/utils/energy/account.util 用于主账户行解析。
 * - @/constants/account-binding-meta 账户绑定元数据。
 *
 * 注意：
 * - `kind`（binding / entity）、`source`（grid / gas / ...）、`color`（yellow / purple / ...）、
 *   `primaryField` / `secondaryField` 等均为配置 key，不翻译。
 * - `icon` 为 emoji，`accent` 为 CSS 颜色值，不翻译。
 */
import { getEntityLeaf } from '@homeos/shared'
import type {
  DashboardFooterColor,
  DashboardFooterConfig,
  DashboardFooterItem,
  DashboardFooterItemPartial,
  FooterFieldOption,
  FooterSourceOption,
} from '@/types/dashboard-footer'
import { normalizeEnergySource } from '@/utils/energy/source.util'
import {
  FOOTER_ACCOUNT_INDEX_ALL,
  resolveAccountDisplayRows,
  resolvePrimaryAccountIndex,
  resolveRawAccountRowCount,
} from '@/utils/energy/account.util'

import { ACCOUNT_BINDING_SOURCE_OPTIONS } from '@/constants/account-binding-meta'

/** 底栏卡片可选图标（emoji） */
export const DASHBOARD_FOOTER_ICONS = [
  '⚡',
  '🔥',
  '💧',
  '📊',
  '📈',
  '📉',
  '📋',
  '📅',
  '💰',
  '💳',
  '💴',
  '💵',
  '📶',
  '📱',
  '📡',
  '🏠',
  '🌡️',
  '🔋',
  '⏱️',
  '🕐',
  '📍',
  '✨',
  '⭐',
  '🌙',
  '☀️',
  '🌧️',
  '💡',
  '🔌',
  '🛁',
  '🚿',
  '🧊',
  '🍳',
  '❄️',
  '♨️',
  '📦',
  '🎯',
] as const
/** 底栏卡片配色 */
export const DASHBOARD_FOOTER_COLORS = [
  'yellow',
  'purple',
  'cyan',
  'green',
  'gold',
  'blue',
  'orange',
  'rose',
  'teal',
] as const
/** 标签高亮色（与卡片配色对应） */
export const DASHBOARD_FOOTER_COLOR_ACCENT: Record<DashboardFooterColor, string> = {
  yellow: '#fbbf24',
  purple: '#c084fc',
  cyan: '#22d3ee',
  green: '#4ade80',
  gold: '#f5d76e',
  blue: '#60a5fa',
  orange: '#fb923c',
  rose: '#fb7185',
  teal: '#2dd4bf',
}

/**
 * 底栏绑定项的 ★ 主账户行索引（未指定 accountIndex 时的回退）。
 *
 * @param item - 底栏项；非 binding 类型固定返回 0。
 * @param statsSensors - 统计传感器映射，用于规范化能源来源。
 * @returns 主账户行索引（0 基）。
 */
function resolveFooterPrimaryAccountIndex(
  item: DashboardFooterItem,
  statsSensors?: Record<string, unknown> | null,
): number {
  if (item.kind !== 'binding') return 0
  const src = normalizeEnergySource(statsSensors, item.source)
  return resolvePrimaryAccountIndex(src, resolveRawAccountRowCount(src) || 1)
}

/**
 * 解析底栏绑定项实际使用的账户索引。
 *
 * - `accountIndex === -1`（FOOTER_ACCOUNT_INDEX_ALL）→ 全部账户合计
 * - 合法非负索引 → 直接使用该账户
 * - 未指定 / 非法 → 回退 ★ 主账户
 */
export function resolveFooterAccountIndex(
  item: DashboardFooterItem,
  statsSensors?: Record<string, unknown> | null,
): number {
  if (item.kind !== 'binding') return 0
  if (typeof item.accountIndex === 'number') {
    if (item.accountIndex === FOOTER_ACCOUNT_INDEX_ALL) return FOOTER_ACCOUNT_INDEX_ALL
    if (Number.isInteger(item.accountIndex) && item.accountIndex >= 0) return item.accountIndex
  }
  return resolveFooterPrimaryAccountIndex(item, statsSensors)
}

/** 底栏账户选择：跟随主账户的 UI 哨兵值（不写入配置） */
const FOOTER_ACCOUNT_SELECT_PRIMARY = 'primary'

type FooterAccountSelectOption = {
  value: string
  label: string
}

/**
 * 生成底栏「数据账户」下拉选项。
 * value: `primary` | `-1` | `0` | `1` | …
 */
export function resolveFooterAccountSelectOptions(
  source: string,
  statsSensors?: Record<string, unknown> | null,
): FooterAccountSelectOption[] {
  const src = normalizeEnergySource(statsSensors, source)
  const rows = resolveAccountDisplayRows(src)
  const primaryIdx = resolvePrimaryAccountIndex(src, resolveRawAccountRowCount(src) || 1)
  const options: FooterAccountSelectOption[] = [
    { value: FOOTER_ACCOUNT_SELECT_PRIMARY, label: '跟随主账户 ★' },
  ]
  for (const row of rows) {
    const star = row.rowIndex === primaryIdx ? ' ★' : ''
    options.push({
      value: String(row.rowIndex),
      label: `${row.label || `账户 ${row.rowIndex + 1}`}${star}`,
    })
  }
  if (rows.length > 1) {
    options.push({
      value: String(FOOTER_ACCOUNT_INDEX_ALL),
      label: '全部账户合计',
    })
  }
  return options
}

/**
 * 将配置中的 accountIndex 转为下拉 value。
 */
export function footerAccountIndexToSelectValue(
  accountIndex: number | undefined | null,
): string {
  if (accountIndex === FOOTER_ACCOUNT_INDEX_ALL) return String(FOOTER_ACCOUNT_INDEX_ALL)
  if (typeof accountIndex === 'number' && Number.isInteger(accountIndex) && accountIndex >= 0) {
    return String(accountIndex)
  }
  return FOOTER_ACCOUNT_SELECT_PRIMARY
}

/**
 * 将下拉 value 写回 accountIndex（primary → undefined）。
 */
export function footerAccountSelectValueToIndex(
  value: string,
): number | undefined {
  if (value === FOOTER_ACCOUNT_SELECT_PRIMARY || value === '') return undefined
  const n = Number(value)
  if (n === FOOTER_ACCOUNT_INDEX_ALL) return FOOTER_ACCOUNT_INDEX_ALL
  if (Number.isInteger(n) && n >= 0) return n
  return undefined
}

/**
 * 底栏是否存在已启用的显示项
 *
 * @param items - 底栏项数组；为空时返回 false。
 * @returns 当任意一项 `enabled` 为 true 时返回 true。
 */
export function hasEnabledFooterItems(items: DashboardFooterItem[] | null | undefined): boolean {
  return (items || []).some((it) => it.enabled)
}

/**
 * 单条底栏项
 *
 * 以默认值合并用户传入的部分字段，生成完整的 DashboardFooterItem。
 *
 * @param partial - 部分字段；未提供时使用默认值。
 * @returns 合并后的完整底栏项（id 缺失时基于时间戳 + 随机数生成）。
 */
export function createFooterItem(partial: DashboardFooterItemPartial = {}): DashboardFooterItem {
  return {
    id: partial.id || `ef-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    enabled: partial.enabled !== false,
    kind: partial.kind || 'binding',
    source: partial.source || 'grid',
    primaryField: partial.primaryField || '',
    secondaryField: partial.secondaryField || '',
    entityId: partial.entityId || '',
    attrName: partial.attrName || '',
    label: partial.label || '',
    secondaryLabel: partial.secondaryLabel || partial.subLabel || '',
    unit: partial.unit || '',
    icon: partial.icon || '⚡',
    color: partial.color || 'yellow',
    showProgress: !!partial.showProgress,
    progressMax: partial.progressMax ?? 200,
    // 未指定时跟随 ★ 主账户（勿默认写 0，否则主账户非首行时读错）
    ...(typeof partial.accountIndex === 'number' ? { accountIndex: partial.accountIndex } : {}),
  }
}
/**
 * 默认底栏项（对齐原 Dashboard 硬编码 7 卡）
 *
 * @returns 默认底栏项数组，覆盖电网日 / 月 / 上月 / 年 / 余额 / 数据日期。
 */
export function createDefaultDashboardFooterItems(): DashboardFooterItem[] {
  return [
    createFooterItem({
      id: 'ef-grid-daily',
      source: 'grid',
      primaryField: 'dailyNum',
      secondaryField: 'dailyCost',
      icon: '⚡',
      color: 'yellow',
    }),
    createFooterItem({
      id: 'ef-grid-month',
      source: 'grid',
      primaryField: 'monthNum',
      secondaryField: 'monthCost',
      icon: '📊',
      color: 'purple',
    }),
    createFooterItem({
      id: 'ef-grid-last-month',
      source: 'grid',
      primaryField: 'lastMonthNum',
      secondaryField: 'lastMonthCost',
      icon: '📋',
      color: 'cyan',
    }),
    createFooterItem({
      id: 'ef-grid-year',
      source: 'grid',
      primaryField: 'yearNum',
      secondaryField: 'yearCost',
      icon: '📈',
      color: 'green',
    }),
    createFooterItem({
      id: 'ef-grid-balance',
      source: 'grid',
      primaryField: 'balance',
      icon: '💰',
      color: 'gold',
      showProgress: true,
      progressMax: 200,
    }),
    createFooterItem({
      id: 'ef-grid-date',
      source: 'grid',
      primaryField: 'dailyDate',
      icon: '📅',
      color: 'blue',
    }),
  ]
}
/**
 * 创建默认的仪表盘底栏配置（已启用 + 默认项列表）。
 *
 * @returns 默认 DashboardFooterConfig 对象。
 */
export function createDefaultDashboardFooter(): DashboardFooterConfig {
  return {
    enabled: true,
    items: createDefaultDashboardFooterItems(),
  }
}
/** 快速添加预设 */
export const DASHBOARD_FOOTER_PRESETS: DashboardFooterItemPartial[] = [
  {
    key: 'grid-daily',
    source: 'grid',
    primaryField: 'dailyNum',
    secondaryField: 'dailyCost',
    icon: '⚡',
    color: 'yellow',
  },
  {
    key: 'grid-month',
    source: 'grid',
    primaryField: 'monthNum',
    secondaryField: 'monthCost',
    icon: '📊',
    color: 'purple',
  },
  {
    key: 'grid-balance',
    source: 'grid',
    primaryField: 'balance',
    icon: '💰',
    color: 'gold',
    showProgress: true,
  },
  { key: 'gas-balance', source: 'gas', primaryField: 'balance', icon: '🔥', color: 'orange' },
  {
    key: 'gas-month',
    source: 'gas',
    primaryField: 'monthNum',
    secondaryField: 'monthCost',
    icon: '🔥',
    color: 'orange',
  },
  { key: 'water-balance', source: 'water', primaryField: 'balance', icon: '💧', color: 'cyan' },
  { key: 'ct-balance', source: 'ct', primaryField: 'balance', icon: '📶', color: 'blue' },
  { key: 'ct-data', source: 'ct', primaryField: 'dataRemaining', icon: '📶', color: 'teal' },
  { key: 'cu-balance', source: 'cu', primaryField: 'balance', icon: '📱', color: 'purple' },
  { key: 'cu-data', source: 'cu', primaryField: 'dataRemaining', icon: '📱', color: 'teal' },
  { key: 'entity-custom', kind: 'entity', icon: '📡', color: 'rose' },
]
/**
 * 规范化底栏配置：合并默认值、校验 items 数组。
 *
 * @param raw - 用户输入的部分配置；为空或非对象时返回默认配置。
 * @returns 合并并清洗后的完整 DashboardFooterConfig。
 */
export function normalizeDashboardFooter(
  raw: Partial<DashboardFooterConfig> | null | undefined,
): DashboardFooterConfig {
  const base = createDefaultDashboardFooter()
  if (!raw || typeof raw !== 'object') return base
  const items =
    Array.isArray(raw.items) && raw.items.length
      ? raw.items.map((it) => createFooterItem(it))
      : base.items
  return {
    enabled: raw.enabled !== false,
    items,
  }
}
/**
 * 底栏卡片 / 设置 Tab 显示名：优先自定义 label，否则「类别·字段」
 *
 * @param item - 底栏项。
 * @param idx - 项在列表中的索引（用于回退编号）。
 * @param fieldOptionsFn - 根据 source 返回字段选项的函数。
 * @param sourceOptions - 账户源选项列表。
 * @param statsSensors - 统计传感器映射（可选）。
 * @returns 显示名；依次回退到主字段标签、entity_id 末段、`HA 实体`、`#索引`。
 */
export function resolveFooterItemLabel(
  item: DashboardFooterItem,
  idx: number,
  fieldOptionsFn: (source: string) => FooterFieldOption[],
  sourceOptions: FooterSourceOption[],
  statsSensors?: Record<string, unknown> | null,
): string {
  if (item.label?.trim()) {
    return item.label.trim()
  }
  const base = resolveFooterPrimaryLabel(item, fieldOptionsFn, statsSensors, sourceOptions)
  if (base) return base
  if (item.kind === 'entity') {
    const eid = item.entityId ? getEntityLeaf(item.entityId) : ''
    if (eid) return eid
    return 'HA 实体'
  }
  return `#${idx + 1}`
}

/**
 * 底栏卡片主字段说明（主数值下方左侧）：优先自定义 label，否则按主字段定义
 *
 * @param item - 底栏项。
 * @param fieldOptionsFn - 根据 source 返回字段选项的函数。
 * @param statsSensors - 统计传感器映射（可选）。
 * @param sourceOptions - 账户源选项列表，默认使用 ACCOUNT_BINDING_SOURCE_OPTIONS。
 * @returns 主字段显示名；电网仅返回字段标签，其余类别返回「源·字段」格式。
 */
export function resolveFooterPrimaryLabel(
  item: DashboardFooterItem,
  fieldOptionsFn: (source: string) => FooterFieldOption[],
  statsSensors?: Record<string, unknown> | null,
  sourceOptions: FooterSourceOption[] = ACCOUNT_BINDING_SOURCE_OPTIONS as FooterSourceOption[],
): string {
  if (item.label?.trim()) {
    return item.label.trim()
  }
  if (item.kind === 'binding' && item.primaryField) {
    const fields = fieldOptionsFn(item.source)
    const primary = fields.find((f) => f.value === item.primaryField)
    const src = sourceOptions.find((s) => s.value === item.source)
    if (src && primary) {
      return item.source === 'grid' ? primary.label : `${src.label}·${primary.label}`
    }
    if (primary) return primary.label
    if (src) return src.label
  }
  if (item.kind === 'entity') {
    const eid = item.entityId ? getEntityLeaf(item.entityId) : ''
    if (eid) return eid
    return 'HA 实体'
  }
  return ''
}

/**
 * 底栏卡片副字段显示名：优先 secondaryLabel，否则副字段定义名
 *
 * @param item - 底栏项。
 * @param fieldOptionsFn - 根据 source 返回字段选项的函数。
 * @returns 副字段显示名；无副字段时返回空字符串。
 */
export function resolveFooterSecondaryLabel(
  item: DashboardFooterItem,
  fieldOptionsFn: (source: string) => FooterFieldOption[],
): string {
  if (!item.secondaryField?.trim()) return ''
  if (item.secondaryLabel?.trim()) return item.secondaryLabel.trim()
  const fields = fieldOptionsFn(item.source)
  const secondary = fields.find((f) => f.value === item.secondaryField)
  return secondary?.label || ''
}
