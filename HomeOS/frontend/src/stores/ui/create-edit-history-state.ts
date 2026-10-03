/**
 * @file 布局编辑历史（撤销 / 重做）
 * @module stores/ui/create-edit-history-state
 * @description
 *  按楼层分栈的编辑历史管理系统，支持 undo / redo。
 *  关键路径说明：
 *  - 历史栈按 floorId 隔离，切换楼层时各自保留独立的撤销/重做栈
 *  - 每个快照仅记录当前楼层的 widgets + floatingWidgets（深拷贝）
 *  - pushEditHistory 默认 300ms 防抖，避免拖拽等连续操作产生过多快照；
 *    immediate=true 时跳过防抖立即推送；force=true 时跳过相同快照去重
 *  - undo/redo 通过 past/future 双栈实现：undo 弹出 past 顶部压入 future，
 *    redo 反之；栈顶始终代表"当前状态"，因此 canUndo 要求 past.length > 1
 *  - 历史栈上限 MAX_EDIT_HISTORY=40，超出时丢弃最旧快照
 *  依赖 Vue ref/computed、布局配置类型与 clonePlain 工具。
 */
import { ref, computed, type Ref } from 'vue'
import type { FloorConfig, FloorWidget, FloatingWidget, UILayoutConfig } from '@/types/layout'

/**
 * 单步快照：热点 widgets + 浮动组件 floatingWidgets。
 * 仅记录楼层级部件数据，不包含楼层本身的结构信息。
 */
interface FloorEditSnapshot {
  /** 热点部件列表（深拷贝） */
  widgets: FloorWidget[]
  /** 浮动部件列表（深拷贝） */
  floatingWidgets: FloatingWidget[]
}

/** createEditHistoryState 的依赖注入参数 */
interface EditHistoryDeps {
  /** 布局配置 */
  layoutConfig: UILayoutConfig
  /** 脏标志 ref */
  layoutDirty: Ref<boolean>
  /** 深拷贝工具函数 */
  clonePlain: <T>(value: T) => T
}

/** 编辑历史单楼层最大快照数，超出时丢弃最旧快照 */
const MAX_EDIT_HISTORY = 40

/**
 * 编辑模式 undo/redo（按楼层分栈，ui.store 拆分模块）。
 *
 * 维护 past/future 双栈实现撤销重做。栈顶快照代表当前已应用的状态，
 * 因此撤销时弹出 past 栈顶（当前状态）压入 future，再恢复新的栈顶。
 *
 * @param deps 依赖注入参数
 * @returns pushEditHistory / undoEdit / redoEdit / canUndoEdit / canRedoEdit / clearEditHistory
 */
