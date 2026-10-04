/**
 * 天气背景显示范围路由匹配
 *
 * 职责：
 * - 维护页面路由 → 天气背景显示范围 key 的映射表。
 * - 提供当前路由的显示范围解析与规范化，供天气背景按页面控制是否渲染。
 *
 * 依赖：
 * - @/utils/ui/main-layout-nav.util 的主布局导航标签。
 *
 * 注意：
 * - 显示范围 key（dashboard / devices / ...）为配置 key，不翻译。
 * - 仅面向用户的页面标签使用简体中文。
 */
/** 天气背景显示范围路由匹配 */

import { MAIN_LAYOUT_NAV_LABELS } from '@/utils/ui/main-layout-nav.util'

const WEATHER_DISPLAY_ROUTE_MAP: Record<string, string[]> = {
  dashboard: ['/', '/dashboard'],
  devices: ['/devices', '/device'],
  notifications: ['/notifications'],
  'earthquake-history': ['/earthquake-history'],
  security: ['/security'],
  settings: ['/settings'],
  'mode-logs': ['/mode-logs'],
  embed: ['/embed'],
}

/** 「全部页面」与任意选项均不启用天气背景的页面 */
const WEATHER_DISPLAY_ROUTE_EXCLUDED: string[] = [
  '/settings',
  '/login',
  '/setup',
  '/guest',
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

/** 与顶栏对齐的可选项（分组展示） */
export const WEATHER_DISPLAY_ROUTE_GROUPS: WeatherDisplayRouteGroup[] = [
  {
    id: 'main',
    label: '主导航',
    options: [
      { id: 'dashboard', label: MAIN_LAYOUT_NAV_LABELS.dashboard },
      { id: 'devices', label: MAIN_LAYOUT_NAV_LABELS.devices },
      { id: 'security', label: MAIN_LAYOUT_NAV_LABELS.security },
      { id: 'notifications', label: MAIN_LAYOUT_NAV_LABELS.notifications },
      { id: 'earthquake-history', label: MAIN_LAYOUT_NAV_LABELS['earthquake-history'] },
      { id: 'mode-logs', label: '模式日志' },
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

type WeatherDisplayRouteQuery = Record<string, unknown> | null | undefined

function pathMatches(pattern: string, path: string): boolean {
  if (pattern === '/') return path === '/' || path === ''
  return path === pattern || path.startsWith(`${pattern}/`)
}

function isExcludedWeatherPath(path: string): boolean {
  return WEATHER_DISPLAY_ROUTE_EXCLUDED.some((p) => pathMatches(p, path))
}

function matchRouteKey(key: string, path: string): boolean {
  const normalized = String(key || '').trim()
  if (!normalized || normalized === 'all') return false
  const mapped = WEATHER_DISPLAY_ROUTE_MAP[normalized]
  if (mapped) return mapped.some((p) => pathMatches(p, path))
  const segment = normalized.startsWith('/') ? normalized : `/${normalized}`
  return pathMatches(segment, path)
}

export function getWeatherDisplayRouteLabel(id: string): string {
  return ROUTE_LABEL_MAP.get(id) || id
}

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

export function shouldShowWeatherBackground(
  routePath: string,
  displayRoutes: string[] | undefined | null,
  _routeQuery?: WeatherDisplayRouteQuery,
): boolean {
  const path = routePath || '/'
  if (isExcludedWeatherPath(path)) return false

  const routes = normalizeDisplayRoutes(displayRoutes)
  if (routes.includes('all')) return true
  return routes.some((key) => matchRouteKey(key, path))
}
