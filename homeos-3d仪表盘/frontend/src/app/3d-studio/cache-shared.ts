/** IndexedDB 持久缓存的公共件：诊断日志 + 带超时的一次性任务。 */

/** URL 上是否带了 `?performance-diagnostics=1`。 */
export function cacheDiagnosticsEnabled(env) {
  return new URLSearchParams(env.location?.search || "").get("performance-diagnostics") === "1";
}

/** 生成 `log(event)`：仅在诊断开关打开时打印 `[prefix]` 与当前 stats 快照。 */
export function createCacheLogger(env, prefix, stats) {
  const isEnabled = cacheDiagnosticsEnabled(env);
  return (event) => {
    isEnabled &&
      env.console?.info(
        prefix,
        JSON.stringify({
          event: event,
          ...stats,
        }),
      );
  };
}

/** 跑一次性任务并加超时：任务用 `settle(result)` 交付结果； */
export function runCacheTask(env, task, { duration, onTimeout }) {
  return new Promise((resolve) => {
    let isSettled = false;
    const settle = (result) => {
        isSettled || ((isSettled = true), env.clearTimeout(timerId), resolve(result));
      },
      timerId = env.setTimeout(() => {
        (onTimeout?.(), settle(null));
      }, duration);
    try {
      task(settle);
    } catch {
      settle(null);
    }
  });
}
