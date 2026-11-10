#!/usr/bin/env node
/**
 * 生成 0.8.5 → 0.8.6 的逐文件差异清单（`docs/migrations/0.8.5-to-0.8.6/01-inventory.md`）。
 *
 * 与 `inventory-085.mjs` 同口径，额外两点：
 *   - 字符串指纹先还原 `\xNN` / `\n` 转义，并丢弃反混淆残留的代码碎片
 *     （`v123[`、`](`、`:v45` 一类），否则重混淆会把每个文件都判成语义改动；
 *   - 新增「中文文案并集」通道：两版全部前端 JS/HTML 的中文串取并集再求差，
 *     抵消 `startup-*` 分包哈希改名造成的跨文件搬移。
 *
 * 用法：node ops/port/inventory-086.mjs [--root 源代码] [--out docs/migrations/0.8.5-to-0.8.6]
 */

import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cssDiff } from './css-diff.mjs'
import { classify } from './diff-classify.mjs'
import { deobfuscate } from './lib/js-deobf.mjs'

const OLD_VERSION = '0.8.5'
const NEW_VERSION = '0.8.6'

const sha = (buf) => createHash('sha256').update(buf).digest('hex')

const SKIP_DIRS = new Set(['backend', 'migrations', 'migrations_decrypted'])

function walkFiles(root) {
  const out = new Map()
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      if (name === '.DS_Store') continue
      const full = join(dir, name)
      const rel = relative(root, full)
      if (statSync(full).isDirectory()) {
        if (!SKIP_DIRS.has(rel)) visit(full)
        continue
      }
      out.set(rel, { size: statSync(full).size, hash: sha(readFileSync(full)) })
    }
  }
  visit(root)
  return out
}

const unescape = (value) =>
  value
    .replace(/\\x([0-9a-f]{2})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\u([0-9a-f]{4})/gi, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16)))
    .replace(/\\n/g, '\n')
    .replace(/\\(.)/g, '$1')

const CODE_FRAGMENT = /\bv\d+\[|\]\(|:v\d+|\bv\d+\(|_0x[0-9a-f]+/
const VERSION_QUERY = /\?v=[0-9a-z-]+/g

function readCode(file) {
  const source = readFileSync(file, 'utf8')
  if (!file.endsWith('.js')) return source
  try {
    const code = deobfuscate(source)
    return typeof code === 'string' ? code : code.code
  } catch {
    return source
  }
}

/** 去噪后的语义指纹：导出符号 + 字符串字面量 + import 目标。 */
export function jsFingerprint(text) {
  const exports = new Set()
  for (const m of text.matchAll(/export\s+(?:async\s+)?(?:function|const|let|var|class)\s+([\w$]+)/g)) exports.add(m[1])
  for (const m of text.matchAll(/export\s*\{([^}]*)\}/g)) {
    for (const part of m[1].split(',')) {
      const name = part
        .trim()
        .split(/\s+as\s+/)
        .pop()
      if (name) exports.add(name.trim())
    }
  }
  const imports = new Set()
  for (const m of text.matchAll(/(?:from|import)\s*['"]([^'"]+)['"]/g)) imports.add(m[1].replace(VERSION_QUERY, ''))
  const strings = new Set()
  for (const m of text.matchAll(/'((?:[^'\\\n]|\\.){2,160})'|"((?:[^"\\\n]|\\.){2,160})"/g)) {
    const value = unescape(m[1] ?? m[2])
      .replace(VERSION_QUERY, '')
      .trim()
    if (value.length < 2 || /^[\d.]+$/.test(value) || CODE_FRAGMENT.test(value)) continue
    strings.add(value)
  }
  return { exports, imports, strings }
}

const CJK_RUN = /[\u4e00-\u9fff][^'"`<>{}[\]()+,;\n]*/g

function cjkUnion(root) {
  const strings = new Map()
  const visit = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (statSync(full).isDirectory()) {
        if (!/^(vendor|3d-models|assets|fonts)$/.test(name)) visit(full)
      } else if (/\.(js|html)$/.test(name)) {
        for (const m of unescape(readCode(full)).matchAll(CJK_RUN)) {
          const value = m[0].trim()
          if (value.length >= 2) strings.set(value, relative(root, full))
        }
      }
    }
  }
  visit(root)
  return strings
}

const diffSet = (a, b) => [...b].filter((x) => !a.has(x))

