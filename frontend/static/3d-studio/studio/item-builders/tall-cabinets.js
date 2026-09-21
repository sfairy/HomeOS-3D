/*
 * 物件构建器：高柜
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 玻璃柜与书柜。两者的构建体各接近 380 行（隔板、玻璃门、灯带与书本），单独成文件，
 * 免得把储物那一份撑成第二个巨石。
 */
/**
 * 命中：itemSpec.type === "glasscabinet"
 */
export function buildGlasscabinetItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemWidth,
    threeModuleMin,
  } = context;
  const glassCabinetSideThickness = Math.min(
    Math.max(Math.min(itemWidth, itemDepth) * 0.1, 0.032),
    0.058
  );
  const glassCabinetFrameThickness = Math.min(Math.max(itemDepth * 0.075, 0.018), 0.032);
  const glassCabinetMullionWidth = Math.min(Math.max(itemWidth * 0.014, 0.016), 0.03);
  const glassCabinetInnerWidth = Math.max(
    itemWidth - glassCabinetSideThickness * 2,
    itemWidth * 0.7
  );
  const glassCabinetBaseRatio = 0.13;
  const glassCabinetTopRatio = 0.3;
  const glassCabinetShelfCount = 4;
  const glassCabinetBaseHeight = itemHeight * glassCabinetBaseRatio;
  const glassCabinetTopHeight = itemHeight * glassCabinetTopRatio;
  const glassCabinetDoorHeight = itemHeight - glassCabinetSideThickness - glassCabinetTopHeight;
  const glassCabinetShelfSpacing = glassCabinetDoorHeight / glassCabinetShelfCount;
  const glassCabinetColumnRatios = [0.56, 0.24, 0.2];
  const glassCabinetColumnOffsets = [
    0,
    glassCabinetColumnRatios[0],
    glassCabinetColumnRatios[0] + glassCabinetColumnRatios[1]
  ];
  const glassCabinetInnerColumnRatios = glassCabinetColumnOffsets.slice(1);
  const glassCabinetGapWidth = Math.max(itemWidth * 0.005, 0.005);
  const glassCabinetFrontZ = itemDepth * 0.5 + 0.012;
  const cabinetBodyOptions = {
    rounded: false,
    roughness: 0.62,
    metalness: 0.015
  };
  const cabinetFrameOptions = {
    rounded: false,
    roughness: 0.48,
    metalness: 0.035
  };
  const cabinetGlassOptions = {
    rounded: false,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: threeModuleMin.DoubleSide,
    roughness: 0.08,
    metalness: 0.08,
    castShadow: false,
    receiveShadow: false,
    renderOrder: 7
  };
  const cabinetHandleOptions = {
    rounded: false,
    transparent: true,
    opacity: 0.5,
    depthWrite: false,
    roughness: 0.12,
    metalness: 0,
    castShadow: false,
    receiveShadow: false,
    renderOrder: 8
  };
  addBoxMesh(
    itemGroup,
    glassCabinetSideThickness,
    itemHeight,
    itemDepth,
    -itemWidth * 0.5 + glassCabinetSideThickness * 0.5,
    itemHeight * 0.5,
    0,
    furnitureColor,
    cabinetBodyOptions
  );
  addBoxMesh(
    itemGroup,
    glassCabinetSideThickness,
    itemHeight,
    itemDepth,
    itemWidth * 0.5 - glassCabinetSideThickness * 0.5,
    itemHeight * 0.5,
    0,
    furnitureColor,
    cabinetBodyOptions
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    itemHeight,
    glassCabinetFrameThickness + 0.004,
    0,
    itemHeight * 0.5,
    -itemDepth * 0.5 + glassCabinetFrameThickness * 0.5 - 0.002,
    furnitureColor,
    cabinetBodyOptions
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    glassCabinetSideThickness,
    itemDepth,
    0,
    itemHeight - glassCabinetSideThickness * 0.5,
    0,
    furnitureColor,
    cabinetBodyOptions
  );
  for (
    let cabinetShelfIndex = 0;
    cabinetShelfIndex < glassCabinetShelfCount;
    cabinetShelfIndex += 1
  ) {
    addBoxMesh(
      itemGroup,
      glassCabinetInnerWidth,
      glassCabinetSideThickness * 0.72,
      itemDepth * 0.9,
      0,
      glassCabinetTopHeight + glassCabinetShelfSpacing * cabinetShelfIndex,
      -itemDepth * 0.025,
      furnitureSoftColor,
      cabinetBodyOptions
    );
  }
  addBoxMesh(
    itemGroup,
    glassCabinetInnerWidth,
    glassCabinetSideThickness * 0.72,
    itemDepth * 0.9,
    0,
    glassCabinetBaseHeight,
    -itemDepth * 0.025,
    furnitureSoftColor,
    cabinetBodyOptions
  );
  for (const columnOffsetRatio of glassCabinetInnerColumnRatios) {
    const columnCenterX =
      -glassCabinetInnerWidth * 0.5 + glassCabinetInnerWidth * columnOffsetRatio;
    addBoxMesh(
      itemGroup,
      glassCabinetSideThickness * 0.72,
      itemHeight - glassCabinetSideThickness,
      itemDepth * 0.9,
      columnCenterX,
      (itemHeight - glassCabinetSideThickness) * 0.5,
      -itemDepth * 0.025,
      furnitureColor,
      cabinetBodyOptions
    );
  }
  const glassDoorHeight =
    glassCabinetTopHeight - glassCabinetBaseHeight - glassCabinetSideThickness * 0.9;
  const glassDoorWidths = [
    glassCabinetInnerWidth * glassCabinetColumnRatios[0],
    glassCabinetInnerWidth * (1 - glassCabinetColumnRatios[0])
  ];
  let glassDoorAccumX = -glassCabinetInnerWidth * 0.5;
  for (let glassDoorIndex = 0; glassDoorIndex < glassDoorWidths.length; glassDoorIndex += 1) {
    const glassDoorWidth = glassDoorWidths[glassDoorIndex] - glassCabinetGapWidth;
    const glassDoorCenterX = glassDoorAccumX + glassDoorWidths[glassDoorIndex] * 0.5;
    addBoxMesh(
      itemGroup,
      glassDoorWidth,
      glassDoorHeight,
      0.03,
      glassDoorCenterX,
      glassCabinetBaseHeight + (glassCabinetTopHeight - glassCabinetBaseHeight) * 0.5,
      glassCabinetFrontZ,
      glassDoorIndex ? furnitureSoftColor : furnitureColor,
      {
        ...cabinetFrameOptions,
        roughness: 0.56
      }
    );
    glassDoorAccumX += glassDoorWidths[glassDoorIndex];
  }
  for (
    let glassColumnIndex = 0;
    glassColumnIndex < glassCabinetColumnRatios.length;
    glassColumnIndex += 1
  ) {
    const columnStartX =
      -glassCabinetInnerWidth * 0.5 +
      glassCabinetInnerWidth * glassCabinetColumnOffsets[glassColumnIndex];
    const columnWidth = glassCabinetInnerWidth * glassCabinetColumnRatios[glassColumnIndex];
    const columnCenterOffsetX = columnStartX + columnWidth * 0.5;
    const glassPaneWidth = Math.max(
      columnWidth - glassCabinetMullionWidth * 1.65,
      columnWidth * 0.76
    );
    const glassPaneHeight = Math.max(
      glassCabinetDoorHeight - glassCabinetMullionWidth * 1.55,
      glassCabinetDoorHeight * 0.86
    );
    addBoxMesh(
      itemGroup,
      glassPaneWidth,
      glassPaneHeight,
      0.018,
      columnCenterOffsetX,
      glassCabinetTopHeight + glassCabinetDoorHeight * 0.5,
      glassCabinetFrontZ,
      itemPalette.glass,
      cabinetGlassOptions
    );
    addBoxMesh(
      itemGroup,
      glassCabinetMullionWidth,
      glassCabinetDoorHeight,
      0.032,
      columnStartX + glassCabinetMullionWidth * 0.5,
      glassCabinetTopHeight + glassCabinetDoorHeight * 0.5,
      glassCabinetFrontZ + 0.009,
      furnitureColor,
      cabinetFrameOptions
    );
    if (glassColumnIndex === glassCabinetColumnRatios.length - 1) {
      addBoxMesh(
        itemGroup,
        glassCabinetMullionWidth,
        glassCabinetDoorHeight,
        0.032,
        columnStartX + columnWidth - glassCabinetMullionWidth * 0.5,
        glassCabinetTopHeight + glassCabinetDoorHeight * 0.5,
        glassCabinetFrontZ + 0.009,
        furnitureColor,
        cabinetFrameOptions
      );
    }
    const handleBarWidth = Math.max(glassPaneWidth * 0.025, 0.007);
    addBoxMesh(
      itemGroup,
      handleBarWidth,
      glassPaneHeight * 0.88,
      0.006,
      columnCenterOffsetX - glassPaneWidth * 0.37,
      glassCabinetTopHeight + glassCabinetDoorHeight * 0.52,
      glassCabinetFrontZ + 0.014,
      14282227,
      cabinetHandleOptions
    );
    addBoxMesh(
      itemGroup,
      glassPaneWidth * 0.34,
      Math.max(glassCabinetMullionWidth * 0.11, 0.004),
      0.006,
      columnCenterOffsetX - glassPaneWidth * 0.18,
      glassCabinetTopHeight + glassCabinetDoorHeight * 0.88,
      glassCabinetFrontZ + 0.014,
      15267578,
      cabinetHandleOptions
    );
  }
  addBoxMesh(
    itemGroup,
    glassCabinetInnerWidth,
    glassCabinetMullionWidth,
    0.032,
    0,
    glassCabinetTopHeight + glassCabinetMullionWidth * 0.5,
    glassCabinetFrontZ + 0.009,
    furnitureColor,
    cabinetFrameOptions
  );
  addBoxMesh(
    itemGroup,
    glassCabinetInnerWidth,
    glassCabinetMullionWidth,
    0.032,
    0,
    itemHeight - glassCabinetSideThickness - glassCabinetMullionWidth * 0.5,
    glassCabinetFrontZ + 0.009,
    furnitureColor,
    cabinetFrameOptions
  );
  const bookColors = [
    14736852,
    13025203,
    10327434,
    7301474,
    furnitureSoftColor,
    furnitureLightColor
  ];
  /**
   * 在一格书柜里立起一排书（书脊朝外，宽高各自微扰）。书宽按列宽的 72% 扣掉间隙后均分；逐本从 5 种厚度系数与 5 种高度系数里按
   * bookSeed 错位取值，保证相邻两格的书不会长得一模一样。
   * @param {number} bookSeed 随机种子，用于错开宽高组合。
   */
  const addBookRow = (bookColumnIndex, bookShelfIndex, bookCount = 5, bookSeed = 0) => {
    const bookColumnWidth = glassCabinetInnerWidth * glassCabinetColumnRatios[bookColumnIndex];
    const bookColumnStartX =
      -glassCabinetInnerWidth * 0.5 +
      glassCabinetInnerWidth * glassCabinetColumnOffsets[bookColumnIndex];
    const bookBaseY =
      glassCabinetTopHeight +
      glassCabinetShelfSpacing * bookShelfIndex +
      glassCabinetSideThickness * 0.42;
    const bookGap = Math.max(bookColumnWidth * 0.022, 0.004);
    const bookWidth = (bookColumnWidth * 0.72 - bookGap * (bookCount - 1)) / bookCount;
    let bookCursorX = bookColumnStartX + bookColumnWidth * 0.13;
    for (let bookIndex = 0; bookIndex < bookCount; bookIndex += 1) {
      const bookThickness = bookWidth * [0.8, 1.05, 0.9, 0.72, 0.96][(bookIndex + bookSeed) % 5];
      const bookHeight =
        glassCabinetShelfSpacing * [0.48, 0.58, 0.52, 0.64, 0.55][(bookIndex * 2 + bookSeed) % 5];
      addBoxMesh(
        itemGroup,
        bookThickness,
        bookHeight,
        itemDepth * 0.42,
        bookCursorX + bookThickness * 0.5,
        bookBaseY + bookHeight * 0.5,
        itemDepth * 0.12,
        bookColors[(bookIndex + bookSeed) % bookColors.length],
        {
          radius: Math.min(bookThickness * 0.12, 0.009),
          roughness: 0.78,
          metalness: 0
        }
      );
      bookCursorX += bookThickness + bookGap;
    }
  };
  /**
   * 在一格里平叠一摞书（书页朝外、横向铺开）。stackColumnIndex / stackShelfIndex 指定列与层，stackCount 为叠放本数（默认 3），
   * stackSeed 用于错开取色。
   */
  const addBookStack = (stackColumnIndex, stackShelfIndex, stackCount = 3, stackSeed = 0) => {
    const stackColumnWidth = glassCabinetInnerWidth * glassCabinetColumnRatios[stackColumnIndex];
    const stackCenterX =
      -glassCabinetInnerWidth * 0.5 +
      glassCabinetInnerWidth * glassCabinetColumnOffsets[stackColumnIndex] +
      stackColumnWidth * 0.5;
    const stackBaseY =
      glassCabinetTopHeight +
      glassCabinetShelfSpacing * stackShelfIndex +
      glassCabinetSideThickness * 0.42;
    for (let stackIndex = 0; stackIndex < stackCount; stackIndex += 1) {
      addBoxMesh(
        itemGroup,
        stackColumnWidth * 0.56,
        glassCabinetSideThickness * 0.48,
        itemDepth * 0.4,
        stackCenterX,
        stackBaseY + glassCabinetSideThickness * (0.3 + stackIndex * 0.52),
        itemDepth * 0.12,
        bookColors[(stackIndex + stackSeed) % bookColors.length],
        {
          radius: 0.006,
          roughness: 0.78,
          metalness: 0
        }
      );
    }
  };
  addBookRow(0, 1, 7, 0);
  addBookRow(2, 2, 4, 2);
  addBookStack(0, 0, 3, 2);
  addBookStack(1, 2, 3, 4);
  for (const [decorColumnIndex, decorShelfIndex, decorWidthRatio, decorColor] of [
    [1, 1, 0.16, 12169895],
    [0, 2, 0.075, 9406334],
    [2, 3, 0.14, 13749184]
  ]) {
    const decorColumnWidth = glassCabinetInnerWidth * glassCabinetColumnRatios[decorColumnIndex];
    const decorCenterX =
      -glassCabinetInnerWidth * 0.5 +
      glassCabinetInnerWidth * glassCabinetColumnOffsets[decorColumnIndex] +
      decorColumnWidth * 0.5;
    const decorBaseY =
      glassCabinetTopHeight +
      glassCabinetShelfSpacing * decorShelfIndex +
      glassCabinetSideThickness * 0.42;
    addCylinderMesh(
      itemGroup,
      decorColumnWidth * decorWidthRatio * 0.72,
      decorColumnWidth * decorWidthRatio,
      glassCabinetShelfSpacing * 0.46,
      decorCenterX,
      decorBaseY + glassCabinetShelfSpacing * 0.23,
      itemDepth * 0.12,
      decorColor,
      {
        segments: 24,
        roughness: 0.68
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "bookcase"
 */
export function buildBookcaseItem(context) {
  const {
    addBoxMesh,
    addCylinderMesh,
    furnitureColor,
    furnitureLightColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
  } = context;
  const bookcaseSideThickness = Math.min(
    Math.max(Math.min(itemWidth, itemDepth) * 0.11, 0.032),
    0.062
  );
  const bookcaseBackThickness = Math.min(Math.max(itemDepth * 0.075, 0.018), 0.032);
  const bookcaseInnerWidth = Math.max(itemWidth - bookcaseSideThickness * 2, itemWidth * 0.72);
  const bookcaseShelfRatio = 0.255;
  const bookcaseShelfRatios = [bookcaseShelfRatio, 0.47, 0.59, 0.79];
  const bookcaseTopY = itemHeight - bookcaseSideThickness * 0.5;
  const bookcaseSideBayWidth = bookcaseInnerWidth * 0.27;
  const bookcaseSideBayX = itemWidth * 0.5 - bookcaseSideThickness * 1.5 - bookcaseSideBayWidth;
  const bookcaseMainBayWidth = bookcaseInnerWidth - bookcaseSideBayWidth - bookcaseSideThickness;
  const bookcaseMainBayCenterX = -bookcaseInnerWidth * 0.5 + bookcaseMainBayWidth * 0.5;
  const bookcaseSideBayCenterX = bookcaseInnerWidth * 0.5 - bookcaseSideBayWidth * 0.5;
  const bookcasePanelOptions = {
    rounded: false,
    roughness: 0.62,
    metalness: 0.015
  };
  const bookcaseFrontZ = itemDepth * 0.5 + 0.013;
  addBoxMesh(
    itemGroup,
    bookcaseSideThickness,
    itemHeight,
    itemDepth,
    -itemWidth * 0.5 + bookcaseSideThickness * 0.5,
    itemHeight * 0.5,
    0,
    furnitureColor,
    bookcasePanelOptions
  );
  addBoxMesh(
    itemGroup,
    bookcaseSideThickness,
    itemHeight,
    itemDepth,
    itemWidth * 0.5 - bookcaseSideThickness * 0.5,
    itemHeight * 0.5,
    0,
    furnitureColor,
    bookcasePanelOptions
  );
  addBoxMesh(
    itemGroup,
    itemWidth,
    itemHeight,
    bookcaseBackThickness + 0.004,
    0,
    itemHeight * 0.5,
    -itemDepth * 0.5 + bookcaseBackThickness * 0.5 - 0.002,
    furnitureColor,
    bookcasePanelOptions
  );
  addBoxMesh(
    itemGroup,
    bookcaseInnerWidth,
    itemHeight * bookcaseShelfRatio - bookcaseSideThickness * 0.5,
    itemDepth * 0.9,
    0,
    itemHeight * bookcaseShelfRatio * 0.5,
    -itemDepth * 0.025,
    furnitureSoftColor,
    {
      ...bookcasePanelOptions,
      roughness: 0.66
    }
  );
  for (const shelfSlotRatio of bookcaseShelfRatios) {
    addBoxMesh(
      itemGroup,
      bookcaseInnerWidth,
      bookcaseSideThickness,
      itemDepth,
      0,
      itemHeight * shelfSlotRatio,
      0,
      furnitureSoftColor,
      bookcasePanelOptions
    );
  }
  addBoxMesh(
    itemGroup,
    itemWidth,
    bookcaseSideThickness,
    itemDepth,
    0,
    bookcaseTopY,
    0,
    furnitureColor,
    bookcasePanelOptions
  );
  const lowerCompartmentTopY = itemHeight * bookcaseShelfRatios[1] + bookcaseSideThickness * 0.5;
  const bookcaseInnerHeight = itemHeight - bookcaseSideThickness;
  addBoxMesh(
    itemGroup,
    bookcaseSideThickness,
    bookcaseInnerHeight - lowerCompartmentTopY,
    itemDepth,
    bookcaseSideBayX,
    (bookcaseInnerHeight + lowerCompartmentTopY) * 0.5,
    0,
    furnitureColor,
    bookcasePanelOptions
  );
  const bookcaseDrawerCount = 3;
  const bookcaseDrawerGap = bookcaseSideThickness * 0.72;
  const bookcaseLowerTopY = itemHeight * bookcaseShelfRatio - bookcaseSideThickness * 0.5;
  const bookcaseDrawerHeight = Math.max(bookcaseLowerTopY - bookcaseDrawerGap, itemHeight * 0.16);
  const bookcaseDrawerSpacing = Math.max(itemWidth * 0.008, 0.008);
  const bookcaseLowerStartX = -bookcaseInnerWidth * 0.18;
  const bookcaseDrawerWidth =
    bookcaseLowerStartX + bookcaseInnerWidth * 0.5 - bookcaseDrawerSpacing * 0.5;
  const bookcaseDrawerRemainingWidth =
    bookcaseInnerWidth - bookcaseDrawerWidth - bookcaseDrawerSpacing;
  const bookcaseDrawerFrontHeight =
    (bookcaseDrawerHeight - bookcaseDrawerSpacing * (bookcaseDrawerCount - 1)) /
    bookcaseDrawerCount;
  for (let drawerSlotIndex = 0; drawerSlotIndex < bookcaseDrawerCount; drawerSlotIndex += 1) {
    const drawerCenterY =
      bookcaseDrawerGap +
      bookcaseDrawerFrontHeight * 0.5 +
      drawerSlotIndex * (bookcaseDrawerFrontHeight + bookcaseDrawerSpacing);
    addBoxMesh(
      itemGroup,
      bookcaseDrawerWidth,
      bookcaseDrawerFrontHeight,
      0.026,
      -bookcaseInnerWidth * 0.5 + bookcaseDrawerWidth * 0.5,
      drawerCenterY,
      bookcaseFrontZ,
      furnitureColor,
      {
        ...bookcasePanelOptions,
        roughness: 0.55
      }
    );
    addBoxMesh(
      itemGroup,
      bookcaseDrawerRemainingWidth,
      bookcaseDrawerFrontHeight,
      0.026,
      bookcaseLowerStartX + bookcaseDrawerSpacing * 0.5 + bookcaseDrawerRemainingWidth * 0.5,
      drawerCenterY,
      bookcaseFrontZ,
      furnitureSoftColor,
      {
        ...bookcasePanelOptions,
        roughness: 0.55
      }
    );
  }
  const bookcaseBackPanelHeight =
    itemHeight * (bookcaseShelfRatios[2] - bookcaseShelfRatios[1]) - bookcaseSideThickness * 1.15;
  addBoxMesh(
    itemGroup,
    bookcaseMainBayWidth * 0.97,
    bookcaseBackPanelHeight,
    0.028,
    bookcaseMainBayCenterX,
    itemHeight * (bookcaseShelfRatios[1] + bookcaseShelfRatios[2]) * 0.5,
    bookcaseFrontZ,
    furnitureColor,
    {
      ...bookcasePanelOptions,
      roughness: 0.54
    }
  );
  const bookSpineColors = [
    14276045,
    12499117,
    10459536,
    7828334,
    furnitureLightColor,
    furnitureSoftColor
  ];
  /**
   * 按可用宽度往一层书架上排满书脊，排不下就提前收尾。书脊宽 = (可用宽 − 间隙) / count，并保底 26mm（再窄就看不出是书）；
   * 每本再乘 0.68~1.04 的宽系数与 0.68~0.94 的高系数错开尺寸；种子为奇数时最后一本倾斜 0.07 弧度，模拟真书架里那本歪着的书。
   * @param {object} shelfSpec 本层规格（startX / maxWidth / shelfY / availableHeight / count / seed）。
   */
  const fillBookShelf = ({
    startX: shelfStartX,
    maxWidth: shelfMaxWidth,
    shelfY: shelfY,
    availableHeight: shelfAvailableHeight,
    count: shelfBookCount = 6,
    seed: shelfSeed = 0
  }) => {
    const bookSpineGap = Math.max(shelfMaxWidth * 0.018, 0.006);
    const bookSpineWidth = Math.max(
      (shelfMaxWidth - bookSpineGap * (shelfBookCount + 1)) / shelfBookCount,
      0.026
    );
    let bookSpineCursorX = shelfStartX + bookSpineGap;
    for (let bookSpineIndex = 0; bookSpineIndex < shelfBookCount; bookSpineIndex += 1) {
      const bookWidthRatio = [0.72, 0.9, 0.78, 1.04, 0.82, 0.68][
        (bookSpineIndex + shelfSeed) % 6
      ];
      const bookActualWidth = bookSpineWidth * bookWidthRatio;
      const bookHeightRatio = [0.72, 0.88, 0.78, 0.94, 0.82, 0.68][
        (bookSpineIndex * 2 + shelfSeed) % 6
      ];
      const bookSpineHeight = shelfAvailableHeight * bookHeightRatio;
      if (bookSpineCursorX + bookActualWidth > shelfStartX + shelfMaxWidth - bookSpineGap) {
        break;
      }
      const bookSpineMesh = addBoxMesh(
        itemGroup,
        bookActualWidth,
        bookSpineHeight,
        itemDepth * (0.47 + ((bookSpineIndex + shelfSeed) % 3) * 0.045),
        bookSpineCursorX + bookActualWidth * 0.5,
        shelfY + bookSpineHeight * 0.5,
        itemDepth * 0.15,
        bookSpineColors[(bookSpineIndex + shelfSeed) % bookSpineColors.length],
        {
          radius: Math.min(bookActualWidth * 0.14, 0.012),
          roughness: 0.78,
          metalness: 0
        }
      );
      if (bookSpineIndex === shelfBookCount - 1 && shelfSeed % 2 === 1) {
        bookSpineMesh.rotation.z = -0.07;
      }
      bookSpineCursorX += bookActualWidth + bookSpineGap;
    }
  };
  /**
   * 平叠一小摞书，用于书柜主格里的点缀。stackX / stackY 是叠放中心与底层台面高度（米），stackWidth 为书宽，stackBookCount
   * 为叠放本数（默认 3），stackColorSeed 为取色种子。
   */
  const addFlatBookStack = (
    stackX,
    stackY,
    stackWidth,
    stackBookCount = 3,
    stackColorSeed = 0
  ) => {
    for (let stackBookIndex = 0; stackBookIndex < stackBookCount; stackBookIndex += 1) {
      addBoxMesh(
        itemGroup,
        stackWidth,
        bookcaseSideThickness * 0.54,
        itemDepth * 0.48,
        stackX,
        stackY + bookcaseSideThickness * (0.38 + stackBookIndex * 0.56),
        itemDepth * 0.15,
        bookSpineColors[(stackBookIndex + stackColorSeed) % bookSpineColors.length],
        {
          radius: 0.007,
          roughness: 0.78,
          metalness: 0
        }
      );
    }
  };
  const firstShelfY = itemHeight * bookcaseShelfRatios[0] + bookcaseSideThickness * 0.5;
  fillBookShelf({
    startX: -bookcaseInnerWidth * 0.47,
    maxWidth: bookcaseInnerWidth * 0.29,
    shelfY: firstShelfY,
    availableHeight: itemHeight * 0.15,
    count: 5,
    seed: 2
  });
  fillBookShelf({
    startX: bookcaseInnerWidth * 0.04,
    maxWidth: bookcaseInnerWidth * 0.38,
    shelfY: firstShelfY,
    availableHeight: itemHeight * 0.16,
    count: 7,
    seed: 4
  });
  const secondShelfY = itemHeight * bookcaseShelfRatios[1] + bookcaseSideThickness * 0.5;
  fillBookShelf({
    startX: bookcaseSideBayX + bookcaseSideThickness * 0.6,
    maxWidth: bookcaseSideBayWidth * 0.82,
    shelfY: secondShelfY,
    availableHeight: itemHeight * 0.075,
    count: 4,
    seed: 1
  });
  const thirdShelfY = itemHeight * bookcaseShelfRatios[2] + bookcaseSideThickness * 0.5;
  fillBookShelf({
    startX: -bookcaseInnerWidth * 0.47,
    maxWidth: bookcaseMainBayWidth * 0.42,
    shelfY: thirdShelfY,
    availableHeight: itemHeight * 0.14,
    count: 6,
    seed: 0
  });
  addBoxMesh(
    itemGroup,
    bookcaseMainBayWidth * 0.17,
    itemHeight * 0.12,
    0.022,
    bookcaseMainBayCenterX + bookcaseMainBayWidth * 0.27,
    thirdShelfY + itemHeight * 0.065,
    itemDepth * 0.22,
    11972517,
    {
      rounded: false,
      roughness: 0.5
    }
  );
  addBoxMesh(
    itemGroup,
    bookcaseMainBayWidth * 0.125,
    itemHeight * 0.085,
    0.026,
    bookcaseMainBayCenterX + bookcaseMainBayWidth * 0.27,
    thirdShelfY + itemHeight * 0.065,
    itemDepth * 0.235,
    7762283,
    {
      rounded: false,
      roughness: 0.42
    }
  );
  addFlatBookStack(bookcaseSideBayCenterX, thirdShelfY, bookcaseSideBayWidth * 0.48, 3, 3);
  const fourthShelfY = itemHeight * bookcaseShelfRatios[3] + bookcaseSideThickness * 0.5;
  addFlatBookStack(
    bookcaseMainBayCenterX - bookcaseMainBayWidth * 0.22,
    fourthShelfY,
    bookcaseMainBayWidth * 0.24,
    2,
    1
  );
  addCylinderMesh(
    itemGroup,
    bookcaseMainBayWidth * 0.055,
    bookcaseMainBayWidth * 0.075,
    itemHeight * 0.12,
    bookcaseMainBayCenterX - bookcaseMainBayWidth * 0.08,
    fourthShelfY + itemHeight * 0.06,
    itemDepth * 0.12,
    5196615,
    {
      segments: 22,
      roughness: 0.66
    }
  );
  addCylinderMesh(
    itemGroup,
    bookcaseMainBayWidth * 0.045,
    bookcaseMainBayWidth * 0.064,
    itemHeight * 0.15,
    bookcaseMainBayCenterX + bookcaseMainBayWidth * 0.08,
    fourthShelfY + itemHeight * 0.075,
    itemDepth * 0.12,
    6643802,
    {
      segments: 22,
      roughness: 0.66
    }
  );
  addFlatBookStack(bookcaseSideBayCenterX, fourthShelfY, bookcaseSideBayWidth * 0.5, 2, 4);
}

