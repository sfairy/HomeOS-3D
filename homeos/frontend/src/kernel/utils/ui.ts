import { resolveEffectivePerformanceMode, pauseFpsScheduler, resumeFpsScheduler } from '@/kernel/utils/perf'
import { readLocalStorage, clampNum, removeLocalStorage } from '@/kernel/utils/core'
import { Home, ShieldCheck, MonitorPlay, Settings, Smartphone, Sparkles, Zap, ScrollText, Bell, Activity, LayoutDashboard, Leaf } from '@lucide/vue'
import { type Component, isRef, type Ref, ref } from 'vue'
import { embedNavTabId, isNavTabVisible, isNavTabInDropdown, resolveOrderedNavTabIds, NAV_TAB_PATHS, type NavTabPlacement, EMBED_TAB_ACCENTS, resolveEmbedNavAccent, embedIconMap, resolveMoviePilotUrl } from '@/kernel/utils/layout'

/**
 * 图表容器 ResizeObserver（比 window.resize 更准，适配整页 scale）
 * ECharts 须在布局完成后的帧中调用 setOption / resize，避免 main process 警告。
 */

/** owner → 待执行 rAF 句柄（outer 外层、inner 内层），用于按 owner 取消 */
const pendingTasks = new WeakMap<object, { outer?: number; inner?: number }>()

/** 推迟到下一绘制帧之后执行（双 rAF，避开 Vue 同步更新周期） */
export function scheduleEchartsTask(owner: object, fn: () => void) {
  cancelScheduledEchartsTask(owner)
  const pending: { outer?: number; inner?: number } = {}
  pendingTasks.set(owner, pending)
  pending.outer = requestAnimationFrame(() => {
    pending.inner = requestAnimationFrame(() => {
      pendingTasks.delete(owner)
      fn()
    })
  })
}

/**
 * 取消指定 owner 已调度的 ECharts 任务。
 * @param owner 任务归属对象
 */
export function cancelScheduledEchartsTask(owner: object) {
  const pending = pendingTasks.get(owner)
  if (!pending) return
  if (pending.outer) cancelAnimationFrame(pending.outer)
  if (pending.inner) cancelAnimationFrame(pending.inner)
  pendingTasks.delete(owner)
}

/**
 * 为图表容器挂载 ResizeObserver，尺寸变化时按双 rAF 调度回调。
 *
 * 副作用：创建 ResizeObserver 并 observe(el)；返回的销毁函数会取消调度并 disconnect。
 *
 * @param el 图表容器元素
 * @param onResize 尺寸变化回调
 * @param owner 任务归属对象，默认取 el
 * @returns 销毁函数；el 非法或环境无 ResizeObserver 时返回 null
 */
export function observeChartResize(
  el: HTMLElement | null | undefined,
  onResize: () => void,
  owner: object = el ?? {},
): (() => void) | null {
  if (!(el instanceof Element) || typeof ResizeObserver === 'undefined') return null
  const ro = new ResizeObserver(() => scheduleEchartsTask(owner, onResize))
  ro.observe(el)
  return () => {
    cancelScheduledEchartsTask(owner)
    ro.disconnect()
  }
}

/** HEX 颜色工具（全局唯一实现） */

/** RGB 通道值对象 */
interface Rgb {
  r: number
  g: number
  b: number
}

/**
 * 把颜色字符串规范化为 6 位大写 HEX（含 #）。
 *
 * 支持 3 位 HEX 展开、自动补 # 前缀；非法格式返回 null。
 */
function normalizeHexColor(color: string | null | undefined): string | null {
  if (!color) return null
  const raw = String(color).trim()
  if (!raw) return null
  const hex = raw.startsWith('#') ? raw : `#${raw}`
  if (/^#[0-9a-fA-F]{6}$/.test(hex)) return hex.toUpperCase()
  if (/^#[0-9a-fA-F]{3}$/.test(hex)) {
    const [, a, b, c] = hex
    return `#${a}${a}${b}${b}${c}${c}`.toUpperCase()
  }
  return null
}

/**
 * 将十六进制颜色字符串解析为 RGB 对象。
 *
 * 仅接受 6 位 HEX（# 前缀可选）；长度不为 6 或解析失败时返回 null。
 */
export function hexToRgb(hex: string | undefined | null): Rgb | null {
  const h = (hex || '').replace('#', '')
  if (h.length !== 6) return null
  const n = parseInt(h, 16)
  if (Number.isNaN(n)) return null
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 }
}

/**
 * HEX（3/6 位）→ RGB 分量，**永不返回 null**：非法输入回落黑。
 *
 * 存在的理由是「调用方拿不到颜色就用黑」这一类分支。这类分支此前在 `light-control-core` 与
 * studio 的 `editor-utils` 里各自抄了一份**不校验**的解析（`parseInt` 直接切字符串），
 * 非法输入会产出 `NaN` 通道 —— 写进 `style` 后整条声明静默失效（CSS 不报错，界面只是不生效）。
 * 统一到这里后既保留校验，又不逼每个调用方写 null 分支。
 */
export function hexToRgbOrBlack(hex: string | undefined | null): Rgb {
  return hexToRgb(normalizeHexColor(hex) ?? hex ?? '') ?? { r: 0, g: 0, b: 0 }
}

/**
 * 把 HEX 转为 CSS `r, g, b` 通道串，供 `--accent-rgb` 使用。
 */
export function hexToRgbChannels(hex: string | null | undefined, fallback = '148, 163, 184'): string {
  const rgb = hexToRgb(normalizeHexColor(hex) || hex || '')
  if (!rgb) return fallback
  return `${rgb.r}, ${rgb.g}, ${rgb.b}`
}

/** `#RRGGBB` 颜色的 WCAG 相对亮度；非法输入返回 null。 */
export function relativeLuminance(hex: string | null | undefined): number | null {
  const rgb = hexToRgb(normalizeHexColor(hex) || hex || '')
  if (!rgb) return null
  const channel = (value: number) => {
    const c = value / 255
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(rgb.r) + 0.7152 * channel(rgb.g) + 0.0722 * channel(rgb.b)
}

/** 两个 `#RRGGBB` 颜色的 WCAG 对比度（1–21）；任一非法输入返回 null。 */
export function contrastRatio(
  foreground: string | null | undefined,
  background: string | null | undefined,
): number | null {
  const a = relativeLuminance(foreground)
  const b = relativeLuminance(background)
  if (a === null || b === null) return null
  const [light, dark] = a > b ? [a, b] : [b, a]
  return (light + 0.05) / (dark + 0.05)
}

/** 强调色在深色画布上的最低对比度（非文本控件 / 焦点环，WCAG 1.4.11）。 */
const ACCENT_MIN_SURFACE_CONTRAST = 3
/** 强调色本身作为文字、或强调底上的文字所需的最低对比度（WCAG 1.4.3）。 */
const ACCENT_MIN_TEXT_CONTRAST = 4.5

/**
 * 把后台 `ui.accentColor` 收敛到可读范围。
 *
 * 强调色同时被用作深色画布上的文字/边框和按钮底色（按钮文字是 `--hos-fg-on-accent`），
 * 单一颜色必须同时满足两侧对比度；否则导航高亮、选中态和主按钮会不可读。
 * 非法或过暗的颜色回落到系统蓝，并在调用侧给出一次警告，不静默接受不可读配置。
 */
export function resolveReadableAccent(
  accent: string | null | undefined,
  fallback = '#0A84FF',
  canvas = '#070a0f',
  onAccent = '#041018',
): string {
  const normalized = normalizeHexColor(accent)
  if (!normalized) return normalizeHexColor(fallback) ?? fallback
  const surface = contrastRatio(normalized, canvas)
  const text = contrastRatio(normalized, onAccent)
  if (surface === null || text === null) return normalizeHexColor(fallback) ?? fallback
  if (surface < ACCENT_MIN_SURFACE_CONTRAST || text < ACCENT_MIN_TEXT_CONTRAST) {
    return normalizeHexColor(fallback) ?? fallback
  }
  return normalized
}

/**
 * 十六进制色 → rgba 字符串（供渐变 colorStops 使用）。
 *
 * 仅接受 6 位 HEX（# 前缀可选，允许首尾空白）；非法时原样返回输入。
 */
export function hexWithOpacity(hex: string, opacity: number): string {
  const match = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex.trim())
  if (!match) return hex
  return `rgba(${parseInt(match[1], 16)}, ${parseInt(match[2], 16)}, ${parseInt(match[3], 16)}, ${opacity})`
}

