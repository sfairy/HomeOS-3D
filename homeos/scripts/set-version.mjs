#!/usr/bin/env bun
/**
 * 统一产品版本号：把仓库里所有「版本槽位」一次改到同一版本，并自检不遗漏。
 *
 *   bun homeos/scripts/set-version.mjs 0.7.2              # 改写 + 自检
 *   bun homeos/scripts/set-version.mjs 0.7.2 --check      # 只自检，不改写（CI 可用）
 *   bun homeos/scripts/set-version.mjs 0.7.2 --prev 0.7.1 # 显式指定上一版（默认自动推断）
 *
 * 与 `bump-version.mjs` 的分工：那个按北京时间生成 `YYYY.MM.DD.HH` 并只改 3 个
 * package.json + README 页眉；本脚本面向「指定语义化版本、全仓库对齐」。
 *
 * 设计要点
 * --------
 * 1. 槽位「正则 + 改写」集中在 `SLOTS` 里声明，**改写与自检共用同一份清单**，
 *    不会出现「脚本改了 A、漏了 B」的漂移。
 * 2. 槽位用「文件 glob」而不是固定文件名，新增文档 / 新增 .env.example 会自动纳入。
 * 3. 三层自检（任何一层不过就非零退出）：
 *    - 严格层：全仓库重跑一遍槽位规则，必须 0 变更（证明没有漏网的槽位）；
 *    - 泄漏层：文档 / 脚本 / 清单里凡「版本语义行」出现的三段式版本号，必须等于目标
 *      版本（仅 `deploy.sh` 的示意注释允许同时出现上一版）；
 *    - 归档层：`源代码/` 为上游发布包留档，脚本永不改动（列出来提醒）。
 *
 * 不动的目录：`源代码`（留档）、`node_modules`、`.git`、`dist`、`build`、
 * 任意层级的 `data`、`.venv*`、`__pycache__` 与缓存类目录。
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url))
const HOMEOS_ROOT = path.resolve(SCRIPT_DIR, '..')
/** 仓库根（`homeos/` 的上一级；合并进 HomeOS-3D 后 monorepo 根）。 */
const REPO_ROOT = path.resolve(HOMEOS_ROOT, '..')

/** 三段式版本号；用前后 lookaround 排除 IP（`0.0.0.0`）与四段日期版本。 */
const VER = String.raw`(?<![\d.])\d+\.\d+\.\d+(?![\d.])`
/** 允许 `v0.7.2` 前缀（顺手兼容运营手写的 v 前缀）。 */
const VER_OPT_V = `v?${VER}`
const ONLY_DIGITS_VERSION = /^\d+\.\d+\.\d+$/

/** 扫描 / 改写时跳过的目录名（任意层级命中即跳过）。 */
const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'data',
  '源代码',
  '__pycache__',
  '.cache',
  '.turbo',
  '.vite',
  '.venv',
  'coverage',
])

/** 视为文本、参与扫描的扩展名（含无扩展名的 dotfile 白名单）。 */
const TEXT_EXT = new Set([
  '.json',
  '.md',
  '.sh',
  '.yml',
  '.yaml',
  '.ts',
  '.mts',
  '.cts',
  '.tsx',
  '.vue',
  '.js',
  '.mjs',
  '.cjs',
  '.py',
  '.toml',
  '.env',
  '.example',
  '.txt',
  '.css',
  '.html',
  '.sql',
])

/** 文档 / 脚本类槽位共用的文件范围。 */
const DOC_FILES = [
  'README.md',
  '*.md',
  'docs/**/*.md',
  'ops/**/*.md',
  'ops/**/*.sh',
  '.env.example',
  '**/.env.example',
  '.github/workflows/*.yml',
]

const PACKAGE_JSON_FILES = [
  'package.json',
  'homeos/package.json',
  'homeos-store/package.json',
  'homeos/frontend/package.json',
  'homeos/packages/shared/package.json',
]

/**
 * 槽位清单。每条：`files`（glob 数组）、`label`、`pattern`（带 g/m 标志）、
 * `replace`（普通替换串；`__V__` = 目标版本，`__PREV__` = 上一版）。
 */
