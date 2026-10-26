/**
 * 模型 GLB 的**磁盘分区**：模型库类目 → `public/static/3d-studio/models/` 下的子目录。
 *
 * 目录层级与模型库界面一致：`<大类>/<分区>/`，大类和 `data-library-category`
 * （home / appliance / courtyard）同名；分区名取界面分区 id（`living`、`kitchen-devices`…），
 * 庭院的 `courtyard-0..5` 换成按内容命名的语义名（plants / planters / furniture /
 * structures / water / facilities）——界面里 `courtyard-1` 的标题是「庭院家具」，
 * 内容却是花箱与花坛，照编号命名只会把错位固化到磁盘上。
 *
 * **磁盘上的目录名与文件名是中文**（`家居/客厅家具/沙发-lite.glb`），代码里始终用英文 id
 * （`home/living` + `sofa`）：场景存档、撤销历史、导出包、规格 JSON 全按 id 引用，
 * 改文件名不能动摇它们。翻译只发生在 `modelAssetUrl()` 这一层，
 * 中文名表见 `model-file-names.generated.ts`，目录名表见 `MODEL_FOLDER_PATHS`。
 *
 * 这张表是**唯一真值**：运行时 URL 由 `modelAssetUrl()` 拼出来，不再散落硬编码路径；
 * `scripts/models/organize-models.mjs` 用同一张表校验/迁移文件。新增模型先登记在这里，
 * 否则 `bun run check:models-layout` 会失败。
 */
import { MODEL_FILE_STEMS } from "./model-file-names.generated";

/** 模型静态资源根路径（后端 `StaticFiles` 挂在 `/static`）。 */
const MODELS_ROOT = "/static/3d-studio/models";

/**
 * 分区目录 → 该目录下的模型 id 列表。
 *
 * id 是注册表与存档里的英文键，与 GLB 文件名主干不必相同（文件名主干是中文，
 * 由 `model-file-names.generated.ts` 决定）；registry key 与 id 的历史错位
 * （`smallcar` 用 `car`、`airoutlet` 用 `air-outlet`）继续保留，
 * 目录归属按**id** 算，不按注册表 key 猜。
 */
