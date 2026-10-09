/**
 * 摄像头流解析工具。
 *
 * 职责：根据 HA 摄像头实体的属性（frontend_stream_type / stream_source / access_token）
 * 判断其支持的视频流类型（WebRTC / HLS / MJPEG / 快照），并构造可在前端直接播放的 URL。
 *
 * 依赖：
 * - @/utils/ha/ha-media-url.util：处理 HA 资源 URL 的同源代理与协议归一化
 * - @/types/entity-store：HA 实体状态类型
 */
import {
  needsHaMediaProxy,
  resolveHaResourceUrl,
  buildHaAbsoluteUrl,
} from '@/utils/ha/media-url.util'
import type { HaEntityState } from '@/types/entity-store'

/** 摄像头流的展示模式：WebRTC / HLS / MJPEG / 快照 / 无可用流 */
type CameraDisplayMode = 'webrtc' | 'hls' | 'mjpeg' | 'snapshot' | 'none'

/** WebRTC 信令通道类型：ha（HA 原生）/ go2rtc（go2rtc WebSocket 信令） */
type CameraWebRtcSignal = 'ha' | 'go2rtc'

/** 摄像头展示信息：播放模式、流地址、WebRTC 信令类型与实体 id */
interface CameraDisplay {
  mode: CameraDisplayMode
  url: string
  webrtcSignal?: CameraWebRtcSignal
  entityId?: string
  /**
   * 为 true 时 `url` 尚不可用：需先 `GET /api/camera_hls/{entityId}` 换真实 m3u8
   *（与 3D `resolveCameraStreamSource` 同源，走 HA websocket `camera/stream`）。
   */
  resolveHlsViaApi?: boolean
}

/** HA CameraEntityFeature.STREAM —— 支持后端拉 HLS/WebRTC 流 */
const CAMERA_FEATURE_STREAM = 2

/** 摄像头实体类型别名，兼容 null/undefined */
type CameraEntity = HaEntityState | null | undefined

/** 读取摄像头实体的 access_token（HA 用于鉴权摄像头流的令牌） */
function cameraToken(entity: CameraEntity) {
  return entity?.attributes?.access_token || ''
}

/**
 * 构造 HA 摄像头代理端点的相对路径。
 * @param entity 摄像头实体
 * @param endpoint HA 端点名（如 camera_proxy / camera_proxy_stream）
 * @returns 形如 `/api/<endpoint>/<entity_id>` 的路径；缺实体时返回空串
 *
 * 同源代理由后端注入长期 Bearer，勿附带实体 `access_token`：
 * 状态里的 token 易过期，转发给 HA 时常导致 500，而 3D 总览的无 token 路径正常。
 */
function cameraHaPath(entity: CameraEntity, endpoint: string) {
  const eid = entity?.entity_id
  if (!eid) return ''
  return `/api/${endpoint}/${eid}`
}

