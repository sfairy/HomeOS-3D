/*
 * 物件构建器：储物与墙面造型
 *
 * 这些构建体原先都在 studio-app.js 的 buildItemModel 里，是一条 5700 行的 if/else 链；
 * 现在按物件类别分文件，每个函数收一个 context：
 *   - 类型词表（LIGHT_ITEM_TYPES 等）直接 import ../studio-item-types.js；
 *   - 本次调用的入参与度量、以及 studio-app.js 私有的网格构造 / 收尾工具，全部从 context 取，
 *     函数顶部只解构自己用到的名字 —— 于是每个构建体的外部依赖是可数的。
 *
 * 餐边柜、鞋柜、地柜、层板、壁柜，以及立柱 / 平面标签 / 背景墙 / 壁画这四个小构建体。
 */
/**
 * 把颜色朝白（amount > 0）或朝黑（amount < 0）插值。纯整数运算。
 * 与 studio-material-styles.js 的 shadeColor 是同一条公式：两边的内衬色必须算得一样，
 * 否则 GLB 到位的一瞬间柜内会「变一下色」。
 * @param {number} color 0xRRGGBB
 * @param {number} amount -1..1
 * @returns {number} 0xRRGGBB
 */
function shadeColor(color, amount) {
  const target = amount >= 0 ? 255 : 0;
  const weight = Math.abs(amount);
  const channel = shift => {
    const value = (color >> shift) & 255;
    return Math.round(value + (target - value) * weight);
  };
  return (channel(16) << 16) | (channel(8) << 8) | channel(0);
}
/**
 * 命中：itemSpec.type === "planlabel"
 */
export function buildPlanlabelItem(context) {
  const { buildPlanLabelMesh, itemGroup, itemSpec } = context;
  itemGroup.add(buildPlanLabelMesh(itemSpec));
}

/**
 * 命中：itemSpec.type === "mural"
 */
export function buildMuralItem(context) {
  const {
    buildMuralItemMeshGroup,
    furnitureDarkColor,
    furnitureLightColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
  } = context;
  buildMuralItemMeshGroup(
    itemGroup,
    itemSpec,
    itemWidth,
    itemDepth,
    itemHeight,
    furnitureDarkColor,
    furnitureLightColor
  );
}

/**
 * 命中：itemSpec.type === "featurewall"
 */
export function buildFeaturewallItem(context) {
  const {
    buildFeatureWallItemMeshGroup,
    itemDepth,
    itemGroup,
    itemHeight,
    itemSpec,
    itemWidth,
  } = context;
  buildFeatureWallItemMeshGroup(itemGroup, itemSpec, itemWidth, itemDepth, itemHeight);
}

/**
 * 命中：itemSpec.type === "sideboard"
 *
 * 形体与流水线那件（tools/models/model-specs.mjs 的 sideboard）**同构**：
 * 下柜 → 石台面 → 敞开的操作格（带背板）→ 上柜，上柜最右一扇是茶色玻璃门。
 * 这层只是 GLB 到位前的过渡几何（见 studio-external-models.js 里 loadExternalModel 的降级路径），
 * 比例 / 基色 / 透明度都照流水线抄；早先这里是「下柜 + 凹进去的抽屉带 + 上柜」的形体，
 * 与真正的餐边柜差着一道敞开格，切到 GLB 时整件会明显跳一下。
 */
