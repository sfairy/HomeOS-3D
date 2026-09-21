/*
 * 物件构建器：储物与墙面造型
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 餐边柜、鞋柜、地柜、层板、壁柜，以及立柱 / 平面标签 / 背景墙 / 壁画这四个小构建体。
 */
/**
 * 命中：itemSpec.type === "planlabel"
 */
export function buildPlanlabelItem(context) {
  const { buildPlanLabelMesh, itemGroup, itemSpec } = context;
  itemGroup.add(buildPlanLabelMesh(itemSpec));
}

/**
 * 命中：itemSpec.type === "mural"
 */
export function buildMuralItem(context) {
  const {
    buildMuralItemMeshGroup,
    furnitureDarkColor,
    furnitureLightColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
  } = context;
  buildMuralItemMeshGroup(
    itemGroup,
    itemSpec,
    itemWidth,
    itemDepth,
    itemHeight,
    furnitureDarkColor,
    furnitureLightColor
  );
}

/**
 * 命中：itemSpec.type === "featurewall"
 */
export function buildFeaturewallItem(context) {
  const {
    buildFeatureWallItemMeshGroup,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
  } = context;
  buildFeatureWallItemMeshGroup(itemGroup, itemSpec, itemWidth, itemDepth, itemHeight);
}

/**
 * 命中：itemSpec.type === "sideboard"
 */
