/** HA 资源 URL 工具。 */
import { normalizeHaUrl } from '@homeos/shared'

/**
 * 浏览器侧 HA 媒体一律走 HomeOS 同源代理。
 * 直连 HA（尤其前面还有 nginx/:80）时 camera_proxy_stream 常 502；后端用长期 Token 拉取更稳。
 */
function needsHaMediaProxy(resourceUrl: string): boolean {
  return typeof window !== 'undefined' && Boolean(resourceUrl)
}

/**
 * 构造 HomeOS 同源代理 URL。
 *
 * `ha_proxy` 在同源挂载与 HA 相同的路径前缀
 *（`/api/camera_proxy`、`/api/camera_proxy_stream`、`/api/hls` 等）。
 * `kind` 由调用方写进 HA 路径（快照 vs 流），此处仅做同源路径归一化。
 *
 * @param haPath HA 相对路径（自动补前导斜杠）
 * @returns 形如 `/api/camera_proxy/<entity>` 的同源地址（鉴权由后端 Bearer 完成）
 */
function buildHaProxyUrl(haPath: string): string {
  return haPath.startsWith('/') ? haPath : `/${haPath}`
}

/**
 * 拼接 HA 基地址与相对路径为绝对 URL。
 * @param haUrl HA 基地址
 * @param haPath HA 相对路径（自动补前导斜杠）
 * @returns 形如 `<haUrl><haPath>` 的绝对地址
 */
function buildHaAbsoluteUrl(haUrl: string, haPath: string): string {
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
 * @returns 可直接加载的资源 URL；入参为空时返回空串
 */
function resolveHaResourceUrl(
  haUrl: string | null | undefined,
  haPath: string,
): string {
  if (!haUrl?.trim() || !haPath?.trim()) return ''

  const absolute =
    haPath.startsWith('http://') || haPath.startsWith('https://')
      ? haPath.trim()
      : buildHaAbsoluteUrl(haUrl, haPath)

  if (!needsHaMediaProxy(absolute)) return absolute

  const relative = extractHaPathFromAbsolute(haUrl, absolute)
  if (relative) return buildHaProxyUrl(relative)

  return absolute
}

/**
 * 解析 entity_picture / snapshot 等 HA 相对或绝对路径为可加载 URL。
 * @param haUrl HA 基地址
 * @param picture HA 返回的图片路径（data: / /api/ / /local/ / /media/ / http(s): 或其它）
 * @returns 可加载的 URL 或原值；data: 与无法解析的路径原样返回；空值返回 null
 */
export function resolveHaEntityPicture(
  haUrl: string | null | undefined,
  picture: string | null | undefined,
): string | null {
  if (!picture?.trim()) return null
  const pic = picture.trim()
  // data: URI 无需代理，原样返回
  if (pic.startsWith('data:')) return pic
  // HA 相对路径：需拼接 HA 基地址并按需代理
  if (pic.startsWith('/api/') || pic.startsWith('/local/') || pic.startsWith('/media/')) {
    if (!haUrl?.trim()) return null
    return resolveHaResourceUrl(haUrl, pic)
  }
  // 绝对地址：有 HA 基地址时走代理逻辑，否则原样返回
  if (pic.startsWith('http://') || pic.startsWith('https://')) {
    if (!haUrl?.trim()) return pic
    return resolveHaResourceUrl(haUrl, pic)
  }
  return pic
}