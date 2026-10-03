/**
 * 顶栏导航 Tab 工具。
 *
 * 职责：定义顶栏核心 Tab 默认顺序、路径映射、可见性与展示位置（顶栏/下拉）的解析与切换，
 * 以及顶栏 Tab 激活判定。
 */
/** 内置品牌 Logo（仓库根 assets/logo/logo.svg，可替换；Nest 托管 /logo/*） */
export const DEFAULT_BRAND_LOGO_URL = '/logo/logo.svg'

/** 顶栏核心 Tab 默认顺序（不含总览/设置；rooms 已并入设置→房间配置） */
export const NAV_TAB_ORDER_DEFAULT = ['devices', 'linkage', 'life', 'security']

/** 可选 Tab：默认隐藏，可在设置→基础设置中启用并排序 */
export const NAV_OPTIONAL_TAB_IDS = [
  'events',
  'notifications',
  'earthquake-history',
  'reports',
] as const

/** 可见标签在顶栏的展示位置 */
export type NavTabPlacement = 'bar' | 'dropdown'

/** Tab 展示位置默认值：顶栏 */
const NAV_TAB_PLACEMENT_DEFAULT: NavTabPlacement = 'bar'

/** Tab id → 路由路径映射 */
export const NAV_TAB_PATHS: Record<string, string> = {
  devices: '/devices',
  linkage: '/linkage',
  life: '/life',
  security: '/security',
  events: '/events',
  notifications: '/notifications',
  'earthquake-history': '/earthquake-history',
  reports: '/reports',
}

/**
 * 判断 Tab id 是否为内嵌页 Tab（embed- 前缀或 media）。
 * @param id Tab id
 */
export function isEmbedNavTabId(id: string | null | undefined): boolean {
  return String(id).startsWith('embed-') || id === 'media'
}

/**
 * 由内嵌页 id 构造 Tab id（幂等：已带 `embed-` 前缀或为 `media` 时不再叠加，保证与路由/配置对齐）。
 * @param embedId 内嵌页 id
 * @returns 形如 `embed-<id>` 的 Tab id
 */
export function embedNavTabId(embedId: string): string {
  const id = String(embedId || '').trim()
  if (!id || id === 'media' || id.startsWith('embed-')) return id || 'embed-'
  return `embed-${id}`
}

/** 布局中与内嵌导航相关的可变字段子集 */
type EmbedNavTabLayoutFields = {
  customEmbeds?: Array<{ id?: string | null }> | null
  moviePilotUrl?: string | null
  navTabOrder?: string[] | null
  navTabVisibility?: Record<string, boolean | undefined> | null
  navTabPlacement?: Record<string, NavTabPlacement | undefined> | null
}

/**
 * 删除指定 Tab id 在顺序 / 可见性 / 放置中的引用。
 */
function removeNavTabRefs(
  layout: EmbedNavTabLayoutFields,
  tabIds: Iterable<string>,
): void {
  const drop = new Set([...tabIds].filter(Boolean))
  if (!drop.size) return
  if (Array.isArray(layout.navTabOrder)) {
    layout.navTabOrder = layout.navTabOrder.filter((id) => !drop.has(id))
  }
  for (const field of ['navTabVisibility', 'navTabPlacement'] as const) {
    const map = layout[field]
    if (!map) continue
    for (const id of drop) delete map[id]
  }
}

/**
 * 内嵌页删除后清理导航引用。
 * @param layout 布局配置
 * @param embedId 被删除的内嵌页 id
 */
export function pruneNavTabsForRemovedEmbed(
  layout: EmbedNavTabLayoutFields,
  embedId: string,
): void {
  const id = String(embedId || '').trim()
  if (!id) return
  removeNavTabRefs(layout, [embedNavTabId(id)])
}

/**
 * 规范化内嵌页与导航标签的联动字段：
 * - 清除已不存在的内嵌 Tab 孤儿引用
 * @param layout 布局配置（原地修改）
 */
export function normalizeEmbedNavTabLayoutFields(layout: EmbedNavTabLayoutFields): void {
  const embeds = Array.isArray(layout.customEmbeds) ? layout.customEmbeds : []
  const liveTabIds = new Set<string>()

  for (const embed of embeds) {
    const embedId = String(embed?.id || '').trim()
    if (!embedId) continue
    liveTabIds.add(embedNavTabId(embedId))
  }

  if (embeds.length === 0 && String(layout.moviePilotUrl || '').trim()) {
    liveTabIds.add('media')
  }

  const orphanIds: string[] = []
  const scanIds = [
    ...(Array.isArray(layout.navTabOrder) ? layout.navTabOrder : []),
    ...Object.keys(layout.navTabVisibility || {}),
    ...Object.keys(layout.navTabPlacement || {}),
  ]
  for (const id of scanIds) {
    if (!isEmbedNavTabId(id)) continue
    if (!liveTabIds.has(id)) orphanIds.push(id)
  }
  removeNavTabRefs(layout, orphanIds)
}

