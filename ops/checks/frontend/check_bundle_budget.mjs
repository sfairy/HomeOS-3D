#!/usr/bin/env node
/**
 * 首屏字节预算（bundle budget）棘轮。
 *
 * ## 为什么需要它
 *
 * `vite.config.ts` 里记录了多组实测数字（entry js 723.2KB / 首屏 js+css 915.5KB、
 * `entriesAwareMergeThreshold` 48k→1.98MB 的悬崖），但这些数字只存在于注释里：
 * `chunkSizeWarningLimit: 1600` 只打印警告，**没有任何门禁会因首屏变大而失败**。
 * 于是「某次改动把一个懒加载 chunk 提升成静态依赖」只能等用户在慢网上感知到。
 *
 * 本脚本读构建产物 `index.html`，把「首屏真正会下载的东西」钉成预算：
 * - `modulepreload` 的 JS + 所有 `rel=stylesheet` 的 CSS，分别统计原始与 gzip 字节；
 * - 全仓最大的 JS chunk（通常是懒加载的 3D 块）。
 *
 * ## 为什么用 gzip 字节而不是原文字节
 *
 * 传输成本由压缩后决定；同一个 chunk 加几行注释会让原文涨、gzip 几乎不动。门槛设在
 * gzip 上，误报明显更少。原始字节仍然记录，用于排查「是不是加了内联资源」。
 *
 * ## 用法
 *
 * ```bash
 * node ops/checks/frontend/check_bundle_budget.mjs                    # 校验（默认 homeos）
 * node ops/checks/frontend/check_bundle_budget.mjs --project store    # 校验 store
 * node ops/checks/frontend/check_bundle_budget.mjs --update           # 重录基线
 * node ops/checks/frontend/check_bundle_budget.mjs --report           # 只打印，不判定
 * ```
 *
 * 基线：`ops/checks/baselines/frontend/bundle-budget.json`（两个项目共用一个文件）。
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { gzipSync } from 'node:zlib'

const REPO_ROOT = path.resolve(import.meta.dirname, '../../..')
const BASELINE_PATH = path.join(REPO_ROOT, 'ops/checks/baselines/frontend/bundle-budget.json')

/** 允许的首屏 gzip 放大系数：低于这个幅度属于「正常波动 + 有意的少量新增」。 */
const PRELOAD_GZIP_TOLERANCE = 1.05
/** 最大懒 chunk 的放大系数（懒加载块的增长不影响首屏，给得更宽）。 */
const MAX_CHUNK_GZIP_TOLERANCE = 1.15

const PROJECTS = {
  homeos: {
    dist: 'dist/homeos/frontend',
    // 产物被挂在根路径：`/static/assets/...`
    prefix: '/',
  },
  store: {
    dist: 'dist/homeos-store/frontend',
    // 商店前端挂在 `/store-static/` 下，产物实际在 `static/` 目录里。
    prefix: '/store-static/',
  },
}

function parseArgs(argv) {
  const options = { project: 'homeos', update: false, check: true, report: false }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--update') options.update = true
    else if (arg === '--report') {
      options.report = true
      options.check = false
    } else if (arg === '--project') {
      options.project = argv[index + 1]
      index += 1
    } else if (arg === '--no-check') options.check = false
  }
  return options
}

/** 从 index.html 抽出首屏会下载的资源（modulepreload + stylesheet）。 */
function extractFirstScreen(html) {
  const preload = [...html.matchAll(/<link[^>]+rel="modulepreload"[^>]*href="([^"]+)"/g)].map((m) => m[1])
  const styles = [...html.matchAll(/<link[^>]+rel="stylesheet"[^>]*href="([^"]+)"/g)].map((m) => m[1])
  return { preload, styles }
}

function fileSize(file) {
  if (!existsSync(file)) return null
  const body = readFileSync(file)
  return { raw: body.length, gzip: gzipSync(body, { level: 9 }).length }
}

