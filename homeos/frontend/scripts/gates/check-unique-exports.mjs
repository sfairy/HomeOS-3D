#!/usr/bin/env node
/**
 * 「同名导出全仓唯一」门禁（homeos/frontend）。
 *
 * 为什么需要它
 * 审计口径下主前端有 11 处「同名不同文件」的导出 helper，其中 4 处语义已经分叉
 * （`waterHeaterStatusLabel` / `formatHourOption` / `hexToRgb` / `readPopupAttr`）。
 * 这类债的危害不是行数，而是**调用方以为在调用另一份**：
 *
 *   - `readPopupAttr` 一份是「实体属性直读」（2 参），一份是「按能源类别 + 激活实体解析」（6 参）；
 *   - `formatHourOption` 一份支持「周」，一份把 24 判成 `24 小时`、另一份判成 `1 天`；
 *   - `clampNumber` 一份是纯夹取（3 参），一份带 fallback 强制转换（4 参）。
 *
 * 它们都不会让 `tsc` / lint 变红（同名不同类型在不同模块本来就合法），所以只能靠门禁固定住
 * 「一个名字只有一处实现」这条约定 —— 需要第二种口径时，**改名**才是正确动作（见 P2 的
 * `clampNumberWithFallback` / `hsvToRgb255` / `formatNotificationHourOption` / `readEnergyPopupAttr`）。
 *
 * 判定口径（刻意收窄，避免误伤正常写法）：
 * - 只看**值声明**：`export function` / `export async function` / `export const NAME =` / `export class`；
 *   `export interface` / `export type` 不看 —— 各域同名的类型（如每个切片自己的 `Deps`）是正常的。
 * - 同文件内重复只算一次：函数重载声明（`export function f(...)` 两次）是合法 TS 写法。
 * - 重导出不算声明：`export { x } from './y'` / `export * from './y'` 是 barrel 手法，
 *   本仓库的 `editor-utils` 就用它转出 `app/shared/util/number` 的 `clampNumber`。
 * - 只扫 `src/**`（`walkSource` 已排除 `.d.ts`）；`scripts/**` 不在范围内 ——
 *   各条自检脚本里各有一份 `check()` 是刻意重复，不属于产品代码。
 *
 * 用法：
 * ```bash
 * node scripts/gates/check-unique-exports.mjs            # 门禁（CI 跑这条）
 * node scripts/gates/check-unique-exports.mjs --report   # 只打印重复项，不判成败
 * node scripts/gates/check-unique-exports.mjs --root=<dir> --allow=<file>   # 供自检注入 fixture
 * ```
 * 允许清单（`unique-exports-allow.json`）为**例外登记**：每条必须写理由，默认应为空。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkSource, blankComments, rel } from '../../../../ops/lib/scan.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(HERE, '..', '..')
const DEFAULT_ALLOW = path.join(HERE, 'unique-exports-allow.json')

const argv = process.argv.slice(2)
const reportOnly = argv.includes('--report')
const rootArg = argv.find((a) => a.startsWith('--root='))
const allowArg = argv.find((a) => a.startsWith('--allow='))
const ROOT = path.resolve(FRONTEND, rootArg ? rootArg.slice('--root='.length) : 'src')
const ALLOW_FILE = allowArg ? path.resolve(allowArg.slice('--allow='.length)) : DEFAULT_ALLOW

// 值声明：函数 / 类 / const（含字面量常量 —— 同名常量比同名函数更容易串用）。
const DECL_RES = [
  /^[ \t]*export\s+(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/gm,
  /^[ \t]*export\s+class\s+([A-Za-z_$][\w$]*)/gm,
  /^[ \t]*export\s+const\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=/gm,
]

const allow = fs.existsSync(ALLOW_FILE) ? JSON.parse(fs.readFileSync(ALLOW_FILE, 'utf8')) : { allowed: {} }
const allowed = allow.allowed ?? {}
let allowInvalid = false
for (const [name, reason] of Object.entries(allowed))
  if (typeof reason !== 'string' || reason.length < 8) {
    console.error(`✗ 允许清单条目缺少理由：${name}（每条例外都必须写清为什么必须同名）`)
    allowInvalid = true
  }
if (allowInvalid) process.exit(1)

/** @type {Map<string, {file: string, line: number}[]>} */
const byName = new Map()
const files = walkSource(ROOT).sort()
for (const file of files) {
  const raw = fs.readFileSync(file, 'utf8')
  const text = blankComments(raw)
  const fromFrontend = rel(FRONTEND, file)
  // 仓库内文件用 `src/...` 形态（与人类的读法一致）；fixture 在仓库外时回落到「相对传入 root」。
  const relPath = fromFrontend.startsWith('../') ? rel(ROOT, file) : fromFrontend
  const seen = new Set()
  for (const re of DECL_RES)
    for (const m of text.matchAll(re)) {
      const name = m[1]
      if (seen.has(name)) continue // 同文件内的重载/重复声明只记一次
      seen.add(name)
      const list = byName.get(name) ?? []
      list.push({ file: relPath, line: raw.slice(0, m.index).split('\n').length })
      byName.set(name, list)
    }
}

const duplicates = [...byName]
  .filter(([, list]) => list.length > 1)
  .map(([name, list]) => ({ name, list: list.sort((a, b) => a.file.localeCompare(b.file)) }))
  .sort((a, b) => a.name.localeCompare(b.name))
const unexplained = duplicates.filter((d) => !(d.name in allowed))

console.log(`同名导出检查（${rel(FRONTEND, ROOT)}，${files.length} 个文件）：`)
if (duplicates.length === 0) console.log('  没有同名导出 ✓')
for (const d of duplicates) {
  console.log(`  ${d.name} ×${d.list.length}（${d.name in allowed ? '已登记例外' : '未登记'}）`)
  for (const hit of d.list) console.log(`      ${hit.file}:${hit.line}`)
  if (d.name in allowed) console.log(`      理由：${allowed[d.name]}`)
}

if (reportOnly) process.exit(0)

if (unexplained.length > 0) {
  console.error(`\n✗ 有 ${unexplained.length} 个名字在多处导出：${unexplained.map((d) => d.name).join('、')}`)
  console.error(
    '  处理方式二选一：口径相同时删到只剩一份（优先 `shared/` 的 typed 版本）；口径不同则按量纲/域改名。',
  )
  process.exit(1)
}
console.log('\n✓ 同名导出门禁通过：所有值导出名全仓唯一。')
