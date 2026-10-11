/**
 * 常用设备分类元数据（设置页 / 推荐引擎 / 快捷组共用）
 *
 * 职责：
 * - 维护常用设备分类的元数据：图标、主题色、分组标签、排序。
 * - 供设置页常用设备、推荐引擎、快捷开关组共用，统一分类来源。
 *
 * 依赖：@lucide/vue 图标组件。
 *
 * 注意：
 * - 分类 key 为配置 key，不翻译。
 * - `accent` 为 CSS 颜色值，不翻译。
 * - 仅面向用户的分类标签使用简体中文。
 */
import {
  Sun,
  Thermometer,
  ToggleLeft,
  Sliders,
  Search,
  Blinds,
  Music,
  Fan,
  Lock,
  BatteryWarning,
} from '@lucide/vue'
import type { Component } from 'vue'

type FavoriteCategoryGroup = 'control' | 'environment' | 'security' | 'monitor'

export interface FavoriteCategoryMeta {
  id: string
  label: string
  /** 卡片副标题 / 用途说明 */
  description: string
  icon: Component
  color: string
  orbClass: string
  group: FavoriteCategoryGroup
  /** 快捷组角标活跃状态（与 quick-actions.config 对齐） */
  activeStates?: string[]
}

/** FAVORITE_CATEGORY_GROUPS：对象常量，字段 / 方法语义见定义处。 */
export const FAVORITE_CATEGORY_GROUPS: Record<FavoriteCategoryGroup, string> = {
  control: '控制类',
  environment: '环境类',
  security: '安防类',
  monitor: '监控类',
}

/** FAVORITE_CATEGORIES：常量集合，成员语义见定义处。 */
export const FAVORITE_CATEGORIES: FavoriteCategoryMeta[] = [
  {
    id: 'light',
    label: '智能灯光',
    description: '总览快捷弹窗 · 灯光分组 · 全屋关灯',
    icon: Sun,
    color: 'fav-ic-amber',
    orbClass: 'fav-category-card__orb--amber',
    group: 'control',
  },
  {
    id: 'climate',
    label: '空调温控',
    description: '温控分组 · 离家模式 · 能耗统计',
    icon: Thermometer,
    color: 'fav-ic-violet',
    orbClass: 'fav-category-card__orb--violet',
    group: 'control',
  },
  {
    id: 'switch',
    label: '开关插座',
    description: '快捷开关 Widget · 场景联动',
    icon: ToggleLeft,
    color: 'fav-ic-success',
    orbClass: 'fav-category-card__orb--emerald',
    group: 'control',
    activeStates: ['on'],
  },
  {
    id: 'cover',
    label: '窗帘卷帘',
    description: '窗帘分组 · 快捷组角标',
    icon: Blinds,
    color: 'fav-ic-sky',
    orbClass: 'fav-category-card__orb--sky',
    group: 'control',
    activeStates: ['open', 'opening'],
  },
  {
    id: 'media_player',
    label: '媒体播放',
    description: '媒体分组 · 播放状态角标',
    icon: Music,
    color: 'fav-ic-indigo',
    orbClass: 'fav-category-card__orb--indigo',
    group: 'control',
    activeStates: ['playing'],
  },
  {
    id: 'fan',
    label: '风扇新风',
    description: '风扇分组 · 运行状态角标',
    icon: Fan,
    color: 'fav-ic-cyan',
    orbClass: 'fav-category-card__orb--cyan',
    group: 'control',
    activeStates: ['on'],
  },
  {
    id: 'lock',
    label: '智能门锁',
    description: '门锁分组 · 未锁告警角标',
    icon: Lock,
    color: 'fav-ic-amber-deep',
    orbClass: 'fav-category-card__orb--orange',
    group: 'security',
    activeStates: ['unlocked', 'unlocking', 'open'],
  },
  {
    id: 'sensor',
    label: '环境传感',
    description: '系统时间线 · 事件日志关注',
    icon: Sliders,
    color: 'fav-ic-sky',
    orbClass: 'fav-category-card__orb--sky',
    group: 'environment',
  },
  {
    id: 'battery',
    label: '低电量监控',
    description: '快捷组低电量角标 · 电池弹窗',
    icon: BatteryWarning,
    color: 'fav-ic-rose',
    orbClass: 'fav-category-card__orb--rose',
    group: 'monitor',
  },
  {
    id: 'offline',
    label: '其它实体追踪',
    description: '离线设备弹窗 · 系统时间线',
    icon: Search,
    color: 'fav-ic-slate',
    orbClass: 'fav-category-card__orb--slate',
    group: 'monitor',
  },
]

/** FAVORITE_CATEGORY_MAP：常量，取值语义见定义处。 */
export const FAVORITE_CATEGORY_MAP = Object.fromEntries(
  FAVORITE_CATEGORIES.map((c) => [c.id, c]),
) as Record<string, FavoriteCategoryMeta>
