/**
 * UI 审计共享工具：文件遍历、注释抹白、颜色字面量解析与色彩计算。
 * 依赖仅 node: 内置模块，供 ops/ui-audit/ 下各审计脚本复用。
 */
import fs from 'node:fs'
import path from 'node:path'

export const SKIP_DIRS = new Set([
  'node_modules',
  'dist',
  'build',
  '.git',
  '__pycache__',
  'coverage',
  '.venv-store',
  'backups',
  'data',
  'vendor',
])

export const CODE_EXTS = new Set(['.css', '.vue', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.html'])
export const STYLE_EXTS = new Set(['.css', '.vue'])
/** 「使用侧」语料：模板/脚本，不含 .css（否则类名会被自身定义命中）。 */
export const USAGE_EXTS = new Set(['.vue', '.ts', '.tsx', '.js', '.mjs', '.cjs', '.html'])

/** 递归收集目录下指定扩展名的文件（跳过 SKIP_DIRS），返回绝对路径数组。 */
export function walk(dir, exts = CODE_EXTS, out = []) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) walk(full, exts, out)
    else if (exts.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

/** 注释抹白（保留换行与字符数），使正则不受注释内颜色/变量干扰。 */
export function blankComments(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, ' '))
    .replace(/(^|[^:])\/\/[^\n]*/g, (m, p1) => p1 + ' '.repeat(m.length - p1.length))
}

/** posix 风格相对路径。 */
export function rel(root, file) {
  return path.relative(root, file).split(path.sep).join('/')
}

/** 第三方/压缩产物：`.min.css` 与 `vendor/` 目录（font.min.css、meshoptimizer 等），审计清理时跳过。 */
export function isVendored(relPath) {
  return /\.min\.css$/i.test(relPath) || /(^|\/)vendor\//.test(relPath)
}

// ── 颜色解析 ────────────────────────────────────────────────────────────────

const HEX_RE = /#([0-9a-fA-F]{3,8})\b/g

/** `#abc` / `#aabbcc` / `#aabbccdd` → { r, g, b, a }（a 为 0..1）。非法返回 null。 */
export function parseHex(hex) {
  let h = hex.replace(/^#/, '')
  if (h.length === 3 || h.length === 4) h = h.split('').map((c) => c + c).join('')
  if (h.length !== 6 && h.length !== 8) return null
  const r = Number.parseInt(h.slice(0, 2), 16)
  const g = Number.parseInt(h.slice(2, 4), 16)
  const b = Number.parseInt(h.slice(4, 6), 16)
  const a = h.length === 8 ? Number.parseInt(h.slice(6, 8), 16) / 255 : 1
  if ([r, g, b].some(Number.isNaN)) return null
  return { r, g, b, a }
}

/** 收集文本里的 hex 字面量（含出现次数）。返回 Map<normalized, { hex, count }>。 */
export function collectHex(text) {
  const found = new Map()
  for (const m of blankComments(text).matchAll(HEX_RE)) {
    const parsed = parseHex(m[1])
    if (!parsed) continue
    const key = normalizeHex(parsed)
    const entry = found.get(key) || { hex: m[0].toLowerCase(), count: 0, rgba: parsed }
    entry.count += 1
    found.set(key, entry)
  }
  return found
}

/** 归一化为 `#rrggbb`（丢弃 alpha 参与键，alpha 单独看）。 */
export function normalizeHex({ r, g, b }) {
  const to = (n) => n.toString(16).padStart(2, '0')
  return `#${to(r)}${to(g)}${to(b)}`
}

/** 收集 rgb()/rgba()/hsl()/hsla() 字面量。 */
export function collectFunctionalColors(text) {
  const found = new Map()
  const re = /\b(rgba?|hsla?)\(\s*([^)]*)\)/gi
  for (const m of blankComments(text).matchAll(re)) {
    const raw = m[0].replace(/\s+/g, ' ').trim()
    const entry = found.get(raw) || { raw, count: 0, fn: m[1].toLowerCase() }
    entry.count += 1
    found.set(raw, entry)
  }
  return found
}

// ── 色彩计算（WCAG 2.1） ────────────────────────────────────────────────────

function channel(n) {
  const s = n / 255
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
}

