/**
 * 逐物件的「材质风格」预设档位（对齐 homeos-3d 0.6.5 的 `studio/studio-material-styles.ts`）。
 *
 * 角色体系（谁在哪一槽、什么角色）由 `studio-model-material-roles.ts` 决定；本模块只负责
 * **档位**：选一档 = 这个物件的整套角色一次换料。档位携带两样东西：
 *
 *  1. `colors`：调色板覆盖键。合并进该物件的 palette 后，沿用调色板键的角色配方、
 *     以及暖木主题里那些读 palette 的着色收尾（柜门返边、床尾巾、鞋柜台面…）都会跟着走；
 *  2. `roles`：按角色的配方（颜色多为固定色号）。这一层是「档位即组合」——
 *     0.6.5 的 fabricCombo / joineryCombo / woodCombo… 已经把每档该给的槽位一次说清，
 *     这里直接把它们摊平成「角色 → 配方」表。
 *
 * 生效顺序（最后一手赢）：档位 roles → 逐槽 `item.materialOverrides`。
 * 档位为 `auto`（跟随全局风格）时不产生任何覆盖，物件完全走全局主题。
 */
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
  /** 整件质感族：角色配方没写 surface 时的兜底（对齐 0.6.5 的档位级 surface）。 */
  surface?: MaterialSurface;
  /**
   * 整件石材板色号：角色配方没写 slab 时的兜底。
   *
   * 「大理石」这类档位的重点就是**整图纹路**，档位级给一个色号，那些只换调色板键、
   * 不写角色配方的石作档位（如「白色大理石」）也能跟着上纹路。
   */
  slab?: StoneSlabFlavor;
  /** 调色板覆盖键。 */
  colors: Readonly<Record<string, number>>;
  /** 该档位的「角色 → 配方」。 */
  roles: Readonly<Record<string, RoleRecipe>>;
}

/* -------------------------------------------------------------------------- */
/* 颜色工具：朝白 / 朝黑插值（0.6.5 studio-color-utils.shadeColor 的同语义版本） */
/* -------------------------------------------------------------------------- */

