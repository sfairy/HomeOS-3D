/** 逐物件的「材质风格」预设档位（对齐参考实现的 `studio/studio-material-styles.ts`）。 */
import type { MaterialSurface, RoleRecipe, StoneSlabFlavor } from "./studio-model-material-roles";
import {
  isStoneSlabFlavor,
  materialRoleRecipeForRole,
  materialSurfaceFinish,
  resolveMaterialPaletteColor,
  resolveModelFamily,
  resolveModelMaterialRole,
  scaleMaterialColorChannels,
} from "./studio-model-material-roles";

/** 默认档：跟随全局风格。 */
export const MATERIAL_STYLE_AUTO = "auto";

interface MaterialStylePreset {
  /** 落进草稿的稳定标识（同一档位在不同物件上可复用，全局唯一）。 */
  id: string;
  /** 下拉里显示的中文名。 */
  label: string;
  /** 整件质感族：角色配方没写 surface 时的兜底（对齐参考实现的档位级 surface）。 */
  surface?: MaterialSurface;
  /** 整件石材板色号：角色配方没写 slab 时的兜底。 */
  slab?: StoneSlabFlavor;
  /** 调色板覆盖键。 */
  colors: Readonly<Record<string, number>>;
  /** 该档位的「角色 → 配方」。 */
  roles: Readonly<Record<string, RoleRecipe>>;
}


function shadeColor(color: number, amount: number): number {
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const channel = (shift: number) => {
    const value = (color >> shift) & 255;
    return Math.round(value + (target - value) * weight);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/** 补齐 furniture 四档。 */
function completeFurnitureRamp(colors: Record<string, number>): Record<string, number> {
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
    colors.leafColor;
  if (rampBase === undefined) {

    return { ...colors };
  }
  return {
    furniture: colors.furniture ?? rampBase,
    furnitureLight: colors.furnitureLight ?? shadeColor(rampBase, 0.72),
    furnitureSoft: colors.furnitureSoft ?? shadeColor(rampBase, 0.28),
    furnitureDark: colors.furnitureDark ?? shadeColor(rampBase, -0.42),
    ...colors,
  };
}

function definePreset(
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
    roles: Object.freeze(deriveStyleRoles(roles)),
  });
}


/** 新项目的 GLB 里有一部分角色是**资产命名直接带出来的**（`-furniture-frame`、`-detail-recess`、`-aquatic-sand`…），参考实现的 combo 里没有同名角色（参考实现没有这批模型）。 */
const STYLE_ROLE_DERIVATIONS: ReadonlyArray<{
  role: string;
  from: readonly string[];
  multiply?: number;
  flatShading?: boolean;
  surface?: MaterialSurface;
  /** 是否连石材板色号一起继承。 */
  inheritSlab?: boolean;
}> = [


  { role: "surface", from: ["top", "upholstery", "fabric", "body"], inheritSlab: true },
  { role: "seat", from: ["upholstery", "fabric", "body", "top"] },
  { role: "fabric", from: ["upholstery", "cushion", "stash", "top", "body"] },
  { role: "linen", from: ["fabric", "upholstery", "cushion"] },
  { role: "sage", from: ["fabric", "upholstery", "cushion"] },
  { role: "runner", from: ["fabric", "upholstery"] },

  { role: "frame", from: ["trim", "body", "leg"] },
  { role: "shadow", from: ["base", "frame", "body"], multiply: 0.6 },
  { role: "back", from: ["body", "shadow", "panel"], multiply: 0.82 },
  { role: "side", from: ["body", "panel"] },
  { role: "dark", from: ["body", "base", "panel"], multiply: 0.55 },
  { role: "panel", from: ["door", "drawer", "body"] },
  { role: "handle", from: ["metal", "trim"] },

  { role: "recess", from: ["body", "panel", "shadow"], multiply: 0.5 },
  { role: "control", from: ["panel", "door", "body"] },
  { role: "indicator", from: ["accent", "lit", "metal"] },
  { role: "water", from: ["glass"] },
  { role: "paper", from: ["book", "panel", "body"] },
  { role: "book", from: ["paper", "stash"] },

  { role: "wood", from: ["top", "body"] },
  { role: "slab", from: ["top", "surface"], inheritSlab: true },


  { role: "accent", from: ["top", "upholstery", "fabric", "cushion", "trim", "metal"] },

  { role: "soil", from: ["interior", "pot"] },
  { role: "foliageSoft", from: ["foliage"], multiply: 1.22 },
  { role: "sand", from: ["interior", "top"] },
  { role: "rock", from: ["frame", "shadow"], flatShading: true },
  { role: "fish", from: ["accent", "body", "pot"] },
  { role: "ceramic", from: ["pot", "top"] },
  { role: "foliage", from: ["interior", "frame"], surface: "foliage" },

  /* ------------------------------------------------------------------ *
   * **真实构件角色**（`model-slot-roles.ts` / `studio-semantic-roles.ts`）：
   * 各档位组合（combo）里没有这些角色，于是「选了档位却不改变任何槽位」（空转）或只改一半
   * （半生效）。这里按**语义近邻**把它们挂到档位已有的角色上，档位才能真正接管配色。
   * ------------------------------------------------------------------ */

  /* 摆件 / 花艺：器身 / 花头 / 枝干 / 干燥花束 */
  { role: "vase", from: ["accent", "body", "base"], surface: "ceramic" },
  { role: "flower", from: ["accent", "leaf", "light"], surface: "foliage" },
  { role: "stem", from: ["frame", "body"], surface: "wood" },
  { role: "pot", from: ["body", "base"], surface: "ceramic" },
  { role: "driedBouquet", from: ["accent", "leaf"], surface: "foliage" },
  { role: "plate", from: ["body", "surface", "light"] },
  { role: "candle", from: ["light", "accent"] },
  { role: "soapTray", from: ["accent", "light"] },

  /* 小家电 / 灶具 / 厨具 */
  { role: "grille", from: ["metal", "dark", "panel"], surface: "metal" },
  { role: "hobFrame", from: ["panel", "body", "dark"] },
  { role: "cooktop", from: ["dark", "panel"], surface: "lacquer" },
  { role: "burner", from: ["metal", "trim"], surface: "metal" },
  { role: "faucet", from: ["metal", "trim"], surface: "metal" },

  /* 软装 / 宠物 / 儿童 / 灯具 */
  { role: "throwBlanket", from: ["fabric", "upholstery", "accent"], surface: "fabric" },
  { role: "board", from: ["top", "body", "surface"], surface: "wood" },
  { role: "rope", from: ["accent", "trim"], surface: "fabric" },
  { role: "petPad", from: ["cushion", "fabric", "upholstery", "accent"], surface: "fabric" },
  { role: "petBase", from: ["base", "body", "frame"] },
  { role: "petFrame", from: ["frame", "body"] },
  { role: "shell", from: ["body", "panel"] },
  { role: "glow", from: ["indicator", "lit", "accent"] },

  /* 通用件：`leg` 之前完全没有派生，缺 `leg` 的档位会让支腿掉回 GLB 占位色（半生效）。 */
  { role: "leg", from: ["trim", "frame", "body"] },
  { role: "interior", from: ["body", "panel", "shadow"] },
  { role: "carcass", from: ["body", "frame", "panel"] },
  { role: "lid", from: ["top", "panel", "body"] },
  { role: "panelSlat", from: ["panel", "door", "body"] },
  { role: "mattress", from: ["upholstery", "cushion", "fabric", "top"], surface: "fabric" },

  /* 木作 / 地毯：`cabinetBody` / `cabinetDoor` 是**调色板语义键**，它们同时也会作为角色出现
   * （`home-network-cabinet` 的柜体 / 柜门、`storage-box` 的盒盖、`round-rug` 的毯面 / 包边）。 */
  { role: "cabinetBody", from: ["body", "carcass"] },
  { role: "cabinetDoor", from: ["door", "panel", "drawer"] },
  { role: "rugPile", from: ["fabric", "upholstery"], surface: "fabric" },
  { role: "rugBorder", from: ["trim", "base"], surface: "fabric" },

  /* 家族 token 兜底出来的「写实中性件」也要能跟着档位走（否则这些槽位同样是档位空转）。 */
  { role: "bodyNeutral", from: ["body", "surface"] },
  { role: "darkNeutral", from: ["dark", "shadow", "base"] },
  { role: "lightNeutral", from: ["light", "surface"] },
  { role: "softNeutral", from: ["soft", "surface"] },
  { role: "accentNeutral", from: ["accent", "trim"] },
  { role: "glassNeutral", from: ["glass"] },
];

/** 按上面的规则把 combo 没给出的角色派生出来（只补空缺，不覆盖 combo 的显式配方）。 */
function deriveStyleRoles(roles: Record<string, RoleRecipe>): Record<string, RoleRecipe> {
  const derivedRoles: Record<string, RoleRecipe> = { ...roles };
  for (const derivationRule of STYLE_ROLE_DERIVATIONS) {
    if (derivedRoles[derivationRule.role]) continue;
    const sourceRole = derivationRule.from.find((candidateRole) => roles[candidateRole]);
    if (!sourceRole) continue;
    const sourceRecipe = roles[sourceRole];

    const { slab: sourceSlab, ...sourceRecipeWithoutSlab } = sourceRecipe;
    derivedRoles[derivationRule.role] = {
      ...sourceRecipeWithoutSlab,
      ...(derivationRule.inheritSlab && sourceSlab ? { slab: sourceSlab } : {}),
      ...(derivationRule.surface ? { surface: derivationRule.surface } : {}),
      ...(derivationRule.multiply !== undefined ? { multiply: derivationRule.multiply } : {}),
      ...(derivationRule.flatShading ? { flatShading: true } : {}),
    };
  }
  return derivedRoles;
}


/** 档位是**按组**给所有人下料的，可同一组里各件模型的构件并不一样：joinery 档位的 `accent`是「撞色摆件」（陶土色），落到梳妆台上却是那面立式镜； */
const MODEL_STYLE_ROLE_OVERRIDES: Readonly<
  Record<string, Readonly<Record<string, RoleRecipe>>>
> = Object.freeze({
  /** 五件「木顶柜」的 `top`（电视柜是 `surface`）是 0.02~0.06m 的薄木板，joinery 档位却把它当石材台面刷成白石 / 黑石。 */
  shelf: { top: { surface: "wood", color: "cabinetBody" } },
  nightstand: { top: { surface: "wood", color: "cabinetBody" } },
  shoecabinet: { top: { surface: "wood", color: "cabinetBody" } },
  sideboard: { top: { surface: "wood", color: "cabinetBody" } },
  tvstand: { surface: { surface: "wood", color: "cabinetBody" } },
  /** 台球桌：`surface` 是木质台面边轨（木色）； */
  "pool-table": {
    surface: { surface: "wood", color: "wood" },
    accent: { surface: "lacquer", color: 0xf5f0e6 },
  },
  /** 梳妆台：`accent` 是 0.69×0.65m 的**立式镜面**（加载器 auto 分支本来就把它按玻璃透明出图，见 `vanityRoleColors.accent = itemPalette.glass`）； */
  vanity: {
    accent: {
      surface: "glass",
      color: 0xcdd6dc,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
    },
  },
});

/** 取某角色在某档位下的配方：逐模型覆写优先，其次档位自己的配方，最后按**档位组**补全。 */
function styleRoleRecipeFor(
  modelType: string | undefined,
  role: string,
  preset: MaterialStylePreset,
): RoleRecipe | undefined {
  const modelOverride = modelType ? MODEL_STYLE_ROLE_OVERRIDES[modelType]?.[role] : undefined;
  if (modelOverride) return modelOverride;
  const presetRecipe = preset.roles[role];
  if (presetRecipe) return presetRecipe;
  const presetGroup = modelType ? presetGroupFor(modelType) : null;
  return (presetGroup ? STYLE_ROLE_RECIPES_BY_GROUP[presetGroup]?.[role] : undefined) ?? undefined;
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
const RIM_RECIPE: RoleRecipe = Object.freeze({ surface: "ceramic", color: "furniture" });

const STYLE_ROLE_RECIPES_BY_GROUP: Readonly<Record<string, Readonly<Record<string, RoleRecipe>>>> =
  Object.freeze({
    /** 绿植 / 花艺：浅色叶 + 接水盘 + 花朵 + 花蕊。 */
    decor: {
      foliageLight: { surface: "foliage", color: "leafColorLight" },
      saucer: { surface: "ceramic", color: "decorAccent", multiply: 0.88 },
      flower: { surface: "paint", color: 0xe0a8bd },
      flowerCenter: { surface: "paint", color: 0xe8c169 },
    },

    /** 摆件 / 挂饰：画框、装饰面、花枝、垂布、镜面、抱枕、雕件、奖杯、摆件。 */
    ornament: {
      frame: { surface: "wood", color: "furnitureDark" },
      surface: { surface: "paint", color: "furnitureLight" },
      stem: { surface: "wood", color: "furnitureDark" },
      drape: { surface: "fabric", color: "decorAccent" },
      /** 全身镜：镜面不是「透明玻璃」，是高金属度低粗糙度的反射面。 */
      glass: { surface: "glass", color: "glass", metalness: 0.92, roughness: 0.05 },
      pillow: { surface: "fabric", color: "furnitureLight" },
      fabric: { surface: "fabric", color: "furnitureSoft" },
      sculpture: { surface: "stone", color: "decorAccent" },
      shell: { surface: "paint", color: "furniture" },
      trophyMetal: { surface: "metal", color: 0xcdaa63 },
      figurine: { surface: "ceramic", color: "furnitureLight" },
    },
    /** 灯具：灯体 / 灯饰金属 / 灯罩 / 透光罩。 */
    lamp: {
      lampBody: { surface: "metal", color: "floorLampBody" },
      lampAccent: { surface: "metal", color: "furnitureDark" },
      lampShade: { surface: "fabric", color: "furnitureLight" },
      diffuser: {
        surface: "glass",
        color: 0xe9e6df,
        transparent: true,
        opacity: 0.55,
        depthWrite: false,
      },
    },
    /** 家电：视窗 / 杯体 / 容器盖 / 置物盘。 */
    steelAppliance: {
      window: { surface: "glass", color: "glass", transparent: true, opacity: 0.42, depthWrite: false },
      container: {
        surface: "glass",
        color: "glass",
        transparent: true,
        opacity: 0.5,
        depthWrite: false,
      },
      containerLid: { surface: "metal", color: "furnitureDark" },
      soapTray: { surface: "metal", color: "metal" },
    },
    /** 洁具 / 卫浴：池沿、盆体、牙杯、毛巾杆、置物盘、收纳罐。 */
    ceramic: {
      rim: { surface: "ceramic", color: "furniture" },
      bowl: { surface: "ceramic", color: "furnitureLight" },
      mug: { surface: "ceramic", color: "furnitureLight" },
      container: { surface: "ceramic", color: "furnitureLight" },
      containerLid: { surface: "ceramic", color: "furnitureLight" },
      rack: { surface: "metal", color: "showerMetal" },
      towel: { surface: "fabric", color: "diningLinen" },
    },
    /** 台盆：盆体 / 池沿 / 置物盘。台面素材（`countertop`）直接挂这一组，`rim` 是两边共用的那条。 */
    basin: {
      rim: RIM_RECIPE,
      bowl: { surface: "ceramic", color: "furnitureLight" },
      soapTray: { surface: "ceramic", color: "furnitureLight" },
    },
    /** 木作：台面 / 桶体 / 木架。 */
    woodwork: {
      countertop: { surface: "stone", color: "countertop" },
      container: { surface: "wood", color: "cabinetBody" },
      rackWood: { surface: "wood", color: "wood" },
    },
    /** 宠物：干粮 / 水盆（`pet-dryer` / `pet-bed-bowls` 的真实构件）。 */
    pet: {
      petFood: { surface: "paint", color: 0xb08148 },
      water: { surface: "glass", color: 0xa9c5d3, transparent: true, opacity: 0.62, depthWrite: false },
    },
    /** 数码 / 影音：机身边框 / 支架 / 纸张。 */
    device: {
      bezel: { surface: "lacquer", color: "furnitureDark" },
      stand: { surface: "metal", color: "furnitureDark" },
      paperSheet: { surface: "paint", color: 0xf3f1ea },
    },
  });


type Recipe = RoleRecipe;

/** 布艺座具 / 卧床：软包 + 框架 + 脚 + 可分离件。 */
function fabricCombo({ upholstery, leg, frame, accent, cushion, top, trim, metal, body, fabric }: {
  upholstery: Recipe;
  leg: Recipe;
  frame?: Recipe;
  accent?: Recipe;
  cushion?: Recipe;
  top?: Recipe;
  trim?: Recipe;
  metal?: Recipe;
  body?: Recipe;
  fabric?: Recipe;
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

    metal: metal ?? { surface: "metal", color: 0x9aa1a8 },
  };
}

/** 柜类：柜体 / 柜面 / 台面 / 五金一次说清。 */
function joineryCombo({
  body,
  door,
  top,
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
  body: Recipe;
  door: Recipe;
  top?: Recipe;
  metal?: Recipe;
  drawer?: Recipe;
  trim?: Recipe;
  shelf?: Recipe;
  base?: Recipe;
  glass?: Recipe;
  mirror?: Recipe;
  interior?: Recipe;
  leg?: Recipe;
  sink?: Recipe;
  cooktop?: Recipe;
  book?: Recipe;
  stash?: Recipe;
  accent?: Recipe;
}): Record<string, Recipe> {

  const interiorRecipe =
    typeof body.color == "number"
      ? { surface: "wood" as MaterialSurface, color: shadeColor(body.color, 0.45) }
      : door;

  const glassRecipe: Recipe = { surface: "glass", color: 0xa9c5d3 };

  const sinkRecipe: Recipe = { surface: "metal", color: 0xb9bfc5, roughness: 0.24, metalness: 0.62 };
  const cooktopRecipe: Recipe = { surface: "metal", color: 0x33363a, roughness: 0.2, metalness: 0.6 };

  const mirrorRecipe: Recipe = { surface: "glass", color: 0xdbe4ea, roughness: 0.08, metalness: 0.35 };

  const bookRecipe: Recipe = { surface: "paint", color: 0xd6c6a4 };

  const stashRecipe: Recipe = { surface: "leather", color: 0x6f7176 };

  const accentRecipe: Recipe = { surface: "ceramic", color: 0xb0663f };
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
    interior: interior ?? interiorRecipe,
    glass: glass ?? glassRecipe,
    mirror: mirror ?? mirrorRecipe,
    metal: metal!,
    sink: sink ?? sinkRecipe,
    cooktop: cooktop ?? cooktopRecipe,
  };
}

