import { useTtsSpeak, type TtsSpeakResult } from '@/domain/voice/use-tts-speak'
import { getConfigSection, onConfigChange } from '@/kernel/config/frontend-config'
import { logger, readLocalStorage, removeLocalStorage, writeLocalStorage, getApiErrorMessage } from '@/kernel/utils/core'
import { onMounted, onUnmounted, ref, computed, onScopeDispose, getCurrentScope, type Ref } from 'vue'
import { previewAgentTts } from '@/domain/api/agent'
import { previewDailyAdvisor } from '@/features/voice/model/utils'
import { hapticHold, hapticTap } from '@/kernel/utils/ui/haptics.util'
import { transcribeVoice } from '@/kernel/http'
import { normalizeWakeWords } from '@/kernel/constants'

/**
 * 管家回复的播报：服务端合成音频优先，失败回落本机 / HA。
 *
 * 为什么单独成 composable 而不是在调用点内联：对话面板与悬浮伴侣都要这套
 * 「先试 mp3、不行再让本机说话」的逻辑，且两处都卡在文件规模上限里 ——
 * 抽出来既避免两处各写一遍回落分支，也不给那两个大文件加行。
 */

export function useAgentSpeech() {
  const { play, stop: stopServer } = useServerTts()
  const { speak } = useTtsSpeak()

  /** 语音播报是否开启（`voice.ttsEnabled` 默认开启） */
  function enabled(): boolean {
    return getConfigSection('voice')?.ttsEnabled !== false
  }

  /**
   * 播报一句回复：先试后端签发的音频，拿不到（或播放失败）再回落既有链路。
   *
   * @param ttsUrl 后端 `ttsUrl`；空值直接走回落
   * @param text   回复正文，回落播报用
   */
  async function speakReply(ttsUrl: string | undefined | null, text: string): Promise<boolean> {
    if (!enabled() || !String(text || '').trim()) return false
    if (await play(ttsUrl)) return true
    try {
      const result = await speak(text)
      return result.ok
    } catch (error) {
      logger.debug('播报回落失败', error)
      return false
    }
  }

  /**
   * 停止当前播报：服务端音频与浏览器本机合成都要停。
   *
   * 只停服务端会留下「点了停止但本机还在念」的割裂感；``speechSynthesis`` 在部分环境
   * 不存在（SSR / 旧内核），因此做存在性判断而不是直接调用。
   */
  function stop(): void {
    try {
      stopServer()
    } catch (error) {
      logger.debug('停止服务端播报失败', error)
    }
    try {
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel()
      }
    } catch (error) {
      logger.debug('停止本机播报失败', error)
    }
  }

  return { speak, speakReply, stop }
}

/**
 * @file useAudioDevices.ts
 * @module composables/voice
 * @description 本机麦克风 / 扬声器枚举与每客户端偏好（localStorage）。
 *
 * 设备 ID 按浏览器本地存储，不进全局 app config（墙面板互不相同）。
 */


const INPUT_KEY = 'homeos_audio_input_device_id'
const OUTPUT_KEY = 'homeos_audio_output_device_id'

type AudioDeviceInfo = {
  deviceId: string
  label: string
  groupId: string
  kind: 'audioinput' | 'audiooutput'
}

type MicPermissionState = 'unknown' | 'granted' | 'denied' | 'prompt' | 'unsupported'

function readStoredId(key: string): string {
  if (typeof localStorage === 'undefined') return ''
  return readLocalStorage(key) || ''
}

function writeStoredId(key: string, id: string) {
  if (typeof localStorage === 'undefined') return
  const trimmedId = String(id || '').trim()
  if (!trimmedId) removeLocalStorage(key)
  else writeLocalStorage(key, trimmedId)
}

/**
 * 同步读取本机输入设备偏好（HA STT 录音用）。
 */
function getPreferredAudioInputDeviceId(): string {
  return readStoredId(INPUT_KEY)
}

/** 清除失效的本机麦克风偏好（设备拔出 / ID 过期）。 */
function clearPreferredAudioInputDeviceId() {
  writeStoredId(INPUT_KEY, '')
}

function isNoDeviceError(deviceError: unknown) {
  const name = deviceError instanceof DOMException ? deviceError.name : ''
  return name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError'
}

/**
 * 打开一条麦克风流：先按本机偏好（ideal），失败再默认设备，再逐个枚举尝试。
 */
export async function openAudioInputStream(): Promise<MediaStream> {
  if (typeof window !== 'undefined' && !window.isSecureContext) {
    // 措辞要能直接照做：镜像自带 https 入口（8803），内网把 http://<IP>:8801 换掉即可。
    throw Object.assign(
      new Error('需 HTTPS 安全上下文才能访问麦克风：把地址换成面板内置的 https 入口（如 https://<本机IP>:8803）'),
      { name: 'SecurityError' },
    )
  }
  if (!navigator.mediaDevices?.getUserMedia) {
    throw Object.assign(new Error('浏览器不支持麦克风'), { name: 'NotSupportedError' })
  }

  const preferredId = getPreferredAudioInputDeviceId()
  const attempts: MediaStreamConstraints[] = []
  if (preferredId) {
    attempts.push({ audio: { deviceId: { ideal: preferredId } } })
  }
  attempts.push({ audio: true })

  let lastErr: unknown
  for (const constraints of attempts) {
    try {
      return await navigator.mediaDevices.getUserMedia(constraints)
    } catch (error) {
      lastErr = error
      logger.debug('打开麦克风失败,尝试下一方案', error)
    }
  }

  if (preferredId && isNoDeviceError(lastErr)) {
    clearPreferredAudioInputDeviceId()
  }

  try {
    const list = await navigator.mediaDevices.enumerateDevices()
    const inputs = list.filter((device) => device.kind === 'audioinput' && device.deviceId)
    for (const device of inputs) {
      if (device.deviceId === preferredId) continue
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { exact: device.deviceId } },
        })
      } catch (error) {
        lastErr = error
        logger.debug(`打开麦克风失败 [${device.deviceId.slice(0, 8)}]`, error)
      }
    }
  } catch (error) {
    logger.debug('枚举麦克风失败', error)
  }

  throw lastErr || Object.assign(new Error('未检测到麦克风'), { name: 'NotFoundError' })
}

type MicProbe = {
  secure: boolean
  host: string
  inputCount: number
  permission: string
  errorName: string
}

function mediaErrorName(mediaError: unknown) {
  if (mediaError instanceof DOMException && mediaError.name) return mediaError.name
  if (mediaError && typeof mediaError === 'object' && 'name' in mediaError)
    return String((mediaError as { name?: string }).name || '')
  return ''
}

