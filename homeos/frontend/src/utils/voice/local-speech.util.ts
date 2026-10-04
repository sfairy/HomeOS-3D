/**
 * 浏览器本机 SpeechSynthesis TTS 工具
 *
 * 职责：封装 Web Speech API 播报（中文女声优选、Chrome resume 规避、静默失败检测）。
 * 供 useTtsSpeak、地震预警等共用，避免两套本机 TTS。
 */
import { logger } from '@/utils/core/logger'

/** 偏好的中文女声 voice 关键字（按优先级排序） */
const PREFERRED_VOICE_KEYS = [
  'xiaoxiao',
  'yaoyao',
  'hanhan',
  'yating',
  'tingting',
  'ting-ting',
  'mei-jia',
]

/** 本地 TTS 静默失败判定窗口（毫秒） */
const SILENT_FAIL_MS = 800
/** 等待 voices 加载的默认超时（毫秒） */
const DEFAULT_VOICE_LOAD_TIMEOUT_MS = 1500

/** 缓存选中的中文女声 */
let selectedVoice: SpeechSynthesisVoice | null = null
/** 当前正在播报的 utterance（cancel 时清理） */
let activeUtterance: SpeechSynthesisUtterance | null = null

type SpeakLocalResult = { ok: boolean; message: string }

/**
 * 浏览器是否支持本机 SpeechSynthesis。
 */
function isLocalSpeechSupported(): boolean {
  if (typeof window === 'undefined') return false
  return typeof window.speechSynthesis !== 'undefined' && typeof SpeechSynthesisUtterance !== 'undefined'
}

/**
 * 获取 SpeechSynthesis 实例。
 */
export function getSpeechSynth(): SpeechSynthesis | null {
  if (!isLocalSpeechSupported()) return null
  return window.speechSynthesis
}

/**
 * 获取当前已加载的 voices（可能为空，需 waitForVoices）。
 */
export function getLoadedVoices(): SpeechSynthesisVoice[] {
  const synth = getSpeechSynth()
  if (!synth) return []
  return synth.getVoices()
}

/**
 * 选择最佳中文女声。
 */
function pickChineseVoice(): SpeechSynthesisVoice | null {
  const voices = getLoadedVoices()
  if (!voices.length) return null
  const preferred = PREFERRED_VOICE_KEYS
  const zh = voices.filter((v) => v.lang.startsWith('zh'))
  return (
    zh.find(
      (v) =>
        preferred.some((k) => v.name.toLowerCase().includes(k)) && /Natural|Online/i.test(v.name),
    ) ||
    zh.find((v) => preferred.some((k) => v.name.toLowerCase().includes(k)) && v.localService) ||
    zh.find((v) => preferred.some((k) => v.name.toLowerCase().includes(k))) ||
    zh.find((v) => v.localService && v.lang.startsWith('zh')) ||
    zh[0] ||
    null
  )
}

/** Chrome 15 秒 bug：定期 pause/resume 保持活跃 */
function resumeSpeechSynthesis() {
  const synth = getSpeechSynth()
  if (!synth) return
  if (synth.speaking && !synth.paused) {
    synth.pause()
    synth.resume()
  }
}

/**
 * 等待 voices 加载；超时返回当前列表（可能为空）。
 */
export function waitForVoices(timeoutMs = DEFAULT_VOICE_LOAD_TIMEOUT_MS): Promise<SpeechSynthesisVoice[]> {
  return new Promise((resolve) => {
    const current = getLoadedVoices()
    if (current.length > 0) {
      resolve(current)
      return
    }

    const synth = getSpeechSynth()
    if (!synth) {
      resolve([])
      return
    }

    let resolved = false
    const done = (voices: SpeechSynthesisVoice[]) => {
      if (resolved) return
      resolved = true
      synth.onvoiceschanged = null
      resolve(voices)
    }

    const timer = setTimeout(() => done(getLoadedVoices()), timeoutMs)
    synth.onvoiceschanged = () => {
      clearTimeout(timer)
      done(getLoadedVoices())
    }
  })
}

/**
 * 取消本机播报并清理回调。
 */
export function cancelLocalSpeech() {
  if (activeUtterance) {
    activeUtterance.onend = null
    activeUtterance.onerror = null
    activeUtterance.onstart = null
    activeUtterance = null
  }
  getSpeechSynth()?.cancel()
}

