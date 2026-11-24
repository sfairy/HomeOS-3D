/**
 * `/devices` 页面 URL 筛选的解析（纯函数，不依赖 store / router）。
 *
 * 为什么单独抽出来：这段逻辑有两个容易写错、且**错了也不报错**的地方 ——
 * 一是 query 里的非法值不能静默生效（`?status=whatever` 不该把列表清空），
 * 二是 `controllableOnly` 的连带关闭只能发生在 query **带来新值**的那一次
 * （否则用户手动打开的「仅可控」会被自己的域切换动作关掉）。
 * 放进纯函数后可以用单测钉住，而不是靠点几下看看。
 */
import type { DeviceFilterState } from '@/shared/types/device'

/** query 里允许出现的筛选键。 */
export const DEVICE_QUERY_DOMAIN = 'domain'
export const DEVICE_QUERY_STATUS = 'status'

/** `DeviceFilterState['status']` 的合法取值。 */
const VALID_STATUS = new Set<string>(['all', 'online', 'offline', 'low-battery'])

/** query 值可能是数组（重复参数）；只取第一个，且去空白。 */
function readQueryValue(raw: unknown): string {
  const value = Array.isArray(raw) ? raw[0] : raw
  return String(value ?? '').trim()
}

export interface DeviceQueryFilters {
  domain: string | null
  status: DeviceFilterState['status'] | null
  /** 至少有一个键被解析出来（调用方据此决定要不要动 `controllableOnly`）。 */
  present: boolean
}

/**
 * 从 URL query 解析出需要应用的筛选。
 *
 * `null` 表示「query 里没有该键」或「值非法」—— 两者对调用方都是「不应用」，
 * 非法值不做任何提示、也不改变现状。
 */
export function parseDeviceQueryFilters(query: Record<string, unknown> | undefined): DeviceQueryFilters {
  const rawDomain = readQueryValue(query?.[DEVICE_QUERY_DOMAIN])
  const rawStatus = readQueryValue(query?.[DEVICE_QUERY_STATUS])
  const domain = rawDomain || null
  const status = VALID_STATUS.has(rawStatus) ? (rawStatus as DeviceFilterState['status']) : null
  return { domain, status, present: Boolean(domain || status) }
}

/**
 * 把当前状态回写成 query 键值（用于 `router.replace`）。
 *
 * 默认值（`all` / 空串）返回 `null`，由调用方删除键，而不是写成 `?status=all`：
 * URL 只表达非默认值，链接才短。
 */
export function toDeviceQueryParams(state: { domain: string; status: DeviceFilterState['status'] }): {
  domain: string | null
  status: string | null
} {
  return {
    domain: state.domain && state.domain !== 'all' ? state.domain : null,
    status: state.status && state.status !== 'all' ? state.status : null,
  }
}
