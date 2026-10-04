/**
 * @file 应用主题 Composable（强调色）
 * @module composables/ui/useAppTheme
 *
 * 职责：
 *  - 读取后台 ui 配置中的 accentColor，将其应用到 document.documentElement 的 CSS 变量。
 *  - 监听配置变更，实时刷新强调色相关 CSS 变量（--accent-color / --accent / --accent-rgb 等）。
 *
 * 依赖：
 *  - vue 的 onMounted / onUnmounted 生命周期钩子。
 *  - frontend-config 的 getConfigSection / onConfigChange。
 *  - frontend-config 类型 ConfigChangeListener。
 *  - ui/color.util 的 hexToRgb（强调色 RGB 解析）。
 */
import { onMounted, onUnmounted } from 'vue'
import { getConfigSection, onConfigChange } from '@/utils/config/frontend-config'
import type { ConfigChangeListener } from '@/types/frontend-config'
import { hexToRgb } from '@/utils/ui/color.util'

/**
 * 将 ui 配置中的强调色应用到 document 根元素。
 * 设置 --accent-color / --accent，并在 RGB 解析成功时派生 glow / nav 系列变量。
 * @param ui - ui 配置段，包含可选的 accentColor
 * @sideEffect 修改 document.documentElement 的 inline style（CSS 变量）
 */
function applyUiConfig(ui: { accentColor?: string } | null | undefined) {
  const root = document.documentElement
  const accent = ui?.accentColor || '#0A84FF'
  const rgb = hexToRgb(accent)
  root.style.setProperty('--accent-color', accent)
  root.style.setProperty('--accent', accent)
  if (rgb) {
    // 解析成功时派生 rgba 形式的辅助变量（导航栏底色、光晕等）
    root.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`)
    root.style.setProperty('--accent-glow', `rgba(${rgb.r},${rgb.g},${rgb.b},0.38)`)
    root.style.setProperty('--nav-brand', `rgba(${rgb.r},${rgb.g},${rgb.b},0.15)`)
    root.style.setProperty('--nav-tint', `rgba(${rgb.r},${rgb.g},${rgb.b},0.08)`)
    root.style.setProperty('--nav-glow', `rgba(${rgb.r},${rgb.g},${rgb.b},0.14)`)
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