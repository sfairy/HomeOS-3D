/** 设备页深链 URL 构建工具（与 settingsRoute 对称） */
type DevicesRouteQuery = Record<string, string | number | boolean | undefined | null>

function devicesRoute(query: DevicesRouteQuery = {}) {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value == null || value === '' || value === false) continue
    params.set(key, String(value === true ? '1' : value))
  }
  const qs = params.toString()
  return qs ? `/devices?${qs}` : '/devices'
}

/** DEVICES_ROUTES：对象常量，字段 / 方法语义见定义处。 */
export const DEVICES_ROUTES = {
  list: (extra?: DevicesRouteQuery) => devicesRoute({ ...extra }),
  analytics: (extra?: DevicesRouteQuery) => devicesRoute({ view: 'analytics', ...extra }),
  offline: () => devicesRoute({ status: 'offline', controllable: 0 }),
  favorites: () => devicesRoute({ favorites: 1, controllable: 0 }),
  domain: (domain: string) => devicesRoute({ domain, controllable: 0 }),
  search: (q: string) => devicesRoute({ q, controllable: 0 }),
}
