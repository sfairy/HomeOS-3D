#!/usr/bin/env node
/**
 * 死 CSS 门禁（`wr-*` 命名空间专项）：任何「整块 wr- 死规则」都不许再出现。
 *
 * ## 为什么需要它
 *
 * `wr-*` 是更早的 widget-renderer 外壳遗留的类名前缀：全仓（`.vue/.ts/.js`、`public/`、
 * 后端模板）零引用 —— 即在真实运行期**没有任何元素会带上 wr- 类**。因此一个规则块只要
 * 它的**每条逗号分支**都硬依赖 `.wr-*`，就永远匹配不到、是纯死代码。
 *
 * 本轮已按此口径清掉 800 余行死 CSS（见 `src/README.md`）。清理是「逐块判定 + 纯删除」，
 * 不是「见 wr- 就删」：`:not(.wr-x)` 恒真、混合列表里另有活分支的选择器都**保留**。
 * 这条门禁固化的正是同一条口径 —— 只拦「整块死」，不碰活选择器，故零误报。
 *
 * ## 判定
 *
 * * 分号/逗号切出的**每条分支**里，`.wr-*` 只要出现在 `:is()/:not()/:has()/:where()` **之外**
 *   （即真正参与该分支的匹配条件）→ 该分支恒不匹配；
 * * 一整块的分支**全部**恒不匹配 → 该规则块可判死 → 报错；
 * * `@keyframes wr-*` 同理可判死 → 报错。
 *
 * ## 边界 / 防瞎
 *
 * * `wr-` 命名空间若被**重新启用**（代码里又出现 `wr-` 字样），本启发式不再成立 —— 直接放行
 *   并打印提示（避免把真实用到的规则误判为死）；此时应改用「类名→使用点」扫描，而非本门禁。
 * * 扫不到任何 `.css` 或任何规则块 → 判门禁自身失效（退出码 2），免得解析漂移伪装成全绿。
 *
 * ## 用法
 *
 *     node scripts/check-css-classes.mjs            # 检查本应用 src/ 下全部 .css
 *     node scripts/check-css-classes.mjs --root <d> # 检查任意根（自检用）
 *     node scripts/check-css-classes.mjs --quiet    # 仅在失败时输出
 *
 * 负向自检见 `scripts/_css_classes_selftest.mjs`。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const argv = process.argv.slice(2)
const flagValue = (name, fallback) => {
  const i = argv.indexOf(name)
  return i === -1 || i + 1 >= argv.length ? fallback : argv[i + 1]
}
const QUIET = argv.includes('--quiet')
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(flagValue('--root', path.resolve(HERE, '..')))
const SRC = path.join(ROOT, 'src')

const SKIP_DIRS = new Set(['node_modules', 'dist', '__pycache__', 'coverage', '.git'])
const WR = /\.wr-[A-Za-z0-9_-]+/

/** 注释抹白（保留换行），使解析不受注释里的括号/花括号干扰。 */
function blankComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
}

/** 返回每个块 `{ selectorStart, braceIndex, closeIndex, selector }`（含嵌套块）。 */
function findBlocks(text) {
  const blocks = []
  const stack = []
  let buf = 0
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    if (c === '{') {
      stack.push([buf, i, text.slice(buf, i)])
      buf = i + 1
    } else if (c === '}') {
      if (stack.length) {
        const [s, b, sel] = stack.pop()
        blocks.push({ s, b, e: i, sel })
        buf = i + 1
      }
    } else if (c === ';' && !stack.length) {
      buf = i + 1
    }
  }
  return blocks
}

/** 去掉 `(...)` / `[...]` 里的内容（`:is()/:not()/:has()` 与属性选择器）后剩下的才是硬条件。 */
function stripGroups(sel) {
  let s = sel
  for (let i = 0; i < 8; i++) {
    const next = s.replace(/\([^()]*\)/g, '').replace(/\[[^\]]*\]/g, '')
    if (next === s) break
    s = next
  }
  return s
}

/** 按顶层逗号切分选择器列表。 */
function splitTop(sel) {
  const out = []
  let depth = 0
  let buf = ''
  for (const ch of sel) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth--
    if (ch === ',' && depth === 0) {
      out.push(buf)
      buf = ''
    } else {
      buf += ch
    }
  }
  out.push(buf)
  return out.filter((b) => b.trim())
}

const branchDead = (b) => WR.test(stripGroups(b))

function ruleDead(sel) {
  const s = sel.trim()
  if (s.startsWith('@')) return /^@keyframes\s+wr-[A-Za-z0-9_-]+\s*$/.test(s)
  const branches = splitTop(s)
  return branches.length > 0 && branches.every(branchDead)
}

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, out)
    else if (entry.name.endsWith('.css')) out.push(full)
  }
  return out
}

/** 代码侧是否重新启用了 `wr-` 命名空间（复活则本启发式失效，放行）。 */
function namespaceRevived() {
  const exts = /\.(ts|tsx|vue|js|mjs|cjs|html)$/
  let revived = false
  const scan = (dir) => {
    if (revived || !fs.existsSync(dir)) return
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (revived) return
      if (SKIP_DIRS.has(entry.name)) continue
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) scan(full)
      else if (exts.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        if (fs.readFileSync(full, 'utf8').includes('wr-')) revived = true
      }
    }
  }
  scan(SRC)
  return revived
}

const cssFiles = walk(SRC)
if (cssFiles.length === 0) {
  console.error(`死 CSS 门禁自身异常：${SRC} 下一个 .css 都没扫到（root=${ROOT}）`)
  process.exit(2)
}

let blockCount = 0
const violations = []
for (const file of cssFiles) {
  const text = fs.readFileSync(file, 'utf8')
  const blocks = findBlocks(blankComments(text))
  blockCount += blocks.length
  for (const blk of blocks) {
    if (ruleDead(blk.sel)) {
      const rel = path.relative(ROOT, file).split(path.sep).join('/')
      violations.push({ file: rel, sel: blk.sel.trim().replace(/\s+/g, ' ').slice(0, 120) })
    }
  }
}

if (blockCount === 0) {
  console.error(`死 CSS 门禁自身异常：扫了 ${cssFiles.length} 个 .css 但一个规则块都没解析到`)
  process.exit(2)
}

if (violations.length) {
  if (namespaceRevived()) {
    if (!QUIET) {
      console.log(
        `死 CSS 门禁跳过：代码里重新出现 \`wr-\` 命名空间（共 ${violations.length} 块本会被判死）—— 启发式失效，请改用人扫`,
      )
    }
    process.exit(0)
  }
  console.error(`整块 wr- 死规则：${violations.length} 处（该规则块永远不会匹配，应删除）\n`)
  for (const v of violations.slice(0, 60)) console.error(`  ${v.file}\n    ${v.sel}`)
  if (violations.length > 60) console.error(`  … and ${violations.length - 60} more`)
  process.exit(1)
}

if (!QUIET) {
  console.log(`死 CSS 门禁通过（扫描 ${cssFiles.length} 个 .css / ${blockCount} 个规则块，无整块 wr- 死规则）`)
}
