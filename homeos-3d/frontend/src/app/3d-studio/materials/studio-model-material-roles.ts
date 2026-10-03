/** 外部模型「材质槽位 / 角色 → 材质配方」集中表（对齐参考实现）。
 *
 * 背景：参考实现的材质统一命名为 `material-<槽位>-<角色>`，角色由代码消费
 * （见参考实现的 studio-material-styles.ts / studio-external-models.ts）。新项目的 GLB 命名
 * 分五套体系：
 *   - `<type>-material-N`（无角色，需靠 slot 表定位）
 *   - `material-N-role`
 *   - `<type>-furniture-role` / `<type>-detail-role`
 *   - `<type>-aquatic-role` / `<type>-garden-role` / `<type>-decor-N` / `<type>-tea-role`
 *   - legacy 名（`004`、`car_tms`、`金色金属材料` …）
 * 本模块把这些体系统一解析成角色，再按「家族 → 角色 → 配方」给出颜色与表面参数，让调色板按
 * 角色着色，而不是靠亮度 / 槽位号猜。
 *
 * 约定：灯光（`floorlamp / walllamp` 等外部灯具与程序化灯）只登记角色数据，是否走本表由接入方决定。
 */
import { courtyardPalette } from "../plan/courtyard-models";
import { DECOR_MODELS, DECOR_THEMES } from "../studio/decor-models";

/** 表面族：决定默认粗糙度 / 金属度（对齐参考实现的 SURFACE_ROUGHNESS / SURFACE_METALNESS）。 */
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

/** 石材板色号（大理石贴图的两支画法）：整块石材按**一张整图**贴到板面上，颜色由贴图自己带（材质基色只作一层薄染色），所以它不属于「表面族」的粗糙度兜底，而是独立的一层：抛光面 + 自带纹路。 */
export type StoneSlabFlavor = "marble" | "marble-dark";

/** 一条材质配方：颜色取调色板键或固定色号； */
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
  /** 自发光色（调色板键或色号）； */
  emissive?: string | number;
  emissiveIntensity?: number;
  /** 在解析出的颜色上再乘一个系数（用于 recess / shadow 这类「比本体更暗」的角色）。 */
  multiply?: number;
  /** 石材板色号（参考实现 STONE_SLAB_FLAVOR_BY_MODEL_SLOT 的等价物）：声明了它，这一槽就按「整块石材」出图 —— 贴一张自带纹路的大理石整图。 */
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

/** 表面族 → 默认粗糙度 / 金属度（对齐参考实现）。 */
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

/** 石材板色号 → 抛光面参数（对齐参考实现 STONE_SLAB_FINISH_BY_FLAVOR）。 */
const STONE_SLAB_FINISH: Record<StoneSlabFlavor, { roughness: number; metalness: number }> =
  Object.freeze({
    marble: { roughness: 0.24, metalness: 0.03 },
    "marble-dark": { roughness: 0.18, metalness: 0.04 },
  });

/** 石材板色号 → 抛光面参数； */
export function stoneSlabSurfaceFinish(
  flavor: StoneSlabFlavor | undefined,
): { roughness: number; metalness: number } | null {
  return flavor ? (STONE_SLAB_FINISH[flavor] ?? null) : null;
}

/** 取值是否是合法的石材板色号。 */
export function isStoneSlabFlavor(value: unknown): value is StoneSlabFlavor {
  return value === "marble" || value === "marble-dark";
}

/** 解析配方里的颜色声明：色号直接用； */
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

/** 把色号按系数压暗 / 提亮（`multiply` 用）。 */
export function scaleMaterialColorChannels(color: number, factor: number): number {
  if (!Number.isFinite(factor) || factor === 1) return color >>> 0;
  const channel = (shift: number) =>
    Math.max(0, Math.min(255, Math.round(((color >>> shift) & 0xff) * factor)));
  return ((channel(16) << 16) | (channel(8) << 8) | channel(0)) >>> 0;
}

/** 角色 → 中文短标签（检查面板 / 报表用； */
const MATERIAL_ROLE_LABELS: Readonly<Record<string, string>> = Object.freeze({
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


  shutter: "卷帘",
  slat: "帘片",
});

