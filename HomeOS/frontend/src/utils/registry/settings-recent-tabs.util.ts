/**
 * 设置中心「最近使用」直达：记录最近访问的设置面板，供首页快捷跳转。
 *
 * 存储：localStorage（键 homeos_settings_recent_tabs，JSON 数组，最近在前）。
 * 上限 6 个，去重，跳过默认落地页（setup-wizard），避免列表被无意义条目占满。
 */
import { readLocalStorage, writeLocalStorageJson } from '@/utils/core/local-storage.util'

/**
 * 设置中心「最近使用」直达：记录最近访问的设置面板，供首页快捷跳转。
 *
 * 存储：localStorage（键 homeos_settings_recent_tabs，JSON 数组，最近在前）。
 * 上限 6 个，去重，跳过默认落地页（setup-wizard），避免列表被无意义条目占满。
 */
import { DEFAULT_TAB } from './settings-nav.util'

const RECENT_TABS_KEY = 'homeos_settings_recent_tabs'
const MAX_RECENT_TABS = 6

function readRecentTabs(): string[] {
  try {
    const raw = readLocalStorage(RECENT_TABS_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter((t): t is string => typeof t === 'string')
  } catch {
    return []
  }
}

function writeRecentTabs(tabs: string[]) {
  try {
    writeLocalStorageJson(RECENT_TABS_KEY, tabs.slice(0, MAX_RECENT_TABS))
  } catch {
    /* 隐私模式等场景写入失败不影响交互 */
  }
}

/** 记录一次设置面板访问（最近在前，去重）。 */
export function recordSettingsTabVisit(tabId: string) {
  if (!tabId || tabId === DEFAULT_TAB) return
  const next = [tabId, ...readRecentTabs().filter((t) => t !== tabId)]
  writeRecentTabs(next)
}

/** 读取最近访问的设置面板（最近在前，不含首页）。 */
export function getRecentSettingsTabs(limit = 4): string[] {
  return readRecentTabs().slice(0, limit)
}
