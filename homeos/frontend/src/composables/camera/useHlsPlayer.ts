/**
 * @file HLS 摄像头播放器 Composable
 * @module composables/camera/useHlsPlayer
 * @description
 *   封装摄像头 HLS 流的播放能力：优先使用浏览器原生 HLS 支持（Safari/iOS），
 *   不支持时动态加载 hls.js 库（避免非 HLS 摄像头浪费包体积）。
 *   依赖：@/utils/ha/camera-stream.util 的原生 HLS 能力检测、hls.js（动态 import）。
 */
import { canPlayNativeHls } from '@/utils/ha/camera-stream.util'

/** HLS 停止函数类型：调用后停止播放并释放资源 */
type HlsStopFn = () => void

/**
 * 原生 HLS 或 hls.js 播放（动态加载，避免非 HLS 摄像头浪费包体积）
 * @param url HLS 流地址（m3u8）
 * @param videoEl 用于播放的 video 元素
 * @returns 停止函数，调用后暂停播放、清理资源
 * @throws URL 为空、浏览器不支持 HLS、或致命播放错误时抛出
 */
export async function startHlsPlayback(
  url: string,
  videoEl: HTMLVideoElement | null | undefined,
): Promise<HlsStopFn> {
  if (!url?.trim()) throw new Error('HLS URL 为空')
  if (!videoEl) throw new Error('HLS 播放器尚未挂载')

  // 与 3D 一致：hls.js 优先。Chromium 会对 mpegurl 报 maybe，但不能播 H.265。
  const { default: Hls } = await import('hls.js')
  if (!Hls.isSupported()) {
    if (canPlayNativeHls()) {
      videoEl.src = url
      await videoEl.play()
      return () => {
        videoEl.pause()
        videoEl.removeAttribute('src')
        videoEl.load()
      }
    }
    throw new Error('当前浏览器不支持 HLS 播放')
  }
  if (!videoEl.isConnected) throw new Error('HLS 播放器已卸载')

  const hls = new Hls({
    enableWorker: true,
    lowLatencyMode: true,
    xhrSetup(xhr, reqUrl) {
      if (typeof window === 'undefined' || !reqUrl) return
      try {
        const resolved = new URL(reqUrl, window.location.href)
        if (resolved.origin === window.location.origin) {
          xhr.withCredentials = true
        }
      } catch {
        /* 非法 URL 保持默认（不带 credentials） */
      }
    },
  })

  // 使用 Promise 包装，确保 manifest 解析成功且 play() 就绪后才返回停止函数
  return new Promise((resolve, reject) => {
    let settled = false
    const fail = (err: unknown) => {
      if (settled) return
      settled = true
      hls.destroy()
      reject(err instanceof Error ? err : new Error(String(err)))
    }

    // 监听致命错误：立即销毁并 reject
    hls.on(Hls.Events.ERROR, (_ev, data) => {
      if (data.fatal) fail(new Error(`HLS 错误: ${data.type}`))
    })

    hls.loadSource(url)
    hls.attachMedia(videoEl)

    // manifest 解析成功后开始播放
    hls.on(Hls.Events.MANIFEST_PARSED, () => {
      void videoEl
        .play()
        .then(() => {
          if (settled) return
          settled = true
          resolve(() => {
            hls.destroy()
            videoEl.pause()
            videoEl.removeAttribute('src')
            videoEl.load()
          })
        })
        .catch(fail)
    })
  })
}