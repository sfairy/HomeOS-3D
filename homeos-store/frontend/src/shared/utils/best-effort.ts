/**
 * 「最佳努力」失败的统一出口：**可以降级，但不可以不留痕**。
 *
 * 商店前端原先散着十几处 `.catch(() => {})` 与「catch 块里只写一行『忽略』注释」的写法。
 * 它们分成两类，而代码里看不出是哪一类：
 *
 * 1. **可降级**（localStorage 不可用、popover API 不支持、退出登录接口打不通、后台
 *    刷新计数失败……）：失败后功能仍在，兜底值就是正确答案；
 * 2. **用户可感知**（商品目录、账号账单拉不下来）：兜底值等于「页面看着正常但内容是
 *    空的」，用户只会以为商店没上架。
 *
 * 现在两类都必须显式写出来：可降级的走这里（带作用域记一条 `console.warn`），
 * 用户可感知的必须 `toast` 出来。这样「静默吞掉」这件事在代码评审里是看得见的 ——
 * 再写 `.catch(() => {})` 会与这里的约定冲突，评审时一眼能挑出来。
 */

const PREFIX = "[store]";

/**
 * 记一条可降级的失败。
 *
 * 用 `console.warn` 而不是 `console.error`：这些失败都有明确兜底，打进 error 级别只会把
 * 真错误淹掉；但**必须**带上作用域，否则线上只说「Something went wrong」等于没说。
 */
export function reportBestEffort(scope: string, error: unknown): void {
  console.warn(`${PREFIX} ${scope}：失败但可降级，已使用兜底值`, error);
}

/**
 * `.catch()` 适配器：`void catalog.load().catch(logAndIgnore("后台商品目录"))`。
 *
 * 返回 `null`，与「调用方本来就没拿到数据」的取值一致，避免调用方再判一次 undefined。
 */
export function logAndIgnore(scope: string): (error: unknown) => null {
  return (error) => {
    reportBestEffort(scope, error);
    return null;
  };
}

/** 同步代码块的等价物（`localStorage` / `popover` / `history.replaceState` 这类）。 */
export function runBestEffort(scope: string, run: () => void): void {
  try {
    run();
  } catch (error) {
    reportBestEffort(scope, error);
  }
}
