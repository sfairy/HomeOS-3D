#!/usr/bin/env node
/**
 * `check-host-bindings.mjs` 的负向自检：**真的造出违规**，逐条确认会拦，并确认不会变瞎。
 *
 * 这条门禁是「跨文件解析型」的：它要顺着 本地声明 → import → `export {} from` → `export *`
 * 找到某个导出的真实形态。最危险的死法同样是**悄悄变瞎** —— 只要解析不到就跳过，门禁会一直
 * 打印「通过」。开发过程中就踩过三次（都是解析问题，不是调用点问题）：
 *   1. 只认 `export function`：`export { x } from "./x"`、`export * from "@/..."` 全被判「找不到导出」；
 *   2. 别名 specifier（`@app/*` / `@runtime/*`）没进解析 → 一条转发链都走不通；
 *   3. `export { local }` 的本地声明查找只看了第一条语句 → `export { j as hsToRgbColor }` 解不出。
 *
 * 所以这里：
 *   1. 用合成模块把**每一种导出形态 × 每一种裸值引用形态**压一遍（12 组）；
 *   2. 固定住「真实 studio 树 → 0 违规，且依赖袋导入/相对导入计数都 > 0」这条绿化断言；
 *   3. 用真实文件（`controls/number-stepper.ts` 的 deps core）跑一次正/负用例，证明判据不是空转。
 *
 * 用法：``node scripts/_host_bindings_selftest.mjs``
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {
  ALIAS_PATHS,
  FRONTEND_ROOT,
  HostBindingGateError,
  analyzePair,
  checkTree,
  resolveExportKind,
  resolveSpecifier,
} from './check-host-bindings.mjs'
import { check, report } from '../_smoke_harness.mjs'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'hostbindings-'))
function write(name, text) {
  const file = path.join(tmp, name)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, text)
  return file
}

/** 造一对 (定义模块, 导入模块) 并跑一次 analyzePair。 */
function pair(label, definingSource, importingSource, { importedName } = {}) {
  const impl = write(`${label}.impl.ts`, definingSource)
  const user = write(`${label}.user.ts`, importingSource)
  const name = importedName ?? 'target'
  return { result: analyzePair(user, impl, name, name), user, impl }
}

// ---- 1. 依赖袋形参 + 四种裸值形态 → 必须拦 ---------------------------------------------
const depsDecl = 'export function target(deps: any, value: any) { return value }\n'
const bareShapes = [
  ['简写属性', `import { target } from "./a.impl";\nexport const ctx = { target };\n`],
  ['属性值', `import { target } from "./a.impl";\nexport const ctx = { handler: target };\n`],
  ['调用实参', `import { target } from "./a.impl";\ndeclare function register(f: any): void;\nregister(target);\n`],
  ['数组元素', `import { target } from "./a.impl";\nexport const list = [target];\n`],
]
for (const [shape, source] of bareShapes) {
  const { result } = pair(`deps-${shape}`, depsDecl, source)
  check(`依赖袋 + ${shape} → 拦`, result.ok === false, `实际 ${result.ok}`)
}
check(
  '违规信息里点名了 deps 形参吃掉实参',
  pair('msg', depsDecl, `import { target } from "./a.impl";\nexport const ctx = { target };\n`).result.failures[0].includes(
    '顶掉调用方的第一个实参',
  ),
)

// ---- 2. 依赖袋形参 + 纯调用 → 放行 -----------------------------------------------------
{
  const { result } = pair('direct-call', depsDecl, `import { target } from "./a.impl";\nexport const v = target({}, 1);\n`)
  check('依赖袋 + 直接调用 → 放行', result.ok === true, result.failures.join(' / '))
}

// ---- 3. 非依赖袋形参 / 无形参 / ctx 之外的命名 → 放行 ----------------------------------
for (const [label, decl] of [
  ['普通形参', 'export function target(value: any) { return value }\n'],
  ['无形参', 'export function target() { return 1 }\n'],
  ['deps 不在首参', 'export function target(value: any, deps: any) { return value }\n'],
  ['箭头普通形参', 'export const target = (value: any) => value\n'],
  ['类', 'export class target {}\n'],
  ['常量对象', 'export const target = { a: 1 }\n'],
]) {
  const { result } = pair(`ok-${label}`, decl, `import { target } from "./a.impl";\nexport const ctx = { target };\n`)
  check(`${label} → 放行`, result.ok === true, result.failures.join(' / '))
}

// ---- 4. 箭头/函数表达式带 deps 形参 → 必须拦（形态覆盖） ------------------------------
for (const [label, decl] of [
  ['箭头 deps', 'export const target = (deps: any, v: any) => v\n'],
  ['函数表达式 ctx', 'export const target = function (ctx: any) { return ctx }\n'],
]) {
  const { result } = pair(`deps-${label}`, decl, `import { target } from "./a.impl";\nexport const ctx = { target };\n`)
  check(`${label} → 拦`, result.ok === false, `实际 ${result.ok}`)
}

