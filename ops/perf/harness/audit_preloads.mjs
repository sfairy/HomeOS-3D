#!/usr/bin/env node
/**
 * 首屏 modulepreload 审计（路线图 `preload-audit`）。
 *
 * 为什么需要它：`check_bundle_budget.mjs` 只回答「首屏 preload 一共多少字节」，
 * 不回答「这些字节里有没有根本不该在首屏的东西」。这两种失败长得完全不一样：
 *
 * - 体积漂移：数字变大，预算立刻变红，好抓；
 * - **可达性漂移**：数字几乎不动，但某个懒路由的功能被静态依赖拖进首屏。
 *   本仓库真实发生过一次：`services/api/index.ts` 的 `export * from './backups'`
 *   让 98KB 的备份/导出/恢复客户端进了入口静态图，每一页（含登录页）都要下载
 *   它，而它唯一的使用方是设置页里的 `BackupRestoreDialog.vue`。字节数看起来
 *   「一直都在 690KB 左右」，review 时看不出异常。
 *
 * 本脚本因此按 **chunk × 功能域** 出表：把每个 preload chunk 里出现的 API
 * 端点前缀（``/backups/``、``/earthquake/``、``/config/`` …）扫出来，谁把懒
 * 路由的功能带上首屏就一目了然。`--deny` 里的域一旦出现在任何 preload chunk
 * 里即失败（默认 `backups`：它的使用方全是设置页懒路由）。
 *
 * 用法：
 *   node ops/perf/harness/audit_preloads.mjs              # 出表，默认断言
 *   node ops/perf/harness/audit_preloads.mjs --json       # 机器可读
 *   node ops/perf/harness/audit_preloads.mjs --deny backups,charts
 *   node ops/perf/harness/audit_preloads.mjs --app store  # 审计商店首屏
 *   node ops/perf/harness/audit_preloads.mjs --no-fail    # 只看表（排查用）
 *
 * 产物依赖：`bun run --cwd homeos/frontend build` / `bun run --cwd homeos-store build`。
 */
import { gzipSync } from 'node:zlib'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(HERE, '../../..')

/** 两个项目各自的首屏产物位置与「URL 前缀 → dist 内目录」映射（与后端挂载点一致）。 */
const APPS = {
  app: {
    label: '主应用',
    dist: join(ROOT, 'dist/homeos/frontend'),
    // `/static/**` 与 `/modules/**` 直接落在 dist 根下。
    mounts: [
      { prefix: '/static/', dir: 'static' },
      { prefix: '/modules/', dir: 'modules' },
    ],
  },
  store: {
    label: '授权商店',
    dist: join(ROOT, 'dist/homeos-store/frontend'),
    // 商店的静态资源 URL 是 `/store-static/**`，磁盘上落在 `dist/static/**`。
    mounts: [{ prefix: '/store-static/', dir: 'static' }],
  },
}

/** 这些 chunk 名是「只该被懒路由引用」的重型库；出现在 preload 里就是回退。 */
const FORBIDDEN_CHUNKS = [/(^|\/)charts-.*\.js$/, /(^|\/)hls-.*\.js$/, /(^|\/)rolldown-runtime-.*\.js$/]

const DEFAULT_DENY = ['backups']

function parseArgs(argv) {
  const args = { app: 'app', json: false, fail: true, deny: DEFAULT_DENY, top: 0 }
  for (let i = 0; i < argv.length; i += 1) {
    const item = argv[i]
    if (item === '--json') args.json = true
    else if (item === '--no-fail') args.fail = false
    else if (item === '--app') args.app = argv[++i]
    else if (item === '--deny')
      args.deny = argv[++i]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    else if (item === '--top') args.top = Number(argv[++i]) || 0
    else if (item === '--help' || item === '-h') {
      console.log('用法：audit_preloads.mjs [--json] [--app app|store] [--deny a,b] [--top N] [--no-fail]')
      process.exit(0)
    }
  }
  return args
}

function attr(tag, name) {
  const match = tag.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
  return match ? match[1] : ''
}

function localPath(dist, url, mounts) {
  const clean = decodeURIComponent(url.split('?')[0].split('#')[0])
  const mount = mounts.find((m) => clean.startsWith(m.prefix))
  if (!mount) return ''
  // `/static/assets/x.js` → `<dist>/static/assets/x.js`；
  // 商店的 `/store-static/assets/x.js` → `<dist>/static/assets/x.js`。
  return join(dist, mount.dir, clean.slice(mount.prefix.length))
}

/**
 * 从 minified chunk 里抽取 API 端点，归并成「功能域」。
 *
 * rolldown 的压缩器会把字符串统一成模板字面量（`` `...` ``），所以引号与反引号
 * 三种形式都要扫；`${}` 插值处截断，只保留稳定的前缀段。
 */