/** 木器家具：台面 / 腿 / 箱体 / 抽屉面 / 横撑 / 五金。 */
function woodCombo({ top, leg, metal, body, drawer, shelf, trim, base, upholstery, cushion }: {
  top: Recipe;
  leg?: Recipe;
  metal?: Recipe;
  body?: Recipe;
  drawer?: Recipe;
  shelf?: Recipe;
  trim?: Recipe;
  base?: Recipe;
  upholstery?: Recipe;
  cushion?: Recipe;
}): Record<string, Recipe> {
  return {
    top,
    leg: leg!,

    body: body ?? top,
    drawer: drawer ?? top,
    shelf: shelf ?? top,

    trim: trim ?? body ?? top,
    base: base! ?? leg ?? metal,

    upholstery: upholstery ?? { surface: "fabric", color: 0xf3e7d8 },
    cushion: cushion ?? upholstery ?? { surface: "fabric", color: 0xf3e7d8 },
    metal: metal!,
  };
}

/** 石材件：石板 / 石座 / 五金。 */
function stoneCombo({ top, base, metal, trim, drawer, shelf }: {
  top: Recipe;
  base: Recipe;
  metal?: Recipe;
  trim?: Recipe;
  drawer?: Recipe;
  shelf?: Recipe;
}): Record<string, Recipe> {
  return {
    top,
    base,

    drawer: drawer ?? top,
    shelf: shelf ?? top,

    trim: trim ?? base,
    metal: metal ?? { surface: "metal", color: 0x8c8f94 },
  };
}

/** 家电机身的三档明暗：**门脸 / 抽屉面 / 台面**取中间那档，**控制面板 / 底座**压到最暗那档。
 *
 * @param finish 本档箱体的表面处理（不锈钢档是 metal、奶白档是 paint）。门脸 / 踢脚 / 控制面板
 * 一律**沿用箱体的表面处理**：一台奶白冰箱配一扇金属门、或白漆箱体配一块金属踢脚，
 * 都会读成「几件不同材质拼起来的」，而真实家电的同一面漆 / 同一种拉丝是整套的。
 */
function applianceShellTones(finish: MaterialSurface): {
  door: Recipe;
  drawer: Recipe;
  top: Recipe;
  panel: Recipe;
  base: Recipe;
} {
  return {
    door: { surface: finish, color: "applianceSoft" },
    drawer: { surface: finish, color: "applianceSoft" },
    top: { surface: finish, color: "applianceSoft" },
    panel: { surface: finish, color: "applianceDark" },
    base: { surface: finish, color: "applianceDark" },
  };
}

/** 智能设备的机身层次：**面板 / 顶端面**比箱体浅一档（`applianceSoft`），**底座 / 支脚**压到最暗一档（`applianceDark`）。
 *
 * @param finish 本档箱体的表面处理（皓白 / 石墨黑是 paint、金属灰是 metal），面板与底座
 * 沿用同一支表面处理，避免「塑料壳配金属面」的拼装感。
 */
function deviceShellTones(finish: MaterialSurface): {
  panel: Recipe;
  top: Recipe;
  base: Recipe;
  leg: Recipe;
} {
  return {
    panel: { surface: finish, color: "applianceSoft" },
    top: { surface: finish, color: "applianceSoft" },
    base: { surface: finish, color: "applianceDark" },
    leg: { surface: finish, color: "applianceDark" },
  };
}

/** 家电：箱体 / 门板 / 面板 / 五金 / 玻璃 / 屏 / 发光面 / 格栅 / 打印纸。 */
function applianceCombo({
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
  body: Recipe;
  door?: Recipe;
  panel?: Recipe;
  metal?: Recipe;
  glass?: Recipe;
  trim?: Recipe;
  handle?: Recipe;
  grating?: Recipe;
  screen?: Recipe;
  lit?: Recipe;
  base?: Recipe;
  top?: Recipe;
  drawer?: Recipe;
  leg?: Recipe;
  shelf?: Recipe;
  paper?: Recipe;
}): Record<string, Recipe> {


  const paperRecipe: Recipe = { surface: "paint", color: 0xf3f1ea };
  return {
    body,
    door: door ?? body,
    panel: panel ?? body,
    trim: trim ?? body,
    base: base ?? body,

    top: top ?? body,
    drawer: drawer ?? door ?? body,

    shelf: shelf ?? body,
    leg: leg ?? metal ?? { surface: "metal", color: 0x8c8f94 },
    handle: handle! ?? metal,
    metal: metal ?? { surface: "metal", color: 0x8c8f94 },
    glass: glass ?? { surface: "glass", color: 0xdfeaec },
    screen: screen ?? { surface: "lacquer", color: 0x1b1d20 },
    grating: grating ?? { surface: "metal", color: 0x6d747b },
    lit: lit ?? { surface: "paint", color: 0xf6f2e8 },
    paper: paper ?? paperRecipe,
  };
}

/** 洁具：陶瓷本体 / 内腔 / **盆体** / 台面 / 柜体 / 五金。 */
function sanitaryCombo({
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
  body: Recipe;
  top?: Recipe;
  sink?: Recipe;
  frame?: Recipe;
  door?: Recipe;
  drawer?: Recipe;
  shelf?: Recipe;
  base?: Recipe;
  interior?: Recipe;
  trim?: Recipe;
  handle?: Recipe;
  metal?: Recipe;
  glass?: Recipe;
  mirror?: Recipe;
  grating?: Recipe;
}): Record<string, Recipe> {
  const interiorRecipe =
    interior ??
    (Number.isFinite(body.color)
      ? { surface: body.surface, color: shadeColor(body.color as number, -0.18) }
      : null);
  const joineryRecipe = frame ?? top ?? body;
  /**
   * 洁具的五金（拉手 / 挡水 / 毛巾杆 / 台盆龙头）以前是**写死的 0xbfc6cc**，任何陶瓷档位都刷不动它，
   * 于是像 `heated-towel-rail`（全机只有杆 / 龙头 / 毛巾 / 装饰条）这种模型选遍档位**毫无变化**。
   * 改成主题语义键 `showerMetal`：档位没写该键时回落主题值（= 原来的 0xbfc6cc，行为不变），
   * 陶瓷档位自己写了该键（见 `CERAMIC_STYLES`）时就随档位走「亮白 / 哑光 / 岩灰」。
   */
  const metalRecipe: Recipe = metal ?? { surface: "metal", color: 0xbfc6cc };
  const glassRecipe: Recipe = glass ?? { surface: "glass", color: 0xdfeaec };

  const mirrorRecipe: Recipe = mirror ?? {
    surface: "glass",
    color: 0xdbe4ea,
    roughness: 0.08,
    metalness: 0.35,
  };
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
  };
}

/** 玻璃隔断：玻璃 + 框（立柱 / 横梁）+ 拉手。 */
function glazingCombo({ glass, frame, handle, trim, metal }: {
  glass: Recipe;
  frame?: Recipe;
  handle?: Recipe;
  trim?: Recipe;
  metal?: Recipe;
}): Record<string, Recipe> {
  const frameRecipe = frame ?? metal ?? { surface: "metal", color: 0xb4babf };
  return {
    glass,
    frame: frame ?? frameRecipe,
    metal: metal ?? frameRecipe,
    trim: trim ?? frameRecipe,
    handle: handle ?? frameRecipe,
  };
}

/** 绿植 / 花艺：叶 / 浅色叶 / 盆 / 托 / 干 / 土 / 花 / 花蕊。 */
function plantCombo({ foliage, pot, saucer, trunk, soil, flower, flowerCenter }: {
  foliage: Recipe;
  pot: Recipe;
  saucer?: Recipe;
  trunk?: Recipe;
  soil?: Recipe;
  flower?: Recipe;
  flowerCenter?: Recipe;
}): Record<string, Recipe> {
  const derivedTrunk: Recipe = { surface: "wood", color: 0x6b5a42 };
  const derivedSaucer: Recipe = { surface: "ceramic", color: shadeColor(pot.color as number, -0.3) };
  const derivedSoil: Recipe = { surface: "stone", color: 0x3b2f22 };
  return {
    foliage,
    /** 同一株上的新叶 / 受光叶：比主叶亮一档，别让整株塌成一个色号。 */
    foliageLight: { surface: "foliage", color: shadeColor(foliage.color as number, 0.2) },
    pot,
    /** `saucer` 与 `base` 是同一块接水盘的两种叫法。 */
    saucer: saucer ?? derivedSaucer,
    base: saucer ?? derivedSaucer,
    frame: trunk ?? derivedTrunk,
    interior: soil ?? derivedSoil,
    ...(flower
      ? { flower, flowerCenter: flowerCenter ?? { surface: "paint", color: 0xe8c169 } }
      : {}),
  };
}

/** 地毯：毯面 + 包边 + 防滑底。 */
function rugCombo({ fabric, trim, base }: { fabric: Recipe; trim?: Recipe; base?: Recipe }): Record<string, Recipe> {
  const derivedTrim: Recipe = { surface: "fabric", color: shadeColor(fabric.color as number, -0.22) };
  const derivedBase: Recipe = { surface: "fabric", color: shadeColor(fabric.color as number, -0.62) };
  return { fabric, trim: trim ?? derivedTrim, base: base ?? derivedBase };
}

/** 窗帘：帘布 + 顶轨 / 支架。 */
function curtainCombo({ fabric, metal }: { fabric: Recipe; metal?: Recipe }): Record<string, Recipe> {
  return { fabric, metal: metal ?? { surface: "metal", color: 0x9aa1a8 } };
}

/** 鱼缸：柜体 / 柜门 / 台面 / 踢脚 / 拉手（下）+ 缸框 / 缸内背板 / 玻璃 / 灯板（上）+ **缸内造景与活体**（底砂 / 造景石 / 水草 / 鱼）。 */
function aquariumCombo({
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
  body: Recipe;
  door?: Recipe;
  top?: Recipe;
  base?: Recipe;
  handle?: Recipe;
  frame?: Recipe;
  glass?: Recipe;
  interior?: Recipe;
  lit?: Recipe;
  sand?: Recipe;
  rock?: Recipe;
  foliage?: Recipe;
  fish?: Recipe;
}): Record<string, Recipe> {
  const derivedBase: Recipe = { surface: "lacquer", color: shadeColor(body.color as number, -0.45) };
  const derivedHandle: Recipe = { surface: "metal", color: 0xb4babf };
  const derivedFrame: Recipe = { surface: "lacquer", color: shadeColor(body.color as number, -0.5) };
  const derivedGlass: Recipe = { surface: "glass", color: 0xdfeaec };
  const derivedInterior: Recipe = { surface: "stone", color: 0x1b3a40 };
  const derivedLit: Recipe = { surface: "paint", color: 0xcfe8f2 };

  const sandRecipe: Recipe = { surface: "stone", color: 0xe3d7bd, roughness: 0.92 };
  const rockRecipe: Recipe = { surface: "stone", color: 0x7c7f78, flatShading: true };
  const foliageRecipe: Recipe = { surface: "foliage", color: 0x3f6b3f };
  const fishRecipe: Recipe = { surface: "lacquer", color: 0xe08a3c };
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
  };
}

/** 钢琴：琴身 / 顶盖 / **白键** / **黑键与铸铁内板** / 键床盖板 / 琴腿 / 五金。 */
function pianoCombo({ body, top, panel, leg, metal, key, dark, accent }: {
  body: Recipe;
  top?: Recipe;
  panel?: Recipe;
  leg?: Recipe;
  metal?: Recipe;
  key?: Recipe;
  dark?: Recipe;
  accent?: Recipe;
}): Record<string, Recipe> {
  const keyRecipe: Recipe = { surface: "lacquer", color: 0xf6f2e8 };
  const darkRecipe: Recipe = { surface: "lacquer", color: 0x16181a };

  const accentRecipe: Recipe = { surface: "metal", color: 0xb08d5a };
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
  };
}