function shadeColor(color: number, amount: number): number {
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const channel = (shift: number) => {
    const value = (color >> shift) & 255;
    return Math.round(value + (target - value) * weight);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}

/**
 * 补齐 furniture 四档。0.6.5 的档位只声明少数调色板键，其余四档由基准色派生 ——
 * 新项目的家族底表大量引用 `furniture / furnitureSoft / furnitureLight / furnitureDark`，
 * 不补这一手，选了档位的物件会在这些角色上掉回全局主题色。
 */
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
    // 纯装饰类（只改叶色 / 台面 / 玻璃）没有可作基准的实体色：不硬造四档。
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

/* -------------------------------------------------------------------------- */
/* 角色补齐：0.6.5 的 combo 角色名 → 新项目资产命名里多出来的角色                */
/* -------------------------------------------------------------------------- */

/**
 * 新项目的 GLB 里有一部分角色是**资产命名直接带出来的**（`-furniture-frame`、
 * `-detail-recess`、`-aquatic-sand`…），0.6.5 的 combo 里没有同名角色（0.6.5 没有这批模型）。
 * 若不补这一层，选了档位的那批模型会出现「一部分槽位跟着档位走、另一部分纹丝不动」。
 *
 * 补齐规则只在目标角色**未被 combo 显式给出**时生效，且每个目标只按第一条命中的来源派生；
 * `multiply` 用来把来源压暗 / 提亮成它在新模型里的语义（暗部件 / 浅色枝叶）。
 */
const STYLE_ROLE_DERIVATIONS: ReadonlyArray<{
  role: string;
  from: readonly string[];
  multiply?: number;
  flatShading?: boolean;
  surface?: MaterialSurface;
  /**
   * 是否连石材板色号一起继承。默认**不继承**：派生链里 `wood ← top`、`sand ← top` 这类
   * 「跨材质」派生一旦带上 slab，木腿 / 沙面就会被贴上大理石整图。
   * 只有 `surface ← top`、`slab ← top` 这种「同一个石作台面的不同叫法」才该继承。
   */
  inheritSlab?: boolean;
}> = [
  // 软装件
  //
  // `surface` 必须**先认 `top`**：新资产把 0.6.5 的台面槽（`top`）改成了
  // `-furniture-surface`（方茶几 / 电视柜 / 梳妆台的整块台面、转盘餐桌的转盘盘面、
  // 台球桌的边框顶面 —— 都是「这一件最上面那块板」）。
  // 木器 combo（woodCombo）会给 `upholstery` 一个固定米色的兜底（木器族唯一不跟木色
  // 走的一档），若把 `upholstery` 排在 `top` 前面，这些台面会被钉死在米色上：
  // 换任何木器档位都只动腿和框，台面纹丝不动。
  { role: "surface", from: ["top", "upholstery", "fabric", "body"], inheritSlab: true },
  { role: "seat", from: ["upholstery", "fabric"] },
  { role: "fabric", from: ["upholstery", "cushion", "stash", "top", "body"] },
  { role: "linen", from: ["fabric", "upholstery", "cushion"] },
  { role: "sage", from: ["fabric", "upholstery", "cushion"] },
  { role: "runner", from: ["fabric", "upholstery"] },
  // 结构件 / 暗部件
  { role: "frame", from: ["trim", "body", "leg"] },
  { role: "shadow", from: ["base", "frame", "body"], multiply: 0.6 },
  { role: "back", from: ["body", "shadow", "panel"], multiply: 0.82 },
  { role: "side", from: ["body", "panel"] },
  { role: "dark", from: ["body", "base", "panel"], multiply: 0.55 },
  { role: "panel", from: ["door", "drawer", "body"] },
  { role: "handle", from: ["metal", "trim"] },
  // 设备 / 家电的细节件
  { role: "recess", from: ["body", "panel", "shadow"], multiply: 0.5 },
  { role: "control", from: ["panel", "door", "body"] },
  { role: "indicator", from: ["accent", "lit", "metal"] },
  { role: "water", from: ["glass"] },
  { role: "paper", from: ["book", "panel", "body"] },
  { role: "book", from: ["paper", "stash"] },
  // 木器台面
  { role: "wood", from: ["top", "body"] },
  { role: "slab", from: ["top", "surface"], inheritSlab: true },
  //
  // `accent` 同理**先认 `top`**：这批木器里 accent 是**坐在台面上/嵌在台面里的那一件**
  // （圆餐桌与转盘餐桌的台面中央托盘、餐桌的四个桌饰、台球桌的球、梳妆台/书柜的摆件）。
  // 排 `upholstery` 前面那版会给它木器档位的固定米色：台面换成胡桃木了，台面中间那层
  // 还是米色 —— 观感就是「选了档位没生效」。
  // 柜类不受影响：joineryCombo 显式给了 `accent`（陶土色摆件），派生规则只补空缺。
  // 唯一的代价是台球桌的 `accent`（台面上的球，0.18m）会跟着木色走。
  { role: "accent", from: ["top", "upholstery", "fabric", "cushion", "trim", "metal"] },
  // 绿植 / 水族
  { role: "soil", from: ["interior", "pot"] },
  { role: "foliageSoft", from: ["foliage"], multiply: 1.22 },
  { role: "sand", from: ["interior", "top"] },
  { role: "rock", from: ["frame", "shadow"], flatShading: true },
  { role: "fish", from: ["accent", "body", "pot"] },
  { role: "ceramic", from: ["pot", "top"] },
  { role: "foliage", from: ["interior", "frame"], surface: "foliage" },
];

/** 按上面的规则把 combo 没给出的角色派生出来（只补空缺，不覆盖 combo 的显式配方）。 */
function deriveStyleRoles(roles: Record<string, RoleRecipe>): Record<string, RoleRecipe> {
  const derivedRoles: Record<string, RoleRecipe> = { ...roles };
  for (const derivationRule of STYLE_ROLE_DERIVATIONS) {
    if (derivedRoles[derivationRule.role]) continue;
    const sourceRole = derivationRule.from.find((candidateRole) => roles[candidateRole]);
    if (!sourceRole) continue;
    const sourceRecipe = roles[sourceRole];
    // 石材板色号默认**不随派生传播**（详见 STYLE_ROLE_DERIVATIONS.inheritSlab 的说明）。
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

/* -------------------------------------------------------------------------- */
/* 逐模型档位角色覆写：档位配方与某件模型的实际构件对不上时，按模型钉死角色     */
/* -------------------------------------------------------------------------- */

/**
 * 档位是**按组**给所有人下料的，可同一组里各件模型的构件并不一样：joinery 档位的 `accent`
 * 是「撞色摆件」（陶土色），落到梳妆台上却是那面立式镜；joinery 档位的 `top` 是石材台面，
 * 落到书架 / 床头柜 / 电视柜上却是薄木顶板。
 *
 * 角色表（studio-model-material-roles.ts）只能管到 auto 档；档位一旦出手就把它整个盖掉。
 * 所以「档位语义与模型不符」必须在这一层再放一张覆写表：命中即**整条替换**该角色的配方
 * （不是合并），语义清晰、也不会从原配方漏字段进来（例如石材板的 slab）。
 *
 * 与 `materialStylePresetSwatchColors` 必须读同一张表 —— 否则色卡按档位配方画、物件按覆写
 * 出图，L6g 会判「色卡与物件不符」。
 */
const MODEL_STYLE_ROLE_OVERRIDES: Readonly<
  Record<string, Readonly<Record<string, RoleRecipe>>>
> = Object.freeze({
  /**
   * 五件「木顶柜」的 `top`（电视柜是 `surface`）是 0.02~0.06m 的薄木板，joinery 档位却把它
   * 当石材台面刷成白石 / 黑石。这里改回木质顶板，取 `cabinetBody` 键 —— 它正是各档位声明的
   * 柜体木色（木柜白门 #3d2818 / 浅橡木 #c49a6c / 胡桃木 #5a3a22 / 深色烤漆 #2e2a28），
   * 顶板因此与柜体同料、逐档跟着走。
   */
  shelf: { top: { surface: "wood", color: "cabinetBody" } },
  nightstand: { top: { surface: "wood", color: "cabinetBody" } },
  shoecabinet: { top: { surface: "wood", color: "cabinetBody" } },
  sideboard: { top: { surface: "wood", color: "cabinetBody" } },
  tvstand: { surface: { surface: "wood", color: "cabinetBody" } },
  /**
   * 台球桌：`surface` 是木质台面边轨（木色）；`accent` 是桌上的台球，四档里都是同一批象牙白 ——
   * 木器档位会给它木色 / 米色，台球跟着家具变木色是明显的错配。
   */
  "pool-table": {
    surface: { surface: "wood", color: "wood" },
    accent: { surface: "lacquer", color: 0xf5f0e6 },
  },
  /**
   * 梳妆台：`accent` 是 0.69×0.65m 的**立式镜面**（加载器 auto 分支本来就把它按玻璃透明出图，
   * 见 `vanityRoleColors.accent = itemPalette.glass`）；joinery 档位的 accent 是陶土色摆件，
   * 会把整面镜子刷成一块橙陶。逐模型钉成镜面玻璃，档位只改柜体。
   */
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

/** 取某角色在某档位下的配方：逐模型覆写优先，其次档位自己的配方。 */
function styleRoleRecipeFor(
  modelType: string | undefined,
  role: string,
  preset: MaterialStylePreset,
): RoleRecipe | undefined {
  return (modelType ? MODEL_STYLE_ROLE_OVERRIDES[modelType]?.[role] : undefined) ?? preset.roles[role];
}

/* -------------------------------------------------------------------------- */
/* 组合：每档一次说清一族槽位（0.6.5 同名 combo 的移植）                        */
/* -------------------------------------------------------------------------- */

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
    // 扶手 / 撞色面默认与主体同一种织物（真实沙发上扶手与坐垫通常同料）。
    accent: accent ?? upholstery,
    // 抱枕默认同织物；给对比色时才是「抱枕撞色」那一路。
    cushion: cushion ?? upholstery,
    // 床品 / 围栏布面默认也与主体同料。
    fabric: fabric ?? upholstery,
    // 外露木框架与腿通常同一种木料。
    frame: frame ?? leg,
    leg,
    // 床台 / 榻榻米木台：默认为框架色（它与框架是同一批木作）。
    body: body ?? frame ?? leg,
    top: top ?? upholstery,
    trim: trim ?? frame ?? leg,
    // 五金给一个通用钢色兜底：门把手、脚轮、气压柱的金属与织物 / 木料的档位无关。
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
  // 内腔比柜体亮一档：柜门一开要有「深浅两层」。
  const interiorRecipe =
    typeof body.color == "number"
      ? { surface: "wood" as MaterialSurface, color: shadeColor(body.color, 0.45) }
      : door;
  // 玻璃层板 / 玻璃门在柜类里是独立槽位。
  const glassRecipe: Recipe = { surface: "glass", color: 0xa9c5d3 };
  // 水槽盆体 / 灶面与炉架：厨柜里唯二不随木色走的金属面。
  const sinkRecipe: Recipe = { surface: "metal", color: 0xb9bfc5, roughness: 0.24, metalness: 0.62 };
  const cooktopRecipe: Recipe = { surface: "metal", color: 0x33363a, roughness: 0.2, metalness: 0.6 };
  // 镜面是**不透明**的镀银面，不随档位变。
  const mirrorRecipe: Recipe = { surface: "glass", color: 0xdbe4ea, roughness: 0.08, metalness: 0.35 };
  // 书脊 / 书封：不跟木色走（换胡桃还是白漆，书架上仍是同一批米黄纸脊）。
  const bookRecipe: Recipe = { surface: "paint", color: 0xd6c6a4 };
  // 敞开格里的内容物（鞋柜里那一双双鞋）：同样不跟木色走。
  const stashRecipe: Recipe = { surface: "leather", color: 0x6f7176 };
  // 撞色书脊与摆件：陶土色，用来把满架同色的书分开。
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
    // 踢脚默认与柜体同料（真实柜子的踢脚要么同色、要么同色更深一档）。
    base: base ?? body,
    // 柜脚跟随踢脚：床头柜 / 电视柜 / 梳妆台这类「箱体坐在四条腿上」的柜子。
    leg: leg ?? base ?? body,
    top,
    interior: interior ?? interiorRecipe,
    glass: glass ?? glassRecipe,
    mirror: mirror ?? mirrorRecipe,
    metal,
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
    leg,
    // 没有箱体的桌几（边几、凳）让 body 跟随台面；柜体件自行给。
    body: body ?? top,
    drawer: drawer ?? top,
    shelf: shelf ?? top,
    // 横撑默认比台面深一档，近看才有「构件」的层次（真实家具的望板也是这么处理的）。
    trim: trim ?? body ?? top,
    base: base ?? leg ?? metal,
    // 床垫 / 床品：木器族里唯一不随木色走的一档。
    upholstery: upholstery ?? { surface: "fabric", color: 0xf3e7d8 },
    cushion: cushion ?? upholstery ?? { surface: "fabric", color: 0xf3e7d8 },
    metal,
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
    // 石材柜的抽屉面与层板默认跟随台面那一批石作。
    drawer: drawer ?? top,
    shelf: shelf ?? top,
    // 收边取石座色（它贴着的就是石座）。
    trim: trim ?? base,
    metal: metal ?? { surface: "metal", color: 0x8c8f94 },
  };
}

/**
 * 家电机身的三档明暗：**门脸 / 抽屉面 / 台面**取中间那档，**控制面板 / 底座**压到最暗那档。
 *
 * 角色表（studio-model-material-roles.ts 的 `appliance`）早就写明「箱体最亮、门脸中间、
 * 控制面板与底座最暗」，可档位只给了 `body` 一支料 —— 于是 `applianceCombo` 里
 * `door ?? body`、`panel ?? body`、`base ?? body` 三支回落链把整机刷成**一个颜色**：
 * 冰箱的门缝、洗衣机的控制条、洗碗机的踢脚、热水器的显示窗、蒸箱的门板压边全都糊掉了，
 * 只剩 `recess`（凹陷）还是深的。用户看到的「选了档位只有深浅整体变化、细节全没有」
 * 就出在这里。
 *
 * 三支料不写死色号，直接引用**本档调色板**的 `applianceSoft` / `applianceDark` 两个键 ——
 * 银灰 / 银黑 / 奶白三档各自都声明了这一对（见 STEEL_APPLIANCE_STYLES），
 * 所以档位之间照样互相可分辨，档位之内又恢复了「亮箱体 + 中门脸 + 暗控制面板」的层次。
 *
 * @param finish 本档箱体的表面处理（不锈钢档是 metal、奶白档是 paint）。门脸 / 踢脚 / 控制面板
 *   一律**沿用箱体的表面处理**：一台奶白冰箱配一扇金属门、或白漆箱体配一块金属踢脚，
 *   都会读成「几件不同材质拼起来的」，而真实家电的同一面漆 / 同一种拉丝是整套的。
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

/**
 * 智能设备的机身层次：**面板 / 顶端面**比箱体浅一档（`applianceSoft`），
 * **底座 / 支脚**压到最暗一档（`applianceDark`）。
 *
 * 与家电同理：设备档位原先也只给 `body`，于是笔电的键盘面、路由器的顶盖面板、
 * 空气净化器的顶圈、取暖器的前脸、NAS 的整块前脸全都与箱体同色。
 * `control`（控制区）与 `recess`（凹陷）分别由 `panel` 与 `body` 派生（见
 * STYLE_ROLE_DERIVATIONS），面板一改，它们自动跟着走。
 *
 * @param finish 本档箱体的表面处理（皓白 / 石墨黑是 paint、金属灰是 metal），面板与底座
 *   沿用同一支表面处理，避免「塑料壳配金属面」的拼装感。
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
  // 纸张是耗材，不跟机身漆色走：打印机出纸口那张纸在「石墨黑」档位下**不能**变成深灰纸。
  // 不显式给的话，派生表 `paper ← book/panel/body` 会把它接到 `panel`（＝机身色）上。
  const paperRecipe: Recipe = { surface: "paint", color: 0xf3f1ea };
  return {
    body,
    door: door ?? body,
    panel: panel ?? body,
    trim: trim ?? body,
    base: base ?? body,
    // 台面与抽屉面都跟随档位主体色。
    top: top ?? body,
    drawer: drawer ?? door ?? body,
    // 层架（机器人基站的托盘、晾衣架的平铺网面）与机身同色；脚则是五金件。
    shelf: shelf ?? body,
    leg: leg ?? metal ?? { surface: "metal", color: 0x8c8f94 },
    handle: handle ?? metal,
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
  const metalRecipe: Recipe = metal ?? { surface: "metal", color: 0xbfc6cc };
  const glassRecipe: Recipe = glass ?? { surface: "glass", color: 0xdfeaec };
  // 镜面不随档位变：陶瓷换到岩灰档，镜子还是那面镜子。
  const mirrorRecipe: Recipe = mirror ?? {
    surface: "glass",
    color: 0xdbe4ea,
    roughness: 0.08,
    metalness: 0.35,
  };
  return {
    body,
    top: top ?? body,
    // 盆体与陶瓷本体同料（台盆的 `sink` 就是那只瓷盆）：不单独给配方时跟着 `body` 走。
    sink: sink ?? body,
    frame: frame ?? joineryRecipe,
    door: door ?? joineryRecipe,
    drawer: drawer ?? joineryRecipe,
    shelf: shelf ?? joineryRecipe,
    base: base ?? joineryRecipe,
    interior: interior ?? interiorRecipe,
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

/** 绿植：叶 / 盆 / 托 / 干 / 土。 */
function plantCombo({ foliage, pot, saucer, trunk, soil }: {
  foliage: Recipe;
  pot: Recipe;
  saucer?: Recipe;
  trunk?: Recipe;
  soil?: Recipe;
}): Record<string, Recipe> {
  const derivedTrunk: Recipe = { surface: "wood", color: 0x6b5a42 };
  const derivedSaucer: Recipe = { surface: "ceramic", color: shadeColor(pot.color as number, -0.3) };
  const derivedSoil: Recipe = { surface: "stone", color: 0x3b2f22 };
  return {
    foliage,
    pot,
    base: saucer ?? derivedSaucer,
    frame: trunk ?? derivedTrunk,
    interior: soil ?? derivedSoil,
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

/**
 * 鱼缸：柜体 / 柜门 / 台面 / 踢脚 / 拉手（下）+ 缸框 / 缸内背板 / 玻璃 / 灯板（上）
 * + **缸内造景与活体**（底砂 / 造景石 / 水草 / 鱼）。
 *
 * 后四个角色必须显式给：它们是**缸里的内容物**，与柜体和缸框是什么颜色无关。若不显式给，
 * 派生表会把它们接到别处去 ——
 *   `sand ← interior`（深青背板）、`foliage ← interior`（深青背板）、
 *   `rock ← frame`（柜框）、`fish ← accent/body`（柜体），
 * 于是「白框玻璃」缸会得到白色的造景石与白色的鱼，「原木框」缸得到棕色的鱼，
 * 底砂和水草在三种缸框下都变成 `#1b3a40` 的深青。几何上它们分别是缸底那层 0.03m 的砂、
 * 0.65m 高的石、0.46m 的水草和 0.32m 的鱼 —— 一眼就能看出接错了源。
 */
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
  // 缸内造景 / 活体的固定配方（三种缸框下同一批内容物，换柜框不换缸景）。
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

/**
 * 钢琴：琴身 / 顶盖 / **白键** / **黑键与铸铁内板** / 键床盖板 / 琴腿 / 五金。
 *
 * 角色名以这件模型**实际的材质角色**为准（见 `MODEL_SLOT_ROLES.piano`）：
 *   `金色金属材料`→`accent`（踏板 / 铰链 / 铸铁板的黄铜件）
 *   `*2`→`body`（琴身）、`[Color_009]1`→`dark`（黑键与内板）
 *   `[Blinds_Weave]`→`panel`（谱架织面）、`*1`→`trim`（那 42 根**白键**）
 *
 * 「亮光黑 / 亮光白 / 暖木色」换的是**琴身漆色**，不是键盘：三种漆色下白键都是同一批象牙白、
 * 黑键与内板都是同一块近黑、踏板都是同一副黄铜件。原先这三件是跟着 `body` 派生的
 * （`trim ?? body`），暖木钢琴因此会得到**棕色的白键**、亮光黑钢琴得到黑色的键盘。
 */
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
  // 黄铜五金（对齐角色表 `piano.accent` = 0xbba16e 的金属件语义）。
  const accentRecipe: Recipe = { surface: "metal", color: 0xb08d5a };
  return {
    body,
    top: top ?? body,
    // `trim` 是白键本身，不是「腰线」——不跟漆色走。
    trim: key ?? keyRecipe,
    // `dark` 是黑键与铸铁内板，任何漆色下都保持近黑。
    dark: dark ?? darkRecipe,
    panel: panel ?? body,
    leg: leg ?? body,
    key: key ?? keyRecipe,
    accent: accent ?? accentRecipe,
    metal,
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
    // 台面边轨是木质，默认与桌架同料。
    surface: surface ?? frame,
    // 台呢是这件的招牌料，档位必须显式给。
    fabric,
    // 桌下暗部压一档，桌身才有厚度。
    shadow: shadow ?? { surface: "wood", color: shadeColor(frame.color as number, -0.45) },
    // 台球：各档都是同一批象牙白，不跟木色走。
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
    // 大型面（淋浴隔断 / 淋浴门）是玻璃。
    interior:
      interior ?? { surface: "glass", color: 0xdfeaec, transparent: true, opacity: 0.26, depthWrite: false },
    // 顶喷 / 龙头 / 门轴是五金。
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
    // 凹槽比桌架深一档（茶盘的沥水槽就是这种「深色内衬」）。
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

/* -------------------------------------------------------------------------- */
/* 布艺 / 皮革                                                                 */
/* -------------------------------------------------------------------------- */

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
      // 雾霾绿配沙色搭毯：同明度的邻近色只会糊成一片，撞一个暖沙才看得出是两层。
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

// 皮革组的腿都是金属细腿：皮沙发的做法就是「皮面 + 细金属脚」，配木脚会读成两件拼起来的家具。
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
      // 靠背枕 / 搭毯取**同色系亮一档**的皮：三档皮色各给一层亮色，
      // 否则整件只有一个皮色，「靠背枕 + 坐垫 + 扶手」塌成一块。
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
      // 黑皮配深色木框架：整件全黑会看不出结构。
      frame: { surface: "wood", color: 0x3a2418 },
      // 墨黑皮的亮档就是那块偏灰的靠背枕：全黑皮若把 accent 也压成同色，
      // 沙发只剩一个剪影。
      accent: { surface: "leather", color: "furnitureLight" },
    }),
  ),
]);

/** 软装座具：布艺四档 + 皮革三档并成一组，一个下拉里都能选。 */
const UPHOLSTERY_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  ...FABRIC_STYLES,
  ...LEATHER_STYLES,
]);

