/*
 * 物件构建器：窗帘与灯具
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 轨道帘（自带收尾、命中即返回模型组）、卷帘（同为自带收尾）、普通帘、灯带/筒灯/吸顶灯、壁灯、落地灯。
 * 窗帘的布料配色与暖阳主题补偿、灯具的预编译登记都在这一支里。
 */
/**
 * 命中：itemSpec.type === "curtain" && itemSpec.offlineModelExport !== true
 */
export function buildTrackCurtainItem(context) {
  const {
    addTrackCurtain,
    furnitureDarkColor,
    furnitureLightColor,
    highlightSelectedModel,
    isSelected,
    itemGroup,
    itemPalette,
    itemSpec,
    threeModuleMin,
  } = context;
  addTrackCurtain(threeModuleMin, itemGroup, itemSpec, {
    dark: furnitureDarkColor,
    light: furnitureLightColor
  });
  if (itemPalette.warmFurniture) {
    // 暖阳原木：轨道帘的布帘统一换成暖米白并整体补一点自发光 ——
    // 主题下各面料贴图原本的色差会被冲淡，颜色对齐后整幅帘子才像同一套色系。
    itemGroup.traverse(curtainPartNode => {
      if (curtainPartNode.userData.curtainPart === "cloth" && curtainPartNode.material) {
        curtainPartNode.material.color.set(16776696);
        curtainPartNode.material.emissive = new threeModuleMin.Color(16776696);
        curtainPartNode.material.emissiveIntensity = 0.38;
      }
    });
  }
  highlightSelectedModel(itemGroup, isSelected("item", itemSpec.id));
  return itemGroup;
}

/**
 * 命中：itemSpec.type === "curtain" && itemSpec.offlineModelExport !== true && resolveCurtainForm(itemSpec) === "roller"
 *
 * 卷帘走专用支路，而不是塞进轨道帘：两者几何完全不同（卷帘无轨道、无左右分片、无褶皱），
 * 放在同一条 if 里只会让 addTrackCurtain 里到处是「如果是卷帘就跳过」。
 * 分派表里这条排在轨道帘之前，因此卷帘不会被轨道帘那条（terminal）先命中。
 */
export function buildRollerCurtainItem(context) {
  const {
    addRollerCurtain,
    furnitureDarkColor,
    highlightSelectedModel,
    isSelected,
    itemGroup,
    itemPalette,
    itemSpec,
    threeModuleMin
  } = context;
  addRollerCurtain(threeModuleMin, itemGroup, itemSpec, {
    // 布面取 rollerCurtain 这一档：默认家居色卡与逐物件材质风格（CURTAIN_STYLES）都备好了该键，
    // 缺省时退回轨道帘用的 furnitureLight，保证非家居调色板下也有一个合理布色。
    light: itemPalette.rollerCurtain ?? itemPalette.furnitureLight,
    dark: furnitureDarkColor
  });
  if (itemPalette.warmFurniture) {
    // 与轨道帘同一套暖阳处理：卷帘的布面（放下的平面与卷起的布卷）统一换成暖米白并整体补一点自发光，
    // 让同一扇窗上的两种帘型在暖阳主题下是同一色系；五金件（底杆 / 支架）不在此列，保持家具深色。
    itemGroup.traverse(curtainPartNode => {
      if (curtainPartNode.userData.curtainPart === "cloth" && curtainPartNode.material) {
        curtainPartNode.material.color.set(16776696);
        curtainPartNode.material.emissive = new threeModuleMin.Color(16776696);
        curtainPartNode.material.emissiveIntensity = 0.38;
      }
    });
  }
  highlightSelectedModel(itemGroup, isSelected("item", itemSpec.id));
  return itemGroup;
}

/**
 * 命中：LIGHT_ITEM_TYPES.has(itemSpec.type)
 */
export function buildLightItem(context) {
  const {
    addLightFixtureToScene,
    addStripLightPreview,
    itemGroup,
    itemSpec,
    prewarmLightIdSet,
  } = context;
  addLightFixtureToScene(itemGroup, itemSpec, prewarmLightIdSet);
  addStripLightPreview(itemGroup, itemSpec);
}

/**
 * 命中：itemSpec.type === "curtain"
 */
