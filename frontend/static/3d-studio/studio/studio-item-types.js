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
  "tea_bar_machine",
  "chestdrawer",
  "entrycabinet",
  "displaycabinet",
  "console",
  "sidetable",
  "bench",
  "soundbar",
  "dehumidifier",
  "freshair",
  "thermostat",
  "smartpanel",
  "smartlock",
  "doorbell",
  "gateway",
  "locker",
  "laundrycabinet",
  "balconycabinet",
  "winecabinet",
  "kitchenisland",
  "pantry",
  "computertable",
  "filecabinet",
  "booktower",
  "nestingtable",
  "screenspan",
  "cot",
  "gameconsole",
  "avreceiver",
  "screenpanel",
  "heater",
  "ceilingac",
  "dryingrack",
  "garmentcare",
  "integratedstove",
  "sterilizer",
  "oven",
  "waterpurifier",
  "trashbin",
  "router",
  "printer"
]);

/** 家电配色（与家具色区分）的类型。 */
export const APPLIANCE_ITEM_TYPES = new Set([
  // 客厅与环境：影音 + 环境设备（含清洁机器与装饰灯具）
  "tv",
  "camera",
  "presence",
  "soundbar",
  "speaker",
  "projector",
  "screenpanel",
  "gameconsole",
  "avreceiver",
  "wallac",
  "floorac",
  "ceilingac",
  "ceilingfan",
  "airpurifier",
  "airoutlet",
  "robotvacuum",
  "vacuumcleaner",
  "floorwasher",
  "fan",
  "humidifier",
  "dehumidifier",
  "freshair",
  "heater",
  "floorlamp",
  "walllamp",
  // 厨房电器
  "fridge",
  "rangehood",
  "dishwasher",
  "steamoven",
  "microwave",
  "integratedstove",
  "oven",
  "sterilizer",
  "ricecooker",
  "coffeemaker",
  "kettle",
  "airfryer",
  "blender",
  // 洗护
  "washer",
  "dryer",
  "garmentcare",
  "airer",
  "dryingrack",
  // 热水与饮水
  "storagewaterheater",
  "gaswaterheater",
  "pipelinewaterpurifier",
  "tea_bar_machine",
  "waterpurifier",
  // 办公与设备
  "desktop",
  "laptop",
  "nas",
  "router",
  "printer",
  // 智能家居
  "thermostat",
  "smartpanel",
  "smartlock",
  "doorbell",
  "gateway",
  "smartspeaker",
  "trashbin"
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
  "armchair",
  "loungechair",
  "ottoman",
  "bench",
  "barstool",
  "sidetable",
  "console",
  "chestdrawer",
  "entrycabinet",
  "displaycabinet",
  "bunkbed",
  "kidsbed",
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
  "soundbar",
  "speaker",
  "projector",
  "fan",
  "humidifier",
  "dehumidifier",
  "freshair",
  "thermostat",
  "smartpanel",
  "smartlock",
  "doorbell",
  "gateway",
  // 洁具
  "basin",
  "toilet",
  "squattoilet",
  "urinal",
  "shower",
  "bathtub",
  "glasspartition",
  "chaise",
  "nestingtable",
  "roundcoffeetable",
  "screenspan",
  "coatrail",
  "stool",
  "locker",
  "laundrycabinet",
  "balconycabinet",
  "winecabinet",
  "kitchenisland",
  "pantry",
  "daybed",
  "cot",
  "computertable",
  "officestool",
  "filecabinet",
  "booktower",
  "gameconsole",
  "avreceiver",
  "screenpanel",
  "smartspeaker",
  "router",
  "printer",
  "ceilingfan",
  "heater",
  "ceilingac",
  "vacuumcleaner",
  "floorwasher",
  "dryingrack",
  "garmentcare",
  "airer",
  "integratedstove",
  "sterilizer",
  "oven",
  "coffeemaker",
  "kettle",
  "airfryer",
  "blender",
  "waterpurifier",
  "trashbin"
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
  "vanity",
  "chestdrawer",
  "entrycabinet",
  "displaycabinet",
  "locker",
  "laundrycabinet",
  "balconycabinet",
  "winecabinet",
  "kitchenisland",
  "pantry",
  "filecabinet",
  "booktower"
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

/**
 * 俯视占地是**圆**的物件：平面图符号照它画圆，而不是兜底的圆角矩形。
 *
 * 判据不是照外观估的，而是实测流水线 GLB 的俯视轮廓（`node tools/audit_plan_symbols.mjs`）：
 * **格数比 ≈ π/4（0.785）** 且**各向半径等长（径向变异系数 < 0.06）**。
 * 两条一起看才准 —— 单看格数比会把「中间挖空」的方框误判成圆。
 *
 * 由 `check_invariants.mjs` 的「圆形占地的物件没有按圆画」一条兜底：实测是圆却不在名单里、
 * 或名单里有但实测不是圆，都会当场报错。**图纸上要看起来对，就必须两边一起改** ——
 * 这份名单管的是「画不画圆」，`studio-app.js` 里的分支管「圆里那点细节」。
 */
export const ROUND_FOOTPRINT_ITEM_TYPES = new Set([
  "fan", // 落地扇：圆底座 + 圆网罩，俯视只有圆
  "floorac", // 立式空调：圆筒机身
  "humidifier", // 立式加湿器：圆桶
  "airpurifier", // 空气净化器：圆筒
  "trashbin", // 圆桶垃圾桶
  "kettle", // 电热水壶：圆壶身
  "stool", // 圆凳
  "barstool", // 圆面吧凳
  "roundcoffeetable", // 圆茶几（旧符号是方角矩形，与「圆」这个类型名都不符）
  "coatrail" // 落地衣帽架：圆底盘
]);

/** 既有外部模型可以加载的类型：加载成功后叠加外观，加载不到再走程序化兜底。 */
export const EXTERNAL_MODEL_ITEM_TYPES = new Set([
  // 沙发在这里是必须的：EXTERNAL_ITEM_MODELS 里一直登记着 sofa 的 GLB，但这份名单漏了它，
  // 于是 registry.js 那条判据（EXTERNAL_MODEL_ITEM_TYPES ∪ APPLIANCE_MODEL_ITEM_TYPES）
  // 从不命中，资源静默变成死文件、画面上一直是 seating.js 那版程序化方块。
  // 「注册表 ↔ 目录」的那条护栏查不出这种「注册了但没人会加载」，所以只能靠人记住：
  // **往 EXTERNAL_ITEM_MODELS 加一条，就必须同时把类型加进这份名单。**
  "sofa",
  "coffeetable",
  "squarecoffeetable",
  "tvstand",
  // 钢琴：2026-09 按流水线规格重建（旧的那件是第三方素材，注册了却从没被加载过），
  // 重建后与其它物件一样走外部模型，于是这里也必须补上 —— 否则它照旧只剩兜底那个方块。
  "piano",
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
  "armchair",
  "loungechair",
  "ottoman",
  "bench",
  "barstool",
  "sidetable",
  "console",
  "chestdrawer",
  "entrycabinet",
  "displaycabinet",
  "bunkbed",
  "kidsbed",
  "stairs",
  "pillar",
  "chaise",
  "nestingtable",
  "roundcoffeetable",
  "screenspan",
  "coatrail",
  "stool",
  "locker",
  "laundrycabinet",
  "balconycabinet",
  "winecabinet",
  "kitchenisland",
  "pantry",
  "daybed",
  "cot",
  "computertable",
  "officestool",
  "filecabinet",
  "booktower",
  // 建筑本体与车辆里的四件（2026-09 迁进流水线后补上）。它们**不在 HOME_ITEM_TYPES 里**
  // （建筑本体不进暖阳家居配色，见那份名单的注释），但「不参与家居配色」与「不加载模型」是两件事：
  // 早先这四件被顺带着漏掉了，注册条目与 GLB 一起空转（画面上一直是程序化兜底几何）。
  // 柱族与直行楼梯当初没漏（stairs / pillar 就在本名单上），漏的是：
  //   - steelstairs / glassstairs：兜底构建体先试外部模型，取不到才画过程几何；
  //   - elevator：没有专用构建体，直接落进外部模型兜底；
  //   - smallcar：有专用构建体（含充电特效），它自己会先试外部模型。
  "steelstairs",
  "glassstairs",
  "elevator",
  "smallcar"
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
  "nas",
  "soundbar",
  "speaker",
  "projector",
  "fan",
  "humidifier",
  "dehumidifier",
  "freshair",
  "thermostat",
  "smartpanel",
  "smartlock",
  "doorbell",
  "gateway",
  "gameconsole",
  "avreceiver",
  "screenpanel",
  "smartspeaker",
  "router",
  "printer",
  "ceilingfan",
  "heater",
  "ceilingac",
  "vacuumcleaner",
  "floorwasher",
  "dryingrack",
  "garmentcare",
  "airer",
  "integratedstove",
  "sterilizer",
  "oven",
  "coffeemaker",
  "kettle",
  "airfryer",
  "blender",
  "waterpurifier",
  "trashbin",
  // 以下三件 2026-09 已按流水线规格重建（新 GLB 带 scaleBasis 与角色槽位），原先挂在
  // KNOWN_UNREACHABLE_MODEL_TYPES 上的「注册了却永不加载」债务随之收清。
  "airoutlet",
  "pipelinewaterpurifier",
  "tea_bar_machine"
]);

/**
 * 判断某个物件是否按「圆桌带转盘」处理：物件类型本身是转盘款，或用户在属性面板里
 * 把普通圆桌勾成了带转盘。
 */
export function isRoundTableTurntableItem(item) {
  return item?.type === "rounddiningtableturntable" || item?.roundTableTurntable === true;
}