/* -------------------------------------------------------------------------- */
/* 木作柜体                                                                    */
/* -------------------------------------------------------------------------- */

/**
 * 「木柜白门」的白门色：一支暖白，**刻意不是纯白**。
 *
 * 这门色原先在两处声明成互不相等的值 —— 档位调色板 `cabinetDoor: 0xffffff`（纯白）与
 * 档位 tone 的 `door: 0xf5f3ef`。上面「柜体 / 柜面两支必须与本档调色板声明一致」的约定
 * 要求它们同值：凡是走角色表 `door` / `drawer`（`color: "cabinetDoor"`）落色、又没被档位
 * 配方接管的槽位，就会画出**纯白**，与档位配方的近白门对不上。现在统一成这一支，并且
 * 整体比纯白降一档 —— 纯白在默认档的暗场里过亮、和深木柜体（`#3d2818`）贴在一起发飘。
 *
 * 实测（默认档五支灯 + Neutral 色调映射 + 曝光 1.05，见 `JOINERY_WHITE_DOOR_GLOW`）：
 *   `#ffffff` 出图 `#ececec` ｜ 原 `#f5f3ef` 出图 `#e7e5e1` ｜ 本值出图 `#dcd7cd`
 */
const JOINERY_WHITE_DOOR_COLOR = 0xe9e4da; // #e9e4da 暖白（比纯白低一档）