/** 毛玻璃渲染策略：native（实时 blur）| static（伪毛玻璃）| auto（触屏/static） */

/**
 * 检测当前环境是否为粗指针（触屏设备）。触屏通常不具备实时 blur 性能。
 * @returns 触屏返回 true
 */
function isCoarsePointer() {
  if (typeof matchMedia !== 'function') return false
  return matchMedia('(pointer: coarse)').matches
}

/**
 * @param {string} [override] layoutConfig.glassEffect
 * @param {string} [performanceMode]
 * @returns {'native'|'static'}
 */
function resolveGlassEffect(
  override: string | null | undefined,
  performanceMode: string | null | undefined,
): 'native' | 'static' {
  const mode = override || 'auto'
  if (mode === 'native') return 'native'
  if (mode === 'static') return 'static'
  if (performanceMode === 'low' || performanceMode === 'medium') return 'static'
  if (isCoarsePointer()) return 'static'
  return 'native'
}

/** 写入 documentElement data-glass-effect */
export function applyGlassEffectDocument(
  override: string | null | undefined,
  performanceMode: string | null | undefined,
) {
  if (typeof document === 'undefined') return
  const effect = resolveGlassEffect(override, performanceMode)
  // 档位没变就一个属性都不写：入户页会在挂载前后各调一次，写入同样的值仍会挂一次
  // attribute mutation —— 那是多余的一次样式失效判定，正是要避免的开销。
  if (document.documentElement.dataset.glassEffect === effect) return
  document.documentElement.dataset.glassEffect = effect
}

/**
 * 首帧之前先按**设备**定一次 glass 档位（不看配置）。
 *
 * 之前写入 `<html data-glass-effect>` 的唯一时机是配置到达后的 `setupGlassEffectSync()`
 * ——那在入户页是**挂载之后**。于是手机/平板上的第一帧按「无属性 = native」渲染，
 * 真的跑了一遍 `backdrop-filter: blur()`；配置回来瞬间又翻成 `static` 实底，
 * 用户看到的就是表单整体变一次色、变一次模糊。这是入户页最刺眼的一下。
 *
 * 这里用的判定与 `resolveGlassEffect(undefined, undefined)` 完全一致（粗指针 → static），
 * 因此配置若说 `auto` 且性能档正常，后续写入的值与本函数**相同**、不会产生任何翻转；
 * 只有用户显式选了 native/static 或性能模式降档时才覆盖，那是配置意图，不是闪烁。
 */
export function primeGlassEffectDocument() {
  if (typeof document === 'undefined') return
  // 后端渲染已写过就不覆盖（保留服务端判定）。
  if (document.documentElement.dataset.glassEffect) return
  applyGlassEffectDocument(undefined, undefined)
}

/** 当前同步会话的销毁函数（重复启动时先回收旧的） */
let teardown: (() => void) | null = null

/** glass 同步所需的布局配置子集（含 glassEffect 与 performanceMode） */
type LayoutConfigForGlass = {
  glassEffect?: string
  performanceMode?: string
} | null

/** 启动全局 glass 策略同步（config + 生效性能档位） */
export function setupGlassEffectSync(getLayoutConfig: (() => LayoutConfigForGlass) | null | undefined) {
  teardown?.()
  const sync = () => {
    const layout = typeof getLayoutConfig === 'function' ? getLayoutConfig() : null
    applyGlassEffectDocument(layout?.glassEffect, resolveEffectivePerformanceMode(layout?.performanceMode))
  }
  sync()
  teardown = () => {
    teardown = null
  }
  return teardown
}

/** 触觉反馈（震动）工具。 */

/** localStorage 中震动开关的存储键（'0' / 'false' 视为关闭） */

/** localStorage 中震动开关的存储键（'0' / 'false' 视为关闭） */
const HAPTICS_STORAGE_KEY = 'homeos_haptics'

/**
 * 当前 frame 是否已被用户「激活」过（点过一次即可，激活状态是粘性的）。
 *
 * Chrome 会拦截未激活 frame 的 navigator.vibrate 并打印
 * `Blocked call to navigator.vibrate because user hasn't tapped on the frame`，
 * 提前判掉可以避免这条 Intervention 噪音。不支持 userActivation 的环境放行。
 * @returns 是否允许调用 vibrate
 */
function hasUserActivation() {
  if (typeof navigator === 'undefined') return false
  const activation = (
    navigator as unknown as {
      userActivation?: { hasBeenActive?: boolean }
    }
  ).userActivation
  return activation?.hasBeenActive ?? true
}

/**
 * 判断是否允许震动：用户开启减少动效、或本地开关关闭、或环境无 vibrate 能力、
 * 或 frame 尚未被用户激活过时返回 false。任意一步抛错均回退到能力检测。
 * @returns 是否允许震动
 */
function hapticsEnabled() {
  try {
    if (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      return false
    }
    const stored = readLocalStorage(HAPTICS_STORAGE_KEY)
    if (stored === '0' || stored === 'false') return false
  } catch {
    /* 忽略 */
  }
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function' && hasUserActivation()
}

/** 告警/安防反馈 */
export function hapticAlert() {
  if (!hapticsEnabled()) return
  try {
    navigator.vibrate([20, 40, 20])
  } catch {
    /* 忽略 */
  }
}

/**
 * 轻触反馈：对应源码 `triggerHaptic('light')`。
 *
 * 用在「操作已被接受」的瞬态节点：按下开始说话、上滑越过取消阈值、
 * 语音指令提交成功。8~12ms 是 Android 触感上「一下」的惯用档位。
 */
export function hapticTap() {
  if (!hapticsEnabled()) return
  try {
    navigator.vibrate(10)
  } catch {
    /* 忽略 */
  }
}

/**
 * 长按反馈：对应源码 `triggerHaptic('medium')`。
 *
 * 用在「手势已达标、即将进入持续录音」这一刻（源码给 800ms 超时等待）。
 * 用两段短震而不是单段长震：单段 >30ms 在多数机型上会被感知成「嗡」的故障感。
 */
export function hapticHold() {
  if (!hapticsEnabled()) return
  try {
    navigator.vibrate([12, 24, 12])
  } catch {
    /* 忽略 */
  }
}

/** 主布局导航（桌面顶栏）构建工具。 */


