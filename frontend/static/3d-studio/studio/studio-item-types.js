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

/**
 * 「家居」类型：家具、软装、家电、洁具。这几类在「默认风格」下也采用暖阳原木的家居配色
 * （见 studio-app.js 的 paletteForItemType() → homePalette()），而场景与建筑本体不变。
 *
 * 排除两类：
 *   - 建筑本体与墙面造型 —— stairs / steelstairs / glassstairs / pillar / smallcar / elevator /
 *     flooropening / planlabel / featurewall。它们的颜色表达的是房子本身（楼梯、柱、门洞、洞口、
 *     平面图符号、造型墙），暖化会违反「其它保持现状」。
 *   - LIGHT_ITEM_TYPES —— 它们走灯光支路，根本不经过网格材质换色。
 *
 * 取舍存疑的一处：壁画（mural）按「软装」收录，造型墙（featurewall）按「建筑」排除。
 */
export const HOME_ITEM_TYPES = new Set([
  // 家具
  "sofa",
  "coffeetable",
  "squarecoffeetable",
  "tvstand",
  "bed",
  "nightstand",
  "table",
  "rounddiningtable",
  "rounddiningtableturntable",
  "desk",
  "chair",
  "bar",
  "sideboard",
  "shoecabinet",
  "cabinet",
  "glasscabinet",
  "bookcase",
  "shelf",
  "wallcabinet",
  "kitchenbase",
  "kitchensink",
  "kitchencooktop",
  "vanity",
  "piano",
  "aquarium",
  // 软装
  "curtain",
  "rug",
  "plant",
  "mural",
  "floorlamp",
  "walllamp",
  // 家电
  "fridge",
  "washer",
  "dryer",
  "dishwasher",
  "steamoven",
  "microwave",
  "ricecooker",
  "rangehood",
  "storagewaterheater",
  "gaswaterheater",
  "pipelinewaterpurifier",
  "tea_bar_machine",
  "airoutlet",
  "airpurifier",
  "robotvacuum",
  "wallac",
  "floorac",
  "tv",
  "desktop",
  "laptop",
  "nas",
  "camera",
  "presence",
  // 洁具
  "basin",
  "toilet",
  "squattoilet",
  "urinal",
  "shower",
  "bathtub",
  "glasspartition"
]);

/**
 * 柜类：柜体是一整个箱体木作，配色上与「家具三档灰」分开单算。
 *
 * 这份名单决定三件事，所以只能有一份：
 *   - 外部模型的柜体色（studio-external-models.js 的 isWarmJoinery 与台面 / 回边槽位）；
 *   - 程序化兜底几何的取色（studio-app.js 的 paletteForItemType，见 applyItemFinish）；
 *   - 「柜门刷白」的作用范围 —— 名单里并不是每一件都有独立门板几何：衣柜（cabinet）与
 *     床头柜 / 电视柜 / 梳妆台的抽屉面跟柜体共用一块材质，走正面着色器；真正能只换门板的
 *     那几种列在 studio-external-models.js 的门板槽位表里。
 * 一旦各写一份，模型加载中的占位几何与模型到位后的成品就会是两个颜色。
 *
 * 取舍：梳妆台（vanity）按「带抽屉的柜体」收录；桌子（desk）与吧台（bar）排除 ——
 * 它们是带腿的台面，柜体色套上去不成立。灶台 / 水槽（kitchencooktop / kitchensink）
 * 收录，但它们的台面与灶面另有专用色板，见各自的槽位表。
 */
export const JOINERY_ITEM_TYPES = new Set([
  "cabinet",
  "wallcabinet",
  "shoecabinet",
  "sideboard",
  "bookcase",
  "shelf",
  "nightstand",
  "tvstand",
  "kitchenbase",
  "kitchensink",
  "kitchencooktop",
  "glasscabinet",
  "vanity"
]);

/**
 * 不锈钢家电的「外观族」：冰箱银灰，管线机 / 热水器 / 油烟机 / 燃气灶银黑。
 *
 * 值是族名，具体颜色在 studio-scene-style.js 的 APPLIANCE_FINISH_FAMILIES 里 —— 类型词表
 * 不该知道 #454C54 这种取值，色卡也不该知道有哪些物件类型。两处合起来由 applyItemFinish 使用。
 * 不在这张表里的家电（洗碗机 / 蒸箱 / 微波炉 / 洗衣机 / 烘干机…）保持原来的暖米白。
 */
export const APPLIANCE_FINISH_BY_ITEM_TYPE = Object.freeze({
  fridge: "silver",
  pipelinewaterpurifier: "steelBlack",
  storagewaterheater: "steelBlack",
  gaswaterheater: "steelBlack",
  rangehood: "steelBlack"
});

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
