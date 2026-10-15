/**
 * **模型 × 槽位 → 语义角色** 对照表。
 *
 * 为什么需要它：0.7.6 批量导出把外部模型材质名统一改成「模型名 + 候选明度」
 * （`<模型>-candidate-<token>`，token ∈ body/dark/light/soft/accent/glass，个别模型是
 * `<模型>-foliage-<token>` / `<模型>-detail-<token>`），**真实构件语义在命名里就丢了**。
 * 光看材质名，`plant-candidate-dark` 与 `microwave-candidate-dark` 长得一样，但前者是
 * 「叶片」、后者是「机身暗面」—— 必须逐个模型把槽位还原成语义角色，配色才可能跟上真实语义。
 *
 * 还原依据（按优先级）：
 * 1. **命名中缀**：`-foliage-`（绿植）、`-sanitary-`（洁具）、`-detail-`（数码细节）… 本模块的
 *    `semanticSlotToken` 会把中缀后面的尾词当槽位 token；
 * 2. **几何启发式草案**（历史审计脚本产出）：封顶且三角面最多 = 叶、
 *    贴地矮件 = 盆/底座、极薄扁片 = 托盘、竖直中段面数少 = 枝干；
 * 3. **人工校正**：按构件常识定稿（本文件即校正结果）。
 *
 * 解析顺序（`resolveSemanticSlotRole`）：
 * 完整材质名覆盖 → 模型级 token 表 → 家族级 token 表 → 通用 token 兜底 → `null`（沿用旧逻辑）。
 *
 * 角色名与写实外观的对应见 [`studio-semantic-roles.ts`](./studio-semantic-roles.ts)。
 */

/* ------------------------------------------------------------------ *
 * 槽位 token 提取
 * ------------------------------------------------------------------ */

/** `<模型>-candidate-<token>` / `-foliage-` / `-sanitary-` / `-detail-` 等中缀后的尾词。 */
const SLOT_INFIX_PATTERN = /-(?:candidate|foliage|sanitary|detail|furniture|aquatic|tea|garden|decor)-/;
/** `material-3` 这类纯序号槽位。 */
const MATERIAL_INDEX_PATTERN = /^material-(\d+)$/;

/**
 * 从材质名里取「槽位 token」：
 * - `material-3` → `"3"`；
 * - `plant-candidate-light` → `"light"`（取中缀后的尾词）；
 * - `M03_Pewter_Shine` → `"shine"`（无连字符时取末段）。
 */
export function semanticSlotToken(materialName: string | undefined): string {
  const lowerName = (materialName || "").toLowerCase();
  const materialIndex = lowerName.match(MATERIAL_INDEX_PATTERN);
  if (materialIndex?.[1]) return materialIndex[1];
  const afterInfix = SLOT_INFIX_PATTERN.test(lowerName)
    ? lowerName.split(SLOT_INFIX_PATTERN).pop() || lowerName
    : lowerName;
  const segments = afterInfix.split(/[-_]/).filter(Boolean);
  return segments.length ? segments[segments.length - 1] : lowerName;
}

/* ------------------------------------------------------------------ *
 * 通用 token 兜底（任何家族都适用；写实中性件，不会塌成家具灰）
 * ------------------------------------------------------------------ */

export const GENERIC_TOKEN_ROLES: Readonly<Record<string, string>> = Object.freeze({
  body: "bodyNeutral",
  dark: "darkNeutral",
  soft: "softNeutral",
  light: "lightNeutral",
  accent: "accentNeutral",
  glass: "glassNeutral",
});

/* ------------------------------------------------------------------ *
 * 家族级 token → 语义角色
 * ------------------------------------------------------------------ */

