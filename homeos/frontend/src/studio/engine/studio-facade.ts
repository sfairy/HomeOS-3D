/**
 * 3D 户型绘制引擎 facade。
 */
import { createFacadeRuntime } from './facade-runtime'
import type { EventBus } from './event-bus'
import type { ClipboardStateSnapshot, HistoryStateSnapshot, StudioCommand, StudioFacadeState } from './types'

type StudioCommandHandler = (command: StudioCommand) => void | Promise<void>

const DEFAULT_HISTORY: HistoryStateSnapshot = {
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
}

const DEFAULT_CLIPBOARD: ClipboardStateSnapshot = {
  canCopy: false,
  canPaste: false,
}

function defaultState(): StudioFacadeState {
  return {
    dirty: false,
    saveState: 'idle',
    history: { ...DEFAULT_HISTORY },
    clipboard: { ...DEFAULT_CLIPBOARD },
    workflowStep: null,
    activeTool: null,
    planFocus: false,
    libraryCollapsed: false,
  }
}

const runtime = createFacadeRuntime<StudioFacadeState, StudioCommand>(defaultState)

export function getStudioFacadeBus(): EventBus {
  return runtime.getBus()
}

export function getStudioFacadeState(): Readonly<StudioFacadeState> {
  return runtime.getState()
}

export function registerStudioCommandHandler(handler: StudioCommandHandler | null): void {
  runtime.registerHandler(handler)
}

export function dispatchStudioCommand(command: StudioCommand): void {
  runtime.dispatch(command)
}

export function patchStudioFacadeState(partial: Partial<StudioFacadeState>): void {
  runtime.patch(partial, (next, patch) => {
    if (patch.history) next.history = { ...patch.history }
    if (patch.clipboard) next.clipboard = { ...patch.clipboard }
    return next
  })
}

export function resetStudioFacade(): void {
  runtime.reset()
}
