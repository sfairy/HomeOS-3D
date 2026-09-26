/**
 * 逐物件的「材质风格」属性（materialStyle）。
 *
 * 与 studio-scene-style.js 的关系：那里是**场景级**风格（studioSceneStyle = default / warm-wood），
 * 一改就影响全场；这里是**逐物件**覆盖层，挂在单个物件的 materialStyle 上。解析顺序是
 * 「基础调色板 → applyItemFinish（柜体 / 不锈钢成品外观）→ applyMaterialStyle（本文件的覆盖）」，
 * 因此逐物件选择永远优先于全局风格。
 *
 * 覆盖范围是硬要求：**所有家居家电类型**（新增与现存一视同仁）都要能选，不允许有类型落到
 * 「只有跟随全局」这一个选项上。为此用了三档解析：
 *   1. MATERIAL_STYLE_OPTIONS_BY_ITEM_TYPE —— 逐类型显式档位（首选，表达力最强）；
 *   2. MATERIAL_STYLES_BY_FAMILY —— 按材质族兜底（新增一件同类物件时至少不会没档可选）；
 *   3. 通用兜底 —— 仅「跟随全局风格」。前两档写全时这一档不该被触达。
 *
 * "auto" 是默认值，语义是「跟随全局风格」：**不复制调色板、不覆盖任何键**，行为与加这个属性之前
 * 逐字节相同 —— 这是老草稿 / 老快照不需要数据迁移的原因。
 *
 * 刻意排除的两类（不是遗漏）：
 *   - mural 已有 muralStyle（画面风格）、featurewall 已有 wallStyle（墙面材质），语义与本属性重叠，
 *     再叠一层只会让同一件东西有两个风格字段、互相打架；
 *   - planlabel / flooropening / 墙体 / LIGHT_ITEM_TYPES 不是家居家电模型，不参与。
 *
 * 纯数据 + 纯函数：不引入 THREE、不碰 DOM，因此工作台与舞台两侧都能安全 import。
 */
import {
  APPLIANCE_MODEL_ITEM_TYPES,
  EXTERNAL_MODEL_ITEM_TYPES,
  HOME_ITEM_TYPES
} from "./studio-item-types.js?v=2609260946";

/** 默认值：跟随全局风格。 */
export const MATERIAL_STYLE_AUTO = "auto";

/**
 * 不参与「材质风格」的类型：
 *   - mural / featurewall：已有 muralStyle / wallStyle，语义重叠（见模块头）；
 *   - stairs / steelstairs / glassstairs / floatingstairs / pillar / smallcar / elevator：**建筑构件与车辆，
 *     不是家居家电**。它们走的是「克隆原始材质」的路径，调色板根本不参与（studio-app.js 的
 *     paletteForItemType 刻意把它们排除在 HOME_PALETTE_ITEM_TYPES 之外），颜色表达的是房子本体
 *     而不是装修风格。收进来的话下拉能选、选了没反应 —— 宁可不要这个控件。
 *
 * 后一组里除 stairs / pillar 外的四个是**隐式**落在能力集之外的（它们本来就不在 HOME / EXTERNAL /
 * APPLIANCE 三张词表里），这里仍逐个列进 EXCLUDED：语义靠「恰好没被收录」来表达太脆，将来谁把
 * smallcar 收进 EXTERNAL_MODEL_ITEM_TYPES，这份排除表就是唯一的护栏。
 */
export const MATERIAL_STYLE_EXCLUDED_ITEM_TYPES = Object.freeze(
  new Set([
    "mural",
    "featurewall",
    "stairs",
    "steelstairs",
    "glassstairs",
    "floatingstairs",
    "pillar",
    "smallcar",
    "elevator"
  ])
);

/**
 * 支持「材质风格」的全部类型：家居（含软装 / 家电 / 洁具）+ 可被外部模型替换的类型 + 家电模型类型，
 * 去掉有专用风格字段的那两类。新增物件类型时必须把它加进来，否则检查器不会显示风格字段。
 */
