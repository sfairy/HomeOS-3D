#!/usr/bin/env bun
/**
 * 产物三份：
 * 1. `src/studio/app/3d-studio/loaders/external-models/model-file-names.generated.ts`
 *    —— 模型 id → 磁盘文件名主干（中文），运行时 `modelAssetUrl()` 用它拼 URL；
 * 2. `scripts/models/specs/model-file-names.json` —— 同一张表的机读版，给 Python / 其它
 *    非 TS 工具用；
 * 3. `models/MODEL-NAMES.md` —— 给人看的对照表（英文 id / 中文文件名 / 显示名）。
 *
 * 中文名来源按优先级：
 * 1. 模型库卡片 `data-item-type` 与 `data-library-name`（真值）；
 * 2. 注册表别名：`smallcar` → `car` 这类「key 与文件名不同」的条目；
 * 3. `specs/model-name-overrides.json`：没有卡片的中文名（人工补，允许后续替换）。
 *
 * 文件名与显示名不是一回事：显示名可以有空格、可以在不同分区重名，而磁盘文件名
 * 必须去空格、全库唯一。少数款（没有中文显示名，或中文显示名与他人撞车）用
 * `specs/model-file-name-overrides.json` 指定文件名主干。
 *
 * 用法（仓库根目录）：
 * ```bash
 * bun homeos/frontend/scripts/models/build-model-name-index.mjs            # 写文件
 * bun homeos/frontend/scripts/models/build-model-name-index.mjs --check    # 只校验（门禁用）
 * bun homeos/frontend/scripts/models/build-model-name-index.mjs --json     # 机读结果
 * ```
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
/** `homeos/frontend`：脚本位于 `<frontend>/scripts/models/`。 */
const frontendDir = path.resolve(hereDir, '../..')
const modelsDir = path.join(frontendDir, 'public/static/3d-studio/models')
const outputFile = path.join(modelsDir, 'MODEL-NAMES.md')
const overridesFile = path.join(hereDir, 'specs/model-name-overrides.json')
const fileNameOverridesFile = path.join(hereDir, 'specs/model-file-name-overrides.json')
const generatedTsFile = path.join(
  frontendDir,
  'src/studio/app/3d-studio/loaders/external-models/model-file-names.generated.ts',
)
/** 同一张表的机读版（无时间戳，`--check` 才可比对）。 */
const generatedJsonFile = path.join(hereDir, 'specs/model-file-names.json')

const args = process.argv.slice(2)
const checkMode = args.includes('--check')
const asJson = args.includes('--json')

const loadModule = (relativePath) =>
  import(pathToFileURL(path.join(frontendDir, relativePath)).href)

const { MODEL_ASSETS_BY_FOLDER, MODEL_FOLDER_PATHS } = await loadModule(
  'src/studio/app/3d-studio/loaders/external-models/model-asset-folders.ts',
)
const { ALL_ITEM_MODELS } = await loadModule(
  'src/studio/app/3d-studio/loaders/external-models/all-item-models.ts',
)
const { MODEL_FILE_STEMS } = await loadModule(
  'src/studio/app/3d-studio/loaders/external-models/model-file-names.generated.ts',
)

/**
 * Windows / macOS 文件名禁用字符。`\u0000-\u001f` 是**故意**匹配控制字符：
 * 这个常量就是给命名门禁用的，命中即代表文件系统层面非法，改成可见字符范围就失去意义。
 */
// eslint-disable-next-line no-control-regex
const FORBIDDEN_STEM_CHARS = /[\\/:*?"<>|\u0000-\u001f]/
const WINDOWS_RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])$/i

/** 模型库卡片：`item-type` → 中文名（同名 key 以首次出现为准）。 */
function readLibraryCardNames() {
  const vueSource = fs.readFileSync(
    path.join(frontendDir, 'src/studio/entries/StudioView.vue'),
    'utf8',
  )
  const names = new Map()
  for (const tag of vueSource.match(/<button\b[^>]*>/g) ?? []) {
    const itemType = tag.match(/data-item-type="([^"]+)"/)?.[1]
    const libraryName = tag.match(/data-library-name="([^"]+)"/)?.[1]
    if (itemType && libraryName && !names.has(itemType)) names.set(itemType, libraryName)
  }
  return names
}

function readJson(file) {
  if (!fs.existsSync(file)) return {}
  return JSON.parse(fs.readFileSync(file, 'utf8'))
}

/** 显示名 → 文件名主干：去掉所有空白（磁盘名不带空格）。 */
function toFileStem(name) {
  return name.replace(/[\s\u3000]+/g, '')
}

