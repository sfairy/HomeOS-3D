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
 *
 * 与 `tools/models/model-specs.mjs` 的 bookcase **逐件同构**：落地踢脚 + 双侧板 + 中竖板（分左右两列）
 * + 下柜底板 + 四层层板 + 背板 + 顶板 + 下柜双门与竖条拉手，格口里两列摆满书、最上层右格留给摆件。
 *
 * 为什么连「书的排布」都要跟着对：占位只活到 GLB 落地那一帧。如果占位是几块空板、成品是满架书，
 * 加载完成的一瞬间整件会从空架子涨出一堆书 —— 那一下比占位本身粗糙得多。这里只求**看起来等价**：
 * 书脊宽度 / 高度按固定比值错落、整排占格口 86%、尾巴两本斜靠、旁边一摞平放，全部用同一组常量推。
 * 精确到毫米的排布归规格一份，不必在运行侧再写一遍（两份真值必然走散）。
 *
 * y 一律给**底面**高度（与规格同语义）。吊柜把离地高度写进构造器的教训见 `buildWallcabinetItem`。
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
    itemWidth
  } = context;
  // 三轴的「规格米 → 实际米」倍率。规格基准：宽 1.2 / 高 1.9 / 深 0.32。
  const scaleX = itemWidth / 1.2;
  const scaleY = itemHeight / 1.9;
  const scaleZ = itemDepth / 0.32;
  /**
   * 按「规格里的米」摆一个方块（y 给**底面**高度，与规格一致）。
   */
  const addBookcaseBlock = (
    specWidth,
    specHeight,
    specDepth,
    specX,
    specBottomY,
    specZ,
    color,
    options
  ) =>
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
  const CARCASS = { rounded: false, roughness: 0.62, metalness: 0.015 };
  const PANEL = { rounded: false, roughness: 0.55, metalness: 0.015 };
  const SHELF = { rounded: false, roughness: 0.6, metalness: 0.015 };
  // ── 柜体 ──
  // 踢脚（正面让开 4cm）· 双侧板（咬进顶板 1cm、比顶板窄 2mm）· 中竖板 · 背板。
  addBookcaseBlock(1.12, 0.06, 0.24, 0, 0, -0.02, furnitureColor, CARCASS);
  addBookcaseBlock(0.02, 1.8, 0.29, -0.588, 0.06, -0.005, furnitureColor, CARCASS);
  addBookcaseBlock(0.02, 1.8, 0.29, 0.588, 0.06, -0.005, furnitureColor, CARCASS);
  addBookcaseBlock(0.016, 1.34, 0.29, 0, 0.52, -0.005, furnitureColor, CARCASS);
  addBookcaseBlock(1.146, 1.765, 0.014, 0, 0.08, -0.141, furnitureColor, {
    rounded: false,
    roughness: 0.68,
    metalness: 0.015
  });
  // 下柜底板 + 四层层板（0.51 那块同时是下柜顶面）。
  const bookcaseShelfBottoms = [0.51, 0.852, 1.192, 1.532];
  addBookcaseBlock(1.15, 0.018, 0.25, 0, 0.062, -0.005, furnitureSoftColor, SHELF);
  for (const shelfBottomY of bookcaseShelfBottoms) {
    addBookcaseBlock(1.15, 0.018, 0.25, 0, shelfBottomY, -0.005, furnitureSoftColor, SHELF);
  }
  // ── 下柜双门 + 竖条拉手（门面到 0.146、拉手到 0.16，与顶板前缘齐平）──
  for (const doorSide of [-1, 1]) {
    addBookcaseBlock(0.556, 0.426, 0.016, doorSide * 0.29, 0.072, 0.138, furnitureSoftColor, {
      ...PANEL,
      radius: 0.003
    });
    addBookcaseBlock(0.014, 0.14, 0.016, doorSide * 0.045, 0.32, 0.152, furnitureSoftColor, PANEL);
  }
  // ── 顶板：占地 1.2 × 0.32 由它定 ──
  addBookcaseBlock(1.2, 0.05, 0.32, 0, 1.85, 0, furnitureSoftColor, {
    rounded: false,
    roughness: 0.5,
    metalness: 0.015
  });
  // ── 格口里的书 ──
  // 与规格 `bookcaseShelfContents` 同一张表：每格地板 = 层板底面 + 板厚 − 4mm（书底咬进层板，
  // 免得书底与层板面严格贴合），净高打 88 折；左右两列的取色序不同，两柜书才不会撞成一排同色。
  const BOOK_DEPTH_BY_ROW = [0.13, 0.153, 0.176];
  const bookcaseBookPalettes = [
    [furnitureLightColor, 0xa9563f, furnitureSoftColor, 0xcbb289],
    [0xa9563f, furnitureLightColor, 0xcbb289, furnitureSoftColor]
  ];
  const BOOK_WIDTH_RATIOS = [0.72, 0.95, 0.8, 1.06, 0.86, 0.68];
  const BOOK_HEIGHT_RATIOS = [0.72, 0.94, 0.8, 1.0, 0.86, 0.62];
  const BOOK_BOOK_OPTIONS = { rounded: false, roughness: 0.82, metalness: 0, radius: 0.002 };
  /**
   * 一排书 + 尾巴两本斜靠 +（可选）旁边一摞平放。
   * @param {object} rowSpec fromX / toX / bottomY / maxHeight / palette / seed / withStack。
   */
  const fillBookcaseRow = ({
    fromX,
    toX,
    bottomY,
    maxHeight,
    palette,
    seed,
    withStack = false
  }) => {
    const totalWidth = toX - fromX;
    // 平放那一摞先占位（与规格同理：先摆满整排再拿摞去挤，末尾几本会戳进侧板）。
    const stackWidth = withStack ? 0.19 : 0;
    const rowWidth = totalWidth - (withStack ? stackWidth + 0.025 : 0);
    const fillWidth = rowWidth * 0.86;
    const bookGap = 0.0015;
    const rowBookCount = 16;
    const bookWidth = Math.max((fillWidth - bookGap * rowBookCount) / rowBookCount, 0.02);
    let cursorX = fromX;
    for (let bookIndex = 0; bookIndex < rowBookCount; bookIndex += 1) {
      const width = bookWidth * BOOK_WIDTH_RATIOS[(bookIndex + seed) % BOOK_WIDTH_RATIOS.length];
      if (cursorX + width - fromX > fillWidth) {
        break;
      }
      const height = maxHeight * BOOK_HEIGHT_RATIOS[(bookIndex * 2 + seed) % BOOK_HEIGHT_RATIOS.length];
      addBookcaseBlock(
        width,
        height,
        BOOK_DEPTH_BY_ROW[(bookIndex + seed) % BOOK_DEPTH_BY_ROW.length],
        cursorX + width / 2,
        bottomY,
        0.01,
        palette[(bookIndex + seed) % palette.length],
        BOOK_BOOK_OPTIONS
      );
      cursorX += width + bookGap;
    }
    // 收口：两本斜靠（第二本更斜，也只在完整版里保留 —— 与规格的 fullOnly 分档一致）。
    if (rowWidth - fillWidth >= 0.055) {
      const leanHeight = maxHeight * 0.86;
      const leanFirst = addBookcaseBlock(
        0.024,
        leanHeight,
        0.15,
        cursorX + 0.016,
        bottomY,
        0.01,
        palette[(seed + 1) % palette.length],
        BOOK_BOOK_OPTIONS
      );
      leanFirst.rotation.z = -0.19;
      const leanSecond = addBookcaseBlock(
        0.022,
        leanHeight * 0.94,
        0.145,
        cursorX + 0.042,
        bottomY,
        0.01,
        palette[(seed + 2) % palette.length],
        BOOK_BOOK_OPTIONS
      );
      leanSecond.rotation.z = -0.38;
    }
    // 一摞平放的书（2~3 本，每高一层往里错 6mm）：格口里的层次感大半来自它。
    if (!withStack) {
      return;
    }
    let stackBottomY = bottomY;
    for (let stackIndex = 0; stackIndex < 3; stackIndex += 1) {
      const stackThickness = 0.034;
      if (stackBottomY + stackThickness - bottomY > maxHeight) {
        break;
      }
      addBookcaseBlock(
        stackWidth - stackIndex * 0.012,
        stackThickness,
        0.2,
        fromX + totalWidth - stackWidth / 2 + stackIndex * 0.006,
        stackBottomY,
        0.01,
        palette[stackIndex % palette.length],
        BOOK_BOOK_OPTIONS
      );
      stackBottomY += stackThickness + 0.001;
    }
  };
  const BOOKCASE_TOP_BOARD_BOTTOM_Y = 1.85;
  const bookcaseColumnRight = { fromX: 0.035, toX: 0.55 };
  const bookcaseColumnLeft = { fromX: -0.55, toX: -0.035 };
  bookcaseShelfBottoms.forEach((shelfBottomY, shelfLevel) => {
    const floorY = shelfBottomY + 0.018 - 0.004;
    const ceilingY =
      shelfLevel === bookcaseShelfBottoms.length - 1
        ? BOOKCASE_TOP_BOARD_BOTTOM_Y
        : bookcaseShelfBottoms[shelfLevel + 1];
    const maxHeight = (ceilingY - floorY) * 0.88;
    // 最上层右列让给摆件（花瓶 + 相框），左列照旧摆书。
    if (shelfLevel === 3) {
      fillBookcaseRow({
        ...bookcaseColumnLeft,
        bottomY: floorY,
        maxHeight,
        palette: bookcaseBookPalettes[0],
        seed: shelfLevel + 2
      });
      return;
    }
    fillBookcaseRow({
      ...bookcaseColumnRight,
      bottomY: floorY,
      maxHeight,
      palette: bookcaseBookPalettes[0],
      seed: shelfLevel + 2,
      withStack: shelfLevel % 2 === 0
    });
    fillBookcaseRow({
      ...bookcaseColumnLeft,
      bottomY: floorY,
      maxHeight,
      palette: bookcaseBookPalettes[1],
      seed: shelfLevel + 5,
      withStack: shelfLevel % 2 === 1
    });
  });
  // ── 最上层右列的摆件：一只收口花瓶 + 一个相框 ──
  addBookcaseBlock(0.18, 0.158, 0.02, 0.42, 1.546, 0.01, furnitureSoftColor, {
    rounded: false,
    roughness: 0.5,
    metalness: 0.015
  });
  addBookcaseBlock(0.148, 0.057, 0.03, 0.42, 1.704, 0.005, furnitureSoftColor, {
    rounded: false,
    roughness: 0.5,
    metalness: 0.015
  });
  // 花瓶用两段圆柱近似规格里的回转体（底径 0.05 → 收口 0.024，高 0.24）。
  addCylinderMesh(
    itemGroup,
    0.05 * scaleX,
    0.05 * scaleX,
    0.082 * scaleY,
    0.16 * scaleX,
    (1.546 + 0.041) * scaleY,
    0.02 * scaleZ,
    furnitureSoftColor,
    { segments: 18, roughness: 0.66, metalness: 0.02 }
  );
  addCylinderMesh(
    itemGroup,
    0.024 * scaleX,
    0.045 * scaleX,
    0.158 * scaleY,
    0.16 * scaleX,
    (1.628 + 0.079) * scaleY,
    0.02 * scaleZ,
    furnitureSoftColor,
    { segments: 18, roughness: 0.66, metalness: 0.02 }
  );
}

