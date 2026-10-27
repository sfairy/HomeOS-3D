/**
 * 根目录任务入口：收敛 shared / typecheck / build。
 *
 * 主后端为 Python（backend/，FastAPI）；本入口只做 TypeScript 侧类型检查与前端构建。
 * Python 的类型检查不在本入口内，见 tasks.typecheck 上方的说明；ruff 这类语言级检查
 * 归仓库根的门禁编排（`bun run gate:static` → `lint:py`），不在这个入口重复一遍。
 *
 * 用法：
 *   bun scripts/run.mjs <shared|prep|typecheck|build|build:frontend>
 *
 * 环境变量：
 *   HOMEOS_PREP_DONE=1  跳过 prep（CI 已先跑过 prep 时可设）
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { REPO_ROOT } from './lib/repo.mjs'

const task = String(process.argv[2] || '').trim()

/**
 * `@homeos/shared` 契约包已上移到 monorepo 根（`packages/shared`），不再是 `homeos/` 的一部分：
 * 它的 build / lint / typecheck 调度归**根 package.json**，这里只委托（cwd 取上一级）。
 */
const MONOREPO_ROOT_CWD = '..'

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
  typecheck() {
    prep()
    bunRun('typecheck:shared', MONOREPO_ROOT_CWD)
    bunRun('typecheck', 'frontend')
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
