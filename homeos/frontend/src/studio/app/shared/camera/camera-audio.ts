/**
 * 摄像头音频（0.8.7）：弹窗**默认静音**，视频流确实带音轨时才允许手动开启。
 *
 * 为什么必须默认静音：浏览器只允许「用户手势之后」的自动播放带声音，弹窗是在状态推送里
 * 被创建的，抢在用户手势之外把 `muted` 改成 `false` 会被直接拒绝（表现为画面卡住）。
 *
 * 为什么要有「单一 owner」：普通弹窗 / 3D 弹窗 / 组合弹窗各挂一个 `<video>`，同一路
 * 摄像头在多个弹窗里同时出声会叠成回音。跨 iframe 用一个挂在顶层 window 上的 Symbol
 * 记录当前 owner，任一时刻只有一路出声。
 */
import { createUiIcon } from '../ui'

const AUDIO_OWNER_KEY = Symbol.for('homeos.camera-audio-owner')
/** 「有声」/「静音」两枚图标的 MDI 名（`createUiIcon` 会解析成遮罩）。 */
const AUDIO_ICON_ON_NAME = 'volume-high'
const AUDIO_ICON_OFF_NAME = 'volume-off'
const AUDIO_LABEL_ON = '关闭摄像头声音'
const AUDIO_LABEL_OFF = '开启摄像头声音'
const AUDIO_FAILED_TEXT = '声音未能开启，请再次点击。'

export type CameraAudioState = {
  /** 当前媒体是否支持音频（浏览器能力，不是本路流）。 */
  supported: boolean
  /** 视频元素已就绪（可以尝试播放）。 */
  ready: boolean
  /** 当前视频是否有音轨：`null` 表示尚未探测到。 */
  hasAudio: boolean | null
  /** 用户是否已请求开启声音。 */
  requested: boolean
  /** 正在等待播放结果。 */
  pending: boolean
  /** 失败原因（中文），成功或未尝试时为空串。 */
  error: string
  muted: boolean
  available: boolean
  canToggle: boolean
  waiting: boolean
}

type Owner = { mute: () => void }
type AudioChannel = { owner: Owner | null }

/** 一个控制器实例的全部可变状态（模块级函数都作用在它上面，避免巨型闭包）。 */
type AudioModel = {
  video: HTMLVideoElement
  channel: AudioChannel
  isCurrent: () => boolean
  onError: (error: unknown) => void
  view: (Window & typeof globalThis) | undefined
  disposed: boolean
  supported: boolean
  ready: boolean
  hasAudio: boolean | null
  requested: boolean
  pending: boolean
  error: string
  attempt: number
  listeners: Set<(state: CameraAudioState) => void>
  owner: Owner
}

type MaybeTopWindow = Window & { parent: unknown; location?: Location }

function topWindow(): MaybeTopWindow {
  const start = (globalThis.window || globalThis) as unknown as MaybeTopWindow
  let target = start
  try {
    let parentWindow = target.parent as MaybeTopWindow | null
    while (
      parentWindow &&
      parentWindow !== (target as unknown) &&
      parentWindow.location?.origin === target.location?.origin
    ) {
      target = parentWindow
      parentWindow = target.parent as MaybeTopWindow | null
    }
  } catch {
    // 跨源父窗口：parent.location 不可访问是预期，保持当前窗口即可。
  }
  return target
}

function audioChannel(): AudioChannel {
  const target = topWindow() as unknown as Record<symbol, AudioChannel | undefined>
  return target[AUDIO_OWNER_KEY] || (target[AUDIO_OWNER_KEY] = { owner: null })
}

function report(value: unknown): void {
  const reporter = (globalThis as { reportError?: (error: unknown) => void }).reportError
  if (typeof reporter === 'function') reporter(value)
  else console.error('[HomeOS camera audio]', value)
}

function snapshot(model: AudioModel): CameraAudioState {
  const { video } = model
  const available = model.supported && model.hasAudio !== false
  return {
    supported: model.supported,
    ready: model.ready,
    hasAudio: model.hasAudio,
    requested: model.requested,
    pending: model.pending,
    error: model.error,
    muted: video.muted,
    available,
    // 「可以开」= 有音轨且画面已就绪；还没探测出来时先允许尝试（用户点了才知道行不行）。
    canToggle:
      !model.disposed &&
      model.isCurrent() &&
      (model.requested || (model.supported && model.hasAudio !== false && model.ready)),
    waiting: model.requested && !model.ready,
  }
}

function notify(model: AudioModel): void {
  const state = snapshot(model)
  for (const listener of model.listeners) {
    try {
      listener(state)
    } catch (listenerError) {
      report(listenerError)
    }
  }
}

function releaseOwner(model: AudioModel): void {
  if (model.channel.owner === model.owner) model.channel.owner = null
}

function mute(model: AudioModel): void {
  model.attempt += 1
  model.requested = false
  model.pending = false
  model.error = ''
  model.video.muted = true
  releaseOwner(model)
  notify(model)
}

