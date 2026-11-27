import { createUiIcon } from './ui'

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

/**
 * 摄像头播放失败归因（0.8.7）。
 *
 * 现状：失败时只报一句「摄像头播放失败」，用户和维修者都不知道是**授权**、**网络**、
 * **编码**还是**地址过期**。四类原因的处置动作完全不同 —— 换编码要改 HA 出流，
 * 授权要重新配对，地址过期重连就好 —— 混在一句话里只能靠猜。
 *
 * 判定顺序（越具体越前，命中即返回）：
 *
 * 1. 授权：401 / 403 / `LICENSE_RESTRICTED` —— 重连网络不会有任何帮助；
 * 2. 地址失效：404 / 410 / HLS `manifestLoadError` —— 换票重试有效；
 * 3. 编码：`bufferAddCodecError` / `MEDIA_ERR_SRC_NOT_SUPPORTED` —— 换浏览器没用；
 * 4. 网络：0 / 5xx / `manifestLoadTimeOut` —— 通常是链路或上游服务的问题；
 * 5. 兜底：保留原始分类。
 *
 * 返回值只用于**展示与日志**，不改传输层分支：降级/重试仍由 `camera-media` 决定。
 */

export type CameraDiagnosticInput = {
  /** 失败发生的阶段：`hls-setup` / `hls-playback` / `go2rtc` / `snapshot`。 */
  phase?: string
  /** HLS 或播放器给的分类（`networkError` / `mediaError` / `manifestLoadError` …）。 */
  type?: string
  /** HLS 的细节串（`manifestLoadTimeOut` / `bufferAddCodecError` …）。 */
  details?: string
  /** HTTP 状态码；浏览器未提供时是 0。 */
  status?: number
  /** `video.error.code`（MediaError）。 */
  mediaErrorCode?: number
  /** 原始错误消息（仅兜底展示，可能很长，会被截断）。 */
  reason?: string
}

export type CameraDiagnostic = {
  /** 稳定分类，用于日志聚合与去重。 */
  code: string
  /** 一句话中文原因（直接展示给用户）。 */
  reason: string
  /** 排查建议（面板的 title 与日志的 `hint` 都是它）。 */
  hint: string
}

const MEDIA_ERR_ABORTED = 1
const MEDIA_ERR_NETWORK = 2
const MEDIA_ERR_DECODE = 3
const MEDIA_ERR_SRC_NOT_SUPPORTED = 4

function lower(value: unknown): string {
  return String(value ?? '').toLowerCase()
}

/** HLS 的 `details` 里出现这些片段 = 编码/解码问题，换网络没用。 */
function looksLikeCodecProblem(input: CameraDiagnosticInput): boolean {
  const details = lower(input.details)
  return (
    details.includes('codecerror') ||
    details.includes('bufaddcodecerror') ||
    details.includes('bufferaddcodecerror') ||
    details.includes('manifestparsingerror') ||
    input.mediaErrorCode === MEDIA_ERR_DECODE ||
    input.mediaErrorCode === MEDIA_ERR_SRC_NOT_SUPPORTED
  )
}

/** 清单格式无法解析（HLS `manifestParsingError`）：不是网络问题，重连无用。 */
function looksLikeManifestParseFailure(input: CameraDiagnosticInput): boolean {
  return lower(input.details).includes('manifestparsingerror')
}

function looksLikeAddressExpired(input: CameraDiagnosticInput): boolean {
  const status = Number(input.status || 0)
  if (status === 404 || status === 410) return true
  return lower(input.details).includes('manifestloaderror') && status >= 400
}

function looksLikeAuthProblem(input: CameraDiagnosticInput): boolean {
  const status = Number(input.status || 0)
  // 401/403 也可能来自反向代理的访问限制，两种都归到「权限」，处置都是看授权/配对。
  return status === 401 || status === 403
}

/** 授权限制：后端明确说明「授权状态不允许」（`LICENSE_RESTRICTED`），与配对/网络无关。 */
function looksLikeLicenseRestriction(input: CameraDiagnosticInput): boolean {
  const text = lower(input.reason) + ' ' + lower(input.details) + ' ' + lower(input.type)
  return text.includes('license_restricted') || text.includes('license-restricted') || text.includes('授权状态不允许')
}

function looksLikeNetworkProblem(input: CameraDiagnosticInput): boolean {
  const status = Number(input.status || 0)
  // `status === 0` 单独**不算**网络问题：它是「浏览器没给出 HTTP 结果」的默认值，
  // 调用方没传状态时也是 0。把它当网络会让「中止 / 播放器未就绪」全被误分类。
  if (status >= 500) return true
  const details = lower(input.details)
  return (
    details.includes('timeout') ||
    details.includes('networkerror') ||
    details.includes('manifestloaderror') ||
    lower(input.type) === 'networkerror'
  )
}

/** 浏览器自动播放策略拦截：`NotAllowedError`。与网络/编码都无关，只能靠用户手势。 */
function looksLikeAutoplayBlocked(input: CameraDiagnosticInput): boolean {
  const text = lower(input.reason) + ' ' + lower(input.details)
  return text.includes('notallowederror') || text.includes('play() failed') || text.includes('not allowed')
}

