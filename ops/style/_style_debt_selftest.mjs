#!/usr/bin/env node
/**
 * `scripts/gates/check-style-debt.mjs` 的自检：造正/负用例，确认棘轮与「新裸 z-index 必红」真的会拦。
 *
 * 为什么这条自检必须在链上：这条门禁的失效方式全是**静默**的，且方向相反 ——
 *
 *   1. 基线被 fixture 覆盖 → 真实基线归零，此后任何增长都「未超基线」，门禁永远绿；
 *   2. 颜色/层级在**整段样式文本**上匹配 → 选择器里的 `#faded`、`url(#grad)` 被算成硬编码色，
 *      基线从此是一堆噪声，真信号被淹没；
 *   3. 已令牌化的写法被判成债（`rgba(var(--x), .2)`、`z-index: var(--z-modal)`）→ 口径反过来，
 *      逼人不敢用令牌；
 *   4. 只查总量不查每文件 → 拆文件把 3 处搬成两个文件各 2 处，总量不变、债务变多；
 *   5. 「新裸 z-index 数值」只登记不拦 → 随手写 9999 又回来了（这正是它要防的那件事）。
 *
 * 用法：`node scripts/gates/_style_debt_selftest.mjs`
 */
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const GATE = path.join(HERE, 'check-style-debt.mjs')

let passed = 0
const failures = []

function check(label, condition, detail = '') {
  if (condition) passed++
  else failures.push(`${label}${detail ? ` —— ${detail}` : ''}`)
}

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'style-debt-'))
const fixtureRoot = path.join(tmp, 'src')
fs.mkdirSync(fixtureRoot, { recursive: true })
const baselineFile = path.join(tmp, 'baseline.json')

