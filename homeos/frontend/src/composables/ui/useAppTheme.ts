/** - 读取后台 ui 配置中的 accentColor，将其应用到 document.documentElement 的 CSS 变量。 */
import { onMounted, onUnmounted } from 'vue'
import { getConfigSection, onConfigChange } from '@/shared/utils/config/frontend-config'
import type { ConfigChangeListener } from '@/shared/types/frontend-config'
import { hexToRgb, resolveReadableAccent } from '@/shared/utils/ui/color.util'

/** 已提示过的不可读强调色，避免配置变更时刷屏。 */
const warnedAccents = new Set<string>()

/**
 * 将 ui 配置中的强调色应用到 document 根元素。
 * 设置 --accent-color / --accent，并在 RGB 解析成功时派生 glow / nav 系列变量。
 *
 * 597637a3 把默认强调色改成暖铜，恢复彩色模块主题后由后端一次性落库迁移
 * （app_config/service.py `_migrate_legacy_accent_color`）；可读的颜色一律原样应用，
 * 只有对比度不达标的配置才回落到系统蓝，避免把用户显式选择的暖铜静默覆盖。
 *
 * @param ui - ui 配置段，包含可选的 accentColor
 * @sideEffect 修改 document.documentElement 的 inline style（CSS 变量）
 */
function applyUiConfig(ui: { accentColor?: string } | null | undefined) {
  const root = document.documentElement
  const configured = ui?.accentColor?.trim() || '#0A84FF'
  const accent = resolveReadableAccent(configured)
  if (accent !== configured.toUpperCase() && !warnedAccents.has(configured)) {
    warnedAccents.add(configured)
    console.warn(
      `[theme] accentColor ${configured} 与深色画布或按钮文字对比度不足，已回落到 ${accent}。`,
    )
  }
  const rgb = hexToRgb(accent)
  root.style.setProperty('--accent-color', accent)
  root.style.setProperty('--accent', accent)
  // canonical 主色：图表、空态与语义组件都从 --hos-color-accent 取色；
  // 只写 --accent 会让新组件仍停在默认暖铜（导航变色、内容不变色的割裂）。
  root.style.setProperty('--hos-color-accent', accent)
  if (rgb) {
    // 解析成功时派生 rgba 形式的辅助变量（导航栏底色、光晕等）
    root.style.setProperty('--accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`)
    root.style.setProperty('--hos-color-accent-rgb', `${rgb.r}, ${rgb.g}, ${rgb.b}`)
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