function fail(model: AudioModel, cause: unknown): void {
  if (model.disposed || !model.isCurrent()) return
  model.requested = false
  model.pending = false
  model.video.muted = true
  releaseOwner(model)
  model.error = AUDIO_FAILED_TEXT
  notify(model)
  try {
    model.onError(cause)
  } catch (errorHandlerFailure) {
    report(errorHandlerFailure)
  }
  // 播放被拒后元素可能停在 paused：补一次静音播放，保证画面继续。
  try {
    model.video.play()?.catch(() => {})
  } catch {
    /* 忽略：画面本身已经由传输层负责 */
  }
}

function settle(model: AudioModel, attempt: number, cause?: unknown): void {
  if (model.disposed || attempt !== model.attempt || !model.isCurrent()) return
  if (cause !== undefined) {
    fail(model, cause)
    return
  }
  if (model.video.muted || model.video.paused) {
    fail(model, new Error('Audio playback was not started'))
    return
  }
  model.pending = false
  notify(model)
}

function start(model: AudioModel): void {
  const attempt = ++model.attempt
  model.pending = true
  model.error = ''
  const previousOwner = model.channel.owner
  model.channel.owner = model.owner
  previousOwner?.mute()
  model.video.muted = false
  if (model.video.volume === 0) model.video.volume = 1
  notify(model)
  const onSettled = (cause?: unknown) => settle(model, attempt, cause)
  try {
    Promise.resolve(model.video.play()).then(() => onSettled(), onSettled)
  } catch (playError) {
    onSettled(playError)
  }
}

function onVolumeChange(model: AudioModel): void {
  if (model.disposed) return
  // 用户用系统音量键 / 原生控件静音时同步状态，别让按钮显示「已开启」而实际无声。
  if (model.requested && model.ready && !model.pending && (model.video.muted || model.video.volume === 0)) {
    mute(model)
    return
  }
  notify(model)
}

export type CameraAudioHandle = {
  readonly state: CameraAudioState
  subscribe(listener: (state: CameraAudioState) => void): () => void
  /** 传输层探测到音轨信息后调用；`hasAudio` 为准，`supported` 是浏览器能力。 */
  setMedia(supported: boolean, hasAudio?: boolean | null): void
  /** 视频开始播放 / 停止时调用。 */
  setReady(ready: boolean): void
  toggle(): void
  reset(): void
  dispose(): void
}

function createHandle(model: AudioModel): CameraAudioHandle {
  const { video } = model
  const handleVolumeChange = () => onVolumeChange(model)
  const handlePageHide = () => mute(model)
  video.addEventListener('volumechange', handleVolumeChange)
  // 页面进 bfcache / 切后台时静音：回来时由用户重新点，避免在后台偷偷出声。
  model.view?.addEventListener?.('pagehide', handlePageHide)

  return {
    get state() {
      return snapshot(model)
    },
    subscribe(listener) {
      if (model.disposed) {
        listener(snapshot(model))
        return () => {}
      }
      model.listeners.add(listener)
      listener(snapshot(model))
      return () => model.listeners.delete(listener)
    },
    setMedia(supported, hasAudio = null) {
      if (model.disposed) return
      model.supported = supported
      if (hasAudio !== null) model.hasAudio = hasAudio
      if (!supported || model.hasAudio === false) {
        model.ready = false
        mute(model)
        return
      }
      notify(model)
    },
    setReady(ready) {
      if (model.disposed || model.ready === ready) return
      model.ready = ready
      model.attempt += 1
      model.pending = false
      if (!ready) {
        video.muted = true
        notify(model)
        return
      }
      if (model.requested && model.supported && model.hasAudio !== false) start(model)
      else notify(model)
    },
    toggle() {
      if (!snapshot(model).canToggle) return
      if (model.requested && (!model.ready || !video.muted)) {
        mute(model)
        return
      }
      model.requested = true
      start(model)
    },
    reset() {
      if (model.disposed) return
      model.supported = false
      model.ready = false
      model.hasAudio = null
      mute(model)
    },
    dispose() {
      if (model.disposed) return
      model.disposed = true
      model.supported = false
      model.ready = false
      mute(model)
      model.listeners.clear()
      video.removeEventListener('volumechange', handleVolumeChange)
      model.view?.removeEventListener?.('pagehide', handlePageHide)
    },
  }
}

/**
 * 绑定到一个 `<video>` 的音频控制器。
 *
 * @param video 目标视频元素（必须已 `muted = true`；本模块负责改动）
 * @param isCurrent 外部生命周期判断：调用前确认弹窗仍打开，避免关闭后还在 play
 */
export function createCameraAudio({
  video,
  isCurrent = () => true,
  channel = audioChannel(),
  onError = () => {},
}: {
  video: HTMLVideoElement
  isCurrent?: () => boolean
  channel?: AudioChannel
  onError?: (error: unknown) => void
}): CameraAudioHandle {
  video.muted = true
  const model: AudioModel = {
    video,
    channel,
    isCurrent,
    onError,
    view: video.ownerDocument?.defaultView ?? undefined,
    disposed: false,
    supported: false,
    ready: false,
    hasAudio: null,
    requested: false,
    pending: false,
    error: '',
    attempt: 0,
    listeners: new Set(),
    owner: { mute: () => mute(model) },
  }
  return createHandle(model)
}