function categoryOf(rel) {
  const top = rel.split('/')[0]
  if (rel.startsWith('frontend/static/fonts/')) return 'frontend/static/fonts'
  if (rel.startsWith('frontend/static/vendor/')) return 'frontend/static/vendor'
  return rel.includes('/') ? top : 'root'
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes}B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}K`
  return `${(bytes / 1024 / 1024).toFixed(1)}M`
}

export function buildInventory(rootDir) {
  const oldRoot = resolve(rootDir, OLD_VERSION)
  const newRoot = resolve(rootDir, NEW_VERSION)
  const backend = classify(resolve(oldRoot, 'backend/app'), resolve(newRoot, 'backend/app'))
  const migrations = classify(resolve(oldRoot, 'migrations'), resolve(newRoot, 'migrations'))

  const oldFiles = walkFiles(oldRoot)
  const newFiles = walkFiles(newRoot)
  const added = []
  const removed = []
  const changed = []
  const identical = []
  for (const key of new Set([...oldFiles.keys(), ...newFiles.keys()])) {
    const a = oldFiles.get(key)
    const b = newFiles.get(key)
    if (!a) added.push({ key, size: b.size })
    else if (!b) removed.push({ key, size: a.size })
    else if (a.hash === b.hash) identical.push(key)
    else changed.push({ key, from: a.size, to: b.size, category: categoryOf(key) })
  }

  const byCategory = new Map()
  const bump = (cat, field) => {
    if (!byCategory.has(cat)) byCategory.set(cat, { identical: 0, changed: 0, added: 0, removed: 0 })
    byCategory.get(cat)[field] += 1
  }
  for (const key of identical) bump(categoryOf(key), 'identical')
  for (const item of changed) bump(item.category, 'changed')
  for (const item of added) bump(categoryOf(item.key), 'added')
  for (const item of removed) bump(categoryOf(item.key), 'removed')

  const jsChanged = []
  for (const item of changed) {
    if (!item.key.endsWith('.js')) continue
    const before = jsFingerprint(readCode(join(oldRoot, item.key)))
    const after = jsFingerprint(readCode(join(newRoot, item.key)))
    const entry = {
      key: item.key,
      from: item.from,
      to: item.to,
      exportsAdded: diffSet(before.exports, after.exports),
      exportsRemoved: diffSet(after.exports, before.exports),
      stringsAdded: diffSet(before.strings, after.strings),
      stringsRemoved: diffSet(after.strings, before.strings),
      importsAdded: diffSet(before.imports, after.imports),
      importsRemoved: diffSet(after.imports, before.imports),
    }
    entry.semantic =
      entry.exportsAdded.length +
        entry.exportsRemoved.length +
        entry.importsAdded.length +
        entry.importsRemoved.length +
        entry.stringsAdded.length +
        entry.stringsRemoved.length >
      0
    jsChanged.push(entry)
  }

  const cssChanged = []
  for (const item of changed) {
    if (!item.key.endsWith('.css')) continue
    const result = cssDiff(readFileSync(join(oldRoot, item.key), 'utf8'), readFileSync(join(newRoot, item.key), 'utf8'))
    cssChanged.push({ key: item.key, from: item.from, to: item.to, ...result.counts })
  }

  const cjkOld = cjkUnion(join(oldRoot, 'frontend'))
  const cjkNew = cjkUnion(join(newRoot, 'frontend'))
  const cjk = {
    added: [...cjkNew].filter(([k]) => !cjkOld.has(k)).map(([text, file]) => ({ text, file })),
    removed: [...cjkOld].filter(([k]) => !cjkNew.has(k)).map(([text, file]) => ({ text, file })),
  }

  return {
    backend,
    migrations,
    added: added.sort((a, b) => a.key.localeCompare(b.key)),
    removed: removed.sort((a, b) => a.key.localeCompare(b.key)),
    changed: changed.sort((a, b) => a.key.localeCompare(b.key)),
    identical,
    byCategory,
    jsChanged: jsChanged.sort((a, b) => b.stringsAdded.length - a.stringsAdded.length),
    cssChanged: cssChanged.sort((a, b) => b.addedInTheirs - a.addedInTheirs),
    cjk,
  }
}

function renderMarkdown(inv) {
  const lines = []
  const push = (line = '') => lines.push(line)
  const cell = (text) => text.replace(/\|/g, '\\|').replace(/\n/g, ' ').slice(0, 140)
  push(`# ${OLD_VERSION} → ${NEW_VERSION} 逐文件差异清单`)
  push()
  push(
    '> 由 `node ops/port/inventory-086.mjs` 生成，勿手改。判据见 `ops/port/lib/js-deobf.mjs`、`ops/port/css-diff.mjs`、`ops/port/diff-classify.mjs`。',
  )
  push()
  push('## 1. 体量总览')
  push()
  push('| 分类 | 逐字节一致 | 字节不同 | 新增 | 删除 |')
  push('| --- | ---: | ---: | ---: | ---: |')
  for (const [cat, s] of [...inv.byCategory].sort())
    push(`| ${cat} | ${s.identical} | ${s.changed} | ${s.added} | ${s.removed} |`)
  push()

  push('## 2. 后端（按 opcode / 常量 / 对象名三通道分类）')
  push()
  push(`- 新增模块 **${inv.backend.added.length}** 个：${inv.backend.added.map((f) => `\`${f}\``).join('、')}`)
  push(`- 删除模块 **${inv.backend.removed.length}** 个`)
  push(`- 真实语义改动 **${inv.backend.changed.length}** 个`)
  push(`- 纯重加密噪声 **${inv.backend.identical.length}** 个（禁止据此改动代码）`)
  push(
    `- 数据库迁移：变化 **${inv.migrations.changed.length}** / 新增 **${inv.migrations.added.length}** / 一致 **${inv.migrations.identical.length}**`,
  )
  push()
  push('| 文件 | opcode Δ | 常量 Δ | 对象名 Δ | 新增常量（节选） | 删除常量（节选） |')
  push('| --- | ---: | ---: | ---: | --- | --- |')
  for (const c of inv.backend.changed) {
    const sample = (list) =>
      cell(
        [...list]
          .filter((x) => x.length < 60)
          .slice(0, 6)
          .map((x) => `\`${x}\``)
          .join(' '),
      )
    push(
      `| \`${c.file}\` | ${c.opcodeDelta} | ${c.constDelta} | ${c.objectDelta} | ${sample(c.strings.added)} | ${sample(c.strings.removed)} |`,
    )
  }
  push()

  push('## 3. 新增文件')
  push()
  for (const item of inv.added) push(`- \`${item.key}\` (${fmt(item.size)})`)
  push()
  push('## 4. 删除文件')
  push()
  for (const item of inv.removed) push(`- \`${item.key}\` (${fmt(item.size)})`)
  push()

  push('## 5. 非 JS/CSS 资源的字节变化')
  push()
  for (const item of inv.changed) {
    if (/\.(js|css)$/.test(item.key)) continue
    push(`- \`${item.key}\` ${fmt(item.from)} → ${fmt(item.to)}`)
  }
  push()

  push('## 6. JS：去噪后的语义差异（按新增字符串数排序）')
  push()
  push('| 文件 | 字节 | 新增导出 | 删除导出 | 新增串 | 删除串 | import 增/删 |')
  push('| --- | ---: | ---: | ---: | ---: | ---: | ---: |')
  for (const item of inv.jsChanged) {
    if (!item.semantic) continue
    push(
      `| \`${item.key}\` | ${fmt(item.from)} → ${fmt(item.to)} | ${item.exportsAdded.length} | ${item.exportsRemoved.length} | ${item.stringsAdded.length} | ${item.stringsRemoved.length} | ${item.importsAdded.length}/${item.importsRemoved.length} |`,
    )
  }
  push()
  push(`另有 ${inv.jsChanged.filter((x) => !x.semantic).length} 个 JS 字节不同但去噪指纹一致（version-only）。`)
  push()
  push(
    '> 「新增串 / 删除串」仍含重混淆残留（变量重排后拼接位置不同），只作为排序依据；功能判定以第 8 节中文文案并集与 `02-omission-audit.md` 为准。',
  )
  push()

  push('## 7. 导出与 import 的增删明细')
  push()
  for (const item of inv.jsChanged) {
    const parts = [
      ['新增导出', item.exportsAdded],
      ['删除导出', item.exportsRemoved],
      ['新增 import', item.importsAdded.filter((x) => !CODE_FRAGMENT.test(x))],
      ['删除 import', item.importsRemoved.filter((x) => !CODE_FRAGMENT.test(x))],
    ].filter(([, list]) => list.length)
    if (!parts.length) continue
    push(`### \`${item.key}\``)
    for (const [label, list] of parts) push(`- ${label}：${list.map((x) => `\`${x}\``).join(', ')}`)
    push()
  }

  push('## 8. 中文文案并集差异（跨文件，抵消分包改名）')
  push()
  push(`新增 **${inv.cjk.added.length}** 条，删除 **${inv.cjk.removed.length}** 条。`)
  push()
  push('| 方向 | 文件 | 文案 |')
  push('| --- | --- | --- |')
  for (const { text, file } of inv.cjk.added) push(`| + | \`${file}\` | ${cell(text)} |`)
  for (const { text, file } of inv.cjk.removed) push(`| − | \`${file}\` | ${cell(text)} |`)
  push()

  push('## 9. CSS：选择器级差异')
  push()
  push('| 文件 | 上游新增 | 上游删除 | 上游改声明 |')
  push('| --- | ---: | ---: | ---: |')
  for (const item of inv.cssChanged)
    push(`| \`${item.key}\` | ${item.addedInTheirs} | ${item.removedInTheirs} | ${item.changedInTheirs} |`)
  push()
  return `${lines.join('\n')}\n`
}

