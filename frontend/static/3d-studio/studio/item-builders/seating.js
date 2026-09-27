/*
 * 物件构建器：座具与睡眠
 */
import { isRoundTableTurntableItem } from "../studio-item-types.js?v=2609271508";
/**
 * 命中：itemSpec.type === "sofa"
 */
export function buildSofaItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureColor,
    furnitureDarkColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth
  } = context;
  // 收分木脚：高 0.12 / 总高 0.82，腿心内缩到 ±1.02 / ±0.36（都在座箱投影里）。
  const sofaLegHeight = itemHeight * (0.12 / 0.82);
  const sofaLegOffsetX = itemWidth * (1.02 / 2.2);
  const sofaLegOffsetZ = itemDepth * (0.36 / 0.9);
  const sofaLegRadiusBottom = itemWidth * (0.028 / 2.2);
  const sofaLegRadiusTop = itemWidth * (0.02 / 2.2);
  for (const legX of [-sofaLegOffsetX, sofaLegOffsetX]) {
    for (const legZ of [-sofaLegOffsetZ, sofaLegOffsetZ]) {
      addCylinderMesh(
        itemGroup,
        sofaLegRadiusTop,
        sofaLegRadiusBottom,
        sofaLegHeight,
        legX,
        sofaLegHeight * 0.5,
        legZ,
        furnitureDarkColor,
        { segments: 12, roughness: 0.7 }
      );
    }
  }
  /** 把规格里的设计高度（0.82 为整高）换算成占位几何的实际高度。 */
  const sofaRatio = 1 / 0.82;
  /**
   * 按规格的中心高摆一个方块。
   * @param {number} centerY 规格里的中心高度（米，整高按 0.82 算）。
   */
  const addSofaBlock = (widthRatio, heightRatio, depthRatio, xRatio, centerY, zRatio, color, options) => {
    const blockHeight = itemHeight * heightRatio * sofaRatio;
    addBoxMesh(
      itemGroup,
      itemWidth * widthRatio,
      blockHeight,
      itemDepth * depthRatio,
      itemWidth * xRatio,
      itemHeight * centerY * sofaRatio,
      itemDepth * zRatio,
      color,
      options
    );
  };
  // 座台木框：宽深吃满占地。
  addSofaBlock(1, 0.09, 1, 0, 0.165, 0, furnitureDarkColor, { radius: 0.01, roughness: 0.68 });
  // 座箱软包：0.21 → 0.38。
  addSofaBlock(1, 0.17, 1, 0, 0.295, 0, furnitureColor, { radius: 0.03, roughness: 0.92 });
  // 靠背：贴着座箱后沿，顶端正好落在整高。
  addSofaBlock(1, 0.61, 0.2, 0, 0.515, -0.4, furnitureColor, { radius: 0.05, roughness: 0.92 });
  // 两侧扶手：比靠背低 19cm。
  const sofaArmWidthRatio = 0.18 / 2.2;
  const sofaArmOffsetRatio = 1.01 / 2.2;
  for (const armX of [-sofaArmOffsetRatio, sofaArmOffsetRatio]) {
    addSofaBlock(
      sofaArmWidthRatio,
      0.42,
      1,
      armX,
      0.42,
      0,
      furnitureColor,
      { radius: 0.05, roughness: 0.92 }
    );
  }
  // 三块可分离坐垫：铺满两侧扶手之间，前沿缩进 6cm。
  for (const cushionXRatio of [-0.62 / 2.2, 0, 0.62 / 2.2]) {
    addSofaBlock(0.6 / 2.2, 0.14, 0.66 / 0.9, cushionXRatio, 0.45, 0.06 / 0.9, furnitureSoftColor, {
      radius: 0.04,
      roughness: 0.92
    });
  }
  // 三块靠垫：倚在靠背上，下沿压住坐垫 2cm。
  for (const backCushionXRatio of [-0.61 / 2.2, 0, 0.61 / 2.2]) {
    addSofaBlock(0.58 / 2.2, 0.34, 0.2, backCushionXRatio, 0.57, -0.2, furnitureSoftColor, {
      radius: 0.05,
      roughness: 0.92
    });
  }
  // 两只抱枕：撞色件。
  for (const pillowXRatio of [-0.66 / 2.2, 0.66 / 2.2]) {
    addSofaBlock(0.36 / 2.2, 0.32, 0.13 / 0.9, pillowXRatio, 0.6, -0.02 / 0.9, furnitureLightColor, {
      radius: 0.05,
      roughness: 0.9
    });
  }
}

