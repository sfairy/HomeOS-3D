#!/usr/bin/env node
/**
 * 令牌契约门禁：校验每个 `var(--x)` 都能解析到定义。
 *
 * 未解析且无回退值的 `var(--x)` 会让整条声明变成 invalid at computed-value time ——
 * 属性静默失效（常见症状：背景透明、间距塌成 0）。这类问题构建期不报错、类型检查也查不到，
 * 只能靠静态解析发现。
 *
 * 判定口径：`--x` 只要在样式里作为声明出现、或在任一脚本/模板/后端
 * 文件里以字面量出现（`setProperty('--x')`、`:style`、对象键），就视为「有定义」。
 *
 * 另三项判据（判据实现见 `./selector-var.mjs`）：
 *
 * 2. **选择器位置不得出现 `var()`**：`var()` 只在声明值位置被替换，写在选择器位置
 *    （`:is(var(--list))`、`@media (min-width: var(--x))`）时整条规则解析期即被丢弃。
 *    `main.css` 的毛玻璃禁用组曾因此整段失效，而本门禁此前只扫声明值、看不见它。
 * 3. **毛玻璃禁用组的两份清单必须一致**：同一个清单在 `main.css` 里出现两次
 *    （coarse 触屏组 + `data-glass-effect="static"` 组），两处都字面量内联，天然会漂移。
 * 4. **「有回退」容忍档按棘轮登记**：`var(--x, fallback)` 不会让声明失效，所以它一直是
 *    「可接受、只打印」的档位 —— 但那样新增一处拼错的令牌名只要带个回退就静默通过。
 *    现在这一档逐项登记在 `token-contract-baseline.json`：新增项必红（要么定义令牌、
 *    要么显式 `--update` 认领），基线里失效的项也必须 `--update` 收紧（见 `./baseline-ratchet.mjs`）。
 * 5. **圆角只能有一个命名族**：规范族 `--hos-radius-*` 的值必须在登记表内（或折叠到同族别名），
 *    旧族 `--radius-*` / `--radius-ipad-*` 必须写成 `var(--hos-radius-…)` 别名。
 *    裸长度（`--radius-sm: 12px`）不会新增令牌名、值也合法，评审看不出来，但它让「尺度集合」
 *    悄悄多一档 —— 审计里的「6 套圆角尺度」就是这么长出来的。
 *
 * 用法：`node ops/tokens/check-token-contract.mjs [--json] [--update]`
 * 产出：ops/tokens/reports/token-contract.json；存在未解析且无回退的引用、圆角尺度不单一、
 *       选择器位置的 `var()`、两份禁用清单不一致、或容忍档相对基线有增减时退出码 1。
 *       `--update` 把当前容忍档写成新基线（**只在真的下降之后跑**，它会放宽新增项）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { walk, rel, writeJson, isVendored, blankComments, extractStyleText } from '../lib/scan.mjs'
import { findSelectorVar, glassFallbackLists } from './selector-var.mjs'
import { REPO_ROOT, OUT_DIR, scanDirs, TARGETS } from './targets.mjs'
import { compareRatchet, readBaseline, writeBaseline, BASELINE_KEY } from './baseline-ratchet.mjs'
import { radiusDeclarations, radiusProblemsOf } from './radius-scale.mjs'

//: 毛玻璃禁用组的宿主文件（两份清单都在这里，见 selector-var.mjs 判据二）。
const GLASS_FALLBACK_FILE = path.join('homeos', 'frontend', 'src', 'assets', 'styles', 'main.css')

//: 容忍档基线（逐项登记 `var(--x, fallback)`；判据四）。
const BASELINE_FILE = path.join(path.dirname(fileURLToPath(import.meta.url)), 'token-contract-baseline.json')
const BASELINE_DOC =
  '`var(--x, fallback)` 容忍档的逐项登记（P3 棘轮）。新增项必红，只有两个正当动作：' +
  '① 补令牌定义把它移出本档；② 确认来源不可控（第三方/运行时注入）后跑 `--update` 认领。' +
  '条目失效必须 `--update` 删除，否则清单会退化成「历史最大集合」。'

const asJson = process.argv.includes('--json')
const wantUpdate = process.argv.includes('--update')
const NAME_RE = /--[a-zA-Z0-9-]+(?![a-zA-Z0-9-])/g

/** 声明起始处：上一个非空白字符须为 `{` / `;` / 文件开头。 */
function startsDecl(text, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    if (/\s/.test(text[i])) continue
    return text[i] === '{' || text[i] === ';'
  }
  return true
}