/** 主布局各导航 Tab ID → 中文展示名映射 */
const MAIN_LAYOUT_NAV_LABELS: Record<string, string> = {
  dashboard: '总览',
  devices: '设备',
  scenes: '场景',
  automations: '自动化',
  security: '安防',
  events: '事件',
  scripts: '脚本',
  notifications: '通知',
  'earthquake-history': '地震',
  media: '影视',
}

/**
 * 各导航 Tab ID → 主题强调色（十六进制 CSS 色值，仅用于 UI 强调，不可翻译）。
 * 未命中时回退到 #0A84FF。
 */
const TAB_ACCENTS: Record<string, string> = {
  dashboard: '#0A84FF', // 总览
  devices: '#64D2FF', // 设备
  scenes: '#38bdf8', // 场景（sky）
  automations: '#fbbf24', // 自动化（琥珀）
  security: '#FF375F', // 安防
  events: '#38bdf8', // 事件
  scripts: '#34d399', // 脚本（翠绿）
  notifications: '#7eb8ff', // 通知
  'earthquake-history': '#f0c48a', // 地震
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
  /** 媒体库里的 MoviePilot 地址（唯一真源，见 moviepilot-url.util） */
  mediaConfig?: { mpUrl?: string } | null
}

type MainLayoutNavOptions = {
  /**
   * 功能码门禁明细（来自 ``/license/status`` 的 ``featureAccess``）。
   *
   * 只做界面显隐：未授权模块的导航项不渲染，避免点进去才被后端 403。
   * 缺省（未传 / 空对象）时全部按放行处理，界面上不会因状态未到而闪掉入口。
   */
  featureAccess?: Record<string, boolean>
}

/** 导航 Tab ID → 所需功能码；未登记的 Tab（总览 / 设备 / 事件）不参与门禁。 */
const NAV_TAB_FEATURES: Record<string, string> = {
  security: 'module.security',
  notifications: 'module.notifications',
  'earthquake-history': 'module.earthquake',
  media: 'module.media',
}

/**
 * 导航 Tab 是否被授权放行。
 * @param id 导航 Tab ID
 * @param featureAccess 功能码明细；缺省视为全部放行
 */
function isNavTabFeatureGranted(id: string, featureAccess?: Record<string, boolean>): boolean {
  const code = NAV_TAB_FEATURES[id]
  if (!code || !featureAccess) return true
  return featureAccess[code] !== false
}

/**
 * 构建桌面主布局导航：首项固定为总览，其余按 navTabOrder 与可见性/放置分配到顶栏或下拉。
 * @param layout 布局配置
 * @param options 选项（featureAccess 控制功能码门禁显隐）
 * @returns { barItems, dropdownItems }
 */
export function buildMainLayoutNavMenu(layout: LayoutNavConfig, options: MainLayoutNavOptions = {}) {
  const featureAccess = options.featureAccess
  const visibility = { ...(layout.navTabVisibility || {}) }
  const placement = { ...(layout.navTabPlacement || {}) }
  const customEmbeds = layout.customEmbeds || []
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
        icon: embed.icon && mainLayoutIconMap[embed.icon] ? mainLayoutIconMap[embed.icon] : MonitorPlay,
        accent: resolveEmbedNavAccent(embed, idx),
      })
    })
  } else if (resolveMoviePilotUrl(layout)) {
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
    if (!isNavTabFeatureGranted(id, featureAccess)) continue
    const def = tabDefs.get(id)
    if (!def) continue
    if (isNavTabInDropdown(placement, id)) dropdownItems.push(def)
    else barItems.push(def)
  }
  return { barItems, dropdownItems }
}

/** 超过这个宽度不再收纳：一行放得下全部 Tab，且文字标签恢复显示 */
const COMPACT_NAV_VIEWPORT_MAX = 1280

/**
 * 按视口宽度分档决定顶栏可见 Tab 数。
 *
 * 为什么不是一个固定档：单 Tab 约 48px（仅图标）或 91px（带文字），「更多」约 59px；
 * 再加上品牌 / 模式切换器 / 操作按钮 / 内边距与间距，每多一个 Tab 就要多一份宽度。
 * 旧实现 ≤640 一律给 4 个、>1024 完全不收纳 —— 结果 390px 下整行需要 570px（溢出 183px），
 * 1100~1200px 下「事件 / 通知」两个 Tab 被裁进隐式横向滚动，两种宽度下入口都不可达。
 *
 * 档位由「该宽度下是否真的放得下」反推（按每档最窄边界验算）：
 *   360 → 1 Tab  480 → 2  640 → 3  1100 → 4  1280 → 5
 * 低于 360px 只保留 1 个 Tab + 「更多」。
 */
const COMPACT_NAV_TIERS: ReadonlyArray<{ maxWidth: number; maxTabs: number }> = [
  { maxWidth: 360, maxTabs: 1 },
  { maxWidth: 480, maxTabs: 2 },
  { maxWidth: 640, maxTabs: 3 },
  { maxWidth: 1100, maxTabs: 4 },
  { maxWidth: 1280, maxTabs: 5 },
]

/**
 * 窄屏/平板紧凑档把溢出的顶栏 Tab 收到「更多」，避免 overflow-x 隐式滚动。
 */
export function capBarItemsForViewport<T>(
  menu: { barItems: T[]; dropdownItems: T[] },
  width: number,
): { barItems: T[]; dropdownItems: T[] } {
  if (width > COMPACT_NAV_VIEWPORT_MAX) return menu
  const tier = COMPACT_NAV_TIERS.find((t) => width <= t.maxWidth)
  const max = tier ? tier.maxTabs : menu.barItems.length
  if (menu.barItems.length <= max) return menu
  return {
    barItems: menu.barItems.slice(0, max),
    dropdownItems: [...menu.barItems.slice(max), ...menu.dropdownItems],
  }
}

/**
 * Toast 合并器：同一条提示在短时间内重复推送时只保留一张卡片并累加次数。
 *
 * 为什么需要：批量操作（一次关 12 盏灯）与批量失败（HA 断连、6s 乐观更新超时回滚）
 * 是「一条手势 → N 条相同提示」。store 原来每条都 push，于是右侧竖排 12 张
 * 「未生效，已恢复」，把整屏遮住且读屏连播 12 次。合并后是一张「未生效，已恢复 ×12」。
 *
 * 纯函数式持有状态、不依赖 Vue，可脱离渲染环境直接验证。
 */

/** 默认合并窗口（毫秒）：窗口内重复的 (type, message) 累加到同一张卡片。 */
const DEFAULT_WINDOW_MS = 2000
/** 默认最多跟踪多少条记录；超限时先淘汰最旧的，避免 Map 无界增长。 */
const DEFAULT_MAX_TRACKED = 32

/** 一次命中：复用哪张卡片、累加后是第几次。 */
interface NotifyCoalesceHit {
  /** 已存在卡片的 id */
  id: string
  /** 累加后的次数（首条为 1，重复推送为 2、3……） */
  count: number
}

/** 合并器对外能力 */
interface NotifyCoalescer {
  /** 记录/命中一条提示；窗口内同键返回命中信息并累加计数，否则返回 null 交给调用方新建。 */
  hit: (type: string, message: string, now?: number) => NotifyCoalesceHit | null
  /** 登记一张新卡片，之后同键推送会合并到它。 */
  remember: (type: string, message: string, id: string, now?: number) => void
  /** 忘记某张卡片（用户手动关闭 / 被上限挤掉时调用），下次同文案重新新建。 */
  forget: (id: string) => void
  /** 清空全部跟踪记录（测试与热重载用）。 */
  reset: () => void
}