/** 当前页面能否看到麦克风（失败时用于给出准确提示，不打开录音）。 */
export async function probeMicrophone(probeError?: unknown): Promise<MicProbe> {
  const secure = typeof window !== 'undefined' && window.isSecureContext
  const host = typeof window !== 'undefined' ? window.location.host || 'unknown' : ''
  let inputCount = 0
  let permission = 'unknown'
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'microphone' as PermissionName })
      permission = status.state
    }
  } catch {
    /* permissions.query(microphone) 在部分浏览器不可用 */
  }
  try {
    if (navigator.mediaDevices?.enumerateDevices) {
      const list = await navigator.mediaDevices.enumerateDevices()
      inputCount = list.filter((device) => device.kind === 'audioinput').length
    }
  } catch {
    /* 枚举失败视为 0 */
  }
  return {
    secure,
    host,
    inputCount,
    permission,
    errorName: mediaErrorName(probeError),
  }
}

export function isEmbeddedBrowser() {
  if (typeof window === 'undefined') return false
  const ua = navigator.userAgent || ''
  if (/Electron/i.test(ua)) return true
  try {
    return window.top !== window.self
  } catch {
    return true
  }
}

/**
 * 同步读取本机输出设备偏好（setSinkId 用）。
 */
function getPreferredAudioOutputDeviceId(): string {
  return readStoredId(OUTPUT_KEY)
}

/**
 * 将已选扬声器应用到 HTMLMediaElement（Chromium setSinkId）。
 *
 * 单独导出：`useServerTts` 是模块级单例（伙伴语音没有 effect scope），不能为它
 * 再拉一份 `useAudioDevices()`，否则会重复注册 devicechange 监听。
 */
export async function applyOutputSink(el: HTMLMediaElement | null | undefined): Promise<boolean> {
  if (!el) return false
  const sinkId = getPreferredAudioOutputDeviceId()
  if (!sinkId) return false
  const anyEl = el as HTMLMediaElement & {
    setSinkId?: (id: string) => Promise<void>
  }
  if (typeof anyEl.setSinkId !== 'function') return false
  try {
    await anyEl.setSinkId(sinkId)
    return true
  } catch (error) {
    logger.debug('setSinkId 失败', error)
    return false
  }
}

/**
 * 本机音视频设备 composable。
 */
export function useAudioDevices() {
  const inputs = ref<AudioDeviceInfo[]>([])
  const outputs = ref<AudioDeviceInfo[]>([])
  const inputDeviceId = ref(getPreferredAudioInputDeviceId())
  const outputDeviceId = ref(getPreferredAudioOutputDeviceId())
  const permission = ref<MicPermissionState>('unknown')
  const loading = ref(false)
  const errorTip = ref('')
  const secureContext = typeof window !== 'undefined' ? window.isSecureContext : false
  const mediaSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.enumerateDevices

  const inputOptions = computed(() =>
    inputs.value.map((device) => ({
      value: device.deviceId,
      label: device.label || `麦克风 ${device.deviceId.slice(0, 8)}`,
    })),
  )
  const outputOptions = computed(() =>
    outputs.value.map((device) => ({
      value: device.deviceId,
      label: device.label || `扬声器 ${device.deviceId.slice(0, 8)}`,
    })),
  )
  const selectedInputLabel = computed(() => {
    const id = inputDeviceId.value
    if (!id) return '系统默认'
    return inputOptions.value.find((option) => option.value === id)?.label || id.slice(0, 12)
  })
  const selectedOutputLabel = computed(() => {
    const id = outputDeviceId.value
    if (!id) return '系统默认'
    return outputOptions.value.find((option) => option.value === id)?.label || id.slice(0, 12)
  })
  const supportsSetSinkId = computed(() => {
    if (typeof HTMLMediaElement === 'undefined') return false
    return typeof (HTMLMediaElement.prototype as { setSinkId?: unknown }).setSinkId === 'function'
  })

  async function probePermission(): Promise<MicPermissionState> {
    if (!secureContext || !navigator.mediaDevices?.getUserMedia) {
      permission.value = 'unsupported'
      return permission.value
    }
    try {
      if (navigator.permissions?.query) {
        const status = await navigator.permissions.query({
          name: 'microphone' as PermissionName,
        })
        const state = status.state as MicPermissionState
        permission.value = state === 'granted' || state === 'denied' || state === 'prompt' ? state : 'unknown'
        return permission.value
      }
    } catch {
      // permissions API 对 microphone 可能不可用
    }
    return permission.value
  }

  /**
   * 请求麦克风权限并刷新设备列表（拿到 label）。
   */
  async function ensureMicPermission(): Promise<boolean> {
    errorTip.value = ''
    if (!secureContext) {
      errorTip.value = '需 HTTPS（把 http://<本机IP>:8801 换成 https://<本机IP>:8803）才能访问麦克风'
      permission.value = 'unsupported'
      return false
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      errorTip.value = '浏览器不支持麦克风'
      permission.value = 'unsupported'
      return false
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((track) => track.stop())
      permission.value = 'granted'
      await refreshDevices()
      return true
    } catch (error) {
      permission.value = 'denied'
      errorTip.value = '麦克风权限被拒绝，请在浏览器设置中允许'
      logger.debug('麦克风权限失败', error)
      return false
    }
  }

  /**
   * 枚举本机音频设备。
   */
  async function refreshDevices() {
    if (!mediaSupported) {
      inputs.value = []
      outputs.value = []
      return
    }
    loading.value = true
    try {
      const list = await navigator.mediaDevices.enumerateDevices()
      inputs.value = list
        .filter((device) => device.kind === 'audioinput')
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || '',
          groupId: device.groupId || '',
          kind: 'audioinput' as const,
        }))
      outputs.value = list
        .filter((device) => device.kind === 'audiooutput')
        .map((device) => ({
          deviceId: device.deviceId,
          label: device.label || '',
          groupId: device.groupId || '',
          kind: 'audiooutput' as const,
        }))

      // 已选设备被拔掉时回退默认
      if (inputDeviceId.value && !inputs.value.some((device) => device.deviceId === inputDeviceId.value)) {
        setInputDeviceId('')
      }
      if (outputDeviceId.value && !outputs.value.some((device) => device.deviceId === outputDeviceId.value)) {
        setOutputDeviceId('')
      }
    } catch (error) {
      logger.debug('enumerateDevices 失败', error)
      errorTip.value = '无法枚举音频设备'
    } finally {
      loading.value = false
    }
  }

  function setInputDeviceId(id: string) {
    inputDeviceId.value = String(id || '').trim()
    writeStoredId(INPUT_KEY, inputDeviceId.value)
  }

  function setOutputDeviceId(id: string) {
    outputDeviceId.value = String(id || '').trim()
    writeStoredId(OUTPUT_KEY, outputDeviceId.value)
  }

  function onDeviceChange() {
    void refreshDevices()
  }

  onMounted(() => {
    void probePermission().then(() => refreshDevices())
    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener('devicechange', onDeviceChange)
    }
  })

  onUnmounted(() => {
    if (navigator.mediaDevices?.removeEventListener) {
      navigator.mediaDevices.removeEventListener('devicechange', onDeviceChange)
    }
  })

  return {
    inputs,
    outputs,
    inputDeviceId,
    outputDeviceId,
    inputOptions,
    outputOptions,
    selectedInputLabel,
    selectedOutputLabel,
    permission,
    loading,
    errorTip,
    secureContext,
    mediaSupported,
    supportsSetSinkId,
    ensureMicPermission,
    refreshDevices,
    setInputDeviceId,
    setOutputDeviceId,
    applyOutputSink,
  }
}

