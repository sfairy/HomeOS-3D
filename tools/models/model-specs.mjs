/**
 * 自建模型的规格表：每个条目描述一件新物件的零件构成。
 *
 * 写规格时的约定（写错的后果见 model-library.mjs 的模块头）：
 *
 * 1. `size` 是**期望包围盒** [宽, 高, 深]（米），必须与 studio-external-models.js 里该类型的
 *    scaleBasis 逐值相等。运行侧按 scaleBasis 做非等比缩放，两者不一致成品就会被拉扁或拔高；
 *    生成器会把实际包围盒量出来比对，超出 1cm 直接报错、不写文件。
 * 2. **横纵以原点为中心**：x ∈ [-宽/2, 宽/2]，z ∈ [-深/2, 深/2]，y ∈ [0, 高]（地面在 y=0）。
 *    生成器会自动把占地居中（只动 x / z），但各零件的相对尺寸仍要自己凑够 size —— 居中不改变
 *    总尺寸，凑不够就会在尺寸校验那一步被拦下来。y 不会被自动修正：地面位置是语义，写错要报错。
 * 3. `slots` 下标即 `material-<n>`，顺序一旦发布就不能改（改了等于换掉已有草稿的取色语义）。
 *    槽位色只是「未套用任何风格时的底色」，真正的颜色由 studio-scene-style.js 的色卡决定。
 * 4. 大件几何不要写 `fullOnly`，小件（旋钮、显示屏、把手细节）才写 —— lite 版靠丢掉这些控制顶点数。
 *    纯方盒构成的小件若一件 fullOnly 都没有，lite 与完整版会一模一样，尺寸校验后的预算校验会拦下。
 */
import {
  box,
  capsule,
  cbox,
  ccapsule,
  ccyl,
  clathe,
  croundedBox,
  ctaper,
  ctorus,
  cyl,
  extrude,
  lathe,
  mirrorPair,
  ringOf,
  roundedBox,
  sphere,
  taper,
  torus
} from "./model-library.mjs";

/**
 * 四腿家具的通用腿：`legSpanX` / `legSpanZ` 是**腿心到中心的距离**（米）。
 * 腿的截面一致、朝向一致，因此天然可以并进同一个槽位。
 */
function fourLegs(slot, { legSpanX, legSpanZ, legSize, height, square = true }) {
  const half = legSize / 2;
  const offsets = [
    [-legSpanX, -legSpanZ],
    [legSpanX, -legSpanZ],
    [-legSpanX, legSpanZ],
    [legSpanX, legSpanZ]
  ];
  return offsets.map(([x, z]) =>
    square
      ? cbox(slot, [legSize, height, legSize], [x - half, 0, z - half], { centered: false })
      : ccyl(slot, half, height, 12, [x, 0, z])
  );
}

/**
 * 沿 z 均布一列等大的零件（地毯流苏、格栅条、百叶片）。
 *
 * 与 ringOf 的分工：ringOf 排圆形阵列、且会把零件推到半径上；这一列只是「同一件东西
 * 沿一条直线重复」，位置由 span 与条数直接决定 —— 用 pitch = span / count 让**首尾都留半格**，
 * 整列因此严格居中，不会出现「一端贴边、另一端空出半格」的不对称。
 */
function rowAlongZ(slot, { size, count, span, x, y }) {
  const [sizeX, sizeY, sizeZ] = size;
  const pitch = span / count;
  const parts = [];
  for (let index = 0; index < count; index += 1) {
    parts.push(cbox(slot, [sizeX, sizeY, sizeZ], [x, y, -span / 2 + pitch * (index + 0.5)]));
  }
  return parts;
}

/**
 * 一把餐椅的零件（四条腿 + 座面 + 靠背 + 四根横撑），整椅可以绕竖直轴转向。
 *
 * **为什么要能转向**：餐桌组合里 6 张椅子朝三个方向坐（两侧的朝内、两端朝内），圆餐桌的 4 张
 * 朝圆心。零件级的 `rot` 只绕**零件自己**的中心转，所以「整椅转」不能靠给每个零件写同一个角度 ——
 * 那样每块都留在原地各转各的，椅子会散架。这里把椅子定义在**局部坐标**里，再按整椅朝向把每块的
 * 位置一并转过去；尺寸照写即可（`rot` 会把几何连同包围盒一起转，方盒转 90° 后宽深自然换轴）。
 *
 * `facing` 是椅子**正面**（坐人那一侧）朝向的水平角，取 three 的 rotateY 约定：
 * 0 = +z、90 = +x、180 = −z、270 = −x。靠背永远在正面的反面，所以「椅子朝哪」一句话就说清了。
 * `center` 是椅子中心 [x, z]，`seatHeight` 是座面**底面**高度，`backTop` 是靠背顶高。
 *
 * 横撑（四根）一律 `fullOnly`：它们是椅子 lite 版的主要减重来源，也是近看才成立的构件 ——
 * 整件只剩轮廓时（lite 是首屏那一份），椅面与靠背已经能读出「这是一把椅子」。
 */
function diningChair({
  center,
  facing,
  slotLeg,
  slotSeat,
  slotTrim,
  seatWidth,
  seatDepth,
  seatHeight,
  seatThickness,
  backTop,
  backThickness,
  legSize
}) {
  const radians = (facing * Math.PI) / 180;
  const cos = Math.cos(radians);
  const sin = Math.sin(radians);
  // 局部 (lx, lz) → 整椅朝向下的世界位置；与 three 的 rotateY 同一套符号（+z 转到 facing 那一侧）。
  const placed = (slot, size, [lx, y, lz], options = {}) =>
    cbox(slot, size, [center[0] + lx * cos + lz * sin, y, center[1] - lx * sin + lz * cos], {
      rot: [0, facing, 0],
      ...options
    });
  const legInsetX = seatWidth / 2 - legSize / 2;
  const legInsetZ = seatDepth / 2 - legSize / 2;
  const railHeight = seatHeight * 0.34;
  const railSpanX = seatWidth - legSize * 2;
  const railSpanZ = seatDepth - legSize * 2;
  return [
    ...[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz]) =>
      placed(slotLeg, [legSize, seatHeight, legSize], [sx * legInsetX, 0, sz * legInsetZ])
    ),
    // 座面：圆角盒（软包坐垫），也是椅子在 lite 版里降段数的一处。
    croundedBox(slotSeat, [seatWidth, seatThickness, seatDepth], [
      center[0],
      seatHeight,
      center[1]
    ], { rot: [0, facing, 0], radius: 0.014 }),
    // 靠背：贴着座面后沿长上去，顶到 backTop —— 整把椅子的高度由它定。
    placed(
      slotSeat,
      [seatWidth, backTop - seatHeight - seatThickness, backThickness],
      [0, seatHeight + seatThickness, -(seatDepth / 2 - backThickness / 2)]
    ),
    placed(slotTrim, [0.02, 0.02, railSpanZ], [-legInsetX, railHeight, 0], { fullOnly: true }),
    placed(slotTrim, [0.02, 0.02, railSpanZ], [legInsetX, railHeight, 0], { fullOnly: true }),
    placed(slotTrim, [railSpanX, 0.02, 0.02], [0, railHeight, -legInsetZ], { fullOnly: true }),
    placed(slotTrim, [railSpanX, 0.02, 0.02], [0, railHeight, legInsetZ], { fullOnly: true })
  ];
}

/**
 * 厨房地柜的通用骨架：踢脚 + 柜体 + 背板 + N 扇门 + 门板拉手。
 *
 * 三件地柜（厨房地柜 / 带水盆 / 带灶具）共用这一段 —— 它们的差别只在**台面那件事**
 * （整块台面 / 台面开孔嵌水盆 / 台面开孔嵌灶），柜体本身是同一批木作。真实的厨房地柜也正是
 * 这么做的：同一套柜体，台面按用途开不同的孔。各写一份的结果必然是改了门缝只改到一件，
 * 另两件的门板悄悄错开几毫米 —— 而成排地柜的门缝是并排看的，错一点就看得出来。
 *
 * 槽位下标是三件共用的约定（0 台面 / 1 门板 / 2 柜体 / 3 五金 / 4 踢脚 / 5 柜内），
 * 三件的 slots 表必须逐项同序，否则同一块几何在三件里会拿错颜色。
 *
 * `openTop` 给水盆柜用：台下盆要从上面看得见内腔，所以那件不能有封顶的柜体顶面
 * （封了的话台面开孔里看到的是一块柜体板，盆整个被挡在下面）。
 */
function kitchenBaseCarcassParts({ width, depth, doorCount, openTop = false }) {
  const doorGap = 0.003;
  const doorRunWidth = width - 0.08;
  const doorWidth = (doorRunWidth - doorGap * (doorCount - 1)) / doorCount;
  const doorFrontZ = depth / 2 - 0.04;
  const doorCenterZ = doorFrontZ + 0.01;
  const handleZ = doorFrontZ + 0.02 - 0.006;
  const doors = [];
  for (let index = 0; index < doorCount; index += 1) {
    const doorCenterX = -doorRunWidth / 2 + doorWidth / 2 + index * (doorWidth + doorGap);
    doors.push(cbox(1, [doorWidth, 0.73, 0.02], [doorCenterX, 0.07, doorCenterZ]));
    // 拉手落在门板的中缝一侧（真实厨房门板几乎都是这个位置），只在完整版留。
    doors.push(cbox(3, [Math.min(0.24, doorWidth * 0.45), 0.014, 0.014], [
      doorCenterX + (index % 2 === 0 ? doorWidth * 0.28 : -doorWidth * 0.28),
      0.66,
      handleZ
    ], { fullOnly: true }));
  }
  const carcass = openTop
    ? [
        // 不封顶的柜体：左右侧板 + 底板 + 背板（水盆柜的箱体）。
        cbox(2, [0.02, 0.75, depth - 0.04], [-(width / 2 - 0.03), 0.06, -0.02]),
        cbox(2, [0.02, 0.75, depth - 0.04], [width / 2 - 0.03, 0.06, -0.02]),
        cbox(2, [width - 0.08, 0.02, depth - 0.06], [0, 0.06, -0.02])
      ]
    : [cbox(2, [width - 0.04, 0.75, depth - 0.04], [0, 0.06, -0.02])];
  return [
    // 踢脚内缩 10cm：落地那 6cm 因此是踢脚而不是柜体正面。
    cbox(4, [width - 0.12, 0.06, depth - 0.1], [0, 0, -0.05]),
    ...carcass,
    // 背板只在**不封顶**的箱体里出现（水盆柜）：封顶的柜体本身就是一块实心箱，背板埋在里面
    // 看不见，而它与箱体的上下表面逐面齐平（各 185.6cm² 的同向共面）。水盆柜那件里背板
    // 底面抬到 0.08（底板顶面）、顶面仍到 0.81，于是不再与底板的下表面共面。
    ...(openTop
      ? [cbox(5, [width - 0.08, 0.73, 0.016], [0, 0.08, -(depth / 2) + 0.012], { fullOnly: true })]
      : []),
    ...doors
  ];
}

/**
 * 一段落地帘布的规格。`side` 决定帘布怎么分：
 *   - "left"  / "right" —— 单幅，前缘（不褶的那一条）留在对应一侧；
 *   - "split" —— 两幅对开，中缝 9cm。
 *
 * 三个变体必须由同一个函数生成：它们只在「帘布怎么分」上不同，若各写一份，改了波浪半径或
 * 顶轨高度就会只改到一份，另外两份悄悄留在旧尺寸上 —— 而三件的 scaleBasis 是同一个数
 * （1.8 × 2.4 × 0.18），对不上时运行侧按分轴缩放去凑，两件的褶皱会被拉成不同的胖瘦。
 */
function curtainSpec(side) {
  // 帘布高度 = 整件高度减去顶轨占的那一段（顶轨半径 12mm，轴心在 2.388，占 2.376…2.400）。
  const clothHeight = 2.376;
  // 波浪半径 = 进深的一半：一排竖圆柱的直径就是整件进深 0.18，圆柱轴心一律落在 z = 0 平面上。
  const waveRadius = 0.09;
  const waveSegments = 20;
  const waveRow = (startX, count, pitch) => {
    const row = [];
    for (let index = 0; index < count; index += 1) {
      row.push(ccyl(0, waveRadius, clothHeight, waveSegments, [startX + index * pitch, 0, 0]));
    }
    return row;
  };
  const parts = [];
  if (side === "left") {
    // 11 道波从 -0.81 排到 0.69（最右一道的右沿正好 0.78），右侧 12cm 留给前缘。
    parts.push(...waveRow(-0.81, 11, 0.15));
    // 前缘：一条**不褶**的薄板，进深只有 3cm。它比波浪薄得多，所以侧面看得出「抓帘那一条是平的」。
    parts.push(cbox(0, [0.12, clothHeight, 0.03], [0.84, 0, 0]));
  } else if (side === "right") {
    parts.push(...waveRow(-0.69, 11, 0.15));
    parts.push(cbox(0, [0.12, clothHeight, 0.03], [-0.84, 0, 0]));
  } else {
    // 两幅各 6 道波、间距 0.135：外侧顶到 ±0.90，内侧到 ∓0.045，中间留 9cm 的缝。
    parts.push(...waveRow(-0.81, 6, 0.135));
    parts.push(...waveRow(0.135, 6, 0.135));
  }
  // 顶轨：沿 x 的圆杆（圆柱默认轴为 y，转 90° 变成横杆）。用 align: "center" 让**轴心**落在
  // 2.388 —— 旋转之后包围盒变了，不写 center 会把杆的**底面**对齐到 2.388，顶到 2.412 超规格。
  parts.push(
    ctaper(1, 0.012, 0.012, 1.76, 12, [0, 2.388, 0], { rot: [0, 0, 90], align: "center" })
  );
  // 两个墙面支架（贴在轨下方的托板）。lite 版丢掉它们：远看就是轨上的两个小方块。
  // 支架顶面原与帘布（一排波浪圆柱的顶盖）同在 2.376（3.7cm² 的同向共面）：整件下沉 5mm。
  parts.push(cbox(1, [0.03, 0.05, 0.06], [-0.5, 2.321, 0], { fullOnly: true }));
  parts.push(cbox(1, [0.03, 0.05, 0.06], [0.5, 2.321, 0], { fullOnly: true }));
  return {
    note:
      "落地窗帘：" +
      (side === "split"
        ? "两幅波浪帘布对开（中缝 9cm）"
        : `单幅波浪帘布 + ${side === "left" ? "右" : "左"}侧不褶的前缘`) +
      " + 沿墙的顶轨 + 两个墙面支架。",
    size: [1.8, 2.4, 0.18],
    slots: [
      { role: "fabric", color: 0xd5d2ca, roughness: 0.94, metalness: 0 }, // 0 帘布
      { role: "metal", color: 0x9aa1a8, roughness: 0.34, metalness: 0.45 } // 1 顶轨 / 支架
    ],
    parts: parts
  };
}

/**
 * 三角钢琴的俯视轮廓：归一化坐标 → 实际尺寸。
 *
 * 钢琴是这一批里唯一**拼不出外形**的物件：俯视是「键盘侧一条直边 + 一条大弧收向尾端」的翼形
 *（弯背 bentside）。方盒只能拼成阶梯，一眼就是方块堆的，所以走 `extrude` —— 把这一圈平面曲线
 * 沿高度拉成体（琴身那 0.30m 的侧板），`rot: [90, 0, 0]` 立起来之后，轮廓的 y 就是整件的 z。
 *
 * 用归一化坐标是为了**一份形状出三块板**：u ∈ [-1, 1] 是低音侧 → 高音侧、v ∈ [0, 1] 是尾端 →
 * 键盘侧，于是琴身（0.72 / -0.74 / 0.55）、腰线（0.728 / -0.748 / 0.555）、顶盖
 *（0.732 / -0.75 / 0.56）三组边界都直接写成规格里的数，不必反解「放大几倍才正好外张 8mm」。
 *
 * 每条二次曲线的控制点都夹在各自端点的坐标区间内：曲线不会越出控制点围成的凸包，不越界才能
 * 保证「实测包围盒逐值等于上面那三组边界」。尾端那个 v = 0 的顶点是刻意的 —— 它是整件最后缘，
 * 两侧曲线各自从它往 v > 0 收，于是尾端看着是圆的、而最低点恰好就是那一个顶点。
 */
function pianoPlan({ halfWidth, tailZ, frontZ }) {
  const point = ([u, v]) => [u * halfWidth, tailZ + (frontZ - tailZ) * v];
  return {
    outline: {
      start: point([1, 1]),
      path: [
        { lineTo: point([-1, 1]) }, // 键盘侧的直边
        { lineTo: point([-0.972, 0.72]) }, // 低音侧：几乎平直地往后
        { curveTo: [point([-0.944, 0.3]), point([-0.806, 0.12])] },
        { curveTo: [point([-0.722, 0.02]), point([-0.42, 0])] }, // 尾端最低点
        { curveTo: [point([-0.14, 0.03]), point([0.06, 0.16])] },
        { curveTo: [point([0.44, 0.34]), point([0.64, 0.6])] }, // 弯背
        { curveTo: [point([0.86, 0.8]), point([1, 0.94])] },
        { lineTo: point([1, 1]) } // 闭合
      ]
    },
    // 轮廓的占地中心（z 向不在 0 上）：extrude 用 centered 定位时要把这个值传给 at[2]。
    centerZ: (tailZ + frontZ) / 2
  };
}

/**
 * 立柱在水平面上的截面：与 studio-app.js 的 `buildPillarOutline` **同源** —— 同样的椭圆弧参数、
 * 同样的「平直面朝 -Z（靠墙那一面）」约定。
 *
 * 为什么两边各写一份、还要求同形：立柱的占位几何是运行侧的兜底（模型没到位、或离线导出时露脸），
 * 它和流水线产物一旦不同形，「模型加载完成的那一帧」柱子就会变形跳一下 —— 而异形柱恰恰是
 * 一眼就能看出形状不对的物件（半圆柱变成半月板、四分之一柱的弧朝反）。
 *
 * 这里用**折线**而不是 extrude 的 `arcTo`：`arcTo` 只有一个半径，而半圆 / 四分之一圆的弧都是
 * **拉伸到占满占地的椭圆弧**（半轴取的是整宽 / 整深，不是半宽 / 半深）。换成圆弧，异形柱在
 * 默认占地下就短一截、包围盒凑不满 `size`，生成器当场报错。
 * 代价是折线的顶点数不随 lite 变化，所以柱族的 lite 减重全部落在 fullOnly 的柱帽上。
 */
function pillarOutline(shape, width, depth) {
  const halfWidth = width / 2;
  const halfDepth = depth / 2;
  const points = [];
  const pushEllipseArc = (centerX, centerY, radiusX, radiusY, startRadians, endRadians) => {
    const segments = Math.max(8, Math.round(Math.abs(endRadians - startRadians) * 10));
    for (let arcStep = 1; arcStep <= segments; arcStep += 1) {
      const arcAngle = startRadians + ((endRadians - startRadians) * arcStep) / segments;
      points.push([
        centerX + Math.cos(arcAngle) * radiusX,
        centerY + Math.sin(arcAngle) * radiusY
      ]);
    }
  };
  if (shape === "round") {
    points.push([halfWidth, 0]);
    pushEllipseArc(0, 0, halfWidth, halfDepth, 0, Math.PI * 2);
  } else if (shape === "semicircle") {
    // 平直面在 +y（立正之后就是 -z，靠墙那一侧），弧从 +x 端扫到 -x 端。
    points.push([-halfWidth, halfDepth], [halfWidth, halfDepth]);
    pushEllipseArc(0, halfDepth, halfWidth, depth, 0, -Math.PI);
  } else if (shape === "quarter") {
    points.push([-halfWidth, halfDepth], [halfWidth, halfDepth]);
    pushEllipseArc(-halfWidth, halfDepth, width, depth, 0, -Math.PI / 2);
  } else {
    // quarterinner：与 quarter 在同一占位内互补，两根叠在一起正好拼满一个方柱。
    points.push([halfWidth, halfDepth], [halfWidth, -halfDepth], [-halfWidth, -halfDepth]);
    pushEllipseArc(-halfWidth, halfDepth, width, depth, -Math.PI / 2, 0);
  }
  // 显式闭合：`quarter` 的弧扫到 (-半宽, -半深) 就停了，回不到起点，而 extrude 要求末点
  // 与首点重合（不闭合的轮廓拉出来是一张侧壁缺失的壳，单面渲染下整块从背面消失）。
  const firstPoint = points[0];
  const lastPoint = points[points.length - 1];
  if (Math.abs(firstPoint[0] - lastPoint[0]) > 1e-6 || Math.abs(firstPoint[1] - lastPoint[1]) > 1e-6) {
    points.push([firstPoint[0], firstPoint[1]]);
  }
  return {
    start: points[0],
    path: points.slice(1).map(point => ({ lineTo: point }))
  };
}

/**
 * 一片叶子的平面轮廓：卵形、两端收尖、中段最宽（沿 +y 长出，关于 x = 0 对称）。
 *
 * 为什么用折线而不是曲线：叶形只靠「中段最宽、两端收尖」这几段直线就读得出来，
 * 而轮廓里的 `curveTo` 弧段在 lite 版会从 14 段降到 5 段 —— 叶尖那种小尺度的曲线降段之后
 * 会明显变成折角。折线不受 lite 影响，叶形在两版里一致。
 * 宽度因子取 sin 的 0.65 次方：纯 sin 是纺锤形（叶柄端太瘦），开方之后叶柄端更饱满，
 * 更接近实物上「叶基圆钝、叶尖渐尖」的轮廓。
 */
/**
 * 叶形轮廓：**两段二次曲线**（正面一条、背面一条）围成一片柳叶形叶面。
 *
 * 为什么用曲线而不是「一串折点逼近曲线」：折线的点数在完整版与 lite 版里是同一个数（`curveSegments`
 * 只对 arcTo / curveTo 生效），于是叶面这一族零件在 lite 版里一个顶点都省不下来 —— 而绿植整件
 * 几乎全是叶面，lite 的顶点预算当场就过不了（实测 2500 / 2700 = 93%）。换成曲线之后，
 * 「完整版 14 段 / lite 5 段」这个既有杠杆直接作用在叶面上，两个版本各得其所。
 *
 * 控制点取 `[±2 × 半宽, 0.4 × 叶长]`：二次曲线的中点在 `t = 0.5`，此时
 * `x = 2 × 0.5 × 0.5 × 控制点x = 控制点x / 2`、`y ≈ 0.5 × 0.4L + 0.25L = 0.45L` ——
 * 于是「最大叶宽出现在叶长的 45% 处、宽度正好等于给定宽度」，与实物叶形一致。
 */
function leafOutline(length, width) {
  const halfWidth = width / 2;
  return {
    start: [0, 0],
    path: [
      { curveTo: [[halfWidth * 2, length * 0.4], [0, length]] },
      { curveTo: [[-halfWidth * 2, length * 0.4], [0, 0]] }
    ]
  };
}

/**
 * 叶片从基点到叶尖的**水平投影**换算成叶片长度。
 *
 * 树冠的占地（`size` 的 0.75 × 0.75）是这一件最容易写错的地方：叶长与倾角是两个自由度，
 * 而占地上限只认「基座半径 + 叶尖的水平投影」，其中叶尖的水平投影还要算上**叶厚**那一份 ——
 * 叶面是斜置的，厚度方向并不水平，于是半个叶厚会斜斜地探出去
 * `厚/2 × |sin(倾角)|`（实测就这一项，把倾角 −6° 的那层多推出 0.6mm、−24° 的那层多推出 2.4mm，
 * 一律超出 1mm 的占地容差）。按目标写 reach、让长度反解出来，规格里就不会出现
 * 「改了倾角结果整件超宽 3cm」这种要跑一遍才知道的错。
 *
 * @param {number} reach 基点到叶尖的水平投影（米）。
 * @param {number} baseRadius 叶基离整件中轴的水平距离（米）。
 * @param {number} tiltDegrees 叶片与水平面的夹角（度，正 = 叶尖下倾）。
 * @param {number} thickness 叶厚（米），与 plantLeaf 烘进轮廓的厚度必须一致。
 */
function leafLengthForReach(reach, baseRadius, tiltDegrees, thickness = 0.012) {
  const tiltRadians = (tiltDegrees * Math.PI) / 180;
  return (
    (reach - baseRadius - (thickness / 2) * Math.abs(Math.sin(tiltRadians))) /
    Math.cos(tiltRadians)
  );
}

/**
 * 一片叶子（轮廓拉体）：
 *   1. 先绕 X 立起来并按下倾角转出「叶尖朝外、略向下」的姿态；
 *   2. 再绕 Y 转到方位角。
 * `rot` 的施加顺序本来就是 X → Y → Z（见 model-library 的零件变换说明），所以两步一次写完。
 *
 * 摆放用 centered，位置由「叶基 + 半根叶长 × 叶轴方向」算出来 —— 叶形关于叶轴对称，
 * 包围盒中心就是叶轴中点，于是 `at` 与实物位置严格对应，不必再猜对齐点。
 */
function plantLeaf({ azimuth, tilt, base, length, width, slot = 3, fullOnly = false }) {
  const tiltRadians = (tilt * Math.PI) / 180;
  const azimuthRadians = (azimuth * Math.PI) / 180;
  // 叶片轴线：先绕 X 立起（下倾 tilt），再绕 Y 转到方位角。
  const axis = [
    -Math.cos(tiltRadians) * Math.sin(azimuthRadians),
    -Math.sin(tiltRadians),
    -Math.cos(tiltRadians) * Math.cos(azimuthRadians)
  ];
  // 曲线分段压到 10（库默认 14）：叶面就是一条二次曲线，14 段与 10 段在实物尺寸下看不出差别，
  // 而整株有二十多片叶 —— 这一项是完整版顶点数的主要来源。
  const options = { centered: true, align: "center", rot: [-90 - tilt, azimuth, 0], curveSegments: 10 };
  if (fullOnly) {
    options.fullOnly = true;
  }
  return extrude(
    slot,
    leafOutline(length, width),
    0.012,
    [
      base[0] + (axis[0] * length) / 2,
      base[1] + (axis[1] * length) / 2,
      base[2] + (axis[2] * length) / 2
    ],
    options
  );
}

/**
 * 一片叶的**叶尖**相对叶基（`base`）高出多少。
 *
 * 冠高是这一件最容易写错的地方：叶片是「轮廓拉体 × 斜置」，叶尖高度取决于叶长与倾角两个自由度，
 * 而整件高度只认最高的那一件零件。写死一个 base 高度靠试跑调，改一次倾角就要重来。
 * 这里按零件变换的实测规律反解：拉体轮廓在 x∈[-宽/2, 宽/2]、y∈[0, 叶长]、z∈[±厚/2]，
 * 绕 X 转 (-90 - 倾角) 之后 y 方向的最大值就是
 *   `叶长 × sin(-倾角) + 厚/2 × |cos(倾角)|`
 * （前一项是叶尖本身的高差，后一项是叶厚贡献的半个身位）。
 */
function plantLeafRise(tilt, length, thickness = 0.012) {
  const tiltRadians = (tilt * Math.PI) / 180;
  return length * Math.sin(-tiltRadians) + (thickness / 2) * Math.abs(Math.cos(tiltRadians));
}

/**
 * 反解「叶尖正好落在 topY」的叶基高度。
 *
 * 顶芽那一束必须**顶着声明高度**：整件高度按最高零件算，写高了校验不过、写低了整件就矮一截
 * （而运行侧又按 scaleBasis 缩放，矮一截会被拉回去，冠形跟着变形）。所以顶芽的高度不写死，
 * 由 `topY` 反解。
 */
function plantLeafBaseForTop(topY, tilt, length) {
  return topY - plantLeafRise(tilt, length);
}

/**
 * 一段枝 / 干：圆柱沿 `rot` 立起来后的姿态与叶片同一套（下倾角为负即向上斜出）。
 * 与叶片同样用 centered 定位，`at` 给的是这一段的中点。
 */
function plantStem({ azimuth, tilt, base, length, radiusBottom, radiusTop, segments = 10, slot = 2 }) {
  const tiltRadians = (tilt * Math.PI) / 180;
  const azimuthRadians = (azimuth * Math.PI) / 180;
  const axis = [
    -Math.cos(tiltRadians) * Math.sin(azimuthRadians),
    -Math.sin(tiltRadians),
    -Math.cos(tiltRadians) * Math.cos(azimuthRadians)
  ];
  return ctaper(slot, radiusBottom, radiusTop, length, segments, [
    base[0] + (axis[0] * length) / 2,
    base[1] + (axis[1] * length) / 2,
    base[2] + (axis[2] * length) / 2
  ], { centered: true, align: "center", rot: [-90 - tilt, azimuth, 0] });
}

/**
 * 绿植的树冠：一层层「环列的叶片」。
 *
 * 三条来由：
 *   1. **叶片必须是斜置的叶面**（轮廓拉体），不能是平躺的薄片 —— 平躺的圆角盒只在俯视图上
 *      看得见，正视图里整株只剩一根杆（这正是这一版之前的毛病）。
 *   2. **每层用 4 或 6 片**：环列的包围盒只有在该组「沿 60° / 90° 旋转后仍是自身」时才严格
 *      居中（6 片间隔 60° 与 4 片间隔 90° 都满足，5 片、7 片不满足）—— 占地中心偏一点，
 *      运行侧按占地居中摆放时整株就会视觉偏出包围盒。
 *   3. **层间错开半个间隔**（6 片错 30°）：不错开的话上下层叶片在俯视里叠成一条线。
 *
 * 关于「冠幅 0.75 × 0.75 正好落地」这件事：6 片的一层在俯视里是个六边形，**两个方向不等宽** ——
 * 起点角 0° 的那层（叶尖朝 ±z）深 = reach、宽 = 0.866 × reach；起点角 30° 的那层（叶尖朝 ±x）
 * 恰好相反。于是让 L2 与 L3 两层各取 0.375 的 reach、起点角差 30°，整件的宽与深就各自被
 * 撑到 0.375 —— 不多不少，也不必靠试跑凑数。
 *
 * 每层的 `reach` 是「叶尖到中轴的水平投影」，叶长由 `leafLengthForReach` 反解。
 */
function plantCrownParts() {
  // 层参数：下层叶大而下垂（tilt 为正 = 叶尖下倾），越往上叶越小、越直立。
  // reach 只有 0.375 那一档是「顶到占地」，其余都收在里面，冠形才有疏密。
  const layers = [
    { count: 6, baseY: 0.5, baseRadius: 0.045, tilt: 12, reach: 0.3, width: 0.13, startAngle: 0 },
    { count: 6, baseY: 0.66, baseRadius: 0.05, tilt: -6, reach: 0.375, width: 0.14, startAngle: 30 },
    { count: 6, baseY: 0.84, baseRadius: 0.055, tilt: -24, reach: 0.375, width: 0.135, startAngle: 0 },
    { count: 6, baseY: 1.02, baseRadius: 0.055, tilt: -40, reach: 0.3, width: 0.125, startAngle: 30 },
    { count: 4, baseY: 1.2, baseRadius: 0.05, tilt: -56, reach: 0.235, width: 0.115, startAngle: 45 }
  ];
  const parts = [];
  for (const layer of layers) {
    const length = leafLengthForReach(layer.reach, layer.baseRadius, layer.tilt);
    parts.push(
      ...ringOf(layer.count, { radius: layer.baseRadius, startAngle: layer.startAngle }, () =>
        plantLeaf({
          // 环列的基准位是「站在 +z、正面朝外」，而 plantLeaf 的 0° 方位角指向 −z，
          // 所以要它朝外就得写 180°。
          azimuth: 180,
          tilt: layer.tilt,
          base: [0, layer.baseY, 0],
          length,
          width: layer.width
        })
      )
    );
  }
  // 冠顶那撮嫩叶：叶基高度由「叶尖正好 1.6」反解，叶长按 reach 反解，所以整件高度严丝合缝。
  // 三片（不是 4/6）在这里是安全的 —— 它们**不参与占地**（reach 0.155 远小于最宽那层的 0.375），
  // 而高度方向本来就只认最高的那一片，三片的包围盒不对称也不影响整件居中。
  const crownTilt = -74;
  const crownReach = 0.155;
  const crownBaseRadius = 0.04;
  const crownLength = leafLengthForReach(crownReach, crownBaseRadius, crownTilt);
  const crownBaseY = plantLeafBaseForTop(1.6, crownTilt, crownLength);
  parts.push(
    ...ringOf(3, { radius: crownBaseRadius, startAngle: 60 }, () =>
      plantLeaf({
        azimuth: 180,
        tilt: crownTilt,
        base: [0, crownBaseY, 0],
        length: crownLength,
        width: 0.1
      })
    )
  );
  return parts;
}

/**
 * 固定种子的伪随机（与 studio-surface-fabrics.js 里画贴图用的是同一套线性同余）。
 *
 * 书脊这一族必须**每次生成都一模一样**：用 Math.random 的话同一个规格每次导出都会换一批厚度与
 * 高度，模型文件每天都在变（diff 全是噪声），而目检台上看到的那一排书也再复现不出来。
 */
function createSeededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

/**
 * 一格书架上的书：一排竖立的书脊 + 收口的两本斜靠 + 一摞平放的书。
 *
 * 为什么要有这一族：书柜里没有书就是一个空木架（先前重建的版本正是这样 —— 只剩围板与层板，
 * 反而比旧的既有资产更单薄）。**一排顶满**又会读成一块实心板，所以：
 *   - 书与书之间留 1.5mm 缝、厚度在 2~4.4cm 之间抖、高度在 17~28cm 之间抖；
 *   - 整排只占格口宽的 86%，尾巴留两本斜靠的；
 *   - 每格再叠一摞平放的书（书架的「视觉重心」，一眼就认得出是书）。
 *
 * 两处容易写错的细节：
 *   1. **书底要咬进层板 4mm**（`bottomY` 传层板顶面 - 0.004）：两块不同料的面严格贴合就是一对
 *      共面三角形，沿整排书底会闪一条细线；
 *   2. **斜靠的书按「旋转后包围盒」落位**（见 model-library 的落位说明），所以斜了也不会戳进
 *      层板底下，但底边会留一条几毫米的缝 —— 咬进层板那 4mm 正好把它吃掉。
 */
function bookRowParts({ slots, seed, fromX, toX, bottomY, zCenter, maxHeight, withStack = false }) {
  const random = createSeededRandom(seed);
  const parts = [];
  const totalWidth = toX - fromX;
  // 平放那一摞要先在格口里**占位**：先摆满整排再拿摞去挤，末尾几本就会戳进侧板或中竖板。
  const stackWidth = withStack ? 0.17 + random() * 0.05 : 0;
  const rowWidth = totalWidth - (withStack ? stackWidth + 0.025 : 0);
  const fillWidth = rowWidth * 0.86;
  const gapBetweenBooks = 0.0015;
  let cursor = fromX;
  let order = 0;
  while (true) {
    const thickness = 0.02 + random() * 0.024;
    if (cursor + thickness - fromX > fillWidth) {
      break;
    }
    // 高度只取到格口净高的 92%：剩下的空当是「书没顶到上层板」的读感，也是给斜靠的书留的余量。
    const height = Math.min(maxHeight, 0.17 + random() * 0.11);
    const depth = 0.13 + random() * 0.045;
    const slot = slots[Math.floor(random() * slots.length) % slots.length];
    parts.push(
      cbox(slot, [thickness, height, depth], [cursor + thickness / 2, bottomY, zCenter], {
        // 每两本里让一本只在完整版保留：lite 版的书脊稀一点，但整排仍然成立 ——
        // 盒体零件没有「降段数」这条路，`fullOnly` 是它们唯一的 lite 杠杆。
        fullOnly: order % 2 === 1
      })
    );
    cursor += thickness + gapBetweenBooks;
    order += 1;
  }
  // 收口：两本斜靠的书。真实书架的最后一两本不是插满的，而是斜靠着前一本。
  // 只在 rowWidth 还剩得下（斜靠要 55mm）时才加 —— 摆了平放那一摞的格口本来就窄，加进去只会戳出去。
  if (rowWidth - fillWidth >= 0.055) {
    const leanSlot = slots[(Math.floor(random() * slots.length) + 1) % slots.length];
    const leanHeight = Math.min(maxHeight, 0.2 + random() * 0.06);
    const leanThickness = 0.024;
    parts.push(
      cbox(
        leanSlot,
        [leanThickness, leanHeight, 0.15],
        [cursor + leanThickness / 2 + 0.004, bottomY, zCenter],
        { rot: [0, 0, -11] }
      ),
      cbox(
        leanSlot,
        [0.022, leanHeight * 0.94, 0.145],
        [cursor + leanThickness + 0.022, bottomY, zCenter],
        { rot: [0, 0, -22], fullOnly: true }
      )
    );
  }
  // 一摞平放的书（2~3 本）：书架的层次感大半来自它，也是一格书里最容易一眼认出来的部分。
  if (withStack) {
    const stackCount = 2 + Math.floor(random() * 2);
    const stackDepth = 0.2;
    let stackY = bottomY;
    for (let index = 0; index < stackCount; index += 1) {
      const stackThickness = 0.028 + random() * 0.014;
      // 摞起来一旦顶到格口净高就收手（真实书架也是按格口高度决定摞几本）。
      if (stackY + stackThickness - bottomY > maxHeight) {
        break;
      }
      const width = stackWidth - index * 0.012;
      // 每高一层往里错 1.2cm：正正方方一摞书垛会读成一块木方，错开才像随手摞的。
      parts.push(
        cbox(slots[index % slots.length], [width, stackThickness, stackDepth], [
          fromX + totalWidth - stackWidth / 2 + index * 0.006,
          stackY,
          zCenter
        ], { fullOnly: index > 0 })
      );
      stackY += stackThickness + 0.001;
    }
  }
  return parts;
}

/**
 * 书柜两列 × 四层的格口内容。
 *
 * 每格摆什么、摆多满，都是**写死的一张表**而不是循环里的随机：书柜是家具里最容易被看出「程序生成」
 * 的一件，四格摆得一模一样就立刻穿帮。所以：
 *   - 右列「书 + 平放一摞」「纯书」交替，左列整体错开一位；
 *   - 左右两列的种子不同，同一格里书的厚度 / 高度 / 颜色分布因此也不同；
 *   - 最上面那格右列留给花瓶与相框（见规格里的 `bookcaseDecorParts`），其余格口全是书。
 *
 * `shelfBottoms` 是层板的**底面**高度（与 cbox 的 y 语义一致），板厚 0.018 —— 所以每格的地板是
 * `底面 + 0.018`，再统一咬进 4mm（见 `bookRowParts` 的说明）。格口净高按下一块层板底面、
 * 最后一格按顶板底面算。
 */
function bookcaseShelfContents() {
  const shelfBottoms = [0.51, 0.852, 1.192, 1.532];
  const shelfThickness = 0.018;
  const ceilingBelowTopBoard = 1.85;
  const slotPairs = [
    [7, 8, 7, 8, 7, 8],
    [8, 7, 7, 8, 8, 7]
  ];
  const column = {
    right: { fromX: 0.035, toX: 0.55 },
    left: { fromX: -0.55, toX: -0.035 }
  };
  const parts = [];
  shelfBottoms.forEach((shelfBottom, level) => {
    const floorY = shelfBottom + shelfThickness - 0.004;
    const ceiling = level === shelfBottoms.length - 1
      ? ceilingBelowTopBoard
      : shelfBottoms[level + 1];
    // 净高打 88 折：书顶不贴上层板，才有「书是摆进去的」而不是「填满的」。
    const maxHeight = (ceiling - floorY) * 0.88;
    // 最上层右列让给摆件（花瓶 + 相框），左列照旧摆书。
    if (level === 3) {
      parts.push(...bookRowParts({
        slots: slotPairs[0],
        seed: 3100 + level,
        ...column.left,
        bottomY: floorY,
        zCenter: 0.01,
        maxHeight
      }));
      return;
    }
    parts.push(...bookRowParts({
      slots: slotPairs[0],
      seed: 3100 + level,
      ...column.right,
      bottomY: floorY,
      zCenter: 0.01,
      maxHeight,
      withStack: level % 2 === 0
    }));
    parts.push(...bookRowParts({
      slots: slotPairs[1],
      seed: 4100 + level,
      ...column.left,
      bottomY: floorY,
      zCenter: 0.01,
      maxHeight,
      withStack: level % 2 === 1
    }));
  });
  return parts;
}

/**
 * 书架格口里的一件小摆件（花瓶 / 相框）：书柜最上层那一格摆件通常比书多，
 * 而一格全是书会读成「仓库」。形状取回转体花瓶（`lathe`，比直筒多一层「器物」的读感）与扁盒。
 */
function bookcaseDecorParts({ bottomY, centerX, zCenter, slot, kind, height, seed }) {
  const random = createSeededRandom(seed);
  if (kind === "vase") {
    const radius = 0.045 + random() * 0.02;
    return [
      // 母线首尾都是同一个点 [0, 0]（= 收口到轴上）：`lathe` 要求母线闭合，且贴着轴（半径 0）
      // 转出来才是实心体；不闭合 / 不贴轴会得到一张单面壳，从背面看整块消失。
      clathe(
        slot,
        [
          [0, 0],
          [radius, 0],
          [radius, height * 0.34],
          [radius * 0.46, height * 0.62],
          [radius * 0.58, height],
          [0, height],
          [0, 0]
        ],
        18,
        [centerX, bottomY, zCenter]
      )
    ];
  }
  const width = 0.14 + random() * 0.06;
  return [
    cbox(slot, [width, height * 0.72, 0.02], [centerX, bottomY, zCenter]),
    cbox(slot, [width * 0.82, height * 0.26, 0.03], [centerX, bottomY + height * 0.72, zCenter], {
      fullOnly: true
    })
  ];
}

/**
 * 鞋柜敞开格里的一双鞋。
 *
 * 为什么鞋柜里要摆鞋：这台柜子的分件里，**只有鞋是「实物内容物」**，其余全是木作。敞开格空着
 * 它就退化成一台层架；而摆上成双的鞋，1:50 的户型图上都认得出这是鞋柜。
 *
 * 鞋的造型只用三件**方盒**：鞋底（平片，鞋头那一截比鞋帮长出来）+ 鞋帮（鞋跟到脚背那一截）
 * + 鞋头低块（把「鞋头比鞋跟矮」这一条读出来）。为什么不用圆角块：圆角盒的顶点数是
 * 「段数²」的量级，一双鞋两只就顶得上一台书柜 —— 30 只鞋全用圆角块会让这台柜子成为全库
 * 顶点最多的一件（实测 12008，是沙发 4792 的两倍半），而省掉的那点棱角在 1.8m 高的柜子里
 * 根本看不出来。三个方盒 72 顶点就能把「底 / 帮 / 头」三段读清楚。
 *
 * 朝向：**鞋头朝柜内（−z）、鞋跟朝柜门**。这一条是有理由的：鞋头那一截比鞋跟低，朝外会在
 * 视线高度上挡住后一层；朝内则「鞋跟 + 一条鞋底线」正好把一双鞋的高低读出来。
 *
 * 两只鞋各向外转 `splay` 度，转过的鞋在占地里是**更宽**的（宽·cos + 长·sin），鞋心因此必须按
 * 转过之后的宽分开摆 —— 按原来的 9.4cm 摆，一转就把两只鞋转成互相咬住，成品里表现为
 * 「一双鞋粘成一块」（正视看不出来，俯视才露）。
 */
function shoecabinetShoePair({ bottomY, centerX, zCenter, splay }) {
  const soleWidth = 0.094;
  const soleLength = 0.25;
  const upperLength = 0.15;
  const toeLength = 0.09;
  const toeThickness = 0.026;
  const splayRadians = (splay * Math.PI) / 180;
  const rotatedWidth = soleWidth * Math.cos(splayRadians) + soleLength * Math.sin(splayRadians);
  const soleThickness = 0.02;
  const upperHeight = 0.075;
  const parts = [];
  for (const shoeSide of [-1, 1]) {
    const shoeX = centerX + shoeSide * (rotatedWidth / 2);
    const shoeRotation = [0, shoeSide * splay, 0];
    // 鞋跟那一端的 z（+z 是柜门方向，鞋帮贴在这里）。
    const heelZ = zCenter + soleLength / 2;
    parts.push(
      cbox(7, [soleWidth, soleThickness, soleLength], [shoeX, bottomY, zCenter], {
        rot: shoeRotation
      }),
      // 鞋帮：从鞋跟往鞋头方向 15cm。
      cbox(7, [soleWidth - 0.006, upperHeight, upperLength], [shoeX, bottomY + soleThickness, heelZ - upperLength / 2], {
        rot: shoeRotation
      }),
      // 鞋头：只有鞋帮的三分之一高，压在鞋底前段上 —— 少了它整只鞋就是一块方料。
      cbox(7, [soleWidth - 0.012, toeThickness, toeLength], [shoeX, bottomY + soleThickness, heelZ - upperLength - toeLength / 2], {
        rot: shoeRotation,
        fullOnly: true
      })
    );
  }
  return parts;
}

/**
 * 鞋柜六处敞开格的摆鞋表（左列四层 + 右列敞开中格）。
 *
 * 写死一张表而不是循环里现算：与书柜同理 —— 敞开格摆得一模一样立刻穿帮（六格等距同款）。
 * `floorY` 是这一格**踩在什么上面**（坐板顶面 / 层板顶面 / 中格底面），必须与规格里那些
 * 底面的 y 对得上；鞋底底面坐在层板顶面上是一对反向面，不构成共面。
 *
 * `pairCount` 按格口的宽度定（左列 0.87m 宽放 2~3 双、右列 0.84m 放 3 双），三格的种子不同，
 * 于是每格里鞋的间距、朝向与进深位置都不一样。
 */
function shoecabinetBayShoes() {
  const bays = [
    { floorY: 0.45, xFrom: -0.84, xTo: -0.05, seed: 5301, pairCount: 3 },
    { floorY: 0.8, xFrom: -0.84, xTo: -0.05, seed: 5302, pairCount: 3 },
    { floorY: 1.13, xFrom: -0.84, xTo: -0.05, seed: 5303, pairCount: 2 },
    { floorY: 1.46, xFrom: -0.84, xTo: -0.05, seed: 5304, pairCount: 3 },
    { floorY: 1.0, xFrom: 0.05, xTo: 0.84, seed: 5305, pairCount: 3 }
  ];
  const parts = [];
  for (const bay of bays) {
    const random = createSeededRandom(bay.seed);
    const usableWidth = bay.xTo - bay.xFrom;
    for (let pairIndex = 0; pairIndex < bay.pairCount; pairIndex += 1) {
      // 先等分格口宽度，再加一点抖动：鞋与鞋之间因此既不等距、也不会撞在一起。
      const pairCenter = bay.xFrom + (usableWidth * (pairIndex + 0.5)) / bay.pairCount;
      const jitter = (random() - 0.5) * usableWidth * 0.06;
      parts.push(
        ...shoecabinetShoePair({
          bottomY: bay.floorY,
          centerX: pairCenter + jitter,
          // 进深位置也抖：一格里三双鞋若都贴着背板，俯视就是一排对齐的方块。
          zCenter: -0.02 + random() * 0.05,
          splay: 10 + Math.round(random() * 5)
        })
      );
    }
  }
  return parts;
}

/**
 *
 * 为什么柱脚 / 柱帽只能靠**材质分带**表达：立柱的占地就是「宽 × 深」的完整占位（平面符号、
 * 命中检测、贴墙摆放都按这个来），任何外扩的线脚都会让包围盒超过 scaleBasis —— 而运行侧是按
 * scaleBasis 非等比缩放的，多出来的那一圈会被缩回去，柱子反而与邻近的墙穿插。
 * 所以这里只做内收 2mm 的分色缝：远看是柱脚 / 柱帽的两段分色，近看是一条浅浅的阴角线。
 */
function pillarSpec(shape) {
  const pillarWidth = 0.45;
  const pillarHeight = 2.8;
  const pillarDepth = 0.45;
  const baseHeight = 0.14;
  const capHeight = 0.12;
  const shaftHeight = pillarHeight - baseHeight - capHeight;
  const bandInset = 0.004;
  const shapeLabel = {
    square: "方柱",
    round: "圆柱",
    semicircle: "半圆柱",
    quarter: "四分之一圆柱",
    quarterinner: "内凹四分之一圆柱"
  }[shape];
  const parts = [];
  if (shape === "square") {
    parts.push(
      cbox(1, [pillarWidth - bandInset, baseHeight, pillarDepth - bandInset], [0, 0, 0]),
      cbox(0, [pillarWidth, shaftHeight, pillarDepth], [0, baseHeight, 0]),
      cbox(
        2,
        [pillarWidth - bandInset, capHeight, pillarDepth - bandInset],
        [0, baseHeight + shaftHeight, 0],
        { fullOnly: true }
      )
    );
  } else {
    // 圆截面走圆柱（lite 会把 40 段降到 20 段），椭圆截面的四种走轮廓拉体。
    const shaftPart =
      shape === "round"
        ? ccyl(0, pillarWidth / 2, shaftHeight, 40, [0, baseHeight, 0])
        : extrude(0, pillarOutline(shape, pillarWidth, pillarDepth), shaftHeight, [
            0,
            baseHeight,
            0
          ], { centered: true, rot: [-90, 0, 0] });
    const bandParts =
      shape === "round"
        ? [
            ccyl(1, (pillarWidth - bandInset) / 2, baseHeight, 40, [0, 0, 0]),
            ccyl(
              2,
              (pillarWidth - bandInset) / 2,
              capHeight,
              40,
              [0, baseHeight + shaftHeight, 0],
              { fullOnly: true }
            )
          ]
        : [
            extrude(
              1,
              pillarOutline(shape, pillarWidth - bandInset, pillarDepth - bandInset),
              baseHeight,
              [0, 0, 0],
              { centered: true, rot: [-90, 0, 0] }
            ),
            extrude(
              2,
              pillarOutline(shape, pillarWidth - bandInset, pillarDepth - bandInset),
              capHeight,
              [0, baseHeight + shaftHeight, 0],
              { centered: true, rot: [-90, 0, 0], fullOnly: true }
            )
          ];
    parts.push(bandParts[0], shaftPart, bandParts[1]);
  }
  return {
    note: `${shapeLabel}：柱脚 + 柱身 + 柱帽三段（同截面叠起，靠材质分色读线脚，不外扩占地）。`,
    size: [pillarWidth, pillarHeight, pillarDepth],
    slots: [
      { role: "body", color: 0xefede8, roughness: 0.66, metalness: 0.02 }, // 0 柱身
      { role: "base", color: 0xdcd7cd, roughness: 0.7, metalness: 0.02 }, // 1 柱脚
      { role: "trim", color: 0xe6e2da, roughness: 0.6, metalness: 0.03 } // 2 柱帽
    ],
    parts
  };
}

/**
 * U 形双跑楼梯的跑位计算（钢楼梯 / 玻璃楼梯共用）。
 *
 * **为什么必须折成两跑**：这两件的层高是 3.45 / 3.41m，而占地进深只有 2.93 / 2.84m。
 * 单跑要爬完 3.4m 至少 20 级，进深摊到 20 级只剩 0.145m 的踏面 —— 坡度 50°，那不是楼梯、
 * 是梯子。折成两跑之后每跑 10 级、踏面 0.243、踢面 0.1725，坡度 35°，正是国内住宅楼梯的做法
 * （也是这两件占地数值的由来）。
 *
 * **没有扶手是刻意的**：整件的高度就是「楼面到楼面的升高」，顶层踏面正好落在包围盒顶面，
 * 任何一段扶手都会高出去一米 —— 而运行侧按 scaleBasis 非等比缩放，多出来的那截会把整段
 * 楼梯压扁。三件楼梯（含直行的 stairs）一律只做梯段本体，扶手留给单独的栏板物件。
 *
 * 返回的是**可读的跑位参数**（每级踏面的标高与中心 z、斜梁的坡度与长度、平台的标高），
 * 具体零件由 uStairParts 拼 —— 两件楼梯的差别只在用料，跑位必须逐值一致。
 */
function uStairLayout({ size, flightWidth, stringerHeight, riserCount = 10, landingDepth = 0.5 }) {
  const [stairWidth, stairHeight, stairDepth] = size;
  const halfWidth = stairWidth / 2;
  const halfDepth = stairDepth / 2;
  // 平台贴在 -z 端；两跑分别从 +z 端往 -z 升、再从平台往 +z 升。
  const landingFrontZ = -halfDepth + landingDepth;
  const landingCenterZ = -halfDepth + landingDepth / 2;
  const run = halfDepth - landingFrontZ;
  const flightRise = stairHeight / (riserCount * 2);
  const flightTopY = flightRise * riserCount;
  const treadDepth = run / riserCount;
  const flightGap = stairWidth - flightWidth * 2;
  const flightCentersX = [
    -(flightGap / 2 + flightWidth / 2),
    flightGap / 2 + flightWidth / 2
  ];
  // 斜梁：沿梯段对角线的一根箱形梁，坡度就是楼梯坡度。长度**按竖直外框反解**，取到
  // 「这一跑的升高」为止：斜梁的上下端本来也不会顶到梯段的两个角上，而多出来的那点斜角
  // 会把包围盒顶出 size（生成器的 1mm 校验会当场报出来）。
  const stringerAngleDegrees = (Math.atan2(flightTopY, run) * 180) / Math.PI;
  const stringerRadians = (stringerAngleDegrees * Math.PI) / 180;
  const stringerLength =
    (flightTopY * 0.995 - stringerHeight * Math.cos(stringerRadians)) /
    Math.sin(stringerRadians);
  return {
    stairWidth,
    halfWidth,
    halfDepth,
    halfHeight: stairHeight / 2,
    landingFrontZ,
    landingCenterZ,
    landingDepth,
    run,
    flightRise,
    flightTopY,
    treadDepth,
    riserCount,
    flightWidth,
    flightCentersX,
    stringerHeight,
    stringerLength,
    stringerAngleDegrees,
    stringerCenterZ: (halfDepth + landingFrontZ) / 2
  };
}

/**
 * 由跑位参数拼出一件 U 形双跑楼梯的全部零件。
 *
 * 每跑两根斜梁（贴在梯段两侧的外缘）+ 每级一块踏板 + 每级一条防滑条，最后是中间平台：
 * 平台板 + 三根边梁（两侧 + 靠梯段那一侧）。
 * 踏板是**开口式**（不设踢面）—— 钢 / 玻璃楼梯的标准做法，也让 20 级踏板不至于连成一堵实心墙。
 * 防滑条与平台梁都写 fullOnly：它们是 lite 版的主要减重来源，也是近看才成立的构件。
 */
function uStairParts({
  layout,
  treadSlot,
  treadThickness,
  structureSlot,
  nosingSlot,
  treadInset,
  landingPlateThickness,
  landingInset = 0
}) {
  const parts = [];
  for (const flightIndex of [0, 1]) {
    const flightCenterX = layout.flightCentersX[flightIndex];
    // 斜梁的坡度对两跑是同一角度、相反方向：第一跑从 +z 往 -z 升，第二跑反过来。
    const stringerAngle = (flightIndex === 0 ? 1 : -1) * layout.stringerAngleDegrees;
    const stringerBaseY = flightIndex === 0 ? 0 : layout.flightTopY;
    for (const stringerX of [
      flightCenterX - layout.flightWidth / 2 + 0.025,
      flightCenterX + layout.flightWidth / 2 - 0.025
    ]) {
      parts.push(
        cbox(
          structureSlot,
          [0.05, layout.stringerHeight, layout.stringerLength],
          [stringerX, stringerBaseY, layout.stringerCenterZ],
          { centered: true, rot: [stringerAngle, 0, 0] }
        )
      );
    }
    for (let step = 0; step < layout.riserCount; step += 1) {
      const stepTopY = layout.flightRise * (step + 1) + flightIndex * layout.flightTopY;
      const stepCenterZ =
        flightIndex === 0
          ? layout.halfDepth - layout.treadDepth * (step + 0.5)
          : layout.landingFrontZ + layout.treadDepth * (step + 0.5);
      const treadWidth = layout.flightWidth - treadInset - 0.004;
      // 踏板两条长边原与斜梁的内外表面**逐面齐平**（两件朝向相同 → 同向共面，钢梯 34~36cm²/处、
      // 20 级×2 跑）。每边收 2mm 之后踏板完全落在两根斜梁之间，不再有共用平面。
      // 包围盒不受影响：梯段的 x 极值由斜梁外表面撑住（斜梁就贴在梯段外缘）。
      // 踏板的**前缘**在第一跑是 +z 侧、第二跑是 -z 侧（人往上走的那一侧）。
      const stepFrontSign = flightIndex === 0 ? 1 : -1;
      parts.push(
        cbox(treadSlot, [treadWidth, treadThickness, layout.treadDepth], [
          flightCenterX,
          stepTopY - treadThickness,
          stepCenterZ
        ])
      );
      if (treadInset > 0) {
        // 玻璃踏板的钢包边：夹在玻璃两条长边外侧（正好占满那 5cm 的缩进），
        // 比踏面低 1mm —— 平齐会与踏面共面闪烁。
        // 两处让位（都是原样对齐惹的同向共面）：
        //   1) 进深比踏面短 6mm —— 原来包边与玻璃踏板的 z 跨逐值相同（每级 1.1cm² 的同向共面）；
        //   2) 中心往玻璃侧挪 5mm —— 原来与斜梁的 x 跨逐值相同（1.205~1.255，x 上 4 处 24~26cm²）。
        //      挪过之后包边咬进玻璃 5mm（外侧仍收在斜梁体内），四个面都不再与任何件共面。
        parts.push(
          ...mirrorPair(
            cbox(
              nosingSlot,
              [treadInset / 2, treadThickness, layout.treadDepth - 0.006],
              [flightCenterX + treadWidth / 2 + treadInset / 4 - 0.005, stepTopY - treadThickness - 0.001, stepCenterZ],
              { centered: true, fullOnly: true }
            )
          )
        );
      } else {
        // 钢楼梯的防滑条：踏面前缘往里 3cm 的一条窄带，压在踏面下 1mm（做成凹槽而不是凸棱）。
        parts.push(
          cbox(
            nosingSlot,
            [treadWidth - 0.24, 0.008, 0.02],
            [
              flightCenterX,
              stepTopY - 0.009,
              stepCenterZ + stepFrontSign * (layout.treadDepth / 2 - 0.03)
            ],
            { fullOnly: true }
          )
        );
      }
    }
  }
  // 中间平台：平台板 + 三根边梁。缩进只做在**宽度**方向（两侧留给边梁）；
  // 进深方向必须铺满 —— 平台的靠外那一边就是整件的 -z 边界，缩进会让包围盒短一截。
  const landingPlateWidth = layout.stairWidth - landingInset;
  parts.push(
    cbox(treadSlot, [landingPlateWidth, landingPlateThickness, layout.landingDepth], [
      0,
      layout.flightTopY - landingPlateThickness,
      layout.landingCenterZ
    ]),
    // 边梁的**顶面**原正好顶住平台板底面（都在 flightTopY − 板厚）。木板单面渲染时那是一对
    // 背靠背的面（无害），但玻璃楼梯的平台是 DoubleSide 玻璃 —— 背面剔不掉，372.6cm² 整片都在闪。
    // 三根边梁一起下沉 3mm 即可：钢梯那件外观无变化，玻璃梯那件两个面终于分开了。
    cbox(structureSlot, [layout.stairWidth, 0.1, 0.05], [
      0,
      layout.flightTopY - landingPlateThickness - 0.103,
      layout.landingFrontZ + 0.025
    ], { fullOnly: true }),
    ...mirrorPair(
      cbox(structureSlot, [0.05, 0.1, layout.landingDepth], [
        layout.halfWidth - 0.025,
        layout.flightTopY - landingPlateThickness - 0.103,
        layout.landingCenterZ
      ], { centered: true, fullOnly: true })
    )
  );
  return parts;
}

export const MODEL_SPECS = Object.freeze({
  // ── 柜类（「档位即组合」的样板）────────────────────────────────────────────
  // 衣柜是做给「柜体与柜面是两种材质」这件事看的：柜体（箱体 + 侧框架 + 踢脚）与柜面（双门）
  // 是各自独立的网格与角色，因此同一个档位下可以「胡桃木柜体 + 哑光白门 + 金属拉手」。
  //
  // 这一段取代了原先的伪造做法：旧 cabinet.glb 是一整块木色箱体、没有门板几何，「木柜体 + 白门」
  // 是靠一段着色器在正面切出来的（尺寸写死在 GLSL 里、只在暖阳原木主题下生效、不能逐物件选）。
  // 门板现在是真几何，所以那走着色器的整条路已经自行失效（材质名从 material-0 变成
  // material-0-body，旧判据 /material-0$/ 不再命中）。
  cabinet: {
    note: "衣柜 / 储物柜：柜体 + 双侧框架 + 对开门 + 踢脚 + 竖条拉手。门板前留 5.6cm 侧回边与 2.8cm 中缝，读成成品柜。",
    size: [1.6, 1.9, 0.45],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.66, metalness: 0 }, // 0 柜体箱体
      { role: "door", color: 0xf5f3ef, roughness: 0.24, metalness: 0.08 }, // 1 门板
      { role: "metal", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }, // 2 拉手
      { role: "trim", color: 0x5a3a22, roughness: 0.66, metalness: 0 }, // 3 侧框架 / 封边
      { role: "base", color: 0x4a2e1a, roughness: 0.7, metalness: 0 } // 4 踢脚
    ],
    parts: [
      // 踢脚：内缩 5cm，底边落地 —— 落地那 6cm 因此是踢脚而不是柜体。
      cbox(4, [1.46, 0.06, 0.38], [0, 0, -0.03]),
      // 柜体箱体：底面抬到 0.06（踢脚之上），深度到门板背后为止。
      cbox(0, [1.56, 1.84, 0.41], [0, 0.06, -0.02]),
      // 左右侧框架：把门板框住，正面留出 3.6cm 侧回边，同时凑满满宽 1.6。
      cbox(3, [0.02, 1.84, 0.41], [-0.79, 0.06, -0.02]),
      cbox(3, [0.02, 1.84, 0.41], [0.79, 0.06, -0.02]),
      // 对开门：各 0.73 宽，中缝 2.8cm，上端留 5.5cm 顶回边、下端与踢脚平齐。
      cbox(1, [0.73, 1.785, 0.02], [-0.379, 0.06, 0.195]),
      cbox(1, [0.73, 1.785, 0.02], [0.379, 0.06, 0.195]),
      // 竖条拉手：贴在中缝两侧，凸出门板 2cm（占地深度仍未超 0.45 —— 它是最前缘）。
      cbox(2, [0.02, 0.28, 0.02], [-0.036, 1, 0.215], { fullOnly: true }),
      cbox(2, [0.02, 0.28, 0.02], [0.036, 1, 0.215], { fullOnly: true })
    ]
  },
  // ── 组合茶几（两件式石材件）──────────────────────────────────────────────
  // 对着一张实物照片做的：上块是向左悬挑的**白石板**，下面坐着贯通到地面、更长更宽的**黑石座**，
  // 两块叠合错位 —— 不是「台面 + 四条腿」那种做法，所以**没有 leg 槽位**，只有
  // top（白石板）与 base（黑石座）两个角色。这两块必须分色，否则整件会读成一块灰石头。
  //
  // 石座的长宽比刻意做大（1.72 / 1.05 ≈ 1.64）：照片里它就是一条明显的长条黑石台，
  // 压成 1.5 × 1.25 那样近乎方形的块，两块叠起来会读成「一个方墩子上放了块板」，
  // 组合的错位感就没了。平面符号（studio-app.js 的 drawPlanItem）按同一组比例画，改这里必须一起改。
  coffeetable: {
    note: "组合茶几：悬挑的白色石板压在通体黑色石座上，两件叠合错位；白石板即石材台面。",
    size: [1.9, 0.5, 1.05],
    slots: [
      { role: "top", color: 0xf2f1ed, roughness: 0.18, metalness: 0.02 }, // 0 白石板
      { role: "base", color: 0x1e2023, roughness: 0.15, metalness: 0.03 } // 1 黑石座
    ],
    parts: [
      // 黑石座：落地那一件。右端顶到 +0.95，长 1.72 / 深 1.05 —— 长宽比 1.64。
      croundedBox(1, [1.72, 0.3, 1.05], [0.09, 0, 0], { radius: 0.008 }),
      // 白石板：坐在黑石座之上（0.30 → 0.50），向左错位悬挑，左端顶到 -0.95 把总宽凑满 1.90。
      // 进深收到 0.85 是**跟着石座收的**：石座进深一窄，白石板若还留 1.05 就会与它等深，
      // 俯视看只剩一条缝，读不出「大石台上压着一块小石板」。
      croundedBox(0, [1.0, 0.2, 0.85], [-0.45, 0.3, 0], { radius: 0.008 })
    ]
  },
  // ── 三人沙发（布艺座位的样板）────────────────────────────────────────────
  // 这件取代了原先的两处旧做法，两处都值得记一笔：
  //
  //   1. 旧 sofa.glb（材质名 ha-sofa-frame / ha-sofa-cushions）只有两块几何，没有腿、也没有
  //      扶手与坐垫的分件 —— 而它**从来没被画出来过**：sofa 不在 EXTERNAL_MODEL_ITEM_TYPES 里，
  //      registry.js 那条外部模型判据从不命中，所以那份资源一直是死的（注册表↔目录的护栏只查
  //      「两头对得上」，查不出「注册了但没人会加载」）。
  //   2. 画面上真正在跑的是 seating.js 的程序化方块版：它把整件抬高 0.115m 却不画任何腿，
  //      沙发是**浮空**的。
  //
  // 现在按实物分件：收分木脚 / 木框座台 / 一体软包座箱与靠背与扶手 / 三块可分离坐垫 /
  // 三块靠垫 / 两只抱枕。撞色落在**抱枕**上（accent）而不是扶手上：同料主体 + 撞色抱枕
  // 正是沙发与椅子在实物上最典型的区别，fabricCombo 的 accent / cushion 兜底也都是「跟随主体」。
  sofa: {
    note: "三人沙发：收分木脚 + 木框座台 + 一体软包座箱 / 靠背 / 扶手 + 三块可分离坐垫 + 三块靠垫 + 两只抱枕。",
    size: [2.2, 0.82, 0.9],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 }, // 0 木脚
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 1 座台木框 / 望板
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 }, // 2 座箱 / 靠背 / 扶手
      { role: "cushion", color: 0xefe0cd, roughness: 0.92, metalness: 0 }, // 3 坐垫 / 靠垫
      { role: "accent", color: 0xd8b49c, roughness: 0.9, metalness: 0 } // 4 抱枕
    ],
    parts: [
      // 四条收分木脚：0 → 0.12。腿心内缩到 ±1.02 / ±0.36，整条腿都藏在座箱投影里 ——
      // 腿伸到座箱外面就变成「四条腿撑着个盒子」，沙发的腿几乎都是内收的。
      ...mirrorPair([
        ctaper(0, 0.028, 0.02, 0.12, 12, [1.02, 0, 0.36]),
        ctaper(0, 0.028, 0.02, 0.12, 12, [1.02, 0, -0.36])
      ]),
      // 座台木框：宽深吃满 2.2 × 0.9 —— 沙发的占地由它定，前面那四条腿都在它投影之内。
      cbox(1, [2.2, 0.09, 0.9], [0, 0.12, 0]),
      // 座箱软包：坐在木框上（0.21 → 0.38）。扶手与靠背都从这一层长上去。
      croundedBox(2, [2.2, 0.17, 0.9], [0, 0.21, 0], { radius: 0.03 }),
      // 靠背：贴着座箱后沿（z −0.45 → −0.27），顶端正好落在 0.82 —— 整件高度由它定。
      croundedBox(2, [2.2, 0.61, 0.18], [0, 0.21, -0.36], { radius: 0.05 }),
      // 两侧扶手：宽 0.18、外沿顶到 ±1.10，比靠背低 19cm。拖到与靠背齐平会读成一张围子床。
      ...mirrorPair(croundedBox(2, [0.18, 0.42, 0.9], [1.01, 0.21, 0], { radius: 0.05 })),
      // 三块可分离坐垫：正好铺满两侧扶手之间的 1.84m（3 × 0.6 + 两条 2cm 缝），
      // 前沿比座箱缩进 6cm，坐下时的坐深压线才看得出来。
      croundedBox(3, [0.6, 0.14, 0.66], [-0.62, 0.38, 0.06], { radius: 0.04 }),
      croundedBox(3, [0.6, 0.14, 0.66], [0, 0.38, 0.06], { radius: 0.04 }),
      croundedBox(3, [0.6, 0.14, 0.66], [0.62, 0.38, 0.06], { radius: 0.04 }),
      // 三块靠垫：倚在靠背上，下沿压住坐垫 2cm（悬空摆会读成三块飘着的板）。
      croundedBox(3, [0.58, 0.34, 0.18], [-0.61, 0.4, -0.18], { radius: 0.05 }),
      croundedBox(3, [0.58, 0.34, 0.18], [0, 0.4, -0.18], { radius: 0.05 }),
      croundedBox(3, [0.58, 0.34, 0.18], [0.61, 0.4, -0.18], { radius: 0.05 }),
      // 两只抱枕：撞色件，靠在两侧的靠垫前。只在完整版保留 —— lite 那份先把它们丢掉，
      // 轮廓（扶手 / 靠背 / 坐垫）不受影响。
      ...mirrorPair(
        croundedBox(4, [0.36, 0.32, 0.13], [0.66, 0.44, -0.02], { radius: 0.05, fullOnly: true })
      )
    ]
  },
  // ── 客厅休闲椅与凳 ───────────────────────────────────────────────────────
  armchair: {
    note: "单人沙发椅：木框架（座台 + 望板 + 收分木脚）+ 布艺坐垫 / 靠背 + 扶手 + 靠枕。",
    size: [0.85, 0.75, 0.8],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 }, // 0 木脚
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 1 座台 / 望板
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 }, // 2 坐垫 / 靠背
      { role: "accent", color: 0xe4d5c2, roughness: 0.9, metalness: 0 }, // 3 扶手
      { role: "cushion", color: 0xefe0cd, roughness: 0.92, metalness: 0 } // 4 靠枕
    ],
    parts: [
      ...mirrorPair([
        ctaper(0, 0.022, 0.016, 0.16, 12, [0.375, 0, 0.335]),
        ctaper(0, 0.022, 0.016, 0.16, 12, [0.375, 0, -0.335])
      ]),
      // 座台：深度吃满 0.8（沙发的进深就由它定），腿藏在四角内侧。
      cbox(1, [0.79, 0.07, 0.8], [0, 0.16, 0]),
      croundedBox(2, [0.76, 0.14, 0.72], [0, 0.3, 0], { radius: 0.05 }),
      // 靠背：顶端正好落在 0.75（0.37 + 0.38）。
      croundedBox(2, [0.79, 0.38, 0.14], [0, 0.37, -0.31], { radius: 0.05 }),
      // 扶手：宽度撑满 0.85，是这件家具在平面图上最外的一圈。
      ...mirrorPair(croundedBox(3, [0.09, 0.2, 0.7], [0.38, 0.4, -0.025], { radius: 0.04 })),
      croundedBox(4, [0.5, 0.24, 0.1], [0, 0.5, -0.2], { radius: 0.04, fullOnly: true })
    ]
  },
  loungechair: {
    note: "休闲躺椅：皮革长条座面 + 后仰靠背（靠背顶端正好落在 0.85），细金属框架腿。",
    size: [0.7, 0.85, 1.6],
    slots: [
      { role: "leg", color: 0x2e2a26, roughness: 0.4, metalness: 0.25 }, // 0 金属框架 / 腿
      { role: "upholstery", color: 0xb0703c, roughness: 0.62, metalness: 0.02 }, // 1 皮革
      { role: "accent", color: 0x9c5f30, roughness: 0.62, metalness: 0.02 } // 2 靠背皮面
    ],
    parts: [
      ...mirrorPair([
        ctaper(0, 0.02, 0.016, 0.3, 10, [0.325, 0, 0.755]),
        ctaper(0, 0.02, 0.016, 0.3, 10, [0.325, 0, -0.755])
      ]),
      // 座面：进深吃满 1.6（0.8 × 2），靠背与横杆都收在它里面。
      croundedBox(1, [0.7, 0.12, 1.6], [0, 0.3, 0], { radius: 0.05 }),
      // 靠背：绕自身中心后仰 30°，底端抬到 0.307 ⇒ 顶端 = 0.307 + (0.6−0.1)·cos30 + (0.12−0.1)·sin30 + 0.1 = 0.85。
      // 后仰之后它在 z 上占 (0.6−0.1)·sin30 + (0.12−0.1)·cos30 + 2·0.1 / 2 = 0.1837（圆角盒的极值要按
      // 「缩小 2r 的核心盒 + 半径 r 的球」算，直接用 0.6 / 0.12 会把顶端算高 3.7cm）。
      // 宽度收 4mm：坐垫（0.70）与靠背（0.70）同宽时两者的 ±x 侧面同向共面（左右各 1~1.8cm²），
      // 绕 x 轴后仰不改变 x 法线，所以两面仍落在同一个 x 平面上。占地的 x 极值由坐垫撑住，不受影响。
      croundedBox(
        2,
        [0.696, 0.6, 0.12],
        [0, 0.307, -0.6163],
        { radius: 0.05, rot: [-30, 0, 0] }
      ),
      box(0, [0.66, 0.035, 0.05], [-0.33, 0.14, -0.8]),
      box(0, [0.66, 0.035, 0.05], [-0.33, 0.14, 0.75], { fullOnly: true })
    ]
  },
  ottoman: {
    note: "脚凳：圆角方软包 + 四条收分木脚 + 顶面压线，可兼作临时坐凳。",
    size: [0.6, 0.4, 0.45],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 }, // 0 木脚
      { role: "upholstery", color: 0xe4d5c2, roughness: 0.92, metalness: 0 }, // 1 软包
      { role: "trim", color: 0xd8c6b0, roughness: 0.9, metalness: 0 } // 2 压线
    ],
    parts: [
      ...mirrorPair([
        ctaper(0, 0.022, 0.016, 0.12, 12, [0.255, 0, 0.185]),
        ctaper(0, 0.022, 0.016, 0.12, 12, [0.255, 0, -0.185])
      ]),
      // 软包坐面：0.125 ~ 0.40（圆角方包）。底面比压线高 5mm —— 见下面压线那条注释。
      croundedBox(1, [0.6, 0.275, 0.45], [0, 0.125, 0], { radius: 0.07 }),
      // 束腰压线：贴地那一圈内缩 2cm，读起来是「布面收在木脚上」而不是一坨布压在地上。
      // 底面与坐面**不能齐平**（0.12）：两块的下表面朝向相同，从下方看过去是 0.23m² 的共面竞争。
      // 压线自己也落成「束腰」：坐面从 0.125 起，压线独占 0.12 ~ 0.17 这一段，外侧读起来是内缩的底座。
      croundedBox(2, [0.56, 0.05, 0.41], [0, 0.12, 0], { radius: 0.012, fullOnly: true })
    ]
  },
  bench: {
    note: "长凳：厚座板 + 四条收分腿 + 三面望板 + 底横杆，餐桌侧或床尾都能用。",
    size: [1.4, 0.45, 0.42],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 座板
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 }, // 1 腿
      { role: "trim", color: 0x9c6b3f, roughness: 0.68, metalness: 0 } // 2 望板 / 横杆
    ],
    parts: [
      ...mirrorPair([
        ctaper(1, 0.026, 0.019, 0.405, 14, [0.61, 0, 0.15]),
        ctaper(1, 0.026, 0.019, 0.405, 14, [0.61, 0, -0.15])
      ]),
      // 望板：长边两道 + 短边两道，望板是「这是一件木工家具」最省顶点的表达。
      cbox(2, [1.24, 0.07, 0.024], [0, 0.33, 0.185]),
      cbox(2, [1.24, 0.07, 0.024], [0, 0.33, -0.185]),
      ...mirrorPair(cbox(2, [0.024, 0.07, 0.3], [0.6, 0.33, 0])),
      cbox(0, [1.4, 0.045, 0.42], [0, 0.405, 0]),
      ccyl(1, 0.012, 1.16, 10, [0, 0.14, 0], { rot: [0, 0, 90], align: "center", fullOnly: true })
    ]
  },
  // ── 餐椅 ────────────────────────────────────────────────────────────────
  // 餐椅的样板：四条收分木脚 + 木座框 + 软包坐垫 + 两根后腿延伸成的靠背立柱 + 上横档 + 靠背软垫。
  //
  // 靠背立柱是**后腿本身往上延伸**出来的（同一根料），所以它们与腿同角色；靠背那一片软垫
  // 与坐垫同角色（同一批织物）。旧资产是 chair-material-0 / 1 两块，槽位语义只写在
  // studio-external-models.js 的「0 号是椅面、其余是木色」注释里 —— 那份注释跟着一起改成按角色判。
  chair: {
    note: "餐椅：四条收分木脚 + 木座框 + 软包坐垫 + 后腿延伸的靠背立柱与上横档 + 靠背软垫。",
    size: [0.5, 0.86, 0.5],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 }, // 0 木脚
      { role: "frame", color: 0xc49a6c, roughness: 0.66, metalness: 0 }, // 1 座框 / 靠背立柱 / 横档
      { role: "upholstery", color: 0xe4d5c2, roughness: 0.92, metalness: 0 } // 2 坐垫 / 靠背软垫
    ],
    parts: [
      // 四条收分木脚：0 → 0.415，腿心在 ±0.21 / ±0.21，收在坐垫投影之内。
      // 腿顶比座框的**顶面**（0.42）低 5mm —— 腿顶与座框顶同高时两个上表面同向共面（0.8cm²）。
      // 腿顶仍埋在座框体内（座框 0.37~0.42），这 5mm 看不见。
      ...mirrorPair([
        ctaper(0, 0.022, 0.016, 0.415, 10, [0.21, 0, 0.21]),
        ctaper(0, 0.022, 0.016, 0.415, 10, [0.21, 0, -0.21])
      ]),
      // 木座框：0.37 → 0.42，比坐垫小一圈（坐垫的边要压出来）。
      cbox(1, [0.46, 0.05, 0.46], [0, 0.37, 0]),
      // 软包坐垫：宽深吃满 0.5 × 0.5 —— 餐椅的占地由它定。
      croundedBox(2, [0.5, 0.07, 0.5], [0, 0.42, 0], { radius: 0.03 }),
      // 靠背立柱：与后腿同一根料、往上接到 0.86（整件高度由它定）。
      ...mirrorPair(cbox(1, [0.045, 0.44, 0.045], [0.21, 0.42, -0.21])),
      // 上横档：把两根立柱连起来，宽 0.465 刚好落在两柱外沿之间。
      cbox(1, [0.465, 0.06, 0.05], [0, 0.8, -0.21]),
      // 靠背软垫：夹在两根立柱之间（两端各留 1.5cm 让立柱露出来）。
      croundedBox(2, [0.36, 0.22, 0.045], [0, 0.56, -0.21], { radius: 0.02 })
    ]
  },
  barstool: {
    note: "吧凳：外八金属腿 + 环状踏脚 + 圆木座面（带盘边），配吧台用。",
    size: [0.42, 0.95, 0.42],
    slots: [
      { role: "leg", color: 0x454c54, roughness: 0.32, metalness: 0.3 }, // 0 金属腿 / 踏脚圈
      { role: "top", color: 0xc49a6c, roughness: 0.66, metalness: 0 } // 1 木座面
    ],
    parts: [
      // 四条腿外八 3°：站得开、看着稳；环列时朝向自动补正，不必自己算 sin / cos。
      ...ringOf(4, { radius: 0.135, startAngle: 45 }, () =>
        ctaper(0, 0.016, 0.012, 0.9, 14, [0, 0, 0], { rot: [3, 0, 0] })
      ),
      // 踏脚圈：一个环比四根横杆更省顶点，也更像实物（圈随腿外八略微放大到 0.148）。
      ctorus(0, 0.148, 0.009, [0, 0.27, 0], { fullOnly: true }),
      clathe(
        1,
        [
          [0, 0],
          [0.21, 0],
          [0.21, 0.035],
          [0.19, 0.05],
          [0, 0.05],
          [0, 0]
        ],
        36,
        [0, 0.9, 0]
      )
    ]
  },
  sidetable: {
    note: "边几：薄台面 + 四条收分木腿 + 下层置物板，沙发扶手旁的置物小几。",
    size: [0.45, 0.55, 0.45],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 台面
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 }, // 1 腿
      { role: "shelf", color: 0xc49a6c, roughness: 0.68, metalness: 0 } // 2 下层置物板
    ],
    parts: [
      // 四条腿摆在四角（环列 + 45° 起始角），上粗下细 —— 真实边几的腿都有一点收分。
      ...ringOf(4, { radius: 0.269, startAngle: 45 }, () =>
        ctaper(1, 0.018, 0.012, 0.52, 14, [0, 0, 0])
      ),
      cbox(0, [0.45, 0.03, 0.45], [0, 0.52, 0]),
      // 置物板的尺寸要小于腿的内净距，否则会穿出腿外（0.34 < 2 × 0.19 - 0.018）。
      cbox(2, [0.34, 0.02, 0.34], [0, 0.17, 0], { fullOnly: true })
    ]
  },
  console: {
    note: "玄关台：窄长台面 + 单层抽屉 + 四条收分腿 + 底横撑，靠墙放钥匙与摆件。",
    size: [1.2, 0.8, 0.35],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 台面
      { role: "body", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 1 箱体
      { role: "drawer", color: 0xd8b98f, roughness: 0.62, metalness: 0 }, // 2 抽屉面
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 }, // 3 腿
      { role: "trim", color: 0x9c6b3f, roughness: 0.68, metalness: 0 } // 4 横撑
    ],
    parts: [
      ...mirrorPair([
        ctaper(3, 0.022, 0.016, 0.6, 14, [0.545, 0, 0.135]),
        ctaper(3, 0.022, 0.016, 0.6, 14, [0.545, 0, -0.135])
      ]),
      cbox(1, [1.12, 0.165, 0.32], [0, 0.6, 0]),
      cbox(2, [1.04, 0.12, 0.02], [0, 0.615, 0.16]),
      // 拉手：一条通长的木条比两个小圆钮更像这一档家具的做法。
      // 外凸必须收在 0.175 以内：它是占地最深的一件，多 5mm 就会把整件撑深（生成器会当场拦下）。
      cbox(2, [0.26, 0.018, 0.016], [0, 0.685, 0.167], { fullOnly: true }),
      cbox(4, [1.06, 0.028, 0.26], [0, 0.22, 0], { fullOnly: true }),
      cbox(0, [1.2, 0.035, 0.35], [0, 0.765, 0])
    ]
  },

  // ── 收纳柜 ──────────────────────────────────────────────────────────────
  // ── 柜类：既有二进制资产迁进流水线（第二批）─────────────────────────────
  // 这一批原有 8 件（床头柜 / 电视柜 / 书柜 / 玻璃柜 / 置物架 / 吊柜 / 鞋柜 / 梳妆台），
  // 其中鞋柜后来退回了既有资产（见下面 shoecabinet 位置的说明），现为 7 件。这些件在迁移前
  // 全是别人家的 GLB：材质名只有槽位号、没有角色，运行侧只能整件套一个「家具三档灰」，
  // 于是木柜体与白柜门同色、玻璃门与实木门同色 —— 「柜体和柜面是两种材质」这件事在它们身上
  // 根本表达不出来。而且实测尺寸与声明的占地普遍差 7~9%（见 tools/audit_model_glb.mjs 的债务表，
  // 最狠的 bar 差 16%），运行侧按分轴缩放硬拉到声明尺寸，成品是歪的。
  //
  // 重建后这 7 件共用柜类那套骨架（箱体 / 门板 / 抽屉 / 层板 / 踢脚 / 台面 / 五金），
  // 尺寸与声明的 scaleBasis 逐值相等（所以平面符号与既有存档都不用动），
  // 档位直接用 JOINERY_STYLES —— 木柜白门 / 浅橡木 / 胡桃木 / 烤漆各档下柜体、柜面、
  // 台面、五金各归其位。
  nightstand: {
    note: "床头柜：四条收分木腿 + 上层抽屉箱 + 下层敞格层板 + 台面。",
    size: [0.5, 0.55, 0.42],
    slots: [
      { role: "leg", color: 0x5a3a22, roughness: 0.62, metalness: 0 }, // 0 木腿
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 1 抽屉箱体 / 敞格背板
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 }, // 2 抽屉面
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 }, // 3 台面
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 4 拉手
      { role: "shelf", color: 0x8a6a4a, roughness: 0.62, metalness: 0 } // 5 敞格层板
    ],
    parts: [
      // 腿心退到 ±0.20 / ±0.16：腿间净空够宽，才读得出是「四条腿」而不是一块箱座。
      ...fourLegs(0, { legSpanX: 0.2, legSpanZ: 0.16, legSize: 0.036, height: 0.34, square: false }),
      // 下层敞格：层板架在腿之间（离地 0.14），背后补一块背板，否则视线会穿到墙。
      cbox(5, [0.42, 0.018, 0.36], [0, 0.14, -0.01]),
      cbox(1, [0.42, 0.2, 0.018], [0, 0.158, -0.191], { fullOnly: true }),
      // 抽屉箱体坐在腿上（0.34 → 0.528），比台面各缩 2cm，台面才有「压边」可读。
      cbox(1, [0.46, 0.188, 0.38], [0, 0.34, -0.01]),
      cbox(2, [0.4, 0.15, 0.02], [0, 0.355, 0.185]),
      cbox(4, [0.16, 0.014, 0.014], [0, 0.462, 0.202], { fullOnly: true }),
      // 台面：整件最宽最深的一件，占地 0.5 × 0.42 由它定。
      cbox(3, [0.5, 0.022, 0.42], [0, 0.528, 0])
    ]
  },
  tvstand: {
    note: "电视柜：踢脚 + 左右抽屉箱 + 中间敞开层格 + 台面（顶面能放电视），左右各一根横向拉手。",
    size: [1.8, 0.48, 0.42],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 0 左右抽屉箱
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 }, // 1 踢脚
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 }, // 2 抽屉面
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 }, // 3 台面
      { role: "interior", color: 0x8a6a4a, roughness: 0.66, metalness: 0 }, // 4 敞开格背板
      { role: "shelf", color: 0x8a6a4a, roughness: 0.62, metalness: 0 }, // 5 敞开格层板
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 } // 6 拉手
    ],
    parts: [
      // 踢脚内缩 6cm：落地那 5cm 因此是踢脚而不是箱体正面。
      cbox(1, [1.68, 0.05, 0.3], [0, 0, -0.03]),
      // 左右抽屉箱各 0.58 宽，中间留 0.6 的敞开格（机顶盒 / 音响放这里）。
      cbox(0, [0.58, 0.4, 0.4], [-0.59, 0.05, -0.01]),
      cbox(0, [0.58, 0.4, 0.4], [0.59, 0.05, -0.01]),
      cbox(4, [0.6, 0.4, 0.018], [0, 0.05, -0.201], { fullOnly: true }),
      // 层板比敞开格的净宽（0.6）窄 4mm：净宽与背板同宽会让两者的 **+x / −x 侧面同向共面**
      // （左右各 1.3cm²）。收 2mm / 边之后层板落在背板厚度之内，侧面比背板内缩一格。
      cbox(5, [0.596, 0.016, 0.38], [0, 0.25, -0.01], { fullOnly: true }),
      cbox(2, [0.52, 0.3, 0.02], [-0.59, 0.09, 0.19]),
      cbox(2, [0.52, 0.3, 0.02], [0.59, 0.09, 0.19]),
      cbox(6, [0.3, 0.014, 0.014], [-0.59, 0.352, 0.202], { fullOnly: true }),
      cbox(6, [0.3, 0.014, 0.014], [0.59, 0.352, 0.202], { fullOnly: true }),
      // 台面：整件最宽最深的一件，占地 1.8 × 0.42 由它定。
      cbox(3, [1.8, 0.03, 0.42], [0, 0.45, 0])
    ]
  },
  bookcase: {
    note:
      "书柜：落地踢脚 + 双侧板 + 中竖板（分左右两列）+ 下柜双门与竖条拉手 + 四层可调层板 + 背板 + 顶板；" +
      "格口里是成排的书（竖立 / 斜靠 / 平放）与花瓶、相框摆件。",
    size: [1.2, 1.9, 0.32],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 0 侧板 / 中竖板
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 }, // 1 踢脚
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 }, // 2 层板 / 下柜底板
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 }, // 3 背板
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 }, // 4 顶板
      { role: "door", color: 0xd8b98f, roughness: 0.54, metalness: 0 }, // 5 下柜双门
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 6 拉手 / 相框
      { role: "book", color: 0xcbb289, roughness: 0.82, metalness: 0 }, // 7 书脊（纸）
      { role: "accent", color: 0xa9563f, roughness: 0.78, metalness: 0 } // 8 书脊（撞色）/ 花瓶
    ],
    // 尺寸标注（全部是「底面高度」，与 cbox 的 y 语义一致；盒厚 0.018）：
    //   踢脚 0~0.06 · 侧板 / 中竖板 0.06~1.86（咬进顶板 1cm）· 背板 0.08~1.845 · 顶板 1.85~1.90
    //   层板底面 0.510 / 0.852 / 1.192 / 1.532 —— 0.510 那块同时是下柜顶面。
    // 为什么每一条边界都刻意错开几毫米：**不同槽位 = 不同材质**，而共面重叠检测（audit_coplanar_faces）
    // 判的就是「两块不同材料的面落在同一平面上且投影有重叠」。侧板顶面若正好落在顶板底面上、
    // 或者背板底面正好落在层板底面上，就会沿柜体闪一圈细线；这里靠「咬进去」或「让开几毫米」逐条避开。
    parts: [
      // ── 柜体 ────────────────────────────────────────────────────────────────
      // 踢脚：正面让开 4cm、两侧让开 2cm，落地那 6cm 因此读成踢脚而不是柜体正面。
      cbox(1, [1.12, 0.06, 0.24], [0, 0, -0.02]),
      // 侧板：落地到顶板里 1cm（1.86），而且**比顶板窄 2mm**（±0.598 对 ±0.6）——
      // 若侧板外沿与顶板外沿齐平，咬进去那一截的外侧面就会与顶板的外侧面共面（柜顶侧面会闪）。
      cbox(0, [0.02, 1.8, 0.29], [-0.588, 0.06, -0.005]),
      cbox(0, [0.02, 1.8, 0.29], [0.588, 0.06, -0.005]),
      // 中竖板：从下柜顶面板**内部**起（0.52），把柜格分成左右两列（否则 1.2m 宽的层板要压弯）。
      cbox(0, [0.016, 1.34, 0.29], [0, 0.52, -0.005]),
      // 背板走 interior：正对格口的那一面就是它，也是「有背板」与「通透架」的区别所在。
      // 四面都缩在侧板内（x 2mm、z 2mm、上下各让 20mm），避开与侧板 / 层板的共面。
      cbox(3, [1.146, 1.765, 0.014], [0, 0.08, -0.141]),
      // 下柜底板：抬高 2mm 坐在踢脚上（严格贴着踢脚顶面就是一对共面三角形）。
      cbox(2, [1.15, 0.018, 0.25], [0, 0.062, -0.005]),
      // 下柜顶面（同时是第一层层板）与另外三层层板。
      ...[0.51, 0.852, 1.192, 1.532].map(bookcaseShelfY =>
        cbox(2, [1.15, 0.018, 0.25], [0, bookcaseShelfY, -0.005])
      ),
      // ── 下柜双门 + 竖条拉手 ────────────────────────────────────────────────
      // 门板四周各留 1cm 露肩（外侧留 10mm、上下留 12mm、中缝 24mm），正面凸出柜体 6mm。
      // 门板四周各留 1cm 露肩（外侧留 10mm、上下留 12mm、中缝 24mm），正面凸出柜体 6mm。
      // 门板一律**直角**（不写 radius）：书柜 / 鞋柜都在 SQUARE_EDGE_ITEM_TYPES 里，
      // 占位几何走的就是 BoxGeometry —— 这里做圆角会让「模型加载完成的那一帧」门沿变一次形。
      ...mirrorPair(cbox(5, [0.556, 0.426, 0.016], [0.29, 0.072, 0.138])),
      // 竖条拉手贴在中缝两侧：正面到 0.16，正好与顶板前缘齐平 —— 再往外就越过占地（深度 0.32）。
      ...mirrorPair(cbox(6, [0.014, 0.14, 0.016], [0.045, 0.32, 0.152])),
      // 顶板：占地 1.2 × 0.32 由它定，两侧各压出侧板 2mm。
      cbox(4, [1.2, 0.05, 0.32], [0, 1.85, 0]),
      // ── 格口里的书与摆件 ───────────────────────────────────────────────────
      // 左右两列各四个格口（下柜之上四层）；两列给不同的种子，书的厚度 / 高度 / 颜色分布因此不同。
      ...bookcaseShelfContents(),
      // 最上层右格让给摆件：一只花瓶 + 一个相框，免得整柜读成仓库。
      ...bookcaseDecorParts({
        bottomY: 1.546,
        centerX: 0.16,
        zCenter: 0.02,
        slot: 8,
        kind: "vase",
        height: 0.24,
        seed: 91
      }),
      ...bookcaseDecorParts({
        bottomY: 1.546,
        centerX: 0.42,
        zCenter: 0.01,
        slot: 6,
        kind: "frame",
        height: 0.22,
        seed: 17
      })
    ]
  },
  glasscabinet: {
    note: "玻璃柜：踢脚 + 柜体（顶底板 / 双侧板 / 背板 / 中竖板）+ 两块木层板 + 两扇整扇玻璃门 + 竖条拉手。",
    size: [1.2, 1.9, 0.4],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 0 柜体
      { role: "glass", color: 0xa9c5d3, roughness: 0.12, metalness: 0.04 }, // 1 玻璃门
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 }, // 2 背板 / 中竖板
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 }, // 3 层板
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 }, // 4 踢脚
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 5 拉手
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 } // 6 顶板
    ],
    parts: [
      cbox(4, [1.12, 0.08, 0.32], [0, 0, -0.03]),
      // 顶板：占地 1.2 × 0.4 由它定。
      cbox(6, [1.2, 0.06, 0.4], [0, 1.84, 0]),
      cbox(0, [1.14, 0.02, 0.36], [0, 0.08, -0.01]),
      cbox(0, [0.02, 1.76, 0.36], [-0.58, 0.08, -0.01]),
      cbox(0, [0.02, 1.76, 0.36], [0.58, 0.08, -0.01]),
      // 背板走 interior：透过玻璃直视到的就是它，也是玻璃「透不透」的关键一面。
      // 三处让位（都是原样对齐惹的同向共面）：
      //   1) 底面从 0.08 抬到 0.10 —— 原来与底板的下表面同朝下（79.8cm²）；
      //   2) 背面从 −0.19 收到 −0.186 —— 原来与侧板 / 底板的后表面同朝 −z（114cm²）；
      //   3) 正面从 −0.176 收到 −0.172 —— 层板的后缘正好贴到它，两件背靠背（无害）。
      cbox(2, [1.14, 1.74, 0.014], [0, 0.10, -0.179]),
      cbox(2, [0.016, 1.74, 0.352], [0, 0.10, -0.01], { fullOnly: true }),
      // 层板：宽收 4mm、后缘让到背板正面（−0.172）、底面抬到 0.10，三处原都与背板同面
      // （z −0.19 共 92cm²、x ±0.57 各 1.7cm²）。
      ...[0.66, 1.26].map(glassCabinetShelfY =>
        cbox(3, [1.136, 0.018, 0.322], [0, glassCabinetShelfY, -0.011])
      ),
      // 两扇整扇玻璃门：无框中缝 5mm，正面到 0.19。
      cbox(1, [0.573, 1.72, 0.01], [-0.2895, 0.1, 0.185]),
      cbox(1, [0.573, 1.72, 0.01], [0.2895, 0.1, 0.185]),
      // 竖条拉手贴在中缝两侧：正面到 0.2，与顶板前缘齐平，不越占地。
      // 厚度收到 8mm（背面 0.192）：原来背面正好压在玻璃门正面（0.19）上 —— 玻璃是 DoubleSide，
      // 这一对背靠背的面会同时rasterize（16.2cm²）。前面仍是 0.2，占地不变。
      cbox(5, [0.018, 0.18, 0.008], [-0.032, 0.86, 0.196], { fullOnly: true }),
      cbox(5, [0.018, 0.18, 0.008], [0.032, 0.86, 0.196], { fullOnly: true })
    ]
  },
  shelf: {
    note: "置物架：两块侧板 + 四层开放式置物板 + 顶部横板 + 后侧两根拉杆（结构与侧面全敞开）。",
    size: [1.2, 1.8, 0.45],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 0 侧板
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 }, // 1 置物板
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 }, // 2 顶板
      { role: "metal", color: 0x9aa1a8, roughness: 0.34, metalness: 0.4 } // 3 后侧拉杆
    ],
    parts: [
      // 侧板落地（正侧面都敞开，所以不能再有踢脚把底下堵住）。
      cbox(0, [0.024, 1.765, 0.42], [-0.588, 0, -0.015]),
      cbox(0, [0.024, 1.765, 0.42], [0.588, 0, -0.015]),
      ...[0, 0.42, 0.84, 1.26].map(shelfBoardY => cbox(1, [1.152, 0.024, 0.42], [0, shelfBoardY, -0.015])),
      // 后侧两根拉杆：细杆把两侧板连起来（真实置物架都有这道抗剪构件），也是「通透架」的记号。
      // 杆的 ±x 与 **−z** 原与置物板逐面齐平（同向共面 37.6 + 0.7 + 0.6cm²）：宽度收 4mm、
      // 后表面收 1mm，杆就整个嵌进置物板与侧板里（杆本来就只在这两处之间露一线）。
      cbox(3, [1.148, 0.02, 0.02], [0, 0.44, -0.214], { fullOnly: true }),
      cbox(3, [1.148, 0.02, 0.02], [0, 1.71, -0.214], { fullOnly: true }),
      // 顶板：占地 1.2 × 0.45 由它定。
      cbox(2, [1.2, 0.035, 0.45], [0, 1.765, 0])
    ]
  },
  wallcabinet: {
    note: "吊柜：柜体（顶底板 / 双侧板 / 背板 / 中竖板 + 层板）+ 双开门 + 竖条拉手；无腿，靠挂墙件悬空。",
    size: [1.5, 0.82, 0.35],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 0 柜体围板
      { role: "door", color: 0xf5f3ef, roughness: 0.42, metalness: 0.06 }, // 1 双开门
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 }, // 2 顶板
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 }, // 3 背板 / 中竖板
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 }, // 4 层板
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 } // 5 拉手
    ],
    parts: [
      // 围板厚 2cm：吊柜没有踢脚，底板就是整件的地面（底面 y = 0）。
      cbox(0, [1.46, 0.02, 0.3], [0, 0, -0.02]),
      cbox(0, [0.02, 0.76, 0.3], [-0.73, 0.02, -0.02]),
      cbox(0, [0.02, 0.76, 0.3], [0.73, 0.02, -0.02]),
      // 背板 / 中竖板 / 层板三件原来四处贴死（三件同宽 1.46、背面同在 −0.17、顶面同在 0.78），
      // 加起来是 100.9 + 56.7 + 1.8 + 1.4 + 1.3 + 1.2cm² 的同向共面。四处让位：
      //   背板顶面压到 0.777（原来与侧板顶面同朝上）；
      //   中竖板与层板的背面让到 −0.156（背板正面）、层板整体后移 3mm；
      //   背板与层板的宽度收到 1.44 —— 原来 1.46 两头各咬进侧板 1cm，那 1cm 的条带上
      //   它们的后表面与侧板后表面同向共面（56.7cm²），两侧面又与底板的两侧面同向共面。
      // 三件仍夹在顶底板之间、仍咬在侧板内侧，外观无差。
      cbox(3, [1.44, 0.757, 0.014], [0, 0.02, -0.163]),
      cbox(3, [0.016, 0.757, 0.286], [0, 0.02, -0.013], { fullOnly: true }),
      cbox(4, [1.44, 0.018, 0.28], [0, 0.4, -0.013], { fullOnly: true }),
      // 顶板：占地 1.5 × 0.35 由它定。
      cbox(2, [1.5, 0.04, 0.35], [0, 0.78, 0]),
      // 双开门：各 0.72 宽、中缝 1cm，正面到 0.145（柜体正面 0.13 + 门板 1.5cm）。
      cbox(1, [0.72, 0.74, 0.02], [-0.365, 0.03, 0.135]),
      cbox(1, [0.72, 0.74, 0.02], [0.365, 0.03, 0.135]),
      cbox(5, [0.02, 0.2, 0.02], [-0.03, 0.3, 0.155]),
      cbox(5, [0.02, 0.2, 0.02], [0.03, 0.3, 0.155])
    ]
  },
  // 鞋柜曾经**刻意摘出规格表**（2026-09 回退成上一版既有资产）：那版资产的造型是「左半一张
  // 换鞋凳 + 右半高柜」，而当时这批柜类共用的骨架是「整宽箱体 + 两扇门」，重建出来的成品
  // 与存档里那台不是同一件东西。回退的那一版叫停了整个类型（注册表按槽位号回落、暖阳档还要
  // 一段按局部坐标切台面的着色器），代价是它一直留在「既有资产」那一侧：实测包围盒与声明的
  // `scaleBasis` 差 7%（深 0.449 对 0.42），而占位几何与旧资产又是两套轮廓。
  //
  // 2026-09 重新迁进流水线时**保住的是造型而不是骨架**：换鞋凳 / 敞开鞋格 / 上下柜门的分段
  // 全部照旧资产的实测几何逐件对齐（那六个门板的坐标是量出来的，不是猜的），换掉的只有
  // 「材质名按槽位号」这一层 —— 于是七处按槽位号的回落分支与那段切台面的着色器一并作废。
  shoecabinet: {
    note:
      "鞋柜：落地踢脚 + 左列换鞋凳（石面坐板）+ 左列四层敞开鞋格 + 右列下柜双门 / 敞开中格 / " +
      "上柜双门 + 左列上柜双短门 + 背板 + 木顶板；六处敞开格里摆着成双的鞋。",
    size: [1.8, 2.25, 0.42],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 0 侧板 / 中竖板 / 换鞋凳箱体 / 顶板
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 }, // 1 踢脚
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 }, // 2 层板 / 柜内底板 / 柜内中隔板
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 }, // 3 背板
      { role: "door", color: 0xd8b98f, roughness: 0.54, metalness: 0 }, // 4 门板
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 5 竖条拉手
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 }, // 6 坐板 / 中格底面（能搁东西的那两面）
      { role: "stash", color: 0x6f7176, roughness: 0.7, metalness: 0.05 } // 7 鞋
    ],
    // 高度分带（全部是「底面高度」，与 cbox 的 y 语义一致）：
    //   踢脚 0~0.06 · 侧板 / 中竖板 0.06~2.20 · 背板 0.10~2.19 · 顶板 2.20~2.25（整件最高）
    //   左列：换鞋凳 0.06~0.42 · 坐板 0.42~0.45 · 四层鞋格 0.45~1.78（层板底面 0.78 / 1.11 / 1.44）
    //         · 上柜底板 1.78~1.80 · 双短门 1.80~2.16
    //   右列：下柜 0.06~1.00（柜内中隔板底面 0.52）· 敞开中格 1.00~1.40 · 上柜 1.40~2.20（中隔板 1.80）
    // 深度分带（z）：柜体 −0.20~0.20 · 背板 −0.19~−0.176 · 门板 0.20~0.216 ·
    //                拉手 0.206~0.22 · 坐板 −0.185~0.22 · 顶板 −0.20~0.22（整件最深 = 0.42）
    //
    // 1mm 占地校验要求「宽 1.8 / 高 2.25 / 深 0.42」逐值精准，所以**极值全部由顶板一件撑满**
    // （宽 ±0.90、顶面 2.25、正面 0.22），其余各件一律收进它以内；拉手正面与坐板正面因此与
    // 顶板正面同在 z=0.22 这一张平面上 —— 三者的 x/y 投影互不重叠（拉手在门板中缝两侧、
    // 坐板在左列 0.42~0.45 那一条），所以不构成同向共面。
    parts: [
      // ── 骨架 ──────────────────────────────────────────────────────────────
      // 踢脚：两侧各内缩 4cm、正面内缩 4cm，背面也收 2cm —— 背面与侧板背面同面会沿柜底闪一条线。
      cbox(1, [1.72, 0.06, 0.34], [0, 0, -0.01]),
      // 侧板 / 中竖板：顶端做到 2.20（顶板底面）而不是咬进顶板 —— 咬进去那一截的外侧面会与
      // 顶板外侧面共面（书柜当年就是这么闪的）。两侧板外沿也各让开 2mm（±0.898 对 ±0.90）。
      cbox(0, [0.02, 2.14, 0.4], [-0.888, 0.06, 0]),
      cbox(0, [0.02, 2.14, 0.4], [0.888, 0.06, 0]),
      cbox(0, [0.02, 2.14, 0.4], [0, 0.06, 0]),
      // 背板：四面都缩在骨架内（x 两侧各让 1.2cm、z 让 2.4cm、上下让 6mm）。x 让到 0.874 而不是
      // 0.878 是有实测原因的：0.878 正好是侧板内表面那条平面，坐板的左端面也落在它上面 ——
      // 两块同向面（都是 −x）在 0.42~0.45 那 3cm 高度上重叠 2.7cm²，会闪（audit_coplanar_faces 抓到）。
      cbox(3, [1.748, 2.09, 0.014], [0, 0.1, -0.183]),
      // ── 左列：换鞋凳 + 四层敞开鞋格 + 上柜 ────────────────────────────────
      // 凳箱：左右两侧正好顶在侧板内表面与中竖板左侧面（反向面贴反向面，不构成共面），
      // 正面到 0.20 与骨架前缘齐平，背面收 1.5cm。
      cbox(0, [0.868, 0.36, 0.385], [-0.444, 0.06, 0.0075]),
      // 坐板：比凳箱**前伸 2cm**（到 0.22，与门板正面同一条竖线），这就是旧资产那块
      // material-2 台面 —— 暖阳档下它是石材色（角色 top），凳箱仍是木色。
      cbox(6, [0.868, 0.03, 0.405], [-0.444, 0.42, 0.0175]),
      // 四层鞋格的层板：背面让开背板 2mm、正面到柜体前缘 0.20。
      ...[0.78, 1.11, 1.44].map(shoecabinetShelfY =>
        cbox(2, [0.868, 0.02, 0.374], [-0.444, shoecabinetShelfY, 0.013])
      ),
      // 上柜底板：四层鞋格与上柜之间的那道横板。
      cbox(2, [0.868, 0.02, 0.374], [-0.444, 1.78, 0.013]),
      // ── 右列：下柜 + 敞开中格 + 上柜 ──────────────────────────────────────
      // 下柜底板抬高到踢脚之上（底面 0.06 与踢脚顶面是反向面），柜内一块中隔板把 88cm 的
      // 柜腔分成上下两格。
      cbox(2, [0.868, 0.02, 0.374], [0.444, 0.06, 0.013]),
      cbox(2, [0.868, 0.018, 0.374], [0.444, 0.52, 0.013], { fullOnly: true }),
      // 下柜顶面 = 敞开中格的底面：走**台面**角色 —— 旧资产那段暖阳档着色器切的就是这一条
      // （实测 y 0.932~0.970 的石材带），迁进流水线之后它就是一个真槽位，不必再切。
      cbox(6, [0.868, 0.02, 0.374], [0.444, 0.98, 0.013]),
      // 中格顶面 = 上柜底板；上柜里再一块中隔板。
      cbox(2, [0.868, 0.02, 0.374], [0.444, 1.4, 0.013]),
      cbox(2, [0.868, 0.018, 0.374], [0.444, 1.8, 0.013], { fullOnly: true }),
      // ── 六扇门板 + 竖条拉手 ───────────────────────────────────────────────
      // 门板四周留露肩：外侧 2.5cm、中缝 2.4cm、上下各留 2~4cm（下柜下沿与底板顶面平齐、
      // 上柜上沿离顶板 4cm），正面凸出柜体 1.6cm。六扇门的 x/y 投影两两不重叠 —— 门板正面
      // 同在 z=0.216 一张平面上，一旦两扇门的矩形咬在一起就是一片会闪的重叠。
      ...[
        { x: 0.234, bottomY: 0.08, height: 0.88 },
        { x: 0.676, bottomY: 0.08, height: 0.88 },
        { x: 0.234, bottomY: 1.42, height: 0.74 },
        { x: 0.676, bottomY: 1.42, height: 0.74 },
        { x: -0.234, bottomY: 1.8, height: 0.36 },
        { x: -0.676, bottomY: 1.8, height: 0.36 }
      ].map(shoecabinetDoor =>
        cbox(4, [0.418, shoecabinetDoor.height, 0.016], [
          shoecabinetDoor.x,
          shoecabinetDoor.bottomY,
          0.208
        ])
      ),
      // 竖条拉手：贴在各自中缝两侧（右列中缝在 x=0.455、左列在 −0.455），背面埋进门板 4mm、
      // 正面到 0.22 与坐板 / 顶板正面齐平。
      ...[
        { x: 0.41, bottomY: 0.46 },
        { x: 0.5, bottomY: 0.46 },
        { x: 0.41, bottomY: 1.7 },
        { x: 0.5, bottomY: 1.7 },
        { x: -0.41, bottomY: 1.9 },
        { x: -0.5, bottomY: 1.9 }
      ].map(shoecabinetHandle =>
        cbox(5, [0.014, 0.16, 0.014], [shoecabinetHandle.x, shoecabinetHandle.bottomY, 0.213], {
          fullOnly: true
        })
      ),
      // 顶板：占地 1.8 × 0.42 与整件最高的一件都由它定；走柜体木色（旧资产的上箱体也是木色，
      // 暖阳档下变石材的是**坐板与中格底面**那两条，不是柜顶）。
      cbox(0, [1.8, 0.05, 0.42], [0, 2.2, 0.01]),
      // ── 六处敞开格里的鞋 ─────────────────────────────────────────────────
      ...shoecabinetBayShoes()
    ]
  },
  vanity: {
    note: "梳妆台：四条金属细腿 + 双抽屉箱体 + 台面 + 台面上的立式梳妆镜（镜框 + 镜面）。",
    size: [1.2, 1.55, 0.5],
    slots: [
      { role: "leg", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 0 金属细腿
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 1 抽屉箱体
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 }, // 2 抽屉面
      { role: "top", color: 0x9c6b3f, roughness: 0.5, metalness: 0 }, // 3 台面
      { role: "mirror", color: 0xdbe4ea, roughness: 0.08, metalness: 0.35 }, // 4 镜面
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 5 镜框 / 拉手
      { role: "trim", color: 0x3f2916, roughness: 0.6, metalness: 0.1 } // 6 镜背衬板
    ],
    parts: [
      ...fourLegs(0, { legSpanX: 0.52, legSpanZ: 0.2, legSize: 0.03, height: 0.31, square: false }),
      // 抽屉箱体坐在腿上（0.305 → 0.72，比腿顶高 5mm、比台面底高 1cm：两处相接的面各咬进去
      // 一点，免得「腿顶 = 箱底」「箱顶 = 台面底」两对同料不同的面落在同一张平面上互相争深度）。
      // 正面到 0.23（台面 0.5 的一半是 0.25，留 2cm 回边）。
      cbox(1, [1.14, 0.415, 0.44], [0, 0.305, -0.01]),
      cbox(2, [0.56, 0.17, 0.02], [-0.3, 0.42, 0.219]),
      cbox(2, [0.56, 0.17, 0.02], [0.3, 0.42, 0.219]),
      cbox(5, [0.24, 0.014, 0.014], [-0.3, 0.545, 0.232], { fullOnly: true }),
      cbox(5, [0.24, 0.014, 0.014], [0.3, 0.545, 0.232], { fullOnly: true }),
      // 台面：占地 1.2 × 0.5 由它定。
      cbox(3, [1.2, 0.04, 0.5], [0, 0.71, 0]),
      // 梳妆镜：立在台面后沿（背衬 + 镜框 + 镜面），顶到整件高度 1.55。
      // 三块**逐层收小**（背衬 0.76 → 镜框 0.70 → 镜面 0.64）：等宽叠放时背衬与镜框的上沿 /
      // 侧沿会落在同一张平面上，渲染时互相争深度（沿镜框一圈闪细线）。收一层就是正常的
      // 「镜框压着背衬、镜面嵌在框里」，既躲开共面又是实物做法。背衬底再咬进台面 1cm。
      cbox(6, [0.76, 0.81, 0.014], [0, 0.74, -0.193]),
      cbox(5, [0.7, 0.74, 0.03], [0, 0.78, -0.181]),
      cbox(4, [0.64, 0.68, 0.008], [0, 0.81, -0.168])
    ]
  },

  // ── 桌案族：既有二进制资产迁进流水线（第三批）─────────────────────────────
  // 这一批 6 件（餐桌组合 / 圆餐桌 / 圆餐桌带转盘 / 书桌 / 吧台 / 方茶几）的旧资产都是别人家的
  // GLB，问题是同一套：
  //
  //   1. 材质名只有槽位号、没有角色，运行侧只能整件套一个「家具三档灰」—— 桌面烘的是深灰，
  //      石材 / 木纹在成品里根本表达不出来；
  //   2. **椅子 / 吧凳是烘在桌子网格里的**（table.glb 三块网格里两块是椅子、bar.glb 六块里
  //      三块是凳），既不能单独选中，也没法按角色给椅面配色；
  //   3. 实测尺寸对不上声明（table 高 0.919 而声明 0.82、bar 进深 0.754 而声明 0.65，
  //      偏差 16%），运行侧按分轴缩放硬拉，腿与台面都被拉歪。
  //
  // 重建后这 6 件按**实物分件**：台面 / 望板 / 桌腿 / 椅座 / 靠背 / 横撑 / 转盘各归其位，
  // 尺寸与声明的 scaleBasis 逐值相等；餐桌的椅子由 diningChair 助手生成、朝向逐把指定。  //
  // 一处刻意的取舍，两件餐桌都一样：**整件高度按声明的桌高收口**（0.82 / 0.78），而不是按
  // 「桌 0.71 + 椅背 0.90」的实物比例。原因是高度是**存量数据** —— 已有存档里每件都存了自己
  // 的 height，抬声明值只会把老存档里的成套餐桌椅整体压扁。于是椅背只高出桌面 6~10cm，
  // 相当于椅子都推进桌下的视角；换成「先抬声明值、再逐条迁移存档」是另一件事，本轮不做。
  table: {
    note: "餐桌组合：木台面 + 望板 + 四条收分木腿，配 6 张软包餐椅（两侧各两张、两端各一张，全部推进桌下）。",
    size: [2.4, 0.82, 1.8],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.34, metalness: 0.02 }, // 0 桌面板
      { role: "trim", color: 0x9c6b3f, roughness: 0.62, metalness: 0 }, // 1 望板 / 桌横撑 / 椅横撑
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 }, // 2 桌腿 / 椅腿
      { role: "cushion", color: 0xefe0cd, roughness: 0.92, metalness: 0 } // 3 椅座 / 椅靠背
    ],
    parts: [
      // 桌腿：腿心退到 ±0.68 / ±0.38（台面 1.5 × 0.9 的投影之内），上粗下细。
      ...mirrorPair([
        ctaper(2, 0.03, 0.022, 0.6, 14, [0.68, 0, 0.38]),
        ctaper(2, 0.03, 0.022, 0.6, 14, [0.68, 0, -0.38])
      ]),
      // 望板：撑在四条腿之间（0.60 → 0.67），比台面各缩 8cm，台面才有「压边」可读。
      cbox(1, [1.34, 0.07, 0.74], [0, 0.6, 0]),
      cbox(1, [1.28, 0.03, 0.03], [0, 0.16, 0], { fullOnly: true }),
      // 台面：整件最宽最深的一件，占地 1.5 × 0.9 那一块由它定。
      croundedBox(0, [1.5, 0.04, 0.9], [0, 0.67, 0], { radius: 0.012 }),
      // 六张椅子：两侧各两张（x ±0.42）、两端各一张（x ±0.98）。椅心到桌沿 1cm，
      // 于是「外沿 = 0.90 / 1.20」正好把整件凑成 2.40 × 1.80 —— 占地由椅子定，不由桌子。
      ...[
        { center: [-0.42, 0.68], facing: 180 },
        { center: [0.42, 0.68], facing: 180 },
        { center: [-0.42, -0.68], facing: 0 },
        { center: [0.42, -0.68], facing: 0 },
        { center: [0.98, 0], facing: 270 },
        { center: [-0.98, 0], facing: 90 }
      ].flatMap(chair => diningChair({
        ...chair,
        slotLeg: 2,
        slotSeat: 3,
        slotTrim: 1,
        seatWidth: 0.44,
        seatDepth: 0.44,
        seatHeight: 0.42,
        seatThickness: 0.05,
        backTop: 0.82,
        backThickness: 0.04,
        legSize: 0.032
      }))
    ]
  },
  /**
   * 圆餐桌 / 圆餐桌带转盘：同一个函数的两个变体。
   *
   * 与餐桌组合同一个道理 —— 两件的差别只在**台面中央那件事**（有没有转盘），占地、椅位、
   * 座高分毫不差。各写一份的结果必然是改了转盘半径只改到一份，另一份悄悄留在旧尺寸上，
   * 而两件的 scaleBasis 是同一个数（2.2 × 0.78 × 2.2），对不上时运行侧按分轴缩放去凑。
   */
  ...(() => {
    const roundDiningChairs = [
      { center: [0, 0.88], facing: 180 },
      { center: [0, -0.88], facing: 0 },
      { center: [0.88, 0], facing: 270 },
      { center: [-0.88, 0], facing: 90 }
    ].flatMap(chair => diningChair({
      ...chair,
      slotLeg: 4,
      slotSeat: 5,
      slotTrim: 3,
      seatWidth: 0.44,
      seatDepth: 0.44,
      seatHeight: 0.4,
      seatThickness: 0.05,
      backTop: 0.78,
      backThickness: 0.04,
      legSize: 0.032
    }));
    const roundDiningSlots = [
      { role: "top", color: 0xc49a6c, roughness: 0.34, metalness: 0.02 }, // 0 台面 / 转盘面
      { role: "base", color: 0x3f2916, roughness: 0.6, metalness: 0 }, // 1 落地底盘
      { role: "body", color: 0x9c6b3f, roughness: 0.6, metalness: 0 }, // 2 中柱
      { role: "trim", color: 0x9c6b3f, roughness: 0.62, metalness: 0 }, // 3 台面围边 / 椅横撑
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 }, // 4 椅腿
      { role: "cushion", color: 0xefe0cd, roughness: 0.92, metalness: 0 }, // 5 椅座 / 椅靠背
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.45 } // 6 转盘中轴盖
    ];
    const roundDiningTableParts = [
      // 落地底盘：一块比中柱略宽的圆盘（0 → 0.02），中柱就坐在它上面。
      ccyl(1, 0.42, 0.02, 40, [0, 0, 0]),
      // 中柱 + 柱顶承台：一条车削出来的母线（柱身收细、柱顶再外张承台），
      // 比「圆盘 + 圆柱 + 圆盘」三段拼更像实物 —— 单柱餐桌的立柱本来就是整根车出来的。
      clathe(
        2,
        [
          [0, 0],
          [0.4, 0],
          [0.4, 0.04],
          [0.27, 0.1],
          [0.105, 0.16],
          [0.095, 0.5],
          [0.135, 0.56],
          [0.135, 0.57],
          [0, 0.57],
          [0, 0]
        ],
        40,
        [0, 0.02, 0]
      ),
      // 台面围边：台面下沿一圈（0.59 → 0.64），让 4cm 厚的台面读起来有一道边。
      ccyl(3, 0.655, 0.05, 48, [0, 0.59, 0]),
      // 台面：整件最宽的一件，直径 1.4 决定平面符号里那个圆。
      clathe(0, [[0, 0], [0.7, 0], [0.7, 0.04], [0, 0.04], [0, 0]], 48, [0, 0.64, 0]),
      ...roundDiningChairs
    ];
    const turntableParts = [
      // 转盘面 + 中轴盖：都坐在台面上（0.68 起），顶到 0.725，仍在椅背 0.78 之下。
      clathe(0, [[0, 0], [0.4, 0], [0.4, 0.025], [0, 0.025], [0, 0]], 48, [0, 0.68, 0]),
      ccyl(6, 0.09, 0.02, 24, [0, 0.705, 0])
    ];
    return {
      rounddiningtable: {
        note: "圆形餐桌：车削中柱 + 落地底盘 + 台面围边 + 圆台面，配 4 张软包餐椅（四面各一张，推进桌下）。",
        size: [2.2, 0.78, 2.2],
        slots: roundDiningSlots,
        parts: roundDiningTableParts
      },
      rounddiningtable_turntable: {
        note: "圆形餐桌（带转盘）：与圆餐桌同一套骨架，台面中央多一层转盘面与中轴盖。",
        size: [2.2, 0.78, 2.2],
        slots: roundDiningSlots,
        parts: [...roundDiningTableParts, ...turntableParts]
      }
    };
  })(),
  desk: {
    note: "书桌：薄台面 + 单层抽屉箱 + 四条收分腿 + 背面挡板，抽屉面一根横向长拉手。",
    size: [1.4, 0.76, 0.65],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.34, metalness: 0.02 }, // 0 台面
      { role: "body", color: 0x5a3a22, roughness: 0.62, metalness: 0 }, // 1 抽屉箱体 / 背挡板
      { role: "drawer", color: 0xd8b98f, roughness: 0.58, metalness: 0 }, // 2 抽屉面
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 }, // 3 腿
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.45 } // 4 拉手
    ],
    parts: [
      // 四条腿收在四角（±0.63 / ±0.26），腿心到台面边缘留 7cm —— 台面才有出挑。
      ...mirrorPair([
        ctaper(3, 0.026, 0.019, 0.725, 14, [0.63, 0, 0.26]),
        ctaper(3, 0.026, 0.019, 0.725, 14, [0.63, 0, -0.26])
      ]),
      // 抽屉箱坐在腿上（0.605 → 0.72），正面到 0.30（台面半深 0.325，留 25mm 回边）。
      cbox(1, [0.86, 0.115, 0.58], [0, 0.605, -0.005]),
      cbox(2, [0.8, 0.09, 0.02], [0, 0.615, 0.291]),
      cbox(4, [0.22, 0.014, 0.014], [0, 0.676, 0.303], { fullOnly: true }),
      // 背挡板：挡住桌子背后的腿间空档（真实书桌都有这道板），也是 lite 版的减重项。
      cbox(1, [1.2, 0.26, 0.018], [0, 0.33, -0.2], { fullOnly: true }),
      // 台面：占地 1.4 × 0.65 由它定。
      croundedBox(0, [1.4, 0.035, 0.65], [0, 0.725, 0], { radius: 0.01 })
    ]
  },
  bar: {
    note: "吧台：通长台面 + 吧台柜体 + 踢脚 + 前侧踏脚横杆 + 正面三格敞开酒格，配 3 张无靠背吧凳。",
    size: [2.2, 1.05, 0.65],
    slots: [
      { role: "top", color: 0x8f6a45, roughness: 0.42, metalness: 0.02 }, // 0 台面
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 1 吧台柜体
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 }, // 2 踢脚
      { role: "trim", color: 0x9c6b3f, roughness: 0.62, metalness: 0 }, // 3 踏脚横杆 / 酒格隔板
      { role: "leg", color: 0x454c54, roughness: 0.32, metalness: 0.3 }, // 4 吧凳金属腿
      { role: "cushion", color: 0xefe0cd, roughness: 0.9, metalness: 0 }, // 5 吧凳座面
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.45 } // 6 拉手 / 踏脚圈
    ],
    parts: [
      // 踢脚内缩 5cm：落地那 6cm 因此是踢脚而不是柜体正面。
      cbox(2, [2.06, 0.06, 0.55], [0, 0, -0.045]),
      // 吧台柜体靠后：z 从 −0.325 到 −0.03，前侧留出 0.295 的容腿空间给吧凳。
      cbox(1, [2.1, 0.88, 0.295], [0, 0.06, -0.1775]),
      // 正面三格敞开酒格：三块隔板 + 一层底板，格子背板即柜体正面。
      // 隔板（trim）与底板（body）是两种料，原来两者**四面逐值相同**（y 底 0.62、x ±0.36、
      // z −0.03~−0.01）→ 3.8 + 2 + 2 + 2cm² 的同向共面。底板往里、往右各让 2mm 并抬起 2mm，
      // 四个面全部分开；底板仍在柜体里、外观无差。
      cbox(3, [0.02, 0.28, 0.02], [-0.35, 0.62, -0.02], { fullOnly: true }),
      cbox(3, [0.02, 0.28, 0.02], [0.35, 0.62, -0.02], { fullOnly: true }),
      cbox(1, [0.716, 0.02, 0.02], [0, 0.622, -0.022], { fullOnly: true }),
      // 踏脚横杆：架在柜体正面之外的那一段（真实吧台的做法），离地 0.16。
      cbox(3, [2.04, 0.04, 0.04], [0, 0.16, 0.015]),
      cbox(6, [0.24, 0.014, 0.014], [0, 0.5, 0.133], { fullOnly: true }),
      // 台面：占地 2.2 × 0.65 由它定，前沿挑出柜体 0.325 − (−0.03) = 0.355 就是吧台的样子。
      cbox(0, [2.2, 0.05, 0.65], [0, 1, 0]),
      // 三张无靠背吧凳：座面 0.3 × 0.3，座高 0.72，全部收在台面正下方的容腿空间里。
      ...[
        [-0.7, 0.13],
        [0, 0.13],
        [0.7, 0.13]
      ].flatMap(([stoolX, stoolZ]) => [
        ...fourLegs(4, { legSpanX: 0.118, legSpanZ: 0.118, legSize: 0.026, height: 0.72, square: false })
          .map(legPart => ({ ...legPart, at: [legPart.at[0] + stoolX, legPart.at[1], legPart.at[2] + stoolZ] })),
        croundedBox(5, [0.3, 0.045, 0.3], [stoolX, 0.72, stoolZ], { radius: 0.016 }),
        ctorus(6, 0.132, 0.008, [stoolX, 0.26, stoolZ], { fullOnly: true })
      ])
    ]
  },
  squarecoffeetable: {
    note: "方茶几：厚台面 + 望板 + 四条方腿 + 下层置物板（板下两道隔板分成三格）。",
    size: [1.4, 0.46, 0.7],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.34, metalness: 0.02 }, // 0 台面
      { role: "trim", color: 0x9c6b3f, roughness: 0.62, metalness: 0 }, // 1 望板 / 格板
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 }, // 2 腿
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 } // 3 下层置物板
    ],
    parts: [
      // 四条方腿收在四角（±0.66 / ±0.32）—— 平面符号里那四个圆点就是它们。
      cbox(2, [0.05, 0.415, 0.05], [-0.66, 0, -0.32]),
      cbox(2, [0.05, 0.415, 0.05], [0.66, 0, -0.32]),
      cbox(2, [0.05, 0.415, 0.05], [-0.66, 0, 0.32]),
      cbox(2, [0.05, 0.415, 0.05], [0.66, 0, 0.32]),
      // 望板撑在四条腿之间（0.35 → 0.41），比台面各缩 5cm。
      cbox(1, [1.3, 0.06, 0.6], [0, 0.35, 0]),
      // 下层置物板：尺寸与平面符号里那个内框同源（0.66 × 0.76 的占地比例）。
      cbox(3, [0.92, 0.025, 0.53], [0, 0.155, 0]),
      // 两道隔板把置物板分成三格（对应平面符号里那两条竖线）。
      cbox(1, [0.02, 0.17, 0.53], [-0.153, 0.18, 0], { fullOnly: true }),
      cbox(1, [0.02, 0.17, 0.53], [0.153, 0.18, 0], { fullOnly: true }),
      // 台面：占地 1.4 × 0.7 由它定。
      croundedBox(0, [1.4, 0.045, 0.7], [0, 0.415, 0], { radius: 0.012 })
    ]
  },

  // ── 厨房地柜三件：既有二进制资产迁进流水线（第四批）───────────────────────
  // 厨房地柜 / 地柜带水盆 / 地柜带燃气灶。旧资产的问题是**柜体与台面同为一片深灰**
  // （材质名只有槽位号），而这三件在实物上恰恰是「木柜体 + 石台面 + 不锈钢水盆 / 灶具」
  // 的三料组合 —— 整件一色等于把厨房最要紧的那点材质关系抹掉了。
  // 实测尺寸同样对不上声明：三件的进深都是 0.648 而声明 0.6（水盆那件还高到 1.038，
  // 因为旧资产把龙头烘进去了），运行侧按分轴缩放把柜体整体拉深 8%。
  //
  // 重建后三件共用同一段柜体骨架（见 kitchenBaseCarcassParts），差别只在台面上那件事：
  // 整块台面 / 台面开孔嵌台下盆 / 台面开孔嵌下嵌灶。三件的台面高度都是 0.85（成排的
  // 地柜必须等高，否则台面接缝会错台），因此**龙头与灶架都不建在模型里**：
  //    - 龙头：真实龙头要高出台面 25~30cm，而这三件的声明高度就是 0.85（台面高）。
  //      把龙头塞进来只能靠压低台面，那会让三件不等高 —— 更糟。
  //    - 灶架：同理。灶面做成与台面齐平的下嵌灶（玻璃 / 不锈钢面板 + 四个火盖），
  //      顶面正好落在 0.85，既不越高度，也不与邻柜错台。
  kitchenbase: {
    note: "厨房地柜：踢脚 + 柜体 + 四扇门 + 通长台面，门板各一根横向拉手。",
    size: [2.4, 0.85, 0.6],
    slots: [
      { role: "top", color: 0xefeae0, roughness: 0.3, metalness: 0.04 }, // 0 台面
      { role: "door", color: 0xf5f3ef, roughness: 0.4, metalness: 0.06 }, // 1 门板
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 2 柜体
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 3 拉手
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 }, // 4 踢脚
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 } // 5 背板
    ],
    parts: [
      ...kitchenBaseCarcassParts({ width: 2.4, depth: 0.6, doorCount: 4 }),
      // 台面：占地 2.4 × 0.6 由它定。
      cbox(0, [2.4, 0.04, 0.6], [0, 0.81, 0])
    ]
  },
  kitchensink: {
    note: "地柜带水盆：与地柜同一套柜体，台面在中间开孔嵌一只不锈钢台下盆（底下一道承板）。",
    size: [1.2, 0.85, 0.6],
    slots: [
      { role: "top", color: 0xefeae0, roughness: 0.3, metalness: 0.04 }, // 0 台面
      { role: "door", color: 0xf5f3ef, roughness: 0.4, metalness: 0.06 }, // 1 门板
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 2 柜体
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 3 门板拉手
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 }, // 4 踢脚
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 }, // 5 背板 / 承板
      { role: "sink", color: 0xb9bfc5, roughness: 0.24, metalness: 0.62 } // 6 不锈钢盆
    ],
    parts: [
      // 水盆柜的柜体不封顶：台下盆要从上面看得见内腔，否则台面开孔里只剩柜体的顶面。
      ...kitchenBaseCarcassParts({ width: 1.2, depth: 0.6, doorCount: 2, openTop: true }),
      // 台面四条边围出 0.56 × 0.34 的开孔（孔沿 = 盆腔的内壁，台下盆就是这么装的）。
      cbox(0, [1.2, 0.04, 0.13], [0, 0.81, 0.235]),
      cbox(0, [1.2, 0.04, 0.13], [0, 0.81, -0.235]),
      cbox(0, [0.32, 0.04, 0.34], [-0.44, 0.81, 0]),
      cbox(0, [0.32, 0.04, 0.34], [0.44, 0.81, 0]),
      // 承板：盆吊在台面下，底下垫一道板（真实水盆柜都这么做），也挡住柜内空腔。
      cbox(5, [1.12, 0.02, 0.54], [0, 0.63, -0.02], { fullOnly: true }),
      // 不锈钢盆：底板 + 四壁，盆口顶到 0.81（台面下沿），深 0.16。
      // 盆体单独一个槽位（`sink` 角色）：水盆是整件柜子里唯一的「不锈钢面」，
      // 与柜门拉手（`metal`）不是同一种料 —— 共用槽位就只能在暖色主题里二选一，要么拉手变钢、
      // 要么盆变木色。
      cbox(6, [0.58, 0.02, 0.36], [0, 0.65, 0]),
      cbox(6, [0.02, 0.14, 0.36], [-0.29, 0.67, 0]),
      cbox(6, [0.02, 0.14, 0.36], [0.29, 0.67, 0]),
      cbox(6, [0.56, 0.14, 0.02], [0, 0.67, 0.18]),
      cbox(6, [0.56, 0.14, 0.02], [0, 0.67, -0.18])
    ]
  },
  kitchencooktop: {
    note: "地柜带燃气灶：与地柜同一套柜体，台面开孔里坐着一块**低于台面 1cm 的灶面板**（下嵌灶），四个火盖。",
    size: [1.2, 0.85, 0.6],
    slots: [
      { role: "top", color: 0xefeae0, roughness: 0.3, metalness: 0.04 }, // 0 台面
      { role: "door", color: 0xf5f3ef, roughness: 0.4, metalness: 0.06 }, // 1 门板
      { role: "body", color: 0x5a3a22, roughness: 0.64, metalness: 0 }, // 2 柜体
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 3 门板拉手 / 火盖
      { role: "base", color: 0x3f2916, roughness: 0.66, metalness: 0 }, // 4 踢脚
      { role: "interior", color: 0x8a6a4a, roughness: 0.68, metalness: 0 }, // 5 背板
      { role: "cooktop", color: 0x33363a, roughness: 0.2, metalness: 0.6 } // 6 灶面板
    ],
    parts: [
      ...kitchenBaseCarcassParts({ width: 1.2, depth: 0.6, doorCount: 2 }),
      // 台面四条边围出 0.66 × 0.46 的灶孔。
      cbox(0, [1.2, 0.04, 0.07], [0, 0.81, 0.265]),
      cbox(0, [1.2, 0.04, 0.07], [0, 0.81, -0.265]),
      cbox(0, [0.27, 0.04, 0.46], [-0.465, 0.81, 0]),
      cbox(0, [0.27, 0.04, 0.46], [0.465, 0.81, 0]),
      // 灶面板：比孔小 1mm（四周留一道安装缝，也避免与开孔侧面共面闪烁）。
      // 顶面 0.84 —— **故意比台面低 1cm**：火盖要立在这块板上，而立起来就会高过
      // 台面 0.85 那条线，整件就超高了。下嵌灶本来就是「面板沉在台面开孔里、台面边缘高出
      // 一圈」的装法，这么摆既守住 0.85，也是实物该有的样子。
      // 灶面单独一个槽位（`cooktop` 角色）：银黑玻璃面板是这一件最要紧的材质特征，
      // 与拉手 / 火盖（`metal`，不锈钢）不是同一种料 —— 同色就分不出面板与炉圈。
      cbox(6, [0.658, 0.03, 0.458], [0, 0.81, 0]),
      // 四个火盖：圈 + 盖，顶面 0.849 压在台面下 1mm —— 从开孔俯视看得见，又不越 0.85。
      ...[
        [-0.165, -0.115],
        [0.165, -0.115],
        [-0.165, 0.115],
        [0.165, 0.115]
      ].flatMap(([burnerX, burnerZ]) => [
        ctorus(3, 0.075, 0.0045, [burnerX, 0.84, burnerZ], { fullOnly: true }),
        ccyl(3, 0.038, 0.009, 24, [burnerX, 0.84, burnerZ])
      ])
    ]
  },
  chestdrawer: {
    note: "斗柜：四层抽屉 + 台面，卧室与走廊的常用收纳。",
    size: [1, 1.1, 0.45],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 柜体
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 }, // 1 抽屉面 / 拉手
      { role: "top", color: 0x9c6b3f, roughness: 0.66, metalness: 0 } // 2 台面
    ],
    parts: [
      cbox(0, [0.98, 1.06, 0.37], [0, 0, 0]),
      cbox(2, [1, 0.04, 0.45], [0, 1.06, 0]),
      ...[0.13, 0.38, 0.63, 0.88].flatMap(drawerBottomY => [
        box(1, [0.9, 0.2, 0.02], [-0.45, drawerBottomY, 0.185]),
        box(1, [0.24, 0.02, 0.02], [-0.12, drawerBottomY + 0.09, 0.205], { fullOnly: true })
      ])
    ]
  },
  entrycabinet: {
    note: "玄关柜：上部封闭柜门、下部敞开放鞋。",
    size: [1, 1.1, 0.38],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 柜体
      { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 }, // 1 柜门
      { role: "top", color: 0x9c6b3f, roughness: 0.66, metalness: 0 } // 2 台面
    ],
    parts: [
      cbox(0, [0.98, 1.06, 0.34], [0, 0, 0]),
      cbox(2, [1, 0.04, 0.38], [0, 1.06, 0]),
      cbox(0, [0.94, 0.035, 0.3], [0, 0.06, 0]),
      box(1, [0.45, 0.5, 0.02], [-0.47, 0.54, 0.17]),
      box(1, [0.45, 0.5, 0.02], [0.02, 0.54, 0.17]),
      box(1, [0.02, 0.12, 0.01], [-0.035, 0.73, 0.18], { fullOnly: true }),
      box(1, [0.02, 0.12, 0.01], [0.015, 0.73, 0.18], { fullOnly: true })
    ]
  },
  displaycabinet: {
    note: "展示柜：玻璃门 + 层板，餐厅或客厅的器物陈列。",
    size: [0.9, 1.8, 0.4],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 木柜体
      // 槽位色必须与柜类档位给 glass 角色的配方一致（studio-material-styles.js 的 joineryCombo），
      // 否则「未选风格」走烘进 GLB 的槽位色、「选了风格」走配方色，切换时玻璃会跳一下。
      { role: "glass", color: 0xa9c5d3, roughness: 0.12, metalness: 0.04 }, // 1 玻璃
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 } // 2 五金
    ],
    parts: [
      cbox(0, [0.9, 0.06, 0.4], [0, 0, 0]),
      box(0, [0.06, 1.74, 0.4], [-0.45, 0.06, -0.2]),
      box(0, [0.06, 1.74, 0.4], [0.39, 0.06, -0.2]),
      cbox(0, [0.9, 0.04, 0.4], [0, 1.76, 0]),
      ...[0.46, 0.86, 1.26].map(shelfBottomY =>
        cbox(0, [0.78, 0.025, 0.36], [0, shelfBottomY, 0])
      ),
      // 玻璃门宽收 4mm（0.78 → 0.776）：与侧板内沿同宽时玻璃的 ±x 侧面正落在侧板内沿的
      // 同一平面上 —— 玻璃是 DoubleSide，背面剔不掉，左右各 121.5cm² 整片在闪。
      cbox(1, [0.776, 1.62, 0.015], [0, 0.12, 0.192], { align: "bottom" }),
      box(2, [0.02, 0.3, 0.012], [-0.06, 0.85, 0.188], { fullOnly: true }),
      box(2, [0.02, 0.3, 0.012], [-0.02, 0.85, 0.188], { fullOnly: true })
    ]
  },

  // ── 钢琴：第三方素材迁进流水线（第五批）───────────────────────────────────
  // 旧 piano.glb 是一件**原样搬进来的第三方素材**：单位是厘米（实测 152.5 × 113.1 × 149.7）、
  // 底面落在 y = −0.502、材质名是「金色金属材料 / [Color_009]1」这种、52 个网格约 2.2 万顶点。
  // 注册条目为了迁就它写了 preserveAspect（等比缩放）而连 scaleBasis 都没有，于是它既不符合
  // 本项目的任何约定（不会跟着材质风格换色），也从没被加载过 —— 画面上一直是兜底那个方块
  // （见 check_invariants.mjs 里那条「注册了但没有任何一条路会加载它」的债务清单）。
  //
  // 重建的尺寸取自实物（Yamaha GB1 这类小型三角琴 1.46 × 1.48 × 0.99，键盘面高 0.72）：
  // 1.5m 宽（键盘那一侧最宽）× 1.5m 长 × 0.99m 高。琴身只占后半段 —— 前面那 20cm 是键盘条。
  piano: (() => {
    // 键盘是全件最要紧的一处「实物感」：52 个白键 + 35 个黑键就是 88 键钢琴的键位
    // （白键 1.20 / 52 = 23.1mm，实物 23.5mm）。白键之间的 1mm 缝也照实留 ——
    // 一整条白板在俯视与斜视下都读不出「这是琴键」。
    const whiteKeyWidth = 1.2 / 52;
    const whiteKeys = Array.from({ length: 52 }, (unusedKey, keyIndex) =>
      cbox(
        5,
        [whiteKeyWidth - 0.0012, 0.02, 0.145],
        [-0.6 + whiteKeyWidth * (keyIndex + 0.5), 0.72, 0.6745]
      )
    );
    // 黑键落在白键之间的缝上：一个八度里 C#/D# 在第 1、2 个缝、F#/G#/A# 在第 4、5、6 个缝
    //（0 基白键下标 mod 7 = 0 / 1 / 3 / 4 / 5），七个八度共 35 个。
    const blackKeys = Array.from({ length: 7 }, (unusedOctave, octaveIndex) => octaveIndex).flatMap(
      octaveIndex =>
        [0, 1, 3, 4, 5].map(innerIndex =>
          cbox(6, [0.012, 0.018, 0.09], [
            -0.6 + whiteKeyWidth * (octaveIndex * 7 + innerIndex + 1),
            0.74,
            0.647
          ])
        )
    );
    return {
      note:
        "三角钢琴：弯背琴身（平面轮廓拉体）+ 腰线 + 顶盖 + 键盘条（52 白键 / 35 黑键 + 键侧木）" +
        " + 三条锥形琴腿带脚轮 + 踏板连杆与三踏板。",
      size: [1.5, 0.99, 1.5],
      slots: [
        // 槽位色是「未套用任何风格时的底色」：亮光黑琴身 + 象牙白键 + 黑键 + 钢色五金，
        // 也就是这一件最经典的那副样子。三个风格档位（PIANO_STYLES）另按角色给组合。
        { role: "body", color: 0x1a1a1c, roughness: 0.14, metalness: 0.05 }, // 0 弯背琴身
        { role: "top", color: 0x24242a, roughness: 0.11, metalness: 0.06 }, // 1 顶盖
        { role: "panel", color: 0x1e1e20, roughness: 0.16, metalness: 0.04 }, // 2 键床 / 键侧木 / 键滑条
        { role: "leg", color: 0x1a1a1c, roughness: 0.16, metalness: 0.05 }, // 3 琴腿
        { role: "trim", color: 0x2b2b30, roughness: 0.18, metalness: 0.06 }, // 4 腰线 / 踏板连杆
        { role: "key", color: 0xf6f2e8, roughness: 0.32, metalness: 0.02 }, // 5 白键
        { role: "accent", color: 0x16181a, roughness: 0.24, metalness: 0.04 }, // 6 黑键
        { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.5 } // 7 脚轮 / 踏板
      ],
      parts: (() => {
        // 三块板共用同一份轮廓，各自外张几毫米；中心 z 由轮廓自己给出（不在 0 上），
        // 传给 extrude 的 centered 定位用 —— 写错的话琴会整体往键盘那侧戳出去。
        const rimPlan = pianoPlan({ halfWidth: 0.72, tailZ: -0.74, frontZ: 0.55 });
        const beltPlan = pianoPlan({ halfWidth: 0.728, tailZ: -0.748, frontZ: 0.555 });
        const lidPlan = pianoPlan({ halfWidth: 0.732, tailZ: -0.75, frontZ: 0.56 });
        return [
          // 琴身：把俯视轮廓沿高度拉成 0.30m 厚的侧板（0.665 → 0.965）。它是全件唯一
          // 拼不出来的形状，也是「一眼认出是三角钢琴」的那一条弯背。
          extrude(0, rimPlan.outline, 0.3, [0, 0.665, rimPlan.centerZ], {
            centered: true,
            rot: [90, 0, 0]
          }),
          // 腰线：琴身上沿外张 8mm 的一圈线脚。lite 丢掉 —— 远看就是上沿多一道线。
          //
          // 它从 0.92 起、顶到 0.97：**不能与琴身顶面（0.965）齐平**。齐平时两块的顶面落在
          // 同一平面上、朝向也相同，从上方看过去是 0.42m² 的一大片 z-fighting（琴顶整片闪）。
          // 顶到 0.97 之后琴身顶面被包在腰线内部、腰线顶面又埋进顶盖（0.965 起）——
          // 三块板层层咬住，外侧看不到任何一条缝，也没有一对共面的面。
          extrude(4, beltPlan.outline, 0.05, [0, 0.92, beltPlan.centerZ], {
            centered: true,
            rot: [90, 0, 0],
            fullOnly: true
          }),
          // 顶盖：再外张 4mm。**整件最后缘由它定死**（−0.75），所以尾端那几个数不能随手改 ——
          // 改小了整件就浅于一米五，规格校验（1mm）当场报出来。顶面 0.99 也是整件最高点。
          extrude(1, lidPlan.outline, 0.025, [0, 0.965, lidPlan.centerZ], {
            centered: true,
            rot: [90, 0, 0]
          }),
          // 键床（键盘条那 20cm 的实体）+ 两条键侧木：整件最宽的 1.50m 由键床定。
          cbox(2, [1.5, 0.075, 0.2], [0, 0.645, 0.65]),
          cbox(2, [0.15, 0.03, 0.2], [-0.675, 0.72, 0.65]),
          cbox(2, [0.15, 0.03, 0.2], [0.675, 0.72, 0.65]),
          // 键滑条：键尾与琴身之间那一条，代表推到后面的键盖。lite 丢掉。
          cbox(2, [1.2, 0.02, 0.05], [0, 0.72, 0.575], { fullOnly: true }),
          ...whiteKeys,
          ...blackKeys,
          // 三条锥形琴腿 + 脚轮：前腿落在键床两端下面，后腿退到尾部偏低音侧（实物就是这样一根）。
          ctaper(3, 0.045, 0.036, 0.615, 16, [-0.62, 0.05, 0.63]),
          ctaper(3, 0.045, 0.036, 0.615, 16, [0.62, 0.05, 0.63]),
          ctaper(3, 0.04, 0.032, 0.615, 16, [-0.22, 0.05, -0.58]),
          ccyl(7, 0.032, 0.05, 12, [-0.62, 0, 0.63]),
          ccyl(7, 0.032, 0.05, 12, [0.62, 0, 0.63]),
          ccyl(7, 0.032, 0.05, 12, [-0.22, 0, -0.58]),
          // 踏板连杆：一根立柱从琴身底面（0.665）吊到踏板座（0.19），座前一排三只踏板。
          cbox(4, [0.1, 0.475, 0.05], [0, 0.19, 0.42]),
          cbox(4, [0.34, 0.035, 0.14], [0, 0.155, 0.4]),
          ...[-0.075, 0, 0.075].map(pedalCenterX =>
            cbox(7, [0.05, 0.012, 0.09], [pedalCenterX, 0.19, 0.345], { fullOnly: true })
          )
        ];
      })()
    };
  })(),

  // ── 卧室 ────────────────────────────────────────────────────────────────
  // 双人床的样板：木脚 + 床架箱体 + 软包床垫与床头板 + 被褥（含折边）+ 两对枕头 + 床尾搭毯。
  //
  // 为什么床要分这么多件：它原来是一份四槽位的既有资产（bed-material-0..3），
  // 槽位语义只活在 studio-external-models.js 里那句「1 / 3 号是床品」的注释上 ——
  // 换模型那天注释就成了错的，而错法很隐蔽（床架变浅色、枕头变木色）。现在角色写进材质名，
  // 床架与床品各自成立，运行侧那句话也已经改成按角色取色。
  //
  // **整件高度是 1.05 而不是 0.62**，因为床头板才是这张床上最高的东西：旧几何把床头板做到只有
  // 床垫面以上 14cm（总高 0.62），于是「床头板」在成品里根本读不出来，看着就是一张没有床头的
  // 平板床。实物上软包床头的顶面在 1.0~1.1m，这里取 1.05 —— 整件声明的宽 / 高 / 深因此就是
  // 床头板的最大轮廓，运行侧按它缩放（scaleBasis 与类型默认值同步改过）。
  //
  // 每两层之间刻意**沉进去 1~1.5cm**（床垫沉进床架、被褥沉进床垫、折边沉进被褥…）：
  // 两层软体的上下两面若严格贴在一起就是一对共面三角形，渲染时互相争夺同一像素深度 ——
  // 画面上是一片随相机距离闪动的斑驳，不报错、只能靠眼睛发现。软体互相压进去本来就是实物样子。
  bed: {
    note: "双人床：六条收分木脚 + 床架箱体 + 软包床垫 + 高软包床头板 + 被子（含折边）+ 床尾搭毯 + 两对枕头。",
    size: [1.8, 1.05, 2],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 }, // 0 木脚
      { role: "frame", color: 0xc49a6c, roughness: 0.66, metalness: 0 }, // 1 床架箱体
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 }, // 2 床垫 / 床头板软包
      { role: "fabric", color: 0xece2d2, roughness: 0.94, metalness: 0 }, // 3 被褥
      { role: "cushion", color: 0xf6efe2, roughness: 0.92, metalness: 0 }, // 4 枕头
      { role: "accent", color: 0xb98c5f, roughness: 0.9, metalness: 0 } // 5 折边 / 搭毯（撞色件）
    ],
    parts: [
      // 六条收分木脚：两米长的床只靠四角会中间塌，实物中间还有一对。
      // 顶面伸进床架箱体 2cm（0.16 > 床架底面 0.14）—— 与床架底面齐平的话，腿顶那六块小圆面
      // 与床架底面就是同一平面上的一对共面三角形，会闪。
      ...mirrorPair([
        ctaper(0, 0.03, 0.022, 0.16, 10, [0.8, 0, -0.8]),
        ctaper(0, 0.03, 0.022, 0.16, 10, [0.8, 0, 0]),
        ctaper(0, 0.03, 0.022, 0.16, 10, [0.8, 0, 0.8])
      ]),
      // 床架箱体：0.14 → 0.26，宽深都吃满 1.8 × 2.0 里的进深那一条（宽由床头板定，见下）。
      cbox(1, [1.76, 0.12, 2], [0, 0.14, 0]),
      // 床垫：0.24 厚（实物 25cm 左右的弹簧垫），四周比床架各收 2cm —— 收这一圈是为了让床架的
      // 边缘在俯视时读得出来，等宽会与床架糊成一块。底面 0.25 沉进床架顶面 1cm（躲共面），
      // 后端 4cm 压进床头板（齐平会留一道 5mm 的缝）。
      croundedBox(2, [1.72, 0.24, 1.88], [0, 0.25, 0.01], { radius: 0.04 }),
      // 床头板：从地面一直立到 1.05 —— 整件高度由它定，也是这张床上唯一「看得出是床头」的一件。
      // 背面比床架背面收进 5mm：两块板的后表面若都落在 z = −1.0 上就是一对共面三角形，
      // 从上往下看会闪（旧几何那两处共面重叠就是这么来的）。整件进深仍是 2.0（由床架定）。
      croundedBox(2, [1.8, 1.05, 0.1], [0, 0, -0.945], { radius: 0.045 }),
      // 被子：从枕头前（z −0.42）盖到床尾前 6cm（0.94），四周与床头板同宽 —— 真实被子总比床垫宽。
      // 底面 0.475 沉进床垫顶面 1.5cm，于是被子是「搭在床垫上」而不是「浮在床垫上」。
      croundedBox(3, [1.8, 0.075, 1.36], [0, 0.475, 0.26], { radius: 0.03 }),
      // 折边：被头翻出来的那一折，比被面厚一档、压在被子最靠近枕头的那一段上（z −0.40 → −0.18，
      // 整段都在被子的 z 范围内，不会有一段悬在床垫上方）。x 上比被子各收 1cm —— 同宽会与被子
      // 侧面共面（三块软体的侧面在同一条竖线上，交接处会闪）。
      croundedBox(5, [1.78, 0.06, 0.22], [0, 0.545, -0.29], { radius: 0.02 }),
      // 床尾搭毯：铺在被子靠床尾那一段上的撞色织物（实物上用来防脏、也是最省事的层次来源）。
      croundedBox(5, [1.78, 0.045, 0.44], [0, 0.545, 0.72], { radius: 0.018 }),
      // 一对睡枕：竖着靠在床头板上（绕自身 X 轴后仰 12°），下沿沉进床垫 4cm ——
      // 后仰的枕头不再与床垫顶面构成一对共面三角形，也才像「压」在床垫上。
      ...mirrorPair(
        croundedBox(4, [0.76, 0.15, 0.44], [0.43, 0.45, -0.7], {
          radius: 0.055,
          rot: [-12, 0, 0]
        })
      ),
      // 一对抱枕：压在折边上、靠着睡枕，比睡枕更斜（18°）、更小一号 —— 层次感全靠这一对。
      ...mirrorPair(
        croundedBox(4, [0.4, 0.13, 0.3], [0.28, 0.545, -0.28], {
          radius: 0.05,
          rot: [-18, 0, 0],
          fullOnly: true
        })
      )
    ]
  },
  bunkbed: {
    note: "上下床：四根通高立柱 + 两层床板 + 侧梯；床垫是唯一的软包件，走木器族的「中性米白」那一档。",
    size: [1, 1.7, 1.95],
    slots: [
      { role: "leg", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 立柱 / 侧梯
      // 床垫必须带角色：木器族的换色分支对**没有角色**的槽位是按烘焙亮度在三档木色里挑一个的，
      // 而这条床垫是亮色 ⇒ 会被刷成木色（静默失败，只在换风格时才看得出来）。
      // woodCombo 给 upholstery 定的是「中性米白、不随木色变」那一档，正是床垫该有的行为。
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 }, // 1 床垫
      { role: "shelf", color: 0x9c6b3f, roughness: 0.7, metalness: 0 } // 2 床板
    ],
    parts: [
      // 四根通高立柱：宽度与深度都由它定（0.475 + 0.025 = 0.5 / 0.975 + 0.025 = 0.975）。
      ...mirrorPair([
        cbox(0, [0.05, 1.7, 0.05], [0.475, 0, 0.95]),
        cbox(0, [0.05, 1.7, 0.05], [0.475, 0, -0.95])
      ]),
      ...[0.34, 1.29].map(bottomY => cbox(2, [0.95, 0.05, 1.9], [0, bottomY, 0])),
      ...[0.39, 1.34].map(bottomY =>
        croundedBox(1, [0.9, 0.14, 1.8], [0, bottomY, 0], { radius: 0.05 })
      ),
      // 侧梯：两根立杆 + 三档踏杆，挂在右侧前后柱之间。
      cbox(0, [0.04, 1.05, 0.04], [0.44, 0.35, -0.6]),
      cbox(0, [0.04, 1.05, 0.04], [0.44, 0.35, -0.3], { fullOnly: true }),
      ...[0.45, 0.7, 0.95].map(rungY =>
        ccyl(0, 0.014, 0.3, 10, [0.44, rungY, -0.45], { rot: [90, 0, 0], align: "center" })
      )
    ]
  },
  kidsbed: {
    note: "儿童床：低床架 + 通长圆角护栏 + 床垫，尺寸按学龄前身高取（护栏与床垫各自独立角色）。",
    size: [0.95, 0.65, 1.6],
    slots: [
      { role: "fabric", color: 0xf3e7d8, roughness: 0.9, metalness: 0 }, // 0 布艺护栏
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 1 木床架 / 腿
      { role: "upholstery", color: 0xfbfaf8, roughness: 0.9, metalness: 0 } // 2 床垫
    ],
    parts: [
      // 腿距 0.445 + 半径 0.03 = 0.475 ⇒ 宽度正好 0.95；前后 0.76 + 0.03 = 0.79 收在床尾板内侧。
      ...mirrorPair([
        ctaper(1, 0.03, 0.022, 0.34, 12, [0.445, 0, 0.76]),
        ctaper(1, 0.03, 0.022, 0.34, 12, [0.445, 0, -0.76])
      ]),
      cbox(1, [0.89, 0.06, 1.5], [0, 0.34, 0]),
      // 床尾板 + 单侧护栏（另一侧靠墙，真儿童床也是这样摆的）。
      // 顶面 0.64 收在通长护栏（0.62 ~ 0.65）里面 —— 与护栏齐平时两块顶面共面，
      // 从上方看是 0.044m² 的同向竞争（护栏那一整圈都在闪）。背面同理收 1cm 进护栏之后。
      cbox(1, [0.87, 0.24, 0.04], [0, 0.4, -0.77]),
      cbox(1, [0.05, 0.24, 1.5], [-0.445, 0.4, 0], { fullOnly: true }),
      croundedBox(2, [0.8, 0.16, 1.4], [0, 0.4, 0], { radius: 0.05 }),
      // 通长护栏：前后吃满 1.6（深度的下界由它定），顶端正好 0.65（0.62 + 0.03）。
      // 宽度 0.91 比床尾板 / 侧护栏宽 2cm：整件宽度 0.95 由四条腿（±0.445±0.03）定，
      // 护栏放宽不影响声明尺寸，却能让它的两侧面与那两块错开、不共面。
      croundedBox(0, [0.91, 0.03, 1.6], [0, 0.62, 0], { radius: 0.012 })
    ]
  },

  // ── 影音 ────────────────────────────────────────────────────────────────
  soundbar: {
    note: "回音壁：长条箱体 + 正面整幅出音网布 + 右侧小显示窗 + 顶部镀铬压条 + 一对脚垫。",
    size: [0.95, 0.08, 0.12],
    slots: [
      { role: "body", color: 0x2a2c30, roughness: 0.42, metalness: 0.12 }, // 0 箱体
      { role: "grating", color: 0x1a1c20, roughness: 0.88, metalness: 0 }, // 1 出音网布
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 2 显示窗
      { role: "trim", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }, // 3 顶部压条
      { role: "leg", color: 0x1a1c20, roughness: 0.6, metalness: 0.05 } // 4 脚垫
    ],
    parts: [
      // 箱体只占前 0.114 进深，网布与显示窗贴在最前面 6mm —— 整个 0.12 进深由它们顶到；
      // 网布在 x 上收窄到 -0.43…0.31，右侧那条空隙正好留给显示窗，两者不重叠。
      ...mirrorPair(cbox(4, [0.16, 0.008, 0.07], [0.33, 0, 0])),
      croundedBox(0, [0.95, 0.066, 0.114], [0, 0.008, -0.003], { radius: 0.012 }),
      cbox(1, [0.74, 0.05, 0.008], [-0.06, 0.016, 0.056]),
      cbox(2, [0.07, 0.02, 0.008], [0.4, 0.03, 0.056]),
      cbox(3, [0.9, 0.006, 0.022], [0, 0.074, 0])
    ]
  },
  speaker: {
    note: "落地音箱：矮底座 + 细长箱体 + 正面整幅网布 + 三只扬声器单元 + 顶盖 + 背面接线盒。",
    size: [0.28, 1.05, 0.28],
    slots: [
      { role: "body", color: 0x3c3f44, roughness: 0.5, metalness: 0.06 }, // 0 箱体
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.35 }, // 1 单元 / 接线盒
      { role: "grating", color: 0x1a1c20, roughness: 0.9, metalness: 0 }, // 2 网布
      { role: "trim", color: 0x8c8f94, roughness: 0.34, metalness: 0.3 }, // 3 顶盖
      { role: "base", color: 0x2a2c30, roughness: 0.5, metalness: 0.12 } // 4 底座
    ],
    parts: [
      cbox(4, [0.26, 0.02, 0.26], [0, 0, 0]),
      croundedBox(0, [0.28, 1, 0.264], [0, 0.02, 0], { radius: 0.03 }),
      cbox(2, [0.23, 0.9, 0.006], [0, 0.11, 0.135]),
      // 单元只比网布前突 2mm：同面会产生闪烁，多这一点点就够读成「嵌在网面上的喇叭」。
      // 横卧圆柱的 y 尺寸是直径，所以落位给的是「中心 - 半径」。
      // 三只扬声器锥原本与网罩「同一条背面」（都在 z = 0.132）、前面又都顶到 0.14 与 0.138，
      // 这一对是**同向共面**（6.7cm²），从正面看就是三个单元的外圈在抖。
      // 锥体厚度 8 → 5mm、中心前移到 0.1375：背面 0.135 埋进网罩（0.132 ~ 0.138），
      // 前面仍是整件最前的 0.14，进深不变。
      ccyl(1, 0.072, 0.005, 24, [0, 0.648, 0.1375], { rot: [90, 0, 0] }),
      ccyl(1, 0.048, 0.005, 20, [0, 0.392, 0.1375], { rot: [90, 0, 0] }),
      ccyl(1, 0.032, 0.005, 16, [0, 0.208, 0.1375], { rot: [90, 0, 0], fullOnly: true }),
      cbox(1, [0.16, 0.16, 0.008], [0, 0.12, -0.136], { fullOnly: true }),
      cbox(3, [0.26, 0.03, 0.24], [0, 1.02, 0])
    ]
  },
  projector: {
    note: "投影仪：圆角机身 + 四只脚垫 + 顶面控制条与散热格栅 + 正面镜筒（金属圈 + 玻璃镜片）。",
    size: [0.3, 0.1, 0.24],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.42, metalness: 0.05 }, // 0 机身
      { role: "panel", color: 0x22252a, roughness: 0.35, metalness: 0.2 }, // 1 顶面控制条
      { role: "metal", color: 0xb4babf, roughness: 0.25, metalness: 0.45 }, // 2 镜筒 / 脚垫
      { role: "glass", color: 0xdfeaec, roughness: 0.08, metalness: 0.1 }, // 3 镜片
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 } // 4 散热格栅
    ],
    parts: [
      // 正面分两级外凸：机身面 0.108 → 镜筒 0.108…0.116 → 镜片 0.116…0.12。
      // 逐级 4mm 既有层次，又不会出现「镜片与镜筒同面」的闪烁。
      ccyl(2, 0.012, 0.006, 12, [0.12, 0, 0.09]),
      ccyl(2, 0.012, 0.006, 12, [-0.12, 0, 0.09]),
      ccyl(2, 0.012, 0.006, 12, [0.12, 0, -0.09]),
      ccyl(2, 0.012, 0.006, 12, [-0.12, 0, -0.09]),
      croundedBox(0, [0.3, 0.086, 0.228], [0, 0.006, -0.006], { radius: 0.018 }),
      cbox(1, [0.12, 0.008, 0.05], [0.06, 0.092, 0]),
      cbox(4, [0.1, 0.008, 0.07], [-0.08, 0.092, 0]),
      ccyl(2, 0.042, 0.008, 24, [0.08, 0.013, 0.112], { rot: [90, 0, 0] }),
      // 镜片加厚到 8mm（背面 0.112 埋进镜筒里）：原来镜片背面与镜筒正面同在 0.116 ——
      // 一对背靠背的面，玻璃是 DoubleSide、背面剔不掉，所以照样闪。正面仍是 0.12（占地不变）。
      ccyl(3, 0.03, 0.008, 24, [0.08, 0.025, 0.116], { rot: [90, 0, 0] })
    ]
  },

  // ── 环境电器 ────────────────────────────────────────────────────────────
  fan: {
    note: "落地风扇：圆底座 + 立杆 + 三叶扇头 + 金属网罩 + 杆上控制面板（显示区）。",
    size: [0.4, 1.15, 0.4],
    slots: [
      { role: "base", color: 0xd0d0c9, roughness: 0.5, metalness: 0.08 }, // 0 圆底座
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 }, // 1 立杆 / 网罩
      { role: "body", color: 0x22252a, roughness: 0.4, metalness: 0.1 }, // 2 电机壳 / 扇叶
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }, // 3 中心盖
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 4 控制面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 5 显示区
    ],
    parts: [
      // 底座径 0.40 同时管住宽与深；扇头圆心抬到 y = 1.00，网圈外沿正好顶到 1.15。
      ccyl(0, 0.2, 0.03, 28, [0, 0, 0]),
      ccyl(1, 0.018, 0.95, 16, [0, 0.03, 0]),
      ccyl(2, 0.055, 0.12, 20, [0, 0.945, -0.08], { rot: [90, 0, 0], align: "center" }),
      // 三片扇叶各自偏移到半径 0.09 处，再绕**自身中心**转 —— 转的是叶片朝向，不是落点。
      cbox(2, [0.11, 0.045, 0.012], [0.09, 1.0, -0.018], { align: "center" }),
      cbox(2, [0.11, 0.045, 0.012], [-0.045, 1.078, -0.018], { rot: [0, 0, 120], align: "center" }),
      cbox(2, [0.11, 0.045, 0.012], [-0.045, 0.922, -0.018], { rot: [0, 0, 240], align: "center" }),
      ctorus(1, 0.144, 0.006, [0, 1.0, 0.01], { axis: "z", align: "center" }),
      cbox(1, [0.012, 0.288, 0.006], [0, 1.0, 0.01], { align: "center", fullOnly: true }),
      cbox(1, [0.288, 0.012, 0.006], [0, 1.0, 0.01], { align: "center", fullOnly: true }),
      ccyl(3, 0.03, 0.02, 12, [0, 1.0, 0.012], { rot: [90, 0, 0], align: "center", fullOnly: true }),
      cbox(4, [0.1, 0.06, 0.012], [0, 0.36, 0.022]),
      cbox(5, [0.06, 0.03, 0.012], [0, 0.4, 0.034], { fullOnly: true })
    ]
  },
  humidifier: {
    note: "立式加湿器：圆桶机身 + 下部水箱视窗 + 顶部出雾口 + 控制面板（显示区）+ 底座。",
    size: [0.3, 0.55, 0.3],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.04 }, // 0 机身
      { role: "base", color: 0xd0d0c9, roughness: 0.6, metalness: 0.04 }, // 1 底座
      { role: "trim", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }, // 2 出雾口
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.05 }, // 3 水位视窗
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 4 控制面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 5 显示区
    ],
    parts: [
      // 机身径 0.30 已经把宽与深顶满；视窗与面板是贴在筒壁上的平板，前极值 0.15 由它们接管。
      ccyl(1, 0.14, 0.05, 28, [0, 0, 0]),
      ccyl(0, 0.15, 0.472, 28, [0, 0.048, 0]),
      ccyl(2, 0.045, 0.032, 16, [0, 0.518, 0]),
      cbox(3, [0.16, 0.2, 0.012], [0, 0.14, 0.144]),
      cbox(4, [0.2, 0.1, 0.016], [0, 0.35, 0.138]),
      cbox(5, [0.12, 0.05, 0.012], [0, 0.375, 0.144])
    ]
  },
  dehumidifier: {
    note: "除湿机：机身 + 顶部出风格栅 + 下前水箱抽屉 + 控制面板（显示区）+ 前上部提手 + 底座。",
    size: [0.35, 0.6, 0.28],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.05 }, // 0 机身
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 1 底座
      { role: "drawer", color: 0xdfeaec, roughness: 0.3, metalness: 0.1 }, // 2 水箱抽屉
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 3 控制面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 4 显示区
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 }, // 5 提手
      { role: "grating", color: 0x3c3f44, roughness: 0.45, metalness: 0.2 } // 6 顶部出风格栅
    ],
    parts: [
      // 机身只到 0.586，顶上 1.4cm 是外露的格栅 —— 0.60 的高度极值落在格栅上。
      cbox(1, [0.31, 0.04, 0.22], [0, 0, -0.01]),
      croundedBox(0, [0.35, 0.546, 0.26], [0, 0.04, -0.01], { radius: 0.02 }),
      cbox(6, [0.28, 0.014, 0.2], [0, 0.586, -0.01]),
      croundedBox(2, [0.24, 0.2, 0.03], [0, 0.06, 0.125], { radius: 0.008 }),
      cbox(3, [0.26, 0.1, 0.026], [0, 0.46, 0.123]),
      cbox(4, [0.14, 0.05, 0.012], [0, 0.485, 0.134]),
      cbox(5, [0.14, 0.03, 0.02], [0, 0.535, 0.13])
    ]
  },
  freshair: {
    note: "明装新风机：箱体 + 前检修门 + 左侧控制面板（显示区）+ 右侧两个新风管接口。",
    size: [0.6, 0.3, 0.3],
    slots: [
      { role: "body", color: 0xf2f1ed, roughness: 0.5, metalness: 0.05 }, // 0 箱体
      { role: "door", color: 0xf2f1ed, roughness: 0.48, metalness: 0.06 }, // 1 检修门
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 2 控制面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 3 显示区
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 } // 4 新风管接口
    ],
    parts: [
      // 箱体只到 z = 0.06，前面留给检修门与管口 —— 前极值 0.15 由管口接管。
      cbox(0, [0.6, 0.3, 0.21], [0, 0, -0.045]),
      croundedBox(1, [0.44, 0.24, 0.06], [0, 0.03, 0.05], { radius: 0.01 }),
      cbox(2, [0.3, 0.1, 0.07], [-0.12, 0.1, 0.08]),
      cbox(3, [0.14, 0.05, 0.012], [-0.12, 0.125, 0.112]),
      ccyl(4, 0.045, 0.09, 16, [0.18, 0.09, 0.105], { rot: [90, 0, 0], align: "center" }),
      ccyl(4, 0.045, 0.09, 16, [0.18, 0.21, 0.105], { rot: [90, 0, 0], align: "center" })
    ]
  },

  // ── 智能面板与安防 ──────────────────────────────────────────────────────
  thermostat: {
    note: "温控面板：方底板 + 深色显示区 + 一圈回边（上下左右四道）+ 底部传感器点。",
    size: [0.1, 0.1, 0.02],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.4, metalness: 0.05 }, // 0 底板
      { role: "screen", color: 0x22252a, roughness: 0.28, metalness: 0.12 }, // 1 显示区
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }, // 2 回边
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 } // 3 传感器
    ],
    parts: [
      // 底板只占后半 14mm，显示区与回边同处最前 6mm 里（两者错开 1mm，贴边并排会闪烁）。
      // 整个 20mm 进深由它们顶到，前后各 10mm，占地中心才落在原点。
      croundedBox(0, [0.1, 0.1, 0.014], [0, 0, -0.003], { radius: 0.008 }),
      cbox(1, [0.064, 0.05, 0.006], [0, 0.025, 0.007]),
      cbox(2, [0.09, 0.012, 0.006], [0, 0.078, 0.007]),
      cbox(2, [0.09, 0.012, 0.006], [0, 0.01, 0.007]),
      ...mirrorPair(cbox(2, [0.012, 0.056, 0.006], [0.039, 0.022, 0.007])),
      ccyl(3, 0.005, 0.006, 12, [0, 0.002, 0.005])
    ]
  },
  smartpanel: {
    note: "智能面板：方底板 + 大显示区 + 底部三键，比温控面板略大。",
    size: [0.12, 0.12, 0.02],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.4, metalness: 0.05 }, // 0 底板
      { role: "screen", color: 0x31353a, roughness: 0.26, metalness: 0.12 }, // 1 显示区
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 } // 2 按键
    ],
    parts: [
      croundedBox(0, [0.12, 0.12, 0.016], [0, 0, -0.002], { radius: 0.009 }),
      cbox(1, [0.086, 0.062, 0.008], [0, 0.03, 0.006]),
      cbox(2, [0.022, 0.014, 0.008], [0, 0.008, 0.006]),
      ...mirrorPair(cbox(2, [0.022, 0.014, 0.008], [0.03, 0.008, 0.006]))
    ]
  },
  smartlock: {
    note: "智能门锁：贴门面板 + 上部密码区 + 中部显示屏 + 指纹头 + 底部横把手。",
    size: [0.08, 0.28, 0.05],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.3, metalness: 0.25 }, // 0 面板
      { role: "screen", color: 0x0f1114, roughness: 0.22, metalness: 0.1 }, // 1 显示屏
      { role: "metal", color: 0x454c54, roughness: 0.26, metalness: 0.4 }, // 2 把手
      { role: "panel", color: 0x31353a, roughness: 0.34, metalness: 0.2 }, // 3 密码区
      { role: "trim", color: 0xb4babf, roughness: 0.24, metalness: 0.5 } // 4 指纹头
    ],
    parts: [
      croundedBox(0, [0.08, 0.28, 0.026], [0, 0, -0.012], { radius: 0.01 }),
      cbox(1, [0.05, 0.09, 0.008], [0, 0.15, 0.005]),
      cbox(3, [0.05, 0.07, 0.008], [0, 0.055, 0.005]),
      ccyl(4, 0.009, 0.008, 16, [0, 0.247, 0.005]),
      // 横把手：绕 z 转 90° 后轴向沿 x，长度就是它的 x 尺寸；落位 y 仍是底面，z 是中心。
      ccyl(2, 0.011, 0.06, 16, [0, 0.01, 0.014], { rot: [0, 0, 90] })
    ]
  },
  doorbell: {
    note: "可视门铃：竖面板 + 上部摄像头（玻璃镜片）+ 中部显示区 + 下部门铃圆环。",
    size: [0.06, 0.13, 0.03],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.3, metalness: 0.25 }, // 0 面板
      { role: "screen", color: 0x0f1114, roughness: 0.2, metalness: 0.1 }, // 1 显示区
      { role: "glass", color: 0xdfeaec, roughness: 0.08, metalness: 0.1 }, // 2 摄像头镜片
      { role: "trim", color: 0xb4babf, roughness: 0.25, metalness: 0.45 } // 3 门铃圆环
    ],
    parts: [
      croundedBox(0, [0.06, 0.13, 0.018], [0, 0, -0.006], { radius: 0.008 }),
      ccyl(2, 0.011, 0.008, 20, [0, 0.108, 0.011], { rot: [90, 0, 0] }),
      cbox(1, [0.042, 0.045, 0.008], [0, 0.05, 0.007]),
      ctorus(3, 0.016, 0.004, [0, 0.028, 0.011], { axis: "z" })
    ]
  },
  gateway: {
    note: "智能网关：扁平圆角盒 + 顶面顶板与指示灯环 + 背侧网口区。",
    size: [0.12, 0.05, 0.12],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.04 }, // 0 机身
      { role: "trim", color: 0x9aa1a8, roughness: 0.3, metalness: 0.3 }, // 1 顶板
      { role: "lit", color: 0x5fd08a, roughness: 0.2, metalness: 0 }, // 2 指示灯环
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 } // 3 网口区
    ],
    parts: [
      croundedBox(0, [0.12, 0.046, 0.116], [0, 0, -0.002], { radius: 0.014 }),
      cbox(3, [0.08, 0.014, 0.008], [0, 0.006, 0.056]),
      croundedBox(1, [0.112, 0.002, 0.104], [0, 0.046, 0], { radius: 0.008, fullOnly: true }),
      ccyl(2, 0.014, 0.002, 20, [0, 0.048, 0])
    ]
  },

  // ── 客厅与休闲（新增） ───────────────────────────────────────────────────
  chaise: {
    note: "贵妃榻：木底座框 + 长条软包坐垫 + 矮靠背 + 坐垫压线，沙发旁的舒展位。",
    size: [0.75, 0.72, 1.65],
    slots: [
      { role: "leg", color: 0xbc9163, roughness: 0.7, metalness: 0 }, // 0 木脚
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 1 底座框
      { role: "upholstery", color: 0xf3e7d8, roughness: 0.92, metalness: 0 }, // 2 坐垫
      { role: "accent", color: 0xe4d5c2, roughness: 0.9, metalness: 0 } // 3 靠背
    ],
    parts: [
      // 腿距 0.353 + 半径 0.022 = 0.375 ⇒ 宽度正好 0.75（这件家具宽度由腿距决定）。
      ...mirrorPair([
        ctaper(0, 0.022, 0.016, 0.14, 12, [0.353, 0, 0.8]),
        ctaper(0, 0.022, 0.016, 0.14, 12, [0.353, 0, -0.8])
      ]),
      cbox(1, [0.73, 0.06, 1.65], [0, 0.14, 0]),
      croundedBox(2, [0.71, 0.17, 1.61], [0, 0.285, 0], { radius: 0.05 }),
      croundedBox(3, [0.71, 0.35, 0.14], [0, 0.37, -0.735], { radius: 0.05 }),
      // 压线原与靠背的**底面**同在 0.37（都朝下）：122cm² 的同向共面。压线抬起 2mm 即分开，
      // 它本来就埋在坐垫体内（坐垫 0.285~0.455），露出多少都不变。
      cbox(2, [0.69, 0.02, 1.59], [0, 0.372, 0], { fullOnly: true })
    ]
  },
  nestingtable: {
    note: "套几：大小两张方台面套叠，收起时省地方 —— 小几斜插在大几下方，这正是「套几」读得出来的地方。",
    size: [0.55, 0.5, 0.55],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 台面
      { role: "leg", color: 0xbc9163, roughness: 0.68, metalness: 0 } // 1 收分腿
    ],
    parts: [
      // 大几：台面吃满 0.55，腿收在四角内侧。
      ...ringOf(4, { radius: 0.33, startAngle: 45 }, () =>
        ctaper(1, 0.016, 0.011, 0.465, 12, [0, 0, 0])
      ),
      cbox(0, [0.55, 0.035, 0.55], [0, 0.465, 0]),
      // 小几：整体偏 7cm 插进大几底下；台面 0.4 ⇒ 最远到 0.07 + 0.2 = 0.27 < 0.275，正好不越界。
      ...ringOf(4, { radius: 0.235, startAngle: 45, center: [0.07, 0.07] }, () =>
        ctaper(1, 0.014, 0.01, 0.365, 12, [0, 0, 0])
      ),
      cbox(0, [0.4, 0.03, 0.4], [0.07, 0.365, 0.07])
    ]
  },
  roundcoffeetable: {
    note: "圆茶几：圆台面带收边 + 上粗下细的中心柱 + 圆底座，客厅中岛式布局。",
    size: [0.9, 0.42, 0.9],
    slots: [
      { role: "top", color: 0xb0703c, roughness: 0.62, metalness: 0.02 }, // 0 圆台面
      { role: "body", color: 0x454c54, roughness: 0.32, metalness: 0.3 }, // 1 中心柱
      { role: "base", color: 0x454c54, roughness: 0.32, metalness: 0.3 } // 2 圆底座
    ],
    parts: [
      // 台面：闭合母线（平面 → 立面 → 上缘内收 → 底心），上缘收 1.8cm 才像成品桌面而不是一块饼。
      clathe(
        0,
        [
          [0, 0],
          [0.45, 0],
          [0.45, 0.028],
          [0.432, 0.04],
          [0, 0.04],
          [0, 0]
        ],
        40,
        [0, 0.38, 0]
      ),
      // 底座：上收下放的圆盘，落地面积比台面小一圈（视觉上才「稳」）。
      clathe(
        2,
        [
          [0, 0],
          [0.22, 0],
          [0.22, 0.03],
          [0.17, 0.045],
          [0, 0.045],
          [0, 0]
        ],
        32,
        [0, 0, 0]
      ),
      ctaper(1, 0.06, 0.045, 0.34, 20, [0, 0.045, 0]),
      ctorus(1, 0.052, 0.008, [0, 0.34, 0], { fullOnly: true })
    ]
  },
  screenspan: {
    note: "屏风：三扇折叠面板，兼作隔断与背景。",
    size: [1.6, 1.75, 0.35],
    slots: [
      { color: 0x9c6b3f, roughness: 0.68, metalness: 0 }, // 0 木框
      { color: 0xf3e7d8, roughness: 0.92, metalness: 0 } // 1 布面
    ],
    parts: [
      cbox(0, [0.53, 1.75, 0.024], [-0.535, 0, -0.16]),
      cbox(0, [0.53, 1.75, 0.024], [0, 0, 0.16]),
      cbox(0, [0.53, 1.75, 0.024], [0.535, 0, -0.16]),
      cbox(1, [0.45, 1.55, 0.004], [-0.535, 0.1, -0.145]),
      cbox(1, [0.45, 1.55, 0.004], [0, 0.1, 0.175]),
      cbox(1, [0.45, 1.55, 0.004], [0.535, 0.1, -0.145]),
      cbox(0, [1.58, 0.05, 0.03], [0, 1.75, 0], { align: "top", fullOnly: true })
    ]
  },
  coatrail: {
    note: "衣帽架：锥形木立柱 + 四向斜挑挂钩 + 圆底盘 + 中部挂圈，玄关随手挂衣。",
    size: [0.45, 1.75, 0.45],
    slots: [
      { role: "body", color: 0x9c6b3f, roughness: 0.66, metalness: 0 }, // 0 立柱 / 顶球
      { role: "base", color: 0x454c54, roughness: 0.32, metalness: 0.3 }, // 1 底盘
      { role: "metal", color: 0x454c54, roughness: 0.32, metalness: 0.3 } // 2 挂钩 / 挂圈
    ],
    parts: [
      // 底盘：上收下放的圆盘，压得住重心。
      clathe(
        1,
        [
          [0, 0],
          [0.225, 0],
          [0.225, 0.022],
          [0.19, 0.035],
          [0, 0.035],
          [0, 0]
        ],
        32,
        [0, 0, 0]
      ),
      ctaper(0, 0.026, 0.019, 1.685, 16, [0, 0.035, 0]),
      // 顶球收口：立柱顶端有个小圆球才不会是一根断掉的木棍。半径 0.03 ⇒ 0.035 + 1.685 + 0.03 = 1.75。
      sphere(0, 0.03, [0, 1.72, 0], { align: "center" }),
      // 四向挂钩：基准位朝 +z 斜挑 30°，环列四份；外伸最远 0.075 + 0.095 = 0.17 < 0.225。
      ...ringOf(4, { radius: 0.075 }, () =>
        ccyl(2, 0.013, 0.22, 8, [0, 1.5, 0], { rot: [30, 0, 0], align: "center" })
      ),
      ccyl(2, 0.075, 0.014, 20, [0, 1.15, 0], { fullOnly: true })
    ]
  },
  stool: {
    note: "圆凳：圆座面带软包边 + 四条外八锥形金属腿 + 环状踏脚。",
    size: [0.36, 0.45, 0.36],
    slots: [
      { role: "leg", color: 0x454c54, roughness: 0.32, metalness: 0.3 }, // 0 金属腿 / 踏脚圈
      { role: "top", color: 0xc49a6c, roughness: 0.66, metalness: 0 } // 1 座面
    ],
    parts: [
      ...ringOf(4, { radius: 0.125, startAngle: 45 }, () =>
        ctaper(0, 0.014, 0.01, 0.39, 12, [0, 0, 0], { rot: [4, 0, 0] })
      ),
      ctorus(0, 0.133, 0.0075, [0, 0.2, 0], { fullOnly: true }),
      clathe(
        1,
        [
          [0, 0],
          [0.18, 0],
          [0.18, 0.04],
          [0.165, 0.06],
          [0, 0.06],
          [0, 0]
        ],
        32,
        [0, 0.39, 0]
      )
    ]
  },

  // ── 收纳与柜类（新增） ───────────────────────────────────────────────────
  locker: {
    note: "储物柜：双开门 + 中部隔板，阳台与过道的通用收纳。",
    size: [0.9, 1.8, 0.4],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 柜体
      { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 }, // 1 柜门
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 } // 2 把手
    ],
    parts: [
      cbox(0, [0.9, 1.8, 0.36], [0, 0, -0.02]),
      cbox(1, [0.44, 1.6, 0.03], [-0.225, 0.1, 0.175]),
      cbox(1, [0.44, 1.6, 0.03], [0.225, 0.1, 0.175]),
      cbox(2, [0.02, 0.16, 0.01], [-0.03, 0.8, 0.195], { fullOnly: true }),
      cbox(2, [0.02, 0.16, 0.01], [0.03, 0.8, 0.195], { fullOnly: true })
    ]
  },
  laundrycabinet: {
    note: "洗衣柜：下柜收纳 + 台上圆盆，阳台洗衣位。",
    size: [0.65, 0.85, 0.6],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 柜体
      { role: "door", color: 0xffffff, roughness: 0.35, metalness: 0.05 }, // 1 柜门
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 }, // 2 五金
      { role: "top", color: 0xd8d6d0, roughness: 0.28, metalness: 0.02 } // 3 台盆（陶瓷一体盆，跟台面走石材质感）
    ],
    parts: [
      cbox(0, [0.65, 0.8, 0.56], [0, 0, -0.02]),
      ccyl(3, 0.17, 0.05, 24, [0, 0.8, 0]),
      cbox(1, [0.58, 0.62, 0.03], [0, 0.08, 0.275]),
      cbox(2, [0.02, 0.14, 0.01], [0.22, 0.35, 0.295], { fullOnly: true })
    ]
  },
  balconycabinet: {
    note: "阳台柜：上柜封闭 + 下部敞口，藏清洁用品。",
    size: [0.8, 1.2, 0.4],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 柜体
      { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 }, // 1 柜门
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 } // 2 把手
    ],
    parts: [
      cbox(0, [0.8, 1.2, 0.36], [0, 0, -0.02]),
      cbox(1, [0.72, 0.64, 0.03], [0, 0.5, 0.175]),
      cbox(0, [0.74, 0.025, 0.34], [0, 0.44, -0.02], { fullOnly: true }),
      cbox(2, [0.02, 0.16, 0.01], [0.28, 0.75, 0.195], { fullOnly: true })
    ]
  },
  winecabinet: {
    note: "酒柜：玻璃门 + 内置层板，餐厅一角的陈列柜。",
    size: [0.6, 1.6, 0.45],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 木柜体 / 层板
      // 同展示柜：槽位色与 joineryCombo 的 glass 配方保持一致。
      { role: "glass", color: 0xa9c5d3, roughness: 0.12, metalness: 0.04 }, // 1 玻璃门
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 } // 2 五金
    ],
    parts: [
      cbox(0, [0.6, 1.6, 0.42], [0, 0, -0.015]),
      // 玻璃门 0.201 ~ 0.221：背面**不能**落在柜体正面（0.195）上 —— 玻璃在运行侧是
      // DoubleSide，背面剔不掉，两块面会一起抢同一片像素（0.62m² 的整扇门在闪）。
      // 正面也收进去 4mm，把手（0.215 起）因此是插在玻璃里、而不是与玻璃正面齐平。
      cbox(1, [0.48, 1.3, 0.02], [0, 0.2, 0.211]),
      cbox(0, [0.52, 0.02, 0.36], [0, 0.55, -0.02], { fullOnly: true }),
      cbox(2, [0.02, 0.2, 0.01], [-0.16, 0.75, 0.22], { fullOnly: true })
    ]
  },
  kitchenisland: {
    note: "岛台：独立操作台 + 石台面，开放式厨房的中心。",
    size: [1.6, 0.9, 0.8],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 柜体
      { role: "top", color: 0xd8d6d0, roughness: 0.28, metalness: 0.08 }, // 1 石台面
      { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 } // 2 门板
    ],
    parts: [
      cbox(0, [1.5, 0.86, 0.7], [0, 0, 0]),
      cbox(1, [1.6, 0.04, 0.8], [0, 0.86, 0]),
      cbox(2, [0.44, 0.6, 0.02], [-0.5, 0.06, 0.36], { fullOnly: true }),
      cbox(2, [0.44, 0.6, 0.02], [0.06, 0.06, 0.36], { fullOnly: true })
    ]
  },
  pantry: {
    note: "餐边高柜：通高双门 + 中部开放格，餐厅收纳主力。",
    size: [0.9, 1.9, 0.42],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 柜体
      { role: "door", color: 0xffffff, roughness: 0.42, metalness: 0.06 }, // 1 柜门
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 } // 2 把手
    ],
    parts: [
      cbox(0, [0.9, 1.9, 0.38], [0, 0, -0.02]),
      cbox(1, [0.43, 1.5, 0.025], [-0.225, 0.25, 0.1825]),
      cbox(1, [0.43, 1.5, 0.025], [0.225, 0.25, 0.1825]),
      cbox(2, [0.02, 0.14, 0.015], [-0.04, 1.0, 0.2025], { fullOnly: true }),
      cbox(2, [0.02, 0.14, 0.015], [0.04, 1.0, 0.2025], { fullOnly: true })
    ]
  },
  // ── 餐边柜（玻璃门）──────────────────────────────────────────────────────
  // 几何按原 sideboard.glb（HA Bridge 那一版）**逐件复刻**：下柜 0–0.858、台面夹在中间、
  // 台面之上到 1.342 是**敞开的操作格**（深处立一块背板），1.342–2.2 才是上柜。
  // 那道敞开格是重做时最容易做丢的一处：把上柜一路顶到台面上，正面就少了一片凹进去的阴影，
  // 整件会从「餐边柜」读成「通高衣柜」—— 上一版挨的就是这条反馈。
  //
  // 最右一扇上柜门是**整扇玻璃**（没有木框）：门的外沿与左右两扇门逐尺寸相同，三扇门站在
  // 同一条门缝线上，只是这一扇整块透明。玻璃色取玻璃柜（glasscabinet）那扇玻璃门的色号。
  //
  // 上柜必须是**空心柜体**（围板 + 背板 + 中立板），不能是一块实体：玻璃门后面若贴着实体，
  // 玻璃到后壁只剩 2cm，无论透明度调到多少都会读成「一块深色板」。玻璃柜之所以看着透，
  // 是因为它玻璃后面有 39cm 空腔；这台要的是同一个观感，所以上柜的空腔深度同样留到 40cm。
  // 柜内那一圈的饰面单列 `interior` 角色（默认随柜门）：柜内若跟着深色柜体走，玻璃照样发闷。
  sideboard: {
    note: "餐边柜：下柜三门 + 石台面 + 敞开的操作格 + 空心上柜（内衬 + 层板），上柜最右一扇为整扇玻璃门（无框，与玻璃柜同款玻璃）。",
    size: [1.6, 2.2, 0.45],
    slots: [
      { role: "body", color: 0x5a3a22, roughness: 0.66, metalness: 0 }, // 0 柜体围板（下柜 / 上柜外壳 / 操作格背板）
      { role: "top", color: 0xf2f1ed, roughness: 0.28, metalness: 0.02 }, // 1 石台面
      { role: "door", color: 0xf5f3ef, roughness: 0.42, metalness: 0.06 }, // 2 门板（上柜左 / 中两扇 + 下柜三门）
      { role: "glass", color: 0xa9c5d3, roughness: 0.12, metalness: 0.04 }, // 3 整扇玻璃门
      { role: "interior", color: 0xa49385, roughness: 0.6, metalness: 0.03 } // 4 柜内衬（背板 / 中立板 / 层板）
    ],
    parts: [
      // 注意 cbox 的定位约定：x / z 是**中心**，y 是**底面**（align 默认 "bottom"）。
      // 下柜箱体：收到门板之后（0.42 深），门板才有「凸出 3cm」的厚度可读，门板背面也才与
      // 箱体正面留出 4mm 缝、不会共面闪面；0.42 + 门板 0.03 正好 0.45，与声明的进深一致。
      // 箱体在 x 与背面各收 1cm（1.6 → 1.58、0.42 → 0.41）：箱体顶面埋进台面里（0.8355 起），
      // 两者就同时占了 x = ±0.8 与 z = -0.225 这两个平面 —— 箱体的侧面 / 背面与台面的同侧
      // 面共面，那 2.25cm 厚的一圈从外侧看就在闪。收 1cm 之后台面外挑成一条 1cm 的边。
      cbox(0, [1.58, 0.858, 0.41], [0, 0, -0.01]),
      // 石台面：整件最宽最深的一件，占地 1.6 × 0.45 由它定。
      cbox(1, [1.6, 0.045, 0.45], [0, 0.8355, 0]),
      // 操作格背板：立在台面之上、贴着后背，让敞开的格子有底，而不是直接看穿到墙。
      // 起点就在台面顶面（0.8805）而不是嵌进台面 2.25cm：嵌进去的话它与台面又共用
      // x = ±0.8 / z = -0.225 两个平面，背面 / 侧面同样会闪。齐平之后两者的关系变成
      // 背靠背（台面朝上、背板朝下），运行时单面渲染把背面剔掉，不闪。
      cbox(0, [1.58, 0.4615, 0.045], [0, 0.8805, -0.2025]),
      // 下柜三门：各 0.496 宽，底边离地 3.4cm 露出一截踢脚。
      cbox(2, [0.496, 0.7551, 0.026], [-0.528, 0.0343, 0.212]),
      cbox(2, [0.496, 0.7551, 0.026], [0, 0.0343, 0.212]),
      cbox(2, [0.496, 0.7551, 0.026], [0.528, 0.0343, 0.212]),
      // ── 上柜：空心柜体（围板 1.8cm 厚，外壳仍是 body）────────────────────
      // 左右侧板：夹住顶底板（顶底板在 x 方向收进 1.8cm），面板之间只共边不共面。
      cbox(0, [0.018, 0.858, 0.42], [-0.791, 1.342, -0.015]),
      cbox(0, [0.018, 0.858, 0.42], [0.791, 1.342, -0.015]),
      cbox(0, [1.564, 0.018, 0.42], [0, 1.342, -0.015]),
      cbox(0, [1.564, 0.018, 0.42], [0, 2.182, -0.015]),
      // 背板走 `interior`：透过玻璃直视到的就是它，也是玻璃「透不透」的关键一面。
      cbox(4, [1.564, 0.822, 0.018], [0, 1.36, -0.216]),
      // 中立板 ×2：把上柜分成三格，正对三扇门；透过玻璃能看见右格那一道。
      cbox(4, [0.018, 0.822, 0.396], [-0.264, 1.36, -0.006], { fullOnly: true }),
      cbox(4, [0.018, 0.822, 0.396], [0.264, 1.36, -0.006], { fullOnly: true }),
      // 右格层板：全件里唯一一扇透明门后面看得见的那块（另两格被实心门挡着，不放）。
      // 与中立板一起走 fullOnly —— 柜内细节正是 lite 版该先丢的东西，顶点数也因此拉开差距。
      cbox(4, [0.49, 0.018, 0.396], [0.5275, 1.751, -0.006], { fullOnly: true }),
      // 上柜三扇门：左 / 中两扇是门板，最右一扇是**整扇玻璃**（同一门洞尺寸，整块透明）。
      cbox(2, [0.496, 0.7379, 0.026], [-0.528, 1.4021, 0.212]),
      cbox(2, [0.496, 0.7379, 0.026], [0, 1.4021, 0.212]),
      cbox(3, [0.496, 0.7379, 0.02], [0.528, 1.4021, 0.212])
    ]
  },

  // ── 卧室 / 儿童 / 书房（新增） ───────────────────────────────────────────
  daybed: {
    note: "榻榻米床：低平木台（body）+ 薄垫（upholstery）+ 尾侧圆枕（cushion），兼顾坐卧。",
    size: [1.2, 0.55, 2.0],
    slots: [
      { role: "body", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 木台
      { role: "upholstery", color: 0xfbfaf8, roughness: 0.9, metalness: 0 }, // 1 床垫
      { role: "cushion", color: 0xf3e7d8, roughness: 0.92, metalness: 0 } // 2 靠枕 / 圆枕
    ],
    parts: [
      cbox(0, [1.2, 0.32, 2], [0, 0, 0]),
      croundedBox(1, [1.14, 0.19, 1.94], [0, 0.32, 0], { radius: 0.05 }),
      // 尾挡枕：顶端正好 0.55（0.51 + 0.04）。
      croundedBox(2, [1.1, 0.04, 0.28], [0, 0.51, -0.83], { radius: 0.02 }),
      // 圆枕：横躺的胶囊，压进床垫 4cm（真枕头就是陷下去的）。
      ccapsule(2, 0.04, 1.0, [0, 0.51, 0.66], { rot: [0, 0, 90], align: "center", fullOnly: true }),
      cbox(1, [1.14, 0.02, 0.06], [0, 0.51, 0.94], { fullOnly: true })
    ]
  },
  cot: {
    note: "婴儿床：四柱围栏 + 可睡床板 + 布围，护栏通风不闷（床垫与布围各自独立角色）。",
    size: [0.7, 0.95, 1.35],
    slots: [
      { role: "frame", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 木架 / 四柱
      { role: "upholstery", color: 0xfbfaf8, roughness: 0.9, metalness: 0 }, // 1 床垫
      { role: "fabric", color: 0xf3e7d8, roughness: 0.92, metalness: 0 } // 2 布围
    ],
    parts: [
      // 四根立柱：0.04 见方，立在四角 ⇒ 宽度 0.7、深度 1.35 都由它定。
      ...mirrorPair([
        cbox(0, [0.04, 0.95, 0.04], [0.33, 0, 0.655]),
        cbox(0, [0.04, 0.95, 0.04], [0.33, 0, -0.655])
      ]),
      // 护栏：三面矮栏，留一面开口（大人抱娃那一侧）。
      ...[0.22, 0.42, 0.62].map(railY => cbox(0, [0.62, 0.025, 0.025], [0, railY, 0.655])),
      ...[0.22, 0.42, 0.62].flatMap(railY =>
        mirrorPair(cbox(0, [0.025, 0.025, 1.27], [0.33, railY, 0]))
      ),
      cbox(0, [0.66, 0.03, 1.31], [0, 0.3, 0]),
      croundedBox(1, [0.6, 0.12, 1.25], [0, 0.33, 0], { radius: 0.03 }),
      // 布围：挂在栏内的一圈软包围布。底面原与下面那道护栏的底面（都在 0.42）同向共面
      // （30.3cm²）—— 布围抬起 3mm，仍垂在护栏内、外观不变。
      cbox(2, [0.6, 0.22, 0.02], [0, 0.423, 0.64], { fullOnly: true })
    ]
  },
  computertable: {
    note: "电脑桌：整板台面 + 两侧板 + 背板 + 金属键盘托，靠墙不放腿。",
    size: [1.2, 0.75, 0.6],
    slots: [
      { role: "top", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 台面
      { role: "body", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 1 侧板 / 背板
      { role: "metal", color: 0x9aa1a8, roughness: 0.35, metalness: 0.3 } // 2 键盘托 / 滑轨
    ],
    parts: [
      // 侧板用非居中的 box 写：x 的外缘正好落在 ±0.6（宽度由台面与它共同界定）；
      // 注意非居中时 at 是**占地最小角**，z 要写 -0.275 才是前后居中（写 0.025 会让它整体偏后 0.3）。
      ...mirrorPair(box(1, [0.025, 0.715, 0.55], [-0.6, 0, -0.275])),
      cbox(0, [1.2, 0.035, 0.6], [0, 0.715, 0]),
      cbox(2, [0.7, 0.02, 0.28], [0, 0.6, 0.14], { fullOnly: true }),
      ...mirrorPair(cbox(2, [0.03, 0.02, 0.28], [0.34, 0.6, 0.14], { fullOnly: true })),
      cbox(1, [1.15, 0.4, 0.02], [0, 0.3, -0.29], { fullOnly: true })
    ]
  },
  officestool: {
    note: "办公椅：五星脚（环列 5 份，朝向自动补正）+ 气压柱 + 布艺座面 / 靠背 + 扶手。",
    size: [0.6, 1.0, 0.6],
    slots: [
      { role: "metal", color: 0x454c54, roughness: 0.32, metalness: 0.3 }, // 0 五星脚 / 气压柱
      { role: "leg", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 }, // 1 扶手
      { role: "upholstery", color: 0x3c3f44, roughness: 0.62, metalness: 0.04 } // 2 座面 / 靠背
    ],
    parts: [
      // 五星脚：五角排布在**单轴**上天生不对称 —— 最近轴的那条（|cos| = 0.9877）与次近的（0.8910）
      // 分居同一轴的两侧，于是外缘是 0.9877·d 一侧、0.891·d 另一侧，整圈关于中心偏了 0.048·d。
      // 所以不要让脚架去顶那 0.6 的边界：把 0.6 交给**对称**的扶手（±0.30），脚架缩到它里面
      // （0.9877 × 0.2794 + 0.024 = 0.3000），否则偏心那 1.4cm 会把整件撑到 0.614。
      ...ringOf(5, { radius: 0.1794, startAngle: 45 }, () => [
        cbox(0, [0.045, 0.022, 0.2], [0, 0, 0], { align: "bottom" }),
        ccyl(0, 0.024, 0.05, 10, [0, 0, 0.1], { align: "bottom" })
      ]),
      ccyl(0, 0.026, 0.33, 12, [0, 0.03, 0]),
      croundedBox(2, [0.5, 0.09, 0.48], [0, 0.36, 0], { radius: 0.03 }),
      // 靠背顶端正好 1.0（0.44 + 0.56）。
      croundedBox(2, [0.46, 0.56, 0.09], [0, 0.44, -0.2], { radius: 0.04 }),
      // 扶手：外缘正好 0.30（0.275 + 0.025）、前后各到 ±0.30，这件家具的宽 / 深都由它定
      // （扶手通长的做法在人体工学上也对：手肘前后都要有落点）。
      ...mirrorPair(cbox(1, [0.05, 0.18, 0.6], [0.275, 0.44, 0], { fullOnly: true })),
      croundedBox(2, [0.3, 0.12, 0.08], [0, 0.86, -0.2], { radius: 0.04, fullOnly: true })
    ]
  },
  filecabinet: {
    note: "文件柜：四层抽屉 + 台面，书房与办公室的纸质收纳。",
    size: [0.8, 1.3, 0.45],
    slots: [
      { role: "body", color: 0x3d2818, roughness: 0.6, metalness: 0 }, // 0 柜体
      { role: "drawer", color: 0xd8d6d0, roughness: 0.45, metalness: 0.12 }, // 1 抽屉面
      { role: "metal", color: 0x546235, roughness: 0.4, metalness: 0.2 } // 2 把手
    ],
    parts: [
      cbox(0, [0.8, 1.3, 0.41], [0, 0, -0.02]),
      cbox(1, [0.72, 0.24, 0.025], [0, 0.08, 0.1975]),
      cbox(1, [0.72, 0.24, 0.025], [0, 0.4, 0.1975]),
      cbox(1, [0.72, 0.24, 0.025], [0, 0.72, 0.1975]),
      cbox(1, [0.72, 0.24, 0.025], [0, 1.04, 0.1975]),
      cbox(2, [0.2, 0.02, 0.015], [0, 0.3, 0.2175], { fullOnly: true }),
      cbox(2, [0.2, 0.02, 0.015], [0, 0.62, 0.2175], { fullOnly: true })
    ]
  },
  booktower: {
    note: "简易书架：两侧板 + 五层板，窄身省地方。",
    size: [0.5, 1.6, 0.3],
    slots: [
      { role: "body", color: 0xc49a6c, roughness: 0.68, metalness: 0 }, // 0 侧板
      { role: "shelf", color: 0xe4d5c2, roughness: 0.8, metalness: 0 } // 1 层板
    ],
    parts: [
      cbox(0, [0.025, 1.6, 0.3], [-0.2375, 0, 0]),
      cbox(0, [0.025, 1.6, 0.3], [0.2375, 0, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 0, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 0.4, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 0.8, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 1.2, 0]),
      cbox(1, [0.45, 0.022, 0.28], [0, 1.578, 0]),
      cbox(0, [0.45, 1.55, 0.012], [0, 0.025, -0.144], { fullOnly: true })
    ]
  },

  // ── 影音与桌面设备（新增） ───────────────────────────────────────────────
  gameconsole: {
    note: "游戏主机：卧式圆角机身 + 一对脚条 + 顶面散热槽 + 正面接缝面板与光驱槽。",
    size: [0.3, 0.08, 0.24],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.42, metalness: 0.05 }, // 0 机身
      { role: "grating", color: 0x22252a, roughness: 0.5, metalness: 0.05 }, // 1 散热槽
      { role: "panel", color: 0xe4e4e0, roughness: 0.4, metalness: 0.08 }, // 2 正面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 3 光驱槽 / 指示条
      { role: "leg", color: 0x22252a, roughness: 0.6, metalness: 0.05 } // 4 脚条
    ],
    parts: [
      ...mirrorPair(cbox(4, [0.04, 0.006, 0.16], [0.12, 0, -0.01])),
      croundedBox(0, [0.3, 0.066, 0.208], [0, 0.006, -0.016], { radius: 0.012 }),
      cbox(1, [0.2, 0.008, 0.12], [0, 0.072, -0.02]),
      cbox(2, [0.3, 0.05, 0.012], [0, 0.01, 0.11]),
      cbox(3, [0.16, 0.012, 0.008], [0.05, 0.03, 0.116])
    ]
  },
  avreceiver: {
    note: "功放：矮扁金属机身 + 四只脚 + 顶面散热区 + 正面板（显示窗 + 两只旋钮）。",
    size: [0.44, 0.16, 0.35],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.4, metalness: 0.12 }, // 0 机身
      { role: "grating", color: 0x3c3f44, roughness: 0.55, metalness: 0.06 }, // 1 顶面散热
      { role: "panel", color: 0x2a2c30, roughness: 0.36, metalness: 0.2 }, // 2 正面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 3 显示窗
      { role: "leg", color: 0x15171a, roughness: 0.6, metalness: 0.05 }, // 4 脚
      { role: "metal", color: 0xb4babf, roughness: 0.26, metalness: 0.5 } // 5 旋钮
    ],
    parts: [
      cbox(4, [0.05, 0.006, 0.03], [0.19, 0, 0.15]),
      cbox(4, [0.05, 0.006, 0.03], [-0.19, 0, 0.15]),
      cbox(4, [0.05, 0.006, 0.03], [0.19, 0, -0.15]),
      cbox(4, [0.05, 0.006, 0.03], [-0.19, 0, -0.15]),
      croundedBox(0, [0.44, 0.146, 0.334], [0, 0.006, -0.008], { radius: 0.01 }),
      cbox(1, [0.34, 0.008, 0.22], [0, 0.152, 0]),
      // 显示区与两只旋钮都「坐」在面板上，三件的前表面原本同在 z = 0.175（整片 0.44×0.1
      // 的前脸同向竞争）。改的是**面板**：厚度 16 → 12mm，前表面退到 0.171，
      // 显示区 / 旋钮因此相对面板各探出 4mm —— 占地进深仍由它们定死 0.35，不变。
      cbox(2, [0.44, 0.1, 0.012], [0, 0.02, 0.165]),
      cbox(3, [0.16, 0.04, 0.008], [0.06, 0.06, 0.171]),
      ccyl(5, 0.02, 0.008, 20, [0.19, 0.06, 0.171], { rot: [90, 0, 0] }),
      ccyl(5, 0.02, 0.008, 20, [-0.17, 0.06, 0.171], { rot: [90, 0, 0] })
    ]
  },
  screenpanel: {
    note: "投影幕：顶部卷筒 + 整幅幕布 + 底部配重杆 + 两侧边轨。",
    size: [2.2, 1.25, 0.08],
    slots: [
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.35 }, // 0 卷筒 / 配重杆 / 边轨
      { role: "lit", color: 0xf3f1ec, roughness: 0.85, metalness: 0 } // 1 幕布
    ],
    parts: [
      cbox(0, [2.14, 0.04, 0.028], [0, 0, 0]),
      ...mirrorPair(cbox(0, [0.03, 1.12, 0.02], [1.085, 0.04, 0], { fullOnly: true })),
      cbox(1, [2.14, 1.12, 0.008], [0, 0.04, 0]),
      cbox(0, [2.2, 0.09, 0.08], [0, 1.16, 0])
    ]
  },

  // ── 电视（按挂装方式三份） ───────────────────────────────────────────────
  // 电视是唯一一件「整件尺寸由挂装方式决定」的物件，运行侧那套比例是硬约束：
  //   computeTelevisionBodyMetrics 给出**机身高度带**（挂装 0…0.92 整件即机身、座装 0.4048…0.92、
  //   移动支架 0.84475…1.51125），屏幕（海报贴图 + 外发光）由运行侧画在这条带的正中偏前；
  //   studio-app 的 item 进深也按挂装档位拨（挂装 60mm / 座装 180mm / 移动 550mm）。
  // 三份规格因此必须逐值对上：机身高度带 = 上面那三段的起止、进深 = 三档标称值、
  // 机身前脸 = 屏幕要贴的那个面（运行侧会实测，见 measureTelevisionBodyFrontZ）。
  // 机身本体三份完全同构（60mm 薄背板 + 一圈 8mm 回边嵌着屏幕 + 背面挂架），差别只在支架：
  // 挂装靠挂架、座装是底板立杆、移动支架是脚轮底盘加立杆推手。
  tv_standard: {
    note: "壁挂电视：60mm 机身背板 + 一圈回边（屏幕嵌在其中）+ 背面挂架方板。没有落地件，抬高由物件的离地高度给。",
    size: [1.5, 0.92, 0.06],
    slots: [
      { role: "body", color: 0x2a2c30, roughness: 0.46, metalness: 0.1 }, // 0 机身背板
      { role: "trim", color: 0x3f4247, roughness: 0.34, metalness: 0.18 }, // 1 回边（屏幕外框）
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 } // 2 背面挂架
    ],
    parts: [
      // 机身进深 0.044（-0.020…0.024），回边 7mm 贴在它前面 1mm（0.023…0.030），
      // 挂架再往机身背后 1mm 搭住（-0.030…-0.019）—— 六面总深正好 0.06，且没有共面的面。
      //
      // 机身四周各收 1mm（1.5 × 0.92 → 1.498 × 0.918）：原来机身与回边四边**完全等宽等高**，
      // 于是「机身顶面 / 底面 / 两侧面」与回边的同侧外表面两两同向共面（各 13.8 / 8cm²）。
      // 收 1mm 之后整件的极值面全部由回边提供，尺寸不变、外观不变。
      cbox(0, [1.498, 0.918, 0.044], [0, 0.001, 0.002]),
      cbox(1, [1.5, 0.0276, 0.007], [0, 0, 0.0265]),
      cbox(1, [1.5, 0.0276, 0.007], [0, 0.8924, 0.0265]),
      ...mirrorPair(cbox(1, [0.02625, 0.8648, 0.007], [0.736875, 0.0276, 0.0265])),
      cbox(2, [0.5, 0.4, 0.011], [0, 0.26, -0.0245], { fullOnly: true })
    ]
  },
  tv_tabletop: {
    note: "座装电视：底板 + 立杆 + 颈部托板（都在机身下缘以下）+ 60mm 机身与回边（机身顶到整件高度）。",
    size: [1.5, 0.92, 0.18],
    slots: [
      { role: "base", color: 0x2a2c30, roughness: 0.4, metalness: 0.22 }, // 0 底板
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 1 立杆 / 颈部托板
      { role: "body", color: 0x2a2c30, roughness: 0.46, metalness: 0.1 }, // 2 机身背板
      { role: "trim", color: 0x3f4247, roughness: 0.34, metalness: 0.18 } // 3 回边
    ],
    parts: [
      // 底板与立杆撑起 0.4048 的机身下缘；底板正好占满 0.18 的进深（±0.09）。
      croundedBox(0, [0.5, 0.03, 0.18], [0, 0, 0], { radius: 0.01 }),
      cbox(1, [0.07, 0.3748, 0.05], [0, 0.03, -0.06]),
      cbox(1, [0.22, 0.05, 0.06], [0, 0.4048, -0.05]),
      cbox(2, [1.498, 0.5132, 0.044], [0, 0.4064, 0.002]),
      cbox(3, [1.5, 0.015456, 0.007], [0, 0.4048, 0.0265]),
      cbox(3, [1.5, 0.015456, 0.007], [0, 0.904544, 0.0265]),
      ...mirrorPair(cbox(3, [0.02625, 0.484288, 0.007], [0.736875, 0.420256, 0.0265]))
    ]
  },
  tv_mobile: {
    note: "移动支架电视：四只脚轮 + 底盘 + 立杆（升到顶、收一条推手横杆）+ 60mm 机身与回边。",
    size: [1.5, 1.55, 0.55],
    slots: [
      { role: "leg", color: 0x22252a, roughness: 0.5, metalness: 0.1 }, // 0 脚轮
      { role: "base", color: 0x2a2c30, roughness: 0.4, metalness: 0.2 }, // 1 底盘
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.42 }, // 2 立杆 / 推手横杆
      { role: "body", color: 0x2a2c30, roughness: 0.46, metalness: 0.1 }, // 3 机身背板
      { role: "trim", color: 0x3f4247, roughness: 0.34, metalness: 0.18 } // 4 回边
    ],
    parts: [
      // 底盘占满 0.55 进深（±0.275），立杆退到机身之后（-0.155…-0.085），机身自 0.84475 起。
      ccyl(0, 0.035, 0.03, 16, [0.22, 0, 0.2]),
      ccyl(0, 0.035, 0.03, 16, [-0.22, 0, 0.2]),
      ccyl(0, 0.035, 0.03, 16, [0.22, 0, -0.2]),
      ccyl(0, 0.035, 0.03, 16, [-0.22, 0, -0.2]),
      croundedBox(1, [0.6, 0.05, 0.55], [0, 0.03, 0], { radius: 0.014 }),
      cbox(2, [0.09, 1.47, 0.07], [0, 0.08, -0.12]),
      cbox(2, [0.24, 0.04, 0.06], [0, 0.84475, -0.10], { fullOnly: true }),
      cbox(2, [0.5, 0.04, 0.05], [0, 1.51, -0.10]),
      cbox(3, [1.498, 0.6645, 0.044], [0, 0.84575, 0.002]),
      cbox(4, [1.5, 0.019995, 0.007], [0, 0.84475, 0.0265]),
      cbox(4, [1.5, 0.019995, 0.007], [0, 1.491255, 0.0265]),
      ...mirrorPair(cbox(4, [0.02625, 0.62651, 0.007], [0.736875, 0.864745, 0.0265]))
    ]
  },
  smartspeaker: {
    note: "智能音箱：底座 + 圆柱网布机身 + 顶部灯环 + 顶盖。",
    size: [0.12, 0.18, 0.12],
    slots: [
      { role: "grating", color: 0xdfeaec, roughness: 0.6, metalness: 0.02 }, // 0 网布机身
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 }, // 1 底座
      { role: "lit", color: 0x5fd08a, roughness: 0.2, metalness: 0 }, // 2 灯环
      { role: "trim", color: 0xe4e4e0, roughness: 0.34, metalness: 0.2 } // 3 顶盖
    ],
    parts: [
      ccyl(1, 0.056, 0.02, 24, [0, 0, 0]),
      ccyl(0, 0.06, 0.14, 28, [0, 0.02, 0]),
      ccyl(2, 0.05, 0.006, 24, [0, 0.16, 0]),
      croundedBox(3, [0.104, 0.014, 0.104], [0, 0.166, 0], { radius: 0.006 })
    ]
  },
  router: {
    note: "路由器：扁平机身 + 两侧散热条 + 正面指示条 + 两根后置天线。",
    size: [0.22, 0.15, 0.16],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.45, metalness: 0.08 }, // 0 机身
      { role: "grating", color: 0x9aa1a8, roughness: 0.3, metalness: 0.3 }, // 1 侧散热条
      { role: "screen", color: 0x5fd08a, roughness: 0.2, metalness: 0.12 }, // 2 指示条
      { role: "metal", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 } // 3 天线
    ],
    parts: [
    croundedBox(0, [0.216, 0.1, 0.15], [0, 0, -0.005], { radius: 0.015 }),
    // 两侧散热格栅的外表面原本与机身侧面同在 x = ±0.11（同向共面，16 / 12.3cm²）。
    // 机身收 2mm 到 ±0.108，格栅（仍是 ±0.11）就成了探出 2mm 的凸条，整件宽度不变。
    ...mirrorPair(cbox(1, [0.008, 0.04, 0.08], [0.106, 0.02, 0])),
      cbox(2, [0.1, 0.012, 0.01], [0, 0.06, 0.075]),
      // 后仰 18°：绕 x 转之后 y / z 的尺寸都变成「投影长度」，所以落位给的 0.08794 是转完之后的底面
      // （0.062 × cos18 + 0.01 × sin18 = 0.06206，正好把总高顶到 0.15）。平板天线用方盒，
      // 圆柱的十二边形截面在旋转后量出来会差零点几毫米。
      ...mirrorPair(cbox(3, [0.016, 0.062, 0.01], [0.07, 0.08794, -0.05], { rot: [-18, 0, 0] }))
    ]
  },
  printer: {
    note: "打印机：机身 + 顶盖 + 正面出纸口 + 右侧控制面板与显示窗。",
    size: [0.4, 0.3, 0.35],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.04 }, // 0 机身
      { role: "top", color: 0x9aa1a8, roughness: 0.3, metalness: 0.3 }, // 1 顶盖
      { role: "grating", color: 0x22252a, roughness: 0.5, metalness: 0.06 }, // 2 出纸口
      { role: "panel", color: 0x31353a, roughness: 0.36, metalness: 0.18 }, // 3 控制面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 4 显示窗
    ],
    parts: [
      croundedBox(0, [0.4, 0.28, 0.334], [0, 0, -0.008], { radius: 0.02 }),
      croundedBox(1, [0.38, 0.02, 0.3], [0, 0.28, -0.008], { radius: 0.008 }),
      cbox(2, [0.3, 0.014, 0.012], [0, 0.1, 0.165]),
      cbox(3, [0.12, 0.05, 0.012], [0.12, 0.02, 0.165], { fullOnly: true }),
      cbox(4, [0.09, 0.03, 0.008], [0.125, 0.03, 0.171])
    ]
  },
  desktop: {
    note: "台式一体机：底座 + 立颈 + 大面板机身 + 屏面 + 底部扬声条 + 背面接口区。",
    size: [0.72, 0.5, 0.32],
    slots: [
      { role: "base", color: 0x9aa1a8, roughness: 0.34, metalness: 0.35 }, // 0 底座
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }, // 1 立颈 / 接口区
      { role: "body", color: 0x434b59, roughness: 0.44, metalness: 0.1 }, // 2 机身 / 边框
      { role: "screen", color: 0x15171a, roughness: 0.18, metalness: 0.1 }, // 3 屏面
      { role: "grating", color: 0x22252a, roughness: 0.7, metalness: 0.04 } // 4 扬声条
    ],
    parts: [
      // 底座就是整件 0.32 进深的顶格件（一体机的脚盘本来就能占满），机身则薄到 36mm，
      // 屏面再从机身面前突 4mm —— 三层各有各的进深，互不同面。
      croundedBox(0, [0.3, 0.02, 0.32], [0, 0, 0], { radius: 0.008 }),
      croundedBox(1, [0.1, 0.14, 0.06], [0, 0.02, -0.05], { radius: 0.02 }),
      cbox(1, [0.16, 0.05, 0.01], [0, 0.22, -0.023], { fullOnly: true }),
      croundedBox(2, [0.72, 0.34, 0.036], [0, 0.16, 0], { radius: 0.01 }),
      cbox(4, [0.6, 0.02, 0.008], [0, 0.167, 0.018]),
      cbox(3, [0.68, 0.29, 0.008], [0, 0.19, 0.018])
    ]
  },
  laptop: {
    note: "笔记本电脑：机身 + 键面 + 触控板 + 转轴 + 后仰 12° 的翻盖（含屏面）。",
    size: [0.36, 0.22, 0.28],
    slots: [
      { role: "body", color: 0x555e6b, roughness: 0.4, metalness: 0.24 }, // 0 机身 / 翻盖壳
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.5 }, // 1 转轴
      { role: "trim", color: 0x434b59, roughness: 0.42, metalness: 0.16 }, // 2 触控板
      { role: "screen", color: 0x15171a, roughness: 0.18, metalness: 0.1 }, // 3 屏面
      { role: "grating", color: 0x22252a, roughness: 0.6, metalness: 0.06 } // 4 键面
    ],
    parts: [
      // 翻盖后仰 12°：落下 / 落位都按**旋转后**的包围盒算，所以这里的 y 是转完之后的底面、
      // z 是转完之后的中心。翻盖背缘落在 -0.1401，与底座前缘 +0.14 一起把 0.28 进深对满。
      croundedBox(0, [0.36, 0.02, 0.202], [0, 0, 0.039], { radius: 0.006 }),
      cbox(4, [0.3, 0.006, 0.11], [0, 0.02, 0.07]),
      cbox(2, [0.1, 0.004, 0.06], [0, 0.02, -0.025]),
      ccyl(1, 0.008, 0.24, 12, [0, 0.018, -0.07], { rot: [0, 0, 90] }),
      // 翻盖与屏面用**方盒**：圆角盒的角被倒掉，绕 x 转 12° 之后量出来的包围盒比标称小
      // 两三毫米（转到的极值点正好落在倒角上），总高就对不上 0.22 了。
      cbox(0, [0.36, 0.196, 0.016], [0, 0.025, -0.1118], { rot: [-12, 0, 0] }),
      cbox(3, [0.33, 0.175, 0.008], [0, 0.0386, -0.1001], { rot: [-12, 0, 0] })
    ]
  },
  nas: {
    note: "网络存储：四只脚 + 立式机身 + 正面四个盘位（各带指示灯条）+ 右下显示窗 + 侧散热条。",
    size: [0.28, 0.34, 0.24],
    slots: [
      { role: "body", color: 0x2a2c30, roughness: 0.42, metalness: 0.14 }, // 0 机身
      { role: "drawer", color: 0x3c3f44, roughness: 0.46, metalness: 0.1 }, // 1 盘位
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 2 显示窗
      { role: "lit", color: 0x5fd08a, roughness: 0.2, metalness: 0 } // 3 指示灯条
    ],
    parts: [
      cbox(0, [0.04, 0.012, 0.03], [0.11, 0, 0.09]),
      cbox(0, [0.04, 0.012, 0.03], [-0.11, 0, 0.09]),
      cbox(0, [0.04, 0.012, 0.03], [0.11, 0, -0.09]),
      cbox(0, [0.04, 0.012, 0.03], [-0.11, 0, -0.09]),
      croundedBox(0, [0.28, 0.328, 0.232], [0, 0.012, -0.004], { radius: 0.01 }),
      cbox(1, [0.24, 0.055, 0.008], [0, 0.05, 0.116]),
      cbox(1, [0.24, 0.055, 0.008], [0, 0.118, 0.116]),
      cbox(1, [0.24, 0.055, 0.008], [0, 0.186, 0.116]),
      cbox(1, [0.24, 0.055, 0.008], [0, 0.254, 0.116]),
      cbox(2, [0.06, 0.03, 0.008], [0.08, 0.014, 0.116]),
      ...mirrorPair(cbox(3, [0.008, 0.3, 0.006], [0.136, 0.02, 0.113], { fullOnly: true })),
      ...mirrorPair(cbox(0, [0.008, 0.2, 0.1], [0.136, 0.09, -0.02], { fullOnly: true }))
    ]
  },

  // ── 环境电器 ─────────────────────────────────────────────────────────────
  // 这一族覆盖吊顶件（吊扇 / 天花机）与落地件（风扇 / 取暖器 / 除湿机 / 加湿器）两类。
  // 吊顶件的模型原点仍按「占地底面」约定：y = 0 是整件最低的那条边（吊扇是灯罩底、天花机是
  // 面板下沿），这样运行侧把它们贴到吊顶面时，仍是同一套接地/贴顶逻辑，不必为吊顶件开特例。
  ceilingfan: {
    note: "吊扇：吊杆与吸顶罩 + 电机壳 + 四片十字扇叶 + 底部灯罩。",
    size: [1.1, 0.4, 1.1],
    slots: [
      { role: "body", color: 0xd0d0c9, roughness: 0.5, metalness: 0.08 }, // 0 电机壳 / 扇叶
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 }, // 1 吊杆
      { role: "trim", color: 0xfafaf8, roughness: 0.46, metalness: 0.06 }, // 2 吸顶罩
      { role: "lit", color: 0xf2e6c8, roughness: 0.6, metalness: 0 } // 3 灯罩
    ],
    parts: [
      // 四片扇叶成十字：每片长 0.39、外沿正好落在 ±0.55，宽与深同时被顶满（1.10 × 1.10）。
      // 三叶成 120° 时外沿只到 0.825 × 0.952，凑不出方形占地 —— 改四叶是有意的。
      cbox(0, [0.39, 0.012, 0.15], [0.355, 0.264, 0]),
      cbox(0, [0.39, 0.012, 0.15], [-0.355, 0.264, 0]),
      cbox(0, [0.39, 0.012, 0.15], [0, 0.264, 0.355], { rot: [0, 90, 0] }),
      cbox(0, [0.39, 0.012, 0.15], [0, 0.264, -0.355], { rot: [0, 90, 0] }),
      ccyl(0, 0.11, 0.12, 24, [0, 0.16, 0]),
      // 吊杆原与吸顶罩同高（顶面都在 0.40，0.6cm² 的同向共面）：杆顶压到 0.395，埋进吸顶罩里。
      ccyl(1, 0.02, 0.115, 12, [0, 0.28, 0]),
      ccyl(2, 0.09, 0.03, 20, [0, 0.37, 0]),
      ccyl(3, 0.1, 0.1, 20, [0, 0.06, 0]),
      ccyl(3, 0.085, 0.06, 20, [0, 0, 0])
    ]
  },
  heater: {
    note: "取暖器：机身 + 前辐射面板 + 前上部提手与旋钮 / 显示区 + 底部格栅 + 底脚与背挂架。",
    size: [0.6, 0.55, 0.25],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.04 }, // 0 机身
      { role: "leg", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }, // 1 底脚
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 2 前辐射面板
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }, // 3 旋钮 / 背挂架
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 4 显示区
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 }, // 5 提手
      { role: "grating", color: 0x3c3f44, roughness: 0.45, metalness: 0.2 } // 6 下部格栅
    ],
    parts: [
      cbox(1, [0.06, 0.03, 0.2], [-0.24, 0, 0]),
      cbox(1, [0.06, 0.03, 0.2], [0.24, 0, 0]),
      croundedBox(0, [0.6, 0.52, 0.2], [0, 0.03, -0.01], { radius: 0.015 }),
      croundedBox(2, [0.54, 0.44, 0.06], [0, 0.07, 0.09], { radius: 0.01 }),
      cbox(6, [0.5, 0.04, 0.014], [0, 0.1, 0.116]),
      // 旋钮 / 显示区 / 提手都贴在前辐射面板上：前极值 0.125 由这三件与背挂架共同顶住。
      ccyl(3, 0.022, 0.01, 16, [0.2, 0.44, 0.12], { rot: [90, 0, 0], align: "center" }),
      cbox(4, [0.1, 0.04, 0.012], [-0.15, 0.44, 0.119]),
      // 提手原与前辐射面板**同高**（顶面都在 0.51，7cm² 的同向共面）。它下沉 3mm、并且整件
      // 后移 2mm（前面 0.123）—— 后移是为了避开显示区的前表面 0.125：下沉之后两者的 y 区间
      // 交叠了 3mm，若前面仍同在 0.125 就会换一处继续闪。前极值 0.125 由旋钮与显示区撑住。
      cbox(5, [0.16, 0.03, 0.02], [0, 0.477, 0.113]),
      cbox(3, [0.3, 0.3, 0.02], [0, 0.15, -0.115], { fullOnly: true })
    ]
  },
  ceilingac: {
    note: "吸顶空调（天花机）：面板外框 + 四向出风格栅 + 中央金属回风格栅 + 上部机身 + 面板显示区。",
    size: [0.9, 0.3, 0.9],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.05 }, // 0 上部机身
      { role: "panel", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 }, // 1 面板外框
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }, // 2 四向出风格栅
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }, // 3 中央回风格栅
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 4 显示区
    ],
    parts: [
      // 面板下沿 y = 0.012，四向格栅与显示区沉 2mm 露在面板之下 —— y = 0 是整件最低边。
      // 面板与机身都走圆角盒：一是四角不倒角显得太硬，二是圆角分段给了 lite 版可降的顶点
      // （整件全是方盒时 lite 与完整版一样重，预算校验会拦下）。
      croundedBox(1, [0.9, 0.028, 0.9], [0, 0.012, 0], { radius: 0.01 }),
      croundedBox(0, [0.78, 0.26, 0.78], [0, 0.04, 0], { radius: 0.02 }),
      cbox(2, [0.3, 0.014, 0.07], [0, 0, 0.35]),
      cbox(2, [0.3, 0.014, 0.07], [0, 0, -0.35]),
      cbox(2, [0.07, 0.014, 0.3], [0.35, 0, 0]),
      cbox(2, [0.07, 0.014, 0.3], [-0.35, 0, 0]),
      cbox(3, [0.34, 0.014, 0.34], [0, 0, 0]),
      cbox(4, [0.12, 0.014, 0.028], [0.3, 0, 0.43], { fullOnly: true })
    ]
  },
  wallac: {
    note: "壁挂空调内机：机身 + 前面板 + 顶部进风格栅 + 底部导风板 + 显示区 + 背部挂板。",
    size: [0.9, 0.28, 0.22],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 }, // 0 机身
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }, // 1 顶部进风格栅
      { role: "trim", color: 0xd0d0c9, roughness: 0.4, metalness: 0.12 }, // 2 导风板
      { role: "panel", color: 0xfafaf8, roughness: 0.46, metalness: 0.08 }, // 3 前面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 4 显示区
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 } // 5 背部挂板
    ],
    parts: [
      // 机身只到 0.26，顶上 2cm 是进风格栅；深度上前后各留一件（显示区 / 背板）撑到 ±0.11。
      cbox(2, [0.86, 0.03, 0.12], [0, 0, 0.02]),
      croundedBox(0, [0.9, 0.23, 0.18], [0, 0.03, -0.01], { radius: 0.02 }),
      cbox(1, [0.84, 0.02, 0.14], [0, 0.26, -0.01]),
      croundedBox(3, [0.88, 0.16, 0.04], [0, 0.06, 0.07], { radius: 0.008 }),
      cbox(4, [0.12, 0.05, 0.012], [0.28, 0.12, 0.104]),
      cbox(5, [0.7, 0.18, 0.02], [0, 0.06, -0.1], { fullOnly: true })
    ]
  },
  floorac: {
    note: "立式柜机：圆柱机身 + 底座与顶盖 + 前控制面板（显示区）+ 上部出风格栅 + 背面进风格栅。",
    size: [0.42, 1.75, 0.42],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 }, // 0 圆柱机身
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 1 底座
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }, // 2 顶盖
      { role: "panel", color: 0xfafaf8, roughness: 0.46, metalness: 0.08 }, // 3 前控制面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 4 显示区
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 } // 5 出风 / 进风格栅
    ],
    parts: [
      // 机身径 0.21 已经把宽与深顶满。底座与顶盖都比机身小一圈、且各沉 1cm 进机身内部，
      // 免掉「两片同径圆面贴在一起」的共面闪烁。
      ccyl(1, 0.19, 0.09, 28, [0, 0, 0]),
      ccyl(0, 0.21, 1.63, 28, [0, 0.08, 0]),
      ccyl(2, 0.19, 0.05, 28, [0, 1.7, 0]),
      croundedBox(3, [0.2, 1.4, 0.1], [0, 0.25, 0.104], { radius: 0.01 }),
      cbox(4, [0.12, 0.06, 0.012], [0, 1.35, 0.198]),
      cbox(5, [0.16, 0.12, 0.02], [0, 1.55, 0.2]),
      cbox(5, [0.16, 0.8, 0.02], [0, 0.2, -0.2], { fullOnly: true })
    ]
  },
  // ── 清洁机器 ──────────────────────────────────────────────────────────────
  robotvacuum: {
    note: "扫拖机器人 + 自集尘基站：后方是宽体基站（含显示区与充电触片），扁平圆盘停在基站口，机背带激光头与防撞条。",
    size: [0.55, 0.85, 0.5],
    slots: [
      { role: "body", color: 0x3c3f44, roughness: 0.4, metalness: 0.14 }, // 0 基站箱体 / 机器人盘身
      { role: "top", color: 0x565a61, roughness: 0.34, metalness: 0.16 }, // 1 机器人顶盖
      { role: "metal", color: 0x9aa1a8, roughness: 0.28, metalness: 0.42 }, // 2 激光头 / 充电触片
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 3 基站显示区
      { role: "trim", color: 0x8c8f94, roughness: 0.3, metalness: 0.35 } // 4 防撞条
    ],
    parts: [
      // z 的两根极值分给两件：基站后沿 −0.25、机器人前沿 +0.25。盘心因此推到 z = 0.03 —— 这样
      // 盘身只有尾部十几厘米落在基站口内（读作「停进基站」），而不是半个盘子被箱子吞掉。
      croundedBox(0, [0.55, 0.85, 0.2], [0, 0, -0.15], { radius: 0.02 }),
      ccyl(0, 0.22, 0.05, 32, [0, 0, 0.03]),
      ctorus(4, 0.205, 0.013, [0, 0.026, 0.03], { axis: "y", align: "center" }),
      ccyl(1, 0.205, 0.02, 32, [0, 0.05, 0.03]),
      ccyl(2, 0.03, 0.03, 16, [0, 0.07, 0.07]),
      cbox(2, [0.14, 0.02, 0.012], [0, 0.5, -0.044]),
      cbox(3, [0.16, 0.07, 0.012], [0, 0.6, -0.044])
    ]
  },
  vacuumcleaner: {
    note: "立式吸尘器：地刷 + 长杆 + 主机 + 透明尘桶 + 顶部握把。",
    size: [0.28, 1.15, 0.3],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.4, metalness: 0.1 }, // 0 地刷 / 主机
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 }, // 1 长杆
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.05 }, // 2 尘桶
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 }, // 3 握把
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 4 电量显示
    ],
    parts: [
      // 地刷同时管住 x（±0.14）与 z（±0.15）两根极值，机身顶到 1.15。
      cbox(0, [0.28, 0.06, 0.3], [0, 0, 0]),
      ccyl(1, 0.018, 0.85, 12, [0, 0.06, 0]),
      croundedBox(0, [0.14, 0.24, 0.22], [0, 0.86, -0.03], { radius: 0.03 }),
      ccyl(2, 0.05, 0.16, 16, [0, 0.9, 0.04]),
      cbox(3, [0.05, 0.05, 0.16], [0, 1.1, -0.03]),
      cbox(4, [0.08, 0.04, 0.012], [0, 0.99, 0.081], { fullOnly: true })
    ]
  },
  floorwasher: {
    note: "洗地机：地刷 + 长杆 + 机身 + 清水箱（透明）+ 顶部握把。",
    size: [0.3, 1.1, 0.3],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.4, metalness: 0.1 }, // 0 地刷 / 机身
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 }, // 1 长杆
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 }, // 2 握把
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.05 }, // 3 清水箱
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 4 显示区
    ],
    parts: [
      cbox(0, [0.3, 0.07, 0.3], [0, 0, 0]),
      ccyl(1, 0.02, 0.83, 12, [0, 0.07, 0]),
      croundedBox(0, [0.16, 0.15, 0.24], [0, 0.9, 0], { radius: 0.03 }),
      cbox(2, [0.05, 0.05, 0.17], [0, 1.05, -0.02]),
      // 清水箱从机身前面凸出到 z = 0.15，与地刷同为最前面 —— 两者 y 相差近 1m，不会同面。
      croundedBox(3, [0.1, 0.16, 0.04], [0, 0.86, 0.13], { radius: 0.01 }),
      // 显示区原与清水箱逐面齐平（x ±0.05 各 1.6~2.2cm²、顶面 1.02 共 4.7cm² —— 都是同向共面）：
      // 四周各收 2mm / 4mm，屏就完全落在箱体内（它本来就是透过透明箱体看到的那块屏）。
      cbox(4, [0.092, 0.036, 0.012], [0, 0.982, 0.126], { fullOnly: true })
    ]
  },
  dryingrack: {
    note: "电动晾衣架：吸顶机身（含灯带与显示区）+ 四根吊绳 + 两根晾衣横杆。",
    size: [1.8, 0.5, 0.35],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.5, metalness: 0.05 }, // 0 顶壳 / 后固定板
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.35 }, // 1 横杆 / 吊绳
      { role: "lit", color: 0xf2e6c8, roughness: 0.6, metalness: 0 }, // 2 灯带
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 3 显示区
    ],
    parts: [
      // 地面在横杆底面（吸顶件的模型原点仍按「占地底面」约定落在最低那根杆上）。顶壳管 x ±0.9 与 y 顶 0.5。
      cbox(1, [1.7, 0.024, 0.024], [0, 0, 0.12]),
      cbox(1, [1.7, 0.024, 0.024], [0, 0, -0.12]),
      cbox(1, [0.008, 0.376, 0.008], [-0.75, 0.024, 0.12], { fullOnly: true }),
      cbox(1, [0.008, 0.376, 0.008], [0.75, 0.024, 0.12], { fullOnly: true }),
      cbox(1, [0.008, 0.376, 0.008], [-0.75, 0.024, -0.12], { fullOnly: true }),
      cbox(1, [0.008, 0.376, 0.008], [0.75, 0.024, -0.12], { fullOnly: true }),
      croundedBox(0, [1.8, 0.1, 0.34], [0, 0.4, 0], { radius: 0.012 }),
      // 后固定板把 z 的后极值推到 −0.175（顶壳本身是 ±0.17），显示区把前极值推到 +0.175。
      cbox(0, [1.7, 0.08, 0.02], [0, 0.41, -0.165]),
      cbox(2, [1.5, 0.012, 0.08], [0, 0.388, 0]),
      cbox(3, [0.14, 0.03, 0.012], [0.6, 0.435, 0.169])
    ]
  },
  airer: {
    note: "阳台落地晾衣杆：底板 + 两侧支架 + 主杆 + 两根次杆 + 挂钩。",
    size: [1.2, 0.3, 0.3],
    slots: [
      { role: "body", color: 0xb4babf, roughness: 0.3, metalness: 0.35 }, // 0 底板 / 支架
      { role: "metal", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }, // 1 主杆 / 次杆
      { role: "handle", color: 0x546235, roughness: 0.4, metalness: 0.2 } // 2 挂钩
    ],
    parts: [
      cbox(0, [1.2, 0.02, 0.3], [0, 0, 0]),
      cbox(0, [0.03, 0.28, 0.26], [-0.585, 0.02, 0]),
      cbox(0, [0.03, 0.28, 0.26], [0.585, 0.02, 0]),
      ccyl(1, 0.015, 1.18, 12, [0, 0.28, 0], { rot: [0, 0, 90], align: "center" }),
      ccyl(1, 0.008, 1.1, 10, [0, 0.2, 0.07], { rot: [0, 0, 90], align: "center", fullOnly: true }),
      ccyl(1, 0.008, 1.1, 10, [0, 0.2, -0.07], { rot: [0, 0, 90], align: "center", fullOnly: true }),
      ccyl(2, 0.008, 0.06, 8, [0.12, 0.28, 0], { rot: [0, 0, 90], align: "center", fullOnly: true })
    ]
  },
  garmentcare: {
    note: "衣物护理机：柜体 + 整幅玻璃门 + 竖拉手 + 门上控制面板（显示区）+ 顶帽 + 踢脚与出风格栅。",
    size: [0.6, 1.85, 0.6],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 柜体 / 顶帽
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 1 踢脚
      { role: "door", color: 0xc6cbd1, roughness: 0.3, metalness: 0.22 }, // 2 门框
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 }, // 3 门玻璃
      { role: "metal", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 }, // 4 竖拉手
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 5 控制面板
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 }, // 6 显示区
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 } // 7 出风格栅
    ],
    parts: [
      // 柜体前面停在 0.27（门框 0.26 起，只搭上 1cm 就够读成「装上去」），门玻璃与拉手再往前，
      // 前面极值 0.30 由显示区与拉手共同顶住。踢脚比柜体缩进 2.5cm，退成一道阴影缝。
      croundedBox(0, [0.6, 1.79, 0.57], [0, 0.06, -0.015], { radius: 0.02 }),
      cbox(1, [0.56, 0.06, 0.45], [0, 0, -0.05]),
      cbox(0, [0.6, 0.06, 0.1], [0, 1.79, 0.25]),
      croundedBox(2, [0.57, 1.6, 0.03], [0, 0.14, 0.275], { radius: 0.008 }),
      croundedBox(3, [0.49, 1.5, 0.012], [0, 0.19, 0.286], { radius: 0.006 }),
      ccyl(4, 0.012, 0.5, 12, [0.225, 1.0, 0.288], { align: "center" }),
      cbox(5, [0.5, 0.07, 0.012], [0, 1.52, 0.292]),
      cbox(6, [0.14, 0.04, 0.012], [0, 1.535, 0.294]),
      cbox(7, [0.35, 0.03, 0.014], [0, 0.025, 0.175], { fullOnly: true })
    ]
  },
  // ── 白色家电：冷藏 / 洗涤 ─────────────────────────────────────────────────
  // 这一族的共性：一个箱体 + 若干块门板 + 控制区 + 五金。分件之所以要拆到「门 / 台面 / 踢脚 /
  // 拉手 / 面板 / 显示区」这一层，是因为不锈钢档位下机身与门板同色、而玻璃视窗与屏不该跟着档位
  // 变（见 studio-material-styles.js 的 steelCombo）—— 整件一个槽位的话，选「银黑」会把玻璃门
  // 也刷成深灰。
  //
  // 尺寸全部**照抄 studio-external-models.js 里这四个类型既有的 scaleBasis**（0.75×1.85×0.72 等）：
  // 这是既有二进制资产的占地，运行侧按它做非等比缩放，规格里的包围盒必须与之逐值相等，
  // 否则成品在场景里会被拉扁 —— 生成器会在尺寸校验那一步拦下。
  //
  // 分件摆放上有一条反复出现的坑：**两块相邻零件的面不要落在同一个坐标上**。踢脚顶面与箱体底面
  // 都写 0.03 会得到一对共面三角形，渲染出来是一片随机闪烁的接缝；写成「箱体从 0.02 起」让交界
  // 落在箱体内部就干净了。同理，台面比箱体略宽一点点（箱体 0.596、台面 0.600），避免侧面共面。
  fridge: {
    note: "上下双门冰箱：箱体 + 冷藏门 + 冷冻门 + 中缝压条 + 两支横拉手 + 门内显示区 + 底部通风格栅。",
    size: [0.75, 1.85, 0.72],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 箱体
      { role: "door", color: 0xc6cbd1, roughness: 0.3, metalness: 0.22 }, // 1 冷藏门 / 冷冻门
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 2 踢脚
      { role: "handle", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 }, // 3 横拉手
      { role: "screen", color: 0x1b1d20, roughness: 0.22, metalness: 0.1 }, // 4 门内显示区
      { role: "metal", color: 0x6d747b, roughness: 0.3, metalness: 0.4 }, // 5 中缝压条
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 } // 6 底部通风格栅
    ],
    parts: [
      // 箱体进深 0.62（z 从 −0.36 到 +0.26），前面 0.06 让给门板、0.04 让给拉手 —— 三件加起来
      // 正好是 scaleBasis 的 0.72，没有一件是「先画大再压回去」。
      // 机身从 0.005 起（高度相应 1.85 → 1.845，顶面仍在 1.85）：原来机身与底座的下表面
      // 都在 y = 0 上，两块朝下的面同向共面 0.17m² —— 冰箱从低角度看底盘那一圈在闪。
      croundedBox(0, [0.75, 1.845, 0.62], [0, 0.005, -0.05], { radius: 0.02 }),
      // 冷藏门 / 冷冻门：两门之间留 0.05 的缝（0.80 → 0.85），中缝压条填在缝里。
      croundedBox(1, [0.735, 0.95, 0.06], [0, 0.85, 0.29], { radius: 0.014 }),
      croundedBox(1, [0.735, 0.75, 0.06], [0, 0.05, 0.29], { radius: 0.014 }),
      cbox(5, [0.735, 0.012, 0.03], [0, 0.819, 0.3]),
      // 拉手贴着各自门板的中缝侧边沿：冷藏门在下沿、冷冻门在上沿，两根合起来才读得出「上下双门」。
      // 这两件是旋转过的圆柱（轴沿 x），y 用 align:"center" 写在轴心高度上。
      ccyl(3, 0.013, 0.4, 14, [0, 0.87, 0.347], { rot: [0, 0, 90], align: "center" }),
      ccyl(3, 0.013, 0.4, 14, [0, 0.77, 0.347], { rot: [0, 0, 90], align: "center" }),
      croundedBox(4, [0.16, 0.05, 0.014], [0.24, 1.695, 0.325], { radius: 0.006 }),
      cbox(2, [0.7, 0.05, 0.5], [0, 0, -0.06]),
      cbox(6, [0.4, 0.03, 0.02], [0, 0.01, 0.265], { fullOnly: true })
    ]
  },
  washer: {
    note: "滚筒洗衣机：箱体 + 台面 + 圆形玻璃舱门 + 侧开把手 + 控制面板 + 洗涤剂抽屉 + 旋钮 + 显示屏。",
    size: [0.6, 0.85, 0.65],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 箱体
      { role: "top", color: 0xc6cbd1, roughness: 0.3, metalness: 0.26 }, // 1 台面
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 2 踢脚
      { role: "door", color: 0xc6cbd1, roughness: 0.28, metalness: 0.3 }, // 3 舱门圈
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 }, // 4 舱门玻璃
      { role: "handle", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 }, // 5 舱门把手
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 6 控制面板
      { role: "drawer", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 7 洗涤剂抽屉
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 }, // 8 显示区
      { role: "metal", color: 0x8c8f94, roughness: 0.28, metalness: 0.45 } // 9 程序旋钮
    ],
    parts: [
      // 台面是整机最宽 / 最深的一件（0.60 × 0.65），箱体因此收到 0.596 / 0.62 ——
      // 台面盖在箱体上，侧面与背面都留出半个毫米，避免共面接缝。
      croundedBox(1, [0.6, 0.03, 0.65], [0, 0.82, 0], { radius: 0.01 }),
      croundedBox(0, [0.596, 0.81, 0.62], [0, 0.02, -0.015], { radius: 0.02 }),
      cbox(2, [0.56, 0.03, 0.52], [0, 0, -0.03]),
      // 舱门：立起来朝向观察者的环（axis z）+ 环内的玻璃盘。环外沿顶到 z = 0.325（整机最前面），
      // 于是「玻璃面与门圈齐平」，和实物一致。环与盘都是「轴心定位」，y 走 align:"center"。
      ctorus(3, 0.215, 0.03, [0, 0.42, 0.295], { axis: "z", align: "center" }),
      ccyl(4, 0.195, 0.02, 28, [0, 0.42, 0.286], { rot: [90, 0, 0], align: "center" }),
      cbox(5, [0.03, 0.16, 0.035], [0.245, 0.34, 0.3]),
      // 控制区：面板占右 2/3、洗涤剂抽屉占左 1/3，两者在 x 上错开、不叠，因此可以共用同一条
      // 前表面而不打架。
      cbox(6, [0.34, 0.1, 0.03], [0.12, 0.71, 0.3]),
      cbox(7, [0.18, 0.1, 0.03], [-0.2, 0.71, 0.3]),
      cbox(8, [0.11, 0.045, 0.014], [0.045, 0.7375, 0.315]),
      ccyl(9, 0.028, 0.03, 16, [0.19, 0.76, 0.31], {
        rot: [90, 0, 0],
        align: "center",
        fullOnly: true
      })
    ]
  },
  dryer: {
    note: "滚筒干衣机：与洗衣机同箱体，但门是方形大视窗 + 侧开长把手，控制区换成旋钮与出风格栅。",
    size: [0.6, 0.85, 0.65],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 箱体
      { role: "top", color: 0xc6cbd1, roughness: 0.3, metalness: 0.26 }, // 1 台面
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 2 踢脚
      { role: "door", color: 0xc6cbd1, roughness: 0.28, metalness: 0.3 }, // 3 方门
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 }, // 4 视窗玻璃
      { role: "handle", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 }, // 5 侧开把手
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 6 控制面板
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 }, // 7 出风格栅
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 }, // 8 显示区
      { role: "metal", color: 0x8c8f94, roughness: 0.28, metalness: 0.45 } // 9 程序旋钮
    ],
    parts: [
      croundedBox(1, [0.6, 0.03, 0.65], [0, 0.82, 0], { radius: 0.01 }),
      // 机身正面 0.295 与玻璃门背面**重合**（玻璃是 DoubleSide，背面剔不掉，327.6cm² 在闪）。
      // 机身收 3mm（0.62 → 0.617 深）：整机进深 0.65 由顶板与门板前脸两头定死，机身不是极值面。
      croundedBox(0, [0.596, 0.81, 0.617], [0, 0.02, -0.0165], { radius: 0.02 }),
      cbox(2, [0.56, 0.03, 0.52], [0, 0, -0.03]),
      // 方门比舱门圈「薄而宽」，玻璃比门面再凸出 0.015 —— 凸出而不是凹陷，是为了让两块面不共面。
      // 拉手右缘原本与门板右缘同在 x = 0.25：拉手收 3mm（中心 0.232），门板不动。
      croundedBox(3, [0.5, 0.54, 0.05], [0, 0.16, 0.285], { radius: 0.02 }),
      croundedBox(4, [0.36, 0.36, 0.03], [0, 0.26, 0.31], { radius: 0.015 }),
      cbox(5, [0.03, 0.22, 0.04], [0.232, 0.33, 0.3]),
      cbox(6, [0.34, 0.09, 0.03], [0.12, 0.725, 0.3]),
      cbox(7, [0.2, 0.09, 0.03], [-0.19, 0.725, 0.3]),
      cbox(8, [0.11, 0.045, 0.014], [0.045, 0.7475, 0.315]),
      ccyl(9, 0.028, 0.03, 16, [0.19, 0.77, 0.31], {
        rot: [90, 0, 0],
        align: "center",
        fullOnly: true
      })
    ]
  },
  dishwasher: {
    note: "嵌入式洗碗机：薄顶板 + 箱体 + 整幅门板 + 通长拉手 + 顶部控制条 + 显示区。",
    size: [0.6, 0.82, 0.6],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 箱体
      { role: "top", color: 0xc6cbd1, roughness: 0.3, metalness: 0.26 }, // 1 薄顶板
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 2 踢脚
      { role: "door", color: 0xc6cbd1, roughness: 0.28, metalness: 0.3 }, // 3 门板
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 4 控制条
      { role: "handle", color: 0x8c8f94, roughness: 0.26, metalness: 0.5 }, // 5 通长拉手
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 } // 6 显示区
    ],
    parts: [
      croundedBox(1, [0.6, 0.02, 0.6], [0, 0.8, 0], { radius: 0.008 }),
      croundedBox(0, [0.6, 0.78, 0.57], [0, 0.02, -0.015], { radius: 0.015 }),
      cbox(2, [0.54, 0.02, 0.48], [0, 0, -0.02]),
      // 门板与顶部控制条在 y 上**分开**（门到 0.69，控制条从 0.69 起）：叠在同一段 y 上又共用
      // 前表面的话，控制条会被门板挡住 —— 这类「看不见的零件」不会报错，只会静默少一块。
      croundedBox(3, [0.58, 0.64, 0.03], [0, 0.05, 0.275], { radius: 0.01 }),
      cbox(4, [0.58, 0.12, 0.03], [0, 0.69, 0.275]),
      cbox(5, [0.5, 0.05, 0.035], [0, 0.635, 0.2825]),
      cbox(6, [0.14, 0.05, 0.014], [0.16, 0.72, 0.293])
    ]
  },

  // ── 厨电与清洁（新增） ───────────────────────────────────────────────────
  // ── 银黑厨电：烤箱 / 蒸烤箱 / 微波炉 / 油烟机 / 集成灶 ───────────────────
  // 五件的共同骨架是「机身 + 玻璃视窗 + 拉手 + 控制条」，差别在门的形式与控制区的排布。
  // 尺寸同样照抄既有 scaleBasis（0.6×0.6×0.55 等），生成器的占地容差是 **1mm**，
  // 因此每根轴都要有零件正好顶到声明值 —— 写法是「先定三根轴的极值各由哪件负责，再往里填」，
  // 而不是先画一圈再压回去。这几条里的极值分工都写在注释里。
  oven: {
    note: "嵌入式烤箱：机身 + 整幅玻璃门 + 门上横向拉手 + 顶部控制条（旋钮 ×2 + 显示屏）。",
    size: [0.6, 0.6, 0.55],
    slots: [
      { role: "body", color: 0x2b2f34, roughness: 0.4, metalness: 0.16 }, // 0 机身
      { role: "door", color: 0x3c4147, roughness: 0.3, metalness: 0.28 }, // 1 门框
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 }, // 2 视窗玻璃
      { role: "panel", color: 0x22262a, roughness: 0.36, metalness: 0.18 }, // 3 控制条
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 }, // 4 横拉手
      { role: "metal", color: 0xb4babf, roughness: 0.26, metalness: 0.45 }, // 5 旋钮
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 6 显示区
    ],
    parts: [
      // 机身负责 x（±0.30）与 y（0→0.60）两根轴的极值，后沿负责 z 的 −0.275。
      croundedBox(0, [0.6, 0.6, 0.47], [0, 0, -0.04], { radius: 0.012 }),
      croundedBox(1, [0.57, 0.46, 0.06], [0, 0.03, 0.215], { radius: 0.01 }),
      croundedBox(2, [0.48, 0.4, 0.012], [0, 0.05, 0.246], { radius: 0.006 }),
      cbox(3, [0.57, 0.09, 0.03], [0, 0.49, 0.21]),
      // 拉手是 z 轴正方向的极值（0.275）—— 嵌入式烤箱的手把本来就该凸出门面最多。
      ccyl(4, 0.012, 0.52, 14, [0, 0.46, 0.263], { rot: [0, 0, 90], align: "center" }),
      ccyl(5, 0.022, 0.025, 16, [-0.2, 0.535, 0.238], {
        rot: [90, 0, 0],
        align: "center",
        fullOnly: true
      }),
      ccyl(5, 0.022, 0.025, 16, [0.2, 0.535, 0.238], {
        rot: [90, 0, 0],
        align: "center",
        fullOnly: true
      }),
      cbox(6, [0.15, 0.04, 0.012], [0, 0.535, 0.228])
    ]
  },
  steamoven: {
    note: "嵌入式蒸烤箱：门为整幅大玻璃，控制条换成左侧大触控屏 + 右侧水箱抽屉。",
    size: [0.6, 0.6, 0.55],
    slots: [
      { role: "body", color: 0x2b2f34, roughness: 0.4, metalness: 0.16 }, // 0 机身
      { role: "door", color: 0x3c4147, roughness: 0.3, metalness: 0.28 }, // 1 门框
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 }, // 2 大视窗
      { role: "panel", color: 0x22262a, roughness: 0.36, metalness: 0.18 }, // 3 控制条
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 4 触控屏
      { role: "drawer", color: 0x3c4147, roughness: 0.3, metalness: 0.28 }, // 5 水箱抽屉
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 } // 6 横拉手
    ],
    parts: [
      croundedBox(0, [0.6, 0.6, 0.47], [0, 0, -0.04], { radius: 0.012 }),
      croundedBox(1, [0.57, 0.44, 0.06], [0, 0.03, 0.215], { radius: 0.01 }),
      croundedBox(2, [0.5, 0.38, 0.012], [0, 0.05, 0.246], { radius: 0.006 }),
      cbox(3, [0.57, 0.11, 0.03], [0, 0.47, 0.21]),
      // 触控屏占左 55%、水箱抽屉占右 45%，两者在 x 上错开 —— 蒸烤箱的水箱正是从右侧抽出来的。
      // 抽屉右缘原与控制条右缘同落在 0.285（7.1cm² 的同向共面）：抽屉收 4mm，右缘退到 0.283。
      cbox(4, [0.31, 0.08, 0.012], [-0.125, 0.485, 0.228]),
      cbox(5, [0.226, 0.09, 0.03], [0.17, 0.48, 0.222]),
      ccyl(6, 0.012, 0.5, 14, [0, 0.44, 0.263], { rot: [0, 0, 90], align: "center" })
    ]
  },
  microwave: {
    note: "台式微波炉：机身 + 左侧大视窗门 + 门边竖拉手 + 右侧竖控制板 + 四个小脚。",
    size: [0.52, 0.32, 0.42],
    slots: [
      { role: "body", color: 0x2b2f34, roughness: 0.4, metalness: 0.16 }, // 0 机身
      { role: "door", color: 0x3c4147, roughness: 0.3, metalness: 0.28 }, // 1 门框
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 }, // 2 视窗
      { role: "panel", color: 0x22262a, roughness: 0.36, metalness: 0.18 }, // 3 控制板
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 }, // 4 竖拉手
      { role: "metal", color: 0x8c8f94, roughness: 0.28, metalness: 0.45 }, // 5 小脚
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 6 显示区
    ],
    parts: [
      // 机身离地 0.02 让给四个小脚，于是 y 的极值分工是「脚占 0、机身顶占 0.32」。
      croundedBox(0, [0.52, 0.3, 0.4], [0, 0.02, -0.01], { radius: 0.01 }),
      ccyl(5, 0.012, 0.02, 10, [-0.22, 0, -0.17], { fullOnly: true }),
      ccyl(5, 0.012, 0.02, 10, [0.22, 0, -0.17], { fullOnly: true }),
      ccyl(5, 0.012, 0.02, 10, [-0.22, 0, 0.17], { fullOnly: true }),
      ccyl(5, 0.012, 0.02, 10, [0.22, 0, 0.17], { fullOnly: true }),
      // 门、控制板、拉手三件的前表面都在 z = 0.21，它们在 x 上互不重叠（门 ≤ 0.11、
      // 拉手贴门右缘、控制板 ≥ 0.12）—— 但**拉手与门是重叠的**：拉手右缘 0.11 正是门的右缘，
      // 底边 0.04 正是门的底边，前表面又同在 0.21，三对同向共面（30.6 + 12.5 + 2.6cm²）。
      // 拉开的是门这一侧：门各收 1~2mm（0.359 × 0.259 × 0.028），比整件最宽最深的机身小得多，
      // 占地与高度都不动；拉手因此相对门探出 1mm、真正读得出来是一根把手。
      croundedBox(1, [0.358, 0.258, 0.028], [-0.071, 0.041, 0.195], { radius: 0.008 }),
      croundedBox(2, [0.28, 0.2, 0.012], [-0.07, 0.06, 0.2], { radius: 0.004 }),
      cbox(3, [0.14, 0.26, 0.03], [0.19, 0.04, 0.195]),
      cbox(4, [0.03, 0.22, 0.045], [0.095, 0.04, 0.1875]),
      cbox(6, [0.1, 0.06, 0.012], [0.19, 0.21, 0.198])
    ]
  },
  rangehood: {
    note: "壁挂油烟机：下罩 + 中罩过渡 + 上部烟道箱 + 前面控制面板 / 进风格栅 / 照明灯 + 油杯。",
    size: [0.9, 0.55, 0.45],
    slots: [
      { role: "body", color: 0xb4babf, roughness: 0.3, metalness: 0.38 }, // 0 罩体三级
      { role: "panel", color: 0x22262a, roughness: 0.36, metalness: 0.18 }, // 1 控制面板
      { role: "grating", color: 0x6d747b, roughness: 0.45, metalness: 0.3 }, // 2 进风格栅
      { role: "lit", color: 0xf6f2e8, roughness: 0.3, metalness: 0.0 }, // 3 照明灯
      { role: "drawer", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 } // 4 油杯
    ],
    parts: [
      // 三级罩体：下罩最宽（管 x ±0.45）也最靠前，中罩收进、烟道箱最窄。z 的三根极值分别是
      // 下罩后排 −0.225、下罩前排 0.21、控制面板 0.225。
      croundedBox(0, [0.9, 0.12, 0.435], [0, 0, -0.0075], { radius: 0.01 }),
      croundedBox(0, [0.62, 0.2, 0.38], [0, 0.1, -0.03], { radius: 0.01 }),
      croundedBox(0, [0.3, 0.27, 0.3], [0, 0.28, -0.06], { radius: 0.01 }),
      cbox(1, [0.34, 0.06, 0.02], [0.24, 0.03, 0.215]),
      cbox(2, [0.3, 0.05, 0.012], [-0.24, 0.035, 0.216]),
      // 灯与格栅在 x 上有一段重叠，因此两者的前表面刻意错开 4mm（0.218 / 0.222），
      // 不共面就不会闪。
      cbox(3, [0.07, 0.02, 0.012], [-0.13, 0.02, 0.212]),
      cbox(3, [0.07, 0.02, 0.012], [0.13, 0.02, 0.212]),
      // 油杯底面不写 0（那是下罩自己的底面），抬高 2mm 避开与罩底共面。
      cbox(4, [0.28, 0.035, 0.05], [0, 0.002, 0.19])
    ]
  },
  integratedstove: {
    note: "集成灶：下柜（双门 + 消毒柜玻璃门）+ 不锈钢灶台 + 后上部烟机段（进风格栅 + 照明灯）+ 双灶头带锅架。",
    size: [0.9, 1.35, 0.6],
    slots: [
      { role: "body", color: 0x2b2f34, roughness: 0.4, metalness: 0.16 }, // 0 柜体 / 烟机段
      { role: "top", color: 0xb4babf, roughness: 0.26, metalness: 0.42 }, // 1 不锈钢灶台
      { role: "door", color: 0x3c4147, roughness: 0.3, metalness: 0.24 }, // 2 柜门 / 消毒柜门
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 }, // 3 消毒柜视窗
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 }, // 4 柜门拉手
      { role: "metal", color: 0x6d747b, roughness: 0.3, metalness: 0.42 }, // 5 灶头 / 锅架
      { role: "grating", color: 0x6d747b, roughness: 0.45, metalness: 0.3 }, // 6 进风格栅
      { role: "lit", color: 0xf6f2e8, roughness: 0.3, metalness: 0.0 }, // 7 照明灯
      { role: "base", color: 0x22262a, roughness: 0.5, metalness: 0.12 } // 8 踢脚
    ],
    parts: [
      // 柜体抬到 0.02，把地面那 2cm 让给踢脚 —— 两者底面若都写 0 就是一对共面三角形。
      cbox(0, [0.9, 1.0, 0.56], [0, 0.02, -0.02]),
      cbox(8, [0.86, 0.06, 0.5], [0, 0, -0.04]),
      // 灶台是全机唯一顶到 z = ±0.30 的一件（后沿给烟机段、前沿给拉手让路，见下）。
      cbox(1, [0.9, 0.04, 0.6], [0, 1.02, 0]),
      cbox(0, [0.9, 0.29, 0.34], [0, 1.06, -0.13]),
      cbox(6, [0.6, 0.08, 0.02], [0, 1.2, 0.045]),
      cbox(7, [0.5, 0.02, 0.02], [0, 1.12, 0.045]),
      ccyl(5, 0.11, 0.03, 20, [-0.22, 1.055, 0.02]),
      ccyl(5, 0.11, 0.03, 20, [0.22, 1.055, 0.02]),
      ctorus(5, 0.1, 0.008, [-0.22, 1.093, 0.02], { axis: "y", align: "center" }),
      ctorus(5, 0.1, 0.008, [0.22, 1.093, 0.02], { axis: "y", align: "center" }),
      croundedBox(2, [0.42, 0.62, 0.03], [-0.22, 0.14, 0.275], { radius: 0.008 }),
      croundedBox(2, [0.42, 0.62, 0.03], [0.22, 0.14, 0.275], { radius: 0.008 }),
      croundedBox(2, [0.42, 0.22, 0.03], [0.22, 0.79, 0.275], { radius: 0.008 }),
      croundedBox(3, [0.4, 0.2, 0.012], [-0.22, 0.8, 0.287], { radius: 0.006 }),
      // 拉手顶到 z = 0.30，与灶台同为整机最前面 —— 但两者 y 相差 1m 以上，不会同面。
      ccyl(4, 0.01, 0.3, 12, [-0.22, 0.72, 0.29], { rot: [0, 0, 90], align: "center" }),
      ccyl(4, 0.01, 0.3, 12, [0.22, 0.72, 0.29], { rot: [0, 0, 90], align: "center" }),
      ccyl(4, 0.01, 0.3, 12, [-0.22, 0.9, 0.29], { rot: [0, 0, 90], align: "center" })
    ]
  },
  // ── 厨房小电器：饭煲 / 消毒柜 / 咖啡机 / 电水壶 ───────────────────────────
  // 这一族全是「坐在台面上的一件小物」：一个圆润或方正的壳 + 一块操作面 + 一支把手。
  // 拆分口径同样只有这几刀 —— 换档位时换的是壳那一片材质，操作面上的屏与五金不动。
  ricecooker: {
    note: "电饭煲：机身 + 顶盖（带蒸汽阀）+ 盖前控制面板（显示区）+ 两侧提手 + 底座。",
    size: [0.28, 0.25, 0.32],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.42, metalness: 0.06 }, // 0 机身
      { role: "top", color: 0xfafaf8, roughness: 0.4, metalness: 0.08 }, // 1 顶盖
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 2 底座
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }, // 3 蒸汽阀
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 4 控制面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 5 显示区
      { role: "handle", color: 0xb4babf, roughness: 0.3, metalness: 0.4 } // 6 提手
    ],
    parts: [
      // 提手挂在机身两侧、盖前控制面板从盖前沿往前伸 —— 宽 0.28 与深 0.32 分别由这两处顶住，
      // 机身本体只占 0.26 × 0.30，才不会让两个附件都落在包围盒里面看不见。
      croundedBox(2, [0.24, 0.02, 0.28], [0, 0, 0], { radius: 0.008 }),
      croundedBox(0, [0.26, 0.17, 0.30], [0, 0.02, -0.01], { radius: 0.05 }),
      croundedBox(1, [0.24, 0.045, 0.28], [0, 0.19, -0.01], { radius: 0.04 }),
      ccyl(3, 0.018, 0.015, 12, [-0.06, 0.235, -0.07]),
      cbox(4, [0.18, 0.035, 0.016], [0, 0.2, 0.148]),
      cbox(5, [0.1, 0.025, 0.012], [0, 0.205, 0.154]),
      cbox(6, [0.02, 0.03, 0.08], [0.13, 0.1, -0.01]),
      cbox(6, [0.02, 0.03, 0.08], [-0.13, 0.1, -0.01])
    ]
  },
  sterilizer: {
    note: "嵌入式消毒柜：机身 + 玻璃门（含门框与视窗）+ 通长拉手 + 顶部控制条（显示区）+ 下导轨。",
    size: [0.6, 0.65, 0.5],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 机身
      { role: "door", color: 0xc6cbd1, roughness: 0.3, metalness: 0.22 }, // 1 门框
      { role: "glass", color: 0x1b1d20, roughness: 0.16, metalness: 0.08 }, // 2 视窗玻璃
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 }, // 3 通长拉手
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 4 控制条
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 5 显示区
      { role: "shelf", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 } // 6 下导轨
    ],
    parts: [
      cbox(0, [0.6, 0.65, 0.44], [0, 0, -0.03]),
      croundedBox(1, [0.56, 0.44, 0.03], [0, 0.08, 0.205], { radius: 0.008 }),
      croundedBox(2, [0.46, 0.34, 0.016], [0, 0.13, 0.224], { radius: 0.006 }),
      ccyl(3, 0.012, 0.5, 12, [0, 0.3, 0.238], { rot: [0, 0, 90], align: "center" }),
      cbox(4, [0.56, 0.09, 0.03], [0, 0.54, 0.205]),
      cbox(5, [0.14, 0.045, 0.016], [0, 0.565, 0.226]),
      cbox(6, [0.5, 0.02, 0.04], [0, 0.03, 0.2], { fullOnly: true })
    ]
  },
  coffeemaker: {
    note: "半自动咖啡机：机身 + 顶部温杯盘 + 冲煮头与冲煮把手 + 蒸汽棒 + 前接水盘 + 后水箱 + 控制面板（显示区）。",
    size: [0.28, 0.38, 0.35],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.42, metalness: 0.12 }, // 0 机身
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.4 }, // 1 冲煮头 / 蒸汽棒 / 接水盘
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.04 }, // 2 水箱
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 3 控制面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 4 显示区
      { role: "top", color: 0xb4babf, roughness: 0.26, metalness: 0.42 }, // 5 温杯盘
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 } // 6 冲煮把手
    ],
    parts: [
      // 机身前面只到 0.085，冲煮把手从冲煮头伸到 0.175 —— 深度极值由这两件分头顶住。
      // 水箱背面原本与机身背面同在 z = -0.175（同向共面，252cm² 在机身后背上闪）。
      // 机身收 3mm（0.26 → 0.257 深、中心 -0.0435），水箱不动 —— 进深 0.35 由水箱与面板两头定死。
      croundedBox(0, [0.28, 0.36, 0.257], [0, 0, -0.0435], { radius: 0.02 }),
      cbox(5, [0.26, 0.02, 0.24], [0, 0.36, -0.045]),
      cbox(2, [0.22, 0.24, 0.02], [0, 0.06, -0.165]),
      cbox(1, [0.2, 0.05, 0.1], [0, 0.2, 0.08]),
      ccyl(6, 0.014, 0.12, 12, [0, 0.16, 0.115], { rot: [90, 0, 0], align: "center" }),
      cbox(1, [0.22, 0.015, 0.12], [0, 0.04, 0.07]),
      ccyl(1, 0.008, 0.12, 8, [0.115, 0.14, 0.12], { fullOnly: true }),
      cbox(3, [0.16, 0.06, 0.02], [0, 0.28, 0.095]),
      cbox(4, [0.1, 0.03, 0.01], [0, 0.295, 0.11])
    ]
  },
  kettle: {
    note: "电水壶：壶身 + 壶盖与顶珠 + 壶嘴 + 侧把手 + 底座（带开关板与电源线口）。",
    size: [0.2, 0.26, 0.2],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.42, metalness: 0.06 }, // 0 壶身
      { role: "metal", color: 0x9aa1a8, roughness: 0.3, metalness: 0.35 }, // 1 底座 / 壶盖 / 壶嘴
      { role: "handle", color: 0x22252a, roughness: 0.5, metalness: 0.1 }, // 2 把手
      { role: "trim", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }, // 3 顶珠
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 } // 4 开关板 / 线口
    ],
    parts: [
      // 底座径 0.19 已接近整件宽度；壶嘴往 −x 伸到 −0.10、把手往 +x 贴到 +0.10，
      // 宽 0.20 由这两件分头顶住，壶身本身只有 0.15 径。
      ccyl(1, 0.095, 0.02, 24, [0, 0, 0]),
      ccyl(0, 0.075, 0.2, 24, [0, 0.02, 0]),
      ccyl(1, 0.07, 0.025, 24, [0, 0.22, 0]),
      ccyl(3, 0.015, 0.015, 12, [0, 0.245, 0]),
      ccyl(1, 0.018, 0.06, 12, [-0.07, 0.19, 0], { rot: [0, 0, 90], align: "center" }),
      ccyl(2, 0.016, 0.13, 12, [0.084, 0.085, 0]),
      cbox(2, [0.03, 0.02, 0.03], [0.075, 0.205, 0]),
      cbox(4, [0.05, 0.05, 0.008], [0, 0.005, 0.096]),
      cbox(4, [0.04, 0.04, 0.008], [0, 0.005, -0.096], { fullOnly: true })
    ]
  },
  airfryer: {
    note: "空气炸锅：机身 + 顶部控制面板（旋钮与显示区）+ 前抽拉炸篮与篮把手 + 后散热格栅 + 四支防滑脚。",
    size: [0.3, 0.34, 0.34],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.42, metalness: 0.12 }, // 0 机身
      { role: "leg", color: 0x5b6167, roughness: 0.5, metalness: 0.1 }, // 1 防滑脚
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 }, // 2 后散热格栅
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 3 顶部控制面板
      { role: "drawer", color: 0x3c4147, roughness: 0.3, metalness: 0.28 }, // 4 炸篮
      { role: "handle", color: 0xb4babf, roughness: 0.24, metalness: 0.5 }, // 5 篮把手
      { role: "trim", color: 0xb4babf, roughness: 0.26, metalness: 0.45 }, // 6 旋钮
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 } // 7 显示区
    ],
    parts: [
      // 篮把手比炸篮再往前一层：深度 0.34 的前极值在这里，后极值在散热格栅上。
      ccyl(1, 0.012, 0.015, 10, [-0.11, 0, -0.1]),
      ccyl(1, 0.012, 0.015, 10, [0.11, 0, -0.1]),
      ccyl(1, 0.012, 0.015, 10, [-0.11, 0, 0.08]),
      ccyl(1, 0.012, 0.015, 10, [0.11, 0, 0.08]),
      croundedBox(0, [0.3, 0.245, 0.25], [0, 0.015, -0.035], { radius: 0.05 }),
      croundedBox(3, [0.3, 0.08, 0.25], [0, 0.26, -0.035], { radius: 0.03 }),
      croundedBox(4, [0.26, 0.17, 0.06], [0, 0.04, 0.12], { radius: 0.02 }),
      cbox(5, [0.12, 0.03, 0.02], [0, 0.1, 0.16]),
      ccyl(6, 0.022, 0.02, 16, [-0.09, 0.3, 0.1], { rot: [90, 0, 0], align: "center" }),
      cbox(7, [0.09, 0.045, 0.01], [0.05, 0.285, 0.095]),
      cbox(2, [0.2, 0.06, 0.01], [0, 0.06, -0.165], { fullOnly: true })
    ]
  },
  blender: {
    note: "破壁机：底座（含控制面板与显示区）+ 上宽下窄的透明杯身 + 杯盖与量杯盖 + 侧把手 + 后散热格栅。",
    size: [0.22, 0.45, 0.24],
    slots: [
      { role: "body", color: 0x22252a, roughness: 0.45, metalness: 0.1 }, // 0 底座
      { role: "glass", color: 0xdfeaec, roughness: 0.14, metalness: 0.04 }, // 1 杯身
      { role: "trim", color: 0x9aa1a8, roughness: 0.3, metalness: 0.3 }, // 2 杯盖 / 量杯盖
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 3 控制面板
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 4 显示区
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 }, // 5 后散热格栅
      { role: "handle", color: 0x3c3f44, roughness: 0.42, metalness: 0.08 } // 6 把手
    ],
    parts: [
      // 杯身是整件唯一「上宽下窄」的一件（锥形圆柱）：顶径 0.20 与杯盖的 0.22 一起决定宽度。
      // 杯身底与杯盖顶都往前/后各咬 1cm：原来杯身恰好从底座顶面（0.16）起、杯盖恰好从
      // 杯身顶面（0.40）起，两处都是「背靠背共面」。杯身是玻璃（运行侧 DoubleSide、
      // 背面剔不掉），所以这两处照样参与光栅化 —— 杯底与杯盖各一圈在闪。
      // 让杯身两端各埋进相邻件 1cm，外观与高度（0.45）都不变。
      croundedBox(0, [0.2, 0.16, 0.2], [0, 0, 0], { radius: 0.02 }),
      ctaper(1, 0.075, 0.1, 0.26, 20, [0, 0.15, 0]),
      ccyl(2, 0.11, 0.03, 24, [0, 0.4, 0]),
      ccyl(2, 0.035, 0.02, 16, [0, 0.43, 0]),
      cbox(6, [0.02, 0.2, 0.03], [0.1, 0.19, 0]),
      cbox(3, [0.16, 0.05, 0.015], [0, 0.06, 0.1075]),
      cbox(4, [0.1, 0.028, 0.005], [0, 0.07, 0.1175]),
      cbox(5, [0.14, 0.08, 0.01], [0, 0.05, -0.115], { fullOnly: true })
    ]
  },
  // ── 卫浴热水与净水：储水式 / 燃气热水器 / 净水器 ───────────────────────────
  // 这一族的共性是「一个承压或过水的壳体 + 一块操作面 + 若干根接管」，壳体的几何差别很大
  // （卧式圆桶 / 壁挂扁箱 / 立式细塔），但拆分口径一致：壳体、操作面、接管、五金各自成槽，
  // 选档位时换的是壳体那一片颜色，接管与五金始终是钢色。
  storagewaterheater: {
    note: "储水式电热水器：卧式保温桶（两道箍带）+ 前控制盒（旋钮与显示区）+ 顶部进出水管 + 背面挂架 + 底部托板。",
    size: [0.86, 0.48, 0.46],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 保温桶身
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 1 底部托板
      { role: "trim", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 }, // 2 环形箍带
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 3 控制盒
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 }, // 4 显示区
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 } // 5 接管 / 旋钮 / 挂架 / 泄压阀
    ],
    parts: [
      // 桶轴沿 x：径向 0.205 决定高度（托板 0.03 + 0.205×2 = 0.44），桶长 0.86 决定宽度。
      cbox(1, [0.7, 0.03, 0.34], [0, 0, 0]),
      ccyl(0, 0.205, 0.86, 28, [0, 0.235, 0], { rot: [0, 0, 90], align: "center" }),
      // 箍带用「比桶身大 8mm 的薄圆柱」而不是环面：环面的轴只有 y / z 两种，绕出来对不上桶轴。
      ccyl(2, 0.213, 0.02, 28, [-0.26, 0.235, 0], { rot: [0, 0, 90], align: "center" }),
      ccyl(2, 0.213, 0.02, 28, [0.26, 0.235, 0], { rot: [0, 0, 90], align: "center" }),
      // 控制盒从桶身最粗处往前伸到 z = 0.226，显示区再压出 4mm —— 前极值 0.23 由显示区接管。
      cbox(3, [0.22, 0.1, 0.14], [0, 0.235, 0.156]),
      cbox(4, [0.12, 0.05, 0.012], [0, 0.26, 0.224]),
      ccyl(5, 0.022, 0.014, 16, [0.07, 0.21, 0.223], { rot: [90, 0, 0], align: "center" }),
      // 接管坐在桶顶（y = 0.44）上，顶到 0.48 —— 高度极值在这里。
      ccyl(5, 0.018, 0.04, 12, [-0.2, 0.44, 0]),
      ccyl(5, 0.018, 0.04, 12, [0.2, 0.44, 0]),
      cbox(5, [0.5, 0.05, 0.035], [0, 0.235, -0.2125], { fullOnly: true }),
      ccyl(5, 0.012, 0.02, 12, [0.3, 0.235, 0.212], { rot: [90, 0, 0], align: "center", fullOnly: true })
    ]
  },
  gaswaterheater: {
    note: "燃气热水器：壁挂扁箱 + 前面板 + 上凸控制条（旋钮与显示区）+ 顶部排烟管 + 底部接管 + 进风格栅。",
    size: [0.42, 0.72, 0.22],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 机身
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 1 前面板 / 控制条
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 }, // 2 显示区
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }, // 3 排烟管 / 旋钮 / 接管
      { role: "grating", color: 0x5b6167, roughness: 0.45, metalness: 0.3 } // 4 进风格栅
    ],
    parts: [
      // 机身只到 0.66，顶部留 6cm 给排烟管 —— 0.72 的高度极值落在管口。
      // 机身正面 0.09 与下面板正面**齐平**（同向共面 850cm²，整片正面在闪）：机身收 3mm 进深，
      // 面板因此相对机身凸出 1.5mm；整机进深 0.22 由机身背面与面板正面两头定死，不变。
      croundedBox(0, [0.42, 0.66, 0.197], [0, 0, -0.0115], { radius: 0.015 }),
      ccyl(3, 0.045, 0.06, 16, [0, 0.66, 0]),
      croundedBox(1, [0.38, 0.5, 0.03], [0, 0.1, 0.075], { radius: 0.01 }),
      // 控制条比前面板多凸 2cm，深度极值 0.11 由它 + 旋钮外壳撑住。
      // 但它原来与显示区、旋钮的前表面同在 0.11（同向共面 34.7 + 0.8cm²）：控制条收到 0.105，
      // 显示区 / 旋钮就成了凸出 5mm 的两件 —— 深度极值仍由它们撑住，0.22 不变。
      cbox(1, [0.36, 0.09, 0.045], [0, 0.565, 0.0825]),
      cbox(2, [0.14, 0.05, 0.012], [-0.09, 0.61, 0.104]),
      ccyl(3, 0.02, 0.012, 16, [0.1, 0.61, 0.104], { rot: [90, 0, 0], align: "center" }),
      cbox(4, [0.3, 0.03, 0.014], [0, 0.05, 0.086], { fullOnly: true }),
      ccyl(3, 0.014, 0.02, 10, [-0.12, 0.03, 0.1], { rot: [90, 0, 0], align: "center", fullOnly: true }),
      ccyl(3, 0.014, 0.02, 10, [0.12, 0.03, 0.1], { rot: [90, 0, 0], align: "center", fullOnly: true })
    ]
  },
  waterpurifier: {
    note: "立式净水机：机身 + 下储水门 + 中部滤芯视窗 + 出水嘴与接水盘 + 控制面板（显示区）+ 底座与顶盖。",
    size: [0.3, 1.2, 0.3],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 机身
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }, // 1 出水嘴 / 接水盘
      { role: "door", color: 0xc6cbd1, roughness: 0.3, metalness: 0.22 }, // 2 储水门
      { role: "panel", color: 0x2b2f34, roughness: 0.36, metalness: 0.16 }, // 3 控制面板
      { role: "screen", color: 0x1b1d20, roughness: 0.2, metalness: 0.1 }, // 4 显示区
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 5 底座
      { role: "trim", color: 0x8c8f94, roughness: 0.3, metalness: 0.4 }, // 6 顶盖
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 } // 7 滤芯视窗
    ],
    parts: [
      // 机身进深 0.28（z 到 +0.13），接水盘 / 储水门 / 面板分别顶到 +0.15 —— 三处同深但 y 不重叠。
      // 机身 1.19 高、从 0.005 起：底座（0 ~ 0.03）与顶盖（1.16 ~ 1.20）各埋住机身一端。
      // 原来机身是 0 ~ 1.20，与底座的下表面（0）和顶盖的上表面（1.20）各自齐平 ——
      // 那两片都是 0.26×0.24 的同向共面，从下往上看、从正上方看都在闪。
      croundedBox(0, [0.3, 1.19, 0.28], [0, 0.005, -0.01], { radius: 0.02 }),
      cbox(5, [0.26, 0.03, 0.24], [0, 0, -0.01]),
      croundedBox(6, [0.28, 0.04, 0.26], [0, 1.16, -0.01], { radius: 0.01 }),
      croundedBox(2, [0.26, 0.42, 0.03], [0, 0.18, 0.135], { radius: 0.008 }),
      cbox(1, [0.16, 0.012, 0.1], [0, 0.7, 0.1]),
      ccyl(1, 0.012, 0.06, 12, [0, 0.75, 0.1]),
      cbox(3, [0.24, 0.1, 0.026], [0, 0.88, 0.135]),
      cbox(4, [0.14, 0.05, 0.012], [0, 0.91, 0.144]),
      cbox(7, [0.12, 0.12, 0.012], [0, 1.02, 0.144], { fullOnly: true })
    ]
  },
  pipelinewaterpurifier: {
    note: "管线机（壁挂式）：挂板 + 机身与顶盖收口 + 前上黑色面板（显示条）+ 三只出水嘴与接水盘 + 盘面格栅。",
    size: [0.48, 0.68, 0.24],
    slots: [
      { role: "body", color: 0xc6cbd1, roughness: 0.34, metalness: 0.24 }, // 0 机身
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.42 }, // 1 两侧收边
      { role: "screen", color: 0x1b1d20, roughness: 0.18, metalness: 0.12 }, // 2 黑色面板
      { role: "lit", color: 0x6fd0a8, roughness: 0.3, metalness: 0 }, // 3 显示条
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }, // 4 出水嘴 / 接水盘 / 挂板
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 } // 5 盘面格栅
    ],
    parts: [
      // 这是一件**挂墙件**：底面 y=0 就是它的下沿，抬高由物件的离地高度给（默认 1.42m）。
      // 竖向分段自上而下是「面板 0.30…0.62 → 出水嘴 0.23…0.29 → 接水盘 0.10…0.12」：嘴尖到盘面
      // 留 12cm 的接杯净空，这是这类机器唯一一处不能压缩的尺寸。
      // 进深 0.24 由「挂板贴墙的 -0.12」与「接水盘外沿的 +0.12」两头撑满 —— 中间的机身只到
      // -0.11…+0.08，所以是盘子探出机身 4cm，而不是机身自己凑够 0.24（后者会把机器做成一块砖）。
      croundedBox(0, [0.48, 0.66, 0.19], [0, 0, -0.015], { radius: 0.012 }),
      croundedBox(0, [0.46, 0.02, 0.19], [0, 0.66, -0.015], { radius: 0.008 }),
      cbox(1, [0.02, 0.62, 0.01], [0.225, 0.02, 0.087]),
      cbox(1, [0.02, 0.62, 0.01], [-0.225, 0.02, 0.087]),
      // 黑色面板压在机身正面上（机身前面 z=+0.08，面板 0.08…0.092），显示条再压在面板上。
      cbox(2, [0.4, 0.32, 0.012], [0, 0.3, 0.086]),
      cbox(3, [0.14, 0.014, 0.004], [0, 0.315, 0.093]),
      // 出水管嘴挂在同一根横梁下：嘴顶埋进横梁 6mm（避免两面共面闪烁），嘴尖朝下。
      cbox(4, [0.28, 0.022, 0.03], [0, 0.266, 0.09]),
      ccyl(4, 0.011, 0.04, 16, [-0.09, 0.252, 0.09], { align: "center" }),
      ccyl(4, 0.011, 0.04, 16, [0, 0.252, 0.09], { align: "center" }),
      ccyl(4, 0.011, 0.04, 16, [0.09, 0.252, 0.09], { align: "center" }),
      croundedBox(4, [0.32, 0.012, 0.1], [0, 0.1, 0.07], { radius: 0.004 }),
      cbox(5, [0.28, 0.008, 0.08], [0, 0.111, 0.07]),
      cbox(4, [0.3, 0.44, 0.02], [0, 0.1, -0.11], { fullOnly: true })
    ]
  },
  tea_bar_machine: {
    note: "茶吧机：踢脚 + 下柜（玻璃门与门框）+ 台面与接水盘 + 上部瓶仓（背板 / 两侧板）与瓶座 + 取水头（面板 + 两只出水嘴）。",
    size: [0.62, 1.32, 0.48],
    slots: [
      { role: "body", color: 0xf2f1ed, roughness: 0.5, metalness: 0.06 }, // 0 柜体 / 瓶仓围板 / 取水头壳
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 1 踢脚
      { role: "top", color: 0xd8d6d0, roughness: 0.38, metalness: 0.1 }, // 2 台面
      { role: "metal", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }, // 3 瓶座 / 出水嘴 / 接水盘
      { role: "screen", color: 0x1b1d20, roughness: 0.18, metalness: 0.12 }, // 4 控制面板
      { role: "lit", color: 0x6fd0a8, roughness: 0.3, metalness: 0 }, // 5 指示灯条
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }, // 6 盘面格栅
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 }, // 7 玻璃门
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.42 } // 8 门框
    ],
    parts: [
      // 竖向分段：踢脚 0…0.06（内缩 4cm）→ 下柜 0.06…0.86 → 台面 0.86…0.90 → 瓶仓 0.90…1.32。
      // 瓶仓朝前朝上都是敞口（真实茶吧机就是把桶倒插进去、桶身露在外面），所以只有背板 + 两块侧板。
      // 柜体前面刻意退到 +0.225：玻璃门是一扇**凸出柜体**的门（0.226…0.240），门与柜面之间留 1mm，
      // 两面共面就会闪 —— 而整件进深仍是 0.48（后面由柜体后背的 -0.24、前面由台面与门框的 +0.24 撑住）。
      cbox(1, [0.54, 0.06, 0.4], [0, 0, 0]),
      croundedBox(0, [0.62, 0.8, 0.465], [0, 0.06, -0.0075], { radius: 0.012 }),
      croundedBox(2, [0.62, 0.04, 0.48], [0, 0.86, 0], { radius: 0.006 }),
      cbox(7, [0.47, 0.63, 0.008], [0, 0.145, 0.232]),
      cbox(8, [0.54, 0.032, 0.014], [0, 0.784, 0.233]),
      cbox(8, [0.54, 0.032, 0.014], [0, 0.108, 0.233]),
      ...mirrorPair(cbox(8, [0.032, 0.708, 0.014], [0.254, 0.108, 0.233])),
      // 瓶仓：背板与柜体后背齐平，侧板前面收在 +0.20（比柜体浅 2.5cm），仓内因此是一只朝前开的槽。
      // 两块围板的底面在台面顶面（0.90）上 —— 与台面顶面是背靠背（无害）。
      cbox(0, [0.62, 0.42, 0.04], [0, 0.9, -0.22]),
      ...mirrorPair(cbox(0, [0.04, 0.42, 0.44], [0.29, 0.9, -0.02])),
      // 瓶座居中偏后，接水盘压在台面前沿：两者在台面上各占一头，互不叠。
      // 瓶座圆盘（metal）抬起 2mm：它的**下表面**原与上面两块围板的下表面同在 0.90，
      // 两者都朝下 → 2.6cm² 的同向共面。抬起之后圆盘与围板的下表面不再同面，
      // 顶面仍到 0.93（与它上面那层瓶座圈背靠背，本来就成立）。
      ccyl(3, 0.13, 0.028, 24, [0, 0.902, -0.08]),
      ccyl(3, 0.145, 0.012, 24, [0, 0.93, -0.08]),
      croundedBox(3, [0.34, 0.012, 0.14], [0, 0.9, 0.15], { radius: 0.004 }),
      cbox(6, [0.3, 0.008, 0.12], [0, 0.911, 0.15]),
      // 取水头悬在瓶仓前上方（顶面与侧板同为 1.32），嘴尖离盘面 24cm，正好放下一只马克杯。
      cbox(0, [0.44, 0.1, 0.16], [0, 1.22, 0.12]),
      cbox(4, [0.3, 0.07, 0.008], [0, 1.245, 0.205]),
      cbox(5, [0.3, 0.012, 0.004], [0, 1.227, 0.207]),
      ccyl(3, 0.012, 0.04, 16, [-0.09, 1.18, 0.12], { align: "center" }),
      ccyl(3, 0.012, 0.04, 16, [0.09, 1.18, 0.12], { align: "center" })
    ]
  },
  // ── 洁具（陶瓷 / 亚克力 + 五金 + 玻璃三料分件）────────────────────────────
  // 六件走 CERAMIC_STYLES（亮白陶瓷 / 哑光石白 / 岩灰），玻璃隔断走 GLASS_STYLES。
  // 共同的角色分工：**本体**（陶瓷或亚克力，`body`）、**内腔**（缸内 / 盆底 / 内壁，`interior`）、
  // **五金**（龙头 / 混水阀 / 排水 / 进水帽，`metal`）、**篦子**（地漏 / 排水格栅，`grating`）。
  // 台盆另加柜体那四件（`frame` 箱体 / `door` 门板 / `handle` 拉手 / `top` 台面 / `base` 踢脚），
  // 花洒另加 `interior`（底盘内面）—— 这正是「一件洁具其实是三种料」的写法。
  basin: {
    note:
      "洗漱台组合：踢脚 + 柜体与双门拉手 + 石材台面 + 台上陶瓷盆 + 龙头 + 壁挂镜柜（含镜面）。" +
      "声明高度 0.88 只描述落地柜体，镜柜烘在它之上（authoredHeight 1.81）。",
    size: [0.9, 0.88, 0.5],
    // 镜柜顶面 1.81：实物上「台面 0.85 + 镜柜底 1.15 + 镜柜高 0.66」是标准浴室柜组合的位置
    // （镜柜挂高了照不到，挂低了会挡住龙头）。占地（宽 / 深）仍由台面一件撑满，
    // 镜柜比台面窄也比台面浅，不参与包围盒。
    authoredHeight: 1.81,
    slots: [
      { role: "frame", color: 0xb08a5e, roughness: 0.62, metalness: 0 }, // 0 柜体箱 / 镜柜柜体
      { role: "door", color: 0xc09a6c, roughness: 0.56, metalness: 0 }, // 1 双门 / 镜柜门框
      { role: "handle", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }, // 2 拉手
      { role: "top", color: 0xf2f1ed, roughness: 0.34, metalness: 0.03 }, // 3 石材台面
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 }, // 4 陶瓷盆
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 }, // 5 龙头
      { role: "base", color: 0x2e2e30, roughness: 0.5, metalness: 0.14 }, // 6 踢脚
      { role: "mirror", color: 0xdfe7ec, roughness: 0.06, metalness: 0.86 }, // 7 镜面
      { role: "shelf", color: 0xd8b98f, roughness: 0.6, metalness: 0 } // 8 镜柜层板
    ],
    parts: [
      // 台面（0.9 × 0.5）是整件的占地极值：柜体退到 ±0.43 / -0.23…+0.228，门板再贴到 +0.245，
      // 拉手顶到 +0.25 —— 三者同前沿但 y 不重叠，所以不会闪；进深 0.5 由台面一件撑满。
      // 落地部分的高度 0.88 由「龙头立柱顶 0.88」顶住。镜柜是烘在 0.88 之上的附加段，
      // 见 authoredHeight。
      //
      // 这一件里所有「上下相接」处都刻意留 1~1.5cm 的**咬合**（踢脚顶 0.06 咬进柜体、
      // 柜体顶 0.705 咬进台面、盆底与龙头柱底咬进台面）：两块不同料的板严格贴在一起就是一对
      // 共面三角形，渲染时互相争夺同一像素深度 —— 画面上是沿接缝的一条闪动细线，不报错、
      // 只在真场景里闪，肉眼很难归因。咬进去本来就与实物一致（板都是嵌进去的）。
      cbox(6, [0.8, 0.06, 0.42], [0, 0, -0.001]),
      croundedBox(0, [0.86, 0.66, 0.458], [0, 0.045, -0.001], { radius: 0.01 }),
      ...mirrorPair(croundedBox(1, [0.4, 0.56, 0.016], [0.215, 0.08, 0.237], { radius: 0.006 })),
      ...mirrorPair(cbox(2, [0.014, 0.18, 0.024], [0.05, 0.34, 0.238])),
      croundedBox(3, [0.9, 0.04, 0.5], [0, 0.7, 0], { radius: 0.008 }),
      ctaper(4, 0.15, 0.185, 0.14, 28, [0, 0.73, 0]),
      ccyl(5, 0.015, 0.145, 16, [0, 0.735, -0.155]),
      ccyl(5, 0.013, 0.12, 12, [0, 0.855, -0.095], { rot: [90, 0, 0], align: "center" }),
      // ── 壁挂镜柜（0.72 宽 × 0.66 高 × 0.15 深，柜底 1.15 → 顶面 1.81）──────────────
      // 为什么它不是独立物件而是烘在这件里：台盆与镜柜在户型图上永远成对出现在同一面墙上，
      // 分成两件就要摆两次、抬两个高度，且改台面宽度时镜柜不会跟着变宽。烘进来之后
      // 「台盆」这一件就是实物上那一整套洗漱台组合。
      //
      // 进深只取 0.15（镜柜是浅柜，实物 12~18cm）：比台面浅得多，于是从侧面看得到台面外沿
      // 那一圈回边，不会读成「一堵板上开了个盆」。z 上贴住柜体背线（−0.25 → −0.10）。
      //
      // 柜体四块围板全部走 0 号（柜体木料）：**同一种料之间的贴合不算共面重叠**（判据只比
      // 不同材质），所以围板之间的搭接可以放心写「对齐」（底板与侧板同到 1.15 / 1.81 也没事）。
      // 换料的每一件（背板 / 层板 / 门 / 镜面）都相对柜体收进几毫米 —— 与不同料的面严格贴合
      // 才会闪，收进之后既躲开共面、看上去也是正常的安装缝。
      cbox(0, [0.72, 0.66, 0.014], [0, 1.15, -0.243]),
      cbox(0, [0.72, 0.02, 0.15], [0, 1.15, -0.175]),
      cbox(0, [0.72, 0.02, 0.15], [0, 1.79, -0.175]),
      cbox(0, [0.02, 0.66, 0.15], [-0.35, 1.15, -0.175]),
      cbox(0, [0.02, 0.66, 0.15], [0.35, 1.15, -0.175]),
      // 柜内一块层板（镜柜的标准配置：竖着放杯子 / 瓶瓶罐罐），lite 丢掉。
      cbox(8, [0.66, 0.016, 0.126], [0, 1.48, -0.166], { fullOnly: true }),
      // 两扇镜门：各 0.35 宽、中缝 1cm。门比柜体四周各收 5mm 并压进柜体 2mm —— 见上面那条
      // 「换料的件相对柜体收进」的说明。
      cbox(1, [0.345, 0.65, 0.02], [-0.1775, 1.155, -0.092]),
      cbox(1, [0.345, 0.65, 0.02], [0.1775, 1.155, -0.092]),
      // 镜面：嵌在门框里、四周留 3cm 边（实物镜柜的镜子就嵌在门框里，不是满铺一块镜），
      // 背面压进门板 4mm、正面凸出门面 4mm。
      // 镜面（8 号）刻意不借用 glass 角色：那个角色在运行侧被强制 0.28 不透明度，
      // 镜子会变成一块能看穿到墙面的茶色玻璃板。
      cbox(7, [0.285, 0.565, 0.008], [-0.1775, 1.21, -0.082]),
      cbox(7, [0.285, 0.565, 0.008], [0.1775, 1.21, -0.082]),
      // 两枚小圆钮：贴在中缝两侧（镜柜门矮，横拉手会显得笨）。
      ccyl(2, 0.011, 0.02, 14, [-0.03, 1.33, -0.078], { rot: [90, 0, 0], align: "center" }),
      ccyl(2, 0.011, 0.02, 14, [0.03, 1.33, -0.078], { rot: [90, 0, 0], align: "center" })
    ]
  },
  toilet: {
    note: "马桶：落地陶瓷座体 + 后水箱 + 水箱盖（含冲水按钮）+ 座圈与盖板。",
    size: [0.42, 0.52, 0.7],
    slots: [
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 }, // 0 陶瓷座体 / 水箱
      { role: "top", color: 0xf2f0ea, roughness: 0.3, metalness: 0.02 }, // 1 座圈 / 盖板 / 水箱盖
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 } // 2 冲水按钮
    ],
    parts: [
      // 这是**入墙水箱款**（0.52 总高就是坐面高度），水箱只露出后座那一段。
      // 占地：宽 0.42 与深 0.70 都由水箱盖（比水箱四周各探 1cm）撑住 —— 盖板探出箱体是实物做法，
      // 在这里还顺手避开了「箱盖侧面与箱体侧面共面」的闪烁。高度 0.52 落在按钮顶面。
      croundedBox(0, [0.36, 0.36, 0.62], [0, 0, 0.04], { radius: 0.04 }),
      croundedBox(0, [0.4, 0.46, 0.2], [0, 0, -0.24], { radius: 0.025 }),
      croundedBox(1, [0.4, 0.028, 0.46], [0, 0.355, 0.03], { radius: 0.022 }),
      croundedBox(1, [0.4, 0.022, 0.44], [0, 0.383, 0.03], { radius: 0.02 }),
      croundedBox(1, [0.42, 0.065, 0.22], [0, 0.45, -0.24], { radius: 0.012 }),
      ccyl(2, 0.032, 0.01, 20, [0.1, 0.51, -0.24])
    ]
  },
  squattoilet: {
    note: "蹲便器：槽底 + 四周边沿围成的便槽 + 后沿高台（存水弯）+ 排水篦子。",
    size: [0.45, 0.18, 0.65],
    slots: [
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 }, // 0 陶瓷边沿 / 后沿高台
      { role: "interior", color: 0xe7e6e1, roughness: 0.24, metalness: 0.02 }, // 1 槽底
      { role: "grating", color: 0xb4babf, roughness: 0.28, metalness: 0.5 } // 2 排水篦子
    ],
    parts: [
      // 便槽做成「边沿环 + 更低的槽底」，而不是一整块方砖：从上方看才看得见槽（槽底 1 号比
      // 边沿低 3cm）。边沿四根条互相压 1cm，槽底再压进边沿里 —— 全是嵌合，没有一处两面共面。
      croundedBox(1, [0.4, 0.09, 0.62], [0, 0, 0], { radius: 0.03 }),
      croundedBox(0, [0.45, 0.04, 0.06], [0, 0.08, 0.295], { radius: 0.015 }),
      croundedBox(0, [0.45, 0.1, 0.16], [0, 0.08, -0.245], { radius: 0.02 }),
      ...mirrorPair(croundedBox(0, [0.06, 0.04, 0.6], [0.195, 0.08, 0], { radius: 0.015 })),
      cbox(2, [0.14, 0.008, 0.1], [0, 0.088, -0.1])
    ]
  },
  urinal: {
    note: "小便斗：壳体 + 前方边圈围成的腔口 + 腔内面（含排水篦子）+ 顶部进水帽。",
    size: [0.38, 0.72, 0.34],
    slots: [
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 }, // 0 陶瓷壳体 / 边圈
      { role: "interior", color: 0xe7e6e1, roughness: 0.24, metalness: 0.02 }, // 1 腔内面
      { role: "grating", color: 0xb4babf, roughness: 0.28, metalness: 0.5 }, // 2 排水篦子
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 } // 3 进水帽
    ],
    parts: [
      // 挂墙件：底面 y=0 是下沿，抬高由离地高度给（默认 0.38m）。进深 0.34 由「壳体后背 -0.17」
      // 与「边圈前脸 +0.17」撑住；腔口朝 +z，腔内面（1 号）压在腔口后壁上 —— 从正面看进去是
      // 一块比边圈低 1cm 的内壁，读作小便斗的斗腔，而不是一面白墙。
      croundedBox(0, [0.38, 0.66, 0.28], [0, 0, -0.03], { radius: 0.05 }),
      croundedBox(0, [0.38, 0.1, 0.065], [0, 0, 0.1375], { radius: 0.02 }),
      croundedBox(0, [0.38, 0.06, 0.065], [0, 0.6, 0.1375], { radius: 0.02 }),
      ...mirrorPair(croundedBox(0, [0.06, 0.66, 0.065], [0.16, 0, 0.1375], { radius: 0.02 })),
      croundedBox(1, [0.28, 0.52, 0.06], [0, 0.09, 0.13], { radius: 0.04 }),
      cbox(2, [0.1, 0.008, 0.05], [0, 0.11, 0.13]),
      ccyl(3, 0.032, 0.065, 16, [0, 0.655, -0.09])
    ]
  },
  bathtub: {
    note: "浴缸：内缩的缸底 + 一圈缸壁（围出缸口）+ 缸内底 + 排水口与溢流口。",
    size: [1.7, 0.58, 0.78],
    slots: [
      { role: "body", color: 0xf6f6f3, roughness: 0.16, metalness: 0.02 }, // 0 缸底 / 缸壁
      { role: "interior", color: 0xe7e6e1, roughness: 0.24, metalness: 0.02 }, // 1 缸内底
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 } // 2 排水口 / 溢流口
    ],
    parts: [
      // 缸壁（16cm 厚的一圈）比缸底外扩 2cm：侧面看是「下裙内收、缸沿外张」，同时也让两部分
      // 的侧面错开（同面就闪）。缸内底压进缸壁里，只露出中间一块 —— 从上方看进去是 32cm 深的
      // 缸腔，而不是一块实心板。占地 1.7 × 0.78 由缸壁撑住。
      croundedBox(0, [1.66, 0.22, 0.74], [0, 0, 0], { radius: 0.1 }),
      croundedBox(0, [1.54, 0.38, 0.08], [0, 0.2, 0.35], { radius: 0.03 }),
      croundedBox(0, [1.54, 0.38, 0.08], [0, 0.2, -0.35], { radius: 0.03 }),
      ...mirrorPair(croundedBox(0, [0.08, 0.38, 0.62], [0.81, 0.2, 0], { radius: 0.03 })),
      croundedBox(1, [1.58, 0.06, 0.66], [0, 0.2, 0], { radius: 0.06 }),
      ccyl(2, 0.05, 0.008, 20, [0, 0.256, 0]),
      ctorus(2, 0.045, 0.008, [0, 0.44, 0.3], { axis: "z" })
    ]
  },
  shower: {
    note: "花洒：淋浴底盘（含内面与地漏篦子）+ 立柱与墙座 + 顶臂与顶喷 + 混水阀 + 滑座与手持花洒。",
    size: [0.9, 2.1, 0.9],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.3, metalness: 0.04 }, // 0 底盘
      { role: "interior", color: 0xeeeee9, roughness: 0.4, metalness: 0.04 }, // 1 底盘内面
      { role: "grating", color: 0xb4babf, roughness: 0.28, metalness: 0.5 }, // 2 地漏篦子
      { role: "metal", color: 0xbfc6cc, roughness: 0.22, metalness: 0.7 } // 3 立柱 / 顶喷 / 阀 / 花洒
    ],
    parts: [
      // 0.9 × 0.9 的占地在实物上是「淋浴区」，不是花洒本体的尺寸 —— 所以这一件把**底盘**画进来
      // 撑满它（单独一件花洒只占 0.15m 深，平面图与三维就会对不上）。底盘内面比沿口低 1cm、
      // 地漏在靠墙一侧；花洒立面沿墙排在 -z 侧（与其他挂墙件一致：正面朝 +z）。
      croundedBox(0, [0.9, 0.06, 0.9], [0, 0, 0], { radius: 0.03 }),
      croundedBox(1, [0.74, 0.02, 0.74], [0, 0.045, 0], { radius: 0.04 }),
      cbox(2, [0.14, 0.01, 0.14], [0, 0.062, -0.26]),
      ccyl(3, 0.022, 1.55, 16, [0, 0.42, -0.42]),
      cbox(3, [0.06, 0.06, 0.05], [0, 0.42, -0.425]),
      cbox(3, [0.06, 0.06, 0.05], [0, 1.94, -0.425]),
      cbox(3, [0.05, 0.05, 0.44], [0, 1.97, -0.2]),
      ccyl(3, 0.16, 0.08, 28, [0, 2.02, -0.02]),
      cbox(3, [0.26, 0.09, 0.1], [0, 1.02, -0.38]),
      cbox(3, [0.1, 0.06, 0.1], [0, 1.66, -0.37]),
      ccyl(3, 0.018, 0.2, 12, [0.1, 1.62, -0.33], { rot: [20, 0, 0], align: "center" })
    ]
  },
  glasspartition: {
    note: "玻璃隔断：两端立柱 + 上下横梁 + 玻璃面板 + 竖向拉手。",
    size: [1.2, 2, 0.08],
    slots: [
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 }, // 0 玻璃
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.45 }, // 1 立柱 / 横梁
      { role: "handle", color: 0xb4babf, roughness: 0.28, metalness: 0.45 } // 2 拉手
    ],
    parts: [
      // 进深 0.08 由两端立柱（50 × 80mm）撑满；玻璃 12mm 居中，比立柱薄得多，两侧都不与柱面共面。
      // 横梁伸进立柱 2cm（而不是刚好对齐），正是为了避开「梁端面与柱面共面」那类闪烁。
      cbox(0, [1.12, 1.92, 0.012], [0, 0.035, 0]),
      ...mirrorPair(cbox(1, [0.05, 2, 0.08], [0.575, 0, 0])),
      cbox(1, [1.14, 0.04, 0.04], [0, 0, 0]),
      ccyl(2, 0.012, 0.3, 12, [0.42, 0.9, 0.02], { fullOnly: true })
    ]
  },
  // ── 装饰灯具 ──────────────────────────────────────────────────────────────
  // 两件灯都是 APPLIANCE_PALETTE_ITEM_TYPES 的成员，槽位号沿用既有资产的约定，好在**自动档**
  // （未选风格）下仍与旧外观对得上：落地灯的 3 号槽是罩体（暖色主题给 applianceSoft），其余归
  // 暖木色（floorLampBody）；壁灯的 2 号槽在暖色主题里给 accent。选了风格之后一律按角色取配方，
  // 槽位号不再参与（见 studio-material-styles.js 的 LAMP_STYLES）。
  floorlamp: {
    note: "落地灯（悬臂款）：配重底板 + 立柱 + 顶端横臂 + 末端垂下的锥形罩 + 罩口金属圈。",
    size: [1.35, 1.8, 0.5],
    slots: [
      { role: "base", color: 0x2e2e30, roughness: 0.42, metalness: 0.25 }, // 0 配重底板
      { role: "metal", color: 0x9c6b3f, roughness: 0.34, metalness: 0.38 }, // 1 立柱 / 横臂 / 关节
      { role: "trim", color: 0x6b4a2e, roughness: 0.34, metalness: 0.4 }, // 2 罩口金属圈
      { role: "lit", color: 0xf6efe2, roughness: 0.88, metalness: 0 } // 3 灯罩
    ],
    parts: [
      // 占地靠两头撑满：底板在左（x -0.675…-0.325 正好压在左极值上）、灯罩挂在右
      // （x 0.275…0.675 压右极值），进深由底板（±0.25）定，立柱顶到 1.80 撑住整件高度。
      croundedBox(0, [0.35, 0.035, 0.5], [-0.5, 0, 0], { radius: 0.014 }),
      ccyl(1, 0.02, 1.765, 20, [-0.5, 0.035, 0]),
      cbox(1, [0.98, 0.032, 0.032], [-0.02, 1.74, 0]),
      ccyl(1, 0.032, 0.05, 20, [-0.5, 1.72, 0], { fullOnly: true }),
      ccyl(1, 0.012, 0.03, 12, [0.475, 1.715, 0], { fullOnly: true }),
      ctaper(3, 0.2, 0.13, 0.32, 24, [0.475, 1.4, 0]),
      ctorus(2, 0.132, 0.011, [0.475, 1.713, 0], { fullOnly: true })
    ]
  },
  walllamp: {
    note: "壁灯（洗墙款）：贴墙背板 + 顶部横托 + 朝上张开的锥形罩（罩径正好顶满进深）。",
    size: [0.3, 0.34, 0.22],
    slots: [
      { role: "base", color: 0xd4dbe2, roughness: 0.42, metalness: 0.22 }, // 0 背板
      { role: "metal", color: 0x9aa1a8, roughness: 0.32, metalness: 0.4 }, // 1 横托
      { role: "lit", color: 0xf6efe2, roughness: 0.88, metalness: 0 } // 2 灯罩
    ],
    parts: [
      // 底面 y=0 落在背板下沿（与其余流水线件同一套原点约定，抬高由物件的离地高度给）。
      // 罩体上宽下窄、朝上张开：罩底 0.24 接横托，罩顶 0.34 就是整件高度；横向由横托
      // （±0.15）压满 0.30 宽，进深由罩径（±0.11）压满 0.22。
      croundedBox(0, [0.13, 0.2, 0.026], [0, 0, -0.077], { radius: 0.01 }),
      cbox(1, [0.3, 0.04, 0.05], [0, 0.2, -0.055]),
      ctaper(2, 0.06, 0.11, 0.1, 24, [0, 0.24, 0])
    ]
  },

  // ── 软装四类（地毯 / 绿植 / 鱼缸 / 窗帘）─────────────────────────────────
  // 这六件原先全是桥接过来的既有资产，共同的问题是「一件东西一个色」：
  //   - rug 只有 302 个三角、两张材质名（ha-rug-furniture / ha-rug-soft），毯面与包边分不出来；
  //   - plant 的**进深只有 0.375m**，而声明占地是 0.75 —— 运行侧按 scaleBasis 分轴缩放，
  //     于是它被横向拉宽一倍（审计里 50% 偏差的最大一条）。旧资产是 4032 个三角却只是一团叶；
  //   - aquarium 只有 72 个三角（一个方箱），连缸壁厚度都没有；
  //   - curtain 三段的材质名是 curtain_left-material-0…5，取色靠**槽位号硬编码**
  //     （studio-external-models.js 的 curtain 分支写死「0/4 取深、1/5/2/3 取柔」）。
  // 重建后一律按实物分件，颜色由角色决定（见 studio-material-styles.js 的四组档位）。
  //
  // ── 地毯 ──
  // 一件平铺在地面的织物，能分出的只有三层：毯面（绒）、四周的包边（织带 / 锁边）、
  // 底下的防滑层。厚度只有 13mm，所以「包边比毯面高 1.5mm」就是它读起来像地毯而不是一块板
  // 的全部依据 —— 这一点差不能被四舍五入掉。
  // 两端各排一列**流苏**：它落在整宽 2.0m 之内（毯体 1.90 宽 + 两侧各 0.05 的流苏），
  // 不是伸出占地之外的装饰，所以不会把包围盒撑大。流苏打 fullOnly —— 它是这件上唯一
  // 纯装饰、丢了也不改轮廓的部分，正好给 lite 版一个能省的地方（56 个小方盒）。
  rug: {
    note: "地毯：绒面毯体 + 四周高出 1.5mm 的织带包边 + 内缩的防滑底 + 两端各 28 缕平铺流苏。",
    size: [2, 0.013, 1.4],
    slots: [
      { role: "fabric", color: 0xb9a894, roughness: 0.96, metalness: 0 }, // 0 绒面毯体
      { role: "trim", color: 0x8c7a66, roughness: 0.94, metalness: 0 }, // 1 包边 / 流苏
      { role: "base", color: 0x3f3a34, roughness: 0.98, metalness: 0 } // 2 防滑底
    ],
    parts: [
      // 防滑底：内缩 4cm，四面都藏在毯体之下，只在被掀起来时才看得到。
      cbox(2, [1.84, 0.005, 1.3], [0, 0, 0]),
      // 绒面毯体：底边压在防滑底上（2.5mm），顶面到 11.5mm —— 留下 1.5mm 给包边。
      cbox(0, [1.8, 0.009, 1.34], [0, 0.0025, 0]),
      // 包边：绕毯体一圈的四条织带，顶面 13mm 就是整件高度。左右两条沿 z、上下两条沿 x，
      // 相交处叠在一起（同槽位同材质，重叠看不出来）。
      //
      // 底面从 2mm 起（不是 0）：与防滑底的下表面齐平时，两块朝下的面落在同一平面上、
      // 平面内还叠了 0.38m² —— 地毯一被抬起或从低角度看，整圈包边就在闪。
      // 高度相应减 2mm，顶面仍是整件最高的 13mm。
      cbox(1, [1.9, 0.011, 0.06], [0, 0.002, 0.67]),
      cbox(1, [1.9, 0.011, 0.06], [0, 0.002, -0.67]),
      cbox(1, [0.06, 0.011, 1.28], [0.92, 0.002, 0]),
      cbox(1, [0.06, 0.011, 1.28], [-0.92, 0.002, 0]),
      // 流苏：两端各一排，平铺在地面上（高 4mm）向两侧伸到 ±1.00 —— 整宽 2.0m 由它收口。
      // span 取 1.4（整进深）而不是毯体的 1.34：流苏在实物上比毯体略宽，铺开才自然。
      ...rowAlongZ(1, { size: [0.05, 0.004, 0.032], count: 28, span: 1.4, x: 0.975, y: 0 }).map(
        part => ({ ...part, fullOnly: true })
      ),
      ...rowAlongZ(1, { size: [0.05, 0.004, 0.032], count: 28, span: 1.4, x: -0.975, y: 0 }).map(
        part => ({ ...part, fullOnly: true })
      )
    ]
  },

  // ── 绿植 ──
  // 一株室内高植（琴叶榕 / 散尾葵一类）：花盆、盆托、盆土、主干、冠叶。
  //
  // 旧资产的关键毛病不在样子而在**尺寸**：它实际只有 0.647 × 1.622 × 0.375，
  // 而声明占地 0.75 × 1.6 × 0.75 —— 运行侧按 scaleBasis 分轴缩放（x 乘 1.16、z 乘 2.0），
  // 于是那团叶子被**横向拉宽一倍**，瘦长的植株被抻成一张饼。重建后三轴都按 0.75 × 0.75 的
  // 真实冠幅落地，不再依赖运行侧去纠正。
  //
  // 冠幅收口的方式：叶片由 ringOf 排 12 份、每片沿自身长度伸到距中心 0.375 ——
  // 12 等分里必然有落在 ±x 与 ±z 上的四片，于是宽与深同时被顶到 0.75，一个数都不用凑。
  plant: {
    note: "室内高植：收分花盆 + 盆托 + 盆土面 + 直立主干 + 五层斜置叶片（每层 4~6 片、层间错开）+ 冠顶一撮嫩叶；冠幅正好 0.75 × 0.75。",
    size: [0.75, 1.6, 0.75],
    slots: [
      { role: "pot", color: 0xb9b2a6, roughness: 0.72, metalness: 0.02 }, // 0 花盆
      { role: "base", color: 0x8c8578, roughness: 0.8, metalness: 0 }, // 1 盆托
      { role: "frame", color: 0x6b5a42, roughness: 0.86, metalness: 0 }, // 2 主干
      { role: "foliage", color: 0x4e7a3a, roughness: 0.62, metalness: 0 }, // 3 冠叶
      { role: "interior", color: 0x3b2f22, roughness: 0.98, metalness: 0 } // 4 盆土面
    ],
    parts: [
      // 盆托：贴地一层薄盘，直径比盆口大 2cm —— 实物上盆托总是露在盆底一圈。
      ccyl(1, 0.19, 0.012, 28, [0, 0, 0]),
      // 花盆：下窄上宽（底 0.24 / 口 0.36），高 0.34。盆口离地 0.352（含盆托）。
      ctaper(0, 0.12, 0.18, 0.34, 28, [0, 0.012, 0]),
      // 盆土面：压在盆口下 2cm，只在盆沿内侧露一圈深色。
      ccyl(4, 0.165, 0.02, 28, [0, 0.322, 0]),
      // 主干：从土面一直升到 1.28（冠顶那撮嫩叶的叶基在 1.26 上下，主干刚好插进叶丛里）。
      // 分两段收分：下面粗（0.028）、上面细（0.014），真实的室内高植都是这么一根独干。
      ctaper(2, 0.028, 0.022, 0.44, 16, [0, 0.352, 0]),
      ctaper(2, 0.022, 0.012, 0.48, 12, [0, 0.792, 0]),
      // 冠叶五层 + 冠顶嫩叶，全部由 plantCrownParts 生成（叶长 / 叶基高度都按 reach 与 1.6 反解）。
      ...plantCrownParts()
    ]
  },

  // ── 鱼缸 ──
  // 旧资产只有 72 个三角：一个方箱子加三张色，没有底柜、没有缸壁厚度、没有缸盖 ——
  // 在画面里就是一个透明的方块，站在客厅里完全不像一件家具。
  // 重建后按实物分成两段：**底柜**（踢脚 + 柜体 + 双门 + 拉手 + 台面，与柜类同一套骨架）与
  // **缸体**（上下口框 + 四根角柱 + 四面玻璃 + 缸内背板），顶上再加一个带灯板的缸盖。
  //
  // 玻璃做成**四面独立的薄板**而不是一个实心方箱：实心方箱在透明材质下会退化成一块磨砂砖，
  // 而四面薄板才读得出「水在里面」—— 尤其背面还压了一块深色背板，前景的玻璃才有东西可透。
  // 进深 0.55 是这条产线上最紧的一处：柜门面 0.265、拉手最外沿 0.275，正好收到 0.55，
  // 因此拉手只凸出门面 1cm —— 再多就要改台面尺寸，四处一起改，不值得。
  aquarium: {
    note: "鱼缸：底柜（踢脚 + 柜体 + 双门 + 拉手 + 台面）+ 缸体（上下口框 + 角柱 + 四面玻璃 + 深色背板）+ 带灯板的缸盖。",
    size: [1.5, 1.4, 0.55],
    slots: [
      { role: "body", color: 0x2f3237, roughness: 0.5, metalness: 0.1 }, // 0 柜体 / 缸盖
      { role: "door", color: 0x383c42, roughness: 0.46, metalness: 0.1 }, // 1 柜门
      { role: "handle", color: 0xb4babf, roughness: 0.28, metalness: 0.45 }, // 2 拉手
      { role: "base", color: 0x22252a, roughness: 0.6, metalness: 0.06 }, // 3 踢脚
      { role: "top", color: 0x2a2d32, roughness: 0.42, metalness: 0.12 }, // 4 台面
      { role: "glass", color: 0xdfeaec, roughness: 0.12, metalness: 0.04 }, // 5 缸体玻璃
      { role: "frame", color: 0x1e2126, roughness: 0.44, metalness: 0.14 }, // 6 缸体口框 / 角柱
      { role: "interior", color: 0x1b3a40, roughness: 0.8, metalness: 0 }, // 7 缸内背板
      { role: "lit", color: 0xcfe8f2, roughness: 0.3, metalness: 0 } // 8 缸盖灯板
    ],
    parts: [
      // ── 底柜 ──
      cbox(3, [1.42, 0.06, 0.47], [0, 0, -0.015]),
      cbox(0, [1.5, 0.74, 0.52], [0, 0.06, -0.015]),
      cbox(1, [0.7, 0.62, 0.02], [-0.375, 0.14, 0.255]),
      cbox(1, [0.7, 0.62, 0.02], [0.375, 0.14, 0.255]),
      cbox(2, [0.025, 0.3, 0.01], [-0.055, 0.3, 0.27]),
      cbox(2, [0.025, 0.3, 0.01], [0.055, 0.3, 0.27]),
      cbox(4, [1.5, 0.03, 0.55], [0, 0.8, 0]),
      // ── 缸体 ──
      // 下口框：压在台面上，四条。lite 版丢它 —— 它被玻璃与台面夹住，远看几乎不可见，
      // 是这件上唯一「丢了不改轮廓」的四块，正好让首屏那份省下该省的量。
      cbox(6, [1.46, 0.03, 0.03], [0, 0.83, 0.24], { fullOnly: true }),
      cbox(6, [1.46, 0.03, 0.03], [0, 0.83, -0.24], { fullOnly: true }),
      cbox(6, [0.03, 0.03, 0.45], [-0.715, 0.83, 0], { fullOnly: true }),
      cbox(6, [0.03, 0.03, 0.45], [0.715, 0.83, 0], { fullOnly: true }),
      // 四根角柱：把玻璃的四条竖边包住，缸口因此有一圈黑框（实物上就是这圈框最显眼）。
      cbox(6, [0.03, 0.44, 0.03], [-0.715, 0.86, 0.24]),
      cbox(6, [0.03, 0.44, 0.03], [0.715, 0.86, 0.24]),
      cbox(6, [0.03, 0.44, 0.03], [-0.715, 0.86, -0.24]),
      cbox(6, [0.03, 0.44, 0.03], [0.715, 0.86, -0.24]),
      // 上口框：角柱顶端收口，也就是缸口那一圈。
      cbox(6, [1.46, 0.03, 0.03], [0, 1.27, 0.24]),
      cbox(6, [1.46, 0.03, 0.03], [0, 1.27, -0.24]),
      cbox(6, [0.03, 0.03, 0.45], [-0.715, 1.27, 0]),
      cbox(6, [0.03, 0.03, 0.45], [0.715, 1.27, 0]),
      // 四面玻璃：前后两片通长、左右两片夹在它们之间（端头埋进角柱里，不露切口）。
      // 四面玻璃各自收 2~4mm（尺寸 1.46 → 1.452 宽、0.41 → 0.406 高、z 中心 0.249 → 0.2465）：
      // 原来玻璃与骨架立柱 / 上下横挡的外表面逐面齐平，玻璃又是 DoubleSide（背面剔不掉），
      // 六处同向 / 背靠背共面全都在闪。玻璃内缩之后仍然被骨架框住，外观不变。
      cbox(5, [1.452, 0.406, 0.012], [0, 0.862, 0.2465]),
      cbox(5, [1.452, 0.406, 0.012], [0, 0.862, -0.2465]),
      cbox(5, [0.012, 0.406, 0.486], [-0.718, 0.862, 0]),
      cbox(5, [0.012, 0.406, 0.486], [0.718, 0.862, 0]),
      // 缸内背板：紧贴后玻璃内侧。没有它，四面通透的缸子看过去就是空的。
      cbox(7, [1.42, 0.406, 0.008], [0, 0.862, -0.23]),
      // ── 缸盖：顶板 + 四面裙板，底下留一条缝让灯光漏出来 ──
      cbox(0, [1.5, 0.02, 0.55], [0, 1.38, 0]),
      cbox(0, [1.5, 0.06, 0.02], [0, 1.32, 0.265]),
      cbox(0, [1.5, 0.06, 0.02], [0, 1.32, -0.265]),
      cbox(0, [0.02, 0.06, 0.51], [-0.74, 1.32, 0]),
      cbox(0, [0.02, 0.06, 0.51], [0.74, 1.32, 0]),
      // 灯板：缸盖的「天花板」，从下面才看得见，所以也是 fullOnly。
      cbox(8, [1.34, 0.014, 0.42], [0, 1.324, 0], { fullOnly: true })
    ]
  },

  // ── 窗帘三段 ──
  // 三份模型共用同一套骨架（一段波浪帘布 + 一根顶轨 + 两个墙面支架），差别只在「帘布怎么分」：
  //   - left / right 是**单幅**帘布，靠一侧留一条不褶的**前缘**（抓帘那一条，实物上就是平的）；
  //   - split 是**两幅**对开，中间留 9cm 的缝 —— 这条缝就是平面图上「两片帘布」的对应物。
  //
  // 为什么帘布要做成一排**竖圆柱**而不是一块平板：褶皱是窗帘唯一的辨识特征。竖圆柱沿 x 以
  // 0.135~0.15 的间距排开（直径 0.18），相邻两根重叠 3~4.5cm，并起来正好是一张连绵的波浪面 ——
  // 前排是波峰、两根之间是波谷。进深 0.18 就是这根圆柱的直径，**由帘布自己定死**，
  // 所以顶轨（半径 12mm）在它里面毫不起眼，不会把包围盒撑大。
  //
  // 帘布下摆直接落到 y=0（落地帘）：生成器要求「原点在占地底面」，而窗帘是唯一一类
  // **悬空**的物件 —— 旧资产把下摆抬到 6cm、原点留在半空，于是它的 scaleBasis 与实体对不上。
  // 落到底之后三轴都能被生成器验住，代价只是下摆比实物矮 6cm。
  curtain_left: curtainSpec("left"),
  curtain_right: curtainSpec("right"),
  curtain_split: curtainSpec("split"),

  // ── 空气净化与风口 ───────────────────────────────────────────────────────
  airpurifier: {
    note: "立式空气净化器：圆柱塔身 + 前下方进风格栅 + 顶盖（出风格栅与顶珠）+ 前上显示区 + 空气质量灯带 + 底座。",
    size: [0.34, 0.7, 0.34],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 }, // 0 塔身
      { role: "base", color: 0x3c3f44, roughness: 0.5, metalness: 0.14 }, // 1 底座
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }, // 2 进风 / 出风格栅
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }, // 3 顶盖 / 顶珠
      { role: "screen", color: 0x15171a, roughness: 0.2, metalness: 0.1 }, // 4 显示区
      { role: "lit", color: 0x5fd08a, roughness: 0.3, metalness: 0 } // 5 空气质量灯带
    ],
    parts: [
      // 塔身径 0.34 定下宽与深。进风格栅与灯带是贴在圆柱面上的平板 —— 板的两侧会自然越出
      // 圆面，读作「凸起的一块」，而不是与筒壁共面闪烁（板的中间仍埋在筒里）。
      ccyl(1, 0.16, 0.03, 28, [0, 0, 0]),
      ccyl(0, 0.17, 0.6, 28, [0, 0.03, 0]),
      croundedBox(2, [0.14, 0.24, 0.02], [0, 0.1, 0.16], { radius: 0.01 }),
      ccyl(3, 0.165, 0.04, 28, [0, 0.63, 0]),
      ccyl(2, 0.12, 0.02, 24, [0, 0.67, 0]),
      ccyl(3, 0.06, 0.01, 16, [0, 0.69, 0]),
      cbox(4, [0.1, 0.04, 0.012], [0, 0.645, 0.164]),
      cbox(5, [0.02, 0.22, 0.012], [0.085, 0.12, 0.155], { fullOnly: true })
    ]
  },
  airoutlet: {
    note: "线性出风口：壳体 + 上下边框与两端盖 + 中间三道百叶 + 背面静压箱接管（口长沿 Z、出风朝 +X）。",
    size: [0.188, 0.3, 2],
    slots: [
      { role: "body", color: 0xf2f1ed, roughness: 0.48, metalness: 0.08 }, // 0 壳体
      { role: "grating", color: 0x9aa1a8, roughness: 0.32, metalness: 0.3 }, // 1 百叶
      { role: "trim", color: 0xfafaf8, roughness: 0.44, metalness: 0.1 }, // 2 边框 / 端盖
      { role: "metal", color: 0xb4babf, roughness: 0.3, metalness: 0.4 } // 3 静压箱接管
    ],
    parts: [
      // 这是一件「贴着墙/顶的长条风口」：宽 0.188 是进深、高 0.3 是面高、深 2.0 才是口长。
      // 出风面在 +X（environment-airflow.js 按 modelBox.max.x 发出风），所以百叶与边框全排在 +x 侧。
      croundedBox(0, [0.15, 0.26, 1.94], [-0.019, 0.02, 0], { radius: 0.012 }),
      // 接管原与壳体同背（都在 −0.094）：整件的 −x 极值由壳体撑住，接管是埋在壳体里的静压箱，
      // 把它的背再收 1.5mm 即可让两个下表面不再同向共面（99.9cm²），外观零变化。
      cbox(3, [0.034, 0.16, 0.16], [-0.0755, 0.07, 0], { fullOnly: true }),
      cbox(2, [0.02, 0.03, 2], [0.084, 0.27, 0]),
      cbox(2, [0.02, 0.03, 2], [0.084, 0, 0]),
      cbox(2, [0.02, 0.24, 0.06], [0.084, 0.03, 0.97]),
      cbox(2, [0.02, 0.24, 0.06], [0.084, 0.03, -0.97]),
      cbox(1, [0.02, 0.028, 1.88], [0.078, 0.06, 0]),
      cbox(1, [0.02, 0.028, 1.88], [0.078, 0.13, 0]),
      cbox(1, [0.02, 0.028, 1.88], [0.078, 0.2, 0])
    ]
  },
  trashbin: {
    note: "智能垃圾桶：圆桶身 + 感应翻盖（盖顶与盖沿缝）+ 前感应窗 + 底圈。",
    size: [0.28, 0.45, 0.28],
    slots: [
      { role: "body", color: 0xfafaf8, roughness: 0.48, metalness: 0.06 }, // 0 桶身
      { role: "base", color: 0x9aa1a8, roughness: 0.44, metalness: 0.2 }, // 1 底圈
      { role: "trim", color: 0xb4babf, roughness: 0.3, metalness: 0.4 }, // 2 盖沿缝
      { role: "door", color: 0x9aa1a8, roughness: 0.3, metalness: 0.32 }, // 3 翻盖
      { role: "screen", color: 0x5fd08a, roughness: 0.2, metalness: 0 } // 4 感应窗
    ],
    parts: [
      // 桶身径 0.28 同时定下宽与深；翻盖比桶身小一圈，「盖沿缝」那圈金属正好夹在两者之间。
      ccyl(1, 0.13, 0.015, 24, [0, 0, 0]),
      ccyl(0, 0.14, 0.369, 28, [0, 0.015, 0]),
      ccyl(2, 0.138, 0.008, 28, [0, 0.384, 0]),
      ccyl(3, 0.135, 0.038, 28, [0, 0.392, 0]),
      ccyl(3, 0.12, 0.02, 28, [0, 0.43, 0]),
      cbox(4, [0.1, 0.014, 0.012], [0, 0.405, 0.133], { fullOnly: true })
    ]
  },

  // ── 结构构件：柱族五件 + 楼梯三件 + 电梯 + 小车 ───────────────────────────  // 这一族原先全是**既有二进制资产**，而且各有各的毛病：柱子是 24 个顶点的纯方盒
  // （`pillar-material-0` 这种自己起的名字，没有角色），钢 / 玻璃楼梯是毫米单位、原点
  // 在角落、材质名是「004 / sacfdsa010」这种来路不明的编号，电梯是厘米单位加一堆
  // `[Color_003]`，小车是 Z 朝上、车漆效果整段挂在贴图集上。运行侧只能靠硬编码材质名
  // 认件（见 studio-external-models.js 里那几支判 `004` / `sacfdsa010` / `Color_00[34]` /
  // 车贴图的分支 —— 换一份资产就全部失配）。
  //
  // 迁进流水线的目的就是把「认件」从材质名换成**角色**，顺便把单位 / 原点 / 顶点数收敛掉。
  pillar: pillarSpec("square"),
  pillar_round: pillarSpec("round"),
  pillar_semicircle: pillarSpec("semicircle"),
  pillar_quarter: pillarSpec("quarter"),
  pillar_quarterinner: pillarSpec("quarterinner"),
  stairs: {
    note: "直行楼梯：10 级实心踏步（混凝土 / 木作包板）+ 踏面板 + 防滑条 + 两侧斜裙板。",
    size: [1, 1.65, 2.8],
    slots: [
      { role: "body", color: 0xd9d4cb, roughness: 0.86, metalness: 0 }, // 0 踏步实体
      { role: "top", color: 0xb08a5e, roughness: 0.62, metalness: 0.02 }, // 1 踏面板（木）
      { role: "trim", color: 0x8a6a45, roughness: 0.7, metalness: 0.04 }, // 2 防滑条
      { role: "panel", color: 0xc7c1b7, roughness: 0.78, metalness: 0 } // 3 侧裙板
    ],
    parts: (() => {
      // 直行楼梯的参数化：10 级、踏面进深 0.28、踢面 0.165，**从 +z 端往 -z 端升**
      // —— 与平面符号那支上箭头同向（箭头指向 -y，见 drawPlanItem 的楼梯分支）。
      const stairRiserCount = 10;
      const stairTreadDepth = 2.8 / stairRiserCount;
      const stairRise = 1.65 / stairRiserCount;
      const stairTreadThickness = 0.03;
      const stairBodyWidth = 0.976;
      const stairParts = [];
      for (let stairStep = 0; stairStep < stairRiserCount; stairStep += 1) {
        const stairStepFrontZ = 1.4 - stairStep * stairTreadDepth;
        const stairStepCenterZ = stairStepFrontZ - stairTreadDepth / 2;
        const stairStepTopY = stairRise * (stairStep + 1);
        const stairBodyHeight = stairStepTopY - stairTreadThickness;
        // 踏步实体：从地面砌到踏面板下沿，逐级升高。这层是「实心楼梯」，能把踏步下面的
        // 空腔填掉 —— 木作包板的楼梯拆掉包板之后就是这个样子。
        stairParts.push(
          cbox(0, [stairBodyWidth, stairBodyHeight, stairTreadDepth], [
            0,
            0,
            stairStepCenterZ
          ])
        );
        // 踏面板：比实体略宽出 5mm 的**前缘挑出**（第一级不挑，否则会顶出占地）。
        const stairIsBottomStep = stairStep === 0;
        const stairNosingOverhang = stairIsBottomStep ? 0 : 0.005;
        stairParts.push(
          cbox(
            1,
            [stairBodyWidth, stairTreadThickness, stairTreadDepth + stairNosingOverhang],
            [0, stairBodyHeight, stairStepCenterZ + stairNosingOverhang / 2]
          )
        );
        // 防滑条：压在踏面前缘往里 3cm 处的一条窄带，顶面比踏面低 1mm（做成一道凹槽而不是
        // 高出来的棱）—— 平齐会与踏面板共面闪烁，抬高又会把整件拔高。
        stairParts.push(
          cbox(
            2,
            [0.96, 0.008, 0.02],
            [0, stairStepTopY - 0.009, stairStepFrontZ - 0.03],
            { fullOnly: true }
          )
        );
      }
      // 两侧斜裙板：贴着踏步两侧的一道斜板（实物就是封闭式楼梯那把「斜梁」）。
      // 角度就是楼梯的坡度，长度略短于对角线 —— 斜梁的两端本来也不会伸到最角上，
      // 而多出来的那点斜角会把包围盒顶出 size。裙板压在踏步实体**里面** 1cm，
      // 不共面（共面会闪烁），外侧正好落在 ±0.5，整件 1m 的宽度由它定。
      const stairSlopeDegrees = (Math.atan2(1.65, 2.8) * 180) / Math.PI;
      // 裙板的竖直范围：包住 0.028 → 1.621（斜板长 2.9、截面高 0.14 时的实测外框）。
      // `at[1]` 是**底面对齐**（不是中心），写错会让整件高出 0.77m —— 规格校验会当场拦下。
      stairParts.push(
        ...mirrorPair(
          cbox(3, [0.022, 0.14, 2.9], [0.489, 0.028, 0], {
            centered: true,
            rot: [stairSlopeDegrees, 0, 0],
            fullOnly: true
          })
        )
      );
      return stairParts;
    })()
  },
  // 钢楼梯 / 玻璃楼梯：U 形双跑 + 中间平台。两件共用同一套跑位计算（见 uStairLayout），
  // 差别只在用料 —— 钢楼梯是钢斜梁 + 木踏板，玻璃楼梯是钢斜梁 + 玻璃踏板与玻璃平台。
  steelstairs: {
    note: "钢楼梯（U 形双跑）：钢斜梁 + 20 级木踏板 + 中间钢平台。",
    size: [1.86, 3.45, 2.93],
    slots: [
      { role: "metal", color: 0x6a737d, roughness: 0.42, metalness: 0.45 }, // 0 斜梁 / 平台梁
      { role: "top", color: 0xb08a5e, roughness: 0.62, metalness: 0.03 }, // 1 木踏板 / 平台板
      { role: "trim", color: 0x3a4046, roughness: 0.5, metalness: 0.32 } // 2 防滑条
    ],
    parts: uStairParts({
      layout: uStairLayout({ size: [1.86, 3.45, 2.93], flightWidth: 0.9, stringerHeight: 0.2 }),
      treadSlot: 1,
      treadThickness: 0.03,
      structureSlot: 0,
      nosingSlot: 2,
      treadInset: 0,
      landingPlateThickness: 0.05
    })
  },
  glassstairs: {
    note: "玻璃楼梯（U 形双跑）：钢斜梁 + 20 级玻璃踏板 + 玻璃平台板。",
    size: [2.51, 3.41, 2.84],
    slots: [
      { role: "metal", color: 0x8b939c, roughness: 0.38, metalness: 0.5 }, // 0 斜梁 / 平台梁
      { role: "glass", color: 0x9fc4d2, roughness: 0.12, metalness: 0.04 }, // 1 玻璃踏板 / 平台
      { role: "trim", color: 0x6a737d, roughness: 0.44, metalness: 0.42 } // 2 玻璃踏板的钢包边
    ],
    parts: uStairParts({
      layout: uStairLayout({ size: [2.51, 3.41, 2.84], flightWidth: 1.225, stringerHeight: 0.18 }),
      treadSlot: 1,
      treadThickness: 0.024,
      structureSlot: 0,
      nosingSlot: 2,
      // 玻璃踏板比梯段窄 10cm，两侧各留 5cm 让钢包边夹住玻璃的边角（裸边是玻璃最脆的地方）。
      treadInset: 0.1,
      landingPlateThickness: 0.024,
      landingInset: 0.06
    })
  },
  // 家用电梯的轿厢。旧资产是厘米单位、原点漂着、材质名是一串 `[Color_003]`，运行侧只能靠
  // 「名字里有没有 Color_003 / Color_004」认件（见 studio-external-models.js 的电梯分支）——
  // 换成任何一份新资产都会静默失配（整件同色）。这里按角色分件，认件从此看语义。
  //
  // 六块料各自对应实物上的一种料，而不是「一块板切六段」：壁板与顶板是同一套涂装 / 木饰面
  // （取墙色族的浅色）、轿门是发丝不锈钢、门槛与扶手是深一档的五金、地板是深色石面、
  // 操作面板是深色玻璃、顶灯是暖白灯板。占地尺寸 1.40 × 1.52 与物件默认值逐值相等。
  elevator: {
    note: "家用电梯轿厢：地板 + 三面壁板 + 顶板顶灯 + 双开轿门与门楣 + 门槛扶手 + 操作面板。",
    size: [1.4, 2.2, 1.52],
    slots: [
      { role: "panel", color: 0xd6d9dd, roughness: 0.62, metalness: 0.06 }, // 0 壁板 / 顶板 / 门楣
      { role: "door", color: 0xb4bcc4, roughness: 0.28, metalness: 0.44 }, // 1 双开轿门
      { role: "metal", color: 0x8b939b, roughness: 0.34, metalness: 0.5 }, // 2 门槛 / 扶手 / 按钮
      { role: "base", color: 0x4a4e54, roughness: 0.5, metalness: 0.06 }, // 3 轿厢地板（石面）
      { role: "screen", color: 0x2c3136, roughness: 0.22, metalness: 0.12 }, // 4 操作面板
      { role: "lit", color: 0xfff4e2, roughness: 0.34, metalness: 0 } // 5 顶灯
    ],
    parts: [
      // 地板：占一整块，同时定下整件的宽（±0.70）与深（±0.76）。
      cbox(3, [1.4, 0.06, 1.52], [0, 0, 0]),
      // 两侧壁板：压在占地左右两条边上（x 0.65 ~ 0.70），顶面 2.20 就是整件高度。
      ...mirrorPair(cbox(0, [0.05, 2.14, 1.52], [0.675, 0.06, 0])),
      // 后壁板：贴 -z 边，宽度只在两侧壁板之间（±0.65）。
      cbox(0, [1.3, 2.14, 0.05], [0, 0.06, -0.735]),
      // 门楣：门洞上沿 2.10 到顶板下沿 2.16 之间的那条横板。
      cbox(0, [1.3, 0.06, 0.05], [0, 2.1, 0.735]),
      // 顶板：夹在两侧壁板之间，压到 2.20。
      cbox(0, [1.3, 0.04, 1.52], [0, 2.16, 0]),
      // 顶灯：从顶板底面凸出 1.5cm 的一块灯板 —— 凹进顶板里就看不见了（顶板没有开孔）。
      cbox(5, [0.92, 0.02, 1.0], [0, 2.145, 0]),
      // 双开轿门：门洞 ±0.65 里两扇各 0.645 宽，中间留 1cm 的缝（缝里透出的是轿内，
      // 与实物上的门缝一样）。门的底边抬到 0.08 是给门槛让位：压在门槛上会与门槛顶面共面闪烁。
      ...mirrorPair(cbox(1, [0.645, 2.02, 0.05], [0.3275, 0.08, 0.735])),
      // 门槛：门下那条金属条。
      cbox(2, [1.3, 0.02, 0.08], [0, 0.06, 0.72]),
      // 轿内扶手：贴后壁的一条横杆 + 两个托座（近看才成立，lite 版丢掉）。
      cbox(2, [1.2, 0.04, 0.04], [0, 0.95, -0.69], { fullOnly: true }),
      ...mirrorPair(cbox(2, [0.05, 0.05, 0.08], [0.45, 0.9, -0.68], { fullOnly: true })),
      // 操作面板：装在右侧壁板内面（向轿内凸 1.5cm），三个楼层按钮再凸出一点。
      cbox(4, [0.02, 0.34, 0.12], [0.645, 0.95, 0.6]),
      ...[1.05, 1.12, 1.19].map(elevatorButtonY =>
        cbox(2, [0.024, 0.024, 0.024], [0.632, elevatorButtonY, 0.6], { fullOnly: true })
      )
    ]
  },
  // 小汽车。旧资产是第三方车模：Z 朝上、车漆效果整段挂在**贴图集**上（着色器拿贴图里的
  // 玻璃岛与灯位分区，见 materials/studio-car-finish.js），正常化的法线还要靠
  // smoothCarSurfaceNormals 现算一遍。这里按角色分件之后，车漆 / 玻璃 / 轮毂 / 轮胎 /
  // 灯 / 格栅各是一块网格，运行侧不必再猜「这一块是不是玻璃」。
  //
  // 六个极值全部由轴对齐的零件定下（宽 ← 车身、高 ← 座舱、深 ← 前后保险杠、底面 ← 轮胎），
  // 斜置的风挡与旋转的轮胎都留在内部 —— 旋转件的包围盒会随角度膨胀，让它去顶极值是自找麻烦。
  smallcar: {
    note: "小汽车：下车身 + 座舱 + 前后风挡与侧窗 + 保险杠 + 灯组 + 格栅 + 轮胎轮毂 + 后视镜。",
    size: [2.19, 1.43, 5.01],
    slots: [
      { role: "body", color: 0xd8dade, roughness: 0.3, metalness: 0.32 }, // 0 车身 / 保险杠 / 后视镜
      { role: "glass", color: 0x9fc4d2, roughness: 0.12, metalness: 0.04 }, // 1 风挡 / 侧窗
      { role: "metal", color: 0xb7bdc3, roughness: 0.26, metalness: 0.6 }, // 2 轮毂 / 格栅饰条
      { role: "trim", color: 0x22262b, roughness: 0.86, metalness: 0.02 }, // 3 轮胎（橡胶）
      { role: "lit", color: 0xfff0d0, roughness: 0.2, metalness: 0 }, // 4 前大灯 / 尾灯
      { role: "grating", color: 0x363b40, roughness: 0.5, metalness: 0.3 } // 5 前格栅
    ],
    parts: [
      // 车身主体：整件的宽度由它定（±1.095 = 2.19）。底边抬到 0.50 正好压在轮胎上半部，
      // 「轮胎从翼子板下面露出来」这条读法就成立了 —— 车身不抬高的话，轮子会整只埋在箱体里。
      croundedBox(0, [2.19, 0.42, 4.86], [0, 0.5, 0]),
      // 座舱：整件的高度由它定（顶面 1.43），前后位置略偏后。
      croundedBox(0, [1.86, 0.51, 2.3], [0, 0.92, -0.35]),
      // 前后保险杠：整件的长度由它们定（±2.505）。
      cbox(0, [2.1, 0.36, 0.15], [0, 0.22, 2.43]),
      cbox(0, [2.1, 0.36, 0.15], [0, 0.22, -2.43]),
      // 底盘裙边：两轴之间那段（x 只到 ±0.87，正好接上轮胎内壁），再往外就是轮子 ——
      // 这一块同时把「前后轴之间是空的」这条读法补上，车身不会看着像浮在半空的一整块。
      cbox(0, [1.74, 0.3, 2.42], [0, 0.2, 0]),
      // 后视镜（支杆 + 镜壳）：贴在座舱前角两侧，凸出但不越出 2.19 的宽度。
      ...mirrorPair(cbox(2, [0.07, 0.03, 0.03], [0.9, 1.005, 0.9])),
      ...mirrorPair(cbox(0, [0.15, 0.075, 0.1], [1.01, 1.0, 0.9])),
      // 前风挡：从机盖（z≈1.31 / y≈0.93）斜到车顶前缘（z≈0.79 / y≈1.39），绕 X 转 -48°；
      // 后风挡同法反向（+50°）。两块都是斜置件，包围盒都留在 1.43 / ±2.505 之内。
      //
      // `align: "center"` 不能省：cbox 的 centered 只管 x / z，y 默认是**底面对齐** ——
      // 斜置件的「底面」是旋转后包围盒的最低点，按中心理解会让整块往上飘半个高度（实测高 1.641）。
      cbox(1, [1.72, 0.68, 0.035], [0, 1.16, 1.05], { rot: [-48, 0, 0], align: "center" }),
      cbox(1, [1.72, 0.7, 0.035], [0, 1.16, -1.76], { rot: [50, 0, 0], align: "center" }),
      // 侧窗：贴在座舱两侧，各凸出 1.75cm（凸出才看得见 —— 平齐会被座舱的圆角吞掉）。
      ...mirrorPair(cbox(1, [0.045, 0.32, 1.66], [0.925, 1.03, -0.38])),
      // 轮胎：底面落在 y=0（整件的底面由它定），轴距 ±1.55。
      ...[1.55, -1.55].flatMap(carAxleZ =>
        mirrorPair(ccyl(3, 0.34, 0.16, 26, [0.95, 0, carAxleZ], { rot: [0, 0, 90] }))
      ),
      // 轮毂：比轮胎外沿再凸 5cm 才看得见（轮胎是实心圆柱，轮毂缩在里面就整只被挡住），
      // 但仍留在 ±1.095 之内，不参与定宽。
      ...[1.55, -1.55].flatMap(carAxleZ =>
        mirrorPair(ccyl(2, 0.23, 0.24, 22, [0.965, 0.11, carAxleZ], { rot: [0, 0, 90] }))
      ),
      // 前大灯 / 尾灯：从车头、车尾的立面各凸出 5cm，不碰前后保险杠（灯在杠上沿之上）。
      ...mirrorPair(cbox(4, [0.44, 0.13, 0.08], [0.64, 0.62, 2.44])),
      ...mirrorPair(cbox(4, [0.4, 0.11, 0.07], [0.64, 0.64, -2.46])),
      // 前格栅：占车头正中央（x ±0.36），两侧正好让给大灯；三道横向饰条只在完整版保留。
      cbox(5, [0.72, 0.2, 0.05], [0, 0.62, 2.44]),
      ...[0.66, 0.72, 0.78].map(carGrilleSlatY =>
        cbox(2, [0.7, 0.02, 0.04], [0, carGrilleSlatY, 2.46], { fullOnly: true })
      )
    ]
  }
});

/** 规格键 → 文件基名。多数同名，留这张表是为了将来出现「类型名 ≠ 文件基名」时有地方写。 */
export const MODEL_FILE_KEY_BY_SPEC = Object.freeze({
  ...Object.fromEntries(Object.keys(MODEL_SPECS).map(specKey => [specKey, specKey])),
  // 异形柱与楼梯的**类型名 ≠ 文件基名**：类型名（物件类型）用下划线，磁盘上的文件是短横线
  // （与既有资产同名，这样注册表里的 fileKey 不用改，换的只是文件里的内容）。
  pillar_round: "pillar-round",
  pillar_semicircle: "pillar-semicircle",
  pillar_quarter: "pillar-quarter",
  pillar_quarterinner: "pillar-quarterinner",
  smallcar: "car",
  steelstairs: "steel-stairs",
  glassstairs: "glass-stairs"
});

/** 规格键 → 分类子目录。与 studio-external-models.js 的 modelAssetUrl 第一参保持一致。 */
export const MODEL_DIR_BY_SPEC = Object.freeze({
  sofa: "furniture",
  bed: "furniture",
  chair: "furniture",
  cabinet: "furniture",
  coffeetable: "furniture",
  armchair: "furniture",
  loungechair: "furniture",
  ottoman: "furniture",
  bench: "furniture",
  barstool: "furniture",
  sidetable: "furniture",
  console: "furniture",
  chestdrawer: "furniture",
  entrycabinet: "furniture",
  displaycabinet: "furniture",
  bunkbed: "furniture",
  kidsbed: "furniture",
  // 柜类第二批：既有二进制资产迁进流水线（8 件，见 MODEL_SPECS 里那一段说明）。
  nightstand: "furniture",
  tvstand: "furniture",
  bookcase: "furniture",
  glasscabinet: "furniture",
  shelf: "furniture",
  wallcabinet: "furniture",
  shoecabinet: "furniture",
  vanity: "furniture",
  // 桌案第三批：餐桌组合 / 圆餐桌 / 圆餐桌带转盘 / 书桌 / 吧台 / 方茶几（6 件）。
  table: "furniture",
  rounddiningtable: "furniture",
  rounddiningtable_turntable: "furniture",
  desk: "furniture",
  bar: "furniture",
  squarecoffeetable: "furniture",
  soundbar: "electronics",
  speaker: "electronics",
  projector: "electronics",
  tv_standard: "electronics",
  tv_tabletop: "electronics",
  tv_mobile: "electronics",
  fan: "appliance",
  humidifier: "appliance",
  dehumidifier: "appliance",
  freshair: "appliance",
  thermostat: "electronics",
  smartpanel: "electronics",
  smartlock: "electronics",
  doorbell: "electronics",
  gateway: "electronics",
  chaise: "furniture",
  nestingtable: "furniture",
  roundcoffeetable: "furniture",
  screenspan: "furniture",
  coatrail: "furniture",
  stool: "furniture",
  locker: "furniture",
  laundrycabinet: "furniture",
  balconycabinet: "furniture",
  winecabinet: "furniture",
  kitchenisland: "furniture",
  pantry: "furniture",
  // 厨房地柜三件（第四批）：既有二进制资产迁进流水线。
  kitchenbase: "furniture",
  kitchensink: "furniture",
  kitchencooktop: "furniture",
  // 钢琴（第五批）：第三方素材迁进流水线。
  piano: "furniture",
  sideboard: "furniture",
  daybed: "furniture",
  cot: "furniture",
  computertable: "furniture",
  officestool: "furniture",
  filecabinet: "furniture",
  booktower: "furniture",
  gameconsole: "electronics",
  avreceiver: "electronics",
  screenpanel: "electronics",
  smartspeaker: "electronics",
  router: "electronics",
  printer: "electronics",
  desktop: "electronics",
  laptop: "electronics",
  nas: "electronics",
  floorlamp: "decor",
  walllamp: "decor",
  rug: "decor",
  plant: "decor",
  aquarium: "decor",
  curtain_left: "decor",
  curtain_right: "decor",
  curtain_split: "decor",
  basin: "bath",
  toilet: "bath",
  squattoilet: "bath",
  urinal: "bath",
  bathtub: "bath",
  shower: "bath",
  glasspartition: "bath",
  pipelinewaterpurifier: "appliance",
  tea_bar_machine: "appliance",
  ceilingfan: "appliance",
  heater: "appliance",
  ceilingac: "appliance",
  wallac: "appliance",
  floorac: "appliance",
  fan: "appliance",
  humidifier: "appliance",
  dehumidifier: "appliance",
  vacuumcleaner: "appliance",
  floorwasher: "appliance",
  dryingrack: "appliance",
  robotvacuum: "appliance",
  garmentcare: "appliance",
  storagewaterheater: "appliance",
  gaswaterheater: "appliance",
  airer: "appliance",
  integratedstove: "appliance",
  sterilizer: "appliance",
  oven: "appliance",
  steamoven: "appliance",
  microwave: "appliance",
  rangehood: "appliance",
  fridge: "appliance",
  washer: "appliance",
  dryer: "appliance",
  dishwasher: "appliance",
  coffeemaker: "appliance",
  kettle: "appliance",
  airfryer: "appliance",
  blender: "appliance",
  waterpurifier: "appliance",
  trashbin: "appliance",
  ricecooker: "appliance",
  airpurifier: "appliance",
  airoutlet: "appliance",
  // 结构构件（第六批）：既有二进制资产迁进流水线 —— 柱族五件 + 楼梯三件 + 电梯。
  // 小车（vehicle）属于运输件，与建筑构件分开归档。
  pillar: "structure",
  pillar_round: "structure",
  pillar_semicircle: "structure",
  pillar_quarter: "structure",
  pillar_quarterinner: "structure",
  stairs: "structure",
  steelstairs: "structure",
  glassstairs: "structure",
  elevator: "structure",
  // 车辆（第七批）：最后一件既有二进制资产。
  smallcar: "vehicle"
});
