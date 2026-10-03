/**
 * 天气背景显示范围路由匹配
 *
 * 职责：
 * - 维护页面路由 → 天气背景显示范围 key 的映射表。
 * - 提供当前路由的显示范围解析与规范化，供天气背景按页面控制是否渲染。
 *
 * 依赖：
 * - @/utils/ui/main-layout-nav.util 的主布局导航标签。
 * - @/composables/orchestrator/linkage-hub.types 的联动中心元数据。
 *
 * 注意：
 * - 显示范围 key（dashboard / devices / linkage / ...）为配置 key，不翻译。
 * - 仅面向用户的页面标签使用简体中文。
 */
/** 天气背景显示范围路由匹配 */

import { MAIN_LAYOUT_NAV_LABELS } from '@/utils/ui/main-layout-nav.util'
import { LINKAGE_HUB_KIND_META } from '@/composables/orchestrator/linkage-hub.types'

const WEATHER_DISPLAY_ROUTE_MAP: Record<string, string[]> = {
  dashboard: ['/', '/dashboard'],
  devices: ['/devices', '/device'],
  linkage: ['/linkage'],
  events: ['/events'],
  notifications: ['/notifications'],
  'earthquake-history': ['/earthquake-history'],
  security: ['/security'],
  settings: ['/settings'],
  'mode-logs': ['/mode-logs'],
  embed: ['/embed'],
}

/** 联动中心子页签 — 仅 path=/linkage 时按 query.tab 匹配 */
const LINKAGE_TAB_ROUTE_KEYS: Record<string, string> = {
  'linkage-overview': 'overview',
  scenes: 'scene',
  automations: 'automation',
  scripts: 'script',
  'template-entities': 'template',
}

/** 「全部页面」与任意选项均不启用天气背景的页面 */
const WEATHER_DISPLAY_ROUTE_EXCLUDED: string[] = [
  '/settings',
  '/login',
  '/setup',
  '/guest',
  '/builder',
]

type WeatherDisplayRouteOption = {
  id: string
  label: string
}

type WeatherDisplayRouteGroup = {
  id: string
  label: string | null
  options: WeatherDisplayRouteOption[]
}

/** 与顶栏 / 联动中心页签对齐的可选项（分组展示） */
export const WEATHER_DISPLAY_ROUTE_GROUPS: WeatherDisplayRouteGroup[] = [
  {
    id: 'main',
    label: '主导航',
    options: [
      { id: 'dashboard', label: MAIN_LAYOUT_NAV_LABELS.dashboard },
      { id: 'devices', label: MAIN_LAYOUT_NAV_LABELS.devices },
      { id: 'linkage', label: MAIN_LAYOUT_NAV_LABELS.linkage },
      { id: 'security', label: MAIN_LAYOUT_NAV_LABELS.security },
      { id: 'events', label: MAIN_LAYOUT_NAV_LABELS.events },
      { id: 'notifications', label: MAIN_LAYOUT_NAV_LABELS.notifications },
      { id: 'earthquake-history', label: MAIN_LAYOUT_NAV_LABELS['earthquake-history'] },
      { id: 'mode-logs', label: '模式日志' },
    ],
  },
  {
    id: 'linkage-tabs',
    label: '联动中心页签',
    options: [
      { id: 'linkage-overview', label: '联动总览' },
      { id: 'scenes', label: MAIN_LAYOUT_NAV_LABELS.scenes },
      { id: 'automations', label: MAIN_LAYOUT_NAV_LABELS.automations },
      { id: 'scripts', label: MAIN_LAYOUT_NAV_LABELS.scripts },
      { id: 'template-entities', label: LINKAGE_HUB_KIND_META.template.label },
    ],
  },
  {
    id: 'global',
    label: null,
    options: [{ id: 'all', label: '全部页面' }],
  },
]

const ROUTE_LABEL_MAP = new Map(
  WEATHER_DISPLAY_ROUTE_GROUPS.flatMap((g) => g.options).map((option) => [option.id, option.label]),
)

/** 联动子页签与「整个联动中心」互斥 */
export const WEATHER_LINKAGE_SUB_ROUTE_IDS = [
  'linkage-overview',
  'scenes',
  'automations',
  'scripts',
  'template-entities',
] as const

type WeatherDisplayRouteQuery = Record<string, unknown> | null | undefined

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === '/') return path === '/' || path === ''
  return path === pattern || path.startsWith(`${pattern}/`)
}

function isExcludedWeatherPath(path: string): boolean {
  return WEATHER_DISPLAY_ROUTE_EXCLUDED.some((p) => pathMatches(p, path))
}

function resolveLinkageTab(query: WeatherDisplayRouteQuery): string {
  const raw = query?.tab
  if (typeof raw === 'string' && raw.trim()) return raw.trim()
  if (Array.isArray(raw) && raw[0]) return String(raw[0]).trim()
  return 'overview'
}

function matchLinkageTabRoute(key: string, path: string, query?: WeatherDisplayRouteQuery): boolean {
  const tabKey = LINKAGE_TAB_ROUTE_KEYS[key]
  if (!tabKey) return false
  return path === '/linkage' && resolveLinkageTab(query) === tabKey
}

function matchRouteKey(key: string, path: string, query?: WeatherDisplayRouteQuery): boolean {
  const normalized = String(key || '').trim()
  if (!normalized || normalized === 'all') return false

  if (LINKAGE_TAB_ROUTE_KEYS[normalized]) {
    return matchLinkageTabRoute(normalized, path, query)
  }

  const mapped = WEATHER_DISPLAY_ROUTE_MAP[normalized]
  if (mapped) return mapped.some((p) => pathMatches(p, path))
  const segment = normalized.startsWith('/') ? normalized : `/${normalized}`
  return pathMatches(segment, path)
}

/** getWeatherDisplayRouteLabel：函数，按签名入参返回处理结果。 */
export function getWeatherDisplayRouteLabel(id: string): string {
  return ROUTE_LABEL_MAP.get(id) || id
}

/** normalizeDisplayRoutes：函数，按签名入参返回处理结果。 */
export function normalizeDisplayRoutes(routes: unknown): string[] {
  if (!Array.isArray(routes) || !routes.length) return ['dashboard']
  const seen = new Set<string>()
  const out: string[] = []
  for (const r of routes) {
    const s = String(r).trim()
    if (!s || seen.has(s)) continue
    seen.add(s)
    out.push(s)
  }
  return out.length ? out : ['dashboard']
}

/** shouldShowWeatherBackground：函数，按签名入参返回处理结果。 */
export function shouldShowWeatherBackground(
  routePath: string,
  displayRoutes: string[] | undefined | null,
  routeQuery?: WeatherDisplayRouteQuery,
): boolean {
  const path = routePath || '/'
  if (isExcludedWeatherPath(path)) return false

  const routes = normalizeDisplayRoutes(displayRoutes)
  if (routes.includes('all')) return true
  return routes.some((key) => matchRouteKey(key, path, routeQuery))
}
