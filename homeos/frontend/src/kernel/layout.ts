import type { AgentCompanionConfig, HaConfig, SecurityCameraBinding } from '@/kernel/layout-config'
import type { DoorbellConfig } from '@/kernel/setup-wizard'
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
 * 悬浮伴侣位置工具
 * ---------------------------------------------------------------
 * 悬浮伴侣可自由拖动，位置以视口百分比中心点（`xPercent` / `yPercent`）保存。
 * 组件渲染与设置页滑块共用这里的归一化口径，避免两处换算结果对不上。
 */

/** 机器人直径（px），与 AgentCompanion.vue 的 .companion-root / .companion-trigger 一致 */
export const AGENT_COMPANION_FACE_SIZE = 66

/** 默认配置：贴左 3%、垂直 60%（与 stores/defaults.ts 同源） */
const DEFAULT_AGENT_COMPANION: AgentCompanionConfig = {
  enabled: true,
  xPercent: 3,
  yPercent: 60,
}

/** 百分比统一保留一位小数，避免拖动时写出一长串浮点数 */
export function roundCompanionPercent(value: number): number {
  return Math.round(value * 10) / 10
}

/** 视口百分比夹紧到 0-100（离屏保护由渲染侧按像素再做一次） */
export function clampCompanionPercent(value: unknown, fallback: number): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return roundCompanionPercent(fallback)
  return roundCompanionPercent(Math.min(100, Math.max(0, n)))
}

/**
 * 归一化悬浮伴侣配置：非法值回到默认。
 * 保存与读取共用同一口径，避免手改成 200% 后存进布局、下次打开又跳回默认。
 */
export function normalizeAgentCompanion(raw?: Partial<AgentCompanionConfig> | null): AgentCompanionConfig {
  return {
    enabled: raw?.enabled !== false,
    xPercent: clampCompanionPercent(raw?.xPercent, DEFAULT_AGENT_COMPANION.xPercent),
    yPercent: clampCompanionPercent(raw?.yPercent, DEFAULT_AGENT_COMPANION.yPercent),
  }
}

/**
 * 悬浮层的定位坐标系尺寸。
 *
 * 壳层开启整页等比缩放时，`position: fixed` 的百分比是相对被缩放的 `.app-shell`
 * 解析的（而不是窗口），两者尺寸相差 1/scale 倍。这里直接读壳层布局尺寸，
 * 避免在 947px 的窗口里把 1684px 的落点算成 36%。
 */
export function resolveAgentCompanionStageSize(): { width: number; height: number } {
  if (typeof document !== 'undefined') {
    const teleportTarget = document.getElementById('teleport-target')
    const shell = (teleportTarget?.parentElement ??
      document.querySelector<HTMLElement>('.app-shell')) as HTMLElement | null
    if (shell && shell.offsetWidth > 0 && shell.offsetHeight > 0) {
      return { width: shell.offsetWidth, height: shell.offsetHeight }
    }
  }
  return {
    width: typeof window === 'undefined' ? 0 : window.innerWidth,
    height: typeof window === 'undefined' ? 0 : window.innerHeight,
  }
}

/** 最终落点：两轴都按 0-100 夹紧（离屏像素保护在渲染侧）。 */
export function resolveAgentCompanionPosition(config: AgentCompanionConfig): {
  xPercent: number
  yPercent: number
} {
  return {
    xPercent: clampCompanionPercent(config.xPercent, DEFAULT_AGENT_COMPANION.xPercent),
    yPercent: clampCompanionPercent(config.yPercent, DEFAULT_AGENT_COMPANION.yPercent),
  }
}

/**
 * 整页等比缩放的画布数学。
 *
 * 抽成纯函数的原因：这套公式同时被主壳（`useScaling`）、锁屏（`computeScreensaverLayout`）
 * 与设置页预览消费，此前三处各自内联一份，改一处就会漂移；而且它是「换分辨率后布局是否
 * 变形」的唯一判据，必须能被独立断言（纯函数，不依赖渲染环境）。
 *
 * 契约（两个轴都必须成立）：
 *   1. `canvasW × scale == 视口宽`、`canvasH × scale == 视口高` —— 不出现黑边、不裁切；
 *   2. 两个方向共用同一个 `scale` —— 几何不变形；
 *   3. `canvasW ≥ 设计宽`、`canvasH ≥ 设计高` —— 只扩展画布，不压缩设计稿；
 *   4. `scale = min(视口宽/设计宽, 视口高/设计高)`，只封顶不抬底。
 *
 * 不再有「留边」与「触底滚动」两种历史分支：画布按比例扩展，多出来的空间交给
 * flex 布局列（右栏 / 页脚 / 3D 画布）自然吃掉。
 */