interface Tracked {
  /** 卡片 id */
  id: string
  /** 已合并次数 */
  count: number
  /** 最近一次推送时间戳 */
  at: number
}

/** 合并键：类型也参与 —— 同文案但不同严重级别（info→warning）必须各显示一张。 */
function keyOf(type: string, message: string): string {
  return `${type}\u0000${message}`
}

/**
 * 创建合并器。
 *
 * @param windowMs 合并窗口，默认 2000ms；设为 0 等价于关闭合并
 * @param maxTracked 跟踪表上限，默认 32
 */
export function createNotifyCoalescer(windowMs = DEFAULT_WINDOW_MS, maxTracked = DEFAULT_MAX_TRACKED): NotifyCoalescer {
  const tracked = new Map<string, Tracked>()

  function prune(now: number): void {
    for (const [key, item] of tracked) {
      if (now - item.at > windowMs) tracked.delete(key)
    }
    // 时间无关的兜底：极端情况下（窗口配置很大）仍要有硬上限
    while (tracked.size > maxTracked) {
      const oldest = tracked.keys().next().value
      if (oldest === undefined) break
      tracked.delete(oldest)
    }
  }

  return {
    hit(type, message, now = Date.now()) {
      prune(now)
      const key = keyOf(type, message)
      const item = tracked.get(key)
      if (!item) return null
      item.count += 1
      item.at = now
      return { id: item.id, count: item.count }
    },
    remember(type, message, id, now = Date.now()) {
      prune(now)
      tracked.set(keyOf(type, message), { id, count: 1, at: now })
    },
    forget(id) {
      for (const [key, item] of tracked) {
        if (item.id === id) tracked.delete(key)
      }
    },
    reset() {
      tracked.clear()
    },
  }
}

/**
 * 弹窗开合方向与对齐方式计算工具。
 *
 * 优先顺序固定为：上 → 下 → 右 → 左（取第一个能完整放下的方向）。
 * 可用空间相对于「显示区域」bounds（如户型图画布）计算，避免弹窗外溢。
 */

/** 弹窗方向/对齐：百分比与固定锚点共用 */
type PopupPlacementDirection = {
  position: 'top' | 'bottom' | 'left' | 'right'
  alignment: 'center' | 'left' | 'right' | 'top' | 'bottom'
}

/** 定位参考区（与锚点同一坐标系） */
export type PopupPlacementBounds = {
  left: number
  top: number
  right: number
  bottom: number
}

type Side = PopupPlacementDirection['position']

/** 方向优先序：上 → 下 → 右 → 左 */
const SIDE_PRIORITY: Side[] = ['top', 'bottom', 'right', 'left']

/**
 * 根据锚点与弹窗尺寸选择开合方向与对齐。
 *
 * @param cx 锚点中心 x
 * @param cy 锚点中心 y
 * @param w 弹窗宽度
 * @param h 弹窗高度
 * @param bounds 可放置区域（户型图显示区）
 * @param margin 安全间距
 */
export function pickPopupPlacementDirection(
  cx: number,
  cy: number,
  w: number,
  h: number,
  bounds: PopupPlacementBounds,
  margin: number,
): PopupPlacementDirection {
  const box: PopupPlacementBounds = bounds

  const spaceAbove = cy - box.top - margin
  const spaceBelow = box.bottom - cy - margin
  const spaceLeft = cx - box.left - margin
  const spaceRight = box.right - cx - margin
  const areaH = box.bottom - box.top
  const canPlaceVertically = h + margin * 2 <= areaH

  const fit: Record<Side, boolean> = {
    top: spaceAbove >= h,
    bottom: spaceBelow >= h,
    right: spaceRight >= w && canPlaceVertically,
    left: spaceLeft >= w && canPlaceVertically,
  }

  const space: Record<Side, number> = {
    top: spaceAbove,
    bottom: spaceBelow,
    right: spaceRight,
    left: spaceLeft,
  }

  // 按 上→下→右→左 取第一个能放下的方向
  let pos: Side = SIDE_PRIORITY.find((side) => fit[side]) ?? 'top'

  // 都放不下：仍按同一优先序，选空间最大者（同空间时靠前优先）
  if (!SIDE_PRIORITY.some((side) => fit[side])) {
    pos = SIDE_PRIORITY.reduce((best, side) => (space[side] > space[best] ? side : best))
  }

  let align: PopupPlacementDirection['alignment'] = 'center'
  if (pos === 'top' || pos === 'bottom') {
    if (cx < box.left + w / 2 + margin) align = 'left'
    else if (cx > box.right - w / 2 - margin) align = 'right'
  } else {
    if (cy < box.top + h / 2 + margin) align = 'top'
    else if (cy > box.bottom - h / 2 - margin) align = 'bottom'
  }
  return { position: pos, alignment: align }
}

/** 灯光色温（Kelvin / mireds）换算与 UI 滑块样式工具。 */


/**
 * Kelvin → mireds 换算（mireds = 1e6 / K，值越大越暖）。
 * @param kelvin 色温 Kelvin
 * @returns mireds；非法或非正返回 null
 */
export function kelvinToMireds(kelvin: number | null | undefined) {
  if (!kelvin || kelvin <= 0) return null
  return Math.round(1000000 / kelvin)
}

/**
 * mireds → Kelvin 换算（K = 1e6 / mireds）。
 * @param mireds mired 值
 * @returns Kelvin；非法或非正返回 0
 */
function miredsToKelvin(mireds: number | null | undefined) {
  if (!mireds || mireds <= 0) return 0
  return Math.round(1000000 / mireds)
}

/** 灯光弹窗 / 场景联动等 UI 滑块统一刻度（与 HA 常见上限一致） */
const LIGHT_COLOR_TEMP_UI_MIN = 0
const LIGHT_COLOR_TEMP_UI_MAX = 6500

type KelvinBounds = { min: number; max: number }

/** 无设备属性时的下发兜底范围 */
const DEFAULT_KELVIN_BOUNDS: KelvinBounds = { min: 2000, max: LIGHT_COLOR_TEMP_UI_MAX }

/** HA LightEntity 平台占位范围（非设备真实能力，应忽略） */
const HA_GENERIC_COLOR_TEMP_KELVIN_MIN = 1700
const HA_GENERIC_COLOR_TEMP_KELVIN_MAX = 7000

/** HA LightEntity 平台占位 mired 范围（非设备真实能力） */
const HA_GENERIC_MIREDS_MIN = 153
const HA_GENERIC_MIREDS_MAX = 500

/**
 * 判断 mired 范围是否为 HA 平台占位值（153–500），占位值不代表设备真实能力。
 * @param minM 最小 mired
 * @param maxM 最大 mired
 * @returns 是占位范围返回 true
 */
function isHaGenericMiredRange(minM: number | null | undefined, maxM: number | null | undefined) {
  const min = Math.round(Number(minM))
  const max = Math.round(Number(maxM))
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false
  if (min === HA_GENERIC_MIREDS_MIN && max === HA_GENERIC_MIREDS_MAX) return true
  return min <= HA_GENERIC_MIREDS_MIN && max >= HA_GENERIC_MIREDS_MAX
}

/**
 * 判断 Kelvin 范围是否为 HA 平台占位值（约 1700–7000），占位值不代表设备真实能力。
 * @param minK 最小 Kelvin
 * @param maxK 最大 Kelvin
 * @returns 是占位范围返回 true
 */
