/*
 * 物件构建器：外部模型兜底
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 外部模型兜底：不在上面任何专有分支、但 ALL_ITEM_MODELS 里登记过模型的类型 —— 先试外部模型，
 * 取不到再退回盒体（或立柱的专用几何）。
 */
import { APPLIANCE_ITEM_TYPES } from "../studio-item-types.js?v=2609212122";
/**
 * 命中：itemSpec.offlineModelExport !== true && ALL_ITEM_MODELS[itemSpec.type] && itemSpec.type !== "smallcar" && itemSpec.type !== "sofa"
 */
export function buildExternalModelFallbackItem(context) {
  const {
    addBoxMesh,
    addExternalItemModel,
    applianceColor,
    buildPillarItemMeshGroup,
    furnitureColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemSpec,
    itemWidth,
  } = context;
  if (!addExternalItemModel(itemGroup, itemSpec)) {
    if (itemSpec.type === "pillar") {
      // 取不到立柱素材，于是用程序化实体保持属性面板上显示的造型。
      buildPillarItemMeshGroup(
        itemGroup,
        itemSpec,
        itemWidth,
        itemDepth,
        itemHeight,
        itemPalette
      );
    } else {
      addBoxMesh(
        itemGroup,
        itemWidth,
        itemHeight,
        itemDepth,
        0,
        itemHeight * 0.5,
        0,
        APPLIANCE_ITEM_TYPES.has(itemSpec.type) ? applianceColor : furnitureColor,
        {
          rounded: false,
          roughness: 0.6,
          metalness: 0.1
        }
      );
    }
  }
}

