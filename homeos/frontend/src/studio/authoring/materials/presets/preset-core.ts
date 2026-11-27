/** 材质风格档位的基础：档位类型、色阶工具、结构/软装角色收口与按组的角色配方。 */

import type { MaterialSurface, RoleRecipe, StoneSlabFlavor } from '../studio-model-material-roles'
import { presetGroupFor } from './preset-group-lookup'

/** 默认档：跟随全局风格。 */
export const MATERIAL_STYLE_AUTO = 'auto'

export interface MaterialStylePreset {
  /** 落进草稿的稳定标识（同一档位在不同物件上可复用，全局唯一）。 */
  id: string
  /** 下拉里显示的中文名。 */
  label: string
  /** 整件质感族：角色配方没写 surface 时的兜底（对齐参考实现的档位级 surface）。 */
  surface?: MaterialSurface
  /** 整件石材板色号：角色配方没写 slab 时的兜底。 */
  slab?: StoneSlabFlavor
  /** 调色板覆盖键。 */
  colors: Readonly<Record<string, number>>
  /** 该档位的「角色 → 配方」。 */
  roles: Readonly<Record<string, RoleRecipe>>
}

export function shadeColor(color: number, amount: number): number {
  const target = amount >= 0 ? 255 : 0
  const weight = Math.abs(amount)
  const channel = (shift: number) => {
    const value = (color >> shift) & 255
    return Math.round(value + (target - value) * weight)
  }
  return (channel(16) << 16) | (channel(8) << 8) | channel(0)
}

/** 补齐 furniture 四档。 */
export function completeFurnitureRamp(colors: Record<string, number>): Record<string, number> {
  const rampBase =
    colors.furniture ??
    colors.furnitureSoft ??
    colors.furnitureLight ??
    colors.furnitureDark ??
    colors.wood ??
    colors.cabinetBody ??
    colors.applianceSoft ??
    colors.countertop ??
    colors.glass ??
    colors.leafColor
  if (rampBase === undefined) {
    return { ...colors }
  }
  return {
    furniture: colors.furniture ?? rampBase,
    furnitureLight: colors.furnitureLight ?? shadeColor(rampBase, 0.72),
    furnitureSoft: colors.furnitureSoft ?? shadeColor(rampBase, 0.28),
    furnitureDark: colors.furnitureDark ?? shadeColor(rampBase, -0.42),
    ...colors,
  }
}

export function definePreset(
  id: string,
  label: string,
  surface: MaterialSurface,
  colors: Record<string, number>,
  roles: Record<string, RoleRecipe>,
  slab?: StoneSlabFlavor,
): MaterialStylePreset {
  return Object.freeze({
    id,
    label,
    surface,
    ...(slab ? { slab } : {}),
    colors: Object.freeze(completeFurnitureRamp(colors)),
    roles: Object.freeze(sanitizeStructuralMetalRoles(deriveStyleRoles(roles))),
  })
}

/**
 * 结构件 / 软装角色的守卫词表。
 *
 * 档位表是**按组**下料的（一台冰箱和一个电视柜共用一套配方），于是 `appliance-steel-*`
 * 这种「整机不锈钢」档位会把 `body / door / panel / top / drawer / interior` 全部写成
 * `surface: "metal"`（`metalness 0.72`，见 `SURFACE_FINISH.metal`）。场景**没有环境贴图**
 * 时，高金属度 = 只反射不发光 = 屏幕上一块黑板子：这正是「冰箱 / 衣柜 / 餐边柜 / 电梯发黑」
 * 的档位来源（默认材质本身是 paint / wood，只有被档位刷过才会黑）。
 *
 * 真实家电只是「钢色漆面 + 拉丝」，不是整块实心钢，所以结构件不该拿 `metal` 配方。
 * 本表只用来做一次定义期收口（`sanitizeStructuralMetalRoles`），**不阻止**档位作者把
 * `metal / handle / grating / grille / burner / faucet / leg / trim / base / frame` 写成金属。
 *
 * 导出给审计 M6 用：审计必须和运行时读**同一份**词表，否则「审计说 0 命中」不可信。
 */
