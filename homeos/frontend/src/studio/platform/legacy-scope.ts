/**
 * 一次性引导脚本的作用域回收器。
 *
 * 背景：3D 编辑器 / 户型图绘制 / 展示页的引导模块是从原项目整包搬过来的命令式单体
 * （`home.ts` 2.5 万行、`studio-app.ts` 3.5 万行），它们的全局副作用写法是「直接在顶层
 * `window.addEventListener(...)` / `setInterval(...)` / `new ResizeObserver(...).observe(...)`」。
 * 逐个改写成可回收形式等于重写单体，因此这里在**引导期间**临时接管这几类全局注册入口，
 * 把登记到的资源在卸载时统一释放。
 *
 * 只接管同步执行窗口：`scope.run(body)` 期间是单线程独占的，此刻注册的一定是引导模块自己的
 * 副作用；`body()` 返回后立即还原原生方法。之后异步回调里注册的监听不会被误记 —— 也就不
 * 会在卸载时被误删：外壳（MainLayout / Vue 运行时）在视图并存期间新挂的监听必须存活。
 *
 * 引导体可以把「需要访问体内作用域的显式回收」作为返回值传出来（见 `run` 的泛型返回）。
 */
export interface LegacyScope {
  /**
   * 在受管窗口内执行引导体，返回引导体的返回值（通常是一段显式回收逻辑），
   * 期间注册的全局监听 / 定时器 / 观察器会被登记以便回收。
   */
  run<T>(body: () => T): T
  /** 释放引导期间登记的全部监听、定时器与观察器（可重复调用）。 */
  dispose(): void
}

/** 创建某个引导模块的回收器。`scopeName` 仅用于诊断日志。 */
export function createLegacyScope(scopeName: string): LegacyScope {
  const disposers: Array<() => void> = []
  const timerIds = new Set<number>()
  const observers: Array<{ disconnect(): void }> = []
  let hasRun = false

  function run<T>(body: () => T): T {
    if (hasRun) {
      // 同一模块重复引导会让上一次的监听/定时器失去登记入口，等于泄漏。
      console.warn(`[legacy-scope] ${scopeName} 已引导过，请先 dispose 再 run。`)
      return body()
    }
    hasRun = true

    const globalObject = globalThis as any
    const listenerTargets: any[] = [globalObject, document as any]
    const restorers: Array<() => void> = []

    for (const target of listenerTargets) {
      const originalAdd = target.addEventListener
      const originalRemove = target.removeEventListener
      if (typeof originalAdd !== "function") continue
      target.addEventListener = function patchedAdd(type: string, listener: any, options: any): void {
        originalAdd.call(this, type, listener, options)
        disposers.push(() => originalRemove.call(this, type, listener, options))
      }
      restorers.push(() => {
        target.addEventListener = originalAdd
      })
    }

    const originalSetTimeout = globalObject.setTimeout
    const originalSetInterval = globalObject.setInterval
    const originalClearTimeout = globalObject.clearTimeout
    const originalClearInterval = globalObject.clearInterval

    const trackTimer = (timerId: any): any => {
      if (typeof timerId === "number") timerIds.add(timerId)
      return timerId
    }
    globalObject.setTimeout = function patchedSetTimeout(this: any, handler: any, delay?: any, ...rest: any[]) {
      return trackTimer(originalSetTimeout.call(this, handler, delay, ...rest))
    }
    globalObject.setInterval = function patchedSetInterval(this: any, handler: any, delay?: any, ...rest: any[]) {
      return trackTimer(originalSetInterval.call(this, handler, delay, ...rest))
    }
    // 模块自己清掉的定时器要从登记表移除：定时器 id 会被平台复用，
    // 残留条目会让卸载时误清一个已经属于别人的同名 id。
    globalObject.clearTimeout = function patchedClearTimeout(this: any, timerId: any) {
      if (typeof timerId === "number") timerIds.delete(timerId)
      return originalClearTimeout.call(this, timerId)
    }
    globalObject.clearInterval = function patchedClearInterval(this: any, timerId: any) {
      if (typeof timerId === "number") timerIds.delete(timerId)
      return originalClearInterval.call(this, timerId)
    }
    restorers.push(() => {
      globalObject.setTimeout = originalSetTimeout
      globalObject.setInterval = originalSetInterval
      globalObject.clearTimeout = originalClearTimeout
      globalObject.clearInterval = originalClearInterval
    })

    // 观察器：`new ResizeObserver(cb).observe(el)` 这种写法会让实例无处可寻，
    // 引导期接管构造入口即可在卸载时统一 disconnect。
    // 用「普通函数返回原生实例」而非 class 继承：MutationObserver / IntersectionObserver
    // 在部分浏览器下直接继承会抛 Illegal constructor。
    for (const observerName of ["ResizeObserver", "IntersectionObserver", "MutationObserver"] as const) {
      const OriginalObserver = globalObject[observerName]
      if (typeof OriginalObserver !== "function") continue
      const patchedObserver = function patchedObserver(...args: any[]) {
        const instance = new OriginalObserver(...args)
        if (instance && typeof instance.disconnect === "function") observers.push(instance)
        return instance
      }
      patchedObserver.prototype = OriginalObserver.prototype
      globalObject[observerName] = patchedObserver
      restorers.push(() => {
        globalObject[observerName] = OriginalObserver
      })
    }

    try {
      return body()
    } finally {
      for (const restore of restorers.reverse()) restore()
    }
  }

  function dispose(): void {
    hasRun = false
    while (disposers.length) {
      const disposer = disposers.pop()
      try {
        disposer?.()
      } catch {
        // 卸载阶段的清理失败不应阻断其余回收（监听目标可能已随 DOM 一起被移除）。
      }
    }
    while (observers.length) {
      const observer = observers.pop()
      try {
        observer?.disconnect()
      } catch {
        // 同上：观察目标可能已经不存在。
      }
    }
    for (const timerId of timerIds) {
      clearTimeout(timerId)
      clearInterval(timerId)
    }
    timerIds.clear()
  }

  return { run, dispose }
}