const SLOTS = [
  // ── 各 workspace package.json 的顶层 version ───────────────────────────────
  ...PACKAGE_JSON_FILES.map((file) => ({
    file,
    label: 'package.json 顶层 version',
    pattern: /^(\s*"version"\s*:\s*")[^"]+(")/m,
    replace: '$1__V__$2',
  })),

  // ── .env.example：镜像 tag 与版本钉 ───────────────────────────────────────
  ...[
    ['#?HOMEOS_VERSION=', 'HOMEOS_VERSION'],
    ['#?HOMEOS_IMAGE=ghcr\\.io/sfairy/homeos:', 'HOMEOS_IMAGE'],
    ['#?HOMEOS_STORE_IMAGE=ghcr\\.io/sfairy/homeos-store:', 'HOMEOS_STORE_IMAGE'],
  ].map(([prefix, key]) => ({
    files: ['.env.example', '**/.env.example'],
    label: `.env.example ${key}`,
    pattern: new RegExp(`^(${prefix})[^\\s#]*`, 'm'),
    replace: '$1__V__',
  })),

  // ── 文档 / 脚本里的命令示例 ───────────────────────────────────────────────
  {
    files: DOC_FILES,
    label: '命令示例 --version',
    pattern: new RegExp(`(--version\\s+)${VER_OPT_V}`, 'g'),
    replace: '$1__V__',
  },
  {
    files: DOC_FILES,
    label: '示例 HOMEOS_VERSION=',
    pattern: new RegExp(`(HOMEOS_VERSION=)${VER_OPT_V}`, 'g'),
    replace: '$1__V__',
  },
  {
    files: DOC_FILES,
    label: '示例镜像 tag homeos / homeos-store',
    pattern: new RegExp(`(ghcr\\.io/sfairy/homeos(?:-store)?:)${VER_OPT_V}`, 'g'),
    replace: '$1__V__',
  },
  {
    files: DOC_FILES,
    label: '「构建 `x` 这个 tag」说明',
    pattern: /(才会构建 )`[^`]+`( 这个 tag)/g,
    replace: '$1`__V__`$2',
  },
  {
    files: DOC_FILES,
    label: '客户升级通知模板版本号',
    pattern: new RegExp(`(【HomeOS 升级通知】版本 )${VER_OPT_V}`, 'g'),
    replace: '$1__V__',
  },

  // ── CI 注释里的版本示例 ──────────────────────────────────────────────────
  {
    files: ['.github/workflows/*.yml'],
    label: 'CI 注释「该版本号（如 x）」',
    pattern: new RegExp(`(该版本号（如 )${VER_OPT_V}(）)`, 'g'),
    replace: '$1__V__$2',
  },

  // ── deploy.sh 的「.env 钉住 A、package.json 已是 B」示意 ─────────────────
  // 这一处刻意同时出现「上一版 + 目标版」来解释优先级，所以要单独处理，
  // 不能跟着通用规则一起被抹成同一个值。
  {
    files: ['ops/deploy/deploy.sh'],
    label: 'deploy.sh 版本优先级示意（上一版 → 目标版）',
    pattern: /(「\.env 钉住 )[\d.]+(、package\.json 已是 )[\d.]+(」)/g,
    replace: '$1__PREV__$2__V__$3',
  },
  {
    files: ['ops/deploy/deploy.sh'],
    label: 'deploy.sh 镜像 tag 示意（目标版 vs 上一版）',
    pattern: /(「镜像 tag：)[\d.]+(」却沿用 )[\d.]+( 的镜像)/g,
    replace: '$1__V__$2__PREV__$3',
  },

  // ── 界面兜底版本号（后端没下发 site.version 时显示） ─────────────────────
  {
    file: 'homeos/frontend/src/studio/components/SceneStage.vue',
    label: 'Studio 场景页版本兜底',
    pattern: /(v\{\{ version \|\| ")[^"]*(")/g,
    replace: '$1__V__$2',
  },
  {
    file: 'homeos-store/frontend/src/components/SceneStage.vue',
    label: '商店场景页版本兜底',
    pattern: /(site\.version \|\| ")[^"]*(")/g,
    replace: '$1__V__$2',
  },
  {
    file: 'homeos/frontend/src/studio/views/EditorView.vue',
    label: '编辑器页眉版本',
    pattern: /(class="version">)[^<]*(<)/g,
    replace: '$1__V__$2',
  },
]

/** 泄漏层：只在这些文件里查「版本语义行」。 */
const LEAK_FILES = [
  'README.md',
  '*.md',
  'docs/**/*.md',
  'ops/**/*.md',
  'ops/**/*.sh',
  '.env.example',
  '**/.env.example',
  '.github/workflows/*.yml',
  'package.json',
  'homeos/package.json',
  'homeos-store/package.json',
  'homeos/frontend/package.json',
  'homeos/packages/shared/package.json',
  'bun.lock',
]
const LEAK_LINE =
  /--version\s|HOMEOS_VERSION|ghcr\.io\/sfairy\/homeos[\w-]*:|"version"\s*:|版本号|升级通知|都已改|构建 `/

/** 打印 `源代码/` 归档目录（脚本永不改动，列出来避免误会）。 */
const ARCHIVE_DIRS = ['源代码']

// ── glob 匹配（只支持 `*` / `**` / `?`，够用且无依赖） ──────────────────────
function globToRegExp(glob) {
  let out = ''
  for (let index = 0; index < glob.length; index += 1) {
    const char = glob[index]
    if (char === '*') {
      if (glob[index + 1] === '*') {
        // `**/` 匹配 0 段或多段目录；裸 `**` 兜底成任意字符
        if (glob[index + 2] === '/') {
          out += '(?:[^/]+/)*'
          index += 2
        } else {
          out += '.*'
          index += 1
        }
      } else {
        out += '[^/]*'
      }
    } else if (char === '?') {
      out += '[^/]'
    } else {
      out += char.replace(/[.+^${}()|[\]\\]/g, '\\$&')
    }
  }
  return new RegExp(`^${out}$`)
}

const matcher = new Map()
function matchesGlob(relPath, glob) {
  if (!matcher.has(glob)) matcher.set(glob, globToRegExp(glob))
  return matcher.get(glob).test(relPath)
}

function slotAppliesTo(slot, relPath) {
  if (slot.file) return slot.file === relPath
  return (slot.files || []).some((glob) => matchesGlob(relPath, glob))
}

// ── 遍历仓库 ───────────────────────────────────────────────────────────────
/** 无扩展名 / 非白名单扩展名、但要当文本处理的具体文件名。 */
const TEXT_FILES = new Set(['bun.lock', '.env.example', '.env', '.env.local'])

function isTextFile(filePath) {
  const base = path.basename(filePath)
  if (base === '.DS_Store') return false
  if (base.endsWith('.min.js') || base.endsWith('.map')) return false
  if (TEXT_FILES.has(base) || base.startsWith('.env')) return true
  return TEXT_EXT.has(path.extname(base).toLowerCase())
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name) || entry.name.startsWith('.venv')) continue
      walk(path.join(dir, entry.name), out)
    } else if (entry.isFile()) {
      const filePath = path.join(dir, entry.name)
      if (isTextFile(filePath)) out.push(filePath)
    }
  }
  return out
}

