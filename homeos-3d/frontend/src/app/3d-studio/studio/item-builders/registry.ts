/*
 * 物件模型构建分派表。
 */
import { ALL_ITEM_MODELS } from "../../loaders/studio-external-models.js";
import { resolveCurtainForm } from "../../loaders/studio-curtain-track.js";
import {
  APPLIANCE_MODEL_ITEM_TYPES,
  EXTERNAL_MODEL_ITEM_TYPES,
  LIGHT_ITEM_TYPES,
  ROUND_TABLE_TURNTABLE_ITEM_TYPES,
  STAIR_ITEM_TYPES
} from "../studio-item-types.js";
import {
  buildCurtainItem,
  buildFloorlampItem,
  buildLightItem,
  buildRollerCurtainItem,
  buildTrackCurtainItem,
  buildWalllampItem
} from "./curtain-lighting.js";
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
} from "./storage-cabinets.js";
import {
  buildExternalModelFallbackItem
} from "./external-fallback.js";
import {
  buildGlasspartitionItem,
  buildPlantItem,
  buildSmallcarItem,
  buildStairItem,
  buildTvItem
} from "./media-structure.js";
import {
  buildBarItem,
  buildBedItem,
  buildChairItem,
  buildNightstandItem,
  buildRoundTableTurntableItem,
  buildSofaItem,
  buildTableItem
} from "./seating.js";
import {
  buildAquariumItem,
  buildGaswaterheaterItem,
  buildPipelinewaterpurifierItem,
  buildStoragewaterheaterItem,
  buildTeaBarMachineItem,
  buildWasherDryerItem
} from "./water-appliances.js";
import {
  buildCoffeetableItem,
  buildDeskItem,
  buildDesktopItem,
  buildLaptopItem,
  buildRugItem,
  buildSquarecoffeetableItem,
  buildTvstandItem
} from "./tables-desks.js";
import {
  buildBookcaseItem,
  buildGlasscabinetItem
} from "./tall-cabinets.js";
import {
  buildDishwasherItem,
  buildFridgeItem,
  buildKitchenBaseItem,
  buildMicrowaveItem,
  buildRangehoodItem,
  buildRicecookerItem,
  buildSteamovenItem
} from "./kitchen.js";
import {
  buildAirpurifierItem,
  buildCameraPresenceItem,
  buildFlooracItem,
  buildNasItem,
  buildRobotvacuumItem,
  buildWallacItem
} from "./climate-devices.js";
import {
  buildBasinItem,
  buildBathtubItem,
  buildShowerItem,
  buildSquattoiletItem,
  buildToiletItem,
  buildUrinalItem,
  buildVanityItem
} from "./bathroom.js";
import type { ItemBuilderContext } from "./item-builder-context.js";

/**
 * 分派表：每条 { match, build, terminal }，顺序即优先级。
 */
