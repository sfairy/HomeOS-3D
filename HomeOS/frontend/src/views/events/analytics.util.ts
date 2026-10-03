/**
 * @file events-analytics.util.ts
 * @module frontend/src/views
 * 职责：事件历史「分析」面板的纯数据加工工具——把后端聚合统计结果
 *       规整为图表可用的桶（域分布 / 时序 / 实体频次）并产出 KPI 汇总。
 * 所属模块：frontend / src / views（事件历史视图层）。
 * 关键依赖：
 *   - events-display.util#normalizeByDomain：将后端 byDomain 结构归一为 {domain,count} 行；
 *   - entity-domain-meta：实体域主题色映射（统一各页配色）。
 * 说明：本文件不含 Vue 响应式，纯函数便于单测与在多视图复用。
 */
import { normalizeByDomain } from '@/utils/events/events-display.util'
import { ENTITY_DOMAIN_COLORS, entityDomainColor } from '@/constants/entity-domain-meta'

/** 时序桶：事件按小时/天分组的标签、计数与时间戳，供折线图渲染。 */
interface EventTimeBucket {
  label: string
  count: number
  ts?: number
}

/** 域分布桶：实体域维度的计数与图表色，供饼图渲染。 */
interface EventDomainBucket {
  domain: string
  count: number
  color: string
}

/** 实体频次桶：高频实体 entityId、显示名与计数，供横向条形图渲染。 */
interface EventEntityBucket {
  entityId: string
  label: string
  count: number
}

/** KPI 汇总：分析卡顶部六个 KPI 单元格所需的全部字段。 */
interface EventAnalyticsSummary {
  total: number
  domainCount: number
  topDomain: string | null
  topDomainCount: number
  topEntityId: string | null
  topEntityCount: number
  peakTimeLabel: string | null
  peakTimeCount: number
  avgPerHour: number | null
}

/** 域缺省时的回退调色板：当 ENTITY_DOMAIN_COLORS 未定义该域时按索引循环取色。 */
const FALLBACK_COLORS = [
  '#22d3ee',
  '#7dd3fc',
  '#6ee7b7',
  '#fbbf24',
  '#fb923c',
  '#f472b6',
  '#a78bfa',
  '#94a3b8',
]

/**
 * 按域取色：优先使用域主题色映射，未命中则从回退调色板按索引循环取色。
 * @param domain 实体域（如 light / sensor）。
 * @param index 当前桶在结果中的位置，用于回退调色板循环。
 */
function domainChartColor(domain: string, index = 0) {
  if (domain && ENTITY_DOMAIN_COLORS[domain]) return entityDomainColor(domain)
  return FALLBACK_COLORS[index % FALLBACK_COLORS.length]
}

/**
 * 构造域分布桶：将后端 byDomain 结构归一为带配色的饼图数据。
 * @param byDomain 后端返回的域维度聚合（结构由 normalizeByDomain 兼容）。
 */
export function buildDomainBuckets(byDomain: unknown): EventDomainBucket[] {
  return normalizeByDomain(byDomain).map((row, index) => ({
    domain: row.domain,
    count: row.count,
    color: domainChartColor(row.domain, index),
  }))
}

/**
 * 构造时序桶：将后端 byTime 数组规整为带 label/count/ts 的折线图数据。
 * 非数组或空数据时回退单条占位桶，避免 ECharts 渲染空 series。
 */
export function buildTimeBuckets(byTime: unknown): EventTimeBucket[] {
  if (!Array.isArray(byTime)) return [{ label: '—', count: 0 }]
  const rows = byTime
    .map((row) => ({
      label: String(row?.label || '—'),
      count: Number(row?.count) || 0,
      ts: Number(row?.ts) || 0,
    }))
    .filter((row) => row.label)
  return rows.length ? rows : [{ label: '—', count: 0 }]
}

/**
 * 构造实体频次桶：从后端 topEntities 取前 limit 条，转成图表所需的显示名+计数。
 * @param topEntities 后端返回的高频实体数组。
 * @param entityDisplayName 实体 ID -> 友好名 解析函数（由调用方注入，复用实体缓存）。
 * @param limit 最多取条数，默认 8。
 */
export function buildEntityBuckets(
  topEntities: unknown,
  entityDisplayName: (entityId: string) => string,
  limit = 8,
): EventEntityBucket[] {
  if (!Array.isArray(topEntities)) return []
  return topEntities.slice(0, limit).map((row) => ({
    entityId: String(row?.entityId || ''),
    label: entityDisplayName(String(row?.entityId || '')),
    count: Number(row?.count) || 0,
  }))
}

/**
 * 汇总事件分析 KPI：从原始 stats 一次性产出总量/活跃域/峰值时段/均值等字段。
 * 不修改入参；峰值时段通过对 times 拷贝排序避免副作用。
 * @param stats 后端聚合统计对象。
 * @param hours 当前回溯窗口小时数，用于计算 avgPerHour。
 */
export function computeEventAnalyticsSummary(
  stats: Record<string, unknown> | null | undefined,
  hours: number,
): EventAnalyticsSummary {
  const domains = buildDomainBuckets(stats?.byDomain)
  const times = buildTimeBuckets(stats?.byTime)
  const entities = Array.isArray(stats?.topEntities) ? stats.topEntities : []
  const total = Number(stats?.total) || 0
  const topDomain = domains[0] || null
  const topEntity = entities[0] as { entityId?: string; count?: number } | undefined
  const peak = [...times].sort((a, b) => b.count - a.count)[0] || null
  const windowHours = Math.max(Number(hours) || 1, 1)

  return {
    total,
    domainCount: domains.length,
    topDomain: topDomain?.domain || null,
    topDomainCount: topDomain?.count || 0,
    topEntityId: topEntity?.entityId ? String(topEntity.entityId) : null,
    topEntityCount: Number(topEntity?.count) || 0,
    peakTimeLabel: peak?.label || null,
    peakTimeCount: peak?.count || 0,
    avgPerHour: total ? Math.round((total / windowHours) * 10) / 10 : null,
  }
}
