/** 材质风格档位的「角色 → 配方」组合器（布艺 / 木作 / 石材 / 电器 / 洁具等）。 */

import type { MaterialSurface, RoleRecipe } from '../studio-model-material-roles'
import { shadeColor } from './preset-core'

export type Recipe = RoleRecipe

/** 布艺座具 / 卧床：软包 + 框架 + 脚 + 可分离件。 */
export function fabricCombo({
  upholstery,
  leg,
  frame,
  accent,
  cushion,
  top,
  trim,
  metal,
  body,
  fabric,
}: {
  upholstery: Recipe
  leg: Recipe
  frame?: Recipe
  accent?: Recipe
  cushion?: Recipe
  top?: Recipe
  trim?: Recipe
  metal?: Recipe
  body?: Recipe
  fabric?: Recipe
}): Record<string, Recipe> {
  return {
    upholstery,

    accent: accent ?? upholstery,

    cushion: cushion ?? upholstery,

    fabric: fabric ?? upholstery,

    frame: frame ?? leg,
    leg,

    body: body ?? frame ?? leg,
    top: top ?? upholstery,
    trim: trim ?? frame ?? leg,

    metal: metal ?? { surface: 'metal', color: 0x9aa1a8 },
  }
}

/** 柜类：柜体 / 柜面 / 台面 / 五金一次说清。 */
export function joineryCombo({
  body,
  door,
  top,
  countertop,
  metal,
  drawer,
  trim,
  shelf,
  base,
  glass,
  mirror,
  interior,
  leg,
  sink,
  cooktop,
  book,
  stash,
  accent,
}: {
  body: Recipe
  door: Recipe
  top?: Recipe
  /**
   * 独立「台面」角色：`woodwork` / `joinery` 家族的 `top` 槽位按 token 表映射成 `countertop`
   * （见 `model-slot-roles.ts` 的 `FAMILY_TOKEN_ROLES`），所以柜类里那个「台面」角色名是
   * `countertop` 而不是 `top`。缺省与 `top` 同配方 —— 厨房岛台的石台面不该和柜体用两种石色。
   */
  countertop?: Recipe
  metal?: Recipe
  drawer?: Recipe
  trim?: Recipe
  shelf?: Recipe
  base?: Recipe
  glass?: Recipe
  mirror?: Recipe
  interior?: Recipe
  leg?: Recipe
  sink?: Recipe
  cooktop?: Recipe
  book?: Recipe
  stash?: Recipe
  accent?: Recipe
}): Record<string, Recipe> {
  const interiorRecipe =
    typeof body.color == 'number' ? { surface: 'wood' as MaterialSurface, color: shadeColor(body.color, 0.45) } : door

  const glassRecipe: Recipe = { surface: 'glass', color: 0xa9c5d3 }

  const sinkRecipe: Recipe = { surface: 'metal', color: 0xb9bfc5, roughness: 0.24, metalness: 0.62 }
  const cooktopRecipe: Recipe = { surface: 'metal', color: 0x33363a, roughness: 0.2, metalness: 0.6 }

  const mirrorRecipe: Recipe = { surface: 'glass', color: 0xdbe4ea, roughness: 0.08, metalness: 0.35 }

  const bookRecipe: Recipe = { surface: 'paint', color: 0xd6c6a4 }

  const stashRecipe: Recipe = { surface: 'leather', color: 0x6f7176 }

  const accentRecipe: Recipe = { surface: 'ceramic', color: 0xb0663f }
  return {
    body,
    door,
    drawer: drawer ?? door,
    trim: trim ?? body,
    shelf: shelf ?? body,
    book: book ?? bookRecipe,
    stash: stash ?? stashRecipe,
    accent: accent ?? accentRecipe,

    base: base ?? body,

    leg: leg ?? base ?? body,
    top: top!,
    countertop: countertop ?? top ?? body,
    interior: interior ?? interiorRecipe,
    glass: glass ?? glassRecipe,
    mirror: mirror ?? mirrorRecipe,
    metal: metal!,
    sink: sink ?? sinkRecipe,
    cooktop: cooktop ?? cooktopRecipe,
  }
}

