/**
 * 材质语义配色契约回归（材质属性预设全量审计的棘轮）。
 *
 * 背景：0.7.6 批量导出把外部模型材质名改成「无语义的候选色层级」
 * （`<模型>-candidate-<token>`，token ∈ body/dark/light/soft/accent/glass），
 * 真实构件语义（叶片 / 花盆 / 土壤 / 白瓷洁具…）全部丢失；加上默认主题缺语义键、
 * 大批新模型没接家族 / 管线 / 档位表，于是出现「选鲜绿却全是棕」「所有槽位同一个灰」
 * 「选了档位却不改变任何槽位」这类脱靶。
 *
 * 本脚本把那次修复的四条硬契约钉住（**纯逻辑，不需要浏览器**，GLB 只读 JSON chunk）：
 *
 *  1. **身份**：全量 itemType 不得落 `misc`；角色全是明度 token 的模型必须有语义槽位表；
 *     `plant` / `toilet` 这类样板模型的槽位必须还原到真实构件角色。
 *  2. **配色**：叶槽在两个主题下都必须是绿、花盆是陶土、土壤是深棕、洁具主体是白瓷
 *     —— 也就是「绝不塌成家具蓝灰 `#7D8799`」。
 *  3. **档位覆盖**：有「材质风格」档位的模型，**每个** GLB 槽位都要被档位接管，且至少
 *     有一个槽位真的会因为换档位而变色（空转 = 面板给了档位却什么都不做）。
 *  4. **新品类档位组**：宠物 / 儿童 / 影音 / 健身 / 器皿 / 庭院六组必须真的挂上模型。
 *
 * 全量口径与 `scripts/audit/material-role-audit.mjs` 一致（那份审计负责出报告，
 * 这份负责在 CI 上把回归变成红灯）。
 *
 * 用法：`bun run scripts/smoke/_material_role_contracts_smoke.ts`（在 homeos/frontend 下执行）。
 */

import fs from 'node:fs'
import path from 'node:path'

import { WARM_WOOD_STYLE } from '../../src/studio/app/3d-studio/authoring/scene/studio-scene-style'
import { defaultViewSettings } from '../../src/studio/app/3d-studio/authoring/scene/studio-view-settings'
import { roleTableItemTypes } from '../../src/studio/app/3d-studio/loaders/external-models/_shared'
import { ALL_ITEM_MODELS } from '../../src/studio/app/3d-studio/loaders/external-models/all-item-models'
import { COLLECTION_MODELS } from '../../src/studio/app/3d-studio/loaders/external-models/collection-models'
import {
  hasSemanticSlotRoles,
  resolveSemanticSlotRole,
} from '../../src/studio/app/3d-studio/materials/model-slot-roles'
import {
  isMaterialStyleCapable,
  materialStyleGroupFor,
  materialStyleOptionsFor,
  materialStyleOptionsSignature,
  materialStyleRecipeFor,
  normalizeMaterialStyle,
} from '../../src/studio/app/3d-studio/materials/studio-material-presets'
import {
  materialRoleRecipeFor,
  resolveModelFamily,
  resolveModelMaterialRole,
} from '../../src/studio/app/3d-studio/materials/studio-model-material-roles'
import {
  resolveSemanticRoleColor,
  SEMANTIC_ROLE_APPEARANCE,
} from '../../src/studio/app/3d-studio/materials/studio-semantic-roles'

import { check, report, section } from '../_smoke_harness'

/* ------------------------------------------------------------------ *
 * 0. GLB 读取（只要 JSON chunk 里的材质名 + 烘焙色）
 * ------------------------------------------------------------------ */

const MODELS_DIR = path.join(import.meta.dir, '..', '..', 'public/static/3d-studio/models')
const GLB_MAGIC = 0x46546c67
const CHUNK_JSON = 0x4e4f534a

type GlbMaterial = { name: string; baked: number; tris: number }

/** 只声明本脚本用到的那几个字段（不引 GLTF 类型，避免为了读两个字段拖进整套类型）。 */
type GlbJson = {
  materials?: Array<{
    name?: string
    pbrMetallicRoughness?: { baseColorFactor?: number[] }
  }>
  meshes?: Array<{ primitives?: Array<{ material?: number; indices?: number; attributes?: { POSITION?: number } }> }>
  accessors?: Array<{ count?: number }>
}

