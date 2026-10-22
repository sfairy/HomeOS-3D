/**
 * 模型 GLB 的**磁盘分区**：模型库类目 → `public/static/3d-studio/models/` 下的子目录。
 *
 * 目录层级与模型库界面一致：`<大类>/<分区>/`，大类和 `data-library-category`
 * （home / appliance / courtyard）同名；分区名取界面分区 id（`living`、`kitchen-devices`…），
 * 庭院的 `courtyard-0..5` 换成按内容命名的语义名（plants / planters / furniture /
 * structures / water / facilities）——界面里 `courtyard-1` 的标题是「庭院家具」，
 * 内容却是花箱与花坛，照编号命名只会把错位固化到磁盘上。
 *
 * 这张表是**唯一真值**：运行时 URL 由 `modelAssetUrl()` 拼出来，不再散落硬编码路径；
 * `scripts/models/organize-models.mjs` 用同一张表校验/迁移文件。新增模型先登记在这里，
 * 否则 `bun run check:models-layout` 会失败。
 */

/** 模型静态资源根路径（后端 `StaticFiles` 挂在 `/static`）。 */
export const MODELS_ROOT = "/static/3d-studio/models";

/**
 * 分区目录 → 该目录下的模型 id 列表。
 *
 * id 是 GLB 文件名去掉 `.glb`（以及可选的 `-lite`）后的主干，与注册表的 key 不必相同：
 * `smallcar` 用 `car.glb`、`airoutlet` 用 `air-outlet.glb` 这类历史错位继续保留，
 * 目录归属按**文件**算，不按注册表 key 猜。
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
    "drawer-chest",
    "glasscabinet",
    "shelf",
    "sideboard",
    "single-glass-cabinet",
    "storage-box",
    "storage-cart",
    "wallcabinet",
    "wardrobe",
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
export type ModelAssetFolder = keyof typeof MODEL_ASSETS_BY_FOLDER;

/** GLB 变体：`lite` 是降面版（首选），`full` 是完整件（兜底）。 */
export type ModelAssetVariant = "lite" | "full";

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

/**
 * 拼出模型 GLB 的 URL。
 *
 * 未登记的 id 退化成根路径 —— 与迁移前的扁平目录一致，页面不会因为漏登记而白屏，
 * 但门禁会把这条当成错误。`-lite` 后缀与完整件的命名规则保持不变。
 */
export function modelAssetUrl(assetId: string, variant: ModelAssetVariant): string {
  const folder = folderByAssetId.get(assetId);
  const fileName = "/" + assetId + (variant === "lite" ? "-lite.glb" : ".glb");
  return folder ? `${MODELS_ROOT}/${folder}${fileName}` : MODELS_ROOT + fileName;
}
