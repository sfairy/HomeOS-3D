/**
 * **语义角色 → 写实外观** 配色层。
 *
 * 背景：0.7.6 批量导出把外部模型材质名改成 `<模型>-candidate-<token>`（token 只剩
 * `body/dark/light/soft/accent/glass` 这层「候选明度」），真实构件语义在命名里就丢了。
 * `model-slot-roles.ts` 负责把「模型 × 槽位」还原成**语义角色**（叶 / 花盆 / 土壤 / 座圈 / 缸体…），
 * 本模块负责回答「这个语义角色**现实中长什么样**」：
 *
 * ```
 * 语义角色（foliage / pot / soil / ceramic / seat / shell …）
 *   → { 中文名, 表面族, 写实默认色, 主题覆盖键 }
 *   → 出图色 = palette[覆盖键] ?? 写实默认色     // 缺主题键时**绝不再塌成家具灰**
 * ```
 *
 * 与 `studio-model-material-roles.ts` 的关系：那一份是「通用角色配方表」（含大量
 * 模型专用配方），本模块是**兜底的写实语义层** —— 语义角色只要落在这里，就一定拿得到
 * 「像那么回事」的颜色与表面参数，不再出现「选鲜绿却全是棕」「所有槽位同一个灰」。
 *
 * 覆盖键的取值优先级（见 `studio-model-material-roles.ts` 的 `materialRoleRecipeForRole`）：
 * 模型专用配方 > 家族配方 > 通用角色配方 > **本语义层写实默认**。
 */
import type { MaterialSurface } from "./studio-model-material-roles";

/** 语义大类（面板分组 / 审计归类用）。 */
export type SemanticCategory =
  | "plant"
  | "sanitary"
  | "appliance"
  | "kitchen"
  | "woodwork"
  | "furniture"
  | "fabric"
  | "decor"
  | "device"
  | "lighting"
  | "sport"
  | "kids"
  | "pet"
  | "tableware"
  | "structure"
  | "generic";

/** 一个语义角色的写实外观。 */
export interface SemanticRoleAppearance {
  /** 中文名（「材质属性」面板显示）。 */
  label: string;
  /** 语义大类。 */
  category: SemanticCategory;
  /** 表面族：决定默认粗糙度 / 金属度。 */
  surface: MaterialSurface;
  /**
   * **写实默认色**（任何主题都存在的兜底，绝不塌成家具灰）。
   * 例：叶片常绿、白瓷、深棕土壤、原木。
   */
  defaultColor: number;
  /** 主题覆盖键：主题 / 档位有该键时优先跟随主题调色（如 `leafColor`、`decorAccent`）。 */
  paletteKey?: string;
  /** 主题无覆盖键时的次选键（按序尝试，最后才回落 `defaultColor`）。 */
  fallbackPaletteKeys?: readonly string[];
  /** 覆盖渲染参数（不填则按 `surface` 取默认）。 */
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  /** 自发光（灯具透光罩 / 指示灯）。 */
  emissive?: number;
  emissiveIntensity?: number;
}

/**
 * 语义角色 → 写实外观。
 *
 * 取色规则（`resolveSemanticRoleColor`）：主题覆盖键 → 次选键 → `defaultColor`。
 * 表面参数（`resolveSemanticRoleFinish`）：显式 roughness/metalness → `surface` 默认。
 */
