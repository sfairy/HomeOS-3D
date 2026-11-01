/**
 * 统一 TTS 播报 composable。
 *
 * 三件事在这里收口：
 * - **路由**：按 ``voice.ttsOutputMode``（local | ha | auto）决定「让谁说」；
 * - **总开关**：默认尊重 ``voice.ttsEnabled``，只有手动触发（设置页试听、媒体弹窗
 *   的「播报」按钮）传 ``manual: true`` 才绕过 —— 关掉开关应当静音，但试听必须能试；
 * - **冷却**：自动播报传 ``dedupKey`` 时，同一 key 在 ``other.speakCooldownMin``
 *   分钟内只播一次。这是纯前端兜底，多终端各自计时（真正的全局去重在后端）。
 *
 * 返回结构统一带 ``path``，让设置页能把「实际走了哪条链路」如实告诉用户，
 * 而不是只回一句无信息量的「试听完成」。
 */
import { ref, computed } from 'vue'
import { useEntitiesStore } from '@/stores/entities.store'
import { getConfigSection } from '@/shared/utils/config/frontend-config'
import { speakVoice, speakVoiceMultiple } from '@/services/api/system'
import { logger } from '@/shared/utils/core/logger'
import { getApiErrorMessage } from '@/shared/utils/core/error-message'
import { getEntityDisplayName } from '@/shared/entity/utils/derived.util'
import { speakLocal } from '@/shared/voice/utils/local-speech.util'

/** 一次播报实际走过的链路。 */
export type TtsPath = 'local' | 'ha' | 'skipped'

export interface TtsSpeakResult {
  ok: boolean
  message: string
  path: TtsPath
}

export interface TtsSpeakOptions {
  mediaPlayer?: string
  mediaPlayers?: string[]
  /** 手动触发：无视总开关与冷却（试听 / 媒体弹窗按钮用） */
  manual?: boolean
  /** 冷却键：自动播报传它，同一内容在冷却窗口内不重复出声 */
  dedupKey?: string
}

/** 冷却计时：归一化 key → 上次播报的 epoch ms。 */
const lastSpokenAt = new Map<string, number>()
/** 冷却表上限，防止长时间运行后无限增长 */
const MAX_COOLDOWN_ENTRIES = 200

function skipped(message: string): TtsSpeakResult {
  return { ok: false, path: 'skipped', message }
}

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

/** 总开关：缺省视为开启（与后端 ``ttsEnabled is not False`` 同一口径）。 */
export function isTtsEnabled(): boolean {
  return getConfigSection('voice')?.ttsEnabled !== false
}

/** 播报冷却（分钟）；0 表示不限制。 */
function resolveCooldownMin(): number {
  const raw = Number(getConfigSection('other')?.speakCooldownMin ?? 10)
  return Number.isFinite(raw) && raw > 0 ? raw : 0
}

/** 把播报文本归一成冷却键：忽略空白与标点差异，同义内容不重复出声。 */
export function cooldownKeyOf(text: string): string {
  return String(text || '')
    .replace(/\s+/g, '')
    .replace(/[，。！？、,.!?;；:：]/g, '')
    .slice(0, 120)
}

/** 表满时先清过期项；仍然满就丢最早一条（宁可多播一次，也不无限增长）。 */
function pruneCooldown(now: number, minutes: number): void {
  if (lastSpokenAt.size < MAX_COOLDOWN_ENTRIES) return
  const window = minutes * 60_000
  for (const [k, at] of lastSpokenAt) {
    if (now - at >= window) lastSpokenAt.delete(k)
  }
  if (lastSpokenAt.size >= MAX_COOLDOWN_ENTRIES) {
    const oldest = lastSpokenAt.keys().next().value
    if (oldest !== undefined) lastSpokenAt.delete(oldest)
  }
}

/**
 * 冷却判定：窗口内已播过返回 false；未播过则现在占位放行。
 *
 * 先占位再播：并发重复请求都能通过的写法会让一次告警播三遍。
 * 失败时调用方用 ``releaseCooldown`` 归还名额。
 */
function claimCooldown(key: string, minutes: number): boolean {
  if (!key || minutes <= 0) return true
  const now = Date.now()
  const last = lastSpokenAt.get(key)
  if (last != null && now - last < minutes * 60_000) return false
  pruneCooldown(now, minutes)
  lastSpokenAt.set(key, now)
  return true
}

function releaseCooldown(key: string): void {
  if (key) lastSpokenAt.delete(key)
}

/**
 * 总开关与冷却的联合拦截；放行返回 ``null``。
 */