export const MODEL_ASSETS_BY_FOLDER = Object.freeze({
  "home/living": [
    "bicycle-rack",
    "coffeetable",
    "rocking-chair",
    "side-table",
    "sofa",
    "sofa-l",
    "sofa-l-left",
    "sofa-single",
    "squarecoffeetable",
    "tea-table-set",
    "tvstand",
  ],
  "home/storage": [
    "cabinet",
    "cabinet-two-section",
    "drawer-chest",
    "glasscabinet",
    "shelf",
    "sideboard",
    "single-glass-cabinet",
    "slim-recessed-cabinet",
    "storage-box",
    "storage-cart",
    "wallcabinet",
    "wardrobe",
    "wardrobe-two-section",
  ],
  "home/entry": [
    "arched-glass-console",
    "coat-rack",
    "entryway-niche-cabinet",
    "folding-screen",
    "full-length-mirror",
    "shoe-bench",
    "shoecabinet",
    "suitcase",
    "umbrella-stand",
    "wall-coat-hooks",
  ],
  "home/bedroom": [
    "bed",
    "bed-end-bench",
    "bed-storage-chest",
    "bed-tray",
    "bunk-bed",
    "double-open-wardrobe",
    "jewelry-box",
    "loft-bed-circle",
    "nightstand",
    "round-double-bed",
    "rounddiningtable_turntable",
    "vanity",
  ],
  "home/kitchen-furniture": [
    "bar",
    "bar-stool",
    "chair",
    "kitchen-island",
    "kitchenbase",
    "kitchencooktop",
    "kitchenisland",
    "kitchensink",
    "rounddiningtable",
    "table",
  ],
  "home/kitchen-tools": [
    "capsule-rack",
    "cookware-set",
    "cutting-board-rack",
    "dish-rack",
    "fruit-basket",
    "knife-block",
    "mug-tree",
    "rice-bin",
    "spice-set",
  ],
  "home/bathroom": [
    "basin",
    "bathtub",
    "countertop",
    "foot-spa",
    "glasspartition",
    "hairdryer-holder",
    "heated-towel-rail",
    "mop-sink",
    "shower",
    "shower-stool",
    "squattoilet",
    "toilet",
    "toiletry-set",
    "toothbrush-holder",
    "urinal",
  ],
  "home/office": ["bookcase", "desk", "easel-board", "office-chair"],
  "home/kids": [
    "baby-crib",
    "ball-pit",
    "building-block-table",
    "child-highchair",
    "doll-shelf",
    "kids-slide",
    "kids-swing",
    "kids-tent",
    "play-kitchen",
    "rocking-horse",
  ],
  "home/pets": [
    "cat-scratcher",
    "cat-tree",
    "dog-crate",
    "litter-tray",
    "pet-bed-bowls",
    "pet-feeder",
    "pet-fountain",
    "pet-pen",
    "pet-steps",
    "pet-stroller",
    "smart-litter-box",
    "wall-cat-shelves",
  ],
  "home/plants": [
    "decor-small-plant",
    "flower-anthurium",
    "flower-hydrangea",
    "flower-orchid",
    "flower-peace-lily",
    "plant",
    "plant-monstera",
    "plant-palm",
    "plant-pothos",
    "plant-rubber",
    "plant-snake",
  ],
  "home/decor": [
    "aquarium",
    "candlestick",
    "curtain_left",
    "curtain_right",
    "curtain_split",
    "decor-books",
    "decor-tea-tray",
    "decor-tissue-box",
    "decor-vase",
    "decorative-lantern",
    "decorative-plate",
    "desktop-frame",
    "dried-flowers",
    "figurine-set",
    "floor-sculpture",
    "pillow-set",
    "round-rug",
    "rug",
    "sofa-throw",
    "trophy",
    "wall-art",
    "wall-clock",
  ],
  "home/fitness": [
    "air-hockey-table",
    "barbell-rack",
    "dartboard",
    "dumbbell-rack",
    "foosball-table",
    "mahjong-table",
    "pilates-reformer",
    "ping-pong-table",
    "pool-table",
    "punching-bag",
    "racing-cockpit",
    "rowing-machine",
    "spin-bike",
    "weight-bench",
    "yoga-set",
  ],
  /** 建筑与交通：楼梯、电梯、异形柱、车辆。柱族与楼梯只在注册表里用，卡片不单列。 */
  "home/architecture": [
    "car",
    "elevator",
    "floating-stairs",
    "glass-stairs",
    "pillar",
    "pillar-quarter",
    "pillar-quarterinner",
    "pillar-round",
    "pillar-semicircle",
    "scooter",
    "stairs",
    "steel-stairs",
    "suv",
  ],
  /** 影音设备（家居侧）：乐器与琴架，电器侧的 TV / 音响在 `appliance/media`。 */
  "home/media": ["cello-stand", "drum-kit", "guitar-stand", "keyboard-stand", "piano"],
  "home/laundry": ["drying-rack", "laundry-basket", "single-rail-rack"],
  "home/cleaning": ["trash-bin"],

  "appliance/kitchen-devices": [
    "air-fryer",
    "bread-maker",
    "ceramic-hob",
    "coffee-grinder",
    "coffee-machine",
    "dishwasher",
    "disinfection-cabinet",
    "electric-kettle",
    "food-steamer",
    "freezer",
    "fridge",
    "health-kettle",
    "induction-hob",
    "juicer",
    "microwave",
    "multi-cooker",
    "power-blender",
    "pressure-cooker",
    "rangehood",
    "ricecooker",
    "stand-mixer",
    "steamoven",
    "toaster",
    "water-purifier",
  ],
  "appliance/laundry": ["dryer", "washer"],
  "appliance/cleaning": ["floor-washer", "robotvacuum"],
  "appliance/office-devices": [
    "3d-printer",
    "desktop",
    "drawing-tablet",
    "dual-monitors",
    "home-network-cabinet",
    "laptop",
    "nas",
    "paper-shredder",
    "printer",
    "router",
    "scanner",
    "smart-display",
    "smart-socket-86",
  ],
  /**
   * 环境设备：空调、新风、热水、加湿除湿。
   * `air-outlet` / `pipeline-water-purifier` / `rectangular-pipeline-dispenser` /
   * `tea-bar-machine` 没有卡片（仪表/变体由样式字段选中），按语义并入。
   */
  "appliance/environment": [
    "air-outlet",
    "airpurifier",
    "aroma-diffuser",
    "ceiling-fan",
    "dehumidifier",
    "electric-valve",
    "exhaust-fan",
    "floorac",
    "gaswaterheater",
    "heater",
    "humidifier",
    "pipeline-water-purifier",
    "rectangular-pipeline-dispenser",
    "storagewaterheater",
    "tea-bar-machine",
    "wallac",
  ],
  "appliance/media": [
    "electric-fireplace",
    "magazine-rack",
    "projection-screen",
    "projector",
    "ps5",
    "smart-display-wall",
    "soundbar",
    "switch-console",
    "tower-speaker",
    "turntable",
    "tv_mobile",
    "tv_standard",
    "tv_tabletop",
    "xbox-series-x",
  ],
  "appliance/fitness": ["arcade-machine", "elliptical", "treadmill"],
  "appliance/pets": ["pet-dryer"],
  /** 装饰灯具：`floor-lamp` 与 `floorlamp` 是两个历史键，文件都在这里。 */
  "appliance/lighting-decor": [
    "floor-lamp",
    "floorlamp",
    "table-lamp",
    "up-down-wall-lamp",
    "walllamp",
  ],

  "courtyard/plants": [
    "garden-bamboo",
    "garden-bamboo-dense",
    "garden-conifer",
    "garden-conifer-layered",
    "garden-grass-clump",
    "garden-grass-low",
    "garden-hedge",
    "garden-hedge-round",
    "garden-shrub",
    "garden-shrub-flowering",
    "garden-shrub-low",
    "garden-tree",
    "garden-tree-columnar",
    "garden-tree-multistem",
    "garden-tree-rounded",
  ],
  "courtyard/planters": [
    "garden-flowerbed",
    "garden-flowers",
    "garden-flowers-wild",
    "garden-large-planter",
    "garden-planter",
    "garden-planter-square",
    "garden-planter-trough",
    "garden-raised-bed",
    "garden-round-planter",
    "garden-vegetable-bed",
  ],
  /** 庭院家具与地面铺装：桌椅、躺椅、吊床，以及草坪/木平台/汀步/台阶。 */
  "courtyard/furniture": [
    "garden-bench",
    "garden-bench-backless",
    "garden-bench-curved",
    "garden-chair",
    "garden-chair-bistro",
    "garden-deck",
    "garden-hammock",
    "garden-hanging-chair",
    "garden-lawn",
    "garden-lounger",
    "garden-outdoor-coffee-table",
    "garden-outdoor-sofa",
    "garden-paving",
    "garden-slide",
    "garden-stepping",
    "garden-steps",
    "garden-swing",
    "garden-table",
    "garden-table-picnic",
    "garden-table-round",
  ],
  /** 庭院构筑物：廊架、凉亭、遮阳伞、车棚、拱门、格栅。 */
  "courtyard/structures": [
    "garden-arch",
    "garden-carport",
    "garden-gazebo",
    "garden-gazebo-hex",
    "garden-pergola",
    "garden-pergola-shade",
    "garden-trellis",
    "garden-umbrella",
    "garden-umbrella-square",
  ],
  "courtyard/water": [
    "garden-fountain",
    "garden-fountain-wall",
    "garden-pond",
    "garden-pond-round",
    "garden-pool",
    "garden-rock-water",
    "garden-rocks",
  ],
  /** 庭院设施：院门、围栏、矮墙、灯柱、烧烤、水槽、储物屋。 */
  "courtyard/facilities": [
    "garden-barbecue",
    "garden-barbecue-kettle",
    "garden-bollard",
    "garden-fence",
    "garden-fence-horizontal",
    "garden-fence-lattice",
    "garden-fence-metal",
    "garden-firepit",
    "garden-gate",
    "garden-gate-arch",
    "garden-gate-post",
    "garden-gate-solid",
    "garden-lantern",
    "garden-low-wall",
    "garden-low-wall-brick",
    "garden-low-wall-slat",
    "garden-outdoor-sink",
    "garden-retaining-wall",
    "garden-storage-shed",
  ],
});