/** `--baseline` 传 null 时**不加该参数**（用于验证「同用 --root 与 --update」的拒绝分支）。 */
function runGate(extra = [], { baseline = baselineFile } = {}) {
  const args = [GATE, `--root=${fixtureRoot}`]
  if (baseline) args.push(`--baseline=${baseline}`)
  args.push(...extra)
  try {
    const out = execFileSync(process.execPath, args, {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      cwd: HERE,
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

// ── 1. 负向：基线缺失必须拦（不许「没基线 = 全通过」）
writeFixture('a.css', 'a { color: red; }\n')
const noBaseline = runGate()
check('基线缺失 → 拦（否则首次落地就静默全绿）', noBaseline.code === 1 && /基线缺失/.test(noBaseline.out), noBaseline.out.slice(-300))

// ── 2. 保护真实基线：`--update --root=` 必须拒绝
const dangerous = runGate(['--update'], { baseline: null })
check(
  '`--update` + `--root=` 无 `--baseline` → 拒绝执行（防 fixture 计数覆盖真实基线）',
  dangerous.code === 2 && /拒绝执行/.test(dangerous.out),
  dangerous.out.slice(-200),
)

// ── 3. 记录基线后：干净树通过
const update = runGate(['--update'])
check('`--update` 写出基线且退出码 0', update.code === 0 && fs.existsSync(baselineFile), update.out.slice(-200))
const clean = runGate()
check('基线就位后干净树通过', clean.code === 0 && /门禁通过/.test(clean.out), clean.out.slice(-300))

// ── 4. 棘轮：`!important` 增长被拦（每文件口径）
writeFixture('b.css', '.x { color: red !important; }\n')
const grew = runGate()
check(
  '`!important` 超基线 → 拦（新文件 0 → 1）',
  grew.code === 1 && /important 增加：b\.css 0 → 1/.test(grew.out),
  grew.out.slice(-300),
)

writeFixture('b.css', '.x { color: red; }\n')
runGate(['--update'])
check('降下来之后 `--update` 把基线里该文件的计数收紧（条目被移除）', !('b.css' in readBaseline().important), JSON.stringify(readBaseline().important))

// 每文件口径：总量不变、只是多了一个文件各 1 处 —— 拆文件的典型退化
writeFixture('c1.css', '.c1 { color: red !important; }\n')
runGate(['--update'])
writeFixture('c2.css', '.c2 { color: red !important; }\n')
const moved = runGate()
check(
  '每文件口径：总量只 +1、却是「新文件从 0 冒头」→ 仍拦（拆文件不能洗白债务）',
  moved.code === 1 && /important 增加：c2\.css 0 → 1/.test(moved.out),
  moved.out.slice(-300),
)
runGate(['--update'])

// ── 5. 棘轮：硬编码色增长被拦，且「已令牌化」的写法不得算债
writeFixture('d.css', '.d { color: #8b9dc3; }\n')
runGate(['--update'])
check('硬编码色计入基线', readBaseline().hardcodedColor['d.css'] === 1, JSON.stringify(readBaseline().hardcodedColor))
writeFixture('d.css', '.d { color: #8b9dc3; background: #ffffff; }\n')
const colorGrew = runGate()
check(
  '硬编码色增加 → 按棘轮拦',
  colorGrew.code === 1 && /hardcodedColor 增加：d\.css 1 → 2/.test(colorGrew.out),
  colorGrew.out.slice(-300),
)

// 已令牌化：`rgba(var(--x), .2)` 不算硬编码色（首参不是数字）。
writeFixture('d.css', '.d { color: var(--hos-text-primary); background: rgba(var(--page-accent-rgb, 129, 140, 248), 0.12); }\n')
runGate(['--update'])
check('`rgba(var(--x), .2)` 不算硬编码色', !('d.css' in readBaseline().hardcodedColor), JSON.stringify(readBaseline().hardcodedColor))

// 注释里的颜色不是债。
writeFixture('d.css', '/* 参考色 #8b9dc3，已改用令牌 */\n.d { color: var(--hos-text-primary); }\n')
const commented = runGate()
check('注释里的 `#hex` 不计入（注释先抹白）', commented.code === 0 && !/hardcodedColor 增加/.test(commented.out), commented.out.slice(-200))

// 选择器里的 `#id`、`url(#grad)` 不是颜色（必须只在声明值里数）。
writeFixture('e.css', '#faded { fill: url(#grad); }\n')
const selectors = runGate()
check(
  '选择器 `#faded` 与 `url(#grad)` 不算硬编码色（只看声明值）',
  selectors.code === 0 && !/hardcodedColor 增加/.test(selectors.out),
  selectors.out.slice(-200),
)

// ── 6. `.vue` 的 `<style>` 区算、脚本区不算
writeFixture('f.vue', '<template><div class="f" /></template>\n<script setup lang="ts">\nconst z = 9999\n</script>\n<style scoped>\n.f { color: red !important; }\n</style>\n')
const vue = runGate()
check(
  '`.vue` 的 `<style>` 区计入（`!important` 命中）',
  vue.code === 1 && /important 增加：f\.vue 0 → 1/.test(vue.out),
  vue.out.slice(-300),
)
check('`.vue` 脚本区的数字不计入 z-index（只算样式文本）', !readBaseline().zIndexValues.includes(9999))
runGate(['--update'])

// ── 7. 硬规则：裸 z-index 取值集合只许收缩
writeFixture('g.css', '.g { z-index: 900; }\n')
runGate(['--update'])
check('裸 z-index 的取值登记进基线', readBaseline().zIndexValues.includes(900), JSON.stringify(readBaseline().zIndexValues))

writeFixture('h.css', '.h { z-index: 900; }\n')
check('复用已登记数值 → 放行（新文件不算新档位）', runGate().code === 0)

writeFixture('h.css', '.h { z-index: 10010; }\n')
const newValue = runGate()
check(
  '未登记的新裸 z-index 数值 → 拦（「随手写 9999」的形态）',
  newValue.code === 1 && /未登记数值 10010/.test(newValue.out) && /h\.css:1/.test(newValue.out),
  newValue.out.slice(-300),
)

writeFixture('h.css', '.h { z-index: var(--z-modal); }\n')
check('`z-index: var(--z-*)` 不算裸数值 → 放行', runGate().code === 0)

// ── 8. `--report` 不判成败
writeFixture('i.css', '.i { color: #abcdef; }\n')
const report = runGate(['--report'])
check('`--report` 只打印分布、退出码 0', report.code === 0 && /样式债/.test(report.out), report.out.slice(-200))

fs.rmSync(tmp, { recursive: true, force: true })

if (failures.length) {
  console.error(`\n✗ 样式债门禁自检失败 ${failures.length} 项（通过 ${passed}）：`)
  for (const f of failures) console.error(`   - ${f}`)
  process.exit(1)
}
console.log(`✓ 样式债门禁自检通过：${passed} 项断言`)
