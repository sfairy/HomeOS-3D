#!/usr/bin/env node
/**
 * codemod：把 `addBoxMesh` / `addCylinderMesh` 的 9 参调用改写为 `box` / `cyl` 的元组形。
 *
 * 改写规则（只有这一条，不做别的）
 * --------------------------------
 *
 *     addBoxMesh(p, w, h, d, x, y, z, c, o?)  →  box(p, [w, h, d], [x, y, z], c, o?)
 *     addCylinderMesh(p, rt, rb, hh, x, y, z, c, o?)  →  cyl(p, [rt, rb, hh], [x, y, z], c, o?)
 *
 * 参数表达式**原样搬运**（只是重新分组放进数组字面量），不做任何重写、化简或求值 —— 因此
 * 求值顺序与取值都不变。行数收益来自「9 个位置参数 → 4～5 个」，具体折行交给 biome。
 *
 * 安全边界
 * --------
 * - 参数个数必须是 8（无 options）或 9，且无顶层 `...` 展开；不满足就跳过并在报告里列出；
 * - 跳过三个定义文件（原语本体与薄包装）—— 在定义文件里改成 `box(` 会形成自引用或环；
 * - 声明（`function box(`）不会被误当作调用；
 * - 只碰 `homeos/frontend/src/studio` 下的 `.ts`。
 *
 * 用法
 * ----
 *     node ops/scripts/codemod-mesh-shorthand.mjs --dry-run
 *     node ops/scripts/codemod-mesh-shorthand.mjs --write
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { nextCallSite } from '../lib/ts-call-args.mjs'
import { walkFiles } from '../lib/walk.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const SCAN_ROOT = path.join(REPO_ROOT, 'homeos/frontend/src/studio')
const SHORTHAND_MODULE = path.join(
  REPO_ROOT,
  'homeos/frontend/src/studio/app/3d-studio/authoring/items/mesh-shorthand.ts',
)
/** 定义文件：在它们内部改写会撞上自引用/循环依赖。 */
const SKIP_FILES = new Set([
  SHORTHAND_MODULE,
  path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/authoring/items/studio-mesh-primitives.ts'),
  path.join(REPO_ROOT, 'homeos/frontend/src/studio/app/3d-studio/authoring/studio-app/geometry/cylinder-mesh.ts'),
])

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const DRY_RUN = args.includes('--dry-run') || !WRITE

const REWRITES = {
  addBoxMesh: 'box',
  addCylinderMesh: 'cyl',
}

/**
 * 该出现位置是**函数声明**（`export function addBoxMesh(`）而不是调用。
 *
 * 只看 `function` 一种形态：`const m = addBoxMesh(...)` 是「用调用结果初始化变量」，
 * 必须照常改写；把 `const x =` 也当声明会静默漏掉真实调用。
 */

/** 计算从 `fromFile` 到薄包装模块的相对导入说明符。 */
function specifierFor(fromFile) {
  const relative = path.relative(path.dirname(fromFile), SHORTHAND_MODULE).split(path.sep).join('/')
  return relative.startsWith('.') ? relative.replace(/\.ts$/, '') : `./${relative.replace(/\.ts$/, '')}`
}

/** 在最后一条 import 之后插入/合并命名导入。 */
function ensureImport(source, names, specifier) {
  const wanted = [...names].sort()
  const importPattern = /^import\s+\{([^}]*)\}\s+from\s+'([^']+)'\s*$/gm
  let match
  let insertAfter = 0
  let lastEnd = 0
  while ((match = importPattern.exec(source)) !== null) {
    lastEnd = match.index + match[0].length
    if (match[2] === specifier) {
      const existing = match[1]
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
      const merged = [...new Set([...existing, ...wanted])].sort()
      const replacement = `import { ${merged.join(', ')} } from '${specifier}'`
      return source.slice(0, match.index) + replacement + source.slice(lastEnd)
    }
    insertAfter = lastEnd
  }
  if (insertAfter === 0) {
    // 没有 import 块：插在文件头注释之后的第一行。
    const headerEnd = source.startsWith('/**') ? source.indexOf('*/') + 2 : 0
    return `${source.slice(0, headerEnd)}\nimport { ${wanted.join(', ')} } from '${specifier}'${source.slice(headerEnd)}`
  }
  const line = `import { ${wanted.join(', ')} } from '${specifier}'`
  return `${source.slice(0, insertAfter)}\n${line}${source.slice(insertAfter)}`
}