/**
 * 判断 Tab 是否可见（未显式设为 false 即可见）。
 * @param visibility 可见性映射
 * @param tabId Tab id
 */
export function isNavTabVisible(
  visibility: Record<string, boolean | undefined> | null | undefined,
  tabId: string,
): boolean {
  if (!tabId) return true
  return visibility?.[tabId] !== false
}

/**
 * 切换 Tab 可见性。
 * @param visibility 原可见性映射
 * @param tabId Tab id
 * @returns 切换后的可见性映射
 */
export function toggleNavTabVisibility(
  visibility: Record<string, boolean | undefined> | null | undefined,
  tabId: string,
): Record<string, boolean | undefined> {
  return {
    ...(visibility || {}),
    [tabId]: !isNavTabVisible(visibility, tabId),
  }
}

/**
 * 解析 Tab 展示位置（非 dropdown 一律回退 bar）。
 * @param placement 展示位置映射
 * @param tabId Tab id
 */
function resolveNavTabPlacement(
  placement: Record<string, NavTabPlacement | undefined> | null | undefined,
  tabId: string,
): NavTabPlacement {
  const value = placement?.[tabId]
  return value === 'dropdown' ? 'dropdown' : NAV_TAB_PLACEMENT_DEFAULT
}

/**
 * 判断 Tab 是否位于下拉菜单中。
 * @param placement 展示位置映射
 * @param tabId Tab id
 */
export function isNavTabInDropdown(
  placement: Record<string, NavTabPlacement | undefined> | null | undefined,
  tabId: string,
): boolean {
  return resolveNavTabPlacement(placement, tabId) === 'dropdown'
}

/**
 * 设置 Tab 展示位置。
 * @param placement 原映射
 * @param tabId Tab id
 * @param next 目标位置
 */
export function setNavTabPlacement(
  placement: Record<string, NavTabPlacement | undefined> | null | undefined,
  tabId: string,
  next: NavTabPlacement,
): Record<string, NavTabPlacement | undefined> {
  return {
    ...(placement || {}),
    [tabId]: next,
  }
}

/**
 * 解析顶栏 Tab 的有序 id 列表。
 * 合并默认顺序、可选 Tab，并附加 extraIds，去重并过滤总览/设置。
 * 已删除内嵌页残留的 `embed-*` / `media` 孤儿 id 会被丢弃，避免导航编辑器出现无效项。
 * @param navTabOrder 自定义顺序
 * @param extraIds 额外 Tab id（当前有效的内嵌 Tab 等）
 * @returns 去重后的有序 Tab id 列表
 */
export function resolveOrderedNavTabIds(
  navTabOrder: string[] | null | undefined,
  extraIds: string[] = [],
): string[] {
  const base =
    Array.isArray(navTabOrder) && navTabOrder.length
      ? [...navTabOrder]
      : [...NAV_TAB_ORDER_DEFAULT]
  const knownBuiltIns = new Set<string>([...NAV_TAB_ORDER_DEFAULT, ...NAV_OPTIONAL_TAB_IDS, 'linkage'])
  const knownExtra = new Set(extraIds.filter(Boolean))

  const ordered = base.filter((id) => {
    if (!id || id === 'dashboard' || id === 'settings') return false
    if (isEmbedNavTabId(id)) return knownExtra.has(id)
    return knownBuiltIns.has(id)
  })
  for (const id of knownBuiltIns) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  for (const id of knownExtra) {
    if (!ordered.includes(id)) ordered.push(id)
  }
  return ordered.filter((id, idx, arr) => arr.indexOf(id) === idx)
}

/** 顶栏 Tab 激活判定：总览仅精确匹配 `/`，其余支持子路由前缀 */
export function isNavTabRouteActive(
  tabPath: string | null | undefined,
  currentPath: string | null | undefined,
): boolean {
  const path = String(tabPath || '').split('?')[0]
  const active = String(currentPath || '')
  if (path === '/') return active === '/'
  return active === path || active.startsWith(`${path}/`)
}
