#!/usr/bin/env node
/**
 * CSS 自定义属性解析器：把 `--x: var(--y)` 链一路解到字面值，并证明「改造前后解析结果一致」。
 *
 * 为什么需要它：设计令牌里存在大量间接引用（`--a: var(--b)`、`--b: var(--c)`，还有
 * `rgba(var(--c-rgb), .3)` 这种把三元组拼进颜色函数的写法）。靠肉眼看 diff 无法判断
 * 「删掉一层别名」是否等价 —— 必须按 CSS 的解析语义把值算出来比。
 *
 * 语义边界（刻意的简化，都写在 --strict 之外）：
 * - 只解析**同一元素上下文**里可见的声明：`:root` 用全局表；局部选择器单独建表。
 * - 不做层叠优先级计算（那是浏览器的事），只做「给定一张声明表，能否解到字面值」。
 * - `var()` 带 fallback 时，若目标未定义则用 fallback —— 与浏览器一致。
 *
 * 用法（批量入口 `bun run check:frontend` 走默认的 `--check`）：
 *   node ops/checks/check_css_tokens.mjs --check                    # 未定义引用即失败
 *   node ops/checks/check_css_tokens.mjs --dump root-tokens.json    # 导出 :root 解析结果
 *   node ops/checks/check_css_tokens.mjs --diff before.json         # 与快照比对，必须完全一致
 */

import fs from 'node:fs'
import path from 'node:path'

import { isMain } from '../../lib/cli.mjs'
import { createContext, report } from '../../lib/ratchet.mjs'

const CSS_ROOTS = ['packages/shared/src', 'homeos/frontend/src', 'homeos-store/frontend/src']
const SKIP = new Set(['node_modules', 'dist', 'build', '.git'])

/**
 * 运行期由 JS 注入的令牌：`element.style.setProperty('--x', …)` 或 Vue 的 `:style` 绑定。
 * 静态扫描看不到它们，但它们是**真实存在**的 —— 逐个写明注入点，避免这张表变成垃圾桶。
 */
const RUNTIME_INJECTED = new Map([
  ['--hero-accent', 'SettingsPageHeader.vue 的 :style 绑定（每个页头一个强调色）'],
  ['--i3d-control-scale', 'stage/layers-sync.ts（3D 控件按画布缩放）'],
  ['--i3d-control-top', 'stage/layers-sync.ts'],
  ['--i3d-media-canvas-height', 'stage/layers-sync.ts'],
  ['--i3d-media-canvas-width', 'stage/layers-sync.ts'],
  ['--i3d-media-scale-x', 'stage/layers-sync.ts'],
  ['--i3d-media-scale-y', 'stage/layers-sync.ts'],
  ['--i3d-panel-opacity', 'core/popup-preview.ts（面板预览透明度）'],
])

/** 收集所有 CSS 与 Vue SFC 的 `<style>` 块。 */
function collectSheets(ctx) {
  const sheets = []
  for (const root of CSS_ROOTS) {
    if (!fs.existsSync(path.join(ctx.repoRoot, root))) continue
    for (const file of ctx.walk(root, new Set(['.css', '.vue']), SKIP)) {
      const text = ctx.text(file)
      if (file.endsWith('.css')) {
        sheets.push({ file, css: text })
        continue
      }
      // SFC：把每个 <style> 块单独当一张表，选择器上下文与普通 CSS 相同。
      for (const match of text.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)) {
        sheets.push({ file, css: match[1] })
      }
    }
  }
  return sheets
}

/**
 * 按入口真实 import 顺序重排 sheet。
 *
 * 为什么必须这样做：`:root` 声明同优先级下**后加载的赢**，而 `walkFiles` 是字母序。
 * 桥（`packages/shared/...`）字母序在 `homeos/frontend/...` 之前，但运行时它最后加载 ——
 * 用字母序建表会得出与实际渲染相反的结论，前后对比就失去意义。
 */
