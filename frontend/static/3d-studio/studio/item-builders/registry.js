/*
 * 物件模型构建分派表。
 *
 * 拆之前：studio-app.js 的 buildItemModel 里一条 5700 行的 if/else 链，65 个分支挨在一起，
 * 改一个物件要横穿几千行，谁先谁后只能靠读。拆之后：这里只剩「谓词 + 构建器」一行一条，
 * 顺序仍是优先级（第一条命中即胜出），构建体各自在 item-builders/*.js 里。
 *
 * 谓词改动必须和原链同序：几个排除性条件（外部模型兜底要求「不是 smallcar / 不是 sofa」）
 * 依赖前面的专有分支先命中，顺序一动就换分支。
 */
import { ALL_ITEM_MODELS } from "../../loaders/studio-external-models.js?v=2609251801";
import {
  APPLIANCE_MODEL_ITEM_TYPES,
  EXTERNAL_MODEL_ITEM_TYPES,
  LIGHT_ITEM_TYPES,
  ROUND_TABLE_TURNTABLE_ITEM_TYPES,
  STAIR_ITEM_TYPES
} from "../studio-item-types.js?v=2609251801";
import {
  buildCurtainItem,
  buildFloorlampItem,
  buildLightItem,
  buildTrackCurtainItem,
  buildWalllampItem
} from "./curtain-lighting.js?v=2609251801";
import {
  buildCabinetItem,
  buildFeaturewallItem,
  buildMuralItem,
  buildPillarItem,
  buildPlanlabelItem,
  buildShelfItem,
  buildShoecabinetItem,
  buildSideboardItem,
  buildWallcabinetItem
} from "./storage-cabinets.js?v=2609251801";
import {
  buildExternalModelFallbackItem
} from "./external-fallback.js?v=2609251801";
import {
  buildGlasspartitionItem,
  buildPlantItem,
  buildSmallcarItem,
  buildStairItem,
  buildTvItem
} from "./media-structure.js?v=2609251801";
import {
  buildBarItem,
  buildBedItem,
  buildChairItem,
  buildNightstandItem,
  buildRoundTableTurntableItem,
  buildSofaItem,
  buildTableItem
} from "./seating.js?v=2609251801";
import {
  buildAquariumItem,
  buildGaswaterheaterItem,
  buildPipelinewaterpurifierItem,
  buildStoragewaterheaterItem,
  buildTeaBarMachineItem,
  buildWasherDryerItem
} from "./water-appliances.js?v=2609251801";
import {
  buildCoffeetableItem,
  buildDeskItem,
  buildDesktopItem,
  buildLaptopItem,
  buildRugItem,
  buildSquarecoffeetableItem,
  buildTvstandItem
} from "./tables-desks.js?v=2609251801";
import {
  buildBookcaseItem,
  buildGlasscabinetItem
} from "./tall-cabinets.js?v=2609251801";
import {
  buildDishwasherItem,
  buildFridgeItem,
  buildKitchenBaseItem,
  buildMicrowaveItem,
  buildRangehoodItem,
  buildRicecookerItem,
  buildSteamovenItem
} from "./kitchen.js?v=2609251801";
import {
  buildAirpurifierItem,
  buildCameraPresenceItem,
  buildFlooracItem,
  buildNasItem,
  buildRobotvacuumItem,
  buildWallacItem
} from "./climate-devices.js?v=2609251801";
import {
  buildBasinItem,
  buildBathtubItem,
  buildShowerItem,
  buildSquattoiletItem,
  buildToiletItem,
  buildUrinalItem,
  buildVanityItem
} from "./bathroom.js?v=2609251801";

/**
 * 分派表：每条 { match, build, terminal }，顺序即优先级。
 * terminal 为真表示该类型自带收尾（轨道帘构建完直接返回模型组），调用方跳过 finishItemModel。
 */