/** 木器家具：台面 / 腿 / 箱体 / 抽屉面 / 横撑 / 五金。 */
export function woodCombo({
  top,
  leg,
  metal,
  body,
  drawer,
  shelf,
  trim,
  base,
  upholstery,
  cushion,
}: {
  top: Recipe
  leg?: Recipe
  metal?: Recipe
  body?: Recipe
  drawer?: Recipe
  shelf?: Recipe
  trim?: Recipe
  base?: Recipe
  upholstery?: Recipe
  cushion?: Recipe
}): Record<string, Recipe> {
  return {
    top,
    leg: leg!,

    body: body ?? top,
    drawer: drawer ?? top,
    shelf: shelf ?? top,

    trim: trim ?? body ?? top,
    base: base! ?? leg ?? metal,

    upholstery: upholstery ?? { surface: 'fabric', color: 0xf3e7d8 },
    cushion: cushion ?? upholstery ?? { surface: 'fabric', color: 0xf3e7d8 },
    metal: metal!,
  }
}

/** 石材件：石板 / 石座 / 五金。 */
export function stoneCombo({
  top,
  base,
  metal,
  trim,
  drawer,
  shelf,
}: {
  top: Recipe
  base: Recipe
  metal?: Recipe
  trim?: Recipe
  drawer?: Recipe
  shelf?: Recipe
}): Record<string, Recipe> {
  return {
    top,
    base,

    drawer: drawer ?? top,
    shelf: shelf ?? top,

    trim: trim ?? base,
    metal: metal ?? { surface: 'metal', color: 0x8c8f94 },
  }
}

/** 家电机身的三档明暗：**门脸 / 抽屉面 / 台面**取中间那档，**控制面板 / 底座**压到最暗那档。
 *
 * @param finish 本档箱体的表面处理（不锈钢档是 metal、奶白档是 paint）。门脸 / 踢脚 / 控制面板
 * 一律**沿用箱体的表面处理**：一台奶白冰箱配一扇金属门、或白漆箱体配一块金属踢脚，
 * 都会读成「几件不同材质拼起来的」，而真实家电的同一面漆 / 同一种拉丝是整套的。
 */
export function applianceShellTones(finish: MaterialSurface): {
  door: Recipe
  drawer: Recipe
  top: Recipe
  panel: Recipe
  base: Recipe
} {
  return {
    door: { surface: finish, color: 'applianceSoft' },
    drawer: { surface: finish, color: 'applianceSoft' },
    top: { surface: finish, color: 'applianceSoft' },
    panel: { surface: finish, color: 'applianceDark' },
    base: { surface: finish, color: 'applianceDark' },
  }
}

/** 智能设备的机身层次：**面板 / 顶端面**比箱体浅一档（`applianceSoft`），**底座 / 支脚**压到最暗一档（`applianceDark`）。
 *
 * @param finish 本档箱体的表面处理（皓白 / 石墨黑是 paint、金属灰是 metal），面板与底座
 * 沿用同一支表面处理，避免「塑料壳配金属面」的拼装感。
 */
export function deviceShellTones(finish: MaterialSurface): {
  panel: Recipe
  top: Recipe
  base: Recipe
  leg: Recipe
} {
  return {
    panel: { surface: finish, color: 'applianceSoft' },
    top: { surface: finish, color: 'applianceSoft' },
    base: { surface: finish, color: 'applianceDark' },
    leg: { surface: finish, color: 'applianceDark' },
  }
}

/** 家电：箱体 / 门板 / 面板 / 五金 / 玻璃 / 屏 / 发光面 / 格栅 / 打印纸。 */
export function applianceCombo({
  body,
  door,
  panel,
  metal,
  glass,
  trim,
  handle,
  grating,
  screen,
  lit,
  base,
  top,
  drawer,
  leg,
  shelf,
  paper,
}: {
  body: Recipe
  door?: Recipe
  panel?: Recipe
  metal?: Recipe
  glass?: Recipe
  trim?: Recipe
  handle?: Recipe
  grating?: Recipe
  screen?: Recipe
  lit?: Recipe
  base?: Recipe
  top?: Recipe
  drawer?: Recipe
  leg?: Recipe
  shelf?: Recipe
  paper?: Recipe
}): Record<string, Recipe> {
  const paperRecipe: Recipe = { surface: 'paint', color: 0xf3f1ea }
  return {
    body,
    door: door ?? body,
    panel: panel ?? body,
    trim: trim ?? body,
    base: base ?? body,

    top: top ?? body,
    drawer: drawer ?? door ?? body,

    shelf: shelf ?? body,
    leg: leg ?? metal ?? { surface: 'metal', color: 0x8c8f94 },
    handle: handle! ?? metal,
    metal: metal ?? { surface: 'metal', color: 0x8c8f94 },
    glass: glass ?? { surface: 'glass', color: 0xdfeaec },
    screen: screen ?? { surface: 'lacquer', color: 0x1b1d20 },
    grating: grating ?? { surface: 'metal', color: 0x6d747b },
    lit: lit ?? { surface: 'paint', color: 0xf6f2e8 },
    paper: paper ?? paperRecipe,
  }
}

