/**
 * 逐物件的「材质风格」属性（materialStyle）。
 */
import {
  APPLIANCE_MODEL_ITEM_TYPES,
  EXTERNAL_MODEL_ITEM_TYPES,
  HOME_ITEM_TYPES
} from "./studio-item-types.js?v=2609271508";

/** 默认值：跟随全局风格。 */
export const MATERIAL_STYLE_AUTO = "auto";

/**
 * `auto` 档在下拉里的显示名：多数类型是「跟随全局风格」，但**柱体**不是。
 */
const MATERIAL_STYLE_AUTO_LABEL_BY_ITEM_TYPE = Object.freeze({
  pillar: "配墙（跟随墙体）"
});

/** 取某类型 `auto` 档的显示名（未登记的类型回落到通用说法）。 */
export function materialStyleAutoLabel(itemType) {
  return MATERIAL_STYLE_AUTO_LABEL_BY_ITEM_TYPE[itemType] || "跟随全局风格";
}

/**
 * 不参与「材质风格」的类型：
 */
export const MATERIAL_STYLE_EXCLUDED_ITEM_TYPES = Object.freeze(
  new Set([
    "mural",
    "featurewall",
    "stairs",
    "steelstairs",
    "glassstairs",
    "floatingstairs",
    "smallcar",
    "elevator"
  ])
);

/**
 * 支持「材质风格」的全部类型：家居（含软装 / 家电 / 洁具）+ 可被外部模型替换的类型 + 家电模型类型，
 */
export const MATERIAL_STYLE_ITEM_TYPES = new Set(
  [...HOME_ITEM_TYPES, ...EXTERNAL_MODEL_ITEM_TYPES, ...APPLIANCE_MODEL_ITEM_TYPES].filter(
    itemType => !MATERIAL_STYLE_EXCLUDED_ITEM_TYPES.has(itemType)
  )
);

/**
 * 质感族：决定用哪张程序化贴图，以及粗糙度 / 金属度落在哪一档。
 */
const SURFACE_ROUGHNESS = Object.freeze({
  fabric: 0.92,
  leather: 0.62,
  wood: 0.66,
  marble: 0.34,
  stone: 0.55,
  metal: 0.32,
  lacquer: 0.24,
  glass: 0.12,
  ceramic: 0.42,
  foliage: 0.9,
  paint: 0.6,
  none: null
});
const SURFACE_METALNESS = Object.freeze({
  metal: 0.3,
  glass: 0.04,
  lacquer: 0.08,
  marble: 0.03,
  stone: 0.04,
  leather: 0.02,
  fabric: 0,
  wood: 0,
  ceramic: 0.02,
  foliage: 0,
  paint: 0.02,
  none: null
});

/**
 * 把颜色朝白（amount > 0）或朝黑（amount < 0）插值。纯整数运算，不引 THREE。
 * @param {number} color 0xRRGGBB。
 * @param {number} amount -1..1。
 * @returns {number} 0xRRGGBB。
 */
function shadeColor(color, amount) {
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const channel = shift => {
    const value = (color >> shift) & 255;
    return Math.round(value + (target - value) * weight);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
/**
 * 补齐 furniture* 四档中缺失的键。
 * @param {object} colors 风格显式声明的覆盖键。
 * @returns {object} 四档齐全的覆盖键。
 */
function completeFurnitureRamp(colors) {
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
    // 纯装饰类（只改叶色 / 台面 / 玻璃）没有可作基准的实体色：不硬造四档，
    return { ...colors };
  }
  return {
    furniture: colors.furniture ?? rampBase,
    furnitureLight: colors.furnitureLight ?? shadeColor(rampBase, 0.72),
    furnitureSoft: colors.furnitureSoft ?? shadeColor(rampBase, 0.28),
    furnitureDark: colors.furnitureDark ?? shadeColor(rampBase, -0.42),
    ...colors
  };
}

/**
 * 把「按角色的组合」编译成可直接套用的配方表。
 */
function compileRoleRecipes(byRole) {
  if (!byRole) {
    return null;
  }
  const compiled = {};
  for (const [role, recipe] of Object.entries(byRole)) {
    const roleSurface = recipe.surface ?? null;
    compiled[role] = Object.freeze({
      slab: recipe.slab ?? null,
      surface: roleSurface,
      color: recipe.color,
      roughness: recipe.roughness ?? SURFACE_ROUGHNESS[roleSurface] ?? null,
      metalness: recipe.metalness ?? SURFACE_METALNESS[roleSurface] ?? null,
      // 质感贴图在 UV 上的平铺次数。运行侧读的是 `roleRecipe.repeat ?? 2`
      repeat: recipe.repeat ?? null
    });
  }
  return Object.freeze(compiled);
}

/**
 * 定义一个风格档位。
 * @param {string} id 值会落进草稿，改文字可以、改 id 不行。
 * @param {string} label 下拉里显示的中文名。
 * @param {string} surface 整件质感族（键见 SURFACE_ROUGHNESS）。仅在**没有** byRole 时作为兜底使用。
 * @param {object} colors 覆盖调色板的键值（键名须与 STUDIO_PALETTE / WARM_HOME_STYLE 一致）；
 * @param {object} [byRole] 「档位即组合」：按**材质角色**给配方，供流水线模型（材质名带角色的那批）。
 */
function defineStyle(id, label, surface, colors, byRole = null) {
  return Object.freeze({
    id: id,
    label: label,
    surface: surface,
    colors: Object.freeze(completeFurnitureRamp(colors)),
    roles: compileRoleRecipes(byRole)
  });
}

/**
 * 布艺座具 / 卧床的组合：软包 + 框架 + 脚 + 可分离件。
 */
function fabricCombo({ upholstery, leg, frame, accent, cushion, top, trim, metal, body, fabric }) {
  return {
    upholstery: upholstery,
    // 扶手 / 撞色面默认与主体同一种织物（真实沙发上扶手与坐垫通常同料）。
    accent: accent ?? upholstery,
    // 抱枕默认同织物；给对比色时才是「抱枕撞色」那一路。
    cushion: cushion ?? upholstery,
    // 床品 / 围栏布面默认也与主体同料。
    fabric: fabric ?? upholstery,
    // 外露木框架与腿通常同一种木料。
    frame: frame ?? leg,
    leg: leg,
    // 床台 / 榻榻米木台：默认为框架色（它与框架是同一批木作）。
    body: body ?? frame ?? leg,
    top: top ?? upholstery,
    trim: trim ?? frame ?? leg,
    // 五金给一个通用钢色兜底：门把手、脚轮、气压柱的金属与织物 / 木料的档位无关，
    metal: metal ?? { surface: "metal", color: 0x9aa1a8 }
  };
}

/**
 * 柜类的组合：柜体 / 柜面 / 台面 / 五金一次说清。
 */
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
  accent
}) {
  const interiorRecipe = Number.isFinite(body?.color)
    ? { surface: "wood", color: shadeColor(body.color, 0.45) }
    : door;
  // 玻璃门 / 玻璃层板在柜类里是独立槽位。默认取**玻璃柜（glasscabinet）那扇玻璃门的玻璃**：
  const glassRecipe = { surface: "glass", color: 0xa9c5d3 };
  // 水槽盆体 / 灶面与炉架的兜底料：厨柜里唯二**不随木色走**的金属面（不锈钢水槽、银黑灶面）。
  const sinkRecipe = { surface: "metal", color: 0xb9bfc5, roughness: 0.24, metalness: 0.62 };
  const cooktopRecipe = { surface: "metal", color: 0x33363a, roughness: 0.2, metalness: 0.6 };
  // 镜面（梳妆台的立镜）：与 sanitaryCombo 里那份同料 —— 镜面是**不透明**的镀银面，
  const mirrorRecipe = { surface: "glass", color: 0xdbe4ea, roughness: 0.08, metalness: 0.35 };
  // 书脊 / 书封：**不跟木色走**。柜体换胡桃还是白漆，书架上那批书仍然是同一批米黄纸脊 ——
  const bookRecipe = { surface: "paint", color: 0xd6c6a4 };
  // 敞开格里的内容物（鞋柜里那一双双鞋）：**不跟木色走**，理由与上面书脊那条一致 —— 跟木色走
  const stashRecipe = { surface: "leather", color: 0x6f7176 };
  // 撞色书脊与摆件：陶土色。书柜需要一点点「不是木头」的颜色把满架同色的书分开，
  const accentRecipe = { surface: "ceramic", color: 0xb0663f };
  return {
    body: body,
    door: door,
    drawer: drawer ?? door,
    trim: trim ?? body,
    shelf: shelf ?? body,
    book: book ?? bookRecipe,
    // 敞开格里的内容物默认取上面那一条「不跟木色走」的配方：鞋柜是唯一用到它的类型，
    stash: stash ?? stashRecipe,
    accent: accent ?? accentRecipe,
    // 踢脚默认与柜体同料（真实柜子的踢脚要么同色、要么同色更深一档，撞色的很少）。
    base: base ?? body,
    // 柜脚默认跟随踢脚：床头柜 / 电视柜 / 梳妆台这类「箱体坐在四条腿上」的柜子，
    leg: leg ?? base ?? body,
    top: top,
    interior: interior ?? interiorRecipe,
    glass: glass ?? glassRecipe,
    mirror: mirror ?? mirrorRecipe,
    metal: metal,
    // 水槽盆体 / 灶面与炉架：厨柜里唯二不随木色走的金属面，见上面两个兜底料的说明。
    sink: sink ?? sinkRecipe,
    cooktop: cooktop ?? cooktopRecipe
  };
}

