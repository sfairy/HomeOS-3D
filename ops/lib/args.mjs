/**
 * 门禁脚本的命令行参数读取（`--flag` / `--key value` 两种形态）。
 *
 * 六条棘轮脚本此前各自抄了一遍这段 8 行代码，jscpd 会如实报成重复代码 ——
 * 门禁自己长重复是最没说服力的形态。这里只做最薄的一层：不引库、不改语义。
 *
 * 用法：
 *   import { parseArgs } from './args.mjs'
 *   const { has, value, repoRoot } = parseArgs()
 *   value('top', '10')      // --top 15  → '15'
 *   has('update')           // --update  → true
 */
import { resolve } from 'node:path'

export function parseArgs(argv = process.argv.slice(2)) {
  /** `--name value` 的取值；未给出时返回 fallback。 */
  const value = (name, fallback) => {
    const index = argv.indexOf(`--${name}`)
    return index >= 0 && argv[index + 1] ? argv[index + 1] : fallback
  }
  /** 是否出现某个布尔开关。 */
  const has = (name) => argv.includes(`--${name}`)
  return {
    argv,
    value,
    has,
    /** 仓库根：`--root` 优先，默认从脚本位置回退两级（`ops/lib/x.mjs` → `ops/` 的上两级 = 仓库根）。 */
    repoRoot: resolve(value('root', resolve(import.meta.dirname, '../..'))),
  }
}
