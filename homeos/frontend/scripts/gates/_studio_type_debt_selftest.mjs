#!/usr/bin/env node
/**
 * `scripts/gates/check-studio-type-debt.mjs` 的自检：造正/负用例，确认棘轮真的会拦、豁免真的不误伤。
 *
 * 为什么这条自检必须在链上
 * 棘轮门禁的失效方式全是**静默**的，而且方向刚好相反：
 *
 *   1. 基线被 fixture 覆盖 → 真实基线归零，此后任何增长都「未超基线」，门禁永远绿；
 *   2. 空 catch 在「注释抹白后的文本」上匹配 → 写了理由的 catch 被判成裸空（口径反过来，逼人删注释）；
 *   3. 硬零规则（开放袋子）只登记不拦 → 拆 dep 包时又长回来；
 *   4. 只查总量不查每文件 → 拆文件把 3 处搬成两个文件各 2 处，总量不变、债务变多。
 *
 * 用法：`node scripts/gates/_studio_type_debt_selftest.mjs`
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.join(HERE, 'check-studio-type-debt.mjs')

let passed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) passed++
  else failures.push(`${label}${detail ? ` —— ${detail}` : ''}`)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'studio-type-debt-'))
const fixtureRoot = path.join(tmp, 'src', 'studio')
fs.mkdirSync(fixtureRoot, { recursive: true })
const baselineFile = path.join(tmp, 'baseline.json')

/** `--baseline` 传 null 时**不加该参数**（专门用于验证「同用 --root 与 --update」的拒绝分支）。 */
function runGate(extra = [], { root = fixtureRoot, baseline = baselineFile } = {}) {
  const args = [GATE, `--root=${root}`]
  if (baseline) args.push(`--baseline=${baseline}`)
  args.push(...extra)
  try {
    const out = execFileSync(process.execPath, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: path.dirname(HERE),
    })
    return { code: 0, out }
  } catch (err) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` }
  }
}

function writeFixture(relPath, body) {
  const file = path.join(fixtureRoot, relPath)
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, body, 'utf8')
  return file
}

const readBaseline = () => JSON.parse(fs.readFileSync(baselineFile, 'utf8'))

// ------------------------------------------------ 1. 负向：基线缺失必须拦（不许「没基线 = 全通过」）
writeFixture('a.ts', 'export const a = 1\n')
const noBaseline = runGate()
check(
  '基线缺失 → 拦（否则首次落地就静默全绿）',
  noBaseline.code === 1 && /基线缺失/.test(noBaseline.out),
  noBaseline.out.slice(-300),
)

// ------------------------------------------------ 2. 保护真实基线：`--update --root=` 必须拒绝
const dangerous = runGate(['--update'], { baseline: null })
check(
  '`--update` + `--root=` 无 `--baseline` → 拒绝执行（防 fixture 计数覆盖真实基线）',
  dangerous.code === 2 && /拒绝执行/.test(dangerous.out),
  dangerous.out.slice(-240),
)

// ------------------------------------------------ 3. 记录基线后：干净树通过
const update = runGate(['--update'])
check('`--update` 写出基线且退出码 0', update.code === 0 && fs.existsSync(baselineFile), update.out.slice(-200))
const clean = runGate()
check('基线就位后干净树通过', clean.code === 0 && /门禁通过/.test(clean.out), clean.out.slice(-300))

// ------------------------------------------------ 4. 负向：`as any` 增长被拦；下降只提示不拦
writeFixture('b.ts', 'export function f(x: unknown) {\n  return (x as any).y as any\n}\n')
const grew = runGate()
check(
  '`as any` 超基线 → 拦（新文件 0 → 2）',
  grew.code === 1 && /asAny 增加：b\.ts 0 → 2/.test(grew.out),
  grew.out.slice(-300),
)

writeFixture('b.ts', 'export function f(x: unknown) {\n  return (x as any).y\n}\n')
runGate(['--update'])
check('降下来之后 `--update` 把基线收紧到 1', readBaseline().asAny['b.ts'] === 1, JSON.stringify(readBaseline().asAny))
check('收紧后通过', runGate().code === 0)

// 每文件口径：总量不变、只是多了一个文件各 1 处 —— 拆文件的典型退化
writeFixture('c1.ts', 'export const c1 = (x: unknown) => (x as any).a\n')
runGate(['--update'])
writeFixture('c2.ts', 'export const c2 = (x: unknown) => (x as any).b\n')
const moved = runGate()
check(
  '每文件口径：总量只 +1、却是「新文件从 0 冒头」→ 仍拦（拆文件不能洗白债务）',
  moved.code === 1 && /asAny 增加：c2\.ts 0 → 1/.test(moved.out),
  moved.out.slice(-300),
)

// ------------------------------- 5. 空 catch 块硬零 + 「吞掉的 promise」棘轮
runGate(['--update']) // 先收下第 4 节遗留的 c2.ts 增量，避免它的回退拖累本节判定
writeFixture('d.ts', 'export function f() {\n  try {\n    g()\n  } catch {}\n}\n')
const bareCatch = runGate()
check(
  '空 catch 块 → 硬零拦下（与基线无关；eslint `no-empty` 已按 allowEmptyCatch=false 对齐）',
  bareCatch.code === 1 && /空 catch 块 1 处/.test(bareCatch.out) && /d\.ts/.test(bareCatch.out),
  bareCatch.out.slice(-300),
)

writeFixture('d.ts', 'export function f() {\n  try {\n    g()\n  } catch (err) {}\n}\n')
check('`catch (err) {}` 同样算空 catch 块', runGate().code === 1)

writeFixture(
  'd.ts',
  'export function f() {\n  try {\n    g()\n  } catch {\n    /* 有意忽略：localStorage 在隐私模式下会抛，写失败不影响渲染 */\n  }\n}\n',
)
const commented = runGate()
check(
  '写了理由的 catch 不算空块（注释豁免是刻意的：拦「什么都不说」，不是「不许忽略」）',
  commented.code === 0,
  commented.out.slice(-300),
)
runGate(['--update'])
check(
  '空 catch 块不入基线（只登记 as any / 吞掉的 promise 两类棘轮）',
  !('emptyCatch' in readBaseline()) && !('emptyCatchBlock' in readBaseline()),
  JSON.stringify(Object.keys(readBaseline())),
)

writeFixture('d.ts', 'export function f() {\n  return p.catch(() => {})\n}\n')
runGate(['--update'])
check('吞掉的 promise 计入基线', readBaseline().swallowedPromise['d.ts'] === 1, JSON.stringify(readBaseline().swallowedPromise))
writeFixture('d.ts', 'export function f() {\n  return p.catch(() => {}).catch(() => {})\n}\n')
const swallowed = runGate()
check(
  '`.catch(() => {})` 增加 → 按棘轮拦（它不是块语句，eslint no-empty 看不见）',
  swallowed.code === 1 && /swallowedPromise 增加：d\.ts 1 → 2/.test(swallowed.out),
  swallowed.out.slice(-300),
)
writeFixture('d.ts', 'export function f() {\n  return p.catch(() => {})\n}\n')
runGate(['--update'])

// ------------------------------------------------ 6. 硬零：开放袋子（不设基线也要拦）
writeFixture('e.ts', 'export type Bag = { [key: string]: any }\n')
const bag = runGate()
check(
  '`{ [key: string]: any }` → 拦（硬零，与基线无关）',
  bag.code === 1 && /开放袋子/.test(bag.out) && /e\.ts/.test(bag.out),
  bag.out.slice(-300),
)
fs.rmSync(path.join(fixtureRoot, 'e.ts'))

// ------------------------------------------------ 7. `: any` 只登记不拦（拆 dep 包会先升后降）
writeFixture('f.ts', 'export function f(a: any, b: any) {\n  return a + b\n}\n')
const annot = runGate()
check(
  '`: any` 注解只登记、不设棘轮（拦它等于拦拆分本身）',
  annot.code === 0 && /: any 注解\s+2/.test(annot.out),
  annot.out.slice(-300),
)

// ------------------------------------------------ 8. `--report` 不判成败
writeFixture('g.ts', 'export const g = (x: unknown) => (x as any).c\n')
const report = runGate(['--report'])
check('`--report` 只打印分布、退出码 0', report.code === 0 && /as any/.test(report.out), report.out.slice(-200))

fs.rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error(`\n✗ studio 类型/吞错债门禁自检失败 ${failures.length} 项（通过 ${passed}）：`)
  for (const f of failures) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✓ studio 类型/吞错债门禁自检通过：${passed} 项断言`)
