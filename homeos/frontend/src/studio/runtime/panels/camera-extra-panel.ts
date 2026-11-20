/**
 * 摄像头附加面板：开关按钮 + 可见时才挂载实时流/快照。
 *
 * 实时流由 `@app/renderer/registry/camera-media` 统一处理（go2rtc / HLS / 快照回退）；
 * 面板只负责决定"该不该播"：编辑态、实体关闭、滚动出视口都主动卸载。
 * 媒体模块属于面板渲染器，按需加载（runtime 不静态依赖 renderer）。
 */
import { attributesOf, extraContextChanged, featureFlags } from '../device/entity-capabilities'
import { attachFeedback, createVisibilityGate } from './panel-utils'
import type { ExtraPanelViewModel, FeedbackSlot } from './panel-utils'
import { createCameraAudio, mountCameraAudioButton, type CameraAudioHandle } from '@app/shared/camera/camera-audio'

/** 摄像头能力位：1=支持开关；2=支持实时流。 */
const CAMERA_TURN_ON = 0x1
const CAMERA_STREAM = 0x2

type CameraExtraPanelOptions = {
  element: any
  feedbackSlot?: FeedbackSlot
  onControl?: (command: any) => Promise<any>
  loadMedia?: () => Promise<any>
}

function cameraPowerState(state: any) {
  const attributes = attributesOf(state)
  if (typeof attributes.is_on == 'boolean') return attributes.is_on
  if (state?.state === 'off') return true
  if (state?.state === 'on') return false
  return null
}

