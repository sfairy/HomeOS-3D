/**
 * 户型绘制历史语义别名（从 studio-app 渐进剥离的文档层）。
 * 实际快照恢复仍由 studio-app 内闭包实现；此处仅固化命名约定，避免再误用 delete/duplicate 当 undo/redo。
 */

export type StudioHistoryFacadePatch = {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
}

export function buildStudioHistoryPatch(
  undoLen: number,
  redoLen: number,
): StudioHistoryFacadePatch {
  return {
    canUndo: undoLen > 0,
    canRedo: redoLen > 0,
    undoDepth: undoLen,
    redoDepth: redoLen,
  }
}