// ── 布艺软装 ───────────────────────────────────────────────────────────────
const FABRIC_STYLES = Object.freeze([
  defineStyle(
    "fabric-warm",
    "暖白布艺",
    "fabric",
    {
      furnitureLight: 0xf3e7d8,
      furnitureSoft: 0xe4d5c2,
      sofaFabric: 0xf3e7d8,
      diningLinen: 0xf3e7d8
    },
    fabricCombo({
      upholstery: { surface: "fabric", color: 0xf3e7d8 },
      leg: { surface: "wood", color: 0xb08a5e },
      accent: { surface: "fabric", color: 0xc09a6e }
    })
  ),
  defineStyle(
    "linen-grey",
    "亚麻灰",
    "fabric",
    {
      furnitureLight: 0xd9d7d0,
      furnitureSoft: 0xb9b6ad,
      sofaFabric: 0xd9d7d0,
      diningLinen: 0xd9d7d0
    },
    fabricCombo({
      upholstery: { surface: "fabric", color: 0xd9d7d0 },
      leg: { surface: "wood", color: 0x9c6b3f },
      accent: { surface: "fabric", color: 0x8f8b82 }
    })
  ),
  defineStyle(
    "sage-mist",
    "雾霾绿",
    "fabric",
    {
      furnitureLight: 0xcbd6c4,
      furnitureSoft: 0xa8b79e,
      sofaFabric: 0xcbd6c4,
      diningSage: 0xa8b79e
    },
    fabricCombo({
      upholstery: { surface: "fabric", color: 0xcbd6c4 },
      leg: { surface: "wood", color: 0xa9814f },
      // 雾霾绿配沙色搭毯：同明度的邻近色只会糊成一片，撞一个暖沙才看得出是两层。
      accent: { surface: "fabric", color: 0xc2a184 }
    })
  ),
  defineStyle(
    "clay-terracotta",
    "陶土棕",
    "fabric",
    {
      furnitureLight: 0xd8b49c,
      furnitureSoft: 0xb98d73,
      sofaFabric: 0xd8b49c
    },
    fabricCombo({
      upholstery: { surface: "fabric", color: 0xd8b49c },
      leg: { surface: "metal", color: 0x3a3a3c },
      accent: { surface: "fabric", color: 0xa8765a }
    })
  )
]);

// ── 皮革（沙发 / 单椅 / 床头）─────────────────────────────────────────────
// 皮革组的腿都是金属细腿：皮沙发的做法就是「皮面 + 细金属脚」，配木脚会读成两件拼起来的家具。
const LEATHER_STYLES = Object.freeze([
  defineStyle(
    "leather-tan",
    "焦糖皮",
    "leather",
    {
      furnitureLight: 0xc98a52,
      furnitureSoft: 0xb0703c,
      sofaFabric: 0xb0703c
    },
    fabricCombo({
      upholstery: { surface: "leather", color: 0xb0703c },
      leg: { surface: "metal", color: 0x3a3a3c }
    })
  ),
  defineStyle(
    "leather-cognac",
    "干邑棕",
    "leather",
    {
      furnitureLight: 0xa75c2c,
      furnitureSoft: 0x8c4a22,
      sofaFabric: 0x8c4a22
    },
    fabricCombo({
      upholstery: { surface: "leather", color: 0x8c4a22 },
      leg: { surface: "metal", color: 0x2e2e30 }
    })
  ),
  defineStyle(
    "leather-black",
    "墨黑皮",
    "leather",
    {
      furnitureLight: 0x3c3a38,
      furnitureSoft: 0x262422,
      sofaFabric: 0x262422
    },
    fabricCombo({
      upholstery: { surface: "leather", color: 0x262422 },
      leg: { surface: "metal", color: 0x2e2e30 },
      // 黑皮配深色木框架：整件全黑会看不出结构。
      frame: { surface: "wood", color: 0x3a2418 }
    })
  )
]);

// ── 木作柜体 ──────────────────────────────────────────────────────────────
/**
 * 柜类四档的「柜体 / 柜面」两支料。
 */
