/**
 * 模板实体 slot 校验 composable
 *
 * 模块：orchestrator（联动器）
 * 职责：
 *  - 基于 entType 计算必填 slot 集合，识别缺失项
 *  - 为 slot 行提供 CSS 类名，区分「必填未填/可选未填/已填」三种状态
 * 依赖：template-slot-required.util（必填规则与已填判定）
 */
import { computed, type Ref } from 'vue'
import {
  getMissingRequiredGroups,
  getRequiredSlotKeySet,
  isSlotFilled,
  isSlotRequired,
} from '@/utils/template/slot-required.util'

/**
 * 模板实体 slot 校验 composable 入口
 * @param entType 当前实体类型 ref
 * @param slots 当前 slot 字典（key -> entity_id）
 * @returns 必填 key 集合、缺失项、行样式判定等
 */
export function useTemplateEntitySlotValidation(
  entType: Ref<string>,
  slots: Record<string, string>,
) {
  /** 当前类型的必填 slot key 集合 */
  const requiredKeySet = computed(() => getRequiredSlotKeySet(entType.value))
  /** 缺失的必填 slot 分组（按组聚合，便于 UI 高亮整组） */
  const missingRequiredGroups = computed(() => getMissingRequiredGroups(entType.value, slots))
  /** 缺失必填 slot 的组数 */
  const missingRequiredCount = computed(() => missingRequiredGroups.value.length)
  /** 是否存在缺失的必填 slot（用于保存按钮禁用判定） */
  const hasMissingRequired = computed(() => missingRequiredCount.value > 0)

  /** 判断指定 slot 是否为必填 */
  function slotIsRequired(slotKey: string) {
    return isSlotRequired(entType.value, slotKey)
  }

  /** 判断指定 slot 是否已填值 */
  function slotIsFilled(slotKey: string) {
    return isSlotFilled(slots, slotKey)
  }

  /**
   * 计算 slot 行的 CSS 类名
   * @param slotKey slot 标识
   * @returns 已填返回空串；必填未填返回 'wr-slot--required-empty'；可选未填返回 'wr-slot--optional-empty'
   */
  function slotRowClass(slotKey: string) {
    if (slotIsFilled(slotKey)) return ''
    if (slotIsRequired(slotKey)) return 'wr-slot--required-empty'
    return 'wr-slot--optional-empty'
  }

  return {
    requiredKeySet,
    missingRequiredGroups,
    missingRequiredCount,
    hasMissingRequired,
    slotIsRequired,
    slotIsFilled,
    slotRowClass,
  }
}