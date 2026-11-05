/**
 * 操作音效（earcon）：管家结果确认时的极短提示音。
 *
 * 为什么不用音频文件：三种音效总共不到 0.3 秒，用 Web Audio 现场合成即可 ——
 * 不占静态资源、不需要预加载，也不会因为网络抖动让提示音晚到半秒。
 *
 * 为什么默认跟随 `voice.ttsEnabled`：音效属于「声音反馈」的一部分，用户关掉语音
 * 播报时通常也不想被叮一声。音量刻意压低（增益 0.05~0.12），只求可察觉。
 */
import { getConfigSection } from '@/shared/utils/config/frontend-config'
import { logger } from '@/shared/utils/core/logger'

/** 音效类型：与后端 `AgentChatResponse.earcon` 对齐 */
export type EarconKind = 'success' | 'error' | 'confirm'

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
export function earconEnabled(): boolean {
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

/** 释放音频上下文（页面卸载 / 测试用） */
export function disposeEarcon(): void {
  const ctx = context
  context = null
  if (!ctx || ctx.state === 'closed') return
  void ctx.close().catch((error) => logger.debug('关闭音频上下文失败', error))
}