/**
 * 命中：itemSpec.type === "bed"
 */
export function buildBedItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureDarkColor,
    furnitureLightColor,
    itemPalette,
    furnitureColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth
  } = context;
  // 三轴的「规格米 → 实际米」倍率。规格基准：宽 1.8 / 高 1.05 / 深 2.0。
  const bedBodyColor = itemPalette?.cabinetWood ?? furnitureDarkColor;
  const scaleX = itemWidth / 1.8;
  const scaleY = itemHeight / 1.05;
  const scaleZ = itemDepth / 2;
  /**
   * 按「规格里的米」摆一个方块（y 给**底面**高度，与规格一致，不必自己算中心）。
   * @param {number} specWidth 规格宽（米）
   * @param {number} specHeight 规格高（米）
   * @param {number} specDepth 规格深（米）
   * @param {number} specX 规格 x（米）
   * @param {number} specBottomY 规格底面高（米）
   * @param {number} specZ 规格 z（米）
   */
  const addBedBlock = (
    specWidth,
    specHeight,
    specDepth,
    specX,
    specBottomY,
    specZ,
    color,
    options
  ) => {
    addBoxMesh(
      itemGroup,
      specWidth * scaleX,
      specHeight * scaleY,
      specDepth * scaleZ,
      specX * scaleX,
      (specBottomY + specHeight / 2) * scaleY,
      specZ * scaleZ,
      color,
      options
    );
  };
  // 六条收分木脚：0 → 0.14，两米长的床只靠四角会中间塌。
  for (const legX of [-0.8, 0.8]) {
    for (const legZ of [-0.88, 0, 0.88]) {
      addCylinderMesh(
        itemGroup,
        0.022 * scaleX,
        0.03 * scaleX,
        0.14 * scaleY,
        legX * scaleX,
        0.07 * scaleY,
        legZ * scaleZ,
        furnitureDarkColor,
        { segments: 10 }
      );
    }
  }
  // 床架箱体 0.14 → 0.26；床垫沉进去 1cm；床头板从床架面立到 1.05；被子盖到床尾前 6cm；
  addBedBlock(1.76, 0.12, 2, 0, 0.14, 0, bedBodyColor, { radius: 0.012 });
  addBedBlock(1.72, 0.24, 1.88, 0, 0.25, 0.04, furnitureColor, { radius: 0.04 });
  addBedBlock(1.8, 0.91, 0.1, 0, 0.14, -0.95, furnitureColor, { radius: 0.045 });
  addBedBlock(1.8, 0.075, 1.36, 0, 0.475, 0.26, furnitureLightColor, { radius: 0.03 });
  addBedBlock(1.78, 0.06, 0.22, 0, 0.545, -0.29, furnitureSoftColor, { radius: 0.02 });
  addBedBlock(1.78, 0.045, 0.44, 0, 0.545, 0.72, furnitureSoftColor, { radius: 0.018 });
  // 枕头 / 抱枕的后仰角：addBoxMesh 不吃 rotationX（那是圆柱专用的选项），
  for (const pillowX of [-0.43, 0.43]) {
    const pillow = addBedBlock(0.76, 0.15, 0.44, pillowX, 0.45, -0.7, furnitureLightColor, {
      radius: 0.055
    });
    pillow.rotation.x = (-12 * Math.PI) / 180;
  }
  for (const cushionX of [-0.28, 0.28]) {
    const cushion = addBedBlock(0.4, 0.13, 0.3, cushionX, 0.545, -0.28, furnitureSoftColor, {
      radius: 0.05
    });
    cushion.rotation.x = (-18 * Math.PI) / 180;
  }
}

/**
 * 命中：itemSpec.type === "nightstand"
 */
