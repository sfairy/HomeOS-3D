/**
 * 场景同步轮询器：按固定间隔拉取「场景更新」，再交给调用方应用。
 *
 * 需要与后端 / HA 保持一致的所有 3D 场景都用它做增量同步；本身不做渲染，也不认识具体场景
 * 结构，只负责调度与失败退避。对外提供 startSceneSync，启动后立即返回一个「停止」函数。
 * read/apply 由调用方注入；apply 只在「未停止且仍是候选场景」时调用，避免场景已被切走后写入迟到数据。
 */

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
}) {
  // 停止是「一票否决」的：一旦置位，在途请求的结果会被丢弃，也不再排下一轮。
  let isStopped = false;
  let timerId;
  let abortController;
  // 连续失败次数；成功后清零，用于计算指数退避的倍数。
  let failureCount = 0;
  /**
   * 单轮同步：拉取 → 应用 → 排下一轮。
   * 失败只累加计数、不向上抛；永远在 finally 里续上下一次调度，否则一次异常就会让同步停摆。
   */
  async function runSync() {
    if (!isStopped) {
      try {
        if (!isEligible()) {
          return;
        }
        abortController = new AbortController();
        const sceneUpdatePayload = await readSceneUpdate(abortController.signal);
        // 请求期间可能被停止或场景已切换，这里再查一次，避免写入过期数据。
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
          // 总间隔再封顶 60 秒，避免长时间离线后定时器被撑到不可用的量级。
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
