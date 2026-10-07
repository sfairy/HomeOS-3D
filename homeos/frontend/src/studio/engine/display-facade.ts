/**
 * 总览 Display 引擎 facade（视角锁定 / 楼层 / 重置相机）。
 */
import { createFacadeRuntime } from './facade-runtime'
import type { EventBus } from './event-bus'
import type { DisplayCommand, DisplayFacadeState } from './types'

export type DisplayCommandHandler = (command: DisplayCommand) => void | Promise<void>

function defaultState(): DisplayFacadeState {
  return {
    panEnabled: true,
    zoomEnabled: true,
    viewLocked: false,
    embedded: false,
    floorId: null,
  }
}

const runtime = createFacadeRuntime<DisplayFacadeState, DisplayCommand>(defaultState)

export function getDisplayFacadeBus(): EventBus {
  return runtime.getBus()
}

export function getDisplayFacadeState(): Readonly<DisplayFacadeState> {
  return runtime.getState()
}

export function registerDisplayCommandHandler(handler: DisplayCommandHandler | null): void {
  runtime.registerHandler(handler)
}

export function dispatchDisplayCommand(command: DisplayCommand): void {
  runtime.dispatch(command)
}

export function patchDisplayFacadeState(partial: Partial<DisplayFacadeState>): void {
  runtime.patch(partial)
}

export function resetDisplayFacade(): void {
  runtime.reset()
}
