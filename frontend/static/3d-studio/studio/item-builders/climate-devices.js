/*
 * 物件构建器：环境与安防设备
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 空调（壁挂 / 落地）、空气净化器、扫地机、NAS、摄像头与人体感应（共用一支）。
 */
/**
 * 命中：itemSpec.type === "wallac"
 */
export function buildWallacItem(context) {
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
      roughness: 0.46
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.9,
    itemHeight * 0.08,
    itemDepth * 0.18,
    0,
    itemHeight * 0.18,
    itemDepth * 0.46,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.3
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.12,
    itemHeight * 0.08,
    itemDepth * 0.05,
    itemWidth * 0.34,
    itemHeight * 0.68,
    itemDepth * 0.51,
    furnitureSoftColor,
    {
      rounded: false,
      emissive: furnitureSoftColor,
      emissiveIntensity: 0.18
    }
  );
}

/**
 * 命中：itemSpec.type === "floorac"
 */
export function buildFlooracItem(context) {
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
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.46,
    itemWidth * 0.48,
    itemHeight,
    0,
    itemHeight * 0.5,
    0,
    furnitureLightColor,
    {
      segments: 32,
      roughness: 0.48
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.5,
    itemHeight * 0.42,
    0.025,
    0,
    itemHeight * 0.68,
    itemDepth * 0.48,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.3
    }
  );
  for (const floorAcVentHeightFactor of [0.58, 0.68, 0.78]) {
    addBoxMesh(
      itemGroup,
      itemWidth * 0.42,
      0.018,
      0.03,
      0,
      itemHeight * floorAcVentHeightFactor,
      itemDepth * 0.5,
      furnitureSoftColor,
      {
        rounded: false,
        roughness: 0.34
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "robotvacuum"
 */
export function buildRobotvacuumItem(context) {
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
    itemWidth * 0.82,
    0.035,
    itemDepth * 0.92,
    0,
    0.018,
    0,
    furnitureSoftColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.05,
      roughness: 0.58
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.68,
    itemHeight * 0.82,
    itemDepth * 0.48,
    0,
    itemHeight * 0.47,
    -itemDepth * 0.23,
    furnitureLightColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.12,
      roughness: 0.48
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.44,
    itemHeight * 0.16,
    0.03,
    0,
    itemHeight * 0.2,
    itemDepth * 0.02,
    furnitureSoftColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.04,
      roughness: 0.42
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.34,
    itemHeight * 0.07,
    0.035,
    0,
    itemHeight * 0.14,
    itemDepth * 0.04,
    furnitureDarkColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.025,
      roughness: 0.28
    }
  );
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.31,
    itemWidth * 0.32,
    itemHeight * 0.12,
    0,
    itemHeight * 0.07,
    itemDepth * 0.2,
    furnitureLightColor,
    {
      segments: 32,
      roughness: 0.42
    }
  );
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.085,
    itemWidth * 0.09,
    itemHeight * 0.055,
    -itemWidth * 0.08,
    itemHeight * 0.16,
    itemDepth * 0.15,
    furnitureSoftColor,
    {
      segments: 24,
      roughness: 0.34
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.36,
    itemHeight * 0.045,
    0.025,
    0,
    itemHeight * 0.08,
    itemDepth * 0.52,
    furnitureDarkColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.025,
      roughness: 0.24
    }
  );
}

/**
 * 命中：itemSpec.type === "camera" || itemSpec.type === "presence"
 */
export function buildCameraPresenceItem(context) {
  const {
    addSecurityModel,
    itemGroup,
    itemPalette,
    itemSpec,
    threeModuleMin,
  } = context;
  addSecurityModel(threeModuleMin, itemGroup, itemSpec, itemPalette);
}

/**
 * 命中：itemSpec.type === "nas"
 */
export function buildNasItem(context) {
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
    itemHeight,
    itemDepth,
    0,
    itemHeight * 0.5,
    0,
    furnitureColor,
    {
      rounded: false,
      metalness: 0.16,
      roughness: 0.46
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.9,
    itemHeight * 0.88,
    0.025,
    0,
    itemHeight * 0.5,
    itemDepth * 0.515,
    furnitureDarkColor,
    {
      rounded: false,
      metalness: 0.12,
      roughness: 0.32
    }
  );
  for (const nasTrayOffsetX of [-itemWidth * 0.23, itemWidth * 0.23]) {
    for (const nasTrayY of [itemHeight * 0.3, itemHeight * 0.7]) {
      addBoxMesh(
        itemGroup,
        itemWidth * 0.38,
        itemHeight * 0.34,
        0.018,
        nasTrayOffsetX,
        nasTrayY,
        itemDepth * 0.535,
        furnitureSoftColor,
        {
          rounded: false,
          roughness: 0.38
        }
      );
      addBoxMesh(
        itemGroup,
        itemWidth * 0.18,
        0.018,
        0.012,
        nasTrayOffsetX,
        nasTrayY + itemHeight * 0.1,
        itemDepth * 0.55,
        furnitureDarkColor,
        {
          rounded: false,
          metalness: 0.25,
          roughness: 0.3
        }
      );
    }
  }
  for (const nasIndicatorHeightFactor of [0.18, 0.26, 0.34]) {
    addBoxMesh(
      itemGroup,
      0.012,
      0.012,
      0.012,
      itemWidth * 0.42,
      itemHeight * nasIndicatorHeightFactor,
      itemDepth * 0.55,
      9550021,
      {
        rounded: false,
        emissive: 9550021,
        emissiveIntensity: 0.28,
        roughness: 0.2
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "airpurifier"
 */
export function buildAirpurifierItem(context) {
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
  const airPurifierBodyRadius = Math.min(itemWidth, itemDepth) * 0.47;
  addCylinderMesh(
    itemGroup,
    airPurifierBodyRadius * 0.96,
    airPurifierBodyRadius,
    itemHeight * 0.92,
    0,
    itemHeight * 0.46,
    0,
    furnitureLightColor,
    {
      segments: 36,
      roughness: 0.5
    }
  );
  addCylinderMesh(
    itemGroup,
    airPurifierBodyRadius * 0.92,
    airPurifierBodyRadius * 0.92,
    itemHeight * 0.055,
    0,
    itemHeight * 0.965,
    0,
    furnitureDarkColor,
    {
      segments: 36,
      metalness: 0.18,
      roughness: 0.3
    }
  );
  addCylinderMesh(
    itemGroup,
    airPurifierBodyRadius * 0.55,
    airPurifierBodyRadius * 0.55,
    itemHeight * 0.018,
    0,
    itemHeight * 1.005,
    0,
    furnitureSoftColor,
    {
      segments: 32,
      metalness: 0.08,
      roughness: 0.35
    }
  );
  for (const airPurifierVentOffsetFactor of [-0.28, -0.14, 0, 0.14, 0.28]) {
    addBoxMesh(
      itemGroup,
      0.012,
      itemHeight * 0.45,
      0.012,
      itemWidth * airPurifierVentOffsetFactor,
      itemHeight * 0.35,
      itemDepth * 0.46,
      furnitureSoftColor,
      {
        rounded: false,
        roughness: 0.45
      }
    );
  }
}