const defNames = new Set()
const knownNames = new Set()
const refs = []
//: 选择器段里的 `var()`（解析期整条规则失效，与「未定义令牌」不是同一类风险）。
const selectorVar = []
//: 圆角声明（判据五：规范族 + 只许别名指向的旧族）。
const radiusDecls = []
let styleFiles = 0

const isCss = (ext) => ext === '.css'
const hasStyle = (ext) => ext === '.css' || ext === '.vue' || ext === '.html'

for (const target of TARGETS) {
  for (const dir of scanDirs(target)) {
    for (const file of walk(dir, new Set(['.css', '.vue', '.html', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.py']))) {
      const r = `${target.project}:${rel(target.root, file)}`
      const repoRel = rel(REPO_ROOT, file)
      if (isVendored(repoRel) || !fs.existsSync(file)) continue
      if (fs.statSync(file).size > 4_000_000) continue
      const ext = path.extname(file)
      const raw = fs.readFileSync(file, 'utf8')

      if (hasStyle(ext)) {
        styleFiles += 1
        const style = blankComments(extractStyleText(file, raw))
        for (const m of style.matchAll(NAME_RE)) {
          if (/^\s*:/.test(style.slice(m.index + m[0].length)) && startsDecl(style, m.index)) defNames.add(m[0])
        }
        // 引用：`var(--x)` / `var(--x, fallback)`（fallback 可为空 → 仍算无回退）
        for (const m of style.matchAll(/var\(\s*(--[a-zA-Z0-9-]+)\s*(,?)/g)) {
          const line = style.slice(0, m.index).split('\n').length
          refs.push({ name: m[1], file: r, line, hasFallback: m[2] === ',' })
        }
        // 选择器位置的 var()：`var()` 在这里不会被替换，整条规则解析失败被丢弃。
        for (const hit of findSelectorVar(style)) selectorVar.push({ file: r, ...hit })
        // 圆角声明（判据五）：连值一起收集 —— 只看名字看不出「值偷偷多了第四档尺度」。
        radiusDecls.push(...radiusDeclarations(style, r))
      }

      // .vue/.html 既有样式区也有脚本区：脚本里的字面量视为「已知名字」，
      // 覆盖 setProperty('--x')、:style 对象键、模板里的内联样式，避免误报为未解析。
      if (!isCss(ext)) {
        const script = raw.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
        for (const m of script.matchAll(NAME_RE)) knownNames.add(m[0])
      }
    }
  }
}

const defined = (name) => defNames.has(name) || knownNames.has(name)

const unresolved = []
const unresolvedWithFallback = []
const seen = new Set()
for (const ref of refs) {
  if (defined(ref.name)) continue
  const key = `${ref.file}|${ref.name}`
  if (seen.has(key)) continue
  seen.add(key)
  ;(ref.hasFallback ? unresolvedWithFallback : unresolved).push(ref)
}

unresolved.sort((a, b) => a.name.localeCompare(b.name) || a.file.localeCompare(b.file))
unresolvedWithFallback.sort((a, b) => a.name.localeCompare(b.name))
selectorVar.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)

// ── 毛玻璃禁用组：两份清单必须逐项一致 ────────────────────────────────────────
// 该清单在一个文件里出现两次（coarse 触屏组 + data-glass-effect="static" 组），
// 两处都必须字面量内联（判据一），于是天然会漂移 —— 这里把「必须一致」钉住。
const glassProblems = []
{
  const glassPath = path.join(REPO_ROOT, GLASS_FALLBACK_FILE)
  if (!fs.existsSync(glassPath)) {
    glassProblems.push(`毛玻璃禁用组宿主文件缺失：${GLASS_FALLBACK_FILE}`)
  } else {
    const { coarse, static: staticMode } = glassFallbackLists(fs.readFileSync(glassPath, 'utf8'))
    if (!coarse || !staticMode) {
      glassProblems.push(
        `解析失败：${GLASS_FALLBACK_FILE} 里找不到毛玻璃禁用组的一份或两份 :is() 清单` +
          '（规则被删 / 写法变了？拒绝放行）',
      )
    } else if (coarse.join('\n') !== staticMode.join('\n')) {
      const onlyCoarse = coarse.filter((item) => !staticMode.includes(item))
      const onlyStatic = staticMode.filter((item) => !coarse.includes(item))
      glassProblems.push(
        `毛玻璃禁用组的两份清单不一致（coarse 触屏组 ${coarse.length} 项 / static 组 ${staticMode.length} 项）：` +
          `仅 coarse 有 [${onlyCoarse.join(', ')}]；仅 static 有 [${onlyStatic.join(', ')}]` +
          '（新增 blur 使用点时两处都要登记）',
      )
    }
  }
}

// ── 判据五：圆角尺度单一化 ────────────────────────────────────────────────────
// 判定逻辑在 `./radius-scale.mjs`（纯函数，便于自检注入合成样式文本）。
const radiusProblems = radiusProblemsOf(radiusDecls)

const result = {
  generatedAt: new Date().toISOString(),
  styleFilesScanned: styleFiles,
  definedNames: defNames.size,
  knownNamesViaScripts: knownNames.size,
  totalRefs: refs.length,
  unresolvedCount: unresolved.length,
  unresolvedWithFallbackCount: unresolvedWithFallback.length,
  selectorVarCount: selectorVar.length,
  radiusDeclCount: radiusDecls.length,
  radiusProblems,
  unresolved,
  unresolvedWithFallback,
  selectorVar,
}

// ── 判据四：容忍档棘轮 ────────────────────────────────────────────────────────
// 键口径 `<file>|<name>`：行号会因无关改动漂移，用行号做键会让基线天天「新增+消失」。
const toleratedKeys = unresolvedWithFallback.map((u) => `${u.file}|${u.name}`)
const ratchetProblems = []
let ratchet = null

if (wantUpdate) {
  writeBaseline(BASELINE_FILE, toleratedKeys, BASELINE_DOC)
  ratchet = compareRatchet(toleratedKeys, toleratedKeys)
} else {
  const baseline = readBaseline(BASELINE_FILE)
  if (baseline === null) {
    ratchetProblems.push(
      `容忍档基线缺失或形状不对：${rel(REPO_ROOT, BASELINE_FILE)}` +
        `（期望 \`{ "${BASELINE_KEY}": ["<file>|<name>", …] }\`；跑 \`--update\` 生成）`,
    )
  } else {
    ratchet = compareRatchet(toleratedKeys, baseline)
    for (const key of ratchet.added) {
      ratchetProblems.push(
        `新增容忍项（未解析但有回退）：${key} —— 先补令牌定义；确属外部/不可控来源时跑 \`--update\` 认领`,
      )
    }
    for (const key of ratchet.removed) {
      ratchetProblems.push(
        `基线里的容忍项已不存在：${key} —— 跑 \`--update\` 收紧基线（容忍清单只减不增）`,
      )
    }
  }
}

result.ratchet = ratchet
result.ratchetProblems = ratchetProblems
writeJson(`${OUT_DIR}/token-contract.json`, result)

const failed =
  unresolved.length > 0 ||
  selectorVar.length > 0 ||
  glassProblems.length > 0 ||
  radiusProblems.length > 0 ||
  ratchetProblems.length > 0

if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  console.log(`令牌契约：扫描 ${styleFiles} 个样式文件，引用 ${refs.length} 次`)
  console.log(`  有定义的名字：${defNames.size}（另有 ${knownNames.size} 个仅脚本/模板出现）`)
  console.log(`  未解析且**无回退**（真风险）：${unresolved.length}`)
  // 不截断：这档是硬失败项，漏打印等于让人拿着「前 40 条」猜剩下还有多少。
  for (const u of unresolved) console.log(`      ${u.name}  ${u.file}:${u.line}`)
  console.log(`  未解析但有回退（容忍档，逐项登记在 ${rel(REPO_ROOT, BASELINE_FILE)}）：${unresolvedWithFallback.length}`)
  for (const u of unresolvedWithFallback) console.log(`      ${u.name}  ${u.file}:${u.line}`)
  console.log(`  选择器位置的 var()（解析期整条规则失效）：${selectorVar.length}`)
  for (const hit of selectorVar) console.log(`      ${hit.file}:${hit.line}  ${hit.snippet}`)
  console.log(`  圆角声明（判据五，规范族 + 别名族）：${radiusDecls.length}`)
  for (const problem of radiusProblems) console.log(`  ✗ ${problem}`)
  for (const problem of glassProblems) console.log(`  ✗ ${problem}`)
  for (const problem of ratchetProblems) console.log(`  ✗ ${problem}`)
  if (wantUpdate) console.log(`  ↻ 已重写容忍档基线（${toleratedKeys.length} 项）`)
  if (!failed) console.log('\n✓ 所有 var() 引用均可解析；选择器位置无 var()；毛玻璃禁用组两份清单一致；圆角尺度单一；容忍档与基线一致。')
}

process.exit(failed ? 1 : 0)
