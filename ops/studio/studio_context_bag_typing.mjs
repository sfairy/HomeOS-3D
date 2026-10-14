#!/usr/bin/env node
/**
 * `studio_context_bag_typing.mjs` —— 把 studio 切片遗留的**开放上下文袋**换成显式字段接口。
 *
 * 背景：`home.ts` 的切片产物用
 * ```ts
 * export interface TimeInspectorContext { [key: string]: any }
 * ```
 * 当依赖袋。开放索引签名等于「这个袋子里有什么键谁知道都行」，于是：
 * 1. 宿主把键名拼错（`dateLableElement`）或漏传一个键，`tsc` **一声不响**，运行时才 `undefined`；
 * 2. 袋子里的键没有任何清单，删除/改名时没人知道要同步哪边；
 * 3. 每个类型化步骤都会被它吃掉 —— 加显式字段是第一步。
 *
 * 本工具按**文件内真实使用**（`ctx.<key>`）生成字段清单：只声明用到的键，一个不多一个不少。
 *
 * 字段类型**暂时全部是 `any`**，这是刻意的：
 * - 宿主 `findElement()` 目前返回宽类型（`document.querySelector(...)` 的 `Element | null`），
 *   而切片按控件语义读写（`.value` / `.checked` / `.options`）；
 * - 按控件三种形态手工挑类型会牵出上百处 `.options` / `.checked` 的联合访问错误，
 *   等于把「宿主该收窄的地方」变成「切片里到处是 cast」。
 * 所以这一步只拿走**开放索引签名**（键名拼写与漏传立刻可拦），元素具体类型留给下一步
 * （给 `home.ts` 的 `findElement` 建「选择器 → 元素类型」映射）。工具会在生成的接口上写明这一点。
 *
 * 用法：
 * ```bash
 * node ops/studio/studio_context_bag_typing.mjs homeos/frontend/src/studio/app/editor/*.ts [--dry-run]
 * ```
 * 退出码：0 = 全部改写完成（或 dry-run 通过）；1 = 有文件改不了（**不写盘**）。
 */
import fs from 'node:fs'

const args = process.argv.slice(2)
const dryRun = args.includes('--dry-run')
const files = args.filter((a) => !a.startsWith('--'))

if (files.length === 0) {
  console.error('✗ 用法：node ops/studio/studio_context_bag_typing.mjs <file...> [--dry-run]')
  process.exit(1)
}

const BAG_RE = /^export interface (\w+) \{ \[key: string\]: any \}$/m

/**
 * 取依赖袋的**全部**键。只扫 `ctx.<key>` 是不够的 —— 两种真实写法会漏：
 *
 * 1. 别名访问：`home-custom-popup-editor.ts` 把袋子存进模块级变量
 *    （`let customPopupEditorCtx: CustomPopupEditorContext`）后用 `customPopupEditorCtx.currentPage()`，
 *    漏掉 `currentPage` → 宿主 `home.ts` 传了就报「对象字面量只能指定已知属性」。
 *    这正是「显式字段」该拦的错，但**清单得先取全**，否则工具自己制造假警报。
 * 2. 解构：`const { a, b } = ctx;` —— 键名不出现在 `ctx.` 形式里。
 */
function collectKeys(src, ifaceName) {
  const keys = new Set([...src.matchAll(KEY_RE)].map((m) => m[1]))

  // 被显式标注为该接口的标识符（含 `ctx` 这个形参名本身）
  const aliases = new Set(['ctx'])
  for (const m of src.matchAll(new RegExp(`([A-Za-z_$][\\w$]*)\\s*:\\s*${ifaceName}\\b`, 'g'))) {
    aliases.add(m[1])
  }
  for (const alias of aliases) {
    for (const m of src.matchAll(new RegExp(`\\b${alias}\\.([A-Za-z_$][\\w$]*)`, 'g'))) keys.add(m[1])
  }
  // 解构：`… } = ctx;` / `… } = customPopupEditorCtx;`
  const destructure = new RegExp(`\\{([^{}]*)\\}\\s*=\\s*(${[...aliases].join('|')})\\s*[;,)\\n]`, 'g')
  for (const m of src.matchAll(destructure)) {
    for (const part of m[1].split(',')) {
      const name = part.split(':')[0].split('=')[0].replace(/\.\.\./, '').trim()
      if (/^[A-Za-z_$][\w$]*$/.test(name)) keys.add(name)
    }
  }
  return [...keys].sort()
}
const KEY_RE = /\bctx\.([A-Za-z_$][\w$]*)/g

const report = []
const problems = []
const planned = []

for (const file of files) {
  const src = fs.readFileSync(file, 'utf8')
  const bag = BAG_RE.exec(src)
  if (!bag) {
    report.push({ file, status: 'skip（没有 `{ [key: string]: any }` 形式的接口）' })
    continue
  }
  const [, ifaceName] = bag
  const keys = collectKeys(src, ifaceName)
  if (keys.length === 0)
    problems.push(`${file}：${ifaceName} 是开放袋，但文件里没有任何 ctx.<key> 使用，无法推断字段`)

  // `ctx` 必须恰好是「按名取键」的唯一入口：若还有 `ctx[x]` 这类动态取值，静态清单就不可靠。
  for (const m of src.matchAll(/\bctx\s*\[/g)) {
    problems.push(`${file}：存在动态取键 \`ctx[...]\`（偏移 ${m.index}）→ 静态字段清单无法覆盖，先改成具名访问`)
  }
  if (problems.length > 0) continue

  const fieldLines = keys.map((k) => `  ${k}: any;`)
  const replacement = [
    `export interface ${ifaceName} {`,
    `  /** 字段清单 = 本文件里出现过的袋子取值（\`ctx.<key>\` / 别名访问 / 解构），由`,
    `   *  \`ops/studio/studio_context_bag_typing.mjs\` 从**真实使用**生成，一个不多一个不少。`,
    `   *`,
    `   * 类型暂为 \`any\`：宿主 \`home.ts\` 的 \`findElement()\` 仍返回宽类型，控件语义（\`.value\` /`,
    `   * \`.checked\` / \`.options\`）由注入点保证。**但开放索引签名已去掉** —— 键名拼错、宿主漏传`,
    `   * 一个键现在会被 \`tsc\` 拦下。下一步是给 \`findElement\` 建「选择器 → 元素类型」映射，`,
    `   * 再把这批字段换成具体类型。 */`,
    ...fieldLines,
    `}`,
  ].join('\n')

  planned.push({ file, ifaceName, keys, next: src.replace(bag[0], replacement) })
  report.push({ file, status: 'rewrite', iface: ifaceName, fields: keys.length })
}

if (problems.length > 0) {
  console.error(`✗ 有 ${problems.length} 项无法安全推断，未写盘：`)
  for (const p of problems) console.error(`   - ${p}`)
  process.exit(1)
}

if (!dryRun) for (const p of planned) fs.writeFileSync(p.file, p.next, 'utf8')

console.log(JSON.stringify({ dryRun, report }, null, 2))
console.log(
  dryRun
    ? '\n   ◇ dry-run：未写盘。'
    : `\n   ✓ 已改写 ${planned.length} 个文件。必跑：bun run --cwd homeos/frontend typecheck`,
)
