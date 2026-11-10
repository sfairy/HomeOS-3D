/** 逐物件的「材质风格」预设档位（对齐参考实现的 `studio/studio-material-styles.ts`）。档位表按组拆在 `presets/` 下。 */

import { DEVICE_STYLES, KITCHEN_STYLES, STEEL_APPLIANCE_STYLES } from './presets/appliances'
import { DOOR_STYLES } from './presets/door'
import {
  AQUARIUM_STYLES,
  ORNAMENT_STYLES,
  PIANO_STYLES,
  POOL_TABLE_STYLES,
  SCREEN_STYLES,
  SHOWER_STYLES,
  TEA_TABLE_STYLES,
} from './presets/feature-pieces'
import {
  FITNESS_STYLES,
  GARDEN_STYLES,
  KIDS_STYLES,
  MEDIA_STYLES,
  PET_STYLES,
  TABLEWARE_STYLES,
} from './presets/lifestyle'
import type { MaterialStylePreset } from './presets/preset-core'
import { MATERIAL_STYLE_AUTO, completeFurnitureRamp, deriveStyleRoles, styleRoleRecipeFor } from './presets/preset-core'
import { presetGroupFor } from './presets/preset-group-lookup'
import { BASIN_STYLES, CERAMIC_STYLES, GLASS_STYLES } from './presets/sanitary'
import { CURTAIN_STYLES, DECOR_STYLES, LAMP_STYLES, RUG_STYLES } from './presets/soft-decor'
import { STONE_FURNITURE_STYLES } from './presets/stone'
import { UPHOLSTERY_STYLES } from './presets/upholstery'
import { JOINERY_STYLES, PILLAR_STYLES, WOOD_FURNITURE_STYLES } from './presets/woodwork'
import type { MaterialSurface, RoleRecipe, StoneSlabFlavor } from './studio-model-material-roles'
import {
  isStoneSlabFlavor,
  materialRoleRecipeForRole,
  materialSurfaceFinish,
  resolveMaterialPaletteColor,
  resolveModelMaterialRole,
  scaleMaterialColorChannels,
} from './studio-model-material-roles'
import { stoneSlabSwatchHex } from './studio-surface-textures'

export { MATERIAL_STYLE_AUTO, STRUCTURAL_OR_SOFT_ROLES } from './presets/preset-core'

const PRESET_GROUPS: Readonly<Record<string, readonly MaterialStylePreset[]>> = Object.freeze({
  upholstery: UPHOLSTERY_STYLES,
  joinery: JOINERY_STYLES,
  pillar: PILLAR_STYLES,
  woodwork: WOOD_FURNITURE_STYLES,
  door: DOOR_STYLES,
  marbleTable: STONE_FURNITURE_STYLES,

  kitchen: KITCHEN_STYLES,
  steelAppliance: STEEL_APPLIANCE_STYLES,
  device: DEVICE_STYLES,
  ceramic: CERAMIC_STYLES,

  basin: BASIN_STYLES,
  glass: GLASS_STYLES,
  lamp: LAMP_STYLES,
  decor: DECOR_STYLES,
  rug: RUG_STYLES,
  curtain: CURTAIN_STYLES,
  aquarium: AQUARIUM_STYLES,
  piano: PIANO_STYLES,
  screen: SCREEN_STYLES,
  poolTable: POOL_TABLE_STYLES,
  shower: SHOWER_STYLES,
  teaTable: TEA_TABLE_STYLES,
  ornament: ORNAMENT_STYLES,
  pet: PET_STYLES,
  kids: KIDS_STYLES,
  media: MEDIA_STYLES,
  fitness: FITNESS_STYLES,
  tableware: TABLEWARE_STYLES,
  garden: GARDEN_STYLES,
})