/** 柱体：柱身 / 柱脚 / 柱帽三段。 */
function pillarCombo({ body, base, trim }: { body: Recipe; base?: Recipe; trim?: Recipe }): Record<string, Recipe> {
  return { body, base: base ?? body, trim: trim ?? body };
}

/** 台球桌：桌架 / 暗部 / 台面边轨 / 台呢 / 台球。 */
function poolTableCombo({
  frame,
  fabric,
  surface,
  shadow,
  accent,
}: {
  frame: Recipe;
  fabric: Recipe;
  surface?: Recipe;
  shadow?: Recipe;
  accent?: Recipe;
}): Record<string, Recipe> {
  return {
    frame,

    surface: surface ?? frame,

    fabric,

    shadow: shadow ?? { surface: "wood", color: shadeColor(frame.color as number, -0.45) },

    accent: accent ?? { surface: "lacquer", color: 0xf5f0e6 },
  };
}

/** 淋浴房：金属本体 / 内腔玻璃 / 五金。 */
function showerCombo({
  body,
  interior,
  metal,
}: {
  body: Recipe;
  interior?: Recipe;
  metal?: Recipe;
}): Record<string, Recipe> {
  return {
    body,

    interior:
      interior ?? { surface: "glass", color: 0xdfeaec, transparent: true, opacity: 0.26, depthWrite: false },

    metal: metal ?? { surface: "metal", color: 0xb4babf },
  };
}

/** 茶台组合：桌架 / 台板 / 凹槽 / 瓷件 / 点缀。 */
function teaTableCombo({
  frame,
  panel,
  recess,
  ceramic,
  accent,
}: {
  frame: Recipe;
  panel: Recipe;
  recess?: Recipe;
  ceramic: Recipe;
  accent?: Recipe;
}): Record<string, Recipe> {
  return {
    frame,
    panel,

    recess: recess ?? { surface: "wood", color: shadeColor(frame.color as number, -0.42) },
    ceramic,
    accent: accent ?? ceramic,
  };
}

/** 摆件（书本 / 花瓶 / 托盘 / 纸巾盒 / 小盆栽）：底色 + 浅色件 + 深色件 + 点缀 + 叶片。 */
function ornamentCombo({
  base,
  light,
  dark,
  accent,
  leaf,
}: {
  base: Recipe;
  light: Recipe;
  dark: Recipe;
  accent?: Recipe;
  leaf?: Recipe;
}): Record<string, Recipe> {
  const derivedAccent: Recipe = { surface: "ceramic", color: shadeColor(base.color as number, 0.18) };
  const derivedLeaf: Recipe = { surface: "foliage", color: 0x5f8c4d };
  return {
    base,
    light,
    dark,
    accent: accent ?? derivedAccent,
    leaf: leaf ?? derivedLeaf,
  };
}


const FABRIC_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "fabric-warm",
    "暖白布艺",
    "fabric",
    {
      furnitureLight: 0xf3e7d8,
      furnitureSoft: 0xe4d5c2,
      sofaFabric: 0xf3e7d8,
      diningLinen: 0xf3e7d8,
    },
    fabricCombo({
      upholstery: { surface: "fabric", color: 0xf3e7d8 },
      leg: { surface: "wood", color: 0xb08a5e },
      accent: { surface: "fabric", color: 0xc09a6e },
    }),
  ),
  definePreset(
    "linen-grey",
    "亚麻灰",
    "fabric",
    {
      furnitureLight: 0xd9d7d0,
      furnitureSoft: 0xb9b6ad,
      sofaFabric: 0xd9d7d0,
      diningLinen: 0xd9d7d0,
    },
    fabricCombo({
      upholstery: { surface: "fabric", color: 0xd9d7d0 },
      leg: { surface: "wood", color: 0x9c6b3f },
      accent: { surface: "fabric", color: 0x8f8b82 },
    }),
  ),
  definePreset(
    "sage-mist",
    "雾霾绿",
    "fabric",
    {
      furnitureLight: 0xcbd6c4,
      furnitureSoft: 0xa8b79e,
      sofaFabric: 0xcbd6c4,
      diningSage: 0xa8b79e,
    },
    fabricCombo({
      upholstery: { surface: "fabric", color: 0xcbd6c4 },
      leg: { surface: "wood", color: 0xa9814f },

      accent: { surface: "fabric", color: 0xc2a184 },
    }),
  ),
  definePreset(
    "clay-terracotta",
    "陶土棕",
    "fabric",
    {
      furnitureLight: 0xd8b49c,
      furnitureSoft: 0xb98d73,
      sofaFabric: 0xd8b49c,
    },
    fabricCombo({
      upholstery: { surface: "fabric", color: 0xd8b49c },
      leg: { surface: "metal", color: 0x3a3a3c },
      accent: { surface: "fabric", color: 0xa8765a },
    }),
  ),
]);


const LEATHER_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "leather-tan",
    "焦糖皮",
    "leather",
    {
      furnitureLight: 0xc98a52,
      furnitureSoft: 0xb0703c,
      sofaFabric: 0xb0703c,
    },
    fabricCombo({
      upholstery: { surface: "leather", color: 0xb0703c },
      leg: { surface: "metal", color: 0x3a3a3c },


      accent: { surface: "leather", color: "furnitureLight" },
    }),
  ),
  definePreset(
    "leather-cognac",
    "干邑棕",
    "leather",
    {
      furnitureLight: 0xa75c2c,
      furnitureSoft: 0x8c4a22,
      sofaFabric: 0x8c4a22,
    },
    fabricCombo({
      upholstery: { surface: "leather", color: 0x8c4a22 },
      leg: { surface: "metal", color: 0x2e2e30 },
      accent: { surface: "leather", color: "furnitureLight" },
    }),
  ),
  definePreset(
    "leather-black",
    "墨黑皮",
    "leather",
    {
      furnitureLight: 0x3c3a38,
      furnitureSoft: 0x262422,
      sofaFabric: 0x262422,
    },
    fabricCombo({
      upholstery: { surface: "leather", color: 0x262422 },
      leg: { surface: "metal", color: 0x2e2e30 },

      frame: { surface: "wood", color: 0x3a2418 },


      accent: { surface: "leather", color: "furnitureLight" },
    }),
  ),
]);

/** 软装座具：布艺四档 + 皮革三档并成一组，一个下拉里都能选。 */
const UPHOLSTERY_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  ...FABRIC_STYLES,
  ...LEATHER_STYLES,
]);


/** 「木柜白门」的白门色：一支暖白，**刻意不是纯白**。 */
const JOINERY_WHITE_DOOR_COLOR = 0xe9e4da;

/** 柜类四档的「柜体 / 柜面」两支料。 */
const JOINERY_TONE_BY_STYLE = Object.freeze({
  "joinery-wood-white": Object.freeze({
    body: Object.freeze({ surface: "wood" as MaterialSurface, color: 0x3d2818 }),
    door: Object.freeze({
      surface: "lacquer" as MaterialSurface,
      color: JOINERY_WHITE_DOOR_COLOR,
    }),
  }),
  "joinery-oak": Object.freeze({
    body: Object.freeze({ surface: "wood" as MaterialSurface, color: 0xc49a6c }),
    door: Object.freeze({ surface: "wood" as MaterialSurface, color: 0xd8b98f }),
  }),
  "joinery-walnut": Object.freeze({
    body: Object.freeze({ surface: "wood" as MaterialSurface, color: 0x5a3a22 }),
    door: Object.freeze({ surface: "wood" as MaterialSurface, color: 0x6b4526 }),
  }),
  "joinery-lacquer": Object.freeze({
    body: Object.freeze({ surface: "lacquer" as MaterialSurface, color: 0x2e2a28 }),
    door: Object.freeze({ surface: "lacquer" as MaterialSurface, color: 0x3a3a3c }),
  }),
});

/** 「木柜白门」的门料自发光：白门在默认档的暗场里**必须自己撑住白度**。 */
const JOINERY_WHITE_DOOR_GLOW = Object.freeze({
  emissive: JOINERY_WHITE_DOOR_COLOR,
  emissiveIntensity: 0.6,
});

const JOINERY_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "joinery-wood-white",
    "木柜白门",
    "wood",
    {
      cabinetWood: 0x3d2818,
      cabinetBody: 0x3d2818,

      cabinetDoor: JOINERY_WHITE_DOOR_COLOR,
      furniture: 0xc49a6c,
      furnitureSoft: 0xc49a6c,
      furnitureDark: 0x3d2818,
      countertop: 0xf2f1ed,
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-wood-white"].body,

      door: Object.freeze({
        ...JOINERY_TONE_BY_STYLE["joinery-wood-white"].door,
        ...JOINERY_WHITE_DOOR_GLOW,
      }),
      top: { surface: "stone", color: 0xf2f1ed },
      metal: { surface: "metal", color: 0x9aa1a8 },
    }),
  ),
  definePreset(
    "joinery-oak",
    "浅橡木",
    "wood",
    {
      cabinetWood: 0xc49a6c,
      cabinetBody: 0xc49a6c,
      cabinetDoor: 0xd8b98f,
      furniture: 0xc49a6c,
      furnitureSoft: 0xd8b98f,
      furnitureDark: 0x9c6b3f,
      countertop: 0xede7db,
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-oak"].body,
      door: JOINERY_TONE_BY_STYLE["joinery-oak"].door,
      top: { surface: "stone", color: 0xede7db },
      metal: { surface: "metal", color: 0x8c8f94 },
    }),
  ),
  definePreset(
    "joinery-walnut",
    "胡桃木",
    "wood",
    {
      cabinetWood: 0x5a3a22,
      cabinetBody: 0x5a3a22,
      cabinetDoor: 0x6b4526,
      furniture: 0x6b4526,
      furnitureSoft: 0x855c36,
      furnitureDark: 0x3f2916,
      countertop: 0x2b2b2e,
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-walnut"].body,
      door: JOINERY_TONE_BY_STYLE["joinery-walnut"].door,
      top: { surface: "stone", color: 0x2b2b2e },
      metal: { surface: "metal", color: 0x2e2e30 },
    }),
  ),
  definePreset(
    "joinery-lacquer",
    "深色烤漆",
    "lacquer",
    {
      cabinetWood: 0x2e2a28,
      cabinetBody: 0x2e2a28,
      cabinetDoor: 0x3a3a3c,
      furniture: 0x3a3a3c,
      furnitureSoft: 0x4d4d50,
      furnitureDark: 0x1f1f21,
      countertop: 0x2b2b2e,
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-lacquer"].body,
      door: JOINERY_TONE_BY_STYLE["joinery-lacquer"].door,
      top: { surface: "stone", color: 0x2b2b2e },
      metal: { surface: "metal", color: 0x44484d },
    }),
  ),
]);


const PILLAR_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "pillar-joinery-wood-white",
    "木柜白门（配柜）",
    "wood",
    {
      cabinetBody: JOINERY_TONE_BY_STYLE["joinery-wood-white"].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE["joinery-wood-white"].door.color,
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-wood-white"].door,
      base: JOINERY_TONE_BY_STYLE["joinery-wood-white"].body,
      trim: JOINERY_TONE_BY_STYLE["joinery-wood-white"].body,
    }),
  ),
  definePreset(
    "pillar-joinery-oak",
    "浅橡木（配柜）",
    "wood",
    {
      cabinetBody: JOINERY_TONE_BY_STYLE["joinery-oak"].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE["joinery-oak"].door.color,
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-oak"].door,
      base: JOINERY_TONE_BY_STYLE["joinery-oak"].body,
      trim: JOINERY_TONE_BY_STYLE["joinery-oak"].body,
    }),
  ),
  definePreset(
    "pillar-joinery-walnut",
    "胡桃木（配柜）",
    "wood",
    {
      cabinetBody: JOINERY_TONE_BY_STYLE["joinery-walnut"].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE["joinery-walnut"].door.color,
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-walnut"].door,
      base: JOINERY_TONE_BY_STYLE["joinery-walnut"].body,
      trim: JOINERY_TONE_BY_STYLE["joinery-walnut"].body,
    }),
  ),
  definePreset(
    "pillar-joinery-lacquer",
    "深色烤漆（配柜）",
    "lacquer",
    {
      cabinetBody: JOINERY_TONE_BY_STYLE["joinery-lacquer"].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE["joinery-lacquer"].door.color,
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-lacquer"].door,
      base: JOINERY_TONE_BY_STYLE["joinery-lacquer"].body,
      trim: JOINERY_TONE_BY_STYLE["joinery-lacquer"].body,
    }),
  ),
]);


const WOOD_FURNITURE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "wood-natural",
    "原木本色",
    "wood",
    {
      wood: 0xc49a6c,
      woodLight: 0xd8b98f,
      woodDark: 0x9c6b3f,
      furniture: 0xc49a6c,
      furnitureSoft: 0xd8b98f,
      furnitureDark: 0x9c6b3f,
    },
    woodCombo({
      top: { surface: "wood", color: 0xc49a6c },
      leg: { surface: "wood", color: 0xbc9163 },
      drawer: { surface: "wood", color: 0xd8b98f },
      trim: { surface: "wood", color: 0x9c6b3f },
      metal: { surface: "metal", color: 0x8c8f94 },
    }),
  ),
  definePreset(
    "wood-walnut",
    "胡桃木",
    "wood",
    {
      wood: 0x6b4526,
      woodLight: 0x855c36,
      woodDark: 0x4a2e1a,
      furniture: 0x6b4526,
      furnitureSoft: 0x855c36,
      furnitureDark: 0x4a2e1a,
    },
    woodCombo({
      top: { surface: "wood", color: 0x6b4526 },
      leg: { surface: "wood", color: 0x5f3d21 },
      drawer: { surface: "wood", color: 0x855c36 },
      trim: { surface: "wood", color: 0x4a2e1a },
      metal: { surface: "metal", color: 0x3a3a3c },
    }),
  ),
  definePreset(
    "wood-white-lacquer",
    "白色烤漆",
    "lacquer",
    {
      wood: 0xf5f3ef,
      woodLight: 0xfbfaf8,
      woodDark: 0xdcd8d2,
      furniture: 0xf5f3ef,
      furnitureSoft: 0xfbfaf8,
      furnitureDark: 0xdcd8d2,
    },
    woodCombo({
      top: { surface: "lacquer", color: 0xf5f3ef },
      leg: { surface: "lacquer", color: 0xefece6 },
      drawer: { surface: "lacquer", color: 0xfbfaf8 },
      trim: { surface: "lacquer", color: 0xdcd8d2 },
      metal: { surface: "metal", color: 0xb4babf },
    }),
  ),
  definePreset(
    "wood-black-metal",
    "黑砂金属腿",
    "metal",
    {
      wood: 0x3a3a3c,
      woodLight: 0x55555a,
      woodDark: 0x242426,
      furniture: 0x3a3a3c,
      furnitureSoft: 0x55555a,
      furnitureDark: 0x242426,
    },
    woodCombo({
      top: { surface: "wood", color: 0x6b4526 },
      leg: { surface: "metal", color: 0x2e2e30 },
      drawer: { surface: "wood", color: 0x855c36 },
      trim: { surface: "metal", color: 0x303034 },
      metal: { surface: "metal", color: 0x2e2e30 },
    }),
  ),
]);

