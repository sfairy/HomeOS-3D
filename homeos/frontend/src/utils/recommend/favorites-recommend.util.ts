/**
 * 常用设备（收藏）推荐模块。
 *
 * 职责：
 * - 基于命令统计与 EventLog 高频实体，推荐应加入常用设备的实体；
 * - 仅推荐可控设备域（light/switch/climate/cover/fan/media_player/lock）；
 * - 按域分组展示，去重已收藏实体；
 * - 产出 RecommendInsightResult 供设置页常用设备 tab 渲染。
 *
 * 依赖：getEntityDomain（@homeos/shared）、recommend.types 类型。
 */
import { getEntityDomain, getEntityLeaf } from '@homeos/shared'
import type {
  EventLogStatsSnapshot,
  RecommendInsightResult,
} from '@/utils/recommend/types'
import { buildRecommendInsight } from '@/utils/recommend/insight.util'

/**
 * 允许加入常用设备的设备域白名单。
 * 仅包含可被用户直接控制的执行器域。
 */
const FAVORITE_DOMAINS = [
  'light',
  'switch',
  'climate',
  'cover',
  'fan',
  'media_player',
  'lock',
] as const

/** 设备域 → 中文标签映射，用于分组标题 */
const DOMAIN_LABELS: Record<string, string> = {
  light: '灯光',
  switch: '开关',
  climate: '空调',
  cover: '窗帘',
  fan: '风扇',
  media_player: '媒体',
  lock: '门锁',
}

/** 常用设备推荐输入 */
interface FavoritesRecommendInput {
  /** EventLog 统计快照，提供高频实体列表 */
  stats: EventLogStatsSnapshot | null | undefined
  /** 当前已收藏实体（按分组存储），用于去重 */
  favoriteEntities: Record<string, string[] | undefined>
  /** 命令统计中的高频实体（优先级高于 EventLog） */
  commandTopEntities?: Array<{ entityId: string; count: number }>
}

/**
 * 构建常用设备推荐结果。
 *
 * 算法流程：
 * 1. 展平 favoriteEntities 构建已收藏集合；
 * 2. 合并 commandTopEntities 与 stats.topEntities（命令统计优先），按 count 去重保留较大值；
 * 3. 仅保留 FAVORITE_DOMAINS 白名单域；
 * 4. 按 count 降序取前 8 个，再按域分组生成 chips。
 *
 * @param input 推荐输入
 * @returns 推荐结果对象
 */
export function buildFavoritesRecommendations(
  input: FavoritesRecommendInput,
): RecommendInsightResult {
  const { stats, favoriteEntities, commandTopEntities = [] } = input
  // 展平已收藏实体，构建去重集合
  const existing = new Set(
    Object.values(favoriteEntities || {})
      .flat()
      .map((id) => String(id)),
  )
  const candidates = new Map<string, { entityId: string; count: number; domain: string }>()

  // 合并命令统计与 EventLog 高频实体，命令统计在前优先级更高
  const topFromStats = stats?.topEntities || []
  for (const row of [...commandTopEntities, ...topFromStats]) {
    const entityId = String(row.entityId || '').trim()
    if (!entityId || existing.has(entityId)) continue
    const domain = getEntityDomain(entityId)
    if (!FAVORITE_DOMAINS.includes(domain as (typeof FAVORITE_DOMAINS)[number])) continue
    // 同一实体出现多次时保留 count 较大者
    const prev = candidates.get(entityId)
    const count = Number(row.count) || 0
    if (!prev || count > prev.count) {
      candidates.set(entityId, { entityId, count, domain })
    }
  }

  // 按 count 降序取前 8 个候选
  const sorted = [...candidates.values()].sort((a, b) => b.count - a.count).slice(0, 8)

  // 按域分组，便于用户按设备类型浏览
  const byDomain = new Map<string, typeof sorted>()
  for (const item of sorted) {
    if (!byDomain.has(item.domain)) byDomain.set(item.domain, [])
    byDomain.get(item.domain)!.push(item)
  }

  const groups = [...byDomain.entries()].map(([domain, items]) => ({
    id: `fav-${domain}`,
    label: DOMAIN_LABELS[domain] || domain,
    chips: items.map((item) => ({
      id: item.entityId,
      label: getEntityLeaf(item.entityId),
      meta: String(item.count),
      title: item.entityId,
      variant: 'entity' as const,
      payload: { entityId: item.entityId, domain },
    })),
  }))

  const hasActionable = sorted.length > 0
  return buildRecommendInsight({
    domain: 'favorites',
    title: '常用设备推荐',
    hasActionable,
    summary: {
      actionable: `基于高频控制记录，建议将 ${sorted.length} 个实体加入常用设备`,
      idle: '常用设备已覆盖主要高频实体',
    },
    groups,
    linkTo: '/settings?tab=favorites',
    linkLabel: '打开常用设备',
  })
}