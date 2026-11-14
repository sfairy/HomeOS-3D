#!/usr/bin/env node
/**
 * 代码体量度量（cloc 的本地等价口径，只读）。
 *
 * 为什么需要它
 * ------------
 * 仓库里有「文件规模」「函数复杂度」「`any` 数量」「重复代码」四类棘轮，唯独没有一条在看
 * **总体代码量**。于是「把逻辑拆成四个转发函数」「把三个参数抄成三行」这类改动永远不会被
 * 看见，压缩成果也无从证明。本脚本给出可复跑的基线：同一份口径，改动前后各跑一次。
 *
 * 口径（与方案 §1.1 同源）
 * ------------------------
 * - `code`  —— 有效代码行：排除空行、纯注释行（`//` / `#` / 块注释 / `*` 续行）；
 * - `chars` —— 有效字符：上面的代码行去掉首尾空白、去掉行尾注释后、去掉全部内部空白；
 * - `comment` / `blank` —— 仅用于报告，不参与判定。
 *
 * 为什么同时看字符数：本仓库存在「一行几千字符」的机械展开（如 `bindDeps` 的解构行），
 * 只看行数会把这类样板当空气。字符数是副指标，不与行数相加。
 *
 * 不统计什么
 * ----------
 * `docs/`、`dist/`、`node_modules/`、`__pycache__/`、虚拟环境目录、生成物（`*.generated.*`）、
 * 类型声明（`*.d.ts`）、`*.json` / `*.md` / `*.lock`。理由见方案 §1.6：把代码搬进 JSON、
 * 生成物或文档不算压缩，删注释也不算。
 *
 * 用法
 * ----
 *     node ops/checks/code-size.mjs                    # 打印总表
 *     node ops/checks/code-size.mjs --json             # 机器可读
 *     node ops/checks/code-size.mjs --write            # 写 docs/analysis/code-size/<name>.json
 *     node ops/checks/code-size.mjs --check <baseline> # 与基线比较，行数/字符数变大即失败
 *     node ops/checks/code-size.mjs --roots a,b        # 只看给定根
 *
 * `--check` 是「棘轮」：只允许持平或下降。与 `check:duplicates` 同语义 —— 要让基线变大
 * 必须是显式 `--write` 的评审动作，而不是顺手跑一遍。
 */
import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'

const REPO_ROOT = path.resolve(import.meta.dirname, '../..')
const OUT_DIR = path.join(REPO_ROOT, 'docs/analysis/code-size')

/** 默认扫描根：两个产品 + 共享包 + 构建脚本。排除规则统一在下方，避免多处各写一份。 */
export const DEFAULT_ROOTS = [
  'homeos/frontend/src',
  'homeos/backend/src',
  'homeos-store/frontend/src',
  'homeos-store/backend/src',
  'packages/shared/src',
  'packages/shared-py',
  'ops',
]

const EXTENSIONS = new Set(['.ts', '.tsx', '.mts', '.vue', '.js', '.mjs', '.cjs', '.py', '.css', '.scss', '.html'])
const SKIP_DIRS = new Set(['node_modules', 'dist', 'build', 'out', 'target', 'vendor', '__pycache__'])
const SKIP_DIR_PREFIXES = ['.venv', '.ruff_cache', '.graphflow']
const SKIP_FILE_SUFFIXES = ['.d.ts', '.generated.ts', '.generated.mjs', '.pyi', '.min.js', '.min.css']

/**
 * 单行分类。返回 `'blank' | 'comment' | 'code'`。
 *
 * 块注释用 `inBlock` 跨行传递：块注释起止；HTML 注释同样处理。**只**把整行注释算注释，
 * 行尾注释（`const a = 1 // 说明`）仍算代码行，因为那一行确实有代码。
 */
export function classifyLine(rawLine, state) {
  const line = rawLine.trim()
  if (!line) return 'blank'
  if (state.inBlock) {
    if (line.includes('*/')) state.inBlock = false
    else if (line.includes('-->')) state.inBlock = false
    return 'comment'
  }
  if (line.startsWith('/*') || line.startsWith('<!--')) {
    const closes = line.startsWith('<!--') ? line.includes('-->') : line.includes('*/')
    if (!closes) state.inBlock = true
    return 'comment'
  }
  if (line.startsWith('//') || line.startsWith('#') || line.startsWith('*')) return 'comment'
  return 'code'
}

