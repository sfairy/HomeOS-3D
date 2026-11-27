/**
 * 设置面板 keep-alive 的**防御性**缓存上限。
 *
 * 注意实际生效的缓存集合完全由 ``SETTINGS_KEEP_ALIVE_INCLUDE`` 决定：只有下面的固定页
 * 会进 ``<keep-alive include>``，非固定页切换即重建、从不入缓存。也就是说当前上限 8
 * 永远不会被触发（固定页只有 4 个），它只保证「将来固定页变多」时缓存不会无限增长 ——
 * 早先的注释写成「非固定页 LRU 上限」，与实现相反。
 */
export const SETTINGS_KEEP_ALIVE_MAX = 8

/**
 * 高频切换的面板 ID；组件名 `SettingsTab_<id>` 列入 include，切换后实例常驻。
 */
const SETTINGS_KEEP_ALIVE_PINNED = ['connection', 'layout', 'general', 'home-mode'] as const

type SettingsKeepAlivePinnedId = (typeof SETTINGS_KEEP_ALIVE_PINNED)[number]

export function isPinnedSettingsTab(tabId: string): tabId is SettingsKeepAlivePinnedId {
  return (SETTINGS_KEEP_ALIVE_PINNED as readonly string[]).includes(tabId)
}

export function settingsKeepAliveName(tabId: string): string {
  return `SettingsTab_${tabId}`
}

/** SETTINGS_KEEP_ALIVE_INCLUDE：常量，取值语义见定义处。 */
export const SETTINGS_KEEP_ALIVE_INCLUDE = SETTINGS_KEEP_ALIVE_PINNED.map(settingsKeepAliveName)