export function buildSideboardItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const sideboardHeight = Math.max(itemHeight, 1.8);
  const sideboardLowerHeight = sideboardHeight * 0.39;
  const sideboardDrawerHeight = sideboardHeight * 0.22;
  const sideboardSplitY = sideboardLowerHeight + sideboardDrawerHeight;
  const sideboardUpperHeight = sideboardHeight - sideboardSplitY;
  const sideboardHandleColor = furnitureSoftColor;
  const sideboardHandleWidth = itemWidth * 0.31;
  const sideboardLowerHandleHeight = sideboardLowerHeight * 0.88;
  const sideboardUpperHandleHeight = sideboardUpperHeight * 0.86;
  addBoxMesh(
    itemGroup,
    itemWidth,
    sideboardLowerHeight,
    itemDepth,
    0,
    sideboardLowerHeight * 0.5,
    0,
    furnitureColor,
    {
      roughness: 0.58
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    0.045,
    itemDepth,
    0,
    sideboardLowerHeight,
    0,
    furnitureSoftColor,
    {
      roughness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    sideboardDrawerHeight,
    0.045,
    0,
    sideboardLowerHeight + sideboardDrawerHeight * 0.5,
    -itemDepth * 0.46,
    furnitureColor,
    {
      rounded: false,
      roughness: 0.62
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    sideboardUpperHeight,
    itemDepth,
    0,
    sideboardSplitY + sideboardUpperHeight * 0.5,
    0,
    furnitureColor,
    {
      roughness: 0.58
    }
  );
  for (const sideboardHandleOffset of [-0.33, 0, 0.33]) {
    addBoxMesh(
      itemGroup,
      sideboardHandleWidth,
      sideboardLowerHandleHeight,
      0.026,
      itemWidth * sideboardHandleOffset,
      sideboardLowerHeight * 0.48,
      itemDepth * 0.515,
      sideboardHandleColor,
      {
        rounded: false,
        roughness: 0.45
      }
    );
    addBoxMesh(
      itemGroup,
      sideboardHandleWidth,
      sideboardUpperHandleHeight,
      0.026,
      itemWidth * sideboardHandleOffset,
      sideboardSplitY + sideboardUpperHeight * 0.5,
      itemDepth * 0.515,
      sideboardHandleColor,
      {
        rounded: false,
        roughness: 0.45
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "shoecabinet"
 */
export function buildShoecabinetItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const shoeCabinetHeight = Math.max(itemHeight, 1.9);
  const shoeCabinetHandleColor = furnitureSoftColor;
  const shoeCabinetTrimColor = furnitureSoftColor;
  const shoeCabinetLeftHalfWidth = itemWidth * 0.5;
  const shoeCabinetRightHalfWidth = itemWidth * 0.5;
  const shoeCabinetLeftDoorX = -itemWidth * 0.25;
  const shoeCabinetRightDoorX = itemWidth * 0.25;
  const shoeCabinetUpperSectionHeight = shoeCabinetHeight * 0.22;
  const shoeCabinetLowerSectionHeight = shoeCabinetHeight * 0.43;
  const shoeCabinetUpperDoorHeight = shoeCabinetHeight * 0.21;
  const shoeCabinetLowerDoorHeight = shoeCabinetHeight * 0.37;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.98,
    shoeCabinetHeight * 0.93,
    0.045,
    0,
    shoeCabinetHeight * 0.48,
    -itemDepth * 0.47,
    furnitureColor,
    {
      rounded: false,
      roughness: 0.62
    }
  );
  addBoxMesh(
    itemGroup,
    shoeCabinetLeftHalfWidth,
    shoeCabinetUpperSectionHeight * 0.56,
    itemDepth * 0.92,
    shoeCabinetLeftDoorX,
    shoeCabinetUpperSectionHeight * 0.35,
    0,
    furnitureColor,
    {
      roughness: 0.56
    }
  );
  addBoxMesh(
    itemGroup,
    shoeCabinetLeftHalfWidth * 1.02,
    0.055,
    itemDepth * 1.04,
    shoeCabinetLeftDoorX,
    shoeCabinetUpperSectionHeight * 0.67,
    0,
    shoeCabinetTrimColor,
    {
      roughness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    shoeCabinetRightHalfWidth,
    shoeCabinetLowerSectionHeight,
    itemDepth,
    shoeCabinetRightDoorX,
    shoeCabinetLowerSectionHeight * 0.5,
    0,
    furnitureColor,
    {
      roughness: 0.58
    }
  );
  for (const shoeCabinetTopHandleOffset of [-0.245, 0.245]) {
    addBoxMesh(
      itemGroup,
      shoeCabinetRightHalfWidth * 0.47,
      shoeCabinetLowerSectionHeight * 0.84,
      0.026,
      shoeCabinetRightDoorX + shoeCabinetRightHalfWidth * shoeCabinetTopHandleOffset,
      shoeCabinetLowerSectionHeight * 0.48,
      itemDepth * 0.515,
      shoeCabinetHandleColor,
      {
        rounded: false,
        roughness: 0.45
      }
    );
  }
  const shoeCabinetUpperDoorY = shoeCabinetHeight - shoeCabinetUpperDoorHeight - 0.045;
  addBoxMesh(
    itemGroup,
    shoeCabinetLeftHalfWidth,
    shoeCabinetUpperDoorHeight,
    itemDepth,
    shoeCabinetLeftDoorX,
    shoeCabinetUpperDoorY + shoeCabinetUpperDoorHeight * 0.5,
    0,
    furnitureColor,
    {
      roughness: 0.58
    }
  );
  for (const shoeCabinetMiddleHandleOffset of [-0.245, 0.245]) {
    addBoxMesh(
      itemGroup,
      shoeCabinetLeftHalfWidth * 0.47,
      shoeCabinetUpperDoorHeight * 0.86,
      0.026,
      shoeCabinetLeftDoorX + shoeCabinetLeftHalfWidth * shoeCabinetMiddleHandleOffset,
      shoeCabinetUpperDoorY + shoeCabinetUpperDoorHeight * 0.5,
      itemDepth * 0.515,
      shoeCabinetHandleColor,
      {
        rounded: false,
        roughness: 0.45
      }
    );
  }
  const shoeCabinetLowerDoorY = shoeCabinetHeight - shoeCabinetLowerDoorHeight - 0.045;
  addBoxMesh(
    itemGroup,
    shoeCabinetRightHalfWidth,
    shoeCabinetLowerDoorHeight,
    itemDepth,
    shoeCabinetRightDoorX,
    shoeCabinetLowerDoorY + shoeCabinetLowerDoorHeight * 0.5,
    0,
    furnitureColor,
    {
      roughness: 0.58
    }
  );
  for (const shoeCabinetBottomHandleOffset of [-0.245, 0.245]) {
    addBoxMesh(
      itemGroup,
      shoeCabinetRightHalfWidth * 0.47,
      shoeCabinetLowerDoorHeight * 0.9,
      0.026,
      shoeCabinetRightDoorX + shoeCabinetRightHalfWidth * shoeCabinetBottomHandleOffset,
      shoeCabinetLowerDoorY + shoeCabinetLowerDoorHeight * 0.5,
      itemDepth * 0.515,
      shoeCabinetHandleColor,
      {
        rounded: false,
        roughness: 0.45
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "cabinet"
 */
export function buildCabinetItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureDarkColor,
    furnitureLightColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  addBoxMesh(itemGroup, itemWidth, itemHeight, itemDepth, 0, itemHeight / 2, 0, furnitureColor);
  addBoxMesh(
    itemGroup,
    0.018,
    itemHeight * 0.9,
    itemDepth * 1.01,
    0,
    itemHeight * 0.52,
    itemDepth * 0.01,
    furnitureDarkColor
  );
  addBoxMesh(
    itemGroup,
    0.025,
    0.16,
    0.035,
    -0.08,
    itemHeight * 0.55,
    itemDepth * 0.515,
    furnitureLightColor,
    {
      metalness: 0.55
    }
  );
  addBoxMesh(
    itemGroup,
    0.025,
    0.16,
    0.035,
    0.08,
    itemHeight * 0.55,
    itemDepth * 0.515,
    furnitureLightColor,
    {
      metalness: 0.55
    }
  );
}

/**
 * 命中：itemSpec.type === "shelf"
 */
export function buildShelfItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const shelfPostSize = Math.min(Math.max(Math.min(itemWidth, itemDepth) * 0.07, 0.028), 0.052);
  const shelfBoardThickness = Math.min(Math.max(itemHeight * 0.022, 0.028), 0.052);
  const shelfBoardDepth = Math.max(itemDepth - shelfPostSize * 1.4, itemDepth * 0.78);
  const shelfPostOptions = {
    rounded: false,
    metalness: 0.62,
    roughness: 0.28
  };
  const shelfBoardOptions = {
    rounded: false,
    metalness: 0.18,
    roughness: 0.48
  };
  for (const postPositionX of [
    -itemWidth * 0.5 + shelfPostSize * 0.5,
    itemWidth * 0.5 - shelfPostSize * 0.5
  ]) {
    for (const postPositionZ of [
      -itemDepth * 0.5 + shelfPostSize * 0.5,
      itemDepth * 0.5 - shelfPostSize * 0.5
    ]) {
      addBoxMesh(
        itemGroup,
        shelfPostSize,
        itemHeight,
        shelfPostSize,
        postPositionX,
        itemHeight * 0.5,
        postPositionZ,
        furnitureColor,
        shelfPostOptions
      );
    }
  }
  for (const shelfHeightRatio of [0.04, 0.26, 0.49, 0.72, 0.96]) {
    addBoxMesh(
      itemGroup,
      itemWidth,
      shelfBoardThickness,
      shelfBoardDepth,
      0,
      itemHeight * shelfHeightRatio,
      0,
      shelfHeightRatio === 0.96 ? furnitureLightColor : furnitureSoftColor,
      shelfBoardOptions
    );
    addBoxMesh(
      itemGroup,
      itemWidth,
      shelfPostSize * 0.65,
      shelfPostSize,
      0,
      itemHeight * shelfHeightRatio,
      -itemDepth * 0.5 + shelfPostSize * 0.5,
      furnitureColor,
      shelfPostOptions
    );
  }
  const shelfClearWidth = Math.max(itemWidth - shelfPostSize * 2, shelfPostSize);
  const shelfTotalHeight = itemHeight * 0.84;
  const shelfDiagonalLength = Math.hypot(shelfClearWidth, shelfTotalHeight);
  for (const diagonalSign of [-1, 1]) {
    const shelfDiagonalBrace = addBoxMesh(
      itemGroup,
      shelfPostSize * 0.48,
      shelfDiagonalLength,
      shelfPostSize * 0.42,
      0,
      itemHeight * 0.5,
      -itemDepth * 0.5 + shelfPostSize * 0.18,
      furnitureColor,
      {
        ...shelfPostOptions,
        castShadow: false
      }
    );
    shelfDiagonalBrace.rotation.z = diagonalSign * Math.atan2(shelfClearWidth, shelfTotalHeight);
  }
}

/**
 * 命中：itemSpec.type === "pillar"
 */
export function buildPillarItem(context) {
  const {
    buildPillarItemMeshGroup,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemSpec,
    itemWidth,
  } = context;
  buildPillarItemMeshGroup(itemGroup, itemSpec, itemWidth, itemDepth, itemHeight, itemPalette);
}

/**
 * 命中：itemSpec.type === "wallcabinet"
 */
export function buildWallcabinetItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const wallCabinetLowerSectionHeight = itemHeight * 0.28;
  const wallCabinetUpperSectionHeight = itemHeight - wallCabinetLowerSectionHeight;
  const wallCabinetShelfY = 1.4 + wallCabinetLowerSectionHeight;
  const wallCabinetPanelThickness = Math.min(
    0.045,
    itemWidth * 0.15,
    itemDepth * 0.2,
    wallCabinetLowerSectionHeight * 0.2
  );
  const wallCabinetInnerWidth = itemWidth - wallCabinetPanelThickness * 2;
  const wallCabinetBottomY = 1.4 - wallCabinetPanelThickness / 2;
  const wallCabinetTopY = 1.4 + itemHeight;
  const wallCabinetShelfTopY = wallCabinetShelfY + wallCabinetPanelThickness / 2;
  addBoxMesh(
    itemGroup,
    wallCabinetInnerWidth,
    wallCabinetTopY - wallCabinetShelfTopY,
    itemDepth,
    0,
    (wallCabinetTopY + wallCabinetShelfTopY) / 2,
    0,
    furnitureColor,
    {
      rounded: false
    }
  );
  addBoxMesh(
    itemGroup,
    wallCabinetInnerWidth,
    wallCabinetShelfTopY - wallCabinetBottomY - wallCabinetPanelThickness * 2,
    wallCabinetPanelThickness,
    0,
    (wallCabinetBottomY + wallCabinetShelfTopY) / 2,
    -itemDepth / 2 + wallCabinetPanelThickness / 2,
    furnitureColor,
    {
      rounded: false,
      roughness: 0.62
    }
  );
  addBoxMesh(
    itemGroup,
    wallCabinetInnerWidth,
    wallCabinetPanelThickness,
    itemDepth,
    0,
    1.4,
    0,
    furnitureSoftColor,
    {
      rounded: false,
      roughness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    wallCabinetInnerWidth,
    wallCabinetPanelThickness,
    itemDepth,
    0,
    wallCabinetShelfY,
    0,
    furnitureSoftColor,
    {
      rounded: false,
      roughness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    wallCabinetPanelThickness,
    wallCabinetTopY - wallCabinetBottomY,
    itemDepth,
    -(itemWidth - wallCabinetPanelThickness) / 2,
    (wallCabinetBottomY + wallCabinetTopY) / 2,
    0,
    furnitureColor,
    {
      rounded: false
    }
  );
  addBoxMesh(
    itemGroup,
    wallCabinetPanelThickness,
    wallCabinetTopY - wallCabinetBottomY,
    itemDepth,
    (itemWidth - wallCabinetPanelThickness) / 2,
    (wallCabinetBottomY + wallCabinetTopY) / 2,
    0,
    furnitureColor,
    {
      rounded: false
    }
  );
  const wallCabinetDoorWidth = itemWidth * 0.31;
  for (const wallCabinetDoorOffsetFactor of [-0.33, 0, 0.33]) {
    addBoxMesh(
      itemGroup,
      wallCabinetDoorWidth,
      wallCabinetUpperSectionHeight * 0.9,
      0.026,
      itemWidth * wallCabinetDoorOffsetFactor,
      wallCabinetShelfY + wallCabinetUpperSectionHeight * 0.5,
      itemDepth * 0.515,
      furnitureSoftColor,
      {
        rounded: false,
        roughness: 0.45
      }
    );
  }
}

