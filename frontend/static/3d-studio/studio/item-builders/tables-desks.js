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
 *
 * 「组合茶几」= 两块石材叠合错位：白石板压在黑石座上。这里是**加载中的占位几何** ——
 * 外部 GLB 还没到位时先顶上，到位后整组被换掉（见 registry.js 的 finishItemModel）。
 *
 * 因此它的比例必须跟着 model-specs.mjs 的 coffeetable 一起改：占位几何与成品长得不一样，
 * 加载完成的一瞬间就会有「先是一对圆墩、再变成两块石板」的跳变。所有比例都写成对
 * itemWidth / itemDepth / itemHeight 的定比，那三处尺寸改动后这边自动跟着走。
 *
 * 石材整图与外部模型共用同一份缓存贴图（context.stoneSlabTexture），
 * 所以占位时看到的纹路就是成品那块石头的纹路。
 */
export function buildCoffeetableItem(context) {
  const {
    addBoxMesh,
    furnitureDarkColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
    stoneSlabTexture
  } = context;
  // 石座：长度 1.72 / 1.90、整高 0.30 / 0.50、进深占满、右端顶到 +0.95 → 中心偏 +0.09 / 1.90。
  const coffeetableBaseWidth = itemWidth * (1.72 / 1.9);
  const coffeetableBaseHeight = itemHeight * (0.3 / 0.5);
  const coffeetableBaseCenterX = itemWidth * (0.09 / 1.9);
  // 白石板：长 1.0 / 1.90、厚 0.20 / 0.50、进深 0.85 / 1.05，坐在石座上、向左错位悬挑。
  const coffeetableTopWidth = itemWidth * (1.0 / 1.9);
  const coffeetableTopHeight = itemHeight * (0.2 / 0.5);
  const coffeetableTopDepth = itemDepth * (0.85 / 1.05);
  const coffeetableTopCenterX = itemWidth * (-0.45 / 1.9);
  const coffeetableTopCenterY = coffeetableBaseHeight + coffeetableTopHeight * 0.5;
  // 两块石板各自的石材色号；贴图取不到（极端降级）时退回原来的家具深色 / 浅色。
  const coffeetableBaseTexture = stoneSlabTexture("marble-dark");
  const coffeetableTopTexture = stoneSlabTexture("marble");
  addBoxMesh(
    itemGroup,
    coffeetableBaseWidth,
    coffeetableBaseHeight,
    itemDepth,
    coffeetableBaseCenterX,
    coffeetableBaseHeight * 0.5,
    0,
    coffeetableBaseTexture ? 0xffffff : furnitureDarkColor,
    {
      map: coffeetableBaseTexture,
      radius: 0.01,
      roughness: 0.18,
      metalness: 0.04
    }
  );
  addBoxMesh(
    itemGroup,
    coffeetableTopWidth,
    coffeetableTopHeight,
    coffeetableTopDepth,
    coffeetableTopCenterX,
    coffeetableTopCenterY,
    0,
    coffeetableTopTexture ? 0xffffff : furnitureDarkColor,
    {
      map: coffeetableTopTexture,
      radius: 0.01,
      roughness: 0.24,
      metalness: 0.03
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