export function buildCurtainItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureDarkColor,
    furnitureLightColor,
    isStageViewerMode,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
  } = context;
  const curtainPlacementMode = ["left", "right", "split"].includes(itemSpec.curtainPosition)
    ? itemSpec.curtainPosition
    : "split";
  const curtainChildCountBefore = itemGroup.children.length;
  if (isStageViewerMode) {
    itemGroup.userData.curtainRigRoot = true;
    itemGroup.userData.curtainRigBasis = [itemWidth, itemHeight, itemDepth];
  }
  const railRadius = Math.min(Math.max(itemDepth * 0.09, 0.012), 0.028);
  const railCenterY = itemHeight - railRadius * 1.8;
  const curtainTopY = railCenterY - railRadius * 1.8;
  const curtainBottomMargin = Math.max(itemHeight * 0.025, 0.025);
  const curtainClothHeight = Math.max(curtainTopY - curtainBottomMargin, itemHeight * 0.72);
  addCylinderMesh(
    itemGroup,
    railRadius,
    railRadius,
    itemWidth * 1.06,
    0,
    railCenterY,
    0,
    furnitureDarkColor,
    {
      segments: 18,
      rotationZ: Math.PI / 2,
      metalness: 0.68,
      roughness: 0.22
    }
  );
  for (const railEndX of [-itemWidth * 0.52, itemWidth * 0.52]) {
    addCylinderMesh(
      itemGroup,
      railRadius * 1.45,
      railRadius * 1.45,
      railRadius * 0.9,
      railEndX,
      railCenterY,
      0,
      furnitureLightColor,
      {
        segments: 18,
        rotationZ: Math.PI / 2,
        metalness: 0.52,
        roughness: 0.26
      }
    );
  }
  /**
   * 铺开一片窗帘布：7 道褶皱 + 上下两根横向压条。褶皱固定 7 道，宽度按片宽的 1/7 均分；相邻褶皱前后交错 ±10% 深度，每道再比
   * 均分宽度宽 1.24 倍，形成叠压感。上下压条分别压住布顶与布中，让布片看起来是挂在轨道上的。
   * @param {number} curtainPanelStartX 该片布的起始 X（米）。
   */
  const addCurtainPanel = (curtainPanelStartX, panelWidth) => {
    const pleatWidth = panelWidth / 7;
    for (let pleatIndex = 0; pleatIndex < 7; pleatIndex += 1) {
      const pleatX = curtainPanelStartX + pleatWidth * (pleatIndex + 0.5);
      const pleatZ = pleatIndex % 2 === 0 ? itemDepth * 0.1 : -itemDepth * 0.1;
      addBoxMesh(
        itemGroup,
        pleatWidth * 1.24,
        curtainClothHeight,
        itemDepth * 0.62,
        pleatX,
        curtainBottomMargin + curtainClothHeight * 0.5,
        pleatZ,
        furnitureLightColor,
        {
          radius: Math.min(pleatWidth * 0.34, 0.035),
          roughness: 0.94,
          metalness: 0
        }
      );
    }
    addBoxMesh(
      itemGroup,
      panelWidth * 1.03,
      Math.max(itemHeight * 0.018, 0.025),
      itemDepth * 0.74,
      curtainPanelStartX + panelWidth * 0.5,
      curtainBottomMargin + itemHeight * 0.015,
      0,
      furnitureDarkColor,
      {
        radius: 0.01,
        roughness: 0.72,
        metalness: 0.02
      }
    );
    addBoxMesh(
      itemGroup,
      panelWidth * 1.06,
      Math.max(itemHeight * 0.025, 0.035),
      itemDepth * 0.82,
      curtainPanelStartX + panelWidth * 0.5,
      curtainBottomMargin + curtainClothHeight * 0.52,
      0,
      furnitureLightColor,
      {
        radius: 0.012,
        roughness: 0.48,
        metalness: 0.08
      }
    );
  };
  if (curtainPlacementMode === "left") {
    addCurtainPanel(-itemWidth * 0.5, itemWidth * 0.24);
  } else if (curtainPlacementMode === "right") {
    addCurtainPanel(itemWidth * 0.26, itemWidth * 0.24);
  } else {
    addCurtainPanel(-itemWidth * 0.5, itemWidth * 0.16);
    addCurtainPanel(itemWidth * 0.34, itemWidth * 0.16);
  }
  if (isStageViewerMode) {
    itemGroup.children
      .slice(curtainChildCountBefore)
      .forEach((curtainPartNode, curtainPartIndex) => {
        curtainPartNode.userData.curtainPart =
          curtainPartIndex === 0
            ? "rod"
            : curtainPartIndex < 3
              ? "cap"
              : (curtainPartIndex - 3) % 9 < 7
                ? "cloth"
                : "band";
      });
  }
}

/**
 * 命中：itemSpec.type === "walllamp"
 */
