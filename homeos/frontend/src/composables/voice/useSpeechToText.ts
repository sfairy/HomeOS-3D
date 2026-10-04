/**
 * @file useSpeechToText.ts
 * @module composables/voice
 * @description 点按说话的语音转写（不执行命令）。
 *
 * 职责：
 * - 按设置 voice.sttMode 走浏览器 Web Speech、HA STT 或自动回退；
 * - 先 getUserMedia 申请麦克风，再启动识别，避免 Chrome 直接报 not-allowed；
 * - 浏览器在线识别失败（墙 / 非 HTTPS）时回退 HA 录音转写。
 */
import { computed, onUnmounted, ref } from 'vue'
import { transcribeVoice } from '@/services/api/system'
import { getConfigSection, onConfigChange } from '@/utils/config/frontend-config'
import {
  isEmbeddedBrowser,
  openAudioInputStream,
  probeMicrophone,
} from '@/composables/voice/useAudioDevices'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'

export type SttMode = 'browser' | 'ha' | 'auto'

function resolveSttMode(raw: unknown): SttMode {
  if (raw === 'ha' || raw === 'auto') return raw
  return 'browser'
}

function isSecureMicContext() {
  return typeof window !== 'undefined' && window.isSecureContext
}

function insecureMicMessage() {
  return '当前不是安全连接（需 HTTPS 或 localhost），浏览器会拦截麦克风。请改用 https 访问后再试'
}

async function explainOpenMicFailure(err: unknown) {
  if (!isSecureMicContext()) return insecureMicMessage()
  const name = err instanceof DOMException ? err.name : String((err as { name?: string })?.name || '')
  if (name === 'NotAllowedError' || name === 'PermissionDeniedError' || name === 'SecurityError') {
    return '麦克风权限被拒绝。请点击地址栏左侧锁图标，将「麦克风」改为允许，然后刷新再试'
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return '麦克风被其他应用占用，请关闭后重试'
  }
  const probe = await probeMicrophone(err)
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

export function useSpeechToText(options: {
  onInterim?: (text: string) => void
  onFinal?: (text: string) => void
  /** 默认 true：先本地录音走 HA STT，浏览器在线识别仅作回退 */
  preferHa?: boolean
} = {}) {
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
    () =>
      forceHa.value ||
      ((sttMode.value === 'ha' || sttMode.value === 'auto') && !sttFallbackActive.value),
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
    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('')
      emitInterim(text)
      const last = e.results[e.results.length - 1]
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
        mapBrowserError(code, micGranted) ||
          '浏览器识别不可用。请在设置 → 语音中将识别引擎改为 HA，并配置 STT 实体',
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
    } catch (e) {
      logger.debug('语音识别 start 失败', e)
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
      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }
      mediaRecorder.onstop = () => void uploadHaAudio()
      mediaRecorder.start()
      error.value = browserToHaTried ? '浏览器识别不可用，请再说一次，说完再点麦克风' : ''
      transcript.value = ''
      listening.value = true
    } catch (e) {
      if (sttMode.value === 'auto' && !forceHa.value) {
        sttFallbackActive.value = true
        await startBrowserListen()
        return
      }
      setError(await explainOpenMicFailure(e))
      listening.value = false
    }
  }

  function stopHaRecording() {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop()
      mediaRecorder.stream?.getTracks?.().forEach((t) => t.stop())
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
    } catch (e) {
      if (sttMode.value === 'auto' && !forceHa.value) {
        tryBrowserFallback()
        return
      }
      setError(getApiErrorMessage(e, 'HA 识别失败。请在设置 → 语音中配置 STT 实体'))
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
      } catch (e) {
        logger.debug('语音识别 stop 失败', e)
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
      mediaRecorder.stream.getTracks?.().forEach((t) => t.stop())
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
