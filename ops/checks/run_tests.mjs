/**
 * 测试批量入口：三类断言收成一个门禁步骤。
 *
 * | 模块 | 内容 |
 * | --- | --- |
 * | `ts` | `ops/checks/unittests/*.test.ts`（bun test） |
 * | `py` | `ops/checks/unittests/test_*.py`（stdlib unittest） |
 * | `selftests` | 19 个业务规则自检 |
 *
 * 失败语义：不是「先失败即停」—— 三段都跑完再汇总。测试本来就该一次看到全部失败，
 * 逐个修比反复重跑省事；任一模块失败即整体退出 1。
 *
 * 用 `inherit` 模式：测试输出带行号与堆栈，缓冲后重排反而更难读。
 *
 * 用法：
 * ```bash
 * bun run check:tests
 * bun run check:tests -- --module selftests
 * node ops/checks/run_tests.mjs --list
 * ```
 */
import process from 'node:process'

import { runBatch } from '../lib/batch.mjs'

const MODULES = [
  { name: 'ts', cmd: ['bun', 'test', 'ops/checks/unittests'], covers: ['check:unit-tests'] },
  { name: 'py', cmd: ['node', 'ops/lib/py.mjs', 'ops/checks/unittests/run.py'], covers: ['check:backend-unit-tests'] },
  { name: 'selftests', cmd: ['node', 'ops/lib/py.mjs', 'ops/checks/run_selftests.py'], covers: ['check:selftests'] },
]

process.exit(await runBatch({ modules: MODULES, label: '测试', mode: 'inherit' }))
