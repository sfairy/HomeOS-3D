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
const BACKEND_PY = path.join(BACKEND_DIR, '.venv', 'bin', 'python')

/**
 * 本仓库在 monorepo 里的上一层：`pyrightconfig.json`、CI 的门禁脚本都在那里。
 * 这两个常量只被 Python 静态检查用到；本地缺少根 `.venv-store` 时整步跳过 ——
 * CI 的 `typecheck` job 不建这个 venv（Python 侧由独立的 `pyright` job 覆盖）。
 */
const MONOREPO_ROOT = path.resolve(REPO_ROOT, '..')
const ROOT_PY = path.join(MONOREPO_ROOT, '.venv-store', 'bin', 'python')
const PYRIGHT_GATE = path.join(MONOREPO_ROOT, 'ops', 'ci', 'pyright_gate.py')

function run(command, args, cwd = REPO_ROOT) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })
  if (result.status !== 0) process.exit(result.status ?? 1)
}

function bunRun(script, cwd) {
  run('bun', ['run', script], path.join(REPO_ROOT, cwd))
}

/** 以 backend/.venv 的解释器运行 Python 工具（ruff / pyright 等）。 */
function pyRun(args) {
  run(BACKEND_PY, args, BACKEND_DIR)
}

/**
 * Python 静态检查：与 CI 的 `pyright` job **同一口径**。
 *
 * 不能直接 `pyright -p .`：pyrightconfig 的 error 级里有一批存量误报（模型标注偏窄导致的
 * reportOptionalMemberAccess / reportArgumentType 等，实测 200 上下），裸跑必非 0 —— 本地与
 * CI 都会被它卡死。判定交给 `ops/ci/pyright_gate.py`：只有「一定会炸」的三条规则硬失败，
 * 其余打成直方图保持可见。
 *
 * 用根 `.venv-store` 的解释器（pyrightconfig.json 点名用它解析第三方包），等价于 CI 里
 * `basedpyright --outputjson | pyright_gate.py` 的本地版。缺 venv 就跳过：CI 的 typecheck job
 * 本来就没有这个 venv，Python 侧由独立的 pyright job 覆盖。
 */
function typecheckPy() {
  if (!fs.existsSync(ROOT_PY) || !fs.existsSync(PYRIGHT_GATE)) {
    console.log(
      `[typecheck] 跳过 Python 静态检查：未找到 ${ROOT_PY}（先 bun run dev:prepare）；CI 由 pyright job 覆盖。`
    )
    return
  }
  const report = path.join(MONOREPO_ROOT, '.pyright-local.json')
  const pyright = spawnSync(ROOT_PY, ['-m', 'pyright', '--outputjson'], {
    cwd: MONOREPO_ROOT,
    stdio: ['ignore', 'pipe', 'inherit'],
    env: process.env,
  })
  fs.writeFileSync(report, pyright.stdout ?? '')
  const gate = spawnSync(ROOT_PY, [PYRIGHT_GATE, report], {
    cwd: MONOREPO_ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  fs.rmSync(report, { force: true })
  if (gate.status !== 0) process.exit(gate.status ?? 1)
}

function shared() {
  bunRun('build', 'packages/shared')
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
    pyRun(['-m', 'ruff', 'check', 'src'])
    bunRun('lint:ci', 'frontend')
    bunRun('lint', 'packages/shared')
  },
  typecheck() {
    prep()
    typecheckPy()
    bunRun('typecheck', 'packages/shared')
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
