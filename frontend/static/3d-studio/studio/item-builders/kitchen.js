/*
 * 物件构建器：厨房电器
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 厨房：橱柜一体（地柜 / 水槽 / 灶台）、冰箱、油烟机、洗碗机、蒸箱、微波炉、电饭煲。
 */
/**
 * 命中：["kitchenbase", "kitchensink", "kitchencooktop"].includes(itemSpec.type)
 */
export function buildKitchenBaseItem(context) {
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
    itemSpec,
    itemWidth,
  } = context;
  const kitchenBasePlinthHeight = itemHeight * 0.1;
  const kitchenBaseCounterThickness = itemHeight * 0.07;
  const kitchenBaseBodyHeight =
    itemHeight - kitchenBasePlinthHeight - kitchenBaseCounterThickness;
  const kitchenBaseBodyCenterY = kitchenBasePlinthHeight + kitchenBaseBodyHeight * 0.5;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.96,
    kitchenBasePlinthHeight,
    itemDepth * 0.8,
    0,
    kitchenBasePlinthHeight * 0.5,
    -itemDepth * 0.06,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.52
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    kitchenBaseBodyHeight,
    itemDepth,
    0,
    kitchenBaseBodyCenterY,
    0,
    furnitureColor,
    {
      rounded: false,
      roughness: 0.58
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 1.02,
    kitchenBaseCounterThickness,
    itemDepth * 1.04,
    0,
    itemHeight - kitchenBaseCounterThickness * 0.5,
    0,
    furnitureLightColor,
    {
      rounded: false,
      roughness: 0.42
    }
  );
  const kitchenBasePanelCount = Math.max(2, Math.min(6, Math.round(itemWidth / 0.6)));
  const kitchenBasePanelWidth = itemWidth / kitchenBasePanelCount;
  for (
    let kitchenBasePanelIndex = 0;
    kitchenBasePanelIndex < kitchenBasePanelCount;
    kitchenBasePanelIndex += 1
  ) {
    const kitchenBasePanelCenterX =
      -itemWidth * 0.5 + kitchenBasePanelWidth * (kitchenBasePanelIndex + 0.5);
    addBoxMesh(
      itemGroup,
      kitchenBasePanelWidth * 0.92,
      kitchenBaseBodyHeight * 0.9,
      0.025,
      kitchenBasePanelCenterX,
      kitchenBaseBodyCenterY,
      itemDepth * 0.515,
      furnitureSoftColor,
      {
        rounded: false,
        roughness: 0.46
      }
    );
    addBoxMesh(
      itemGroup,
      kitchenBasePanelWidth * 0.28,
      0.022,
      0.03,
      kitchenBasePanelCenterX,
      kitchenBasePlinthHeight + kitchenBaseBodyHeight * 0.83,
      itemDepth * 0.535,
      furnitureDarkColor,
      {
        rounded: false,
        metalness: 0.28,
        roughness: 0.3
      }
    );
  }
  if (itemSpec.type === "kitchensink") {
    addBoxMesh(
      itemGroup,
      itemWidth * 0.42,
      0.025,
      itemDepth * 0.52,
      0,
      itemHeight + 0.008,
      0,
      furnitureDarkColor,
      {
        rounded: false,
        metalness: 0.42,
        roughness: 0.28
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 0.34,
      0.02,
      itemDepth * 0.4,
      0,
      itemHeight + 0.022,
      0,
      furnitureSoftColor,
      {
        rounded: false,
        metalness: 0.18,
        roughness: 0.34
      }
    );
    addCylinderMesh(
      itemGroup,
      0.018,
      0.018,
      itemHeight * 0.22,
      itemWidth * 0.22,
      itemHeight + itemHeight * 0.11,
      -itemDepth * 0.17,
      furnitureDarkColor,
      {
        segments: 20,
        metalness: 0.65,
        roughness: 0.2
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 0.16,
      0.035,
      0.035,
      itemWidth * 0.14,
      itemHeight + itemHeight * 0.2,
      -itemDepth * 0.17,
      furnitureDarkColor,
      {
        rounded: false,
        metalness: 0.65,
        roughness: 0.2
      }
    );
  } else if (itemSpec.type === "kitchencooktop") {
    addBoxMesh(
      itemGroup,
      itemWidth * 0.48,
      0.025,
      itemDepth * 0.55,
      0,
      itemHeight + 0.008,
      0,
      furnitureDarkColor,
      {
        rounded: false,
        metalness: 0.32,
        roughness: 0.25
      }
    );
    for (const cooktopBurnerOffsetX of [-itemWidth * 0.13, itemWidth * 0.13]) {
      for (const cooktopBurnerOffsetZ of [-itemDepth * 0.14, itemDepth * 0.14]) {
        addCylinderMesh(
          itemGroup,
          itemWidth * 0.06,
          itemWidth * 0.06,
          0.018,
          cooktopBurnerOffsetX,
          itemHeight + 0.028,
          cooktopBurnerOffsetZ,
          furnitureSoftColor,
          {
            segments: 28,
            metalness: 0.42,
            roughness: 0.26
          }
        );
        addCylinderMesh(
          itemGroup,
          itemWidth * 0.025,
          itemWidth * 0.025,
          0.025,
          cooktopBurnerOffsetX,
          itemHeight + 0.045,
          cooktopBurnerOffsetZ,
          furnitureDarkColor,
          {
            segments: 24,
            metalness: 0.5,
            roughness: 0.22
          }
        );
      }
    }
  }
}

/**
 * 命中：itemSpec.type === "fridge"
 */
export function buildFridgeItem(context) {
  const {
    addBoxMesh,
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
    itemHeight,
    itemDepth,
    0,
    itemHeight / 2,
    0,
    furnitureLightColor,
    {
      metalness: 0.18,
      roughness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.88,
    0.018,
    itemDepth * 1.01,
    0,
    itemHeight * 0.42,
    itemDepth * 0.01,
    furnitureDarkColor,
    {
      metalness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    0.025,
    itemHeight * 0.27,
    0.035,
    itemWidth * 0.35,
    itemHeight * 0.65,
    itemDepth * 0.515,
    furnitureDarkColor,
    {
      metalness: 0.7
    }
  );
}

/**
 * 命中：itemSpec.type === "dishwasher"
 */
export function buildDishwasherItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
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
    itemHeight,
    itemDepth,
    0,
    itemHeight * 0.5,
    0,
    furnitureLightColor,
    {
      rounded: false,
      metalness: 0.12,
      roughness: 0.48
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.93,
    itemHeight * 0.74,
    0.028,
    0,
    itemHeight * 0.46,
    itemDepth * 0.515,
    furnitureSoftColor,
    {
      rounded: false,
      metalness: 0.08,
      roughness: 0.44
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.93,
    itemHeight * 0.14,
    0.032,
    0,
    itemHeight * 0.87,
    itemDepth * 0.52,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.18,
      roughness: 0.3
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.58,
    itemHeight * 0.026,
    0.034,
    0,
    itemHeight * 0.78,
    itemDepth * 0.54,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.5,
      roughness: 0.22
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.9,
    itemHeight * 0.075,
    itemDepth * 0.78,
    0,
    itemHeight * 0.038,
    -itemDepth * 0.04,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.4
    }
  );
  for (const dishwasherButtonOffsetFactor of [0.22, 0.31, 0.4]) {
    addCylinderMesh(
      itemGroup,
      itemWidth * 0.018,
      itemWidth * 0.018,
      0.012,
      itemWidth * dishwasherButtonOffsetFactor,
      itemHeight * 0.88,
      itemDepth * 0.545,
      furnitureSoftColor,
      {
        segments: 18,
        rotationX: Math.PI / 2,
        metalness: 0.26,
        roughness: 0.24
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "steamoven"
 */
export function buildSteamovenItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
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
    itemHeight,
    itemDepth,
    0,
    itemHeight * 0.5,
    0,
    furnitureLightColor,
    {
      rounded: false,
      metalness: 0.16,
      roughness: 0.42
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.94,
    itemHeight * 0.9,
    0.026,
    0,
    itemHeight * 0.5,
    itemDepth * 0.515,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.18,
      roughness: 0.25
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.78,
    itemHeight * 0.56,
    0.018,
    -itemWidth * 0.03,
    itemHeight * 0.42,
    itemDepth * 0.54,
    1515819,
    {
      rounded: false,
      metalness: 0.12,
      roughness: 0.18
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.72,
    itemHeight * 0.035,
    0.038,
    -itemWidth * 0.03,
    itemHeight * 0.74,
    itemDepth * 0.56,
    furnitureSoftColor,
    {
      rounded: false,
      metalness: 0.52,
      roughness: 0.22
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.24,
    itemHeight * 0.075,
    0.022,
    0,
    itemHeight * 0.86,
    itemDepth * 0.545,
    7706534,
    {
      rounded: false,
      emissive: 7706534,
      emissiveIntensity: 0.18,
      roughness: 0.2
    }
  );
  for (const steamOvenHandleOffsetFactor of [-0.36, 0.36]) {
    addCylinderMesh(
      itemGroup,
      itemWidth * 0.045,
      itemWidth * 0.045,
      0.026,
      itemWidth * steamOvenHandleOffsetFactor,
      itemHeight * 0.86,
      itemDepth * 0.55,
      furnitureSoftColor,
      {
        segments: 24,
        rotationX: Math.PI / 2,
        metalness: 0.4,
        roughness: 0.24
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "microwave"
 */
export function buildMicrowaveItem(context) {
  const {
    addBoxMesh,
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
    itemHeight,
    itemDepth,
    0,
    itemHeight * 0.5,
    0,
    furnitureLightColor,
    {
      rounded: false,
      metalness: 0.12,
      roughness: 0.44
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.93,
    itemHeight * 0.82,
    0.025,
    0,
    itemHeight * 0.49,
    itemDepth * 0.515,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.16,
      roughness: 0.24
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.62,
    itemHeight * 0.63,
    0.018,
    -itemWidth * 0.13,
    itemHeight * 0.48,
    itemDepth * 0.54,
    1515819,
    {
      rounded: false,
      metalness: 0.12,
      roughness: 0.18
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.035,
    itemHeight * 0.54,
    0.03,
    itemWidth * 0.19,
    itemHeight * 0.48,
    itemDepth * 0.55,
    furnitureSoftColor,
    {
      rounded: false,
      metalness: 0.46,
      roughness: 0.22
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.17,
    itemHeight * 0.1,
    0.02,
    itemWidth * 0.36,
    itemHeight * 0.72,
    itemDepth * 0.54,
    7706534,
    {
      rounded: false,
      emissive: 7706534,
      emissiveIntensity: 0.16,
      roughness: 0.2
    }
  );
  for (const microwaveButtonHeightFactor of [0.48, 0.34, 0.2]) {
    addBoxMesh(
      itemGroup,
      itemWidth * 0.13,
      itemHeight * 0.055,
      0.018,
      itemWidth * 0.36,
      itemHeight * microwaveButtonHeightFactor,
      itemDepth * 0.545,
      furnitureSoftColor,
      {
        rounded: false,
        roughness: 0.3
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "ricecooker"
 */
export function buildRicecookerItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureDarkColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const riceCookerPotRadius = Math.min(itemWidth, itemDepth) * 0.47;
  addCylinderMesh(
    itemGroup,
    riceCookerPotRadius * 0.9,
    riceCookerPotRadius,
    itemHeight * 0.68,
    0,
    itemHeight * 0.38,
    0,
    furnitureLightColor,
    {
      segments: 36,
      roughness: 0.46
    }
  );
  addCylinderMesh(
    itemGroup,
    riceCookerPotRadius * 0.94,
    riceCookerPotRadius * 0.94,
    itemHeight * 0.12,
    0,
    itemHeight * 0.77,
    0,
    furnitureSoftColor,
    {
      segments: 36,
      roughness: 0.38
    }
  );
  addCylinderMesh(
    itemGroup,
    riceCookerPotRadius * 0.72,
    riceCookerPotRadius * 0.74,
    itemHeight * 0.035,
    0,
    itemHeight * 0.85,
    0,
    furnitureDarkColor,
    {
      segments: 32,
      metalness: 0.12,
      roughness: 0.28
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.5,
    itemHeight * 0.16,
    0.026,
    0,
    itemHeight * 0.42,
    itemDepth * 0.47,
    furnitureDarkColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.04,
      roughness: 0.28
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.24,
    itemHeight * 0.06,
    0.018,
    0,
    itemHeight * 0.43,
    itemDepth * 0.49,
    7706534,
    {
      rounded: false,
      emissive: 7706534,
      emissiveIntensity: 0.16,
      roughness: 0.2
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.05,
    itemHeight * 0.16,
    itemDepth * 0.1,
    -itemWidth * 0.27,
    itemHeight * 0.86,
    0,
    furnitureDarkColor,
    {
      roughness: 0.3
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.05,
    itemHeight * 0.16,
    itemDepth * 0.1,
    itemWidth * 0.27,
    itemHeight * 0.86,
    0,
    furnitureDarkColor,
    {
      roughness: 0.3
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.58,
    itemHeight * 0.055,
    itemDepth * 0.1,
    0,
    itemHeight * 0.94,
    0,
    furnitureDarkColor,
    {
      roughness: 0.3
    }
  );
}

/**
 * 命中：itemSpec.type === "rangehood"
 */
export function buildRangehoodItem(context) {
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
    itemWidth * 0.34,
    itemHeight * 0.72,
    itemDepth * 0.42,
    0,
    itemHeight * 0.6,
    -itemDepth * 0.18,
    furnitureColor,
    {
      rounded: false,
      metalness: 0.22,
      roughness: 0.42
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    itemHeight * 0.22,
    itemDepth,
    0,
    itemHeight * 0.18,
    0,
    furnitureLightColor,
    {
      rounded: false,
      metalness: 0.2,
      roughness: 0.4
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.9,
    itemHeight * 0.07,
    itemDepth * 0.8,
    0,
    itemHeight * 0.055,
    itemDepth * 0.02,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.35,
      roughness: 0.28
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.22,
    itemHeight * 0.035,
    0.025,
    itemWidth * 0.3,
    itemHeight * 0.2,
    itemDepth * 0.515,
    furnitureSoftColor,
    {
      rounded: false,
      emissive: furnitureSoftColor,
      emissiveIntensity: 0.12,
      roughness: 0.3
    }
  );
}

