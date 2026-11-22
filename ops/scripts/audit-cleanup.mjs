#!/usr/bin/env node
/**
 * 清理审计：把「谁还引用它」变成可复跑的报告，而不是靠人肉 rg 猜。
 *
 * 产出（默认写进已被 gitignore 的 `ops/cleanup-reports/`）：
 * - `unreferenced-frontend.md`：从各前端入口出发的可达文件集合 + 不可达文件清单；
 * - `unreferenced-backend.md`：从各后端入口出发的可达模块集合 + 不可达模块清单；
 * - `env-inventory.md`：`.env.example` / 代码读取点 / compose 与构建脚本的三方对账；
 * - `client-routes.md`：前端 `services/api/*` 里调用的路径与后端路由基线对账。
 *
 * 这个脚本**只读不写业务文件**，是删除批次的前置证据。误报口径写在每节标题下，
 * 因为「可达性分析」在动态 import / glob / 副作用注册面前天然会保守：
 * 拿不准的一律不算死代码，宁可漏报也不误删。
 *
 * 用法：
 *   node ops/scripts/audit-cleanup.mjs              # 全部四份报告
 *   node ops/scripts/audit-cleanup.mjs --frontend   # 只跑前端可达性
 *   node ops/scripts/audit-cleanup.mjs --stdout     # 同时打印到终端
 */

import fs from 'node:fs'
import path from 'node:path'

import { readConsumedEnvKeys, readDocumentedEnvKeys } from '../lib/env-inventory.mjs'
import { REPO_ROOT } from '../lib/repo.mjs'
import { walkFiles } from '../lib/walk.mjs'

const OUT_DIR = path.join(REPO_ROOT, 'ops', 'cleanup-reports')
const argv = new Set(process.argv.slice(2))
const TO_STDOUT = argv.has('--stdout')

/* ─────────────────────────────── 前端可达性 ─────────────────────────────── */

const FRONTENDS = [
  {
    name: 'homeos',
    root: path.join(REPO_ROOT, 'homeos', 'frontend', 'src'),
    entries: [path.join(REPO_ROOT, 'homeos', 'frontend', 'src', 'main.ts')],
    aliases: [
      ['@/', ''],
      ['@app/', 'studio/app/'],
      ['@runtime/', 'studio/runtime/'],
    ],
  },
  {
    name: 'homeos-store',
    root: path.join(REPO_ROOT, 'homeos-store', 'frontend', 'src'),
    entries: [path.join(REPO_ROOT, 'homeos-store', 'frontend', 'src', 'main.ts')],
    aliases: [['@store/', '']],
  },
]

const SOURCE_EXTS = ['.ts', '.tsx', '.mts', '.vue', '.js', '.mjs', '.css']
const RESOLVE_EXTS = ['.ts', '.tsx', '.mts', '.vue', '.js', '.mjs', '.css', '.json', '.py']

/** 去掉注释，避免把注释里的 import 示例当成真实依赖。简单但足够：不处理字符串里的 `//`。 */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
}

