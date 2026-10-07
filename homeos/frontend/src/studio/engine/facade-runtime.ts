/**
 * 引擎 facade 共享运行时：bus / command handler / state patch 样板。
 * editor / studio / display 三个对外 facade 共用，避免三份重复实现。
 */
import { createEventBus, type EventBus } from './event-bus'

export interface FacadeRuntime<TState, TCommand> {
  getBus(): EventBus
  getState(): Readonly<TState>
  registerHandler(handler: ((command: TCommand) => void | Promise<void>) | null): void
  dispatch(command: TCommand): void
  patch(partial: Partial<TState>, normalize?: (next: TState, partial: Partial<TState>) => TState): void
  reset(): void
}

export function createFacadeRuntime<TState, TCommand>(
  createDefaultState: () => TState,
): FacadeRuntime<TState, TCommand> {
  let bus: EventBus | null = null
  let state: TState = createDefaultState()
  let commandHandler: ((command: TCommand) => void | Promise<void>) | null = null

  const getBus = (): EventBus => {
    if (!bus) bus = createEventBus()
    return bus
  }

  return {
    getBus,
    getState: () => state,
    registerHandler(handler) {
      commandHandler = handler
    },
    dispatch(command) {
      void commandHandler?.(command)
      getBus().emit('command', command)
    },
    patch(partial, normalize) {
      const merged = { ...state, ...partial }
      state = normalize ? normalize(merged, partial) : merged
      getBus().emit('state', state)
    },
    reset() {
      commandHandler = null
      state = createDefaultState()
      bus?.clear()
      bus = null
    },
  }
}