const linearToSrgb = (channel: number) => {
  const value = Math.max(0, Math.min(1, channel))
  return value <= 0.0031308 ? 12.92 * value : 1.055 * Math.pow(value, 1 / 2.4) - 0.055
}

function readGlbJson(glbPath: string): GlbJson | null {
  let buffer: Buffer
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
        return JSON.parse(buffer.subarray(offset + 8, offset + 8 + chunkLength).toString('utf8'))
      } catch {
        return null
      }
    }
    offset += 8 + chunkLength
  }
  return null
}

const materialCache = new Map<string, GlbMaterial[] | null>()

/** 读某 GLB 的材质表（按文件名缓存）：材质名 + 烘焙色 + 三角面数（判定槽位是否可见）。 */
function glbMaterials(glbFile: string): GlbMaterial[] | null {
  if (materialCache.has(glbFile)) return materialCache.get(glbFile) ?? null
  const glbJson = readGlbJson(path.join(MODELS_DIR, glbFile))
  const materials: GlbMaterial[] | null = glbJson
    ? (glbJson.materials || []).map((material) => {
        const factor = material.pbrMetallicRoughness?.baseColorFactor || [1, 1, 1, 1]
        const baked =
          (Math.round(linearToSrgb(factor[0]) * 255) << 16) |
          (Math.round(linearToSrgb(factor[1]) * 255) << 8) |
          Math.round(linearToSrgb(factor[2]) * 255)
        return { name: material.name || '', baked, tris: 0 }
      })
    : null
  // 三角面数：`0.7.6` 给每款外模型都补齐了 6 个候选色槽，其中大半是空槽（0 面），
  // 只有真有几何的槽位才构成可见缺陷 —— 判据必须按可见性过滤，否则会误报空槽。
  if (materials && glbJson) {
    for (const mesh of glbJson.meshes || []) {
      for (const primitive of mesh.primitives || []) {
        const target = primitive.material == null ? undefined : materials[primitive.material]
        if (!target) continue
        const position = glbJson.accessors?.[primitive.attributes?.POSITION ?? -1]
        const indices = primitive.indices == null ? undefined : glbJson.accessors?.[primitive.indices]
        target.tris += Math.floor((indices?.count ?? position?.count ?? 0) / 3)
      }
    }
  }
  materialCache.set(glbFile, materials)
  return materials
}

/* ------------------------------------------------------------------ *
 * 1. 复算口径（与 material-role-audit.mjs 同源，只保留本契约需要的部分）
 * ------------------------------------------------------------------ */

const DEFAULT_THEME: Record<string, unknown> = { ...defaultViewSettings }
const WARM_THEME: Record<string, unknown> = { ...defaultViewSettings, ...WARM_WOOD_STYLE }
const FALLBACK_GREY = 0x7d8089

/**
 * 0.7.6 批量导出写进 GLB 的**占位蓝灰明度阶梯**（`plant.glb` 五槽全在梯上）。
 *
 * `#7d8089` 只是 `resolveMaterialPaletteColor` 在「连调色板都没有」时的末位常数，
 * 真实运行路径永远传了主题调色板，所以它一次都不会出现 —— 只盯它等于没盯。
 * 真正的外模型「没配色」长相是这七个值（也是默认主题 `furniture*` 的取值）。
 */
const EXPORT_PLACEHOLDER_COLORS = new Set([
  0x525d71, 0x687488, 0x7d8799, 0x9aa5b7, 0x9da8ba, 0xb5bfce, 0xc0cad7,
])

/** 叶片类角色：只要该槽位有几何，就必须是绿色。 */
const FOLIAGE_ROLES = new Set(['foliage', 'foliageSoft', 'foliageLight', 'leaf'])

/** 候选色明度 token：命中说明该槽位还没还原到真实构件。 */
const GENERIC_TOKENS = new Set(['body', 'dark', 'light', 'soft', 'accent', 'glass'])

const slotTokenOf = (materialName: string | undefined): string =>
  (materialName || '').toLowerCase().match(/-([a-z0-9]+)$/)?.[1] ?? ''

