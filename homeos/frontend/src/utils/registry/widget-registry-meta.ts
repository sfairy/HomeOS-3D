/**
 * 微件目录元数据：分级 / 分组 / 标签 / 名称解析
 *
 * 职责：
 * - 维护微件目录分级（WIDGET_CATALOG_TIERS：常用 / 高级 / 管理员）。
 * - 维护微件选型功能域分组标签与顺序（与设置六组对齐）。
 * - 提供微件中文名查询、规范化 widgetType、目录/侧边栏微件列表生成等工具。
 *
 * 依赖：
 * - vue 的 Component 类型。
 * - @lucide/vue 图标（仅用于 customHtml 占位组件）。
 *
 * 注意：
 * - 微件 type key（clock / weather / heroSwiper / ...）为配置 key，不翻译。
 * - `core` / `advanced` / `admin` 为分级 key，不翻译。
 * - 仅面向用户的中文标签使用简体中文。
 */
import type { Component } from 'vue'
import { Code } from '@lucide/vue'

const CATALOG_TIER_LABELS: Record<string, string> = {
  core: '常用',
  advanced: '高级',
  admin: '管理员',
}

/** 微件选型功能域（与设置六组对齐的 Widget 视角） */
const WIDGET_CATALOG_GROUP_LABELS: Record<string, string> = {
  info: '信息与快捷',
  comfort: '环境与能源',
  control: '设备控制',
  automate: '场景联动',
  interact: '感知交互',
  admin: '管理员',
}

const WIDGET_CATALOG_GROUP_ORDER = [
  'info',
  'comfort',
  'control',
  'automate',
  'interact',
  'admin',
] as const

/** 微件选择器分级（常用 / 高级 / 管理员） */
const WIDGET_CATALOG_TIERS: Record<string, 'core' | 'advanced' | 'admin'> = {
  clock: 'core',
  weather: 'core',
  mediaMini: 'core',
  quickActions: 'core',
  homeClimateChart: 'core',
  securityPanel: 'core',
}

const WIDGET_CATALOG_GROUPS: Record<string, (typeof WIDGET_CATALOG_GROUP_ORDER)[number]> = {
  clock: 'info',
  weather: 'info',
  quickActions: 'info',
  homeClimateChart: 'comfort',
  mediaMini: 'control',
  securityPanel: 'interact',
}

/** 浮动组件 内联微件的功能域（未在 WIDGET_CATALOG_GROUPS 中显式列出时） */
const FLOATING_INLINE_CATALOG_GROUPS: Record<string, (typeof WIDGET_CATALOG_GROUP_ORDER)[number]> =
  {
    entity: 'control',
  }

function resolveCatalogGroup(type: string): (typeof WIDGET_CATALOG_GROUP_ORDER)[number] {
  return WIDGET_CATALOG_GROUPS[type] ?? FLOATING_INLINE_CATALOG_GROUPS[type] ?? 'control'
}

/** 微件 / 浮动组件类型 → 功能域类别中文名 */
export function getWidgetCategoryLabelForType(type: string) {
  return getWidgetCatalogGroupLabel(resolveCatalogGroup(type))
}

function getWidgetCatalogGroupLabel(catalogGroup: string): string {
  return WIDGET_CATALOG_GROUP_LABELS[catalogGroup] ?? catalogGroup
}

function resolveCatalogTier(type: string): 'core' | 'advanced' | 'admin' {
  return WIDGET_CATALOG_TIERS[type] ?? 'advanced'
}

import { WIDGET_REGISTRY_META, WIDGET_TYPE_LABELS } from './widget-registry-entries'
export { WIDGET_REGISTRY_META } from './widget-registry-entries'

export function canonicalizeWidgetType(type: string): string {
  return type
}

function catalogForSurface(surface: string) {
  return Object.entries(WIDGET_REGISTRY_META)
    .filter(([, def]) => def.surfaces.includes(surface))
    .map(([type, def]) => {
      const item: {
        type: string
        name: string
        icon: Component
        group?: string
        catalogGroup: (typeof WIDGET_CATALOG_GROUP_ORDER)[number]
        catalogTier: 'core' | 'advanced' | 'admin'
      } = {
        type,
        name: getWidgetName(type),
        icon: def.icon,
        catalogGroup: resolveCatalogGroup(type),
        catalogTier: resolveCatalogTier(type),
      }
      if (def.group) item.group = def.group
      if (surface === 'floating' || (surface === 'floatingBasic' && def.group))
        item.group = def.group || '智能面板'
      return item
    })
}

const CATALOG_TIER_ORDER: Array<'core' | 'advanced' | 'admin'> = ['core', 'advanced', 'admin']

type CatalogItem = ReturnType<typeof catalogForSurface>[number]

function groupCatalogByDomainAndTier(items: CatalogItem[]) {
  const result: Array<{
    catalogGroup: (typeof WIDGET_CATALOG_GROUP_ORDER)[number]
    tier: 'core' | 'advanced' | 'admin'
    label: string
    items: CatalogItem[]
  }> = []
  for (const catalogGroup of WIDGET_CATALOG_GROUP_ORDER) {
    const domainItems = items.filter((w) => w.catalogGroup === catalogGroup)
    if (!domainItems.length) continue
    for (const tier of CATALOG_TIER_ORDER) {
      const tierItems = domainItems.filter((w) => w.catalogTier === tier)
      if (!tierItems.length) continue
      result.push({
        catalogGroup,
        tier,
        label: `${WIDGET_CATALOG_GROUP_LABELS[catalogGroup]} · ${CATALOG_TIER_LABELS[tier]}`,
        items: tierItems,
      })
    }
  }
  return result
}

