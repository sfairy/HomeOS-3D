/**
 * 组合弹窗里的摄像头模块（0.8.7 起含声音开关）。
 *
 * 从 `custom-popup.ts` 抽出：那个文件贴着 2,100 行体量基线，而这段是**自成一体的子树**
 * （舞台 + 遮罩 + 占位提示 + 媒体挂载 + 状态/就绪切换），只依赖调用方给的几个句柄。
 * 抽出来之后主文件只留一行「建舞台 → append」。
 */
import { mountCameraMedia } from '@app/renderer/registry/camera-media'
import { domElement } from '@app/shared/util/dom-factory'
import { createPopupCameraAudioHandlers } from './camera-module-audio'

export interface PopupCameraStageOptions {
  /** 是否处于「预览模式」：此时不请求实时流，只显示提示。 */
  preview: boolean
  entityId: string
  /** HA 设备档案（`cameraSource` / `go2rtcUrl` 从这里取）。 */
  profile: { properties?: Record<string, unknown> }
  title: HTMLElement
  status: HTMLElement
  /** 声音按钮宿主（模块标题行）。 */
  heading: HTMLElement
  /** 设备示意图：就绪/不可用时同步它的状态类。 */
  visual: HTMLElement
  cleanups: Array<() => void>
  projectId: string
  componentId: string
}

/** 构建摄像头舞台并挂载媒体；返回舞台元素，由调用方 append 到模块容器。 */
export function createPopupCameraStage(options: PopupCameraStageOptions): HTMLElement {
  const { status, preview } = options
  const stage = document.createElement('div')
  stage.className = 'hb-custom-popup-camera-stage is-connecting'
  status.textContent = preview ? '预览模式' : '正在连接'
  status.classList.add('is-connecting')
  stage.append(domElement(document, 'i', 'hb-camera-preview-reveal-veil'))
  const scanLine = document.createElement('i')
  scanLine.className = 'hb-camera-preview-scan-line'
  stage.append(scanLine)

  const placeholder = document.createElement('span')
  placeholder.textContent = preview ? '预览模式不获取实时画面' : '正在载入摄像头实时预览'
  stage.append(placeholder)
  if (preview) {
    status.classList.remove('is-connecting')
    stage.classList.remove('is-connecting')
    stage.classList.add('is-ready')
    return stage
  }

  const audio = createPopupCameraAudioHandlers({
    stage,
    heading: options.heading,
    status,
    cleanups: options.cleanups,
  })
  mountCameraMedia({
    container: stage,
    entityId: options.entityId,
    label: options.title.textContent,
    objectFit: 'fill',
    placeholder,
    // 弹窗模块按 HA 设备档案（实体）驱动，默认走 HLS；只有显式配了 go2rtc 才透传地址。
    go2rtcUrl:
      options.profile.properties?.cameraSource === 'go2rtc' ? String(options.profile.properties?.go2rtcUrl || '') : '',
    projectId: options.projectId,
    componentId: options.componentId,
    onVideoReady: audio.onVideoReady,
    onAudioAvailability: audio.onAudioAvailability,
    ...readyHandlers(options, stage, audio.setReady),
    cleanup: (cleanup: () => void) => options.cleanups.push(cleanup),
  })
  return stage
}

/** 重连 / 就绪 / 不可用：同步状态文案、舞台类与设备示意图类。 */
function readyHandlers(
  options: PopupCameraStageOptions,
  stage: HTMLElement,
  setAudioReady: (ready: boolean) => void,
): Record<string, unknown> {
  const { status, visual } = options
  return {
    onStateChange: (state: string) => {
      if (state === 'reconnecting') status.textContent = '正在重连'
      else if (state === 'suspended') status.textContent = '后台已暂停'
    },
    onReady: () => {
      setAudioReady(true)
      status.textContent = '实时画面'
      status.classList.remove('is-connecting', 'is-unavailable')
      status.classList.add('is-live')
      visual.classList.remove('is-unavailable')
      visual.classList.add('is-live')
      stage.classList.remove('is-connecting', 'is-unavailable', 'is-revealing')
      stage.classList.add('is-ready')
    },
    onUnavailable: () => {
      setAudioReady(false)
      status.textContent = '画面不可用'
      status.classList.remove('is-connecting', 'is-live')
      status.classList.add('is-unavailable')
      visual.classList.remove('is-live')
      visual.classList.add('is-unavailable')
      stage.classList.remove('is-connecting', 'is-revealing')
      stage.classList.add('is-unavailable')
    },
  }
}
