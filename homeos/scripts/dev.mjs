/**
 * 根目录开发入口：并行启动后端（FastAPI）与前端（Vite）。
 *
 * 用法：
 *   bun run dev
 *
 * 说明：
 *   - 后端用 SQLite（HOMEOS_DATA_DIR），无需 Docker / Postgres / Redis。
 *   - 全仓联调优先仓库根 `bun run dev`（ops/dev.mjs）；本脚本只起 homeos 一侧。
 *   - Ctrl+C 会先终止子进程再退出；任一子进程退出则停止其余进程并透传退出码。
 */
import { spawn } from 'node:child_process'
import { REPO_ROOT } from './lib/repo.mjs'

const TARGETS = ['dev:backend', 'dev:frontend']
const children = []
let shuttingDown = false

function shutdown(code) {
  if (shuttingDown) return
  shuttingDown = true
  for (const child of children) {
    if (child.exitCode === null && !child.killed) child.kill('SIGTERM')
  }
  process.exit(code)
}

for (const name of TARGETS) {
  const child = spawn('bun', ['run', name], {
    cwd: REPO_ROOT,
    stdio: 'inherit',
    shell: process.platform === 'win32',
    env: process.env,
  })
  child.on('exit', (code, signal) => {
    if (shuttingDown) return
    console.error(
      `\n[dev] ${name} 已退出 (code=${code ?? 'null'}, signal=${signal ?? 'null'})，正在停止其余进程…`,
    )
    shutdown(code ?? 1)
  })
  children.push(child)
}

process.on('SIGINT', () => shutdown(0))
process.on('SIGTERM', () => shutdown(0))