const STONE_SLAB_ON_WHITE = Object.freeze({
  slab: "marble" as const,
  color: 0xffffff,
  roughness: 0.24,
  metalness: 0.03,
});
const STONE_SLAB_ON_DARK = Object.freeze({
  slab: "marble-dark" as const,
  color: 0xffffff,
  roughness: 0.18,
  metalness: 0.04,
});
/** 普通石作台面（岩板 / 水磨石…）：走石材的哑光面，**不**贴大理石整图。 */
const STONE_PLAIN_STONE = Object.freeze({
  surface: "stone" as const,
  color: "countertop",
});

const MARBLE_TABLE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "stone-white-black",
    "白石黑座",
    "marble",
    {
      countertop: 0xf2f1ed,
      furniture: 0xf2f1ed,
      furnitureSoft: 0xe3e2dd,
      furnitureDark: 0x1e2023,
    },
    stoneCombo({ top: STONE_SLAB_ON_WHITE, base: STONE_SLAB_ON_DARK }),
  ),
  definePreset(
    "stone-all-white",
    "全白大理石",
    "marble",
    {
      countertop: 0xf4f3ef,
      furniture: 0xf4f3ef,
      furnitureSoft: 0xe6e5e0,
      furnitureDark: 0xd2d0c9,
    },
    stoneCombo({
      top: STONE_SLAB_ON_WHITE,
      base: { ...STONE_SLAB_ON_WHITE, color: 0xd9d8d3 },
    }),
  ),
  definePreset(
    "stone-all-black",
    "全黑大理石",
    "stone",
    {
      countertop: 0x1e2023,
      furniture: 0x1e2023,
      furnitureSoft: 0x33363a,
      furnitureDark: 0x121315,
    },
    stoneCombo({
      top: STONE_SLAB_ON_DARK,
      base: { ...STONE_SLAB_ON_DARK, color: 0xd2d6dd },
    }),
  ),
  definePreset(
    "stone-travertine",
    "米黄洞石",
    "stone",
    {
      countertop: 0xdcd0b8,
      furniture: 0xdcd0b8,
      furnitureSoft: 0xe8ddc8,
      furnitureDark: 0xbfae92,
    },
    stoneCombo({
      top: { surface: "stone", color: 0xdcd0b8 },
      base: { surface: "stone", color: 0xc4b294 },
    }),
  ),
]);


const STONE_TOP_STYLES: readonly MaterialStylePreset[] = Object.freeze([

  definePreset(
    "stone-marble",
    "白色大理石",
    "marble",
    { countertop: 0xf2f1ed },
    {
      top: STONE_SLAB_ON_WHITE,
      surface: STONE_SLAB_ON_WHITE,
      slab: STONE_SLAB_ON_WHITE,
    },
  ),


  definePreset(
    "stone-black",
    "黑色岩板",
    "stone",
    { countertop: 0x2b2b2e },
    {
      top: STONE_PLAIN_STONE,
      surface: STONE_PLAIN_STONE,
      slab: STONE_PLAIN_STONE,
    },
  ),
  definePreset(
    "stone-terrazzo",
    "水磨石",
    "stone",
    { countertop: 0xdcd8cf },
    {
      top: STONE_PLAIN_STONE,
      surface: STONE_PLAIN_STONE,
      slab: STONE_PLAIN_STONE,
    },
  ),
]);

/** 石材类家具（茶几 / 岛台）的完整档位表：整件石作四档 + 只换台面三档。 */
const STONE_FURNITURE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  ...MARBLE_TABLE_STYLES,
  ...STONE_TOP_STYLES,
]);


/** 厨房这一族（`kitchenisland` / `kitchenbase` / `kitchensink` / `kitchencooktop`）共用一组档位：它们都是「**石材台面 + 木柜体**」的橱柜，台面都是槽位 2 的 `top`。 */
const KITCHEN_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "kitchen-marble-white-wood",
    "白大理石·深木柜",
    "marble",
    {
      countertop: 0xf2f1ed,
      cabinetWood: 0x3d2818,
      cabinetBody: 0x3d2818,
      cabinetDoor: 0x4a3220,
      wood: 0x3d2818,
      woodLight: 0x4a3220,
      woodDark: 0x2a1a0f,
      furniture: 0x3d2818,
      furnitureSoft: 0x4a3220,
      furnitureDark: 0x2a1a0f,
    },
    joineryCombo({
      body: { surface: "wood", color: 0x3d2818 },
      door: { surface: "wood", color: 0x4a3220 },
      base: { surface: "wood", color: 0x2a1a0f },
      leg: { surface: "wood", color: 0x2a1a0f },
      top: STONE_SLAB_ON_WHITE,
      metal: { surface: "metal", color: 0x9aa1a8 },
    }),
  ),
  definePreset(
    "kitchen-marble-black-walnut",
    "黑大理石·胡桃木",
    "stone",
    {
      countertop: 0x1e2023,
      cabinetWood: 0x5a3a22,
      cabinetBody: 0x5a3a22,
      cabinetDoor: 0x6b4526,
      wood: 0x5a3a22,
      woodLight: 0x6b4526,
      woodDark: 0x3f2916,
      furniture: 0x5a3a22,
      furnitureSoft: 0x6b4526,
      furnitureDark: 0x3f2916,
    },
    joineryCombo({
      body: { surface: "wood", color: 0x5a3a22 },
      door: { surface: "wood", color: 0x6b4526 },
      base: { surface: "wood", color: 0x3f2916 },
      leg: { surface: "wood", color: 0x3f2916 },
      top: STONE_SLAB_ON_DARK,
      metal: { surface: "metal", color: 0x2e2e30 },
    }),
  ),
  definePreset(
    "kitchen-marble-all-white",
    "全白大理石",
    "marble",
    {
      countertop: 0xf4f3ef,
      cabinetWood: 0xe6e5e0,
      cabinetBody: 0xe6e5e0,
      cabinetDoor: 0xefeeea,
      wood: 0xf4f3ef,
      woodLight: 0xfbfaf8,
      woodDark: 0xd2d0c9,
      furniture: 0xf4f3ef,
      furnitureSoft: 0xe6e5e0,
      furnitureDark: 0xd2d0c9,
    },
    joineryCombo({

      body: { ...STONE_SLAB_ON_WHITE, color: 0xe6e5e0 },
      door: { ...STONE_SLAB_ON_WHITE, color: 0xefeeea },
      base: { ...STONE_SLAB_ON_WHITE, color: 0xd2d0c9 },
      leg: { ...STONE_SLAB_ON_WHITE, color: 0xd2d0c9 },
      top: STONE_SLAB_ON_WHITE,
      metal: { surface: "metal", color: 0xb4babf },
    }),
  ),
  definePreset(
    "kitchen-stone-white-oak",
    "白色岩板·浅橡木",
    "stone",
    {
      countertop: 0xede7db,
      cabinetWood: 0xc49a6c,
      cabinetBody: 0xc49a6c,
      cabinetDoor: 0xd8b98f,
      wood: 0xc49a6c,
      woodLight: 0xd8b98f,
      woodDark: 0x9c6b3f,
      furniture: 0xc49a6c,
      furnitureSoft: 0xd8b98f,
      furnitureDark: 0x9c6b3f,
    },
    joineryCombo({
      body: { surface: "wood", color: 0xc49a6c },
      door: { surface: "wood", color: 0xd8b98f },
      base: { surface: "wood", color: 0x9c6b3f },
      leg: { surface: "wood", color: 0x9c6b3f },
      top: { surface: "stone", color: 0xede7db },
      metal: { surface: "metal", color: 0x8c8f94 },
    }),
  ),
  definePreset(
    "kitchen-stone-black-lacquer",
    "黑色岩板·深色烤漆",
    "stone",
    {
      countertop: 0x2b2b2e,
      cabinetWood: 0x2e2a28,
      cabinetBody: 0x2e2a28,
      cabinetDoor: 0x3a3a3c,
      wood: 0x2e2a28,
      woodLight: 0x3a3a3c,
      woodDark: 0x1f1f21,
      furniture: 0x2e2a28,
      furnitureSoft: 0x3a3a3c,
      furnitureDark: 0x1f1f21,
    },
    joineryCombo({
      body: { surface: "lacquer", color: 0x2e2a28 },
      door: { surface: "lacquer", color: 0x3a3a3c },
      base: { surface: "lacquer", color: 0x1f1f21 },
      leg: { surface: "lacquer", color: 0x1f1f21 },
      top: { surface: "stone", color: 0x2b2b2e },
      metal: { surface: "metal", color: 0x44484d },
    }),
  ),
]);


const STEEL_APPLIANCE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "appliance-steel-silver",
    "银灰不锈钢",
    "metal",
    {
      appliance: 0xc6cbd1,
      applianceSoft: 0xb9bec4,
      applianceDark: 0x868e96,
      furniture: 0xc6cbd1,
      furnitureSoft: 0xb9bec4,
      furnitureLight: 0xd8dce1,
      furnitureDark: 0x868e96,
    },
    applianceCombo({
      body: { surface: "metal", color: 0xc6cbd1 },
      metal: { surface: "metal", color: 0x8c8f94 },
      ...applianceShellTones("metal"),
    }),
  ),
  definePreset(
    "appliance-steel-black",
    "银黑",
    "metal",
    {
      appliance: 0x454c54,
      applianceSoft: 0x6a737d,
      applianceDark: 0x262b30,
      furniture: 0x454c54,
      furnitureSoft: 0x6a737d,
      furnitureLight: 0x8b949e,
      furnitureDark: 0x262b30,
    },
    applianceCombo({
      body: { surface: "metal", color: 0x454c54 },
      metal: { surface: "metal", color: 0x2e2e30 },
      ...applianceShellTones("metal"),
    }),
  ),
  definePreset(
    "appliance-cream",
    "奶白",
    "paint",
    {
      appliance: 0xf8f2e6,
      applianceSoft: 0xefe7d8,
      applianceDark: 0xc9c2b4,
      furniture: 0xf8f2e6,
      furnitureSoft: 0xefe7d8,
      furnitureLight: 0xfdf9f2,
      furnitureDark: 0xc9c2b4,
    },
    applianceCombo({
      body: { surface: "paint", color: 0xf8f2e6 },
      metal: { surface: "metal", color: 0xb4babf },
      ...applianceShellTones("paint"),
    }),
  ),
]);

const DEVICE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "device-white",
    "皓白",
    "paint",
    {
      appliance: 0xfafaf8,
      applianceSoft: 0xeeeee9,
      applianceDark: 0xd0d0c9,
      furniture: 0xfafaf8,
      furnitureSoft: 0xeeeee9,
      furnitureLight: 0xffffff,
      furnitureDark: 0xd0d0c9,
    },
    applianceCombo({
      body: { surface: "paint", color: 0xfafaf8 },
      metal: { surface: "metal", color: 0xb4babf },
      ...deviceShellTones("paint"),
    }),
  ),
  definePreset(
    "device-graphite",
    "石墨黑",
    "paint",
    {
      appliance: 0x3c3f44,
      applianceSoft: 0x565a61,
      applianceDark: 0x22252a,
      furniture: 0x3c3f44,
      furnitureSoft: 0x565a61,
      furnitureLight: 0x707680,
      furnitureDark: 0x22252a,
    },
    applianceCombo({
      body: { surface: "paint", color: 0x3c3f44 },
      metal: { surface: "metal", color: 0x2e2e30 },
      ...deviceShellTones("paint"),
    }),
  ),
  definePreset(
    "device-steel",
    "金属灰",
    "metal",
    {
      appliance: 0x9aa1a8,
      applianceSoft: 0xb4babf,
      applianceDark: 0x6d747b,
      furniture: 0x9aa1a8,
      furnitureSoft: 0xb4babf,
      furnitureLight: 0xc7ccd1,
      furnitureDark: 0x6d747b,
    },
    applianceCombo({
      body: { surface: "metal", color: 0x9aa1a8 },
      metal: { surface: "metal", color: 0x6d747b },
      ...deviceShellTones("metal"),
    }),
  ),
]);

/**
 * 洁具档位：除了池体 / 台面 / 木作，必须同时下料**五金与织物**（`showerMetal` / `diningLinen`）——
 * 洁具组里毛巾杆（`rack`）、龙头（`faucet` 由 `metal`/`trim` 派生）、毛巾（`towel`）都读这两个语义键；
 * 不写就等于让这些构件永远停在主题默认色，整机只有池体换色（`shower` / `poolTable` 档位早就这么做了）。
 */
const CERAMIC_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "ceramic-glossy",
    "亮白陶瓷",
    "ceramic",
    {
      applianceSoft: 0xfbfbf9,
      furnitureLight: 0xfbfbf9,
      furniture: 0xf0f0ec,
    },
    sanitaryCombo({
      body: { surface: "ceramic", color: 0xf7f7f4 },
      top: { surface: "marble", color: 0xf2f1ed },
      frame: { surface: "wood", color: 0xc9a67c },
      door: { surface: "wood", color: 0xd4b48c },
    }),
  ),
  definePreset(
    "ceramic-matte",
    "哑光石白",
    "ceramic",
    {
      applianceSoft: 0xedebe4,
      furnitureLight: 0xedebe4,
      furniture: 0xdedbd2,
    },
    sanitaryCombo({
      body: { surface: "ceramic", color: 0xeceae2 },
      top: { surface: "stone", color: 0xdcd8cf },
      frame: { surface: "wood", color: 0xb09374 },
      door: { surface: "wood", color: 0xbea184 },
    }),
  ),
  definePreset(
    "ceramic-stone-grey",
    "岩灰",
    "stone",
    {
      applianceSoft: 0xc8c6c0,
      furnitureLight: 0xc8c6c0,
      furniture: 0xb6b4ae,
    },
    sanitaryCombo({

      body: { surface: "stone", color: 0xc2c0ba },
      top: { surface: "stone", color: 0xa9a8a3 },
      frame: { surface: "paint", color: 0x6f7276 },
      door: { surface: "paint", color: 0x7c8085 },
    }),
  ),
]);


/** 复用另一组的档位：换掉 id，配方原样带走。 */
function reusePresetInGroup(preset: MaterialStylePreset, id: string): MaterialStylePreset {
  return Object.freeze({ ...preset, id });
}

/** 台盆的台面档位：整张石材。 */
const BASIN_STONE_TOP_STYLES: readonly MaterialStylePreset[] = Object.freeze([

  definePreset(
    "basin-marble-white",
    "白色大理石台面",
    "marble",
    {
      countertop: 0xf2f1ed,
      applianceSoft: 0xfbfbf9,
      furniture: 0xf0f0ec,
    },
    sanitaryCombo({
      body: { surface: "ceramic", color: 0xfbfbf9 },
      sink: { surface: "ceramic", color: 0xf7f7f4 },
      top: STONE_SLAB_ON_WHITE,
      frame: { surface: "wood", color: 0xc9a67c },
    }),
  ),


  definePreset(
    "basin-marble-black",
    "黑色大理石台面",
    "stone",
    {
      countertop: 0x1e2023,
      applianceSoft: 0xfbfbf9,
      furniture: 0x2a2c30,
    },
    sanitaryCombo({
      body: { surface: "ceramic", color: 0xfbfbf9 },
      sink: { surface: "ceramic", color: 0xf7f7f4 },
      top: STONE_SLAB_ON_DARK,
      frame: { surface: "wood", color: 0x6b4a30 },
    }),
  ),
]);

