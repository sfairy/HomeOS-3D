/**
 * @file useGeekCanvasHistory.ts
 * @module composables/orchestrator
 * @description GeekFlowCanvas 撤销/重做历史栈 composable。
 *
 * 职责：维护一个有上限的快照栈（nodes + edges），支持 push/undo/redo/reset，
 *      支持暂停（isPaused）与提示（onHint）。
 *
 * 依赖：
 * - vue（computed、ref、Ref）
 */
import { computed, ref, type Ref } from 'vue'

/** 画布快照：包含节点与连线数据 */
type GeekCanvasHistorySnapshot<TNodes = unknown, TEdges = unknown> = {
  nodes: TNodes
  edges: TEdges
}

/** 历史栈配置：克隆函数、快照读写回调、上限、暂停判断、提示回调 */
type UseGeekCanvasHistoryOptions<TNodes, TEdges> = {
  limit?: number
  clone: <T>(value: T) => T
  getSnapshot: () => GeekCanvasHistorySnapshot<TNodes, TEdges>
  applySnapshot: (snap: GeekCanvasHistorySnapshot<TNodes, TEdges>) => void
  isPaused?: () => boolean
  onHint?: (message: string) => void
}

/**
 * 画布历史栈：支持撤销/重做。
 *
 * @param options.limit 历史栈上限（默认 50）
 * @param options.clone 克隆函数（深拷贝快照避免引用共享）
 * @param options.getSnapshot 获取当前画布快照
 * @param options.applySnapshot 应用历史快照到画布
 * @param options.isPaused 是否暂停记录（如程序化变更时）
 * @param options.onHint 撤销/重做到边界时的提示回调
 * @returns pushHistory 入栈；undo 撤销；redo 重做；canUndo/canRedo 可用性；resetHistory 清空；historyStack/historyIndex 内部状态
 */
export function useGeekCanvasHistory<TNodes = unknown, TEdges = unknown>(
  options: UseGeekCanvasHistoryOptions<TNodes, TEdges>,
) {
  const HISTORY_LIMIT = options.limit ?? 50
  const historyStack: Ref<GeekCanvasHistorySnapshot<TNodes, TEdges>[]> = ref([])
  const historyIndex = ref(-1)

  /** 入栈当前快照；会丢弃指针之后的所有重做分支，超限时移除最早项 */
  function pushHistory() {
    if (options.isPaused?.()) return
    const snap = options.getSnapshot()
    // 截断当前指针后的重做分支，保证历史线性
    historyStack.value = historyStack.value.slice(0, historyIndex.value + 1)
    historyStack.value.push({
      nodes: options.clone(snap.nodes),
      edges: options.clone(snap.edges),
    })
    // 超出上限时丢弃最早一项，保持栈容量
    if (historyStack.value.length > HISTORY_LIMIT) historyStack.value.shift()
    historyIndex.value = historyStack.value.length - 1
  }

  /** 应用指定索引的快照（克隆后回写，避免内部状态被外部修改） */
  function restoreHistory(index: number) {
    const snap = historyStack.value[index]
    if (!snap) return
    options.applySnapshot({
      nodes: options.clone(snap.nodes),
      edges: options.clone(snap.edges),
    })
  }

  /** 撤销一步；指针已到最早时通过 onHint 提示并返回 false */
  function undo() {
    if (historyIndex.value <= 0) {
      options.onHint?.('没有可撤销的操作')
      return false
    }
    historyIndex.value -= 1
    restoreHistory(historyIndex.value)
    options.onHint?.('已撤销')
    return true
  }

  /** 重进一步；指针已到最新时通过 onHint 提示并返回 false */
  function redo() {
    if (historyIndex.value >= historyStack.value.length - 1) {
      options.onHint?.('没有可重做的操作')
      return false
    }
    historyIndex.value += 1
    restoreHistory(historyIndex.value)
    options.onHint?.('已重做')
    return true
  }

  // 可撤销/重做可用性（驱动 UI 按钮状态）
  const canUndo = computed(() => historyIndex.value > 0)
  const canRedo = computed(() => historyIndex.value < historyStack.value.length - 1)

  /** 清空历史栈与指针 */
  function resetHistory() {
    historyStack.value = []
    historyIndex.value = -1
  }

  return {
    pushHistory,
    undo,
    redo,
    canUndo,
    canRedo,
    resetHistory,
    historyStack,
    historyIndex,
  }
}
