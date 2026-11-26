#!/usr/bin/env node
/**
 * CSS 路径真源一致性门禁。
 *
 * 为什么需要它
 * ------------
 * 「哪个路由加载哪些样式表」有 5 份真源，靠注释人工同步、零校验：
 *
 * | 真源 | 作用 | 漏改后果 |
 * | --- | --- | --- |
 * | `bootstrap/spa_static.py::_ROUTE_PRELOAD_STYLESHEETS` | 首屏 rel=preload | 首屏串行变慢（难察觉） |
 * | `src/studio/page-assets.ts::PAGE_ASSETS` | 路由挂载样式表 | 页面无样式 |
 * | `homeos/frontend/index.html` | 外壳硬编码 link | FOUC |
 * | `public-static.seed.json` | **未登录匿名白名单** | **登录页 401 丢样式** |
 * | `ops/dev.mjs::anonymousWhitelistComplete` | dist 完整性反查 | dev 自检误判 |
 *
 * 本门禁做三件事：
 *
 * I1 存在性（阻断）：四处真源里出现的每个 `/static/**.css` 必须能在
 *    `homeos/frontend/public` 下找到实体文件。改名后漏改任一处即失败。
 *
 * I2 预载必须被挂载（阻断）：`spa_static` 的 `rel=preload` 目标是「浏览器提前下载、
 *    随后由路由真正挂上」的样式表。若某个预载路径在 `PAGE_ASSETS` 里不存在，
 *    它要么是改名后漏改（预载 404，静默变慢），要么是永久浪费带宽。
 *
 * I3 挂载但未预载（仅报告）：合法情况（预载可以只覆盖首屏），列出来便于人工判断。
 *
 * 注意：`index.html` 直接引用的 `/static/**` 由 `vite.config.ts::updatePublicStaticManifest`
 * 在构建期**自动并入**匿名白名单（见该文件的 `discovered` 集合），因此不要求它们
 * 重复登记在 `public-static.seed.json` 里 —— seed 只为「HTML 不直接引用」的资源兜底。
 *
 * 用法：
 *   node ops/checks/frontend/check_css_manifests.mjs             # 报告 + 阻断项判定
 *   node ops/checks/frontend/check_css_manifests.mjs --json
 */
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import process from 'node:process'
import { fileURLToPath } from 'node:url'

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url))
const REPO_ROOT = resolve(SCRIPT_DIR, '../../..')

const FRONTEND_ROOT = join(REPO_ROOT, 'homeos/frontend')
const PUBLIC_ROOT = join(FRONTEND_ROOT, 'public')

const SOURCES = {
  spaStatic: join(REPO_ROOT, 'homeos/backend/src/bootstrap/spa_static.py'),
  pageAssets: join(FRONTEND_ROOT, 'src/studio/page-assets.ts'),
  indexHtml: join(FRONTEND_ROOT, 'index.html'),
  seed: join(FRONTEND_ROOT, 'public-static.seed.json'),
}

/** 从文本里抓 `/static/**.css`。 */
function cssPaths(text) {
  const out = new Set()
  for (const match of text.matchAll(/['"](\/static\/[^'"]+\.css)['"]/g)) out.add(match[1])
  // index.html 可能写成 href=/static/x.css（无引号包裹）：单独放行 href/src 写法。
  for (const match of text.matchAll(/(?:href|src)=["']?(\/static\/[^"'\s>]+\.css)/g)) out.add(match[1])
  return out
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : ''
}

/**
 * `spa_static.py` 里只取 `_ROUTE_PRELOAD_STYLESHEETS` 那一段，
 * 避免把文件里注释举例的路径也算进来。
 */
function spaStaticSection(text) {
  const start = text.indexOf('_ROUTE_PRELOAD_STYLESHEETS')
  if (start < 0) return text
  const nextDef = text.indexOf('\n_', start + 10)
  const end = text.indexOf('\ndef ', start + 10)
  const boundary = [nextDef, end].filter((n) => n > start).sort((a, b) => a - b)[0] ?? text.length
  return text.slice(start, boundary)
}

/** `/static/foo.css` → 磁盘上的 public 实体路径。 */
function toDiskPath(urlPath) {
  return join(PUBLIC_ROOT, urlPath.replace(/^\/static\//, 'static/'))
}

function main() {
  const json = process.argv.includes('--json')
  const problems = []
  const notes = []

  const spaCss = cssPaths(spaStaticSection(readIfExists(SOURCES.spaStatic)))
  const pageCss = cssPaths(readIfExists(SOURCES.pageAssets))
  const htmlCss = cssPaths(readIfExists(SOURCES.indexHtml))
  const seedRaw = readIfExists(SOURCES.seed)
  let seedCss = new Set()
  try {
    const parsed = JSON.parse(seedRaw || '{}')
    const entries = [...(parsed.files ?? []), ...(parsed.alwaysRevalidate ?? [])]
    for (const entry of entries) {
      const path = typeof entry === 'string' ? entry : entry?.path
      if (typeof path === 'string' && path.endsWith('.css')) seedCss.add(path)
    }
  } catch (error) {
    problems.push(`public-static.seed.json 无法解析：${error.message}`)
  }

  // I1 存在性
  const all = new Map()
  const addAll = (label, set) => {
    for (const path of set) {
      if (!all.has(path)) all.set(path, [])
      all.get(path).push(label)
    }
  }
  addAll('spa_static', spaCss)
  addAll('page-assets', pageCss)
  addAll('index.html', htmlCss)
  addAll('seed', seedCss)

  for (const [urlPath, owners] of all) {
    if (!existsSync(toDiskPath(urlPath))) {
      problems.push(`I1 引用了不存在的样式表 ${urlPath}（出现在 ${owners.join(' / ')}）`)
    }
  }

  // I2 预载必须被挂载
  for (const path of spaCss) {
    if (!pageCss.has(path)) {
      problems.push(`I2 spa_static 预载了 ${path}，但 PAGE_ASSETS 里没有它（预载会 404 或永久浪费）`)
    }
  }

  // I3 挂载但未预载（报告）
  for (const path of pageCss) {
    if (!spaCss.has(path)) notes.push(`I3 page-assets 挂载但 spa_static 未预载：${path}`)
  }

  if (json) {
    console.log(
      JSON.stringify(
        {
          counts: {
            spaStatic: spaCss.size,
            pageAssets: pageCss.size,
            indexHtml: htmlCss.size,
            seed: seedCss.size,
          },
          problems,
          notes,
        },
        null,
        2,
      ),
    )
  } else {
    console.log('CSS 路径真源：')
    console.log(`  spa_static 预载   ${spaCss.size}`)
    console.log(`  page-assets 挂载  ${pageCss.size}`)
    console.log(`  index.html 硬编码 ${htmlCss.size}`)
    console.log(`  seed 匿名白名单   ${seedCss.size}`)
    if (notes.length) {
      console.log('\n提示（不阻断）：')
      for (const note of notes) console.log(`  · ${note}`)
    }
    if (problems.length) {
      console.log('\n违规：')
      for (const problem of problems) console.log(`  ✗ ${problem}`)
    } else {
      console.log('\n✓ 无违规（I1 存在性 / I2 预载已被挂载）')
    }
  }

  process.exit(problems.length ? 1 : 0)
}

main()
