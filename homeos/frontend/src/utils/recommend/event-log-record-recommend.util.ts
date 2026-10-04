/**
 * 事件日志记录筛选智能推荐
 *
 * 职责：
 * - 基于事件日志统计快照，识别高频噪声域 / 高频实体，给出筛选模式（排除/白名单）建议。
 * - 把推荐结果映射为统一 RecommendInsightCard 结构，供顾问页与事件日志页展示。
 *
 * 依赖：
 * - @homeos/shared 中的 getEntityDomain。
 * - @/utils/recommend/types 的推荐卡片类型。
 *
 * 注意：
 * - 域 key（sensor / light / ...）为 HA domain，不翻译。
 * - reason（noise_domain / high_volume）为推荐理由标识符，不翻译。
 * - 仅面向用户的 summary / chip label 使用简体中文。
 */
import { getEntityDomain, getEntityLeaf } from '@homeos/shared'
import type {
  RecommendBanner,
  RecommendGroup,
  RecommendInsightResult,
  EventLogStatsSnapshot,
} from '@/utils/recommend/types'

export type { EventLogStatsSnapshot }

/** 常见噪声/高频变更域 */
const EVENT_LOG_NOISE_DOMAINS = new Set([
  'sensor',
  'binary_sensor',
  'device_tracker',
  'update',
  'camera',
  'event',
  'image',
])

/** 常见控制/交互域 */
const EVENT_LOG_CONTROL_DOMAINS = new Set([
  'light',
  'switch',
  'cover',
  'climate',
  'fan',
  'media_player',
  'lock',
  'scene',
  'script',
  'automation',
])

interface DomainRecommendItem {
  domain: string
  count: number
  share: number
  reason: 'noise_domain' | 'high_volume'
}

interface EntityRecommendItem {
  entityId: string
  domain: string
  count: number
  share: number
}

interface EventLogRecordRecommendResult {
  hours: number
  totalEvents: number
  suggestedMode: 'block' | 'allow_domains' | null
  blockDomains: DomainRecommendItem[]
  blockEntities: EntityRecommendItem[]
  summary: string
  hasActionable: boolean
}

interface CurrentFilterState {
  enabled: boolean
  mode: 'block' | 'allow_domains'
  blockDomains: string[]
  allowDomains: string[]
  blockEntityIds: string[]
}

const MIN_TOTAL_FOR_RECOMMEND = 50
const DOMAIN_NOISE_SHARE_THRESHOLD = 0.05
const DOMAIN_HIGH_VOLUME_SHARE = 0.15
const ENTITY_MIN_SHARE = 0.02
const ENTITY_MIN_COUNT = 30
const MAX_DOMAIN_RECS = 6
const MAX_ENTITY_RECS = 8

/**
 * 基于事件日志统计生成筛选推荐
 *
 * - 总量 < MIN_TOTAL_FOR_RECOMMEND 时直接返回空结果。
 * - 噪声占比 ≥ 55% 建议排除域模式；控制域占比 ≤ 25% 且总量 ≥ 500 建议白名单模式。
 * - 高频域 / 高频实体按阈值筛选，跳过已配置项，限量返回。
 *
 * @param stats - 事件日志统计快照。
 * @param hours - 统计时间窗口（小时）。
 * @param current - 当前筛选配置，用于排除已配置项。
 * @returns 推荐结果（含建议模式、候选域/实体、汇总文案、是否可执行）。
 */