const JOINERY_TONE_BY_STYLE = Object.freeze({
  "joinery-wood-white": Object.freeze({
    body: Object.freeze({ surface: "wood", color: 0x5a3a22 }),
    door: Object.freeze({ surface: "lacquer", color: 0xf5f3ef })
  }),
  "joinery-oak": Object.freeze({
    body: Object.freeze({ surface: "wood", color: 0xc49a6c }),
    door: Object.freeze({ surface: "wood", color: 0xd8b98f })
  }),
  "joinery-walnut": Object.freeze({
    body: Object.freeze({ surface: "wood", color: 0x5a3a22 }),
    door: Object.freeze({ surface: "wood", color: 0x6b4526 })
  }),
  "joinery-lacquer": Object.freeze({
    body: Object.freeze({ surface: "lacquer", color: 0x2e2a28 }),
    door: Object.freeze({ surface: "lacquer", color: 0x3a3a3c })
  })
});
// 「档位即组合」的样板族：每个档位一次说清柜体、柜面、台面、五金。
const JOINERY_STYLES = Object.freeze([
  defineStyle(
    "joinery-wood-white",
    "木柜白门",
    "wood",
    {
      cabinetWood: 0x3d2818,
      cabinetBody: 0x3d2818,
      cabinetDoor: 0xffffff,
      furniture: 0xc49a6c,
      furnitureSoft: 0xc49a6c,
      furnitureDark: 0x3d2818,
      countertop: 0xf2f1ed
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-wood-white"].body,
      door: JOINERY_TONE_BY_STYLE["joinery-wood-white"].door,
      top: { surface: "stone", color: 0xf2f1ed },
      metal: { surface: "metal", color: 0x9aa1a8 }
    })
  ),
  defineStyle(
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
      countertop: 0xede7db
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-oak"].body,
      door: JOINERY_TONE_BY_STYLE["joinery-oak"].door,
      top: { surface: "stone", color: 0xede7db },
      metal: { surface: "metal", color: 0x8c8f94 }
    })
  ),
  defineStyle(
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
      countertop: 0x2b2b2e
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-walnut"].body,
      door: JOINERY_TONE_BY_STYLE["joinery-walnut"].door,
      top: { surface: "stone", color: 0x2b2b2e },
      metal: { surface: "metal", color: 0x2e2e30 }
    })
  ),
  defineStyle(
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
      countertop: 0x2b2b2e
    },
    joineryCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-lacquer"].body,
      door: JOINERY_TONE_BY_STYLE["joinery-lacquer"].door,
      top: { surface: "stone", color: 0x2b2b2e },
      metal: { surface: "metal", color: 0x44484d }
    })
  )
]);

// ── 柱体：与墙一致（auto 档）+ 与柜同料（本表四档）─────────────────────────
/**
 * 柱体的角色组合：柱身 / 柱脚 / 柱帽三段。
 */
function pillarCombo({ body, base, trim }) {
  return {
    body: body,
    base: base ?? body,
    trim: trim ?? body
  };
}
const PILLAR_STYLES = Object.freeze([
  // ── 柜体系：与柜类「材质风格」下拉同名同料（柱身取柜面、柱脚柱帽取柜体）──
  defineStyle(
    "joinery-wood-white",
    "木柜白门（配柜）",
    "wood",
    {
      cabinetBody: JOINERY_TONE_BY_STYLE["joinery-wood-white"].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE["joinery-wood-white"].door.color
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-wood-white"].door,
      base: JOINERY_TONE_BY_STYLE["joinery-wood-white"].body,
      trim: JOINERY_TONE_BY_STYLE["joinery-wood-white"].body
    })
  ),
  defineStyle(
    "joinery-oak",
    "浅橡木（配柜）",
    "wood",
    {
      cabinetBody: JOINERY_TONE_BY_STYLE["joinery-oak"].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE["joinery-oak"].door.color
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-oak"].door,
      base: JOINERY_TONE_BY_STYLE["joinery-oak"].body,
      trim: JOINERY_TONE_BY_STYLE["joinery-oak"].body
    })
  ),
  defineStyle(
    "joinery-walnut",
    "胡桃木（配柜）",
    "wood",
    {
      cabinetBody: JOINERY_TONE_BY_STYLE["joinery-walnut"].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE["joinery-walnut"].door.color
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-walnut"].door,
      base: JOINERY_TONE_BY_STYLE["joinery-walnut"].body,
      trim: JOINERY_TONE_BY_STYLE["joinery-walnut"].body
    })
  ),
  defineStyle(
    "joinery-lacquer",
    "深色烤漆（配柜）",
    "lacquer",
    {
      cabinetBody: JOINERY_TONE_BY_STYLE["joinery-lacquer"].body.color,
      cabinetDoor: JOINERY_TONE_BY_STYLE["joinery-lacquer"].door.color
    },
    pillarCombo({
      body: JOINERY_TONE_BY_STYLE["joinery-lacquer"].door,
      base: JOINERY_TONE_BY_STYLE["joinery-lacquer"].body,
      trim: JOINERY_TONE_BY_STYLE["joinery-lacquer"].body
    })
  )
]);

// ── 木器家具（桌椅 / 茶几 / 床架）─────────────────────────────────────────
/**
 * 木器家具的组合：台面 / 腿 / 箱体 / 抽屉面 / 横撑 / 五金。
 */
function woodCombo({ top, leg, metal, body, drawer, shelf, trim, base, upholstery, cushion }) {
  return {
    top: top,
    leg: leg,
    // 没有箱体的桌几（边几、凳）让 cabinet 侧的 body 跟随台面；柜体件（玄关台、上下床）自行给。
    body: body ?? top,
    drawer: drawer ?? top,
    shelf: shelf ?? top,
    // 横撑默认比台面深一档，近看才有「构件」的层次（真实家具的望板也是这么处理的）。
    trim: trim ?? body ?? top,
    base: base ?? leg ?? metal,
    // 床垫 / 床品：木器族里唯一不随木色走的一档 —— 木架换胡桃还是白漆，床垫都还是那个中性米白
    upholstery: upholstery ?? { surface: "fabric", color: 0xf3e7d8 },
    cushion: cushion ?? upholstery ?? { surface: "fabric", color: 0xf3e7d8 },
    metal: metal
  };
}

/**
 * 石材件的组合：石板 / 石座 / 五金。
 */
function stoneCombo({ top, base, metal, trim, drawer, shelf }) {
  return {
    top: top,
    base: base,
    // 石材柜的抽屉面与层板默认跟随台面那一批石作。
    drawer: drawer ?? top,
    shelf: shelf ?? top,
    // 收边与五金：收边取石座色（它贴着的就是石座），五金给通用钢色。
    trim: trim ?? base,
    metal: metal ?? { surface: "metal", color: 0x8c8f94 }
  };
}

const STONE_SLAB_ON_WHITE = Object.freeze({
  slab: "marble",
  color: 0xffffff,
  roughness: 0.24,
  metalness: 0.03
});
const STONE_SLAB_ON_DARK = Object.freeze({
  slab: "marble-dark",
  color: 0xffffff,
  roughness: 0.18,
  metalness: 0.04
});

const MARBLE_TABLE_STYLES = Object.freeze([
  defineStyle(
    "stone-white-black",
    "白石黑座",
    "marble",
    {
      countertop: 0xf2f1ed,
      furniture: 0xf2f1ed,
      furnitureSoft: 0xe3e2dd,
      furnitureDark: 0x1e2023
    },
    stoneCombo({
      top: STONE_SLAB_ON_WHITE,
      base: STONE_SLAB_ON_DARK
    })
  ),
  defineStyle(
    "stone-all-white",
    "全白大理石",
    "marble",
    {
      countertop: 0xf4f3ef,
      furniture: 0xf4f3ef,
      furnitureSoft: 0xe6e5e0,
      furnitureDark: 0xd2d0c9
    },
    stoneCombo({
      top: STONE_SLAB_ON_WHITE,
      base: { ...STONE_SLAB_ON_WHITE, color: 0xd9d8d3 }
    })
  ),
  defineStyle(
    "stone-all-black",
    "全黑大理石",
    "stone",
    {
      countertop: 0x1e2023,
      furniture: 0x1e2023,
      furnitureSoft: 0x33363a,
      furnitureDark: 0x121315
    },
    stoneCombo({
      top: STONE_SLAB_ON_DARK,
      base: { ...STONE_SLAB_ON_DARK, color: 0xd2d6dd }
    })
  ),
  defineStyle(
    "stone-travertine",
    "米黄洞石",
    "stone",
    {
      countertop: 0xdcd0b8,
      furniture: 0xdcd0b8,
      furnitureSoft: 0xe8ddc8,
      furnitureDark: 0xbfae92
    },
    stoneCombo({
      top: { surface: "stone", color: 0xdcd0b8 },
      base: { surface: "stone", color: 0xc4b294 }
    })
  )
]);

