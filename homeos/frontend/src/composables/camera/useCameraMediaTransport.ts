/**
 * 与 3D `camera-media.ts` 同源的摄像头拉流：HLS（hls.js 优先）→ MJPEG → 快照。
 */
import type HlsJs from 'hls.js'
import { resolveCameraHlsPlayUrl } from '@/utils/ha/camera-stream.util'
import { logger } from '@/utils/core/logger'

type HlsCtor = typeof HlsJs
type HlsInstance = InstanceType<HlsCtor>
type ImageStage = 'none' | 'mjpeg' | 'snapshot'

const HLS_FALLBACK_MS = 12000

async function loadHlsRuntime(): Promise<HlsCtor | null> {
  const injected = (window as Window & { Hls?: HlsCtor }).Hls
  if (injected?.isSupported?.()) return injected
  try {
    const { default: Hls } = await import('hls.js')
    if (Hls.isSupported()) return Hls
  } catch (error) {
    logger.debug('[camera-media] 加载 hls.js 失败', error)
  }
  return null
}

function isSafariNativeHls(): boolean {
  if (typeof navigator === 'undefined') return false
  const ua = navigator.userAgent
  return /safari/i.test(ua) && !/chrome|crios|fxios|edg/i.test(ua)
}

export type CameraMediaStopFn = () => void

export async function startCameraMediaTransport(
  entityId: string,
  videoEl: HTMLVideoElement,
  imageEl: HTMLImageElement,
  onUnavailable?: () => void,
): Promise<CameraMediaStopFn> {
  const eid = String(entityId || '').trim()
  if (!eid) throw new Error('摄像头实体为空')

  let stopped = false
  let hls: HlsInstance | null = null
  let fallbackTimer = 0
  let imageStage: ImageStage = 'none'

  const stop = () => {
    if (stopped) return
    stopped = true
    window.clearTimeout(fallbackTimer)
    hls?.destroy()
    hls = null
    videoEl.pause()
    videoEl.removeAttribute('src')
    videoEl.srcObject = null
    videoEl.load()
    imageEl.removeAttribute('src')
  }

  const showImage = (url: string, stage: ImageStage) => {
    imageStage = stage
    videoEl.style.display = 'none'
    imageEl.style.display = ''
    imageEl.src = url
  }

  const showVideo = () => {
    imageStage = 'none'
    imageEl.style.display = 'none'
    imageEl.removeAttribute('src')
    videoEl.style.display = ''
  }

  const startMjpeg = () => {
    if (stopped || imageStage === 'mjpeg' || imageStage === 'snapshot') return
    window.clearTimeout(fallbackTimer)
    hls?.destroy()
    hls = null
    videoEl.pause()
    videoEl.removeAttribute('src')
    videoEl.load()
    showImage(`/api/camera_proxy_stream/${encodeURIComponent(eid)}`, 'mjpeg')
  }

  const startSnapshot = () => {
    if (stopped || imageStage === 'snapshot') return
    showImage(`/api/camera_proxy/${encodeURIComponent(eid)}?hb=${Date.now()}`, 'snapshot')
  }

  const onImageError = () => {
    if (stopped) return
    if (imageStage === 'mjpeg') startSnapshot()
    else if (imageStage === 'snapshot') onUnavailable?.()
  }

  const onVideoError = () => {
    if (stopped) return
    startMjpeg()
  }

  imageEl.addEventListener('error', onImageError)
  videoEl.addEventListener('error', onVideoError)

  const wrappedStop = () => {
    imageEl.removeEventListener('error', onImageError)
    videoEl.removeEventListener('error', onVideoError)
    stop()
  }

  const attachHls = async (playUrl: string) => {
    showVideo()
    const Hls = await loadHlsRuntime()
    if (stopped) return
    if (Hls) {
      const player = new Hls({
        enableWorker: true,
        lowLatencyMode: true,
        backBufferLength: 15,
        maxBufferLength: 15,
        maxMaxBufferLength: 15,
        maxBufferSize: 0x7a1200,
        xhrSetup(xhr, reqUrl) {
          try {
            const resolved = new URL(reqUrl, window.location.href)
            if (resolved.origin === window.location.origin) xhr.withCredentials = true
          } catch {
            /* ignore */
          }
        },
      })
      hls = player
      player.on(Hls.Events.ERROR, (_ev, data) => {
        if (stopped || !data?.fatal) return
        logger.warn('[camera-media] HLS 致命错误，降级 MJPEG', data.type, data.details)
        startMjpeg()
      })
      player.on(Hls.Events.MANIFEST_PARSED, () => {
        void videoEl.play().catch(() => {})
      })
      player.attachMedia(videoEl)
      player.loadSource(playUrl)
      return
    }
    if (isSafariNativeHls()) {
      videoEl.src = playUrl
      void videoEl.play().catch(() => startMjpeg())
      return
    }
    startMjpeg()
  }

  fallbackTimer = window.setTimeout(() => {
    if (stopped || videoEl.readyState >= 2 || imageEl.naturalWidth) return
    startMjpeg()
  }, HLS_FALLBACK_MS)

  try {
    const playUrl = await resolveCameraHlsPlayUrl(eid)
    if (!stopped) await attachHls(playUrl)
  } catch (error) {
    logger.warn('[camera-media] HLS 换票失败，降级 MJPEG', error)
    startMjpeg()
  }

  return wrappedStop
}
