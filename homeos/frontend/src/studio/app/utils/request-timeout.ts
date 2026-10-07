/** 给一次请求加超时与外部取消。
 *
 * @param timeoutMs 超时毫秒数
 * @param request 实际发起请求的函数，收到内部 AbortSignal
 * @param externalSignal 外部取消信号（可选；也可由调用方把自己的 signal 传进来）
 */
export async function withRequestTimeout(
  timeoutMs: number,
  request: (signal: AbortSignal) => Promise<any>,
  externalSignal?: AbortSignal,
): Promise<any> {
  const controller = new AbortController();
  let abortReason;
  const abortWith = (reason: any) => {
      controller.signal.aborted || ((abortReason = reason), controller.abort(reason));
    },
    abortFromSignal = () =>
      abortWith(
        externalSignal!.reason ||
          Object.assign(new Error("Request aborted"), {
            name: "AbortError",
          }),
      );
  if (externalSignal?.aborted) throw (abortFromSignal(), abortReason);
  externalSignal?.addEventListener("abort", abortFromSignal, {
    once: true,
  });
  const timerId = setTimeout(
    () =>
      abortWith(
        Object.assign(new Error("Request timed out"), {
          name: "TimeoutError",
        }),
      ),
    timeoutMs,
  );
  try {
    const result = await request(controller.signal);
    if (controller.signal.aborted) throw abortReason;
    return result;
  } catch (requestError: any) {
    throw controller.signal.aborted ? abortReason : requestError;
  } finally {
    (clearTimeout(timerId), externalSignal?.removeEventListener("abort", abortFromSignal));
  }
}