export const SEMANTIC_ROLE_APPEARANCE: Readonly<Record<string, SemanticRoleAppearance>> =
  Object.freeze({
    /* ── 绿植 / 花艺 ─────────────────────────────────────────────── */
    foliage: {
      label: "叶片",
      category: "plant",
      surface: "foliage",
      defaultColor: 0x4f7a3d,
      paletteKey: "leafColor",
    },
    foliageSoft: {
      label: "浅色叶片",
      category: "plant",
      surface: "foliage",
      defaultColor: 0x6b9450,
      paletteKey: "leafColorLight",
      fallbackPaletteKeys: ["leafColor"],
    },
    foliageLight: {
      label: "亮色叶片",
      category: "plant",
      surface: "foliage",
      defaultColor: 0x7ba85c,
      paletteKey: "leafColorLight",
      fallbackPaletteKeys: ["leafColor"],
    },
    stem: { label: "枝干", category: "plant", surface: "wood", defaultColor: 0x6b5a42 },
    branch: { label: "枝条", category: "plant", surface: "wood", defaultColor: 0x7a6a52 },
    trunk: { label: "树干", category: "plant", surface: "wood", defaultColor: 0x6b5335 },
    pot: {
      label: "花盆",
      category: "plant",
      surface: "ceramic",
      defaultColor: 0xb0663f,
      paletteKey: "decorAccent",
    },
    planter: {
      label: "花箱",
      category: "plant",
      surface: "ceramic",
      defaultColor: 0x9c8b76,
      paletteKey: "decorAccent",
    },
    soil: { label: "土壤", category: "plant", surface: "stone", defaultColor: 0x3b3128 },
    saucer: { label: "托盘", category: "plant", surface: "ceramic", defaultColor: 0xd8cbb8 },
    flower: {
      label: "花朵",
      category: "plant",
      surface: "paint",
      defaultColor: 0xd46a8b,
      paletteKey: "decorAccent",
    },
    flowerCenter: {
      label: "花蕊",
      category: "plant",
      surface: "paint",
      defaultColor: 0xe4bd5a,
      paletteKey: "decorAccent",
    },
    grassTuft: { label: "草簇", category: "plant", surface: "foliage", defaultColor: 0x6f8a45 },

    /* ── 卫浴 / 洁具 ─────────────────────────────────────────────── */
    ceramic: { label: "陶瓷体", category: "sanitary", surface: "ceramic", defaultColor: 0xf6f5f1 },
    bowl: { label: "盆体", category: "sanitary", surface: "ceramic", defaultColor: 0xf6f5f1 },
    seat: { label: "座圈", category: "sanitary", surface: "lacquer", defaultColor: 0xf2f1ed },
    lid: { label: "盖板", category: "sanitary", surface: "lacquer", defaultColor: 0xf4f3ef },
    rim: { label: "圈边", category: "sanitary", surface: "ceramic", defaultColor: 0xfafaf7 },
    interior: { label: "内腔", category: "sanitary", surface: "ceramic", defaultColor: 0xeff0ec },
    mirror: {
      label: "镜面",
      category: "sanitary",
      surface: "glass",
      defaultColor: 0xd7dee3,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    },
    faucet: {
      label: "龙头",
      category: "sanitary",
      surface: "metal",
      defaultColor: 0xcfd4d8,
      paletteKey: "showerMetal",
      fallbackPaletteKeys: ["metal"],
    },
    showerTray: { label: "淋浴底盘", category: "sanitary", surface: "ceramic", defaultColor: 0xf1f0ec },
    soapTray: { label: "置物盘", category: "sanitary", surface: "ceramic", defaultColor: 0xe6e3dc },
    tank: { label: "水箱", category: "sanitary", surface: "ceramic", defaultColor: 0xf4f3ef },

    /* ── 家电整机 ────────────────────────────────────────────────── */
    shell: {
      label: "机身",
      category: "appliance",
      surface: "metal",
      defaultColor: 0xd9dbde,
      paletteKey: "appliance",
      fallbackPaletteKeys: ["metal"],
    },
    door: {
      label: "门体",
      category: "appliance",
      surface: "lacquer",
      defaultColor: 0xe9eaec,
      paletteKey: "applianceSoft",
      fallbackPaletteKeys: ["appliance"],
    },
    panel: {
      label: "控制面板",
      category: "appliance",
      surface: "lacquer",
      defaultColor: 0x3a3f45,
      paletteKey: "applianceDark",
    },
    trim: {
      label: "饰条",
      category: "appliance",
      surface: "metal",
      defaultColor: 0xb6bbbf,
      paletteKey: "applianceSoft",
      fallbackPaletteKeys: ["metal"],
    },
    handle: {
      label: "把手",
      category: "appliance",
      surface: "metal",
      defaultColor: 0xc6cacd,
      paletteKey: "metal",
    },
    window: {
      label: "视窗",
      category: "appliance",
      surface: "glass",
      defaultColor: 0x2b3138,
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
    },
    drum: { label: "内筒", category: "appliance", surface: "metal", defaultColor: 0xc3c7cb },
    top: {
      label: "顶面",
      category: "appliance",
      surface: "lacquer",
      defaultColor: 0xeceef0,
      paletteKey: "applianceSoft",
      fallbackPaletteKeys: ["appliance"],
    },
    base: {
      label: "底座",
      category: "appliance",
      surface: "paint",
      defaultColor: 0x3f444a,
      paletteKey: "applianceDark",
    },
    grille: { label: "格栅", category: "appliance", surface: "metal", defaultColor: 0x55595e },
    control: {
      label: "控制区",
      category: "appliance",
      surface: "lacquer",
      defaultColor: 0x2f343b,
      paletteKey: "applianceDark",
    },
    display: { label: "显示屏", category: "appliance", surface: "lacquer", defaultColor: 0x1e242a },
    indicator: {
      label: "指示灯",
      category: "appliance",
      surface: "paint",
      defaultColor: 0x7fd1e0,
      emissive: 0x7fd1e0,
      emissiveIntensity: 0.6,
    },
    wheel: { label: "滚轮", category: "appliance", surface: "paint", defaultColor: 0x2e3237 },
    steamVent: { label: "排气口", category: "appliance", surface: "metal", defaultColor: 0x8b9096 },

    /* ── 厨电灶具 ────────────────────────────────────────────────── */
    cooktop: { label: "灶面", category: "kitchen", surface: "glass", defaultColor: 0x24282d },
    burner: { label: "炉头", category: "kitchen", surface: "metal", defaultColor: 0x8e939a },
    hobFrame: { label: "灶框", category: "kitchen", surface: "metal", defaultColor: 0x3c4147 },
    potBody: { label: "锅身", category: "kitchen", surface: "metal", defaultColor: 0x9aa0a6 },
    basketWire: { label: "网篮", category: "kitchen", surface: "metal", defaultColor: 0xb0b5ba },

    /* ── 木作 / 家具 ─────────────────────────────────────────────── */
    carcass: {
      label: "柜体",
      category: "woodwork",
      surface: "wood",
      defaultColor: 0xa9855c,
      paletteKey: "cabinetBody",
      fallbackPaletteKeys: ["wood"],
    },
    cabinetDoor: {
      label: "柜门",
      category: "woodwork",
      surface: "wood",
      defaultColor: 0xb08f66,
      paletteKey: "cabinetDoor",
      fallbackPaletteKeys: ["cabinetWood", "wood"],
    },
    countertop: {
      label: "台面",
      category: "woodwork",
      surface: "marble",
      defaultColor: 0xd9d5cd,
      paletteKey: "countertop",
    },
    wood: {
      label: "木面",
      category: "woodwork",
      surface: "wood",
      defaultColor: 0xa9855c,
      paletteKey: "wood",
    },
    frame: {
      label: "框架",
      category: "woodwork",
      surface: "wood",
      defaultColor: 0x8a6a44,
      paletteKey: "wood",
    },
    leg: {
      label: "支腿",
      category: "woodwork",
      surface: "wood",
      defaultColor: 0x6f5436,
      paletteKey: "woodDark",
      fallbackPaletteKeys: ["wood"],
    },
    shelf: {
      label: "层板",
      category: "woodwork",
      surface: "wood",
      defaultColor: 0xa9855c,
      paletteKey: "wood",
    },
    drawer: {
      label: "抽屉",
      category: "woodwork",
      surface: "wood",
      defaultColor: 0x9c7850,
      paletteKey: "wood",
    },
    surface: {
      label: "装饰面",
      category: "furniture",
      surface: "lacquer",
      defaultColor: 0xe4e0d8,
      paletteKey: "furnitureLight",
    },

    /* ── 软装 ────────────────────────────────────────────────────── */
    upholstery: {
      label: "软包",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0xb9b2a6,
      paletteKey: "sofaFabric",
      fallbackPaletteKeys: ["furnitureSoft"],
    },
    cushion: {
      label: "坐垫",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0xc3bcae,
      paletteKey: "sofaFabric",
      fallbackPaletteKeys: ["furnitureSoft"],
    },
    fabric: {
      label: "织物",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0xc7c0b2,
      paletteKey: "sofaFabric",
      fallbackPaletteKeys: ["furnitureSoft"],
    },
    linen: {
      label: "床品",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0xe6e3db,
      paletteKey: "diningLinen",
      fallbackPaletteKeys: ["furnitureLight"],
    },
    mattress: {
      label: "床垫",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0xeeece6,
      paletteKey: "furnitureLight",
    },
    pillow: {
      label: "抱枕",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0xf0eee8,
      paletteKey: "furnitureLight",
    },
    runner: {
      label: "床尾巾",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0x9aa08c,
      paletteKey: "runnerColor",
      fallbackPaletteKeys: ["furnitureSoft"],
    },
    throwBlanket: {
      label: "搭毯",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0xd3c8b4,
      paletteKey: "sofaFabric",
      fallbackPaletteKeys: ["furnitureSoft"],
    },
    rugPile: {
      label: "毯面",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0xcfc6b6,
      paletteKey: "furnitureSoft",
    },
    rugBorder: {
      label: "毯边",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0x9d9384,
      paletteKey: "furnitureDark",
    },

    /* ── 摆件 ────────────────────────────────────────────────────── */
    sculpture: { label: "雕件", category: "decor", surface: "stone", defaultColor: 0xbdb6a8 },
    figurine: { label: "摆件", category: "decor", surface: "ceramic", defaultColor: 0xd8cfc0 },
    vase: {
      label: "器身",
      category: "decor",
      surface: "ceramic",
      defaultColor: 0xc9d3d8,
      paletteKey: "decorAccent",
    },
    plate: { label: "盘面", category: "decor", surface: "ceramic", defaultColor: 0xe7e2d6 },
    candle: { label: "蜡烛", category: "decor", surface: "paint", defaultColor: 0xf3ead6 },
    glow: {
      label: "发光件",
      category: "decor",
      surface: "paint",
      defaultColor: 0xf0d79a,
      emissive: 0xf0d79a,
      emissiveIntensity: 0.5,
    },
    drape: { label: "垂布", category: "decor", surface: "fabric", defaultColor: 0xcfc7b8 },
    plaque: { label: "饰板", category: "decor", surface: "wood", defaultColor: 0x8a6a44 },
    trophyMetal: { label: "奖杯金属", category: "decor", surface: "metal", defaultColor: 0xcdaa63 },
    driedBouquet: { label: "干花束", category: "decor", surface: "foliage", defaultColor: 0xb08a5e },

    /* ── 数码 / 影音 ─────────────────────────────────────────────── */
    screen: {
      label: "屏幕",
      category: "device",
      surface: "glass",
      defaultColor: 0x1c2228,
      transparent: true,
      opacity: 0.55,
      depthWrite: false,
    },
    bezel: { label: "边框", category: "device", surface: "lacquer", defaultColor: 0x2b2f34 },
    stand: { label: "支架", category: "device", surface: "metal", defaultColor: 0xb0b5ba },
    disc: { label: "转盘", category: "device", surface: "lacquer", defaultColor: 0x24282c },
    lens: { label: "镜头", category: "device", surface: "glass", defaultColor: 0x1a2026 },
    platter: { label: "唱盘", category: "device", surface: "lacquer", defaultColor: 0x2a2e33 },
    keycap: { label: "键帽", category: "device", surface: "lacquer", defaultColor: 0x35393f },
    paperSheet: { label: "纸张", category: "device", surface: "paint", defaultColor: 0xf3f1ea },

    /* ── 灯具 ────────────────────────────────────────────────────── */
    lampShade: {
      label: "灯罩",
      category: "lighting",
      surface: "fabric",
      defaultColor: 0xefe6d2,
      transparent: true,
      opacity: 0.92,
      depthWrite: false,
    },
    lampBody: {
      label: "灯体",
      category: "lighting",
      surface: "metal",
      defaultColor: 0x6f747a,
      paletteKey: "floorLampBody",
    },
    diffuser: {
      label: "透光罩",
      category: "lighting",
      surface: "glass",
      defaultColor: 0xf3ead0,
      emissive: 0xf6e6b8,
      emissiveIntensity: 0.66,
    },
    lampAccent: {
      label: "灯座点缀",
      category: "lighting",
      surface: "metal",
      defaultColor: 0xb08d55,
      paletteKey: "decorAccent",
    },

    /* ── 健身 ────────────────────────────────────────────────────── */
    pad: { label: "软垫", category: "sport", surface: "fabric", defaultColor: 0x8f9a86 },
    weight: { label: "配重", category: "sport", surface: "metal", defaultColor: 0x53585e },
    grip: { label: "握把", category: "sport", surface: "paint", defaultColor: 0x2f3338 },
    sportFrame: { label: "器械框架", category: "sport", surface: "metal", defaultColor: 0x6d7278 },
    courtFelt: { label: "台呢", category: "sport", surface: "fabric", defaultColor: 0x3f7d57 },

    /* ── 儿童 ────────────────────────────────────────────────────── */
    playBody: { label: "玩具主体", category: "kids", surface: "paint", defaultColor: 0xb7a68f },
    playAccent: { label: "玩具点缀", category: "kids", surface: "paint", defaultColor: 0xa87f52 },
    playBall: { label: "玩具球", category: "kids", surface: "paint", defaultColor: 0xb05a4a },
    tentFabric: { label: "帐篷布", category: "kids", surface: "fabric", defaultColor: 0xbfbcae },

    /* ── 宠物 ────────────────────────────────────────────────────── */
    petBody: { label: "用品主体", category: "pet", surface: "paint", defaultColor: 0xc9c3b6 },
    petBowl: { label: "食盆", category: "pet", surface: "ceramic", defaultColor: 0xe6e3dc },
    litter: { label: "猫砂", category: "pet", surface: "stone", defaultColor: 0xdcd6c8 },
    petPad: { label: "宠物垫", category: "pet", surface: "fabric", defaultColor: 0xb7bfae },
    scratchingPost: { label: "抓柱", category: "pet", surface: "fabric", defaultColor: 0xc7b48f },
    rope: { label: "剑麻绳", category: "pet", surface: "fabric", defaultColor: 0xc3ad86 },
    petFood: { label: "宠物干粮", category: "pet", surface: "paint", defaultColor: 0xb08148 },

    /* ── 器皿 / 收纳 ─────────────────────────────────────────────── */
    basket: { label: "篮筐", category: "tableware", surface: "wood", defaultColor: 0xc0975e },
    rack: { label: "架体", category: "tableware", surface: "metal", defaultColor: 0xb6bbbf },
    rackWood: { label: "木架", category: "tableware", surface: "wood", defaultColor: 0xa9855c },
    board: { label: "砧板", category: "tableware", surface: "wood", defaultColor: 0xc9a878 },
    container: {
      label: "容器",
      category: "tableware",
      surface: "glass",
      defaultColor: 0xd8e2e6,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    },
    containerLid: { label: "容器盖", category: "tableware", surface: "lacquer", defaultColor: 0xe7e4dd },
    mug: { label: "杯", category: "tableware", surface: "ceramic", defaultColor: 0xeae6dc },

    /* ── 结构 / 车 ───────────────────────────────────────────────── */
    tread: {
      label: "踏步",
      category: "structure",
      surface: "wood",
      defaultColor: 0xa9855c,
      paletteKey: "wood",
    },
    handrail: { label: "扶手", category: "structure", surface: "metal", defaultColor: 0xb6bbbf },
    railing: { label: "栏杆", category: "structure", surface: "metal", defaultColor: 0xc4c8cc },
    bodywork: { label: "车身", category: "structure", surface: "lacquer", defaultColor: 0xdadde0 },
    vehicleGlass: {
      label: "车窗",
      category: "structure",
      surface: "glass",
      defaultColor: 0x2b3138,
      transparent: true,
      opacity: 0.45,
      depthWrite: false,
    },
    tyre: { label: "轮胎", category: "structure", surface: "paint", defaultColor: 0x1f2225 },
    panelSlat: {
      label: "面板条",
      category: "structure",
      surface: "paint",
      defaultColor: 0xd6d2c9,
      paletteKey: "furnitureLight",
    },

    /* ── 兜底（写实中性件，绝不用「家具蓝灰」占位） ─────────────── */
    metal: { label: "金属件", category: "generic", surface: "metal", defaultColor: 0xb0b5ba },
    glass: {
      label: "玻璃",
      category: "generic",
      surface: "glass",
      defaultColor: 0xc9dde4,
      paletteKey: "glass",
      transparent: true,
      opacity: 0.36,
      depthWrite: false,
    },
    towel: {
      label: "毛巾",
      category: "fabric",
      surface: "fabric",
      defaultColor: 0xe3ded4,
      paletteKey: "diningLinen",
      fallbackPaletteKeys: ["furnitureLight"],
    },
    bagBody: {
      label: "沙袋",
      category: "sport",
      surface: "leather",
      defaultColor: 0x8a3b3b,
      paletteKey: "decorAccent",
    },
    bodyNeutral: { label: "主体", category: "generic", surface: "paint", defaultColor: 0xd2cec6 },
    darkNeutral: { label: "深色件", category: "generic", surface: "paint", defaultColor: 0x4b4a46 },
    lightNeutral: { label: "浅色件", category: "generic", surface: "paint", defaultColor: 0xe8e5de },
    softNeutral: { label: "软质件", category: "generic", surface: "fabric", defaultColor: 0xcdc6b8 },
    accentNeutral: {
      label: "点缀件",
      category: "generic",
      surface: "metal",
      defaultColor: 0xb0a58f,
      paletteKey: "decorAccent",
    },
    glassNeutral: {
      label: "玻璃件",
      category: "generic",
      surface: "glass",
      defaultColor: 0xcfe0e6,
      transparent: true,
      opacity: 0.4,
      depthWrite: false,
    },
  });