export const MATERIAL_STYLE_ITEM_TYPES = new Set(
  [...HOME_ITEM_TYPES, ...EXTERNAL_MODEL_ITEM_TYPES, ...APPLIANCE_MODEL_ITEM_TYPES].filter(
    itemType => !MATERIAL_STYLE_EXCLUDED_ITEM_TYPES.has(itemType)
  )
);

/**
 * 质感族：决定用哪张程序化贴图，以及粗糙度 / 金属度落在哪一档。
 * 贴图由 materials/studio-surface-fabrics.js 按 surface 键生成（与背景墙共用一套画法）。
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
 *
 * 为什么必须补齐：外部模型的换色分支（studio-external-models.js 的 applyFurniturePalette）对
 * 没有专属槽位表的类型，是**按模型烘焙亮度分档**在这四键里挑一个 —— 暗档取 furnitureDark、
 * 中档取 furniture、亮档取 furnitureSoft（暖色下又被强制等于 furnitureLight）。也就是说一件
 * 模型的各个零件会分别落到四个不同的键上。
 *
 * 只写其中两三个键，结果是「零件各走各的」：选了风格只有一部分零件变色、剩下的保持原样，
 * 看起来就像控件失灵。极端例子是 LEATHER_STYLES —— 它只写了 furnitureLight / furnitureSoft，
 * 而 loungechair 的零件恰好落在 furniture / furnitureDark 两档，于是躺椅选了皮革档**完全没反应**。
 *
 * 因此这里按「显式声明优先、缺的按基准色派生」把四档填满：基准色取该风格里最有代表性的那个键，
 * 派生出的浅 / 柔 / 深三档与该色同族，零件之间仍有明度差、不会糊成一块。
 *
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
    // 这类风格靠自己的专属键生效，检查里的「必须四档齐全」豁免它们。
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
 *
 * 每个配方只要求写 `{ surface, color }`：粗糙度与金属度按质感族自动派生（SURFACE_ROUGHNESS /
 * SURFACE_METALNESS），需要时再显式覆盖。这样写档位的人不必同时记住「拉丝金属该给多少 roughness」
 * —— 那一档已经是全站统一的一份表，各档位各写一遍必然走散。
 *
 * 返回 null 表示「这个档位没有按角色给组合」，运行侧据此完全跳过角色这条路 ——
 * 既有资产与未选风格的物件都走不到这里。
 */