export const STRUCTURAL_OR_SOFT_ROLES: ReadonlySet<string> = new Set([
  // 柜 / 家电的结构大面
  'body',
  'door',
  'panel',
  'top',
  'drawer',
  'shelf',
  'interior',
  'carcass',
  'cabinetBody',
  'cabinetDoor',
  'shell',
  'lid',
  'petBase',
  'petFrame',
  // 由上面这些派生出来的面（`deriveStyleRoles` 会连 `surface` 一起继承，不拦就会继续黑）
  'back',
  'side',
  'dark',
  'recess',
  'control',
  /**
   * `shadow` 是模型自带的「假阴影面片」（床底、柜脚那片压暗的薄板），
   * 不是实心件：给它 `metalness 0.72` 会变成一块**吸光的黑板**盖在地面上，
   * 比柜体本身还显眼。这类贴地面片永远走无金属度的深色漆面。
   */
  'shadow',
  'backing',
  'plane',
  // 软装 / 陶土：本来就不该是金属
  'seat',
  'fabric',
  'upholstery',
  'cushion',
  'mattress',
  'ceramic',
  'pot',
  'wood',
  'slab',
])

/** 结构角色被迫放弃 `metal` 之后该走哪种表面：软装回布艺、陶件回陶瓷、木作回木，其余走金属漆面。 */
const STRUCTURAL_METAL_FALLBACK_SURFACE: Readonly<Record<string, MaterialSurface>> = Object.freeze({
  seat: 'fabric',
  fabric: 'fabric',
  upholstery: 'fabric',
  cushion: 'fabric',
  mattress: 'fabric',
  ceramic: 'ceramic',
  pot: 'ceramic',
  wood: 'wood',
  slab: 'wood',
})

/**
 * 把「结构 / 软装角色 + `surface: "metal"`」收回低金属度表面（**保留档位颜色**）。
 *
 * - 颜色一律不动：银灰档仍是银灰、银黑档仍是曜黑，只是从「实心钢」变成「钢色漆面」；
 * - 配方里显式写的 `metalness ≥ 0.5` 一并删掉（否则表面换了、金属度还留在 0.72）；
 * - 只在 `definePreset` 里跑一次，所有档位（含动态生成的）都自动受保护。
 */
function sanitizeStructuralMetalRoles(roles: Record<string, RoleRecipe>): Record<string, RoleRecipe> {
  let sanitizedRoles: Record<string, RoleRecipe> | null = null
  for (const [role, recipe] of Object.entries(roles)) {
    if (recipe?.surface !== 'metal' || !STRUCTURAL_OR_SOFT_ROLES.has(role)) continue
    const fallbackSurface = STRUCTURAL_METAL_FALLBACK_SURFACE[role] ?? 'lacquer'
    const { metalness, ...recipeWithoutMetalness } = recipe
    const sanitizedRecipe: RoleRecipe = {
      ...recipeWithoutMetalness,
      surface: fallbackSurface,
      ...(metalness !== undefined && metalness < 0.5 ? { metalness } : {}),
    }
    sanitizedRoles ||= { ...roles }
    sanitizedRoles[role] = sanitizedRecipe
  }
  return sanitizedRoles ?? roles
}

