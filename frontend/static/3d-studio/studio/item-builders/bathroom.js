/*
 * 物件构建器：卫浴
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 卫浴：马桶、蹲便、小便斗、浴缸、淋浴、台盆、梳妆台。
 */
/**
 * 命中：itemSpec.type === "vanity"
 */
export function buildVanityItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureDarkColor,
    furnitureLightColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemWidth,
  } = context;
  const vanityCounterY = Math.min(0.76, itemHeight * 0.5);
  addBoxMesh(itemGroup, itemWidth, 0.075, itemDepth, 0, vanityCounterY, 0, furnitureColor);
  addBoxMesh(
    itemGroup,
    itemWidth * 0.27,
    vanityCounterY * 0.82,
    itemDepth * 0.88,
    -itemWidth * 0.34,
    vanityCounterY * 0.42,
    0,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.27,
    vanityCounterY * 0.82,
    itemDepth * 0.88,
    itemWidth * 0.34,
    vanityCounterY * 0.42,
    0,
    furnitureColor
  );
  for (const vanitySinkOffsetX of [-0.34, 0.34]) {
    for (const vanitySinkDepthFactor of [0.23, 0.48]) {
      addBoxMesh(
        itemGroup,
        itemWidth * 0.22,
        0.012,
        itemDepth * 0.02,
        itemWidth * vanitySinkOffsetX,
        vanityCounterY * vanitySinkDepthFactor,
        itemDepth * 0.46,
        furnitureDarkColor,
        {
          rounded: false
        }
      );
    }
  }
  const vanityMirrorHeight = Math.max(itemHeight - vanityCounterY - 0.08, 0.45);
  addBoxMesh(
    itemGroup,
    itemWidth * 0.54,
    vanityMirrorHeight,
    0.025,
    0,
    vanityCounterY + vanityMirrorHeight * 0.5,
    -itemDepth * 0.43,
    itemPalette.glass,
    {
      transparent: true,
      opacity: 0.42,
      depthWrite: false,
      metalness: 0.22,
      roughness: 0.16,
      renderOrder: 6
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.59,
    0.045,
    0.05,
    0,
    vanityCounterY + vanityMirrorHeight,
    -itemDepth * 0.43,
    furnitureLightColor,
    {
      metalness: 0.12
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.59,
    0.045,
    0.05,
    0,
    vanityCounterY,
    -itemDepth * 0.43,
    furnitureLightColor,
    {
      metalness: 0.12
    }
  );
  addBoxMesh(
    itemGroup,
    0.045,
    vanityMirrorHeight,
    0.05,
    -itemWidth * 0.295,
    vanityCounterY + vanityMirrorHeight * 0.5,
    -itemDepth * 0.43,
    furnitureLightColor,
    {
      metalness: 0.12
    }
  );
  addBoxMesh(
    itemGroup,
    0.045,
    vanityMirrorHeight,
    0.05,
    itemWidth * 0.295,
    vanityCounterY + vanityMirrorHeight * 0.5,
    -itemDepth * 0.43,
    furnitureLightColor,
    {
      metalness: 0.12
    }
  );
}

/**
 * 命中：itemSpec.type === "toilet"
 */
export function buildToiletItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    buildCurtainGeometry,
    furnitureDarkColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
    threeModuleMin,
  } = context;
  const toiletTankMesh = new threeModuleMin.Mesh(
    buildCurtainGeometry(itemWidth, itemDepth, itemHeight),
    new threeModuleMin.MeshStandardMaterial({
      color: furnitureLightColor,
      roughness: 0.4,
      metalness: 0.02
    })
  );
  toiletTankMesh.castShadow = true;
  toiletTankMesh.receiveShadow = true;
  itemGroup.add(toiletTankMesh);
  const toiletBowlShape = new threeModuleMin.Shape();
  toiletBowlShape.moveTo(-itemWidth * 0.46, -itemDepth * 0.44);
  toiletBowlShape.lineTo(itemWidth * 0.46, -itemDepth * 0.44);
  toiletBowlShape.bezierCurveTo(
    itemWidth * 0.49,
    -itemDepth * 0.05,
    itemWidth * 0.49,
    itemDepth * 0.29,
    0,
    itemDepth * 0.47
  );
  toiletBowlShape.bezierCurveTo(
    -itemWidth * 0.49,
    itemDepth * 0.29,
    -itemWidth * 0.49,
    -itemDepth * 0.05,
    -itemWidth * 0.46,
    -itemDepth * 0.44
  );
  toiletBowlShape.closePath();
  const toiletBowlMesh = new threeModuleMin.Mesh(
    new threeModuleMin.ExtrudeGeometry(toiletBowlShape, {
      depth: itemHeight * 0.085,
      bevelEnabled: true,
      bevelSegments: 2,
      bevelSize: 0.012,
      bevelThickness: 0.01,
      steps: 1
    }),
    new threeModuleMin.MeshStandardMaterial({
      color: furnitureSoftColor,
      roughness: 0.34,
      metalness: 0.01
    })
  );
  toiletBowlMesh.rotation.x = Math.PI / 2;
  toiletBowlMesh.position.set(0, itemHeight * 0.82, 0);
  toiletBowlMesh.castShadow = true;
  toiletBowlMesh.receiveShadow = true;
  itemGroup.add(toiletBowlMesh);
  addBoxMesh(
    itemGroup,
    itemWidth * 0.9,
    itemHeight * 0.095,
    itemDepth * 0.2,
    0,
    itemHeight * 0.775,
    -itemDepth * 0.34,
    furnitureLightColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.035,
      roughness: 0.36
    }
  );
  addBoxMesh(
    itemGroup,
    0.016,
    itemHeight * 0.38,
    0.024,
    -itemWidth * 0.42,
    itemHeight * 0.38,
    -itemDepth * 0.18,
    furnitureDarkColor,
    {
      rounded: false,
      roughness: 0.46
    }
  );
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.035,
    itemWidth * 0.035,
    0.018,
    -itemWidth * 0.46,
    itemHeight * 0.66,
    itemDepth * 0.12,
    furnitureSoftColor,
    {
      segments: 24,
      rotationZ: Math.PI / 2,
      metalness: 0.08,
      roughness: 0.3
    }
  );
}

