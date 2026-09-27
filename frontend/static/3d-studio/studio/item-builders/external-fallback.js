/*
 * 物件构建器：外部模型兜底
 */
import { APPLIANCE_ITEM_TYPES } from "../studio-item-types.js?v=2609271508";
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

