/**
 * 外部模型「材质槽位 / 角色 → 材质配方」集中表（对齐 homeos-3d 0.6.5）。
 *
 * 背景：0.6.5 的材质统一命名为 `material-<槽位>-<角色>`，角色由代码消费
 * （见 0.6.5 的 studio-material-styles.ts / studio-external-models.ts）。
 * 新项目的 GLB 命名分五套体系：
 *   - `<type>-material-N`（无角色，需靠 slot 表定位）
 *   - `material-N-role`
 *   - `<type>-furniture-role` / `<type>-detail-role`
 *   - `<type>-aquatic-role` / `<type>-garden-role` / `<type>-decor-N` / `<type>-tea-role`
 *   - legacy 名（`004`、`car_tms`、`金色金属材料` …）
 * 本模块把这些体系统一解析成角色，再按「家族 → 角色 → 配方」给出颜色与表面参数，
 * 让调色板按角色着色，而不是靠亮度 / 槽位号猜。
 *
 * 约定：灯光（`floorlamp / walllamp` 等外部灯具与程序化灯）只登记角色数据，
 * 是否走本表由接入方决定。
 */
import { courtyardPalette } from "../plan/courtyard-models";
import { DECOR_MODELS, DECOR_THEMES } from "../studio/decor-models";

/** 表面族：决定默认粗糙度 / 金属度（对齐 0.6.5 的 SURFACE_ROUGHNESS / SURFACE_METALNESS）。 */
export type MaterialSurface =
  | "fabric"
  | "leather"
  | "wood"
  | "marble"
  | "stone"
  | "metal"
  | "lacquer"
  | "glass"
  | "ceramic"
  | "foliage"
  | "paint";

/**
 * 石材板色号（大理石贴图的两支画法）：整块石材按**一张整图**贴到板面上，
 * 颜色由贴图自己带（材质基色只作一层薄染色），所以它不属于「表面族」的粗糙度兜底，
 * 而是独立的一层：抛光面 + 自带纹路。
 */
export type StoneSlabFlavor = "marble" | "marble-dark";

/** 一条材质配方：颜色取调色板键或固定色号；表面族决定粗糙度 / 金属度。 */
export interface RoleRecipe {
  /** 调色板键（运行时由 itemPalette 解析）或固定色号。 */
  color: string | number;
  surface?: MaterialSurface;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  flatShading?: boolean;
  polygonOffset?: boolean;
  depthWrite?: boolean;
  /** 暖木主题专用色（优先于 `color`）。 */
  warmColor?: string | number;
  /** 默认主题专用色（优先于 `color`）。 */
  defaultColor?: string | number;
  /** 自发光色（调色板键或色号）；不填则不自发光。 */
  emissive?: string | number;
  emissiveIntensity?: number;
  /** 在解析出的颜色上再乘一个系数（用于 recess / shadow 这类「比本体更暗」的角色）。 */
  multiply?: number;
  /**
   * 石材板色号（0.6.5 STONE_SLAB_FLAVOR_BY_MODEL_SLOT 的等价物）：
   * 声明了它，这一槽就按「整块石材」出图 —— 贴一张自带纹路的大理石整图。
   */
  slab?: StoneSlabFlavor;
  /** 布艺标记：接入方据此设置 userData.warmDiningFabric。 */
  fabricLike?: boolean;
}

/** 已解析的配方：颜色 / 自发光都已变成具体色号。 */
interface ResolvedRoleRecipe extends RoleRecipe {
  role: string;
  slot?: number;
  colorValue: number;
  emissiveValue?: number;
}

/** 表面族 → 默认粗糙度 / 金属度（对齐 0.6.5）。 */
const SURFACE_FINISH: Record<MaterialSurface, { roughness: number; metalness: number }> = {
  fabric: { roughness: 0.94, metalness: 0 },
  leather: { roughness: 0.62, metalness: 0.02 },
  wood: { roughness: 0.72, metalness: 0.02 },
  marble: { roughness: 0.3, metalness: 0.04 },
  stone: { roughness: 0.66, metalness: 0.02 },
  metal: { roughness: 0.32, metalness: 0.72 },
  lacquer: { roughness: 0.36, metalness: 0.06 },
  glass: { roughness: 0.14, metalness: 0.06 },
  ceramic: { roughness: 0.3, metalness: 0.02 },
  foliage: { roughness: 0.9, metalness: 0 },
  paint: { roughness: 0.55, metalness: 0.02 },
};

/** 只存在于暖木调色板的键 → 默认主题下的回退键（保证默认主题也有合理颜色）。 */
const PALETTE_KEY_FALLBACK: Record<string, string> = {
  wood: "furniture",
  woodLight: "furnitureLight",
  woodDark: "furnitureDark",
  cabinetWood: "furnitureDark",
  cabinetBody: "furnitureDark",
  cabinetDoor: "furnitureLight",
  countertop: "furnitureLight",
  joineryAccent: "furnitureSoft",
  decorAccent: "accent",
  sofaFabric: "furnitureLight",
  diningLinen: "furnitureSoft",
  diningSage: "furnitureSoft",
  leafColor: "furniture",
  runnerColor: "furnitureSoft",
  rollerCurtain: "furnitureLight",
  rollerSlat: "furnitureDark",
  showerMetal: "applianceSoft",
  floorLampBody: "furniture",
  windowFrame: "frame",
  // 门框的三档是「按门型」取的键（实木门 / 入户门 / 其余），档位只要声明 doorFrame
  // 这一支就够：另两档顺着这条链落到同一色上，预设表因此不必逐个门型重复写三遍。
  doorFrame: "frame",
  entryDoorFrame: "doorFrame",
  solidDoorFrame: "doorFrame",
};

type PaletteLike = Record<string, unknown> | null | undefined;

/** 表面族 → 粗糙度 / 金属度（逐物件档位表也要用同一份，故对外导出）。 */
export function materialSurfaceFinish(
  surface: MaterialSurface | undefined,
): { roughness: number; metalness: number } | undefined {
  return surface ? SURFACE_FINISH[surface] : undefined;
}

/**
 * 石材板色号 → 抛光面参数（对齐 0.6.5 STONE_SLAB_FINISH_BY_FLAVOR）。
 *
 * 为什么不能沿用 `surface` 那一列：石材板的角色配方常常写 `surface: "stone"`（哑光 0.66），
 * 而贴了整图的大理石板是**抛光面**（0.24 / 0.18）。色号自己带抛光参数，才不会让黑金大理石
 * 变成一块磨砂黑板。
 */
const STONE_SLAB_FINISH: Record<StoneSlabFlavor, { roughness: number; metalness: number }> =
  Object.freeze({
    marble: { roughness: 0.24, metalness: 0.03 },
    "marble-dark": { roughness: 0.18, metalness: 0.04 },
  });

/** 石材板色号 → 抛光面参数；未登记的色号返回 null（调用方退回角色配方）。 */
export function stoneSlabSurfaceFinish(
  flavor: StoneSlabFlavor | undefined,
): { roughness: number; metalness: number } | null {
  return flavor ? (STONE_SLAB_FINISH[flavor] ?? null) : null;
}

/** 取值是否是合法的石材板色号。 */
export function isStoneSlabFlavor(value: unknown): value is StoneSlabFlavor {
  return value === "marble" || value === "marble-dark";
}

/**
 * 解析配方里的颜色声明：色号直接用；调色板键沿 `PALETTE_KEY_FALLBACK` 逐级回落，
 * 最终落到 `furniture`。逐物件档位表（studio-material-presets）与本表共用同一条规则。
 */
export function resolveMaterialPaletteColor(palette: PaletteLike, spec: string | number | undefined): number {
  if (typeof spec === "number") return spec;
  if (!spec) return typeof palette?.furniture == "number" ? (palette.furniture as number) : 0x7d8089;
  let key: string | undefined = spec;
  const visited = new Set<string>();
  while (key && !visited.has(key)) {
    visited.add(key);
    const value = palette?.[key];
    if (typeof value == "number") return value;
    key = PALETTE_KEY_FALLBACK[key];
  }
  return typeof palette?.furniture == "number" ? (palette.furniture as number) : 0x7d8089;
}

/**
 * 把色号按系数压暗 / 提亮（`multiply` 用）。
 *
 * 必须**逐通道**缩放：色号是 0xRRGGBB 的打包整数，直接拿整型乘系数会让低位通道
 * 向高位借位（例如 `0x687488 * 0.45` 得 `0x2f013d` —— 紫红色，而不是预期的
 * `0x2f343d` 深蓝灰；暖木 `0x4b5455 * 0.45` 会得亮青色 `0x21e5f3`）。
 */
export function scaleMaterialColorChannels(color: number, factor: number): number {
  if (!Number.isFinite(factor) || factor === 1) return color >>> 0;
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((color >>> shift) & 0xff) * factor)));
  return ((channel(16) << 16) | (channel(8) << 8) | channel(0)) >>> 0;
}

