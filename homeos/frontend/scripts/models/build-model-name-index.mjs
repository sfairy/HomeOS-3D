#!/usr/bin/env bun
/**
 * 生成模型文件的**中文名索引**：`models/MODEL-NAMES.md`。
 *
 * 模型库界面上的中文名（`data-library-name`）只活在前端卡片里，磁盘上仍是英文 id
 * （`sofa.glb` / `sofa-lite.glb`）。这个脚本把两边对齐成一份可读的对照表，
 * 方便直接翻 `public/static/3d-studio/models/` 时知道每个文件是什么，
 * 也方便新增模型时检查有没有漏掉中文名。
 *
 * 名称来源按优先级：
 * 1. 模型库卡片 `data-item-type` 与 `data-library-name`（真值）；
 * 2. 注册表别名：`smallcar` → `car.glb` 这类「key 与文件名不同」的条目；
 * 3. `specs/model-name-overrides.json`：没有卡片的中文名（人工补，允许后续替换）。
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

const args = process.argv.slice(2)
const checkMode = args.includes('--check')
const asJson = args.includes('--json')

const loadModule = (relativePath) =>
  import(pathToFileURL(path.join(frontendDir, relativePath)).href)

const { MODEL_ASSETS_BY_FOLDER } = await loadModule(
  'src/studio/app/3d-studio/loaders/external-models/model-asset-folders.ts',
)
const { ALL_ITEM_MODELS } = await loadModule(
  'src/studio/app/3d-studio/loaders/external-models/all-item-models.ts',
)

/**
 * 分区目录 → 中文标题。
 *
 * 取 `model-asset-folders.ts` 里的分区注释（家居/电器按模型库分区名，
 * 庭院按实际内容命名，不沿用错位的 `courtyard-N` 标题）。
 */
const FOLDER_TITLES = Object.freeze({
  'home/living': '客厅家具',
  'home/storage': '柜架收纳',
  'home/entry': '玄关用品',
  'home/bedroom': '卧室家具',
  'home/kitchen-furniture': '厨房家具',
  'home/kitchen-tools': '厨房用品',
  'home/bathroom': '卫浴用品',
  'home/office': '书房家具',
  'home/kids': '儿童用品',
  'home/pets': '宠物用品',
  'home/plants': '室内植物',
  'home/decor': '生活装饰',
  'home/fitness': '健身娱乐',
  'home/architecture': '建筑与交通',
  'home/media': '影音设备',
  'home/laundry': '洗衣烘干',
  'home/cleaning': '清洁设备',
  'appliance/kitchen-devices': '厨房电器',
  'appliance/laundry': '洗衣烘干',
  'appliance/cleaning': '清洁设备',
  'appliance/office-devices': '办公数码',
  'appliance/environment': '环境设备',
  'appliance/media': '影音设备',
  'appliance/fitness': '健身娱乐',
  'appliance/pets': '宠物用品',
  'appliance/lighting-decor': '装饰灯具',
  'courtyard/plants': '庭院植物',
  'courtyard/planters': '庭院花箱与花坛',
  'courtyard/furniture': '庭院家具与地面铺装',
  'courtyard/structures': '庭院构筑物',
  'courtyard/water': '庭院水景',
  'courtyard/facilities': '庭院设施',
})

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

/** 注册表 key → GLB 文件名主干（`smallcar` → `car`）。 */
function readRegistryFileIds() {
  const idsByKey = new Map()
  for (const [key, descriptor] of Object.entries(ALL_ITEM_MODELS)) {
    const ids = new Set()
    for (const candidate of [descriptor?.url, descriptor?.fallbackUrl]) {
      if (typeof candidate !== 'string' || !candidate) continue
      const fileName = candidate.split('?')[0].split('/').pop() || ''
      const id = fileName.replace(/-lite\.glb$/i, '').replace(/\.glb$/i, '')
      if (id) ids.add(id)
    }
    if (ids.size) idsByKey.set(key, ids)
  }
  return idsByKey
}

/** 人工补的中文名（只在模型库没有对应卡片时使用）。 */
function readNameOverrides() {
  if (!fs.existsSync(overridesFile)) return {}
  return JSON.parse(fs.readFileSync(overridesFile, 'utf8'))
}

const cardNames = readLibraryCardNames()
const fileIdsByKey = readRegistryFileIds()
const keysByFileId = new Map()
for (const [key, ids] of fileIdsByKey) {
  for (const id of ids) {
    if (!keysByFileId.has(id)) keysByFileId.set(id, new Set())
    keysByFileId.get(id).add(key)
  }
}
const overrides = readNameOverrides()