// ── 木器家具 ──────────────────────────────────────────────────────────────
const WOOD_FURNITURE_STYLES = Object.freeze([
  defineStyle(
    "wood-natural",
    "原木本色",
    "wood",
    {
      wood: 0xc49a6c,
      woodLight: 0xd8b98f,
      woodDark: 0x9c6b3f,
      furniture: 0xc49a6c,
      furnitureSoft: 0xd8b98f,
      furnitureDark: 0x9c6b3f
    },
    woodCombo({
      top: { surface: "wood", color: 0xc49a6c },
      leg: { surface: "wood", color: 0xbc9163 },
      drawer: { surface: "wood", color: 0xd8b98f },
      trim: { surface: "wood", color: 0x9c6b3f },
      metal: { surface: "metal", color: 0x8c8f94 }
    })
  ),
  defineStyle(
    "wood-walnut",
    "胡桃木",
    "wood",
    {
      wood: 0x6b4526,
      woodLight: 0x855c36,
      woodDark: 0x4a2e1a,
      furniture: 0x6b4526,
      furnitureSoft: 0x855c36,
      furnitureDark: 0x4a2e1a
    },
    woodCombo({
      top: { surface: "wood", color: 0x6b4526 },
      leg: { surface: "wood", color: 0x5f3d21 },
      drawer: { surface: "wood", color: 0x855c36 },
      trim: { surface: "wood", color: 0x4a2e1a },
      metal: { surface: "metal", color: 0x3a3a3c }
    })
  ),
  defineStyle(
    "wood-white-lacquer",
    "白色烤漆",
    "lacquer",
    {
      wood: 0xf5f3ef,
      woodLight: 0xfbfaf8,
      woodDark: 0xdcd8d2,
      furniture: 0xf5f3ef,
      furnitureSoft: 0xfbfaf8,
      furnitureDark: 0xdcd8d2
    },
    woodCombo({
      top: { surface: "lacquer", color: 0xf5f3ef },
      leg: { surface: "lacquer", color: 0xefece6 },
      drawer: { surface: "lacquer", color: 0xfbfaf8 },
      trim: { surface: "lacquer", color: 0xdcd8d2 },
      metal: { surface: "metal", color: 0xb4babf }
    })
  ),
  defineStyle(
    "wood-black-metal",
    "黑砂金属腿",
    "metal",
    {
      wood: 0x3a3a3c,
      woodLight: 0x55555a,
      woodDark: 0x242426,
      furniture: 0x3a3a3c,
      furnitureSoft: 0x55555a,
      furnitureDark: 0x242426
    },
    woodCombo({
      top: { surface: "wood", color: 0x6b4526 },
      leg: { surface: "metal", color: 0x2e2e30 },
      drawer: { surface: "wood", color: 0x855c36 },
      trim: { surface: "metal", color: 0x303034 },
      metal: { surface: "metal", color: 0x2e2e30 }
    })
  )
]);

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
  shelf
}) {
  return {
    body: body,
    door: door ?? body,
    panel: panel ?? body,
    trim: trim ?? body,
    base: base ?? body,
    // 台面与抽屉面都跟随档位的主体色：洗衣机的台面与箱体同材质、抽屉面与门板同色，是这一族
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
    lit: lit ?? { surface: "paint", color: 0xf6f2e8 }
  };
}

const STEEL_APPLIANCE_STYLES = Object.freeze([
  defineStyle(
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
      furnitureDark: 0x868e96
    },
    applianceCombo({
      body: { surface: "metal", color: 0xc6cbd1 },
      metal: { surface: "metal", color: 0x8c8f94 }
    })
  ),
  defineStyle(
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
      furnitureDark: 0x262b30
    },
    applianceCombo({
      body: { surface: "metal", color: 0x454c54 },
      metal: { surface: "metal", color: 0x2e2e30 }
    })
  ),
  defineStyle(
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
      furnitureDark: 0xc9c2b4
    },
    applianceCombo({
      body: { surface: "paint", color: 0xf8f2e6 },
      metal: { surface: "metal", color: 0xb4babf }
    })
  )
]);

// ── 小家电 / IT 设备 ──────────────────────────────────────────────────────
const DEVICE_STYLES = Object.freeze([
  // 这三档原先只写颜色、没有组合，于是小家电 / IT 设备的网格**一律按槽位取色**——机器人基站的
  defineStyle(
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
      furnitureDark: 0xd0d0c9
    },
    applianceCombo({
      body: { surface: "paint", color: 0xfafaf8 },
      metal: { surface: "metal", color: 0xb4babf }
    })
  ),
  defineStyle(
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
      furnitureDark: 0x22252a
    },
    applianceCombo({
      body: { surface: "paint", color: 0x3c3f44 },
      metal: { surface: "metal", color: 0x2e2e30 }
    })
  ),
  defineStyle(
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
      furnitureDark: 0x6d747b
    },
    applianceCombo({
      body: { surface: "metal", color: 0x9aa1a8 },
      metal: { surface: "metal", color: 0x6d747b }
    })
  )
]);

// ── 洁具陶瓷 ──────────────────────────────────────────────────────────────
/**
 * 洁具的组合：陶瓷本体 / 内腔 / 台面 / 柜体 / 五金。
 */
function sanitaryCombo({
  body,
  top,
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
  grating
}) {
  const bodyRecipe = body ?? null;
  const interiorRecipe =
    interior ??
    (bodyRecipe && Number.isFinite(bodyRecipe.color)
      ? { surface: bodyRecipe.surface, color: shadeColor(bodyRecipe.color, -0.18) }
      : null);
  const joineryRecipe = frame ?? top ?? bodyRecipe;
  const metalRecipe = metal ?? { surface: "metal", color: 0xbfc6cc };
  const glassRecipe = glass ?? { surface: "glass", color: 0xdfeaec };
  // 镜面不随档位变（与 glass / metal 同理：陶瓷换到岩灰档，镜子还是那面镜子）。
  const mirrorRecipe = mirror ?? {
    surface: "glass",
    color: 0xdbe4ea,
    roughness: 0.08,
    metalness: 0.35
  };
  return {
    body: body,
    top: top ?? bodyRecipe,
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
    grating: grating ?? metalRecipe
  };
}

/**
 * 玻璃隔断的组合：玻璃 + 框（立柱 / 横梁）+ 拉手。
 */
function glazingCombo({ glass, frame, handle, trim, metal }) {
  const frameRecipe = frame ?? metal ?? { surface: "metal", color: 0xb4babf };
  return {
    glass: glass,
    frame: frame ?? frameRecipe,
    metal: metal ?? frameRecipe,
    trim: trim ?? frameRecipe,
    handle: handle ?? frameRecipe
  };
}

