#!/usr/bin/env node
/**
 * 网格原语调用的「几何参数黄金快照」。
 *
 * 为什么需要它
 * ------------
 * `addBoxMesh(parent, w, h, d, x, y, z, color, options)` 有 9 个位置参数，一屏之内数不清哪个
 * 是宽、哪个是 y。把它改写成 `box(parent, [w, h, d], [x, y, z], color, options)` 能省下大量
 * 换行，但**唯一**可接受的等价证明是：每个调用点的每个参数表达式、顺序、字符内容完全不变。
 * 本脚本把这件事变成可执行的比对，而不是靠肉眼 review。
 *
 * 口径
 * ----
 * - 逐文件按出现顺序编号，一个调用点一条记录：`file#n`；
 * - 每条记录把 9 个位置参数折叠成 `{ parent, size: [w,h,d] | [rTop,rBottom,h], at: [x,y,z], color, options? }`；
 * - 表达式文本只做**空白归一**（`width6 *\n  0.9` ≡ `width6 * 0.9`），不做任何标识符或常量改写；
 * - `addBoxMesh` / `addCylinderMesh`（旧形）与 `box` / `cyl`（新形）解析到同一种记录 ——
 *   因此「改写后快照逐字节不变」即等价于「传进原语的值与顺序不变」。
 *
 * 为什么这足够：`box` / `cyl` 是纯转发（见 `items/mesh-shorthand.ts`），按原顺序把值交回
 * `addBoxMesh` / `addCylinderMesh`；参数表达式顺序不变 ⇒ 求值顺序不变 ⇒ 生成的几何与材质不变。
 *
 * 用法
 * ----
 *     node ops/checks/geometry-call-golden.mjs --write     # 写基线
 *     node ops/checks/geometry-call-golden.mjs --check     # 与基线比对，有任何差异即失败
 *     node ops/checks/geometry-call-golden.mjs --report    # 只打印统计
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { execFileSync } from 'node:child_process'

import { nextCallSite } from '../lib/ts-call-args.mjs'
import { walkFiles } from '../lib/walk.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const BASELINE_PATH = path.join(REPO_ROOT, 'ops/checks/geometry-calls-baseline.json')
const SCAN_ROOT = path.join(REPO_ROOT, 'homeos/frontend/src/studio')

/** 旧形 → `{ kind, offset }`；新形的参数折叠规则见 `readCall`。 */
const PRIMITIVES = {
  addBoxMesh: { kind: 'box', legacy: true },
  addCylinderMesh: { kind: 'cyl', legacy: true },
  box: { kind: 'box', legacy: false },
  cyl: { kind: 'cyl', legacy: false },
}

const args = process.argv.slice(2)
const hasFlag = (name) => args.includes(`--${name}`)

/** 表达式空白归一：换行/多空格/逗号后换行都折叠，标识符与数字原样保留。 */
function normalizeExpression(text) {
  return text
    .replace(/\s+/g, ' ')
    .replace(/\s*,\s*/g, ', ')
    .replace(/([([{]) /g, '$1')
    .replace(/ ([)\]},])/g, '$1')
    .trim()
}

/** 去掉数组字面量最外层 `[...]`，再按顶层逗号切分。 */
function readTuple(expression) {
  const text = expression.trim()
  if (!text.startsWith('[') || !text.endsWith(']')) return null
  const inner = text.slice(1, -1)
  const parts = []
  let depth = 0
  let currentStart = 0
  for (let index = 0; index < inner.length; index += 1) {
    const char = inner[index]
    if (char === '(' || char === '[' || char === '{') depth += 1
    else if (char === ')' || char === ']' || char === '}') depth -= 1
    else if (char === ',' && depth === 0) {
      parts.push(inner.slice(currentStart, index))
      currentStart = index + 1
    }
  }
  parts.push(inner.slice(currentStart))
  return parts.map((part) => normalizeExpression(part))
}

