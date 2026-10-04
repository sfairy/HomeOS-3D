/**
 * 集成绑定推荐模块。
 *
 * 职责：
 * - 推荐可绑定的危险传感器（烟雾/燃气/水浸），覆盖服务端建议与本地实体属性推断；
 * - 将绑定配置缺口（gaps）转换为推荐 chips；
 * - 按 section 过滤缺口归属，避免概览/子页重复展示；
 * - 产出 RecommendInsightResult 供绑定设置页渲染。
 *
 * 依赖：getEntityDomain、filterBindingGapsBySection（@homeos/shared）、entity-derived 显示名工具。
 */
import { getEntityDomain, filterBindingGapsBySection } from '@homeos/shared'
import type { BindingGapItem, BindingGapSection } from '@homeos/shared'
import type { RecommendInsightResult } from '@/utils/recommend/types'
import { buildRecommendInsight } from '@/utils/recommend/insight.util'
import { getEntityDisplayName } from '@/utils/entity/derived.util'

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
export function buildBindingsRecommendations(
  input: BindingsRecommendInput,
): RecommendInsightResult {
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
export function collectBoundHazardIds(
  haConfig: Record<string, unknown> | null | undefined,
): Set<string> {
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