/** 分区目录 id（含斜杠，如 `home/living`）。 */
type ModelAssetFolder = keyof typeof MODEL_ASSETS_BY_FOLDER;

/**
 * 分区 id → 磁盘目录（中文）。
 *
 * 顶层大类与 `data-library-category` 对应：`home` → 家居、`appliance` → 电器、
 * `courtyard` → 庭院；第二级沿用模型库界面分区名。目录名只影响磁盘与 URL，
 * 代码里仍然用左边的英文 id。
 */
export const MODEL_FOLDER_PATHS: Readonly<Record<ModelAssetFolder, string>> = Object.freeze({
  "home/living": "家居/客厅家具",
  "home/storage": "家居/柜架收纳",
  "home/entry": "家居/玄关用品",
  "home/bedroom": "家居/卧室家具",
  "home/kitchen-furniture": "家居/厨房家具",
  "home/kitchen-tools": "家居/厨房用品",
  "home/bathroom": "家居/卫浴用品",
  "home/office": "家居/书房家具",
  "home/kids": "家居/儿童用品",
  "home/pets": "家居/宠物用品",
  "home/plants": "家居/室内植物",
  "home/decor": "家居/生活装饰",
  "home/fitness": "家居/健身娱乐",
  "home/architecture": "家居/建筑与交通",
  "home/media": "家居/影音设备",
  "home/laundry": "家居/洗衣烘干",
  "home/cleaning": "家居/清洁设备",
  "appliance/kitchen-devices": "电器/厨房电器",
  "appliance/laundry": "电器/洗衣烘干",
  "appliance/cleaning": "电器/清洁设备",
  "appliance/office-devices": "电器/办公数码",
  "appliance/environment": "电器/环境设备",
  "appliance/media": "电器/影音设备",
  "appliance/fitness": "电器/健身娱乐",
  "appliance/pets": "电器/宠物用品",
  "appliance/lighting-decor": "电器/装饰灯具",
  "courtyard/plants": "庭院/植物",
  "courtyard/planters": "庭院/花箱与花坛",
  "courtyard/furniture": "庭院/家具与铺装",
  "courtyard/structures": "庭院/构筑物",
  "courtyard/water": "庭院/水景",
  "courtyard/facilities": "庭院/设施",
});

