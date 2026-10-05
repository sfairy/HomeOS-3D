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
import path from 'node:path'
import { REPO_ROOT } from './lib/repo.mjs'

const task = String(process.argv[2] || '').trim()

const BACKEND_DIR = path.join(REPO_ROOT, 'backend')
const BACKEND_PY = path.join(BACKEND_DIR, '.venv', 'bin', 'python')

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
    pyRun(['-m', 'pyright', '-p', '.'])
    bunRun('typecheck', 'packages/shared')
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
