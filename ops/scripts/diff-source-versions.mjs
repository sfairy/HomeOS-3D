#!/usr/bin/env node
/**
 * 版本快照差异对比器 —— 面向 `源代码/0.7.x` 这类「逆向恢复源码快照」的机器化对比。
 *
 * 为什么需要它
 * ------------
 * `源代码/<版本>` 不是原始源码：后端只有 Pyarmor 静态反混淆产物（`*.1shot.seq` 加密字节码、
 * `*.1shot.das` 反汇编、`*.1shot.cdc.py` 反编译），前端只有 obfuscator.io 混淆压缩后的单行
 * bundle。于是「两个版本到底差了什么」读不出代码，只能靠三条机器可算的信号：
 *
 * 1. **文件级清单**：谁新增、谁删除、谁被改写（先比字节数，相等再比 sha256）；
 * 2. **用户可见字符串差集**：前端中文字符串是混淆器唯一没抹掉的可读信号，等于「用户会看到的
 *    变化」；噪音（混淆器字符串表碎片）按「连续汉字 ≥ 2 且不含乱码区段」过滤；
 * 3. **后端常量差集**：`.das` 的字符串常量能把「只是 Pyarmor 混淆地址/时间戳变了」和
 *    「真的动了逻辑或文案」区分开 —— 只有后者才是发布说明里该写的东西。
 *
 * 用法
 * ----
 *   node ops/scripts/diff-source-versions.mjs
 *       默认对比 `源代码/0.7.5` → `源代码/0.7.6`，打印摘要
 *   node ops/scripts/diff-source-versions.mjs --old=源代码/0.7.4 --new=源代码/0.7.5
 *       换一对快照（相对路径按仓库根解析）
 *   node ops/scripts/diff-source-versions.mjs --json
 *       把完整结果输出为 JSON（机器消费 / 入档）
 *   node ops/scripts/diff-source-versions.mjs --markdown=源代码/DIFF-0.7.5-0.7.6.appendix.md
 *       把「可机器推导」的报告章节写成 markdown（概览 / 清单 / 模型 / 字符串 / 后端语义）
 *
 * 退出码：0 正常；2 参数或目录不可用。
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

/** 快照里唯一需要跳过的名字：macOS 的目录元数据，不是内容差异。 */
const SKIP_NAMES = new Set(['.DS_Store'])

/** Pyarmor 三件套后缀（`_seq` 加密字节码 / `_das` 反汇编 / `_cdc.py` 反编译）。 */
const ARTIFACT_RE = /\.1shot\.(?:cdc\.py|das|seq)$/

/** Pyarmor 运行时调用名：每次重新混淆都会变，是「壳噪音」而不是语义变化。 */
const PYARMOR_RE = /__pyarmor_(?:enter|exit|assert)_\d+__/

const NUMERIC_RE = /^[\d.\-+ ]*$/

/** 连续汉字 ≥ 2 才算「可能的人话」——单个汉字基本是混淆器字符串表的碎片。 */
const CJK_RUN_RE = /[\u4e00-\u9fff]{2,}/

/**
 * 乱码区段：拉丁补充 / 西里尔 / 假名 / 谚文 / 替换字符。
 *
 * 混淆器的字符串表按字节切分后，碎片常常解码成这些区段的字符（如 `伊_`、`匂뙦tZ`），
 * 去掉它们之后剩下的中文列表才基本等于「真实的界面文案」。
 */
const MOJIBAKE_RE = /[\u00a0-\u00ff\u0400-\u04ff\u3040-\u30ff\uac00-\ud7af\ufffd]/

/** 混淆器的标识符碎片（`8GGJfrO`、`ZGzMme` 这类）：全小写字母数字且长度 5..13。 */
const OBFUSCATED_TOKEN_RE = /^[0-9a-z]{5,13}$/

/** 单文件读取上限：快照里最大的文本产物不到 1MB，8MB 只是防止误读二进制的保险丝。 */
const MAX_TEXT_BYTES = 8 * 1024 * 1024

const DEFAULTS = { old: '源代码/0.7.5', new: '源代码/0.7.6' }

/** 只支持 `--key=value` 与 `--flag`；未识别的参数直接忽略（CLI 工具，不是严格解析器）。 */
function parseArgs(argv) {
  const flags = new Map()
  for (const arg of argv) {
    const match = /^--([a-z-]+)(?:=(.*))?$/.exec(arg)
    if (match) flags.set(match[1], match[2] ?? 'true')
  }
  return flags
}

/** 相对路径按仓库根解析 —— 脚本从任何 cwd 调用都指向同一对快照。 */
function resolveUnderRoot(target) {
  return path.isAbsolute(target) ? target : path.resolve(ROOT, target)
}

function listFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_NAMES.has(entry.name)) continue
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) listFiles(full, out)
    else out.push(full)
  }
  return out
}