/**
 * 每日顾问问候（「设置 → 语音 → 播报输出 → 每日问候」的实际触发端）。
 *
 * 为什么放在前端而不是后端定时器：
 * - 配置项的语义本来就是「到达起始时刻后**当天首次打开主界面**触发」，这是一次
 *   用户在场的动作；服务端定时器会在没人的时候对着空房间说话，还得额外处理多终端
 *   重复播报。
 * - 「当天只问候一次」的去重天然属于单台终端：墙面板各说各的，正是用户期望的。
 *
 * 链路：服务端合成（复用当前音色）→ `<audio>` 播放；被自动播放策略拦截或合成失败时
 * 回落本机 / HA 播报；仍然失败则挂一次性的用户手势重试，成功后才写当天标记 ——
 * 失败不该把一天的机会用掉。
 */

/** 当天是否已问候（localStorage 里存的日期串） */
const GREETING_DAY_KEY = 'homeos_daily_advisor_spoken_day'
/** 白天 / 晚间的分界点（与设置页「白天问候（20 点前）」文案一致） */
const EVENING_FROM_HOUR = 20

function localDayKey(now = new Date()): string {
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function readStoredDay(): string {
  if (typeof localStorage === 'undefined') return ''
  try {
    return String(localStorage.getItem(GREETING_DAY_KEY) || '')
  } catch {
    return ''
  }
}

function writeStoredDay(day: string): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(GREETING_DAY_KEY, day)
  } catch {
    /* 隐私模式下写入会抛错：问候本身不影响主流程 */
  }
}

/** 今天是否已经问候过（设置页状态文案也用这个）。 */
export function greetedToday(): boolean {
  return readStoredDay() === localDayKey()
}

/** 与滑杆一致的 `+10%` / `+2Hz` 解析。 */
function parseSignedNumber(raw: unknown): number {
  const matched = String(raw ?? '').match(/^[+-]?\d+(?:\.\d+)?/)
  if (!matched) return 0
  const value = Number(matched[0])
  return Number.isFinite(value) ? Math.round(value) : 0
}

/**
 * 按当前时刻与配置算出今天该说的那句话；不满足条件返回 `null`。
 */
function buildDailyGreeting(now = new Date()): string | null {
  const voice = getConfigSection('voice')
  if (!voice?.dailyAdvisorSpeak) return null
  if (voice.ttsEnabled === false) return null
  const startHour = Number(voice.dailyAdvisorSpeakHour ?? 20)
  if (!Number.isFinite(startHour)) return null
  if (now.getHours() < startHour) return null
  // 起始时刻可能被设成 0（全天可问候）：白天 / 晚间仍按 20 点区分
  const evening = now.getHours() >= EVENING_FROM_HOUR
  const template = evening ? voice.dailyAdvisorTtsEvening : voice.dailyAdvisorTtsDaytime
  const text = previewDailyAdvisor(evening ? 'evening' : 'day', template).trim()
  return text || null
}

/**
 * 「等用户先点一下再播」的一次性重试。
 *
 * 浏览器的自动播放策略会掐掉没有手势的音频；此时把这句话挂起，用户第一次
 * 点击 / 按键时补播。独立成函数是因为它有自己的清理生命周期，塞进 composable
 * 会让那个函数既管播报又管事件监听。
 */
function createGestureRetry() {
  let pendingText: string | null = null
  let onFire: ((text: string) => void) | null = null

  function clear(): void {
    pendingText = null
    onFire = null
    if (typeof window === 'undefined') return
    window.removeEventListener('pointerdown', fire)
    window.removeEventListener('keydown', fire)
  }

  function fire(): void {
    const text = pendingText
    const callback = onFire
    clear()
    if (text && callback) callback(text)
  }

  function bind(text: string, callback: (text: string) => void): void {
    if (typeof window === 'undefined' || pendingText) return
    pendingText = text
    onFire = callback
    window.addEventListener('pointerdown', fire, { once: true })
    window.addEventListener('keydown', fire, { once: true })
  }

  return { bind, clear }
}

export function useDailyAdvisorGreeting() {
  const { play } = useServerTts()
  const { speak } = useTtsSpeak()
  const greetingPending = ref(false)
  const gesture = createGestureRetry()
  let disposed = false

  /** 用当前音色配置请后端合成一段音频并播放；成功返回 true。 */
  async function playViaServer(text: string): Promise<boolean> {
    const voice = getConfigSection('voice')
    if (!voice) return false
    try {
      const result = await previewAgentTts({
        text,
        engine: voice.ttsEngine === 'openai' ? 'openai' : 'edge',
        voice: String(voice.ttsVoice || ''),
        rate: parseSignedNumber(voice.ttsRate),
        pitch: parseSignedNumber(voice.ttsPitch),
      })
      return await play(result.ttsUrl)
    } catch (error) {
      // 熔断 / 未配置密钥 / 上游不可达：回落既有链路，不打扰用户
      logger.debug('每日问候服务端合成不可用，回落本机播报', error)
      return false
    }
  }

  async function deliver(text: string): Promise<void> {
    greetingPending.value = true
    try {
      if (await playViaServer(text)) {
        writeStoredDay(localDayKey())
        return
      }
      const result = await speak(text)
      if (result.ok) {
        writeStoredDay(localDayKey())
        return
      }
      // 自动播放策略会同时掐掉两条链路：等人来点一下再试，不消耗当天机会
      logger.debug('每日问候被拦截或失败，等待用户手势重试', result.message)
      gesture.bind(text, (next) => {
        void deliver(next)
      })
    } finally {
      greetingPending.value = false
    }
  }

  /** 主界面配置就绪后调用：满足条件且今天还没说过，就播报当天问候。 */
  function maybeGreet(now = new Date()): void {
    if (disposed || greetedToday()) return
    const text = buildDailyGreeting(now)
    if (!text) return
    void deliver(text)
  }

  onScopeDispose(() => {
    disposed = true
    gesture.clear()
  })

  return { greetingPending, maybeGreet }
}

/**
 * 操作音效（earcon）：管家结果确认时的极短提示音。
 *
 * 为什么不用音频文件：三种音效总共不到 0.3 秒，用 Web Audio 现场合成即可 ——
 * 不占静态资源、不需要预加载，也不会因为网络抖动让提示音晚到半秒。
 *
 * 为什么默认跟随 `voice.ttsEnabled`：音效属于「声音反馈」的一部分，用户关掉语音
 * 播报时通常也不想被叮一声。音量刻意压低（增益 0.05~0.12），只求可察觉。
 */

