/** Studio 引擎 facade 共享类型 */

type SaveStateKind = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

/**
 * 工作区主视图。
 *
 * - `plan`：平面绘制为主（默认）。中栏画布最大，右栏是 3D 预览 + 属性。
 * - `model`：3D 预览为主。右栏放大成主编辑区，中栏收窄成辅助画布。
 *
 * 只切列宽与面板权重，**不移动 DOM**：3D 画布一旦离开原节点就会丢 WebGL 上下文，
 * 重建比切布局贵两个数量级。状态唯一真源在 `studio-floorplan.store`，壳层直接读它，
 * 不进 facade（facade 是引擎向壳层单向广播的通道，壳层自有的视图偏好不该塞进去）。
 */
export type WorkspaceView = 'plan' | 'model'

export interface HistoryStateSnapshot {
  canUndo: boolean
  canRedo: boolean
  undoDepth: number
  redoDepth: number
}

export interface SelectionSnapshot {
  ids: string[]
  primaryId: string | null
}

export interface EditorFacadeState {
  projectId: string | null
  projectName: string
  pagePath: string | null
  dirty: boolean
  saveState: SaveStateKind
  history: HistoryStateSnapshot
  selection: SelectionSnapshot
  canvasZoom: number
  leftCollapsed: boolean
  rightCollapsed: boolean
}

/**
 * 复制 / 粘贴可用性。
 *
 * `canCopy` 跟随当前选择（单选或框选都算），`canPaste` 跟随内部剪贴板是否为空。
 * 放在 facade 里而不是由壳层自己算：选择状态与剪贴板都只存在于引擎闭包内，
 * 壳层拿不到，只能靠引擎在变化时 patch 一次。
 */
export interface ClipboardStateSnapshot {
  canCopy: boolean
  canPaste: boolean
}

export interface StudioFacadeState {
  dirty: boolean
  saveState: SaveStateKind
  history: HistoryStateSnapshot
  clipboard: ClipboardStateSnapshot
  workflowStep: string | null
  activeTool: string | null
  planFocus: boolean
  libraryCollapsed: boolean
  /**
   * 0.8.9 地面分区选区。只带**显示需要的最小信息**（标题 / 可选数量 / 能否切分），
   * 几何留在 app 层 —— engine 不依赖 3D 编辑器的类型。
   */
  floorRegion: { label: string; regionCount: number; canSplit: boolean } | null
}

export interface DisplayFacadeState {
  panEnabled: boolean
  zoomEnabled: boolean
  viewLocked: boolean
  embedded: boolean
  floorId: string | null
}

export type EditorCommand =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'save' }
  | { type: 'selectAll' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'delete' }
  | { type: 'setZoom'; zoom: number }
  | { type: 'fitZoom' }
  | { type: 'setLeftCollapsed'; collapsed: boolean }
  | { type: 'setRightCollapsed'; collapsed: boolean }
  | { type: 'openFloorplan' }
  | {
      type: 'align'
      mode: 'left' | 'center' | 'right' | 'top' | 'middle' | 'bottom' | 'distribute-x' | 'distribute-y'
    }

export type StudioCommand =
  | { type: 'undo' }
  | { type: 'redo' }
  | { type: 'delete' }
  | { type: 'copy' }
  | { type: 'paste' }
  | { type: 'mirror' }
  | { type: 'rotate' }
  | { type: 'setTool'; tool: string }
  | { type: 'setWorkflowStep'; step: string }
  | { type: 'setPlanFocus'; focus: boolean }
  | { type: 'setLibraryCollapsed'; collapsed: boolean }

export type DisplayCommand =
  | { type: 'setViewLocked'; locked: boolean }
  | { type: 'resetCamera' }
  | { type: 'setFloor'; floorId: string }