function isHaGenericColorTempKelvinRange(minK: number | null | undefined, maxK: number | null | undefined) {
  const min = Math.round(Number(minK))
  const max = Math.round(Number(maxK))
  if (!Number.isFinite(min) || !Number.isFinite(max)) return false
  return min <= HA_GENERIC_COLOR_TEMP_KELVIN_MIN && max >= HA_GENERIC_COLOR_TEMP_KELVIN_MAX - 465
}

type ColorTempAttrs = Record<string, unknown>

/**
 * 按候选键名依次读取第一个有限数值属性（兼容 min_mireds / min_mired 等多种命名）。
 * @param attrs 属性对象
 * @param keys 候选键名
 * @returns 命中的数值或 null
 */
function readAttrNumber(attrs: ColorTempAttrs, ...keys: string[]) {
  for (const key of keys) {
    if (attrs[key] == null) continue
    const attrNumber = Number(attrs[key])
    if (Number.isFinite(attrNumber)) return attrNumber
  }
  return null
}

/** max_mireds=暖端(低K)，min_mireds=冷端(高K) */
function kelvinRangeFromMireds(attrs: ColorTempAttrs) {
  const minM = readAttrNumber(attrs, 'min_mireds', 'min_mired')
  const maxM = readAttrNumber(attrs, 'max_mireds', 'max_mired')
  if (minM == null || maxM == null) return null
  return {
    min: miredsToKelvin(maxM),
    max: miredsToKelvin(minM),
  }
}

/**
 * 归一化 Kelvin 范围：非法值回退默认、保证 min<=max、跨度不足 100K 时扩展上限。
 * @param minK 最小 Kelvin
 * @param maxK 最大 Kelvin
 * @returns 归一化后的 { min, max }（已取整）
 */
function normalizeKelvinRange(minK: number | null | undefined, maxK: number | null | undefined) {
  let min = Number(minK)
  let max = Number(maxK)
  if (!Number.isFinite(min) || min <= 0) min = DEFAULT_KELVIN_BOUNDS.min
  if (!Number.isFinite(max) || max <= 0) max = DEFAULT_KELVIN_BOUNDS.max
  if (min > max) [min, max] = [max, min]
  if (max - min < 100) max = min + 100
  return { min: Math.round(min), max: Math.round(max) }
}

/**
 * 从 HA 灯光实体 attributes 解析 Kelvin 范围。
 * 优先级：非通用 Kelvin → 非通用 mired → Kelvin（含 1700–7000 占位，与 HA UI 一致）→ mired → 兜底
 */
export function resolveKelvinBounds(attrs: ColorTempAttrs = {}) {
  const rawMinK = readAttrNumber(attrs, 'min_color_temp_kelvin')
  const rawMaxK = readAttrNumber(attrs, 'max_color_temp_kelvin')
  const minM = readAttrNumber(attrs, 'min_mireds', 'min_mired')
  const maxM = readAttrNumber(attrs, 'max_mireds', 'max_mired')

  const hasKelvinPair = rawMinK != null && rawMaxK != null
  const kelvinIsDeviceSpecific = hasKelvinPair && !isHaGenericColorTempKelvinRange(rawMinK, rawMaxK)
  const hasMiredPair = minM != null && maxM != null
  const miredIsDeviceSpecific = hasMiredPair && !isHaGenericMiredRange(minM, maxM)

  if (kelvinIsDeviceSpecific) {
    return normalizeKelvinRange(rawMinK, rawMaxK)
  }

  if (miredIsDeviceSpecific) {
    const miredRange = kelvinRangeFromMireds(attrs)
    if (miredRange) {
      const { min, max } = miredRange
      return normalizeKelvinRange(min, max)
    }
  }

  // 仅有 HA 平台占位 Kelvin（1700–7000）时，与 HA 开发者工具显示保持一致
  if (hasKelvinPair && isHaGenericColorTempKelvinRange(rawMinK, rawMaxK)) {
    return normalizeKelvinRange(rawMinK, rawMaxK)
  }

  if (hasMiredPair) {
    const miredRange = kelvinRangeFromMireds(attrs)
    if (miredRange) {
      const { min, max } = miredRange
      return normalizeKelvinRange(min, max)
    }
  }

  if (rawMinK != null && rawMaxK != null) {
    return normalizeKelvinRange(rawMinK, rawMaxK)
  }
  if (rawMinK != null) {
    return normalizeKelvinRange(rawMinK, DEFAULT_KELVIN_BOUNDS.max)
  }
  if (rawMaxK != null) {
    return normalizeKelvinRange(DEFAULT_KELVIN_BOUNDS.min, rawMaxK)
  }
  if (maxM != null) {
    return normalizeKelvinRange(miredsToKelvin(maxM), DEFAULT_KELVIN_BOUNDS.max)
  }
  if (minM != null) {
    return normalizeKelvinRange(DEFAULT_KELVIN_BOUNDS.min, miredsToKelvin(minM))
  }

  return { ...DEFAULT_KELVIN_BOUNDS }
}

/** UI 滑块展示用：钳制到 0–6500K */
function clampKelvinForUi(kelvin: number | null | undefined) {
  const k = Math.round(Number(kelvin) || 0)
  return Math.max(LIGHT_COLOR_TEMP_UI_MIN, Math.min(LIGHT_COLOR_TEMP_UI_MAX, k))
}

/** 读实体当前色温（UI 用，钳制到该实体支持范围） */
export function resolveEntityColorTempKelvinForUi(attrs: ColorTempAttrs = {}) {
  const deviceBounds = resolveKelvinBounds(attrs)
  return clampKelvinForUi(resolveEntityColorTempKelvin(attrs, deviceBounds))
}

/** 按实体色温跨度选择滑块步进 */
export function resolveColorTempStep(minK: number, maxK: number) {
  const span = Math.max(0, maxK - minK)
  if (span <= 300) return 10
  if (span <= 800) return 50
  return 100
}

/** 下发 HA 前钳制到设备实际支持范围 */
export function clampKelvinForDevice(kelvin: number | null | undefined, attrs: ColorTempAttrs = {}) {
  const { min, max } = resolveKelvinBounds(attrs)
  const k = Math.round(Number(kelvin) || min)
  return Math.max(min, Math.min(max, k))
}

/** 从实体属性读当前色温 Kelvin，并钳制到设备支持范围 */
function resolveEntityColorTempKelvin(attrs: ColorTempAttrs = {}, bounds: KelvinBounds = resolveKelvinBounds(attrs)) {
  const { min, max } = bounds
  let kelvin: number | null = null
  const colorTempKelvin = attrs.color_temp_kelvin
  const colorTemp = attrs.color_temp
  if (colorTempKelvin != null && Number(colorTempKelvin) > 0) {
    kelvin = Number(colorTempKelvin)
  } else if (colorTemp != null && Number(colorTemp) > 0) {
    const kelvinValue = Number(colorTemp)
    kelvin = kelvinValue >= 1000 ? kelvinValue : miredsToKelvin(kelvinValue)
  }
  if (kelvin == null || kelvin <= 0) kelvin = Math.round((min + max) / 2)
  return Math.max(min, Math.min(max, Math.round(kelvin)))
}

/** 暖光 → 冷光轨道端点色 */
const COLOR_TEMP_WARM = '#fdba74'
const COLOR_TEMP_COOL = '#93c5fd'

/**
 * 按 Kelvin 在 min~max 间插值得到轨道高亮色
 * @param {number} kelvin
 * @param {number} minK
 * @param {number} maxK
 */