/** 音效类型：与后端 `AgentChatResponse.earcon` 对齐 */
type EarconKind = 'success' | 'error' | 'confirm'

/** 单个音符 */
interface Tone {
  /** 频率（Hz） */
  freq: number
  /** 相对起始时刻（秒） */
  at: number
  /** 时长（秒） */
  duration: number
  /** 波形 */
  type: OscillatorType
  /** 峰值增益 */
  gain: number
}

/** 音效编排：上行双音 = 成功，下行低音 = 失败，单音 = 需要确认 */
const EARCON_TONES: Record<EarconKind, Tone[]> = {
  success: [
    { freq: 784, at: 0, duration: 0.09, type: 'triangle', gain: 0.1 },
    { freq: 1175, at: 0.09, duration: 0.12, type: 'triangle', gain: 0.1 },
  ],
  error: [
    { freq: 330, at: 0, duration: 0.1, type: 'square', gain: 0.06 },
    { freq: 220, at: 0.1, duration: 0.16, type: 'square', gain: 0.06 },
  ],
  confirm: [{ freq: 988, at: 0, duration: 0.12, type: 'sine', gain: 0.09 }],
}

let context: AudioContext | null = null

function resolveContext(): AudioContext | null {
  if (context) return context
  const Ctx =
    window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctx) return null
  try {
    context = new Ctx()
  } catch (error) {
    logger.debug('创建音频上下文失败，跳过音效', error)
    return null
  }
  return context
}

/** Android WebView / iOS 上 AudioContext 默认 suspended，出声前必须 resume。 */
async function ensureRunning(ctx: AudioContext): Promise<boolean> {
  if (ctx.state !== 'suspended') return true
  try {
    await ctx.resume()
    return true
  } catch (error) {
    logger.debug('音频上下文 resume 失败，跳过音效', error)
    return false
  }
}

/** 音效是否启用（跟随语音播报开关） */
function earconEnabled(): boolean {
  return getConfigSection('voice')?.ttsEnabled !== false
}

/**
 * 播放一段操作音效。
 *
 * 静默失败：没有音频权限、浏览器不支持、自动播放被拦截都不该影响主流程 ——
 * 音效是锦上添花，绝不能让它把一轮已经成功的对话变成错误。
 *
 * @param kind 音效类型；`null` / 未知值直接跳过
 */
export async function playEarcon(kind: EarconKind | null | undefined): Promise<void> {
  if (!kind || !earconEnabled()) return
  const tones = EARCON_TONES[kind]
  if (!tones?.length) return
  const ctx = resolveContext()
  if (!ctx || !(await ensureRunning(ctx))) return
  try {
    const start = ctx.currentTime + 0.01
    for (const tone of tones) {
      const osc = ctx.createOscillator()
      const gain = ctx.createGain()
      osc.type = tone.type
      osc.frequency.value = tone.freq
      const begin = start + tone.at
      gain.gain.setValueAtTime(0.0001, begin)
      gain.gain.exponentialRampToValueAtTime(tone.gain, begin + 0.01)
      gain.gain.exponentialRampToValueAtTime(0.0001, begin + tone.duration)
      osc.connect(gain)
      gain.connect(ctx.destination)
      osc.start(begin)
      osc.stop(begin + tone.duration + 0.02)
    }
  } catch (error) {
    logger.debug('播放音效失败', error)
  }
}

/**
 * 「按住说话」手势状态机（对照源码面板内 circle-voice-hud 的 web 侧子集）。
 *
 * 只负责手势与视觉：什么时候算「按住」、上滑多远算取消、波形怎么动、
 * 哪些瞬间该给触觉反馈。录音 / 识别仍由 `useSpeechToText` 负责，
 * 通过 `onStart` / `onStop` 回调交给调用方 —— 这样桌面端点按切换与
 * 面板内按住说话可以共用同一套识别流程，不必各写一份。
 */

/** 按住多久才进入录音：更短会把「点一下按钮」也误判成长按 */
const HOLD_MS = 300
/**
 * 上滑多少像素算取消。面板内触点比悬浮伴侣大（60px vs 66px 但贴着屏幕底边），
 * 源码这里给的是 60px，悬浮伴侣是 45px —— 两处数值本来就不同，不要合并。
 */
const CANCEL_PX = 60
/** 波形权重：与源码同一组，7 根竖条看起来才像频谱而不是随机噪声 */
const WAVE_WEIGHTS = [0.45, 0.75, 1, 0.85, 1, 0.7, 0.4]
/** 静息高度 / 振幅：与源码 `6 + min(1, level*w*1.35) * 18` 同一口径 */
const WAVE_FLOOR = 6
const WAVE_GAIN = 18
/** 波形推进速度（弧度/帧）：0.22 接近源码 60fps 下的自然摆动 */
const WAVE_STEP = 0.22

/** idle=未按 / holding=录音中 / cancel=已上滑、松手即丢弃 */
type HoldPhase = 'idle' | 'holding' | 'cancel'

interface HoldToTalkOptions {
  /** 允许开始的条件（忙 / 未配置时按不动） */
  enabled?: () => boolean
  /** 按住达标：调用方启动录音 */
  onStart: () => void
  /** 松手：canceled=true 表示已上滑取消，调用方应丢弃本次识别结果 */
  onStop: (canceled: boolean) => void
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return true
  return Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
}

/**
 * 波形竖条的逐帧动画。
 *
 * 源码的竖条高度来自原生音频 amplitude；web 端拿不到同一份电平，
 * 用同一组权重叠加正弦摆动，视觉上与「有人在说话」一致。
 *
 * @returns bars 当前高度数组 / start 起振 / stop 归位
 */
function useWaveBars() {
  const bars = ref<number[]>(WAVE_WEIGHTS.map(() => WAVE_FLOOR))
  let frame = 0
  let phase = 0

  function reset() {
    bars.value = WAVE_WEIGHTS.map(() => WAVE_FLOOR)
  }

  function stop() {
    if (frame) cancelAnimationFrame(frame)
    frame = 0
    reset()
  }

  function tick() {
    phase += WAVE_STEP
    bars.value = WAVE_WEIGHTS.map((weight, index) => {
      const wobble = 0.55 + 0.45 * Math.abs(Math.sin(phase + index * 0.7))
      return Math.round(WAVE_FLOOR + Math.min(1, weight * wobble * 1.35) * WAVE_GAIN)
    })
    frame = requestAnimationFrame(tick)
  }

  function start() {
    stop()
    if (prefersReducedMotion()) return
    frame = requestAnimationFrame(tick)
  }

  return { bars, start, stop }
}