export const FAMILY_TOKEN_ROLES: Readonly<Record<string, Readonly<Record<string, string>>>> =
  Object.freeze({
    /* 柜体 / 木作柜类 */
    joinery: {
      body: "carcass",
      dark: "base",
      soft: "shelf",
      light: "cabinetDoor",
      accent: "handle",
      glass: "glass",
      panel: "cabinetDoor",
      door: "cabinetDoor",
      top: "countertop",
      frame: "frame",
      interior: "interior",
      shelf: "shelf",
      base: "base",
      trim: "trim",
      leg: "leg",
      drawer: "drawer",
    },
    /* 木器家具（桌 / 吧台 / 茶几 / 岛台） */
    woodwork: {
      body: "wood",
      dark: "frame",
      soft: "wood",
      light: "surface",
      accent: "leg",
      glass: "glass",
      top: "countertop",
      surface: "countertop",
      slab: "countertop",
      leg: "leg",
      frame: "frame",
      door: "cabinetDoor",
      drawer: "drawer",
      shelf: "shelf",
      base: "base",
      trim: "trim",
      interior: "interior",
    },
    /* 软装（沙发 / 椅 / 床） */
    upholstery: {
      body: "frame",
      dark: "base",
      soft: "cushion",
      light: "upholstery",
      accent: "leg",
      glass: "glass",
      frame: "frame",
      fabric: "fabric",
      cushion: "cushion",
      linen: "linen",
      mattress: "mattress",
      pillow: "pillow",
      runner: "runner",
      base: "base",
      leg: "leg",
    },
    rug: { body: "rugPile", dark: "rugBorder", soft: "rugPile", light: "rugBorder", accent: "rugBorder" },
    /* 卫浴 / 洁具 */
    ceramic: {
      soft: "ceramic",
      body: "ceramic",
      dark: "faucet",
      light: "rim",
      accent: "soapTray",
      glass: "mirror",
      ceramic: "ceramic",
      seat: "seat",
      interior: "interior",
      metal: "faucet",
      mirror: "mirror",
      sink: "bowl",
      top: "rim",
      base: "base",
      panel: "panel",
      trim: "trim",
      rim: "rim",
    },
    /* 家电整机 */
    appliance: {
      body: "shell",
      dark: "base",
      soft: "door",
      light: "panel",
      accent: "handle",
      glass: "window",
      top: "top",
      door: "door",
      panel: "panel",
      drum: "drum",
      handle: "handle",
      trim: "trim",
      base: "base",
      interior: "interior",
      display: "display",
      indicator: "indicator",
      control: "control",
      grille: "grille",
      wheel: "wheel",
    },
    /* 数码 / 办公设备 */
    device: {
      body: "shell",
      dark: "bezel",
      soft: "panel",
      light: "trim",
      accent: "indicator",
      glass: "screen",
      screen: "screen",
      bezel: "bezel",
      stand: "stand",
      panel: "panel",
      keycap: "keycap",
      paper: "paperSheet",
      lens: "lens",
      base: "base",
      handle: "handle",
    },
    /* 影音 / 媒体 */
    media: {
      body: "shell",
      dark: "bezel",
      soft: "grille",
      light: "trim",
      accent: "stand",
      glass: "screen",
      screen: "screen",
      bezel: "bezel",
      grille: "grille",
      stand: "stand",
      disc: "disc",
      platter: "platter",
      lamp: "glow",
      lit: "glow",
    },
    /* 厨具器物 */
    tableware: {
      body: "rack",
      dark: "base",
      soft: "container",
      light: "mug",
      accent: "basket",
      glass: "container",
      rack: "rack",
      basket: "basket",
      board: "board",
      container: "container",
      lid: "containerLid",
      mug: "mug",
      metal: "metal",
      handle: "handle",
    },
    /* 灯具 */
    lamp: {
      dark: "lampBody",
      accent: "lampAccent",
      soft: "lampShade",
      light: "diffuser",
      body: "lampBody",
      glass: "diffuser",
      metal: "metal",
      shade: "lampShade",
      stem: "lampBody",
      base: "lampBody",
      diffuser: "diffuser",
    },
    /* 楼梯 */
    stair: {
      body: "tread",
      dark: "handrail",
      light: "railing",
      soft: "tread",
      accent: "handrail",
      tread: "tread",
      handrail: "handrail",
      railing: "railing",
      metal: "handrail",
      glass: "glass",
    },
    /* 车辆 */
    vehicle: {
      body: "bodywork",
      dark: "tyre",
      soft: "vehicleGlass",
      light: "trim",
      accent: "handle",
      glass: "vehicleGlass",
      tyre: "tyre",
      metal: "metal",
      wheel: "tyre",
    },
    /* 门 / 门套 */
    door: {
      body: "panelSlat",
      dark: "frame",
      soft: "panelSlat",
      light: "panelSlat",
      accent: "handle",
      glass: "glass",
      frame: "frame",
      panel: "panelSlat",
      metal: "metal",
    },
    /* 茶台套装 */
    tea: {
      body: "wood",
      dark: "base",
      soft: "wood",
      light: "ceramic",
      accent: "accentNeutral",
      frame: "wood",
      panel: "wood",
      recess: "base",
      ceramic: "ceramic",
    },
    /* 庭院 / 绿化 */
    garden: {
      base: "planter",
      leaf: "foliage",
      dark: "soil",
      light: "grassTuft",
      accent: "flower",
      water: "glass",
      body: "planter",
      soft: "foliage",
      glass: "glass",
      metal: "metal",
      wood: "wood",
    },
    /* 室内绿植 / 花艺 */
    plant: {
      body: "pot",
      glass: "saucer",
      dark: "stem",
      soft: "foliage",
      light: "foliageLight",
      accent: "flower",
      flowercenter: "flowerCenter",
      foliage: "foliage",
      stem: "stem",
      pot: "pot",
      soil: "soil",
      saucer: "saucer",
      flower: "flower",
    },
    /* 摆件 */
    decor: {
      body: "sculpture",
      dark: "base",
      soft: "drape",
      light: "surface",
      accent: "accentNeutral",
      glass: "glass",
      vase: "vase",
      flower: "flower",
      plate: "plate",
      candle: "candle",
      lit: "glow",
      metal: "metal",
      wood: "wood",
      base: "base",
    },
    /* 柱 */
    pillar: { body: "bodyNeutral", base: "base", trim: "trim", dark: "base", light: "bodyNeutral" },
    /* 窗帘 */
    curtain: {
      body: "fabric",
      soft: "fabric",
      light: "fabric",
      dark: "panelSlat",
      accent: "fabric",
      glass: "glass",
      fabric: "fabric",
      slat: "panelSlat",
      shutter: "panelSlat",
    },
    /* 健身器械 */
    fitness: {
      body: "sportFrame",
      dark: "weight",
      soft: "pad",
      light: "trim",
      accent: "grip",
      frame: "sportFrame",
      metal: "metal",
      pad: "pad",
      weight: "weight",
      grip: "grip",
      felt: "courtFelt",
      wood: "wood",
      glass: "glass",
    },
    /* 儿童 */
    kids: {
      body: "playBody",
      dark: "playBody",
      soft: "playAccent",
      light: "playAccent",
      accent: "playBall",
      glass: "glass",
      fabric: "tentFabric",
      wood: "rackWood",
    },
    /* 宠物 */
    pet: {
      body: "petBody",
      dark: "base",
      soft: "petPad",
      light: "petBowl",
      accent: "scratchingPost",
      glass: "glass",
      metal: "metal",
      bowl: "petBowl",
      litter: "litter",
      wood: "rackWood",
      /** 宠物烘干箱 / 喂食器的内腔与干粮：以前这两个 token 落到 `body`，最终塌成兜底灰。 */
      inside: "interior",
      food: "petFood",
    },
    /* 家具（表 / 凳 / 床类通用件） */
    furniture: {
      body: "frame",
      dark: "base",
      soft: "fabric",
      light: "surface",
      accent: "leg",
      glass: "glass",
      wood: "wood",
      top: "countertop",
    },
    /* 结构件（电梯轿厢 / 钢琴外壳等大体量饰面板） */
    structure: {
      body: "panelSlat",
      dark: "frame",
      soft: "panelSlat",
      light: "surface",
      accent: "handle",
      glass: "glass",
      frame: "frame",
      metal: "handrail",
      panel: "panelSlat",
    },
    misc: { ...GENERIC_TOKEN_ROLES },
  });