function compileRoleRecipes(byRole) {
  if (!byRole) {
    return null;
  }
  const compiled = {};
  for (const [role, recipe] of Object.entries(byRole)) {
    const roleSurface = recipe.surface ?? null;
    compiled[role] = Object.freeze({
      // 石材板色号（见 studio-external-models.js 的 createStoneSlabTexture）：给了它，
      // 这一块网格就按**整块石材整图**渲染，surface 与它二选一 —— 两者同时写只有 slab 生效。
      slab: recipe.slab ?? null,
      surface: roleSurface,
      color: recipe.color,
      roughness: recipe.roughness ?? SURFACE_ROUGHNESS[roleSurface] ?? null,
      metalness: recipe.metalness ?? SURFACE_METALNESS[roleSurface] ?? null
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
 *   缺的 furniture* 档位由 completeFurnitureRamp 补齐，显式声明的键优先。
 *   这一份是给**既有资产**用的（它们只有槽位号、没有角色，靠命名与亮度分档取色）。
 * @param {object} [byRole] 「档位即组合」：按**材质角色**给配方，供流水线模型（材质名带角色的那批）。
 *   每个配方只需写 `{ surface, color }`，粗糙度 / 金属度按 surface 自动派生；
 *   需要时可用 `roughness` / `metalness` 显式覆盖。角色的含义与词表见 tools/models/model-roles.mjs。
 *
 *   为什么一个档位需要两套表达：既有资产的材质名里没有角色信息（`material-3`、`ha-sofa-frame`），
 *   只能用颜色键与亮度分档；而流水线模型按实物分件，柜体与柜面是不同的 mesh，必须各自取配方。
 *   两者并存期间以 byRole 优先，迁移完成后 colors 可以逐步收窄。
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
 *
 * 为什么要有这类构造器，而不是每档位手写一串 byRole：组合里各角色的**从属关系**是
 * 实物的常识，写一次比四十个档位各记一遍可靠 —— 手扶与坐垫同一种织物、木质框架与腿同一种木料、
 * 床垫与床头同一种织物，这是大多数真实家具的做法；只有确实要撞色时才显式覆盖。
 *
 * 卧床沿用了同一份角色表（这是刻意的，词表总量因此不必膨胀）：
 * 床架 = `frame`、床脚 = `leg`、**床垫 = `upholstery`**（它是这张床上最大的那块软包）、
 * 枕头 = `cushion`、床品 / 被面 = `fabric`。
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
    // 让每个档位各写一遍同样的钢灰只会走散。要别的金属色（黑铁、黄铜）时显式覆盖即可。
    metal: metal ?? { surface: "metal", color: 0x9aa1a8 }
  };
}

/**
 * 柜类的组合：柜体 / 柜面 / 台面 / 五金一次说清。
 *
 * 抽屉面默认跟随柜面、封边与层板默认跟随柜体 —— 同样是实物常识（抽屉与门板是同一批饰面，
 * 层板与箱体同料），不是「懒得写」。台面与五金必须显式给：这两处正是柜子看起来像「一块木头」
 * 还是像成品柜的分水岭。
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
  // 这两条默认值刻意在 `return` **之前**算好，而不是把对象字面量直接写在 return 里 ——
  // 护栏（tools/check_invariants.mjs 的 readTopLevelObjectEntries）是按字符扫 return 那个对象、
  // 只认 depth === 1 的键，且跳过一个键时会把它值里的 `{` / `(` 一起跳过去、深度记账就此带偏。
  // 值里嵌一对花括号，它后面那些角色就会被整片漏读 —— 表现为护栏误报「glass 没有配方」。
  // 提出来之后 return 里每个值都是裸标识符，扫多少遍都不会偏。
  //
  // 柜内衬默认值 = 柜体木色朝白提 45%。这个数不是拍出来的，是拿三档内衬各渲一张、量玻璃区与
  // 邻门的亮度差量出来的（木柜白门档位）：
  //   - 跟柜体走（深色）：玻璃区亮度 91、邻门 190，差 99 —— 玻璃读成一个黑洞；
  //   - 跟柜门走（浅色）：玻璃区 176、邻门 190，只差 14 —— 玻璃与实心门几乎分不出来，
  //     等于白做一扇玻璃门；
  //   - 提到中间调：玻璃区 148、邻门 190，差 42，与玻璃柜「玻璃对柜身」的 34 同档，
  //     且玻璃区内的亮度跨度从 0 涨到 18 —— 透过玻璃能看见层板与中立板，纵深才成立。
  // 不写死色号是因为烤漆 / 胡桃木档位下柜体本身就变，内衬得跟着同一族木色走。
  const interiorRecipe = Number.isFinite(body?.color)
    ? { surface: "wood", color: shadeColor(body.color, 0.45) }
    : door;
  // 玻璃门 / 玻璃层板在柜类里是独立槽位。默认取**玻璃柜（glasscabinet）那扇玻璃门的玻璃**：
  // 餐边柜最右一扇整扇玻璃门要与它对上（models/model-specs.mjs 的 sideboard），四个柜类档位
  // 统一收在同一个颜色上，换档位时玻璃不会在几种玻璃之间跳。要清玻的玻璃隔断走 GLASS_STYLES，
  // 不受这里影响。它是**唯一**要让透明件也参与组合的地方：玻璃不随木色变，但会随玻璃色变。
  //
  // 色号不是拍出来的，是从玻璃柜实际渲染结果里取的（`#a9c5d3`，不透明度 0.28）——
  // 玻璃柜是既有资产，它的玻璃色由调色板从烘进 GLB 的蓝灰基色提亮而来，所以这里必须写
  // **提亮之后**的值，写烘进去的那个原始值再被提一次就偏白了。要改请两台一起改。
  const glassRecipe = { surface: "glass", color: 0xa9c5d3 };
  // 水槽盆体 / 灶面与炉架的兜底料：厨柜里唯二**不随木色走**的金属面（不锈钢水槽、银黑灶面）。
  // 提出来算与上面两个默认值同理：护栏扫的是 return 那个对象里 depth === 1 的键，
  // 值里嵌一对花括号会把它后面那些角色整片漏读。
  const sinkRecipe = { surface: "metal", color: 0xb9bfc5, roughness: 0.24, metalness: 0.62 };
  const cooktopRecipe = { surface: "metal", color: 0x33363a, roughness: 0.2, metalness: 0.6 };
  // 镜面（梳妆台的立镜）：与 sanitaryCombo 里那份同料 —— 镜面是**不透明**的镀银面，
  // 不能借用 glass 角色（运行侧对 glass 强制 0.28 不透明度，镜子会变成能看穿的茶色玻璃板）。
  // surface 取 glass 的目的是**清掉贴图**（glass 在 studio-surface-fabrics.js 里没有画法）。
  // 金属度只给 0.35 的原因见 sanitaryCombo 里同一处的说明（场景没有环境贴图，高金属度会发黑）。
  const mirrorRecipe = { surface: "glass", color: 0xdbe4ea, roughness: 0.08, metalness: 0.35 };
  // 书脊 / 书封：**不跟木色走**。柜体换胡桃还是白漆，书架上那批书仍然是同一批米黄纸脊 ——
  // 跟木色走的话深色柜里的书会一并发黑，整柜读成一块暗木头（书柜最怕的就是这个）。
  // 用 paint 质感族（无贴图、粗糙 0.6）：纸面不需要木纹也不该有布纹。
  const bookRecipe = { surface: "paint", color: 0xd6c6a4 };
  // 敞开格里的内容物（鞋柜里那一双双鞋）：**不跟木色走**，理由与上面书脊那条一致 —— 跟木色走
  // 的话深色柜里的鞋会一起发黑，敞开格读成一堆木方块。质感取皮革族（鞋面在实物上多是皮 / 布），
  // 颜色压得比书脊深一档（0x6f7176 的灰褐）：它是**内容物**而不是陈设，不该比柜体更亮。
  const stashRecipe = { surface: "leather", color: 0x6f7176 };
  // 撞色书脊与摆件：陶土色。书柜需要一点点「不是木头」的颜色把满架同色的书分开，
  // 花瓶用的也是它 —— 两处在实物上都是同一个角色（陈设里的撞色那件）。
  const accentRecipe = { surface: "ceramic", color: 0xb0663f };
  return {
    body: body,
    door: door,
    drawer: drawer ?? door,
    trim: trim ?? body,
    shelf: shelf ?? body,
    book: book ?? bookRecipe,
    // 敞开格里的内容物默认取上面那一条「不跟木色走」的配方：鞋柜是唯一用到它的类型，
    // 而它一旦跟着柜体走，鞋柜最像鞋柜的那一层就整片失效（而且是换了深色档位才看得出的那种）。
    stash: stash ?? stashRecipe,
    accent: accent ?? accentRecipe,
    // 踢脚默认与柜体同料（真实柜子的踢脚要么同色、要么同色更深一档，撞色的很少）。
    base: base ?? body,
    // 柜脚默认跟随踢脚：床头柜 / 电视柜 / 梳妆台这类「箱体坐在四条腿上」的柜子，
    // 腿与踢脚在实物上就是同一批木作（要金属脚的产品自行显式给 leg）。
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
      // 折边 / 床尾搭毯这一档必须与床品**有色差**，否则「被子上再铺一层」在成品里完全读不出来
      // （默认值是同料同色）。取同族更深一档的暖驼：不跳色，但层次成立。
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
// 「档位即组合」的样板族：每个档位一次说清柜体、柜面、台面、五金。
// 柜体是木料还是烤漆、柜面是白门还是同色木门、台面是石还是木 —— 这几件事的组合关系才决定
// 一个柜子像不像成品，而不在于「柜子整体是什么颜色」。
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
      body: { surface: "wood", color: 0x5a3a22 },
      door: { surface: "lacquer", color: 0xf5f3ef },
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
      body: { surface: "wood", color: 0xc49a6c },
      door: { surface: "wood", color: 0xd8b98f },
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
      body: { surface: "wood", color: 0x5a3a22 },
      door: { surface: "wood", color: 0x6b4526 },
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
      body: { surface: "lacquer", color: 0x2e2a28 },
      door: { surface: "lacquer", color: 0x3a3a3c },
      top: { surface: "stone", color: 0x2b2b2e },
      metal: { surface: "metal", color: 0x44484d }
    })
  )
]);

// ── 木器家具（桌椅 / 茶几 / 床架）─────────────────────────────────────────
/**
 * 木器家具的组合：台面 / 腿 / 箱体 / 抽屉面 / 横撑 / 五金。
 *
 * 与柜类（joineryCombo）的差别在于**腿**：柜类是整件箱体、腿只是踢脚，木器家具的腿是看得见的一根
 * 构件，而且是「这个风格有多木」最直接的体现 —— 原木本色是木腿、黑砂金属腿是黑铁腿。所以腿必须
 * 逐档位显式给，不能从台面推。
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
    // （真实床垫 / 被面也几乎不跟着床架的木色变）。上下床的床垫槽位就靠这一条。
    upholstery: upholstery ?? { surface: "fabric", color: 0xf3e7d8 },
    cushion: cushion ?? upholstery ?? { surface: "fabric", color: 0xf3e7d8 },
    metal: metal
  };
}

/**
 * 石材件的组合：石板 / 石座 / 五金。
 *
 * 与柜类、木器族的差别在**腿**这一项：石材家具没有腿，落地的那一件本身就是石座（`base`）——
 * 组合茶几就是「白石板压黑石座」这个构造。因此 base 刻意**不**跟随 top：上下两块在实物上
 * 常是两种石材（图片里正是白石与黑石），给 base 补一个「跟随台面」的默认值只会把这种对比抹平。
 * 所以两块都必须逐档位显式给 —— 这也是构造器里唯一不让写兜底的一处。
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

// ── 组合石材件（茶几 / 石座台面）──────────────────────────────────────────
// 「档位即组合」在石材上的落点：一个档位一次说清**上石板**与**下石座**分别是哪种石材。
// 参考实物：白石板压黑石座（本组的默认档，也是模型烘焙色的来源），以及整白、整黑、
// 米黄洞石三种常见变体 —— 换档位换的是石材本身，不是「整件刷成另一个颜色」。// 石材用 `slab` 指明色号（见 studio-external-models.js 的 createStoneSlabTexture）：
//   marble      白大理石（与背景墙那张同图，同一种石料只是同一张）
//   marble-dark 黑金大理石（近黑底 + 灰白纹）
// color 在这里是**染色**（乘到整图上），两块同色号时靠它拉开一档明暗；不写就是原色。
// 「米黄洞石」那一档刻意**不给 slab**：洞石是哑光沉积岩、没有大理岩那种纹路，
// 走 surface: "stone" 的细节层更贴近实物 —— 配方里没有 slab 即表示「这块不是整块石材」。
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
      // 同一种石料、两件，靠染色把下座压暗一档，否则上下会糊成一块。
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
    // 这一档的腿**就是**黑铁腿 —— 档位名写的就是这件事，所以 leg 与 base 都给金属。
    woodCombo({
      top: { surface: "wood", color: 0x6b4526 },
      leg: { surface: "metal", color: 0x2e2e30 },
      drawer: { surface: "wood", color: 0x855c36 },
      trim: { surface: "metal", color: 0x303034 },
      metal: { surface: "metal", color: 0x2e2e30 }
    })
  )
]);

// ── 不锈钢 / 白色家电 / 小家电 / IT 设备 ───────────────────────────────────
// 三档说的都是「机身那一大片金属或烤漆」，所以机身 / 门板 / 面板跟随档位；而**玻璃视窗与屏
// 不该跟着档位变**（衣物护理机的玻璃门、蒸烤箱的观察窗，换成银黑还是奶白都还是那块清玻），
// 五金则一直是那支钢色。这三件事写进构造器，档位就不必各记一遍 —— 这正是角色体系要解决的
// 「不该跟着变的东西别跟着变」。
//
// 这个构造器同时服务不锈钢家电（STEEL_APPLIANCE_STYLES）、小家电 / IT 设备（DEVICE_STYLES）
// 与屏类（SCREEN_STYLES）三组档位：它们的**共性**就是「一块大机身 + 一小块屏 / 玻璃 + 一支五金」，
// 差别只在档位给机身什么材质（金属 / 烤漆 / 亮漆），那由各档位自己的入参决定，与构造器无关。
// 名字里的 appliance 因此指「电器设备」这一整类，不只是不锈钢家电。
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
    // 实物的共同规律；单独给它们一个默认值，档位表就不必每档重复一遍。
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
  // 屏、吸尘器的尘杯、晾衣架的灯带都只能跟着机身走。补上组合后它们各自有角色可循；
  // 屏、玻璃、五金由构造器固定（换档位不该把显示屏也换色），机身随档位。
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
 *
 * 六件洁具（台盆 / 马桶 / 蹲便 / 小便斗 / 浴缸 / 花洒）是同一个构造逻辑 ——
 * 「一件陶瓷（或亚克力）本体 + 一处更暗的内腔 + 一支电镀五金」，台盆再加一套柜体木作。
 * 所以本体给它本身，内腔默认由本体「压暗 18%」自动派生（缸内、盆底、斗腔都是同一种陶瓷的
 * 背光面，不可能比本体亮 —— 这条默认值顺带解决了「内腔与本体一个色，整件读成一块实心」），
 * 五金与玻璃则**不随档位变**：镀铬龙头换成岩灰档位也还是镀铬，玻璃隔断的透明件同理。
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
  // 内腔与木作两条默认值刻意在 return **之前**算好：护栏（tools/check_invariants.mjs 的
  // readTopLevelObjectEntries）按字符扫 return 那个对象、只认 depth === 1 的键，且跳过一个键时
  // 会把它值里的 `{` / `(` 一起跳过去、深度记账就此带偏。提出来之后 return 里每个值都是裸标识符。
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
  // surface 取 glass 是为了**清掉贴图**：glass 在 studio-surface-fabrics.js 里没有画法，
  // 于是这一块拿到一张干净的镜面；给 metal 会平添一层拉丝纹，照出来是花的。
  // 金属度刻意只给 0.35 而不是 0.9：场景里**没有环境贴图**（studio 全程不挂 scene.environment），
  // 而金属是没有漫反射的 —— 金属度拉到 0.9 的镜面会把 65% 的入射光直接丢掉，渲染成一块近黑的面板。
  // 0.35 配 0.08 的粗糙度：漫反射还在（浅蓝灰的底色读得出来），高光很紧（一看就是镜面）。
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
 *
 * 与洁具分开写是因为「透明件也要参与组合」：洁具那六件的玻璃只出现在浴缸溢流那种小件上，
 * 而隔断的**主体**就是玻璃 —— 清玻换成茶玻时，框通常也跟着换成古铜色（成品隔断就是这么配色的）。
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
      // 这一档下陶瓷件的观感从「白瓷」变成「石材一体盆」，是市面上的主流替代做法。
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

// ── 灯具 ──────────────────────────────────────────────────────────────────
// floorlamp / walllamp 同时属于 APPLIANCE_PALETTE_ITEM_TYPES，灯体走的是**家电**换色分支
// （读 appliance* 三键、不锈钢成品另见 APPLIANCE_FINISH_*），因此各档位除家具四档外必须写全
// appliance / applianceSoft / applianceDark —— 只写 furniture* 属于「下拉能选、选了没反应」。
//
// 这两件是本次重建进流水线的（原来是两份二进制旧资产）。重建后每块网格都带角色：
//   灯杆 / 横臂 / 关节 = `metal`，配重底板与壁灯背板 = `base`，罩口金属圈 = `trim`，灯罩 = `lit`。
// 于是档位可以按实物给「组合」而不是给一个颜色了 —— 真实灯具本来就是
// 「一支杆 + 一个罩 + 一处配重」三种料，杆换胡桃而罩永远是那块亚麻布，档位表就不必各记一遍。
//
// 灯罩一律走 `fabric`（布艺灯罩，这是市面上最常见的落地 / 壁灯罩），不上 `paint`：
// 布罩半透着光、表面是哑的，漆面罩反而读成塑料壳。四档只换布色（米白 / 亚麻 / 冷白 / 米灰），
// 换色卡时罩子跟着走一点点，杆的材质与颜色才是档位的主角。
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
      // 缺了它，「材质风格」这一栏在家具与灯具之间就少一个对照项。
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
 *
 * 五种料里只有叶与盆是「看得出换了档」的两块：叶决定这株植物的调子，盆决定它的容器。
 * 托、干、土从盆色派生 —— 盆托与花盆是同一批陶件（天然同色系深一档），
 * 主干是深木色，盆土是不反光的深色颗粒，这三块在任何一档都不该抢戏。
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
 *
 * 包边默认从毯面色派生（同色系深 22%）而不是写死：实物上的包边就是同族深一档的织带，
 * 写死一个棕褐色会让三档地毯共用同一条边，毯面换了色而边没换，一眼就看出是「整件刷色」。
 * 防滑底压到深 62% —— 它只在被掀起来时才看得到，深色底也不会在浅色毯面边缘透出一道亮线。
 *
 * 三块都上 `fabric` 质感：这是簇绒地毯唯一能拿到织纹的地方（见 studio-surface-fabrics.js
 * 的 SURFACE_TEXTURE_ALIAS），不上就只剩一片纯色。
 *
 * 参数名一律用**角色名**（fabric / trim / base）而不是 field / border / backing：
 * 护栏（tools/check_invariants.mjs 的 readComboRoleSupport）按「调用处传进来的键名」判定
 * 这个档位覆盖了哪些角色，参数名与角色名不一致时 fabric 会被判成「没配方」。
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
 *
 * 帘布一律 `fabric`（布面才有织纹与哑光），顶轨一律 `metal`：真实窗帘的轨道是铝合金，
 * 它不该跟着布色变 —— 这也是三档之间「布换色、杆不换」的原因。
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
 *
 * 这是全站唯一一件**跨两族料**的家具：下半是柜类（木作 / 漆面），上半是水族（玻璃 + 黑框）。
 * 所以它的组合不能只给一个颜色 —— 缸框默认从柜体派生但**压到深 50%**：
 * 柜体换成胡桃木时，缸框会跟着变成深胡桃，而不是留在黑框上。玻璃默认永远是那一份清水色
 * （0xdfeaec，与 GLASS_STYLES / 柜类玻璃同一支），因为它不该跟着柜子的木色走。
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

// ── 钢琴 ──────────────────────────────────────────────────────────────────
// 钢琴这一族与其它档位最不同的一点是**琴键不跟着档位走**：亮光黑琴身、亮光白琴身、暖木琴身，
// 琴键都是那片象牙白与那排黑键（实物就是如此）。所以白键 / 黑键在构造器里给死值 —— 交给各档位
// 自己写一遍，迟早有一档把琴键刷成木色，而那种错法看上去还挺「统一」，肉眼判不出来。
const PIANO_KEY_RECIPE = Object.freeze({ surface: "lacquer", color: 0xf6f2e8 });
const PIANO_ACCENT_RECIPE = Object.freeze({ surface: "lacquer", color: 0x16181a });
/**
 * 钢琴的组合：琴身 / 顶盖 / 腰线 / 键床与键侧木 / 琴腿 / 五金 + 白键 / 黑键。
 *
 * 琴身、顶盖、腰线三者同料但明度依次递进：顶盖受光最多、腰线最浅、琴身最沉。这一层明度差
 * 是实物上最容易读出来的一处层次，一整块同色的琴身会像一块塑料。
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

// ── 影音屏幕 ──────────────────────────────────────────────────────────────
// 电视走家电调色板，且整机取色只看 applianceDark（见 studio-external-models.js 的 tv_ 分支），
// 因此档位必须覆盖 appliance* 三键；只写 furniture* 会是「选了没反应」。
const SCREEN_STYLES = Object.freeze([
  // 屏类的角色分工与设备族同一套骨架：**屏自己永远是那块深色的屏**，只有边框（trim）与
  // 底座（metal）跟着档位走 —— 换「银灰」是把边框换成银灰，不是把画面也刷成银灰。
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

/**
 * 逐类型显式档位表。同族物件共用同一组档位常量，避免同一批风格在十几个类型里各写一遍。
 * 键必须属于 MATERIAL_STYLE_ITEM_TYPES —— 与它不一致时 materialStyleOptionsFor 会回落到族兜底，
 * 而不是报错：物件照常可放，只是档位少一点，这比整件东西放不下去好。
 *
 * 注意键是**物件类型**：按挂装方式拆成三份模型的电视（tv_standard / tv_tabletop / tv_mobile）
 * 在这里只有 tv 一条 —— 那三份是同一件东西的三种挂装，档位自然同组。护栏因此把这三个模型键
 * 折算回 tv 再比（见 tools/check_invariants.mjs 的 checkMaterialRoleCoverage）。
 */
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
});

