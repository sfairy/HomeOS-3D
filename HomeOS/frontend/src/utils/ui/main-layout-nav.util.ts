/**
 * 主布局导航（桌面顶栏）构建工具。
 *
 * 职责：
 * - 维护导航标签中文文案（MAIN_LAYOUT_NAV_LABELS）与各 Tab 主题色（TAB_ACCENTS）
 * - 维护图标名 → 组件映射（mainLayoutIconMap，含内嵌反代图标）
 * - 按布局配置（顺序/可见性/放置/内嵌）构建顶栏与下拉；窄屏溢出收到「更多」
 *
 * 竖屏底栏与「更多」页由 MobileLayout / MobileMoreView 自行维护，不走本文件。
 *
 * 依赖：@lucide/vue 图标；nav-tabs.util / embed-* 布局工具。
 */

import {
  Home,
  ShieldCheck,
  MonitorPlay,
  Settings,
  Smartphone,
  Sparkles,
  Zap,
  ScrollText,
  Bell,
  Activity,
  LayoutDashboard,
  Workflow,
  Leaf,
  BarChart3,
} from '@lucide/vue'
import type { Component } from 'vue'
import {
  embedNavTabId,
  isNavTabVisible,
  isNavTabInDropdown,
  resolveOrderedNavTabIds,
  NAV_TAB_PATHS,
  type NavTabPlacement,
} from '@/utils/layout/nav-tabs.util'
import { EMBED_TAB_ACCENTS, resolveEmbedNavAccent } from '@/utils/layout/embed-nav-theme.util'
import { embedIconMap } from '@/utils/layout/embed-icons.util'

/** 主布局各导航 Tab ID → 中文展示名映射 */
export const MAIN_LAYOUT_NAV_LABELS: Record<string, string> = {
  dashboard: '总览',
  devices: '设备',
  linkage: '联动',
  scenes: '场景',
  automations: '自动化',
  life: '生活',
  security: '安防',
  events: '事件',
  scripts: '脚本',
  notifications: '通知',
  'earthquake-history': '地震',
  reports: '报表',
  media: '影视',
}

/**
 * 各导航 Tab ID → 主题强调色（十六进制 CSS 色值，仅用于 UI 强调，不可翻译）。
 * 未命中时回退到 #0A84FF。
 */
const TAB_ACCENTS: Record<string, string> = {
  dashboard: '#0A84FF', // 总览
  devices: '#64D2FF', // 设备
  linkage: '#5fd4ff', // 联动（对齐登录青）
  scenes: '#38bdf8', // 场景（sky）
  automations: '#fbbf24', // 自动化（琥珀）
  life: '#2dd4bf', // 生活
  security: '#FF375F', // 安防
  events: '#38bdf8', // 事件
  scripts: '#34d399', // 脚本（翠绿）
  notifications: '#7eb8ff', // 通知
  'earthquake-history': '#f0c48a', // 地震
  reports: '#a78bfa', // 报表（紫罗兰）
  media: EMBED_TAB_ACCENTS[0], // 影视（内嵌反代首项强调色）
}

/**
 * 解析指定 Tab 的强调色，未配置时回退到 #0A84FF。
 * @param id 导航 Tab ID
 * @returns 十六进制色值
 */
function resolveMainLayoutTabAccent(id: string) {
  return TAB_ACCENTS[id] || '#0A84FF'
}

/** 图标名 → 图标组件映射（含别名与内嵌反代图标） */
export const mainLayoutIconMap: Record<string, Component> = {
  Home,
  ShieldCheck,
  MonitorPlay,
  Settings,
  Smartphone,
  Sparkles,
  Zap,
  Leaf,
  Video: MonitorPlay,
  Globe: MonitorPlay,
  Tv: MonitorPlay,
  Music: MonitorPlay,
  Server: MonitorPlay,
  Gamepad: MonitorPlay,
  LayoutDashboard,
  ...embedIconMap,
}

/** 主布局单个导航项结构（id/路径/标签/图标/强调色） */
type MainLayoutNavItem = {
  id: string
  path: string
  label: string
  icon: Component
  accent: string
}

/** 布局配置子集：导航顺序、可见性、放置、内嵌反代、MoviePilot URL */
type LayoutNavConfig = {
  navTabOrder?: string[]
  navTabVisibility?: Record<string, boolean>
  navTabPlacement?: Record<string, NavTabPlacement | undefined>
  customEmbeds?: Array<{ id: string; name?: string; icon?: string }>
  moviePilotUrl?: string
}

type MainLayoutNavOptions = {
  /** 访客账号不可访问内嵌反代，默认隐藏内嵌 Tab */
  includeEmbeds?: boolean
}

/**
 * 构建桌面主布局导航：首项固定为总览，其余按 navTabOrder 与可见性/放置分配到顶栏或下拉。
 * @param layout 布局配置
 * @param options 选项（includeEmbeds 控制内嵌反代是否入栏）
 * @returns { barItems, dropdownItems }
 */
