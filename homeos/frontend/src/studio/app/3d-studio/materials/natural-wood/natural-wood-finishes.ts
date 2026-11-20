/**
 * 家具 / 柜类 / 电器三类模型的「自然木语」饰面表（0.8.7 `natural-wood-home-materials.js`
 * 与 `natural-wood-cabinet-materials.js` 的对应实现）。
 *
 * 为什么要分三张表而不是一张大表：
 * - **家具体量最大**（沙发 / 床 / 桌椅），沿用木 + 布 + 石三件套；
 * - **柜类有明确的部位语义**（柜体 / 柜门 / 台面 / 把手），同一件柜子必须共享板材色，
 *   否则每块门板一个色号，看起来像拼装货；
 * - **电器是「白色家电 + 少量木饰」**，木色只出现在边框与把手，机身必须是哑光米白。
 *
 * 表的键是「材质角色」（0.8.7 的 role 名），值是「种类 + 相对调色板的取色 + 参数」。
 */
import type { NaturalWoodKind } from './natural-wood-materials'
import { NATURAL_WOOD_PALETTE as palette } from './natural-wood-materials'

/** 一条饰面规则：种类 + 取色 + 可选的参数覆盖。 */
export interface NaturalWoodSurface {
  kind: NaturalWoodKind
  color: number
  roughness?: number
  metalness?: number
  /** 木纹是否沿竖直方向（柜门 / 墙板）。 */
  verticalGrain?: boolean
  /** 细节强度倍数。 */
  detailScale?: number
  opacity?: number
}

/** 柜类模型的类型集合（0.8.7 `NATURAL_CABINET_TYPES`）。 */
export const NATURAL_CABINET_TYPES = new Set([
  'wardrobe',
  'wardrobe-two-section',
  'drawer-chest',
  'cabinet',
  'cabinet-two-section',
  'sideboard',
  'shoecabinet',
  'bookcase',
  'shelf',
  'desk',
  'tvstand',
  'slim-recessed-cabinet',
  'entryway-niche-cabinet',
  'arched-glass-console',
  'single-glass-cabinet',
  'glasscabinet',
  'storage-box',
  'storage-cart',
  'wallcabinet',
  'kitchenbase',
  'kitchen-island',
  'vanity',
])

/** 原生设备类型（0.8.7 `NATURAL_NATIVE_MODEL_TYPES`）：这些模型的材质在建模期就固定。 */
export const NATURAL_NATIVE_MODEL_TYPES = new Set(['airer', 'fan', 'speaker', 'camera', 'presence'])

/**
 * 柜类饰面：柜体/门板用同色不同名，台面走石材，把手走金属。
 *
 * 关键约定：`body` 与 `door` 必须是**同一色号的两个明度档**（`oak` / `lightOak`），
 * 否则门板一开一关会有明显色差（0.8.7 的柜类就是这样处理的）。
 */
export const NATURAL_CABINET_FINISHES: Readonly<Record<string, NaturalWoodSurface>> = Object.freeze({
  body: { kind: 'wood', color: palette.oak },
  door: { kind: 'wood', color: palette.lightOak, verticalGrain: true },
  panel: { kind: 'wood', color: palette.lightOak, verticalGrain: true },
  drawer: { kind: 'wood', color: palette.lightOak },
  top: { kind: 'stone', color: palette.stone, roughness: 0.5 },
  countertop: { kind: 'stone', color: palette.stone, roughness: 0.5 },
  handle: { kind: 'metal', color: palette.metal },
  trim: { kind: 'wood', color: palette.walnut },
  inset: { kind: 'wood', color: palette.walnut },
  back: { kind: 'wood', color: palette.caramel },
  glass: { kind: 'glass', color: palette.glass, opacity: 0.22 },
  mirror: { kind: 'glass', color: palette.glass, opacity: 0.14 },
})