function orderByEntrypoint(ctx, sheets) {
  const entry = path.join(ctx.repoRoot, 'homeos', 'frontend', 'src', 'main.ts')
  if (!fs.existsSync(entry)) return sheets
  const ordered = []
  const seen = new Set()
  for (const match of ctx.text(entry).matchAll(/^import\s+['"]([^'"]+\.css)['"]/gm)) {
    const resolved = path.resolve(path.dirname(entry), match[1])
    const hit = sheets.find((sheet) => sheet.file === resolved)
    if (hit && !seen.has(hit.file)) {
      ordered.push(hit)
      seen.add(hit.file)
    }
  }
  // 入口没直接 import 的（SFC `<style src>`、懒加载样式表）排在后面，保持原相对顺序。
  for (const sheet of sheets) if (!seen.has(sheet.file)) ordered.push(sheet)
  return ordered
}

/** 去掉注释，但保留字符串（`content: "/*"` 这类极少见，够用）。 */
function stripComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '')
}

/**
 * 把一张样式表切成 `{ selector, declarations: Map<prop, value> }`。
 * 只处理一层花括号（@media / @supports 内部的规则会被摊平 —— 令牌声明基本都在 :root 与类选择器上）。
 */
function parseRules(css) {
  const rules = []
  const text = stripComments(css)
  const pattern = /([^{}]+)\{([^{}]*)\}/g
  let match = pattern.exec(text)
  while (match !== null) {
    const selector = match[1].trim()
    const body = match[2]
    const declarations = new Map()
    for (const declaration of body.split(';')) {
      const colon = declaration.indexOf(':')
      if (colon < 0) continue
      const prop = declaration.slice(0, colon).trim()
      if (!prop.startsWith('--')) continue
      declarations.set(prop, declaration.slice(colon + 1).trim())
    }
    if (declarations.size) rules.push({ selector, declarations })
    match = pattern.exec(text)
  }
  return rules
}

/** `:root` 声明按出现顺序合并（后者覆盖前者，模拟同优先级下 later-wins）。 */
function rootTable(sheets) {
  const table = new Map()
  for (const sheet of sheets) {
    for (const rule of parseRules(sheet.css)) {
      if (!/(^|,)\s*(:root|html)\s*(,|$)/.test(rule.selector)) continue
      for (const [prop, value] of rule.declarations) table.set(prop, value)
    }
  }
  return table
}

/** 把值里的 `var(--x[, fallback])` 递归展开。返回 `{ value, missing }`。 */
function resolve(value, table, seen = new Set()) {
  let missing = []
  const out = value.replace(
    /var\(\s*(--[\w-]+)\s*(?:,\s*([^()]*(?:\([^()]*\)[^()]*)*))?\)/g,
    (whole, name, fallback) => {
      if (seen.has(name)) {
        missing.push(`循环引用 ${name}`)
        return whole
      }
      const declared = table.get(name)
      if (declared === undefined) {
        if (fallback !== undefined) return resolve(fallback, table, seen).value
        missing.push(name)
        return whole
      }
      const nested = resolve(declared, table, new Set([...seen, name]))
      missing = missing.concat(nested.missing)
      return nested.value
    },
  )
  return { value: out, missing }
}

/** 在任意选择器里出现过的令牌名（局部作用域也算「已定义」）。 */
function declaredAnywhere(sheets) {
  const names = new Set()
  for (const sheet of sheets) {
    for (const rule of parseRules(sheet.css)) {
      for (const prop of rule.declarations.keys()) names.add(prop)
    }
  }
  return names
}

