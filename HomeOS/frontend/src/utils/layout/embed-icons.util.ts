/**
 * 内嵌页图标注册表工具。
 *
 * 职责：维护内嵌页可选图标的注册表（key / label / accent / icon 组件），
 * 并提供按 key 或序号解析图标组件、主题色与标签的能力。
 *
 * 注意：EMBED_ICON_REGISTRY 的 key 会持久化到 layoutConfig，勿随意改名。
 *
 * 依赖：@lucide/vue 提供图标组件。
 */
import {
  Monitor,
  Video,
  Globe,
  Tv,
  Film,
  Music,
  Headphones,
  Radio,
  Camera,
  Image,
  Clapperboard,
  Gamepad,
  LayoutDashboard,
  BarChart3,
  Server,
  Database,
  Cloud,
  HardDrive,
  Router,
  Wifi,
  Home,
  Heart,
  Bot,
  BookOpen,
  Newspaper,
  Calendar,
  MapPin,
  ShoppingBag,
  MessageCircle,
  Shield,
  Sun,
  FileText,
} from '@lucide/vue'

/**
 * 内嵌页可选图标注册表（key 持久化到 layoutConfig，勿随意改名）。
 * 每项含：key（图标标识）、label（中文标签）、accent（主题色）、icon（Vue 组件）。
 */
const EMBED_ICON_REGISTRY = [
  { key: 'MonitorPlay', label: '媒体', accent: '#60a5fa', icon: Monitor },
  { key: 'Video', label: '视频', accent: '#f472b6', icon: Video },
  { key: 'Globe', label: '网页', accent: '#22d3ee', icon: Globe },
  { key: 'Tv', label: '电视', accent: '#a78bfa', icon: Tv },
  { key: 'Film', label: '影视', accent: '#e879f9', icon: Film },
  { key: 'Music', label: '音乐', accent: '#c084fc', icon: Music },
  { key: 'Headphones', label: '播客', accent: '#a3e635', icon: Headphones },
  { key: 'Radio', label: '广播', accent: '#facc15', icon: Radio },
  { key: 'Camera', label: '监控', accent: '#4ade80', icon: Camera },
  { key: 'Image', label: '相册', accent: '#2dd4bf', icon: Image },
  { key: 'Clapperboard', label: '影院', accent: '#fb7185', icon: Clapperboard },
  { key: 'Gamepad', label: '游戏', accent: '#fbbf24', icon: Gamepad },
  { key: 'LayoutDashboard', label: '面板', accent: '#fb923c', icon: LayoutDashboard },
  { key: 'BarChart3', label: '统计', accent: '#38bdf8', icon: BarChart3 },
  { key: 'Server', label: '服务', accent: '#34d399', icon: Server },
  { key: 'Database', label: '数据', accent: '#10b981', icon: Database },
  { key: 'Cloud', label: '云盘', accent: '#7dd3fc', icon: Cloud },
  { key: 'HardDrive', label: '存储', accent: '#94a3b8', icon: HardDrive },
  { key: 'Router', label: '路由', accent: '#818cf8', icon: Router },
  { key: 'Wifi', label: '网络', accent: '#67e8f9', icon: Wifi },
  { key: 'Home', label: '家居', accent: '#fcd34d', icon: Home },
  { key: 'Heart', label: '伴侣', accent: '#f472b6', icon: Heart },
  { key: 'Bot', label: '智能', accent: '#c4b5fd', icon: Bot },
  { key: 'BookOpen', label: '阅读', accent: '#fdba74', icon: BookOpen },
  { key: 'Newspaper', label: '资讯', accent: '#86efac', icon: Newspaper },
  { key: 'Calendar', label: '日历', accent: '#fca5a5', icon: Calendar },
  { key: 'MapPin', label: '地图', accent: '#5eead4', icon: MapPin },
  { key: 'ShoppingBag', label: '商城', accent: '#f9a8d4', icon: ShoppingBag },
  { key: 'MessageCircle', label: '社交', accent: '#93c5fd', icon: MessageCircle },
  { key: 'Shield', label: '安全', accent: '#f87171', icon: Shield },
  { key: 'Sun', label: '天气', accent: '#fde047', icon: Sun },
  { key: 'FileText', label: '文档', accent: '#d4d4d8', icon: FileText },
]

/** 所有内嵌页图标的 key 列表 */
export const embedLucidIcons = EMBED_ICON_REGISTRY.map((item) => item.key)

/** key → 图标组件 的映射表 */
export const embedIconMap = Object.fromEntries(
  EMBED_ICON_REGISTRY.map((item) => [item.key, item.icon]),
)

/** key → 主题色 的映射表 */
export const EMBED_ICON_ACCENTS = Object.fromEntries(
  EMBED_ICON_REGISTRY.map((item) => [item.key, item.accent]),
)

/** key → 中文标签 的映射表 */
export const EMBED_ICON_LABELS = Object.fromEntries(
  EMBED_ICON_REGISTRY.map((item) => [item.key, item.label]),
)

/**
 * 按序号循环解析图标 key（负数归零，超出长度取模）。
 * @param idx 序号
 * @returns 图标 key
 */
export function resolveEmbedIconByIndex(idx: number) {
  return embedLucidIcons[Math.max(0, idx) % embedLucidIcons.length]
}

/**
 * 按 key 解析图标组件，缺省或无匹配时回退 Monitor。
 * @param iconKey 图标 key
 * @returns Vue 图标组件
 */
export function resolveEmbedIconComponent(iconKey: string | null | undefined) {
  return embedIconMap[iconKey || 'MonitorPlay'] || Monitor
}