const relOf = (filePath) => path.relative(REPO_ROOT, filePath).split(path.sep).join('/')

// ── 规则执行 ───────────────────────────────────────────────────────────────
function buildReplace(slot, version, prev) {
  return slot.replace.replaceAll('__V__', version).replaceAll('__PREV__', prev || version)
}

function readSlotValue(slot, text, version, prev) {
  const probe = new RegExp(slot.pattern.source, slot.pattern.flags.replace('g', ''))
  const match = probe.exec(text)
  return match ? match[0] : null
}

/** bun.lock 的 workspace 版本：`"name": "x",` 紧跟着的 `"version": "y",`。 */
function rewriteLockfile(text, version) {
  const lines = text.split('\n')
  let changed = 0
  for (let index = 1; index < lines.length; index += 1) {
    if (!/^\s+"version": "\d+\.\d+\.\d+",\s*$/.test(lines[index])) continue
    if (!/^\s+"name": "/.test(lines[index - 1])) continue
    const next = lines[index].replace(/"\d+\.\d+\.\d+"/, `"${version}"`)
    if (next !== lines[index]) {
      lines[index] = next
      changed += 1
    }
  }
  return { text: lines.join('\n'), changed }
}

/**
 * 对单个文件应用槽位规则。
 * @returns {{ text: string, hits: { label: string, from: string, to: string }[] }}
 */
function applySlotsToFile(relPath, text, version, prev) {
  let next = text
  const hits = []
  for (const slot of SLOTS) {
    if (!slotAppliesTo(slot, relPath)) continue
    const before = readSlotValue(slot, next, version, prev)
    const replaced = next.replace(slot.pattern, buildReplace(slot, version, prev))
    if (replaced !== next) {
      hits.push({ label: slot.label, from: before || '(未匹配到旧值)', to: changedSnippet(slot, replaced, version) })
      next = replaced
    }
  }
  if (relPath === 'bun.lock') {
    const { text: locked, changed } = rewriteLockfile(next, version)
    if (changed) {
      hits.push({ label: `bun.lock workspace version ×${changed}`, from: '旧版本', to: version })
      next = locked
    }
  }
  return { text: next, hits }
}

/** 取改写后第一个命中片段，用于报告里显示「变成了什么」。 */
function changedSnippet(slot, text, version) {
  const probe = slot.pattern.source.replaceAll('__V__', version)
  const match = new RegExp(probe, slot.pattern.flags.replace('g', '')).exec(text)
  return match ? match[0].trim() : version
}

function collectVersions(texts) {
  const counts = new Map()
  const bump = (value) => {
    if (!value || !ONLY_DIGITS_VERSION.test(value)) return
    counts.set(value, (counts.get(value) || 0) + 1)
  }
  const tokenRe = new RegExp(VER, 'g')
  for (const { relPath, text } of texts) {
    for (const slot of SLOTS) {
      if (!slotAppliesTo(slot, relPath)) continue
      const global = new RegExp(slot.pattern.source, `${slot.pattern.flags.replace('g', '')}g`)
      for (const match of text.matchAll(global)) {
        // 一处槽位可能同时含「上一版 + 目标版」（deploy.sh 的示意注释），逐个计入。
        const versions = match[0].match(tokenRe) || []
        const names = match[0].matchAll(/:\s*"(\d+\.\d+\.\d+)"/g)
        const captured = [...names].map((item) => item[1])
        for (const value of (captured.length ? captured : versions)) bump(value)
      }
    }
    if (relPath === 'bun.lock') {
      const lines = text.split('\n')
      for (let index = 1; index < lines.length; index += 1) {
        if (/^\s+"version": "(\d+\.\d+\.\d+)",\s*$/.test(lines[index]) && /^\s+"name": /.test(lines[index - 1])) {
          bump(lines[index].match(/"(\d+\.\d+\.\d+)"/)[1])
        }
      }
    }
  }
  return counts
}

// ── 主流程 ─────────────────────────────────────────────────────────────────
const [, , rawVersion, ...rest] = process.argv
const flags = new Set(rest.filter((arg) => arg.startsWith('--')))
const prevIndex = rest.indexOf('--prev')
const explicitPrev = prevIndex >= 0 ? rest[prevIndex + 1] : ''

if (!rawVersion || flags.has('--help')) {
  console.log(
    [
      '用法: bun homeos/scripts/set-version.mjs <版本> [--prev <上一版>] [--check] [--dry-run]',
      '',
      '  <版本>        目标版本，形如 0.7.2',
      '  --prev <版本> 上一版；仅用于 deploy.sh 的优先级示意注释，默认自动推断',
      '  --check       只自检不改写（发现任何遗漏即非零退出）',
      '  --dry-run     打印将要改动的内容，但不落盘',
    ].join('\n'),
  )
  process.exit(rawVersion ? 0 : 2)
}
if (!ONLY_DIGITS_VERSION.test(rawVersion)) {
  console.error(`✗ 版本号格式不合法：${rawVersion}（期望 0.7.2 这种三段式纯数字）`)
  process.exit(2)
}

const version = rawVersion
const checkOnly = flags.has('--check')
const dryRun = flags.has('--dry-run')

const files = walk(REPO_ROOT)

// 上一版：优先 --prev，否则取「槽位里出现次数最多的非目标版本」。
const versionTexts = files.map((filePath) => ({
  relPath: relOf(filePath),
  text: fs.readFileSync(filePath, 'utf-8'),
}))
const versionCounts = collectVersions(versionTexts)
const inferredPrev = [...versionCounts.entries()]
  .filter(([value]) => value !== version)
  .sort((left, right) => right[1] - left[1])[0]?.[0]
const prev = explicitPrev || inferredPrev || version

console.log(`▶ 目标版本：${version}`)
console.log(`  上一版（用于示意注释）：${prev}${explicitPrev ? '（--prev）' : inferredPrev ? '（自动推断）' : '（未知，沿用目标版）'}`)
console.log(`  仓库根：${REPO_ROOT}`)
console.log('')

// 1) 改写（或 --check 只统计）；结果统一放进 nextByPath，供自检层复用，
//    这样 --dry-run / --check 也能对「改写后应当长什么样」做校验。
let changedFiles = 0
let slotHits = 0
const reports = []
const nextByPath = new Map()
for (const { relPath, text } of versionTexts) {
  const { text: next, hits } = applySlotsToFile(relPath, text, version, prev)
  nextByPath.set(relPath, next)
  if (next === text) continue
  changedFiles += 1
  slotHits += hits.length
  reports.push({ relPath, hits })
  if (!checkOnly && !dryRun) fs.writeFileSync(path.join(REPO_ROOT, relPath), next, 'utf-8')
}

console.log(`${checkOnly ? '◇ 自检' : dryRun ? '◇ DRY-RUN' : '✓ 改写'}：命中 ${slotHits} 个槽位、${changedFiles} 个文件`)
for (const { relPath, hits } of reports) {
  console.log(`  · ${relPath}`)
  for (const hit of hits) console.log(`      - ${hit.label} → ${hit.to}`)
}
console.log('')

// 2) 严格层：对「改写后的内容」再跑一遍槽位规则，必须 0 变更。
const strictLeftovers = []
for (const { relPath } of versionTexts) {
  const text = nextByPath.get(relPath)
  const { text: next, hits } = applySlotsToFile(relPath, text, version, prev)
  if (next !== text) strictLeftovers.push({ relPath, hits })
}

// 3) 泄漏层：文档 / 脚本里的「版本语义行」不得残留别的三段式版本号。
const leaks = []
for (const { relPath } of versionTexts) {
  const inScope = LEAK_FILES.some((glob) => matchesGlob(relPath, glob))
  if (!inScope) continue
  nextByPath.get(relPath).split('\n').forEach((line, lineIndex) => {
    if (!LEAK_LINE.test(line)) return
    // 占位符（`<新版本>` / `<上一个版本>` / `$VERSION` / `[:tag]`）不参与比较。
    if (/<[^>]*>|\$[A-Z_]+|\[:tag\]/.test(line)) return
    const tokens = line.match(new RegExp(VER, 'g')) || []
    const stray = tokens.filter((token) => token !== version && !(relPath === 'ops/deploy/deploy.sh' && token === prev))
    if (stray.length) leaks.push({ relPath, line: lineIndex + 1, stray, text: line.trim() })
  })
}

console.log(`◇ 严格层（重跑槽位规则）：${strictLeftovers.length === 0 ? '0 处残留 ✓' : `${strictLeftovers.length} 处残留 ✗`}`)
for (const leftover of strictLeftovers) {
  console.log(`  ! ${leftover.relPath}`)
  for (const hit of leftover.hits) console.log(`      - ${hit.label}：仍为 ${hit.from}`)
}
console.log(`◇ 泄漏层（版本语义行）：${leaks.length === 0 ? '0 处异常 ✓' : `${leaks.length} 处异常 ✗`}`)
for (const leak of leaks) {
  console.log(`  ! ${leak.relPath}:${leak.line} 残留 ${leak.stray.join(', ')}：${leak.text}`)
}
const archives = ARCHIVE_DIRS.filter((dir) => fs.existsSync(path.join(REPO_ROOT, dir))).map((dir) => `${dir}/`)
if (archives.length) console.log(`◇ 归档层（脚本不碰）：${archives.join('、')}`)

if (strictLeftovers.length || leaks.length) {
  console.error('\n✗ 版本号未完全统一，请把上面列出的文件补进 SLOTS 或手工修正。')
  process.exit(1)
}

if (checkOnly) {
  if (changedFiles) {
    console.error(`\n✗ 仍有 ${changedFiles} 个文件未统一到 ${version}（见上方「自检」列表）。`)
    process.exit(1)
  }
  console.log('\n✓ 全仓库版本号已统一。')
  process.exit(0)
}

console.log(
  dryRun
    ? `\n✓ DRY-RUN 通过：预计改动 ${changedFiles} 个文件（未落盘）。`
    : `\n✓ 全部统一为 ${version}：改动 ${changedFiles} 个文件，${slotHits} 个槽位。`,
)