/**
 * 柜类四档的「柜体 / 柜面」两支料。
 *
 * 这两支必须与本档调色板里声明的 `cabinetWood` / `cabinetBody` / `cabinetDoor` 取值一致：
 * 角色配方是**最后一手**（盖在调色板之上），它一旦和本档声明的键对不上，档位之间就会出现
 * 「选的不是这一档」的画面。四档各自的声明是
 *   木柜白门 cabinetWood/cabinetBody=0x3d2818、cabinetDoor=0xe9e4da
 *   浅橡木   0xc49a6c / 0xd8b98f
 *   胡桃木   0x5a3a22 / 0x6b4526
 *   深色烤漆 0x2e2a28 / 0x3a3a3c
 * 「木柜白门」的 body 原先是 0x5a3a22 —— 那是**胡桃木**的柜体值：两档的柜体因此完全相同。
 * 柜门是独立槽位的模型还能靠门色区分，但柜体本身就是唯一可见面的模型（书柜这类敞开格）
 * 会画出**一模一样**的结果，也就是「选了档位风格没变化」。
 */
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

/**
 * 「木柜白门」的门料自发光：白门在默认档的暗场里**必须自己撑住白度**。
 *
 * 白门本身是近白（线性反照率 0.9 上下），但默认档这套底光给不到白色：主光 2.05 打在正对
 * 相机的面上只有 0.38 的 N·L，再加半球天光 / 环境光，一枝 0.9 反照率的白料最终只落回
 * 线性 ~0.23。实测（默认档五支灯 + Neutral 色调映射 + 曝光 1.05，逐项复刻 `refreshBaseLighting`
 * 后取正对面中点的像素）：不加自发光 = `#848380`（中灰），暖阳档也只有 `#9a9283`。这正是
 * 「选了木柜白门，门不是白的」的观感来源 —— **料是白的，出图是灰的**。
 *
 * 所以白门照墙面的做法补一层自发光（墙的 `emissiveIntensity 0.30` 才是「墙面去灰」的主力，
 * 见 `createWallSideMaterial`），思路与暖木档「自发光=本体色」同源。自发光取门色本身
 * （`JOINERY_WHITE_DOOR_COLOR`），所以门色一降、这层光跟着降，两者永远同色：
 *   档位 tone 的 0.60 强度 ladder（旧门色 `#f5f3ef`）：不加 `#848380` ｜ 0.50 `#dbd9d6` ｜
 *   **0.60 `#e7e5e1`** ｜ 0.70 `#edebe7` —— 取 0.60 是「读作白」与「留住主光明暗差」的折中。
 *
 * 只管「白门」这一档：木色门（浅橡木 / 胡桃木 / 深色烤漆）没有「白度」要撑，不该跟着自发光。
 * 挂在档位的 `door` 配方上（而不是 `JOINERY_TONE_BY_STYLE` 的共享 tone 上）—— 柱体档位
 * `pillar-joinery-wood-white` 把 `body` 也取成白门这一支，挂共享 tone 会连着让立柱自发光。
 */
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
      // 与档位 tone 的 `door` 同源（详见 JOINERY_WHITE_DOOR_COLOR）：**不写纯白**。
      cabinetDoor: JOINERY_WHITE_DOOR_COLOR,
      furniture: 0xc49a6c,
      furnitureSoft: 0xc49a6c,
      furnitureDark: 0x3d2818,
      countertop: 0xf2f1ed,
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-wood-white"].body,
      // 白门补一层「自己撑白度」的自发光（见 JOINERY_WHITE_DOOR_GLOW）。
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

