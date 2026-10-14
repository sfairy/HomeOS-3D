#!/usr/bin/env node
/**
 * studio 类型/吞错债门禁（`check-host-bindings.mjs` 同一族的**棘轮型**门禁）。
 *
 * 为什么需要它
 * 审计口径下 studio 的类型与吞错债 100% 集中在这个目录（`as any` 649 处、空 `catch {}` 75 处），
 * 而这两类东西**没有任何门禁看得见**：
 *
 * - `tsc` 全绿：`as any` 与空 catch 恰恰是「让类型系统闭嘴」的手段，它当然不报；
 * - eslint 也不报：类型由 typecheck 把关（studio 块只开 unused-imports），
 *   而 `no-empty` 在共享规则核里是 `allowEmptyCatch: true`；
 * - 已有的三条 studio KPI 量的是**行数与域覆盖**，与类型债无关。
 *
 * 于是「拆一刀顺手多写两个 `as any`」「新文件里 catch 一把吞掉」永远不会被发现 —— 这正是
 * P2 要修的债**会被拆分过程重新生产出来**的原因。所以这里按棘轮（只减不增）+ 一条硬零规则收口：
 *
 * 1. **硬零**：空 `catch {}` 块（含 `catch (e) {}`）与 `{ [key: string]: any }` 开放袋子 —— 出现在依赖袋上等于「宿主拼错键名也没人管」
 *    （实测已拦到一处真错：`home-custom-popup-editor.ts` 用了 `currentPage` 而清单里没有）。
 *    这类袋子只有 7 处，已全部换成显式字段（`ops/studio/studio_context_bag_typing.mjs`），所以直接零容忍。
 * 2. **棘轮**：`as any` 与**裸空 catch**（`catch {}` / `catch (e) {}`，体内除空白外什么都没有）
 *    的**每文件计数**不得超过基线；基线存 `studio-type-debt-baseline.json`，`--update` 收紧。
 * 3. **注释豁免是刻意的**：体内只写了一句理由注释的 catch 不算裸空 —— 门禁要拦的是「什么都不说」，
 *    不是「必须打日志」；有些 best-effort 分支（`localStorage` 写入、清理时 remove）确实只需说明理由。
 *
 * 用法：
 * ```bash
 * node scripts/gates/check-studio-type-debt.mjs            # 门禁（CI 跑这条）
 * node scripts/gates/check-studio-type-debt.mjs --update   # 收紧基线（只在真降下来之后跑）
 * node scripts/gates/check-studio-type-debt.mjs --report   # 只打印分布，不判成败
 * ```
 * `--root=<dir>` / `--baseline=<file>` 供自检注入 fixture（默认 `src/studio` 与 `scripts/gates/studio-type-debt-baseline.json`）。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { walkSource, blankComments, rel } from '../../../../ops/lib/scan.mjs'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FRONTEND = path.resolve(HERE, '..', '..')
const DEFAULT_BASELINE = path.join(HERE, 'studio-type-debt-baseline.json')

const argv = process.argv.slice(2)
const wantUpdate = argv.includes('--update')
const reportOnly = argv.includes('--report')
const rootArg = argv.find((a) => a.startsWith('--root='))
const baselineArg = argv.find((a) => a.startsWith('--baseline='))
const ROOT = path.resolve(FRONTEND, rootArg ? rootArg.slice('--root='.length) : 'src/studio')
const BASELINE_FILE = baselineArg ? path.resolve(baselineArg.slice('--baseline='.length)) : DEFAULT_BASELINE

// `--update --root=<fixture>` 会拿 fixture 的计数覆盖**真实基线**（自检最容易踩的坑自己先堵上）。
if (wantUpdate && rootArg && !baselineArg) {
  console.error('✗ 拒绝执行：`--update` 与 `--root=` 同用会把 fixture 计数写进真实基线，须同时给 `--baseline=`。')
  process.exit(2)
}

const AS_ANY = /\bas\s+any\b/g
const INDEX_BAG = /\{\s*\[key:\s*string\]:\s*any\s*\}/g
// 空 catch 必须在**原文**上匹配：注释抹白会把 `catch { /* 理由 */ }` 变成 `catch {   }`，
// 那样连「写了理由」的也会被算成裸空 —— 门禁的口径就反了。
// 空 catch **块**（`catch {}` / `catch (e) {}`，除空白外什么都没有）：eslint `no-empty` 的口径。
// 必须在**原文**上匹配：注释抹白会把 `catch { /* 理由 */ }` 变成 `catch {   }`，那样连写了理由的也会被算成裸空。
const EMPTY_CATCH_BLOCK = /(?<![\w.$])catch\s*(?:\([^)]*\))?\s*\{\s*\}/g
// 吞掉的 promise：`.catch(() => {})`。它**不是**块语句，eslint `no-empty` 看不见（那是 `no-empty-function` 的地盘），
// 所以这类只能在此按棘轮收口 —— 故意吞掉的异步失败同样是「静默」的一种。
const SWALLOWED_PROMISE = /\.catch\(\s*(?:\(\s*[\w$]*\s*\)|[\w$]+)\s*=>\s*\{\s*\}\s*\)/g
const ANY_ANNOTATION = /:\s*any\b/g

const lineOf = (text, index) => text.slice(0, index).split('\n').length

/** 逐文件计数；返回 `{ counts, hits }`，hits 是带行号的样本（前若干条）。 */
function scanDir(dir) {
  const files = walkSource(dir).sort()
  const counts = { asAny: {}, emptyCatchBlock: {}, swallowedPromise: {}, indexBag: {}, anyAnnotation: {} }
  const hits = []
  for (const file of files) {
    // key 的口径：仓库内文件用 `src/studio/...` 形态（与基线文件里的人类可读路径一致）；
    // fixture 落在仓库外时回落到「相对传入 root」，否则键会是一长串 `../../..`（自检里最刺眼的那种噪声）。
    const fromFrontend = rel(FRONTEND, file)
    const relPath = fromFrontend.startsWith('../') ? rel(ROOT, file) : fromFrontend
    const raw = fs.readFileSync(file, 'utf8')
    const blank = blankComments(raw)

    const asAny = [...blank.matchAll(AS_ANY)]
    const bags = [...blank.matchAll(INDEX_BAG)]
    const emptyBlocks = [...raw.matchAll(EMPTY_CATCH_BLOCK)]
    const swallowed = [...raw.matchAll(SWALLOWED_PROMISE)]
    const anyAnnotations = [...blank.matchAll(ANY_ANNOTATION)]

    if (asAny.length) counts.asAny[relPath] = asAny.length
    if (emptyBlocks.length) counts.emptyCatchBlock[relPath] = emptyBlocks.length
    if (swallowed.length) counts.swallowedPromise[relPath] = swallowed.length
    if (bags.length) counts.indexBag[relPath] = bags.length
    if (anyAnnotations.length) counts.anyAnnotation[relPath] = anyAnnotations.length

    for (const m of bags) hits.push({ kind: 'indexBag', file: relPath, line: lineOf(raw, m.index) })
    for (const m of emptyBlocks.slice(0, 3))
      hits.push({ kind: 'emptyCatchBlock', file: relPath, line: lineOf(raw, m.index) })
  }
  return { files: files.length, counts, hits }
}

const total = (obj) => Object.values(obj).reduce((a, b) => a + b, 0)

const { files: scannedFiles, counts, hits } = scanDir(ROOT)

if (wantUpdate) {
  const baseline = {
    $comment:
      'studio 类型/吞错债基线（棘轮：只减不增）。由 `node scripts/gates/check-studio-type-debt.mjs --update` 重记。',
    $scope: rel(FRONTEND, ROOT),
    asAny: counts.asAny,
    swallowedPromise: counts.swallowedPromise,
    indexBag: counts.indexBag,
  }
  fs.writeFileSync(BASELINE_FILE, `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')
  console.log(
    `基线已更新：as any ${total(counts.asAny)} 处 / 吞掉的 promise ${total(counts.swallowedPromise)} 处 / ` +
      `开放袋子 ${total(counts.indexBag)} 处（空 catch 块 ${total(counts.emptyCatchBlock)} 处为硬零，不入基线）` +
      `（${rel(FRONTEND, BASELINE_FILE)}）`,
  )
  process.exit(0)
}

