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
import { ref } from 'vue'
import { previewAgentTts } from '@/services/api/agent'
import { useServerTts } from '@/composables/voice/useServerTts'
import { useTtsSpeak, type TtsSpeakResult } from '@/composables/voice/useTtsSpeak'
import { logger } from '@/shared/utils/core/logger'

/** 与滑杆一致的 `+10%` / `+2Hz` 解析 */
function parseSignedNumber(raw: unknown): number {
  const matched = String(raw ?? '').match(/^[+-]?\d+(?:\.\d+)?/)
  if (!matched) return 0
  const value = Number(matched[0])
  return Number.isFinite(value) ? Math.round(value) : 0
}

/** 语音草稿里参与合成的字段（设置页直接传 `voice.value`） */
export interface SpeechDraft {
  ttsEngine?: string
  ttsVoice?: string
  ttsRate?: string
  ttsPitch?: string
  ttsApiBase?: string
  ttsApiKey?: string
  ttsModel?: string
}

export interface SpeechPreviewResult {
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
