#!/usr/bin/env node
/**
 * UI surface 清单：从路由表、设置导航结构、admin 分区与 Studio 视图汇总出需要审计的界面清单，
 * 并为每个 surface 关联其视图组件与候选样式表，作为分批改动的 checklist。
 *
 * 用法：`node ops/ui-audit/surface-inventory.mjs [--json]`
 * 产出：reports/surfaces.json
 */
import fs from 'node:fs'
import path from 'node:path'
import { walk, CODE_EXTS, STYLE_EXTS, rel, writeJson } from './lib/scan.mjs'
import { REPO_ROOT, OUT_DIR } from './targets.mjs'

const asJson = process.argv.includes('--json')
const HOMeos = path.join(REPO_ROOT, 'homeos/frontend')
const Store = path.join(REPO_ROOT, 'homeos-store/frontend')

const allCss = [
  ...walk(path.join(HOMeos, 'src'), STYLE_EXTS),
  ...walk(path.join(HOMeos, 'public/static'), STYLE_EXTS),
  ...walk(path.join(Store, 'src'), STYLE_EXTS),
  ...walk(path.join(Store, 'public/static'), STYLE_EXTS),
].map((f) => ({ file: f, rel: rel(REPO_ROOT, f) }))

/** 依据关键词匹配候选样式表（按文件名/路径包含匹配）。 */
function candidateStyles(keywords) {
  const out = new Set()
  for (const kw of keywords) {
    if (!kw) continue
    const k = kw.toLowerCase()
    for (const { file, rel: r } of allCss) {
      if (r.toLowerCase().includes(k)) out.add(r)
    }
  }
  return [...out]
}

const surfaces = []

// ── 1. homeos 路由（parse router/index.ts） ──
const homeRouter = fs.readFileSync(path.join(HOMeos, 'src/router/index.ts'), 'utf8')
const routeRe = /path:\s*'([^']*)'[\s\S]{0,200}?name:\s*'([^']+)'/g
const KIND = (name) => {
  if (['login', 'register', 'activation', 'license-recovery'].includes(name)) return 'auth'
  if (['dashboard', 'homeos', 'display'].includes(name)) return 'shell'
  if (['studio', 'studio-editor', 'stage'].includes(name)) return 'studio'
  if (name === 'settings') return 'settings'
  if (name === 'security') return 'security'
  if (name === 'notifications') return 'notifications'
  if (name === 'events' || name === 'mode-logs') return 'events'
  if (name === 'earthquake-history') return 'events'
  if (name === 'devices' || name === 'device-detail') return 'devices'
  if (name.startsWith('embed')) return 'embed'
  return 'other'
}
for (const m of homeRouter.matchAll(routeRe)) {
  const p = m[1]
  const name = m[2]
  if (p.includes('pathMatch')) continue
  surfaces.push({
    id: `homeos:${name}`,
    project: 'homeos',
    kind: KIND(name),
    route: p.startsWith('/') ? p : `/${p}`,
    view: name,
    styles: candidateStyles([name.replace(/-/g, '')]),
  })
}

// ── 2. homeos 设置 Tab（parse NAV_STRUCTURE） ──
const navUtil = fs.readFileSync(
  path.join(HOMeos, 'src/shared/utils/registry/settings-nav.util.ts'),
  'utf8',
)
const navBlock = navUtil.match(/NAV_STRUCTURE\s*=\s*\[([\s\S]*?)\n\]/)
if (navBlock) {
  for (const m of navBlock[1].matchAll(/\{\s*id:\s*'([^']+)',\s*tabs:\s*\[([\s\S]*?)\]/g)) {
    const group = m[1]
    const tabs = [...m[2].matchAll(/'([^']+)'/g)].map((x) => x[1])
    for (const tab of tabs) {
      surfaces.push({
        id: `homeos:settings:${tab}`,
        project: 'homeos',
        kind: 'settings',
        route: `/settings?tab=${tab}`,
        group,
        view: tab,
        styles: candidateStyles([tab, tab.replace(/-/g, ''), `settings`]),
      })
    }
  }
}

// ── 3. store 路由 ──
const storeRouter = fs.readFileSync(path.join(Store, 'src/router/index.ts'), 'utf8')
for (const m of storeRouter.matchAll(/path:\s*"([^"]*)"[\s\S]{0,160}?name:\s*"([^"]+)"/g)) {
  const name = m[2]
  const kind = name === 'admin' ? 'admin' : name === 'setup' ? 'store-setup' : 'store'
  surfaces.push({
    id: `store:${name}`,
    project: 'store',
    kind,
    route: m[1].startsWith('/') ? m[1] : `/${m[1]}`,
    view: name,
    styles: candidateStyles([name, kind]),
  })
}

// ── 4. store admin 分区（parse AdminLayout tabs） ──
const adminLayout = fs.readFileSync(path.join(Store, 'src/views/admin/AdminLayout.vue'), 'utf8')
for (const m of adminLayout.matchAll(/key:\s*"([^"]+)"[\s\S]{0,120}?label:\s*"([^"]+)"/g)) {
  surfaces.push({
    id: `store:admin:${m[1]}`,
    project: 'store',
    kind: 'admin',
    route: `/admin/${m[1]}`,
    view: m[1],
    label: m[2],
    styles: candidateStyles([m[1], 'admin']),
  })
}

// ── 5. store admin 子页（views/admin/*.vue） ──
for (const f of fs.readdirSync(path.join(Store, 'src/views/admin'), { withFileTypes: true })) {
  if (!f.isFile() || !f.name.endsWith('.vue')) continue
  const name = f.name.replace('.vue', '')
  if (['AdminLayout'].includes(name)) continue
  if (surfaces.some((s) => s.id === `store:admin:${name}`)) continue
  surfaces.push({
    id: `store:admin-view:${name}`,
    project: 'store',
    kind: 'admin',
    route: `(admin pane) ${name}`,
    view: name,
    styles: candidateStyles([name, 'admin']),
  })
}

// ── 6. homeos 共享组件面（壳/widgets/弹层/entities） ──
const sharedDirs = [
  ['homeos', path.join(HOMeos, 'src/components'), 'components'],
  ['homeos', path.join(HOMeos, 'src/layouts'), 'layouts'],
  ['homeos', path.join(HOMeos, 'src/studio'), 'studio'],
]
for (const [project, dir, kind] of sharedDirs) {
  if (!fs.existsSync(dir)) continue
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue
    surfaces.push({
      id: `homeos:${kind}:${entry.name}`,
      project,
      kind: `shared-${kind}`,
      route: `(${kind}) ${entry.name}`,
      view: entry.name,
      styles: candidateStyles([entry.name]),
    })
  }
}

const result = {
  generatedAt: new Date().toISOString(),
  total: surfaces.length,
  byKind: surfaces.reduce((acc, s) => {
    acc[s.kind] = (acc[s.kind] || 0) + 1
    return acc
  }, {}),
  byProject: surfaces.reduce((acc, s) => {
    acc[s.project] = (acc[s.project] || 0) + 1
    return acc
  }, {}),
  surfaces,
}

writeJson(`${OUT_DIR}/surfaces.json`, result)
if (asJson) process.stdout.write(`${JSON.stringify(result, null, 2)}\n`)
else {
  console.log(`共 ${result.total} 个 surface`)
  console.log('按项目：', result.byProject)
  console.log('按类型：', result.byKind)
}