const cardNames = readLibraryCardNames()
const overrides = readJson(overridesFile)
const fileNameOverrides = readJson(fileNameOverridesFile)

/** 全库 (分区, 英文 id)，按分区顺序。 */
const idRows = []
for (const [folder, assetIds] of Object.entries(MODEL_ASSETS_BY_FOLDER)) {
  for (const id of assetIds) idRows.push({ folder, id })
}

/** 第一轮：卡片直名 / 显示名人工补名。 */
const nameById = new Map()
for (const { id } of idRows) {
  if (cardNames.has(id)) {
    nameById.set(id, { name: cardNames.get(id), source: '模型库', libraryKey: id })
  } else if (overrides[id]) {
    nameById.set(id, { name: overrides[id], source: '人工补名', libraryKey: '' })
  }
}

/** 文件名主干（只依赖第一轮已知的显示名）。 */
const stemFor = (id) => fileNameOverrides[id] ?? toFileStem(nameById.get(id)?.name ?? '')

/**
 * 主干 / 英文 id → 模型 id，用来把注册表 URL 认回 id。
 *
 * 先放上一版生成表的反向映射（描述符里的 URL 就是它拼出来的），再补本轮已算出
 * 主干和英文 id —— 生成表为空（首次落地）时靠英文 id 兜底，两种状态都能收敛。
 */
const idForStem = new Map()
for (const [id, stem] of Object.entries(MODEL_FILE_STEMS)) {
  if (stem && !idForStem.has(stem)) idForStem.set(stem, id)
}
for (const { id } of idRows) {
  idForStem.set(id, id)
  const stem = stemFor(id)
  if (stem && !idForStem.has(stem)) idForStem.set(stem, id)
}

/** 描述符里的 URL → 模型 id 列表（去掉目录、`-lite` 与 `?v=` 查询串）。 */
function idsFromDescriptor(descriptor) {
  const ids = []
  for (const candidate of [descriptor?.url, descriptor?.fallbackUrl]) {
    if (typeof candidate !== 'string' || !candidate) continue
    const fileName = decodeURIComponent(candidate.split('?')[0].split('/').pop() || '')
    const stem = fileName.replace(/-lite\.glb$/i, '').replace(/\.glb$/i, '')
    const id = idForStem.get(stem)
    if (id && !ids.includes(id)) ids.push(id)
  }
  return ids
}

/** 第二轮：注册表别名（`smallcar` → `car`）。 */
for (const [key, descriptor] of Object.entries(ALL_ITEM_MODELS)) {
  if (!cardNames.has(key)) continue
  for (const id of idsFromDescriptor(descriptor)) {
    if (nameById.has(id)) continue
    nameById.set(id, {
      name: cardNames.get(key),
      source: `模型库（注册表别名 ${key}）`,
      libraryKey: key,
    })
  }
}

const rows = idRows.map(({ folder, id }) => {
  const info = nameById.get(id)
  const stem = stemFor(id)
  return {
    folder,
    folderPath: MODEL_FOLDER_PATHS[folder] ?? folder,
    id,
    stem,
    name: info?.name ?? '—',
    source: info?.source ?? '未命名',
    stemSource: fileNameOverrides[id] ? '文件名单列' : (info?.source ?? '未命名'),
    libraryKey: info?.libraryKey ?? '',
  }
})

const unnamed = rows.filter((row) => !row.stem)

/* ------------------------------- 校验 ------------------------------- */

const errors = []

const seenFolderPaths = new Map()
for (const [folder, folderPath] of Object.entries(MODEL_FOLDER_PATHS)) {
  if (!folderPath) errors.push(`分区 \`${folder}\` 没有中文目录名（MODEL_FOLDER_PATHS）`)
  const segments = String(folderPath).split('/')
  if (segments.length !== 2) {
    errors.push(`分区目录 \`${folderPath}\` 必须正好两级（<大类>/<分区>）`)
  }
  for (const segment of segments) {
    if (!segment) errors.push(`分区目录 \`${folderPath}\` 有空层级`)
    if (FORBIDDEN_STEM_CHARS.test(segment)) {
      errors.push(`分区目录 \`${folderPath}\` 的层级 \`${segment}\` 含非法字符`)
    }
    if (/\s/.test(segment)) errors.push(`分区目录 \`${folderPath}\` 的层级 \`${segment}\` 还有空格`)
    if (/^[.-]|[.-]$/.test(segment)) {
      errors.push(`分区目录 \`${folderPath}\` 的层级 \`${segment}\` 不能以点或连字符开头/结尾`)
    }
  }
  const previous = seenFolderPaths.get(folderPath)
  if (previous) errors.push(`分区目录重复：\`${previous}\` 与 \`${folder}\` 都是 \`${folderPath}\``)
  seenFolderPaths.set(folderPath, folder)
}

