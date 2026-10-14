#!/usr/bin/env node
/**
 * `ops/studio/studio_slice_wrap.mjs` 自检 —— 语句级切片包装器的**语义契约**。
 *
 * 这里每一项都是踩出来的（写错都不报错、只在运行期静默失效）：
 *   · 依赖按值注入 → boot 时抓到 `null`（可变状态被冻结）、或当场 TDZ 崩；
 *   · 改写只插不删 → `deps.XX`；
 *   · 正文从 `getFullStart()` 起 → 模块头部多吃两个空行；
 *   · 属性名 / 绑定名 / 类型位 / 被遮蔽的同名引用被误改 → 编译能过但语义变了。
 *
 * 前两条是「必须与"留在宿主里的闭包"同语义」，后两条是「改写只在引用位」。
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

// 与 `_studio_slice_range_selftest.mjs` 同口径：脚本在 homeos/frontend/scripts/gates/，仓库根要上四级
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..', '..', '..', '..')
const TOOL = path.join(ROOT, 'ops/studio/studio_slice_wrap.mjs')
let pass = 0
const check = (name, cond, detail = '') => {
  if (cond) {
    pass += 1
    console.log(`  [PASS] ${name}`)
  } else {
    console.log(`  [FAIL] ${name}${detail ? `\n         ${detail}` : ''}`)
    process.exitCode = 1
  }
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-wrap-'))
/** 造一个「切片模块」：文件头 + import + 一条事件注册语句（形态与 extract 产物一致）。 */
const makeModule = (statement, { imports = 'import { helperA } from "../helper-a";' } = {}) => {
  const file = path.join(tmp, `m-${Math.random().toString(36).slice(2)}.ts`)
  fs.writeFileSync(file, `// 从 studio/app/editor/home.ts 迁出\n${imports}\n\n${statement}\n`, 'utf8')
  return file
}
const wrap = (file, factory = 'attachThing', iface = 'ThingDeps', indent) => {
  const args = [TOOL, `--module=${file}`, `--factory=${factory}`, `--iface=${iface}`]
  if (indent !== undefined) args.push(`--indent=${indent}`)
  const out = execFileSync(process.execPath, args, { encoding: 'utf8' })
  return { report: JSON.parse(out), text: fs.readFileSync(file, 'utf8') }
}