// ── 柱体：与墙一致（auto 档）+ 与柜同料（本表四档）─────────────────────────
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

/* -------------------------------------------------------------------------- */
/* 木器家具 / 石材台面                                                         */
/* -------------------------------------------------------------------------- */

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

// 石材台面（餐桌 / 岛台 / 茶几）：只换台面色，其余角色仍跟随家族底表。
const STONE_TOP_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  // 白色大理石：台面 / 板面显式声明石材板色号 —— 亮白大理石整图 + 抛光面（0.24）。
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
  // 黑色岩板 / 水磨石：**不是**大理石，所以角色配方里不写 slab —— 角色表给台面声明过
  // 大理石纹路，档位必须显式接管（否则会顶着白色云纹出图，档位名就成了谎）。
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

/* -------------------------------------------------------------------------- */
/* 家电 / 小家电 / 洁具 / 玻璃                                                  */
/* -------------------------------------------------------------------------- */

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
      // 岩灰档位是「岩板质感」那一挂：整件（本体也含）改成石面，柜体则压成深灰漆。
      body: { surface: "stone", color: 0xc2c0ba },
      top: { surface: "stone", color: 0xa9a8a3 },
      frame: { surface: "paint", color: 0x6f7276 },
      door: { surface: "paint", color: 0x7c8085 },
    }),
  ),
]);

/* -------------------------------------------------------------------------- */
/* 台盆（浴室柜）：台面这块料单独给石材档位                                      */
/* -------------------------------------------------------------------------- */

/**
 * 复用另一组的档位：换掉 id，配方原样带走。
 *
 * 台盆想要洁具那三档（亮白陶瓷 / 哑光石白 / 岩灰），但**档位 id 必须全局唯一**
 * （校验 L6a 按组去重），所以复用时要换 id。复制配方而不是换 id 的话，洁具组日后改了
 * 配方、台盆组就会悄悄漂移成另一套料。
 */
function reusePresetInGroup(preset: MaterialStylePreset, id: string): MaterialStylePreset {
  return Object.freeze({ ...preset, id });
}

/**
 * 台盆的台面档位：整张石材。配方只落**台面**这块料 —— 柜体（`frame`）仍是木作、盆体
 * （`sink`）仍是陶瓷，换档位时看得到的变化就落在台面上。
 *
 * 台盆不能并进 `ceramic` 组：那一组的 `top` 在马桶上是便座盖板（`toilet-material-1`，
 * 0.42×0.064×0.66 的盖板），给「台面」准备的石材整图会贴到马桶盖上。所以单开 `basin` 组。
 */
const BASIN_STONE_TOP_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  // 白色大理石：`slab` 声明让加载器贴石材整图（`color` 交给纹理本身），抛光面。
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
  // 黑色大理石：黑石台面配胡桃木柜体。柜体木色必须跟着一起走 —— 黑白两块石板自己的
  // `color` 都是纯白（深色由 `marble-dark` 整图给），只差色号的话校验 L6h 会把两档判成
  // 「换档位画面零变化」，用户看到的也确实是同一个柜体色。
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
      // 茶玻配古铜色框：成品隔断的茶玻几乎都配这个色，清玻配不锈钢。
      glass: { surface: "glass", color: 0xc9b18c },
      frame: { surface: "metal", color: 0xa08558 },
    }),
  ),
]);

/* -------------------------------------------------------------------------- */
/* 灯具 / 软装 / 地毯 / 窗帘 / 影音 / 钢琴 / 鱼缸                                */
/* -------------------------------------------------------------------------- */

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
      // 黄铜杆 / 臂 / 罩口圈；罩口圈与杆同铜色，只是稍暗一点出棱线。
      body: { surface: "metal", color: 0x9c6b3f },
      metal: { surface: "metal", color: 0x8a5c33 },
      trim: { surface: "metal", color: 0x8a5c33 },
      // 配重底板不跟随杆：「一截铜杆插在一块黑铁砣上」才是这类悬臂落地灯的真实构造。
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
      // 瓷白走烤漆杆，但五金（罩口圈 / 关节）仍是钢色 —— 白杆配白圈会糊成一根白棍。
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
      // 木杆 + 铜件：木杆落地灯在暖木色系里几乎必有。
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
      // 陶盆暖调这一档把**盆**当主角：红陶色盆 + 偏黄的叶，主干也跟着提到暖木色。
      pot: { surface: "ceramic", color: 0xc07a52 },
      trunk: { surface: "wood", color: 0x8c5a3c },
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
      // 花色这一档的包边要与毯面拉开（而不是派生出的近色）：它是唯一一个包边该跳出来的档位。
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
      // 深墨绿这一档最吃光：杆件提亮到浅钢色，深布前面才有一条亮线撑住轮廓。
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
      // 黑框这一档的柜体与缸框本来就近色，显式给一组，不靠派生 —— 派生出来会是一块偏蓝的深灰。
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
      // 原木这一档缸框仍是深木（不是被派生出的浅木）：实木缸架的水线一律是深色封边。
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
      // 亮光黑钢琴的键盘仍是象牙白 + 黑键，五金是黄铜 —— 三件都由 combo 的默认钉住。
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
      // 亮光白琴身 + 象牙白键盘 + 黑键 + 黄铜五金：白键与黑键都不随琴身变白 / 变灰。
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
      // 木壳钢琴的踏板与脚轮是黄铜件 —— 给钢色会立刻变成「工业风」，实物上不是这样。
      metal: { surface: "metal", color: 0xb08d5a },
      // 白键不跟木色走（否则会得到一排棕色琴键），黑键保持近黑。
    }),
  ),
]);