/** 可读性警戒线。**不是缩放下限**，只用于设置页提示字号偏小，不参与缩放计算。 */
export const MIN_SCALE = 0.72

/** 整页等比缩放的放大上限：超过它改用更宽的布局列，而不是继续放大字号。 */
export const MAX_UPSCALE = 1.5

/** 设计稿基准宽度缺省值（后端 ui.scaleBaseWidth 缺省同值）。 */
const DEFAULT_DESIGN_WIDTH = 1366

/** 设计稿基准高度缺省值（后端 ui.scaleBaseHeight 缺省同值）。 */
const DEFAULT_DESIGN_HEIGHT = 1024

/** 手机视口判定的短边阈值：低于它不再整页缩放（正文会被压到不可读）。 */
const PHONE_SHORT_SIDE_MAX = 600

/** 手机视口判定的宽度阈值：竖屏手机宽度必然低于它。 */
const PHONE_WIDTH_MAX = 640

/** `computeViewportLayout` 的结果：画布尺寸、缩放系数与可读性标记。 */
export interface CanvasLayout {
  /** 实际使用的缩放系数（contain 比与 MAX_UPSCALE 取小） */
  scale: number
  /** 完整显示设计稿所需的原始比例（未封顶），供设置页展示换算过程 */
  requiredScale: number
  /** 缩放比是否低于可读性警戒线（仅提示，不影响布局） */
  belowReadable: boolean
  /** 画布宽度（CSS px，未乘缩放比） */
  canvasW: number
  /** 画布高度（CSS px，未乘缩放比） */
  canvasH: number
  /** 设计稿基准宽度 */
  designW: number
  /** 设计稿基准高度 */
  designH: number
  /**
   * 兼容字段：缩放壳（`.app-shell`）的布局尺寸。
   *
   * 画布铺满后壳与内容区同尺寸 —— 旧实现里壳比内容宽（`vw / scale`），多出来的部分靠
   * 居中把内容挤在中间，等价于留边。现在两者恒等，保留字段名只是为了不打断既有调用方。
   */
  shellW: number
  /** 兼容字段，见 `shellW` */
  shellH: number
  /** 兼容字段：内容区宽度，与 `canvasW` 恒等 */
  contentW: number
  /** 兼容字段：内容区高度，与 `canvasH` 恒等 */
  contentH: number
}

/**
 * 把任意数值收敛成有限正数，读不出时回退缺省值。
 *
 * Why：`vw/vh` 来自 `clientWidth / clientHeight`，在隐藏标签页、折叠侧栏或首帧测量时
 * 会是 0 甚至 NaN，直接参与除法会得到 `Infinity`，再写进 `transform: scale()` 就是整页空白。
 *
 * @param value 原始数值
 * @param fallback 回退值
 * @returns 有限正数
 */
function positive(value: number, fallback: number) {
  return Number.isFinite(value) && value > 0 ? value : fallback
}

/**
 * 计算当前视口下的画布布局。
 *
 * @param vw 视口宽度（安全区内的可用内容盒宽度）
 * @param vh 视口高度（安全区内的可用内容盒高度）
 * @param designW 设计稿基准宽度
 * @param designH 设计稿基准高度
 * @returns 画布尺寸、缩放系数与可读性标记
 */