interface HoldGestureOptions extends HoldToTalkOptions {
  /** 对外暴露的手势相位 */
  phase: Ref<HoldPhase>
  /** 长按达标时起振 */
  startWave: () => void
  /** 松手 / 取消时停下波形 */
  stopWave: () => void
}

/**
 * 指针手势：按下计时、上滑取消、松手收口。
 *
 * 与波形动画分开，是为了让「判定」和「画」各自小到可以一眼读完 ——
 * 两者的测试/阅读需求完全不同（前者关心阈值，后者关心手感）。
 */
function useHoldGesture(options: HoldGestureOptions) {
  const { phase, startWave, stopWave } = options
  let holdTimer: ReturnType<typeof setTimeout> | null = null
  let pressY = 0
  let pointerId: number | null = null
  /** 长按是否已达标：达标前松手只是「点了一下」，不该触发录音 */
  let holding = false

  function clearHoldTimer() {
    if (holdTimer) clearTimeout(holdTimer)
    holdTimer = null
  }

  function reset() {
    clearHoldTimer()
    stopWave()
    phase.value = 'idle'
    holding = false
    pointerId = null
  }

  function capturePointer(event: PointerEvent) {
    const target = event.currentTarget as HTMLElement | null
    try {
      target?.setPointerCapture(event.pointerId)
    } catch {
      /* 指针已失效时浏览器会抛错，忽略即可 */
    }
  }

  /** 长按达标：接管手势并通知调用方开始录音 */
  function beginHold() {
    holdTimer = null
    holding = true
    phase.value = 'holding'
    hapticHold()
    startWave()
    options.onStart()
  }

  function onPointerDown(event: PointerEvent) {
    if (event.pointerType === 'mouse' && event.button !== 0) return
    if (options.enabled && !options.enabled()) return
    reset()
    pressY = event.clientY
    pointerId = event.pointerId
    capturePointer(event)
    holdTimer = setTimeout(beginHold, HOLD_MS)
  }

  function onPointerMove(event: PointerEvent) {
    if (!holding || event.pointerId !== pointerId) return
    const next: HoldPhase = pressY - event.clientY >= CANCEL_PX ? 'cancel' : 'holding'
    if (next === phase.value) return
    // 越过阈值给一次轻触：手指盖住了波纹区，视觉提示看不到，靠触感确认
    if (next === 'cancel') hapticTap()
    phase.value = next
  }

  function onPointerUp(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    const canceled = phase.value === 'cancel'
    const started = holding
    reset()
    if (started) options.onStop(canceled)
  }

  function onPointerCancel(event: PointerEvent) {
    if (event.pointerId !== pointerId) return
    const started = holding
    reset()
    // 指针被系统收走（来电、手势返回）按「取消」处理，避免留下一条没人停的麦克风
    if (started) options.onStop(true)
  }

  return { onPointerDown, onPointerMove, onPointerUp, onPointerCancel, reset }
}

/**
 * 按住说话手势。
 *
 * @param options 启停回调与可用性判定
 * @returns phase / bars（波形高度数组）与四个指针事件处理器
 */
export function useHoldToTalk(options: HoldToTalkOptions) {
  const phase = ref<HoldPhase>('idle')
  const wave = useWaveBars()
  const gesture = useHoldGesture({
    ...options,
    phase,
    startWave: wave.start,
    stopWave: wave.stop,
  })

  // 组件作用域内使用时自动收尾；模块级调用时静默跳过
  if (getCurrentScope()) onScopeDispose(gesture.reset)

  return {
    phase,
    bars: wave.bars,
    onPointerDown: gesture.onPointerDown,
    onPointerMove: gesture.onPointerMove,
    onPointerUp: gesture.onPointerUp,
    onPointerCancel: gesture.onPointerCancel,
  }
}

/**
 * 服务端 TTS 播放：把后端签发的 `ttsUrl` 用 `<audio>` 放出来。
 *
 * 为什么不复用 `useTtsSpeak`：那条链路是「让谁说话」（本机 SpeechSynthesis / HA
 * 音箱），这条是「后端已经合成好了 mp3，直接播」。两者的失败语义也不同 ——
 * 这里失败就返回 `false`，调用方回落 `useTtsSpeak`，绝不向用户报错。
 */

export function useServerTts() {
  const speaking = ref(false)
  // 同一时刻只保留一个播放器，避免连续两轮回复的声音叠在一起
  let player: HTMLAudioElement | null = null

  function reset(target: HTMLAudioElement) {
    if (player !== target) return
    player = null
    speaking.value = false
  }

  function stop() {
    if (!player) return
    const current = player
    player = null
    speaking.value = false
    try {
      current.pause()
      current.removeAttribute('src')
      current.load()
    } catch (error) {
      logger.debug('停止服务端 TTS 播放失败', error)
    }
  }

  /**
   * 播放一段服务端音频。
   *
   * 起点返回：`play()` 只等到「真的开始出声」就 resolve，不等整段放完 ——
   * 调用点后面还排着状态收尾（气泡、busy 标记），不能被几十秒的音频钉住。
   * 中途解码失败只静默停播，不再回落（此时用户已经在听了）。
   *
   * @param url 后端 `ttsUrl`（相对路径或绝对地址）
   * @returns 是否真的开始播放；`false` 时调用方应回落本机 / HA 播报
   */
  async function play(url: string | undefined | null): Promise<boolean> {
    const target = String(url || '').trim()
    if (!target) return false
    stop()
    const audio = new Audio(target)
    // 不预加载：用户可能立刻切走，白下载一段没听的音频
    audio.preload = 'none'
    audio.addEventListener('ended', () => reset(audio), { once: true })
    audio.addEventListener(
      'error',
      () => {
        logger.debug('服务端 TTS 播放中断', audio.error?.code)
        reset(audio)
      },
      { once: true },
    )
    player = audio
    speaking.value = true
    // 设置页选的「本机扬声器」只对支持 setSinkId 的媒体元素生效：
    // 必须在 play() 之前应用，播放中途换 sink 会有一次可听见的断音。
    try {
      await applyOutputSink(audio)
    } catch (error) {
      logger.debug('服务端 TTS 切换输出设备失败', error)
    }
    try {
      // 自动播放策略拦截（用户手势之外触发）会在这里 reject
      await audio.play()
      return true
    } catch (error) {
      logger.debug('服务端 TTS 启动失败', error)
      reset(audio)
      return false
    }
  }

  // 模块级单例（伙伴语音）没有 effect scope，跳过注册避免告警
  if (getCurrentScope()) onScopeDispose(stop)

  return { speaking, play, stop }
}