/** 所有 sheet 里出现的 `var(--x)` 引用（用于查未定义）。 */
function referencedTokens(ctx, sheets) {
  const refs = new Map()
  for (const sheet of sheets) {
    for (const rule of parseRules(sheet.css)) {
      for (const [prop, value] of rule.declarations) {
        for (const match of value.matchAll(/var\(\s*(--[\w-]+)/g)) {
          if (!refs.has(match[1])) refs.set(match[1], [])
          refs.get(match[1]).push(`${ctx.rel(sheet.file)} (${prop})`)
        }
      }
    }
  }
  return refs
}

/** 导出一份「能完全解到字面值」的 :root 快照（只记可完全解析的项）。 */
function snapshot(table) {
  const result = {}
  for (const [prop, value] of table) {
    const resolved = resolve(value, table)
    if (resolved.missing.length === 0) result[prop] = resolved.value.replace(/\s+/g, ' ').trim()
  }
  return result
}

/**
 * @param {ReturnType<typeof createContext>} ctx
 */
export function loadSheets(ctx) {
  return orderByEntrypoint(ctx, collectSheets(ctx))
}

/**
 * 默认校验：所有被引用令牌必须有声明、且 :root 链不成环。
 *
 * @param {ReturnType<typeof createContext>} ctx
 */
export function audit(ctx) {
  const sheets = loadSheets(ctx)
  const table = rootTable(sheets)
  const refs = referencedTokens(ctx, sheets)
  const declared = declaredAnywhere(sheets)

  const problems = []
  for (const [name, users] of refs) {
    if (declared.has(name) || RUNTIME_INJECTED.has(name)) continue
    problems.push(`${name} ← ${users.slice(0, 3).join(', ')}${users.length > 3 ? ` 等 ${users.length} 处` : ''}`)
  }

  /*
   * 循环引用：`--a: var(--b)` 与 `--b: var(--a)` 各自都能「解析到声明」，普通未声明检测
   * 看不出来；但按 CSS 语义整条链是无效值，属性静默丢弃 —— 例如圆角归零、颜色变透明。
   *
   * 真实触发场景：`design-tokens.css` 定义数值、`theme-overrides.css` 把语义别名指过去，
   * 若有人在中间文件加了反向别名（`--hos-r-1: var(--hos-radius-control)`），两族就成环。
   * 这类改动看起来像「统一命名」，diff 里完全看不出渲染会坏，只能靠解析器判定。
   */
  const cycles = []
  for (const [name, value] of table) {
    const { missing } = resolve(value, table)
    for (const entry of missing) {
      if (entry.startsWith('循环引用')) cycles.push(`${name} → ${entry.replace('循环引用 ', '')}`)
    }
  }
  for (const line of [...new Set(cycles)].sort()) problems.push(`令牌成环（CSS 判为无效值）：${line}`)

  return {
    name: 'CSS 令牌',
    summary: `:root 声明 ${table.size} 个，任意作用域声明 ${declared.size} 个，被引用 ${refs.size} 个，全部有来源`,
    problems,
    json: {
      ok: problems.length === 0,
      rootTokens: table.size,
      declared: declared.size,
      referenced: refs.size,
      problems,
    },
  }
}

/** 单跑入口：`--check`（默认）/ `--dump <file>` / `--diff <file>`。 */
export function cli(argv = process.argv.slice(2)) {
  const ctx = createContext(path.resolve(import.meta.dirname, '../../..'))

  const dumpIndex = argv.indexOf('--dump')
  if (dumpIndex > -1) {
    const target = argv[dumpIndex + 1]
    if (!target) {
      console.error('--dump 需要一个输出路径')
      return 2
    }
    const result = snapshot(rootTable(loadSheets(ctx)))
    fs.writeFileSync(target, `${JSON.stringify(result, null, 1)}\n`)
    console.log(`已导出 :root 可解析令牌 ${Object.keys(result).length} 项 → ${target}`)
    return 0
  }

  const diffIndex = argv.indexOf('--diff')
  if (diffIndex > -1) {
    const target = argv[diffIndex + 1]
    if (!target) {
      console.error('--diff 需要一个快照路径')
      return 2
    }
    const baseline = JSON.parse(fs.readFileSync(target, 'utf8'))
    const current = snapshot(rootTable(loadSheets(ctx)))
    const problems = []
    for (const [prop, expected] of Object.entries(baseline)) {
      if (!(prop in current)) {
        problems.push(`消失：${prop}（原值 ${expected}）`)
        continue
      }
      if (current[prop] !== expected) problems.push(`改变：${prop}\n  期望 ${expected}\n  实际 ${current[prop]}`)
    }
    if (problems.length) {
      console.error(`令牌解析结果与快照不一致（${problems.length} 处）：`)
      for (const line of problems) console.error(`  ${line}`)
      console.error('\n任何一处差异都意味着这次重构改变了渲染结果。')
      return 1
    }
    console.log(`令牌解析结果与快照完全一致（${Object.keys(baseline).length} 项）`)
    return 0
  }

  return report(audit(ctx))
}

if (isMain(import.meta.url)) process.exit(cli())
