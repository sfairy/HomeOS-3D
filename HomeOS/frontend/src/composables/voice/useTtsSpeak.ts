/**
 * @file useTtsSpeak.ts
 * @module composables/voice
 * @description 统一 TTS 播报 composable（本机 SpeechSynthesis / HA 音箱）。
 *
 * 职责：
 * - 按 voice.ttsOutputMode（local | ha | auto）路由播报；
 * - local / auto：本机优先；auto 失败回退 HA；
 * - ha：仅 HA media_player；
 * - 列出可用媒体播放器实体；支持单/多音箱并行播报。
 */
import { ref, computed } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { getConfigSection } from '@/utils/config/frontend-config'
import { speakVoice } from '@/services/api/system'
import { logger } from '@/utils/core/logger'
import { getApiErrorMessage } from '@/utils/core/error-message'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { speakLocal } from '@/utils/voice/local-speech.util'

/**
 * 列出所有可用的媒体播放器实体（排除 unavailable），按名称中文排序。
 */
function listMediaPlayers(
  entities: Record<string, { state?: string; attributes?: Record<string, unknown> } | undefined>,
) {
  const list: Array<{ id: string; name: string }> = []
  for (const key in entities) {
    if (!key.startsWith('media_player.')) continue
    const e = entities[key]
    if (e?.state === 'unavailable') continue
    list.push({
      id: key,
      name: getEntityDisplayName(key, e),
    })
  }
  return list.sort((a, b) => a.name.localeCompare(b.name, 'zh'))
}

function resolveTtsOutputMode(): 'local' | 'ha' | 'auto' {
  const raw = getConfigSection('voice')?.ttsOutputMode
  if (raw === 'local' || raw === 'auto') return raw
  return 'ha'
}

/**
 * 统一 TTS 播报 composable。
 */
export function useTtsSpeak() {
  const entitiesStore = useEntitiesStore()
  const speaking = ref(false)

  const ttsOutputMode = computed(() => resolveTtsOutputMode())

  const configuredPlayerId = computed(() =>
    getConfigSection('voice')?.ttsMediaPlayerId
      ? String(getConfigSection('voice')?.ttsMediaPlayerId).trim()
      : '',
  )
  const configuredPlayerIds = computed(() => {
    const ids = getConfigSection('voice')?.ttsMediaPlayerIds
    if (Array.isArray(ids) && ids.length > 0) {
      return ids.map((id: string) => String(id).trim()).filter(Boolean)
    }
    const single = configuredPlayerId.value
    return single ? [single] : []
  })
  const mediaPlayers = computed(() => listMediaPlayers(entitiesStore.entities))
  const defaultPlayerId = computed(() => {
    const ids = configuredPlayerIds.value
    if (ids.length > 0) return ids[0]
    const configured = configuredPlayerId.value
    if (configured && entitiesStore.entities[configured]) return configured
    return mediaPlayers.value[0]?.id || ''
  })

  /**
   * 经 HA 音箱播报。
   */
  async function speakViaHa(
    text: string,
    opts: { mediaPlayer?: string; mediaPlayers?: string[] } = {},
  ) {
    const players = opts.mediaPlayers || (opts.mediaPlayer ? [opts.mediaPlayer] : null)
    const targetIds = players || configuredPlayerIds.value

    if (targetIds.length === 0) {
      return {
        ok: false,
        message: '未找到播报音箱，请在设置 → 语音中配置播报音箱',
      }
    }

    if (targetIds.length === 1) {
      const { data } = await speakVoice({
        message: text,
        mediaPlayer: targetIds[0],
      })
      const ok = !!data?.success
      return { ok, message: data?.message || (ok ? '播报已发送' : '播报失败') }
    }

    const results = await Promise.all(
      targetIds.map(async (mediaPlayerId: string) => {
        try {
          const { data } = await speakVoice({
            message: text,
            mediaPlayer: mediaPlayerId,
          })
          return !!data?.success
        } catch (e) {
          logger.warn(`TTS 播报失败 [${mediaPlayerId}]`, e)
          return false
        }
      }),
    )

    const successCount = results.filter((r) => r).length
    if (successCount === 0) {
      return { ok: false, message: '播报失败' }
    }
    return { ok: true, message: `已播报到 ${successCount} 个音箱` }
  }

  /**
   * 播报文本（按 ttsOutputMode 路由本机 / HA）。
   */
  async function speak(
    message: string | null | undefined,
    opts: { mediaPlayer?: string; mediaPlayers?: string[] } = {},
  ) {
    const text = String(message || '').trim()
    if (!text) return { ok: false, message: '请输入播报内容' }

    const mode = resolveTtsOutputMode()
    speaking.value = true
    try {
      if (mode === 'local' || mode === 'auto') {
        const local = await speakLocal(text)
        if (local.ok || mode === 'local') return local
        logger.debug('本机 TTS 失败,回退 HA', local.message)
      }

      return await speakViaHa(text, opts)
    } catch (e) {
      const errMsg = getApiErrorMessage(e, '播报失败')
      logger.warn('TTS 播报失败', e)
      return { ok: false, message: errMsg }
    } finally {
      speaking.value = false
    }
  }

  return {
    speaking,
    ttsOutputMode,
    mediaPlayers,
    configuredPlayerId,
    configuredPlayerIds,
    defaultPlayerId,
    speak,
  }
}