export function buildEventLogRecordRecommendations(
  stats: EventLogStatsSnapshot | null | undefined,
  hours: number,
  current: CurrentFilterState,
): EventLogRecordRecommendResult {
  const empty: EventLogRecordRecommendResult = {
    hours,
    totalEvents: 0,
    suggestedMode: null,
    blockDomains: [],
    blockEntities: [],
    summary: '',
    hasActionable: false,
  }
  if (!stats || stats.total < MIN_TOTAL_FOR_RECOMMEND) return empty

  const total = stats.total
  const domainRows = Object.entries(stats.byDomain || {})
    .map(([domain, count]) => ({ domain, count: Number(count) || 0 }))
    .sort((a, b) => b.count - a.count)

  const blockedDomainSet = new Set(
    current.mode === 'block' ? current.blockDomains : current.allowDomains,
  )
  const blockedEntitySet = new Set(current.blockEntityIds)

  let controlCount = 0
  let noiseCount = 0
  for (const row of domainRows) {
    if (EVENT_LOG_CONTROL_DOMAINS.has(row.domain)) controlCount += row.count
    if (EVENT_LOG_NOISE_DOMAINS.has(row.domain)) noiseCount += row.count
  }
  const controlShare = controlCount / total
  const noiseShare = noiseCount / total

  let suggestedMode: 'block' | 'allow_domains' | null = null
  if (noiseShare >= 0.55) suggestedMode = 'block'
  else if (controlShare <= 0.25 && total >= 500) suggestedMode = 'allow_domains'

  const blockDomains: DomainRecommendItem[] = []
  for (const row of domainRows) {
    if (blockDomains.length >= MAX_DOMAIN_RECS) break
    if (blockedDomainSet.has(row.domain)) continue
    const share = row.count / total
    const isNoise = EVENT_LOG_NOISE_DOMAINS.has(row.domain)
    if (isNoise && share >= DOMAIN_NOISE_SHARE_THRESHOLD) {
      blockDomains.push({ domain: row.domain, count: row.count, share, reason: 'noise_domain' })
    } else if (share >= DOMAIN_HIGH_VOLUME_SHARE && !EVENT_LOG_CONTROL_DOMAINS.has(row.domain)) {
      blockDomains.push({ domain: row.domain, count: row.count, share, reason: 'high_volume' })
    }
  }

  const blockEntities: EntityRecommendItem[] = []
  const topEntities = Array.isArray(stats.topEntities) ? stats.topEntities : []
  for (const row of topEntities) {
    if (blockEntities.length >= MAX_ENTITY_RECS) break
    const entityId = String(row.entityId || '').trim()
    if (!entityId || blockedEntitySet.has(entityId)) continue
    const count = Number(row.count) || 0
    const share = count / total
    const domain = getEntityDomain(entityId)
    const isNoiseEntity = EVENT_LOG_NOISE_DOMAINS.has(domain)
    if (isNoiseEntity && (share >= ENTITY_MIN_SHARE || count >= ENTITY_MIN_COUNT)) {
      blockEntities.push({ entityId, domain, count, share })
    } else if (share >= 0.05) {
      blockEntities.push({ entityId, domain, count, share })
    }
  }

  const hasDomainRecs = current.mode === 'block' && blockDomains.length > 0
  const hasEntityRecs = blockEntities.length > 0
  const hasModeRec = suggestedMode !== null && suggestedMode !== current.mode
  const hasActionable = hasDomainRecs || hasEntityRecs || hasModeRec

  let summary = ''
  if (hasActionable) {
    const parts: string[] = []
    if (hasModeRec && suggestedMode) {
      parts.push(suggestedMode === 'block' ? '建议采用排除域模式' : '建议采用白名单模式')
    }
    if (hasDomainRecs) parts.push(`可排除 ${blockDomains.length} 个高频域`)
    if (hasEntityRecs) parts.push(`可排除 ${blockEntities.length} 个高频实体`)
    summary = parts.join('，')
  } else {
    summary = '当前筛选规则已覆盖主要高频记录'
  }

  return {
    hours,
    totalEvents: total,
    suggestedMode,
    blockDomains,
    blockEntities,
    summary,
    hasActionable,
  }
}

/** 把占比格式化为百分比文案（≥10% 取整，≥1% 保留 1 位，否则「<1%」） */
export function formatRecommendShare(share: number): string {
  const pct = share * 100
  if (pct >= 10) return `${Math.round(pct)}%`
  if (pct >= 1) return `${pct.toFixed(1)}%`
  return '<1%'
}

/** 将筛选推荐结果映射为统一 RecommendInsightCard 结构 */
export function mapEventLogRecordToInsight(
  rec: EventLogRecordRecommendResult,
  currentMode: 'block' | 'allow_domains',
): RecommendInsightResult {
  const banners: RecommendBanner[] = []
  if (rec.suggestedMode && rec.suggestedMode !== currentMode) {
    banners.push({
      id: 'suggested-mode',
      label: rec.suggestedMode === 'block' ? '建议：排除指定域' : '建议：仅记录指定域',
      actionLabel: '切换模式',
    })
  }

  const groups: RecommendGroup[] = []
  if (rec.blockDomains.length && currentMode === 'block') {
    groups.push({
      id: 'block-domains',
      label: '高频域',
      chips: rec.blockDomains.map((row) => ({
        id: row.domain,
        label: row.domain,
        meta: formatRecommendShare(row.share),
        title: `${row.domain} · ${row.count} 条`,
        variant: 'domain' as const,
        payload: { domain: row.domain },
      })),
    })
  }
  if (rec.blockEntities.length) {
    groups.push({
      id: 'block-entities',
      label: '高频实体',
      chips: rec.blockEntities.map((row) => ({
        id: row.entityId,
        label: getEntityLeaf(row.entityId),
        meta: String(row.count),
        title: row.entityId,
        variant: 'entity' as const,
        payload: { entityId: row.entityId },
      })),
    })
  }

  return {
    domain: 'eventlog-filter',
    title: '智能推荐',
    summary: rec.summary,
    hasActionable: rec.hasActionable,
    banners,
    groups,
    linkTo: '/events',
    linkLabel: '查看高频记录',
  }
}
