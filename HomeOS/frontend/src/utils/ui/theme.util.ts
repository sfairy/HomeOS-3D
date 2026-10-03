/**
 * HomeOS 主题切换（浅色 / 深色）
 *
 * 语义色来自 hos-design-system.css：
 *  - 默认 :root = 深色
 *  - html[data-theme="light"] = 浅色 token 覆盖
 *
 * 存储键 homeos_ui_theme：'dark' | 'light' | 'system'
 * system 时跟随 prefers-color-scheme。
 */
import { readLocalStorage, writeLocalStorage } from '@/utils/core/local-storage.util'

/**
 * HomeOS 主题切换（浅色 / 深色）
 *
 * 语义色来自 hos-design-system.css：
 *  - 默认 :root = 深色
 *  - html[data-theme="light"] = 浅色 token 覆盖
 *
 * 存储键 homeos_ui_theme：'dark' | 'light' | 'system'
 * system 时跟随 prefers-color-scheme。
 */
export type HomeOsThemeMode = 'warm-amber' | 'slate-navy' | 'dark' | 'light' | 'system'
export type HomeOsResolvedTheme = 'warm-amber' | 'slate-navy' | 'light'

const STORAGE_KEY = 'homeos_ui_theme'

function readStoredMode(): HomeOsThemeMode {
  try {
    const raw = readLocalStorage(STORAGE_KEY)
    if (raw === 'warm-amber' || raw === 'slate-navy' || raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    /* 忽略 */
  }
  return 'warm-amber'
}

function systemPrefersLight(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false
  return window.matchMedia('(prefers-color-scheme: light)').matches
}

/** 将模式解析为实际生效的深/浅 */
function resolveHomeOsTheme(mode: HomeOsThemeMode = readStoredMode()): HomeOsResolvedTheme {
  if (mode === 'system') return systemPrefersLight() ? 'light' : 'slate-navy'
  if (mode === 'dark') return 'slate-navy'
  return mode
}

/**
 * 写入 html[data-theme] 并可选持久化偏好。
 * @param mode 主题模式；省略则按本地存储 / 默认 dark 应用
 * @param persist 是否写入 localStorage（默认 true）
 */
export function applyHomeOsTheme(mode?: HomeOsThemeMode, persist = true): HomeOsResolvedTheme {
  const nextMode = mode ?? readStoredMode()
  const resolved = resolveHomeOsTheme(nextMode)
  if (typeof document !== 'undefined') {
    document.documentElement.setAttribute('data-theme', resolved)
  }
  if (persist) {
    try {
      writeLocalStorage(STORAGE_KEY, nextMode)
    } catch {
      /* 忽略 */
    }
  }
  return resolved
}