export function createEditHistoryState(deps: EditHistoryDeps) {
  const { layoutConfig, layoutDirty, clonePlain } = deps

  // 按楼层 ID 隔离的 past 栈（已应用的历史快照，栈顶为当前状态）
  const editHistoryPastByFloor = ref<Record<string, FloorEditSnapshot[]>>({})
  // 按楼层 ID 隔离的 future 栈（撤销后可重做的快照）
  const editHistoryFutureByFloor = ref<Record<string, FloorEditSnapshot[]>>({})
  // 防抖定时器句柄，用于合并连续编辑操作
  let editHistoryDebounce: ReturnType<typeof setTimeout> | null = null

  /** 获取当前激活楼层 ID */
  function activeFloorId() {
    return layoutConfig.activeFloorId
  }

  /**
   * 确保指定楼层的历史栈已初始化。
   * 通过创建新对象引用触发响应式更新。
   * @param floorId 楼层 ID
   */
  function ensureFloorHistoryStacks(floorId: string) {
    if (!editHistoryPastByFloor.value[floorId]) {
      editHistoryPastByFloor.value = { ...editHistoryPastByFloor.value, [floorId]: [] }
    }
    if (!editHistoryFutureByFloor.value[floorId]) {
      editHistoryFutureByFloor.value = { ...editHistoryFutureByFloor.value, [floorId]: [] }
    }
  }

  /**
   * 对当前激活楼层做深拷贝快照。
   * @returns 包含 widgets 与 floatingWidgets 的快照
   */
  function snapshotActiveFloor(): FloorEditSnapshot {
    const floor = layoutConfig.floors.find((f: FloorConfig) => f.id === layoutConfig.activeFloorId)
    return {
      widgets: floor?.widgets ? clonePlain(floor.widgets) : [],
      floatingWidgets: floor?.floatingWidgets ? clonePlain(floor.floatingWidgets) : [],
    }
  }

  /**
   * 将快照恢复到指定楼层（深拷贝写入，断开引用）。
   * @param floor 目标楼层配置
   * @param snap 快照数据
   */
  function restoreFloorSnapshot(floor: FloorConfig, snap: FloorEditSnapshot) {
    floor.widgets = clonePlain(snap.widgets || [])
    floor.floatingWidgets = clonePlain(snap.floatingWidgets || [])
  }
  /**
   * 推送当前楼层快照到 past 栈。
   * - 默认 300ms 防抖，合并连续编辑（如拖拽）为单次快照
   * - immediate=true 时立即推送并取消待执行的防抖
   * - force=false 时与栈顶相同则跳过（去重）
   * - 推送后清空 future 栈（新操作使重做历史失效）
   * @param immediate 是否跳过防抖立即推送
   * @param force 是否跳过相同快照去重
   */
  function pushEditHistory(immediate = false, force = false) {
    const floorId = activeFloorId()
    ensureFloorHistoryStacks(floorId)
    const snap = JSON.stringify(snapshotActiveFloor())
    const push = () => {
      const past = editHistoryPastByFloor.value[floorId]
      const last = past[past.length - 1]
      // 去重：与栈顶完全相同则不重复入栈
      if (!force && last && JSON.stringify(last) === snap) return
      past.push(JSON.parse(snap))
      // 超出上限丢弃最旧快照
      if (past.length > MAX_EDIT_HISTORY) past.shift()
      // 新操作清空 future，使既有 redo 链失效
      editHistoryFutureByFloor.value = { ...editHistoryFutureByFloor.value, [floorId]: [] }
    }
    if (immediate) {
      if (editHistoryDebounce) {
        clearTimeout(editHistoryDebounce)
        editHistoryDebounce = null
      }
      push()
      return
    }
    if (editHistoryDebounce) clearTimeout(editHistoryDebounce)
    editHistoryDebounce = setTimeout(() => {
      editHistoryDebounce = null
      push()
    }, 300)
  }

  /** 清空所有楼层的 past/future 栈并取消待执行的防抖定时器 */
  function clearEditHistory() {
    editHistoryPastByFloor.value = {}
    editHistoryFutureByFloor.value = {}
    if (editHistoryDebounce) {
      clearTimeout(editHistoryDebounce)
      editHistoryDebounce = null
    }
  }

  /** 是否可撤销：past 栈至少需要 2 个快照（栈顶为当前态，撤销回到前一个） */
  const canUndoEdit = computed(() => {
    const past = editHistoryPastByFloor.value[activeFloorId()] || []
    return past.length > 1
  })
  /** 是否可重做：future 栈非空即可 */
  const canRedoEdit = computed(() => {
    const future = editHistoryFutureByFloor.value[activeFloorId()] || []
    return future.length > 0
  })

  /**
   * 撤销：将当前状态压入 future，弹出 past 栈顶并恢复前一个快照。
   * past.length <= 1 时无可撤销历史，直接返回。
   */
  function undoEdit() {
    const floorId = activeFloorId()
    ensureFloorHistoryStacks(floorId)
    const past = editHistoryPastByFloor.value[floorId]
    if (past.length <= 1) return
    const floor = layoutConfig.floors.find((f: FloorConfig) => f.id === floorId)
    if (!floor) return
    const future = editHistoryFutureByFloor.value[floorId]
    // 当前状态入 future 栈供后续 redo
    future.push(snapshotActiveFloor())
    // 弹出当前态，恢复到 past 新栈顶
    past.pop()
    restoreFloorSnapshot(floor, past[past.length - 1])
    layoutDirty.value = true
  }

  /**
   * 重做：从 future 弹出顶部快照，将当前状态压入 past，再恢复该快照。
   * future 为空时无可重做历史，直接返回。
   */
  function redoEdit() {
    const floorId = activeFloorId()
    ensureFloorHistoryStacks(floorId)
    const future = editHistoryFutureByFloor.value[floorId]
    if (future.length === 0) return
    const floor = layoutConfig.floors.find((f: FloorConfig) => f.id === floorId)
    if (!floor) return
    const past = editHistoryPastByFloor.value[floorId]
    const next = future.pop()!
    // 当前状态入 past 栈
    past.push(snapshotActiveFloor())
    // 恢复 future 顶部快照
    restoreFloorSnapshot(floor, next)
    layoutDirty.value = true
  }

  return {
    pushEditHistory,
    undoEdit,
    redoEdit,
    canUndoEdit,
    canRedoEdit,
    clearEditHistory,
  }
}