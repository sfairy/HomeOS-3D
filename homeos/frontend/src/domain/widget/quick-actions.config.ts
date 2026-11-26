/**
 * 常用设备快捷组（QuickActionsCard）可选按钮的统一元数据。
 * 同时供卡片渲染与设置页「配置统计源」的按钮自定义复用，保证两端一致。
 */
import { Sun, Wind, BatteryWarning, AlertCircle, Blinds, Music, Fan, Lock } from '@lucide/vue'
import type { Component } from 'vue'

interface QuickButtonMeta {
  /** 按钮 id（同时作为 CSS 主题类 action-btn--{id}） */
  id: string
  /** 展示标签 */
  label: string
  /** 图标组件 */
  icon: Component
  /** 点击打开的设备组弹窗域 */
  domain: string
  /** 角标计数视为「活跃/需关注」的状态集（仅扩展域使用；核心域有专用计数） */
  activeStates?: string[]
  /** 核心按钮使用专用计数器，不走通用 activeStates 统计 */
  core?: boolean
}

/** 默认显示的四个核心按钮 */
const DEFAULT_QUICK_BUTTONS = ['lights', 'climates', 'battery', 'offline']

/** 快捷组固定一行展示，最多 4 个按钮 */
export const MAX_QUICK_BUTTONS = 4

/** 全部可选按钮（顺序即设置页展示顺序） */
export const QUICK_BUTTON_META: Record<string, QuickButtonMeta> = {
  lights: { id: 'lights', label: '灯光', icon: Sun, domain: 'light', core: true },
  climates: { id: 'climates', label: '温控', icon: Wind, domain: 'climate', core: true },
  battery: { id: 'battery', label: '低电量', icon: BatteryWarning, domain: 'battery', core: true },
  offline: { id: 'offline', label: '离线', icon: AlertCircle, domain: 'offline', core: true },
  cover: {
    id: 'cover',
    label: '窗帘',
    icon: Blinds,
    domain: 'cover',
    activeStates: ['open', 'opening'],
  },
  media_player: {
    id: 'media_player',
    label: '媒体',
    icon: Music,
    domain: 'media_player',
    activeStates: ['playing'],
  },
  fan: { id: 'fan', label: '风扇', icon: Fan, domain: 'fan', activeStates: ['on'] },
  lock: {
    id: 'lock',
    label: '门锁',
    icon: Lock,
    domain: 'lock',
    activeStates: ['unlocked', 'unlocking', 'open'],
  },
}

/** 设置页可勾选的按钮列表（保持顺序） */
export const QUICK_BUTTON_OPTIONS: QuickButtonMeta[] = Object.values(QUICK_BUTTON_META)

/** 规整用户配置：过滤未知 id、去重、最多 4 个（固定一行）；为空时回退默认四项 */
export function normalizeQuickButtons(list: unknown): string[] {
  if (!Array.isArray(list) || list.length === 0) return [...DEFAULT_QUICK_BUTTONS]
  const seen = new Set<string>()
  const out: string[] = []
  for (const id of list) {
    if (typeof id === 'string' && QUICK_BUTTON_META[id] && !seen.has(id)) {
      seen.add(id)
      out.push(id)
    }
    if (out.length >= MAX_QUICK_BUTTONS) break
  }
  return out.length ? out : [...DEFAULT_QUICK_BUTTONS]
}