/** 仅 Safari 走原生 HLS。Chromium 会对 mpegurl 返回 maybe，但播不了 H.265。 */
export function canPlayNativeHls(): boolean {
  if (typeof document === 'undefined' || typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  if (!/safari/i.test(ua) || /chrome|crios|fxios|edg/i.test(ua)) return false
  const v = document.createElement('video')
  return (
    v.canPlayType('application/vnd.apple.mpegurl') !== '' ||
    v.canPlayType('application/x-mpegURL') !== ''
  )
}

/** 是否走 HA 原生 WebRTC：显式 web_rtc、go2rtc 源，或具备 STREAM 能力（H265 摄像头 HLS 常播不了） */
function isWebRtcCameraEntity(entity: CameraEntity) {
  const attrs = entity?.attributes || {}
  if (attrs.frontend_stream_type === 'web_rtc') return true
  const src = attrs.stream_source
  if (typeof src === 'string' && /webrtc|go2rtc/i.test(src)) return true
  // HA 对流媒体摄像头默认提供 camera/webrtc/*；与 3D/官方前端一致优先 WebRTC。
  return ((Number(attrs.supported_features) || 0) & CAMERA_FEATURE_STREAM) !== 0
}

/** 仅无 HA web_rtc 声明、且 stream_source 指向 go2rtc 时走 /api/webrtc/ws */
function isGo2RtcWsCameraEntity(entity: CameraEntity) {
  const attrs = entity?.attributes || {}
  if (attrs.frontend_stream_type === 'web_rtc') return false
  const src = attrs.stream_source
  return typeof src === 'string' && /go2rtc/i.test(src)
}

/**
 * 构造 go2rtc WebSocket 信令地址。
 *
 * 当 HA 资源需走同源代理时，改用 HomeOS 自身的反代端点
 * /api/v1/ha/webrtc-ws；否则将 HA 的 http(s) 地址协议替换为 ws(s)。
 *
 * @param haUrl HA 基地址
 * @param entity 摄像头实体
 * @returns WebSocket 信令 URL；缺实体或令牌时返回空串
 */
function buildGo2RtcWsUrl(haUrl: string, entity: CameraEntity): string {
  const eid = entity?.entity_id
  const token = cameraToken(entity)
  if (!eid || !token) return ''
  const path = `/api/webrtc/ws?entity_id=${encodeURIComponent(eid)}&token=${token}`
  const absolute = buildHaAbsoluteUrl(haUrl, path)
  if (needsHaMediaProxy(absolute)) {
    // 走 HomeOS 同源反代，由后端转发到 HA 的 /api/webrtc/ws
    const host = typeof window !== 'undefined' ? window.location.host : ''
    const proto =
      typeof window !== 'undefined' && window.location.protocol === 'https:' ? 'wss:' : 'ws:'
    return `${proto}//${host}/api/v1/ha/webrtc-ws?entity_id=${encodeURIComponent(eid)}&token=${token}`
  }
  // 直连 HA：http→ws / https→wss
  return absolute.replace(/^http/, 'ws')
}

/**
 * 解析 WebRTC 摄像头的展示信息。
 * @param haUrl HA 基地址
 * @param entity 摄像头实体
 * @returns WebRTC 展示信息（含信令通道与实体 id）；非 WebRTC 实体或缺参时返回 null
 */
function resolveWebRtcDisplay(
  haUrl: string | null | undefined,
  entity: CameraEntity,
): Pick<CameraDisplay, 'url' | 'webrtcSignal' | 'entityId'> | null {
  if (!isWebRtcCameraEntity(entity)) return null
  const eid = entity?.entity_id
  if (!eid || !haUrl) return null

  if (isGo2RtcWsCameraEntity(entity)) {
    const wsUrl = buildGo2RtcWsUrl(haUrl, entity)
    if (wsUrl) return { url: wsUrl, webrtcSignal: 'go2rtc', entityId: eid }
  }

  return { url: '', webrtcSignal: 'ha', entityId: eid }
}

/** 实体是否声明了可拉流（STREAM 位 / frontend_stream_type / stream_source.m3u8） */
function hasCameraStreamCapability(entity: CameraEntity) {
  const attrs = entity?.attributes || {}
  if (attrs.frontend_stream_type === 'hls' || attrs.frontend_stream_type === 'web_rtc') return true
  if ((Number(attrs.supported_features) || 0) & CAMERA_FEATURE_STREAM) return true
  const src = attrs.stream_source
  return typeof src === 'string' && /\.m3u8/i.test(src)
}

/**
 * 解析可直接播放的 HLS URL（仅当实体已给出 m3u8 路径时）。
 * 多数摄像头只有 STREAM 能力位、没有 stream_source —— 那种情况走
 * {@link resolveCameraHlsPlayUrl}（`/api/camera_hls`），与 3D 一致。
 */
function getExplicitCameraHlsUrl(haUrl: string | null | undefined, entity: CameraEntity) {
  const attrs = entity?.attributes || {}
  const src = attrs.stream_source
  if (typeof src === 'string' && /\.m3u8/i.test(src)) {
    if (src.startsWith('http') || src.startsWith('/')) {
      return resolveHaResourceUrl(haUrl, src, 'stream')
    }
  }
  return ''
}

/**
 * 通过 HomeOS `/api/camera_hls/{entityId}` 向 HA 换取同源 HLS 播放地址。
 * @throws 请求失败或响应无有效相对路径时
 */
export async function resolveCameraHlsPlayUrl(entityId: string): Promise<string> {
  const eid = String(entityId || '').trim()
  if (!eid) throw new Error('摄像头实体为空')
  const response = await fetch(`/api/camera_hls/${encodeURIComponent(eid)}`, {
    credentials: 'same-origin',
  })
  if (!response.ok) {
    throw new Error(`摄像头 HLS 请求失败: ${response.status}`)
  }
  const payload = (await response.json()) as { url?: unknown }
  const url = typeof payload?.url === 'string' ? payload.url.trim() : ''
  if (!url.startsWith('/')) throw new Error('摄像头 HLS 响应无可用代理地址')
  return url
}

/**
 * 获取摄像头 MJPEG 流地址（HA 的 camera_proxy_stream 端点）。
 * @param haUrl HA 基地址
 * @param entity 摄像头实体
 * @returns MJPEG 流地址；不可用时返回空串
 */
function getCameraStreamUrl(haUrl: string | null | undefined, entity: CameraEntity) {
  if (!haUrl) return ''
  const path = cameraHaPath(entity, 'camera_proxy_stream')
  if (!path) return ''
  return resolveHaResourceUrl(haUrl, path, 'stream')
}

/**
 * 获取摄像头快照地址（HA 的 camera_proxy 端点）。
 * @param haUrl HA 基地址
 * @param entity 摄像头实体
 * @param cacheBust 可选的缓存破坏参数（时间戳），追加为 `&_=<值>` 以强制刷新
 * @returns 快照地址；不可用时返回空串
 */
export function getCameraSnapshotUrl(
  haUrl: string | null | undefined,
  entity: CameraEntity,
  cacheBust: string | number = '',
) {
  if (!haUrl) return ''
  let path = cameraHaPath(entity, 'camera_proxy')
  if (!path) return ''
  // 与 3D `camera-media` 一致用 `hb` 做缓存破坏，避免依赖实体 access_token
  if (cacheBust !== '' && cacheBust != null) path += `?hb=${cacheBust}`
  return resolveHaResourceUrl(haUrl, path, 'media')
}

/**
 * 综合解析摄像头最佳展示方式。
 *
 * 选择优先级（受参数控制）：
 * - 默认：WebRTC → HLS → MJPEG → 快照
 * - lowLatency：WebRTC → MJPEG → HLS → 快照（弹窗/门铃，避免无 HLS 的摄像头先撞 502）
 *
 * @param haUrl HA 基地址
 * @param entity 摄像头实体
 * @param options.preferHls 是否启用 HLS，默认 true
 * @param options.preferWebRtc 是否优先 WebRTC，默认 true
 * @param options.preferMjpeg 是否启用 MJPEG，默认 true
 * @param options.lowLatency 低延迟优先（MJPEG 先于 HLS），默认 false
 * @returns 摄像头展示信息
 */
export function resolveCameraDisplay(
  haUrl: string | null | undefined,
  entity: CameraEntity,
  {
    preferHls = true,
    preferWebRtc = true,
    preferMjpeg = true,
    lowLatency = false,
  }: {
    preferHls?: boolean
    preferWebRtc?: boolean
    preferMjpeg?: boolean
    lowLatency?: boolean
  } = {},
): CameraDisplay {
  if (preferWebRtc) {
    const webrtc = resolveWebRtcDisplay(haUrl, entity)
    if (webrtc) {
      return {
        mode: 'webrtc',
        url: webrtc.url,
        webrtcSignal: webrtc.webrtcSignal,
        entityId: webrtc.entityId,
      }
    }
  }

  const tryHls = (): CameraDisplay | null => {
    if (!preferHls || !haUrl) return null
    const explicit = getExplicitCameraHlsUrl(haUrl, entity)
    if (explicit) return { mode: 'hls', url: explicit }
    const eid = entity?.entity_id
    if (eid && hasCameraStreamCapability(entity)) {
      return { mode: 'hls', url: '', entityId: eid, resolveHlsViaApi: true }
    }
    return null
  }
  const tryMjpeg = (): CameraDisplay | null => {
    if (!preferMjpeg) return null
    const mjpeg = getCameraStreamUrl(haUrl, entity)
    return mjpeg ? { mode: 'mjpeg', url: mjpeg } : null
  }

  if (lowLatency) {
    const mjpeg = tryMjpeg()
    if (mjpeg) return mjpeg
    const hls = tryHls()
    if (hls) return hls
  } else {
    const hls = tryHls()
    if (hls) return hls
    const mjpeg = tryMjpeg()
    if (mjpeg) return mjpeg
  }

  const snap = getCameraSnapshotUrl(haUrl, entity)
  if (snap) return { mode: 'snapshot', url: snap }
  return { mode: 'none', url: '' }
}