const seenStems = new Map()
for (const row of rows) {
  if (!row.stem) continue
  if (FORBIDDEN_STEM_CHARS.test(row.stem)) {
    errors.push(`\`${row.id}\` 的文件名主干 \`${row.stem}\` 含非法字符`)
  }
  if (/\s/.test(row.stem)) errors.push(`\`${row.id}\` 的文件名主干 \`${row.stem}\` 还有空格`)
  if (/-lite$/i.test(row.stem)) {
    errors.push(`\`${row.id}\` 的文件名主干不能以 \`-lite\` 结尾（会和降面版后缀混淆）`)
  }
  if (/^[.-]|[.-]$/.test(row.stem)) {
    errors.push(`\`${row.id}\` 的文件名主干 \`${row.stem}\` 不能以点或连字符开头/结尾`)
  }
  if (WINDOWS_RESERVED.test(row.stem)) {
    errors.push(`\`${row.id}\` 的文件名主干 \`${row.stem}\` 是 Windows 保留名`)
  }
  const previous = seenStems.get(row.stem)
  if (previous) {
    errors.push(
      `文件名主干重复：\`${previous}\` 与 \`${row.id}\` 都是 \`${row.stem}\`（在 model-file-name-overrides.json 里给其中一个另起名）`,
    )
  }
  seenStems.set(row.stem, row.id)
}

const strayOverrides = Object.keys(overrides).filter((id) => !rows.some((row) => row.id === id))
const strayFileNameOverrides = Object.keys(fileNameOverrides).filter(
  (id) => !rows.some((row) => row.id === id),
)

/* ----------------------------- 产物渲染 ----------------------------- */

/** 生成 TS 映射表：按分区顺序排，diff 稳定。 */
function renderTypeScript() {
  const lines = [
    '/**',
    ' * 模型 GLB 的**中文文件名主干**：模型 id → 磁盘文件名（不含 `-lite` 与扩展名）。',
    ' *',
    ' * **生成文件，请勿手工编辑** —— 由 `homeos/frontend/scripts/models/build-model-name-index.mjs`',
    ' * 从模型库卡片（`src/studio/entries/StudioView.vue` 的 `data-library-name`）、',
    ' * `scripts/models/specs/model-name-overrides.json` 与',
    ' * `scripts/models/specs/model-file-name-overrides.json` 生成。',
    ' *',
    ' * 代码里始终用英文 id：`modelAssetFileStem()` 负责把 id 翻成文件名，',
    ' * `modelAssetIdForStem()` 负责反向解析。',
    ' */',
    'export const MODEL_FILE_STEMS: Readonly<Record<string, string>> = Object.freeze({',
  ]
  for (const row of rows) {
    if (!row.stem) continue
    lines.push(`  ${JSON.stringify(row.id)}: ${JSON.stringify(row.stem)},`)
  }
  lines.push('});', '')
  return lines.join('\n')
}

