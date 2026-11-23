/**
 * 批量入口的公共调度器。
 *
 * 为什么需要它：`run_frontend_checks` / `run_model_checks` / `run_size_checks` / `run_tests`
 * 四份入口的控制流完全一样（解析 `--module` / 选模块 / 并发跑 / 汇总退出码）。各写一份的
 * 后果不是「重复 40 行」，而是**门禁代码自己成了 jscpd 的举报对象** —— 合并检查本来是为了
 * 减少重复，入口再长出重复就自相矛盾。
 *
 * 两种执行模式：
 * - `capture`（默认）：缓冲子进程输出，成功只留一行，失败才展开。适合并发。
 * - `inherit`：直接继承终端。适合测试（带行号与堆栈的输出不该被重排）。
 *
 * 被 import 的模块仍然由各入口 `await`，本文件不读 `process.argv` —— 测试可以传入自定义 argv。
 */
import { spawn } from 'node:child_process'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')

/** 逗号分隔 → 去空数组（`--module a,b` 与重复 `--module a` 等价）。 */
export function splitList(value) {
  return String(value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
}

/**
 * 解析 `--module a,b` / `--module=a` / `--list` / `--jobs n`。
 *
 * @param {string[]} argv
 */
export function parseBatchArgs(argv) {
  const options = { modules: [], list: false, jobs: null }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--list') options.list = true
    else if (arg === '--module') {
      options.modules.push(...splitList(argv[index + 1]))
      index += 1
    } else if (arg.startsWith('--module=')) {
      options.modules.push(...splitList(arg.slice('--module='.length)))
    } else if (arg === '--jobs') {
      options.jobs = Number(argv[index + 1])
      index += 1
    } else if (arg.startsWith('--jobs=')) {
      options.jobs = Number(arg.slice('--jobs='.length))
    }
  }
  return options
}

/**
 * 模块选择：**先精确、后子串**。
 *
 * 纯子串匹配有个坑：`--module ts` 会同时命中 `selftests`（`selfle**ts**`），想单跑测试却把
 * 19 个自检一起拖上。因此某个过滤词只要与模块名完全相同，就按精确处理，其余才退化为子串。
 *
 * @param {{name: string}[]} modules
 * @param {string[]} filters
 * @param {string} label
 */
export function selectModules(modules, filters, label) {
  if (filters.length === 0) return modules
  const exact = new Set(modules.filter((module) => filters.includes(module.name)).map((module) => module.name))
  const selected = modules.filter((module) =>
    filters.some((needle) => (exact.has(needle) ? module.name === needle : module.name.includes(needle))),
  )
  if (selected.length > 0) return selected
  console.error(`${label}: 没有模块匹配 ${filters.join('、')}（用 --list 查看可用名称）`)
  return null
}

/** 跑一条命令并缓冲输出。 */
function runCaptured(module) {
  const [cmd, ...args] = module.cmd
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const chunks = []
    const child = spawn(cmd, args, { cwd: REPO_ROOT, stdio: ['ignore', 'pipe', 'pipe'] })
    child.stdout.on('data', (chunk) => chunks.push(chunk))
    child.stderr.on('data', (chunk) => chunks.push(chunk))
    child.on('error', (error) => {
      chunks.push(Buffer.from(`  无法执行 ${cmd}：${error.code ?? ''} ${error.message}\n`))
      resolve({ name: module.name, ok: false, output: Buffer.concat(chunks).toString('utf8'), seconds: 0 })
    })
    child.on('close', (code) => {
      resolve({
        name: module.name,
        ok: code === 0,
        output: Buffer.concat(chunks).toString('utf8'),
        seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      })
    })
  })
}

/** 跑一条命令并继承终端（测试用）。 */
function runInherited(module) {
  const [cmd, ...args] = module.cmd
  return new Promise((resolve) => {
    const startedAt = Date.now()
    const child = spawn(cmd, args, { cwd: REPO_ROOT, stdio: 'inherit' })
    child.on('error', (error) => {
      console.error(`无法执行 ${cmd}：${error.code ?? ''} ${error.message}`)
      resolve({ name: module.name, ok: false, seconds: 0 })
    })
    child.on('close', (code) => {
      resolve({
        name: module.name,
        ok: code === 0,
        seconds: Number(((Date.now() - startedAt) / 1000).toFixed(1)),
      })
    })
  })
}

/**
 * 并发跑捕获型模块；并发只影响耗时，不影响结论（全部跑完再汇总）。
 *
 * @param {{name: string, cmd: string[]}[]} modules
 * @param {{jobs?: number}} [options]
 */
export async function runCapturedAll(modules, { jobs = 4 } = {}) {
  const results = []
  const width = Math.max(1, Math.min(jobs, modules.length))
  let cursor = 0
  const workers = Array.from({ length: width }, async () => {
    while (cursor < modules.length) {
      const module = modules[cursor]
      cursor += 1
      const outcome = await runCaptured(module)
      results.push(outcome)
      console.log(`  ${outcome.ok ? 'PASS' : 'FAIL'} ${outcome.name}  ${outcome.seconds.toFixed(1)}s`)
      if (!outcome.ok) {
        for (const line of outcome.output.replace(/\s+$/, '').split('\n')) console.log(`  │ ${line}`)
      }
    }
  })
  await Promise.all(workers)
  return results
}

/**
 * 顺序跑继承型模块（测试）。
 *
 * @param {{name: string, cmd: string[]}[]} modules
 */
export async function runInheritedAll(modules) {
  const results = []
  for (const module of modules) {
    console.log(`\n=== ${module.name} ===`)
    const outcome = await runInherited(module)
    results.push(outcome)
    console.log(`  ${outcome.ok ? 'PASS' : 'FAIL'} ${outcome.name}  ${outcome.seconds.toFixed(1)}s`)
  }
  return results
}

/**
 * 汇总一批结果并打印总账，返回退出码。
 *
 * @param {{ok: boolean, name: string}[]} results
 * @param {string} label
 */
export function summarise(results, label) {
  const failures = results.filter((item) => !item.ok).map((item) => item.name)
  console.log(`\n${label}：${results.length - failures.length}/${results.length} 通过`)
  if (failures.length) {
    console.error(`  失败：${failures.join('、')}`)
    return 1
  }
  return 0
}

/**
 * 完整入口：解析参数 → 选模块 → 执行 → 汇总。
 *
 * @param {{
 *   modules: {name: string, cmd: string[]}[],
 *   label: string,
 *   argv?: string[],
 *   mode?: 'capture' | 'inherit',
 *   jobs?: number,
 * }} config
 * @returns {Promise<number>}
 */
export async function runBatch({ modules, label, argv = process.argv.slice(2), mode = 'capture', jobs = 4 }) {
  const args = parseBatchArgs(argv)
  if (args.list) {
    for (const module of modules) console.log(module.name)
    return 0
  }
  const selected = selectModules(modules, args.modules, label)
  if (!selected) return 2

  const results =
    mode === 'inherit'
      ? await runInheritedAll(selected)
      : await runCapturedAll(selected, { jobs: Number.isFinite(args.jobs) && args.jobs > 0 ? args.jobs : jobs })
  return summarise(results, label)
}