const CERAMIC_STYLES = Object.freeze([
  defineStyle(
    "ceramic-glossy",
    "亮白陶瓷",
    "ceramic",
    {
      applianceSoft: 0xfbfbf9,
      furnitureLight: 0xfbfbf9,
      furniture: 0xf0f0ec
    },
    sanitaryCombo({
      body: { surface: "ceramic", color: 0xf7f7f4 },
      top: { surface: "marble", color: 0xf2f1ed },
      frame: { surface: "wood", color: 0xc9a67c },
      door: { surface: "wood", color: 0xd4b48c }
    })
  ),
  defineStyle(
    "ceramic-matte",
    "哑光石白",
    "ceramic",
    {
      applianceSoft: 0xedebe4,
      furnitureLight: 0xedebe4,
      furniture: 0xdedbd2
    },
    sanitaryCombo({
      body: { surface: "ceramic", color: 0xeceae2 },
      top: { surface: "stone", color: 0xdcd8cf },
      frame: { surface: "wood", color: 0xb09374 },
      door: { surface: "wood", color: 0xbea184 }
    })
  ),
  defineStyle(
    "ceramic-stone-grey",
    "岩灰",
    "stone",
    {
      applianceSoft: 0xc8c6c0,
      furnitureLight: 0xc8c6c0,
      furniture: 0xb6b4ae
    },
    sanitaryCombo({
      // 岩灰档位是「岩板质感」那一挂：整件（本体也含）改成石面，柜体则压成深灰漆 ——
      body: { surface: "stone", color: 0xc2c0ba },
      top: { surface: "stone", color: 0xa9a8a3 },
      frame: { surface: "paint", color: 0x6f7276 },
      door: { surface: "paint", color: 0x7c8085 }
    })
  )
]);

// ── 石材台面（餐桌 / 岛台）───────────────────────────────────────────────
const STONE_TOP_STYLES = Object.freeze([
  defineStyle("stone-marble", "白色大理石", "marble", { countertop: 0xf2f1ed }),
  defineStyle("stone-black", "黑色岩板", "stone", { countertop: 0x2b2b2e }),
  defineStyle("stone-terrazzo", "水磨石", "stone", { countertop: 0xdcd8cf })
]);

// ── 玻璃 ──────────────────────────────────────────────────────────────────
const GLASS_STYLES = Object.freeze([
  defineStyle(
    "glass-clear",
    "清玻",
    "glass",
    { glass: 0xdfeaec },
    glazingCombo({
      glass: { surface: "glass", color: 0xdfeaec },
      frame: { surface: "metal", color: 0xb4babf }
    })
  ),
  defineStyle(
    "glass-tinted",
    "茶玻",
    "glass",
    { glass: 0xc9b18c },
    glazingCombo({
      // 茶玻配古铜色框：成品隔断的茶玻几乎都配这个色，清玻配不锈钢。
      glass: { surface: "glass", color: 0xc9b18c },
      frame: { surface: "metal", color: 0xa08558 }
    })
  )
]);

const LAMP_STYLES = Object.freeze([
  defineStyle(
    "lamp-warm-brass",
    "暖铜",
    "metal",
    {
      floorLampBody: 0x9c6b3f,
      appliance: 0xb8a48c,
      applianceSoft: 0xd8cdbe,
      applianceDark: 0x6b4a2e,
      furniture: 0xb8a48c,
      furnitureSoft: 0xd8cdbe
    },
    applianceCombo({
      // 黄铜杆 / 臂 / 罩口圈；罩口圈与杆同铜色（实物上它俩是同一批车件），只是稍暗一点出棱线。
      body: { surface: "metal", color: 0x9c6b3f },
      metal: { surface: "metal", color: 0x8a5c33 },
      trim: { surface: "metal", color: 0x8a5c33 },
      // 配重底板不跟随杆：「一截铜杆插在一块黑铁砣上」才是这类悬臂落地灯的真实构造。
      base: { surface: "metal", color: 0x2e2e30 },
      lit: { surface: "fabric", color: 0xf0e6d4 }
    })
  ),
  defineStyle(
    "lamp-black",
    "哑黑",
    "metal",
    {
      floorLampBody: 0x2e2e30,
      appliance: 0x3c3f44,
      applianceSoft: 0x565a61,
      applianceDark: 0x22252a,
      furniture: 0x3c3f44,
      furnitureSoft: 0x565a61
    },
    applianceCombo({
      body: { surface: "metal", color: 0x2e2e30 },
      metal: { surface: "metal", color: 0x3c3f44 },
      trim: { surface: "metal", color: 0x3c3f44 },
      base: { surface: "metal", color: 0x22252a },
      lit: { surface: "fabric", color: 0xefe9dd }
    })
  ),
  defineStyle(
    "lamp-white",
    "瓷白",
    "paint",
    {
      floorLampBody: 0xe8e5df,
      appliance: 0xf3f1ec,
      applianceSoft: 0xfbfaf8,
      applianceDark: 0xc9c2b4,
      furniture: 0xf3f1ec,
      furnitureSoft: 0xfbfaf8
    },
    applianceCombo({
      // 瓷白走烤漆杆，但五金（罩口圈 / 关节）仍是钢色 —— 白杆配白圈会糊成一根白棍。
      body: { surface: "paint", color: 0xf3f1ec },
      metal: { surface: "metal", color: 0xb4babf },
      trim: { surface: "metal", color: 0xb4babf },
      base: { surface: "paint", color: 0xe8e5df },
      lit: { surface: "fabric", color: 0xfbf8f2 }
    })
  ),
  defineStyle(
    "lamp-walnut",
    "胡桃木",
    "wood",
    {
      floorLampBody: 0x6b4526,
      appliance: 0x8a6238,
      applianceSoft: 0xa9885c,
      applianceDark: 0x4a3018,
      furniture: 0x8a6238,
      furnitureSoft: 0xa9885c
    },
    applianceCombo({
      // 木杆 + 铜件：这是唯一一档杆件不走金属的 —— 木杆落地灯在暖木色系里几乎必有，
      body: { surface: "wood", color: 0x6b4526 },
      metal: { surface: "metal", color: 0x9c6b3f },
      trim: { surface: "metal", color: 0x9c6b3f },
      base: { surface: "metal", color: 0x2e2e30 },
      lit: { surface: "fabric", color: 0xfaf2e4 }
    })
  )
]);

// ── 绿植 / 软装摆件 ──────────────────────────────────────────────────────
/**
 * 绿植的组合：叶 / 盆 / 托 / 干 / 土。
 */
function plantCombo({ foliage, pot, saucer, trunk, soil }) {
  const derivedTrunk = { surface: "wood", color: 0x6b5a42 };
  const derivedSaucer = { surface: "ceramic", color: shadeColor(pot.color, -0.3) };
  const derivedSoil = { surface: "stone", color: 0x3b2f22 };
  return {
    foliage: foliage,
    pot: pot,
    base: saucer ?? derivedSaucer,
    frame: trunk ?? derivedTrunk,
    interior: soil ?? derivedSoil
  };
}

const DECOR_STYLES = Object.freeze([
  defineStyle(
    "decor-fresh-green",
    "鲜绿",
    "foliage",
    {
      leafColor: 0x5d8c40,
      decorAccent: 0xc4a484,
      furnitureDark: 0x6b4a2e
    },
    plantCombo({
      foliage: { surface: "foliage", color: 0x5d8c40 },
      pot: { surface: "ceramic", color: 0xc4a484 }
    })
  ),
  defineStyle(
    "decor-olive",
    "橄榄绿",
    "foliage",
    {
      leafColor: 0x6f7a45,
      decorAccent: 0xb0a68c,
      furnitureDark: 0x5a5344
    },
    plantCombo({
      foliage: { surface: "foliage", color: 0x6f7a45 },
      pot: { surface: "ceramic", color: 0xb0a68c }
    })
  ),
  defineStyle(
    "decor-terra",
    "陶盆暖调",
    "foliage",
    {
      leafColor: 0x7a8c4a,
      decorAccent: 0xc07a52,
      furnitureDark: 0x8c5a3c
    },
    plantCombo({
      foliage: { surface: "foliage", color: 0x7a8c4a },
      // 陶盆暖调这一档把**盆**当主角：红陶色盆 + 偏黄的叶，主干也跟着提到暖木色。
      pot: { surface: "ceramic", color: 0xc07a52 },
      trunk: { surface: "wood", color: 0x8c5a3c }
    })
  )
]);