/**
 * 设置页试听：一条链路，两个阶段。
 *
 * 之前页面里有两个「试听」按钮，各自只测半条链路（一个只测本机/HA，一个只测服务端
 * 合成），用户根本分不清哪个能代表「平时听到的声音」。这里统一成：
 *
 * 1. 先走服务端合成（与对话回复 `ttsUrl` 同一条路径，音色/语速/音调就是平时生效的）；
 * 2. 合成不可用（熔断 / 未配密钥 / 上游不可达）或播放被拦截时，回落本机 / HA；
 * 3. 把**实际走过的路径**回给调用方，让提示语说出真相。
 *
 * 试听一律 `manual`：关掉总开关时也要能试音色，这是用户调音的前提。
 */

/** 与滑杆一致的 `+10%` / `+2Hz` 解析 */

/** 语音草稿里参与合成的字段（设置页直接传 `voice.value`） */
interface SpeechDraft {
  ttsEngine?: string
  ttsVoice?: string
  ttsRate?: string
  ttsPitch?: string
  ttsApiBase?: string
  ttsApiKey?: string
  ttsModel?: string
}

interface SpeechPreviewResult {
  ok: boolean
  /** 实际链路：服务端合成 / 本机 / HA */
  path: 'server' | 'local' | 'ha' | 'skipped'
  message: string
}

const SERVER_ENGINE_LABEL: Record<string, string> = {
  edge: 'edge 神经音色',
  openai: 'OpenAI 兼容',
}

function engineOfAndLabel(draft: SpeechDraft): { engine: 'edge' | 'openai'; label: string } {
  const engine = draft.ttsEngine === 'openai' ? 'openai' : 'edge'
  return { engine, label: SERVER_ENGINE_LABEL[engine] }
}

/** 回落结果的用户可读文案。 */
function describeFallback(fallback: TtsSpeakResult): SpeechPreviewResult {
  if (!fallback.ok) {
    return { ok: false, path: fallback.path, message: fallback.message || '试听失败' }
  }
  const pathLabel = fallback.path === 'local' ? '本机播报' : 'HA 音箱播报'
  return {
    ok: true,
    path: fallback.path,
    message: `已回落到${pathLabel}（服务端合成不可用）`,
  }
}

export function useSpeechPreview() {
  const { play, stop } = useServerTts()
  const { speak } = useTtsSpeak()
  const previewing = ref(false)

  /** 服务端合成并播放；任何失败都只返回 false，由调用方回落。 */
  async function playServerAudio(content: string, draft: SpeechDraft): Promise<boolean> {
    const { engine } = engineOfAndLabel(draft)
    try {
      const result = await previewAgentTts({
        text: content,
        engine,
        voice: String(draft.ttsVoice || ''),
        rate: parseSignedNumber(draft.ttsRate),
        pitch: parseSignedNumber(draft.ttsPitch),
        apiBase: String(draft.ttsApiBase || ''),
        apiKey: String(draft.ttsApiKey || ''),
        model: String(draft.ttsModel || ''),
      })
      return await play(result.ttsUrl)
    } catch (error) {
      // 熔断 / 未配密钥 / 上游不可达：日志留证据，提示语交给回落结果
      logger.debug('试听：服务端合成不可用，回落既有播报链路', error)
      return false
    }
  }

  /**
   * 播一句试听。
   *
   * @param text  试听文本
   * @param draft 语音草稿（未保存的引擎/音色/密钥也能试）
   * @param opts.mediaPlayers 指定 HA 音箱
   */
  async function preview(
    text: string,
    draft: SpeechDraft = {},
    opts: { mediaPlayers?: string[] } = {},
  ): Promise<SpeechPreviewResult> {
    const content = String(text || '').trim()
    if (!content) return { ok: false, path: 'skipped', message: '请输入试听文字' }
    if (previewing.value) return { ok: false, path: 'skipped', message: '上一次试听还在进行中' }

    previewing.value = true
    try {
      if (await playServerAudio(content, draft)) {
        return {
          ok: true,
          path: 'server',
          message: `已通过管家合成音播放（${engineOfAndLabel(draft).label}）`,
        }
      }
      return describeFallback(await speak(content, { manual: true, mediaPlayers: opts.mediaPlayers }))
    } finally {
      previewing.value = false
    }
  }

  return { previewing, preview, stop }
}

/** - 按设置 voice.sttMode 走浏览器 Web Speech、HA STT 或自动回退； */

type SttMode = 'browser' | 'ha' | 'auto'

function resolveSttMode(raw: unknown): SttMode {
  if (raw === 'ha' || raw === 'auto') return raw
  return 'browser'
}

function isSecureMicContext() {
  return typeof window !== 'undefined' && window.isSecureContext
}

/**
 * 非安全上下文下麦克风必被浏览器拦截。
 *
 * 必须给出**可照做的地址**：本项目的镜像内置了 https 入口（8803 → 8801），内网直连时
 * 把 `http://<IP>:8801` 换成 `https://<同一IP>:8803` 即可（自签证书首次点「继续前往」）。
 * 只写「请改用 HTTPS」的话，用户往往不知道同一台机器上就有这个入口。
 */
function insecureMicMessage() {
  return (
    '当前不是安全连接（需 HTTPS 或 localhost），浏览器会拦截麦克风。' +
    '请把地址换成面板内置的 https 入口再试（例如 http://192.168.1.20:8801 → https://192.168.1.20:8803）'
  )
}

async function explainOpenMicFailure(openError: unknown) {
  if (!isSecureMicContext()) return insecureMicMessage()
  const name = openError instanceof DOMException ? openError.name : String((openError as { name?: string })?.name || '')
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return '麦克风权限被拒绝。请点击地址栏左侧锁图标，将「麦克风」改为允许，然后刷新再试'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '麦克风被其他应用占用，请关闭后重试'
  }
  const probe = await probeMicrophone(openError)
  if (
    probe.inputCount === 0 ||
    name === 'NotFoundError' ||
    name === 'DevicesNotFoundError' ||
    name === 'OverconstrainedError'
  ) {
    const where = isEmbeddedBrowser()
      ? '当前像是编辑器内置预览，请改用 Chrome 或 Edge 打开本站。'
      : `当前页面 ${probe.host || ''}。`
    return `浏览器看不到麦克风（Windows 不会出现授权记录）。请到「设置 → 系统 → 声音」确认输入设备已接入并启用，不是隐私页。${where}`
  }
  return '无法打开麦克风，请检查浏览器权限后重试'
}

function mapBrowserError(code: string, micGranted: boolean) {
  if (code === 'not-allowed' || code === 'service-not-allowed') {
    if (!isSecureMicContext()) return insecureMicMessage()
    if (micGranted) return '浏览器在线识别不可用，正在改用 HA 识别…'
    return '麦克风权限被拒绝。请点击地址栏左侧锁图标，将「麦克风」改为允许后重试'
  }
  if (code === 'audio-capture') {
    return micGranted ? '浏览器识别无法采集音频，正在改用 HA 识别…' : '浏览器无法采集麦克风，正在改用本地录音…'
  }
  if (code === 'network') return '浏览器在线识别网络异常，正在改用 HA 识别…'
  if (code === 'no-speech') return '未听到语音，请靠近麦克风再试'
  if (code === 'aborted') return ''
  return '识别失败，请重试'
}