export function getSidebarWidgetCatalogGroups() {
  return groupCatalogByDomainAndTier(getSidebarWidgets())
}

export function getDashboardWidgetCatalogGroups() {
  return groupCatalogByDomainAndTier(getDashboardWidgets())
}

function getSidebarWidgets() {
  return catalogForSurface('sidebar')
}

function getDashboardWidgets() {
  return catalogForSurface('dashboard')
}

function getFloatingHubCatalog() {
  const floatingBasicCatalog = catalogForSurface('floatingBasic').map((w) => ({
    ...w,
    group: getWidgetCatalogGroupLabel(w.catalogGroup),
  }))
  const floatingPanelCatalog = Object.entries(WIDGET_REGISTRY_META)
    .filter(([, def]) => def.surfaces.includes('floating') && def.floatingMode === 'panel')
    .map(([type, def]) => ({
      type,
      name: getWidgetName(type),
      icon: def.icon,
      group: getWidgetCatalogGroupLabel(resolveCatalogGroup(type)),
      catalogGroup: resolveCatalogGroup(type),
      catalogTier: resolveCatalogTier(type),
    }))
  return [...floatingBasicCatalog, ...floatingPanelCatalog]
}

const floatingHubTypes = (() => {
  const basic = Object.entries(WIDGET_REGISTRY_META)
    .filter(([, def]) => def.surfaces.includes('floatingBasic'))
    .map(([type]) => type)
  const panel = Object.entries(WIDGET_REGISTRY_META)
    .filter(([, def]) => def.surfaces.includes('floating'))
    .map(([type]) => type)
  return [...basic, ...panel]
})()

/** FLOATING_HUB_TYPE_SET：常量集合，成员语义见定义处。 */
export const FLOATING_HUB_TYPE_SET = new Set(floatingHubTypes)

/** FLOATING_HUB_WIDTH_MAP：常量，取值语义见定义处。 */
export const FLOATING_HUB_WIDTH_MAP = Object.fromEntries(
  Object.entries(WIDGET_REGISTRY_META)
    .filter(([, def]) => def.floatingWidth)
    .map(([type, def]) => [type, def.floatingWidth]),
)

export function getFloatingCatalogGroups() {
  const groups = new Map<
    string,
    Array<{
      type: string
      name: string
      icon: Component
      group?: string
      catalogGroup?: string
      catalogTier?: string
    }>
  >()
  for (const item of getFloatingHubCatalog()) {
    const g = getWidgetCatalogGroupLabel(item.catalogGroup ?? resolveCatalogGroup(item.type))
    const bucket = groups.get(g) ?? []
    if (!groups.has(g)) groups.set(g, bucket)
    bucket.push(item)
  }
  return WIDGET_CATALOG_GROUP_ORDER.map((id) => WIDGET_CATALOG_GROUP_LABELS[id])
    .filter((label) => groups.has(label))
    .map((label) => ({
      label,
      items: groups.get(label) ?? [],
    }))
}

export function getWidgetIcon(type: string): Component {
  return WIDGET_REGISTRY_META[canonicalizeWidgetType(type)]?.icon || Code
}

export function getWidgetName(type: string): string {
  const t = canonicalizeWidgetType(type)
  const def = WIDGET_REGISTRY_META[t]
  if (WIDGET_TYPE_LABELS[t]) return WIDGET_TYPE_LABELS[t]
  if (!def) return t
  return def.name
}

export function getSidebarWidgetClass(type: string): string {
  return WIDGET_REGISTRY_META[canonicalizeWidgetType(type)]?.sidebarClass || 'widget-compact'
}

/**
 * 各侧栏微件类型的预设卡片高度（px）——侧栏高度预设的唯一数据源。
 * 经 resolveSidebarWidgetHeightPx 由 RightSidebar.vue 以内联 style 下发；
 * RightSidebar.css 不再按类型重复声明 height/min-height（仅保留全局下限）。
 * 恢复预设与自定义保存该值时主页显示相同；未列出的类型回退到紧凑型默认值。
 */
const SIDEBAR_WIDGET_DEFAULT_HEIGHT: Record<string, number> = {
  clock: 80,
  weather: 280,
  quickActions: 80,
  mediaMini: 115,
  homeClimateChart: 250,
}

const SIDEBAR_WIDGET_DEFAULT_HEIGHT_FALLBACK = 120

/** 获取侧栏微件类型的预设卡片高度（px） */
export function getSidebarWidgetDefaultHeight(type: string): number {
  return (
    SIDEBAR_WIDGET_DEFAULT_HEIGHT[canonicalizeWidgetType(type)] ??
    SIDEBAR_WIDGET_DEFAULT_HEIGHT_FALLBACK
  )
}

export function isFloatingPanelType(type: string): boolean {
  return WIDGET_REGISTRY_META[canonicalizeWidgetType(type)]?.floatingMode === 'panel'
}
