#!/usr/bin/env node
/**
 * 构建期预压缩：为前端产物生成 `.br` / `.gz` sidecar（同目录、同 basename）。
 *
 * 为什么需要它
 * ------------
 * 运行时（FastAPI）已经把 `/static` 与 `/modules` 两个挂载点换成了
 * `PrecompressedStaticFiles`（见 homeos/backend/src/platform/core/http/precompressed_static.py）：
 * 它按 `Accept-Encoding` 优先直出 `.br`、其次 `.gz`，并补上 `Content-Encoding` 与
 * `Vary: Accept-Encoding`。服务端只做「查 sidecar、发 sidecar」，压缩本身留在构建期做一次，
 * 于是每个请求都省掉动态 gzip 的 CPU（实测 869KB 的 index chunk 动态 gzip +33ms/请求）。
 *
 * 硬契约（改服务端时两边一起改）
 * ------------------------------
 * - sidecar 必须与原文件**同目录、同 basename**：`foo.js` → `foo.js.br` / `foo.js.gz`；
 * - 两种编码**同时生成**：只留一种会让另一类客户端的回退路径重新变成动态压缩；
 * - 原子写入（同目录 tmp + rename）：构建机并发读产物时不会读到半截 sidecar；
 * - sidecar 的 mtime 保持**等于源文件 mtime**：幂等判断只看「sidecar 是否与源同 mtime」，
 *   源文件没变就一个字节都不重写（`--check` 用同一口径校验缺失 / 过期）。
 *
 * 为什么不压 GLB / 图片 / woff2 / .map
 * ------------------------------------
 * 这些格式本身已压缩，再压一次只会更大；`.map` 只用于本地调试、不参与线上直出。
 * 只处理 `.js/.mjs/.cjs/.css/.html/.svg/.json/.webmanifest/.txt/.xml/.wasm` 与字体
 * （`.woff/.ttf/.otf`，`.woff2` 已压缩除外）——与 Caddy `encode` 的可压缩类型口径一致。
 *
 * 与 Vite manifest 的关系：manifest.json 在 `vite build` 期间生成，sidecar 在**构建完成后**
 * 才写，所以 manifest 天然不会包含 sidecar；本脚本也不改写任何构建产物本身。
 *
 * 用法
 * ----
 *   node ops/scripts/precompress-static.mjs                     # 默认目录，增量生成
 *   node ops/scripts/precompress-static.mjs --dir dist/foo       # 指定目录（可重复）
 *   node ops/scripts/precompress-static.mjs --check              # 只校验，缺失/过期即 exit 1（CI）
 *   node ops/scripts/precompress-static.mjs --br-quality 9 --gz-level 6 --verbose
 *
 * 退出码：0 = 正常 / 校验通过；1 = 校验失败或写入出错；2 = 参数错误。
 */

import {
  existsSync,
  readdirSync,
  readFileSync,
  renameSync,
  statSync,
  unlinkSync,
  utimesSync,
  writeFileSync,
} from 'node:fs'
import { dirname, extname, join, relative, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { brotliCompress, constants as zlibConstants, gzip } from 'node:zlib'

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '../..')

/** 可压缩类型（小写扩展名）。与 Caddy encode / 服务端 sidecar 口径保持一致。 */
const COMPRESSIBLE_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.css',
  '.html',
  '.htm',
  '.svg',
  '.json',
  '.webmanifest',
  '.txt',
  '.xml',
  '.wasm',
  '.woff',
  '.ttf',
  '.otf',
])

/** 已压缩格式：列出来是为了让「为什么跳过」在代码里可查，而不是只靠 include 列表兜底。 */
const SKIP_EXTENSIONS = new Set([
  '.glb',
  '.gltf',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.avif',
  '.gif',
  '.ico',
  '.mp4',
  '.webm',
  '.mp3',
  '.ogg',
  '.woff2',
  '.zip',
  '.gz',
  '.br',
  '.map',
])