function blobToBase64(blob: Blob) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader()
    reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '')
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function getSpeechRecognitionCtor() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

export function useSpeechToText(
  options: {
    onInterim?: (text: string) => void
    onFinal?: (text: string) => void
    /** 默认 true：先本地录音走 HA STT，浏览器在线识别仅作回退 */
    preferHa?: boolean
  } = {},
) {
  const listening = ref(false)
  const transcribing = ref(false)
  const transcript = ref('')
  const error = ref('')
  const sttMode = ref<SttMode>(resolveSttMode(getConfigSection('voice')?.sttMode))
  const sttFallbackActive = ref(false)
  const forceHa = ref(false)

  let recognition: SpeechRecognition | null = null
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let destroyed = false
  let offConfig: (() => void) | null = null
  let micGranted = false
  let browserToHaTried = false

  const usesHaStt = computed(
    () => forceHa.value || ((sttMode.value === 'ha' || sttMode.value === 'auto') && !sttFallbackActive.value),
  )

  const status = computed(() => {
    if (transcribing.value) return '识别中…'
    if (listening.value && usesHaStt.value) return '录音中，再点一次结束'
    if (listening.value) return '正在聆听…'
    return ''
  })

  function syncConfig() {
    sttMode.value = resolveSttMode(getConfigSection('voice')?.sttMode)
    sttFallbackActive.value = false
    forceHa.value = false
  }

  offConfig = onConfigChange((sections) => {
    if (!sections || sections.includes('voice')) syncConfig()
  })

  function setError(msg: string) {
    error.value = msg
  }

  function emitInterim(text: string) {
    transcript.value = text
    options.onInterim?.(text)
  }

  function emitFinal(text: string) {
    const trimmed = text.trim()
    transcript.value = trimmed
    if (trimmed) options.onFinal?.(trimmed)
    else setError('未识别到语音')
  }

  function ensureRecognition() {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) return null
    if (!recognition) {
      recognition = new Ctor()
      recognition.interimResults = true
      recognition.continuous = false
      recognition.onerror = (ev: Event) => {
        listening.value = false
        const code = String((ev as Event & { error?: string })?.error || '')
        if (
          code === 'not-allowed' ||
          code === 'service-not-allowed' ||
          code === 'network' ||
          code === 'audio-capture'
        ) {
          void fallbackBrowserToHa(code)
          return
        }
        const msg = mapBrowserError(code, micGranted)
        if (msg) setError(msg)
      }
      recognition.onend = () => {
        if (destroyed) return
        listening.value = false
      }
    }
    recognition.lang = String(getConfigSection('voice')?.language || 'zh-CN')
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      const text = Array.from(event.results)
        .map((result) => result[0].transcript)
        .join('')
      emitInterim(text)
      const last = event.results[event.results.length - 1]
      if (last?.isFinal) {
        listening.value = false
        emitFinal(text)
      }
    }
    return recognition
  }

  async function fallbackBrowserToHa(code: string) {
    if (browserToHaTried) {
      setError(
        mapBrowserError(code, micGranted) || '浏览器识别不可用。请在设置 → 语音中将识别引擎改为 HA，并配置 STT 实体',
      )
      return
    }
    browserToHaTried = true
    forceHa.value = true
    sttFallbackActive.value = false
    setError(mapBrowserError(code, true))
    await startHaRecording()
  }

  async function startBrowserListen() {
    if (!isSecureMicContext()) {
      setError(insecureMicMessage())
      return
    }
    const rec = ensureRecognition()
    if (!rec) {
      forceHa.value = true
      await startHaRecording()
      return
    }
    error.value = ''
    transcript.value = ''
    listening.value = true
    try {
      rec.start()
    } catch (caughtError) {
      logger.debug('语音识别 start 失败', caughtError)
      listening.value = false
      await fallbackBrowserToHa('audio-capture')
    }
  }

  async function startHaRecording() {
    if (!isSecureMicContext()) {
      setError(insecureMicMessage())
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      if (sttMode.value === 'auto' && !forceHa.value) {
        sttFallbackActive.value = true
        await startBrowserListen()
        return
      }
      setError('无法访问麦克风')
      return
    }
    try {
      const stream = await openAudioInputStream()
      micGranted = true
      audioChunks = []
      mediaRecorder = new MediaRecorder(stream)
      mediaRecorder.ondataavailable = (event) => {
        if (event.data.size > 0) audioChunks.push(event.data)
      }
      mediaRecorder.onstop = () => void uploadHaAudio()
      mediaRecorder.start()
      error.value = browserToHaTried ? '浏览器识别不可用，请再说一次，说完再点麦克风' : ''
      transcript.value = ''
      listening.value = true
    } catch (caughtError) {
      if (sttMode.value === 'auto' && !forceHa.value) {
        sttFallbackActive.value = true
        await startBrowserListen()
        return
      }
      setError(await explainOpenMicFailure(caughtError))
      listening.value = false
    }
  }

  function stopHaRecording() {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop()
      mediaRecorder.stream?.getTracks?.().forEach((track) => track.stop())
    }
    listening.value = false
  }

  async function uploadHaAudio() {
    if (!audioChunks.length) {
      if (sttMode.value === 'auto' && !forceHa.value) {
        tryBrowserFallback()
        return
      }
      setError('未识别到语音')
      return
    }
    transcribing.value = true
    try {
      const blob = new Blob(audioChunks, { type: 'audio/webm' })
      const base64 = await blobToBase64(blob)
      const { data } = await transcribeVoice({ audio: base64, format: 'webm' })
      const text = String(data?.text || '').trim()
      if (text) {
        error.value = ''
        emitFinal(text)
      } else setError('未识别到语音')
    } catch (caughtError) {
      if (sttMode.value === 'auto' && !forceHa.value) {
        tryBrowserFallback()
        return
      }
      setError(getApiErrorMessage(caughtError, 'HA 识别失败。请在设置 → 语音中配置 STT 实体'))
    } finally {
      transcribing.value = false
      audioChunks = []
    }
  }

  function tryBrowserFallback() {
    const Ctor = getSpeechRecognitionCtor()
    if (!Ctor) {
      setError('HA 识别失败，且浏览器不支持语音识别')
      return
    }
    sttFallbackActive.value = true
    forceHa.value = false
    void startBrowserListen()
  }

  function startListen() {
    if (destroyed || listening.value || transcribing.value) return
    error.value = ''
    micGranted = false
    browserToHaTried = false
    forceHa.value = options.preferHa !== false
    if (sttMode.value === 'auto') sttFallbackActive.value = false
    if (usesHaStt.value || options.preferHa !== false) {
      void startHaRecording()
      return
    }
    void startBrowserListen()
  }

  function stopListen() {
    if (usesHaStt.value) {
      stopHaRecording()
      return
    }
    if (recognition) {
      try {
        recognition.stop()
      } catch (caughtError) {
        logger.debug('语音识别 stop 失败', caughtError)
      }
    }
    listening.value = false
  }

  function toggleListen() {
    if (listening.value || transcribing.value) stopListen()
    else startListen()
  }

  onUnmounted(() => {
    destroyed = true
    offConfig?.()
    offConfig = null
    stopListen()
    if (mediaRecorder?.stream) {
      mediaRecorder.stream.getTracks?.().forEach((track) => track.stop())
    }
  })

  return {
    listening,
    transcribing,
    transcript,
    error,
    status,
    sttMode,
    usesHaStt,
    startListen,
    stopListen,
    toggleListen,
  }
}