export function computeViewportLayout(vw: number, vh: number, designW: number, designH: number): CanvasLayout {
  const dw = positive(designW, DEFAULT_DESIGN_WIDTH)
  const dh = positive(designH, DEFAULT_DESIGN_HEIGHT)
  const width = positive(vw, dw)
  const height = positive(vh, dh)

  // contain：整体等比，两个方向都不溢出视口
  const requiredScale = Math.min(width / dw, height / dh)
  // 只封顶不抬底：contain 已保证不溢出，封顶是为了防止大屏把字号放到脱离设计基准。
  // 封顶后 `width / scale > dw` 必然成立（封顶的前提就是两个方向的比值都超过上限），
  // 所以下面两个 max() 只是数值兜底，不会真的把画布压回设计尺寸。
  const scale = Math.min(requiredScale, MAX_UPSCALE)
  const canvasW = Math.max(dw, width / scale)
  const canvasH = Math.max(dh, height / scale)

  return {
    scale,
    requiredScale,
    belowReadable: scale < MIN_SCALE,
    canvasW,
    canvasH,
    designW: dw,
    designH: dh,
    shellW: canvasW,
    shellH: canvasH,
    contentW: canvasW,
    contentH: canvasH,
  }
}

/**
 * 画布单位 CSS 变量。
 *
 * `--hos-vw/vh` 是画布逻辑尺寸，`--hos-screen-w/h` 是「一屏可见区域」换算到画布单位后的值。
 * 画布铺满视口后两者相等，但保留两组名字：弹窗/侧栏的 `max-height` 一直读
 * `--hos-screen-h`，语义上它才是「一屏」，`--hos-vh` 是「画布总高」，将来若引入可滚动
 * 画布就会分叉。
 *
 * @param layout 当前画布布局
 * @returns 注入到 `.app-shell` 的内联 CSS 变量
 */
export function buildCanvasVars(layout: CanvasLayout) {
  return {
    '--hos-vw': `${layout.canvasW}px`,
    '--hos-vh': `${layout.canvasH}px`,
    '--hos-screen-w': `${layout.canvasW}px`,
    '--hos-screen-h': `${layout.canvasH}px`,
  }
}

/**
 * 是否属于手机视口（此时整页等比缩放会把正文压到不可读）。
 *
 * 判据取「短边 < 600 或宽 < 640」：竖屏手机（390×844）、横屏手机（844×390）都命中，
 * 而平板（768×1024 短边 768、1024×768 短边 768）不受影响。
 *
 * @param vw 视口宽度
 * @param vh 视口高度
 * @returns 是手机视口返回 true
 */
export function isPhoneViewport(vw: number, vh: number) {
  const width = positive(vw, DEFAULT_DESIGN_WIDTH)
  const height = positive(vh, DEFAULT_DESIGN_HEIGHT)
  return width < PHONE_WIDTH_MAX || Math.min(width, height) < PHONE_SHORT_SIDE_MAX
}

/** 设计宽高的来源：布局配置的页面最大宽度 + 系统配置的缩放基准。 */
export interface DesignMetricsSource {
  /** `layoutConfig.pageMaxWidth`；缺省 / 非法时回退到 `ui.scaleBaseWidth` */
  pageMaxWidth?: number | null
  /** `ui` 配置段（`scaleBaseWidth` / `scaleBaseHeight`） */
  ui?: { scaleBaseWidth?: number | null; scaleBaseHeight?: number | null } | null
  /**
   * 当前视口（安全区内容盒，CSS px）。
   *
   * 传入后，**超宽屏**（宽高比 ≥ 2.0）会改用 16:9 系的设计基准，而不是把 4:3 设计
   * 横向摊开：`canvasW = vw/scale` 的算法保证画布比例永远等于视口比例，所以基准只影响
   * 「一个设计单位对应多少屏幕像素」。用 4:3 基准时 21:9 屏上卡片会被拉成细长条、
   * 右侧留白过多；换成 2560×1080 / 3840×1080 后版式接近设计稿。
   * 16:9 及更方的视口不受影响（仍然用配置值）。
   */
  viewport?: { width?: number | null; height?: number | null } | null
}

/** 超宽屏的设计基准档位（按宽高比从大到小匹配）。 */
export const ULTRAWIDE_BASELINES = [
  { minAspect: 3.0, width: 3840, height: 1080 },
  { minAspect: 2.0, width: 2560, height: 1080 },
] as const

/**
 * 按视口宽高比选择超宽基准；不是超宽屏时返回 `null`。
 *
 * @param viewportW 视口宽（CSS px）
 * @param viewportH 视口高（CSS px）
 * @returns 命中的基准档位，未命中返回 `null`
 */