/**
 * 重置缓存的 voice 选择（设置变更后可调用）。
 */
export function resetLocalSpeechVoice() {
  selectedVoice = null
}

type SpeakLocalOptions = {
  /** 语速，默认 1 */
  rate?: number
  /** 音调，默认 1 */
  pitch?: number
  /** 音量 0–1，默认 0.9 */
  volume?: number
  /** 语言，默认 zh-CN */
  lang?: string
  /** 等待 voices 超时 ms */
  voiceLoadTimeoutMs?: number
  /** 静默失败检测窗口 ms；0 表示不等待探测 */
  silentFailMs?: number
}

/**
 * 本机 SpeechSynthesis 播报。
 * 含 Chrome resume 规避与静默失败检测。
 */
export async function speakLocal(
  text: string,
  opts: SpeakLocalOptions = {},
): Promise<SpeakLocalResult> {
  const trimmed = String(text || '').trim()
  if (!trimmed) return { ok: false, message: '请输入播报内容' }

  if (!isLocalSpeechSupported()) {
    return { ok: false, message: '浏览器不支持本机语音播报' }
  }

  const synth = getSpeechSynth()!
  const voiceLoadTimeoutMs = opts.voiceLoadTimeoutMs ?? DEFAULT_VOICE_LOAD_TIMEOUT_MS
  const silentFailMs = opts.silentFailMs ?? SILENT_FAIL_MS

  const voices = await waitForVoices(voiceLoadTimeoutMs)
  if (!voices.length) {
    return { ok: false, message: '本机无可用语音引擎' }
  }

  cancelLocalSpeech()
  resumeSpeechSynthesis()

  if (!selectedVoice) selectedVoice = pickChineseVoice()

  return new Promise((resolve) => {
    const utter = new SpeechSynthesisUtterance(trimmed)
    if (selectedVoice) utter.voice = selectedVoice
    utter.lang = opts.lang || 'zh-CN'
    utter.rate = opts.rate ?? 1
    utter.pitch = opts.pitch ?? 1
    utter.volume = opts.volume ?? 0.9

    let started = false
    let settled = false
    let detectTimer: ReturnType<typeof setTimeout> | null = null

    const finish = (result: SpeakLocalResult) => {
      if (settled) return
      settled = true
      if (detectTimer != null) {
        clearTimeout(detectTimer)
        detectTimer = null
      }
      if (activeUtterance === utter) activeUtterance = null
      resolve(result)
    }

    utter.onstart = () => {
      started = true
    }
    utter.onend = () => {
      finish({ ok: true, message: '本机播报完成' })
    }
    utter.onerror = (e) => {
      if (e.error === 'canceled') {
        finish({ ok: false, message: '播报已取消' })
        return
      }
      logger.debug('本机 TTS 报错', e.error)
      finish({ ok: false, message: '本机播报失败' })
    }

    activeUtterance = utter
    synth.speak(utter)
    setTimeout(() => resumeSpeechSynthesis(), 3000)

    if (silentFailMs > 0) {
      detectTimer = setTimeout(() => {
        detectTimer = null
        if (settled || started) return
        logger.debug('本机 TTS 静默失败')
        synth.cancel()
        finish({ ok: false, message: '本机播报无响应' })
      }, silentFailMs)
    }
  })
}

/**
 * 低层本机播报（地震预警用）：立即 speak，返回 utterance 与 hasStarted。
 * 调用方自行挂 onend/onerror 与静默失败检测。
 */
export function speakViaLocalRaw(
  text: string,
  rate: number,
): { utter: SpeechSynthesisUtterance; hasStarted: () => boolean } | null {
  const synth = getSpeechSynth()
  if (!synth || typeof SpeechSynthesisUtterance === 'undefined') return null

  resumeSpeechSynthesis()

  const utter = new SpeechSynthesisUtterance(text)
  if (!selectedVoice) selectedVoice = pickChineseVoice()
  if (selectedVoice) utter.voice = selectedVoice
  utter.lang = 'zh-CN'
  utter.rate = rate
  utter.pitch = 1.15
  utter.volume = 0.9

  let started = false
  utter.onstart = () => {
    started = true
  }
  synth.speak(utter)
  setTimeout(() => resumeSpeechSynthesis(), 3000)

  activeUtterance = utter
  return { utter, hasStarted: () => started }
}