/* -------------------------------------------------------------------------- */
/* 角色词表（并集，沿用 0.6.5）                                                */
/* -------------------------------------------------------------------------- */

export const MATERIAL_ROLE_VOCABULARY = Object.freeze([
  "body",
  "door",
  "drawer",
  "panel",
  "top",
  "base",
  "trim",
  "leg",
  "side",
  "back",
  "frame",
  "shelf",
  "interior",
  "handle",
  "glass",
  "mirror",
  "metal",
  "screen",
  "grating",
  "lit",
  "sink",
  "cooktop",
  "book",
  "stash",
  "accent",
  "upholstery",
  "fabric",
  "cushion",
  "surface",
  "shadow",
  "recess",
  "indicator",
  "control",
  "water",
  "sand",
  "rock",
  "fish",
  "foliage",
  "foliageSoft",
  "pot",
  "soil",
  "slab",
  "key",
  "paper",
  "ceramic",
  "runner",
  "linen",
  "sage",
  "wood",
  "dark",
  "light",
  "leaf",
  "seat",
  "tread",
  "handrail",
  // 卷帘门的两块料：帘布与帘片（主题里 rollerCurtain / rollerSlat 本来就分两色）。
  "shutter",
  "slat",
] as const);

/** 角色 → 中文短标签（检查面板 / 报表用；查不到就退回角色名本身）。 */
export const MATERIAL_ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
  body: "主体",
  door: "门板",
  drawer: "抽屉",
  panel: "面板",
  top: "台面",
  base: "底座",
  trim: "收边",
  leg: "支腿",
  side: "侧板",
  back: "背板",
  frame: "框架",
  shelf: "层板",
  interior: "内腔",
  handle: "把手",
  glass: "玻璃",
  mirror: "镜面",
  metal: "金属",
  screen: "屏幕",
  grating: "格栅",
  lit: "发光面",
  sink: "水槽",
  cooktop: "灶面",
  book: "书",
  stash: "收纳物",
  accent: "点缀",
  upholstery: "软包",
  fabric: "织物",
  cushion: "坐垫",
  surface: "装饰面",
  shadow: "暗部件",
  recess: "凹槽",
  indicator: "指示灯",
  control: "控制区",
  water: "水体",
  sand: "底砂",
  rock: "造景石",
  fish: "鱼",
  foliage: "枝叶",
  foliageSoft: "浅色枝叶",
  pot: "花盆",
  soil: "土壤",
  slab: "板材",
  key: "琴键",
  paper: "纸张",
  ceramic: "陶瓷",
  runner: "床尾巾",
  linen: "床品",
  sage: "灰绿饰面",
  wood: "木面",
  dark: "深色件",
  light: "浅色件",
  leaf: "叶片",
  seat: "座面",
  tread: "踏步",
  handrail: "扶手",
  // 门的卷帘：帘布与帘片是两块料（主题里 rollerCurtain / rollerSlat 本来就不同色），
  // 所以分两个角色登记，卷帘门的「材质属性」面板才能逐块调。
  shutter: "卷帘",
  slat: "帘片",
});

/** 取角色的中文标签；未知角色原样返回，避免界面出现空白。 */
export function materialRoleLabel(role: string | undefined): string {
  return (role && MATERIAL_ROLE_LABELS[role]) || role || "未识别";
}

/* -------------------------------------------------------------------------- */
/* 共享角色配方（跨家族通用）                                                  */
/* -------------------------------------------------------------------------- */

const COMMON_ROLE_RECIPES: Readonly<Record<string, RoleRecipe>> = Object.freeze({
  metal: { color: 0x8e939a, surface: "metal" },
  handle: { color: 0xa7adb4, surface: "metal" },
  grating: { color: 0x55595e, surface: "metal" },
  glass: { color: "glass", surface: "glass", transparent: true, opacity: 0.34, depthWrite: false },
  mirror: { color: 0xc9d2d8, surface: "glass", transparent: true, opacity: 0.5, depthWrite: false },
  water: { color: 0x7fb3c8, surface: "glass", transparent: true, opacity: 0.5, depthWrite: false },
  screen: { color: 0x0f1114, surface: "lacquer" },
  lit: { color: 0x23262b, surface: "lacquer" },
  indicator: {
    color: "furnitureSoft",
    surface: "lacquer",
    emissive: "furnitureSoft",
    emissiveIntensity: 0.5,
  },
  control: { color: "furnitureSoft", surface: "lacquer" },
  paper: { color: "furnitureLight", surface: "paint" },
  book: { color: 0xd8c7a5, surface: "paint" },
  rock: { color: "applianceDark", surface: "stone", flatShading: true },
  recess: { color: "applianceDark", surface: "lacquer", multiply: 0.45 },
  shadow: { color: "furnitureDark", surface: "wood" },
});

/* -------------------------------------------------------------------------- */
/* 家族 → 角色配方                                                             */
/* -------------------------------------------------------------------------- */

type RoleRecipeTable = Readonly<Record<string, RoleRecipe>>;

