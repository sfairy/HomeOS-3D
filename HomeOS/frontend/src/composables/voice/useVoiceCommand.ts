/**
 * @file useVoiceCommand.ts
 * @module composables/voice
 * @description 语音命令 composable：浏览器/HA 语音识别与命令执行。
 *
 * 职责：
 * - 支持 browser/ha/auto 三种 STT 模式，auto 模式下 HA 失败自动回退浏览器；
 * - 支持 push（按键说话）与 wake（唤醒词）两种交互模式；
 * - 唤醒词模式下持续监听，识别到唤醒词后提取命令并执行；
 * - 通过 quick-actions-bridge 匹配快捷动作（全屋关闭/分组打开等）；
 * - 调用 executeVoiceCommand API 执行命令，并通过 TTS 播报反馈；
 * - 监听 homeos:voice-wake 外部事件与配置变化，动态同步识别状态。
 *
 * 依赖：
 * - vue（ref/computed/onMounted/onUnmounted/watch）
 * - system API（transcribeVoice/executeVoiceCommand）
 * - frontend-config（getConfigSection/onConfigChange）
 * - voice-command-presets / voice-alert-catalog（房间标签与唤醒词规范化）
 * - useTtsSpeak（TTS 播报反馈）
 * - quick-actions-bridge（快捷动作匹配）
 * - layout.store + chrome.store / auth.store（权限与 UI 控制）
 * - home-batch-actions / whole-home-off（全屋关闭）
 * - error-message / logger（错误处理与日志）
 */
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { transcribeVoice, executeVoiceCommand } from '@/services/api/system'
import { agentChat } from '@/services/api/agent'
import { getConfigSection, onConfigChange } from '@/utils/config/frontend-config'
import { VOICE_ROOM_LABELS } from '@/constants/voice-command-presets'
import { normalizeWakeWords } from '@/constants/voice-alert-catalog'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { getPreferredAudioInputDeviceId } from '@/composables/voice/useAudioDevices'
import { matchQuickActionIntent } from '@/utils/bridge/quick-actions-bridge'
import { useLayoutStore } from '@/stores/layout.store'
import { useChromeStore } from '@/stores/chrome.store'
import { useAuthStore } from '@/stores/auth.store'
import { randomUUID } from '@/utils/core/random-uuid.util'
import { turnOffWholeHome } from '@/utils/home/batch-actions'
import {
  buildWholeHomeOffConfirmText,
  canUseWholeHomeOff,
  getWholeHomeOffConfig,
} from '@/constants/whole-home-off'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { logger } from '@/utils/core/logger'

/**
 * 语音命令 composable。
 *
 * 调用场景：语音命令面板组件初始化时调用，返回识别状态、反馈信息与控制方法。
 *
 * @returns listening/wakeListening/transcript/error/feedback 等状态与 startListen/stopListen 方法
 */