/* ------------------------------------------------------------------ *
 * 模型级 token → 语义角色（人工校正）
 * ------------------------------------------------------------------ */

/**
 * 逐模型的**槽位 token → 语义角色**校正表。只在家族级表给不出正确构件时登记；
 * 值来自几何启发式草案 + 构件常识。
 */
export const MODEL_SLOT_ROLES_SEMANTIC: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze({
  /* ── 绿植（0.7.6 重绘 + 收藏批） ─────────────────────────────── */
  plant: { body: "pot", glass: "saucer", dark: "foliage", soft: "foliageSoft", light: "foliageLight" },
  "plant-monstera": { body: "pot", glass: "saucer", dark: "stem", soft: "foliage", light: "foliageLight" },
  "plant-snake": { body: "pot", glass: "saucer", soft: "foliageSoft", light: "foliage" },
  "plant-palm": { body: "pot", glass: "saucer", dark: "stem", soft: "foliageSoft", light: "foliage" },
  "plant-rubber": { body: "pot", glass: "saucer", dark: "stem", soft: "foliageSoft", light: "foliage" },
  "plant-pothos": { body: "pot", glass: "saucer", dark: "stem", soft: "foliage", light: "foliageLight" },

  /* ── 花艺 ────────────────────────────────────────────────────── */
  "flower-orchid": {
    body: "pot",
    glass: "saucer",
    dark: "stem",
    soft: "foliage",
    light: "foliageLight",
    accent: "flower",
    flowercenter: "flowerCenter",
  },
  "flower-peace-lily": {
    body: "pot",
    glass: "saucer",
    dark: "stem",
    soft: "foliage",
    light: "foliageLight",
    accent: "flower",
    flowercenter: "flowerCenter",
  },
  "flower-anthurium": {
    body: "pot",
    glass: "saucer",
    dark: "stem",
    soft: "foliage",
    light: "foliageLight",
    accent: "flower",
    flowercenter: "flowerCenter",
  },
  "flower-hydrangea": {
    body: "pot",
    glass: "saucer",
    dark: "stem",
    soft: "foliage",
    light: "foliageLight",
    accent: "flower",
    flowercenter: "flowerCenter",
  },

  /* ── 卫浴 / 洁具 ─────────────────────────────────────────────── */
  toilet: { ceramic: "ceramic", seat: "seat", body: "interior" },
  squattoilet: { ceramic: "ceramic", seat: "seat", body: "interior" },
  urinal: { soft: "ceramic", body: "ceramic", dark: "faucet", light: "rim" },
  bathtub: { soft: "ceramic", dark: "faucet", light: "rim" },
  basin: { body: "bowl", accent: "soapTray", dark: "faucet", light: "rim", soft: "interior", glass: "mirror" },
  /** 台面：整件就是台盆那张台面板（几何自己建，材质沿用台盆 `light` 槽位）—— `light` 落 `rim`。 */
  countertop: { light: "rim" },
  shower: { body: "ceramic", interior: "interior", metal: "faucet" },
  "heated-towel-rail": { body: "rack", dark: "faucet", soft: "towel", light: "trim" },
  "shower-stool": { body: "seat", light: "leg", dark: "faucet" },
  "toiletry-set": { body: "container", soft: "containerLid", dark: "base", light: "mug" },
  "hairdryer-holder": { body: "shell", dark: "base", soft: "trim" },
  "toothbrush-holder": { body: "container", soft: "mug", dark: "base", light: "container" },
  "mop-sink": { light: "ceramic", dark: "faucet", body: "bowl" },
  "foot-spa": { body: "ceramic", dark: "base", soft: "rim", light: "panel" },

  /* ── 厨房电器（0.7.6 收藏批） ────────────────────────────────── */
  microwave: { body: "shell", dark: "door", soft: "panel", light: "handle" },
  steamoven: { body: "shell", dark: "door", light: "panel", glass: "window" },
  rangehood: { body: "shell", soft: "trim", dark: "grille", light: "grille" },
  dishwasher: { dark: "door", body: "shell", soft: "panel", light: "handle" },
  ricecooker: { body: "shell", dark: "lid", soft: "panel", light: "handle" },
  "coffee-machine": { dark: "shell", body: "base", soft: "panel", light: "trim", accent: "handle" },
  "pressure-cooker": { body: "shell", dark: "lid", soft: "panel", accent: "handle", light: "handle" },
  "air-fryer": { body: "shell", dark: "door", soft: "panel", light: "handle" },
  "power-blender": { body: "shell", dark: "base", light: "panel", glass: "container", soft: "containerLid" },
  juicer: { body: "shell", dark: "base", light: "panel", soft: "containerLid", glass: "container", accent: "handle" },
  "bread-maker": { body: "shell", soft: "panel", glass: "window", dark: "lid", light: "handle" },
  "stand-mixer": { body: "shell", dark: "base", light: "handle" },
  toaster: { body: "shell", soft: "panel", dark: "base", accent: "handle" },
  "electric-kettle": { dark: "shell", body: "base", soft: "handle" },
  "health-kettle": { dark: "shell", glass: "window", soft: "handle", body: "panel", light: "base" },
  "induction-hob": { body: "hobFrame", dark: "cooktop", light: "burner" },
  "ceramic-hob": { body: "hobFrame", dark: "cooktop", accent: "burner", light: "burner" },
  "food-steamer": { body: "base", dark: "lid", glass: "window", light: "panel", soft: "soapTray" },
  "multi-cooker": { body: "shell", soft: "lid", dark: "base", light: "handle" },
  "coffee-grinder": { body: "shell", glass: "container", dark: "base", soft: "containerLid", accent: "handle" },

  /* ── 洗衣 / 清洁 ─────────────────────────────────────────────── */
  washer: { dark: "shell", body: "door", soft: "panel", light: "trim", glass: "window", drum: "drum" },
  dryer: { dark: "shell", body: "door", soft: "panel", light: "trim", glass: "window", drum: "drum" },
  "floor-washer": { dark: "shell", body: "base", soft: "panel", accent: "handle", light: "trim" },

  /* ── 厨具器物 ────────────────────────────────────────────────── */
  "dish-rack": { dark: "rack", body: "base", light: "mug", soft: "basket" },
  "knife-block": { body: "rackWood", light: "metal", dark: "handle" },
  "cutting-board-rack": { dark: "board", body: "rackWood" },
  "spice-set": { body: "container", soft: "container", dark: "base", light: "containerLid" },
  "cookware-set": { body: "potBody", light: "potBody", dark: "handle", soft: "trim" },
  "mug-tree": { body: "rackWood", light: "mug" },
  "capsule-rack": { body: "rack", dark: "base", soft: "container", light: "container", accent: "mug" },
  "rice-bin": { body: "container", soft: "containerLid", dark: "base", glass: "window" },
  "fruit-basket": { body: "basket", accent: "basket", dark: "base", soft: "basket" },

  /* ── 影音 / 媒体 ─────────────────────────────────────────────── */
  soundbar: { body: "shell", dark: "grille", accent: "stand", light: "trim" },
  "tower-speaker": { body: "shell", dark: "grille", accent: "stand", soft: "shell", light: "grille" },
  projector: { body: "shell", dark: "bezel", glass: "lens", light: "trim" },
  "projection-screen": { body: "shell", dark: "screen", light: "trim" },
  turntable: { body: "shell", dark: "platter", accent: "stand", light: "trim" },
  "electric-fireplace": { body: "shell", dark: "glow", soft: "shell", light: "glow", accent: "glow" },
  "magazine-rack": { body: "rackWood", soft: "basket", accent: "rackWood", dark: "base", light: "basket" },

  /* ── 数码 / 办公 ─────────────────────────────────────────────── */
  "dual-monitors": { dark: "bezel", glass: "screen", body: "stand" },
  "paper-shredder": { body: "shell", dark: "base", light: "handle", accent: "grille" },
  scanner: { body: "shell", soft: "panel", glass: "screen", dark: "base", light: "handle" },
  "drawing-tablet": { body: "shell", dark: "screen", light: "screen" },
  "single-glass-cabinet": { body: "carcass", dark: "base", soft: "shelf", glass: "glass" },

  /* ── 卧室 ────────────────────────────────────────────────────── */
  "round-double-bed": { body: "frame", dark: "base", light: "mattress", soft: "upholstery", accent: "leg" },
  "bed-end-bench": { soft: "upholstery", body: "frame" },
  "bed-storage-chest": { body: "carcass", soft: "lid", dark: "base", accent: "handle" },
  "bed-tray": { body: "board", light: "board" },
  "jewelry-box": { body: "carcass", accent: "handle", soft: "interior", light: "interior", dark: "base" },

  /* ── 玄关 ────────────────────────────────────────────────────── */
  "shoe-bench": { soft: "upholstery", body: "frame", dark: "base", light: "leg" },
  "umbrella-stand": { dark: "base", body: "container", accent: "trim", soft: "interior" },
  "wall-coat-hooks": { body: "rackWood", dark: "handle" },
  "folding-screen": { body: "panelSlat", soft: "frame", accent: "panelSlat" },
  suitcase: { body: "shell", dark: "base", soft: "handle", light: "trim" },

  /* ── 摆件 ────────────────────────────────────────────────────── */
  "pillow-set": { light: "pillow", soft: "pillow", accent: "fabric" },
  "sofa-throw": { soft: "throwBlanket", light: "throwBlanket" },
  "floor-sculpture": { dark: "base", body: "sculpture", accent: "sculpture" },
  "decorative-plate": { light: "plate", accent: "plate", body: "plate", dark: "plate" },
  "dried-flowers": { body: "pot", dark: "stem", accent: "driedBouquet" },
  candlestick: { body: "base", accent: "candle", light: "candle", dark: "soapTray" },
  "decorative-lantern": { dark: "shell", body: "shell", glass: "glow", light: "glow" },
  trophy: { dark: "base", accent: "trophyMetal", light: "trophyMetal" },
  "figurine-set": { dark: "base", body: "figurine", light: "figurine", accent: "figurine", soft: "figurine" },

  /* ── 健身 ────────────────────────────────────────────────────── */
  "spin-bike": { dark: "sportFrame", body: "frame", light: "grip" },
  "rowing-machine": { body: "sportFrame", dark: "sportFrame", light: "grip" },
  "weight-bench": { dark: "sportFrame", body: "pad" },
  "barbell-rack": { body: "sportFrame", dark: "weight", light: "grip" },
  "punching-bag": { dark: "base", body: "bagBody", accent: "bagBody", light: "trim" },
  "pilates-reformer": { body: "sportFrame", dark: "base", soft: "pad", light: "trim", accent: "grip" },
  "foosball-table": { body: "wood", soft: "courtFelt", accent: "courtFelt", dark: "sportFrame", light: "trim" },
  "air-hockey-table": { body: "sportFrame", light: "surface", accent: "trim", dark: "base" },
  "racing-cockpit": { body: "sportFrame", soft: "pad", dark: "frame", light: "grip" },

  /* ── 儿童 ────────────────────────────────────────────────────── */
  "building-block-table": { body: "playBody", soft: "playAccent", light: "playAccent", accent: "playBall" },
  "kids-tent": { body: "tentFabric", soft: "tentFabric", light: "tentFabric", accent: "playAccent", dark: "playBody" },
  "kids-slide": { body: "playBody", accent: "playAccent", soft: "playAccent" },
  "kids-swing": { body: "playBody", dark: "grip", soft: "playAccent" },
  "ball-pit": { soft: "playBall", light: "playBall", body: "playBall", accent: "playBall" },
  "play-kitchen": {
    body: "playBody",
    accent: "playAccent",
    dark: "playBody",
    glass: "glass",
    soft: "playAccent",
    light: "playAccent",
  },
  "doll-shelf": { body: "rackWood", soft: "shelf", accent: "playAccent", light: "shelf", dark: "base" },

  /* ── 宠物 ────────────────────────────────────────────────────── */
  "pet-fountain": { body: "petBody", light: "petBowl", glass: "container", soft: "petBowl", dark: "trim" },
  "pet-feeder": { body: "petBody", dark: "base", soft: "petBowl", light: "trim" },
  "litter-tray": { body: "petBody", soft: "litter", accent: "litter" },
  "smart-litter-box": { dark: "base", body: "petBody", soft: "panel", light: "trim" },
  "pet-pen": { body: "rack", dark: "base" },
  "dog-crate": { body: "rackWood", dark: "base", soft: "petPad" },
  "cat-scratcher": { body: "scratchingPost", dark: "base" },
  "wall-cat-shelves": { body: "rackWood", soft: "petPad", dark: "base" },
  "pet-steps": { body: "rackWood", soft: "petPad" },
  "pet-stroller": { dark: "base", body: "petBody", soft: "petPad", light: "trim" },

  /* ── 灯具（无中缀的旧命名） ──────────────────────────────────── */
  "table-lamp": { body: "lampBody", shade: "lampShade", stem: "lampBody" },
  "up-down-wall-lamp": { body: "lampBody", diffuser: "diffuser" },

  /* ── 旧命名 / 无中缀槽位 ─────────────────────────────────────── */
  "yoga-set": { soft: "pad", accent: "grip", light: "pad", dark: "grip" },
  "round-rug": { border: "rugBorder", inset: "rugPile", body: "rugPile" },
  "storage-box": { body: "carcass", detail: "shelf", lid: "cabinetDoor" },
});

