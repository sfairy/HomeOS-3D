/**
 * TTS 播报音箱解析工具
 *
 * 职责：从公开配置读取已配置的播报音箱列表；未配置时可选回退到首个可用 media_player。
 * 依赖：frontend-config（读取 voice 配置段）。
 */
import { getConfigSection } from '@/utils/config/frontend-config'

/** 实体表最小形状：entity_id → { state? } */
type EntityMap = Record<string, { state?: string } | undefined>

/**
 * 列出当前可用的 HA media_player 实体 id。
 *
 * @param entities 实体表（来自 entity store）
 * @returns 过滤掉 unavailable 后按中文 locale 排序的 entity_id 数组
 */
function listAvailableMediaPlayerIds(entities: EntityMap): string[] {
  return Object.keys(entities)
    .filter((id) => id.startsWith('media_player.') && entities[id]?.state !== 'unavailable')
    .sort((a, b) => a.localeCompare(b, 'zh'))
}

/**
 * 从公开配置读取已配置的播报音箱。
 *
 * @returns voice.ttsMediaPlayerIds 配置项映射并去空后的数组；未配置或格式错误时返回空数组
 */
function getConfiguredTtsMediaPlayerIds(): string[] {
  const voiceConfig = getConfigSection('voice') as Record<string, unknown>
  const rawIds = voiceConfig?.ttsMediaPlayerIds
  if (Array.isArray(rawIds) && rawIds.length) {
    return rawIds.map((id) => String(id).trim()).filter(Boolean)
  }
  return []
}

/**
 * 解析 TTS 播报音箱列表：优先返回已配置项；未配置且允许回退时取首个可用 media_player。
 *
 * @param entities 实体表（用于紧急回退查找可用音箱）
 * @param options.emergencyFallback 未配置时是否回退到第一个可用 media_player
 * @returns 播报目标 entity_id 数组（可能为空）
 */
export function resolveTtsMediaPlayerIds(
  entities?: EntityMap,
  options?: { emergencyFallback?: boolean },
): string[] {
  const configured = getConfiguredTtsMediaPlayerIds()
  if (configured.length) return configured
  if (!options?.emergencyFallback || !entities) return []
  const fallback = listAvailableMediaPlayerIds(entities)
  return fallback.length ? [fallback[0]] : []
}