const baseline = fs.existsSync(BASELINE_FILE) ? JSON.parse(fs.readFileSync(BASELINE_FILE, 'utf8')) : null

const problems = []
const regressions = []
const drift = []
if (!baseline && !reportOnly)
  problems.push(
    `基线缺失：${rel(FRONTEND, BASELINE_FILE)}（先跑 node scripts/gates/check-studio-type-debt.mjs --update）`,
  )
for (const key of ['asAny', 'swallowedPromise']) {
  const base = baseline?.[key] ?? {}
  for (const [file, n] of Object.entries(counts[key])) {
    const was = base[file] ?? 0
    if (n > was) regressions.push(`${key} 增加：${file} ${was} → ${n}`)
  }
  for (const [file, was] of Object.entries(base)) {
    const now = counts[key][file] ?? 0
    if (now < was) drift.push(`${key} 下降：${file} ${was} → ${now}（可 --update 收紧）`)
  }
}
for (const [file, n] of Object.entries(counts.emptyCatchBlock))
  problems.push(
    `空 catch 块 ${n} 处：${file} —— 在体内写清忽略理由（\`/* … */\`），或收窄异常 / 记日志；eslint \`no-empty\` 已按 allowEmptyCatch=false 收口`,
  )
for (const [file, n] of Object.entries(counts.indexBag))
  problems.push(`开放袋子 \`{ [key: string]: any }\` ${n} 处：${file}（换成显式字段，见 ops/studio/studio_context_bag_typing.mjs）`)

