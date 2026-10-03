/**
 * 并发限制的异步迭代器：用固定 worker 池消费任务队列，避免一次性发起过多并发。
 *
 * 所属模块：backend/src/common/utils
 * 职责：
 *   - 限制同时运行的异步任务数量，避免下游（HA / 数据库 / 第三方 API）被并发击穿；
 *   - 结果按输入顺序写入 results 数组（不按完成顺序），调用方拿到的结果可按下标对齐；
 *   - 可选 AbortSignal：每取下一项前检查中止信号，及时抛出 AbortError 终止剩余 worker。
 * 关键依赖：无外部依赖，纯 Promise + AbortSignal。
 */
/**
 * 限制并发执行异步任务，保持结果顺序与输入一致；可选 AbortSignal 在下一项开始前中止。
 *
 * @param items       输入项数组
 * @param concurrency 最大并发数（实际值会夹紧到 [1, items.length]）
 * @param fn          单项异步任务，接收 item 与 index
 * @param signal      可选中止信号
 * @returns 与 items 同序的结果数组
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>,
  signal?: AbortSignal,
): Promise<R[]> {
  if (items.length === 0) return [];
  signal?.throwIfAborted();
  const limit = Math.max(1, Math.min(concurrency, items.length));
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (true) {
      signal?.throwIfAborted();
      const i = nextIndex++;
      if (i >= items.length) return;
      results[i] = await fn(items[i], i);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => worker()));
  return results;
}
