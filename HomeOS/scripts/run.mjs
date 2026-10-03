/**
 * 根目录任务入口：收敛 shared / prisma / lint / typecheck / build。
 *
 * 用法：
 *   bun scripts/run.mjs <shared|prep|lint|typecheck|check|build|build:backend|build:frontend>
 *
 * 环境变量：
 *   HOMEOS_PREP_DONE=1  跳过 prep（CI 已先跑过 prep 时可设）
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { REPO_ROOT } from './lib/repo.mjs'

const task = String(process.argv[2] || '').trim()

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

function shared() {
  bunRun('build', 'packages/shared')
}

function prep() {
  if (process.env.HOMEOS_PREP_DONE === '1') return
  shared()
  run('node', ['scripts/ensure-prisma-client.cjs'], path.join(REPO_ROOT, 'backend'))
  process.env.HOMEOS_PREP_DONE = '1'
}

const tasks = {
  shared,
  prep,
  lint() {
    bunRun('lint:ci', 'backend')
    bunRun('lint:ci', 'frontend')
    bunRun('lint', 'packages/shared')
  },
  typecheck() {
    prep()
    bunRun('typecheck', 'packages/shared')
    bunRun('typecheck', 'backend')
    bunRun('typecheck', 'frontend')
  },
  check() {
    tasks.lint()
    tasks.typecheck()
    bunRun('test', 'packages/shared')
  },
  'build:backend'() {
    prep()
    bunRun('build', 'backend')
  },
  'build:frontend'() {
    bunRun('build', 'frontend')
  },
  build() {
    prep()
    bunRun('build', 'backend')
    bunRun('build', 'frontend')
  },
}

if (!tasks[task]) {
  console.error(`用法: bun scripts/run.mjs <${Object.keys(tasks).join('|')}>`)
  process.exit(1)
}

tasks[task]()
