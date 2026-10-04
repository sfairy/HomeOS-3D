/**
 * HA 媒体/流路径校验与代理改写工具。
 *
 * 职责：
 *   - validateHaMediaPath / validateHaStreamPath：校验请求路径在允许前缀白名单内，防止 SSRF；
 *   - buildHaStreamFetchHeaders：为流式代理构造请求头（MJPEG 等）；
 *   - resolveHaMediaProxyCacheControl：按路径决定缓存策略（摄像头快照不缓存）；
 *   - rewriteHaM3u8ForProxy：将 m3u8 内 HA HLS 路径改写为 HomeOS stream-proxy 相对路径。
 * 关键依赖：../../common/utils/business-exception（路径非法时抛 400）、../../common/errors/api-error-messages。
 */
import { badRequest } from '../../common/utils/business-exception';
import { API_ERROR } from '../../common/errors/api-error-messages';

/** 允许代理的 HA 媒体/图片路径前缀（缓冲响应，防止 SSRF） */
const HA_MEDIA_PATH_ALLOWLIST = [
  '/api/camera_proxy',
  '/api/media_player_proxy',
  '/api/image_proxy',
  '/api/tts_proxy',
  '/local/',
  '/media/',
] as const;

/** 允许流式代理的 HA 路径前缀（MJPEG / HLS 等长连接） */
const HA_STREAM_PATH_ALLOWLIST = ['/api/camera_proxy_stream', '/api/hls'] as const;

/** 校验路径在白名单前缀内且无 SSRF 风险（含 ://、//、.. 时拒绝），返回带前导 / 的干净路径 */
function validateHaPath(path: string, allowlist: readonly string[]): string {
  const cleanPath = path.startsWith('/') ? path : `/${path}`;
  if (
    cleanPath.includes('://') ||
    cleanPath.startsWith('//') ||
    cleanPath.includes('..') ||
    !allowlist.some((p) => cleanPath.startsWith(p))
  ) {
    badRequest(API_ERROR.HA_MEDIA_PATH_INVALID);
  }
  return cleanPath;
}

/** 校验 HA 媒体/图片路径合法性（缓冲响应场景） */
export function validateHaMediaPath(path: string): string {
  return validateHaPath(path, HA_MEDIA_PATH_ALLOWLIST);
}

/** 校验 HA 流式路径合法性（MJPEG / HLS 长连接场景） */
export function validateHaStreamPath(path: string): string {
  return validateHaPath(path, HA_STREAM_PATH_ALLOWLIST);
}

/** 去除 query 参数并补前导 /，得到纯路径用于前缀匹配 */
function cleanHaPath(path: string): string {
  return (path.startsWith('/') ? path : `/${path}`).split('?')[0];
}

/** 判断路径是否为摄像头代理路径（决定缓存策略） */
function isHaCameraProxyPath(path: string): boolean {
  const clean = cleanHaPath(path);
  return clean.startsWith('/api/camera_proxy');
}

/** 向 HA 拉取媒体流时的请求头（不含 Authorization） */
export function buildHaStreamFetchHeaders(path: string): Record<string, string> {
  if (cleanHaPath(path).startsWith('/api/camera_proxy_stream')) {
    return { Accept: 'multipart/x-mixed-replace, image/jpeg, */*' };
  }
  return {};
}

/** media-proxy 响应 Cache-Control：摄像头快照不缓存，其余静态资源可缓存 */
export function resolveHaMediaProxyCacheControl(path: string): string {
  if (isHaCameraProxyPath(path)) {
    return 'no-cache, no-store, must-revalidate';
  }
  return 'public, max-age=3600';
}

/** 判断路径或 Content-Type 是否为 m3u8 播放列表 */
export function isHaM3u8Path(path: string, contentType?: string | null): boolean {
  if (/\.m3u8(\?|$)/i.test(path)) return true;
  const ct = (contentType || '').toLowerCase();
  return ct.includes('mpegurl') || ct.includes('m3u8');
}

/** 将 HA 路径转为 HomeOS stream-proxy 相对 URL（含 query 编码） */
function toHaStreamProxyUrl(haPath: string): string {
  return `/api/v1/ha/stream-proxy?path=${encodeURIComponent(haPath)}`;
}

/**
 * 把 playlist 里的 URI 解析成 HA `/api/hls…` 相对路径。
 * 相对分片按 playlist 目录解析，无 query 时继承 playlist 的 token。
 * 非 HA HLS（如外置 Frigate 绝对地址）返回 null，调用方原样保留。
 */
function resolveHaHlsPlaylistUri(uri: string, playlistPath: string): string | null {
  const trimmed = uri.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    try {
      const url = new URL(trimmed);
      if (!url.pathname.startsWith('/api/hls')) return null;
      return `${url.pathname}${url.search}`;
    } catch {
      return null;
    }
  }

  if (trimmed.startsWith('/api/hls')) {
    return trimmed;
  }

  if (!playlistPath.startsWith('/api/hls')) return null;
  try {
    const base = new URL(playlistPath, 'http://ha.invalid');
    const resolved = new URL(trimmed, base);
    if (!resolved.pathname.startsWith('/api/hls')) return null;
    return `${resolved.pathname}${resolved.search || base.search}`;
  } catch {
    return null;
  }
}

/**
 * 将 m3u8 内 HA HLS 路径（含相对分片、URI= 标签）改写为 HomeOS stream-proxy。
 * @param playlist 原始 m3u8 文本
 * @param playlistPath 当前 playlist 的 HA 路径（含 query），用于解析相对 URI
 */
export function rewriteHaM3u8ForProxy(playlist: string, playlistPath = ''): string {
  return playlist
    .split('\n')
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) return line;
      if (trimmed.startsWith('#')) {
        return line.replace(/URI=(["'])([^"']+)\1/gi, (match, quote: string, uri: string) => {
          const haPath = resolveHaHlsPlaylistUri(uri, playlistPath);
          return haPath ? `URI=${quote}${toHaStreamProxyUrl(haPath)}${quote}` : match;
        });
      }
      const haPath = resolveHaHlsPlaylistUri(trimmed, playlistPath);
      return haPath ? toHaStreamProxyUrl(haPath) : line;
    })
    .join('\n');
}