const SCREEN_STYLES: readonly MaterialStylePreset[] = Object.freeze([
  // 屏类的角色分工：**屏自己永远是那块深色的屏**，只有边框（trim）与机身随档位。
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

/* -------------------------------------------------------------------------- */
/* 台球桌 / 淋浴房 / 茶台 / 摆件：按模型特色单列的档位组                        */
/* -------------------------------------------------------------------------- */

// 台球桌的招牌是**绒面台呢**，而木器四档（原木 / 胡桃 / 白漆 / 黑砂）对台呢只会给一个
// 与木色无关的米色，档位名在这件上无从兑现（球桌也是木器族里唯一以织物为主料的一件）。
// 单列一组，档位改的就是台呢色，桌架随之配深木。
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

// 淋浴房是**玻璃 + 金属五金**，ceramic 组（亮白陶瓷 / 哑光石白 / 岩灰）会把整间房上成陶瓷色。
// 单列一组：档位改的是五金与框的颜色，玻璃隔断保持通透。
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

// 茶台组合（family `tea`）原先没有任何档位：木色只能跟着全局主题走。它的构件是
// 桌架 / 台板 / 沥水凹槽 / 瓷件 / 点缀五件，单列一组按茶台特色给档位。
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

// 摆件（decor-books / decor-vase / decor-tea-tray / decor-tissue-box / decor-small-plant）：
// family `decor` 原先没有档位组，摆件只能在两套主题色之间切换。这里按它们真实拥有的角色
// （base / light / dark / accent / leaf）单列一组。
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

/* -------------------------------------------------------------------------- */
/* 门（户型里的洞口构件）                                                      */
/* -------------------------------------------------------------------------- */

/**
 * 门：门框 / 门扇 / 玻璃 / 五金 / 卷帘 / 帘片 / 装饰线（角色见 `MODEL_SLOT_ROLES.door`）。
 *
 * 与其它组合不同：门**没声明的角色就落回主题** —— 白色烤漆门不必替用户决定玻璃通透度，
 * 黑框玻璃门也不必管卷帘。所以这里不做「谁补谁」的兜底，给了哪几个角色就登记哪几个，
 * 其余留给 `ROLE_RECIPES_BY_FAMILY.door` 那条与主题同源的基准。
 *
 * 但**每个门型至少要被某一档覆盖到大多数部件**：门型各有各的部件子集（实木门只有门框 +
 * 五金、卷帘门是门框 + 卷帘 + 帘片、入户门是门扇 + 装饰线 + 五金），漏掉哪个部件就等于
 * 那个门型「选了档位画面几乎没变」（L6c 钉住的正是这条）。所以卷帘 / 帘片 / 装饰线也逐档
 * 给出配方，与同档门框 / 门扇同料同色。
 */
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
      // 玻璃门（glass / sliding-glass）也有玻璃槽。这四档不调玻璃色号，配方里的 `glass`
      // 键就解析回**主题玻璃色**，画面与不加这行时逐像素一致；加它的意义是让玻璃槽
      // 在「材质属性」面板里显式成行并报出透明档位 —— `transparent` 只从档位配方来，
      // 不声明的话玻璃门的玻璃行永远不显示「透明」，看着像漏了一槽。
      glass: DOOR_GLASS_RECIPE,
      // 卷帘门（roller-shutter）没有门扇，只吃帘面 / 帘片两槽：档位不声明它们的话，
      // 用户给卷帘门换风格会「只有门框变了」——这正是 L6c 覆盖率断言在拦的那类回归。
      shutter: { surface: "fabric", color: 0xe9e5df },
      slat: { surface: "metal", color: 0xd3cfc8 },
      // 入户门门扇上的装饰横线。
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
      // 玻璃门的「门扇」就是那圈黑框：两块料同色，换色时整扇门一起走。
      door: { surface: "metal", color: 0x2a2c30, roughness: 0.4, metalness: 0.5 },
      glass: DOOR_GLASS_RECIPE,
      metal: { surface: "metal", color: 0x6d747b },
      shutter: { surface: "metal", color: 0x2a2c30 },
      slat: { surface: "metal", color: 0x3a3d42 },
      trim: { surface: "metal", color: 0x4a4e54 },
    }),
  ),
]);

/* -------------------------------------------------------------------------- */
/* 档位组 → 模型                                                               */
/* -------------------------------------------------------------------------- */

const PRESET_GROUPS: Readonly<Record<string, readonly MaterialStylePreset[]>> = Object.freeze({
  upholstery: UPHOLSTERY_STYLES,
  joinery: JOINERY_STYLES,
  pillar: PILLAR_STYLES,
  woodwork: WOOD_FURNITURE_STYLES,
  door: DOOR_STYLES,
  marbleTable: STONE_FURNITURE_STYLES,
  steelAppliance: STEEL_APPLIANCE_STYLES,
  device: DEVICE_STYLES,
  ceramic: CERAMIC_STYLES,
  // 台盆单独一组：洁具组共用的 `top` 在马桶上是便座盖板，石材台面档位只在浴室柜上成立。
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
});

/**
 * 逐模型的档位组：0.6.5 里按类型单独指定过的那些，这里逐一登记
 * （空串 = 明确不给档位：结构件 / 车辆 / 壁画 / 饰面墙等由专用收尾接管颜色）。
 */
const PRESET_GROUP_BY_MODEL_TYPE: Readonly<Record<string, string>> = Object.freeze({
  coffeetable: "marbleTable",
  squarecoffeetable: "woodwork",
  kitchenisland: "joinery",
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
  piano: "piano",
  aquarium: "aquarium",
  // 按模型特色单列的组：台球桌以绒面台呢为主料、淋浴房是玻璃 + 金属、茶台是 family `tea`
  // 里唯一有档位的模型（原先一档都没有）。
  "pool-table": "poolTable",
  shower: "shower",
  "tea-table-set": "teaTable",
  // 台盆（浴室柜）有独立的台面档位组（含大理石 / 黑石台面），不走洁具组 —— 见 BASIN_STYLES。
  basin: "basin",
  // 门是程序化几何，模型类型就是 `door`；档位组与之同名（组表见 DOOR_STYLES）。
  door: "door",
  // 结构件 / 专用收尾：不提供档位（对齐 0.6.5 的排除表，并把新项目的车辆一并排除）。
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
  // 绿植（family `plant`）走植物档位；摆件（family `decor`，即 decor-*）走摆件档位 ——
  // 两族的角色词表不同（plant 是 foliage/pot，decor 是 base/light/dark/leaf），不能共用一组。
  plant: "decor",
  decor: "ornament",
  lamp: "lamp",
  pillar: "pillar",
  aquatic: "aquarium",
});

/** `auto` 档在下拉里的显示名：柱体不是「跟随全局风格」，而是配墙。 */
const MATERIAL_STYLE_AUTO_LABEL_BY_MODEL_TYPE: Readonly<Record<string, string>> = Object.freeze({
  pillar: "配墙（跟随墙体）",
  pillar_round: "配墙（跟随墙体）",
  pillar_semicircle: "配墙（跟随墙体）",
  pillar_quarter: "配墙（跟随墙体）",
  pillar_quarterinner: "配墙（跟随墙体）",
});

/** 取某模型的档位组名；空串 / 未登记 → null（该物件不提供档位）。 */
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

/** 某模型可选的档位（不含「跟随全局风格」，那一项由界面统一补在最前）。 */
export function materialStyleOptionsFor(modelType: string): readonly MaterialStylePreset[] {
  const presetGroup = presetGroupFor(modelType);
  if (!presetGroup) return [];
  const builtinPresets = PRESET_GROUPS[presetGroup] || [],
    customPresets = customPresetsByGroup.get(presetGroup) || [];
  return customPresets.length ? [...builtinPresets, ...customPresets] : builtinPresets;
}