/** 相对亮度。 */
export function luminance({ r, g, b }) {
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

/** 把颜色按 alpha 合成到不透明底色上。 */
export function composite(fg, bg) {
  const a = fg.a ?? 1
  return {
    r: Math.round(fg.r * a + bg.r * (1 - a)),
    g: Math.round(fg.g * a + bg.g * (1 - a)),
    b: Math.round(fg.b * a + bg.b * (1 - a)),
    a: 1,
  }
}

/** WCAG 对比度（1..21）。忽略 alpha（调用方先 composite）。 */
export function contrast(fg, bg) {
  const l1 = luminance(fg)
  const l2 = luminance(bg)
  const hi = Math.max(l1, l2)
  const lo = Math.min(l1, l2)
  return (hi + 0.05) / (lo + 0.05)
}

/** 从任意 CSS 颜色字符串解析出 { r,g,b,a }；支持 hex 与 rgb/rgba（不支持 hsl 深解析时返回 null）。 */
export function parseCssColor(value) {
  const v = String(value).trim()
  if (v.startsWith('#')) return parseHex(v)
  const m = v.match(/^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:[\s,/]+([\d.]+%?))?\s*\)$/i)
  if (m) {
    let a = 1
    if (m[4] !== undefined) a = m[4].endsWith('%') ? Number.parseFloat(m[4]) / 100 : Number.parseFloat(m[4])
    return { r: +m[1], g: +m[2], b: +m[3], a }
  }
  return null
}

// ── CSS 变量 ────────────────────────────────────────────────────────────────

/** 抽取 `--name: value;` 定义。返回 [{ name, value, line, selector }]。 */
export function collectCustomPropDefs(text) {
  const cleaned = blankComments(text)
  const defs = []
  // 记录每个字符所在的行与最近的块选择器
  const re = /(--[a-zA-Z0-9-]+)\s*:\s*([^;{}]+);/g
  for (const m of cleaned.matchAll(re)) {
    const before = cleaned.slice(0, m.index)
    const line = before.split('\n').length
    // 往上找最近的 `{` 之前的选择器
    let depth = 0
    let selector = ''
    for (let i = m.index; i >= 0; i--) {
      const c = cleaned[i]
      if (c === '}') depth++
      else if (c === '{') {
        if (depth === 0) {
          const start = cleaned.lastIndexOf('}', i)
          selector = cleaned.slice(start + 1, i).trim().replace(/\s+/g, ' ')
          break
        }
        depth--
      }
    }
    defs.push({ name: m[1], value: m[2].trim(), line, selector })
  }
  return defs
}

/** 抽取 `var(--name)` 引用。返回 [{ name, line }]。 */
export function collectCustomPropRefs(text) {
  const cleaned = blankComments(text)
  const refs = []
  const re = /var\(\s*(--[a-zA-Z0-9-]+)\s*(?:,[^)]*)?\)/g
  for (const m of cleaned.matchAll(re)) {
    const line = cleaned.slice(0, m.index).split('\n').length
    refs.push({ name: m[1], line })
  }
  return refs
}

/** 去掉 <style>…</style> 区块（Vue SFC / HTML 内联样式），避免类名自我命中。 */
export function stripStyleBlocks(text) {
  return text.replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
}

/**
 * 只取可作为 CSS 解析的文本：`.css` 全文；`.vue`/`.html` 只取 `<style>` 区块内容。
 * 直接把 .vue 当 CSS 解析会把 `<script>` 里的 JS 误判成选择器（`if (a.value) {` → `.value`）。
 */
export function extractStyleText(file, text) {
  if (path.extname(file) === '.css') return text
  // 非样式区等长抹成空格（保留换行），使扫到的行号/偏移与源文件一一对应
  const blank = (s) => s.replace(/[^\n]/g, ' ')
  let out = ''
  let cursor = 0
  for (const m of text.matchAll(/<style\b[^>]*>([\s\S]*?)<\/style>/gi)) {
    const contentStart = m.index + m[0].indexOf('>') + 1
    out += blank(text.slice(cursor, contentStart)) + m[1]
    cursor = contentStart + m[1].length
  }
  return cursor === 0 ? '' : out + blank(text.slice(cursor))
}

/** 抽取文本里的整词集合（用于 O(1) 使用判定）。 */
export function tokenize(text) {
  const set = new Set()
  for (const m of text.matchAll(/[A-Za-z_][A-Za-z0-9_-]*/g)) set.add(m[0])
  return set
}

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  return file
}
