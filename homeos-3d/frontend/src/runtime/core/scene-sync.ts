/**
 * 场景同步轮询器：按固定间隔拉取「场景更新」，再交给调用方应用。
 */

type SceneSyncOptions = {
  eligible: () => boolean;
  read: (signal: AbortSignal) => Promise<unknown>;
  apply: (payload: unknown) => Promise<void> | void;
  interval?: number;
  schedule?: typeof setTimeout;
  cancel?: typeof clearTimeout;
};

/**
 * 启动周期性场景同步。
 */
export function startSceneSync({
  eligible: isEligible,
  read: readSceneUpdate,
  apply: applySceneUpdate,
  interval: intervalMs = 5000,
  schedule: scheduleTimeout = setTimeout,
  cancel: cancelTimeout = clearTimeout
}: SceneSyncOptions) {
  // 停止是「一票否决」的：一旦置位，在途请求的结果会被丢弃，也不再排下一轮。
  let isStopped = false;
  let timerId: ReturnType<typeof setTimeout> | undefined;
  let abortController: AbortController | null = null;
  // 连续失败次数；成功后清零，用于计算指数退避的倍数。
  let failureCount = 0;
  /**
   * 单轮同步：拉取 → 应用 → 排下一轮。
   */
  async function runSync() {
    if (!isStopped) {
      try {
        if (!isEligible()) {
          return;
        }
        abortController = new AbortController();
        const sceneUpdatePayload = await readSceneUpdate(abortController.signal);
        if (!isStopped && sceneUpdatePayload && isEligible()) {
          await applySceneUpdate(sceneUpdatePayload);
        }
        failureCount = 0;
      } catch {
        // 吞掉异常：同步是后台行为，不希望把错误暴露成未捕获的 Promise 拒绝。
        failureCount++;
      } finally {
        abortController = null;
        if (!isStopped) {
          // 指数退避：失败越多间隔越长，指数封顶 4（即最多 16 倍），
          timerId = scheduleTimeout(
            runSync,
            Math.min(60000, intervalMs * 2 ** Math.min(failureCount, 4))
          );
        }
      }
    }
  }
  timerId = scheduleTimeout(runSync, intervalMs);
  return () => {
    isStopped = true;
    cancelTimeout(timerId);
    // 中断在途请求，防止停止后仍有一次 apply 落到已经切走的场景上。
    abortController?.abort();
  };
}