/** 该模型类型所属的档位组名；不支持档位的模型返回空串（个人预设按组共享）。 */
export function materialStyleGroupFor(modelType: string): string {
  return presetGroupFor(modelType) || "";
}

/** `auto` 档的显示名。 */
export function materialStyleAutoLabel(modelType: string): string {
  return MATERIAL_STYLE_AUTO_LABEL_BY_MODEL_TYPE[modelType] || "跟随全局风格";
}

/** 取某个档位定义；`auto` 或非法 id 返回 null。 */
export function materialStylePresetFor(modelType: string, styleId: unknown): MaterialStylePreset | null {
  if (!styleId || styleId === MATERIAL_STYLE_AUTO) return null;
  return materialStyleOptionsFor(modelType).find((preset) => preset.id === styleId) || null;
}

/** 把任意取值归一到「该模型下合法的档位 id」。 */
export function normalizeMaterialStyle(modelType: string, styleValue: unknown): string {
  if (typeof styleValue !== "string" || !styleValue || styleValue === MATERIAL_STYLE_AUTO) {
    return MATERIAL_STYLE_AUTO;
  }
  return materialStylePresetFor(modelType, styleValue) ? styleValue : MATERIAL_STYLE_AUTO;
}

/** 档位显示名；`auto` 给出该模型的跟随说法，非法 id 回落 auto。 */
export function materialStyleLabel(modelType: string, styleId: unknown): string {
  const preset = materialStylePresetFor(modelType, styleId);
  return preset ? preset.label : materialStyleAutoLabel(modelType);
}

/** 档位附带的调色板覆盖（合并进该物件的 palette）；auto / 非法 id 返回空表。 */
export function materialStylePaletteColors(modelType: string, styleId: unknown): Record<string, number> {
  const preset = materialStylePresetFor(modelType, styleId);
  return preset ? { ...preset.colors } : {};
}

/* -------------------------------------------------------------------------- */
/* 档位色卡的缩略色                                                            */
/* -------------------------------------------------------------------------- */

/**
 * 色卡缩略图的取色顺序：先「大面」后「小件」。这一序列表的是**可见面的主次**，
 * 不是角色在表里的书写顺序（`woodCombo` 里 `top` 写在最前，派生角色写在后面）。
 */
const MATERIAL_STYLE_SWATCH_ROLE_ORDER: readonly string[] = Object.freeze([
  "top",
  "surface",
  "slab",
  "body",
  "door",
  // 门框排在玻璃前：玻璃门的招牌色是那圈框（黑框 / 木框），玻璃只是中间那片。
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

/** 角色在色卡上的排序权重（越靠前越是「一眼看到的面」）；未登记的角色排最后。 */
function swatchRoleRank(role: string): number {
  const rank = MATERIAL_STYLE_SWATCH_ROLE_ORDER.indexOf(role);
  return rank < 0 ? MATERIAL_STYLE_SWATCH_ROLE_ORDER.length : rank;
}

const swatchHex = (colorValue: number) => "#" + (colorValue & 0xffffff).toString(16).padStart(6, "0");

/**
 * 档位色卡上显示的缩略色（最多四格）。
 *
 * 必须取**这一档真会画到这件物件上的颜色**，不能拿一份写死的调色板键去合并主题色板：
 *
 *  - 写死的键表取不到柜类真正的料键（`cabinetWood` / `cabinetBody` / `cabinetDoor`），
 *    于是「木柜白门」的色卡永远显示家具暖木色 #c49a6c —— 柜体实际刷的是 #5a3a22 深木
 *    + #f5f3ef 白门，色卡与物件对不上；
 *  - 档位没声明的键会**漏进当前主题色**：木器四档都不声明 `countertop`，色卡第四格
 *    就恒为主题台面色，四档看起来最后一格一模一样。这正是「预设值与实际不匹配」。
 *
 * 取色口径（与加载器同一条）：`options.roles` 给了这件模型**真实槽位角色**时按其槽位顺序
 * 逐槽上色 —— 有档位配方就用档位配方，没有就回落到家族底表（加载器对未覆盖角色的做法），
 * 这样色卡与画面逐格对应；拿不到槽位角色时（模型还在加载）退化成「按这一档自己的角色
 * 配方取色」，取到的仍全部是档位自己的料，不会漏主题色。
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
  // 与 `materialStyleRecipeFor` 同一条出图口径：解析色号后还要逐通道缩放 `multiply`
  // （派生出来的 shadow / back 这类角色靠它压暗），漏掉这一手色卡会比物件亮一档。
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
    // 按**可见面主次**排，不按槽位号排：槽位号是资产内部的顺手顺序（桌子把拉手放在 0 号），
    // 照搬会让色卡第一格永远是五金灰、桌面木色反而排在后面。
    const seenRoles = new Set<string>();
    const orderedRoles = [...modelRoles]
      .sort((a, b) => swatchRoleRank(a) - swatchRoleRank(b))
      .filter((roleName) => {
        if (seenRoles.has(roleName)) return false;
        seenRoles.add(roleName);
        return true;
      });
    for (const roleName of orderedRoles) {
      if (swatchColors.length >= limit) break;
      // 逐模型覆写（木顶板 / 台球 / 镜面…）与物件出图同源，否则色卡会显示档位原配方。
      const styleRecipe = styleRoleRecipeFor(options?.modelType, roleName, preset);
      if (styleRecipe) {
        push(styleRecipe);
        continue;
      }
      // 这一档没有覆盖该角色：加载器会保留角色表（逐模型 → 家族 → 通用）的颜色，
      // 所以色卡也要显示那支料，否则色卡会缺格 / 显示成主题色。
      const roleColor = options?.modelType
        ? materialRoleRecipeForRole(options.modelType, roleName, palette)?.colorValue
        : undefined;
      if (roleColor !== undefined) push(undefined, roleColor);
    }
  }
  // 槽位角色未知 / 角色名对不上档位（改名后残留）时，退回「按这一档自己的角色配方取色」：
  // 只会在色卡上少一格，不会整条塌成占位灰。
  if (!swatchColors.length) {
    for (const roleName of MATERIAL_STYLE_SWATCH_ROLE_ORDER) {
      if (swatchColors.length >= limit) break;
      push(styleRoleRecipeFor(options?.modelType, roleName, preset));
    }
  }
  // 只改调色板键的档位（石材 / 玻璃这类整件换料）：角色配方里没有它的料。
  if (!swatchColors.length) {
    for (const paletteKey of MATERIAL_STYLE_SWATCH_PALETTE_KEYS) {
      if (swatchColors.length >= limit) break;
      const paletteColor = palette[paletteKey];
      if (typeof paletteColor === "number") push(undefined, paletteColor);
    }
  }
  return swatchColors.length ? swatchColors : ["#6b7280"];
}

/* -------------------------------------------------------------------------- */
/* 个人预设：把当前配色存成一档，跨项目复用                                     */
/* -------------------------------------------------------------------------- */

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
  /**
   * 该槽位当前用的石材板色号（`""` / 不填 = 不是石板）。
   *
   * 采样必须连贴图一起带走：只钉颜色的话，「把大理石台面存成我的预设」再选回来会变成
   * 一块没有纹路的白台面 —— 色号对了，看起来却完全不是同一件东西。
   */
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
    // 个人预设同样是「档位」：走一遍角色补齐，组内其它模型缺的角色才能跟着上色。
    roles: Object.freeze(deriveStyleRoles(Object.fromEntries(roleEntries))),
  });
}