/** 按钮三处可变文本/图标的引用（拆出来以后渲染函数只有一个入参）。 */
type AudioButtonRefs = {
  button: HTMLButtonElement
  wrapper: HTMLElement
  onIcon: HTMLElement
  offIcon: HTMLElement
  feedback: HTMLElement
  documentNode: Document
}

function audioButtonLabel(state: CameraAudioState): string {
  if (!state.available) return state.hasAudio === false ? '当前视频未提供声音' : '当前画面不支持声音'
  if (!state.ready && !state.requested) return '画面就绪后可开启声音'
  return state.requested ? AUDIO_LABEL_ON : AUDIO_LABEL_OFF
}

/** 供 CSS 选状态的单一取值：颜色/动效都挂在 `data-audio-state` 上，不猜 `aria-*` 组合。 */
function audioButtonPhase(state: CameraAudioState): 'on' | 'off' | 'pending' | 'waiting' | 'unavailable' {
  // 音轨探测结果还没回来（`supported=false`）时不算「不支持」，先按等待处理，
  // 否则按钮一出现就是灰的，看起来像坏了。
  if (state.hasAudio === false) return 'unavailable'
  if (!state.supported) return state.ready ? 'unavailable' : 'waiting'
  if (state.pending || state.waiting) return 'pending'
  if (state.requested) return 'on'
  return state.ready ? 'off' : 'waiting'
}

function applyAudioButtonState(refs: AudioButtonRefs, state: CameraAudioState): void {
  const { button, wrapper, onIcon, offIcon, feedback, documentNode } = refs
  // 按钮被禁用时把焦点还给弹窗，否则键盘用户会「卡在一个按不动的按钮上」。
  if (!state.canToggle && !button.disabled && documentNode.activeElement === button) {
    const dialog = button.closest('dialog')
    if (dialog?.open && dialog.isConnected) dialog.focus({ preventScroll: true })
  }
  const label = audioButtonLabel(state)
  button.disabled = !state.canToggle
  button.dataset.audioState = audioButtonPhase(state)
  button.setAttribute('aria-pressed', String(state.requested))
  button.setAttribute('aria-busy', String(state.pending || state.waiting))
  button.setAttribute('aria-label', label)
  button.title = state.error || label
  wrapper.title = button.title
  // 两枚图标各自固定含义（有声 / 静音），只切换显示，不再互换 class —— 互换会让
  // `.is-on` 既表示「开」又表示「这个图标是关」，调试时极难读。
  onIcon.hidden = state.requested
  offIcon.hidden = !state.requested
  feedback.textContent = state.error
  feedback.hidden = !state.error
}

/**
 * 在弹窗上挂一个声音开关按钮。
 *
 * 位置由调用方给（`host`），样式类固定在 `renderer.css`（0.8.7 声音开关段）：
 * `.hb-camera-audio-control` / `.hb-camera-audio-toggle` / `.hb-camera-audio-icon` /
 * `.hb-camera-audio-feedback`；状态由按钮上的 `data-audio-state` 驱动。
 */
export function mountCameraAudioButton({
  host,
  audio,
  cleanup,
}: {
  host: HTMLElement
  audio: CameraAudioHandle
  cleanup: (register: () => void) => void
}): HTMLButtonElement {
  const documentNode = host.ownerDocument
  const wrapper = documentNode.createElement('span')
  wrapper.className = 'hb-camera-audio-control'
  const button = documentNode.createElement('button')
  button.type = 'button'
  button.className = 'hb-camera-audio-toggle'
  // 图标走统一 MDI 遮罩（0.8.6 的 `.hb-ui-icon`）：不再用「带 class 名的空 span」，
  // 否则一旦 CSS 缺一条规则，按钮里就会露出裸文本（`is-on` / `is-off`）。
  const onIcon = createUiIcon(documentNode, AUDIO_ICON_ON_NAME)
  onIcon.classList.add('hb-camera-audio-icon', 'is-on')
  const offIcon = createUiIcon(documentNode, AUDIO_ICON_OFF_NAME)
  offIcon.classList.add('hb-camera-audio-icon', 'is-off')
  button.append(onIcon, offIcon)
  const feedback = documentNode.createElement('span')
  feedback.className = 'hb-camera-audio-feedback'
  feedback.setAttribute('role', 'status')
  feedback.setAttribute('aria-live', 'polite')
  wrapper.append(button, feedback)
  host.append(wrapper)
  host.classList.add('has-camera-audio')

  const refs: AudioButtonRefs = { button, wrapper, onIcon, offIcon, feedback, documentNode }
  const unsubscribe = audio.subscribe((state) => applyAudioButtonState(refs, state))
  const onClick = (event: Event) => {
    event.stopPropagation()
    audio.toggle()
  }
  button.addEventListener('click', onClick)

  cleanup(() => {
    unsubscribe()
    button.removeEventListener('click', onClick)
    wrapper.remove()
    host.classList.remove('has-camera-audio')
  })
  return button
}
