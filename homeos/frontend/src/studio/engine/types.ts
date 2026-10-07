/** Studio 引擎 facade 共享类型 */

export type SaveStateKind = 'idle' | 'dirty' | 'saving' | 'saved' | 'error'

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

export interface StudioFacadeState {
  dirty: boolean
  saveState: SaveStateKind
  history: HistoryStateSnapshot
  workflowStep: string | null
  activeTool: string | null
  planFocus: boolean
  libraryCollapsed: boolean
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
      mode:
        | 'left'
        | 'center'
        | 'right'
        | 'top'
        | 'middle'
        | 'bottom'
        | 'distribute-x'
        | 'distribute-y'
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
