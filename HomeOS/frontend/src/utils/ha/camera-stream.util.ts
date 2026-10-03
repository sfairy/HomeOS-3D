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
}

/** 摄像头实体类型别名，兼容 null/undefined */
type CameraEntity = HaEntityState | null | undefined

/** 读取摄像头实体的 access_token（HA 用于鉴权摄像头流的令牌） */
function cameraToken(entity: CameraEntity) {
  return entity?.attributes?.access_token || ''
}

/**
 * 构造 HA 摄像头代理端点的相对路径。
 * @param entity 摄像头实体
 * @param endpoint HA 端点名（如 camera_proxy / camera_proxy_stream / hls）
 * @returns 形如 `/api/<endpoint>/<entity_id>?token=<token>` 的路径；缺实体或令牌时返回空串
 */
function cameraHaPath(entity: CameraEntity, endpoint: string) {
  const eid = entity?.entity_id
  const token = cameraToken(entity)
  if (!eid || !token) return ''
  return `/api/${endpoint}/${eid}?token=${token}`
}

/** 浏览器是否原生支持 HLS（Safari 等）；Chrome/Firefox 通常需 hls.js */
export function canPlayNativeHls(): boolean {
  if (typeof document === 'undefined') return false
  const v = document.createElement('video')
  return (
    v.canPlayType('application/vnd.apple.mpegurl') !== '' ||
    v.canPlayType('application/x-mpegURL') !== ''
  )
}

/** 是否为 WebRTC 摄像头实体：frontend_stream_type 为 web_rtc 或 stream_source 含 webrtc/go2rtc */
function isWebRtcCameraEntity(entity: CameraEntity) {
  const attrs = entity?.attributes || {}
  if (attrs.frontend_stream_type === 'web_rtc') return true
  const src = attrs.stream_source
  return typeof src === 'string' && /webrtc|go2rtc/i.test(src)
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

/**
 * 获取摄像头 HLS 播放地址。
 * 优先使用 stream_source 中的 .m3u8；其次按 entity_id 构造 HA 的 /api/hls 端点。
 * @param haUrl HA 基地址
 * @param entity 摄像头实体
 * @returns HLS 地址；不可用时返回空串
 */
function isHlsCameraEntity(entity: CameraEntity) {
  const attrs = entity?.attributes || {}
  if (attrs.frontend_stream_type === 'hls') return true
  const src = attrs.stream_source
  return typeof src === 'string' && /\.m3u8/i.test(src)
}

function getCameraHlsUrl(haUrl: string | null | undefined, entity: CameraEntity) {
  const attrs = entity?.attributes || {}
  const src = attrs.stream_source
  if (typeof src === 'string' && /\.m3u8/i.test(src)) {
    if (src.startsWith('http')) return resolveHaResourceUrl(haUrl, src, 'stream')
    if (src.startsWith('/')) return resolveHaResourceUrl(haUrl, src, 'stream')
    return ''
  }
  const eid = entity?.entity_id
  const token = cameraToken(entity)
  if (!eid || !haUrl || !token) return ''
  if (!isHlsCameraEntity(entity)) return ''
  return resolveHaResourceUrl(haUrl, `/api/hls/${eid}/playlist.m3u8?token=${token}`, 'stream')
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
  if (cacheBust) path += `&_=${cacheBust}`
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
    if (!preferHls) return null
    const hls = getCameraHlsUrl(haUrl, entity)
    return hls ? { mode: 'hls', url: hls } : null
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