/**
 * 请求超时与外部取消的统一包装。
 *
 * 位置：通用工具层，被编辑器 / 舞台页里所有需要「限时完成且可被上层取消」的
 *   fetch 调用复用（例如读取 NAS 目录、拉取渲染缓存清单）。
 * 对外导出：withRequestTimeout。
 * 全局约定：抛出的错误用 `name` 区分语义 —— `TimeoutError` 表示超时，
 *   `AbortError` 表示调用方主动取消。调用方按 name 判断，不要匹配中文/英文文案。
 * 副作用：临时监听外部 AbortSignal 的 abort 事件，并在 finally 中注销监听、
 *   清除定时器，避免长时间存活的组件累积监听器。
 */

/**
 * 执行一次受超时约束的异步请求。
 *
 * 内部自建 AbortController 与外部传入的 signal 是「或」的关系：
 * 任一方触发都会中断真正的请求，且最终抛出的错误保留最初触发者的原始 reason，
 * 便于上层区分「用户切页取消」与「后端太慢超时」这两类完全不同的处置方式。
 *
 * @param {number} timeoutMs 超时毫秒数；到点后以 TimeoutError 中断请求。
 * @param {(signal: AbortSignal) => Promise<*>} runWithSignal 真正发起请求的回调，
 *   必须把收到的 signal 透传给 fetch，否则中断不会生效。
 * @param {AbortSignal} [externalSignal] 调用方自己的取消信号，可选。
 * @returns {Promise<*>} runWithSignal 的返回值。
 * @throws {Error} 超时（name 为 TimeoutError）、被外部取消（name 为 AbortError），
 *   或 runWithSignal 自身抛出的原始错误。
 */
export async function withRequestTimeout(timeoutMs, runWithSignal, externalSignal) {
  const requestAbortController = new AbortController();
  let abortReason;
  // 只记录并采用「第一次」中断的原因：超时与外部取消可能几乎同时发生，
  // 先到者的语义才是调用方真正关心的。
  const abortWithReason = reason => {
    if (!requestAbortController.signal.aborted) {
      abortReason = reason;
      requestAbortController.abort(reason);
    }
  };
  // 外部 signal 的 reason 未必是 Error（可能是字符串），因此缺省时补一个
  // 带 AbortError 名字的错误对象，保证上层拿到的始终是可用 name 判断的错误。
  const abortFromExternalSignal = () =>
    abortWithReason(
      externalSignal.reason ||
        Object.assign(new Error("Request aborted"), {
          name: "AbortError"
        })
    );
  // 进入函数时就已被取消：立刻失败，不必白白发起一次注定被丢弃的请求。
  if (externalSignal?.aborted) {
    abortFromExternalSignal();
    throw abortReason;
  }
  // once 是刻意的：一次请求最多被取消一次，自动摘除监听可避免长生命周期页面累积回调。
  externalSignal?.addEventListener("abort", abortFromExternalSignal, {
    once: true
  });
  // 超时同样走 abortWithReason，保证「第一个中断原因」这一优先级不被定时器打破。
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
    // 此时结果属于「过期数据」，必须丢掉而不是回给上层。
    if (requestAbortController.signal.aborted) {
      throw abortReason;
    }
    return result;
  } catch (caughtError) {
    // 已中断时统一抛中断原因，避免把 fetch 底层那句没有语义的 AbortError 透传出去。
    throw requestAbortController.signal.aborted ? abortReason : caughtError;
  } finally {
    // 定时器与监听器都必须无条件回收：成功、超时、业务报错三条路径都会走到这里。
    clearTimeout(timeoutHandle);
    externalSignal?.removeEventListener("abort", abortFromExternalSignal);
  }
}