const FAMILY_ROLE_RECIPES: Record<string, RoleRecipeTable> = {
  /** 柜体 / 木作柜类：cabinet / bookcase / shelf / 橱柜 / 电视柜 … */
  joinery: {
    body: { color: "furniture", surface: "wood" },
    frame: { color: "furniture", surface: "wood" },
    side: { color: "furniture", surface: "wood" },
    back: { color: "furnitureDark", surface: "wood" },
    door: { color: "cabinetDoor", surface: "wood" },
    drawer: { color: "cabinetDoor", surface: "wood" },
    panel: { color: "cabinetBody", surface: "wood" },
    interior: { color: "furnitureDark", surface: "wood" },
    // 0.6.5 joineryCombo 的默认：层板 / 踢脚 / 压条都跟随柜体（body），柜脚跟随踢脚。
    shelf: { color: "furniture", surface: "wood" },
    top: { color: "countertop", surface: "stone", slab: "marble" },
    base: { color: "furniture", surface: "wood" },
    trim: { color: "furniture", surface: "wood" },
    leg: { color: "furniture", surface: "wood" },
    stash: { color: "furnitureSoft", surface: "leather" },
    accent: { color: 0xb5764f, surface: "ceramic" },
    sink: { color: 0xb9c0c6, surface: "metal" },
    cooktop: { color: 0x1d1f22, surface: "lacquer" },
    ceramic: { color: "applianceSoft", surface: "ceramic" },
    fabric: { color: "furnitureSoft", surface: "fabric" },
    surface: { color: "countertop", surface: "stone", slab: "marble" },
  },
  /** 木器家具：餐桌 / 吧台 / 茶几 / 岛台 … */
  woodwork: {
    body: { color: "wood", surface: "wood" },
    frame: { color: "wood", surface: "wood" },
    top: { color: "countertop", surface: "stone", slab: "marble" },
    surface: { color: "countertop", surface: "stone", slab: "marble" },
    slab: { color: "countertop", surface: "stone", slab: "marble" },
    base: { color: "furnitureDark", surface: "wood" },
    leg: { color: "furnitureDark", surface: "wood" },
    trim: { color: "woodLight", surface: "wood" },
    drawer: { color: "cabinetDoor", surface: "wood" },
    shelf: { color: "furnitureDark", surface: "wood" },
    door: { color: "cabinetDoor", surface: "wood" },
    panel: { color: "cabinetBody", surface: "wood" },
    interior: { color: "furnitureDark", surface: "wood" },
    cushion: { color: "furnitureSoft", surface: "fabric", fabricLike: true },
    linen: { color: "diningLinen", surface: "fabric", fabricLike: true },
    sage: { color: "diningSage", surface: "fabric", fabricLike: true },
    ceramic: { color: "applianceSoft", surface: "ceramic" },
    shadow: { color: "woodDark", surface: "wood" },
    // 台面球布 / 餐桌桌旗这类「木器上的软面」。
    fabric: { color: "furnitureSoft", surface: "fabric" },
    accent: { color: "decorAccent", surface: "fabric" },
  },
  /** 软装：沙发 / 椅 / 床 / 办公椅 / 台球桌 … */
  upholstery: {
    frame: { color: "wood", surface: "wood" },
    fabric: { color: "sofaFabric", surface: "fabric" },
    cushion: { color: "sofaFabric", surface: "fabric" },
    surface: { color: "sofaFabric", surface: "fabric" },
    accent: { color: "furnitureSoft", surface: "fabric" },
    upholstery: { color: "sofaFabric", surface: "fabric" },
    shadow: { color: "woodDark", surface: "wood" },
    leg: { color: "woodDark", surface: "wood" },
    runner: { color: "runnerColor", surface: "fabric" },
    dark: { color: "furnitureDark", surface: "wood" },
    light: { color: "furnitureLight", surface: "fabric" },
  },
  /** 地毯：颜色从 joineryAccent / furnitureLight 派生 */
  rug: {
    frame: { color: "joineryAccent", surface: "fabric" },
    body: { color: "joineryAccent", surface: "fabric" },
    fabric: { color: "furnitureLight", surface: "fabric" },
    soft: { color: "furnitureLight", surface: "fabric" },
    accent: { color: "decorAccent", surface: "fabric" },
  },
  /** 洁具：台盆 / 马桶 / 浴缸 / 淋浴 / 小便斗 … */
  ceramic: {
    body: { color: "applianceSoft", surface: "ceramic" },
    top: { color: "applianceSoft", surface: "ceramic" },
    interior: { color: "applianceSoft", surface: "ceramic", roughness: 0.24 },
    frame: { color: "appliance", surface: "ceramic" },
    base: { color: "furnitureDark", surface: "wood" },
    trim: { color: "appliance", surface: "ceramic" },
    metal: { color: 0xb7bec5, surface: "metal" },
    grating: { color: 0x6d7278, surface: "metal" },
    sink: { color: "applianceSoft", surface: "ceramic" },
    door: { color: "cabinetDoor", surface: "wood" },
    drawer: { color: "cabinetDoor", surface: "wood" },
    panel: { color: "cabinetBody", surface: "wood" },
    handle: { color: 0xa7adb4, surface: "metal" },
    mirror: {
      color: 0xcdd6dc,
      surface: "glass",
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    },
  },
  /** 家电：冰箱 / 洗衣机 / 烤箱 / 微波炉 / 热水器 / 油烟机 … */
  appliance: {
    body: { color: "applianceSoft", surface: "metal" },
    top: { color: "applianceSoft", surface: "metal" },
    door: { color: "appliance", surface: "metal" },
    drawer: { color: "appliance", surface: "metal" },
    panel: { color: "applianceDark", surface: "lacquer" },
    base: { color: "applianceDark", surface: "metal" },
    trim: { color: "appliance", surface: "metal" },
    handle: { color: 0x9aa0a6, surface: "metal" },
    metal: { color: 0xb7bec5, surface: "metal" },
    glass: { color: "glass", surface: "glass", transparent: true, opacity: 0.4, depthWrite: false },
    grating: { color: 0x5f6469, surface: "metal" },
    lit: { color: "applianceDark", surface: "lacquer" },
    cooktop: { color: 0x1b1d20, surface: "lacquer" },
    screen: { color: 0x0f1114, surface: "lacquer" },
    indicator: {
      color: "furnitureSoft",
      surface: "lacquer",
      emissive: "furnitureSoft",
      emissiveIntensity: 0.5,
    },
  },
  /** 智能设备：NAS / 电脑 / 路由 / 打印机 / 净化器 / 扫地机 / 电视 … */
  device: {
    body: { color: "appliance", surface: "lacquer" },
    frame: { color: "appliance", surface: "lacquer" },
    top: { color: "applianceSoft", surface: "lacquer" },
    panel: { color: "applianceSoft", surface: "lacquer" },
    trim: { color: "appliance", surface: "metal" },
    control: { color: "applianceSoft", surface: "lacquer" },
    indicator: {
      color: "furnitureSoft",
      surface: "lacquer",
      emissive: "furnitureSoft",
      emissiveIntensity: 0.5,
    },
    screen: { color: 0x0a0c0f, surface: "lacquer" },
    paper: { color: "furnitureLight", surface: "paint" },
    drawer: { color: "furnitureDark", surface: "lacquer" },
    lit: { color: "applianceDark", surface: "lacquer" },
    water: { color: 0x8fc0d0, surface: "glass", transparent: true, opacity: 0.5, depthWrite: false },
    dark: { color: "applianceDark", surface: "lacquer" },
    leg: { color: "applianceDark", surface: "lacquer" },
    base: { color: "applianceDark", surface: "lacquer" },
    metal: { color: 0x9aa0a6, surface: "metal" },
    accent: { color: "accent", surface: "lacquer" },
  },
  /** 窗帘：布面 + 轨道 / 配件 */
  curtain: {
    fabric: { color: "rollerCurtain", surface: "fabric" },
    accent: { color: "furnitureLight", surface: "fabric" },
    metal: { color: "furnitureDark", surface: "metal" },
    trim: { color: "furnitureLight", surface: "fabric" },
  },
  /** 绿植：盆 / 土 / 叶 */
  plant: {
    pot: { color: "decorAccent", surface: "ceramic" },
    base: { color: "furnitureDark", surface: "ceramic" },
    soil: { color: 0x3b3128, surface: "stone" },
    foliage: { color: 0x5f7d4d, surface: "foliage" },
    foliageSoft: { color: 0x77915f, surface: "foliage" },
    leaf: { color: "leafColor", surface: "foliage" },
    body: { color: "furnitureDark", surface: "wood" },
  },
  /** 柱族：跟墙色走 */
  pillar: {
    body: { color: "wall", surface: "paint" },
    base: { color: "wall", surface: "paint", multiply: 0.92 },
    trim: { color: "wall", surface: "paint", multiply: 1.18 },
  },
  /** 楼梯：只提供角色数据，材质收尾仍走 applyStairMaterial / 专用分支 */
  stair: {
    tread: { color: "floor", surface: "wood" },
    body: { color: 0x737779, surface: "metal" },
    frame: { color: "furnitureSoft", surface: "metal" },
    handrail: { color: "furnitureDark", surface: "metal" },
    top: { color: "floor", surface: "wood" },
    trim: { color: "floorEdge", surface: "metal" },
    panel: { color: "furnitureSoft", surface: "metal" },
    glass: { color: "glass", surface: "glass", transparent: true, opacity: 0.3, depthWrite: false },
    metal: { color: "furnitureSoft", surface: "metal" },
  },
  /** 车辆：只提供角色数据，材质收尾仍走 applyCarFinish / applyVehicleFinish */
  vehicle: {
    body: { color: "furniture", surface: "lacquer", metalness: 0.55, roughness: 0.32 },
    glass: {
      color: 0x1f2933,
      surface: "glass",
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    },
    base: { color: 0x2c3034, surface: "metal" },
    seat: { color: "furnitureDark", surface: "leather" },
    dark: { color: 0x1a1c1f, surface: "lacquer" },
    trim: { color: 0x2c3034, surface: "metal" },
    metal: { color: 0xb7bec5, surface: "metal" },
    emissive: {
      color: 0xfff2cf,
      surface: "lacquer",
      emissive: 0xfff2cf,
      emissiveIntensity: 0.6,
    },
  },
  /** 灯具：登记角色数据（是否走本表由接入方决定） */
  lamp: {
    base: { color: "furnitureDark", surface: "metal" },
    metal: { color: 0x8e939a, surface: "metal" },
    trim: { color: "floorLampBody", surface: "wood" },
    lit: { color: "furnitureSoft", surface: "lacquer" },
    accent: { color: "accent", surface: "lacquer" },
    body: { color: "appliance", surface: "metal" },
  },
  /** 水族箱 */
  aquatic: {
    frame: { color: "cabinetWood", surface: "wood" },
    shadow: { color: "furnitureDark", surface: "wood" },
    sand: { color: "countertop", surface: "stone" },
    rock: { color: "applianceDark", surface: "stone", flatShading: true },
    foliage: { color: "leafColor", surface: "foliage" },
    fish: { color: "decorAccent", surface: "paint" },
    glass: { color: "glass", surface: "glass", transparent: true, opacity: 0.34, depthWrite: false },
    water: { color: "glass", surface: "glass", transparent: true, opacity: 0.5, depthWrite: false },
  },
  /** 茶台组合 */
  tea: {
    frame: { color: "wood", surface: "wood" },
    panel: { color: "woodLight", surface: "wood" },
    recess: { color: "furnitureDark", surface: "wood" },
    ceramic: { color: "furnitureLight", surface: "ceramic" },
    accent: { color: "decorAccent", surface: "wood" },
  },
  /** 户外 / 园林：颜色由 courtyardPalette 决定，此处只登记角色。 */
  garden: {
    base: { color: "furniture", surface: "paint" },
    light: { color: "furnitureLight", surface: "paint" },
    dark: { color: "furnitureDark", surface: "paint" },
    leaf: { color: "leafColor", surface: "foliage" },
    water: { color: "glass", surface: "glass", transparent: true, opacity: 0.42, depthWrite: false },
    accent: { color: "accent", surface: "paint" },
  },
  /** 摆件：颜色由 DECOR_THEMES 决定，此处只登记角色。 */
  decor: {
    base: { color: "furniture", surface: "paint" },
    light: { color: "furnitureLight", surface: "paint" },
    dark: { color: "furnitureDark", surface: "paint" },
    accent: { color: "accent", surface: "paint" },
    leaf: { color: "leafColor", surface: "foliage" },
  },
  /**
   * 门（户型里的洞口构件）：几何是程序化拼出来的，没有 GLB 材质槽，角色由
   * `MODEL_SLOT_ROLES.door` 登记（门框 / 门扇 / 玻璃 / 五金 / 卷帘 / 帘片）。
   *
   * 这一支只作「跟随主题」的取色基准 —— 色卡 auto 档、面板上的当前色都读它。真正的门型
   * 差异（实木门用 solidDoorFrame、入户门用 entryDoorFrame）由 studio-app 的
   * `resolveDoorPartMaterials` 按 doorType 取键，比这里更细，故不在此重复。
   * 键的回落链在 PALETTE_KEY_FALLBACK 里（doorFrame → frame、rollerSlat → furnitureDark…），
   * 默认主题缺这些键时也能落到合理的色上。
   */
  door: {
    frame: { color: "doorFrame", surface: "wood" },
    door: { color: "doorLeaf", surface: "wood" },
    glass: { color: "glass", surface: "glass", transparent: true, opacity: 0.34, depthWrite: false },
    metal: { color: "furnitureDark", surface: "metal" },
    shutter: { color: "rollerCurtain", surface: "fabric" },
    slat: { color: "rollerSlat", surface: "metal" },
    trim: { color: "furnitureSoft", surface: "wood" },
  },
  /** 其他 / 兜底 */
  misc: {
    body: { color: "furniture", surface: "paint" },
    frame: { color: "furniture", surface: "metal" },
    panel: { color: "applianceSoft", surface: "paint" },
    trim: { color: "appliance", surface: "metal" },
    recess: { color: "applianceDark", surface: "lacquer", multiply: 0.45 },
    base: { color: "furnitureDark", surface: "paint" },
  },
};