// ── 地毯 ──────────────────────────────────────────────────────────────────
/**
 * 地毯的组合：毯面 + 包边 + 防滑底。
 */
function rugCombo({ fabric, trim, base }) {
  const derivedTrim = { surface: "fabric", color: shadeColor(fabric.color, -0.22) };
  const derivedBase = { surface: "fabric", color: shadeColor(fabric.color, -0.62) };
  return { fabric: fabric, trim: trim ?? derivedTrim, base: base ?? derivedBase };
}

const RUG_STYLES = Object.freeze([
  defineStyle(
    "rug-neutral",
    "中性米",
    "fabric",
    {
      joineryAccent: 0xe4d5c2,
      furnitureLight: 0xf3e7d8,
      furnitureDark: 0xb9a894
    },
    rugCombo({ fabric: { surface: "fabric", color: 0xe4d5c2 } })
  ),
  defineStyle(
    "rug-grey",
    "素灰",
    "fabric",
    {
      joineryAccent: 0xc7c5bf,
      furnitureLight: 0xdedcd6,
      furnitureDark: 0x9c9a94
    },
    rugCombo({ fabric: { surface: "fabric", color: 0xc7c5bf } })
  ),
  defineStyle(
    "rug-pattern",
    "花色织纹",
    "fabric",
    {
      joineryAccent: 0xb98d73,
      furnitureLight: 0xd8b49c,
      furnitureDark: 0x8c5f45
    },
    rugCombo({
      fabric: { surface: "fabric", color: 0xd8b49c },
      // 花色这一档的包边要与毯面**拉开**（而不是派生出的近色）：它是唯一一个包边该跳出来的档位。
      trim: { surface: "fabric", color: 0x7a4a34 }
    })
  )
]);

// ── 窗帘布面 ──────────────────────────────────────────────────────────────
/**
 * 窗帘的组合：帘布 + 顶轨 / 支架。
 */
function curtainCombo({ fabric, metal }) {
  const derivedMetal = { surface: "metal", color: 0x9aa1a8 };
  return { fabric: fabric, metal: metal ?? derivedMetal };
}

const CURTAIN_STYLES = Object.freeze([
  defineStyle(
    "curtain-warm-white",
    "暖米白",
    "fabric",
    {
      rollerCurtain: 0xf0e8dc,
      furnitureDark: 0x6b4a2e,
      furnitureSoft: 0xe4d5c2
    },
    curtainCombo({ fabric: { surface: "fabric", color: 0xf0e8dc } })
  ),
  defineStyle(
    "curtain-linen",
    "亚麻灰",
    "fabric",
    {
      rollerCurtain: 0xd5d2ca,
      furnitureDark: 0x5a5344,
      furnitureSoft: 0xc2bfb7
    },
    curtainCombo({ fabric: { surface: "fabric", color: 0xd5d2ca } })
  ),
  defineStyle(
    "curtain-deep-green",
    "深墨绿",
    "fabric",
    {
      rollerCurtain: 0x4a5c4a,
      furnitureDark: 0x2e3a2e,
      furnitureSoft: 0x6b7d6b
    },
    curtainCombo({
      fabric: { surface: "fabric", color: 0x4a5c4a },
      // 深墨绿这一档最吃光：杆件提亮到浅钢色，深布前面才有一条亮线撑住轮廓。
      metal: { surface: "metal", color: 0xb4babf }
    })
  )
]);

// ── 鱼缸 ──────────────────────────────────────────────────────────────────
/**
 * 鱼缸的组合：柜体 / 柜门 / 台面 / 踢脚 / 拉手（下）+ 缸框 / 缸内背板 / 玻璃 / 灯板（上）。
 */
function aquariumCombo({ body, door, top, base, handle, frame, glass, interior, lit }) {
  const derivedBase = { surface: "lacquer", color: shadeColor(body.color, -0.45) };
  const derivedHandle = { surface: "metal", color: 0xb4babf };
  const derivedFrame = { surface: "lacquer", color: shadeColor(body.color, -0.5) };
  const derivedGlass = { surface: "glass", color: 0xdfeaec };
  const derivedInterior = { surface: "stone", color: 0x1b3a40 };
  const derivedLit = { surface: "paint", color: 0xcfe8f2 };
  return {
    body: body,
    door: door ?? body,
    top: top ?? body,
    base: base ?? derivedBase,
    handle: handle ?? derivedHandle,
    frame: frame ?? derivedFrame,
    glass: glass ?? derivedGlass,
    interior: interior ?? derivedInterior,
    lit: lit ?? derivedLit
  };
}

const AQUARIUM_STYLES = Object.freeze([
  defineStyle(
    "aquarium-black-frame",
    "黑框玻璃",
    "lacquer",
    {
      furnitureDark: 0x2b2b2e,
      furniture: 0x3a3a3c
    },
    aquariumCombo({
      body: { surface: "lacquer", color: 0x2f3237 },
      // 黑框这一档的柜体与缸框本来就近色，显式给一组，不靠派生 —— 派生出来会是一块偏蓝的深灰。
      frame: { surface: "lacquer", color: 0x1e2126 }
    })
  ),
  defineStyle(
    "aquarium-white-frame",
    "白框玻璃",
    "paint",
    {
      furnitureDark: 0xe4e2dc,
      furniture: 0xf0efec
    },
    aquariumCombo({
      body: { surface: "paint", color: 0xf0efec },
      frame: { surface: "paint", color: 0xd8d5cd }
    })
  ),
  defineStyle(
    "aquarium-wood-frame",
    "原木框",
    "wood",
    {
      furnitureDark: 0x6b4526,
      furniture: 0xc49a6c
    },
    aquariumCombo({
      body: { surface: "wood", color: 0xc49a6c },
      // 原木这一档缸框仍是深木（不是被派生出的浅木）：实木缸架的水线一律是深色封边。
      frame: { surface: "wood", color: 0x6b4526 },
      top: { surface: "wood", color: 0x8f6a45 }
    })
  )
]);

const PIANO_KEY_RECIPE = Object.freeze({ surface: "lacquer", color: 0xf6f2e8 });
const PIANO_ACCENT_RECIPE = Object.freeze({ surface: "lacquer", color: 0x16181a });
/**
 * 钢琴的组合：琴身 / 顶盖 / 腰线 / 键床与键侧木 / 琴腿 / 五金 + 白键 / 黑键。
 */