/** 人工判定表：上游文件 → 批次 / 判定。未列出的语义 JS 视为重混淆噪声（中文并集与本项目核对无差异）。 */
const DISPOSITION = new Map([
  ['frontend/index.html', 'B2 字体区与对话框；B5 图标、`#ui-pack-open`、`#popup-select`'],
  ['frontend/3d-studio.html', 'B5 工具按钮图标'],
  ['frontend/display.html', 'B6 iPad PWA'],
  ['frontend/pair.html', '不适用（本项目无配对页）'],
  ['frontend/login.html', '不适用（官网链接，本项目登录页无此链接）'],
  ['frontend/setup.html', 'version-only'],
  ['frontend/license.html', 'version-only'],
  ['frontend/resource-version.json', 'version-only'],
  ['VERSION', 'version-only（B7 `set-version`）'],
  ['release-manifest.json', 'version-only'],
  ['sbom.cdx.json', 'version-only'],
  ['frontend/static/home.js', 'B2 字体设置接线；B3 删除音效开关；B5 图标'],
  ['frontend/static/renderer/renderer.js', 'B2 `createDashboardFonts`；B5 `createUiIcon`'],
  ['frontend/static/display.js', 'B3 删除 `sound-effects` import'],
  ['frontend/static/3d-studio/studio-normalization.js', 'B4 `itemMinimumElevation`'],
  ['frontend/static/3d-studio/studio-app.js', 'B2 字体加载；B4 负高度 min/title；B5 门线色'],
  ['frontend/static/3d-studio/studio-plan-drawing.js', 'B2 `dashboardCanvasFont`'],
  ['frontend/static/3d-studio/studio-television-poster.js', 'B2 `dashboardCanvasFont`'],
  ['frontend/static/3d-studio/studio-scene-style.js', 'B5 `WARM_WOOD_STYLE.planLabelText/Line`'],
  ['frontend/modules/interaction3d/light-range-editor.js', 'B5 区域灯标记描边色'],
  ['frontend/modules/interaction3d/security-editor.js', 'B5 路线点序号色'],
  ['frontend/modules/interaction3d/stage.js', 'B5 区域灯标记色（与 light-range-editor 同源）；弹窗焦点'],
  ['frontend/static/backup-restore.js', '不适用（删去“中控设备请重新配对”）'],
  ['frontend/static/renderer/renderer.css', 'B2 `@import`；B5 情景外框、遮罩属性、图标尺寸'],
  ['frontend/static/app.css', 'B3 删除音效规则；B5 图标与 `ui-pack`'],
  ['frontend/static/3d-studio/studio.css', 'B5 工具按钮图标'],
  ['frontend/static/display.css', 'B6 `ipad-pwa-display`'],
  ['frontend/modules/interaction3d/stage.css', 'B5 `.i3d-speaker-media-dialog{outline:none}`'],
  ['frontend/static/vendor/three/0.182.0/OrbitControls.js', 'B7 归一化核对'],
])