export function pickUltrawideBaseline(viewportW: number, viewportH: number) {
  const width = Number(viewportW)
  const height = Number(viewportH)
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) return null
  const aspect = width / height
  for (const baseline of ULTRAWIDE_BASELINES) {
    if (aspect >= baseline.minAspect) return { width: baseline.width, height: baseline.height }
  }
  return null
}

/**
 * 解析生效的设计稿基准宽高。
 *
 * 此前 `ScaledViewport` / `useScaling` / `SettingsGeneralPanel` / `RightSidebar` / 屏保
 * 五处各写一份 fallback 链，顺序略有差异（有的把 `pageMaxWidth` 排在配置前，有的相反），
 * 导致设置页预览与真实壳层可能算出不同的设计基准。统一到这里。
 *
 * @param source 布局配置与 ui 配置
 * @returns 设计稿基准宽高（均为有限正数）
 */
export function resolveDesignMetrics(source: DesignMetricsSource) {
  const ui = source.ui ?? {}
  const pageMax = Number(source.pageMaxWidth)
  const explicitWidth =
    Number.isFinite(pageMax) && pageMax > 0 ? pageMax : positive(Number(ui.scaleBaseWidth), DEFAULT_DESIGN_WIDTH)
  const explicitHeight = positive(Number(ui.scaleBaseHeight), DEFAULT_DESIGN_HEIGHT)
  // 超宽屏（21:9 / 32:9）换 16:9 系基准：`pageMaxWidth` 是用户显式配置，优先保留；
  // 否则按视口比例选档，避免把 4:3 设计横向摊成细长条（见 `pickUltrawideBaseline`）。
  if (!(Number.isFinite(pageMax) && pageMax > 0) && source.viewport) {
    const preset = pickUltrawideBaseline(Number(source.viewport.width), Number(source.viewport.height))
    if (preset) return { width: preset.width, height: preset.height }
  }
  return { width: explicitWidth, height: explicitHeight }
}

/** 门铃配置工具。 */

/**
 * 确保 HaConfig 上存在 doorbells 数组（无则初始化为空数组）。
 * @param hc HA 配置对象
 * @returns doorbells 数组引用
 */
export function ensureDoorbellList(hc: HaConfig): DoorbellConfig[] {
  if (!hc.doorbells) hc.doorbells = []
  return hc.doorbells
}

/**
 * 解析有效门铃路由：仅保留配置了触发实体的门铃。
 * @param hc HA 配置对象
 * @returns 有效门铃配置列表
 */
export function resolveDoorbellRoutes(hc: HaConfig): DoorbellConfig[] {
  return Array.isArray(hc.doorbells) ? hc.doorbells.filter((d) => d.triggerEntityId) : []
}

/**
 * 收集所有门铃绑定的摄像头实体 id。
 * @param hc HA 配置对象
 * @returns 去空后的摄像头实体 id 列表
 */
export function collectDoorbellCameraIds(hc: HaConfig): string[] {
  return ensureDoorbellList(hc)
    .map((d) => String(d.cameraEntityId || '').trim())
    .filter(Boolean)
}

/**
 * 切换门铃摄像头绑定：若该摄像头已绑定则解绑，否则绑定到首个未占用门铃。
 * @param hc HA 配置对象
 * @param cam 摄像头实体 id
 * @returns true 表示发生绑定或解绑
 */
export function toggleDoorbellCamera(hc: HaConfig, cam: string): boolean {
  const list = ensureDoorbellList(hc)
  const hit = list.find((d) => d.cameraEntityId === cam)
  if (hit) {
    hit.cameraEntityId = ''
    return true
  }
  const target = list.find((d) => !String(d.cameraEntityId || '').trim()) || list[0]
  if (!target) return false
  target.cameraEntityId = cam
  return true
}

/**
 * 清除指定摄像头在所有门铃上的绑定。
 * @param hc HA 配置对象
 * @param cam 摄像头实体 id
 */
export function clearDoorbellCamera(hc: HaConfig, cam: string): void {
  for (const d of ensureDoorbellList(hc)) {
    if (d.cameraEntityId === cam) d.cameraEntityId = ''
  }
}

/**
 * 获取主门铃摄像头实体 id。
 * @param hc HA 配置对象
 * @returns 摄像头实体 id，无则空串
 */