export function buildSideboardItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth,
    threeModuleMin,
  } = context;
  // 比例取自规格：下柜 0–0.39H、台面骑在 0.39H 这道缝上、操作格 0.39–0.61H、上柜 0.61–1.0H。
  const sideboardLowerHeight = itemHeight * 0.39;
  const sideboardNicheTop = itemHeight * 0.61;
  const sideboardUpperHeight = itemHeight - sideboardNicheTop;
  const sideboardCounterThickness = itemHeight * 0.0205;
  const sideboardDoorWidth = itemWidth * 0.31;
  const sideboardDoorThickness = itemDepth * 0.058;
  const sideboardDoorZ = itemDepth * 0.471;
  const sideboardLowerDoorBottom = itemHeight * 0.0156;
  const sideboardLowerDoorHeight = itemHeight * 0.3432;
  const sideboardUpperDoorBottom = itemHeight * 0.6373;
  const sideboardUpperDoorHeight = itemHeight * 0.3354;
  // 门板与整扇玻璃门同色系：上柜三扇门并排，玻璃那扇不能带一圈深色木框。
  const sideboardDoorColor = furnitureSoftColor;
  // 玻璃：色号 / 不透明度 / 双面 / 不写深度，都与运行侧按 glass 角色给的配方对齐，
  // 也即与玻璃柜（glasscabinet）那扇玻璃门同款 —— 玻璃柜的色号由调色板从它烘进 GLB 的
  // 蓝灰基色提亮而来，所以要写**提亮之后**的 0xa9c5d3。
  const sideboardGlassColor = 0xa9c5d3;
  const sideboardGlassOptions = {
    rounded: false,
    transparent: true,
    opacity: 0.28,
    depthWrite: false,
    side: threeModuleMin.DoubleSide,
    roughness: 0.12,
    metalness: 0.04,
    castShadow: false,
    receiveShadow: false,
    renderOrder: 7
  };
  // 箱体：收到门板之后（进深减去门板厚度），把最前缘让给门板与台面。
  const sideboardCarcassDepth = itemDepth - sideboardDoorThickness;
  const sideboardCarcassZ = -sideboardDoorThickness * 0.5;
  // 上柜围板厚度（1.8cm 一档）。上柜必须是**空心柜体**：玻璃门后面若贴着实体，玻璃到后壁
  // 只剩 2cm，无论透明度调到多少都会读成「一块深色板」—— 流水线那件（model-specs.mjs 的
  // sideboard）留了 40cm 空腔，这里必须跟着一样，否则 GLB 到位的一瞬间柜子会「凹进去」。
  const sideboardPanelThickness = Math.min(Math.max(itemWidth * 0.01125, 0.014), 0.024);
  const sideboardUpperInnerWidth = itemWidth - sideboardPanelThickness * 2;
  const sideboardBackHeight = sideboardUpperHeight - sideboardPanelThickness * 2;
  const sideboardInnerY = sideboardNicheTop + sideboardPanelThickness;
  const sideboardDividerDepth = sideboardCarcassDepth - sideboardPanelThickness * 2;
  const sideboardDividerZ =
    -itemDepth * 0.5 + sideboardPanelThickness + sideboardDividerDepth * 0.5;
  // 柜内衬 ≠ 柜体色：玻璃后面那面若跟着深色柜体走，玻璃会读成一个黑洞；跟柜门走又会让
  // 玻璃和实心门分不出来。取**柜体色朝白提 45%** 的中间调 —— 与流水线那件同一条公式
  // （studio-material-styles.js 的 joineryCombo 内衬默认值），两边算出来必须是同一个色。
  const sideboardInteriorColor = shadeColor(furnitureColor, 0.45);
  addBoxMesh(
    itemGroup,
    itemWidth,
    sideboardLowerHeight,
    sideboardCarcassDepth,
    0,
    sideboardLowerHeight * 0.5,
    sideboardCarcassZ,
    furnitureColor,
    {
      roughness: 0.58
    }
  );
  // 上柜：空心柜体。左右侧板夹住顶底板，围出一只空腔；背板走柜内衬色（透过玻璃直视的就是它）。
  for (const sideboardSide of [-1, 1]) {
    addBoxMesh(
      itemGroup,
      sideboardPanelThickness,
      sideboardUpperHeight,
      sideboardCarcassDepth,
      sideboardSide * (itemWidth * 0.5 - sideboardPanelThickness * 0.5),
      sideboardNicheTop + sideboardUpperHeight * 0.5,
      sideboardCarcassZ,
      furnitureColor,
      {
        roughness: 0.58
      }
    );
  }
  for (const sideboardRailY of [
    sideboardNicheTop + sideboardPanelThickness * 0.5,
    itemHeight - sideboardPanelThickness * 0.5
  ]) {
    addBoxMesh(
      itemGroup,
      sideboardUpperInnerWidth,
      sideboardPanelThickness,
      sideboardCarcassDepth,
      0,
      sideboardRailY,
      sideboardCarcassZ,
      furnitureColor,
      {
        roughness: 0.58
      }
    );
  }
  addBoxMesh(
    itemGroup,
    sideboardUpperInnerWidth,
    sideboardBackHeight,
    sideboardPanelThickness,
    0,
    sideboardInnerY + sideboardBackHeight * 0.5,
    -itemDepth * 0.5 + sideboardPanelThickness * 0.5,
    sideboardInteriorColor,
    {
      roughness: 0.5
    }
  );
  // 中立板 ×2：把上柜分成三格、正对三扇门；透过玻璃能看见右格那一道。
  for (const sideboardDividerOffset of [-1, 1]) {
    addBoxMesh(
      itemGroup,
      sideboardPanelThickness,
      sideboardBackHeight,
      sideboardDividerDepth,
      sideboardDividerOffset * itemWidth * 0.165,
      sideboardInnerY + sideboardBackHeight * 0.5,
      sideboardDividerZ,
      sideboardInteriorColor,
      {
        roughness: 0.5
      }
    );
  }
  // 右格层板：全件里唯一一扇透明门后面看得见的那块（另两格被实心门挡着，不放）。
  addBoxMesh(
    itemGroup,
    itemWidth * 0.306,
    sideboardPanelThickness,
    sideboardDividerDepth,
    itemWidth * 0.33,
    itemHeight * 0.8,
    sideboardDividerZ,
    sideboardInteriorColor,
    {
      roughness: 0.5
    }
  );
  // 石台面：整件最宽最深的一件，骑在下柜与操作格之间那道缝上，占地 1.6 × 0.45 由它定。
  addBoxMesh(
    itemGroup,
    itemWidth,
    sideboardCounterThickness,
    itemDepth,
    0,
    sideboardLowerHeight,
    0,
    furnitureSoftColor,
    {
      roughness: 0.5
    }
  );
  // 操作格背板：立在台面之上、贴着后背，让敞开的格子有底，而不是直接看穿到墙。
  addBoxMesh(
    itemGroup,
    itemWidth,
    sideboardNicheTop - sideboardLowerHeight,
    itemDepth * 0.1,
    0,
    (sideboardLowerHeight + sideboardNicheTop) * 0.5,
    -itemDepth * 0.45,
    furnitureColor,
    {
      roughness: 0.58
    }
  );
  for (const sideboardDoorOffset of [-0.33, 0, 0.33]) {
    const sideboardDoorX = itemWidth * sideboardDoorOffset;
    addBoxMesh(
      itemGroup,
      sideboardDoorWidth,
      sideboardLowerDoorHeight,
      sideboardDoorThickness,
      sideboardDoorX,
      sideboardLowerDoorBottom + sideboardLowerDoorHeight * 0.5,
      sideboardDoorZ,
      sideboardDoorColor,
      {
        rounded: false,
        roughness: 0.45
      }
    );
    const sideboardUpperDoorCenterY = sideboardUpperDoorBottom + sideboardUpperDoorHeight * 0.5;
    // 左 / 中两扇上柜门是与下柜同款的门板；只有最右一扇（offset 0.33）是茶玻门。
    if (sideboardDoorOffset !== 0.33) {
      addBoxMesh(
        itemGroup,
        sideboardDoorWidth,
        sideboardUpperDoorHeight,
        sideboardDoorThickness,
        sideboardDoorX,
        sideboardUpperDoorCenterY,
        sideboardDoorZ,
        sideboardDoorColor,
        {
          rounded: false,
          roughness: 0.45
        }
      );
      continue;
    }
    // 整扇玻璃：没有木框，外沿与另两扇门逐尺寸相同，三扇门才站在同一条门缝线上。
    addBoxMesh(
      itemGroup,
      sideboardDoorWidth,
      sideboardUpperDoorHeight,
      sideboardDoorThickness * 0.77,
      sideboardDoorX,
      sideboardUpperDoorCenterY,
      sideboardDoorZ,
      sideboardGlassColor,
      sideboardGlassOptions
    );
  }
}

