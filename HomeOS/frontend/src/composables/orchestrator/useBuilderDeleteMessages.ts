/**
 * @file useBuilderDeleteMessages.ts
 * @module composables/orchestrator
 * @description 联动器 Builder 删除确认文案 composable。
 *
 * 职责：根据当前选中的删除目标（联动器/场景/脚本等）动态生成"本地删除"与"HA 删除"两条确认提示文案。
 *
 * 依赖：
 * - vue（computed、unref、MaybeRef）
 * - @/types/orchestrator-builder（OrchestratorSavedItem）
 */
import { computed, unref, type MaybeRef } from 'vue'
import type { OrchestratorSavedItem } from '@/types/orchestrator-builder'

/**
 * 联动器 Builder 删除确认文案。
 *
 * @param deleteTargetRef 当前删除目标（可为 ref/getter，目标缺失时退到 kindLabel）
 * @param kindLabel 删除对象的中文类别名（如"联动"/"场景"）
 * @returns deleteLocalMessage 本地删除确认文案；deleteHaMessage HA 删除确认文案
 */
export function useBuilderDeleteMessages(
  deleteTargetRef: MaybeRef<OrchestratorSavedItem | null | undefined>,
  kindLabel: string,
) {
  // 本地删除：仅删除 HomeOS 端数据，文案不引用 entity_id
  const deleteLocalMessage = computed(() => {
    const target = unref(deleteTargetRef)
    const name = target?.name || kindLabel
    return `确定要删除${kindLabel}「${name}」吗？此操作不可恢复。`
  })
  // HA 删除：会同步删除 Home Assistant 中的配置，文案优先使用 entity_id
  const deleteHaMessage = computed(() => {
    const target = unref(deleteTargetRef)
    const name = target?.name || target?.entity_id || kindLabel
    return `确定从 Home Assistant 删除${kindLabel}「${name}」吗？此操作将删除 HA 中的配置，不可恢复。`
  })
  return { deleteLocalMessage, deleteHaMessage }
}