export function primaryDoorbellCameraId(hc: HaConfig): string {
  return (
    resolveDoorbellRoutes(hc).find((d) => d.cameraEntityId)?.cameraEntityId ||
    ensureDoorbellList(hc).find((d) => d.cameraEntityId)?.cameraEntityId ||
    ''
  )
}

/** 内嵌页图标注册表工具。 */

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
export const embedIconMap = Object.fromEntries(EMBED_ICON_REGISTRY.map((item) => [item.key, item.icon]))

/** key → 主题色 的映射表 */
export const EMBED_ICON_ACCENTS = Object.fromEntries(EMBED_ICON_REGISTRY.map((item) => [item.key, item.accent]))

/** key → 中文标签 的映射表 */
export const EMBED_ICON_LABELS = Object.fromEntries(EMBED_ICON_REGISTRY.map((item) => [item.key, item.label]))

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

/** 内嵌页导航主题色工具。 */

/** 内嵌页列表序号 → Tab 主题色（按序循环） */
export const EMBED_TAB_ACCENTS = [
  '#22d3ee', // 0 青
  '#c084fc', // 1 紫
  '#4ade80', // 2 绿
  '#fbbf24', // 3 琥珀
  '#fb7185', // 4 玫红
  '#60a5fa', // 5 蓝
  '#fb923c', // 6 橙
  '#2dd4bf', // 7 蓝绿
]

/**
 * 按图标 key 解析主题色。
 * @param icon 图标 key，缺省回退 MonitorPlay
 * @returns 主题色，无匹配时回退首个 Tab 主题色
 */
export function resolveEmbedIconAccent(icon: string | null | undefined) {
  return EMBED_ICON_ACCENTS[icon || 'MonitorPlay'] || EMBED_TAB_ACCENTS[0]
}

/**
 * 按内嵌页序号解析 Tab 主题色。
 * @param _embed 内嵌页配置（暂未使用，保留以备扩展）
 * @param idx 内嵌页序号
 * @returns 主题色（按序循环）
 */
export function resolveEmbedTabAccent(_embed: unknown, idx: number) {
  return EMBED_TAB_ACCENTS[Math.max(0, idx) % EMBED_TAB_ACCENTS.length]
}

/**
 * 解析内嵌导航项的主题色（等价于按序号取 Tab 主题色）。
 * @param embed 内嵌页配置
 * @param idx 序号
 * @returns 主题色
 */
export function resolveEmbedNavAccent(embed: unknown, idx: number) {
  return resolveEmbedTabAccent(embed, idx)
}

/** 内嵌页 URL 工具。 */
/** 归一化主机名，便于比较 localhost / 127.0.0.1 / ::1 */

type LocationLike = Pick<Location, 'hostname' | 'protocol'>

/**
 * 归一化主机名：将 127.0.0.1 / ::1 统一为 localhost，其余转小写。
 * @param hostname 原始主机名
 * @returns 归一化后的主机名
 */
function normalizeEmbedHostname(hostname: string | null | undefined) {
  const h = String(hostname || '').toLowerCase()

  if (h === '127.0.0.1' || h === '[::1]' || h === '::1') return 'localhost'

  return h
}

/** 是否为当前 HomeOS 实例地址（不可 iframe 嵌入自身） */
function isSameAppEmbedUrl(urlString: string | null | undefined, currentLocation: LocationLike = window.location) {
  if (!urlString?.trim()) return false

  try {
    const target = new URL(urlString.trim())

    if (!/^https?:$/i.test(target.protocol)) return false

    // 同主机任意端口均视为 HomeOS 自身（常见误配：HTTPS :8803 访问、内嵌 http://LAN:8801）
    return normalizeEmbedHostname(target.hostname) === normalizeEmbedHostname(currentLocation.hostname)
  } catch {
    return false
  }
}

/**
 * 判断内嵌 URL 是否合法（http/https 协议且主机名非空）。
 * @param urlString 待校验 URL
 */
function isValidEmbedUrl(urlString: string | null | undefined) {
  if (!urlString?.trim()) return false

  try {
    const u = new URL(urlString.trim())

    return /^https?:$/i.test(u.protocol) && u.hostname.length > 0
  } catch {
    return false
  }
}

/**
 * 内嵌目标是否可经后端同源反代承载。
 * 与后端 validateEmbedTargetUrl 放行范围一致：仅局域网地址，排除 localhost/127.0.0.1。
 */
