#!/usr/bin/env node
/**
 * Python 解释器单点入口。
 *
 * 为什么需要它：同一个门禁此前在本地写成 `.venv-store/bin/python ops/checks/x.py`，
 * 在 CI 写成 `python3 ops/checks/x.py`。两条命令的**解释器与依赖集不同**，于是「本机绿、
 * CI 红」（或反过来）无法通过「跑同一条命令」复现 —— 本地那份命令在干净检出上根本不存在，
 * CI 那份在开发机上可能缺依赖。
 *
 * 现在本地与 CI 都走这一层：
 *   node ops/lib/py.mjs ops/checks/check_async_db.py
 *
 * 选择顺序：
 *   1. `HOMEOS_PYTHON`（显式覆盖，路径或命令名）；
 *   2. 仓库根共享 venv `.venv-store`（`bun run dev:prepare` 建立，本仓库约定的唯一环境）；
 *   3. `python3`（POSIX）/ `python`（Windows）—— CI runner 走这一支。
 *
 * 找不到任何解释器时不静默成功：打印该装什么，退出 127。
 *
 * 用法：
 *   node ops/lib/py.mjs <script.py> [args...]
 *   node ops/lib/py.mjs -m unittest discover -s ops/checks/... -v
 *   node ops/lib/py.mjs --which          # 只打印解析到的解释器
 */
import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const REPO_ROOT = path.resolve(import.meta.dirname, '../..');

/** 共享 venv 的解释器路径（Windows 的目录布局不同）。 */
const VENV_PYTHON = path.join(
  REPO_ROOT,
  '.venv-store',
  process.platform === 'win32' ? 'Scripts/python.exe' : 'bin/python',
);

/** 按优先级排列的候选；不存在的直接跳过。 */
function candidates() {
  const list = [];
  const override = process.env.HOMEOS_PYTHON?.trim();
  if (override) list.push(override);
  if (existsSync(VENV_PYTHON)) list.push(VENV_PYTHON);
  list.push(process.platform === 'win32' ? 'python' : 'python3');
  if (process.platform === 'win32') list.push('python3');
  return list;
}

/**
 * 逐个候选试跑 `-c ''`：路径存在不等于能执行（架构不符、venv 半损坏都会在这里暴露），
 * 而「先 --version 再真正跑」等于每次多一个进程，直接在真实命令上按 ENOENT 回落更省。
 */
function resolvePython() {
  for (const candidate of candidates()) {
    if (candidate.includes(path.sep) && !existsSync(candidate)) continue;
    const probe = spawnSync(candidate, ['-c', ''], { stdio: 'ignore' });
    if (!probe.error && probe.status === 0) return candidate;
  }
  return null;
}

const args = process.argv.slice(2);
if (args.includes('--which')) {
  const python = resolvePython();
  if (!python) {
    console.error('找不到 Python 解释器。');
    process.exit(127);
  }
  console.log(python);
  process.exit(0);
}

if (args.length === 0) {
  console.error('用法：node ops/lib/py.mjs <script.py| -m module> [args...]');
  process.exit(2);
}

const python = resolvePython();
if (!python) {
  console.error('[py] 找不到 Python 解释器。');
  console.error(`[py] 试过：${candidates().join('、')}`);
  console.error('[py] 修法：在仓库根跑 `bun run dev:prepare` 建共享 venv `.venv-store`，');
  console.error('[py]       或用 HOMEOS_PYTHON=/path/to/python 指定解释器。');
  process.exit(127);
}

const result = spawnSync(python, args, {
  cwd: REPO_ROOT,
  stdio: 'inherit',
  env: process.env,
});

// `status === null` 只有「进程压根没起来」一种情况：和「脚本自己退出 1」必须区分开，
// 否则工具链缺失会伪装成门禁失败，排查方向完全不同（见 homeos/scripts/run.mjs 的同款处理）。
if (result.error || result.status === null) {
  const why = result.error ? `${result.error.code ?? ''} ${result.error.message}`.trim() : '被信号中断';
  console.error(`[py] 无法执行：${python} ${args.join(' ')}`);
  console.error(`[py] 原因：${why}`);
  process.exit(result.status ?? 1);
}

process.exit(result.status);