/** 一个调用点 → 规范记录；形状不合法（spread、参数个数不对）时返回 `{ unsupported: 原因 }`。 */
function describeCall(rawArgs, legacy) {
  const values = rawArgs.filter((_value, index) => !(index === rawArgs.length - 1 && rawArgs[index] === ''))
  if (legacy) {
    if (values.length !== 8 && values.length !== 9) return { unsupported: `arity=${values.length}` }
    const [parent, w, h, d, x, y, z, color, options] = values
    const record = {
      parent: normalizeExpression(parent),
      size: [normalizeExpression(w), normalizeExpression(h), normalizeExpression(d)],
      at: [normalizeExpression(x), normalizeExpression(y), normalizeExpression(z)],
      color: normalizeExpression(color),
    }
    if (options !== undefined) record.options = normalizeExpression(options)
    return record
  }
  if (values.length !== 4 && values.length !== 5) return { unsupported: `arity=${values.length}` }
  const [parent, size, at, color, options] = values
  const sizeTuple = readTuple(size)
  const atTuple = readTuple(at)
  if (!sizeTuple || sizeTuple.length !== 3) return { unsupported: 'size-not-tuple' }
  if (!atTuple || atTuple.length !== 3) return { unsupported: 'at-not-tuple' }
  const record = {
    parent: normalizeExpression(parent),
    size: sizeTuple,
    at: atTuple,
    color: normalizeExpression(color),
  }
  if (options !== undefined) record.options = normalizeExpression(options)
  return record
}

/**
 * 把注释替换成等长空白（保持偏移与行号不变），供解析使用。
 *
 * 必须做这一步：模块的 JSDoc 里写着示例调用（`box(父节点, [宽, 高, 深], …)`），不屏蔽注释
 * 就会把文档当代码记进快照，改一句注释也会误报成几何回归。字符串里的 `//`（URL）不能被误判，
 * 所以扫描时跟踪引号状态。
 */
function maskComments(source) {
  const chars = source.split('')
  let quote = null
  let index = 0
  const blank = (start, end) => {
    for (let cursor = start; cursor < end; cursor += 1) if (chars[cursor] !== '\n') chars[cursor] = ' '
  }
  while (index < source.length) {
    const char = source[index]
    if (quote) {
      if (char === '\\') index += 2
      else {
        if (char === quote) quote = null
        index += 1
      }
      continue
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char
      index += 1
      continue
    }
    if (char === '/' && source[index + 1] === '/') {
      const end = source.indexOf('\n', index)
      const stop = end < 0 ? source.length : end
      blank(index, stop)
      index = stop
      continue
    }
    if (char === '/' && source[index + 1] === '*') {
      const end = source.indexOf('*/', index + 2)
      const stop = end < 0 ? source.length : end + 2
      blank(index, stop)
      index = stop
      continue
    }
    index += 1
  }
  return chars.join('')
}

/**
 * 该出现位置是**函数声明**（`export function addBoxMesh(`）而不是调用。
 *
 * 只看 `function` 一种形态：`const m = addBoxMesh(...)` 是「用调用结果初始化变量」，
 * 必须照常参与快照与改写；用 `const`/`=` 判声明会把这种正常调用漏掉。
 */

/** 扫描一个文件里的全部原语调用（先屏蔽注释，偏移不变）。 */
export function collectFileCalls(rawSource) {
  const source = maskComments(rawSource)
  const records = []
  const unsupported = []
  const names = Object.keys(PRIMITIVES)
  let cursor = 0
  while (cursor < source.length) {
    const site = nextCallSite(source, cursor, names)
    if (!site) break
    const { name: bestName, index: bestIndex, args: split, openParen } = site
    if (!split) {
      cursor = openParen + 1
      continue
    }
    const rawArgs = split.map((part) => part.text.trim())
    const description = describeCall(rawArgs, PRIMITIVES[bestName].legacy)
    const line = source.slice(0, bestIndex).split('\n').length
    if (description.unsupported) unsupported.push({ line, name: bestName, reason: description.unsupported })
    else records.push({ kind: PRIMITIVES[bestName].kind, ...description })
    cursor = openParen + 1
  }
  return { records, unsupported }
}