/** 台盆档位组：洁具三档（换 id 复用）+ 两块石材台面。 */
const BASIN_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  ...CERAMIC_STYLES.map((preset) => reusePresetInGroup(preset, `basin-${preset.id}`)),
  ...BASIN_STONE_TOP_STYLES,
]);

const GLASS_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "glass-clear",
    "清玻",
    "glass",
    { glass: 0xdfeaec },
    glazingCombo({
      glass: { surface: "glass", color: 0xdfeaec },
      frame: { surface: "metal", color: 0xb4babf },
    }),
  ),
  definePreset(
    "glass-tinted",
    "茶玻",
    "glass",
    { glass: 0xc9b18c },
    glazingCombo({

      glass: { surface: "glass", color: 0xc9b18c },
      frame: { surface: "metal", color: 0xa08558 },
    }),
  ),
]);


const LAMP_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "lamp-warm-brass",
    "暖铜",
    "metal",
    {
      floorLampBody: 0x9c6b3f,
      appliance: 0xb8a48c,
      applianceSoft: 0xd8cdbe,
      applianceDark: 0x6b4a2e,
      furniture: 0xb8a48c,
      furnitureSoft: 0xd8cdbe,
    },
    applianceCombo({

      body: { surface: "metal", color: 0x9c6b3f },
      metal: { surface: "metal", color: 0x8a5c33 },
      trim: { surface: "metal", color: 0x8a5c33 },

      base: { surface: "metal", color: 0x2e2e30 },
      lit: { surface: "fabric", color: 0xf0e6d4 },
    }),
  ),
  definePreset(
    "lamp-black",
    "哑黑",
    "metal",
    {
      floorLampBody: 0x2e2e30,
      appliance: 0x3c3f44,
      applianceSoft: 0x565a61,
      applianceDark: 0x22252a,
      furniture: 0x3c3f44,
      furnitureSoft: 0x565a61,
    },
    applianceCombo({
      body: { surface: "metal", color: 0x2e2e30 },
      metal: { surface: "metal", color: 0x3c3f44 },
      trim: { surface: "metal", color: 0x3c3f44 },
      base: { surface: "metal", color: 0x22252a },
      lit: { surface: "fabric", color: 0xefe9dd },
    }),
  ),
  definePreset(
    "lamp-white",
    "瓷白",
    "paint",
    {
      floorLampBody: 0xe8e5df,
      appliance: 0xf3f1ec,
      applianceSoft: 0xfbfaf8,
      applianceDark: 0xc9c2b4,
      furniture: 0xf3f1ec,
      furnitureSoft: 0xfbfaf8,
    },
    applianceCombo({

      body: { surface: "paint", color: 0xf3f1ec },
      metal: { surface: "metal", color: 0xb4babf },
      trim: { surface: "metal", color: 0xb4babf },
      base: { surface: "paint", color: 0xe8e5df },
      lit: { surface: "fabric", color: 0xfbf8f2 },
    }),
  ),
  definePreset(
    "lamp-walnut",
    "胡桃木",
    "wood",
    {
      floorLampBody: 0x6b4526,
      appliance: 0x8a6238,
      applianceSoft: 0xa9885c,
      applianceDark: 0x4a3018,
      furniture: 0x8a6238,
      furnitureSoft: 0xa9885c,
    },
    applianceCombo({

      body: { surface: "wood", color: 0x6b4526 },
      metal: { surface: "metal", color: 0x9c6b3f },
      trim: { surface: "metal", color: 0x9c6b3f },
      base: { surface: "metal", color: 0x2e2e30 },
      lit: { surface: "fabric", color: 0xfaf2e4 },
    }),
  ),
]);

const DECOR_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "decor-fresh-green",
    "鲜绿",
    "foliage",
    {
      leafColor: 0x5d8c40,
      decorAccent: 0xc4a484,
      furnitureDark: 0x6b4a2e,
    },
    plantCombo({
      foliage: { surface: "foliage", color: 0x5d8c40 },
      pot: { surface: "ceramic", color: 0xc4a484 },
      flower: { surface: "paint", color: 0xe6a8bd },
    }),
  ),
  definePreset(
    "decor-olive",
    "橄榄绿",
    "foliage",
    {
      leafColor: 0x6f7a45,
      decorAccent: 0xb0a68c,
      furnitureDark: 0x5a5344,
    },
    plantCombo({
      foliage: { surface: "foliage", color: 0x6f7a45 },
      pot: { surface: "ceramic", color: 0xb0a68c },
      flower: { surface: "paint", color: 0xf2ead6 },
    }),
  ),
  definePreset(
    "decor-terra",
    "陶盆暖调",
    "foliage",
    {
      leafColor: 0x7a8c4a,
      decorAccent: 0xc07a52,
      furnitureDark: 0x8c5a3c,
    },
    plantCombo({
      foliage: { surface: "foliage", color: 0x7a8c4a },

      pot: { surface: "ceramic", color: 0xc07a52 },
      trunk: { surface: "wood", color: 0x8c5a3c },
      flower: { surface: "paint", color: 0xd98a63 },
    }),
  ),
]);

const RUG_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "rug-neutral",
    "中性米",
    "fabric",
    {
      joineryAccent: 0xe4d5c2,
      furnitureLight: 0xf3e7d8,
      furnitureDark: 0xb9a894,
    },
    rugCombo({ fabric: { surface: "fabric", color: 0xe4d5c2 } }),
  ),
  definePreset(
    "rug-grey",
    "素灰",
    "fabric",
    {
      joineryAccent: 0xc7c5bf,
      furnitureLight: 0xdedcd6,
      furnitureDark: 0x9c9a94,
    },
    rugCombo({ fabric: { surface: "fabric", color: 0xc7c5bf } }),
  ),
  definePreset(
    "rug-pattern",
    "花色织纹",
    "fabric",
    {
      joineryAccent: 0xb98d73,
      furnitureLight: 0xd8b49c,
      furnitureDark: 0x8c5f45,
    },
    rugCombo({
      fabric: { surface: "fabric", color: 0xd8b49c },

      trim: { surface: "fabric", color: 0x7a4a34 },
    }),
  ),
]);

const CURTAIN_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "curtain-warm-white",
    "暖米白",
    "fabric",
    {
      rollerCurtain: 0xf0e8dc,
      furnitureDark: 0x6b4a2e,
      furnitureSoft: 0xe4d5c2,
    },
    curtainCombo({ fabric: { surface: "fabric", color: 0xf0e8dc } }),
  ),
  definePreset(
    "curtain-linen",
    "亚麻灰",
    "fabric",
    {
      rollerCurtain: 0xd5d2ca,
      furnitureDark: 0x5a5344,
      furnitureSoft: 0xc2bfb7,
    },
    curtainCombo({ fabric: { surface: "fabric", color: 0xd5d2ca } }),
  ),
  definePreset(
    "curtain-deep-green",
    "深墨绿",
    "fabric",
    {
      rollerCurtain: 0x4a5c4a,
      furnitureDark: 0x2e3a2e,
      furnitureSoft: 0x6b7d6b,
    },
    curtainCombo({
      fabric: { surface: "fabric", color: 0x4a5c4a },

      metal: { surface: "metal", color: 0xb4babf },
    }),
  ),
]);

const AQUARIUM_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "aquarium-black-frame",
    "黑框玻璃",
    "lacquer",
    {
      furnitureDark: 0x2b2b2e,
      furniture: 0x3a3a3c,
    },
    aquariumCombo({
      body: { surface: "lacquer", color: 0x2f3237 },

      frame: { surface: "lacquer", color: 0x1e2126 },
    }),
  ),
  definePreset(
    "aquarium-white-frame",
    "白框玻璃",
    "paint",
    {
      furnitureDark: 0xe4e2dc,
      furniture: 0xf0efec,
    },
    aquariumCombo({
      body: { surface: "paint", color: 0xf0efec },
      frame: { surface: "paint", color: 0xd8d5cd },
    }),
  ),
  definePreset(
    "aquarium-wood-frame",
    "原木框",
    "wood",
    {
      furnitureDark: 0x6b4526,
      furniture: 0xc49a6c,
    },
    aquariumCombo({
      body: { surface: "wood", color: 0xc49a6c },

      frame: { surface: "wood", color: 0x6b4526 },
      top: { surface: "wood", color: 0x8f6a45 },
    }),
  ),
]);

const PIANO_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "piano-black",
    "亮光黑",
    "lacquer",
    {
      furniture: 0x1e1e20,
      furnitureDark: 0x111113,
      furnitureSoft: 0x3a3a3c,
    },
    pianoCombo({
      body: { surface: "lacquer", color: 0x1a1a1c },
      top: { surface: "lacquer", color: 0x24242a },
      panel: { surface: "lacquer", color: 0x1e1e20 },
      leg: { surface: "lacquer", color: 0x1a1a1c },
      metal: { surface: "metal", color: 0x9aa1a8 },

    }),
  ),
  definePreset(
    "piano-white",
    "亮光白",
    "lacquer",
    {
      furniture: 0xf2f1ed,
      furnitureDark: 0xd8d6d0,
      furnitureSoft: 0xfbfaf8,
    },
    pianoCombo({
      body: { surface: "lacquer", color: 0xf2f1ed },
      top: { surface: "lacquer", color: 0xfbfaf8 },
      panel: { surface: "lacquer", color: 0xefece6 },
      leg: { surface: "lacquer", color: 0xf2f1ed },
      metal: { surface: "metal", color: 0xb4babf },

    }),
  ),
  definePreset(
    "piano-wood",
    "暖木色",
    "wood",
    {
      wood: 0x6b4526,
      woodLight: 0x855c36,
      woodDark: 0x4a2e1a,
      furniture: 0x6b4526,
      furnitureDark: 0x4a2e1a,
      furnitureSoft: 0x855c36,
    },
    pianoCombo({
      body: { surface: "wood", color: 0x6b4526 },
      top: { surface: "wood", color: 0x7a5230 },
      panel: { surface: "wood", color: 0x5f3d21 },
      leg: { surface: "wood", color: 0x6b4526 },

      metal: { surface: "metal", color: 0xb08d5a },

    }),
  ),
]);

const SCREEN_STYLES: readonly MaterialStylePreset[] = Object.freeze([

  definePreset(
    "screen-black",
    "曜黑",
    "lacquer",
    {
      appliance: 0x2a2c30,
      applianceSoft: 0x3f4247,
      applianceDark: 0x15171a,
    },
    applianceCombo({
      body: { surface: "lacquer", color: 0x2a2c30 },
      screen: { surface: "lacquer", color: 0x15171a },
      metal: { surface: "metal", color: 0x3f4247 },
    }),
  ),
  definePreset(
    "screen-silver",
    "银灰",
    "metal",
    {
      appliance: 0xb9bec4,
      applianceSoft: 0xc6cbd1,
      applianceDark: 0x6d747b,
    },
    applianceCombo({
      body: { surface: "metal", color: 0xb9bec4 },
      screen: { surface: "lacquer", color: 0x15171a },
      metal: { surface: "metal", color: 0x8c8f94 },
    }),
  ),
]);


const POOL_TABLE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "pool-cloth-green",
    "经典绿绒",
    "fabric",
    { wood: 0x6b4526, woodLight: 0x855c36, woodDark: 0x4a2e1a },
    poolTableCombo({
      frame: { surface: "wood", color: 0x6b4526 },
      fabric: { surface: "fabric", color: 0x2f6b3a },
    }),
  ),
  definePreset(
    "pool-cloth-blue",
    "湖蓝绒",
    "fabric",
    { wood: 0x6b4526, woodLight: 0x855c36, woodDark: 0x4a2e1a },
    poolTableCombo({
      frame: { surface: "wood", color: 0x6b4526 },
      fabric: { surface: "fabric", color: 0x2c5a7a },
    }),
  ),
  definePreset(
    "pool-cloth-red",
    "酒红绒",
    "fabric",
    { wood: 0x5a3a22, woodLight: 0x74492b, woodDark: 0x3d2716 },
    poolTableCombo({
      frame: { surface: "wood", color: 0x5a3a22 },
      fabric: { surface: "fabric", color: 0x7a2f34 },
    }),
  ),
  definePreset(
    "pool-cloth-black",
    "石墨黑",
    "lacquer",
    { wood: 0x2e2e30, woodLight: 0x45454a, woodDark: 0x1f1f21 },
    poolTableCombo({
      frame: { surface: "lacquer", color: 0x2e2e30 },
      fabric: { surface: "fabric", color: 0x2b2b30 },
    }),
  ),
]);


const SHOWER_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "shower-chrome",
    "铬色清玻",
    "metal",
    { showerMetal: 0xc8ccd0 },
    showerCombo({
      body: { surface: "metal", color: 0xc8ccd0 },
      metal: { surface: "metal", color: 0xb4babf },
    }),
  ),
  definePreset(
    "shower-black",
    "哑黑",
    "metal",
    { showerMetal: 0x2e3033 },
    showerCombo({
      body: { surface: "metal", color: 0x2e3033 },
      metal: { surface: "metal", color: 0x3c4045 },
    }),
  ),
  definePreset(
    "shower-gold",
    "拉丝金",
    "metal",
    { showerMetal: 0xb08d5a },
    showerCombo({
      body: { surface: "metal", color: 0xb08d5a },
      metal: { surface: "metal", color: 0x8a6a3c },
    }),
  ),
  definePreset(
    "shower-white",
    "纯白",
    "paint",
    { showerMetal: 0xe8e5df },
    showerCombo({
      body: { surface: "paint", color: 0xf2f1ed },
      metal: { surface: "metal", color: 0xb4babf },
    }),
  ),
]);


const TEA_TABLE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "tea-natural",
    "原木茶台",
    "wood",
    { wood: 0xc49a6c, woodLight: 0xd8b98f, woodDark: 0x9c6b3f },
    teaTableCombo({
      frame: { surface: "wood", color: 0xc49a6c },
      panel: { surface: "wood", color: 0xd8b98f },
      recess: { surface: "wood", color: 0x8c6b44 },
      ceramic: { surface: "ceramic", color: 0xece7de },
      accent: { surface: "wood", color: 0xb08a5e },
    }),
  ),
  definePreset(
    "tea-walnut",
    "胡桃木茶台",
    "wood",
    { wood: 0x6b4526, woodLight: 0x855c36, woodDark: 0x4a2e1a },
    teaTableCombo({
      frame: { surface: "wood", color: 0x6b4526 },
      panel: { surface: "wood", color: 0x855c36 },
      recess: { surface: "wood", color: 0x43301c },
      ceramic: { surface: "ceramic", color: 0xe6ddcf },
      accent: { surface: "wood", color: 0x9c6b3f },
    }),
  ),
  definePreset(
    "tea-white-porcelain",
    "乌金白瓷",
    "ceramic",
    { wood: 0x2b2b2e, woodLight: 0x3a3a3c, woodDark: 0x1a1a1c },
    teaTableCombo({
      frame: { surface: "lacquer", color: 0x2b2b2e },
      panel: { surface: "lacquer", color: 0x3a3a3c },
      recess: { surface: "lacquer", color: 0x16181a },
      ceramic: { surface: "ceramic", color: 0xf7f4ee },
      accent: { surface: "metal", color: 0x9c9a94 },
    }),
  ),
  definePreset(
    "tea-dark-jade",
    "黑檀青瓷",
    "ceramic",
    { wood: 0x2a2622, woodLight: 0x3a352e, woodDark: 0x16140f },
    teaTableCombo({
      frame: { surface: "wood", color: 0x2a2622 },
      panel: { surface: "wood", color: 0x3a352e },
      recess: { surface: "wood", color: 0x16140f },
      ceramic: { surface: "ceramic", color: 0x9fb8ab },
      accent: { surface: "ceramic", color: 0x6f8a7c },
    }),
  ),
]);


