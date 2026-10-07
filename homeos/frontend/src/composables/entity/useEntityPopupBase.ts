/**
 * 实体弹窗通用基础组合式函数模块。
 *
 * 职责：
 * - 提供实体弹窗头部（名称、状态标签、状态颜色、活跃脉冲）的派生计算；
 * - 定义实体弹窗组件通用 props 与类型；
 * - 组装 liveEntity、entityName 与 HA service 调用入口，作为弹窗组件的统一基座。
 *
 * 依赖：vue 计算属性、entity-derived 名称解析、useLiveEntity、useHaEntityService、
 * 实体状态标签常量、HaEntityState 类型。
 */
import { computed, type ComputedRef, type Ref, type PropType } from 'vue'
import { popupDomainStateLabel } from '@/constants/entity-state-labels'
import { getEntityDisplayName } from '@/utils/entity/derived.util'
import { useLiveEntity } from '@/composables/entity/useLiveEntity'
import { useHaEntityService } from '@/composables/entity/useHaEntityService'
import type { HaEntityState } from '@/types/entity-store'

/** 实体引用类型：可为 Ref 或 ComputedRef，统一为只读快照。 */
type EntityRefLike = Ref<HaEntityState | Record<string, unknown> | null | undefined> | ComputedRef<HaEntityState | Record<string, unknown> | null | undefined>

/**
 * 共享的实体弹窗头部：名称、状态标签、颜色、活跃脉冲。
 *
 * 通过传入实体引用与可选的状态映射配置，派生弹窗头部所需的展示信息；
 * 状态标签优先使用 domain 专属映射，缺省时直接回退原始 state 字符串。
 *
 * @param entityRef 实体引用（Ref 或 ComputedRef）
 * @param options 配置项
 * @param {string} [options.stateLabelDomain] lock | cover | valve | vacuum 等 domain，用于查表获取状态文案
 * @param {Record<string, string>} [options.stateColorMap] 状态 → Tailwind 文本色类的映射
 * @param {(state: string | undefined) => boolean} [options.isActiveFn] 自定义"活跃"判断（默认非 off/unavailable/null）
 * @returns 头部所需的派生计算属性集合
 */
export function useEntityPopupHeader(
  entityRef: EntityRefLike,
  options: {
    stateLabelDomain?: string
    stateColorMap?: Record<string, string>
    isActiveFn?: (state: string | undefined) => boolean
  } = {},
) {
  const {
    // 默认空串，表示无 domain 映射，直接展示原始 state
    stateLabelDomain = '',
    // 默认无颜色映射，统一回退到中性灰
    stateColorMap = {} as Record<string, string>,
    // 默认活跃判断：非 off、非 unavailable、非 null/undefined
    isActiveFn = (state: string | undefined) =>
      state !== 'off' && state !== 'unavailable' && state != null,
  } = options
  // 实体友好名称（依赖 entity_id 与 attributes.friendly_name）
  const entityName = computed(() =>
    getEntityDisplayName(
      String((entityRef.value as HaEntityState | null | undefined)?.entity_id ?? ''),
      entityRef.value as HaEntityState | null | undefined,
    ),
  )
  // 当前 state 原始值
  const state = computed(() => (entityRef.value as HaEntityState | null | undefined)?.state)
  // 状态展示文案：优先 domain 映射，无映射或空 state 时回退占位符 '--'
  const stateLabel = computed(() => {
    const s = state.value
    if (!s) return '--'
    if (stateLabelDomain) {
      return popupDomainStateLabel(stateLabelDomain, s)
    }
    return s
  })
  // 状态对应文本色：命中映射则使用映射色，否则统一回退中性灰
  const stateColor = computed(() => {
    const s = state.value
    if (s && stateColorMap[s]) return stateColorMap[s]
    return 'text-slate-500'
  })
  // 活跃状态（用于脉冲指示等）
  const isActive = computed(() => isActiveFn(state.value))
  return { entityName, state, stateLabel, stateColor, isActive }
}

/**
 * 定义实体弹窗组件的 props 工厂。
 *
 * 用于在 `<script setup>` 中通过 `defineProps(useEntityPopupProps())` 复用，
 * 包含实体对象、相对坐标（百分比）、锚点绝对坐标等通用字段。
 *
 * @returns props 定义对象（带 const 断言）
 */
export function defineEntityPopupProps() {
  return {
    // 实体 ID（列表/详情打开时必传，避免 store 尚未 hydrate 时弹窗空白）
    entityId: { type: String, default: '' },
    // 实体原始对象（可能为 null）
    entity: { type: Object as PropType<Record<string, unknown> | null>, default: null },
    // 弹窗中心在视口中的相对位置（百分比），支持 number/string
    xPct: { type: [Number, String] as PropType<number | string>, default: 50 },
    yPct: { type: [Number, String] as PropType<number | string>, default: 50 },
    // 锚点绝对坐标（像素），用于贴附到触发元素
    anchorX: { type: Number as PropType<number | null>, default: null },
    anchorY: { type: Number as PropType<number | null>, default: null },
  } as const
}

/** 实体弹窗组件 props 的类型定义（与 defineEntityPopupProps 对应） */
export type EntityPopupBaseProps = {
  entity: Record<string, unknown> | null
  xPct: number | string
  yPct: number | string
  anchorX: number | null
  anchorY: number | null
  entityId?: string
}

/**
 * 实体弹窗通用基座：liveEntity、entityName、callService。
 *
 * 调用场景：作为各类实体控制弹窗（light/climate/cover 等）的统一初始化入口，
 * 通过 props.entityId 或 props.entity.entity_id 解析实体，并提供 HA 服务调用。
 *
 * @param props 组件 props，至少需提供 entity 或 entityId
 * @returns liveEntity 计算引用、entityRef 别名、entityName、callService 函数
 */
export function useEntityPopupBase(props: EntityPopupBaseProps) {
  // 优先使用显式 entityId，否则回退到 entity 对象内的 entity_id
  const liveEntity = useLiveEntity(
    () => props.entityId || (props.entity?.entity_id as string | undefined),
    () => props.entity,
  )
  // 暴露 entityRef 别名，方便上层使用统一命名
  const entityRef = computed(() => liveEntity.value)
  const { entityName } = useEntityPopupHeader(entityRef)
  const { callService } = useHaEntityService()

  return { liveEntity, entityRef, entityName, callService }
}