/**
 * 命中：itemSpec.type === "shoecabinet"
 *
 * 鞋柜：落地踢脚 + 左列换鞋凳 / 四层敞开鞋格 / 上柜双短门 + 右列下柜双门 / 敞开中格 / 上柜双门
 * + 木顶板；六处敞开格里摆着成双的鞋。
 *
 * 占位几何**必须与规格逐段对齐**（tools/models/model-specs.mjs 的 shoecabinet）：这一件是
 * 「左半一张换鞋凳、右半一列柜门」这种非骨架造型，占位的分段一旦与成品不同，GLB 落地那一帧
 * 整件会跳一次形。规格里的米值在这里按 `addShoeBlock` 逐件搬过来，y 一律给**底面**高度
 * （与规格同语义）—— 吊柜当年把离地高度写进构造器、规格里却是 0 基，两套坐标对不上，
 * 加载完成时整件会从地上弹到墙上，这个坑就踩过一次。
 */
export function buildShoecabinetItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureDarkColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth
  } = context;
  // 三轴的「规格米 → 实际米」倍率。规格基准：宽 1.8 / 高 2.25 / 深 0.42。
  const scaleX = itemWidth / 1.8;
  const scaleY = itemHeight / 2.25;
  const scaleZ = itemDepth / 0.42;
  /** 按「规格里的米」摆一个方块（y 给**底面**高度，与规格一致）。 */
  const addShoeBlock = (
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
  const SHOE_CARCASS = { rounded: false, roughness: 0.62, metalness: 0.015 };
  const SHOE_BOARD = { rounded: false, roughness: 0.6, metalness: 0.015 };
  const SHOE_FACE = { rounded: false, roughness: 0.5, metalness: 0.015 };
  const SHOE_DOOR = { rounded: false, roughness: 0.55, metalness: 0.015 };
  const SHOE_HANDLE = { rounded: false, roughness: 0.45, metalness: 0.3 };
  // ── 骨架：踢脚 · 双侧板 / 中竖板 · 背板 ──
  addShoeBlock(1.72, 0.06, 0.34, 0, 0, -0.01, furnitureColor, SHOE_CARCASS);
  for (const shoecabinetPanelX of [-0.888, 0, 0.888]) {
    addShoeBlock(0.02, 2.14, 0.4, shoecabinetPanelX, 0.06, 0, furnitureColor, SHOE_CARCASS);
  }
  addShoeBlock(1.748, 2.09, 0.014, 0, 0.1, -0.183, furnitureColor, {
    rounded: false,
    roughness: 0.68,
    metalness: 0.015
  });
  // ── 左列：换鞋凳箱体 · 石面坐板 · 四层鞋格（含上柜底板）──
  addShoeBlock(0.868, 0.36, 0.385, -0.444, 0.06, 0.0075, furnitureColor, SHOE_CARCASS);
  addShoeBlock(0.868, 0.03, 0.405, -0.444, 0.42, 0.0175, furnitureSoftColor, SHOE_FACE);
  for (const shoecabinetShelfY of [0.78, 1.11, 1.44, 1.78]) {
    addShoeBlock(0.868, 0.02, 0.374, -0.444, shoecabinetShelfY, 0.013, furnitureSoftColor, SHOE_BOARD);
  }
  // ── 右列：下柜底板 · 柜内中隔板 · 中格底面（台面）· 上柜底板 · 上柜中隔板 ──
  addShoeBlock(0.868, 0.02, 0.374, 0.444, 0.06, 0.013, furnitureSoftColor, SHOE_BOARD);
  addShoeBlock(0.868, 0.018, 0.374, 0.444, 0.52, 0.013, furnitureSoftColor, SHOE_BOARD);
  addShoeBlock(0.868, 0.02, 0.374, 0.444, 0.98, 0.013, furnitureSoftColor, SHOE_FACE);
  addShoeBlock(0.868, 0.02, 0.374, 0.444, 1.4, 0.013, furnitureSoftColor, SHOE_BOARD);
  addShoeBlock(0.868, 0.018, 0.374, 0.444, 1.8, 0.013, furnitureSoftColor, SHOE_BOARD);
  // ── 六扇门板 + 竖条拉手（门面到 0.216、拉手到 0.22，与坐板 / 顶板正面齐平）──
  const shoecabinetDoorTable = [
    [0.234, 0.08, 0.88],
    [0.676, 0.08, 0.88],
    [0.234, 1.42, 0.74],
    [0.676, 1.42, 0.74],
    [-0.234, 1.8, 0.36],
    [-0.676, 1.8, 0.36]
  ];
  for (const [shoecabinetDoorX, shoecabinetDoorBottomY, shoecabinetDoorHeight] of shoecabinetDoorTable) {
    addShoeBlock(
      0.418,
      shoecabinetDoorHeight,
      0.016,
      shoecabinetDoorX,
      shoecabinetDoorBottomY,
      0.208,
      furnitureSoftColor,
      SHOE_DOOR
    );
  }
  const shoecabinetHandleTable = [
    [0.41, 0.46],
    [0.5, 0.46],
    [0.41, 1.7],
    [0.5, 1.7],
    [-0.41, 1.9],
    [-0.5, 1.9]
  ];
  for (const [shoecabinetHandleX, shoecabinetHandleBottomY] of shoecabinetHandleTable) {
    addShoeBlock(
      0.014,
      0.16,
      0.014,
      shoecabinetHandleX,
      shoecabinetHandleBottomY,
      0.213,
      furnitureSoftColor,
      SHOE_HANDLE
    );
  }
  // ── 顶板：占地 1.8 × 0.42 与整件最高的一件都由它定 ──
  addShoeBlock(1.8, 0.05, 0.42, 0, 2.2, 0.01, furnitureSoftColor, SHOE_FACE);
  // ── 六处敞开格里的鞋 ──
  // 占位里一双鞋只给**一件方块**：规格里拆成鞋底 / 鞋帮 / 鞋头是为了正视读得出鞋型，而占位只活到
  // GLB 落地那一帧 —— 一件 0.13 × 0.095 × 0.264（转过 12° 之后的占地）就够把「这一格有东西、
  // 东西有多高」读出来，与规格里的数量、间距、进深位置保持同一张表。
  const shoecabinetBayTable = [
    { floorY: 0.45, fromX: -0.84, toX: -0.05, pairCount: 3 },
    { floorY: 0.8, fromX: -0.84, toX: -0.05, pairCount: 3 },
    { floorY: 1.13, fromX: -0.84, toX: -0.05, pairCount: 2 },
    { floorY: 1.46, fromX: -0.84, toX: -0.05, pairCount: 3 },
    { floorY: 1.0, fromX: 0.05, toX: 0.84, pairCount: 3 }
  ];
  for (const shoecabinetBay of shoecabinetBayTable) {
    const bayUsableWidth = shoecabinetBay.toX - shoecabinetBay.fromX;
    for (let shoecabinetPairIndex = 0; shoecabinetPairIndex < shoecabinetBay.pairCount; shoecabinetPairIndex += 1) {
      const pairCenterX =
        shoecabinetBay.fromX + (bayUsableWidth * (shoecabinetPairIndex + 0.5)) / shoecabinetBay.pairCount;
      for (const shoeSide of [-1, 1]) {
        addShoeBlock(
          0.13,
          0.095,
          0.264,
          pairCenterX + shoeSide * 0.0725,
          shoecabinetBay.floorY,
          -0.02,
          furnitureDarkColor,
          { rounded: false, roughness: 0.7, metalness: 0.02 }
        );
      }
    }
  }
}