let totalRewritten = 0
let totalSkipped = 0
const report = []

const files = []
files.push(...walkFiles(SCAN_ROOT, { extensions: new Set(['.ts']) }))
files.sort()

for (const file of files) {
  if (SKIP_FILES.has(file)) continue
  let source = fs.readFileSync(file, 'utf8')
  if (!source.includes('addBoxMesh(') && !source.includes('addCylinderMesh(')) continue

  const before = source
  const usedNames = new Set()
  let rewrittenInFile = 0
  let cursor = 0

  while (cursor < source.length) {
    const site = nextCallSite(source, cursor, Object.keys(REWRITES))
    if (!site) break
    const { name: bestName, index: bestIndex, args: split, openParen } = site
    if (!split) {
      cursor = openParen + 1
      totalSkipped += 1
      report.push({ file: path.relative(REPO_ROOT, file), reason: 'unbalanced' })
      continue
    }
    // 最后一段可能是右括号前的空白，去掉；其余必须是 8 或 9 个真实参数。
    const rawTexts = split.map((part) => part.text)
    const values = rawTexts.filter((_text, index) => !(index === rawTexts.length - 1 && rawTexts[index].trim() === ''))
    const hasSpread = values.some((value) => /^\s*\.\.\./.test(value))
    if (hasSpread || (values.length !== 8 && values.length !== 9)) {
      cursor = openParen + 1
      totalSkipped += 1
      report.push({
        file: path.relative(REPO_ROOT, file),
        line: source.slice(0, bestIndex).split('\n').length,
        reason: hasSpread ? 'spread' : `arity=${values.length}`,
      })
      continue
    }

    const [parent, first, second, third, fourth, fifth, sixth, color, options] = values.map((value) => value.trim())
    const replacement =
      options === undefined
        ? `${REWRITES[bestName]}(${parent}, [${first}, ${second}, ${third}], [${fourth}, ${fifth}, ${sixth}], ${color})`
        : `${REWRITES[bestName]}(${parent}, [${first}, ${second}, ${third}], [${fourth}, ${fifth}, ${sixth}], ${color}, ${options})`

    const end = split[split.length - 1].end
    source = source.slice(0, bestIndex) + replacement + source.slice(end + 1)
    cursor = bestIndex + replacement.length
    usedNames.add(REWRITES[bestName])
    rewrittenInFile += 1
  }

  if (rewrittenInFile === 0) continue
  source = ensureImport(source, usedNames, specifierFor(file))
  const beforeLines = before.split('\n').length
  const afterLines = source.split('\n').length
  report.push({
    file: path.relative(REPO_ROOT, file),
    calls: rewrittenInFile,
    linesBefore: beforeLines,
    linesAfter: afterLines,
    lineDelta: afterLines - beforeLines,
  })
  totalRewritten += rewrittenInFile
  if (WRITE) fs.writeFileSync(file, source)
}

const summarized = report.filter((row) => row.calls)
console.log(
  `${DRY_RUN ? '[dry-run] ' : ''}改写 ${totalRewritten} 个调用点 / ${summarized.length} 个文件；跳过 ${totalSkipped} 个。`,
)
console.log('（行数变化要等 biome 重新折行后才作数，这里只记原始行差）')
for (const row of summarized) {
  console.log(`  ${String(row.calls).padStart(3)} 处  ${row.lineDelta >= 0 ? '+' : ''}${row.lineDelta} 行  ${row.file}`)
}
const skipped = report.filter((row) => row.reason)
if (skipped.length > 0) {
  console.log('跳过明细：')
  for (const row of skipped) console.log(`  ${row.file}${row.line ? `:${row.line}` : ''} ${row.reason}`)
}
