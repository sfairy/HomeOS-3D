#!/usr/bin/env node
/**
 * codemod：把「getter 只返回同名绑定」收成对象简写。
 *
 * 改写规则
 * --------
 *
 *     get appCtx() { return appCtx; },   →   appCtx,
 *     get foo() {                        →   foo,
 *       return foo
 *     },
 *
 * 为什么等价（可证明的充分条件）
 * ------------------------------
 * getter 与简写的差别只有一个：**读取时机**。getter 在每次属性访问时读取绑定，简写在对象字面量
 * 求值时读取一次。两者结果相同当且仅当该绑定在求值之后不再改变。因此只转换满足下列条件的项：
 *   - 绑定是 `const`（不可重新赋值），且对象本身在 const 之后从不被重新绑定；
 *   - 或者是 `import` 进来的绑定（ESM 导入不可赋值）。
 * `let` / `var` 绑定一律保留 getter —— 那正是这些 getter 存在的理由（晚绑定）。
 *
 * 唯一可观察差异：属性描述符从「访问器」变成「数据属性」。本项目没有任何地方对这类对象做
 * `Object.getOwnPropertyDescriptor` / `Object.defineProperty` 语义依赖（deps 容器只做属性读取）；
 * 若将来出现，`check:any` 之外的读取会立刻表现为 `undefined` 而不是静默错误。
 *
 * 用法
 * ----
 *     node ops/scripts/codemod-accessor-shorthand.mjs --dry-run
 *     node ops/scripts/codemod-accessor-shorthand.mjs --write
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { walkFiles } from '../lib/walk.mjs'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const SCAN_ROOT = path.join(REPO_ROOT, 'homeos/frontend/src')

const args = process.argv.slice(2)
const WRITE = args.includes('--write')
const DRY_RUN = args.includes('--dry-run') || !WRITE

/**
 * 文件里不可重新赋值的绑定：`const` 的**声明位置**与全部 import。
 *
 * 位置必须一起记：`get x() { return x }` 是延迟读取，`x,` 是立即读取。若 `const x` 写在对象
 * 字面量**之后**，简写会在初始化前读取，直接触发 TDZ（`ReferenceError`）。
 *
 * **但这道检查并不充分**，实测漏过一次（`entityPickerHintText`）：`const` 在文件第 3860 行、
 * deps 工厂里的属性在第 3896 行 —— 位置比较通过，可那个 deps 工厂是在**更早的引导期**被调用
 * 的（`bindScenePopupEditorBoot({ copyBackupPickers: copyBackupPickersDeps })` 传的是函数，
 * 真正 `getDeps()` 发生在模块求值完成之前）。词法位置排不出「谁先执行」，所以下面再加一条
 * 结构性排除：deps 工厂函数（`*Deps`）里的属性一律保持 getter，只转换普通对象字面量。
 */
function collectImmutableBindings(source) {
  const names = new Map()
  for (const match of source.matchAll(/^\s*const (\w+)\s*[:=]/gm)) {
    if (!names.has(match[1])) names.set(match[1], match.index)
  }
  for (const match of source.matchAll(/^import\s+\{([^}]*)\}/gm)) {
    for (const part of match[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
      if (name) names.set(name, -1)
    }
  }
  for (const match of source.matchAll(/^import\s+(\w+)\s+from/gm)) names.set(match[1], -1)
  return names
}

/**
 * `function xxxDeps(...)` 的函数体区间。
 *
 * 这些函数是「依赖袋工厂」：调用时机由宿主决定，可能早于文件里所有 `const` 的求值完成。
 * 词法位置无法证明安全，所以其中的 getter 一律不转换（保留晚绑定语义）。
 */
