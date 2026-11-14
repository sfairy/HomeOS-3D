/**
 * 突变测试的公共运行器：对一个源文件注入若干语义突变，要求检查脚本每次都报错。
 *
 * 为什么把它抽出来
 * ----------------
 * 「一个从未失败过的检查」和「一个永远返回 0 的脚本」在 CI 里长得一模一样。突变测试是
 * 区分两者的唯一办法，因此每个新的不变量检查都该配一份。但逐个复制运行器会让仓库长出
 * 十几份只有突变表不同的副本 —— 重复代码棘轮会（正确地）拦住它，而写的人会倾向于抬基线。
 * 所以共享的是**运行机制**，各检查只提供自己的突变表。
 *
 * 设计约束
 * --------
 * - 突变体必须写在源文件**同目录**：内核模块用的是无扩展名相对导入，放到别处打包会解析失败。
 *   因此运行器会在源树里短暂创建一个 `_mutant-<name>.ts`，并在 `finally` 里删除。
 * - 锚点找不到时记 `SKIP` 而不是 `PASS`：源文件重构后锚点会失效，静默跳过等于悄悄失去保护，
 *   必须让人看见。
 * - 任一突变未被检出即整体失败：漏检说明对应契约没被断言，应该补断言而不是放宽检查。
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

/**
 * 执行突变测试。
 *
 * @param {object} options
 * @param {string} options.repoRoot 仓库根（绝对路径）
 * @param {string} options.source 被突变源文件（绝对路径）
 * @param {string} options.checker 检查脚本（绝对路径）
 * @param {Array<{label: string, find: string, replace: string}>} options.mutations
 *   每条突变：`find` 必须在源文件里唯一出现，`replace` 替换后的代码通常仍「看起来合理」。
 * @param {string} [options.mutantName] 突变体文件名（默认由源文件名派生）
 * @returns {{rows: Array<{label: string, status: string, detail: string}>, caught: number, total: number}}
 */
export function runMutationCheck({ repoRoot, source, checker, mutations, mutantName }) {
  const pristine = fs.readFileSync(source, 'utf8')
  const directory = path.dirname(source)
  const stem = mutantName ?? `_mutant-${path.basename(source).replace(/\.[^.]+$/, '')}.ts`
  const mutant = path.join(directory, stem)
  const rows = []
  let caught = 0

  try {
    for (const mutation of mutations) {
      if (!pristine.includes(mutation.find)) {
        rows.push({ label: mutation.label, status: 'SKIP', detail: '锚点已不存在，需要更新突变表' })
        continue
      }
      fs.writeFileSync(mutant, pristine.replace(mutation.find, mutation.replace))
      let detected = false
      let detail = ''
      try {
        execFileSync('node', [checker, '--entry', path.relative(repoRoot, mutant)], {
          cwd: repoRoot,
          stdio: 'pipe',
        })
      } catch (error) {
        detected = true
        const output = String(error.stdout || '')
        detail = output
          .split('\n')
          .map((line) => line.trim())
          .find((line) => line.startsWith('-'))
        // 检查脚本的失败往往只打印第一行，取第一条具体断言作为证据。
        detail =
          detail ??
          output
            .split('\n')
            .find((line) => line.includes('不变量失败'))
            ?.trim() ??
          ''
      }
      if (detected) caught += 1
      rows.push({ label: mutation.label, status: detected ? 'CAUGHT' : 'MISSED', detail })
    }
  } finally {
    fs.rmSync(mutant, { force: true })
  }

  return { rows, caught, total: mutations.length }
}

/** 打印结果并返回退出码（0 = 全部检出）。 */
export function reportMutationCheck({ rows, caught, total }) {
  for (const row of rows) {
    console.log(`${row.status.padEnd(7)} ${row.label}${row.detail ? `\n        ${row.detail}` : ''}`)
  }
  console.log(`\n突变检出：${caught} / ${total}`)
  if (caught !== total) {
    console.error('有不变量盲区：上面没被检出的突变说明对应契约没有被断言，请补断言而不是放宽检查。')
  }
  return caught === total ? 0 : 1
}
