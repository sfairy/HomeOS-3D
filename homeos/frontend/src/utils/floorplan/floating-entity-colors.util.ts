/**
 * 户型图浮动实体卡片配色工具
 *
 * 职责：
 * - 维护浮动卡片主题（AfhThemeId）及其强调色 / 渐变定义。
 * - 提供主题色、实体语义色、自定义字段色的合成与解析工具。
 * - 处理 HEX 颜色规范化、透明度叠加与亮度判定，供浮动卡片渲染共用。
 *
 * 依赖：
 * - @homeos/shared 的 getEntityDomain。
 * - @/constants/entity-domain-meta 的 entityDomainColor 域语义色。
 * - @/composables/entity/useEntityType 的能源类别判定。
 *
 * 注意：
 * - `AfhThemeId`（glass / auto / neon-purple / ...）为主题 key，不翻译。
 * - `accent` / `gradient` / HEX 颜色值为 CSS 颜色，不翻译。
 * - 仅面向用户的 label 使用简体中文。
 */
import { getEntityDomain } from '@homeos/shared'
import type { FloatingWidget, FloatingWidgetConfig } from '@/types/layout'
import { entityDomainColor } from '@/constants/entity-domain-meta'
import {
  isCommEntity,
  isElectricityEntity,
  isGasEntity,
  isWaterEntity,
} from '@/composables/entity/useEntityType'

interface EntityFloatingCustomColors {
  enabled: boolean
  accent: string
  label: string
  value: string
}

type AfhThemeId =
  | 'glass'
  | 'auto'
  | 'neutral'
  | 'neon-purple'
  | 'neon-cyan'
  | 'neon-amber'
  | 'neon-blue'
  | 'emerald'
  | 'rose-glow'
  | 'cyber-red'
  | 'sunset'

export type AfhThemeDef = {
  id: AfhThemeId
  label: string
  accent: string
  gradient: string
}

const HEX6 = /^#?[0-9a-fA-F]{6}$/
const HEX3 = /^#?[0-9a-fA-F]{3}$/

/** 浮动卡片主题强调色（与设置色板、实卡 CSS 共用） */
const AFH_THEME_ACCENT: Record<AfhThemeId, string> = {
  glass: '#94a3b8',
  auto: '#fbbf24',
  neutral: '#94a3b8',
  'neon-purple': '#c084fc',
  'neon-cyan': '#22d3ee',
  'neon-amber': '#fbbf24',
  'neon-blue': '#60a5fa',
  emerald: '#34d399',
  'rose-glow': '#fb7185',
  'cyber-red': '#f87171',
  sunset: '#fb923c',
}

/** 设置页主题色板（不含历史别名 neon-blue） */
export const AFH_THEME_DEFS: AfhThemeDef[] = [
  {
    id: 'auto',
    label: '语义色',
    accent: AFH_THEME_ACCENT.auto,
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #22d3ee 38%, #fb923c 68%, #c084fc 100%)',
  },
  {
    id: 'neutral',
    label: '中性',
    accent: AFH_THEME_ACCENT.neutral,
    gradient: 'linear-gradient(135deg, rgba(255,255,255,0.35), rgba(148,163,184,0.12))',
  },
  {
    id: 'neon-amber',
    label: '琥珀',
    accent: AFH_THEME_ACCENT['neon-amber'],
    gradient: 'linear-gradient(135deg, #fbbf24, #f59e0b)',
  },
  {
    id: 'sunset',
    label: '日落',
    accent: AFH_THEME_ACCENT.sunset,
    gradient: 'linear-gradient(135deg, #fb923c, #f97316)',
  },
  {
    id: 'neon-cyan',
    label: '青霓虹',
    accent: AFH_THEME_ACCENT['neon-cyan'],
    gradient: 'linear-gradient(135deg, #67e8f9, #22d3ee)',
  },
  {
    id: 'neon-purple',
    label: '紫霓虹',
    accent: AFH_THEME_ACCENT['neon-purple'],
    gradient: 'linear-gradient(135deg, #e9d5ff, #c084fc)',
  },
  {
    id: 'emerald',
    label: '翡翠',
    accent: AFH_THEME_ACCENT.emerald,
    gradient: 'linear-gradient(135deg, #34d399, #2dd4bf)',
  },
  {
    id: 'rose-glow',
    label: '玫红',
    accent: AFH_THEME_ACCENT['rose-glow'],
    gradient: 'linear-gradient(135deg, #fb7185, #f43f5e)',
  },
  {
    id: 'cyber-red',
    label: '猩红',
    accent: AFH_THEME_ACCENT['cyber-red'],
    gradient: 'linear-gradient(135deg, #f87171, #dc2626)',
  },
]

/** 自定义颜色快捷预设：电 / 气 / 水 / 讯 */
export const AFH_SEMANTIC_COLOR_PRESETS = [
  { id: 'grid', label: '电', accent: '#fbbf24' },
  { id: 'gas', label: '气', accent: '#fb923c' },
  { id: 'water', label: '水', accent: '#22d3ee' },
  { id: 'comm', label: '讯', accent: '#c084fc' },
] as const

const METRIC_THEME: Record<string, AfhThemeId> = {
  temp: 'sunset',
  humidity: 'neon-cyan',
  battery: 'emerald',
  power: 'neon-amber',
  aqi: 'emerald',
}