export const ROLE_RECIPES_BY_FAMILY: Readonly<Record<string, RoleRecipeTable>> =
  Object.freeze(FAMILY_ROLE_RECIPES);

/* -------------------------------------------------------------------------- */
/* itemType → 家族                                                             */
/* -------------------------------------------------------------------------- */

const FAMILY_BY_ITEM_TYPE: Readonly<Record<string, string>> = Object.freeze({
  cabinet: "joinery",
  wallcabinet: "joinery",
  shoecabinet: "joinery",
  sideboard: "joinery",
  bookcase: "joinery",
  shelf: "joinery",
  nightstand: "joinery",
  tvstand: "joinery",
  kitchenbase: "joinery",
  kitchensink: "joinery",
  kitchencooktop: "joinery",
  glasscabinet: "joinery",
  // 桌子（desk）不是柜类：它没有柜门 / 内腔 / 水槽 / 灶头，台面 + 侧板 + 拉手就是全部。
  // 0.6.5 给它的角色是 top / body / drawer / leg / metal，与 `woodwork`（桌几 / 吧台 /
  // 茶几 / 台球桌）同一套词表 —— 归到 joinery 会拿到「石材台面 + 柜门」的柜类档位，
  // 桌面最大的那块面反而落在柜体色上，档位名（木柜白门…）在这件家什上也无从兑现。
  desk: "woodwork",
  vanity: "joinery",
  wardrobe: "joinery",
  "drawer-chest": "joinery",
  chestdrawer: "joinery",
  table: "woodwork",
  rounddiningtable: "woodwork",
  rounddiningtable_turntable: "woodwork",
  bar: "woodwork",
  coffeetable: "woodwork",
  squarecoffeetable: "woodwork",
  kitchenisland: "woodwork",
  "pool-table": "woodwork",
  sofa: "upholstery",
  "sofa-single": "upholstery",
  "sofa-l": "upholstery",
  "sofa-l-left": "upholstery",
  chair: "upholstery",
  "office-chair": "upholstery",
  bed: "upholstery",
  "bunk-bed": "upholstery",
  rug: "rug",
  basin: "ceramic",
  toilet: "ceramic",
  squattoilet: "ceramic",
  urinal: "ceramic",
  bathtub: "ceramic",
  shower: "ceramic",
  glasspartition: "ceramic",
  fridge: "appliance",
  rangehood: "appliance",
  dishwasher: "appliance",
  steamoven: "appliance",
  microwave: "appliance",
  ricecooker: "appliance",
  washer: "appliance",
  dryer: "appliance",
  storagewaterheater: "appliance",
  gaswaterheater: "appliance",
  wallac: "appliance",
  floorac: "appliance",
  freezer: "appliance",
  oven: "appliance",
  inductioncooker: "appliance",
  nas: "device",
  desktop: "device",
  laptop: "device",
  router: "device",
  printer: "device",
  airpurifier: "device",
  humidifier: "device",
  dehumidifier: "device",
  heater: "device",
  robotvacuum: "device",
  "smart-socket-86": "device",
  tv_standard: "device",
  tv_tabletop: "device",
  tv_mobile: "device",
  screenpanel: "device",
  tv: "device",
  curtain_left: "curtain",
  curtain_right: "curtain",
  curtain_split: "curtain",
  floorlamp: "lamp",
  walllamp: "lamp",
  "floor-lamp": "lamp",
  stairs: "stair",
  steelstairs: "stair",
  glassstairs: "stair",
  floatingstairs: "stair",
  smallcar: "vehicle",
  car: "vehicle",
  suv: "vehicle",
  scooter: "vehicle",
  aquarium: "aquatic",
  door: "door",
  "tea-table-set": "tea",
  plant: "plant",
  piano: "misc",
  elevator: "misc",
  airoutlet: "misc",
  pipelinewaterpurifier: "misc",
  tea_bar_machine: "misc",
});

/** itemType → 家族；未登记的按前缀 / 名称规约推断，最终落到 `misc`。 */
export function resolveModelFamily(itemType: string): string {
  const explicitFamily = FAMILY_BY_ITEM_TYPE[itemType];
  if (explicitFamily) return explicitFamily;
  if (itemType.startsWith("garden-")) return "garden";
  if (itemType.startsWith("decor-")) return "decor";
  if (itemType.startsWith("pillar")) return "pillar";
  if (itemType.startsWith("curtain_")) return "curtain";
  if (itemType.startsWith("sofa")) return "upholstery";
  if (itemType.startsWith("tv")) return "device";
  if (/stairs$/.test(itemType)) return "stair";
  return "misc";
}

/** 家族 → 是否属于「结构型」模型（颜色由专用逻辑接管，本表只供数据）。 */
export function isStructuralModelFamily(family: string): boolean {
  return ["stair", "vehicle", "pillar", "lamp"].includes(family);
}

/* -------------------------------------------------------------------------- */
/* 槽位 → 角色（只有 `<type>-material-N` 的模型靠它定位）                       */
/* -------------------------------------------------------------------------- */