/** 新项目的 GLB 里有一部分角色是**资产命名直接带出来的**（`-furniture-frame`、`-detail-recess`、`-aquatic-sand`…），参考实现的 combo 里没有同名角色（参考实现没有这批模型）。 */
const STYLE_ROLE_DERIVATIONS: ReadonlyArray<{
  role: string
  from: readonly string[]
  multiply?: number
  flatShading?: boolean
  surface?: MaterialSurface
  /** 是否连石材板色号一起继承。 */
  inheritSlab?: boolean
}> = [
  { role: 'surface', from: ['top', 'upholstery', 'fabric', 'body'], inheritSlab: true },
  { role: 'seat', from: ['upholstery', 'fabric', 'body', 'top'] },
  { role: 'fabric', from: ['upholstery', 'cushion', 'stash', 'top', 'body'] },
  { role: 'linen', from: ['fabric', 'upholstery', 'cushion'] },
  { role: 'sage', from: ['fabric', 'upholstery', 'cushion'] },
  { role: 'runner', from: ['fabric', 'upholstery'] },

  /**
   * `frame` 是从 `trim` / `body` / `leg` 派生的「框体 / 座体」。必须 `inheritSlab`：
   * 石作组合（`stoneCombo`）里 `trim` 缺省就是 `base`，而 `base` 在「白石黑座 / 全黑大理石」
   * 等档位里正是那块**深色大理石座体**（`STONE_SLAB_ON_DARK`）。不继承石板的话，
   * 派生只留下 `color: 0xffffff`、把 `slab: marble-dark` 丢掉 ——
   * 「白石黑座」的座体就退化成一整块纯白，档位看起来完全没生效。
   */
  { role: 'frame', from: ['trim', 'body', 'leg'], inheritSlab: true },
  { role: 'shadow', from: ['base', 'frame', 'body'], multiply: 0.6 },
  { role: 'back', from: ['body', 'shadow', 'panel'], multiply: 0.82 },
  { role: 'side', from: ['body', 'panel'] },
  { role: 'dark', from: ['body', 'base', 'panel'], multiply: 0.55 },
  { role: 'panel', from: ['door', 'drawer', 'body'] },
  { role: 'handle', from: ['metal', 'trim'] },

  { role: 'recess', from: ['body', 'panel', 'shadow'], multiply: 0.5 },
  { role: 'control', from: ['panel', 'door', 'body'] },
  { role: 'indicator', from: ['accent', 'lit', 'metal'] },
  { role: 'water', from: ['glass'] },
  { role: 'paper', from: ['book', 'panel', 'body'] },
  { role: 'book', from: ['paper', 'stash'] },

  { role: 'wood', from: ['top', 'body'] },
  { role: 'slab', from: ['top', 'surface'], inheritSlab: true },

  { role: 'accent', from: ['top', 'upholstery', 'fabric', 'cushion', 'trim', 'metal'] },

  { role: 'soil', from: ['interior', 'pot'] },
  { role: 'foliageSoft', from: ['foliage'], multiply: 1.22 },
  { role: 'sand', from: ['interior', 'top'] },
  { role: 'rock', from: ['frame', 'shadow'], flatShading: true },
  { role: 'fish', from: ['accent', 'body', 'pot'] },
  { role: 'ceramic', from: ['pot', 'top'] },
  { role: 'foliage', from: ['interior', 'frame'], surface: 'foliage' },

  /* ------------------------------------------------------------------ *
   * **真实构件角色**（`model-slot-roles.ts` / `studio-semantic-roles.ts`）：
   * 各档位组合（combo）里没有这些角色，于是「选了档位却不改变任何槽位」（空转）或只改一半
   * （半生效）。这里按**语义近邻**把它们挂到档位已有的角色上，档位才能真正接管配色。
   * ------------------------------------------------------------------ */

  /* 摆件 / 花艺：器身 / 花头 / 枝干 / 干燥花束 */
  { role: 'vase', from: ['accent', 'body', 'base'], surface: 'ceramic' },
  { role: 'flower', from: ['accent', 'leaf', 'light'], surface: 'foliage' },
  { role: 'stem', from: ['frame', 'body'], surface: 'wood' },
  { role: 'pot', from: ['body', 'base'], surface: 'ceramic' },
  { role: 'driedBouquet', from: ['accent', 'leaf'], surface: 'foliage' },
  { role: 'plate', from: ['body', 'surface', 'light'] },
  { role: 'candle', from: ['light', 'accent'] },
  { role: 'soapTray', from: ['accent', 'light'] },

  /* 小家电 / 灶具 / 厨具 */
  { role: 'grille', from: ['metal', 'dark', 'panel'], surface: 'metal' },
  { role: 'hobFrame', from: ['panel', 'body', 'dark'] },
  { role: 'cooktop', from: ['dark', 'panel'], surface: 'lacquer' },
  { role: 'burner', from: ['metal', 'trim'], surface: 'metal' },
  { role: 'faucet', from: ['metal', 'trim'], surface: 'metal' },

  /* 软装 / 宠物 / 儿童 / 灯具 */
  { role: 'throwBlanket', from: ['fabric', 'upholstery', 'accent'], surface: 'fabric' },
  { role: 'board', from: ['top', 'body', 'surface'], surface: 'wood' },
  { role: 'rope', from: ['accent', 'trim'], surface: 'fabric' },
  { role: 'petPad', from: ['cushion', 'fabric', 'upholstery', 'accent'], surface: 'fabric' },
  { role: 'petBase', from: ['base', 'body', 'frame'] },
  { role: 'petFrame', from: ['frame', 'body'] },
  { role: 'shell', from: ['body', 'panel'] },
  { role: 'glow', from: ['indicator', 'lit', 'accent'] },

  /* 通用件：`leg` 之前完全没有派生，缺 `leg` 的档位会让支腿掉回 GLB 占位色（半生效）。 */
  { role: 'leg', from: ['trim', 'frame', 'body'] },
  { role: 'interior', from: ['body', 'panel', 'shadow'] },
  { role: 'carcass', from: ['body', 'frame', 'panel'] },
  { role: 'lid', from: ['top', 'panel', 'body'] },
  { role: 'panelSlat', from: ['panel', 'door', 'body'] },
  { role: 'mattress', from: ['upholstery', 'cushion', 'fabric', 'top'], surface: 'fabric' },

  /* 木作 / 地毯：`cabinetBody` / `cabinetDoor` 是**调色板语义键**，它们同时也会作为角色出现
   * （`home-network-cabinet` 的柜体 / 柜门、`storage-box` 的盒盖、`round-rug` 的毯面 / 包边）。 */
  { role: 'cabinetBody', from: ['body', 'carcass'] },
  { role: 'cabinetDoor', from: ['door', 'panel', 'drawer'] },
  { role: 'rugPile', from: ['fabric', 'upholstery'], surface: 'fabric' },
  { role: 'rugBorder', from: ['trim', 'base'], surface: 'fabric' },

  /* 家族 token 兜底出来的「写实中性件」也要能跟着档位走（否则这些槽位同样是档位空转）。 */
  { role: 'bodyNeutral', from: ['body', 'surface'] },
  { role: 'darkNeutral', from: ['dark', 'shadow', 'base'] },
  { role: 'lightNeutral', from: ['light', 'surface'] },
  { role: 'softNeutral', from: ['soft', 'surface'] },
  { role: 'accentNeutral', from: ['accent', 'trim'] },
  { role: 'glassNeutral', from: ['glass'] },
]

