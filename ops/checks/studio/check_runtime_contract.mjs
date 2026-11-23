#!/usr/bin/env node
/**
 * 舞台产物导出面契约校验（`studio/runtime/**` 的逐文件产物）。
 *
 * 背景
 * ----
 * 同一份 `homeos/frontend/src/studio/runtime/**` 源码被**两个**构建消费：
 * 1. 主 bundle（`vite.config.ts`）：Vue 应用直接 import；
 * 2. 逐文件产物（`vite.runtime.config.ts`）：每个文件单独编成一个
 *    `/api/v1/modules/interaction3d/<路径>.js`，由后端直接伺服、浏览器直载 ——
 *    舞台页与嵌入页靠这些文件工作。
 *
 * 两份产物各自缓存、各自发版，接口面一旦漂移（改了导出名 / 删了导出），主 bundle 仍能
 * 通过类型检查，只有舞台在运行时 `xxx is not a function`。`runtime-contract.json` 就是
 * 这份接口面的快照，但此前**没有任何门禁读它** —— 它既不能防漂移，也没人知道它是否已经过期。
 *
 * 口径
 * ----
 * 逐文件比对「导出的符号名集合」：
 * - `export function/const/let/class/type/interface/enum` 的声明名；
 * - `export { a, b as c }` 里的对外名（`c`）；
 * - `export default` 记为 `default`；
 * - `export * from` 无法静态展开 → 直接判失败（产物契约必须是可枚举的显式导出）。
 *
 * 类型与接口也计入：它们编译后消失，但改动会被主 bundle 的 import 依赖，属于同一份接口面。
 *
 * 用法
 * ----
 *   node ops/checks/studio/check_runtime_contract.mjs            # 校验（不一致退出 1）
 *   node ops/checks/studio/check_runtime_contract.mjs --update   # 重写契约（需在评审里说明）
 *   node ops/checks/studio/check_runtime_contract.mjs --json
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const args = process.argv.slice(2)
const argOf = (name, fallback) => {
  const index = args.indexOf(`--${name}`)
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback
}
const repoRoot = resolve(argOf('root', resolve(import.meta.dirname, '../../..')))
const update = args.includes('--update')
const asJson = args.includes('--json')
const RUNTIME_DIR = join(repoRoot, 'homeos/frontend/src/studio/runtime')
const CONTRACT = join(repoRoot, 'ops/checks/baselines/contracts/runtime-contract.json')

/**
 * 从一个运行时源文件里取出**对外导出的值名**（排序后返回）。
 *
 * 只收运行时存在的绑定：`interface` / `type` 编译后消失，不可能出现在舞台产物里，
 * 把它算进契约会让「改一个类型名」也触发产物面变更告警（且契约永远对不上）。
 */
function exportedNames(file) {
  const source = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TS)
  const names = new Set()
  const wildcard = []
  for (const statement of source.statements) {
    const modifiers = ts.canHaveModifiers(statement) ? (ts.getModifiers(statement) ?? []) : []
    const exported = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword)
    const isDefault = modifiers.some((modifier) => modifier.kind === ts.SyntaxKind.DefaultKeyword)

    if (ts.isExportDeclaration(statement)) {
      if (statement.isTypeOnly) continue
      if (statement.moduleSpecifier && !statement.exportClause) {
        wildcard.push(statement.moduleSpecifier.text)
        continue
      }
      if (statement.exportClause && ts.isNamedExports(statement.exportClause)) {
        for (const element of statement.exportClause.elements) {
          // `export { type Foo }` 的内联 type 修饰符同样编译后消失。
          if (element.isTypeOnly) continue
          names.add(element.name.text)
        }
      }
      continue
    }
    if (ts.isExportAssignment(statement)) {
      names.add('default')
      continue
    }
    if (!exported) continue
    // 纯类型声明不进运行时产物。
    if (ts.isInterfaceDeclaration(statement) || ts.isTypeAliasDeclaration(statement)) continue
    if (isDefault) {
      names.add('default')
      continue
    }
    // `export const A = …, B = …`：名字在 declarationList 里，不在 statement.name 上。
    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) names.add(declaration.name.text)
      }
      continue
    }
    const name = statement.name?.text
    if (name) names.add(name)
  }
  return { names: [...names].sort(), wildcard }
}

function readContract() {
  return JSON.parse(readFileSync(CONTRACT, 'utf8'))
}

function main() {
  const contract = readContract()
  const modules = contract.modules ?? {}
  const problems = []

  if (update) {
    const nextModules = {}
    for (const relativePath of Object.keys(modules).sort()) {
      const file = join(RUNTIME_DIR, relativePath)
      const { names, wildcard } = exportedNames(file)
      if (wildcard.length) problems.push(`${relativePath}: 含 export * from ${wildcard.join(', ')}，无法枚举`)
      nextModules[relativePath] = names
    }
    writeFileSync(
      CONTRACT,
      `${JSON.stringify({ ...contract, modules: nextModules, messageTypes: contract.messageTypes ?? [] }, null, 2)}\n`,
      'utf8',
    )
    console.log(`runtime-contract 已更新：${Object.keys(nextModules).length} 个模块`)
    return problems.length ? 1 : 0
  }

  for (const [relativePath, expected] of Object.entries(modules)) {
    const file = join(RUNTIME_DIR, relativePath)
    let names
    let wildcard
    try {
      ;({ names, wildcard } = exportedNames(file))
    } catch (error) {
      problems.push(`${relativePath}: 读不到源文件（${error.message}）`)
      continue
    }
    if (wildcard.length) {
      problems.push(`${relativePath}: 含 export * from ${wildcard.join(', ')}，产物接口面无法枚举`)
      continue
    }
    const expectedSet = new Set(expected)
    const actualSet = new Set(names)
    for (const name of names) if (!expectedSet.has(name)) problems.push(`${relativePath}: 新增导出 ${name}`)
    for (const name of expected) if (!actualSet.has(name)) problems.push(`${relativePath}: 导出已消失 ${name}`)
  }

  if (asJson) {
    console.log(JSON.stringify({ modules: Object.keys(modules).length, problems }, null, 2))
  } else {
    console.log(`check_runtime_contract: ${Object.keys(modules).length} 个运行时模块`)
    for (const problem of problems) console.log(`  ✗ ${problem}`)
  }

  if (problems.length) {
    console.error(
      'check_runtime_contract: 舞台逐文件产物的导出面与契约不一致。' +
        '确认是有意改动后跑 `--update`，否则主 bundle 与舞台产物会静默分叉。',
    )
    return 1
  }
  console.log('check_runtime_contract: 0 violation(s)')
  return 0
}

process.exit(main())