/**
 * 命中：itemSpec.type === "squattoilet"
 */
export function buildSquattoiletItem(context) {
  const {
    addBoxMesh,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
    threeModuleMin,
  } = context;
  addBoxMesh(
    itemGroup,
    itemWidth,
    itemHeight * 0.58,
    itemDepth,
    0,
    itemHeight * 0.29,
    0,
    furnitureLightColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.08,
      roughness: 0.38
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.28,
    itemHeight * 0.12,
    itemDepth * 0.58,
    -itemWidth * 0.34,
    itemHeight * 0.66,
    0,
    furnitureSoftColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.035,
      roughness: 0.4
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.28,
    itemHeight * 0.12,
    itemDepth * 0.58,
    itemWidth * 0.34,
    itemHeight * 0.66,
    0,
    furnitureSoftColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.035,
      roughness: 0.4
    }
  );
  const squatToiletMesh = new threeModuleMin.Mesh(
    new threeModuleMin.CylinderGeometry(itemWidth * 0.16, itemWidth * 0.2, itemHeight * 0.18, 28),
    new threeModuleMin.MeshStandardMaterial({
      color: furnitureDarkColor,
      roughness: 0.34,
      metalness: 0.02
    })
  );
  squatToiletMesh.scale.z = 1.75;
  squatToiletMesh.position.y = itemHeight * 0.67;
  itemGroup.add(squatToiletMesh);
}

/**
 * 命中：itemSpec.type === "urinal"
 */
export function buildUrinalItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureDarkColor,
    furnitureLightColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
    threeModuleMin,
  } = context;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.78,
    itemHeight * 0.88,
    itemDepth * 0.72,
    0,
    itemHeight * 0.5,
    -itemDepth * 0.06,
    furnitureLightColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.16,
      roughness: 0.32
    }
  );
  const urinalMesh = new threeModuleMin.Mesh(
    new threeModuleMin.SphereGeometry(
      Math.min(itemWidth, itemDepth) * 0.3,
      24,
      16,
      0,
      Math.PI * 2,
      0,
      Math.PI * 0.58
    ),
    new threeModuleMin.MeshStandardMaterial({
      color: furnitureSoftColor,
      roughness: 0.28,
      metalness: 0.02,
      side: threeModuleMin.DoubleSide
    })
  );
  urinalMesh.scale.set(0.9, 1.1, 0.62);
  urinalMesh.rotation.x = Math.PI;
  urinalMesh.position.set(0, itemHeight * 0.53, itemDepth * 0.17);
  itemGroup.add(urinalMesh);
  addCylinderMesh(
    itemGroup,
    0.018,
    0.018,
    itemHeight * 0.22,
    0,
    itemHeight * 0.95,
    -itemDepth * 0.18,
    furnitureDarkColor,
    {
      segments: 16,
      metalness: 0.72,
      roughness: 0.22
    }
  );
}

