/**
 * 让出主线程的两种粒度。烘焙阴影图集、预热着色器、连续读像素这类长任务必须在中间让路，
 * 否则这段时间页面完全不响应输入；两者都优先用 `scheduler.yield`（把续体放回当前任务的
 * 优先级队列，比退到下一个任务恢复得更快）。
 *
 * 三级退路统一放在这里，是因为「退到哪里」很容易各写一份并写歪：曾经的两种写法一件是退到
 * `requestAnimationFrame`，而**后台标签页里 rAF 根本不触发** —— 那个 await 再也不会 settle，
 * 调用方持有的「正在烘焙 / 正在导出」闩就永久挂住。工作室会被嵌入到宿主页里后台驱动渲染
 * （auto-diagram 那条链路），死锁在那种场景下是真会发生，不是理论问题。所以最底层统一退到
 * `setTimeout(0)`：它在后台标签页只会被节流到约 1 秒，仍会触发。
 *
 * 差别只在第二级：
 *   - `yieldToScheduler`：让出当前任务的优先级即可（两帧重活之间用）。
 *   - `yieldToIdle`：让到浏览器空闲期（写盘、预热这类「不着急但别抢渲染」的事），带 80ms 超时 ——
 *     长时间没有空闲窗口时必须强制继续，否则烘焙被无限推迟。
 */

/** 让出主线程到「调度器优先级」；不支持 `scheduler.yield` 时退到下一个宏任务。 */
export function yieldToScheduler() {
  if (globalThis.scheduler?.yield) {
    return globalThis.scheduler.yield();
  } else {
    return new Promise(resolveYield => setTimeout(resolveYield, 0));
  }
}

/** 让出主线程到「浏览器空闲」；不支持 `requestIdleCallback` 时退到下一个宏任务。 */
export function yieldToIdle() {
  if (globalThis.scheduler?.yield) {
    return globalThis.scheduler.yield();
  } else if (globalThis.requestIdleCallback) {
    return new Promise(resolveIdleYield =>
      requestIdleCallback(() => resolveIdleYield(), {
        timeout: 80
      })
    );
  } else {
    return new Promise(resolveYield => setTimeout(resolveYield, 0));
  }
}