/**
 * 命中：itemSpec.type === "cabinet"
 *
 * 衣柜：柜体取棕褐（cabinetBody），正面再盖两扇白色门板（cabinetDoor）。
 * 外部模型那条路径同样跑这个外观（见 studio-external-models.js 的 cabinet 分支），
 * 这里是模型未就绪 / 离线导出时的兜底，两者观感要一致。
 */
export function buildCabinetItem(context) {
  const {
    addBoxMesh,
    furnitureLightColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemWidth,
  } = context;
  const cabinetBodyColor = itemPalette.cabinetBody ?? itemPalette.furniture;
  const cabinetDoorColor = itemPalette.cabinetDoor ?? 16777215;
  addBoxMesh(
    itemGroup,
    itemWidth,
    itemHeight,
    itemDepth,
    0,
    itemHeight / 2,
    0,
    cabinetBodyColor
  );
  // 中缝：两扇门之间的木质缝，宽度略小于门板间隙，保证从正面能看见一条柜体色。
  addBoxMesh(
    itemGroup,
    0.018,
    itemHeight * 0.9,
    itemDepth * 1.01,
    0,
    itemHeight * 0.52,
    itemDepth * 0.01,
    cabinetBodyColor
  );
  // 门板：四周留 4% 宽（上限 6cm）的木质回边，中间留 2cm 缝，两扇门对称。
  const cabinetDoorBorder = Math.min(itemWidth * 0.04, 0.06);
  const cabinetDoorGap = 0.02;
  const cabinetDoorDepth = 0.018;
  const cabinetDoorWidth = Math.max(
    (itemWidth - cabinetDoorBorder * 2 - cabinetDoorGap) / 2,
    0.05
  );
  const cabinetDoorHeight = Math.max(itemHeight - cabinetDoorBorder * 2, 0.1);
  for (const cabinetDoorSign of [-1, 1]) {
    addBoxMesh(
      itemGroup,
      cabinetDoorWidth,
      cabinetDoorHeight,
      cabinetDoorDepth,
      cabinetDoorSign * (cabinetDoorGap / 2 + cabinetDoorWidth / 2),
      itemHeight / 2,
      itemDepth / 2 + cabinetDoorDepth / 2,
      cabinetDoorColor,
      {
        rounded: false,
        roughness: 0.5
      }
    );
  }
  // 拉手：挂在门板前面（门板已从柜体表面外凸，拉手必须再往外一档，否则会被门板吃掉）。
  for (const cabinetHandleOffset of [-0.08, 0.08]) {
    addBoxMesh(
      itemGroup,
      0.025,
      0.16,
      0.035,
      cabinetHandleOffset,
      itemHeight * 0.55,
      itemDepth / 2 + cabinetDoorDepth + 0.006,
      furnitureLightColor,
      {
        metalness: 0.55
      }
    );
  }
}

