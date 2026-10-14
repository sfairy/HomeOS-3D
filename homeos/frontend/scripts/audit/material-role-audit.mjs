#!/usr/bin/env bun
/**
 * 材质角色 / 预设全量审计（**只读**，不改任何源码或资产）。
 *
 * 背景：0.7.6 批量导出把外部模型材质名改成「无语义的候选色层级」
 * （`<model>-candidate-<token>`，token ∈ body/dark/light/soft/accent/glass），
 * 真实构件语义（foliage/pot/soil、door/panel/sink/interior…）丢失，
 * 加上大批新模型没接家族 / 管线 / 档位表，导致「材质属性」面板与「材质风格」预设脱靶。
 *
 * 本脚本把「面板会显示什么」在无 WebGL 环境下复算出来，作为修复前的底稿与修复后的回归口子：
 *   1. 解析 `public/static/3d-studio/models/*.glb` 的 JSON chunk（材质名 / 烘焙色 / 几何）。
 *   2. `bun` 直接 import 真实 TS 模块（角色解析、家族、档位、收藏注册表、主题调色板）。
 *   3. 对每个 `ALL_ITEM_MODELS` 的 itemType，在 **默认主题 / 暖木主题** 下逐槽位算出
 *      role / roleSource / 角色配方色 / 档位色，并标记问题类别。
 *   4. 产出 `docs/material-role-audit.json` + `docs/material-role-audit.md`，
 *      并顺带给出「槽位 → 语义角色」的几何启发式 **草案**（供 `model-slot-roles.ts` 校正）。
 *
 * 用法（仓库根）：`bun run homeos/frontend/scripts/audit/material-role-audit.mjs`
 * （在 `homeos/frontend` 下亦可：`bun run scripts/audit/material-role-audit.mjs`）
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const hereDir = path.dirname(fileURLToPath(import.meta.url))
/** `homeos/frontend`：脚本位于 `<frontend>/scripts/audit/`。 */
const frontendDir = path.resolve(hereDir, '..', '..')
const repoRoot = path.resolve(frontendDir, '..', '..')
const modelsDir = path.join(frontendDir, 'public/static/3d-studio/models')
const srcDir = path.join(frontendDir, 'src/studio/app/3d-studio')
const outDir = path.join(repoRoot, 'docs')

const importSrc = (relativePath) => import('file://' + path.join(srcDir, relativePath))
/** 载入「修复后才会存在」的模块；缺失时返回 `null`，让审计在修复前后都能跑。 */
const tryImportSrc = async (relativePath) => {
  try {
    return await importSrc(relativePath)
  } catch {
    return null
  }
}

/* ------------------------------------------------------------------ *
 * 1. GLB 解析（JSON chunk + 每个材质的几何统计）
 * ------------------------------------------------------------------ */

const GLB_MAGIC = 0x46546c67 // "glTF"
const CHUNK_JSON = 0x4e4f534a // "JSON"

/** 读 GLB 的 JSON chunk；失败返回 `null`。 */
function readGlbJson(glbPath) {
  let buffer
  try {
    buffer = fs.readFileSync(glbPath)
  } catch {
    return null
  }
  if (buffer.length < 12 || buffer.readUInt32LE(0) !== GLB_MAGIC) return null
  let offset = 12
  while (offset + 8 <= buffer.length) {
    const chunkLength = buffer.readUInt32LE(offset)
    const chunkType = buffer.readUInt32LE(offset + 4)
    if (chunkType === CHUNK_JSON) {
      try {
        return JSON.parse(buffer.slice(offset + 8, offset + 8 + chunkLength).toString('utf8'))
      } catch {
        return null
      }
    }
    offset += 8 + chunkLength
  }
  return null
}

const linearToSrgb = (channel) => {
  const value = Math.max(0, Math.min(1, channel))
  return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
}