/** 主题覆盖键 → 写实默认色（给 `PALETTE_KEY_FALLBACK` 用；键缺省时不再塌成家具灰）。 */
export const SEMANTIC_DEFAULT_BY_PALETTE_KEY: Readonly<Record<string, number>> = Object.freeze(
  Object.fromEntries(
    Object.values(SEMANTIC_ROLE_APPEARANCE)
      .filter((appearance) => Boolean(appearance.paletteKey))
      .map((appearance) => [appearance.paletteKey as string, appearance.defaultColor]),
  ),
);

/** 取语义角色的写实外观。 */
export function semanticRoleAppearance(
  role: string | null | undefined,
): SemanticRoleAppearance | undefined {
  return role ? SEMANTIC_ROLE_APPEARANCE[role] : undefined;
}

/**
 * 取某个语义角色在某调色板下的**出图色**：
 * 主题覆盖键 → 次选键 → 写实默认色。**永不返回 `undefined`**（角色在表里就一定有写实兜底）。
 */
export function resolveSemanticRoleColor(
  role: string,
  palette?: Record<string, unknown> | null,
): number | undefined {
  const appearance = SEMANTIC_ROLE_APPEARANCE[role];
  if (!appearance) return undefined;
  const paletteKeys = [appearance.paletteKey, ...(appearance.fallbackPaletteKeys ?? [])];
  for (const paletteKey of paletteKeys) {
    if (!paletteKey) continue;
    const paletteValue = palette?.[paletteKey];
    if (typeof paletteValue === "number" && Number.isFinite(paletteValue)) return paletteValue;
  }
  return appearance.defaultColor;
}