/**
 * 装载个人预设（由 studio-app 从 localStorage 读出后调用；校验脚本不调用，保持纯函数语义）。
 *
 * 返回值是**通过校验**的记录，调用方据此决定要不要把打扫过的结果写回存储。脏记录一律丢弃：
 * 这份数据可能被手工编辑过，不能直接进渲染链。
 */
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

/**
 * 把「这件物件此刻的出图结果」打成一档个人预设。
 *
 * 逐槽钉住当前显色与表面参数（所见即所得），同时继承当前内置档位的调色板覆盖 —— 后者决定
 * 那些**读调色板而不是读角色**的着色收尾（柜门返边、床尾巾…），钉角色不会覆盖它们。
 */
export function buildCustomMaterialStyleRecord(
  customId: string,
  label: string,
  groupName: string,
  snapshotSlots: readonly MaterialStyleSnapshotSlot[],
  basePreset: MaterialStylePreset | null,
): MaterialStyleCustomRecord | null {
  if (!customId.startsWith(MATERIAL_STYLE_CUSTOM_PREFIX) || !PRESET_GROUPS[groupName]) return null;
  const roles: Record<string, RoleRecipe> = {};
  // 档位是按**角色**下料的：同一角色出现多个槽位时只能留一种颜色（后采样的赢，
  // 与运行时的 `roles[role]` 写覆盖顺序一致），否则档位表里会出现「同一角色的两个颜色」，
  // 复用时无从取舍。
  for (const snapshotSlot of snapshotSlots) {
    if (!snapshotSlot?.role) continue;
    const colorValue = hexColorToNumber(snapshotSlot.color);
    if (colorValue === null) continue;
    roles[snapshotSlot.role] = {
      color: colorValue,
      roughness: clampUnitInterval(snapshotSlot.roughness, 0.5),
      metalness: clampUnitInterval(snapshotSlot.metalness, 0),
      // 石材板色号跟着角色一起存：个人预设同样要能复现大理石纹路。
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

/**
 * 采样时被多个槽位共用的角色（存档会把这些槽位合并成一种颜色）。
 *
 * 面板要把这件事说出来：「存为我的预设」是所见即所得的，但角色共用的槽位是唯一做不到
 * 逐槽钉色的地方 —— 档位按角色下料，一个角色只能配一种颜色。
 */
export function materialStyleCollapsedRoles(
  snapshotSlots: readonly MaterialStyleSnapshotSlot[],
): string[] {
  const slotsByRole = new Map<string, number>();
  for (const snapshotSlot of snapshotSlots) {
    if (!snapshotSlot?.role) continue;
    slotsByRole.set(snapshotSlot.role, (slotsByRole.get(snapshotSlot.role) || 0) + 1);
  }
  return [...slotsByRole.entries()]
    .filter(([, slotCount]) => slotCount > 1)
    .map(([roleName]) => roleName);
}

/* -------------------------------------------------------------------------- */
/* 档位的角色配方：材质流水线的最后一手（逐槽覆盖色之前）                        */
/* -------------------------------------------------------------------------- */

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

/**
 * 取某材质名在**当前档位**下的配方。
 *
 * `palette.materialStyle` 是逐物件的档位 id（由 studio-app 并进加载选项）；
 * 档位为 auto / 非法 / 模型不支持时返回 null，调用方据此不动材质。
 */
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
  // 石材板色号按角色取；角色没声明时回落档位级（档位级的语义见 MaterialStylePreset.slab）。
  // 未声明 = 该角色**不是**石材板：调用方据此把上游（角色表）打上的石材贴图摘掉，
  // 否则「黑色岩板」这类档位会顶着角色表的白色大理石纹路出图。
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

/**
 * 取某档位下**指定角色**的配方色（跳过「材质名 → 角色」那一步）。
 *
 * 给「同一支料要覆盖到没有独立槽位的面」的收尾用：储物柜（`cabinet.glb`）把柜体与两扇柜门
 * 并进**同一个闭合箱**（`cabinet-material-0`），没有独立的柜体槽。选了档位时，加载器按面法线
 * 把非前脸刷成柜体色 —— 这支色必须与同档位吊柜的柜体（`body` 角色）逐档一致，否则「木柜白门」
 * 的储物柜会是一块全白的门料色，和同档位的吊柜（木柜体 + 白门）配不成套。
 *
 * 与 `materialStyleRecipeFor` 同一条取值口径：档位覆盖了该角色就用档位配方（含 `multiply`
 * 逐通道缩放），没覆盖则回落角色表 —— 与加载器对未覆盖角色的做法一致。
 */
export function materialStyleRoleColorFor(
  modelType: string,
  role: string,
  palette: Record<string, unknown> | null | undefined,
): number | undefined {
  const preset = materialStylePresetFor(modelType, palette?.materialStyle);
  const roleRecipe = preset?.roles?.[role];
  if (roleRecipe) {
    const colorValue = resolveMaterialPaletteColor(palette, roleRecipe.color);
    return Number.isFinite(colorValue)
      ? scaleMaterialColorChannels(colorValue, roleRecipe.multiply ?? 1)
      : undefined;
  }
  return materialRoleRecipeForRole(modelType, role, palette)?.colorValue;
}

/**
 * 该模型的档位组里，**哪些角色**会拿到石材板贴图（跨全部档位的并集）。
 *
 * 装载期补平面 UV 时用它做前置判断：石材整图要贴在一次投影上，而 GLB 自带的往往是
 * 「立方体六面各贴一遍」的 UV。判据必须是纯函数（不依赖当前选中档位）—— 几何 UV 一旦
 * 写进模板缓存就跟着模型走，不能随用户换档位而变，所以取并集（多补的槽位只有在真被贴上
 * 石材图时才会用到这套 UV）。
 */
export function materialStyleStoneSlabRoles(modelType: string): ReadonlySet<string> {
  const slabRoles = new Set<string>();
  for (const preset of materialStyleOptionsFor(modelType))
    for (const [roleName, roleRecipe] of Object.entries(preset.roles))
      if (isStoneSlabFlavor(roleRecipe.slab)) slabRoles.add(roleName);
  return slabRoles;
}

/** 全部档位的扁平表（跨组去重前的原始顺序）：供校验脚本逐档体检，也便于报表。 */
const MATERIAL_STYLE_PRESET_LIST: readonly MaterialStylePreset[] = Object.freeze(
  Object.values(PRESET_GROUPS).reduce<MaterialStylePreset[]>(
    (allPresets, groupPresets) => [...allPresets, ...groupPresets],
    [],
  ),
);

/** 汇总：便于核对与脚本校验。 */
export const MATERIAL_STYLE_SUMMARY = Object.freeze({
  auto: MATERIAL_STYLE_AUTO,
  groups: Object.fromEntries(
    Object.entries(PRESET_GROUPS).map(([groupName, presetList]) => [
      groupName,
      presetList.map((preset) => preset.id),
    ]),
  ),
  groupCount: Object.keys(PRESET_GROUPS).length,
  presetCount: MATERIAL_STYLE_PRESET_LIST.length,
  groupByModelType: PRESET_GROUP_BY_MODEL_TYPE,
  groupByFamily: PRESET_GROUP_BY_FAMILY,
});