/** - 使用浏览器 SpeechRecognition 持续监听语音； */

/**
 * 轻量唤醒词监听 composable（VoiceCommand / Screensaver 共用）。
 *
 * 调用场景：需要唤醒词持续监听的组件初始化时调用。
 *
 * @param onCommand 识别到命令后的回调（参数为唤醒词后的命令文本）
 * @param options.enabled 是否启用的判定函数（动态读取，每次 start/scheduleRestart 时调用）
 * @param options.onError 错误回调（参数为错误消息）
 * @returns listening 是否监听中；lastError 最近错误；start/stop 控制方法
 */
export function useWakeWord(
  onCommand: (cmd: string) => void,
  options: {
    enabled?: () => boolean
    onError?: (msg: string) => void
  } = {},
) {
  // 是否正在监听中
  const listening = ref(false)
  // 最近一次错误消息（空字符串表示无错误）
  const lastError = ref('')
  let recognition: SpeechRecognition | null = null
  let restartTimer: ReturnType<typeof setTimeout> | null = null
  // 连续错误计数，达到 3 次后拉长重启间隔并提示用户
  let errorStreak = 0
  // 组件卸载标记：置位后 onend/start 不再自启监听（stop() 异步触发的 onend 也受其约束）
  let destroyed = false

  /**
   * 从识别文本中提取唤醒词之后的命令部分。
   * 匹配最长的唤醒词，取其后文本并去除前导标点/空格。
   *
   * @param text 识别文本
   * @param wakeWords 唤醒词列表
   * @returns 命令文本（无匹配则 null）
   */
  function extractCommandAfterWake(text: string | null | undefined, wakeWords: string[]) {
    const raw = String(text || '').trim()
    if (!raw || !wakeWords.length) return raw || null
    let best: { word: string; index: number } | null = null
    for (const word of wakeWords) {
      const w = String(word).trim()
      if (!w) continue
      const idx = raw.indexOf(w)
      if (idx === -1) continue
      // 取最长匹配，避免短唤醒词误匹配
      if (!best || w.length > best.word.length) best = { word: w, index: idx }
    }
    if (!best) return null
    return (
      raw
        .slice(best.index + best.word.length)
        .replace(/^[，,、\s]+/, '')
        .trim() || null
    )
  }

  /**
   * 将 SpeechRecognition 错误码映射为中文提示消息。
   * aborted 返回空字符串（不视为错误）。
   *
   * @param code 错误码
   * @returns 中文错误消息（空字符串表示不提示）
   */
  function mapWakeError(code: string) {
    if (code === 'not-allowed' || code === 'service-not-allowed') {
      return '麦克风权限被拒绝，请在浏览器设置中允许后重试，或改用长按说话'
    }
    if (code === 'audio-capture') return '未检测到麦克风，请检查设备后重试'
    if (code === 'network') return '语音识别网络异常，可改用长按说话'
    if (code === 'no-speech') return '未听到语音，请靠近麦克风或改用长按说话'
    if (code === 'aborted') return ''
    return '唤醒词识别失败，可改用长按说话'
  }

  /** 确保 SpeechRecognition 实例存在并绑定事件回调；返回实例或 null */
  function ensureRecognition() {
    const SpeechRecognitionCtor = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognitionCtor) {
      lastError.value = '浏览器不支持唤醒词识别，请改用长按说话'
      options.onError?.(lastError.value)
      return null
    }
    if (!recognition) {
      recognition = new SpeechRecognitionCtor()
      recognition.interimResults = true
      recognition.continuous = true
      recognition.onend = () => {
        // 已卸载时不再自启监听（stop() 异步触发的 onend 也走这里）
        if (destroyed) return
        listening.value = false
        // enabled 时自动重启以持续监听
        if (options.enabled?.()) scheduleRestart()
      }
      recognition.onerror = (ev: Event) => {
        listening.value = false
        const code = String((ev as Event & { error?: string })?.error || '')
        const msg = mapWakeError(code)
        if (msg) {
          errorStreak++
          // 连续失败 3 次后追加提示，建议改用长按说话
          lastError.value = errorStreak >= 3 ? `${msg}（已连续失败，建议改用长按说话）` : msg
          options.onError?.(lastError.value)
        }
        scheduleRestart()
      }
      recognition.onresult = (e: SpeechRecognitionEvent) => {
        // 成功识别重置错误计数
        errorStreak = 0
        lastError.value = ''
        const text = Array.from(e.results)
          .map((r) => r[0].transcript)
          .join('')
        const last = e.results[e.results.length - 1]
        if (!last?.isFinal) return
        const voice = getConfigSection('voice') || {}
        const wakeWords = normalizeWakeWords(voice)
        const cmd = extractCommandAfterWake(text, wakeWords)
        if (cmd) onCommand?.(cmd)
      }
    }
    const voice = getConfigSection('voice') || {}
    recognition.lang = String(voice.language || 'zh-CN')
    return recognition
  }

  /** 调度重启：连续失败时拉长重启间隔，降低无效重试 */
  function scheduleRestart() {
    if (!options.enabled?.()) return
    if (restartTimer) clearTimeout(restartTimer)
    // 连续失败时拉长重启间隔，降低无效重试
    const delay = errorStreak >= 3 ? 2500 : 500
    restartTimer = setTimeout(() => start(), delay)
  }

  /** 启动唤醒词监听：enabled 为 false 时不启动 */
  function start() {
    if (!options.enabled?.()) return
    const rec = ensureRecognition()
    if (!rec) return
    listening.value = true
    try {
      rec.start()
    } catch {
      // start 失败（如已启动）时调度重启
      scheduleRestart()
    }
  }

  /** 停止监听并清理重启定时器 */
  function stop() {
    if (restartTimer) clearTimeout(restartTimer)
    listening.value = false
    if (recognition) {
      try {
        recognition.stop()
      } catch {
        /* stop 失败忽略 */
      }
    }
  }

  onUnmounted(() => {
    // 先置销毁标记，确保 stop() 触发的 onend 不再自启监听
    destroyed = true
    stop()
  })

  return { listening, lastError, start, stop }
}