/** 按上面的规则把 combo 没给出的角色派生出来（只补空缺，不覆盖 combo 的显式配方）。 */
export function deriveStyleRoles(roles: Record<string, RoleRecipe>): Record<string, RoleRecipe> {
  const derivedRoles: Record<string, RoleRecipe> = { ...roles }
  for (const derivationRule of STYLE_ROLE_DERIVATIONS) {
    if (derivedRoles[derivationRule.role]) continue
    const sourceRole = derivationRule.from.find((candidateRole) => roles[candidateRole])
    if (!sourceRole) continue
    const sourceRecipe = roles[sourceRole]

    const { slab: sourceSlab, ...sourceRecipeWithoutSlab } = sourceRecipe
    derivedRoles[derivationRule.role] = {
      ...sourceRecipeWithoutSlab,
      ...(derivationRule.inheritSlab && sourceSlab ? { slab: sourceSlab } : {}),
      ...(derivationRule.surface ? { surface: derivationRule.surface } : {}),
      ...(derivationRule.multiply !== undefined ? { multiply: derivationRule.multiply } : {}),
      ...(derivationRule.flatShading ? { flatShading: true } : {}),
    }
  }
  return derivedRoles
}

/** 档位是**按组**给所有人下料的，可同一组里各件模型的构件并不一样：joinery 档位的 `accent`是「撞色摆件」（陶土色），落到梳妆台上却是那面立式镜； */
const MODEL_STYLE_ROLE_OVERRIDES: Readonly<Record<string, Readonly<Record<string, RoleRecipe>>>> = Object.freeze({
  /** 五件「木顶柜」的 `top`（电视柜是 `surface`）是 0.02~0.06m 的薄木板，joinery 档位却把它当石材台面刷成白石 / 黑石。 */
  shelf: { top: { surface: 'wood', color: 'cabinetBody' } },
  nightstand: { top: { surface: 'wood', color: 'cabinetBody' } },
  shoecabinet: { top: { surface: 'wood', color: 'cabinetBody' } },
  sideboard: { top: { surface: 'wood', color: 'cabinetBody' } },
  tvstand: { surface: { surface: 'wood', color: 'cabinetBody' } },
  /** 台球桌：`surface` 是木质台面边轨（木色）； */
  'pool-table': {
    surface: { surface: 'wood', color: 'wood' },
    accent: { surface: 'lacquer', color: 0xf5f0e6 },
  },
  /** 梳妆台：`accent` 是 0.69×0.65m 的**立式镜面**（加载器 auto 分支本来就把它按玻璃透明出图，见 `vanityRoleColors.accent = itemPalette.glass`）； */
  vanity: {
    accent: {
      surface: 'glass',
      color: 0xcdd6dc,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    },
  },
  /**
   * 厨房岛台：`foliage` 是台面上的那盆绿植，**必须**压掉档位派生出来的「深色木」。
   *
   * 厨房档位走的是 `joineryCombo`，它自带 `interior`（内腔），而 `STYLE_ROLE_DERIVATIONS`
   * 里 `foliage` 是从 `interior` 派生的 —— 于是绿植会跟着柜体一起变深木色。档位组的补全
   * （`STYLE_ROLE_RECIPES_BY_GROUP.kitchen`）**压不住**它：派生发生在 `definePreset` 里，
   * 档位的 `roles` 已经有 `foliage`，组配方只在「档位没写」时才查。所以只能逐型号覆写。
   */
  'kitchen-island': {
    foliage: { surface: 'foliage', color: 'leafColor' },
  },
  /**
   * 中央空调风口：档位表把 `grille` 写成**金属**（`device-steel` 直接给 `metal` 表面，
   * 金属度 0.72）。风口这件模型只有 20 来个三角形、2m 长一整片平板，场景又没有环境
   * 贴图 —— 高金属度等于「只反射不发光」，屏幕上就是一条黑板子。真实风口是喷涂铝
   * 格栅：这里只把**表面参数**收回喷涂（颜色仍跟档位走 `appliance` 键）。
   */
  airoutlet: {
    body: { surface: 'paint', color: 'appliance', roughness: 0.5, metalness: 0.05 },
    grille: { surface: 'paint', color: 'appliance', roughness: 0.5, metalness: 0.05 },
  },
  'air-outlet': {
    body: { surface: 'paint', color: 'appliance', roughness: 0.5, metalness: 0.05 },
    grille: { surface: 'paint', color: 'appliance', roughness: 0.5, metalness: 0.05 },
  },
  /** 边几：`top` 槽位按 `woodwork` 家族 token 表映射成 `countertop`，而 `woodwork` 组的 `countertop` 是**石材**配方；边几是木质小几，台面跟着木色走。 */
  'side-table': {
    countertop: { surface: 'wood', color: 'wood' },
  },
  /**
   * 壁挂电视（`tv_standard.glb`，**整机只有一个材质槽位**）：槽位名只有 `-material-0`，
   * token 只能判成 `screen`，而 `SCREEN_STYLES` 两档都把 `screen` 写成「屏面曜黑」`0x15171a`
   * —— 于是「曜黑 / 银灰」两档选出来是同一台黑电视。整机一体的机型里这个槽位其实是**机身**，
   * 让它跟档位的机身色（`applianceSoft`：曜黑 `0x3f4247` / 银灰 `0xc6cbd1`）走，两档才分得开。
   * 有独立屏体的 `tv` / `tv_tabletop` / `screenpanel` 不受影响。
   */
  tv_standard: {
    screen: { surface: 'lacquer', color: 'applianceSoft' },
  },
})

