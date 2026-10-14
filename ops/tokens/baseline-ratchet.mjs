/**
 * 「有回退」容忍档的棘轮比对（纯函数 + 读写，供 `check-token-contract.mjs` 与注入式自检共用）。
 *
 * 为什么要棘轮：`var(--x, fallback)` 不会像无回退那样让整条声明失效，所以门禁一直把它算「可接受」
 * 并只打印前 20 条 —— 结果是这档**无人看守**：新增一处拼错的令牌名只要顺手带个回退就静默通过，
 * 而打印截断又让人看不见总量在涨。棘轮把「当前容忍集合」变成**逐项登记**的基线：
 *
 * - 新增项 → 红（要么定义令牌，要么显式跑 `--update` 认领，认领动作会出现在 diff 里）；
 * - 基线里的项消失 → 也红（要求 `--update` 收紧），否则基线会慢慢变成「历史最大集合」的废纸。
 */
import fs from 'node:fs'

/** 基线 JSON 的取键口径：`<file>|<name>`（行号会漂，不进键）。 */
export const BASELINE_KEY = 'toleratedWithFallback'

/**
 * 逐项比对。
 *
 * @param {string[]} current 当前容忍项（`<file>|<name>`，应已去重）
 * @param {string[]} baseline 基线里的容忍项
 * @returns {{added: string[], removed: string[], kept: string[], currentCount: number, baselineCount: number}}
 */
export function compareRatchet(current, baseline) {
  const cur = new Set(current)
  const base = new Set(baseline)
  return {
    added: current.filter((key) => !base.has(key)).sort(),
    removed: baseline.filter((key) => !cur.has(key)).sort(),
    kept: current.filter((key) => base.has(key)).sort(),
    currentCount: cur.size,
    baselineCount: base.size,
  }
}

/**
 * 读基线；文件缺失或形状不对时 `null`（调用方据此报错，而不是「读不到就放行」）。
 *
 * @param {string} file
 * @returns {string[] | null}
 */
export function readBaseline(file) {
  if (!fs.existsSync(file)) return null
  try {
    const parsed = JSON.parse(fs.readFileSync(file, 'utf8'))
    const keys = parsed?.[BASELINE_KEY]
    if (!Array.isArray(keys) || keys.some((key) => typeof key !== 'string')) return null
    return keys
  } catch {
    return null
  }
}

/**
 * 写基线（排序后落盘，保证 diff 是「真正的增删」而不是顺序抖动）。
 *
 * @param {string} file
 * @param {string[]} keys
 * @param {string} doc 写进 `_doc` 的口径说明
 */
export function writeBaseline(file, keys, doc) {
  const body = {
    _doc: doc,
    [BASELINE_KEY]: [...keys].sort(),
  }
  fs.writeFileSync(file, `${JSON.stringify(body, null, 2)}\n`, 'utf8')
}
