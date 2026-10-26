/** 场景同步轮询器的定时器句柄类型（浏览器 / @types/node 两种环境都成立）。 */
type SceneSyncTimerHandle = ReturnType<typeof setTimeout>;

/**
 * 场景同步轮询的依赖契约。
 *
 * 之前整个参数表是 `any`：任何一处把 `eligible` / `read` / `apply` 写错（少传、传错签名）
 * 都只会在运行时表现成「户型永远不刷新」，类型检查完全看不见。这里把三个回调显式化。
 */
export interface SceneSyncOptions {
  /** 是否允许本次拉取（忙碌 / 页面隐藏 / 编辑态时跳过）。 */
  eligible: () => boolean;
  /** 拉取远端场景；`signal` 用于卸载时取消在途请求。 */
  read: (signal: AbortSignal) => Promise<unknown>;
  /** 应用远端场景（同步或异步均可，返回值忽略）。 */
  apply: (scene: unknown) => unknown | Promise<unknown>;
  /** 轮询间隔（毫秒），默认 5000。 */
  interval?: number;
  /** 定时器实现（默认 `setTimeout`，测试可注入假定时器）。 */
  schedule?: (callback: () => void, delayMs: number) => SceneSyncTimerHandle;
  /** 取消定时器实现（默认 `clearTimeout`）。 */
  cancel?: (handle: SceneSyncTimerHandle) => void;
}

export function startSceneSync({
  eligible: isEligible,
  read: readScene,
  apply: applyScene,
  interval: intervalMs = 5000,
  schedule = setTimeout,
  cancel = clearTimeout,
}: SceneSyncOptions): () => void {
  let isStopped = false,
    timerHandle: SceneSyncTimerHandle | undefined,
    abortController: AbortController | null,
    failureCount = 0;
  async function poll() {
    if (!isStopped)
      try {
        if (!isEligible()) return;
        abortController = new AbortController();
        const scene = await readScene(abortController.signal);
        (!isStopped && scene && isEligible() && (await applyScene(scene)), (failureCount = 0));
      } catch (error: unknown) {
        // 同一个同步失败会按 5s → 10s → … → 60s 退避反复重试；静默吞掉时用户只看到
        // 「户型一直不刷新」，日志里一条线索都没有。首两次留痕，之后只计数避免刷屏。
        failureCount++;
        if (failureCount <= 2) {
          if (error instanceof Error && error.name === "AbortError") return;
          window.HomeOSLog?.warn?.(error, { phase: "scene-sync-poll", failureCount });
          console.warn("[scene-sync] 场景同步失败", error);
        }
      } finally {
        ((abortController = null),
          isStopped ||
            (timerHandle = schedule(
              poll,
              Math.min(60000, intervalMs * 2 ** Math.min(failureCount, 4)),
            )));
      }
  }
  return (
    (timerHandle = schedule(poll, intervalMs)),
    () => {
      ((isStopped = true), cancel(timerHandle as SceneSyncTimerHandle), abortController?.abort());
    }
  );
}
