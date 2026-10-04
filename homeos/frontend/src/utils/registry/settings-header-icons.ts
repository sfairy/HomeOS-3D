/**
 * 设置页标题栏图标映射表
 *
 * 职责：
 * - 维护设置页标题栏可选图标键 → @lucide/vue 组件的映射（SETTINGS_HEADER_ICONS）。
 * - 维护设置页各 Tab id → 标题图标组件的映射（SETTINGS_TAB_HEADER_ICONS）。
 * - 供设置页标题栏按用户选择的图标键或 Tab 渲染对应图标。
 *
 * 依赖：@lucide/vue 图标组件库。
 *
 * 注意：
 * - 对象 key 为图标键 / Tab id（如 star、favorites、layout），属于配置 key，不翻译。
 * - value 为图标组件引用，不翻译。
 */
import {
  Star,
  Settings,
  Layout,
  Puzzle,
  Grip,
  Globe,
  Link2,
  Wifi,
  Shield,
  Zap,
  Bell,
  Monitor,
  UserCog,
  SlidersHorizontal,
  Mic,
  History,
  Activity,
  Sparkles,
  PlugZap,
  MapPin,
  Smartphone,
  Thermometer,
  Workflow,
  Image,
  House,
  Home,
  Bot,
} from '@lucide/vue'

/** SettingsPageHeader 图标键 → 组件 */
export const SETTINGS_HEADER_ICONS = {
  star: Star,
  settings: Settings,
  layout: Layout,
  image: Image,
  puzzle: Puzzle,
  grip: Grip,
  globe: Globe,
  link: Link2,
  wifi: Wifi,
  shield: Shield,
  zap: Zap,
  bell: Bell,
  monitor: Monitor,
  user: UserCog,
  sliders: SlidersHorizontal,
  mic: Mic,
  history: History,
  activity: Activity,
  sparkles: Sparkles,
  'plug-zap': PlugZap,
  'map-pin': MapPin,
  smartphone: Smartphone,
  house: House,
  home: Home,
}

/** 按 settings tab id 回退（与 settings-nav.js TAB_ICONS 一致） */
export const SETTINGS_TAB_HEADER_ICONS = {
  favorites: Star,
  layout: Layout,
  assets: Image,
  widgets: Puzzle,
  floating: Grip,
  embeds: Globe,
  connection: Link2,
  rooms: MapPin,
  bindings: Wifi,
  voice: Mic,
  agent: Bot,
  'security-modes': Shield,
  'smart-charge': PlugZap,
  'life-accounts': Zap,
  'env-health': Thermometer,
  orchestrator: Workflow,
  'home-mode': House,
  alerts: Bell,
  'setup-wizard': Sparkles,
  general: Settings,
  family: Home,
  profiles: Monitor,
  access: UserCog,
  params: SlidersHorizontal,
  diagnostics: Activity,
  'execution-history': History,
}