function isProxyableEmbedHost(hostname: string | null | undefined): boolean {
  const h = normalizeEmbedHostname(hostname)

  if (h === 'localhost') return false

  return (
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h) ||
    h.endsWith('.local')
  )
}

/**
 * 是否应将内嵌页改走 /api/v1/embed-proxy 同源反代。
 *
 * 对「可反代的局域网目标」一律走同源反代，因为这是让内嵌站**登录会话**成立的唯一方式：
 * 直连 iframe 为跨站第三方上下文，内嵌站会话 Cookie（默认 SameSite=Lax）不会在跨站
 * iframe 请求中发送，登录态无法保持；同源反代后这些 Cookie 写在 HomeOS 同源下变为第一方。
 *
 * 资源加载由三重保障：① 后端静态改写（HTML 属性根相对 URL、按扩展名的资源路径、`url()`）；
 * ② 注入运行时垫片（拦截 fetch/XHR/EventSource/WebSocket 的根相对地址）；
 * ③ 后端 Referer 兜底（任何逃逸到 HomeOS 根、Referer 指向内嵌页的子资源自动转回反代）。
 *
 * 公网目标无法反代（后端 SSRF 仅放行局域网）：HTTPS 父页内嵌 HTTP 时仍须反代（混合内容
 * 无法直连），其余退化为直连 iframe。
 */
function needsEmbedProxy(urlString: string, currentLocation: LocationLike = window.location): boolean {
  const trimmed = urlString?.trim()

  if (!trimmed) return false

  try {
    const target = new URL(trimmed)

    if (!/^https?:$/i.test(target.protocol)) return false

    if (isProxyableEmbedHost(target.hostname)) return true

    return currentLocation?.protocol === 'https:' && target.protocol === 'http:'
  } catch {
    return false
  }
}

/** 构建 iframe src：HTTPS 下 HTTP 内嵌页走 /api/v1/embed-proxy/:id */
export function resolveEmbedIframeSrc(
  embedId: string,
  urlString: string,
  currentLocation: LocationLike = window.location,
): string {
  const trimmed = urlString?.trim()

  if (!trimmed || !embedId) return trimmed || ''

  if (needsEmbedProxy(trimmed, currentLocation)) {
    // 反代以上游 origin 为基准（见后端 resolveEmbedBaseUrl）：须把配置 URL 的路径（如 /p）
    // 带入反代路径，内嵌应用才在其 base 路径下加载；其根相对绝对资源（/p/assets/x.js）经反代
    // 映射回上游同一路径，不会重复拼接为 /p/p/...。根路径保留末尾斜杠以便会话 Cookie 回传。

    let suffix = '/'

    try {
      const p = new URL(trimmed).pathname

      // 末尾保留斜杠：基路径型 SPA 的路由 basename 为 `/p/`，反代后被重定位为
      // `/api/v1/embed-proxy/<id>/p/`，iframe 须以该带尾斜杠路径加载，location.pathname
      // 方能命中 basename 前缀，否则 BrowserRouter 不匹配而白屏。
      suffix = p && p !== '/' ? (p.endsWith('/') ? p : `${p}/`) : '/'
    } catch {
      /* 解析失败回退根路径 */
    }

    return `/api/v1/embed-proxy/${encodeURIComponent(embedId)}${suffix}`
  }

  return trimmed
}

/**
 * 返回阻止嵌入的原因文案；可嵌入时返回 null。
 * @param urlString 待校验 URL
 * @param currentLocation 当前页面 location
 * @returns 阻止原因文案，或 null 表示可嵌入
 */
export function getEmbedBlockReason(
  urlString: string | null | undefined,
  currentLocation: LocationLike = window.location,
) {
  if (!urlString?.trim()) return null

  if (!isValidEmbedUrl(urlString)) return '内嵌地址无效，请填写以 http:// 或 https:// 开头的完整 URL。'

  if (isSameAppEmbedUrl(urlString, currentLocation))
    return '不能将 HomeOS 自身地址（相同主机名，含其它端口）作为内嵌页。请填写外部系统的完整 URL，例如 NAS、MoviePilot 等服务的地址。'

  return null
}

/**
 * iframe load 后检测是否落在 Chrome 错误页（仅同源可读）。
 * @param iframeEl iframe 元素
 * @returns true 表示落在错误页或空白页
 */
