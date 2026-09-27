/**
 * 请求超时与外部取消的统一包装。
 */

export async function withRequestTimeout<T>(
  timeoutMs: number,
  runWithSignal: (signal: AbortSignal) => Promise<T>,
  externalSignal?: AbortSignal | null,
): Promise<T> {
  const requestAbortController = new AbortController();
  let abortReason: unknown;
  const abortWithReason = (reason: unknown) => {
    if (!requestAbortController.signal.aborted) {
      abortReason = reason;
      requestAbortController.abort(reason);
    }
  };
  // 外部 signal 的 reason 未必是 Error（可能是字符串），因此缺省时补一个
  const abortFromExternalSignal = () =>
    abortWithReason(
      externalSignal?.reason ||
        Object.assign(new Error("Request aborted"), {
          name: "AbortError"
        })
    );
  // 进入函数时就已被取消：立刻失败，不必白白发起一次注定被丢弃的请求。
  if (externalSignal?.aborted) {
    abortFromExternalSignal();
    throw abortReason;
  }
  externalSignal?.addEventListener("abort", abortFromExternalSignal, {
    once: true
  });
  const timeoutHandle = setTimeout(
    () =>
      abortWithReason(
        Object.assign(new Error("Request timed out"), {
          name: "TimeoutError"
        })
      ),
    timeoutMs
  );
  try {
    const result = await runWithSignal(requestAbortController.signal);
    // 请求虽成功返回，但期间已被中断（超时与响应几乎同时到达的竞态），
    if (requestAbortController.signal.aborted) {
      throw abortReason;
    }
    return result;
  } catch (caughtError) {
    throw requestAbortController.signal.aborted ? abortReason : caughtError;
  } finally {
    // 定时器与监听器都必须无条件回收：成功、超时、业务报错三条路径都会走到这里。
    clearTimeout(timeoutHandle);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}
