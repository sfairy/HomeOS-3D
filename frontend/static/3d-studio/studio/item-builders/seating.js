/*
 * 物件构建器：座具与睡眠
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 沙发、床、床头柜、餐桌、圆桌（含转盘款）、吧台、椅子。
 */
import { isRoundTableTurntableItem } from "../studio-item-types.js?v=2609220943";
/**
 * 命中：itemSpec.type === "sofa"
 */
export function buildSofaItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const sofaLegDrop = itemHeight * 0.14;
  /**
   * 把沙发零件的设计高度换算成实际摆放高度：整体下移腿高后再压低 8mm。8mm 是刻意留出的坐垫下陷量，避免坐面与框架
   * 刚好齐平显得生硬；sofaLegDrop 为椅腿高度（沙发总高的 14%）。
   * @returns {number} 实际使用的世界高度（米）。
   */
  const seatDropY = seatBaseY => seatBaseY - sofaLegDrop + -0.008;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.92,
    itemHeight * 0.28,
    itemDepth * 0.72,
    0,
    seatDropY(itemHeight * 0.28),
    itemDepth * 0.06,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.92,
    itemHeight * 0.55,
    itemDepth * 0.18,
    0,
    seatDropY(itemHeight * 0.56),
    -itemDepth * 0.35,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.1,
    itemHeight * 0.48,
    itemDepth * 0.75,
    -itemWidth * 0.46,
    seatDropY(itemHeight * 0.39),
    itemDepth * 0.03,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.1,
    itemHeight * 0.48,
    itemDepth * 0.75,
    itemWidth * 0.46,
    seatDropY(itemHeight * 0.39),
    itemDepth * 0.03,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.42,
    itemHeight * 0.12,
    itemDepth * 0.55,
    -itemWidth * 0.22,
    seatDropY(itemHeight * 0.47),
    itemDepth * 0.07,
    furnitureSoftColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.42,
    itemHeight * 0.12,
    itemDepth * 0.55,
    itemWidth * 0.22,
    seatDropY(itemHeight * 0.47),
    itemDepth * 0.07,
    furnitureSoftColor
  );
}

/**
 * 命中：itemSpec.type === "bed"
 */
export function buildBedItem(context) {
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
    itemWidth * 0.996,
    itemHeight * 0.3,
    itemDepth * 0.996,
    0,
    itemHeight * 0.15,
    0,
    furnitureDarkColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.96,
    itemHeight * 0.32,
    itemDepth * 0.92,
    0,
    itemHeight * 0.43,
    itemDepth * 0.03,
    furnitureSoftColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    itemHeight * 0.95,
    itemDepth * 0.09,
    0,
    itemHeight * 0.48,
    -itemDepth * 0.455,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.38,
    itemHeight * 0.14,
    itemDepth * 0.22,
    -itemWidth * 0.23,
    itemHeight * 0.66,
    -itemDepth * 0.29,
    furnitureLightColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.38,
    itemHeight * 0.14,
    itemDepth * 0.22,
    itemWidth * 0.23,
    itemHeight * 0.66,
    -itemDepth * 0.29,
    furnitureLightColor
  );
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
    furnitureColor,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
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
    furnitureColor
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
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
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
    furnitureLightColor,
    {
      segments: 48,
      roughness: 0.5,
      metalness: 0.08
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
      furnitureSoftColor,
      {
        segments: 48,
        roughness: 0.48,
        metalness: 0.08
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
      furnitureDarkColor,
      {
        segments: 48,
        roughness: 0.32,
        metalness: 0.12
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