/** 家具饰面（沙发 / 床 / 桌椅 / 植物）。 */
export const NATURAL_HOME_FINISHES: Readonly<Record<string, NaturalWoodSurface>> = Object.freeze({
  wood: { kind: 'wood', color: palette.oak },
  legs: { kind: 'wood', color: palette.walnut },
  frame: { kind: 'wood', color: palette.walnut },
  body: { kind: 'wood', color: palette.oak },
  soft: { kind: 'linen', color: palette.linen },
  fabric: { kind: 'linen', color: palette.linen },
  upholstery: { kind: 'linen', color: palette.linen },
  bedding: { kind: 'linen', color: palette.bedding },
  cushion: { kind: 'linen', color: palette.cream },
  rug: { kind: 'rug', color: palette.rug },
  leather: { kind: 'leather', color: palette.caramel },
  top: { kind: 'stone', color: palette.stone },
  stone: { kind: 'stone', color: palette.stone },
  metal: { kind: 'metal', color: palette.metal },
  glass: { kind: 'glass', color: palette.glass, opacity: 0.2 },
  /** 木饰条 / 嵌条：比主体深一档，用来勾边。 */
  accent: { kind: 'wood', color: palette.accent },
  leaf: { kind: 'leaf', color: palette.leaf },
  plant: { kind: 'leaf', color: palette.leaf },
  soil: { kind: 'soil', color: palette.bronze, roughness: 0.98 },
})

/**
 * 原生设备饰面（0.8.7 `natural-wood-native-materials.js` 的 `l` 表）。
 *
 * 设备的外壳一律米白（`ivory`），只有少量部件用木色或织物：
 * 晾衣架的杆是拉丝钢、风扇的叶片是鼠尾草绿织物、音响的网布是亚麻。
 */
export const NATURAL_NATIVE_FINISHES: Readonly<Record<string, Readonly<Record<string, NaturalWoodSurface>>>> =
  Object.freeze({
    airer: {
      body: { kind: 'ceramic', color: palette.cream, roughness: 0.42 },
      soft: { kind: 'metal', color: palette.metal },
      dark: { kind: 'metal', color: palette.bronze },
      trim: { kind: 'metal', color: palette.metal },
      metal: { kind: 'metal', color: palette.metal },
      cable: { kind: 'metal', color: palette.bronze },
    },
    fan: {
      body: { kind: 'ceramic', color: palette.cream, roughness: 0.42 },
      soft: { kind: 'linen', color: palette.leaf },
      dark: { kind: 'metal', color: palette.bronze },
      accent: { kind: 'metal', color: palette.metal },
      stem: { kind: 'metal', color: palette.metal },
      base: { kind: 'ceramic', color: palette.cream },
      blade: { kind: 'linen', color: palette.leaf, roughness: 0.88 },
    },
    speaker: {
      fabric: { kind: 'linen', color: palette.linen, roughness: 0.92 },
      trim: { kind: 'wood', color: palette.walnut },
      top: { kind: 'ceramic', color: palette.cream },
      seam: { kind: 'metal', color: palette.bronze },
      icons: { kind: 'metal', color: palette.metal },
    },
    camera: {
      shell: { kind: 'ceramic', color: palette.cream, roughness: 0.38 },
      trim: { kind: 'metal', color: palette.metal },
      dark: { kind: 'metal', color: palette.bronze },
      lens: { kind: 'glass', color: palette.glass, opacity: 0.35 },
    },
    presence: {
      shell: { kind: 'ceramic', color: palette.cream, roughness: 0.4 },
      trim: { kind: 'wood', color: palette.walnut },
      dark: { kind: 'metal', color: palette.bronze },
      lens: { kind: 'glass', color: palette.glass, opacity: 0.3 },
      window: { kind: 'ceramic', color: palette.cream, roughness: 0.82 },
    },
  })

/** 取柜类某部位的饰面；未登记的部位回落到柜体色（保证不会出现纯白洞）。 */
export function naturalCabinetSurface(role: string): NaturalWoodSurface {
  return NATURAL_CABINET_FINISHES[role] ?? NATURAL_CABINET_FINISHES.body
}

/** 取家具某部位的饰面；未登记的部位回落到木材。 */
export function naturalHomeSurface(role: string): NaturalWoodSurface {
  return NATURAL_HOME_FINISHES[role] ?? NATURAL_HOME_FINISHES.wood
}

/** 取原生设备某部位的饰面；未登记时返回 `null`（由调用方保留原材质）。 */
export function naturalNativeSurface(modelType: string, role: string): NaturalWoodSurface | null {
  const finishes = NATURAL_NATIVE_FINISHES[modelType]
  if (!finishes) return null
  return finishes[role] ?? null
}
