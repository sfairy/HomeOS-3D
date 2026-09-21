/*
 * 物件构建器：桌与桌面设备
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 茶几与方茶几、书桌、台式机、笔记本、电视柜、地毯。
 */
/**
 * 命中：itemSpec.type === "coffeetable"
 */
export function buildCoffeetableItem(context) {
  const {
    addCylinderMesh,
    furnitureColor,
    furnitureDarkColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const coffeeTableLegRadius = Math.min(itemWidth * 0.34, itemDepth * 0.42);
  const coffeeTableSmallLegRadius = Math.min(itemWidth * 0.23, itemDepth * 0.29);
  const coffeeTableLegX = -itemWidth * 0.16;
  const coffeeTableLegZ = itemDepth * 0.08;
  const coffeeTableSmallLegX = itemWidth * 0.24;
  const coffeeTableSmallLegZ = -itemDepth * 0.2;
  const coffeeTableLegHeight = itemHeight * 0.58;
  const coffeeTableSmallLegHeight = itemHeight * 0.76;
  addCylinderMesh(
    itemGroup,
    coffeeTableLegRadius * 0.3,
    coffeeTableLegRadius * 0.5,
    coffeeTableLegHeight,
    coffeeTableLegX,
    coffeeTableLegHeight * 0.5,
    coffeeTableLegZ,
    furnitureColor,
    {
      segments: 40,
      roughness: 0.82
    }
  );
  const coffeeTableTopThickness = itemHeight * 0.07;
  const coffeeTableInsetThickness = itemHeight * 0.055;
  const coffeeTableTopCenterY = coffeeTableLegHeight + coffeeTableTopThickness * 0.5 + 0.001;
  const coffeeTableInsetCenterY =
    coffeeTableTopCenterY + (coffeeTableTopThickness + coffeeTableInsetThickness) * 0.5 + 0.001;
  addCylinderMesh(
    itemGroup,
    coffeeTableLegRadius * 1.02,
    coffeeTableLegRadius * 1.02,
    coffeeTableTopThickness,
    coffeeTableLegX,
    coffeeTableTopCenterY,
    coffeeTableLegZ,
    furnitureDarkColor,
    {
      segments: 48,
      roughness: 0.72
    }
  );
  addCylinderMesh(
    itemGroup,
    coffeeTableLegRadius,
    coffeeTableLegRadius,
    coffeeTableInsetThickness,
    coffeeTableLegX,
    coffeeTableInsetCenterY,
    coffeeTableLegZ,
    furnitureLightColor,
    {
      segments: 48,
      roughness: 0.9
    }
  );
  addCylinderMesh(
    itemGroup,
    coffeeTableSmallLegRadius * 0.32,
    coffeeTableSmallLegRadius * 0.52,
    coffeeTableSmallLegHeight,
    coffeeTableSmallLegX,
    coffeeTableSmallLegHeight * 0.5,
    coffeeTableSmallLegZ,
    furnitureSoftColor,
    {
      segments: 40,
      roughness: 0.82
    }
  );
  const smallTableTopThickness = itemHeight * 0.07;
  const smallTableInsetThickness = itemHeight * 0.055;
  const smallTableTopCenterY = coffeeTableSmallLegHeight + smallTableTopThickness * 0.5 + 0.001;
  const smallTableInsetCenterY =
    smallTableTopCenterY + (smallTableTopThickness + smallTableInsetThickness) * 0.5 + 0.001;
  addCylinderMesh(
    itemGroup,
    coffeeTableSmallLegRadius * 1.02,
    coffeeTableSmallLegRadius * 1.02,
    smallTableTopThickness,
    coffeeTableSmallLegX,
    smallTableTopCenterY,
    coffeeTableSmallLegZ,
    furnitureDarkColor,
    {
      segments: 48,
      roughness: 0.72
    }
  );
  addCylinderMesh(
    itemGroup,
    coffeeTableSmallLegRadius,
    coffeeTableSmallLegRadius,
    smallTableInsetThickness,
    coffeeTableSmallLegX,
    smallTableInsetCenterY,
    coffeeTableSmallLegZ,
    furnitureLightColor,
    {
      segments: 48,
      roughness: 0.9
    }
  );
}

/**
 * 命中：itemSpec.type === "squarecoffeetable"
 */
export function buildSquarecoffeetableItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const squareTableLegHeight = Math.max(itemHeight * 0.22, 0.085);
  const squareTableTopThickness = Math.max(itemHeight * 0.16, 0.065);
  const squareTableTopY = squareTableLegHeight + 0.012;
  const squareTableBodyHeight = Math.max(
    itemHeight - squareTableTopY - squareTableTopThickness,
    0.16
  );
  const squareTableSideLegWidth = Math.max(itemWidth * 0.075, 0.045);
  const squareTableShelfDepth = Math.max(itemDepth * 0.035, 0.018);
  const squareTableShelfHeight = squareTableBodyHeight * 0.72;
  const squareTableShelfY = squareTableTopY + squareTableBodyHeight * 0.48;
  const squareTableRailWidth = itemWidth * 0.27;
  const squareTableRailOffset = itemWidth * 0.34;
  const squareTableBodyColor = furnitureColor;
  const squareTableShelfColor = furnitureSoftColor;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.98,
    squareTableTopThickness,
    itemDepth * 1.03,
    0,
    squareTableTopY + squareTableBodyHeight + squareTableTopThickness * 0.5,
    0,
    squareTableShelfColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.035,
      roughness: 0.5,
      metalness: 0.02
    }
  );
  addBoxMesh(
    itemGroup,
    squareTableSideLegWidth,
    squareTableBodyHeight,
    itemDepth * 0.92,
    -itemWidth * 0.5 + squareTableSideLegWidth * 0.5,
    squareTableTopY + squareTableBodyHeight * 0.5,
    0,
    squareTableBodyColor,
    {
      rounded: false,
      roughness: 0.6
    }
  );
  addBoxMesh(
    itemGroup,
    squareTableSideLegWidth,
    squareTableBodyHeight,
    itemDepth * 0.92,
    itemWidth * 0.5 - squareTableSideLegWidth * 0.5,
    squareTableTopY + squareTableBodyHeight * 0.5,
    0,
    squareTableBodyColor,
    {
      rounded: false,
      roughness: 0.6
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.86,
    squareTableBodyHeight * 0.9,
    0.035,
    0,
    squareTableTopY + squareTableBodyHeight * 0.52,
    -itemDepth * 0.45,
    squareTableBodyColor,
    {
      rounded: false,
      roughness: 0.75
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.86,
    squareTableBodyHeight * 0.1,
    itemDepth * 0.9,
    0,
    squareTableTopY + squareTableBodyHeight * 0.08,
    0,
    squareTableBodyColor,
    {
      rounded: false,
      roughness: 0.58
    }
  );
  for (const railPositionX of [-squareTableRailOffset, 0, squareTableRailOffset]) {
    addBoxMesh(
      itemGroup,
      squareTableRailWidth,
      squareTableShelfHeight,
      squareTableShelfDepth,
      railPositionX,
      squareTableShelfY,
      itemDepth * 0.48,
      squareTableShelfColor,
      {
        radius: Math.min(itemWidth, itemDepth) * 0.025,
        roughness: 0.52
      }
    );
    const handlePositionX =
      railPositionX === 0
        ? 0
        : railPositionX +
          (railPositionX < 0 ? squareTableRailWidth * 0.3 : -squareTableRailWidth * 0.3);
    addBoxMesh(
      itemGroup,
      0.022,
      squareTableShelfHeight * 0.2,
      0.025,
      handlePositionX,
      squareTableShelfY,
      itemDepth * 0.505,
      furnitureDarkColor,
      {
        radius: 0.009,
        metalness: 0.22,
        roughness: 0.3
      }
    );
  }
  const tableLegSize = Math.max(Math.min(itemWidth, itemDepth) * 0.055, 0.035);
  for (const legPositionX of [-itemWidth * 0.4, itemWidth * 0.4]) {
    for (const legPositionZ of [-itemDepth * 0.36, itemDepth * 0.36]) {
      const tableLegMesh = addBoxMesh(
        itemGroup,
        tableLegSize,
        squareTableLegHeight,
        tableLegSize,
        legPositionX,
        squareTableLegHeight * 0.5,
        legPositionZ,
        furnitureDarkColor,
        {
          radius: tableLegSize * 0.22,
          roughness: 0.55,
          metalness: 0.02
        }
      );
      tableLegMesh.rotation.z = (legPositionX < 0 ? -1 : 1) * 0.09;
      tableLegMesh.rotation.x = (legPositionZ < 0 ? -1 : 1) * 0.06;
    }
  }
}

/**
 * 命中：itemSpec.type === "desk"
 */
export function buildDeskItem(context) {
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
  addBoxMesh(
    itemGroup,
    itemWidth,
    itemHeight * 0.1,
    itemDepth,
    0,
    itemHeight * 0.93,
    0,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.05,
    itemHeight * 0.88,
    itemDepth * 0.82,
    -itemWidth * 0.44,
    itemHeight * 0.44,
    0,
    furnitureDarkColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.05,
    itemHeight * 0.88,
    itemDepth * 0.82,
    itemWidth * 0.44,
    itemHeight * 0.44,
    0,
    furnitureDarkColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.34,
    itemHeight * 0.18,
    itemDepth * 0.78,
    itemWidth * 0.22,
    itemHeight * 0.74,
    0,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.27,
    0.018,
    itemDepth * 0.04,
    itemWidth * 0.22,
    itemHeight * 0.73,
    itemDepth * 0.41,
    furnitureLightColor,
    {
      metalness: 0.35
    }
  );
}

/**
 * 命中：itemSpec.type === "desktop"
 */
export function buildDesktopItem(context) {
  const {
    addBoxMesh,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const desktopScreenWidth = itemWidth * 0.72;
  const desktopScreenHeight = itemHeight * 0.58;
  addBoxMesh(
    itemGroup,
    desktopScreenWidth,
    desktopScreenHeight,
    0.035,
    -itemWidth * 0.06,
    itemHeight * 0.66,
    -itemDepth * 0.25,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.24
    }
  );
  addBoxMesh(
    itemGroup,
    desktopScreenWidth * 0.9,
    desktopScreenHeight * 0.84,
    0.01,
    -itemWidth * 0.06,
    itemHeight * 0.66,
    -itemDepth * 0.19,
    659481,
    {
      rounded: false,
      roughness: 0.18,
      emissive: 1517112,
      emissiveIntensity: 0.35
    }
  );
  addBoxMesh(
    itemGroup,
    0.035,
    itemHeight * 0.24,
    0.035,
    -itemWidth * 0.06,
    itemHeight * 0.25,
    -itemDepth * 0.25,
    furnitureDarkColor,
    {
      metalness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.28,
    0.025,
    itemDepth * 0.3,
    -itemWidth * 0.06,
    0.02,
    -itemDepth * 0.22,
    furnitureDarkColor,
    {
      metalness: 0.42
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.58,
    0.022,
    itemDepth * 0.38,
    -itemWidth * 0.08,
    0.025,
    itemDepth * 0.24,
    furnitureSoftColor,
    {
      rounded: false,
      roughness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.1,
    0.035,
    itemDepth * 0.22,
    itemWidth * 0.36,
    0.028,
    itemDepth * 0.24,
    furnitureSoftColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.035,
      roughness: 0.46
    }
  );
}

/**
 * 命中：itemSpec.type === "laptop"
 */
export function buildLaptopItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureDarkColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  addBoxMesh(
    itemGroup,
    itemWidth,
    0.025,
    itemDepth * 0.72,
    0,
    0.018,
    itemDepth * 0.08,
    furnitureColor,
    {
      metalness: 0.28,
      roughness: 0.36
    }
  );
  const laptopScreenMesh = addBoxMesh(
    itemGroup,
    itemWidth * 0.96,
    itemHeight * 0.78,
    0.018,
    0,
    itemHeight * 0.43,
    -itemDepth * 0.29,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.22,
      roughness: 0.25
    }
  );
  laptopScreenMesh.rotation.x = -Math.PI * 0.08;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.86,
    itemHeight * 0.63,
    0.01,
    0,
    itemHeight * 0.43,
    -itemDepth * 0.278,
    659740,
    {
      rounded: false,
      emissive: 1585226,
      emissiveIntensity: 0.38,
      roughness: 0.18
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.62,
    0.009,
    itemDepth * 0.34,
    0,
    0.035,
    itemDepth * 0.12,
    furnitureDarkColor,
    {
      rounded: false
    }
  );
}

/**
 * 命中：itemSpec.type === "rug"
 */
export function buildRugItem(context) {
  const {
    addBoxMesh,
    addRugMeshes,
    clamp,
    furnitureColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
    threeModuleMin,
  } = context;
  if (!addRugMeshes(itemGroup, itemSpec, furnitureColor, furnitureSoftColor)) {
    const rugPileThickness = clamp(itemHeight, 0.004, 0.018);
    addBoxMesh(
      itemGroup,
      itemWidth,
      rugPileThickness,
      itemDepth,
      0,
      rugPileThickness * 0.5,
      0,
      furnitureColor,
      {
        radius: Math.min(itemWidth, itemDepth) * 0.018,
        roughness: 1,
        metalness: 0,
        castShadow: false,
        receiveShadow: true
      }
    );
    const rugPatternMesh = new threeModuleMin.Mesh(
      new threeModuleMin.PlaneGeometry(itemWidth * 0.88, itemDepth * 0.84),
      new threeModuleMin.MeshStandardMaterial({
        color: furnitureSoftColor,
        roughness: 1,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -4
      })
    );
    rugPatternMesh.rotation.x = -Math.PI / 2;
    rugPatternMesh.position.y = rugPileThickness + 0.001;
    rugPatternMesh.castShadow = false;
    rugPatternMesh.receiveShadow = true;
    rugPatternMesh.renderOrder = 1;
    itemGroup.add(rugPatternMesh);
  }
}

/**
 * 命中：itemSpec.type === "tvstand"
 */
export function buildTvstandItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  addBoxMesh(
    itemGroup,
    itemWidth,
    itemHeight * 0.76,
    itemDepth,
    0,
    itemHeight * 0.42,
    0,
    furnitureColor
  );
  const tvStandTopThickness = itemHeight * 0.08;
  const tvStandBodyHeight = itemHeight * 0.8;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.98,
    tvStandTopThickness,
    itemDepth,
    0,
    tvStandBodyHeight + tvStandTopThickness * 0.5,
    0,
    furnitureSoftColor
  );
  addBoxMesh(
    itemGroup,
    0.018,
    itemHeight * 0.58,
    itemDepth * 1.01,
    0,
    itemHeight * 0.43,
    itemDepth * 0.01,
    furnitureDarkColor,
    {
      rounded: false
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.91,
    0.015,
    itemDepth * 1.01,
    0,
    itemHeight * 0.43,
    itemDepth * 0.01,
    furnitureDarkColor,
    {
      rounded: false
    }
  );
  for (const tvStandDoorOffsetFactor of [-0.4, 0.4]) {
    addBoxMesh(
      itemGroup,
      0.055,
      itemHeight * 0.2,
      0.055,
      itemWidth * tvStandDoorOffsetFactor,
      itemHeight * 0.1,
      0,
      furnitureDarkColor,
      {
        metalness: 0.32
      }
    );
  }
}

