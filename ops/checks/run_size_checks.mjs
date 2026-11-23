/**
 * 体量棘轮批量入口：四条「只许降」的度量收成一个门禁步骤。
 *
 * 四条度量各自守着不同的问题，判定口径**不合并**（各自的基线独立、各自可 `--update`）：
 *
 * | 模块        | 守什么                                |
 * | ----------- | ------------------------------------- |
 * | code-size   | 有效代码行 / 有效字符（总体膨胀）      |
 * | file-size   | 单文件行数（巨型文件）                |
 * | giant-files | 巨型文件的**扇出**（imports / deps）  |
 * | duplicates  | jscpd 精确克隆                        |
 *
 * 行数为什么只判一次：`giant-files` 已改为只判定扇出，行数棘轮由 `file-size` 独家负责 ——
 * 否则同一处新增会被两个模块各报一次。
 *
 * 为什么是子进程：四条里既有 Node 也有 Python，各自还有 `--update` / `--json` / `--report`
 * 三种模式与详细提示；改造成统一函数接口要重写四份输出逻辑，而门禁只需要「一起跑、失败一起报」。
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
  {
    name: 'file-size',
    cmd: ['node', 'ops/lib/py.mjs', 'ops/checks/size/check_file_size.py'],
    covers: ['check:file-size'],
  },
  { name: 'giant-files', cmd: ['node', 'ops/checks/size/check_giant_files.mjs'], covers: ['check:giant-files'] },
  { name: 'duplicates', cmd: ['node', 'ops/checks/size/check_duplicates.mjs'], covers: ['check:duplicates'] },
]

process.exit(await runBatch({ modules: MODULES, label: '体量棘轮' }))
