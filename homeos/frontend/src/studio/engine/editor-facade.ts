/**
 * 仪表盘编辑器引擎 facade。
 * bootEditor 内注册 command handlers；Vue 壳层经此下发命令 / 订阅状态。
 */
import { createFacadeRuntime } from './facade-runtime'
import type { EventBus } from './event-bus'
import type { EditorCommand, EditorFacadeState, HistoryStateSnapshot, SelectionSnapshot } from './types'

export type EditorCommandHandler = (command: EditorCommand) => void | Promise<void>

const DEFAULT_HISTORY: HistoryStateSnapshot = {
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
}

const DEFAULT_SELECTION: SelectionSnapshot = { ids: [], primaryId: null }

function defaultState(): EditorFacadeState {
  return {
    projectId: null,
    projectName: '',
    pagePath: null,
    dirty: false,
    saveState: 'idle',
    history: { ...DEFAULT_HISTORY },
    selection: { ...DEFAULT_SELECTION },
    canvasZoom: 1,
    leftCollapsed: false,
    rightCollapsed: false,
  }
}

const runtime = createFacadeRuntime<EditorFacadeState, EditorCommand>(defaultState)

export function getEditorFacadeBus(): EventBus {
  return runtime.getBus()
}

export function getEditorFacadeState(): Readonly<EditorFacadeState> {
  return runtime.getState()
}

/** 引擎 boot 时注册命令处理器；teardown 时传 null。 */
export function registerEditorCommandHandler(handler: EditorCommandHandler | null): void {
  runtime.registerHandler(handler)
}

export function dispatchEditorCommand(command: EditorCommand): void {
  runtime.dispatch(command)
}

export function patchEditorFacadeState(partial: Partial<EditorFacadeState>): void {
  runtime.patch(partial, (next, p) => {
    if (p.history) next.history = { ...p.history }
    if (p.selection) next.selection = { ...p.selection }
    return next
  })
}

export function resetEditorFacade(): void {
  runtime.reset()
}