const ITEM_MODEL_BUILDERS = [
  {
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "curtain" &&
      itemSpec.offlineModelExport !== true &&
      resolveCurtainForm(itemSpec) === "roller",
    build: buildRollerCurtainItem,
    terminal: true
  },
  {
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "curtain" && itemSpec.offlineModelExport !== true,
    build: buildTrackCurtainItem,
    terminal: true
  },
  {
    // LIGHT_ITEM_TYPES.has(itemSpec.type)
    match: ({ itemSpec }: ItemBuilderContext) => LIGHT_ITEM_TYPES.has(itemSpec.type),
    build: buildLightItem
  },
  {
    // itemSpec.type === "planlabel"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "planlabel",
    build: buildPlanlabelItem
  },
  {
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.offlineModelExport !== true &&
    ALL_ITEM_MODELS[itemSpec.type as keyof typeof ALL_ITEM_MODELS] &&
    !(itemSpec.type === "fridge" && itemSpec.fridgeStyle === "double") &&
    itemSpec.type !== "smallcar" &&
    itemSpec.type !== "sofa",
    build: buildExternalModelFallbackItem
  },
  {
    // itemSpec.type === "smallcar"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "smallcar",
    build: buildSmallcarItem
  },
  {
    // itemSpec.type === "curtain"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "curtain",
    build: buildCurtainItem
  },
  {
    // STAIR_ITEM_TYPES.has(itemSpec.type)
    match: ({ itemSpec }: ItemBuilderContext) => STAIR_ITEM_TYPES.has(itemSpec.type),
    build: buildStairItem
  },
  {
    // itemSpec.type === "sofa"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "sofa",
    build: buildSofaItem
  },
  {
    // itemSpec.type === "bed"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "bed",
    build: buildBedItem
  },
  {
    // itemSpec.type === "nightstand"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "nightstand",
    build: buildNightstandItem
  },
  {
    // itemSpec.type === "table"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "table",
    build: buildTableItem
  },
  {
    // ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(itemSpec.type)
    match: ({ itemSpec }: ItemBuilderContext) => ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(itemSpec.type),
    build: buildRoundTableTurntableItem
  },
  {
    // itemSpec.type === "bar"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "bar",
    build: buildBarItem
  },
  {
    // itemSpec.type === "aquarium"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "aquarium",
    build: buildAquariumItem
  },
  {
    // itemSpec.type === "mural"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "mural",
    build: buildMuralItem
  },
  {
    // itemSpec.type === "featurewall"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "featurewall",
    build: buildFeaturewallItem
  },
  {
    // itemSpec.type === "coffeetable"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "coffeetable",
    build: buildCoffeetableItem
  },
  {
    // itemSpec.type === "squarecoffeetable"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "squarecoffeetable",
    build: buildSquarecoffeetableItem
  },
  {
    // itemSpec.type === "chair"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "chair",
    build: buildChairItem
  },
  {
    // itemSpec.type === "sideboard"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "sideboard",
    build: buildSideboardItem
  },
  {
    // itemSpec.type === "shoecabinet"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "shoecabinet",
    build: buildShoecabinetItem
  },
  {
    // itemSpec.type === "cabinet"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "cabinet",
    build: buildCabinetItem
  },
  {
    // itemSpec.type === "glasscabinet"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "glasscabinet",
    build: buildGlasscabinetItem
  },
  {
    // itemSpec.type === "bookcase"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "bookcase",
    build: buildBookcaseItem
  },
  {
    // itemSpec.type === "shelf"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "shelf",
    build: buildShelfItem
  },
  {
    // itemSpec.type === "pillar"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "pillar",
    build: buildPillarItem
  },
  {
    // itemSpec.type === "wallcabinet"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "wallcabinet",
    build: buildWallcabinetItem
  },
  {
    match: ({ itemSpec }: ItemBuilderContext) => ["kitchenbase", "kitchensink", "kitchencooktop"].includes(itemSpec.type),
    build: buildKitchenBaseItem
  },
  {
    // itemSpec.type === "fridge"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "fridge",
    build: buildFridgeItem
  },
  {
    // itemSpec.type === "storagewaterheater"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "storagewaterheater",
    build: buildStoragewaterheaterItem
  },
  {
    // itemSpec.type === "gaswaterheater"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "gaswaterheater",
    build: buildGaswaterheaterItem
  },
  {
    // itemSpec.type === "pipelinewaterpurifier"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "pipelinewaterpurifier",
    build: buildPipelinewaterpurifierItem
  },
  {
    // itemSpec.type === "tea_bar_machine"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "tea_bar_machine",
    build: buildTeaBarMachineItem
  },
  {
    // itemSpec.type === "washer" || itemSpec.type === "dryer"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "washer" || itemSpec.type === "dryer",
    build: buildWasherDryerItem
  },
  {
    // itemSpec.type === "dishwasher"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "dishwasher",
    build: buildDishwasherItem
  },
  {
    // itemSpec.type === "steamoven"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "steamoven",
    build: buildSteamovenItem
  },
  {
    // itemSpec.type === "microwave"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "microwave",
    build: buildMicrowaveItem
  },
  {
    // itemSpec.type === "ricecooker"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "ricecooker",
    build: buildRicecookerItem
  },
  {
    // itemSpec.type === "rangehood"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "rangehood",
    build: buildRangehoodItem
  },
  {
    // itemSpec.type === "wallac"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "wallac",
    build: buildWallacItem
  },
  {
    // itemSpec.type === "floorac"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "floorac",
    build: buildFlooracItem
  },
  {
    // itemSpec.type === "robotvacuum"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "robotvacuum",
    build: buildRobotvacuumItem
  },
  {
    // itemSpec.type === "camera" || itemSpec.type === "presence"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "camera" || itemSpec.type === "presence",
    build: buildCameraPresenceItem
  },
  {
    // itemSpec.type === "nas"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "nas",
    build: buildNasItem
  },
  {
    // itemSpec.type === "airpurifier"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "airpurifier",
    build: buildAirpurifierItem
  },
  {
    // itemSpec.type === "tv"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "tv",
    build: buildTvItem
  },
  {
    // itemSpec.type === "vanity"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "vanity",
    build: buildVanityItem
  },
  {
    // itemSpec.type === "desk"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "desk",
    build: buildDeskItem
  },
  {
    // itemSpec.type === "desktop"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "desktop",
    build: buildDesktopItem
  },
  {
    // itemSpec.type === "laptop"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "laptop",
    build: buildLaptopItem
  },
  {
    // itemSpec.type === "toilet"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "toilet",
    build: buildToiletItem
  },
  {
    // itemSpec.type === "squattoilet"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "squattoilet",
    build: buildSquattoiletItem
  },
  {
    // itemSpec.type === "urinal"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "urinal",
    build: buildUrinalItem
  },
  {
    // itemSpec.type === "bathtub"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "bathtub",
    build: buildBathtubItem
  },
  {
    // itemSpec.type === "walllamp"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "walllamp",
    build: buildWalllampItem
  },
  {
    // itemSpec.type === "glasspartition"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "glasspartition",
    build: buildGlasspartitionItem
  },
  {
    // itemSpec.type === "shower"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "shower",
    build: buildShowerItem
  },
  {
    // itemSpec.type === "basin"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "basin",
    build: buildBasinItem
  },
  {
    // itemSpec.type === "rug"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "rug",
    build: buildRugItem
  },
  {
    // itemSpec.type === "tvstand"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "tvstand",
    build: buildTvstandItem
  },
  {
    // itemSpec.type === "floorlamp"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "floorlamp",
    build: buildFloorlampItem
  },
  {
    // itemSpec.type === "plant"
    match: ({ itemSpec }: ItemBuilderContext) => itemSpec.type === "plant",
    build: buildPlantItem
  }
];

/**
 * 按分派表构建物件本体。返回 true 表示这条支路已自带收尾（调用方应直接返回模型组）。
 */
export function buildItemBody(context: ItemBuilderContext) {
  for (const builder of ITEM_MODEL_BUILDERS) {
    if (!builder.match(context)) continue;
    builder.build(context);
    return builder.terminal === true;
  }
  return false;
}

/**
 * 收尾：外部模型整棵替换、电视屏幕、合批与材质共享、选中高亮、姿态。
 */
export function finishItemModel(context: ItemBuilderContext) {
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