export function buildNightstandItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureDarkColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  addBoxMesh(
    itemGroup,
    itemWidth,
    itemHeight * 0.78,
    itemDepth,
    0,
    itemHeight * 0.49,
    0,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 1.04,
    itemHeight * 0.07,
    itemDepth * 1.05,
    0,
    itemHeight * 0.91,
    0,
    furnitureSoftColor,
    {
      roughness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.9,
    0.014,
    itemDepth * 1.01,
    0,
    itemHeight * 0.63,
    itemDepth * 0.01,
    furnitureDarkColor,
    {
      rounded: false
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.9,
    0.014,
    itemDepth * 1.01,
    0,
    itemHeight * 0.38,
    itemDepth * 0.01,
    furnitureDarkColor,
    {
      rounded: false
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.22,
    0.022,
    0.032,
    0,
    itemHeight * 0.5,
    itemDepth * 0.52,
    furnitureLightColor,
    {
      metalness: 0.5
    }
  );
  for (const nightstandLegX of [-0.38, 0.38]) {
    for (const nightstandLegZ of [-0.35, 0.35]) {
      addBoxMesh(
        itemGroup,
        0.035,
        itemHeight * 0.2,
        0.035,
        itemWidth * nightstandLegX,
        itemHeight * 0.1,
        itemDepth * nightstandLegZ,
        furnitureDarkColor,
        {
          metalness: 0.18
        }
      );
    }
  }
}

/**
 * 命中：itemSpec.type === "table"
 */
export function buildTableItem(context) {
  const {
    addBoxMesh,
    addChairModel,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
    marbleTopTexture,
  } = context;
  const tableTopWidth = itemWidth * 0.64;
  const tableTopDepth = itemDepth * 0.48;
  addBoxMesh(
    itemGroup,
    tableTopWidth,
    itemHeight * 0.1,
    tableTopDepth,
    0,
    itemHeight * 0.93,
    0,
    16777215,
    {
      // 餐桌桌面：大理石 —— 基色取白，让程序大理石贴图原样显色。
      map: marbleTopTexture(),
      roughness: 0.34,
      metalness: 0.03
    }
  );
  for (const tableLegX of [-0.43, 0.43]) {
    for (const tableLegZ of [-0.38, 0.38]) {
      addBoxMesh(
        itemGroup,
        0.07,
        itemHeight * 0.9,
        0.07,
        tableTopWidth * tableLegX,
        itemHeight * 0.45,
        tableTopDepth * tableLegZ,
        furnitureDarkColor
      );
    }
  }
  const tableLegInset = Math.min(itemWidth * 0.2, 0.5);
  const tableLegDepth = Math.min(itemDepth * 0.27, 0.5);
  const tableLegHeight = itemHeight * 1.18;
  addChairModel(
    itemGroup,
    tableLegInset,
    tableLegDepth,
    tableLegHeight,
    -itemWidth * 0.37,
    0,
    Math.PI / 2,
    furnitureSoftColor,
    furnitureDarkColor
  );
  addChairModel(
    itemGroup,
    tableLegInset,
    tableLegDepth,
    tableLegHeight,
    itemWidth * 0.37,
    0,
    -Math.PI / 2,
    furnitureSoftColor,
    furnitureDarkColor
  );
  addChairModel(
    itemGroup,
    tableLegInset,
    tableLegDepth,
    tableLegHeight,
    0,
    -itemDepth * 0.35,
    0,
    furnitureSoftColor,
    furnitureDarkColor
  );
  addChairModel(
    itemGroup,
    tableLegInset,
    tableLegDepth,
    tableLegHeight,
    0,
    itemDepth * 0.35,
    Math.PI,
    furnitureSoftColor,
    furnitureDarkColor
  );
}

/**
 * 命中：ROUND_TABLE_TURNTABLE_ITEM_TYPES.has(itemSpec.type)
 */
export function buildRoundTableTurntableItem(context) {
  const {
    addChairModel,
    addCylinderMesh,
    furnitureColor,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
    marbleTopTexture,
  } = context;
  const roundTableRadius = Math.min(itemWidth, itemDepth) * 0.32;
  const roundTableTopThickness = Math.max(itemHeight * 0.07, 0.045);
  const roundTableTopCenterY = itemHeight * 0.92;
  addCylinderMesh(
    itemGroup,
    roundTableRadius,
    roundTableRadius,
    roundTableTopThickness,
    0,
    roundTableTopCenterY,
    0,
    16777215,
    {
      // 桌面：大理石（与方形餐桌同一张贴图，圆台面用自带 UV 直接贴）。
      segments: 48,
      map: marbleTopTexture(),
      roughness: 0.34,
      metalness: 0.03
    }
  );
  addCylinderMesh(
    itemGroup,
    Math.min(itemWidth, itemDepth) * 0.22,
    Math.min(itemWidth, itemDepth) * 0.3,
    itemHeight * 0.68,
    0,
    itemHeight * 0.43,
    0,
    furnitureColor,
    {
      segments: 36,
      roughness: 0.55,
      metalness: 0.06
    }
  );
  addCylinderMesh(
    itemGroup,
    Math.min(itemWidth, itemDepth) * 0.34,
    Math.min(itemWidth, itemDepth) * 0.34,
    itemHeight * 0.07,
    0,
    itemHeight * 0.045,
    0,
    furnitureDarkColor,
    {
      segments: 40,
      roughness: 0.42,
      metalness: 0.12
    }
  );
  if (isRoundTableTurntableItem(itemSpec)) {
    addCylinderMesh(
      itemGroup,
      roundTableRadius * 0.58,
      roundTableRadius * 0.58,
      Math.max(itemHeight * 0.035, 0.025),
      0,
      roundTableTopCenterY + roundTableTopThickness * 0.58,
      0,
      16777215,
      {
        // 转盘面同桌面，也取大理石。
        segments: 48,
        map: marbleTopTexture(),
        roughness: 0.34,
        metalness: 0.03
      }
    );
    addCylinderMesh(
      itemGroup,
      roundTableRadius * 0.44,
      roundTableRadius * 0.44,
      0.018,
      0,
      roundTableTopCenterY + roundTableTopThickness * 0.58 + 0.036,
      0,
      16777215,
      {
        // 转盘中心盖同样取石材，整块台面才统一。
        segments: 48,
        map: marbleTopTexture(),
        roughness: 0.34,
        metalness: 0.03
      }
    );
  }
  const chairSeatWidth = Math.min(itemWidth * 0.17, 0.42);
  const chairSeatDepth = Math.min(itemDepth * 0.19, 0.44);
  const chairBackHeight = itemHeight * 1.15;
  addChairModel(
    itemGroup,
    chairSeatWidth,
    chairSeatDepth,
    chairBackHeight,
    -itemWidth * 0.38,
    0,
    Math.PI / 2,
    furnitureSoftColor,
    furnitureDarkColor
  );
  addChairModel(
    itemGroup,
    chairSeatWidth,
    chairSeatDepth,
    chairBackHeight,
    itemWidth * 0.38,
    0,
    -Math.PI / 2,
    furnitureSoftColor,
    furnitureDarkColor
  );
  addChairModel(
    itemGroup,
    chairSeatWidth,
    chairSeatDepth,
    chairBackHeight,
    0,
    -itemDepth * 0.38,
    0,
    furnitureSoftColor,
    furnitureDarkColor
  );
  addChairModel(
    itemGroup,
    chairSeatWidth,
    chairSeatDepth,
    chairBackHeight,
    0,
    itemDepth * 0.38,
    Math.PI,
    furnitureSoftColor,
    furnitureDarkColor
  );
}

/**
 * 命中：itemSpec.type === "bar"
 */
export function buildBarItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
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
    itemHeight * 0.12,
    itemDepth,
    0,
    itemHeight * 0.94,
    0,
    furnitureSoftColor,
    {
      roughness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.92,
    itemHeight * 0.78,
    itemDepth * 0.46,
    0,
    itemHeight * 0.45,
    -itemDepth * 0.18,
    furnitureColor,
    {
      roughness: 0.65
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.86,
    itemHeight * 0.48,
    0.035,
    0,
    itemHeight * 0.42,
    itemDepth * 0.28,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.48
    }
  );
  for (const barStoolOffsetRatio of [-0.3, 0, 0.3]) {
    addCylinderMesh(
      itemGroup,
      itemDepth * 0.14,
      itemDepth * 0.14,
      0.045,
      itemWidth * barStoolOffsetRatio,
      itemHeight * 0.66,
      itemDepth * 0.52,
      furnitureSoftColor,
      {
        segments: 28,
        roughness: 0.52
      }
    );
    addCylinderMesh(
      itemGroup,
      0.025,
      0.025,
      itemHeight * 0.62,
      itemWidth * barStoolOffsetRatio,
      itemHeight * 0.34,
      itemDepth * 0.52,
      furnitureDarkColor,
      {
        segments: 18,
        metalness: 0.38,
        roughness: 0.28
      }
    );
    addCylinderMesh(
      itemGroup,
      itemDepth * 0.1,
      itemDepth * 0.12,
      0.035,
      itemWidth * barStoolOffsetRatio,
      0.018,
      itemDepth * 0.52,
      furnitureDarkColor,
      {
        segments: 24,
        metalness: 0.3,
        roughness: 0.34
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "chair"
 */
export function buildChairItem(context) {
  const {
    addChairModel,
    furnitureColor,
    furnitureDarkColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  addChairModel(
    itemGroup,
    itemWidth,
    itemDepth,
    itemHeight,
    0,
    0,
    0,
    furnitureColor,
    furnitureDarkColor
  );
}