/** 目录 → `rel(posix) -> { rel, abs, size }`。 */
function indexTree(dir) {
  const index = new Map()
  for (const abs of listFiles(dir)) {
    const rel = path.relative(dir, abs).split(path.sep).join('/')
    index.set(rel, { rel, abs, size: fs.statSync(abs).size })
  }
  return index
}

function sha256(file) {
  return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
}

function compareTrees(oldDir, newDir) {
  const oldIndex = indexTree(oldDir)
  const newIndex = indexTree(newDir)
  const added = []
  const removed = []
  const modified = []
  for (const [rel, before] of oldIndex) {
    const after = newIndex.get(rel)
    if (!after) {
      removed.push(rel)
      continue
    }
    // 先比字节数，相等才落 sha256 —— 快照里绝大多数文件是完全一致的，这一步省掉九成哈希。
    if (before.size !== after.size || sha256(before.abs) !== sha256(after.abs)) {
      modified.push({ rel, oldSize: before.size, newSize: after.size, delta: after.size - before.size })
    }
  }
  for (const rel of newIndex.keys()) if (!oldIndex.has(rel)) added.push(rel)
  const byPath = (a, b) => a.localeCompare(b)
  added.sort(byPath)
  removed.sort(byPath)
  modified.sort((a, b) => byPath(a.rel, b.rel))
  return { oldIndex, newIndex, added, removed, modified }
}

/** 差异条目按产物类型归类：报告里的所有统计都建立在这一层分类上。 */
function classify(rel) {
  if (rel.endsWith('.glb')) return 'model'
  if (ARTIFACT_RE.test(rel)) return 'backend-artifact'
  if (/^backend\/.*\.py$/.test(rel)) return 'backend-py'
  if (rel.endsWith('.js')) return 'frontend-js'
  if (rel.endsWith('.html')) return 'frontend-html'
  if (rel.endsWith('.css')) return 'frontend-css'
  if (rel.endsWith('.so')) return 'binary'
  if (rel === 'VERSION' || rel.endsWith('.json')) return 'manifest'
  return 'other'
}

function groupByCategory(entries) {
  const out = {}
  for (const rel of entries) {
    const category = classify(rel)
    if (!out[category]) out[category] = []
    out[category].push(rel)
  }
  return out
}

/** 反混淆产物 → 原始模块路径（`a/b.py.1shot.das` → `a/b.py`）。 */
function backendModule(rel) {
  return rel.replace(ARTIFACT_RE, '')
}

function extractQuoted(text) {
  const out = new Set()
  for (const match of text.matchAll(/'([^'\n]{1,300})'/g)) out.add(match[1])
  return out
}

/**
 * 取模块的字符串常量集合：优先 `.das`（反汇编最完整），退回 `.cdc.py`（反编译可能截断）。
 * 找不到则返回 null —— 调用方据此跳过「只存在于一侧」的模块。
 */
function constantsFor(moduleRel, index) {
  for (const suffix of ['.1shot.das', '.1shot.cdc.py']) {
    const file = index.get(moduleRel + suffix)
    if (file) return extractQuoted(fs.readFileSync(file.abs, 'utf8'))
  }
  return null
}

/** 壳噪音：Pyarmor 调用名、`<COAddr>` 字节串、纯数字、空串。 */
function isShellNoise(value) {
  return (
    PYARMOR_RE.test(value) ||
    value.includes('pyarmor') ||
    value.startsWith('<COAddr>') ||
    NUMERIC_RE.test(value) ||
    value.length < 2
  )
}

/**
 * 后端逐模块常量差集。
 *
 * 返回里 `pyarmorOnly` 为 true 的模块是「重新混淆导致的壳抖动」，可安全忽略；
 * 其余模块才按语义变化对待（发布说明的依据）。
 */
function diffBackend(oldIndex, newIndex) {
  const modules = new Set()
  for (const rel of oldIndex.keys()) if (ARTIFACT_RE.test(rel)) modules.add(backendModule(rel))
  const changed = []
  let pyarmorOnly = 0
  for (const moduleRel of [...modules].sort()) {
    const before = constantsFor(moduleRel, oldIndex)
    const after = constantsFor(moduleRel, newIndex)
    if (!before || !after) {
      pyarmorOnly += 1
      continue
    }
    const added = [...after].filter((value) => !before.has(value) && !isShellNoise(value)).sort()
    const removed = [...before].filter((value) => !after.has(value) && !isShellNoise(value)).sort()
    if (added.length === 0 && removed.length === 0) {
      pyarmorOnly += 1
      continue
    }
    changed.push({ module: moduleRel, added, removed })
  }
  changed.sort((a, b) => b.added.length + b.removed.length - (a.added.length + a.removed.length))
  const semanticModules = new Set(changed.map((item) => item.module))
  return {
    moduleCount: modules.size,
    pyarmorOnly,
    semanticCount: semanticModules.size,
    semanticModules: [...semanticModules].sort(),
    changed,
  }
}