// ---- 5. 转发链：`export {} from` / `export *` / 本地转发 → 必须拦 -----------------------
const chainUser = `import { target } from "./chain.barrel";\nexport const ctx = { target };\n`
{
  write('chain.leaf.ts', depsDecl)
  const barrel = write('chain.barrel.ts', 'export { target } from "./chain.leaf";\n')
  const user = write('chain.user.ts', chainUser)
  const direct = analyzePair(user, barrel, 'target')
  check('`export {} from` 转发 → 拦', direct.ok === false, `实际 ${direct.ok} / ${direct.failures.join(' / ')}`)
}
{
  write('star.leaf.ts', depsDecl)
  const barrel = write('star.barrel.ts', 'export * from "./star.leaf";\n')
  const user = write('star.user.ts', `import { target } from "./star.barrel";\nexport const ctx = { target };\n`)
  check('`export * from` 转发 → 拦', analyzePair(user, barrel, 'target').ok === false)
}
{
  write('local.leaf.ts', depsDecl)
  const barrel = write('local.barrel.ts', `import { target } from "./local.leaf";\nexport { target };\n`)
  const user = write('local.user.ts', `import { target } from "./local.barrel";\nexport const ctx = { target };\n`)
  check('本地 `export { x }`（来自 import）转发 → 拦', analyzePair(user, barrel, 'target').ok === false)
}
{
  // `export { N as target }` + `const { target: N } = await import(...)` → 形态动态不可知
  const barrel = write('alias.barrel.ts', `export { N as target };\nconst { target: N } = await (import("./alias.leaf"));\n`)
  write('alias.leaf.ts', depsDecl)
  const user = write('alias.user.ts', `import { target } from "./alias.barrel";\nexport const ctx = { target };\n`)
  const result = analyzePair(user, barrel, 'target')
  check('动态解构导出 → 放行但计入 dynamic', result.ok === true && result.dynamic === true, JSON.stringify(result))
}

// ---- 6. 类型导出 / 找不到的导出 ---------------------------------------------------------
{
  const typeOnly = write('types.impl.ts', 'export type target = number;\n')
  const user = write('types.user.ts', `import { target } from "./types.impl";\nexport const x: target = 1;\n`)
  check('`export type` → 当作类型，放行', analyzePair(user, typeOnly, 'target').ok === true)
}
{
  const reexportType = write('rtype.impl.ts', 'export type { target } from "./types.impl";\n')
  const user = write('rtype.user.ts', `import { target } from "./rtype.impl";\nexport const ctx = { target };\n`)
  check('`export type {} from` → 放行', analyzePair(user, reexportType, 'target').ok === true)
}
{
  const empty = write('empty.impl.ts', 'export const other = 1;\n')
  const user = write('empty.user.ts', `import { target } from "./empty.impl";\nexport const ctx = { target };\n`)
  const result = analyzePair(user, empty, 'target')
  check('解析不到导出 → 判门禁失效（不是静默放行）', result.ok === false && result.failures[0].includes('门禁解析失效'))
}

// ---- 7. 类型位上的裸名不算裸值 ---------------------------------------------------------
{
  const impl = write('used-astype.impl.ts', depsDecl)
  const user = write(
    'used-astype.user.ts',
    `import { target } from "./used-astype.impl";\nexport const v: typeof target = 1 as any;\nexport const w = target({}, 1);\n`,
  )
  check('`typeof target` + 直接调用 → 放行', analyzePair(user, impl, 'target').ok === true)
}

// ---- 8. 别名解析（真实 tsconfig 路径） -------------------------------------------------
check('tsconfig 别名已读到（含 @app/*）', Object.keys(ALIAS_PATHS).includes('@app/*'), Object.keys(ALIAS_PATHS).join(','))
{
  const real = resolveSpecifier(path.join(FRONTEND_ROOT, 'src/studio/app/editor/home.ts'), '@app/editor/controls/number-stepper')
  check('@app/* 能解析到真实文件', Boolean(real) && real.endsWith('controls/number-stepper.ts'), String(real))
}

// ---- 9. 真实文件 + 真实依赖袋 core：正/负用例 ------------------------------------------
{
  const core = path.join(FRONTEND_ROOT, 'src/studio/app/editor/controls/number-stepper.ts')
  check('真实 core 的首参被认成依赖袋', resolveExportKind(core, 'formatLastSeen') === 'deps', String(resolveExportKind(core, 'formatLastSeen')))
  const bareUser = write('real-bare.user.ts', 'export const ctx = { formatLastSeen };\n')
  check('真实文件路径上：裸值 → 拦', analyzePair(bareUser, core, 'formatLastSeen', 'formatLastSeen').ok === false)
}

// ---- 10. 真实 studio 树绿化断言（防止它悄悄红着进 CI） --------------------------------
try {
  const tree = checkTree()
  check('真实 studio 树 0 违规', tree.failures.length === 0, tree.failures.slice(0, 3).join(' / '))
  check('扫描到的相对 import 数 > 0（防瞎）', tree.pairsChecked > 0, String(tree.pairsChecked))
  check('其中确有指向依赖袋形参的导入（判据不是空转）', tree.depsExports > 0, String(tree.depsExports))
  console.log(
    `  [树] ${tree.files} 文件 / ${tree.pairsChecked} 导入 / ${tree.depsExports} 依赖袋 / ${tree.dynamicSkipped} 动态不可知`,
  )
} catch (error) {
  check('真实 studio 树可解析', false, error instanceof HostBindingGateError ? error.message : String(error))
}

fs.rmSync(tmp, { recursive: true, force: true })

report('宿主薄绑定裸值门禁自检')
