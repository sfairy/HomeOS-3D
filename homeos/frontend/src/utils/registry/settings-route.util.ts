/**
 * 设置页深链 URL 构建工具
 *
 * 职责：
 * - 构建设置页深链 URL，统一 tab / section / orchTab 等 query 参数拼装。
 * - 提供深链与当前路由匹配判定，供推荐卡片避免渲染自链。
 * - 提供当前页完整可分享 URL 拼装（含 origin；SSR 时仅返回 path）。
 *
 * 依赖：无外部依赖，纯函数。
 *
 * 注意：query key（tab / section / orchTab ...）为路由参数 key，不翻译。
 */
type SettingsRouteQuery = Record<string, string | number | boolean | undefined | null>

/**
 * 构建设置页深链 URL。
 *
 * @param query 路由参数（自动过滤 null / undefined / 空串）
 * @returns 形如 `/settings?tab=...` 的路径；无参数时返回 `/settings`
 */
function settingsRoute(query: SettingsRouteQuery = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value != null && value !== '') params.set(key, String(value))
  }
  const qs = params.toString()
  return qs ? `/settings?${qs}` : '/settings'
}

/**
 * 深链是否已指向当前路由（link 中的 path + query 均已满足；当前路由可有额外 query）。
 * 用于推荐卡片等避免渲染「点了没反应」的自链。
 *
 * @param linkTo 目标链接（含 path 与可选 query）
 * @param route 当前路由对象（含 path 与 query）
 * @returns true 表示深链已被当前路由满足
 */
export function isDeepLinkCurrent(
  linkTo: string,
  route: { path: string; query: Record<string, unknown> },
): boolean {
  if (!linkTo) return false
  const qIndex = linkTo.indexOf('?')
  const path = (qIndex >= 0 ? linkTo.slice(0, qIndex) : linkTo) || '/'
  const qs = qIndex >= 0 ? linkTo.slice(qIndex + 1) : ''
  if (path !== route.path) return false
  if (!qs) return true
  const params = new URLSearchParams(qs)
  for (const [key, value] of params) {
    const cur = route.query[key]
    const curStr = Array.isArray(cur) ? cur[0] : cur
    if (String(curStr ?? '') !== value) return false
  }
  return true
}

/**
 * 当前页完整可分享 URL（含 origin；SSR 时仅返回 path）。
 *
 * @param fullPath 当前路由 fullPath
 * @returns 可对外分享的完整 URL 字符串
 */
export function settingsPageShareUrl(fullPath: string) {
  if (typeof window === 'undefined') return fullPath
  return `${window.location.origin}${fullPath}`
}

/** 常用深链 */
export const SETTINGS_ROUTES = {
  favorites: (section?: string) =>
    settingsRoute({ tab: 'favorites', ...(section ? { section } : {}) }),
  general: (section?: string) => settingsRoute({ tab: 'general', ...(section ? { section } : {}) }),
  params: (section?: string) => settingsRoute({ tab: 'params', ...(section ? { section } : {}) }),
  profiles: (section?: string) =>
    settingsRoute({ tab: 'profiles', ...(section ? { section } : {}) }),
  orchestrator: (orchTab?: string, edit?: string) =>
    settingsRoute({
      tab: 'home-mode',
      ...(orchTab ? { orchTab } : {}),
      ...(edit ? { edit } : {}),
    }),
  homeMode: (section?: string) =>
    settingsRoute({ tab: 'home-mode', ...(section ? { section } : {}) }),
  bindings: (section?: string) =>
    settingsRoute({ tab: 'bindings', ...(section ? { section } : {}) }),
  lifeAccounts: (section?: string) =>
    settingsRoute({ tab: 'life-accounts', ...(section ? { section } : {}) }),
  envHealth: (section?: string) =>
    settingsRoute({ tab: 'rooms', ...(section ? { section } : {}) }),
  rooms: (section?: string) =>
    settingsRoute({
      tab: 'rooms',
      section: section || 'catalog',
    }),
  layout: (section?: string) => settingsRoute({ tab: 'layout', ...(section ? { section } : {}) }),
  alerts: (section?: string) => settingsRoute({ tab: 'alerts', ...(section ? { section } : {}) }),
  securityModes: (section?: string) =>
    settingsRoute({ tab: 'security-modes', ...(section ? { section } : {}) }),
  voice: (section?: string) => settingsRoute({ tab: 'voice', ...(section ? { section } : {}) }),
  agent: (section?: string) => settingsRoute({ tab: 'agent', ...(section ? { section } : {}) }),
  diagnostics: (section?: string) =>
    settingsRoute({ tab: 'diagnostics', ...(section ? { section } : {}) }),
  connection: (section?: string) =>
    settingsRoute({ tab: 'connection', ...(section ? { section } : {}) }),
  setupWizard: (section?: string) =>
    settingsRoute({ tab: 'setup-wizard', ...(section ? { section } : {}) }),
  access: (section?: string) => settingsRoute({ tab: 'access', ...(section ? { section } : {}) }),
  widgets: () => settingsRoute({ tab: 'widgets' }),
  assets: () => settingsRoute({ tab: 'assets' }),
  embeds: (section?: string) => settingsRoute({ tab: 'embeds', ...(section ? { section } : {}) }),
  executionHistory: (section?: string) =>
    settingsRoute({ tab: 'diagnostics', ...(section ? { section } : {}) }),
  smartCharge: (section?: string) =>
    settingsRoute({ tab: 'smart-charge', ...(section ? { section } : {}) }),
  family: () => settingsRoute({ tab: 'family' }),
  floating: () => settingsRoute({ tab: 'floating' }),
  devices: (section?: string) => settingsRoute({ tab: 'devices', ...(section ? { section } : {}) }),
  retention: (section?: string) =>
    settingsRoute({ tab: 'retention', ...(section ? { section } : {}) }),
  /** 通知来源 → 设置深链 */
  fromNotificationSource(src: string | null | undefined) {
    const s = String(src || '')
    if (s.startsWith('alert-rule')) return SETTINGS_ROUTES.alerts()
    if (s.startsWith('security')) return SETTINGS_ROUTES.securityModes()
    if (s.startsWith('energy')) return SETTINGS_ROUTES.lifeAccounts()
    if (s.startsWith('environment')) return SETTINGS_ROUTES.envHealth()
    if (s.startsWith('voice')) return SETTINGS_ROUTES.voice()
    return SETTINGS_ROUTES.alerts()
  },
}