const toHex = (rgb) =>
  '#' +
  rgb
    .slice(0, 3)
    .map((channel) =>
      Math.round(linearToSrgb(channel) * 255)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')

/** 每个材质的：名称、烘焙色（sRGB hex）、三角面数、Y 区间、是否透明。 */
function materialStats(glbJson) {
  const materials = glbJson.materials || []
  const accessors = glbJson.accessors || []
  const stats = materials.map((material) => ({
    name: material.name || '',
    bakedColor: toHex(
      (material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorFactor) || [
        1, 1, 1, 1,
      ],
    ),
    alpha:
      (material.pbrMetallicRoughness && material.pbrMetallicRoughness.baseColorFactor?.[3]) ?? 1,
    transparent: material.alphaMode === 'BLEND' || material.alphaMode === 'MASK',
    roughness:
      (material.pbrMetallicRoughness && material.pbrMetallicRoughness.roughnessFactor) ?? null,
    metalness:
      (material.pbrMetallicRoughness && material.pbrMetallicRoughness.metallicFactor) ?? null,
    tris: 0,
    verts: 0,
    yMin: Infinity,
    yMax: -Infinity,
    meshCount: 0,
  }))
  for (const mesh of glbJson.meshes || []) {
    for (const primitive of mesh.primitives || []) {
      const materialIndex = primitive.material
      if (materialIndex == null || !stats[materialIndex]) continue
      const stat = stats[materialIndex]
      const positionAccessor = accessors[primitive.attributes?.POSITION]
      if (!positionAccessor) continue
      stat.meshCount += 1
      stat.verts += positionAccessor.count || 0
      stat.tris += Math.floor(
        ((primitive.indices != null ? accessors[primitive.indices]?.count : positionAccessor.count) ||
          0) / 3,
      )
      if (positionAccessor.min && positionAccessor.max) {
        stat.yMin = Math.min(stat.yMin, positionAccessor.min[1])
        stat.yMax = Math.max(stat.yMax, positionAccessor.max[1])
      }
    }
  }
  if (stats.length) {
    const finiteYs = stats.filter((stat) => Number.isFinite(stat.yMin) && Number.isFinite(stat.yMax))
    const minY = Math.min(...finiteYs.map((stat) => stat.yMin), 0)
    const maxY = Math.max(...finiteYs.map((stat) => stat.yMax), 0)
    const span = maxY - minY || 1
    for (const stat of stats) {
      stat.relBot = Number.isFinite(stat.yMin) ? (stat.yMin - minY) / span : null
      stat.relTop = Number.isFinite(stat.yMax) ? (stat.yMax - minY) / span : null
      stat.relSpan = Number.isFinite(stat.yMin) ? (stat.yMax - stat.yMin) / span : null
    }
  }
  return stats
}

/* ------------------------------------------------------------------ *
 * 2. 真实模块
 * ------------------------------------------------------------------ */

const roles = await importSrc('materials/studio-model-material-roles.ts')
const presets = await importSrc('materials/studio-material-presets.ts')
const shared = await importSrc('loaders/external-models/_shared.ts')
const { ALL_ITEM_MODELS } = await importSrc('loaders/external-models/all-item-models.ts')
const { COLLECTION_MODELS } = await importSrc('loaders/external-models/collection-models.ts')
const { defaultViewSettings } = await importSrc('authoring/scene/studio-view-settings.ts')
const { WARM_WOOD_STYLE } = await importSrc('authoring/scene/studio-scene-style.ts')
const { DECOR_MODELS } = await importSrc('authoring/items/decor-models.ts')
const { COURTYARD_MODELS } = await importSrc('plan/courtyard-models.ts')

/**
 * 「语义角色 × 槽位」对照表与「语义角色 → 写实外观」配色层（修复步骤 2 / 3 才落地）。
 * 未落地时审计照常跑，只是拿不到 `semanticRole` / `semanticColor` 两列。
 */
const slotRolesModule = await tryImportSrc('materials/model-slot-roles.ts')
const semanticRolesModule = await tryImportSrc('materials/studio-semantic-roles.ts')
const MODEL_SLOT_ROLES_SEMANTIC = slotRolesModule?.MODEL_SLOT_ROLES_SEMANTIC ?? {}
const SEMANTIC_ROLE_APPEARANCE = semanticRolesModule?.SEMANTIC_ROLE_APPEARANCE ?? {}

/** 该模型是否已登记语义槽位表（token 表或完整名覆盖）。 */
const hasSemanticSlotTable = (itemType) =>
  slotRolesModule?.hasSemanticSlotRoles
    ? slotRolesModule.hasSemanticSlotRoles(itemType)
    : Boolean(MODEL_SLOT_ROLES_SEMANTIC[itemType])

/** 从材质名里取「槽位 token」：`<model>-candidate-<token>` 的 token，或 `material-N` 的序号。 */
function slotTokenOf(materialName) {
  const candidate = (materialName || '').toLowerCase().match(/-candidate-([a-z][a-z0-9]*)$/)
  if (candidate?.[1]) return candidate[1]
  const materialIndex = (materialName || '').match(/material-(\d+)/)
  if (materialIndex?.[1]) return materialIndex[1]
  const suffix = (materialName || '').toLowerCase().match(/-([a-z][a-z0-9]*)$/)
  return suffix?.[1] ?? (materialName || '')
}

const {
  resolveModelFamily,
  resolveModelMaterialRole,
  materialRoleRecipeFor,
  isStructuralModelFamily,
} = roles

/** 默认主题调色板（`defaultViewSettings` 原样）。 */
const DEFAULT_THEME = { ...defaultViewSettings }
/** 暖木主题调色板（默认值再叠 `WARM_WOOD_STYLE`，含 `warmWood` 标记）。 */
const WARM_THEME = { ...defaultViewSettings, ...WARM_WOOD_STYLE }

/** 面板 / 角色表在「拿不到任何颜色」时的兜底灰（`resolveMaterialPaletteColor` 的末位）。 */
const FALLBACK_GREY = 0x7d8089

/**
 * 0.7.6 批量导出写进 GLB `baseColorFactor` 的**占位蓝灰明度阶梯**。
 *
 * 这七个值就是外模型「没拿到语义色」时的长相：`#525d71 → #687488 → #7d8799 → #9aa5b7
 * → #9da8ba → #b5bfce → #c0cad7`（`plant.glb` 的 body/dark/light/soft/glass 五槽全在梯上）。
 * 注意 `#7D8799` 也正是**默认主题的 `furniture`**、`#C0CAD7` 是 `furnitureLight` ——
 * 所以「设计色落在梯上」既可能是没配色，也可能是主题本身用了这个键，**单看颜色分不清**，
 * 必须结合语义角色与几何是否可见来判断（见 `foliage-not-green` / `sanitary-not-porcelain`）。
 */
const EXPORT_PLACEHOLDER_COLORS = new Set([
  '#525d71',
  '#687488',
  '#7d8799',
  '#9aa5b7',
  '#9da8ba',
  '#b5bfce',
  '#c0cad7',
])

/** 叶片类角色：**只要该槽位有几何，就必须是绿色**（唯一物理上无歧义的语义约束）。 */
const FOLIAGE_ROLES = new Set(['foliage', 'foliageSoft', 'foliageLight', 'leaf'])

/** 洁具体角色：只有**卫浴家族**上的这些角色才必须白瓷（避免误伤书柜内腔 / 车内座椅 / 花盆托盘）。 */
const PORCELAIN_ROLES = new Set(['ceramic', 'seat', 'lid', 'tank', 'bowl'])

const hexChannels = (value) => [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff]
const isGreenColor = (value) => {
  const [r, g, b] = hexChannels(value)
  return g > r + 8 && g > b + 8
}
const isPorcelainColor = (value) => Math.min(...hexChannels(value)) >= 0xd0

/* ------------------------------------------------------------------ *
 * 3. 管线判定（复刻 `usesDetailMaterialPipeline`；只为审计分类，不改行为）
 * ------------------------------------------------------------------ */

/** 该（模型，材质名）走哪条出图路径；`null` = 完全不走调色板管线（沿用 GLB 自带色）。 */
function pipelineKind(itemType, materialName) {
  const name = materialName || ''
  if (shared.paletteOverrideItemTypes.has(itemType)) return 'palette-override'
  if (itemType === 'aquarium' && name.startsWith('aquarium-aquatic-')) return 'aquarium'
  if (COURTYARD_MODELS[itemType]) return 'garden'
  if (DECOR_MODELS[itemType]) return 'decor'
  if (name.includes('-furniture-')) return 'furniture-name'
  // 专用分支出图：柱体配墙（`materialStyleRoleColorFor`）、楼梯与车辆的专用收尾 ——
  // 它们不在「通用角色表管线」里，但颜色同样由材质系统接管，不算「注册表配色成死配置」。
  if (shared.PILLAR_MODEL_ITEM_TYPES.has(itemType)) return 'pillar'
  if (DEDICATED_WRAP_ITEM_TYPES.has(itemType)) return 'dedicated'
  if (shared.gardenItemTypes.has(itemType)) return 'garden'
  if (shared.applianceItemTypes.has(itemType)) return 'appliance'
  if (hasSemanticSlotTable(itemType)) return 'role-table'
  if (
    !isStructuralModelFamily(resolveModelFamily(itemType)) &&
    (shared.roleTableItemTypes.has(itemType) || Boolean(COLLECTION_MODELS[itemType]))
  )
    return 'role-table'
  return null
}

/** 楼梯 / 车辆：`studio-external-models.ts` 里有各自的专用配色收尾（不参与通用角色表）。 */
const DEDICATED_WRAP_ITEM_TYPES = new Set([
  'stairs',
  'steelstairs',
  'glassstairs',
  'floatingstairs',
  'smallcar',
  'car',
  'suv',
  'scooter',
  'elevator',
])

/** 该模型是否**任意**槽位会进入管线。 */
const modelEntersPipeline = (itemType, names) =>
  names.some((name) => pipelineKind(itemType, name) !== null)

/* ------------------------------------------------------------------ *
 * 4. 复算「面板会显示什么」
 * ------------------------------------------------------------------ */

const hexNumber = (hex) => (typeof hex === 'string' ? Number.parseInt(hex.slice(1), 16) : hex)
const hexOf = (value) => '#' + (value >>> 0).toString(16).padStart(6, '0')

/** 某档位在给定主题下调色板的覆盖（`materialStylePaletteColors`）。 */
function stylePalette(itemType, preset, themePalette) {
  return { ...themePalette, ...(preset ? preset.colors : {}), ...(preset ? { materialStyle: preset.id } : {}) }
}

/** 复算单个槽位：角色、角色配方色、档位色、设计出图色（档位 > 角色配方 > GLB 烘焙色）。 */
function auditSlot(itemType, materialStat, materialIndex, themePalette) {
  const name = materialStat.name
  const roleResolution = resolveModelMaterialRole(itemType, name, materialIndex)
  const kind = pipelineKind(itemType, name)
  const roleRecipe = materialRoleRecipeFor(itemType, name, themePalette, materialIndex)
  const styleRecipe = presets.materialStyleRecipeFor(itemType, name, themePalette, materialIndex)
  const baked = hexNumber(materialStat.bakedColor)

  // 管线判定：只有走了角色表 / 装饰 / 庭院 / 家具名 / 柱体 / 楼梯车辆专用分支 这几条路径，
  // 角色配方色才真正参与出图；家电的亮度档、纯 override 路径另算（标 approximate）。
  const roleRecipeEffective =
    kind === 'role-table' ||
    kind === 'decor' ||
    kind === 'garden' ||
    kind === 'furniture-name' ||
    kind === 'pillar' ||
    kind === 'dedicated'

  // 「语义角色 → 写实外观」配色层（修复步骤 3）；表未落地时为 null。
  const semanticRole =
    (slotRolesModule?.resolveSemanticSlotRole
      ? slotRolesModule.resolveSemanticSlotRole(itemType, resolveModelFamily(itemType), name)
      : MODEL_SLOT_ROLES_SEMANTIC[itemType]?.[slotTokenOf(name)]) ??
    (SEMANTIC_ROLE_APPEARANCE[roleResolution.role] ? roleResolution.role : null)
  const semanticAppearance = semanticRole ? SEMANTIC_ROLE_APPEARANCE[semanticRole] : null
  const semanticColorValue =
    semanticRole && semanticRolesModule?.resolveSemanticRoleColor
      ? semanticRolesModule.resolveSemanticRoleColor(semanticRole, themePalette)
      : semanticAppearance
        ? semanticAppearance.defaultColor
        : undefined

  // 「设计出图色」按**修复目标**算：档位色 > 角色配方色 > **语义写实色** > GLB 烘焙色。
  const roleColorValue = roleRecipeEffective ? roleRecipe?.colorValue : undefined
  const baseColor = roleColorValue ?? semanticColorValue ?? baked
  // 档位色：档位是**独立于材质管线**的最后一道闸（`applyMaterialStyleRecipe` 对全部外模型生效），
  // 因此这里不按 `pipeline` 过滤 —— 柱体这类由专用分支出图的模型同样吃档位。
  const styleColor =
    styleRecipe && styleRecipe.colorValue !== undefined ? styleRecipe.colorValue : undefined
  const finalColor = styleColor ?? baseColor

  return {
    name,
    role: roleResolution.role,
    roleSource: roleResolution.source,
    pipeline: kind,
    baked: materialStat.bakedColor,
    roleRecipeColor: roleRecipe ? hexOf(roleRecipe.colorValue) : null,
    roleRecipeSurface: roleRecipe?.surface ?? null,
    semanticRole,
    semanticColor:
      semanticColorValue !== undefined ? hexOf(semanticColorValue) : null,
    semanticLabel: semanticAppearance?.label ?? null,
    styleColor: styleColor !== undefined ? hexOf(styleColor) : null,
    designColor: hexOf(finalColor),
    /** 角色配方解析到兜底灰（`resolveMaterialPaletteColor` 末端）—— 语义配色缺失的强信号。 */
    recipeFallsToGrey: roleRecipe ? roleRecipe.colorValue === FALLBACK_GREY : false,
    approx: kind !== null && !roleRecipeEffective,
  }
}

/* ------------------------------------------------------------------ *
 * 5. 几何启发式：槽位 → 语义角色 **草案**
 * ------------------------------------------------------------------ */

const GENERIC_TOKEN_ROLES = new Set(['body', 'dark', 'light', 'soft', 'accent', 'glass'])
/** 语义层的「写实中性件」兜底角色：命中说明该槽位仍未还原到真实构件。 */
const NEUTRAL_ROLES = new Set([
  ...GENERIC_TOKEN_ROLES,
  'bodyNeutral',
  'darkNeutral',
  'lightNeutral',
  'softNeutral',
  'accentNeutral',
  'glassNeutral',
])

/**
 * 依据几何给一个槽位提「语义角色」草案：
 *  - 封顶且三角面最多 → 叶片（foliage）；
 *  - 贴地且矮 → 花盆（pot）/ 底座（base）；
 *  - 极薄扁片且位置最低 → 托盘（saucer）；
 *  - 竖直中段、面数少 → 枝干（stem）；
 *  - 其余按烘焙明度排序落到 深色/浅色/点缀。
 * 只对 `plant`/`flower-*`/`garden-*` 这类真有植物语义的模型给叶/盆/土；
 * 其它模型按通用（body/base/top/trim/accent/dark/light）给。
 */
function draftSemanticRoles(itemType, stats) {
  const isPlantish = /^(plant|flower|garden)/.test(itemType)
  const draft = {}
  const finite = stats.filter((stat) => stat.relTop != null)
  if (!finite.length) return draft
  const ranked = [...finite].sort((statA, statB) => statB.tris - statA.tris)
  const heaviest = ranked[0]

  for (const stat of finite) {
    const token = (stat.name.match(/-([a-z0-9]+)$/i) || [])[1] || stat.name
    const isThinPlate = stat.relSpan != null && stat.relSpan <= 0.08
    const isGround = stat.relBot != null && stat.relBot <= 0.04
    const isTop = stat.relTop != null && stat.relTop >= 0.88
    let suggestion
    if (isThinPlate && isGround) suggestion = isPlantish ? 'saucer' : 'base'
    else if (stat === heaviest && isTop && isPlantish) suggestion = 'foliage'
    else if (isGround && stat.relTop != null && stat.relTop <= 0.4) suggestion = isPlantish ? 'pot' : 'base'
    else if (isTop && stat.relSpan != null && stat.relSpan >= 0.3) suggestion = isPlantish ? 'foliage' : 'top'
    else if (isPlantish && stat.relBot != null && stat.relBot > 0.1 && stat.relBot <= 0.5)
      suggestion = 'stem'
    else suggestion = GENERIC_TOKEN_ROLES.has(token) ? token : 'body'
    draft[token] = suggestion
  }
  // 植物：把最高且面数最多的那个强制为叶
  if (isPlantish && heaviest) {
    const token = (heaviest.name.match(/-([a-z0-9]+)$/i) || [])[1] || heaviest.name
    if (heaviest.relTop >= 0.85) draft[token] = 'foliage'
  }
  return draft
}

/* ------------------------------------------------------------------ *
 * 6. 逐模型审计
 * ------------------------------------------------------------------ */

const officialItemTypes = Object.keys(ALL_ITEM_MODELS).filter((itemType) => {
  const definition = ALL_ITEM_MODELS[itemType]
  return definition && typeof definition === 'object' && typeof definition.url === 'string'
})

const modelReports = []
const cacheKeyToStats = new Map()

for (const itemType of officialItemTypes) {
  const definition = ALL_ITEM_MODELS[itemType]
  const urlMatch = definition.url.match(/models\/([^?]+\.glb)/)
  if (!urlMatch) continue
  const glbFileName = urlMatch[1]
  const glbPath = path.join(modelsDir, glbFileName)
  if (!cacheKeyToStats.has(glbFileName)) {
    const glbJson = readGlbJson(glbPath)
    cacheKeyToStats.set(glbFileName, glbJson ? materialStats(glbJson) : null)
  }
  const stats = cacheKeyToStats.get(glbFileName)
  if (!stats || !stats.length) continue

  const names = stats.map((stat) => stat.name)
  const family = resolveModelFamily(itemType)
  const styleCapable = presets.isMaterialStyleCapable(itemType)
  const presetGroup = presets.materialStyleGroupFor(itemType)
  const collectionEntry = COLLECTION_MODELS[itemType] || null

  const slotsByTheme = {}
  for (const [themeName, themePalette] of [
    ['default', DEFAULT_THEME],
    ['warm', WARM_THEME],
  ]) {
    slotsByTheme[themeName] = stats.map((stat, index) => auditSlot(itemType, stat, index, themePalette))
  }

  // 档位审计：三个信号都要看 ——
  //  · `slotsCovered`：档位（含档位组补全）是否为该槽位**定义了材质**（没有 = 真·未覆盖 / 半生效）；
  //  · `slotsChanged`：以第一个档位为准，配色是否相对「未选档位」发生变化（全都没变 = 空转）；
  //  · `slotsFrozen`：切遍该组所有档位，该槽位是否**始终**同一个色（真正的「选了不生效」）。
  let styleAudit = null
  if (styleCapable) {
    const options = presets.materialStyleOptionsFor(itemType)
    const firstPreset = options[0] || null
    const themes = options.map((preset) => stylePalette(itemType, preset, DEFAULT_THEME))
    const colorsBySlot = stats.map((stat, index) =>
      themes.map((themePalette) => auditSlot(itemType, stat, index, themePalette).designColor),
    )
    const firstPalette = themes[0] ?? DEFAULT_THEME
    const changed = stats.filter((stat, index) => {
      const before = auditSlot(itemType, stat, index, DEFAULT_THEME).designColor
      const after = auditSlot(itemType, stat, index, firstPalette).designColor
      return before !== after
    })
    const covered = stats.filter(
      (stat, index) => presets.materialStyleRecipeFor(itemType, stat.name, firstPalette, index) !== null,
    )
    const frozen = stats.filter((stat, index) => new Set(colorsBySlot[index]).size === 1)
    /**
     * 「档位两两同色」——逐槽位把每个档位的最终色拼成一个元组，两档元组完全相同即「选了等于没选」。
     * 这是前两个信号都抓不到的那一类：`slotsChanged > 0`（第一档确实改动过槽位）、
     * `slotsFrozen` 也可能 < 总数（个别槽位会动），可**两档之间**整机仍然一模一样。
     * 0.7.6 实测抓出 4 款：`tv_standard`（整机只有一个屏槽，两档屏都一样近黑）、
     * `heated-towel-rail`（杆 / 龙头 / 毛巾三槽全读档位没写的五金键）、
     * `bed-tray`（托盘两槽同角色，腿架差异被吃掉）、`ball-pit`（两档球色撞成同一颗红球）。
     */
    const tuplesByPreset = themes.map((_, presetIndex) =>
      colorsBySlot.map((colors) => colors[presetIndex]).join('|'),
    )
    const identicalPairs = []
    for (let a = 0; a < options.length; a += 1)
      for (let b = a + 1; b < options.length; b += 1)
        if (tuplesByPreset[a] === tuplesByPreset[b])
          identicalPairs.push(`${options[a].id}=${options[b].id}`)
    /** 「档位空转到底」：所有槽位切遍档位都不变色（整机对档位无响应）。 */
    const inert = options.length > 1 && stats.length > 0 && frozen.length === stats.length
    styleAudit = {
      presetCount: options.length,
      firstPresetId: firstPreset ? firstPreset.id : null,
      slotsChanged: changed.length,
      slotsCovered: covered.length,
      slotsFrozen: frozen.length,
      slotsTotal: stats.length,
      identicalPresetPairs: identicalPairs,
      inert,
      changedSlots: changed.map((stat) => stat.name),
      unchangedSlots: stats.filter((stat) => !changed.includes(stat)).map((stat) => stat.name),
      uncoveredSlots: stats.filter((stat) => !covered.includes(stat)).map((stat) => stat.name),
      frozenSlots: frozen.map((stat) => stat.name),
    }
  }

  const defaultSlots = slotsByTheme.default
  const distinctFinal = new Set(defaultSlots.map((slot) => slot.designColor))
  const roleTokens = new Set(defaultSlots.map((slot) => slot.semanticRole ?? slot.role))
  const allTokensAreGeneric = defaultSlots.every((slot) =>
    NEUTRAL_ROLES.has(slot.semanticRole ?? slot.role),
  )
  const semanticCovered = hasSemanticSlotTable(itemType)

  const issues = []
  if (allTokensAreGeneric) issues.push('no-semantic-name')
  if (family === 'misc') issues.push('family-misc')
  if (!styleCapable && !presets.isMaterialStyleOptOut(itemType)) issues.push('no-style-presets')
  if (!modelEntersPipeline(itemType, names)) issues.push('never-in-pipeline')
  if (shared.roleTableItemTypes.has(itemType)) {
    const orphans = defaultSlots.filter((slot) => slot.roleRecipeColor === null)
    if (orphans.length) issues.push('slot-zero-recipe')
  }
  if (defaultSlots.some((slot) => slot.recipeFallsToGrey)) issues.push('recipe-grey-collapse')

  /**
   * 物理语义硬约束（两个主题都要满足）——这是「按真实语义出图」真正的判据，
   * 也是唯一能抓住「蓝灰树叶 / 蓝灰白瓷」这类脱靶的口子：
   *  · 叶片类角色（`foliage*` / `leaf`）**只要有几何**就必须是绿的；
   *  · 洁具体（白瓷 / 座圈 / 内腔）必须是白 / 浅瓷。
   * 只对**有几何**的槽位判定：0 三角面的槽位在模型里不可见（0.7.6 批量导出给每款模型
   * 都补齐了 6 个候选色槽，其中大半是空的），它们的颜色不构成可见缺陷。
   */
  const trisAt = (index) => stats[index]?.tris ?? 0
  const physicalViolations = []
  for (const [themeName, themeSlots] of [
    ['default', defaultSlots],
    ['warm', slotsByTheme.warm],
  ]) {
    themeSlots.forEach((slot, index) => {
      if (trisAt(index) <= 0) return
      const role = slot.semanticRole ?? slot.role
      const color = hexNumber(slot.designColor)
      if (FOLIAGE_ROLES.has(role) && !isGreenColor(color))
        physicalViolations.push(`foliage-not-green@${themeName}:${slot.name}=${slot.designColor}`)
      if (family === 'ceramic' && PORCELAIN_ROLES.has(role) && !isPorcelainColor(color))
        physicalViolations.push(`sanitary-not-porcelain@${themeName}:${slot.name}=${slot.designColor}`)
    })
  }
  if (physicalViolations.some((entry) => entry.startsWith('foliage-not-green')))
    issues.push('foliage-not-green')
  if (physicalViolations.some((entry) => entry.startsWith('sanitary-not-porcelain')))
    issues.push('sanitary-not-porcelain')

  /**
   * 「可见槽位落在导出占位蓝灰阶梯上」——**不是**判据，只是体检指标：
   * 默认主题的 `furniture*` 键与占位梯同值，结构性槽位（柜体 / 铺装 / 器械）用它是有意的，
   * 所以这里只统计数量供人工确认，不判失败。
   */
  const placeholderSlots = defaultSlots
    .filter((slot, index) => trisAt(index) > 0 && EXPORT_PLACEHOLDER_COLORS.has(slot.designColor))
    .map((slot) => slot.name)

  if (
    distinctFinal.size === 1 &&
    roleTokens.size > 1 &&
    !(styleAudit && styleAudit.slotsChanged > 0)
  )
    issues.push('all-slots-same-color')
  if (allTokensAreGeneric && !semanticCovered) issues.push('semantic-table-missing')
  if (styleAudit) {
    if (styleAudit.slotsChanged === 0) issues.push('style-idle')
    if (styleAudit.slotsCovered < styleAudit.slotsTotal) issues.push('style-partial')
    if (styleAudit.inert) issues.push('style-inert')
    if (styleAudit.identicalPresetPairs.length) issues.push('style-presets-identical')
  }
  if (collectionEntry && !modelEntersPipeline(itemType, names)) issues.push('collection-colors-dead')

  modelReports.push({
    itemType,
    glb: glbFileName,
    name: collectionEntry?.name ?? null,
    group: collectionEntry?.group ?? null,
    isCollection: Boolean(collectionEntry),
    family,
    styleCapable,
    presetGroup,
    semanticCovered,
    roleTokens: [...roleTokens],
    distinctFinalColors: [...distinctFinal],
    slots: slotsByTheme.default.map((slot) => ({
      ...slot,
      geometry: (() => {
        const stat = stats.find((candidate) => candidate.name === slot.name)
        return stat
          ? {
              tris: stat.tris,
              relBot: stat.relBot != null ? Number(stat.relBot.toFixed(2)) : null,
              relTop: stat.relTop != null ? Number(stat.relTop.toFixed(2)) : null,
            }
          : null
      })(),
    })),
    warmSlots: slotsByTheme.warm.map((slot) => ({
      name: slot.name,
      role: slot.role,
      semanticRole: slot.semanticRole,
      designColor: slot.designColor,
    })),
    styleAudit,
    draftRoles: draftSemanticRoles(itemType, stats),
    /** 物理语义硬约束的逐条违反（两个主题），空数组 = 该模型没有任何可见的语义脱靶。 */
    physicalViolations,
    /** 可见槽位里落在导出占位蓝灰阶梯上的材质名（体检指标，非失败判据）。 */
    placeholderSlots,
    issues,
  })
}

/* ------------------------------------------------------------------ *
 * 7. 汇总
 * ------------------------------------------------------------------ */

const ISSUE_LABELS = {
  'no-semantic-name': '槽位角色只剩明度 token（无语义）',
  'family-misc': '家族误判为 misc',
  'no-style-presets': '无「材质风格」档位',
  'never-in-pipeline': '完全不进材质管线',
  'slot-zero-recipe': '角色表槽位拿不到任何配方',
  'recipe-grey-collapse': '角色配方塌成兜底灰',
  'foliage-not-green': '叶片槽位不是绿色（物理语义脱靶）',
  'sanitary-not-porcelain': '洁具槽位不是白 / 浅瓷（物理语义脱靶）',
  'all-slots-same-color': '全部槽位同色',
  'semantic-table-missing': '无语义角色的模型尚未登记语义槽位表',
  'style-idle': '档位空转（选了不改变任何槽位）',
  'style-partial': '档位半生效（有槽位没被任何档位覆盖）',
  'collection-colors-dead': '收藏注册表配色未被消费',
}

const counts = {}
for (const report of modelReports) {
  for (const issue of report.issues) counts[issue] = (counts[issue] || 0) + 1
}
const styleCapableReports = modelReports.filter((report) => report.styleCapable)
const summary = {
  generatedAt: new Date().toISOString(),
  modelsScanned: modelReports.length,
  semanticTable: {
    modulePresent: Boolean(slotRolesModule),
    modelsCovered: modelReports.filter((report) => report.semanticCovered).length,
  },
  colorLayer: {
    modulePresent: Boolean(semanticRolesModule),
    rolesDefined: Object.keys(SEMANTIC_ROLE_APPEARANCE).length,
  },
  issues: Object.fromEntries(
    Object.entries(counts).sort((entryA, entryB) => entryB[1] - entryA[1]),
  ),
  physical: {
    /** 违反「叶片必须绿 / 洁具必须白」的模型数（**判据**，应为 0）。 */
    violatingModels: modelReports.filter((report) => report.physicalViolations.length > 0).length,
    violatingSlots: modelReports.reduce(
      (total, report) => total + report.physicalViolations.length,
      0,
    ),
  },
  placeholders: {
    /** 可见槽位里仍落在导出占位蓝灰阶梯上的数量（体检指标，默认主题的 `furniture*` 也会计入）。 */
    visibleSlots: modelReports.reduce((total, report) => total + report.placeholderSlots.length, 0),
    models: modelReports.filter((report) => report.placeholderSlots.length > 0).length,
  },
  stylePresets: {
    capable: styleCapableReports.length,
    idle: styleCapableReports.filter((report) => report.issues.includes('style-idle')).length,
    partial: styleCapableReports.filter((report) => report.issues.includes('style-partial')).length,
    frozen: styleCapableReports.filter((report) => report.issues.includes('style-frozen')).length,
    /** 切遍档位整机不变色（档位对这款模型完全无响应）。 */
    inert: styleCapableReports.filter((report) => report.issues.includes('style-inert')).length,
    /** 存在「两个档位整机同色」的模型数 + 同色档位对总数。 */
    identical: styleCapableReports.filter((report) => report.issues.includes('style-presets-identical'))
      .length,
    identicalPairs: styleCapableReports.reduce(
      (total, report) => total + (report.styleAudit?.identicalPresetPairs.length ?? 0),
      0,
    ),
    identicalDetail: styleCapableReports
      .flatMap((report) =>
        (report.styleAudit?.identicalPresetPairs ?? []).map((pair) => `${report.itemType}:${pair}`),
      )
      .sort(),
  },
}

/* ------------------------------------------------------------------ *
 * 8. 落盘
 * ------------------------------------------------------------------ */

fs.mkdirSync(outDir, { recursive: true })
fs.writeFileSync(
  path.join(outDir, 'material-role-audit.json'),
  JSON.stringify({ summary, models: modelReports }, null, 1),
)

const md = []
md.push('# 材质属性预设全量审计', '')
md.push(`生成时间：${summary.generatedAt}`, '')
md.push(
  `扫描模型：**${summary.modelsScanned}** 个 itemType（仅统计能解析到 GLB 的官方模型）。`,
  '',
)
md.push(
  '> 说明：本仓库 0.7.6 批量导出把材质名改成 `<模型>-candidate-<token>`（token 只剩',
  '> body/dark/light/soft/accent/glass 这层候选色），真实构件语义（foliage/pot/soil、',
  '> door/panel/sink/interior…）在**角色解析**这一层就丢了。下表的「设计色」= 档位色 >',
  '> 角色配方色 > GLB 烘焙色，是**按角色/档位配方层**算出的目标出图色；',
  '> 部分模型当前实际由遗留分支（`applyWarmWoodFurnitureMaterial` 等）出图，会与「设计色」',
  '> 有出入 —— 这些正是本次修复要收敛到语义配色的对象。',
  '',
)
md.push(
  '> **判据（`physical`）**：叶片类角色（`foliage*`/`leaf`）只要该槽位有几何就必须是绿色，',
  '> 卫浴家族的 `ceramic`/`seat`/`bowl`/`lid`/`tank` 必须是白 / 浅瓷 —— 两个主题都要满足。',
  '> 只对**有几何**的槽位判定（0.7.6 给每款模型补齐了 6 个候选色槽，其中大半为空槽）。',
  '> 这条判据取代了原先「设计色 == `#7d8089`」的检查：那个常数是',
  '> `resolveMaterialPaletteColor` 在连调色板都没有时的末位值，真实路径永远传主题调色板，',
  '> 所以它一次都不会出现 —— 而外模型真正的「没配色」长相是下面这条占位蓝灰明度梯：',
  '> `#525d71 → #687488 → #7d8799 → #9aa5b7 → #9da8ba → #b5bfce → #c0cad7`',
  '> （`#7D8799` 也正是默认主题的 `furniture`，`#C0CAD7` 是 `furnitureLight`）。',
  '> 落在梯上的**可见**槽位数记在 `placeholders`，作为体检指标（默认主题的结构件用它是有意的），',
  '> 不判失败。',
  '',
)
md.push('## 问题总览', '')
md.push('| 问题 | 数量 |', '|---|---|')
for (const [issue, count] of Object.entries(summary.issues))
  md.push(`| ${ISSUE_LABELS[issue] || issue} | ${count} |`)
md.push('')
md.push(
  `语义槽位表：${summary.semanticTable.modulePresent ? '已落地' : '未落地'}，覆盖 **${summary.semanticTable.modelsCovered}** 款。`,
  '',
)
md.push(
  `语义配色层：${summary.colorLayer.modulePresent ? '已落地' : '未落地'}，定义 **${summary.colorLayer.rolesDefined}** 个角色。`,
  '',
)
md.push(
  `材质风格档位：可配 **${summary.stylePresets.capable}** 款，其中空转 **${summary.stylePresets.idle}**、半生效 **${summary.stylePresets.partial}**。`,
  '',
)
for (const issue of Object.keys(summary.issues)) {
  const rows = modelReports.filter((report) => report.issues.includes(issue))
  md.push(`## ${ISSUE_LABELS[issue] || issue}（${rows.length}）`, '')
  md.push('| 模型 | 家族 | 档位组 | 槽位角色 | 设计色 |', '|---|---|---|---|---|')
  for (const report of rows)
    md.push(
      `| \`${report.itemType}\` | ${report.family} | ${report.presetGroup || '-'} | ${report.roleTokens.join('/')} | ${report.distinctFinalColors.join(' ')} |`,
    )
  md.push('')
}
md.push('## 逐模型对照（默认主题）', '')
md.push(
  '| 模型 | GLB | 家族 | 档位 | 槽位：材质名 → 角色(来源) → 角色配方色 → 语义角色/语义色 → 档位色 → 设计色 |',
  '|---|---|---|---|---|',
)
for (const report of modelReports) {
  const slots = report.slots
    .map(
      (slot) =>
        `${slot.name} → ${slot.role}(${slot.roleSource}) → ${slot.roleRecipeColor || '-'} → ${slot.semanticRole ? `${slot.semanticRole}/${slot.semanticColor}` : '-'} → ${slot.styleColor || '-'} → ${slot.designColor}${slot.pipeline ? '' : ' [未进管线]'}`,
    )
    .join('<br>')
  md.push(
    `| \`${report.itemType}\` | ${report.glb} | ${report.family} | ${report.styleAudit ? `${report.styleAudit.firstPresetId}(${report.styleAudit.slotsChanged}/${report.styleAudit.slotsTotal})` : '-'} | ${slots} |`,
  )
}
md.push('', '## 「槽位 → 语义角色」几何草案', '')
md.push('供 `materials/model-slot-roles.ts` 人工校正（仅列出含候选色槽位的模型）。', '')
md.push('```json')
for (const report of modelReports.filter(
  (candidate) => candidate.issues.includes('no-semantic-name') || candidate.issues.includes('family-misc'),
))
  md.push(`  ${JSON.stringify(report.itemType)}: ${JSON.stringify(report.draftRoles)},`)
md.push('```', '')

fs.writeFileSync(path.join(outDir, 'material-role-audit.md'), md.join('\n'))

console.log('材质角色审计完成')
console.log(JSON.stringify(summary, null, 1))
console.log(`报告：${path.relative(repoRoot, path.join(outDir, 'material-role-audit.md'))}`)
