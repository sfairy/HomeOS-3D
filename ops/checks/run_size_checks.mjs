/**
 * 体量棘轮批量入口：只剩「重复代码」一条。
 *
 * | 模块        | 守什么                  |
 * | ----------- | ----------------------- |
 * | duplicates  | jscpd 精确克隆          |
 *
 * 行数相关的检查已全部删除（连同脚本、基线与 `package.json` 条目）：
 *
 * - `check:code-size`（有效代码行 / 字符的总量棘轮）—— 总量变大不等于退化，
 *   按职责合并文件时行数本来就会有增有减；
 * - `audit:file-size`（单文件行数审计）—— 「多少行算巨型文件」是项目取舍，
 *   工具不该替项目给出默认定义。
 *
 * 巨型文件的 imports / deps 扇出仍可用 `audit:giant-files` 手动取证：它不判定
 * 行数（`--min-lines` 只是报告筛选参数），也不进 `gate:*` / `pre-push`。
 *
 * 注意：这两条行数检查曾被误判为「重构误删」而恢复过。删除是**项目决定**（见 README
 * 「行数不作任何判据」），不是重构副作用 —— 恢复它们会重新引入「按行数定义巨型文件」
 * 的门槛，与「一个文件 = 一个职责」的判据冲突。
 *
 * 为什么是子进程：`duplicates` 还有 `--update` / `--json` / `--report` 等模式；
 * 改造成统一函数接口要重写一份输出逻辑，而门禁只需要「跑起来、失败原样报」。
 *
 * 用法：
 * ```bash
 * bun run check:size
 * node ops/checks/run_size_checks.mjs --module dup
 * node ops/checks/run_size_checks.mjs --list
 * ```
 */
import process from 'node:process'

import { runBatch } from '../lib/batch.mjs'

const MODULES = [
  { name: 'duplicates', cmd: ['node', 'ops/checks/size/check_duplicates.mjs'], covers: ['check:duplicates'] },
]

process.exit(await runBatch({ modules: MODULES, label: '重复代码棘轮' }))
