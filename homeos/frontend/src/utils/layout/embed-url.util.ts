/**
 * 内嵌页 URL 工具。
 *
 * 职责：判断内嵌目标是否可嵌入、是否需走同源反代，构造 iframe src，
 * 检测 Chrome 错误页，并管理 embed_ctx 标记 Cookie。
 *
 * 依赖：无外部依赖，纯函数工具。
 */
/** 归一化主机名，便于比较 localhost / 127.0.0.1 / ::1 */

type LocationLike = Pick<Location, 'hostname' | 'protocol'>

/**
 * 归一化主机名：将 127.0.0.1 / ::1 统一为 localhost，其余转小写。
 * @param hostname 原始主机名
 * @returns 归一化后的主机名
 */
function normalizeEmbedHostname(hostname: string | null | undefined) {
  const h = String(hostname || '').toLowerCase()

  if (h === '127.0.0.1' || h === '[::1]' || h === '::1') return 'localhost'

  return h
}

/** 是否为当前 HomeOS 实例地址（不可 iframe 嵌入自身） */
function isSameAppEmbedUrl(
  urlString: string | null | undefined,
  currentLocation: LocationLike = window.location,
) {
  if (!urlString?.trim()) return false

  try {
    const target = new URL(urlString.trim())

    if (!/^https?:$/i.test(target.protocol)) return false

    // 同主机任意端口均视为 HomeOS 自身（常见误配：HTTPS :8803 访问、内嵌 http://LAN:8801）
    return (
      normalizeEmbedHostname(target.hostname) === normalizeEmbedHostname(currentLocation.hostname)
    )
  } catch {
    return false
  }
}

/**
 * 判断内嵌 URL 是否合法（http/https 协议且主机名非空）。
 * @param urlString 待校验 URL
 */
function isValidEmbedUrl(urlString: string | null | undefined) {
  if (!urlString?.trim()) return false

  try {
    const u = new URL(urlString.trim())

    return /^https?:$/i.test(u.protocol) && u.hostname.length > 0
  } catch {
    return false
  }
}

/**
 * 内嵌目标是否可经后端同源反代承载。
 * 与后端 validateEmbedTargetUrl 放行范围一致：仅局域网地址，排除 localhost/127.0.0.1。
 */
function isProxyableEmbedHost(hostname: string | null | undefined): boolean {
  const h = normalizeEmbedHostname(hostname)

  if (h === 'localhost') return false

  return (
    /^10\./.test(h) ||
    /^192\.168\./.test(h) ||
    /^172\.(1[6-9]|2\d|3[01])\./.test(h) ||
    /^169\.254\./.test(h) ||
    h.endsWith('.local')
  )
}

/**
 * 是否应将内嵌页改走 /api/v1/embed-proxy 同源反代。
 *
 * 对「可反代的局域网目标」一律走同源反代，因为这是让内嵌站**登录会话**成立的唯一方式：
 * 直连 iframe 为跨站第三方上下文，内嵌站会话 Cookie（默认 SameSite=Lax）不会在跨站
 * iframe 请求中发送，登录态无法保持；同源反代后这些 Cookie 写在 HomeOS 同源下变为第一方。
 *
 * 资源加载由三重保障：① 后端静态改写（HTML 属性根相对 URL、按扩展名的资源路径、`url()`）；
 * ② 注入运行时垫片（拦截 fetch/XHR/EventSource/WebSocket 的根相对地址）；
 * ③ 后端 Referer 兜底（任何逃逸到 HomeOS 根、Referer 指向内嵌页的子资源自动转回反代）。
 *
 * 公网目标无法反代（后端 SSRF 仅放行局域网）：HTTPS 父页内嵌 HTTP 时仍须反代（混合内容
 * 无法直连），其余退化为直连 iframe。
 */
function needsEmbedProxy(
  urlString: string,
  currentLocation: LocationLike = window.location,
): boolean {
  const trimmed = urlString?.trim()

  if (!trimmed) return false

  try {
    const target = new URL(trimmed)

    if (!/^https?:$/i.test(target.protocol)) return false

    if (isProxyableEmbedHost(target.hostname)) return true

    return currentLocation?.protocol === 'https:' && target.protocol === 'http:'
  } catch {
    return false
  }
}

