/** 根目录开发入口：并行启动后端（FastAPI）与前端（Vite）。 */
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