const summary = {
  scannedFiles,
  scope: rel(FRONTEND, ROOT),
  asAny: total(counts.asAny),
  emptyCatchBlock: total(counts.emptyCatchBlock),
  swallowedPromise: total(counts.swallowedPromise),
  indexBag: total(counts.indexBag),
  anyAnnotation: total(counts.anyAnnotation),
  asAnyBaseline: baseline ? total(baseline.asAny) : null,
  swallowedPromiseBaseline: baseline ? total(baseline.swallowedPromise) : null,
}

console.log(`studio 类型/吞错债（${summary.scope}，${scannedFiles} 个文件）：`)
console.log(`  as any          ${summary.asAny}（基线 ${summary.asAnyBaseline}）`)
console.log(`  空 catch 块     ${summary.emptyCatchBlock}（硬零）`)
console.log(`  吞掉的 promise  ${summary.swallowedPromise}（基线 ${summary.swallowedPromiseBaseline}）`)
console.log(`  开放袋子        ${summary.indexBag}（硬零）`)
console.log(`  : any 注解      ${summary.anyAnnotation}（仅登记，不设棘轮 —— 拆 dep 包时会先升后降）`)
for (const h of hits.slice(0, 20)) console.log(`   - ${h.kind} ${h.file}:${h.line}`)
if (hits.length > 20) console.log(`   … 其余 ${hits.length - 20} 条同类命中`)

if (reportOnly) process.exit(0)

if (drift.length > 0) for (const d of drift) console.log(`  ↳ ${d}`)

for (const p of problems) console.error(`✗ ${p}`)
for (const r of regressions) console.error(`✗ ${r}`)

if (problems.length + regressions.length > 0) {
  console.error(
    `\n✗ studio 类型/吞错债门禁未通过：${problems.length} 处硬违规 + ${regressions.length} 处棘轮回退。`,
  )
  process.exit(1)
}
console.log('\n✓ studio 类型/吞错债门禁通过：无空 catch 块、无开放袋子、as any 与吞掉的 promise 未超基线。')