/** 构建 iframe src：HTTPS 下 HTTP 内嵌页走 /api/v1/embed-proxy/:id */
export function resolveEmbedIframeSrc(
  embedId: string,
  urlString: string,
  currentLocation: LocationLike = window.location,
): string {
  const trimmed = urlString?.trim()

  if (!trimmed || !embedId) return trimmed || ''

  if (needsEmbedProxy(trimmed, currentLocation)) {
    // 反代以上游 origin 为基准（见后端 resolveEmbedBaseUrl）：须把配置 URL 的路径（如 /p）
    // 带入反代路径，内嵌应用才在其 base 路径下加载；其根相对绝对资源（/p/assets/x.js）经反代
    // 映射回上游同一路径，不会重复拼接为 /p/p/...。根路径保留末尾斜杠以便会话 Cookie 回传。

    let suffix = '/'

    try {
      const p = new URL(trimmed).pathname

      // 末尾保留斜杠：基路径型 SPA 的路由 basename 为 `/p/`，反代后被重定位为
      // `/api/v1/embed-proxy/<id>/p/`，iframe 须以该带尾斜杠路径加载，location.pathname
      // 方能命中 basename 前缀，否则 BrowserRouter 不匹配而白屏。
      suffix = p && p !== '/' ? (p.endsWith('/') ? p : `${p}/`) : '/'
    } catch {
      /* 解析失败回退根路径 */
    }

    return `/api/v1/embed-proxy/${encodeURIComponent(embedId)}${suffix}`
  }

  return trimmed
}

/**
 * 返回阻止嵌入的原因文案；可嵌入时返回 null。
 * @param urlString 待校验 URL
 * @param currentLocation 当前页面 location
 * @returns 阻止原因文案，或 null 表示可嵌入
 */
export function getEmbedBlockReason(
  urlString: string | null | undefined,
  currentLocation: LocationLike = window.location,
) {
  if (!urlString?.trim()) return null

  if (!isValidEmbedUrl(urlString))
    return '内嵌地址无效，请填写以 http:// 或 https:// 开头的完整 URL。'

  if (isSameAppEmbedUrl(urlString, currentLocation))
    return '不能将 HomeOS 自身地址（相同主机名，含其它端口）作为内嵌页。请填写外部系统的完整 URL，例如 NAS、MoviePilot 等服务的地址。'

  return null
}

/**
 * iframe load 后检测是否落在 Chrome 错误页（仅同源可读）。
 * @param iframeEl iframe 元素
 * @returns true 表示落在错误页或空白页
 */
export function isIframeChromeError(iframeEl: HTMLIFrameElement | null | undefined) {
  if (!iframeEl?.contentWindow) return false

  try {
    const href = iframeEl.contentWindow.location.href

    return !href || href === 'about:blank' || href.startsWith('chrome-error://')
  } catch {
    return false
  }
}

/** 离开内嵌页时清除 embed_ctx 标记 Cookie，避免 SPA fallback 误劫持 HomeOS 资源请求 */
const EMBED_CTX_COOKIE_PREFIX = 'embed_ctx__'

/**
 * 设置 embed_ctx 标记 Cookie（HTTPS 下追加 Secure）。
 * @param embedId 内嵌页 id
 */
export function setEmbedCtxCookie(embedId: string) {
  const id = String(embedId || '').trim()
  if (!id) return
  const name = `${EMBED_CTX_COOKIE_PREFIX}${encodeURIComponent(id)}`
  const securePart = window.location.protocol === 'https:' ? '; Secure' : ''
  document.cookie = `${name}=1; Path=/; SameSite=Lax${securePart}`
}

/**
 * 清除所有 embed_ctx 标记 Cookie（遍历 document.cookie 并置 Max-Age=0）。
 */
export function clearAllEmbedCtxCookies() {
  for (const part of document.cookie.split(';')) {
    const name = part.split('=')[0]?.trim()
    if (!name?.startsWith(EMBED_CTX_COOKIE_PREFIX)) continue
    const base = `${name}=; Path=/; Max-Age=0; SameSite=Lax`
    document.cookie = base
    if (window.location.protocol === 'https:') {
      document.cookie = `${base}; Secure`
    }
  }
}

