/**
 * 实体同步推荐模块。
 *
 * 职责：
 * - 基于实体总数与同步策略，生成实体同步优化建议（banners + groups）；
 * - 识别实体过多需开启 registry 过滤、实体偏少需刷新、规模过大需调参等场景；
 * - 产出 RecommendInsightResult 供设置页连接 tab 渲染。
 *
 * 依赖：recommend.types 类型、locale-format 数字格式化工具。
 */
import type { RecommendInsightResult } from '@/utils/recommend/types'
import { formatLocaleNumber } from '@/utils/format/locale-format.util'
import { SETTINGS_ROUTES } from '@/utils/registry/settings-route.util'

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
export function buildEntitySyncRecommendations(
  input: EntitySyncRecommendInput,
): RecommendInsightResult {
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

  const hasActionable = banners.some(
    (b) => b.id === 'enable-sync-filter' || b.id === 'refresh-entities',
  )
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