export const MODEL_SLOT_ROLES: Readonly<Record<string, readonly (string | null)[]>> = Object.freeze({
  // 以 0.6.5 `material-<槽位>-<角色>` 为准；新模型槽位更多时按最接近角色顺延，
  // 更少时截断，并用 GLB 材质的透明 / 自发光 / 金属度把这些「无角色」槽位修正回
  // 正确语义（玻璃 → glass / mirror，发光屏 → lit / indicator，高金属 → metal）。
  bar: ["top", "body", "base", "trim", "leg", "metal"],
  // 台盆（浴室柜）的图元顺序与几何一度对不上，这里按图元实测尺寸重排：柜体 / **台面** /
  // 盆体 / 收边 分别是第 0/1/2/3 个图元 ——
  //   material-0 = 0.83×0.63×0.45 的柜体（y 0→0.634）；material-1 = 0.90×0.065×0.50 的**台面**
  //   薄板（y 0.627→0.692）；material-2 = 0.45×0.45×0.08 坐在台面上的**盆体**（y 0.664→0.744）；
  //   material-3 = 1.2cm 宽的**竖收边**（0.012×0.546×0.010）。
  // 原先写成 `door` / `handle`，于是台面按柜门语义上了木色、盆体按五金语义上了金属，而真正的
  // `top` 落在那条 1.2cm 收边上 —— 「给台面加大理石档位」会画到一根肉眼看不见的细线。
  basin: ["frame", "top", "sink", "trim", "mirror", "metal", "base"],
  bathtub: ["body", "interior", "trim", "metal", "metal"],
  // bookcase 的图元 3~6 是柜内小摆件（0.085~0.15m、金属度≈0、烘焙色为陶土/深木色），
  // 不是柜体结构件，按 0.6.5 joineryCombo 的「撞色摆件」语义给 accent（陶土色）。
  bookcase: [
    "interior",
    "base",
    "shelf",
    "accent",
    "accent",
    "accent",
    "accent",
    "body",
    "accent",
    "shelf",
    "shelf",
    "book",
    "book",
    "book",
    "book",
    "book",
    "book",
  ],
  // cabinet 是新资产里唯一**把柜体和两扇柜门并进同一个闭合箱**的柜类（`cabinet.glb` 只有
  // 3 个图元）：0.80×1.90×0.45 的闭合箱体 / 箱体正前方一条 18mm 宽、贯通的**中缝分隔条**
  // （z 到 0.2318，比箱体前脸 0.225 多探出 6.8mm，所以从正面能看见；原先占着 `door` 槽）/
  // 前脸拉手（z 到 0.2493，金属）。
  //
  // 因此槽 0 必须给 `door`：柜体前脸就是柜门面（±z 各 3.04m²，是整件最大的一块面，
  // 拉手就装在这面上），柜类档位之间**唯一**的可见差异又只在「柜门」这一支料
  // （木柜白门 0x5a3a22 vs 胡桃木 0x6b4526，`body` 色两支完全相同），给 `body` 会让
  // 「木柜白门」和「胡桃木」在这件柜子上画出一模一样的结果 —— 也就是「选了档位没变化」。
  // 槽 1 的中缝条同理要跟柜门同色：它是门缝，不是另一种料，给 `interior`/`trim`
  // 会变成白柜门正中一道深色竖线，看起来像渲染错误。
  cabinet: ["door", "door", "metal"],
  curtain_left: ["metal", "fabric", "fabric", "metal", "fabric", "fabric"],
  curtain_right: ["metal", "fabric", "fabric", "metal", "fabric", "fabric"],
  curtain_split: ["metal", "fabric", "fabric", "metal", "fabric", "fabric"],
  // desk（桌子 / 书桌）的新 GLB 只有 3 个图元（0.6.5 有 5 个：top/body/drawer/leg/metal），
  // 逐图元量过几何后这样分：
  //   0 = 0.38×0.02×0.03 细杆，y0.55、x0.12..0.50、z 出到 0.28（桌面前沿外），金属度 0.35
  //       → 抽屉拉手 `metal`。
  //   1 = 1.40×0.65 的板 + 围板，y0.49..0.74；朝上的面 1.11m²（其中 0.87m² 在 y=0.745，
  //       即 1.40×0.62 的**桌面**），另有 0.21m² 朝上的面在 y=0.63（围板内的抽屉箱）
  //       → `top`：桌面上最大的一块可见面在这里，档位要能改的就是它。
  //       （桌面前脸与围板是一体的，拆不开；woodCombo 里 `drawer` 本就默认跟随 `top`。）
  //   2 = 1.30×0.53、y0..0.67 的箱体：±x 各 0.69m² 且每侧都是「两片 0.34m² 的面 + 薄边」
  //       —— 中空薄壁**侧板**，不是细腿（细腿的垂直面不会占到大头）
  //       → `frame`（框架，面板上即「框架」）：这张桌子没有可单独上色的腿，桌架就是这两块
  //       侧板。给 `body`/`side` 的话它们会跟着台面同色（派生链 `body ← top`、`side ← body`），
  //       于是「黑砂金属腿」档位只动得到拉手 —— 与「胡桃木」几乎看不出差别；给 `frame`
  //       则桌架在木器档位里比台面深一档、在黑砂档位里转成黑金属（`frame ← trim`），
  //       四档都落在桌子的真实构件上且都能看出来。
  desk: ["metal", "top", "frame"],
  dishwasher: ["body", "door", "panel", "handle", "base", "screen"],
  // dryer / washer 的新 GLB 把 0.6.5 的 10 个节点合并成 6~7 个图元，图元顺序与 0.6.5
  // 的槽位顺序**不同**（0.6.5 是 body/top/base/door/glass/handle/panel/grating/screen/metal）：
  // 0=整机外壳(含顶盖，0.6.5 的 top 已并进来) → body
  // 1=0.649×0.18 前面上部窄条 → panel（控制面板，0.6.5 panel 0.34×0.09 同位）
  // 2=前方正中圆环 → door（0.6.5 door 0.5×0.54 同位，圆门）
  // 3=圆环内的深色窗（烘焙色 #05080b / #0a1017，与微波炉/蒸箱玻璃同档）→ glass
  // 4=0.078 圆钮（金属度 0.4，位置与 0.6.5 metal 0.056 圆钮一致）→ metal
  // 5=控制条左侧小横条 → handle
  // 6=washer 左下小抽屉（0.141×0.055，位置与 0.6.5 drawer 一致）→ drawer
  dryer: ["body", "panel", "door", "glass", "metal", "handle"],
  washer: ["body", "panel", "door", "glass", "metal", "handle", "drawer"],
  // 门是户型里的洞口构件，不是 GLB 模型：这张表登记的是**程序化门的部件 → 角色**，
  // 索引与 studio-app 的 `DOOR_MATERIAL_PARTS` 一一对应（0 门框 / 1 门扇 / 2 玻璃 /
  // 3 五金 / 4 卷帘 / 5 帘片）。有了它，门的「材质属性」就能与家具共用同一套档位
  // 色卡、逐部件取色与表面参数（材质名约定：`door-material-<n>`）。
  door: ["frame", "door", "glass", "metal", "shutter", "slat", "trim"],
  fridge: ["body", "panel", "handle"],
  // glasscabinet 的新 GLB 有 18 个图元（0.6.5 只有 7 个），按「图元相对整机包围盒的
  // 尺寸 / 位置」逐槽判定：0=背板(1.12×1.82×0.03, Z-0.185) / 1,2=下柜双门(前面板) /
  // 3,4,5=玻璃(BLEND) / 6..9=陈列小件(0.15m 高竖向小件) / 10=柜体(1.2×1.9×0.4) /
  // 11=内胆 / 12=玻璃门框(144 顶点环形) / 13..17=柜内收纳盒(≈0.8×0.8×0.168 套装)。
  glasscabinet: [
    "interior",
    "door",
    "door",
    "glass",
    "glass",
    "glass",
    "accent",
    "accent",
    "accent",
    "accent",
    "body",
    "interior",
    "trim",
    "stash",
    "stash",
    "stash",
    "stash",
    "stash",
  ],
  glasspartition: ["glass", "metal", "handle"],
  // 以下 7 个柜类模型的槽位顺序以**新 GLB 的真实图元顺序**为准（不是 0.6.5 的节点顺序）：
  // 依据是加载器里为这些新模型写死的 `cabinetDoorMaterialIndex` /
  // `countertopMaterialIndexByItemType`，以及每个图元相对整机包围盒的尺寸 / 位置。
  // 例：kitchenbase 的台面在槽 2、门板在槽 3；sideboard 的台面在槽 0、门板在槽 3。
  kitchenbase: ["base", "body", "top", "door", "metal"],
  kitchencooktop: ["base", "body", "top", "cooktop", "door", "metal", "metal", "metal"],
  kitchensink: ["base", "body", "top", "sink", "sink", "metal", "sink", "door", "metal"],
  microwave: ["body", "door", "glass", "panel", "indicator", "metal"],
  // nas 的槽位语义以加载器 `applyItemDetailMaterial` 里既有的 nas 配色表为准（逐槽同色）：
  // 0=浅色面板(applianceSoft) / 1=深色(applianceDark) / 2=凹陷(深×0.48) / 3=家电中色(appliance)
  // / 4=发光指示灯（复用下面的 nas.lit 覆盖项，保持 legacy 绿色自发光）。
  nas: ["panel", "base", "recess", "body", "lit"],
  nightstand: ["body", "top", "metal", "drawer", "base"],
  rangehood: ["body", "panel", "grating", "lit"],
  ricecooker: ["body", "top", "base", "trim", "indicator", "screen"],
  shelf: ["top", "metal", "shelf"],
  shoecabinet: ["interior", "base", "top", "body", "door"],
  shower: ["body", "interior", "metal"],
  // sideboard #4 是加载器 `repairSideboardGlassDoor` 现拆出来的「最右吊柜玻璃门」图元：
  // GLB 里 6 扇门共用一个 door 槽，运行时把那扇门单独摘出来并补上**两扇对开**的木框 + 玻璃，
  // 玻璃材质名沿用槽位约定（`sideboard-material-4`），故这里补登记 glass 角色。
  // #5 是同一个函数补的**五金件**（五扇木门 + 对开两扇的竖拉手 + 两扇各两片明铰链）：走通用的
  // `handle` 配方（金属色 + 高 metalness），换档位时不跟着柜体走。
  sideboard: ["top", "interior", "body", "door", "glass", "handle"],
  squattoilet: ["body", "interior", "grating"],
  stairs: ["body", "top", "trim"],
  steamoven: ["body", "door", "glass", "panel", "indicator", "drawer"],
  toilet: ["body", "top", "metal", "base", "trim"],
  tv_mobile: ["leg", "base", "metal", "body", "trim", "screen"],
  tv_standard: ["body"],
  tv_tabletop: ["base", "metal", "body", "trim"],
  urinal: ["body", "interior", "metal"],
  wallac: ["body", "grating", "lit"],
  wallcabinet: ["base", "body", "shelf", "door"],
  oven: ["body", "door", "glass", "panel", "handle"],
  // 落地灯：新资产丢了 legacy 材质名（`frosted-white` / `metal_corrogated_shiny` /
  // `white_ppc1` …），5 个槽位全落到家族默认角色 `base` 上 —— 整盏灯会刷成配重底板的
  // 颜色，`暖铜` 与 `胡桃木` 两档画出来完全一样（暖铜落地灯渲染成黑的）。按图元量出的
  // 几何：0.34m 圆盘 y≈0（配重底板）/ 0.90×1.60 立杆悬臂 / 0.46m 鼓形灯罩 y1.37~1.58 /
  // φ0.45 圆环 y1.36~1.38（罩口圈，比杆稍暗出棱线）/ 罩顶小旋钮 y1.56~1.61。
  floorlamp: ["base", "body", "lit", "metal", "trim"],
  // 壁灯：0.20×0.17 主灯体（灯罩之后）/ 0.07 方形接线盒（更靠墙，z 更小）/
  // 0.18m 灯罩 / φ0.09 圆环在罩底 —— 罩口圈。
  walllamp: ["body", "base", "lit", "metal"],
});

