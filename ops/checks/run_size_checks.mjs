/**
 * 体量棘轮批量入口：两条「只许降」的度量收成一个门禁步骤。
 *
 * 只保留与「巨型文件」定义无关的两条，判定口径**不合并**（各自的基线独立、各自可 `--update`）：
 *
 * | 模块        | 守什么                                |
 * | ----------- | ------------------------------------- |
 * | code-size   | 有效代码行 / 有效字符（总体膨胀）      |
 * | duplicates  | jscpd 精确克隆                        |
 *
 * `check_file_size.py`（单文件行数）与 `check_giant_files.mjs`（扇出）已移出门禁：
 * 两者都必须先回答「多少行算巨型文件」，而门禁不替项目决定这个定义。
 * 脚本保留为手动审计 `audit:file-size` / `audit:giant-files`，只在需要取证或拆分前评估时跑。
 *
 * 为什么是子进程：两条各自还有 `--update` / `--json` / `--report` 三种模式与详细提示；
 * 改造成统一函数接口要重写两份输出逻辑，而门禁只需要「一起跑、失败一起报」。
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
  {
    name: 'code-size',
    cmd: ['node', 'ops/checks/size/code-size.mjs', '--check', 'ops/checks/baselines/size/code-size-baseline.json'],
    covers: ['check:code-size'],
  },
  { name: 'duplicates', cmd: ['node', 'ops/checks/size/check_duplicates.mjs'], covers: ['check:duplicates'] },
]

process.exit(await runBatch({ modules: MODULES, label: '体量棘轮' }))