function resolveDistFile(distRoot, href, prefix) {
  // href 形如 `/static/assets/x.js`（homeos）或 `/store-static/theme.css`（store）。
  const clean = href.split('?')[0]
  const rest = clean.startsWith(prefix) ? clean.slice(prefix.length) : clean.replace(/^\.?\//, '')
  // 依次尝试「dist 根下原样」与「dist/static 下」：两个项目的静态目录布局不同，
  // 用存在性判定而不是再给每个项目写一遍映射。
  for (const candidate of [path.join(REPO_ROOT, distRoot, rest), path.join(REPO_ROOT, distRoot, 'static', rest)]) {
    if (existsSync(candidate)) return candidate
  }
  return null
}

/** 递归列出 dist 下的 js 文件（不跟随符号链接）。 */
function listJsFiles(directory) {
  const found = []
  const stack = [directory]
  while (stack.length) {
    const current = stack.pop()
    for (const entry of safeReaddir(current)) {
      const full = path.join(current, entry.name)
      if (entry.isDirectory()) stack.push(full)
      else if (entry.isFile() && entry.name.endsWith('.js')) found.push(full)
    }
  }
  return found
}

function safeReaddir(directory) {
  try {
    return readdirSync(directory, { withFileTypes: true })
  } catch {
    return []
  }
}

function measure(project) {
  const config = PROJECTS[project]
  if (!config) throw new Error(`未知项目：${project}（可选 ${Object.keys(PROJECTS).join(' / ')}）`)
  const distRoot = config.dist
  const indexPath = path.join(REPO_ROOT, distRoot, 'index.html')
  if (!existsSync(indexPath)) {
    throw new Error(`缺少构建产物 ${path.join(distRoot, 'index.html')}；先跑 bun run build:app`)
  }
  const html = readFileSync(indexPath, 'utf8')
  const { preload, styles } = extractFirstScreen(html)

  let preloadRaw = 0
  let preloadGzip = 0
  let cssRaw = 0
  let cssGzip = 0
  const missing = []
  for (const href of preload) {
    const file = resolveDistFile(distRoot, href, config.prefix)
    const size = file ? fileSize(file) : null
    if (size === null) missing.push(href)
    else {
      preloadRaw += size.raw
      preloadGzip += size.gzip
    }
  }
  for (const href of styles) {
    const file = resolveDistFile(distRoot, href, config.prefix)
    const size = file ? fileSize(file) : null
    if (size === null) missing.push(href)
    else {
      cssRaw += size.raw
      cssGzip += size.gzip
    }
  }

  let maxChunk = { file: '', raw: 0, gzip: 0 }
  for (const file of listJsFiles(path.join(REPO_ROOT, distRoot))) {
    const body = readFileSync(file)
    const gzip = gzipSync(body, { level: 9 }).length
    if (gzip > maxChunk.gzip) {
      maxChunk = { file: path.relative(REPO_ROOT, file), raw: body.length, gzip }
    }
  }

  return {
    indexHtml: path.join(distRoot, 'index.html'),
    preloadFiles: preload.length,
    cssFiles: styles.length,
    preloadRaw,
    preloadGzip,
    cssRaw,
    cssGzip,
    firstScreenRaw: preloadRaw + cssRaw,
    firstScreenGzip: preloadGzip + cssGzip,
    maxChunk,
    missing,
  }
}

function loadBaseline() {
  try {
    return JSON.parse(readFileSync(BASELINE_PATH, 'utf8'))
  } catch {
    return null
  }
}

function formatKb(bytes) {
  return `${(bytes / 1024).toFixed(1)} KB`
}

function main() {
  const options = parseArgs(process.argv.slice(2))
  const current = measure(options.project)
  const baseline = loadBaseline()
  const key = options.project

  if (current.missing.length) {
    console.error(`index.html 引用了不存在的产物（${current.missing.length} 个）：`)
    for (const href of current.missing.slice(0, 5)) console.error(`  - ${href}`)
    return 1
  }

  console.log(`[${key}] 首屏 ${current.preloadFiles} JS + ${current.cssFiles} CSS`)
  console.log(
    `  raw   ${formatKb(current.firstScreenRaw)}（JS ${formatKb(current.preloadRaw)} / CSS ${formatKb(current.cssRaw)}）`,
  )
  console.log(
    `  gzip  ${formatKb(current.firstScreenGzip)}（JS ${formatKb(current.preloadGzip)} / CSS ${formatKb(current.cssGzip)}）`,
  )
  console.log(
    `  最大 chunk ${current.maxChunk.file} ${formatKb(current.maxChunk.gzip)} gzip / ${formatKb(current.maxChunk.raw)} raw`,
  )

  if (options.update) {
    const next = { ...(baseline ?? {}), [key]: current }
    mkdirSync(path.dirname(BASELINE_PATH), { recursive: true })
    writeFileSync(BASELINE_PATH, `${JSON.stringify(next, null, 2)}\n`, 'utf8')
    console.log(`已录制基线：${path.relative(REPO_ROOT, BASELINE_PATH)}（${key}）`)
    return 0
  }

  if (!options.check) return 0

  const expected = baseline?.[key]
  if (!expected) {
    console.error(`缺少基线（${key}）：${path.relative(REPO_ROOT, BASELINE_PATH)}；先跑一次 --update。`)
    return 2
  }

  const problems = []
  const firstScreenLimit = Math.ceil(expected.firstScreenGzip * PRELOAD_GZIP_TOLERANCE)
  if (current.firstScreenGzip > firstScreenLimit) {
    problems.push(
      `首屏 gzip ${formatKb(current.firstScreenGzip)} 超过上限 ${formatKb(firstScreenLimit)}（基线 ${formatKb(expected.firstScreenGzip)}）`,
    )
  }
  const chunkLimit = Math.ceil(expected.maxChunk.gzip * MAX_CHUNK_GZIP_TOLERANCE)
  if (current.maxChunk.gzip > chunkLimit) {
    problems.push(
      `最大 chunk gzip ${formatKb(current.maxChunk.gzip)} 超过上限 ${formatKb(chunkLimit)}（基线 ${formatKb(expected.maxChunk.gzip)}）`,
    )
  }

  if (problems.length) {
    console.error('[bundle budget] 失败：')
    for (const problem of problems) console.error(`  - ${problem}`)
    console.error('确认是有意增大后，用 `node ops/checks/frontend/check_bundle_budget.mjs --update` 重录基线。')
    return 1
  }
  console.log('[bundle budget] 通过')
  return 0
}

process.exit(main())
