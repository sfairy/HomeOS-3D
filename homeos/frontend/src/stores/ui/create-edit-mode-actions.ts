/**
 * @file 编辑模式行为
 * @module stores/ui/create-edit-mode-actions
 * @description
 *  布局编辑模式的顶层行为集合：楼层切换、进入/退出编辑模式、
 *  实体放置（placementEntity）的设置/清除/切换、退出确认流程。
 *  关键路径：
 *  - 进入编辑模式时清空并初始化编辑历史栈
 *  - 退出时若有未保存修改需弹确认框，确认后 reload 配置丢弃修改
 *  - 楼层切换时临时抑制 dirty 跟踪，避免误标记脏数据
 *  依赖 Vue nextTick 与多个外部注入的 ref / 方法。
 */
import { nextTick, type Ref } from 'vue'
import type { UILayoutConfig } from '@/types/layout'

/** 放置实体载荷：id 为 entity_id，type 为可选 widget 类型提示 */
interface PlacementEntityPayload {
  id: string
  type?: string
}

/** createEditModeActions 的依赖注入参数 */
interface EditModeActionsDeps {
  /** 布局配置 */
  layoutConfig: UILayoutConfig
  /** 脏标志 ref */
  layoutDirty: Ref<boolean>
  /** 编辑模式开关 ref */
  isEditMode: Ref<boolean>
  /** 当前选中部件 ID ref */
  selectedWidgetId: Ref<string | null>
  /** 当前放置实体 ref */
  placementEntity: Ref<PlacementEntityPayload | null>
  /** 退出编辑确认弹窗开关 ref */
  showExitEditConfirm: Ref<boolean>
  /** 临时抑制 dirty 跟踪的回调（楼层切换等批量操作时使用） */
  setSuppressDirtyTracking: (v: boolean) => void
  /** 推送编辑历史的回调 */
  pushEditHistory: (immediate?: boolean, force?: boolean) => void
  /** 清空编辑历史的回调 */
  clearEditHistory: () => void
  /** 重新加载配置的回调（丢弃本地修改） */
  loadConfig: () => Promise<void>
}

/**
 * 编辑模式：楼层切换、进入/退出、放置实体（layout 拆分模块）。
 *
 * 集中管理编辑模式的生命周期与楼层/放置实体状态，
 * 确保编辑历史的初始化与清理时机正确。
 *
 * @param deps 依赖注入参数
 * @returns 楼层切换、编辑模式开关、放置实体控制等行为函数
 */
export function createEditModeActions(deps: EditModeActionsDeps) {
  const {
    layoutConfig,
    layoutDirty,
    isEditMode,
    selectedWidgetId,
    placementEntity,
    showExitEditConfirm,
    setSuppressDirtyTracking,
    pushEditHistory,
    clearEditHistory,
    loadConfig,
  } = deps

  /**
   * 切换当前激活楼层。
   * 临时抑制 dirty 跟踪以避免楼层切换被误判为修改；
   * 编辑模式下立即推送历史快照，便于撤销回到切换前状态。
   * @param id 目标楼层 ID；与当前相同则跳过
   */
  function setActiveFloor(id: string): void {
    if (!id || layoutConfig.activeFloorId === id) return
    setSuppressDirtyTracking(true)
    layoutConfig.activeFloorId = id
    if (isEditMode.value) pushEditHistory(true)
    nextTick(() => {
      setSuppressDirtyTracking(false)
    })
  }

  /**
   * 切换编辑模式开关。
   * 退出时若有未保存修改，弹出退出确认框而不直接退出；
   * 进入时清空历史并推送初始快照；正常退出时重置选中/放置/脏标志。
   */
  function toggleEditMode() {
    if (isEditMode.value && layoutDirty.value) {
      showExitEditConfirm.value = true
      return
    }
    const entering = !isEditMode.value
    isEditMode.value = entering
    if (entering) {
      clearEditHistory()
      pushEditHistory(true)
    } else {
      selectedWidgetId.value = null
      placementEntity.value = null
      layoutDirty.value = false
      clearEditHistory()
    }
  }

  /**
   * 确认退出编辑模式：丢弃本地修改并重新加载远端配置。
   * 清空所有编辑态（选中/放置/历史/脏标志）后 await loadConfig 恢复。
   */
  async function confirmExitEditMode() {
    showExitEditConfirm.value = false
    isEditMode.value = false
    selectedWidgetId.value = null
    placementEntity.value = null
    layoutDirty.value = false
    clearEditHistory()
    await loadConfig()
  }

  /**
   * 设置当前放置实体。仅在编辑模式下生效。
   * @param payload 实体载荷，id 为必填
   */
  function setPlacementEntity(payload: PlacementEntityPayload): void {
    if (!isEditMode.value || !payload?.id) return
    placementEntity.value = { id: payload.id, type: payload.type }
  }

  /** 清除当前放置实体 */
  function clearPlacementEntity() {
    placementEntity.value = null
  }

  /**
   * 切换放置实体：若已选中同一实体则取消，否则设置为该实体。
   * 仅在编辑模式下生效。
   * @param payload 实体载荷
   */
  function togglePlacementEntity(payload: PlacementEntityPayload): void {
    if (!isEditMode.value || !payload?.id) return
    if (placementEntity.value?.id === payload.id) {
      placementEntity.value = null
    } else {
      placementEntity.value = { id: payload.id, type: payload.type }
    }
  }

  /** 取消退出编辑模式（用户在确认框点击"取消"） */
  function cancelExitEditMode() {
    showExitEditConfirm.value = false
  }

  return {
    setActiveFloor,
    toggleEditMode,
    confirmExitEditMode,
    setPlacementEntity,
    clearPlacementEntity,
    togglePlacementEntity,
    cancelExitEditMode,
  }
}