function kelvinToTrackColor(kelvin: number, minK: number, maxK: number) {
  const ratio = normalizeProgressPct(kelvin, minK, maxK) / 100
  if (ratio <= 0.5) {
    return mixHexColors(COLOR_TEMP_WARM, '#ffffff', ratio * 2)
  }
  return mixHexColors('#ffffff', COLOR_TEMP_COOL, (ratio - 0.5) * 2)
}

/**
 * 在两个 hex 颜色间按比例线性插值，返回 rgb() 字符串。
 * @param from 起始 hex
 * @param targetColor 目标 hex
 * @param ratio 插值比例 [0,1]
 * @returns rgb(r, g, b)
 */
function mixHexColors(from: string, targetColor: string, ratio: number) {
  const fromRgb = parseHexColor(from)
  const targetRgb = parseHexColor(targetColor)
  const mixRatio = Math.min(1, Math.max(0, ratio))
  const red = Math.round(fromRgb.r + (targetRgb.r - fromRgb.r) * mixRatio)
  const green = Math.round(fromRgb.g + (targetRgb.g - fromRgb.g) * mixRatio)
  const blue = Math.round(fromRgb.b + (targetRgb.b - fromRgb.b) * mixRatio)
  return `rgb(${red}, ${green}, ${blue})`
}

/**
 * 解析 hex 颜色字符串为 { r, g, b } 数值对象。
 * @param hex hex 字符串（可含 #）
 * @returns 分量对象
 */
function parseHexColor(hex: string) {
  const h = hex.replace('#', '')
  return {
    r: parseInt(h.slice(0, 2), 16),
    g: parseInt(h.slice(2, 4), 16),
    b: parseInt(h.slice(4, 6), 16),
  }
}

/**
 * 色温滑块轨道：填充段随 Kelvin 从暖色过渡到当前色温色
 */
export function colorTempSliderTrackStyle(
  value: number | null | undefined,
  min: number,
  max: number,
  trackColor = 'rgba(255,255,255,0.1)',
  step?: number,
) {
  let sliderValue = resolveSliderValue(value, min)
  if (step != null && step > 0) {
    sliderValue = snapToSliderStep(sliderValue, min, max, step)
  }
  const pct = normalizeProgressPct(sliderValue, min, max)
  const from = COLOR_TEMP_WARM
  const fillColor = kelvinToTrackColor(sliderValue, min, max)
  const pctStr = formatProgressPct(pct)
  return {
    '--progress': pctStr,
    '--progress-pct': pctStr,
    '--range-progress': pctStr,
    '--track-fill-from': from,
    '--track-fill-to': fillColor,
    '--track-bg': trackColor,
  }
}

/** 进度条 / 滑块轨道渐变色工具。 */


type ProgressGradient = { from: string; to: string; glow?: string }

/** @type {Record<string, ProgressGradient>} */
const PROGRESS_VARIANTS: Record<string, ProgressGradient> = {
  accent: { from: '#0A84FF', to: '#5AC8FA', glow: 'rgba(10, 132, 255, 0.45)' }, // 主强调色（蓝）
  success: { from: '#30D158', to: '#34C759', glow: 'rgba(48, 209, 88, 0.45)' }, // 成功/正向
  warn: { from: '#FF9F0A', to: '#FFCC00', glow: 'rgba(255, 159, 10, 0.45)' }, // 警告
  danger: { from: '#FF3B30', to: '#FF6961', glow: 'rgba(255, 59, 48, 0.5)' }, // 危险/超额
  info: { from: '#64D2FF', to: '#5AC8FA', glow: 'rgba(100, 210, 255, 0.4)' }, // 信息提示
  green: { from: '#30D158', to: '#34D399', glow: 'rgba(48, 209, 88, 0.4)' }, // 绿色（通用）
  amber: { from: '#FF9F0A', to: '#FFCC00', glow: 'rgba(255, 159, 10, 0.4)' }, // 琥珀/橙黄
  blue: { from: '#0A84FF', to: '#64D2FF', glow: 'rgba(10, 132, 255, 0.4)' }, // 蓝色（通用）
  teal: { from: '#5AC8FA', to: '#2DD4BF', glow: 'rgba(90, 200, 250, 0.4)' }, // 青色
  purple: { from: '#5856D6', to: '#AF52DE', glow: 'rgba(88, 86, 214, 0.4)' }, // 紫色
  orange: { from: '#FF9500', to: '#FF6B00', glow: 'rgba(255, 149, 0, 0.45)' }, // 橙色
  sync: { from: '#FF9F0A', to: '#FFB340', glow: 'rgba(255, 159, 10, 0.4)' }, // 同步任务
  media: { from: '#0A84FF', to: '#5AC8FA', glow: 'rgba(10, 132, 255, 0.4)' }, // 影视/媒体
  emerald: { from: '#30D158', to: '#34D399', glow: 'rgba(48, 209, 88, 0.4)' }, // 翠绿
  cpu: { from: '#30D158', to: '#34C759', glow: 'rgba(48, 209, 88, 0.35)' }, // CPU 使用率
  mem: { from: '#0A84FF', to: '#64D2FF', glow: 'rgba(10, 132, 255, 0.35)' }, // 内存使用率
  white: { from: '#ffffff', to: 'rgba(255,255,255,0.85)' }, // 白色（无辉光）
  indigo: { from: '#6366f1', to: '#818cf8', glow: 'rgba(99, 102, 241, 0.4)' }, // 靛蓝
  loading: { from: '#818cf8', to: '#a78bfa', glow: 'rgba(129, 140, 248, 0.4)' }, // 加载中
  timeline: { from: '#5AC8FA', to: '#0A84FF', glow: 'rgba(90, 200, 250, 0.35)' }, // 时间线
  circuit: { from: '#FFCC00', to: '#FF9F0A', glow: 'rgba(255, 204, 0, 0.35)' }, // 电路/电力
  red: { from: '#FF3B30', to: '#FF6961', glow: 'rgba(255, 59, 48, 0.4)' }, // 红色（通用）
}

/** Builder 滑块常用单色 → 渐变 */
const BUILDER_COLOR_GRADIENTS: Record<string, ProgressGradient> = {
  '#22C55E': PROGRESS_VARIANTS.green,
  '#F59E0B': PROGRESS_VARIANTS.amber,
  '#60A5FA': PROGRESS_VARIANTS.blue,
  '#3b82f6': PROGRESS_VARIANTS.blue,
  '#38bdf8': PROGRESS_VARIANTS.info,
  '#2dd4bf': PROGRESS_VARIANTS.teal,
  '#6366f1': PROGRESS_VARIANTS.indigo,
  '#ef4444': PROGRESS_VARIANTS.red,
  '#06b6d4': PROGRESS_VARIANTS.teal,
}

/** THRESHOLD_VARIANTS：常量集合，成员语义见定义处。 */
export const THRESHOLD_VARIANTS = new Set(['budget', 'threshold', 'balance', 'resource'])

/**
 * @param {number} value
 * @param {number} [min=0]
 * @param {number} [max=100]
 */
export function normalizeProgressPct(value: number | null | undefined, min = 0, max = 100) {
  if (max <= min) return 0
  const num = Number(value)
  if (Number.isNaN(num)) return 0
  const pct = ((num - min) / (max - min)) * 100
  return Math.min(100, Math.max(0, pct))
}