/** 默认产物目录（vite 的真实输出，见 homeos/frontend/vite.config.ts 与 homeos-store/frontend/vite.config.ts）。 */
const DEFAULT_DIRS = ['dist/homeos/frontend', 'dist/homeos-store/frontend']

const DEFAULT_BR_QUALITY = 11 // brotli 11（构建期一次性成本换线上每个请求的带宽）
const DEFAULT_GZ_LEVEL = 9
const DEFAULT_CONCURRENCY = 4
/** 只处理 ≥1KiB 的文件：更小的响应动态 gzip 成本很低，而 7k+ 个 MDI 图标的
 * sidecar 会把构建时间与产物体积放大一个数量级；这也与运行时 GZipMiddleware
 * 的 minimum_size=1024 对齐（更小的 body 本来就不会被压缩）。 */
const MIN_COMPRESS_BYTES = 1024
/** mtime 允许的舍入误差（毫秒）：utimes 只保留毫秒。 */
const MTIME_TOLERANCE_MS = 1

const brotliCompressAsync = promisify(brotliCompress)
const gzipAsync = promisify(gzip)
const args = process.argv.slice(2)

function usage(exitCode) {
  const text = `用法：node ops/scripts/precompress-static.mjs [选项]

为前端构建产物生成 .br / .gz sidecar（同目录、同 basename），供后端按 Accept-Encoding 直出。

选项：
  --dir <路径>        要处理的目录，可重复；默认 ${DEFAULT_DIRS.join('、')}
  --check             只校验 sidecar 是否存在且与源文件同 mtime，不做任何写入
  --br-quality <n>    brotli 质量，默认 ${DEFAULT_BR_QUALITY}
  --gz-level <n>      gzip 级别，默认 ${DEFAULT_GZ_LEVEL}
  --concurrency <n>   并行压缩文件数，默认 ${DEFAULT_CONCURRENCY}
  --verbose           逐个文件打印原始 / sidecar 体积与压缩比
  --help, -h          打印本帮助
`
  ;(exitCode === 0 ? console.log : console.error)(text)
  process.exit(exitCode)
}

function parsePositiveInt(name, value, { min, max }) {
  const number = Number.parseInt(value, 10)
  if (!Number.isInteger(number) || number < min || number > max) {
    console.error(`${name} 需要 ${min}..${max} 之间的整数，收到：${value}`)
    process.exit(2)
  }
  return number
}

const options = {
  dirs: [],
  check: false,
  brQuality: DEFAULT_BR_QUALITY,
  gzLevel: DEFAULT_GZ_LEVEL,
  concurrency: DEFAULT_CONCURRENCY,
  verbose: false,
}

for (let i = 0; i < args.length; i += 1) {
  const arg = args[i]
  if (arg === '--dir') {
    const value = args[i + 1]
    if (!value) usage(2)
    options.dirs.push(value)
    i += 1
  } else if (arg === '--check') {
    options.check = true
  } else if (arg === '--br-quality') {
    options.brQuality = parsePositiveInt('--br-quality', args[i + 1], { min: 0, max: 11 })
    i += 1
  } else if (arg === '--gz-level') {
    options.gzLevel = parsePositiveInt('--gz-level', args[i + 1], { min: 0, max: 9 })
    i += 1
  } else if (arg === '--concurrency') {
    options.concurrency = parsePositiveInt('--concurrency', args[i + 1], { min: 1, max: 16 })
    i += 1
  } else if (arg === '--verbose' || arg === '-v') {
    options.verbose = true
  } else if (arg === '--help' || arg === '-h') {
    usage(0)
  } else {
    console.error(`未知参数：${arg}`)
    usage(2)
  }
}

const explicitDirs = options.dirs.length > 0
const dirs = (explicitDirs ? options.dirs : DEFAULT_DIRS).map((dir) => resolve(REPO_ROOT, dir))

/* ------------------------------------------------------------------ *
 * 扫描与 sidecar 判定
 * ------------------------------------------------------------------ */