/** 洁具：陶瓷本体 / 内腔 / **盆体** / 台面 / 柜体 / 五金。 */
export function sanitaryCombo({
  body,
  top,
  sink,
  frame,
  door,
  drawer,
  shelf,
  base,
  interior,
  trim,
  handle,
  metal,
  glass,
  mirror,
  grating,
}: {
  body: Recipe
  top?: Recipe
  sink?: Recipe
  frame?: Recipe
  door?: Recipe
  drawer?: Recipe
  shelf?: Recipe
  base?: Recipe
  interior?: Recipe
  trim?: Recipe
  handle?: Recipe
  metal?: Recipe
  glass?: Recipe
  mirror?: Recipe
  grating?: Recipe
}): Record<string, Recipe> {
  const interiorRecipe =
    interior ??
    (Number.isFinite(body.color) ? { surface: body.surface, color: shadeColor(body.color as number, -0.18) } : null)
  const joineryRecipe = frame ?? top ?? body
  /**
   * 洁具的五金（拉手 / 挡水 / 毛巾杆 / 台盆龙头）以前是**写死的 0xbfc6cc**，任何陶瓷档位都刷不动它，
   * 于是像 `heated-towel-rail`（全机只有杆 / 龙头 / 毛巾 / 装饰条）这种模型选遍档位**毫无变化**。
   * 改成主题语义键 `showerMetal`：档位 / 主题没写该键时回落到 `SEMANTIC_DEFAULT_BY_PALETTE_KEY`
   * 的写实五金色（`0xcfd4d8`，与原来 `0xbfc6cc` 同属银灰，肉眼几乎无差），陶瓷档位自己写了
   * 该键（见 `CERAMIC_STYLES`）时就随档位走「亮白 / 哑光 / 岩灰」。
   */
  const metalRecipe: Recipe = metal ?? { surface: 'metal', color: 'showerMetal' }
  const glassRecipe: Recipe = glass ?? { surface: 'glass', color: 0xdfeaec }

  const mirrorRecipe: Recipe = mirror ?? {
    surface: 'glass',
    color: 0xdbe4ea,
    roughness: 0.08,
    metalness: 0.35,
  }
  return {
    body,
    top: top ?? body,

    sink: sink ?? body,
    frame: frame ?? joineryRecipe,
    door: door ?? joineryRecipe,
    drawer: drawer ?? joineryRecipe,
    shelf: shelf ?? joineryRecipe,
    base: base ?? joineryRecipe,
    interior: interior ?? interiorRecipe!,
    trim: trim ?? metalRecipe,
    handle: handle ?? metalRecipe,
    metal: metal ?? metalRecipe,
    glass: glass ?? glassRecipe,
    mirror: mirror ?? mirrorRecipe,
    grating: grating ?? metalRecipe,
  }
}

/** 玻璃隔断：玻璃 + 框（立柱 / 横梁）+ 拉手。 */
export function glazingCombo({
  glass,
  frame,
  handle,
  trim,
  metal,
}: {
  glass: Recipe
  frame?: Recipe
  handle?: Recipe
  trim?: Recipe
  metal?: Recipe
}): Record<string, Recipe> {
  const frameRecipe = frame ?? metal ?? { surface: 'metal', color: 0xb4babf }
  return {
    glass,
    frame: frame ?? frameRecipe,
    metal: metal ?? frameRecipe,
    trim: trim ?? frameRecipe,
    handle: handle ?? frameRecipe,
  }
}

