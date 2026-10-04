/**
 * HA 资源 URL 工具。
 *
 * 职责：浏览器无法直连 HA 媒体时，将资源改走 HomeOS 同源代理；
 * 同时提供 HA 绝对地址构造、相对路径提取与 entity_picture 解析能力。
 *
 * 依赖：@homeos/shared 的 normalizeHaUrl 用于归一化 HA 基地址。
 */
import { normalizeHaUrl } from '@homeos/shared'

/** HA 代理端点类型：media（媒体/快照）/ stream（流） */
type HaProxyKind = 'media' | 'stream'

/**
 * 浏览器侧 HA 媒体一律走 HomeOS 同源代理。
 * 直连 HA（尤其前面还有 nginx/:80）时 camera_proxy_stream 常 502；后端用长期 Token 拉取更稳。
 */
export function needsHaMediaProxy(resourceUrl: string): boolean {
  return typeof window !== 'undefined' && Boolean(resourceUrl)
}

/**
 * 构造 HomeOS 同源代理 URL。
 * @param haPath HA 相对路径（自动补前导斜杠）
 * @param kind 代理类型，决定走 media-proxy 还是 stream-proxy 端点
 * @returns 形如 `/api/v1/ha/<kind>-proxy?path=<encoded>` 的同源地址
 */
function buildHaProxyUrl(haPath: string, kind: HaProxyKind = 'media'): string {
  const base = kind === 'stream' ? '/api/v1/ha/stream-proxy' : '/api/v1/ha/media-proxy'
  const path = haPath.startsWith('/') ? haPath : `/${haPath}`
  return `${base}?path=${encodeURIComponent(path)}`
}

/**
 * 拼接 HA 基地址与相对路径为绝对 URL。
 * @param haUrl HA 基地址
 * @param haPath HA 相对路径（自动补前导斜杠）
 * @returns 形如 `<haUrl><haPath>` 的绝对地址
 */
export function buildHaAbsoluteUrl(haUrl: string, haPath: string): string {
  const path = haPath.startsWith('/') ? haPath : `/${haPath}`
  return `${normalizeHaUrl(haUrl)}${path}`
}

/**
 * 从 HA 绝对地址中提取相对路径（pathname + search）。
 * @param haUrl HA 基地址，用于校验 origin
 * @param absolute 待提取的绝对地址
 * @returns 相对路径；origin 不匹配或解析失败时返回 null
 */
function extractHaPathFromAbsolute(haUrl: string, absolute: string): string | null {
  try {
    const base = new URL(normalizeHaUrl(haUrl))
    const url = new URL(absolute)
    if (url.origin !== base.origin) return null
    return `${url.pathname}${url.search}`
  } catch {
    return null
  }
}

/**
 * 将 HA 媒体/流地址解析为浏览器可加载 URL（一律经 HomeOS 同源代理）。
 *
 * @param haUrl HA 基地址
 * @param haPath HA 相对路径或绝对地址
 * @param kind 代理类型（走代理时使用）
 * @returns 可直接加载的资源 URL；入参为空时返回空串
 */
export function resolveHaResourceUrl(
  haUrl: string | null | undefined,
  haPath: string,
  kind: HaProxyKind = 'media',
): string {
  if (!haUrl?.trim() || !haPath?.trim()) return ''

  const absolute =
    haPath.startsWith('http://') || haPath.startsWith('https://')
      ? haPath.trim()
      : buildHaAbsoluteUrl(haUrl, haPath)

  if (!needsHaMediaProxy(absolute)) return absolute

  const relative = extractHaPathFromAbsolute(haUrl, absolute)
  if (relative) return buildHaProxyUrl(relative, kind)

  return absolute
}

/**
 * 解析 entity_picture / snapshot 等 HA 相对或绝对路径为可加载 URL。
 * @param haUrl HA 基地址
 * @param picture HA 返回的图片路径（data: / /api/ / /local/ / /media/ / http(s): 或其它）
 * @param kind 代理类型
 * @returns 可加载的 URL 或原值；data: 与无法解析的路径原样返回；空值返回 null
 */
export function resolveHaEntityPicture(
  haUrl: string | null | undefined,
  picture: string | null | undefined,
  kind: HaProxyKind = 'media',
): string | null {
  if (!picture?.trim()) return null
  const pic = picture.trim()
  // data: URI 无需代理，原样返回
  if (pic.startsWith('data:')) return pic
  // HA 相对路径：需拼接 HA 基地址并按需代理
  if (pic.startsWith('/api/') || pic.startsWith('/local/') || pic.startsWith('/media/')) {
    if (!haUrl?.trim()) return null
    return resolveHaResourceUrl(haUrl, pic, kind)
  }
  // 绝对地址：有 HA 基地址时走代理逻辑，否则原样返回
  if (pic.startsWith('http://') || pic.startsWith('https://')) {
    if (!haUrl?.trim()) return pic
    return resolveHaResourceUrl(haUrl, pic, kind)
  }
  return pic
}