/** 取角色的中文标签； */
export function materialRoleLabel(role: string | undefined): string {
  return (role && MATERIAL_ROLE_LABELS[role]) || role || "未识别";
}


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
  /** 门（户型里的洞口构件）：几何是程序化拼出来的，没有 GLB 材质槽，角色由`MODEL_SLOT_ROLES.door` 登记（门框 / 门扇 / 玻璃 / 五金 / 卷帘 / 帘片）。 */
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

/** itemType → 家族； */
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


export const MODEL_SLOT_ROLES: Readonly<Record<string, readonly (string | null)[]>> = Object.freeze({


  bar: ["top", "body", "base", "trim", "leg", "metal"],


  basin: ["frame", "top", "sink", "trim", "mirror", "metal", "base"],
  bathtub: ["body", "interior", "trim", "metal", "metal"],


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


  cabinet: ["door", "door", "metal"],
  curtain_left: ["metal", "fabric", "fabric", "metal", "fabric", "fabric"],
  curtain_right: ["metal", "fabric", "fabric", "metal", "fabric", "fabric"],
  curtain_split: ["metal", "fabric", "fabric", "metal", "fabric", "fabric"],


  desk: ["metal", "top", "frame"],
  dishwasher: ["body", "door", "panel", "handle", "base", "screen"],


  dryer: ["body", "panel", "door", "glass", "metal", "handle"],
  washer: ["body", "panel", "door", "glass", "metal", "handle", "drawer"],


  door: ["frame", "door", "glass", "metal", "shutter", "slat", "trim"],
  fridge: ["body", "panel", "handle"],


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


  kitchenbase: ["base", "body", "top", "door", "metal"],
  kitchencooktop: ["base", "body", "top", "cooktop", "door", "metal", "metal", "metal"],
  kitchensink: ["base", "body", "top", "sink", "sink", "metal", "sink", "door", "metal"],
  microwave: ["body", "door", "glass", "panel", "indicator", "metal"],


  nas: ["panel", "base", "recess", "body", "lit"],
  nightstand: ["body", "top", "metal", "drawer", "base"],
  rangehood: ["body", "panel", "grating", "lit"],
  ricecooker: ["body", "top", "base", "trim", "indicator", "screen"],
  shelf: ["top", "metal", "shelf"],
  shoecabinet: ["interior", "base", "top", "body", "door"],
  shower: ["body", "interior", "metal"],


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


  floorlamp: ["base", "body", "lit", "metal", "trim"],


  walllamp: ["body", "base", "lit", "metal"],
});


/** 门的部件顺序：`door-material-<n>` 的 n 就是这里的下标，也是 `MODEL_SLOT_ROLES.door` 的槽位号。 */
export const DOOR_MATERIAL_PARTS: readonly string[] = Object.freeze([
  "frame",
  "door",
  "glass",
  "metal",
  "shutter",
  "slat",


  "trim",
]);

/** 各门型实际存在的部件（按槽位顺序）：没有的部件不出现在面板上。 */
const DOOR_MATERIAL_PART_ROLES_BY_TYPE: Readonly<Record<string, readonly string[]>> =
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