export const ITEM_MODEL_BUILDERS = [
  {
    // itemSpec.type === "curtain" && itemSpec.offlineModelExport !== true
    match: ({ itemSpec }) => itemSpec.type === "curtain" && itemSpec.offlineModelExport !== true,
    build: buildTrackCurtainItem,
    terminal: true
  },
  {
    // LIGHT_ITEM_TYPES.has(itemSpec.type)
    match: ({ itemSpec }) => LIGHT_ITEM_TYPES.has(itemSpec.type),
    build: buildLightItem
  },
  {
    // itemSpec.type === "planlabel"
    match: ({ itemSpec }) => itemSpec.type === "planlabel",
    build: buildPlanlabelItem
  },
  {
    // itemSpec.offlineModelExport !== true && ALL_ITEM_MODELS[itemSpec.type] && itemSpec.type !== "smallcar" && itemSpec.type !== "sofa"
    match: ({ itemSpec }) => itemSpec.offlineModelExport !== true &&
    ALL_ITEM_MODELS[itemSpec.type] &&
    itemSpec.type !== "smallcar" &&
    itemSpec.type !== "sofa",
    build: buildExternalModelFallbackItem
  },
  {
    // itemSpec.type === "smallcar"
    match: ({ itemSpec }) => itemSpec.type === "smallcar",
    build: buildSmallcarItem
  },
  {
    // itemSpec.type === "curtain"
    match: ({ itemSpec }) => itemSpec.type === "curtain",
    build: buildCurtainItem
  },
  {
    // STAIR_ITEM_TYPES.has(itemSpec.type)
    match: ({ itemSpec }) => STAIR_ITEM_TYPES.has(itemSpec.type),
    build: buildStairItem
  },
  {
    // itemSpec.type === "sofa"
    match: ({ itemSpec }) => itemSpec.type === "sofa",
    build: buildSofaItem
  },
  {
    // itemSpec.type === "bed"
    match: ({ itemSpec }) => itemSpec.type === "bed",
    build: buildBedItem
  },
  {
    // itemSpec.type === "nightstand"
    match: ({ itemSpec }) => itemSpec.type === "nightstand",
    build: buildNightstandItem
  },
  {
    // itemSpec.type === "table"
    match: ({ itemSpec }) => itemSpec.type === "table",
    build: buildTableItem
  },
  {
    // ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(itemSpec.type)
    match: ({ itemSpec }) => ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(itemSpec.type),
    build: buildRoundTableTurntableItem
  },
  {
    // itemSpec.type === "bar"
    match: ({ itemSpec }) => itemSpec.type === "bar",
    build: buildBarItem
  },
  {
    // itemSpec.type === "aquarium"
    match: ({ itemSpec }) => itemSpec.type === "aquarium",
    build: buildAquariumItem
  },
  {
    // itemSpec.type === "mural"
    match: ({ itemSpec }) => itemSpec.type === "mural",
    build: buildMuralItem
  },
  {
    // itemSpec.type === "featurewall"
    match: ({ itemSpec }) => itemSpec.type === "featurewall",
    build: buildFeaturewallItem
  },
  {
    // itemSpec.type === "coffeetable"
    match: ({ itemSpec }) => itemSpec.type === "coffeetable",
    build: buildCoffeetableItem
  },
  {
    // itemSpec.type === "squarecoffeetable"
    match: ({ itemSpec }) => itemSpec.type === "squarecoffeetable",
    build: buildSquarecoffeetableItem
  },
  {
    // itemSpec.type === "chair"
    match: ({ itemSpec }) => itemSpec.type === "chair",
    build: buildChairItem
  },
  {
    // itemSpec.type === "sideboard"
    match: ({ itemSpec }) => itemSpec.type === "sideboard",
    build: buildSideboardItem
  },
  {
    // itemSpec.type === "shoecabinet"
    match: ({ itemSpec }) => itemSpec.type === "shoecabinet",
    build: buildShoecabinetItem
  },
  {
    // itemSpec.type === "cabinet"
    match: ({ itemSpec }) => itemSpec.type === "cabinet",
    build: buildCabinetItem
  },
  {
    // itemSpec.type === "glasscabinet"
    match: ({ itemSpec }) => itemSpec.type === "glasscabinet",
    build: buildGlasscabinetItem
  },
  {
    // itemSpec.type === "bookcase"
    match: ({ itemSpec }) => itemSpec.type === "bookcase",
    build: buildBookcaseItem
  },
  {
    // itemSpec.type === "shelf"
    match: ({ itemSpec }) => itemSpec.type === "shelf",
    build: buildShelfItem
  },
  {
    // itemSpec.type === "pillar"
    match: ({ itemSpec }) => itemSpec.type === "pillar",
    build: buildPillarItem
  },
  {
    // itemSpec.type === "wallcabinet"
    match: ({ itemSpec }) => itemSpec.type === "wallcabinet",
    build: buildWallcabinetItem
  },
  {
    // ["kitchenbase", "kitchensink", "kitchencooktop"].includes(itemSpec.type)
    match: ({ itemSpec }) => ["kitchenbase", "kitchensink", "kitchencooktop"].includes(itemSpec.type),
    build: buildKitchenBaseItem
  },
  {
    // itemSpec.type === "fridge"
    match: ({ itemSpec }) => itemSpec.type === "fridge",
    build: buildFridgeItem
  },
  {
    // itemSpec.type === "storagewaterheater"
    match: ({ itemSpec }) => itemSpec.type === "storagewaterheater",
    build: buildStoragewaterheaterItem
  },
  {
    // itemSpec.type === "gaswaterheater"
    match: ({ itemSpec }) => itemSpec.type === "gaswaterheater",
    build: buildGaswaterheaterItem
  },
  {
    // itemSpec.type === "pipelinewaterpurifier"
    match: ({ itemSpec }) => itemSpec.type === "pipelinewaterpurifier",
    build: buildPipelinewaterpurifierItem
  },
  {
    // itemSpec.type === "tea_bar_machine"
    match: ({ itemSpec }) => itemSpec.type === "tea_bar_machine",
    build: buildTeaBarMachineItem
  },
  {
    // itemSpec.type === "washer" || itemSpec.type === "dryer"
    match: ({ itemSpec }) => itemSpec.type === "washer" || itemSpec.type === "dryer",
    build: buildWasherDryerItem
  },
  {
    // itemSpec.type === "dishwasher"
    match: ({ itemSpec }) => itemSpec.type === "dishwasher",
    build: buildDishwasherItem
  },
  {
    // itemSpec.type === "steamoven"
    match: ({ itemSpec }) => itemSpec.type === "steamoven",
    build: buildSteamovenItem
  },
  {
    // itemSpec.type === "microwave"
    match: ({ itemSpec }) => itemSpec.type === "microwave",
    build: buildMicrowaveItem
  },
  {
    // itemSpec.type === "ricecooker"
    match: ({ itemSpec }) => itemSpec.type === "ricecooker",
    build: buildRicecookerItem
  },
  {
    // itemSpec.type === "rangehood"
    match: ({ itemSpec }) => itemSpec.type === "rangehood",
    build: buildRangehoodItem
  },
  {
    // itemSpec.type === "wallac"
    match: ({ itemSpec }) => itemSpec.type === "wallac",
    build: buildWallacItem
  },
  {
    // itemSpec.type === "floorac"
    match: ({ itemSpec }) => itemSpec.type === "floorac",
    build: buildFlooracItem
  },
  {
    // itemSpec.type === "robotvacuum"
    match: ({ itemSpec }) => itemSpec.type === "robotvacuum",
    build: buildRobotvacuumItem
  },
  {
    // itemSpec.type === "camera" || itemSpec.type === "presence"
    match: ({ itemSpec }) => itemSpec.type === "camera" || itemSpec.type === "presence",
    build: buildCameraPresenceItem
  },
  {
    // itemSpec.type === "nas"
    match: ({ itemSpec }) => itemSpec.type === "nas",
    build: buildNasItem
  },
  {
    // itemSpec.type === "airpurifier"
    match: ({ itemSpec }) => itemSpec.type === "airpurifier",
    build: buildAirpurifierItem
  },
  {
    // itemSpec.type === "tv"
    match: ({ itemSpec }) => itemSpec.type === "tv",
    build: buildTvItem
  },
  {
    // itemSpec.type === "vanity"
    match: ({ itemSpec }) => itemSpec.type === "vanity",
    build: buildVanityItem
  },
  {
    // itemSpec.type === "desk"
    match: ({ itemSpec }) => itemSpec.type === "desk",
    build: buildDeskItem
  },
  {
    // itemSpec.type === "desktop"
    match: ({ itemSpec }) => itemSpec.type === "desktop",
    build: buildDesktopItem
  },
  {
    // itemSpec.type === "laptop"
    match: ({ itemSpec }) => itemSpec.type === "laptop",
    build: buildLaptopItem
  },
  {
    // itemSpec.type === "toilet"
    match: ({ itemSpec }) => itemSpec.type === "toilet",
    build: buildToiletItem
  },
  {
    // itemSpec.type === "squattoilet"
    match: ({ itemSpec }) => itemSpec.type === "squattoilet",
    build: buildSquattoiletItem
  },
  {
    // itemSpec.type === "urinal"
    match: ({ itemSpec }) => itemSpec.type === "urinal",
    build: buildUrinalItem
  },
  {
    // itemSpec.type === "bathtub"
    match: ({ itemSpec }) => itemSpec.type === "bathtub",
    build: buildBathtubItem
  },
  {
    // itemSpec.type === "walllamp"
    match: ({ itemSpec }) => itemSpec.type === "walllamp",
    build: buildWalllampItem
  },
  {
    // itemSpec.type === "glasspartition"
    match: ({ itemSpec }) => itemSpec.type === "glasspartition",
    build: buildGlasspartitionItem
  },
  {
    // itemSpec.type === "shower"
    match: ({ itemSpec }) => itemSpec.type === "shower",
    build: buildShowerItem
  },
  {
    // itemSpec.type === "basin"
    match: ({ itemSpec }) => itemSpec.type === "basin",
    build: buildBasinItem
  },
  {
    // itemSpec.type === "rug"
    match: ({ itemSpec }) => itemSpec.type === "rug",
    build: buildRugItem
  },
  {
    // itemSpec.type === "tvstand"
    match: ({ itemSpec }) => itemSpec.type === "tvstand",
    build: buildTvstandItem
  },
  {
    // itemSpec.type === "floorlamp"
    match: ({ itemSpec }) => itemSpec.type === "floorlamp",
    build: buildFloorlampItem
  },
  {
    // itemSpec.type === "plant"
    match: ({ itemSpec }) => itemSpec.type === "plant",
    build: buildPlantItem
  }
];

