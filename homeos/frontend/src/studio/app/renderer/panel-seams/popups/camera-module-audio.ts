/**
 * 组合弹窗摄像头模块的声音开关（0.8.7）。
 *
 * 抽成模块而不是留在 `custom-popup.ts` 里内联：那个文件已经贴着 2,100 行的体量基线，
 * 而且这段逻辑与「普通弹窗」「3D 附加面板」是同一套生命周期
 * （视频就绪 → 建控制器 → 挂按钮 → 就绪/不可用同步 → 清理随弹窗销毁）。
 *
 * 组合弹窗的宿主机位与普通弹窗不同：标题行里已经有标题和状态标签，
 * 声音按钮直接并进去，不额外占一行。
 */
import { createCameraAudio, mountCameraAudioButton, type CameraAudioHandle } from '@app/shared/camera/camera-audio'

export interface PopupCameraAudioOptions {
  /** 视频挂载容器：用来判断弹窗是否还活着。 */
  stage: HTMLElement
  /** 声音按钮的宿主（模块标题行）。 */
  heading: HTMLElement
  /** 状态文案元素：开启失败时给出中文提示。 */
  status: HTMLElement
  /** 弹窗级清理回调收集器。 */
  cleanups: Array<() => void>
}

export interface PopupCameraAudioHandlers {
  onVideoReady: (video: HTMLVideoElement) => void
  onAudioAvailability: (supported: boolean, hasAudio: boolean | null) => void
  setReady: (ready: boolean) => void
}

export function createPopupCameraAudioHandlers({
  stage,
  heading,
  status,
  cleanups,
}: PopupCameraAudioOptions): PopupCameraAudioHandlers {
  let audio: CameraAudioHandle | null = null
  return {
    onVideoReady: (video) => {
      audio = createCameraAudio({
        video,
        isCurrent: () => stage.isConnected,
        onError: () => {
          if (stage.isConnected) status.textContent = '声音开启失败'
        },
      })
      mountCameraAudioButton({
        host: heading,
        audio,
        cleanup: (cleanup: () => void) => cleanups.push(cleanup),
      })
    },
    onAudioAvailability: (supported, hasAudio) => audio?.setMedia(supported, hasAudio),
    setReady: (ready) => audio?.setReady(ready),
  }
}