export function useVoiceCommand() {
  // 是否正在录音/识别中（push 模式）
  const listening = ref(false)
  // 是否正在唤醒词监听中（wake 模式）
  const wakeListening = ref(false)
  // 当前识别文本（含中间结果）
  const transcript = ref('')
  // 错误信息（自动清除）
  const error = ref('')
  // 反馈信息（命令执行结果，自动清除）
  const feedback = ref('')
  // 反馈是否成功
  const feedbackOk = ref(true)
  // STT 模式：browser/ha/auto
  const sttMode = ref('browser')
  // auto 模式下是否已回退到浏览器
  const sttFallbackActive = ref(false)
  // 是否使用 HA Conversation API
  const useHaConversation = ref(false)
  // 交互模式：push（按键）/wake（唤醒词）
  const interactionMode = ref('push')
  // 是否启用唤醒词
  const wakeWordEnabled = ref(false)
  // 唤醒词列表
  const wakeWords = ref<string[]>([])
  // 自定义语音命令配置
  const voiceCommandsCfg = ref<
    Array<{ phrase?: string; action?: string; phrases?: unknown; [key: string]: unknown }>
  >([])
  // 房间标签配置（默认取预设，可被配置覆盖）
  const voiceRoomsCfg = ref([...VOICE_ROOM_LABELS])
  // 是否启用连续对话（免重复唤醒）：唤醒后一段时间内无需再次唤醒，后续指令由后端上下文补全
  const continuousConversation = ref(false)
  // 连续对话是否处于激活窗口内（唤醒后到窗口超时前）
  const continuousActive = ref(false)
  // 当前连续对话会话 id（由后端按会话保存上下文）
  const continuousSessionId = ref('')
  // 免重复唤醒窗口：每次指令后顺延
  const CONTINUOUS_WINDOW_MS = 15000

  let recognition: SpeechRecognition | null = null
  let mediaRecorder: MediaRecorder | null = null
  let audioChunks: Blob[] = []
  let offConfig: (() => void) | null = null
  let wakeRestartTimer: ReturnType<typeof setTimeout> | null = null
  // 连续对话窗口定时器：超时后关闭免唤醒窗口并清空会话
  let continuousTimer: ReturnType<typeof setTimeout> | null = null
  // 组件卸载标记：置位后 onend/start 不再自启监听（stop() 异步触发的 onend 也受其约束）
  let destroyed = false

  // 待执行的定时器集合（组件卸载时统一清理）
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

  /**
   * 受管理的定时器：执行后自动从 pendingTimers 移除，便于卸载时统一清理。
   *
   * @param fn 回调函数
   * @param ms 延迟毫秒
   * @returns 定时器 ID
   */
  function managedTimeout(fn: () => void, ms: number) {
    const id = setTimeout(() => {
      pendingTimers.delete(id)
      fn()
    }, ms)
    pendingTimers.add(id)
    return id
  }

  const { speak } = useTtsSpeak()
  const layoutStore = useLayoutStore()
  const chrome = useChromeStore()
  const authStore = useAuthStore()

  // 唤醒词显示标签：无则显示“小智”；2 个以内用 / 分隔；超过则显示前 2 个 + “等”
  const wakeWordsLabel = computed(() => {
    const list = wakeWords.value
    if (!list.length) return '小智'
    if (list.length <= 2) return list.join(' / ')
    return `${list.slice(0, 2).join(' / ')} ${'等'}`
  })

  // 是否为唤醒词模式：wake + 启用唤醒词 + STT 模式为 browser 或 auto
  const isWakeMode = computed(
    () =>
      interactionMode.value === 'wake' &&
      wakeWordEnabled.value &&
      (sttMode.value === 'browser' || sttMode.value === 'auto'),
  )

  /** 判断是否使用 HA STT（ha 或 auto 模式且未回退） */
  function usesHaStt() {
    return (sttMode.value === 'ha' || sttMode.value === 'auto') && !sttFallbackActive.value
  }

  // STT 模式徽章标签：auto 显示是否已回退，ha/browser 显示对应名称
  const sttModeBadgeLabel = computed(() => {
    if (sttMode.value === 'auto') {
      return sttFallbackActive.value ? '浏览器识别 (回退)' : '自动 · HA 识别'
    }
    if (sttMode.value === 'ha') return 'HA 语音识别'
    return '浏览器识别'
  })
  // 提示短语：从自定义命令中取前 3 条，唤醒词模式加唤醒词前缀，否则加房间前缀
  const hintPhrases = computed(() => {
    const phrases: string[] = []

    for (const cmd of voiceCommandsCfg.value) {
      const cmdPhrases = Array.isArray(cmd.phrases) ? cmd.phrases : []
      for (const p of cmdPhrases) {
        const t = String(p).trim()
        if (t && !phrases.includes(t)) phrases.push(t)
        if (phrases.length >= 3) break
      }
      if (phrases.length >= 3) break
    }

    if (phrases.length) {
      const room = voiceRoomsCfg.value[0]
      const sample = phrases[0]

      if (isWakeMode.value) {
        const w = wakeWords.value[0] || '小智'
        return [`${w}，${sample}`, ...(room ? [`${w}，${room}${sample}`] : [])].slice(0, 3)
      }

      if (room && sample) phrases.push(`${room}${sample}`)
      return phrases.slice(0, 4)
    }

    // 无自定义命令时提供默认提示
    const room = voiceRoomsCfg.value[0] || '客厅'

    if (isWakeMode.value) {
      const w = wakeWords.value[0] || '小智'
      return [`${w}，${'开灯'}`, `${w}，${'关灯'}`]
    }

    return ['开灯', '关灯', '开空调', `${room}${'开灯'}`]
  })

  // 完整命令清单：将 voiceCommandsCfg 规整为「短语 → 动作」的完整列表，供语音面板「可用命令清单」使用。
  // 来源：配置区 voiceCommands（getConfigSection('voiceCommands')），元素形如
  // { phrase?, action?, phrases?, domain?, service? }；兼容单条 phrase 与数组 phrases 两种写法，
  // 短语展开去重并过滤空项；动作描述优先取 action 字段，缺失时按 domain.service 组合。
  const commands = computed(() => {
    const list: Array<{ phrases: string[]; action: string }> = []

    for (const cmd of voiceCommandsCfg.value) {
      if (!cmd || typeof cmd !== 'object') continue
      const raw = Array.isArray(cmd.phrases)
        ? cmd.phrases
        : typeof cmd.phrase === 'string' && cmd.phrase.trim()
          ? [cmd.phrase]
          : []
      const phrases: string[] = []
      for (const p of raw) {
        const t = String(p).trim()
        if (t && !phrases.includes(t)) phrases.push(t)
      }
      if (!phrases.length) continue

      const domain = typeof cmd.domain === 'string' ? cmd.domain.trim() : ''
      const service = typeof cmd.service === 'string' ? cmd.service.trim() : ''
      const action =
        String(cmd.action || '').trim() || (domain && service ? `${domain}.${service}` : '')

      list.push({ phrases, action })
    }

    return list
  })

  /** 同步语音配置：从配置文件读取 STT 模式/交互模式/唤醒词/命令/房间等 */
  function syncVoiceConfig() {
    const voice = getConfigSection('voice') || {}

    sttMode.value = voice.sttMode === 'ha' ? 'ha' : voice.sttMode === 'auto' ? 'auto' : 'browser'
    sttFallbackActive.value = false
    useHaConversation.value = !!voice.useHaConversation
    interactionMode.value = voice.interactionMode === 'wake' ? 'wake' : 'push'
    wakeWordEnabled.value = !!voice.wakeWordEnabled
    continuousConversation.value = !!voice.continuousConversation
    wakeWords.value = normalizeWakeWords(voice)
    voiceCommandsCfg.value = (getConfigSection('voiceCommands') || []) as Array<{
      phrase?: string
      action?: string
      phrases?: unknown
      [key: string]: unknown
    }>

    const rooms = voice.rooms
    voiceRoomsCfg.value = Array.isArray(rooms) && rooms.length ? rooms : [...VOICE_ROOM_LABELS]

    syncWakeListener()
  }

  /**
   * 从识别文本中提取唤醒词之后的命令部分。
   * 匹配最长的唤醒词，取其后文本并去除前导标点/空格。
   *
   * @param text 识别文本
   * @returns 命令文本（无匹配则 null）
   */
  function extractCommandAfterWake(text: string) {
    const raw = String(text || '').trim()
    const words = wakeWords.value
    if (!raw || !words.length) return raw || null
    let best: { word: string; index: number } | null = null
    for (const word of words) {
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

  /** 确保 SpeechRecognition 实例存在并绑定事件回调；返回实例或 null */
  function ensureRecognition() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return null

    if (!recognition) {
      recognition = new SpeechRecognition()
      recognition.lang = String(getConfigSection('voice')?.language || 'zh-CN')
      recognition.interimResults = true

      recognition.onerror = (ev: Event) => {
        listening.value = false
        wakeListening.value = false

        const code = String((ev as Event & { error?: string })?.error || '')
        let msg = '识别失败，请重试'
        if (code === 'not-allowed' || code === 'service-not-allowed') {
          msg = '麦克风权限被拒绝，请允许后重试或改用长按说话'
        } else if (code === 'network') {
          msg = '语音识别网络异常，可改用长按说话'
        } else if (code === 'no-speech') {
          msg = '未听到语音，请靠近麦克风或改用长按说话'
        } else if (code === 'aborted') {
          msg = ''
        } else if (isWakeMode.value) {
          msg = '唤醒词识别失败，可改用长按说话'
        }

        if (msg) {
          error.value = msg
          managedTimeout(() => {
            error.value = ''
          }, 4000)
        }
      }

      recognition.onend = () => {
        // 已卸载时不再自启监听（stop() 异步触发的 onend 也走这里）
        if (destroyed) return
        listening.value = false

        // 唤醒词模式：结束后自动重启以持续监听
        if (isWakeMode.value) {
          wakeListening.value = false
          restartWakeSoon()
        }
      }
    }

    recognition.lang = String(getConfigSection('voice')?.language || 'zh-CN')
    recognition.continuous = isWakeMode.value

    recognition.onresult = (e: SpeechRecognitionEvent) => {
      const text = Array.from(e.results)
        .map((r) => r[0].transcript)
        .join('')
      transcript.value = text

      const last = e.results[e.results.length - 1]
      if (!last?.isFinal) return

      if (isWakeMode.value) {
        // 唤醒词模式：提取命令并执行
        const cmd = extractCommandAfterWake(text)
        transcript.value = cmd ? `「${cmd}」` : ''

        if (cmd) {
          // 唤醒词命中：开启新一轮连续对话会话（启用连续对话时）
          startContinuousSession()
          void executeCommand(cmd)
        } else if (continuousConversation.value && continuousActive.value) {
          // 连续对话窗口内：免重复唤醒，直接作为后续指令交给管家（由后端上下文补全实体/意图）
          const followUp = String(text || '').trim()
          if (followUp) {
            resetContinuousTimer()
            transcript.value = `「${followUp}」`
            void executeCommand(followUp)
          }
        } else {
          managedTimeout(() => {
            transcript.value = ''
          }, 1500)
        }

        return
      }

      void executeCommand(text)
      transcript.value = ''
    }

    return recognition
  }
  /** 延迟重启唤醒词监听（400ms 后） */
  function restartWakeSoon() {
    if (!isWakeMode.value) return
    clearTimeout(wakeRestartTimer!)
    wakeRestartTimer = setTimeout(() => startWakeListening(), 400)
  }

  /**
   * 开启新一轮连续对话会话：生成新会话 id 并进入免唤醒窗口。
   * 未启用连续对话时不生效（保持原有唤醒词行为）。
   */
  function startContinuousSession() {
    if (!continuousConversation.value) return
    continuousSessionId.value = randomUUID()
    continuousActive.value = true
    resetContinuousTimer()
  }

  /** 重置免唤醒窗口定时器：每次指令后顺延，超时后关闭窗口并清空会话 */
  function resetContinuousTimer() {
    if (continuousTimer) clearTimeout(continuousTimer)
    continuousTimer = setTimeout(() => {
      continuousTimer = null
      continuousActive.value = false
      continuousSessionId.value = ''
    }, CONTINUOUS_WINDOW_MS)
  }

  /** 关闭连续对话会话（卸载 / 停止监听时清理窗口与上下文） */
  function closeContinuousSession() {
    if (continuousTimer) clearTimeout(continuousTimer)
    continuousTimer = null
    continuousActive.value = false
    continuousSessionId.value = ''
  }

  /** 启动唤醒词持续监听 */
  function startWakeListening() {
    if (!isWakeMode.value) return

    const rec = ensureRecognition()
    if (!rec) {
      error.value = '浏览器不支持唤醒词识别'
      return
    }

    error.value = ''
    wakeListening.value = true
    try {
      rec.start()
    } catch {
      restartWakeSoon()
    }
  }

  /** 停止唤醒词监听并清理重启定时器 */
  function stopWakeListening() {
    clearTimeout(wakeRestartTimer!)
    wakeListening.value = false

    if (recognition) {
      try {
        recognition.stop()
      } catch (e) {
        logger.debug('语音识别 stop 失败', e)
      }
    }
  }

  /** 根据当前模式同步唤醒词监听器：wake 模式启动，否则停止 */
  function syncWakeListener() {
    if (isWakeMode.value) startWakeListening()
    else stopWakeListening()
  }

  watch(isWakeMode, () => syncWakeListener())

  /** 外部唤醒事件回调：滚动到语音面板并短暂显示命令文本 */
  function onExternalWake(e: Event) {
    const cmd = (e as CustomEvent)?.detail?.cmd
    if (cmd) {
      transcript.value = `「${cmd}」`
      managedTimeout(() => {
        transcript.value = ''
      }, 2800)
    }
    try {
      document.querySelector('.vc-root')?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    } catch {
      /* 滚动失败忽略 */
    }
  }

  onMounted(() => {
    syncVoiceConfig()
    offConfig = onConfigChange(syncVoiceConfig)
    window.addEventListener('homeos:voice-wake', onExternalWake)
  })

  onUnmounted(() => {
    // 先置销毁标记，确保 stop() 触发的 onend 不再自启监听
    destroyed = true
    offConfig?.()
    closeContinuousSession()
    stopWakeListening()
    stopListen()
    window.removeEventListener('homeos:voice-wake', onExternalWake)
    for (const id of pendingTimers) clearTimeout(id)
    pendingTimers.clear()
  })

  /** 开始录音/识别：HA 模式走录音上传，浏览器模式走 SpeechRecognition */
  function startListen() {
    if (destroyed) return
    error.value = ''
    feedback.value = ''
    if (sttMode.value === 'auto') sttFallbackActive.value = false

    if (usesHaStt()) {
      startHaRecording()
      return
    }

    const rec = ensureRecognition()
    if (!rec) {
      error.value = '浏览器不支持语音识别'
      return
    }

    recognition!.continuous = false
    listening.value = true
    transcript.value = ''

    try {
      rec.start()
    } catch (e) {
      logger.debug('语音识别 start 失败', e)
      listening.value = false
      transcript.value = '麦克风不可用'
    }
  }

  /** 停止录音/识别 */
  function stopListen() {
    if (usesHaStt()) {
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

  /** 启动 HA 录音：通过 MediaRecorder 采集音频，停止后上传识别 */
  async function startHaRecording() {
    if (!navigator.mediaDevices?.getUserMedia) {
      error.value = '无法访问麦克风'
      return
    }

    try {
      const preferredId = getPreferredAudioInputDeviceId()
      const audioConstraint: boolean | MediaTrackConstraints = preferredId
        ? { deviceId: { exact: preferredId } }
        : true
      let stream: MediaStream
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraint })
      } catch (firstErr) {
        // 指定设备不可用时回退默认麦克风
        if (preferredId) {
          logger.debug('指定麦克风不可用,回退默认', firstErr)
          stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        } else {
          throw firstErr
        }
      }
      audioChunks = []
      mediaRecorder = new MediaRecorder(stream)

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunks.push(e.data)
      }

      mediaRecorder.onstop = () => void uploadHaAudio()
      mediaRecorder.start()
      listening.value = true
      transcript.value = '录音中…'
    } catch {
      error.value = '麦克风权限被拒绝'
      listening.value = false
    }
  }

  /** 停止 HA 录音并释放媒体流轨道 */
  function stopHaRecording() {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.stop()
      mediaRecorder.stream?.getTracks?.().forEach((t) => t.stop())
    }

    listening.value = false
  }

  /** 上传 HA 录音音频并执行识别结果命令 */
  async function uploadHaAudio() {
    if (!audioChunks.length) return

    transcript.value = '识别中…'

    try {
      const blob = new Blob(audioChunks, { type: 'audio/webm' })
      const base64 = await blobToBase64(blob)

      const { data } = await transcribeVoice({
        audio: base64,
        format: 'webm',
      })

      const text = data?.text || ''
      transcript.value = text

      if (text) await executeCommand(text)
      else error.value = '未识别到语音'
    } catch (e) {
      error.value = getApiErrorMessage(e, 'HA 识别失败，可改用浏览器模式')
      tryBrowserFallback()
    } finally {
      managedTimeout(() => {
        transcript.value = ''
      }, 2000)
    }
  }

  /** 回退到浏览器识别：auto 模式标记回退，ha 模式切换为 browser */
  async function tryBrowserFallback() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SpeechRecognition) return

    if (sttMode.value === 'auto') {
      sttFallbackActive.value = true
      feedback.value = 'HA 识别失败，已回退浏览器'
      feedbackOk.value = true
      managedTimeout(() => startListen(), 300)
      return
    }

    sttMode.value = 'browser'
    feedback.value = '已回退浏览器识别'
    feedbackOk.value = true
    managedTimeout(() => startListen(), 300)
  }

  /** Blob 转 Base64（去除 data: 前缀） */
  function blobToBase64(blob: Blob) {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onloadend = () => resolve(String(reader.result).split(',')[1] || '')
      reader.onerror = reject
      reader.readAsDataURL(blob)
    })
  }

  /**
   * 连续对话：调用智能管家对话接口，携带会话 id，
   * 由后端基于上一轮实体 / 意图补全当前指令（如「开灯」后「再调暗一点」）。
   * 执行结果通过 feedback 反馈，并按配置 TTS 播报。
   *
   * @param text 本轮指令文本
   */
  async function executeAgentTurn(text: string) {
    const sessionId = continuousSessionId.value
    feedback.value = '思考中…'
    feedbackOk.value = true
    const ttsEnabled = getConfigSection('voice')?.ttsEnabled !== false
    try {
      const res = await agentChat(text, undefined, sessionId)
      const reply = String(res?.reply || '').trim()
      const outcome = res?.outcome || 'failed'
      const say = (msg: string): Promise<{ ok: boolean; message: string }> =>
        ttsEnabled ? speak(msg) : Promise.resolve({ ok: true, message: '' })

      if (outcome === 'success') {
        feedbackOk.value = true
        feedback.value = reply || '已执行'
        if (res?.speak && reply) await say(reply)
        else if (!reply) await say('已执行')
      } else if (outcome === 'answer') {
        feedbackOk.value = true
        feedback.value = reply || '好的'
        if (reply) await say(reply)
      } else {
        feedbackOk.value = false
        feedback.value = reply || (outcome === 'blocked' ? '操作已被安全策略拦截' : '未能完成，请换个说法')
        await say(feedback.value)
      }
    } catch (e) {
      feedbackOk.value = false
      feedback.value = getApiErrorMessage(e, '命令执行失败')
      if (ttsEnabled) await speak(feedback.value)
    } finally {
      managedTimeout(() => {
        feedback.value = ''
      }, 2800)
    }
  }

  /**
   * 执行语音命令：先匹配快捷动作（全屋关闭/分组打开），否则调用后端 executeVoiceCommand。
   * 执行结果通过 feedback 反馈，并按配置 TTS 播报。
   *
   * @param text 命令文本
   */
  async function executeCommand(text: string) {
    // 连续对话会话中：本轮指令（唤醒首句或窗口内后续句）统一走智能管家，
    // 携带会话 id，由后端基于上文实体 / 意图补全执行
    if (isWakeMode.value && continuousConversation.value && continuousSessionId.value) {
      await executeAgentTurn(text)
      return
    }

    const intent = matchQuickActionIntent(text)

    // 全屋关闭意图：校验权限与配置，确认后执行批量关闭
    if (intent?.type === 'all-off') {
      if (!canUseWholeHomeOff(authStore.role, layoutStore.layoutConfig)) {
        feedbackOk.value = false
        feedback.value = '全屋关闭未启用或当前账户无权限'
        if (getConfigSection('voice')?.ttsEnabled !== false) await speak(feedback.value)
        managedTimeout(() => {
          feedback.value = ''
        }, 2800)
        return
      }

      const cfg = getWholeHomeOffConfig(layoutStore.layoutConfig)
      if (!cfg.lights && !cfg.covers && !cfg.climate && !cfg.switches) {
        feedbackOk.value = false
        feedback.value = '当前未启用任何关闭域，无法执行。'
        if (getConfigSection('voice')?.ttsEnabled !== false) await speak(feedback.value)
        managedTimeout(() => {
          feedback.value = ''
        }, 2800)
        return
      }

      // 二次确认（危险操作）
      const confirmMsg = buildWholeHomeOffConfirmText(cfg)
      const confirmed = await chrome.confirm(confirmMsg, '全屋关闭', {
        type: 'danger',
        confirmText: '全屋关闭',
      })
      if (!confirmed) return

      const { total, ok, failed } = await turnOffWholeHome()
      feedbackOk.value = failed === 0
      feedback.value = failed ? `部分失败 ${failed}/${total}` : `已关闭 ${ok} 个设备`

      if (getConfigSection('voice')?.ttsEnabled !== false) {
        await speak(feedback.value)
      }

      managedTimeout(() => {
        feedback.value = ''
      }, 2800)
      return
    }

    // 分组打开意图：直接打开对应分组弹窗
    if (intent?.type === 'group' && intent.group) {
      chrome.openGroupModal(intent.group)
      feedbackOk.value = true
      feedback.value = `已打开${intent.group}分组`
      if (getConfigSection('voice')?.ttsEnabled !== false) await speak(feedback.value)
      managedTimeout(() => {
        feedback.value = ''
      }, 2800)
      return
    }

    // 通用命令：调用后端 executeVoiceCommand 执行
    try {
      const { data } = await executeVoiceCommand(text)

      feedbackOk.value = !!data?.ok
      feedback.value = data?.message || (data?.ok ? '已执行' : '未匹配命令')

      if (getConfigSection('voice')?.ttsEnabled !== false) {
        await speak(feedback.value)
      }

      managedTimeout(() => {
        feedback.value = ''
      }, 2800)
    } catch (e) {
      feedbackOk.value = false
      feedback.value = getApiErrorMessage(e, '命令执行失败')

      if (getConfigSection('voice')?.ttsEnabled !== false) {
        await speak(feedback.value)
      }

      managedTimeout(() => {
        feedback.value = ''
      }, 3000)
    }
  }

  return {
    listening,
    wakeListening,
    transcript,
    error,
    feedback,
    feedbackOk,
    sttMode,
    sttFallbackActive,
    wakeWordsLabel,
    isWakeMode,
    usesHaStt,
    sttModeBadgeLabel,
    useHaConversation,
    hintPhrases,
    commands,
    continuousConversation,
    continuousActive,
    continuousSessionId,
    startListen,
    stopListen,
  }
}