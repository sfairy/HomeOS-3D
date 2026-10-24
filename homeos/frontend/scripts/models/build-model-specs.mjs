/**
 * 从注册表播种 `specs/model-specs.json`（336 条，一个 GLB 模型一条）。
 *
 * 规格优先级（与计划 §3 一致）：厂商规格 / 国标 > 仓库注册表 > 品类常识 > 目测。
 * 本脚本只负责**注册表这一层**：尺寸取 `ALL_ITEM_MODELS[*].scaleBasis`（324 条），
 * 没有 `scaleBasis` 的取 `itemTypeCatalog` 的 `width/height/depth`，两者都没有的留 null，
 * 由 `specs/spec-overrides.mjs` 里的人工查证件补上。
 *
 * 目录与名字的对应关系刻意建立在**磁盘文件**这一侧：模型 id 是 GLB 文件名主干，
 * 与注册表 key 不必相同（`smallcar` → `car.glb`、`airoutlet` → `air-outlet.glb`），
 * 所以先用 `ALL_ITEM_MODELS[*].url` 反查「哪个 itemType 用哪个文件」。
 *
 * 用法：
 *   bun scripts/models/build-model-specs.mjs            # dry-run，打印覆盖统计
 *   bun scripts/models/build-model-specs.mjs --write     # 写 specs/model-specs.json
 *   bun scripts/models/build-model-specs.mjs --check     # 门禁用：336 条齐全且都有尺寸
 */
import fs from 'node:fs'
import path from 'node:path'
import {
  collectModelVariants,
  listModelFiles,
  modelIdFromUrl,
  parseModelPath,
  repoRoot,
  specsDir,
} from './lib/glb-io.mjs'
import {
  FLAGSHIP_IDS,
  FLAGSHIP_SPECS,
  mountOf,
  nameOf,
  originOf,
  shadingOf,
  specOverrides,
  topologyClassOf,
} from './specs/spec-overrides.mjs'

const specsFile = path.join(specsDir, 'model-specs.json')
const exceptionsFile = path.join(specsDir, 'spec-exceptions.json')
/** `.../models/家居/客厅家具/沙发-lite.glb?v=1` → `sofa`（中文名经映射表反查英文 id）。 */
export function assetIdFromUrl(url) {
  return modelIdFromUrl(url)
}

async function loadRegistries() {
  const externalRoot = path.join(
    repoRoot,
    'homeos/frontend/src/studio/app/3d-studio/loaders/external-models',
  )
  const itemRoot = path.join(repoRoot, 'homeos/frontend/src/studio/app/3d-studio/authoring/items')
  const [all, collection, catalog, collectionCatalog] = await Promise.all([
    import(path.join(externalRoot, 'all-item-models.ts')),
    import(path.join(externalRoot, 'collection-models.ts')),
    import(path.join(itemRoot, 'item-catalog.ts')),
    import(path.join(itemRoot, 'collection-item-catalog.ts')),
  ])
  return {
    allItemModels: all.ALL_ITEM_MODELS,
    collectionModels: collection.COLLECTION_MODELS,
    itemTypeCatalog: {
      ...catalog.itemTypeCatalog,
      ...collectionCatalog.COLLECTION_ITEM_CATALOG,
    },
  }
}

/** 注册表 → 「模型文件 id → { itemTypes, descriptor }」。 */
function indexByAssetId(allItemModels) {
  const byAsset = new Map()
  for (const [itemType, descriptor] of Object.entries(allItemModels)) {
    const urls = [descriptor?.url, descriptor?.fallbackUrl].filter(Boolean)
    const assetIds = new Set(urls.map(assetIdFromUrl).filter(Boolean))
    for (const assetId of assetIds) {
      const entry = byAsset.get(assetId) ?? { itemTypes: [], descriptor }
      if (!entry.itemTypes.includes(itemType)) entry.itemTypes.push(itemType)
      byAsset.set(assetId, entry)
    }
  }
  return byAsset
}

/** 已审过的几何例外（尺寸保留原生比例 / 拓扑开口），由 `build-spec-exceptions.mjs` 生成。 */
function loadDeclaredExceptions() {
  if (!fs.existsSync(exceptionsFile)) return {}
  return JSON.parse(fs.readFileSync(exceptionsFile, 'utf8')).models ?? {}
}

const round = (value) => Number(Number(value).toFixed(4))