export function buildMainLayoutNavMenu(layout: LayoutNavConfig, options: MainLayoutNavOptions = {}) {
  const includeEmbeds = options.includeEmbeds !== false
  const visibility = { ...(layout.navTabVisibility || {}) }
  const placement = { ...(layout.navTabPlacement || {}) }
  const customEmbeds = includeEmbeds ? layout.customEmbeds || [] : []
  const tabDefs = new Map<string, MainLayoutNavItem>([
    [
      'devices',
      {
        id: 'devices',
        path: NAV_TAB_PATHS.devices,
        label: MAIN_LAYOUT_NAV_LABELS.devices,
        icon: Smartphone,
        accent: resolveMainLayoutTabAccent('devices'),
      },
    ],
    [
      'linkage',
      {
        id: 'linkage',
        path: NAV_TAB_PATHS.linkage,
        label: MAIN_LAYOUT_NAV_LABELS.linkage,
        icon: Workflow,
        accent: resolveMainLayoutTabAccent('linkage'),
      },
    ],
    [
      'life',
      {
        id: 'life',
        path: NAV_TAB_PATHS.life,
        label: MAIN_LAYOUT_NAV_LABELS.life,
        icon: Leaf,
        accent: resolveMainLayoutTabAccent('life'),
      },
    ],
    [
      'security',
      {
        id: 'security',
        path: NAV_TAB_PATHS.security,
        label: MAIN_LAYOUT_NAV_LABELS.security,
        icon: ShieldCheck,
        accent: resolveMainLayoutTabAccent('security'),
      },
    ],
    [
      'events',
      {
        id: 'events',
        path: NAV_TAB_PATHS.events,
        label: MAIN_LAYOUT_NAV_LABELS.events,
        icon: ScrollText,
        accent: resolveMainLayoutTabAccent('events'),
      },
    ],
    [
      'notifications',
      {
        id: 'notifications',
        path: NAV_TAB_PATHS.notifications,
        label: MAIN_LAYOUT_NAV_LABELS.notifications,
        icon: Bell,
        accent: resolveMainLayoutTabAccent('notifications'),
      },
    ],
    [
      'earthquake-history',
      {
        id: 'earthquake-history',
        path: NAV_TAB_PATHS['earthquake-history'],
        label: MAIN_LAYOUT_NAV_LABELS['earthquake-history'],
        icon: Activity,
        accent: resolveMainLayoutTabAccent('earthquake-history'),
      },
    ],
    [
      'reports',
      {
        id: 'reports',
        path: NAV_TAB_PATHS.reports,
        label: MAIN_LAYOUT_NAV_LABELS.reports,
        icon: BarChart3,
        accent: resolveMainLayoutTabAccent('reports'),
      },
    ],
  ])
  const extraIds: string[] = []
  if (customEmbeds.length > 0) {
    customEmbeds.forEach((embed, idx) => {
      const id = embedNavTabId(embed.id)
      extraIds.push(id)
      tabDefs.set(id, {
        id,
        path: `/embed/${embed.id}`,
        label: embed.name || embed.id,
        icon:
          embed.icon && mainLayoutIconMap[embed.icon] ? mainLayoutIconMap[embed.icon] : MonitorPlay,
        accent: resolveEmbedNavAccent(embed, idx),
      })
    })
  } else if (includeEmbeds && layout.moviePilotUrl) {
    extraIds.push('media')
    tabDefs.set('media', {
      id: 'media',
      path: '/embed/movie-pilot',
      label: MAIN_LAYOUT_NAV_LABELS.media,
      icon: MonitorPlay,
      accent: resolveMainLayoutTabAccent('media'),
    })
  }
  const orderedIds = resolveOrderedNavTabIds(layout.navTabOrder, extraIds)
  const barItems: MainLayoutNavItem[] = [
    {
      id: 'dashboard',
      path: '/',
      label: MAIN_LAYOUT_NAV_LABELS.dashboard,
      icon: Home,
      accent: resolveMainLayoutTabAccent('dashboard'),
    },
  ]
  const dropdownItems: MainLayoutNavItem[] = []
  for (const id of orderedIds) {
    if (!isNavTabVisible(visibility, id)) continue
    const def = tabDefs.get(id)
    if (!def) continue
    if (isNavTabInDropdown(placement, id)) dropdownItems.push(def)
    else barItems.push(def)
  }
  return { barItems, dropdownItems }
}

/** 紧凑视口顶栏最多展示的 Tab 数（其余进「更多」，避免隐式横向滚动） */
const COMPACT_NAV_BAR_MAX_NARROW = 4
const COMPACT_NAV_BAR_MAX_TABLET = 5
const COMPACT_NAV_VIEWPORT_MAX = 1024

/**
 * 窄屏/平板紧凑档把溢出的顶栏 Tab 收到「更多」，避免 overflow-x 隐式滚动。
 */
export function capBarItemsForViewport<T>(
  menu: { barItems: T[]; dropdownItems: T[] },
  width: number,
): { barItems: T[]; dropdownItems: T[] } {
  if (width > COMPACT_NAV_VIEWPORT_MAX) return menu
  const max = width <= 639 ? COMPACT_NAV_BAR_MAX_NARROW : COMPACT_NAV_BAR_MAX_TABLET
  if (menu.barItems.length <= max) return menu
  return {
    barItems: menu.barItems.slice(0, max),
    dropdownItems: [...menu.barItems.slice(max), ...menu.dropdownItems],
  }
}
