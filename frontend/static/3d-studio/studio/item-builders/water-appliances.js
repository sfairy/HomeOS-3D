/*
 * 物件构建器：用水与热水设备
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 用水与热水的设备、洗烘一体机、茶吧机、鱼缸。
 */
/**
 * 命中：itemSpec.type === "aquarium"
 */
export function buildAquariumItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemWidth,
    threeModuleMin,
  } = context;
  const aquariumTankHeight = Math.max(itemHeight * 0.52, 0.45);
  const aquariumTankCenterY = aquariumTankHeight;
  const aquariumGlassHeight = Math.max(itemHeight - aquariumTankHeight, 0.2);
  const aquariumGlassThickness = Math.min(
    Math.max(Math.min(itemWidth, itemDepth) * 0.025, 0.012),
    0.028
  );
  const aquariumGlassOptions = {
    rounded: false,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
    side: threeModuleMin.DoubleSide,
    roughness: 0.06,
    metalness: 0.02,
    castShadow: false,
    receiveShadow: false,
    renderOrder: 6
  };
  addBoxMesh(
    itemGroup,
    itemWidth,
    aquariumTankHeight,
    itemDepth,
    0,
    aquariumTankHeight * 0.5,
    0,
    furnitureColor,
    {
      rounded: false,
      roughness: 0.56
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    0.035,
    itemDepth,
    0,
    aquariumTankHeight,
    0,
    itemPalette.frame,
    {
      rounded: false,
      metalness: 0.34,
      roughness: 0.3
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth - aquariumGlassThickness * 2,
    aquariumGlassHeight,
    aquariumGlassThickness,
    0,
    aquariumTankCenterY + aquariumGlassHeight * 0.5,
    -itemDepth * 0.5 + aquariumGlassThickness * 0.5,
    itemPalette.glass,
    aquariumGlassOptions
  );
  addBoxMesh(
    itemGroup,
    itemWidth - aquariumGlassThickness * 2,
    aquariumGlassHeight,
    aquariumGlassThickness,
    0,
    aquariumTankCenterY + aquariumGlassHeight * 0.5,
    itemDepth * 0.5 - aquariumGlassThickness * 0.5,
    itemPalette.glass,
    aquariumGlassOptions
  );
  addBoxMesh(
    itemGroup,
    aquariumGlassThickness,
    aquariumGlassHeight,
    itemDepth - aquariumGlassThickness * 2,
    -itemWidth * 0.5 + aquariumGlassThickness * 0.5,
    aquariumTankCenterY + aquariumGlassHeight * 0.5,
    0,
    itemPalette.glass,
    aquariumGlassOptions
  );
  addBoxMesh(
    itemGroup,
    aquariumGlassThickness,
    aquariumGlassHeight,
    itemDepth - aquariumGlassThickness * 2,
    itemWidth * 0.5 - aquariumGlassThickness * 0.5,
    aquariumTankCenterY + aquariumGlassHeight * 0.5,
    0,
    itemPalette.glass,
    aquariumGlassOptions
  );
}

/**
 * 命中：itemSpec.type === "storagewaterheater"
 */
export function buildStoragewaterheaterItem(context) {
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
  const waterHeaterTankRadius = Math.min(itemDepth * 0.43, itemHeight * 0.44);
  const waterHeaterTankCenterY = itemHeight * 0.52;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.78,
    itemHeight * 0.12,
    itemDepth * 0.22,
    0,
    itemHeight * 0.1,
    -itemDepth * 0.36,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.55,
      roughness: 0.3
    }
  );
  addCylinderMesh(
    itemGroup,
    waterHeaterTankRadius,
    waterHeaterTankRadius,
    itemWidth * 0.82,
    0,
    waterHeaterTankCenterY,
    0,
    furnitureLightColor,
    {
      segments: 36,
      rotationZ: Math.PI / 2,
      metalness: 0.2,
      roughness: 0.42
    }
  );
  for (const waterHeaterTankCapOffsetX of [-itemWidth * 0.43, itemWidth * 0.43]) {
    addCylinderMesh(
      itemGroup,
      waterHeaterTankRadius * 1.03,
      waterHeaterTankRadius * 1.03,
      0.025,
      waterHeaterTankCapOffsetX,
      waterHeaterTankCenterY,
      0,
      furnitureSoftColor,
      {
        segments: 36,
        rotationZ: Math.PI / 2,
        metalness: 0.28,
        roughness: 0.34
      }
    );
  }
  addBoxMesh(
    itemGroup,
    itemWidth * 0.31,
    itemHeight * 0.23,
    0.026,
    0,
    itemHeight * 0.51,
    itemDepth * 0.44,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.18,
      roughness: 0.25
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.16,
    itemHeight * 0.045,
    0.018,
    0,
    itemHeight * 0.58,
    itemDepth * 0.46,
    7706534,
    {
      rounded: false,
      emissive: 7706534,
      emissiveIntensity: 0.18,
      roughness: 0.2
    }
  );
  for (const waterHeaterFootOffsetX of [-itemWidth * 0.28, itemWidth * 0.28]) {
    addCylinderMesh(
      itemGroup,
      0.022,
      0.022,
      itemHeight * 0.16,
      waterHeaterFootOffsetX,
      itemHeight * 0.08,
      itemDepth * 0.12,
      waterHeaterFootOffsetX < 0 ? 4885698 : 12868184,
      {
        segments: 18,
        metalness: 0.55,
        roughness: 0.24
      }
    );
    addCylinderMesh(
      itemGroup,
      0.04,
      0.04,
      0.028,
      waterHeaterFootOffsetX,
      0.015,
      itemDepth * 0.12,
      furnitureDarkColor,
      {
        segments: 20,
        metalness: 0.45,
        roughness: 0.28
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "gaswaterheater"
 */
export function buildGaswaterheaterItem(context) {
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
  const gasWaterHeaterBodyHeight = itemHeight * 0.82;
  addBoxMesh(
    itemGroup,
    itemWidth,
    gasWaterHeaterBodyHeight,
    itemDepth,
    0,
    itemHeight * 0.47,
    0,
    furnitureLightColor,
    {
      rounded: false,
      metalness: 0.12,
      roughness: 0.46
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.86,
    gasWaterHeaterBodyHeight * 0.42,
    0.026,
    0,
    itemHeight * 0.55,
    itemDepth * 0.515,
    furnitureSoftColor,
    {
      rounded: false,
      roughness: 0.36
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.44,
    gasWaterHeaterBodyHeight * 0.18,
    0.018,
    0,
    itemHeight * 0.67,
    itemDepth * 0.54,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.14,
      roughness: 0.22
    }
  );
  for (
    let gasWaterHeaterVentIndex = 0;
    gasWaterHeaterVentIndex < 5;
    gasWaterHeaterVentIndex += 1
  ) {
    addBoxMesh(
      itemGroup,
      itemWidth * 0.62,
      0.012,
      0.02,
      0,
      itemHeight * (0.24 + gasWaterHeaterVentIndex * 0.07),
      itemDepth * 0.525,
      furnitureDarkColor,
      {
        rounded: false,
        roughness: 0.3
      }
    );
  }
  addCylinderMesh(
    itemGroup,
    itemDepth * 0.17,
    itemDepth * 0.17,
    itemHeight * 0.18,
    0,
    itemHeight * 0.91,
    0,
    furnitureDarkColor,
    {
      segments: 24,
      metalness: 0.58,
      roughness: 0.24
    }
  );
  addCylinderMesh(
    itemGroup,
    itemDepth * 0.22,
    itemDepth * 0.22,
    0.035,
    0,
    itemHeight * 0.84,
    0,
    furnitureSoftColor,
    {
      segments: 24,
      metalness: 0.5,
      roughness: 0.25
    }
  );
  for (const [gasWaterHeaterKnobOffsetX, gasWaterHeaterKnobColor] of [
    [-itemWidth * 0.28, 4885698],
    [0, 9410205],
    [itemWidth * 0.28, 12868184]
  ]) {
    addCylinderMesh(
      itemGroup,
      0.018,
      0.018,
      itemHeight * 0.18,
      gasWaterHeaterKnobOffsetX,
      itemHeight * 0.09,
      itemDepth * 0.12,
      gasWaterHeaterKnobColor,
      {
        segments: 18,
        metalness: 0.62,
        roughness: 0.22
      }
    );
    addCylinderMesh(
      itemGroup,
      0.034,
      0.034,
      0.025,
      gasWaterHeaterKnobOffsetX,
      0.014,
      itemDepth * 0.12,
      furnitureDarkColor,
      {
        segments: 18,
        metalness: 0.5,
        roughness: 0.25
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "pipelinewaterpurifier"
 */
export function buildPipelinewaterpurifierItem(context) {
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
  const waterPurifierBodyHeight = itemHeight * 0.9;
  addBoxMesh(
    itemGroup,
    itemWidth,
    waterPurifierBodyHeight,
    itemDepth,
    0,
    waterPurifierBodyHeight * 0.5,
    0,
    furnitureLightColor,
    {
      rounded: false,
      metalness: 0.04,
      roughness: 0.4
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.92,
    waterPurifierBodyHeight * 0.27,
    0.028,
    0,
    itemHeight * 0.76,
    itemDepth * 0.515,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.16,
      roughness: 0.18
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.34,
    waterPurifierBodyHeight * 0.045,
    0.014,
    -itemWidth * 0.08,
    itemHeight * 0.79,
    itemDepth * 0.54,
    10470608,
    {
      rounded: false,
      emissive: 10470608,
      emissiveIntensity: 0.2,
      roughness: 0.22
    }
  );
  for (const waterPurifierOutletOffsetFactor of [-0.26, 0, 0.26]) {
    addCylinderMesh(
      itemGroup,
      Math.min(itemWidth, itemDepth) * 0.055,
      Math.min(itemWidth, itemDepth) * 0.055,
      0.018,
      itemWidth * waterPurifierOutletOffsetFactor,
      itemHeight * 0.66,
      itemDepth * 0.535,
      furnitureSoftColor,
      {
        segments: 24,
        rotationX: Math.PI / 2,
        metalness: 0.22,
        roughness: 0.28
      }
    );
  }
  for (const waterPurifierPipeOffsetX of [-itemWidth * 0.2, itemWidth * 0.2]) {
    addCylinderMesh(
      itemGroup,
      0.014,
      0.014,
      itemHeight * 0.12,
      waterPurifierPipeOffsetX,
      itemHeight * 0.49,
      itemDepth * 0.48,
      furnitureDarkColor,
      {
        segments: 18,
        metalness: 0.46,
        roughness: 0.22
      }
    );
    addCylinderMesh(
      itemGroup,
      0.024,
      0.018,
      0.035,
      waterPurifierPipeOffsetX,
      itemHeight * 0.425,
      itemDepth * 0.52,
      furnitureDarkColor,
      {
        segments: 18,
        rotationX: Math.PI / 2,
        metalness: 0.46,
        roughness: 0.22
      }
    );
  }
  addBoxMesh(
    itemGroup,
    itemWidth * 0.68,
    itemHeight * 0.045,
    itemDepth * 0.52,
    0,
    itemHeight * 0.11,
    itemDepth * 0.16,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.2,
      roughness: 0.3
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.42,
    0.028,
    itemDepth * 0.28,
    0,
    itemHeight * 0.16,
    itemDepth * 0.28,
    furnitureSoftColor,
    {
      rounded: false,
      roughness: 0.34
    }
  );
}

/**
 * 命中：itemSpec.type === "tea_bar_machine"
 */
export function buildTeaBarMachineItem(context) {
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
  const teaBarMachineBodyHeight = itemHeight * 0.67;
  const teaBarMachineCounterTopY = teaBarMachineBodyHeight + itemHeight * 0.045;
  const teaBarMachineUpperSectionHeight = itemHeight - teaBarMachineCounterTopY;
  addBoxMesh(
    itemGroup,
    itemWidth,
    teaBarMachineBodyHeight,
    itemDepth,
    0,
    teaBarMachineBodyHeight * 0.5,
    0,
    furnitureLightColor,
    {
      rounded: false,
      roughness: 0.5,
      metalness: 0.04
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.94,
    0.028,
    itemDepth * 1.02,
    0,
    teaBarMachineBodyHeight * 0.5,
    itemDepth * 0.515,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.34
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.94,
    0.032,
    itemDepth * 1.02,
    0,
    teaBarMachineBodyHeight,
    0,
    furnitureSoftColor,
    {
      rounded: false,
      roughness: 0.42
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.94,
    itemHeight * 0.04,
    itemDepth * 1.04,
    0,
    teaBarMachineCounterTopY,
    0,
    furnitureLightColor,
    {
      rounded: false,
      roughness: 0.36,
      metalness: 0.1
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.92,
    teaBarMachineUpperSectionHeight,
    0.032,
    0,
    teaBarMachineCounterTopY + teaBarMachineUpperSectionHeight * 0.5,
    -itemDepth * 0.46,
    furnitureSoftColor,
    {
      rounded: false,
      roughness: 0.56
    }
  );
  for (const teaBarMachineSidePanelOffsetX of [-itemWidth * 0.46, itemWidth * 0.46]) {
    addBoxMesh(
      itemGroup,
      itemWidth * 0.075,
      teaBarMachineUpperSectionHeight,
      itemDepth * 0.78,
      teaBarMachineSidePanelOffsetX,
      teaBarMachineCounterTopY + teaBarMachineUpperSectionHeight * 0.5,
      0,
      furnitureLightColor,
      {
        rounded: false,
        roughness: 0.48
      }
    );
  }
  addBoxMesh(
    itemGroup,
    itemWidth * 0.86,
    itemHeight * 0.14,
    itemDepth * 0.18,
    0,
    itemHeight * 0.9,
    itemDepth * 0.48,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.32,
      roughness: 0.22
    }
  );
  for (const teaBarMachineBottleOffsetX of [-itemWidth * 0.22, itemWidth * 0.22]) {
    addCylinderMesh(
      itemGroup,
      Math.min(itemWidth, itemDepth) * 0.035,
      Math.min(itemWidth, itemDepth) * 0.035,
      0.018,
      teaBarMachineBottleOffsetX,
      itemHeight * 0.9,
      itemDepth * 0.585,
      furnitureSoftColor,
      {
        segments: 20,
        rotationX: Math.PI / 2,
        metalness: 0.2,
        roughness: 0.25
      }
    );
    addCylinderMesh(
      itemGroup,
      0.012,
      0.012,
      itemHeight * 0.11,
      teaBarMachineBottleOffsetX,
      itemHeight * 0.79,
      itemDepth * 0.5,
      furnitureDarkColor,
      {
        segments: 18,
        metalness: 0.48,
        roughness: 0.22
      }
    );
    const teaBarMachineCupRadius = Math.min(itemWidth, itemDepth) * 0.16;
    addCylinderMesh(
      itemGroup,
      teaBarMachineCupRadius * 0.9,
      teaBarMachineCupRadius,
      itemHeight * 0.13,
      teaBarMachineBottleOffsetX,
      itemHeight * 0.75,
      itemDepth * 0.12,
      teaBarMachineBottleOffsetX < 0 ? 8752009 : furnitureSoftColor,
      {
        segments: 28,
        metalness: 0.08,
        roughness: 0.34
      }
    );
    addCylinderMesh(
      itemGroup,
      teaBarMachineCupRadius * 0.84,
      teaBarMachineCupRadius * 0.84,
      0.016,
      teaBarMachineBottleOffsetX,
      itemHeight * 0.82,
      itemDepth * 0.12,
      furnitureDarkColor,
      {
        segments: 28,
        metalness: 0.18,
        roughness: 0.28
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 0.12,
      itemHeight * 0.06,
      0.016,
      teaBarMachineBottleOffsetX,
      itemHeight * 0.77,
      itemDepth * 0.3,
      furnitureDarkColor,
      {
        radius: 0.012,
        metalness: 0.24,
        roughness: 0.24
      }
    );
  }
  addBoxMesh(
    itemGroup,
    itemWidth * 0.92,
    itemHeight * 0.055,
    itemDepth * 0.82,
    0,
    0.028,
    0,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.36
    }
  );
}

/**
 * 命中：itemSpec.type === "washer" || itemSpec.type === "dryer"
 */
export function buildWasherDryerItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureDarkColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
  } = context;
  const isDryerItem = itemSpec.type === "dryer";
  const washerDrumRadius = itemWidth * (isDryerItem ? 0.32 : 0.29);
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
      metalness: 0.1,
      roughness: 0.48
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.92,
    itemHeight * 0.18,
    0.035,
    0,
    itemHeight * 0.86,
    itemDepth * 0.505,
    furnitureSoftColor,
    {
      rounded: false,
      roughness: 0.4
    }
  );
  addCylinderMesh(
    itemGroup,
    washerDrumRadius,
    washerDrumRadius,
    0.045,
    0,
    itemHeight * 0.47,
    itemDepth * 0.515,
    furnitureDarkColor,
    {
      segments: 40,
      rotationX: Math.PI / 2,
      metalness: 0.32,
      roughness: 0.28
    }
  );
  addCylinderMesh(
    itemGroup,
    washerDrumRadius * 0.74,
    washerDrumRadius * 0.74,
    0.03,
    0,
    itemHeight * 0.47,
    itemDepth * 0.545,
    isDryerItem ? 2502715 : 3622485,
    {
      segments: 40,
      rotationX: Math.PI / 2,
      metalness: 0.08,
      roughness: 0.22
    }
  );
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.055,
    itemWidth * 0.055,
    0.035,
    itemWidth * 0.27,
    itemHeight * 0.86,
    itemDepth * 0.535,
    furnitureDarkColor,
    {
      segments: 24,
      rotationX: Math.PI / 2,
      metalness: 0.4,
      roughness: 0.25
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.25,
    itemHeight * 0.035,
    0.026,
    -itemWidth * 0.23,
    itemHeight * 0.86,
    itemDepth * 0.535,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.3
    }
  );
  if (!isDryerItem) {
    addBoxMesh(
      itemGroup,
      itemWidth * 0.2,
      itemHeight * 0.055,
      0.025,
      -itemWidth * 0.3,
      itemHeight * 0.12,
      itemDepth * 0.525,
      furnitureSoftColor,
      {
        rounded: false,
        roughness: 0.42
      }
    );
  }
}