/** 递归收集可压缩文件；不跟随符号链接（避免把 dist 外的文件压进产物目录）。 */
function collectFiles(dir, out) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isSymbolicLink()) continue
    if (entry.isDirectory()) {
      collectFiles(path, out)
      continue
    }
    if (!entry.isFile()) continue
    const extension = extname(entry.name).toLowerCase()
    if (SKIP_EXTENSIONS.has(extension) || !COMPRESSIBLE_EXTENSIONS.has(extension)) continue
    if (statSync(path).size < MIN_COMPRESS_BYTES) continue
    out.push(path)
  }
}

/**
 * sidecar 是否最新：两个后缀都存在、非空，且 mtime 与源文件一致。
 * 返回问题描述（null = 最新），供 --check 与增量写入共用同一套判定。
 */
function sidecarProblem(sourcePath, sourceStat) {
  for (const suffix of ['.br', '.gz']) {
    const sidecarPath = sourcePath + suffix
    if (!existsSync(sidecarPath)) return `缺 ${suffix}`
    const sidecarStat = statSync(sidecarPath)
    if (sidecarStat.size === 0) return `${suffix} 为空`
    if (Math.abs(sidecarStat.mtimeMs - sourceStat.mtimeMs) > MTIME_TOLERANCE_MS) return `${suffix} 已过期`
  }
  return null
}

/** 同目录写临时文件再 rename：避免构建产物被并发读取时看到半截 sidecar。 */
function writeSidecarAtomically(targetPath, data, sourceStat) {
  const tempPath = `${targetPath}.tmp-${process.pid}`
  try {
    writeFileSync(tempPath, data)
    // 先把 mtime 对齐源文件，再 rename —— 最终文件一出现就带正确 mtime，幂等判断无需额外元数据。
    utimesSync(tempPath, sourceStat.atime, sourceStat.mtime)
    renameSync(tempPath, targetPath)
  } catch (error) {
    try {
      unlinkSync(tempPath)
    } catch {
      // 清理失败不掩盖原始错误
    }
    throw error
  }
}