function renderAppendix(inv) {
  const lines = [
    `# ${OLD_VERSION} → ${NEW_VERSION} 附录：逐文件判定`,
    '',
    '> 由 `node ops/port/inventory-086.mjs` 生成，勿手改。判定表见脚本内 `DISPOSITION`。',
    '',
    '## A. 字节不同文件',
    '',
    '| # | 文件 | 字节 | 指纹 | 判定 / 批次 |',
    '| ---: | --- | --- | --- | --- |',
  ]
  const js = new Map(inv.jsChanged.map((item) => [item.key, item]))
  let index = 0
  for (const item of inv.changed) {
    index += 1
    const fingerprint = item.key.endsWith('.js') ? (js.get(item.key)?.semantic ? 'semantic' : 'version-only') : 'bytes'
    let disposition = DISPOSITION.get(item.key)
    if (!disposition) {
      if (fingerprint === 'version-only' || /\/vendor\//.test(item.key)) disposition = 'version-only，不动'
      else if (item.key.endsWith('.css')) disposition = '`?v=` 噪声，不动'
      else disposition = '重混淆噪声（中文并集与本项目核对无差异），不动'
    }
    lines.push(`| ${index} | \`${item.key}\` | ${item.from} → ${item.to} | ${fingerprint} | ${disposition} |`)
  }
  lines.push('', '## B. 新增文件', '', '| 文件 | 判定 / 批次 |', '| --- | --- |')
  for (const item of inv.added) {
    const key = item.key
    const disposition = key.includes('/fonts/')
      ? 'B1 复制到 `homeos/assets-default/fonts/`'
      : key.includes('dashboard-font')
        ? 'B2 改写为 TS / 迁移 CSS'
        : key.includes('ui-icons')
          ? 'B5 改写为 TS / 迁移 CSS'
          : key.includes('display-ipad-pwa')
            ? 'B6 并入 display 启动流程'
            : '分包哈希改名，不动'
    lines.push(`| \`${key}\` | ${disposition} |`)
  }
  lines.push('', '## C. 删除文件', '', '| 文件 | 判定 / 批次 |', '| --- | --- |')
  for (const item of inv.removed) {
    const disposition = /sound-effects|audio\//.test(item.key) ? 'B3 删除音效' : '分包哈希改名，不动'
    lines.push(`| \`${item.key}\` | ${disposition} |`)
  }
  lines.push('', '## D. 后端模块', '', '| 模块 | 类别 | 判定 / 批次 |', '| --- | --- | --- |')
  const backendDisposition = {
    'fonts.py': 'B1 → `domains/fonts/`',
    'api/fonts.py': 'B1 → `api/fonts.py`',
    'display_credentials.py': '不适用（配对）',
    'main.py': 'B1 字体 MIME；配对部分不适用',
    'dependencies.py': 'B1 `viewer_asset_ids` 含 `font:`；配对部分不适用',
    'panel/schema.py': 'B1 `DashboardFonts`',
    'panel/asset_refs.py': 'B1 `font:` 引用 + 文案',
    'api/assets.py': 'B1 `FontStore` 挂到素材目录',
    'api/ha.py': '不适用（配对）',
    'api/displays.py': '不适用（配对）',
    'schemas.py': '不适用（配对）',
    'security.py': '不适用（配对 cookie 名）',
    'modules/interaction3d/api.py': '`stage.css?v=` 噪声（语义见 B5 焦点）',
  }
  for (const file of inv.backend.added) lines.push(`| \`${file}\` | 新增 | ${backendDisposition[file] ?? '—'} |`)
  for (const c of inv.backend.changed) lines.push(`| \`${c.file}\` | 语义 | ${backendDisposition[c.file] ?? '—'} |`)
  lines.push(`| 其余 ${inv.backend.identical.length} 个 | 噪声 | 不动 |`, '')
  return `${lines.join('\n')}\n`
}

function main() {
  const argv = process.argv.slice(2)
  const arg = (name, fallback) => {
    const i = argv.indexOf(name)
    return i >= 0 ? argv[i + 1] : fallback
  }
  const root = arg('--root', '源代码')
  const outDir = arg('--out', `docs/migrations/${OLD_VERSION}-to-${NEW_VERSION}`)
  if (!existsSync(resolve(root, NEW_VERSION))) {
    console.error(`missing ${resolve(root, NEW_VERSION)}`)
    process.exit(2)
  }
  const inventory = buildInventory(root)
  mkdirSync(outDir, { recursive: true })
  const json = JSON.stringify(
    inventory,
    (_, value) => (value instanceof Map ? Object.fromEntries(value) : value instanceof Set ? [...value] : value),
    2,
  )
  writeFileSync(join(outDir, 'inventory.json'), `${json}\n`)
  writeFileSync(join(outDir, '01-inventory.md'), renderMarkdown(inventory))
  writeFileSync(join(outDir, '03-appendix-files.md'), renderAppendix(inventory))
  console.log(`wrote ${join(outDir, '01-inventory.md')}`)
  console.log(
    `added=${inventory.added.length} removed=${inventory.removed.length} changed=${inventory.changed.length} identical=${inventory.identical.length} cjk+=${inventory.cjk.added.length} cjk-=${inventory.cjk.removed.length}`,
  )
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main()