const ORNAMENT_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "ornament-white",
    "素白纸感",
    "paint",
    { furniture: 0xf2efe8, furnitureLight: 0xfbfaf7, furnitureDark: 0xd8d4cb, leafColor: 0x5f8c4d },
    ornamentCombo({
      base: { surface: "paint", color: 0xf2efe8 },
      light: { surface: "paint", color: 0xfbfaf7 },
      dark: { surface: "paint", color: 0xd8d4cb },
      accent: { surface: "ceramic", color: 0xc7c2b8 },
      leaf: { surface: "foliage", color: 0x5f8c4d },
    }),
  ),
  definePreset(
    "ornament-black",
    "墨黑陶",
    "ceramic",
    { furniture: 0x2e2e30, furnitureLight: 0x45454a, furnitureDark: 0x1a1a1c, leafColor: 0x4a6b3f },
    ornamentCombo({
      base: { surface: "ceramic", color: 0x2e2e30 },
      light: { surface: "ceramic", color: 0x45454a },
      dark: { surface: "ceramic", color: 0x1a1a1c },
      accent: { surface: "metal", color: 0x8c8f94 },
      leaf: { surface: "foliage", color: 0x4a6b3f },
    }),
  ),
  definePreset(
    "ornament-terra",
    "暖木陶",
    "ceramic",
    {
      furniture: 0xc07a52,
      furnitureLight: 0xd99a72,
      furnitureDark: 0x8c5236,
      leafColor: 0x6f7a45,
      decorAccent: 0xb0a68c,
    },
    ornamentCombo({
      base: { surface: "ceramic", color: 0xc07a52 },
      light: { surface: "ceramic", color: 0xd99a72 },
      dark: { surface: "ceramic", color: 0x8c5236 },
      accent: { surface: "ceramic", color: 0xb0a68c },
      leaf: { surface: "foliage", color: 0x6f7a45 },
    }),
  ),
  definePreset(
    "ornament-celadon",
    "青瓷",
    "ceramic",
    { furniture: 0x9fb8ab, furnitureLight: 0xc2d4c9, furnitureDark: 0x6f8a7c, leafColor: 0x7a8c4a },
    ornamentCombo({
      base: { surface: "ceramic", color: 0x9fb8ab },
      light: { surface: "ceramic", color: 0xc2d4c9 },
      dark: { surface: "ceramic", color: 0x6f8a7c },
      accent: { surface: "ceramic", color: 0xe6ddcf },
      leaf: { surface: "foliage", color: 0x7a8c4a },
    }),
  ),
]);


/** 门：门框 / 门扇 / 玻璃 / 五金 / 卷帘 / 帘片 / 装饰线（角色见 `MODEL_SLOT_ROLES.door`）。 */
function doorCombo(roles: Record<string, Recipe>): Record<string, Recipe> {
  return roles;
}

/** 门玻璃：与主题玻璃同一档通透度（面板与画面同源，别在这里另编一个数值）。 */
const DOOR_GLASS_RECIPE: Recipe = Object.freeze({
  surface: "glass",
  color: "glass",
  transparent: true,
  opacity: 0.34,
  depthWrite: false,
});

const DOOR_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "door-white-lacquer",
    "白色烤漆门",
    "lacquer",
    {
      doorFrame: 0xf5f3ef,
      doorLeaf: 0xf7f5f1,
      furnitureDark: 0xcdc8c0,
    },
    doorCombo({
      frame: { surface: "lacquer", color: 0xf5f3ef },
      door: { surface: "lacquer", color: 0xf7f5f1 },
      metal: { surface: "metal", color: 0xb4babf },


      glass: DOOR_GLASS_RECIPE,


      shutter: { surface: "fabric", color: 0xe9e5df },
      slat: { surface: "metal", color: 0xd3cfc8 },

      trim: { surface: "lacquer", color: 0xdcd8d2 },
    }),
  ),
  definePreset(
    "door-natural-oak",
    "原木门",
    "wood",
    {
      doorFrame: 0xc49a6c,
      doorLeaf: 0xd8b98f,
      furnitureDark: 0x9c6b3f,
    },
    doorCombo({
      frame: { surface: "wood", color: 0xc49a6c },
      door: { surface: "wood", color: 0xd8b98f },
      metal: { surface: "metal", color: 0x8c8f94 },
      glass: DOOR_GLASS_RECIPE,
      shutter: { surface: "fabric", color: 0xdcc7a6 },
      slat: { surface: "metal", color: 0xb39a78 },
      trim: { surface: "wood", color: 0xb98d5f },
    }),
  ),
  definePreset(
    "door-walnut",
    "胡桃木门",
    "wood",
    {
      doorFrame: 0x6b4526,
      doorLeaf: 0x855c36,
      furnitureDark: 0x4a2e1a,
    },
    doorCombo({
      frame: { surface: "wood", color: 0x6b4526 },
      door: { surface: "wood", color: 0x855c36 },
      metal: { surface: "metal", color: 0x3a3a3c },
      glass: DOOR_GLASS_RECIPE,
      shutter: { surface: "fabric", color: 0x7c5734 },
      slat: { surface: "metal", color: 0x5c3d22 },
      trim: { surface: "wood", color: 0x53381f },
    }),
  ),
  definePreset(
    "door-dark-metal",
    "深灰金属门",
    "metal",
    {
      doorFrame: 0x3a3a3c,
      doorLeaf: 0x46464a,
      furnitureDark: 0x242426,
    },
    doorCombo({
      frame: { surface: "metal", color: 0x3a3a3c, roughness: 0.42, metalness: 0.45 },
      door: { surface: "lacquer", color: 0x46464a },
      metal: { surface: "metal", color: 0x2e2e30 },
      glass: DOOR_GLASS_RECIPE,
      shutter: { surface: "metal", color: 0x3e3e42 },
      slat: { surface: "metal", color: 0x2a2a2c },
      trim: { surface: "metal", color: 0x35353a },
    }),
  ),
  definePreset(
    "door-black-frame-glass",
    "黑框玻璃门",
    "glass",
    {
      doorFrame: 0x2a2c30,
      doorLeaf: 0x2a2c30,
      glass: 0xbcd6e0,
      furnitureDark: 0x2e2e30,
    },
    doorCombo({
      frame: { surface: "metal", color: 0x2a2c30, roughness: 0.4, metalness: 0.5 },

      door: { surface: "metal", color: 0x2a2c30, roughness: 0.4, metalness: 0.5 },
      glass: DOOR_GLASS_RECIPE,
      metal: { surface: "metal", color: 0x6d747b },
      shutter: { surface: "metal", color: 0x2a2c30 },
      slat: { surface: "metal", color: 0x3a3d42 },
      trim: { surface: "metal", color: 0x4a4e54 },
    }),
  ),
]);


/* ------------------------------------------------------------------ *
 * 新增品类档位：宠物 / 儿童 / 影音 / 健身 / 器皿 / 庭院
 *
 * 这些品类没有既有档位（面板上「材质风格」是空的），且它们的角色名（`petPad` /
 * `playBody` / `sportFrame` / `basket` / `leaf`…）也不在既有档位表的词表里。这里按**真实语义**
 * 给每组 4 个档位，并把该品类出现过的角色**显式写全**，保证「档位 → 槽位」交集非空（不空转）。
 * ------------------------------------------------------------------ */

/** 宠物用品：主体 / 框架 / 底座 / 软垫 / 食盆 / 猫砂 / 抓柱 / 剑麻绳。 */
function petRoleRecipes(colors: {
  body: number;
  frame: number;
  pad: number;
  bowl: number;
  litter: number;
  rope: number;
}): Record<string, Recipe> {
  return {
    petBody: { surface: "paint", color: colors.body },
    body: { surface: "paint", color: colors.body },
    soft: { surface: "fabric", color: colors.pad },
    light: { surface: "paint", color: 0xefe9de },
    panel: { surface: "wood", color: colors.frame },
    petFrame: { surface: "wood", color: colors.frame },
    frame: { surface: "wood", color: colors.frame },
    rackWood: { surface: "wood", color: colors.frame },
    petBase: { surface: "wood", color: colors.frame },
    base: { surface: "wood", color: colors.frame },
    trim: { surface: "wood", color: colors.frame },
    dark: { surface: "wood", color: colors.rope },
    petPad: { surface: "fabric", color: colors.pad },
    scratchingPost: { surface: "fabric", color: colors.pad },
    rope: { surface: "fabric", color: colors.rope },
    petBowl: { surface: "ceramic", color: colors.bowl },
    container: { surface: "ceramic", color: colors.bowl },
    litter: { surface: "stone", color: colors.litter },
    rack: { surface: "metal", color: 0xb6bbbf },
    water: { surface: "glass", color: 0x8fbdd0, transparent: true, opacity: 0.45, depthWrite: false },
    glass: { surface: "glass", color: 0xcfe0e6, transparent: true, opacity: 0.4, depthWrite: false },
  };
}

const PET_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "pet-oak",
    "原木米白",
    "wood",
    { furniture: 0xb08a5e, furnitureLight: 0xe4ded2, furnitureDark: 0x8c6b44 },
    petRoleRecipes({
      body: 0xe4ded2,
      frame: 0xb08a5e,
      pad: 0xb7bfae,
      bowl: 0xeeeae2,
      litter: 0xdcd6c8,
      rope: 0xc3ad86,
    }),
  ),
  definePreset(
    "pet-walnut",
    "胡桃木灰",
    "wood",
    { furniture: 0x6b4526, furnitureLight: 0xd8d2c6, furnitureDark: 0x4a2e1a },
    petRoleRecipes({
      body: 0xd8d2c6,
      frame: 0x6b4526,
      pad: 0x9aa39b,
      bowl: 0xe6e3dc,
      litter: 0xd2cbbd,
      rope: 0xa9855c,
    }),
  ),
  definePreset(
    "pet-grey",
    "雾灰布艺",
    "fabric",
    { furniture: 0x9aa3a6, furnitureLight: 0xc9ccce, furnitureDark: 0x6f7679 },
    petRoleRecipes({
      body: 0xc9ccce,
      frame: 0x7b8184,
      pad: 0x9aa3a6,
      bowl: 0xdcdcd8,
      litter: 0xc8c4bb,
      rope: 0xb0a998,
    }),
  ),
  definePreset(
    "pet-cream",
    "奶油白",
    "paint",
    { furniture: 0xe8e2d6, furnitureLight: 0xf5f1ea, furnitureDark: 0xc3bcaf },
    petRoleRecipes({
      body: 0xf2efe8,
      frame: 0xe8e2d6,
      pad: 0xe3dcc9,
      bowl: 0xf3f1ec,
      litter: 0xded7c8,
      rope: 0xd0bb92,
    }),
  ),
]);

/** 儿童家具 / 玩具：玩具主体 / 点缀 / 球 / 帐篷布 / 层板 / 架体。 */
function kidsRoleRecipes(colors: {
  body: number;
  accent: number;
  ball: number;
  tent: number;
  wood: number;
  shelf: number;
}): Record<string, Recipe> {
  return {
    playBody: { surface: "paint", color: colors.body },
    body: { surface: "paint", color: colors.body },
    base: { surface: "paint", color: colors.wood },
    playAccent: { surface: "paint", color: colors.accent },
    accent: { surface: "paint", color: colors.accent },
    playBall: { surface: "paint", color: colors.ball },
    tentFabric: { surface: "fabric", color: colors.tent },
    soft: { surface: "fabric", color: colors.tent },
    shelf: { surface: "wood", color: colors.shelf },
    rackWood: { surface: "wood", color: colors.wood },
    grip: { surface: "metal", color: 0xb6bbbf },
    frame: { surface: "wood", color: colors.wood },
    glass: { surface: "glass", color: 0xcfe0e6, transparent: true, opacity: 0.4, depthWrite: false },
  };
}

const KIDS_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "kids-pastel",
    "马卡龙",
    "paint",
    { furniture: 0xa9c9d8, furnitureLight: 0xe6eef2, furnitureDark: 0x7fa3b5 },
    kidsRoleRecipes({
      body: 0xa9c9d8,
      accent: 0xe0a36b,
      ball: 0xd06e6e,
      tent: 0xc9d6c3,
      wood: 0xd9bf9a,
      shelf: 0xc8ab84,
    }),
  ),
  definePreset(
    "kids-natural",
    "原木本色",
    "wood",
    { furniture: 0xc49a6c, furnitureLight: 0xe3d4be, furnitureDark: 0x9c6b3f },
    kidsRoleRecipes({
      body: 0xe3d4be,
      accent: 0xc98f52,
      ball: 0xb9855c,
      tent: 0xd8cbb0,
      wood: 0xc49a6c,
      shelf: 0xb08a5e,
    }),
  ),
  definePreset(
    "kids-ocean",
    "海洋蓝",
    "paint",
    { furniture: 0x6f9fc4, furnitureLight: 0xc9deee, furnitureDark: 0x4a7396 },
    kidsRoleRecipes({
      body: 0x6f9fc4,
      accent: 0xf2c14e,
      ball: 0xe4d9c3,
      tent: 0x9dc0d8,
      wood: 0xcbb894,
      shelf: 0xb8a37c,
    }),
  ),
  definePreset(
    "kids-cream",
    "奶油白",
    "paint",
    { furniture: 0xf2efe8, furnitureLight: 0xfbfaf7, furnitureDark: 0xd8d4cb },
    kidsRoleRecipes({
      body: 0xf2efe8,
      accent: 0xe0a36b,
      /** 奶油白：球池的球单独给「奶粉 → 藕粉」一色，别和「马卡龙」的同一颗红球撞车（否则两档整机同色）。 */
      ball: 0xd06e6e,
      tent: 0xe9e2d3,
      wood: 0xdcc9ab,
      shelf: 0xcbb894,
    }),
  ),
]);