/** GLB 变体：`lite` 是降面版（首选），`full` 是完整件（兜底）。 */
type ModelAssetVariant = "lite" | "full";

const folderByAssetId = new Map<string, ModelAssetFolder>();
for (const [folder, assetIds] of Object.entries(MODEL_ASSETS_BY_FOLDER) as [
  ModelAssetFolder,
  readonly string[],
][]) {
  for (const assetId of assetIds) folderByAssetId.set(assetId, folder);
}

/** 模型 id 所在的分区目录；未登记返回 `undefined`（由 `check:models-layout` 报错）。 */
export function modelAssetFolder(assetId: string): ModelAssetFolder | undefined {
  return folderByAssetId.get(assetId);
}

/** 分区 id → 磁盘目录（中文）。 */
export function modelAssetFolderPath(folder: ModelAssetFolder): string {
  return MODEL_FOLDER_PATHS[folder];
}

const folderByFolderPath = new Map<string, ModelAssetFolder>();
for (const [folder, folderPath] of Object.entries(MODEL_FOLDER_PATHS) as [
  ModelAssetFolder,
  string,
][]) {
  folderByFolderPath.set(folder, folder);
  folderByFolderPath.set(folderPath, folder);
}

/**
 * 磁盘目录（中文路径，或迁移前的英文 id）→ 分区 id。
 *
 * 迁移脚本与审计脚本读磁盘时用它反查；英文 id 也认，方便处理还没搬完的目录。
 */
export function modelAssetFolderFromPath(folderPath: string): ModelAssetFolder | undefined {
  return folderByFolderPath.get(folderPath);
}

/** 模型 id → GLB 文件名主干（中文）。还没登记中文名时退回 id 本身。 */
export function modelAssetFileStem(assetId: string): string {
  return MODEL_FILE_STEMS[assetId] ?? assetId;
}

const assetIdByStem = new Map<string, string>();
const assetIdByFolderStem = new Map<string, string>();
for (const [folder, assetIds] of Object.entries(MODEL_ASSETS_BY_FOLDER) as [
  ModelAssetFolder,
  readonly string[],
][]) {
  for (const assetId of assetIds) {
    const stem = modelAssetFileStem(assetId);
    assetIdByFolderStem.set(folder + "/" + stem, assetId);
    const previous = assetIdByStem.get(stem);
    // 中文名全库唯一（`check:model-names` 会卡住重名）；真出现歧义就留空，让反查失败而不是猜错。
    if (previous === undefined) assetIdByStem.set(stem, assetId);
    else if (previous !== assetId) assetIdByStem.set(stem, "");
  }
}

/**
 * GLB 文件名主干 → 模型 id。
 *
 * 认中文主干，也认迁移前的英文 id。同名歧义、或者根本没登记时返回 `undefined`。
 * 有 `folder` 时优先在该分区里找，跨分区同名也不会串。
 */
export function modelAssetIdForStem(
  stem: string,
  folder?: ModelAssetFolder,
): string | undefined {
  if (folder) {
    const scoped = assetIdByFolderStem.get(folder + "/" + stem);
    if (scoped) return scoped;
  }
  if (folderByAssetId.has(stem)) return stem;
  return assetIdByStem.get(stem) || undefined;
}

/**
 * 拼出模型 GLB 的 URL。
 *
 * 未登记的 id 退化成根路径 —— 与迁移前的扁平目录一致，页面不会因为漏登记而白屏，
 * 但门禁会把这条当成错误。`-lite` 后缀与完整件的命名规则保持不变。
 */
export function modelAssetUrl(assetId: string, variant: ModelAssetVariant): string {
  const folder = folderByAssetId.get(assetId);
  const fileName = "/" + modelAssetFileStem(assetId) + (variant === "lite" ? "-lite.glb" : ".glb");
  return folder
    ? `${MODELS_ROOT}/${modelAssetFolderPath(folder)}${fileName}`
    : MODELS_ROOT + fileName;
}