/** 主入口：把一次播放失败收敛成 `{ code, reason, hint }`。 */
export function cameraPlaybackDiagnostic(input: CameraDiagnosticInput): CameraDiagnostic {
  // 自动播放拦截排在授权之前：它的 `reason` 里也可能带「denied」字样，但处置完全不同。
  if (looksLikeAutoplayBlocked(input)) return autoplayBlocked()
  if (looksLikeLicenseRestriction(input)) return licenseRestricted()
  if (looksLikeManifestParseFailure(input)) return manifestUnparsable()
  if (looksLikeAuthProblem(input)) return accessDenied(input)
  if (looksLikeAddressExpired(input)) return addressExpired()
  if (looksLikeCodecProblem(input)) return codecUnsupported()
  // 中止要排在「网络」之前：`MEDIA_ERR_ABORTED` 是**主动**中断（切页/关弹窗），
  // 报成网络问题会把「用户自己关掉了」变成一条假的故障记录。
  if (input.mediaErrorCode === MEDIA_ERR_ABORTED) return playbackAborted()
  if (looksLikeNetworkProblem(input)) return upstreamUnreachable(input)
  if (input.mediaErrorCode === MEDIA_ERR_NETWORK) return upstreamUnreachable(input)
  return unclassified(input)
}

function autoplayBlocked(): CameraDiagnostic {
  return {
    code: 'CAMERA_AUTOPLAY_BLOCKED',
    reason: '浏览器阻止了摄像头视频自动播放。',
    hint: '检查浏览器或App的媒体播放限制，可允许本页面播放媒体后重新打开画面。',
  }
}

function accessDenied(input: CameraDiagnosticInput): CameraDiagnostic {
  return {
    code: 'CAMERA_ACCESS_DENIED',
    reason: `视频请求被拒绝（HTTP ${input.status}）。`,
    hint: '检查当前登录、显示设备配对及摄像头访问权限；具体拒绝来源见关联后台记录。',
  }
}

/** 授权状态限制（0.8.7）：重连、换浏览器都没用，必须先恢复授权。 */
function licenseRestricted(): CameraDiagnostic {
  return {
    code: 'CAMERA_LICENSE_RESTRICTED',
    reason: '当前授权状态不允许读取摄像头。',
    hint: '先在授权页恢复有效授权；恢复后重新打开摄像头画面，不需要重新配对设备。',
  }
}

/** 清单格式异常（0.8.7）：上游把「服务返回的视频清单」与「网络读不到」分开报。 */
function manifestUnparsable(): CameraDiagnostic {
  return {
    code: 'CAMERA_MANIFEST_UNPARSABLE',
    reason: '服务返回的视频清单格式无法解析。',
    hint: '检查 HA 出流编码与播放器分类；清单本身不合法时重连不会恢复。',
  }
}

function addressExpired(): CameraDiagnostic {
  return {
    code: 'CAMERA_ADDRESS_EXPIRED',
    reason: '视频清单或片段地址不存在或已失效。',
    hint: '检查 HA 摄像头来源和流服务状态，可重新打开摄像头画面获取当前地址。',
  }
}

function codecUnsupported(): CameraDiagnostic {
  return {
    code: 'CAMERA_CODEC_UNSUPPORTED',
    reason: '播放器未找到当前浏览器支持的视频或音频编码。',
    hint: '检查视频编码和流内容；仅重连网络不能确认编码问题已经解决。',
  }
}

function playbackAborted(): CameraDiagnostic {
  return {
    code: 'CAMERA_PLAYBACK_ABORTED',
    reason: '视频读取被中断。',
    hint: '通常是页面切换或手动关闭画面；重复出现时查看同一时段的关联记录。',
  }
}

function upstreamUnreachable(input: CameraDiagnosticInput): CameraDiagnostic {
  const status = Number(input.status || 0)
  return {
    code: 'CAMERA_UPSTREAM_UNREACHABLE',
    reason: status >= 500 ? `视频服务暂时不可用（HTTP ${status}）。` : '浏览器未能完整读取视频数据。',
    hint: '检查浏览器到 HA Bridge 以及 HA Bridge 到视频服务的连接；状态为 0 时浏览器未提供 HTTP 结果。',
  }
}

function unclassified(input: CameraDiagnosticInput): CameraDiagnostic {
  const rawReason = String(input.reason || '').trim()
  const type = String(input.type || '').trim()
  const hintPrefix = type ? `播放器分类：${type}；` : '播放器未提供分类；'
  return {
    code: 'CAMERA_PLAYBACK_FAILED',
    reason: rawReason ? `播放失败：${rawReason.slice(0, 80)}` : '播放器未能继续播放，原始分类见详情。',
    hint: hintPrefix + '查看关联后台记录及摄像头来源，核对网络和浏览器支持的视频编码。',
  }
}

/** 展示用的单行文案：`原因（编码）` 这种组合在面板里只该占一行。 */
export function cameraDiagnosticText(diagnostic: CameraDiagnostic): string {
  return diagnostic.reason
}

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
