/**
 * 根目录任务入口：收敛 shared / lint / typecheck / build。
 *
 * 主后端为 Python（backend/，FastAPI）；本入口只跑 ruff（lint）与 TypeScript 侧类型检查。
 * Python 的类型检查不在本入口内，见 tasks.typecheck 上方的说明。
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

/** 本仓库在 monorepo 里的上一层。 */
const MONOREPO_ROOT = path.resolve(REPO_ROOT, '..')
/**
 * ruff 的来源：monorepo 根的共享 venv `.venv-store`。
 *
 * 这个目录由 `ops/dev.mjs`（`VENV_DIR`）创建与维护，也是根 pyrightconfig.json 点名的环境。
 * 曾经这里还有第二套约定 —— 优先用 `backend/.venv`：但那套已经全线失效（`homeos` 的
 * `dev:backend` 曾硬编码 `backend/.venv/bin/python`，实测 exit 127；pyproject.toml 的
 * `[tool.pyright] venv` 同样指向它且从未被加载过）。留着它只会让人以为有两个环境可选，
 * 于是「按提示建了一个，另一个才是真的」。
 *
 * 仍保留第二顺位回落：别人本机若真的自建了 `backend/.venv`（含 ruff），照样能用。
 * CI 侧由 `.github/workflows/checks.yml` 的 ruff job 独立覆盖。
 */
const VENV_RUFF = path.join(MONOREPO_ROOT, '.venv-store', 'bin', 'ruff')
const BACKEND_LOCAL_PYTHON = path.join(BACKEND_DIR, '.venv', 'bin', 'python')

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
      console.error('[run] 缺少 Python 工具链：先在仓库根跑 `bun run dev:prepare` 建共享 venv `.venv-store`。')
    }
    process.exit(result.status ?? 1)
  }
  if (result.status !== 0) process.exit(result.status)
}

function bunRun(script, cwd) {
  run('bun', ['run', script], path.join(REPO_ROOT, cwd))
}

/**
 * ruff：口径与 CI 的 `ruff` job 完全一致 —— 在 **monorepo 根** 跑 `ruff check .`。
 * 之前这里是 `backend/` 下的 `ruff check src`，只覆盖后端 `src/`：`ops/**`、
 * `backend/scripts/**` 本地从来不查，「本地绿、CI 红」属于常态。
 */
function ruff() {
  if (fs.existsSync(VENV_RUFF)) run(VENV_RUFF, ['check', '.'], MONOREPO_ROOT)
  else if (fs.existsSync(BACKEND_LOCAL_PYTHON)) {
    // 本机自建 backend/.venv 的话也能用（非仓库约定，仅兜底）。
    run(BACKEND_LOCAL_PYTHON, ['-m', 'ruff', 'check', '.'], MONOREPO_ROOT)
  } else {
    console.error(`[lint] 找不到 ruff：${VENV_RUFF} 与 ${BACKEND_LOCAL_PYTHON} 都不存在。`)
    console.error('[lint] 在仓库根跑 `bun run dev:prepare` 建共享 venv `.venv-store`（其中含 ruff）。')
    process.exit(1)
  }
}

/**
 * Python 静态检查入口已在 a70ed33d 随自定义门禁体系一起拆除（CI 只留语言级检查），
 * 这里不再保留 `typecheck:py` 空转壳：它只打印一句「已跳过」就返回 0，
 * 看日志的人却会以为 Python 侧已经检查过了 —— 比没有这条命令更危险。
 *
 * 因此 `tasks.typecheck()` 只做 TypeScript 侧检查；需要 Python 类型检查时按 README 直接跑
 * 仓库根的 `basedpyright`（配置见 pyrightconfig.json，Pylance 也读同一份）。
 */
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
    bunRun('check:studio-split', MONOREPO_ROOT_CWD)
    bunRun('check:studio-naming', MONOREPO_ROOT_CWD)
  },
  typecheck() {
    prep()
    bunRun('typecheck:shared', MONOREPO_ROOT_CWD)
    bunRun('typecheck', 'frontend')
  },
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
