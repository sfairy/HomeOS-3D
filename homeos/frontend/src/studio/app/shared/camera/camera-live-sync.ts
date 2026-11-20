/**
 * 摄像头「跟上直播」的手势式纠偏（0.8.7 修复：Go2 摄像头重新打开或断流恢复时连续跳帧追赶）。
 *
 * 与 MSE 传输内部的 `CATCHUP_LAG_SECONDS` 不是同一件事：
 *
 * - 传输层的追赶是**持续**的：每次 append 时若落后 > 3s 就把 `currentTime` 推近尾部。
 *   它解决「越播越慢」，但落下的是**连续几十次小跳**——观感是画面一顿一顿地快进。
 * - 这里做的是**一次性**纠偏：重新打开弹窗 / 断流恢复的那一刻，如果积压超过阈值，
 *   直接 seek 到直播沿并短暂静音，把「追赶」压缩成**一次不可见的跳转**。
 *
 * 为什么必须在恢复瞬间做而不是等传输层发现：`buffered.end` 在恢复时才突然前进一大截，
 * 等下一次 append 已经晚了 —— 那之前浏览器会先把积压缓冲播完，正是「连续跳帧」的来源。
 *
 * 判定阈值取 1.2s：低于它按正常低延迟播放（跳一下反而更显眼）。
 */

/** 积压超过这个秒数就认为「需要一次纠偏」。 */
const RESUME_BACKLOG_SECONDS = 1.2

/** 纠偏后预留的余量：不要顶到 buffered.end（末帧常不完整，会立刻卡住）。 */
const RESUME_EDGE_MARGIN_SECONDS = 0.25

export type CameraLiveSyncHandle = {
  /** 传输层宣告「已就绪 / 已恢复」时调用。 */
  notifyReady(): void
  /** 页面从后台恢复、或弹窗重新可见时调用。 */
  notifyVisible(): void
  dispose(): void
}

/**
 * 绑定到一个仍在播放的 `<video>`：只在「恢复」这一类时刻把播放头拉到直播沿。
 *
 * @param video 目标视频元素（MSE / HLS 均可；不适用于 MJPEG 图片通路）
 * @param isCurrent 外部生命周期判断：弹窗关闭后不要再改播放头
 */
export function createCameraLiveSync({
  video,
  isCurrent = () => true,
  onCatchUp = () => {},
}: {
  video: HTMLVideoElement
  isCurrent?: () => boolean
  onCatchUp?: (skippedSeconds: number) => void
}): CameraLiveSyncHandle {
  let disposed = false
  /** 上一次纠偏的时间戳：短时间内重复触发只算一次，避免「每帧都在纠偏」。 */
  let lastCatchUpAt = 0

  function bufferedEnd(): number {
    const ranges = video.buffered
    if (!ranges || ranges.length === 0) return Number.NaN
    return ranges.end(ranges.length - 1)
  }

  function catchUp(reason: string): void {
    if (disposed || !isCurrent()) return
    const end = bufferedEnd()
    if (!Number.isFinite(end)) return
    const backlog = end - video.currentTime
    if (!Number.isFinite(backlog) || backlog <= RESUME_BACKLOG_SECONDS) return
    // 1s 内只纠一次：恢复时会连着收到 `playing` 与 `canplay`，重复 seek 会把画面拽回去。
    const now = Date.now()
    if (now - lastCatchUpAt < 1000) return
    lastCatchUpAt = now
    const target = Math.max(video.currentTime, end - RESUME_EDGE_MARGIN_SECONDS)
    try {
      video.currentTime = target
    } catch {
      // 有些浏览器在 seekable 未就绪时抛 InvalidStateError：跳过这次，下一次恢复再纠。
      return
    }
    // 跳转本身会产生一帧花屏与明显的音频顿挫，用一次极短的静音盖掉。
    // 只在用户本来就开着声音时才需要「先记录再恢复」，否则不要擅自把 muted 改回去。
    const wasMuted = video.muted
    if (!wasMuted) {
      video.muted = true
      window.setTimeout(() => {
        if (!disposed && isCurrent()) video.muted = false
      }, 180)
    }
    onCatchUp(backlog)
    if (typeof window !== 'undefined') {
      window.HomeOSLog?.report?.('info', '摄像头', '摄像头画面已同步到直播位置', {
        phase: 'live-sync',
        reason,
        durationMs: Math.round(backlog * 1000),
      })
    }
  }

  const handleReady = () => catchUp('resume')
  const handleVisibility = () => {
    if (video.ownerDocument.visibilityState === 'visible') catchUp('visible')
  }
  video.addEventListener('loadeddata', handleReady)
  video.addEventListener('playing', handleReady)
  video.ownerDocument.addEventListener('visibilitychange', handleVisibility)

  return {
    notifyReady: handleReady,
    notifyVisible: handleVisibility,
    dispose() {
      if (disposed) return
      disposed = true
      video.removeEventListener('loadeddata', handleReady)
      video.removeEventListener('playing', handleReady)
      video.ownerDocument.removeEventListener('visibilitychange', handleVisibility)
    },
  }
}