/** 取某角色在某档位下的配方：逐模型覆写优先，其次档位自己的配方，最后按**档位组**补全。 */
export function styleRoleRecipeFor(
  modelType: string | undefined,
  role: string,
  preset: MaterialStylePreset,
): RoleRecipe | undefined {
  const modelOverride = modelType ? MODEL_STYLE_ROLE_OVERRIDES[modelType]?.[role] : undefined
  if (modelOverride) return modelOverride
  const presetRecipe = preset.roles[role]
  if (presetRecipe) return presetRecipe
  const presetGroup = modelType ? presetGroupFor(modelType) : null
  return (presetGroup ? STYLE_ROLE_RECIPES_BY_GROUP[presetGroup]?.[role] : undefined) ?? undefined
}

/**
 * 逐**档位组**的语义角色补全：档位表里没写、但该品类一定会出现的构件角色。
 *
 * 背景：档位是按组下料的，组里各件模型的构件并不一样 —— 鲜绿档位只写了「叶 / 盆」，
 * 可绿植模型还有接水盘（`saucer`）、浅色叶（`foliageLight`）；卫浴档位没写牙杯（`mug`）与
 * 毛巾杆（`towel`）。这些槽位以前在选中档位后**原样不动**（「档位半生效」），
 * 现在补成该品类的真实构件材质。
 *
 * 只在档位自身没写该角色时生效（不覆盖档位作者的显式设计）；颜色优先走主题语义键
 * （`leafColor` / `showerMetal` / `decorAccent`…），语义键缺省时由 `resolveMaterialPaletteColor`
 * 回落到写实默认色，绝不塌成 `furniture` 蓝灰。
 */