export function buildWalllampItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureLightColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemWidth,
    threeModuleMin,
  } = context;
  const wallLampMountZ = -itemDepth * 0.5 + 0.018;
  const wallLampShadeOptions = {
    rounded: false,
    metalness: 0.64,
    roughness: 0.22
  };
  addBoxMesh(
    itemGroup,
    itemWidth * 0.68,
    itemHeight * 0.5,
    0.035,
    0,
    itemHeight * 0.52,
    wallLampMountZ,
    itemPalette.furniture,
    {
      radius: 0.02,
      metalness: 0.18,
      roughness: 0.46
    }
  );
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.11,
    itemWidth * 0.11,
    0.035,
    0,
    itemHeight * 0.57,
    wallLampMountZ - 0.012,
    itemPalette.furnitureSoft,
    {
      segments: 24,
      rotationX: Math.PI / 2,
      metalness: 0.3,
      roughness: 0.34
    }
  );
  addBoxMesh(
    itemGroup,
    0.04,
    itemHeight * 0.2,
    itemDepth * 0.28,
    0,
    itemHeight * 0.57,
    -itemDepth * 0.3,
    itemPalette.furniture,
    {
      ...wallLampShadeOptions,
      metalness: 0.18,
      roughness: 0.46
    }
  );
  const wallLampMesh = new threeModuleMin.Mesh(
    new threeModuleMin.CylinderGeometry(
      itemWidth * 0.3,
      itemWidth * 0.19,
      itemHeight * 0.38,
      24,
      1,
      true
    ),
    new threeModuleMin.MeshStandardMaterial({
      color: furnitureLightColor,
      roughness: 0.3,
      metalness: 0.04,
      emissive: 16767386,
      emissiveIntensity: 0.24,
      side: threeModuleMin.DoubleSide
    })
  );
  wallLampMesh.position.set(0, itemHeight * 0.4, -itemDepth * 0.16);
  wallLampMesh.castShadow = true;
  wallLampMesh.receiveShadow = true;
  itemGroup.add(wallLampMesh);
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.15,
    itemWidth * 0.15,
    0.025,
    0,
    itemHeight * 0.19,
    -itemDepth * 0.16,
    16769707,
    {
      segments: 24,
      emissive: 16760156,
      emissiveIntensity: 0.38,
      roughness: 0.24
    }
  );
}

/**
 * 命中：itemSpec.type === "floorlamp"
 */
export function buildFloorlampItem(context) {
  const {
    addCylinderMesh,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
    threeModuleMin,
  } = context;
  const floorLampBaseX = -itemWidth * 0.34;
  const floorLampHeadX = itemWidth * 0.31;
  const floorLampBaseRadius = Math.min(itemWidth * 0.13, itemDepth * 0.34);
  const floorLampShadeRadius = Math.min(itemWidth * 0.18, itemDepth * 0.46);
  const floorLampShadeHeight = itemHeight * 0.115;
  const floorLampHeadY = itemHeight * 0.76;
  const floorLampShadeCenterY = floorLampHeadY + floorLampShadeHeight;
  addCylinderMesh(
    itemGroup,
    floorLampBaseRadius * 0.82,
    floorLampBaseRadius,
    0.045,
    floorLampBaseX,
    0.0225,
    0,
    furnitureDarkColor,
    {
      segments: 32,
      metalness: 0.38,
      roughness: 0.3
    }
  );
  const floorLampArmCurve = new threeModuleMin.CubicBezierCurve3(
    new threeModuleMin.Vector3(floorLampBaseX, 0.045, 0),
    new threeModuleMin.Vector3(floorLampBaseX, itemHeight * 0.72, 0),
    new threeModuleMin.Vector3(itemWidth * 0.02, itemHeight * 1.01, 0),
    new threeModuleMin.Vector3(floorLampHeadX, floorLampShadeCenterY, 0)
  );
  const floorLampArmMesh = new threeModuleMin.Mesh(
    new threeModuleMin.TubeGeometry(
      floorLampArmCurve,
      48,
      Math.max(0.012, itemWidth * 0.012),
      8,
      false
    ),
    new threeModuleMin.MeshStandardMaterial({
      color: furnitureDarkColor,
      roughness: 0.3,
      metalness: 0.48
    })
  );
  floorLampArmMesh.castShadow = true;
  itemGroup.add(floorLampArmMesh);
  const floorLampShadeMesh = new threeModuleMin.Mesh(
    new threeModuleMin.SphereGeometry(
      floorLampShadeRadius,
      32,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI / 2
    ),
    new threeModuleMin.MeshStandardMaterial({
      color: furnitureSoftColor,
      roughness: 0.62,
      metalness: 0.04
    })
  );
  floorLampShadeMesh.scale.set(1, floorLampShadeHeight / floorLampShadeRadius, 1);
  floorLampShadeMesh.position.set(floorLampHeadX, floorLampHeadY, 0);
  floorLampShadeMesh.castShadow = true;
  itemGroup.add(floorLampShadeMesh);
  addCylinderMesh(
    itemGroup,
    floorLampShadeRadius * 0.94,
    floorLampShadeRadius * 0.98,
    0.025,
    floorLampHeadX,
    floorLampHeadY,
    0,
    furnitureDarkColor,
    {
      segments: 32,
      metalness: 0.12,
      roughness: 0.5
    }
  );
  addCylinderMesh(
    itemGroup,
    Math.max(0.018, itemWidth * 0.014),
    Math.max(0.022, itemWidth * 0.018),
    0.045,
    floorLampHeadX,
    floorLampShadeCenterY + 0.012,
    0,
    furnitureDarkColor,
    {
      segments: 20,
      metalness: 0.42,
      roughness: 0.28
    }
  );
}