/** 逐个文件 id 解析中文名与来源。 */
function resolveNames() {
  const resolved = []
  for (const [folder, assetIds] of Object.entries(MODEL_ASSETS_BY_FOLDER)) {
    for (const id of assetIds) {
      let name = cardNames.get(id)
      let source = '模型库'
      let libraryKey = name ? id : ''

      if (!name) {
        for (const key of keysByFileId.get(id) || []) {
          if (!cardNames.has(key)) continue
          name = cardNames.get(key)
          libraryKey = key
          source = `模型库（注册表别名 ${key}）`
          break
        }
      }
      if (!name && overrides[id]) {
        name = overrides[id]
        source = '人工补名'
      }
      resolved.push({
        folder,
        id,
        name: name || '—',
        source: name ? source : '未命名',
        libraryKey,
      })
    }
  }
  return resolved
}

const rows = resolveNames()
const unnamed = rows.filter((row) => !row.name || row.name === '—')
const strayOverrides = Object.keys(overrides).filter(
  (id) => !rows.some((row) => row.id === id),
)

const namesById = new Map()
for (const row of rows) {
  if (row.name === '—') continue
  if (!namesById.has(row.name)) namesById.set(row.name, [])
  namesById.get(row.name).push(row)
}
const duplicateNames = [...namesById.entries()]
  .filter(([, entries]) => entries.length > 1)
  .map(([name, entries]) => ({ name, ids: entries.map((entry) => entry.id) }))

if (asJson) {
  console.log(
    JSON.stringify(
      {
        total: rows.length,
        named: rows.length - unnamed.length,
        unnamed: unnamed.map((row) => row.id),
        duplicates: duplicateNames,
        strayOverrides,
        rows,
      },
      null,
      2,
    ),
  )
  process.exit(0)
}

/** 生成 Markdown：一个分区一张表，表里只列主干名，`-lite`/完整件看表头说明。 */
function renderMarkdown() {
  const lines = [
    '# 模型文件中文名索引',
    '',
    '> 本文件由 `homeos/frontend/scripts/models/build-model-name-index.mjs` 生成，请勿手工编辑；',
    '> 改中文名请改模型库卡片（`src/studio/entries/StudioView.vue`）或',
    '> `scripts/models/specs/model-name-overrides.json`，然后重新生成。',
    '',
    '磁盘上的文件名就是模型 id，中文名只用于显示 —— 请求 URL 里仍然是英文 id，',
    '因为场景存档、撤销历史和导出包都按 id 引用模型。',
    '',
    '每个 id 通常有两个文件：',
    '',
    '- `<id>-lite.glb`：降面版，运行时首选；',
    '- `<id>.glb`：完整件，精简版加载失败时兜底。',
    '',
    `共 ${rows.length} 个 id（${rows.length * 2} 个 GLB），已有中文名 ${
      rows.length - unnamed.length
    } 个。`,
    '',
    '新增模型时：先把 id 登记到 `loaders/external-models/model-asset-folders.ts`，',
    '放进对应分区的 `<id>.glb` / `<id>-lite.glb`，再到模型库加一张带 `data-library-name` 的卡片，',
    '最后运行 `bun run index:model-names` 刷新本表。',
    '',
  ]

  for (const [folder, assetIds] of Object.entries(MODEL_ASSETS_BY_FOLDER)) {
    const folderRows = assetIds.map((id) =>
      rows.find((row) => row.id === id && row.folder === folder),
    )
    lines.push(`## ${folder} — ${FOLDER_TITLES[folder] || folder}`)
    lines.push('')
    lines.push(`共 ${assetIds.length} 个模型。`)
    lines.push('')
    lines.push('| 文件名主干 | 中文名 | 名称来源 |')
    lines.push('| --- | --- | --- |')
    for (const row of folderRows) {
      lines.push(`| \`${row.id}\` | ${row.name} | ${row.source} |`)
    }
    lines.push('')
  }

  if (duplicateNames.length) {
    lines.push('## 中文名重复')
    lines.push('')
    lines.push('下列 id 显示名相同，只能靠文件名主干区分：')
    lines.push('')
    for (const duplicate of duplicateNames) {
      lines.push(
        `- **${duplicate.name}**：${duplicate.ids.map((id) => `\`${id}\``).join('、')}`,
      )
    }
    lines.push('')
  }

  if (unnamed.length) {
    lines.push('## 还没有中文名')
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

if (checkMode) {
  const current = fs.existsSync(outputFile) ? fs.readFileSync(outputFile, 'utf8') : ''
  if (current !== markdown) {
    console.error(
      '模型中文名索引已过期：运行 bun homeos/frontend/scripts/models/build-model-name-index.mjs 重新生成。',
    )
    process.exit(1)
  }
  console.log(`模型中文名索引已是最新（${rows.length} 个 id）。`)
  process.exit(0)
}

fs.writeFileSync(outputFile, markdown)
console.log(
  `已写入 ${path.relative(process.cwd(), outputFile)}：${rows.length} 个 id，` +
    `${unnamed.length} 个未命名，${duplicateNames.length} 组重名。`,
)
if (unnamed.length) console.log(`未命名：${unnamed.map((row) => row.id).join(', ')}`)
if (strayOverrides.length) {
  console.warn(`model-name-overrides.json 里有已不存在的 id：${strayOverrides.join(', ')}`)
}