function collectDepsFactoryRanges(source) {
  const ranges = []
  const pattern = /^(\s*)(?:export\s+)?function\s+(\w*Deps)\s*\([^)]*\)[^{]*\{/gm
  let match
  while ((match = pattern.exec(source)) !== null) {
    const bodyStart = match.index + match[0].length
    let depth = 1
    let cursor = bodyStart
    while (cursor < source.length && depth > 0) {
      const char = source[cursor]
      if (char === '{') depth += 1
      else if (char === '}') depth -= 1
      cursor += 1
    }
    ranges.push([bodyStart, cursor])
  }
  return ranges
}

/** `let` / `var` 绑定：出现即表示这些名字可能需要晚绑定，转换时一律排除。 */
function collectMutableBindings(source) {
  const names = new Set()
  for (const match of source.matchAll(/^\s*(?:let|var) (\w+)/gm)) names.add(match[1])
  return names
}

let rewritten = 0
const perFile = []
const files = walkFiles(SCAN_ROOT, { extensions: new Set(['.ts']) }).sort()

const BLOCK_GETTER = /^(\s*)get (\w+)\(\) \{\s*\n\s*return ([\w$]+);?\s*\n\s*\},?\s*$/gm
const SINGLE_GETTER = /^(\s*)get (\w+)\(\) \{ return ([\w$]+);? \},?\s*$/gm

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8')
  const immutable = collectImmutableBindings(original)
  const mutable = collectMutableBindings(original)
  const depsRanges = collectDepsFactoryRanges(original)
  const insideDepsFactory = (offset) => depsRanges.some(([start, end]) => offset >= start && offset < end)
  let changedInFile = 0

  // 收集要改的位置后再统一替换。
  //
  // **不能**用 `.replace(A, fn).replace(B, fn)` 链：第二个 replace 的 `offset` 是相对第一个
  // 结果字符串的坐标，而 `immutable` 里记的 `declaredAt` 来自原文 —— 两个坐标系不同，
  // 「声明在字面量之后」的检查会随机失效（实测漏掉了 `entityPickerHintText`，把 getter
  // 收成简写后在 `copyBackupPickersDeps()` 里撞上 TDZ）。这里改成按原文偏移收集编辑。
  const edits = []
  const consider = (line, indent, name, returned, offset) => {
    if (returned !== name || mutable.has(name)) return
    // 依赖袋工厂里的属性可能被早于模块求值完成的代码读取，位置比较证明不了安全 → 保留 getter。
    if (insideDepsFactory(offset)) return
    const declaredAt = immutable.get(name)
    if (declaredAt === undefined || declaredAt > offset) return
    const keepComma = line.trimEnd().endsWith('},') || line.trimEnd().endsWith(',')
    edits.push({ start: offset, length: line.length, text: `${indent}${name}${keepComma ? ',' : ''}` })
    changedInFile += 1
  }
  for (const match of original.matchAll(BLOCK_GETTER)) {
    consider(match[0], match[1], match[2], match[3], match.index)
  }
  for (const match of original.matchAll(SINGLE_GETTER)) {
    // 同一个位置若已被块状规则命中就跳过（两种正则不会同时匹配，这里只是兜底）。
    if (edits.some((edit) => edit.start === match.index)) continue
    consider(match[0], match[1], match[2], match[3], match.index)
  }

  let next = original
  for (const edit of [...edits].sort((left, right) => right.start - left.start)) {
    next = `${next.slice(0, edit.start)}${edit.text}${next.slice(edit.start + edit.length)}`
  }

  if (changedInFile === 0) continue
  perFile.push({ file: path.relative(REPO_ROOT, file), count: changedInFile })
  rewritten += changedInFile
  if (WRITE) fs.writeFileSync(file, next)
}

console.log(`${DRY_RUN ? '[dry-run] ' : ''}改写 ${rewritten} 处 getter / ${perFile.length} 个文件`)
for (const row of perFile.sort((left, right) => right.count - left.count).slice(0, 12)) {
  console.log(`  ${String(row.count).padStart(4)} 处  ${row.file}`)
}
