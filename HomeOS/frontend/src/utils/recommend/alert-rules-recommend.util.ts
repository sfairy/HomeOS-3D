/**
 * 告警规则推荐模块。
 *
 * 职责：
 * - 基于安防事件实体与 EventLog 高频实体，推荐应配置 TTS/通知规则的实体；
 * - 去重过滤已配置实体，按「安防」与高频两类生成推荐 chips；
 * - 产出 RecommendInsightResult 供设置页告警规则面板渲染。
 *
 * 依赖：getEntityDomain（@homeos/shared）、recommend.types 类型定义。
 */
import { getEntityDomain, getEntityLeaf } from '@homeos/shared'
import type {
  EventLogStatsSnapshot,
  RecommendInsightResult,
} from '@/utils/recommend/types'
import { buildRecommendInsight } from '@/utils/recommend/insight.util'

/** 告警规则推荐输入 */
interface AlertRulesRecommendInput {
  /** EventLog 统计快照，提供高频实体列表 */
  stats: EventLogStatsSnapshot | null | undefined
  /** 已配置告警规则的实体 ID 集合，用于去重 */
  existingEntityIds: Set<string>
  /** 近期触发安防事件的实体 ID 列表（优先推荐） */
  securityEventEntities?: string[]
}

/**
 * 构建告警规则推荐结果。
 *
 * 算法流程：
 * 1. 优先将安防事件实体加入推荐（标记 meta 为「安防」）；
 * 2. 再从 EventLog 高频实体中筛选 binary_sensor/lock/alarm_control_panel 域；
 * 3. 全程用 seen 集合去重，已配置实体跳过；
 * 4. chips 数量上限 8，避免卡片过长。
 *
 * @param input 包含统计、已配置集合、安防事件实体的输入
 * @returns 推荐结果对象，含分组 chips 与跳转链接
 */
export function buildAlertRulesRecommendations(
  input: AlertRulesRecommendInput,
): RecommendInsightResult {
  const { stats, existingEntityIds, securityEventEntities = [] } = input
  const chips = []
  const seen = new Set<string>()

  // 第一轮：安防事件实体优先推荐，meta 标记为「安防」便于用户识别来源
  for (const entityId of securityEventEntities) {
    const id = String(entityId || '').trim()
    if (!id || existingEntityIds.has(id) || seen.has(id)) continue
    seen.add(id)
    chips.push({
      id,
      label: getEntityLeaf(id),
      meta: '安防',
      title: id,
      variant: 'entity' as const,
      payload: { entityId: id },
    })
  }

  // 第二轮：从 EventLog 高频实体中筛选可监听域，补充推荐
  const topEntities = stats?.topEntities || []
  for (const row of topEntities) {
    const id = String(row.entityId || '').trim()
    if (!id || existingEntityIds.has(id) || seen.has(id)) continue
    const domain = getEntityDomain(id)
    // 仅推荐与告警强相关的域：二值传感器、锁、安防控制面板
    if (!['binary_sensor', 'lock', 'alarm_control_panel'].includes(domain)) continue
    seen.add(id)
    chips.push({
      id,
      label: getEntityLeaf(id),
      meta: String(row.count),
      title: id,
      variant: 'entity' as const,
      payload: { entityId: id },
    })
    if (chips.length >= 8) break
  }

  const hasActionable = chips.length > 0
  return buildRecommendInsight({
    domain: 'alert-rules',
    title: '告警规则推荐',
    hasActionable,
    summary: {
      actionable: `建议为 ${chips.length} 个高频/安防实体配置 TTS 或通知规则`,
      idle: '实体 TTS 规则已覆盖主要关注实体',
    },
    groups: chips.length ? [{ id: 'entities', label: '推荐监听实体', chips }] : [],
    linkTo: '/settings?tab=alerts',
    linkLabel: '告警规则设置',
  })
}