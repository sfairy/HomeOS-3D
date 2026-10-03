/**
 * EventLog 性能调优推荐模块。
 *
 * 职责：
 * - 基于 EventLog 统计快照与当前配置，识别写入性能瓶颈；
 * - 针对传感器占比过高、高频变更、保留期过短等场景给出 banner 建议；
 * - 识别高写入域（noisy domains）生成 chips 供筛选参考；
 * - 产出 RecommendInsightResult 供设置页连接 tab 渲染。
 *
 * 依赖：recommend.types 类型、event-log-record-recommend 格式化工具、locale-format 数字格式化。
 */
import type {
  EventLogStatsSnapshot,
  RecommendInsightResult,
} from '@/utils/recommend/types'
import { buildRecommendInsight } from '@/utils/recommend/insight.util'
import { formatRecommendShare } from '@/utils/recommend/event-log-record-recommend.util'
import { formatLocaleNumber } from '@/utils/format/locale-format.util'

/** EventLog 性能调优相关配置项 */
interface EventLogPerfConfig {
  /** 是否启用 EventLog 分级存储 */
  eventLogTierEnabled?: boolean
  /** 是否跳过 sensor 域时间线写入 */
  eventLogSkipSensorTimeline?: boolean
  /** 是否开启入口合并（ingressCoalesce） */
  ingressCoalesceEnabled?: boolean
  /** 是否启用 EventLog 实体筛选 */
  eventLogRecordFilterEnabled?: boolean
  /** 历史保留天数 */
  eventlogRetentionDays?: number
}

/**
 * 构建 EventLog 性能调优推荐结果。
 *
 * 算法流程：
 * 1. 记录量 < 100 时直接返回「无需调优」；
 * 2. 计算传感器域占比，占比 ≥40% 建议跳过 sensor 时间线，≥50% 建议启用筛选；
 * 3. 总量 > 5000 建议开启入口合并；
 * 4. 保留期 < 7 天且写入量大建议延长保留期；
 * 5. 识别占比 ≥10% 的 sensor/binary_sensor/device_tracker/update 高写入域；
 * 6. 总量 > 2000 且未启用分级时，追加分级存储建议。
 *
 * @param stats EventLog 统计快照
 * @param hours 统计时间窗口（小时）
 * @param config 当前性能相关配置
 * @returns 推荐结果对象
 */
export function buildEventLogPerfRecommendations(
  stats: EventLogStatsSnapshot | null | undefined,
  hours: number,
  config: EventLogPerfConfig,
): RecommendInsightResult {
  const empty: RecommendInsightResult = {
    domain: 'eventlog-perf',
    title: 'EventLog 性能调优',
    summary: '',
    hasActionable: false,
    linkTo: '/settings?tab=connection&section=entities',
    linkLabel: '打开筛选设置',
  }
  // 记录量过少时不做调优建议
  if (!stats || stats.total < 100) {
    return { ...empty, summary: '记录量较少，暂无需性能调优' }
  }

  const total = stats.total
  // 传感器域 = sensor + binary_sensor，二者是写入噪声主要来源
  const sensorCount =
    Number(stats.byDomain?.sensor || 0) + Number(stats.byDomain?.binary_sensor || 0)
  const sensorShare = sensorCount / total
  const banners = []
  const groups = []

  // 传感器占比过高：建议跳过 sensor 时间线写入（默认已开；仅显式关闭时提示）
  if (sensorShare >= 0.4 && config.eventLogSkipSensorTimeline === false) {
    banners.push({
      id: 'skip-sensor-timeline',
      label: '传感器类占比较高，建议跳过 sensor 时间线写入',
      actionLabel: '高级参数 · 运维',
      actionTo: '/settings?tab=params&section=ops',
    })
  }
  // 占比更高：建议启用实体筛选减少数据库写入
  if (sensorShare >= 0.5 && !config.eventLogRecordFilterEnabled) {
    banners.push({
      id: 'enable-filter',
      label: '建议启用 EventLog 实体筛选以减少数据库写入',
      actionLabel: '前往配置',
    })
  }
  // 高频变更：建议开启入口合并（默认已开；仅显式关闭时提示）
  if (total > 5000 && config.ingressCoalesceEnabled === false) {
    banners.push({
      id: 'ingress-coalesce',
      label: '高频变更较多，建议开启入口合并（ingressCoalesce）',
      actionLabel: '高级参数 · HA连接',
      actionTo: '/settings?tab=params&section=haConnector',
    })
  }

  // 保留期过短且写入量大：延长保留期避免数据过快丢失
  const retentionDays = Number(config.eventlogRetentionDays) || 0
  if (retentionDays > 0 && retentionDays < 7 && total > 3000) {
    banners.push({
      id: 'retention-short',
      label: `历史保留仅 ${retentionDays} 天且写入量较大，可适当延长数据保留期`,
      actionLabel: '数据保留',
      actionTo: '/settings?tab=retention',
    })
  }

  // 识别高写入域：占比 ≥10% 且属于易产生噪声的域
  const noisyDomains = Object.entries(stats.byDomain || {})
    .map(([domain, count]) => ({
      domain,
      count: Number(count) || 0,
      share: (Number(count) || 0) / total,
    }))
    .filter(
      (row) =>
        row.share >= 0.1 &&
        ['sensor', 'binary_sensor', 'device_tracker', 'update'].includes(row.domain),
    )
    .sort((a, b) => b.count - a.count)
    .slice(0, 4)

  if (noisyDomains.length) {
    groups.push({
      id: 'noisy-domains',
      label: '高写入域',
      chips: noisyDomains.map((row) => ({
        id: row.domain,
        label: row.domain,
        meta: formatRecommendShare(row.share),
        variant: 'domain' as const,
        payload: { domain: row.domain },
      })),
    })
  }

  const hasActionable = banners.length > 0 || noisyDomains.length > 0
  let summary = hasActionable
    ? `近 ${hours}h 共 ${formatLocaleNumber(total)} 条；传感器类约占 ${Math.round(sensorShare * 100)}%`
    : '当前 EventLog 写入结构较为合理'

  // 总量大且未启用分级：追加分级存储建议（默认已开；仅显式关闭时提示）
  if (config.eventLogTierEnabled === false && total > 2000) {
    summary += '；可考虑启用分级存储'
    banners.push({
      id: 'tier',
      label: '建议启用 EventLog 分级（Tier）策略',
      actionLabel: '高级参数 · 运维',
      actionTo: '/settings?tab=params&section=ops',
    })
  }

  return buildRecommendInsight({
    domain: empty.domain,
    title: empty.title,
    summary,
    hasActionable: hasActionable || banners.length > 0,
    banners,
    groups,
    linkTo: '/settings?tab=connection&section=entities',
    linkLabel: empty.linkLabel,
  })
}