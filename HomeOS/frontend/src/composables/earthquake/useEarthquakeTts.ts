/**
 * 地震预警语音播报（TTS）模块
 *
 * 所属模块：composables/earthquake
 * 职责：在地震预警倒计时阶段执行分级语音播报——长相位（>15 秒）每 15 秒/循环播报完整预警文案，
 *      短相位（0~15 秒）每秒播报倒计时，横波到达时触发蜂鸣警示音与到达提示；
 *      TTS 模式优先浏览器本地 SpeechSynthesis，本地静默失败或无语音时自动回退到后端 HA 媒体播放器播报。
 * 状态机：ttsMode 'unknown' → 首次探测 → 'local' 或 'backend'；本地连续失败 2 次切换后端。
 * 内部副作用：使用模块级共享定时器与状态变量，同一时刻仅应存在一个活动实例；卸载调用 stopSpeech 清理。
 */
import { watch, onUnmounted } from 'vue'
import type { Ref } from 'vue'
import type { EarthquakeAlertPayload } from '@/types/earthquake'
import { speakVoiceMultiple } from '@/services/api/system'
import { useEntitiesStore } from '@/stores/entities.store'
import { resolveTtsMediaPlayerIds } from '@/utils/voice/resolve-tts-media-players.util'
import { logger } from '@/utils/core/logger'
import {
  cancelLocalSpeech,
  getLoadedVoices,
  getSpeechSynth,
  resetLocalSpeechVoice,
  speakViaLocalRaw,
  waitForVoices,
} from '@/utils/voice/local-speech.util'

/**
 * 地震预警 TTS（文本转语音）模块
 *
 * 模块职责：
 *  - 在地震预警倒计时阶段进行语音播报（震级、横波到达倒计时、烈度等）；
 *  - 优先使用浏览器本地 SpeechSynthesis API，失败时回退到后端 HA 媒体播放器播报；
 *  - 自动探测 TTS 模式（local/backend），避免每次播报都做静默失败的判定开销。
 *
 * 依赖：
 *  - @/utils/voice/local-speech.util（本机 SpeechSynthesis）；
 *  - @/services/api/system 的 speakVoiceMultiple（后端 TTS）；
 *  - @/utils/voice/resolve-tts-media-players.util 解析媒体播放器 entity_id。
 *
 * 注意：
 *  - 模块级变量（loopTimer 等）在多个 composable 调用之间共享，
 *    因此同一时刻只应有一个 useEarthquakeTts 实例处于活动状态。
 */

/** 本地 TTS 静默失败判定窗口（毫秒） */
const SILENT_FAIL_MS = 800
/** 等待 voices 加载的超时时间（毫秒）：地震预警场景不能等太久 */
const VOICE_LOAD_TIMEOUT_MS = 500
/** 后端 TTS 失败后重试的间隔（毫秒） */
const BACKEND_TTS_RETRY_MS = 1500

/** 长相位循环播报的定时器（>15 秒阶段每 2 秒重复播报） */
let loopTimer: ReturnType<typeof setTimeout> | null = null
/** 静默失败检测定时器 */
let detectTimer: ReturnType<typeof setTimeout> | null = null
/** 当前正在播报的 utterance（用于在 stopSpeech 时清理回调） */
let activeUtterance: SpeechSynthesisUtterance | null = null
/** 上一次播报的倒计时秒数（用于避免同一秒重复播报） */
let lastSpokenSecond = -1
/** "横波已到达"提示是否已播报（避免重复播报） */
let arrivedSpoken = false
// TTS 模式状态机：
// 'unknown' → 首次调用时探测；
// 'local'   → 本地 TTS 可用并已确认；
// 'backend' → 本地不可用或失败，回退到后端 TTS。
let ttsMode: 'unknown' | 'local' | 'backend' = 'unknown'
/** 本地 TTS 连续失败计数（达到 LOCAL_FAIL_THRESHOLD 时切换到后端） */
let localFailCount = 0
/** 本地 TTS 连续失败多少次后切换到后端 */
const LOCAL_FAIL_THRESHOLD = 2
/** 是否已警告过本地回退（避免日志刷屏） */
let localFallbackWarned = false
/** 是否已警告过后端缺少音箱（避免日志刷屏） */
let backendMissingWarned = false
/** 是否已警告过后端紧急回退（避免日志刷屏） */
let backendFallbackWarned = false

/**
 * 仅警告一次本地 TTS 回退（避免重复刷屏）。
 * @param message 警告消息
 */