/**
 * 「台面」这个面的配方：台盆的那张台面板（`basin` 的 `light` 槽位 → 角色 `rim`）与台面素材
 * （`countertop` 的 `light` 槽位 → 同一个角色）**共用同一份** —— 台面这件素材的全部意义就是
 * 「和台盆那张台面一模一样」，写成两份迟早会走偏，所以只留这一个来源。
 */
const RIM_RECIPE: RoleRecipe = Object.freeze({ surface: 'ceramic', color: 'furniture' })

const STYLE_ROLE_RECIPES_BY_GROUP: Readonly<Record<string, Readonly<Record<string, RoleRecipe>>>> = Object.freeze({
  /** 绿植 / 花艺：浅色叶 + 接水盘 + 花朵 + 花蕊。 */
  decor: {
    foliageLight: { surface: 'foliage', color: 'leafColorLight' },
    saucer: { surface: 'ceramic', color: 'decorAccent', multiply: 0.88 },
    flower: { surface: 'paint', color: 0xe0a8bd },
    flowerCenter: { surface: 'paint', color: 0xe8c169 },
  },

  /** 摆件 / 挂饰：画框、装饰面、花枝、垂布、镜面、抱枕、雕件、奖杯、摆件。 */
  ornament: {
    frame: { surface: 'wood', color: 'furnitureDark' },
    surface: { surface: 'paint', color: 'furnitureLight' },
    stem: { surface: 'wood', color: 'furnitureDark' },
    drape: { surface: 'fabric', color: 'decorAccent' },
    /** 全身镜：镜面不是「透明玻璃」，是高金属度低粗糙度的反射面。 */
    glass: { surface: 'glass', color: 'glass', metalness: 0.92, roughness: 0.05 },
    pillow: { surface: 'fabric', color: 'furnitureLight' },
    fabric: { surface: 'fabric', color: 'furnitureSoft' },
    sculpture: { surface: 'stone', color: 'decorAccent' },
    shell: { surface: 'paint', color: 'furniture' },
    trophyMetal: { surface: 'metal', color: 0xcdaa63 },
    figurine: { surface: 'ceramic', color: 'furnitureLight' },
  },
  /** 灯具：灯体 / 灯饰金属 / 灯罩 / 透光罩。 */
  lamp: {
    lampBody: { surface: 'metal', color: 'floorLampBody' },
    lampAccent: { surface: 'metal', color: 'furnitureDark' },
    lampShade: { surface: 'fabric', color: 'furnitureLight' },
    diffuser: {
      surface: 'glass',
      color: 0xe9e6df,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    },
  },
  /** 家电：视窗 / 杯体 / 容器盖 / 置物盘。 */
  steelAppliance: {
    window: { surface: 'glass', color: 'glass', transparent: true, opacity: 0.42, depthWrite: false },
    container: {
      surface: 'glass',
      color: 'glass',
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    },
    containerLid: { surface: 'metal', color: 'furnitureDark' },
    soapTray: { surface: 'metal', color: 'metal' },
    /**
     * 管线机 / 净水机的显示屏：`steelAppliance` 组以前没有 `display` 配方，
     * 矩形双出水款（`rectangular-pipeline-dispenser`）那 0.2m 高的屏面三档都不变色。
     */
    display: { surface: 'lacquer', color: 'applianceDark' },
  },
  /** 洁具 / 卫浴：池沿、盆体、牙杯、毛巾杆、置物盘、收纳罐。 */
  ceramic: {
    rim: { surface: 'ceramic', color: 'furniture' },
    bowl: { surface: 'ceramic', color: 'furnitureLight' },
    mug: { surface: 'ceramic', color: 'furnitureLight' },
    container: { surface: 'ceramic', color: 'furnitureLight' },
    containerLid: { surface: 'ceramic', color: 'furnitureLight' },
    rack: { surface: 'metal', color: 'showerMetal' },
    towel: { surface: 'fabric', color: 'diningLinen' },
  },
  /** 台盆：盆体 / 池沿 / 置物盘。台面素材（`countertop`）直接挂这一组，`rim` 是两边共用的那条。 */
  basin: {
    rim: RIM_RECIPE,
    bowl: { surface: 'ceramic', color: 'furnitureLight' },
    soapTray: { surface: 'ceramic', color: 'furnitureLight' },
  },
  /** 木作：台面 / 桶体 / 木架。 */
  woodwork: {
    countertop: { surface: 'stone', color: 'countertop' },
    container: { surface: 'wood', color: 'cabinetBody' },
    rackWood: { surface: 'wood', color: 'wood' },
  },
  /** 宠物：干粮 / 水盆（`pet-dryer` / `pet-bed-bowls` 的真实构件）。 */
  pet: {
    petFood: { surface: 'paint', color: 0xb08148 },
    water: { surface: 'glass', color: 0xa9c5d3, transparent: true, opacity: 0.62, depthWrite: false },
  },
  /** 数码 / 影音：机身边框 / 支架 / 纸张 / 可换的透明容器（香薰机的玻璃瓶）。 */
  device: {
    bezel: { surface: 'lacquer', color: 'furnitureDark' },
    stand: { surface: 'metal', color: 'furnitureDark' },
    paperSheet: { surface: 'paint', color: 0xf3f1ea },
    /**
     * 香薰机（`aroma-diffuser`）的可见主体是 `-bottle`（GLB 里 alpha 0.36 的玻璃瓶），
     * `device` 组以前没有 `container` 配方，于是三档下瓶身一动不动 —— 机身上下都变了、
     * 只有最大的那块面没变，看起来像「档位只生效了一半」。
     * 瓶身染色取 `furnitureLight`（皓白 → 透明 / 石墨 → 烟灰 / 金属灰 → 浅灰玻璃），
     * 不写死成中性玻璃色，否则三档依然是同一只瓶子。
     */
    container: {
      surface: 'glass',
      color: 'furnitureLight',
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    },
  },
})
