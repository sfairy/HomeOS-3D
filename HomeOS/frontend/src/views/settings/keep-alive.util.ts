/** 设置面板 keep-alive 缓存上限（非固定页 LRU 上限；固定页见 INCLUDE） */
export const SETTINGS_KEEP_ALIVE_MAX = 8

/**
 * 高频切换的面板 ID；组件名 `SettingsTab_<id>` 列入 include，切换后实例常驻。
 */
const SETTINGS_KEEP_ALIVE_PINNED = [
  'connection',
  'layout',
  'general',
  'orchestrator',
  'home-mode',
] as const

type SettingsKeepAlivePinnedId = (typeof SETTINGS_KEEP_ALIVE_PINNED)[number]

/** isPinnedSettingsTab：函数，按签名入参返回处理结果。 */
export function isPinnedSettingsTab(tabId: string): tabId is SettingsKeepAlivePinnedId {
  return (SETTINGS_KEEP_ALIVE_PINNED as readonly string[]).includes(tabId)
}

/** settingsKeepAliveName：函数，按签名入参返回处理结果。 */
export function settingsKeepAliveName(tabId: string): string {
  return `SettingsTab_${tabId}`
}

/** SETTINGS_KEEP_ALIVE_INCLUDE：常量，取值语义见定义处。 */
export const SETTINGS_KEEP_ALIVE_INCLUDE = SETTINGS_KEEP_ALIVE_PINNED.map(settingsKeepAliveName)