/**
 * 材质族兜底表：按类型所属的族取一组档位。
 * 只在显式表查不到时使用，保证「新增了同类物件但忘了加显式档位」时不至于没档可选。
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
 * 先查逐类型显式表，再查材质族，最后是空数组（界面只显示 `跟随全局风格`）。
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
 * 非法值一律落回 `auto`（跟随全局）而不是抛错：草稿里出现脏值 / 旧值 / 别的类型留下的 id 时，
 * 物件照常显示，只是回到默认外观 —— 这与 normalizeMuralArtStyle 的取舍一致。
 */
export function normalizeMaterialStyle(itemType, styleValue) {
  if (typeof styleValue !== "string" || styleValue === MATERIAL_STYLE_AUTO) {
    return MATERIAL_STYLE_AUTO;
  }
  return findMaterialStyle(itemType, styleValue) ? styleValue : MATERIAL_STYLE_AUTO;
}

/** 风格档位的中文名，供提示与调试使用；找不到时回退「跟随全局风格」。 */
export function materialStyleLabel(itemType, styleValue) {
  if (styleValue === MATERIAL_STYLE_AUTO) {
    return "跟随全局风格";
  }
  return findMaterialStyle(itemType, styleValue)?.label || "跟随全局风格";
}

/**
 * 把逐物件风格叠加到调色板上。
 *
 * `auto`（或该类型不支持的取值）时**原样返回入参调色板**，不做任何复制或改写 —— 这是「加了属性
 * 但没选风格」的物件与改动前逐字节一致的原因。命中风格时返回一个浅拷贝，只覆盖该风格声明的键，
 * 其余键（背景、墙、地板等场景色）保持基础调色板的值。
 *
 * 返回值里的 surface / roughness / metalness 供材质侧决定质感贴图与参数；`auto` 时为 null，
 * 材质侧据此跳过质感处理。
 *
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
    // 运行侧据此给每一块网格取**它自己的**颜色与质感；为 null 时这条路整段跳过。
    roles: style.roles ?? null,
    styleId: style.id
  };
}