const hexOf = (value: number) => '#' + (value >>> 0).toString(16).padStart(6, '0')
const channels = (value: number) => [(value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff] as const

const isGreen = (color: number) => {
  const [r, g, b] = channels(color)
  return g > r + 8 && g > b + 8
}
const isTerracotta = (color: number) => {
  const [r, g, b] = channels(color)
  return r > 0x80 && r > g && g >= b
}
const isDarkBrown = (color: number) => {
  const [r, g, b] = channels(color)
  return Math.max(r, g, b) < 0x70 && r >= b
}
const isWhitePorcelain = (color: number) => Math.min(...channels(color)) >= 0xd0

type Slot = {
  name: string
  baked: number
  role: string
  semanticRole: string | null
  designColor: number
}

/** 复算一个槽位：语义角色 = 槽位表 / 家族词表命中 ?? 尾词角色。 */
function auditSlot(
  itemType: string,
  material: GlbMaterial,
  index: number,
  palette: Record<string, unknown>,
): Slot {
  const resolution = resolveModelMaterialRole(itemType, material.name, index)
  const semanticRole =
    resolveSemanticSlotRole(itemType, resolveModelFamily(itemType), material.name) ??
    resolution.role
  const styleRecipe = materialStyleRecipeFor(itemType, material.name, palette, index)
  const baseColor =
    materialRoleRecipeFor(itemType, material.name, palette, index)?.colorValue ??
    (semanticRole ? resolveSemanticRoleColor(semanticRole, palette) : undefined) ??
    material.baked
  return {
    name: material.name,
    baked: material.baked,
    role: resolution.role,
    semanticRole,
    designColor: styleRecipe?.colorValue ?? baseColor,
  }
}

/** 某档位生效时的调色板（`materialStylePaletteColors` 的等价物 + 主题原样）。 */
function stylePalette(itemType: string, styleId: string): Record<string, unknown> {
  const preset = materialStyleOptionsFor(itemType).find((candidate) => candidate.id === styleId)
  return { ...DEFAULT_THEME, ...(preset ? preset.colors : {}), materialStyle: styleId }
}

/** 全量清单：itemType → GLB 文件名 + 槽位表。 */
const roster: Array<{ itemType: string; glb: string; slots: GlbMaterial[] }> = []
for (const [itemType, definition] of Object.entries(
  ALL_ITEM_MODELS as Record<string, { url?: string }>,
)) {
  const urlMatch = definition?.url?.match(/models\/([^?]+\.glb)/)
  if (!urlMatch) continue
  const slots = glbMaterials(urlMatch[1])
  if (!slots || !slots.length) continue
  roster.push({ itemType, glb: urlMatch[1], slots })
}

const slotsOf = (itemType: string, palette: Record<string, unknown>): Slot[] => {
  const entry = roster.find((candidate) => candidate.itemType === itemType)
  return (entry?.slots ?? []).map((slot, index) => auditSlot(itemType, slot, index, palette))
}

check('全量清单非空（断言不是空跑）', roster.length > 250, `${roster.length} 个 itemType`)

/* ------------------------------------------------------------------ *
 * 2. 身份：家族 + 语义槽位
 * ------------------------------------------------------------------ */

section('1. 身份：家族不落 misc、无语义模型必须有槽位表')

const miscModels = roster
  .filter((entry) => resolveModelFamily(entry.itemType) === 'misc')
  .map((entry) => entry.itemType)
check('没有任何 itemType 被家族误判成 misc', miscModels.length === 0, miscModels.slice(0, 8).join(', '))

const genericOnly = roster
  .filter((entry) => {
    if (hasSemanticSlotRoles(entry.itemType) || COLLECTION_MODELS[entry.itemType]) return false
    return entry.slots.every((slot) =>
      GENERIC_TOKENS.has(resolveModelMaterialRole(entry.itemType, slot.name, 0).role),
    )
  })
  .map((entry) => entry.itemType)
check(
  '角色全是明度 token 的模型都登记了语义槽位表 / 收藏注册表',
  genericOnly.length === 0,
  genericOnly.slice(0, 8).join(', '),
)

{
  const plant = roster.find((entry) => entry.itemType === 'plant')
  check('plant 在清单里（断言不是空跑）', !!plant, '')
  const rolesByToken = new Map<string, string>()
  for (const slot of plant?.slots ?? []) {
    const semanticRole = resolveSemanticSlotRole('plant', 'plant', slot.name)
    if (semanticRole) rolesByToken.set(slotTokenOf(slot.name), semanticRole)
  }
  const expected: Array<[string, string]> = [
    ['body', 'pot'],
    ['dark', 'foliage'],
    ['soft', 'foliageSoft'],
    ['light', 'foliageLight'],
    ['glass', 'saucer'],
  ]
  const wrong = expected.filter(([token, role]) => rolesByToken.get(token) !== role)
  check(
    'plant 五个槽位还原成「花盆 / 叶片 / 浅叶 / 亮叶 / 接水盘」',
    wrong.length === 0,
    wrong
      .map(([token, role]) => `${token}→${rolesByToken.get(token) ?? 'null'}（期望 ${role}）`)
      .join('；'),
  )

  const seatSlot = roster
    .find((entry) => entry.itemType === 'toilet')
    ?.slots.find((slot) => slot.name.includes('sanitary-seat'))
  check(
    'toilet 的座圈槽位还原成 seat（不再是 body / 明度 token）',
    !!seatSlot && resolveSemanticSlotRole('toilet', 'ceramic', seatSlot.name) === 'seat',
    seatSlot?.name ?? '找不到 toilet 座圈槽位',
  )
}

/* ------------------------------------------------------------------ *
 * 3. 配色：写实语义（两个主题都不许塌成灰）
 * ------------------------------------------------------------------ */

section('2. 写实配色：叶绿 / 陶盆 / 深棕土 / 白瓷（默认 + 暖木）')

/**
 * 语义配色层自检：**没有任何角色的写实默认色落在导出占位蓝灰阶梯上**。
 * 语义层是「配方缺失时的最后一道兜底」，它自己必须是写实色 —— 否则兜底等于没兜。
 */
const placeholderRoles = Object.entries(SEMANTIC_ROLE_APPEARANCE)
  .filter(([, appearance]) => EXPORT_PLACEHOLDER_COLORS.has(appearance.defaultColor))
  .map(([role, appearance]) => `${role}=${hexOf(appearance.defaultColor)}`)
check(
  '语义配色层没有任何角色的写实默认色是导出占位蓝灰',
  placeholderRoles.length === 0 && Object.keys(SEMANTIC_ROLE_APPEARANCE).length >= 100,
  placeholderRoles.length
    ? placeholderRoles.join(', ')
    : `${Object.keys(SEMANTIC_ROLE_APPEARANCE).length} 个角色全部为写实色`,
)

for (const [themeLabel, theme] of [
  ['默认主题', DEFAULT_THEME],
  ['暖木主题', WARM_THEME],
] as const) {
  const plantSlots = slotsOf('plant', theme)
  const leafSlots = plantSlots.filter((slot) =>
    ['foliage', 'foliageSoft', 'foliageLight'].includes(slot.semanticRole ?? ''),
  )
  check(
    `${themeLabel}：plant 的叶槽全部是绿`,
    leafSlots.length >= 3 && leafSlots.every((slot) => isGreen(slot.designColor)),
    leafSlots.map((slot) => `${slot.semanticRole}=${hexOf(slot.designColor)}`).join(' '),
  )
  const potSlot = plantSlots.find((slot) => slot.semanticRole === 'pot')
  check(
    `${themeLabel}：plant 的花盆是陶土 / 木色（不是蓝灰）`,
    !!potSlot && isTerracotta(potSlot.designColor),
    potSlot ? hexOf(potSlot.designColor) : '找不到花盆槽位',
  )

  const toiletSlots = slotsOf('toilet', theme)
  const porcelainSlot = toiletSlots.find((slot) => slot.semanticRole === 'ceramic')
  const seat = toiletSlots.find((slot) => slot.semanticRole === 'seat')
  check(
    `${themeLabel}：toilet 陶瓷体 + 座圈都是白瓷`,
    !!porcelainSlot &&
      !!seat &&
      isWhitePorcelain(porcelainSlot.designColor) &&
      isWhitePorcelain(seat.designColor),
    porcelainSlot && seat
      ? `ceramic=${hexOf(porcelainSlot.designColor)} seat=${hexOf(seat.designColor)}`
      : '找不到 sanitary-ceramic / sanitary-seat 槽位',
  )

  // 语义配色层本身：即便某个主题没写语义键，也必须是写实色（土壤深棕 / 叶绿）。
  const roleColors = (['foliage', 'foliageSoft', 'foliageLight', 'soil'] as const).map((role) => ({
    role,
    color: resolveSemanticRoleColor(role, theme),
  }))
  const leafRoles = roleColors.filter((item) => item.role !== 'soil')
  const soilRole = roleColors.find((item) => item.role === 'soil')
  check(
    `${themeLabel}：语义配色层的叶绿角色都是绿`,
    leafRoles.every((item) => typeof item.color === 'number' && isGreen(item.color)),
    leafRoles.map((item) => `${item.role}=${typeof item.color === 'number' ? hexOf(item.color) : 'undefined'}`).join(' '),
  )
  check(
    `${themeLabel}：语义配色层的土壤是深棕`,
    typeof soilRole?.color === 'number' && isDarkBrown(soilRole.color),
    typeof soilRole?.color === 'number' ? hexOf(soilRole.color) : 'undefined',
  )

  const greySlots = roster.flatMap((entry) =>
    entry.slots
      .map((slot, index) => ({ entry, slot: auditSlot(entry.itemType, slot, index, theme) }))
      .filter((item) => item.slot.designColor === FALLBACK_GREY),
  )
  check(
    `${themeLabel}：没有任何槽位落到兜底灰 #7d8089`,
    greySlots.length === 0,
    greySlots
      .slice(0, 6)
      .map((item) => `${item.entry.itemType}/${item.slot.name}`)
      .join(', '),
  )

  /**
   * 全量：**叶片不许是导出占位蓝灰**。
   *
   * 这条是这次审查补上的关键口子：只查 `#7d8089` 是查了个不会出现的常数，
   * 而 0.7.6 的外模型「没配色」长相是 `#7d8799` 那条明度梯 ——
   * 庭院乔木的树冠、绿篱、草坪、小盆栽的叶片曾经整片落在梯上（蓝灰树叶）。
   * 只对**有几何**的叶片槽判定：每款模型都补齐了 6 个候选色槽，空槽不可见。
   */
  const placeholderLeaves = roster.flatMap((entry) =>
    entry.slots.flatMap((slot, index) => {
      if (slot.tris <= 0) return []
      const audited = auditSlot(entry.itemType, slot, index, theme)
      if (!FOLIAGE_ROLES.has(audited.semanticRole ?? '')) return []
      if (!EXPORT_PLACEHOLDER_COLORS.has(audited.designColor)) return []
      return [{ entry, slot: audited }]
    }),
  )
  check(
    `${themeLabel}：可见的叶片槽没有一个是导出占位蓝灰`,
    placeholderLeaves.length === 0,
    placeholderLeaves
      .slice(0, 8)
      .map((item) => `${item.entry.itemType}/${item.slot.name}=${hexOf(item.slot.designColor)}`)
      .join(', '),
  )

  /**
   * 庭院 / 摆件绿植：这些模型**不**走 `materialRoleRecipeForRole`，而是由
   * `studio-external-models.ts` 的庭院 / 摆件分支直接查 `courtyardPalette()` / `DECOR_THEMES`，
   * 所以语义层管不到它们 —— `DECOR_THEMES.default.leaf` 曾经与 `base` **同值**（导出占位蓝灰），
   * 于是庭院乔木的树冠、绿篱、草坪全是蓝灰。这条断言把「盘外」的绿化也钉住。
   */
  const gardenLeafCases = [
    'garden-tree',
    'garden-hedge',
    'garden-shrub',
    'garden-lawn',
    'garden-grass-clump',
    'garden-bamboo',
    'garden-flowers',
    'decor-small-plant',
  ]
  const gardenLeafBad = gardenLeafCases.flatMap((itemType) => {
    const entry = roster.find((candidate) => candidate.itemType === itemType)
    if (!entry) return [`${itemType}: 找不到 GLB`]
    return entry.slots.flatMap((slot, index) => {
      if (slot.tris <= 0) return []
      const audited = auditSlot(itemType, slot, index, theme)
      if (!FOLIAGE_ROLES.has(audited.semanticRole ?? '')) return []
      return isGreen(audited.designColor)
        ? []
        : [`${itemType}/${slot.name}=${hexOf(audited.designColor)}`]
    })
  })
  check(
    `${themeLabel}：庭院乔木 / 绿篱 / 草坪 / 小盆栽的叶片都是绿`,
    gardenLeafBad.length === 0,
    gardenLeafBad.slice(0, 8).join(', '),
  )
}

/* ------------------------------------------------------------------ *
 * 4. 档位覆盖：有档位就必须接管每一个槽位，且至少一个槽位真的变色
 * ------------------------------------------------------------------ */

section('3. 档位覆盖：有档位的模型不得有「没被档位接管的槽位」')

const uncovered: string[] = []
const idle: string[] = []
let styleCapableCount = 0

for (const entry of roster) {
  if (!isMaterialStyleCapable(entry.itemType)) continue
  styleCapableCount += 1
  const firstPreset = materialStyleOptionsFor(entry.itemType)[0]
  if (!firstPreset) continue
  const palette = stylePalette(entry.itemType, firstPreset.id)
  const missing = entry.slots.filter(
    (slot, index) => materialStyleRecipeFor(entry.itemType, slot.name, palette, index) === null,
  )
  if (missing.length) {
    uncovered.push(`${entry.itemType}:${missing.map((slot) => slotTokenOf(slot.name)).join('/')}`)
  }
  const changed = entry.slots.some((slot, index) => {
    const before = auditSlot(entry.itemType, slot, index, DEFAULT_THEME).designColor
    const after = auditSlot(entry.itemType, slot, index, palette).designColor
    return before !== after
  })
  if (!changed) idle.push(entry.itemType)
}

check('有档位的模型数量看起来正常（断言不是空跑）', styleCapableCount > 250, styleCapableCount)
check(
  '每个有档位的模型的每个槽位都被档位接管（无「半生效」）',
  uncovered.length === 0,
  uncovered.slice(0, 8).join(', '),
)
check(
  '没有「档位空转」（选了档位至少一个槽位变色）',
  idle.length === 0,
  idle.slice(0, 8).join(', '),
)

/* ------------------------------------------------------------------ *
 * 5. 新品类档位组真的挂上了模型
 * ------------------------------------------------------------------ */

section('4. 新品类档位组挂载')

const GROUP_SAMPLES: Array<[string, string]> = [
  ['pet', 'cat-tree'],
  ['kids', 'ball-pit'],
  ['fitness', 'treadmill'],
  ['media', 'soundbar'],
  ['tableware', 'dish-rack'],
  ['garden', 'garden-bench-backless'],
]
const ungrouped = GROUP_SAMPLES.filter(
  ([group, itemType]) => materialStyleGroupFor(itemType) !== group,
).map(
  ([group, itemType]) =>
    `${itemType}（期望 ${group}，实际 ${materialStyleGroupFor(itemType) || '无'}）`,
)
check(
  '宠物 / 儿童 / 健身 / 影音 / 器皿 / 庭院各自挂到对应档位组',
  ungrouped.length === 0,
  ungrouped.join('；'),
)

/* ------------------------------------------------------------------ *
 * 6. 管线接入：对照表 / 收藏模型不能是死配置
 * ------------------------------------------------------------------ */

section('5. 管线接入：语义槽位表 / 收藏注册表模型必须进材质管线')

const PIPELINE_SAMPLES = ['plant', 'plant-monstera', 'cat-tree', 'pet-bed-bowls', 'treadmill']
const detached = PIPELINE_SAMPLES.filter(
  (itemType) =>
    !hasSemanticSlotRoles(itemType) &&
    !roleTableItemTypes.has(itemType) &&
    !COLLECTION_MODELS[itemType],
)
check('样板模型的语义配色不会被管线丢弃', detached.length === 0, detached.join(', '))

/* ------------------------------------------------------------------ *
 * 7. 台面素材 = 台盆那张台面：同一份档位表，逐档同料
 * ------------------------------------------------------------------ */

section('6. 台面素材与台盆台面共用档位表、逐档同色')

/** 从「派生素材 → 母件」：台面这件素材就是台盆那张台面板，材质必须逐档一一对应。 */
const SLAB_HOST_PAIRS: Array<[slab: string, host: string]> = [['countertop', 'basin']]

const groupMismatch = SLAB_HOST_PAIRS.filter(
  ([slabType, hostType]) =>
    !materialStyleGroupFor(slabType) ||
    materialStyleGroupFor(slabType) !== materialStyleGroupFor(hostType),
).map(
  ([slabType, hostType]) =>
    `${slabType} 组=${materialStyleGroupFor(slabType) || '无'} ≠ ${hostType} 组=${materialStyleGroupFor(hostType) || '无'}`,
)
check(
  '台面与台盆挂同一份档位注册表（同一批档位 id）',
  groupMismatch.length === 0,
  groupMismatch.join('；'),
)

/**
 * 档位 id 双向合法。这条是「看着不一样」最常见的成因：母件的档位 id 在派生件上不合法时，
 * `normalizeMaterialStyle` **不报错**，只把值打成 `auto`，于是派生件悄悄退回主题默认色 ——
 * 存盘时该键还会整个消失（`studio-scene-payload.ts` 的 `normalizeItemMaterialStyle`），
 * 现场看起来就是「明明选过档位，颜色还是对不上」。
 */
const idMismatch: string[] = []
for (const [slabType, hostType] of SLAB_HOST_PAIRS) {
  const slabIds = new Set(materialStyleOptionsFor(slabType).map((preset) => preset.id))
  const hostIds = new Set(materialStyleOptionsFor(hostType).map((preset) => preset.id))
  for (const id of hostIds) {
    if (!slabIds.has(id)) idMismatch.push(`${slabType} 缺 ${id}`)
    const normalized = normalizeMaterialStyle(slabType, id)
    if (normalized !== id) idMismatch.push(`${slabType} 把 ${id} 归一成 ${normalized}`)
  }
  for (const id of slabIds) if (!hostIds.has(id)) idMismatch.push(`${hostType} 缺 ${id}`)
}
check(
  '台盆的每个档位 id 在台面上同样合法（不会被悄悄归一成 auto）',
  idMismatch.length === 0,
  idMismatch.slice(0, 8).join('；'),
)

/**
 * 色卡条重建指纹必须带 **档位 id 列表**。
 *
 * 只数个数的话，「组换血但个数没变」的情况下界面不会重建色卡条，留着的旧 id 一旦被点中
 * 就会被归一成 `auto` 并从存盘里删掉 —— 现场就是「选过档位，颜色没跟着走」。
 */
const stripModelType = SLAB_HOST_PAIRS[0][1]
const stripSignature = materialStyleOptionsSignature(stripModelType, ['rim', ''])
check(
  '色卡条重建指纹带档位 id 列表（改名 / 换组也会触发重建）',
  materialStyleOptionsFor(stripModelType).every((preset) => stripSignature.includes(preset.id)),
  `指纹：${stripSignature}`,
)
const stripSignatureWithoutRoles = materialStyleOptionsSignature(stripModelType)
check(
  '色卡条重建指纹把「槽位角色」也算进去（同组不同件不会互相复用色卡条）',
  stripSignatureWithoutRoles !== stripSignature,
  `${stripSignatureWithoutRoles} vs ${stripSignature}`,
)

/** 逐档 × 逐主题：台面那张板与台盆 `light` 槽位必须是同一个色（`auto` 也要对得上）。 */
const slabColorMismatch: string[] = []
for (const [themeLabel, theme] of [
  ['默认主题', DEFAULT_THEME],
  ['暖木主题', WARM_THEME],
] as const) {
  for (const [slabType, hostType] of SLAB_HOST_PAIRS) {
    const styleIds: Array<string | null> = [null, ...materialStyleOptionsFor(hostType).map((preset) => preset.id)]
    for (const styleId of styleIds) {
      const preset = materialStyleOptionsFor(hostType).find((candidate) => candidate.id === styleId)
      const palette: Record<string, unknown> = {
        ...theme,
        ...(preset ? preset.colors : {}),
        ...(preset ? { materialStyle: preset.id } : {}),
      }
      const slabRim = slotsOf(slabType, palette).find((slot) => slot.role === 'rim')
      const hostRim = slotsOf(hostType, palette).find((slot) => slot.role === 'rim')
      if (!slabRim || !hostRim) {
        slabColorMismatch.push(`${themeLabel}/${styleId ?? 'auto'}：${slabType} 或 ${hostType} 没有 rim 槽位`)
        continue
      }
      if (slabRim.designColor !== hostRim.designColor)
        slabColorMismatch.push(
          `${themeLabel}/${styleId ?? 'auto'}：${slabType}=${hexOf(slabRim.designColor)} ≠ ${hostType}=${hexOf(hostRim.designColor)}`,
        )
    }
  }
}
check(
  '同一档位下，台面那张板与台盆 `light` 槽位同色（两套主题、含 auto）',
  slabColorMismatch.length === 0,
  slabColorMismatch.slice(0, 8).join('；'),
)

report('材质语义配色契约回归')