function blockReason(opts: TtsSpeakOptions): TtsSpeakResult | null {
  if (opts.manual) return null
  if (!isTtsEnabled()) return skipped('语音播报已在设置中关闭')
  const key = cooldownKeyOf(String(opts.dedupKey || ''))
  if (key && !claimCooldown(key, resolveCooldownMin())) {
    return skipped('同一内容在播报冷却期内，已跳过')
  }
  return null
}

/** 本次播报的冷却键（手动触发不参与冷却）。 */
function dedupKeyOf(opts: TtsSpeakOptions): string {
  return opts.manual ? '' : cooldownKeyOf(String(opts.dedupKey || ''))
}

/** HA 返回文案：优先用后端给的，缺失时按成功数补一句可读描述。 */
function haMessage(raw: unknown, ok: boolean, count: number): string {
  const text = String(raw || '').trim()
  if (text) return text
  if (!ok) return '播报失败'
  return count > 1 ? `已播报到 ${count} 个音箱` : '播报已发送'
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

  /** 一条请求打多个音箱：后端并发下发并汇总，前端不重复写「部分成功」。 */
  async function requestHaSpeak(text: string, targetIds: string[]) {
    if (targetIds.length === 1) {
      const { data } = await speakVoice({ message: text, mediaPlayer: targetIds[0] })
      return data
    }
    const { data } = await speakVoiceMultiple({ message: text, mediaPlayers: targetIds })
    return data
  }

  /** 目标音箱：显式传入优先，否则用配置里的多选列表。 */
  function resolveTargetIds(opts: TtsSpeakOptions): string[] {
    if (opts.mediaPlayers) return opts.mediaPlayers
    if (opts.mediaPlayer) return [opts.mediaPlayer]
    return configuredPlayerIds.value
  }

  /**
   * 经 HA 音箱播报（多台走一条批量请求，由后端并发下发并汇总结果）。
   */
  async function speakViaHa(
    text: string,
    opts: TtsSpeakOptions = {},
  ): Promise<TtsSpeakResult> {
    const targetIds = resolveTargetIds(opts)
    if (targetIds.length === 0) {
      return {
        ok: false,
        path: 'ha',
        message: '未找到播报音箱，请在设置 → 语音中配置播报音箱',
      }
    }

    try {
      const data = await requestHaSpeak(text, targetIds)
      const ok = !!data?.success
      return { ok, path: 'ha', message: haMessage(data?.message, ok, targetIds.length) }
    } catch (error) {
      logger.warn('HA TTS 播报失败', error)
      return { ok: false, path: 'ha', message: getApiErrorMessage(error, '播报失败') }
    }
  }

  /** HA 优先：失败归还冷却名额，让下一次还有机会出声。 */
  async function speakHaFirst(
    text: string,
    opts: TtsSpeakOptions,
    dedupKey: string,
  ): Promise<TtsSpeakResult> {
    const result = await speakViaHa(text, opts)
    if (!result.ok) releaseCooldown(dedupKey)
    return result
  }

  /** 本机优先：``local`` 模式下失败就到此为止，``auto`` 回退 HA。 */
  async function speakLocalFirst(
    text: string,
    opts: TtsSpeakOptions,
    dedupKey: string,
  ): Promise<TtsSpeakResult> {
    const local = await speakLocal(text)
    if (local.ok) return { ok: true, path: 'local', message: local.message }
    logger.debug('本机 TTS 失败,回退 HA', local.message)
    if (resolveTtsOutputMode() === 'local') {
      releaseCooldown(dedupKey)
      return { ok: false, path: 'local', message: local.message }
    }
    return speakHaFirst(text, opts, dedupKey)
  }

  /**
   * 播报文本（按 ttsOutputMode 路由本机 / HA）。
   */
  async function speak(
    message: string | null | undefined,
    opts: TtsSpeakOptions = {},
  ): Promise<TtsSpeakResult> {
    const text = String(message || '').trim()
    if (!text) return skipped('请输入播报内容')

    const blocked = blockReason(opts)
    if (blocked) return blocked

    const dedupKey = dedupKeyOf(opts)
    speaking.value = true
    try {
      if (resolveTtsOutputMode() === 'ha') return await speakHaFirst(text, opts, dedupKey)
      return await speakLocalFirst(text, opts, dedupKey)
    } catch (e) {
      releaseCooldown(dedupKey)
      logger.warn('TTS 播报失败', e)
      return { ok: false, path: 'ha', message: getApiErrorMessage(e, '播报失败') }
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