/**
 * 命中：itemSpec.type === "bathtub"
 */
export function buildBathtubItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureDarkColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemWidth,
  } = context;
  const bathtubBodyHeight = itemHeight * 0.84;
  const bathtubRimWidth = Math.min(itemWidth, itemDepth) * 0.11;
  const bathtubRimLength = bathtubBodyHeight * 0.8;
  const bathtubInnerWidth = Math.max(itemWidth - bathtubRimWidth * 2, itemWidth * 0.48);
  const bathtubInnerDepth = Math.max(itemDepth - bathtubRimWidth * 2, itemDepth * 0.42);
  addBoxMesh(
    itemGroup,
    bathtubInnerWidth,
    bathtubBodyHeight * 0.16,
    bathtubInnerDepth,
    0,
    bathtubBodyHeight * 0.14,
    0,
    furnitureSoftColor,
    {
      radius: Math.min(itemWidth, itemDepth) * 0.16,
      roughness: 0.33
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    bathtubRimLength,
    bathtubRimWidth,
    0,
    bathtubRimLength * 0.5,
    -itemDepth * 0.5 + bathtubRimWidth * 0.5,
    furnitureLightColor,
    {
      radius: bathtubRimWidth * 0.5,
      roughness: 0.34
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    bathtubRimLength,
    bathtubRimWidth,
    0,
    bathtubRimLength * 0.5,
    itemDepth * 0.5 - bathtubRimWidth * 0.5,
    furnitureLightColor,
    {
      radius: bathtubRimWidth * 0.5,
      roughness: 0.34
    }
  );
  addBoxMesh(
    itemGroup,
    bathtubRimWidth,
    bathtubRimLength,
    bathtubInnerDepth,
    -itemWidth * 0.5 + bathtubRimWidth * 0.5,
    bathtubRimLength * 0.5,
    0,
    furnitureLightColor,
    {
      radius: bathtubRimWidth * 0.5,
      roughness: 0.34
    }
  );
  addBoxMesh(
    itemGroup,
    bathtubRimWidth,
    bathtubRimLength,
    bathtubInnerDepth,
    itemWidth * 0.5 - bathtubRimWidth * 0.5,
    bathtubRimLength * 0.5,
    0,
    furnitureLightColor,
    {
      radius: bathtubRimWidth * 0.5,
      roughness: 0.34
    }
  );
  const bathtubFootHeight = bathtubBodyHeight * 0.075;
  const bathtubFootCenterY = bathtubRimLength + bathtubFootHeight * 0.5;
  addBoxMesh(
    itemGroup,
    itemWidth,
    bathtubFootHeight,
    bathtubRimWidth,
    0,
    bathtubFootCenterY,
    -itemDepth * 0.5 + bathtubRimWidth * 0.5,
    furnitureLightColor,
    {
      radius: bathtubRimWidth * 0.45,
      roughness: 0.29
    }
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    bathtubFootHeight,
    bathtubRimWidth,
    0,
    bathtubFootCenterY,
    itemDepth * 0.5 - bathtubRimWidth * 0.5,
    furnitureLightColor,
    {
      radius: bathtubRimWidth * 0.45,
      roughness: 0.29
    }
  );
  addBoxMesh(
    itemGroup,
    bathtubRimWidth,
    bathtubFootHeight,
    bathtubInnerDepth,
    -itemWidth * 0.5 + bathtubRimWidth * 0.5,
    bathtubFootCenterY,
    0,
    furnitureLightColor,
    {
      radius: bathtubRimWidth * 0.45,
      roughness: 0.29
    }
  );
  addBoxMesh(
    itemGroup,
    bathtubRimWidth,
    bathtubFootHeight,
    bathtubInnerDepth,
    itemWidth * 0.5 - bathtubRimWidth * 0.5,
    bathtubFootCenterY,
    0,
    furnitureLightColor,
    {
      radius: bathtubRimWidth * 0.45,
      roughness: 0.29
    }
  );
  for (const bathtubFaucetOffsetX of [-itemWidth * 0.38, itemWidth * 0.38]) {
    for (const bathtubFaucetOffsetZ of [-itemDepth * 0.3, itemDepth * 0.3]) {
      addCylinderMesh(
        itemGroup,
        0.026,
        0.026,
        itemHeight * 0.16,
        bathtubFaucetOffsetX,
        itemHeight * 0.08,
        bathtubFaucetOffsetZ,
        itemPalette.furnitureDark,
        {
          segments: 12,
          metalness: 0.42,
          roughness: 0.3
        }
      );
    }
  }
  addCylinderMesh(
    itemGroup,
    0.016,
    0.016,
    itemHeight * 0.25,
    itemWidth * 0.34,
    itemHeight * 0.96,
    -itemDepth * 0.22,
    furnitureDarkColor,
    {
      segments: 16,
      metalness: 0.72,
      roughness: 0.2
    }
  );
  addCylinderMesh(
    itemGroup,
    0.016,
    0.016,
    itemDepth * 0.28,
    itemWidth * 0.34,
    itemHeight * 1.08,
    -itemDepth * 0.08,
    furnitureDarkColor,
    {
      segments: 16,
      rotationX: Math.PI / 2,
      metalness: 0.72,
      roughness: 0.2
    }
  );
}

/**
 * 命中：itemSpec.type === "shower"
 */
export function buildShowerItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureLightColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
    threeModuleMin,
  } = context;
  const showerFixtureColor = furnitureLightColor;
  const showerBackWallZ = -itemDepth * 0.42;
  const showerRailBottomY = itemHeight * 0.13;
  const showerRailTopY = itemHeight * 0.9;
  const showerRailHeight = showerRailTopY - showerRailBottomY;
  const showerRailOptions = {
    rounded: false,
    metalness: 0.68,
    roughness: 0.22
  };
  addBoxMesh(
    itemGroup,
    0.045,
    showerRailHeight,
    0.045,
    0,
    (showerRailBottomY + showerRailTopY) * 0.5,
    showerBackWallZ,
    showerFixtureColor,
    showerRailOptions
  );
  for (const showerRailBracketY of [
    showerRailBottomY,
    itemHeight * 0.47,
    itemHeight * 0.78,
    showerRailTopY
  ]) {
    addBoxMesh(
      itemGroup,
      0.085,
      0.085,
      0.065,
      0,
      showerRailBracketY,
      showerBackWallZ,
      showerFixtureColor,
      showerRailOptions
    );
  }
  for (const showerPipeEndY of [showerRailBottomY, showerRailTopY]) {
    addCylinderMesh(
      itemGroup,
      itemWidth * 0.055,
      itemWidth * 0.055,
      0.04,
      0,
      showerPipeEndY,
      -itemDepth * 0.47,
      showerFixtureColor,
      {
        segments: 28,
        rotationX: Math.PI / 2,
        metalness: 0.7,
        roughness: 0.2
      }
    );
  }
  const showerHeadHeight = itemHeight * 0.12;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.36,
    0.065,
    0.065,
    0,
    showerHeadHeight,
    showerBackWallZ + itemDepth * 0.08,
    showerFixtureColor,
    showerRailOptions
  );
  for (const showerHandleOffsetX of [-itemWidth * 0.2, itemWidth * 0.2]) {
    addCylinderMesh(
      itemGroup,
      itemWidth * 0.055,
      itemWidth * 0.055,
      0.045,
      showerHandleOffsetX,
      showerHeadHeight,
      -itemDepth * 0.45,
      showerFixtureColor,
      {
        segments: 28,
        rotationX: Math.PI / 2,
        metalness: 0.7,
        roughness: 0.2
      }
    );
    addBoxMesh(
      itemGroup,
      0.05,
      0.05,
      itemDepth * 0.13,
      showerHandleOffsetX,
      showerHeadHeight,
      showerBackWallZ + itemDepth * 0.01,
      showerFixtureColor,
      showerRailOptions
    );
  }
  addBoxMesh(
    itemGroup,
    0.045,
    itemHeight * 0.12,
    0.045,
    0,
    showerHeadHeight - itemHeight * 0.045,
    showerBackWallZ + itemDepth * 0.13,
    showerFixtureColor,
    showerRailOptions
  );
  const showerPipeStartPoint = new threeModuleMin.Vector3(0, showerRailTopY, showerBackWallZ);
  const showerPipeEndPoint = new threeModuleMin.Vector3(0, itemHeight * 0.76, itemDepth * 0.08);
  const showerPipeDeltaY = showerPipeEndPoint.y - showerPipeStartPoint.y;
  const showerPipeDeltaZ = showerPipeEndPoint.z - showerPipeStartPoint.z;
  const showerPipeLength = Math.hypot(showerPipeDeltaY, showerPipeDeltaZ);
  const showerPipeMesh = addBoxMesh(
    itemGroup,
    0.055,
    showerPipeLength,
    0.055,
    0,
    (showerPipeStartPoint.y + showerPipeEndPoint.y) * 0.5,
    (showerPipeStartPoint.z + showerPipeEndPoint.z) * 0.5,
    showerFixtureColor,
    showerRailOptions
  );
  showerPipeMesh.rotation.x = Math.atan2(showerPipeDeltaZ, showerPipeDeltaY);
  addBoxMesh(
    itemGroup,
    0.055,
    itemHeight * 0.13,
    0.055,
    0,
    itemHeight * 0.705,
    showerPipeEndPoint.z,
    showerFixtureColor,
    showerRailOptions
  );
  addBoxMesh(
    itemGroup,
    itemWidth * 0.34,
    0.035,
    itemDepth * 0.3,
    0,
    itemHeight * 0.64,
    showerPipeEndPoint.z + itemDepth * 0.03,
    showerFixtureColor,
    {
      rounded: false,
      metalness: 0.64,
      roughness: 0.24
    }
  );
}