function collectSnapshot({ fromHead = false } = {}) {
  const files = walkFiles(SCAN_ROOT, { extensions: new Set(['.ts']) })
  files.sort()
  const snapshot = {}
  const unsupported = []
  for (const file of files) {
    const relative = path.relative(REPO_ROOT, file).split(path.sep).join('/')
    // `--from-head`：基线取**改写前**的已提交内容，这样 `--check` 才是真正的「改前 vs 改后」；
    // 新增文件（如薄包装模块）在 HEAD 里不存在，回落到当前内容。
    const source = fromHead ? readAtHead(relative, file) : fs.readFileSync(file, 'utf8')
    const { records, unsupported: problems } = collectFileCalls(source)
    if (records.length > 0) snapshot[relative] = records
    for (const problem of problems) unsupported.push({ file: relative, ...problem })
  }
  return { snapshot, unsupported }
}

/** 读 HEAD 版本；文件在 HEAD 里不存在时用工作树内容。 */
function readAtHead(relative, fallbackFile) {
  try {
    return execFileSync('git', ['show', `HEAD:${relative}`], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    })
  } catch {
    return fs.readFileSync(fallbackFile, 'utf8')
  }
}

if (import.meta.filename === process.argv[1]) {
  const { snapshot, unsupported } = collectSnapshot({ fromHead: hasFlag('from-head') })
  const callCount = Object.values(snapshot).reduce((sum, records) => sum + records.length, 0)
  const fileCount = Object.keys(snapshot).length

  if (hasFlag('write')) {
    fs.writeFileSync(
      BASELINE_PATH,
      `${JSON.stringify({ description: '网格原语调用的参数黄金快照：改写前后必须逐字段一致', calls: callCount, files: snapshot }, null, 2)}\n`,
    )
    console.log(`已写入 ${path.relative(REPO_ROOT, BASELINE_PATH)}（${callCount} 个调用点 / ${fileCount} 个文件）`)
    process.exit(0)
  }

  if (hasFlag('check')) {
    const baseline = JSON.parse(fs.readFileSync(BASELINE_PATH, 'utf8')).files
    const differences = []
    const allFiles = new Set([...Object.keys(baseline), ...Object.keys(snapshot)])
    for (const file of allFiles) {
      const before = baseline[file] ?? []
      const after = snapshot[file] ?? []
      const length = Math.max(before.length, after.length)
      for (let index = 0; index < length; index += 1) {
        const left = JSON.stringify(before[index] ?? null)
        const right = JSON.stringify(after[index] ?? null)
        if (left !== right)
          differences.push({ file, index, before: before[index] ?? null, after: after[index] ?? null })
      }
    }
    if (unsupported.length > 0) {
      console.error(`有 ${unsupported.length} 个调用点无法解析为规范记录（不计入等价证明）：`)
      for (const problem of unsupported.slice(0, 10))
        console.error(`  ${problem.file}:${problem.line} ${problem.name} ${problem.reason}`)
    }
    if (differences.length > 0) {
      console.error(`几何黄金比对失败：${differences.length} 处调用参数不一致。`)
      for (const difference of differences.slice(0, 20)) {
        console.error(`  ${difference.file}#${difference.index}`)
        console.error(`    改前 ${JSON.stringify(difference.before)}`)
        console.error(`    改后 ${JSON.stringify(difference.after)}`)
      }
      process.exit(1)
    }
    console.log(`几何黄金比对通过：${callCount} 个调用点 / ${fileCount} 个文件，参数逐字段一致。`)
    process.exit(0)
  }

  console.log(JSON.stringify({ calls: callCount, files: fileCount, unsupported }, null, 2))
}