function sliderStepDecimals(step: number): number {
  if (!Number.isFinite(step) || step <= 0) return 0
  const s = String(step)
  const dot = s.indexOf('.')
  if (dot < 0) return 0
  return s.length - dot - 1
}

/** 按 range step 吸附并消除浮点误差，保证拇指与轨道填充使用同一数值 */
export function snapToSliderStep(value: number, min: number, max: number, step: number): number {
  let n = Number(value)
  if (!Number.isFinite(n)) n = min
  if (step > 0) {
    n = Math.round((n - min) / step) * step + min
    n = Number(n.toFixed(sliderStepDecimals(step)))
  }
  return Math.min(max, Math.max(min, n))
}


/** 将数值钳制在 [min, max]；无效时返回 fallback */
export function clampInRange(value: number | null | undefined, min: number, max: number, fallback: number = min) {
  const lo = Number(min)
  const hi = Number(max)
  const n = Number(value)
  if (!Number.isFinite(n)) return Number.isFinite(fallback) ? fallback : lo
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || hi <= lo) return n
  return clampNum(n, lo, hi)
}

/** 滑块展示值：null/NaN/Ref 时回退到 fallback，保证拇指与轨道填充使用同一数值 */
export function resolveSliderValue(
  value: number | null | undefined | Ref<number | null | undefined>,
  fallback: number,
) {
  const raw = isRef(value) ? value.value : value
  if (raw != null && !Number.isNaN(Number(raw))) return Number(raw)
  return fallback
}

export function formatProgressPct(pct: number) {
  const clamped = clampNum(pct, 0, 100)
  const rounded = Math.round(clamped * 100) / 100
  return `${rounded}%`
}

/**
 * 预算/用量类：按百分比阈值选色
 * @param {number|null|undefined} pct
 */
export function budgetVariantFromPct(pct: number | null | undefined) {
  if (pct == null || Number.isNaN(pct)) return 'accent'
  if (pct >= 100) return 'danger'
  if (pct >= 80) return 'warn'
  return 'success'
}

/**
 * 余额类：按金额阈值选色
 * @param {number} balance
 */
export function balanceVariantFromAmount(balance: number) {
  if (balance < 50) return 'danger'
  if (balance < 100) return 'warn'
  return 'success'
}

/**
 * 系统资源类：按使用率阈值选色
 * @param {number|null|undefined} pct
 */
export function resourceVariantFromPct(pct: number | null | undefined) {
  if (pct == null || Number.isNaN(pct)) return 'success'
  if (pct >= 90) return 'danger'
  if (pct >= 70) return 'warn'
  return 'success'
}

/**
 * @param {string} [variant='accent']
 * @param {number|null|undefined} [value]
 * @param {{ color?: string, colorEnd?: string }} [custom]
 * @returns {ProgressGradient}
 */
export function resolveProgressGradient(
  variant = 'accent',
  value?: number | null,
  custom: { color?: string; colorEnd?: string } = {},
): ProgressGradient {
  if (custom.color && custom.colorEnd) {
    return { from: custom.color, to: custom.colorEnd }
  }
  if (custom.color) {
    const mapped = BUILDER_COLOR_GRADIENTS[custom.color]
    if (mapped) return mapped
    return { from: custom.color, to: custom.color }
  }
  if (variant === 'budget' || variant === 'threshold') {
    return PROGRESS_VARIANTS[budgetVariantFromPct(value)] || PROGRESS_VARIANTS.accent
  }
  if (variant === 'balance') {
    return PROGRESS_VARIANTS[balanceVariantFromAmount(Number(value) || 0)] || PROGRESS_VARIANTS.accent
  }
  if (variant === 'resource') {
    return PROGRESS_VARIANTS[resourceVariantFromPct(value)] || PROGRESS_VARIANTS.success
  }
  return PROGRESS_VARIANTS[variant] || PROGRESS_VARIANTS.accent
}

/**
 * @param {ProgressGradient} grad
 */
export function progressGradientCss(grad: ProgressGradient) {
  return `linear-gradient(90deg, ${grad.from}, ${grad.to})`
}

/** 进度条 / 滑块样式统一入口 */
export * from './ui'
export * from './ui'

/** 滑块轨道样式参数：含值域、variant、自定义起止色等 */
type SliderTrackStyleOpts = {
  value: number | null | undefined
  min?: number
  max?: number
  step?: number
  variant?: string
  color?: string
  colorEnd?: string
  trackColor?: string
  colorValue?: number
}

/**
 * 滑块轨道样式（input[type=range]）：返回可直接展开到 style 的对象，
 * 同时覆盖 WebKit / Firefox / 标准 spec 三套伪元素。
 *
 * @param opts 滑块配置（值域、variant、自定义颜色等）
 * @returns 内联 style 对象
 */
export function sliderTrackStyle({
  value,
  min = 0,
  max = 100,
  step,
  variant = 'accent',
  color,
  colorEnd,
  trackColor = 'var(--hos-line-3)',
  colorValue,
}: SliderTrackStyleOpts) {
  let v = resolveSliderValue(value, min)
  if (step != null && step > 0) {
    v = snapToSliderStep(v, min, max, step)
  }
  const pct = normalizeProgressPct(v, min, max)
  const colorSource = THRESHOLD_VARIANTS.has(variant) ? (colorValue ?? v) : v
  const grad = resolveProgressGradient(variant, colorSource, { color, colorEnd })
  const { from, to } = grad
  const pctStr = formatProgressPct(pct)
  return {
    '--progress': pctStr,
    '--progress-pct': pctStr,
    '--range-progress': pctStr,
    '--hos-color-accent': from,
    '--accent-from': from,
    '--accent-to': to,
    '--track-fill-from': from,
    '--track-fill-to': to,
    '--track-bg': trackColor,
  }
}

type ProgressFillStyleOpts = {
  value: number | null | undefined
  min?: number
  max?: number
  variant?: string
  color?: string
  colorEnd?: string
  glow?: boolean
  colorValue?: number
  autoGlow?: boolean
}

/**
 * 进度条填充层样式（div）
 * @param {{ value: number, min?: number, max?: number, variant?: string, color?: string, colorEnd?: string, glow?: boolean, colorValue?: number, autoGlow?: boolean }} opts
 */
export function progressFillStyle({
  value,
  min = 0,
  max = 100,
  variant = 'accent',
  color,
  colorEnd,
  glow = false,
  colorValue,
  autoGlow = false,
}: ProgressFillStyleOpts) {
  const v = resolveSliderValue(value, min)
  const pct = normalizeProgressPct(v, min, max)
  const colorSource = THRESHOLD_VARIANTS.has(variant) ? (colorValue ?? v) : v
  const grad = resolveProgressGradient(variant, colorSource, { color, colorEnd })
  const style: Record<string, string> = {
    width: '100%',
    '--progress-scale': `${pct / 100}`,
    background: progressGradientCss(grad),
  }
  let resolvedKey = variant
  if (variant === 'budget' || variant === 'threshold') resolvedKey = budgetVariantFromPct(colorSource)
  else if (variant === 'balance') resolvedKey = balanceVariantFromAmount(Number(colorSource) || 0)
  else if (variant === 'resource') resolvedKey = resourceVariantFromPct(colorSource)
  const shouldGlow = glow || (autoGlow && (resolvedKey === 'warn' || resolvedKey === 'danger'))
  if (shouldGlow && grad.glow) {
    style.boxShadow = `0 0 6px ${grad.glow}`
  }
  return style
}