/**
 * 全部内置档位（组名 → 档位数组）。
 *
 * 导出给审计 **M6「档位把结构 / 软装角色刷成金属」**：审计遍历同一份表，
 * 用同一份 `STRUCTURAL_OR_SOFT_ROLES` 词表判定，保证「运行时收口」与「审计口径」一致。
 */
export const MATERIAL_STYLE_PRESET_GROUPS = PRESET_GROUPS

/** `auto` 档在下拉里的显示名：柱体不是「跟随全局风格」，而是配墙。 */
const MATERIAL_STYLE_AUTO_LABEL_BY_MODEL_TYPE: Readonly<Record<string, string>> = Object.freeze({
  pillar: '配墙（跟随墙体）',
  pillar_round: '配墙（跟随墙体）',
  pillar_semicircle: '配墙（跟随墙体）',
  pillar_quarter: '配墙（跟随墙体）',
  pillar_quarterinner: '配墙（跟随墙体）',
})

/** 该模型是否支持「材质风格」档位。 */
export function isMaterialStyleCapable(modelType: string): boolean {
  return presetGroupFor(modelType) !== null
}

/**
 * 逐模型的**档位剔除**：组里有一档对这件素材毫无意义的构件（没有腿 / 没有金属 / 没有可换的面），
 * 选出来和另一档出图**完全一样** —— 留在下拉里只是让人以为「设置没生效」。
 *
 * 只影响下拉里能选什么：`normalizeMaterialStyle()` 会把旧存档里的失效 id 归回 `auto`，
 * 已有的场景存档不会因为这一行而报错。
 */
const PRESET_IDS_OMITTED_BY_MODEL_TYPE: Readonly<Record<string, readonly string[]>> = Object.freeze({
  /** 床上托盘只有 `board` 一个可换面，没有腿 / 金属件：该档与「胡桃木」出图完全相同。 */
  'bed-tray': ['wood-black-metal'],
})

/** 某模型可选的档位（不含「跟随全局风格」，那一项由界面统一补在最前）。 */
export function materialStyleOptionsFor(modelType: string): readonly MaterialStylePreset[] {
  const presetGroup = presetGroupFor(modelType)
  if (!presetGroup) return []
  const builtinPresets = PRESET_GROUPS[presetGroup] || [],
    customPresets = customPresetsByGroup.get(presetGroup) || [],
    options = customPresets.length ? [...builtinPresets, ...customPresets] : builtinPresets,
    omitted = PRESET_IDS_OMITTED_BY_MODEL_TYPE[modelType]
  if (!omitted?.length) return options
  return options.filter((preset) => !omitted.includes(preset.id))
}

/** 该模型类型所属的档位组名； */
export function materialStyleGroupFor(modelType: string): string {
  return presetGroupFor(modelType) || ''
}

/** `auto` 档的显示名。 */
export function materialStyleAutoLabel(modelType: string): string {
  return MATERIAL_STYLE_AUTO_LABEL_BY_MODEL_TYPE[modelType] || '跟随全局风格'
}

/** 取某个档位定义； */
export function materialStylePresetFor(modelType: string, styleId: unknown): MaterialStylePreset | null {
  if (!styleId || styleId === MATERIAL_STYLE_AUTO) return null
  return materialStyleOptionsFor(modelType).find((preset) => preset.id === styleId) || null
}

/**
 * 「材质风格」色卡条的重建指纹：模型类型 + **档位 id 列表** + 槽位角色。
 *
 * id 列表必须参与，不能只数个数。档位组换血时个数与角色都可能原封不动 —— 例如台面
 * 从自己的组并回台盆组，两组都是 5 档、都只有 `rim` 一个角色 —— 只靠个数就**不会重建
 * 色卡条**，面板上留着的仍是旧 id：点一下写进模型的是个已经不合法（或指向别组）的 id，
 * `normalizeMaterialStyle` 把它归成 `auto`，存盘时连键一起删掉（`normalizeItemMaterialStyle`
 * 返回 null）。现场表现就是「明明选过档位，颜色还是没跟着走」。
 */
