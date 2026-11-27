/* ── 原 布局层基础状态与持久化 key 的实现 ── */
import { readLocalStorage, writeLocalStorage } from '@/kernel/utils/core/local-storage.util'

import { WIDGET_REGISTRY_META } from '@/kernel/utils/registry/widget-registry-meta'

/**
 * 已知的侧栏/仪表盘部件类型集合。
 * 从 WIDGET_REGISTRY_META 中筛选 surfaces 包含 'sidebar' 或 'dashboard' 的类型。
 * 用于配置加载时过滤未知部件类型，防止渲染异常。
 */
export const KNOWN_PANEL_WIDGET_TYPES = new Set<string>([
  ...Object.entries(WIDGET_REGISTRY_META)
    .filter(([, def]) => def.surfaces.some((s: string) => s === 'sidebar' || s === 'dashboard'))
    .map(([type]) => type),
])

/** localStorage 中存储当前 profile ID 的 key */
const PROFILE_STORAGE_KEY = 'homeos_profile_id'

/**
 * 读取本地存储的 profile ID。
 * 在非浏览器环境（如 SSR）或未设置时返回 'default'。
 * @returns 当前激活的 profile ID
 */
export function readStoredProfileId(): string {
  if (typeof localStorage === 'undefined') return 'default'
  return readLocalStorage(PROFILE_STORAGE_KEY) || 'default'
}

/**
 * 是否曾显式写入过 profile（区分"从未设置"与"主动选择 default"）。
 * @returns 是否存在已存储的 profile ID
 */
export function hasStoredProfileId(): boolean {
  if (typeof localStorage === 'undefined') return false
  return readLocalStorage(PROFILE_STORAGE_KEY) != null
}

/**
 * 将 profile ID 写入 localStorage 持久化。
 * 非浏览器环境直接返回。
 * @param id 要持久化的 profile ID
 */
export function writeStoredProfileId(id: string): void {
  if (typeof localStorage === 'undefined') return
  writeLocalStorage(PROFILE_STORAGE_KEY, id)
}