function pianoCombo({ body, top, trim, panel, leg, metal, key, accent }) {
  return {
    body: body,
    top: top ?? body,
    trim: trim ?? body,
    panel: panel ?? body,
    leg: leg ?? body,
    key: key ?? PIANO_KEY_RECIPE,
    accent: accent ?? PIANO_ACCENT_RECIPE,
    metal: metal
  };
}
const PIANO_STYLES = Object.freeze([
  defineStyle(
    "piano-black",
    "亮光黑",
    "lacquer",
    {
      furniture: 0x1e1e20,
      furnitureDark: 0x111113,
      furnitureSoft: 0x3a3a3c
    },
    pianoCombo({
      body: { surface: "lacquer", color: 0x1a1a1c },
      top: { surface: "lacquer", color: 0x24242a },
      trim: { surface: "lacquer", color: 0x2b2b30 },
      panel: { surface: "lacquer", color: 0x1e1e20 },
      leg: { surface: "lacquer", color: 0x1a1a1c },
      metal: { surface: "metal", color: 0x9aa1a8 }
    })
  ),
  defineStyle(
    "piano-white",
    "亮光白",
    "lacquer",
    {
      furniture: 0xf2f1ed,
      furnitureDark: 0xd8d6d0,
      furnitureSoft: 0xfbfaf8
    },
    pianoCombo({
      body: { surface: "lacquer", color: 0xf2f1ed },
      top: { surface: "lacquer", color: 0xfbfaf8 },
      trim: { surface: "lacquer", color: 0xdcd8d2 },
      panel: { surface: "lacquer", color: 0xefece6 },
      leg: { surface: "lacquer", color: 0xf2f1ed },
      metal: { surface: "metal", color: 0xb4babf }
    })
  ),
  defineStyle(
    "piano-wood",
    "暖木色",
    "wood",
    {
      wood: 0x6b4526,
      woodLight: 0x855c36,
      woodDark: 0x4a2e1a,
      furniture: 0x6b4526,
      furnitureDark: 0x4a2e1a,
      furnitureSoft: 0x855c36
    },
    pianoCombo({
      body: { surface: "wood", color: 0x6b4526 },
      top: { surface: "wood", color: 0x7a5230 },
      trim: { surface: "wood", color: 0x4a2e1a },
      panel: { surface: "wood", color: 0x5f3d21 },
      leg: { surface: "wood", color: 0x6b4526 },
      // 木壳钢琴的踏板与脚轮是黄铜件 —— 给钢色会立刻变成「工业风」，实物上不是这样。
      metal: { surface: "metal", color: 0xb08d5a }
    })
  )
]);

const SCREEN_STYLES = Object.freeze([
  // 屏类的角色分工与设备族同一套骨架：**屏自己永远是那块深色的屏**，只有边框（trim）与
  defineStyle(
    "screen-black",
    "曜黑",
    "lacquer",
    {
      appliance: 0x2a2c30,
      applianceSoft: 0x3f4247,
      applianceDark: 0x15171a
    },
    applianceCombo({
      body: { surface: "lacquer", color: 0x2a2c30 },
      screen: { surface: "lacquer", color: 0x15171a },
      metal: { surface: "metal", color: 0x3f4247 }
    })
  ),
  defineStyle(
    "screen-silver",
    "银灰",
    "metal",
    {
      appliance: 0xb9bec4,
      applianceSoft: 0xc6cbd1,
      applianceDark: 0x6d747b
    },
    applianceCombo({
      body: { surface: "metal", color: 0xb9bec4 },
      screen: { surface: "lacquer", color: 0x15171a },
      metal: { surface: "metal", color: 0x8c8f94 }
    })
  )
]);

const MATERIAL_STYLE_OPTIONS_BY_ITEM_TYPE = Object.freeze({
  // 布艺座位 / 卧床
  sofa: FABRIC_STYLES,
  chair: FABRIC_STYLES,
  bed: FABRIC_STYLES,
  // 皮革另给一组：皮沙发是常见诉求，与布艺并列而不是二选一
  coffeetable: MARBLE_TABLE_STYLES,
  squarecoffeetable: WOOD_FURNITURE_STYLES,
  // 木器家具
  table: WOOD_FURNITURE_STYLES,
  rounddiningtable: WOOD_FURNITURE_STYLES,
  rounddiningtableturntable: WOOD_FURNITURE_STYLES,
  desk: WOOD_FURNITURE_STYLES,
  bar: WOOD_FURNITURE_STYLES,
  // 柜类
  cabinet: JOINERY_STYLES,
  wallcabinet: JOINERY_STYLES,
  shoecabinet: JOINERY_STYLES,
  sideboard: JOINERY_STYLES,
  bookcase: JOINERY_STYLES,
  shelf: JOINERY_STYLES,
  nightstand: JOINERY_STYLES,
  tvstand: JOINERY_STYLES,
  kitchenbase: JOINERY_STYLES,
  kitchensink: JOINERY_STYLES,
  kitchencooktop: JOINERY_STYLES,
  glasscabinet: JOINERY_STYLES,
  vanity: JOINERY_STYLES,
  // 家电
  fridge: STEEL_APPLIANCE_STYLES,
  freezer: STEEL_APPLIANCE_STYLES,
  rangehood: STEEL_APPLIANCE_STYLES,
  dishwasher: STEEL_APPLIANCE_STYLES,
  steamoven: STEEL_APPLIANCE_STYLES,
  microwave: STEEL_APPLIANCE_STYLES,
  washer: STEEL_APPLIANCE_STYLES,
  dryer: STEEL_APPLIANCE_STYLES,
  storagewaterheater: STEEL_APPLIANCE_STYLES,
  gaswaterheater: STEEL_APPLIANCE_STYLES,
  pipelinewaterpurifier: STEEL_APPLIANCE_STYLES,
  wallac: STEEL_APPLIANCE_STYLES,
  floorac: STEEL_APPLIANCE_STYLES,
  ricecooker: DEVICE_STYLES,
  desktop: DEVICE_STYLES,
  laptop: DEVICE_STYLES,
  nas: DEVICE_STYLES,
  airpurifier: DEVICE_STYLES,
  robotvacuum: DEVICE_STYLES,
  airoutlet: DEVICE_STYLES,
  tea_bar_machine: DEVICE_STYLES,
  camera: DEVICE_STYLES,
  presence: DEVICE_STYLES,
  // 影音
  tv: SCREEN_STYLES,
  // 洁具
  basin: CERAMIC_STYLES,
  toilet: CERAMIC_STYLES,
  squattoilet: CERAMIC_STYLES,
  urinal: CERAMIC_STYLES,
  bathtub: CERAMIC_STYLES,
  shower: CERAMIC_STYLES,
  glasspartition: GLASS_STYLES,
  // 石材台面类
  chestdrawer: JOINERY_STYLES,
  entrycabinet: JOINERY_STYLES,
  displaycabinet: JOINERY_STYLES,
  // 休闲椅与凳
  armchair: FABRIC_STYLES,
  loungechair: LEATHER_STYLES,
  ottoman: FABRIC_STYLES,
  barstool: WOOD_FURNITURE_STYLES,
  bench: WOOD_FURNITURE_STYLES,
  // 新增家具
  sidetable: WOOD_FURNITURE_STYLES,
  console: WOOD_FURNITURE_STYLES,
  bunkbed: WOOD_FURNITURE_STYLES,
  kidsbed: FABRIC_STYLES,
  // 新增家电
  projector: DEVICE_STYLES,
  soundbar: DEVICE_STYLES,
  speaker: DEVICE_STYLES,
  fan: DEVICE_STYLES,
  humidifier: DEVICE_STYLES,
  dehumidifier: DEVICE_STYLES,
  freshair: DEVICE_STYLES,
  thermostat: DEVICE_STYLES,
  smartlock: DEVICE_STYLES,
  smartpanel: DEVICE_STYLES,
  gateway: DEVICE_STYLES,
  doorbell: DEVICE_STYLES,
  // 钢琴
  piano: PIANO_STYLES,
  // 灯具 / 软装 / 构件
  floorlamp: LAMP_STYLES,
  walllamp: LAMP_STYLES,
  rug: RUG_STYLES,
  plant: DECOR_STYLES,
  aquarium: AQUARIUM_STYLES,
  curtain: CURTAIN_STYLES,
  // 布艺软装（新增）
  chaise: FABRIC_STYLES,
  daybed: FABRIC_STYLES,
  cot: FABRIC_STYLES,
  officestool: FABRIC_STYLES,
  // 木器家具（新增）
  nestingtable: WOOD_FURNITURE_STYLES,
  roundcoffeetable: WOOD_FURNITURE_STYLES,
  coatrail: WOOD_FURNITURE_STYLES,
  stool: WOOD_FURNITURE_STYLES,
  computertable: WOOD_FURNITURE_STYLES,
  // 柜类（新增）
  screenspan: JOINERY_STYLES,
  locker: JOINERY_STYLES,
  laundrycabinet: JOINERY_STYLES,
  balconycabinet: JOINERY_STYLES,
  winecabinet: JOINERY_STYLES,
  kitchenisland: JOINERY_STYLES,
  pantry: JOINERY_STYLES,
  filecabinet: JOINERY_STYLES,
  booktower: JOINERY_STYLES,
  // 不锈钢家电（新增）
  ceilingac: STEEL_APPLIANCE_STYLES,
  garmentcare: STEEL_APPLIANCE_STYLES,
  integratedstove: STEEL_APPLIANCE_STYLES,
  sterilizer: STEEL_APPLIANCE_STYLES,
  oven: STEEL_APPLIANCE_STYLES,
  waterpurifier: STEEL_APPLIANCE_STYLES,
  // 小型电子设备（新增）
  gameconsole: DEVICE_STYLES,
  avreceiver: DEVICE_STYLES,
  smartspeaker: DEVICE_STYLES,
  router: DEVICE_STYLES,
  printer: DEVICE_STYLES,
  ceilingfan: DEVICE_STYLES,
  heater: DEVICE_STYLES,
  vacuumcleaner: DEVICE_STYLES,
  floorwasher: DEVICE_STYLES,
  dryingrack: DEVICE_STYLES,
  airer: DEVICE_STYLES,
  coffeemaker: DEVICE_STYLES,
  kettle: DEVICE_STYLES,
  airfryer: DEVICE_STYLES,
  blender: DEVICE_STYLES,
  trashbin: DEVICE_STYLES,
  // 影音屏幕（新增）
  screenpanel: SCREEN_STYLES,
  // 结构构件（唯一一件可换表面料的）：柱体的档位是「墙体系 + 柜体系」两套配对，
  pillar: PILLAR_STYLES
});