/** 播种一条 spec。 */
function seedSpec({ id, folder, variants, itemTypes, descriptor, collectionModels, itemTypeCatalog, declaredExceptions }) {
  const override = specOverrides[id] ?? {}
  // 旗舰的联网查证与面数预算集中在 `FLAGSHIP_SPECS`：reference 以人工查证件优先，
  // 手工 override（floor-lamp / tv_standard）里的 reference 再覆盖它。
  const flagshipSpec = FLAGSHIP_SPECS[id] ?? {}
  const primaryType = itemTypes.includes(id) ? id : itemTypes[0]
  const collectionEntry = collectionModels[id] ?? (primaryType ? collectionModels[primaryType] : undefined)
  const catalogEntry = (primaryType ? itemTypeCatalog[primaryType] : undefined) ?? itemTypeCatalog[id]
  const scaleBasis = Array.isArray(descriptor?.scaleBasis) ? descriptor.scaleBasis.map(round) : null
  const catalogSize = catalogEntry
    ? [round(catalogEntry.width), round(catalogEntry.height), round(catalogEntry.depth)]
    : null
  // 收藏批（`COLLECTION_MODELS`）是 2026-10 重绘后**新的**尺寸真值：`ALL_ITEM_MODELS` 里
  // 后写的手工条目会盖掉收藏批描述符（`basin` 就被盖回了旧的 0.88m，而重绘件已是 1.14m）。
  const collectionSize = Array.isArray(collectionEntry?.size) ? collectionEntry.size.map(round) : null
  const registrySize = override.size ?? collectionSize ?? scaleBasis ?? catalogSize
  const sizeSource = override.size
    ? 'override'
    : collectionSize
      ? 'registry:collection'
      : scaleBasis
        ? 'registry:scaleBasis'
        : catalogSize
          ? 'registry:itemTypeCatalog'
          : 'missing'

  return {
    id,
    itemTypes,
    name: nameOf(id, primaryType, collectionEntry, catalogEntry),
    folder,
    category: override.category ?? folder,
    mount: override.mount ?? mountOf({ id, primaryType, folder, collectionEntry, catalogEntry }),
    origin: override.origin ?? originOf({ mount: override.mount ?? mountOf({ id, primaryType, folder, collectionEntry, catalogEntry }) }),
    size: registrySize,
    sizeSource,
    registrySize,
    topologyClass: override.topologyClass ?? topologyClassOf({ id, folder }),
    materialFamily: override.materialFamily ?? materialFamilyOf({ id, folder, primaryType }),
    shading: shadingOf({ id, topologyClass: override.topologyClass ?? topologyClassOf({ id, folder }) }),
    animated: override.animated ?? false,
    variants,
    triangleBudget: override.triangleBudget ?? flagshipSpec.triangleBudget ?? null,
    reference:
      override.reference ??
      flagshipSpec.reference ??
      (sizeSource === 'registry:scaleBasis'
        ? {
            type: 'registry',
            title: `ALL_ITEM_MODELS["${primaryType}"]?.scaleBasis`,
            confidence: 0.8,
          }
        : sizeSource === 'registry:itemTypeCatalog'
          ? {
              type: 'registry',
              title: `itemTypeCatalog["${primaryType}"]（宽/高/深）`,
              confidence: 0.7,
            }
          : { type: 'pending', title: '待补实物规格', confidence: 0.3 }),
    assumptions: [...(override.assumptions ?? buildAssumptions({ id, sizeSource, folder })), ...(flagshipSpec.assumptions ?? [])],
    exceptions: [...(override.exceptions ?? []), ...(declaredExceptions[id] ?? [])],
    flagship: FLAGSHIP_IDS.includes(id),
    ...(override.notes ? { notes: override.notes } : {}),
  }
}

function materialFamilyOf({ id, folder, primaryType }) {
  if (folder.startsWith('courtyard/plants') || folder === 'home/plants') return 'plant'
  if (folder.startsWith('appliance')) return 'device'
  if (folder === 'home/bathroom') return 'sanitary'
  if (['glasspartition', 'full-length-mirror', 'wall-art', 'projection-screen'].includes(id)) return 'glass'
  if (['rug', 'round-rug', 'curtain_left', 'curtain_right', 'curtain_split', 'sofa-throw', 'pillow-set'].includes(id))
    return 'textile'
  if (/^(garden-(fence|gate|deck|paving|stepping|steps|low-wall|retaining-wall|arch|pergola|trellis|carport|gazebo))/.test(id))
    return 'structure'
  if (['car', 'suv', 'scooter', 'elevator', 'stairs', 'steel-stairs', 'glass-stairs', 'floating-stairs'].includes(id))
    return 'structure'
  if (primaryType && /^(toilet|basin|bathtub|shower|urinal|squattoilet)/.test(primaryType)) return 'sanitary'
  return 'furniture'
}

