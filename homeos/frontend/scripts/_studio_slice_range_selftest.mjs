#!/usr/bin/env node
/**
 * `ops/studio_slice_extract.mjs --range=START-END` 的负向自检：**真的造出正/负用例**，逐条确认会拦。
 *
 * 为什么要单列一条自检
 * --------------------
 * `--range` 是给**语句级切片**开的入口（`home.ts` 里成片的余量是事件注册语句，没有名字，
 * `--names` 进不来）。它比 `--names` 多一道「区间 ↔ 语句边界」对账，而这道对账的失效方式恰恰
 * 是最危险的：**悄悄变瞎**。参照 6j 踩过的坑（`--force` 放行了一条跨语句的 1158 行区间，
 * 把中间的 `import` 与两个嵌套局部名一起拖走，`tsc` 只报了个语义无关的错），这里要固定住：
 *
 *   1. 区间正好框住一条语句 → 通过，且**搬走的正文逐字等于**该语句（含内部 shorthand / 注释）；
 *   2. 区间起点落在语句**内部** → 报错退出，不写盘（这是 `--force` 也救不回来的误框）；
 *   3. 区间跨**两条**语句 → 报错退出；
 *   4. 区间端点越界 / 格式错 → 参数错退出码 2；
 *   5. 残留依赖清单必须认得**简写属性**（`{ publishStats }` 里的 `publishStats` 是外层绑定，
 *      `checker.getSymbolAtLocation` 会返回 ShorthandPropertyAssignment 自身 → 漏报）；
 *   6. 语句级切片**不回引**（它没有名字），且源文件里该语句被整条删掉、其余行保持不变；
 *   7. 400 行上限对 `--range` 同样生效（要 `--force`），且 `--force` 后正文仍逐字；
 *   8. 回归：`--names` 通道行为不变（同一 fixture 上仍能按名字搬函数声明）。
 *
 * 用法：`node scripts/_studio_slice_range_selftest.mjs`
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = path.resolve(HERE, '..', '..', '..')
const EXTRACT = path.join(REPO_ROOT, 'ops', 'studio_slice_extract.mjs')

let passed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) passed++
  else failures.push(`${label}${detail ? ` —— ${detail}` : ''}`)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'slice-range-'))

/** 造一个「巨型箭头宿主 + 若干语句」的 fixture：结构上等价于 studio 单体的一角。 */
const fixtureLines = [
  'import { helperA } from "./helper-a";', // 1
  '', // 2
  'export function bootHost(hostRootElement: HTMLElement) {', // 3
  '  const registrations: any[] = [];', // 4
  '  let pingCount = 0;', // 5
  '  const publishStats = () => pingCount;', // 6
  '  const onPing = (event: any) => {', // 7
  '    pingCount += 1;', // 8
  '  };', // 9
  '', // 10
  '  // 批量注册（语句级切片的目标）', // 11
  '  hostRootElement.addEventListener("ping", onPing);', // 12
  '  hostRootElement.addEventListener("pong", (pongEvent: any) => {', // 13
  '    const seen = pongEvent?.detail ?? 0;', // 14
  '    registrations.push({ seen, publishStats, helperA });', // 15
  '  });', // 16
  '', // 17
  '  helperA(registrations);', // 18
  '  return pingCount;', // 19
  '}', // 20
  '', // 21
  'function orphanHelper() {', // 22
  '  return 1;', // 23
  '}', // 24
  '',
]
const fixtureFile = path.join(tmp, 'host.ts')
fs.writeFileSync(fixtureFile, fixtureLines.join('\n'))

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, [EXTRACT, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    return { code: 0, out: stdout }
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

// ---------------------------------------------------------------- 1. 语句级切片（区间正好对上一整条语句）
const outA = path.join(tmp, 'slices', 'registrations.ts')
const dryA = run(['--file=' + fixtureFile, '--out=' + outA, '--range=13-16'])
check('range 命中一条语句', dryA.code === 0 && /--range：命中 ExpressionStatement 13~16/.test(dryA.out), `code=${dryA.code}`)
check('range 报告「不回引」（语句没有名字）', /不回引/.test(dryA.out), dryA.out.split('\n').slice(-8).join(' | '))
check(
  'range 残留依赖认得出简写属性里的外层绑定',
  /publishStats/.test(dryA.out) && /registrations/.test(dryA.out) && /hostRootElement/.test(dryA.out),
  dryA.out,
)
check('range 不把 helperA 误报成残留依赖（import 已重建）', !/残留依赖[\s\S]*helperA\s+@/.test(dryA.out), dryA.out)

// ---------------------------------------------------------------- 2~4. 负向：区间对不上语句边界 / 越界 / 格式
const badMid = run(['--file=' + fixtureFile, '--out=' + path.join(tmp, 'slices', 'mid.ts'), '--range=14-15'])
check('range 起点落在语句内部 → 拦截（不给 --force 也是硬拦）', badMid.code === 1 && /没有正好对上/.test(badMid.out), `code=${badMid.code} ${badMid.out}`)
const badTwo = run(['--file=' + fixtureFile, '--out=' + path.join(tmp, 'slices', 'two.ts'), '--range=12-16'])
check('range 跨两条语句 → 拦截', badTwo.code === 1 && /没有正好对上/.test(badTwo.out), `code=${badTwo.code}`)
const badOver = run(['--file=' + fixtureFile, '--out=' + path.join(tmp, 'slices', 'over.ts'), '--range=12-999'])
check('range 越界 → 参数错（退出码 2）', badOver.code === 2 && /超出文件/.test(badOver.out), `code=${badOver.code}`)
const badFmt = run(['--file=' + fixtureFile, '--out=' + path.join(tmp, 'slices', 'fmt.ts'), '--range=abc'])
check('range 格式错 → 参数错（退出码 2）', badFmt.code === 2 && /START-END/.test(badFmt.out), `code=${badFmt.code}`)

// ---------------------------------------------------------------- 6. apply：源文件整条消失、正文逐字
const applyA = run(['--file=' + fixtureFile, '--out=' + outA, '--range=13-16', '--apply'])
check('range apply 成功', applyA.code === 0, applyA.out)
const srcAfter = fs.readFileSync(fixtureFile, 'utf8')
check('apply 后源文件不再含被搬语句', !/hostRootElement\.addEventListener\("pong"/.test(srcAfter), srcAfter)
check('apply 后源文件其余行为零改动（25 行 → 21 行）', srcAfter.split('\n').length === fixtureLines.length - 4, `实际 ${srcAfter.split('\n').length} 行`)
const movedText = fs.readFileSync(outA, 'utf8')
const expectedMoved = fixtureLines.slice(12, 16).join('\n')
check('apply 后正文逐字等于原语句', movedText.includes(expectedMoved), movedText.split('\n').slice(-8).join(' | '))
check('语句级切片不带 export 前缀', !/^export /m.test(movedText), movedText.slice(0, 200))
check(
  '语句级切片保留首行缩进（`node.getStart` 会吃掉它 —— 已按行首补齐）',
  movedText.includes('\n  hostRootElement.addEventListener("pong"'),
  JSON.stringify(movedText.split('\n')[2]),
)

// ---------------------------------------------------------------- 5+7. 400 行上限 + --force 后仍逐字
const bigLines = [
  'import { helperA } from "./helper-a";',
  '',
  'export function bootHost(root: HTMLElement) {',
  '  const bag: any[] = [];',
  '  helperA(bag,',           // 5  ← 单条多行调用语句从这里开始
]
for (let i = 0; i < 410; i++) bigLines.push(`    { i: ${i}, helperA },`)
bigLines.push('  );', '  return bag;', '}', '')   // → 调用语句结束在第 416 行
const bigFile = path.join(tmp, 'big.ts')
fs.writeFileSync(bigFile, bigLines.join('\n'))
const bigOut = path.join(tmp, 'slices', 'big.ts')
const bigNoForce = run(['--file=' + bigFile, '--out=' + bigOut, '--range=5-416'])
check('range 超 400 行上限 → 拦截并要求 --force', bigNoForce.code === 1 && /--force/.test(bigNoForce.out), `code=${bigNoForce.code} ${bigNoForce.out.slice(-300)}`)
const bigForce = run(['--file=' + bigFile, '--out=' + bigOut, '--range=5-416', '--force', '--apply'])
check('range + --force 放行', bigForce.code === 0, bigForce.out)
const bigMoved = fs.readFileSync(bigOut, 'utf8')
check('--force 放行后正文仍逐字（含首尾行）', bigMoved.includes('helperA(bag,') && bigMoved.includes('{ i: 409, helperA },') && bigMoved.includes('  );'), bigMoved.split('\n').slice(0, 6).join(' | '))

// ---------------------------------------------------------------- 8. 回归：--names 通道不变
const regFile = path.join(tmp, 'reg.ts')
fs.copyFileSync(path.join(tmp, 'host.ts'), regFile)
const byNames = run(['--file=' + regFile, '--out=' + path.join(tmp, 'slices', 'orphan.ts'), '--names=orphanHelper', '--apply'])
check('回归：--names 仍按名字搬函数声明', byNames.code === 0 && /搬走 1 个声明/.test(byNames.out), byNames.out)
check(
  '回归：--names 的「不回引」判定仍生效（orphanHelper 无人引用 → 不回引）',
  /不回引/.test(byNames.out) && !/回引 import \{ orphanHelper \}/.test(byNames.out),
  byNames.out,
)

// ---------------------------------------------------------------- 9~12. 导出面与同目录 specifier（mixin 袋形态）
/**
 * 单体宿主形态 2：文件顶层就是一组 `export function`（消费方 `import * as ns` +
 * `Object.assign(PanelRenderer.prototype, ns as any)`）。这一形态有两个专属坑：
 * 同目录搬运把 specifier 算成 `"./"`；回引写成 `import` 会让导出面静默缩水。
 */
const mixinDir = path.join(tmp, 'renderer')
fs.mkdirSync(mixinDir, { recursive: true })
const mixinFile = path.join(mixinDir, 'host.ts')
fs.writeFileSync(
  mixinFile,
  [
    'import type { PanelRenderer } from "../renderer";', // 1
    'import { helperA } from "./helper-a";', // 2
    '', // 3
    'export function paintPanel(this: PanelRenderer, count: number) {', // 4
    '  return helperA(count) + this.someField;', // 5
    '}', // 6
    '', // 7
    'export function forwardedPanel(this: PanelRenderer, count: number) {', // 8
    '  return paintPanel.call(this, count);', // 9
    '}', // 10
    '', // 11
    'function internalPanel(count: number) {', // 12
    '  return count;', // 13
    '}', // 14
    '', // 15
    'export const hostUsesForwarded = forwardedPanel;', // 16
    'export const hostUsesInternal = internalPanel;', // 17
    '', // 18
  ].join('\n'),
)
const paintOut = path.join(mixinDir, 'paint.ts')
const paintDry = run(['--file=' + mixinFile, '--out=' + paintOut, '--names=paintPanel'])
check(
  '同目录搬运保留原 specifier（不写成 "./"）',
  /from "\.\.\/renderer"/.test(paintDry.out) && !/from "\.\/"/.test(paintDry.out),
  paintDry.out,
)
check('无残留依赖：顶层 export 函数自闭合', /无残留依赖/.test(paintDry.out), paintDry.out)
const paintApply = run(['--file=' + mixinFile, '--out=' + paintOut, '--names=paintPanel', '--apply'])
const mixinAfter = fs.readFileSync(mixinFile, 'utf8')
check(
  'export 声明回引时**转发导出面**（否则 import * as 的命名空间会静默少一个方法）',
  paintApply.code === 0 && /^export \{ paintPanel \} from "\.\/paint";$/m.test(mixinAfter),
  mixinAfter.split('\n').slice(0, 6).join(' | '),
)
check(
  '被搬走的名字本地还在用 → import 与 re-export 并存（re-export 不产生本地绑定）',
  /^import \{ paintPanel \} from "\.\/paint";$/m.test(mixinAfter),
  mixinAfter.split('\n').slice(0, 6).join(' | '),
)
const internalApply = run(['--file=' + mixinFile, '--out=' + path.join(mixinDir, 'internal.ts'), '--names=internalPanel', '--apply'])
const mixinAfter2 = fs.readFileSync(mixinFile, 'utf8')
check(
  '非 export 声明不产生 re-export（内部名字只 import）',
  internalApply.code === 0 && /^import \{ internalPanel \} from "\.\/internal";$/m.test(mixinAfter2) && !/export \{ internalPanel \}/.test(mixinAfter2),
  mixinAfter2.split('\n').slice(0, 8).join(' | '),
)

// ---------------------------------------------------------------- 13~19. 方法形态（--method-form）
/**
 * 单体宿主形态 3：**类方法**（`panel-renderer.ts`）。它和前面两种都不同 ——
 * 方法体靠 `this` 拿实例状态，签名又与类自己的 `interface` 合并面绑定，所以：
 *
 *   1. 正文里 `this` 要改写成实例参数，但**非箭头函数内部的 `this` 不能动**（那是它自己的接收者）；
 *   2. 类侧不能删成员，要**原地留转发薄成员**（签名逐字保留 → 合并面由 tsc 核对，漏一个名字必红）；
 *   3. 模块签名 `self: Host` 里的宿主类要**类型 import 回来**（正文不引用类名，自由引用扫不到）；
 *   4. 不可外迁的形态（`static` / 生成器 / 泛型 / 计算名非标识符）必须**硬失败**，不许猜。
 */
const panelDir = path.join(tmp, 'panel')
fs.mkdirSync(panelDir, { recursive: true })
const panelFile = path.join(panelDir, 'host.ts')
fs.writeFileSync(
  panelFile,
  [
    'import { helperA } from "./helper-a";', // 1
    '', // 2
    'export class PanelRenderer {', // 3
    '  private someField = 1;', // 4
    '', // 5
    '  ["paintPanel"](count: number): number {', // 6
    '    const bump = function () {', // 7
    '      return this.someField;', // 8  ← 非箭头函数的 this，不许改写
    '    };', // 9
    '    return helperA(count) + this.someField + bump();', // 10
    '  }', // 11
    '', // 12
    '  private ["collect"](flag: boolean = true) {', // 13
    '    if (flag) return this.paintPanel(2);', // 14
    '    return 0;', // 15
    '  }', // 16
    '', // 17
    '  ["closeDialog"](target = this.someField, { deep = true } = {}) {', // 18  ← 形参默认值里的 this
    '    return target + (deep ? 1 : 0);', // 19
    '  }', // 20
    '', // 21
    '  static ["noStatic"]() {', // 22
    '    return 1;', // 23
    '  }', // 24
    '', // 25
    '  ["a-b"]() {', // 26
    '    return 2;', // 27
    '  }', // 28
    '}', // 29
    '', // 30
  ].join('\n'),
)
const panelOut = path.join(panelDir, 'panel-methods.ts')
const panelNames = 'paintPanel,collect,closeDialog'
const panelDry = run(['--file=' + panelFile, '--out=' + panelOut, '--names=' + panelNames, '--method-form'])
check('method-form dry-run 通过并标注 [method]', panelDry.code === 0 && /\[method\]/.test(panelDry.out) && /方法形态：类侧原地留转发薄成员/.test(panelDry.out), `code=${panelDry.code} ${panelDry.out.slice(-400)}`)
const panelApply = run(['--file=' + panelFile, '--out=' + panelOut, '--names=' + panelNames, '--method-form', '--apply'])
const panelMoved = fs.readFileSync(panelOut, 'utf8')
const panelHost = fs.readFileSync(panelFile, 'utf8')
check(
  '方法外迁成同名函数：首参 `self: 宿主类` + 原形参/返回类型逐字',
  /^export function paintPanel\(self: PanelRenderer, count: number\): number \{$/m.test(panelMoved),
  panelMoved.split('\n').slice(0, 4).join(' | '),
)
check('正文 `this.` → 实例参数', /return helperA\(count\) \+ self\.someField \+ bump\(\);/.test(panelMoved), panelMoved)
check(
  '形参默认值里的 `this` 也要改写（否则模块里是「顶层函数用 this」= TS2683）',
  /^export function closeDialog\(self: PanelRenderer, target = self\.someField, \{ deep = true \} = \{\}\)/m.test(panelMoved),
  panelMoved,
)
check(
  '类侧转发器保留 `this`（它在类里本来就该是 this），解构形参转成临时名 + 推断类型',
  /^  \["closeDialog"\]\(target = this\.someField, arg\?: \{[^}]*deep\?: boolean[^}]*\}\) \{ return closeDialog\(this, target, arg\); \}$/m.test(panelHost),
  panelHost,
)
check(
  '非箭头函数内部的 `this` **不改写**（那是它自己的接收者）',
  /const bump = function \(\) \{\n\s*return this\.someField;/.test(panelMoved),
  panelMoved,
)
check(
  '宿主类名自动类型 import 回来（正文不引用类名，自由引用扫不到）',
  /^import type \{ PanelRenderer \} from "\.\/host";$/m.test(panelMoved),
  panelMoved.split('\n').slice(0, 3).join(' | '),
)
check(
  '类侧原地留转发薄成员：签名逐字（计算名写法 / private / 默认值 / 返回类型）',
  /^  \["paintPanel"\]\(count: number\): number \{ return paintPanel\(this, count\); \}$/m.test(panelHost) &&
    /^  private \["collect"\]\(flag: boolean = true\) \{ return collect\(this, flag\); \}$/m.test(panelHost),
  panelHost,
)
check('方法形态不产生 re-export（宿主自己不导出这些名字）', !/export \{ paintPanel/.test(panelHost), panelHost.slice(0, 120))
check('回引 import 落在宿主顶层，三个方法一起带回来', /^import \{ paintPanel, collect, closeDialog \} from "\.\/panel-methods";$/m.test(panelHost), panelHost.slice(0, 120))
check(
  'static 方法硬失败（不猜）',
  (() => {
    const r = run(['--file=' + panelFile, '--out=' + path.join(panelDir, 'x.ts'), '--names=noStatic', '--method-form'])
    return r.code === 1 && /static/.test(r.out)
  })(),
)
check(
  '计算名不是合法标识符 → 硬失败（`["a-b"]` 外迁会变成非法函数名）',
  (() => {
    const r = run(['--file=' + panelFile, '--out=' + path.join(panelDir, 'y.ts'), '--names=a-b', '--method-form'])
    return r.code === 1 && /不是合法标识符/.test(r.out)
  })(),
)

fs.rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error(`\n✗ slice --range 自检失败 ${failures.length} 项（通过 ${passed}）：`)
  for (const f of failures) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✓ slice --range 自检通过：${passed} 项断言`)