/**
 * 材质族兜底表：按类型所属的族取一组档位。
 */
const MATERIAL_FAMILY_BY_ITEM_TYPE = Object.freeze({
  sofa: "fabric",
  chair: "fabric",
  bed: "fabric",
  rug: "fabric",
  curtain: "fabric",
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
  vanity: "joinery",
  table: "woodFurniture",
  rounddiningtable: "woodFurniture",
  rounddiningtableturntable: "woodFurniture",
  desk: "woodFurniture",
  bar: "woodFurniture",
  coffeetable: "woodFurniture",
  squarecoffeetable: "woodFurniture",
  fridge: "steelAppliance",
  freezer: "steelAppliance",
  rangehood: "steelAppliance",
  dishwasher: "steelAppliance",
  steamoven: "steelAppliance",
  microwave: "steelAppliance",
  washer: "steelAppliance",
  dryer: "steelAppliance",
  storagewaterheater: "steelAppliance",
  gaswaterheater: "steelAppliance",
  pipelinewaterpurifier: "steelAppliance",
  wallac: "steelAppliance",
  floorac: "steelAppliance",
  floorlamp: "lamp",
  walllamp: "lamp",
  basin: "ceramic",
  toilet: "ceramic",
  squattoilet: "ceramic",
  urinal: "ceramic",
  bathtub: "ceramic",
  shower: "ceramic",
  glasspartition: "glass",
  tv: "screen",
  plant: "decor",
  aquarium: "decor",
  piano: "woodFurniture"
});

const MATERIAL_STYLES_BY_FAMILY = Object.freeze({
  fabric: FABRIC_STYLES,
  leather: LEATHER_STYLES,
  joinery: JOINERY_STYLES,
  woodFurniture: WOOD_FURNITURE_STYLES,
  steelAppliance: STEEL_APPLIANCE_STYLES,
  device: DEVICE_STYLES,
  ceramic: CERAMIC_STYLES,
  stoneTop: STONE_TOP_STYLES,
  glass: GLASS_STYLES,
  lamp: LAMP_STYLES,
  decor: DECOR_STYLES,
  rug: RUG_STYLES,
  curtain: CURTAIN_STYLES,
  screen: SCREEN_STYLES
});

/** 通用兜底：只有「跟随全局风格」一项。前两档写全时不该被触达。 */
const AUTO_ONLY_OPTIONS = Object.freeze([]);

/**
 * 某类型可选的风格档位（不含「跟随全局风格」，那一项由界面统一补在最前）。
 */
export function materialStyleOptionsFor(itemType) {
  if (!isMaterialStyleCapable(itemType)) {
    return AUTO_ONLY_OPTIONS;
  }
  const explicitOptions = MATERIAL_STYLE_OPTIONS_BY_ITEM_TYPE[itemType];
  if (explicitOptions) {
    return explicitOptions;
  }
  const familyName = MATERIAL_FAMILY_BY_ITEM_TYPE[itemType];
  return MATERIAL_STYLES_BY_FAMILY[familyName] || AUTO_ONLY_OPTIONS;
}

/** 该类型是否支持「材质风格」属性。 */
export function isMaterialStyleCapable(itemType) {
  return MATERIAL_STYLE_ITEM_TYPES.has(itemType);
}

/** 取某个风格档位定义；`auto` 或非法 id 返回 null。 */
export function findMaterialStyle(itemType, styleId) {
  if (!styleId || styleId === MATERIAL_STYLE_AUTO) {
    return null;
  }
  return materialStyleOptionsFor(itemType).find(option => option.id === styleId) || null;
}

/**
 * 把任意取值归一到「该类型下合法的风格 id」。
 */
export function normalizeMaterialStyle(itemType, styleValue) {
  if (typeof styleValue !== "string" || styleValue === MATERIAL_STYLE_AUTO) {
    return MATERIAL_STYLE_AUTO;
  }
  return findMaterialStyle(itemType, styleValue) ? styleValue : MATERIAL_STYLE_AUTO;
}

/**
 * 把逐物件风格叠加到调色板上。
 * @param {object} palette 基础调色板（已过 applyItemFinish）。
 * @param {string} itemType 物件类型。
 * @param {string} styleValue 物件上的 materialStyle 取值。
 */
export function applyMaterialStyle(palette, itemType, styleValue) {
  const style = findMaterialStyle(itemType, styleValue);
  if (!style) {
    return {
      palette: palette,
      surface: null,
      roughness: null,
      metalness: null,
      roles: null,
      styleId: MATERIAL_STYLE_AUTO
    };
  }
  return {
    palette: {
      ...palette,
      ...style.colors
    },
    surface: style.surface,
    roughness: SURFACE_ROUGHNESS[style.surface] ?? null,
    metalness: SURFACE_METALNESS[style.surface] ?? null,
    // 「档位即组合」：按角色的配方。流水线模型的材质名带角色（material-<槽位>-<角色>），
    roles: style.roles ?? null,
    styleId: style.id
  };
}