/** 影音 / 乐器 / 数码：外壳 / 面板 / 屏 / 边框 / 支架 / 格栅 / 镜头 / 唱盘 / 发光件。 */
function mediaRoleRecipes(colors: {
  shell: number;
  panel: number;
  frame: number;
  screen: number;
  accent: number;
}): Record<string, Recipe> {
  return {
    shell: { surface: "lacquer", color: colors.shell },
    body: { surface: "lacquer", color: colors.shell },
    panel: { surface: "lacquer", color: colors.panel },
    dark: { surface: "lacquer", color: colors.panel },
    bezel: { surface: "lacquer", color: colors.panel },
    frame: { surface: "wood", color: colors.frame },
    stand: { surface: "metal", color: colors.accent },
    base: { surface: "lacquer", color: colors.panel },
    trim: { surface: "metal", color: colors.accent },
    handle: { surface: "metal", color: colors.accent },
    grille: { surface: "metal", color: colors.accent },
    metal: { surface: "metal", color: colors.accent },
    rackWood: { surface: "wood", color: colors.frame },
    basket: { surface: "wood", color: colors.frame },
    lens: { surface: "glass", color: 0x1f2933 },
    platter: { surface: "lacquer", color: colors.panel },
    screen: { surface: "lacquer", color: colors.screen },
    glow: { surface: "lacquer", color: 0x7fd1e0, emissive: 0x7fd1e0, emissiveIntensity: 0.5 },
  };
}

const MEDIA_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "media-black",
    "黑曜石",
    "lacquer",
    { appliance: 0x2b2f34, applianceSoft: 0x3a3f45, applianceDark: 0x1c1f23 },
    mediaRoleRecipes({
      shell: 0x2b2f34,
      panel: 0x1c1f23,
      frame: 0x30343a,
      screen: 0x0f1114,
      accent: 0x6d747b,
    }),
  ),
  definePreset(
    "media-walnut",
    "胡桃木",
    "wood",
    { appliance: 0x3a3330, applianceSoft: 0x6b4526, applianceDark: 0x241f1c },
    mediaRoleRecipes({
      shell: 0x3a3330,
      panel: 0x2a2422,
      frame: 0x6b4526,
      screen: 0x0f1114,
      accent: 0xb08d5a,
    }),
  ),
  definePreset(
    "media-white",
    "象牙白",
    "lacquer",
    { appliance: 0xe9e6df, applianceSoft: 0xf4f2ec, applianceDark: 0xc9c5bc },
    mediaRoleRecipes({
      shell: 0xe9e6df,
      panel: 0xd8d4cb,
      frame: 0xdcc9ab,
      screen: 0x14171a,
      accent: 0xb6bbbf,
    }),
  ),
  definePreset(
    "media-silver",
    "银灰",
    "metal",
    { appliance: 0x9aa1a8, applianceSoft: 0xb6bbbf, applianceDark: 0x5b6167 },
    mediaRoleRecipes({
      shell: 0x9aa1a8,
      panel: 0x5b6167,
      frame: 0x6f767b,
      screen: 0x121518,
      accent: 0xc2c7cc,
    }),
  ),
]);

/** 健身器械：框架 / 配重 / 握把 / 坐垫 / 包体 / 木件 / 场地。 */
function fitnessRoleRecipes(colors: {
  frame: number;
  weight: number;
  grip: number;
  pad: number;
  wood: number;
  court: number;
}): Record<string, Recipe> {
  return {
    sportFrame: { surface: "metal", color: colors.frame },
    frame: { surface: "metal", color: colors.frame },
    base: { surface: "metal", color: colors.frame },
    body: { surface: "metal", color: colors.frame },
    dark: { surface: "metal", color: colors.weight },
    weight: { surface: "metal", color: colors.weight },
    grip: { surface: "leather", color: colors.grip },
    pad: { surface: "fabric", color: colors.pad },
    surface: { surface: "fabric", color: colors.pad },
    soft: { surface: "fabric", color: colors.pad },
    trim: { surface: "metal", color: colors.grip },
    bagBody: { surface: "leather", color: colors.grip },
    wood: { surface: "wood", color: colors.wood },
    rackWood: { surface: "wood", color: colors.wood },
    courtFelt: { surface: "fabric", color: colors.court },
  };
}

const FITNESS_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "fitness-carbon",
    "碳黑",
    "metal",
    { appliance: 0x2f3338, applianceSoft: 0x53585e, applianceDark: 0x1f2226 },
    fitnessRoleRecipes({
      frame: 0x2f3338,
      weight: 0x53585e,
      grip: 0x1f2226,
      pad: 0x3a3f45,
      wood: 0xa9855c,
      court: 0x2f6f4f,
    }),
  ),
  definePreset(
    "fitness-silver",
    "银灰",
    "metal",
    { appliance: 0x9aa1a8, applianceSoft: 0xc2c7cc, applianceDark: 0x5b6167 },
    fitnessRoleRecipes({
      frame: 0x9aa1a8,
      weight: 0x5b6167,
      grip: 0x3a3d42,
      pad: 0x8d949a,
      wood: 0xb08a5e,
      court: 0x3f7f5c,
    }),
  ),
  definePreset(
    "fitness-oak",
    "原木黑",
    "wood",
    { appliance: 0x2b2f34, applianceSoft: 0xc49a6c, applianceDark: 0x1c1f23 },
    fitnessRoleRecipes({
      frame: 0x2b2f34,
      weight: 0x3a3f45,
      grip: 0x23262b,
      pad: 0xc49a6c,
      wood: 0xc49a6c,
      court: 0x2f6f4f,
    }),
  ),
  definePreset(
    "fitness-sand",
    "沙白",
    "paint",
    { appliance: 0xdcd6c8, applianceSoft: 0xefe9de, applianceDark: 0x9d968a },
    fitnessRoleRecipes({
      frame: 0xdcd6c8,
      weight: 0x9d968a,
      grip: 0x6f6a60,
      pad: 0xc7b48f,
      wood: 0xc49a6c,
      court: 0x4f8a63,
    }),
  ),
]);

/** 器皿 / 收纳：篮筐 / 架体 / 木架 / 砧板 / 容器 / 盖 / 杯 / 壶 / 五金。 */
function tablewareRoleRecipes(colors: {
  ceramic: number;
  wood: number;
  basket: number;
  metal: number;
}): Record<string, Recipe> {
  return {
    mug: { surface: "ceramic", color: colors.ceramic },
    plate: { surface: "ceramic", color: colors.ceramic },
    potBody: { surface: "ceramic", color: colors.ceramic },
    container: { surface: "ceramic", color: colors.ceramic },
    containerLid: { surface: "lacquer", color: colors.ceramic },
    base: { surface: "ceramic", color: colors.ceramic },
    board: { surface: "wood", color: colors.wood },
    rackWood: { surface: "wood", color: colors.wood },
    wood: { surface: "wood", color: colors.wood },
    basket: { surface: "wood", color: colors.basket },
    trim: { surface: "metal", color: colors.metal },
    handle: { surface: "metal", color: colors.metal },
    rack: { surface: "metal", color: colors.metal },
    metal: { surface: "metal", color: colors.metal },
    window: { surface: "glass", color: 0xcfe0e6, transparent: true, opacity: 0.4, depthWrite: false },
  };
}

const TABLEWARE_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "tableware-white",
    "白瓷原木",
    "ceramic",
    { applianceSoft: 0xe7e2d6, wood: 0xc9a878, decorAccent: 0xc0975e },
    tablewareRoleRecipes({ ceramic: 0xeae6dc, wood: 0xc9a878, basket: 0xc0975e, metal: 0xb6bbbf }),
  ),
  definePreset(
    "tableware-oak",
    "浅橡木",
    "wood",
    { applianceSoft: 0xf0ece4, wood: 0xd0ab7c, decorAccent: 0xa9855c },
    tablewareRoleRecipes({ ceramic: 0xf0ece4, wood: 0xd0ab7c, basket: 0xa9855c, metal: 0xb0a894 }),
  ),
  definePreset(
    "tableware-bamboo",
    "竹编",
    "wood",
    { applianceSoft: 0xe4dcc6, wood: 0xc2b184, decorAccent: 0xb09b6a },
    tablewareRoleRecipes({ ceramic: 0xe9e3d4, wood: 0xc2b184, basket: 0xb09b6a, metal: 0xb8ae94 }),
  ),
  definePreset(
    "tableware-steel",
    "不锈钢",
    "metal",
    { applianceSoft: 0xdcdcd8, wood: 0x8d9298, decorAccent: 0x9aa1a8 },
    tablewareRoleRecipes({ ceramic: 0xdcdcd8, wood: 0x8d9298, basket: 0xb6bbbf, metal: 0xc2c7cc }),
  ),
]);

/** 庭院：铺装 / 浅石 / 深色木石 / 植被 / 水面 / 花色。 */
function gardenRoleRecipes(colors: {
  base: number;
  light: number;
  dark: number;
  leaf: number;
  water: number;
  accent: number;
}): Record<string, Recipe> {
  return {
    base: { surface: "stone", color: colors.base },
    planter: { surface: "ceramic", color: colors.dark },
    light: { surface: "stone", color: colors.light },
    stone: { surface: "stone", color: colors.light },
    dark: { surface: "wood", color: colors.dark },
    wood: { surface: "wood", color: colors.dark },
    leaf: { surface: "foliage", color: colors.leaf },
    foliage: { surface: "foliage", color: colors.leaf },
    grassTuft: { surface: "foliage", color: colors.leaf },
    soil: { surface: "stone", color: 0x3b3128 },
    water: { surface: "glass", color: colors.water, transparent: true, opacity: 0.45, depthWrite: false },
    accent: { surface: "foliage", color: colors.accent },
    flower: { surface: "foliage", color: colors.accent },
    glass: { surface: "glass", color: colors.water, transparent: true, opacity: 0.42, depthWrite: false },
  };
}

const GARDEN_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  definePreset(
    "garden-natural",
    "常绿庭园",
    "stone",
    { ground: 0x9a9484, leafColor: 0x4f7a3d, decorAccent: 0xd08a9a },
    gardenRoleRecipes({
      base: 0x9a9484,
      light: 0xc8c2b4,
      dark: 0x4d463a,
      leaf: 0x4f7a3d,
      water: 0x4f8ea8,
      accent: 0xd08a9a,
    }),
  ),
  definePreset(
    "garden-olive",
    "橄榄灰绿",
    "stone",
    { ground: 0x8f9083, leafColor: 0x647a3c, decorAccent: 0xc9a05a },
    gardenRoleRecipes({
      base: 0x8f9083,
      light: 0xbcc0b0,
      dark: 0x45483c,
      leaf: 0x647a3c,
      water: 0x54819a,
      accent: 0xc9a05a,
    }),
  ),
  definePreset(
    "garden-autumn",
    "秋色",
    "stone",
    { ground: 0xa2907a, leafColor: 0x8a7a2e, decorAccent: 0xc06a3a },
    gardenRoleRecipes({
      base: 0xa2907a,
      light: 0xd0bfa4,
      dark: 0x51412f,
      leaf: 0x8a7a2e,
      water: 0x4a7f9c,
      accent: 0xc06a3a,
    }),
  ),
  definePreset(
    "garden-stone",
    "素石庭园",
    "stone",
    { ground: 0xb3ada0, leafColor: 0x6b8a52, decorAccent: 0xc7b48f },
    gardenRoleRecipes({
      base: 0xb3ada0,
      light: 0xd9d4c9,
      dark: 0x6b665c,
      leaf: 0x6b8a52,
      water: 0x7fb3c8,
      accent: 0xc7b48f,
    }),
  ),
]);


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
});

/** 逐模型的档位组：参考实现里按类型单独指定过的那些，这里逐一登记（空串 = 明确不给档位：结构件 / 车辆 / 壁画 / 饰面墙等由专用收尾接管颜色）。 */
const PRESET_GROUP_BY_MODEL_TYPE: Readonly<Record<string, string>> = Object.freeze({
  coffeetable: "marbleTable",
  squarecoffeetable: "woodwork",


  kitchenisland: "kitchen",
  kitchenbase: "kitchen",
  kitchensink: "kitchen",
  kitchencooktop: "kitchen",
  glasspartition: "glass",
  glasscabinet: "joinery",
  tv: "screen",
  tv_standard: "screen",
  tv_tabletop: "screen",
  tv_mobile: "screen",
  screenpanel: "screen",
  ricecooker: "device",
  airoutlet: "device",
  tea_bar_machine: "device",
  pipelinewaterpurifier: "steelAppliance",
  /** 「矩形双出水」款式与原款同为不锈钢家电，沿用同一预设，不新造材质族。 */
  "rectangular-pipeline-dispenser": "steelAppliance",
  piano: "piano",
  aquarium: "aquarium",


  "pool-table": "poolTable",
  shower: "shower",
  "tea-table-set": "teaTable",

  basin: "basin",
  /**
   * 台面的档位组：**直接挂台盆那一组**（不是「换 id 复用」）。
   *
   * 台面这件素材的材质就是台盆的那张台面板（`light` 槽位 → 角色 `rim` → `furniture` 色号），
   * 所以它必须和台盆**共用同一份档位注册表**，而不是拿一份复制品：
   *  · 档位 id 同一套 → 台盆上存的 `basin-marble-white` 在台面上**同样合法**
   *    （复制风格 / 应用到同类物件 / 场景存档都不会被 `normalizeMaterialStyle` 悄悄打回 `auto`，
   *    那正是「台面看着和台盆不一样」最容易踩的一步）；
   *  · 份数同一套 → 盆沿与台面在**任何**档位下都是同一个色，没有第二份定义可以走偏；
   *  · 用户给台盆建的个人预设（`custom:*`）也立刻能用在台面上。
   *
   * 代价：台面只有 `rim` 一个槽位，「亮白陶瓷」与「白色大理石台面」这两档的 `furniture`
   * 同为 0xf0f0ec，于是这两档对台面**看起来是同一块板**（= 台盆那张台面在这两档下也确实同色）。
   * 审计会记一条 `style-presets-identical`；这是单槽位素材的必然结果，不是配置漂移。
   *
   * 组内角色补全见 `STYLE_ROLE_RECIPES_BY_GROUP.basin` 的 `rim: RIM_RECIPE`。
   */
  countertop: "basin",

  door: "door",

  mural: "",
  featurewall: "",
  stairs: "",
  steelstairs: "",
  glassstairs: "",
  floatingstairs: "",
  smallcar: "",
  car: "",
  suv: "",
  scooter: "",
  elevator: "",
});

/** 家族 → 档位组（逐模型表没登记时的兜底）。 */
const PRESET_GROUP_BY_FAMILY: Readonly<Record<string, string>> = Object.freeze({
  joinery: "joinery",
  woodwork: "woodwork",
  upholstery: "upholstery",
  rug: "rug",
  ceramic: "ceramic",
  appliance: "steelAppliance",
  device: "device",
  curtain: "curtain",


  plant: "decor",
  decor: "ornament",
  lamp: "lamp",
  pillar: "pillar",
  aquatic: "aquarium",

  pet: "pet",
  kids: "kids",
  media: "media",
  fitness: "fitness",
  tableware: "tableware",
  garden: "garden",
  furniture: "woodwork",
});

/** `auto` 档在下拉里的显示名：柱体不是「跟随全局风格」，而是配墙。 */
const MATERIAL_STYLE_AUTO_LABEL_BY_MODEL_TYPE: Readonly<Record<string, string>> = Object.freeze({
  pillar: "配墙（跟随墙体）",
  pillar_round: "配墙（跟随墙体）",
  pillar_semicircle: "配墙（跟随墙体）",
  pillar_quarter: "配墙（跟随墙体）",
  pillar_quarterinner: "配墙（跟随墙体）",
});

