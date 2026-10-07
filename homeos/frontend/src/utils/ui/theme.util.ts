/**
 * HomeOS 中控主题：固定石板深蓝。
 *
 * 语义色来自 hos-design-system.css 的 :root / html[data-theme="slate-navy"]。
 * 启动时写入 data-theme，并清掉历史切换偏好（warm-amber / light / system）。
 */
import { removeLocalStorage } from '@/utils/core/local-storage.util'

export type HomeOsResolvedTheme = 'slate-navy'

const STORAGE_KEY = 'homeos_ui_theme'

/**
 * 写入 html[data-theme="slate-navy"]。参数保留仅为兼容旧调用点。
 */
export function applyHomeOsTheme(_mode?: string, _persist = true): HomeOsResolvedTheme {
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