/** 绿植 / 花艺：叶 / 浅色叶 / 盆 / 托 / 干 / 土 / 花 / 花蕊。 */
export function plantCombo({
  foliage,
  pot,
  saucer,
  trunk,
  soil,
  flower,
  flowerCenter,
}: {
  foliage: Recipe
  pot: Recipe
  saucer?: Recipe
  trunk?: Recipe
  soil?: Recipe
  flower?: Recipe
  flowerCenter?: Recipe
}): Record<string, Recipe> {
  const derivedTrunk: Recipe = { surface: 'wood', color: 0x6b5a42 }
  const derivedSaucer: Recipe = { surface: 'ceramic', color: shadeColor(pot.color as number, -0.3) }
  const derivedSoil: Recipe = { surface: 'stone', color: 0x3b2f22 }
  return {
    foliage,
    /** 同一株上的新叶 / 受光叶：比主叶亮一档，别让整株塌成一个色号。 */
    foliageLight: { surface: 'foliage', color: shadeColor(foliage.color as number, 0.2) },
    pot,
    /** `saucer` 与 `base` 是同一块接水盘的两种叫法。 */
    saucer: saucer ?? derivedSaucer,
    base: saucer ?? derivedSaucer,
    frame: trunk ?? derivedTrunk,
    interior: soil ?? derivedSoil,
    ...(flower ? { flower, flowerCenter: flowerCenter ?? { surface: 'paint', color: 0xe8c169 } } : {}),
  }
}

/** 地毯：毯面 + 包边 + 防滑底。 */
export function rugCombo({
  fabric,
  trim,
  base,
}: {
  fabric: Recipe
  trim?: Recipe
  base?: Recipe
}): Record<string, Recipe> {
  const derivedTrim: Recipe = { surface: 'fabric', color: shadeColor(fabric.color as number, -0.22) }
  const derivedBase: Recipe = { surface: 'fabric', color: shadeColor(fabric.color as number, -0.62) }
  return { fabric, trim: trim ?? derivedTrim, base: base ?? derivedBase }
}

/** 窗帘：帘布 + 顶轨 / 支架。 */
export function curtainCombo({ fabric, metal }: { fabric: Recipe; metal?: Recipe }): Record<string, Recipe> {
  return { fabric, metal: metal ?? { surface: 'metal', color: 0x9aa1a8 } }
}

/** 鱼缸：柜体 / 柜门 / 台面 / 踢脚 / 拉手（下）+ 缸框 / 缸内背板 / 玻璃 / 灯板（上）+ **缸内造景与活体**（底砂 / 造景石 / 水草 / 鱼）。 */
export function aquariumCombo({
  body,
  door,
  top,
  base,
  handle,
  frame,
  glass,
  interior,
  lit,
  sand,
  rock,
  foliage,
  fish,
}: {
  body: Recipe
  door?: Recipe
  top?: Recipe
  base?: Recipe
  handle?: Recipe
  frame?: Recipe
  glass?: Recipe
  interior?: Recipe
  lit?: Recipe
  sand?: Recipe
  rock?: Recipe
  foliage?: Recipe
  fish?: Recipe
}): Record<string, Recipe> {
  const derivedBase: Recipe = { surface: 'lacquer', color: shadeColor(body.color as number, -0.45) }
  const derivedHandle: Recipe = { surface: 'metal', color: 0xb4babf }
  const derivedFrame: Recipe = { surface: 'lacquer', color: shadeColor(body.color as number, -0.5) }
  const derivedGlass: Recipe = { surface: 'glass', color: 0xdfeaec }
  const derivedInterior: Recipe = { surface: 'stone', color: 0x1b3a40 }
  const derivedLit: Recipe = { surface: 'paint', color: 0xcfe8f2 }

  const sandRecipe: Recipe = { surface: 'stone', color: 0xe3d7bd, roughness: 0.92 }
  const rockRecipe: Recipe = { surface: 'stone', color: 0x7c7f78, flatShading: true }
  const foliageRecipe: Recipe = { surface: 'foliage', color: 0x3f6b3f }
  const fishRecipe: Recipe = { surface: 'lacquer', color: 0xe08a3c }
  return {
    body,
    door: door ?? body,
    top: top ?? body,
    base: base ?? derivedBase,
    handle: handle ?? derivedHandle,
    frame: frame ?? derivedFrame,
    glass: glass ?? derivedGlass,
    interior: interior ?? derivedInterior,
    lit: lit ?? derivedLit,
    sand: sand ?? sandRecipe,
    rock: rock ?? rockRecipe,
    foliage: foliage ?? foliageRecipe,
    fish: fish ?? fishRecipe,
  }
}