/** 平面图用哪个部件代表这扇门。 */
const DOOR_PLAN_MATERIAL_ROLE_BY_TYPE: Readonly<Record<string, string>> = Object.freeze({
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

/** 出图请求的部件语义 → 该门型**真实拥有**的部件角色（兜底闸）。 */
export function doorMaterialPartRoleFor(doorType: string, requestedRole: string): string {
  const partRoles = doorMaterialPartRolesForType(doorType);
  return partRoles.includes(requestedRole) ? requestedRole : (partRoles[0] ?? requestedRole);
}

/** 角色 → 槽位号（`door-material-<n>` 的 n； */
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
const MODEL_MATERIAL_ORDER_ROLES: Readonly<
  Record<string, readonly (string | null)[]>
> = Object.freeze({
  pipelinewaterpurifier: ["panel", "body", "trim", "recess"],
  tea_bar_machine: ["body", "panel", "trim", "recess", "handle", "base", "metal"],
  elevator: ["panel", "body", "trim", "panel", "panel", "body"],
  "air-outlet": ["body"],
  airoutlet: ["body"],
});

/** 具体材质名（小写）→ 角色：legacy 命名模型逐个点名。 */
const MODEL_ROLE_BY_MATERIAL_NAME: Readonly<
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


const MODEL_ROLE_RECIPE_OVERRIDES: Record<string, RoleRecipeTable> = {
  airoutlet: { body: { color: 0x9aa5b7, surface: "paint" } },
  /** 以下五件「木顶柜」的 `top`（电视柜是 `surface`）是**木板**，几何上都是 0.02~0.06m 的薄板：joinery 家族给 `top` 的默认是「石材台面 + 大理石整图」（那是厨房橱柜的台面语义），照搬到这五件上会得到「书架 / 床头柜 / 电视柜顶着一块大理石」——自动档就已经贴了整图。 */
  shelf: { top: { color: "furniture", surface: "wood" } },
  nightstand: { top: { color: "furniture", surface: "wood" } },
  shoecabinet: { top: { color: "furniture", surface: "wood" } },
  sideboard: { top: { color: "furniture", surface: "wood" } },
  tvstand: { surface: { color: "furniture", surface: "wood" } },


  squarecoffeetable: { surface: { color: "wood", surface: "wood" } },

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


  desk: {
    top: { color: "wood", surface: "wood" },
    frame: { color: "woodDark", surface: "wood" },
  },

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

    foliage: { color: 6257261, warmColor: "leafColor", surface: "foliage" },
    foliageSoft: { color: 7835779, warmColor: 9877369, surface: "foliage" },
  },

  nas: {
    lit: {
      color: 8702858,
      surface: "lacquer",
      emissive: 0x67b8f3,
      emissiveIntensity: 0.5,
    },
  },

  shower: {
    body: { color: "showerMetal", surface: "metal" },
    interior: { color: "showerMetal", surface: "metal" },
    metal: { color: "showerMetal", surface: "metal" },
  },

  rug: {
    fabric: { color: "furnitureLight", surface: "fabric", polygonOffset: true },
  },

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

const MODEL_ROLE_RECIPES: Readonly<Record<string, RoleRecipeTable>> =
  Object.freeze(MODEL_ROLE_RECIPE_OVERRIDES);


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


  const explicitRole = MODEL_ROLE_BY_MATERIAL_NAME[itemType]?.[lowerName];
  if (explicitRole) return { role: explicitRole, source: "name" };


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


  const decorIndexMatch = lowerName.match(/-decor-(\d+)$/);
  if (decorIndexMatch) {
    const decorRole = DECOR_MODELS[itemType]?.roles[Number(decorIndexMatch[1])];
    if (decorRole) return { role: decorRole, source: "name" };
  }


  const slotMatch = lowerName.match(/material-(\d+)/);
  const slot = slotMatch ? Number(slotMatch[1]) : undefined;
  const slotRoles = MODEL_SLOT_ROLES[itemType];
  if (slotRoles && slot !== undefined) {
    const slotRole = slotRoles[slot];
    if (slotRole) return { role: slotRole, slot, source: "role-table" };
    const fallbackRole = MODEL_FALLBACK_ROLE[itemType];
    if (fallbackRole) return { role: fallbackRole, slot, source: "role-table" };
  }


  const orderRoles = MODEL_MATERIAL_ORDER_ROLES[itemType];
  const orderRole = orderRoles?.[materialIndex];
  if (orderRole) return { role: orderRole, source: "order" };


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

/** 按**角色**直接取角色表配方（不需要材质名）。 */
export function materialRoleRecipeForRole(
  itemType: string,
  role: string | null | undefined,
  palette: PaletteLike,
  slot = 0,
): ResolvedRoleRecipe | null {
  if (!role) return null;
  const family = resolveModelFamily(itemType);
  const warm = palette?.warmWood === true;


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

/** 取出某槽位**声明了的石材板色号**； */
export function stoneSlabFlavorForMaterial(
  itemType: string,
  materialName: string | undefined,
  materialIndex = 0,
): StoneSlabFlavor | null {
  const roleRecipe = materialRoleRecipeFor(itemType, materialName, null, materialIndex);
  return isStoneSlabFlavor(roleRecipe?.slab) ? roleRecipe.slab : null;
}

/** 材质名是否已经自带**显式角色**（`material-<n>-<role>` / `<type>-furniture|detail|aquatic|tea|garden|decor-<role>`）。 */
export function usesNamedMaterialRole(materialName: string | undefined): boolean {
  const name = (materialName || "").toLowerCase();
  return (
    /material-\d+-[a-z]/.test(name) ||
    /-(?:furniture|detail|aquatic|tea|garden|decor)-[a-z0-9]/.test(name)
  );
}

