/**
 * @file 布局层基础状态与持久化 key
 * @module stores/ui/create-layout-state
 * @description
 *  布局配置切片的基础常量与 localStorage profile 持久化工具。
 *  导出侧栏部件的已知类型集合（KNOWN_PANEL_WIDGET_TYPES），用于配置加载时的白名单过滤。
 *  profile ID 持久化区分"从未设置"与"主动选择 default"两种状态，并同步一份方案提示
 *  Cookie 供同源反代按终端方案解析内嵌页目标。
 *  依赖 widget-registry-meta 中的注册表元数据。
 */
import { readLocalStorage, writeLocalStorage } from '@/shared/utils/core/local-storage.util'

import { WIDGET_REGISTRY_META } from '@/shared/utils/registry/widget-registry-meta'

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
 * 方案提示 Cookie 名（与后端 ``PROFILE_HINT_COOKIE`` 对齐）。
 *
 * 内嵌页 iframe 无法带自定义请求头，后端反代只能从 Cookie 得知「这台终端在显示哪份方案」。
 */
const PROFILE_HINT_COOKIE_NAME = 'homeos_profile'

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
 * @sideeffect 同时写入 ``homeos_profile`` Cookie：内嵌页 iframe 无法带自定义请求头，
 *   后端反代（``/api/v1/embed-proxy/*``）靠这个 Cookie 知道该按哪份布局解析内嵌目标。
 *   多设备各显示不同方案时，这一步决定「这台设备的自定义内嵌页/投屏地址」是否解析正确。
 */
export function writeStoredProfileId(id: string): void {
  if (typeof localStorage === 'undefined') return
  writeLocalStorage(PROFILE_STORAGE_KEY, id)
  writeProfileHintCookie(id)
}

/**
 * 写入方案提示 Cookie（供同源反代按终端方案解析布局）。
 *
 * Cookie 只作「提示」：后端命中不到该方案 / 该方案没有布局时会回落到后台默认方案，
 * 所以这里不需要等登录态，也不会因为值过期而影响页面加载。
 *
 * @param id 方案 ID
 */
export function writeProfileHintCookie(id: string): void {
  if (typeof document === 'undefined') return
  const value = encodeURIComponent(String(id || 'default'))
  // path=/ 保证 /api/v1/embed-proxy/* 也能读到；SameSite=Lax 够用（同源请求）
  document.cookie = `${PROFILE_HINT_COOKIE_NAME}=${value}; path=/; SameSite=Lax; max-age=31536000`
}

/**
 * localStorage 中标记「本终端已登记过云端绑定」的 key。
 *
 * 存在的理由：终端首次解析方案后会自动把自己登记到服务端，这样「已注册终端」列表才
 * 能真的列出所有设备。但管理员「解除绑定」的意思就是「不要再由云端管这台设备」，
 * 若每次解析都无条件重登记，解绑会被下一次刷新立刻撤销。所以自动登记只做一次。
 */
const TERMINAL_REGISTERED_KEY = 'homeos_terminal_registered'

/**
 * 本终端是否已经登记过云端绑定。
 * @returns 曾经登记成功过则为 true
 */
export function hasTerminalRegistered(): boolean {
  if (typeof localStorage === 'undefined') return false
  return readLocalStorage(TERMINAL_REGISTERED_KEY) === '1'
}

/**
 * 标记本终端已完成云端绑定登记（自动登记不再重复执行）。
 */
export function markTerminalRegistered(): void {
  if (typeof localStorage === 'undefined') return
  writeLocalStorage(TERMINAL_REGISTERED_KEY, '1')
}