/**
 * 命中：itemSpec.type === "basin"
 */
export function buildBasinItem(context) {
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
    itemPalette,
    itemWidth,
  } = context;
  addBoxMesh(
    itemGroup,
    itemWidth * 0.92,
    itemHeight * 0.72,
    itemDepth * 0.9,
    0,
    itemHeight * 0.36,
    0,
    furnitureColor
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    0.065,
    itemDepth,
    0,
    itemHeight * 0.75,
    0,
    furnitureLightColor,
    {
      roughness: 0.3
    }
  );
  addCylinderMesh(
    itemGroup,
    itemWidth * 0.25,
    itemWidth * 0.21,
    0.08,
    0,
    itemHeight * 0.8,
    itemDepth * 0.02,
    furnitureSoftColor,
    {
      roughness: 0.28
    }
  );
  addCylinderMesh(
    itemGroup,
    0.018,
    0.018,
    itemHeight * 0.2,
    0,
    itemHeight * 0.9,
    -itemDepth * 0.2,
    furnitureDarkColor,
    {
      metalness: 0.78,
      roughness: 0.18
    }
  );
  addCylinderMesh(
    itemGroup,
    0.018,
    0.018,
    itemDepth * 0.2,
    0,
    itemHeight * 0.99,
    -itemDepth * 0.11,
    furnitureDarkColor,
    {
      rotationX: Math.PI / 2,
      metalness: 0.78,
      roughness: 0.18
    }
  );
  addBoxMesh(
    itemGroup,
    0.012,
    itemHeight * 0.62,
    itemDepth * 0.02,
    0,
    itemHeight * 0.34,
    itemDepth * 0.46,
    furnitureDarkColor,
    {
      rounded: false
    }
  );
  const basinCounterY = itemHeight * 1.05;
  const basinWidth = itemWidth * 0.72;
  const basinHeight = 0.72;
  const basinZ = -itemDepth * 0.46;
  addBoxMesh(
    itemGroup,
    basinWidth,
    basinHeight,
    0.018,
    0,
    basinCounterY + basinHeight * 0.5,
    basinZ,
    itemPalette.glass,
    {
      rounded: false,
      transparent: true,
      opacity: 0.46,
      depthWrite: false,
      metalness: 0.26,
      roughness: 0.12,
      castShadow: false,
      renderOrder: 6
    }
  );
  addBoxMesh(
    itemGroup,
    basinWidth + 0.055,
    0.035,
    0.045,
    0,
    basinCounterY,
    basinZ,
    furnitureDarkColor,
    {
      metalness: 0.35
    }
  );
  addBoxMesh(
    itemGroup,
    basinWidth + 0.055,
    0.035,
    0.045,
    0,
    basinCounterY + basinHeight,
    basinZ,
    furnitureDarkColor,
    {
      metalness: 0.35
    }
  );
  addBoxMesh(
    itemGroup,
    0.035,
    basinHeight,
    0.045,
    -basinWidth * 0.5,
    basinCounterY + basinHeight * 0.5,
    basinZ,
    furnitureDarkColor,
    {
      metalness: 0.35
    }
  );
  addBoxMesh(
    itemGroup,
    0.035,
    basinHeight,
    0.045,
    basinWidth * 0.5,
    basinCounterY + basinHeight * 0.5,
    basinZ,
    furnitureDarkColor,
    {
      metalness: 0.35
    }
  );
}