function endpointsOf(code) {
  const found = new Set()
  for (const match of code.matchAll(/[`'"](\/(?:api\/v1\/)?[a-z0-9][a-z0-9_/-]{1,40})(?:[`'"/?])/g)) {
    const path = match[1].replace(/\/+$/, '')
    // 单段路径（`/devices`）多为前端路由而非 API，只保留两段以上的端点。
    if (path.split('/').filter(Boolean).length < 2) continue
    if (/^\/(api\/v1|static|store-static|modules|assets)\b/.test(path)) {
      // `/api/v1/<domain>` 只保留域名这一层，避免把每个端点都列出来。
      const parts = path.split('/').filter(Boolean)
      if (parts[0] === 'api') found.add(`/api/${parts[2] ?? ''}`)
      continue
    }
    found.add(path)
  }
  return [...found]
}

/** 端点 → 功能域（取第一段，`/backups/export` → `backups`）。 */
function domainOf(endpoint) {
  const parts = endpoint.split('/').filter(Boolean)
  if (parts[0] === 'api') return parts[1] || 'api'
  return parts[0] || endpoint
}

function main() {
  const args = parseArgs(process.argv.slice(2))
  const app = APPS[args.app]
  if (!app) {
    console.error(`未知 --app：${args.app}（可选：${Object.keys(APPS).join(' / ')}）`)
    process.exit(2)
  }
  const htmlPath = join(app.dist, 'index.html')
  if (!existsSync(htmlPath)) {
    console.error(
      `缺少构建产物：${htmlPath}\n先运行：bun run --cwd ${args.app === 'store' ? 'homeos-store' : 'homeos/frontend'} build`,
    )
    process.exit(2)
  }

  const html = readFileSync(htmlPath, 'utf8')
  const tags = [...html.matchAll(/<link\b[^>]*\brel\s*=\s*["']modulepreload["'][^>]*>/gi)].map((m) => m[0])
  const urls = [...new Set(tags.map((tag) => attr(tag, 'href')).filter(Boolean))]

  const missing = []
  const chunks = urls.map((url) => {
    const file = localPath(app.dist, url, app.mounts)
    if (!file || !existsSync(file)) {
      missing.push(url)
      return { url, name: basename(url), bytes: 0, gzip: 0, domains: [] }
    }
    const code = readFileSync(file, 'utf8')
    const domains = new Set(endpointsOf(code).map(domainOf))
    return {
      url,
      name: basename(file),
      bytes: statSync(file).size,
      gzip: gzipSync(code, { level: 6 }).length,
      domains: [...domains].sort(),
    }
  })

  const raw = chunks.reduce((sum, c) => sum + c.bytes, 0)
  const gzip = chunks.reduce((sum, c) => sum + c.gzip, 0)
  const sorted = [...chunks].sort((a, b) => b.bytes - a.bytes)

  const denyHits = []
  for (const domain of args.deny) {
    for (const chunk of chunks) {
      if (chunk.domains.includes(domain)) denyHits.push({ domain, chunk: chunk.name, bytes: chunk.bytes })
    }
  }
  const forbiddenChunks = chunks.filter((chunk) => FORBIDDEN_CHUNKS.some((re) => re.test(chunk.name)))

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          generatedAt: new Date().toISOString(),
          app: args.app,
          chunkCount: chunks.length,
          preloadRawBytes: raw,
          preloadGzipBytes: gzip,
          chunks: sorted.map((c) => ({
            name: c.name,
            bytes: c.bytes,
            gzip: c.gzip,
            share: raw ? Number(((c.bytes / raw) * 100).toFixed(1)) : 0,
            domains: c.domains,
          })),
          denyHits,
          forbiddenChunks: forbiddenChunks.map((c) => c.name),
          missing,
        },
        null,
        2,
      ),
    )
    process.exit(args.fail && (denyHits.length || forbiddenChunks.length || missing.length) ? 1 : 0)
  }

  console.log(`${app.label}首屏 modulepreload 审计（${htmlPath}）`)
  console.log('─'.repeat(72))
  const limit = args.top > 0 ? sorted.slice(0, args.top) : sorted
  for (const chunk of limit) {
    const share = raw ? ((chunk.bytes / raw) * 100).toFixed(1) : '0.0'
    console.log(
      `${String(chunk.bytes).padStart(9)} ${String(chunk.gzip).padStart(8)}  ${share.padStart(5)}%  ${chunk.name}`,
    )
    if (chunk.domains.length) console.log(`${' '.repeat(19)}功能域：${chunk.domains.join(' / ')}`)
  }
  console.log('─'.repeat(72))
  console.log(
    `合计 ${sorted.length} 个 chunk：${raw.toLocaleString('en-US')}B raw / ${gzip.toLocaleString('en-US')}B gzip`,
  )

  let failed = false
  if (missing.length) {
    failed = true
    console.error(`\nFAIL  index.html 引用了不存在的产物（拼错的 hash / 半途产物）：\n  ${missing.join('\n  ')}`)
  }
  if (forbiddenChunks.length) {
    failed = true
    console.error(
      `\nFAIL  懒加载重型库回到了首屏 preload：\n${forbiddenChunks
        .map((c) => `  ${c.name} (${c.bytes}B)`)
        .join('\n')}\n  修法：vite.config.ts 的 build.modulePreload.resolveDependencies。`,
    )
  }
  if (denyHits.length) {
    failed = true
    console.error(
      `\nFAIL  以下懒路由功能域出现在了首屏 preload（每一个都会让所有页面多下载一段死代码）：\n${denyHits
        .map((hit) => `  ${hit.domain} ← ${hit.chunk} (${hit.bytes}B)`)
        .join(
          '\n',
        )}\n  修法：别让启动期模块经 barrel（services/api/index.ts 的 export *）间接引用它，改为直接 import 具体模块。`,
    )
  }
  if (failed && args.fail) process.exit(1)
  console.log(failed ? '\n审计未通过（--no-fail 下仅提示）。' : '\n审计通过。')
}

main()