export function isIframeChromeError(iframeEl: HTMLIFrameElement | null | undefined) {
  if (!iframeEl?.contentWindow) return false

  try {
    const href = iframeEl.contentWindow.location.href

    return !href || href === 'about:blank' || href.startsWith('chrome-error://')
  } catch {
    return false
  }
}

/** 离开内嵌页时清除 embed_ctx 标记 Cookie，避免 SPA fallback 误劫持 HomeOS 资源请求 */
const EMBED_CTX_COOKIE_PREFIX = 'embed_ctx__'

/**
 * 设置 embed_ctx 标记 Cookie（HTTPS 下追加 Secure）。
 * @param embedId 内嵌页 id
 */
export function setEmbedCtxCookie(embedId: string) {
  const id = String(embedId || '').trim()
  if (!id) return
  const name = `${EMBED_CTX_COOKIE_PREFIX}${encodeURIComponent(id)}`
  const securePart = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=1; Path=/; SameSite=Lax${securePart}`
}

/**
 * 清除所有 embed_ctx 标记 Cookie（遍历 document.cookie 并置 Max-Age=0）。
 */
export function clearAllEmbedCtxCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (!name?.startsWith(EMBED_CTX_COOKIE_PREFIX)) continue
    const base = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
    document.cookie = base
    if (window.location.protocol === 'https:') {
      document.cookie = `${base}; Secure`
    }
  }
}

/**
 * MoviePilot 地址的唯一解析入口。
 *
 * 唯一真源是 `layout.mediaConfig.mpUrl`（「设置 → 媒体与入库」里填的那一栏）。
 *
 * 历史背景（已清理）：这里曾经还要在读侧合并 `layout.moviePilotUrl` —— 那是「内嵌网页
 * 管理」里另开的一个输入框，两个位置描述同一台服务，只填一处就会出现「能打开页面但轮询
 * 不到入库」或反过来。作为全新系统交付时该字段已删除，因此本模块不再做「两处择一」，
 * 也不再提供迁移提示（没有旧值可迁）。
 */

export type MoviePilotUrlSource =
  | {
      mediaConfig?: { mpUrl?: string | null } | null
    }
  | null
  | undefined

/** 媒体库地址；未配置时返回空串（调用方据此判定「未配置」）。 */
export function resolveMoviePilotUrl(layout: MoviePilotUrlSource): string {
  return String(layout?.mediaConfig?.mpUrl || '').trim()
}

/** 顶栏导航 Tab 工具。 */

/** 内置品牌 Logo（仓库根 assets/logo/logo.svg，可替换；Nest 托管 /logo/*） */
export const DEFAULT_BRAND_LOGO_URL = '/logo/logo.svg'

/** 顶栏核心 Tab 默认顺序（不含总览/设置） */
export const NAV_TAB_ORDER_DEFAULT = ['devices', 'security']

/** 可选 Tab：默认隐藏，可在设置→基础设置中启用并排序 */
export const NAV_OPTIONAL_TAB_IDS = ['events', 'notifications', 'earthquake-history'] as const

/** 可见标签在顶栏的展示位置 */
export type NavTabPlacement = 'bar' | 'dropdown'

/** Tab 展示位置默认值：顶栏 */
const NAV_TAB_PLACEMENT_DEFAULT: NavTabPlacement = 'bar'

/** Tab id → 路由路径映射 */
export const NAV_TAB_PATHS: Record<string, string> = {
  devices: '/devices',
  security: '/security',
  events: '/events',
  notifications: '/notifications',
  'earthquake-history': '/earthquake-history',
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
  /** 媒体库里的 MoviePilot 地址（唯一真源，见 moviepilot-url.util） */
  mediaConfig?: { mpUrl?: string | null } | null
  navTabOrder?: string[] | null
  navTabVisibility?: Record<string, boolean | undefined> | null
  navTabPlacement?: Record<string, NavTabPlacement | undefined> | null
}

/**
 * 删除指定 Tab id 在顺序 / 可见性 / 放置中的引用。
 */
function removeNavTabRefs(layout: EmbedNavTabLayoutFields, tabIds: Iterable<string>): void {
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
export function pruneNavTabsForRemovedEmbed(layout: EmbedNavTabLayoutFields, embedId: string): void {
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

  // 只在「媒体与入库」填了 mpUrl 也算已配置：两个字段描述同一台服务（见 moviepilot-url.util）
  if (embeds.length === 0 && resolveMoviePilotUrl(layout)) {
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
/**
 * 某个 Tab id 是否该出现在顶栏里（总览 / 设置是固定的两页，不走 Tab 列表）。
 *
 * 内嵌页（`embed-*` / `media`）只保留当前仍然有效的那批，避免已删除的内嵌页在
 * 导航编辑器里留下孤儿项。
 */
function shouldKeepNavTabId(id: string, knownBuiltIns: Set<string>, knownExtra: Set<string>): boolean {
  if (!id || id === 'dashboard' || id === 'settings') return false
  if (isEmbedNavTabId(id)) return knownExtra.has(id)
  return knownBuiltIns.has(id)
}

export function resolveOrderedNavTabIds(navTabOrder: string[] | null | undefined, extraIds: string[] = []): string[] {
  const base = Array.isArray(navTabOrder) && navTabOrder.length ? [...navTabOrder] : [...NAV_TAB_ORDER_DEFAULT]
  const knownBuiltIns = new Set<string>([...NAV_TAB_ORDER_DEFAULT, ...NAV_OPTIONAL_TAB_IDS])
  const knownExtra = new Set(extraIds.filter(Boolean))

  // 去重与「是否已收录」都走集合：此前 `ordered.includes()` 套在循环里是 O(n²)
  // （800 个内嵌 Tab 时实测 0.89ms，Tab 数继续长下去就是几十毫秒）。
  const seen = new Set<string>()
  const ordered: string[] = []
  const push = (id: string) => {
    if (seen.has(id)) return
    seen.add(id)
    ordered.push(id)
  }

  for (const id of base) if (shouldKeepNavTabId(id, knownBuiltIns, knownExtra)) push(id)
  for (const id of knownBuiltIns) push(id)
  for (const id of knownExtra) push(id)
  return ordered
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

/** 安防摄像头绑定工具：`[{entityId, go2rtcUrl?}]`。 */

/**
 * 把布局里的安防摄像头绑定归一成结构化列表。
 *
 * 每项可以只绑 HA 实体，也可以再带一个局域网 go2rtc 地址（走同源 MSE 中继）。
 *
 * @param rawSecurityCameras haConfig.securityCameras 原始值（任意形状）
 * @returns 归一后的绑定列表（保持原顺序；空卡位保留，便于设置页继续编辑）
 */
export function normalizeSecurityCameras(rawSecurityCameras: unknown): SecurityCameraBinding[] {
  if (!Array.isArray(rawSecurityCameras)) return []
  const normalizedBindings: SecurityCameraBinding[] = []
  for (const rawCameraEntry of rawSecurityCameras) {
    if (rawCameraEntry == null || typeof rawCameraEntry !== 'object') continue
    const rawBinding = rawCameraEntry as Partial<SecurityCameraBinding>,
      entityId = String(rawBinding.entityId || '').trim(),
      go2rtcUrl = String(rawBinding.go2rtcUrl || '').trim()
    normalizedBindings.push(go2rtcUrl ? { entityId, go2rtcUrl } : { entityId })
  }
  return normalizedBindings
}

/**
 * 取安防摄像头绑定的实体 ID 列表。
 *
 * @param hc HA 配置对象
 * @returns 去空后的摄像头实体 ID 列表
 */
export function securityCameraEntityIds(hc: HaConfig | null | undefined): string[] {
  return normalizeSecurityCameras(hc?.securityCameras)
    .map((binding) => binding.entityId)
    .filter(Boolean)
}

/**
 * 按实体 ID 取该摄像头的 go2rtc 地址。
 *
 * @param hc HA 配置对象
 * @param entityId 摄像头实体 ID
 * @returns go2rtc 地址，未配置时空串
 */
export function securityCameraGo2rtcUrl(hc: HaConfig | null | undefined, entityId: string): string {
  const normalizedEntityId = String(entityId || '').trim()
  if (!normalizedEntityId) return ''
  return (
    normalizeSecurityCameras(hc?.securityCameras).find((binding) => binding.entityId === normalizedEntityId)
      ?.go2rtcUrl || ''
  )
}
