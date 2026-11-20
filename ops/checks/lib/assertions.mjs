/**
 * 门禁脚本共用的断言收集器。
 *
 * 为什么收进一处：每个纯函数门禁脚本的开头都是同一段「failures 数组 + 计数 + check +
 * near」，复制到第三个脚本就会被 `check:duplicates` 判成克隆（按行相似度算）。
 *
 * `near` 的默认容差是**相对**的（`epsilon * max(1, |a|, |b|)`），与「读数差 0.1mm」这类
 * 几何断言相配；需要绝对容差时显式传参。
 */
export function createAssertions() {
  const failures = []
  let assertions = 0
  return {
    check(label, condition, detail = '') {
      assertions += 1
      if (!condition) failures.push(`${label}${detail ? ` — ${detail}` : ''}`)
    },
    near(left, right, epsilon = 1e-6) {
      return Math.abs(left - right) <= epsilon * Math.max(1, Math.abs(left), Math.abs(right))
    },
    get failures() {
      return failures
    },
    get assertions() {
      return assertions
    },
  }
}