/**
 * 命中：itemSpec.type === "shelf"
 */
export function buildShelfItem(context) {
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
  const shelfPostSize = Math.min(Math.max(Math.min(itemWidth, itemDepth) * 0.07, 0.028), 0.052);
  const shelfBoardThickness = Math.min(Math.max(itemHeight * 0.022, 0.028), 0.052);
  const shelfBoardDepth = Math.max(itemDepth - shelfPostSize * 1.4, itemDepth * 0.78);
  const shelfPostOptions = {
    rounded: false,
    metalness: 0.62,
    roughness: 0.28
  };
  const shelfBoardOptions = {
    rounded: false,
    metalness: 0.18,
    roughness: 0.48
  };
  for (const postPositionX of [
    -itemWidth * 0.5 + shelfPostSize * 0.5,
    itemWidth * 0.5 - shelfPostSize * 0.5
  ]) {
    for (const postPositionZ of [
      -itemDepth * 0.5 + shelfPostSize * 0.5,
      itemDepth * 0.5 - shelfPostSize * 0.5
    ]) {
      addBoxMesh(
        itemGroup,
        shelfPostSize,
        itemHeight,
        shelfPostSize,
        postPositionX,
        itemHeight * 0.5,
        postPositionZ,
        furnitureColor,
        shelfPostOptions
      );
    }
  }
  for (const shelfHeightRatio of [0.04, 0.26, 0.49, 0.72, 0.96]) {
    addBoxMesh(
      itemGroup,
      itemWidth,
      shelfBoardThickness,
      shelfBoardDepth,
      0,
      itemHeight * shelfHeightRatio,
      0,
      shelfHeightRatio === 0.96 ? furnitureLightColor : furnitureSoftColor,
      shelfBoardOptions
    );
    addBoxMesh(
      itemGroup,
      itemWidth,
      shelfPostSize * 0.65,
      shelfPostSize,
      0,
      itemHeight * shelfHeightRatio,
      -itemDepth * 0.5 + shelfPostSize * 0.5,
      furnitureColor,
      shelfPostOptions
    );
  }
  const shelfClearWidth = Math.max(itemWidth - shelfPostSize * 2, shelfPostSize);
  const shelfTotalHeight = itemHeight * 0.84;
  const shelfDiagonalLength = Math.hypot(shelfClearWidth, shelfTotalHeight);
  for (const diagonalSign of [-1, 1]) {
    const shelfDiagonalBrace = addBoxMesh(
      itemGroup,
      shelfPostSize * 0.48,
      shelfDiagonalLength,
      shelfPostSize * 0.42,
      0,
      itemHeight * 0.5,
      -itemDepth * 0.5 + shelfPostSize * 0.18,
      furnitureColor,
      {
        ...shelfPostOptions,
        castShadow: false
      }
    );
    shelfDiagonalBrace.rotation.z = diagonalSign * Math.atan2(shelfClearWidth, shelfTotalHeight);
  }
}