function warnLocalFallback(message: string) {
  if (localFallbackWarned) return
  localFallbackWarned = true
  logger.warn(message)
}

// Android WebView 上 AudioContext 默认是 suspended 状态，需要主动 resume。
async function ensureAudioContextResumed(ctx: AudioContext): Promise<void> {
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume()
    } catch {
      // 忽略：部分 WebView 不允许 resume
    }
  }
}

/**
 * 播放"横波已到达"的蜂鸣提示音。
 * 使用 800/600/400Hz 三个方波组成短促警示音。
 */
function playArrivalBeep() {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!Ctx) return
    const ctx = new Ctx()
    void ensureAudioContextResumed(ctx).then(() => {
      const t0 = ctx.currentTime
      ;[800, 600, 400].forEach((freq, i) => {
        const osc = ctx.createOscillator()
        const gain = ctx.createGain()
        osc.type = 'square'
        osc.frequency.value = freq
        gain.gain.setValueAtTime(0.2, t0 + i * 0.15)
        gain.gain.exponentialRampToValueAtTime(0.01, t0 + i * 0.15 + 0.15)
        osc.connect(gain)
        gain.connect(ctx.destination)
        osc.start(t0 + i * 0.15)
        osc.stop(t0 + i * 0.15 + 0.18)
      })
      setTimeout(() => void ctx.close(), 800)
    })
  } catch {
    /* ignore：蜂鸣失败不影响 TTS 主流程 */
  }
}

/**
 * 构造完整预警播报文本。
 * @param p            地震预警 payload
 * @param countdownSec 横波到达倒计时（秒）
 * @returns 完整的播报文案
 */
function buildFullAlertText(p: EarthquakeAlertPayload, countdownSec: number): string {
  return `地震预警！地震预警！检测到地震，震级${p.magnitude.toFixed(1)}级，横波${countdownSec}秒后到达，预估烈度${p.localIntensity}度。立即避险！`
}

/**
 * 通过后端 HA 媒体播放器进行 TTS 播报。
 */
async function speakViaBackend(text: string, retry = true): Promise<boolean> {
  try {
    const entitiesStore = useEntitiesStore()
    const mediaPlayerIds = resolveTtsMediaPlayerIds(entitiesStore.entities, {
      emergencyFallback: true,
    })

    if (mediaPlayerIds.length === 0) {
      if (!backendMissingWarned) {
        backendMissingWarned = true
        logger.warn('地震预警 TTS:未配置后端播报音箱,请在设置 → 语音中配置播报音箱')
      }
      return false
    }

    const configured = resolveTtsMediaPlayerIds(entitiesStore.entities)
    if (!configured.length && !backendFallbackWarned) {
      backendFallbackWarned = true
      logger.warn(`地震预警 TTS:未配置播报音箱,紧急回退到 ${mediaPlayerIds[0]}`)
    }

    const { data } = await speakVoiceMultiple({
      message: text,
      mediaPlayers: mediaPlayerIds,
    })

    return !!data?.success
  } catch (e) {
    logger.warn('地震预警后端 TTS 失败', e)
    if (retry) {
      await new Promise((resolve) => setTimeout(resolve, BACKEND_TTS_RETRY_MS))
      return speakViaBackend(text, false)
    }
    return false
  }
}

/**
 * 地震预警 TTS composable。
 */
