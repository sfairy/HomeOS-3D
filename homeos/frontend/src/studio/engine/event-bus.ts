/**
 * 轻量事件总线：引擎 facade ↔ Vue 壳层。
 * 不依赖 Vue，可在命令式 boot 作用域内安全使用。
 */

export type EventHandler<T = unknown> = (payload: T) => void

export interface EventBus {
  on<T = unknown>(event: string, handler: EventHandler<T>): () => void
  off(event: string, handler: EventHandler): void
  emit<T = unknown>(event: string, payload?: T): void
  clear(): void
}

export function createEventBus(): EventBus {
  const listeners = new Map<string, Set<EventHandler>>()

  return {
    on<T = unknown>(event: string, handler: EventHandler<T>) {
      let set = listeners.get(event)
      if (!set) {
        set = new Set()
        listeners.set(event, set)
      }
      set.add(handler as EventHandler)
      return () => set!.delete(handler as EventHandler)
    },
    off(event: string, handler: EventHandler) {
      listeners.get(event)?.delete(handler)
    },
    emit<T = unknown>(event: string, payload?: T) {
      const set = listeners.get(event)
      if (!set) return
      for (const handler of [...set]) {
        try {
          handler(payload)
        } catch (error) {
          console.warn(`[studio-facade] listener error on "${event}"`, error)
        }
      }
    },
    clear() {
      listeners.clear()
    },
  }
}
