/*
 * 物件构建器：影音与结构件
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 电视（含屏幕与挂架）、小车（含充电桩特效）、玻璃隔断、楼梯（三种）、绿植。
 */
/**
 * 命中：itemSpec.type === "smallcar"
 */
export function buildSmallcarItem(context) {
  const {
    addBoxMesh,
    addExternalItemModel,
    addVehicleChargingEffect,
    furnitureColor,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
  } = context;
  if (!addExternalItemModel(itemGroup, itemSpec)) {
    addBoxMesh(
      itemGroup,
      itemWidth * 0.96,
      itemHeight * 0.38,
      itemDepth * 0.9,
      0,
      itemHeight * 0.28,
      0,
      furnitureColor,
      {
        roughness: 0.46,
        metalness: 0.18
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 0.78,
      itemHeight * 0.42,
      itemDepth * 0.48,
      0,
      itemHeight * 0.62,
      -itemDepth * 0.03,
      furnitureSoftColor,
      {
        roughness: 0.38,
        metalness: 0.12
      }
    );
    for (const wheelOffsetRatio of [-0.48, 0.48]) {
      for (const axleOffsetRatio of [-0.3, 0.3]) {
        addBoxMesh(
          itemGroup,
          itemWidth * 0.1,
          itemHeight * 0.22,
          itemDepth * 0.17,
          wheelOffsetRatio * itemWidth,
          itemHeight * 0.17,
          axleOffsetRatio * itemDepth,
          furnitureDarkColor,
          {
            rounded: false,
            roughness: 0.82
          }
        );
      }
    }
  }
  addVehicleChargingEffect(itemGroup, itemSpec, itemWidth, itemDepth, itemHeight);
}

/**
 * 命中：STAIR_ITEM_TYPES.has(itemSpec.type)
 */
export function buildStairItem(context) {
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
  const stairStepDepth = itemDepth / 10;
  for (let stairStepIndex = 0; stairStepIndex < 10; stairStepIndex += 1) {
    const stairStepHeight = (itemHeight * (stairStepIndex + 1)) / 10;
    const stairStepZ = -itemDepth * 0.5 + stairStepDepth * (stairStepIndex + 0.5);
    addBoxMesh(
      itemGroup,
      itemWidth,
      stairStepHeight,
      stairStepDepth * 1.015,
      0,
      stairStepHeight * 0.5,
      stairStepZ,
      stairStepIndex % 2 ? furnitureColor : furnitureSoftColor,
      {
        rounded: false,
        roughness: 0.82
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 1.01,
      0.018,
      stairStepDepth * 0.94,
      0,
      stairStepHeight + 0.009,
      stairStepZ,
      furnitureLightColor,
      {
        rounded: false,
        castShadow: false,
        roughness: 0.72
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "tv"
 */
export function buildTvItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    computeTelevisionBodyMetrics,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
  } = context;
  const { bodyHeight: televisionScreenHeight, centerY: televisionBodyCenterY } =
    computeTelevisionBodyMetrics(itemSpec, itemHeight);
  const televisionBodyBottomY = televisionBodyCenterY - televisionScreenHeight * 0.5;
  if (itemSpec.tvMountStyle === "mobile") {
    const televisionNeckHeight = Math.max(itemHeight * 0.045, 0.055);
    const televisionNeckWidth = itemWidth * 0.7;
    const televisionNeckDepth = Math.max(itemDepth * 0.78, 0.3);
    const televisionStandHeight = Math.max(
      televisionBodyBottomY - televisionNeckHeight * 0.7,
      itemHeight * 0.22
    );
    const televisionStandCenterY = televisionNeckHeight * 0.7 + televisionStandHeight * 0.5;
    addBoxMesh(
      itemGroup,
      televisionNeckWidth,
      televisionNeckHeight,
      televisionNeckDepth,
      0,
      televisionNeckHeight * 0.72,
      0,
      furnitureDarkColor,
      {
        radius: Math.min(televisionNeckHeight, televisionNeckDepth) * 0.22,
        metalness: 0.18,
        roughness: 0.32
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 0.075,
      televisionStandHeight,
      Math.max(itemDepth * 0.2, 0.06),
      -itemWidth * 0.035,
      televisionStandCenterY,
      -itemDepth * 0.03,
      furnitureDarkColor,
      {
        rounded: false,
        metalness: 0.2,
        roughness: 0.3
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 0.105,
      televisionStandHeight * 0.86,
      Math.max(itemDepth * 0.12, 0.04),
      itemWidth * 0.025,
      televisionStandCenterY + televisionStandHeight * 0.02,
      itemDepth * 0.015,
      furnitureSoftColor,
      {
        rounded: false,
        metalness: 0.35,
        roughness: 0.28
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 0.34,
      Math.max(itemHeight * 0.018, 0.025),
      Math.max(itemDepth * 0.5, 0.2),
      0,
      televisionBodyBottomY * 0.76,
      itemDepth * 0.04,
      furnitureDarkColor,
      {
        radius: 0.012,
        metalness: 0.22,
        roughness: 0.3
      }
    );
    const televisionButtonRadius = Math.max(Math.min(itemWidth, itemDepth) * 0.045, 0.025);
    for (const televisionButtonOffsetX of [
      -televisionNeckWidth * 0.42,
      televisionNeckWidth * 0.42
    ]) {
      for (const televisionButtonOffsetZ of [
        -televisionNeckDepth * 0.34,
        televisionNeckDepth * 0.34
      ]) {
        addCylinderMesh(
          itemGroup,
          televisionButtonRadius,
          televisionButtonRadius,
          Math.max(televisionButtonRadius * 0.56, 0.018),
          televisionButtonOffsetX,
          televisionButtonRadius,
          televisionButtonOffsetZ,
          1448479,
          {
            segments: 20,
            rotationZ: Math.PI / 2,
            roughness: 0.38,
            metalness: 0.1
          }
        );
      }
    }
  } else if (itemSpec.tvMountStyle === "tabletop") {
    const televisionBaseHeight = Math.max(itemHeight * 0.035, 0.028);
    const televisionBaseWidth = itemWidth * 0.34;
    const televisionBaseDepth = Math.max(itemDepth * 0.72, 0.16);
    const televisionPoleHeight = Math.max(
      televisionBodyBottomY - televisionBaseHeight,
      itemHeight * 0.12
    );
    addBoxMesh(
      itemGroup,
      televisionBaseWidth,
      televisionBaseHeight,
      televisionBaseDepth,
      0,
      televisionBaseHeight * 0.5,
      0,
      furnitureDarkColor,
      {
        radius: Math.min(televisionBaseHeight, televisionBaseDepth) * 0.26,
        metalness: 0.2,
        roughness: 0.3
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 0.075,
      televisionPoleHeight,
      Math.max(itemDepth * 0.24, 0.05),
      0,
      televisionBaseHeight + televisionPoleHeight * 0.5,
      -itemDepth * 0.03,
      furnitureSoftColor,
      {
        rounded: false,
        metalness: 0.34,
        roughness: 0.28
      }
    );
    addBoxMesh(
      itemGroup,
      itemWidth * 0.18,
      Math.max(itemHeight * 0.025, 0.022),
      Math.max(itemDepth * 0.34, 0.08),
      0,
      televisionBodyBottomY,
      0,
      furnitureDarkColor,
      {
        radius: 0.008,
        metalness: 0.22,
        roughness: 0.3
      }
    );
  }
  addBoxMesh(
    itemGroup,
    itemWidth,
    televisionScreenHeight,
    Math.max(itemDepth * 0.28, 0.05),
    0,
    televisionBodyCenterY,
    0,
    furnitureDarkColor,
    {
      radius: Math.min(itemWidth, televisionScreenHeight) * 0.012,
      roughness: 0.28
    }
  );
}

/**
 * 命中：itemSpec.type === "glasspartition"
 */
export function buildGlasspartitionItem(context) {
  const {
    addBoxMesh,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemWidth,
    threeModuleMin,
  } = context;
  const glassPartitionFrameThickness = Math.min(Math.max(itemWidth * 0.018, 0.018), 0.035);
  const glassPartitionPanelDepth = Math.max(itemDepth, 0.045);
  const glassPartitionInnerWidth = Math.max(
    itemWidth - glassPartitionFrameThickness * 2.4,
    glassPartitionFrameThickness
  );
  const glassPartitionInnerHeight = Math.max(
    itemHeight - glassPartitionFrameThickness * 2.4,
    glassPartitionFrameThickness
  );
  const glassPartitionPanelOptions = {
    rounded: false,
    metalness: 0.58,
    roughness: 0.24,
    castShadow: false,
    receiveShadow: false
  };
  addBoxMesh(
    itemGroup,
    glassPartitionInnerWidth,
    glassPartitionInnerHeight,
    Math.max(itemDepth * 0.24, 0.012),
    0,
    itemHeight * 0.5,
    0,
    itemPalette.glass,
    {
      rounded: false,
      transparent: true,
      opacity: 0.24,
      depthWrite: false,
      side: threeModuleMin.DoubleSide,
      metalness: 0.04,
      roughness: 0.08,
      castShadow: false,
      receiveShadow: false,
      renderOrder: 6
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    glassPartitionFrameThickness,
    glassPartitionPanelDepth,
    0,
    glassPartitionFrameThickness * 0.5,
    0,
    itemPalette.frame,
    glassPartitionPanelOptions
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    glassPartitionFrameThickness,
    glassPartitionPanelDepth,
    0,
    itemHeight - glassPartitionFrameThickness * 0.5,
    0,
    itemPalette.frame,
    glassPartitionPanelOptions
  );
  addBoxMesh(
    itemGroup,
    glassPartitionFrameThickness,
    itemHeight,
    glassPartitionPanelDepth,
    -itemWidth * 0.5 + glassPartitionFrameThickness * 0.5,
    itemHeight * 0.5,
    0,
    itemPalette.frame,
    glassPartitionPanelOptions
  );
  addBoxMesh(
    itemGroup,
    glassPartitionFrameThickness,
    itemHeight,
    glassPartitionPanelDepth,
    itemWidth * 0.5 - glassPartitionFrameThickness * 0.5,
    itemHeight * 0.5,
    0,
    itemPalette.frame,
    glassPartitionPanelOptions
  );
  for (const glassPartitionHandleOffsetX of [-itemWidth * 0.34, itemWidth * 0.34]) {
    addBoxMesh(
      itemGroup,
      glassPartitionFrameThickness * 1.7,
      glassPartitionFrameThickness * 2.2,
      glassPartitionPanelDepth * 1.18,
      glassPartitionHandleOffsetX,
      glassPartitionFrameThickness * 1.3,
      0,
      furnitureSoftColor,
      glassPartitionPanelOptions
    );
  }
}

/**
 * 命中：itemSpec.type === "plant"
 */
export function buildPlantItem(context) {
  const {
    addCylinderMesh,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemWidth,
    threeModuleMin,
  } = context;
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.25,
    itemWidth * 0.21,
    itemHeight * 0.22,
    0,
    itemHeight * 0.11,
    0,
    furnitureSoftColor,
    {
      segments: 24,
      roughness: 0.82
    }
  );
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.22,
    itemWidth * 0.22,
    0.035,
    0,
    itemHeight * 0.22,
    0,
    furnitureDarkColor,
    {
      segments: 24,
      roughness: 0.96
    }
  );
  const plantStemCurves = [
    [
      new threeModuleMin.Vector3(0, itemHeight * 0.21, 0),
      new threeModuleMin.Vector3(-itemWidth * 0.06, itemHeight * 0.58, 0),
      new threeModuleMin.Vector3(-itemWidth * 0.27, itemHeight * 0.78, 0)
    ],
    [
      new threeModuleMin.Vector3(itemWidth * 0.03, itemHeight * 0.21, 0),
      new threeModuleMin.Vector3(itemWidth * 0.06, itemHeight * 0.64, 0),
      new threeModuleMin.Vector3(itemWidth * 0.12, itemHeight * 0.94, 0)
    ],
    [
      new threeModuleMin.Vector3(0, itemHeight * 0.28, 0),
      new threeModuleMin.Vector3(itemWidth * 0.18, itemHeight * 0.62, 0),
      new threeModuleMin.Vector3(itemWidth * 0.31, itemHeight * 0.79, 0)
    ]
  ];
  for (const plantStemCurve of plantStemCurves) {
    const plantStemMesh = new threeModuleMin.Mesh(
      new threeModuleMin.TubeGeometry(
        new threeModuleMin.CatmullRomCurve3(plantStemCurve),
        20,
        0.014,
        7,
        false
      ),
      new threeModuleMin.MeshStandardMaterial({
        color: furnitureDarkColor,
        roughness: 0.86
      })
    );
    plantStemMesh.castShadow = true;
    itemGroup.add(plantStemMesh);
  }
  const plantLeafSpecs = [
    [-0.27, 0.78, 0],
    [-0.1, 0.61, 0.02],
    [0.12, 0.94, 0],
    [0.31, 0.79, 0],
    [0.18, 0.63, -0.02],
    [0.02, 0.46, 0.03]
  ];
  for (const [plantLeafOffsetX, plantLeafOffsetY, plantLeafOffsetZ] of plantLeafSpecs) {
    for (let plantLeafIndex = 0; plantLeafIndex < 5; plantLeafIndex += 1) {
      const plantLeafAngle = (plantLeafIndex / 5) * Math.PI * 2;
      const plantLeafMesh = new threeModuleMin.Mesh(
        new threeModuleMin.SphereGeometry(0.5, 10, 6),
        new threeModuleMin.MeshStandardMaterial({
          color: plantLeafIndex % 2 ? 7835779 : 6257261,
          roughness: 0.9
        })
      );
      // 暖阳原木：叶片放大到 1.85 倍，同株植物的体量更饱满，
      // 不必新增模型资源就能让绿植在暖色背景里站得住。
      const plantLeafScale = itemPalette.warmWood ? 1.85 : 1;
      plantLeafMesh.scale.set(
        itemWidth * 0.045 * plantLeafScale,
        itemHeight * 0.085 * plantLeafScale,
        itemDepth * 0.025 * plantLeafScale
      );
      plantLeafMesh.position.set(
        itemWidth * plantLeafOffsetX + Math.cos(plantLeafAngle) * itemWidth * 0.08,
        itemHeight * plantLeafOffsetY + Math.sin(plantLeafAngle) * itemHeight * 0.035,
        itemDepth * plantLeafOffsetZ + Math.sin(plantLeafAngle) * itemDepth * 0.06
      );
      plantLeafMesh.rotation.z = plantLeafAngle - Math.PI / 2;
      plantLeafMesh.rotation.y = plantLeafAngle * 0.6;
      plantLeafMesh.castShadow = true;
      itemGroup.add(plantLeafMesh);
    }
  }
}

