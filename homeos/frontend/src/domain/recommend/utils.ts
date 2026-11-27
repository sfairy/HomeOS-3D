import { getEntityDomain, getEntityLeaf, filterBindingGapsBySection, type BindingGapItem, type BindingGapSection, homeModeLogSourceLabel, type HomeModeTriggerLogLike } from '@homeos/shared'
import { type EventLogStatsSnapshot, type RecommendInsightResult, type RecommendBanner, type RecommendGroup } from '@/domain/recommend/types/recommend.types'
import { getEntityDisplayName } from '@/domain/entity/model/utils/derived.util'
import { formatLocaleNumber } from '@/kernel/utils/format'
import { SETTINGS_ROUTES } from '@/kernel/utils/registry/settings-route.util'

/** 告警规则推荐模块。 */

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
export function buildAlertRulesRecommendations(input: AlertRulesRecommendInput): RecommendInsightResult {
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

/** 集成绑定推荐模块。 */

/**
 * HA device_class → 危险类型映射。
 * 将 HA 设备类归一化为内部三类危险：smoke/gas/leak。
 */
const HAZARD_DEVICE_CLASS: Record<string, 'smoke' | 'gas' | 'leak'> = {
  smoke: 'smoke',
  gas: 'gas',
  carbon_monoxide: 'gas',
  methane: 'gas',
  moisture: 'leak',
  water: 'leak',
}

/** 危险类型 → 中文标签映射，用于 chips 的 meta 展示 */
const HAZARD_LABELS: Record<string, string> = {
  smoke: '烟雾',
  gas: '燃气',
  leak: '水浸',
}

/** 推荐分节类型：在共享 BindingGapSection 基础上增加 overview */
export type BindingsRecommendSection = BindingGapSection | 'overview'

/** 推荐输入中的实体结构（仅需 entity_id 与 attributes） */
export interface BindingsRecommendEntity {
  entity_id: string
  attributes?: Record<string, unknown>
}

/** 绑定推荐输入 */
interface BindingsRecommendInput {
  /** 绑定配置缺口列表 */
  gaps: BindingGapItem[]
  /** 本地可用实体列表（用于推断危险传感器） */
  entities: BindingsRecommendEntity[]
  /** 已绑定危险传感器 ID 集合，用于去重 */
  boundHazardIds: Set<string>
  /** 服务端预计算的危险传感器建议 */
  serverSuggestions?: Array<{ kind: string; entityId: string; label?: string }>
  /** 缺口归属过滤；默认 overview（全量） */
  section?: BindingsRecommendSection
  /**
   * 是否把 gaps 塞进推荐卡「配置缺口」组。
   * 概览/子页已有「完整性检查」时默认 false，避免重复。
   */
  includeGapChips?: boolean
  /** 是否包含危险传感器推荐 chips；天气/监控子页应为 false */
  includeHazardChips?: boolean
}

/**
 * 根据分节解析推荐卡跳转链接。
 *
 * @param section 当前分节
 * @returns 设置页绑定 tab 对应 section 的路由
 */
function resolveRecommendLinkTo(section: BindingsRecommendSection): string {
  if (section === 'overview' || section === 'external') {
    return '/settings?tab=bindings&section=overview'
  }
  return `/settings?tab=bindings&section=${section}`
}

/**
 * 构建集成绑定推荐结果。
 *
 * 算法流程：
 * 1. 按 section 过滤缺口 gaps；
 * 2. 若 includeHazardChips，先消费服务端建议，再扫描本地 binary_sensor 实体，
 *    通过 device_class 推断危险类型，去重后生成 hazard chips（上限 8）；
 * 3. 若 includeGapChips 且有缺口，将 severity=warn 标记为「重要」、其余「可选」；
 * 4. 根据 chips 与缺口严重度判定 hasActionable，生成对应 summary。
 *
 * @param input 绑定推荐输入
 * @returns 推荐结果对象
 */
export function buildBindingsRecommendations(input: BindingsRecommendInput): RecommendInsightResult {
  const {
    entities,
    boundHazardIds,
    serverSuggestions = [],
    section = 'overview',
    includeGapChips = false,
    // 默认仅 overview 与 security 分节展示危险传感器推荐
    includeHazardChips = section === 'overview' || section === 'security',
  } = input

  const gaps = filterBindingGapsBySection(input.gaps, section)
  const groups = []
  const hazardChips = []

  if (includeHazardChips) {
    const seen = new Set<string>()
    // 第一轮：消费服务端预计算建议（已带 kind 与 label）
    for (const item of serverSuggestions) {
      const id = String(item.entityId || '').trim()
      if (!id || boundHazardIds.has(id) || seen.has(id)) continue
      seen.add(id)
      hazardChips.push({
        id,
        label: item.label || id,
        meta: HAZARD_LABELS[item.kind] || item.kind,
        title: id,
        variant: 'entity' as const,
        payload: { entityId: id, kind: item.kind },
      })
    }

    // 第二轮：扫描本地 binary_sensor 实体，通过 device_class 推断危险类型
    for (const ent of entities) {
      const id = String(ent.entity_id || '').trim()
      if (!id || getEntityDomain(id) !== 'binary_sensor') continue
      if (boundHazardIds.has(id) || seen.has(id)) continue
      const deviceClass = String(ent.attributes?.device_class || '').toLowerCase()
      const kind = HAZARD_DEVICE_CLASS[deviceClass]
      if (!kind) continue
      seen.add(id)
      const name = getEntityDisplayName(id, ent)
      hazardChips.push({
        id,
        label: name,
        meta: HAZARD_LABELS[kind],
        title: id,
        variant: 'entity' as const,
        payload: { entityId: id, kind },
      })
      if (hazardChips.length >= 8) break
    }

    if (hazardChips.length) {
      groups.push({ id: 'hazard-sensors', label: '可绑定的危险传感器', chips: hazardChips })
    }
  }

  // 缺口 chips：warn 严重度标记「重要」，其余标记「可选」
  if (includeGapChips && gaps.length) {
    groups.push({
      id: 'gaps',
      label: '配置缺口',
      chips: gaps.slice(0, 8).map((gap) => ({
        id: gap.id,
        label: gap.label,
        meta: gap.severity === 'warn' ? '重要' : '可选',
        variant: 'link' as const,
        route: gap.route,
      })),
    })
  }

  const hasActionable = hazardChips.length > 0 || gaps.some((g) => g.severity === 'warn')
  // 摘要：有可操作项时罗列数量；仅可选项时提示基本完整；无缺口时提示完整
  const summary = hasActionable
    ? [
        hazardChips.length ? `发现 ${hazardChips.length} 个可绑定传感器` : '',
        gaps.length ? `${gaps.length} 项绑定缺口待完善` : '',
      ]
        .filter(Boolean)
        .join('，')
    : gaps.length
      ? '绑定基本完整，仍有少量可选项可补充'
      : '集成绑定配置完整'

  return buildRecommendInsight({
    domain: 'bindings',
    title: '集成绑定推荐',
    summary,
    meta: gaps.length ? `${gaps.length} 项缺口` : '无缺口',
    hasActionable,
    groups,
    linkTo: resolveRecommendLinkTo(section),
    linkLabel: '打开绑定设置',
  })
}

/**
 * 从 HA 配置中收集已绑定的危险传感器 ID 集合。
 *
 * 仅读取复数数组字段：hazardSmoke/Gas/LeakEntityIds。
 *
 * @param haConfig HA 配置对象
 * @returns 已绑定危险传感器 entity_id 集合
 */
export function collectBoundHazardIds(haConfig: Record<string, unknown> | null | undefined): Set<string> {
  const ids = new Set<string>()
  const keys = ['hazardSmokeEntityIds', 'hazardGasEntityIds', 'hazardLeakEntityIds']
  const hc = haConfig || {}
  for (const key of keys) {
    const raw = hc[key]
    if (!Array.isArray(raw)) continue
    for (const item of raw) {
      const id = String(item || '').trim()
      if (id) ids.add(id)
    }
  }
  return ids
}

/** 实体同步推荐模块。 */

/** 实体同步推荐输入 */
interface EntitySyncRecommendInput {
  /** 当前已加载实体总数 */
  totalCount: number
  /** 是否仅同步已启用且未隐藏的实体 */
  syncOnlyEnabledEntities: boolean
  /** IndexedDB 缓存是否已完成预热；undefined 表示未知 */
  cacheHydrated?: boolean
}

/**
 * 构建实体同步推荐结果。
 *
 * 判定规则（按优先级）：
 * 1. totalCount > 2000 且未开启过滤 → 建议开启「仅同步已启用实体」；
 * 2. 0 < totalCount < 100 → 实体偏少，建议刷新同步；
 * 3. totalCount > 5000 且已开启过滤 → 规模过大，建议调大 initialStatesWaitMs；
 * 4. 缓存未预热且实体 > 1000 → 提示等待 IndexedDB 预热。
 *
 * hasActionable 仅在「开启过滤」或「刷新实体」两类强建议时为 true。
 *
 * @param input 实体同步状态输入
 * @returns 推荐结果对象
 */
export function buildEntitySyncRecommendations(input: EntitySyncRecommendInput): RecommendInsightResult {
  const { totalCount, syncOnlyEnabledEntities, cacheHydrated } = input
  const banners = []
  const groups = []

  // 实体过多且未开启过滤：强建议开启 registry 过滤以减少同步压力
  if (totalCount > 2000 && !syncOnlyEnabledEntities) {
    banners.push({
      id: 'enable-sync-filter',
      label: '实体数量较多，建议开启「仅同步已启用且未隐藏的实体」',
      actionLabel: '一键开启',
    })
  }
  // 实体偏少：可能 HA 同步未完成，建议刷新
  if (totalCount > 0 && totalCount < 100) {
    banners.push({
      id: 'refresh-entities',
      label: '已加载实体偏少，建议刷新实体与 HA 同步',
      actionLabel: '刷新实体',
    })
  }
  // 规模过大：即使已过滤，仍建议调大初始状态等待时间
  if (totalCount > 5000 && syncOnlyEnabledEntities) {
    banners.push({
      id: 'perf-hint',
      label: '实体规模较大，可在高级参数调大 initialStatesWaitMs',
      actionLabel: '高级参数 · 前端',
      actionTo: '/settings?tab=params&section=frontend',
    })
  }
  // 缓存未预热：提示用户等待，避免操作时数据未就绪
  if (cacheHydrated === false && totalCount > 1000) {
    groups.push({
      id: 'cache',
      label: '优化建议',
      chips: [
        {
          id: 'cache-warm',
          label: '等待 IndexedDB 缓存预热完成后再操作',
          variant: 'default' as const,
        },
      ],
    })
  }

  const hasActionable = banners.some((b) => b.id === 'enable-sync-filter' || b.id === 'refresh-entities')
  return {
    domain: 'entity-sync',
    title: '实体同步建议',
    summary: hasActionable
      ? `当前共 ${formatLocaleNumber(totalCount)} 个实体，同步策略可进一步优化`
      : totalCount > 0
        ? `实体同步状态正常（${formatLocaleNumber(totalCount)} 个）`
        : '尚未加载实体，请先测试连接并刷新实体',
    meta: syncOnlyEnabledEntities ? '已启用 registry 过滤' : '未启用 registry 过滤',
    hasActionable,
    banners,
    groups,
    // 供其它页面（联动中心洞察等）跳转到连接 → 实体同步；本区卡片勿再渲染该自链
    linkTo: SETTINGS_ROUTES.connection('entities'),
    linkLabel: '打开实体同步',
  }
}

/** EventLog 性能调优推荐模块。 */

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
  /** 历史保留天数（来自 retention.eventLog） */
  retentionDays?: number
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
  const sensorCount = Number(stats.byDomain?.sensor || 0) + Number(stats.byDomain?.binary_sensor || 0)
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
  const retentionDays = Number(config.retentionDays) || 0
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
    .filter((row) => row.share >= 0.1 && ['sensor', 'binary_sensor', 'device_tracker', 'update'].includes(row.domain))
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

/** 事件日志记录筛选智能推荐 */

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

  const blockedDomainSet = new Set(current.mode === 'block' ? current.blockDomains : current.allowDomains)
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

/** 常用设备（收藏）推荐模块。 */

/**
 * 允许加入常用设备的设备域白名单。
 * 仅包含可被用户直接控制的执行器域。
 */
const FAVORITE_DOMAINS = ['light', 'switch', 'climate', 'cover', 'fan', 'media_player', 'lock'] as const

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
export function buildFavoritesRecommendations(input: FavoritesRecommendInput): RecommendInsightResult {
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

/** 家庭模式推荐模块。 */

/** 家庭模式触发日志条目（与 @homeos/shared HomeModeTriggerLogLike 对齐） */
type HomeModeTriggerLog = HomeModeTriggerLogLike

/** 家庭模式推荐输入 */
interface HomeModeRecommendInput {
  /** 当前所有家庭模式配置 */
  modes: Array<{ id: string; name: string; triggers?: unknown[] | string | null }>
  /** 近期触发日志，用于统计来源频次 */
  triggerLogs: HomeModeTriggerLog[]
}

/** 触发来源 → 中文标签（统一走 shared，避免本地子集落「其他」） */
function recommendSourceLabel(source: string): string {
  return homeModeLogSourceLabel(source)
}

/**
 * 构建家庭模式推荐结果。
 *
 * 算法流程：
 * 1. 筛选未配置自动触发的模式（triggers 为空数组/空 JSON 字符串/null）；
 * 2. 统计 triggerLogs 来源频次，取 Top 3 生成 chips；
 * 3. 「全员离家」触发 ≥3 次时，建议为离家模式配置自动触发；
 * 4. hasActionable 取决于存在未配置模式或有强建议 banner。
 *
 * @param input 家庭模式与触发日志输入
 * @returns 推荐结果对象
 */
export function buildHomeModeRecommendations(input: HomeModeRecommendInput): RecommendInsightResult {
  const { modes, triggerLogs } = input
  const banners = []
  const groups = []

  // 筛选未配置自动触发的模式：triggers 可能为数组/JSON 字符串/null
  const modesWithoutTriggers = modes.filter((m) => {
    const tr = m.triggers
    if (Array.isArray(tr)) return tr.length === 0
    if (typeof tr === 'string') {
      // 字符串形式需尝试 JSON.parse，解析失败视为未配置
      try {
        const parsed = JSON.parse(tr)
        return !Array.isArray(parsed) || parsed.length === 0
      } catch {
        return true
      }
    }
    return true
  })

  if (modesWithoutTriggers.length) {
    groups.push({
      id: 'no-triggers',
      label: '未配置自动触发',
      chips: modesWithoutTriggers.slice(0, 6).map((m) => ({
        id: m.id,
        label: m.name,
        meta: '手动',
        variant: 'default' as const,
        payload: { modeId: m.id },
      })),
    })
  }

  // 统计触发来源频次，source 缺失时回退为 'manual'
  const sourceCounts = new Map<string, number>()
  for (const log of triggerLogs) {
    const logSource = String(log.source || log.reason || 'manual')
    sourceCounts.set(logSource, (sourceCounts.get(logSource) || 0) + 1)
  }
  const topSources = [...sourceCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3)

  if (topSources.length) {
    // 「全员离家」频繁触发但仍为手动，强建议配置自动触发
    const everyoneLeftCount = sourceCounts.get('everyone_left') || 0
    if (everyoneLeftCount >= 3) {
      banners.push({
        id: 'everyone-left-trigger',
        label: '「全员离家」触发频繁，建议为离家模式配置自动触发',
        actionLabel: '查看模式',
      })
    }
    groups.push({
      id: 'trigger-sources',
      label: '近期触发来源',
      chips: topSources.map(([src, sourceKey]) => ({
        id: src,
        label: recommendSourceLabel(src),
        meta: String(sourceKey),
        variant: 'default' as const,
      })),
    })
  }

  const hasActionable = modesWithoutTriggers.length > 0 || banners.length > 0
  return {
    domain: 'home-mode',
    title: '家庭模式推荐',
    summary: hasActionable ? `${modesWithoutTriggers.length} 个模式仍仅支持手动切换` : '家庭模式触发配置较为完善',
    hasActionable,
    banners,
    groups,
    linkTo: '/settings?tab=home-mode',
    linkLabel: '编辑家庭模式',
  }
}

/** 推荐结果组装工具。 */

/** buildRecommendInsight 入参 */
interface BuildRecommendInsightInput {
  domain: string
  title?: string
  hasActionable: boolean
  /**
   * 摘要：可传完整字符串，或按 hasActionable 二选一的 actionable/idle。
   */
  summary: string | { actionable: string; idle: string }
  groups?: RecommendGroup[]
  banners?: RecommendBanner[]
  meta?: string
  linkTo?: string
  linkLabel?: string
}

/**
 * 组装 RecommendInsightResult。
 * 不参与领域判定，仅统一结果骨架。
 */
export function buildRecommendInsight(input: BuildRecommendInsightInput): RecommendInsightResult {
  const summary =
    typeof input.summary === 'string'
      ? input.summary
      : input.hasActionable
        ? input.summary.actionable
        : input.summary.idle

  return {
    domain: input.domain,
    title: input.title,
    summary,
    hasActionable: input.hasActionable,
    groups: input.groups,
    banners: input.banners,
    meta: input.meta,
    linkTo: input.linkTo,
    linkLabel: input.linkLabel,
  }
}

/** 全屋关闭推荐模块。 */

/** 全屋关闭推荐输入 */
interface WholeHomeOffRecommendInput {
  /** 被识别为「常开」的实体列表（可能漏关，也可能不应被关） */
  forgottenEntities: Array<{ entity_id?: string; entityId?: string; name?: string }>
  /** 已配置的排除实体 ID 列表，用于去重 */
  excludeEntityIds: string[]
}

/**
 * 构建全屋关闭推荐结果。
 *
 * 算法流程：
 * 1. 将 excludeEntityIds 转为集合用于去重；
 * 2. 遍历 forgottenEntities，跳过已排除项；
 * 3. 生成 chips（meta 标记「常开」），上限 6 个避免卡片过长。
 *
 * @param input 推荐输入
 * @returns 推荐结果对象
 */
export function buildWholeHomeOffRecommendations(input: WholeHomeOffRecommendInput): RecommendInsightResult {
  const excludeSet = new Set(input.excludeEntityIds.map((id) => String(id).trim()).filter(Boolean))
  const chips = []

  for (const item of input.forgottenEntities) {
    // 兼容 entity_id 与 entityId 两种字段命名
    const id = String(item.entity_id || item.entityId || '').trim()
    if (!id || excludeSet.has(id)) continue
    chips.push({
      id,
      label: item.name || getEntityLeaf(id),
      meta: '常开',
      title: id,
      variant: 'entity' as const,
      payload: { entityId: id },
    })
    if (chips.length >= 6) break
  }

  const hasActionable = chips.length > 0
  return {
    domain: 'whole-home-off',
    title: '全屋关闭推荐',
    summary: hasActionable ? `建议将 ${chips.length} 个常开设备加入排除列表，避免误关` : '排除列表已覆盖主要常开设备',
    hasActionable,
    groups: chips.length ? [{ id: 'exclude', label: '建议排除实体', chips }] : [],
    linkTo: '/settings?tab=general&section=whole-home-off',
    linkLabel: '全屋关闭设置',
  }
}