/* ------------------------------------------------------------------ *
 * 完整材质名覆盖（命名不含可识别 token 时）
 * ------------------------------------------------------------------ */

/** 逐模型的**完整材质名（小写）→ 语义角色**覆盖；优先于 token 表。 */
export const MODEL_MATERIAL_ROLE_SEMANTIC: Readonly<
  Record<string, Readonly<Record<string, string>>>
> = Object.freeze({
  "decor-vase": {
    "decor-vase-decor-0": "vase",
    "decor-vase-decor-1": "flower",
    "decor-vase-decor-2": "stem",
  },
  airoutlet: { m03_pewter_shine: "grille" },
  smallcar: { car_tms: "bodywork" },
  /** 猫爬架：`cat-tree-rope` 是缠柱的**剑麻绳**，家族 token 只认 `body`（会落到灰）。 */
  "cat-tree": { "cat-tree-rope": "rope" },
  tv_standard: {
    "tv_standard-material-0": "screen",
    "material-0": "screen",
    0: "screen",
  },
});

/* ------------------------------------------------------------------ *
 * 家族 token 直读批（`<type>-<role>` 直写角色，但没有逐模型对照表）
 * ------------------------------------------------------------------ */

/**
 * 0.7.2 外购 approved 批（`approved-item-models.ts`，见 `APPROVED_ITEM_META`）与其余「材质名
 * 直写 `<type>-<role>`、但没有逐模型角色表」的模型。
 *
 * 它们的 `body` / `dark` / `soft` / `light` / `accent` 并不是「明度候选色」，而是家族里**另有
 * 语义的构件**：吊扇 `body` = 外壳、跑步机 `dark` = 配重、壁艺 `soft` = 帷幔、猫爬架 `soft` =
 * 猫垫…。这些款没有遗留角色表，直接交给 `FAMILY_TOKEN_ROLES` 还原真实构件，避免落到
 * `body → 家具灰`。
 */
