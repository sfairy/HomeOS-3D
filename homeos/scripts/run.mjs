/**
 * 根目录任务入口：收敛 shared / lint / typecheck / build。
 *
 * 主后端为 Python（backend/，FastAPI）；静态检查使用其 .venv 内的 ruff / pyright。
 *
 * 用法：
 *   bun scripts/run.mjs <shared|prep|lint|typecheck|check|build|build:frontend>
 *
 * 环境变量：
 *   HOMEOS_PREP_DONE=1  跳过 prep（CI 已先跑过 prep 时可设）
 */
import { spawnSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import { REPO_ROOT } from './lib/repo.mjs'

const task = String(process.argv[2] || '').trim()

const BACKEND_DIR = path.join(REPO_ROOT, 'backend')
/**
 * `@homeos/shared` 契约包已上移到 monorepo 根（`packages/shared`），不再是 `homeos/` 的一部分：
 * 它的 build / lint / typecheck 调度归**根 package.json**，这里只委托（cwd 取上一级）。
 */
const MONOREPO_ROOT_CWD = '..'
const BACKEND_PY = path.join(BACKEND_DIR, '.venv', 'bin', 'python')

/** 本仓库在 monorepo 里的上一层（ruff 可回落到根 `.venv-store`）。 */
const MONOREPO_ROOT = path.resolve(REPO_ROOT, '..')
/**
 * ruff 的第二个来源：monorepo 根的 `.venv-store/bin/ruff`。
 * 本地优先用 backend/.venv 里的 ruff，缺了就退到这里；都没有则**明确报错**。
 * CI 侧由 `.github/workflows/checks.yml` 的 ruff job 独立覆盖。
 */
const STORE_RUFF = path.join(MONOREPO_ROOT, '.venv-store', 'bin', 'ruff')

function run(command, args, cwd = REPO_ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })
  // `status === null` 只有一种情况：进程压根没起来（ENOENT，工具链缺失）。
  // 过去这里直接 `exit(status ?? 1)`，于是「后端 venv 没建」这种可修的问题表现为
  // **一行输出都没有的 exit 1**，看起来像 eslint/ruff 报了错却又没有内容。
  // 现在把真实原因（哪个命令、什么错误）打出来，失败必须有名有姓。
  if (result.error || result.status === null) {
    const why = result.error ? `${result.error.code ?? ''} ${result.error.message}`.trim() : '被信号中断'
    console.error(`[run] 无法执行：${command} ${args.join(' ')}（cwd=${cwd}）`)
    console.error(`[run] 原因：${why}`)
    if (/python|\.venv/.test(command)) {
      console.error('[run] 若缺少 Python 工具链，先建 backend/.venv（含 ruff）或 monorepo 根 `.venv-store`。')
    }
    process.exit(result.status ?? 1)
  }
  if (result.status !== 0) process.exit(result.status)
}

function bunRun(script, cwd) {
  run('bun', ['run', script], path.join(REPO_ROOT, cwd))
}

/** 以 backend/.venv 的解释器运行 Python 工具。 */
function pyRun(args) {
  run(BACKEND_PY, args, BACKEND_DIR)
}

/**
 * ruff：口径与 CI 的 `ruff` job 完全一致 —— 在 **monorepo 根** 跑 `ruff check .`。
 * 之前这里是 `backend/` 下的 `ruff check src`，只覆盖后端 `src/`：`ops/**`、
 * `backend/scripts/**` 本地从来不查，「本地绿、CI 红」属于常态。
 */
function ruff() {
  if (fs.existsSync(BACKEND_PY)) run(BACKEND_PY, ['-m', 'ruff', 'check', '.'], MONOREPO_ROOT)
  else if (fs.existsSync(STORE_RUFF)) run(STORE_RUFF, ['check', '.'], MONOREPO_ROOT)
  else {
    console.error(`[lint] 找不到 ruff：${BACKEND_PY} 与 ${STORE_RUFF} 都不存在。`)
    console.error('[lint] 先建后端 venv（其中含 ruff），或安装 monorepo 的 .venv-store。')
    process.exit(1)
  }
}

/**
 * Python 静态检查：自定义 pyright 基线门禁已拆除；本步仅提示并跳过。
 * 需要时本机可自行 `basedpyright`（存量 issue 较多，裸跑常非 0）。
 */
function typecheckPy() {
  console.log('[typecheck] 跳过 Python 静态检查：自定义 pyright 基线门禁已拆除。')
}

function shared() {
  bunRun('build:shared', MONOREPO_ROOT_CWD)
}

function prep() {
  if (process.env.HOMEOS_PREP_DONE === '1') return
  shared()
  process.env.HOMEOS_PREP_DONE = '1'
}

const tasks = {
  shared,
  prep,
  lint() {
    ruff()
    bunRun('lint:ci', 'frontend')
    bunRun('lint:shared', MONOREPO_ROOT_CWD)
  },
  typecheck() {
    prep()
    typecheckPy()
    bunRun('typecheck:shared', MONOREPO_ROOT_CWD)
    bunRun('typecheck', 'frontend')
  },
  'typecheck:py': typecheckPy,
  check() {
    tasks.lint()
    tasks.typecheck()
  },
  'build:frontend'() {
    bunRun('build', 'frontend')
  },
  build() {
    prep()
    bunRun('build', 'frontend')
  },
}

if (!tasks[task]) {
  console.error(`用法: bun scripts/run.mjs <${Object.keys(tasks).join('|')}>`)
  process.exit(1)
}

tasks[task]()