// —— 1. 惰性读取：宿主值一律走 `deps.x`，正文里不留裸名（closure 语义靠 getter 保住）——
{
  const { report, text } = wrap(
    makeModule('panHostElement.addEventListener("ping", (pingEvent) => {\n  liveRenderer.render(pingEvent, pingCount);\n});'),
  )
  check('1a 依赖按名列出（含后声明的可变状态）', report.deps.includes('panHostElement') && report.deps.includes('liveRenderer') && report.deps.includes('pingCount'), JSON.stringify(report.deps))
  check('1b 正文改写成 deps.<name>（惰性读，不是 const 快照）', /deps\.liveRenderer\.render\(pingEvent, deps\.pingCount\)/.test(text), text.split('\n').slice(-4).join(' | '))
  check('1c 不生成 `const x = deps.x` 快照（那会把可变状态冻结在注册那一刻）', !/const \w+ = deps\./.test(text))
  check('1d import 进来的名字不列进依赖袋', !report.deps.includes('helperA'))
  check('1e 工厂签名用传入的工厂名/接口名', /export function attachThing\(deps: ThingDeps\) \{/.test(text) && /export interface ThingDeps \{/.test(text))
}

// —— 2. 改写是**区间替换**：只插不删会得到 `deps.XX`（真踩过）——
{
  const { text } = wrap(makeModule('hostElement.addEventListener("ping", () => {\n  tickCount += 1;\n});'))
  check('2a 标识符被替换而非插入（无 `deps.XX` 残留）', !/deps\.\w+\w*[A-Z]/.test(text.replace(/deps\.\w+/g, '')) && /deps\.tickCount/.test(text), text)
  check('2b 不出现 `deps.deps`', !/deps\.deps\./.test(text))
}

// —— 3. 只在引用位改写 ——
{
  const { report, text } = wrap(
    makeModule(
      'hostElement.addEventListener("ping", () => {\n' +
        '  const conf = { liveRenderer, otherRenderer: liveRenderer };\n' +
        '  obj.liveRenderer = liveRenderer;\n' +
        '  const cast = liveRenderer as LiveRendererKind;\n' +
        '});',
    ),
  )
  check('3a 简写属性整条改写为 `{ x: deps.x }`', /\{ liveRenderer: deps\.liveRenderer,/.test(text), text)
  check('3b 属性值改写、属性名不动', /deps\.obj\.liveRenderer = deps\.liveRenderer/.test(text), text)
  check('3c 类型位不改写（`deps.x` 是值，塞进类型位编不过）', /as LiveRendererKind;/.test(text))
  check('3d 类型名不进依赖袋', !report.deps.includes('LiveRendererKind'), JSON.stringify(report.deps))
  check('3e 属性名不进依赖袋', !report.deps.includes('liveRenderer') === false && !report.deps.includes('otherRenderer'))
}
{
  const { text } = wrap(
    makeModule('hostElement.addEventListener("ping", (liveRenderer) => {\n  liveRenderer.flush();\n  hostRenderer.flush();\n});'),
  )
  check('3f 被内层同名绑定遮蔽的引用不改写（宿主那个仍改）', /liveRenderer\.flush\(\)/.test(text) && /deps\.hostRenderer\.flush\(\)/.test(text), text)
}
{
  const { report, text } = wrap(makeModule('hostElement.addEventListener("ping", () => {\n  stateMap.set("k", hostToken);\n});'), {})
  check('3g 全局对象（Map/Set/document 等）不算依赖', !report.deps.includes('Map') && !report.deps.includes('document'), JSON.stringify(report.deps))
  check(
    '3h 字符串字面量不参与改写（只改引用位，不碰引号里的字符）',
    /deps\.stateMap\.set\("k", deps\.hostToken\)/.test(text) && !/deps\.k\b/.test(text),
    text,
  )
}

// —— 4. 形态：头部不多空行、正文逐字保留、缩进可配 ——
{
  const statement = 'hostElement.addEventListener("ping", (pingEvent) => {\n  // 注释与缩进必须逐字保留\n  doThing(pingEvent);\n});'
  const { text } = wrap(makeModule(statement))
  check('4a 模块头部无多余空行（getFullStart 会把前置空行带进来）', /\/\/ 从 studio\/app\/editor\/home\.ts 迁出\nimport \{ helperA \}[^\n]*\n\n\/\*\*/.test(text), text.slice(0, 200))
  check('4b 注释与缩进逐字保留（只有引用位被改写）', text.includes('  // 注释与缩进必须逐字保留\n  deps.doThing(pingEvent);'), text)
  check('4c 工厂体只包一层（函数头 + 改写后的原语句 + 收尾花括号）', /export function attachThing\(deps: ThingDeps\) \{\ndeps\.hostElement\.addEventListener/.test(text), text)
}
{
  const { report } = wrap(makeModule('hostElement.addEventListener("ping", () => {\n  doThing(hostToken);\n});'), 'attachX', 'XDeps', '    ')
  check('4d 宿主调用片段缩进可配（嵌套块里的语句不是 0 列）', report.hostCallBody.every((l) => l.startsWith('    get ')), JSON.stringify(report.hostCallBody))
  check('4e 调用片段的属性分隔符是逗号（对象字面量里写分号 = 语法错）', report.hostCallBody.every((l) => l.trimEnd().endsWith(',')), JSON.stringify(report.hostCallBody))
  check('4f 调用片段是 getter 形态（惰性）', report.hostCallBody.every((l) => /get \w+\(\) \{ return \w+; \},/.test(l)), JSON.stringify(report.hostCallBody))
}

// —— 5. 形态不对要拒绝，而不是猜 ——
{
  const multi = path.join(tmp, 'multi.ts')
  fs.writeFileSync(multi, 'const a = 1;\nconst b = 2;\n', 'utf8')
  let failed = false
  try {
    execFileSync(process.execPath, [TOOL, `--module=${multi}`, '--factory=attachX', '--iface=XDeps'], { stdio: 'pipe' })
  } catch {
    failed = true
  }
  check('5a 正文不止一条语句 → 拒绝执行（报错退出，不改文件）', failed && fs.readFileSync(multi, 'utf8') === 'const a = 1;\nconst b = 2;\n')
}

// —— 6. 声明形态（`--mode=fn`）：一族函数声明 → `<名>Core(deps, …)` + 宿主薄转发器 ——
const wrapFn = (decls, { iface = 'ThingDeps', thunk = 'thingDeps', hostOnly = false } = {}) => {
  const file = path.join(tmp, `fn-${Math.random().toString(36).slice(2)}.ts`)
  fs.writeFileSync(file, `${decls}\n`, 'utf8')
  const args = [TOOL, '--mode=fn', `--module=${file}`, `--iface=${iface}`, `--thunk=${thunk}`, '--indent=']
  if (hostOnly) args.push('--host-only')
  const out = execFileSync(process.execPath, args, { encoding: 'utf8' })
  return { report: JSON.parse(out), text: fs.readFileSync(file, 'utf8') }
}

// 解构形参名不是宿主引用；`{ kind: localKind }` 里的 kind 是属性名 —— 两者都不该进依赖袋/被改写
// （踩过：21 个形参名混进依赖袋，正文里 `kind` 被读成宿主变量，tsc 一声不吭）
{
  const { report, text } = wrapFn(
    'export function pick({ kind: localKind, title }, pageSize = 7) {\n  return localKind + title + pageSize + hostVar;\n}',
  )
  check('6a 解构形参名不进依赖袋（只有真宿主引用）', JSON.stringify(report.deps) === '["hostVar"]', JSON.stringify(report.deps))
  check('6b 形参原地保留（默认值 / 重命名键都不动）', /function pickCore\(deps: ThingDeps, \{ kind: localKind, title \}, pageSize = 7\)/.test(text), text)
  check('6c 正文里只有宿主引用被改写', /return localKind \+ title \+ pageSize \+ deps\.hostVar;/.test(text), text)
}

// 族内互调：core 多了一个 deps 首参，调用点必须串上（否则 TS2554 参数个数不符）
{
  const { report, text } = wrapFn(
    'export function a(x: any) {\n  return b(x) + b() + hostA;\n}\nexport function b(y: any = 0) {\n  return y;\n}',
  )
  check('6d 族内互调串 deps（含零参调用不产生尾逗号）', /bCore\(deps, x\) \+ bCore\(deps\)/.test(text), text)
  check('6e 族内名字不算依赖（只留真宿主引用）', JSON.stringify(report.deps) === '["hostA"]', JSON.stringify(report.deps))
  check(
    '6f 递归自引用也改名（否则模块里调的是不存在的原名）',
    /function rCore\(deps: ThingDeps, n: any\) \{\n {2}return n <= 0 \? 0 : rCore\(deps, n - 1\);/.test(
      wrapFn('export function r(n: any) {\n  return n <= 0 ? 0 : r(n - 1);\n}').text,
    ),
  )
}

// 宿主侧：同名薄转发器（调用点零改写）+ 解构实参按绑定名拼回 + 依赖袋必须是**函数声明**（提升）
{
  const { report } = wrapFn(
    'export function pick({ kind: localKind, title }, pageSize = 7) {\n  return localKind + title + pageSize + hostVar;\n}',
  )
  const host = report.hostLines.join('\n')
  check('6g 转发器同名同签名（含默认值）', /^function pick\(\{ kind: localKind, title \}, pageSize = 7\) \{$/m.test(host), host)
  check('6h 解构实参按绑定名拼回（不能把解构模式直接当实参传）', /return pickCore\(thingDeps\(\), \{ kind: localKind, title: title \}, pageSize\);/.test(host), host)
  check('6i 依赖袋是函数声明（`const x = () => ({…})` 有 TDZ，启动期调用会当场崩）', /^function thingDeps\(\) \{$/m.test(host), host)
  check(
    '6j 转发器 zero-dep 也传占位首参（core 签名固定带 deps，实参错位 tsc 不报）',
    /^function r\(n: any\) \{\n {2}return rCore\(\{\}, n\);$/m.test(wrapFn('export function r(n: any) {\n  return n;\n}').report.hostLines.join('\n')),
    wrapFn('export function r(n: any) {\n  return n;\n}').report.hostLines.join('\n'),
  )
}

// 外层写入不是硬失败，而是**必须生成 state 袋**：`x = v` → `deps.x = v`，宿主侧只给 getter 时
// 这个写会在 ESM 严格模式下当场 TypeError（宿主变量永远不变、tsc 一声不吭）
{
  const { report, text } = wrapFn('export function w(x: any) {\n  hostFlag = x;\n  return hostFlag + hostOthers;\n}')
  const host = report.hostLines.join('\n')
  check('6k 外层写入被报出来（调用方据此知道这不是纯函数）', JSON.stringify(report.stateWrites) === '["hostFlag"]', JSON.stringify(report.stateWrites))
  check('6l 写入名生成 get/set 访问器（写回灌宿主变量）', /get hostFlag\(\) \{\n\s+return hostFlag;\n\s+\},\n\s+set hostFlag\(v\) \{\n\s+hostFlag = v;/.test(host), host)
  check(
    '6m 只读依赖也必须惰性访问器（裸简写会在构建袋那一刻急切读取，声明在后即 TDZ）',
    /get hostOthers\(\) \{\n\s+return hostOthers;\n\s+\},/.test(host) && !/\n\s+hostOthers,\n/.test(host),
    host,
  )
  check('6r 袋内**没有**任何裸值简写条目（与语句级 hostCallBody 同口径）', !/^\s+[A-Za-z_$][\w$]*,$/m.test(host), host)
  check('6n 模块里的写仍在 deps 上（穿透靠宿主访问器，模块不特殊处理）', /deps\.hostFlag = x;/.test(text), text)
}

// 袋成员「声明在袋构造点之后」是切片常态；袋必须在 boot 早期构造也不崩 —— 全部 getter 即可免疫
{
  const { report } = wrapFn('export function early() {\n  return late + hostZ;\n}')
  const host = report.hostLines.join('\n')
  check('6s 少依赖（≤6）也走访问器形态，不退回 `({ a, b })` 简写', host.includes('return ({\n') && !/return \(\{ \w/.test(host), host)
  check('6t 每个依赖各一行 getter（顺序与 interface 一致）', /get late\(\) \{\n\s+return late;\n\s+\},\n\s+get hostZ\(\) \{\n\s+return hostZ;\n\s+\},/.test(host), host)
}

// `--host-only`：模块已包装过，从 interface 反推依赖袋、从 core 名反推原名（用于重算宿主接线）
{
  const { text } = wrapFn('export function g(z: any) {\n  return z + hostZ;\n}')
  const file2 = path.join(tmp, 'fn-hostonly.ts')
  fs.writeFileSync(file2, text, 'utf8')
  const report = JSON.parse(
    execFileSync(process.execPath, [TOOL, '--mode=fn', '--host-only', `--module=${file2}`, '--iface=ThingDeps', '--thunk=thingDeps', '--indent='], {
      encoding: 'utf8',
    }),
  )
  check('6o host-only 反推原名（不会拼出 gCoreCore）', JSON.stringify(report.names) === '["g"]', JSON.stringify(report.names))
  check('6p host-only 从 interface 读回依赖袋', JSON.stringify(report.deps) === '["hostZ"]', JSON.stringify(report.deps))
  check('6q host-only 不写盘（模块字节不变）', fs.readFileSync(file2, 'utf8') === text)
}

console.log(process.exitCode ? `\n✗ slice wrap 自检失败（通过 ${pass} 项）` : `\n✓ slice wrap 自检通过：${pass} 项断言`)
