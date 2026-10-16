/** 原生桥（Native Bridge）——把服务端访问配置推送给移动端外壳。 */

/** 推送给原生端的服务端访问配置 */
type ServerAccessConfig = {
  /** 内网访问地址，如 http://192.168.1.10:8801 或 https://192.168.1.10:8803 */
  internalUrl: string
  /** 远程访问地址（公网 / DDNS），可为空串表示未配置 */
  externalUrl: string
  /** 前端访问端口 */
  frontendPort: number
  /** 后端端口 */
  backendPort: number
}

/** 各桥接通道的最小形态（结构类型，避免为宿主 App 引入全局声明） */
type HomeOsNativeObjectBridge = {
  postToNative?: (payload: string) => void
}
type AuraNativeBridge = {
  syncServerConfig?: (payload: string) => void
}
type WebkitMessageHandler = {
  postMessage?: (payload: unknown) => void
}

/**
 * 读取全局对象上的桥（可能不存在）。
 * @param key 全局属性名
 * @returns 桥对象或 undefined
 */
function readGlobal<T>(key: string): T | undefined {
  try {
    const g = globalThis as unknown as Record<string, unknown>
    const value = g[key]
    return value && typeof value === 'object' ? (value as T) : undefined
  } catch {
    return undefined
  }
}

/**
 * 把服务端访问配置推送给原生端（fire-and-forget）。
 *
 * 依次尝试三个通道，命中第一个可用通道即返回；全部缺失时静默跳过。
 * 参数缺失（两个 URL 都为空）时直接返回，避免推送无意义载荷。
 * @param config 服务端访问配置
 * @returns 是否成功交给某个通道（用于日志 / 调试，不影响业务）
 */
export function pushServerAccessConfig(config: ServerAccessConfig): boolean {
  const internalUrl = String(config?.internalUrl ?? '').trim()
  const externalUrl = String(config?.externalUrl ?? '').trim()
  if (!internalUrl && !externalUrl) return false

  const payload = {
    type: 'server-config',
    internalUrl,
    externalUrl,
    frontendPort: Number(config?.frontendPort) || 0,
    backendPort: Number(config?.backendPort) || 0,
    updatedAt: new Date().toISOString(),
  }

  // 1) AuraNative（兼容上游壳）：字符串载荷
  const aura = readGlobal<AuraNativeBridge>('AuraNative')
  if (typeof aura?.syncServerConfig === 'function') {
    try {
      aura.syncServerConfig(JSON.stringify(payload))
      return true
    } catch {
      /* 忽略：交由下一个通道尝试 */
    }
  }

  // 2) HomeOSNative.postToNative：字符串载荷
  const homeos = readGlobal<HomeOsNativeObjectBridge>('HomeOSNative')
  if (typeof homeos?.postToNative === 'function') {
    try {
      homeos.postToNative(JSON.stringify(payload))
      return true
    } catch {
      /* 忽略：交由下一个通道尝试 */
    }
  }

  // 3) iOS WKWebView：对象载荷
  const webkit = (
    readGlobal<{ messageHandlers?: Record<string, WebkitMessageHandler> }>('webkit')
  )?.messageHandlers?.HomeOSNative
  if (typeof webkit?.postMessage === 'function') {
    try {
      webkit.postMessage(payload)
      return true
    } catch {
      /* 忽略 */
    }
  }

  return false
}