/**
 * 前端中文字符串集合：混淆器抹掉了标识符与结构，但用户可见文案必须留着。
 * 只读 `.js`/`.html`（界面文案的载体），不读 `.glb`/`.das`。
 */
function frontendStrings(index) {
  const out = new Set()
  for (const file of index.values()) {
    if (!file.rel.endsWith('.js') && !file.rel.endsWith('.html')) continue
    if (file.size > MAX_TEXT_BYTES) continue
    const text = fs.readFileSync(file.abs, 'utf8')
    for (const match of text.matchAll(/'([^'\n]{2,200})'|"([^"\n]{2,200})"/g)) {
      const value = (match[1] ?? match[2]).replace(/\\x20/g, ' ')
      if (!CJK_RUN_RE.test(value)) continue
      if (MOJIBAKE_RE.test(value) || OBFUSCATED_TOKEN_RE.test(value)) continue
      out.add(value)
    }
  }
  return out
}

/** 模型清单：新增按「去 `-lite` 后的款名」去重；改写按字节增减排序（体积即变更强度代理）。 */
function modelReport(added, modified) {
  const newFiles = added.filter((rel) => rel.endsWith('.glb'))
  const names = new Set(newFiles.map((rel) => path.basename(rel).replace(/-lite\.glb$/, '.glb')))
  const deltas = modified
    .filter((item) => item.rel.endsWith('.glb'))
    .map((item) => ({
      name: path.basename(item.rel),
      oldSize: item.oldSize,
      newSize: item.newSize,
      delta: item.delta,
    }))
    .sort((a, b) => b.delta - a.delta)
  return {
    newFileCount: newFiles.length,
    newModelCount: names.size,
    newModels: [...names].sort(),
    modifiedFileCount: deltas.length,
    deltas,
  }
}

function collectReport(oldDir, newDir) {
  const { oldIndex, newIndex, added, removed, modified } = compareTrees(oldDir, newDir)
  const oldStrings = frontendStrings(oldIndex)
  const newStrings = frontendStrings(newIndex)
  return {
    old: { dir: path.relative(ROOT, oldDir) || oldDir, fileCount: oldIndex.size },
    new: { dir: path.relative(ROOT, newDir) || newDir, fileCount: newIndex.size },
    summary: {
      diffEntries: added.length + removed.length + modified.length,
      added: added.length,
      removed: removed.length,
      modified: modified.length,
    },
    files: {
      added: groupByCategory(added),
      removed: groupByCategory(removed),
      modified: groupByCategory(modified.map((item) => item.rel)),
    },
    modifiedFiles: modified,
    models: modelReport(added, modified),
    frontend: {
      oldStringCount: oldStrings.size,
      newStringCount: newStrings.size,
      newStrings: [...newStrings].filter((value) => !oldStrings.has(value)).sort(),
      removedStrings: [...oldStrings].filter((value) => !newStrings.has(value)).sort(),
    },
    backend: diffBackend(oldIndex, newIndex),
  }
}

// ── markdown 渲染（report 的可机器推导部分） ─────────────────────────────────

const CATEGORY_LABEL = {
  'backend-artifact': '后端反混淆产物',
  'backend-py': '后端明文 py',
  'frontend-js': '前端 JS',
  'frontend-html': '前端 HTML',
  'frontend-css': '前端 CSS',
  model: '3D 模型',
  manifest: '清单 / 元数据',
  binary: '二进制',
  other: '其它',
}

function renderCategoryTable(grouped) {
  const keys = Object.keys(grouped).sort()
  if (keys.length === 0) return '_无_\n'
  const lines = ['| 类别 | 数量 |', '| --- | --- |']
  for (const key of keys) lines.push(`| ${CATEGORY_LABEL[key] ?? key} | ${grouped[key].length} |`)
  return `${lines.join('\n')}\n`
}

function renderList(items, code = true) {
  if (items.length === 0) return '_无_\n'
  return `${items.map((item) => (code ? `- \`${item}\`` : `- ${item}`)).join('\n')}\n`
}

function renderFilesSection(title, grouped) {
  const keys = Object.keys(grouped).sort()
  let out = `### ${title}\n\n`
  out += renderCategoryTable(grouped)
  for (const key of keys) {
    out += `\n#### ${CATEGORY_LABEL[key] ?? key}（${grouped[key].length}）\n\n`
    out += renderList(grouped[key])
  }
  return out
}