export function materialStyleOptionsSignature(modelType: string, slotRoles?: readonly string[] | null): string {
  const presetIds = materialStyleOptionsFor(modelType)
      .map((preset) => preset.id)
      .join('|'),
    roleSignature = (slotRoles || []).filter(Boolean).join(',')
  return `${modelType}:${presetIds}:${roleSignature}`
}

/** 把任意取值归一到「该模型下合法的档位 id」。 */
export function normalizeMaterialStyle(modelType: string, styleValue: unknown): string {
  if (typeof styleValue !== 'string' || !styleValue || styleValue === MATERIAL_STYLE_AUTO) {
    return MATERIAL_STYLE_AUTO
  }
  return materialStylePresetFor(modelType, styleValue) ? styleValue : MATERIAL_STYLE_AUTO
}

/** 档位显示名； */
export function materialStyleLabel(modelType: string, styleId: unknown): string {
  const preset = materialStylePresetFor(modelType, styleId)
  return preset ? preset.label : materialStyleAutoLabel(modelType)
}

/** 档位附带的调色板覆盖（合并进该物件的 palette）； */
export function materialStylePaletteColors(modelType: string, styleId: unknown): Record<string, number> {
  const preset = materialStylePresetFor(modelType, styleId)
  return preset ? { ...preset.colors } : {}
}

/** 色卡缩略图的取色顺序：先「大面」后「小件」。 */
const MATERIAL_STYLE_SWATCH_ROLE_ORDER: readonly string[] = Object.freeze([
  'top',
  'surface',
  'slab',
  'body',
  'door',

  'frame',
  'glass',
  'panel',
  'drawer',
  'shelf',
  'leg',
  'base',
  'trim',
  'fabric',
  'upholstery',
  'seat',
  'cushion',
  'shutter',
  'slat',
  'metal',
  'handle',
  'accent',
])

/** 档位只改调色板键、不写角色配方时（石材台面那种）退回顺序。 */
const MATERIAL_STYLE_SWATCH_PALETTE_KEYS: readonly string[] = Object.freeze([
  'countertop',
  'cabinetDoor',
  'cabinetBody',
  'cabinetWood',
  'wood',
  'furniture',
])

/** 角色在色卡上的排序权重（越靠前越是「一眼看到的面」）； */
function swatchRoleRank(role: string): number {
  const rank = MATERIAL_STYLE_SWATCH_ROLE_ORDER.indexOf(role)
  return rank < 0 ? MATERIAL_STYLE_SWATCH_ROLE_ORDER.length : rank
}

const swatchHex = (colorValue: number) => '#' + (colorValue & 0xffffff).toString(16).padStart(6, '0')

/** 档位色卡上显示的缩略色（最多四格）。
 *
 * @param options.roles 这件模型真实槽位对应的角色（按槽位顺序，可以带 null）
 * @param options.limit 最多几格，默认 4
 */