/* -------------------------------------------------------------------------- */
/* 门（程序化几何）的部件表                                                     */
/* -------------------------------------------------------------------------- */

/**
 * 门的部件顺序：`door-material-<n>` 的 n 就是这里的下标，也是 `MODEL_SLOT_ROLES.door` 的槽位号。
 *
 * 门没有 GLB 可扫，槽位由 studio-app 按门型程序化拼出来；这张表放在这里是为了让运行时
 * （`resolveDoorPartMaterials` / 材质面板）与校验脚本（`proceduralHostFacts`）读同一份事实 ——
 * 门型新增部件时两边不会各记一套。
 */
export const DOOR_MATERIAL_PARTS: readonly string[] = Object.freeze([
  "frame",
  "door",
  "glass",
  "metal",
  "shutter",
  "slat",
  // 入户门门扇上那两道装饰横线：本来就读另一支色（furnitureSoft），单独给一个部件，
  // 既保住原来的深浅两层，也让用户能单独调。
  "trim",
]);

/**
 * 各门型实际存在的部件（按槽位顺序）：没有的部件不出现在面板上。
 *
 * **表要和几何画出来的部件一一对上** —— 出图是固定写法（U 形门框取 frame、门扇填面取 door、
 * 入户门的门、装饰线取 trim…），漏登记一个部件，画面就会按「取不到材质」处理（见
 * doorMaterialPartRoleFor），而不是像以前那样静默画成纯白。这几处就是这样补齐的：
 *   · 实木门 solid：U 形门框 + **门扇填面**（原先只登记了门框，于是门上最大那块可见面
 *     取 door 取不到 —— 「改成胡桃木门还是白的」）；
 *   · 双开门 double：**U 形门框** + 两扇门 + 五金；入户门 entry：**U 形门框** + 门 + 装饰线 + 五金
 *     （两者的门框原先也没登记，画成纯白）。
 * 主题里那三支「按门型」的门框键（solidDoorFrame / entryDoorFrame / doorFrame）正是给这块
 * 几何用的，登记齐了它们才继续有消费者（见 doorPartThemeColor 的 frame 分支）。
 */
export const DOOR_MATERIAL_PART_ROLES_BY_TYPE: Readonly<Record<string, readonly string[]>> =
  Object.freeze({
    solid: ["frame", "door", "metal"],
    "frame-only": ["frame"],
    glass: ["frame", "glass", "metal"],
    "sliding-glass": ["frame", "glass", "metal"],
    double: ["frame", "door", "metal"],
    entry: ["frame", "door", "trim", "metal"],
    "roller-shutter": ["frame", "shutter", "slat"],
  });

/** 某门型用到的部件角色（未知门型按实木门处理，与出图分支的默认一致）。 */
export function doorMaterialPartRolesForType(doorType: string): readonly string[] {
  return DOOR_MATERIAL_PART_ROLES_BY_TYPE[doorType] || DOOR_MATERIAL_PART_ROLES_BY_TYPE.solid;
}

/**
 * 平面图用哪个部件代表这扇门。
 *
 * 平面图符号只能上一块颜色，所以取「最占视线」的那块料：门扇（实木 / 双开 / 入户）、卷帘布
 * （卷帘门）、门框（仅门框 / 玻璃门 / 推拉门）。与 3D 出图取的部件同源，于是「平面图看到的
 * 颜色」和「立体里的颜色」不会各说各话。
 *
 * 玻璃门这里刻意取**门框**而不是玻璃：档位改的是门框 / 五金，玻璃本身各档位都一样，取玻璃
 * 会让「换档位平面图没反应」；门框那圈颜色变了才看得见档位，玻璃那层由平面图原有的那道
 * 细线表示，门的**类型**则由几何（双扇 / 两轨 / 帘片 / 偏移板）继续区分。
 *
 * 每一项都必须是该门型登记过的部件（校验脚本 L6i 会盯住）—— 否则平面图拿不到材质色。
 */
export const DOOR_PLAN_MATERIAL_ROLE_BY_TYPE: Readonly<Record<string, string>> = Object.freeze({
  solid: "door",
  "frame-only": "frame",
  glass: "frame",
  "sliding-glass": "frame",
  double: "door",
  entry: "door",
  "roller-shutter": "shutter",
});

/** 平面图的代表部件（未知门型按实木门处理）。 */
export function doorPlanMaterialRoleFor(doorType: string): string {
  return (
    DOOR_PLAN_MATERIAL_ROLE_BY_TYPE[doorType] ||
    DOOR_PLAN_MATERIAL_ROLE_BY_TYPE.solid ||
    doorMaterialPartRolesForType(doorType)[0]
  );
}

/**
 * 出图请求的部件语义 → 该门型**真实拥有**的部件角色（兜底闸）。
 *
 * 出图代码是「按部件语义」取色的固定写法（U 形门框取 `frame`、门扇填面取 `door`…），门型表
 * 应与之一一对上（见 DOOR_MATERIAL_PART_ROLES_BY_TYPE）。但两条线一旦对不上，
 * `partMaterials[role]` 就是 undefined，而 `new Color(undefined)` 取的是 three.js 的初始值 ——
 * **纯白**：实木门的门扇填面（门上最大那块可见面）取 `door` 取不到就是「改成胡桃木门还是白的」。
 *
 * 所以这里不让「取不到」落到 undefined 上：退到该门型的**主料角色**（表里第一项：实木门 /
 * 玻璃门 / 卷帘门是门框，双开 / 入户门是门扇），与材质面板上能调的槽位一一对应 —— 面板改
 * 「门框」，画面整扇门跟着走。校验脚本 L6i 会同时盯住「表登记齐了」和「取色经过了这里」。
 */
export function doorMaterialPartRoleFor(doorType: string, requestedRole: string): string {
  const partRoles = doorMaterialPartRolesForType(doorType);
  return partRoles.includes(requestedRole) ? requestedRole : (partRoles[0] ?? requestedRole);
}

/** 角色 → 槽位号（`door-material-<n>` 的 n；认不出时给 -1）。 */
export function doorMaterialPartIndex(role: string): number {
  return DOOR_MATERIAL_PARTS.indexOf(role);
}

/** 槽位超出登记长度时的兜底角色（按模型取，未登记则 `body`）。 */
const MODEL_FALLBACK_ROLE: Readonly<Record<string, string>> = Object.freeze({
  bookcase: "book",
  glasscabinet: "shelf",
  wallcabinet: "shelf",
  shoecabinet: "shelf",
  sideboard: "interior",
  shelf: "shelf",
  desk: "drawer",
  kitchenbase: "base",
  kitchensink: "metal",
  kitchencooktop: "metal",
  tv_mobile: "trim",
});

/** materialIndex（GLB 顺序）→ 角色：用于材质名无槽位号、也无可解析角色的模型。 */
export const MODEL_MATERIAL_ORDER_ROLES: Readonly<
  Record<string, readonly (string | null)[]>
> = Object.freeze({
  pipelinewaterpurifier: ["panel", "body", "trim", "recess"],
  tea_bar_machine: ["body", "panel", "trim", "recess", "handle", "base", "metal"],
  elevator: ["panel", "body", "trim", "panel", "panel", "body"],
  "air-outlet": ["body"],
  airoutlet: ["body"],
});

