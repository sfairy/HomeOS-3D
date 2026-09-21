/*
 * 物件的「类型词表」：哪些 type 属于灯光 / 楼梯 / 需要外部模型 / 按方边渲染……
 *
 * 这些集合原先散在 studio-app.js 里（1144–1671 行之间八处），既被 3 万行的编排层各处引用，
 * 又是 item-builders 分派谓词的依据。独立成文件后：新增一个物件类型只需要改一处，
 * 而分派表（item-builders/registry.js）与编排层引用的是同一份定义，不会各抄一套。
 *
 * 只放纯数据与纯判定，不引入 THREE、不碰 DOM —— 两个方向都可安全 import。
 */

/** 方边（直角）渲染的物件：圆角在这些造型上反而不像。 */
export const SQUARE_EDGE_ITEM_TYPES = new Set([
  "nightstand",
  "bar",
  "aquarium",
  "sideboard",
  "shoecabinet",
  "stairs",
  "steelstairs",
  "glassstairs",
  "smallcar",
  "cabinet",
  "glasscabinet",
  "bookcase",
  "shelf",
  "pillar",
  "wallcabinet",
  "kitchenbase",
  "kitchensink",
  "kitchencooktop",
  "vanity",
  "basin",
  "bathtub",
  "tvstand",
  "squarecoffeetable",
  "glasspartition",
  "washer",
  "airoutlet",
  "dryer",
  "dishwasher",
  "steamoven",
  "microwave",
  "rangehood",
  "nas",
  "pipelinewaterpurifier",
  "tea_bar_machine"
]);

/** 家电配色（与家具色区分）的类型。 */
export const APPLIANCE_ITEM_TYPES = new Set([
  "fridge",
  "storagewaterheater",
  "gaswaterheater",
  "pipelinewaterpurifier",
  "tea_bar_machine",
  "washer",
  "airoutlet",
  "dryer",
  "dishwasher",
  "steamoven",
  "microwave",
  "ricecooker",
  "rangehood",
  "wallac",
  "floorac",
  "robotvacuum",
  "nas",
  "camera",
  "presence",
  "airpurifier",
  "tv",
  "desktop",
  "laptop",
  "floorlamp",
  "walllamp"
]);

/** 灯具类型：走灯光支路（可调光/调色温），不是普通网格。 */
export const LIGHT_ITEM_TYPES = new Set(["downlight", "ceilinglight", "striplight"]);

export const STAIR_ITEM_TYPES = new Set(["stairs", "steelstairs", "glassstairs"]);
export const STAIR_DIRECTION_ITEM_TYPES = new Set(["steelstairs", "glassstairs"]);
export const ROUND_TABLE_TURNTABLE_ITEM_TYPES = new Set([
  "rounddiningtable",
  "rounddiningtableturntable"
]);

/** 既有外部模型可以加载的类型：加载成功后叠加外观，加载不到再走程序化兜底。 */
export const EXTERNAL_MODEL_ITEM_TYPES = new Set([
  "coffeetable",
  "squarecoffeetable",
  "tvstand",
  "rug",
  "plant",
  "bed",
  "nightstand",
  "vanity",
  "desk",
  "bookcase",
  "aquarium",
  "curtain",
  "table",
  "rounddiningtable",
  "rounddiningtableturntable",
  "chair",
  "bar",
  "sideboard",
  "shoecabinet",
  "cabinet",
  "glasscabinet",
  "shelf",
  "wallcabinet",
  "kitchenbase",
  "kitchensink",
  "kitchencooktop",
  "basin",
  "toilet",
  "squattoilet",
  "urinal",
  "shower",
  "bathtub",
  "glasspartition",
  "stairs",
  "pillar"
]);

/** 走新版合批构建路径的类型（构建时打 optimizationBatch 标记，便于统计）。 */
export const BATCH_OPTIMIZED_ITEM_TYPES = new Set([
  "aquarium",
  "bed",
  "nightstand",
  "curtain",
  "vanity",
  "desk",
  "bookcase",
  "piano",
  "table",
  "rounddiningtable"
]);

/**
 * 属于家电的外部模型类型。与 EXTERNAL_MODEL_ITEM_TYPES 合起来才是「全部可被外部模型
 * 替换掉程序化网格」的物件：两者在构建收尾时同一条判据里被一起判断。
 */
export const APPLIANCE_MODEL_ITEM_TYPES = new Set([
  "tv",
  "wallac",
  "floorac",
  "airpurifier",
  "robotvacuum",
  "floorlamp",
  "walllamp",
  "fridge",
  "rangehood",
  "dishwasher",
  "steamoven",
  "microwave",
  "ricecooker",
  "washer",
  "dryer",
  "storagewaterheater",
  "gaswaterheater",
  "desktop",
  "laptop",
  "nas"
]);

/**
 * 判断某个物件是否按「圆桌带转盘」处理：物件类型本身是转盘款，或用户在属性面板里
 * 把普通圆桌勾成了带转盘。
 */
export function isRoundTableTurntableItem(item) {
  return item?.type === "rounddiningtableturntable" || item?.roundTableTurntable === true;
}
