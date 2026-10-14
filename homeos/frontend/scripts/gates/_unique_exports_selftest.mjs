#!/usr/bin/env node
/**
 * `scripts/gates/check-unique-exports.mjs` 的自检：正/负用例都要过一遍，确认门禁既拦得住、又不误伤。
 *
 * 为什么这条自检必须在链上
 * 「同名导出」门禁最危险的两个方向都是静默的：
 *
 *   1. 口径放大 → 把合法的同名**类型**（每个切片自己的 `Deps`）或 barrel 重导出报成违规，
 *      于是有人给整条门禁加白名单，从此门禁形同不存在；
 *   2. 口径缩小（例如漏了 `export const`）→ 像 `ATTR_CHANGE_LABELS` 这种**对象常量**的重复
 *      就永远看不见（真实案例：studio 的 `event-log-runtime` 抄了 shared 的两张表）。
 *
 * 用法：`node scripts/gates/_unique_exports_selftest.mjs`
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.join(HERE, 'check-unique-exports.mjs')

let passed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) passed++
  else failures.push(`${label}${detail ? ` —— ${detail}` : ''}`)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'unique-exports-'))
const srcDir = path.join(tmp, 'src')
const allowFile = path.join(tmp, 'allow.json')
fs.mkdirSync(srcDir, { recursive: true })

function runGate(extra = []) {
  try {
    const out = execFileSync(process.execPath, [GATE, `--root=${srcDir}`, `--allow=${allowFile}`, ...extra], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.dirname(HERE),
    })
    return { code: 0, out }
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

function reset(files) {
  fs.rmSync(srcDir, { recursive: true, force: true })
  fs.mkdirSync(srcDir, { recursive: true })
  for (const [name, body] of Object.entries(files)) fs.writeFileSync(path.join(srcDir, name), body, 'utf8')
}

// 1. 允许清单缺失 → 当作空清单（不崩、不误拦）
fs.rmSync(allowFile, { force: true })
reset({ 'a.ts': 'export function foo() {}\n' })
check('允许清单文件缺失时按空清单处理', runGate().code === 0)

// 2. 负向：同名函数分两文件导出
reset({ 'a.ts': 'export function foo() {}\n', 'b.ts': 'export function foo() {}\n' })
const dupFn = runGate()
check(
  '同名函数在两文件导出 → 拦，并列出两处',
  dupFn.code === 1 && /a\.ts:1/.test(dupFn.out) && /b\.ts:1/.test(dupFn.out) && /foo/.test(dupFn.out),
  dupFn.out.slice(-300),
)

// 3. 正向：同文件内的重载声明只算一次
reset({ 'a.ts': 'export function foo(a: number): void\nexport function foo(a: string): void\nexport function foo(a: unknown) {}\n' })
check('同文件函数重载（合法 TS）→ 通过', runGate().code === 0)

// 4. 正向：barrel 重导出不是新声明
reset({ 'a.ts': 'export function foo() {}\n', 'index.ts': "export { foo } from './a'\nexport * from './a'\n" })
check('barrel 的 `export { x }` / `export *` 不算同名声明 → 通过', runGate().code === 0)

// 5. 正向：同名类型（各域自己的 Deps）合法
reset({ 'a.ts': 'export interface Deps { a: number }\n', 'b.ts': 'export interface Deps { b: number }\n' })
check('同名 interface / type 不拦（各域自己的 Deps 是正常写法）', runGate().code === 0)

// 6. 负向：对象常量重复（真实案例 ATTR_CHANGE_LABELS）
reset({
  'a.ts': 'export const ATTR_LABELS: Record<string, string> = { a: "1" }\n',
  'b.ts': 'export const ATTR_LABELS: Record<string, string> = { a: "1" }\n',
})
const dupConst = runGate()
check(
  '同名 `export const`（对象常量）→ 拦（漏掉它就漏掉真实案例）',
  dupConst.code === 1 && /ATTR_LABELS/.test(dupConst.out),
  dupConst.out.slice(-300),
)

// 7. 负向：赋值式箭头函数也要算声明
reset({ 'a.ts': 'export const run = () => 1\n', 'b.ts': 'export const run = () => 2\n' })
check('同名箭头函数常量 → 拦', runGate().code === 1)

// 8. 负向：类
reset({ 'a.ts': 'export class Engine {}\n', 'b.ts': 'export class Engine {}\n' })
check('同名 class → 拦', runGate().code === 1)

// 9. 注释里的同名声明不算（`blankComments` 口径）
reset({ 'a.ts': '// export function foo() {}\nexport function bar() {}\n', 'b.ts': 'export function foo() {}\n' })
check('注释里的 `export function` 不算声明 → 通过', runGate().code === 0)

// 10. 允许清单：写清理由即可豁免；理由太短则拒绝
reset({
  'a.ts': 'export const ATTR_LABELS: Record<string, string> = { a: "1" }\n',
  'b.ts': 'export const ATTR_LABELS: Record<string, string> = { a: "1" }\n',
})
fs.writeFileSync(allowFile, JSON.stringify({ allowed: { ATTR_LABELS: '旧版兼容：两个包各自发布，不能共享常量表' } }))
const allowed = runGate()
check(
  '允许清单带理由 → 豁免并打印理由',
  allowed.code === 0 && /已登记例外/.test(allowed.out) && /旧版兼容/.test(allowed.out),
  allowed.out.slice(-300),
)
fs.writeFileSync(allowFile, JSON.stringify({ allowed: { ATTR_LABELS: '短' } }))
const badReason = runGate()
check(
  '允许清单理由过短 → 拒绝执行（防止拿空理由挂白名单）',
  badReason.code === 1 && /缺少理由/.test(badReason.out),
  badReason.out.slice(-200),
)

// 11. `--report` 不判成败
fs.writeFileSync(allowFile, JSON.stringify({ allowed: {} }))
const report = runGate(['--report'])
check('`--report` 有重复也退出码 0', report.code === 0 && /ATTR_LABELS/.test(report.out), report.out.slice(-200))

fs.rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error(`\n✗ 同名导出门禁自检失败 ${failures.length} 项（通过 ${passed}）：`)
  for (const f of failures) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✓ 同名导出门禁自检通过：${passed} 项断言`)