/** 有效字符：去行尾注释、去全部空白。CSS 的块注释用同一套正则先剔除。 */
export function countLineChars(line) {
  const withoutTrailingComment = line
    .replace(/\/\*[^*]*\*+([^/*][^*]*\*+)*\//g, ' ')
    .replace(/\/\/.*$/, '')
    .replace(/<!--[\s\S]*?-->$/, '')
  return withoutTrailingComment.replace(/\s+/g, '').length
}

/** 统计一个文件。返回 `{ code, comment, blank, chars }`。 */
export function measureFile(absolutePath) {
  const source = fs.readFileSync(absolutePath, 'utf8').replace(/\r\n/g, '\n')
  const state = { inBlock: false }
  let code = 0
  let comment = 0
  let blank = 0
  let chars = 0
  for (const rawLine of source.split('\n')) {
    const kind = classifyLine(rawLine, state)
    if (kind === 'blank') {
      blank += 1
      continue
    }
    if (kind === 'comment') {
      comment += 1
      continue
    }
    code += 1
    chars += countLineChars(rawLine)
  }
  return { code, comment, blank, chars }
}

function shouldSkipFile(name) {
  return SKIP_FILE_SUFFIXES.some((suffix) => name.endsWith(suffix))
}

function walk(directory, onFile) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    const absolute = path.join(directory, entry.name)
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue
      if (SKIP_DIR_PREFIXES.some((prefix) => entry.name.startsWith(prefix))) continue
      walk(absolute, onFile)
      continue
    }
    if (!entry.isFile()) continue
    if (shouldSkipFile(entry.name)) continue
    if (!EXTENSIONS.has(path.extname(entry.name))) continue
    onFile(absolute)
  }
}

/** 统计一组根目录。按「根 → 扩展名」二级汇总，同时给出总计。 */
export function measureRoots(roots) {
  const byRoot = {}
  const total = { code: 0, comment: 0, blank: 0, chars: 0, files: 0 }
  for (const root of roots) {
    const absoluteRoot = path.join(REPO_ROOT, root)
    if (!fs.existsSync(absoluteRoot)) continue
    const bucket = { code: 0, comment: 0, blank: 0, chars: 0, files: 0, byExt: {} }
    walk(absoluteRoot, (file) => {
      const measured = measureFile(file)
      const ext = path.extname(file)
      bucket.code += measured.code
      bucket.comment += measured.comment
      bucket.blank += measured.blank
      bucket.chars += measured.chars
      bucket.files += 1
      const extBucket = (bucket.byExt[ext] ??= { code: 0, chars: 0, files: 0 })
      extBucket.code += measured.code
      extBucket.chars += measured.chars
      extBucket.files += 1
    })
    byRoot[root] = bucket
    for (const key of ['code', 'comment', 'blank', 'chars', 'files']) total[key] += bucket[key]
  }
  return { generatedAt: new Date().toISOString(), roots, byRoot, total }
}

function parseArgs(argv) {
  const args = argv.slice(2)
  const value = (name) => {
    const index = args.indexOf(`--${name}`)
    return index >= 0 ? args[index + 1] : null
  }
  return {
    json: args.includes('--json'),
    write: args.includes('--write'),
    name: value('name') ?? 'snapshot',
    out: value('out'),
    check: value('check'),
    roots: value('roots')
      ? value('roots')
          .split(',')
          .map((root) => root.trim())
          .filter(Boolean)
      : DEFAULT_ROOTS,
  }
}

/** 对比两份快照：行数或字符数**变大**即失败（棘轮）。 */
export function compareSnapshots(baseline, current) {
  const failures = []
  const rows = []
  for (const [root, bucket] of Object.entries(current.byRoot)) {
    const before = baseline.byRoot[root]
    if (!before) {
      rows.push({ root, status: 'new', code: bucket.code, chars: bucket.chars })
      continue
    }
    const codeDelta = bucket.code - before.code
    const charsDelta = bucket.chars - before.chars
    const failed = codeDelta > 0 || charsDelta > 0
    if (failed) failures.push({ root, codeDelta, charsDelta })
    rows.push({
      root,
      status: failed ? 'grew' : codeDelta === 0 && charsDelta === 0 ? 'equal' : 'shrank',
      codeDelta,
      charsDelta,
    })
  }
  return { rows, failures }
}

if (import.meta.filename === process.argv[1]) {
  const options = parseArgs(process.argv)
  const snapshot = measureRoots(options.roots)

  if (options.check) {
    const baselinePath = path.resolve(REPO_ROOT, options.check)
    const baseline = JSON.parse(fs.readFileSync(baselinePath, 'utf8'))
    const { rows, failures } = compareSnapshots(baseline, snapshot)
    for (const row of rows) {
      const delta =
        row.status === 'new'
          ? ''
          : ` (${row.codeDelta >= 0 ? '+' : ''}${row.codeDelta} 行, ${row.charsDelta >= 0 ? '+' : ''}${row.charsDelta} 字符)`
      console.log(`${row.status.padEnd(7)} ${row.root}${delta}`)
    }
    console.log(`\n总计：${snapshot.total.code} 行 / ${snapshot.total.chars} 字符`)
    if (failures.length > 0) {
      console.error(`\n代码量棘轮失败：${failures.length} 个根目录变大。压缩只能下降；要放宽请显式 --write。`)
      process.exit(1)
    }
    process.exit(0)
  }

  if (options.write) {
    const outPath = options.out ? path.resolve(REPO_ROOT, options.out) : path.join(OUT_DIR, `${options.name}.json`)
    fs.mkdirSync(path.dirname(outPath), { recursive: true })
    fs.writeFileSync(outPath, `${JSON.stringify(snapshot, null, 2)}\n`)
    console.log(`已写入 ${path.relative(REPO_ROOT, outPath)}`)
  }

  if (options.json) {
    console.log(JSON.stringify(snapshot, null, 2))
  } else {
    for (const [root, bucket] of Object.entries(snapshot.byRoot)) {
      console.log(`${String(bucket.code).padStart(7)} 行 ${String(bucket.chars).padStart(10)} 字符  ${root}`)
    }
    console.log(
      `${String(snapshot.total.code).padStart(7)} 行 ${String(snapshot.total.chars).padStart(10)} 字符  合计（${snapshot.total.files} 文件）`,
    )
  }
}