const DOMAIN_THEME: Record<string, AfhThemeId> = {
  light: 'neon-amber',
  switch: 'neon-blue',
  input_boolean: 'neon-cyan',
  button: 'neon-blue',
  climate: 'neon-cyan',
  fan: 'neon-cyan',
  water_heater: 'sunset',
  cover: 'neon-purple',
  humidifier: 'neon-cyan',
  lock: 'neon-amber',
  vacuum: 'neon-purple',
  camera: 'rose-glow',
  media_player: 'neon-purple',
  sensor: 'emerald',
  binary_sensor: 'emerald',
  alarm_control_panel: 'cyber-red',
  siren: 'rose-glow',
  valve: 'emerald',
  scene: 'neon-amber',
  script: 'emerald',
  automation: 'sunset',
}

const SEMANTIC_THEME_IDS = new Set<string>(['auto', 'glass', ''])

/** 规范化 #RRGGBB；无效输入返回 null */
export function normalizeHexColor(input: unknown): string | null {
  if (typeof input !== 'string') return null
  const raw = input.trim()
  if (!raw) return null
  if (HEX6.test(raw)) {
    return raw.startsWith('#') ? raw.toLowerCase() : `#${raw.toLowerCase()}`
  }
  if (HEX3.test(raw)) {
    const hex = raw.startsWith('#') ? raw.slice(1) : raw
    const expanded = hex
      .split('')
      .map((ch) => `${ch}${ch}`)
      .join('')
    return `#${expanded.toLowerCase()}`
  }
  return null
}

function parseEntityFloatingCustomColors(
  config: FloatingWidgetConfig | Record<string, unknown> | undefined,
): EntityFloatingCustomColors | null {
  if (!config || config.customColorsEnabled !== true) return null
  const accent = normalizeHexColor(config.customColorAccent)
  if (!accent) return null
  return {
    enabled: true,
    accent,
    label: normalizeHexColor(config.customColorLabel) || accent,
    value: normalizeHexColor(config.customColorValue) || accent,
  }
}

export function hasEntityCustomColors(
  config: FloatingWidgetConfig | Record<string, unknown> | undefined,
): boolean {
  return parseEntityFloatingCustomColors(config) != null
}

function afhThemeAccent(theme: string | null | undefined): string {
  if (!theme) return AFH_THEME_ACCENT.glass
  return AFH_THEME_ACCENT[theme as AfhThemeId] || AFH_THEME_ACCENT.glass
}

function isSemanticTheme(theme: string | null | undefined): boolean {
  return SEMANTIC_THEME_IDS.has(String(theme || ''))
}

/**
 * 按实体类型解析默认主题：电金 / 气橙 / 水青 / 讯紫，其余跟设备域。
 */
function resolveAfhSemanticTheme(
  entityId: string | null | undefined,
  widgetType?: string | null,
): AfhThemeId {
  const type = String(widgetType || '')
  if (METRIC_THEME[type]) return METRIC_THEME[type]
  const eid = String(entityId || '')
  if (isElectricityEntity(eid)) return 'neon-amber'
  if (isGasEntity(eid)) return 'sunset'
  if (isWaterEntity(eid)) return 'neon-cyan'
  if (isCommEntity(eid)) return 'neon-purple'
  const domain = getEntityDomain(eid)
  if (domain && DOMAIN_THEME[domain]) return DOMAIN_THEME[domain]
  return 'glass'
}

export function resolveAfhWidgetTheme(widget: Pick<FloatingWidget, 'type' | 'config'>): string {
  const stored = String(widget.config?.theme || '')
  if (stored === 'neutral') return 'glass'
  const isCard = widget.type === 'entity' || Boolean(METRIC_THEME[widget.type])
  if (isCard && isSemanticTheme(stored)) {
    return resolveAfhSemanticTheme(String(widget.config?.entityId || ''), widget.type)
  }
  return stored || 'glass'
}

function resolveAfhWidgetAccent(widget: Pick<FloatingWidget, 'type' | 'config'>): string {
  const custom = parseEntityFloatingCustomColors(widget.config)
  if (custom) return custom.accent
  const theme = resolveAfhWidgetTheme(widget)
  if (theme === 'glass') {
    const eid = String(widget.config?.entityId || '')
    const domain = getEntityDomain(eid)
    if (domain) return entityDomainColor(domain)
  }
  return afhThemeAccent(theme)
}

export function shouldTintAfhWidget(widget: Pick<FloatingWidget, 'type' | 'config'>): boolean {
  if (hasEntityCustomColors(widget.config)) return true
  const isCard = widget.type === 'entity' || Boolean(METRIC_THEME[widget.type])
  if (!isCard) return false
  return resolveAfhWidgetTheme(widget) !== 'glass'
}

/** 供浮动实体卡片 shell 使用的 CSS 变量 */
function buildEntityCustomColorStyle(
  config: FloatingWidgetConfig | Record<string, unknown> | undefined,
): Record<string, string> {
  const colors = parseEntityFloatingCustomColors(config)
  if (!colors) return {}
  return {
    '--afh-custom-accent': colors.accent,
    '--afh-custom-label': colors.label,
    '--afh-custom-value': colors.value,
  }
}

export function buildAfhAccentStyle(
  widget: Pick<FloatingWidget, 'type' | 'config'>,
): Record<string, string> {
  const accent = resolveAfhWidgetAccent(widget)
  const custom = buildEntityCustomColorStyle(widget.config)
  return {
    '--afh-accent': custom['--afh-custom-accent'] || accent,
    ...custom,
  }
}
