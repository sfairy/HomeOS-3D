/** 设置面板导航元数据与图标注册表 */
import type { Component } from 'vue'
/**
 * Settings 面板注册表与导航元数据
 * 组装设置侧栏导航分组（含图标），并转出
 * 默认 Tab、有效性校验、独立保存集合与 PANEL_MAP 等元数据供容器消费。
 */
import {
  Star,
  Settings as SettingsIcon,
  Layout,
  Globe,
  Puzzle,
  Grip,
  Wifi,
  Shield,
  Zap,
  Bell,
  Sliders,
  Link2,
  Monitor,
  UserCog,
  Layers,
  Mic,
  Activity,
  History,
  PlugZap,
  MapPin,
  Wand2,
  Workflow,
  Radio,
  Home,
  House,
  Thermometer,
  Image,
  Bot,
  Cpu,
  Database,
  KeyRound,
} from '@lucide/vue'
import {
  DEFAULT_TAB,
  NAV_STRUCTURE,
  groupLabel,
  tabLabel,
  resolveTab,
  isValidSettingsTab,
  INDEPENDENT_SAVE_TABS,
  isTabFeatureGranted,
} from '@/shared/utils/registry/settings-nav.util'
import { PANEL_MAP } from '@/features/settings/panel-chunks'

export {
  DEFAULT_TAB,
  resolveTab,
  isValidSettingsTab,
  INDEPENDENT_SAVE_TABS,
}

export { PANEL_MAP }

// Tab ID 到图标的映射表，用于侧栏 Tab 项渲染
const TAB_ICONS: Record<string, Component> = {
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
  'setup-wizard': Wand2,
  general: SettingsIcon,
  profiles: Monitor,
  family: Home,
  access: UserCog,
  params: Sliders,
  diagnostics: Activity,
  'execution-history': History,
  devices: Cpu,
  retention: Database,
  network: Globe,
  license: KeyRound,
}

// 分组 ID 到图标的映射表，用于侧栏分组标题渲染
const GROUP_ICONS: Record<string, Component> = {
  connect: Link2,
  home: Home,
  display: Layers,
  automate: Workflow,
  interact: Radio,
  system: SettingsIcon,
}

// 构建侧栏导航分组：按功能码明细收起未授权的模块 Tab，并附加图标与独立保存标记
export function buildNavGroups(featureAccess?: Record<string, boolean>) {
  return NAV_STRUCTURE.map((group) => ({
    id: group.id,
    label: groupLabel(group.id),
    icon: GROUP_ICONS[group.id],
    tabs: group.tabs
      .filter((id) => isTabFeatureGranted(id, featureAccess))
      .map((id) => ({
        id,
        label: tabLabel(id),
        icon: TAB_ICONS[id],
        independentSave: INDEPENDENT_SAVE_TABS.has(id),
      })),
  })).filter((group) => group.tabs.length > 0)
}