/** 钢琴：琴身 / 顶盖 / **白键** / **黑键与铸铁内板** / 键床盖板 / 琴腿 / 五金。 */
export function pianoCombo({
  body,
  top,
  panel,
  leg,
  metal,
  key,
  dark,
  accent,
}: {
  body: Recipe
  top?: Recipe
  panel?: Recipe
  leg?: Recipe
  metal?: Recipe
  key?: Recipe
  dark?: Recipe
  accent?: Recipe
}): Record<string, Recipe> {
  const keyRecipe: Recipe = { surface: 'lacquer', color: 0xf6f2e8 }
  const darkRecipe: Recipe = { surface: 'lacquer', color: 0x16181a }

  const accentRecipe: Recipe = { surface: 'metal', color: 0xb08d5a }
  return {
    body,
    top: top ?? body,

    trim: key ?? keyRecipe,

    dark: dark ?? darkRecipe,
    panel: panel ?? body,
    leg: leg ?? body,
    key: key ?? keyRecipe,
    accent: accent ?? accentRecipe,
    metal: metal!,
  }
}

/** 柱体：柱身 / 柱脚 / 柱帽三段。 */
export function pillarCombo({
  body,
  base,
  trim,
}: {
  body: Recipe
  base?: Recipe
  trim?: Recipe
}): Record<string, Recipe> {
  return { body, base: base ?? body, trim: trim ?? body }
}

/** 台球桌：桌架 / 暗部 / 台面边轨 / 台呢 / 台球。 */
export function poolTableCombo({
  frame,
  fabric,
  surface,
  shadow,
  accent,
}: {
  frame: Recipe
  fabric: Recipe
  surface?: Recipe
  shadow?: Recipe
  accent?: Recipe
}): Record<string, Recipe> {
  return {
    frame,

    surface: surface ?? frame,

    fabric,

    shadow: shadow ?? { surface: 'wood', color: shadeColor(frame.color as number, -0.45) },

    accent: accent ?? { surface: 'lacquer', color: 0xf5f0e6 },
  }
}

/** 淋浴房：金属本体 / 内腔玻璃 / 五金。 */
export function showerCombo({
  body,
  interior,
  metal,
}: {
  body: Recipe
  interior?: Recipe
  metal?: Recipe
}): Record<string, Recipe> {
  return {
    body,

    interior: interior ?? { surface: 'glass', color: 0xdfeaec, transparent: true, opacity: 0.26, depthWrite: false },

    metal: metal ?? { surface: 'metal', color: 0xb4babf },
  }
}

/** 茶台组合：桌架 / 台板 / 凹槽 / 瓷件 / 点缀。 */
export function teaTableCombo({
  frame,
  panel,
  recess,
  ceramic,
  accent,
}: {
  frame: Recipe
  panel: Recipe
  recess?: Recipe
  ceramic: Recipe
  accent?: Recipe
}): Record<string, Recipe> {
  return {
    frame,
    panel,

    recess: recess ?? { surface: 'wood', color: shadeColor(frame.color as number, -0.42) },
    ceramic,
    accent: accent ?? ceramic,
  }
}

/** 摆件（书本 / 花瓶 / 托盘 / 纸巾盒 / 小盆栽）：底色 + 浅色件 + 深色件 + 点缀 + 叶片。 */
export function ornamentCombo({
  base,
  light,
  dark,
  accent,
  leaf,
}: {
  base: Recipe
  light: Recipe
  dark: Recipe
  accent?: Recipe
  leaf?: Recipe
}): Record<string, Recipe> {
  const derivedAccent: Recipe = { surface: 'ceramic', color: shadeColor(base.color as number, 0.18) }
  const derivedLeaf: Recipe = { surface: 'foliage', color: 0x5f8c4d }
  return {
    base,
    light,
    dark,
    accent: accent ?? derivedAccent,
    leaf: leaf ?? derivedLeaf,
  }
}