export function materialStylePresetSwatchColors(
  preset: MaterialStylePreset | null | undefined,
  fallbackPalette?: Readonly<Record<string, unknown>> | null,
  options?: { roles?: readonly (string | null)[] | null; limit?: number; modelType?: string },
): readonly string[] {
  const limit = options?.limit ?? 4
  const palette: Record<string, unknown> = {
    ...(fallbackPalette || {}),
    ...((preset && preset.colors) || {}),
  }
  const swatchColors: string[] = []

  const push = (roleRecipe: RoleRecipe | undefined, fallbackRecipeColor?: number) => {
    // 石材板角色的 `color` 往往是白底（深浅全在贴图上）：色卡改用石板纹理的代表色，
    // 否则「白石黑座」的黑座会被画成一块白，看着就像档位没生效。
    const slabHex = isStoneSlabFlavor(roleRecipe?.slab) ? stoneSlabSwatchHex(roleRecipe.slab) : null
    if (slabHex) {
      if (!swatchColors.includes(slabHex)) swatchColors.push(slabHex)
      return
    }
    const colorValue = roleRecipe
      ? scaleMaterialColorChannels(resolveMaterialPaletteColor(palette, roleRecipe.color), roleRecipe.multiply ?? 1)
      : fallbackRecipeColor
    if (colorValue === undefined || !Number.isFinite(colorValue)) return
    const hexColor = swatchHex(colorValue)
    if (!swatchColors.includes(hexColor)) swatchColors.push(hexColor)
  }
  if (!preset) return ['#6b7280']

  const modelRoles = (options?.roles || []).filter((role): role is string => Boolean(role))
  if (modelRoles.length) {
    const seenRoles = new Set<string>()
    const orderedRoles = [...modelRoles]
      .sort((roleA, roleB) => swatchRoleRank(roleA) - swatchRoleRank(roleB))
      .filter((roleName) => {
        if (seenRoles.has(roleName)) return false
        seenRoles.add(roleName)
        return true
      })
    for (const roleName of orderedRoles) {
      if (swatchColors.length >= limit) break

      const styleRecipe = styleRoleRecipeFor(options?.modelType, roleName, preset)
      if (styleRecipe) {
        push(styleRecipe)
        continue
      }

      const roleColor = options?.modelType
        ? materialRoleRecipeForRole(options.modelType, roleName, palette)?.colorValue
        : undefined
      if (roleColor !== undefined) push(undefined, roleColor)
    }
  }

  if (!swatchColors.length) {
    for (const roleName of MATERIAL_STYLE_SWATCH_ROLE_ORDER) {
      if (swatchColors.length >= limit) break
      push(styleRoleRecipeFor(options?.modelType, roleName, preset))
    }
  }

  if (!swatchColors.length) {
    for (const paletteKey of MATERIAL_STYLE_SWATCH_PALETTE_KEYS) {
      if (swatchColors.length >= limit) break
      const paletteColor = palette[paletteKey]
      if (typeof paletteColor === 'number') push(undefined, paletteColor)
    }
  }
  return swatchColors.length ? swatchColors : ['#6b7280']
}

/** 个人预设 id 前缀：与内置档位同处一个命名空间，但绝不会撞名。 */
const MATERIAL_STYLE_CUSTOM_PREFIX = 'custom:'

/** 个人预设的可持久化形态（localStorage 里存的就是这个数组）。 */
interface MaterialStyleCustomRecord {
  id: string
  label: string
  /** 归属的档位组（与 `PRESET_GROUPS` 的键一致）：决定哪些模型能看到它。 */
  group: string
  surface?: MaterialSurface
  colors: Record<string, number>
  roles: Record<string, RoleRecipe>
}

/** 打个人预设用的一行采样：直接取面板上看到的出图结果。 */
interface MaterialStyleSnapshotSlot {
  role: string
  /** 当前出图色（`#rrggbb`）。 */
  color: string
  roughness: number
  metalness: number
  /** 该槽位当前用的石材板色号（`""` / 不填 = 不是石板）。 */
  slab?: StoneSlabFlavor | ''
}

const customPresetsByGroup = new Map<string, MaterialStylePreset[]>()