export const FAMILY_TOKEN_MODEL_IDS: ReadonlySet<string> = new Set([
  "ceiling-fan",
  "smart-display",
  "smart-display-wall",
  "ps5",
  "switch-console",
  "xbox-series-x",
  "arcade-machine",
  "3d-printer",
  "water-purifier",
  "disinfection-cabinet",
  "electric-valve",
  "single-rail-rack",
  "drying-rack",
  "home-network-cabinet",
  "coat-rack",
  "baby-crib",
  "child-highchair",
  "rocking-horse",
  "rocking-chair",
  "cat-tree",
  "treadmill",
  "elliptical",
  "dumbbell-rack",
  "mahjong-table",
  "ping-pong-table",
  "drum-kit",
  "keyboard-stand",
  "guitar-stand",
  "cello-stand",
  "wall-art",
  "wall-clock",
  "full-length-mirror",
  "side-table",
  "bar-stool",
  "trash-bin",
  "storage-cart",
  "laundry-basket",
  "aroma-diffuser",
  "desktop-frame",
  "easel-board",
  "bicycle-rack",
  "dartboard",
  "table-lamp",
  "up-down-wall-lamp",
  "walllamp",
  "pet-bed-bowls",
  "pet-dryer",
]);

/* ------------------------------------------------------------------ *
 * 解析
 * ------------------------------------------------------------------ */