/** 具体材质名（小写）→ 角色：legacy 命名模型逐个点名。 */
export const MODEL_ROLE_BY_MATERIAL_NAME: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze({
  plant: {
    "ha-plant-soft": "pot",
    "ha-plant-dark": "soil",
    "ha-plant-foliage": "foliage",
    "ha-plant-foliagesoft": "foliageSoft",
  },
  rug: {
    "ha-rug-furniture": "frame",
    "ha-rug-soft": "fabric",
  },
  steelstairs: {
    "004": "tread",
    "0005": "frame",
  },
  glassstairs: {
    sacfdsa001_1: "glass",
    sacfdsa001_2: "glass",
    sacfdsa010: "trim",
    sacfdsa004: "body",
    "b-1": "tread",
  },
  floatingstairs: {
    "b-1": "tread",
    sacfdsa004: "body",
    sacfdsa010: "trim",
    sacfdsa001_1: "glass",
    sacfdsa001_2: "glass",
  },
  floorlamp: {
    "frosted-white": "lit",
    metal_corrogated_shiny: "metal",
    white_ppc1: "body",
    "[<0011_seashell>]": "trim",
    "*5": "lit",
    "[color_008]1": "base",
  },
  piano: {
    金色金属材料: "accent",
    "*2": "body",
    "[color_009]1": "dark",
    "[blinds_weave]": "panel",
    "*1": "trim",
  },
  "pipeline-water-purifier": {
    "material #1": "body",
    "material #0": "panel",
    "material #2": "trim",
    "om.cn_1347": "recess",
  },
  // 同一模型的运行时 itemType（无连字符）与 GLB 材质名逐一点名。
  pipelinewaterpurifier: {
    "material #1": "body",
    "material #0": "panel",
    "material #2": "trim",
    "om.cn_1347": "recess",
  },
  tea_bar_machine: {
    "om.cn_1336": "body",
    "om.cn_1342": "panel",
    "om.cn_1344": "trim",
    "om.cn_1348": "recess",
    "om.cn_80": "handle",
    "om.cn_1341": "base",
    "11121sss0015": "metal",
  },
  airoutlet: { m03_pewter_shine: "body" },
  "air-outlet": { m03_pewter_shine: "body" },
  smallcar: { car_tms: "body" },
  suv: {
    body: "body",
    base: "base",
    gray: "trim",
    salon: "seat",
    glass: "glass",
    glass_01: "glass",
    glass_02: "glass",
    glass_back: "glass",
    headlight: "emissive",
    headlight_01: "emissive",
    headlight_02: "emissive",
  },
  scooter: {
    gogoro_color: "body",
    "scooter-seat": "seat",
    black: "dark",
    black_metal: "dark",
    metal: "metal",
    gray: "trim",
    yellow_light: "emissive",
    green_light: "emissive",
    white_light: "emissive",
    red_light: "emissive",
  },
});

/* -------------------------------------------------------------------------- */
/* 单模型角色配方覆盖                                                          */
/* -------------------------------------------------------------------------- */

const MODEL_ROLE_RECIPE_OVERRIDES: Record<string, RoleRecipeTable> = {
  airoutlet: { body: { color: 0x9aa5b7, surface: "paint" } },
  /**
   * 以下五件「木顶柜」的 `top`（电视柜是 `surface`）是**木板**，几何上都是 0.02~0.06m 的薄板：
   *  - shelf #0      1.2×0.04×0.406 顶板（下面才是层层搁板）
   *  - nightstand #1 0.52×0.039×0.441 顶板
   *  - tvstand #3    1.8×0.026×0.42 顶板
   *  - shoecabinet #2 0.918×0.055×0.437 顶板
   *  - sideboard #0  1.6×0.045×0.45 顶板
   *
   * joinery 家族给 `top` 的默认是「石材台面 + 大理石整图」（那是厨房橱柜的台面语义），
   * 照搬到这五件上会得到「书架 / 床头柜 / 电视柜顶着一块大理石」——自动档就已经贴了整图。
   * 这里把它们改回木质顶板；真正的石作柜（kitchenbase / kitchensink / kitchencooktop /
   * kitchenisland / bar / cabinet）仍保留家族的石材台面。
   */
  shelf: { top: { color: "furniture", surface: "wood" } },
  nightstand: { top: { color: "furniture", surface: "wood" } },
  shoecabinet: { top: { color: "furniture", surface: "wood" } },
  sideboard: { top: { color: "furniture", surface: "wood" } },
  tvstand: { surface: { color: "furniture", surface: "wood" } },
  // 方茶几属 woodwork 家族，`surface` 是 1.4×0.044×0.7 的木质台面；家族默认的石材台面
  // （countertop + marble）是给石作茶几 coffeetable 的，不该落到这里。
  squarecoffeetable: { surface: { color: "wood", surface: "wood" } },
  // 台球桌 `surface` 是 0.057m 的木质台面边轨（台呢在 `fabric`），同样不该贴大理石。
  "pool-table": { surface: { color: "wood", surface: "wood" } },
  elevator: {
    panel: { color: "wall", surface: "paint", roughness: 0.82, metalness: 0.01 },
    body: { color: "furniture", surface: "paint" },
    trim: { color: "furnitureSoft", surface: "paint" },
  },
  piano: {
    accent: { color: 12296558, surface: "metal", roughness: 0.4, metalness: 0.5 },
    dark: { color: 3423034, surface: "lacquer", roughness: 0.55 },
    panel: { color: 3423034, surface: "lacquer", roughness: 0.55 },
    body: { color: 9991250, surface: "lacquer", roughness: 0.55 },
    trim: { color: 16315885, surface: "lacquer", roughness: 0.55 },
  },
  wallac: {
    body: { color: "applianceSoft", surface: "metal" },
    grating: { color: "applianceSoft", surface: "metal" },
    lit: {
      color: "furnitureSoft",
      surface: "lacquer",
      emissive: "furnitureSoft",
      emissiveIntensity: 0.4,
    },
  },
  floorlamp: {
    base: { color: "applianceDark", surface: "metal" },
    metal: { color: 0x3f4247, surface: "metal" },
    trim: { color: "floorLampBody", surface: "wood" },
    lit: { color: "furnitureSoft", surface: "lacquer" },
    body: { color: "floorLampBody", surface: "wood" },
  },
  smallcar: { body: { color: "furniture", surface: "lacquer" } },
  // 桌子（desk）：木器族里唯一**台面是木/烤漆、不是石作**的平顶桌 —— 家族表给 `top` 的
  // 默认是大理石板（那是方茶几 / 转盘餐桌的台面），照搬到书桌上会得到一张「大理石面书桌」。
  // 桌架取 `woodDark`：与 bar / 方茶几 同一种「台面浅、结构深一档」的家族观感。
  // （档位一旦选中就按档位配方走，这两条只管「跟随全局风格」。）
  desk: {
    top: { color: "wood", surface: "wood" },
    frame: { color: "woodDark", surface: "wood" },
  },
  // 净水器 / 茶吧机：家电色系（面板浅色 + 深色凹槽 + 金属五金）。
  pipelinewaterpurifier: {
    body: { color: "applianceSoft", surface: "lacquer" },
    panel: { color: "appliance", surface: "metal" },
    trim: { color: "applianceSoft", surface: "lacquer" },
    recess: { color: "applianceDark", surface: "lacquer", multiply: 0.45 },
  },
  tea_bar_machine: {
    body: { color: "applianceSoft", surface: "lacquer" },
    panel: { color: "applianceDark", surface: "lacquer" },
    trim: { color: "appliance", surface: "metal" },
    recess: { color: "applianceDark", surface: "lacquer", multiply: 0.45 },
    handle: { color: 0x9aa0a6, surface: "metal" },
    base: { color: "applianceDark", surface: "metal" },
    metal: { color: 0xb7bec5, surface: "metal" },
  },
  plant: {
    pot: { color: "decorAccent", surface: "ceramic" },
    soil: { color: "furnitureDark", surface: "stone" },
    // 默认主题保持 GLB 本身的绿；暖木主题沿用既有暖叶色（foliage→leafColor，foliageSoft→旧暖绿）。
    foliage: { color: 6257261, warmColor: "leafColor", surface: "foliage" },
    foliageSoft: { color: 7835779, warmColor: 9877369, surface: "foliage" },
  },
  // NAS：第 4 槽是指示灯，保留 legacy 的蓝色自发光；面板沿用设备族。
  nas: {
    lit: {
      color: 8702858,
      surface: "lacquer",
      emissive: 0x67b8f3,
      emissiveIntensity: 0.5,
    },
  },
  // 淋浴间在暖木主题下统一走 showerMetal。
  shower: {
    body: { color: "showerMetal", surface: "metal" },
    interior: { color: "showerMetal", surface: "metal" },
    metal: { color: "showerMetal", surface: "metal" },
  },
  // 地毯的 -soft 面需要 polygonOffset，避免与地板 z-fighting。
  rug: {
    fabric: { color: "furnitureLight", surface: "fabric", polygonOffset: true },
  },
  // 电视三件套整体偏深色（沿用既有 tv_* 观感）。
  tv_standard: { body: { color: "applianceDark", surface: "lacquer" } },
  tv_tabletop: {
    base: { color: "applianceDark", surface: "lacquer" },
    body: { color: "applianceDark", surface: "lacquer" },
    trim: { color: "appliance", surface: "metal" },
    metal: { color: 0x8e939a, surface: "metal" },
  },
  tv_mobile: {
    leg: { color: "applianceDark", surface: "lacquer" },
    base: { color: "applianceDark", surface: "lacquer" },
    body: { color: "applianceDark", surface: "lacquer" },
    trim: { color: "appliance", surface: "metal" },
    metal: { color: 0x8e939a, surface: "metal" },
    screen: { color: 0x0a0c0f, surface: "lacquer" },
  },
};