/** 提取一个前端文件里出现的模块说明符。 */
function importSpecifiers(text) {
  const source = stripComments(text)
  const specs = []
  const patterns = [
    /\bfrom\s+['"]([^'"]+)['"]/g,
    /\bimport\s+['"]([^'"]+)['"]/g,
    /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /\brequire\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    /@import\s+(?:url\()?['"]([^'"]+)['"]/g,
    // SFC 的 `<style src="./x.css">` 是真实依赖；漏掉它会把整批 CSS 误判成死文件。
    /<style[^>]*\bsrc=['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    let match
    while ((match = pattern.exec(source)) !== null) specs.push(match[1])
  }
  return specs
}

/** `import.meta.glob('...')` 里的模式：这些是「批量引用」，要展开成真实文件集合。 */
function globPatterns(text) {
  const source = stripComments(text)
  const result = []
  const pattern = /import\.meta\.glob(?:<\s*[^>]*>)?\s*\(\s*(\[[^\]]*\]|['"][^'"]+['"])/g
  let match
  while ((match = pattern.exec(source)) !== null) {
    const raw = match[1]
    for (const literal of raw.matchAll(/['"]([^'"]+)['"]/g)) result.push(literal[1])
  }
  return result
}

function globToRegExp(glob) {
  let out = '^'
  for (const ch of glob) {
    if (ch === '*') out += '.*'
    else if (ch === '?') out += '.'
    else out += ch.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`${out}$`)
}

function resolveFromRoot(root, aliasTable, spec) {
  for (const [prefix, replacement] of aliasTable) {
    if (!spec.startsWith(prefix)) continue
    const rest = spec.slice(prefix.length)
    const base = path.resolve(root, replacement, rest)
    return resolveFile(base)
  }
  return null
}

function resolveFile(base) {
  if (fs.existsSync(base) && fs.statSync(base).isFile()) return base
  const candidates = []
  for (const ext of RESOLVE_EXTS) candidates.push(base + ext)
  for (const ext of RESOLVE_EXTS) candidates.push(path.join(base, `index${ext}`))
  for (const candidate of candidates) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  return null
}

/**
 * 可达性遍历的骨架：两个语言的差异只在「一个文件产出哪些依赖」。
 * 抽出来是为了让「取 text / 跳过不可读文件」这一段只有一份实现 —— 否则两份副本
 * 迟早会在异常处理上分叉（一个吞 OSError、一个不吞）。
 */
function walkGraph(roots, dependenciesOf) {
  const reached = new Set()
  const queue = [...roots]
  while (queue.length) {
    const file = queue.pop()
    if (reached.has(file)) continue
    reached.add(file)
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const dependency of dependenciesOf(text, file)) {
      if (dependency) queue.push(dependency)
    }
  }
  return reached
}

function frontendReachability(site) {
  const skippedDirs = new Set(['node_modules', 'dist', 'build', '.git', '__pycache__'])
  const allFiles = walkFiles(site.root, { extensions: new Set(SOURCE_EXTS), skipDirs: skippedDirs })

  /**
   * tsconfig 的 `include` 是「显式入口」：`env.d.ts` 这类只被类型系统引用的文件，
   * 没有任何 import 指向它，却是编译必需项，必须当成根节点。
   */
  const tsconfigRoots = new Set()
  const tsconfigPath = path.join(site.root, '..', 'tsconfig.json')
  if (fs.existsSync(tsconfigPath)) {
    try {
      const raw = fs.readFileSync(tsconfigPath, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      for (const match of raw.matchAll(/"([^"]*src\/[^"]+)"/g)) {
        const pattern = match[1]
        if (!pattern.includes('*')) {
          const file = resolveFile(path.resolve(site.root, '..', pattern))
          if (file) tsconfigRoots.add(file)
          continue
        }
        const matcher = globToRegExp(path.resolve(site.root, '..', pattern))
        for (const file of allFiles) if (matcher.test(file)) tsconfigRoots.add(file)
      }
    } catch {
      // tsconfig 读不了就退化为纯 import 图，最坏情况是多报几个文件。
    }
  }

  /** glob 模式展开：把 `import.meta.glob` 的匹配结果当作可达起点。 */
  const globTargets = new Set()
  const globs = []
  for (const file of allFiles) {
    if (!/\.(ts|tsx|mts|vue|js|mjs)$/.test(file)) continue
    let text
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      continue
    }
    for (const glob of globPatterns(text)) globs.push({ from: file, glob })
  }
  for (const { glob } of globs) {
    const absolute = glob.startsWith('.')
      ? path.resolve(site.root, glob)
      : path.resolve(site.root, glob.replace(/^[^/]*\//, ''))
    // 只处理落在源码根内的模式；`../` 出界的交给人工。
    if (!absolute.startsWith(site.root)) continue
    const dir = path.dirname(absolute)
    const matcher = globToRegExp(absolute)
    for (const file of allFiles) if (matcher.test(file)) globTargets.add(file)
    // 目录形式的 glob（`./views/*.vue` 已覆盖；`./views/**` 走这里）
    if (glob.endsWith('**') || glob.endsWith('**/*')) {
      for (const file of allFiles) if (file.startsWith(dir + path.sep)) globTargets.add(file)
    }
  }

  const unresolved = new Map()
  const resolved = (text, file) =>
    importSpecifiers(text)
      .map((spec) => {
        // 外部包：不以 `.` / `@` 别名开头的裸说明符一律当外部依赖。
        const isRelative = spec.startsWith('.')
        const isAlias = site.aliases.some(([prefix]) => spec.startsWith(prefix))
        if (!isRelative && !isAlias) return null
        if (isRelative) return resolveFile(path.resolve(path.dirname(file), spec))
        const hit = resolveFromRoot(site.root, site.aliases, spec)
        if (hit) return hit
        const key = spec.split('/').slice(0, 2).join('/')
        unresolved.set(key, (unresolved.get(key) ?? 0) + 1)
        return null
      })
      .filter(Boolean)

  const reached = walkGraph(
    [...site.entries.filter((entry) => fs.existsSync(entry)), ...globTargets, ...tsconfigRoots],
    resolved,
  )

  const unreferenced = allFiles
    .filter((file) => !reached.has(file))
    .map((file) => path.relative(REPO_ROOT, file))
    .sort()

  return { unreferenced, reached: reached.size, total: allFiles.length, unresolved, globs }
}

/* ─────────────────────────────── 后端可达性 ─────────────────────────────── */

const BACKENDS = [
  {
    name: 'homeos',
    packageRoot: path.join(REPO_ROOT, 'homeos', 'backend', 'src'),
    modulePrefix: 'homeos.backend.src',
    entries: [path.join(REPO_ROOT, 'homeos', 'backend', 'src', 'app.py')],
  },
  {
    name: 'homeos-store',
    packageRoot: path.join(REPO_ROOT, 'homeos-store', 'backend', 'src'),
    modulePrefix: 'homeos_store.backend.src',
    entries: [path.join(REPO_ROOT, 'homeos-store', 'backend', 'src', 'app.py')],
  },
]

/** 把 python import 语句拆成绝对模块名。相对导入按 file 所在包展开。 */
function pythonImports(text, filePath, packageRoot) {
  const source = stripComments(text).replace(/^\s*#.*$/gm, '')
  const rel = path.relative(packageRoot, filePath)
  const packageParts = path
    .dirname(rel)
    .split(path.sep)
    .filter((part) => part && part !== '.')
  const results = []

  /** 把 `import a, b as c` 的名字列表展开成「模块名.名字」，供按文件解析。 */
  const namesOf = (raw) =>
    raw
      .replace(/[()]/g, '')
      .split(',')
      .map((name) =>
        name
          .trim()
          .split(/\s+as\s+/)[0]
          .trim(),
      )
      .filter((name) => name && name !== '*')

  for (const match of source.matchAll(/^\s*from\s+(\.+)([\w.]*)\s+import\s+([^\n(]+|\([^)]*\))/gm)) {
    const dots = match[1].length
    const moduleTail = match[2]
    const base = packageParts.slice(0, Math.max(0, packageParts.length - (dots - 1)))
    const joined = [...base, ...(moduleTail ? moduleTail.split('.') : [])].filter(Boolean).join('.')
    if (joined) results.push(joined)
    for (const name of namesOf(match[3])) results.push([joined, name].filter(Boolean).join('.'))
  }
  for (const match of source.matchAll(/^\s*from\s+([\w.]+)\s+import\s+([^\n(]+|\([^)]*\))/gm)) {
    const moduleName = match[1]
    results.push(moduleName)
    for (const name of namesOf(match[2])) results.push(`${moduleName}.${name}`)
  }
  for (const match of source.matchAll(/^\s*import\s+([\w.]+)(?:\s+as\s+\w+)?/gm)) {
    results.push(match[1])
  }
  return results
}

function pythonModuleToFile(packageRoot, moduleName) {
  if (!moduleName) return null
  const base = path.join(packageRoot, ...moduleName.split('.'))
  return resolveFile(base.endsWith('.py') ? base.slice(0, -3) : base)
}

function backendReachability(site) {
  const skippedDirs = new Set(['node_modules', 'dist', 'build', '.git', '__pycache__'])
  const allFiles = walkFiles(site.packageRoot, { extensions: new Set(['.py']), skipDirs: skippedDirs })
  const resolved = (text, file) =>
    pythonImports(text, file, site.packageRoot)
      .map((moduleName) => {
        // 相对导入已被展开成「相对包根」的点号名，绝对导入带完整前缀；两者都归一到包根相对。
        const stripped = moduleName.startsWith(`${site.modulePrefix}.`)
          ? moduleName.slice(site.modulePrefix.length + 1)
          : moduleName
        return pythonModuleToFile(site.packageRoot, stripped)
      })
      .filter(Boolean)

  const reached = walkGraph(site.entries, resolved)

  // `__init__.py` 是包标记：即便没人 import 它的成员，删掉会破坏包结构。
  const unreferenced = allFiles
    .filter((file) => !reached.has(file) && path.basename(file) !== '__init__.py')
    .map((file) => path.relative(REPO_ROOT, file))
    .sort()

  return { unreferenced, reached: reached.size, total: allFiles.length }
}

/* ─────────────────────────────── 报告输出 ─────────────────────────────── */

function ensureOutDir() {
  fs.mkdirSync(OUT_DIR, { recursive: true })
}

function writeReport(fileName, title, sections) {
  const lines = [`# ${title}`, '', `生成时间：${new Date().toISOString()}`, '']
  for (const section of sections) {
    lines.push(`## ${section.heading}`, '', section.note ?? '', '')
    if (section.lines.length === 0) lines.push('（无）', '')
    else lines.push('```', ...section.lines, '```', '')
  }
  const body = lines.join('\n')
  fs.writeFileSync(path.join(OUT_DIR, fileName), body, 'utf8')
  if (TO_STDOUT) process.stdout.write(`\n===== ${fileName} =====\n${body}\n`)
  return body
}

/* ─────────────────────────────── 可达性报告 ─────────────────────────────── */

function runFrontend() {
  const sections = []
  for (const site of FRONTENDS) {
    const result = frontendReachability(site)
    sections.push({
      heading: `${site.name}：不可达文件（${result.unreferenced.length} / ${result.total}）`,
      note:
        '口径：从 `main.ts` 与 `import.meta.glob` 展开点出发的静态可达集合。' +
        '动态拼接的 import、运行时注册、以及被 `vite.config` 显式列为入口的文件**不算**可达 —— ' +
        '删除前必须逐个确认。',
      lines: result.unreferenced,
    })
    sections.push({
      heading: `${site.name}：别名未解析统计`,
      note: '出现次数多的说明符前缀往往意味着别名表缺一项，而不是文件缺失。',
      lines: [...result.unresolved.entries()].map(([key, count]) => `${key}: ${count}`).sort(),
    })
    sections.push({
      heading: `${site.name}：import.meta.glob 点`,
      note: '这些 glob 会把整批文件变成可达，误报主要来自遗漏它们。',
      lines: result.globs.map(({ from, glob }) => `${path.relative(REPO_ROOT, from)} → ${glob}`).sort(),
    })
  }
  writeReport('unreferenced-frontend.md', '前端不可达文件审计', sections)
}

function runBackend() {
  const sections = []
  for (const site of BACKENDS) {
    const result = backendReachability(site)
    sections.push({
      heading: `${site.name}：不可达模块（${result.unreferenced.length} / ${result.total}）`,
      note:
        '口径：从 `app.py` 出发的绝对 + 相对 import 可达集合，排除 `__init__.py`。' +
        'FastAPI 路由、`__init__.py` 副作用注册、字符串动态导入不算可达 —— 删除前必须确认。',
      lines: result.unreferenced,
    })
  }
  writeReport('unreferenced-backend.md', '后端不可达模块审计', sections)
}

function runEnv() {
  const documented = readDocumentedEnvKeys()
  const consumed = readConsumedEnvKeys()
  const documentedButUnread = [...documented].filter((key) => !consumed.has(key)).sort()
  const readButUndocumented = [...consumed].filter((key) => !documented.has(key)).sort()

  writeReport('env-inventory.md', '环境变量对账', [
    {
      heading: `文档有、代码与部署都不读（${documentedButUnread.length}）`,
      note:
        '删减 `.env.example` 的首选候选；仍需确认没有外部部署脚本读取。' +
        '「读」的口径与门禁共用 `ops/lib/env-inventory.mjs`，含 compose 插值与模块常量间接引用。',
      lines: documentedButUnread,
    },
    {
      heading: `代码读取、但 .env.example 未记录（${readButUndocumented.length}）`,
      note: '要么补文档，要么是内部派生值（如测试专用、启动器注入），按需分类。',
      lines: readButUndocumented,
    },
  ])
}

/* ─────────────────────────────── 客户端路由对账 ─────────────────────────────── */

function readRouteBaseline(file) {
  if (!fs.existsSync(file)) return new Set()
  const payload = JSON.parse(fs.readFileSync(file, 'utf8'))
  const entries = Array.isArray(payload) ? payload : (payload.operations ?? payload.routes ?? [])
  return new Set(
    entries.map((entry) =>
      String(entry)
        .replace(/\s*\[[a-z-]+\]\s*$/, '')
        .replace(/^[A-Z]+\s+/, '')
        .replace(/\{[^}]+\}/g, ':id')
        .trim(),
    ),
  )
}

function collectClientPaths(siteRoot) {
  const apiRoot = path.join(siteRoot, 'services', 'api')
  if (!fs.existsSync(apiRoot)) return new Set()
  const files = walkFiles(apiRoot, { extensions: new Set(['.ts', '.js']), skipDirs: new Set(['node_modules']) })
  const paths = new Set()
  for (const file of files) {
    const text = stripComments(fs.readFileSync(file, 'utf8'))
    for (const match of text.matchAll(/['"`](\/api\/v1\/[^'"`$]*|\/[a-z][\w/-]*\/[^'"`$\s]*)['"`]/g)) {
      const raw = match[1].split('?')[0]
      if (!raw.startsWith('/')) continue
      paths.add(raw.replace(/\$\{[^}]+\}/g, ':id').replace(/\/$/, '') || '/')
    }
  }
  return paths
}

function runRoutes() {
  const homeosBaseline = readRouteBaseline(
    path.join(REPO_ROOT, 'ops', 'checks', 'architecture', 'routes-baseline.json'),
  )
  const storeBaseline = readRouteBaseline(
    path.join(REPO_ROOT, 'ops', 'checks', 'architecture', 'store-routes-baseline.json'),
  )
  const homeosClient = collectClientPaths(path.join(REPO_ROOT, 'homeos', 'frontend', 'src'))
  const storeClient = collectClientPaths(path.join(REPO_ROOT, 'homeos-store', 'frontend', 'src'))

  const unmatched = (client, baseline) =>
    [...client]
      .filter((p) => !baseline.has(p))
      .filter((p) => ![...baseline].some((server) => server.includes(p) || p.includes(server)))
      .sort()

  writeReport('client-routes.md', '前端 API 调用与后端路由对账', [
    {
      heading: `homeos：客户端路径不在路由基线中（${unmatched(homeosClient, homeosBaseline).length}）`,
      note: '路径做过 `{id}` → `:id` 归一；前缀匹配用于容忍拼在常量里的路径。',
      lines: unmatched(homeosClient, homeosBaseline),
    },
    {
      heading: `homeos-store：客户端路径不在路由基线中（${unmatched(storeClient, storeBaseline).length}）`,
      note: '同上。',
      lines: unmatched(storeClient, storeBaseline),
    },
  ])
}

/* ─────────────────────────────── 入口 ─────────────────────────────── */

ensureOutDir()
const only = (flag, runner) => {
  const anySelector = argv.has('--frontend') || argv.has('--backend') || argv.has('--env') || argv.has('--routes')
  if (!anySelector || argv.has(flag)) runner()
}
only('--frontend', runFrontend)
only('--backend', runBackend)
only('--env', runEnv)
only('--routes', runRoutes)
console.log(`审计报告已写入 ${path.relative(REPO_ROOT, OUT_DIR)}/`)