/**
 * 屏保可见性与后台展示层 idle 状态。
 * enter：visible 后立即绘制屏保，双 rAF 后再 notify idle（节流后台 Canvas/FPS 等）。
 * leave：同步取消 idle 并 flush 延迟重绘。数据层（WS/轮询/store）不受影响。
 */

const screensaverVisible = ref(false)
/** screensaverBackgroundIdle：响应式常量（ref / computed），取值语义见定义。 */
export const screensaverBackgroundIdle = ref(false)

const idleListeners = new Set<(idle: boolean) => void>()

let idleRaf1 = 0
let idleRaf2 = 0

function notifyIdle(idle: boolean) {
  if (screensaverBackgroundIdle.value === idle) return
  screensaverBackgroundIdle.value = idle
  if (typeof document !== 'undefined') {
    document.documentElement.toggleAttribute('data-screensaver-idle', idle)
  }
  if (idle) pauseFpsScheduler()
  else resumeFpsScheduler()
  idleListeners.forEach((fn) => {
    try {
      fn(idle)
    } catch {
      /* 忽略 */
    }
  })
}

export function onScreensaverBackgroundIdle(cb: (idle: boolean) => void): () => void {
  idleListeners.add(cb)
  cb(screensaverBackgroundIdle.value)
  return () => idleListeners.delete(cb)
}

export function setScreensaverVisible(visible: boolean): void {
  if (screensaverVisible.value === visible) return
  screensaverVisible.value = visible

  if (idleRaf1) cancelAnimationFrame(idleRaf1)
  if (idleRaf2) cancelAnimationFrame(idleRaf2)
  idleRaf1 = 0
  idleRaf2 = 0

  if (visible) {
    notifyIdle(false)
    if (typeof requestAnimationFrame !== 'function') {
      notifyIdle(true)
      return
    }
    idleRaf1 = requestAnimationFrame(() => {
      idleRaf2 = requestAnimationFrame(() => {
        idleRaf1 = 0
        idleRaf2 = 0
        if (screensaverVisible.value) notifyIdle(true)
      })
    })
    return
  }

  notifyIdle(false)
  if (typeof window !== 'undefined' && typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      window.dispatchEvent(new Event('resize'))
    })
  }
}

/**
 * 3D 编辑器首屏遮罩的**按需注入**（0.8.9 公告 9：普通页面不预载 3D 资源）。
 *
 * ## 原来怎么做的、为什么不对
 *
 * `index.html` 里无条件挂了 `<link href="/static/3d-studio/studio-loading.css">`，
 * 并在 `<body>` 里无条件输出了 `#studio-loading` 那 20 个节点。于是：
 *
 * - 每个普通仪表盘用户的首屏都多一次 1.7KB CSS 请求与解析；
 * - 每个页面都要解析一段永远 `hidden` 的 DOM；
 * - 而真正需要它的只有 `/3d-studio` 一条路由。
 *
 * ## 现在怎么做
 *
 * 进入创作页时再注入样式表；离开时不回撤（同一会话内再次进入无需重复请求，
 * 且样式表被移除会导致正在退场的遮罩闪一下无样式）。
 *
 * 只注入**样式**，不注入 DOM：`#studio-loading` 的标记仍留在 `index.html`
 * 的 body 里 —— 它必须在 Vue 挂载前就存在（见那里的注释），搬到 JS 里会因为
 * 入口 chunk 还没下载完而错过「已挂载但路由未渲染」那段空窗。
 */

const STUDIO_LOADING_STYLE_HREF = '/static/3d-studio/studio-loading.css'
const STYLE_ELEMENT_ID = 'studio-loading-style'

/** 注入（幂等）首屏遮罩样式表；返回是否已在文档中。 */
export function ensureStudioLoadingStyle(doc: Document = document): boolean {
  if (doc.getElementById(STYLE_ELEMENT_ID)) return true
  // 可能已由服务端模板或上一版逻辑挂上：按 href 判重，避免重复请求。
  const existing = doc.querySelector(`link[rel="stylesheet"][href="${STUDIO_LOADING_STYLE_HREF}"]`)
  if (existing) return true
  const link = doc.createElement('link')
  link.id = STYLE_ELEMENT_ID
  link.rel = 'stylesheet'
  link.href = STUDIO_LOADING_STYLE_HREF
  doc.head.append(link)
  return true
}

/**
 * `/3d-studio` 首屏加载遮罩的前端侧入口。
 *
 * 遮罩本体是 `public/static/3d-studio/studio-loading.js`（经典脚本，早于 Vue 入口执行），
 * 它挂出 `window.homeosStudioStartup`。本模块把那套契约包成带类型、且在**没有遮罩时
 * 一律 no-op** 的薄封装：
 *
 *   - 应用内路由跳转进 `/3d-studio` 时遮罩脚本根本没跑（它在首屏按路径守卫提前 return），
 *     所有调用都必须容忍 `window.homeosStudioStartup` 缺席；
 *   - 业务代码不该因此长出 `?.` 与 `as any`。
 *
 * 只做转发，不持有状态：加载态的唯一真相仍是脚本里的那个对象。
 */

/** 脚本侧暴露的控制器契约（与 studio-loading.js 的 `Object.freeze({...})` 一一对应）。 */
interface StudioStartupController {
  readonly active: boolean
  readonly signal: AbortSignal
  phase(text: string): void
  fail(reason?: string): void
  wait<T>(task: Promise<T> | T): Promise<T>
  ready(): void
}

function controller(): StudioStartupController | null {
  const candidate = (window as unknown as { homeosStudioStartup?: StudioStartupController }).homeosStudioStartup
  return candidate && typeof candidate.phase === 'function' ? candidate : null
}

/** 当前是否仍处于首屏加载态（遮罩未收起、也没失败）。 */
export function studioStartupActive(): boolean {
  return controller()?.active === true
}

/** 换阶段文案。加载已结束（ready / fail）时是 no-op。 */
export function studioStartupPhase(text: string): void {
  controller()?.phase(text)
}

/** 进入错误态：遮罩显示原因与「重新加载」按钮，同时中止下游准备工作。 */
export function studioStartupFail(reason?: string): void {
  controller()?.fail(reason)
}

/** 收起遮罩（幂等）。 */
export function studioStartupReady(): void {
  controller()?.ready()
}

/**
 * 等一个准备任务，但页面退出 / 失败时立刻以 abort 原因拒绝。
 *
 * 用途：把「几秒的准备过程」挂在遮罩的生命周期上 —— 用户已经关掉页面或点了重试，
 * 继续在后台把户型建完只是白烧 GPU。
 */
export function studioStartupWait<T>(task: Promise<T> | T): Promise<T> {
  const active = controller()
  return active ? active.wait(task) : Promise.resolve(task)
}

/**
 * HomeOS 中控主题：固定石板深蓝。
 *
 * 语义色来自 hos-design-system.css 的 :root / html[data-theme="slate-navy"]。
 * 启动时写入 data-theme，并清掉历史切换偏好（warm-amber / light / system）。
 */

type HomeOsResolvedTheme = 'slate-navy'

const STORAGE_KEY = 'homeos_ui_theme'

/**
 * 写入 html[data-theme="slate-navy"]，并清掉历史切换偏好。
 */
export function applyHomeOsTheme(): HomeOsResolvedTheme {
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', 'slate-navy')
  }
  try {
    removeLocalStorage(STORAGE_KEY)
  } catch {
    /* 忽略 */
  }
  return 'slate-navy'
}