function hexColorToNumber(hexColor: string): number | null {
  if (typeof hexColor !== 'string' || !/^#[0-9a-f]{6}$/i.test(hexColor)) return null
  return Number.parseInt(hexColor.slice(1), 16)
}

function clampUnitInterval(value: unknown, fallback: number): number {
  return typeof value == 'number' && Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : fallback
}

function toCustomPreset(record: MaterialStyleCustomRecord): MaterialStylePreset | null {
  if (!record || typeof record.id != 'string' || !record.id.startsWith(MATERIAL_STYLE_CUSTOM_PREFIX)) return null
  if (!record.group || !PRESET_GROUPS[record.group]) return null
  const roleEntries = Object.entries(record.roles || {}).filter(
    ([roleName, roleRecipe]) =>
      Boolean(roleName) &&
      Boolean(roleRecipe) &&
      (typeof roleRecipe.color == 'number' || typeof roleRecipe.color == 'string'),
  )
  if (!roleEntries.length) return null
  return Object.freeze({
    id: record.id,
    label: typeof record.label == 'string' && record.label ? record.label : '我的预设',
    surface: record.surface,
    colors: Object.freeze(completeFurnitureRamp({ ...(record.colors || {}) })),

    roles: Object.freeze(deriveStyleRoles(Object.fromEntries(roleEntries))),
  })
}

/** 装载个人预设（由 studio-app 从 localStorage 读出后调用； */
export function registerCustomMaterialStyles(records: unknown): MaterialStyleCustomRecord[] {
  customPresetsByGroup.clear()
  const acceptedRecords: MaterialStyleCustomRecord[] = []
  if (!Array.isArray(records)) return acceptedRecords
  for (const rawRecord of records) {
    const customRecord = rawRecord as MaterialStyleCustomRecord,
      customPreset = toCustomPreset(customRecord)
    if (!customPreset) continue
    const groupPresets = customPresetsByGroup.get(customRecord.group) || []
    groupPresets.push(customPreset)
    customPresetsByGroup.set(customRecord.group, groupPresets)
    acceptedRecords.push(customRecord)
  }
  return acceptedRecords
}

/** 把「这件物件此刻的出图结果」打成一档个人预设。 */
export function buildCustomMaterialStyleRecord(
  customId: string,
  label: string,
  groupName: string,
  snapshotSlots: readonly MaterialStyleSnapshotSlot[],
  basePreset: MaterialStylePreset | null,
): MaterialStyleCustomRecord | null {
  if (!customId.startsWith(MATERIAL_STYLE_CUSTOM_PREFIX) || !PRESET_GROUPS[groupName]) return null
  const roles: Record<string, RoleRecipe> = {}

  for (const snapshotSlot of snapshotSlots) {
    if (!snapshotSlot?.role) continue
    const colorValue = hexColorToNumber(snapshotSlot.color)
    if (colorValue === null) continue
    roles[snapshotSlot.role] = {
      color: colorValue,
      roughness: clampUnitInterval(snapshotSlot.roughness, 0.5),
      metalness: clampUnitInterval(snapshotSlot.metalness, 0),

      ...(isStoneSlabFlavor(snapshotSlot.slab) ? { slab: snapshotSlot.slab } : {}),
    }
  }
  if (!Object.keys(roles).length) return null
  return {
    id: customId,
    label,
    group: groupName,
    surface: basePreset?.surface,
    colors: basePreset ? { ...basePreset.colors } : {},
    roles,
  }
}

/** 个人预设 id：同名同组会覆盖（改个名字就是另一档）。 */
export function customMaterialStyleId(groupName: string, label: string): string {
  return MATERIAL_STYLE_CUSTOM_PREFIX + groupName + ':' + encodeURIComponent(label.trim())
}

interface ResolvedMaterialStyleRecipe {
  presetId: string
  role: string
  colorValue?: number
  roughness?: number
  metalness?: number
  transparent?: boolean
  opacity?: number
  depthWrite?: boolean
  flatShading?: boolean
  emissiveValue?: number
  emissiveIntensity?: number
  fabricLike?: boolean
  /** 该角色是否按「整块石材」出图（贴一张自带纹路的大理石整图）。 */
  slab?: StoneSlabFlavor
}

/** 取某材质名在**当前档位**下的配方。 */
export function materialStyleRecipeFor(
  modelType: string,
  materialName: string | undefined,
  palette: Record<string, unknown> | null | undefined,
  materialIndex = 0,
): ResolvedMaterialStyleRecipe | null {
  const styleId = palette?.materialStyle
  const preset = materialStylePresetFor(modelType, styleId)
  if (!preset) return null
  const role = resolveModelMaterialRole(modelType, materialName, materialIndex).role
  const recipe = styleRoleRecipeFor(modelType, role, preset)
  if (!recipe) return null
  const finishSurface = recipe.surface ?? preset.surface

  const slabFlavor = isStoneSlabFlavor(recipe.slab)
    ? recipe.slab
    : isStoneSlabFlavor(preset.slab)
      ? preset.slab
      : undefined
  const finish = finishSurface ? materialSurfaceFinish(finishSurface) : undefined
  const recipeColor = resolveMaterialPaletteColor(palette, recipe.color)
  return {
    presetId: preset.id,
    role,
    colorValue: Number.isFinite(recipeColor)
      ? scaleMaterialColorChannels(recipeColor, recipe.multiply ?? 1)
      : undefined,
    roughness: recipe.roughness ?? finish?.roughness,
    metalness: recipe.metalness ?? finish?.metalness,
    transparent: recipe.transparent,
    opacity: recipe.opacity,
    depthWrite: recipe.depthWrite,
    flatShading: recipe.flatShading,
    emissiveValue: recipe.emissive !== undefined ? resolveMaterialPaletteColor(palette, recipe.emissive) : undefined,
    emissiveIntensity: recipe.emissiveIntensity,
    fabricLike: recipe.fabricLike === true,
    slab: slabFlavor,
  }
}

/** 取某档位下**指定角色**的配方色（跳过「材质名 → 角色」那一步）。 */
export function materialStyleRoleColorFor(
  modelType: string,
  role: string,
  palette: Record<string, unknown> | null | undefined,
): number | undefined {
  const preset = materialStylePresetFor(modelType, palette?.materialStyle)
  const roleRecipe = preset ? styleRoleRecipeFor(modelType, role, preset) : undefined
  if (roleRecipe) {
    const colorValue = resolveMaterialPaletteColor(palette, roleRecipe.color)
    return Number.isFinite(colorValue) ? scaleMaterialColorChannels(colorValue, roleRecipe.multiply ?? 1) : undefined
  }
  return materialRoleRecipeForRole(modelType, role, palette)?.colorValue
}

/**
 * 取某档位下**指定角色**的配方色；**没选档位（auto）时返回 `undefined`**。
 *
 * 与 `materialStyleRoleColorFor` 的差别只在兜底：后者会回落到角色配方色，适合
 * 「面板上要显示一个颜色」；而「配墙」这类**跟随**逻辑必须知道「用户到底选没选档位」，
 * 否则每一档都会被角色配方的微调色（柱础 ×0.92、柱帽 ×1.18）顶掉 ——
 * 柱帽会变成近纯白的 `#FFFFF4`，和墙不是一个颜色。
 */
export function materialStylePresetRoleColorFor(
  modelType: string,
  role: string,
  palette: Record<string, unknown> | null | undefined,
): number | undefined {
  const preset = materialStylePresetFor(modelType, palette?.materialStyle)
  const roleRecipe = preset ? styleRoleRecipeFor(modelType, role, preset) : undefined
  if (!roleRecipe) return undefined
  const colorValue = resolveMaterialPaletteColor(palette, roleRecipe.color)
  return Number.isFinite(colorValue) ? scaleMaterialColorChannels(colorValue, roleRecipe.multiply ?? 1) : undefined
}

/** 该模型的档位组里，**哪些角色**会拿到石材板贴图（跨全部档位的并集）。 */
export function materialStyleStoneSlabRoles(modelType: string): ReadonlySet<string> {
  const slabRoles = new Set<string>()
  for (const preset of materialStyleOptionsFor(modelType))
    for (const [roleName, roleRecipe] of Object.entries(preset.roles))
      if (isStoneSlabFlavor(roleRecipe.slab)) slabRoles.add(roleName)
  return slabRoles
}