function formatBytes(bytes) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${bytes} B`
}

function formatRatio(compressed, original) {
  if (!original) return '—'
  return `${((1 - compressed / original) * 100).toFixed(1)}%`
}

function displayPath(path) {
  const rel = relative(REPO_ROOT, path)
  // 仓库外的临时目录（自测时用 --dir /tmp/...）直接给绝对路径，不要一串 ../。
  return rel && !rel.startsWith('..') ? rel : path
}

/* ------------------------------------------------------------------ *
 * 主流程
 * ------------------------------------------------------------------ */

const existingDirs = []
for (const dir of dirs) {
  if (existsSync(dir)) {
    existingDirs.push(dir)
    continue
  }
  if (explicitDirs) {
    console.error(`预压缩：目录不存在（--dir 显式指定，不静默跳过）：${displayPath(dir)}`)
    process.exit(1)
  }
  // 默认目录：允许只构建了一半（例如单独的 build:app），不存在就跳过并在汇总里说明。
  console.log(`预压缩：跳过不存在的产物目录 ${displayPath(dir)}（尚未构建？）`)
}

const files = []
for (const dir of existingDirs) collectFiles(dir, files)

if (files.length === 0) {
  if (options.check) {
    console.error('预压缩检查未通过：没有找到任何可压缩产物文件（先跑 bun run build:frontend）。')
    process.exit(1)
  }
  console.log('预压缩：没有找到可压缩产物文件，跳过。')
  process.exit(0)
}

// --check：只报告，不写盘。CI 可以用它确认构建产物里 sidecar 齐全且最新。
if (options.check) {
  const stale = []
  for (const file of files) {
    const problem = sidecarProblem(file, statSync(file))
    if (problem) stale.push({ file, problem })
  }
  if (stale.length > 0) {
    console.error(`预压缩检查未通过：${stale.length}/${files.length} 个文件缺少或过期的 sidecar。`)
    for (const item of stale.slice(0, 20)) console.error(`  ${item.problem}：${displayPath(item.file)}`)
    if (stale.length > 20) console.error(`  …… 另有 ${stale.length - 20} 个`)
    console.error('先跑 bun run build:frontend（或 bun run precompress:static）重新生成 sidecar。')
    process.exit(1)
  }
  console.log(`预压缩检查通过：${files.length} 个可压缩文件均有最新 .br / .gz。`)
  process.exit(0)
}

const stats = {
  files: 0,
  written: 0,
  current: 0,
  originalBytes: 0,
  brBytes: 0,
  gzBytes: 0,
  errors: [],
}

async function processFile(file) {
  const sourceStat = statSync(file)
  stats.files += 1
  stats.originalBytes += sourceStat.size

  const problem = sidecarProblem(file, sourceStat)
  if (!problem) {
    // 源文件没变：只做统计（读 size 即可），不重新压缩。
    stats.current += 1
    stats.brBytes += statSync(`${file}.br`).size
    stats.gzBytes += statSync(`${file}.gz`).size
    if (options.verbose) {
      const brSize = statSync(`${file}.br`).size
      const gzSize = statSync(`${file}.gz`).size
      console.log(
        `  = ${displayPath(file)}  ${formatBytes(sourceStat.size)} → br ${formatBytes(brSize)}（${formatRatio(brSize, sourceStat.size)}）/ gz ${formatBytes(gzSize)}（${formatRatio(gzSize, sourceStat.size)}）`,
      )
    }
    return
  }

  const source = readFileSync(file)
  const [brotli, gzipped] = await Promise.all([
    brotliCompressAsync(source, {
      params: {
        [zlibConstants.BROTLI_PARAM_QUALITY]: options.brQuality,
        [zlibConstants.BROTLI_PARAM_SIZE_HINT]: source.length,
      },
    }),
    gzipAsync(source, { level: options.gzLevel }),
  ])
  writeSidecarAtomically(`${file}.br`, brotli, sourceStat)
  writeSidecarAtomically(`${file}.gz`, gzipped, sourceStat)

  stats.written += 1
  stats.brBytes += brotli.length
  stats.gzBytes += gzipped.length
  if (options.verbose) {
    console.log(
      `  + ${displayPath(file)}  ${formatBytes(source.length)} → br ${formatBytes(brotli.length)}（${formatRatio(brotli.length, source.length)}）/ gz ${formatBytes(gzipped.length)}（${formatRatio(gzipped.length, source.length)}）`,
    )
  }
}

// 固定大小 worker 池：zlib 是同步 CPU 活，异步 API 只负责把多核用起来（构建机通常 4-8 核）。
let cursor = 0
async function worker() {
  while (cursor < files.length) {
    const file = files[cursor]
    cursor += 1
    try {
      await processFile(file)
    } catch (error) {
      stats.errors.push({ file, error })
    }
  }
}

await Promise.all(Array.from({ length: Math.min(options.concurrency, files.length) }, worker))

const dirsLabel = existingDirs.map(displayPath).join('、') || '（无）'
console.log(`预压缩：扫描 ${stats.files} 个可压缩文件（${dirsLabel}）`)
console.log(`  已最新 ${stats.current}，新生成 ${stats.written}`)
console.log(
  `  原始 ${formatBytes(stats.originalBytes)} → br ${formatBytes(stats.brBytes)}（省 ${formatRatio(stats.brBytes, stats.originalBytes)}）/ ` +
    `gz ${formatBytes(stats.gzBytes)}（省 ${formatRatio(stats.gzBytes, stats.originalBytes)}）`,
)

if (stats.errors.length > 0) {
  console.error(`预压缩：${stats.errors.length} 个文件处理失败：`)
  for (const item of stats.errors.slice(0, 10)) {
    console.error(`  ${displayPath(item.file)}：${item.error instanceof Error ? item.error.message : item.error}`)
  }
  process.exit(1)
}