/**
 * 命中：itemSpec.type === "pillar"
 */
export function buildPillarItem(context) {
  const {
    buildPillarItemMeshGroup,
    itemDepth,
    itemGroup,
    itemHeight,
    itemPalette,
    itemSpec,
    itemWidth,
  } = context;
  buildPillarItemMeshGroup(itemGroup, itemSpec, itemWidth, itemDepth, itemHeight, itemPalette);
}

/**
 * 命中：itemSpec.type === "wallcabinet"
 *
 * 加载中的占位几何，与 tools/models/model-specs.mjs 的 wallcabinet 一一对应（外部 GLB 到位后整组被换掉）。
 *
 * **几何一律从 y = 0 起**：吊柜是挂墙件，离地高度归物件自己的 `elevation`（类型默认 1.6m，
 * 见 studio-app.js 的 ITEM_TYPE_DEFINITIONS），运行侧把整组抬起来。这里若把 1.6 写进构造器，
 * 模型到位之后就会被抬两次 —— 以前写的 1.4 正是这个毛病：占位在 1.4，成品在 0，
 * 「模型加载完成的那一帧」柜子会往下掉 1.4m。
 */
export function buildWallcabinetItem(context) {
  const {
    addBoxMesh,
    furnitureColor,
    furnitureSoftColor,
    itemDepth,
    itemGroup,
    itemHeight,
    itemWidth
  } = context;
  // 三轴的「规格米 → 实际米」倍率。规格基准：宽 1.5 / 高 0.82 / 深 0.35。
  const scaleX = itemWidth / 1.5;
  const scaleY = itemHeight / 0.82;
  const scaleZ = itemDepth / 0.35;
  /**
   * 按「规格里的米」摆一个方块（y 给**底面**高度，与规格一致）。
   */
  const addWallCabinetBlock = (
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
  // 柜体围板：底板 / 双侧板 / 背板（背板用稍深的柜内衬色，柜内才有纵深）。
  addWallCabinetBlock(1.46, 0.02, 0.3, 0, 0, -0.02, furnitureColor);
  addWallCabinetBlock(0.02, 0.76, 0.3, -0.73, 0.02, -0.02, furnitureColor);
  addWallCabinetBlock(0.02, 0.76, 0.3, 0.73, 0.02, -0.02, furnitureColor);
  addWallCabinetBlock(1.46, 0.76, 0.014, 0, 0.02, -0.163, furnitureSoftColor, { roughness: 0.68 });
  // 层板：柜内一块可调层板，把格口分成上下两层。
  addWallCabinetBlock(1.46, 0.018, 0.28, 0, 0.391, -0.03, furnitureSoftColor, { roughness: 0.6 });
  // 顶板：占地 1.5 × 0.35 由它定，也是整件最高的一件（顶面 = 0.82 = 声明高度）。
  addWallCabinetBlock(1.5, 0.04, 0.35, 0, 0.78, 0, furnitureSoftColor, { roughness: 0.5 });
  // 双开门：各 0.72 宽、中缝 1cm，门面到 0.145（柜体正面 0.13 + 门板 1.5cm）。
  addWallCabinetBlock(0.72, 0.74, 0.02, -0.365, 0.03, 0.135, furnitureSoftColor, { roughness: 0.45 });
  addWallCabinetBlock(0.72, 0.74, 0.02, 0.365, 0.03, 0.135, furnitureSoftColor, { roughness: 0.45 });
  // 两根竖条拉手：贴在中缝两侧。
  addWallCabinetBlock(0.02, 0.2, 0.02, -0.03, 0.3, 0.155, furnitureSoftColor);
  addWallCabinetBlock(0.02, 0.2, 0.02, 0.03, 0.3, 0.155, furnitureSoftColor);
}

