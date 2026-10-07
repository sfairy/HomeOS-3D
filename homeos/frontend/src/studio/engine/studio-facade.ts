/**
 * 3D 户型绘制引擎 facade。
 */
import { createFacadeRuntime } from './facade-runtime'
import type { EventBus } from './event-bus'
import type { HistoryStateSnapshot, StudioCommand, StudioFacadeState } from './types'

export type StudioCommandHandler = (command: StudioCommand) => void | Promise<void>

const DEFAULT_HISTORY: HistoryStateSnapshot = {
  canUndo: false,
  canRedo: false,
  undoDepth: 0,
  redoDepth: 0,
}

function defaultState(): StudioFacadeState {
  return {
    dirty: false,
    saveState: 'idle',
    history: { ...DEFAULT_HISTORY },
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
  runtime.patch(partial, (next, p) => {
    if (p.history) next.history = { ...p.history }
    return next
  })
}

export function resetStudioFacade(): void {
  runtime.reset()
}
