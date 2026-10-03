/**
 * @file useWakeWord.ts
 * @module composables/voice
 * @description 轻量唤醒词监听 composable（VoiceCommand / Screensaver 共用）。
 *
 * 职责：
 * - 使用浏览器 SpeechRecognition 持续监听语音；
 * - 检测唤醒词后提取后续命令并回调；
 * - 连续失败时拉长重启间隔并提示用户改用长按说话；
 * - 通过 enabled 回调动态控制启停，卸载时自动清理。
 *
 * 依赖：
 * - vue（ref/onUnmounted）
 * - frontend-config（getConfigSection 读取 voice 配置）
 * - voice-alert-catalog（normalizeWakeWords 规范化唤醒词）
 */
import { ref, onUnmounted } from 'vue'
import { getConfigSection } from '@/utils/config/frontend-config'
import { normalizeWakeWords } from '@/constants/voice-alert-catalog'

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