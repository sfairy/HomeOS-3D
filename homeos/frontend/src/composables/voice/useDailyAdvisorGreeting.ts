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
import { onScopeDispose, ref } from 'vue'
import { getConfigSection } from '@/shared/utils/config/frontend-config'
import { previewAgentTts } from '@/services/api/agent'
import { useServerTts } from '@/composables/voice/useServerTts'
import { useTtsSpeak } from '@/composables/voice/useTtsSpeak'
import { previewDailyAdvisor } from '@/shared/voice/utils/speech.util'
import { logger } from '@/shared/utils/core/logger'

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
export function buildDailyGreeting(now = new Date()): string | null {
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