/**
 * 按分派表构建物件本体。返回 true 表示这条支路已自带收尾（调用方应直接返回模型组）。
 */
export function buildItemBody(context) {
  for (const builder of ITEM_MODEL_BUILDERS) {
    if (!builder.match(context)) continue;
    builder.build(context);
    return builder.terminal === true;
  }
  return false;
}

/**
 * 收尾：外部模型整棵替换、电视屏幕、合批与材质共享、选中高亮、姿态。
 * 放在最后是因为外部模型替换可能换掉整棵子树，姿态要作用在替换后幸存的节点上。
 */
export function finishItemModel(context) {
  const {
    addExternalItemModel,
    addTelevisionScreenMeshes,
    applyItemPosture,
    bakeMergedItemMeshes,
    disposeSceneSubtree,
    highlightSelectedModel,
    isSelected,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
    shareGeometryAndMaterials
  } = context;
  if (
    (EXTERNAL_MODEL_ITEM_TYPES.has(itemSpec.type) ||
      APPLIANCE_MODEL_ITEM_TYPES.has(itemSpec.type)) &&
    itemSpec.offlineModelExport !== true
  ) {
    // 占位件 = 此刻挂在模型组上的**几何**。例外是「不是占位件、而是独立叠层」的那几块
    // （小车的充电光晕与闪电）：它们是特效，不是「模型到位前的代餐」，一起清掉会让
    // 车模加载完成的一瞬间充电特效凭空消失。
    const externalModelChildren = [...itemGroup.children].filter(
      placeholderChild => placeholderChild.userData?.homeosModelOverlay !== true
    );
    if (addExternalItemModel(itemGroup, itemSpec)) {
      externalModelChildren.forEach(removedChildObject => {
        itemGroup.remove(removedChildObject);
        disposeSceneSubtree(removedChildObject);
      });
    }
  }
  if (itemSpec.type === "tv" && itemSpec.offlineModelExport !== true) {
    addTelevisionScreenMeshes(itemGroup, itemSpec, itemWidth, itemDepth, itemHeight);
  }
  shareGeometryAndMaterials(itemGroup, itemSpec.type);
  bakeMergedItemMeshes(itemGroup, itemSpec.type);
  highlightSelectedModel(itemGroup, isSelected("item", itemSpec.id));
  applyItemPosture(itemGroup, itemSpec);
  return itemGroup;
}
