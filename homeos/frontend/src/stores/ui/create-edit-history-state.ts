/**
 * @file 布局编辑历史（撤销 / 重做）
 * @module stores/ui/create-edit-history-state
 * @description
 *  单栈编辑历史（2D 楼层退役后不再按楼层分栈）。
 *  关键路径说明：
 *  - 每个快照记录顶层 floatingWidgets（深拷贝）
 *  - pushEditHistory 默认 300ms 防抖，避免拖拽等连续操作产生过多快照；
 *    immediate=true 时跳过防抖立即推送；force=true 时跳过相同快照去重
 *  - undo/redo 通过 past/future 双栈实现：undo 弹出 past 顶部压入 future，
 *    redo 反之；栈顶始终代表"当前状态"，因此 canUndo 要求 past.length > 1
 *  - 历史栈上限 MAX_EDIT_HISTORY=40，超出时丢弃最旧快照
 *  依赖 Vue ref/computed、布局配置类型与 clonePlain 工具。
 */
import { ref, computed, type Ref } from 'vue'
import type { FloatingWidget, UILayoutConfig } from '@/types/layout'

/** 单步快照：顶层浮动组件。 */
interface EditSnapshot {
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

/** 编辑历史最大快照数，超出时丢弃最旧快照 */
const MAX_EDIT_HISTORY = 40

/**
 * 编辑模式 undo/redo（单栈）。
 *
 * @param deps 依赖注入参数
 * @returns pushEditHistory / undoEdit / redoEdit / canUndoEdit / canRedoEdit / clearEditHistory
 */
export function createEditHistoryState(deps: EditHistoryDeps) {
  const { layoutConfig, layoutDirty, clonePlain } = deps

  // past 栈（已应用的历史快照，栈顶为当前状态）
  const editHistoryPast = ref<EditSnapshot[]>([])
  // future 栈（撤销后可重做的快照）
  const editHistoryFuture = ref<EditSnapshot[]>([])
  // 防抖定时器句柄，用于合并连续编辑操作
  let editHistoryDebounce: ReturnType<typeof setTimeout> | null = null

  /** 对当前顶层浮动组件做深拷贝快照。 */
  function snapshot(): EditSnapshot {
    return {
      floatingWidgets: clonePlain(layoutConfig.floatingWidgets || []),
    }
  }

  /** 将快照恢复到顶层（深拷贝写入，断开引用）。 */
  function restore(snap: EditSnapshot | undefined) {
    layoutConfig.floatingWidgets = clonePlain(snap?.floatingWidgets || [])
  }

  /**
   * 推送当前快照到 past 栈。
   * @param immediate 是否跳过防抖立即推送
   * @param force 是否跳过相同快照去重
   */
  function pushEditHistory(immediate = false, force = false) {
    const snap = JSON.stringify(snapshot())
    const push = () => {
      const past = editHistoryPast.value
      const last = past[past.length - 1]
      // 去重：与栈顶完全相同则不重复入栈
      if (!force && last && JSON.stringify(last) === snap) return
      past.push(JSON.parse(snap))
      // 超出上限丢弃最旧快照
      if (past.length > MAX_EDIT_HISTORY) past.shift()
      // 新操作清空 future，使既有 redo 链失效
      editHistoryFuture.value = []
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

  /** 清空 past/future 栈并取消待执行的防抖定时器 */
  function clearEditHistory() {
    editHistoryPast.value = []
    editHistoryFuture.value = []
    if (editHistoryDebounce) {
      clearTimeout(editHistoryDebounce)
      editHistoryDebounce = null
    }
  }

  /** 是否可撤销：past 栈至少需要 2 个快照（栈顶为当前态，撤销回到前一个） */
  const canUndoEdit = computed(() => editHistoryPast.value.length > 1)
  /** 是否可重做：future 栈非空即可 */
  const canRedoEdit = computed(() => editHistoryFuture.value.length > 0)

  /**
   * 撤销：将当前状态压入 future，弹出 past 栈顶并恢复前一个快照。
   * past.length <= 1 时无可撤销历史，直接返回。
   */
  function undoEdit() {
    const past = editHistoryPast.value
    if (past.length <= 1) return
    // 当前状态入 future 栈供后续 redo
    editHistoryFuture.value.push(snapshot())
    // 弹出当前态，恢复到 past 新栈顶
    past.pop()
    restore(past[past.length - 1])
    layoutDirty.value = true
  }

  /**
   * 重做：从 future 弹出顶部快照，将当前状态压入 past，再恢复该快照。
   * future 为空时无可重做历史，直接返回。
   */
  function redoEdit() {
    const future = editHistoryFuture.value
    if (future.length === 0) return
    const next = future.pop()!
    // 当前状态入 past 栈
    editHistoryPast.value.push(snapshot())
    // 恢复 future 顶部快照
    restore(next)
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