export const MODEL_ROLE_RECIPES: Readonly<Record<string, RoleRecipeTable>> =
  Object.freeze(MODEL_ROLE_RECIPE_OVERRIDES);

/* -------------------------------------------------------------------------- */
/* 解析                                                                        */
/* -------------------------------------------------------------------------- */

const MATERIAL_ROLE_PATTERNS: readonly RegExp[] = [
  /^material-\d+-([a-z][a-z0-9]*)$/,
  /-(?:furniture|detail|aquatic|tea|garden)-([a-z][a-z0-9]*)$/,
  /^ha-[a-z0-9]+-([a-z][a-z0-9]*)$/,
];

interface RoleResolution {
  role: string;
  slot?: number;
  /** 角色来源，便于排查。 */
  source: "name" | "role-table" | "order" | "default";
}

/** 兼容全部命名体系，解析出材质角色（永不返回空，保证 100% 覆盖）。 */
export function resolveModelMaterialRole(
  itemType: string,
  materialName: string | undefined,
  materialIndex = 0,
): RoleResolution {
  const lowerName = (materialName || "").toLowerCase();

  // 1) 显式点名（legacy）
  const explicitRole = MODEL_ROLE_BY_MATERIAL_NAME[itemType]?.[lowerName];
  if (explicitRole) return { role: explicitRole, source: "name" };

  // 2) 名称里的角色后缀
  for (const pattern of MATERIAL_ROLE_PATTERNS) {
    const roleMatch = lowerName.match(pattern);
    if (roleMatch?.[1]) {
      const slotMatch = lowerName.match(/material-(\d+)/);
      return {
        role: roleMatch[1],
        slot: slotMatch ? Number(slotMatch[1]) : undefined,
        source: "name",
      };
    }
  }

  // 2b) decor：<type>-decor-<n> 用 DECOR_MODELS 的 roles 映射
  const decorIndexMatch = lowerName.match(/-decor-(\d+)$/);
  if (decorIndexMatch) {
    const decorRole = DECOR_MODELS[itemType]?.roles[Number(decorIndexMatch[1])];
    if (decorRole) return { role: decorRole, source: "name" };
  }

  // 3) 槽位表（`<type>-material-N`）
  const slotMatch = lowerName.match(/material-(\d+)/);
  const slot = slotMatch ? Number(slotMatch[1]) : undefined;
  const slotRoles = MODEL_SLOT_ROLES[itemType];
  if (slotRoles && slot !== undefined) {
    const slotRole = slotRoles[slot];
    if (slotRole) return { role: slotRole, slot, source: "role-table" };
    const fallbackRole = MODEL_FALLBACK_ROLE[itemType];
    if (fallbackRole) return { role: fallbackRole, slot, source: "role-table" };
  }

  // 4) GLB 顺序表
  const orderRoles = MODEL_MATERIAL_ORDER_ROLES[itemType];
  const orderRole = orderRoles?.[materialIndex];
  if (orderRole) return { role: orderRole, source: "order" };

  // 5) 家族默认
  const family = resolveModelFamily(itemType);
  const familyDefaultRole = {
    joinery: "body",
    woodwork: "body",
    upholstery: "fabric",
    rug: "fabric",
    ceramic: "body",
    appliance: "body",
    device: "body",
    curtain: "fabric",
    plant: "foliage",
    pillar: "body",
    stair: "body",
    vehicle: "body",
    lamp: "base",
    aquatic: "frame",
    tea: "frame",
    garden: "base",
    decor: "base",
    misc: "body",
  }[family];
  return {
    role: MODEL_FALLBACK_ROLE[itemType] ?? familyDefaultRole ?? "body",
    slot,
    source: "default",
  };
}

/** 取配方：角色 → 具体颜色（用 itemPalette 解析调色板键）。 */
export function materialRoleRecipeFor(
  itemType: string,
  materialName: string | undefined,
  palette: PaletteLike,
  materialIndex = 0,
): ResolvedRoleRecipe | null {
  const { role, slot } = resolveModelMaterialRole(itemType, materialName, materialIndex);
  return materialRoleRecipeForRole(itemType, role, palette, slot);
}

/**
 * 按**角色**直接取角色表配方（不需要材质名）。
 *
 * 与 `materialRoleRecipeFor` 同一条查找链（逐模型表 → 家族表 → 通用表 + 暖木色变体），
 * 供只有角色、拿不到材质名的调用方使用 —— 目前是「材质风格」色卡的取色：色卡要显示
 * 档位没覆盖到的槽位会是什么颜色，那就必须和加载器走同一条回落链。
 */
export function materialRoleRecipeForRole(
  itemType: string,
  role: string | null | undefined,
  palette: PaletteLike,
  slot = 0,
): ResolvedRoleRecipe | null {
  if (!role) return null;
  const family = resolveModelFamily(itemType);
  const warm = palette?.warmWood === true;

  // 园林 / 摆件的颜色由各自的主题表决定，不在静态配方里。
  if (family === "garden") {
    const gardenPalette = courtyardPalette(itemType, warm ? "warm" : "default") as Record<
      string,
      number
    >;
    const gardenColor = gardenPalette[role] ?? gardenPalette.base;
    if (typeof gardenColor != "number") return null;
    return {
      role,
      slot,
      color: role,
      colorValue: gardenColor,
      surface: role === "leaf" ? "foliage" : "paint",
      roughness: role === "water" ? 0.3 : 0.82,
      metalness: 0,
      transparent: role === "water",
      opacity: role === "water" ? 0.42 : 1,
      depthWrite: role !== "water",
    };
  }
  if (family === "decor") {
    const decorTheme = DECOR_THEMES[warm ? "warm" : "default"] as unknown as Record<string, number>;
    const decorColor = decorTheme[role] ?? decorTheme.base;
    if (typeof decorColor != "number") return null;
    return {
      role,
      slot,
      color: role,
      colorValue: decorColor,
      surface: role === "leaf" ? "foliage" : "paint",
      roughness: 0.82,
      metalness: 0,
    };
  }

  const recipe = MODEL_ROLE_RECIPES[itemType]?.[role] ?? ROLE_RECIPES_BY_FAMILY[family]?.[role] ?? COMMON_ROLE_RECIPES[role];
  if (!recipe) return null;

  const surfaceFinish = recipe.surface ? SURFACE_FINISH[recipe.surface] : undefined;
  const colorSpec = warm
    ? (recipe.warmColor ?? recipe.color)
    : (recipe.defaultColor ?? recipe.color);
  return {
    ...recipe,
    role,
    slot,
    colorValue: scaleMaterialColorChannels(
      resolveMaterialPaletteColor(palette, colorSpec),
      recipe.multiply ?? 1,
    ),
    emissiveValue:
      recipe.emissive !== undefined
        ? resolveMaterialPaletteColor(palette, recipe.emissive)
        : undefined,
    roughness: recipe.roughness ?? surfaceFinish?.roughness,
    metalness: recipe.metalness ?? surfaceFinish?.metalness,
  };
}

/**
 * 取出某槽位**声明了的石材板色号**；不是石材板返回 null。
 *
 * 只认角色配方里的 `slab`，不猜槽位号：装载期补平面 UV 与材质替换期换贴图必须走同一判据，
 * 否则会出现「贴了石材整图但 UV 是立方体六面各一遍」的糊版。
 * 色号与颜色无关，故 palette 传 null 也能取（配方里的 slab 是固定声明）。
 */
export function stoneSlabFlavorForMaterial(
  itemType: string,
  materialName: string | undefined,
  materialIndex = 0,
): StoneSlabFlavor | null {
  const roleRecipe = materialRoleRecipeFor(itemType, materialName, null, materialIndex);
  return isStoneSlabFlavor(roleRecipe?.slab) ? roleRecipe.slab : null;
}

/**
 * 材质名是否已经自带**显式角色**（`material-<n>-<role>` / `<type>-furniture|detail|aquatic|tea|garden|decor-<role>`）。
 * 这类模型已有确定性角色命名，接入方无需用本表覆盖；只有 `<type>-material-N` 这类
 * 「槽位号无角色」的模型才需要靠本表定位，从而绕开亮度 / 槽位号启发式。
 */
export function usesNamedMaterialRole(materialName: string | undefined): boolean {
  const name = (materialName || "").toLowerCase();
  return (
    /material-\d+-[a-z]/.test(name) ||
    /-(?:furniture|detail|aquatic|tea|garden|decor)-[a-z0-9]/.test(name)
  );
}