/** 该模型是否登记了语义槽位（token 表 / 完整名覆盖 / 家族 token 直读批）。 */
export function hasSemanticSlotRoles(itemType: string): boolean {
  return Boolean(
    MODEL_SLOT_ROLES_SEMANTIC[itemType] ||
      MODEL_MATERIAL_ROLE_SEMANTIC[itemType] ||
      FAMILY_TOKEN_MODEL_IDS.has(itemType),
  );
}

/**
 * 解析某槽位的**语义角色**。
 * 顺序：完整材质名覆盖 → 模型 token 表 → 家族 token 表 → 通用 token 兜底。
 * 全部未命中返回 `null`（调用方沿用旧的尾词逻辑）。
 */
export function resolveSemanticSlotRole(
  itemType: string,
  family: string,
  materialName: string | undefined,
): string | null {
  const lowerName = (materialName || "").toLowerCase();
  const materialRole = MODEL_MATERIAL_ROLE_SEMANTIC[itemType]?.[lowerName];
  if (materialRole) return materialRole;
  const token = semanticSlotToken(materialName);
  const modelTokenRoles = MODEL_SLOT_ROLES_SEMANTIC[itemType];
  if (modelTokenRoles && modelTokenRoles[token]) return modelTokenRoles[token];
  const familyTokenRoles = FAMILY_TOKEN_ROLES[family];
  if (familyTokenRoles && familyTokenRoles[token]) return familyTokenRoles[token];
  return GENERIC_TOKEN_ROLES[token] ?? null;
}

/* 注：0.7.6 移植期这里曾有一层 `requiresSemanticSlotRoles()` 别名（与
 * `hasSemanticSlotRoles` 完全同义），供 `applyItemDetailMaterial` 把「候选色命名」
 * 的模型拉回角色表。调用点最终直接用 `hasSemanticSlotRoles`，别名零消费者
 * 且被 knip 判为 unused export，故删除，避免留下两个同义入口。 */