function renderMarkdown(report) {
  const { summary, models, frontend, backend } = report
  let out = ''
  out += `## 机器推导清单\n\n`
  out += `> 本节由 \`ops/scripts/diff-source-versions.mjs\` 生成，**只覆盖下面这一段**（正文 §0–§8 为人工维护）：\n`
  out += `> \`node ops/scripts/diff-source-versions.mjs --markdown=<临时文件>\`，生成后替换本段即可。\n\n`
  out += `对比：\`${report.old.dir}\`（${report.old.fileCount} 文件） → \`${report.new.dir}\`（${report.new.fileCount} 文件）\n\n`
  out += `差异条目 **${summary.diffEntries}** = 修改 ${summary.modified} + 新增 ${summary.added} + 删除 ${summary.removed}\n\n`
  out += renderFilesSection('新增文件', report.files.added)
  out += `\n`
  out += renderFilesSection('删除文件', report.files.removed)
  out += `\n`
  out += renderFilesSection('修改文件', report.files.modified)
  out += `\n`
  out += `### 模型清单\n\n`
  out += `- 新增文件 ${models.newFileCount} 个 = **${models.newModelCount} 款**（完整 + \`-lite\`）\n`
  out += `- 改写文件 ${models.modifiedFileCount} 个（按字节增减排序，体积即变更强度代理）\n\n`
  out += `#### 新增款名（${models.newModelCount}）\n\n`
  out += renderList(models.newModels)
  out += `\n#### 改写模型字节增减\n\n`
  out += `| 模型 | 旧 | 新 | 增量 |\n| --- | ---: | ---: | ---: |\n`
  for (const item of models.deltas) {
    out += `| \`${item.name}\` | ${item.oldSize} | ${item.newSize} | ${item.delta > 0 ? '+' : ''}${item.delta} |\n`
  }
  out += `\n### 前端中文字符串差集\n\n`
  out += `0.7.5 共 ${frontend.oldStringCount} 条，0.7.6 共 ${frontend.newStringCount} 条。\n\n`
  out += `#### 新增（${frontend.newStrings.length}）\n\n`
  out += renderList(frontend.newStrings, false)
  out += `\n#### 消失（${frontend.removedStrings.length}）\n\n`
  out += renderList(frontend.removedStrings, false)
  out += `\n### 后端语义差异（逐模块常量差集）\n\n`
  out += `反混淆产物 ${backend.moduleCount} 个模块中，\`pyarmorOnly\`（仅壳抖动）**${backend.pyarmorOnly}** 个，`
  out += `语义变化 **${backend.semanticCount}** 个。\n\n`
  for (const item of backend.changed) {
    out += `#### \`${item.module}\`（+${item.added.length} / -${item.removed.length}）\n\n`
    if (item.added.length) out += `新增常量：\n\n${renderList(item.added, false)}\n`
    if (item.removed.length) out += `消失常量：\n\n${renderList(item.removed, false)}\n`
  }
  return out
}

// ── CLI ─────────────────────────────────────────────────────────────────────

function main() {
  const flags = parseArgs(process.argv.slice(2))
  const oldDir = resolveUnderRoot(flags.get('old') ?? DEFAULTS.old)
  const newDir = resolveUnderRoot(flags.get('new') ?? DEFAULTS.new)
  for (const dir of [oldDir, newDir]) {
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
      console.error(`目录不可用：${dir}`)
      process.exit(2)
    }
  }
  const report = collectReport(oldDir, newDir)

  const markdownTarget = flags.get('markdown')
  if (markdownTarget && markdownTarget !== 'true') {
    const outFile = resolveUnderRoot(markdownTarget)
    fs.mkdirSync(path.dirname(outFile), { recursive: true })
    fs.writeFileSync(outFile, renderMarkdown(report))
    console.error(`已写入 markdown：${outFile}`)
  }

  if (flags.get('json') === 'true') {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
    return
  }

  const { summary, models, frontend, backend } = report
  console.log(`对比 ${report.old.dir} → ${report.new.dir}`)
  console.log(`文件：${report.old.fileCount} → ${report.new.fileCount}`)
  console.log(`差异条目：${summary.diffEntries} = 修改 ${summary.modified} + 新增 ${summary.added} + 删除 ${summary.removed}`)
  console.log(`模型：新增 ${models.newFileCount} 个文件 / ${models.newModelCount} 款，改写 ${models.modifiedFileCount} 个`)
  console.log(
    `前端中文字符串：${frontend.oldStringCount} → ${frontend.newStringCount}` +
      `（新增 ${frontend.newStrings.length} / 消失 ${frontend.removedStrings.length}）`,
  )
  console.log(
    `后端模块：${backend.moduleCount} 个，语义变化 ${backend.semanticCount} 个` +
      `（仅壳抖动 ${backend.pyarmorOnly} 个）`,
  )
  console.log('语义变化模块：')
  for (const item of backend.changed) {
    console.log(`  - ${item.module}  (+${item.added.length} / -${item.removed.length})`)
  }
}

main()
