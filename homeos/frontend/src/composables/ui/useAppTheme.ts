/** - 读取后台 ui 配置中的 accentColor，将其应用到 document.documentElement 的 CSS 变量。 */
import { onMounted, onUnmounted } from 'vue'
import { getConfigSection, onConfigChange } from '@/shared/utils/config/frontend-config'
import type { ConfigChangeListener } from '@/shared/types/frontend-config'
import { hexToRgb } from '@/shared/utils/ui/color.util'

/**
 * 将 ui 配置中的强调色应用到 document 根元素。
 * 设置 --accent-color / --accent，并在 RGB 解析成功时派生 glow / nav 系列变量。
 * @param ui - ui 配置段，包含可选的 accentColor
 * @sideEffect 修改 document.documentElement 的 inline style（CSS 变量）
 */
/** 旧版本默认强调色（系统蓝）。存量配置命中这些值时视同「未设置」，统一回到暖铜品牌色。 */
const LEGACY_DEFAULT_ACCENTS = new Set(['#0a84ff', '#3b82f6', '#007aff', '#2563eb'])
const BRAND_ACCENT = '#ffc46a'

/**
 * 将 ui 配置中的强调色应用到 document 根元素。
 * @param ui - ui 配置段，包含可选的 accentColor
 * @sideEffect 修改 document.documentElement 的 inline style（CSS 变量）
 */
function applyUiConfig(ui: { accentColor?: string } | null | undefined) {
  const root = document.documentElement
  const configured = ui?.accentColor?.trim().toLowerCase()
  const accent = configured && !LEGACY_DEFAULT_ACCENTS.has(configured) ? configured : BRAND_ACCENT
  const rgb = hexToRgb(accent)
  root.style.setProperty('--accent-color', accent)
  root.style.setProperty('--accent', accent)
  // 同步 canonical 主色：图表、空态、语义组件都从 --hos-color-accent 取色，
  // 只在旧变量上覆盖会出现「导航变色、内容仍是默认铜」的割裂。
  root.style.setProperty('--hos-color-accent', accent)
  root.style.setProperty('--page-accent', accent)
  if (rgb) {
    // 解析成功时派生 rgba 形式的辅助变量（导航栏底色、光晕等）
    const triplet = `${rgb.r}, ${rgb.g}, ${rgb.b}`
    root.style.setProperty('--accent-rgb', triplet)
    root.style.setProperty('--hos-color-accent-rgb', triplet)
    root.style.setProperty('--page-accent-rgb', triplet)
    root.style.setProperty('--page-accent-text', accent)
    root.style.setProperty('--page-accent-bg', `rgba(${triplet}, 0.12)`)
    root.style.setProperty('--page-accent-bg-strong', `rgba(${triplet}, 0.18)`)
    root.style.setProperty('--page-accent-border', `rgba(${triplet}, 0.32)`)
    root.style.setProperty('--page-accent-glow', `rgba(${triplet}, 0.16)`)
    root.style.setProperty('--accent-glow', `rgba(${triplet},0.38)`)
    root.style.setProperty('--nav-brand', `rgba(${triplet},0.15)`)
    root.style.setProperty('--nav-tint', `rgba(${triplet},0.08)`)
    root.style.setProperty('--nav-glow', `rgba(${triplet},0.14)`)
  }
}

/** 将后台 ui 配置应用到 document（强调色）。组件挂载时刷新一次，并监听后续配置变更。 */
export function useAppTheme() {
  /** 重新读取 ui 配置段并应用到 document */
  function refresh() {
    applyUiConfig(getConfigSection('ui'))
  }
  onMounted(() => {
    refresh()
    // 仅在 ui 配置段变更时刷新
    const onUiConfigChange: ConfigChangeListener = (keys) => {
      if (!keys || keys.includes('ui')) refresh()
    }
    const off = onConfigChange(onUiConfigChange)
    onUnmounted(off)
  })
}