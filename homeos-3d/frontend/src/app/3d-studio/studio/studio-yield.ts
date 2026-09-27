/**
 * 让出主线程的两种粒度。烘焙阴影图集、预热着色器、连续读像素这类长任务必须在中间让路，
 */

type SchedulerLike = {
  yield?: () => Promise<void>;
};

type GlobalWithScheduler = typeof globalThis & {
  scheduler?: SchedulerLike;
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions
  ) => number;
};

/**
 * 让出主线程到「调度器优先级」；不支持 `scheduler.yield` 时退到下一个宏任务。
 */
export function yieldToScheduler(): Promise<void> {
  const root = globalThis as GlobalWithScheduler;
  if (root.scheduler?.yield) {
    return root.scheduler.yield();
  } else {
    return new Promise(resolveYield => setTimeout(resolveYield, 0));
  }
}

/** 让出主线程到「浏览器空闲」；不支持 `requestIdleCallback` 时退到下一个宏任务。 */
export function yieldToIdle(): Promise<void> {
  const root = globalThis as GlobalWithScheduler;
  if (root.scheduler?.yield) {
    return root.scheduler.yield();
  } else if (root.requestIdleCallback) {
    return new Promise(resolveIdleYield =>
      root.requestIdleCallback!(() => resolveIdleYield(), {
        timeout: 80
      })
    );
  } else {
    return new Promise(resolveYield => setTimeout(resolveYield, 0));
  }
}