export function createCameraExtraPanel(
  {
    element: hostElement,
    feedbackSlot,
    onControl = async () => {},
    loadMedia = () => import('@app/renderer/registry/camera-media'),
  }: CameraExtraPanelOptions = {} as any,
) {
  const ownerDocument = hostElement.ownerDocument || globalThis.document
  const actionsElement = ownerDocument.createElement('div')
  const placeholderElement = ownerDocument.createElement('p')
  const errorElement = ownerDocument.createElement('p')
  const frameElement = ownerDocument.createElement('div')

  frameElement.className = 'i3d-extra-camera-frame'
  placeholderElement.className = 'i3d-extra-camera-placeholder'
  placeholderElement.setAttribute('role', 'status')
  frameElement.append(placeholderElement)
  actionsElement.className = 'i3d-extra-actions i3d-extra-camera-actions'
  errorElement.className = 'i3d-climate-error'
  errorElement.setAttribute('role', 'status')
  // 声音开关挂在画面下方的工具条里：与画面同一视觉组，不挤占开关按钮区。
  const toolbarElement = ownerDocument.createElement('div')
  toolbarElement.className = 'i3d-extra-camera-toolbar'
  hostElement.replaceChildren(actionsElement, frameElement, toolbarElement, errorElement)

  let viewModel: ExtraPanelViewModel | null = null
  let pending = false
  let generation = 0
  let mountedSignature = ''
  let cleanupCallbacks: Array<() => void> = []
  let disposed = false
  /** 当前挂载的摄像头音频控制器（0.8.7：弹窗默认静音，可手动开启）。 */
  let cameraAudio: CameraAudioHandle | null = null

  const powerButtons = (
    [
      ['turn_on', '开启摄像头'],
      ['turn_off', '关闭摄像头'],
    ] as const
  ).map(([service, label]) => {
    const button = ownerDocument.createElement('button')
    button.type = 'button'
    button.className = 'i3d-climate-choice'
    button.textContent = label
    actionsElement.append(button)
    button.addEventListener('click', async () => {
      if (!viewModel || button.disabled || pending) return
      const requestGeneration = generation
      pending = true
      errorElement.textContent = ''
      refresh()
      try {
        await onControl({
          entityId: viewModel.item.entityId,
          domain: 'camera',
          service,
          data: {},
        })
      } catch (error: any) {
        if (!disposed && requestGeneration === generation) {
          errorElement.textContent = error.message || '摄像头开关失败'
        }
      } finally {
        if (!disposed && requestGeneration === generation) {
          pending = false
          refresh()
        }
      }
    })
    return button
  })

  function unmountMedia() {
    generation++
    mountedSignature = ''
    for (const cleanup of cleanupCallbacks.splice(0)) cleanup()
    cameraAudio?.dispose()
    cameraAudio = null
    frameElement.classList.remove?.('is-ready', 'is-connecting', 'is-unavailable', 'is-suspended')
    frameElement.setAttribute('aria-busy', 'false')
    frameElement.dataset.cameraState = 'suspended'
    delete frameElement.dataset.cameraTransport
    frameElement.replaceChildren(placeholderElement)
    placeholderElement.hidden = false
  }

  /** 挂载实时流 / 快照，并顺带绑定声音开关（视频元素建好后才有音轨可探测）。 */
  async function mountMedia(item: ExtraPanelViewModel['item'], streamEnabled: boolean, requestGeneration: number) {
    const stillCurrent = () => !disposed && requestGeneration === generation && gate.visible()
    const shared = {
      container: frameElement,
      entityId: item.entityId,
      label: item.label || item.entityId,
      objectFit: 'contain' as const,
      placeholder: placeholderElement,
      cleanup: (cleanup: () => void) => cleanupCallbacks.push(cleanup),
      onVideoReady: (video: HTMLVideoElement) => {
        if (stillCurrent()) attachCameraAudio(video, requestGeneration)
      },
      onAudioAvailability: (supported: boolean, hasAudio: boolean | null) => {
        cameraAudio?.setMedia(supported, hasAudio)
      },
    }
    try {
      const media = await loadMedia()
      if (!stillCurrent() || viewModel?.editing) return
      if (!streamEnabled) {
        media.mountCameraSnapshot({ ...shared, refreshInterval: 10 })
        return
      }
      media.mountCameraMedia({
        ...shared,
        onReady: () => cameraAudio?.setReady(true),
        onUnavailable: () => cameraAudio?.setReady(false),
      })
    } catch {
      if (!stillCurrent()) return
      frameElement.dataset.cameraState = 'load-failed'
      placeholderElement.hidden = false
      placeholderElement.textContent = '摄像头画面暂时无法加载，请重新打开弹窗'
    }
  }

  function attachCameraAudio(video: HTMLVideoElement, requestGeneration: number) {
    cameraAudio = createCameraAudio({
      video,
      isCurrent: () => !disposed && requestGeneration === generation && gate.visible(),
      onError: () => {
        if (!disposed && requestGeneration === generation) {
          errorElement.textContent = '摄像头声音未能开启，请再次点击声音按钮。'
        }
      },
    })
    mountCameraAudioButton({
      host: toolbarElement,
      audio: cameraAudio,
      cleanup: (cleanup: () => void) => cleanupCallbacks.push(cleanup),
    })
  }

  async function refresh() {
    if (disposed || !viewModel) return
    const { item, state, editing } = viewModel
    const available =
      !!state &&
      state.available !== false &&
      typeof state.state == 'string' &&
      !['', 'unknown', 'unavailable'].includes(state.state)
    const cameraOff = cameraPowerState(state) === false
    const flags = featureFlags(attributesOf(state))
    actionsElement.hidden = !(flags & CAMERA_TURN_ON)

    const disabled = editing || pending || !available || item.modelAvailable === false || actionsElement.hidden
    powerButtons[0].disabled = disabled || cameraPowerState(state) === true
    powerButtons[1].disabled = disabled || cameraOff

    const streamEnabled = !!(flags & CAMERA_STREAM)
    const signature = JSON.stringify([item.entityId, streamEnabled])
    frameElement.setAttribute('aria-label', item.label || item.entityId)

    if (editing || !available || cameraOff || !gate.visible() || item.modelAvailable === false) {
      if (mountedSignature) unmountMedia()
      frameElement.dataset.cameraState = editing
        ? 'preview'
        : available
          ? cameraOff
            ? 'off'
            : 'suspended'
          : 'unavailable'
      placeholderElement.hidden = false
      placeholderElement.textContent = editing
        ? '摄像头画面预览'
        : available
          ? cameraOff
            ? '摄像头已关闭'
            : '画面在可见时加载'
          : '摄像头不可用'
      return
    }

    if (mountedSignature === signature || frameElement.dataset.cameraState === 'connecting') return
    unmountMedia()
    mountedSignature = signature
    placeholderElement.textContent = '正在加载摄像头画面'
    await mountMedia(item, streamEnabled, generation)
  }

  const releaseFeedback = attachFeedback(feedbackSlot, errorElement, {
    source: () => viewModel?.item?.entityId,
    label: () => viewModel?.item?.label,
  })
  const gate = createVisibilityGate(frameElement, () => void refresh())

  return {
    root: hostElement,
    update(nextViewModel: ExtraPanelViewModel) {
      if (disposed) return
      if (extraContextChanged(viewModel, nextViewModel)) {
        generation++
        pending = false
        errorElement.textContent = ''
      }
      viewModel = nextViewModel
      void refresh()
    },
    dispose() {
      if (disposed) return
      disposed = true
      releaseFeedback()
      generation++
      gate.dispose()
      unmountMedia()
      viewModel = null
      hostElement.replaceChildren()
    },
  }
}