/** 取某模型的档位组名； */
function presetGroupFor(modelType: string): string | null {
  if (!modelType) return null;
  if (modelType in PRESET_GROUP_BY_MODEL_TYPE) {
    const explicitGroup = PRESET_GROUP_BY_MODEL_TYPE[modelType];
    return explicitGroup || null;
  }
  return PRESET_GROUP_BY_FAMILY[resolveModelFamily(modelType)] || null;
}

/** 该模型是否支持「材质风格」档位。 */
export function isMaterialStyleCapable(modelType: string): boolean {
  return presetGroupFor(modelType) !== null;
}

/**
 * 该模型是否**显式声明**「不提供材质风格档位」（`PRESET_GROUP_BY_MODEL_TYPE` 里登记为 `""`）。
 * 这类模型（楼梯 / 车辆 / 电梯 / 饰面墙）的颜色由各自的专用收尾接管，没有档位是设计决定，
 * 不是「档位覆盖不全」。
 *
 * 公开导出：供材质风格档位判定（历史审计脚本曾动态 import 本符号）。
 */
function isMaterialStyleOptOut(modelType: string): boolean {
  return modelType in PRESET_GROUP_BY_MODEL_TYPE && !PRESET_GROUP_BY_MODEL_TYPE[modelType];
}

/** 某模型可选的档位（不含「跟随全局风格」，那一项由界面统一补在最前）。 */
export function materialStyleOptionsFor(modelType: string): readonly MaterialStylePreset[] {
  const presetGroup = presetGroupFor(modelType);
  if (!presetGroup) return [];
  const builtinPresets = PRESET_GROUPS[presetGroup] || [],
    customPresets = customPresetsByGroup.get(presetGroup) || [];
  return customPresets.length ? [...builtinPresets, ...customPresets] : builtinPresets;
}

/** 该模型类型所属的档位组名； */
export function materialStyleGroupFor(modelType: string): string {
  return presetGroupFor(modelType) || "";
}

/** `auto` 档的显示名。 */
export function materialStyleAutoLabel(modelType: string): string {
  return MATERIAL_STYLE_AUTO_LABEL_BY_MODEL_TYPE[modelType] || "跟随全局风格";
}

/** 取某个档位定义； */
export function materialStylePresetFor(modelType: string, styleId: unknown): MaterialStylePreset | null {
  if (!styleId || styleId === MATERIAL_STYLE_AUTO) return null;
  return materialStyleOptionsFor(modelType).find((preset) => preset.id === styleId) || null;
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
export function materialStyleOptionsSignature(
  modelType: string,
  slotRoles?: readonly string[] | null,
): string {
  const presetIds = materialStyleOptionsFor(modelType)
      .map((preset) => preset.id)
      .join("|"),
    roleSignature = (slotRoles || []).filter(Boolean).join(",");
  return `${modelType}:${presetIds}:${roleSignature}`;
}

/** 把任意取值归一到「该模型下合法的档位 id」。 */
export function normalizeMaterialStyle(modelType: string, styleValue: unknown): string {
  if (typeof styleValue !== "string" || !styleValue || styleValue === MATERIAL_STYLE_AUTO) {
    return MATERIAL_STYLE_AUTO;
  }
  return materialStylePresetFor(modelType, styleValue) ? styleValue : MATERIAL_STYLE_AUTO;
}

/** 档位显示名； */
export function materialStyleLabel(modelType: string, styleId: unknown): string {
  const preset = materialStylePresetFor(modelType, styleId);
  return preset ? preset.label : materialStyleAutoLabel(modelType);
}

/** 档位附带的调色板覆盖（合并进该物件的 palette）； */
export function materialStylePaletteColors(modelType: string, styleId: unknown): Record<string, number> {
  const preset = materialStylePresetFor(modelType, styleId);
  return preset ? { ...preset.colors } : {};
}


/** 色卡缩略图的取色顺序：先「大面」后「小件」。 */
const MATERIAL_STYLE_SWATCH_ROLE_ORDER: readonly string[] = Object.freeze([
  "top",
  "surface",
  "slab",
  "body",
  "door",

  "frame",
  "glass",
  "panel",
  "drawer",
  "shelf",
  "leg",
  "base",
  "trim",
  "fabric",
  "upholstery",
  "seat",
  "cushion",
  "shutter",
  "slat",
  "metal",
  "handle",
  "accent",
]);

/** 档位只改调色板键、不写角色配方时（石材台面那种）退回顺序。 */
const MATERIAL_STYLE_SWATCH_PALETTE_KEYS: readonly string[] = Object.freeze([
  "countertop",
  "cabinetDoor",
  "cabinetBody",
  "cabinetWood",
  "wood",
  "furniture",
]);

/** 角色在色卡上的排序权重（越靠前越是「一眼看到的面」）； */
function swatchRoleRank(role: string): number {
  const rank = MATERIAL_STYLE_SWATCH_ROLE_ORDER.indexOf(role);
  return rank < 0 ? MATERIAL_STYLE_SWATCH_ROLE_ORDER.length : rank;
}

const swatchHex = (colorValue: number) => "#" + (colorValue & 0xffffff).toString(16).padStart(6, "0");

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
  const limit = options?.limit ?? 4;
  const palette: Record<string, unknown> = {
    ...(fallbackPalette || {}),
    ...((preset && preset.colors) || {}),
  };
  const swatchColors: string[] = [];


  const push = (roleRecipe: RoleRecipe | undefined, fallbackRecipeColor?: number) => {
    const colorValue = roleRecipe
      ? scaleMaterialColorChannels(
          resolveMaterialPaletteColor(palette, roleRecipe.color),
          roleRecipe.multiply ?? 1,
        )
      : fallbackRecipeColor;
    if (colorValue === undefined || !Number.isFinite(colorValue)) return;
    const hexColor = swatchHex(colorValue);
    if (!swatchColors.includes(hexColor)) swatchColors.push(hexColor);
  };
  if (!preset) return ["#6b7280"];

  const modelRoles = (options?.roles || []).filter((role): role is string => Boolean(role));
  if (modelRoles.length) {


    const seenRoles = new Set<string>();
    const orderedRoles = [...modelRoles]
      .sort((roleA, roleB) => swatchRoleRank(roleA) - swatchRoleRank(roleB))
      .filter((roleName) => {
        if (seenRoles.has(roleName)) return false;
        seenRoles.add(roleName);
        return true;
      });
    for (const roleName of orderedRoles) {
      if (swatchColors.length >= limit) break;

      const styleRecipe = styleRoleRecipeFor(options?.modelType, roleName, preset);
      if (styleRecipe) {
        push(styleRecipe);
        continue;
      }


      const roleColor = options?.modelType
        ? materialRoleRecipeForRole(options.modelType, roleName, palette)?.colorValue
        : undefined;
      if (roleColor !== undefined) push(undefined, roleColor);
    }
  }


  if (!swatchColors.length) {
    for (const roleName of MATERIAL_STYLE_SWATCH_ROLE_ORDER) {
      if (swatchColors.length >= limit) break;
      push(styleRoleRecipeFor(options?.modelType, roleName, preset));
    }
  }

  if (!swatchColors.length) {
    for (const paletteKey of MATERIAL_STYLE_SWATCH_PALETTE_KEYS) {
      if (swatchColors.length >= limit) break;
      const paletteColor = palette[paletteKey];
      if (typeof paletteColor === "number") push(undefined, paletteColor);
    }
  }
  return swatchColors.length ? swatchColors : ["#6b7280"];
}


/** 个人预设 id 前缀：与内置档位同处一个命名空间，但绝不会撞名。 */
const MATERIAL_STYLE_CUSTOM_PREFIX = "custom:";

/** 个人预设的可持久化形态（localStorage 里存的就是这个数组）。 */
interface MaterialStyleCustomRecord {
  id: string;
  label: string;
  /** 归属的档位组（与 `PRESET_GROUPS` 的键一致）：决定哪些模型能看到它。 */
  group: string;
  surface?: MaterialSurface;
  colors: Record<string, number>;
  roles: Record<string, RoleRecipe>;
}

/** 打个人预设用的一行采样：直接取面板上看到的出图结果。 */
interface MaterialStyleSnapshotSlot {
  role: string;
  /** 当前出图色（`#rrggbb`）。 */
  color: string;
  roughness: number;
  metalness: number;
  /** 该槽位当前用的石材板色号（`""` / 不填 = 不是石板）。 */
  slab?: StoneSlabFlavor | "";
}

const customPresetsByGroup = new Map<string, MaterialStylePreset[]>();

function hexColorToNumber(hexColor: string): number | null {
  if (typeof hexColor !== "string" || !/^#[0-9a-f]{6}$/i.test(hexColor)) return null;
  return Number.parseInt(hexColor.slice(1), 16);
}

function clampUnitInterval(value: unknown, fallback: number): number {
  return typeof value == "number" && Number.isFinite(value)
    ? Math.min(1, Math.max(0, value))
    : fallback;
}

function toCustomPreset(record: MaterialStyleCustomRecord): MaterialStylePreset | null {
  if (!record || typeof record.id != "string" || !record.id.startsWith(MATERIAL_STYLE_CUSTOM_PREFIX))
    return null;
  if (!record.group || !PRESET_GROUPS[record.group]) return null;
  const roleEntries = Object.entries(record.roles || {}).filter(
    ([roleName, roleRecipe]) =>
      Boolean(roleName) &&
      Boolean(roleRecipe) &&
      (typeof roleRecipe.color == "number" || typeof roleRecipe.color == "string"),
  );
  if (!roleEntries.length) return null;
  return Object.freeze({
    id: record.id,
    label: typeof record.label == "string" && record.label ? record.label : "我的预设",
    surface: record.surface,
    colors: Object.freeze(completeFurnitureRamp({ ...(record.colors || {}) })),

    roles: Object.freeze(deriveStyleRoles(Object.fromEntries(roleEntries))),
  });
}

/** 装载个人预设（由 studio-app 从 localStorage 读出后调用； */
export function registerCustomMaterialStyles(records: unknown): MaterialStyleCustomRecord[] {
  customPresetsByGroup.clear();
  const acceptedRecords: MaterialStyleCustomRecord[] = [];
  if (!Array.isArray(records)) return acceptedRecords;
  for (const rawRecord of records) {
    const customRecord = rawRecord as MaterialStyleCustomRecord,
      customPreset = toCustomPreset(customRecord);
    if (!customPreset) continue;
    const groupPresets = customPresetsByGroup.get(customRecord.group) || [];
    groupPresets.push(customPreset);
    customPresetsByGroup.set(customRecord.group, groupPresets);
    acceptedRecords.push(customRecord);
  }
  return acceptedRecords;
}

/** 把「这件物件此刻的出图结果」打成一档个人预设。 */
export function buildCustomMaterialStyleRecord(
  customId: string,
  label: string,
  groupName: string,
  snapshotSlots: readonly MaterialStyleSnapshotSlot[],
  basePreset: MaterialStylePreset | null,
): MaterialStyleCustomRecord | null {
  if (!customId.startsWith(MATERIAL_STYLE_CUSTOM_PREFIX) || !PRESET_GROUPS[groupName]) return null;
  const roles: Record<string, RoleRecipe> = {};


  for (const snapshotSlot of snapshotSlots) {
    if (!snapshotSlot?.role) continue;
    const colorValue = hexColorToNumber(snapshotSlot.color);
    if (colorValue === null) continue;
    roles[snapshotSlot.role] = {
      color: colorValue,
      roughness: clampUnitInterval(snapshotSlot.roughness, 0.5),
      metalness: clampUnitInterval(snapshotSlot.metalness, 0),

      ...(isStoneSlabFlavor(snapshotSlot.slab) ? { slab: snapshotSlot.slab } : {}),
    };
  }
  if (!Object.keys(roles).length) return null;
  return {
    id: customId,
    label,
    group: groupName,
    surface: basePreset?.surface,
    colors: basePreset ? { ...basePreset.colors } : {},
    roles,
  };
}

/** 个人预设 id：同名同组会覆盖（改个名字就是另一档）。 */
export function customMaterialStyleId(groupName: string, label: string): string {
  return MATERIAL_STYLE_CUSTOM_PREFIX + groupName + ":" + encodeURIComponent(label.trim());
}


interface ResolvedMaterialStyleRecipe {
  presetId: string;
  role: string;
  colorValue?: number;
  roughness?: number;
  metalness?: number;
  transparent?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  flatShading?: boolean;
  emissiveValue?: number;
  emissiveIntensity?: number;
  fabricLike?: boolean;
  /** 该角色是否按「整块石材」出图（贴一张自带纹路的大理石整图）。 */
  slab?: StoneSlabFlavor;
}

/** 取某材质名在**当前档位**下的配方。 */
export function materialStyleRecipeFor(
  modelType: string,
  materialName: string | undefined,
  palette: Record<string, unknown> | null | undefined,
  materialIndex = 0,
): ResolvedMaterialStyleRecipe | null {
  const styleId = palette?.materialStyle;
  const preset = materialStylePresetFor(modelType, styleId);
  if (!preset) return null;
  const role = resolveModelMaterialRole(modelType, materialName, materialIndex).role;
  const recipe = styleRoleRecipeFor(modelType, role, preset);
  if (!recipe) return null;
  const finishSurface = recipe.surface ?? preset.surface;


  const slabFlavor = isStoneSlabFlavor(recipe.slab)
    ? recipe.slab
    : isStoneSlabFlavor(preset.slab)
      ? preset.slab
      : undefined;
  const finish = finishSurface ? materialSurfaceFinish(finishSurface) : undefined;
  const recipeColor = resolveMaterialPaletteColor(palette, recipe.color);
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
    emissiveValue:
      recipe.emissive !== undefined ? resolveMaterialPaletteColor(palette, recipe.emissive) : undefined,
    emissiveIntensity: recipe.emissiveIntensity,
    fabricLike: recipe.fabricLike === true,
    slab: slabFlavor,
  };
}

/** 取某档位下**指定角色**的配方色（跳过「材质名 → 角色」那一步）。 */
export function materialStyleRoleColorFor(
  modelType: string,
  role: string,
  palette: Record<string, unknown> | null | undefined,
): number | undefined {
  const preset = materialStylePresetFor(modelType, palette?.materialStyle);
  const roleRecipe = preset ? styleRoleRecipeFor(modelType, role, preset) : undefined;
  if (roleRecipe) {
    const colorValue = resolveMaterialPaletteColor(palette, roleRecipe.color);
    return Number.isFinite(colorValue)
      ? scaleMaterialColorChannels(colorValue, roleRecipe.multiply ?? 1)
      : undefined;
  }
  return materialRoleRecipeForRole(modelType, role, palette)?.colorValue;
}

/** 该模型的档位组里，**哪些角色**会拿到石材板贴图（跨全部档位的并集）。 */
export function materialStyleStoneSlabRoles(modelType: string): ReadonlySet<string> {
  const slabRoles = new Set<string>();
  for (const preset of materialStyleOptionsFor(modelType))
    for (const [roleName, roleRecipe] of Object.entries(preset.roles))
      if (isStoneSlabFlavor(roleRecipe.slab)) slabRoles.add(roleName);
  return slabRoles;
}