/** 生成 Markdown：一个分区一张表。 */
function renderMarkdown() {
  const lines = [
    '# 模型文件中文名索引',
    '',
    '> 本文件由 `homeos/frontend/scripts/models/build-model-name-index.mjs` 生成，请勿手工编辑；',
    '> 改显示名请改模型库卡片（`src/studio/entries/StudioView.vue`）或',
    '> `scripts/models/specs/model-name-overrides.json`，改文件名请改',
    '> `scripts/models/specs/model-file-name-overrides.json`，然后重新生成。',
    '',
    '磁盘上的目录与文件名是中文（`家居/客厅家具/沙发-lite.glb`），代码里仍然是英文 id，',
    '两者由 `loaders/external-models/model-file-names.generated.ts` 与 `MODEL_FOLDER_PATHS` 对应 ——',
    '场景存档、撤销历史和导出包都按英文 id 引用模型，改名不会影响它们。',
    '',
    '每个 id 通常有两个文件：',
    '',
    '- `<中文名>-lite.glb`：降面版，运行时首选；',
    '- `<中文名>.glb`：完整件，精简版加载失败时兜底。',
    '',
    `共 ${rows.length} 个 id（${rows.length * 2} 个 GLB），已有中文文件名 ${rows.length - unnamed.length} 个。`,
    '',
    '新增模型时：先把 id 登记到 `loaders/external-models/model-asset-folders.ts`，',
    '放进对应分区的 `<中文名>.glb` / `<中文名>-lite.glb`，再到模型库加一张带 `data-library-name` 的卡片，',
    '最后运行 `bun run index:model-names` 刷新本表。',
    '',
  ]

  for (const [folder, assetIds] of Object.entries(MODEL_ASSETS_BY_FOLDER)) {
    const folderRows = assetIds.map((id) =>
      rows.find((row) => row.id === id && row.folder === folder),
    )
    lines.push(`## ${MODEL_FOLDER_PATHS[folder] || folder} — ${folder}`)
    lines.push('')
    lines.push(`共 ${assetIds.length} 个模型。`)
    lines.push('')
    lines.push('| 英文 id | 中文文件名 | 显示名 | 名称来源 |')
    lines.push('| --- | --- | --- | --- |')
    for (const row of folderRows) {
      lines.push(
        `| \`${row.id}\` | ${row.stem ? `\`${row.stem}\`` : '—'} | ${row.name} | ${row.stemSource} |`,
      )
    }
    lines.push('')
  }

  if (unnamed.length) {
    lines.push('## 还没有中文文件名')
    lines.push('')
    lines.push(
      '这些文件没有模型库卡片，也没有人工补名；要么补一条 `model-name-overrides.json`，' +
        '要么在模型库里给它们加卡片：',
    )
    lines.push('')
    for (const row of unnamed) lines.push(`- \`${row.folder}/${row.id}\``)
    lines.push('')
  }

  return lines.join('\n') + '\n'
}

const markdown = renderMarkdown()
const typeScript = renderTypeScript()
const jsonText =
  JSON.stringify(
    {
      note: '模型 id → 磁盘文件名主干（中文）。生成文件，请勿手工编辑；由 scripts/models/build-model-name-index.mjs 产出，供 Python / 非 TS 工具使用。',
      stems: Object.fromEntries(rows.filter((row) => row.stem).map((row) => [row.id, row.stem])),
    },
    null,
    2,
  ) + '\n'

if (asJson) {
  console.log(
    JSON.stringify(
      {
        total: rows.length,
        named: rows.length - unnamed.length,
        unnamed: unnamed.map((row) => row.id),
        strayOverrides,
        strayFileNameOverrides,
        errors,
        rows,
      },
      null,
      2,
    ),
  )
  process.exit(errors.length ? 1 : 0)
}

if (errors.length) {
  console.error(`模型中文文件名有 ${errors.length} 项问题：`)
  for (const message of errors) console.error(`  - ${message}`)
  process.exit(1)
}

if (checkMode) {
  const stale = []
  if (!fs.existsSync(outputFile) || fs.readFileSync(outputFile, 'utf8') !== markdown) {
    stale.push(path.relative(frontendDir, outputFile))
  }
  if (!fs.existsSync(generatedTsFile) || fs.readFileSync(generatedTsFile, 'utf8') !== typeScript) {
    stale.push(path.relative(frontendDir, generatedTsFile))
  }
  if (!fs.existsSync(generatedJsonFile) || fs.readFileSync(generatedJsonFile, 'utf8') !== jsonText) {
    stale.push(path.relative(frontendDir, generatedJsonFile))
  }
  if (stale.length) {
    console.error(
      '模型中文名索引已过期：运行 bun homeos/frontend/scripts/models/build-model-name-index.mjs 重新生成。',
    )
    for (const file of stale) console.error(`  - ${file}`)
    process.exit(1)
  }
  console.log(`模型中文名索引已是最新（${rows.length} 个 id）。`)
  process.exit(0)
}

fs.writeFileSync(outputFile, markdown)
fs.writeFileSync(generatedTsFile, typeScript)
fs.writeFileSync(generatedJsonFile, jsonText)
console.log(
  `已写入 ${path.relative(process.cwd(), generatedTsFile)}、` +
    `${path.relative(process.cwd(), generatedJsonFile)} 与 ` +
    `${path.relative(process.cwd(), outputFile)}：${rows.length} 个 id，` +
    `${unnamed.length} 个未命名。`,
)
if (unnamed.length) console.log(`未命名：${unnamed.map((row) => row.id).join(', ')}`)
if (strayOverrides.length) {
  console.warn(`model-name-overrides.json 里有已不存在的 id：${strayOverrides.join(', ')}`)
}
if (strayFileNameOverrides.length) {
  console.warn(
    `model-file-name-overrides.json 里有已不存在的 id：${strayFileNameOverrides.join(', ')}`,
  )
}
