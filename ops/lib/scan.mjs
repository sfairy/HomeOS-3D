/**
 * 依赖扫描共享工具：文件遍历、注释抹白、import spec 提取与颜色解析。
 * 依赖仅 node: 内置模块，供 ops/lib/ 与 ops/tokens/ 下各脚本、以及各项目的**依赖门禁**复用
 * （`homeos/frontend/scripts/gates/check-{frontend,studio}-deps.mjs`、
 * `homeos-store/scripts/check-store-deps.mjs`、`check-import-refs.mjs`）。
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

/**
 * 依赖门禁扫的源码类型。
 *
 * 收 `.tsx` / `.cjs` 是**统一口径的收益**：此前三个依赖方向门禁各写一份扩展名，
 * 全部漏了 `.tsx`（.cjs 只有 store 漏），也就是「组件里的越界依赖永远看不见」。
 */
export const SOURCE_EXTS = new Set(['.ts', '.tsx', '.vue', '.js', '.mjs', '.cjs'])

/**
 * 遍历缓存：key = `dir\0exts\0skipDirs`，生命周期 = 进程。
 *
 * 只服务于**同一进程**里的重复遍历 —— 门禁链是多个 node 进程，进程之间共享不到它，
 * 跨进程「共享一次遍历」需要的是单进程 runner（见 `ops/lib/run-chain.mjs` 顶部注释：
 * 实测遍历本身只有 9ms/1234 文件，链路大头是自检里的子进程，不是重复 walk）。
 * 会改树的长驻进程（测试/工具）不要用它 —— 或者改完就换新进程。
 */
const walkCache = new Map()

/**
 * 递归收集目录下指定扩展名的文件（跳过 skipDirs），返回绝对路径数组。
 *
 * 同一进程内对**同一个 (dir, exts, skipDirs)** 的重复遍历走缓存（见下方 `walkCache`）：
 * 门禁链里多个脚本各自 walk 同一棵树时，这是「共享一次遍历」的落点。返回的一律是**副本**，
 * 调用方怎么改（`splice` / `push`）都污染不到缓存。
 *
 * 实测口径（`homeos/frontend/src` 1234 个文件）：单次 walk ≈ 9ms、全量读取 ≈ 23ms。
 * 也就是说遍历本身很便宜，重复 walk 省下的是几十毫秒量级 —— 别指望它去解决链路大头。
 */
export function walk(dir, exts = CODE_EXTS, out = [], skipDirs = SKIP_DIRS) {
  // 调用方自带累加数组（`const files = []; walk(a, E, files); walk(b, E, files)`）：
  // 语义是「往里追加」，不缓存、也不动缓存。
  if (out.length > 0) return collect(dir, exts, out, skipDirs)
  if (!fs.existsSync(dir)) return out
  const key = `${dir}\u0000${[...exts].sort().join(',')}\u0000${[...skipDirs].sort().join(',')}`
  let cached = walkCache.get(key)
  if (!cached) {
    cached = collect(dir, exts, [], skipDirs)
    walkCache.set(key, cached)
  }
  out.push(...cached)
  return out
}

function collect(dir, exts, out, skipDirs) {
  if (!fs.existsSync(dir)) return out
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) collect(full, exts, out, skipDirs)
    else if (exts.has(path.extname(entry.name))) out.push(full)
  }
  return out
}

/**
 * 收集「依赖门禁要看的源码」：`SOURCE_EXTS` 减去 `.d.ts`（声明产物不是依赖边）。
 *
 * @param {string} dir
 * @param {string[]} [extraSkipDirs] 额外跳过的目录名（如 `studio` 是与主应用并存的旧运行时）
 */
export function walkSource(dir, extraSkipDirs = []) {
  const skipDirs = extraSkipDirs.length
    ? new Set([...SKIP_DIRS, ...extraSkipDirs])
    : SKIP_DIRS
  return walk(dir, SOURCE_EXTS, [], skipDirs).filter((file) => !file.endsWith('.d.ts'))
}

// ── 依赖门禁共用的小工具 ────────────────────────────────────────────────────

/**
 * import / export spec 提取正则：`from '…'`、动态 `import('…')`、副作用 `import '…'`。
 * 三个依赖方向门禁此前各写一份，store 那份漏了副作用 import（`import '@/views/x'` 这种
 * 纯副作用写法建的依赖边一样会绑死分层，却看不见）。
 *
 * 注意：它是**带 lastIndex 的全局正则**，用 `collectImportSpecs` 取用（每次重置），
 * 不要在嵌套遍历里直接 `exec`。
 */
export const IMPORT_RE = /(?:\bfrom\s+|\bimport\s*\(|\bimport\s+)['"]([^'"]+)['"]/g

/** 按 `IMPORT_RE` 取出全部 spec。返回 `{ spec, index }[]`（index 为原文下标）。 */
export function collectImportSpecs(text) {
  const specs = []
  IMPORT_RE.lastIndex = 0
  let match
  while ((match = IMPORT_RE.exec(text))) specs.push({ spec: match[1], index: match.index })
  return specs
}

/** `rel` 是否等于 `prefix` 或落在 `prefix/` 之下（路径都按 posix 形态比较）。 */
export function under(relPath, prefix) {
  return relPath === prefix || relPath.startsWith(`${prefix}/`)
}

/**
 * 是否「纯 re-export 桩」：去掉注释后只剩注释行与 `export * from '…'`。
 * 迁移期的兼容 barrel 靠它豁免依赖方向规则（但**不能**当通用豁免，见 check-frontend-deps 的说明）。
 */
export function isPureReexport(text) {
  const body = text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/.*$/gm, '')
    .trim()
  if (!body) return false
  return body.split(/\n+/).every((line) => {
    const t = line.trim()
    return !t || /^export\s+\*\s+from\s+['"].+['"]\s*;?$/.test(t)
  })
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

export function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function writeJson(file, data) {
  ensureDir(path.dirname(file))
  fs.writeFileSync(file, `${JSON.stringify(data, null, 2)}\n`)
  return file
}