function buildAssumptions({ sizeSource, folder }) {
  if (sizeSource === 'missing') {
    return [
      {
        claim: '尺寸取自品类常识与同族模型比例',
        basis: '注册表无 scaleBasis / 目录条目，按同类实物常见规格推断',
        confidence: 0.45,
        risk: '尺寸不确定',
      },
    ]
  }
  if (sizeSource === 'registry:itemTypeCatalog') {
    return [
      {
        claim: '尺寸取物品盒目录的 宽×高×深，等价于摆放占位',
        basis: 'itemTypeCatalog（scene 载荷降级盒的尺寸来源）',
        confidence: 0.7,
        risk: '轴向/单位歧义',
      },
    ]
  }
  return [
    {
      claim: '注册表 scaleBasis 即模型原生世界的目标包围盒',
      basis: 'ALL_ITEM_MODELS 的 scaleBasis，运行时按该尺寸摆放',
      confidence: 0.8,
      risk: folder.startsWith('courtyard') ? '尺寸不确定' : '形态风格差异',
    },
  ]
}

async function main() {
  const write = process.argv.includes('--write')
  const check = process.argv.includes('--check')
  const { allItemModels, collectionModels, itemTypeCatalog } = await loadRegistries()
  const declaredExceptions = loadDeclaredExceptions()
  const byAsset = indexByAssetId(allItemModels)
  const variants = collectModelVariants()
  const files = listModelFiles()
  const specs = []

  for (const [id, variantMap] of [...variants].sort(([left], [right]) => left.localeCompare(right))) {
    const relativePath = variantMap.full ?? variantMap.lite
    const { folder } = parseModelPath(relativePath)
    const registryEntry = byAsset.get(id)
    specs.push(
      seedSpec({
        id,
        folder,
        variants: Object.keys(variantMap),
        itemTypes: registryEntry?.itemTypes ?? [],
        descriptor: registryEntry?.descriptor,
        collectionModels,
        itemTypeCatalog,
        declaredExceptions,
      }),
    )
  }

  const missing = specs.filter((spec) => !spec.size)
  const flagships = specs.filter((spec) => spec.flagship)
  const stats = {
    files: files.length,
    models: specs.length,
    fromScaleBasis: specs.filter((spec) => spec.sizeSource === 'registry:scaleBasis').length,
    fromCatalog: specs.filter((spec) => spec.sizeSource === 'registry:itemTypeCatalog').length,
    fromOverride: specs.filter((spec) => spec.sizeSource === 'override').length,
    missingSize: missing.length,
    flagship: flagships.length,
  }
  console.log(JSON.stringify(stats, null, 2))
  if (missing.length) console.log('缺尺寸：', missing.map((spec) => spec.id).join(', '))
  const unregistered = specs.filter((spec) => !spec.itemTypes.length).map((spec) => spec.id)
  if (unregistered.length) console.log('注册表未引用：', unregistered.join(', '))

  if (check) {
    const failures = []
    if (specs.length !== variants.size) failures.push(`specs 条数 ${specs.length} ≠ 模型数 ${variants.size}`)
    if (missing.length) failures.push(`${missing.length} 条缺尺寸：${missing.map((spec) => spec.id).join(', ')}`)
    const flagged = specs.filter((spec) => spec.flagship).length
    if (flagged !== FLAGSHIP_IDS.length) failures.push(`旗舰条目 ${flagged} ≠ 清单 ${FLAGSHIP_IDS.length}`)
    if (failures.length) {
      console.error('✗ model-specs 不完整：')
      for (const failure of failures) console.error('  - ' + failure)
      process.exit(1)
    }
    console.log('✓ model-specs 完整：' + specs.length + ' 条，尺寸齐全')
    return
  }

  if (write) {
    const payload = {
      generatedAt: '2026-10-23',
      unit: 'm',
      sizeOrder: '[width, height, depth]（世界坐标 X/Y/Z）',
      thresholds: {
        dimensionDeviation: 0.05,
        dimensionDeviationTarget: 0.02,
        triangleDelta: 0.1,
        nonManifoldEdgesSolid: 0,
      },
      models: specs,
    }
    fs.mkdirSync(specsDir, { recursive: true })
    fs.writeFileSync(specsFile, JSON.stringify(payload, null, 2) + '\n')
    console.log('写入 ' + path.relative(repoRoot, specsFile))
  }
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