export function useEarthquakeTts(
  enabled: () => boolean,
  isAlerting: Ref<boolean>,
  payload: () => EarthquakeAlertPayload | null,
  currentCountdown: Ref<number>,
) {
  /**
   * 停止所有 TTS 播报。
   */
  function stopSpeech() {
    if (loopTimer) {
      clearTimeout(loopTimer)
      loopTimer = null
    }
    if (detectTimer) {
      clearTimeout(detectTimer)
      detectTimer = null
    }
    if (activeUtterance) {
      activeUtterance.onend = null
      activeUtterance.onerror = null
      activeUtterance = null
    }
    cancelLocalSpeech()
  }

  /**
   * 重置 TTS 模式探测状态。
   */
  function resetTtsMode() {
    ttsMode = 'unknown'
    localFailCount = 0
    resetLocalSpeechVoice()
    localFallbackWarned = false
    backendMissingWarned = false
    backendFallbackWarned = false
    logger.info('TTS 模式已重置')
  }

  /**
   * 播报文本（本机优先，失败回退 HA）。
   */
  async function speak(text: string, rate = 0.85, onEnd?: () => void) {
    if (!enabled() || !isAlerting.value) return

    if (ttsMode === 'backend') {
      await speakViaBackend(text)
      onEnd?.()
      return
    }

    if (ttsMode === 'local') {
      const synth = getSpeechSynth()
      if (!synth) {
        ttsMode = 'backend'
        await speakViaBackend(text)
        onEnd?.()
        return
      }
      synth.cancel()
      const raw = speakViaLocalRaw(text, rate)
      if (!raw) {
        ttsMode = 'backend'
        await speakViaBackend(text)
        onEnd?.()
        return
      }
      const { utter } = raw
      utter.onend = () => {
        activeUtterance = null
        onEnd?.()
      }
      utter.onerror = () => {
        activeUtterance = null
        localFailCount++
        if (localFailCount >= LOCAL_FAIL_THRESHOLD) {
          warnLocalFallback(`本地 TTS 连续失败 ${localFailCount} 次，切换到后端 TTS`)
          ttsMode = 'backend'
          localFailCount = 0
          void speakViaBackend(text).then(() => onEnd?.())
        } else {
          onEnd?.()
        }
      }
      activeUtterance = utter
      return
    }

    const voices = await waitForVoices(VOICE_LOAD_TIMEOUT_MS)

    if (voices.length === 0) {
      warnLocalFallback('本地 TTS 无可用语音，使用后端 TTS')
      ttsMode = 'backend'
      await speakViaBackend(text)
      onEnd?.()
      return
    }

    const synth = getSpeechSynth()!
    synth.cancel()
    const raw = speakViaLocalRaw(text, rate)
    if (!raw) {
      warnLocalFallback('本地 TTS 不可用，切换到后端 TTS')
      ttsMode = 'backend'
      await speakViaBackend(text)
      onEnd?.()
      return
    }
    const { utter, hasStarted } = raw

    utter.onend = () => {
      activeUtterance = null
      localFailCount = 0
      onEnd?.()
    }
    utter.onerror = (e) => {
      activeUtterance = null
      if (!hasStarted() && e.error !== 'canceled') {
        warnLocalFallback('本地 TTS 报错，切换到后端 TTS')
        ttsMode = 'backend'
        void speakViaBackend(text).then(() => onEnd?.())
      } else {
        onEnd?.()
      }
    }
    activeUtterance = utter

    detectTimer = setTimeout(() => {
      detectTimer = null
      if (activeUtterance !== utter) return
      if (hasStarted()) {
        ttsMode = 'local'
        localFailCount = 0
        return
      }
      warnLocalFallback('本地 TTS 静默失败，切换到后端 TTS')
      ttsMode = 'backend'
      synth.cancel()
      activeUtterance = null
      void speakViaBackend(text).then(() => onEnd?.())
    }, SILENT_FAIL_MS)
  }

  function startLongPhaseLoop() {
    const p = payload()
    if (!p || !enabled() || !isAlerting.value) return
    const sec = Math.max(0, Math.round(currentCountdown.value))
    speak(buildFullAlertText(p, sec), 0.9, () => {
      if (isAlerting.value && currentCountdown.value > 15) {
        loopTimer = setTimeout(startLongPhaseLoop, 2000)
      }
    })
  }

  function handleCountdownChange(countdown: number) {
    if (!enabled() || !isAlerting.value) return
    const sec = Math.round(countdown)

    if (countdown > 15) {
      arrivedSpoken = false
      if (sec !== lastSpokenSecond && (sec % 15 === 0 || lastSpokenSecond === -1)) {
        stopSpeech()
        lastSpokenSecond = sec
        startLongPhaseLoop()
      }
      return
    }

    if (countdown > 0) {
      arrivedSpoken = false
      if (sec !== lastSpokenSecond) {
        stopSpeech()
        lastSpokenSecond = sec
        speak(String(sec), 0.8)
      }
      return
    }

    if (!arrivedSpoken) {
      stopSpeech()
      arrivedSpoken = true
      lastSpokenSecond = 0
      playArrivalBeep()
      speak('横波已到达！请保持避险姿势！', 0.85)
    }
  }

  watch(
    () => enabled() && isAlerting.value,
    (active) => {
      if (active) {
        lastSpokenSecond = -1
        arrivedSpoken = false
        getLoadedVoices()
        handleCountdownChange(currentCountdown.value)
      } else {
        stopSpeech()
        lastSpokenSecond = -1
        arrivedSpoken = false
      }
    },
    { immediate: true },
  )

  watch(currentCountdown, (val) => {
    if (enabled() && isAlerting.value) handleCountdownChange(val)
  })

  onUnmounted(stopSpeech)

  return { stopSpeech, resetTtsMode }
}
